import type { CharacterStyleRecord, CharacterStyleSettings, CharStyle, Run, TextFrame } from './document'
import { KEEP_ALL_LINES } from './document'

/**
 * Pure helpers for a story's formatted text. A story is a string plus `runs`: consecutive pieces that share a
 * character style. All offsets are character offsets into the whole story.
 */

export const charStyleOf = (s: CharStyle): CharStyle => ({
  fontFamily: s.fontFamily,
  ...(s.color ? { color: s.color } : {}),
  ...(s.outlineColor ? { outlineColor: s.outlineColor } : {}),
  ...(s.outlineWidth ? { outlineWidth: s.outlineWidth } : {}),
  ...(s.shadowOffsetX !== undefined ? { shadowOffsetX: s.shadowOffsetX } : {}),
  ...((s.shadowOffsetY ?? s.shadowOffset) !== undefined ? { shadowOffsetY: s.shadowOffsetY ?? s.shadowOffset } : {}),
  ...(s.shadowOffset !== undefined ? { shadowOffset: s.shadowOffset } : {}),
  ...(s.shadowColor ? { shadowColor: s.shadowColor } : {}),
  ...(s.shadowOpacity !== undefined ? { shadowOpacity: s.shadowOpacity } : {}),
  ...(s.charStyleId ? { charStyleId: s.charStyleId } : {}),
  ...(s.baselineShift ? { baselineShift: s.baselineShift } : {}),
  fontSize: s.fontSize,
  weight: s.weight,
  italic: s.italic,
  tracking: s.tracking,
})

const sameStyle = (a: CharStyle, b: CharStyle) =>
  a.fontFamily === b.fontFamily && a.color === b.color && a.outlineColor === b.outlineColor && a.outlineWidth === b.outlineWidth && a.shadowOffsetX === b.shadowOffsetX && (a.shadowOffsetY ?? a.shadowOffset) === (b.shadowOffsetY ?? b.shadowOffset) && a.shadowColor === b.shadowColor && a.shadowOpacity === b.shadowOpacity && a.fontSize === b.fontSize && a.weight === b.weight && a.italic === b.italic && a.tracking === b.tracking && a.charStyleId === b.charStyleId && (a.baselineShift ?? 0) === (b.baselineShift ?? 0)

/** Drop empty runs and join neighbours that have the same style. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    if (r.len <= 0) continue
    const last = out[out.length - 1]
    if (last && sameStyle(last.style, r.style)) out[out.length - 1] = { len: last.len + r.len, style: last.style }
    else out.push(r)
  }
  return out
}

/** Runs that cover exactly `text`; missing or out-of-sync data falls back to a single run in the base style. */
export function normalizeRuns(text: string, runs: Run[] | undefined, base: CharStyle): Run[] {
  const total = runs ? runs.reduce((n, r) => n + r.len, 0) : -1
  if (runs && total === text.length) return runs
  return text ? [{ len: text.length, style: charStyleOf(base) }] : []
}

export function sliceRuns(runs: Run[], a: number, b: number): Run[] {
  const out: Run[] = []
  let pos = 0
  for (const r of runs) {
    const s = Math.max(a, pos)
    const e = Math.min(b, pos + r.len)
    if (e > s) out.push({ len: e - s, style: r.style })
    pos += r.len
    if (pos >= b) break
  }
  return out
}

/** Style of the character at index `i` (clamped into the text), or `base` when there is no text. */
export function styleAtChar(runs: Run[], i: number, base: CharStyle): CharStyle {
  let pos = 0
  for (const r of runs) {
    pos += r.len
    if (i < pos) return r.style
  }
  return runs.length ? runs[runs.length - 1].style : base
}

