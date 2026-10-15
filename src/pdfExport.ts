import { localeTag, t } from './i18n'
import { materializeSoftHyphens } from './softHyphens'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { cssTextAlign, cssTextDirection, effectiveLeading, DEFAULT_FOOTNOTE_CONFIG, RUNNING_HEADER_MARKER, textFlowBoxOf, wordSpacingPt, type Asset, type Assets, type BlendMode, type CharacterStyleRecord, type DocSettings, type Feather, type ImageFrame, type ObjectStyleRecord, type PageSection, type ParagraphStyleRecord, type ShapeFrame, type TextFrame } from './document'
import { ownerPage, pageRects, parentShadowContent, runningHeaderLookup, type DocContent, type PageRect } from './pages'
import { markHiddenByLayer } from './layers'
import { footnoteDividerHeight, footnoteDividerTextStyle, footnoteLabelParts, footnoteReferenceLook, footnoteRestartMarks, footnoteTextStyle, numberFootnotes } from './footnoteLayout'
import { primaryTextFrameOrder, primaryTextFramePageGroups } from './placeText'
import { layoutEndnotes } from './endnotes'
import { buildParagraphNodes, buildWrapFloats } from './richtext'
import { imageGeometry, shapePath } from './shapes'
import { buildTableDom, layoutOfShape } from './tableLayout'
import { flowFrames, flowFramesWithFootnoteContinuation, type FrameFlow } from './textLayout'
import { withDecorations } from './decorations'
import { withStyleLayers } from './styleLayers'
import { floatsFor } from './wrap'
import { isTauri } from './fileio'
import { hexToRgb, linearGradientLine } from './colorModels'
import { normalizeRuns } from './story'
import { tocDisplayMarkers } from './toc'
import { applyFeatherCanvasMask } from './feather'
import { blurPadding, blurRgba } from './canvasBlur'
import { addCmykPicture, rgbToInks } from './cmykPage'
import { countPicture, emptyReport, extractGlyphs, type FrameGeometry, type PictureReason, type VectorGlyph, type VectorReport } from './vectorText'
import { registerFont } from './fontFiles'
import { isOrnamentDecoration, ornamentSideMarkup } from './footnoteOrnaments'
import { lineProfileShape } from './lineProfile'
import { drawPathText } from './pathTextDraw'
import { letterCenterShift } from './headingMetrics'
import { shapeToVector, writeShapes, type VectorShape } from './vectorShapes'
import { stackOrder } from './stacking'
import { pageNumberLabel, substituteMarker } from './numbering'
import { outerRoomOf } from './printSheet'
import { applyWhitePoint, effectiveWhitePoint } from './whitePoint'

