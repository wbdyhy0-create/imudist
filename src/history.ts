import { useCallback, useRef, useState } from 'react'

/** Changes with the same key that come within this many ms of each other become one undo step. */
const COALESCE_MS = 1000
const MAX_STEPS = 200

interface State<T> {
  past: T[]
  present: T
  future: T[]
}

/**
 * Undo / redo for an immutable value. `change(next, key)` records the previous value; repeated changes with the
 * same `key` in quick succession (typing, dragging, stepping a number) replace each other instead of piling up.
 */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<State<T>>({ past: [], present: initial, future: [] })
  const last = useRef<{ key: string; at: number } | null>(null)

  const change = useCallback((next: T, key?: string) => {
    const now = Date.now()
    // decided here (not inside the updater) so React may safely run the updater more than once
    const merge = !!key && last.current?.key === key && now - last.current.at < COALESCE_MS
    last.current = key ? { key, at: now } : null
    setH((s) => (next === s.present ? s : { past: merge ? s.past : [...s.past, s.present].slice(-MAX_STEPS), present: next, future: [] }))
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s))
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s))
  }, [])

  /**
   * Swap the current value without recording a step (e.g. renaming after a save). mapOther is applied to every
   * value in the undo / redo lists too, so the change is not undone by going back in time.
   */
  const replace = useCallback((value: T, mapOther?: (s: T) => T) => {
    setH((s) => ({ past: mapOther ? s.past.map(mapOther) : s.past, present: value, future: mapOther ? s.future.map(mapOther) : s.future }))
  }, [])

  /** start over with `value` and no history (new or closed document) */
  const reset = useCallback((value: T) => {
    last.current = null
    setH({ past: [], present: value, future: [] })
  }, [])

  return { value: h.present, change, undo, redo, reset, replace, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
