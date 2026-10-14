import type { Feather, ObjectStyleRecord, ObjectStyleSettings, ParagraphDecoration, ParagraphStyleRecord, TextAlign, TextFrame } from './document'
import { isProfiledLine, lineOutline, lineOutlinePath } from './lineProfile'
import { headFrames } from './frames'
import { resolveParagraphStyle, styleIdOf } from './styleApply'

/**
 * The decoration of a paragraph style (עיטור): a bar, a rule, a line with arrow heads or a drawing, drawn above, below or
 * behind every paragraph in the style, in the look of an object style. What is saved is only which object style, where and how big;
 * the look is read from the object style whenever the text is drawn or measured, so a change of the object style
 * reaches every heading at once.
 */

/** the length a line with arrow heads gets when the decoration is asked to be as wide as the column */
const DEFAULT_LINE_LENGTH = 240

/** a gradient fill in the terms of CSS */
const gradientCss = (gradient: NonNullable<ObjectStyleSettings['fillGradient']>) =>
  gradient.type === 'radial' ? `radial-gradient(${gradient.start}, ${gradient.end})` : `linear-gradient(${90 - (gradient.angle ?? 0)}deg, ${gradient.reverse ? gradient.end : gradient.start}, ${gradient.reverse ? gradient.start : gradient.end})`

/** an object style that was made from a line: its decoration is that line, with its arrow heads and its profile */
export const isLineLook = (look: ObjectStyleSettings) => !!look.arrowStart || !!look.arrowEnd || !!look.lineWidths

/** the picture (SVG) of a line in the look of a style, `length` points long: its width, height, and the markup */
export function decorationLine(look: ObjectStyleSettings, length: number): { width: number; height: number; svg: string } {
  const stroke = look.stroke ?? '#000000'
  const thickness = Math.max(0.25, look.strokeWidth ?? 1)
  const shape = {
    kind: 'line' as const,
    w: length,
    h: 0,
    strokeWidth: thickness,
    strokeCap: look.strokeCap,
    lineWidths: look.lineWidths ?? undefined,
    arrowStart: look.arrowStart ?? undefined,
    arrowEnd: look.arrowEnd ?? undefined,
  }
  let top = -thickness / 2
  let height = thickness
  let body: string
  if (isProfiledLine(shape)) {
    const ring = lineOutline(shape)
    const ys = ring.map((point) => point[1])
    top = Math.min(...ys, 0)
    height = Math.max(0.5, Math.max(...ys, 0) - top)
    body = `<path d='${lineOutlinePath(shape)}' fill='${stroke}'/>`
  } else {
    const dash = look.strokeDash === 'dashed' ? ` stroke-dasharray='${thickness * 3} ${thickness * 2}'` : ''
    body = `<path d='M0 0L${length} 0' stroke='${stroke}' stroke-width='${thickness}'${look.strokeCap ? ` stroke-linecap='${look.strokeCap}'` : ''}${dash} fill='none'/>`
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${length}' height='${height}' viewBox='0 ${top} ${length} ${height}' preserveAspectRatio='none'>${body}</svg>`
  return { width: length, height, svg }
}

/**
 * The fade of a feather as a CSS mask (a list of gradients), in the terms of the box and not of its size, since the box of a heading is only
 * known when it is laid out: an edge feather keeps its distance in points, a fade along the object is in fractions of the box (exact along
 * its width or its height, the nearest in between for a slanting one).
 */
export function featherMask(feather: Feather | null | undefined, scale: number, refSize?: { w: number; h: number }): string | null {
  if (!feather) return null
  if (feather.type === 'basic' || feather.type === 'directional') {
    const edges: [string, number, 'w' | 'h'][] = feather.type === 'basic'
      ? [['to bottom', feather.radius, 'h'], ['to left', feather.radius, 'w'], ['to top', feather.radius, 'h'], ['to right', feather.radius, 'w']]
      : [['to bottom', feather.top, 'h'], ['to left', feather.right, 'w'], ['to top', feather.bottom, 'h'], ['to right', feather.left, 'w']]
    // measured against the size of the object the style was made from, a feather reaches the same part of every box (a heading of one line
    // is not left with only the edges, and one of three is not left with a solid middle); without that size it keeps its distance in points
    const layers = edges.filter(([, radius]) => radius > 0).map(([direction, radius, axis]) => {
      const reference = refSize?.[axis]
      const depth = reference && reference > 0 ? `${Math.min(100, (radius / reference) * 100)}%` : `${radius * scale}px`
      return `linear-gradient(${direction}, rgba(0,0,0,0) 0px, rgba(0,0,0,1) ${depth})`
    })
    return layers.length > 0 ? layers.join(', ') : null
  }
  const dx = feather.x1 - feather.x0
  const dy = feather.y1 - feather.y0
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 1e-6 || feather.points.length === 0) return null
  const position = (offset: number): number => {
    if (Math.abs(dx) < 1e-6) return (feather.y0 + offset * dy) * 100
    if (Math.abs(dy) < 1e-6) return (feather.x0 + offset * dx) * 100
    const ux = dx / length
    const uy = dy / length
    const lineLength = Math.abs(ux) + Math.abs(uy) // the box taken as a square: the line through it, for the angle of the fade
    return (((feather.x0 - 0.5) * ux + (feather.y0 - 0.5) * uy + lineLength / 2 + offset * length) / lineLength) * 100
  }
  const angle = Math.abs(dx) < 1e-6 ? '180deg' : Math.abs(dy) < 1e-6 ? '90deg' : `${(Math.atan2(dx, -dy) * 180) / Math.PI}deg`
  const stops = feather.points
    .map((point) => ({ at: position(point.offset), opacity: point.opacity }))
    .sort((a, b) => a.at - b.at)
    .map((stop) => `rgba(0,0,0,${stop.opacity}) ${Math.round(stop.at * 100) / 100}%`)
  return `linear-gradient(${angle}, ${stops.join(', ')})`
}

