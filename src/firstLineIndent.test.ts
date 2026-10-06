import { describe, expect, it } from 'vitest'
import { clearParagraphFirstLineIndent } from './story'

describe('clearing a paragraph first-line indent', () => {
  it('overrides an inherited indent only on the selected paragraph', () => {
    const patches = [{ align: 'center' as const }, { leading: 20 }]

    expect(clearParagraphFirstLineIndent(patches, 1, 2, 12)).toEqual([
      { align: 'center' },
      { leading: 20, firstLineIndent: 0 },
    ])
    expect(patches).toEqual([{ align: 'center' }, { leading: 20 }])
  })

  it('does not change a paragraph that has no effective indent', () => {
    expect(clearParagraphFirstLineIndent([{ firstLineIndent: 0 }], 0, 1, 12)).toBeNull()
    expect(clearParagraphFirstLineIndent(undefined, 0, 1, 0)).toBeNull()
  })
})
