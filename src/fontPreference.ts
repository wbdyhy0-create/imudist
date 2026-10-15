const STORAGE_KEY = 'imudist.lastUsedFontFamily'
const RECENT_KEY = 'imudist.recentFontFamilies'
const FALLBACK_FONT = 'Segoe UI'
/** how many of the fonts the user picked last are kept (the font list shows them above the fonts of the computer) */
export const RECENT_FONTS = 12

export function getLastUsedFontFamily(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || FALLBACK_FONT
  } catch {
    return FALLBACK_FONT
  }
}

/** The fonts the user picked, the latest first. */
export function getRecentFontFamilies(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return [...new Set(stored.filter((family): family is string => typeof family === 'string' && family.trim() !== ''))].slice(0, RECENT_FONTS)
  } catch {
    return []
  }
}

/** A font was picked: it is the font new text starts in, and the first of the recent ones. */
export function rememberFontFamily(family: string): void {
  const value = family.trim()
  if (!value) return
  try {
    localStorage.setItem(STORAGE_KEY, value)
    localStorage.setItem(RECENT_KEY, JSON.stringify([value, ...getRecentFontFamilies().filter((recent) => recent !== value)].slice(0, RECENT_FONTS)))
  } catch (error) {
    console.warn('Could not save the preferred font.', error)
  }
}
