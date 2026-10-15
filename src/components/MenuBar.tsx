import { useEffect, useRef, useState } from 'react'
import { t, useLanguage } from '../i18n'
import { macKeys } from '../platform'
import { AppLogo } from './AppLogo'
import { HelpAssistant } from './HelpAssistant'

export interface MenuItem {
  label?: string
  shortcut?: string
  /** other keys that run the item too (only `shortcut` is written next to it) */
  aliases?: string[]
  /** what the keys do when it is not the same as a click on the item */
  onKey?: () => void
  /** a shortcut that is only written next to the item: the key is handled elsewhere (e.g. Ctrl+C by the browser's copy event) */
  shownShortcut?: string
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

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  useLanguage() // drawn again when the language changes
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
      <AppLogo size={22} />
      {menus.map((menu, i) => (
        <div key={menu.label} className="menu-root">
          <button
            className={'menu-label' + (open === i ? ' open' : '')}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {t(menu.label)}
          </button>
          {open === i && <MenuPanel items={menu.items} onDone={() => setOpen(null)} />}
        </div>
      ))}
      <HelpAssistant />
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
            <span className="menu-text">{item.label === undefined ? item.label : t(item.label)}</span>
            {(item.shortcut ?? item.shownShortcut) && (
              <span className="menu-shortcut" dir="ltr">
                {macKeys((item.shortcut ?? item.shownShortcut) as string)}
              </span>
            )}
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
