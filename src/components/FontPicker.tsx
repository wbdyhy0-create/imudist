import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fontSupportsHebrew, setFontListFilter, useFontListFilter, type FontFamily } from '../fonts'
import { rememberFontFamily } from '../fontPreference'

interface Props {
  value: string
  families: FontFamily[]
  onChange: (family: string) => void
  onPreview?: (family: string | null) => void
  className?: string
}

const stack = (family: string) => `"${family}", "Segoe UI", Arial, sans-serif`

/** A searchable font list where every name is drawn in its own font. */
export function FontPicker({ value, families, onChange, onPreview, className }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const fontFilter = useFontListFilter()
  const root = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const focusActiveRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        onPreview?.(null)
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onPreview])

  const q = query.trim().toLowerCase()
  const filteredFamilies = useMemo(
    () => fontFilter === 'hebrew' ? families.filter(({ family }) => fontSupportsHebrew(family)) : families,
    [families, fontFilter],
  )
  const matches = q ? filteredFamilies.filter((f) => f.family.toLowerCase().includes(q)) : filteredFamilies
  useEffect(() => {
    const currentIndex = matches.findIndex((family) => family.family === value)
    setActiveIndex(currentIndex)
  }, [q, fontFilter, value])
  useLayoutEffect(() => {
    if (activeIndex < 0 || activeIndex >= matches.length) return
    const list = listRef.current
    const option = optionRefs.current[activeIndex]
    if (!list || !option) return
    const listBounds = list.getBoundingClientRect()
    const optionBounds = option.getBoundingClientRect()
    if (optionBounds.top < listBounds.top) list.scrollTop -= listBounds.top - optionBounds.top
    else if (optionBounds.bottom > listBounds.bottom) list.scrollTop += optionBounds.bottom - listBounds.bottom
    if (focusActiveRef.current) {
      focusActiveRef.current = false
      option.focus()
    }
  }, [activeIndex, matches.length])
  const chooseFamily = (family: string) => {
    onPreview?.(null)
    rememberFontFamily(family)
    onChange(family)
  }
  const previewAt = (index: number) => {
    const family = matches[index]
    setActiveIndex(index)
    onPreview?.(family?.family ?? null)
  }
  const moveActive = (direction: -1 | 1) => {
    if (!matches.length) return
    const current = activeIndex < 0 ? matches.findIndex((family) => family.family === value) : activeIndex
    const next = Math.max(0, Math.min(matches.length - 1, current + direction))
    focusActiveRef.current = true
    previewAt(next)
  }
  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault()
      event.stopPropagation()
      chooseFamily(matches[activeIndex].family)
      setOpen(false)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onPreview?.(null)
      setOpen(false)
    }
  }

  return (
    <div className={'font-picker' + (className ? ` ${className}` : '')} ref={root}>
      <button className="font-picker-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: stack(value) }}>{value}</span>
        <svg viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className="font-picker-pop" onMouseLeave={() => onPreview?.(null)}>
          <input
            autoFocus
            className="font-picker-search"
            placeholder="חיפוש גופן…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onPreview?.(null)
                setOpen(false)
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                e.stopPropagation()
                moveActive(e.key === 'ArrowDown' ? 1 : -1)
              }
              else if (e.key === 'Enter' && matches.length > 0) {
                const chosen = matches[activeIndex >= 0 ? activeIndex : 0]
                chooseFamily(chosen.family)
                setOpen(false)
              }
            }}
          />
          <div className="font-picker-filter" role="group" aria-label="סינון גופנים">
            <button type="button" aria-pressed={fontFilter === 'hebrew'} className={fontFilter === 'hebrew' ? 'on' : ''} onClick={() => setFontListFilter('hebrew')}>גופנים בעברית</button>
            <button type="button" aria-pressed={fontFilter === 'all'} className={fontFilter === 'all' ? 'on' : ''} onClick={() => setFontListFilter('all')}>הכול</button>
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="font-picker-list"
            onKeyDown={handleListKeyDown}
          >
            {matches.map((f, index) => (
              <li key={f.family} role="option" aria-selected={f.family === value}>
                <button
                  ref={(element) => { optionRefs.current[index] = element }}
                  className={(f.family === value ? 'on' : '') + (index === activeIndex ? ' previewing' : '')}
                  style={{ fontFamily: stack(f.family) }}
                  title={f.family}
                  onMouseEnter={() => previewAt(index)}
                  onFocus={() => previewAt(index)}
                  onClick={() => {
                    chooseFamily(f.family)
                    setOpen(false)
                  }}
                >
                  <span className="font-picker-family">{f.family}</span>
                  <span className="font-picker-specimen" aria-hidden="true" dir="auto">{fontFilter === 'hebrew' ? 'אבגדהוז' : 'Aa אבג 123'}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="font-picker-empty">לא נמצא גופן</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
