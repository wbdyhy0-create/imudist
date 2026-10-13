import { t } from './i18n'
import { resolvedRecords } from './characterStyleTree'
import type { CharacterStyleRecord, ParagraphStyleRecord, Run, StyleLayerRule, StyleLayerWhen, TextFrame } from './document'
import { headFrames } from './frames'
import { normalizeRuns, styleRange } from './story'
import { styleIdOf } from './styleApply'

/**
 * Style layers (שכבות סגנון): a paragraph style can say "whatever in my paragraphs is Latin letters (or numbers, or Arabic...) gets
 * this character style on top". Nothing is written into the text: the layers are worked out from the text and the styles each
 * time it is laid out and drawn, so they follow every edit, and the character styles the text has itself stay where they are.
 */

export const STYLE_LAYER_KINDS: { id: StyleLayerWhen; label: string }[] = [
  { id: 'latin', get label() { return t('אנגלית (אותיות לטיניות)') } },
  { id: 'hebrew', get label() { return t('עברית') } },
  { id: 'arabic', get label() { return t('ערבית') } },
  { id: 'cyrillic', get label() { return t('רוסית (קירילית)') } },
  { id: 'greek', get label() { return t('יוונית') } },
  { id: 'digits', get label() { return t('מספרים') } },
  { id: 'all', get label() { return t('כל הפסקה') } },
  { id: 'custom', get label() { return t('תבנית מותאמת (מתקדם)') } },
]

export const MAX_STYLE_LAYERS = 20
export const MAX_LAYER_PATTERN = 300
/** matches one rule may give in one paragraph (a pattern that matches every letter must not make a paragraph unbearably slow) */
const MAX_MATCHES = 2000

const SCRIPTS: Partial<Record<StyleLayerWhen, string>> = { latin: 'Latin', hebrew: 'Hebrew', arabic: 'Arabic', cyrillic: 'Cyrillic', greek: 'Greek' }

/**
 * A run of words in one script: it begins with a letter of the script, goes on through letters, digits, apostrophes and hyphens,
 * and takes the next word along when only spaces lie between (a number inside it is part of it). Punctuation ends it.
 */
function scriptPattern(script: string): string {
  const letter = `\\p{Script=${script}}`
  const body = `[\\p{Script=${script}}\\p{N}'’\\-]`
  return `${letter}${body}*(?:[ \\u00A0]+(?:${letter}|\\p{N})${body}*)*`
}

const DIGITS_PATTERN = '\\p{N}+(?:[.,:/\\-]\\p{N}+)*'

/** the expression a rule looks for (null: every character of the paragraph, or nothing when a custom rule has no pattern) */
export function layerPattern(rule: Pick<StyleLayerRule, 'when' | 'pattern'>): string | null {
  const script = SCRIPTS[rule.when]
  if (script) return scriptPattern(script)
  if (rule.when === 'digits') return DIGITS_PATTERN
  if (rule.when === 'custom') return rule.pattern?.trim() || null
  return null
}

const compiled = new Map<string, RegExp | null>()

/** the pattern as a global RegExp (Unicode mode when it allows it), or null when it is not a valid expression */
function compile(source: string): RegExp | null {
  if (source.length > 1000) return null
  const known = compiled.get(source)
  if (known !== undefined) return known
  let found: RegExp | null = null
  for (const flags of ['gu', 'g']) {
    try {
      found = new RegExp(source, flags)
      break
    } catch {
      // the next flavour
    }
  }
  if (compiled.size > 200) compiled.clear()
  compiled.set(source, found)
  return found
}

/** what is wrong with a rule that cannot be applied (for the editor), or null */
export function layerProblem(rule: Pick<StyleLayerRule, 'when' | 'pattern'>): string | null {
  if (rule.when !== 'custom') return null
  const pattern = rule.pattern?.trim() ?? ''
  if (!pattern) return t('לא נכתבה תבנית')
  if (pattern.length > MAX_LAYER_PATTERN) return t('התבנית ארוכה מדי')
  return compile(pattern) ? null : t('התבנית אינה תקינה')
}

/** the pieces of `paragraph` a rule gives its style to, [start, end) */
export function layerRanges(paragraph: string, rule: Pick<StyleLayerRule, 'when' | 'pattern'>): [number, number][] {
  if (!paragraph) return []
  if (rule.when === 'all') return [[0, paragraph.length]]
  const source = layerPattern(rule)
  const expression = source && source.length <= (rule.when === 'custom' ? MAX_LAYER_PATTERN : 1000) ? compile(source) : null
  if (!expression) return []
  const found: [number, number][] = []
  expression.lastIndex = 0
  for (let match = expression.exec(paragraph); match && found.length < MAX_MATCHES; match = expression.exec(paragraph)) {
    if (match[0].length === 0) {
      expression.lastIndex++
      continue
    }
    found.push([match.index, match.index + match[0].length])
  }
  return found
}

