import type { ChapterNumbering } from './book'
import type { SyncReport } from './bookStyles'
import { reportCount } from './bookStyles'
import type { PreflightIssue } from './preflight'

/** What the check found in one chapter (a chapter that could not be read has `error` and no issues). */
export interface ChapterCheck {
  chapterId: string
  title: string
  issues: PreflightIssue[]
  error?: string
}

/** A problem of the book as a whole, not of a page: a chapter that is missing, numbers or styles that are out of line. */
export interface BookIssue {
  id: string
  severity: 'error' | 'warning'
  title: string
  detail: string
  chapterId: string
}

export interface BookCheck {
  /** when it was made (milliseconds) */
  at: number
  chapters: ChapterCheck[]
  bookIssues: BookIssue[]
}

export interface BookCheckCounts {
  errors: number
  warnings: number
}

export function countBookCheck(check: BookCheck): BookCheckCounts {
  let errors = 0
  let warnings = 0
  const count = (severity: 'error' | 'warning') => (severity === 'error' ? errors++ : warnings++)
  for (const chapter of check.chapters) {
    if (chapter.error) errors++
    for (const issue of chapter.issues) count(issue.severity)
  }
  for (const issue of check.bookIssues) count(issue.severity)
  return { errors, warnings }
}

/** the number of errors and warnings of one chapter, in the book's check */
export function countChapter(check: BookCheck, chapterId: string): BookCheckCounts {
  const only: BookCheck = { ...check, chapters: check.chapters.filter((chapter) => chapter.chapterId === chapterId), bookIssues: check.bookIssues.filter((issue) => issue.chapterId === chapterId) }
  return countBookCheck(only)
}

export interface BookLevelInput {
  chapters: { id: string; title: string }[]
  /** each chapter's file: `ok`, or missing / unreadable (with the reason) */
  states: Record<string, { status: 'loading' | 'ok' | 'missing' | 'error'; message?: string; startPage?: number } | undefined>
  numbering: ChapterNumbering[]
  /** what a style sync would change in each chapter that could be read */
  styleReports: Record<string, SyncReport | undefined>
  /** the chapter the styles follow, if one is chosen */
  masterId: string | null
}

/**
 * The problems of the book itself, from what is known of its chapters' files: a chapter that is missing, a saved first page
 * number that is not the one the book gives the chapter, styles that are not those of the master. They are warnings (the
 * book can still be made), except a missing chapter, which stops the export.
 */
export function bookLevelIssues(input: BookLevelInput): BookIssue[] {
  const issues: BookIssue[] = []
  input.chapters.forEach((chapter, index) => {
    const state = input.states[chapter.id]
    if (state?.status === 'missing' || state?.status === 'error') {
      issues.push({ id: `chapter:${chapter.id}`, severity: 'error', title: state.status === 'missing' ? 'פרק חסר' : 'פרק שלא ניתן לקרוא', detail: `${chapter.title}: ${state.message ?? ''}`.trim(), chapterId: chapter.id })
      return
    }
    const wanted = input.numbering[index]?.startPage
    if (wanted != null && state?.startPage !== undefined && state.startPage !== wanted) {
      issues.push({ id: `numbering:${chapter.id}`, severity: 'warning', title: 'מספור עמודים לא מעודכן', detail: `${chapter.title}: בפרק שמור מספר ראשון ${state.startPage}, והספר נותן לו ${wanted} (הכפתור "עדכן מספור")`, chapterId: chapter.id })
    }
    const report = input.styleReports[chapter.id]
    if (report && chapter.id !== input.masterId && reportCount(report) > 0) {
      issues.push({ id: `styles:${chapter.id}`, severity: 'warning', title: 'הסגנונות לא תואמים למקור', detail: `${chapter.title}: ${reportCount(report)} סגנונות או צבעים שונים מפרק המקור (הכפתור "סנכרון סגנונות")`, chapterId: chapter.id })
    }
  })
  return issues
}
