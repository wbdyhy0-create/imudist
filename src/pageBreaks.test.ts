import { describe, expect, it } from 'vitest'
import type { ParagraphStyleRecord } from './document'
import { cutAtPageBreak, pageBreakStarts } from './pageBreaks'

const style = (id: string, patch: ParagraphStyleRecord['patch'] = {}, basedOnId?: string): ParagraphStyleRecord => ({ id, name: id, patch, ...(basedOnId ? { basedOnId } : {}) })

describe('paragraphs that start on a new page', () => {
  const styles = [style('body'), style('chapter', { pageBreakBefore: true }), style('chapter-sub', {}, 'chapter')]

  it('are found by the style of each paragraph, the first paragraph of the story left out', () => {
    const head = { text: 'Chapter\nbody one\nChapter two\nbody two\nsub', paragraphStyleIds: ['chapter', 'body', 'chapter', 'body', 'chapter-sub'] }
    expect(pageBreakStarts(head, styles)).toEqual(['Chapter\nbody one\n'.length, 'Chapter\nbody one\nChapter two\nbody two\n'.length])
  })

  it('follow a style that is based on one that starts on a new page', () => {
    const head = { text: 'a\nb', paragraphStyleIds: ['body', 'chapter-sub'] }
    expect(pageBreakStarts(head, styles)).toEqual([2])
  })

  it('are none when no style asks for it', () => {
    expect(pageBreakStarts({ text: 'a\nb', paragraphStyleIds: ['body', 'body'] }, [style('body')])).toEqual([])
  })

  it('cut a frame before the paragraph that must begin a frame, and only inside the frame', () => {
    expect(cutAtPageBreak([10, 40], 0, 30)).toBe(10)
    expect(cutAtPageBreak([10, 40], 10, 30)).toBe(30)
    expect(cutAtPageBreak([10, 40], 10, 50)).toBe(40)
    expect(cutAtPageBreak([], 0, 30)).toBe(30)
  })
})
