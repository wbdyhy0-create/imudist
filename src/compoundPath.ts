import type { PathGeom, PathVertex, ShapeFrame } from './document'
import { vertexHi, vertexHo, vertexPoint } from './shapes'

/**
 * "Release compound path": a path made of several separate pieces (the letters of a text turned into outlines in one shape, shapes
 * that were united and do not touch) becomes one shape for every piece. A piece keeps its own holes (the inside of an O).
 */

type Pt = [number, number]

/** the box of a polygon, 0…1 of the shape's box: the points and the curves between them (sampled) */
function polygonBox(polygon: PathVertex[][]) {
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
  for (const ring of polygon) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const [ax, ay] = vertexPoint(a)
      const [bx, by] = vertexPoint(b)
      take(ax, ay)
      const ho = vertexHo(a)
      const hi = vertexHi(b)
      if (!ho && !hi) continue
      // a cubic curve from a to b: its points at a few places along it
      const c1: Pt = [ax + (ho?.[0] ?? 0), ay + (ho?.[1] ?? 0)]
      const c2: Pt = [bx + (hi?.[0] ?? 0), by + (hi?.[1] ?? 0)]
      for (let step = 1; step < 8; step += 1) {
        const t = step / 8
        const u = 1 - t
        take(u * u * u * ax + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * bx, u * u * u * ay + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * by)
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

/** how many separate pieces a shape's outline has (a piece and its holes count as one) */
export function pieceCount(shape: Pick<ShapeFrame, 'kind' | 'geom'>): number {
  return shape.kind === 'path' ? (shape.geom?.length ?? 0) : 0
}

/**
 * The pieces of a path shape as shapes of their own, each placed where it was (the turn of the shape is kept: the piece is turned
 * about its own centre and put where the turned shape had it). Null when the shape is not a path of more than one piece.
 */
export function releaseCompoundPath(shape: ShapeFrame, newId: () => string, groupId: string | undefined): ShapeFrame[] | null {
  if (shape.kind !== 'path' || !shape.geom || shape.geom.length < 2) return null
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const pieces: ShapeFrame[] = []
  for (const polygon of shape.geom) {
    const box = polygonBox(polygon)
    if (!Number.isFinite(box.minX)) continue
    const spanX = Math.max(1e-6, box.maxX - box.minX)
    const spanY = Math.max(1e-6, box.maxY - box.minY)
    const w = Math.max(0.01, spanX * shape.w)
    const h = Math.max(0.01, spanY * shape.h)
    // where the piece's centre is, in the shape's own unturned box, then turned about the shape's centre
    const localX = (box.minX + spanX / 2) * shape.w - shape.w / 2
    const localY = (box.minY + spanY / 2) * shape.h - shape.h / 2
    const centerX = shape.x + shape.w / 2 + localX * cos - localY * sin
    const centerY = shape.y + shape.h / 2 + localX * sin + localY * cos
    const norm = (p: Pt): Pt => [(p[0] - box.minX) / spanX, (p[1] - box.minY) / spanY]
    // a curve handle is a length in the box: measured in the old box, put back in the piece's
    const scaleHandle = (handle: Pt): Pt => [handle[0] / spanX, handle[1] / spanY]
    const geom: PathGeom = [
      polygon.map((ring) =>
        ring.map((vertex): PathVertex => {
          const p = norm(vertexPoint(vertex))
          const hi = vertexHi(vertex)
          const ho = vertexHo(vertex)
          return hi || ho ? { p, ...(hi ? { hi: scaleHandle(hi) } : {}), ...(ho ? { ho: scaleHandle(ho) } : {}) } : p
        }),
      ),
    ]
    const piece: ShapeFrame = { ...shape, id: newId(), x: centerX - w / 2, y: centerY - h / 2, w, h, geom }
    if (groupId) piece.groupId = groupId
    else delete piece.groupId
    pieces.push(piece)
  }
  return pieces.length > 1 ? pieces : null
}