/** Apply `patch` to the characters [a, b). */
export function styleRange(runs: Run[], a: number, b: number, patch: Partial<CharStyle>): Run[] {
  const out: Run[] = []
  let pos = 0
  for (const r of runs) {
    const s = pos
    const e = pos + r.len
    const pieces: [number, number, boolean][] = [
      [s, Math.min(e, a), false],
      [Math.max(s, a), Math.min(e, b), true],
      [Math.max(s, b), e, false],
    ]
    for (const [ps, pe, patched] of pieces) {
      if (pe > ps) out.push({ len: pe - ps, style: patched ? { ...r.style, ...patch } : r.style })
    }
    pos = e
  }
  return mergeRuns(out)
}

/** Clear a paragraph's visible first-line indent without removing its paragraph break or style. */
export function clearParagraphFirstLineIndent(
  patches: TextFrame['paragraphStylePatches'],
  index: number,
  paragraphCount: number,
  inheritedIndent: number,
): TextFrame['paragraphStylePatches'] | null {
  if (!((patches?.[index]?.firstLineIndent ?? inheritedIndent) > 0)) return null
  const next = patches?.slice() ?? Array.from({ length: paragraphCount }, () => ({}))
  while (next.length <= index) next.push({})
  next[index] = { ...next[index], firstLineIndent: 0 }
  return next
}

/** Change the characters [a, b) relative to what each has now: `change` gets a run's style and returns the patch for it. */
export function restyleRange(runs: Run[], a: number, b: number, change: (style: CharStyle) => Partial<CharStyle>): Run[] {
  const out: Run[] = []
  let pos = 0
  for (const r of runs) {
    const s = pos
    const e = pos + r.len
    const pieces: [number, number, boolean][] = [
      [s, Math.min(e, a), false],
      [Math.max(s, a), Math.min(e, b), true],
      [Math.max(s, b), e, false],
    ]
    for (const [ps, pe, patched] of pieces) {
      if (pe > ps) out.push({ len: pe - ps, style: patched ? { ...r.style, ...change(r.style) } : r.style })
    }
    pos = e
  }
  return mergeRuns(out)
}

/**
 * Replace the characters [from, to) with `insert`. Inserted text takes the style of the character before it
 * (or the first character when inserting at the very start).
 */
export function editStory(
  text: string,
  runsIn: Run[],
  from: number,
  to: number,
  insert: string,
  base: CharStyle,
): { text: string; runs: Run[] } {
  from = Math.max(0, Math.min(from, text.length))
  to = Math.max(from, Math.min(to, text.length))
  const runs = normalizeRuns(text, runsIn, base)
  const inherit = styleAtChar(runs, Math.max(0, from - 1), base)
  const mid: Run[] = insert ? [{ len: insert.length, style: inherit }] : []
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    runs: mergeRuns([...sliceRuns(runs, 0, from), ...mid, ...sliceRuns(runs, to, text.length)]),
  }
}

/** a blank that is shown: a space (or a no-break one) - the kind that is collapsed when it comes twice in a row */
const isBlank = (c: string) => c === ' ' || c === ' '
/** characters that show nothing at all: blanks, and the directional / zero-width marks Hebrew text carries around */
const isInvisibleMark = (c: string) => isBlank(c) || /[​-‏‪-‮⁠-⁤؜﻿]/.test(c)

/**
 * What a paragraph can hold and still be an empty one: blanks and the invisible marks above, tabs, every kind of space
 * (en, em, thin, narrow no-break, ideographic...), and any other formatting character (soft hyphen, line separator...). The
 * private-use characters the program puts into a story (footnote references, page numbers) are none of these, so a
 * paragraph that holds one is never taken for empty.
 */
const isInvisible = (c: string) => isInvisibleMark(c) || /[\p{White_Space}\p{Cf}\u00AD\u180E]/u.test(c)

/**
 * The [from, to) ranges of `text` that spacing cleanup removes:
 * - a paragraph with nothing in it - empty, or only blanks and invisible marks (a "\n \n" or "\n‏\n" is as much
 *   an empty paragraph as "\n\n") - together with its own paragraph break, wherever it is, including at the very
 *   start of the story; empty paragraphs at the very end of the story go with the break that leads into them, so the
 *   story ends where its last paragraph with text does (no empty line is left under it for the caret to sit on);
 * - in every other paragraph, the blanks of a run of two or more after the first (a no-break space counts as a blank).
 * Only paragraphs inside [from, to) are looked at; ranges come back in order and never overlap.
 */
