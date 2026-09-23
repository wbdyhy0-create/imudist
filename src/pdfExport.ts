import jsPDF from 'jspdf'
import { defaultLeading, type Asset, type Assets, type CharStyle, type DocSettings, type ImageFrame, type Run, type ShapeFrame, type TextFrame } from './document'
import { insetBox, styleOf } from './frames'
import { pageRects, type PageRect } from './pages'
import { shapePath } from './shapes'
import { sliceRuns } from './story'
import { flowFrames, type FrameFlow } from './textLayout'

export interface PdfExportOptions {
  /** 1-based, inclusive; null = the whole document */
  range: { from: number; to: number } | null
  bleed: boolean
  /** points, only used when `bleed` is on */
  bleedPt: number
  cropMarks: boolean
  /** pixels per inch for placed pictures */
  dpi: number
}

const PT_PER_INCH = 72
/** a normal image at 100% "fill"/"fit" is already sized in points at screen resolution (72dpi); anything sharper
 *  needs the picture's own pixels drawn smaller than its frame, in proportion to the chosen DPI */
const pxPerPt = (dpi: number) => dpi / PT_PER_INCH

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

function fontCss(style: CharStyle, scale: number): string {
  return `${style.italic ? 'italic' : 'normal'} ${style.weight} ${style.fontSize * scale}px "${style.fontFamily}", "Segoe UI", Arial, sans-serif`
}

function letterSpacingCss(style: CharStyle, scale: number): string {
  return style.tracking ? `${(style.tracking / 1000) * style.fontSize * scale}px` : '0px'
}

/** One already-measured piece of a wrapped line: its own run (font/color/…) and its width at the render scale. */
interface Seg {
  text: string
  run: Run
  width: number
}
interface Line {
  segs: Seg[]
  width: number
  /** true for a paragraph's own first line (gets `firstLineIndent`) */
  first: boolean
  /** extra space above this line: leading is added on top separately for every line */
  gapAbove: number
}

/** Splits one paragraph's text (already known to have no "\n") into greedily-wrapped lines, each carrying the
 *  style runs it's made of. Mirrors the app's own DOM word-wrap closely enough for a print-quality render:
 *  breaks only at spaces, never inside a word, and a lone over-long word still gets its own line. */
function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, runs: Run[], scale: number, maxWidth: number, firstIndent: number): Line[] {
  interface Tok {
    text: string
    run: Run
    space: boolean
  }
  const tokens: Tok[] = []
  let pos = 0
  for (const run of runs) {
    const t = text.slice(pos, pos + run.len)
    pos += run.len
    let buf = ''
    for (const ch of t) {
      if (ch === ' ') {
        if (buf) tokens.push({ text: buf, run, space: false })
        tokens.push({ text: ' ', run, space: true })
        buf = ''
      } else buf += ch
    }
    if (buf) tokens.push({ text: buf, run, space: false })
  }
  const widthOf = (tok: Tok) => {
    ctx.font = fontCss(tok.run.style, scale)
    return ctx.measureText(tok.text).width
  }
  const lines: Line[] = []
  let cur: Tok[] = []
  let curWidth = 0
  let first = true
  const avail = () => maxWidth - (first ? firstIndent * scale : 0)
  const commit = () => {
    // a trailing space doesn't count toward the line's visible width or its wrap decision
    while (cur.length && cur[cur.length - 1].space) cur.pop()
    const segs: Seg[] = []
    for (const t of cur) {
      const last = segs[segs.length - 1]
      if (last && last.run.style === t.run.style) last.text += t.text
      else segs.push({ text: t.text, run: t.run, width: 0 })
    }
    let w = 0
    for (const s of segs) {
      s.width = widthOf({ text: s.text, run: s.run, space: false })
      w += s.width
    }
    lines.push({ segs, width: w, first, gapAbove: 0 })
    first = false
    cur = []
    curWidth = 0
  }
  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    const w = widthOf(tok)
    if (cur.length > 0 && !tok.space && curWidth + w > avail()) {
      commit()
      continue
    }
    cur.push(tok)
    curWidth += w
    i++
  }
  if (cur.length) commit()
  if (lines.length === 0) lines.push({ segs: [], width: 0, first: true, gapAbove: 0 })
  return lines
}

