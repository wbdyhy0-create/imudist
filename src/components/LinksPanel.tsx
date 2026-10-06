import { useState } from 'react'
import type { Asset, AssetLink, Assets } from '../document'
import { linkStatus, revealInFileManager, useLinkVersion, type LinkStatus } from '../imageLinks'

/** One place a picture is used: a page item, or an item of a parent page (`page` is then null). */
export interface LinkUse {
  id: string
  /** 1-based physical page */
  page: number | null
  parentName?: string
}

interface Props {
  assets: Assets
  /** where each picture is used; a picture nobody uses is not listed */
  uses: Record<string, LinkUse[]>
  /** linking works only in the desktop app, where files have paths */
  available: boolean
  onShow: (assetId: string) => void
  /** each returns what went wrong, or null */
  onUpdate: (assetIds: string[]) => Promise<string | null>
  onRelink: (assetId: string) => Promise<string | null>
  onEmbed: (assetIds: string[]) => Promise<string | null>
}

type Row = { id: string; asset: Asset & { link: AssetLink }; status: LinkStatus; uses: LinkUse[] }

const STATUS_LABEL: Record<LinkStatus, string> = { ok: 'מקושר', modified: 'השתנה בדיסק', missing: 'הקובץ חסר' }
const STATUS_MARK: Record<LinkStatus, string> = { ok: '🔗', modified: '⚠', missing: '?' }

const pagesOf = (uses: LinkUse[]) => {
  const pages = [...new Set(uses.flatMap((use) => (use.page === null ? [] : [use.page])))].sort((a, b) => a - b)
  const parents = uses.some((use) => use.page === null)
  return [pages.length > 0 ? `עמ׳ ${pages.join(', ')}` : '', parents ? 'עמוד אב' : ''].filter(Boolean).join(' · ')
}

/** The Links panel: every picture placed as a link, whether its file is still as it was, and the ways to fix or embed it. */
export function LinksPanel({ assets, uses, available, onShow, onUpdate, onRelink, onEmbed }: Props) {
  useLinkVersion()
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const rows: Row[] = Object.entries(assets)
    .flatMap(([id, asset]): Row[] => (asset.link && uses[id]?.length ? [{ id, asset: asset as Row['asset'], status: linkStatus(asset.link), uses: uses[id] }] : []))
    .sort((a, b) => a.asset.name.localeCompare(b.asset.name))

  if (!available) {
    return (
      <div className="pages-panel" aria-label="קישורים">
        <h2 className="props-title">קישורים</h2>
        <p className="muted">קישור תמונות לקבצים שלהן זמין באפליקציית שולחן העבודה. בדפדפן התמונות מוטמעות במסמך.</p>
      </div>
    )
  }

  const chosen = rows.filter((row) => selected.includes(row.id))
  const outdated = (chosen.length > 0 ? chosen : rows).filter((row) => row.status === 'modified')
  const single = chosen.length === 1 ? chosen[0] : null

  const click = (row: Row, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (event.shiftKey && anchor) {
      const a = rows.findIndex((r) => r.id === anchor)
      const b = rows.findIndex((r) => r.id === row.id)
      if (a >= 0 && b >= 0) {
        setSelected(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id))
        return
      }
    }
    setAnchor(row.id)
    if (event.ctrlKey || event.metaKey) setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]))
    else setSelected([row.id])
  }
  const run = async (task: () => Promise<string | null>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await task())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pages-panel" aria-label="קישורים">
      <h2 className="props-title">
        קישורים <span className="muted">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="muted">אין תמונות מקושרות במסמך. תמונות שנוספות מקובץ מקושרות אליו אוטומטית.</p>
      ) : (
        <ul className="links-list" aria-multiselectable="true">
          {rows.map((row) => (
            <li
              key={row.id}
              className={'link-row ' + row.status + (selected.includes(row.id) ? ' sel' : '')}
              title={`${row.asset.link.path}\n${STATUS_LABEL[row.status]}`}
              aria-selected={selected.includes(row.id)}
              onClick={(event) => click(row, event)}
              onDoubleClick={() => onShow(row.id)}
            >
              <span className={'link-mark ' + row.status} aria-label={STATUS_LABEL[row.status]}>
                {STATUS_MARK[row.status]}
              </span>
              <span className="link-text">
                <bdi className="link-name">{row.asset.name}</bdi>
                <span className="muted link-where">
                  {pagesOf(row.uses)}
                  {row.status !== 'ok' && ` · ${STATUS_LABEL[row.status]}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {single && (
        <p className="muted link-path" dir="ltr">
          {single.asset.link.path}
        </p>
      )}
      <div className="props-buttons">
        <button className="btn small" disabled={busy || outdated.length === 0} onClick={() => void run(() => onUpdate(outdated.map((row) => row.id)))} title="קורא מחדש את הקבצים ששונו בדיסק">
          {chosen.length > 0 ? 'עדכן' : 'עדכן הכל'}
        </button>
        <button className="btn small" disabled={busy || !single} onClick={() => single && void run(() => onRelink(single.id))} title="בחירת קובץ אחר לתמונה (כשהקובץ הועבר או נמחק)">
          קשר מחדש…
        </button>
        <button className="btn small" disabled={!single} onClick={() => single && onShow(single.id)} title="בחירת התמונה בעמוד (לחיצה כפולה בשורה)">
          הצג בעמוד
        </button>
        <button className="btn small" disabled={!single} onClick={() => single && void revealInFileManager(single.asset.link.path).catch(() => setMessage('הקובץ לא נמצא בדיסק.'))} title="פתיחת התיקייה של הקובץ">
          הצג בתיקייה
        </button>
        <button
          className="btn small"
          disabled={busy || chosen.length === 0}
          onClick={() => void run(() => onEmbed(chosen.map((row) => row.id)))}
          title="הופך את התמונות הנבחרות למוטמעות במסמך, בלי קישור לקובץ"
        >
          {chosen.length > 1 ? `הטמע ${chosen.length} תמונות` : 'הטמע'}
        </button>
      </div>
      {message && <p className="muted" style={{ color: '#e5484d', whiteSpace: 'pre-line' }}>{message}</p>}
      <p className="muted">לחיצה בוחרת תמונה, Shift לטווח, Ctrl להוספה לבחירה. תמונה מוטמעת גדלה את קובץ המסמך אבל לא תלויה בקובץ המקור.</p>
    </div>
  )
}
