import type { CharacterStyleRecord, CharacterStyleSettings, ParagraphStyleRecord } from './document'

/**
 * Character styles can be based on one another: a style sets only what it names itself, and takes the rest from the style
 * it is based on (and that one from its own). The functions here work out what a style comes to, who depends on whom, and
 * how styles from another document are merged in.
 */

/** what a style comes to: the settings of the styles it is based on, under its own (a loop in the chain is cut where it closes) */
export function resolveCharacterPatch(records: CharacterStyleRecord[], id: string, seen: ReadonlySet<string> = new Set()): CharacterStyleSettings {
  const style = records.find((record) => record.id === id)
  if (!style || seen.has(id)) return {}
  const inherited = style.basedOnId ? resolveCharacterPatch(records, style.basedOnId, new Set(seen).add(id)) : {}
  return { ...inherited, ...style.patch }
}

/** every style with its settings replaced by what it comes to, ready for the functions that write a style into text */
export function resolvedRecords(records: CharacterStyleRecord[]): CharacterStyleRecord[] {
  if (!records.some((record) => record.basedOnId)) return records
  return records.map((record) => (record.basedOnId ? { ...record, patch: resolveCharacterPatch(records, record.id) } : record))
}

/** the styles that depend on `id`, directly or through others */
export function descendantsOf(records: CharacterStyleRecord[], id: string): string[] {
  const found: string[] = []
  const visit = (parent: string) => {
    for (const record of records) {
      if (record.basedOnId === parent && record.id !== id && !found.includes(record.id)) {
        found.push(record.id)
        visit(record.id)
      }
    }
  }
  visit(id)
  return found
}

/** whether `id` may be based on `baseId`: not on itself, and not on a style that depends on it (that would close a loop) */
export const canBeBasedOn = (records: CharacterStyleRecord[], id: string, baseId: string): boolean =>
  baseId !== id && !descendantsOf(records, id).includes(baseId) && records.some((record) => record.id === baseId)

/**
 * The styles after `id` is deleted. A style that was based on it is based on what it was based on instead, and keeps the
 * settings it got from it, so no text changes its look.
 */
export function withoutCharacterStyle(records: CharacterStyleRecord[], id: string): CharacterStyleRecord[] {
  const gone = records.find((record) => record.id === id)
  if (!gone) return records
  return records
    .filter((record) => record.id !== id)
    .map((record) => {
      if (record.basedOnId !== id) return record
      const { basedOnId: _removed, ...rest } = record
      return { ...rest, ...(gone.basedOnId ? { basedOnId: gone.basedOnId } : {}), patch: { ...gone.patch, ...record.patch } }
    })
}

/** the styles with a `basedOnId` that points nowhere, at itself, or round a loop taken away */
export function repairBasedOn(records: CharacterStyleRecord[]): CharacterStyleRecord[] {
  const ids = new Set(records.map((record) => record.id))
  const valid = (record: CharacterStyleRecord) => {
    const seen = new Set<string>([record.id])
    for (let at = record.basedOnId; at; at = records.find((r) => r.id === at)?.basedOnId) {
      if (!ids.has(at) || seen.has(at)) return false
      seen.add(at)
    }
    return true
  }
  return records.map((record) => {
    if (!record.basedOnId || valid(record)) return record
    const { basedOnId: _dropped, ...rest } = record
    return rest
  })
}

/**
 * Character styles of another document brought into this one. Every one is added - under a name nobody else has - with a
 * new id; `idMap` says which new id each old one became, for whatever points at them (nested styles, other styles).
 */
export function mergeCharacterStyles(current: CharacterStyleRecord[], imported: CharacterStyleRecord[]): { styles: CharacterStyleRecord[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  if (!imported.length) return { styles: current, idMap }
  const usedNames = new Set(current.map((style) => style.name))
  const usedIds = new Set(current.map((style) => style.id))
  const uniqueName = (name: string) => {
    if (!usedNames.has(name)) return name
    let n = 2
    while (usedNames.has(`${name} ${n}`)) n++
    return `${name} ${n}`
  }
  const stamp = Date.now()
  const renamed = imported.map((style, index) => {
    const name = uniqueName(style.name)
    usedNames.add(name)
    let id = `character-style-import-${stamp}-${index}`
    while (usedIds.has(id)) id += 'x'
    usedIds.add(id)
    idMap.set(style.id, id)
    return { ...style, id, name }
  })
  const remapped = renamed.map(({ basedOnId, ...style }) => ({ ...style, ...(basedOnId && idMap.has(basedOnId) ? { basedOnId: idMap.get(basedOnId) } : {}) }))
  return { styles: [...current, ...remapped], idMap }
}

/** paragraph styles whose nested rules and style layers point at character styles by their old ids, pointed at the new ones */
export function remapNestedStyles(styles: ParagraphStyleRecord[], idMap: ReadonlyMap<string, string>): ParagraphStyleRecord[] {
  if (idMap.size === 0) return styles
  const moved = (id: string) => idMap.get(id) ?? id
  return styles.map((style) => {
    if (!style.nested?.length && !style.layers?.length) return style
    return {
      ...style,
      ...(style.nested?.length ? { nested: style.nested.map((rule) => ({ ...rule, styleId: moved(rule.styleId) })) } : {}),
      ...(style.layers?.length ? { layers: style.layers.map((rule) => ({ ...rule, styleId: moved(rule.styleId), ...(rule.onlyWithStyleId ? { onlyWithStyleId: moved(rule.onlyWithStyleId) } : {}) })) } : {}),
    }
  })
}

/** the settings of a style that its base does not already give it the same value for: what is really its own */
export function ownSettings(records: CharacterStyleRecord[], id: string): CharacterStyleSettings {
  const style = records.find((record) => record.id === id)
  if (!style) return {}
  const inherited = style.basedOnId ? resolveCharacterPatch(records, style.basedOnId) : {}
  const own: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(style.patch)) if ((inherited as Record<string, unknown>)[key] !== value) own[key] = value
  return own as CharacterStyleSettings
}
