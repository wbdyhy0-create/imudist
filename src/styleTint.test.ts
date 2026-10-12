import { describe, expect, it } from 'vitest'
import { tintHex } from './colorModels'
import type { ParagraphStyleRecord } from './document'
import { resolveParagraphStyle } from './styleApply'

const styles: ParagraphStyleRecord[] = [
  { id: 'base', name: 'בסיס', patch: { color: '#204080' } },
  { id: 'light', name: 'בהיר', basedOnId: 'base', patch: { tint: 50 } },
  { id: 'lighter', name: 'בהיר מאוד', basedOnId: 'light', patch: { fontSize: 12 } },
  { id: 'full', name: 'מלא', basedOnId: 'base', patch: { tint: 100 } },
]

describe('paragraph style tint', () => {
  it('lightens the text colour of the style', () => {
    expect(resolveParagraphStyle('light', styles).color).toBe(tintHex('#204080', 50))
    expect(resolveParagraphStyle('light', styles).color).not.toBe('#204080')
  })

  it('leaves a full tint and a style without one alone', () => {
    expect(resolveParagraphStyle('full', styles).color).toBe('#204080')
    expect(resolveParagraphStyle('base', styles).color).toBe('#204080')
  })

  it('tints once for a style based on a tinted one', () => {
    expect(resolveParagraphStyle('lighter', styles).color).toBe(tintHex('#204080', 50))
  })
})
