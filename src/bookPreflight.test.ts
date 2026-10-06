import { describe, expect, it } from 'vitest'
import { emptyReport } from './bookStyles'
import { bookLevelIssues, countBookCheck, countChapter, type BookCheck } from './bookPreflight'
import type { PreflightIssue } from './preflight'

const issue = (id: string, severity: 'error' | 'warning'): PreflightIssue => ({ id, kind: 'overset', severity, title: 't', detail: 'd', page: 0, target: null })

describe('bookLevelIssues', () => {
  const chapters = [{ id: 'a', title: 'בראשית' }, { id: 'b', title: 'שמות' }, { id: 'c', title: 'ויקרא' }]
  const numbering = [{ id: 'a', pages: 4, startPage: 1, endPage: 4, skipped: 0 }, { id: 'b', pages: 3, startPage: 5, endPage: 7, skipped: 0 }, { id: 'c', pages: 2, startPage: 8, endPage: 9, skipped: 0 }]

  it('finds nothing in a book that is in order', () => {
    const states = { a: { status: 'ok' as const, startPage: 1 }, b: { status: 'ok' as const, startPage: 5 }, c: { status: 'ok' as const, startPage: 8 } }
    expect(bookLevelIssues({ chapters, states, numbering, styleReports: { a: emptyReport(), b: emptyReport(), c: emptyReport() }, masterId: 'a' })).toEqual([])
  })

  it('reports a missing chapter as an error and does not look at its numbers', () => {
    const states = { a: { status: 'ok' as const, startPage: 1 }, b: { status: 'missing' as const, message: 'הקובץ לא נמצא' }, c: { status: 'ok' as const, startPage: 8 } }
    const found = bookLevelIssues({ chapters, states, numbering, styleReports: {}, masterId: null })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'chapter:b', severity: 'error', title: 'פרק חסר', chapterId: 'b' })
  })

  it('warns about a saved first page number that is not the book’s, and about styles that differ from the master', () => {
    const states = { a: { status: 'ok' as const, startPage: 1 }, b: { status: 'ok' as const, startPage: 1 }, c: { status: 'ok' as const, startPage: 8 } }
    const differing = { ...emptyReport(), updatedParagraph: ['גוף'], addedColors: ['אדום'] }
    const found = bookLevelIssues({ chapters, states, numbering, styleReports: { a: differing, c: differing }, masterId: 'a' })
    expect(found.map((i) => i.id)).toEqual(['numbering:b', 'styles:c'])
    expect(found[0].severity).toBe('warning')
    expect(found[1].detail).toContain('2')
  })
})

describe('counting a book check', () => {
  const check: BookCheck = {
    at: 0,
    chapters: [
      { chapterId: 'a', title: 'א', issues: [issue('1', 'error'), issue('2', 'warning')] },
      { chapterId: 'b', title: 'ב', issues: [], error: 'לא נקרא' },
    ],
    bookIssues: [{ id: 'x', severity: 'warning', title: '', detail: '', chapterId: 'a' }],
  }

  it('adds the chapters’ pages, the chapters that could not be read and the book’s own problems', () => {
    expect(countBookCheck(check)).toEqual({ errors: 2, warnings: 2 })
  })

  it('counts one chapter apart', () => {
    expect(countChapter(check, 'a')).toEqual({ errors: 1, warnings: 2 })
    expect(countChapter(check, 'b')).toEqual({ errors: 1, warnings: 0 })
  })
})
