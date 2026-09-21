import type { DocSettings, Sides } from '../document'
import { pageMargins, type PageLayout, type SpreadLayout } from '../layout'

interface Props {
  doc: DocSettings
  spread: SpreadLayout
  zoom: number
  /** screen position of world (0, 0) */
  tx: number
  ty: number
  showGuides: boolean
}

const any = (s: Sides) => s.top + s.bottom + s.left + s.right > 0

export function SpreadView({ doc, spread, zoom, tx, ty, showGuides }: Props) {
  const X = (wx: number) => tx + wx * zoom
  const Y = (wy: number) => ty + wy * zoom
  const top = Y(spread.y)

  /** the bleed / slug frame around a run of pages (the whole spread, or a single page that stands alone) */
  const around = (s: Sides, x: number, w: number, h: number) => ({
    x: X(x) - s.left * zoom,
    y: top - s.top * zoom,
    width: (w + s.left + s.right) * zoom,
    height: (h + s.top + s.bottom) * zoom,
  })
  // pages that stand apart each get their own frame; joined pages share one
  const groups: { x: number; w: number; h: number; key: string }[] = spread.joined
    ? [{ x: spread.contentX, w: spread.contentW, h: spread.h, key: 'all' }]
    : spread.pages.map((p) => ({ x: p.x, w: p.w, h: p.h, key: String(p.index) }))

  const pageGuides = (p: PageLayout) => {
    const m = pageMargins(doc, p.side, p.index)
    const left = X(p.x) + m.left * zoom
    const mTop = top + m.top * zoom
    const mW = (p.w - m.left - m.right) * zoom
    const mH = (p.h - m.top - m.bottom) * zoom
    const contentW = p.w - m.left - m.right
    const colW = (contentW - doc.gutter * (doc.columns - 1)) / doc.columns

    const columnLines: number[] = []
    for (let i = 0; i < doc.columns; i++) {
      const x0 = m.left + i * (colW + doc.gutter)
      if (i > 0) columnLines.push(X(p.x) + x0 * zoom)
      if (i < doc.columns - 1) columnLines.push(X(p.x) + (x0 + colW) * zoom)
    }

    return (
      <g key={'g' + p.index}>
        {doc.primaryTextFrame && <rect x={left} y={mTop} width={mW} height={mH} className="guide guide-frame" />}
        {columnLines.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={mTop} y2={mTop + mH} className="guide guide-column" />
        ))}
        <rect x={left} y={mTop} width={mW} height={mH} className="guide guide-margin" />
      </g>
    )
  }

  return (
    <g>
      {spread.pages.map((p) => (
        <rect key={'s' + p.index} x={X(p.x) + 3} y={top + 3} width={p.w * zoom} height={p.h * zoom} className="page-shadow" />
      ))}
      {spread.pages.map((p) => (
        <rect key={'p' + p.index} x={X(p.x)} y={top} width={p.w * zoom} height={p.h * zoom} className="page-paper" />
      ))}

      {showGuides && any(spread.slug) && groups.map((g) => <rect key={'sl' + g.key} {...around(spread.slug, g.x, g.w, g.h)} className="guide guide-slug" />)}
      {showGuides && any(spread.bleed) && groups.map((g) => <rect key={'bl' + g.key} {...around(spread.bleed, g.x, g.w, g.h)} className="guide guide-bleed" />)}

      {showGuides && spread.pages.map(pageGuides)}
    </g>
  )
}
