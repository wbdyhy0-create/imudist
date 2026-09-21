/** Changes with the same key that come within this many ms of each other become one undo step. */
export const COALESCE_MS = 1000
const MAX_STEPS = 200

/** Undo / redo lists of one immutable value. Every open document has its own. */
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export const newHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] })

/**
 * Apply a change. `next` may be a function of the current value, so a change is always applied to the newest state.
 * With `merge` the previous value is not recorded again (repeated changes of the same kind become one undo step);
 * the caller decides that from the key and the time of the last change.
 */
export function changeHistory<T>(h: History<T>, next: T | ((prev: T) => T), merge: boolean): History<T> {
  const value = typeof next === 'function' ? (next as (prev: T) => T)(h.present) : next
  return value === h.present ? h : { past: merge ? h.past : [...h.past, h.present].slice(-MAX_STEPS), present: value, future: [] }
}

export const undoHistory = <T,>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h

export const redoHistory = <T,>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h

/**
 * Swap the current value without recording a step (e.g. renaming after a save). `mapOther` is applied to every
 * value in the undo / redo lists too, so the change is not undone by going back in time.
 */
export const replaceHistory = <T,>(h: History<T>, value: T, mapOther?: (s: T) => T): History<T> => ({
  past: mapOther ? h.past.map(mapOther) : h.past,
  present: value,
  future: mapOther ? h.future.map(mapOther) : h.future,
})
