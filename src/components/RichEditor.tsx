import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Run, TextAlign } from '../document'
import { buildParagraphNodes, buildWrapFloats, caretOffsetAt, normalizeCaretIn, readSelectionIn, setSelectionIn, textOffsetIn, type ParagraphPatch } from '../richtext'
import { clipForToken, isClipToken } from '../objectClipboard'
import { diffEdit, wordEnd, wordStart } from '../story'
import { floatsKey, type WrapFloat } from '../wrap'
import { ContextMenu } from './ContextMenu'
import { rememberRichTextClipboard, richTextClipboardFor, type RichTextClipboard } from '../richTextClipboard'

let lastCopiedText: string | null = null

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
  tocPageMarkers?: Record<number, string>
  tocLeaderMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  footnoteReferenceGap?: number
  footnoteReferenceVerticalOffset?: number
  /** the frame's own default alignment, and whether `text`'s last character is only cut here by the frame's own
   *  edge rather than a real paragraph end — see richtext.ts's `buildParagraphNodes` doc comment */
  baseAlign?: TextAlign
  baseLeading?: number
  continuesAtEnd?: boolean
  /**
   * Where the workspace's own selection lies in this frame's text ([a, b), a === b for a caret). When the DOM is
   * rebuilt (a size change, say) the selection goes back there rather than to the DOM's old offsets: those count from
   * where this frame's slice of the story began, and text reflowing above it moves that start - the selection would
   * slide onto other text with every change.
   */
  selectionHint?: [number, number] | null
  hasPrev: boolean
  request: SelRequest | null
  /** replace the characters [from, to) of `text` with `insert` */
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onSelectAll?: () => void
  onSelectToStart?: (offset: number) => void
  onBackspaceAtStart: () => void
  onBackspaceAtParagraphStart?: (offset: number) => boolean
  /** text for the clipboard instead of the selected part (e.g. a whole story), or null */
  onCopyText: () => string | null
  onCopyFormattedText?: (a: number, b: number) => RichTextClipboard | null
  onPasteFormattedText?: (a: number, b: number, clipboard: RichTextClipboard) => void
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
   * screen, to land on the same column of the linked frame this jumps to. `toStart`: the caret was at the very end of the
   * paragraph that ends this frame's text, so what it moves to is the start of the next frame, not a column of its first line.
   */
  onLineBoundary?: (dir: 1 | -1, x: number, toStart?: boolean) => void
  /**
   * The story goes on in a linked frame after this one. The place right after the paragraph break that ends this frame's
   * text is then the first place of that next frame, not an empty line of this one: no line is kept for it here, and a
   * caret that gets there is handed over (a click below the last line stays at the end of that line).
   */
  storyContinues?: boolean
}

/** The caret's own client rect (a collapsed range can report none right at a line wrap; the full range then stands in). */
function caretRect(range: Range): DOMRect {
  const rects = range.getClientRects()
  return rects.length ? rects[0] : range.getBoundingClientRect()
}

/**
 * Footnote numbers, TOC page numbers and leaders are CSS generated content (the character they stand for is
 * zero-size), which a native selection never paints. Flag the ones inside the current selection so the stylesheet can
 * give them the selection colour itself.
 */
function markSelectedMarkers(el: HTMLElement) {
  const sel = window.getSelection()
  const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null
  const active = !!range && !range.collapsed && el.contains(range.commonAncestorContainer)
  for (const marker of el.querySelectorAll('.footnote-reference, .toc-page-reference, .toc-leader')) {
    marker.classList.toggle('in-selection', active && range.intersectsNode(marker))
  }
}

/**
 * A contenteditable text box whose content is fully driven by the model: every edit is intercepted in
 * `beforeinput`, sent to `onEdit`, and the DOM is rebuilt from the new model. This keeps the per-character
 * formatting (one <span> per run) and lets the story flow between frames.
 */
