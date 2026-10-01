import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Run, TextAlign } from '../document'
import { buildParagraphNodes, buildWrapFloats, caretOffsetAt, readSelectionIn, setSelectionIn, type ParagraphPatch } from '../richtext'
import { clipForToken, isClipToken } from '../objectClipboard'
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
  /** the gap after each "\n" of the WHOLE story (document.ts's `paraGaps`); `startParaIndex` is where `text` begins in it */
  paraGaps?: (number | undefined)[]
  startParaIndex?: number
  /** true when `text`'s first character is itself a paragraph's first character, not a wrapped continuation */
  atParaStart?: boolean
  /** indents the first line of EVERY paragraph (not just the story's very first) by this many points, unscaled */
  firstLineIndent?: number
  /** leading/indents/alignment a paragraph style (or a change made to it) overrides, one entry per paragraph of the WHOLE story */
  paragraphPatches?: ParagraphPatch[]
  footnoteMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  /** the frame's own default alignment, and whether `text`'s last character is only cut here by the frame's own
   *  edge rather than a real paragraph end — see richtext.ts's `buildParagraphNodes` doc comment */
  baseAlign?: TextAlign
  continuesAtEnd?: boolean
  hasPrev: boolean
  request: SelRequest | null
  /** replace the characters [from, to) of `text` with `insert` */
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onSelectAll?: () => void
  onBackspaceAtStart: () => void
  /** text for the clipboard instead of the selected part (e.g. a whole story), or null */
  onCopyText: () => string | null
  onStop: () => void
  /**
   * A text-selection drag (button still down) has carried the pointer above/below this frame's own box - `anchor` is
   * where the drag started, as an offset into THIS frame's own text, unaffected by wherever the drag has gone since.
   * The story may keep going in a linked frame past this one's own edge, on this page or another; a plain
   * contenteditable has no way to extend a selection into a different element, let alone one on a different part of
   * the pasteboard, so the workspace does it by hand from here.
   */
  onDragOutside?: (clientX: number, clientY: number, anchor: number) => void
  /**
   * Up/Down at the caret's first/last line, with nowhere further to go in this frame's own text (a native
   * ArrowUp/ArrowDown that didn't move the caret to a different line): `x` is the caret's horizontal position on
   * screen, to land on the same column of the linked frame this jumps to.
   */
  onLineBoundary?: (dir: 1 | -1, x: number) => void
}

/** The caret's own client rect (a collapsed range can report none right at a line wrap; the full range then stands in). */
function caretRect(range: Range): DOMRect {
  const rects = range.getClientRects()
  return rects.length ? rects[0] : range.getBoundingClientRect()
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
    const sig = `${p.scale}|${floatsKey(p.floats)}|${!!p.showMarks}|${JSON.stringify(p.paraGaps)}|${p.startParaIndex}|${p.atParaStart}|${p.firstLineIndent}|${JSON.stringify(p.paragraphPatches)}|${p.baseAlign}|${!!p.continuesAtEnd}|${p.text}|${JSON.stringify(p.runs)}`
    const rebuilt = shown.current !== sig
    const keep = rebuilt && shown.current !== null ? readSelectionIn(el) : null
    if (rebuilt) {
      el.replaceChildren(
        ...buildWrapFloats(p.floats, p.scale),
        buildParagraphNodes(
          p.text,
          p.runs,
          p.scale,
          {
            showMarks: p.showMarks,
            paraGaps: p.paraGaps,
            startParaIndex: p.startParaIndex,
            atParaStart: p.atParaStart,
            firstLineIndent: p.firstLineIndent,
            footnoteMarkers: p.footnoteMarkers,
            footnoteReferenceScale: p.footnoteReferenceScale,
          },
          p.paragraphPatches,
          p.baseAlign,
          p.continuesAtEnd,
        ),
      )
      // keeps the empty last line reachable - inside the last paragraph's own block when there is one (a block-level
      // sibling after it would start a whole new, unstyled line of its own instead of extending that paragraph)
      if (p.text.endsWith('\n')) {
        const lastBlock = el.lastElementChild
        ;(lastBlock?.tagName === 'DIV' ? lastBlock : el).appendChild(document.createElement('br'))
      }
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
      const clipboardText = e.clipboardData?.getData('text/plain') ?? ''
      const entry = isClipToken(clipboardText) ? clipForToken(clipboardText) : null
      const text = (entry ? entry.data.frames.map((frame) => frame.text).join('\n') : clipboardText).replace(/\r\n?/g, '\n')
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
      onPointerDown={(e) => {
        if (e.button !== 0 || !live.current.onDragOutside) return
        const el = e.currentTarget
        const anchor = caretOffsetAt(e.clientX, e.clientY, el) ?? live.current.text.length
        const stop = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', stop)
        }
        const onMove = (moveEvent: PointerEvent) => {
          if (!(moveEvent.buttons & 1)) return stop()
          const rect = el.getBoundingClientRect()
          if (moveEvent.clientY < rect.top - 2 || moveEvent.clientY > rect.bottom + 2) live.current.onDragOutside?.(moveEvent.clientX, moveEvent.clientY, anchor)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', stop)
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && live.current.onSelectAll) {
          e.preventDefault()
          e.stopPropagation()
          const selection = document.getSelection()
          const range = document.createRange()
          range.selectNodeContents(e.currentTarget)
          selection?.removeAllRanges()
          selection?.addRange(range)
          requestAnimationFrame(() => live.current.onSelectAll?.())
          return
        }
        if (e.key === 'Escape') {
          e.currentTarget.blur()
          return
        }
        // a plain Up/Down (no selection, no modifier) at the edge of this frame's own text: let the browser try to
        // move the caret first, then check whether it actually changed line - if not, there is nowhere further to
        // go here, so hand off to the linked frame at the same horizontal position
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && p.onLineBoundary) {
          const el = e.currentTarget
          const sel = document.getSelection()
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
          if (range && range.collapsed) {
            const before = caretRect(range)
            const dir = e.key === 'ArrowDown' ? 1 : -1
            const x = (before.left + before.right) / 2
            requestAnimationFrame(() => {
              if (document.activeElement !== el) return
              const s = document.getSelection()
              const r = s && s.rangeCount > 0 ? s.getRangeAt(0) : null
              if (r && r.collapsed && Math.abs(caretRect(r).top - before.top) < 1) live.current.onLineBoundary?.(dir, x)
            })
          }
        }
      }}
    />
  )
}
