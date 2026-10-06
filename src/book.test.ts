import { describe, expect, it } from 'vitest'
import { BookFormatError, computeBookNumbering, dirnameOf, isChapterPath, joinPath, newBook, normalizePath, parseBook, readChapterInfo, relativePath, serializeBook } from './book'

describe('paths', () => {
  it('normalizes separators, dots and trailing slashes', () => {
    expect(normalizePath('a\\b\\c.imudist')).toBe('a/b/c.imudist')
    expect(normalizePath('./a//b/./c/')).toBe('a/b/c')
    expect(normalizePath('a/b/../c')).toBe('a/c')
    expect(normalizePath('../a')).toBe('../a')
    expect(normalizePath('D:\\Books\\x.imubook')).toBe('D:/Books/x.imubook')
  })

  it('finds the folder and joins onto it', () => {
    expect(dirnameOf('D:\\Books\\x.imubook')).toBe('D:/Books')
    expect(dirnameOf('x.imubook')).toBe('')
    expect(joinPath('D:/Books', 'ch/1.imudist')).toBe('D:/Books/ch/1.imudist')
    expect(joinPath('', 'ch/1.imudist')).toBe('ch/1.imudist')
  })

  it('writes a file as a path from a folder', () => {
    expect(relativePath('D:/Books', 'D:/Books/ch/1.imudist')).toBe('ch/1.imudist')
    expect(relativePath('D:/Books/ver1', 'D:/Books/other/2.imudist')).toBe('../other/2.imudist')
    expect(relativePath('D:/Books', 'd:/books/3.imudist')).toBe('3.imudist')
  })

  it('accepts only paths from the book file, not absolute ones', () => {
    expect(isChapterPath('ch/1.imudist')).toBe(true)
    expect(isChapterPath('../1.imudist')).toBe(true)
    expect(isChapterPath('D:\\x\\1.imudist')).toBe(false)
    expect(isChapterPath('/etc/1.imudist')).toBe(false)
    expect(isChapterPath('')).toBe(false)
  })
})

describe('the book file', () => {
  it('is written and read back the same', () => {
    const book = { ...newBook('שמות'), chapters: [{ id: 'a', path: 'ch/1.imudist' }, { id: 'b', path: 'ch/2.imudist' }] }
    book.settings = { startPage: 5, chapterStart: 'odd', styleSourceId: 'a' }
    expect(parseBook(serializeBook(book))).toEqual(book)
  })

  it('refuses what is not a book', () => {
    expect(() => parseBook('not json')).toThrow(BookFormatError)
    expect(() => parseBook('{"format":"imudist"}')).toThrow(BookFormatError)
    expect(() => parseBook('{"format":"imubook","version":2}')).toThrow(/חדשה/)
  })

  it('leaves out chapters it cannot use, gives repeated ids new ones and drops a style source that is gone', () => {
    const book = parseBook(JSON.stringify({ format: 'imubook', version: 1, title: 'x', settings: { startPage: 'x', chapterStart: 'sideways', styleSourceId: 'gone' }, chapters: [{ id: 'a', path: 'a.imudist' }, { id: 'a', path: 'b\\c.imudist' }, { id: 'c', path: 'D:\\abs.imudist' }, { id: 'd' }, null] }))
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0].id).toBe('a')
    expect(book.chapters[1].id).not.toBe('a')
    expect(book.chapters[1].path).toBe('b/c.imudist')
    expect(book.settings).toEqual({ startPage: 1, chapterStart: 'any', styleSourceId: null })
  })
})

describe('readChapterInfo', () => {
  it('reads the name and the pages from the settings', () => {
    expect(readChapterInfo(JSON.stringify({ format: 'imudist', version: 2, settings: { name: 'פרק א', pages: 12, startPage: 3 }, frames: [] }))).toEqual({ name: 'פרק א', pages: 12, startPage: 3 })
  })

  it('refuses a file that is not a document', () => {
    expect(() => readChapterInfo('{"format":"imubook"}')).toThrow(BookFormatError)
    expect(() => readChapterInfo(JSON.stringify({ format: 'imudist', settings: { pages: 'many' } }))).toThrow(BookFormatError)
  })
})

describe('computeBookNumbering', () => {
  const ids = (pages: (number | null)[]) => pages.map((p, i) => ({ id: `c${i}`, pages: p }))

  it('numbers the chapters one after the other', () => {
    const result = computeBookNumbering(ids([10, 4, 6]), { startPage: 1, chapterStart: 'any' })
    expect(result.chapters.map((c) => [c.startPage, c.endPage])).toEqual([[1, 10], [11, 14], [15, 20]])
    expect(result.totalPages).toBe(20)
    expect(result.complete).toBe(true)
  })

  it('starts from the first page number the book is given', () => {
    const result = computeBookNumbering(ids([3, 3]), { startPage: 7, chapterStart: 'any' })
    expect(result.chapters.map((c) => c.startPage)).toEqual([7, 10])
  })

  it('skips a page where a chapter has to begin on an odd page', () => {
    const result = computeBookNumbering(ids([4, 3, 5]), { startPage: 1, chapterStart: 'odd' })
    // 1-4, then 5 is odd: 5-7, then 8 is even: skip to 9
    expect(result.chapters.map((c) => [c.startPage, c.endPage, c.skipped])).toEqual([[1, 4, 0], [5, 7, 0], [9, 13, 1]])
    expect(result.totalPages).toBe(13)
  })

  it('skips for an even page, and never moves the first chapter', () => {
    const result = computeBookNumbering(ids([2, 2]), { startPage: 1, chapterStart: 'even' })
    expect(result.chapters.map((c) => [c.startPage, c.skipped])).toEqual([[1, 0], [4, 1]])
  })

  it('leaves the chapters after one that is missing without numbers', () => {
    const result = computeBookNumbering(ids([5, null, 4]), { startPage: 1, chapterStart: 'any' })
    expect(result.chapters.map((c) => c.startPage)).toEqual([1, 6, null])
    expect(result.chapters[1].endPage).toBeNull()
    expect(result.complete).toBe(false)
    expect(result.totalPages).toBe(9)
  })

  it('gives an empty book no pages', () => {
    expect(computeBookNumbering([], { startPage: 1, chapterStart: 'any' })).toEqual({ chapters: [], totalPages: 0, complete: true })
  })
})
