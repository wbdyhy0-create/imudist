import { t } from './i18n'
/**
 * The look of the lines on both sides of the footnote heading ("הערות שוליים" between two lines): how the line itself is drawn
 * (dotted, double, fading...) and the ornament at its ends (a circle, a leaf, a scroll...), or a picture the user imported.
 *
 * Every line is written as a piece of HTML (a row with the ends and the body), so that the screen and the PDF export - which draws
 * the page from a DOM copy - get exactly the same thing from the same description.
 */

/** an ornament picture the user imported (a data: URL of a PNG, JPG, GIF, WebP or SVG file) */
export interface DividerOrnamentImage {
  name: string
  dataUrl: string
  /** the picture's size in pixels */
  width: number
  height: number
}

export const MAX_ORNAMENT_BYTES = 400 * 1024
const SAFE_DATA_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/

/** `none`: no line at all: the picture the user imported stands next to the heading on its own */
type Body = 'none' | 'solid' | 'dotted' | 'dashed' | 'double' | 'thickThin' | 'triple' | 'taper' | 'fade' | 'wave'

/** a drawn end, in its own box (`w` by `h`): its left edge is where the line joins it, its right edge is the tip */
interface Glyph {
  w: number
  h: number
  /** how tall it is next to the heading, as a multiple of the heading's height (it is also kept inside a range) */
  size: number
  /** parts drawn as a filled shape */
  fill?: string[]
  /** parts drawn as a line of the same thickness as the ruler's */
  stroke?: string[]
  /** filled circles: [cx, cy, r] */
  dots?: [number, number, number][]
}

const GLYPHS: Record<string, Glyph> = {
  circle: { w: 10, h: 10, size: 0.5, dots: [[5, 5, 4.4]] },
  star: { w: 14, h: 14, size: 0.62, fill: ['M0 7 L5 5 L7 0 L9 5 L14 7 L9 9 L7 14 L5 9 Z'] },
  leaf: { w: 28, h: 12, size: 0.6, fill: ['M0 6 C7 -1 19 -1 28 6 C19 13 7 13 0 6 Z'] },
  arrow: { w: 12, h: 12, size: 0.55, fill: ['M0 1.500 L12 6 L0 10.500 L4 6 Z'] },
  trio: { w: 26, h: 8, size: 0.4, dots: [[4, 4, 3.6], [13, 4, 2.6], [21, 4, 1.6]] },
  // a curl that rises from the line
  scroll: {
    w: 34,
    h: 18,
    size: 1.35,
    stroke: ['M0 13 H10 C15 13 17 5 24 5 C31 5 31 14 25 14 C21 14 21 9 25 9'],
  },
}

interface OrnamentStyle {
  id: string
  label: string
  body: Body
  /** at the outer end of each line */
  outer?: string
  /** next to the heading text */
  inner?: string
}

/** the styles made of lines and ends (the older five are drawn by the stylesheet and are not here) */
export const ORNAMENT_STYLES: OrnamentStyle[] = [
  { id: 'dots', get label() { return t('קו מנוקד') }, body: 'dotted' },
  { id: 'dashes', get label() { return t('קו מקווקו') }, body: 'dashed' },
  { id: 'double', get label() { return t('קו כפול') }, body: 'double' },
  { id: 'thickThin', get label() { return t('קו עבה ודק') }, body: 'thickThin' },
  { id: 'triple', get label() { return t('שלושה קווים') }, body: 'triple' },
  { id: 'taper', get label() { return t('קו מתחדד כלפי חוץ') }, body: 'taper' },
  { id: 'fade', get label() { return t('קו דועך כלפי חוץ') }, body: 'fade' },
  { id: 'wave', get label() { return t('קו גלי') }, body: 'wave' },
  { id: 'circleEnd', get label() { return t('עיגול בקצה') }, body: 'solid', outer: 'circle' },
  { id: 'starEnd', get label() { return t('כוכב בקצה') }, body: 'solid', outer: 'star' },
  { id: 'leafEnd', get label() { return t('עלה בקצה') }, body: 'solid', outer: 'leaf' },
  { id: 'arrowEnd', get label() { return t('חץ בקצה') }, body: 'solid', outer: 'arrow' },
  { id: 'trioEnd', get label() { return t('שלוש נקודות בקצה') }, body: 'solid', outer: 'trio' },
  { id: 'scrollEnd', get label() { return t('סלסול בקצה') }, body: 'solid', outer: 'scroll' },
  { id: 'scrollFade', get label() { return t('סלסול וקו דועך') }, body: 'fade', outer: 'scroll' },
  { id: 'scrollBoth', get label() { return t('סלסול בשני הצדדים') }, body: 'thickThin', outer: 'scroll', inner: 'circle' },
]

