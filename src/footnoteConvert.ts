/**
 * The footnote converter (a script of the InDesign days, "ממיר הערות שוליים", brought into the program): notes written inside the
 * text in brackets become real footnotes, and footnotes become notes in brackets again. Pure functions on a story; Workspace.tsx
 * gives them the stories, the selection and the one undo step.
 */
import { FOOTNOTE_MARKER, type FootnoteItem, type ParagraphStyleRecord, type Run, type TextFrame } from './document'
import { mergeRuns, normalizeRuns } from './story'
import { styleIdOf } from './styleApply'

/** the kinds of bracket a note can be written in, in the order the converter offers them */
export const NOTE_BRACKETS = [
  { label: '( עגולים )', open: '(', close: ')', pattern: '\\((.+?)\\)' },
  { label: '[ מרובעים ]', open: '[', close: ']', pattern: '\\[(.+?)\\]' },
  { label: '([ משולבים ])', open: '([', close: '])', pattern: '\\(\\[(.+?)\\]\\)' },
] as const

export type NoteBracket = (typeof NOTE_BRACKETS)[number]

/** "הומרה הערה אחת" / "הומרו 3 הערות" */
export const convertedText = (count: number) => (count === 1 ? 'הומרה הערה אחת' : `הומרו ${count} הערות`)

/** the part of a story to work on, [from, to); none means the whole story */
export type NoteRange = { from: number; to: number } | null

export interface ConvertResult {
  frame: TextFrame
  /** how many notes were converted */
  count: number
}

/** one stretch of the story that is replaced by other text */
interface Edit {
  start: number
  end: number
  replacement: string
}

/**
 * The story of `frame` with the given stretches replaced, in one pass over the text (a story of a book has thousands of notes: one
 * pass for each of them would take seconds). The replacement takes the style of the character before it, as typing there does.
 * `edits` are in order and apart; they hold no paragraph break, so the per-paragraph lists of the story stay as they are. Footnotes
 * whose reference is inside a replaced stretch are gone, the others follow their reference, and `added` are new footnotes, each
 * at the start of the stretch (`at`) it comes from.
 */
function rewriteStory(frame: TextFrame, edits: Edit[], added: { note: FootnoteItem; at: number }[] = []): TextFrame {
  const text = frame.text
  const runs = normalizeRuns(text, frame.runs, frame)
  const parts: string[] = []
  const out: Run[] = []
  let runIndex = 0
  let inRun = 0
  let lastStyle = runs[0]?.style ?? frame
  let position = 0
  /** takes the next `count` characters of the story; `keep` says whether they stay in it */
  const take = (count: number, keep: boolean) => {
    while (count > 0 && runIndex < runs.length) {
      const run = runs[runIndex]
      const here = Math.min(count, run.len - inRun)
      if (keep) out.push({ len: here, style: run.style })
      lastStyle = run.style
      inRun += here
      count -= here
      if (inRun >= run.len) {
        runIndex++
        inRun = 0
      }
    }
  }
  /** how far the characters after each edit moved: the length that is added up to that edit */
  const moved: number[] = []
  let delta = 0
  for (const edit of edits) {
    parts.push(text.slice(position, edit.start))
    take(edit.start - position, true)
    parts.push(edit.replacement)
    if (edit.replacement) out.push({ len: edit.replacement.length, style: lastStyle as Run['style'] })
    take(edit.end - edit.start, false)
    position = edit.end
    delta += edit.replacement.length - (edit.end - edit.start)
    moved.push(delta)
  }
  parts.push(text.slice(position))
  take(text.length - position, true)

  // where a reference of the old text is now: in front of the edits it does not move, after them it moves by what they added
  const placed = (offset: number): number | null => {
    let low = 0
    let high = edits.length
    // the number of edits that end at or before the offset
    while (low < high) {
      const middle = (low + high) >> 1
      if (edits[middle].end <= offset) low = middle + 1
      else high = middle
    }
    if (low < edits.length && edits[low].start <= offset) return null // inside an edit
    return offset + (low > 0 ? moved[low - 1] : 0)
  }
  const kept: FootnoteItem[] = []
  for (const note of frame.footnotes ?? []) {
    const anchor = placed(note.anchor)
    if (anchor !== null) kept.push({ ...note, anchor })
  }
  // each new footnote comes from the edit of the same place: its reference is where that edit's replacement starts
  added.forEach(({ note, at }, index) => kept.push({ ...note, anchor: at + (index > 0 ? moved[index - 1] : 0) }))
  kept.sort((a, b) => a.anchor - b.anchor)
  const { footnotes: _old, ...rest } = frame
  return { ...rest, text: parts.join(''), runs: mergeRuns(out), ...(kept.length > 0 ? { footnotes: kept } : {}) }
}

