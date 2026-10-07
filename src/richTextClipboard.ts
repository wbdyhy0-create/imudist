import type { Run, TextFrame } from './document'

export interface RichTextClipboardParagraph {
  styleId: string
  styleName: string
  patch: NonNullable<TextFrame['paragraphStylePatches']>[number]
  spaceBefore: number | null
  spaceAfter: number | null
  keepFirstLines: number | null
  keepLastLines: number | null
  keepWithNext: number | null
}

export interface RichTextClipboard {
  text: string
  runs: Run[]
  paragraphs: RichTextClipboardParagraph[]
}

let copied: RichTextClipboard | null = null

export function rememberRichTextClipboard(clipboard: RichTextClipboard | null): void {
  copied = clipboard
}

export function richTextClipboardFor(text: string): RichTextClipboard | null {
  return copied?.text === text ? copied : null
}
