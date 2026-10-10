import type { Sides } from './document'
import { toPt } from './units'

/** What the export of a PDF for a printing shop adds around every page: the bleed, the slug (information area) and the crop marks. */
export interface PrintMarks {
  bleedOn: boolean
  /** points */
  bleedPt: number
  cropMarks: boolean
  /** a target at the middle of each side, to line the colour plates up */
  registrationMarks: boolean
  /** a strip of the inks and of greys, to check the colour by */
  colorBars: boolean
  slugOn: boolean
  /** points */
  slugPt: number
  /** the name of the file, the page and the date, written in the slug */
  pageInfo: boolean
}

const DEFAULT_BLEED_MM = 3
const DEFAULT_SLUG_MM = 10

/** The choices a document starts with: what its setup says about the bleed and the slug (the larger side), and the usual 3 mm and 10 mm otherwise. */
export function initialPrintMarks(doc?: { bleed: Sides; slug: Sides }): PrintMarks {
  const biggest = (sides?: Sides) => (sides ? Math.max(sides.top, sides.right, sides.bottom, sides.left) : 0)
  const bleed = biggest(doc?.bleed)
  const slug = biggest(doc?.slug)
  return {
    bleedOn: bleed > 0,
    bleedPt: bleed > 0 ? bleed : toPt(DEFAULT_BLEED_MM, 'mm'),
    cropMarks: false,
    registrationMarks: false,
    colorBars: false,
    slugOn: slug > 0,
    slugPt: slug > 0 ? slug : toPt(DEFAULT_SLUG_MM, 'mm'),
    // an empty slug is not seen: when the document has one, what the export writes in it is on
    pageInfo: slug > 0,
  }
}

/** The options of the export that these choices make. */
export function printMarksOptions(marks: PrintMarks) {
  return {
    bleed: marks.bleedOn,
    bleedPt: marks.bleedPt,
    cropMarks: marks.cropMarks,
    registrationMarks: marks.registrationMarks,
    colorBars: marks.colorBars,
    slug: marks.slugOn,
    slugPt: marks.slugPt,
    pageInfo: marks.slugOn && marks.pageInfo,
  }
}

/** room for the crop marks outside the bleed: a gap, the mark itself, and a little air */
export const CROP_MARKS_ROOM = 20

/**
 * How much room a printed sheet has outside the bleed: the room the crop marks need, and what the slug takes beyond the bleed (the slug is
 * measured from the edge of the page, so the bleed is a part of it).
 */
export function outerRoomOf(options: { bleed: boolean; bleedPt: number; cropMarks: boolean; registrationMarks?: boolean; colorBars?: boolean; slug?: boolean; slugPt?: number }) {
  const bleedPt = options.bleed ? options.bleedPt : 0
  const slugPt = options.slug ? Math.max(0, options.slugPt ?? 0) : 0
  const marks = options.cropMarks || options.registrationMarks || options.colorBars
  return Math.max(marks ? CROP_MARKS_ROOM : 0, Math.max(0, slugPt - bleedPt))
}
