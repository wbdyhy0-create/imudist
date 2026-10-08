const STORAGE_KEY = 'imudist.lastUsedFontFamily'
const FALLBACK_FONT = 'Segoe UI'

export function getLastUsedFontFamily(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || FALLBACK_FONT
  } catch {
    return FALLBACK_FONT
  }
}

export function rememberFontFamily(family: string): void {
  const value = family.trim()
  if (!value) return
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch (error) {
    console.warn('Could not save the preferred font.', error)
  }
}
