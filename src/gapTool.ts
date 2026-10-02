import type { Rect } from './spacing'
import { MIN_GAP } from './spacing'

export type GapAxis = 'x' | 'y'

export interface GapObject extends Rect {
  id: string
  memberIds?: string[]
  members?: GapMember[]
}

export interface GapMember extends Rect {
  id: string
}

export function expandGapObject(object: GapObject, minSize: number): GapMember[] {
  if (!object.members?.length || !object.memberIds?.length) return [{ id: object.id, x: object.x, y: object.y, w: object.w, h: object.h }]
  const left = Math.min(...object.members.map((member) => member.x))
  const top = Math.min(...object.members.map((member) => member.y))
  const right = Math.max(...object.members.map((member) => member.x + member.w))
  const bottom = Math.max(...object.members.map((member) => member.y + member.h))
  const scaleX = object.w / Math.max(minSize, right - left)
  const scaleY = object.h / Math.max(minSize, bottom - top)
  return object.members.map((member) => ({
    id: member.id,
    x: object.x + (member.x - left) * scaleX,
    y: object.y + (member.y - top) * scaleY,
    w: Math.max(minSize, member.w * scaleX),
    h: Math.max(minSize, member.h * scaleY),
  }))
}

export interface GapRegion extends Rect {
  axis: GapAxis
  beforeIds: string[]
  afterIds: string[]
}

export interface GapDelta {
  x: number
  y: number
}

export interface GapMoveOptions {
  ctrl?: boolean
  alt?: boolean
  grabbedEdges?: Partial<Record<GapAxis, 'before' | 'after'>>
}

interface AxisInfo {
  beforeEdge: (rect: Rect) => number
  afterEdge: (rect: Rect) => number
  crossStart: (rect: Rect) => number
  crossEnd: (rect: Rect) => number
}

const AXIS: Record<GapAxis, AxisInfo> = {
  x: {
    beforeEdge: (rect) => rect.x + rect.w,
    afterEdge: (rect) => rect.x,
    crossStart: (rect) => rect.y,
    crossEnd: (rect) => rect.y + rect.h,
  },
  y: {
    beforeEdge: (rect) => rect.y + rect.h,
    afterEdge: (rect) => rect.y,
    crossStart: (rect) => rect.x,
    crossEnd: (rect) => rect.x + rect.w,
  },
}

const crosses = (start: number, end: number, point: number) => point >= start && point <= end
const touchesRange = (start: number, end: number, rangeStart: number, rangeEnd: number) =>
  end >= rangeStart - MIN_GAP && start <= rangeEnd + MIN_GAP