const BY_ID = new Map(ORNAMENT_STYLES.map((style) => [style.id, style]))

/** a decoration that is drawn here (the five older ones are drawn by the stylesheet) */
export const isOrnamentDecoration = (id: string) => id === 'custom' || BY_ID.has(id)

const px = (value: number) => Math.round(value * 100) / 100

/** one end, as an inline svg: `mirror` puts the shape the other way round (for the left line, whose outer end is on its left) */
function endMarkup(glyph: Glyph, height: number, thickness: number, color: string, mirror: boolean): string {
  const scale = height / glyph.h
  const width = px(glyph.w * scale)
  const strokeWidth = px(Math.max(1.1, thickness) / scale)
  const parts = [
    ...(glyph.fill ?? []).map((d) => `<path d="${d}" fill="${color}"/>`),
    ...(glyph.stroke ?? []).map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`),
    ...(glyph.dots ?? []).map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`),
  ].join('')
  const inner = mirror ? `<g transform="matrix(-1 0 0 1 ${glyph.w} 0)">${parts}</g>` : parts
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${px(height)}" viewBox="0 0 ${glyph.w} ${glyph.h}" style="flex:0 1 auto;min-width:0;display:block;position:relative;left:auto;top:auto;overflow:visible">${inner}</svg>`
}

/** the picture the user imported, as an end of the same kind (null if it is not a picture that can be used) */
function customEndMarkup(image: DividerOrnamentImage, height: number, mirror: boolean): string | null {
  if (!SAFE_DATA_URL.test(image.dataUrl) || !(image.width > 0) || !(image.height > 0)) return null
  const width = px((image.width / image.height) * height)
  const picture = `<image href="${image.dataUrl}" x="0" y="0" width="${width}" height="${px(height)}" preserveAspectRatio="xMidYMid meet"/>`
  const inner = mirror ? `<g transform="matrix(-1 0 0 1 ${width} 0)">${picture}</g>` : picture
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${px(height)}" viewBox="0 0 ${width} ${px(height)}" style="flex:0 1 auto;min-width:0;display:block;position:relative;left:auto;top:auto">${inner}</svg>`
}