/** Every wrapped line of a frame's whole text, with the paragraph gap due above each paragraph's own first line. */
function layoutFrame(ctx: CanvasRenderingContext2D, flow: FrameFlow, scale: number, boxWidth: number): Line[] {
  const style = flow.style
  const firstIndent = style.firstLineIndent ?? 0
  const paraTexts = flow.slice.split('\n')
  const out: Line[] = []
  let pos = 0
  paraTexts.forEach((paraText, i) => {
    const runs = sliceRuns(flow.runs, pos, pos + paraText.length)
    pos += paraText.length + 1
    const lines = wrapParagraph(ctx, paraText, runs, scale, boxWidth, firstIndent)
    const gap = i === 0 ? 0 : (flow.paraGaps[flow.startParaIndex + i - 1] ?? 0) * scale
    if (lines.length) lines[0].gapAbove = gap
    out.push(...lines)
  })
  return out
}

/** Draws one frame's already-wrapped lines inside `box` (world points, unscaled — this function does the scaling).
 *  `box` is already the fully-inset CONTENT rect (indentLeft/Right, spaceBefore/After already folded in by the
 *  caller, same as `insetBox`/`flowFrames` do it) — this function only adds firstLineIndent per paragraph. */
function drawText(ctx: CanvasRenderingContext2D, flow: FrameFlow, lines: Line[], box: { x: number; y: number; w: number; h: number }, scale: number) {
  const style = flow.style
  const leading = (style.leading ?? defaultLeading(style)) * scale
  ctx.textBaseline = 'alphabetic'
  ctx.direction = 'rtl'
  let y = box.y * scale + leading * 0.82 // roughly the ascent, so the first line's cap sits just under the box top
  for (const line of lines) {
    y += line.gapAbove
    const rightEdge = (box.x + box.w) * scale - (line.first ? (style.firstLineIndent ?? 0) * scale : 0)
    const leftEdge = box.x * scale
    const available = rightEdge - leftEdge
    const spaces = line.segs.reduce((n, s) => n + (s.text.match(/ /g)?.length ?? 0), 0)
    let extraPerSpace = 0
    if (style.align === 'justify' && line !== lines[lines.length - 1] && spaces > 0) {
      extraPerSpace = Math.max(0, available - line.width) / spaces
    }
    // right and justify both start flush with the right edge; justify's extra space is inserted between words below
    let x = rightEdge
    if (style.align === 'center') x = leftEdge + (available + line.width) / 2
    else if (style.align === 'left') x = leftEdge + line.width
    for (const seg of line.segs) {
      ctx.font = fontCss(seg.run.style, scale)
      ctx.fillStyle = '#000'
      ;(ctx as unknown as { letterSpacing: string }).letterSpacing = letterSpacingCss(seg.run.style, scale)
      ctx.textAlign = 'right'
      if (extraPerSpace > 0 && seg.text.includes(' ')) {
        // draw word-by-word so the extra justification space can be inserted between them
        const words = seg.text.split(' ')
        for (let w = 0; w < words.length; w++) {
          if (w > 0) x -= extraPerSpace + ctx.measureText(' ').width
          ctx.fillText(words[w], x, y)
          x -= ctx.measureText(words[w]).width
        }
      } else {
        ctx.fillText(seg.text, x, y)
        x -= seg.width
      }
    }
    y += leading
  }
}

const OBJECT_FIT_RECT = (fit: 'fill' | 'fit' | 'stretch', boxW: number, boxH: number, natW: number, natH: number) => {
  if (fit === 'stretch') return { x: 0, y: 0, w: boxW, h: boxH }
  const scale = fit === 'fit' ? Math.min(boxW / natW, boxH / natH) : Math.max(boxW / natW, boxH / natH)
  const w = natW * scale
  const h = natH * scale
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}

