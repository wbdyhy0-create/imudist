import { SVGPathData } from 'svg-pathdata'
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PathGeom, PathVertex } from './document'
import { ImportError } from './importText'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type Matrix = [number, number, number, number, number, number]
type Point = [number, number]
type Ring = { vertices: PathVertex[]; closed: boolean }

export interface SvgPaint {
  fill: string
  stroke: string
  strokeWidth: number
  strokeCap: string
  fillOpacity: number
  strokeOpacity: number
  opacity: number
  display: string
  visibility: string
}

export interface VectorShapeData {
  id: string
  kind: 'path'
  x: number
  y: number
  w: number
  h: number
  geom: PathGeom
  closed: boolean
  fill: string | null
  stroke: string | null
  strokeWidth: number
  strokeCap: 'butt' | 'round' | 'square'
  opacity: number
  z?: number
}

const identity: Matrix = [1, 0, 0, 1, 0, 0]
const MAX_EPS_BYTES = 50 * 1024 * 1024
const MAX_PATHS = 10_000
const MAX_COMMANDS = 300_000

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left
  const [g, h, i, j, k, l] = right
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]
}

function clampOpacity(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback
}

function colorHex(value: string): string | null {
  const color = value.trim().toLowerCase()
  if (!color || color === 'none' || color === 'transparent' || color.startsWith('url(')) return null
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
  const rgb = color.match(/^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/)
  if (rgb) {
    const channels = rgb.slice(1, 4).map((part) => {
      const numeric = Number(part)
      const isPercent = color.includes('%')
      return Math.round(Math.max(0, Math.min(255, isPercent ? numeric * 2.55 : numeric))).toString(16).padStart(2, '0')
    })
    return `#${channels.join('')}`
  }
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080' }
  return named[color] ?? null
}

function pointOf(vertex: PathVertex): Point {
  return Array.isArray(vertex) ? vertex : vertex.p
}

function shapeFromRings(rings: Ring[], paint: SvgPaint, transform: Matrix, createId: () => string): VectorShapeData | null {
  const points: Point[] = rings.flatMap((ring) => ring.vertices.flatMap((vertex) => {
    const position = pointOf(vertex)
    if (Array.isArray(vertex)) return [position]
    return [position, ...(vertex.hi ? [[position[0] + vertex.hi[0], position[1] + vertex.hi[1]] as Point] : []), ...(vertex.ho ? [[position[0] + vertex.ho[0], position[1] + vertex.ho[1]] as Point] : [])]
  }))
  if (!points.length) return null
  const minX = Math.min(...points.map(([x]) => x))
  const minY = Math.min(...points.map(([, y]) => y))
  const width = Math.max(0.01, Math.max(...points.map(([x]) => x)) - minX)
  const height = Math.max(0.01, Math.max(...points.map(([, y]) => y)) - minY)
  const normalized = rings.map((ring) => ring.vertices.map((vertex): PathVertex => {
    const position = pointOf(vertex)
    const p: Point = [(position[0] - minX) / width, (position[1] - minY) / height]
    if (Array.isArray(vertex)) return p
    return {
      p,
      ...(vertex.hi ? { hi: [vertex.hi[0] / width, vertex.hi[1] / height] as Point } : {}),
      ...(vertex.ho ? { ho: [vertex.ho[0] / width, vertex.ho[1] / height] as Point } : {}),
    }
  }))
  const transformScale = Math.sqrt(Math.abs(transform[0] * transform[3] - transform[1] * transform[2])) || 1
  const fill = colorHex(paint.fill)
  const stroke = colorHex(paint.stroke)
  if (!fill && !stroke) return null
  return {
    id: createId(),
    kind: 'path',
    x: minX,
    y: minY,
    w: width,
    h: height,
    geom: [normalized],
    closed: rings.every((ring) => ring.closed),
    fill: paint.fillOpacity > 0 ? fill : null,
    stroke: paint.strokeOpacity > 0 ? stroke : null,
    strokeWidth: paint.strokeWidth * transformScale,
    strokeCap: paint.strokeCap === 'round' || paint.strokeCap === 'square' ? paint.strokeCap : 'butt',
    opacity: paint.opacity * Math.max(fill ? paint.fillOpacity : 0, stroke ? paint.strokeOpacity : 0),
  }
}

