import type { CharStyle, ParagraphStyleRecord, TextFrame } from './document'
import { ownerPage, pageRects } from './pages'
import type { ExportContent } from './pdfExport'

/**
 * "Export text": the text of the document (or of the selected text frames) as a plain text, HTML or RTF file. Every story (a text frame
 * and the frames threaded after it) is one piece, in reading order; its paragraphs keep their alignment, headings, fonts, sizes, colours,
 * bold and italic, and its footnotes are listed after it.
 */

export type TextExportFormat = 'txt' | 'html' | 'rtf'
/** the encoding of a TXT file: Unicode in 8 or 16 bits, or the old Hebrew code page (8 bits, one byte per letter) */
export type TextEncoding = 'utf-8' | 'utf-16' | 'windows-1255'

interface Piece {
  text: string
  style: CharStyle
  /** the number of a footnote whose mark stands here (text is empty) */
  note?: number
}

interface ParagraphOut {
  pieces: Piece[]
  align: 'right' | 'left' | 'center' | 'justify'
  /** 1…6 for a heading style */
  heading?: number
}

interface StoryOut {
  base: CharStyle
  paragraphs: ParagraphOut[]
  notes: { number: number; paragraphs: ParagraphOut[] }[]
}

export interface TextExportResult {
  content: string
  /** how many stories (separate texts) are in the file */
  stories: number
  mime: string
  extension: string
}

const RTL_LETTERS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const ARABIC_LETTERS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/** what is not text: the markers some features write into a story */
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b-\u001f\u200b\ufeff\ufffc]/g, '').replace(/\u2028/g, '\n')

const baseOf = (frame: TextFrame): CharStyle => ({ fontFamily: frame.fontFamily, fontSize: frame.fontSize, weight: frame.weight, italic: frame.italic, tracking: frame.tracking, color: frame.color })

function headingLevel(name: string | undefined): number | undefined {
  if (!name) return undefined
  const numbered = /(?:heading|header|title|כותרת|h)\s*([1-6])/i.exec(name)
  if (numbered) return Number(numbered[1])
  return /^(?:heading|title|כותרת)/i.test(name.trim()) ? 1 : undefined
}

const alignOf = (value: string | undefined): ParagraphOut['align'] => (value === 'center' || value === 'left' || value === 'justify' || value === 'right' ? value : value === 'justifyCenter' ? 'justify' : 'right')

/** the pieces of text[from, to) with the style each has; a footnote mark is put where its anchor is */
function piecesOf(text: string, runs: { len: number; style: CharStyle }[], base: CharStyle, from: number, to: number, anchors: { at: number; number: number }[]): Piece[] {
  const styleAt = (position: number): CharStyle => {
    let offset = 0
    for (const run of runs) {
      offset += run.len
      if (position < offset) return run.style
    }
    return base
  }
  const pieces: Piece[] = []
  let current = ''
  let currentStyle: CharStyle | null = null
  const flush = () => {
    const part = clean(current)
    if (part && currentStyle) pieces.push({ text: part, style: currentStyle })
    current = ''
  }
  for (let position = from; position <= to; position++) {
    for (const anchor of anchors) {
      if (anchor.at !== position) continue
      flush()
      pieces.push({ text: '', style: currentStyle ?? styleAt(Math.min(position, text.length - 1)), note: anchor.number })
    }
    if (position === to) break
    const style = styleAt(position)
    if (style !== currentStyle) {
      flush()
      currentStyle = style
    }
    current += text[position]
  }
  flush()
  return pieces
}

/** The stories to export, in reading order: the head frame of each thread (with the frames that follow it) among the frames asked for. */
export function textStories(content: ExportContent, selectedIds: string[] = []): StoryOut[] {
  const frames = content.frames.filter((frame) => !frame.hidden)
  const byId = new Map(content.frames.map((frame) => [frame.id, frame]))
  const previous = new Map<string, string>()
  for (const frame of content.frames) if (frame.next) previous.set(frame.next, frame.id)
  const headOf = (frame: TextFrame): TextFrame => {
    let current = frame
    const seen = new Set<string>()
    for (let before = previous.get(current.id); before && !seen.has(before); before = previous.get(current.id)) {
      seen.add(before)
      const found = byId.get(before)
      if (!found) break
      current = found
    }
    return current
  }
  const wanted = new Set<string>()
  if (selectedIds.length > 0) {
    for (const frame of frames) if (selectedIds.includes(frame.id)) wanted.add(headOf(frame).id)
  } else {
    for (const frame of frames) wanted.add(headOf(frame).id)
  }
  const rects = pageRects(content.doc)
  const heads = [...wanted]
    .map((id) => byId.get(id))
    .filter((frame): frame is TextFrame => !!frame && !frame.hidden && clean(frame.text).trim().length > 0)
    .sort((a, b) => {
      const pa = ownerPage(rects, a.x + a.w / 2, a.y + a.h / 2)
      const pb = ownerPage(rects, b.x + b.w / 2, b.y + b.h / 2)
      return pa - pb || a.y - b.y || b.x - a.x
    })
  const styleById = new Map<string, ParagraphStyleRecord>(content.paragraphStyles.map((style) => [style.id, style]))
  return heads.map((frame) => storyOf(frame, styleById))
}

