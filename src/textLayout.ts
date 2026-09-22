import {
  defaultLeading,
  frameSpaceAfter,
  frameSpaceBefore,
  LINE_HEIGHT,
  paraGaps as paraGapsOf,
  paraLineHeightOf,
  wordSpacingPt,
  type ImageFrame,
  type Run,
  type TextFrame,
  type TextStyle,
} from './document'
import { chainOf, insetBox, styleOf } from './frames'
import { buildRunNodes, buildWrapFloats, type RunNodeOpts } from './richtext'
import { atParaStart, normalizeRuns, paraIndexAt, sliceRuns } from './story'
import { floatsFor, floatsKey, type WrapFloat } from './wrap'

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
  /** the gap after each "\n" of the WHOLE story (document.ts's `paraGaps`); `startParaIndex` is where `slice` begins in it */
  paraGaps: (number | undefined)[]
  startParaIndex: number
  /** true when `slice`'s first character is itself the first character of a paragraph (the story's own start, or
   *  right after a "\n") — as opposed to a wrapped continuation of the previous frame's last (unfinished) paragraph */
  atParaStart: boolean
  /** resolved space above the story's first line / below its last (document.ts's frameSpaceBefore/frameSpaceAfter);
   *  the same for every frame of the chain — TextFrameView only actually applies whichever one is itself first/last */
  spaceBeforeFirst: number
  spaceAfterLast: number
}

let measurer: HTMLDivElement | null = null

/**
 * A hidden element laid out exactly like a frame's text, used to find how much text fits. The text goes into a plain
 * block inside it: the outer element (absolutely positioned) would grow to contain wrap floats, the inner one only
 * ends where the last line ends.
 */
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
      // matches .rich-editor / .text-frame-body: base direction is always RTL (dir='rtl' above), not guessed per-text
      textRendering: 'geometricPrecision',
    })
    m.appendChild(document.createElement('div'))
    document.body.appendChild(m)
    measurer = m
  }
  return measurer
}

function configure(m: HTMLDivElement, style: TextStyle) {
  m.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  m.style.fontSize = `${style.fontSize}px`
  m.style.lineHeight = `${style.leading ?? defaultLeading(style)}px`
  // must match TextFrameView.tsx's real render exactly: word-spacing changes where lines wrap, not just how they
  // look, so a justified paragraph whose extra spacing this measurer ignored would wrap shorter than it truly can,
  // under-reporting height and letting text quietly overflow the frame it was "measured" to fit
  m.style.wordSpacing = wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : ''
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
function fitEnd(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  box: { w: number; h: number },
  fontSize: number,
  floats: WrapFloat[],
  hint?: number,
  paraOpts?: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart'>,
): number {
  const len = story.length
  if (start >= len) return len
  m.style.width = `${box.w}px`
  const inner = m.firstElementChild as HTMLElement
  const fits = (end: number) => {
    inner.replaceChildren(...buildWrapFloats(floats, 1), buildRunNodes(story.slice(start, end), sliceRuns(runs, start, end), 1, paraOpts))
    return inner.getBoundingClientRect().height <= box.h + 0.5
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
    if (isSpace(story[end])) {
      // the space / line break stays at the end of this frame; a "\n" right at this boundary never carries its
      // own .para-gap height here — buildRunNodes (richtext.ts) only ever renders that gap when another paragraph
      // actually follows within the SAME call, which a trailing "\n" by definition never has
      end += 1
    } else if (!isSpace(story[end - 1])) {
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
export function fitStoryEnd(
  story: string,
  runs: Run[],
  style: TextStyle,
  start: number,
  box: { w: number; h: number },
  floats: WrapFloat[] = [],
  hint?: number,
): number {
  const m = getMeasurer()
  configure(m, style)
  // width-only inset (indentLeft/indentRight): this single-box helper doesn't know its place in a chain, so it
  // never applies spaceBefore — flowFrames (the authoritative, always-recomputed layout) does that. spaceAfter's
  // between-paragraph gaps are already baked into every "\n" via paraLineHeight below, so those come through fine.
  const inset = insetBox(box, style, 0, 0)
  return fitEnd(m, story, runs, start, inset, style.fontSize, floats, hint, {
    paraLineHeight: paraLineHeightOf(style),
    firstLineIndent: style.firstLineIndent,
    startParaIndex: paraIndexAt(story, start),
    atParaStart: atParaStart(story, start),
  })
}

/** Results per story, so an unchanged story is not measured again (e.g. while another frame is being dragged). */
const cache = new Map<string, { text: string; runs: Run[]; sig: string; flows: FrameFlow[] }>()
/** last number of characters per frame, the starting point of the next search */
const lengths = new Map<string, number>()

/** Distribute every story's text over its frames (keeping clear of wrapped pictures). Keyed by frame id. */
export function flowFrames(frames: TextFrame[], images: ImageFrame[] = []): Map<string, FrameFlow> {
  const result = new Map<string, FrameFlow>()
  const seen = new Set<string>()
  const hasPrev = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))

  for (const head of frames) {
    if (hasPrev.has(head.id)) continue
    seen.add(head.id)
    const chain = chainOf(frames, head.id)
    const style = styleOf(head)
    const story = head.text
    const floats = chain.map((f, i) => floatsFor(f, images, style, i === 0))
    // everything the layout depends on: default style (incl. paragraph spacing/indents), per-paragraph overrides,
    // and the id, size and wrap areas of every frame in the thread
    const sig =
      `${style.fontFamily}|${style.fontSize}|${style.weight}|${style.italic}|${style.tracking}|${style.align}|${style.leading}|` +
      `${style.wordSpacingMin}|${style.wordSpacingMax}|` +
      `${style.spaceBefore}|${style.spaceAfter}|${style.indentLeft}|${style.indentRight}|${style.firstLineIndent}|${style.secondLineIndent}|` +
      `${JSON.stringify(head.paraSpaceBefore)}|${JSON.stringify(head.paraSpaceAfter)}|` +
      chain.map((f, i) => `${f.id}:${f.w}:${f.h}:${floatsKey(floats[i])}`).join(',')

    const hit = cache.get(head.id)
    let flows: FrameFlow[]
    if (hit && hit.text === story && hit.runs === head.runs && hit.sig === sig) {
      flows = hit.flows
    } else {
      const runs = normalizeRuns(story, head.runs, style)
      const m = getMeasurer()
      configure(m, style)
      const gaps = paraGapsOf(style, head, story)
      const spaceBeforeFirst = frameSpaceBefore(style, head)
      const spaceAfterLast = frameSpaceAfter(style, head, story)
      flows = []
      let start = 0
      chain.forEach((f, i) => {
        const isFirst = i === 0
        const isLast = i === chain.length - 1
        const box = insetBox(f, style, isFirst ? spaceBeforeFirst : 0, isLast ? spaceAfterLast : 0)
        const startParaIndex = paraIndexAt(story, start)
        const atStart = atParaStart(story, start)
        const end = fitEnd(m, story, runs, start, box, style.fontSize, floats[i], lengths.get(f.id), {
          paraGaps: gaps,
          startParaIndex,
          firstLineIndent: style.firstLineIndent,
          atParaStart: atStart,
        })
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
          paraGaps: gaps,
          startParaIndex,
          atParaStart: atStart,
          spaceBeforeFirst,
          spaceAfterLast,
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
