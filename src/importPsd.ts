import { t } from './i18n'
import { MAX_IMAGE_BYTES } from './document'
import { hashId } from './assetHash'
import { ImportError } from './importText'
import type { PlacedImage } from './importImage'

export const isPsdFile = (file: File) => /\.psd$/i.test(file.name)

/** A Photoshop file as one picture: its flattened composite, kept as a PNG (the layers are not kept). */
export async function readPsdFile(file: File): Promise<PlacedImage> {
  if (file.size > MAX_IMAGE_BYTES * 4) throw new ImportError(t('קובץ ה-PSD "{name}" גדול מדי.', { name: file.name }))
  const buffer = await file.arrayBuffer()
  const { readPsd } = await import('ag-psd')
  let canvas: HTMLCanvasElement | undefined
  try {
    canvas = readPsd(buffer, { skipLayerImageData: true, skipThumbnail: true }).canvas
  } catch {
    throw new ImportError(t('לא ניתן לקרוא את קובץ ה-PSD "{name}". ייתכן שהקובץ פגום או במבנה שאינו נתמך.', { name: file.name }))
  }
  if (!canvas) throw new ImportError(t('בקובץ ה-PSD "{name}" אין תמונה מאוחדת. שמרו אותו ב-Photoshop עם „Maximize Compatibility”.', { name: file.name }))
  const dataUrl = canvas.toDataURL('image/png')
  if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) throw new ImportError(t('התמונה שב-"{name}" גדולה מדי (מעל 50MB).', { name: file.name }))
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
  const name = file.name.replace(/\.psd$/i, '.png')
  return { assetId: await hashId(bytes.buffer), asset: { name, mime: 'image/png', dataUrl, width: canvas.width, height: canvas.height } }
}