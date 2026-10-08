import type { TextFrame } from './document'
import type { FrameFlow } from './textLayout'

type Share = Pick<FrameFlow, 'style' | 'slice' | 'runs' | 'start' | 'end' | 'startParaIndex'>

/** the lists a story keeps by paragraph: entry i belongs to paragraph i of the whole story */
const PARAGRAPH_LISTS = ['paragraphStyleIds', 'paragraphStyleNames', 'paragraphStylePatches', 'paraSpaceBefore', 'paraSpaceAfter', 'paraKeepFirstLines', 'paraKeepLastLines', 'paraKeepWithNext'] as const

/**
 * A text frame as a story of its own: what it shows of its story (`flow`) as its whole text. The things a story keeps by
 * paragraph (styles, spacing) start again at the frame's first paragraph, and the things it keeps by position in the text
 * (footnotes, table-of-contents entries) are those inside the frame's share, moved to where they are in it. Without this, the
 * copy of a frame in the middle of a thread would take the styles of the story's first paragraphs and footnotes that are not
 * in its text.
 */
export function frameAsOwnStory(frame: TextFrame, flow: Share): TextFrame {
  const own: TextFrame = { ...frame, ...flow.style, text: flow.slice, runs: flow.runs, next: null }
  const inside = (offset: number) => offset >= flow.start && offset < flow.end
  const record = own as unknown as Record<string, unknown>
  if (flow.startParaIndex > 0) {
    for (const key of PARAGRAPH_LISTS) {
      const list = frame[key]
      if (Array.isArray(list)) record[key] = list.slice(flow.startParaIndex)
    }
    // the style of the story's first paragraph is not the style of this frame's first
    delete own.paragraphStyleId
  }
  if (frame.footnotes) {
    const kept = frame.footnotes.filter((note) => inside(note.anchor)).map((note) => ({ ...note, anchor: note.anchor - flow.start }))
    if (kept.length) own.footnotes = kept
    else delete own.footnotes
  }
  if (frame.tocPageReferences) {
    const kept = frame.tocPageReferences.filter((entry) => inside(entry.offset)).map((entry) => ({ ...entry, offset: entry.offset - flow.start }))
    if (kept.length) own.tocPageReferences = kept
    else delete own.tocPageReferences
  }
  if (frame.tocFootnoteReferences) {
    const kept = frame.tocFootnoteReferences.filter((entry) => inside(entry.offset)).map((entry) => ({ ...entry, offset: entry.offset - flow.start }))
    if (kept.length) own.tocFootnoteReferences = kept
    else delete own.tocFootnoteReferences
  }
  return own
}
