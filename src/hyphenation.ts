import { hyphenateSync } from 'hyphen/en-us'
import { SOFT_HYPHEN } from './softHyphens'

/** a stretch of letters of an alphabet that has hyphenation rules here (English, and the Latin letters of other languages that follow it) */
const WORD = /[A-Za-zÀ-ɏ­]{5,}/g

/** the characters that tell a word is part of an address, a path or a name of something, and not a word to break */
const NOT_A_WORD_BEFORE = /[/@#_\\.]$/
const NOT_A_WORD_AFTER = /^[/@_\\]|^\.[A-Za-z0-9]/

export interface HyphenationOptions {
  /** hyphenate words that start with a capital letter (names, the first word of a sentence) and words in capitals; off by default */
  capitalized?: boolean
  /** the shortest word that gets a hyphen, in letters */
  minWordLength?: number
}

/**
 * The places in `text` where a soft hyphen can be put: character offsets, ascending, each the place before which the
 * hyphen goes. Words that have a soft hyphen already (the writer's own) are left as they are.
 */
export function hyphenationPoints(text: string, options: HyphenationOptions = {}): number[] {
  const minWordLength = Math.max(4, options.minWordLength ?? 6)
  const points: number[] = []
  WORD.lastIndex = 0
  for (let match = WORD.exec(text); match; match = WORD.exec(text)) {
    const word = match[0]
    const start = match.index
    if (word.length < minWordLength || word.includes(SOFT_HYPHEN)) continue
    if (!options.capitalized && /^[A-ZÀ-Þ]/.test(word)) continue
    if (NOT_A_WORD_BEFORE.test(text.slice(Math.max(0, start - 1), start)) || NOT_A_WORD_AFTER.test(text.slice(start + word.length, start + word.length + 2))) continue
    const hyphenated = hyphenateSync(word, { minWordLength })
    if (hyphenated === word) continue
    let offset = 0
    for (let i = 0; i < hyphenated.length; i++) {
      if (hyphenated[i] === SOFT_HYPHEN) points.push(start + offset)
      else offset++
    }
  }
  return points
}

/** the places of the soft hyphens that are in `text` (to take them out again): the offset of each of them */
export function softHyphenOffsets(text: string): number[] {
  const offsets: number[] = []
  for (let i = text.indexOf(SOFT_HYPHEN); i >= 0; i = text.indexOf(SOFT_HYPHEN, i + 1)) offsets.push(i)
  return offsets
}