function storyOf(frame: TextFrame, styleById: Map<string, ParagraphStyleRecord>): StoryOut {
  const base = baseOf(frame)
  const text = frame.text
  const frameStyle = frame.paragraphStyleId ? styleById.get(frame.paragraphStyleId) : undefined
  const footnotes = (frame.footnotes ?? []).map((note, index) => ({ note, number: index + 1 })).sort((a, b) => a.note.anchor - b.note.anchor)
  const anchors = footnotes.map(({ note, number }) => ({ at: note.anchor, number }))
  const paragraphs: ParagraphOut[] = []
  let start = 0
  let index = 0
  for (const line of text.split('\n')) {
    const end = start + line.length
    const record = frame.paragraphStyleIds?.[index] ? styleById.get(frame.paragraphStyleIds[index]) : frameStyle
    const name = frame.paragraphStyleNames?.[index] ?? record?.name
    const patch = frame.paragraphStylePatches?.[index]
    const marker = patch?.listKind ?? record?.patch.listKind
    const pieces = piecesOf(text, frame.runs, base, start, end, anchors)
    if (marker && pieces.length > 0) pieces.unshift({ text: marker === 'bullet' ? '• ' : `${index + 1}. `, style: pieces[0].style })
    paragraphs.push({ pieces, align: alignOf(patch?.align ?? record?.patch.align ?? frame.align), heading: headingLevel(name) })
    start = end + 1
    index++
  }
  const notes = footnotes.map(({ note, number }) => {
    const noteBase: CharStyle = { ...base, ...(note.style ? baseOf({ ...frame, ...note.style } as TextFrame) : {}) }
    const lines = clean(note.content).split('\n')
    let at = 0
    const noteParagraphs = lines.map((line) => {
      const pieces = note.runs ? piecesOf(note.content, note.runs, noteBase, at, at + line.length, []) : line ? [{ text: line, style: noteBase }] : []
      at += line.length + 1
      return { pieces, align: 'right' as const }
    })
    return { number, paragraphs: noteParagraphs }
  })
  return { base, paragraphs, notes }
}

// ── plain text ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const plain = (paragraph: ParagraphOut) => paragraph.pieces.map((piece) => (piece.note ? `[${piece.note}]` : piece.text)).join('')

