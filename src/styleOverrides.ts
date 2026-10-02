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

/** the paragraph look actually in effect at `index`: its own overrides, falling back to the story's */
function actualLayout(head: TextFrame, index: number): Record<(typeof LAYOUT_KEYS)[number], unknown> {
  const own = head.paragraphStylePatches?.[index]
  return {
    leading: own?.leading ?? head.leading,
    align: own?.align ?? head.align,
    spaceBefore: head.paraSpaceBefore?.[index] ?? own?.spaceBefore ?? head.spaceBefore,
    spaceAfter: head.paraSpaceAfter?.[index] ?? own?.spaceAfter ?? head.spaceAfter,
    indentLeft: own?.indentLeft ?? head.indentLeft,
    indentRight: own?.indentRight ?? head.indentRight,
    firstLineIndent: own?.firstLineIndent ?? head.firstLineIndent,
  }
}

/** the runs actually covering a paragraph, trimmed to it (its closing "\n" dropped: it carries the look of the text before it) */
function paragraphRuns(head: TextFrame, index: number) {
  const [start, end] = paragraphRange(head.text, index)
  const out: { len: number; style: Record<string, unknown> }[] = []
  let pos = 0
  for (const run of normalizeRuns(head.text, head.runs, head)) {
    const from = Math.max(pos, start)
    const to = Math.min(pos + run.len, end)
    pos += run.len
    if (to <= from) continue
    if (to - from === 1 && head.text[from] === '\n') continue
    out.push({ len: to - from, style: Object.fromEntries(CHAR_KEYS.map((key) => [key, run.style[key]])) })
  }
  return out
}

/**
 * How a paragraph deviates from a paragraph style (its resolved look): what the text carries that the style does not
 * say - the "+" mark a style panel shows in professional layout tools. Only what the style sets is compared (plus weight / italic / tracking,
 * where "nothing" means plain), and only what the paragraph actually has. The result is a style patch of the differing
 * values, ready to become a new style based on this one.
 */
export function paragraphOverrides(head: TextFrame, index: number, style: Look): Look {
  const out: Record<string, unknown> = {}
  for (const run of paragraphRuns(head, index)) {
    for (const key of CHAR_KEYS) {
      if (key in out) continue
      const expected = style[key] ?? CHAR_PLAIN[key]
      const actual = run.style[key]
      if (expected !== undefined && actual !== undefined && !same(actual, expected)) out[key] = actual
    }
  }
  const actual = actualLayout(head, index)
  for (const key of LAYOUT_KEYS) {
    const expected = style[key]
    if (expected !== undefined && actual[key] !== undefined && !same(actual[key], expected)) out[key] = actual[key]
  }
  return out as Look
}
