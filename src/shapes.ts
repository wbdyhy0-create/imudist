import { MAX_SIDES, MIN_SIDES, type ShapeFrame, type ShapeKind } from './document'

/** Geometry of the shapes, in the shape's own units (0,0 = its top-left corner, w × h = its size). */

export const SHAPE_NAMES: Record<ShapeKind, string> = { rect: 'מלבן', ellipse: 'אליפסה', polygon: 'מצולע' }
export const SIDE_NAMES: Record<number, string> = { 3: 'משולש', 4: 'מרובע', 5: 'מחומש', 6: 'משושה' }

/** What a click without dragging creates (points), and the last settings of each tool. */
export interface ShapePrefs {
  rect: { w: number; h: number; radius: number }
  ellipse: { w: number; h: number }
  polygon: { w: number; h: number; sides: number }
}

export const DEFAULT_SHAPE_PREFS: ShapePrefs = {
  rect: { w: 150, h: 100, radius: 0 },
  ellipse: { w: 150, h: 100 },
  polygon: { w: 120, h: 120, sides: 6 },
}

export const clampSides = (n: number) => Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(n)))

/** The corner points of a regular polygon (apex up), stretched so it fills the w × h box exactly. */
export function polygonPoints(sides: number, w: number, h: number): [number, number][] {
  const n = clampSides(sides)
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [Math.cos(a), Math.sin(a)] as [number, number]
  })
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return raw.map(([x, y]) => [((x - x0) / (x1 - x0)) * w, ((y - y0) / (y1 - y0)) * h])
}

/** A rectangle's corner radii, each limited so that neighbouring corners never overlap. */
export function fitRadii(radii: [number, number, number, number] | undefined, w: number, h: number): [number, number, number, number] {
  const [tl, tr, br, bl] = (radii ?? [0, 0, 0, 0]).map((r) => Math.max(0, r))
  // the same rule as CSS border-radius: shrink every radius by the tightest side
  const k = Math.min(1, w / Math.max(tl + tr, br + bl, 1e-9), h / Math.max(tl + bl, tr + br, 1e-9))
  return [tl * k, tr * k, br * k, bl * k]
}

/** The SVG path of a rectangle with (possibly different) rounded corners. */
export function roundedRectPath(w: number, h: number, radii?: [number, number, number, number]): string {
  const [tl, tr, br, bl] = fitRadii(radii, w, h)
  return [
    `M${tl} 0`,
    `H${w - tr}`,
    tr ? `A${tr} ${tr} 0 0 1 ${w} ${tr}` : '',
    `V${h - br}`,
    br ? `A${br} ${br} 0 0 1 ${w - br} ${h}` : '',
    `H${bl}`,
    bl ? `A${bl} ${bl} 0 0 1 0 ${h - bl}` : '',
    `V${tl}`,
    tl ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '',
    'Z',
  ].join('')
}

/** The outline of any shape as an SVG path, in its own units scaled by `k`. */
export function shapePath(s: ShapeFrame, k = 1): string {
  const w = s.w * k
  const h = s.h * k
  if (s.kind === 'rect') return roundedRectPath(w, h, s.radii?.map((r) => r * k) as [number, number, number, number] | undefined)
  if (s.kind === 'ellipse') return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 1 0 ${h / 2}Z`
  return 'M' + polygonPoints(s.sides ?? 6, w, h).map(([x, y]) => `${x} ${y}`).join('L') + 'Z'
}

/** Where the four rounding handles of a rectangle sit, and which way is "inside" at each corner. */
export const CORNERS = [
  { name: 'שמאל למעלה', sx: 1, sy: 1, fx: 0, fy: 0 },
  { name: 'ימין למעלה', sx: -1, sy: 1, fx: 1, fy: 0 },
  { name: 'ימין למטה', sx: -1, sy: -1, fx: 1, fy: 1 },
  { name: 'שמאל למטה', sx: 1, sy: -1, fx: 0, fy: 1 },
] as const