async function drawImage(ctx: CanvasRenderingContext2D, image: ImageFrame, asset: Asset, page: PageRect, scale: number) {
  const img = await loadImage(asset.dataUrl)
  const boxX = (image.x - page.x) * scale
  const boxY = (image.y - page.y) * scale
  const boxW = image.w * scale
  const boxH = image.h * scale
  ctx.save()
  ctx.translate(boxX + boxW / 2, boxY + boxH / 2)
  if (image.rotation) ctx.rotate((image.rotation * Math.PI) / 180)
  ctx.translate(-boxW / 2, -boxH / 2)
  ctx.beginPath()
  ctx.rect(0, 0, boxW, boxH)
  ctx.clip()
  const r = OBJECT_FIT_RECT(image.fit, boxW, boxH, img.naturalWidth || img.width, img.naturalHeight || img.height)
  ctx.drawImage(img, r.x, r.y, r.w, r.h)
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeFrame, page: PageRect, scale: number) {
  const boxX = (shape.x - page.x) * scale
  const boxY = (shape.y - page.y) * scale
  const w = shape.w * scale
  const h = shape.h * scale
  ctx.save()
  ctx.translate(boxX + w / 2, boxY + h / 2)
  if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
  ctx.translate(-w / 2, -h / 2)
  const path = new Path2D(shapePath(shape, scale))
  if (shape.fill) {
    ctx.fillStyle = shape.fill
    ctx.fill(path, 'evenodd')
  }
  if (shape.stroke && shape.strokeWidth > 0) {
    ctx.strokeStyle = shape.stroke
    ctx.lineWidth = shape.strokeWidth * scale
    ctx.lineJoin = 'round'
    if (shape.kind === 'line') {
      ctx.lineCap = shape.strokeCap ?? 'butt'
      if (shape.strokeDash === 'dashed') ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2])
    }
    ctx.stroke(path)
  }
  ctx.restore()
}

/** One page, rendered to a canvas at the chosen DPI. `page` is the TRIM box; `bleedPt` extends the canvas (and what
 *  gets drawn) beyond it on every side, so pictures/shapes that bleed off the page still print all the way to the
 *  cut line. */
async function renderPage(
  content: { frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[]; assets: Assets },
  flows: Map<string, FrameFlow>,
  page: PageRect,
  bleedPt: number,
  dpi: number,
): Promise<HTMLCanvasElement> {
  const scale = pxPerPt(dpi)
  const w = (page.w + 2 * bleedPt) * scale
  const h = (page.h + 2 * bleedPt) * scale
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w)
  canvas.height = Math.round(h)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(bleedPt * scale, bleedPt * scale)
  const area = { x: page.x - bleedPt, y: page.y - bleedPt, w: page.w + 2 * bleedPt, h: page.h + 2 * bleedPt }
  const overlaps = (ox: number, oy: number, ow: number, oh: number) => ox < area.x + area.w && ox + ow > area.x && oy < area.y + area.h && oy + oh > area.y

  // shapes and pictures, in document order (no explicit z is fine here — this app doesn't expose a merged
  // stacking order at this layer, and export ordering by array position matches how they were placed)
  for (const shape of content.shapes) if (overlaps(shape.x, shape.y, shape.w, shape.h)) drawShape(ctx, shape, page, scale)
  for (const image of content.images) {
    if (!overlaps(image.x, image.y, image.w, image.h)) continue
    const asset = content.assets[image.assetId]
    if (asset) await drawImage(ctx, image, asset, page, scale)
  }
  for (const frame of content.frames) {
    if (!overlaps(frame.x, frame.y, frame.w, frame.h)) continue
    const flow = flows.get(frame.id)
    if (!flow || !flow.slice) continue
    const style = styleOf(frame)
    const hasPrev = flow.prevId !== null
    const hasNext = frame.next !== null
    const box = insetBox(frame, style, !hasPrev ? flow.spaceBeforeFirst : 0, !hasNext ? flow.spaceAfterLast : 0)
    const boxWorld = {
      x: frame.x - page.x + (style.indentLeft ?? 0),
      y: frame.y - page.y + (!hasPrev ? flow.spaceBeforeFirst : 0),
      w: box.w,
      h: box.h,
    }
    const lines = layoutFrame(ctx, flow, scale, box.w * scale)
    drawText(ctx, flow, lines, boxWorld, scale)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas
}