export interface PdfExportOptions {
  /** 1-based, inclusive; null = the whole document */
  range: { from: number; to: number } | null
  bleed: boolean
  /** points, only used when `bleed` is on */
  bleedPt: number
  cropMarks: boolean
  /** a target at the middle of each side of the page, outside the bleed */
  registrationMarks?: boolean
  /** a strip of the inks (and of greys) along the bottom, outside the bleed */
  colorBars?: boolean
  /** the slug (information area): empty space outside the bleed, `slugPt` points from the edge of the page */
  slug?: boolean
  slugPt?: number
  /** the name of the file, the page and the date are written in the slug */
  pageInfo?: boolean
  /** the name written in the slug (the export of one file puts its own name there) */
  infoName?: string
  /** pixels per inch for placed pictures */
  dpi: number
  /** the colours the PDF is written in: RGB as the screen has them (the default), or CMYK for a printing press */
  colorMode?: 'rgb' | 'cmyk'
  /** plain text written as real text (in its font, which is put in the PDF) instead of as a part of the page picture */
  vectorText?: boolean
  /** filled in by the export, when `vectorText` is on: how many frames of text were written as text, and why the others were not */
  vectorReport?: VectorReport
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

export function resolvePdfRunningHeader(frame: TextFrame, page: number, headerAtPage: ReturnType<typeof runningHeaderLookup>): TextFrame {
  if (!frame.runningHeaderStyleId || !frame.text.includes(RUNNING_HEADER_MARKER)) return frame
  const label = headerAtPage(page, frame.runningHeaderStyleId, frame.runningHeaderStrategy ?? 'last')
  const replacement = substituteMarker(frame.text, normalizeRuns(frame.text, frame.runs, frame), RUNNING_HEADER_MARKER, label)
  return { ...frame, ...replacement }
}

function applyPaddedFeatherMask(canvas: HTMLCanvasElement, feather: Feather, x: number, y: number, width: number, height: number, scale: number) {
  const mask = document.createElement('canvas')
  mask.width = canvas.width
  mask.height = canvas.height
  const maskContext = mask.getContext('2d')!
  maskContext.fillStyle = '#000000'
  maskContext.fillRect(x, y, width, height)
  maskContext.save()
  maskContext.translate(x, y)
  applyFeatherCanvasMask(maskContext, feather, width, height, scale)
  maskContext.restore()

  const context = canvas.getContext('2d')!
  context.save()
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)
  context.restore()
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
  // the white point (only with multiply): what is nearly white becomes white, so that it does not darken what is under it
  const whitePoint = image.blendMode === 'multiply' ? effectiveWhitePoint(image.whitePoint) : null
  if (whitePoint) {
    const pixels = layerContext.getImageData(0, 0, layer.width, layer.height)
    applyWhitePoint(pixels.data, whitePoint)
    layerContext.putImageData(pixels, 0, 0)
  }
  if (image.feather) applyFeatherCanvasMask(layerContext, image.feather, boxW, boxH, scale)
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
  /** when given, frames of plain text are not drawn but handed over (as glyphs) to be written to the PDF as real text */
  vector?: { sink: VectorGlyph[]; report?: VectorReport },
): Promise<number> {
  let drawn = 0
  if (!skipFeather && content.frames.some((frame) => frame.feather)) {
    let index = 0
    while (index < content.frames.length) {
      if (content.frames[index].feather) {
        const frame = content.frames[index++]
        if (vector?.report && flows.get(frame.id)?.slice) countPicture(vector.report, 'feather')
        const layer = document.createElement('canvas')
        layer.width = Math.max(1, Math.ceil(page.w * scale))
        layer.height = Math.max(1, Math.ceil(page.h * scale))
        const layerContext = layer.getContext('2d')!
        drawn += await drawTextDom(layerContext, { ...content, frames: [frame], storyFrames: content.storyFrames ?? content.frames }, flows, page, scale, true)
        layerContext.save()
        layerContext.globalCompositeOperation = 'destination-in'
        const width = frame.w * scale
        const height = frame.h * scale
        layerContext.translate((frame.x - page.x + frame.w / 2) * scale, (frame.y - page.y + frame.h / 2) * scale)
        if (frame.rotation) layerContext.rotate((frame.rotation * Math.PI) / 180)
        layerContext.translate(-width / 2, -height / 2)
        applyFeatherCanvasMask(layerContext, frame.feather!, width, height, scale)
        layerContext.restore()
        ctx.drawImage(layer, 0, 0)
      } else {
        const start = index
        while (index < content.frames.length && !content.frames[index].feather) index++
        drawn += await drawTextDom(ctx, { ...content, frames: content.frames.slice(start, index) }, flows, page, scale, true, vector)
      }
    }
    return drawn
  }
  const footnoteConfig = content.doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG
  const root = document.createElement('div')
  root.className = 'pdf-export-root'
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
  const plainFrames: { frame: TextFrame; outer: HTMLElement; host: HTMLElement }[] = []
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
        direction: cssTextDirection(style.direction).direction,
        ...(cssTextDirection(style.direction).unicodeBidi === 'plaintext' ? { unicodeBidi: 'plaintext' } : {}),
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        textRendering: 'geometricPrecision',
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : '',
        transformOrigin: 'center center',
      })
      // a text scale draws the text bigger or smaller than it was laid out: as on screen, the text sits in a box of the layout's
      // size (the frame divided by the scale) that is scaled up to the frame
      const flowBox = textFlowBoxOf(frame)
      let host = outer
      if (frame.textScale) {
        host = document.createElement('div')
        Object.assign(host.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          width: `${flowBox.w}px`,
          height: `${flowBox.h}px`,
          transform: `scale(${frame.textScale.x > 0 ? frame.textScale.x : 1}, ${frame.textScale.y > 0 ? frame.textScale.y : 1})`,
          transformOrigin: '0 0',
        })
        outer.appendChild(host)
      }
      const inner = document.createElement('div')
      Object.assign(inner.style, {
        width: `${flowBox.w}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
        fontSize: `${style.fontSize}px`,
        fontWeight: String(style.weight),
        fontStyle: style.italic ? 'italic' : 'normal',
        lineHeight: `${effectiveLeading(style)}px`,
        ...cssTextAlign(style.align),
        wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : '',
        paddingTop: (!hasPrev ? flow.spaceBeforeFirst : 0) + flow.firstLineLift ? `${(!hasPrev ? flow.spaceBeforeFirst : 0) + flow.firstLineLift}px` : '',
        height: `${flowBox.h - flow.footnoteHeight + (!hasNext ? flow.spaceAfterLast : 0)}px`,
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
            footnoteReferenceGap: footnoteConfig.referenceGap,
            footnoteReferenceVerticalOffset: footnoteConfig.referenceVerticalOffset,
            footnoteReferenceLook: footnoteReferenceLook(footnoteConfig, content.paragraphStyles),
            tocPageMarkers: tocMarkers?.pageNumbers,
            tocLeaderMarkers: tocMarkers?.leaders,
            outlineMode: 'shadow',
            direction: style.direction,
          },
          storyFrames.find((candidate) => candidate.id === flow.headId)?.paragraphStylePatches,
          style.align,
          continuesAtEnd,
        ),
      )
      host.appendChild(inner)
      if (flow.footnotes.length) {
        const footnotes = document.createElement('div')
        footnotes.className = 'footnotes-area'
        Object.assign(footnotes.style, {
          position: 'absolute',
          left: `${flow.footnoteAreaX ?? 0}px`,
          right: flow.footnoteAreaX === undefined ? '0' : 'auto',
          bottom: '0',
          width: `${flow.footnoteAreaWidth ?? flowBox.w}px`,
          height: `${flow.footnoteHeight}px`,
          direction: cssTextDirection(style.direction).direction,
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          color: '#111',
        })
        if (footnoteConfig.dividerMode === 'heading') {
          const headingStyle = footnoteDividerTextStyle(footnoteConfig, content.paragraphStyles)
          const heading = document.createElement('div')
          heading.className = 'footnote-divider-heading'
          heading.dir = 'rtl'
          // the heading is centred by a wrapper (flex), not by `left: 50%` and a transform: the picture of the page is made by html2canvas,
          // which clips an element with `overflow: hidden` at the place it has before its transform - only the half of the heading to
          // the right of the middle of the area came out (a cut title, and the line on the other side missing)
          Object.assign(heading.style, {
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            flex: '0 1 auto',
            // the width that is set is the least the heading has: a longer text (a big font) and its ornaments widen it, up to the whole width
            width: 'max-content',
            minWidth: `${footnoteConfig.dividerWidth}%`,
            maxWidth: '100%',
            height: `${footnoteDividerHeight(footnoteConfig, content.paragraphStyles)}px`,
            gap: footnoteConfig.dividerHeadingLines ? `${footnoteConfig.dividerHeadingGap ?? Math.max(6, headingStyle.fontSize * 0.4)}px` : '0',
            color: headingStyle.color ?? '#111111',
            fontFamily: headingStyle.fontFamily,
            fontSize: `${headingStyle.fontSize}px`,
            fontWeight: String(headingStyle.weight),
            fontStyle: headingStyle.italic ? 'italic' : 'normal',
            lineHeight: `${footnoteDividerHeight(footnoteConfig, content.paragraphStyles)}px`,
            letterSpacing: headingStyle.tracking ? `${(headingStyle.tracking / 1000) * headingStyle.fontSize}px` : undefined,
          })
          if (footnoteConfig.dividerHeadingLines && isOrnamentDecoration(footnoteConfig.dividerHeadingDecoration)) heading.style.overflow = 'visible'
          // the lines and ornaments are level with the middle of the heading's letters, not with the middle of its line
          const headingShift = letterCenterShift(headingStyle, footnoteDividerHeight(footnoteConfig, content.paragraphStyles), footnoteConfig.dividerText)
          const appendRule = (side: 'right' | 'left') => {
            if (isOrnamentDecoration(footnoteConfig.dividerHeadingDecoration)) {
              // the ornamented lines are described as HTML (footnoteOrnaments.ts), the same as on the screen
              const holder = document.createElement('template')
              holder.innerHTML = ornamentSideMarkup({
                decoration: footnoteConfig.dividerHeadingDecoration,
                side,
                color: headingStyle.color ?? '#111111',
                thickness: footnoteConfig.dividerThickness,
                height: footnoteDividerHeight(footnoteConfig, content.paragraphStyles),
                fontSize: headingStyle.fontSize,
                shift: headingShift - (footnoteConfig.dividerOrnamentOffset ?? 0),
                scale: (footnoteConfig.dividerOrnamentScale ?? 100) / 100,
                custom: footnoteConfig.dividerOrnament,
              })
              if (holder.content.firstElementChild) heading.appendChild(holder.content.firstElementChild)
              return
            }
            const segment = document.createElement('span')
            segment.className = `footnote-divider-heading-line side-${side} decor-${footnoteConfig.dividerHeadingDecoration}`
            if (Math.abs(headingShift) > 0.05) segment.style.top = `${headingShift}px`
            if (footnoteConfig.dividerHeadingDecoration === 'needle') {
              Object.assign(segment.style, { border: '0', height: `${Math.max(1, footnoteConfig.dividerThickness)}px` })
            } else {
              segment.style.borderTopWidth = `${footnoteConfig.dividerThickness}px`
            }
            const addDecoration = (edge: 'left' | 'right', kind: 'curl' | 'diamond') => {
              const decoration = document.createElement('span')
              decoration.className = `pdf-footnote-divider-decoration ${kind} ${edge}`
              if (kind === 'curl') decoration.textContent = '❧'
              segment.appendChild(decoration)
            }
            if (footnoteConfig.dividerHeadingDecoration === 'curl') {
              addDecoration(side === 'right' ? 'right' : 'left', 'curl')
            } else if (footnoteConfig.dividerHeadingDecoration === 'outer') {
              addDecoration(side === 'right' ? 'right' : 'left', 'diamond')
            } else if (footnoteConfig.dividerHeadingDecoration === 'both') {
              addDecoration('left', 'diamond')
              addDecoration('right', 'diamond')
            }
            heading.appendChild(segment)
          }
          if (footnoteConfig.dividerHeadingLines) appendRule('right')
          const title = document.createElement('span')
          title.className = 'footnote-divider-heading-text'
          title.textContent = footnoteConfig.dividerText
          heading.appendChild(title)
          if (footnoteConfig.dividerHeadingLines) appendRule('left')
          const headingRow = document.createElement('div')
          Object.assign(headingRow.style, {
            position: 'absolute',
            display: 'flex',
            justifyContent: 'center',
            left: '0',
            right: '0',
            top: `${footnoteConfig.dividerGap}px`,
            height: `${footnoteDividerHeight(footnoteConfig, content.paragraphStyles)}px`,
            pointerEvents: 'none',
          })
          headingRow.appendChild(heading)
          footnotes.appendChild(headingRow)
        } else {
          const divider = document.createElement('div')
          divider.className = 'footnote-divider'
          Object.assign(divider.style, {
            position: 'absolute',
            top: `${footnoteConfig.dividerGap}px`,
            left: footnoteConfig.dividerAlignment === 'left' ? '0' : footnoteConfig.dividerAlignment === 'center' ? '50%' : 'auto',
            right: footnoteConfig.dividerAlignment === 'right' ? '0' : 'auto',
            transform: footnoteConfig.dividerAlignment === 'center' ? 'translateX(-50%)' : 'none',
            width: `${footnoteConfig.dividerWidth}%`,
            borderTop: `${footnoteConfig.dividerThickness}px solid currentColor`,
            opacity: '0.7',
          })
          footnotes.appendChild(divider)
        }
        for (const note of flow.footnotes) {
          const noteStyle = note.style ?? footnoteTextStyle(footnoteConfig, content.paragraphStyles, undefined, style)
          const item = document.createElement('div')
          item.className = 'footnote-item'
          Object.assign(item.style, {
            position: 'absolute',
            display: 'flex',
            alignItems: 'flex-start',
            gap: `${footnoteConfig.numberTextGap}px`,
            left: `${style.direction === 'ltr' ? note.x : (flow.footnoteAreaWidth ?? flowBox.w) - note.x - note.width}px`,
            top: `${note.y}px`,
            width: `${note.width}px`,
            height: `${note.height}px`,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            textAlign: style.direction === 'ltr' && footnoteConfig.alignment === 'right' ? 'left' : footnoteConfig.alignment,
          })
          const number = document.createElement('span')
          number.className = 'footnote-number'
          number.dir = 'rtl'
          number.style.fontSize = `${noteStyle.fontSize}px`
          const referenceLabel = note.continued ? '' : String(note.referenceNumber)
          for (const part of footnoteLabelParts(referenceLabel)) {
            const labelPart = document.createElement('span')
            labelPart.dir = part.direction
            labelPart.textContent = part.text
            number.appendChild(labelPart)
          }
          const text = document.createElement('span')
          text.className = 'footnote-content'
          Object.assign(text.style, { flex: '1', minWidth: '0' })
          Object.assign(item.style, { fontFamily: noteStyle.fontFamily, fontSize: `${noteStyle.fontSize}px`, fontWeight: String(noteStyle.weight), fontStyle: noteStyle.italic ? 'italic' : 'normal', lineHeight: `${effectiveLeading(noteStyle)}px`, wordSpacing: wordSpacingPt(noteStyle) ? `${wordSpacingPt(noteStyle)}px` : '', paddingLeft: noteStyle.indentLeft ? `${noteStyle.indentLeft}px` : '', paddingRight: noteStyle.indentRight ? `${noteStyle.indentRight}px` : '', ...cssTextAlign(noteStyle.align), color: noteStyle.color ?? '#111' })
          text.appendChild(buildParagraphNodes(note.content, normalizeRuns(note.content, note.runs ?? [], noteStyle), 1, { outlineMode: 'shadow' }))
          if (!note.continued) item.appendChild(number)
          item.appendChild(text)
          footnotes.appendChild(item)
        }
        host.appendChild(footnotes)
      }
      root.appendChild(outer)
      if (vector) {
        const reason = framePictureReason(frame, flow)
        if (reason) {
          if (vector.report) countPicture(vector.report, reason)
        } else plainFrames.push({ frame, outer, host })
      }
    }
    await document.fonts?.ready
    // a soft hyphen the line was broken at is a hyphen in what is written; the others are not there
    materializeSoftHyphens(root)
    if (vector) {
      // a frame of plain text goes to the PDF as text; one that has more than that stays here and is drawn as a picture
      for (const { frame, outer, host } of plainFrames) {
        const geometry: FrameGeometry = { x: frame.x - page.x, y: frame.y - page.y, w: frame.w, h: frame.h, rotation: frame.rotation ?? 0, scale: frame.textScale?.x ?? 1 }
        const result = await extractGlyphs(outer, geometry, host === outer ? [outer] : [outer, host], host)
        if ('glyphs' in result) {
          vector.sink.push(...result.glyphs)
          outer.remove()
          if (vector.report) vector.report.text++
        } else if (vector.report) countPicture(vector.report, result.reason)
      }
    }
    if (root.childElementCount === 0) return drawn
    const raster = await html2canvas(root, {
      backgroundColor: null,
      scale,
      width: page.w,
      height: page.h,
      logging: false,
    })
    ctx.drawImage(raster, 0, 0)
    return drawn + root.childElementCount
  } finally {
    root.remove()
  }
}

/** whether some object on a page (or its bleed) is mixed with what is under it */
function pageHasBlend(content: ExportContent, page: PageRect, bleedPt: number) {
  const near = (item: { x: number; y: number; w: number; h: number }) =>
    item.x < page.x + page.w + bleedPt && item.x + item.w > page.x - bleedPt && item.y < page.y + page.h + bleedPt && item.y + item.h > page.y - bleedPt
  return content.frames.some((frame) => frame.blendMode && !frame.hidden && near(frame)) ||
    content.images.some((image) => image.blendMode && !image.hidden && near(image)) ||
    content.shapes.some((shape) => shape.blendMode && !shape.hidden && near(shape))
}

/** Why a frame of text cannot be written as text whatever is in it, or null when it can (what is in it is looked at later). */
function framePictureReason(frame: TextFrame, flow: FrameFlow): PictureReason | null {
  if (frame.rasterized) return 'rasterized'
  if (frame.feather) return 'feather'
  if ((frame.opacity ?? 1) < 1) return 'faded'
  if (flow.footnotes.length > 0) return 'footnotes'
  if (frame.textScale && Math.abs(frame.textScale.x - frame.textScale.y) > 1e-6) return 'uneven-scale'
  return null
}

/** a table is drawn from the same layout the screen uses, rasterized from a DOM copy of it (its text is set by the browser, like a frame's) */
async function drawTable(ctx: CanvasRenderingContext2D, shape: ShapeFrame, page: PageRect, scale: number) {
  const layout = layoutOfShape(shape)
  if (!layout || !shape.table) return
  const { outer, rowStroke, colStroke } = shape.table.style
  const widest = Math.max(1, outer?.width ?? 0, rowStroke?.width ?? 0, colStroke?.width ?? 0)
  const pad = Math.ceil(widest / 2) + 1
  const root = buildTableDom({ table: shape.table, fill: shape.fill }, layout, pad)
  Object.assign(root.style, { position: 'fixed', left: '-100000px', top: '0' })
  document.body.appendChild(root)
  try {
    await document.fonts?.ready
    const raster = await html2canvas(root, { backgroundColor: null, scale, width: layout.width + 2 * pad, height: layout.height + 2 * pad, logging: false })
    if (shape.feather) applyPaddedFeatherMask(raster, shape.feather, pad * scale, pad * scale, layout.width * scale, layout.height * scale, scale)
    ctx.save()
    ctx.globalAlpha = shape.opacity ?? 1
    ctx.drawImage(raster, (shape.x - page.x - pad) * scale, (shape.y - page.y - pad) * scale, (layout.width + 2 * pad) * scale, (layout.height + 2 * pad) * scale)
    ctx.restore()
  } finally {
    root.remove()
  }
}

async function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeFrame, page: PageRect, scale: number, asset?: Asset) {
  if (shape.kind === 'table') return drawTable(ctx, shape, page, scale)
  const original = shape
  // a line thicker in some places than others is drawn as the shape it covers
  shape = lineProfileShape(shape) ?? shape
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
    applyFeatherCanvasMask(layerContext, shape.feather, w, h, scale)
    ctx.save()
    ctx.translate(boxX + w / 2, boxY + h / 2)
    if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
    ctx.globalAlpha = shape.opacity ?? 1
    applyCanvasShadow(ctx, shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, shape.shadowColor, scale)
    ctx.drawImage(layer, -w / 2, -h / 2, w, h)
    ctx.restore()
    return
  }
  if ((shape.blur ?? 0) > 0) {
    // blurred: the shape is drawn alone on a canvas with room round it, blurred there, and put on the page (in the PDF it is a picture)
    const sigma = shape.blur! * scale
    const room = blurPadding(sigma) + Math.ceil((shape.strokeWidth * scale) / 2)
    const layer = document.createElement('canvas')
    layer.width = Math.max(1, Math.ceil(w) + 2 * room)
    layer.height = Math.max(1, Math.ceil(h) + 2 * room)
    const layerContext = layer.getContext('2d', { willReadFrequently: true })!
    await drawShape(layerContext, { ...shape, x: room / scale, y: room / scale, opacity: 1, rotation: undefined, blur: undefined, feather: undefined, shadowOpacity: 0 }, { x: 0, y: 0, w: shape.w, h: shape.h }, scale, asset)
    const pixels = layerContext.getImageData(0, 0, layer.width, layer.height)
    blurRgba(pixels.data, layer.width, layer.height, sigma)
    layerContext.putImageData(pixels, 0, 0)
    ctx.save()
    ctx.translate(boxX + w / 2, boxY + h / 2)
    if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
    ctx.globalAlpha = shape.opacity ?? 1
    applyCanvasShadow(ctx, shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, shape.shadowColor, scale)
    ctx.drawImage(layer, -w / 2 - room, -h / 2 - room)
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
    // a drawn path has round ends unless it was made with flat ones (and then sharp corners), as on the screen and in an SVG file
    ctx.lineJoin = shape.kind === 'path' && shape.strokeCap === 'butt' ? 'miter' : 'round'
    if (shape.kind === 'path') ctx.lineCap = shape.strokeCap ?? 'round'
    if (shape.kind === 'line') {
      ctx.lineCap = shape.strokeCap ?? 'butt'
      if (shape.strokeDash === 'dashed') ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2])
    }
    ctx.stroke(path)
    clearCanvasShadow(ctx)
  }
  if (original.pathText) {
    drawPathText(ctx, original, scale, {
      apply: (style) => applyCanvasShadow(ctx, style.shadowOffsetX, style.shadowOffsetY ?? style.shadowOffset, style.shadowOpacity, style.shadowColor, scale),
      clear: () => clearCanvasShadow(ctx),
    })
  }
  ctx.restore()
}

/**
 * One part of a page, bottom to top: a picture (the page's own pixels; the first one is the paper), text to be written as text,
 * shapes to be drawn as shapes, or a placed picture that goes in the PDF as a picture of its own (`x`, `y`, `w`, `h` in points from
 * the page's top-left; it may reach into the bleed).
 */
export type PageLayer =
  | { kind: 'picture'; canvas: HTMLCanvasElement }
  | { kind: 'text'; glyphs: VectorGlyph[] }
  | { kind: 'shapes'; shapes: VectorShape[] }
  | { kind: 'image'; canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }

/** One page, rendered to a canvas at the chosen DPI. `page` is the TRIM box; `bleedPt` extends the canvas (and what
 *  gets drawn) beyond it on every side, so pictures/shapes that bleed off the page still print all the way to the
 *  cut line. */
export async function renderPage(
  content: ExportContent,
  flows: Map<string, FrameFlow>,
  page: PageRect,
  bleedPt: number,
  dpi: number,
): Promise<HTMLCanvasElement> {
  const [layer] = await renderPageLayers(content, flows, page, bleedPt, dpi, false)
  return (layer as { kind: 'picture'; canvas: HTMLCanvasElement }).canvas
}

/**
 * The same page in layers. With `vector` off it is one picture. With it on, the frames of plain text come as text, plain shapes
 * as shapes and placed pictures as pictures of their own; what is left (and lies above any of those) is a picture with a
 * see-through background: picture, text, picture, shapes... in the order the objects are stacked.
 */
export async function renderPageLayers(
  content: ExportContent,
  flows: Map<string, FrameFlow>,
  page: PageRect,
  bleedPt: number,
  dpi: number,
  vectorRequested: false | { report?: VectorReport },
): Promise<PageLayer[]> {
  // an object that is mixed with what is under it (a blend mode) needs what is under it as pixels: such a page is one picture
  const vector = vectorRequested && !pageHasBlend(content, page, bleedPt) ? vectorRequested : false
  const scale = pxPerPt(dpi)
  const w = (page.w + 2 * bleedPt) * scale
  const h = (page.h + 2 * bleedPt) * scale
  const report = vector ? vector.report : undefined
  const layers: PageLayer[] = []
  let current: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; dirty: boolean } | null = null
  /** the picture being drawn on; the first one of a page starts as white paper, the ones above it as nothing */
  const surface = () => {
    if (!current) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w)
      canvas.height = Math.round(h)
      const context = canvas.getContext('2d')!
      if (layers.length === 0) {
        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.translate(bleedPt * scale, bleedPt * scale)
      current = { canvas, ctx: context, dirty: false }
    }
    return current
  }
  /** the picture is finished: it is kept when it has something on it (or is the paper), and what comes next starts a new one */
  const closePicture = () => {
    if (current && (current.dirty || layers.length === 0)) {
      current.ctx.setTransform(1, 0, 0, 1, 0, 0)
      layers.push({ kind: 'picture', canvas: current.canvas })
    }
    current = null
  }
  const area = { x: page.x - bleedPt, y: page.y - bleedPt, w: page.w + 2 * bleedPt, h: page.h + 2 * bleedPt }
  const overlaps = (ox: number, oy: number, ow: number, oh: number) => ox < area.x + area.w && ox + ow > area.x && oy < area.y + area.h && oy + oh > area.y
  /** shapes that are to be drawn as shapes, waiting for whatever comes before them in the stack to be put down */
  let pendingShapes: VectorShape[] = []
  const flushShapes = () => {
    if (pendingShapes.length === 0) return
    if (!current && layers.length === 0) surface()
    closePicture()
    layers.push({ kind: 'shapes', shapes: pendingShapes })
    pendingShapes = []
  }
  /** a placed picture drawn on a canvas of its own, as big as the part of it that is on the page (and the bleed): null when none of it is */
  const imageLayer = async (image: ImageFrame, asset: Asset): Promise<PageLayer | null> => {
    const turn = ((image.rotation ?? 0) * Math.PI) / 180
    const boxW = Math.abs(image.w * Math.cos(turn)) + Math.abs(image.h * Math.sin(turn))
    const boxH = Math.abs(image.w * Math.sin(turn)) + Math.abs(image.h * Math.cos(turn))
    const cx = image.x + image.w / 2
    const cy = image.y + image.h / 2
    const x0 = Math.max(cx - boxW / 2, area.x)
    const y0 = Math.max(cy - boxH / 2, area.y)
    const x1 = Math.min(cx + boxW / 2, area.x + area.w)
    const y1 = Math.min(cy + boxH / 2, area.y + area.h)
    if (x1 <= x0 || y1 <= y0) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil((x1 - x0) * scale))
    canvas.height = Math.max(1, Math.ceil((y1 - y0) * scale))
    const context = canvas.getContext('2d')!
    context.translate(-(x0 - page.x) * scale, -(y0 - page.y) * scale)
    await drawImage(context, image, asset, page, scale)
    return { kind: 'image', canvas, x: x0 - page.x, y: y0 - page.y, w: canvas.width / scale, h: canvas.height / scale }
  }
  /** an object drawn on a layer of its own and laid on the page with the blend mode: it is mixed with everything drawn so far */
  const drawBlended = async (mode: BlendMode, paint: (layer: CanvasRenderingContext2D) => Promise<unknown>) => {
    const target = surface()
    target.dirty = true
    const layer = document.createElement('canvas')
    layer.width = target.canvas.width
    layer.height = target.canvas.height
    const layerContext = layer.getContext('2d')!
    layerContext.translate(bleedPt * scale, bleedPt * scale)
    await paint(layerContext)
    target.ctx.save()
    target.ctx.setTransform(1, 0, 0, 1, 0, 0)
    target.ctx.globalCompositeOperation = mode
    target.ctx.drawImage(layer, 0, 0)
    target.ctx.restore()
  }
  const isParentShadow = (item: { id: string }) => item.id.startsWith('parent-shadow:')
  const parentContentAbove = content.doc.parentItemsAbovePageContent ?? false

  const drawObjects = async (frames: TextFrame[], images: ImageFrame[], shapes: ShapeFrame[]) => {
    const frameById = new Map(frames.map((frame) => [frame.id, frame]))
    const imageById = new Map(images.map((image) => [image.id, image]))
    const shapeById = new Map(shapes.map((shape) => [shape.id, shape]))
    const ordered = stackOrder(frames, images, shapes, content.layerOrder ?? ['layer-1'])
    let pendingFrames: TextFrame[] = []
    const flushFrames = async () => {
      if (pendingFrames.length === 0) return
      flushShapes()
      const sink: VectorGlyph[] = []
      const target = surface()
      const drawn = await drawTextDom(target.ctx, {
        doc: content.doc,
        frames: pendingFrames,
        images: content.images,
        paragraphStyles: content.paragraphStyles,
        sections: content.sections,
        storyFrames: content.frames,
      }, flows, page, scale, false, vector ? { sink, report: vector.report } : undefined)
      if (drawn > 0) target.dirty = true
      if (sink.length > 0) {
        closePicture()
        layers.push({ kind: 'text', glyphs: sink })
      }
      pendingFrames = []
    }
    for (const item of ordered) {
      if (item.kind === 'frame') {
        const frame = frameById.get(item.id)
        if (frame?.blendMode) {
          await flushFrames()
          const blended = frame
          await drawBlended(frame.blendMode, (layer) => drawTextDom(layer, {
            doc: content.doc,
            frames: [blended],
            images: content.images,
            paragraphStyles: content.paragraphStyles,
            sections: content.sections,
            storyFrames: content.frames,
          }, flows, page, scale, false))
          continue
        }
        if (frame) pendingFrames.push(frame)
        continue
      }
      await flushFrames()
      if (item.kind === 'shape') {
        const shape = shapeById.get(item.id)
        if (shape?.blendMode && overlaps(shape.x, shape.y, shape.w, shape.h)) {
          const blended = shape
          await drawBlended(shape.blendMode, (layer) => drawShape(layer, blended, page, scale, blended.image ? content.assets[blended.image.assetId] : undefined))
          continue
        }
        if (shape && overlaps(shape.x, shape.y, shape.w, shape.h)) {
          const asVector = vector ? shapeToVector(shape, page.x, page.y) : null
          if (vector && asVector && !('reason' in asVector)) {
            pendingShapes.push(asVector)
            if (report) report.shapes++
          } else {
            if (report) {
              report.shapesPicture++
              if (asVector && 'reason' in asVector) report.shapeReasons[asVector.reason] = (report.shapeReasons[asVector.reason] ?? 0) + 1
            }
            flushShapes()
            const target = surface()
            target.dirty = true
            await drawShape(target.ctx, shape, page, scale, shape.image ? content.assets[shape.image.assetId] : undefined)
          }
        }
      } else {
        const image = imageById.get(item.id)
        if (!image || !overlaps(image.x, image.y, image.w, image.h)) continue
        const asset = content.assets[image.assetId]
        if (!asset) continue
        if (image.blendMode) {
          const blended = image
          await drawBlended(image.blendMode, (layer) => drawImage(layer, blended, asset, page, scale))
          continue
        }
        if (vector && !image.feather && (image.shadowOpacity ?? 0) <= 0) {
          const placed = await imageLayer(image, asset)
          if (placed) {
            flushShapes()
            closePicture()
            layers.push(placed)
            if (report) report.images++
          }
          continue
        }
        if (report) report.imagesPicture++
        flushShapes()
        const target = surface()
        target.dirty = true
        await drawImage(target.ctx, image, asset, page, scale)
      }
    }
    await flushFrames()
  }

  // what is hidden in the Layers panel (itself or its layer) is not drawn; its text still has its place in the story
  const pageFrames = content.frames.filter((frame) => !isParentShadow(frame) && !frame.hidden)
  const parentFrames = content.frames.filter(isParentShadow)
  const pageImages = content.images.filter((image) => !isParentShadow(image) && !image.hidden)
  const parentImages = content.images.filter(isParentShadow)
  const pageShapes = content.shapes.filter((shape) => !isParentShadow(shape) && !shape.hidden)
  const parentShapes = content.shapes.filter(isParentShadow)
  if (parentContentAbove) {
    await drawObjects(pageFrames, pageImages, pageShapes)
    await drawObjects(parentFrames, parentImages, parentShapes)
  } else {
    await drawObjects(parentFrames, parentImages, parentShapes)
    await drawObjects(pageFrames, pageImages, pageShapes)
  }
  flushShapes()
  if (!current && layers.length === 0) surface()
  closePicture()
  return layers
}

/** Renders the chosen page range to a PDF (one raster image per page, at the chosen DPI — the browser's own text
 *  engine draws every line, the same one already proven correct for Hebrew throughout the app, so nothing here can
 *  scramble RTL/BiDi the way a hand-rolled vector-text-plus-embedded-font pipeline realistically could), then
 *  downloads it and opens it in a new tab. `onProgress(done, total)` fires after each page renders. */
/** What a document needs to be drawn: its pages, content and styles. */
export interface ExportContent {
  doc: DocSettings
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  layerOrder?: string[]
  assets: Assets
  paragraphStyles: ParagraphStyleRecord[]
  /** the object styles: what the decorations of the paragraph styles are drawn in */
  objectStyles?: ObjectStyleRecord[]
  /** the character styles: what the style layers of the paragraph styles give */
  characterStyles?: CharacterStyleRecord[]
  sections: PageSection[]
}

/** A document laid out and ready to be drawn page by page. */
export interface PreparedExport {
  content: ExportContent
  flows: Map<string, FrameFlow>
  rects: PageRect[]
}

/** The look of the pages of a PDF: bleed around them, crop marks outside it, the resolution of what is drawn. */
export type PageDrawOptions = Pick<PdfExportOptions, 'bleed' | 'bleedPt' | 'cropMarks' | 'registrationMarks' | 'colorBars' | 'slug' | 'slugPt' | 'pageInfo' | 'infoName' | 'dpi' | 'colorMode' | 'vectorText' | 'vectorReport'>

/** the height of the line of information in the slug, in points */
const SLUG_INFO_SIZE = 7

/**
 * Lays a document out for export: the footnotes are numbered and placed, the endnote pages are added. Nothing is drawn
 * yet - `addPagesToPdf` does that, a page at a time.
 */
export function prepareExport(content: ExportContent): PreparedExport {
  const documentRects = pageRects(content.doc)
  const footnoteConfig = content.doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG
  let source = content
  if (content.frames.some((frame) => frame.runningHeaderStyleId && frame.text.includes(RUNNING_HEADER_MARKER))) {
    const headerFlows = flowFrames(content.frames, content.images, footnoteConfig, undefined, new Map(), content.paragraphStyles)
    const headerAtPage = runningHeaderLookup(content.doc, content.frames, headerFlows, content.paragraphStyles)
    const frames = content.frames.map((frame) => resolvePdfRunningHeader(frame, ownerPage(documentRects, frame.x + frame.w / 2, frame.y + frame.h / 2), headerAtPage))
    if (frames.some((frame, index) => frame !== content.frames[index])) source = { ...content, frames }
  }
  // the decoration of the paragraph styles goes into the patches of the stories: what is laid out and drawn has it (it is not saved)
  const decoratedFrames = withStyleLayers(withDecorations(source.frames, source.paragraphStyles, content.objectStyles ?? []), source.paragraphStyles, content.characterStyles ?? [])
  if (decoratedFrames !== source.frames) source = { ...source, frames: decoratedFrames }
  const primaryFrameIds = primaryTextFrameOrder(source.doc, source.frames)
  const sharedFootnoteGroups = primaryTextFramePageGroups(source.doc, source.frames)
  const provisionalFlows = sharedFootnoteGroups.length
    ? flowFramesWithFootnoteContinuation(source.frames, source.images, footnoteConfig, new Map(), primaryFrameIds, source.paragraphStyles, undefined, sharedFootnoteGroups)
    : flowFrames(source.frames, source.images, footnoteConfig, undefined, new Map(), source.paragraphStyles)
  const frameById = new Map(source.frames.map((frame) => [frame.id, frame]))
  const numbering = numberFootnotes([...provisionalFlows].flatMap(([frameId, flow]) => {
    const frame = frameById.get(frameId)
    if (!frame) return []
    const page = ownerPage(documentRects, frame.x + frame.w / 2, frame.y + frame.h / 2)
    const pageRect = documentRects[page]
    const spread = pageRect ? Math.round(pageRect.y * 1000) : page
    return flow.footnoteReferences.map((note) => ({ id: note.id, page, spread, frameX: frame.x, frameY: frame.y, anchor: note.anchor }))
  }), footnoteConfig, content.doc.binding, footnoteConfig.restart === 'style'
    ? footnoteRestartMarks(provisionalFlows, frameById, footnoteConfig.restartStyleId, (frameId) => {
        const frame = frameById.get(frameId)
        if (!frame) return null
        const page = ownerPage(documentRects, frame.x + frame.w / 2, frame.y + frame.h / 2)
        const pageRect = documentRects[page]
        return { page, spread: pageRect ? Math.round(pageRect.y * 1000) : page, frameX: frame.x, frameY: frame.y }
      })
    : [])
  const bodyFlows = numbering.size
    ? flowFramesWithFootnoteContinuation(source.frames, source.images, footnoteConfig, numbering, primaryFrameIds, source.paragraphStyles, undefined, sharedFootnoteGroups)
    : provisionalFlows
  const endnotePages = layoutEndnotes(source.doc, source.frames, footnoteConfig, numbering, source.paragraphStyles)
  const renderContent = endnotePages.frames.length
    ? { ...source, doc: endnotePages.doc, frames: [...source.frames, ...endnotePages.frames] }
    : source
  return { content: renderContent, flows: new Map([...bodyFlows, ...endnotePages.flows]), rects: pageRects(renderContent.doc) }
}

/**
 * The letters of one text frame as the export would write them to a PDF: where each stands (points from the frame's own top-left,
 * the frame not turned), its size, font and colour. Or the reason the frame is not plain text that can be turned into shapes.
 * Used by "create outlines".
 */
export async function frameLetters(prepared: PreparedExport, frameId: string): Promise<{ glyphs: VectorGlyph[]; frame: TextFrame } | { reason: PictureReason | 'empty' }> {
  const frame = prepared.content.frames.find((candidate) => candidate.id === frameId)
  const flow = prepared.flows.get(frameId)
  if (!frame || !flow || !flow.slice) return { reason: 'empty' }
  // laid out where it is, but not turned: the letters come back as places in the frame, and the shape is turned the way the frame was
  const upright: TextFrame = { ...frame, rotation: 0 }
  const page: PageRect = { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
  const sink: VectorGlyph[] = []
  const report = emptyReport()
  const scratch = document.createElement('canvas')
  scratch.width = 1
  scratch.height = 1
  const content = { ...prepared.content, frames: [upright], storyFrames: prepared.content.frames }
  await drawTextDom(scratch.getContext('2d')!, content, prepared.flows, page, 1, true, { sink, report })
  if (report.text === 1 && sink.length > 0) return { glyphs: sink, frame }
  if (report.text === 1) return { reason: 'empty' }
  const reason = (Object.keys(report.reasons)[0] as PictureReason | undefined) ?? 'empty'
  return { reason }
}

/** What a document is made of, as `exportContentOf` takes it: its own content and its parent (master) pages. */
export type ExportSource = Pick<DocContent, 'doc' | 'frames' | 'images' | 'shapes' | 'assets' | 'paragraphStyles' | 'sections' | 'layerOrder' | 'layers' | 'parents' | 'pageParents' | 'parentOverrides' | 'objectStyles' | 'characterStyles'>

/**
 * A document as the export draws it: its own objects, with what every page shows of its parent (master) pages mixed in
 * behind them - the page numbers written out per page, each running header worked out from where the text really lies
 * (the story is laid out here to know that, only when some parent has a running header). Used for the PDF of one
 * document, the PNG of a page and every chapter of a book, so that they all show the same as the screen.
 */
export function exportContentOf(source: ExportSource): ExportContent {
  const order = source.layerOrder ?? ['layer-1']
  const marked = <T extends { id: string; layerId?: string; hidden?: true; locked?: true }>(items: T[]): T[] => markHiddenByLayer(items, order, source.layers)
  const own: ExportContent = {
    doc: source.doc,
    frames: marked(source.frames),
    images: marked(source.images),
    shapes: marked(source.shapes),
    layerOrder: source.layerOrder,
    assets: source.assets,
    paragraphStyles: source.paragraphStyles,
    ...(source.objectStyles?.length ? { objectStyles: source.objectStyles } : {}),
    ...(source.characterStyles?.length ? { characterStyles: source.characterStyles } : {}),
    sections: source.sections,
  }
  if (!source.pageParents.some(Boolean)) return own
  const hasRunningHeader = source.parents.some((parent) => parent.frames.some((frame) => frame.runningHeaderStyleId))
  const runningHeader = hasRunningHeader ? runningHeaderLookup(source.doc, own.frames, prepareExport(own).flows, source.paragraphStyles) : undefined
  const shadow = parentShadowContent(source.doc, source.parents, source.pageParents, source.sections, own.frames, runningHeader, source.parentOverrides ?? [], own.images, own.shapes)
  return {
    ...own,
    frames: [...shadow.frames, ...own.frames],
    images: [...shadow.images, ...own.images],
    shapes: [...shadow.shapes, ...own.shapes],
  }
}

/** The size of the sheet a page is drawn on: the page, the bleed around it and room for the crop marks outside that. */
export function sheetSizeOf(page: PageRect, options: PageDrawOptions): { w: number; h: number } {
  const bleedPt = options.bleed ? options.bleedPt : 0
  const marksMargin = outerRoomOf(options)
  return { w: page.w + 2 * bleedPt + 2 * marksMargin, h: page.h + 2 * bleedPt + 2 * marksMargin }
}

/** about as much as a PDF can hold in the browser: it is one string, and a string cannot be longer than about 512 MB */
const MAX_PDF_BYTES = 380 * 1024 * 1024
export const TOO_LARGE_MESSAGE = 'הקובץ יהיה גדול מדי כדי להיווצר. בחר איכות של 150 DPI, או ייצא טווח עמודים קטן יותר (ספר: בחלקים).'

/** Pages `from`..`to` (1-based) of a prepared document, added to the PDF (which is made with the first one when there is none yet). */
export async function addPagesToPdf(pdf: jsPDF | null, prepared: PreparedExport, options: PageDrawOptions, from: number, to: number, onPage?: (done: number, total: number) => void): Promise<jsPDF | null> {
  const bleedPt = options.bleed ? options.bleedPt : 0
  const marksMargin = outerRoomOf(options) // room outside the bleed: for the crop marks, and for the slug
  const last = Math.min(prepared.rects.length, to)
  const first = Math.max(1, from)
  const total = Math.max(0, last - first + 1)
  let target = pdf
  let written = 0
  for (let i = first; i <= last; i++) {
    const page = prepared.rects[i - 1]
    if (!page) continue
    const sheet = sheetSizeOf(page, options)
    if (!target) target = new jsPDF({ unit: 'pt', format: [sheet.w, sheet.h], orientation: sheet.w > sheet.h ? 'landscape' : 'portrait' })
    else target.addPage([sheet.w, sheet.h])
    const cmyk = options.colorMode === 'cmyk'
    if (options.vectorText) {
      const layers = await renderPageLayers(prepared.content, prepared.flows, page, bleedPt, options.dpi, { report: options.vectorReport })
      for (const [index, layer] of layers.entries()) {
        if (layer.kind === 'text') {
          writeGlyphs(target, layer.glyphs, marksMargin + bleedPt, marksMargin + bleedPt, cmyk)
          continue
        }
        if (layer.kind === 'shapes') {
          writeShapes(target, layer.shapes, marksMargin + bleedPt, marksMargin + bleedPt, cmyk)
          continue
        }
        if (layer.kind === 'image') {
          const at = { x: marksMargin + bleedPt + layer.x, y: marksMargin + bleedPt + layer.y }
          if (cmyk) written += await addCmykPicture(target, layer.canvas, at.x, at.y, layer.w, layer.h, true)
          else {
            const picture = layer.canvas.toDataURL('image/png')
            target.addImage(picture, 'PNG', at.x, at.y, layer.w, layer.h, undefined, 'FAST')
            written += picture.length * 0.75
          }
          continue
        }
        // the first picture is the paper with what lies under the text; the ones after it lie over the text and let it show through
        if (cmyk) {
          written += await addCmykPicture(target, layer.canvas, marksMargin, marksMargin, page.w + 2 * bleedPt, page.h + 2 * bleedPt, index > 0)
          continue
        }
        const picture = layer.canvas.toDataURL('image/png')
        target.addImage(picture, 'PNG', marksMargin, marksMargin, page.w + 2 * bleedPt, page.h + 2 * bleedPt, undefined, 'FAST')
        written += picture.length * 0.75
      }
      if (written > MAX_PDF_BYTES) throw new Error(t(TOO_LARGE_MESSAGE))
      if (options.cropMarks) drawCropMarks(target, page, marksMargin, marksMargin, bleedPt, cmyk)
      if (options.registrationMarks) drawRegistrationMarks(target, page, marksMargin + bleedPt, bleedPt, cmyk)
      if (options.colorBars) drawColorBar(target, page, marksMargin + bleedPt, bleedPt, cmyk)
      if (options.slug && options.pageInfo) await drawSlugInfo(target, sheet, marksMargin + bleedPt, slugInfoText(prepared, options, i - 1), cmyk)
      onPage?.(i - first + 1, total)
      continue
    }
    const canvas = await renderPage(prepared.content, prepared.flows, page, bleedPt, options.dpi)
    if (cmyk) {
      written += await addCmykPicture(target, canvas, marksMargin, marksMargin, page.w + 2 * bleedPt, page.h + 2 * bleedPt)
    } else {
      const picture = canvas.toDataURL('image/png')
      // jsPDF takes a PNG apart into raw pixels and, unless it is told to compress them, writes those: a 300 DPI A4 page is 26 MB of them.
      // Compressed again (lossless, as the PNG was) it takes about what the PNG did
      target.addImage(picture, 'PNG', marksMargin, marksMargin, page.w + 2 * bleedPt, page.h + 2 * bleedPt, undefined, 'FAST')
      written += picture.length * 0.75
    }
    // a PDF is built as one string, and a string cannot be longer than about 512 MB: say so before drawing the rest of the pages
    if (written > MAX_PDF_BYTES) throw new Error(t(TOO_LARGE_MESSAGE))
    if (options.cropMarks) drawCropMarks(target, page, marksMargin, marksMargin, bleedPt, cmyk)
    if (options.registrationMarks) drawRegistrationMarks(target, page, marksMargin + bleedPt, bleedPt, cmyk)
    if (options.colorBars) drawColorBar(target, page, marksMargin + bleedPt, bleedPt, cmyk)
    if (options.slug && options.pageInfo) await drawSlugInfo(target, sheet, marksMargin + bleedPt, slugInfoText(prepared, options, i - 1), cmyk)
    onPage?.(i - first + 1, total)
  }
  return target
}

/**
 * Writes letters to the current page as text, each at the place the browser put it. `x`/`y` is where the page's own top-left corner
 * is on the sheet. In CMYK the colour of a letter is written in the four inks (black in the black ink only).
 */
function writeGlyphs(pdf: jsPDF, glyphs: VectorGlyph[], x: number, y: number, cmyk = false) {
  let font: unknown = null
  let size = -1
  let color = ''
  for (const glyph of glyphs) {
    if (glyph.font !== font) {
      pdf.setFont(registerFont(pdf, glyph.font), 'normal')
      font = glyph.font
    }
    if (glyph.size !== size) {
      pdf.setFontSize(glyph.size)
      size = glyph.size
    }
    const rgb = glyph.color.join(',')
    if (rgb !== color) {
      if (cmyk) pdf.setTextColor(...rgbToInks(glyph.color[0], glyph.color[1], glyph.color[2]))
      else pdf.setTextColor(glyph.color[0], glyph.color[1], glyph.color[2])
      color = rgb
    }
    pdf.text(glyph.text, x + glyph.x, y + glyph.baseline, glyph.angle ? { angle: -glyph.angle } : undefined)
  }
}

/** the PDF as a string overflows ("Invalid string length") when it is too big: say what to do instead */
function tooLarge<T>(make: () => T): T {
  try {
    return make()
  } catch (error) {
    if (error instanceof RangeError || /Invalid string length/i.test(String(error))) throw new Error(t(TOO_LARGE_MESSAGE))
    throw error
  }
}
const outputBlob = (pdf: jsPDF) => tooLarge(() => pdf.output('blob'))
const outputBuffer = (pdf: jsPDF) => tooLarge(() => pdf.output('arraybuffer'))

/** Gives the finished PDF to the user: the save dialog of the desktop app, or a download and a window in the browser. */
export async function deliverPdf(pdf: jsPDF, fileBaseName: string, viewWindow?: Window | null): Promise<boolean> {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const { openPath } = await import('@tauri-apps/plugin-opener')
    const path = await save({ defaultPath: `${fileBaseName}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!path) return false
    await writeFile(path, new Uint8Array(outputBuffer(pdf)))
    try {
      await openPath(path)
    } catch (error) {
      console.warn('PDF was saved but could not be opened automatically.', error)
    }
    return true
  }
  const blob = outputBlob(pdf)
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