export function cleanSpacingRanges(text: string, from = 0, to = text.length): [number, number][] {
  return cleanSpacingPlan(text, from, to).ranges
}

/** `cleanSpacingRanges`, and which paragraphs (by their index in `text`) go away altogether - for the per-paragraph lists that follow the text. */
export function cleanSpacingPlan(text: string, from = 0, to = text.length): { ranges: [number, number][]; dropped: number[] } {
  const ranges: [number, number][] = []
  const dropped: number[] = []
  let start = 0
  let index = -1
  while (start <= text.length) {
    index++
    const nl = text.indexOf('\n', start)
    const end = nl < 0 ? text.length : nl
    if (end >= from && start <= to) {
      let empty = true
      for (let i = start; i < end; i++) {
        if (!isInvisible(text[i])) {
          empty = false
          break
        }
      }
      if (empty && start >= from && end <= to) {
        // a paragraph that is only its own break goes with it; the last paragraph has no break after it to take along
        if (nl >= 0) {
          ranges.push([start, nl + 1])
          dropped.push(index)
        } else if (end > start) ranges.push([start, end])
      } else if (!empty) {
        let i = Math.max(start, from)
        const limit = Math.min(end, to)
        while (i < limit) {
          if (isBlank(text[i]) && i > start && isBlank(text[i - 1])) {
            let j = i + 1
            while (j < limit && isBlank(text[j])) j++
            ranges.push([i, j])
            i = j
          } else i++
        }
      }
    }
    if (nl < 0) break
    start = nl + 1
  }
  return withTrailingBreaksRemoved(text, from, to, ranges, dropped)
}

/**
 * The empty paragraphs at the end of the story go with the break in front of them: "א\n\n" is "א", not "א\n" (that left an
 * empty paragraph, and a caret line, under the last line of text). Only when the whole end of the story is in the cleaned
 * part, and only when there is a paragraph with text before it to end the story on.
 */
function withTrailingBreaksRemoved(text: string, from: number, to: number, ranges: [number, number][], dropped: number[]): { ranges: [number, number][]; dropped: number[] } {
  if (to < text.length) return { ranges, dropped }
  // where the last paragraph that has something in it ends, and how many paragraphs follow it
  let lastEnd = -1
  let after = 0
  let index = 0
  for (let start = 0; start <= text.length; index++) {
    const nl = text.indexOf('\n', start)
    const end = nl < 0 ? text.length : nl
    let empty = true
    for (let i = start; i < end; i++) if (!isInvisible(text[i])) { empty = false; break }
    if (!empty) {
      lastEnd = end
      after = 0
    } else after++
    if (nl < 0) break
    start = nl + 1
  }
  if (lastEnd < 0 || after === 0 || lastEnd < from) return { ranges, dropped }
  const firstGone = index - after + 1
  return {
    ranges: [...ranges.filter(([a]) => a < lastEnd), [lastEnd, text.length]],
    dropped: [...dropped.filter((d) => d < firstGone), ...Array.from({ length: after }, (_, k) => firstGone + k)],
  }
}

/**
 * Removes repeated spaces and empty paragraphs (see `cleanSpacingRanges`) from [from, to) of the story (the whole
 * story by default). One story-wide edit, reusing `editStory` per run so styling and run merging stay correct; ranges are
 * applied back to front so earlier offsets stay valid. (The paragraph lists and footnote anchors of a frame are
 * the caller's: findReplace.ts's `replaceInStory` does that for each of these ranges.)
 */
export function cleanSpacing(text: string, runs: Run[], base: CharStyle, from = 0, to = text.length): { text: string; runs: Run[] } {
  const ranges = cleanSpacingRanges(text, from, to)
  let out = { text, runs }
  for (let k = ranges.length - 1; k >= 0; k--) {
    const [a, b] = ranges[k]
    out = editStory(out.text, out.runs, a, b, '', base)
  }
  return out
}

