import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import {
  DEFAULT_GUIDE_COLOR,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_TEXT_STYLE,
  MAX_GUIDES,
  MAX_PAGE_PT,
  MIN_FRAME_PT,
  marginsOf,
  maxMargin,
  minPageSize,
  pageSize,
  validateDoc,
  withPageMargins,
  withPageSize,
  type Assets,
  type CharStyle,
  type DocSettings,
  type Guide,
  type GuideAxis,
  type DrawKind,
  type ShapeFrame,
  type Sides,
  type ImageFit,
  type ImageFrame,
  type Run,
  type TextAlign,
  type TextFrame,
  type TextStyle,
} from '../document'
import { isTyping } from '../dom'
import { HANDLES, chainOf, dragBox, linkFrames, removeFrame, unlinkBefore, type Box, type HandleId } from '../frames'
import type { PlacedImage } from '../importImage'
import { countWords, type PlacedText } from '../importText'
import { applyGuideSpec, snapGuide, type GuideSnap } from '../guides'
import { computeLayout, pageMargins, pageSidesOf } from '../layout'
import { boxAtClick, pourText, type FlowMode } from '../placeText'
import { ownerPage, pageRects } from '../pages'
import { caretOffsetAt } from '../richtext'
import { CORNERS, fitRadii, regularRatio, type ShapePrefs } from '../shapes'
import { snapEdges, snapLinesOf, type SnapLine } from '../snapping'
import { combineShapes, type BoolOp } from '../shapeOps'
import { arrange, nextZ, stackOrder, type ArrangeOp } from '../stacking'
import { charStyleOf, editStory, normalizeRuns, styleAtChar, styleRange } from '../story'
import { flowFrames, type FrameFlow } from '../textLayout'
import { wrapFloatsFor } from '../wrap'
import { ContextMenu } from './ContextMenu'
import { CreateGuidesDialog, type CreateGuidesRequest } from './CreateGuidesDialog'
import { GuideProperties } from './GuideProperties'
import { ImageFrameView } from './ImageFrameView'
import { ImageProperties } from './ImageProperties'
import { MultiSelectionPanel } from './MultiSelectionPanel'
import { CORNER_HANDLE_OFFSET, ShapeFrameView } from './ShapeFrameView'
import { ShapeProperties } from './ShapeProperties'
import { ShapeToolDialog } from './ShapeToolDialog'
import { PagesPanel, type InsertWhere } from './PagesPanel'
import { PageToolBar } from './PageToolBar'
import { PropertiesPanel } from './PropertiesPanel'
import type { SelRequest } from './RichEditor'
import { Ruler } from './Ruler'
import { SpreadView } from './SpreadView'
import { StatusBar, formatZoom } from './StatusBar'
import { UNIT_OPTIONS, formatLength, type Unit } from '../units'
import { TextFrameView } from './TextFrameView'
import { TOOLS, Toolbox, type ToolId } from './Toolbox'
import type { PageOps, TabView } from '../useDocumentSession'

