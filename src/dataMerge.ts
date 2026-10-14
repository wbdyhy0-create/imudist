import type { Assets, DocSettings, ImageFrame, ShapeFrame, TextFrame } from './document'
import { replaceInStory } from './findReplace'
import { normalizeRuns } from './story'
import { ownerPage, pageRects } from './pages'
import type { ExportContent } from './pdfExport'

/**
 * Data merge: one designed card (a business card, a certificate, a name tag) and a table of records become a document with
 * a card for every record, laid out on sheets (imposition) with crop marks round each card. The card is the first page of the
 * document; where its text frames hold a `{{field}}` mark the value of the record goes.
 */

export type FieldType = 'text' | 'image'

export interface MergeField {
  name: string
  type: FieldType
  /** the first value that is not empty, for the list of fields */
  sample: string
}

export type MergeRecord = Record<string, string>

export interface MergeData {
  fields: MergeField[]
  records: MergeRecord[]
}

// ── reading the table ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The text of a CSV file from its bytes: UTF-8 (with or without the mark at the start), or the Hebrew 8-bit code that Excel writes. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1255').decode(bytes)
  }
}

/** The delimiter of a CSV text: the one of , ; and tab that is used most on its first line (outside the quotes). */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const character of text) {
    if (character === '"') quoted = !quoted
    else if (!quoted && character === '\n') break
    else if (!quoted && character in counts) counts[character]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ','
}

/** CSV text as rows of cells: quoted cells may hold the delimiter, quotes (doubled) and line breaks. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(source)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index++
        } else quoted = false
      } else cell += character
    } else if (character === '"' && cell === '') quoted = true
    else if (character === delimiter) endCell()
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index++
      endRow()
    } else cell += character
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

const IMAGE_VALUE = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i

/** Does the value name a picture: a file name or a link that ends with a picture extension. */
export const isImageValue = (value: string): boolean => IMAGE_VALUE.test(value.trim())

/**
 * The table as records: the first row names the fields, every other row is a record. A field is a picture field when most of its
 * values (the ones that are not empty) name a picture; every other field is text.
 */
export function recordsFromRows(rows: string[][]): MergeData {
  if (rows.length === 0) return { fields: [], records: [] }
  const used = new Set<string>()
  const names = rows[0].map((header, index) => {
    const base = header.trim() || `column${index + 1}`
    let name = base
    for (let copy = 2; used.has(name); copy++) name = `${base}_${copy}`
    used.add(name)
    return name
  })
  const records = rows.slice(1).map((cells) => Object.fromEntries(names.map((name, index) => [name, (cells[index] ?? '').trim()])) as MergeRecord)
  const fields = names.map((name): MergeField => {
    const values = records.map((record) => record[name]).filter((value) => value !== '')
    const images = values.filter(isImageValue).length
    return { name, type: values.length > 0 && images * 2 > values.length ? 'image' : 'text', sample: values[0] ?? '' }
  })
  return { fields, records }
}

// ── direction of the text ───────────────────────────────────────────────────────────────────────────────────────────────────

const RIGHT_TO_LEFT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * The direction a text reads in, from its first letter or digit: Hebrew and Arabic read from the right, any other letter and the
 * digits from the left. Null when it has none (only spaces and marks).
 */
export function detectDirection(text: string): 'rtl' | 'ltr' | null {
  for (const character of text) {
    if (RIGHT_TO_LEFT.test(character)) return 'rtl'
    if (/[\p{L}\p{N}]/u.test(character)) return 'ltr'
  }
  return null
}

// ── the marks in the card ───────────────────────────────────────────────────────────────────────────────────────────────────

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g

/** The names of the fields a text asks for with {{name}}. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1])
}

/** The value of a field of a record: the exact name, else the name in any letter case; undefined when the record has no such field. */
function valueOf(record: MergeRecord, name: string): string | undefined {
  if (name in record) return record[name]
  const lower = name.toLowerCase()
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === lower)
  return key === undefined ? undefined : record[key]
}

const isBlank = (text: string): boolean => text.replace(/[\p{White_Space}\p{Cf}\u00AD]/gu, '') === ''

export interface MergedText {
  /** the frame with the values in it; null when nothing is left of it (every line was blank) */
  frame: TextFrame | null
  /** the frame holds nothing but one mark of a picture field: the name of the field */
  picture: string | null
  /** the marks that name no field of the data */
  unknown: string[]
}

