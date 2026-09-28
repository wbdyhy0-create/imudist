import { useMemo, useState } from 'react'
import type { DocSettings, ImageFrame, ParentPage, ShapeFrame, TextFrame } from '../document'
import { shapePath } from '../shapes'
import { pageMargins, type SpreadLayout } from '../layout'
import { ownerPage, pageRects } from '../pages'
import { ContextMenu } from './ContextMenu'
import { NumberField } from './NumberField'

export type InsertWhere = 'after' | 'before' | 'end' | 'beside'

interface Props {
  doc: DocSettings
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  spreads: SpreadLayout[]
  /** the spread in the middle of the view */
  currentSpread: number
  /** every selected page (the one insert acts on is among them): a click selects one, Shift a range, Ctrl one more */
  selectedPages: number[]
  /** select a page and bring it into view */
  onSelect: (pageIndex: number, mods?: { shift: boolean; ctrl: boolean }) => void
  onInsert: (count: number, where: InsertWhere) => void
  /** same as onInsert, but with an explicit master (or none) for the new pages, instead of inheriting one */
  onInsertWithMaster: (count: number, where: InsertWhere, master: string | null) => void
  onDelete: () => void
  onMove: (from: number, to: number) => void
  /** show the pages one to a row, or in pairs (1-2, 3-4 …) */
  onView: (perRow: 1 | 2) => void
  /** the document's parent (master) pages */
  parents: ParentPage[]
  /** which parent applies to each document page, by index */
  pageParents: (string | null)[]
  /** the parent a single click in this list marked "current": what new pages get automatically */
  activeParentId: string | null
  /** a single click in this list: marks a parent "current", instead of applying it to any document page */
  onSelectParent: (id: string) => void
  onCreateParent: () => void
  onDeleteParent: (id: string) => void
  /** opens a parent page for editing instead of the document itself (a double click in this list) */
  onEditParent: (id: string) => void
  /** applies a parent to every currently selected document page */
  onApplyParent: (parentId: string) => void
  /** copies the currently selected pages' parent objects onto them and clears their own parent */
  onDetachParent: () => void
}

const THUMB_W = 46
const THUMB_H = 64

