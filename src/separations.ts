import { t } from './i18n'
import { rgbaToCmyk } from './cmykPage'

/** The four inks of a page, as a printing press lays them one after the other: a plate for each. */
export type Ink = 'cyan' | 'magenta' | 'yellow' | 'black'
export const INKS: { id: Ink; label: string }[] = [
  { id: 'cyan', get label() { return t('ציאן (C)') } },
  { id: 'magenta', get label() { return t('מג׳נטה (M)') } },
  { id: 'yellow', get label() { return t('צהוב (Y)') } },
  { id: 'black', get label() { return t('שחור (K)') } },
]

/** the colour each ink prints in, as it looks on white paper (each 0…1 of red, green and blue) */
export const INK_COLOR: Record<Ink, [number, number, number]> = {
  cyan: [0, 0.68, 0.94],
  magenta: [0.93, 0, 0.55],
  yellow: [1, 0.95, 0],
  black: [0.14, 0.12, 0.125],
}

/** which of the inks are shown */
export type InkSelection = Record<Ink, boolean>

/** the page in its four inks: 4 bytes a pixel (cyan, magenta, yellow, black; 255 = the ink at its full strength), in the order of the pixels of the picture */
export function separate(rgba: ArrayLike<number>): Uint8Array {
  return rgbaToCmyk(rgba)
}

/**
 * How the page looks with only some of the inks printed (what a Separation Preview shows): on white paper, every ink that is shown
 * darkens what is under it in its own colour, so with one ink on there is that ink's tints alone, and with the four on there is
 * the page as the press would print it. Fills `out` (RGBA, the same number of pixels).
 */
export function composeSeparations(cmyk: Uint8Array, show: InkSelection, out: Uint8ClampedArray) {
  const inks = (['cyan', 'magenta', 'yellow', 'black'] as Ink[])
    .map((ink, channel) => ({ channel, on: show[ink], color: INK_COLOR[ink] }))
    .filter((ink) => ink.on)
  for (let at = 0; at < cmyk.length; at += 4) {
    let red = 1
    let green = 1
    let blue = 1
    for (const ink of inks) {
      const amount = cmyk[at + ink.channel]! / 255
      if (amount === 0) continue
      // the ink lets through its own colour, and as much more of the paper as it does not cover
      red *= 1 - amount * (1 - ink.color[0])
      green *= 1 - amount * (1 - ink.color[1])
      blue *= 1 - amount * (1 - ink.color[2])
    }
    out[at] = Math.round(red * 255)
    out[at + 1] = Math.round(green * 255)
    out[at + 2] = Math.round(blue * 255)
    out[at + 3] = 255
  }
}

/** What the inks of a page add up to. */
export interface InkReport {
  /** the average strength of each ink over the page, in per cent */
  average: Record<Ink, number>
  /** the most ink at any one place (all four added up), in per cent: a press takes about 300 */
  maxTotal: number
  /** the share of the page (per cent) where the ink added up is over `limit` */
  overLimit: number
}

/** The total ink of every pixel (0…400, in per cent), and what that says about the page. */
export function inkReport(cmyk: Uint8Array, limit: number): InkReport {
  const pixels = cmyk.length / 4
  const sums = [0, 0, 0, 0]
  let maxTotal = 0
  let over = 0
  for (let at = 0; at < cmyk.length; at += 4) {
    const total = ((cmyk[at]! + cmyk[at + 1]! + cmyk[at + 2]! + cmyk[at + 3]!) / 255) * 100
    sums[0]! += cmyk[at]!
    sums[1]! += cmyk[at + 1]!
    sums[2]! += cmyk[at + 2]!
    sums[3]! += cmyk[at + 3]!
    if (total > maxTotal) maxTotal = total
    if (total > limit) over += 1
  }
  const share = (sum: number) => (pixels > 0 ? (sum / pixels / 255) * 100 : 0)
  return {
    average: { cyan: share(sums[0]!), magenta: share(sums[1]!), yellow: share(sums[2]!), black: share(sums[3]!) },
    maxTotal,
    overLimit: pixels > 0 ? (over / pixels) * 100 : 0,
  }
}

/**
 * The page as a pale grey picture, with the places that have more ink than `limit` painted red: the ones that would not dry on a press,
 * or that would set off on the sheet over them. Fills `out` (RGBA).
 */
export function composeInkWarning(cmyk: Uint8Array, limit: number, out: Uint8ClampedArray) {
  for (let at = 0; at < cmyk.length; at += 4) {
    const total = ((cmyk[at]! + cmyk[at + 1]! + cmyk[at + 2]! + cmyk[at + 3]!) / 255) * 100
    if (total > limit) {
      // the more over, the stronger the red
      const strength = Math.min(1, (total - limit) / 60 + 0.55)
      out[at] = Math.round(255 * strength + 120 * (1 - strength))
      out[at + 1] = Math.round(20 * strength + 120 * (1 - strength))
      out[at + 2] = Math.round(40 * strength + 120 * (1 - strength))
    } else {
      // the page, lightened: its own darkness (the black ink and what the others add to it) as a grey
      const darkness = Math.min(1, (cmyk[at]! * 0.3 + cmyk[at + 1]! * 0.3 + cmyk[at + 2]! * 0.1 + cmyk[at + 3]!) / 255)
      const grey = Math.round(245 - darkness * 120)
      out[at] = grey
      out[at + 1] = grey
      out[at + 2] = grey
    }
    out[at + 3] = 255
  }
}
