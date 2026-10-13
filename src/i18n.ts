import { useSyncExternalStore } from 'react'
import { ar } from './locales/ar'
import { en } from './locales/en'

/**
 * The language of the interface. The Hebrew text written in the code is the source: `t('קובץ')` gives that text in the language
 * the user chose, or the text itself when the language has no translation for it (so a language can be filled in a little at a
 * time, and nothing is ever missing from the screen). A language takes the direction of its writing: the whole window turns with it.
 */

export type Language = 'he' | 'en' | 'ar'

export interface LanguageInfo {
  id: Language
  /** its own name, as the language picker shows it */
  name: string
  dir: 'rtl' | 'ltr'
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'he', name: 'עברית', dir: 'rtl' },
  { id: 'en', name: 'English', dir: 'ltr' },
  { id: 'ar', name: 'العربية', dir: 'rtl' },
]

const STORAGE_KEY = 'imudist.language'

const TABLES: Partial<Record<Language, Record<string, string>>> = { en, ar }

/** where a string is looked for when the language does not have it: the next one down, and last the Hebrew of the code itself */
const FALLBACK: Record<Language, Language[]> = { he: [], en: ['he'], ar: ['en', 'he'] }

function stored(): Language {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value && LANGUAGES.some((language) => language.id === value)) return value as Language
  } catch {
    // no storage (a private window): the language is Hebrew until the user picks another
  }
  return 'he'
}

let current: Language = typeof window === 'undefined' ? 'he' : stored()
const listeners = new Set<() => void>()

export const getLanguage = (): Language => current

/** the tag the browser's own formatting of dates and numbers takes for the language of the interface */
export const localeTag = (language: Language = current): string => ({ he: 'he-IL', en: 'en-US', ar: 'ar' })[language]
export const directionOf = (language: Language = current): 'rtl' | 'ltr' => LANGUAGES.find((item) => item.id === language)?.dir ?? 'rtl'

/** the page takes the language and the direction of the interface (what is inside a text frame has its own direction) */
export function applyDocumentLanguage(language: Language = current): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
  document.documentElement.dir = directionOf(language)
}

export function setLanguage(language: Language): void {
  if (language === current || !LANGUAGES.some((item) => item.id === language)) return
  current = language
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // not kept for the next time; it holds for this one
  }
  applyDocumentLanguage(language)
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** the language, as a React value: a component that reads it is drawn again when the user changes language */
export const useLanguage = (): Language => useSyncExternalStore(subscribe, getLanguage, () => 'he' as Language)

/** `text` in the language of the interface; `{name}` in it is filled from `values` */
export function t(text: string, values?: Record<string, string | number>): string {
  let found: string | undefined
  for (const language of [current, ...FALLBACK[current]]) {
    found = TABLES[language]?.[text]
    if (found !== undefined) break
  }
  const out = found ?? text
  return values ? out.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole)) : out
}

applyDocumentLanguage()
