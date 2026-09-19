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
  /** live draft shown in the workspace behind the panel while "Preview" is on, null otherwise */
  onPreview: (doc: DocSettings | null) => void
}

type SidesKey = 'margins' | 'bleed' | 'slug'

export function NewDocumentDialog({ initial, onCreate, onClose, onPreview }: Props) {
  const [d, setD] = useState<DocSettings>(initial)
  const [preview, setPreview] = useState(false)
  const [linked, setLinked] = useState<Record<SidesKey, boolean>>({ margins: true, bleed: true, slug: false })

  const error = validateDoc(d)
  const patch = (p: Partial<DocSettings>) => setD((s) => ({ ...s, ...p }))

  useEffect(() => {
    onPreview(preview && !error ? d : null)
  }, [preview, error, d, onPreview])

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
    if (!error) onCreate({ ...d, name: d.name.trim() || 'Untitled' })
  }

  return (
    <aside className="nd-panel" role="dialog" aria-label="New Document">
      <div className="nd-scroll">
        <h2 className="nd-heading">Preset details</h2>
        <input
          className="nd-name"
          aria-label="Document name"
          value={d.name}
          onChange={(e) => patch({ name: e.target.value })}
          onFocus={(e) => e.currentTarget.select()}
        />

        <div className="field-label">Page size</div>
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
            <span>Custom</span>
          </button>
        </div>

        <div className="grid2">
          <Field label="Width">
            <NumberField
              id="nd-width"
              value={d.width}
              unit={d.unit}
              min={MIN_PAGE_PT}
              max={MAX_PAGE_PT}
              onChange={(v) => patch({ width: v })}
            />
          </Field>
          <Field label="Units">
            <select className="select" value={d.unit} onChange={(e) => patch({ unit: e.target.value as Unit })}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Height">
            <NumberField value={d.height} unit={d.unit} min={MIN_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => patch({ height: v })} />
          </Field>
          <div />
          <Field label="Orientation">
            <div className="toggle-group">
              <button className={!landscape ? 'on' : ''} title="Portrait" aria-label="Portrait" onClick={() => setOrientation(false)}>
                <svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="1" /></svg>
              </button>
              <button className={landscape ? 'on' : ''} title="Landscape" aria-label="Landscape" onClick={() => setOrientation(true)}>
                <svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="1" /></svg>
              </button>
            </div>
          </Field>
          <Field label="Binding">
            <div className="toggle-group">
              <button className={d.binding === 'ltr' ? 'on' : ''} title="Left to right (English)" aria-label="Left to right" onClick={() => patch({ binding: 'ltr' })}>
                <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="11" rx="1" /><path d="M5 19h14M16 16l3 3-3 3" /></svg>
              </button>
              <button className={d.binding === 'rtl' ? 'on' : ''} title="Right to left (Hebrew)" aria-label="Right to left" onClick={() => patch({ binding: 'rtl' })}>
                <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="11" rx="1" /><path d="M5 19h14M8 16l-3 3 3 3" /></svg>
              </button>
            </div>
          </Field>
          <Field label="Pages">
            <NumberField value={d.pages} min={1} max={MAX_PAGES} onChange={(v) => patch({ pages: v })} />
          </Field>
          <Field label="Facing pages">
            <Check checked={d.facingPages} onChange={(v) => patch({ facingPages: v })} />
          </Field>
          <Field label="Start #">
            <NumberField value={d.startPage} min={1} max={MAX_PAGES} onChange={(v) => patch({ startPage: v })} />
          </Field>
          <Field label="Primary text frame">
            <Check checked={d.primaryTextFrame} onChange={(v) => patch({ primaryTextFrame: v })} />
          </Field>
        </div>

        <hr className="nd-rule" />

        <div className="grid2">
          <Field label="Columns">
            <NumberField value={d.columns} min={1} max={MAX_COLUMNS} onChange={(v) => patch({ columns: v })} />
          </Field>
          <Field label="Column gutter">
            <NumberField value={d.gutter} unit={d.unit} min={0} max={MAX_SIDE_PT} onChange={(v) => patch({ gutter: v })} />
          </Field>
        </div>

        <Section title="Margins">
          <SidesEditor
            value={d.margins}
            unit={d.unit}
            facing={d.facingPages}
            linked={linked.margins}
            onLink={() => setLinked((l) => ({ ...l, margins: !l.margins }))}
            onChange={(side, v) => setSide('margins', side, v)}
          />
        </Section>

        <Section title="Bleed and slug">
          <div className="sub-label">Bleed</div>
          <SidesEditor
            value={d.bleed}
            unit={d.unit}
            facing={d.facingPages}
            linked={linked.bleed}
            onLink={() => setLinked((l) => ({ ...l, bleed: !l.bleed }))}
            onChange={(side, v) => setSide('bleed', side, v)}
          />
          <div className="sub-label">Slug</div>
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
        <label className="check-inline">
          <Check checked={preview} onChange={setPreview} />
          <span>Preview</span>
        </label>
        <button className="btn primary" disabled={!!error} onClick={create}>
          Create
        </button>
        <button className="btn outline" onClick={onClose}>
          Close
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

const SIDE_ORDER: (keyof Sides)[] = ['top', 'bottom', 'left', 'right']

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
    top: 'Top',
    bottom: 'Bottom',
    left: facing ? 'Inside' : 'Left',
    right: facing ? 'Outside' : 'Right',
  }
  return (
    <div className="sides">
      {SIDE_ORDER.map((k) => (
        <Field key={k} label={labels[k]}>
          <NumberField value={value[k]} unit={unit} min={0} max={MAX_SIDE_PT} onChange={(v) => onChange(k, v)} />
        </Field>
      ))}
      <button
        className={'link-btn' + (linked ? ' on' : '')}
        aria-pressed={linked}
        title={linked ? 'Unlink all values' : 'Link all values'}
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
