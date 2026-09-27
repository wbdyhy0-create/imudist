import type { TextFrame } from './document'
import type { ParagraphStyleRecord } from './components/ParagraphStylesPanel'
import { normalizeRuns } from './story'

type Look = ParagraphStyleRecord['patch']

/** the character attributes a paragraph style can set, and what plain text has of them when a style says nothing */
const CHAR_KEYS = ['fontFamily', 'fontSize', 'weight', 'italic', 'color', 'tracking'] as const
const CHAR_PLAIN: Partial<Record<(typeof CHAR_KEYS)[number], number | boolean>> = { weight: 400, italic: false, tracking: 0 }
/** and the paragraph ones */
const LAYOUT_KEYS = ['leading', 'align', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent'] as const

const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.01 : a === b)

const paragraphRange = (text: string, index: number): [number, number] => {
  let start = 0
  for (let i = 0; i < index; i++) {
    const end = text.indexOf('\n', start)
    start = end < 0 ? text.length : end + 1
  }
  const end = text.indexOf('\n', start)
  return [start, end < 0 ? text.length : end + 1]
}

/**
 * How a paragraph deviates from a paragraph style (its resolved look): what the text carries that the style does not
 * say - the "+" of an InDesign style panel. Only what the style sets is compared (plus weight / italic / tracking,
 * where "nothing" means plain), and only what the paragraph actually has. The result is a style patch of the differing
 * values, ready to become a new style based on this one.
 */
export function paragraphOverrides(head: TextFrame, index: number, style: Look): Look {
  const out: Record<string, unknown> = {}
  const [start, end] = paragraphRange(head.text, index)
  // the character look: the first run in the paragraph that differs, per attribute
  let pos = 0
  for (const run of normalizeRuns(head.text, head.runs, head)) {
    const from = Math.max(pos, start)
    const to = Math.min(pos + run.len, end)
    pos += run.len
    if (to <= from) continue
    if (to - from === 1 && head.text[from] === '\n') continue // the paragraph break carries the look of the text before it
    for (const key of CHAR_KEYS) {
      if (key in out) continue
      const expected = style[key] ?? CHAR_PLAIN[key]
      const actual = run.style[key]
      if (expected !== undefined && actual !== undefined && !same(actual, expected)) out[key] = actual
    }
  }
  // the paragraph look: what its own overrides, or the story's, give it
  const own = head.paragraphStylePatches?.[index]
  const actual: Record<(typeof LAYOUT_KEYS)[number], unknown> = {
    leading: own?.leading ?? head.leading,
    align: own?.align ?? head.align,
    spaceBefore: head.paraSpaceBefore?.[index] ?? own?.spaceBefore ?? head.spaceBefore,
    spaceAfter: head.paraSpaceAfter?.[index] ?? own?.spaceAfter ?? head.spaceAfter,
    indentLeft: own?.indentLeft ?? head.indentLeft,
    indentRight: own?.indentRight ?? head.indentRight,
    firstLineIndent: own?.firstLineIndent ?? head.firstLineIndent,
  }
  for (const key of LAYOUT_KEYS) {
    const expected = style[key]
    if (expected !== undefined && actual[key] !== undefined && !same(actual[key], expected)) out[key] = actual[key]
  }
  return out as Look
}
