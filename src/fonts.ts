import { t } from './i18n'
import { useSyncExternalStore } from 'react'
import { FONT_FAMILIES } from './document'
import { fontsComeFromDesktop, installedFontsQuery } from './localFonts'

/** One style of a font family, e.g. "Semibold Italic" → weight 600, italic. */
export interface FontFace {
  /** the style name as the font reports it ("Regular", "Bold Italic", "Light" …) */
  style: string
  weight: number
  italic: boolean
}

export interface FontFamily {
  family: string
  faces: FontFace[]
}

export type FontStatus =
  /** built-in list only: the system fonts were not loaded (yet) */
  | 'fallback'
  | 'loading'
  /** the real fonts of this computer */
  | 'system'
  /** the user refused access to the fonts */
  | 'denied'
  /** this browser cannot list installed fonts */
  | 'unavailable'

export type FontListFilter = 'hebrew' | 'all'

interface FontState {
  families: FontFamily[]
  status: FontStatus
  filter: FontListFilter
}

/** Minimal typing of the Local Font Access API (Chrome / Edge). */
export interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra[\s-]?light|ultra[\s-]?light/i, 200],
  [/semi[\s-]?light/i, 350],
  [/light/i, 300],
  [/semi[\s-]?bold|demi[\s-]?bold|demi/i, 600],
  [/extra[\s-]?bold|ultra[\s-]?bold|heavy/i, 800],
  [/black|ultra/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
]

/** Weight (100–900) named by a font style string; regular when it names none. */
export function weightFromStyle(style: string): number {
  for (const [re, w] of WEIGHT_WORDS) if (re.test(style)) return w
  return 400
}

export const isItalicStyle = (style: string) => /italic|oblique/i.test(style)

const HEBREW_WEIGHT_NAMES: Record<number, string> = {
  get 100() { return t('דק במיוחד') },
  get 200() { return t('דק מאוד') },
  get 300() { return t('דק') },
  get 350() { return t('חצי-דק') },
  get 400() { return t('רגיל') },
  get 500() { return t('בינוני') },
  get 600() { return t('חצי-מודגש') },
  get 700() { return t('מודגש') },
  get 800() { return t('מודגש מאוד') },
  get 900() { return t('שחור') },
}

/** Hebrew name of a weight, e.g. 600 → "חצי-מודגש". */
export const weightName = (w: number) => HEBREW_WEIGHT_NAMES[w] ?? String(w)

const FILTER_STORAGE_KEY = 'imudist.fontListFilter'
const getSavedFilter = (): FontListFilter => {
  try {
    return localStorage.getItem(FILTER_STORAGE_KEY) === 'hebrew' ? 'hebrew' : 'all'
  } catch {
    return 'all'
  }
}

const hebrewSupport = new Map<string, boolean>()
export function fontSupportsHebrew(family: string): boolean {
  const cached = hebrewSupport.get(family)
  if (cached !== undefined) return cached
  if (typeof document === 'undefined') return true
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return true
  const text = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ'
  const measure = (name: string) => {
    context.font = `40px "${name.replace(/["\\]/g, '')}"`
    return context.measureText(text).width
  }
  const fallback = measure('__imudist_missing_font_8f3a1c__')
  const supported = Math.abs(measure(family) - fallback) > 0.5
  hebrewSupport.set(family, supported)
  return supported
}

export function groupSystemFonts(fonts: LocalFontData[]): FontFamily[] {
  const byFamily = new Map<string, Map<string, FontFace>>()
  for (const font of fonts) {
    const faces = byFamily.get(font.family) ?? new Map<string, FontFace>()
    const face: FontFace = { style: font.style, weight: weightFromStyle(font.style), italic: isItalicStyle(font.style) }
    const key = `${face.weight}|${face.italic}`
    if (!faces.has(key)) faces.set(key, face)
    byFamily.set(font.family, faces)
  }
  return [...byFamily.entries()]
    .map(([family, faces]) => ({
      family,
      faces: [...faces.values()].sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic)),
    }))
    .sort((a, b) => a.family.localeCompare(b.family))
}