export async function exportPdf(
  content: ExportContent,
  options: PdfExportOptions,
  fileBaseName: string,
  onProgress?: (done: number, total: number) => void,
  /** a window opened synchronously from the triggering click, so navigating it to the result isn't blocked as a
   *  popup once the (multi-page, `await`-heavy) render work below is done */
  viewWindow?: Window | null,
) {
  const prepared = prepareExport(content)
  const from = options.range ? Math.max(1, options.range.from) : 1
  const to = options.range ? Math.min(prepared.rects.length, options.range.to) : prepared.rects.length
  const pdf = await addPagesToPdf(null, prepared, { ...options, infoName: options.infoName ?? fileBaseName }, from, to, onProgress)
  if (!pdf) {
    viewWindow?.close()
    return false
  }
  return deliverPdf(pdf, fileBaseName, viewWindow)
}

/** how far from the trim (beyond the bleed) the centre of a registration mark, and the line of the colour bar, lie */
const MARK_OFFSET = 9

/** A target (a circle and a cross) at the middle of every side of the page, outside the bleed. Drawn in all the inks (registration) in CMYK. */
function drawRegistrationMarks(pdf: jsPDF, page: PageRect, edge: number, bleedPt: number, cmyk: boolean) {
  const left = edge
  const top = edge
  const right = left + page.w
  const bottom = top + page.h
  const radius = 3.5
  const reach = 7
  if (cmyk) pdf.setDrawColor(1, 1, 1, 1)
  else pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  const target = (x: number, y: number) => {
    pdf.circle(x, y, radius, 'S')
    pdf.line(x - reach, y, x + reach, y)
    pdf.line(x, y - reach, x, y + reach)
  }
  const offset = bleedPt + MARK_OFFSET
  target(left + page.w / 2, top - offset)
  target(left + page.w / 2, bottom + offset)
  target(left - offset, top + page.h / 2)
  target(right + offset, top + page.h / 2)
}

