import { XMLParser, XMLValidator } from 'fast-xml-parser'
import {
  DEFAULT_PARAGRAPH_STYLES,
  DEFAULT_TEXT_STYLE,
  MAX_PAGES,
  PAGE_NUMBER_MARKER,
  defaultDocSettings,
  type Asset,
  type Assets,
  type CharacterStyleRecord,
  type CharacterStyleSettings,
  type CharStyle,
  type ColorSample,
  type DocSettings,
  type FootnoteItem,
  type ImageFrame,
  type LayerInfo,
  type ParagraphStyleRecord,
  type ParentPage,
  type PathGeom,
  type PathVertex,
  type Run,
  type ShapeFrame,
  type Sides,
  type TextFrame,
  type TextStyle,
} from './document'
import { serializeDocument } from './fileFormat'
import { pageRects, type DocContent } from './pages'
import { boxFromEndpoints } from './shapes'
import { unzipEntries } from './zip'

/**
 * Opening an IDML file (the XML package a page-layout program saves): its pages, text frames and their threads, shapes, pictures that
 * are in the package, colours, styles, layers and parent pages become an ordinary document. Only what the file really says is used:
 * the geometry of an object is its path (`PathPointType`, `x y`) taken through its own transform and the transforms of the groups it
 * is in, the text of a story is what its `Content` elements say, and a `Br` ends a paragraph.
 */

type Pt = [number, number]
type Matrix = [number, number, number, number, number, number]
interface Box { x: number; y: number; w: number; h: number }

/** One XML element: its tag (without a namespace prefix), attributes, children and the text that stands directly in it. */
interface El {
  name: string
  attrs: Record<string, string>
  kids: El[]
  text: string
}

// ── reading the XML ───────────────────────────────────────────────────────────────────────────────────────────────────────────

// entities are decoded here, in one pass, and never by the parser: so no entity a file declares is ever expanded
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
})

const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY, (_, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body] ?? ''
    const code = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

function fillElement(into: El, list: unknown): void {
  if (!Array.isArray(list)) return
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if ('#text' in record) {
      into.text += decodeEntities(String(record['#text']))
      continue
    }
    const key = Object.keys(record).find((name) => name !== ':@')
    if (!key || key.startsWith('?') || key.startsWith('!')) continue
    const attrs: Record<string, string> = {}
    for (const [name, value] of Object.entries((record[':@'] ?? {}) as Record<string, unknown>)) attrs[name.replace(/^@_/, '')] = decodeEntities(String(value))
    const element: El = { name: key.includes(':') ? key.slice(key.indexOf(':') + 1) : key, attrs, kids: [], text: '' }
    fillElement(element, record[key])
    into.kids.push(element)
  }
}

/** The root element of an XML file's bytes. Files that declare entities or a document type are refused. */
function readXml(bytes: Uint8Array, path: string): El {
  let text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
  const firstElement = text.search(/<[A-Za-z_]/)
  if (/<!DOCTYPE|<!ENTITY/i.test(firstElement < 0 ? text : text.slice(0, firstElement))) throw new Error(`הקובץ ${path} כולל הגדרת DOCTYPE או ENTITY, שאינה נתמכת.`)
  // the page number (and the other automatic marks) of a story is a processing instruction: <?ACE 18?>; the parser keeps nothing of one
  if (path.toLowerCase().startsWith('stories/')) text = text.replace(/<\?ACE\s+([0-9A-Fa-f]+)\s*\?>/g, '<ACE code="$1"/>')
  if (XMLValidator.validate(text) !== true) throw new Error(`XML פגום בקובץ ${path}.`)
  const holder: El = { name: '', attrs: {}, kids: [], text: '' }
  fillElement(holder, parser.parse(text))
  const root = holder.kids[0]
  if (!root) throw new Error(`לא ניתן לקרוא את קובץ ה-XML ${path}.`)
  return root
}

const kid = (el: El | undefined, name: string): El | undefined => el?.kids.find((child) => child.name === name)

function descendants(el: El, name: string, found: El[] = []): El[] {
  for (const child of el.kids) {
    if (child.name === name) found.push(child)
    descendants(child, name, found)
  }
  return found
}

// ── small readers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const decodeRef = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
const lastRef = (value: string | undefined): string => decodeRef(value ?? '').split('/').filter(Boolean).at(-1) ?? ''
const safeId = (kind: string, value: string) => `idml-${kind}-${value.replace(/[^A-Za-z0-9_-]/g, '_').slice(-48) || 'item'}`

function number(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  if (/mm$/i.test(value)) return (parsed * 72) / 25.4
  if (/cm$/i.test(value)) return (parsed * 72) / 2.54
  if (/in(?:ch(?:es)?)?$/i.test(value)) return parsed * 72
  return parsed
}

const numberList = (value: string | undefined): number[] => value?.trim().split(/[\s,]+/).map((part) => Number.parseFloat(part)).filter(Number.isFinite) ?? []
const isTrue = (value: string | undefined) => value?.trim().toLowerCase() === 'true'
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** the attributes of an element, and what its Properties say (`<Leading type="unit">9</Leading>`) */
function propertiesOf(el: El): Map<string, string> {
  const values = new Map<string, string>(Object.entries(el.attrs))
  for (const child of kid(el, 'Properties')?.kids ?? []) {
    const value = child.text.trim()
    if (value && child.kids.length === 0) values.set(child.name, value)
  }
  return values
}

// ── transforms and geometry ───────────────────────────────────────────────────────────────────────────────────────────────────

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** the matrix that does `inner` first and then `outer` */
const compose = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
]

const apply = (m: Matrix, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

function itemMatrix(el: El): Matrix {
  const values = numberList(el.attrs.ItemTransform)
  return values.length >= 6 ? [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!] : IDENTITY
}

interface PathPoint {
  anchor: Pt
  left: Pt
  right: Pt
}
interface LocalPath {
  points: PathPoint[]
  open: boolean
}

const pair = (value: string | undefined): Pt | null => {
  const found = numberList(value)
  return found.length >= 2 ? [found[0]!, found[1]!] : null
}

/** the paths of an object, in its own coordinates: each point is `x y` (the handles too) */
function localPaths(el: El): LocalPath[] {
  const geometry = kid(kid(el, 'Properties'), 'PathGeometry')
  const paths: LocalPath[] = []
  for (const type of geometry?.kids ?? []) {
    if (type.name !== 'GeometryPathType') continue
    const points: PathPoint[] = []
    for (const point of kid(type, 'PathPointArray')?.kids ?? []) {
      if (point.name !== 'PathPointType') continue
      const anchor = pair(point.attrs.Anchor)
      if (!anchor) continue
      points.push({ anchor, left: pair(point.attrs.LeftDirection) ?? anchor, right: pair(point.attrs.RightDirection) ?? anchor })
    }
    if (points.length > 0) paths.push({ points, open: isTrue(type.attrs.PathOpen) })
  }
  return paths
}

interface Placement {
  /** the box in the spread, as the object would be if it were not turned */
  box: Box
  /** clockwise degrees about the middle of `box` */
  rotation: number
  /** the box the paths fill, in the object's own coordinates */
  local: Box
}

/** Where an object is in its spread: the box of its paths, scaled and turned by the transform. Null for an object with no path. */
function placementOf(paths: LocalPath[], matrix: Matrix): Placement | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const path of paths) {
    for (const { anchor } of path.points) {
      x0 = Math.min(x0, anchor[0])
      x1 = Math.max(x1, anchor[0])
      y0 = Math.min(y0, anchor[1])
      y1 = Math.max(y1, anchor[1])
    }
  }
  if (!Number.isFinite(x0)) return null
  const local = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  const scaleX = Math.hypot(matrix[0], matrix[1])
  const scaleY = Math.hypot(matrix[2], matrix[3])
  const [cx, cy] = apply(matrix, x0 + local.w / 2, y0 + local.h / 2)
  const w = Math.max(0.5, local.w * scaleX)
  const h = Math.max(0.5, local.h * scaleY)
  let rotation = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI
  if (rotation > 180) rotation -= 360
  if (Math.abs(rotation) < 0.01) rotation = 0
  return { box: { x: cx - w / 2, y: cy - h / 2, w, h }, rotation, local }
}

