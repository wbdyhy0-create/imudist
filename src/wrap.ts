import { DEFAULT_WRAP_OFFSET, effectiveLeading, type ImageFrame, type TextStyle } from './document'
import type { Box } from './frames'

/** Text wrap: how a text frame is cut into the areas where text may go, around the pictures that repel it. */

/** A picture's exclusion zone (its box plus the wrap offset), in world points. */
export interface WrapObstacle {
  x: number
  y: number
  w: number
  h: number
  /** true = "jump": no text beside it, only above and below */
  jump: boolean
}

/** A free strip narrower than this is not used for text. */
export const MIN_CELL_W = 24

/** The pictures whose wrap affects a frame (those overlapping it), as exclusion zones. */
export function obstaclesFor(frame: Box, images: ImageFrame[]): WrapObstacle[] {
  const out: WrapObstacle[] = []
  for (const im of images) {
    if (!im.wrap || im.wrap === 'none') continue
    const off = im.wrapOffset ?? DEFAULT_WRAP_OFFSET
    const o: WrapObstacle = { x: im.x - off, y: im.y - off, w: im.w + 2 * off, h: im.h + 2 * off, jump: im.wrap === 'jump' }
    if (o.x < frame.x + frame.w && o.x + o.w > frame.x && o.y < frame.y + frame.h && o.y + o.h > frame.y) out.push(o)
  }
  return out
}

/**
 * The blocked areas of a frame's text, as at most two floats (one per side) that span the frame's whole height. Each
 * has a `shape-outside` polygon tracing the blocked part beside it, so the browser itself keeps the lines out of
 * it (the same DOM is used for measuring, showing and editing). Points are in points, relative to the float.
 */
export interface WrapFloat {
  side: 'left' | 'right'
  width: number
  height: number
  /** the outline of the blocked area, top to bottom */
  points: [number, number][]
}

/** A compact text form of floats, to tell whether a layout computed for them is still valid. */
export const floatsKey = (floats: WrapFloat[]) =>
  floats.map((f) => `${f.side[0]}${f.width}:${f.height}:${f.points.map((p) => p.join(',')).join(' ')}`).join(';')

/** The CSS `shape-outside` of a float at a zoom. */
export const shapeOf = (f: WrapFloat, scale: number) => `polygon(${f.points.map(([x, y]) => `${x * scale}px ${y * scale}px`).join(', ')})`

/** The floats that leave exactly the text cells of `cellsFor` free. */
export function wrapFloatsFor(frame: Box, images: ImageFrame[]): WrapFloat[] {
  const obstacles = obstaclesFor(frame, images)
  if (obstacles.length === 0) return []
  const cells = cellsFor(frame, obstacles)

  // every band of the frame, top to bottom: how much of it the left and right floats block
  const bands: { y0: number; y1: number; left: number; right: number }[] = []
  let y = 0
  const gap = (to: number) => {
    if (to - y > 0.01) bands.push({ y0: y, y1: to, left: frame.w, right: 0 }) // no text at all (a "jump" picture)
  }
  for (const c of cells) {
    gap(c.y)
    bands.push({ y0: c.y, y1: c.y + c.h, left: c.x, right: frame.w - c.x - c.w })
    y = c.y + c.h
  }
  gap(frame.h)

  const build = (side: 'left' | 'right'): WrapFloat | null => {
    const widths = bands.map((b) => b[side])
    const width = Math.max(0, ...widths)
    if (width < 0.01) return null
    // the polygon runs down the inner silhouette and back up the frame's edge
    const edge = side === 'left' ? 0 : width
    const inner = (b: number) => (side === 'left' ? b : width - b)
    const points: [number, number][] = [[edge, 0]]
    bands.forEach((b) => points.push([inner(b[side]), b.y0], [inner(b[side]), b.y1]))
    points.push([edge, frame.h])
    return { side, width, height: frame.h, points }
  }
  return [build('left'), build('right')].filter((f): f is WrapFloat => f !== null)
}

