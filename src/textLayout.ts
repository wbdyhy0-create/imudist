import { LINE_HEIGHT, type TextFrame, type TextStyle } from './document'
import { chainOf, styleOf } from './frames'

/** What one frame shows of its story. */
export interface FrameFlow {
  headId: string
  prevId: string | null
  /** style of the whole story (taken from its first frame) */
  style: TextStyle
  story: string
  /** [start, end) of this frame's share of `story`; the shares of a chain are contiguous */
  start: number
  end: number
  slice: string
  /** true on the last frame of a story when some text does not fit anywhere */
  overflow: boolean
}

let measurer: HTMLDivElement | null = null

/** A hidden element laid out exactly like a frame's text, used to find how much text fits. */
function getMeasurer(): HTMLDivElement {
  if (!measurer) {
    const m = document.createElement('div')
    m.dir = 'rtl'
    m.setAttribute('aria-hidden', 'true')
    Object.assign(m.style, {
      position: 'absolute',
      left: '-100000px',
      top: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      textRendering: 'geometricPrecision',
      lineHeight: String(LINE_HEIGHT),
    })
    document.body.appendChild(m)
    measurer = m
  }
  return measurer
}

const isSpace = (c: string) => /\s/.test(c)

/** End index of the largest part of `story` starting at `start` that fits into the frame's height. */
function fitEnd(m: HTMLDivElement, story: string, start: number, f: TextFrame): number {
  const len = story.length
  if (start >= len) return len
  m.style.width = `${f.w}px`
  const fits = (end: number) => {
    m.textContent = story.slice(start, end)
    return m.getBoundingClientRect().height <= f.h + 0.5
  }
  if (fits(len)) return len

  let lo = start // fits (empty)
  let hi = len // does not fit
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (fits(mid)) lo = mid
    else hi = mid
  }
  let end = lo
  if (end > start) {
    if (isSpace(story[end])) end += 1 // the space / line break stays at the end of this frame
    else if (!isSpace(story[end - 1])) {
      // avoid splitting a word: go back to the last space, unless the word is longer than the whole part
      for (let k = end - 1; k > start; k--) {
        if (isSpace(story[k])) {
          end = k + 1
          break
        }
      }
    }
  }
  return end
}

/** Distribute every story's text over its frames. Keyed by frame id. */
export function flowFrames(frames: TextFrame[]): Map<string, FrameFlow> {
  const result = new Map<string, FrameFlow>()
  const hasPrev = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))

  for (const head of frames) {
    if (hasPrev.has(head.id)) continue
    const chain = chainOf(frames, head.id)
    const style = styleOf(head)
    const story = head.text

    const m = getMeasurer()
    m.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
    m.style.fontSize = `${style.fontSize}px`
    m.style.fontWeight = style.bold ? '700' : '400'
    m.style.fontStyle = style.italic ? 'italic' : 'normal'

    let start = 0
    chain.forEach((f, i) => {
      const end = fitEnd(m, story, start, f)
      result.set(f.id, {
        headId: head.id,
        prevId: i > 0 ? chain[i - 1].id : null,
        style,
        story,
        start,
        end,
        slice: story.slice(start, end),
        overflow: i === chain.length - 1 && end < story.length,
      })
      start = end
    })
  }
  return result
}
