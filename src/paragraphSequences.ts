import type { ParagraphSequence } from './document'

/**
 * Paragraph sequences (רצפי פסקאות): "the first paragraph is a heading, the second a sub-heading, then body text and quotation
 * in turn, and the last one a signature". A sequence says which paragraph style a paragraph gets by its place in a run of
 * paragraphs; applying it to a story (or to the paragraphs selected) gives every paragraph its style in one step.
 * Pure data and functions, no browser.
 */

export const MAX_SEQUENCES = 30
export const MAX_SEQUENCE_STEPS = 40
/** the most paragraphs `learnSequence` reads (the search for a repeating pattern grows quickly with their number) */
export const LEARN_LIMIT = 60

export type SequenceParts = Pick<ParagraphSequence, 'start' | 'middle' | 'end'>

/**
 * The style every paragraph gets, by place (undefined: the paragraph is left as it is). `texts` are the paragraphs in order. The
 * first paragraphs get `start` in order, the last ones `end`, the rest go through `middle` over and over. With `skipEmpty` an empty
 * paragraph is not counted and keeps its style. A part that is longer than the run is cut: the start has the first claim.
 */
export function assignSequence(texts: string[], sequence: SequenceParts & Pick<ParagraphSequence, 'skipEmpty'>): (string | undefined)[] {
  const skip = sequence.skipEmpty !== false
  const counted = texts.flatMap((text, index) => (skip && text.trim() === '' ? [] : [index]))
  const n = counted.length
  const startCount = Math.min(sequence.start.length, n)
  const endCount = Math.min(sequence.end.length, n - startCount)
  const out: (string | undefined)[] = texts.map(() => undefined)
  counted.forEach((paragraph, place) => {
    if (place < startCount) out[paragraph] = sequence.start[place]
    else if (place >= n - endCount) out[paragraph] = sequence.end[sequence.end.length - (n - place)]
    else if (sequence.middle.length > 0) out[paragraph] = sequence.middle[(place - startCount) % sequence.middle.length]
  })
  return out
}

/**
 * The sequence an example shows: the styles of its paragraphs in order give the start, the pattern that repeats (at least twice, whole)
 * in the middle and the end. The longest stretch of repeats is taken (A B B C B B C D is A, then B B C twice, then D); with none, all
 * but the last paragraph are the start and the last one repeats.
 */
export function learnSequence(ids: string[]): SequenceParts {
  const n = Math.min(ids.length, LEARN_LIMIT)
  const list = ids.slice(0, n)
  if (n === 0) return { start: [], middle: [], end: [] }
  let best: { s: number; e: number; p: number; length: number } | null = null
  for (let s = 0; s < n; s++) {
    for (let e = 0; s + e < n; e++) {
      const length = n - s - e
      if (length < 2) break
      if (best && length < best.length) break // shorter and shorter from here on: nothing better for this start
      for (let p = 1; p <= length / 2; p++) {
        if (length % p !== 0) continue
        let repeats = true
        for (let i = p; i < length && repeats; i++) repeats = list[s + i] === list[s + i - p]
        if (!repeats) continue
        if (!best || length > best.length || (length === best.length && p < best.p)) best = { s, e, p, length }
        break
      }
    }
  }
  if (!best) return { start: list.slice(0, n - 1), middle: [list[n - 1]], end: [] }
  return { start: list.slice(0, best.s), middle: list.slice(best.s, best.s + best.p), end: list.slice(n - best.e) }
}

/** the sequence with the styles that are not in `known` taken out of it */
export function withoutMissingStyles(sequence: ParagraphSequence, known: ReadonlySet<string>): ParagraphSequence {
  const keep = (part: string[]) => part.filter((id) => known.has(id))
  return { ...sequence, start: keep(sequence.start), middle: keep(sequence.middle), end: keep(sequence.end) }
}

/** a sequence in a line: "כותרת › גוף ↻ › חתימה" (the names of the styles, the repeating part marked) */
export function describeSequence(sequence: SequenceParts, nameOf: (id: string) => string): string {
  const names = (part: string[]) => part.map(nameOf).join(' › ')
  const parts = [
    sequence.start.length ? names(sequence.start) : '',
    sequence.middle.length ? `(${names(sequence.middle)}) ↻` : '',
    sequence.end.length ? names(sequence.end) : '',
  ].filter(Boolean)
  return parts.join(' › ')
}

/** the sequences with the styles of a deleted paragraph style taken out */
export function sequencesWithoutStyle(sequences: ParagraphSequence[], styleId: string): ParagraphSequence[] {
  if (!sequences.some((sequence) => [...sequence.start, ...sequence.middle, ...sequence.end].includes(styleId))) return sequences
  const drop = (part: string[]) => part.filter((id) => id !== styleId)
  return sequences.map((sequence) => ({ ...sequence, start: drop(sequence.start), middle: drop(sequence.middle), end: drop(sequence.end) }))
}
