import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_GUIDE_COLOR, MAX_GUIDES, type DocSettings } from '../document'
import { DEFAULT_GUIDE_SPEC, guidePositions, type GuideMode, type GuideSpec } from '../guides'
import { pageSidesOf } from '../layout'
import { UNIT_OPTIONS, type Unit } from '../units'
import { GuideColors } from './GuideColors'
import { NumberField } from './NumberField'

export interface CreateGuidesRequest {
  spec: GuideSpec
  color: string
  /** delete the guides already on the affected pages first */
  replace: boolean
  allPages: boolean
}

interface Props {
  doc: DocSettings
  /** the page the guides go on (unless "all pages") */
  page: number
  initialColor: string
  /** how many guides the document has now */
  existing: number
  onCreate: (r: CreateGuidesRequest) => void
  onClose: () => void
}

const MODES: { id: GuideMode; label: string; hint: string }[] = [
  { id: 'divide', label: 'חלוקה שווה', hint: 'מחלק את השטח לעמודות ולשורות שוות, עם רווח קבוע ביניהן' },
  { id: 'spacing', label: 'מרווח קבוע', hint: 'קווים במרחק קבוע זה מזה, החל מתחילת השטח' },
]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

/** "Create guides": several guides at once, by count and fixed spacing. */
export function CreateGuidesDialog({ doc, page, initialColor, existing, onCreate, onClose }: Props) {
  const [spec, setSpec] = useState<GuideSpec>({ ...DEFAULT_GUIDE_SPEC })
  const [unit, setUnit] = useState<Unit>(doc.unit)
  const [color, setColor] = useState(initialColor || DEFAULT_GUIDE_COLOR)
  const [replace, setReplace] = useState(false)
  const [allPages, setAllPages] = useState(false)
  const patch = (p: Partial<GuideSpec>) => setSpec((s) => ({ ...s, ...p }))

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

  // how many guides the pages get (pages on the left / right can differ in their margins)
  const total = useMemo(() => {
    const sides = pageSidesOf(doc)
    const targets = allPages ? Array.from({ length: doc.pages }, (_, i) => i) : [page]
    let v = 0
    let h = 0
    for (const i of targets) {
      const g = guidePositions(doc, sides[i] ?? 'single', spec)
      v += g.v.length
      h += g.h.length
    }
    return { v, h }
  }, [doc, spec, allPages, page])

  const count = total.v + total.h
  const tooMany = (replace ? 0 : existing) + count > MAX_GUIDES
  const divide = spec.mode === 'divide'

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="יצירת קווי עזר">
        <h2>יצירת קווי עזר</h2>

        <div className="place-modes" role="group" aria-label="אופן היצירה">
          {MODES.map((m) => (
            <button key={m.id} className={spec.mode === m.id ? 'on' : ''} title={m.hint} onClick={() => patch({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="dlg-cols">
          <fieldset className="dlg-block">
            <legend>{divide ? 'עמודות (קווים אנכיים)' : 'קווים אנכיים'}</legend>
            <Field label={divide ? 'מספר עמודות' : 'מספר קווים'}>
              <NumberField value={spec.cols} min={0} max={200} onChange={(v) => patch({ cols: v })} />
            </Field>
            <Field label={divide ? 'רווח בין העמודות' : 'מרווח בין הקווים'}>
              <NumberField value={spec.colGap} unit={unit} min={0} max={5000} onChange={(v) => patch({ colGap: v })} />
            </Field>
          </fieldset>
          <fieldset className="dlg-block">
            <legend>{divide ? 'שורות (קווים אופקיים)' : 'קווים אופקיים'}</legend>
            <Field label={divide ? 'מספר שורות' : 'מספר קווים'}>
              <NumberField value={spec.rows} min={0} max={200} onChange={(v) => patch({ rows: v })} />
            </Field>
            <Field label={divide ? 'רווח בין השורות' : 'מרווח בין הקווים'}>
              <NumberField value={spec.rowGap} unit={unit} min={0} max={5000} onChange={(v) => patch({ rowGap: v })} />
            </Field>
          </fieldset>
        </div>

        <div className="dlg-cols">
          <Field label="יחידות המרווח">
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={divide ? 'חלוקה של' : 'התחלה מ'}>
            <div className="place-modes" role="group">
              <button className={spec.area === 'margins' ? 'on' : ''} onClick={() => patch({ area: 'margins' })}>
                שולי העמוד
              </button>
              <button className={spec.area === 'page' ? 'on' : ''} onClick={() => patch({ area: 'page' })}>
                קצה העמוד
              </button>
            </div>
          </Field>
        </div>

        <Field label="צבע">
          <GuideColors value={color} onChange={setColor} />
        </Field>

        <label className="dlg-check">
          <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} />
          החל על כל עמודי המסמך
        </label>
        <label className="dlg-check">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          מחק קודם את קווי העזר שכבר קיימים {allPages ? 'בעמודים' : 'בעמוד'}
        </label>

        <p className={'dlg-summary' + (count === 0 || tooMany ? ' warn' : '')} role="status">
          {tooMany
            ? `יותר מדי קווי עזר (המקסימום במסמך: ${MAX_GUIDES}).`
            : count === 0
              ? 'לפי ההגדרות האלה לא ייווצרו קווים.'
              : `ייווצרו קווים: ${total.v} אנכיים, ${total.h} אופקיים${allPages ? ` (בכל ${doc.pages} העמודים)` : ''}.`}
        </p>

        <div className="modal-buttons">
          <button className="btn primary" disabled={count === 0 || tooMany} onClick={() => onCreate({ spec, color, replace, allPages })}>
            צור קווים
          </button>
          <button className="btn" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
