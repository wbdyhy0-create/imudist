import { lineProfileShape } from './lineProfile'
import type { Asset, ImageFrame, ShapeFrame, TextFrame } from './document'
import { isTauri } from './fileio'
import type { RecentEntry } from './recent'
import { parseDocument } from './fileFormat'
import { isHiddenItem, layerViewsOf } from './layers'
import { pageRects, parentShadowContent, type DocContent } from './pages'

const MAX_WIDTH = 280
const MAX_HEIGHT = 360
const PADDING = 8

async function readEntry(entry: RecentEntry): Promise<string | null> {
  if (entry.path && isTauri) {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return readTextFile(entry.path)
  }
  if (!entry.handle) return null

  const handle = entry.handle as FileSystemFileHandle & {
    queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
  }
  if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') return null
  return (await handle.getFile()).text()
}

function intersectsPage(object: { x: number; y: number; w: number; h: number }, page: { x: number; y: number; w: number; h: number }) {
  return object.x < page.x + page.w && object.x + object.w > page.x && object.y < page.y + page.h && object.y + object.h > page.y
}

function font(style: TextFrame, scale: number) {
  return `${style.italic ? 'italic ' : ''}${style.weight} ${Math.max(1, style.fontSize * scale)}px "${style.fontFamily.replace(/["\\]/g, '')}"`
}

