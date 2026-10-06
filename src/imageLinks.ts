/**
 * Linked pictures: a picture placed from a file on disk is not copied into the document. The document keeps the file's
 * absolute path (and a small preview, for when the file is gone); the picture itself is read from the file when the
 * document opens and shown from a blob: URL, so the saved document stays small. Only the desktop app can do this - a
 * browser never learns a file's path - and everywhere else pictures are embedded as before.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Asset, AssetLink, Assets } from './document'
import { hashId } from './assetHash'
import { isTauri } from './fileio'
import { imageMimeOfName, type PlacedImage } from './importImage'
import { ImportError } from './importText'

/** how a linked picture's file compares to what the document last read from it */
export type LinkStatus = 'ok' | 'modified' | 'missing'

interface FileStat {
  size: number
  mtime: number
}

const PREVIEW_WIDTH = 320
const LOAD_AT_ONCE = 4
export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']

export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || path
export const isImagePath = (path: string) => imageMimeOfName(path) !== null
/** Windows paths are not case sensitive, and may use either slash */
const keyOf = (path: string) => path.replace(/\\/g, '/').toLowerCase()

// ── what is on disk now ─────────────────────────────────────────────────────────

const stats = new Map<string, FileStat | null>()
const listeners = new Set<() => void>()
let version = 0
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
const announce = () => {
  version += 1
  listeners.forEach((listener) => listener())
}

/** Changes whenever any link's file was looked at again and something differed: lets a list of links redraw. */
export const useLinkVersion = () => useSyncExternalStore(subscribe, () => version)

function remember(path: string, stat: FileStat | null) {
  const before = stats.get(keyOf(path))
  stats.set(keyOf(path), stat)
  return before === undefined || before?.size !== stat?.size || before?.mtime !== stat?.mtime
}

async function statFiles(paths: string[]): Promise<(FileStat | null)[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<(FileStat | null)[]>('stat_linked_images', { paths })
}

async function readFileBytes(path: string): Promise<ArrayBuffer> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<ArrayBuffer>('read_linked_image', { path })
}

/** Look at the files again; whoever shows a link's status is told if anything changed. */
export async function refreshLinkStats(paths: string[]) {
  if (!isTauri || paths.length === 0) return
  try {
    const found = await statFiles(paths)
    let changed = false
    paths.forEach((path, i) => {
      if (remember(path, found[i] ?? null)) changed = true
    })
    if (changed) announce()
  } catch (error) {
    console.warn('Could not check the linked pictures.', error)
  }
}

export function linkStatus(link: AssetLink): LinkStatus {
  const stat = stats.get(keyOf(link.path))
  if (stat === undefined) return 'ok' // not looked at yet
  if (!stat) return 'missing'
  return stat.size === link.size && stat.mtime === link.mtime ? 'ok' : 'modified'
}

/** The status of a link, kept up to date while the component is shown. */
export function useLinkStatus(link: AssetLink | undefined): LinkStatus | null {
  return useSyncExternalStore(subscribe, () => (link ? linkStatus(link) : null))
}

/** Every linked picture of the document, from the moment it opens and each time the window comes back into view. */
export function useLinkWatcher(assets: Assets) {
  const paths = useMemo(() => [...new Set(Object.values(assets).flatMap((asset) => (asset.link ? [asset.link.path] : [])))], [assets])
  useEffect(() => {
    if (!isTauri || paths.length === 0) return
    const check = () => void refreshLinkStats(paths)
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [paths])
}

// ── reading a picture from its file ─────────────────────────────────────────────

async function measure(url: string, name: string) {
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    throw new ImportError(`לא ניתן לקרוא את התמונה "${name}". ייתכן שהקובץ פגום.`)
  }
  // an SVG without its own size reports 0: give it a sensible default
  return { img, width: img.naturalWidth || 300, height: img.naturalHeight || 300 }
}

function makePreview(img: HTMLImageElement, width: number, height: number): string {
  const scale = Math.min(1, PREVIEW_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.8)
}

function mimeOf(path: string): string {
  const mime = imageMimeOfName(path)
  if (!mime) throw new ImportError(`"${fileNameOf(path)}" אינו קובץ תמונה נתמך (PNG, JPG, GIF, WebP, SVG, BMP או AVIF).`)
  return mime
}

