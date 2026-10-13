/** A place where a word may be broken at the end of a line (it shows as a hyphen there, and not at all anywhere else). */
export const SOFT_HYPHEN = '­'

/** the text as it is read, written, searched: what is only there for the line break is not a character of it */
export const withoutSoftHyphens = (text: string) => (text.includes(SOFT_HYPHEN) ? text.split(SOFT_HYPHEN).join('') : text)

/**
 * The soft hyphens of an exported page, written out: one that the line was really broken at becomes a hyphen, and every other is
 * taken away. The browser draws the hyphen of a break by itself, with no character of the text behind it - what a page is made into
 * (letters written to the PDF, or a picture of the text) does not have it - so the page is given the character.
 *
 * A soft hyphen was broken at when the browser drew it: its box has a width (it has none when it is not drawn). The box of the
 * letter after it is not to be trusted for this - the browser gives that letter the box of the hyphen as well, as its first -
 * so the letters on both sides are compared by their own (last) box as a second sign. The page has to be laid out (attached to
 * the document).
 */
export function materializeSoftHyphens(root: HTMLElement): void {
  const nodes: Text[] = []
  const first = new Map<Text, number>()
  const chars: { node: Text; index: number }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let any = false
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.data.includes(SOFT_HYPHEN)) any = true
    nodes.push(node)
    first.set(node, chars.length)
    for (let index = 0; index < node.data.length; index++) chars.push({ node, index })
  }
  if (!any) return

  const range = document.createRange()
  const rectsOf = (at: number): DOMRect[] => {
    const { node, index } = chars[at]
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    return [...range.getClientRects()]
  }
  /** a letter's own box: the last it has (the first of the letter after a break is the hyphen's) */
  const ownBox = (at: number): DOMRect | null => {
    const rects = rectsOf(at).filter((rect) => rect.width > 0 || rect.height > 0)
    return rects.length ? rects[rects.length - 1] : null
  }
  const isLetter = (at: number) => {
    const char = chars[at].node.data[chars[at].index]
    return char !== SOFT_HYPHEN && !/\s/.test(char)
  }

  // which of the soft hyphens a line was broken at (all of them are looked at before any is changed: a change moves the boxes)
  const broken = new Set<number>()
  for (let at = 0; at < chars.length; at++) {
    if (chars[at].node.data[chars[at].index] !== SOFT_HYPHEN) continue
    if (rectsOf(at).some((rect) => rect.width > 0.5)) {
      broken.add(at)
      continue
    }
    let before = at - 1
    while (before >= 0 && !isLetter(before)) before--
    let after = at + 1
    while (after < chars.length && !isLetter(after)) after++
    if (before < 0 || after >= chars.length) continue
    const a = ownBox(before)
    const b = ownBox(after)
    if (a && b && b.top - a.top > Math.max(2, a.height * 0.4)) broken.add(at)
  }

  for (const node of nodes) {
    if (!node.data.includes(SOFT_HYPHEN)) continue
    const start = first.get(node)!
    let text = ''
    for (let index = 0; index < node.data.length; index++) {
      const char = node.data[index]
      text += char !== SOFT_HYPHEN ? char : broken.has(start + index) ? '-' : ''
    }
    node.data = text
  }
}
