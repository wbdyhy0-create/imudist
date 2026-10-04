import type { Assets } from './document'

const cache = new WeakMap<Assets, number>()

/**
 * How many bytes of picture data a document carries (the length of its embedded data: URLs). The same assets object
 * is the same answer, so it is counted once - not on every render.
 */
export function assetsWeight(assets: Assets): number {
  let weight = cache.get(assets)
  if (weight === undefined) {
    weight = 0
    for (const asset of Object.values(assets)) weight += asset.dataUrl.length
    cache.set(assets, weight)
  }
  return weight
}
