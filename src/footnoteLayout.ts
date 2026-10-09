import { effectiveLeading, DEFAULT_TEXT_STYLE, type Binding, type FootnoteItem, type FootnoteLayoutConfig, type FootnoteLayoutMode, type FootnoteMarkerFormat, type FootnoteNumberStyle, type ParagraphStyleRecord, type Run, type TextStyle } from './document'

export function footnoteBlockWidth(frameWidth: number, widthScale = 1): number {
  return frameWidth * Math.max(0.2, Math.min(1, widthScale))
}

export function changedFootnoteOffset(previous: FootnoteItem[], next: FootnoteItem[]): number | undefined {
  const previousById = new Map(previous.map((note) => [note.id, note]))
  const nextById = new Map(next.map((note) => [note.id, note]))
  const changed = [
    ...previous.filter((note) => nextById.get(note.id) !== note),
    ...next.filter((note) => previousById.get(note.id) !== note),
  ]
  return changed.length ? Math.min(...changed.map((note) => note.anchor)) : undefined
}

export function footnoteTextStyle(config: FootnoteLayoutConfig, styles: ParagraphStyleRecord[], paragraphStyleId?: string): TextStyle {
  const resolve = (id: string, seen = new Set<string>()): Partial<TextStyle> => {
    if (seen.has(id)) return {}
    const style = styles.find((candidate) => candidate.id === id)
    if (!style) return {}
    const nextSeen = new Set(seen).add(id)
    return { ...(style.basedOnId ? resolve(style.basedOnId, nextSeen) : {}), ...style.patch }
  }
  const patch = paragraphStyleId || config.paragraphStyleId ? resolve(paragraphStyleId || config.paragraphStyleId!) : {}
  return { ...DEFAULT_TEXT_STYLE, ...patch, ...(config.fontFamily ? { fontFamily: config.fontFamily } : {}) }
}

export function footnoteDividerTextStyle(config: FootnoteLayoutConfig, styles: ParagraphStyleRecord[]): TextStyle {
  return footnoteTextStyle({ ...config, fontFamily: '', paragraphStyleId: config.dividerHeadingStyleId }, styles)
}

export function footnoteDividerHeight(config: FootnoteLayoutConfig, styles: ParagraphStyleRecord[]): number {
  if (config.dividerMode === 'line') return Math.max(1, config.dividerThickness)
  const style = footnoteDividerTextStyle(config, styles)
  return Math.max(1, effectiveLeading(style))
}

export function updateFootnoteParagraphStyle(note: FootnoteItem, previous: TextStyle, next: TextStyle): FootnoteItem {
  const charKeys = ['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'] as const
  const styleKeys = [...charKeys, 'align', 'leading', 'wordSpacingMin', 'wordSpacingMax', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'secondLineIndent'] as const
  const changedKeys = styleKeys.filter((key) => previous[key] !== next[key])
  const changedCharKeys = charKeys.filter((key) => previous[key] !== next[key])
  const style = note.style ? { ...note.style } : undefined
  if (style) {
    for (const key of changedKeys) Object.assign(style, { [key]: next[key] })
  }
  const runs = note.runs?.map((run) => {
    const runStyle = { ...run.style }
    for (const key of changedCharKeys) {
      if (runStyle[key] === previous[key] || runStyle[key] === note.style?.[key]) Object.assign(runStyle, { [key]: next[key] })
    }
    return { ...run, style: runStyle }
  })
  return { ...note, ...(style ? { style } : {}), ...(runs ? { runs } : {}) }
}

function hebrewNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 9999) return String(value)
  const letters: [number, string][] = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']]
  const render = (part: number) => {
    if (part === 15) return 'טו'
    if (part === 16) return 'טז'
    let rest = part
    let result = ''
    for (const [amount, letter] of letters) while (rest >= amount) {
      result += letter
      rest -= amount
    }
    return result
  }
  const thousands = Math.floor(value / 1000)
  const remainder = value % 1000
  return `${thousands ? `${render(thousands)} ` : ''}${remainder ? render(remainder) : ''}`
}

function romanNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value)
  let rest = value
  let result = ''
  for (const [amount, glyph] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as [number, string][]) while (rest >= amount) {
    result += glyph
    rest -= amount
  }
  return result.toLowerCase()
}

