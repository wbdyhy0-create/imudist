import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type Side = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const SIDES: Side[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR: Record<Side, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }
const MIN_PT = 4
const MAX_PT = 2000

interface Props {
  id: string
  zoom: number
  /** the object's size in points, and how far below the baseline of the line it hangs */
  w: number
  h: number
  offset: number
  onChange: (w: number, h: number, offset: number) => void
}

/**
 * The handles of an anchored object (a double click on it is its menu; one click selects it): they sit over the object
 * wherever the line has put it, and drag its width, its height, and with the bottom ones how far below the baseline it
 * hangs - so it can be made to fit the line it is in.
 */
export function AnchorHandles({ id, zoom, w, h, offset, onChange }: Props) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const drag = useRef<{ side: Side; x: number; y: number; w: number; h: number; offset: number } | null>(null)

  // the object moves with the text (typing before it, a resize of the frame, scrolling): follow it
  useEffect(() => {
    let frame = 0
    const find = () => {
      const selector = `[data-anchor-id="${id.replace(/["\\]/g, '')}"]`
      return document.querySelector<HTMLElement>(`.rich-editor ${selector}`) ?? document.querySelector<HTMLElement>(selector)
    }
    const tick = () => {
      const rect = find()?.getBoundingClientRect()
      setBox((current) => {
        if (!rect) return current ? null : current
        if (current && current.left === rect.left && current.top === rect.top && current.width === rect.width && current.height === rect.height) return current
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [id])

  if (!box) return null

  const down = (side: Side) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // no active pointer (a synthetic event): the moves still come to the handle
    }
    drag.current = { side, x: e.clientX, y: e.clientY, w, h, offset }
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    const dx = (e.clientX - start.x) / zoom
    const dy = (e.clientY - start.y) / zoom
    let nw = start.w
    let nh = start.h
    let no = start.offset
    // the edge that is dragged goes with the pointer; the top stays where it is when the bottom is pulled (the object hangs lower)
    if (start.side.includes('e')) nw = start.w + dx
    if (start.side.includes('w')) nw = start.w - dx
    if (start.side.includes('s')) {
      nh = start.h + dy
      no = start.offset + dy
    }
    if (start.side.includes('n')) nh = start.h - dy
    // a corner keeps the proportions with Shift
    if (e.shiftKey && start.side.length === 2) {
      const scale = Math.max(nw / start.w, nh / start.h)
      nw = start.w * scale
      nh = start.h * scale
      no = start.side.includes('s') ? start.offset + (nh - start.h) : start.offset
    }
    nw = Math.min(MAX_PT, Math.max(MIN_PT, nw))
    nh = Math.min(MAX_PT, Math.max(MIN_PT, nh))
    onChange(Number(nw.toFixed(2)), Number(nh.toFixed(2)), Number(no.toFixed(2)))
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // nothing to release
    }
  }

  const place = (side: Side): { left: number; top: number } => ({
    left: side.includes('w') ? 0 : side.includes('e') ? box.width : box.width / 2,
    top: side.includes('n') ? 0 : side.includes('s') ? box.height : box.height / 2,
  })

  return (
    <div className="anchor-handles" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} onMouseDown={(e) => e.preventDefault()}>
      {SIDES.map((side) => (
        <div
          key={side}
          className="anchor-handle"
          style={{ ...place(side), cursor: CURSOR[side] }}
          onPointerDown={down(side)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      ))}
    </div>
  )
}
