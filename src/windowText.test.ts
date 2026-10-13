import { describe, expect, it } from 'vitest'
import { spliceParagraphStyles } from './story'
import { defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { openingRange, windowRuleOf } from './windowText'

describe('openingRange', () => {
  const text = 'בראשית ברא אלהים את השמים'

  it('ends after the requested number of words and says where the next word begins', () => {
    expect(openingRange(text, 0, text.length, 1)).toEqual({ start: 0, end: 6, next: 7 })
    expect(openingRange(text, 0, text.length, 2)).toEqual({ start: 0, end: 10, next: 11 })
  })

  it('skips white space before the first word', () => {
    expect(openingRange('  אב גד', 0, 7, 1)).toEqual({ start: 2, end: 4, next: 5 })
  })

  it('works inside a longer story: only the paragraph [from, to)', () => {
    const story = 'ראשונה\nשנייה מילים נוספות'
    expect(openingRange(story, 7, story.length, 2)).toEqual({ start: 7, end: 18, next: 19 })
  })

  it('stops at the end of a short paragraph, with no next word', () => {
    expect(openingRange('אב גד', 0, 5, 4)).toEqual({ start: 0, end: 5, next: -1 })
  })

  it('has nothing to open when the paragraph is empty', () => {
    expect(openingRange('', 0, 0, 1)).toBeNull()
    expect(openingRange('אב   גד', 0, 7, 1)).toEqual({ start: 0, end: 2, next: 5 })
    expect(openingRange('   ', 0, 3, 1)).toBeNull()
  })
})

describe('a window and Enter', () => {
  it('stays with the paragraph it was made for - the paragraph split off does not inherit it', () => {
    const lists = { paragraphStylePatches: [{ leading: 20 }, { windowIndent: 40, leading: 20 }, { leading: 20 }] }
    const out = spliceParagraphStyles(lists, 'א\nבבב\nג', 4, 4, '\n')
    expect(out.paragraphStylePatches).toEqual([{ leading: 20 }, { windowIndent: 40, leading: 20 }, { leading: 20 }, { leading: 20 }])
  })

  it('still copies every other setting of the paragraph it was split from', () => {
    const lists = { paragraphStylePatches: [{ leading: 14, align: 'justify' as const, windowIndent: 10 }] }
    const out = spliceParagraphStyles(lists, 'אבג', 1, 1, '\n')
    expect(out.paragraphStylePatches).toEqual([{ leading: 14, align: 'justify', windowIndent: 10 }, { leading: 14, align: 'justify' }])
  })
})

describe('a window built into a paragraph style', () => {
  const styles = [
    { id: 'body', name: 'Body' },
    { id: 'lead', name: 'Lead', basedOnId: 'body', window: { words: 2, minLines: 4, openingStyleId: 'big' } },
    { id: 'lead-note', name: 'Lead note', basedOnId: 'lead' },
    { id: 'plain', name: 'Plain', basedOnId: 'body' },
  ]

  it('is the own rule of the style, or the nearest one of the styles it is based on', () => {
    expect(windowRuleOf(styles, 'lead')).toEqual({ words: 2, minLines: 4, openingStyleId: 'big' })
    expect(windowRuleOf(styles, 'lead-note')).toEqual({ words: 2, minLines: 4, openingStyleId: 'big' })
    expect(windowRuleOf(styles, 'plain')).toBeNull()
    expect(windowRuleOf(styles, 'missing')).toBeNull()
  })

  it('does not loop on styles based on each other', () => {
    expect(windowRuleOf([{ id: 'a', basedOnId: 'b' }, { id: 'b', basedOnId: 'a' }], 'a')).toBeNull()
  })

  const contentWith = (paragraphStyles: Record<string, unknown>[]): DocContent =>
    ({ doc: defaultDocSettings('w'), frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles, parents: [], pageParents: [], sections: [] }) as unknown as DocContent

  it('is kept in the file, bounded to what the dialog offers', () => {
    const reopened = parseDocument(serializeDocument(contentWith([
      { id: 'body', name: 'Body', patch: {} },
      { id: 'lead', name: 'Lead', patch: {}, window: { words: 9, minLines: 7, openingStyleId: 'body' } },
      { id: 'gone', name: 'Gone', patch: {}, window: { words: 2, minLines: 3, openingStyleId: 'nothing' } },
    ])), 'w.imudist')
    const byId = new Map(reopened.paragraphStyles.map((style) => [style.id, style]))
    expect(byId.get('body')?.window).toBeUndefined()
    expect(byId.get('lead')?.window).toEqual({ words: 4, minLines: 4, openingStyleId: 'body' })
    // a style of the opening words that is no longer there is dropped rather than left dangling
    expect(byId.get('gone')?.window).toEqual({ words: 2, minLines: 3 })
  })
})
