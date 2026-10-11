/**
 * The edge of a picture whose background was taken out. The mask the model gives is soft (and is drawn up from a small size to the
 * picture's), so the edge is a band of half-transparent pixels that still have the colour of what was behind the object: placed on a
 * coloured ground (or multiplied with it) that band shows as a light or grey halo round the object. Two things are done to the band:
 * the faint part of it, which is only a trace of the ground, is taken out and the strong part is made solid, and the pixels that stay
 * half-transparent are given the colour of the object just inside them.
 */

export interface EdgeCleanOptions {
  /** the alpha (0…255) at and under which a pixel is taken as ground: it goes fully transparent */
  low?: number
  /** the alpha at and over which a pixel is taken as the object: it becomes fully opaque */
  high?: number
  /** how many pixels outwards the colour of the object is carried into the band */
  reach?: number
}

export const DEFAULT_EDGE_CLEAN: Required<EdgeCleanOptions> = { low: 24, high: 232, reach: 4 }

/** the edge band of an RGBA picture cleaned in place (`data` is width × height × 4) */
export function cleanEdges(data: Uint8ClampedArray, width: number, height: number, options: EdgeCleanOptions = {}): void {
  const { low, high, reach } = { ...DEFAULT_EDGE_CLEAN, ...options }
  const count = width * height
  if (data.length < count * 4 || high <= low) return

  // the faint part of the band goes, the strong part is solid, what is between is stretched over the whole range
  const span = high - low
  for (let pixel = 0; pixel < count; pixel += 1) {
    const at = pixel * 4 + 3
    const alpha = data[at]!
    if (alpha <= low) data[at] = 0
    else if (alpha >= high) data[at] = 255
    else {
      const t = (alpha - low) / span
      data[at] = Math.round(255 * t * t * (3 - 2 * t))
    }
  }

  // solid pixels give their colour to the half-transparent ones next to them, ring by ring
  let solid = new Uint8Array(count)
  for (let pixel = 0; pixel < count; pixel += 1) solid[pixel] = data[pixel * 4 + 3] === 255 ? 1 : 0
  for (let ring = 0; ring < reach; ring += 1) {
    const next = solid.slice()
    let changed = false
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x
        if (solid[pixel] || data[pixel * 4 + 3] === 0) continue
        let r = 0
        let g = 0
        let b = 0
        let found = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx
            if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue
            const near = ny * width + nx
            if (!solid[near]) continue
            const o = near * 4
            r += data[o]!
            g += data[o + 1]!
            b += data[o + 2]!
            found += 1
          }
        }
        if (found === 0) continue
        const o = pixel * 4
        data[o] = Math.round(r / found)
        data[o + 1] = Math.round(g / found)
        data[o + 2] = Math.round(b / found)
        next[pixel] = 1
        changed = true
      }
    }
    solid = next
    if (!changed) break
  }
}
