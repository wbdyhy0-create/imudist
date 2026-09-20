import { LINE_HEIGHT, type Run, type TextFrame, type TextStyle } from './document'
import { chainOf, styleOf } from './frames'
import { buildRunNodes } from './richtext'
import { normalizeRuns, sliceRuns } from './story'

/** What one frame shows of its story. */
export interface FrameFlow {
  headId: string
  prevId: string | null
  /** default style + alignment of the whole story (taken from its first frame) */
  style: TextStyle
  story: string
  /** [start, end) of this frame's share of `story`; the shares of a chain are contiguous */
  start: number
  end: number
  slice: string
  /** style runs of the slice (they cover exactly `slice`) */
  runs: Run[]
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
      unicodeBidi: 'plaintext',
      textRendering: 'geometricPrecision',
      lineHeight: String(LINE_HEIGHT),
    })
    document.body.appendChild(m)
    measurer = m
  }
  return measurer
}

function configure(m: HTMLDivElement, style: TextStyle) {
  m.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  m.style.fontSize = `${style.fontSize}px`
}

const isSpace = (c: string) => /\s/.test(c)

/** Rough number of characters a box holds (an average glyph is about half an em wide). */
const capacityOf = (box: { w: number; h: number }, fontSize: number) =>
  Math.max(8, Math.floor((box.w * box.h) / (fontSize * fontSize * 0.55 * LINE_HEIGHT)))

/**
 * End index of the largest part of `story` starting at `start` that fits into the box.
 * `hint` is a guess for how many characters fit (e.g. from the last layout). The search starts there and widens,
 * so only text about the size of one frame is ever laid out — not the rest of a long story.
 */
function fitEnd(m: HTMLDivElement, story: string, runs: Run[], start: number, box: { w: number; h: number }, fontSize: number, hint?: number): number {
  const len = story.length
  if (start >= len) return len
  m.style.width = `${box.w}px`
  const fits = (end: number) => {
    m.replaceChildren(buildRunNodes(story.slice(start, end), sliceRuns(runs, start, end), 1))
    return m.getBoundingClientRect().height <= box.h + 0.5
  }

  let lo = start // fits (empty)
  let hi = len + 1 // known not to fit (nothing beyond the end can)
  const probe = (end: number) => {
    const ok = fits(end)
    if (ok) lo = end
    else hi = end
    return ok
  }

  const guess = Math.min(len, start + Math.max(1, hint ?? Math.round(capacityOf(box, fontSize) * 1.05)))
  if (probe(guess)) {
    let step = Math.max(8, guess - start)
    while (lo < len) {
      if (!probe(Math.min(len, lo + step))) break
      step *= 2
    }
    if (lo >= len) return len
  }
  while (hi - lo > 1) probe((lo + hi) >> 1)

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

/** How much of `story` (from `start`) fits into a box of the given size, with the story's default style. */
export function fitStoryEnd(story: string, runs: Run[], style: TextStyle, start: number, box: { w: number; h: number }, hint?: number): number {
  const m = getMeasurer()
  configure(m, style)
  return fitEnd(m, story, runs, start, box, style.fontSize, hint)
}

/** Results per story, so an unchanged story is not measured again (e.g. while another frame is being dragged). */
const cache = new Map<string, { text: string; runs: Run[]; sig: string; flows: FrameFlow[] }>()
/** last number of characters per frame, the starting point of the next search */
const lengths = new Map<string, number>()

/** Distribute every story's text over its frames. Keyed by frame id. */
export function flowFrames(frames: TextFrame[]): Map<string, FrameFlow> {
  const result = new Map<string, FrameFlow>()
  const seen = new Set<string>()
  const hasPrev = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))

  for (const head of frames) {
    if (hasPrev.has(head.id)) continue
    seen.add(head.id)
    const chain = chainOf(frames, head.id)
    const style = styleOf(head)
    const story = head.text
    // everything the layout depends on: default style, and the id and size of every frame in the thread
    const sig = `${style.fontFamily}|${style.fontSize}|${style.weight}|${style.italic}|${style.align}|` + chain.map((f) => `${f.id}:${f.w}:${f.h}`).join(',')

    const hit = cache.get(head.id)
    let flows: FrameFlow[]
    if (hit && hit.text === story && hit.runs === head.runs && hit.sig === sig) {
      flows = hit.flows
    } else {
      const runs = normalizeRuns(story, head.runs, style)
      const m = getMeasurer()
      configure(m, style)
      flows = []
      let start = 0
      chain.forEach((f, i) => {
        const end = fitEnd(m, story, runs, start, f, style.fontSize, lengths.get(f.id))
        lengths.set(f.id, Math.max(1, end - start))
        flows.push({
          headId: head.id,
          prevId: i > 0 ? chain[i - 1].id : null,
          style,
          story,
          start,
          end,
          slice: story.slice(start, end),
          runs: sliceRuns(runs, start, end),
          overflow: i === chain.length - 1 && end < story.length,
        })
        start = end
      })
      cache.set(head.id, { text: story, runs: head.runs, sig, flows })
    }
    chain.forEach((f, i) => result.set(f.id, flows[i]))
  }

  for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id)
  return result
}
