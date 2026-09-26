import { DEFAULT_TEXT_STYLE, type CharStyle, type Run, type TextAlign, type TextStyle } from './document'
import { mergeRuns } from './story'
import { unzipEntry } from './zip'

/** Text (with character formatting) brought in from another file, ready to be placed into frames. */
export interface PlacedText {
  /** where it came from, shown to the user */
  name: string
  text: string
  runs: Run[]
  /** default style of the story; its alignment follows the direction of the text */
  style: TextStyle
  /** Word paragraph styles found in the source document, keyed by their Word style id. */
  paragraphStyles?: ImportedParagraphStyle[]
  /** One Word style id for every paragraph in `text`, in paragraph order. */
  paragraphStyleIds?: string[]
  /** Display names matching paragraphStyleIds, kept as a stable fallback when local ids change. */
  paragraphStyleNames?: string[]
  /** semi-automatic flow: the last frame of the thread being filled; the next frame is linked after it */
  continueFrom?: string
}

export interface ImportedParagraphStyle {
  wordId: string
  name: string
  patch: Partial<Pick<TextStyle, 'fontFamily' | 'color' | 'weight' | 'italic' | 'fontSize' | 'align'>>
}

export class ImportError extends Error {}

/** Largest file we try to read. */
const MAX_FILE = 40 * 1024 * 1024

const HEBREW_OR_ARABIC = /[֐-ࣿ]/
const LATIN = /[A-Za-z]/

/** Right-aligned when most letters are Hebrew / Arabic, left-aligned otherwise. */
function alignFor(text: string): TextStyle['align'] {
  let rtl = 0
  let ltr = 0
  for (const ch of text) {
    if (HEBREW_OR_ARABIC.test(ch)) rtl++
    else if (LATIN.test(ch)) ltr++
  }
  return rtl >= ltr ? 'right' : 'left'
}

export const countWords = (text: string) => (text.match(/\S+/g) ?? []).length

// ── plain text ──────────────────────────────────────────────────────────────────
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1255').decode(buffer) // old Hebrew text files
  }
}

export function placedFromPlainText(name: string, raw: string): PlacedText {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!text.trim()) throw new ImportError('אין טקסט בקובץ.')
  const style = { ...DEFAULT_TEXT_STYLE, align: alignFor(text) }
  return { name, text, runs: [{ len: text.length, style: { fontFamily: style.fontFamily, fontSize: style.fontSize, weight: style.weight, italic: style.italic, tracking: style.tracking } }], style }
}

// ── Word (.docx) ────────────────────────────────────────────────────────────────
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const isWordElement = (el: Element) => el.namespaceURI === W || el.prefix === 'w' || el.localName === 'p' || el.localName === 'pPr' || el.localName === 'pStyle' || el.localName === 'r' || el.localName === 'rPr' || el.localName === 't' || el.localName === 'style' || el.localName === 'name' || el.localName === 'basedOn' || el.localName === 'docDefaults' || el.localName === 'rPrDefault'
const elements = (root: Document, name: string) => Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name && isWordElement(el))

interface RProps {
  bold?: boolean
  italic?: boolean
  hidden?: boolean
  /** points */
  size?: number
  sizeCs?: number
  font?: string
  fontCs?: string
  color?: string
  align?: TextAlign
}
interface ThemeFonts {
  majorLatin?: string
  minorLatin?: string
  majorEastAsia?: string
  minorEastAsia?: string
  majorBidi?: string
  minorBidi?: string
}

const attr = (el: Element | null | undefined, name: string) => {
  if (!el) return null
  const direct = el.getAttributeNS(W, name) ?? el.getAttribute('w:' + name)
  if (direct !== null) return direct
  return Array.from(el.attributes).find((item) => item.localName === name)?.value ?? null
}

function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null
  for (const c of Array.from(el.children)) if (c.localName === name && (c.namespaceURI === W || c.prefix === 'w')) return c
  return null
}

/** A Word on/off property: present without a value or with anything but "0" / "false" / "off" means on. */
function toggle(rPr: Element, name: string): boolean | undefined {
  const el = child(rPr, name)
  if (!el) return undefined
  const v = attr(el, 'val')
  return !(v === '0' || v === 'false' || v === 'off')
}

