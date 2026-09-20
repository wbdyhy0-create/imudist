import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import { DEFAULT_TEXT_STYLE, MIN_FRAME_PT, type CharStyle, type DocSettings, type Run, type TextAlign, type TextFrame, type TextStyle } from '../document'
import { isTyping } from '../dom'
import { chainOf, dragBox, linkFrames, removeFrame, unlinkBefore, type Box, type HandleId } from '../frames'
import { computeLayout } from '../layout'
import { ownerPage, pageRects } from '../pages'
import { caretOffsetAt } from '../richtext'
import { charStyleOf, editStory, normalizeRuns, styleAtChar, styleRange } from '../story'
import { flowFrames, type FrameFlow } from '../textLayout'
import { PagesPanel, type InsertWhere } from './PagesPanel'
import { PropertiesPanel } from './PropertiesPanel'
import type { SelRequest } from './RichEditor'
import { Ruler } from './Ruler'
import { SpreadView } from './SpreadView'
import { StatusBar, formatZoom } from './StatusBar'
import { TextFrameView } from './TextFrameView'
import { TOOLS, Toolbox, type ToolId } from './Toolbox'
import type { PageOps } from '../useDocumentSession'

/** pasteboard around the pages, screen px */
const PAD = 120
const RULER = 20
const FIT_MARGIN = 40
const ZOOM_MIN = 0.05
const ZOOM_MAX = 40
const ZOOM_STEPS = [0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 40]

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
const stepZoom = (z: number, dir: 1 | -1) =>
  dir > 0
    ? (ZOOM_STEPS.find((s) => s > z * 1.001) ?? ZOOM_MAX)
    : ([...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? ZOOM_MIN)

export interface WorkspaceHandle {
  zoomIn: () => void
  zoomOut: () => void
  fitPage: () => void
  fitSpread: () => void
  actualSize: () => void
  firstPage: () => void
  prevPage: () => void
  nextPage: () => void
  lastPage: () => void
  /** Ctrl+A while editing text: select the whole story (all frames of the thread) */
  selectAllText: () => void
  /** add one page after the selected page / delete the selected page */
  addPage: () => void
  deletePage: () => void
}

/**
 * Changes of the frames go through here. Changes that share a `key` and come close together (typing, dragging,
 * stepping a value) are merged into one undo step.
 */
export type FramesChange = (frames: TextFrame[], coalesceKey?: string) => void

interface Props {
  doc: DocSettings
  /** the view re-fits to the first spread whenever this changes */
  fitKey: string
  showRulers: boolean
  showGuides: boolean
  showProps: boolean
  showPages: boolean
  /** screen mode "Preview": no guides or frame edges, the page as it will print */
  previewMode: boolean
  onPreviewMode: (on: boolean) => void
  frames: TextFrame[]
  onFramesChange: FramesChange
  pageOps: PageOps
  /** the document has changes that are not saved yet */
  dirty?: boolean
  onClose?: () => void
  ref?: Ref<WorkspaceHandle>
}

const newFrameId = () => globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random()}`

/** Zoom plus, optionally, "world point (wx, wy) must end up at viewport pixel (sx, sy)". */
interface View {
  zoom: number
  anchor: { wx: number; wy: number; sx: number; sy: number } | null
}

/** A range of a story's text (character offsets into the whole story). */
interface TextSel {
  headId: string
  a: number
  b: number
}

/**
 * The viewport scrolls right-to-left (scrollbar on the left, like the rest of the RTL UI).
 * All geometry math uses "distance from the left edge", so read/write the offset that way.
 */
const getScrollX = (el: HTMLElement) => el.scrollLeft + (el.scrollWidth - el.clientWidth)
const setScrollX = (el: HTMLElement, x: number) => {
  el.scrollLeft = x - (el.scrollWidth - el.clientWidth)
}

export function Workspace({
  doc,
  fitKey,
  showRulers,
  showGuides,
  showProps,
  showPages,
  previewMode,
  onPreviewMode,
  frames,
  onFramesChange,
  pageOps,
  dirty,
  onClose,
  ref,
}: Props) {
  const { spreads, bounds } = useMemo(() => computeLayout(doc), [doc])
  const flow = useMemo(() => flowFrames(frames), [frames])
  const rects = useMemo(() => pageRects(doc), [doc])
  /** the page that Insert / Delete act on (the last one clicked) */
  const [selectedPage, setSelectedPage] = useState(0)
  const pendingNav = useRef<number | null>(null)

  const vpRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0, sb: 0 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [view, setView] = useState<View>({ zoom: 1, anchor: null })
  const [tool, setTool] = useState<ToolId>('select')
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** an out-port was clicked: the next click on a frame continues the text there */
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  /** where the editor should put its selection (and in which frame) */
  const [request, setRequest] = useState<(SelRequest & { frameId: string }) | null>(null)
  const requestToken = useRef(0)
  /** the selected text of a story — what the panel's character controls apply to */
  const [textSel, setTextSel] = useState<TextSel | null>(null)
  /** rubber-band rectangle (world pt) while dragging a new text frame with the Type tool */
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const createStart = useRef<{ x: number; y: number } | null>(null)
  /** moving a frame ("move") or resizing it by a handle, with the Selection tool */
  const frameDrag = useRef<{ id: string; mode: 'move' | HandleId; start: { x: number; y: number }; orig: Box; key: string } | null>(null)
  const dragSeq = useRef(0)

  const zoom = view.zoom

  // ── geometry: world (pt) → screen (px) inside the scrollable sheet ──────────────
  const cw = bounds.maxX - bounds.minX
  const ch = bounds.maxY - bounds.minY
  const originX = Math.max(PAD, (vp.w - cw * zoom) / 2)
  const originY = Math.max(PAD, (vp.h - ch * zoom) / 2)
  const sheetW = Math.ceil(originX * 2 + cw * zoom)
  const sheetH = Math.ceil(originY * 2 + ch * zoom)
  const tx = originX - bounds.minX * zoom // screen x of world x = 0
  const ty = originY - bounds.minY * zoom

  // spread nearest to the middle of the viewport
  const centerWy = (scroll.y + vp.h / 2 - ty) / zoom
  let cur = 0
  let best = Infinity
  spreads.forEach((s, i) => {
    const dist = Math.abs(centerWy - (s.y + s.h / 2))
    if (dist < best) {
      best = dist
      cur = i
    }
  })

  // latest geometry for event handlers that outlive a render (wheel listener)
  const live = useRef({ zoom, tx, ty, sb: vp.sb })
  live.current = { zoom, tx, ty, sb: vp.sb }

  // ── view control ───────────────────────────────────────────────────────────────
  const applyView = (z: number, wx: number, wy: number, sx: number, sy: number) =>
    setView({ zoom: clampZoom(z), anchor: { wx, wy, sx, sy } })

  const zoomAt = (z: number, sx: number, sy: number) => {
    const el = vpRef.current
    if (!el) return
    const L = live.current
    applyView(z, (getScrollX(el) + sx - L.tx) / L.zoom, (el.scrollTop + sy - L.ty) / L.zoom, sx, sy)
  }
  const zoomAtRef = useRef(zoomAt)
  zoomAtRef.current = zoomAt

  const fitRect = (x: number, y: number, w: number, h: number) => {
    if (vp.w <= FIT_MARGIN * 2 || vp.h <= FIT_MARGIN * 2) return
    const z = Math.min((vp.w - FIT_MARGIN * 2) / w, (vp.h - FIT_MARGIN * 2) / h)
    applyView(z, x + w / 2, y + h / 2, vp.w / 2, vp.h / 2)
  }
  const fitSpread = (i = cur) => {
    const s = spreads[i]
    fitRect(s.contentX, s.y, s.contentW, s.h)
  }
  const fitPage = (i = cur) => {
    const s = spreads[i]
    fitRect(s.pages[0].x, s.y, doc.width, s.h)
  }
  const goTo = (i: number) => {
    const s = spreads[Math.min(spreads.length - 1, Math.max(0, i))]
    applyView(zoom, s.contentX + s.contentW / 2, s.y + s.h / 2, vp.w / 2, vp.h / 2)
  }
  const goToPage = (n: number) => {
    const found = spreads.findIndex((s) => s.pages.some((p) => p.number === n))
    goTo(found >= 0 ? found : n < doc.startPage ? 0 : spreads.length - 1)
  }

  // ── pages ──────────────────────────────────────────────────────────────────────
  const selPage = Math.min(selectedPage, doc.pages - 1)
  const spreadOfPage = (i: number) => Math.max(0, spreads.findIndex((s) => s.pages.some((p) => p.index === i)))

  // after the pages changed, scroll to the page in question once the new layout is in place
  useEffect(() => {
    if (pendingNav.current === null) return
    goTo(spreadOfPage(pendingNav.current))
    pendingNav.current = null
  }, [spreads])

  const selectPage = (i: number) => {
    setSelectedPage(i)
    goTo(spreadOfPage(i))
  }
  const insertPages = (count: number, where: InsertWhere) => {
    if (doc.pages >= 9999) return
    const at = where === 'end' ? doc.pages : where === 'before' ? selPage : selPage + 1
    pendingNav.current = at
    setSelectedPage(at)
    pageOps.insert(at, count)
  }
  const deleteSelectedPage = () => {
    if (doc.pages <= 1) return
    const next = Math.min(selPage, doc.pages - 2)
    pendingNav.current = next
    setSelectedPage(next)
    pageOps.remove([selPage])
  }
  const movePage = (from: number, to: number) => {
    if (from === to) return
    pendingNav.current = to
    setSelectedPage(to)
    pageOps.move(from, to)
  }

  // ── text frames: story editing ─────────────────────────────────────────────────
  const updateFrame = (id: string, patch: Partial<TextFrame>, key?: string) =>
    onFramesChange(frames.map((f) => (f.id === id ? { ...f, ...patch } : f)), key)

  const askSelection = (frameId: string, a: number, b: number) => {
    requestToken.current += 1
    setRequest({ frameId, a, b, token: requestToken.current })
  }

  /**
   * Store a story's new text and runs. `abs` is where the caret goes, as an offset into the new story. The text may
   * have reflowed, so the caret (and the editing focus) moves to whichever frame now contains that offset.
   */
  const commitStory = (headId: string, text: string, runs: Run[], abs: number, key: string) => {
    const next = frames.map((f) => (f.id === headId ? { ...f, text, runs } : f))
    const nf = flowFrames(next)
    const chain = chainOf(next, headId)
    const target =
      chain.find((f) => abs < nf.get(f.id)!.end) ?? chain.find((f) => nf.get(f.id)!.end >= text.length) ?? chain[chain.length - 1]
    const tf = nf.get(target.id)!
    const pos = Math.max(0, Math.min(abs - tf.start, tf.slice.length))
    askSelection(target.id, pos, pos)
    setTextSel({ headId, a: abs, b: abs })
    setEditingId(target.id)
    setSelectedId(target.id)
    onFramesChange(next, key)
  }

  /** Replace [from, to) of a story with `insert`. */
  const applyEdit = (headId: string, from: number, to: number, insert: string) => {
    const head = frames.find((f) => f.id === headId)
    if (!head) return
    const r = editStory(head.text, head.runs, from, to, insert, head)
    commitStory(headId, r.text, r.runs, from + insert.length, `type:${headId}`)
  }

  /** an edit reported by a frame's editor: offsets are inside that frame's part of the story */
  const handleEdit = (frameId: string, from: number, to: number, insert: string) => {
    const fl = flow.get(frameId)
    if (!fl) return
    let a = fl.start + from
    let b = fl.start + to
    // Ctrl+A across a thread: the edit replaces the selected text of the whole story
    if (textSel && textSel.headId === fl.headId && (textSel.a < fl.start || textSel.b > fl.end)) {
      a = textSel.a
      b = textSel.b
    }
    applyEdit(fl.headId, a, b, insert)
  }

  /** Backspace at the very start of a threaded frame deletes the last character of the previous frame */
  const backspaceAtStart = (frameId: string) => {
    const fl = flow.get(frameId)
    if (fl && fl.start > 0) applyEdit(fl.headId, fl.start - 1, fl.start, '')
  }

  const handleSelect = (frameId: string, a: number, b: number) => {
    const fl = flow.get(frameId)
    if (!fl) return
    // keep a whole-story selection (Ctrl+A) while the browser reports only this frame's part of it
    if (
      textSel &&
      textSel.headId === fl.headId &&
      textSel.a === 0 &&
      textSel.b === fl.story.length &&
      fl.story.length > fl.slice.length &&
      a === 0 &&
      b === fl.slice.length
    ) {
      return
    }
    setTextSel((prev) =>
      prev && prev.headId === fl.headId && prev.a === fl.start + a && prev.b === fl.start + b
        ? prev
        : { headId: fl.headId, a: fl.start + a, b: fl.start + b },
    )
  }

  /** text for the clipboard when the selection spans several frames */
  const copyText = (frameId: string): string | null => {
    const fl = flow.get(frameId)
    if (fl && textSel && textSel.headId === fl.headId && (textSel.a < fl.start || textSel.b > fl.end)) {
      return fl.story.slice(textSel.a, textSel.b)
    }
    return null
  }

  const selectAllText = () => {
    if (!editingId) return
    const fl = flow.get(editingId)
    if (!fl) return
    setTextSel({ headId: fl.headId, a: 0, b: fl.story.length })
    askSelection(editingId, 0, fl.slice.length)
  }

  /** Character style change from the panel: applies to the selected text, or to the whole story if none is selected. */
  const applyCharStyle = (id: string, patch: Partial<CharStyle>) => {
    const fl = flow.get(id)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const runs = normalizeRuns(head.text, head.runs, head)
    const sel = textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length ? textSel : null
    const chainIds = new Set(chainOf(frames, id).map((f) => f.id))
    const key = `style:${head.id}:${Object.keys(patch).join(',')}`
    onFramesChange(
      frames.map((f) => {
        if (sel) return f.id === head.id ? { ...f, runs: styleRange(runs, sel.a, sel.b, patch) } : f
        if (f.id === head.id) return { ...f, ...patch, runs: styleRange(runs, 0, head.text.length, patch) }
        return chainIds.has(f.id) ? { ...f, ...patch } : f
      }),
      key,
    )
  }

  /** alignment belongs to the whole story */
  const applyAlign = (id: string, align: TextAlign) => {
    const ids = new Set(chainOf(frames, id).map((f) => f.id))
    onFramesChange(frames.map((f) => (ids.has(f.id) ? { ...f, align } : f)), `align:${id}`)
  }

  const completeLink = (toId: string) => {
    if (linkFrom) {
      const linked = linkFrames(frames, linkFrom, toId)
      if (linked) {
        onFramesChange(linked)
        setSelectedId(toId)
      }
    }
    setLinkFrom(null)
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(stepZoom(zoom, 1), vp.w / 2, vp.h / 2),
    zoomOut: () => zoomAt(stepZoom(zoom, -1), vp.w / 2, vp.h / 2),
    fitPage: () => fitPage(),
    fitSpread: () => fitSpread(),
    actualSize: () => zoomAt(1, vp.w / 2, vp.h / 2),
    firstPage: () => goTo(0),
    prevPage: () => goTo(cur - 1),
    nextPage: () => goTo(cur + 1),
    lastPage: () => goTo(spreads.length - 1),
    selectAllText,
    addPage: () => insertPages(1, 'after'),
    deletePage: deleteSelectedPage,
  }))

  // ── effects ────────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = vpRef.current!
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight, sb: el.offsetWidth - el.clientWidth })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // apply the requested scroll after the sheet has been resized for the new zoom
  useLayoutEffect(() => {
    const a = view.anchor
    const el = vpRef.current
    if (!a || !el) return
    setScrollX(el, tx + a.wx * zoom - a.sx)
    el.scrollTop = ty + a.wy * zoom - a.sy
    setScroll({ x: getScrollX(el), y: el.scrollTop })
  }, [view])

  const ready = vp.w > 0 && vp.h > 0
  // layout effect: the fit lands before the first paint, so there is no flash at 100%
  useLayoutEffect(() => {
    if (ready) fitSpread(0)
  }, [fitKey, ready])

  // Ctrl/Alt + wheel (also trackpad pinch) zooms towards the pointer; must be non-passive
  useEffect(() => {
    const el = vpRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025))
      zoomAtRef.current(live.current.zoom * factor, e.clientX - rect.left - live.current.sb, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // tool shortcuts + hold Space for a temporary Hand tool
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        setSpace(true)
        return
      }
      const t = TOOLS.find((t) => t.enabled && t.code === e.code && !e.shiftKey)
      if (t) setTool(t.id)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false)
    }
    const reset = () => setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
    }
  }, [])

  // Delete removes the selected frame, arrows nudge it (Shift = 10 pt), Escape deselects / cancels linking
  useEffect(() => {
    if (!selectedId && !linkFrom) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        if (linkFrom) setLinkFrom(null)
        else setSelectedId(null)
      } else if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        onFramesChange(removeFrame(frames, selectedId))
        setSelectedId(null)
      } else if (selectedId && e.key.startsWith('Arrow')) {
        const f = frames.find((x) => x.id === selectedId)
        if (!f) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        updateFrame(
          f.id,
          {
            x: f.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
            y: f.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          },
          `nudge:${f.id}`,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, linkFrom, frames, onFramesChange])

  // the text selection belongs to one story: forget it when another one is selected
  const selHead = selectedId ? chainOf(frames, selectedId)[0] : undefined
  useEffect(() => {
    if (textSel && selHead?.id !== textSel.headId) setTextSel(null)
  }, [selHead?.id])

  // ── pointer: pan (Hand tool / Space / middle button), Zoom, Type and Selection tools ──
  /** client (mouse) position → world points */
  const toWorld = (clientX: number, clientY: number) => {
    const el = vpRef.current!
    const rect = el.getBoundingClientRect()
    const L = live.current
    return {
      x: (clientX - rect.left - L.sb + getScrollX(el) - L.tx) / L.zoom,
      y: (clientY - rect.top + el.scrollTop - L.ty) / L.zoom,
    }
  }

  const beginFrameDrag = (e: ReactPointerEvent<HTMLElement>, id: string, mode: 'move' | HandleId) => {
    const f = frames.find((x) => x.id === id)
    if (!f) return
    dragSeq.current += 1
    frameDrag.current = {
      id,
      mode,
      start: toWorld(e.clientX, e.clientY),
      orig: { x: f.x, y: f.y, w: f.w, h: f.h },
      key: `drag:${dragSeq.current}`,
    }
    vpRef.current!.setPointerCapture(e.pointerId)
  }

  const panMode = tool === 'hand' || space
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) return // scrollbars
    if (linkFrom && !panMode) {
      setLinkFrom(null) // clicked away from any frame
      return
    }
    if (e.button === 0 && !panMode) {
      const p = toWorld(e.clientX, e.clientY)
      setSelectedPage(ownerPage(rects, p.x, p.y))
    }
    if (panMode || e.button === 1) {
      e.preventDefault()
      drag.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
      setPanning(true)
    } else if (tool === 'zoom' && e.button === 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      zoomAt(stepZoom(zoom, e.altKey ? -1 : 1), e.clientX - rect.left - live.current.sb, e.clientY - rect.top)
    } else if (tool === 'type' && e.button === 0) {
      // start dragging a new text frame
      const p = toWorld(e.clientX, e.clientY)
      createStart.current = p
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      setSelectedId(null)
      setEditingId(null)
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'select' && e.button === 0) {
      setSelectedId(null)
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (frameDrag.current) {
      const d = frameDrag.current
      const p = toWorld(e.clientX, e.clientY)
      const box = dragBox(d.orig, d.mode, p.x - d.start.x, p.y - d.start.y, MIN_FRAME_PT)
      onFramesChange(frames.map((f) => (f.id === d.id ? { ...f, ...box } : f)), d.key)
      return
    }
    if (createStart.current) {
      const p = toWorld(e.clientX, e.clientY)
      setDraft({ x0: createStart.current.x, y0: createStart.current.y, x1: p.x, y1: p.y })
      return
    }
    if (!drag.current) return
    e.currentTarget.scrollLeft -= e.clientX - drag.current.x
    e.currentTarget.scrollTop -= e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const finishDraft = () => {
    if (draft && createStart.current) {
      const w = Math.abs(draft.x1 - draft.x0)
      const h = Math.abs(draft.y1 - draft.y0)
      if (w >= MIN_FRAME_PT && h >= MIN_FRAME_PT) {
        const frame: TextFrame = {
          ...DEFAULT_TEXT_STYLE,
          id: newFrameId(),
          x: Math.min(draft.x0, draft.x1),
          y: Math.min(draft.y0, draft.y1),
          w,
          h,
          text: '',
          runs: [],
          next: null,
        }
        onFramesChange([...frames, frame])
        setSelectedId(frame.id)
        setEditingId(frame.id) // ready to type right away
      }
    }
    createStart.current = null
    setDraft(null)
  }
  const endDrag = () => {
    finishDraft()
    frameDrag.current = null
    drag.current = null
    setPanning(false)
  }
  const cancelDrag = () => {
    createStart.current = null
    frameDrag.current = null
    setDraft(null)
    drag.current = null
    setPanning(false)
  }

  /** clicking a frame: Type tool edits its text, Selection tool selects it and starts moving it */
  const onFramePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return // let the pan handler see it
    const clicked = frames.find((f) => f.id === id)
    if (clicked) setSelectedPage(ownerPage(rects, clicked.x + clicked.w / 2, clicked.y + clicked.h / 2))
    if (linkFrom) {
      e.stopPropagation()
      e.preventDefault()
      completeLink(id)
      return
    }
    if (tool !== 'type' && tool !== 'select') return
    e.stopPropagation()
    if (tool === 'type') {
      if (editingId !== id) {
        // Entering edit mode swaps the text <div> for the editor; without this the browser's own focus
        // handling (which runs after this handler) would move focus away and end editing at once.
        // While already editing we must not prevent it, or the caret could not be placed by clicking.
        e.preventDefault()
        const pos = caretOffsetAt(e.clientX, e.clientY, e.currentTarget.querySelector('.text-frame-body'))
        if (pos !== null) askSelection(id, pos, pos)
      }
      setSelectedId(id)
      setEditingId(id)
    } else {
      e.preventDefault()
      setSelectedId(id)
      setEditingId(null)
      beginFrameDrag(e, id, 'move')
    }
  }
  const onHandleDown = (id: string) => (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    beginFrameDrag(e, id, handle)
  }
  const onOutPortDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    if (linkFrom && linkFrom !== id) return completeLink(id)
    const f = frames.find((x) => x.id === id)
    setSelectedId(id)
    if (linkFrom === id) setLinkFrom(null)
    else if (f && !f.next) setLinkFrom(id)
  }
  const onInPortDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    if (linkFrom) return completeLink(id)
    if (frames.some((f) => f.next === id)) onFramesChange(unlinkBefore(frames, id))
  }

  // only mount what is (nearly) on screen — documents can have thousands of pages
  const visible = spreads.filter((s) => {
    const y0 = ty + s.y * zoom
    return y0 + s.h * zoom >= scroll.y - 300 && y0 <= scroll.y + vp.h + 300
  })

  const viewportClass =
    'viewport' +
    (previewMode ? ' preview' : '') +
    (panning
      ? ' panning'
      : panMode
        ? ' pan'
        : linkFrom
          ? ' linking'
          : tool === 'zoom'
            ? ' zoomtool'
            : tool === 'type'
              ? ' texttool'
              : tool === 'select'
                ? ' selecttool'
                : '')

  // ── selection info for the properties panel and the thread lines ────────────────
  const selFrame = selectedId ? (frames.find((f) => f.id === selectedId) ?? null) : null
  const selChain = selFrame ? chainOf(frames, selFrame.id) : []
  const threadInfo = selFrame
    ? {
        index: selChain.findIndex((f) => f.id === selFrame.id),
        count: selChain.length,
        overflow: !!flow.get(selChain[selChain.length - 1].id)?.overflow,
      }
    : null
  const threadPairs = selChain.slice(1).map((b, i) => [selChain[i], b] as const)

  // what the panel's text controls show: the selected text's style, else the story's default
  const panelHead = selChain[0]
  const panelSel =
    panelHead && textSel && textSel.headId === panelHead.id && textSel.a !== textSel.b && textSel.b <= panelHead.text.length
      ? textSel
      : null
  const panelStyle: TextStyle | null = panelHead
    ? {
        ...(panelSel
          ? styleAtChar(normalizeRuns(panelHead.text, panelHead.runs, panelHead), panelSel.a, panelHead)
          : charStyleOf(panelHead)),
        align: panelHead.align,
      }
    : null

  /** the part of a frame's text to draw highlighted (frames that are not being edited) */
  const highlightFor = (fl: FrameFlow): [number, number] | null => {
    if (!textSel || textSel.headId !== fl.headId || textSel.a >= textSel.b) return null
    const a = Math.max(textSel.a, fl.start)
    const b = Math.min(textSel.b, fl.end)
    return a < b ? [a - fl.start, b - fl.start] : null
  }

  return (
    <div className="workspace">
      <div className="doc-tabs">
        <div className="doc-tab">
          <span>
            {doc.name}{dirty ? ' *' : ''} @ <bdi dir="ltr">{formatZoom(zoom)}</bdi>
          </span>
          {onClose && (
            <button className="doc-tab-close" aria-label="סגור מסמך" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      <div className="ws-main">
        <Toolbox tool={space ? 'hand' : tool} onSelect={setTool} previewMode={previewMode} onPreviewMode={onPreviewMode} />
        <div
          className="ws-center"
          style={{
            gridTemplateColumns: `${showRulers ? RULER : 0}px minmax(0, 1fr)`,
            gridTemplateRows: `${showRulers ? RULER : 0}px minmax(0, 1fr)`,
          }}
        >
          <div className="ruler-corner" />
          <Ruler orientation="h" offset={tx - scroll.x + vp.sb} zoom={zoom} unit={doc.unit} hidden={!showRulers} />
          <Ruler orientation="v" offset={ty - scroll.y} zoom={zoom} unit={doc.unit} hidden={!showRulers} />
          <div
            ref={vpRef}
            className={viewportClass}
            onScroll={(e) => setScroll({ x: getScrollX(e.currentTarget), y: e.currentTarget.scrollTop })}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
          >
            <div className="sheet" style={{ width: sheetW, height: sheetH }}>
              <svg width={sheetW} height={sheetH}>
                {visible.map((s) => (
                  <SpreadView key={s.y} doc={doc} spread={s} zoom={zoom} tx={tx} ty={ty} showGuides={showGuides && !previewMode} />
                ))}
              </svg>
              {frames.map((f) => {
                const fl = flow.get(f.id)
                if (!fl) return null
                return (
                  <TextFrameView
                    key={f.id}
                    frame={f}
                    style={fl.style}
                    slice={fl.slice}
                    runs={fl.runs}
                    highlight={highlightFor(fl)}
                    overflow={fl.overflow}
                    hasPrev={fl.prevId !== null}
                    zoom={zoom}
                    tx={tx}
                    ty={ty}
                    selected={f.id === selectedId}
                    editing={f.id === editingId}
                    armed={f.id === linkFrom}
                    showEdge={!previewMode}
                    request={request && request.frameId === f.id ? request : null}
                    onPointerDown={onFramePointerDown(f.id)}
                    onDoubleClick={() => {
                      if (!panMode) {
                        setSelectedId(f.id)
                        setEditingId(f.id)
                      }
                    }}
                    onHandleDown={onHandleDown(f.id)}
                    onOutPortDown={onOutPortDown(f.id)}
                    onInPortDown={onInPortDown(f.id)}
                    onEdit={(from, to, insert) => handleEdit(f.id, from, to, insert)}
                    onSelect={(a, b) => handleSelect(f.id, a, b)}
                    onCopyText={() => copyText(f.id)}
                    onBackspaceAtStart={() => backspaceAtStart(f.id)}
                    onStopEditing={() => setEditingId((c) => (c === f.id ? null : c))}
                  />
                )
              })}
              {!previewMode && threadPairs.length > 0 && (
                <svg className="thread-layer" width={sheetW} height={sheetH} aria-hidden="true">
                  <defs>
                    <marker id="thread-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 8 4 0 8z" fill="#ffb02e" />
                    </marker>
                  </defs>
                  {threadPairs.map(([a, b]) => (
                    <line
                      key={a.id}
                      className="thread-line"
                      markerEnd="url(#thread-arrow)"
                      x1={tx + a.x * zoom - 8}
                      y1={ty + (a.y + a.h) * zoom - 5}
                      x2={tx + (b.x + b.w) * zoom + 8}
                      y2={ty + b.y * zoom + 5}
                    />
                  ))}
                </svg>
              )}
              {draft && (
                <div
                  className="text-frame-draft"
                  style={{
                    left: tx + Math.min(draft.x0, draft.x1) * zoom,
                    top: ty + Math.min(draft.y0, draft.y1) * zoom,
                    width: Math.abs(draft.x1 - draft.x0) * zoom,
                    height: Math.abs(draft.y1 - draft.y0) * zoom,
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {(showPages || showProps) && (
          <div className="side-panels">
            {showPages && (
              <PagesPanel
                doc={doc}
                frames={frames}
                spreads={spreads}
                currentSpread={cur}
                selected={selPage}
                onSelect={selectPage}
                onInsert={insertPages}
                onDelete={deleteSelectedPage}
                onMove={movePage}
              />
            )}
            {showProps && (
          <PropertiesPanel
            frame={selFrame}
            style={panelStyle}
            scope={panelSel ? 'selection' : 'all'}
            unit={doc.unit}
            thread={threadInfo}
            onGeometry={(patch) => selFrame && updateFrame(selFrame.id, patch, `geo:${selFrame.id}`)}
            onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)}
            onAlign={(align) => selFrame && applyAlign(selFrame.id, align)}
            onLink={() => selFrame && setLinkFrom(selFrame.id)}
            onUnlink={() => selFrame && onFramesChange(unlinkBefore(frames, selFrame.id))}
          />
            )}
          </div>
        )}
      </div>

      <StatusBar
        zoom={zoom}
        onZoomTo={(z) => zoomAt(z, vp.w / 2, vp.h / 2)}
        onFitPage={() => fitPage()}
        onFitSpread={() => fitSpread()}
        spreadLabel={spreads[cur].label}
        spreadIndex={cur}
        spreadCount={spreads.length}
        onGo={goTo}
        onGoToPage={goToPage}
      />
    </div>
  )
}