export function RichEditor(p: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [textMenu, setTextMenu] = useState<{ x: number; y: number; a: number; b: number } | null>(null)
  const contextSelection = useRef<[number, number]>([0, 0])
  const live = useRef(p)
  live.current = p
  /** signature of what the DOM currently shows */
  const shown = useRef<string | null>(null)
  const lastToken = useRef(-1)

  // (re)build the DOM whenever the model changed, keep focus, place the selection
  useLayoutEffect(() => {
    const el = ref.current!
    const sig = `${p.scale}|${floatsKey(p.floats)}|${!!p.showMarks}|${JSON.stringify(p.paraGaps)}|${p.startParaIndex}|${p.atParaStart}|${p.firstLineIndent}|${JSON.stringify(p.paragraphPatches)}|${p.baseAlign}|${!!p.continuesAtEnd}|${!!p.storyContinues}|${p.text}|${JSON.stringify(p.runs)}|${p.footnoteReferenceScale}|${p.footnoteReferenceGap}|${p.footnoteReferenceVerticalOffset}|${JSON.stringify(p.footnoteMarkers)}|${JSON.stringify(p.tocPageMarkers)}|${JSON.stringify(p.tocLeaderMarkers)}`
    const rebuilt = shown.current !== sig
    const keep = rebuilt && shown.current !== null ? p.selectionHint ?? readSelectionIn(el) : null
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
            baseLeading: p.baseLeading,
            footnoteMarkers: p.footnoteMarkers,
            tocPageMarkers: p.tocPageMarkers,
            tocLeaderMarkers: p.tocLeaderMarkers,
            footnoteReferenceScale: p.footnoteReferenceScale,
            footnoteReferenceGap: p.footnoteReferenceGap,
            footnoteReferenceVerticalOffset: p.footnoteReferenceVerticalOffset,
          },
          p.paragraphPatches,
          p.baseAlign,
          p.continuesAtEnd,
        ),
      )
      // keeps the empty last line reachable - inside the last paragraph's own block when there is one (a block-level
      // sibling after it would start a whole new, unstyled line of its own instead of extending that paragraph). Only at the
      // end of the story: in a frame the story goes on after, that line would be a place of its own for the caret under the
      // last line, when the place after the break is really the next frame's first
      if (p.text.endsWith('\n') && !p.storyContinues) {
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
    if (rebuilt) markSelectedMarkers(el)
  })

  useEffect(() => {
    const el = ref.current!
    const range = (): [number, number] => readSelectionIn(el) ?? [live.current.text.length, live.current.text.length]

    const onSelectionChange = () => {
      const s = readSelectionIn(el)
      if (s && s[0] === s[1]) normalizeCaretIn(el)
      if (s) live.current.onSelect(s[0], s[1])
      markSelectedMarkers(el)
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
          else if (p.onBackspaceAtParagraphStart?.(a)) break
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
      lastCopiedText = text
      const formatted = p.onCopyFormattedText?.(a, b) ?? null
      rememberRichTextClipboard(formatted)
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
      const formatted = richTextClipboardFor(text)
      if (formatted && live.current.onPasteFormattedText) {
        live.current.onPasteFormattedText(a, b, formatted)
        return
      }
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

  const restoreContextSelection = () => {
    const editor = ref.current
    if (!editor) return null
    editor.focus({ preventScroll: true })
    const [a, b] = contextSelection.current
    setSelectionIn(editor, a, b)
    live.current.onSelect(a, b)
    return editor
  }
  const runTextClipboardCommand = (command: 'copy' | 'cut') => {
    const editor = restoreContextSelection()
    if (!editor) return
    const [a, b] = contextSelection.current
    const copied = live.current.onCopyText() ?? live.current.text.slice(a, b)
    if (copied) {
      lastCopiedText = copied
      rememberRichTextClipboard(live.current.onCopyFormattedText?.(a, b) ?? null)
    }
    if (!document.execCommand(command)) console.error(`Could not ${command} text from the context menu.`)
  }
  const pasteTextFromClipboard = async () => {
    const editor = restoreContextSelection()
    if (!editor) return
    let clipboardText: string
    try {
      clipboardText = await navigator.clipboard.readText()
    } catch (error) {
      if (lastCopiedText === null) {
        console.error('Could not paste text from the context menu.', error)
        return
      }
      clipboardText = lastCopiedText
    }
    if (!clipboardText && lastCopiedText !== null) clipboardText = lastCopiedText
    const entry = isClipToken(clipboardText) ? clipForToken(clipboardText) : null
    const text = (entry ? entry.data.frames.map((frame) => frame.text).join('\n') : clipboardText).replace(/\r\n?/g, '\n')
    if (!text) return
    const [a, b] = contextSelection.current
    const formatted = richTextClipboardFor(text)
    if (formatted && live.current.onPasteFormattedText) {
      live.current.onPasteFormattedText(a, b, formatted)
      return
    }
    live.current.onEdit(a, b, text)
  }

  return (
    <>
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
      onContextMenu={(event) => {
        event.preventDefault()
        const editor = event.currentTarget
        const current = readSelectionIn(editor)
        const clicked = current && current[0] !== current[1]
          ? current
          : (() => {
              const offset = caretOffsetAt(event.clientX, event.clientY, editor)
              return offset === null ? current : [offset, offset] as [number, number]
            })()
        contextSelection.current = clicked ?? [live.current.text.length, live.current.text.length]
        const [a, b] = contextSelection.current
        if (clicked) setSelectionIn(editor, a, b)
        live.current.onSelect(a, b)
        setTextMenu({ x: event.clientX, y: event.clientY, a, b })
      }}
      onPointerUp={(event) => {
        const editor = event.currentTarget
        requestAnimationFrame(() => {
          const selection = readSelectionIn(editor)
          if (!selection) return
          const l = live.current
          // a click under the last line of a frame the story goes on after: the caret stays at the end of that line
          if (selection[0] === selection[1] && l.storyContinues && l.text.endsWith('\n') && selection[0] >= l.text.length) {
            const at = l.text.length - 1
            setSelectionIn(editor, at, at)
            l.onSelect(at, at)
            return
          }
          l.onSelect(selection[0], selection[1])
        })
      }}
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
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
          const selection = readSelectionIn(e.currentTarget)
          if (selection && selection[0] !== selection[1]) {
            const [a, b] = selection
            lastCopiedText = live.current.onCopyText() ?? live.current.text.slice(a, b)
            rememberRichTextClipboard(live.current.onCopyFormattedText?.(a, b) ?? null)
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Home' && live.current.onSelectToStart) {
          e.preventDefault()
          e.stopPropagation()
          const selection = document.getSelection()
          const focus = selection?.focusNode && e.currentTarget.contains(selection.focusNode)
            ? textOffsetIn(e.currentTarget, selection.focusNode, selection.focusOffset)
            : live.current.text.length
          setSelectionIn(e.currentTarget, 0, focus)
          live.current.onSelectToStart(focus)
          return
        }
        if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyA' || e.key.toLowerCase() === 'a') && live.current.onSelectAll) {
          e.preventDefault()
          e.stopPropagation()
          live.current.onSelectAll()
          return
        }
        if (e.key === 'Escape') {
          e.currentTarget.blur()
          return
        }
        // an arrow at the very end of the paragraph that ends this frame's text, when the story goes on: the next place is the
        // first place of the next frame, so the caret goes there (its start) - whether the arrow could not move it any further
        // (Down on the last line, forward in the text's direction) or was the one that crossed the break
        let atFrameEnd = false
        if ((e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && live.current.storyContinues && live.current.onLineBoundary && live.current.text.endsWith('\n')) {
          const el = e.currentTarget
          const now = readSelectionIn(el)
          atFrameEnd = !!now && now[0] === now[1] && now[0] >= live.current.text.length - 1
          if (atFrameEnd) {
            requestAnimationFrame(() => {
              if (document.activeElement !== el) return
              const at = readSelectionIn(el)
              const l = live.current
              // a Left/Right that moved the caret back into the text is not a step forward
              if (!at || at[0] !== at[1] || at[0] < l.text.length - 1) return
              l.onLineBoundary?.(1, 0, true)
            })
          }
        }
        // a plain Up/Down (no selection, no modifier) at the edge of this frame's own text: let the browser try to
        // move the caret first, then check whether it actually changed line - if not, there is nowhere further to
        // go here, so hand off to the linked frame at the same horizontal position
        if (!atFrameEnd && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && p.onLineBoundary) {
          const el = e.currentTarget
          const sel = document.getSelection()
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
          if (range && range.collapsed) {
            const before = caretRect(range)
            // measured from the top of this box, not of the screen: a caret on the last visible line makes the browser scroll the
            // view as it moves, so that on screen it can stay exactly where it was while it did move to the next line
            const beforeTop = before.top - el.getBoundingClientRect().top
            const dir = e.key === 'ArrowDown' ? 1 : -1
            const x = (before.left + before.right) / 2
            requestAnimationFrame(() => {
              if (document.activeElement !== el) return
              const s = document.getSelection()
              const r = s && s.rangeCount > 0 ? s.getRangeAt(0) : null
              if (r && r.collapsed && Math.abs(caretRect(r).top - el.getBoundingClientRect().top - beforeTop) < 1) live.current.onLineBoundary?.(dir, x)
            })
          }
        }
      }}
    />
    {textMenu && createPortal(
      <ContextMenu
        x={textMenu.x}
        y={textMenu.y}
        onClose={() => setTextMenu(null)}
        items={[
          { label: 'גזור', shortcut: 'Ctrl+X', disabled: textMenu.a === textMenu.b, onClick: () => runTextClipboardCommand('cut') },
          { label: 'העתק', shortcut: 'Ctrl+C', disabled: textMenu.a === textMenu.b, onClick: () => runTextClipboardCommand('copy') },
          { label: 'הדבק', shortcut: 'Ctrl+V', onClick: () => void pasteTextFromClipboard() },
        ]}
      />,
      document.body,
    )}
    </>
  )
}