async function readLinkedFile(path: string, mime: string): Promise<{ asset: Asset; url: string }> {
  const name = fileNameOf(path)
  const [stat] = await statFiles([path])
  if (!stat) throw new ImportError(`הקובץ "${name}" לא נמצא.`)
  let bytes: ArrayBuffer
  try {
    bytes = await readFileBytes(path)
  } catch (error) {
    throw new ImportError(typeof error === 'string' && error.includes('too large') ? `התמונה "${name}" גדולה מדי (מעל 50MB).` : `לא ניתן לקרוא את הקובץ "${name}".`)
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  try {
    const { img, width, height } = await measure(url, name)
    remember(path, stat)
    return { url, asset: { name, mime, dataUrl: url, width, height, link: { path, size: stat.size, mtime: stat.mtime, preview: makePreview(img, width, height) } } }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** A picture to place from a file on disk, kept as a link: the same file is the same picture wherever it is placed. */
export async function readLinkedImage(path: string): Promise<PlacedImage> {
  const { asset } = await readLinkedFile(path, mimeOf(path))
  return { assetId: await hashId(new TextEncoder().encode('link:' + keyOf(path)).buffer as ArrayBuffer), asset }
}

/** Read the file again: the picture takes on what the file has now. */
export async function updateLinkedAsset(asset: Asset): Promise<Asset> {
  if (!asset.link) return asset
  return (await readLinkedFile(asset.link.path, asset.mime)).asset
}

/** Point the picture at another file. */
export async function relinkAsset(path: string): Promise<Asset> {
  return (await readLinkedFile(path, mimeOf(path))).asset
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Turn a link into an embedded picture: the file's bytes, as they are on disk now, go into the document. */
export async function embedLinkedAsset(asset: Asset): Promise<Asset> {
  if (!asset.link) return asset
  const name = fileNameOf(asset.link.path)
  let bytes: ArrayBuffer
  try {
    bytes = await readFileBytes(asset.link.path)
  } catch {
    throw new ImportError(`הקובץ "${name}" לא נמצא, ולכן אי אפשר להטמיע אותו.`)
  }
  const dataUrl = await toDataUrl(new Blob([bytes], { type: asset.mime }))
  const { width, height } = await measure(dataUrl, name)
  return { name: asset.name, mime: asset.mime, dataUrl, width, height }
}

/**
 * A document has just been read from its file: give each linked picture whose file is still as it was saved its real
 * picture, in place. The others keep the saved preview - a changed file waits for an update, a missing one for a new link.
 */
export async function resolveLinkedAssets(assets: Assets): Promise<{ missing: number; modified: number }> {
  const linked = Object.entries(assets).filter((entry): entry is [string, Asset & { link: AssetLink }] => !!entry[1].link)
  const result = { missing: 0, modified: 0 }
  if (!isTauri || linked.length === 0) return result
  let found: (FileStat | null)[]
  try {
    found = await statFiles(linked.map(([, asset]) => asset.link.path))
  } catch (error) {
    console.warn('Could not check the linked pictures.', error)
    return result
  }
  const toRead: [string, Asset & { link: AssetLink }][] = []
  linked.forEach((entry, i) => {
    const stat = found[i] ?? null
    remember(entry[1].link.path, stat)
    if (!stat) result.missing += 1
    else if (stat.size !== entry[1].link.size || stat.mtime !== entry[1].link.mtime) result.modified += 1
    else toRead.push(entry)
  })
  let next = 0
  const worker = async () => {
    while (next < toRead.length) {
      const [id, asset] = toRead[next++]
      try {
        const bytes = await readFileBytes(asset.link.path)
        assets[id] = { ...asset, dataUrl: URL.createObjectURL(new Blob([bytes], { type: asset.mime })) }
      } catch (error) {
        console.warn('Could not read a linked picture.', error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOAD_AT_ONCE, toRead.length) }, worker))
  announce()
  return result
}

// ── dialogs and the file manager ─────────────────────────────────────────────────

const IMAGE_FILTER = { name: 'תמונות', extensions: IMAGE_FILE_EXTENSIONS }

/** Ask for the picture files to place; resolves to an empty list when cancelled. */
export async function pickImagePaths(): Promise<string[]> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ multiple: true, directory: false, filters: [IMAGE_FILTER] })
  return picked ?? []
}

/** Ask for the file a picture should be linked to instead; null when cancelled. */
export async function pickOneImagePath(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ multiple: false, directory: false, filters: [IMAGE_FILTER] })
  return typeof picked === 'string' ? picked : null
}

export async function revealInFileManager(path: string) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}
