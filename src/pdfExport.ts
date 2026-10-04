import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { cssTextAlign, defaultLeading, DEFAULT_FOOTNOTE_CONFIG, wordSpacingPt, type Asset, type Assets, type DocSettings, type ImageFrame, type PageSection, type ParagraphStyleRecord, type ShapeFrame, type TextFrame } from './document'
import { ownerPage, pageRects, type PageRect } from './pages'
import { footnoteTextStyle, numberFootnotes } from './footnoteLayout'
import { primaryTextFrameOrder } from './placeText'
import { buildParagraphNodes, buildWrapFloats } from './richtext'
import { imageGeometry, shapePath } from './shapes'
import { flowFrames, flowFramesWithFootnoteContinuation, type FrameFlow } from './textLayout'
import { floatsFor } from './wrap'
import { isTauri } from './fileio'
import { hexToRgb, linearGradientLine } from './colorModels'
import { normalizeRuns } from './story'
import { tocDisplayMarkers } from './toc'
import { applyFeatherCanvasMask } from './feather'

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

const OBJECT_FIT_RECT = (fit: 'fill' | 'fit' | 'stretch', boxW: number, boxH: number, natW: number, natH: number) => {
  if (fit === 'stretch') return { x: 0, y: 0, w: boxW, h: boxH }
  const scale = fit === 'fit' ? Math.min(boxW / natW, boxH / natH) : Math.max(boxW / natW, boxH / natH)
  const w = natW * scale
  const h = natH * scale
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}
import { canvasShadowBlur } from './shadow'

function applyCanvasShadow(ctx: CanvasRenderingContext2D, offsetX = 0, offsetY = 6, opacity = 0, color = '#000000', scale = 1) {
  const alpha = Math.max(0, Math.min(1, opacity))
  const rgb = hexToRgb(color)
  ctx.shadowColor = `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${alpha})`
  ctx.shadowOffsetX = offsetX * scale
  ctx.shadowOffsetY = offsetY * scale
  ctx.shadowBlur = canvasShadowBlur(offsetX, offsetY, alpha, scale)
}

function clearCanvasShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'rgba(0, 0, 0, 0)'
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.shadowBlur = 0
}

async function drawImage(ctx: CanvasRenderingContext2D, image: ImageFrame, asset: Asset, page: PageRect, scale: number) {
  const img = await loadImage(asset.dataUrl)
  const boxX = (image.x - page.x) * scale
  const boxY = (image.y - page.y) * scale
  const boxW = image.w * scale
  const boxH = image.h * scale
  const layer = document.createElement('canvas')
  layer.width = Math.max(1, Math.ceil(boxW))
  layer.height = Math.max(1, Math.ceil(boxH))
  const layerContext = layer.getContext('2d')!
  const fit = OBJECT_FIT_RECT(image.fit, boxW, boxH, img.naturalWidth || img.width, img.naturalHeight || img.height)
  layerContext.drawImage(img, fit.x, fit.y, fit.w, fit.h)
  if (image.feather) applyFeatherCanvasMask(layerContext, image.feather, boxW, boxH)
  ctx.save()
  ctx.translate(boxX + boxW / 2, boxY + boxH / 2)
  if (image.rotation) ctx.rotate((image.rotation * Math.PI) / 180)
  ctx.translate(-boxW / 2, -boxH / 2)
  ctx.globalAlpha = image.opacity ?? 1
  if (image.flipX || image.flipY) {
    ctx.translate(boxW / 2, boxH / 2)
    ctx.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1)
    ctx.translate(-boxW / 2, -boxH / 2)
  }
  applyCanvasShadow(ctx, image.shadowOffsetX, image.shadowOffsetY ?? image.shadowOffset, image.shadowOpacity, image.shadowColor, scale)
  ctx.drawImage(layer, 0, 0, boxW, boxH)
  ctx.restore()
}