export function formatFootnoteNumber(value: number, style: FootnoteNumberStyle, format: FootnoteMarkerFormat, prefix = '', suffix = ''): string {
  const number = style === 'hebrew' ? hebrewNumeral(value) : style === 'roman' ? romanNumeral(value) : String(value)
  const wrapped = format === 'dot' ? `${number}.` : format === 'dotBefore' ? `.${number}` : format === 'rightParen' ? `${number})` : format === 'doubleRightParen' ? `${number}))` : format === 'leftParen' ? `(${number}` : format === 'doubleLeftParen' ? `((${number}` : format === 'round' ? `(${number})` : format === 'square' ? `[${number}]` : number
  const markedNumber = `${prefix}${number}${suffix && !wrapped.endsWith(suffix) ? suffix : ''}`
  const formatted = format === 'dot' ? `${markedNumber}.` : format === 'dotBefore' ? `.${markedNumber}` : format === 'rightParen' ? `${markedNumber})` : format === 'doubleRightParen' ? `${markedNumber}))` : format === 'leftParen' ? `(${markedNumber}` : format === 'doubleLeftParen' ? `((${markedNumber}` : format === 'round' ? `(${markedNumber})` : format === 'square' ? `[${markedNumber}]` : markedNumber
  return formatted
}

export function footnoteLabelParts(label: string): { text: string; direction: 'rtl' | 'ltr' }[] {
  const parts: { text: string; direction: 'rtl' | 'ltr' }[] = []
  for (const character of label) {
    const direction = /[0-9A-Za-z]/.test(character) ? 'ltr' : 'rtl'
    const previous = parts.at(-1)
    if (direction === 'ltr' && previous?.direction === direction) previous.text += character
    else parts.push({ text: character, direction })
  }
  return parts
}

export interface FootnoteLayoutItem {
  id: string
  anchor: number
  referenceNumber: number | string
  content: string
  offset?: number
  continued?: boolean
  runs?: Run[]
  style?: TextStyle
}

export interface FootnoteOrderEntry {
  id: string
  page: number
  spread: number
  frameX: number
  frameY: number
  anchor: number
}

export function numberFootnotes(entries: FootnoteOrderEntry[], config: FootnoteLayoutConfig, binding: Binding): Map<string, number> {
  const ordered = [...entries].sort((a, b) => a.page - b.page || a.frameY - b.frameY || (binding === 'rtl' ? b.frameX - a.frameX : a.frameX - b.frameX) || a.anchor - b.anchor)
  const counts = new Map<number, number>()
  const numbers = new Map<string, number>()
  for (const entry of ordered) {
    const scope = config.restart === 'page' ? entry.page : config.restart === 'spread' ? entry.spread : 0
    const index = counts.get(scope) ?? 0
    numbers.set(entry.id, config.startAt + index)
    counts.set(scope, index + 1)
  }
  return numbers
}

export interface FootnoteMeasurement {
  width: number
  height: number
}

export interface FootnotePlacement extends FootnoteLayoutItem {
  x: number
  y: number
  width: number
  naturalWidth?: number
  height: number
  computedWidth: number
  computedHeight: number
}

export interface FootnoteLayoutResult {
  placements: FootnotePlacement[]
  overflowItems: FootnoteLayoutItem[]
  height: number
  overflow: boolean
}

export interface FootnoteLayoutOptions {
  mode: FootnoteLayoutMode
  columns?: 1 | 2
  columnGap?: number
  alignment?: 'right' | 'center'
  columnWidth: number
  maxFootnoteHeight: number
  minSpacingBetweenInline: number
}

export type MeasureFootnote = (item: FootnoteLayoutItem, width: number) => FootnoteMeasurement

function sliceFootnoteRuns(runs: Run[] | undefined, from: number, to: number): Run[] | undefined {
  if (!runs) return undefined
  const result: Run[] = []
  let position = 0
  for (const run of runs) {
    const start = Math.max(from, position)
    const end = Math.min(to, position + run.len)
    if (end > start) result.push({ len: end - start, style: run.style })
    position += run.len
  }
  return result
}

