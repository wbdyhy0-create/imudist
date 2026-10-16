/** the desktop app (the test environment has no window; fileio.ts needs one when it is loaded) */
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Updates of the program (the desktop app only): the app asks a list on the web (the address is in `tauri.conf.json`; a test build has
 * its own list, see `tauri.trial.conf.json`) whether there is a newer version, and when there is, downloads it, checks its signature
 * against the key written into the app, installs it and starts again.
 */

/** a newer version of the program, as the person is told of it; `install` downloads it, installs it and starts the program again */
export interface UpdateOffer {
  version: string
  currentVersion: string
  /** what is new, as the list gives it (may be empty) */
  notes: string
  install: (onProgress: (received: number, total: number | null) => void) => Promise<void>
}

/** what the update window shows */
export type UpdateStatus = { kind: 'checking' } | { kind: 'none' } | { kind: 'failed' } | { kind: 'available'; offer: UpdateOffer }

const CHECKED_KEY = 'imudist.updateCheckedAt'
/** the program asks by itself at most this often (the person can always ask from the Help menu) */
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000

/** Whether it is time for the program to ask by itself: it was not asked within the last `CHECK_EVERY_MS`. */
export function dueForAutomaticCheck(lastCheckedAt: number | null, now: number = Date.now()): boolean {
  return lastCheckedAt === null || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= CHECK_EVERY_MS || lastCheckedAt > now
}

export function lastAutomaticCheck(): number | null {
  try {
    const value = Number(window.localStorage.getItem(CHECKED_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function markChecked(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(CHECKED_KEY, String(now))
  } catch {
    // asked again at the next start
  }
}

/** The percentage of a download that is done, 0-100; null when the size is not known. */
export function percentDone(received: number, total: number | null): number | null {
  if (total === null || !(total > 0)) return null
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)))
}

/** Asks the list whether there is a newer version: null when there is not (or this is not the desktop app); throws when the list cannot be read. */
export async function checkForUpdate(): Promise<UpdateOffer | null> {
  if (!isTauri) return null
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check({ timeout: 20000 })
  if (!update) return null
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? '',
    install: async (onProgress) => {
      let received = 0
      let total: number | null = null
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
          onProgress(0, total)
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength
          onProgress(received, total)
        }
      })
      // on Windows the installer ends the program itself; elsewhere it is started again here
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    },
  }
}
