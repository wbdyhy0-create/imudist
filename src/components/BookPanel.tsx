import { useState } from 'react'
import { isTauri } from '../fileio'
import { toPt } from '../units'
import { NumberField } from './NumberField'
import { basenameOf, type ChapterStart } from '../book'
import { canKeepBooks } from '../bookStorage'
import { countBookCheck, countChapter, type BookCheck } from '../bookPreflight'
import type { SyncReport } from '../bookStyles'
import type { BookController } from '../useBook'
import '../book.css'

const START_OPTIONS: { value: ChapterStart; label: string }[] = [
  { value: 'any', label: 'בכל עמוד' },
  { value: 'odd', label: 'בעמוד אי-זוגי' },
  { value: 'even', label: 'בעמוד זוגי' },
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
      <aside className="book-panel" aria-label="ספר">
        <header className="book-head">
          <b>ספר</b>
          <button className="book-close" aria-label="סגור" onClick={() => controller.setPanelOpen(false)}>×</button>
        </header>
        <div className="book-empty">
          <p>ספר מקבץ כמה מסמכים (פרקים) לפרסום אחד: מספור עמודים רציף, סגנונות משותפים וייצוא אחד.</p>
          {canKeepBooks() ? (
            <div className="book-actions">
              <button className="btn primary" onClick={() => void controller.create()}>ספר חדש…</button>
              <button className="btn" onClick={() => void controller.open()}>פתח ספר…</button>
            </div>
          ) : (
            <p className="book-note">הדפדפן הזה לא מאפשר לתוכנה לפתוח תיקייה, ולכן אי אפשר לנהל בו ספר. השתמש בגרסת שולחן העבודה או בדפדפן Chrome או Edge.</p>
          )}
        </div>
      </aside>
    )
  }

  const counts = check ? countBookCheck(check) : null
  const checkLevel = !counts ? 'unknown' : counts.errors ? 'error' : counts.warnings ? 'warning' : 'ok'
  const checkLabel = !counts ? 'בדיקת תקינות: עדיין לא נבדק' : counts.errors || counts.warnings ? `${counts.errors ? plural(counts.errors, 'שגיאה אחת', 'שגיאות') : ''}${counts.errors && counts.warnings ? ' · ' : ''}${counts.warnings ? plural(counts.warnings, 'אזהרה אחת', 'אזהרות') : ''}` : 'אין שגיאות בספר'
  const total = numbering.totalPages
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  return (
    <aside
      className={`book-panel${dropActive ? ' drop-active' : ''}`}
      aria-label="ספר"
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
          aria-label="שם הספר"
          onBlur={(event) => controller.setTitle(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
        <button className="book-close" aria-label="סגור את הלוח" onClick={() => controller.setPanelOpen(false)}>×</button>
      </header>
      <div className="book-summary">
        <span>{plural(book.chapters.length, 'פרק אחד', 'פרקים')}</span>
        <span>
          {total} עמודים{numbering.complete ? '' : ' (לא כולל פרקים שגודלם לא ידוע)'}
        </span>
      </div>
      <div className="book-path" title={controller.storage?.label}>{controller.storage?.label}</div>

      <div className="book-check-line">
        <span className={`dot ${checkLevel}`} />
        <span className="book-check-text">{checkLabel}</span>
        <button className="btn small" disabled={controller.busy} onClick={() => (check ? setView(view === 'check' ? 'chapters' : 'check') : void controller.runCheck())}>
          {check ? (view === 'check' ? 'חזרה לפרקים' : 'פירוט') : 'בדוק ספר'}
        </button>
      </div>
      {controller.checkProgress && <div className="book-note" role="status">בודק: {controller.checkProgress.title} ({controller.checkProgress.done + 1} מתוך {controller.checkProgress.total})</div>}
      {view === 'check' && check ? (
        <BookCheckList controller={controller} />
      ) : (
        <>
      <div className="book-settings">
        <label>
          מספר העמוד הראשון
          <input type="number" value={book.settings.startPage} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && controller.setSettings({ startPage: Math.round(event.target.valueAsNumber) })} />
        </label>
        <label>
          פרק מתחיל
          <select value={book.settings.chapterStart} onChange={(event) => controller.setSettings({ chapterStart: event.target.value as ChapterStart })}>
            {START_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <ol className="book-chapters">
        {book.chapters.length === 0 && <li className="book-note">עדיין אין פרקים. לחץ על "הוסף פרקים" כדי לצרף מסמכים.</li>}
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
                <button className="book-chapter-name" title="פתח את הפרק" onClick={() => void controller.openChapter(chapter.id)} disabled={state?.status === 'missing'}>{name}</button>
                <div className="book-chapter-meta">
                  {state?.status === 'missing' || state?.status === 'error' ? (
                    <span className="book-bad">
                      {state.message}
                      {state.status === 'missing' && <button className="btn small" onClick={() => void controller.relinkChapter(chapter.id)}>קשר מחדש…</button>}
                    </span>
                  ) : number?.startPage != null && number.endPage != null ? (
                    <span>
                      עמ׳ {number.startPage}–{number.endPage} · {plural(number.pages ?? 0, 'עמוד אחד', 'עמודים')}
                      {number.skipped > 0 && ' · לפניו עמוד ריק'}
                    </span>
                  ) : state?.status === 'loading' ? (
                    <span>טוען…</span>
                  ) : (
                    <span>המספור לא ידוע (פרק קודם חסר)</span>
                  )}
                  {staleNumbers.includes(chapter.id) && state?.info && <span className="book-warn">⚠ בפרק שמור מספר ראשון {state.info.startPage} ולא {number?.startPage}</span>}
                  {controller.conflicts.includes(chapter.id) && (
                    <span className="book-warn">
                      ⚠ הקובץ שונה בדיסק בזמן שהפרק פתוח עם שינויים שלא נשמרו: שמירה תדרוס את השינוי
                      <button className="btn small" onClick={() => controller.dismissConflict(chapter.id)}>הבנתי</button>
                    </span>
                  )}
                  {check && <ChapterBadge check={check} chapterId={chapter.id} />}
                  <span className="book-chapter-path" title={chapter.path}>{chapter.path}</span>
                </div>
              </div>
              <div className="book-chapter-tools">
                <button className={`book-star${book.settings.styleSourceId === chapter.id ? ' on' : ''}`} aria-label="מקור הסגנונות" aria-pressed={book.settings.styleSourceId === chapter.id} title={book.settings.styleSourceId === chapter.id ? 'זה מקור הסגנונות של הספר (לחיצה מבטלת)' : 'קבע כמקור הסגנונות של הספר'} onClick={() => controller.setStyleSource(chapter.id)}>
                  {book.settings.styleSourceId === chapter.id ? '★' : '☆'}
                </button>
                <button aria-label="הזז למעלה" title="הזז למעלה" disabled={index === 0} onClick={() => controller.moveChapter(chapter.id, index - 1)}>▲</button>
                <button aria-label="הזז למטה" title="הזז למטה" disabled={index === book.chapters.length - 1} onClick={() => controller.moveChapter(chapter.id, index + 1)}>▼</button>
                <button aria-label="הסר מהספר" title="הסר מהספר (הקובץ עצמו לא נמחק)" onClick={() => controller.removeChapter(chapter.id)}>✕</button>
              </div>
            </li>
          )
        })}
      </ol>
        </>
      )}

      <footer className="book-foot">
        <button className="btn primary" onClick={() => void controller.addChapters()}>הוסף פרקים…</button>
        <button className="btn" onClick={controller.refresh} title="קרא שוב את גודל הפרקים מהקבצים">רענן</button>
        <button className="btn" disabled={staleNumbers.length === 0 || controller.busy} onClick={() => void controller.updateNumbering()} title="כתוב בכל פרק את מספר העמוד הראשון שהספר מחשב לו">
          עדכן מספור{staleNumbers.length > 0 ? ` (${staleNumbers.length})` : ''}
        </button>
        <button className="btn" disabled={!book.settings.styleSourceId || controller.busy} onClick={() => void controller.planSync()} title={book.settings.styleSourceId ? 'הבא את הסגנונות והצבעים של פרק המקור לשאר הפרקים' : 'סמן קודם פרק כמקור הסגנונות (הכוכב)'}>
          סנכרון סגנונות
        </button>
        <button className="btn" disabled={book.chapters.length === 0 || !numbering.complete || controller.busy} onClick={() => controller.setExportOpen(true)} title={numbering.complete ? 'כל הפרקים לקובץ PDF אחד, עם מספור רציף וסימניות' : 'אי אפשר לייצא: הקובץ של אחד הפרקים חסר'}>
          ייצוא הספר ל-PDF
        </button>
        <button className="btn" onClick={controller.close} title="סגור את הספר (הקבצים נשמרים)">סגור ספר</button>
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
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="הוספת פרקים">
        <h2>{relinking ? 'קישור מחדש של הפרק' : 'הוספת פרקים'}</h2>
        <p className="muted">{relinking ? 'בחר את המסמך שיבוא במקום הקובץ שחסר. מקום הפרק בספר והמספור נשארים.' : 'מסמכים שנמצאו בתיקיית הספר. הם יתווספו לספר בסדר הרשימה.'}</p>
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
            {relinking ? 'קשר' : chosen.size ? `הוסף ${plural(chosen.size, 'פרק אחד', 'פרקים')}` : 'הוסף'}
          </button>
          <button className="btn" onClick={close}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

