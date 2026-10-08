/**
 * Hebrew that a file keeps in an old way: Windows-1255 bytes shown as Latin letters ("úéáéø" for "תיבית"), and in visual order
 * (the last letter first), as old programs and PDF converters wrote it. Word shows such a file as it is - as nonsense - so
 * the text is put right when it is read: the letters are decoded and the paragraph is turned round, and it reads as Hebrew.
 */

const HEBREW_LETTER = /[֐-׿]/
const ASCII_LETTER = /[A-Za-z]/
/** the letters of Windows-1255 (aleph ... tav) seen as Latin-1 characters */
const LEGACY_LETTER = /[à-ú]/g
/** everything such a paragraph can hold: the letters, the niqqud and the punctuation marks of Windows-1255 as Latin-1 saw them, digits, spaces and plain punctuation */
const ONLY_LEGACY = /^[\sà-úÀ-Ó0-9.,:;!?'"()[\]{}<>\-–—·„‰‹›‘’“”•…]*$/

/** the pairs of characters that a right-to-left text shows mirrored */
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }
export const mirrorBracket = (char: string) => MIRROR[char] ?? char

let windows1252: Map<string, number> | null = null
function byteOfLatin(char: string): number | undefined {
  if (!windows1252) {
    windows1252 = new Map()
    const decoder = new TextDecoder('windows-1252')
    for (let byte = 0; byte < 256; byte++) windows1252.set(decoder.decode(new Uint8Array([byte])), byte)
  }
  return windows1252.get(char)
}

/** does this text look like Windows-1255 Hebrew seen as Latin letters: at least two Hebrew letters' worth, and nothing that is real Hebrew or English */
export function looksLikeLegacyHebrew(text: string): boolean {
  if (HEBREW_LETTER.test(text) || ASCII_LETTER.test(text) || !ONLY_LEGACY.test(text)) return false
  return (text.match(LEGACY_LETTER)?.length ?? 0) >= 2
}

/** one character as the Hebrew it stands for (a character with no Hebrew meaning stays as it is) */
export function legacyChar(char: string): string {
  const byte = byteOfLatin(char)
  if (byte === undefined || byte < 0x80) return char
  const decoded = new TextDecoder('windows-1255').decode(new Uint8Array([byte]))
  return decoded.length === 1 && decoded !== '�' ? decoded : char
}

/**
 * The pieces of a paragraph (a text with whatever goes with it, such as its style) turned from visual Latin-1 into logical
 * Hebrew: the characters are decoded and put in reading order, brackets are mirrored back, and numbers keep their digits in
 * order. The pieces keep what they carry: a piece with the style of a letter goes with that letter to where it lands.
 */
export function legacyHebrewPieces<T>(pieces: { text: string; style: T }[]): { text: string; style: T }[] {
  const chars: { char: string; style: T }[] = []
  for (const piece of pieces) for (const char of piece.text) chars.push({ char, style: piece.style })
  chars.reverse()
  for (const entry of chars) entry.char = mirrorBracket(legacyChar(entry.char))
  // a number written in visual order was turned round with the rest: turn it back (a . or , between digits belongs to it)
  const digit = (index: number) => /[0-9]/.test(chars[index]?.char ?? '')
  for (let i = 0; i < chars.length; ) {
    if (!digit(i)) {
      i++
      continue
    }
    let end = i
    while (end < chars.length && (digit(end) || (/[.,]/.test(chars[end].char) && digit(end - 1) && digit(end + 1)))) end++
    const number = chars.slice(i, end).reverse()
    for (let k = 0; k < number.length; k++) chars[i + k] = number[k]
    i = end
  }
  const out: { text: string; style: T }[] = []
  for (const entry of chars) {
    const last = out[out.length - 1]
    if (last && last.style === entry.style) last.text += entry.char
    else out.push({ text: entry.char, style: entry.style })
  }
  return out
}
