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