const FALLBACK: FontFamily[] = FONT_FAMILIES.map((family) => ({
  family,
  faces: [
    { style: 'Regular', weight: 400, italic: false },
    { style: 'Italic', weight: 400, italic: true },
    { style: 'Bold', weight: 700, italic: false },
    { style: 'Bold Italic', weight: 700, italic: true },
  ],
}))

let state: FontState = { families: FALLBACK, status: 'fallback', filter: getSavedFilter() }
const listeners = new Set<() => void>()
const set = (next: FontState) => {
  state = next
  listeners.forEach((l) => l())
}

export function setFontListFilter(filter: FontListFilter): void {
  if (state.filter === filter) return
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, filter)
  } catch (error) {
    console.warn('Could not save the font-list filter.', error)
  }
  set({ ...state, filter })
}

let loading: Promise<void> | null = null

/** Read the fonts installed on this computer. The browser asks the user for permission the first time. */
export function loadSystemFonts(): Promise<void> {
  if (loading) return loading
  const query = installedFontsQuery()
  if (!query) {
    set({ ...state, status: 'unavailable' })
    return Promise.resolve()
  }
  set({ ...state, status: 'loading' })
  loading = query()
    .then((fonts) => {
      const families = groupSystemFonts(fonts)
      set(families.length ? { families, status: 'system', filter: state.filter } : { ...state, status: 'denied' })
    })
    .catch(() => set({ ...state, status: 'denied' }))
    .finally(() => {
      loading = null
    })
  return loading
}

// If the user already allowed access on an earlier visit, load without asking again.
navigator.permissions
  ?.query({ name: 'local-fonts' as PermissionName })
  .then((p) => {
    if (p.state === 'granted') void loadSystemFonts()
  })
  .catch(() => {})

// where the desktop program gives the list (the Mac), nothing is asked: it is read at once
if (fontsComeFromDesktop()) void loadSystemFonts()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => state
const getFilterSnapshot = () => state.filter

/** The font catalog (system fonts once loaded, a built-in Hebrew-friendly list before that). */
export function useFontCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** The shared filter chosen in any font picker. */
export function useFontListFilter() {
  return useSyncExternalStore(subscribe, getFilterSnapshot)
}

/**
 * The face of `family` closest to the wanted weight/italic. Used when the user switches to a family that
 * does not have the current weight.
 */
export function closestFace(family: FontFamily | undefined, weight: number, italic: boolean): FontFace | undefined {
  if (!family || family.faces.length === 0) return undefined
  const pool = family.faces.some((f) => f.italic === italic) ? family.faces.filter((f) => f.italic === italic) : family.faces
  return pool.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best))
}

const installedFamilies = new Set<string>()

/**
 * Whether a font family can be drawn here, found by measuring text in it against the generic fonts: a family that is not
 * there falls back to them and measures the same. Needs no permission, unlike the list of installed fonts. A "no" is not
 * remembered (a web font may still be loading), a "yes" is.
 */
export function fontInstalled(family: string): boolean {
  if (installedFamilies.has(family)) return true
  if (typeof document === 'undefined' || !document.body) return true
  const span = document.createElement('span')
  span.textContent = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJ אבגדהוזחטיכלמנסעפצקרשת 0123456789'
  span.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;white-space:nowrap;font-size:48px'
  document.body.appendChild(span)
  const widthIn = (stack: string) => {
    span.style.fontFamily = stack
    return span.getBoundingClientRect().width
  }
  const quoted = `"${family.replace(/"/g, '')}"`
  const installed = ['monospace', 'serif', 'sans-serif'].some((base) => Math.abs(widthIn(`${quoted}, ${base}`) - widthIn(base)) > 0.01)
  span.remove()
  if (installed) installedFamilies.add(family)
  return installed
}
