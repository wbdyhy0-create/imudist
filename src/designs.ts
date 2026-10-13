import type { NestedStyleRule, ObjectStyleSettings, ParagraphStyleRecord, TextFrame } from './document'
import { detectNestedRules } from './nestedStyles'
import { learnSequence, type SequenceParts } from './paragraphSequences'
import { normalizeRuns, sliceRuns } from './story'
import { styleIdOf } from './styleApply'
import { setHeaderFooter, type TableData, type TableStyle } from './table'

/**
 * Designs by example (ספריית עיצובים): the look of what is selected, kept under a name and given to other things later. One design
 * can hold the look of an object (a shape, a line, a picture), of a text (the paragraph styles by place and the nested styles found
 * in it) and of a table; given to a selection, each part goes to what it fits, and any part can be left out. Pure data and functions.
 */

export interface DesignTextPart {
  /** the paragraph styles by place, learnt from the paragraphs of the example */
  sequence?: SequenceParts
  /** the nested styles found at the opening of the paragraphs of each paragraph style of the example */
  nested?: { styleId: string; rules: NestedStyleRule[] }[]
}

export interface DesignTablePart {
  style: TableStyle
  headerRows: number
  footerRows: number
}

export interface DesignRecord {
  id: string
  name: string
  /** the look of a shape, line or picture: the settings an object style holds */
  object?: ObjectStyleSettings
  text?: DesignTextPart
  table?: DesignTablePart
}

export const MAX_DESIGNS = 40

// ── the parts a design can be given in ──

export type DesignGroup = 'object' | 'text' | 'table'

export type DesignPartId =
  | 'object:fill' | 'object:stroke' | 'object:radius' | 'object:opacity' | 'object:shadow' | 'object:feather' | 'object:arrows' | 'object:widths'
  | 'text:sequence' | 'text:nested'
  | 'table:text' | 'table:cells' | 'table:lines' | 'table:fills' | 'table:rows'

export interface DesignPart {
  id: DesignPartId
  group: DesignGroup
  label: string
}

const OBJECT_PARTS: { id: DesignPartId; label: string; keys: (keyof ObjectStyleSettings)[] }[] = [
  { id: 'object:fill', label: 'מילוי (צבע או מעבר צבעים)', keys: ['fill', 'fillGradient'] },
  { id: 'object:stroke', label: 'קו (צבע, עובי, סגנון)', keys: ['stroke', 'strokeWidth', 'strokeDash', 'strokeCap'] },
  { id: 'object:radius', label: 'פינות מעוגלות', keys: ['radius'] },
  { id: 'object:opacity', label: 'שקיפות ומיזוג', keys: ['opacity', 'blendMode'] },
  { id: 'object:shadow', label: 'צל', keys: ['shadow'] },
  { id: 'object:feather', label: 'שוליים רכים (נוצה)', keys: ['feather'] },
  { id: 'object:arrows', label: 'ראשי חץ', keys: ['arrowStart', 'arrowEnd'] },
  { id: 'object:widths', label: 'עובי משתנה לאורך הקו', keys: ['lineWidths'] },
]

const TABLE_PARTS: { id: DesignPartId; label: string; keys: (keyof TableStyle)[] }[] = [
  { id: 'table:text', label: 'טקסט בתאים (גופן, גודל, צבע, יישור)', keys: ['fontFamily', 'fontSize', 'leading', 'tracking', 'spaceBefore', 'spaceAfter', 'color', 'weight', 'italic', 'align', 'valign'] },
  { id: 'table:cells', label: 'ריווח התאים (שוליים, רווחים בין תאים, פינות)', keys: ['insetX', 'insetY', 'cellGapX', 'cellGapY', 'cellRadius', 'headerContinuous'] },
  { id: 'table:lines', label: 'קווי הטבלה (מסגרת, שורות, עמודות)', keys: ['outer', 'rowStroke', 'rowStrokeAlternate', 'colStroke', 'colStrokeAlternate'] },
  { id: 'table:fills', label: 'מילויים (כותרת, פסים, גוף, סיכום)', keys: ['bodyFill', 'headerFill', 'headerWeight', 'footerFill', 'stripeFill'] },
]