function readRPr(rPr: Element | null, theme?: ThemeFonts): RProps {
  if (!rPr) return {}
  const props: RProps = {}
  const bold = toggle(rPr, 'b') ?? toggle(rPr, 'bCs')
  const italic = toggle(rPr, 'i') ?? toggle(rPr, 'iCs')
  const hidden = toggle(rPr, 'vanish')
  if (bold !== undefined) props.bold = bold
  if (italic !== undefined) props.italic = italic
  if (hidden !== undefined) props.hidden = hidden
  const sz = Number(attr(child(rPr, 'sz'), 'val'))
  const szCs = Number(attr(child(rPr, 'szCs'), 'val'))
  if (sz > 0) props.size = sz / 2 // half-points
  if (szCs > 0) props.sizeCs = szCs / 2
  const fonts = child(rPr, 'rFonts')
  const latinTheme = attr(fonts, 'asciiTheme') ?? attr(fonts, 'hAnsiTheme')
  const latin = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi') ?? (latinTheme === 'majorHAnsi' ? theme?.majorLatin : latinTheme === 'minorHAnsi' ? theme?.minorLatin : undefined)
  const cs = attr(fonts, 'cs')
  const csTheme = attr(fonts, 'csTheme')
  if (latin) props.font = latin
  if (cs) props.fontCs = cs
  else if (csTheme === 'majorBidi') props.fontCs = theme?.majorBidi
  else if (csTheme === 'minorBidi') props.fontCs = theme?.minorBidi
  const color = attr(child(rPr, 'color'), 'val')
  if (color && /^[0-9a-f]{6}$/i.test(color)) props.color = `#${color}`
  return props
}

function readJc(pPr: Element | null): TextAlign | undefined {
  const value = attr(child(pPr, 'jc'), 'val')
  return value === 'right' || value === 'end' ? 'right' : value === 'left' || value === 'start' ? 'left' : value === 'center' ? 'center' : value === 'both' || value === 'distribute' ? 'justify' : undefined
}

const overlay = (a: RProps, b: RProps): RProps => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

function parseXml(bytes: Uint8Array): Document {
  const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new ImportError('קובץ ה-Word פגום.')
  return doc
}