export function pathDataToShapes(pathData: string, paint: SvgPaint, transform: Matrix = identity, createId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `eps-${Date.now()}-${Math.random().toString(36).slice(2)}`): VectorShapeData[] {
  const commands = new SVGPathData(pathData)
    .toAbs()
    .normalizeHVZ(false, true, true)
    .normalizeST()
    .qtToC()
    .aToC()
    .matrix(...transform).commands
  if (commands.length > MAX_COMMANDS) throw new ImportError('נתיב EPS מורכב מדי לייבוא כצורה עריכה.')

  const rings: Ring[] = []
  let vertices: PathVertex[] = []
  let closed = false
  const finishRing = () => {
    if (vertices.length > 1) rings.push({ vertices, closed })
    vertices = []
    closed = false
  }
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      finishRing()
      vertices.push([command.x, command.y])
      continue
    }
    if (command.type === SVGPathData.LINE_TO) {
      vertices.push([command.x, command.y])
      continue
    }
    if (command.type === SVGPathData.CURVE_TO) {
      const previous = vertices[vertices.length - 1]
      if (!previous) continue
      const start = pointOf(previous)
      const previousVertex = Array.isArray(previous) ? { p: start } : previous
      vertices[vertices.length - 1] = { ...previousVertex, ho: [command.x1 - start[0], command.y1 - start[1]] }
      vertices.push({ p: [command.x, command.y], hi: [command.x2 - command.x, command.y2 - command.y] })
      continue
    }
    if (command.type === SVGPathData.CLOSE_PATH) closed = true
  }
  finishRing()

  const closedRings = rings.filter((ring) => ring.closed)
  const openRings = rings.filter((ring) => !ring.closed)
  const result: VectorShapeData[] = []
  if (closedRings.length) {
    const shape = shapeFromRings(closedRings, paint, transform, createId)
    if (shape) result.push(shape)
  }
  for (const ring of openRings) {
    const shape = shapeFromRings([ring], paint, transform, createId)
    if (shape) result.push(shape)
  }
  return result
}

function drawOpsToPath(data: ArrayLike<number>): string {
  let path = ''
  let index = 0
  while (index < data.length) {
    const operation = data[index++]
    if (operation === 0) path += `M${data[index++]} ${data[index++]}`
    else if (operation === 1) path += `L${data[index++]} ${data[index++]}`
    else if (operation === 2) path += `C${data[index++]} ${data[index++]} ${data[index++]} ${data[index++]} ${data[index++]} ${data[index++]}`
    else if (operation === 3) path += `Q${data[index++]} ${data[index++]} ${data[index++]} ${data[index++]}`
    else if (operation === 4) path += 'Z'
    else throw new ImportError(`נתיב PDF מכיל פקודת ציור לא מוכרת (${operation}).`)
  }
  return path
}

interface PdfGraphicsState extends SvgPaint {
  transform: Matrix
}

function cloneState(state: PdfGraphicsState): PdfGraphicsState {
  return { ...state, transform: [...state.transform] as Matrix }
}

