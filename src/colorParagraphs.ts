import type { TextFrame } from './document'
import { normalizeRuns } from './story'

/** a paragraph of a story that has text in a given colour (ניהול סגנונות > צבעים) */
export interface ColoredParagraph {
  frame: TextFrame
  index: number
  /** the paragraph's offsets in the story; `end` is after its line break */
  start: number
  end: number
}

/** a colour that text of the document has, and in how many paragraphs */
export interface ColorUse {
  color: string
  /** paragraphs whose whole text (spaces aside) is in this colour */
  whole: number
  /** paragraphs with at least some text in this colour (the whole ones included) */
  any: number
}

const NO_COLOR = '#000000'
const BLANK = /\s/

/**
 * The colours a story's text has, paragraph by paragraph: for each paragraph, colour -> how many of its characters
 * (spaces and line breaks not counted) are in it. A paragraph without letters has an empty map.
 */
export function paragraphColors(frame: TextFrame): { start: number; end: number; counts: Map<string, number> }[] {
  const text = frame.text
  const out: { start: number; end: number; counts: Map<string, number> }[] = []
  let counts = new Map<string, number>()
  let start = 0
  let at = 0
  const fallback = (frame.color || NO_COLOR).toLowerCase()
  for (const run of normalizeRuns(text, frame.runs, frame)) {
    const color = (run.style.color || fallback).toLowerCase()
    for (let i = at; i < at + run.len; i++) {
      const char = text[i]
      if (char === '\n') {
        out.push({ start, end: i + 1, counts })
        counts = new Map()
        start = i + 1
      } else if (!BLANK.test(char)) {
        counts.set(color, (counts.get(color) ?? 0) + 1)
      }
    }
    at += run.len
  }
  out.push({ start, end: text.length, counts })
  return out
}

/** every colour the text of the given stories has, the ones most used as whole paragraphs first */
export function textColorUses(heads: TextFrame[]): ColorUse[] {
  const uses = new Map<string, ColorUse>()
  for (const frame of heads) {
    if (!frame.text) continue
    for (const { counts } of paragraphColors(frame)) {
      for (const color of counts.keys()) {
        const use = uses.get(color) ?? { color, whole: 0, any: 0 }
        use.any++
        if (counts.size === 1) use.whole++
        uses.set(color, use)
      }
    }
  }
  return [...uses.values()].sort((a, b) => b.whole - a.whole || b.any - a.any || a.color.localeCompare(b.color))
}

/**
 * The paragraphs of the given stories that have text in `color`, story by story in reading order: with `partial` off
 * only those whose whole text is in it (a heading coloured by hand), with it on those that have any word in it.
 */
export function colorParagraphs(heads: TextFrame[], color: string, partial: boolean): ColoredParagraph[] {
  const wanted = color.toLowerCase()
  const out: ColoredParagraph[] = []
  for (const frame of heads) {
    if (!frame.text) continue
    paragraphColors(frame).forEach(({ start, end, counts }, index) => {
      if (!counts.has(wanted)) return
      if (partial || counts.size === 1) out.push({ frame, index, start, end })
    })
  }
  return out
}
