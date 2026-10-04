import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutosaveScheduler, autosaveDelay, type AutosaveOutcome } from './autosave'

const DELAY = 2500

function setup(options: { outcome?: () => AutosaveOutcome; busy?: () => boolean } = {}) {
  const written: number[] = []
  const gates: (() => void)[] = []
  const scheduler = new AutosaveScheduler<number>({
    delayMs: DELAY,
    busy: options.busy,
    write: async (key) => {
      written.push(key)
      return options.outcome?.() ?? 'saved'
    },
  })
  return { scheduler, written, gates }
}

describe('AutosaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('writes nothing at once, only after the quiet time', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    expect(scheduler.status(1)).toBe('waiting')
    await vi.advanceTimersByTimeAsync(DELAY - 1)
    expect(written).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(written).toEqual([1])
    expect(scheduler.status(1)).toBe('idle')
  })

  it('every change starts the wait over: a document that keeps changing is not written', async () => {
    const { scheduler, written } = setup()
    for (let version = 0; version < 10; version++) {
      scheduler.touch(1, version)
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(written).toEqual([])
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(written).toEqual([1])
  })

  it('touching a document with the content it already waits for does not restart the wait', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(2000)
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(500)
    expect(written).toEqual([1])
  })

  it('waits separately for every document', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(1500)
    scheduler.touch(2, 'b')
    await vi.advanceTimersByTimeAsync(1000)
    expect(written).toEqual([1])
    await vi.advanceTimersByTimeAsync(1500)
    expect(written).toEqual([1, 2])
  })

  it('a document that has nothing to save any more is forgotten, its write cancelled', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    scheduler.settle(1)
    await vi.advanceTimersByTimeAsync(DELAY * 2)
    expect(written).toEqual([])
    expect(scheduler.status(1)).toBe('idle')
  })

  it('closed documents are forgotten', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    scheduler.touch(2, 'b')
    scheduler.retainOnly(new Set([2]))
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(written).toEqual([2])
  })

  it('while the user is busy (a drag in progress) a write that is due waits, and goes once they are done', async () => {
    let busy = true
    const { scheduler, written } = setup({ busy: () => busy })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY + 3000)
    expect(written).toEqual([])
    expect(scheduler.status(1)).toBe('waiting')
    busy = false
    await vi.advanceTimersByTimeAsync(500)
    expect(written).toEqual([1])
  })

  it('flush writes what is waiting right now, once, and the wait is over', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    scheduler.touch(2, 'b')
    expect(await scheduler.flush()).toBe(true)
    expect(written.sort()).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(DELAY * 2)
    expect(written).toHaveLength(2)
    expect(scheduler.pending).toBe(false)
  })

  it('flush with nothing waiting writes nothing', async () => {
    const { scheduler, written } = setup()
    expect(await scheduler.flush()).toBe(true)
    expect(written).toEqual([])
  })

  it('a failed write is reported, and is not tried again until the document changes', async () => {
    let outcome: AutosaveOutcome = 'failed'
    const { scheduler, written } = setup({ outcome: () => outcome })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(scheduler.status(1)).toBe('failed')
    expect(scheduler.pending).toBe(true)
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY * 3)
    expect(written).toEqual([1])
    outcome = 'saved'
    scheduler.touch(1, 'b')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(written).toEqual([1, 1])
    expect(scheduler.status(1)).toBe('idle')
  })

  it('flush tries a failed document again, and says if it still fails', async () => {
    let outcome: AutosaveOutcome = 'failed'
    const { scheduler } = setup({ outcome: () => outcome })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(await scheduler.flush()).toBe(false)
    outcome = 'saved'
    expect(await scheduler.flush()).toBe(true)
  })

  it('a write that throws counts as failed', async () => {
    const scheduler = new AutosaveScheduler<number>({
      delayMs: DELAY,
      write: async () => {
        throw new Error('disk full')
      },
    })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(scheduler.status(1)).toBe('failed')
  })

  it('writes of one document never overlap: one asked for during another follows it', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    let first = true
    const scheduler = new AutosaveScheduler<number>({
      delayMs: DELAY,
      write: async () => {
        if (first) {
          first = false
          order.push('start 1')
          await new Promise<void>((resolve) => {
            release = resolve
          })
          order.push('end 1')
        } else {
          order.push('start 2')
          order.push('end 2')
        }
        return 'saved'
      },
    })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(DELAY)
    expect(scheduler.status(1)).toBe('saving')
    scheduler.touch(1, 'b')
    const flushed = scheduler.flush()
    await vi.advanceTimersByTimeAsync(10)
    expect(order).toEqual(['start 1'])
    release()
    await flushed
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('dispose stops every wait', async () => {
    const { scheduler, written } = setup()
    scheduler.touch(1, 'a')
    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(DELAY * 2)
    expect(written).toEqual([])
  })
})

describe('autosaveDelay', () => {
  const MB = 1024 * 1024
  it('is the plain wait for an ordinary document', () => {
    expect(autosaveDelay(2500, 0)).toBe(2500)
    expect(autosaveDelay(2500, 8 * MB)).toBe(2500)
  })

  it('grows with the weight of the pictures, up to 30 seconds', () => {
    expect(autosaveDelay(2500, 108 * MB)).toBe(12500)
    expect(autosaveDelay(2500, 364 * MB)).toBe(30000)
    expect(autosaveDelay(2500, 5000 * MB)).toBe(30000)
  })
})

describe('AutosaveScheduler under load', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits as long as the document asks for, each document its own', async () => {
    const written: number[] = []
    const scheduler = new AutosaveScheduler<number>({
      delayMs: (key) => (key === 1 ? 2500 : 10000),
      write: async (key) => {
        written.push(key)
        return 'saved'
      },
    })
    scheduler.touch(1, 'a')
    scheduler.touch(2, 'b')
    await vi.advanceTimersByTimeAsync(2500)
    expect(written).toEqual([1])
    await vi.advanceTimersByTimeAsync(7500)
    expect(written).toEqual([1, 2])
  })

  it('after a slow write the next one waits nine times as long as it took, so writing stays a tenth of the time', async () => {
    const written: number[] = []
    const scheduler = new AutosaveScheduler<number>({
      delayMs: 2500,
      write: async (key) => {
        written.push(Date.now())
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return key === 1 ? 'saved' : 'saved'
      },
    })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(2500 + 2000) // written, took 2 s, ended at 4.5 s
    expect(written).toHaveLength(1)
    scheduler.touch(1, 'b') // 4.5 s: the plain wait would write at 7 s
    await vi.advanceTimersByTimeAsync(2500)
    expect(written).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(15000) // 18 s after the end of the last write: 22.5 s
    expect(written).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(written).toHaveLength(2)
  })

  it('a quick write costs nothing extra', async () => {
    const written: number[] = []
    const scheduler = new AutosaveScheduler<number>({
      delayMs: 2500,
      write: async () => {
        written.push(Date.now())
        return 'saved'
      },
    })
    scheduler.touch(1, 'a')
    await vi.advanceTimersByTimeAsync(2500)
    scheduler.touch(1, 'b')
    await vi.advanceTimersByTimeAsync(2500)
    expect(written).toHaveLength(2)
  })

  it('flush ignores the waits: closing the program writes at once', async () => {
    const written: number[] = []
    const scheduler = new AutosaveScheduler<number>({
      delayMs: 30000,
      write: async (key) => {
        written.push(key)
        return 'saved'
      },
    })
    scheduler.touch(1, 'a')
    expect(await scheduler.flush()).toBe(true)
    expect(written).toEqual([1])
  })
})