/**
 * The story of `frame` with every note in brackets turned into a footnote: the brackets and what is in them leave the text, a
 * footnote reference stands in their place, and the footnote has the text that was in the brackets and the paragraph style
 * (`paragraphStyleId`) the converter was told. As in InDesign, the bracketed text is taken as plain text, so the footnote
 * looks like footnotes do. A bracket that holds a footnote already, or nothing but spaces, is left as it is.
 */
export function inlineNotesToFootnotes(
  frame: TextFrame,
  bracket: NoteBracket,
  options: {
    paragraphStyleId?: string
    range?: NoteRange
    newId: () => string
    /** only the notes in paragraphs of this style (`styles` are the document's paragraph styles, to tell the style of a paragraph) */
    onlyInStyleId?: string
    styles?: ParagraphStyleRecord[]
  },
): ConvertResult {
  const found = new RegExp(bracket.pattern, 'g')
  const edits: Edit[] = []
  const added: { note: FootnoteItem; at: number }[] = []
  // where the paragraphs of the story begin, to tell the paragraph of a note without counting from the start every time
  const paragraphStarts: number[] = [0]
  if (options.onlyInStyleId) for (let at = frame.text.indexOf('\n'); at >= 0; at = frame.text.indexOf('\n', at + 1)) paragraphStarts.push(at + 1)
  const paragraphOf = (offset: number) => {
    let low = 0
    let high = paragraphStarts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (paragraphStarts[middle] <= offset) low = middle
      else high = middle - 1
    }
    return low
  }
  for (const match of frame.text.matchAll(found)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const content = match[1]
    if (options.range && (start < options.range.from || end > options.range.to)) continue
    if (match[0].includes(FOOTNOTE_MARKER) || !content.trim()) continue
    if (options.onlyInStyleId && styleIdOf(options.styles ?? [], frame, paragraphOf(start)) !== options.onlyInStyleId) continue
    edits.push({ start, end, replacement: FOOTNOTE_MARKER })
    added.push({ at: start, note: { id: options.newId(), anchor: 0, content, ...(options.paragraphStyleId ? { paragraphStyleId: options.paragraphStyleId } : {}) } })
  }
  if (edits.length === 0) return { frame, count: 0 }
  return { frame: rewriteStory(frame, edits, added), count: edits.length }
}

/** a footnote's text as it goes into the line: the ends trimmed, and a paragraph break inside it a space */
const inlineText = (content: string) => content.replace(/^[\s ]+|[\s ]+$/g, '').replace(/\s*\n+\s*/g, ' ')

/**
 * The story of `frame` with every footnote turned into a note in brackets: its reference is replaced by a space and the footnote's
 * text in the brackets, and the footnote is gone. (The text is plain, as in InDesign: it takes the look of the text around it.)
 */
export function footnotesToInlineNotes(
  frame: TextFrame,
  bracket: NoteBracket,
  /** `onlyStyleId`: only the footnotes in this paragraph style (`defaultStyleId` is the style of the ones that have none of their own) */
  options: { range?: NoteRange; onlyStyleId?: string; defaultStyleId?: string } = {},
): ConvertResult {
  const edits: Edit[] = []
  for (const note of frame.footnotes ?? []) {
    if (frame.text[note.anchor] !== FOOTNOTE_MARKER) continue
    if (options.range && (note.anchor < options.range.from || note.anchor + 1 > options.range.to)) continue
    if (options.onlyStyleId && (note.paragraphStyleId ?? options.defaultStyleId) !== options.onlyStyleId) continue
    edits.push({ start: note.anchor, end: note.anchor + 1, replacement: ` ${bracket.open}${inlineText(note.content)}${bracket.close}` })
  }
  if (edits.length === 0) return { frame, count: 0 }
  edits.sort((a, b) => a.start - b.start)
  return { frame: rewriteStory(frame, edits), count: edits.length }
}
