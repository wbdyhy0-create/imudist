import { loadFont, type FontSpec, type LoadedFont } from './fontFiles'
import { t } from './i18n'

/**
 * Text of a frame as real text for a PDF.
 *
 * The browser lays the text out (the line breaks, the Hebrew order of the letters, the kerning, the spacing of a justified line),
 * as it does for the screen and for the page pictures. Here every letter is asked where the browser put it - its box - and is
 * written to the PDF at that very place, in its font. So nothing is laid out a second time, and nothing can come out in another
 * order than on the screen.
 *
 * Only plain text is done this way. A frame with anything else (niqqud, underline, shadow, outline, a footnote mark, a list
 * marker, a table of contents) is left to the page picture: `extractGlyphs` says why not.
 */

export interface VectorGlyph {
  /** one letter */
  text: string
  /** where the letter's box starts, and the baseline it stands on: points from the page's top-left (the turn of its frame done) */
  x: number
  baseline: number
  size: number
  /** degrees, clockwise: the turn of the frame the letter is in */
  angle: number
  /** the width of the letter's box (it is wider than the letter where there is tracking), in points */
  width?: number
  font: LoadedFont
  color: [number, number, number]
}

/** Why a frame of text is left to the page picture instead of being written as text. */
export type PictureReason =
  | 'marks'
  | 'decoration'
  | 'shadow'
  | 'outline'
  | 'faded'
  | 'transformed'
  | 'case'
  | 'pseudo'
  | 'marker'
  | 'font'
  | 'glyph'
  | 'color'
  | 'feather'
  | 'rasterized'
  | 'footnotes'
  | 'uneven-scale'

export const PICTURE_REASONS: Record<PictureReason, string> = {
  get marks() { return t('ניקוד') },
  get decoration() { return t('קו תחתון או קו חוצה') },
  get shadow() { return t('צל על הטקסט') },
  get outline() { return t('מסגרת לאות') },
  get faded() { return t('טקסט או תיבה שקופים') },
  get transformed() { return t('טקסט מעוות') },
  get case() { return t('אותיות גדולות או קטנות מוכפות') },
  get pseudo() { return t('הערת שוליים, רשימה או תוכן עניינים') },
  get marker() { return t('סימן פנימי של הערת שוליים או תוכן עניינים') },
  get font() { return t('גופן שאינו מותקן במחשב או שאי אפשר להטמיע') },
  get glyph() { return t('אות שחסרה בגופן') },
  get color() { return t('צבע טקסט שקוף') },
  get feather() { return t('טשטוש קצוות') },
  get rasterized() { return t('תיבה שהומרה לתמונה') },
  get footnotes() { return t('תיבה עם הערות שוליים') },
  get 'uneven-scale'() { return t('הגדלה או הקטנה של הטקסט שאינה שווה לאורך וגובה') },
}

/** What an export made of the frames of text (how many were written as text, how many stayed a picture, and why), of the shapes and of the pictures. */
export interface VectorReport {
  text: number
  picture: number
  reasons: Partial<Record<PictureReason, number>>
  /** shapes written as shapes, and the ones that stayed a part of the page picture */
  shapes: number
  shapesPicture: number
  shapeReasons: Partial<Record<string, number>>
  /** placed pictures put in the PDF as pictures of their own, and the ones that stayed a part of the page picture */
  images: number
  imagesPicture: number
}

export const emptyReport = (): VectorReport => ({ text: 0, picture: 0, reasons: {}, shapes: 0, shapesPicture: 0, shapeReasons: {}, images: 0, imagesPicture: 0 })

/** Counts one frame that stayed a picture. */
export function countPicture(report: VectorReport, reason: PictureReason) {
  report.picture++
  report.reasons[reason] = (report.reasons[reason] ?? 0) + 1
}

/** The letters of a text with the marks that belong to each: a letter and the combining marks after it. */
export function clustersOf(text: string): { text: string; at: number }[] {
  const clusters: { text: string; at: number }[] = []
  let at = 0
  for (const char of text) {
    if (clusters.length > 0 && /^\p{M}$/u.test(char)) clusters[clusters.length - 1].text += char
    else clusters.push({ text: char, at })
    at += char.length
  }
  return clusters
}

/** Space, line break and the invisible controls: nothing to draw. */
export const isBlankCluster = (text: string) => /^[\s ​-‏‪-‮⁠-⁤﻿]*$/u.test(text)

/** The red, green and blue (0–255) of a CSS colour that is not see-through, null for any other. */
export function parseCssColor(value: string): [number, number, number] | null {
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d*\.?\d+)(%?)\s*)?\)$/.exec(value.trim())
  if (!match) return null
  if (match[4] !== undefined) {
    const alpha = Number(match[4]) / (match[5] ? 100 : 1)
    if (alpha < 1) return null
  }
  return [Math.round(Number(match[1])), Math.round(Number(match[2])), Math.round(Number(match[3]))]
}