/** The 0-based index of the paragraph ("\n"-separated piece of `text`) that character offset `i` belongs to. */
export const paraIndexAt = (text: string, i: number): number => {
  let n = 0
  for (let k = 0; k < i && k < text.length; k++) if (text[k] === '\n') n++
  return n
}

/** Is offset `i` a paragraph's own first character (the story's start, or right after a "\n") — as opposed to a
 *  wrapped continuation of the previous line? */
export const atParaStart = (text: string, i: number): boolean => i === 0 || text[i - 1] === '\n'

/** The 0-based indices of every paragraph touched by [a, b) of `text` — always at least one, even for a === b. */
export function paragraphsInRange(text: string, a: number, b: number): number[] {
  const first = paraIndexAt(text, a)
  const last = paraIndexAt(text, Math.max(a, b - 1))
  const out: number[] = []
  for (let i = first; i <= last; i++) out.push(i)
  return out
}

/** A per-paragraph override array with `value` set at `index` (padded with `null` — "no override" — up to it). */
export function withParaOverride(overrides: (number | null)[] | undefined, index: number, value: number): (number | null)[] {
  const out = overrides ? overrides.slice() : []
  while (out.length <= index) out.push(null)
  out[index] = value
  return out
}

/**
 * What a paragraph's first/last-lines override (orphan and widow control) becomes when its paragraph style is applied or
 * redefined. "Keep all lines together" is the style's own setting, so it is put on or taken off with the style; a minimum
 * number of lines set on the paragraph itself (the orphan/widow dialog, the paragraph panel) is the paragraph's own and stays -
 * applying a style used to wipe it, and the widows it had prevented came back.
 */
export function styleKeepOverride(current: number | null | undefined, styleKeepsAll: boolean): number | undefined {
  if (styleKeepsAll) return KEEP_ALL_LINES
  return current && current !== KEEP_ALL_LINES ? current : undefined
}

/** `withParaOverride`, or - with no value - the paragraph's own override taken away (back to `null`, "none"). */
export function setParaOverride(overrides: (number | null)[] | undefined, index: number, value: number | undefined): (number | null)[] | undefined {
  if (value !== undefined) return withParaOverride(overrides, index, value)
  if (overrides?.[index] == null) return overrides
  const out = overrides.slice()
  out[index] = null
  return out
}

/**
 * Re-indexes a per-paragraph override array (`TextFrame.paraSpaceBefore` / `paraSpaceAfter`) after an edit that
 * replaces [from, to) of `oldText` with `insert` — keeping each surviving paragraph's override lined up with its
 * new index even when the edit adds or removes paragraph breaks. A paragraph entirely swallowed by the edit (two
 * paragraphs merged by deleting the "\n" between them, or more) loses its own override — a reasonable default: a
 * heavily-edited paragraph shouldn't keep carrying a stale spacing override — while a brand new paragraph (a "\n"
 * that is part of `insert`) starts with none (`null`), falling back to the story's own default until the user sets
 * one. Called wherever a story's text changes; returns the input unchanged when there is nothing to re-index.
 */
export function spliceParaOverrides(
  overrides: (number | null)[] | undefined,
  oldText: string,
  from: number,
  to: number,
  insert: string,
  /** a paragraph the edit creates takes the override of the paragraph it was split from (Enter), instead of starting with none */
  inherit = false,
): (number | null)[] | undefined {
  if (!overrides || overrides.length === 0) return overrides
  const startPara = paraIndexAt(oldText, from)
  const removedParas = paraIndexAt(oldText, to) - startPara
  const addedParas = (insert.match(/\n/g) ?? []).length
  const out = overrides.slice()
  out.splice(startPara + 1, removedParas, ...Array<number | null>(addedParas).fill(inherit ? overrides[startPara] ?? null : null))
  return out.some((v) => v !== null) ? out : undefined
}

