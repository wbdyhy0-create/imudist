import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
  checked?: boolean
  submenu?: MenuItem[]
  separator?: boolean
}

export interface MenuDef {
  label: string
  items: MenuItem[]
}

export function MenuBar({ menus, logo }: { menus: MenuDef[]; logo: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menubar" ref={ref}>
      <div className="app-logo" aria-hidden="true">
        {logo}
      </div>
      {menus.map((menu, i) => (
        <div key={menu.label} className="menu-root">
          <button
            className={'menu-label' + (open === i ? ' open' : '')}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {menu.label}
          </button>
          {open === i && <MenuPanel items={menu.items} onDone={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  )
}

function MenuPanel({ items, onDone, nested }: { items: MenuItem[]; onDone: () => void; nested?: boolean }) {
  return (
    <div className={'menu-panel' + (nested ? ' nested' : '')} role="menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            className={'menu-item' + (item.disabled ? ' disabled' : '') + (item.submenu ? ' has-sub' : '')}
            onClick={() => {
              if (item.disabled || item.submenu) return
              item.onClick?.()
              onDone()
            }}
          >
            <span className="menu-check">{item.checked ? '✓' : ''}</span>
            <span className="menu-text">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
            {item.submenu && (
              <>
                <svg className="menu-arrow" viewBox="0 0 8 12" aria-hidden="true">
                  <path d="M2 1.500 6.500 6 2 10.500" fill="none" stroke="currentColor" strokeWidth="1.500" />
                </svg>
                <MenuPanel items={item.submenu} onDone={onDone} nested />
              </>
            )}
          </div>
        ),
      )}
    </div>
  )
}
