import { t } from './i18n'
import type { ShapeFrame, TextFrame } from './document'
import { isTauri } from './fileio'
import { prepareExport, type ExportContent } from './pdfExport'
import { stackOrder } from './stacking'
import { boundsOfItems, buildSvg, type SvgBox, type SvgItem } from './svgBuild'
import { outlineFrame } from './textOutlines'
import { PICTURE_REASONS } from './vectorText'

/**
 * "Export to SVG": the objects that are selected (or, when none is, the page that is shown) as an SVG file, which a drawing program
 * opens as paths. A shape is a path, a text frame is turned into the shapes of its letters (so the file does not need the font), a
 * picture is put in as a picture.
 */

export interface SvgExportOptions {
  /** the ids of the objects to export; none = everything that is on the page */
  ids?: string[]
  /** the page, as a box in world points (what is exported when there is no selection, and its view box) */
  page?: SvgBox
  /** the name the document has, written in the file */
  title?: string
}

export interface SvgExportResult {
  svg: string
  /** how many objects are in the file */
  count: number
  /** what could not be drawn as on the page */
  notes: string[]
  /** true when the selection was exported, false when it was the page */
  selection: boolean
}

const overlaps = (o: { x: number; y: number; w: number; h: number }, box: SvgBox) => o.x < box.x + box.w && o.x + o.w > box.x && o.y < box.y + box.h && o.y + o.h > box.y

const newId = () => globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}${Math.random()}`

/** a picture that is not in the file itself (it is linked to its file on the disk) as a data: URL, so that the SVG holds it */
async function embedded(dataUrl: string): Promise<string | null> {
  if (dataUrl.startsWith('data:')) return dataUrl
  try {
    const blob = await (await fetch(dataUrl)).blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function exportSvg(content: ExportContent, options: SvgExportOptions): Promise<SvgExportResult> {
  const chosen = options.ids && options.ids.length > 0 ? new Set(options.ids) : null
  const wanted = (o: { id: string; hidden?: true; x: number; y: number; w: number; h: number }) => !o.hidden && (chosen ? chosen.has(o.id) : !options.page || overlaps(o, options.page))
  const notes = new Set<string>()
  const prepared = prepareExport(content)

  // the text frames, as the shapes of their letters
  const letters: ShapeFrame[] = []
  for (const frame of prepared.content.frames as TextFrame[]) {
    if (!wanted(frame) || frame.rasterized) continue
    const outcome = await outlineFrame(prepared, frame, newId)
    if ('shapes' in outcome) letters.push(...outcome.shapes)
    else if (outcome.problem === 'picture') notes.add(t('טקסט שלא הומר ({reason})', { reason: PICTURE_REASONS[outcome.reason] }))
    else if (outcome.problem === 'long') notes.add(t('טקסט ארוך מדי להמרה'))
    else if (outcome.problem === 'font') notes.add(t('טקסט בגופן שלא ניתן לקרוא'))
  }

  const shapes = [...prepared.content.shapes.filter(wanted), ...letters]
  const images = prepared.content.images.filter(wanted)
  const ordered = stackOrder([], images, shapes, prepared.content.layerOrder ?? ['layer-1'])
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]))
  const imageById = new Map(images.map((image) => [image.id, image]))
  const items: SvgItem[] = []
  for (const entry of ordered) {
    if (entry.kind === 'shape') {
      const shape = shapeById.get(entry.id)
      if (shape) items.push({ kind: 'shape', shape })
    } else if (entry.kind === 'image') {
      const image = imageById.get(entry.id)
      if (image) items.push({ kind: 'image', image })
    }
  }

  // the pictures that are inside the file, and the ones linked to a file
  const assets: Record<string, { dataUrl: string; width: number; height: number }> = {}
  const used = new Set<string>([...images.map((image) => image.assetId), ...shapes.flatMap((shape) => (shape.image ? [shape.image.assetId] : []))])
  for (const id of used) {
    const asset = prepared.content.assets[id]
    if (!asset) continue
    const dataUrl = await embedded(asset.dataUrl)
    if (dataUrl) assets[id] = { dataUrl, width: asset.width, height: asset.height }
  }

  // a selection is exported at its own size; a page, at the size of the page
  const box = chosen ? boundsOfItems(items) : options.page ?? boundsOfItems(items)
  if (!box || items.length === 0) return { svg: '', count: 0, notes: [...notes], selection: !!chosen }
  const built = buildSvg(items, assets, box, options.title)
  for (const note of built.notes) notes.add(note)
  return { svg: built.svg, count: items.length, notes: [...notes], selection: !!chosen }
}

/** Gives the finished SVG to the user: the save dialog of the desktop app, or a download in the browser. */
export async function deliverSvg(svg: string, fileBaseName: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(svg)
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: `${fileBaseName}.svg`, filters: [{ name: 'SVG', extensions: ['svg'] }] })
    if (!path) return false
    await writeFile(path, bytes)
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileBaseName}.svg`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
