import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ContextItem {
  label?: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  separator?: boolean
  onClick?: () => void
}

interface Props {
  /** screen position of the pointer */
  x: number
  y: number
  items: ContextItem[]
  onClose: () => void
}

/** A small menu opened by a right click. It closes on a click elsewhere, Escape, scrolling or resizing. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // keep the whole menu inside the window
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('contextmenu', away, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('contextmenu', away, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="menu-panel ctx-menu" role="menu" style={pos} onPointerDown={(event) => event.preventDefault()}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            className={'menu-item' + (item.disabled ? ' disabled' : '')}
            onClick={() => {
              if (item.disabled) return
              item.onClick?.()
              onClose()
            }}
          >
            <span className="menu-check">{item.checked ? '✓' : ''}</span>
            <span className="menu-text">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </div>
        ),
      )}
    </div>
  )
}