/** The Pages panel: every page as a thumbnail, grouped in spreads, with add / delete / drag-to-reorder. */
export function PagesPanel({ doc, frames, images, shapes, spreads, currentSpread, selectedPages, onSelect, onInsert, onInsertWithMaster, onDelete, onMove, onView, parents, pageParents, activeParentId, onSelectParent, onCreateParent, onDeleteParent, onEditParent, onApplyParent, onDetachParent }: Props) {
  const [count, setCount] = useState(1)
  const [where, setWhere] = useState<InsertWhere>('after')
  const [applyParentId, setApplyParentId] = useState('')
  // the selected pages' own current parent, when they all share one (blank when they differ, or there are none)
  const selectedParentId = selectedPages.every((i) => pageParents[i] === pageParents[selectedPages[0]]) ? (pageParents[selectedPages[0]] ?? '') : ''
  // a right click on a thumbnail: its own small menu, offering "הוספת עמודים…" with an explicit master choice
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pageIndex: number } | null>(null)
  const [insertDialog, setInsertDialog] = useState<{ pageIndex: number; count: number; where: InsertWhere; master: string } | null>(null)

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
  const shapesByPage = useMemo(() => {
    const rs = pageRects(doc)
    const byPage: ShapeFrame[][] = rs.map(() => [])
    for (const sh of shapes) byPage[ownerPage(rs, sh.x + sh.w / 2, sh.y + sh.h / 2)].push(sh)
    return byPage
  }, [doc, shapes])
  const rects = useMemo(() => pageRects(doc), [doc])
  // a document keeps at least one page, so the whole set cannot go
  const canDelete = selectedPages.length < doc.pages


  return (
    <section className="pages-panel" aria-label="עמודים">
      {/* the head and the controls stay put while the thumbnails scroll under them */}
      <div className="pages-top">
      <div className="pages-head">
        <h2 className="props-title">
          עמודים <span className="muted">({doc.pages})</span>
        </h2>
        <div className="pages-view" role="group" aria-label="תצוגת העמודים">
          <button
            className={!doc.rowsCustom && doc.perRow === 1 ? 'on' : ''}
            aria-pressed={!doc.rowsCustom && doc.perRow === 1}
            title="עמוד אחד בכל שורה — העמודים זה מתחת לזה"
            onClick={() => onView(1)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5" y="1.500" width="6" height="5" rx="0.700" />
              <rect x="5" y="9.500" width="6" height="5" rx="0.700" />
            </svg>
          </button>
          <button
            className={!doc.rowsCustom && doc.perRow === 2 ? 'on' : ''}
            aria-pressed={!doc.rowsCustom && doc.perRow === 2}
            title="עמודים זוגיים — שורה ראשונה עמודים 1-2, שורה שנייה 3-4, וכן הלאה"
            onClick={() => onView(2)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.500" y="1.500" width="5.500" height="5" rx="0.700" />
              <rect x="9" y="1.500" width="5.500" height="5" rx="0.700" />
              <rect x="1.500" y="9.500" width="5.500" height="5" rx="0.700" />
              <rect x="9" y="9.500" width="5.500" height="5" rx="0.700" />
            </svg>
          </button>
        </div>
      </div>

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
              <option value="beside">בצד העמוד הנבחר (באותה שורה)</option>
              <option value="end">בסוף המסמך</option>
            </select>
          </div>
        </div>
        <div className="props-buttons">
          <button className="btn small primary" onClick={() => onInsert(count, where)} disabled={doc.pages >= 9999}>
            הוסף עמודים
          </button>
          <button className="btn small" onClick={onDelete} disabled={!canDelete} title={selectedPages.length > 1 ? 'מחק את העמודים הנבחרים ואת מה שעליהם' : 'מחק את העמוד הנבחר ואת התיבות שעליו'}>
            {selectedPages.length > 1 ? `מחק ${selectedPages.length} עמודים` : 'מחק עמוד'}
          </button>
        </div>
      </div>

      <div className="parents-section">
        <div className="field-label">עמודי אב</div>
        <div className="parents-list">
          {parents.map((p) => (
            <div className="parent-row" key={p.id}>
              <button
                className={'parent-name' + (p.id === activeParentId ? ' active' : '')}
                aria-pressed={p.id === activeParentId}
                title={`${p.name} — לחיצה מסמנת אותו כברירת המחדל לעמודים חדשים, לחיצה כפולה לעריכה`}
                onClick={() => onSelectParent(p.id)}
                onDoubleClick={() => onEditParent(p.id)}
              >
                <span className="parent-prefix">{p.prefix}</span>
                {p.name}
              </button>
              <button className="icon-button" aria-label={`מחק את עמוד האב ${p.name}`} title="מחק עמוד אב" onClick={() => onDeleteParent(p.id)}>
                ⌫
              </button>
            </div>
          ))}
          {parents.length === 0 && <p className="muted">אין עדיין עמודי אב.</p>}
        </div>
        <button className="btn small" onClick={onCreateParent}>
          עמוד אב חדש
        </button>
        {parents.length > 0 && (
          <div className="parents-apply">
            <label className="field-label">
              שיוך העמוד הנבחר לעמוד אב
              <select className="select" value={selectedParentId || applyParentId} onChange={(e) => { setApplyParentId(e.target.value); if (e.target.value) onApplyParent(e.target.value) }}>
                <option value="">ללא</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn small" disabled={!selectedParentId} onClick={onDetachParent} title="שומר את מה שמופיע כרגע על העמוד, אבל מפסיק לעדכן אותו לפי עמוד האב">
              נתק מעמוד אב
            </button>
          </div>
        )}
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
                    className={'thumb' + (selectedPages.includes(p.index) ? ' sel' : '')}
                    draggable
                    title={`עמוד ${p.number} — גרור כדי לשנות את הסדר, Shift לבחירת טווח, Ctrl להוספה לבחירה`}
                    aria-pressed={selectedPages.includes(p.index)}
                    onClick={(e) => onSelect(p.index, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onSelect(p.index)
                      setCtxMenu({ x: e.clientX, y: e.clientY, pageIndex: p.index })
                    }}
                    onKeyDown={(e) => {
                      // Delete here removes the selected pages, not whatever object is selected on the canvas
                      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault()
                        e.stopPropagation()
                        if (canDelete) onDelete()
                      }
                    }}
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
                      {shapesByPage[p.index].map((sh) => (
                        <path
                          key={sh.id}
                          transform={`translate(${sh.x - r.x} ${sh.y - r.y})`}
                          d={shapePath(sh)}
                          fill={sh.fill ?? 'none'}
                          fillRule="evenodd"
                          stroke={sh.stroke ?? 'none'}
                          strokeWidth={Math.max(sh.strokeWidth, p.w * 0.004)}
                        />
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
                    {pageParents[p.index] && <span className="thumb-parent" title={parents.find((par) => par.id === pageParents[p.index])?.name}>{parents.find((par) => par.id === pageParents[p.index])?.prefix}</span>}
                  </button>
                )
              })}
          </div>
        ))}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: 'הוספת עמודים…',
              onClick: () => setInsertDialog({ pageIndex: ctxMenu.pageIndex, count: 1, where: 'after', master: pageParents[ctxMenu.pageIndex] ?? '' }),
            },
          ]}
        />
      )}

      {insertDialog && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="הוספת עמודים">
            <h2>הוספת עמודים</h2>
            <div className="grid2">
              <div className="field">
                <div className="field-label">כמות</div>
                <NumberField value={insertDialog.count} min={1} max={99} onChange={(v) => setInsertDialog({ ...insertDialog, count: v })} ariaLabel="כמות עמודים להוספה" />
              </div>
              <div className="field">
                <div className="field-label">מיקום</div>
                <select className="select" value={insertDialog.where} onChange={(e) => setInsertDialog({ ...insertDialog, where: e.target.value as InsertWhere })}>
                  <option value="after">אחרי העמוד הנבחר</option>
                  <option value="before">לפני העמוד הנבחר</option>
                  <option value="beside">בצד העמוד הנבחר (באותה שורה)</option>
                  <option value="end">בסוף המסמך</option>
                </select>
              </div>
            </div>
            <div className="field">
              <div className="field-label">מאסטר</div>
              <select className="select" value={insertDialog.master} onChange={(e) => setInsertDialog({ ...insertDialog, master: e.target.value })}>
                <option value="">ללא</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-buttons">
              <button
                className="btn primary"
                onClick={() => {
                  onInsertWithMaster(insertDialog.count, insertDialog.where, insertDialog.master || null)
                  setInsertDialog(null)
                }}
              >
                הוסף עמודים
              </button>
              <button className="btn" onClick={() => setInsertDialog(null)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
