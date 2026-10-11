import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { DEFAULT_TEXT_STYLE, type Run } from './document'
import { alignFor, ImportError, type ImportedParagraphStyle, type PlacedText } from './importText'
import { mergeRuns } from './story'

/*
 * XML import: the text of an XML file as a story to place. An element that holds text becomes a paragraph, and its tag
 * names the paragraph style: a style of the document with the same name is used, and a tag without one gets a new style.
 * <b> <strong> and <i> <em> <cite> inside a paragraph give bold and italic runs, <br/> starts a new paragraph.
 * Attributes are ignored. Entities are decoded here, in one pass, and never by the parser: no entity a file declares is expanded.
 */

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: false, parseTagValue: false, processEntities: false })

const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY, (_, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body] ?? ''
    const code = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

type Element = { name: string; kids: XNode[] }
type XNode = { text: string } | Element

const isElement = (node: XNode): node is Element => 'name' in node

/** the parser's ordered output as a tree of elements and text, in document order (the text of an element sits between its children) */
function toNodes(list: unknown): XNode[] {
  const out: XNode[] = []
  if (!Array.isArray(list)) return out
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if ('#text' in record) {
      out.push({ text: decodeEntities(String(record['#text'])) })
      continue
    }
    const key = Object.keys(record)[0]
    if (!key || key.startsWith('?') || key.startsWith('!')) continue
    out.push({ name: key.includes(':') ? key.slice(key.indexOf(':') + 1) : key, kids: toNodes(record[key]) })
  }
  return out
}

interface Piece {
  text: string
  bold: boolean
  italic: boolean
}
interface Paragraph {
  tag: string
  pieces: Piece[]
}

const BOLD = new Set(['b', 'strong'])
const ITALIC = new Set(['i', 'em', 'cite'])
/** tags that mark the inside of a paragraph: an element that holds only these (and text) is one paragraph */
const INLINE = new Set([...BOLD, ...ITALIC, 'u', 'span', 'a', 'br', 'sub', 'sup'])

const hasOwnText = (kids: XNode[]) => kids.some((kid) => !isElement(kid) && kid.text.trim() !== '')
const isParagraph = (element: Element) =>
  element.kids.length === 0 || hasOwnText(element.kids) || element.kids.some((kid) => isElement(kid) && INLINE.has(kid.name.toLowerCase()))

/** the text of one paragraph element, with everything inside it (inline tags give runs, <br/> ends the paragraph) */
function flatten(element: Element, out: Paragraph[]): void {
  let current: Paragraph = { tag: element.name, pieces: [] }
  const finish = () => {
    if (current.pieces.length > 0) out.push(current)
    current = { tag: element.name, pieces: [] }
  }
  const walk = (nodes: XNode[], bold: boolean, italic: boolean) => {
    for (const node of nodes) {
      if (!isElement(node)) {
        current.pieces.push({ text: node.text, bold, italic })
        continue
      }
      const name = node.name.toLowerCase()
      if (name === 'br') finish()
      else walk(node.kids, bold || BOLD.has(name), italic || ITALIC.has(name))
    }
  }
  walk(element.kids, false, false)
  finish()
}

function collect(nodes: XNode[], out: Paragraph[]): void {
  for (const node of nodes) {
    if (!isElement(node)) continue
    if (isParagraph(node)) flatten(node, out)
    else collect(node.kids, out)
  }
}

/** XML white space (the indentation of the file, line ends) becomes single spaces; none at the start and end of a paragraph */
function normalized(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  let afterSpace = true
  for (const piece of pieces) {
    let text = piece.text.replace(/[ \t\r\n\f]+/g, ' ')
    if (afterSpace && text.startsWith(' ')) text = text.slice(1)
    if (!text) continue
    afterSpace = text.endsWith(' ')
    out.push({ ...piece, text })
  }
  const last = out[out.length - 1]
  if (last?.text.endsWith(' ')) {
    last.text = last.text.slice(0, -1)
    if (!last.text) out.pop()
  }
  return out
}

export function placedFromXml(name: string, raw: string): PlacedText {
  const source = raw.replace(/^﻿/, '')
  if (/<!ENTITY/i.test(source)) throw new ImportError('קובץ XML שמגדיר ישויות (ENTITY) אינו נתמך.')
  const valid = XMLValidator.validate(source)
  if (valid !== true) throw new ImportError(`קובץ ה-XML אינו תקין (שורה ${valid.err.line}).`)
  const found: Paragraph[] = []
  collect(toNodes(parser.parse(source)), found)
  const lines = found.map((paragraph) => ({ tag: paragraph.tag, pieces: normalized(paragraph.pieces) })).filter((line) => line.pieces.length > 0)
  if (lines.length === 0) throw new ImportError('לא נמצא טקסט בקובץ ה-XML.')

  const text = lines.map((line) => line.pieces.map((piece) => piece.text).join('')).join('\n')
  const style = { ...DEFAULT_TEXT_STYLE, align: alignFor(text) }
  const base = { fontFamily: style.fontFamily, fontSize: style.fontSize, weight: style.weight, italic: style.italic, tracking: style.tracking }
  const runs: Run[] = []
  lines.forEach((line, index) => {
    for (const piece of line.pieces) {
      runs.push({ len: piece.text.length, style: { ...base, ...(piece.bold ? { weight: 700 } : {}), ...(piece.italic ? { italic: true } : {}) } })
    }
    if (index < lines.length - 1) runs.push({ len: 1, style: base })
  })
  const tags = [...new Set(lines.map((line) => line.tag))]
  const paragraphStyles: ImportedParagraphStyle[] = tags.map((tag) => ({ wordId: `xml:${tag}`, name: tag, patch: {} }))
  return {
    name,
    text,
    runs: mergeRuns(runs),
    style,
    paragraphStyles,
    paragraphStyleIds: lines.map((line) => `xml:${line.tag}`),
    paragraphStyleNames: lines.map((line) => line.tag),
  }
}