/** the paths as the outline of a shape: points 0…1 of the local box, handles relative to their point */
function geomOf(paths: LocalPath[], local: Box): PathGeom {
  const w = Math.max(local.w, 1e-6)
  const h = Math.max(local.h, 1e-6)
  const rings = paths.map((path) =>
    path.points.map((point): PathVertex => {
      const p: [number, number] = [(point.anchor[0] - local.x) / w, (point.anchor[1] - local.y) / h]
      const hi: [number, number] = [(point.left[0] - point.anchor[0]) / w, (point.left[1] - point.anchor[1]) / h]
      const ho: [number, number] = [(point.right[0] - point.anchor[0]) / w, (point.right[1] - point.anchor[1]) / h]
      const hasHi = Math.hypot(hi[0], hi[1]) > 1e-6
      const hasHo = Math.hypot(ho[0], ho[1]) > 1e-6
      if (!hasHi && !hasHo) return p
      return { p, ...(hasHi ? { hi } : {}), ...(hasHo ? { ho } : {}) }
    }),
  )
  return [rings]
}

// ── colours ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type ColorMap = Map<string, string>

const hex2 = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')

function colorOf(space: string | undefined, values: string | undefined): string | undefined {
  const channels = numberList(values)
  const kind = space?.toUpperCase()
  if (kind === 'CMYK' && channels.length >= 4) {
    const [c, m, y, k] = channels.map((v) => clamp(v / 100, 0, 1)) as [number, number, number, number]
    return `#${hex2(255 * (1 - c) * (1 - k))}${hex2(255 * (1 - m) * (1 - k))}${hex2(255 * (1 - y) * (1 - k))}`
  }
  if (kind === 'RGB' && channels.length >= 3) return `#${hex2(channels[0]!)}${hex2(channels[1]!)}${hex2(channels[2]!)}`
  if (kind === 'LAB' && channels.length >= 3) {
    const [l, a, b] = channels as [number, number, number]
    const fy = (l + 16) / 116
    const fx = fy + a / 500
    const fz = fy - b / 200
    const f = (v: number) => (v ** 3 > 0.008856 ? v ** 3 : (v - 16 / 116) / 7.787)
    const x = f(fx) * 0.95047
    const y = f(fy)
    const z = f(fz) * 1.08883
    const linear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
    const rgb = [linear(x * 3.2406 + y * -1.5372 + z * -0.4986), linear(x * -0.9689 + y * 1.8758 + z * 0.0415), linear(x * 0.0557 + y * -0.204 + z * 1.057)]
    return `#${rgb.map((v) => hex2(clamp(v, 0, 1) * 255)).join('')}`
  }
  if (channels.length === 1) {
    const gray = hex2(clamp(channels[0]!, 0, 100) * 2.55)
    return `#${gray}${gray}${gray}`
  }
  return undefined
}

/** `#rrggbb` mixed with white: a tint of `percent` % */
function tinted(color: string, percent: number): string {
  const part = (at: number) => hex2(255 - (255 - Number.parseInt(color.slice(at, at + 2), 16)) * clamp(percent, 0, 100) / 100)
  return `#${part(1)}${part(3)}${part(5)}`
}

function makeColors(files: Map<string, El>): { colors: ColorMap; samples: ColorSample[] } {
  const colors: ColorMap = new Map()
  const samples: ColorSample[] = []
  const pending: El[] = []
  for (const root of files.values()) {
    for (const color of descendants(root, 'Color')) {
      const value = colorOf(color.attrs.Space, color.attrs.ColorValue)
      const self = color.attrs.Self ? decodeRef(color.attrs.Self) : ''
      if (!value || !self) continue
      colors.set(self, value)
      const name = color.attrs.Name && !color.attrs.Name.startsWith('$ID/') ? color.attrs.Name : lastRef(self)
      if (name && !/^(None|Paper|Registration)$/i.test(name) && !samples.some((sample) => sample.color === value && sample.label === name)) samples.push({ id: safeId('swatch', self), color: value, label: name })
    }
    pending.push(...descendants(root, 'Tint'), ...descendants(root, 'Gradient'))
  }
  for (const swatch of pending) {
    const self = swatch.attrs.Self ? decodeRef(swatch.attrs.Self) : ''
    if (!self) continue
    if (swatch.name === 'Tint') {
      const base = colors.get(decodeRef(swatch.attrs.BaseColor ?? ''))
      if (base) colors.set(self, tinted(base, number(swatch.attrs.TintValue, 100)))
    } else {
      // a gradient is taken as the colour of its first stop
      const stop = descendants(swatch, 'GradientStop').find((candidate) => colors.has(decodeRef(candidate.attrs.StopColor ?? '')))
      if (stop) colors.set(self, colors.get(decodeRef(stop.attrs.StopColor!))!)
    }
  }
  return { colors, samples }
}

/** the colour a reference names: null for none, undefined for one that is not known */
function resolveColor(reference: string | undefined, colors: ColorMap): string | null | undefined {
  if (!reference) return undefined
  const ref = decodeRef(reference)
  if (ref === 'n' || /(^|\/)None$/i.test(ref)) return null
  return colors.get(ref)
}

// ── styles ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type ParagraphPatch = ParagraphStyleRecord['patch']

/** the settings a style (or a range of text) names in its attributes and properties, as a paragraph style's patch */
function styleProps(values: Map<string, string>, colors: ColorMap): ParagraphPatch {
  const patch: ParagraphPatch = {}
  const font = values.get('AppliedFont') ?? values.get('FontFamily')
  if (font) patch.fontFamily = font.replace(/\t.*$/, '').trim()
  const size = values.get('PointSize')
  if (size) patch.fontSize = Math.max(1, number(size, DEFAULT_TEXT_STYLE.fontSize))
  const leading = values.get('Leading')
  if (leading && !/^auto$/i.test(leading)) patch.leading = Math.max(0, number(leading))
  // an automatic leading is this percentage of the size (the file leaves it to the layout program: 120)
  const autoLeading = values.get('AutoLeading')
  if (autoLeading) (patch as Record<string, unknown>).autoLeading = Math.max(1, number(autoLeading, 120))
  const tracking = values.get('Tracking')
  if (tracking) patch.tracking = number(tracking)
  const fontStyle = values.get('FontStyle') ?? values.get('FontWeight')
  if (fontStyle) {
    patch.weight = /black|heavy/i.test(fontStyle) ? 900 : /bold/i.test(fontStyle) ? 700 : /semi|demi/i.test(fontStyle) ? 600 : /medium/i.test(fontStyle) ? 500 : /light|thin/i.test(fontStyle) ? 300 : 400
    patch.italic = /italic|oblique/i.test(fontStyle)
  }
  const fill = resolveColor(values.get('FillColor'), colors)
  if (fill !== undefined) patch.color = fill ?? '#000000'
  const align = values.get('Justification')
  if (align) {
    if (/^CenterAlign$/i.test(align)) patch.align = 'center'
    else if (/^LeftAlign$|^ToBindingSide$/i.test(align)) patch.align = 'left'
    else if (/^RightAlign$|^AwayFromBindingSide$/i.test(align)) patch.align = 'right'
    else if (/^CenterJustified$/i.test(align)) patch.align = 'justifyCenter'
    else if (/justified/i.test(align)) patch.align = 'justify'
  }
  for (const [source, target] of [['LeftIndent', 'indentLeft'], ['RightIndent', 'indentRight'], ['FirstLineIndent', 'firstLineIndent'], ['SpaceBefore', 'spaceBefore'], ['SpaceAfter', 'spaceAfter']] as const) {
    const value = values.get(source)
    if (value !== undefined && value !== '') patch[target] = number(value)
  }
  // word spacing (percent of a space): the least, and the one the composer aims at. Justified lines here take the middle of the two
  // as the spacing of the paragraph, so the file's own least (80 unless it says) is what lets as many words on a line as it did there.
  const minimumSpacing = values.get('MinimumWordSpacing')
  const desiredSpacing = values.get('DesiredWordSpacing')
  if (minimumSpacing) patch.wordSpacingMin = clamp(number(minimumSpacing, 80), 10, 100)
  if (desiredSpacing || minimumSpacing) patch.wordSpacingMax = clamp(number(desiredSpacing, 100), 100, 500)
  const shift = values.get('BaselineShift')
  if (shift) (patch as Record<string, unknown>).baselineShift = number(shift)
  if (isTrue(values.get('KeepLinesTogether'))) patch.keepLinesTogether = true
  const keepNext = values.get('KeepWithNext')
  if (keepNext && number(keepNext) > 0) patch.keepWithNext = true
  const list = values.get('BulletsAndNumberingListType')
  if (list && /^BulletList$/i.test(list)) patch.listKind = 'bullet'
  else if (list && /^NumberedList$/i.test(list)) patch.listKind = 'number'
  return patch
}

