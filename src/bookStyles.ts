import { DEFAULT_FOOTNOTE_CONFIG, type CharacterStyleRecord, type ColorSample, type ParagraphStyleRecord, type TextFrame } from './document'
import { restyleForCharacterChange, restyleForParagraphChange, type StyleEnv } from './styleApply'

/** What a book keeps the same in every chapter: the paragraph styles, the character styles and the colours. */
export interface StyleSet {
  paragraphStyles: ParagraphStyleRecord[]
  characterStyles: CharacterStyleRecord[]
  colorSamples: ColorSample[]
}

/** What a sync does, by name. A style is matched by its name: the same name is the same style, whatever its id. */
export interface SyncReport {
  addedParagraph: string[]
  updatedParagraph: string[]
  addedCharacter: string[]
  updatedCharacter: string[]
  addedColors: string[]
}

export const emptyReport = (): SyncReport => ({ addedParagraph: [], updatedParagraph: [], addedCharacter: [], updatedCharacter: [], addedColors: [] })
export const reportCount = (report: SyncReport) => Object.values(report).reduce((sum, list) => sum + list.length, 0)

/** JSON with the keys in order, to compare two records no matter how they were built */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** the id a style of the master has in the target: that of the style with its name there, or a new one (its own where it is free) */
function idMapOf(master: { id: string; name: string }[], target: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  const used = new Set(target.map((style) => style.id))
  for (const style of master) {
    const same = target.find((candidate) => candidate.name === style.name)
    if (same) {
      map.set(style.id, same.id)
      continue
    }
    let id = style.id
    for (let n = 2; used.has(id); n++) id = `${style.id}-${n}`
    used.add(id)
    map.set(style.id, id)
  }
  return map
}

function withoutUndefined<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T
}

/** the master's character styles as they would stand in the target (the ids and the "based on" links of the target's) */
const characterTarget = (master: CharacterStyleRecord[], ids: Map<string, string>): CharacterStyleRecord[] =>
  master.map((style) => withoutUndefined({ ...style, id: ids.get(style.id)!, basedOnId: style.basedOnId ? ids.get(style.basedOnId) : undefined }))

const paragraphTarget = (master: ParagraphStyleRecord[], ids: Map<string, string>, characterIds: Map<string, string>): ParagraphStyleRecord[] =>
  master.map((style) => withoutUndefined({
    ...style,
    id: ids.get(style.id)!,
    basedOnId: style.basedOnId ? ids.get(style.basedOnId) : undefined,
    nextStyleId: style.nextStyleId ? ids.get(style.nextStyleId) : undefined,
    nested: style.nested?.map((rule) => ({ ...rule, styleId: characterIds.get(rule.styleId) ?? rule.styleId })),
    layers: style.layers?.map((rule) => ({
      ...rule,
      styleId: characterIds.get(rule.styleId) ?? rule.styleId,
      ...(rule.onlyWithStyleId ? { onlyWithStyleId: characterIds.get(rule.onlyWithStyleId) ?? rule.onlyWithStyleId } : {}),
    })),
  }))

const sameRecord = (a: object, b: object) => stableJson({ ...a, id: undefined }) === stableJson({ ...b, id: undefined })

/** What syncing the target with the master would do, without doing it. */
export function planStyleSync(master: StyleSet, target: StyleSet): SyncReport {
  const report = emptyReport()
  const characterIds = idMapOf(master.characterStyles, target.characterStyles)
  const paragraphIds = idMapOf(master.paragraphStyles, target.paragraphStyles)
  for (const wanted of characterTarget(master.characterStyles, characterIds)) {
    const have = target.characterStyles.find((style) => style.id === wanted.id)
    if (!have) report.addedCharacter.push(wanted.name)
    else if (!sameRecord(have, wanted)) report.updatedCharacter.push(wanted.name)
  }
  for (const wanted of paragraphTarget(master.paragraphStyles, paragraphIds, characterIds)) {
    const have = target.paragraphStyles.find((style) => style.id === wanted.id)
    if (!have) report.addedParagraph.push(wanted.name)
    else if (!sameRecord(have, wanted)) report.updatedParagraph.push(wanted.name)
  }
  const colors = new Set(target.colorSamples.map((sample) => sample.color.toLowerCase()))
  for (const sample of master.colorSamples) if (!colors.has(sample.color.toLowerCase())) report.addedColors.push(sample.label || sample.color)
  return report
}

export interface SyncedContent extends StyleSet {
  frames: TextFrame[]
  report: SyncReport
}

/**
 * The target's styles brought into line with the master's: styles it does not have are added, those with the same name are
 * overwritten with the master's definition (and the text that is in them written again, as when a style is edited),
 * and nothing is taken away - a style only the target has stays. Colours the target lacks are added.
 */
export function syncStyles(master: StyleSet, target: StyleSet & { frames: TextFrame[]; footnoteConfig?: StyleEnv['footnoteConfig'] }): SyncedContent {
  const env: StyleEnv = { footnoteConfig: target.footnoteConfig ?? DEFAULT_FOOTNOTE_CONFIG }
  const report = planStyleSync(master, target)
  const characterIds = idMapOf(master.characterStyles, target.characterStyles)
  const paragraphIds = idMapOf(master.paragraphStyles, target.paragraphStyles)
  let frames = target.frames

  // character styles: the new ones are added (nothing uses them yet), the others replaced one by one, the text following each
  let characters = target.characterStyles
  const wantedCharacters = characterTarget(master.characterStyles, characterIds)
  const freshCharacters = wantedCharacters.filter((style) => !characters.some((have) => have.id === style.id))
  characters = [...characters, ...freshCharacters]
  for (const wanted of wantedCharacters) {
    const have = characters.find((style) => style.id === wanted.id)
    if (!have || sameRecord(have, wanted) || freshCharacters.includes(wanted)) continue
    const after = characters.map((style) => (style.id === wanted.id ? wanted : style))
    frames = restyleForCharacterChange(frames, target.paragraphStyles, characters, after, wanted.id, env)
    characters = after
  }

  // paragraph styles: the same, with the character styles they point at already in place
  let paragraphs = target.paragraphStyles
  const wantedParagraphs = paragraphTarget(master.paragraphStyles, paragraphIds, characterIds)
  const freshParagraphs = wantedParagraphs.filter((style) => !paragraphs.some((have) => have.id === style.id))
  paragraphs = [...paragraphs, ...freshParagraphs]
  for (const wanted of wantedParagraphs) {
    const have = paragraphs.find((style) => style.id === wanted.id)
    if (!have || sameRecord(have, wanted) || freshParagraphs.includes(wanted)) continue
    const after = paragraphs.map((style) => (style.id === wanted.id ? wanted : style))
    frames = restyleForParagraphChange(frames, paragraphs, after, characters, wanted.id, env)
    paragraphs = after
  }

  // colours
  const colors = target.colorSamples.slice()
  const have = new Set(colors.map((sample) => sample.color.toLowerCase()))
  for (const sample of master.colorSamples) {
    if (have.has(sample.color.toLowerCase())) continue
    have.add(sample.color.toLowerCase())
    let id = sample.id
    for (let n = 2; colors.some((existing) => existing.id === id); n++) id = `${sample.id}-${n}`
    colors.push({ ...sample, id })
  }

  return { frames, paragraphStyles: paragraphs, characterStyles: characters, colorSamples: colors, report }
}
