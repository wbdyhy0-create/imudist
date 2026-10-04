/**
 * The waiting, writing and bookkeeping behind autosave, with no React in it (useAutosave.ts is the hook around it).
 *
 * A document that has unsaved changes is "touched" with its current content: that starts a wait (`delayMs`), and every
 * further change starts it over - so nothing is written while the user is still typing or dragging, only after a pause.
 * When the wait is over the document is written, one write at a time per document; a write asked for while another
 * is under way follows it. `flush` writes everything that is waiting right now (leaving the page, closing the window).
 */

/** what a write did: `skipped` is "nothing to write, or nowhere to write it" - not an error */
export type AutosaveOutcome = 'saved' | 'skipped' | 'failed'

export type AutosaveStatus = 'idle' | 'waiting' | 'saving' | 'failed'

export interface AutosaveOptions<K> {
  /** quiet time after the last change before the write (a function of the document when it can differ between them) */
  delayMs: number | ((key: K) => number)
  write: (key: K) => Promise<AutosaveOutcome>
  /** true while the user is in the middle of something (a mouse button held down mid-drag): a write that is due waits a little longer */
  busy?: () => boolean
  /** called whenever the status of some document changed (to show it) */
  onChange?: () => void
}

/** how long a write that was due but found the user busy waits before looking again */
const BUSY_RETRY_MS = 400
/**
 * A document waits at least this many times as long as its last write took before the next one: however heavy the
 * document, writing is then never more than a tenth of the time (a write that took 1.5 s means 13.5 s until the next).
 */
const LOAD_FACTOR = 9

const MB = 1024 * 1024
/** a document with up to this much picture data is written after the plain wait; every MB more adds `PER_MB_MS` to it */
const LIGHT_DOCUMENT_BYTES = 8 * MB
const PER_MB_MS = 100
const LONGEST_WAIT_MS = 30_000

/**
 * The quiet time before an autosave of a document that holds `weightBytes` of embedded pictures: the plain `baseMs`
 * for an ordinary one, longer for a heavy one (364 pages imported from a PDF are hundreds of MB that every autosave
 * would write again), 30 seconds at the most.
 */
export function autosaveDelay(baseMs: number, weightBytes: number): number {
  const extra = Math.max(0, weightBytes - LIGHT_DOCUMENT_BYTES) / MB * PER_MB_MS
  return Math.max(baseMs, Math.min(LONGEST_WAIT_MS, baseMs + extra))
}

export class AutosaveScheduler<K> {
  private readonly delay: (key: K) => number
  private readonly write: (key: K) => Promise<AutosaveOutcome>
  private readonly busy?: () => boolean
  private readonly onChange?: () => void
  private readonly timers = new Map<K, ReturnType<typeof setTimeout>>()
  /** the unsaved content each document was last touched with: touching it with the same one again changes nothing */
  private readonly versions = new Map<K, unknown>()
  /** the last write of each document that is under way or queued */
  private readonly writes = new Map<K, Promise<boolean>>()
  private readonly saving = new Set<K>()
  private readonly failed = new Set<K>()
  /** how long the last successful write of each document took, and when it ended */
  private readonly lastWrite = new Map<K, { took: number; endedAt: number }>()

  constructor(options: AutosaveOptions<K>) {
    const { delayMs } = options
    this.delay = typeof delayMs === 'function' ? delayMs : () => delayMs
    this.write = options.write
    this.busy = options.busy
    this.onChange = options.onChange
  }

  /** The document `key` has unsaved changes and is at `version`: start (or start over) its wait. */
  touch(key: K, version: unknown) {
    if (this.versions.get(key) === version) return
    this.versions.set(key, version)
    this.failed.delete(key)
    this.arm(key, this.waitFor(key))
  }

  /** The document has nothing to save (or must not be saved by itself): forget about it. */
  settle(key: K) {
    const had = this.versions.delete(key) || this.timers.has(key) || this.failed.has(key)
    this.clearTimer(key)
    this.failed.delete(key)
    if (had) this.onChange?.()
  }

  /** Forget every document that is not in `live` (closed documents). */
  retainOnly(live: ReadonlySet<K>) {
    for (const key of new Set([...this.versions.keys(), ...this.timers.keys(), ...this.failed, ...this.lastWrite.keys()])) {
      if (live.has(key)) continue
      this.settle(key)
      this.lastWrite.delete(key)
    }
  }

  status(key: K): AutosaveStatus {
    if (this.failed.has(key)) return 'failed'
    if (this.saving.has(key)) return 'saving'
    return this.timers.has(key) ? 'waiting' : 'idle'
  }

  /** Is anything waiting for its write, being written, or failed to be (so that a "leave this page?" question is due)? */
  get pending() {
    return this.timers.size > 0 || this.saving.size > 0 || this.failed.size > 0
  }

  /** Write everything that is unsaved right now instead of waiting. Resolves to false if any write failed. */
  async flush(): Promise<boolean> {
    const keys = new Set<K>([...this.timers.keys(), ...this.versions.keys(), ...this.writes.keys()])
    for (const key of keys) this.clearTimer(key)
    this.onChange?.()
    const results = await Promise.all([...keys].map((key) => this.run(key)))
    return results.every(Boolean)
  }

  /** Stop every wait (the writes already under way finish). */
  dispose() {
    for (const key of [...this.timers.keys()]) this.clearTimer(key)
  }

  /** the plain wait - or, for a document whose last write was slow, the time that keeps writing to a tenth of the time */
  private waitFor(key: K) {
    const last = this.lastWrite.get(key)
    const rest = last ? last.endedAt + last.took * LOAD_FACTOR - Date.now() : 0
    return Math.max(this.delay(key), rest)
  }

  private clearTimer(key: K) {
    const timer = this.timers.get(key)
    if (timer === undefined) return
    clearTimeout(timer)
    this.timers.delete(key)
  }

  private arm(key: K, ms: number) {
    this.clearTimer(key)
    this.timers.set(key, setTimeout(() => this.due(key), ms))
    this.onChange?.()
  }

  private due(key: K) {
    this.timers.delete(key)
    if (this.busy?.()) {
      this.arm(key, BUSY_RETRY_MS)
      return
    }
    this.onChange?.()
    void this.run(key)
  }

  /** one write at a time per document: a write asked for while another is under way runs right after it */
  private run(key: K): Promise<boolean> {
    const after = this.writes.get(key) ?? Promise.resolve(true)
    const job = after.then(async () => {
      this.saving.add(key)
      this.onChange?.()
      let outcome: AutosaveOutcome
      const began = Date.now()
      try {
        outcome = await this.write(key)
      } catch {
        outcome = 'failed'
      }
      if (outcome === 'saved') this.lastWrite.set(key, { took: Date.now() - began, endedAt: Date.now() })
      this.saving.delete(key)
      if (outcome === 'failed') this.failed.add(key)
      else this.failed.delete(key)
      this.onChange?.()
      return outcome !== 'failed'
    })
    this.writes.set(key, job)
    void job.finally(() => {
      if (this.writes.get(key) === job) this.writes.delete(key)
    })
    return job
  }
}