/** the rules of a paragraph style: its own, or else those of the style it is based on (and so on up) */
export function layerRulesOf(styles: ParagraphStyleRecord[], id: string | undefined): StyleLayerRule[] {
  const seen = new Set<string>()
  for (let at = id; at && !seen.has(at); ) {
    seen.add(at)
    const style = styles.find((candidate) => candidate.id === at)
    if (!style) return []
    if (style.layers?.length) return style.layers
    at = style.basedOnId
  }
  return []
}

/** the parts of [a, b) whose characters have the character style `styleId` (as the runs have it, without any layer) */
function partsWithStyle(runs: Run[], a: number, b: number, styleId: string): [number, number][] {
  const parts: [number, number][] = []
  let pos = 0
  for (const run of runs) {
    const from = Math.max(a, pos)
    const to = Math.min(b, pos + run.len)
    pos += run.len
    if (run.style.charStyleId === styleId && to > from) {
      const last = parts[parts.length - 1]
      if (last && last[1] === from) last[1] = to
      else parts.push([from, to])
    }
    if (pos >= b) break
  }
  return parts
}

/** the runs of a story with its layers written in, or null when no layer touches anything */
function computeLayers(frame: TextFrame, styles: ParagraphStyleRecord[], chars: CharacterStyleRecord[]): Run[] | null {
  const byId = new Map(chars.map((record) => [record.id, record]))
  const base = normalizeRuns(frame.text, frame.runs, frame)
  let runs = base
  let offset = 0
  const rulesOf = new Map<string, StyleLayerRule[]>()
  frame.text.split('\n').forEach((paragraph, index) => {
    const start = offset
    offset += paragraph.length + 1
    if (!paragraph) return
    const id = styleIdOf(styles, frame, index)
    if (!id) return
    let rules = rulesOf.get(id)
    if (!rules) {
      rules = layerRulesOf(styles, id)
      rulesOf.set(id, rules)
    }
    for (const rule of rules) {
      const record = byId.get(rule.styleId)
      if (!record || Object.keys(record.patch).length === 0) continue
      let ranges = layerRanges(paragraph, rule).map(([a, b]): [number, number] => [start + a, start + b])
      if (rule.onlyWithStyleId) ranges = ranges.flatMap(([a, b]) => partsWithStyle(base, a, b, rule.onlyWithStyleId!))
      for (const [a, b] of ranges) runs = styleRange(runs, a, b, record.patch)
    }
  })
  return runs === base ? null : runs
}

interface Remembered {
  source: Run[] | undefined
  text: string
  ids: TextFrame['paragraphStyleIds']
  names: TextFrame['paragraphStyleNames']
  styleId: TextFrame['paragraphStyleId']
  styles: ParagraphStyleRecord[]
  chars: CharacterStyleRecord[]
  runs: Run[] | null
}

/**
 * What was worked out for a story (by the id of its first frame), kept until its text, runs, paragraph styles or the styles change:
 * the layout remembers a story by the identity of its runs, so the same layers must come back as the same array or every redraw
 * would lay the story out again.
 */
const remembered = new Map<string, Remembered>()

function layeredRuns(frame: TextFrame, styles: ParagraphStyleRecord[], chars: CharacterStyleRecord[]): Run[] | null {
  const hit = remembered.get(frame.id)
  if (hit && hit.source === frame.runs && hit.text === frame.text && hit.ids === frame.paragraphStyleIds && hit.names === frame.paragraphStyleNames && hit.styleId === frame.paragraphStyleId && hit.styles === styles && hit.chars === chars) return hit.runs
  const runs = computeLayers(frame, styles, chars)
  if (remembered.size > 400) remembered.clear()
  remembered.set(frame.id, { source: frame.runs, text: frame.text, ids: frame.paragraphStyleIds, names: frame.paragraphStyleNames, styleId: frame.paragraphStyleId, styles, chars, runs })
  return runs
}

/**
 * The frames with the style layers of the paragraph styles written into the runs of their stories (the heads): what the layout and
 * the drawing use. The saved frames are not touched; with no layer in play the same array comes back.
 * `characterStyles` are the document's, as they are (their "based on" chains are folded in here).
 */
export function withStyleLayers(frames: TextFrame[], paragraphStyles: ParagraphStyleRecord[], characterStyles: CharacterStyleRecord[]): TextFrame[] {
  if (characterStyles.length === 0 || !paragraphStyles.some((style) => style.layers?.length)) return frames
  const chars = resolvedFor(characterStyles)
  const heads = new Set(headFrames(frames).map((frame) => frame.id))
  let changed = false
  const out = frames.map((frame) => {
    if (!heads.has(frame.id) || !frame.text) return frame
    const runs = layeredRuns(frame, paragraphStyles, chars)
    if (!runs) return frame
    changed = true
    return { ...frame, runs }
  })
  return changed ? out : frames
}

/** the styles with their "based on" chains folded in, the same array for the same list (so what is remembered stays valid) */
const resolvedLists = new WeakMap<CharacterStyleRecord[], CharacterStyleRecord[]>()
function resolvedFor(list: CharacterStyleRecord[]): CharacterStyleRecord[] {
  let resolved = resolvedLists.get(list)
  if (!resolved) {
    resolved = resolvedRecords(list)
    resolvedLists.set(list, resolved)
  }
  return resolved
}
