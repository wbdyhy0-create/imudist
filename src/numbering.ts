import type { NumberFormat, PageSection, Run } from './document'

/**
 * Automatic page numbering: a document page's displayed number/label, in whichever format its section (if any)
 * uses, and the mechanism that writes that label into a parent page's text wherever it placed the auto-page-number
 * marker (see document.ts's PAGE_NUMBER_MARKER for how that marker gets there in the first place).
 */

const HEB_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const HEB_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const HEB_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']

/** Hebrew numeral (גימטריה): 1→א, 10→י, 15→ט״ו and 16→ט״ז instead of spelling forms of God's name, 100→ק… */
function toHebrewNumeral(n: number): string {
  if (n <= 0 || n >= 1000) return String(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const tensOnes = rest === 15 ? 'טו' : rest === 16 ? 'טז' : HEB_TENS[Math.floor(rest / 10)] + HEB_ONES[rest % 10]
  return (HEB_HUNDREDS[hundreds] ?? '') + tensOnes
}

const ROMAN_TABLE: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

/** Upper-case Roman numeral: 1→I, 4→IV, 9→IX, 2024→MMXXIV… */
function toRoman(n: number): string {
  if (n <= 0) return String(n)
  let rest = n
  let out = ''
  for (const [value, sign] of ROMAN_TABLE) {
    while (rest >= value) {
      out += sign
      rest -= value
    }
  }
  return out
}

/** Upper-case Latin letters, the way spreadsheet columns count: 1→A, 26→Z, 27→AA, 28→AB… */
function toLatinLetters(n: number): string {
  if (n <= 0) return String(n)
  let rest = n
  let out = ''
  while (rest > 0) {
    rest--
    out = String.fromCharCode(65 + (rest % 26)) + out
    rest = Math.floor(rest / 26)
  }
  return out
}

/** `n` (a 1-based count within its section, never the raw page index) written in the given format. */
export function formatPageNumber(n: number, format: NumberFormat): string {
  switch (format) {
    case 'decimal':
      return String(n)
    case 'hebrew':
      return toHebrewNumeral(n)
    case 'roman-upper':
      return toRoman(n)
    case 'roman-lower':
      return toRoman(n).toLowerCase()
    case 'latin-upper':
      return toLatinLetters(n)
    case 'latin-lower':
      return toLatinLetters(n).toLowerCase()
  }
}

/**
 * The label shown on a given physical page (0-based `pageIndex`): its section's prefix + the page's 1-based count
 * within that section, in that section's format - or, with no section covering it, the document's own plain
 * decimal numbering (`docStartPage + pageIndex`), exactly like before sections existed.
 */
export function pageNumberLabel(sections: PageSection[], pageIndex: number, docStartPage: number): string {
  const applicable = sections.filter((s) => s.startPage <= pageIndex).sort((a, b) => b.startPage - a.startPage)[0]
  if (!applicable) return String(docStartPage + pageIndex)
  const n = pageIndex - applicable.startPage + 1
  return applicable.prefix + formatPageNumber(n, applicable.format)
}

/**
 * Every occurrence of `marker` in `text` replaced with `label`, adjusting `runs` (which must cover `text` exactly)
 * so they still do: the run a marker sat in just grows or shrinks by the length difference and keeps its own
 * style, since the label is meant to look like whatever the marker itself was styled as - a run is never split
 * (the marker is one character, so it can never straddle two runs to begin with).
 */
export function substituteMarker(text: string, runs: Run[], marker: string, label: string): { text: string; runs: Run[] } {
  if (!text.includes(marker)) return { text, runs }
  let out = ''
  const outRuns: Run[] = []
  let at = 0
  for (const run of runs) {
    const seg = text.slice(at, at + run.len).split(marker).join(label)
    out += seg
    outRuns.push({ ...run, len: seg.length })
    at += run.len
  }
  return { text: out, runs: outRuns }
}
