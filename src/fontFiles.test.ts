import { describe, expect, it } from 'vitest'
import { glyphLookup, pickFace, sfntKind } from './fontFiles'

/** a font file that is nothing but a character table: the glyphs for A–Z and for the Hebrew letters (format 4), or for a high range (format 12) */
function fontWithCmap(format: 4 | 12): Uint8Array {
  const sub = new Uint8Array(format === 4 ? 14 + 3 * 8 + 2 : 16 + 12)
  const v = new DataView(sub.buffer)
  if (format === 4) {
    const segments = [
      { start: 0x41, end: 0x5a, delta: 1 - 0x41 },
      { start: 0x5d0, end: 0x5ea, delta: 100 - 0x5d0 },
      { start: 0xffff, end: 0xffff, delta: 1 },
    ]
    v.setUint16(0, 4)
    v.setUint16(2, sub.length)
    v.setUint16(6, segments.length * 2)
    segments.forEach((segment, i) => {
      v.setUint16(14 + i * 2, segment.end)
      v.setUint16(14 + segments.length * 2 + 2 + i * 2, segment.start)
      v.setInt16(14 + segments.length * 4 + 2 + i * 2, segment.delta)
      v.setUint16(14 + segments.length * 6 + 2 + i * 2, 0)
    })
  } else {
    v.setUint16(0, 12)
    v.setUint32(12, 1)
    v.setUint32(16, 0x1f600)
    v.setUint32(20, 0x1f64f)
    v.setUint32(24, 5)
  }
  const bytes = new Uint8Array(12 + 16 + 4 + 8 + sub.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, 1)
  bytes.set([0x63, 0x6d, 0x61, 0x70], 12) // 'cmap'
  view.setUint32(20, 28)
  view.setUint32(24, 4 + 8 + sub.length)
  view.setUint16(30, 1) // one subtable
  view.setUint16(32, format === 4 ? 3 : 3)
  view.setUint16(34, format === 4 ? 1 : 10)
  view.setUint32(36, 12)
  bytes.set(sub, 40)
  return bytes
}

describe('glyphLookup', () => {
  it('says which characters a font has a glyph for (format 4)', () => {
    const has = glyphLookup(fontWithCmap(4))!
    expect(has('A'.codePointAt(0)!)).toBe(true)
    expect(has('Z'.codePointAt(0)!)).toBe(true)
    expect(has('a'.codePointAt(0)!)).toBe(false)
    expect(has('א'.codePointAt(0)!)).toBe(true)
    expect(has('ת'.codePointAt(0)!)).toBe(true)
    expect(has(0x5b0)).toBe(false) // a niqqud mark this font has no shape for
    expect(has(0x1f600)).toBe(false)
  })

  it('reads the full Unicode table too (format 12)', () => {
    const has = glyphLookup(fontWithCmap(12))!
    expect(has(0x1f600)).toBe(true)
    expect(has(0x1f64f)).toBe(true)
    expect(has(0x1f650)).toBe(false)
    expect(has(0x41)).toBe(false)
  })

  it('gives nothing for a file that is not a font', () => {
    expect(glyphLookup(new Uint8Array(40))).toBeNull()
    expect(glyphLookup(new Uint8Array(3))).toBeNull()
  })
})

describe('sfntKind', () => {
  it('tells the kinds of font file apart', () => {
    expect(sfntKind(fontWithCmap(4))).toBe('truetype')
    expect(sfntKind(Uint8Array.from([...'OTTO'].map((c) => c.charCodeAt(0)).concat(new Array(12).fill(0))))).toBe('cff')
    expect(sfntKind(Uint8Array.from([...'ttcf'].map((c) => c.charCodeAt(0)).concat(new Array(12).fill(0))))).toBe('collection')
    expect(sfntKind(new Uint8Array(20))).toBe('unknown')
  })
})

describe('pickFace', () => {
  const faces = [
    { family: 'David', style: 'Regular' },
    { family: 'David', style: 'Bold' },
    { family: 'Arial', style: 'Regular' },
    { family: 'Arial', style: 'Italic' },
    { family: 'Arial', style: 'Bold Italic' },
  ]

  it('finds the face of the family with the wanted weight and slant', () => {
    expect(pickFace(faces, { family: 'David', weight: 700, italic: false })).toEqual({ family: 'David', style: 'Bold' })
    expect(pickFace(faces, { family: 'arial', weight: 400, italic: true })).toEqual({ family: 'Arial', style: 'Italic' })
    expect(pickFace(faces, { family: 'Arial', weight: 700, italic: true })).toEqual({ family: 'Arial', style: 'Bold Italic' })
  })

  it('takes a near weight, not a far one', () => {
    expect(pickFace(faces, { family: 'David', weight: 500, italic: false })).toEqual({ family: 'David', style: 'Regular' })
    expect(pickFace([{ family: 'Narkisim', style: 'Regular' }], { family: 'Narkisim', weight: 700, italic: false })).toBeUndefined()
  })

  it('gives nothing for a slant the family does not have (the browser would have slanted a face)', () => {
    expect(pickFace(faces, { family: 'David', weight: 400, italic: true })).toBeUndefined()
    expect(pickFace(faces, { family: 'Frank', weight: 400, italic: false })).toBeUndefined()
  })
})
