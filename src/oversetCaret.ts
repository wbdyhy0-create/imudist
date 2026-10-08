/**
 * Typing on after the last line a frame holds: the text goes on in the story, where no frame shows it. The editor of a frame can
 * only show a caret in what the frame shows, so the real caret (an offset of the story, kept by the workspace) is shown at the end
 * of what the frame shows, and what the editor says about the caret and about edits is only about that place.
 */

interface Span {
  start: number
  end: number
}
interface Selection {
  a: number
  b: number
}

/**
 * Where in the story an edit reported by a frame's editor lands. `from` and `to` are offsets inside the frame's text.
 * A selection of the story that reaches beyond the frame (Ctrl+A, a drag across frames) is what the edit replaces; a caret
 * that is in text no frame shows is where the edit is made, the edit being measured from the end of what the frame shows.
 */
export function editRangeInStory(frame: Span, from: number, to: number, selection: Selection | null, caretIsBeyond: boolean): Selection {
  const a = frame.start + from
  const b = frame.start + to
  if (selection && (selection.a < frame.start || selection.b > frame.end)) {
    if (selection.a === selection.b && selection.a > frame.end && caretIsBeyond && to === frame.end - frame.start) {
      const shift = selection.a - frame.end
      return { a: a + shift, b: b + shift }
    }
    return { a: selection.a, b: selection.b }
  }
  return { a, b }
}

/**
 * Whether the selection an editor reports is only its own view of a selection that reaches beyond the frame (so the selection
 * that is kept stays): the part of the kept selection that is inside the frame, as the editor shows it, is what it reports.
 * A caret beyond the frame counts only while the workspace knows it was put there by typing on (`caretIsBeyond`): a click at the
 * end of what the frame shows is a caret there.
 */
export function reportIsViewOf(kept: Selection, frame: Span, a: number, b: number, caretIsBeyond: boolean): boolean {
  if (!(kept.a < frame.start || kept.b > frame.end)) return false
  if (kept.a === kept.b && !caretIsBeyond) return false
  const ownA = Math.min(Math.max(kept.a, frame.start), frame.end) - frame.start
  const ownB = Math.min(Math.max(kept.b, frame.start), frame.end) - frame.start
  return a === ownA && b === ownB
}
