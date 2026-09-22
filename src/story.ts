import type { CharStyle, Run } from './document'

/**
 * Pure helpers for a story's formatted text. A story is a string plus `runs`: consecutive pieces that share a
 * character style. All offsets are character offsets into the whole story.
 */

export const charStyleOf = (s: CharStyle): CharStyle => ({
  fontFamily: s.fontFamily,
  fontSize: s.fontSize,
  weight: s.weight,
  italic: s.italic,
  tracking: s.tracking,
})

const sameStyle = (a: CharStyle, b: CharStyle) =>
  a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.weight === b.weight && a.italic === b.italic && a.tracking === b.tracking

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
