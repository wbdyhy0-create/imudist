import { describe, expect, it } from 'vitest'
import { defaultDocSettings, EXTERNAL_PAGE_NUMBER_MARKER, INTERNAL_LETTER_PAGE_NUMBER_MARKER, INTERNAL_PAGE_NUMBER_MARKER, PAGE_NUMBER_MARKER, type DocSettings, type ParentPage, type TextFrame } from './document'
import { detachedParentContent, pageRects } from './pages'

const textFrame = (id: string, x: number, text: string): TextFrame => ({
  id,
  x,
  y: 20,
  w: 60,
  h: 20,
  text,
  runs: [],
  next: null,
  fontFamily: 'Arial',
  fontSize: 12,
  weight: 400,
  italic: false,
  tracking: 0,
  align: 'right',
  color: '#000000',
})

const parentOf = (doc: DocSettings, frames: TextFrame[]): ParentPage => ({ id: 'master', prefix: 'A', name: 'אב A', w: doc.width, h: doc.height, frames, images: [], shapes: [] })

let counter = 0
const newId = () => `copy-${++counter}`

describe('detaching pages from their parent page', () => {
  it('writes each automatic number out as that page\'s own text, instead of copying the marker', () => {
    const doc = { ...defaultDocSettings('t'), pages: 3, startPage: 5 }
    const parent = parentOf(doc, [textFrame('n', 10, `מספר ${PAGE_NUMBER_MARKER} · ${INTERNAL_PAGE_NUMBER_MARKER} · ${EXTERNAL_PAGE_NUMBER_MARKER} · ${INTERNAL_LETTER_PAGE_NUMBER_MARKER}`)])
    const out = detachedParentContent(doc, [parent], ['master', 'master', null], [1], [], [], [], [], [], newId)
    expect(out.frames).toHaveLength(1)
    // "document number" follows "numbering starts from" (5 + 1), the internal and external numbers are the position in the file
    expect(out.frames[0].text).toBe('מספר 6 · 2 · 2 · ב')
    expect(out.frames[0].x).toBe(pageRects(doc)[1].x + 10)
    expect(out.frames[0].id).toBe('copy-1')
    expect(out.frames[0]).not.toHaveProperty('parentShadowRef')
  })

  it('leaves out the pages that were not asked for, and the pages without a parent', () => {
    const doc = { ...defaultDocSettings('t'), pages: 3 }
    const parent = parentOf(doc, [textFrame('a', 10, 'x')])
    const out = detachedParentContent(doc, [parent], ['master', null, 'master'], [0, 1], [], [], [], [], [], newId)
    expect(out.frames.map((f) => f.y)).toEqual([pageRects(doc)[0].y + 20])
  })

  it('copies only the half of a facing parent that matches the side of the page', () => {
    const base = defaultDocSettings('t')
    const doc: DocSettings = { ...base, pages: 3, facingPages: true, perRow: 2 }
    // the parent of a facing document is a two-page spread: the left page at x = 0, the right page at x = width
    const parent = parentOf(doc, [textFrame('left', 10, 'שמאל'), textFrame('right', doc.width + 10, 'ימין')])
    const rects = pageRects(doc)
    // right-to-left binding: page 1 (odd) is the left-hand page, page 2 the right-hand one
    const first = detachedParentContent(doc, [parent], ['master', 'master', 'master'], [0], [], [], [], [], [], newId)
    expect(first.frames.map((f) => f.text)).toEqual(['שמאל'])
    expect(first.frames[0].x).toBe(rects[0].x + 10)
    const second = detachedParentContent(doc, [parent], ['master', 'master', 'master'], [1], [], [], [], [], [], newId)
    expect(second.frames.map((f) => f.text)).toEqual(['ימין'])
    expect(second.frames[0].x).toBe(rects[1].x + 10)
  })
})
