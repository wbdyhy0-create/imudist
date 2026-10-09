import { describe, expect, it } from 'vitest'
import { FOOTNOTE_MARKER as M, type FootnoteItem, type TextFrame } from './document'
import { footnotesToInlineNotes, inlineNotesToFootnotes, NOTE_BRACKETS } from './footnoteConvert'

const [ROUND, SQUARE, BOTH] = NOTE_BRACKETS

const frame = (text: string, footnotes?: FootnoteItem[]): TextFrame => ({
  id: 'f', x: 0, y: 0, w: 300, h: 200, text, runs: [], next: null,
  fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, align: 'right', color: '#000000',
  ...(footnotes ? { footnotes } : {}),
})

let counter = 0
const newId = () => `new-${++counter}`

describe('notes in brackets to footnotes', () => {
  it('turns each bracket into a footnote reference and keeps the text of the note', () => {
    const { frame: out, count } = inlineNotesToFootnotes(frame('ראה (מקור א) ועוד (מקור ב) סוף'), ROUND, { paragraphStyleId: 'note-style', newId })
    expect(count).toBe(2)
    expect(out.text).toBe(`ראה ${M} ועוד ${M} סוף`)
    expect(out.footnotes?.map((note) => [note.anchor, note.content, note.paragraphStyleId])).toEqual([
      [4, 'מקור א', 'note-style'],
      [11, 'מקור ב', 'note-style'],
    ])
    expect(out.footnotes?.every((note) => out.text[note.anchor] === M)).toBe(true)
  })

  it('reads the kind of bracket it was told, and only that', () => {
    const text = 'א (עגול) ב [מרובע] ג ([משולב]) ד'
    expect(inlineNotesToFootnotes(frame(text), ROUND, { newId }).frame.footnotes?.map((n) => n.content)).toEqual(['עגול', '[משולב]'])
    expect(inlineNotesToFootnotes(frame(text), SQUARE, { newId }).frame.footnotes?.map((n) => n.content)).toEqual(['מרובע', 'משולב'])
    const both = inlineNotesToFootnotes(frame(text), BOTH, { newId })
    expect(both.frame.footnotes?.map((n) => n.content)).toEqual(['משולב'])
    expect(both.frame.text).toBe(`א (עגול) ב [מרובע] ג ${M} ד`)
  })

  it('keeps the footnotes there already with their own references', () => {
    const text = `א ${M} ב (חדשה) ג ד ה ו ז ${M} סוף`
    const old: FootnoteItem[] = [{ id: 'old1', anchor: 2, content: 'קודמת' }, { id: 'old2', anchor: text.lastIndexOf(M), content: 'אחרונה' }]
    const { frame: out } = inlineNotesToFootnotes(frame(text, old), ROUND, { newId })
    expect(out.text).toBe(`א ${M} ב ${M} ג ד ה ו ז ${M} סוף`)
    const byId = Object.fromEntries((out.footnotes ?? []).map((note) => [note.id, note]))
    expect(Object.keys(byId)).toHaveLength(3)
    expect(out.text[byId.old1.anchor]).toBe(M)
    expect(byId.old1.anchor).toBe(2)
    expect(out.footnotes?.map((note) => note.content)).toEqual(['קודמת', 'חדשה', 'אחרונה'])
    expect(byId.old2.anchor).toBe(out.text.lastIndexOf(M))
  })

  it('works only inside the range it is given', () => {
    const text = '(א) ו(ב) ו(ג)'
    const { frame: out, count } = inlineNotesToFootnotes(frame(text), ROUND, { range: { from: 4, to: 8 }, newId })
    expect(count).toBe(1)
    expect(out.text).toBe(`(א) ו${M} ו(ג)`)
    expect(out.footnotes?.map((note) => note.content)).toEqual(['ב'])
  })

  it('leaves alone a bracket with nothing in it, and one that holds a footnote', () => {
    const text = `א (  ) ב (גם ${M}) ג`
    const { frame: out, count } = inlineNotesToFootnotes(frame(text, [{ id: 'n', anchor: text.indexOf(M), content: 'x' }]), ROUND, { newId })
    expect(count).toBe(0)
    expect(out.text).toBe(text)
  })
})