async function drawTextDom(
  ctx: CanvasRenderingContext2D,
  content: { doc: DocSettings; frames: TextFrame[]; images: ImageFrame[]; paragraphStyles: ParagraphStyleRecord[]; sections: PageSection[]; storyFrames?: TextFrame[] },
  flows: Map<string, FrameFlow>,
  page: PageRect,
  scale: number,
  skipFeather = false,
) {
  if (!skipFeather && content.frames.some((frame) => frame.feather)) {
    let index = 0
    while (index < content.frames.length) {
      if (content.frames[index].feather) {
        const frame = content.frames[index++]
        const layer = document.createElement('canvas')
        layer.width = Math.max(1, Math.ceil(page.w * scale))
        layer.height = Math.max(1, Math.ceil(page.h * scale))
        const layerContext = layer.getContext('2d')!
        await drawTextDom(layerContext, { ...content, frames: [frame], storyFrames: content.storyFrames ?? content.frames }, flows, page, scale, true)
        layerContext.save()
        layerContext.globalCompositeOperation = 'destination-in'
        const width = frame.w * scale
        const height = frame.h * scale
        layerContext.translate((frame.x - page.x + frame.w / 2) * scale, (frame.y - page.y + frame.h / 2) * scale)
        if (frame.rotation) layerContext.rotate((frame.rotation * Math.PI) / 180)
        layerContext.translate(-width / 2, -height / 2)
        applyFeatherCanvasMask(layerContext, frame.feather!, width, height)
        layerContext.restore()
        ctx.drawImage(layer, 0, 0)
      } else {
        const start = index
        while (index < content.frames.length && !content.frames[index].feather) index++
        await drawTextDom(ctx, { ...content, frames: content.frames.slice(start, index) }, flows, page, scale, true)
      }
    }
    return
  }
  const footnoteConfig = content.doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG
  const root = document.createElement('div')
  Object.assign(root.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${page.w}px`,
    height: `${page.h}px`,
    overflow: 'hidden',
    direction: 'rtl',
    pointerEvents: 'none',
    background: 'transparent',
  })
  document.body.appendChild(root)
  try {
    for (const frame of content.frames) {
      if (frame.x >= page.x + page.w || frame.x + frame.w <= page.x || frame.y >= page.y + page.h || frame.y + frame.h <= page.y) continue
      const flow = flows.get(frame.id)
      if (!flow || !flow.slice) continue
      // the look of the whole story is the first frame's (as on screen and in the layout that decided what fits here):
      // a later frame's own style fields can differ (another alignment, size, leading) and would break the lines differently
      const style = flow.style
      const hasPrev = flow.prevId !== null
      const hasNext = frame.next !== null
      const continuesAtEnd = flow.end < flow.story.length && flow.story[flow.end - 1] !== '\n'
      const storyFrames = content.storyFrames ?? content.frames
      const head = storyFrames.find((candidate) => candidate.id === flow.headId)
      const tocMarkers = head?.tocPageReferences?.length
        ? tocDisplayMarkers(head.tocPageReferences, flow.story, flow.start, flow.end, storyFrames, flows, pageRects(content.doc), content.sections, content.doc, content.doc.toc?.leader ?? '.', head.tocFootnoteReferences)
        : null
      const outer = document.createElement('div')
      Object.assign(outer.style, {
        position: 'absolute',
        left: `${frame.x - page.x}px`,
        top: `${frame.y - page.y}px`,
        width: `${frame.w}px`,
        height: `${frame.h}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        color: '#111',
        direction: 'rtl',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        textRendering: 'geometricPrecision',
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : '',
        transformOrigin: 'center center',
      })
      const inner = document.createElement('div')
      Object.assign(inner.style, {
        width: `${frame.w}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
        fontSize: `${style.fontSize}px`,
        fontWeight: String(style.weight),
        fontStyle: style.italic ? 'italic' : 'normal',
        lineHeight: `${style.leading ?? defaultLeading(style)}px`,
        ...cssTextAlign(style.align),
        wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : '',
        paddingTop: !hasPrev && flow.spaceBeforeFirst ? `${flow.spaceBeforeFirst}px` : '',
        height: `${frame.h - flow.footnoteHeight + (!hasNext ? flow.spaceAfterLast : 0)}px`,
        paddingBottom: !hasNext && flow.spaceAfterLast ? `${flow.spaceAfterLast}px` : '',
        paddingLeft: style.indentLeft ? `${style.indentLeft}px` : '',
        paddingRight: style.indentRight ? `${style.indentRight}px` : '',
      })
      inner.append(...buildWrapFloats(floatsFor(frame, content.images, style, !hasPrev), 1))
      inner.appendChild(
        buildParagraphNodes(
          flow.slice,
          flow.runs,
          1,
          {
            paraGaps: flow.paraGaps,
            startParaIndex: flow.startParaIndex,
            firstLineIndent: style.firstLineIndent,
            atParaStart: flow.atParaStart,
            footnoteMarkers: {
              ...Object.fromEntries(flow.footnoteReferences.map((note) => [note.anchor - flow.start, String(note.referenceNumber)])),
              ...tocMarkers?.footnotes,
            },
            footnoteReferenceScale: footnoteConfig.referenceScale,
            tocPageMarkers: tocMarkers?.pageNumbers,
            tocLeaderMarkers: tocMarkers?.leaders,
          },
          storyFrames.find((candidate) => candidate.id === flow.headId)?.paragraphStylePatches,
          style.align,
          continuesAtEnd,
        ),
      )
      outer.appendChild(inner)
      if (flow.footnotes.length) {
        const footnotes = document.createElement('div')
        footnotes.className = 'footnotes-area'
        Object.assign(footnotes.style, {
          position: 'absolute',
          left: '0',
          right: '0',
          bottom: '0',
          height: `${flow.footnoteHeight}px`,
          direction: 'rtl',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          color: '#111',
        })
        const divider = document.createElement('div')
        divider.className = 'footnote-divider'
        Object.assign(divider.style, { position: 'absolute', top: `${footnoteConfig.dividerGap}px`, right: '0', width: '35%', borderTop: '1px solid currentColor', opacity: '0.7' })
        footnotes.appendChild(divider)
        for (const note of flow.footnotes) {
          const noteStyle = note.style ?? footnoteTextStyle(footnoteConfig, content.paragraphStyles)
          const item = document.createElement('div')
          item.className = 'footnote-item'
          Object.assign(item.style, {
            position: 'absolute',
            display: 'flex',
            alignItems: 'flex-start',
            gap: `${footnoteConfig.numberTextGap}px`,
            left: `${frame.w - note.x - note.width}px`,
            top: `${note.y}px`,
            width: `${note.width}px`,
            height: `${note.height}px`,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            textAlign: footnoteConfig.alignment,
          })
          const number = document.createElement('span')
          number.className = 'footnote-number'
          number.dir = 'rtl'
          number.style.fontSize = `${noteStyle.fontSize}px`
          const referenceLabel = note.continued ? '' : String(note.referenceNumber)
          const dotAfterNumber = referenceLabel.endsWith('.')
          const numberLabel = dotAfterNumber ? referenceLabel.slice(0, -1) : referenceLabel
          const numberText = document.createElement('span')
          numberText.dir = /[\u0590-\u05ff]/.test(numberLabel) ? 'rtl' : 'ltr'
          numberText.textContent = numberLabel
          number.appendChild(numberText)
          if (dotAfterNumber) {
            const dot = document.createElement('span')
            dot.dir = 'rtl'
            dot.textContent = '.'
            number.appendChild(dot)
          }
          const text = document.createElement('span')
          text.className = 'footnote-content'
          Object.assign(text.style, { flex: '1', minWidth: '0' })
          Object.assign(item.style, { fontFamily: noteStyle.fontFamily, fontSize: `${noteStyle.fontSize}px`, fontWeight: String(noteStyle.weight), fontStyle: noteStyle.italic ? 'italic' : 'normal', lineHeight: `${noteStyle.leading ?? defaultLeading(noteStyle)}px`, wordSpacing: wordSpacingPt(noteStyle) ? `${wordSpacingPt(noteStyle)}px` : '', paddingLeft: noteStyle.indentLeft ? `${noteStyle.indentLeft}px` : '', paddingRight: noteStyle.indentRight ? `${noteStyle.indentRight}px` : '', ...cssTextAlign(noteStyle.align), color: noteStyle.color ?? '#111' })
          text.appendChild(buildParagraphNodes(note.content, normalizeRuns(note.content, note.runs ?? [], noteStyle), 1))
          if (!note.continued) item.appendChild(number)
          item.appendChild(text)
          footnotes.appendChild(item)
        }
        outer.appendChild(footnotes)
      }
      root.appendChild(outer)
    }
    await document.fonts?.ready
    const raster = await html2canvas(root, {
      backgroundColor: null,
      scale,
      width: page.w,
      height: page.h,
      logging: false,
    })
    ctx.drawImage(raster, 0, 0)
  } finally {
    root.remove()
  }
}

async function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeFrame, page: PageRect, scale: number, asset?: Asset) {
  const boxX = (shape.x - page.x) * scale
  const boxY = (shape.y - page.y) * scale
  const w = shape.w * scale
  const h = shape.h * scale
  if (shape.feather) {
    const layer = document.createElement('canvas')
    layer.width = Math.max(1, Math.ceil(w))
    layer.height = Math.max(1, Math.ceil(h))
    const layerContext = layer.getContext('2d')!
    await drawShape(layerContext, { ...shape, x: 0, y: 0, opacity: 1, rotation: undefined, feather: undefined, shadowOpacity: 0 }, { x: 0, y: 0, w: shape.w, h: shape.h }, scale, asset)
    applyFeatherCanvasMask(layerContext, shape.feather, w, h)
    ctx.save()
    ctx.translate(boxX + w / 2, boxY + h / 2)
    if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
    ctx.globalAlpha = shape.opacity ?? 1
    applyCanvasShadow(ctx, shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, shape.shadowColor, scale)
    ctx.drawImage(layer, -w / 2, -h / 2, w, h)
    ctx.restore()
    return
  }
  ctx.save()
  ctx.translate(boxX + w / 2, boxY + h / 2)
  if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
  ctx.translate(-w / 2, -h / 2)
  ctx.globalAlpha = shape.opacity ?? 1
  const path = new Path2D(shapePath(shape, scale))
  const hasFill = !shape.frame && (!!shape.fillGradient || !!shape.fill)
  if (hasFill) applyCanvasShadow(ctx, shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, shape.shadowColor, scale)
  if (shape.fillGradient && !shape.frame) {
    const g = shape.fillGradient.type === 'radial'
      ? ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
      : (() => {
        const line = linearGradientLine((shape.fillGradient!.angle ?? 0) + (shape.fillGradient!.reverse ? 180 : 0), w, h)
        return ctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2)
      })()
    const stops = shape.fillGradient.stops?.length
      ? shape.fillGradient.stops
      : [{ offset: 0, color: shape.fillGradient.start }, { offset: 1, color: shape.fillGradient.end }]
    // a reversed radial gradient swaps the colours between the stops (offsets stay), like the on-screen SVG does
    const reverseRadial = shape.fillGradient.type === 'radial' && shape.fillGradient.reverse
    stops.forEach((stop, index) => g.addColorStop(Math.max(0, Math.min(1, stop.offset)), reverseRadial ? stops[stops.length - 1 - index].color : stop.color))
    ctx.fillStyle = g
    ctx.fill(path, 'evenodd')
  } else if (shape.fill && !shape.frame) {
    ctx.fillStyle = shape.fill
    ctx.fill(path, 'evenodd')
  }
  clearCanvasShadow(ctx)
  if (shape.image && asset) {
    const img = await loadImage(asset.dataUrl)
    const box = imageGeometry(shape, asset)
    ctx.save()
    ctx.clip(path)
    ctx.drawImage(img, box.x * scale, box.y * scale, box.w * scale, box.h * scale)
    ctx.restore()
  }
  if (shape.stroke && shape.strokeWidth > 0) {
    if (!hasFill) applyCanvasShadow(ctx, shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, shape.shadowColor, scale)
    ctx.strokeStyle = shape.stroke
    ctx.lineWidth = shape.strokeWidth * scale
    ctx.lineJoin = 'round'
    if (shape.kind === 'line') {
      ctx.lineCap = shape.strokeCap ?? 'butt'
      if (shape.strokeDash === 'dashed') ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2])
    }
    ctx.stroke(path)
    clearCanvasShadow(ctx)
  }
  ctx.restore()
}

/** One page, rendered to a canvas at the chosen DPI. `page` is the TRIM box; `bleedPt` extends the canvas (and what
 *  gets drawn) beyond it on every side, so pictures/shapes that bleed off the page still print all the way to the
 *  cut line. */
async function renderPage(
  content: { doc: DocSettings; frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[]; assets: Assets; paragraphStyles: ParagraphStyleRecord[]; sections: PageSection[] },
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
  const isParentShadow = (item: { id: string }) => item.id.startsWith('parent-shadow:')
  const parentContentAbove = content.doc.parentItemsAbovePageContent ?? false

  if (parentContentAbove) {
    const pageShapes = content.shapes.filter((shape) => !isParentShadow(shape))
    const parentShapes = content.shapes.filter(isParentShadow)
    const pageImages = content.images.filter((image) => !isParentShadow(image))
    const parentImages = content.images.filter(isParentShadow)
    const pageFrames = content.frames.filter((frame) => !isParentShadow(frame))
    const parentFrames = content.frames.filter(isParentShadow)

    for (const shape of pageShapes) {
      if (overlaps(shape.x, shape.y, shape.w, shape.h)) await drawShape(ctx, shape, page, scale, shape.image ? content.assets[shape.image.assetId] : undefined)
    }
    for (const image of pageImages) {
      if (!overlaps(image.x, image.y, image.w, image.h)) continue
      const asset = content.assets[image.assetId]
      if (asset) await drawImage(ctx, image, asset, page, scale)
    }
    await drawTextDom(ctx, { doc: content.doc, frames: pageFrames, images: content.images, paragraphStyles: content.paragraphStyles, sections: content.sections, storyFrames: content.frames }, flows, page, scale)
    for (const shape of parentShapes) {
      if (overlaps(shape.x, shape.y, shape.w, shape.h)) await drawShape(ctx, shape, page, scale, shape.image ? content.assets[shape.image.assetId] : undefined)
    }
    for (const image of parentImages) {
      if (!overlaps(image.x, image.y, image.w, image.h)) continue
      const asset = content.assets[image.assetId]
      if (asset) await drawImage(ctx, image, asset, page, scale)
    }
    await drawTextDom(ctx, { doc: content.doc, frames: parentFrames, images: content.images, paragraphStyles: content.paragraphStyles, sections: content.sections, storyFrames: content.frames }, flows, page, scale)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return canvas
  }

  // shapes and pictures, in document order (no explicit z is fine here — this app doesn't expose a merged
  // stacking order at this layer, and export ordering by array position matches how they were placed)
  for (const shape of content.shapes) {
    if (!overlaps(shape.x, shape.y, shape.w, shape.h)) continue
    await drawShape(ctx, shape, page, scale, shape.image ? content.assets[shape.image.assetId] : undefined)
  }
  for (const image of content.images) {
    if (!overlaps(image.x, image.y, image.w, image.h)) continue
    const asset = content.assets[image.assetId]
    if (asset) await drawImage(ctx, image, asset, page, scale)
  }
  await drawTextDom(ctx, { doc: content.doc, frames: content.frames, images: content.images, paragraphStyles: content.paragraphStyles, sections: content.sections }, flows, page, scale)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas
}

/** Renders the chosen page range to a PDF (one raster image per page, at the chosen DPI — the browser's own text
 *  engine draws every line, the same one already proven correct for Hebrew throughout the app, so nothing here can
 *  scramble RTL/BiDi the way a hand-rolled vector-text-plus-embedded-font pipeline realistically could), then
 *  downloads it and opens it in a new tab. `onProgress(done, total)` fires after each page renders. */
export async function exportPdf(
  content: { doc: DocSettings; frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[]; assets: Assets; paragraphStyles: ParagraphStyleRecord[]; sections: PageSection[] },
  options: PdfExportOptions,
  fileBaseName: string,
  onProgress?: (done: number, total: number) => void,
  /** a window opened synchronously from the triggering click, so navigating it to the result isn't blocked as a
   *  popup once the (multi-page, `await`-heavy) render work below is done */
  viewWindow?: Window | null,
) {
  const rects = pageRects(content.doc)
  const footnoteConfig = content.doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG
  const provisionalFlows = flowFrames(content.frames, content.images, footnoteConfig, undefined, new Map(), content.paragraphStyles)
  const frameById = new Map(content.frames.map((frame) => [frame.id, frame]))
  const numbering = numberFootnotes([...provisionalFlows].flatMap(([frameId, flow]) => {
    const frame = frameById.get(frameId)
    if (!frame) return []
    const page = ownerPage(rects, frame.x + frame.w / 2, frame.y + frame.h / 2)
    const pageRect = rects[page]
    const spread = pageRect ? Math.round(pageRect.y * 1000) : page
    return flow.footnoteReferences.map((note) => ({ id: note.id, page, spread, frameX: frame.x, frameY: frame.y, anchor: note.anchor }))
  }), footnoteConfig, content.doc.binding)
  const flows = numbering.size
    ? flowFramesWithFootnoteContinuation(content.frames, content.images, footnoteConfig, numbering, primaryTextFrameOrder(content.doc, content.frames), content.paragraphStyles)
    : provisionalFlows
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
    return false
  }
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const { openPath } = await import('@tauri-apps/plugin-opener')
    const path = await save({ defaultPath: `${fileBaseName}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!path) return false
    await writeFile(path, new Uint8Array(pdf.output('arraybuffer')))
    try {
      await openPath(path)
    } catch (error) {
      console.warn('PDF was saved but could not be opened automatically.', error)
    }
    return true
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
  return true
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
