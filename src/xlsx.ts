import { XMLParser } from 'fast-xml-parser'
import { unzipEntries } from './zip'

/** The first sheet of an Excel (XLSX) file as rows of text, for the data merge. Formulas give the value they last had; cells with a date format give the date as readable text. */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseTagValue: false, trimValues: false })

const list = <T,>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

/** The text of a node of the file: a plain string, or an element with its text, or a rich text made of pieces. */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const element = node as Record<string, unknown>
  if ('#text' in element) return String(element['#text'])
  if ('t' in element || 'r' in element) return `${textOf(element.t)}${list(element.r as unknown[]).map((piece) => textOf((piece as Record<string, unknown>).t)).join('')}`
  return ''
}

/** The index (from 0) of the column a cell reference such as "C5" is in. */
export function columnOf(reference: string): number {
  const letters = /^[A-Za-z]+/.exec(reference)?.[0].toUpperCase() ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** The rows of a sheet from the XML of the sheet and of the shared strings (null when the file has none). The styles tell which numbers are dates, and the workbook which calendar they count from. */
export function rowsFromXlsxXml(sheetXml: string, sharedStringsXml: string | null, extra: { stylesXml?: string | null; workbookXml?: string | null } = {}): string[][] {
  const shared = sharedStringsXml ? list<unknown>(parser.parse(sharedStringsXml)?.sst?.si).map(textOf) : []
  const dateStyles = extra.stylesXml ? dateStyleIndexes(extra.stylesXml) : new Set<number>()
  const date1904 = ['1', 'true'].includes(String(extra.workbookXml ? parser.parse(extra.workbookXml)?.workbook?.workbookPr?.['@_date1904'] ?? '' : '').toLowerCase())
  const sheet = parser.parse(sheetXml)?.worksheet?.sheetData
  const rows: string[][] = []
  for (const row of list<Record<string, unknown>>(sheet?.row)) {
    const cells: string[] = []
    let next = 0
    for (const cell of list<Record<string, unknown>>(row.c as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const reference = String(cell['@_r'] ?? '')
      const column = reference ? columnOf(reference) : next
      const type = String(cell['@_t'] ?? '')
      let value = ''
      if (type === 's') value = shared[Number(textOf(cell.v))] ?? ''
      else if (type === 'inlineStr') value = textOf(cell.is)
      else if (type === 'b') value = textOf(cell.v) === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'e') value = ''
      else {
        value = textOf(cell.v)
        const serial = Number(value)
        if (value !== '' && Number.isFinite(serial) && dateStyles.has(Number(cell['@_s']))) value = formatExcelDate(serial, date1904)
      }
      while (cells.length < column) cells.push('')
      cells[column] = value
      next = column + 1
    }
    rows.push(cells)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

/** Is a number format a date or a time: it has day, month, year, hour or second letters outside the quoted texts, brackets and escaped characters. */
export function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\*./g, '')
  return /[dmyhs]/i.test(bare)
}

/** The indexes of the cell formats (the `s` of a cell) that show a date. */
function dateStyleIndexes(stylesXml: string): Set<number> {
  const sheet = parser.parse(stylesXml)?.styleSheet
  const custom = new Map<number, string>(list<Record<string, unknown>>(sheet?.numFmts?.numFmt).map((format) => [Number(format['@_numFmtId']), String(format['@_formatCode'] ?? '')]))
  const found = new Set<number>()
  list<Record<string, unknown>>(sheet?.cellXfs?.xf).forEach((format, index) => {
    const id = Number(format['@_numFmtId'] ?? 0)
    if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) found.add(index)
  })
  return found
}

const two = (value: number) => String(value).padStart(2, '0')

/**
 * The date that Excel's serial number stands for, as text: DD/MM/YYYY, with the time (HH:MM) when it has one, and only the time for
 * a number under one. Excel counts days from 1900 (wrongly counting a 29th of February in it) or, in some files, from 1904.
 */
export function formatExcelDate(serial: number, date1904 = false): string {
  const minutes = Math.round(serial * 1440)
  const days = Math.floor(minutes / 1440)
  const inDay = minutes - days * 1440
  const time = `${two(Math.floor(inDay / 60))}:${two(inDay % 60)}`
  if (days <= 0 && !date1904) return time
  const origin = date1904 ? Date.UTC(1904, 0, 1) : days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  const date = new Date(origin + days * 86400000)
  const text = `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
  return inDay === 0 ? text : `${text} ${time}`
}

/** The rows of the first sheet of an XLSX file. */
export async function rowsFromXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = await unzipEntries(buffer, (name) => name === 'xl/sharedStrings.xml' || name === 'xl/styles.xml' || name === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  const sheets = [...entries.keys()].filter((name) => name.startsWith('xl/worksheets/')).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
  if (sheets.length === 0) throw new Error('This is not an Excel file (no sheet in it).')
  const decoder = new TextDecoder('utf-8')
  const read = (name: string) => {
    const bytes = entries.get(name)
    return bytes ? decoder.decode(bytes) : null
  }
  return rowsFromXlsxXml(read(sheets[0])!, read('xl/sharedStrings.xml'), { stylesXml: read('xl/styles.xml'), workbookXml: read('xl/workbook.xml') })
}
