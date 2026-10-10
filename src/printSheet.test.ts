import { describe, expect, it } from 'vitest'
import { CROP_MARKS_ROOM, initialPrintMarks, outerRoomOf, printMarksOptions } from './printSheet'

const sides = (value: number) => ({ top: value, right: value, bottom: value, left: value })

describe('the room a printed sheet has around its page', () => {
  it('has none when nothing is asked for', () => {
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: false })).toBe(0)
    expect(outerRoomOf({ bleed: true, bleedPt: 8.5, cropMarks: false })).toBe(0)
  })

  it('has room for the crop marks outside the bleed, whether or not there is a bleed', () => {
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: true })).toBe(CROP_MARKS_ROOM)
    expect(outerRoomOf({ bleed: true, bleedPt: 8.5, cropMarks: true })).toBe(CROP_MARKS_ROOM)
  })

  it('takes the part of the slug that lies beyond the bleed (the slug is measured from the edge of the page)', () => {
    // a 10 mm slug with a 3 mm bleed: the bleed is a part of it
    expect(outerRoomOf({ bleed: true, bleedPt: 8.5, cropMarks: false, slug: true, slugPt: 28.35 })).toBeCloseTo(19.85, 2)
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: false, slug: true, slugPt: 28.35 })).toBeCloseTo(28.35, 2)
    // a slug smaller than the bleed adds nothing; the marks still have their room
    expect(outerRoomOf({ bleed: true, bleedPt: 20, cropMarks: true, slug: true, slugPt: 10 })).toBe(CROP_MARKS_ROOM)
  })

  it('has room for the registration marks and the colour bar too, where there are no crop marks', () => {
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: false, registrationMarks: true })).toBe(CROP_MARKS_ROOM)
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: false, colorBars: true })).toBe(CROP_MARKS_ROOM)
  })

  it('does not count a slug that is switched off', () => {
    expect(outerRoomOf({ bleed: false, bleedPt: 0, cropMarks: false, slug: false, slugPt: 40 })).toBe(0)
  })
})

describe('what the export starts with', () => {
  it('takes the bleed and the slug of the document, and the usual sizes when it has none', () => {
    const plain = initialPrintMarks({ bleed: sides(0), slug: sides(0) })
    expect(plain.bleedOn).toBe(false)
    expect(plain.slugOn).toBe(false)
    expect(plain.bleedPt).toBeCloseTo(8.5, 1)
    expect(plain.slugPt).toBeCloseTo(28.35, 1)
    const set = initialPrintMarks({ bleed: { top: 5, right: 9, bottom: 5, left: 5 }, slug: sides(30) })
    expect(set.bleedOn).toBe(true)
    expect(set.bleedPt).toBe(9)
    expect(set.slugOn).toBe(true)
    expect(set.slugPt).toBe(30)
  })

  it('makes the crop marks their own choice, with or without a bleed', () => {
    const marks = { ...initialPrintMarks(), cropMarks: true, bleedOn: false }
    expect(printMarksOptions(marks)).toMatchObject({ cropMarks: true, bleed: false })
  })

  it('writes the information of the page only when there is a slug to write it in', () => {
    expect(printMarksOptions({ ...initialPrintMarks(), slugOn: false, pageInfo: true }).pageInfo).toBe(false)
    expect(printMarksOptions({ ...initialPrintMarks(), slugOn: true, pageInfo: true }).pageInfo).toBe(true)
  })
})
