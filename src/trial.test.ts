import { describe, expect, it } from 'vitest'
import { trialDays, trialEndFromStart, trialExpiry, trialStatus } from './trial'

const DAY = 24 * 60 * 60 * 1000

describe('the end date of a build for testing', () => {
  it('is nothing for an ordinary build', () => {
    expect(trialExpiry(undefined)).toBeNull()
    expect(trialExpiry('')).toBeNull()
    expect(trialExpiry('   ')).toBeNull()
  })

  it('is the date that is written in the build', () => {
    expect(trialExpiry('2026-10-25T12:00:00.000Z')).toBe(Date.UTC(2026, 9, 25, 12))
  })

  it('is already over when the text is not a date, so a mistake does not make a build that never ends', () => {
    expect(trialExpiry('soon')).toBe(0)
    expect(trialStatus(Date.now(), trialExpiry('soon')!, null)).toBe('expired')
  })
})

describe('whether a build for testing is still on', () => {
  const end = Date.UTC(2026, 9, 25)

  it('runs until the end date', () => {
    expect(trialStatus(end - DAY, end, null)).toBe('ok')
    expect(trialStatus(end - 1, end, null)).toBe('ok')
  })

  it('is over from the end date on', () => {
    expect(trialStatus(end, end, null)).toBe('expired')
    expect(trialStatus(end + 30 * DAY, end, null)).toBe('expired')
  })

  it('is stopped when the clock was set back from a time that was seen', () => {
    expect(trialStatus(end - 10 * DAY, end, end - 2 * DAY)).toBe('clock-changed')
  })

  it('lets a small correction of the clock pass', () => {
    const seen = end - 5 * DAY
    expect(trialStatus(seen - 5 * 60 * 1000, end, seen)).toBe('ok')
  })

  it('is over, whatever the clock was set to, once the end date has passed', () => {
    expect(trialStatus(end + DAY, end, end + 10 * DAY)).toBe('expired')
  })
})

describe('a test counted in days from its first start', () => {
  it('has no length for a build that does not ask for one, and is read as a positive number of days', () => {
    expect(trialDays(undefined)).toBeNull()
    expect(trialDays('')).toBeNull()
    expect(trialDays('180')).toBe(180)
    expect(trialDays('soon')).toBe(0)
    expect(trialDays('-5')).toBe(0)
  })

  it('ends the given days after the start', () => {
    const start = Date.UTC(2026, 0, 1)
    expect(trialEndFromStart(180, start, null)).toBe(start + 180 * DAY)
  })

  it('ends at once when the start could not be kept or the length is no good', () => {
    expect(trialEndFromStart(180, null, null)).toBe(0)
    expect(trialEndFromStart(0, Date.now(), null)).toBe(0)
  })

  it('ends at the earlier of the days and the end written into the build', () => {
    const start = Date.UTC(2026, 0, 1)
    expect(trialEndFromStart(180, start, start + 10 * DAY)).toBe(start + 10 * DAY)
    expect(trialEndFromStart(180, start, start + 400 * DAY)).toBe(start + 180 * DAY)
  })
})
