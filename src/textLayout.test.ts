import { describe, expect, it } from 'vitest'
import type { CharStyle, Run } from './document'
import { sameLayoutRuns } from './textLayout'

const base: CharStyle = { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0, color: '#000000' }
const run = (len: number, patch: Partial<CharStyle> = {}): Run => ({ len, style: { ...base, ...patch } })

describe('runs that lay the text out the same', () => {
  it('ignore the colour, the outline and the shadow of the letters', () => {
    expect(sameLayoutRuns([run(10)], [run(10, { color: '#ff0000', outlineColor: '#00ff00', outlineWidth: 1, shadowOpacity: 0.5 })])).toBe(true)
  })

  it('may be cut in other places', () => {
    expect(sameLayoutRuns([run(10)], [run(3, { color: '#ff0000' }), run(7)])).toBe(true)
    expect(sameLayoutRuns([run(3), run(7, { color: '#0000ff' })], [run(5, { color: '#ff0000' }), run(5)])).toBe(true)
  })

  it('see a change of what moves or sizes a letter', () => {
    expect(sameLayoutRuns([run(10)], [run(3, { fontSize: 18 }), run(7)])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10, { weight: 700 })])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10, { tracking: 20 })])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10, { italic: true })])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10, { baselineShift: 3 })])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10, { fontFamily: 'Georgia' })])).toBe(false)
  })

  it('are not the same when the text is not as long', () => {
    expect(sameLayoutRuns([run(10)], [run(9)])).toBe(false)
    expect(sameLayoutRuns([run(10)], [run(10), run(1)])).toBe(false)
  })
})
