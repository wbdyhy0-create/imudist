import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MAX_COLUMNS,
  MAX_PAGES,
  MAX_PAGE_PT,
  MAX_PER_ROW,
  MAX_SIDE_PT,
  MIN_PAGE_PT,
  customMarginCount,
  customSizeCount,
  marginsOf,
  normalizeSizes,
  pageSize,
  validateDoc,
  withPageMargins,
  withPageSize,
  type DocSettings,
  type Sides,
} from '../document'
import { computeLayout, pageMargins } from '../layout'
import { PAGE_PRESETS, UNIT_OPTIONS, formatNumber, fromPt, matchPreset, unitSuffix, type Unit } from '../units'
import { NumberField } from './NumberField'
import { SidesEditor } from './NewDocumentDialog'
import { t } from '../i18n'

interface Props {
  initial: DocSettings
  /** how many empty text frames made automatically on the margins the document has now */
  removableFrames: number
  onApply: (next: DocSettings, options: { dropEmptyFrames: boolean; resizeTextFrames: boolean }) => void
  onClose: () => void
}

type TabId = 'pages' | 'size' | 'margins' | 'bleed'
type SidesKey = 'margins' | 'bleed' | 'slug'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'pages', label: 'עמודים', icon: <path d="M3 5h7v14H3zM14 5h7v14h-7z" /> },
  { id: 'size', label: 'גודל', icon: <path d="M5 5h14v14H5zM5 9h4M5 13h4M9 5v4" /> },
  { id: 'margins', label: 'שוליים', icon: <path d="M4 4h16v16H4zM8 8h8v8H8zM12 8v8" /> },
  { id: 'bleed', label: 'גלישה', icon: <path d="M7 7h10v10H7zM3 3h18v18H3z" strokeDasharray="2.500 2" /> },
]

/** How many pages the board draws at most (a long document would make it unreadable and slow). */
const BOARD_LIMIT = 48

const rowChoices = [1, 2, 3, 4, 5, 6]

