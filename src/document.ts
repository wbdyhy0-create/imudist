import { PAGE_PRESETS, toPt, type Unit } from './units'

export type Binding = 'ltr' | 'rtl'

export interface Sides {
  top: number
  bottom: number
  /** "Inside" when facing pages are on */
  left: number
  /** "Outside" when facing pages are on */
  right: number
}

/** Every length is in points. */
export interface DocSettings {
  name: string
  width: number
  height: number
  unit: Unit
  binding: Binding
  pages: number
  facingPages: boolean
  startPage: number
  primaryTextFrame: boolean
  columns: number
  gutter: number
  margins: Sides
  bleed: Sides
  slug: Sides
}

export const MIN_PAGE_PT = 1
export const MAX_PAGE_PT = 16384
export const MAX_SIDE_PT = 2000
export const MAX_PAGES = 9999
export const MAX_COLUMNS = 100

const sides = (v: number): Sides => ({ top: v, bottom: v, left: v, right: v })

export function defaultDocSettings(name: string): DocSettings {
  return {
    name,
    width: PAGE_PRESETS[0].width,
    height: PAGE_PRESETS[0].height,
    unit: 'mm',
    binding: 'rtl',
    pages: 1,
    facingPages: false,
    startPage: 1,
    primaryTextFrame: false,
    columns: 1,
    gutter: toPt(5, 'mm'),
    margins: sides(toPt(15, 'mm')),
    bleed: sides(0),
    slug: sides(0),
  }
}

export function validateDoc(d: DocSettings): string | null {
  if (d.margins.left + d.margins.right >= d.width || d.margins.top + d.margins.bottom >= d.height) {
    return 'The margins are larger than the page.'
  }
  if (d.gutter * (d.columns - 1) >= d.width - d.margins.left - d.margins.right) {
    return 'The columns do not fit between the margins.'
  }
  return null
}
