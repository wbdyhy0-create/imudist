import { descendantsOf, resolveCharacterPatch, resolvedRecords } from './characterStyleTree'
import { tintHex } from './colorModels'
import type { CharacterStyleRecord, CharacterStyleSettings, CharStyle, FootnoteLayoutConfig, ParagraphBox, ParagraphStyleRecord, Run, TextFrame } from './document'
import { footnoteTextStyle, updateFootnoteParagraphStyle } from './footnoteLayout'
import { applyNestedStyles } from './nestedStyles'
import { applyParagraphLook, charStyleOf, normalizeRuns, paraIndexAt, restyleRange, setParaOverride, styleKeepOverride, updateCharacterStyleRuns, withParaOverride } from './story'

/**
 * What it takes to change the definition of a paragraph or character style and bring the text that is in it along, with no
 * document open: the text carries the style's look in its own runs and patches, so a changed definition has to be written
 * into every paragraph that uses it (a character style on the text keeping its own look). The same steps the style panels take.
 */

/** the character-level settings of a paragraph style that its paragraphs show (kept in step with the editor's list) */
const CHAR_LOOK_KEYS = ['fontFamily', 'fontSize', 'weight', 'italic', 'tracking', 'baselineShift', 'color', 'outlineColor', 'outlineWidth'] as const
const PARAGRAPH_LOOK_KEYS = ['leading', 'wordSpacingMin', 'wordSpacingMax', 'wordSpacing', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align', 'direction'] as const
const RUN_KEYS = ['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'] as const

export interface StyleEnv {
  footnoteConfig: FootnoteLayoutConfig
}

/** a style with what it is based on folded in */
function mergedParagraphStyle(id: string, source: ParagraphStyleRecord[], seen: Set<string>): ParagraphStyleRecord['patch'] {
  if (seen.has(id)) return {}
  const style = source.find((candidate) => candidate.id === id)
  if (!style) return {}
  const nextSeen = new Set(seen).add(id)
  return { ...(style.basedOnId ? mergedParagraphStyle(style.basedOnId, source, nextSeen) : {}), ...style.patch }
}

/**
 * The look a paragraph style gives, what it is based on included. Its tint (גוון, per cent) lightens the text colour toward white:
 * done once, on the whole merged look, so a style based on another one tints the colour it inherits and a tint is never applied twice.
 */
export function resolveParagraphStyle(id: string, source: ParagraphStyleRecord[], seen = new Set<string>()): ParagraphStyleRecord['patch'] {
  const merged = mergedParagraphStyle(id, source, seen)
  if (merged.tint === undefined || merged.tint >= 100 || !merged.color || !/^#[0-9a-f]{6}$/i.test(merged.color)) return merged
  return { ...merged, color: tintHex(merged.color, merged.tint) }
}

/** a style's fill and line, as a paragraph carries them (a line needs a width; its colour defaults to black) */
export const paragraphBoxOf = (look: ParagraphStyleRecord['patch']): ParagraphBox => ({
  ...(look.background ? { background: look.background } : {}),
  ...(look.borderWidth ? { borderWidth: look.borderWidth, borderColor: look.borderColor ?? '#000000' } : {}),
})

/** the style a paragraph is in: its listed id, else the one its name says, else the frame's, else the document's base style */
export function styleIdOf(styles: ParagraphStyleRecord[], frame: TextFrame, index: number): string | undefined {
  const listed = frame.paragraphStyleIds?.[index]
  const named = frame.paragraphStyleNames?.[index]
  return styles.find((style) => style.id === listed)?.id ?? styles.find((style) => !!named && style.name === named)?.id ?? styles.find((style) => style.id === frame.paragraphStyleId)?.id ?? styles[0]?.id
}

/** how a paragraph looks before any character style: the story's own look, then what its paragraph style says */
function paragraphLookAt(styles: ParagraphStyleRecord[], head: TextFrame, offset: number): CharStyle {
  const id = styleIdOf(styles, head, paraIndexAt(head.text, offset))
  const resolved = id ? resolveParagraphStyle(id, styles) : {}
  const look: Record<string, unknown> = { ...charStyleOf(head) }
  for (const key of CHAR_LOOK_KEYS) {
    const value = (resolved as Record<string, unknown>)[key]
    if (value !== undefined) look[key] = value
  }
  return look as unknown as CharStyle
}

/** a story's head with `change` applied to the runs of its text and of each of its notes (`base`: the look a text goes back to) */
function withStoryRuns(frame: TextFrame, styles: ParagraphStyleRecord[], env: StyleEnv, change: (text: string, runs: Run[], base: (paragraphStart: number) => Partial<CharStyle>) => Run[]): TextFrame {
  let next = frame
  if (frame.text) {
    const runs = normalizeRuns(frame.text, frame.runs, frame)
    const changed = change(frame.text, runs, (start) => paragraphLookAt(styles, frame, start))
    if (changed !== runs) next = { ...next, runs: changed }
  }
  if (frame.footnotes?.length) {
    let touched = false
    const footnotes = frame.footnotes.map((item) => {
      const base = item.style ?? footnoteTextStyle(env.footnoteConfig, styles, item.paragraphStyleId)
      const runs = normalizeRuns(item.content, item.runs, base)
      const changed = change(item.content, runs, () => base)
      if (changed === runs) return item
      touched = true
      return { ...item, runs: changed }
    })
    if (touched) next = { ...next, footnotes }
  }
  return next
}

/**
 * The nested styles of the paragraph styles in `styles` given to the paragraphs of a story that are in them (`onlyStyleId`: just
 * that one). `formerly`: styles the rules of `onlyStyleId` used before, which are let go of too. `chars`: resolved character styles.
 */
export function applyNestedToFrame(frame: TextFrame, styles: ParagraphStyleRecord[], lookStyles: ParagraphStyleRecord[], chars: CharacterStyleRecord[], onlyStyleId?: string, formerly: Iterable<string> = []): TextFrame {
  if (!frame.text || chars.length === 0) return frame
  const rulesOf = new Map(styles.filter((style) => (!onlyStyleId || style.id === onlyStyleId) && (style.nested?.length || (onlyStyleId && [...formerly].length > 0))).map((style) => [style.id, style.nested ?? []]))
  if (rulesOf.size === 0) return frame
  let runs = normalizeRuns(frame.text, frame.runs, frame)
  let changed = false
  let offset = 0
  frame.text.split('\n').forEach((paragraph, index) => {
    const start = offset
    offset += paragraph.length + 1
    const id = styleIdOf(styles, frame, index)
    const rules = id ? rulesOf.get(id) : undefined
    if (!rules) return
    const next = applyNestedStyles(frame.text, runs, start, start + paragraph.length, rules, chars, (at) => paragraphLookAt(lookStyles, frame, at), formerly)
    if (next !== runs) {
      runs = next
      changed = true
    }
  })
  return changed ? { ...frame, runs } : frame
}

/**
 * A character style's definition changed (`before` → `after` are the whole lists): the runs that carry it (and the styles based
 * on it) are written again, the places where the user changed something by hand staying as they are.
 */
export function restyleForCharacterChange(frames: TextFrame[], paragraphStyles: ParagraphStyleRecord[], before: CharacterStyleRecord[], after: CharacterStyleRecord[], id: string, env: StyleEnv): TextFrame[] {
  const affected = [id, ...descendantsOf(after, id)]
  return frames.map((frame) => withStoryRuns(frame, paragraphStyles, env, (text, runs, base) => affected.reduce(
    (current, styleId) => updateCharacterStyleRuns(text, current, styleId, resolveCharacterPatch(before, styleId) as CharacterStyleSettings, resolveCharacterPatch(after, styleId) as CharacterStyleSettings, base),
    runs,
  )))
}

/**
 * A paragraph style's definition changed (`styles` → `nextStyles` are the whole lists): the paragraphs in it get the new look,
 * the notes in it too, and its nested styles are given again. The runs follow only where they still had the old style's look.
 */
export function restyleForParagraphChange(frames: TextFrame[], styles: ParagraphStyleRecord[], nextStyles: ParagraphStyleRecord[], characterStyles: CharacterStyleRecord[], id: string, env: StyleEnv): TextFrame[] {
  const resolvedChars = resolvedRecords(characterStyles)
  const previous = resolveParagraphStyle(id, styles)
  const resolved = resolveParagraphStyle(id, nextStyles)
  const charPatch = Object.fromEntries(RUN_KEYS.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]])) as Partial<CharStyle>
  const refreshStyleRuns = (frame: TextFrame) => restyleRange(normalizeRuns(frame.text, frame.runs, frame), 0, frame.text.length, (style) => Object.fromEntries(
    RUN_KEYS.filter((key) => style[key] === previous[key] && resolved[key] !== undefined).map((key) => [key, resolved[key]]),
  ) as Partial<CharStyle>)
  const oldFootnoteStyle = footnoteTextStyle(env.footnoteConfig, styles, id)
  const nextFootnoteStyle = footnoteTextStyle(env.footnoteConfig, nextStyles, id)
  const updateFootnoteStyles = (frame: TextFrame) => {
    if (!frame.footnotes?.some((note) => note.paragraphStyleId === id)) return frame
    return { ...frame, footnotes: frame.footnotes.map((note) => (note.paragraphStyleId === id ? updateFootnoteParagraphStyle(note, oldFootnoteStyle, nextFootnoteStyle) : note)) }
  }
  const updateParagraphs = (frame: TextFrame): TextFrame => {
    const hasFrameStyle = frame.paragraphStyleId === id
    const hasParagraphStyles = !!frame.paragraphStyleIds?.length
    const usesDefaultStyle = !frame.paragraphStyleId && !hasParagraphStyles && styles[0]?.id === id
    if (!hasFrameStyle && !frame.paragraphStyleIds?.includes(id) && !usesDefaultStyle) return frame
    // the story as a whole is on this style: its look becomes the frame's own (the keep setting is a paragraph one, not a frame field)
    const { keepLinesTogether, keepWithNext, listKind, listGap, background: _background, borderColor: _borderColor, borderWidth: _borderWidth, ...frameLook } = resolved
    if ((hasFrameStyle || usesDefaultStyle) && !hasParagraphStyles) {
      const count = frame.text.split('\n').length
      // "keep all lines" follows the style; a minimum of first/last lines set on a paragraph itself stays
      const keepOf = (list: (number | null)[] | undefined) => {
        const kept = Array.from({ length: count }, (_, index) => styleKeepOverride(list?.[index], !!keepLinesTogether) ?? null)
        return kept.some((value) => value) ? kept : undefined
      }
      const paragraphStylePatches = Array.from({ length: count }, (_, index) => {
        const patch = { ...(frame.paragraphStylePatches?.[index] ?? {}) }
        if (listKind) patch.listKind = listKind
        else delete patch.listKind
        if (listKind && listGap !== undefined) patch.listGap = listGap
        else delete patch.listGap
        delete patch.background
        delete patch.borderColor
        delete patch.borderWidth
        Object.assign(patch, paragraphBoxOf(resolved))
        return patch
      })
      return { ...frame, ...frameLook, paragraphStylePatches, paraKeepFirstLines: keepOf(frame.paraKeepFirstLines), paraKeepLastLines: keepOf(frame.paraKeepLastLines), paraKeepWithNext: keepWithNext ? Array.from({ length: count }, () => 1) : undefined, runs: refreshStyleRuns(frame) }
    }
    const paragraphStyleIds = frame.paragraphStyleIds ?? []
    const paragraphStylePatches: NonNullable<TextFrame['paragraphStylePatches']> = frame.paragraphStylePatches ? frame.paragraphStylePatches.slice() : paragraphStyleIds.map(() => ({}))
    let paraSpaceBefore = frame.paraSpaceBefore
    let paraSpaceAfter = frame.paraSpaceAfter
    let paraKeepFirstLines = frame.paraKeepFirstLines
    let paraKeepLastLines = frame.paraKeepLastLines
    let paraKeepWithNext = frame.paraKeepWithNext
    let runs = normalizeRuns(frame.text, frame.runs, frame)
    let start = 0
    paragraphStyleIds.forEach((styleId, index) => {
      const end = index + 1 < paragraphStyleIds.length ? (frame.text.indexOf('\n', start) + 1 || frame.text.length) : frame.text.length
      if (styleId === id) {
        runs = applyParagraphLook(runs, start, end, charPatch, resolvedChars)
        // a window under the opening words is not part of the style: it stays when the style is edited
        const keptWindow = paragraphStylePatches[index]?.windowIndent
        const keptWindowWords = paragraphStylePatches[index]?.windowWords
        paragraphStylePatches[index] = {
          ...Object.fromEntries(PARAGRAPH_LOOK_KEYS.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]])),
          ...(listKind ? { listKind } : {}),
          ...(listKind && listGap !== undefined ? { listGap } : {}),
          ...paragraphBoxOf(resolved),
          ...(keptWindow ? { windowIndent: keptWindow, ...(keptWindowWords ? { windowWords: keptWindowWords } : {}) } : {}),
        }
        if (resolved.spaceBefore !== undefined) paraSpaceBefore = withParaOverride(paraSpaceBefore, index, resolved.spaceBefore)
        if (resolved.spaceAfter !== undefined) paraSpaceAfter = withParaOverride(paraSpaceAfter, index, resolved.spaceAfter)
        paraKeepFirstLines = setParaOverride(paraKeepFirstLines, index, styleKeepOverride(paraKeepFirstLines?.[index], !!keepLinesTogether))
        paraKeepLastLines = setParaOverride(paraKeepLastLines, index, styleKeepOverride(paraKeepLastLines?.[index], !!keepLinesTogether))
        paraKeepWithNext = setParaOverride(paraKeepWithNext, index, keepWithNext ? 1 : undefined)
      }
      start = end
    })
    const sameStyle = paragraphStyleIds.length > 0 && paragraphStyleIds.every((styleId) => styleId === id)
    return { ...frame, ...(sameStyle ? frameLook : {}), paragraphStylePatches, paraSpaceBefore, paraSpaceAfter, paraKeepFirstLines, paraKeepLastLines, paraKeepWithNext, runs }
  }
  const formerlyNested = (styles.find((style) => style.id === id)?.nested ?? []).map((rule) => rule.styleId)
  return frames.map((frame) => applyNestedToFrame(updateParagraphs(updateFootnoteStyles(frame)), nextStyles, styles, resolvedChars, id, formerlyNested))
}
