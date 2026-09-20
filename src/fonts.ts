import { useSyncExternalStore } from 'react'
import { FONT_FAMILIES } from './document'

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

interface FontState {
  families: FontFamily[]
  status: FontStatus
}

/** Minimal typing of the Local Font Access API (Chrome / Edge). */
interface LocalFontData {
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
  100: 'דק במיוחד',
  200: 'דק מאוד',
  300: 'דק',
  350: 'חצי-דק',
  400: 'רגיל',
  500: 'בינוני',
  600: 'חצי-מודגש',
  700: 'מודגש',
  800: 'מודגש מאוד',
  900: 'שחור',
}

/** Hebrew name of a weight, e.g. 600 → "חצי-מודגש". */
export const weightName = (w: number) => HEBREW_WEIGHT_NAMES[w] ?? String(w)

const FALLBACK: FontFamily[] = FONT_FAMILIES.map((family) => ({
  family,
  faces: [
    { style: 'Regular', weight: 400, italic: false },
    { style: 'Italic', weight: 400, italic: true },
    { style: 'Bold', weight: 700, italic: false },
    { style: 'Bold Italic', weight: 700, italic: true },
  ],
}))

let state: FontState = { families: FALLBACK, status: 'fallback' }
const listeners = new Set<() => void>()
const set = (next: FontState) => {
  state = next
  listeners.forEach((l) => l())
}

let loading: Promise<void> | null = null

/** Read the fonts installed on this computer. The browser asks the user for permission the first time. */
export function loadSystemFonts(): Promise<void> {
  if (loading) return loading
  const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts
  if (!query) {
    set({ ...state, status: 'unavailable' })
    return Promise.resolve()
  }
  set({ ...state, status: 'loading' })
  loading = query
    .call(window)
    .then((fonts) => {
      const byFamily = new Map<string, Map<string, FontFace>>()
      for (const f of fonts) {
        const faces = byFamily.get(f.family) ?? new Map<string, FontFace>()
        const face: FontFace = { style: f.style, weight: weightFromStyle(f.style), italic: isItalicStyle(f.style) }
        const key = `${face.weight}|${face.italic}`
        if (!faces.has(key)) faces.set(key, face)
        byFamily.set(f.family, faces)
      }
      const families = [...byFamily.entries()]
        .map(([family, faces]) => ({
          family,
          faces: [...faces.values()].sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic)),
        }))
        .sort((a, b) => a.family.localeCompare(b.family))
      set(families.length ? { families, status: 'system' } : { ...state, status: 'denied' })
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

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => state

/** The font catalog (system fonts once loaded, a built-in Hebrew-friendly list before that). */
export function useFontCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot)
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