interface StyleDef {
  key: string
  id: string
  name: string
  basedOn?: string
  next?: string
  patch: ParagraphPatch
}

interface Styles {
  paragraph: Map<string, StyleDef>
  character: Map<string, StyleDef>
}

const NO_PARAGRAPH_STYLE = /\[No paragraph style\]/i
const NO_CHARACTER_STYLE = /\[None\]/i

function readStyles(files: Map<string, El>, colors: ColorMap): Styles {
  const paragraph = new Map<string, StyleDef>()
  const character = new Map<string, StyleDef>()
  let counter = 0
  const read = (node: El, into: Map<string, StyleDef>, kind: string) => {
    const self = node.attrs.Self ? decodeRef(node.attrs.Self) : ''
    if (!self || into.has(self)) return
    const values = propertiesOf(node)
    const based = values.get('BasedOn')
    const next = values.get('NextStyle')
    const name = (node.attrs.Name && !node.attrs.Name.startsWith('$ID/') ? node.attrs.Name : lastRef(self).replace(/^\$ID\//, '')) || kind
    counter += 1
    into.set(self, { key: self, id: `idml-${kind}-${counter}`, name, basedOn: based ? decodeRef(based) : undefined, next: next ? decodeRef(next) : undefined, patch: styleProps(values, colors) })
  }
  for (const [path, root] of files) {
    if (!/styles/i.test(path)) continue
    for (const node of descendants(root, 'ParagraphStyle')) read(node, paragraph, 'paragraph')
    for (const node of descendants(root, 'CharacterStyle')) read(node, character, 'character')
  }
  // "based on" and "next style" name a style the way its own id is written, except for the style every style comes from, which is
  // named without the kind in front ("$ID/[No paragraph style]")
  const qualify = (table: Map<string, StyleDef>, prefix: string) => {
    for (const def of table.values()) {
      for (const field of ['basedOn', 'next'] as const) {
        const value = def[field]
        if (value && !table.has(value) && table.has(`${prefix}/${value}`)) def[field] = `${prefix}/${value}`
      }
    }
  }
  qualify(paragraph, 'ParagraphStyle')
  qualify(character, 'CharacterStyle')
  return { paragraph, character }
}

/** a style's own settings over those of the styles it is based on (nearest last) */
function resolveStyle(table: Map<string, StyleDef>, key: string | undefined, cache: Map<string, ParagraphPatch>): ParagraphPatch {
  if (!key) return {}
  const hit = cache.get(key)
  if (hit) return hit
  const chain: StyleDef[] = []
  const seen = new Set<string>()
  for (let at: string | undefined = key; at && !seen.has(at); ) {
    seen.add(at)
    const def = table.get(at)
    if (!def) break
    chain.unshift(def)
    at = def.basedOn
  }
  const merged: ParagraphPatch = {}
  for (const def of chain) Object.assign(merged, def.patch)
  cache.set(key, merged)
  return merged
}

// ── stories ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** what a paragraph (a range of paragraphs of one style) carries: its style and what it sets itself */
interface ParagraphInfo {
  key: string | undefined
  id: string
  name: string
  overrides: ParagraphPatch
}

interface StoryText {
  text: string
  runs: Run[]
  paragraphs: ParagraphInfo[]
  footnotes: FootnoteItem[]
  /** the largest size of the text of each paragraph, for an automatic leading */
  sizes: number[]
  /** the largest leading the characters of each paragraph name themselves (a leading of a range of characters, not of the style) */
  leadings: number[]
}

interface Context {
  styles: Styles
  colors: ColorMap
  paragraphCache: Map<string, ParagraphPatch>
  characterCache: Map<string, ParagraphPatch>
  runStyles: Map<string, CharStyle>
  stories: Map<string, El>
  storyCache: Map<string, StoryText>
  notes: Set<string>
}

const CHARACTER_FIELDS = ['fontFamily', 'fontSize', 'weight', 'italic', 'tracking', 'color', 'baselineShift'] as const

/** the character settings of a patch (the paragraph-level ones left out) */
function characterPart(patch: ParagraphPatch): Partial<CharStyle> {
  const found: Record<string, unknown> = {}
  for (const field of CHARACTER_FIELDS) if ((patch as Record<string, unknown>)[field] !== undefined) found[field] = (patch as Record<string, unknown>)[field]
  return found as Partial<CharStyle>
}

/** the paragraph-level settings of a patch */
function paragraphPart(patch: ParagraphPatch): NonNullable<TextFrame['paragraphStylePatches']>[number] {
  const found: Record<string, unknown> = {}
  for (const field of ['leading', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align', 'wordSpacingMin', 'wordSpacingMax'] as const) {
    if (patch[field] !== undefined) found[field] = patch[field]
  }
  return found as NonNullable<TextFrame['paragraphStylePatches']>[number]
}

/** the character style of a piece of text, as the whole of what it is: paragraph style, the range's own settings, character style */
function runStyleOf(ctx: Context, paragraph: ParagraphInfo, characterKey: string | undefined, characterOverrides: ParagraphPatch): CharStyle {
  const cacheKey = `${paragraph.key ?? ''}|${JSON.stringify(paragraph.overrides)}|${characterKey ?? ''}|${JSON.stringify(characterOverrides)}`
  const hit = ctx.runStyles.get(cacheKey)
  if (hit) return hit
  const style: CharStyle = {
    fontFamily: DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: DEFAULT_TEXT_STYLE.fontSize,
    weight: DEFAULT_TEXT_STYLE.weight,
    italic: DEFAULT_TEXT_STYLE.italic,
    tracking: DEFAULT_TEXT_STYLE.tracking,
  }
  Object.assign(style, characterPart(resolveStyle(ctx.styles.paragraph, paragraph.key, ctx.paragraphCache)), characterPart(paragraph.overrides))
  if (characterKey && !NO_CHARACTER_STYLE.test(characterKey)) {
    Object.assign(style, characterPart(resolveStyle(ctx.styles.character, characterKey, ctx.characterCache)))
    const def = ctx.styles.character.get(characterKey)
    if (def) style.charStyleId = def.id
  }
  Object.assign(style, characterPart(characterOverrides))
  ctx.runStyles.set(cacheKey, style)
  return style
}

function paragraphInfoOf(ctx: Context, range: El): ParagraphInfo {
  const reference = range.attrs.AppliedParagraphStyle ? decodeRef(range.attrs.AppliedParagraphStyle) : undefined
  const def = reference ? ctx.styles.paragraph.get(reference) : undefined
  const usable = def && !NO_PARAGRAPH_STYLE.test(def.key)
  return {
    key: usable ? def.key : undefined,
    id: usable ? def.id : 'body',
    name: usable ? def.name : (DEFAULT_PARAGRAPH_STYLES[0]?.name ?? ''),
    overrides: styleProps(propertiesOf(range), ctx.colors),
  }
}

/**
 * A story whose paragraphs are "split into columns" (a paragraph spread over side-by-side columns inside the frame, as verses are set
 * in two rows): how many columns, and the gutter between them. Only when most of the text is set that way - a few headings that span
 * the columns cannot be told apart from it here - and then the frame is made columns, as a frame with columns is.
 */
function splitColumnsOf(story: El | undefined): { count: number; gutter?: number } {
  if (!story) return { count: 1 }
  let all = 0
  let split = 0
  let count = 1
  let gutter: number | undefined
  for (const range of descendants(story, 'ParagraphStyleRange')) {
    let chars = 0
    for (const content of descendants(range, 'Content')) chars += content.text.length
    all += chars
    if (range.attrs.SpanColumnType !== 'SplitColumns') continue
    const columns = Math.round(number(propertiesOf(range).get('SpanSplitColumnCount'), 1))
    if (columns < 2) continue
    split += chars
    count = Math.max(count, columns)
    const inside = range.attrs.SplitColumnInsideGutter
    if (gutter === undefined && inside !== undefined && Number.isFinite(Number.parseFloat(inside))) gutter = Math.max(0, number(inside))
  }
  return all > 0 && split / all >= 0.6 ? { count: Math.min(count, 4), gutter } : { count: 1 }
}

const SKIPPED_IN_STORY = new Set(['Properties', 'StoryPreference', 'InCopyExportOption', 'Rectangle', 'Oval', 'Polygon', 'GraphicLine', 'TextFrame', 'Group', 'Image', 'EPS', 'PDF', 'Note', 'Change'])

/** The text of a story: what its Content elements say, a paragraph break for each Br, the styles of the ranges they are in. */
function extractStory(ctx: Context, root: El, master: boolean): StoryText {
  const story: StoryText = { text: '', runs: [], paragraphs: [], footnotes: [], sizes: [], leadings: [] }
  let breaks = 0
  /** the leading the characters being read name (a range of characters can set one, and it is then the leading of its lines) */
  let leadingNow: number | undefined
  const append = (value: string, style: CharStyle, paragraph: ParagraphInfo) => {
    if (!value) return
    const text = value.replace(/\u2028/g, '\n')
    while (story.paragraphs.length < breaks + 1) story.paragraphs.push(paragraph)
    story.text += text
    // the size of the paragraphs this text is in (a break ends the one it is in, and what follows it is the next)
    text.split('\n').forEach((piece, index, pieces) => {
      if (index > 0 && index === pieces.length - 1 && piece === '') return
      const at = breaks + index
      story.sizes[at] = Math.max(story.sizes[at] ?? 0, style.fontSize)
      if (leadingNow !== undefined) story.leadings[at] = Math.max(story.leadings[at] ?? 0, leadingNow)
    })
    for (const ch of text) if (ch === '\n') breaks += 1
    const last = story.runs[story.runs.length - 1]
    if (last && last.style === style) last.len += text.length
    else story.runs.push({ len: text.length, style })
  }
  const emptyParagraph = (): ParagraphInfo => ({ key: undefined, id: 'body', name: DEFAULT_PARAGRAPH_STYLES[0]?.name ?? '', overrides: {} })
  interface State {
    paragraph: ParagraphInfo
    characterKey: string | undefined
    overrides: ParagraphPatch
  }
  const visit = (el: El, state: State): void => {
    for (const child of el.kids) {
      const name = child.name
      if (SKIPPED_IN_STORY.has(name)) continue
      const style = () => runStyleOf(ctx, state.paragraph, state.characterKey, state.overrides)
      if (name === 'ParagraphStyleRange') {
        const paragraph = paragraphInfoOf(ctx, child)
        while (story.paragraphs.length < breaks + 1) story.paragraphs.push(paragraph)
        visit(child, { paragraph, characterKey: undefined, overrides: {} })
      } else if (name === 'CharacterStyleRange') {
        const characterKey = child.attrs.AppliedCharacterStyle ? decodeRef(child.attrs.AppliedCharacterStyle) : undefined
        const leading = propertiesOf(child).get('Leading')
        const before = leadingNow
        if (leading && !/^auto$/i.test(leading) && number(leading) > 0) leadingNow = number(leading)
        visit(child, { paragraph: state.paragraph, characterKey, overrides: { ...state.overrides, ...characterPart(styleProps(propertiesOf(child), ctx.colors)) } })
        leadingNow = before
      } else if (name === 'Content') {
        append(child.text, style(), state.paragraph)
      } else if (name === 'Br') {
        append('\n', style(), state.paragraph)
      } else if (name === 'Tab') {
        append('\t', style(), state.paragraph)
      } else if (name === 'ACE') {
        // the automatic page number is a mark only a parent page can show
        if (master && child.attrs.code === '18') append(PAGE_NUMBER_MARKER, style(), state.paragraph)
      } else if (name === 'TextVariableInstance') {
        append(child.attrs.ResultText ?? '', style(), state.paragraph)
      } else if (name === 'Footnote') {
        const parts: string[] = []
        for (const content of descendants(child, 'Content')) parts.push(content.text)
        const content = parts.join('')
        if (content) story.footnotes.push({ id: `idml-footnote-${story.footnotes.length + 1}`, anchor: story.text.length, content })
      } else if (name === 'Table') {
        ctx.notes.add('טבלה בטקסט יובאה כטקסט רגיל (תאים מופרדים בטאב)')
        const cells = child.kids.filter((cell) => cell.name === 'Cell')
        cells.forEach((cell, index) => {
          visit(cell, state)
          const row = (node: El | undefined) => node?.attrs.Name?.split(':')[1]
          const endsRow = index === cells.length - 1 || row(cells[index + 1]) !== row(cell)
          append(endsRow ? '\n' : '\t', style(), state.paragraph)
        })
      } else {
        // a container the text is inside (a hyperlink, a tagged element)
        visit(child, state)
      }
    }
  }
  visit(root, { paragraph: emptyParagraph(), characterKey: undefined, overrides: {} })
  // the last paragraph mark closes the story: it does not start another paragraph
  if (story.text.endsWith('\n')) {
    story.text = story.text.slice(0, -1)
    const last = story.runs[story.runs.length - 1]
    if (last) {
      last.len -= 1
      if (last.len <= 0) story.runs.pop()
    }
    breaks -= 1
  }
  if (story.paragraphs.length === 0) story.paragraphs.push(emptyParagraph())
  story.paragraphs.length = Math.max(1, Math.min(story.paragraphs.length, breaks + 1))
  return story
}

function storyOf(ctx: Context, id: string, master: boolean): StoryText | undefined {
  const cacheKey = `${master ? 'm' : 'd'}:${id}`
  const hit = ctx.storyCache.get(cacheKey)
  if (hit) return hit
  const root = ctx.stories.get(id)
  if (!root) return undefined
  const story = extractStory(ctx, root, master)
  ctx.storyCache.set(cacheKey, story)
  return story
}

// ── pages ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface SourcePage {
  el: El
  id: string
  name: string
  box: Box
  masterRef: string
  indexInSpread: number
  spreadId: string
}

interface SourceSpread {
  id: string
  el: El
  pages: SourcePage[]
}

function readSpreads(files: Map<string, El>, order: string[], master: boolean): SourceSpread[] {
  const folder = master ? 'masterspreads' : 'spreads'
  const paths = [...files.keys()].filter((path) => path.toLowerCase().split('/').includes(folder))
  const rank = (path: string) => {
    const found = order.indexOf(path)
    return found < 0 ? Number.MAX_SAFE_INTEGER : found
  }
  paths.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }))
  const spreads: SourceSpread[] = []
  for (const path of paths) {
    const root = files.get(path)!
    const el = descendants(root, master ? 'MasterSpread' : 'Spread')[0]
    if (!el) continue
    const id = lastRef(el.attrs.Self) || path
    const pages: SourcePage[] = []
    for (const page of el.kids.filter((candidate) => candidate.name === 'Page')) {
      const bounds = numberList(page.attrs.GeometricBounds)
      if (bounds.length < 4) continue
      const [top, left, bottom, right] = bounds as [number, number, number, number]
      const matrix = itemMatrix(page)
      const corners = [apply(matrix, left, top), apply(matrix, right, bottom)]
      const x = Math.min(corners[0]![0], corners[1]![0])
      const y = Math.min(corners[0]![1], corners[1]![1])
      pages.push({
        el: page,
        id: lastRef(page.attrs.Self) || `${id}-${pages.length}`,
        name: page.attrs.Name ?? String(pages.length + 1),
        box: { x, y, w: Math.max(1, Math.abs(corners[1]![0] - corners[0]![0])), h: Math.max(1, Math.abs(corners[1]![1] - corners[0]![1])) },
        masterRef: lastRef(page.attrs.AppliedMaster),
        indexInSpread: pages.length,
        spreadId: id,
      })
    }
    if (pages.length > 0) spreads.push({ id, el, pages })
  }
  return spreads
}

