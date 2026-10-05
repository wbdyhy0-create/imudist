/**
 * Find and replace over the text of a whole document (עריכה > חיפוש והחלפה): finding every place a character, a
 * sign, a word or any pattern occurs - across every story, so across every page of a thread - and replacing or
 * deleting all of them in one go. Pure functions on stories; Workspace.tsx does the navigation and the one undo step.
 */
import { FOOTNOTE_MARKER, type CharStyle, type FootnoteItem, type Run, type TextFrame } from './document'
import { editStory, normalizeRuns, spliceParagraphStyles, spliceParaOverrides } from './story'

/**
 * plain: the text exactly as typed. special: the same, but `\n` is a paragraph break, `\t` a tab and `\\` a backslash.
 * regex: a regular expression (`$1`, `$&` in the replacement stand for what matched; `\n` and `\t` work there too).
 */
export type FindMode = 'plain' | 'special' | 'regex'

export interface FindOptions {
  find: string
  replace: string
  mode: FindMode
  matchCase: boolean
  /** only where the match is not part of a longer word (Hebrew letters, vowel points and digits count as word) */
  wholeWord: boolean
  /** Hebrew vowel points and cantillation marks are not looked at, in the text or in the pattern */
  ignoreNiqqud: boolean
}

export const DEFAULT_FIND_OPTIONS: FindOptions = { find: '', replace: '', mode: 'plain', matchCase: false, wholeWord: false, ignoreNiqqud: false }

/** one place the pattern matched: [start, end) of the text, and what it is to be replaced with */
export interface TextMatch {
  start: number
  end: number
  replacement: string
}

export type Compiled = { ok: true; regex: RegExp; replacement: (match: RegExpExecArray) => string; ignoreNiqqud: boolean } | { ok: false; error: string }

