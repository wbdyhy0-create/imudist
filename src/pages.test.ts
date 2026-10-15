import { describe, expect, it } from 'vitest'
import { defaultDocSettings, EXTERNAL_PAGE_NUMBER_MARKER, INTERNAL_LETTER_PAGE_NUMBER_MARKER, INTERNAL_PAGE_NUMBER_MARKER, PAGE_NUMBER_MARKER, RUNNING_HEADER_MARKER, type DocSettings, type ParentPage, type TextFrame } from './document'
import { applySettings, deletePages, detachedParentContent, insertPages, movePage, pageRects, parentShadowContent, runningHeaderLookup, withMasterOnAddedPages, type DocContent } from './pages'

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

describe('running headers', () => {
  // one story over three pages: 'H1' on page 1, 'body' 'A' 'B' on page 2, 'body' on page 3
  const doc = { ...defaultDocSettings('t'), pages: 3 }
  const rects = pageRects(doc)
  const story = 'H1\nbody\nA\nB\nbody'
  // every frame sits on its own page (the pages are stacked, so a frame's page is told by its y)
  const onPage = (page: number, frame: TextFrame): TextFrame => ({ ...frame, x: rects[page].x + 10, y: rects[page].y + 20 })
  const head = { ...onPage(0, textFrame('a', 0, story)), paragraphStyleIds: ['s1', 'x', 's1', 's1', 's2'], next: 'b' }
  const second = { ...onPage(1, textFrame('b', 0, '')), next: 'c' }
  const third = onPage(2, textFrame('c', 0, ''))
  const frames = [head, second, third]
  const flows = new Map([
    ['a', { start: 0, end: 3 }],
    ['b', { start: 3, end: 12 }],
    ['c', { start: 12, end: 16 }],
  ])
  const styles = ['s1', 's2', 'x'].map((id) => ({ id, name: id, patch: {} }))
  const lookup = runningHeaderLookup(doc, frames, flows, styles)

  it('shows the last paragraph of the style up to the page, or the first one on it', () => {
    expect([0, 1, 2].map((page) => lookup(page, 's1', 'last'))).toEqual(['H1', 'B', 'B'])
    expect([0, 1, 2].map((page) => lookup(page, 's1', 'first'))).toEqual(['H1', 'A', 'B'])
  })

  it('is empty before the first paragraph of the style, and for a style nothing has', () => {
    expect([0, 1, 2].map((page) => lookup(page, 's2', 'last'))).toEqual(['', '', 'body'])
    expect(lookup(1, 'none', 'last')).toBe('')
  })

  it('puts the right text on each page of a parent that has a running header', () => {
    const header = { ...textFrame('h', 10, RUNNING_HEADER_MARKER), runningHeaderStyleId: 's1', runningHeaderStrategy: 'first' as const }
    const parent = parentOf(doc, [header])
    const shown = parentShadowContent(doc, [parent], ['master', 'master', 'master'], [], frames, lookup)
    expect(shown.frames.map((f) => f.text)).toEqual(['H1', 'A', 'B'])
  })

  it('counts a paragraph with no style of its own in the story\'s style, or the base style', () => {
    const plain = { ...onPage(0, textFrame('p', 0, 'one\ntwo')) }
    const flow = new Map([['p', { start: 0, end: 7 }]])
    expect(runningHeaderLookup(doc, [plain], flow, styles)(0, 's1', 'last')).toBe('two')
    expect(runningHeaderLookup(doc, [{ ...plain, paragraphStyleId: 's2' }], flow, styles)(0, 's2', 'first')).toBe('one')
    expect(runningHeaderLookup(doc, [{ ...plain, paragraphStyleId: 's2' }], flow, styles)(0, 's1', 'first')).toBe('')
  })

  it('leaves the header empty when it is not told where the text lies', () => {
    const header = { ...textFrame('h', 10, RUNNING_HEADER_MARKER), runningHeaderStyleId: 's1' }
    const shown = parentShadowContent(doc, [parentOf(doc, [header])], ['master', 'master', 'master'], [], frames)
    expect(shown.frames.map((f) => f.text)).toEqual(['', '', ''])
  })
})

describe('page operations', () => {
  it('keep what is not tied to a page: layer order, character styles, colour samples', () => {
    const doc = { ...defaultDocSettings('t'), pages: 3 }
    const content: DocContent = {
      doc,
      layerOrder: ['layer-2', 'layer-1'],
      frames: [],
      images: [],
      assets: {},
      guides: [],
      shapes: [],
      paragraphStyles: [],
      characterStyles: [{ id: 'cs', name: 'x', patch: {} } as never],
      parents: [],
      pageParents: [],
      sections: [],
      parentOverrides: [],
      colorSamples: [{ id: 'c', color: '#ffffff' } as never],
    }
    const results = {
      insert: insertPages(content, 1, 1),
      remove: deletePages(content, [1]),
      move: movePage(content, 0, 2),
      setup: applySettings(content, { ...doc, pages: 4 }),
    }
    for (const [name, result] of Object.entries(results)) {
      expect(result, name).not.toBeNull()
      expect(result!.layerOrder, name).toEqual(['layer-2', 'layer-1'])
      expect(result!.characterStyles, name).toEqual(content.characterStyles)
      expect(result!.colorSamples, name).toEqual(content.colorSamples)
    }
  })

  it('gives pages added by a change of settings the master of the page before them', () => {
    const doc = { ...defaultDocSettings('t'), pages: 2 }
    const parent = parentOf(doc, [])
    const content: DocContent = { doc, frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: [], parents: [parent], pageParents: ['master', null], sections: [], parentOverrides: [] }
    const grown = withMasterOnAddedPages(content, applySettings(content, { ...doc, pages: 4 })!)
    expect(grown.pageParents).toEqual(['master', null, 'master', 'master'])
    expect(withMasterOnAddedPages({ ...content, parents: [] }, { ...content, doc: { ...doc, pages: 3 }, parents: [] }).pageParents).toEqual(['master', null])
  })
})