/** Read a Word document: paragraphs, and per-run bold / italic / size / font (styles included). */
export async function placedFromDocx(name: string, buffer: ArrayBuffer): Promise<PlacedText> {
  let documentXml: Uint8Array | null
  let stylesXml: Uint8Array | null
  let themeXml: Uint8Array | null = null
  try {
    documentXml = await unzipEntry(buffer, 'word/document.xml')
  } catch {
    throw new ImportError('לא ניתן לקרוא את הקובץ. ודא שזה קובץ Word בפורמט docx (ולא doc ישן).')
  }
  try { stylesXml = await unzipEntry(buffer, 'word/styles.xml') } catch { stylesXml = null }
  try { themeXml = await unzipEntry(buffer, 'word/theme/theme1.xml') } catch { themeXml = null }
  if (!documentXml) throw new ImportError('זה לא קובץ Word תקין (חסר word/document.xml).')

  const themeFonts: ThemeFonts = {}
  if (themeXml) {
    const theme = parseXml(themeXml)
    const typeface = (scheme: string, part: string) => {
      const parent = Array.from(theme.getElementsByTagName('*')).find((el) => el.localName === scheme)
      return Array.from(parent?.children ?? []).find((el) => el.localName === part)?.getAttribute('typeface') ?? undefined
    }
    themeFonts.majorLatin = typeface('majorFont', 'latin')
    themeFonts.minorLatin = typeface('minorFont', 'latin')
    themeFonts.majorEastAsia = typeface('majorFont', 'ea')
    themeFonts.minorEastAsia = typeface('minorFont', 'ea')
    themeFonts.majorBidi = typeface('majorFont', 'cs')
    themeFonts.minorBidi = typeface('minorFont', 'cs')
  }

  // styles: paragraph / character styles with inheritance, plus the document's defaults
  const styles = new Map<string, { basedOn: string | null; props: RProps; align?: TextAlign; name: string; type: string }>()
  let defaults: RProps = {}
  let defaultParagraphStyle: string | null = null
  if (stylesXml) {
    const sdoc = parseXml(stylesXml)
    defaults = readRPr(child(child(child(sdoc.documentElement, 'docDefaults'), 'rPrDefault'), 'rPr'), themeFonts)
    for (const s of elements(sdoc, 'style')) {
      const id = attr(s, 'styleId')
      if (!id) continue
      styles.set(id, { basedOn: attr(child(s, 'basedOn'), 'val'), props: readRPr(child(s, 'rPr'), themeFonts), align: readJc(child(s, 'pPr')), name: attr(child(s, 'name'), 'val') ?? id, type: attr(s, 'type') ?? '' })
      if (attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1') defaultParagraphStyle = id
    }
  }
  const resolve = (id: string | null, depth = 0): RProps & { align?: TextAlign } => {
    const s = id && depth < 12 ? styles.get(id) : undefined
    return s ? { ...overlay(resolve(s.basedOn, depth + 1), s.props), ...(s.align ? { align: s.align } : {}) } : {}
  }

  const doc = parseXml(documentXml)
  const pieces: { text: string; style: CharStyle }[] = []
  const baseSize = defaults.size ?? 12
  const baseFont = defaults.font ?? DEFAULT_TEXT_STYLE.fontFamily

  const paragraphs = elements(doc, 'p')
  const paragraphStyles: ImportedParagraphStyle[] = Array.from(styles.entries())
    .map(([wordId, style]) => {
      const resolved = resolve(wordId)
      return {
        wordId,
        name: style.name,
        patch: {
          fontFamily: resolved.font ?? resolved.fontCs ?? baseFont,
          fontSize: resolved.size ?? resolved.sizeCs ?? baseSize,
          weight: resolved.bold ? 700 : 400,
          italic: !!resolved.italic,
          ...(resolved.color ? { color: resolved.color } : {}),
          ...(resolved.align ? { align: resolved.align } : {}),
        },
      }
    })
  const paragraphStyleIds: string[] = []
  const paragraphStyleNames: string[] = []
  const inferredStyles = new Map<string, ImportedParagraphStyle>()
  const unresolvedStyles = new Map<string, ImportedParagraphStyle>()
  let firstParagraphAlign: TextAlign | undefined
  paragraphs.forEach((p, pi) => {
    const pStyle = attr(child(child(p, 'pPr'), 'pStyle'), 'val') ?? defaultParagraphStyle
    const paragraphAlign = readJc(child(p, 'pPr')) ?? resolve(pStyle).align
    if (firstParagraphAlign === undefined) firstParagraphAlign = paragraphAlign
    const paragraphProps = overlay(defaults, resolve(pStyle))
    let last: CharStyle = { fontFamily: baseFont, fontSize: baseSize, weight: paragraphProps.bold ? 700 : 400, italic: !!paragraphProps.italic, tracking: 0 }
    let firstRun: CharStyle | null = null
    // a line break inside a paragraph is a paragraph break here, so it needs an entry in the per-paragraph lists too
    let breaks = 0

    for (const r of Array.from(p.getElementsByTagName('*')).filter((el) => el.localName === 'r' && isWordElement(el))) {
      let text = ''
      for (const c of Array.from(r.children)) {
        if (!isWordElement(c)) continue
        if (c.localName === 't') text += c.textContent ?? ''
        else if (c.localName === 'tab') text += '\t'
        else if (c.localName === 'br' || c.localName === 'cr') text += '\n'
        else if (c.localName === 'noBreakHyphen') text += '‑'
      }
      if (!text) continue
      for (const char of text) if (char === '\n') breaks++
      const rPr = child(r, 'rPr')
      const props = overlay(overlay(paragraphProps, resolve(attr(child(rPr, 'rStyle'), 'val'))), readRPr(rPr, themeFonts))
      if (props.hidden) continue
      const rtl = HEBREW_OR_ARABIC.test(text)
      last = {
        fontFamily: (rtl ? props.fontCs : undefined) ?? props.font ?? props.fontCs ?? baseFont,
        fontSize: (rtl ? props.sizeCs : undefined) ?? props.size ?? baseSize,
        ...(props.color ? { color: props.color } : {}),
        weight: props.bold ? 700 : 400,
        italic: !!props.italic,
        tracking: 0,
      }
      if (!firstRun) firstRun = last
      pieces.push({ text, style: last })
    }
    const directFormatting = firstRun && (firstRun.fontSize !== baseSize || firstRun.fontFamily !== baseFont || firstRun.weight >= 600 || firstRun.italic || !!firstRun.color)
    const inferredId = directFormatting && (!pStyle || pStyle === defaultParagraphStyle) ? `inferred-${firstRun!.fontFamily}-${firstRun!.fontSize}-${firstRun!.weight}-${firstRun!.italic}-${firstRun!.color ?? ''}`.replace(/[^a-zA-Z0-9_-]/g, '-') : null
    if (inferredId && firstRun) {
      if (!inferredStyles.has(inferredId)) inferredStyles.set(inferredId, { wordId: inferredId, name: firstRun.weight >= 600 ? 'כותרת בולד' : 'טקסט מעוצב', patch: { fontFamily: firstRun.fontFamily, fontSize: firstRun.fontSize, weight: firstRun.weight, italic: firstRun.italic, ...(firstRun.color ? { color: firstRun.color } : {}), ...(paragraphAlign ? { align: paragraphAlign } : {}) } })
      for (let copy = 0; copy <= breaks; copy++) {
        paragraphStyleIds.push(inferredId)
        paragraphStyleNames.push(inferredStyles.get(inferredId)!.name)
      }
    } else {
      if (pStyle && !styles.has(pStyle) && firstRun && !unresolvedStyles.has(pStyle)) unresolvedStyles.set(pStyle, { wordId: pStyle, name: pStyle, patch: { fontFamily: firstRun.fontFamily, fontSize: firstRun.fontSize, weight: firstRun.weight, italic: firstRun.italic, ...(firstRun.color ? { color: firstRun.color } : {}), ...(paragraphAlign ? { align: paragraphAlign } : {}) } })
      for (let copy = 0; copy <= breaks; copy++) {
        paragraphStyleIds.push(pStyle ?? '')
        paragraphStyleNames.push(paragraphStyles.find((style) => style.wordId === pStyle)?.name ?? pStyle ?? '')
      }
    }
    if (pi < paragraphs.length - 1) pieces.push({ text: '\n', style: last }) // paragraph break
  })

  // Word stores many built-in styles that are not used by this document. Keep only
  // styles assigned to paragraphs, plus their basedOn chain needed for inheritance.
  const usedParagraphStyles = new Set<string>()
  const markBasedOn = (id: string | null) => {
    let current = id
    let depth = 0
    while (current && depth++ < 12 && !usedParagraphStyles.has(current)) {
      usedParagraphStyles.add(current)
      current = styles.get(current)?.basedOn ?? null
    }
  }
  paragraphStyleIds.forEach(markBasedOn)
  const activeParagraphStyles = [...paragraphStyles.filter((style) => usedParagraphStyles.has(style.wordId)), ...Array.from(inferredStyles.values()), ...Array.from(unresolvedStyles.values())]

  const text = pieces.map((p) => p.text).join('').replace(/\n+$/, '')
  if (!text.trim()) throw new ImportError('אין טקסט במסמך ה-Word.')
  const runs = mergeRuns(pieces.map((p) => ({ len: p.text.length, style: p.style })))
  // trim the runs to the trimmed text
  let excess = pieces.reduce((n, p) => n + p.text.length, 0) - text.length
  while (excess > 0 && runs.length) {
    const lastRun = runs[runs.length - 1]
    if (lastRun.len <= excess) {
      excess -= lastRun.len
      runs.pop()
    } else {
      runs[runs.length - 1] = { ...lastRun, len: lastRun.len - excess }
      excess = 0
    }
  }

  const first = runs[0].style
  return { name, text, runs, style: { ...first, align: firstParagraphAlign ?? activeParagraphStyles.find((s) => s.wordId === paragraphStyleIds[0])?.patch.align ?? alignFor(text) }, paragraphStyles: activeParagraphStyles, paragraphStyleIds, paragraphStyleNames }
}

/** Read a file the user picked (or dropped): .docx or plain text. */
export async function readPlacedText(file: File): Promise<PlacedText> {
  if (file.size > MAX_FILE) throw new ImportError('הקובץ גדול מדי (מעל 40MB).')
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.docx')) return placedFromDocx(file.name, await file.arrayBuffer())
  if (lower.endsWith('.doc')) throw new ImportError('קבצי doc ישנים לא נתמכים. פתח את הקובץ ב-Word ושמור אותו כ-docx.')
  if (/\.(txt|text|md|csv)$/.test(lower) || file.type.startsWith('text/')) return placedFromPlainText(file.name, decodeText(await file.arrayBuffer()))
  throw new ImportError('סוג הקובץ לא נתמך. אפשר לייבא קובצי docx וקובצי טקסט (txt).')
}