const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/
const stripNiqqud = (text: string) => text.replace(new RegExp(NIQQUD.source, 'g'), '')
/** the private-use characters the program keeps its own markers in (footnote references, page numbers, ...): never matched */
const MARKERS = /[-]/

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const unescapeSpecial = (text: string) => text.replace(/\\([nt\\])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'))

/** a replacement template of regex mode: `$&`, `$1`..`$99`, `$<name>`, `$$`, and `\n`, `\t`, `\\` */
function expand(template: string, match: RegExpExecArray): string {
  let out = ''
  for (let i = 0; i < template.length; i++) {
    const c = template[i]
    if (c === '\\' && /[nt\\]/.test(template[i + 1] ?? '')) {
      const e = template[++i]
      out += e === 'n' ? '\n' : e === 't' ? '\t' : '\\'
    } else if (c === '$') {
      const next = template[i + 1]
      if (next === '$') {
        out += '$'
        i++
      } else if (next === '&') {
        out += match[0]
        i++
      } else if (next === '<') {
        const close = template.indexOf('>', i + 2)
        const name = close < 0 ? '' : template.slice(i + 2, close)
        if (close > 0 && match.groups && name in match.groups) {
          out += match.groups[name] ?? ''
          i = close
        } else out += c
      } else if (next && /\d/.test(next)) {
        const two = template[i + 2] && /\d/.test(template[i + 2]) && Number(next + template[i + 2]) < match.length ? next + template[i + 2] : next
        const index = Number(two)
        if (index >= 1 && index < match.length) {
          out += match[index] ?? ''
          i += two.length
        } else out += c
      } else out += c
    } else out += c
  }
  return out
}

/** The pattern of `options` as a regular expression, or why it is not one; null when there is nothing to look for. */
export function compilePattern(options: FindOptions): Compiled | null {
  if (!options.find) return null
  const find = options.ignoreNiqqud && options.mode !== 'regex' ? stripNiqqud(options.find) : options.find
  if (!find) return null
  const literal = options.mode === 'special' ? unescapeSpecial(find) : find
  const body = options.mode === 'regex' ? find : escapeRegExp(literal)
  const word = '[\\p{L}\\p{N}\\p{M}]'
  const source = options.wholeWord ? `(?<!${word})(?:${body})(?!${word})` : body
  let regex: RegExp
  try {
    regex = new RegExp(source, `gu${options.matchCase ? '' : 'i'}${options.mode === 'regex' ? 'm' : ''}`)
  } catch {
    return { ok: false, error: 'ביטוי רגולרי לא תקין' }
  }
  const replacement =
    options.mode === 'regex'
      ? (match: RegExpExecArray) => expand(options.replace, match)
      : options.mode === 'special'
        ? (() => {
            const text = unescapeSpecial(options.replace)
            return () => text
          })()
        : () => options.replace
  return { ok: true, regex, replacement, ignoreNiqqud: options.ignoreNiqqud }
}

/**
 * Every match in `text`, in order. A match that would be empty is skipped, and so is one that touches a marker
 * character of the program itself (a footnote reference, a table-of-contents or page-number marker): replacing those
 * would break what they stand for.
 */
export function findMatches(text: string, compiled: Extract<Compiled, { ok: true }>): TextMatch[] {
  let haystack = text
  let map: number[] | null = null
  if (compiled.ignoreNiqqud && NIQQUD.test(text)) {
    // the text without its vowel points, and where each of its characters was
    map = []
    haystack = ''
    for (let i = 0; i < text.length; i++) {
      if (NIQQUD.test(text[i])) continue
      map.push(i)
      haystack += text[i]
    }
  }
  const out: TextMatch[] = []
  const { regex } = compiled
  regex.lastIndex = 0
  for (let match = regex.exec(haystack); match; match = regex.exec(haystack)) {
    if (match[0] === '') {
      regex.lastIndex++
      continue
    }
    let start = match.index
    let end = start + match[0].length
    if (map) {
      start = map[start]
      end = map[end - 1] + 1
      // the points that belong to the last letter go with it
      while (end < text.length && NIQQUD.test(text[end])) end++
    }
    if (MARKERS.test(text.slice(start, end))) continue
    out.push({ start, end, replacement: compiled.replacement(match) })
  }
  return out
}

/** the notes follow the reference marks of the text, in order (after an edit that may have taken marks away) */
export function alignFootnotesToMarkers(text: string, notes: FootnoteItem[]): FootnoteItem[] {
  const markers: number[] = []
  for (let index = 0; index < text.length; index++) if (text[index] === FOOTNOTE_MARKER) markers.push(index)
  return notes
    .slice()
    .sort((a, b) => a.anchor - b.anchor)
    .slice(0, markers.length)
    .map((note, index) => ({ ...note, anchor: markers[index] }))
}

/**
 * The story of `frame` (its head) with every match replaced. Back to front, so the offsets of the matches still to
 * come stay valid; each one is a real edit of the story - the runs, the per-paragraph lists (styles, overrides) and
 * the footnote anchors follow it exactly as they do when the same text is typed over by hand.
 */
export function replaceInStory(frame: TextFrame, matches: TextMatch[], options: { dropParagraphs?: number[] } = {}): TextFrame {
  if (matches.length === 0) return frame
  // paragraphs removed as a whole (the caller knows which: indexes in the text as it is now): their entries leave the
  // per-paragraph lists. An edit that removes a paragraph's break cannot say which of the two paragraphs it joins is
  // the one that goes - it keeps the first one's entry - so the lists are not left to follow the edits then.
  const drop = options.dropParagraphs ? new Set(options.dropParagraphs) : null
  let text = frame.text
  let runs = normalizeRuns(text, frame.runs, frame)
  let footnotes = frame.footnotes
  let lists: Pick<TextFrame, 'paragraphStyleIds' | 'paragraphStyleNames' | 'paragraphStylePatches'> = {
    paragraphStyleIds: frame.paragraphStyleIds,
    paragraphStyleNames: frame.paragraphStyleNames,
    paragraphStylePatches: frame.paragraphStylePatches,
  }
  let paraSpaceBefore = frame.paraSpaceBefore
  let paraSpaceAfter = frame.paraSpaceAfter
  let paraKeepFirstLines = frame.paraKeepFirstLines
  let paraKeepLastLines = frame.paraKeepLastLines
  let paraKeepWithNext = frame.paraKeepWithNext
  for (let k = matches.length - 1; k >= 0; k--) {
    const { start, end, replacement } = matches[k]
    const edited = editStory(text, runs, start, end, replacement, frame)
    const delta = replacement.length - (end - start)
    footnotes = footnotes?.flatMap((note) => (note.anchor >= start && note.anchor < end ? [] : [{ ...note, anchor: note.anchor >= end ? note.anchor + delta : note.anchor }]))
    if (!drop) {
      lists = { ...lists, ...spliceParagraphStyles(lists, text, start, end, replacement) }
      paraSpaceBefore = spliceParaOverrides(paraSpaceBefore, text, start, end, replacement)
      paraSpaceAfter = spliceParaOverrides(paraSpaceAfter, text, start, end, replacement)
      paraKeepFirstLines = spliceParaOverrides(paraKeepFirstLines, text, start, end, replacement)
      paraKeepLastLines = spliceParaOverrides(paraKeepLastLines, text, start, end, replacement)
      paraKeepWithNext = spliceParaOverrides(paraKeepWithNext, text, start, end, replacement)
    }
    text = edited.text
    runs = edited.runs
  }
  if (drop) {
    const without = <T,>(list: T[] | undefined) => list?.filter((_, i) => !drop.has(i))
    const overrides = (list: (number | null)[] | undefined) => {
      const kept = without(list)
      return kept?.some((value) => value !== null) ? kept : undefined
    }
    lists = { paragraphStyleIds: without(lists.paragraphStyleIds), paragraphStyleNames: without(lists.paragraphStyleNames), paragraphStylePatches: without(lists.paragraphStylePatches) }
    paraSpaceBefore = overrides(paraSpaceBefore)
    paraSpaceAfter = overrides(paraSpaceAfter)
    paraKeepFirstLines = overrides(paraKeepFirstLines)
    paraKeepLastLines = overrides(paraKeepLastLines)
    paraKeepWithNext = overrides(paraKeepWithNext)
  }
  return {
    ...frame,
    text,
    runs,
    ...lists,
    paraSpaceBefore,
    paraSpaceAfter,
    paraKeepFirstLines,
    paraKeepLastLines,
    paraKeepWithNext,
    ...(footnotes ? { footnotes: alignFootnotesToMarkers(text, footnotes) } : {}),
  }
}

/** a footnote's own text with every match replaced (`base` is the look it falls back to where it has no runs) */
export function replaceInNote(note: FootnoteItem, matches: TextMatch[], base: CharStyle): FootnoteItem {
  if (matches.length === 0) return note
  let text = note.content
  let runs: Run[] = normalizeRuns(text, note.runs, base)
  for (let k = matches.length - 1; k >= 0; k--) {
    const edited = editStory(text, runs, matches[k].start, matches[k].end, matches[k].replacement, base)
    text = edited.text
    runs = edited.runs
  }
  return { ...note, content: text, runs }
}

/** what was found in one story: in its text, and in the text of its footnotes */
export interface StoryHits {
  head: TextFrame
  matches: TextMatch[]
  notes: { note: FootnoteItem; matches: TextMatch[] }[]
}

/**
 * Every match in the given stories. A generated table of contents is left out (its text is made from the headings
 * and made again), and `range` - a selection - narrows the search to the matches wholly inside it.
 */
export function collectHits(heads: TextFrame[], compiled: Extract<Compiled, { ok: true }>, options: { footnotes: boolean; range?: { headId: string; a: number; b: number } }): StoryHits[] {
  const out: StoryHits[] = []
  for (const head of heads) {
    if (head.tocPageReferences?.length) continue
    if (options.range && head.id !== options.range.headId) continue
    const { range } = options
    const matches = findMatches(head.text, compiled).filter((match) => !range || (match.start >= range.a && match.end <= range.b))
    const notes = options.footnotes && !range
      ? (head.footnotes ?? []).flatMap((note) => {
          const found = findMatches(note.content, compiled)
          return found.length ? [{ note, matches: found }] : []
        })
      : []
    if (matches.length || notes.length) out.push({ head, matches, notes })
  }
  return out
}
