import { afterEach, describe, expect, it, vi } from 'vitest'
import { fontSupportsHebrew, groupSystemFonts } from './fonts'

afterEach(() => vi.unstubAllGlobals())

describe('system font catalog', () => {
  it('keeps fonts regardless of their language coverage and groups styles by family', () => {
    const families = groupSystemFonts([
      { family: 'Latin Only', fullName: 'Latin Only Regular', postscriptName: 'LatinOnly-Regular', style: 'Regular' },
      { family: 'עברית', fullName: 'עברית Regular', postscriptName: 'Hebrew-Regular', style: 'Regular' },
      { family: 'Latin Only', fullName: 'Latin Only Bold', postscriptName: 'LatinOnly-Bold', style: 'Bold' },
    ])

    expect(new Set(families.map((family) => family.family))).toEqual(new Set(['Latin Only', 'עברית']))
    expect(families.find((family) => family.family === 'Latin Only')?.faces.map((face) => face.weight)).toEqual([400, 700])
    expect(families.find((family) => family.family === 'עברית')?.faces).toHaveLength(1)
  })

  it('distinguishes fonts with Hebrew glyphs from fonts that fall back', () => {
    const context = {
      font: '',
      measureText: () => ({ width: context.font.includes('"Hebrew Support Test"') ? 330 : 300 }),
    }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })

    expect(fontSupportsHebrew('Latin Only Support Test')).toBe(false)
    expect(fontSupportsHebrew('Hebrew Support Test')).toBe(true)
  })
})