/** The colours of a colour bar: the inks, the colours they make two by two, and greys of the black ink from light to full. */
const COLOR_BAR: { rgb: [number, number, number]; inks: [number, number, number, number] }[] = [
  { rgb: [0, 174, 239], inks: [1, 0, 0, 0] },
  { rgb: [236, 0, 140], inks: [0, 1, 0, 0] },
  { rgb: [255, 242, 0], inks: [0, 0, 1, 0] },
  { rgb: [0, 0, 0], inks: [0, 0, 0, 1] },
  { rgb: [237, 28, 36], inks: [0, 1, 1, 0] },
  { rgb: [0, 166, 81], inks: [1, 0, 1, 0] },
  { rgb: [46, 49, 146], inks: [1, 1, 0, 0] },
  ...Array.from({ length: 10 }, (_, step) => {
    const share = (step + 1) / 10
    const grey = Math.round(255 * (1 - share))
    return { rgb: [grey, grey, grey] as [number, number, number], inks: [0, 0, 0, share] as [number, number, number, number] }
  }),
]

/** A strip of squares of the inks and of greys, in the bottom margin from the middle of the page to its right. */
function drawColorBar(pdf: jsPDF, page: PageRect, edge: number, bleedPt: number, cmyk: boolean) {
  const size = 7
  const bottom = edge + page.h
  const y = bottom + bleedPt + MARK_OFFSET - size / 2
  const start = edge + page.w / 2 + 14
  const room = edge + page.w - start
  const count = Math.min(COLOR_BAR.length, Math.floor(room / size))
  for (let index = 0; index < count; index += 1) {
    const color = COLOR_BAR[index]!
    if (cmyk) pdf.setFillColor(color.inks[0], color.inks[1], color.inks[2], color.inks[3])
    else pdf.setFillColor(color.rgb[0], color.rgb[1], color.rgb[2])
    pdf.rect(start + index * size, y, size, size, 'F')
  }
}