/** the fill, the line, the corners and the shadow of an object style as one box (a bar, or what is behind a heading) */
function boxVars(look: ObjectStyleSettings, scale: number): Record<string, string> {
  const shadows: string[] = []
  // the line is an inset shadow, like the line of a paragraph's own box: a border would be rounded to whole device pixels
  if (look.stroke && (look.strokeWidth ?? 1) > 0) shadows.push(`inset 0 0 0 ${(look.strokeWidth ?? 1) * scale}px ${look.stroke}`)
  if (look.shadow && look.shadow.opacity > 0) {
    const blur = Math.hypot(look.shadow.offsetX, look.shadow.offsetY) * 0.35 * (1 - look.shadow.opacity)
    const channel = (from: number) => parseInt(look.shadow!.color.slice(from, from + 2), 16) || 0
    shadows.push(`${look.shadow.offsetX * scale}px ${look.shadow.offsetY * scale}px ${blur * scale}px rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${look.shadow.opacity})`)
  }
  return {
    '--deco-bg': look.fillGradient ? gradientCss(look.fillGradient) : look.fill ?? 'transparent',
    '--deco-radius': `${(look.radius ?? 0) * scale}px`,
    '--deco-shadow': shadows.length > 0 ? shadows.join(', ') : 'none',
  }
}

/** a drawing as a CSS background, stretched over the box it fills (its own proportions are not kept: it takes the box's) */
const stretchedDrawing = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace('<svg ', '<svg preserveAspectRatio="none" '))}") center / 100% 100% no-repeat`

/** what the paragraph block is told about itself, for a decoration that follows it */
export interface DecorationContext {
  /** the alignment of the paragraph's text: a decoration behind a heading sits where the heading's text does */
  align?: TextAlign
  /** points: the space the paragraph's opening gap puts above its first line, inside the block (the decoration does not cover it) */
  gapBefore?: number
}

/**
 * The CSS custom properties a paragraph block gets for its decoration (`.para-deco-above::before` / `.para-deco-below::after` /
 * `.para-deco-behind::before` in styles.css read them): size, space, alignment and look. `scale` is the zoom (1 when measuring).
 */
