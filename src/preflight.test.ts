import { describe, expect, it } from 'vitest'
import type { ImageFrame, TextFrame } from './document'
import { runPreflight, summarizePreflight, type PreflightInput } from './preflight'
import type { FrameFlow } from './textLayout'

const A4 = { x: 0, y: 0, w: 600, h: 800 }
const spread = [A4, { x: 600, y: 0, w: 600, h: 800 }]

const frame = (over: Partial<TextFrame> & { id: string }): TextFrame =>
  ({ x: 50, y: 50, w: 500, h: 700, text: '', fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, color: '#000', align: 'right', next: null, ...over }) as unknown as TextFrame

const flow = (over: Partial<FrameFlow>): FrameFlow =>
  ({ start: 0, end: 0, story: '', slice: 'text', overflow: false, footnoteOverflowItems: [], ...over }) as unknown as FrameFlow

const image = (over: Partial<ImageFrame> & { id: string }): ImageFrame => ({ x: 100, y: 100, w: 200, h: 200, assetId: 'a1', fit: 'fill', ...over }) as unknown as ImageFrame

function input(over: Partial<PreflightInput> = {}): PreflightInput {
  return {
    doc: { bleed: { top: 0, bottom: 0, left: 0, right: 0 } },
    frames: [],
    images: [],
    shapes: [],
    assets: { a1: { name: 'a', mime: 'image/png', dataUrl: 'data:', width: 1, height: 1 } },
    flows: new Map(),
    pageRects: [A4],
    isFontAvailable: () => true,
    ...over,
  }
}

describe('runPreflight', () => {
  it('finds nothing in a document that is fine', () => {
    const f = frame({ id: 'f1' })
    expect(runPreflight(input({ frames: [f], flows: new Map([['f1', flow({})]]) }))).toEqual([])
  })

  it('reports the text that does not fit, on the last frame of its story', () => {
    const f = frame({ id: 'f1' })
    const issues = runPreflight(input({ frames: [f], flows: new Map([['f1', flow({ overflow: true, end: 100, story: 'x'.repeat(350) })]]) }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'overset', severity: 'error', page: 0, target: { type: 'frame', id: 'f1' } })
    expect(issues[0].detail).toContain('250')
  })

  it('reports notes that have no room, only on the last frame of the story', () => {
    const first = frame({ id: 'f1', next: 'f2' })
    const last = frame({ id: 'f2' })
    const items = [{}, {}] as FrameFlow['footnoteOverflowItems']
    const issues = runPreflight(input({ frames: [first, last], flows: new Map([['f1', flow({ footnoteOverflowItems: items })], ['f2', flow({ footnoteOverflowItems: items })]]) }))
    expect(issues.map((i) => i.id)).toEqual(['footnote-overflow:f2'])
  })

  it('reports text running over the page edge as an error and a picture over it as a warning', () => {
    const f = frame({ id: 'f1', x: 100, w: 600 })
    const pic = image({ id: 'i1', x: -40, y: 10 })
    const issues = runPreflight(input({ frames: [f], images: [pic], flows: new Map([['f1', flow({})]]) }))
    expect(issues.find((i) => i.id === 'crosses-page:f1')).toMatchObject({ severity: 'error' })
    expect(issues.find((i) => i.id === 'crosses-page:i1')).toMatchObject({ severity: 'warning' })
    // errors come first
    expect(issues[0].severity).toBe('error')
  })

  it('lets a picture run into the bleed, and across the two pages of a spread', () => {
    const bleed = { top: 9, bottom: 9, left: 9, right: 9 }
    const bleeding = image({ id: 'i1', x: -8, y: -8, w: 616, h: 816 })
    const acrossSpread = image({ id: 'i2', x: 500, y: 100, w: 200, h: 200 })
    expect(runPreflight(input({ doc: { bleed }, images: [bleeding], pageRects: [A4] }))).toEqual([])
    expect(runPreflight(input({ images: [acrossSpread], pageRects: spread }))).toEqual([])
    // ...but not further than the bleed
    expect(runPreflight(input({ doc: { bleed }, images: [image({ id: 'i3', x: -20, w: 300 })], pageRects: [A4] })).map((i) => i.kind)).toEqual(['crosses-page'])
  })

  it('warns about an object that is wholly on the pasteboard', () => {
    const issues = runPreflight(input({ images: [image({ id: 'i1', x: 900, y: 100 })] }))
    expect(issues).toMatchObject([{ kind: 'outside-page', severity: 'warning', target: { type: 'image', id: 'i1' } }])
  })

  it('reports a picture whose file is not in the document', () => {
    const issues = runPreflight(input({ images: [image({ id: 'i1', assetId: 'gone' })] }))
    expect(issues).toMatchObject([{ kind: 'missing-image', severity: 'error' }])
  })

  it('reports a missing font once, however many places use it, where it is first used', () => {
    const f1 = frame({ id: 'f1', next: 'f2', text: 'abc def ghi jkl', runs: [{ len: 4, style: { fontFamily: 'Arial' } }, { len: 4, style: { fontFamily: 'Narkisim' } }, { len: 4, style: { fontFamily: 'Narkisim' } }, { len: 3, style: { fontFamily: 'Arial' } }] as TextFrame['runs'] })
    const f2 = frame({ id: 'f2' })
    const flows = new Map([['f1', flow({ start: 0, end: 8 })], ['f2', flow({ start: 8, end: 15 })]])
    const issues = runPreflight(input({ frames: [f1, f2], flows, isFontAvailable: (family) => family === 'Arial' }))
    expect(issues).toMatchObject([{ id: 'missing-font:Narkisim', kind: 'missing-font', target: { id: 'f1' } }])
    expect(issues[0].detail).toContain('2 מקומות')
  })

  it('does not report a font used only on blanks', () => {
    const f = frame({ id: 'f1', text: 'abc   ', runs: [{ len: 3, style: { fontFamily: 'Arial' } }, { len: 3, style: { fontFamily: 'Gone' } }] as TextFrame['runs'] })
    expect(runPreflight(input({ frames: [f], flows: new Map([['f1', flow({ end: 6 })]]), isFontAvailable: (family) => family === 'Arial' }))).toEqual([])
  })
})

describe('summarizePreflight', () => {
  it('counts errors and warnings apart', () => {
    const issues = runPreflight(input({ images: [image({ id: 'i1', assetId: 'gone' }), image({ id: 'i2', x: 900 })] }))
    expect(summarizePreflight(issues)).toEqual({ errors: 1, warnings: 1 })
  })
})
