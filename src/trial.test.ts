import { describe, expect, it } from 'vitest'
import { trialExpiry, trialStatus } from './trial'

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