export function decorationVars(deco: ParagraphDecoration, scale: number, context: DecorationContext = {}): Record<string, string> | null {
  const look = deco.look ?? (deco.graphic ? {} : undefined)
  if (!look) return null
  const graphic = deco.graphic && deco.graphic.w > 0 && deco.graphic.h > 0 ? deco.graphic : undefined
  const vars: Record<string, string> = { '--deco-opacity': String(look.opacity ?? 1) }
  const mask = featherMask(look.feather, scale, deco.refSize)
  if (mask) vars['--deco-mask'] = mask

  if (deco.position === 'behind') {
    // behind the heading: the drawing (or the fill and the line of the style) is stretched over the box of the text, which is as wide as
    // its longest line (as wide as the column for a justified paragraph) and as high as its lines - so every heading has its own size
    const align = context.align
    const full = align === 'justify' || align === 'justifyCenter' || align === 'justifyAll'
    vars['--deco-fit'] = full ? 'auto' : 'fit-content'
    // in a right-to-left column the start is the right: a heading aligned there stays there, one aligned left or centred follows it
    const placement = full ? ['0', '0'] : align === 'center' ? ['auto', 'auto'] : align === 'left' ? ['auto', '0'] : ['0', 'auto']
    vars['--deco-ms'] = placement[0]
    vars['--deco-me'] = placement[1]
    vars['--deco-pad'] = `${Math.max(0, deco.gap) * scale}px`
    // the space that opens the paragraph is the margin of the box, not a spacer inside it: the text has the same room above as below
    vars['--deco-mt'] = `${Math.max(0, context.gapBefore ?? 0) * scale}px`
    if (graphic) {
      vars['--deco-bg'] = stretchedDrawing(graphic.svg)
      vars['--deco-radius'] = '0'
      vars['--deco-shadow'] = 'none'
    } else {
      Object.assign(vars, boxVars(look, scale))
    }
    return vars
  }

  vars['--deco-gap'] = `${Math.max(0, deco.gap) * scale}px`
  vars['--deco-ms'] = deco.align === 'start' ? '0' : 'auto'
  vars['--deco-me'] = deco.align === 'end' ? '0' : 'auto'
  if (graphic) {
    // the drawing of the object style itself: as wide as asked (its own width when not), never wider than the column, in its own proportions
    const width = deco.length > 0 ? deco.length : graphic.w
    vars['--deco-width'] = `${width * scale}px`
    vars['--deco-height'] = 'auto'
    vars['--deco-ratio'] = `${graphic.w} / ${graphic.h}`
    vars['--deco-bg'] = `url("data:image/svg+xml,${encodeURIComponent(graphic.svg)}") center / 100% 100% no-repeat`
    vars['--deco-radius'] = '0'
    vars['--deco-shadow'] = 'none'
    return vars
  }
  if (isLineLook(look)) {
    const line = decorationLine(look, deco.length > 0 ? deco.length : DEFAULT_LINE_LENGTH)
    vars['--deco-width'] = `${line.width * scale}px`
    vars['--deco-height'] = `${line.height * scale}px`
    vars['--deco-bg'] = `url("data:image/svg+xml,${encodeURIComponent(line.svg)}") center / 100% 100% no-repeat`
    vars['--deco-radius'] = '0'
    vars['--deco-shadow'] = 'none'
    return vars
  }
  vars['--deco-width'] = deco.length > 0 ? `${deco.length * scale}px` : 'auto'
  vars['--deco-height'] = `${Math.max(0.25, deco.height) * scale}px`
  Object.assign(vars, boxVars(look, scale))
  return vars
}

/** the class a paragraph block gets for its decoration */
export const decorationClass = (deco: ParagraphDecoration | undefined): string | undefined =>
  deco?.look || deco?.graphic ? (deco.position === 'below' ? 'para-deco-below' : deco.position === 'behind' ? 'para-deco-behind' : 'para-deco-above') : undefined

/**
 * The paragraph patches of a story with the decoration of every paragraph's style written in (and the look of the object
 * style it names): the patches a drawing or a measuring of the text wants. The saved patches are not touched; a story
 * with no decoration at all gets its own patches back (the same array).
 */
export function decorationPatches(
  head: TextFrame,
  paragraphStyles: ParagraphStyleRecord[],
  objectStyles: ObjectStyleRecord[],
  decorated: Map<string, ParagraphDecoration> = decoratedStyles(paragraphStyles, objectStyles),
): TextFrame['paragraphStylePatches'] {
  if (decorated.size === 0) return head.paragraphStylePatches
  const count = head.text.split('\n').length
  let changed = false
  const out: NonNullable<TextFrame['paragraphStylePatches']> = Array.from({ length: count }, (_, index) => {
    const base = head.paragraphStylePatches?.[index] ?? {}
    const id = styleIdOf(paragraphStyles, head, index)
    const deco = id ? decorated.get(id) : undefined
    if (!deco) return base
    changed = true
    return { ...base, decoration: deco }
  })
  return changed ? out : head.paragraphStylePatches
}

/** the paragraph styles that have a decoration, with the decoration as it is drawn (the look of its object style filled in) */
export function decoratedStyles(paragraphStyles: ParagraphStyleRecord[], objectStyles: ObjectStyleRecord[]): Map<string, ParagraphDecoration> {
  const out = new Map<string, ParagraphDecoration>()
  if (objectStyles.length === 0) return out
  for (const style of paragraphStyles) {
    const deco = resolveParagraphStyle(style.id, paragraphStyles).decoration
    if (!deco) continue
    const record = objectStyles.find((candidate) => candidate.id === deco.objectStyleId)
    if (record) out.set(style.id, { ...deco, look: record.settings, ...(record.graphic ? { graphic: record.graphic } : {}), ...(record.size ? { refSize: record.size } : {}) })
  }
  return out
}

/** the frames with the decorations written into the patches of their stories (the heads): what the layout and the drawing use */
export function withDecorations(frames: TextFrame[], paragraphStyles: ParagraphStyleRecord[], objectStyles: ObjectStyleRecord[]): TextFrame[] {
  const decorated = decoratedStyles(paragraphStyles, objectStyles)
  if (decorated.size === 0) return frames
  const heads = new Set(headFrames(frames).map((frame) => frame.id))
  return frames.map((frame) => {
    if (!heads.has(frame.id)) return frame
    const patches = decorationPatches(frame, paragraphStyles, objectStyles, decorated)
    return patches === frame.paragraphStylePatches ? frame : { ...frame, paragraphStylePatches: patches }
  })
}
