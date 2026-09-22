import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Run } from '../document'
import { buildRunNodes, buildWrapFloats, readSelectionIn, setSelectionIn } from '../richtext'
import { diffEdit, wordEnd, wordStart } from '../story'
import { floatsKey, type WrapFloat } from '../wrap'

/** Ask the editor to select characters [a, b) of its text (a caret when a === b). `token` changes on each request. */
export interface SelRequest {
  a: number
  b: number
  token: number
}

interface Props {
  /** the part of the story shown in this frame, and its style runs */
  text: string
  runs: Run[]
  /** zoom: font sizes are stored in points */
  scale: number
  /** areas kept free of text because of pictures with text wrap */
  floats: WrapFloat[]
  /** show a dot over spaces and a ¶ at paragraph breaks (View > תווים נסתרים); never affects the text itself */
  showMarks?: boolean
  /** points, unscaled: line-height given to every "\n", how spaceAfter shows up between paragraphs — see richtext.ts */
  paraLineHeight?: number
  hasPrev: boolean
  request: SelRequest | null
  /** replace the characters [from, to) of `text` with `insert` */
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onBackspaceAtStart: () => void
  /** text for the clipboard instead of the selected part (e.g. a whole story), or null */
  onCopyText: () => string | null
  onStop: () => void
}

/**
 * A contenteditable text box whose content is fully driven by the model: every edit is intercepted in
 * `beforeinput`, sent to `onEdit`, and the DOM is rebuilt from the new model. This keeps the per-character
 * formatting (one <span> per run) and lets the story flow between frames.
 */
export function RichEditor(p: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const live = useRef(p)
  live.current = p
  /** signature of what the DOM currently shows */
  const shown = useRef<string | null>(null)
  const lastToken = useRef(-1)

  // (re)build the DOM whenever the model changed, keep focus, place the selection
  useLayoutEffect(() => {
    const el = ref.current!
    const sig = `${p.scale}|${floatsKey(p.floats)}|${!!p.showMarks}|${p.paraLineHeight}|${p.text}|${JSON.stringify(p.runs)}`
    const rebuilt = shown.current !== sig
    const keep = rebuilt && shown.current !== null ? readSelectionIn(el) : null
    if (rebuilt) {
      el.replaceChildren(
        ...buildWrapFloats(p.floats, p.scale),
        buildRunNodes(p.text, p.runs, p.scale, { showMarks: p.showMarks, paraLineHeight: p.paraLineHeight }),
      )
      if (p.text.endsWith('\n')) el.appendChild(document.createElement('br')) // keeps the empty last line reachable
      shown.current = sig
    }
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    if (p.request && p.request.token !== lastToken.current) {
      lastToken.current = p.request.token
      setSelectionIn(el, p.request.a, p.request.b)
    } else if (rebuilt) {
      const n = p.text.length
      const [a, b] = keep ?? [n, n]
      setSelectionIn(el, Math.min(a, n), Math.min(b, n))
    }
  })

  useEffect(() => {
    const el = ref.current!
    const range = (): [number, number] => readSelectionIn(el) ?? [live.current.text.length, live.current.text.length]

    const onSelectionChange = () => {
      const s = readSelectionIn(el)
      if (s) live.current.onSelect(s[0], s[1])
    }

    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing) return // handled when the composition ends
      e.preventDefault()
      const p = live.current
      const [a, b] = range()
      const edit = p.onEdit
      switch (e.inputType) {
        case 'insertText':
          if (e.data) edit(a, b, e.data)
          break
        case 'insertParagraph':
        case 'insertLineBreak':
          edit(a, b, '\n')
          break
        case 'deleteContentBackward':
          if (a !== b) edit(a, b, '')
          else if (a > 0) edit(a - 1, a, '')
          else if (p.hasPrev) p.onBackspaceAtStart()
          break
        case 'deleteContentForward':
          if (a !== b) edit(a, b, '')
          else if (a < p.text.length) edit(a, a + 1, '')
          break
        case 'deleteWordBackward':
          if (a !== b) edit(a, b, '')
          else if (wordStart(p.text, a) < a) edit(wordStart(p.text, a), a, '')
          break
        case 'deleteWordForward':
          if (a !== b) edit(a, b, '')
          else if (wordEnd(p.text, a) > a) edit(a, wordEnd(p.text, a), '')
          break
        default:
          break // cut / paste have their own events; history and formatting inputs are ignored on purpose
      }
    }

    const onClipboard = (cut: boolean) => (e: ClipboardEvent) => {
      const p = live.current
      const [a, b] = range()
      const text = p.onCopyText() ?? p.text.slice(a, b)
      if (!text) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', text)
      if (cut) p.onEdit(a, b, '')
    }
    const onCopy = onClipboard(false)
    const onCut = onClipboard(true)

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n')
      if (!text) return
      const [a, b] = range()
      live.current.onEdit(a, b, text)
    }

    // IME / dead-key composition can't be cancelled: reconcile with what the browser did once it is over
    const onCompositionEnd = () => {
      const p = live.current
      const d = diffEdit(p.text, el.textContent ?? '')
      if (d.from !== d.to || d.insert) p.onEdit(d.from, d.to, d.insert)
    }

    const stop = (e: Event) => e.preventDefault()

    document.addEventListener('selectionchange', onSelectionChange)
    el.addEventListener('beforeinput', onBeforeInput)
    el.addEventListener('copy', onCopy)
    el.addEventListener('cut', onCut)
    el.addEventListener('paste', onPaste)
    el.addEventListener('compositionend', onCompositionEnd)
    el.addEventListener('drop', stop)
    el.addEventListener('dragover', stop)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      el.removeEventListener('beforeinput', onBeforeInput)
      el.removeEventListener('copy', onCopy)
      el.removeEventListener('cut', onCut)
      el.removeEventListener('paste', onPaste)
      el.removeEventListener('compositionend', onCompositionEnd)
      el.removeEventListener('drop', stop)
      el.removeEventListener('dragover', stop)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="rich-editor"
      dir="rtl"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      aria-label="תיבת טקסט"
      onBlur={p.onStop}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
}
