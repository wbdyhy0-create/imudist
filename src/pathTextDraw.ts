import type { CharStyle, ShapeFrame } from './document'
import { arcPoints, ringInfo, textPlacement, usedSpan } from './pathText'
import { normalizeRuns } from './story'

/** Text on a path, drawn on a canvas (the export to a picture and to a PDF) the way the screen shows it: a letter at a time along the outline. */

const MARK = /[\u0300-\u036f\u0591-\u05c7\u064b-\u065f]/
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const LTR_CHAR = /[A-Za-z0-9\u00C0-\u024F]/

export interface PathGlyph {
  /** the letter with the marks on it */
  text: string
  /** where the letter is in the text (for its style) */
  index: number
}

/**
 * The letters of a text in the order they stand on the line, left to right: a text that reads right to left has its words
 * (and letters) turned round, and the numbers and Latin words in it keep their own order.
 */
export function visualGlyphs(text: string, rtlBase: boolean): PathGlyph[] {
  const glyphs: PathGlyph[] = []
  let at = 0
  for (const char of text) {
    const last = glyphs[glyphs.length - 1]
    if (last && MARK.test(char)) last.text += char
    else glyphs.push({ text: char, index: at })
    at += char.length
  }
  const strong = glyphs.map((g): 'R' | 'L' | null => (RTL_CHAR.test(g.text) ? 'R' : LTR_CHAR.test(g.text) ? 'L' : null))
  const base = rtlBase ? 'R' : 'L'
  // what is neither (spaces, punctuation) takes the direction of what is on both sides of it, else the direction of the text
  const kinds = strong.map((kind, i): 'R' | 'L' => {
    if (kind) return kind
    let before: 'R' | 'L' | null = null
    for (let k = i - 1; k >= 0 && !before; k--) before = strong[k]
    let after: 'R' | 'L' | null = null
    for (let k = i + 1; k < strong.length && !after; k++) after = strong[k]
    return before && before === after ? before : base
  })
  const runs: { kind: 'R' | 'L'; items: PathGlyph[] }[] = []
  glyphs.forEach((g, i) => {
    const run = runs[runs.length - 1]
    if (run && run.kind === kinds[i]) run.items.push(g)
    else runs.push({ kind: kinds[i], items: [g] })
  })
  const ordered = rtlBase ? runs.reverse() : runs
  return ordered.flatMap((run) => (run.kind === 'R' ? [...run.items].reverse() : run.items))
}

export interface PathTextShadow {
  apply: (style: CharStyle) => void
  clear: () => void
}

/** Draws the text on the outline of a shape; `ctx` is in the shape's own box (its top-left at 0, 0), `scale` is pixels to a point. */
export function drawPathText(ctx: CanvasRenderingContext2D, shape: ShapeFrame, scale: number, shadow: PathTextShadow) {
  const pt = shape.pathText
  const info = pt && pt.text ? ringInfo(shape) : null
  if (!pt || !info) return
  const place = textPlacement(pt, usedSpan(pt, info))
  const line = arcPoints(info, place.startFrac, pt.span, place.dir).map(([x, y]) => [x * scale, y * scale] as const)
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]))
  const length = cum[cum.length - 1]
  if (length <= 0) return

  const runs = normalizeRuns(pt.text, pt.runs, pt.style)
  const styleAt = (index: number) => {
    let end = 0
    for (const run of runs) {
      end += run.len
      if (index < end) return run.style
    }
    return pt.style
  }
  const pointAt = (d: number) => {
    let i = 1
    while (i < cum.length - 1 && cum[i] < d) i++
    const span = cum[i] - cum[i - 1]
    const f = span > 0 ? (d - cum[i - 1]) / span : 0
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, angle: Math.atan2(by - ay, bx - ax) }
  }

  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const measured = visualGlyphs(pt.text.replace(/\n/g, ' '), place.rtl).map((glyph) => {
    const style = styleAt(glyph.index)
    ctx.font = `${style.italic ? 'italic ' : ''}${style.weight} ${style.fontSize * scale}px "${style.fontFamily}", "Segoe UI", Arial, sans-serif`
    const advance = ctx.measureText(glyph.text).width + ((style.tracking ?? 0) / 1000) * style.fontSize * scale
    return { glyph, style, advance }
  })
  const total = measured.reduce((sum, m) => sum + m.advance, 0)
  // text that reads right to left ends at the end of the path
  let offset = place.rtl ? length - total : 0
  for (const { glyph, style, advance } of measured) {
    const middle = offset + advance / 2
    offset += advance
    // a letter whose middle is off the line is not shown
    if (middle < 0 || middle > length) continue
    const at = pointAt(middle)
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.rotate(at.angle)
    ctx.font = `${style.italic ? 'italic ' : ''}${style.weight} ${style.fontSize * scale}px "${style.fontFamily}", "Segoe UI", Arial, sans-serif`
    ctx.fillStyle = pt.color
    const outline = (style.outlineWidth ?? 0) > 0
    if (outline) {
      ctx.strokeStyle = style.outlineColor ?? '#000000'
      ctx.lineWidth = (style.outlineWidth ?? 0) * scale
      ctx.lineJoin = 'round'
    }
    shadow.apply(style)
    if (outline) ctx.strokeText(glyph.text, -advance / 2, 0)
    ctx.fillText(glyph.text, -advance / 2, 0)
    shadow.clear()
    ctx.restore()
  }
  ctx.restore()
}