/**
 * A text frame of the card for one record. Every {{field}} gets the value; a paragraph that asked for fields and got only blanks
 * is dropped, so the lines under it move up. The direction of such a paragraph follows its own first letter, and a paragraph
 * aligned to a side goes to the side it starts on (the alignment of the centred and the justified ones is kept).
 */
export function mergeTextFrame(frame: TextFrame, record: MergeRecord, types: ReadonlyMap<string, FieldType>): MergedText {
  const unknown: string[] = []
  const names = tokensIn(frame.text)
  if (names.length === 0) return { frame, picture: null, unknown }
  const only = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(frame.text)
  if (only && (types.get(only[1]) ?? types.get(only[1].toLowerCase())) === 'image') return { frame: null, picture: only[1], unknown }

  type Paragraph = { start: number; end: number; tokens: { start: number; end: number; name: string }[] }
  const paragraphs: Paragraph[] = []
  let start = 0
  for (const line of frame.text.split('\n')) {
    paragraphs.push({ start, end: start + line.length, tokens: [] })
    start += line.length + 1
  }
  for (const match of frame.text.matchAll(TOKEN)) {
    const at = match.index ?? 0
    const paragraph = paragraphs.find((candidate) => at >= candidate.start && at <= candidate.end)
    paragraph?.tokens.push({ start: at, end: at + match[0].length, name: match[1] })
  }

  const matches: { start: number; end: number; replacement: string }[] = []
  const dropped: number[] = []
  const merged = new Map<number, string>()
  // the characters of the dropped paragraphs go with their breaks (the one before the paragraph, for the last one): a mask, so
  // that neighbouring dropped paragraphs make one range and no two ranges touch the same character
  const removed = new Array<boolean>(frame.text.length).fill(false)
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.tokens.length === 0) return
    let text = ''
    let cursor = paragraph.start
    const replacements: { start: number; end: number; replacement: string }[] = []
    for (const token of paragraph.tokens) {
      // a mark that names no field of the data is left out of the card (never printed as it is): it counts as a blank value
      const value = valueOf(record, token.name)
      if (value === undefined) unknown.push(token.name)
      const replacement = (value ?? '').replace(/\s*[\r\n]+\s*/g, ' ')
      text += frame.text.slice(cursor, token.start) + replacement
      replacements.push({ start: token.start, end: token.end, replacement })
      cursor = token.end
    }
    text += frame.text.slice(cursor, paragraph.end)
    if (isBlank(text) && paragraphs.length > 1) {
      dropped.push(index)
      for (let at = paragraph.start; at < Math.min(frame.text.length, paragraph.end + 1); at++) removed[at] = true
      return
    }
    merged.set(index, text)
    matches.push(...replacements)
  })
  // blank paragraphs that end the story: the break that leads into the first of them goes too, so the story ends on its last line of text
  if (dropped.includes(paragraphs.length - 1)) {
    let first = paragraphs.length - 1
    while (first > 0 && dropped.includes(first - 1)) first--
    removed[paragraphs[first].start - 1] = true
  }
  for (let at = 0; at < removed.length; at++) {
    if (!removed[at]) continue
    let end = at
    while (end < removed.length && removed[end]) end++
    matches.push({ start: at, end, replacement: '' })
    at = end
  }
  matches.sort((a, b) => a.start - b.start)

  let result = replaceInStory(frame, matches, dropped.length ? { dropParagraphs: dropped } : {})
  if (isBlank(result.text)) return { frame: null, picture: null, unknown }

  // the direction of what each paragraph says now
  const kept = paragraphs.map((_, index) => index).filter((index) => !dropped.includes(index))
  const patches = kept.map((index) => result.paragraphStylePatches?.[kept.indexOf(index)] ?? {})
  let direction: 'rtl' | 'ltr' | null = null
  kept.forEach((original, position) => {
    const text = merged.get(original)
    if (text === undefined) return
    const found = detectDirection(text)
    if (!found) return
    direction ??= found
    const align = patches[position].align ?? frame.align
    patches[position] = { ...patches[position], direction: found, ...(align === 'right' || align === 'left' ? { align: found === 'rtl' ? 'right' : 'left' } : {}) }
  })
  if (direction) {
    const frameAlign = result.align === 'right' || result.align === 'left' ? { align: (direction === 'rtl' ? 'right' : 'left') as TextFrame['align'] } : {}
    result = { ...result, direction, ...frameAlign, paragraphStylePatches: patches }
  }
  return { frame: result, picture: null, unknown }
}