/**
 * A synthetic float for the "second line indent" special effect (`TextStyle.secondLineIndent`): the first line is
 * left alone, the float only starts blocking at the second line (band 1) and stops after it (band 2's height ends
 * the float), so the third line and beyond are automatically free again — no separate "un-indent" needed.
 */
function secondLineFloat(side: 'left' | 'right', indent: number, leading: number): WrapFloat {
  const width = indent
  const edge = side === 'left' ? 0 : width
  const inner = (b: number) => (side === 'left' ? b : width - b)
  const bands = [
    { y0: 0, y1: leading, blocked: 0 }, // first line: untouched
    { y0: leading, y1: 2 * leading, blocked: width }, // second line: fully indented
  ]
  const points: [number, number][] = [[edge, 0]]
  for (const b of bands) points.push([inner(b.blocked), b.y0], [inner(b.blocked), b.y1])
  points.push([edge, 2 * leading])
  return { side, width, height: 2 * leading, points }
}

/**
 * `wrapFloatsFor` plus the synthetic float for `style.secondLineIndent`, when it applies. That effect belongs to
 * the whole story (like `leading`/`align`), so it only ever appears on the frame holding the story's first line —
 * `atStoryStart` (pass `true` only for that frame) is how every caller (the hidden measurer and the real display)
 * agrees on which one that is, so they can never disagree about where the extra indent starts.
 */
export function floatsFor(frame: Box, images: ImageFrame[], style: TextStyle, atStoryStart: boolean): WrapFloat[] {
  const floats = wrapFloatsFor(frame, images)
  const indent = style.secondLineIndent ?? 0
  if (!atStoryStart || indent <= 0) return floats
  // the story's normal reading-start side: this app's text frames are always RTL regardless of `align`
  return [...floats, secondLineFloat('right', indent, effectiveLeading(style))]
}

/**
 * The areas of a frame where text can go, as rectangles relative to the frame, top to bottom.
 * The frame is cut into horizontal bands at the top and bottom edge of every obstacle; in each band the widest strip
 * that no obstacle covers is used (none for a "jump" obstacle). Bands with the same strip are merged.
 * Without obstacles the only cell is the whole frame.
 */
export function cellsFor(frame: Box, obstacles: WrapObstacle[]): Box[] {
  const { w, h } = frame
  if (obstacles.length === 0) return [{ x: 0, y: 0, w, h }]

  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  const local = obstacles
    .map((o) => ({
      x0: clamp(o.x - frame.x, w),
      x1: clamp(o.x + o.w - frame.x, w),
      y0: clamp(o.y - frame.y, h),
      y1: clamp(o.y + o.h - frame.y, h),
      jump: o.jump,
    }))
    .filter((o) => o.x1 > o.x0 && o.y1 > o.y0)

  const ys = [...new Set([0, h, ...local.flatMap((o) => [o.y0, o.y1])])].sort((a, b) => a - b)
  const cells: Box[] = []

  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i]
    const yb = ys[i + 1]
    if (yb - ya < 0.5) continue
    const active = local.filter((o) => o.y0 < yb - 0.01 && o.y1 > ya + 0.01)
    if (active.some((o) => o.jump)) continue

    // the horizontal ranges left free in this band
    const covered = active.map((o) => [o.x0, o.x1] as const).sort((a, b) => a[0] - b[0])
    const free: [number, number][] = []
    let cursor = 0
    for (const [a, b] of covered) {
      if (a > cursor) free.push([cursor, a])
      cursor = Math.max(cursor, b)
    }
    if (cursor < w) free.push([cursor, w])

    const widest = free.reduce<[number, number] | null>((best, s) => (!best || s[1] - s[0] > best[1] - best[0] ? s : best), null)
    if (!widest || widest[1] - widest[0] < MIN_CELL_W) continue

    const cell: Box = { x: widest[0], y: ya, w: widest[1] - widest[0], h: yb - ya }
    const last = cells[cells.length - 1]
    if (last && Math.abs(last.y + last.h - ya) < 0.01 && Math.abs(last.x - cell.x) < 0.01 && Math.abs(last.w - cell.w) < 0.01) last.h += cell.h
    else cells.push(cell)
  }
  return cells
}