export function pdfOperatorListToShapes(
  pageView: number[],
  fnArray: ArrayLike<number>,
  argsArray: unknown[][],
  createId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `eps-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): VectorShapeData[] {
  const viewX = pageView[0] ?? 0
  const viewBottom = pageView[3] ?? 0
  const pageTransform: Matrix = [1, 0, 0, -1, -viewX, viewBottom]
  let state: PdfGraphicsState = { fill: '#000000', stroke: '#000000', strokeWidth: 1, strokeCap: 'butt', fillOpacity: 1, strokeOpacity: 1, opacity: 1, display: 'inline', visibility: 'visible', transform: identity }
  const stack: PdfGraphicsState[] = []
  const shapes: VectorShapeData[] = []
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])

  for (let index = 0; index < fnArray.length; index++) {
    const operation = fnArray[index]
    const args = argsArray[index] as unknown[] | undefined ?? []
    if (operation === OPS.save) {
      stack.push(cloneState(state))
      continue
    }
    if (operation === OPS.restore) {
      state = stack.pop() ?? state
      continue
    }
    if (operation === OPS.transform) {
      if (args.length >= 6) state.transform = multiply(state.transform, args.slice(0, 6) as Matrix)
      continue
    }
    if (operation === OPS.setFillRGBColor) {
      state.fill = String(args[0] ?? '#000000')
      continue
    }
    if (operation === OPS.setStrokeRGBColor) {
      state.stroke = String(args[0] ?? '#000000')
      continue
    }
    if (operation === OPS.setFillTransparent) {
      state.fill = 'none'
      continue
    }
    if (operation === OPS.setStrokeTransparent) {
      state.stroke = 'none'
      continue
    }
    if (operation === OPS.setLineWidth) {
      state.strokeWidth = Number(args[0]) || 1
      continue
    }
    if (operation === OPS.setLineCap) {
      state.strokeCap = ['butt', 'round', 'square'][Number(args[0])] ?? 'butt'
      continue
    }
    if (operation === OPS.setGState) {
      const entries = args[0] as [string, unknown][] | undefined
      for (const [key, value] of entries ?? []) {
        if (key === 'ca') state.fillOpacity = clampOpacity(String(value), state.fillOpacity)
        else if (key === 'CA') state.strokeOpacity = clampOpacity(String(value), state.strokeOpacity)
      }
      continue
    }
    if (operation !== OPS.constructPath) continue

    const paintOperation = Number(args[0])
    const nested = args[1] as ArrayLike<ArrayLike<number>> | undefined
    const drawData = nested?.[0]
    if (!drawData?.length) continue
    const pathData = drawOpsToPath(drawData)
    const paint: SvgPaint = {
      ...state,
      fill: fillOps.has(paintOperation) ? state.fill : 'none',
      stroke: strokeOps.has(paintOperation) ? state.stroke : 'none',
      fillOpacity: fillOps.has(paintOperation) ? state.fillOpacity : 0,
      strokeOpacity: strokeOps.has(paintOperation) ? state.strokeOpacity : 0,
    }
    const shapeTransform = multiply(pageTransform, state.transform)
    shapes.push(...pathDataToShapes(pathData, paint, shapeTransform, createId))
    if (shapes.length > MAX_PATHS) throw new ImportError('קובץ ה-EPS מכיל יותר מדי צורות לייבוא.')
  }
  if (!shapes.length) throw new ImportError('לא נמצאו נתיבי ציור נתמכים בקובץ ה-EPS.')
  return shapes
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

/** The code the desktop side answers with when it finds no Ghostscript on the computer. */
const GHOSTSCRIPT_MISSING = 'GHOSTSCRIPT_MISSING'

/** The official download page of Ghostscript; it is opened only when the user presses the button. */
export const GHOSTSCRIPT_DOWNLOAD_URL = 'https://ghostscript.com/releases/gsdnld.html'

/** Ghostscript is not installed: the message tells what to do, and the dialog offers a button for the download page. */
export class GhostscriptMissingError extends ImportError {
  constructor() {
    super(
      [
        'לא נמצא Ghostscript במחשב. זו תוכנה חינמית שנדרשת להמרת קבצי EPS ו-PS, והיא אינה כלולה ב-Imudist.',
        '',
        'מה עושים:',
        '1. לוחצים על „הורדת Ghostscript”. האתר הרשמי של התוכנה ייפתח בדפדפן.',
        '2. בדף שנפתח מורידים את הגרסה „Windows (64 bit)”.',
        '3. מפעילים את הקובץ שהורד ומאשרים את ההתקנה, בלי לשנות את תיקיית ההתקנה המוצעת.',
        '4. חוזרים ל-Imudist ומוסיפים את קובץ ה-EPS או ה-PS שוב. אין צורך להפעיל מחדש את התוכנה.',
        '',
        'אם בחרתם תיקיית התקנה אחרת, הוסיפו את תיקיית bin שלה למשתנה PATH והפעילו את Imudist מחדש.',
      ].join('\n'),
    )
  }
}

/** Opens the Ghostscript download page in the user's browser. */
export async function openGhostscriptDownload(): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(GHOSTSCRIPT_DOWNLOAD_URL)
  } else {
    window.open(GHOSTSCRIPT_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')
  }
}

export async function readEpsFile(file: File): Promise<VectorShapeData[]> {
  if (file.size > MAX_EPS_BYTES) throw new ImportError('קובץ ה-EPS גדול מדי (מעל 50MB).')
  if (!('__TAURI_INTERNALS__' in window)) throw new ImportError('ייבוא EPS זמין ביישום שולחני עם Ghostscript מותקן.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { invoke } = await import('@tauri-apps/api/core')
  let pdfBase64: string
  try {
    pdfBase64 = await invoke<string>('convert_eps_to_pdf', { sourceBase64: base64(bytes) })
  } catch (error) {
    if (error === GHOSTSCRIPT_MISSING) throw new GhostscriptMissingError()
    throw error
  }
  const binary = atob(pdfBase64)
  const pdfBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const loading = getDocument({ data: pdfBytes })
  try {
    const document = await loading.promise
    const page = await document.getPage(1)
    const operators = await page.getOperatorList()
    return pdfOperatorListToShapes(page.view, operators.fnArray, operators.argsArray)
  } catch (error) {
    throw new ImportError(`לא ניתן לפרק את הצורות בקובץ ה-EPS: ${error instanceof Error ? error.message : 'שגיאת PDF לא צפויה.'}`)
  } finally {
    await loading.destroy().catch(() => {})
  }
}