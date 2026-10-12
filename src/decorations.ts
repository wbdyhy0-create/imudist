import type { ObjectStyleRecord, ObjectStyleSettings, ParagraphDecoration, ParagraphStyleRecord, TextFrame } from './document'
import { isProfiledLine, lineOutline, lineOutlinePath } from './lineProfile'
import { headFrames } from './frames'
import { resolveParagraphStyle, styleIdOf } from './styleApply'

/**
 * The decoration of a paragraph style (עיטור): a bar, a rule or a line with arrow heads, drawn above or below every
 * paragraph in the style, in the look of an object style. What is saved is only which object style, where and how big;
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
 * The CSS custom properties a paragraph block gets for its decoration (`.para-deco-above::before` / `.para-deco-below::after`
 * in styles.css read them): size, space, alignment and look. `scale` is the zoom (1 when measuring).
 */
export function decorationVars(deco: ParagraphDecoration, scale: number): Record<string, string> | null {
  const look = deco.look
  if (!look) return null
  const alignStart = deco.align === 'start'
  const vars: Record<string, string> = {
    '--deco-gap': `${Math.max(0, deco.gap) * scale}px`,
    '--deco-ms': alignStart ? '0' : 'auto',
    '--deco-me': deco.align === 'end' ? '0' : 'auto',
    '--deco-opacity': String(look.opacity ?? 1),
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
  const shadows: string[] = []
  // the line is an inset shadow, like the line of a paragraph's own box: a border would be rounded to whole device pixels
  if (look.stroke && (look.strokeWidth ?? 1) > 0) shadows.push(`inset 0 0 0 ${(look.strokeWidth ?? 1) * scale}px ${look.stroke}`)
  if (look.shadow && look.shadow.opacity > 0) {
    const blur = Math.hypot(look.shadow.offsetX, look.shadow.offsetY) * 0.35 * (1 - look.shadow.opacity)
    const channel = (from: number) => parseInt(look.shadow!.color.slice(from, from + 2), 16) || 0
    shadows.push(`${look.shadow.offsetX * scale}px ${look.shadow.offsetY * scale}px ${blur * scale}px rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${look.shadow.opacity})`)
  }
  vars['--deco-width'] = deco.length > 0 ? `${deco.length * scale}px` : 'auto'
  vars['--deco-height'] = `${Math.max(0.25, deco.height) * scale}px`
  vars['--deco-bg'] = look.fillGradient ? gradientCss(look.fillGradient) : look.fill ?? 'transparent'
  vars['--deco-radius'] = `${(look.radius ?? 0) * scale}px`
  vars['--deco-shadow'] = shadows.length > 0 ? shadows.join(', ') : 'none'
  return vars
}

/** the class a paragraph block gets for its decoration */
export const decorationClass = (deco: ParagraphDecoration | undefined): string | undefined => (deco?.look ? (deco.position === 'below' ? 'para-deco-below' : 'para-deco-above') : undefined)

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
    if (record) out.set(style.id, { ...deco, look: record.settings })
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
