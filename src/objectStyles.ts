import type { ImageFrame, ObjectStyleRecord, ObjectStyleSettings, ShapeFrame } from './document'

/**
 * Object styles: a named look for pictures and shapes. The settings of the style are written into the object (the way a
 * paragraph style's are written into its paragraphs) and the object keeps the id of the style, so that a change of the
 * style reaches every object that follows it.
 */

/** every setting a style can hold, in the order the panel shows them */
export const OBJECT_STYLE_KEYS: (keyof ObjectStyleSettings)[] = [
  'fill', 'fillGradient', 'stroke', 'strokeWidth', 'strokeDash', 'strokeCap', 'radius', 'opacity', 'blendMode', 'shadow', 'feather', 'arrowStart', 'arrowEnd', 'lineWidths',
]

/** what a picture can take of a style: the rest means nothing to it */
export const IMAGE_STYLE_KEYS: (keyof ObjectStyleSettings)[] = ['opacity', 'blendMode', 'shadow', 'feather']

/** the settings that belong to lines only */
const LINE_KEYS: (keyof ObjectStyleSettings)[] = ['arrowStart', 'arrowEnd', 'lineWidths']

/** the settings a shape of this kind takes */
export function shapeStyleKeys(shape: Pick<ShapeFrame, 'kind'>): (keyof ObjectStyleSettings)[] {
  if (shape.kind === 'line') return OBJECT_STYLE_KEYS.filter((key) => key !== 'fill' && key !== 'fillGradient' && key !== 'radius')
  if (shape.kind === 'table') return ['opacity', 'blendMode', 'shadow', 'feather']
  return OBJECT_STYLE_KEYS.filter((key) => !LINE_KEYS.includes(key) && (key !== 'radius' || shape.kind === 'rect'))
}

const hasShadow = (o: { shadowOpacity?: number }) => (o.shadowOpacity ?? 0) > 0
const shadowOf = (o: { shadowOffsetX?: number; shadowOffsetY?: number; shadowOffset?: number; shadowColor?: string; shadowOpacity?: number }): ObjectStyleSettings['shadow'] =>
  hasShadow(o) ? { offsetX: o.shadowOffsetX ?? 0, offsetY: o.shadowOffsetY ?? o.shadowOffset ?? 6, color: o.shadowColor ?? '#000000', opacity: o.shadowOpacity ?? 0 } : null

/** how a shape looks, in the terms of a style: the start of a style made from it */
export function lookOfShape(shape: ShapeFrame): ObjectStyleSettings {
  const out: ObjectStyleSettings = {}
  for (const key of shapeStyleKeys(shape)) {
    switch (key) {
      case 'fill': out.fill = shape.fill; break
      case 'fillGradient': out.fillGradient = shape.fillGradient ?? null; break
      case 'stroke': out.stroke = shape.stroke; break
      case 'strokeWidth': out.strokeWidth = shape.strokeWidth; break
      case 'strokeDash': out.strokeDash = shape.strokeDash === 'dashed' ? 'dashed' : 'solid'; break
      case 'strokeCap': out.strokeCap = shape.strokeCap ?? 'butt'; break
      case 'radius': out.radius = shape.radii?.[0] ?? 0; break
      case 'opacity': out.opacity = shape.opacity ?? 1; break
      case 'blendMode': out.blendMode = shape.blendMode ?? null; break
      case 'shadow': out.shadow = shadowOf(shape); break
      case 'feather': out.feather = shape.feather ?? null; break
      case 'arrowStart': out.arrowStart = shape.arrowStart ?? null; break
      case 'arrowEnd': out.arrowEnd = shape.arrowEnd ?? null; break
      case 'lineWidths': out.lineWidths = shape.lineWidths ?? null; break
    }
  }
  return out
}

export function lookOfImage(image: ImageFrame): ObjectStyleSettings {
  return { opacity: image.opacity ?? 1, blendMode: image.blendMode ?? null, shadow: shadowOf(image), feather: image.feather ?? null }
}

type Shadowed = { shadowOffsetX?: number; shadowOffsetY?: number; shadowOffset?: number; shadowColor?: string; shadowOpacity?: number }

/** writes a shadow setting into an object (null = no shadow) */
function withShadow<T extends Shadowed>(object: T, shadow: NonNullable<ObjectStyleSettings['shadow']> | null): T {
  const { shadowOffsetX: _x, shadowOffsetY: _y, shadowOffset: _o, shadowColor: _c, shadowOpacity: _a, ...rest } = object
  if (!shadow || shadow.opacity <= 0) return rest as T
  return { ...rest, shadowOffsetX: shadow.offsetX, shadowOffsetY: shadow.offsetY, shadowColor: shadow.color, shadowOpacity: shadow.opacity } as T
}