/** the line between the ends, which stretches to fill the room: `towardsRight` says where its outer end is */
function bodyMarkup(body: Body, thickness: number, color: string, towardsRight: boolean): string {
  const t = Math.max(0.5, thickness)
  const grow = 'flex:1 1 0;min-width:0;display:block'
  switch (body) {
    case 'dotted':
      return `<span style="${grow};border-top:${px(Math.max(1.5, t))}px dotted ${color}"></span>`
    case 'dashed':
      return `<span style="${grow};border-top:${px(Math.max(1, t))}px dashed ${color}"></span>`
    case 'double':
      return `<span style="${grow};border-top:${px(Math.max(3, t * 3))}px double ${color}"></span>`
    case 'solid':
      return `<span style="${grow};border-top:${px(t)}px solid ${color}"></span>`
    default:
      break
  }
  // the others are drawn as shapes in a box that is stretched to the room there is (only their length changes)
  const svg = (height: number, content: string, defs = '') =>
    `<span style="${grow};height:${px(height)}px"><svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 100 ${px(height)}" width="100" height="${px(height)}" style="display:block;position:relative;left:auto;top:auto;width:100%;height:${px(height)}px;overflow:visible">${defs}${content}</svg></span>`
  if (body === 'thickThin') {
    const thick = t * 1.7
    const thin = Math.max(0.5, t * 0.6)
    const gap = t * 1.1
    return svg(thick + gap + thin, `<rect x="0" y="0" width="100" height="${px(thick)}" fill="${color}"/><rect x="0" y="${px(thick + gap)}" width="100" height="${px(thin)}" fill="${color}"/>`)
  }
  if (body === 'triple') {
    const line = Math.max(0.5, t * 0.7)
    const gap = t * 0.9
    const rows = [0, 1, 2].map((i) => `<rect x="0" y="${px(i * (line + gap))}" width="100" height="${px(line)}" fill="${color}"/>`).join('')
    return svg(line * 3 + gap * 2, rows)
  }
  if (body === 'taper') {
    // thick next to the heading, a point at the outer end
    const full = Math.max(2, t * 2.6)
    const points = towardsRight ? `0,0 100,${px(full / 2)} 0,${px(full)}` : `100,0 0,${px(full / 2)} 100,${px(full)}`
    return svg(full, `<polygon points="${points}" fill="${color}"/>`)
  }
  if (body === 'fade') {
    const height = Math.max(1, t * 1.2)
    const from = towardsRight ? 0 : 100
    const to = towardsRight ? 100 : 0
    const id = `fade-${towardsRight ? 'r' : 'l'}-${Math.abs(hash(color))}`
    const defs = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${from}" y1="0" x2="${to}" y2="0"><stop offset="0" stop-color="${color}" stop-opacity="1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`
    return svg(height, `<rect x="0" y="0" width="100" height="${px(height)}" fill="url(#${id})"/>`, defs)
  }
  // wave: a line that goes up and down; its width is stretched, so the stroke is drawn with one that does not scale
  const height = Math.max(4, t * 5)
  const mid = height / 2
  const amp = height / 2 - t
  let d = `M0 ${px(mid)}`
  const waves = 8
  for (let i = 0; i < waves; i += 1) {
    const x0 = (i * 100) / waves
    const x1 = ((i + 1) * 100) / waves
    d += ` C${px(x0 + (x1 - x0) / 3)} ${px(mid - amp * (i % 2 ? -1 : 1) * 1.3)} ${px(x0 + ((x1 - x0) * 2) / 3)} ${px(mid - amp * (i % 2 ? -1 : 1) * 1.3)} ${px(x1)} ${px(mid)}`
  }
  return svg(height, `<path d="${d}" fill="none" stroke="${color}" stroke-width="${px(Math.max(0.8, t))}" vector-effect="non-scaling-stroke"/>`)
}

function hash(text: string): number {
  let value = 0
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0
  return value
}

/**
 * One side of the heading, as HTML: a row (which stretches to fill the room) of the end next to the heading, the line, and the end at
 * the outside. `height` is the height of the heading, which the ends are made to fit; `thickness` the ruler's thickness. `color` is
 * a CSS colour (`currentColor` works where the markup is put in the page itself).
 */
export function ornamentSideMarkup(args: {
  decoration: string
  side: 'right' | 'left'
  color: string
  thickness: number
  /** the height of the row (the heading's line) */
  height: number
  /** the font size of the heading's text: the ornaments are as big as it is, so they grow and shrink with the text */
  fontSize: number
  /** a multiple of the size they have by default (1 = the size of the font) */
  scale?: number
  /** how far (px, down is positive) the row is moved so that it is level with the middle of the letters of the heading */
  shift?: number
  custom?: DividerOrnamentImage
}): string {
  const { decoration, side, color, thickness, height, fontSize, scale = 1, shift = 0, custom } = args
  const towardsRight = side === 'right'
  const style = BY_ID.get(decoration)
  // a line of text is about 1.2 times the font size; the built-in ends are drawn in proportion to that, a picture is as tall as the font
  const room = Math.max(4, fontSize * 1.2 * Math.max(0.05, scale))
  let outer = ''
  let inner = ''
  let body: Body = 'solid'
  if (decoration === 'custom') {
    // the imported picture is the whole ornament: it stands next to the heading, with no line added to it (a picture that cannot be
    // used leaves the plain line)
    const picture = custom ? customEndMarkup(custom, Math.max(6, fontSize * Math.max(0.05, scale)), !towardsRight) : null
    if (picture) {
      outer = picture
      body = 'none'
    }
  } else if (style) {
    body = style.body
    // the ornament at the outer end faces outwards: on the right line the glyph is as drawn, on the left it is turned round
    if (style.outer) outer = endMarkup(GLYPHS[style.outer]!, Math.max(4, room * GLYPHS[style.outer]!.size), thickness, color, !towardsRight)
    // the end next to the heading faces the heading
    if (style.inner) inner = endMarkup(GLYPHS[style.inner]!, Math.max(4, room * GLYPHS[style.inner]!.size), thickness, color, towardsRight)
  }
  const alone = body === 'none'
  const line = alone ? '' : bodyMarkup(body, thickness, color, towardsRight)
  // the row is laid left to right whatever the page's direction is: for the right line that is [next to the heading] line [outer end]
  const order = (towardsRight ? [inner, line, outer] : [outer, line, inner]).filter(Boolean)
  // an end that is a stroke (a curl) begins on the line itself and touches it; the others stand a little way off
  const touching = !inner && !!style?.outer && !!GLYPHS[style.outer]?.stroke
  const gap = touching || (!outer && !inner) ? 0 : 3
  // a row with a line stretches to fill the room; a picture alone is only as wide as itself, and is the first to give way when there is no room (before the text of the heading does)
  const grow = alone ? 'flex:0 1000 auto' : 'flex:1 1 0'
  const level = Math.abs(shift) > 0.05 ? `;position:relative;top:${px(shift)}px` : ''
  return `<span class="footnote-divider-orn" style="display:flex;${grow};min-width:0;align-items:center;justify-content:center;direction:ltr;gap:${gap}px;height:${px(height)}px${level}">${order.join('')}</span>`
}

/**
 * How tall the heading has to be for its ornaments (points): the tallest end that the style has, at the size of the font, or the
 * imported picture. The layout reserves it, so that a big ornament does not run into the first note.
 */
export function ornamentExtent(decoration: string, fontSize: number, scale = 1, hasCustom = false): number {
  const factor = Math.max(0.05, scale)
  if (decoration === 'custom') return hasCustom ? Math.max(6, fontSize * factor) : 0
  const style = BY_ID.get(decoration)
  if (!style) return 0
  const sizes = [style.outer, style.inner].flatMap((id) => (id ? [GLYPHS[id]!.size] : []))
  return sizes.length > 0 ? Math.max(4, fontSize * 1.2 * factor * Math.max(...sizes)) : 0
}

/** a small picture of a style for the choice list: both sides of a short heading, in the colour of the text around it */
export function ornamentPreviewMarkup(decoration: string, custom?: DividerOrnamentImage): string {
  const side = (which: 'right' | 'left') => ornamentSideMarkup({ decoration, side: which, color: 'currentColor', thickness: 1.2, height: 14, fontSize: 11.5, custom })
  return `<span style="display:flex;align-items:center;gap:5px;width:100%;direction:ltr">${side('left')}<span style="flex:none;width:12px;height:5px;border-radius:2px;background:currentColor;opacity:.55"></span>${side('right')}</span>`
}

/** is this a picture that can be kept as an ornament (a data: URL of an image, not too large) */
export function usableOrnamentImage(value: unknown): value is DividerOrnamentImage {
  if (!value || typeof value !== 'object') return false
  const image = value as Partial<DividerOrnamentImage>
  return (
    typeof image.name === 'string' &&
    typeof image.dataUrl === 'string' &&
    image.dataUrl.length <= MAX_ORNAMENT_BYTES * 1.4 &&
    SAFE_DATA_URL.test(image.dataUrl) &&
    typeof image.width === 'number' &&
    typeof image.height === 'number' &&
    image.width > 0 &&
    image.height > 0
  )
}