/** the parts a design holds, in the order the dialog shows them */
export function designParts(design: DesignRecord): DesignPart[] {
  const parts: DesignPart[] = []
  if (design.object) {
    for (const part of OBJECT_PARTS) if (part.keys.some((key) => key in design.object!)) parts.push({ id: part.id, group: 'object', label: part.label })
  }
  const text = design.text
  if (text?.sequence && text.sequence.start.length + text.sequence.middle.length + text.sequence.end.length > 0) parts.push({ id: 'text:sequence', group: 'text', label: 'סגנונות הפסקאות לפי מקומן' })
  if (text?.nested?.length) parts.push({ id: 'text:nested', group: 'text', label: 'סגנונות מקוננים בפתיחת הפסקאות' })
  if (design.table) {
    for (const part of TABLE_PARTS) parts.push({ id: part.id, group: 'table', label: part.label })
    parts.push({ id: 'table:rows', group: 'table', label: 'מספר שורות הכותרת והסיכום' })
  }
  return parts
}

/** the settings of the object part of a design that the chosen parts include */
export function objectSettingsFor(design: DesignRecord, chosen: ReadonlySet<DesignPartId>): ObjectStyleSettings {
  const out: ObjectStyleSettings = {}
  if (!design.object) return out
  for (const part of OBJECT_PARTS) {
    if (!chosen.has(part.id)) continue
    for (const key of part.keys) if (key in design.object) (out as Record<string, unknown>)[key] = design.object[key]
  }
  return out
}

/** the table with the chosen parts of the design written into its style (and its header and footer rows) */
export function applyDesignToTable(table: TableData, design: DesignRecord, chosen: ReadonlySet<DesignPartId>): TableData {
  const source = design.table
  if (!source) return table
  const style: TableStyle = { ...table.style }
  const target = style as unknown as Record<string, unknown>
  const from = source.style as unknown as Record<string, unknown>
  for (const part of TABLE_PARTS) {
    if (!chosen.has(part.id)) continue
    for (const key of part.keys) {
      if (from[key] === undefined) delete target[key]
      else target[key] = from[key]
    }
  }
  let next: TableData = { ...table, style }
  if (chosen.has('table:rows')) next = setHeaderFooter(next, source.headerRows, source.footerRows)
  return next
}

// ── making a design from what is selected ──

/** the table's own look as a part of a design */
export function captureTable(table: TableData): DesignTablePart {
  return { style: JSON.parse(JSON.stringify(table.style)) as TableStyle, headerRows: table.headerRows, footerRows: table.footerRows }
}

/**
 * The text part of a design from a story: the paragraph styles its paragraphs have by place (empty ones are not counted), and for
 * each of those styles the nested rules the openings of its paragraphs show.
 */
export function captureText(head: TextFrame, styles: ParagraphStyleRecord[]): DesignTextPart | undefined {
  if (!head.text) return undefined
  const runs = normalizeRuns(head.text, head.runs, head)
  const paragraphs = head.text.split('\n')
  const items: { styleId: string; text: string; runs: ReturnType<typeof sliceRuns> }[] = []
  let at = 0
  paragraphs.forEach((text, index) => {
    const start = at
    at += text.length + 1
    if (text.trim() === '') return
    const styleId = styleIdOf(styles, head, index)
    if (styleId) items.push({ styleId, text, runs: sliceRuns(runs, start, start + text.length) })
  })
  if (items.length === 0) return undefined
  const sequence = learnSequence(items.map((item) => item.styleId))
  const nested: { styleId: string; rules: NestedStyleRule[] }[] = []
  for (const styleId of new Set(items.map((item) => item.styleId))) {
    const rules = detectNestedRules(items.filter((item) => item.styleId === styleId))
    if (rules.length) nested.push({ styleId, rules })
  }
  return { sequence, ...(nested.length ? { nested } : {}) }
}

/** a design's lines for the list: what it holds, in a few words each */
export function designSummary(design: DesignRecord, nameOf: (paragraphStyleId: string) => string): string[] {
  const lines: string[] = []
  if (design.object) {
    const names = OBJECT_PARTS.filter((part) => part.keys.some((key) => key in design.object!)).map((part) => part.label.replace(/ \(.*\)$/, ''))
    if (names.length) lines.push(`אובייקט: ${names.join(', ')}`)
  }
  const sequence = design.text?.sequence
  if (sequence && sequence.start.length + sequence.middle.length + sequence.end.length > 0) {
    const names = (ids: string[]) => ids.map(nameOf).join(' › ')
    const parts = [sequence.start.length ? names(sequence.start) : '', sequence.middle.length ? `(${names(sequence.middle)}) ↻` : '', sequence.end.length ? names(sequence.end) : ''].filter(Boolean)
    lines.push(`טקסט: ${parts.join(' › ')}`)
  }
  const nested = design.text?.nested
  if (nested?.length) lines.push(`טקסט: ${nested.reduce((n, item) => n + item.rules.length, 0)} כללי סגנון מקונן`)
  if (design.table) lines.push(`טבלה: ${design.table.headerRows} שורות כותרת, ${design.table.footerRows} שורות סיכום`)
  return lines
}