function nearestPage(cx: number, cy: number, pages: SourcePage[]): SourcePage {
  let best = pages[0]!
  let distance = Infinity
  for (const page of pages) {
    const dx = Math.max(page.box.x - cx, 0, cx - (page.box.x + page.box.w))
    const dy = Math.max(page.box.y - cy, 0, cy - (page.box.y + page.box.h))
    const score = dx * dx + dy * dy
    if (score < distance) {
      best = page
      distance = score
    }
  }
  return best
}

// ── objects ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ITEM_TAGS = new Set(['TextFrame', 'Rectangle', 'Oval', 'Polygon', 'GraphicLine'])
const GRAPHIC_TAGS = new Set(['Image', 'EPS', 'PDF', 'PlacedPDF', 'WMF', 'PICT', 'ImportedPage'])

interface Item {
  el: El
  matrix: Matrix
  groupId: string | undefined
  hidden: boolean
  locked: boolean
}

/** every page item of a spread, in drawing order, with the transform it has in the spread (the groups it is in included) */
function collectItems(spread: El): Item[] {
  const items: Item[] = []
  const visit = (parent: El, matrix: Matrix, groupId: string | undefined, hidden: boolean, locked: boolean) => {
    for (const child of parent.kids) {
      if (child.name === 'Group') {
        const own = child.attrs.Self ? safeId('group', child.attrs.Self) : undefined
        visit(child, compose(matrix, itemMatrix(child)), groupId ?? own, hidden || child.attrs.Visible === 'false', locked || isTrue(child.attrs.Locked))
      } else if (ITEM_TAGS.has(child.name)) {
        items.push({ el: child, matrix: compose(matrix, itemMatrix(child)), groupId, hidden: hidden || child.attrs.Visible === 'false', locked: locked || isTrue(child.attrs.Locked) })
      }
    }
  }
  visit(spread, IDENTITY, undefined, false, false)
  return items
}