/**
 * The per-paragraph lists of a story (paragraph style ids / names and their resolved patches) follow the text the
 * way `spliceParaOverrides` does — paragraphs the edit removes drop out, later ones shift — except that a paragraph
 * the edit CREATES (Enter inside a paragraph) inherits the entry of the paragraph it was split from, like every text
 * editor does, instead of starting unstyled. Without this an Enter above a styled paragraph left every style below
 * it one paragraph out of place.
 */
function spliceParaList<T>(list: T[] | undefined, oldText: string, from: number, to: number, insert: string, fallback: T, inherit: (entry: T) => T = (entry) => entry): T[] | undefined {
  if (!list || list.length === 0) return list
  const startPara = paraIndexAt(oldText, from)
  const removedParas = paraIndexAt(oldText, to) - startPara
  const addedParas = (insert.match(/\n/g) ?? []).length
  const out = list.slice()
  out.splice(startPara + 1, removedParas, ...Array<T>(addedParas).fill(inherit(out[startPara] ?? fallback)))
  return out
}

/** a paragraph split off by Enter keeps what its parent has - except a window, which belongs to the parent's own opening word(s) */
const withoutWindow = <P extends { windowIndent?: number; windowWords?: number }>(patch: P): P => {
  if (patch.windowIndent === undefined && patch.windowWords === undefined) return patch
  const { windowIndent: _window, windowWords: _words, ...rest } = patch
  return rest as P
}

type ParagraphLists = Pick<TextFrame, 'paragraphStyleIds' | 'paragraphStyleNames' | 'paragraphStylePatches'>

/** `spliceParaList` for all three per-paragraph lists of a story head; only the lists it actually has are returned. */
export function spliceParagraphStyles(f: ParagraphLists, oldText: string, from: number, to: number, insert: string): ParagraphLists {
  const out: ParagraphLists = {}
  const ids = spliceParaList(f.paragraphStyleIds, oldText, from, to, insert, '')
  const names = spliceParaList(f.paragraphStyleNames, oldText, from, to, insert, '')
  const patches = spliceParaList(f.paragraphStylePatches, oldText, from, to, insert, {}, withoutWindow)
  if (ids) out.paragraphStyleIds = ids
  if (names) out.paragraphStyleNames = names
  if (patches) out.paragraphStylePatches = patches
  return out
}

/** The smallest edit that turns `oldText` into `newText` (common prefix / suffix removed). */
export function diffEdit(oldText: string, newText: string): { from: number; to: number; insert: string } {
  let p = 0
  const max = Math.min(oldText.length, newText.length)
  while (p < max && oldText[p] === newText[p]) p++
  let s = 0
  while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++
  return { from: p, to: oldText.length - s, insert: newText.slice(p, newText.length - s) }
}

/** Start of the word before offset `i` (for Ctrl+Backspace). */
export function wordStart(text: string, i: number): number {
  let k = i
  while (k > 0 && /\s/.test(text[k - 1])) k--
  while (k > 0 && !/\s/.test(text[k - 1])) k--
  return k
}

/** End of the word after offset `i` (for Ctrl+Delete). */
export function wordEnd(text: string, i: number): number {
  let k = i
  while (k < text.length && /\s/.test(text[k])) k++
  while (k < text.length && !/\s/.test(text[k])) k++
  return k
}

// ── character styles ────────────────────────────────────────────────────────────

/** every piece of the runs inside [a, b), cut at paragraph breaks, with `change` deciding its new style (paragraphStart: where its paragraph begins) */
function mapPieces(text: string, runs: Run[], a: number, b: number, change: (style: CharStyle, paragraphStart: number) => CharStyle): Run[] {
  const out: Run[] = []
  let pos = 0
  for (const r of runs) {
    const end = pos + r.len
    let at = pos
    while (at < end) {
      const inside = at >= a && at < b
      // the next place where something changes: the end of the run, a range edge, or a paragraph break
      let stop = end
      if (at < a && a < stop) stop = a
      if (at < b && b < stop) stop = b
      if (inside) {
        const br = text.indexOf('\n', at)
        if (br >= 0 && br + 1 < stop) stop = br + 1
      }
      if (inside) {
        const paragraphStart = text.lastIndexOf('\n', at - 1) + 1
        out.push({ len: stop - at, style: change(r.style, paragraphStart) })
      } else out.push({ len: stop - at, style: r.style })
      at = stop
    }
    pos = end
  }
  return mergeRuns(out)
}

