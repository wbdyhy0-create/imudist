import { describe, expect, it } from 'vitest'
import { applyDesignToTable, captureTable, captureText, designParts, designSummary, objectSettingsFor, type DesignPartId, type DesignRecord } from './designs'
import type { CharStyle, ParagraphStyleRecord, Run, TextFrame } from './document'
import { DEFAULT_TEXT_STYLE, defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { createTable } from './table'

const styles: ParagraphStyleRecord[] = [
  { id: 'body', name: 'גוף', patch: {} },
  { id: 'head', name: 'כותרת', patch: {} },
  { id: 'quote', name: 'ציטוט', patch: {} },
]
const styled = (id: string): CharStyle => ({ ...DEFAULT_TEXT_STYLE, charStyleId: id })
const story = (text: string, ids: string[], runs?: Run[]): TextFrame =>
  ({ ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 200, h: 200, text, next: null, paragraphStyleIds: ids, ...(runs ? { runs } : {}) }) as TextFrame
const all = (design: DesignRecord) => new Set<DesignPartId>(designParts(design).map((part) => part.id))

describe('the text part of a design', () => {
  it('holds the paragraph styles by place and the nested rules the openings show', () => {
    const text = 'כותרת: ראשונה\nגוף אחד\nגוף שני\nגוף שלישי'
    const runs: Run[] = [
      { len: 6, style: styled('bold') },
      { len: 'כותרת: ראשונה'.length - 6, style: { ...DEFAULT_TEXT_STYLE } },
      { len: text.length - 'כותרת: ראשונה'.length, style: { ...DEFAULT_TEXT_STYLE } },
    ]
    const part = captureText(story(text, ['head', 'body', 'body', 'body'], runs), styles)!
    expect(part.sequence).toEqual({ start: ['head'], middle: ['body'], end: [] })
    expect(part.nested).toEqual([{ styleId: 'head', rules: [{ styleId: 'bold', unit: 'delimiter', delimiter: ':', count: 1, inclusive: true }] }])
  })

  it('has no nested rules when the openings have no character style', () => {
    const part = captureText(story('א\nב\nג', ['head', 'body', 'body']), styles)!
    expect(part.nested).toBeUndefined()
    expect(part.sequence).toEqual({ start: ['head'], middle: ['body'], end: [] })
  })

  it('does not count empty paragraphs and gives nothing for an empty story', () => {
    expect(captureText(story('א\n\nב', ['head', 'quote', 'body']), styles)!.sequence).toEqual({ start: ['head'], middle: ['body'], end: [] })
    expect(captureText(story('', []), styles)).toBeUndefined()
  })
})

describe('the parts a design can be given in', () => {
  const table = createTable({ rows: 4, cols: 3, width: 300, headerRows: 1, footerRows: 1 })
  const full: DesignRecord = {
    id: 'd',
    name: 'לוח',
    object: { fill: '#336699', stroke: '#000000', strokeWidth: 2, radius: 8, opacity: 0.8, shadow: { offsetX: 0, offsetY: 3, color: '#000000', opacity: 0.4 } },
    text: { sequence: { start: ['head'], middle: ['body'], end: [] }, nested: [{ styleId: 'head', rules: [{ styleId: 'bold', unit: 'words', count: 2, inclusive: false }] }] },
    table: captureTable({ ...table, headerRows: 1, footerRows: 1, style: { ...table.style, headerFill: '#ccddee', stripeFill: '#f4f4f4' } }),
  }

  it('are listed for what the design holds, by group', () => {
    const parts = designParts(full)
    expect(parts.filter((part) => part.group === 'object').map((part) => part.id)).toEqual(['object:fill', 'object:stroke', 'object:radius', 'object:opacity', 'object:shadow'])
    expect(parts.filter((part) => part.group === 'text').map((part) => part.id)).toEqual(['text:sequence', 'text:nested'])
    expect(parts.filter((part) => part.group === 'table').map((part) => part.id)).toEqual(['table:text', 'table:cells', 'table:lines', 'table:fills', 'table:rows'])
    expect(designParts({ id: 'x', name: 'x', object: { opacity: 0.5 } }).map((part) => part.id)).toEqual(['object:opacity'])
    expect(designParts({ id: 'x', name: 'x' })).toEqual([])
  })

  it('give only the object settings that are chosen', () => {
    expect(objectSettingsFor(full, new Set<DesignPartId>(['object:fill', 'object:shadow']))).toEqual({ fill: '#336699', shadow: full.object!.shadow })
    expect(objectSettingsFor(full, new Set())).toEqual({})
    expect(objectSettingsFor({ id: 'x', name: 'x' }, all(full))).toEqual({})
  })

  it('write only the chosen parts into a table', () => {
    const target = { ...table, style: { ...table.style, headerFill: '#ffffff', stripeFill: null, fontSize: 20 }, headerRows: 0, footerRows: 0 }
    const filled = applyDesignToTable(target, full, new Set<DesignPartId>(['table:fills']))
    expect(filled.style.headerFill).toBe('#ccddee')
    expect(filled.style.stripeFill).toBe('#f4f4f4')
    expect(filled.style.fontSize).toBe(20) // the text of the cells was not chosen
    expect(filled.headerRows).toBe(0)
    const rows = applyDesignToTable(target, full, new Set<DesignPartId>(['table:rows']))
    expect([rows.headerRows, rows.footerRows]).toEqual([1, 1])
    expect(rows.style.headerFill).toBe('#ffffff')
    expect(applyDesignToTable(target, { id: 'x', name: 'x' }, all(full))).toBe(target)
  })

  it('take a missing setting off the table when the example does not have it', () => {
    const withAlternate = { ...table, style: { ...table.style, rowStrokeAlternate: { color: '#ff0000', width: 2 } } }
    const out = applyDesignToTable(withAlternate, full, new Set<DesignPartId>(['table:lines']))
    expect(out.style.rowStrokeAlternate).toBeUndefined()
  })

  it('are described in a few lines', () => {
    const lines = designSummary(full, (id) => styles.find((style) => style.id === id)?.name ?? id)
    expect(lines).toEqual([
      'אובייקט: מילוי, קו, פינות מעוגלות, שקיפות ומיזוג, צל',
      'טקסט: כותרת › (גוף) ↻',
      'טקסט: 1 כללי סגנון מקונן',
      'טבלה: 1 שורות כותרת, 1 שורות סיכום',
    ])
  })
})

describe('the library in the file', () => {
  const design: DesignRecord = {
    id: 'd1',
    name: 'כרטיס',
    object: { fill: '#112233', radius: 6 },
    text: { sequence: { start: ['head'], middle: ['body'], end: ['quote'] }, nested: [{ styleId: 'head', rules: [{ styleId: 'bold', unit: 'delimiter', delimiter: ':', count: 1, inclusive: true }] }] },
    table: captureTable({ ...createTable({ rows: 3, cols: 2, width: 200, headerRows: 1 }) }),
  }
  const content = (designs?: unknown): DocContent => ({
    doc: { ...defaultDocSettings('designs'), ...(designs ? { designs: designs as DesignRecord[] } : {}) },
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes: [],
    paragraphStyles: styles,
    parents: [],
    pageParents: [],
    sections: [],
  })

  it('comes back from the file', () => {
    const opened = parseDocument(serializeDocument(content([design])), 'designs.imudist')
    expect(opened.doc.designs).toEqual([design])
    expect(parseDocument(serializeDocument(content()), 'designs.imudist').doc.designs).toBeUndefined()
  })

  it('is cleaned when a file is read', () => {
    const file = JSON.parse(serializeDocument(content([design])))
    file.settings.designs = [
      { id: 'a', name: '', object: { fill: 'not a colour', radius: 'big' }, text: { sequence: { start: [1, 'x'], middle: 'no', end: [] }, nested: [{ styleId: '', rules: [] }, 'junk'] } },
      { id: 'a', name: 'עוד', table: { style: {}, headerRows: 999 } },
      { id: 'empty', name: 'ריק' },
      'junk',
      ...Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, name: `n${i}`, object: { opacity: 0.5 } })),
    ]
    const designs = parseDocument(JSON.stringify(file), 'designs.imudist').doc.designs!
    expect(designs.length).toBe(40)
    expect(designs[0].text?.sequence).toEqual({ start: ['x'], middle: [], end: [] })
    expect(designs[0].text?.nested).toBeUndefined()
    expect(designs[1].id).not.toBe('a') // a repeated id is made new
    expect(designs[1].table?.headerRows).toBe(50)
    expect(designs.some((item) => item.name === 'ריק')).toBe(false) // a design that holds nothing is not kept
  })
})
