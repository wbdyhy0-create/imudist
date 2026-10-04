/**
 * "A window in the text" (טיפוגרפיה > יצירת חלון בטקסט): the opening word(s) of a paragraph are set larger, and the
 * paragraph's second line starts further in, by exactly the width of those words - which leaves a window under them.
 * The window lives in the paragraph's layout patch as `windowIndent` (points); the text itself is never touched, so
 * editing, the thread of frames and the exported PDF all see the same lines.
 */

export interface WindowTextOptions {
  /** which paragraphs: only the ones in this paragraph style */
  styleId: string
  scope: 'document' | 'selection'
  /** how many opening words the window is as wide as (1-4) */
  words: number
  /** paragraphs with fewer lines than this are left without a window (3 or 4) */
  minLines: number
  /** a style whose character look (font, size, weight...) is applied to the opening words first; '' for none */
  openingStyleId: string
}

export const WINDOW_WORDS = [1, 2, 3, 4]
export const WINDOW_MIN_LINES = [3, 4]

/** an opening word that is wider than this share of the line leaves no room for a second line worth reading */
export const WINDOW_MAX_SHARE = 0.8

/**
 * Where the opening words of the paragraph [from, to) of `text` end: after the `words`-th word (`end`). `start` skips
 * leading white space; `next` is where the word after them begins (-1 when there is none) - the second line of the
 * window has to start right under it. Null for a paragraph with nothing to put a window under.
 */
export function openingRange(text: string, from: number, to: number, words: number): { start: number; end: number; next: number } | null {
  let cursor = from
  while (cursor < to && /\s/.test(text[cursor])) cursor++
  const start = cursor
  let end = start
  for (let word = 0; word < words; word++) {
    while (cursor < to && /\s/.test(text[cursor])) cursor++
    if (cursor >= to) break
    while (cursor < to && !/\s/.test(text[cursor])) cursor++
    end = cursor
  }
  if (end <= start) return null
  let next = end
  while (next < to && /\s/.test(text[next])) next++
  return { start, end, next: next < to ? next : -1 }
}

const STORAGE_KEY = 'imudist.windowText.v1'

export const DEFAULT_WINDOW_OPTIONS: WindowTextOptions = { styleId: '', scope: 'document', words: 1, minLines: 3, openingStyleId: '' }

/** the options used last time (a per-user convenience: nothing breaks when storage is unavailable) */
export function loadWindowOptions(): Partial<WindowTextOptions> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return {}
    const out: Partial<WindowTextOptions> = {}
    if (typeof raw.styleId === 'string') out.styleId = raw.styleId
    if (raw.scope === 'document' || raw.scope === 'selection') out.scope = raw.scope
    if (WINDOW_WORDS.includes(raw.words)) out.words = raw.words
    if (WINDOW_MIN_LINES.includes(raw.minLines)) out.minLines = raw.minLines
    if (typeof raw.openingStyleId === 'string') out.openingStyleId = raw.openingStyleId
    return out
  } catch {
    return {}
  }
}

export function saveWindowOptions(options: WindowTextOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // no storage: the options simply start from the defaults next time
  }
}
