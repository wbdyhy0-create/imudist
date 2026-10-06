import { MAX_IMAGE_BYTES, type Asset } from './document'
import { hashId } from './assetHash'
import { ImportError } from './importText'

/** A picture read from a file, waiting to be placed (the loaded image cursor). */
export interface PlacedImage {
  /** key in the document's asset table (a hash of the file, so the same picture is stored once) */
  assetId: string
  asset: Asset
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
}
const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT))

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? ''

/** The picture type of a file, or null if it isn't one we import. */
export function imageMime(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type
  return MIME_BY_EXT[extOf(file.name)] ?? null
}

export const isImageFile = (file: File) => imageMime(file) !== null

/** The picture type from a file name's extension, or null if it isn't one we import. */
export const imageMimeOfName = (name: string): string | null => MIME_BY_EXT[extOf(name)] ?? null

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/** Read a picture file: keep its bytes as a data URL and find out its pixel size. */
export async function readImageFile(file: File): Promise<PlacedImage> {
  const mime = imageMime(file)
  if (!mime) throw new ImportError(`"${file.name}" אינו קובץ תמונה נתמך (PNG, JPG, GIF, WebP, SVG, BMP או AVIF).`)
  if (file.size > MAX_IMAGE_BYTES) throw new ImportError(`התמונה "${file.name}" גדולה מדי (מעל 50MB).`)

  const buffer = await file.arrayBuffer()
  const dataUrl = `data:${mime};base64,${toBase64(new Uint8Array(buffer))}`

  const img = new Image()
  img.src = dataUrl
  try {
    await img.decode()
  } catch {
    throw new ImportError(`לא ניתן לקרוא את התמונה "${file.name}". ייתכן שהקובץ פגום.`)
  }
  // an SVG without its own size reports 0: give it a sensible default
  const width = img.naturalWidth || 300
  const height = img.naturalHeight || 300

  return { assetId: await hashId(buffer), asset: { name: file.name, mime, dataUrl, width, height } }
}
