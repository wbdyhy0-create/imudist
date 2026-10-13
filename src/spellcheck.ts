import { useSyncExternalStore } from 'react'
import type { TextDirection } from './document'
import { getLanguage, type Language } from './i18n'

/**
 * Spell checking while typing: the browser's own checker, switched on for the text being edited. A per-user choice, kept in the
 * browser's storage (and off until it is made: Hebrew text is not checked by every engine, and a squiggle under every word helps no one).
 */
const STORAGE_KEY = 'imudist.spellcheck'

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let on = typeof window === 'undefined' ? false : read()
const listeners = new Set<() => void>()

export const isSpellcheckOn = () => on

export function setSpellcheck(next: boolean): void {
  if (next === on) return
  on = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // not kept for the next time; it holds for this one
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** the setting, as a React value: whatever reads it is drawn again when the user changes it */
export const useSpellcheck = (): boolean => useSyncExternalStore(subscribe, isSpellcheckOn, () => false)

/**
 * The language the text of a story is checked in. There is no language per piece of text: a story that reads from the left is
 * taken to be English, and one that reads from the right to be in the language of the interface when that is Hebrew or Arabic
 * (Hebrew when the interface is English).
 */
export function proofingLanguage(direction: TextDirection | undefined, interfaceLanguage: Language = getLanguage()): string {
  if (direction === 'ltr') return 'en'
  return interfaceLanguage === 'ar' ? 'ar' : 'he'
}
