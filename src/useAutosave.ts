import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { AutosaveScheduler, autosaveDelay, type AutosaveOutcome } from './autosave'
import { isTauri } from './fileio'

/** quiet time after the last change before an autosave */
export const AUTOSAVE_DELAY_MS = 2500
/** a close request never waits longer than this for the writes (a disk that does not answer must not keep the window open) */
const CLOSE_FLUSH_LIMIT_MS = 5000

/** One open document, as autosave needs to see it. */
export interface AutosaveDoc {
  id: number
  /** the document as it is now: a different value (not different insides) means it changed */
  content: unknown
  /** what was last written to disk: the document has unsaved changes while this is a different value from `content` */
  saved: unknown
  /** there is a file it can be written to without asking anyone (a path on the desktop, a writable handle in the browser) */
  writable: boolean
  /** bytes of embedded pictures: a heavy document is written after a longer pause (see autosaveDelay) */
  weight?: number
}

/**
 * What to show about the shown document:
 * off - autosave is off, or there is nothing to say; needsFile - it has changes but was never saved to a file, so
 * there is nowhere to write them yet; saved - everything is on disk; waiting - changes, written after a pause;
 * saving - being written; error - the last write failed
 */
export type AutosaveState = 'off' | 'needsFile' | 'saved' | 'waiting' | 'saving' | 'error'

interface Options {
  docs: AutosaveDoc[]
  /** the document whose state is reported */
  activeId: number | null
  /** writes document `id` as it is now - quietly: no file dialog, no download, no message */
  write: (id: number) => Promise<AutosaveOutcome>
  enabled?: boolean
  delayMs?: number
  /**
   * The desktop window is being closed (after the writes were tried): resolve to false to keep it open - to ask
   * about changes that could not be saved by themselves, for instance.
   */
  confirmClose?: () => Promise<boolean>
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Autosave: a document with unsaved changes is written to its file after `delayMs` (2.5 s) without a change - every
 * change starts the wait over, and a write that is due while a mouse button is held (a drag) waits for it to be let
 * go. Leaving the page, hiding the window or closing the desktop window writes what is pending at once. Only plain
 * `setTimeout`s held in refs - nothing here outlives the component. See autosave.ts for the waiting itself.
 */
export function useAutosave({ docs, activeId, write, enabled = true, delayMs = AUTOSAVE_DELAY_MS, confirmClose }: Options) {
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  const pointerHeld = useRef(false)
  const writeRef = useRef(write)
  const confirmRef = useRef(confirmClose)
  const delayRef = useRef(delayMs)
  const docsRef = useRef(docs)
  const [scheduler] = useState(
    () =>
      new AutosaveScheduler<number>({
        delayMs: (id) => autosaveDelay(delayRef.current, docsRef.current.find((doc) => doc.id === id)?.weight ?? 0),
        write: (id) => writeRef.current(id),
        busy: () => pointerHeld.current,
        onChange: rerender,
      }),
  )
  useLayoutEffect(() => {
    writeRef.current = write
    confirmRef.current = confirmClose
    delayRef.current = delayMs
    docsRef.current = docs
  })

  // what to wait for: every document that has changes and a file to write them to
  useEffect(() => {
    const live = new Set<number>()
    for (const doc of docs) {
      live.add(doc.id)
      if (enabled && doc.writable && doc.content !== doc.saved) scheduler.touch(doc.id, doc.content)
      else scheduler.settle(doc.id)
    }
    scheduler.retainOnly(live)
  })

  // no wait outlives the component (React 19 runs this cleanup and the effects again in development: the next run
  // finds the documents untouched and starts their waits afresh)
  useEffect(() => () => scheduler.dispose(), [scheduler])

  // a mouse button held down = a drag or a selection in progress: nothing is written until it is let go
  useEffect(() => {
    const down = () => {
      pointerHeld.current = true
    }
    const up = () => {
      pointerHeld.current = false
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('blur', up)
    }
  }, [])

  const flush = useCallback(() => scheduler.flush(), [scheduler])

  // leaving: write what is pending right now. The page cannot wait for a write that is asynchronous, so the browser's own
  // "leave this page?" question (useDocumentSession.ts) stays for whatever has not reached the disk by the time it is answered.
  useEffect(() => {
    const now = () => void scheduler.flush()
    const hidden = () => {
      if (document.visibilityState === 'hidden') now()
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', now)
    window.addEventListener('beforeunload', now)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', now)
      window.removeEventListener('beforeunload', now)
    }
  }, [scheduler])

  // the desktop window: the close waits for the writes (never long), then asks about what is still unsaved
  useEffect(() => {
    if (!isTauri) return
    let stop: (() => void) | undefined
    let gone = false
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          await Promise.race([scheduler.flush(), delay(CLOSE_FLUSH_LIMIT_MS)])
          const close = (await confirmRef.current?.()) ?? true
          if (!close) event.preventDefault()
        })
        if (gone) unlisten()
        else stop = unlisten
      } catch (error) {
        // without the window API the page-level handlers above are all there is
        console.warn('Autosave could not watch the window closing.', error)
      }
    })()
    return () => {
      gone = true
      stop?.()
    }
  }, [scheduler])

  const active = docs.find((doc) => doc.id === activeId)
  let state: AutosaveState = 'off'
  if (enabled && active) {
    const unsaved = active.content !== active.saved
    const status = scheduler.status(active.id)
    if (!active.writable) state = unsaved ? 'needsFile' : 'off'
    else if (status === 'failed') state = 'error'
    else if (status === 'saving') state = 'saving'
    else if (status === 'waiting' || unsaved) state = 'waiting'
    else state = 'saved'
  }
  return { state, flush }
}