const listOf = (report: SyncReport | undefined) => {
  if (!report) return ''
  const parts: string[] = []
  const add = (label: string, count: number) => count > 0 && parts.push(`${label}: ${count}`)
  add('סגנונות פסקה חדשים', report.addedParagraph.length)
  add('סגנונות פסקה שיתעדכנו', report.updatedParagraph.length)
  add('סגנונות תו חדשים', report.addedCharacter.length)
  add('סגנונות תו שיתעדכנו', report.updatedCharacter.length)
  add('צבעים חדשים', report.addedColors.length)
  return parts.join(' · ')
}

/** What a style sync would change in each chapter, to be confirmed before anything is written. */
export function SyncDialog({ controller }: { controller: BookController }) {
  const plan = controller.syncPlan
  if (!plan) return null
  const changing = plan.rows.filter((row) => row.status === 'changes')
  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="סנכרון סגנונות">
        <h2>סנכרון סגנונות</h2>
        <p className="muted">
          הסגנונות והצבעים של "{plan.masterName}" יועברו לשאר הפרקים. סגנון עם אותו שם מתעדכן (והטקסט שבו מקבל את המראה החדש), סגנון חסר נוסף, ושום סגנון לא נמחק.
        </p>
        <ul className="book-sync-rows">
          {plan.rows.map((row) => (
            <li key={row.chapterId} className={row.status}>
              <b>{row.name}</b>
              <span>
                {row.status === 'current' && 'מעודכן'}
                {row.status === 'error' && <span className="book-bad">{row.message}</span>}
                {row.status === 'changes' && listOf(row.report)}
                {row.open && row.status === 'changes' && ' · פתוח: השינוי ייעשה במסמך הפתוח (לשמור אחר כך)'}
              </span>
            </li>
          ))}
          {plan.rows.length === 0 && <li className="current"><span>אין בספר פרקים אחרים.</span></li>}
        </ul>
        <div className="modal-buttons">
          <button className="btn primary" disabled={changing.length === 0 || controller.busy} onClick={() => void controller.applySync()}>
            {changing.length ? `החל על ${plural(changing.length, 'פרק אחד', 'פרקים')}` : 'אין מה לסנכרן'}
          </button>
          <button className="btn" onClick={controller.cancelSync}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

const DPI_CHOICES = [
  { dpi: 300, label: 'איכות גבוהה להדפסה (300 DPI)' },
  { dpi: 150, label: 'איכות מסך / שליחה דיגיטלית (150 DPI)' },
]

/** The book as one PDF: the same choices as a single document's export, for every page of every chapter. */
export function BookExportDialog({ controller }: { controller: BookController }) {
  const { book, numbering, exportOpen, exportProgress, busy } = controller
  const [bleedOn, setBleedOn] = useState(false)
  const [bleedPt, setBleedPt] = useState(toPt(3, 'mm'))
  const [cropMarks, setCropMarks] = useState(false)
  const [dpi, setDpi] = useState(300)
  if (!exportOpen || !book || !numbering) return null
  const run = () => {
    // opened synchronously, still inside the click, so showing the result in it is not stopped as a popup
    const view = isTauri ? null : window.open('', '_blank')
    if (view) {
      view.document.title = 'מייצא PDF…'
      view.document.documentElement.dir = 'rtl'
      view.document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc;font:14px sans-serif'
      view.document.body.textContent = 'מייצא PDF, נא להמתין…'
    }
    void controller.runExport({ bleed: bleedOn, bleedPt, cropMarks: bleedOn && cropMarks, dpi }, view)
  }
  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="ייצוא הספר ל-PDF">
        <h2>ייצוא הספר ל-PDF</h2>
        <p className="muted">
          {plural(book.chapters.length, 'פרק אחד', 'פרקים')}, {numbering.totalPages} עמודים, מהעמוד {book.settings.startPage}. הספר יוצא לקובץ אחד לפי סדר הפרקים, עם הספרור של הספר, עמוד ריק היכן שפרק צריך להתחיל בעמוד אי-זוגי או זוגי, וסימנייה לכל פרק.
        </p>
        <label className="page-bar-check">
          <input type="checkbox" checked={bleedOn} onChange={(event) => setBleedOn(event.target.checked)} disabled={busy} />
          כלול שולי גלישה (Bleed) וסימני חיתוך
        </label>
        {bleedOn && (
          <div className="dlg-cols">
            <div className="field">
              <div className="field-label">גודל שולי הגלישה</div>
              <NumberField value={bleedPt} onChange={setBleedPt} unit="mm" min={0} max={toPt(50, 'mm')} />
            </div>
            <label className="page-bar-check" style={{ alignSelf: 'end', marginBottom: 6 }}>
              <input type="checkbox" checked={cropMarks} onChange={(event) => setCropMarks(event.target.checked)} disabled={busy} />
              הצג סימני חיתוך
            </label>
          </div>
        )}
        <div className="field">
          <div className="field-label">איכות תמונות</div>
          <div className="seg small" role="radiogroup" aria-label="איכות תמונות">
            {DPI_CHOICES.map((choice) => (
              <button key={choice.dpi} role="radio" aria-checked={dpi === choice.dpi} className={dpi === choice.dpi ? 'on' : ''} onClick={() => setDpi(choice.dpi)} disabled={busy}>
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">כל עמוד נשמר כתמונה חדה, וספר גדול ב-300 DPI הוא קובץ גדול והייצוא לוקח זמן. לבדיקה אפשר לבחור 150 DPI.</p>
        {exportProgress && (
          <p role="status">
            פרק {exportProgress.chapter} מתוך {exportProgress.chapters} ({exportProgress.title}): עמוד {exportProgress.page} מתוך {exportProgress.pages}
          </p>
        )}
        <div className="modal-buttons">
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'מייצא…' : 'ייצוא'}</button>
          <button className="btn" onClick={() => controller.setExportOpen(false)} disabled={busy}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

/** how a chapter did in the last check */
function ChapterBadge({ check, chapterId }: { check: BookCheck; chapterId: string }) {
  const counts = countChapter(check, chapterId)
  if (counts.errors === 0 && counts.warnings === 0) return <span className="book-ok">✓ נבדק, אין בעיות</span>
  return <span className={counts.errors ? 'book-bad' : 'book-warn'}>{counts.errors ? plural(counts.errors, 'שגיאה אחת', 'שגיאות') : plural(counts.warnings, 'אזהרה אחת', 'אזהרות')}</span>
}

/** The problems the check found, chapter by chapter; a click on one opens the chapter at the place. */
function BookCheckList({ controller }: { controller: BookController }) {
  const { check, book, numbering } = controller
  if (!check || !book || !numbering) return null
  const startOf = (chapterId: string) => numbering.chapters[book.chapters.findIndex((chapter) => chapter.id === chapterId)]?.startPage ?? null
  const time = new Date(check.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="book-check">
      <div className="book-check-head">
        <span className="muted">נבדק ב-{time}</span>
        <button className="btn small" disabled={controller.busy} onClick={() => void controller.runCheck()}>בדוק שוב</button>
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
                <button key={issue.id} className="preflight-row" onClick={() => void controller.openChapter(chapter.chapterId)} title="פתח את הפרק">
                  <span className={`dot ${issue.severity}`} />
                  <span className="preflight-text"><b>{issue.title}</b><span>{issue.detail}</span></span>
                </button>
              ))}
              {chapter.issues.map((issue) => (
                <button key={issue.id} className="preflight-row" onClick={() => void controller.openIssue(chapter.chapterId, issue)}>
                  <span className={`dot ${issue.severity}`} />
                  <span className="preflight-text">
                    <b>{issue.title}</b>
                    <span>{issue.detail}{first != null ? ` (עמוד ${first + issue.page} בספר)` : ''}</span>
                  </span>
                </button>
              ))}
            </section>
          )
        })}
        {countBookCheck(check).errors + countBookCheck(check).warnings === 0 && <p className="book-note">כל הפרקים נבדקו: אין טקסט עודף, שום דבר לא חורג מהעמודים, והגופנים והתמונות במקומם.</p>}
      </div>
    </div>
  )
}
