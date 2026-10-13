// not imported from fileio, which needs a window as soon as it is loaded (the tests of the fonts run with none)
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** One installed font: its names, and its file when it is wanted (the shape of what the browser's own list gives). */
export interface InstalledFont {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob(): Promise<Blob>
}

interface DesktopFont {
  family: string
  fullName: string
  postscriptName: string
  style: string
  path: string
}

async function desktopFonts(): Promise<InstalledFont[]> {
  const { invoke } = await import('@tauri-apps/api/core')
  const found = await invoke<DesktopFont[]>('list_system_fonts')
  return found.map((font) => ({
    family: font.family,
    fullName: font.fullName,
    postscriptName: font.postscriptName,
    style: font.style,
    blob: async () => new Blob([await invoke<ArrayBuffer>('read_system_font', { path: font.path })]),
  }))
}

/**
 * How the installed fonts are listed here: by the browser itself where it can (Chrome, Edge, and so the Windows program), and by
 * the desktop program where it cannot (the Mac's web view has no such list), which needs no permission. Undefined where neither can.
 */
export function installedFontsQuery(): (() => Promise<InstalledFont[]>) | undefined {
  const own = typeof window === 'undefined' ? undefined : (window as unknown as { queryLocalFonts?: () => Promise<InstalledFont[]> }).queryLocalFonts
  if (own) return () => own.call(window)
  return isTauri ? desktopFonts : undefined
}

/** True where the list comes from the desktop program, so it can be read at once with no question asked. */
export const fontsComeFromDesktop = (): boolean => typeof window !== 'undefined' && !(window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts && isTauri
