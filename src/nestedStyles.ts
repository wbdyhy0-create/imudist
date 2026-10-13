import type { CharacterStyleRecord, CharStyle, NestedStyleRule, Run } from './document'
import { applyCharacterStyle, clearCharacterStyle } from './story'

/**
 * Nested styles: a paragraph style can say "give the first words (or what comes before a colon...) of every paragraph in
 * me a character style". The rules are read in order, each one starting where the one before it stopped.
 */

export const NESTED_UNITS: { id: NestedStyleRule['unit']; label: string }[] = [
  { id: 'words', label: 'מילים' },
  { id: 'letters', label: 'תווים' },
  { id: 'sentences', label: 'משפטים' },
  { id: 'delimiter', label: 'מופעים של התו' },
]

/** the characters that end a sentence */
const SENTENCE_END = /[.!?:׃]/

/**
 * Where a rule that starts at `from` stops in `paragraph`, or null when the paragraph does not have what the rule asks for
 * (fewer words, no such character): such a rule styles nothing, rather than the whole paragraph.
 */
function ruleEnd(paragraph: string, from: number, rule: NestedStyleRule): number | null {
  const count = Math.max(1, Math.round(rule.count))
  if (rule.unit === 'letters') return from + count <= paragraph.length ? from + count : null
  if (rule.unit === 'words') {
    let at = from
    for (let n = 0; n < count; n++) {
      while (at < paragraph.length && /\s/.test(paragraph[at])) at++
      if (at >= paragraph.length) return null
      while (at < paragraph.length && !/\s/.test(paragraph[at])) at++
    }
    return at
  }
  const marks: number[] = []
  if (rule.unit === 'delimiter') {
    const delimiter = rule.delimiter || ':'
    for (let at = paragraph.indexOf(delimiter, from); at >= 0; at = paragraph.indexOf(delimiter, at + delimiter.length)) marks.push(at)
    const found = marks[count - 1]
    return found === undefined ? null : found + (rule.inclusive ? delimiter.length : 0)
  }
  // a sentence ends at its punctuation, where a space or the end of the paragraph follows
  for (let at = from; at < paragraph.length; at++) {
    if (SENTENCE_END.test(paragraph[at]) && (at + 1 >= paragraph.length || /\s/.test(paragraph[at + 1]))) marks.push(at)
  }
  const found = marks[count - 1]
  return found === undefined ? null : found + (rule.inclusive ? 1 : 0)
}

export interface NestedRange {
  start: number
  end: number
  styleId: string
}

/** the pieces of one paragraph the rules style, as offsets into the paragraph; the first rule that cannot be met ends the list */
export function nestedRanges(paragraph: string, rules: NestedStyleRule[]): NestedRange[] {
  const out: NestedRange[] = []
  let cursor = 0
  for (const rule of rules) {
    const end = ruleEnd(paragraph, cursor, rule)
    if (end === null) break
    if (end > cursor) out.push({ start: cursor, end, styleId: rule.styleId })
    cursor = end
  }
  return out
}

/**
 * The nested styles of one paragraph, [start, end) in the story: whatever in it already has one of the styles the rules use is
 * taken as theirs and set again (so running this twice, or after the text changed, gives the same result), then each
 * piece gets its style. A rule that points at a style that is gone is skipped.
 */
export function applyNestedStyles(
  text: string,
  runs: Run[],
  start: number,
  end: number,
  rules: NestedStyleRule[],
  records: CharacterStyleRecord[],
  baseAt: (paragraphStart: number) => Partial<CharStyle>,
  /** styles an earlier version of the rules used: they are let go of too, so removing a rule takes its styling off */
  formerly: Iterable<string> = [],
): Run[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  const owned = new Set([...rules.map((rule) => rule.styleId), ...formerly].filter((id) => byId.has(id)))
  if (owned.size === 0) return runs
  let next = clearCharacterStyle(text, runs, start, end, records, baseAt, owned)
  for (const range of nestedRanges(text.slice(start, end), rules)) {
    const record = byId.get(range.styleId)
    if (record) next = applyCharacterStyle(next, start + range.start, start + range.end, record)
  }
  return next
}

