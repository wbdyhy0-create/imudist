import { loadFont, type FontSpec, type LoadedFont } from './fontFiles'

/**
 * Text of a frame as real text for a PDF.
 *
 * The browser lays the text out (the line breaks, the Hebrew order of the letters, the kerning, the spacing of a justified line),
 * as it does for the screen and for the page pictures. Here every letter is asked where the browser put it - its box - and is
 * written to the PDF at that very place, in its font. So nothing is laid out a second time, and nothing can come out in another
 * order than on the screen.
 *
 * Only plain text is done this way. A frame with anything else (niqqud, underline, shadow, outline, a raised letter, a footnote
 * mark, a list marker, a table of contents) is left to the page picture: `extractGlyphs` gives null for it.
 */

export interface VectorGlyph {
  /** one letter with the marks (niqqud) on it */
  text: string
  /** where the letter's box starts, and the baseline it stands on: points from the page's top-left */
  x: number
  baseline: number
  size: number
  font: LoadedFont
  color: [number, number, number]
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

/** Whether something about an element has no place in a text of plain letters (see the top of this file). */
function hasMoreThanPlainText(element: Element): boolean {
  const style = getComputedStyle(element)
  if (style.textDecorationLine !== 'none' || style.textShadow !== 'none') return true
  if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0) return true
  if (style.opacity !== '1' || style.transform !== 'none') return true
  if (style.textTransform !== 'none' || style.fontVariantCaps !== 'normal') return true
  if (style.position === 'relative' && style.top !== 'auto' && parseFloat(style.top) !== 0) return true
  for (const pseudo of ['::before', '::after']) {
    const content = getComputedStyle(element, pseudo).content
    if (content !== 'none' && content !== 'normal') return true
  }
  return false
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
 * The letters of the text inside `outer` (a frame already laid out in the page) as glyphs to write, or null when the frame holds
 * more than plain text, when a letter's font cannot be put in the PDF, or when the font has no glyph for a letter (the browser
 * would then have drawn it from another font).
 */
export async function extractGlyphs(outer: HTMLElement, origin: { left: number; top: number }, find: (spec: FontSpec) => Promise<LoadedFont | null> = loadFont): Promise<VectorGlyph[] | null> {
  const checked = new Map<Element, boolean>()
  const runs: TextRun[] = []
  const walker = document.createTreeWalker(outer, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (isBlankCluster(node.data)) continue
    const element = node.parentElement
    if (!element) return null
    for (let e: Element | null = element; e && e !== outer.parentElement; e = e.parentElement) {
      let plain = checked.get(e)
      if (plain === undefined) {
        plain = !hasMoreThanPlainText(e)
        checked.set(e, plain)
      }
      if (!plain) return null
      if (e === outer) break
    }
    const style = getComputedStyle(element)
    const color = parseCssColor(style.color)
    if (!color) return null
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
  if (runs.some((run) => /\p{M}/u.test(run.node.data))) return null

  const fonts = new Map<string, LoadedFont>()
  for (const run of runs) {
    const key = `${run.spec.family}|${run.spec.weight}|${run.spec.italic}`
    if (fonts.has(key)) continue
    const font = await find(run.spec)
    if (!font) return null
    fonts.set(key, font)
  }

  const frameBox = outer.getBoundingClientRect()
  const range = document.createRange()
  const glyphs: VectorGlyph[] = []
  for (const run of runs) {
    const font = fonts.get(`${run.spec.family}|${run.spec.weight}|${run.spec.italic}`)!
    const ascent = ascentOf(run.style)
    for (const cluster of clustersOf(run.node.data)) {
      if (isBlankCluster(cluster.text)) continue
      let shown = ''
      for (const char of cluster.text) {
        const codePoint = char.codePointAt(0)!
        if (codePoint >= 0xe000 && codePoint <= 0xf8ff) return null // the app's own markers (footnote, contents): not text to write
        if (font.has(codePoint)) shown += char
        else if (!/^\p{M}$/u.test(char)) return null // a letter the font has no shape for: the browser drew it from another font
        // (a mark the font has no shape for was not drawn by the browser either)
      }
      if (shown === '') continue
      range.setStart(run.node, cluster.at)
      range.setEnd(run.node, cluster.at + cluster.text.length)
      const box = range.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      // what the frame hides (the lines that did not fit) is not drawn
      const centerX = box.left + box.width / 2
      const centerY = box.top + box.height / 2
      if (centerX < frameBox.left - 0.5 || centerX > frameBox.right + 0.5 || centerY < frameBox.top - 0.5 || centerY > frameBox.bottom + 0.5) continue
      glyphs.push({ text: shown, x: box.left - origin.left, baseline: box.top - origin.top + ascent, size: run.size, font, color: run.color })
    }
  }
  return glyphs
}
