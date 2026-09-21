import { useMemo, useState } from 'react'
import type { DocSettings, ImageFrame, TextFrame } from '../document'
import { pageMargins, type SpreadLayout } from '../layout'
import { ownerPage, pageRects } from '../pages'
import { NumberField } from './NumberField'

export type InsertWhere = 'after' | 'before' | 'end'

interface Props {
  doc: DocSettings
  frames: TextFrame[]
  images: ImageFrame[]
  spreads: SpreadLayout[]
  /** the spread in the middle of the view */
  currentSpread: number
  /** the page that insert / delete act on */
  selected: number
  /** select a page and bring it into view */
  onSelect: (pageIndex: number) => void
  onInsert: (count: number, where: InsertWhere) => void
  onDelete: () => void
  onMove: (from: number, to: number) => void
}

const THUMB_W = 46
const THUMB_H = 64

/** The Pages panel: every page as a thumbnail, grouped in spreads, with add / delete / drag-to-reorder. */
export function PagesPanel({ doc, frames, images, spreads, currentSpread, selected, onSelect, onInsert, onDelete, onMove }: Props) {
  const [count, setCount] = useState(1)
  const [where, setWhere] = useState<InsertWhere>('after')

  // which frames sit on which page, for the thumbnails
  const framesByPage = useMemo(() => {
    const rects = pageRects(doc)
    const byPage: TextFrame[][] = rects.map(() => [])
    for (const f of frames) byPage[ownerPage(rects, f.x + f.w / 2, f.y + f.h / 2)].push(f)
    return byPage
  }, [doc, frames])
  const imagesByPage = useMemo(() => {
    const rs = pageRects(doc)
    const byPage: ImageFrame[][] = rs.map(() => [])
    for (const im of images) byPage[ownerPage(rs, im.x + im.w / 2, im.y + im.h / 2)].push(im)
    return byPage
  }, [doc, images])
  const rects = useMemo(() => pageRects(doc), [doc])


  return (
    <section className="pages-panel" aria-label="עמודים">
      <h2 className="props-title">
        עמודים <span className="muted">({doc.pages})</span>
      </h2>

      <div className="pages-controls">
        <div className="grid2">
          <div className="field">
            <div className="field-label">כמות</div>
            <NumberField value={count} min={1} max={99} onChange={setCount} ariaLabel="כמות עמודים להוספה" />
          </div>
          <div className="field">
            <div className="field-label">מיקום</div>
            <select className="select" value={where} onChange={(e) => setWhere(e.target.value as InsertWhere)}>
              <option value="after">אחרי העמוד הנבחר</option>
              <option value="before">לפני העמוד הנבחר</option>
              <option value="end">בסוף המסמך</option>
            </select>
          </div>
        </div>
        <div className="props-buttons">
          <button className="btn small primary" onClick={() => onInsert(count, where)} disabled={doc.pages >= 9999}>
            הוסף עמודים
          </button>
          <button className="btn small" onClick={onDelete} disabled={doc.pages <= 1} title="מחק את העמוד הנבחר ואת התיבות שעליו">
            מחק עמוד
          </button>
        </div>
      </div>

      <div className="thumbs">
        {spreads.map((s, si) => (
          // the row keeps the canvas order (left page on the left), whatever the interface direction
          <div key={s.y} className={'spread-row' + (si === currentSpread ? ' current' : '')}>
            {[...s.pages]
              .sort((a, b) => a.x - b.x)
              .map((p) => {
                const r = rects[p.index]
                const m = pageMargins(doc, p.side, p.index)
                // every thumbnail fits the same box, so a small page looks small next to a big one only up to that box
                const scale = Math.min(THUMB_W / p.w, THUMB_H / p.h)
                return (
                  <button
                    key={p.index}
                    className={'thumb' + (p.index === selected ? ' sel' : '')}
                    draggable
                    title={`עמוד ${p.number} — גרור כדי לשנות את הסדר`}
                    aria-pressed={p.index === selected}
                    onClick={() => onSelect(p.index)}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.index))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const from = Number(e.dataTransfer.getData('text/plain'))
                      if (Number.isInteger(from)) onMove(from, p.index)
                    }}
                  >
                    <svg width={p.w * scale} height={p.h * scale} viewBox={`0 0 ${p.w} ${p.h}`} aria-hidden="true">
                      <rect width={p.w} height={p.h} fill="#fff" />
                      <rect
                        x={m.left}
                        y={m.top}
                        width={p.w - m.left - m.right}
                        height={p.h - m.top - m.bottom}
                        fill="none"
                        stroke="#24a6ff"
                        strokeWidth={p.w * 0.006}
                        opacity="0.55"
                      />
                      {imagesByPage[p.index].map((im) => (
                        <rect key={im.id} x={im.x - r.x} y={im.y - r.y} width={im.w} height={im.h} fill="#9cc3ff" stroke="#ffb02e" strokeWidth={p.w * 0.008} />
                      ))}
                      {framesByPage[p.index].map((f) => (
                        <rect
                          key={f.id}
                          x={f.x - r.x}
                          y={f.y - r.y}
                          width={f.w}
                          height={f.h}
                          fill="#d3d8e0"
                          stroke="#ffb02e"
                          strokeWidth={p.w * 0.008}
                        />
                      ))}
                    </svg>
                    <span className="thumb-num">{p.number}</span>
                  </button>
                )
              })}
          </div>
        ))}
      </div>
    </section>
  )
}
