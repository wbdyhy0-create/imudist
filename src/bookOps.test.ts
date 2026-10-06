import { describe, expect, it } from 'vitest'
import { syncText, withStartPage } from './bookOps'
import { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

function content(over: Partial<DocContent> = {}): DocContent {
  return { doc: { ...defaultDocSettings('פרק'), pages: 3 }, frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, characterStyles: [], parents: [], pageParents: [], sections: [], parentOverrides: [], colorSamples: [], ...over }
}

describe('withStartPage', () => {
  it('changes the first page number and nothing else', () => {
    const text = serializeDocument(content())
    const next = withStartPage(text, 17)!
    expect(JSON.parse(next).settings.startPage).toBe(17)
    expect(parseDocument(next, 'פרק').doc).toEqual({ ...parseDocument(text, 'פרק').doc, startPage: 17 })
  })

  it('gives null where the file already has that number', () => {
    expect(withStartPage(serializeDocument(content()), 1)).toBeNull()
  })
})

describe('syncText', () => {
  const master = { paragraphStyles: [{ id: 'm', name: 'גוף הטקסט', patch: { fontSize: 22 } }, { id: 'n', name: 'ציטוט', patch: { italic: true } }], characterStyles: [], colorSamples: [{ id: 's', color: '#abcdef', label: 'תכלת' }] }

  it('writes the master’s styles into a document file', () => {
    const { text, report } = syncText(serializeDocument(content()), master, 'פרק')
    expect(report).toMatchObject({ addedParagraph: ['ציטוט'], updatedParagraph: ['גוף הטקסט'], addedColors: ['תכלת'] })
    const synced = parseDocument(text!, 'פרק')
    expect(synced.paragraphStyles.find((style) => style.name === 'גוף הטקסט')?.patch.fontSize).toBe(22)
    expect(synced.paragraphStyles.some((style) => style.name === 'ציטוט')).toBe(true)
    expect(synced.paragraphStyles.some((style) => style.name === 'כותרת')).toBe(true)
    expect(synced.colorSamples?.map((sample) => sample.color)).toEqual(['#ABCDEF'])
  })

  it('leaves a file that is already in line without a new text', () => {
    const first = syncText(serializeDocument(content()), master, 'פרק').text!
    expect(syncText(first, master, 'פרק').text).toBeNull()
  })
})