// ── finding the rules in an example ──

/** the characters that end a styled opening in text: the ones a person marks "what comes before" with */
const OPENING_DELIMITERS = [':', '	', ',', '–', '—', '-', ';', '.', '|', ')', '־', '׃', '/', '•']

/** the rule that gives `styleId` to text[from, to): by the delimiter that ends it, else by its words, else by its letters; null when none reproduces it */
function ruleForPiece(text: string, from: number, to: number, styleId: string): NestedStyleRule | null {
  let end = to
  while (end > from && /\s/.test(text[end - 1])) end--
  if (end <= from) return null
  const occurrences = (a: number, b: number, delimiter: string) => text.slice(a, b).split(delimiter).length - 1
  const candidates: NestedStyleRule[] = []
  const last = text[end - 1]
  if (OPENING_DELIMITERS.includes(last)) candidates.push({ styleId, unit: 'delimiter', count: occurrences(from, end, last), delimiter: last, inclusive: true })
  const after = /^\s*(.)/.exec(text.slice(end))
  if (after && OPENING_DELIMITERS.includes(after[1])) {
    const at = text.indexOf(after[1], end)
    candidates.push({ styleId, unit: 'delimiter', count: occurrences(from, at, after[1]) + 1, delimiter: after[1], inclusive: false })
  }
  const words = text.slice(from, end).trim().split(/\s+/).filter(Boolean).length
  if (words > 0) candidates.push({ styleId, unit: 'words', count: words, inclusive: false })
  candidates.push({ styleId, unit: 'letters', count: end - from, inclusive: false })
  for (const candidate of candidates) {
    const found = ruleEnd(text, from, candidate)
    if (found === null) continue
    let reached = found
    while (reached > from && /\s/.test(text[reached - 1])) reached--
    if (reached === end) return candidate
  }
  return null
}

/** the leading pieces of a paragraph that have a character style: where each ends, up to the first piece that has none */
function leadingStyledPieces(runs: Run[]): { styleId: string; end: number }[] {
  const pieces: { styleId: string; end: number }[] = []
  let at = 0
  for (const run of runs) {
    const styleId = run.style.charStyleId
    if (!styleId) break
    at += run.len
    const last = pieces[pieces.length - 1]
    if (last && last.styleId === styleId) last.end = at
    else pieces.push({ styleId, end: at })
  }
  return pieces
}

/**
 * The nested style rules an example paragraph shows: the character styles its opening has, one after the other, each as the delimiter
 * that ends it ("up to the colon"), else as a number of words, else as a number of letters. With several paragraphs the rules most of
 * them agree on are taken (a heading of one word and of three words both end at the colon). Pieces after the first that has no
 * character style are not part of it: the rules of a paragraph style follow one another without a gap.
 */
export function detectNestedRules(paragraphs: { text: string; runs: Run[] }[], maxRules = 3): NestedStyleRule[] {
  const tally = new Map<string, { rules: NestedStyleRule[]; count: number }>()
  for (const paragraph of paragraphs) {
    const rules: NestedStyleRule[] = []
    let cursor = 0
    for (const piece of leadingStyledPieces(paragraph.runs).slice(0, maxRules)) {
      const rule = ruleForPiece(paragraph.text, cursor, piece.end, piece.styleId)
      if (!rule) break
      const end = ruleEnd(paragraph.text, cursor, rule)
      if (end === null) break
      rules.push(rule)
      cursor = end
    }
    if (rules.length === 0) continue
    const key = JSON.stringify(rules)
    const known = tally.get(key)
    if (known) known.count++
    else tally.set(key, { rules, count: 1 })
  }
  let best: { rules: NestedStyleRule[]; count: number } | null = null
  for (const entry of tally.values()) if (!best || entry.count > best.count) best = entry
  return best ? best.rules : []
}