function findGapOnAxis(point: { x: number; y: number }, objects: GapObject[], axis: GapAxis, nearestOnly: boolean): GapRegion | null {
  const info = AXIS[axis]
  const along = axis === 'x' ? point.x : point.y
  const across = axis === 'x' ? point.y : point.x
  const candidates = objects.flatMap((before) => objects.flatMap((after) => {
    if (before === after || info.beforeEdge(before) > along || info.afterEdge(after) < along) return []
    const start = info.beforeEdge(before)
    const end = info.afterEdge(after)
    const crossStart = Math.max(info.crossStart(before), info.crossStart(after))
    const crossEnd = Math.min(info.crossEnd(before), info.crossEnd(after))
    return end - start > 1 && crossEnd >= crossStart ? [{ before, after, start, end, crossStart, crossEnd }] : []
  }))
  if (!candidates.length) return null

  const groups: typeof candidates[] = []
  for (const candidate of candidates) {
    let group = groups.find((items) => Math.abs(items[0].start - candidate.start) <= MIN_GAP && Math.abs(items[0].end - candidate.end) <= MIN_GAP)
    if (!group) groups.push(group = [])
    if (!group.some((item) => item.before.id === candidate.before.id && item.after.id === candidate.after.id)) group.push(candidate)
  }
  const eligible = groups.flatMap((items) => {
    const direct = items.filter((item) => crosses(item.crossStart, item.crossEnd, across))
    if (direct.length) return [{ items, chosen: direct, distance: 0 }]
    const beforeBands = items.filter((item) => item.crossEnd < across).sort((a, b) => b.crossEnd - a.crossEnd)
    const afterBands = items.filter((item) => item.crossStart > across).sort((a, b) => a.crossStart - b.crossStart)
    const above = beforeBands[0]
    const below = afterBands[0]
    if (!above || !below || below.crossStart - above.crossEnd <= 0) return []
    return [{ items, chosen: [above, below], distance: below.crossStart - above.crossEnd }]
  }).sort((a, b) => a.distance - b.distance || (a.items[0].end - a.items[0].start) - (b.items[0].end - b.items[0].start))
  const selection = eligible[0]
  if (!selection) return null
  const chosen = nearestOnly
    ? [selection.chosen.reduce((best, item) => Math.abs((item.crossStart + item.crossEnd) / 2 - across) < Math.abs((best.crossStart + best.crossEnd) / 2 - across) ? item : best)]
    : selection.items
  const gapStart = Math.min(...chosen.map((item) => item.start))
  const gapEnd = Math.max(...chosen.map((item) => item.end))
  const beforeObjects = chosen.map((item) => item.before)
  const afterObjects = chosen.map((item) => item.after)
  let crossStart = Math.min(...chosen.map((item) => item.crossStart))
  let crossEnd = Math.max(...chosen.map((item) => item.crossEnd))

  if (!nearestOnly) {
    let changed = true
    while (changed) {
      changed = false
      for (const object of objects) {
        if (beforeObjects.some((item) => item.id === object.id) || afterObjects.some((item) => item.id === object.id)) continue
        const start = info.crossStart(object)
        const end = info.crossEnd(object)
        if (Math.abs(info.beforeEdge(object) - gapStart) <= MIN_GAP && touchesRange(start, end, crossStart, crossEnd)) {
          beforeObjects.push(object)
          crossStart = Math.min(crossStart, start)
          crossEnd = Math.max(crossEnd, end)
          changed = true
        } else if (Math.abs(info.afterEdge(object) - gapEnd) <= MIN_GAP && touchesRange(start, end, crossStart, crossEnd)) {
          afterObjects.push(object)
          crossStart = Math.min(crossStart, start)
          crossEnd = Math.max(crossEnd, end)
          changed = true
        }
      }
    }
  }

  return axis === 'x'
    ? { axis, x: gapStart, y: crossStart, w: gapEnd - gapStart, h: crossEnd - crossStart, beforeIds: beforeObjects.map((object) => object.id), afterIds: afterObjects.map((object) => object.id) }
    : { axis, x: crossStart, y: gapStart, w: crossEnd - crossStart, h: gapEnd - gapStart, beforeIds: beforeObjects.map((object) => object.id), afterIds: afterObjects.map((object) => object.id) }
}

/** Find the x-axis and/or y-axis gap directly under a point. */
export function findGaps(point: { x: number; y: number }, objects: GapObject[], nearestOnly = false): GapRegion[] {
  return (['x', 'y'] as const).flatMap((axis) => {
    const gap = findGapOnAxis(point, objects, axis, nearestOnly)
    return gap ? [gap] : []
  })
}

