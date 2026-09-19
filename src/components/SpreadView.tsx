import type { DocSettings, Sides } from '../document'
import { pageMargins, type SpreadLayout } from '../layout'

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
  const pw = doc.width * zoom
  const ph = doc.height * zoom
  const top = Y(spread.y)

  const around = (s: Sides) => ({
    x: X(spread.contentX) - s.left * zoom,
    y: top - s.top * zoom,
    width: (spread.contentW + s.left + s.right) * zoom,
    height: (doc.height + s.top + s.bottom) * zoom,
  })

  return (
    <g>
      {spread.pages.map((p) => (
        <rect key={'s' + p.index} x={X(p.x) + 3} y={top + 3} width={pw} height={ph} className="page-shadow" />
      ))}
      {spread.pages.map((p) => (
        <rect key={'p' + p.index} x={X(p.x)} y={top} width={pw} height={ph} className="page-paper" />
      ))}

      {showGuides && any(spread.slug) && <rect {...around(spread.slug)} className="guide guide-slug" />}
      {showGuides && any(spread.bleed) && <rect {...around(spread.bleed)} className="guide guide-bleed" />}

      {showGuides &&
        spread.pages.map((p) => {
          const m = pageMargins(doc, p.side)
          const left = X(p.x) + m.left * zoom
          const mTop = top + m.top * zoom
          const mW = pw - (m.left + m.right) * zoom
          const mH = ph - (m.top + m.bottom) * zoom
          const contentW = doc.width - m.left - m.right
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
        })}
    </g>
  )
}