// ── imposition ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ImposeInput {
  pageWidth: number
  pageHeight: number
  itemWidth: number
  itemHeight: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  columnSpacing: number
  rowSpacing: number
}

export interface ImposeGrid {
  columns: number
  rows: number
  perPage: number
  /** where a card goes: its sheet, and its top-left corner on that sheet (points) */
  place: (index: number) => { page: number; x: number; y: number }
}

/** How many cards fit on a sheet in a row and in a column, and where each one goes; null when even one does not fit. */
export function imposeGrid(input: ImposeInput): ImposeGrid | null {
  const availableWidth = input.pageWidth - (input.marginLeft + input.marginRight)
  const availableHeight = input.pageHeight - (input.marginTop + input.marginBottom)
  if (input.itemWidth <= 0 || input.itemHeight <= 0) return null
  const columns = Math.floor((availableWidth + input.columnSpacing) / (input.itemWidth + input.columnSpacing) + 1e-9)
  const rows = Math.floor((availableHeight + input.rowSpacing) / (input.itemHeight + input.rowSpacing) + 1e-9)
  if (columns < 1 || rows < 1) return null
  const perPage = columns * rows
  return {
    columns,
    rows,
    perPage,
    place: (index) => {
      const inPage = index % perPage
      return {
        page: Math.floor(index / perPage),
        x: input.marginLeft + (inPage % columns) * (input.itemWidth + input.columnSpacing),
        y: input.marginTop + Math.floor(inPage / columns) * (input.itemHeight + input.rowSpacing),
      }
    },
  }
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * The crop marks of a card at (x, y), w × h: two lines at each corner, set off from it by `offset` so that no ink touches the
 * card, each `length` long: one running along the side that is above or below the corner, one along the side beside it.
 */
export function cropMarkSegments(x: number, y: number, w: number, h: number, offset: number, length: number): Segment[] {
  const right = x + w
  const bottom = y + h
  return [
    { x1: x, y1: y - offset, x2: x, y2: y - offset - length },
    { x1: x - offset, y1: y, x2: x - offset - length, y2: y },
    { x1: right, y1: y - offset, x2: right, y2: y - offset - length },
    { x1: right + offset, y1: y, x2: right + offset + length, y2: y },
    { x1: x, y1: bottom + offset, x2: x, y2: bottom + offset + length },
    { x1: x - offset, y1: bottom, x2: x - offset - length, y2: bottom },
    { x1: right, y1: bottom + offset, x2: right, y2: bottom + offset + length },
    { x1: right + offset, y1: bottom, x2: right + offset + length, y2: bottom },
  ]
}

// ── the merged document ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The text of a frame with every size multiplied by `scale`: its size, its leading and the sizes of its runs (never under 4 points). */
export function scaleFrameText(frame: TextFrame, scale: number): TextFrame {
  const size = (value: number) => Math.max(4, Math.round(value * scale * 10) / 10)
  const runs = normalizeRuns(frame.text, frame.runs, frame).map((run) => ({ ...run, style: { ...run.style, fontSize: size(run.style.fontSize) } }))
  return {
    ...frame,
    fontSize: size(frame.fontSize),
    ...(frame.leading ? { leading: Math.round(frame.leading * scale * 10) / 10 } : {}),
    runs,
    ...(frame.paragraphStylePatches ? { paragraphStylePatches: frame.paragraphStylePatches.map((patch) => (patch.leading ? { ...patch, leading: Math.round(patch.leading * scale * 10) / 10 } : patch)) } : {}),
  }
}

/**
 * A text that does not fit its frame, made smaller until it does (the largest size that fits, down to `minScale` of the size it
 * has): the other texts of the card keep their size. `fits` says whether a frame holds all its text.
 */
export function fitFrameText(frame: TextFrame, fits: (frame: TextFrame) => boolean, minScale = 0.5): TextFrame {
  if (fits(frame)) return frame
  const smallest = scaleFrameText(frame, minScale)
  if (!fits(smallest)) return smallest
  let low = minScale
  let high = 1
  for (let step = 0; step < 9; step++) {
    const middle = (low + high) / 2
    if (fits(scaleFrameText(frame, middle))) low = middle
    else high = middle
  }
  return scaleFrameText(frame, low)
}

export interface MergeOptions extends ImposeInput {
  cropMarks: boolean
  /** how far the marks stand off the card, and how long they are (points) */
  markOffset: number
  markLength: number
  name: string
  /** a text that would not fit its frame is made smaller for that record (needs `fits`) */
  autoShrink?: boolean
  /** whether a frame holds all its text (the layout of the program tells; see mergeFit.ts) */
  fits?: (frame: TextFrame) => boolean
}

export interface PictureSource {
  assetId: string
  asset: Assets[string]
}

export interface MergeResult {
  content: ExportContent
  cards: number
  pages: number
  /** pictures of the data that could not be found or read, once for each place they were wanted */
  missingPictures: number
  /** marks of the card that name no field of the data: they are left out of the cards */
  unknownFields: string[]
  /** how many texts were made smaller to fit their frame */
  shrunk: number
}

const MARK_WIDTH = 0.25

/**
 * Frames of text that ask for a field and are left with nothing: the frames under them (in the same columns) move up into their
 * place, so that a card with no company has no hole where it would be. Returns the frames that stay, moved.
 */
function collapseEmpty<T extends { x: number; y: number; w: number; h: number }>(stay: T[], gone: { x: number; y: number; w: number; h: number }[], moves: (frame: T) => boolean): T[] {
  const moved = stay.map((frame) => ({ ...frame }))
  for (const hole of [...gone].sort((a, b) => a.y - b.y)) {
    const below = moved.filter((frame) => moves(frame) && frame.y >= hole.y + hole.h * 0.5 && Math.min(frame.x + frame.w, hole.x + hole.w) - Math.max(frame.x, hole.x) > Math.min(frame.w, hole.w) * 0.5)
    if (below.length === 0) continue
    const shift = Math.min(...below.map((frame) => frame.y)) - hole.y
    if (shift <= 0) continue
    for (const frame of below) frame.y -= shift
  }
  return moved
}

/**
 * The document of the merge: a sheet for every `perPage` cards, the card made from the template for each record at its place on
 * its sheet, and, with `cropMarks`, the marks round each card. `template` is what the card is made of (its first page); `pictures`
 * gives the picture a record names (null when it cannot be found).
 */
export async function buildMerge(template: ExportContent, data: MergeData, options: MergeOptions, pictures: (value: string) => Promise<PictureSource | null>): Promise<MergeResult | null> {
  const grid = imposeGrid(options)
  const templateRects = pageRects(template.doc)
  const card = templateRects[0]
  if (!grid || !card || data.records.length === 0) return null
  const onCard = (box: { x: number; y: number; w: number; h: number }) => ownerPage(templateRects, box.x + box.w / 2, box.y + box.h / 2) === 0
  const frames = template.frames.filter(onCard)
  const images = template.images.filter(onCard)
  const shapes = template.shapes.filter(onCard)
  const types = new Map(data.fields.flatMap((field) => [[field.name, field.type], [field.name.toLowerCase(), field.type]] as const))

  const pageCount = Math.ceil(data.records.length / grid.perPage)
  const doc: DocSettings = {
    ...template.doc,
    name: options.name,
    width: options.pageWidth,
    height: options.pageHeight,
    pages: pageCount,
    perRow: 1,
    rowsCustom: false,
    pageJoins: [],
    pageSizes: [],
    pageMargins: [],
    facingPages: false,
    startPage: 1,
    primaryTextFrame: false,
    columns: 1,
    margins: { top: options.marginTop, bottom: options.marginBottom, left: options.marginLeft, right: options.marginRight },
    bleed: { top: 0, bottom: 0, left: 0, right: 0 },
    slug: { top: 0, bottom: 0, left: 0, right: 0 },
  }
  const sheets = pageRects(doc)

  const outFrames: TextFrame[] = []
  const outImages: ImageFrame[] = []
  const outShapes: ShapeFrame[] = []
  const assets: Assets = { ...template.assets }
  const unknown = new Set<string>()
  let missingPictures = 0
  let shrunk = 0
  const pictureCache = new Map<string, Promise<PictureSource | null>>()
  const picture = (value: string) => {
    let found = pictureCache.get(value)
    if (!found) {
      found = pictures(value).catch(() => null)
      pictureCache.set(value, found)
    }
    return found
  }

  for (let index = 0; index < data.records.length; index++) {
    const record = data.records[index]
    const place = grid.place(index)
    const sheet = sheets[place.page]
    const suffix = `~${index + 1}`
    const dx = sheet.x + place.x - card.x
    const dy = sheet.y + place.y - card.y
    const group = (id: string | undefined) => (id ? `${id}${suffix}` : undefined)

    const kept: { frame: TextFrame }[] = []
    const holes: { x: number; y: number; w: number; h: number }[] = []
    const pictureFrames: { frame: TextFrame; field: string }[] = []
    for (const frame of frames) {
      const merged = mergeTextFrame(frame, record, types)
      for (const name of merged.unknown) unknown.add(name)
      if (merged.picture) pictureFrames.push({ frame, field: merged.picture })
      else if (merged.frame) {
        const shrunkFrame = options.autoShrink && options.fits ? fitFrameText(merged.frame, options.fits) : merged.frame
        if (shrunkFrame !== merged.frame) shrunk++
        kept.push({ frame: shrunkFrame })
      } else holes.push({ x: frame.x, y: frame.y, w: frame.w, h: frame.h })
    }
    for (const { frame, field } of pictureFrames) {
      const value = valueOf(record, field) ?? ''
      const source = value === '' ? null : await picture(value)
      if (!source) {
        if (value !== '') missingPictures++
        holes.push({ x: frame.x, y: frame.y, w: frame.w, h: frame.h })
        continue
      }
      assets[source.assetId] = source.asset
      outImages.push({ id: `${frame.id}${suffix}`, x: frame.x + dx, y: frame.y + dy, w: frame.w, h: frame.h, assetId: source.assetId, fit: 'fill', ...(frame.z !== undefined ? { z: frame.z } : {}), ...(frame.layerId ? { layerId: frame.layerId } : {}), ...(frame.rotation ? { rotation: frame.rotation } : {}) })
    }
    const placed = collapseEmpty(kept.map((entry) => entry.frame), holes, (frame) => tokensIn(frames.find((original) => original.id === frame.id)?.text ?? '').length > 0)
    for (const frame of placed) {
      outFrames.push({ ...frame, id: `${frame.id}${suffix}`, next: null, groupId: group(frame.groupId), x: frame.x + dx, y: frame.y + dy })
    }
    for (const image of images) outImages.push({ ...image, id: `${image.id}${suffix}`, groupId: group(image.groupId), x: image.x + dx, y: image.y + dy })
    for (const shape of shapes) {
      outShapes.push({ ...shape, id: `${shape.id}${suffix}`, groupId: group(shape.groupId), ...(shape.extrudeOf ? { extrudeOf: `${shape.extrudeOf}${suffix}` } : {}), x: shape.x + dx, y: shape.y + dy })
    }
    if (options.cropMarks) {
      const marks = cropMarkSegments(sheet.x + place.x, sheet.y + place.y, card.w, card.h, options.markOffset, options.markLength)
      marks.forEach((mark, markIndex) => {
        outShapes.push({
          id: `mark${suffix}-${markIndex}`,
          kind: 'line',
          x: Math.min(mark.x1, mark.x2),
          y: Math.min(mark.y1, mark.y2),
          w: Math.abs(mark.x2 - mark.x1),
          h: Math.abs(mark.y2 - mark.y1),
          fill: null,
          stroke: '#000000',
          strokeWidth: MARK_WIDTH,
        })
      })
    }
  }

  const content: ExportContent = {
    doc,
    frames: outFrames,
    images: outImages,
    shapes: outShapes,
    layerOrder: template.layerOrder,
    assets,
    paragraphStyles: template.paragraphStyles,
    ...(template.objectStyles ? { objectStyles: template.objectStyles } : {}),
    ...(template.characterStyles ? { characterStyles: template.characterStyles } : {}),
    sections: [],
  }
  return { content, cards: data.records.length, pages: pageCount, missingPictures, unknownFields: [...unknown], shrunk }
}
