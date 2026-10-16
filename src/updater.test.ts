import { describe, expect, it } from 'vitest'
import { CHECK_EVERY_MS, dueForAutomaticCheck, percentDone } from './updater'

describe('when the program asks for updates by itself', () => {
  const now = 1_800_000_000_000
  it('asks when it never did, and after the interval', () => {
    expect(dueForAutomaticCheck(null, now)).toBe(true)
    expect(dueForAutomaticCheck(now - CHECK_EVERY_MS, now)).toBe(true)
    expect(dueForAutomaticCheck(now - CHECK_EVERY_MS - 1000, now)).toBe(true)
  })
  it('waits within the interval, and asks when the clock went back', () => {
    expect(dueForAutomaticCheck(now - 60_000, now)).toBe(false)
    expect(dueForAutomaticCheck(now - CHECK_EVERY_MS + 1000, now)).toBe(false)
    expect(dueForAutomaticCheck(now + 5 * 60_000, now)).toBe(true)
    expect(dueForAutomaticCheck(Number.NaN, now)).toBe(true)
  })
})

describe('how far a download is', () => {
  it('is a percentage, and unknown when the size is', () => {
    expect(percentDone(0, 1000)).toBe(0)
    expect(percentDone(250, 1000)).toBe(25)
    expect(percentDone(1000, 1000)).toBe(100)
    expect(percentDone(1200, 1000)).toBe(100)
    expect(percentDone(10, null)).toBeNull()
    expect(percentDone(10, 0)).toBeNull()
  })
})