/** the shape with the style's settings written into it, and the style's id on it */
export function applyToShape(shape: ShapeFrame, settings: ObjectStyleSettings, styleId?: string): ShapeFrame {
  const takes = new Set(shapeStyleKeys(shape))
  let out: ShapeFrame = { ...shape }
  const set = <K extends keyof ShapeFrame>(key: K, value: ShapeFrame[K] | undefined) => {
    if (value === undefined) delete out[key]
    else out[key] = value as ShapeFrame[K]
  }
  for (const key of OBJECT_STYLE_KEYS) {
    if (!(key in settings) || !takes.has(key)) continue
    switch (key) {
      case 'fill': set('fill', settings.fill ?? null); break
      case 'fillGradient': set('fillGradient', settings.fillGradient ?? undefined); break
      case 'stroke': set('stroke', settings.stroke ?? null); break
      case 'strokeWidth': set('strokeWidth', Math.max(0, settings.strokeWidth ?? 0)); break
      case 'strokeDash': set('strokeDash', settings.strokeDash === 'dashed' ? 'dashed' : undefined); break
      case 'strokeCap': set('strokeCap', settings.strokeCap && settings.strokeCap !== 'butt' ? settings.strokeCap : undefined); break
      case 'radius': {
        const radius = Math.max(0, settings.radius ?? 0)
        set('radii', radius > 0 ? [radius, radius, radius, radius] : undefined)
        break
      }
      case 'opacity': set('opacity', settings.opacity !== undefined && settings.opacity < 1 ? Math.max(0, settings.opacity) : undefined); break
      case 'blendMode': set('blendMode', settings.blendMode ?? undefined); break
      case 'shadow': out = withShadow(out, settings.shadow ?? null); break
      case 'feather': set('feather', settings.feather ?? undefined); break
      case 'arrowStart': set('arrowStart', settings.arrowStart ?? undefined); break
      case 'arrowEnd': set('arrowEnd', settings.arrowEnd ?? undefined); break
      case 'lineWidths': set('lineWidths', settings.lineWidths ?? undefined); break
    }
  }
  if (styleId) out.objectStyleId = styleId
  return out
}

export function applyToImage(image: ImageFrame, settings: ObjectStyleSettings, styleId?: string): ImageFrame {
  let out: ImageFrame = { ...image }
  if ('opacity' in settings) {
    if (settings.opacity !== undefined && settings.opacity < 1) out.opacity = Math.max(0, settings.opacity)
    else delete out.opacity
  }
  if ('blendMode' in settings) {
    if (settings.blendMode) out.blendMode = settings.blendMode
    else delete out.blendMode
  }
  if ('shadow' in settings) out = withShadow(out, settings.shadow ?? null)
  if ('feather' in settings) {
    if (settings.feather) out.feather = settings.feather
    else delete out.feather
  }
  if (styleId) out.objectStyleId = styleId
  return out
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** the settings of the style that the object does not have as the style says (the object was changed by hand after it got the style) */
export function objectStyleOverrides(object: ShapeFrame | ImageFrame, settings: ObjectStyleSettings): (keyof ObjectStyleSettings)[] {
  const isShape = 'kind' in object
  const look = isShape ? lookOfShape(object) : lookOfImage(object)
  const keys = isShape ? shapeStyleKeys(object) : IMAGE_STYLE_KEYS
  return keys.filter((key) => key in settings && !sameJson(normalize(key, look[key]), normalize(key, settings[key])))
}

/** a setting as it is compared: a missing value and the plain one are the same (no dash is solid, no gradient is null) */
function normalize(key: keyof ObjectStyleSettings, value: unknown): unknown {
  if (value === undefined) return key === 'opacity' ? 1 : key === 'strokeDash' ? 'solid' : key === 'strokeCap' ? 'butt' : key === 'radius' ? 0 : null
  if (key === 'shadow' && value && typeof value === 'object' && (value as { opacity: number }).opacity <= 0) return null
  return value
}

/** the style a new one is named after, never the same as another's */
export function uniqueObjectStyleName(styles: ObjectStyleRecord[], wanted: string): string {
  const names = new Set(styles.map((style) => style.name))
  if (!names.has(wanted)) return wanted
  for (let n = 2; ; n++) {
    const name = `${wanted} ${n}`
    if (!names.has(name)) return name
  }
}

/** the object without the style it followed: it keeps the look it has */
export function withoutObjectStyle<T extends { objectStyleId?: string }>(object: T): T {
  if (object.objectStyleId === undefined) return object
  const { objectStyleId: _id, ...rest } = object
  return rest as T
}

/**
 * Does the style draw anything when it is a decoration: a drawing, a fill, a line, a shadow, or a line with heads? A style made from
 * a picture before pictures kept their drawing holds only its see-through and mixing - nothing to draw.
 */
export function objectStyleVisible(style: Pick<ObjectStyleRecord, 'settings' | 'graphic'>): boolean {
  if (style.graphic) return true
  const s = style.settings
  return !!s.fill || !!s.fillGradient || !!s.feather || (!!s.stroke && (s.strokeWidth ?? 1) > 0) || !!s.arrowStart || !!s.arrowEnd || !!s.lineWidths || (!!s.shadow && s.shadow.opacity > 0)
}

/** a drawing too big to be a decoration: it is read through a CSS value, which Chromium cuts at about 2 MB */
export const MAX_GRAPHIC_SVG = 1_200_000