interface Archive {
  files: Map<string, Uint8Array>
}

const IMAGE_TYPES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: 'image/gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: 'image/webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { mime: 'image/bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
]

const imageKind = (bytes: Uint8Array): string | null => IMAGE_TYPES.find((type) => bytes.length > 12 && type.test(bytes))?.mime ?? null

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function imageDimensions(bytes: Uint8Array, mime: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === 'image/png' && bytes.length >= 24) return [view.getUint32(16), view.getUint32(20)]
  if (mime === 'image/gif' && bytes.length >= 10) return [view.getUint16(6, true), view.getUint16(8, true)]
  if (mime === 'image/jpeg') {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]!
      const length = view.getUint16(offset + 2)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [view.getUint16(offset + 7), view.getUint16(offset + 5)]
      if (length < 2) break
      offset += 2 + length
    }
  }
  return [1, 1]
}

/** the file name a link points at */
function linkName(resource: string): string {
  const cleaned = decodeRef(resource.split('?')[0] ?? '')
  return cleaned.split(/[\\/:]/).filter(Boolean).at(-1) ?? ''
}

interface Resolved {
  opacity?: number
  fill: string | null | undefined
  stroke: string | null | undefined
}

function appearanceOf(ctx: Context, el: El): Resolved {
  const values = propertiesOf(el)
  const result: Resolved = {
    fill: resolveColor(values.get('FillColor'), ctx.colors),
    stroke: resolveColor(values.get('StrokeColor'), ctx.colors),
  }
  const blending = kid(kid(el, 'TransparencySetting'), 'BlendingSetting')
  const opacity = blending ? number(blending.attrs.Opacity, 100) : 100
  if (opacity < 100) result.opacity = clamp(opacity / 100, 0, 1)
  return result
}

interface Output {
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
}

const emptyOutput = (): Output => ({ frames: [], images: [], shapes: [] })

/** a label worth showing: not the placeholder every unnamed object carries */
const labelOf = (el: El): string | undefined => (el.attrs.Name && !el.attrs.Name.startsWith('$ID/') ? el.attrs.Name : undefined)

interface BuildInput {
  ctx: Context
  archive: Archive
  assets: Assets
  layerIds: Map<string, string>
  master: boolean
  /** where the page is in the new document (its own corner for a parent page) */
  target: (page: SourcePage) => Box | undefined
  zStart: number
}

