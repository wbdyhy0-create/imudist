/**
 * A build for testing: it stops working on a date that is written into it when it is built (`VITE_TRIAL_EXPIRES`, see
 * scripts/build-trial.mjs). An ordinary build has no such date and none of this applies to it.
 */

export type TrialStatus = 'ok' | 'expired' | 'clock-changed'

/** how far back the clock may go before it counts as having been set back (a correction of the clock, daylight saving) */
const CLOCK_TOLERANCE_MS = 60 * 60 * 1000

/**
 * The end of the test, in milliseconds, from the text written into the build: null for an ordinary build, and 0 (over already) when
 * the text is there but is no date - a test build never runs for ever because of a mistake.
 */
export function trialExpiry(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const time = Date.parse(raw)
  return Number.isFinite(time) ? time : 0
}

/** Is the test still on: over, or the clock of the computer went back (from the latest time seen) to run it longer. */
export function trialStatus(now: number, expiresAt: number, lastSeen: number | null): TrialStatus {
  if (now >= expiresAt) return 'expired'
  if (lastSeen !== null && now < lastSeen - CLOCK_TOLERANCE_MS) return 'clock-changed'
  return 'ok'
}