/** the style without its link to a character style */
const withoutLink = (style: CharStyle): CharStyle => {
  const { charStyleId: _link, ...rest } = style
  return rest
}

/** the settings of a character style written over [a, b), and the link that keeps the text tied to the style */
export function applyCharacterStyle(runs: Run[], a: number, b: number, record: CharacterStyleRecord): Run[] {
  return styleRange(runs, a, b, { ...record.patch, charStyleId: record.id })
}

const ALWAYS_SET = ['fontFamily', 'fontSize', 'weight', 'italic', 'tracking']

/** `style` with every setting in `keys` taken back from `base` (a paragraph's own look), where `base` has one */
function restoreKeys(style: CharStyle, keys: string[], base: Partial<CharStyle>): CharStyle {
  const next: Record<string, unknown> = { ...style }
  for (const key of keys) {
    const value = (base as Record<string, unknown>)[key]
    // a setting every text has (size, weight...) is never left empty: with nothing to go back to, it stays as it is
    if (value !== undefined) next[key] = value
    else if (!ALWAYS_SET.includes(key)) delete next[key]
  }
  return next as unknown as CharStyle
}

/**
 * Takes the character style off [a, b): the text goes back to the look of its paragraph (`baseAt` says what that is for
 * the paragraph starting at an offset) in every setting the style had set, and the link is dropped. Text with no style,
 * or with one that is no longer there, only loses the link.
 */
export function clearCharacterStyle(text: string, runs: Run[], a: number, b: number, records: CharacterStyleRecord[], baseAt: (paragraphStart: number) => Partial<CharStyle>, only?: ReadonlySet<string>): Run[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  return mapPieces(text, runs, a, b, (style, paragraphStart) => {
    if (!style.charStyleId || (only && !only.has(style.charStyleId))) return style
    const record = byId.get(style.charStyleId)
    const restored = record ? restoreKeys(style, Object.keys(record.patch), baseAt(paragraphStart)) : style
    return withoutLink(restored)
  })
}

/**
 * A character style was edited (`before` → `after`): every piece of text that has it gets the new settings, and a setting
 * the style no longer holds goes back to the look of the paragraph (`baseAt`).
 */
export function updateCharacterStyleRuns(text: string, runs: Run[], id: string, before: CharacterStyleSettings, after: CharacterStyleSettings, baseAt: (paragraphStart: number) => Partial<CharStyle>): Run[] {
  if (!runs.some((r) => r.style.charStyleId === id)) return runs
  const dropped = Object.keys(before).filter((key) => (after as Record<string, unknown>)[key] === undefined)
  return mapPieces(text, runs, 0, text.length, (style, paragraphStart) => {
    if (style.charStyleId !== id) return style
    return { ...(dropped.length ? restoreKeys(style, dropped, baseAt(paragraphStart)) : style), ...after }
  })
}

/**
 * Paragraph style settings written over [a, b) the way a paragraph style does it - except where a character style owns a
 * setting: that text keeps the look of its character style (the stronger of the two).
 */
export function applyParagraphLook(runs: Run[], a: number, b: number, patch: Partial<CharStyle>, records: CharacterStyleRecord[]): Run[] {
  if (records.length === 0 || !runs.some((r) => r.style.charStyleId)) return styleRange(runs, a, b, patch)
  const byId = new Map(records.map((record) => [record.id, record]))
  return restyleRange(runs, a, b, (style) => ({ ...patch, ...(style.charStyleId ? byId.get(style.charStyleId)?.patch : undefined) }))
}

/** the ids of the character styles used anywhere in the runs */
export const characterStyleIdsIn = (runs: Run[]): Set<string> => new Set(runs.flatMap((r) => (r.style.charStyleId ? [r.style.charStyleId] : [])))