function fitPrefix(item: FootnoteLayoutItem, width: number, maxHeight: number, measure: MeasureFootnote): { content: string; rest: string; restOffset: number; runs: Run[] | undefined; restRuns: Run[] | undefined; height: number } | null {
  const words = item.content.match(/\S+\s*/g) ?? []
  let low = 0
  let high = words.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const content = words.slice(0, mid).join('')
    if (content && measure({ ...item, content }, width).height <= maxHeight) low = mid
    else high = mid - 1
  }
  const fitsAtLeastOneWord = low > 0
  // a one- or two-word "rest" would open the next frame alone, looking like a stranded scrap (the same concern as
  // textLayout.ts's `avoidLooseLastLine` for body text) - taking a few more words back from the prefix costs a
  // little room here, in exchange for a continuation that reads as a real line instead of a stray word. A footnote
  // too short to leave 3 words behind this way moves to the next frame whole (low drops to 0, `content` stays empty) -
  // not into the character-level fallback below, which is only for when not even one whole word truly fits.
  if (fitsAtLeastOneWord && words.length - low > 0 && words.length - low < 3) low = Math.max(0, words.length - 3)
  let content = words.slice(0, low).join('')
  if (!content && !fitsAtLeastOneWord) {
    const chars = [...item.content]
    low = 0
    high = chars.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      const candidate = chars.slice(0, mid).join('')
      if (candidate && measure({ ...item, content: candidate }, width).height <= maxHeight) low = mid
      else high = mid - 1
    }
    content = chars.slice(0, low).join('')
  }
  if (!content) return null
  const rest = item.content.slice(content.length)
  return {
    content,
    rest,
    restOffset: (item.offset ?? 0) + content.length,
    runs: sliceFootnoteRuns(item.runs, 0, content.length),
    restRuns: sliceFootnoteRuns(item.runs, content.length, item.content.length),
    height: measure({ ...item, content, runs: sliceFootnoteRuns(item.runs, 0, content.length) }, width).height,
  }
}

function layoutVerticalColumns(items: FootnoteLayoutItem[], options: FootnoteLayoutOptions, measure: MeasureFootnote): FootnoteLayoutResult {
  const rightColumnWidth = options.columnWidth / 2
  const gap = Math.min(Math.max(0, options.columnGap ?? 10), Math.max(0, rightColumnWidth - 16))
  const leftColumnWidth = rightColumnWidth - gap
  const columnWidths = [rightColumnWidth, leftColumnWidth]
  const columnX = [0, rightColumnWidth + gap]
  const rightColumnItemCount = Math.max(1, Math.min(items.length - 1, Math.ceil(items.length * 2 / 3)))
  const placements: FootnotePlacement[] = []
  const overflowItems: FootnoteLayoutItem[] = []
  let column = 0
  let y = 0
  let height = 0
  let itemIndex = 0
  let current: FootnoteLayoutItem | null = null
  let overflow = false

  while (current || itemIndex < items.length) {
    if (!current) {
      if (column === 0 && itemIndex >= rightColumnItemCount) {
        column = 1
        y = 0
      }
      current = items[itemIndex++]
    }
    if (column >= 2) {
      overflow = true
      overflowItems.push({ ...current, continued: true }, ...items.slice(itemIndex).map((item) => ({ ...item, continued: true })))
      break
    }

    const columnWidth = columnWidths[column]
    const naturalWidth = measure(current, Number.POSITIVE_INFINITY).width
    const measured = measure(current, columnWidth)
    const available = Math.max(0, options.maxFootnoteHeight - y)
    if (measured.height <= available) {
      placements.push({ ...current, x: columnX[column], y, width: columnWidth, naturalWidth, height: measured.height, computedWidth: columnWidth, computedHeight: measured.height })
      y += measured.height
      height = Math.max(height, y)
      current = null
      continue
    }

    const prefix: ReturnType<typeof fitPrefix> = available > 0 ? fitPrefix(current, columnWidth, available, measure) : null
    if (prefix) {
      placements.push({ ...current, content: prefix.content, runs: prefix.runs, x: columnX[column], y, width: columnWidth, naturalWidth: measure({ ...current, content: prefix.content }, Number.POSITIVE_INFINITY).width, height: prefix.height, computedWidth: columnWidth, computedHeight: prefix.height })
      y += prefix.height
      height = Math.max(height, y)
      current = prefix.rest ? { ...current, content: prefix.rest, offset: prefix.restOffset, runs: prefix.restRuns, continued: true } : null
      if (!current) continue
    }
    column++
    y = 0
  }

  return { placements, overflowItems, height, overflow }
}

