import { describe, expect, it } from 'vitest'
import { COALESCE_MS, shouldMergeChange } from './history'

describe('shouldMergeChange', () => {
  it('keeps one gap drag transaction merged across pauses longer than the usual timeout', () => {
    expect(shouldMergeChange({ key: 'gap:gesture-1', at: 100 }, 'gap:gesture-1', 100 + COALESCE_MS + 5000)).toBe(true)
  })

  it('keeps ordinary changes time-coalesced and isolates separate gap gestures', () => {
    expect(shouldMergeChange({ key: 'resize:1', at: 100 }, 'resize:1', 100 + COALESCE_MS + 1)).toBe(false)
    expect(shouldMergeChange({ key: 'gap:gesture-1', at: 100 }, 'gap:gesture-2', 110)).toBe(false)
    expect(shouldMergeChange(null, 'gap:gesture-1', 110)).toBe(false)
  })
})