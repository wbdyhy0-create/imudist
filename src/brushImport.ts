import { centerlinesOf } from './brushes'
import { brushFromOutlines, type CustomBrush } from './customBrushes'
import type { PathGeom, ShapeFrame } from './document'
import { brightnessField, DEFAULT_TRACE, otsuLevel, suggestedTrace, traceField } from './imageTrace'
import { parseSvgOutlines } from './svgBrush'
import { t } from './i18n'

/** a brush file bigger than this is not read */
export const MAX_BRUSH_FILE_BYTES = 4 * 1024 * 1024
/** the picture of a brush is traced at about this size (pixels on its longest side) */
const WORKING_SIZE = 640

export type BrushImport = { brush: CustomBrush; note?: string } | { error: string }

type Pt = [number, number]

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim()

/** the lines of a traced shape (its outline and its holes) as closed lines of points, in pixels of the picture */
function ringsOf(polygon: PathGeom[number], width: number, height: number): Pt[][] {
  const shape: ShapeFrame = { id: 'trace', kind: 'path', x: 0, y: 0, w: width, h: height, geom: [polygon], fill: '#000000', stroke: null, strokeWidth: 0 }
  const lines = centerlinesOf(shape) ?? []
  return lines.map((line) => {
    const first = line[0]
    const last = line[line.length - 1]
    return first && last && line.length > 3 && first[0] === last[0] && first[1] === last[1] ? line.slice(0, -1) : line
  })
}

/** The brush a picture stands for: the shape in it, dark on a light ground (or what is opaque on a see-through one), traced. */
async function brushFromPicture(file: File): Promise<BrushImport> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { error: t('אי אפשר לקרוא את התמונה. נסו קובץ PNG, JPG או SVG.') }
  }
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest < 1) return { error: t('התמונה ריקה.') }
  const scale = Math.max(0.05, Math.min(4, WORKING_SIZE / longest))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { error: t('אי אפשר לעבד את התמונה בדפדפן הזה.') }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const data = context.getImageData(0, 0, width, height).data
  let seeThrough = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 200) seeThrough += 1
  // a picture with a see-through ground: the shape is what is there; otherwise it is what is darker (or lighter) than the ground
  const field = brightnessField(data, width, height)
  if (seeThrough > (width * height) / 100) {
    for (let pixel = 0; pixel < width * height; pixel += 1) field[pixel] = 255 - data[pixel * 4 + 3]!
  }
  const level = otsuLevel(field)
  const trace = suggestedTrace(field, level)
  const result = traceField(field, width, height, { ...DEFAULT_TRACE, trace, level, tolerance: 0.7, minArea: Math.max(6, width * height * 0.00015) })
  const groups = result.geom.map((polygon) => ringsOf(polygon, width, height)).filter((rings) => rings.length > 0)
  const brush = brushFromOutlines(groups, baseName(file.name))
  if (!brush) return { error: t('לא נמצאה בתמונה צורה כהה על רקע בהיר (או צורה על רקע שקוף).') }
  return { brush }
}

/** The brush made of a file: an SVG drawing (its filled shapes), or a picture (traced). Never throws. */
export async function readBrushFile(file: File): Promise<BrushImport> {
  if (file.size > MAX_BRUSH_FILE_BYTES) return { error: t('הקובץ גדול מדי למברשת (עד 4MB).') }
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  try {
    if (isSvg) {
      const outlines = parseSvgOutlines(await file.text())
      if (!outlines) return { error: t('הקובץ אינו קובץ SVG תקין.') }
      if (outlines.groups.length === 0) return { error: t('לא נמצאו בקובץ צורות לצייר איתן. אפשר להשתמש בקובץ שבו הצורה צבועה.') }
      const brush = brushFromOutlines(outlines.groups, baseName(file.name))
      if (!brush) return { error: t('הצורה שבקובץ ריקה או שטוחה מדי למברשת.') }
      return outlines.lineOnly ? { brush, note: t('בקובץ היו רק קווים, ולכן המברשת נעשתה מצורת הקווים.') } : { brush }
    }
    if (file.type.startsWith('image/')) return await brushFromPicture(file)
    return { error: t('סוג הקובץ אינו נתמך. בחרו קובץ SVG, PNG או JPG.') }
  } catch {
    return { error: t('אי אפשר לקרוא את הקובץ.') }
  }
}
