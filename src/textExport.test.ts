import { describe, expect, it } from 'vitest'
import { defaultDocSettings, type TextFrame } from './document'
import { encodeText, exportText } from './textExport'
import type { ExportContent } from './pdfExport'

const style = { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }

function frame(id: string, text: string, extra: Partial<TextFrame> = {}): TextFrame {
  return { ...style, id, align: 'right', x: 0, y: 0, w: 200, h: 100, text, runs: [{ len: text.length, style }], next: null, ...extra } as TextFrame
}

const contentOf = (frames: TextFrame[]) => ({ doc: defaultDocSettings('t'), frames, images: [], shapes: [], assets: {}, paragraphStyles: [], sections: [] }) as unknown as ExportContent

describe('exportText', () => {
  it('joins a thread into one story, in reading order', () => {
    const a = frame('a', 'שלום\nעולם', { next: 'b' })
    const b = frame('b', '', { y: 300 })
    const c = frame('c', 'second', { y: 500 })
    const result = exportText(contentOf([c, b, a]), 'txt')
    expect(result.stories).toBe(2)
    expect(result.content).toBe('\u200fשלום\n\u200fעולם\n\nsecond')
  })

  it('writes bold, italic and footnotes into HTML', () => {
    const text = 'abc def'
    const f = frame('a', text, { runs: [{ len: 4, style }, { len: 3, style: { ...style, weight: 700, italic: true } }], footnotes: [{ id: 'n', anchor: 3, content: 'note <1>' }] })
    const html = exportText(contentOf([f]), 'html', { title: 'T' }).content
    expect(html).toContain('<i><b>def</b></i>')
    expect(html).toContain('<sup><a href="#fn1"')
    expect(html).toContain('note &lt;1&gt;')
  })

  it('escapes Hebrew as RTF unicode and uses the selection only', () => {
    const rtf = exportText(contentOf([frame('a', 'שא'), frame('b', 'other')]), 'rtf', { ids: ['a'] })
    expect(rtf.content).toContain('\\u1513?\\u1488?')
    expect(rtf.content).not.toContain('other')
    expect(rtf.content.startsWith('{\\rtf1')).toBe(true)
  })

  it('skips hidden frames', () => {
    expect(exportText(contentOf([frame('a', 'x', { hidden: true })]), 'txt').stories).toBe(0)
  })

  it('marks Arabic text with the Arabic character set and language in RTF', () => {
    const rtf = exportText(contentOf([frame('a', 'مرحبا')]), 'rtf').content
    expect(rtf).toContain('\\fcharset178')
    expect(rtf).toContain('\\alang1025')
    expect(exportText(contentOf([frame('a', 'שלום')]), 'rtf').content).toContain('\\fcharset177')
  })

  it('marks Hebrew paragraphs as right-to-left in plain text', () => {
    expect(exportText(contentOf([frame('a', 'שלום\nabc')]), 'txt').content).toBe('\u200fשלום\nabc')
  })

  it('encodes in UTF-8, UTF-16 and the Hebrew code page', () => {
    expect([...encodeText('א', 'utf-8')]).toEqual([0xef, 0xbb, 0xbf, 0xd7, 0x90])
    expect([...encodeText('aא', 'utf-16')]).toEqual([0xff, 0xfe, 0x61, 0x00, 0xd0, 0x05])
    expect([...encodeText('aא€☺', 'windows-1255')]).toEqual([0x61, 0xe0, 0x80, 0x3f])
  })
})