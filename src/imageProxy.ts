/**
 * Smaller copies of big pictures, for the screen. A page imported from a PDF is a 2480x3508 picture (300 DPI): drawn
 * at any zoom up to 100% the browser decodes all of it - 35 MB - to show a few hundred pixels, and with dozens of
 * pages in view (a small zoom) that is the whole memory of the machine. So a picture that is much bigger than what is
 * shown is shown from a copy made for the purpose, once, in the browser's own memory: the file and the export keep
 * the original picture, only the screen takes the copy. Pictures that are not much bigger than the biggest copy are
 * shown as they are.
 */
import { useEffect, useReducer } from 'react'
import type { Asset } from './document'

/** widths (pixels) of the copies: a thumbnail for a zoomed-out view of many pages, and a page-sized one */
export const PROXY_TIERS = [320, 1240] as const
/** a picture no wider than this is shown as it is - a copy would save next to nothing */
const SMALLEST_WORTH_A_COPY = Math.round(PROXY_TIERS[PROXY_TIERS.length - 1] * 1.5)
/** how many pictures keep copies at most; the oldest unused ones go first */
const MAX_PICTURES = 300

/**
 * Which copy shows a picture `assetWidth` pixels wide in `neededPx` pixels on screen: the width of the smallest copy
 * that is still at least that wide, or null for the picture itself (it is small, or it is shown bigger than any copy).
 */
export function chooseTier(neededPx: number, assetWidth: number): number | null {
  if (assetWidth <= SMALLEST_WORTH_A_COPY) return null
  const tier = PROXY_TIERS.find((width) => neededPx <= width)
  return tier === undefined ? null : tier
}

interface Entry {
  /** copy width -> object URL */
  urls: Map<number, string>
  building: boolean
  failed: boolean
}

const entries = new Map<string, Entry>()
/** how many mounted pictures show each one - those are never let go of */
const pinned = new Map<string, number>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** the copies are made one at a time: decoding a 35 MB picture is the heavy part, and ten at once would be ten times the memory */
let queue: Promise<void> = Promise.resolve()

function toBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png'))
}

async function makeCopies(entry: Entry, asset: Asset) {
  const original = await (await fetch(asset.dataUrl)).blob()
  // largest copy first, then each smaller one from the one before it: the original is decoded once
  let source: Blob | ImageBitmap = original
  for (const width of [...PROXY_TIERS].reverse()) {
    const bitmap: ImageBitmap = await createImageBitmap(source, { resizeWidth: width, resizeHeight: Math.max(1, Math.round((asset.height * width) / asset.width)), resizeQuality: 'high' })
    if (source instanceof ImageBitmap) source.close()
    entry.urls.set(width, URL.createObjectURL(await toBlob(bitmap)))
    source = bitmap
  }
  if (source instanceof ImageBitmap) source.close()
}

function forget(id: string) {
  const entry = entries.get(id)
  if (!entry) return
  for (const url of entry.urls.values()) URL.revokeObjectURL(url)
  entries.delete(id)
}

function evict() {
  for (const id of entries.keys()) {
    if (entries.size <= MAX_PICTURES) return
    if (!pinned.has(id) && !entries.get(id)!.building) forget(id)
  }
}

/** Start making the copies of a picture (nothing happens if they are made, or being made). */
export function requestProxy(assetId: string, asset: Asset) {
  if (entries.has(assetId)) return
  const entry: Entry = { urls: new Map(), building: true, failed: false }
  entries.set(assetId, entry)
  evict()
  queue = queue.then(async () => {
    try {
      await makeCopies(entry, asset)
    } catch (error) {
      // the picture is simply shown as it is
      console.warn('Could not make a smaller copy of a picture.', error)
      entry.failed = true
    } finally {
      entry.building = false
      notify()
    }
  })
}

/**
 * The address to show a picture from at `neededPx` pixels wide on screen: the picture itself when it is small or shown big,
 * otherwise a copy (made on first need; until it is ready the next best copy that is, or nothing for a moment).
 */
export function useDisplaySrc(assetId: string, asset: Asset | undefined, neededPx: number): string | undefined {
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    listeners.add(rerender)
    return () => void listeners.delete(rerender)
  }, [])
  // a linked picture changes under the same id when its file is updated or relinked (and back, with undo): its copies follow what it is showing
  const key = asset?.link ? `${assetId}|${asset.dataUrl}` : assetId
  const tier = asset ? chooseTier(neededPx, asset.width) : null
  const entry = entries.get(key)
  // while on screen the copies of a picture are kept
  useEffect(() => {
    if (tier === null) return
    pinned.set(key, (pinned.get(key) ?? 0) + 1)
    return () => {
      const left = (pinned.get(key) ?? 1) - 1
      if (left > 0) pinned.set(key, left)
      else pinned.delete(key)
    }
  }, [key, tier])
  useEffect(() => {
    if (asset && tier !== null) requestProxy(key, asset)
  }, [key, asset, tier])
  if (!asset) return undefined
  if (tier === null || entry?.failed) return asset.dataUrl
  return entry?.urls.get(tier) ?? [...(entry?.urls ?? [])].sort((a, b) => b[0] - a[0])[0]?.[1]
}
