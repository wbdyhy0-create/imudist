import { describe, expect, it } from 'vitest'
import { isOrnamentDecoration, ORNAMENT_STYLES, ornamentExtent, ornamentPreviewMarkup, ornamentSideMarkup, usableOrnamentImage, type DividerOrnamentImage } from './footnoteOrnaments'
import { footnoteDividerHeight } from './footnoteLayout'
import { DEFAULT_FOOTNOTE_CONFIG, DEFAULT_TEXT_STYLE, defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'

// a one pixel PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const custom: DividerOrnamentImage = { name: 'swirl.png', dataUrl: PNG, width: 120, height: 40 }
const base = { side: 'right' as const, color: '#222222', thickness: 1, height: 16, fontSize: 12 }

describe('the ornaments of the footnote heading lines', () => {
  it('has a style of its own for every id, none of them drawn by the stylesheet', () => {
    expect(new Set(ORNAMENT_STYLES.map((style) => style.id)).size).toBe(ORNAMENT_STYLES.length)
    for (const style of ORNAMENT_STYLES) expect(isOrnamentDecoration(style.id)).toBe(true)
    for (const older of ['none', 'outer', 'both', 'curl', 'needle']) expect(isOrnamentDecoration(older)).toBe(false)
    expect(isOrnamentDecoration('custom')).toBe(true)
  })

  it('writes every style as a row with the colour of the text and the room to stretch', () => {
    for (const style of ORNAMENT_STYLES) {
      for (const side of ['right', 'left'] as const) {
        const markup = ornamentSideMarkup({ ...base, decoration: style.id, side })
        expect(markup.startsWith('<span class="footnote-divider-orn"')).toBe(true)
        expect(markup).toContain('flex:1 1 0')
        expect(markup).toContain('#222222')
      }
    }
  })

  it('puts the end at the outside: right of the right line, left of the left one, turned round on the left', () => {
    const right = ornamentSideMarkup({ ...base, decoration: 'circleEnd', side: 'right' })
    const left = ornamentSideMarkup({ ...base, decoration: 'circleEnd', side: 'left' })
    // the end (an svg) comes after the line on the right side, and before it on the left side
    expect(right.indexOf('border-top')).toBeLessThan(right.indexOf('<svg'))
    expect(left.indexOf('<svg')).toBeLessThan(left.indexOf('border-top'))
    expect(left).toContain('matrix(-1 0 0 1')
    expect(right).not.toContain('matrix(-1 0 0 1')
  })

  it('fades towards the outside on both sides', () => {
    const right = ornamentSideMarkup({ ...base, decoration: 'fade', side: 'right' })
    const left = ornamentSideMarkup({ ...base, decoration: 'fade', side: 'left' })
    expect(right).toMatch(/x1="0"[^>]*x2="100"/)
    expect(left).toMatch(/x1="100"[^>]*x2="0"/)
  })

  it('uses the picture the user imported, and nothing that is not a picture', () => {
    const markup = ornamentSideMarkup({ ...base, decoration: 'custom', custom })
    expect(markup).toContain(PNG)
    expect(markup).toContain('<image')
    // the picture is the whole ornament: no line is added next to it, and the row is only as wide as the picture
    expect(markup).not.toContain('border-top')
    expect(markup).toContain('flex:0 1000 auto')
    // a picture that cannot be used leaves the plain line
    expect(ornamentSideMarkup({ ...base, decoration: 'custom' })).toContain('border-top')
    // an address that is not a picture, or one that would break out of the markup, is left out
    const hostile = ornamentSideMarkup({ ...base, decoration: 'custom', custom: { ...custom, dataUrl: 'data:image/png;base64,AAAA"><script>alert(1)</script>' } })
    expect(hostile).not.toContain('<script')
    expect(hostile).not.toContain('<image')
    expect(usableOrnamentImage(custom)).toBe(true)
    expect(usableOrnamentImage({ ...custom, dataUrl: 'https://example.com/a.png' })).toBe(false)
    expect(usableOrnamentImage({ ...custom, width: 0 })).toBe(false)
  })

  it('is as tall as the font of the heading, and grows and shrinks with it', () => {
    const heightOf = (fontSize: number, scale?: number) => {
      const markup = ornamentSideMarkup({ ...base, decoration: 'custom', custom, fontSize, scale })
      return Number(/<svg[^>]*height="([0-9.]+)"/.exec(markup)![1])
    }
    // the picture is 120 by 40: as tall as the font, and so three times as wide as it is tall
    expect(heightOf(10)).toBeCloseTo(10, 5)
    expect(heightOf(20)).toBeCloseTo(20, 5)
    expect(heightOf(60)).toBeCloseTo(60, 5)
    expect(heightOf(10, 1.5)).toBeCloseTo(15, 5)
    const markup = ornamentSideMarkup({ ...base, decoration: 'custom', custom, fontSize: 20 })
    expect(markup).toMatch(/<svg[^>]*width="60"[^>]*height="20"/)
    // the built-in ends follow the font too
    const circle = (fontSize: number) => Number(/<svg[^>]*height="([0-9.]+)"/.exec(ornamentSideMarkup({ ...base, decoration: 'circleEnd', fontSize }))![1])
    expect(circle(40)).toBeCloseTo(circle(20) * 2, 1)
  })

  it('has the heading as tall as the ornaments need, and its own height when they are smaller', () => {
    expect(ornamentExtent('custom', 20, 1, true)).toBe(20)
    expect(ornamentExtent('custom', 20, 2, true)).toBe(40)
    expect(ornamentExtent('custom', 20, 1, false)).toBe(0)
    expect(ornamentExtent('dots', 20)).toBe(0)
    expect(ornamentExtent('scrollEnd', 20)).toBeGreaterThan(20)
    const config = { ...DEFAULT_FOOTNOTE_CONFIG, dividerMode: 'heading' as const, dividerHeadingLines: true, dividerHeadingDecoration: 'custom' as const, dividerOrnament: custom }
    const plain = footnoteDividerHeight({ ...config, dividerHeadingDecoration: 'none' }, [])
    expect(footnoteDividerHeight(config, [])).toBeGreaterThanOrEqual(plain)
    expect(footnoteDividerHeight({ ...config, dividerOrnamentScale: 400 }, [])).toBeGreaterThan(plain)
  })

  it('has a small preview for the choice list', () => {
    expect(ornamentPreviewMarkup('scrollFade')).toContain('currentColor')
  })

  it('is kept in the file, and an unknown style is replaced by the plain one', () => {
    const doc = { ...defaultDocSettings('orn'), footnotes: { ...DEFAULT_FOOTNOTE_CONFIG, dividerMode: 'heading' as const, dividerHeadingDecoration: 'custom' as const, dividerOrnament: custom } }
    const content = { doc, frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: [], parents: [], pageParents: [], sections: [] }
    const restored = parseDocument(serializeDocument(content), 'orn')
    expect(restored.doc.footnotes).toMatchObject({ dividerHeadingDecoration: 'custom', dividerOrnament: { name: 'swirl.png', width: 120, height: 40 } })
    expect(restored.doc.footnotes?.dividerOrnament?.dataUrl).toBe(PNG)

    const tampered = JSON.parse(serializeDocument(content))
    // wherever the file keeps the settings of the footnotes
    const holder = (function find(node: unknown): Record<string, unknown> | null {
      if (!node || typeof node !== 'object') return null
      const record = node as Record<string, unknown>
      if (record.footnotes && typeof record.footnotes === 'object' && 'dividerMode' in (record.footnotes as object)) return record
      for (const value of Object.values(record)) {
        const found = find(value)
        if (found) return found
      }
      return null
    })(tampered)!
    const footnotes = holder.footnotes as Record<string, unknown>
    footnotes.dividerHeadingDecoration = 'not-a-style'
    footnotes.dividerOrnament = { name: 'x', dataUrl: 'javascript:alert(1)', width: 1, height: 1 }
    const again = parseDocument(JSON.stringify(tampered), 'orn')
    expect(again.doc.footnotes?.dividerHeadingDecoration).toBe(DEFAULT_FOOTNOTE_CONFIG.dividerHeadingDecoration)
    expect(again.doc.footnotes?.dividerOrnament).toBeUndefined()
    void DEFAULT_TEXT_STYLE
  })
})