export function layoutFootnotes(
  items: FootnoteLayoutItem[],
  options: FootnoteLayoutOptions,
  measure: MeasureFootnote,
): FootnoteLayoutResult {
  const { columnWidth, maxFootnoteHeight, minSpacingBetweenInline } = options
  if (!items.length || columnWidth <= 0 || maxFootnoteHeight <= 0) return { placements: [], overflowItems: items, height: 0, overflow: items.length > 0 }

  const placements: FootnotePlacement[] = []
  const overflowItems: FootnoteLayoutItem[] = []
  let height = 0
  let overflow = false

  if (options.mode === 'vertical') {
    if (options.columns === 2 && columnWidth > 16) return layoutVerticalColumns(items, options, measure)
    for (const [index, item] of items.entries()) {
      const naturalWidth = measure(item, Number.POSITIVE_INFINITY).width
      const measured = measure(item, columnWidth)
      if (height + measured.height > maxFootnoteHeight) {
        overflow = true
        const available = maxFootnoteHeight - height
        const prefix = available > 0 ? fitPrefix(item, columnWidth, available, measure) : null
        if (prefix) {
          placements.push({ ...item, content: prefix.content, runs: prefix.runs, x: 0, y: height, width: columnWidth, naturalWidth: measure({ ...item, content: prefix.content }, Number.POSITIVE_INFINITY).width, height: prefix.height, computedWidth: columnWidth, computedHeight: prefix.height })
          height += prefix.height
          if (prefix.rest) overflowItems.push({ ...item, content: prefix.rest, offset: prefix.restOffset, runs: prefix.restRuns, continued: true })
        } else overflowItems.push({ ...item, continued: true })
        overflowItems.push(...items.slice(index + 1).map((remaining) => ({ ...remaining, continued: true })))
        break
      }
      placements.push({ ...item, x: 0, y: height, width: columnWidth, naturalWidth, height: measured.height, computedWidth: columnWidth, computedHeight: measured.height })
      height += measured.height
    }
    return { placements, overflowItems, height, overflow }
  }

  let currentX = 0
  let currentRowY = 0
  let currentRowHeight = 0
  let rowHasItems = false
  for (const [index, item] of items.entries()) {
    const natural = measure(item, Number.POSITIVE_INFINITY)
    const wrapped = natural.width > columnWidth ? measure(item, columnWidth) : natural
    const width = Math.min(columnWidth, Math.max(0, wrapped.width))
    const itemHeight = Math.max(0, wrapped.height)
    let x = currentX
    if (rowHasItems) {
      x += minSpacingBetweenInline
      if (x + width > columnWidth) {
        currentRowY += currentRowHeight
        x = 0
        currentRowHeight = 0
        rowHasItems = false
      }
    }
    if (currentRowY + itemHeight > maxFootnoteHeight) {
      overflow = true
      const available = maxFootnoteHeight - currentRowY
      const prefix = available > 0 ? fitPrefix(item, columnWidth, available, measure) : null
      if (prefix) {
        placements.push({ ...item, content: prefix.content, runs: prefix.runs, x, y: currentRowY, width, naturalWidth: measure({ ...item, content: prefix.content }, Number.POSITIVE_INFINITY).width, height: prefix.height, computedWidth: width, computedHeight: prefix.height })
        currentRowHeight = Math.max(currentRowHeight, prefix.height)
        if (prefix.rest) overflowItems.push({ ...item, content: prefix.rest, offset: prefix.restOffset, runs: prefix.restRuns, continued: true })
      } else overflowItems.push({ ...item, continued: true })
      overflowItems.push(...items.slice(index + 1).map((remaining) => ({ ...remaining, continued: true })))
      break
    }
    placements.push({ ...item, x, y: currentRowY, width, naturalWidth: natural.width, height: itemHeight, computedWidth: width, computedHeight: itemHeight })
    currentX = x + width
    currentRowHeight = Math.max(currentRowHeight, itemHeight)
    rowHasItems = true
  }
  if (options.alignment === 'center') {
    const rows = new Map<number, FootnotePlacement[]>()
    for (const placement of placements) rows.set(placement.y, [...(rows.get(placement.y) ?? []), placement])
    for (const row of rows.values()) {
      const usedWidth = Math.max(...row.map((placement) => placement.x + placement.width)) - Math.min(...row.map((placement) => placement.x))
      const shift = Math.max(0, (columnWidth - usedWidth) / 2)
      for (const placement of row) placement.x += shift
    }
  }
  height = Math.min(maxFootnoteHeight, currentRowY + currentRowHeight)
  return { placements, overflowItems, height, overflow }
}