/** The document settings window: controls on one side, a live board of all the pages on the other. */
export function DocumentSetupDialog({ initial, removableFrames, onApply, onClose }: Props) {
  const [d, setD] = useState<DocSettings>(initial)
  const [tab, setTab] = useState<TabId>('pages')
  /** the page the board has selected (the target of "this page only") */
  const [sel, setSel] = useState(0)
  const [scope, setScope] = useState<'all' | 'page'>('all')
  const [linked, setLinked] = useState<Record<SidesKey, boolean>>({ margins: true, bleed: true, slug: false })
  /** when switching to manual text frames: also delete the empty ones that already exist */
  const [removeEmpty, setRemoveEmpty] = useState(true)
  const [resizeTextFrames, setResizeTextFrames] = useState(true)

  const error = validateDoc(d)
  const patch = (p: Partial<DocSettings>) => setD((s) => ({ ...s, ...p }))
  const page = Math.min(sel, d.pages - 1)
  const custom = customSizeCount(d)
  const customMargins = customMarginCount(d)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setSide = (key: 'bleed' | 'slug', side: keyof Sides, v: number) =>
    setD((s) => ({ ...s, [key]: linked[key] ? { top: v, bottom: v, left: v, right: v } : { ...s[key], [side]: v } }))
  /** margins of the selected page only, or of every page (see "scope") */
  const setMargin = (side: keyof Sides, v: number) =>
    setD((s) => {
      const cur = scope === 'all' ? s.margins : marginsOf(s, Math.min(sel, s.pages - 1))
      const next: Sides = linked.margins ? { top: v, bottom: v, left: v, right: v } : { ...cur, [side]: v }
      return withPageMargins(s, scope === 'all' ? 'all' : Math.min(sel, s.pages - 1), next)
    })

  // ── page size, for all the pages or for the selected one ─────────────────────
  const target = scope === 'all' ? 'all' : page
  const shown = scope === 'all' ? { w: d.width, h: d.height } : pageSize(d, page)
  const landscape = shown.w > shown.h
  const setSize = (w: number, h: number) => setD((s) => withPageSize(s, target, w, h))
  const preset = matchPreset(shown.w, shown.h)

  const apply = () => {
    if (!error) onApply(normalizeSizes(d), { dropEmptyFrames: !d.primaryTextFrame && removeEmpty && removableFrames > 0, resizeTextFrames })
  }

  return (
    <div className="modal-backdrop">
      <div className="setup-window" role="dialog" aria-modal="true" aria-label={t('הגדרות מסמך')}>
        <header className="setup-head">
          <div>
            <h2>{t('הגדרות מסמך')}</h2>
            <p>
              <bdi>{d.name}</bdi> · {d.pages === 1 ? t('עמוד אחד') : t('{count} עמודים', { count: d.pages })}
              {custom > 0 && ` · ${t('{count} בגודל אישי', { count: custom })}`}
              {customMargins > 0 && ` · ${t('{count} בשוליים אישיים', { count: customMargins })}`}
            </p>
          </div>
          <button className="setup-x" aria-label={t('סגור')} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="setup-body">
          <section className="setup-controls">
            <div className="setup-tabs" role="tablist" aria-label={t('קטגוריות')}>
              {TABS.map((item) => (
                <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {item.icon}
                  </svg>
                  {t(item.label)}
                </button>
              ))}
            </div>

            <div className="setup-pane" role="tabpanel">
              {tab === 'pages' && (
                <>
                  <div className="setup-row">
                    <Labeled label={t('מספר עמודים')}>
                      <NumberField value={d.pages} min={1} max={MAX_PAGES} onChange={(v) => patch({ pages: v })} />
                    </Labeled>
                    <Labeled label={t('מספור מתחיל מ')}>
                      <NumberField value={d.startPage} min={1} max={MAX_PAGES} onChange={(v) => patch({ startPage: v })} />
                    </Labeled>
                  </div>

                  <div className="setup-group">
                    <div className="setup-label">{t('תיבות טקסט בעמודים')}</div>
                    <div className="seg" role="radiogroup" aria-label={t('יצירת תיבות טקסט')}>
                      <button role="radio" aria-checked={d.primaryTextFrame} className={d.primaryTextFrame ? 'on' : ''} onClick={() => patch({ primaryTextFrame: true })}>
                        {t('אוטומטית')}
                      </button>
                      <button role="radio" aria-checked={!d.primaryTextFrame} className={!d.primaryTextFrame ? 'on' : ''} onClick={() => patch({ primaryTextFrame: false })}>
                        {t('ידנית')}
                      </button>
                    </div>
                    <p className="setup-hint">
                      {d.primaryTextFrame
                        ? t('כל עמוד מקבל תיבת טקסט שיושבת בדיוק על השוליים (או תיבה לכל עמודה), גם עמודים שיתווספו אחר כך.')
                        : t('העמודים נשארים ריקים, ואתה יוצר תיבות טקסט בעצמך בכלי הטקסט או בהצבת קובץ.')}
                    </p>
                    {!d.primaryTextFrame && removableFrames > 0 && (
                      <label className="dlg-check">
                        <input type="checkbox" checked={removeEmpty} onChange={(e) => setRemoveEmpty(e.target.checked)} />
                        {removableFrames === 1
                          ? t('מחק גם את תיבת הטקסט הריקה שכבר נוצרה')
                          : t('מחק גם את {count} תיבות הטקסט הריקות שכבר נוצרו', { count: removableFrames })}
                      </label>
                    )}
                  </div>

                  <div className="setup-group">
                    <div className="setup-label">{t('אופן הצגת העמודים')}</div>
                    <div className="row-cards" role="radiogroup" aria-label={t('עמודים בשורה')}>
                      {rowChoices.map((n) => (
                        <button
                          key={n}
                          role="radio"
                          aria-checked={d.perRow === n}
                          className={'row-card' + (d.perRow === n ? ' on' : '')}
                          title={n === 1 ? t('כל עמוד בשורה משלו') : t('{count} עמודים זה לצד זה', { count: n })}
                          onClick={() => patch({ perRow: n, rowsCustom: false, pageJoins: [], facingPages: n >= 2 ? d.facingPages : false })}
                        >
                          <RowGlyph n={n} />
                          <span>{n === 1 ? t('עמוד בשורה') : n === 2 ? t('זוגות') : t('{count} בשורה', { count: n })}</span>
                        </button>
                      ))}
                      <div className="row-other">
                        <NumberField value={d.perRow} min={1} max={MAX_PER_ROW} ariaLabel={t('מספר עמודים בשורה')} onChange={(v) => patch({ perRow: v, rowsCustom: false, pageJoins: [], facingPages: v >= 2 ? d.facingPages : false })} />
                      </div>
                    </div>
                    <p className="setup-hint">
                      {d.rowsCustom
                        ? t('העמודים מסודרים ידנית (הוספת עמוד בצד עמוד אחר). בחירה כאן מסדרת את כולם מחדש בשורות שוות.')
                        : t('עמוד בשורה: כל העמודים זה מתחת לזה. זוגות: שורה ראשונה עמודים 1-2, שורה שנייה 3-4, וכן הלאה. עמודים באותה שורה עומדים זה ליד זה, ואפשר לתת לכל אחד גודל משלו (בלשונית ״גודל״).')}
                    </p>
                  </div>

                  <Switch
                    checked={d.facingPages && d.perRow >= 2}
                    disabled={d.perRow < 2}
                    onChange={(v) => patch({ facingPages: v })}
                    title={t('דף כפול')}
                    hint={d.perRow < 2 ? t('זמין כשיש לפחות שני עמודים בשורה') : t('העמודים בשורה נוגעים זה בזה, ולשוליים יש צד פנימי וצד חיצוני')}
                  />

                  <div className="setup-group">
                    <div className="setup-label">{t('כיוון עיון')}</div>
                    <div className="seg" role="radiogroup" aria-label={t('כיוון עיון')}>
                      <button role="radio" aria-checked={d.binding === 'rtl'} className={d.binding === 'rtl' ? 'on' : ''} onClick={() => patch({ binding: 'rtl' })}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M20 12H5M10 6l-6 6 6 6" />
                        </svg>
                        {t('מימין לשמאל')}
                      </button>
                      <button role="radio" aria-checked={d.binding === 'ltr'} className={d.binding === 'ltr' ? 'on' : ''} onClick={() => patch({ binding: 'ltr' })}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 12h15M14 6l6 6-6 6" />
                        </svg>
                        {t('משמאל לימין')}
                      </button>
                    </div>
                  </div>

                </>
              )}

              {tab === 'size' && (
                <>
                  <ScopeSwitch scope={scope} onScope={setScope} label={t('עמוד {number} בלבד', { number: d.startPage + page })} />

                  <div className="size-cards">
                    {PAGE_PRESETS.map((p) => (
                      <button key={p.id} className={'size-card' + (preset?.id === p.id ? ' on' : '')} onClick={() => setSize(landscape ? p.height : p.width, landscape ? p.width : p.height)}>
                        <span className="size-sheet" style={{ width: (p.width / p.height) * 34, height: 34 }} />
                        <b>{t(p.label)}</b>
                      </button>
                    ))}
                    <div className={'size-card' + (!preset ? ' on' : '')} aria-hidden="true">
                      <span className="size-sheet dashed" style={{ width: 24, height: 34 }} />
                      <b>{t('מותאם')}</b>
                    </div>
                  </div>

                  <div className="setup-row">
                    <Labeled label={t('רוחב')}>
                      <NumberField value={shown.w} unit={d.unit} min={MIN_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => setSize(v, shown.h)} />
                    </Labeled>
                    <Labeled label={t('גובה')}>
                      <NumberField value={shown.h} unit={d.unit} min={MIN_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => setSize(shown.w, v)} />
                    </Labeled>
                  </div>
                  <div className="setup-row">
                    <Labeled label={t('כיוון')}>
                      <div className="seg small" role="radiogroup" aria-label={t('כיוון העמוד')}>
                        <button role="radio" aria-checked={!landscape} className={!landscape ? 'on' : ''} onClick={() => landscape && setSize(shown.h, shown.w)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="7" y="3" width="10" height="18" rx="1" />
                          </svg>
                          {t('לאורך')}
                        </button>
                        <button role="radio" aria-checked={landscape} className={landscape ? 'on' : ''} onClick={() => !landscape && setSize(shown.h, shown.w)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="7" width="18" height="10" rx="1" />
                          </svg>
                          {t('לרוחב')}
                        </button>
                      </div>
                    </Labeled>
                    <Labeled label={t('יחידות מידה')}>
                      <select className="select" value={d.unit} onChange={(e) => patch({ unit: e.target.value as Unit })}>
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {t(u.label)}
                          </option>
                        ))}
                      </select>
                    </Labeled>
                  </div>

                  <label className="dlg-check" title={t('תיבות הטקסט, התמונות והצורות של כל עמוד גדלות או קטנות ביחס לגודל העמוד ולשוליים: עמוד PDF שיובא ממלא את השטח שבין השוליים גם אחרי השינוי')}>
                    <input type="checkbox" checked={resizeTextFrames} onChange={(event) => setResizeTextFrames(event.target.checked)} />
                    {t('התאם תיבות טקסט, תמונות וצורות לגודל ולשוליים החדשים')}
                  </label>

                  {custom > 0 && (
                    <div className="custom-note">
                      <span>{custom === 1 ? t('עמוד אחד בגודל שונה משאר המסמך.') : t('{count} עמודים בגודל שונה משאר המסמך.', { count: custom })}</span>
                      <button className="btn small" onClick={() => setD((s) => ({ ...s, pageSizes: [] }))}>
                        {t('אפס לגודל אחיד')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === 'margins' && (
                <>
                  <ScopeSwitch scope={scope} onScope={setScope} label={t('עמוד {number} בלבד', { number: d.startPage + page })} />
                  <div className="setup-group">
                    <div className="setup-label">{t('שוליים')}</div>
                    <SidesEditor
                      value={scope === 'all' ? d.margins : marginsOf(d, page)}
                      unit={d.unit}
                      facing={d.facingPages && d.perRow >= 2}
                      linked={linked.margins}
                      onLink={() => setLinked((l) => ({ ...l, margins: !l.margins }))}
                      onChange={setMargin}
                    />
                  </div>
                  {customMargins > 0 && (
                    <div className="custom-note">
                      <span>{customMargins === 1 ? t('עמוד אחד עם שוליים שונים משאר המסמך.') : t('{count} עמודים עם שוליים שונים משאר המסמך.', { count: customMargins })}</span>
                      <button className="btn small" onClick={() => setD((s) => ({ ...s, pageMargins: [] }))}>
                        {t('אפס לשוליים אחידים')}
                      </button>
                    </div>
                  )}
                  <label className="dlg-check">
                    <input type="checkbox" checked={resizeTextFrames} onChange={(event) => setResizeTextFrames(event.target.checked)} />
                    {t('התאם תיבות טקסט, תמונות וצורות לגודל ולשוליים החדשים')}
                  </label>
                  <div className="setup-row">
                    <Labeled label={t('עמודות בעמוד')}>
                      <NumberField value={d.columns} min={1} max={MAX_COLUMNS} onChange={(v) => patch({ columns: v })} />
                    </Labeled>
                    <Labeled label={t('רווח בין העמודות')}>
                      <NumberField value={d.gutter} unit={d.unit} min={0} max={MAX_SIDE_PT} onChange={(v) => patch({ gutter: v })} />
                    </Labeled>
                  </div>
                </>
              )}

              {tab === 'bleed' && (
                <>
                  <div className="setup-group">
                    <div className="setup-label">{t('גלישה')}</div>
                    <p className="setup-hint">{t('שטח שנמשך אל מעבר לקצה העמוד, כדי שצבעים ותמונות לא יפסיקו בקו לבן אחרי החיתוך.')}</p>
                    <SidesEditor
                      value={d.bleed}
                      unit={d.unit}
                      facing={d.facingPages && d.perRow >= 2}
                      linked={linked.bleed}
                      onLink={() => setLinked((l) => ({ ...l, bleed: !l.bleed }))}
                      onChange={(side, v) => setSide('bleed', side, v)}
                    />
                  </div>
                  <div className="setup-group">
                    <div className="setup-label">{t('אזור מידע')}</div>
                    <p className="setup-hint">{t('שטח מחוץ לעמוד להערות ולסימני הדפסה.')}</p>
                    <SidesEditor
                      value={d.slug}
                      unit={d.unit}
                      facing={d.facingPages && d.perRow >= 2}
                      linked={linked.slug}
                      onLink={() => setLinked((l) => ({ ...l, slug: !l.slug }))}
                      onChange={(side, v) => setSide('slug', side, v)}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="setup-board-wrap" aria-label={t('לוח העמודים')}>
            <div className="setup-board-title">
              <span>{t('כך יסודרו העמודים')}</span>
              <span className="muted">{t('לחיצה על עמוד בוחרת אותו')}</span>
            </div>
            <SetupBoard doc={d} selected={page} onSelect={setSel} />
            {d.pages > BOARD_LIMIT && <p className="setup-hint">{t('מוצגים {count} העמודים הראשונים.', { count: BOARD_LIMIT })}</p>}
          </section>
        </div>

        <footer className="setup-foot">
          <p className={'setup-error' + (error ? ' on' : '')} role="alert">
            {error}
          </p>
          <button className="btn" onClick={onClose}>
            {t('ביטול')}
          </button>
          <button className="btn primary" disabled={!!error} onClick={apply}>
            {t('החל שינויים')}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** "Change all the pages" or "only the page selected on the board". */
function ScopeSwitch({ scope, onScope, label }: { scope: 'all' | 'page'; onScope: (s: 'all' | 'page') => void; label: string }) {
  return (
    <div className="setup-group">
      <div className="setup-label">{t('השינוי חל על')}</div>
      <div className="seg" role="radiogroup" aria-label={t('היקף השינוי')}>
        <button role="radio" aria-checked={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => onScope('all')}>
          {t('כל העמודים')}
        </button>
        <button role="radio" aria-checked={scope === 'page'} className={scope === 'page' ? 'on' : ''} onClick={() => onScope('page')}>
          {label}
        </button>
      </div>
      {scope === 'page' && <p className="setup-hint">{t('אפשר לבחור עמוד אחר בלחיצה עליו בלוח שבצד.')}</p>}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="setup-field">
      <div className="setup-label">{label}</div>
      {children}
    </div>
  )
}

/** A yes / no setting shown as a switch with an explanation. */
function Switch({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <div className={'setup-switch' + (disabled ? ' off' : '')}>
      <div>
        <div className="setup-label">{title}</div>
        <p className="setup-hint">{hint}</p>
      </div>
      <button role="switch" aria-checked={checked} aria-label={title} disabled={disabled} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

/** n small pages side by side: the picture on a "pages per row" card. */
function RowGlyph({ n }: { n: number }) {
  const w = 7
  const gap = 2
  const width = n * w + (n - 1) * gap
  return (
    <svg viewBox={`0 0 ${width} 10`} width={Math.min(46, width * 2.2)} height={Math.min(46, width * 2.2) * (10 / width)} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={i * (w + gap)} y="0" width={w} height="10" rx="1" />
      ))}
    </svg>
  )
}

/** All the pages drawn as they will stand, each with its number and size. Click a page to select it. */
function SetupBoard({ doc, selected, onSelect }: { doc: DocSettings; selected: number; onSelect: (i: number) => void }) {
  const shown = Math.min(doc.pages, BOARD_LIMIT)
  const layout = useMemo(() => computeLayout({ ...doc, pages: shown, pageSizes: doc.pageSizes.slice(0, shown) }), [doc, shown])
  const pad = 24
  const b = layout.bounds
  const viewBox = `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`

  return (
    <div className="setup-board">
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMin meet" role="group" aria-label={t('עמודים')} style={{ width: `min(100%, ${Math.round((b.maxX - b.minX + pad * 2) * 0.55)}px)` }}>
        {layout.spreads.map((s) =>
          s.pages.map((p) => {
            const m = pageMargins(doc, p.side, p.index)
            const fs = Math.min(p.w, p.h) * 0.11
            const on = p.index === selected
            return (
              <g key={p.index} className={'board-page' + (on ? ' on' : '')} onClick={() => onSelect(p.index)}>
                <rect className="board-paper" x={p.x} y={s.y} width={p.w} height={p.h} />
                <rect className="board-margin" x={p.x + m.left} y={s.y + m.top} width={Math.max(0, p.w - m.left - m.right)} height={Math.max(0, p.h - m.top - m.bottom)} />
                <text className="board-num" x={p.x + p.w / 2} y={s.y + p.h / 2} fontSize={fs * 1.6} textAnchor="middle" dominantBaseline="middle">
                  {p.number}
                </text>
                <text className="board-size" x={p.x + p.w / 2} y={s.y + p.h / 2 + fs * 1.6} fontSize={fs * 0.72} textAnchor="middle" dominantBaseline="middle">
                  {`${formatNumber(fromPt(p.w, doc.unit))} × ${formatNumber(fromPt(p.h, doc.unit))} ${unitSuffix(doc.unit)}`}
                </text>
              </g>
            )
          }),
        )}
      </svg>
    </div>
  )
}
