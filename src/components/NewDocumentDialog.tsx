import { useEffect, useState, type ReactNode } from 'react'
import {
  MAX_COLUMNS,
  MAX_PAGES,
  MAX_PAGE_PT,
  MAX_SIDE_PT,
  MIN_PAGE_PT,
  validateDoc,
  type DocSettings,
  type Sides,
} from '../document'
import { PAGE_PRESETS, UNIT_OPTIONS, matchPreset, type Unit } from '../units'
import { NumberField } from './NumberField'

interface Props {
  initial: DocSettings
  onCreate: (doc: DocSettings) => void
  onClose: () => void
  /** live draft shown in the workspace next to the panel while "Preview" is on, null otherwise */
  onPreview: (doc: DocSettings | null) => void
  /** 'new': create a document. 'setup': change the settings of the open one (no name, no live preview). */
  mode?: 'new' | 'setup'
}

type SidesKey = 'margins' | 'bleed' | 'slug'

export function NewDocumentDialog({ initial, onCreate, onClose, onPreview, mode = 'new' }: Props) {
  const setup = mode === 'setup'
  const [d, setD] = useState<DocSettings>(initial)
  const [preview, setPreview] = useState(false)
  const [linked, setLinked] = useState<Record<SidesKey, boolean>>({ margins: true, bleed: true, slug: false })

  const error = validateDoc(d)
  const patch = (p: Partial<DocSettings>) => setD((s) => ({ ...s, ...p }))

  useEffect(() => {
    onPreview(!setup && preview && !error ? d : null)
  }, [setup, preview, error, d, onPreview])

  const setSide = (key: SidesKey, side: keyof Sides, v: number) =>
    setD((s) => ({
      ...s,
      [key]: linked[key] ? { top: v, bottom: v, left: v, right: v } : { ...s[key], [side]: v },
    }))

  const landscape = d.width > d.height
  const setOrientation = (wantLandscape: boolean) => {
    if (wantLandscape !== landscape) patch({ width: d.height, height: d.width })
  }

  const activePreset = matchPreset(d.width, d.height)
  const pickPreset = (w: number, h: number) => (landscape ? patch({ width: h, height: w }) : patch({ width: w, height: h }))

  const create = () => {
    if (!error) onCreate({ ...d, name: setup ? initial.name : d.name.trim() || 'ללא שם' })
  }

  return (
    <aside className="nd-panel" role="dialog" aria-label={setup ? 'הגדרת מסמך' : 'מסמך חדש'}>
      <div className="nd-scroll">
        <h2 className="nd-heading">{setup ? 'הגדרת מסמך' : 'פרטי המסמך'}</h2>
        {!setup && (
          <input
            className="nd-name"
            aria-label="שם המסמך"
            value={d.name}
            onChange={(e) => patch({ name: e.target.value })}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}

        <div className="field-label">גודל עמוד</div>
        <div className="presets">
          {PAGE_PRESETS.map((p) => {
            const [pw, ph] = [p.width, p.height]
            const scale = 30 / ph
            return (
              <button
                key={p.id}
                className={'preset' + (activePreset?.id === p.id ? ' active' : '')}
                onClick={() => pickPreset(pw, ph)}
              >
                <span className="preset-page" style={{ width: pw * scale, height: ph * scale }} />
                <span>{p.label}</span>
              </button>
            )
          })}
          <button
            className={'preset' + (!activePreset ? ' active' : '')}
            onClick={() => document.getElementById('nd-width')?.focus()}
          >
            <span className="preset-page custom" />
            <span>מותאם אישית</span>
          </button>
        </div>

        <div className="grid2">
          <Field label="רוחב">
            <NumberField
              id="nd-width"
              value={d.width}
              unit={d.unit}
              min={MIN_PAGE_PT}
              max={MAX_PAGE_PT}
              onChange={(v) => patch({ width: v })}
            />
          </Field>
          <Field label="יחידות">
            <select className="select" value={d.unit} onChange={(e) => patch({ unit: e.target.value as Unit })}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="גובה">
            <NumberField value={d.height} unit={d.unit} min={MIN_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => patch({ height: v })} />
          </Field>
          <div />
          <Field label="כיוון העמוד">
            <div className="toggle-group">
              <button className={!landscape ? 'on' : ''} title="לאורך" aria-label="לאורך" onClick={() => setOrientation(false)}>
                <svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="1" /></svg>
              </button>
              <button className={landscape ? 'on' : ''} title="לרוחב" aria-label="לרוחב" onClick={() => setOrientation(true)}>
                <svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="1" /></svg>
              </button>
            </div>
          </Field>
          <Field label="כיוון הכריכה">
            <div className="toggle-group">
              <button className={d.binding === 'rtl' ? 'on' : ''} title="מימין לשמאל (עברית)" aria-label="מימין לשמאל" onClick={() => patch({ binding: 'rtl' })}>
                <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="11" rx="1" /><path d="M5 19h14M8 16l-3 3 3 3" /></svg>
              </button>
              <button className={d.binding === 'ltr' ? 'on' : ''} title="משמאל לימין (אנגלית)" aria-label="משמאל לימין" onClick={() => patch({ binding: 'ltr' })}>
                <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="11" rx="1" /><path d="M5 19h14M16 16l3 3-3 3" /></svg>
              </button>
            </div>
          </Field>
          <Field label="עמודים">
            <NumberField value={d.pages} min={1} max={MAX_PAGES} onChange={(v) => patch({ pages: v })} />
          </Field>
          <Field label="עמודים מקבילים">
            <Check checked={d.facingPages} onChange={(v) => patch({ facingPages: v })} />
          </Field>
          <Field label="מספר עמוד ראשון">
            <NumberField value={d.startPage} min={1} max={MAX_PAGES} onChange={(v) => patch({ startPage: v })} />
          </Field>
          <Field label="מסגרת טקסט ראשית">
            <Check checked={d.primaryTextFrame} onChange={(v) => patch({ primaryTextFrame: v })} />
          </Field>
        </div>

        <hr className="nd-rule" />

        <div className="grid2">
          <Field label="עמודות">
            <NumberField value={d.columns} min={1} max={MAX_COLUMNS} onChange={(v) => patch({ columns: v })} />
          </Field>
          <Field label="מרווח בין עמודות">
            <NumberField value={d.gutter} unit={d.unit} min={0} max={MAX_SIDE_PT} onChange={(v) => patch({ gutter: v })} />
          </Field>
        </div>

        <Section title="שוליים">
          <SidesEditor
            value={d.margins}
            unit={d.unit}
            facing={d.facingPages}
            linked={linked.margins}
            onLink={() => setLinked((l) => ({ ...l, margins: !l.margins }))}
            onChange={(side, v) => setSide('margins', side, v)}
          />
        </Section>

        <Section title="גלישה ואזור מידע">
          <div className="sub-label">גלישה (Bleed)</div>
          <SidesEditor
            value={d.bleed}
            unit={d.unit}
            facing={d.facingPages}
            linked={linked.bleed}
            onLink={() => setLinked((l) => ({ ...l, bleed: !l.bleed }))}
            onChange={(side, v) => setSide('bleed', side, v)}
          />
          <div className="sub-label">אזור מידע (Slug)</div>
          <SidesEditor
            value={d.slug}
            unit={d.unit}
            facing={d.facingPages}
            linked={linked.slug}
            onLink={() => setLinked((l) => ({ ...l, slug: !l.slug }))}
            onChange={(side, v) => setSide('slug', side, v)}
          />
        </Section>
      </div>

      {error && <div className="nd-error">{error}</div>}
      <footer className="nd-footer">
        {setup ? (
          <span className="check-inline" />
        ) : (
          <label className="check-inline">
            <Check checked={preview} onChange={setPreview} />
            <span>תצוגה מקדימה</span>
          </label>
        )}
        <button className="btn primary" disabled={!!error} onClick={create}>
          {setup ? 'אישור' : 'צור'}
        </button>
        <button className="btn outline" onClick={onClose}>
          סגור
        </button>
      </footer>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input type="checkbox" className="check" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="nd-section">
      <button className="nd-section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 10 6" className={open ? '' : 'closed'}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.500" />
        </svg>
        {title}
      </button>
      {open && children}
    </div>
  )
}

function SidesEditor({
  value,
  unit,
  facing,
  linked,
  onLink,
  onChange,
}: {
  value: Sides
  unit: Unit
  facing: boolean
  linked: boolean
  onLink: () => void
  onChange: (side: keyof Sides, pt: number) => void
}) {
  const labels: Record<keyof Sides, string> = {
    top: 'עליון',
    bottom: 'תחתון',
    left: facing ? 'פנימי' : 'שמאל',
    right: facing ? 'חיצוני' : 'ימין',
  }
  // The interface is right-to-left, so the first field of a row sits on the right: physical
  // "right" goes before "left", while inside (= left) goes before outside (= right).
  const order: (keyof Sides)[] = facing ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom', 'right', 'left']
  return (
    <div className="sides">
      {order.map((k) => (
        <Field key={k} label={labels[k]}>
          <NumberField value={value[k]} unit={unit} min={0} max={MAX_SIDE_PT} onChange={(v) => onChange(k, v)} />
        </Field>
      ))}
      <button
        className={'link-btn' + (linked ? ' on' : '')}
        aria-pressed={linked}
        title={linked ? 'בטל קישור בין כל הערכים' : 'קשר בין כל הערכים'}
        onClick={onLink}
      >
        <svg viewBox="0 0 24 24">
          {linked ? (
            <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
          ) : (
            <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1M4 4l16 16" />
          )}
        </svg>
      </button>
    </div>
  )
}