/** pasteboard around the pages, screen px */
const PAD = 120
const RULER = 20
const FIT_MARGIN = 40
/** how far a guide sticks out beyond its page, screen px */
const GUIDE_OVER = 14
/** a dragged guide is held on another guide when it is this close, screen px */
const SNAP_PX = 6
/** thickness of the area that grabs a margin line, screen px */
const MARGIN_HIT = 9
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
  /** move the selected object in the stacking order */
  arrange: (op: ArrangeOp) => void
  /** combine the selected shapes (unite, subtract, intersect, exclude) */
  shapeOp: (op: BoolOp) => void
  /** open the dialog that creates several guides at once */
  createGuides: () => void
  /** delete the guides of the selected page */
  clearGuides: () => void
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
  /** text waiting to be placed (the loaded text cursor), or null */
  placing: PlacedText | null
  onPlacingChange: (placed: PlacedText | null) => void
  images: ImageFrame[]
  assets: Assets
  onImagesChange: (images: ImageFrame[], coalesceKey?: string) => void
  /** pictures waiting to be placed (the loaded image cursor); the first is placed by the next click */
  placingImages: PlacedImage[]
  onPlacingImagesChange: (images: PlacedImage[]) => void
  guides: Guide[]
  onGuidesChange: (guides: Guide[], coalesceKey?: string) => void
  shapes: ShapeFrame[]
  onShapesChange: (shapes: ShapeFrame[], coalesceKey?: string) => void
  /** what the shape tools make by a click (size, corners of the polygon), kept by the app between documents */
  shapePrefs: ShapePrefs
  onShapePrefs: (prefs: ShapePrefs) => void
  /** guides are hidden by the View menu: show them again (when the user makes one) */
  onShowGuides: () => void
  /** the document has changes that are not saved yet */
  dirty?: boolean
  onClose?: () => void
  /** the tab strip of the open documents; it gets the zoom text of this view to show on the active tab */
  renderTabs?: (zoomText: string) => ReactNode
  /** where the view was when this document was left: shown again instead of fitting the first spread */
  initialView?: TabView | null
  /** called when the workspace goes away (another document is shown) with the view it had */
  onLeaveView?: (view: TabView) => void
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
  placing,
  onPlacingChange,
  images,
  assets,
  onImagesChange,
  placingImages,
  onPlacingImagesChange,
  guides,
  onGuidesChange,
  shapes,
  onShapesChange,
  shapePrefs,
  onShapePrefs,
  onShowGuides,
  dirty,
  onClose,
  renderTabs,
  initialView,
  onLeaveView,
  ref,
}: Props) {
  const { spreads, bounds } = useMemo(() => computeLayout(doc), [doc])
  const flow = useMemo(() => flowFrames(frames, images), [frames, images])
  /** stacking rank of every object (1 = the back) */
  const rank = useMemo(() => new Map(stackOrder(frames, images, shapes).map((o, i) => [o.id, i + 1])), [frames, images, shapes])
  const rects = useMemo(() => pageRects(doc), [doc])
  /** the page that Insert / Delete act on (the last one clicked) */
  const [selectedPage, setSelectedPage] = useState(0)
  const pendingNav = useRef<number | null>(null)
  const [flowMode, setFlowMode] = useState<FlowMode>('auto')
  /** modifier keys held when the placing click started */
  const placeMods = useRef({ shift: false, alt: false })

  const vpRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0, sb: 0 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [view, setView] = useState<View>({ zoom: 1, anchor: null })
  const [tool, setTool] = useState<ToolId>('select')
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  /** the selected text frame or picture (guides have their own, multiple, selection) */
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null)
  const [guideSel, setGuideSel] = useState<string[]>([])
  /** several selected text frames / pictures / shapes (then `selectedId` is null) */
  const [multiSel, setMultiSel] = useState<string[]>([])
  const setSelectedId = (id: string | null) => {
    setSelectedIdRaw(id)
    if (id) {
      setGuideSel([])
      setMultiSel([])
    }
  }
  const selectGuides = (ids: string[]) => {
    setGuideSel(ids)
    setSelectedIdRaw(null)
  }
  /** rubber band (world pt) while dragging over the canvas with the Selection tool: it selects the guides it touches */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  /** the snapping lines of the document, and the ones an object is held on right now (drawn while dragging) */
  const snapLines = useMemo(() => snapLinesOf(doc, guides), [doc, guides])
  const snapLinesRef = useRef(snapLines)
  snapLinesRef.current = snapLines
  const [snapShown, setSnapShown] = useState<SnapLine[]>([])
  const marqueeBase = useRef<{ guides: string[]; objects: string[] } | null>(null)
  /** moving several selected objects together: where each one was, and where the pointer started */
  const groupDrag = useRef<{ origins: Map<string, { x: number; y: number }>; start: { x: number; y: number }; key: string } | null>(null)
  /** the right-click menu of the rulers (units), at a screen position */
  const [rulerMenu, setRulerMenu] = useState<{ x: number; y: number } | null>(null)
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
  const frameDrag = useRef<{ id: string; mode: 'move' | HandleId; start: { x: number; y: number }; orig: Box; key: string; kind: 'frame' | 'image' | 'shape' } | null>(null)
  const dragSeq = useRef(0)
  /** drawing a shape with a shape tool: where it started, and the box it has now (world pt) */
  const shapeStart = useRef<{ kind: DrawKind; x: number; y: number } | null>(null)
  const [shapeBox, setShapeBox] = useState<Box | null>(null)
  /** the last pointer position while drawing, and whether Enter is held: pressing a key refreshes the preview without moving the mouse */
  const lastShapePointer = useRef<{ x: number; y: number } | null>(null)
  const enterHeld = useRef(false)
  const shapeBoxRef = useRef<Box | null>(null)
  /** rounding a rectangle's corners: the shape, the corners taking part (the one grabbed, plus the ones swept over) and the grab offset */
  const cornerDrag = useRef<{ id: string; corners: number[]; grab: number; key: string } | null>(null)
  const [hotCorners, setHotCorners] = useState<number[]>([])
  /** the settings window of a shape tool (double click on the tool) */
  const [toolDialog, setToolDialog] = useState<DrawKind | null>(null)
  /** dragging one margin line of the Page tool: which side (physical) and the page it is on */
  /** the dragged page has the same height as the pages beside it: where the dashed line goes (world y) and how far it reaches */
  const [pageSnap, setPageSnap] = useState<{ world: number; span: [number, number]; height: number } | null>(null)
  const marginDrag = useRef<{ edge: keyof Sides; page: number; key: string } | null>(null)
  /** a guide being dragged out of a ruler or moved (not yet stored); `remove` = it is over a ruler / panel, so letting go deletes it */
  const [guideDrag, setGuideDrag] = useState<{ id: string | null; axis: GuideAxis; page: number; pos: number; color: string; remove: boolean; snap: GuideSnap | null } | null>(null)
  /** the color new guides get: the last one the user chose */
  const [guideColor, setGuideColor] = useState(DEFAULT_GUIDE_COLOR)
  const [guidesDialog, setGuidesDialog] = useState(false)
  const latestGuides = useRef(guides)
  latestGuides.current = guides
  /** resizing the pages by a handle of the Page tool: the current size and the last pointer position (screen px) */
  const pageDrag = useRef<{ mode: HandleId; x: number; y: number; w: number; h: number; key: string } | null>(null)

  const zoom = view.zoom
  const guidesVisible = showGuides && !previewMode

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
    const p = s.pages.find((x) => x.index === selectedPage) ?? s.pages[0]
    fitRect(p.x, s.y, p.w, p.h)
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
    const nf = flowFrames(next, images)
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
    if (!editingId) {
      // not editing text: select every object of the document
      const ids = [...frames, ...images, ...shapes].map((o) => o.id)
      setGuideSel([])
      if (ids.length > 1) {
        setMultiSel(ids)
        setSelectedIdRaw(null)
      } else {
        setMultiSel([])
        setSelectedIdRaw(ids[0] ?? null)
      }
      return
    }
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


  /**
   * Pour the loaded text into a frame at `target`. Shift = semi-automatic, Alt = automatic, otherwise the mode
   * chosen in the banner. The whole result is one undo step.
   */
  const doPlace = (target: { box: Box; frameId?: string }, mods: { shift: boolean; alt: boolean }) => {
    if (!placing) return
    const mode: FlowMode = mods.shift ? 'semi' : mods.alt ? 'auto' : flowMode
    const result = pourText(doc, frames, images, placing, target, mode, shapes)
    pageOps.commit(result.content)
    setSelectedId(result.headId)
    setEditingId(null)
    onPlacingChange(result.remaining)
  }

  /**
   * Put the first loaded picture on the page. A dragged rectangle: the picture is fitted into it keeping its shape.
   * A click: natural size (one pixel = one point), scaled down to fit the text area, kept on the page.
   */
  const placeImage = (rect: Box | null, at: { x: number; y: number }) => {
    const next = placingImages[0]
    if (!next) return
    const { asset, assetId } = next
    const page = rects[ownerPage(rects, at.x, at.y)]
    let w: number
    let h: number
    let x: number
    let y: number
    if (rect) {
      const s = Math.min(rect.w / asset.width, rect.h / asset.height)
      ;[w, h, x, y] = [asset.width * s, asset.height * s, rect.x, rect.y]
    } else {
      const pm = marginsOf(doc, ownerPage(rects, at.x, at.y))
      const maxW = page.w - pm.left - pm.right
      const maxH = page.h - pm.top - pm.bottom
      const s = Math.min(1, maxW / asset.width, maxH / asset.height)
      w = asset.width * s
      h = asset.height * s
      x = Math.min(Math.max(at.x, page.x), page.x + page.w - w)
      y = Math.min(Math.max(at.y, page.y), page.y + page.h - h)
    }
    const frame: ImageFrame = { id: newFrameId(), x, y, w: Math.max(MIN_FRAME_PT, w), h: Math.max(MIN_FRAME_PT, h), assetId, fit: 'fill', z: nextZ(frames, images, shapes) }
    pageOps.commit({ images: [...images, frame], assets: assets[assetId] ? assets : { ...assets, [assetId]: asset } })
    setSelectedId(frame.id)
    setEditingId(null)
    onPlacingImagesChange(placingImages.slice(1))
  }

  /** clicking a picture: the Selection tool selects it and starts moving it (other tools pass the click on) */
  const onImagePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0 || tool !== 'select') return
    const im = images.find((x) => x.id === id)
    if (!im) return
    if (handleMultiPointer(id, e)) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedPage(ownerPage(rects, im.x + im.w / 2, im.y + im.h / 2))
    setSelectedId(id)
    setEditingId(null)
    beginFrameDrag(e, id, 'move')
  }

  const updateShape = (id: string, patch: Partial<ShapeFrame>, key?: string) =>
    onShapesChange(shapes.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)), key)

  const updateImage = (id: string, patch: Partial<ImageFrame>, key?: string) =>
    onImagesChange(images.map((im) => (im.id === id ? { ...im, ...patch } : im)), key)

  /** move an object in the stacking order (frames and pictures together): one undo step */
  const arrangeObject = (id: string | null, op: ArrangeOp) => {
    if (!id) return
    const r = arrange(frames, images, id, op, shapes)
    if (r) pageOps.commit(r)
  }

  // ── ruler guides ───────────────────────────────────────────────────────────────
  const newGuideId = () => globalThis.crypto?.randomUUID?.() ?? `g${Date.now()}${Math.random()}`

  /**
   * Drag a guide: out of a ruler (`id` = null, a new one) or an existing one. The guide follows the pointer without
   * touching the document; letting go over the canvas stores it (one undo step), over a ruler or a panel deletes it.
   */
  const beginGuideDrag = (axis: GuideAxis, id: string | null, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const orig = id ? guides.find((g) => g.id === id) : undefined
    if (id && !orig) return
    const color = orig?.color ?? guideColor
    let last: { page: number; pos: number; remove: boolean; snap: GuideSnap | null } | null = orig ? { page: orig.page, pos: orig.pos, remove: false, snap: null } : null
    if (orig) {
      selectGuides([orig.id])
      setEditingId(null)
      setGuideDrag({ id, axis, color, ...last! })
    }

    const onMove = (ev: PointerEvent) => {
      const box = vpRef.current!.getBoundingClientRect()
      const inside = ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom
      const p = toWorld(ev.clientX, ev.clientY)
      const page = ownerPage(rects, p.x, p.y)
      const r = rects[page]
      let pos = Math.round((axis === 'h' ? p.y - r.y : p.x - r.x) * 100) / 100
      // lining up with a guide on another page: hold the exact same coordinate and show it (Alt = no snapping)
      const snap = ev.altKey || !inside ? null : snapGuide(axis, axis === 'h' ? r.y + pos : r.x + pos, page, id, latestGuides.current, rects, SNAP_PX / live.current.zoom)
      if (snap) pos = Math.round((snap.world - (axis === 'h' ? r.y : r.x)) * 1000) / 1000
      last = { page, pos, remove: !inside, snap }
      setGuideDrag({ id, axis, color, ...last })
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setGuideDrag(null)
      if (!commit || !last) return
      const cur = latestGuides.current
      if (last.remove) {
        if (id) {
          onGuidesChange(cur.filter((g) => g.id !== id))
          setGuideSel([])
        }
      } else if (orig) {
        if (last.page !== orig.page || last.pos !== orig.pos) {
          const to = last
          onGuidesChange(cur.map((g) => (g.id === id ? { ...g, page: to.page, pos: to.pos } : g)))
        }
      } else if (cur.length < MAX_GUIDES) {
        const g: Guide = { id: newGuideId(), page: last.page, axis, pos: last.pos, color }
        onGuidesChange([...cur, g])
        selectGuides([g.id])
        setEditingId(null)
        onShowGuides()
      }
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  /** a click on a guide: Shift / Ctrl adds it to (or removes it from) the selection, a drag of a selected group moves the whole group */
  const onGuidePointerDown = (g: Guide, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      selectGuides(guideSel.includes(g.id) ? guideSel.filter((x) => x !== g.id) : [...guideSel, g.id])
      setEditingId(null)
      return
    }
    if (guideSel.length > 1 && guideSel.includes(g.id)) {
      e.preventDefault()
      e.stopPropagation()
      const start = toWorld(e.clientX, e.clientY)
      const chosen = new Set(guideSel)
      const origin = new Map(guides.filter((x) => chosen.has(x.id)).map((x) => [x.id, x.pos]))
      dragSeq.current += 1
      const key = `guidegroup:${dragSeq.current}`
      const onMove = (ev: PointerEvent) => {
        const p = toWorld(ev.clientX, ev.clientY)
        const dx = p.x - start.x
        const dy = p.y - start.y
        if (dx === 0 && dy === 0) return
        onGuidesChange(
          latestGuides.current.map((x) => (chosen.has(x.id) ? { ...x, pos: Math.round((origin.get(x.id)! + (x.axis === 'h' ? dy : dx)) * 100) / 100 } : x)),
          key,
        )
      }
      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
      return
    }
    beginGuideDrag(g.axis, g.id, e)
  }

  /** the ids of the text frames, pictures and shapes that touch a world rectangle */
  const objectsInRect = (x0: number, y0: number, x1: number, y1: number): string[] => {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)]
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)]
    return [...frames, ...images, ...shapes].filter((o) => o.x < bx && o.x + o.w > ax && o.y < by && o.y + o.h > ay).map((o) => o.id)
  }

  /** the selected objects (several selected: `multiSel`; one: `selectedId`) that still exist */
  const chosenObjects = () => {
    const ids = new Set(selectedId ? [selectedId] : multiSel)
    return [...frames, ...images, ...shapes].filter((o) => ids.has(o.id))
  }

  /** move objects (by id → where each was) by an offset; the three kinds change together and share one undo step per key */
  const offsetObjects = (origins: Map<string, { x: number; y: number }>, dx: number, dy: number, key: string) => {
    const shift = <T extends { id: string; x: number; y: number }>(list: T[]): T[] =>
      list.some((o) => origins.has(o.id)) ? list.map((o) => (origins.has(o.id) ? { ...o, x: origins.get(o.id)!.x + dx, y: origins.get(o.id)!.y + dy } : o)) : list
    const f = shift(frames)
    const i = shift(images)
    const s = shift(shapes)
    if (f !== frames) onFramesChange(f, key)
    if (i !== images) onImagesChange(i, key)
    if (s !== shapes) onShapesChange(s, key)
  }

  /**
   * Combine the selected shapes into one (a single undo step). The shapes are taken from the back to the front, so
   * "subtract" cuts the back shape with the ones on top of it, and the result has the back shape's colors.
   */
  const combineSelectedShapes = (op: BoolOp) => {
    const chosen = new Set(selectedId ? [selectedId] : multiSel)
    const picked = shapes.filter((sh) => chosen.has(sh.id))
    if (picked.length < 2) return
    const rankOf = new Map(stackOrder(frames, images, shapes).map((o, i) => [o.id, i]))
    const ordered = [...picked].sort((a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0))
    const merged = combineShapes(ordered, op)
    const rest = shapes.filter((sh) => !chosen.has(sh.id))
    if (!merged) {
      // nothing is left of them (for example a shape completely covered by the one that subtracts it)
      pageOps.commit({ shapes: rest })
      setMultiSel([])
      setSelectedIdRaw(null)
      return
    }
    // subtracting leaves the back shape where it was; the other operations take the place of the front-most shape
    const z = op === 'subtract' ? ordered[0].z : ordered[ordered.length - 1].z
    const shape: ShapeFrame = { id: newFrameId(), kind: 'path', x: merged.x, y: merged.y, w: merged.w, h: merged.h, geom: merged.geom, fill: merged.fill, stroke: merged.stroke, strokeWidth: merged.strokeWidth, z }
    pageOps.commit({ shapes: [...rest, shape] })
    setMultiSel([])
    setGuideSel([])
    setSelectedIdRaw(shape.id)
    setSelectedPage(ownerPage(rects, shape.x + shape.w / 2, shape.y + shape.h / 2))
  }

  /** delete text frames, pictures, shapes and guides in one undo step */
  const deleteSelection = (ids: string[], guideIds: string[]) => {
    const gone = new Set(ids)
    const goneGuides = new Set(guideIds)
    pageOps.commit({
      frames: ids.reduce((acc, id) => (acc.some((f) => f.id === id) ? removeFrame(acc, id) : acc), frames),
      images: images.filter((im) => !gone.has(im.id)),
      shapes: shapes.filter((sh) => !gone.has(sh.id)),
      guides: goneGuides.size ? guides.filter((g) => !goneGuides.has(g.id)) : guides,
    })
    setMultiSel([])
    setGuideSel([])
    setSelectedIdRaw(null)
  }

  /**
   * Shift / Ctrl + click adds an object to the selection or removes it; dragging one of several selected objects moves
   * them all. Returns true when this took the click.
   */
  const handleMultiPointer = (id: string, e: ReactPointerEvent<Element>): boolean => {
    const current = selectedId ? [selectedId] : multiSel
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.stopPropagation()
      e.preventDefault()
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      setGuideSel([])
      setEditingId(null)
      if (next.length > 1) {
        setMultiSel(next)
        setSelectedIdRaw(null)
      } else {
        setMultiSel([])
        setSelectedIdRaw(next[0] ?? null)
      }
      return true
    }
    if (multiSel.length > 1 && multiSel.includes(id)) {
      e.stopPropagation()
      e.preventDefault()
      const origins = new Map(chosenObjects().map((o) => [o.id, { x: o.x, y: o.y }]))
      dragSeq.current += 1
      groupDrag.current = { origins, start: toWorld(e.clientX, e.clientY), key: `group:${dragSeq.current}` }
      vpRef.current!.setPointerCapture(e.pointerId)
      return true
    }
    return false
  }

  /** the guides that touch a world rectangle (a guide is a thin line, so it gets a few pixels of reach) */
  const guidesInRect = (x0: number, y0: number, x1: number, y1: number): string[] => {
    const reach = 3 / zoom
    const [minX, maxX] = [Math.min(x0, x1) - reach, Math.max(x0, x1) + reach]
    const [minY, maxY] = [Math.min(y0, y1) - reach, Math.max(y0, y1) + reach]
    return latestGuides.current
      .filter((g) => {
        const r = rects[g.page]
        if (!r) return false
        return g.axis === 'h'
          ? r.y + g.pos >= minY && r.y + g.pos <= maxY && r.x <= maxX && r.x + r.w >= minX
          : r.x + g.pos >= minX && r.x + g.pos <= maxX && r.y <= maxY && r.y + r.h >= minY
      })
      .map((g) => g.id)
  }

  const updateGuide = (id: string, patch: Partial<Guide>, key?: string) =>
    onGuidesChange(guides.map((g) => (g.id === id ? { ...g, ...patch } : g)), key)

  const applyGuideRequest = (r: CreateGuidesRequest) => {
    const pages = r.allPages ? Array.from({ length: doc.pages }, (_, i) => i) : [selPage]
    setGuideColor(r.color)
    onGuidesChange(applyGuideSpec(doc, pageSidesOf(doc), guides, pages, r.spec, r.color, r.replace, newGuideId))
    setGuidesDialog(false)
    onShowGuides()
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
    arrange: (op) => arrangeObject(selectedId, op),
    shapeOp: (op) => combineSelectedShapes(op),
    createGuides: () => setGuidesDialog(true),
    clearGuides: () => {
      if (guides.some((g) => g.page === selPage)) onGuidesChange(guides.filter((g) => g.page !== selPage))
    },
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
  const startView = useRef(initialView ?? null)
  useLayoutEffect(() => {
    if (!ready) return
    const back = startView.current
    if (back) {
      // coming back to a document: the view is where it was left
      startView.current = null
      applyView(back.zoom, back.cx, back.cy, vp.w / 2, vp.h / 2)
    } else fitSpread(0)
  }, [fitKey, ready])

  // when this document goes out of view, tell where the view was
  const leaveView = useRef(onLeaveView)
  leaveView.current = onLeaveView
  const lastView = useRef<TabView | null>(null)
  if (ready) lastView.current = { zoom, cx: (scroll.x + vp.w / 2 - tx) / zoom, cy: (scroll.y + vp.h / 2 - ty) / zoom }
  useEffect(
    () => () => {
      if (lastView.current) leaveView.current?.(lastView.current)
    },
    [],
  )

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
      const t = TOOLS.find((t) => t.enabled && t.code === e.code && !!t.shift === e.shiftKey)
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

  // Delete removes the selected frame or guides, arrows nudge them (Shift = 10 pt), Escape deselects / cancels linking
  useEffect(() => {
    const guidesSelected = guidesVisible && guideSel.length > 0
    if (!selectedId && !linkFrom && !guidesSelected && multiSel.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        if (linkFrom) setLinkFrom(null)
        else {
          setSelectedId(null)
          setGuideSel([])
          setMultiSel([])
        }
      } else if ((guidesSelected || multiSel.length > 0) && (e.key === 'Delete' || e.key === 'Backspace')) {
        // everything that is selected — objects and guides — goes in one step
        e.preventDefault()
        deleteSelection(multiSel, guidesSelected ? guideSel : [])
      } else if (multiSel.length > 0 && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
        if (dx || dy) offsetObjects(new Map(chosenObjects().map((o) => [o.id, { x: o.x, y: o.y }])), dx, dy, 'nudge:group')
      } else if (guidesSelected && e.key.startsWith('Arrow')) {
        // a guide moves along its own axis only
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const chosen = new Set(guideSel)
        const along = (axis: GuideAxis) =>
          axis === 'h' ? (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) : e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        if (guides.some((g) => chosen.has(g.id) && along(g.axis) !== 0)) {
          onGuidesChange(guides.map((g) => (chosen.has(g.id) ? { ...g, pos: g.pos + along(g.axis) } : g)), 'nudge:guides')
        }
      } else if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        if (shapes.some((sh) => sh.id === selectedId)) onShapesChange(shapes.filter((sh) => sh.id !== selectedId))
        else if (images.some((im) => im.id === selectedId)) onImagesChange(images.filter((im) => im.id !== selectedId))
        else onFramesChange(removeFrame(frames, selectedId))
        setSelectedId(null)
      } else if (selectedId && e.key.startsWith('Arrow')) {
        const f = frames.find((x) => x.id === selectedId) ?? images.find((x) => x.id === selectedId) ?? shapes.find((x) => x.id === selectedId)
        if (!f) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const moved = {
          x: f.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
          y: f.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
        }
        if (shapes.some((sh) => sh.id === f.id)) {
          onShapesChange(shapes.map((sh) => (sh.id === f.id ? { ...sh, ...moved } : sh)), `nudge:${f.id}`)
          return
        }
        if (images.some((im) => im.id === f.id)) {
          onImagesChange(images.map((im) => (im.id === f.id ? { ...im, ...moved } : im)), `nudge:${f.id}`)
          return
        }
        updateFrame(f.id, moved, `nudge:${f.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, multiSel, guideSel, guidesVisible, linkFrom, frames, images, shapes, guides, onFramesChange, onImagesChange, onShapesChange, onGuidesChange])


  // while a shape is being drawn, Shift / Alt / Ctrl / Enter change it at once, even if the mouse does not move
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enterHeld.current = e.type === 'keydown'
      const at = lastShapePointer.current
      if (!shapeStart.current || !at) return
      if (e.key === 'Enter') e.preventDefault()
      updateShapeDraft(at.x, at.y, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey })
    }
    const release = () => {
      enterHeld.current = false
    }
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', release)
    }
  }, [])

  // Escape drops the loaded pictures
  useEffect(() => {
    if (placingImages.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPlacingImagesChange([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placingImages])

  // Escape drops the loaded text
  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPlacingChange(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

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

  /** a dragged point held on the page edges, margins, column edges and guides (each coordinate on its own); `off` skips it */
  const snapPoint = (p: { x: number; y: number }, off: boolean) => {
    if (off) return { p, lines: [] as SnapLine[] }
    const tol = SNAP_PX / live.current.zoom
    const sx = snapEdges([p.x], snapLinesRef.current.v, tol)
    const sy = snapEdges([p.y], snapLinesRef.current.h, tol)
    return { p: { x: p.x + (sx?.delta ?? 0), y: p.y + (sy?.delta ?? 0) }, lines: [sx?.line, sy?.line].filter((l): l is SnapLine => !!l) }
  }

  /**
   * A moved or resized object: the edges that move are held exactly on a line when one is near. The move / resize gets
   * corrected offsets, and the lines to show.
   */
  const snapDrag = (orig: Box, mode: 'move' | HandleId, dx: number, dy: number) => {
    const tol = SNAP_PX / live.current.zoom
    const move = mode === 'move'
    const xs = move ? [orig.x + dx, orig.x + orig.w + dx] : [...(mode.includes('w') ? [orig.x + dx] : []), ...(mode.includes('e') ? [orig.x + orig.w + dx] : [])]
    const ys = move ? [orig.y + dy, orig.y + orig.h + dy] : [...(mode.includes('n') ? [orig.y + dy] : []), ...(mode.includes('s') ? [orig.y + orig.h + dy] : [])]
    const sx = xs.length ? snapEdges(xs, snapLinesRef.current.v, tol) : null
    const sy = ys.length ? snapEdges(ys, snapLinesRef.current.h, tol) : null
    return { dx: dx + (sx?.delta ?? 0), dy: dy + (sy?.delta ?? 0), lines: [sx?.line, sy?.line].filter((l): l is SnapLine => !!l) }
  }

  /**
   * The box of the shape being drawn for a pointer position. Free by default, from the starting corner towards the
   * pointer in any direction. Shift (or Enter) keeps it exactly regular — a square, a circle, a hexagon with equal sides —
   * so only the size follows the pointer. Alt (or Ctrl) grows it from its middle out to all sides.
   */
  const updateShapeDraft = (clientX: number, clientY: number, m: { shift: boolean; alt: boolean; ctrl: boolean }) => {
    const s0 = shapeStart.current
    if (!s0) return
    lastShapePointer.current = { x: clientX, y: clientY }
    const snapped = snapPoint(toWorld(clientX, clientY), false)
    const p = snapped.p
    setSnapShown(snapped.lines)
    let dx = p.x - s0.x
    let dy = p.y - s0.y
    if (m.shift || enterHeld.current) {
      const ratio = regularRatio(s0.kind, shapePrefs.polygon.sides)
      // the size follows the pointer's larger reach, in the shape's own proportions
      const h = Math.max(Math.abs(dy), Math.abs(dx) / ratio)
      dy = Math.sign(dy || 1) * h
      dx = Math.sign(dx || 1) * h * ratio
    }
    const box: Box =
      m.alt || m.ctrl
        ? { x: s0.x - Math.abs(dx), y: s0.y - Math.abs(dy), w: 2 * Math.abs(dx), h: 2 * Math.abs(dy) }
        : { x: Math.min(s0.x, s0.x + dx), y: Math.min(s0.y, s0.y + dy), w: Math.abs(dx), h: Math.abs(dy) }
    shapeBoxRef.current = box
    setShapeBox(box)
  }

  /** a new shape of a kind, with the tool's settings */
  const newShape = (kind: DrawKind, box: Box): ShapeFrame => {
    const r = kind === 'rect' ? shapePrefs.rect.radius : 0
    return {
      id: newFrameId(),
      kind,
      ...box,
      ...(kind === 'polygon' ? { sides: shapePrefs.polygon.sides } : {}),
      ...(r > 0 ? { radii: [r, r, r, r] as [number, number, number, number] } : {}),
      fill: DEFAULT_SHAPE_FILL,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: 1,
      z: nextZ(frames, images, shapes),
    }
  }

  /** clicking a shape with the Selection tool selects it and starts moving it (the shape tools draw a new one instead) */
  const onShapePointerDown = (id: string) => (e: ReactPointerEvent<SVGPathElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0 || tool !== 'select') return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    if (handleMultiPointer(id, e)) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedPage(ownerPage(rects, sh.x + sh.w / 2, sh.y + sh.h / 2))
    setSelectedId(id)
    setEditingId(null)
    beginFrameDrag(e as unknown as ReactPointerEvent<HTMLElement>, id, 'move')
  }

  /** grabbing a rounding handle: only that corner is rounded until the pointer passes over another corner's handle */
  const onCornerDown = (id: string) => (corner: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    const c = CORNERS[corner]
    const p = toWorld(e.clientX, e.clientY)
    const inward = ((p.x - (sh.x + c.fx * sh.w)) * c.sx + (p.y - (sh.y + c.fy * sh.h)) * c.sy) / 2
    dragSeq.current += 1
    cornerDrag.current = { id, corners: [corner], grab: inward - fitRadii(sh.radii, sh.w, sh.h)[corner], key: `round:${dragSeq.current}` }
    setHotCorners([corner])
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const moveCorner = (d: NonNullable<typeof cornerDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const sh = shapes.find((x) => x.id === d.id)
    if (!sh) return
    const p = toWorld(e.clientX, e.clientY)
    const maxR = Math.min(sh.w, sh.h) / 2
    const shown = fitRadii(sh.radii, sh.w, sh.h)
    // passing over the rounding handle of another corner while the button is held adds that corner
    const reach = 12 / live.current.zoom
    CORNERS.forEach((c, k) => {
      if (d.corners.includes(k)) return
      const at = shown[k] + CORNER_HANDLE_OFFSET / live.current.zoom
      const hx = sh.x + c.fx * sh.w + c.sx * at
      const hy = sh.y + c.fy * sh.h + c.sy * at
      if (Math.hypot(p.x - hx, p.y - hy) <= reach) d.corners = [...d.corners, k]
    })
    setHotCorners(d.corners)
    // the radius follows the pointer's distance in from the first corner that was grabbed
    const c0 = CORNERS[d.corners[0]]
    const inward = ((p.x - (sh.x + c0.fx * sh.w)) * c0.sx + (p.y - (sh.y + c0.fy * sh.h)) * c0.sy) / 2
    const r = Math.round(Math.min(maxR, Math.max(0, inward - d.grab)) * 100) / 100
    const radii = [...(sh.radii ?? [0, 0, 0, 0])] as [number, number, number, number]
    for (const k of d.corners) radii[k] = r
    onShapesChange(shapes.map((x) => (x.id === d.id ? { ...x, radii } : x)), d.key)
  }

  const beginFrameDrag = (e: ReactPointerEvent<HTMLElement>, id: string, mode: 'move' | HandleId) => {
    const isImage = images.some((x) => x.id === id)
    const isShape = shapes.some((x) => x.id === id)
    const f = isImage ? images.find((x) => x.id === id) : isShape ? shapes.find((x) => x.id === id) : frames.find((x) => x.id === id)
    if (!f) return
    dragSeq.current += 1
    frameDrag.current = {
      id,
      mode,
      start: toWorld(e.clientX, e.clientY),
      orig: { x: f.x, y: f.y, w: f.w, h: f.h },
      key: `drag:${dragSeq.current}`,
      kind: isImage ? 'image' : isShape ? 'shape' : 'frame',
    }
    vpRef.current!.setPointerCapture(e.pointerId)
  }

  /** the Page tool changes every page at once instead of only the selected one */
  const [sizeAll, setSizeAll] = useState(false)
  /** the settings with the selected page (or all pages) given a new size */
  const sizedDoc = (w: number, h: number) => withPageSize(doc, sizeAll ? 'all' : selPage, w, h)
  /** change the size of the selected page (typed values and dragging share one undo step per gesture) */
  const setPageSize = (w: number, h: number, key: string) => {
    const min = minPageSize(doc)
    const round = (v: number, lo: number) => Math.round(Math.min(MAX_PAGE_PT, Math.max(lo, v)) * 1000) / 1000
    const width = round(w, min.w)
    const height = round(h, min.h)
    const cur = pageSize(doc, selPage)
    if (width !== cur.w || height !== cur.h) pageOps.setup(sizedDoc(width, height), key)
  }

  /** where the selected page's edges are on screen (px, inside the sheet) if the pages had these settings */
  const pageEdges = (d: DocSettings) => {
    const lay = computeLayout(d)
    const b = lay.bounds
    const ox = Math.max(PAD, (vp.w - (b.maxX - b.minX) * zoom) / 2)
    const oy = Math.max(PAD, (vp.h - (b.maxY - b.minY) * zoom) / 2)
    const r = pageRects(d)[selPage]
    const left = ox - b.minX * zoom + r.x * zoom
    const top = oy - b.minY * zoom + r.y * zoom
    return { left, right: left + r.w * zoom, top, bottom: top + r.h * zoom }
  }

  /**
   * A handle of the Page tool. The pages are laid out from a fixed corner (and centered while they fit in the window),
   * so how far an edge moves for a change of size depends on the layout: measure it, so the dragged edge follows the
   * pointer. An edge that the layout keeps in place grows the page away from it instead.
   */
  const onPageHandleDown = (mode: HandleId, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    dragSeq.current += 1
    const cur = pageSize(doc, selPage)
    pageDrag.current = { mode, x: e.clientX, y: e.clientY, w: cur.w, h: cur.h, key: `pagesize:${dragSeq.current}` }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const movePageHandle = (d: NonNullable<typeof pageDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    const min = minPageSize(doc)
    /** Newton steps on the (piecewise linear) position of the edge until it is under the pointer; null when the layout keeps it in place */
    const solve = (size: number, lo: number, hi: number, delta: number, edge: (s: number) => number): number | null => {
      const target = edge(size) + delta
      let s = size
      for (let i = 0; i < 6; i++) {
        const here = edge(s)
        const slope = edge(s + 1) - here
        if (Math.abs(slope) < 0.05) return i === 0 ? null : s
        s = Math.min(hi, Math.max(lo, s + (target - here) / slope))
      }
      return s
    }
    if (d.mode.includes('e') || d.mode.includes('w')) {
      const east = d.mode.includes('e')
      const edge = (s: number) => pageEdges(sizedDoc(s, d.h))[east ? 'right' : 'left']
      d.w = solve(d.w, min.w, MAX_PAGE_PT, dx, edge) ?? Math.min(MAX_PAGE_PT, Math.max(min.w, d.w + (east ? dx : -dx) / zoom))
    }
    if (d.mode.includes('s') || d.mode.includes('n')) {
      const south = d.mode.includes('s')
      const edge = (s: number) => pageEdges(sizedDoc(d.w, s))[south ? 'bottom' : 'top']
      d.h = solve(d.h, min.h, MAX_PAGE_PT, dy, edge) ?? Math.min(MAX_PAGE_PT, Math.max(min.h, d.h + (south ? dy : -dy) / zoom))
    }
    // the page grows or shrinks to the exact height of the pages beside it when it gets close (Alt = no snapping)
    let height = d.h
    let snap: { world: number; span: [number, number]; height: number } | null = null
    if (!sizeAll && !e.altKey && (d.mode.includes('s') || d.mode.includes('n'))) {
      const row = spreads[spreadOfPage(selPage)]
      const tol = SNAP_PX / zoom
      const beside = row.pages.filter((p) => p.index !== selPage)
      const near = beside.filter((p) => Math.abs(p.h - d.h) <= tol).sort((a, b) => Math.abs(a.h - d.h) - Math.abs(b.h - d.h))[0]
      if (near) {
        height = near.h
        const same = [...beside.filter((p) => Math.abs(p.h - near.h) < 0.01), ...row.pages.filter((p) => p.index === selPage)]
        snap = { world: row.y + near.h, span: [Math.min(...same.map((p) => p.x)), Math.max(...same.map((p) => p.x + p.w))], height }
      }
    }
    setPageSnap(snap)
    setPageSize(d.w, height, d.key)
  }

  /** the margin lines of the selected page can be dragged with the Page tool: they change the margins of the whole document */
  const onMarginEdgeDown = (edge: keyof Sides, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    dragSeq.current += 1
    marginDrag.current = { edge, page: selPage, key: `margin:${dragSeq.current}` }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const moveMarginEdge = (d: NonNullable<typeof marginDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const r = rects[d.page]
    const side = spreads[spreadOfPage(d.page)].pages.find((p) => p.index === d.page)?.side ?? 'single'
    const p = toWorld(e.clientX, e.clientY)
    // distance of the pointer from the page edge the margin belongs to
    const value = d.edge === 'top' ? p.y - r.y : d.edge === 'bottom' ? r.y + r.h - p.y : d.edge === 'left' ? p.x - r.x : r.x + r.w - p.x
    // on left-hand pages of facing pages the physical left margin is the "outside" one, stored on the right
    const swapped = doc.facingPages && doc.perRow >= 2 && side === 'left'
    const key: keyof Sides = d.edge === 'left' || d.edge === 'right' ? (swapped ? (d.edge === 'left' ? 'right' : 'left') : d.edge) : d.edge
    const target = sizeAll ? 'all' : d.page
    const cur = marginsOf(doc, d.page)
    const v = Math.round(Math.min(maxMargin(doc, key, target), Math.max(0, value)) * 100) / 100
    const margins: Sides = e.shiftKey ? { top: v, bottom: v, left: v, right: v } : { ...cur, [key]: v }
    const next = withPageMargins(doc, target, margins)
    if (validateDoc(next)) return
    if (margins.top !== cur.top || margins.bottom !== cur.bottom || margins.left !== cur.left || margins.right !== cur.right) {
      pageOps.setup(next, d.key)
    }
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
    } else if ((tool === 'type' || placing || placingImages.length > 0) && e.button === 0) {
      // start dragging a new text frame (with text loaded, the frame receives it)
      placeMods.current = { shift: e.shiftKey, alt: e.altKey }
      const p = snapPoint(toWorld(e.clientX, e.clientY), e.ctrlKey || e.metaKey).p
      createStart.current = p
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      setSelectedId(null)
      setEditingId(null)
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if ((tool === 'rect' || tool === 'ellipse' || tool === 'polygon') && e.button === 0) {
      const p = snapPoint(toWorld(e.clientX, e.clientY), false).p
      shapeStart.current = { kind: tool, x: p.x, y: p.y }
      shapeBoxRef.current = null
      setSelectedId(null)
      setEditingId(null)
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'select' && e.button === 0) {
      // dragging over empty canvas draws a rubber band that selects everything it touches: text frames, pictures, shapes and
      // guides (Shift / Ctrl adds to the selection that was there)
      const additive = e.shiftKey || e.ctrlKey || e.metaKey
      const before = selectedId ? [selectedId] : multiSel
      setSelectedId(null)
      if (!additive) {
        setGuideSel([])
        setMultiSel([])
      } else if (before.length > 0) setMultiSel(before)
      const p = toWorld(e.clientX, e.clientY)
      marqueeBase.current = { guides: additive ? guideSel : [], objects: additive ? before : [] }
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (shapeStart.current) {
      updateShapeDraft(e.clientX, e.clientY, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey })
      return
    }
    if (cornerDrag.current) {
      moveCorner(cornerDrag.current, e)
      return
    }
    if (groupDrag.current) {
      const d = groupDrag.current
      const p = toWorld(e.clientX, e.clientY)
      offsetObjects(d.origins, p.x - d.start.x, p.y - d.start.y, d.key)
      return
    }
    if (marqueeBase.current && marquee) {
      const p = toWorld(e.clientX, e.clientY)
      setMarquee({ ...marquee, x1: p.x, y1: p.y })
      const hits = guidesVisible ? guidesInRect(marquee.x0, marquee.y0, p.x, p.y) : []
      setGuideSel([...new Set([...marqueeBase.current.guides, ...hits])])
      setMultiSel([...new Set([...marqueeBase.current.objects, ...objectsInRect(marquee.x0, marquee.y0, p.x, p.y)])])
      return
    }
    if (marginDrag.current) {
      moveMarginEdge(marginDrag.current, e)
      return
    }
    if (pageDrag.current) {
      movePageHandle(pageDrag.current, e)
      return
    }
    if (frameDrag.current) {
      const d = frameDrag.current
      const p = toWorld(e.clientX, e.clientY)
      // the edges that move are held on the margins, column edges, page edges and guides (Ctrl = free)
      const snapped = e.ctrlKey || e.metaKey ? null : snapDrag(d.orig, d.mode, p.x - d.start.x, p.y - d.start.y)
      const dx = snapped ? snapped.dx : p.x - d.start.x
      const dy = snapped ? snapped.dy : p.y - d.start.y
      setSnapShown((cur) => (snapped && snapped.lines.length > 0 ? snapped.lines : cur.length ? [] : cur))
      if (d.kind === 'shape') {
        // Shift keeps the shape's proportions
        const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, e.shiftKey ? d.orig.w / d.orig.h : undefined)
        onShapesChange(shapes.map((sh) => (sh.id === d.id ? { ...sh, ...box } : sh)), d.key)
        return
      }
      if (d.kind === 'image') {
        // corners keep the picture's proportions unless Alt is held
        const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, e.altKey ? undefined : d.orig.w / d.orig.h)
        onImagesChange(images.map((im) => (im.id === d.id ? { ...im, ...box } : im)), d.key)
        return
      }
      const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT)
      onFramesChange(frames.map((f) => (f.id === d.id ? { ...f, ...box } : f)), d.key)
      return
    }
    if (createStart.current) {
      const snapped = snapPoint(toWorld(e.clientX, e.clientY), e.ctrlKey || e.metaKey)
      setSnapShown(snapped.lines)
      setDraft({ x0: createStart.current.x, y0: createStart.current.y, x1: snapped.p.x, y1: snapped.p.y })
      return
    }
    if (!drag.current) return
    e.currentTarget.scrollLeft -= e.clientX - drag.current.x
    e.currentTarget.scrollTop -= e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
  }
  /** a shape tool's drag ended: a drag makes a shape of that size; a plain click makes one of the tool's own size around the point */
  const finishShape = () => {
    const s0 = shapeStart.current
    if (cornerDrag.current) {
      cornerDrag.current = null
      setHotCorners([])
    }
    if (!s0) return
    const box = shapeBoxRef.current
    shapeStart.current = null
    shapeBoxRef.current = null
    setShapeBox(null)
    const pref = shapePrefs[s0.kind]
    const size = box && box.w >= MIN_FRAME_PT && box.h >= MIN_FRAME_PT ? box : { x: s0.x - pref.w / 2, y: s0.y - pref.h / 2, w: pref.w, h: pref.h }
    const shape = newShape(s0.kind, size)
    onShapesChange([...shapes, shape])
    setSelectedId(shape.id)
    setSelectedPage(ownerPage(rects, shape.x + shape.w / 2, shape.y + shape.h / 2))
  }
  const finishDraft = () => {
    if (draft && createStart.current && placingImages.length > 0) {
      const w = Math.abs(draft.x1 - draft.x0)
      const h = Math.abs(draft.y1 - draft.y0)
      // a dragged rectangle sets the size; a plain click places the picture at its natural size
      placeImage(
        w >= MIN_FRAME_PT && h >= MIN_FRAME_PT ? { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w, h } : null,
        { x: draft.x0, y: draft.y0 },
      )
    } else if (draft && createStart.current && placing) {
      const w = Math.abs(draft.x1 - draft.x0)
      const h = Math.abs(draft.y1 - draft.y0)
      // a dragged rectangle is the frame; a plain click uses the column under the pointer
      const box =
        w >= MIN_FRAME_PT && h >= MIN_FRAME_PT
          ? { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w, h }
          : boxAtClick(doc, draft.x0, draft.y0)
      doPlace({ box }, placeMods.current)
    } else if (draft && createStart.current) {
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
          z: nextZ(frames, images, shapes),
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
    finishShape()
    finishDraft()
    setSnapShown((cur) => (cur.length ? [] : cur))
    // a rubber band that caught a single object leaves it selected the ordinary way (with its panel and handles)
    if (marqueeBase.current && multiSel.length === 1 && guideSel.length === 0) {
      setSelectedIdRaw(multiSel[0])
      setMultiSel([])
    }
    groupDrag.current = null
    frameDrag.current = null
    pageDrag.current = null
    setPageSnap(null)
    marginDrag.current = null
    marqueeBase.current = null
    setMarquee(null)
    drag.current = null
    setPanning(false)
  }
  const cancelDrag = () => {
    setSnapShown((cur) => (cur.length ? [] : cur))
    shapeStart.current = null
    shapeBoxRef.current = null
    setShapeBox(null)
    groupDrag.current = null
    cornerDrag.current = null
    setHotCorners([])
    createStart.current = null
    frameDrag.current = null
    pageDrag.current = null
    setPageSnap(null)
    marginDrag.current = null
    marqueeBase.current = null
    setMarquee(null)
    setDraft(null)
    drag.current = null
    setPanning(false)
  }

  /** clicking a frame: Type tool edits its text, Selection tool selects it and starts moving it */
  const onFramePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return // let the pan handler see it
    if (placingImages.length > 0) return // the click places a picture on the page, even over a text frame
    const clicked = frames.find((f) => f.id === id)
    if (clicked) setSelectedPage(ownerPage(rects, clicked.x + clicked.w / 2, clicked.y + clicked.h / 2))
    if (placing) {
      // an empty frame can receive the loaded text; anything else is ignored
      e.stopPropagation()
      e.preventDefault()
      if (clicked && !clicked.text && !clicked.next && !frames.some((x) => x.next === clicked.id)) {
        doPlace({ box: { x: clicked.x, y: clicked.y, w: clicked.w, h: clicked.h }, frameId: clicked.id }, { shift: e.shiftKey, alt: e.altKey })
      }
      return
    }
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
      if (handleMultiPointer(id, e)) return
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
        : placing || placingImages.length > 0
          ? ' placing'
          : linkFrom
          ? ' linking'
          : tool === 'zoom'
            ? ' zoomtool'
            : tool === 'page'
              ? ' pagetool'
              : tool === 'rect' || tool === 'ellipse' || tool === 'polygon'
                ? ' shapetool'
            : tool === 'type'
              ? ' texttool'
              : tool === 'select'
                ? ' selecttool'
                : '')

  // ── selection info for the properties panel and the thread lines ────────────────
  const selFrame = selectedId ? (frames.find((f) => f.id === selectedId) ?? null) : null
  const selImage = selectedId ? (images.find((im) => im.id === selectedId) ?? null) : null
  const selShape = selectedId ? (shapes.find((sh) => sh.id === selectedId) ?? null) : null
  const selGuides = guidesVisible ? guides.filter((g) => guideSel.includes(g.id)) : []
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

  /** a guide can be grabbed with the Selection tool only, and not while something is being placed */
  const guidesLive = tool === 'select' && !space && !placing && placingImages.length === 0 && !linkFrom
  const openRulerMenu = (e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault()
    setRulerMenu({ x: e.clientX, y: e.clientY })
  }
  const setRulerUnit = (unit: Unit) => {
    if (unit !== doc.unit) pageOps.setup({ ...doc, unit }, 'unit')
  }
  const guideFromRuler = (axis: GuideAxis) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!panMode && !placing && placingImages.length === 0) beginGuideDrag(axis, null, e)
  }
  const guideStyle = (axis: GuideAxis, page: number, pos: number, color: string): CSSProperties | null => {
    const r = rects[page]
    if (!r) return null
    const base = axis === 'h'
      ? { left: tx + r.x * zoom - GUIDE_OVER, top: ty + (r.y + pos) * zoom - 3, width: r.w * zoom + 2 * GUIDE_OVER }
      : { left: tx + (r.x + pos) * zoom - 3, top: ty + r.y * zoom - GUIDE_OVER, height: r.h * zoom + 2 * GUIDE_OVER }
    return { ...base, '--gc': color } as unknown as CSSProperties
  }

  /** the part of a frame's text to draw highlighted (frames that are not being edited) */
  const highlightFor = (fl: FrameFlow): [number, number] | null => {
    if (!textSel || textSel.headId !== fl.headId || textSel.a >= textSel.b) return null
    const a = Math.max(textSel.a, fl.start)
    const b = Math.min(textSel.b, fl.end)
    return a < b ? [a - fl.start, b - fl.start] : null
  }

  return (
    <div className="workspace">
      {placingImages.length > 0 && (
        <div className="place-banner" role="status">
          <img className="place-thumb" src={placingImages[0].asset.dataUrl} alt="" />
          <div className="place-title">
            <b>
              <bdi>{placingImages[0].asset.name}</bdi>
            </b>{' '}
            · {placingImages[0].asset.width}×{placingImages[0].asset.height} פיקסלים
            {placingImages.length > 1 && <> · עוד {placingImages.length - 1} תמונות בתור</>}
          </div>
          <button className="btn small" onClick={() => onPlacingImagesChange([])}>
            בטל
          </button>
          <div className="place-hint">לחץ על העמוד כדי למקם את התמונה בגודלה המקורי, או גרור מלבן כדי להגדיר את הגודל. Esc = ביטול.</div>
        </div>
      )}
      {placing && (
        <div className="place-banner" role="status">
          <div className="place-title">
            <b>{placing.name}</b> · {countWords(placing.text).toLocaleString('he-IL')} מילים מוכנות להצבה
          </div>
          <div className="place-modes" role="group" aria-label="אופן הזרימה">
            <button className={flowMode === 'auto' ? 'on' : ''} title="הטקסט זורם מעמוד לעמוד ומוסיף עמודים לפי הצורך" onClick={() => setFlowMode('auto')}>
              זרימה אוטומטית
            </button>
            <button className={flowMode === 'semi' ? 'on' : ''} title="ממלא תיבה ומחכה ללחיצה הבאה" onClick={() => setFlowMode('semi')}>
              חצי-אוטומטית
            </button>
            <button className={flowMode === 'single' ? 'on' : ''} title="תיבה אחת; מה שלא נכנס נשאר כגלישה" onClick={() => setFlowMode('single')}>
              תיבה אחת
            </button>
          </div>
          <button className="btn small" onClick={() => onPlacingChange(null)}>
            בטל
          </button>
          <div className="place-hint">לחץ על העמוד כדי למקם את הטקסט, או גרור מלבן שיגדיר את התיבה. אפשר גם ללחוץ על תיבה ריקה. Shift = חצי-אוטומטית · Alt = אוטומטית · Esc = ביטול.</div>
        </div>
      )}
      {tool === 'page' && !previewMode && !space && (
        <PageToolBar
          doc={doc}
          page={selPage}
          all={sizeAll}
          onAll={setSizeAll}
          onSize={(w, h) => setPageSize(w, h, 'pagesize:bar')}
          onMargins={(margins) => {
            const next = withPageMargins(doc, sizeAll ? 'all' : selPage, margins)
            if (!validateDoc(next)) pageOps.setup(next, 'margins:bar')
          }}
        />
      )}
      <div className="doc-tabs">
        {renderTabs ? (
          renderTabs(formatZoom(zoom))
        ) : (
          <div className="doc-tab active">
            <span>
              {doc.name}{dirty ? ' *' : ''} @ <bdi dir="ltr">{formatZoom(zoom)}</bdi>
            </span>
            {onClose && (
              <button className="doc-tab-close" aria-label="סגור מסמך" onClick={onClose}>
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ws-main">
        <Toolbox
          tool={space ? 'hand' : tool}
          onSelect={setTool}
          onSettings={(id) => (id === 'rect' || id === 'ellipse' || id === 'polygon') && setToolDialog(id)}
          previewMode={previewMode}
          onPreviewMode={onPreviewMode}
        />
        <div
          className="ws-center"
          style={{
            gridTemplateColumns: `${showRulers ? RULER : 0}px minmax(0, 1fr)`,
            gridTemplateRows: `${showRulers ? RULER : 0}px minmax(0, 1fr)`,
          }}
        >
          <div className="ruler-corner" />
          <Ruler orientation="h" offset={tx - scroll.x + vp.sb} zoom={zoom} unit={doc.unit} hidden={!showRulers} onGuideDown={guideFromRuler('h')} onMenu={openRulerMenu} />
          <Ruler orientation="v" offset={ty - scroll.y} zoom={zoom} unit={doc.unit} hidden={!showRulers} onGuideDown={guideFromRuler('v')} onMenu={openRulerMenu} />
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
              {images.map((im) => (
                <ImageFrameView
                  key={im.id}
                  image={im}
                  asset={assets[im.assetId]}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(im.id) ?? 0}
                  selected={im.id === selectedId}
                  marked={!previewMode && multiSel.includes(im.id)}
                  showEdge={!previewMode}
                  onPointerDown={onImagePointerDown(im.id)}
                  onHandleDown={onHandleDown(im.id)}
                />
              ))}
              {shapes.map((sh) => (
                <ShapeFrameView
                  key={sh.id}
                  shape={sh}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(sh.id) ?? 0}
                  selected={sh.id === selectedId}
                  marked={!previewMode && multiSel.includes(sh.id)}
                  showEdge={!previewMode}
                  hotCorners={sh.id === selectedId ? hotCorners : undefined}
                  onPointerDown={onShapePointerDown(sh.id)}
                  onHandleDown={onHandleDown(sh.id)}
                  onCornerDown={onCornerDown(sh.id)}
                />
              ))}
              {shapeStart.current && shapeBox && (shapeBox.w > 0 || shapeBox.h > 0) && (
                <ShapeFrameView
                  ghost
                  shape={{
                    id: 'draft',
                    kind: shapeStart.current.kind,
                    ...shapeBox,
                    ...(shapeStart.current.kind === 'polygon' ? { sides: shapePrefs.polygon.sides } : {}),
                    ...(shapeStart.current.kind === 'rect' && shapePrefs.rect.radius > 0 ? { radii: [shapePrefs.rect.radius, shapePrefs.rect.radius, shapePrefs.rect.radius, shapePrefs.rect.radius] as [number, number, number, number] } : {}),
                    fill: DEFAULT_SHAPE_FILL,
                    stroke: DEFAULT_SHAPE_STROKE,
                    strokeWidth: 1,
                  }}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={900001}
                  selected={false}
                  showEdge
                />
              )}
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
                    floats={wrapFloatsFor(f, images)}
                    z={rank.get(f.id) ?? 0}
                    overflow={fl.overflow}
                    hasPrev={fl.prevId !== null}
                    zoom={zoom}
                    tx={tx}
                    ty={ty}
                    selected={f.id === selectedId}
                    marked={!previewMode && multiSel.includes(f.id)}
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
              {showGuides && !previewMode && (
                <>
                  {guides.map((g) => {
                    if (g.id === guideDrag?.id) return null
                    const st = guideStyle(g.axis, g.page, g.pos, g.color ?? DEFAULT_GUIDE_COLOR)
                    return st ? (
                      <div
                        key={g.id}
                        className={`guide ${g.axis}${guideSel.includes(g.id) ? ' selected' : ''}${guidesLive ? ' live' : ''}${guideDrag?.snap?.ids.includes(g.id) ? ' aligned' : ''}`}
                        style={st}
                        onPointerDown={(e) => onGuidePointerDown(g, e)}
                      />
                    ) : null
                  })}
                  {guideDrag &&
                    (() => {
                      const st = guideStyle(guideDrag.axis, guideDrag.page, guideDrag.pos, guideDrag.color)
                      const r = rects[guideDrag.page]
                      if (!st || !r) return null
                      const tip: CSSProperties =
                        guideDrag.axis === 'h'
                          ? { left: tx + r.x * zoom + 8, top: ty + (r.y + guideDrag.pos) * zoom - 24 }
                          : { left: tx + (r.x + guideDrag.pos) * zoom + 8, top: ty + r.y * zoom + 8 }
                      const snap = guideDrag.snap
                      // the alignment line: across every page the guides line up on, a little beyond both ends
                      const align: CSSProperties | null = snap
                        ? guideDrag.axis === 'h'
                          ? { left: tx + snap.span[0] * zoom - 18, top: ty + snap.world * zoom - 1, width: (snap.span[1] - snap.span[0]) * zoom + 36, height: 2 }
                          : { left: tx + snap.world * zoom - 1, top: ty + snap.span[0] * zoom - 18, width: 2, height: (snap.span[1] - snap.span[0]) * zoom + 36 }
                        : null
                      return (
                        <>
                          {align && <div className={`guide-align ${guideDrag.axis}`} style={align} />}
                          <div className={`guide ${guideDrag.axis} selected${guideDrag.remove ? ' removing' : ''}${snap ? ' aligned' : ''}`} style={st} />
                          {!guideDrag.remove && (
                            <div className={'guide-tip' + (snap ? ' aligned' : '')} style={tip}>
                              {formatLength(guideDrag.pos, doc.unit)}
                              {snap && ' · מיושר עם קו עזר אחר'}
                            </div>
                          )}
                        </>
                      )
                    })()}
                </>
              )}
              {snapShown.map((l, i) =>
                l.axis === 'v' ? (
                  <div key={`snap${i}`} className="guide-align v" style={{ left: tx + l.at * zoom - 1, top: ty + l.from * zoom, width: 2, height: (l.to - l.from) * zoom }} />
                ) : (
                  <div key={`snap${i}`} className="guide-align h" style={{ left: tx + l.from * zoom, top: ty + l.at * zoom - 1, width: (l.to - l.from) * zoom, height: 2 }} />
                ),
              )}
              {marquee && (
                <div
                  className="marquee"
                  style={{
                    left: tx + Math.min(marquee.x0, marquee.x1) * zoom,
                    top: ty + Math.min(marquee.y0, marquee.y1) * zoom,
                    width: Math.abs(marquee.x1 - marquee.x0) * zoom,
                    height: Math.abs(marquee.y1 - marquee.y0) * zoom,
                  }}
                />
              )}
              {pageSnap && (
                <>
                  <div
                    className="guide-align h"
                    style={{ left: tx + pageSnap.span[0] * zoom - 18, top: ty + pageSnap.world * zoom - 1, width: (pageSnap.span[1] - pageSnap.span[0]) * zoom + 36, height: 2 }}
                  />
                  <div className="guide-tip aligned" style={{ left: tx + pageSnap.span[0] * zoom + 8, top: ty + pageSnap.world * zoom + 8 }}>
                    {formatLength(pageSnap.height, doc.unit)} · אותו גובה כמו העמודים שבצד
                  </div>
                </>
              )}
              {tool === 'page' && !previewMode && !space && rects[selPage] && (
                <div
                  className="page-frame"
                  style={{ left: tx + rects[selPage].x * zoom, top: ty + rects[selPage].y * zoom, width: rects[selPage].w * zoom, height: rects[selPage].h * zoom }}
                >
                  {HANDLES.map((h) => (
                    <div key={h} className={'handle ' + h} onPointerDown={(e) => onPageHandleDown(h, e)} />
                  ))}
                  {(() => {
                    const r = rects[selPage]
                    const side = spreads[spreadOfPage(selPage)].pages.find((p) => p.index === selPage)?.side ?? 'single'
                    const m = pageMargins(doc, side, selPage)
                    const inner = { left: m.left * zoom, top: m.top * zoom, width: (r.w - m.left - m.right) * zoom, height: (r.h - m.top - m.bottom) * zoom }
                    return (['top', 'bottom', 'left', 'right'] as const).map((edge) => {
                      const style: CSSProperties =
                        edge === 'top'
                          ? { left: inner.left, top: inner.top - MARGIN_HIT / 2, width: inner.width, height: MARGIN_HIT }
                          : edge === 'bottom'
                            ? { left: inner.left, top: inner.top + inner.height - MARGIN_HIT / 2, width: inner.width, height: MARGIN_HIT }
                            : edge === 'left'
                              ? { left: inner.left - MARGIN_HIT / 2, top: inner.top, width: MARGIN_HIT, height: inner.height }
                              : { left: inner.left + inner.width - MARGIN_HIT / 2, top: inner.top, width: MARGIN_HIT, height: inner.height }
                      return (
                        <div
                          key={edge}
                          className={'margin-edge ' + (edge === 'top' || edge === 'bottom' ? 'h' : 'v')}
                          style={style}
                          title="גרור כדי לשנות את השוליים של העמוד (Shift = כל הצדדים יחד)"
                          onPointerDown={(e) => onMarginEdgeDown(edge, e)}
                        />
                      )
                    })
                  })()}
                </div>
              )}
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
                images={images}
                shapes={shapes}
                spreads={spreads}
                currentSpread={cur}
                selected={selPage}
                onSelect={selectPage}
                onInsert={insertPages}
                onDelete={deleteSelectedPage}
                onMove={movePage}
              />
            )}
            {showProps && selGuides.length > 0 && (
              <GuideProperties
                guides={selGuides}
                pageNumber={doc.startPage + selGuides[0].page}
                unit={doc.unit}
                onPos={(pos) => updateGuide(selGuides[0].id, { pos }, `guidepos:${selGuides[0].id}`)}
                onColor={(color) => {
                  setGuideColor(color)
                  const chosen = new Set(selGuides.map((g) => g.id))
                  onGuidesChange(guides.map((g) => (chosen.has(g.id) ? { ...g, color } : g)))
                }}
                onDelete={() => {
                  const chosen = new Set(selGuides.map((g) => g.id))
                  onGuidesChange(guides.filter((g) => !chosen.has(g.id)))
                  setGuideSel([])
                }}
              />
            )}
            {showProps && multiSel.length > 1 && (
              <MultiSelectionPanel
                count={multiSel.length}
                shapeCount={shapes.filter((sh) => multiSel.includes(sh.id)).length}
                onShapeOp={combineSelectedShapes}
                onDelete={() => deleteSelection(multiSel, [])}
              />
            )}
            {showProps && selShape && (
              <ShapeProperties
                shape={selShape}
                unit={doc.unit}
                onGeometry={(patch) => updateShape(selShape.id, patch, `geo:${selShape.id}`)}
                onChange={(patch) => updateShape(selShape.id, patch, patch.radii || patch.strokeWidth !== undefined ? `shape:${selShape.id}` : undefined)}
                onArrange={(op) => arrangeObject(selShape.id, op)}
                onDelete={() => {
                  onShapesChange(shapes.filter((sh) => sh.id !== selShape.id))
                  setSelectedId(null)
                }}
              />
            )}
            {showProps && selImage && (
              <ImageProperties
                image={selImage}
                asset={assets[selImage.assetId]}
                unit={doc.unit}
                onGeometry={(patch) => updateImage(selImage.id, patch, `geo:${selImage.id}`)}
                onFit={(fit: ImageFit) => updateImage(selImage.id, { fit })}
                onWrap={(wrap) => updateImage(selImage.id, { wrap })}
                onWrapOffset={(wrapOffset) => updateImage(selImage.id, { wrapOffset }, `wrapoff:${selImage.id}`)}
                onArrange={(op) => arrangeObject(selImage.id, op)}
                onMatchShape={() => {
                  const a = assets[selImage.assetId]
                  if (a) updateImage(selImage.id, { h: selImage.w * (a.height / a.width) })
                }}
                onDelete={() => {
                  onImagesChange(images.filter((im) => im.id !== selImage.id))
                  setSelectedId(null)
                }}
              />
            )}
            {showProps && !selImage && !selShape && selGuides.length === 0 && multiSel.length < 2 && (
          <PropertiesPanel
            frame={selFrame}
            style={panelStyle}
            scope={panelSel ? 'selection' : 'all'}
            unit={doc.unit}
            thread={threadInfo}
            onGeometry={(patch) => selFrame && updateFrame(selFrame.id, patch, `geo:${selFrame.id}`)}
            onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)}
            onAlign={(align) => selFrame && applyAlign(selFrame.id, align)}
            onArrange={(op) => selFrame && arrangeObject(selFrame.id, op)}
            onLink={() => selFrame && setLinkFrom(selFrame.id)}
            onUnlink={() => selFrame && onFramesChange(unlinkBefore(frames, selFrame.id))}
          />
            )}
          </div>
        )}
      </div>

      {toolDialog && (
        <ShapeToolDialog
          kind={toolDialog}
          prefs={shapePrefs}
          unit={doc.unit}
          onApply={(next) => {
            onShapePrefs(next)
            setToolDialog(null)
          }}
          onClose={() => setToolDialog(null)}
        />
      )}
      {rulerMenu && (
        <ContextMenu
          x={rulerMenu.x}
          y={rulerMenu.y}
          onClose={() => setRulerMenu(null)}
          items={[
            { label: 'יחידות מידה', disabled: true },
            { separator: true },
            ...UNIT_OPTIONS.map((u) => ({ label: u.label, checked: doc.unit === u.value, onClick: () => setRulerUnit(u.value) })),
          ]}
        />
      )}
      {guidesDialog && (
        <CreateGuidesDialog
          doc={doc}
          page={selPage}
          initialColor={guideColor}
          existing={guides.length}
          onCreate={applyGuideRequest}
          onClose={() => setGuidesDialog(false)}
        />
      )}
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