/** What the slug says about a page: the name of the file, the number the page has (as it is printed), and the date. */
function slugInfoText(prepared: PreparedExport, options: PageDrawOptions, pageIndex: number) {
  const { doc, sections } = prepared.content
  const label = pageNumberLabel(sections ?? [], pageIndex, doc.startPage)
  const date = new Date().toLocaleDateString(localeTag())
  return `${options.infoName ?? doc.name} · ${t('עמוד {label}', { label })} · ${date}`
}

/**
 * A line of information in the top of the slug, at the left corner of the page. It is drawn as a picture of the text, as the fonts a PDF has of
 * its own cannot write Hebrew. `room` is how far from the top of the sheet the page (the trim) begins.
 */
async function drawSlugInfo(pdf: jsPDF, sheet: { w: number; h: number }, room: number, text: string, cmyk: boolean) {
  const scale = 4
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return
  const font = `${SLUG_INFO_SIZE * scale}px Arial, "Segoe UI", sans-serif`
  probe.font = font
  const width = Math.ceil(probe.measureText(text).width) + 4 * scale
  const height = Math.ceil(SLUG_INFO_SIZE * 1.5 * scale)
  const w = width / scale
  const h = height / scale
  // no room above the page for a line of text: nothing is written
  if (room < h + 2 || w > sheet.w - 4) return
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return
  context.font = font
  context.direction = 'rtl'
  context.textAlign = 'right'
  context.textBaseline = 'middle'
  context.fillStyle = '#000'
  context.fillText(text, width - 2 * scale, height / 2)
  // at the left corner of the page, away from the target at the middle of the top (`room` is also how far the page is from the left of the sheet)
  const x = w > sheet.w / 2 - room - 20 ? (sheet.w - w) / 2 : room + 8
  const y = (room - h) / 2
  if (cmyk) await addCmykPicture(pdf, canvas, x, y, w, h, true)
  else pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST')
}

/** Crop marks around a page whose trim box sits at (originX + bleedPt, originY + bleedPt) on the sheet. */
function drawCropMarks(pdf: jsPDF, page: PageRect, originX: number, originY: number, bleedPt: number, cmyk = false) {
  const len = 12
  const gap = 2
  const left = originX + bleedPt
  const top = originY + bleedPt
  const right = left + page.w
  const bottom = top + page.h
  // in CMYK the marks are "registration" (every ink at full), so that they show on every plate a shop makes
  if (cmyk) pdf.setDrawColor(1, 1, 1, 1)
  else pdf.setDrawColor(0, 0, 0)
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