function drawText(ctx: CanvasRenderingContext2D, frame: TextFrame, page: { x: number; y: number }, scale: number) {
  if (!frame.text || frame.rasterized) return
  ctx.save()
  ctx.beginPath()
  ctx.rect((frame.x - page.x) * scale, (frame.y - page.y) * scale, frame.w * scale, frame.h * scale)
  ctx.clip()
  ctx.font = font(frame, scale)
  ctx.fillStyle = frame.color ?? '#111111'
  ctx.direction = /[\u0590-\u08ff]/.test(frame.text) ? 'rtl' : 'ltr'
  ctx.textAlign = frame.align === 'left' ? 'left' : frame.align === 'center' || frame.align === 'justifyCenter' ? 'center' : 'right'
  ctx.textBaseline = 'top'

  const x = (frame.x - page.x + (frame.align === 'left' ? 0 : frame.align === 'center' || frame.align === 'justifyCenter' ? frame.w / 2 : frame.w)) * scale
  let y = (frame.y - page.y + (frame.spaceBefore ?? 0)) * scale
  const lineHeight = Math.max(frame.fontSize, frame.leading ?? frame.fontSize * 1.25) * scale
  const maxWidth = Math.max(1, (frame.w - (frame.indentLeft ?? 0) - (frame.indentRight ?? 0)) * scale)
  const paragraphs = frame.text.replace(/[\uE000-\uF8FF\uFFFC]/g, '').split('\n')
  const maxLines = Math.ceil(frame.h / Math.max(1, lineHeight)) + 1
  let count = 0

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u).filter(Boolean)
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > maxWidth) {
        ctx.fillText(line, x, y, maxWidth)
        y += lineHeight
        count++
        if (count >= maxLines) break
        line = word
      } else {
        line = next
      }
    }
    if (count >= maxLines) break
    if (line) {
      ctx.fillText(line, x, y, maxWidth)
      count++
    }
    y += lineHeight + (frame.spaceAfter ?? 0) * scale
    if (count >= maxLines || y > (frame.y - page.y + frame.h) * scale) break
  }
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, original: ShapeFrame, page: { x: number; y: number }, scale: number) {
  if (original.kind === 'table') return
  const shape = lineProfileShape(original) ?? original
  const x = (shape.x - page.x) * scale
  const y = (shape.y - page.y) * scale
  const w = shape.w * scale
  const h = shape.h * scale
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  if (shape.rotation) ctx.rotate((shape.rotation * Math.PI) / 180)
  ctx.beginPath()
  if (shape.kind === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  else if (shape.kind === 'line') {
    ctx.moveTo(shape.flip ? -w / 2 : -w / 2, shape.flip ? h / 2 : -h / 2)
    ctx.lineTo(w / 2, shape.flip ? -h / 2 : h / 2)
  } else ctx.rect(-w / 2, -h / 2, w, h)
  if (shape.fill) {
    ctx.globalAlpha = shape.opacity ?? 1
    ctx.fillStyle = shape.fill
    ctx.fill()
  }
  if (shape.stroke) {
    ctx.globalAlpha = shape.opacity ?? 1
    ctx.strokeStyle = shape.stroke
    ctx.lineWidth = Math.max(0.5, shape.strokeWidth * scale)
    ctx.stroke()
  }
  ctx.restore()
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function drawImageFrame(
  ctx: CanvasRenderingContext2D,
  frame: ImageFrame,
  asset: Asset | undefined,
  page: { x: number; y: number },
  scale: number,
) {
  const x = (frame.x - page.x) * scale
  const y = (frame.y - page.y) * scale
  const w = frame.w * scale
  const h = frame.h * scale
  const image = asset ? await loadImage(asset.dataUrl) : null
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  if (frame.rotation) ctx.rotate((frame.rotation * Math.PI) / 180)
  if (!image) {
    ctx.fillStyle = '#e5e0e0'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeStyle = '#a99f9f'
    ctx.lineWidth = Math.max(0.5, scale)
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.beginPath()
    ctx.moveTo(-w / 2, -h / 2)
    ctx.lineTo(w / 2, h / 2)
    ctx.moveTo(w / 2, -h / 2)
    ctx.lineTo(-w / 2, h / 2)
    ctx.stroke()
    ctx.restore()
    return
  }
  ctx.globalAlpha = frame.opacity ?? 1

  let sx = 0
  let sy = 0
  let sw = image.naturalWidth
  let sh = image.naturalHeight
  if (frame.fit === 'fill') {
    const crop = Math.max(w / sw, h / sh)
    sw = w / crop
    sh = h / crop
    sx = (image.naturalWidth - sw) / 2
    sy = (image.naturalHeight - sh) / 2
  } else if (frame.fit === 'fit') {
    const fit = Math.min(w / sw, h / sh)
    sw *= fit
    sh *= fit
  }
  if (frame.fit === 'fit') ctx.drawImage(image, -sw / 2, -sh / 2, sw, sh)
  else ctx.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  ctx.restore()
}

function allOnFirstPage(content: DocContent, page: { x: number; y: number; w: number; h: number }) {
  const parent = parentShadowContent(
    { ...content.doc, pages: 1, pageSizes: content.doc.pageSizes.slice(0, 1), pageMargins: content.doc.pageMargins.slice(0, 1) },
    content.parents,
    [content.pageParents[0] ?? null],
    content.sections,
    content.frames,
    undefined,
    (content.parentOverrides ?? []).filter((override) => override.pageIndex === 0),
    content.images,
    content.shapes,
  )
  // what the Layers panel hides (an object, or a whole layer) is not drawn
  const order = content.layerOrder ?? ['layer-1']
  const views = new Map(layerViewsOf(order, content.layers).map((view) => [view.id, view]))
  const shown = <T extends { id: string; layerId?: string; hidden?: true; locked?: true }>(items: T[]) => items.filter((item) => !isHiddenItem(item, views, order))
  const frames = [...parent.frames, ...shown(content.frames)].filter((frame) => intersectsPage(frame, page))
  const images = [...parent.images, ...shown(content.images)].filter((image) => intersectsPage(image, page))
  const shapes = [...parent.shapes, ...shown(content.shapes)].filter((shape) => intersectsPage(shape, page))
  return { frames, images, shapes }
}

async function renderThumbnail(content: DocContent): Promise<string | null> {
  const page = pageRects(content.doc)[0]
  if (!page || page.w <= 0 || page.h <= 0) return null

  const scale = Math.min((MAX_WIDTH - PADDING * 2) / page.w, (MAX_HEIGHT - PADDING * 2) / page.h)
  const pageWidth = Math.max(1, Math.round(page.w * scale))
  const pageHeight = Math.max(1, Math.round(page.h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = pageWidth + PADDING * 2
  canvas.height = pageHeight + PADDING * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable for recent document previews.')

  const pageX = PADDING
  const pageY = PADDING
  ctx.fillStyle = '#eee9e9'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.shadowColor = '#0006'
  ctx.shadowBlur = 6
  ctx.fillStyle = '#fff'
  ctx.fillRect(pageX, pageY, pageWidth, pageHeight)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#b9b1b1'
  ctx.lineWidth = 1
  ctx.strokeRect(pageX + 0.5, pageY + 0.5, pageWidth - 1, pageHeight - 1)

  ctx.save()
  ctx.beginPath()
  ctx.rect(pageX, pageY, pageWidth, pageHeight)
  ctx.clip()
  ctx.translate(pageX - page.x * scale, pageY - page.y * scale)
  ctx.scale(scale, scale)

  const objects = allOnFirstPage(content, page)
  for (const image of objects.images) {
    await drawImageFrame(ctx, image, content.assets[image.assetId], page, 1)
  }
  for (const shape of objects.shapes) drawShape(ctx, shape, page, 1)
  for (const frame of objects.frames) drawText(ctx, frame, page, 1)
  ctx.restore()

  return canvas.toDataURL('image/jpeg', 0.82)
}

export async function recentThumbnail(entry: RecentEntry): Promise<string | null> {
  const text = await readEntry(entry)
  if (!text) return null
  const content = parseDocument(text, entry.name)
  return renderThumbnail(content)
}
