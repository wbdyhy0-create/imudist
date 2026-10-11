import { describe, expect, it } from 'vitest'
import { placedFromXml } from './importXml'
import { ImportError } from './importText'

const total = (runs: { len: number }[]) => runs.reduce((sum, run) => sum + run.len, 0)

describe('XML import', () => {
  it('makes a paragraph of every element that holds text, and names its style by the tag', () => {
    const placed = placedFromXml(
      'book.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<book>
  <title>כותרת הספר</title>
  <chapter>
    <heading>פרק א</heading>
    <para>הפסקה הראשונה.</para>
    <para>הפסקה השנייה.</para>
  </chapter>
</book>`,
    )
    expect(placed.text).toBe('כותרת הספר\nפרק א\nהפסקה הראשונה.\nהפסקה השנייה.')
    expect(placed.paragraphStyleNames).toEqual(['title', 'heading', 'para', 'para'])
    expect(placed.paragraphStyles?.map((style) => style.name)).toEqual(['title', 'heading', 'para'])
    expect(placed.paragraphStyleIds).toEqual(['xml:title', 'xml:heading', 'xml:para', 'xml:para'])
    expect(placed.style.align).toBe('right')
    expect(total(placed.runs)).toBe(placed.text.length)
  })

  it('keeps bold and italic inside a paragraph, splits at <br/> and decodes entities', () => {
    const placed = placedFromXml('a.xml', '<doc><p>one <b>two</b> and <em>three</em><br/>four &amp; five&#33;</p></doc>')
    expect(placed.text).toBe('one two and three\nfour & five!')
    expect(placed.paragraphStyleNames).toEqual(['p', 'p'])
    const weights = placed.runs.map((run) => [run.len, run.style.weight, run.style.italic])
    expect(weights).toEqual([
      [4, 400, false],
      [3, 700, false],
      [5, 400, false],
      [5, 400, true],
      [13, 400, false], // the line end and the second paragraph have the same style, so they are one run
    ])
    expect(total(placed.runs)).toBe(placed.text.length)
  })

  it('treats a paragraph that is only inline tags as that paragraph, not as the tag', () => {
    const placed = placedFromXml('a.xml', '<doc><p><b>All bold</b></p></doc>')
    expect(placed.paragraphStyleNames).toEqual(['p'])
    expect(placed.runs[0].style.weight).toBe(700)
  })

  it('ignores indentation, comments, attributes and a document type', () => {
    const placed = placedFromXml(
      'a.xml',
      `<!DOCTYPE note SYSTEM "note.dtd">
<note id="7">
  <!-- not text -->
  <to lang="he">  Dan
     Cohen </to>
  <empty/>
</note>`,
    )
    expect(placed.text).toBe('Dan Cohen')
    expect(placed.style.align).toBe('left')
  })

  it('refuses files that cannot be read', () => {
    expect(() => placedFromXml('a.xml', '<a><b></a>')).toThrow(ImportError)
    expect(() => placedFromXml('a.xml', '<a>   <b/> </a>')).toThrow('לא נמצא טקסט')
    expect(() => placedFromXml('a.xml', '<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>')).toThrow('ENTITY')
  })
})
