import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STYLE, FOOTNOTE_MARKER, type TextFrame } from './document'
import { collectHits, compilePattern, DEFAULT_FIND_OPTIONS, findMatches, replaceInStory, type FindOptions } from './findReplace'

const matchesOf = (text: string, options: Partial<FindOptions>) => {
  const compiled = compilePattern({ ...DEFAULT_FIND_OPTIONS, ...options })
  if (!compiled || !compiled.ok) throw new Error('no pattern')
  return findMatches(text, compiled)
}

const frame = (text: string, extra: Partial<TextFrame> = {}): TextFrame => ({
  ...DEFAULT_TEXT_STYLE,
  id: 'a',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  text,
  runs: [{ len: text.length, style: { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 } }],
  next: null,
  ...extra,
})

describe('compilePattern', () => {
  it('has nothing to find for an empty pattern', () => {
    expect(compilePattern({ ...DEFAULT_FIND_OPTIONS, find: '' })).toBeNull()
  })

  it('reports an invalid regular expression instead of throwing', () => {
    expect(compilePattern({ ...DEFAULT_FIND_OPTIONS, find: '(', mode: 'regex' })).toEqual({ ok: false, error: 'ביטוי רגולרי לא תקין' })
  })
})

describe('findMatches', () => {
  it('finds a sign, a comma and a period literally - special characters of a regex are just characters', () => {
    expect(matchesOf('א.ב,ג.ד', { find: '.' }).map((m) => m.start)).toEqual([1, 5])
    expect(matchesOf('א.ב,ג.ד', { find: ',' }).map((m) => m.start)).toEqual([3])
    expect(matchesOf('50% ו-$5', { find: '$' }).map((m) => m.start)).toEqual([6])
  })

  it('ignores letter case unless asked not to', () => {
    expect(matchesOf('Abc abc ABC', { find: 'abc' })).toHaveLength(3)
    expect(matchesOf('Abc abc ABC', { find: 'abc', matchCase: true })).toHaveLength(1)
  })

  it('whole word: not inside a longer Hebrew word, vowel points included', () => {
    const text = 'את האת את, את'
    expect(matchesOf(text, { find: 'את' })).toHaveLength(4)
    expect(matchesOf(text, { find: 'את', wholeWord: true }).map((m) => m.start)).toEqual([0, 7, 11])
    expect(matchesOf('בְּרֵאשִׁית', { find: 'בראשית', wholeWord: true, ignoreNiqqud: true })).toHaveLength(1)
  })

  it('ignore vowel points: the match covers the points of its letters', () => {
    const text = 'בְּרֵאשִׁית בָּרָא'
    const found = matchesOf(text, { find: 'ברא', ignoreNiqqud: true })
    expect(found.map((m) => text.slice(m.start, m.end))).toEqual(['בְּרֵא', 'בָּרָא'])
    expect(matchesOf(text, { find: 'ברא' })).toHaveLength(0)
  })

  it('special mode: \\n is a paragraph break and \\t a tab', () => {
    expect(matchesOf('א\nב\tג', { find: '\\n', mode: 'special' }).map((m) => m.start)).toEqual([1])
    expect(matchesOf('א\nב\tג', { find: '\\t', mode: 'special', replace: '  ' })[0].replacement).toBe('  ')
  })

  it('regex mode: groups in the replacement, and ^ / $ per paragraph', () => {
    const [m] = matchesOf('שם: דוד', { find: '(\\S+): (\\S+)', mode: 'regex', replace: '$2 ($1)' })
    expect(m.replacement).toBe('דוד (שם)')
    expect(matchesOf('א\nב\nג', { find: '^.', mode: 'regex' }).map((x) => x.start)).toEqual([0, 2, 4])
  })

  it('skips an empty match, and anything touching a marker of the program', () => {
    expect(matchesOf('אב', { find: 'x*', mode: 'regex' })).toHaveLength(0)
    expect(matchesOf(`א${FOOTNOTE_MARKER}ב`, { find: '.', mode: 'regex' }).map((m) => m.start)).toEqual([0, 2])
  })
})