/** Renders the chosen page range to a PDF (one raster image per page, at the chosen DPI — the browser's own text
 *  engine draws every line, the same one already proven correct for Hebrew throughout the app, so nothing here can
 *  scramble RTL/BiDi the way a hand-rolled vector-text-plus-embedded-font pipeline realistically could), then
 *  downloads it and opens it in a new tab. `onProgress(done, total)` fires after each page renders. */
export async function exportPdf(
  content: { doc: DocSettings; frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[]; assets: Assets },
  options: PdfExportOptions,
  fileBaseName: string,
  onProgress?: (done: number, total: number) => void,
  /** a window opened synchronously from the triggering click, so navigating it to the result isn't blocked as a
   *  popup once the (multi-page, `await`-heavy) render work below is done */
  viewWindow?: Window | null,
) {
  const rects = pageRects(content.doc)
  const flows = flowFrames(content.frames, content.images)
  const from = options.range ? Math.max(1, options.range.from) : 1
  const to = options.range ? Math.min(rects.length, options.range.to) : rects.length
  const total = Math.max(0, to - from + 1)
  const bleedPt = options.bleed ? options.bleedPt : 0
  const marksMargin = options.cropMarks ? 20 : 0 // room outside the bleed for the crop marks themselves

  let pdf: jsPDF | null = null
  for (let i = from; i <= to; i++) {
    const page = rects[i - 1]
    if (!page) continue
    const sheetW = page.w + 2 * bleedPt + 2 * marksMargin
    const sheetH = page.h + 2 * bleedPt + 2 * marksMargin
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [sheetW, sheetH], orientation: sheetW > sheetH ? 'landscape' : 'portrait' })
    else pdf.addPage([sheetW, sheetH])
    const canvas = await renderPage(content, flows, page, bleedPt, options.dpi)
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', marksMargin, marksMargin, page.w + 2 * bleedPt, page.h + 2 * bleedPt)
    if (options.cropMarks) drawCropMarks(pdf, page, marksMargin, marksMargin, bleedPt)
    onProgress?.(i - from + 1, total)
  }
  if (!pdf) {
    viewWindow?.close()
    return
  }
  const blob = pdf.output('blob')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBaseName}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (viewWindow && !viewWindow.closed) viewWindow.location.href = url
  else window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Crop marks around a page whose trim box sits at (originX + bleedPt, originY + bleedPt) on the sheet. */
function drawCropMarks(pdf: jsPDF, page: PageRect, originX: number, originY: number, bleedPt: number) {
  const len = 12
  const gap = 2
  const left = originX + bleedPt
  const top = originY + bleedPt
  const right = left + page.w
  const bottom = top + page.h
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  const h = (x0: number, y: number, x1: number) => pdf.line(x0, y, x1, y)
  const v = (x: number, y0: number, y1: number) => pdf.line(x, y0, x, y1)
  h(left - bleedPt - gap - len, top, left - bleedPt - gap)
  v(left, top - bleedPt - gap - len, top - bleedPt - gap)
  h(right + bleedPt + gap, top, right + bleedPt + gap + len)
  v(right, top - bleedPt - gap - len, top - bleedPt - gap)
  h(left - bleedPt - gap - len, bottom, left - bleedPt - gap)
  v(left, bottom + bleedPt + gap, bottom + bleedPt + gap + len)
  h(right + bleedPt + gap, bottom, right + bleedPt + gap + len)
  v(right, bottom + bleedPt + gap, bottom + bleedPt + gap + len)
}
