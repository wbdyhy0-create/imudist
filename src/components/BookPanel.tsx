import { useState } from 'react'
import { isTauri } from '../fileio'
import { VectorSummary } from './ExportPdfDialog'
import { initialPrintMarks, printMarksOptions } from '../printSheet'
import { PrintMarksFields } from './PrintMarksFields'
import { emptyReport, type VectorReport } from '../vectorText'
import { basenameOf, type ChapterStart } from '../book'
import { canKeepBooks } from '../bookStorage'
import { countBookCheck, countChapter, type BookCheck } from '../bookPreflight'
import type { SyncReport } from '../bookStyles'
import type { BookController } from '../useBook'
import '../book.css'
import { localeTag, t } from '../i18n'

const START_OPTIONS: { value: ChapterStart; label: string }[] = [
  { value: 'any', get label() { return t('בכל עמוד') } },
  { value: 'odd', get label() { return t('בעמוד אי-זוגי') } },
  { value: 'even', get label() { return t('בעמוד זוגי') } },
]

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`)
const titleOf = (path: string) => basenameOf(path).replace(/\.[^.]*$/, '')

/**
 * The Book panel: the chapters of the open book in order with the page numbers they get, and what can be done with them -
 * add, move (drag or the arrows), open, remove. It floats over the work area and works with or without a document open.
 */
export function BookPanel({ controller }: { controller: BookController }) {
  const { book, states, numbering, panelOpen, staleNumbers, check } = controller
  const [view, setView] = useState<'chapters' | 'check'>('chapters')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  if (!panelOpen) return null

  if (!book || !numbering) {
    return (
      <aside className="book-panel" aria-label={t('ספר')}>
        <header className="book-head">
          <b>{t('ספר')}</b>
          <button className="book-close" aria-label={t('סגור')} onClick={() => controller.setPanelOpen(false)}>×</button>
        </header>
        <div className="book-empty">
          <p>{t('ספר מקבץ כמה מסמכים (פרקים) לפרסום אחד: מספור עמודים רציף, סגנונות משותפים וייצוא אחד.')}</p>
          {canKeepBooks() ? (
            <div className="book-actions">
              <button className="btn primary" onClick={() => void controller.create()}>{t('ספר חדש…')}</button>
              <button className="btn" onClick={() => void controller.open()}>{t('פתח ספר…')}</button>
            </div>
          ) : (
            <p className="book-note">{t('הדפדפן הזה לא מאפשר לתוכנה לפתוח תיקייה, ולכן אי אפשר לנהל בו ספר. השתמש בגרסת שולחן העבודה או בדפדפן Chrome או Edge.')}</p>
          )}
        </div>
      </aside>
    )
  }

  const counts = check ? countBookCheck(check) : null
  const checkLevel = !counts ? 'unknown' : counts.errors ? 'error' : counts.warnings ? 'warning' : 'ok'
  const checkLabel = !counts ? t('בדיקת תקינות: עדיין לא נבדק') : counts.errors || counts.warnings ? `${counts.errors ? plural(counts.errors, t('שגיאה אחת'), t('שגיאות')) : ''}${counts.errors && counts.warnings ? ' · ' : ''}${counts.warnings ? plural(counts.warnings, t('אזהרה אחת'), t('אזהרות')) : ''}` : t('אין שגיאות בספר')
  const total = numbering.totalPages
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  return (
    <aside
      className={`book-panel${dropActive ? ' drop-active' : ''}`}
      aria-label={t('ספר')}
      onDragOver={(event) => {
        // a document file dragged over the panel: it can be dropped here to become a chapter
        if (!hasFiles(event)) return
        event.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        // the program's own handling of a dropped document (opening it) must not also run
        event.preventDefault()
        event.stopPropagation()
        setDropActive(false)
        // the handles are only there during the event
        const asking = Array.from(event.dataTransfer.items)
          .filter((item) => item.kind === 'file' && item.getAsFile()?.name.toLowerCase().endsWith('.imudist'))
          .map((item) => (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle?.())
        void Promise.all(asking).then((handles) => controller.dropFiles({ handles: handles.filter((handle): handle is FileSystemFileHandle => !!handle && handle.kind === 'file') }))
      }}
    >
      <header className="book-head">
        <input
          key={book.title}
          className="book-title"
          defaultValue={book.title}
          aria-label={t('שם הספר')}
          onBlur={(event) => controller.setTitle(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
        <button className="book-close" aria-label={t('סגור את הלוח')} onClick={() => controller.setPanelOpen(false)}>×</button>
      </header>
      <div className="book-summary">
        <span>{plural(book.chapters.length, t('פרק אחד'), t('פרקים'))}</span>
        <span>
          {t('{total} עמודים', { total })}{numbering.complete ? '' : t(' (לא כולל פרקים שגודלם לא ידוע)')}
        </span>
      </div>
      <div className="book-path" title={controller.storage?.label}>{controller.storage?.label}</div>

      <div className="book-check-line">
        <span className={`dot ${checkLevel}`} />
        <span className="book-check-text">{checkLabel}</span>
        <button className="btn small" disabled={controller.busy} onClick={() => (check ? setView(view === 'check' ? 'chapters' : 'check') : void controller.runCheck())}>
          {check ? (view === 'check' ? t('חזרה לפרקים') : t('פירוט')) : t('בדוק ספר')}
        </button>
      </div>
      {controller.checkProgress && <div className="book-note" role="status">{t('בודק: {title} ({done} מתוך {total})', { title: controller.checkProgress.title, done: controller.checkProgress.done + 1, total: controller.checkProgress.total })}</div>}
      {view === 'check' && check ? (
        <BookCheckList controller={controller} />
      ) : (
        <>
      <div className="book-settings">
        <label>
          {t('מספר העמוד הראשון')}
          <input type="number" value={book.settings.startPage} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && controller.setSettings({ startPage: Math.round(event.target.valueAsNumber) })} />
        </label>
        <label>
          {t('פרק מתחיל')}
          <select value={book.settings.chapterStart} onChange={(event) => controller.setSettings({ chapterStart: event.target.value as ChapterStart })}>
            {START_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <ol className="book-chapters">
        {book.chapters.length === 0 && <li className="book-note">{t('עדיין אין פרקים. לחץ על "הוסף פרקים" כדי לצרף מסמכים.')}</li>}
        {book.chapters.map((chapter, index) => {
          const state = states[chapter.id]
          const number = numbering.chapters[index]
          const name = state?.info?.name || titleOf(chapter.path)
          return (
            <li
              key={chapter.id}
              className={`book-chapter ${state?.status ?? 'loading'}${overId === chapter.id && dragId !== chapter.id ? ' drop-here' : ''}${dragId === chapter.id ? ' dragging' : ''}`}
              draggable
              onDragStart={(event) => {
                setDragId(chapter.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', chapter.id)
              }}
              onDragOver={(event) => {
                if (!dragId) return
                event.preventDefault()
                setOverId(chapter.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragId && dragId !== chapter.id) controller.moveChapter(dragId, index)
                setDragId(null)
                setOverId(null)
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
            >
              <span className="book-grip" aria-hidden="true">⋮⋮</span>
              <span className="book-index">{index + 1}</span>
              <div className="book-chapter-main">
                <button className="book-chapter-name" title={t('פתח את הפרק')} onClick={() => void controller.openChapter(chapter.id)} disabled={state?.status === 'missing'}>{name}</button>
                <div className="book-chapter-meta">
                  {state?.status === 'missing' || state?.status === 'error' ? (
                    <span className="book-bad">
                      {state.message}
                      {state.status === 'missing' && <button className="btn small" onClick={() => void controller.relinkChapter(chapter.id)}>{t('קשר מחדש…')}</button>}
                    </span>
                  ) : number?.startPage != null && number.endPage != null ? (
                    <span>
                      {t('עמ׳ {start}–{end}', { start: number.startPage, end: number.endPage })} · {plural(number.pages ?? 0, t('עמוד אחד'), t('עמודים'))}
                      {number.skipped > 0 && t(' · לפניו עמוד ריק')}
                    </span>
                  ) : state?.status === 'loading' ? (
                    <span>{t('טוען…')}</span>
                  ) : (
                    <span>{t('המספור לא ידוע (פרק קודם חסר)')}</span>
                  )}
                  {staleNumbers.includes(chapter.id) && state?.info && <span className="book-warn">{t('⚠ בפרק שמור מספר ראשון {saved} ולא {computed}', { saved: state.info.startPage, computed: number?.startPage ?? '' })}</span>}
                  {controller.conflicts.includes(chapter.id) && (
                    <span className="book-warn">
                      {t('⚠ הקובץ שונה בדיסק בזמן שהפרק פתוח עם שינויים שלא נשמרו: שמירה תדרוס את השינוי')}
                      <button className="btn small" onClick={() => controller.dismissConflict(chapter.id)}>{t('הבנתי')}</button>
                    </span>
                  )}
                  {check && <ChapterBadge check={check} chapterId={chapter.id} />}
                  <span className="book-chapter-path" title={chapter.path}>{chapter.path}</span>
                </div>
              </div>
              <div className="book-chapter-tools">
                <button className={`book-star${book.settings.styleSourceId === chapter.id ? ' on' : ''}`} aria-label={t('מקור הסגנונות')} aria-pressed={book.settings.styleSourceId === chapter.id} title={book.settings.styleSourceId === chapter.id ? t('זה מקור הסגנונות של הספר (לחיצה מבטלת)') : t('קבע כמקור הסגנונות של הספר')} onClick={() => controller.setStyleSource(chapter.id)}>
                  {book.settings.styleSourceId === chapter.id ? '★' : '☆'}
                </button>
                <button aria-label={t('הזז למעלה')} title={t('הזז למעלה')} disabled={index === 0} onClick={() => controller.moveChapter(chapter.id, index - 1)}>▲</button>
                <button aria-label={t('הזז למטה')} title={t('הזז למטה')} disabled={index === book.chapters.length - 1} onClick={() => controller.moveChapter(chapter.id, index + 1)}>▼</button>
                <button aria-label={t('הסר מהספר')} title={t('הסר מהספר (הקובץ עצמו לא נמחק)')} onClick={() => controller.removeChapter(chapter.id)}>✕</button>
              </div>
            </li>
          )
        })}
      </ol>
        </>
      )}

      <footer className="book-foot">
        <button className="btn primary" onClick={() => void controller.addChapters()}>{t('הוסף פרקים…')}</button>
        <button className="btn" onClick={controller.refresh} title={t('קרא שוב את גודל הפרקים מהקבצים')}>{t('רענן')}</button>
        <button className="btn" disabled={staleNumbers.length === 0 || controller.busy} onClick={() => void controller.updateNumbering()} title={t('כתוב בכל פרק את מספר העמוד הראשון שהספר מחשב לו')}>
          {t('עדכן מספור')}{staleNumbers.length > 0 ? ` (${staleNumbers.length})` : ''}
        </button>
        <button className="btn" disabled={!book.settings.styleSourceId || controller.busy} onClick={() => void controller.planSync()} title={book.settings.styleSourceId ? t('הבא את הסגנונות והצבעים של פרק המקור לשאר הפרקים') : t('סמן קודם פרק כמקור הסגנונות (הכוכב)')}>
          {t('סנכרון סגנונות')}
        </button>
        <button className="btn" disabled={book.chapters.length === 0 || !numbering.complete || controller.busy} onClick={() => controller.setExportOpen(true)} title={numbering.complete ? t('כל הפרקים לקובץ PDF אחד, עם מספור רציף וסימניות') : t('אי אפשר לייצא: הקובץ של אחד הפרקים חסר')}>
          {t('ייצוא הספר ל-PDF')}
        </button>
        <button className="btn" onClick={controller.close} title={t('סגור את הספר (הקבצים נשמרים)')}>{t('סגור ספר')}</button>
      </footer>
    </aside>
  )
}

/** Choose chapters among the document files of the book's folder (where the browser has no file dialog for it). */
export function ChapterPicker({ controller }: { controller: BookController }) {
  const files = controller.candidates
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  if (!files) return null
  const relinking = !!controller.relinking
  const toggle = (path: string) => setChosen((current) => {
    // relinking takes one file; adding takes as many as are ticked
    if (relinking) return new Set([path])
    const next = new Set(current)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  })
  const close = () => {
    setChosen(new Set())
    controller.cancelCandidates()
  }
  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('הוספת פרקים')}>
        <h2>{relinking ? t('קישור מחדש של הפרק') : t('הוספת פרקים')}</h2>
        <p className="muted">{relinking ? t('בחר את המסמך שיבוא במקום הקובץ שחסר. מקום הפרק בספר והמספור נשארים.') : t('מסמכים שנמצאו בתיקיית הספר. הם יתווספו לספר בסדר הרשימה.')}</p>
        <ul className="book-picker">
          {files.map((path) => (
            <li key={path}>
              <label>
                <input type={relinking ? 'radio' : 'checkbox'} checked={chosen.has(path)} onChange={() => toggle(path)} />
                {path}
              </label>
            </li>
          ))}
        </ul>
        <div className="modal-buttons">
          <button
            className="btn primary"
            disabled={chosen.size === 0}
            onClick={() => {
              const paths = files.filter((path) => chosen.has(path))
              setChosen(new Set())
              void controller.confirmCandidates(paths)
            }}
          >
            {relinking ? t('קשר') : chosen.size ? t('הוסף {n1}', { n1: plural(chosen.size, t('פרק אחד'), t('פרקים')) }) : t('הוסף')}
          </button>
          <button className="btn" onClick={close}>{t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}

const listOf = (report: SyncReport | undefined) => {
  if (!report) return ''
  const parts: string[] = []
  const add = (label: string, count: number) => count > 0 && parts.push(`${label}: ${count}`)
  add(t('סגנונות פסקה חדשים'), report.addedParagraph.length)
  add(t('סגנונות פסקה שיתעדכנו'), report.updatedParagraph.length)
  add(t('סגנונות תו חדשים'), report.addedCharacter.length)
  add(t('סגנונות תו שיתעדכנו'), report.updatedCharacter.length)
  add(t('צבעים חדשים'), report.addedColors.length)
  return parts.join(' · ')
}

/** What a style sync would change in each chapter, to be confirmed before anything is written. */
export function SyncDialog({ controller }: { controller: BookController }) {
  const plan = controller.syncPlan
  if (!plan) return null
  const changing = plan.rows.filter((row) => row.status === 'changes')
  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('סנכרון סגנונות')}>
        <h2>{t('סנכרון סגנונות')}</h2>
        <p className="muted">
          {t('הסגנונות והצבעים של "{name}" יועברו לשאר הפרקים. סגנון עם אותו שם מתעדכן (והטקסט שבו מקבל את המראה החדש), סגנון חסר נוסף, ושום סגנון לא נמחק.', { name: plan.masterName })}
        </p>
        <ul className="book-sync-rows">
          {plan.rows.map((row) => (
            <li key={row.chapterId} className={row.status}>
              <b>{row.name}</b>
              <span>
                {row.status === 'current' && t('מעודכן')}
                {row.status === 'error' && <span className="book-bad">{row.message}</span>}
                {row.status === 'changes' && listOf(row.report)}
                {row.open && row.status === 'changes' && t(' · פתוח: השינוי ייעשה במסמך הפתוח (לשמור אחר כך)')}
              </span>
            </li>
          ))}
          {plan.rows.length === 0 && <li className="current"><span>{t('אין בספר פרקים אחרים.')}</span></li>}
        </ul>
        <div className="modal-buttons">
          <button className="btn primary" disabled={changing.length === 0 || controller.busy} onClick={() => void controller.applySync()}>
            {changing.length ? t('החל על {n1}', { n1: plural(changing.length, t('פרק אחד'), t('פרקים')) }) : t('אין מה לסנכרן')}
          </button>
          <button className="btn" onClick={controller.cancelSync}>{t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}

const DPI_CHOICES = [
  { dpi: 300, get label() { return t('איכות גבוהה להדפסה (300 DPI)') } },
  { dpi: 150, get label() { return t('איכות מסך / שליחה דיגיטלית (150 DPI)') } },
  { dpi: 600, get label() { return t('איכות גבוהה במיוחד (600 DPI, קובץ גדול)') } },
]

const COLOR_CHOICES = [
  { mode: 'rgb' as const, get label() { return t('RGB — למסך ולשליחה דיגיטלית') } },
  { mode: 'cmyk' as const, get label() { return t('CMYK — להדפסה בדפוס') } },
]

/** The book as one PDF: the same choices as a single document's export, for every page of every chapter. */
export function BookExportDialog({ controller }: { controller: BookController }) {
  const { book, numbering, exportOpen, exportProgress, busy, exportCancelling } = controller
  const [marks, setMarks] = useState(() => initialPrintMarks())
  const [dpi, setDpi] = useState(300)
  const [colorMode, setColorMode] = useState<'rgb' | 'cmyk'>('rgb')
  const [vectorText, setVectorText] = useState(false)
  /** what the export did with the frames of text (only when the text was to be written as text), shown when it is done */
  const [result, setResult] = useState<VectorReport | null>(null)
  if (!exportOpen || !book || !numbering) return null
  const close = () => {
    setResult(null)
    controller.setExportOpen(false)
  }
  const run = async () => {
    // opened synchronously, still inside the click, so showing the result in it is not stopped as a popup
    const view = isTauri ? null : window.open('', '_blank')
    if (view) {
      view.document.title = t('מייצא PDF…')
      view.document.documentElement.dir = 'rtl'
      view.document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc;font:14px sans-serif'
      view.document.body.textContent = t('מייצא PDF, נא להמתין…')
    }
    const vectorReport = vectorText ? emptyReport() : undefined
    const done = await controller.runExport({ ...printMarksOptions(marks), dpi, colorMode, vectorText, vectorReport }, view)
    if (done && vectorReport) setResult(vectorReport)
  }
  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('ייצוא הספר ל-PDF')}>
        <h2>{t('ייצוא הספר ל-PDF')}</h2>
        <p className="muted">
          {plural(book.chapters.length, t('פרק אחד'), t('פרקים'))}{t(', {pages} עמודים, מהעמוד {start}. הספר יוצא לקובץ אחד לפי סדר הפרקים, עם הספרור של הספר, עמוד ריק היכן שפרק צריך להתחיל בעמוד אי-זוגי או זוגי, וסימנייה לכל פרק.', { pages: numbering.totalPages, start: book.settings.startPage })}
        </p>
        <PrintMarksFields value={marks} onChange={setMarks} unit="mm" disabled={busy} />
        <div className="field">
          <div className="field-label">{t('איכות תמונות')}</div>
          <div className="seg small" role="radiogroup" aria-label={t('איכות תמונות')}>
            {DPI_CHOICES.map((choice) => (
              <button key={choice.dpi} role="radio" aria-checked={dpi === choice.dpi} className={dpi === choice.dpi ? 'on' : ''} onClick={() => setDpi(choice.dpi)} disabled={busy}>
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="field-label">{t('מצב צבע')}</div>
          <div className="seg small" role="radiogroup" aria-label={t('מצב צבע')}>
            {COLOR_CHOICES.map((choice) => (
              <button key={choice.mode} role="radio" aria-checked={colorMode === choice.mode} className={colorMode === choice.mode ? 'on' : ''} onClick={() => setColorMode(choice.mode)} disabled={busy}>
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        {colorMode === 'cmyk' && <p className="muted">{t('הצבעים מומרים ל-CMYK בהמרה פשוטה, בלי פרופיל צבע: שחור ואפור יוצאים בדיו שחור בלבד. בית דפוס שמתאים את הצבעים לפרופיל של המכונה שלו יצטרך להמיר אותם בעצמו.')}</p>}
        {dpi === 600 && <p className="muted">{t('ב-600 DPI כל עמוד גדול פי ארבעה מ-300 DPI, וספר שלם בגודל כזה הוא קובץ ענק והייצוא איטי מאוד. כדאי לייצא כך רק פרק בודד או טווח קטן.')}</p>}
        <label className="page-bar-check">
          <input type="checkbox" checked={vectorText} onChange={(event) => setVectorText(event.target.checked)} disabled={busy} />
          {t('ייצוא וקטורי: טקסט, צורות ותמונות')}
        </label>
        <p className="muted">{t('טקסט פשוט נכתב ל-PDF כטקסט אמיתי, חד בכל הגדלה, עם הגופן בתוך הקובץ; צורות וקווים נכתבים כצורות, ותמונות מוצבות כתמונות נפרדות. תיבת טקסט שיש בה משהו נוסף (ניקוד, צל, הערת שוליים, תוכן עניינים, רשימה) או שהגופן שלה לא נמצא במחשב, וצורה עם מילוי מעבר צבעים, צל או תמונה, נשארות כתמונה.')}</p>
        <p className="muted">{t('כל עמוד נשמר כתמונה חדה, וספר גדול ב-300 DPI הוא קובץ גדול והייצוא לוקח זמן. לבדיקה אפשר לבחור 150 DPI.')}</p>
        {exportProgress && (
          <p role="status">
            {t('פרק {chapter} מתוך {chapters} ({title}): עמוד {page} מתוך {pages}', { chapter: exportProgress.chapter, chapters: exportProgress.chapters, title: exportProgress.title, page: exportProgress.page, pages: exportProgress.pages })}
          </p>
        )}
        {result && <VectorSummary report={result} />}
        <div className="modal-buttons">
          {result ? (
            <button className="btn primary" onClick={close}>{t('סגור')}</button>
          ) : (
            <>
              <button className="btn primary" onClick={() => void run()} disabled={busy}>{busy ? t('מייצא…') : t('ייצוא')}</button>
              <button className="btn" onClick={busy ? controller.cancelExport : close} disabled={exportCancelling}>{exportCancelling ? t('מבטל…') : t('ביטול')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** how a chapter did in the last check */
function ChapterBadge({ check, chapterId }: { check: BookCheck; chapterId: string }) {
  const counts = countChapter(check, chapterId)
  if (counts.errors === 0 && counts.warnings === 0) return <span className="book-ok">{t('✓ נבדק, אין בעיות')}</span>
  return <span className={counts.errors ? 'book-bad' : 'book-warn'}>{counts.errors ? plural(counts.errors, t('שגיאה אחת'), t('שגיאות')) : plural(counts.warnings, t('אזהרה אחת'), t('אזהרות'))}</span>
}

/** The problems the check found, chapter by chapter; a click on one opens the chapter at the place. */
function BookCheckList({ controller }: { controller: BookController }) {
  const { check, book, numbering } = controller
  if (!check || !book || !numbering) return null
  const startOf = (chapterId: string) => numbering.chapters[book.chapters.findIndex((chapter) => chapter.id === chapterId)]?.startPage ?? null
  const time = new Date(check.at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="book-check">
      <div className="book-check-head">
        <span className="muted">{t('נבדק ב-{time}', { time })}</span>
        <button className="btn small" disabled={controller.busy} onClick={() => void controller.runCheck()}>{t('בדוק שוב')}</button>
      </div>
      <div className="book-check-list">
        {check.chapters.map((chapter) => {
          const own = check.bookIssues.filter((issue) => issue.chapterId === chapter.chapterId)
          if (chapter.issues.length === 0 && own.length === 0 && !chapter.error) return null
          const first = startOf(chapter.chapterId)
          return (
            <section key={chapter.chapterId} className="preflight-group">
              <h4>{chapter.title}</h4>
              {chapter.error && <div className="book-note book-bad">{chapter.error}</div>}
              {own.map((issue) => (
                <button key={issue.id} className="preflight-row" onClick={() => void controller.openChapter(chapter.chapterId)} title={t('פתח את הפרק')}>
                  <span className={`dot ${issue.severity}`} />
                  <span className="preflight-text"><b>{issue.title}</b><span>{issue.detail}</span></span>
                </button>
              ))}
              {chapter.issues.map((issue) => (
                <button key={issue.id} className="preflight-row" onClick={() => void controller.openIssue(chapter.chapterId, issue)}>
                  <span className={`dot ${issue.severity}`} />
                  <span className="preflight-text">
                    <b>{issue.title}</b>
                    <span>{issue.detail}{first != null ? t(' (עמוד {n1} בספר)', { n1: first + issue.page }) : ''}</span>
                  </span>
                </button>
              ))}
            </section>
          )
        })}
        {countBookCheck(check).errors + countBookCheck(check).warnings === 0 && <p className="book-note">{t('כל הפרקים נבדקו: אין טקסט עודף, שום דבר לא חורג מהעמודים, והגופנים והתמונות במקומם.')}</p>}
      </div>
    </div>
  )
}