describe('replaceInStory', () => {
  it('deletes and replaces every match with the look of the text around it, offsets staying right', () => {
    const bold = { fontFamily: 'Arial', fontSize: 12, weight: 700, italic: false, tracking: 0 }
    const regular = { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }
    const f = frame('%אב, %גד', { runs: [{ len: 3, style: bold }, { len: 5, style: regular }] })
    const out = replaceInStory(f, matchesOf(f.text, { find: '%' }))
    expect(out.text).toBe('אב, גד')
    expect(out.runs.reduce((n, r) => n + r.len, 0)).toBe(out.text.length)
    expect(out.runs[0]).toEqual({ len: 2, style: bold })

    const swapped = replaceInStory(f, matchesOf(f.text, { find: ',', replace: '.' }))
    expect(swapped.text).toBe('%אב. %גד')
  })

  it('keeps paragraph styles lined up when a replacement adds or removes paragraph breaks', () => {
    const f = frame('א##ב\nג\nד', { paragraphStyleIds: ['one', 'two', 'three'] })
    const split = replaceInStory(f, matchesOf(f.text, { find: '##', mode: 'special', replace: '\\n' }))
    expect(split.text).toBe('א\nב\nג\nד')
    expect(split.paragraphStyleIds).toEqual(['one', 'one', 'two', 'three'])
    const joined = replaceInStory(split, matchesOf(split.text, { find: '\\n', mode: 'special', replace: ' ' }))
    expect(joined.text).toBe('א ב ג ד')
    expect(joined.paragraphStyleIds).toHaveLength(1)
  })

  it('a replacement that keeps the paragraph count leaves every paragraph style where it was', () => {
    const f = frame('א,\nב,\nג,', { paragraphStyleIds: ['one', 'two', 'three'] })
    const out = replaceInStory(f, matchesOf(f.text, { find: ',', replace: '.' }))
    expect(out.text).toBe('א.\nב.\nג.')
    expect(out.paragraphStyleIds).toEqual(['one', 'two', 'three'])
  })

  it('moves footnote anchors with the text, and drops the note whose reference was replaced away', () => {
    const text = `אבג${FOOTNOTE_MARKER}דהו${FOOTNOTE_MARKER}`
    const notes = [
      { id: 'n1', anchor: 3, content: 'א', runs: [] },
      { id: 'n2', anchor: 7, content: 'ב', runs: [] },
    ]
    const f = frame(text, { footnotes: notes })
    const moved = replaceInStory(f, matchesOf(text, { find: 'אב', replace: 'xxxx' }))
    expect(moved.footnotes?.map((n) => n.anchor)).toEqual([5, 9])
    expect(moved.text[5]).toBe(FOOTNOTE_MARKER)
  })
})

describe('collectHits', () => {
  it('searches every story and the footnotes, leaves a generated table of contents alone, and honours a selection', () => {
    const compiled = compilePattern({ ...DEFAULT_FIND_OPTIONS, find: 'א' })
    if (!compiled || !compiled.ok) throw new Error('no pattern')
    const a = frame('אבא', { id: 'a', footnotes: [{ id: 'n', anchor: 0, content: 'דא', runs: [] }] })
    const b = frame('בגד', { id: 'b' })
    const toc = frame('אאא', { id: 'toc', tocPageReferences: [{ offset: 0, headId: 'a', id: 'x' }] as TextFrame['tocPageReferences'] })
    expect(collectHits([a, b, toc], compiled, { footnotes: true }).map((hit) => [hit.head.id, hit.matches.length, hit.notes.length])).toEqual([['a', 2, 1]])
    expect(collectHits([a, b, toc], compiled, { footnotes: false }).map((hit) => hit.notes.length)).toEqual([0])
    expect(collectHits([a, b], compiled, { footnotes: true, range: { headId: 'a', a: 0, b: 2 } }).map((hit) => hit.matches.length)).toEqual([1])
  })
})
