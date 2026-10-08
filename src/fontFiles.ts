import type { jsPDF } from 'jspdf'
import { isItalicStyle, weightFromStyle } from './fonts'

/**
 * The font files of the fonts installed on this computer, to put inside a PDF so that its text is real text (see vectorText.ts).
 * The browser lets a page read them (Local Font Access, the same permission the font lists use); where it does not, nothing here
 * is available and the text stays a picture.
 */

export interface FontSpec {
  family: string
  /** CSS weight, 100…900 */
  weight: number
  italic: boolean
}

/** A font file read and checked: what to embed, and which characters it has a glyph for. */
export interface LoadedFont {
  key: string
  bytes: Uint8Array
  has: (codePoint: number) => boolean
}

/**
 * The face of the family that is the wanted one. A face that is not close (another slant, or a weight 200 or more away) is no
 * answer: the browser would have drawn the missing one by thickening or slanting a face, which a PDF cannot repeat.
 */
export function pickFace<T extends { family: string; style: string }>(faces: T[], spec: FontSpec): T | undefined {
  const family = spec.family.trim().toLowerCase()
  const inFamily = faces.filter((face) => face.family.trim().toLowerCase() === family && isItalicStyle(face.style) === spec.italic)
  let best: T | undefined
  for (const face of inFamily) {
    if (!best || Math.abs(weightFromStyle(face.style) - spec.weight) < Math.abs(weightFromStyle(best.style) - spec.weight)) best = face
  }
  return best && Math.abs(weightFromStyle(best.style) - spec.weight) < 200 ? best : undefined
}

/** What kind of font file this is: only the plain TrueType kind can be put in a PDF the way this app does it. */
export function sfntKind(bytes: Uint8Array): 'truetype' | 'cff' | 'collection' | 'unknown' {
  if (bytes.length < 12) return 'unknown'
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return 'truetype'
  if (tag === 'OTTO') return 'cff'
  if (tag === 'ttcf') return 'collection'
  return 'unknown'
}

/** Whether the font has a glyph for a character, read from the font's own character table (null when there is no usable one). */
export function glyphLookup(bytes: Uint8Array): ((codePoint: number) => boolean) | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12) return null
  const tables = view.getUint16(4)
  let cmapAt = -1
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16
    if (record + 16 > bytes.length) return null
    if (String.fromCharCode(bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3]) === 'cmap') cmapAt = view.getUint32(record + 8)
  }
  if (cmapAt < 0 || cmapAt + 4 > bytes.length) return null
  const subtables = view.getUint16(cmapAt + 2)
  let chosen = -1
  let chosenRank = -1
  for (let i = 0; i < subtables; i++) {
    const record = cmapAt + 4 + i * 8
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    const offset = cmapAt + view.getUint32(record + 4)
    if (offset + 4 > bytes.length) continue
    const format = view.getUint16(offset)
    // full Unicode first, then the basic plane
    const rank = format === 12 && ((platform === 3 && encoding === 10) || platform === 0) ? 3 : format === 4 && ((platform === 3 && encoding === 1) || platform === 0) ? 2 : -1
    if (rank > chosenRank) {
      chosen = offset
      chosenRank = rank
    }
  }
  if (chosen < 0) return null
  if (view.getUint16(chosen) === 12) {
    const groups = view.getUint32(chosen + 12)
    return (codePoint) => {
      for (let i = 0; i < groups; i++) {
        const group = chosen + 16 + i * 12
        if (group + 12 > bytes.length) return false
        if (codePoint < view.getUint32(group)) return false
        if (codePoint <= view.getUint32(group + 4)) return view.getUint32(group + 8) + (codePoint - view.getUint32(group)) > 0
      }
      return false
    }
  }
  const segmentsX2 = view.getUint16(chosen + 6)
  const ends = chosen + 14
  const starts = ends + segmentsX2 + 2
  const deltas = starts + segmentsX2
  const rangeOffsets = deltas + segmentsX2
  return (codePoint) => {
    if (codePoint > 0xffff) return false
    for (let s = 0; s < segmentsX2; s += 2) {
      if (codePoint > view.getUint16(ends + s)) continue
      const start = view.getUint16(starts + s)
      if (codePoint < start) return false
      const delta = view.getInt16(deltas + s)
      const rangeOffset = view.getUint16(rangeOffsets + s)
      if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0
      const at = rangeOffsets + s + rangeOffset + (codePoint - start) * 2
      if (at + 2 > bytes.length) return false
      const glyph = view.getUint16(at)
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0
    }
    return false
  }
}

interface InstalledFont {
  family: string
  style: string
  blob(): Promise<Blob>
}

let installed: Promise<InstalledFont[]> | null = null

/** The fonts installed here (asks the first time, like the font lists do); an empty list where the browser cannot tell. */
function installedFonts(): Promise<InstalledFont[]> {
  installed ??= (async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<InstalledFont[]> }).queryLocalFonts
    if (!query) return []
    try {
      return await query.call(window)
    } catch {
      return []
    }
  })()
  return installed
}

const loaded = new Map<string, Promise<LoadedFont | null>>()

/** The font file for a font, or null when it cannot be had or cannot be put in a PDF. Read once, then kept. */
export function loadFont(spec: FontSpec): Promise<LoadedFont | null> {
  const key = `${spec.family}|${spec.weight}|${spec.italic}`
  let found = loaded.get(key)
  if (!found) {
    found = (async () => {
      const face = pickFace(await installedFonts(), spec)
      if (!face) return null
      try {
        const bytes = new Uint8Array(await (await face.blob()).arrayBuffer())
        if (sfntKind(bytes) !== 'truetype') return null
        const has = glyphLookup(bytes)
        return has ? { key, bytes, has } : null
      } catch {
        return null
      }
    })()
    loaded.set(key, found)
  }
  return found
}

const registered = new WeakMap<jsPDF, Map<string, string>>()

/** Puts the font in the PDF (once) and gives back the name to draw with. */
export function registerFont(pdf: jsPDF, font: LoadedFont): string {
  let names = registered.get(pdf)
  if (!names) {
    names = new Map()
    registered.set(pdf, names)
  }
  let name = names.get(font.key)
  if (!name) {
    name = `imudist-font-${names.size + 1}`
    let binary = ''
    for (let i = 0; i < font.bytes.length; i += 8192) binary += String.fromCharCode.apply(null, font.bytes.subarray(i, i + 8192) as unknown as number[])
    pdf.addFileToVFS(`${name}.ttf`, binary)
    pdf.addFont(`${name}.ttf`, name, 'normal')
    names.set(font.key, name)
  }
  return name
}