/** The first font of a CSS font-family list. */
export function firstFamily(list: string): string {
  const first = list.split(',')[0]?.trim() ?? ''
  return first.replace(/^["']|["']$/g, '')
}

/** Where a frame of text is on its page: its box in points from the page's top-left, how it is turned, how much its text is scaled. */
export interface FrameGeometry {
  x: number
  y: number
  w: number
  h: number
  /** degrees, clockwise, about the frame's centre */
  rotation: number
  /** the text scale, the same along and across (a text scaled unevenly is not written as text) */
  scale: number
}

/** A point of the text's own layout box (its top-left is 0, 0) as a point of the page: scaled, then turned about the frame's centre. */
export function placeOnPage(frame: FrameGeometry, localX: number, localY: number): { x: number; y: number } {
  const dx = localX * frame.scale - frame.w / 2
  const dy = localY * frame.scale - frame.h / 2
  const turn = (frame.rotation * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return { x: frame.x + frame.w / 2 + dx * cos - dy * sin, y: frame.y + frame.h / 2 + dx * sin + dy * cos }
}

/** The reason an element has no place in a text of plain letters, or null when it has none (see the top of this file). */
function reasonForElement(element: Element): PictureReason | null {
  const style = getComputedStyle(element)
  if (style.textDecorationLine !== 'none') return 'decoration'
  if (style.textShadow !== 'none') return 'shadow'
  if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0) return 'outline'
  if (style.opacity !== '1') return 'faded'
  if (style.transform !== 'none') return 'transformed'
  if (style.textTransform !== 'none' || style.fontVariantCaps !== 'normal') return 'case'
  for (const pseudo of ['::before', '::after']) {
    const content = getComputedStyle(element, pseudo).content
    if (content !== 'none' && content !== 'normal') return 'pseudo'
  }
  return null
}

let metricsContext: CanvasRenderingContext2D | null = null

/** How far the letters of a font reach above the baseline, as the browser sets it (the number a line box is built on). */
function ascentOf(style: CSSStyleDeclaration): number {
  metricsContext ??= document.createElement('canvas').getContext('2d')
  const context = metricsContext
  if (!context) return parseFloat(style.fontSize) * 0.93
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return context.measureText('Hxg').fontBoundingBoxAscent
}

interface TextRun {
  node: Text
  style: CSSStyleDeclaration
  spec: FontSpec
  color: [number, number, number]
  size: number
}

/**
 * The letters of the text inside `outer` (a frame already laid out in the page) as glyphs to write, or the reason it cannot be
 * done: the frame holds more than plain text, a letter's font cannot be put in the PDF, or the font has no glyph for a letter
 * (the browser would then have drawn it from another font).
 *
 * The turn of the frame and the scale of its text are taken off the elements in `untransformed` while the letters are looked up (so
 * every box is where the text itself has it), and are put on again after. `layoutBox` is the box the text is laid out in (the
 * frame, or what holds the text when it is scaled): what falls outside it is not drawn, the browser hides it too.
 */
export async function extractGlyphs(
  outer: HTMLElement,
  frame: FrameGeometry,
  untransformed: HTMLElement[],
  layoutBox: HTMLElement,
  find: (spec: FontSpec) => Promise<LoadedFont | null> = loadFont,
): Promise<{ glyphs: VectorGlyph[] } | { reason: PictureReason }> {
  const saved = untransformed.map((element) => element.style.transform)
  for (const element of untransformed) element.style.transform = ''
  try {
    const checked = new Map<Element, PictureReason | null>()
    const runs: TextRun[] = []
    const walker = document.createTreeWalker(outer, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (isBlankCluster(node.data)) continue
      const element = node.parentElement
      if (!element) return { reason: 'transformed' }
      for (let e: Element | null = element; e && e !== outer.parentElement; e = e.parentElement) {
        let reason = checked.get(e)
        if (reason === undefined) {
          reason = reasonForElement(e)
          checked.set(e, reason)
        }
        if (reason) return { reason }
        if (e === outer) break
      }
      const style = getComputedStyle(element)
      const color = parseCssColor(style.color)
      if (!color) return { reason: 'color' }
      runs.push({
        node,
        style,
        spec: { family: firstFamily(style.fontFamily), weight: Number(style.fontWeight) || 400, italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique' },
        color,
        size: parseFloat(style.fontSize),
      })
    }

    // Marks on a letter (niqqud, cantillation) are put in place by the font's own positioning rules (GPOS), which the browser applies
    // and a PDF writer that only maps characters to glyphs does not: such a text would come out with its marks in the wrong places
    if (runs.some((run) => /\p{M}/u.test(run.node.data))) return { reason: 'marks' }

    const fonts = new Map<string, LoadedFont>()
    for (const run of runs) {
      const key = `${run.spec.family}|${run.spec.weight}|${run.spec.italic}`
      if (fonts.has(key)) continue
      const font = await find(run.spec)
      if (!font) return { reason: 'font' }
      fonts.set(key, font)
    }

    const origin = outer.getBoundingClientRect()
    const box = layoutBox.getBoundingClientRect()
    const range = document.createRange()
    const glyphs: VectorGlyph[] = []
    for (const run of runs) {
      const font = fonts.get(`${run.spec.family}|${run.spec.weight}|${run.spec.italic}`)!
      const ascent = ascentOf(run.style)
      for (const cluster of clustersOf(run.node.data)) {
        if (isBlankCluster(cluster.text)) continue
        for (const char of cluster.text) {
          const codePoint = char.codePointAt(0)!
          if (codePoint >= 0xe000 && codePoint <= 0xf8ff) return { reason: 'marker' } // the app's own markers (footnote, contents): not text to write
          if (!font.has(codePoint)) return { reason: 'glyph' } // a letter the font has no shape for: the browser drew it from another font
        }
        range.setStart(run.node, cluster.at)
        range.setEnd(run.node, cluster.at + cluster.text.length)
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        // what the frame hides (the lines that did not fit) is not drawn
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        if (centerX < box.left - 0.5 || centerX > box.right + 0.5 || centerY < box.top - 0.5 || centerY > box.bottom + 0.5) continue
        const at = placeOnPage(frame, rect.left - origin.left, rect.top - origin.top + ascent)
        glyphs.push({ text: cluster.text, x: at.x, baseline: at.y, size: run.size * frame.scale, angle: frame.rotation, width: rect.width * frame.scale, font, color: run.color })
      }
    }
    return { glyphs }
  } finally {
    untransformed.forEach((element, index) => {
      element.style.transform = saved[index]
    })
  }
}
