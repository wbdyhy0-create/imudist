import { describe, expect, it } from 'vitest'
import type { AnchoredObject, CharStyle, Run, TextFrame } from './document'
import { ANCHOR_MARKER, DEFAULT_TEXT_STYLE, defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { anchorRunCss, isAnchorRun } from './richtext'
import { editStory, mergeRuns } from './story'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const look = (extra: Partial<CharStyle> = {}): CharStyle => ({ fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: 14, weight: 400, italic: false, tracking: 0, ...extra })
const anchor: AnchoredObject = { id: 'a1', src: PNG, w: 40, h: 20 }

describe('an anchored object in a story', () => {
  const text = `one ${ANCHOR_MARKER} two`
  const runs: Run[] = [
    { len: 4, style: look() },
    { len: 1, style: look({ anchor }) },
    { len: 4, style: look() },
  ]

  it('is a run of its own: neighbours with the same look are not merged into it', () => {
    expect(mergeRuns(runs)).toHaveLength(3)
    // two different objects side by side stay two runs, the same object (a copy) joins
    expect(mergeRuns([{ len: 1, style: look({ anchor }) }, { len: 1, style: look({ anchor: { ...anchor, id: 'a2' } }) }])).toHaveLength(2)
    expect(mergeRuns([{ len: 1, style: look({ anchor }) }, { len: 1, style: look({ anchor }) }])).toHaveLength(1)
  })

  it('is not carried by the text that is typed right after it', () => {
    const typed = editStory(text, runs, 5, 5, 'x', look())
    expect(typed.text).toBe(`one ${ANCHOR_MARKER}x two`)
    // the anchor is still one character, the typed one has none
    const flags = typed.runs.flatMap((run) => Array.from({ length: run.len }, () => !!run.style.anchor))
    expect(flags.filter(Boolean)).toHaveLength(1)
    expect(flags[4]).toBe(true)
    expect(flags[5]).toBe(false)
  })

  it('is drawn as a box only when the run is nothing but the marker', () => {
    expect(isAnchorRun(look({ anchor }), ANCHOR_MARKER)).toBe(true)
    expect(isAnchorRun(look({ anchor }), `${ANCHOR_MARKER}x`)).toBe(false)
    expect(isAnchorRun(look(), ANCHOR_MARKER)).toBe(false)
    const css = anchorRunCss(look({ anchor }), 2)
    expect(css.width).toBe('80px')
    expect(css.height).toBe('40px')
    expect(css.overflow).toBe('hidden')
    expect(css.verticalAlign).toBe('baseline')
    // hanging below the line: the bottom handles lower it
    expect(anchorRunCss(look({ anchor: { ...anchor, offset: 6 } }), 2).verticalAlign).toBe('-12px')
  })
})

describe('an anchored object in the file', () => {
  const contentWith = (style: Record<string, unknown>): DocContent => {
    const frame = {
      ...DEFAULT_TEXT_STYLE,
      id: 'f',
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      text: `ab${ANCHOR_MARKER}cd`,
      runs: [{ len: 2, style: look() }, { len: 1, style: { ...look(), anchor: style } }, { len: 2, style: look() }],
      next: null,
    } as unknown as TextFrame
    return { doc: defaultDocSettings('anchors'), frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: [], parents: [], pageParents: [], sections: [] }
  }
  const reopened = (style: Record<string, unknown>) => parseDocument(serializeDocument(contentWith(style)), 'anchors.imudist').frames[0]

  it('comes back with its picture and its size', () => {
    const frame = reopened({ ...anchor })
    const run = frame.runs?.find((candidate) => candidate.style.anchor)
    expect(run?.style.anchor).toMatchObject({ id: 'a1', src: PNG, w: 40, h: 20 })
    expect(frame.text).toBe(`ab${ANCHOR_MARKER}cd`)
  })

  it('keeps how far below the baseline it hangs', () => {
    const run = reopened({ ...anchor, offset: 7.5 }).runs?.find((candidate) => candidate.style.anchor)
    expect(run?.style.anchor?.offset).toBe(7.5)
    expect(reopened({ ...anchor }).runs?.find((candidate) => candidate.style.anchor)?.style.anchor).not.toHaveProperty('offset')
  })

  it('is dropped when its picture is not an image data URL, or its size is empty', () => {
    for (const bad of [{ ...anchor, src: 'https://example.com/a.png' }, { ...anchor, src: 'javascript:alert(1)' }, { ...anchor, w: 0 }, { ...anchor, id: '' }]) {
      const frame = reopened(bad)
      expect(frame.runs?.some((run) => run.style.anchor)).toBe(false)
    }
  })
})