describe('footnotes to notes in brackets', () => {
  it('puts each footnote in brackets exactly where its reference was', () => {
    const text = `ראה${M} ועוד${M} סוף`
    const notes: FootnoteItem[] = [{ id: 'a', anchor: 3, content: '  מקור א\n' }, { id: 'b', anchor: 9, content: 'שורה אחת\nושנייה' }]
    const { frame: out, count } = footnotesToInlineNotes(frame(text, notes), ROUND)
    expect(count).toBe(2)
    expect(out.text).toBe('ראה(מקור א) ועוד(שורה אחת ושנייה) סוף')
    expect(out.footnotes ?? []).toEqual([])
  })

  it('uses the brackets it was told, and keeps the footnotes outside the range', () => {
    const text = `א${M} ב${M} ג`
    const notes: FootnoteItem[] = [{ id: 'a', anchor: 1, content: 'ראשונה' }, { id: 'b', anchor: 4, content: 'שנייה' }]
    const { frame: out, count } = footnotesToInlineNotes(frame(text, notes), BOTH, { range: { from: 3, to: 6 } })
    expect(count).toBe(1)
    expect(out.text).toBe(`א${M} ב([שנייה]) ג`)
    expect(out.footnotes?.map((note) => note.id)).toEqual(['a'])
    expect(out.text[out.footnotes![0].anchor]).toBe(M)
  })

  it('preserves the reference-to-word spacing after a full conversion round trip', () => {
    const text = `צמוד${M} מרווח ${M}`
    const notes: FootnoteItem[] = [
      { id: 'a', anchor: 4, content: 'הערה צמודה' },
      { id: 'b', anchor: 12, content: 'הערה עם רווח' },
    ]
    const original = frame(text, notes)
    const inline = footnotesToInlineNotes(original, ROUND)
    const restored = inlineNotesToFootnotes(inline.frame, ROUND, { newId })

    expect(inline.frame.text).toBe('צמוד(הערה צמודה) מרווח (הערה עם רווח)')
    expect(restored.frame.text).toBe(text)
    expect(restored.frame.footnotes?.map(({ anchor, content }) => ({ anchor, content }))).toEqual([
      { anchor: 4, content: 'הערה צמודה' },
      { anchor: 12, content: 'הערה עם רווח' },
    ])
  })

  it('does nothing to a story with no footnotes', () => {
    const plain = frame('אין כאן הערות')
    expect(footnotesToInlineNotes(plain, ROUND)).toEqual({ frame: plain, count: 0 })
  })
})

describe('a story with thousands of notes', () => {
  it('is converted in a moment, there and back, with every note on its own reference', () => {
    const paragraphs = Array.from({ length: 1500 }, (_, i) => `פסקה ${i} עם טקסט ארוך למדי (הערה ${i}) ועוד קצת טקסט, ועוד (הערה נוספת ${i}) לסיום.`)
    const base = { ...frame(paragraphs.join(String.fromCharCode(10))), paragraphStyleIds: paragraphs.map(() => 'body') }
    const started = performance.now()
    const forward = inlineNotesToFootnotes(base, ROUND, { newId })
    const back = footnotesToInlineNotes(forward.frame, ROUND)
    expect(performance.now() - started).toBeLessThan(1500)
    expect(forward.count).toBe(3000)
    expect(forward.frame.footnotes).toHaveLength(3000)
    expect(forward.frame.footnotes!.every((note) => forward.frame.text[note.anchor] === M)).toBe(true)
    expect(forward.frame.footnotes![1].content).toBe('הערה נוספת 0')
    expect(forward.frame.paragraphStyleIds).toHaveLength(1500)
    expect(back.count).toBe(3000)
    expect(back.frame.footnotes).toBeUndefined()
    expect(back.frame.text.split(String.fromCharCode(10))[7]).toBe('פסקה 7 עם טקסט ארוך למדי (הערה 7) ועוד קצת טקסט, ועוד (הערה נוספת 7) לסיום.')
  })
})

describe('only the notes of one paragraph style', () => {
  const nl = String.fromCharCode(10)
  const styles = [{ id: 'body', name: 'גוף', patch: {} }, { id: 'quote', name: 'ציטוט', patch: {} }]
  const text = 'ראשונה (הערה 1)' + nl + 'שנייה (הערה 2)' + nl + 'שלישית (הערה 3)'

  it('turns into footnotes only the notes in paragraphs of the style it was told', () => {
    const base = { ...frame(text), paragraphStyleIds: ['body', 'quote', 'body'] }
    const quote = inlineNotesToFootnotes(base, ROUND, { newId, onlyInStyleId: 'quote', styles })
    expect(quote.count).toBe(1)
    expect(quote.frame.footnotes?.map((note) => note.content)).toEqual(['הערה 2'])
    expect(quote.frame.text).toBe('ראשונה (הערה 1)' + nl + 'שנייה ' + M + nl + 'שלישית (הערה 3)')
    const body = inlineNotesToFootnotes(base, ROUND, { newId, onlyInStyleId: 'body', styles })
    expect(body.frame.footnotes?.map((note) => note.content)).toEqual(['הערה 1', 'הערה 3'])
  })

  it('takes a paragraph with no style of its own as being in the first style of the document', () => {
    expect(inlineNotesToFootnotes(frame(text), ROUND, { newId, onlyInStyleId: 'body', styles }).count).toBe(3)
    expect(inlineNotesToFootnotes(frame(text), ROUND, { newId, onlyInStyleId: 'quote', styles }).count).toBe(0)
  })

  it('turns back only the footnotes of the style it was told', () => {
    const marked = 'א' + M + ' ב' + M + ' ג' + M
    const notes: FootnoteItem[] = [
      { id: 'a', anchor: 1, content: 'אחת', paragraphStyleId: 'quote' },
      { id: 'b', anchor: 4, content: 'שתיים' },
      { id: 'c', anchor: 7, content: 'שלוש', paragraphStyleId: 'quote' },
    ]
    const quote = footnotesToInlineNotes(frame(marked, notes), ROUND, { onlyStyleId: 'quote', defaultStyleId: 'body' })
    expect(quote.count).toBe(2)
    expect(quote.frame.footnotes?.map((note) => note.id)).toEqual(['b'])
    // the one with no style of its own has the style the footnotes have in the document
    const plain = footnotesToInlineNotes(frame(marked, notes), ROUND, { onlyStyleId: 'body', defaultStyleId: 'body' })
    expect(plain.frame.footnotes?.map((note) => note.id)).toEqual(['a', 'c'])
  })
})
