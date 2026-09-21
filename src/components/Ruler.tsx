import { useLayoutEffect, useRef } from 'react'
import { PT_PER_UNIT, formatNumber, type Unit } from '../units'

interface Props {
  orientation: 'h' | 'v'
  /** screen offset (px, inside the ruler) of world coordinate 0 */
  offset: number
  zoom: number
  unit: Unit
  hidden?: boolean
  /** the pointer went down on the ruler: a guide is being dragged out of it */
  onGuideDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  /** right click: the menu for changing the units */
  onMenu?: (e: React.MouseEvent<HTMLCanvasElement>) => void
}

const BG = '#2b2222'
const LINE = '#8c8c8c'
const TEXT = '#c4c4c4'
const MIN_LABEL_GAP = 64

export function Ruler({ orientation, offset, zoom, unit, hidden, onGuideDown, onMenu }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas || hidden) return
    const horizontal = orientation === 'h'
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (!cssW || !cssH) return
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, cssW, cssH)

    const length = horizontal ? cssW : cssH
    const thickness = horizontal ? cssH : cssW
    const perUnit = PT_PER_UNIT[unit] * zoom // screen px per displayed unit

    // 1-2-5 series: the smallest step whose labels are at least MIN_LABEL_GAP apart
    const raw = MIN_LABEL_GAP / perUnit
    const pow = Math.pow(10, Math.floor(Math.log10(raw)))
    const m = raw / pow
    const mantissa = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
    const step = mantissa * pow
    const div = mantissa === 2 ? 4 : mantissa === 5 ? 5 : 10
    const minor = step / div

    const kMin = Math.floor(-offset / perUnit / minor) - 1
    const kMax = Math.ceil((length - offset) / perUnit / minor) + 1

    ctx.strokeStyle = LINE
    ctx.fillStyle = TEXT
    ctx.font = '9px "Segoe UI", sans-serif'
    ctx.lineWidth = 1
    // the page is RTL, but ruler math is plain left-to-right
    ctx.direction = 'ltr'
    ctx.textAlign = 'left'

    ctx.beginPath()
    for (let k = kMin; k <= kMax; k++) {
      const pos = Math.round(offset + k * minor * perUnit) + 0.5
      const isMajor = k % div === 0
      const isMid = !isMajor && div % 2 === 0 && k % (div / 2) === 0
      const len = isMajor ? thickness : isMid ? thickness * 0.5 : thickness * 0.25
      if (horizontal) {
        ctx.moveTo(pos, thickness)
        ctx.lineTo(pos, thickness - len)
      } else {
        // the vertical ruler sits on the right in the RTL layout, so ticks grow from its left (canvas-facing) edge
        ctx.moveTo(0, pos)
        ctx.lineTo(len, pos)
      }
    }
    ctx.stroke()

    for (let k = kMin; k <= kMax; k++) {
      if (k % div !== 0) continue
      const pos = offset + k * minor * perUnit
      const label = formatNumber(k * minor)
      if (horizontal) {
        ctx.fillText(label, pos + 3, 10)
      } else {
        ctx.save()
        ctx.translate(9, pos + 3)
        ctx.rotate(Math.PI / 2)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
  })

  if (hidden) return <div />
  return <canvas ref={ref} className={'ruler ruler-' + orientation} onPointerDown={onGuideDown} onContextMenu={onMenu} />
}