function buildObjects(input: BuildInput, spreads: SourceSpread[]): { byPage: Map<string, Output>; z: number } {
  const { ctx, archive, assets, layerIds, master } = input
  const byPage = new Map<string, Output>()
  const frameBySelf = new Map<string, TextFrame>()
  const frameData: { frame: TextFrame; el: El; page: SourcePage }[] = []
  /** every text frame made (a frame with columns is one frame for each column), and the last frame of each such frame */
  const allFrames: TextFrame[] = []
  const lastColumn = new Map<string, TextFrame>()
  let z = input.zStart
  const outputFor = (page: SourcePage) => {
    let found = byPage.get(page.id)
    if (!found) byPage.set(page.id, (found = emptyOutput()))
    return found
  }
  for (const spread of spreads) {
    for (const item of collectItems(spread.el)) {
      const { el } = item
      const self = el.attrs.Self
      if (!self) continue
      const paths = localPaths(el)
      const placed = placementOf(paths, item.matrix)
      if (!placed) continue
      const page = nearestPage(placed.box.x + placed.box.w / 2, placed.box.y + placed.box.h / 2, spread.pages)
      const target = input.target(page)
      if (!target) continue
      const out = outputFor(page)
      const box: Box = { x: target.x + placed.box.x - page.box.x, y: target.y + placed.box.y - page.box.y, w: placed.box.w, h: placed.box.h }
      const id = safeId('object', self)
      const layerId = layerIds.get(lastRef(el.attrs.ItemLayer))
      const look = appearanceOf(ctx, el)
      const common = {
        ...(layerId ? { layerId } : {}),
        ...(item.groupId ? { groupId: item.groupId } : {}),
        ...(item.hidden ? { hidden: true as const } : {}),
        ...(item.locked ? { locked: true as const } : {}),
        ...(look.opacity !== undefined ? { opacity: look.opacity } : {}),
      }
      const label = labelOf(el)

      if (el.name === 'TextFrame') {
        // a coloured text frame is a coloured rectangle behind its text
        const fill = look.fill ?? null
        const stroke = look.stroke ?? null
        const lineWidth = number(el.attrs.StrokeWeight, stroke ? 1 : 0)
        if (fill || (stroke && lineWidth > 0)) {
          out.shapes.push({
            id: `${id}-background`, kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, fill, stroke, strokeWidth: stroke ? lineWidth : 0, z: z++,
            ...common, ...(placed.rotation ? { rotation: placed.rotation } : {}),
          })
        }
        // The text area is the frame less its insets, and a frame of several columns is a frame for each column, threaded one into the
        // next (the first on the right when the story reads from the right): the layout here has no columns inside a frame.
        const preference = kid(el, 'TextFramePreference')
        const [insetTop = 0, insetLeft = 0, insetBottom = 0, insetRight = 0] = (kid(kid(preference, 'Properties'), 'InsetSpacing')?.kids ?? []).map((item) => Math.max(0, number(item.text.trim())))
        const turn = (placed.rotation * Math.PI) / 180
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const area = { w: Math.max(1, box.w - insetLeft - insetRight), h: Math.max(1, box.h - insetTop - insetBottom) }
        const shiftX = (insetLeft - insetRight) / 2
        const shiftY = (insetTop - insetBottom) / 2
        const centerX = box.x + box.w / 2 + shiftX * cos - shiftY * sin
        const centerY = box.y + box.h / 2 + shiftX * sin + shiftY * cos
        const storyElement = ctx.stories.get(lastRef(el.attrs.ParentStory))
        const split = splitColumnsOf(storyElement)
        const count = clamp(Math.round(number(preference?.attrs.TextColumnCount, 1)) * split.count, 1, 8)
        const gutter = split.count > 1 && split.gutter !== undefined ? split.gutter : Math.max(0, number(preference?.attrs.TextColumnGutter, 12))
        const columnWidth = count > 1 ? Math.max(1, (area.w - gutter * (count - 1)) / count) : area.w
        const direction = kid(storyElement, 'StoryPreference')?.attrs.StoryDirection
        const fromRight = direction !== 'LeftToRightDirection'
        const columns: TextFrame[] = []
        for (let index = 0; index < count; index += 1) {
          const slot = fromRight ? count - 1 - index : index
          const offset = -area.w / 2 + slot * (columnWidth + gutter) + columnWidth / 2
          const cx = centerX + offset * cos
          const cy = centerY + offset * sin
          columns.push({
            ...DEFAULT_TEXT_STYLE, id: index === 0 ? id : `${id}-column-${index + 1}`, x: cx - columnWidth / 2, y: cy - area.h / 2, w: columnWidth, h: area.h,
            text: '', runs: [], next: null, z: z++,
            ...common, ...(index === 0 && label ? { label } : {}), ...(placed.rotation ? { rotation: placed.rotation } : {}),
          })
        }
        columns.forEach((column, index) => {
          if (index > 0) columns[index - 1]!.next = column.id
        })
        out.frames.push(...columns)
        allFrames.push(...columns)
        frameBySelf.set(lastRef(self), columns[0]!)
        lastColumn.set(columns[0]!.id, columns[columns.length - 1]!)
        frameData.push({ frame: columns[0]!, el, page })
        continue
      }

      // a picture (or a frame that waits for one)
      const graphic = el.kids.find((child) => GRAPHIC_TAGS.has(child.name))
      if (graphic || el.attrs.ContentType === 'GraphicType') {
        const link = graphic ? descendants(graphic, 'Link')[0] : undefined
        const resource = link?.attrs.LinkResourceURI ?? ''
        const name = linkName(resource)
        const embedded = graphic ? descendants(graphic, 'Contents').find((contents) => contents.text.length > 64 && !contents.text.includes('<')) : undefined
        let bytes: Uint8Array | null = embedded ? fromBase64(embedded.text) : null
        if (!bytes && name) {
          const path = [...archive.files.keys()].find((candidate) => /^Links\//i.test(candidate) && candidate.split('/').at(-1)?.toLowerCase() === name.toLowerCase())
          bytes = path ? (archive.files.get(path) ?? null) : null
        }
        const mime = bytes ? imageKind(bytes) : null
        if (bytes && mime) {
          const assetId = safeId('asset', `${self}-${name || 'embedded'}`)
          const [width, height] = imageDimensions(bytes, mime)
          const asset: Asset = { name: name || 'image', mime, dataUrl: `data:${mime};base64,${toBase64(bytes)}`, width, height }
          assets[assetId] = asset
          const wrapped = wrapOf(el)
          out.images.push({
            id, x: box.x, y: box.y, w: box.w, h: box.h, assetId, fit: 'fill', z: z++,
            ...common, ...(label ? { label } : {}), ...(placed.rotation ? { rotation: placed.rotation } : {}),
            ...(wrapped ? { wrap: wrapped.wrap, wrapOffset: wrapped.wrapOffset } : {}),
          })
          continue
        }
        // not in the package (a link to a file that stays outside it): an empty picture frame keeps its place
        ctx.notes.add(name ? 'תמונות מקושרות שאינן בתוך הארכיון הוחלפו במסגרות תמונה ריקות' : 'מסגרות תמונה ללא תמונה יובאו כמסגרות ריקות')
        const kind = el.name === 'Oval' ? 'ellipse' : el.name === 'Rectangle' ? 'rect' : 'path'
        out.shapes.push({
          id, kind, x: box.x, y: box.y, w: box.w, h: box.h, fill: null, stroke: null, strokeWidth: 0, frame: true, z: z++,
          ...(kind === 'path' ? { geom: geomOf(paths, placed.local) } : {}),
          ...common, ...(name ? { label: name } : label ? { label } : {}), ...(placed.rotation ? { rotation: placed.rotation } : {}),
        })
        continue
      }

      // a line
      if (el.name === 'GraphicLine' && paths.length === 1 && paths[0]!.points.length === 2) {
        const [a, b] = paths[0]!.points.map((point) => apply(item.matrix, point.anchor[0], point.anchor[1])) as [Pt, Pt]
        const at = (point: Pt): Pt => [target.x + point[0] - page.box.x, target.y + point[1] - page.box.y]
        const lineBox = boxFromEndpoints(at(a), at(b))
        const stroke = look.stroke === undefined ? '#000000' : look.stroke
        out.shapes.push({
          id, kind: 'line', ...lineBox, fill: null, stroke, strokeWidth: stroke ? number(el.attrs.StrokeWeight, 1) : 0, z: z++,
          ...common, ...(label ? { label } : {}),
        })
        continue
      }

      // a shape
      const stroke = look.stroke ?? null
      const kind = el.name === 'Oval' ? 'ellipse' : el.name === 'Rectangle' && paths.length === 1 && paths[0]!.points.length === 4 && !paths[0]!.open ? 'rect' : 'path'
      const open = paths.length === 1 && paths[0]!.open
      out.shapes.push({
        id, kind, x: box.x, y: box.y, w: box.w, h: box.h,
        fill: open ? null : (look.fill ?? null), stroke, strokeWidth: stroke ? number(el.attrs.StrokeWeight, 1) : 0, z: z++,
        ...(kind === 'path' ? { geom: geomOf(paths, placed.local), ...(open ? { closed: false as const } : {}) } : {}),
        ...common, ...(label ? { label } : {}), ...(placed.rotation ? { rotation: placed.rotation } : {}),
      })
    }
  }

  // the threads: a frame goes on in the frame its NextTextFrame names (in any spread), and the head of a thread takes the story
  for (const { frame, el } of frameData) {
    const next = lastRef(el.attrs.NextTextFrame)
    const following = next && next !== 'n' ? frameBySelf.get(next) : undefined
    // the thread goes on from the last column of a frame
    const tail = lastColumn.get(frame.id) ?? frame
    if (following && following !== frame) tail.next = following.id
  }
  const taken = new Set<string>()
  const frameById = new Map(allFrames.map((frame) => [frame.id, frame] as const))
  const pointedAt = new Set(allFrames.map((frame) => frame.next).filter((value): value is string => !!value))
  // the frames a story goes on in are as much higher as its first one was made
  const growThread = (head: TextFrame, safety: number) => {
    if (safety <= 0) return
    const seen = new Set<string>([head.id])
    for (let next = head.next ? frameById.get(head.next) : undefined; next && !seen.has(next.id); next = next.next ? frameById.get(next.next) : undefined) {
      seen.add(next.id)
      next.h = Math.ceil((next.h + safety) * 10) / 10
    }
  }
  for (const { frame, el } of frameData) {
    const storyId = lastRef(el.attrs.ParentStory)
    if (!storyId || pointedAt.has(frame.id) || taken.has(storyId)) continue
    const story = storyOf(ctx, storyId, master)
    if (!story) continue
    taken.add(storyId)
    growThread(frame, applyStory(ctx, frame, story))
  }
  // a frame whose thread has no head here (cut off at the start) still shows its story
  for (const { frame, el } of frameData) {
    const storyId = lastRef(el.attrs.ParentStory)
    if (!storyId || taken.has(storyId)) continue
    const story = storyOf(ctx, storyId, master)
    if (!story) continue
    taken.add(storyId)
    growThread(frame, applyStory(ctx, frame, story))
  }
  return { byPage, z }
}

/** Puts the story in the head frame of its thread. Returns how much higher the frames of the thread have to be (see below). */
function applyStory(ctx: Context, frame: TextFrame, story: StoryText): number {
  const first = story.paragraphs[0]!
  const firstRun = story.runs[0]?.style
  type Resolved = ParagraphPatch & { autoLeading?: number }
  const resolved = story.paragraphs.map((paragraph): Resolved => ({ ...resolveStyle(ctx.styles.paragraph, paragraph.key, ctx.paragraphCache), ...paragraph.overrides }))
  const frameStyle: Partial<TextStyle> = paragraphPart(resolved[0]!)
  // The side indents of the story narrow the text of every paragraph, and the indents of a paragraph (its patch) are put on top of
  // them: so the indents are the paragraphs' own, and the story has none (else a paragraph with an indent of 28 is narrowed by 56).
  delete frameStyle.indentLeft
  delete frameStyle.indentRight
  Object.assign(frame, frameStyle)
  if (firstRun) {
    frame.fontFamily = firstRun.fontFamily
    frame.fontSize = firstRun.fontSize
    frame.weight = firstRun.weight
    frame.italic = firstRun.italic
    frame.tracking = firstRun.tracking
    if (firstRun.color) frame.color = firstRun.color
  }
  frame.text = story.text
  frame.runs = story.runs.map((run) => ({ len: run.len, style: run.style }))
  frame.paragraphStyleId = first.id
  frame.paragraphStyleIds = story.paragraphs.map((paragraph) => paragraph.id)
  frame.paragraphStyleNames = story.paragraphs.map((paragraph) => paragraph.name)
  // what the file says, and what it leaves to the layout program: no space between paragraphs, and a leading of 120 % of the size
  // (the defaults of this program are a space of 7 points and a leading of 125 %, which fill a frame sooner than the file's)
  const leadingOf = (index: number): number => {
    // a leading the characters name themselves is the leading of their lines, over the paragraph's
    const named = story.leadings[index]
    if (named !== undefined && named > 0) return named
    const explicit = resolved[index]?.leading
    if (explicit !== undefined && explicit > 0) return explicit
    const size = story.sizes[index] || firstRun?.fontSize || frame.fontSize
    return Math.round(size * (resolved[index]?.autoLeading ?? 120)) / 100
  }
  frame.leading = leadingOf(0)
  // the space before the first paragraph is not applied at the top of a frame in the program the file comes from (here it would push
  // the text down, and out of a frame that holds exactly its lines)
  frame.spaceBefore = 0
  frame.spaceAfter = resolved[0]?.spaceAfter ?? 0
  const before = resolved.map((paragraph, index) => (index === 0 ? 0 : (paragraph.spaceBefore ?? 0)))
  const after = resolved.map((paragraph) => paragraph.spaceAfter ?? 0)
  if (before.some((value) => value !== frame.spaceBefore)) frame.paraSpaceBefore = before
  if (after.some((value) => value !== frame.spaceAfter)) frame.paraSpaceAfter = after
  // the look of each paragraph (its style's settings and what it sets itself) is kept on the paragraph, the way applying a style does
  frame.paragraphStylePatches = resolved.map((paragraph, index) => ({ ...paragraphPart(paragraph), leading: leadingOf(index) }))
  if (story.footnotes.length > 0) frame.footnotes = story.footnotes
  // The layout here keeps a margin (0.15 of the size) under the last line of a frame, counts the letters of a line to the bottom of
  // their boxes (which reach below a line whose leading is less than the height of the letters' boxes: about 1.35 of the size), and
  // needs the whole leading for a line - where the program the file comes from needs only what is above the baseline. Text that fills
  // its frame there is cut off here, and a title in a frame as high as its letters shows nothing. So the frames that hold text are
  // a little higher: by those, and the first one at least as high as its first line with them.
  if (!story.text.trim()) return 0
  const extra = Math.max(1, frame.fontSize * 0.15) + Math.max(0, (frame.fontSize * 1.35 - frame.leading) / 2)
  const firstLine = frame.leading + frame.spaceBefore
  if (frame.h >= firstLine * 0.6) frame.h = Math.ceil(Math.max(frame.h + extra, firstLine + extra) * 10) / 10
  return extra
}

function wrapOf(el: El): { wrap: 'around' | 'jump'; wrapOffset: number } | null {
  const prefs = kid(el, 'TextWrapPreference')
  const mode = prefs?.attrs.TextWrapMode ?? 'None'
  if (/^None$/i.test(mode)) return null
  const offsets = numberList(kid(kid(prefs, 'Properties'), 'TextWrapOffset')?.attrs.Top).concat(numberList(kid(kid(prefs, 'Properties'), 'TextWrapOffset')?.attrs.Left))
  return { wrap: /JumpObject|NextColumn/i.test(mode) ? 'jump' : 'around', wrapOffset: offsets.length ? Math.max(...offsets) : 8 }
}

// ── the document ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const XML_WANTED = /(^|\/)(designmap|Styles|Graphic|Preferences)\.xml$|(^|\/)(Spreads|MasterSpreads|Stories)\/[^/]+\.xml$/i

function parseDocPreferences(files: Map<string, El>, name: string): DocSettings {
  const preference = [...files.values()].flatMap((root) => descendants(root, 'DocumentPreference'))[0]
  const doc = defaultDocSettings(name)
  doc.width = Math.max(1, number(preference?.attrs.PageWidth, 612))
  doc.height = Math.max(1, number(preference?.attrs.PageHeight, 792))
  doc.facingPages = isTrue(preference?.attrs.FacingPages)
  const binding = preference?.attrs.PageBinding ?? preference?.attrs.Binding ?? ''
  doc.binding = /^LeftToRight$/i.test(binding) ? 'ltr' : 'rtl'
  doc.perRow = doc.facingPages ? 2 : 1
  doc.primaryTextFrame = false
  if (preference) {
    const bleed = (key: string) => Math.max(0, number(preference.attrs[key], 0))
    doc.bleed = { top: bleed('DocumentBleedTopOffset'), bottom: bleed('DocumentBleedBottomOffset'), left: bleed('DocumentBleedInsideOrLeftOffset'), right: bleed('DocumentBleedOutsideOrRightOffset') }
    const slug = (key: string) => Math.max(0, number(preference.attrs[key], 0))
    doc.slug = { top: slug('SlugTopOffset'), bottom: slug('SlugBottomOffset'), left: slug('SlugInsideOrLeftOffset'), right: slug('SlugRightOrOutsideOffset') }
  }
  return doc
}

const marginsOf = (page: SourcePage): Sides | null => {
  const preference = kid(page.el, 'MarginPreference')
  if (!preference) return null
  return {
    top: Math.max(0, number(preference.attrs.Top)),
    bottom: Math.max(0, number(preference.attrs.Bottom)),
    left: Math.max(0, number(preference.attrs.Left)),
    right: Math.max(0, number(preference.attrs.Right)),
  }
}

const sameSides = (a: Sides, b: Sides) => Math.abs(a.top - b.top) + Math.abs(a.bottom - b.bottom) + Math.abs(a.left - b.left) + Math.abs(a.right - b.right) < 0.01

export interface IdmlImport {
  content: DocContent
  /** what did not come through as it was (shown to the person who opened the file) */
  notes: string[]
}

export async function readIdmlWithNotes(file: File): Promise<IdmlImport> {
  if (!file.name.toLowerCase().endsWith('.idml')) throw new Error('יש לבחור קובץ IDML.')
  let archive: Map<string, Uint8Array>
  try {
    archive = await unzipEntries(await file.arrayBuffer(), (path) => XML_WANTED.test(path) || (/^Links\//i.test(path) && /\.(?:png|jpe?g|gif|webp|bmp)$/i.test(path)))
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    throw new Error(
      /too large|too many/i.test(reason)
        ? 'קובץ ה-IDML גדול מדי לייבוא.'
        : /encrypted/i.test(reason)
          ? 'קובץ ה-IDML מוצפן, ואי אפשר לקרוא אותו.'
          : 'קובץ ה-IDML פגום או שאינו ארכיון ZIP תקין.',
    )
  }
  const files = new Map<string, El>()
  for (const [path, bytes] of archive) if (path.toLowerCase().endsWith('.xml')) files.set(path, readXml(bytes, path))
  const designMap = [...files].find(([path]) => /(^|\/)designmap\.xml$/i.test(path))?.[1]
  if (!designMap) throw new Error('קובץ IDML אינו מכיל designmap.xml תקין.')
  const orderOf = (tag: string) => descendants(designMap, tag).map((node) => node.attrs.src).filter((src): src is string => !!src)

  const name = file.name.replace(/\.idml$/i, '')
  const doc = parseDocPreferences(files, name)
  const spreads = readSpreads(files, orderOf('Spread'), false)
  const masterSpreads = readSpreads(files, orderOf('MasterSpread'), true)
  const sourcePages = spreads.flatMap((spread) => spread.pages)
  if (sourcePages.length === 0) throw new Error('קובץ IDML אינו מכיל עמודים.')
  if (sourcePages.length > MAX_PAGES) throw new Error(`קובץ IDML מכיל יותר מ-${MAX_PAGES} עמודים.`)
  doc.pages = sourcePages.length
  doc.pageSizes = sourcePages.map((page) => ({ w: page.box.w, h: page.box.h }))
  doc.width = Math.max(...doc.pageSizes.map((size) => size!.w))
  doc.height = Math.max(...doc.pageSizes.map((size) => size!.h))
  const rects = pageRects(doc)
  const targets = new Map(sourcePages.map((page, index) => [page.id, rects[index]!]))

  const { colors, samples } = makeColors(files)
  const styles = readStyles(files, colors)
  const stories = new Map<string, El>()
  for (const root of files.values()) for (const story of descendants(root, 'Story')) if (story.attrs.Self) stories.set(lastRef(story.attrs.Self), story)
  const ctx: Context = {
    styles, colors, stories,
    paragraphCache: new Map(), characterCache: new Map(), runStyles: new Map(), storyCache: new Map(), notes: new Set(),
  }

  // layers: the first one listed is the one in front
  const layerOrder: string[] = []
  const layers: Record<string, LayerInfo> = {}
  const layerIds = new Map<string, string>()
  for (const root of files.values()) {
    for (const layer of descendants(root, 'Layer')) {
      const self = lastRef(layer.attrs.Self)
      if (!self || layerIds.has(self)) continue
      const layerId = safeId('layer', self)
      layerOrder.push(layerId)
      layerIds.set(self, layerId)
      layers[layerId] = {
        name: layer.attrs.Name || `שכבה ${layerOrder.length}`,
        ...(layer.attrs.Visible === 'false' ? { hidden: true as const } : {}),
        ...(isTrue(layer.attrs.Locked) ? { locked: true as const } : {}),
      }
    }
  }

  const assets: Assets = {}
  const base = { ctx, archive: { files: archive }, assets, layerIds }
  const document = buildObjects({ ...base, master: false, target: (page) => targets.get(page.id), zStart: 0 }, spreads)
  const frames: TextFrame[] = []
  const images: ImageFrame[] = []
  const shapes: ShapeFrame[] = []
  for (const out of document.byPage.values()) {
    frames.push(...out.frames)
    images.push(...out.images)
    shapes.push(...out.shapes)
  }

  // parent pages: one for each page of each parent spread, with the objects that lie on it
  const parents: ParentPage[] = []
  const parentPages = new Map<string, ParentPage[]>()
  let z = document.z
  for (const spread of masterSpreads) {
    const built = buildObjects({ ...base, master: true, target: (page) => ({ x: 0, y: 0, w: page.box.w, h: page.box.h }), zStart: z }, [spread])
    z = built.z
    const set: ParentPage[] = spread.pages.map((page, index) => {
      const out = built.byPage.get(page.id) ?? emptyOutput()
      return {
        id: safeId('master', `${spread.id}-${index}`),
        prefix: (page.name.replace(/[^\p{L}\p{N}]/gu, '') || String.fromCharCode(65 + index)).slice(0, 4),
        name: page.name,
        w: page.box.w,
        h: page.box.h,
        frames: out.frames,
        images: out.images,
        shapes: out.shapes,
      }
    })
    parents.push(...set)
    parentPages.set(spread.id, set)
  }
  const pageParents = sourcePages.map((page): string | null => {
    const set = parentPages.get(page.masterRef)
    if (!set?.length) return null
    return (set[Math.min(page.indexInSpread, set.length - 1)] ?? set[0])?.id ?? null
  })

  // the margins and the columns of the document are those of the first page that has any; a page that has other margins keeps them
  const reference = sourcePages.find((page) => marginsOf(page))
  const referencePreference = kid(reference?.el, 'MarginPreference')
  if (reference) doc.margins = marginsOf(reference)!
  doc.columns = number(referencePreference?.attrs.ColumnCount, 1) >= 2 ? 2 : 1
  if (referencePreference?.attrs.ColumnGutter) doc.gutter = Math.max(0, number(referencePreference.attrs.ColumnGutter, doc.gutter))
  doc.pageMargins = sourcePages.map((page) => {
    const margins = marginsOf(page)
    return margins && !sameSides(margins, doc.margins) ? margins : null
  })
  if (doc.pageMargins.every((margins) => margins === null)) doc.pageMargins = []

  const paragraphStyles: ParagraphStyleRecord[] = [...DEFAULT_PARAGRAPH_STYLES]
  const characterStyles: CharacterStyleRecord[] = []
  const idByKey = (table: Map<string, StyleDef>, key: string | undefined) => (key ? table.get(key)?.id : undefined)
  for (const def of styles.paragraph.values()) {
    if (NO_PARAGRAPH_STYLE.test(def.key)) continue
    const resolvedPatch: ParagraphPatch & { autoLeading?: number } = resolveStyle(styles.paragraph, def.key, ctx.paragraphCache)
    const patch = { ...def.patch } as ParagraphPatch & { autoLeading?: number }
    delete patch.autoLeading
    if (patch.leading === undefined && resolvedPatch.leading === undefined && resolvedPatch.fontSize !== undefined) patch.leading = Math.round(resolvedPatch.fontSize * (resolvedPatch.autoLeading ?? 120)) / 100
    const record: ParagraphStyleRecord = { id: def.id, name: def.name, patch }
    const basedOn = idByKey(styles.paragraph, def.basedOn)
    if (basedOn && !NO_PARAGRAPH_STYLE.test(def.basedOn ?? '')) record.basedOnId = basedOn
    const next = idByKey(styles.paragraph, def.next)
    if (next && next !== def.id) record.nextStyleId = next
    paragraphStyles.push(record)
  }
  for (const def of styles.character.values()) {
    if (NO_CHARACTER_STYLE.test(def.key)) continue
    const settings = characterPart(def.patch) as CharacterStyleSettings
    const record: CharacterStyleRecord = { id: def.id, name: def.name, patch: settings }
    const basedOn = idByKey(styles.character, def.basedOn)
    if (basedOn && !NO_CHARACTER_STYLE.test(def.basedOn ?? '')) record.basedOnId = basedOn
    characterStyles.push(record)
  }

  const content: DocContent = {
    doc,
    layerOrder: layerOrder.length ? layerOrder : ['layer-1'],
    layers,
    frames,
    images,
    shapes,
    assets,
    guides: [],
    paragraphStyles,
    characterStyles,
    parents,
    pageParents,
    sections: [],
    colorSamples: samples,
  }
  return { content, notes: [...ctx.notes] }
}

export async function readIdmlFile(file: File): Promise<DocContent> {
  return (await readIdmlWithNotes(file)).content
}

export function idmlToDocumentText(content: DocContent): string {
  return serializeDocument(content)
}