/** Resize both sides by the same clamped delta, preserving the gap width. */
export function moveGap(gaps: GapRegion[], originals: GapObject[], raw: GapDelta, minSize: number, options: GapMoveOptions = {}): { objects: GapObject[]; delta: GapDelta; gaps: GapRegion[] } {
  const xGaps = gaps.filter((gap) => gap.axis === 'x')
  const yGaps = gaps.filter((gap) => gap.axis === 'y')
  const minimumDimension = (object: GapObject, dimension: 'w' | 'h') => object.members?.length
    ? object[dimension] * Math.max(...object.members.map((member) => Math.min(minSize, member[dimension]) / Math.max(Number.EPSILON, member[dimension])))
    : Math.min(minSize, object[dimension])
  const clampAxis = (axisGaps: GapRegion[], amount: number, dimension: 'w' | 'h'): number => {
    if (!axisGaps.length) return 0
    if (options.alt && options.ctrl) return Math.max(-Math.min(...axisGaps.map((gap) => gap[dimension])), amount)
    if (options.alt) return amount
    let minimum = -Infinity
    let maximum = Infinity
    for (const gap of axisGaps) {
      if (options.ctrl) {
        minimum = Math.max(minimum, -gap[dimension])
        for (const id of [...gap.beforeIds, ...gap.afterIds]) {
          const object = originals.find((candidate) => candidate.id === id)
          if (object) maximum = Math.min(maximum, 2 * (object[dimension] - minimumDimension(object, dimension)))
        }
      } else {
        for (const id of gap.beforeIds) {
          const object = originals.find((candidate) => candidate.id === id)
          if (object) minimum = Math.max(minimum, minimumDimension(object, dimension) - object[dimension])
        }
        for (const id of gap.afterIds) {
          const object = originals.find((candidate) => candidate.id === id)
          if (object) maximum = Math.min(maximum, object[dimension] - minimumDimension(object, dimension))
        }
      }
    }
    const requested = options.ctrl
      ? amount * (options.grabbedEdges?.[axisGaps[0].axis] === 'after' ? 2 : -2)
      : amount
    return Math.max(minimum, Math.min(maximum, requested))
  }
  const movement = {
    x: clampAxis(xGaps, raw.x, 'w'),
    y: clampAxis(yGaps, raw.y, 'h'),
  }
  const beforeX = new Set(xGaps.flatMap((gap) => gap.beforeIds))
  const afterX = new Set(xGaps.flatMap((gap) => gap.afterIds))
  const beforeY = new Set(yGaps.flatMap((gap) => gap.beforeIds))
  const afterY = new Set(yGaps.flatMap((gap) => gap.afterIds))
  const resizeDelta = {
    x: options.ctrl && !options.alt ? movement.x : options.ctrl && options.alt ? movement.x : 0,
    y: options.ctrl && !options.alt ? movement.y : options.ctrl && options.alt ? movement.y : 0,
  }
  const gapWidthDelta = (gap: GapRegion) => {
    if (options.ctrl && options.alt) return movement[gap.axis]
    if (options.ctrl) return movement[gap.axis]
    return 0
  }
  const objects = originals.map((object) => {
    let { x, y, w, h } = object
    if (options.alt && options.ctrl) {
      if (afterX.has(object.id)) x += movement.x
      if (afterY.has(object.id)) y += movement.y
    } else if (options.alt) {
      if (beforeX.has(object.id) || afterX.has(object.id)) x += movement.x
      if (beforeY.has(object.id) || afterY.has(object.id)) y += movement.y
    } else if (options.ctrl) {
      if (beforeX.has(object.id) || afterX.has(object.id)) w -= resizeDelta.x / 2
      if (beforeY.has(object.id) || afterY.has(object.id)) h -= resizeDelta.y / 2
      if (afterX.has(object.id)) x += resizeDelta.x / 2
      if (afterY.has(object.id)) y += resizeDelta.y / 2
    } else {
      if (beforeX.has(object.id)) w += movement.x
      if (afterX.has(object.id)) { x += movement.x; w -= movement.x }
      if (beforeY.has(object.id)) h += movement.y
      if (afterY.has(object.id)) { y += movement.y; h -= movement.y }
    }
    return x === object.x && y === object.y && w === object.w && h === object.h ? object : { ...object, x, y, w, h }
  })
  const delta = options.ctrl && !options.alt
    ? { x: raw.x, y: raw.y }
    : movement
  const movedGaps = gaps.map((gap) => {
    const axisMovement = movement[gap.axis]
    if (options.ctrl && !options.alt) {
      const widthDelta = gapWidthDelta(gap)
      return {
        ...gap,
        ...(gap.axis === 'x'
          ? { x: gap.x - widthDelta / 2, w: Math.max(0, gap.w + widthDelta) }
          : { y: gap.y - widthDelta / 2, h: Math.max(0, gap.h + widthDelta) }),
      }
    }
    if (options.ctrl && options.alt) {
      return { ...gap, ...(gap.axis === 'x' ? { w: Math.max(0, gap.w + axisMovement) } : { h: Math.max(0, gap.h + axisMovement) }) }
    }
    return { ...gap, ...(gap.axis === 'x' ? { x: gap.x + axisMovement } : { y: gap.y + axisMovement }) }
  })
  return { objects, delta, gaps: movedGaps }
}
