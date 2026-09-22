import { DEFAULT_TEXT_STYLE, type CharStyle, type Run, type TextStyle } from './document'
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
  /** semi-automatic flow: the last frame of the thread being filled; the next frame is linked after it */
  continueFrom?: string
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

interface RProps {
  bold?: boolean
  italic?: boolean
  hidden?: boolean
  /** points */
  size?: number
  sizeCs?: number
  font?: string
  fontCs?: string
}

const attr = (el: Element | null | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute('w:' + name) ?? null

function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null
  for (const c of Array.from(el.children)) if (c.localName === name && c.namespaceURI === W) return c
  return null
}

/** A Word on/off property: present without a value or with anything but "0" / "false" / "off" means on. */
function toggle(rPr: Element, name: string): boolean | undefined {
  const el = child(rPr, name)
  if (!el) return undefined
  const v = attr(el, 'val')
  return !(v === '0' || v === 'false' || v === 'off')
}

function readRPr(rPr: Element | null): RProps {
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
  const latin = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi')
  const cs = attr(fonts, 'cs')
  if (latin) props.font = latin
  if (cs) props.fontCs = cs
  return props
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
  try {
    documentXml = await unzipEntry(buffer, 'word/document.xml')
    stylesXml = await unzipEntry(buffer, 'word/styles.xml')
  } catch {
    throw new ImportError('לא ניתן לקרוא את הקובץ. ודא שזה קובץ Word בפורמט docx (ולא doc ישן).')
  }
  if (!documentXml) throw new ImportError('זה לא קובץ Word תקין (חסר word/document.xml).')

  // styles: paragraph / character styles with inheritance, plus the document's defaults
  const styles = new Map<string, { basedOn: string | null; props: RProps }>()
  let defaults: RProps = {}
  let defaultParagraphStyle: string | null = null
  if (stylesXml) {
    const sdoc = parseXml(stylesXml)
    defaults = readRPr(child(child(child(sdoc.documentElement, 'docDefaults'), 'rPrDefault'), 'rPr'))
    for (const s of Array.from(sdoc.getElementsByTagNameNS(W, 'style'))) {
      const id = attr(s, 'styleId')
      if (!id) continue
      styles.set(id, { basedOn: attr(child(s, 'basedOn'), 'val'), props: readRPr(child(s, 'rPr')) })
      if (attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1') defaultParagraphStyle = id
    }
  }
  const resolve = (id: string | null, depth = 0): RProps => {
    const s = id && depth < 12 ? styles.get(id) : undefined
    return s ? overlay(resolve(s.basedOn, depth + 1), s.props) : {}
  }

  const doc = parseXml(documentXml)
  const pieces: { text: string; style: CharStyle }[] = []
  const baseSize = defaults.size ?? 12
  const baseFont = defaults.font ?? DEFAULT_TEXT_STYLE.fontFamily

  const paragraphs = Array.from(doc.getElementsByTagNameNS(W, 'p'))
  paragraphs.forEach((p, pi) => {
    const pStyle = attr(child(child(p, 'pPr'), 'pStyle'), 'val') ?? defaultParagraphStyle
    const paragraphProps = overlay(defaults, resolve(pStyle))
    let last: CharStyle = { fontFamily: baseFont, fontSize: baseSize, weight: paragraphProps.bold ? 700 : 400, italic: !!paragraphProps.italic, tracking: 0 }

    for (const r of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
      let text = ''
      for (const c of Array.from(r.children)) {
        if (c.namespaceURI !== W) continue
        if (c.localName === 't') text += c.textContent ?? ''
        else if (c.localName === 'tab') text += '\t'
        else if (c.localName === 'br' || c.localName === 'cr') text += '\n'
        else if (c.localName === 'noBreakHyphen') text += '‑'
      }
      if (!text) continue
      const rPr = child(r, 'rPr')
      const props = overlay(overlay(paragraphProps, resolve(attr(child(rPr, 'rStyle'), 'val'))), readRPr(rPr))
      if (props.hidden) continue
      const rtl = HEBREW_OR_ARABIC.test(text)
      last = {
        fontFamily: (rtl ? props.fontCs : undefined) ?? props.font ?? props.fontCs ?? baseFont,
        fontSize: (rtl ? props.sizeCs : undefined) ?? props.size ?? baseSize,
        weight: props.bold ? 700 : 400,
        italic: !!props.italic,
        tracking: 0,
      }
      pieces.push({ text, style: last })
    }
    if (pi < paragraphs.length - 1) pieces.push({ text: '\n', style: last }) // paragraph break
  })

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
  return { name, text, runs, style: { ...first, align: alignFor(text) } }
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
