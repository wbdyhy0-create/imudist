import { arcToCubics, type PathOp } from './vectorShapes'

/**
 * The outlines in an SVG file, as closed lines of points, for making a brush out of them. Only what is drawn with a fill is read: paths
 * (with every command, relative or not), rectangles, circles, ellipses and polygons, with the transforms of the shapes and of the groups
 * they are in. Nothing in the file is run, and what is not an outline (text, pictures, clips, masks, definitions) is left out.
 */

type Pt = [number, number]
type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y

/** the matrix that does `inner` first and then `outer` */
const multiply = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
]

const apply = (m: Matrix, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** the numbers of a list (separated by spaces and/or commas) */
const numbers = (text: string): number[] => (text.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number)

/** the value of an attribute that is a length: the number in it (a unit is ignored) */
const length = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) return fallback
  const found = numbers(value)[0]
  return found !== undefined && Number.isFinite(found) ? found : fallback
}

/** the matrix a `transform` attribute stands for */
export function parseTransform(text: string | undefined): Matrix {
  let result = IDENTITY
  if (!text) return result
  for (const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const values = numbers(match[2]!)
    let step: Matrix | null = null
    switch (match[1]) {
      case 'matrix':
        if (values.length >= 6) step = [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!]
        break
      case 'translate':
        step = [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0]
        break
      case 'scale':
        step = [values[0] ?? 1, 0, 0, values[1] ?? values[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const angle = ((values[0] ?? 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const [cx, cy] = [values[1] ?? 0, values[2] ?? 0]
        step = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]
        break
      }
      case 'skewX':
        step = [1, 0, Math.tan(((values[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        step = [1, Math.tan(((values[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    if (step) result = multiply(result, step)
  }
  return result
}

const ARGUMENTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }

/** Path data (every command, capital or small letter) as absolute moves, lines and cubic curves. What cannot be read ends the path. */
export function parsePathData(d: string): PathOp[] {
  const ops: PathOp[] = []
  const end = d.length
  let at = 0
  let command = ''
  let previous = ''
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  // the second control point of the last curve (cubic and quadratic apart), for the smooth commands that mirror it
  let cubicX = 0
  let cubicY = 0
  let quadX = 0
  let quadY = 0
  const skip = () => {
    while (at < end && /[\s,]/.test(d[at]!)) at += 1
  }
  const number = (): number | null => {
    skip()
    NUMBER.lastIndex = at
    const found = NUMBER.exec(d)
    if (!found) return null
    at = NUMBER.lastIndex
    return Number(found[0])
  }
  // the flags of an arc may be written with nothing between them ("a1 1 0 00.5.5")
  const flag = (): boolean | null => {
    skip()
    const c = d[at]
    if (c !== '0' && c !== '1') return null
    at += 1
    return c === '1'
  }
  while (true) {
    skip()
    if (at >= end) break
    const c = d[at]!
    if (/[A-Za-z]/.test(c)) {
      at += 1
      if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) break
      command = c
      if (c === 'Z' || c === 'z') {
        ops.push(['Z'])
        x = startX
        y = startY
        previous = 'Z'
        continue
      }
    } else if (!command || command === 'Z' || command === 'z') {
      break
    }
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    const count = ARGUMENTS[kind]!
    const values: number[] = []
    let readable = true
    if (kind === 'A') {
      const [rx, ry, turn] = [number(), number(), number()]
      const large = flag()
      const sweep = flag()
      const [ex, ey] = [number(), number()]
      if (rx === null || ry === null || turn === null || large === null || sweep === null || ex === null || ey === null) readable = false
      else values.push(rx, ry, turn, large ? 1 : 0, sweep ? 1 : 0, ex, ey)
    } else {
      for (let k = 0; k < count; k += 1) {
        const value = number()
        if (value === null) {
          readable = false
          break
        }
        values.push(value)
      }
    }
    if (!readable) break
    const ox = relative ? x : 0
    const oy = relative ? y : 0
    if (kind === 'M') {
      x = values[0]! + ox
      y = values[1]! + oy
      startX = x
      startY = y
      ops.push(['M', x, y])
      // more pairs after a move are lines
      command = relative ? 'l' : 'L'
    } else if (kind === 'L') {
      x = values[0]! + ox
      y = values[1]! + oy
      ops.push(['L', x, y])
    } else if (kind === 'H') {
      x = values[0]! + ox
      ops.push(['L', x, y])
    } else if (kind === 'V') {
      y = values[0]! + oy
      ops.push(['L', x, y])
    } else if (kind === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [values[0]! + ox, values[1]! + oy, values[2]! + ox, values[3]! + oy, values[4]! + ox, values[5]! + oy]
      ops.push(['C', x1, y1, x2, y2, x3, y3])
      cubicX = x2
      cubicY = y2
      x = x3
      y = y3
    } else if (kind === 'S') {
      const [x1, y1] = previous === 'C' || previous === 'S' ? [2 * x - cubicX, 2 * y - cubicY] : [x, y]
      const [x2, y2, x3, y3] = [values[0]! + ox, values[1]! + oy, values[2]! + ox, values[3]! + oy]
      ops.push(['C', x1, y1, x2, y2, x3, y3])
      cubicX = x2
      cubicY = y2
      x = x3
      y = y3
    } else if (kind === 'Q' || kind === 'T') {
      const [qx, qy] = kind === 'Q' ? [values[0]! + ox, values[1]! + oy] : previous === 'Q' || previous === 'T' ? [2 * x - quadX, 2 * y - quadY] : [x, y]
      const [ex, ey] = kind === 'Q' ? [values[2]! + ox, values[3]! + oy] : [values[0]! + ox, values[1]! + oy]
      ops.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey])
      quadX = qx
      quadY = qy
      x = ex
      y = ey
    } else {
      const ex = values[5]! + ox
      const ey = values[6]! + oy
      ops.push(...arcToCubics(x, y, values[0]!, values[1]!, values[2]!, values[3] !== 0, values[4] !== 0, ex, ey))
      x = ex
      y = ey
    }
    previous = kind
  }
  return ops
}

/** The steps of an outline as closed lines of points (each sub-path is one), with `matrix` applied; curves are sampled. */
export function flattenOps(ops: PathOp[], matrix: Matrix = IDENTITY): Pt[][] {
  const rings: Pt[][] = []
  let current: Pt[] = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const put = (px: number, py: number) => current.push(apply(matrix, px, py))
  const flush = () => {
    if (current.length >= 3) rings.push(current)
    current = []
  }
  const begin = () => {
    if (current.length === 0) put(x, y)
  }
  for (const op of ops) {
    if (op[0] === 'M') {
      flush()
      x = op[1]
      y = op[2]
      startX = x
      startY = y
      put(x, y)
    } else if (op[0] === 'L') {
      begin()
      x = op[1]
      y = op[2]
      put(x, y)
    } else if (op[0] === 'C') {
      begin()
      const [, c1x, c1y, c2x, c2y, ex, ey] = op
      const steps = 20
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        const u = 1 - t
        put(
          u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
        )
      }
      x = ex
      y = ey
    } else {
      flush()
      x = startX
      y = startY
    }
  }
  flush()
  return rings
}

// ── the elements of a file ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** elements whose content is not drawn where it stands */
const NOT_DRAWN = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'style', 'script', 'metadata', 'title', 'desc', 'filter', 'lineargradient', 'radialgradient', 'text', 'foreignobject', 'image', 'switch'])

const attributes = (text: string): Record<string, string> => {
  const found: Record<string, string> = {}
  for (const match of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) found[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? ''
  return found
}

/** what the `style` attribute says, by property */
const styleOf = (text: string | undefined): Record<string, string> => {
  const found: Record<string, string> = {}
  if (!text) return found
  for (const part of text.split(';')) {
    const colon = part.indexOf(':')
    if (colon > 0) found[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim()
  }
  return found
}

const isWhite = (fill: string): boolean => {
  const value = fill.replace(/\s+/g, '').toLowerCase()
  return value === '#fff' || value === '#ffffff' || value === 'white' || value === 'rgb(255,255,255)' || value === '#ffffffff'
}

/** the path data of a shape element, or null when it draws no outline */
function dataOf(name: string, a: Record<string, string>): string | null {
  switch (name) {
    case 'path':
      return a.d ?? null
    case 'rect': {
      const [x, y, w, h] = [length(a.x), length(a.y), length(a.width), length(a.height)]
      if (w <= 0 || h <= 0) return null
      let rx = length(a.rx, -1)
      let ry = length(a.ry, -1)
      if (rx < 0 && ry < 0) rx = ry = 0
      else if (rx < 0) rx = ry
      else if (ry < 0) ry = rx
      rx = Math.min(rx, w / 2)
      ry = Math.min(ry, h / 2)
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [length(a.cx), length(a.cy)]
      const rx = name === 'circle' ? length(a.r) : length(a.rx)
      const ry = name === 'circle' ? rx : length(a.ry)
      if (rx <= 0 || ry <= 0) return null
      return `M${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}Z`
    }
    case 'polygon':
    case 'polyline': {
      const values = numbers(a.points ?? '')
      if (values.length < 6) return null
      let d = ''
      for (let i = 0; i + 1 < values.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${values[i]} ${values[i + 1]}`
      return d + 'Z'
    }
    default:
      return null
  }
}

interface Level {
  name: string
  matrix: Matrix
  fill: string | undefined
  hidden: boolean
}

export interface SvgOutlines {
  /** one entry per drawn element: its closed lines (all of them filled together, by the even-odd rule) */
  groups: Pt[][][]
  /** nothing in the file had a fill: the outlines are of shapes that only had a line */
  lineOnly: boolean
}

/** The outlines of a file's text, or null when there is no SVG in it. White shapes (a ground behind the drawing) are left out. */
export function parseSvgOutlines(text: string): SvgOutlines | null {
  if (!/<svg[\s>]/i.test(text)) return null
  const source = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  const filled: Pt[][][] = []
  const lined: Pt[][][] = []
  const stack: Level[] = [{ name: '', matrix: IDENTITY, fill: undefined, hidden: false }]
  for (const tag of source.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const closing = tag[1] === '/'
    const name = tag[2]!.toLowerCase()
    const selfClosing = tag[4] === '/'
    if (closing) {
      // an end tag closes the nearest element of that name
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i]!.name === name) {
          stack.length = i
          break
        }
      }
      continue
    }
    const parent = stack[stack.length - 1]!
    const a = attributes(tag[3]!)
    const style = styleOf(a.style)
    const matrix = multiply(parent.matrix, parseTransform(a.transform))
    const fill = style.fill ?? a.fill ?? parent.fill
    const hidden =
      parent.hidden ||
      NOT_DRAWN.has(name) ||
      (style.display ?? a.display) === 'none' ||
      (style.visibility ?? a.visibility) === 'hidden' ||
      length(style.opacity ?? a.opacity, 1) <= 0 ||
      length(style['fill-opacity'] ?? a['fill-opacity'], 1) <= 0
    if (!hidden) {
      const d = dataOf(name, a)
      if (d) {
        const rings = flattenOps(parsePathData(d), matrix).filter((ring) => ring.length >= 3)
        if (rings.length > 0) {
          if (fill !== undefined && fill.toLowerCase() === 'none') lined.push(rings)
          else if (fill === undefined || !isWhite(fill)) filled.push(rings)
        }
      }
    }
    if (!selfClosing && name !== 'br') stack.push({ name, matrix, fill, hidden })
  }
  if (filled.length > 0) return { groups: filled, lineOnly: false }
  if (lined.length > 0) return { groups: lined, lineOnly: true }
  return { groups: [], lineOnly: false }
}
