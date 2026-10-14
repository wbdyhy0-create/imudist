import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STYLE, type TextFrame } from './document'
import { cropMarkSegments, decodeCsvBytes, detectDirection, fitFrameText, imposeGrid, isImageValue, mergeTextFrame, parseCsv, recordsFromRows, scaleFrameText, tokensIn, type FieldType } from './dataMerge'
import { rowsFromXlsxXml, formatExcelDate, isDateFormat } from './xlsx'

const frame = (text: string, extra: Partial<TextFrame> = {}): TextFrame => ({ ...DEFAULT_TEXT_STYLE, id: 'f', x: 0, y: 0, w: 200, h: 80, text, runs: [], next: null, ...extra })
const types = new Map<string, FieldType>([['avatar', 'image']])

describe('reading a table', () => {
  it('reads CSV with quotes, doubled quotes, line breaks in cells and a mark at the start', () => {
    const rows = parseCsv('\uFEFFname,note\r\n"Cohen, Haim","said ""hi""\nthere"\r\nLevi,\r\n')
    expect(rows).toEqual([['name', 'note'], ['Cohen, Haim', 'said "hi"\nthere'], ['Levi', '']])
  })

  it('finds the delimiter: semicolon and tab as well as comma', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reads the Hebrew 8-bit code when the bytes are not UTF-8', () => {
    expect(decodeCsvBytes(new Uint8Array([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום')
    expect(decodeCsvBytes(new TextEncoder().encode('שלום'))).toBe('שלום')
  })

  it('makes records of the rows and marks the picture fields', () => {
    const data = recordsFromRows([['id', 'full_name', 'avatar'], ['1', 'ישראל', 'https://site.com/a.png'], ['2', 'חיים', 'user2.jpg'], ['3', 'דנה', '']])
    expect(data.fields.map((field) => [field.name, field.type])).toEqual([['id', 'text'], ['full_name', 'text'], ['avatar', 'image']])
    expect(data.records[1]).toEqual({ id: '2', full_name: 'חיים', avatar: 'user2.jpg' })
    expect(data.records[2].avatar).toBe('')
  })

  it('gives a name to a header that is empty or repeated', () => {
    const data = recordsFromRows([['a', '', 'a'], ['1', '2', '3']])
    expect(data.fields.map((field) => field.name)).toEqual(['a', 'column2', 'a_2'])
  })

  it('knows the values that name a picture', () => {
    expect(isImageValue('photo.JPG')).toBe(true)
    expect(isImageValue('https://x.com/a.webp?size=2')).toBe(true)
    expect(isImageValue('notes.txt')).toBe(false)
  })

  it('turns the numbers of date cells into dates', () => {
    const styles = '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>'
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c><c r="B1" s="1"><v>45292</v></c><c r="C1" s="2"><v>45292.5</v></c><c r="D1" s="1"><v>0.75</v></c><c r="E1" s="0"><v>45292</v></c></row></sheetData></worksheet>'
    expect(rowsFromXlsxXml(sheet, null, { stylesXml: styles })).toEqual([['42', '01/01/2024', '01/01/2024 12:00', '18:00', '45292']])
  })

  it('counts the days of Excel the way it does: from 1900 with its extra day, or from 1904', () => {
    expect(formatExcelDate(1)).toBe('01/01/1900')
    expect(formatExcelDate(59)).toBe('28/02/1900')
    expect(formatExcelDate(61)).toBe('01/03/1900')
    expect(formatExcelDate(44927)).toBe('01/01/2023')
    expect(formatExcelDate(0, true)).toBe('01/01/1904')
  })

  it('knows a format of a date from one of a number', () => {
    expect(isDateFormat('dd/mm/yyyy')).toBe(true)
    expect(isDateFormat('[$-409]d-mmm-yy')).toBe(true)
    expect(isDateFormat('0.00')).toBe(false)
    expect(isDateFormat('General')).toBe(false)
    expect(isDateFormat('0.00" months"')).toBe(false)
  })

  it('reads the rows of a sheet of Excel from its XML', () => {
    const shared = '<sst><si><t>name</t></si><si><r><t>Is</t></r><r><t>rael</t></r></si><si><t>city</t></si></sst>'
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42</v></c><c r="C2" t="inlineStr"><is><t>Haifa</t></is></c></row></sheetData></worksheet>'
    expect(rowsFromXlsxXml(sheet, shared)).toEqual([['name', '', 'city'], ['Israel', '42', 'Haifa']])
  })
})

describe('the direction of a text', () => {
  it('follows the first letter or digit', () => {
    expect(detectDirection('ישראל ישראלי')).toBe('rtl')
    expect(detectDirection('مرحبا')).toBe('rtl')
    expect(detectDirection('Google ישראל')).toBe('ltr')
    expect(detectDirection('"שלום" world')).toBe('rtl')
    expect(detectDirection('45 רחוב הרצל')).toBe('ltr')
    expect(detectDirection('  -- ')).toBeNull()
  })
})

describe('the marks in the card', () => {
  it('lists the fields a text asks for', () => {
    expect(tokensIn('{{ full_name }} · {{company}}')).toEqual(['full_name', 'company'])
  })

  it('puts the values in and drops a line that is left blank', () => {
    const merged = mergeTextFrame(frame('{{full_name}}\n{{company}}\nstreet'), { full_name: 'ישראל', company: '' }, types)
    expect(merged.frame?.text).toBe('ישראל\nstreet')
  })

  it('drops blank lines at the end and next to each other', () => {
    expect(mergeTextFrame(frame('a\n{{x}}\n{{y}}'), { x: '', y: '' }, types).frame?.text).toBe('a')
    expect(mergeTextFrame(frame('{{x}}\n{{y}}\nb'), { x: '', y: '  ' }, types).frame?.text).toBe('b')
  })

  it('leaves nothing of a frame whose every line is blank', () => {
    expect(mergeTextFrame(frame('{{company}}'), { company: '' }, types).frame).toBeNull()
  })

  it('keeps the per-paragraph lists in step with the dropped lines', () => {
    const source = frame('{{a}}\n{{b}}\nc', { paragraphStyleIds: ['p1', 'p2', 'p3'], paragraphStyleNames: ['n1', 'n2', 'n3'], paragraphStylePatches: [{}, {}, {}] })
    const merged = mergeTextFrame(source, { a: 'x', b: '' }, types).frame!
    expect(merged.text).toBe('x\nc')
    expect(merged.paragraphStyleIds).toEqual(['p1', 'p3'])
    expect(merged.paragraphStylePatches).toHaveLength(2)
  })

  it('reads a text in the direction of its own first letter, and puts what is aligned to a side on the side it starts on', () => {
    const hebrew = mergeTextFrame(frame('{{name}}', { align: 'left' }), { name: 'שלום' }, types).frame!
    expect(hebrew.direction).toBe('rtl')
    expect(hebrew.align).toBe('right')
    expect(hebrew.paragraphStylePatches?.[0]).toMatchObject({ direction: 'rtl', align: 'right' })
    const english = mergeTextFrame(frame('{{name}}', { align: 'right' }), { name: 'Google Israel' }, types).frame!
    expect(english.direction).toBe('ltr')
    expect(english.align).toBe('left')
    const centred = mergeTextFrame(frame('{{name}}', { align: 'center' }), { name: 'Google' }, types).frame!
    expect(centred.align).toBe('center')
    expect(centred.direction).toBe('ltr')
  })

  it('takes a frame that holds one picture field for a picture', () => {
    expect(mergeTextFrame(frame(' {{avatar}} '), { avatar: 'a.png' }, types)).toMatchObject({ frame: null, picture: 'avatar' })
  })

  it('leaves out a mark that names no field, and says which', () => {
    const merged = mergeTextFrame(frame('{{missing}} {{name}}'), { name: 'x' }, types)
    expect(merged.unknown).toEqual(['missing'])
    expect(merged.frame?.text).toBe(' x')
    expect(mergeTextFrame(frame('a\n{{missing}}'), { name: 'x' }, types).frame?.text).toBe('a')
  })
})

const mm = (value: number) => (value * 72) / 25.4

describe('a text that is too long for its frame', () => {
  const sized = frame('name', { fontSize: 14, leading: 17, runs: [{ len: 4, style: { ...DEFAULT_TEXT_STYLE, fontSize: 14 } }] })

  it('has every size scaled', () => {
    const smaller = scaleFrameText(sized, 0.5)
    expect(smaller.fontSize).toBe(7)
    expect(smaller.leading).toBe(8.5)
    expect(smaller.runs[0].style.fontSize).toBe(7)
  })

  it('is left alone when it fits', () => {
    expect(fitFrameText(sized, () => true)).toBe(sized)
  })

  it('is made as large as still fits: 14 points becomes about 11 when 11 is the most that fits', () => {
    const fitted = fitFrameText(sized, (candidate) => candidate.fontSize <= 11)
    expect(fitted.fontSize).toBeLessThanOrEqual(11)
    expect(fitted.fontSize).toBeGreaterThan(10.5)
  })

  it('stops at half the size when even that does not fit', () => {
    expect(fitFrameText(sized, () => false).fontSize).toBe(7)
  })
})

describe('imposition', () => {
  const input = { pageWidth: mm(210), pageHeight: mm(297), itemWidth: mm(85), itemHeight: mm(55), marginTop: mm(15), marginRight: mm(15), marginBottom: mm(15), marginLeft: mm(15), columnSpacing: mm(5), rowSpacing: mm(5) }

  it('fits business cards on A4 with the default margins: 2 columns by 4 rows', () => {
    const grid = imposeGrid(input)!
    expect(grid.columns).toBe(2)
    expect(grid.rows).toBe(4)
    expect(grid.perPage).toBe(8)
  })

  it('places the cards row by row and opens a new sheet when one is full', () => {
    const grid = imposeGrid(input)!
    expect(grid.place(0)).toEqual({ page: 0, x: mm(15), y: mm(15) })
    expect(grid.place(1).x).toBeCloseTo(mm(15 + 85 + 5))
    expect(grid.place(2)).toMatchObject({ page: 0, x: mm(15) })
    expect(grid.place(2).y).toBeCloseTo(mm(15 + 55 + 5))
    expect(grid.place(8)).toEqual({ page: 1, x: mm(15), y: mm(15) })
  })

  it('is nothing when one card does not fit', () => {
    expect(imposeGrid({ ...input, itemWidth: mm(200) })).toBeNull()
  })

  it('draws two marks at each corner, off the card', () => {
    const marks = cropMarkSegments(100, 200, 50, 30, 6, 6)
    expect(marks).toHaveLength(8)
    expect(marks[0]).toEqual({ x1: 100, y1: 194, x2: 100, y2: 188 })
    expect(marks[1]).toEqual({ x1: 94, y1: 200, x2: 88, y2: 200 })
    expect(marks[7]).toEqual({ x1: 156, y1: 230, x2: 162, y2: 230 })
  })
})
