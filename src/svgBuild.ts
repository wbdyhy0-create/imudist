import type { Asset, GradientFill, ImageFrame, ShapeFrame } from './document'
import { linearGradientLine } from './colorModels'
import { isProfiledLine, lineOutlinePath } from './lineProfile'
import { shadowBlurRadius } from './shadow'
import { imageGeometry, shapePath } from './shapes'

/**
 * A page, or a few objects of it, as an SVG file: what is drawn as a shape stays a shape (paths with their curves, rounded
 * rectangles, ellipses, lines with their widths, gradients, shadows), and a picture is put in as a picture. One unit of the SVG is one
 * point of the page, so the file comes into a drawing program at the size it has here.
 */

export type SvgItem = { kind: 'shape'; shape: ShapeFrame } | { kind: 'image'; image: ImageFrame }

export interface SvgBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SvgResult {
  svg: string
  /** what could not be drawn the way it is on the page (a table, the feathered edge of an object), as short phrases */
  notes: string[]
}

const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const DATA_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/

const color = (value: string | null | undefined): string | null => (value && COLOR.test(value) ? value : null)
const num = (value: number) => String(Math.round(value * 1000) / 1000)
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** the SVG of the objects (back to front) that lie in `box` (world points) */
export function buildSvg(items: SvgItem[], assets: Record<string, Pick<Asset, 'dataUrl' | 'width' | 'height'>>, box: SvgBox, title = ''): SvgResult {
  const defs: string[] = []
  const body: string[] = []
  const notes = new Set<string>()
  let ids = 0
  const nextId = (prefix: string) => `${prefix}${(ids += 1)}`

  const shadowFilter = (object: { shadowOffsetX?: number; shadowOffsetY?: number; shadowOffset?: number; shadowOpacity?: number; shadowColor?: string }): string | null => {
    const opacity = object.shadowOpacity ?? 0
    if (opacity <= 0) return null
    const dx = object.shadowOffsetX ?? 0
    const dy = object.shadowOffsetY ?? object.shadowOffset ?? 6
    const id = nextId('shadow')
    const deviation = Math.max(0, shadowBlurRadius(dx, dy, opacity) / 2)
    defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${num(deviation)}"/><feOffset dx="${num(dx)}" dy="${num(dy)}" result="shifted"/><feFlood flood-color="${color(object.shadowColor) ?? '#000000'}" flood-opacity="${num(opacity)}"/><feComposite in2="shifted" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    )
    return id
  }

  const gradient = (g: GradientFill, w: number, h: number): string => {
    const id = nextId('gradient')
    const stops = g.stops?.length ? g.stops : [{ offset: 0, color: g.start }, { offset: 1, color: g.end }]
    if (g.type === 'radial') {
      const ordered = g.reverse ? [...stops].reverse().map((stop, index) => ({ offset: stops[index]!.offset, color: stop.color })) : stops
      defs.push(`<radialGradient id="${id}" cx="50%" cy="50%" r="70%">${ordered.map((stop) => `<stop offset="${num(stop.offset * 100)}%" stop-color="${color(stop.color) ?? '#000000'}"/>`).join('')}</radialGradient>`)
    } else {
      const line = linearGradientLine((g.angle ?? 0) + (g.reverse ? 180 : 0), w, h)
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(line.x1)}" y1="${num(line.y1)}" x2="${num(line.x2)}" y2="${num(line.y2)}">${stops.map((stop) => `<stop offset="${num(stop.offset * 100)}%" stop-color="${color(stop.color) ?? '#000000'}"/>`).join('')}</linearGradient>`)
    }
    return id
  }

  /** `translate` and `rotate` of an object: its box is at x, y and it is turned about its own centre */
  const placement = (o: { x: number; y: number; w: number; h: number; rotation?: number }) =>
    `translate(${num(o.x)} ${num(o.y)})${o.rotation ? ` rotate(${num(o.rotation)} ${num(o.w / 2)} ${num(o.h / 2)})` : ''}`

  const common = (o: { opacity?: number; blendMode?: string }, filterId: string | null) => {
    const parts: string[] = []
    if (o.opacity !== undefined && o.opacity < 1) parts.push(`opacity="${num(Math.max(0, o.opacity))}"`)
    if (o.blendMode) parts.push(`style="mix-blend-mode:${escape(o.blendMode)}"`)
    if (filterId) parts.push(`filter="url(#${filterId})"`)
    return parts.join(' ')
  }

  for (const item of items) {
    if (item.kind === 'shape') {
      const shape = item.shape
      if (shape.kind === 'table') {
        notes.add('טבלה')
        continue
      }
      if (shape.feather) notes.add('טשטוש קצוות')
      const isLine = shape.kind === 'line'
      const isPath = shape.kind === 'path'
      const profiled = isLine && isProfiledLine(shape)
      const d = profiled ? lineOutlinePath(shape, 1) : shapePath(shape, 1)
      if (!d) continue
      const attributes: string[] = [`d="${d}"`]
      let fill: string | null = null
      if (profiled) fill = color(shape.stroke)
      else if (!shape.frame) fill = shape.fillGradient ? `url(#${gradient(shape.fillGradient, shape.w, shape.h)})` : color(shape.fill)
      attributes.push(`fill="${fill ?? 'none'}"`, 'fill-rule="evenodd"')
      const stroke = profiled ? null : color(shape.stroke)
      if (stroke && shape.strokeWidth > 0) {
        attributes.push(`stroke="${stroke}"`, `stroke-width="${num(shape.strokeWidth)}"`)
        attributes.push(`stroke-linecap="${shape.strokeCap ?? (isPath ? 'round' : 'butt')}"`)
        attributes.push(`stroke-linejoin="${isPath && shape.strokeCap === 'butt' ? 'miter' : 'round'}"`)
        if (isLine && shape.strokeDash === 'dashed') attributes.push(`stroke-dasharray="${num(shape.strokeWidth * 3)} ${num(shape.strokeWidth * 2)}"`)
      }
      const filter = shadowFilter(shape)
      const inner: string[] = [`<path ${attributes.join(' ')}/>`]
      // a picture put inside the shape is clipped to its outline
      const asset = shape.image ? assets[shape.image.assetId] : undefined
      if (shape.image && asset && DATA_URL.test(asset.dataUrl)) {
        const clip = nextId('clip')
        const place = imageGeometry(shape, asset)
        defs.push(`<clipPath id="${clip}"><path d="${shapePath(shape, 1)}"/></clipPath>`)
        inner.push(`<image clip-path="url(#${clip})" x="${num(place.x)}" y="${num(place.y)}" width="${num(place.w)}" height="${num(place.h)}" preserveAspectRatio="none" href="${asset.dataUrl}"/>`)
      }
      // the name the object has in the Layers panel becomes its id, where the file may have it
      const name = shape.label ? shape.label.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') : ''
      const label = name ? ` id="${escape(/^[\p{L}_]/u.test(name) ? name : `obj-${name}`)}-${nextId('s')}"` : ''
      body.push(`<g${label} transform="${placement(shape)}"${common(shape, filter) ? ' ' + common(shape, filter) : ''}>${inner.join('')}</g>`)
      continue
    }
    const image = item.image
    const asset = assets[image.assetId]
    if (!asset || !DATA_URL.test(asset.dataUrl)) {
      notes.add('תמונה שאינה מוטמעת בקובץ')
      continue
    }
    if (image.feather) notes.add('טשטוש קצוות')
    const clip = nextId('clip')
    defs.push(`<clipPath id="${clip}"><rect x="0" y="0" width="${num(image.w)}" height="${num(image.h)}"/></clipPath>`)
    let rect = { x: 0, y: 0, w: image.w, h: image.h }
    if (image.fit !== 'stretch' && asset.width > 0 && asset.height > 0) {
      const scale = image.fit === 'fit' ? Math.min(image.w / asset.width, image.h / asset.height) : Math.max(image.w / asset.width, image.h / asset.height)
      const w = asset.width * scale
      const h = asset.height * scale
      rect = { x: (image.w - w) / 2, y: (image.h - h) / 2, w, h }
    }
    const flip = image.flipX || image.flipY ? ` translate(${num(image.w / 2)} ${num(image.h / 2)}) scale(${image.flipX ? -1 : 1} ${image.flipY ? -1 : 1}) translate(${num(-image.w / 2)} ${num(-image.h / 2)})` : ''
    const filter = shadowFilter(image)
    body.push(
      `<g transform="${placement(image)}${flip}"${common(image, filter) ? ' ' + common(image, filter) : ''}><image clip-path="url(#${clip})" x="${num(rect.x)}" y="${num(rect.y)}" width="${num(rect.w)}" height="${num(rect.h)}" preserveAspectRatio="none" href="${asset.dataUrl}"/></g>`,
    )
  }

  const size = `width="${num(box.w)}" height="${num(box.h)}"`
  const heading = title ? `<title>${escape(title)}</title>` : ''
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${size} viewBox="${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}">` +
    heading +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body.join('\n') +
    `</svg>\n`
  return { svg, notes: [...notes] }
}

/** the box the objects fill, with the room that their lines and shadows need around them (world points) */
export function boundsOfItems(items: SvgItem[]): SvgBox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const take = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const item of items) {
    const o = item.kind === 'shape' ? item.shape : item.image
    if (o.w === undefined) continue
    const widths = item.kind === 'shape' ? item.shape.lineWidths : undefined
    const stroke = item.kind === 'shape' && item.shape.stroke ? item.shape.strokeWidth * (widths ? Math.max(1, ...widths, 0) : 1) : 0
    const shadow = (o.shadowOpacity ?? 0) > 0 ? Math.hypot(o.shadowOffsetX ?? 0, o.shadowOffsetY ?? o.shadowOffset ?? 6) * 1.5 : 0
    const pad = stroke / 2 + shadow
    const turn = ((o.rotation ?? 0) * Math.PI) / 180
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const cx = o.x + o.w / 2
    const cy = o.y + o.h / 2
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const lx = dx * (o.w / 2 + pad)
      const ly = dy * (o.h / 2 + pad)
      take(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}