export function storiesToText(stories: StoryOut[]): string {
  return stories
    .map((story) => {
      // a right-to-left mark in front of a Hebrew paragraph tells editors that read plain text which way it runs
      const lines = story.paragraphs.map((paragraph) => {
        const line = plain(paragraph)
        return RTL_LETTERS.test(line) ? `\u200f${line}` : line
      })
      if (story.notes.length > 0) {
        lines.push('', ...story.notes.map((note) => `[${note.number}] ${note.paragraphs.map(plain).join(' ')}`))
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

// ── HTML ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')
const cssFont = (family: string) => `'${family.replace(/['"\\;{}<>]/g, '')}'`
const safeColor = (color: string | undefined) => (color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined)

function htmlPiece(piece: Piece, base: CharStyle): string {
  if (piece.note) return `<sup><a href="#fn${piece.note}" id="fnref${piece.note}">${piece.note}</a></sup>`
  const { style } = piece
  const css: string[] = []
  if (style.fontFamily && style.fontFamily !== base.fontFamily) css.push(`font-family:${cssFont(style.fontFamily)}`)
  if (style.fontSize && style.fontSize !== base.fontSize) css.push(`font-size:${style.fontSize}pt`)
  const color = safeColor(style.color)
  if (color && color !== safeColor(base.color)) css.push(`color:${color}`)
  let html = escapeHtml(piece.text)
  if (css.length > 0) html = `<span style="${css.join(';')}">${html}</span>`
  if ((style.weight >= 600) !== (base.weight >= 600)) html = style.weight >= 600 ? `<b>${html}</b>` : html
  if (style.italic && !base.italic) html = `<i>${html}</i>`
  return html
}

export function storiesToHtml(stories: StoryOut[], title: string): string {
  const rtl = stories.some((story) => story.paragraphs.some((paragraph) => RTL_LETTERS.test(plain(paragraph))))
  const body = stories
    .map((story) => {
      const render = (paragraph: ParagraphOut) => {
        const inner = paragraph.pieces.map((piece) => htmlPiece(piece, story.base)).join('')
        const tag = paragraph.heading ? `h${paragraph.heading}` : 'p'
        return `<${tag} style="text-align:${paragraph.align}">${inner || '<br>'}</${tag}>`
      }
      const baseCss = [`font-family:${cssFont(story.base.fontFamily)}`, `font-size:${story.base.fontSize}pt`, story.base.weight >= 600 ? 'font-weight:bold' : '', story.base.italic ? 'font-style:italic' : '', safeColor(story.base.color) ? `color:${safeColor(story.base.color)}` : '']
        .filter(Boolean)
        .join(';')
      const notes =
        story.notes.length > 0
          ? `<ol class="notes">${story.notes.map((note) => `<li id="fn${note.number}" value="${note.number}">${note.paragraphs.map((paragraph) => paragraph.pieces.map((piece) => htmlPiece(piece, story.base)).join('')).join('<br>')} <a href="#fnref${note.number}">↩</a></li>`).join('')}</ol>`
          : ''
      return `<section style="${baseCss}">\n${story.paragraphs.map(render).join('\n')}\n${notes}</section>`
    })
    .join('\n')
  return `<!DOCTYPE html>\n<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(title)}</title>\n<style>body{max-width:46em;margin:2em auto;padding:0 1em;line-height:1.5}section{margin-bottom:2em}.notes{font-size:.85em}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

// ── RTF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function rtfText(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`
    else if (char === '\t') out += '\\tab '
    else if (char === '\n') out += '\\line '
    else if (code < 128) out += char
    else if (code > 0xffff) {
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      out += `\\u${high - 65536}?\\u${low - 65536}?`
    } else out += `\\u${code > 32767 ? code - 65536 : code}?`
  }
  return out
}

export function storiesToRtf(stories: StoryOut[]): string {
  const fonts: string[] = []
  const colors: string[] = []
  const fontIndex = (family: string) => {
    let index = fonts.indexOf(family)
    if (index < 0) index = fonts.push(family) - 1
    return index
  }
  const colorIndex = (color: string | undefined) => {
    const hex = safeColor(color)
    if (!hex || (hex.length !== 7 && hex.length !== 4)) return 0
    const key = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
    let index = colors.indexOf(key)
    if (index < 0) index = colors.push(key) - 1
    return index + 1
  }
  const arabicFonts = new Set<number>()
  const run = (piece: Piece, size: number | undefined, base: CharStyle): string => {
    if (piece.note) return `{\\super ${piece.note}}`
    const style = piece.style
    const font = fontIndex(style.fontFamily || base.fontFamily)
    const half = Math.max(2, Math.round((style.fontSize || size || 12) * 2))
    const bold = style.weight >= 600 ? '\\b' : '\\b0'
    const italic = style.italic ? '\\i' : '\\i0'
    const ab = style.weight >= 600 ? '\\ab' : '\\ab0'
    const ai = style.italic ? '\\ai' : '\\ai0'
    const arabic = ARABIC_LETTERS.test(piece.text)
    if (arabic) arabicFonts.add(font)
    const language = arabic ? '\\alang1025' : '\\alang1037'
    return `{\\rtlch\\fcs1\\af${font}${language}\\afs${half}${ab}${ai}\\ltrch\\fcs0\\f${font}\\fs${half}${bold}${italic}\\cf${colorIndex(style.color)} ${rtfText(piece.text)}}`
  }
  const alignWord = { right: '\\qr', left: '\\ql', center: '\\qc', justify: '\\qj' } as const
  const paragraph = (item: ParagraphOut, base: CharStyle, rtl: boolean) => {
    const bold = item.heading ? '\\b' : ''
    const body = item.pieces.map((piece) => run(piece, undefined, base)).join('')
    return `{\\pard\\plain${rtl ? '\\rtlpar' : '\\ltrpar'}${alignWord[item.align]}${item.heading ? '\\sb240\\sa120' : '\\sa120'}${bold} ${body}\\par}`
  }
  const bodies = stories.map((story) => {
    const rtl = story.paragraphs.some((item) => RTL_LETTERS.test(plain(item)))
    const lines = story.paragraphs.map((item) => paragraph(item, story.base, rtl))
    for (const note of story.notes) {
      for (const [at, item] of note.paragraphs.entries()) {
        const mark: Piece[] = at === 0 ? [{ text: '', style: story.base, note: note.number }, { text: ' ', style: story.base }] : []
        lines.push(paragraph({ ...item, pieces: [...mark, ...item.pieces] }, story.base, rtl))
      }
    }
    return lines.join('\n')
  })
  // the tables are filled while the bodies are written, so the header is put together last
  const fontTable = fonts.map((family, index) => `{\\f${index}\\fnil\\fcharset${arabicFonts.has(index) ? 178 : 177} ${rtfText(family.replace(/;/g, ''))};}`).join('')
  const colorTable = colors.map((hex) => `\\red${parseInt(hex.slice(1, 3), 16)}\\green${parseInt(hex.slice(3, 5), 16)}\\blue${parseInt(hex.slice(5, 7), 16)};`).join('')
  return `{\\rtf1\\ansi\\ansicpg1255\\deff0\\deflang1037\\adeflang1025\n{\\fonttbl${fontTable || '{\\f0\\fnil Arial;}'}}\n{\\colortbl;${colorTable}}\n${bodies.join('\n\\page\n')}\n}`
}

export function exportText(content: ExportContent, format: TextExportFormat, options: { ids?: string[]; title?: string } = {}): TextExportResult {
  const stories = textStories(content, options.ids)
  if (format === 'html') return { content: storiesToHtml(stories, options.title ?? ''), stories: stories.length, mime: 'text/html', extension: 'html' }
  if (format === 'rtf') return { content: storiesToRtf(stories), stories: stories.length, mime: 'application/rtf', extension: 'rtf' }
  return { content: storiesToText(stories), stories: stories.length, mime: 'text/plain', extension: 'txt' }
}

/** the code-page byte of every character the Windows Hebrew code page has (128…255 differ from Unicode) */
let hebrewPage: Map<string, number> | null = null
function hebrewByte(char: string): number {
  if (!hebrewPage) {
    hebrewPage = new Map()
    const decoder = new TextDecoder('windows-1255')
    for (let byte = 0x80; byte < 0x100; byte++) hebrewPage.set(decoder.decode(new Uint8Array([byte])), byte)
  }
  const code = char.charCodeAt(0)
  return code < 0x80 ? code : (hebrewPage.get(char) ?? 0x3f)
}

/** The bytes of a text file: UTF-8 and UTF-16 start with a byte order mark so that editors know the encoding; characters the old Hebrew code page lacks become "?". */
export function encodeText(text: string, encoding: TextEncoding, mark = true): Uint8Array {
  if (encoding === 'utf-16') {
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes[0] = 0xff
    bytes[1] = 0xfe
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i)
      bytes[2 + i * 2] = unit & 0xff
      bytes[3 + i * 2] = unit >> 8
    }
    return bytes
  }
  if (encoding === 'windows-1255') return Uint8Array.from(Array.from(text, hebrewByte))
  const body = new TextEncoder().encode(text)
  if (!mark) return body
  return Uint8Array.from([0xef, 0xbb, 0xbf, ...body])
}
const FILTER_NAMES: Record<TextExportFormat, string> = { txt: 'טקסט', html: 'HTML', rtf: 'RTF' }

/** Gives the finished file to the user: the save dialog of the desktop app, or a download in the browser. */
export async function deliverText(result: TextExportResult, format: TextExportFormat, fileBaseName: string, encoding: TextEncoding = 'utf-8'): Promise<boolean> {
  // a text file on Windows ends its lines with CR+LF; older editors show a bare LF file as one long line
  const bytes = format === 'txt' ? encodeText(result.content.replace(/\n/g, '\r\n'), encoding) : encodeText(result.content, 'utf-8', format === 'html')
  const { isTauri } = await import('./fileio')
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: `${fileBaseName}.${result.extension}`, filters: [{ name: FILTER_NAMES[format], extensions: [result.extension] }] })
    if (!path) return false
    await writeFile(path, bytes)
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: `${result.mime};charset=${format === 'txt' ? encoding : 'utf-8'}` }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileBaseName}.${result.extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
