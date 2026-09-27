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
  DEFAULT_SHAPE_STROKE,
  DEFAULT_TEXT_STYLE,
  isFacing,
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
  type PathGeom,
  type PathSmoothPoint,
  type PathText,
  type PathVertex,
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
import { HANDLES, angleOf, chainOf, dragBox, headFrames, linkFrames, normalizeDeg, removeFrame, rotateVec, styleOf, unlinkBefore, type Box, type HandleId, type RotateCorner } from '../frames'
import type { PlacedImage } from '../importImage'
import { countWords, type ImportedParagraphStyle, type PlacedText } from '../importText'
import { applyGuideSpec, snapGuide, type GuideSnap } from '../guides'
import { computeLayout, pageMargins, pageSidesOf } from '../layout'
import { boxAtClick, pourText, type FlowMode } from '../placeText'
import { ownerPage, pageRects } from '../pages'
import { caretOffsetAt } from '../richtext'
import { DEFAULT_PATH_TEXT_COLOR, DEFAULT_PATH_TEXT_STYLE, MIN_SPAN, nearestOnRing, pointInRing, ringInfo, snapTextToCenter, textPlacement, type Pt } from '../pathText'
import { boxFromEndpoints, CORNERS, editableRing, fitRadii, imageGeometry, lineEndpoints, regularRatio, replaceVertex, vertexHi, vertexHo, vertexPoint, type ImageBox, type ShapePrefs } from '../shapes'
import { spacing, type SpacingMark } from '../spacing'
import { paragraphOverrides } from '../styleOverrides'
import { fitPath } from '../curveFit'
import { objectLines } from '../snapping'
import { snapEdges, snapLinesOf, type SnapLine } from '../snapping'
import { clipForToken, isClipToken, lastClip, setClip, type ClipObjects } from '../objectClipboard'
import { combineShapes, type BoolOp } from '../shapeOps'
import { arrange, nextZ, stackOrder, type ArrangeOp } from '../stacking'
import { charStyleOf, cleanSpacing, diffEdit, editStory, normalizeRuns, paraIndexAt, paragraphsInRange, restyleRange, sliceRuns, spliceParagraphStyles, spliceParaOverrides, styleAtChar, styleRange, withParaOverride } from '../story'
import { flowFrames, type FrameFlow } from '../textLayout'
import { floatsFor } from '../wrap'
import { ContextMenu } from './ContextMenu'
import { DockingPanels } from './DockingPanels'
import { ColorToolsPanel } from './ColorToolsPanel'
import { ContextToolbar } from './ContextToolbar'
import { ColorPickerDialog } from './ColorPickerDialog'
import type { AlignOp } from './AlignButtons'
import { CreateGuidesDialog, type CreateGuidesRequest } from './CreateGuidesDialog'
import { GuideProperties } from './GuideProperties'
import { ImageFrameView } from './ImageFrameView'
import { ImageProperties } from './ImageProperties'
import { MultiSelectionPanel } from './MultiSelectionPanel'
import { ParagraphPanel } from './ParagraphPanel'
import { ParagraphStylesPanel, type ParagraphStyleRecord } from './ParagraphStylesPanel'
import { StyleManagerPanel } from './StyleManagerPanel'
import { PathTextEditor } from './PathTextEditor'
import { CORNER_HANDLE_OFFSET, MIN_CORNER_HANDLES, ShapeFrameView, type PathPeg } from './ShapeFrameView'
import { ShapeProperties } from './ShapeProperties'
import { ShapeToolDialog } from './ShapeToolDialog'
import { PagesPanel, type InsertWhere } from './PagesPanel'
import { LayersPanel } from './LayersPanel'
import { PageToolBar } from './PageToolBar'
import { PropertiesPanel } from './PropertiesPanel'
import type { SelRequest } from './RichEditor'
import { Ruler } from './Ruler'
import { SpreadView } from './SpreadView'
import { StrokeSettingsDialog, type PencilSettings } from './StrokeSettingsDialog'
import { StatusBar, formatZoom } from './StatusBar'
import { UNIT_OPTIONS, formatLength, type Unit } from '../units'
import { TextFrameView } from './TextFrameView'
import { FRAME_TOOL_KIND, TOOLS, Toolbox, type ToolId } from './Toolbox'
import type { PageOps, TabView } from '../useDocumentSession'

/** pasteboard around the pages, screen px */
const PAD = 120
const RULER = 20
const FIT_MARGIN = 40
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
  selectTool: (tool: ToolId) => void
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
  /** copy / cut / paste the selected objects, and a copy right on top of them */
  copy: () => void
  cut: () => void
  paste: () => void
  duplicateInPlace: () => void
    /** duplicate the selection using the last manually established repeat distance (Ctrl+D) */
    repeatDuplicate: () => void
  /** open the dialog that creates several guides at once */
  createGuides: () => void
  /** delete the guides of the selected page */
  clearGuides: () => void
  /** remove repeated spaces / empty paragraphs from the selected text, or the whole document if nothing is selected */
  cleanSpacing: () => void
  canReplaceSelectedText: () => boolean
  replaceSelectedText: (placed: PlacedText) => boolean
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
  /** show a dot over spaces and a ¶ at paragraph breaks, in every text frame */
  showHiddenChars: boolean
  showProps: boolean
  showPages: boolean
  /** Window > פסקה: a dedicated side panel for paragraph spacing/indents */
  showParagraph: boolean
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
  paragraphStyles: ParagraphStyleRecord[]
  onParagraphStylesChange: (styles: ParagraphStyleRecord[], coalesceKey?: string) => void
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

interface WorldPathPoint {
  x: number
  y: number
  hi?: { x: number; y: number }
  ho?: { x: number; y: number }
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
  showHiddenChars,
  showProps,
  showPages,
  showParagraph,
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
  paragraphStyles,
  onParagraphStylesChange,
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
  /** the pages selected in the Pages panel; `selectedPage` is the one the selection grows from */
  const [pageSel, setPageSel] = useState<number[]>([])
  const pendingNav = useRef<number | null>(null)
  const [flowMode, setFlowMode] = useState<FlowMode>('auto')
  /** modifier keys held when the placing click started */
  const placeMods = useRef({ shift: false, alt: false })

  const vpRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0, sb: 0 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [view, setView] = useState<View>({ zoom: 1, anchor: null })
  const [tool, setTool] = useState<ToolId>('select')
  const [colorTarget, setColorTarget] = useState<'fill' | 'stroke'>('fill')
  const [colorDialogTarget, setColorDialogTarget] = useState<'fill' | 'stroke' | null>(null)
  const [sampledTextStyle, setSampledTextStyle] = useState<CharStyle | null>(null)
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  /** the selected text frame or picture (guides have their own, multiple, selection) */
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null)
  const [layerVisible, setLayerVisible] = useState(true)
  const [layerLocked, setLayerLocked] = useState(false)
  const [activeLayerId, setActiveLayerId] = useState('layer-1')
  const [itemVisibility, setItemVisibility] = useState<Record<string, boolean>>({})
  const [itemLocks, setItemLocks] = useState<Record<string, boolean>>({})
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
  /** the gaps between the moved object and its neighbours (measured, and marked when equal) */
  const [spacingShown, setSpacingShown] = useState<SpacingMark[]>([])
  /** text on the outline of a shape: the shape being edited, the selected range of its text, the caret request, and whether the pointer is over an outline (for the cursor) */
  const [pathEdit, setPathEdit] = useState<string | null>(null)
  const [pathSel, setPathSel] = useState<{ id: string; a: number; b: number } | null>(null)
  const [pathRequest, setPathRequest] = useState<(SelRequest & { id: string }) | null>(null)
  const pathRequestToken = useRef(0)
  const [pathHover, setPathHover] = useState(false)
  const [scissorHover, setScissorHover] = useState(false)
  const eraserDragging = useRef(false)
  const eraserTouched = useRef(new Set<string>())
  const [eraserRadius, setEraserRadius] = useState(12)
  const [eraserPoint, setEraserPoint] = useState<{ x: number; y: number } | null>(null)
  /** dragging a peg of the text on an outline */
  const pegDrag = useRef<{ id: string; peg: PathPeg; key: string } | null>(null)
  const marqueeBase = useRef<{ guides: string[]; objects: string[] } | null>(null)
  /** moving several selected objects together: where each one was, and where the pointer started */
  const groupDrag = useRef<{ origins: Map<string, { x: number; y: number }>; start: { x: number; y: number }; key: string } | null>(null)
    /** the last duplicate that is waiting to learn its manually placed distance */
    const repeatPending = useRef<{ ids: string[]; sources: Box[] } | null>(null)
    const repeatOffset = useRef<{ x: number; y: number } | null>(null)
    const groupResize = useRef<{
      mode: HandleId
      start: { x: number; y: number }
      box: Box
      objects: { id: string; x: number; y: number; w: number; h: number }[]
      key: string
    } | null>(null)
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
  const styleSearchIndex = useRef<Record<string, number>>({})
  /** which occurrence of the tag search (ניהול סגנונות > כלים) the explorer is on, per tag text */
  const tagSearchIndex = useRef<Record<string, number>>({})
  /** rubber-band rectangle (world pt) while dragging a new text frame with the Type tool */
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const createStart = useRef<{ x: number; y: number } | null>(null)
  /** moving a frame ("move") or resizing it by a handle, with the Selection tool */
  const frameDrag = useRef<{ id: string; mode: 'move' | HandleId; start: { x: number; y: number }; orig: Box; key: string; kind: 'frame' | 'image' | 'shape' } | null>(null)
  /** turning a frame, a picture or a shape around its own centre, from one of its rotate handles */
  const rotateDrag = useRef<{ id: string; kind: 'frame' | 'image' | 'shape'; center: { x: number; y: number }; startAngle: number; startRotation: number; key: string } | null>(null)
  /** InDesign's own "fine outline" rotation guides: a faint outline of the object's box at the angle this drag
   *  started from, plus a wedge showing how far it has turned since — world point of the centre, box size, the
   *  rotation it started at, and how many degrees it has swept so far */
  const [rotatePreview, setRotatePreview] = useState<{ cx: number; cy: number; w: number; h: number; startRotation: number; sweep: number } | null>(null)
  const dragSeq = useRef(0)
  /** drawing a shape with a shape tool: where it started, and the box it has now (world pt) */
  const shapeStart = useRef<{ kind: DrawKind; x: number; y: number; frame: boolean } | null>(null)
  const [shapeBox, setShapeBox] = useState<Box | null>(null)
  const penPoints = useRef<WorldPathPoint[]>([])
  const pencilPoints = useRef<WorldPathPoint[]>([])
  const pencilEditTarget = useRef<{ id: string; index: number; mode: 'start' | 'end' | 'segment'; snap?: { x: number; y: number } } | null>(null)
  const lastPencilPathId = useRef<string | null>(null)
  /**
   * The pen tool's current gesture. 'new': a point just placed (a plain click leaves it a corner; dragging pulls a symmetric
   * pair of handles out of it). 'handles': Alt on an existing point - dragging pulls handles out of it, a plain Alt click
   * turns it back into a corner. 'move': dragging an existing point. 'handle': dragging one handle of a point (the other
   * side mirrors unless Alt).
   */
  const penDrag = useRef<{ index: number; start: { x: number; y: number }; origin?: { x: number; y: number }; mode: 'new' | 'handles' | 'move' | 'handle'; which?: 'hi' | 'ho'; moved: boolean } | null>(null)
  /** where the pointer is while a pen path is open: the rubber-band line to it */
  const [penHover, setPenHover] = useState<{ x: number; y: number } | null>(null)
  const [penDragging, setPenDragging] = useState(false)
  const [freehandPreview, setFreehandPreview] = useState<{ points: WorldPathPoint[]; closed: boolean } | null>(null)
  /** a line being drawn: which diagonal of `shapeBox` it runs — see document.ts's `ShapeFrame.flip` */
  const [shapeFlip, setShapeFlip] = useState<true | undefined>(undefined)
  const shapeFlipRef = useRef<true | undefined>(undefined)
  /** the small degrees readout next to a line's moving end while drawing it or dragging one of its endpoints
   *  (InDesign shows the same thing) — world point of the moving end, and the angle to show there */
  const [angleTip, setAngleTip] = useState<{ x: number; y: number; deg: number } | null>(null)
  /** the last pointer position while drawing, and whether Enter is held: pressing a key refreshes the preview without moving the mouse */
  const lastShapePointer = useRef<{ x: number; y: number } | null>(null)
  const enterHeld = useRef(false)
  const shapeBoxRef = useRef<Box | null>(null)
  /** dragging one endpoint of an existing line: the other endpoint stays put */
  const lineEndDrag = useRef<{ id: string; fixed: { x: number; y: number } } | null>(null)
  /** rounding a rectangle's corners: the shape, the corners taking part (the one grabbed, plus the ones swept over) and the grab offset */
  const cornerDrag = useRef<{ id: string; corners: number[]; origin: number; sweep: boolean; grab: number; last: { x: number; y: number }; key: string } | null>(null)
  /** a rubber band that started on empty canvas next to a selected rectangle: once it touches the rounding handles it picks corners instead of objects */
  const cornerMarquee = useRef<{ id: string; picking: boolean } | null>(null)
  /** the shape whose corner pick must survive the selection change that is about to happen */
  const keepPick = useRef<string | null>(null)
  /**
   * The point-editing tool. `geom` and `box` are the shape's outline and box right before this drag started (a fresh
   * copy every time, so an index stays meaningful even while the shape is reshaped by the same drag). 'anchor': moving
   * one or more of the shape's own points (`indices`, `anchor` is the one actually under the pointer — the others follow
   * it by the same amount; `twin`, set when Alt was held while grabbing an edge, is the mirrored point that follows by
   * the mirrored amount for the whole drag). 'handle': moving one of a point's own curve handles; `forceMirror` is true only while a new,
   * symmetric pair of handles is being pulled out of a plain corner (Alt-drag on the point itself) — the ordinary case
   * (dragging a handle that already exists) instead follows Alt live, held during the drag.
   */
  const pointDrag = useRef<
    | { kind: 'anchor'; id: string; geom: PathGeom; indices: number[]; anchor: number; twin?: number; box: Box; key: string }
    | { kind: 'handle'; id: string; geom: PathGeom; index: number; which: 'hi' | 'ho'; forceMirror: boolean; box: Box; key: string }
    | null
  >(null)
  /** the shape's own points that are selected, while the point-editing tool has it open */
  const [pointSel, setPointSel] = useState<{ id: string; indices: number[] } | null>(null)
  /** the last point pressed and when: a second press on the very same point shortly after is a double click. A point's
   * own pointerdown must call preventDefault (it starts a drag), and that also suppresses the browser's own dblclick
   * on it - so double-clicking a point is detected by hand here instead of relying on onDoubleClick. */
  const lastPointDown = useRef<{ id: string; index: number; time: number } | null>(null)
  /** the point-editing tool, moving or resizing the picture inside a shape (not the shape itself) */
  const contentDrag = useRef<
    | { kind: 'move'; id: string; start: { x: number; y: number }; origBox: ImageBox }
    | { kind: 'resize'; id: string; corner: 'nw' | 'ne' | 'se' | 'sw'; start: { x: number; y: number }; origBox: ImageBox; ratio: number }
    | null
  >(null)
  const [hotCorners, setHotCorners] = useState<number[]>([])
  /** "change all corners together": a drag on any rounding handle rounds all four corners */
  const [roundTogether, setRoundTogether] = useState(false)
  /** with it off: the corners picked by the last rounding gesture; only their handles stay, and they are rounded together */
  const [cornerPick, setCornerPick] = useState<{ id: string; corners: number[] } | null>(null)
  const activeCornersOf = (id: string): number[] => (!roundTogether && cornerPick?.id === id ? cornerPick.corners : [0, 1, 2, 3])
  // another object (or none): the corner pick is over
  useEffect(() => {
    if (keepPick.current !== null && keepPick.current === selectedId) {
      keepPick.current = null
      return
    }
    setCornerPick(null)
  }, [selectedId])
  // a different object, or a different tool: the point selection is over
  useEffect(() => {
    setPointSel(null)
  }, [selectedId, tool])
  /** the settings window of a shape tool (double click on the tool) */
  const [toolDialog, setToolDialog] = useState<DrawKind | 'pen' | 'pencil' | null>(null)
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(1)
  const [pencilSettings, setPencilSettings] = useState<PencilSettings>({ fidelity: 2.5, smoothness: 65, cap: 'round', editSelected: true, within: 12 })
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

  // a page picked some other way (a click on the canvas) leaves the panel's set behind: then it is just that page
  const selectedPages = pageSel.includes(selPage) ? pageSel.filter((i) => i < doc.pages) : [selPage]
  const selectPage = (i: number, mods?: { shift: boolean; ctrl: boolean }) => {
    if (mods?.shift) {
      // every page from the one the selection grew from to this one
      const from = Math.min(selPage, i)
      const to = Math.max(selPage, i)
      setPageSel(Array.from({ length: to - from + 1 }, (_, k) => from + k))
    } else if (mods?.ctrl) {
      const has = selectedPages.includes(i)
      const next = has ? selectedPages.filter((page) => page !== i) : [...selectedPages, i]
      if (next.length === 0) return
      setPageSel(next)
      setSelectedPage(has ? (i === selPage ? next[next.length - 1] : selPage) : i)
    } else {
      setPageSel([i])
      setSelectedPage(i)
    }
    goTo(spreadOfPage(i))
  }
  const insertPages = (count: number, where: InsertWhere) => {
    if (doc.pages >= 9999) return
    // "beside": the new page stands in the row of the selected page (to its left in a right-to-left document)
    const at = where === 'end' ? doc.pages : where === 'before' ? selPage : selPage + 1
    pendingNav.current = at
    setSelectedPage(at)
    pageOps.insert(at, count, where === 'beside')
  }
  const deleteSelectedPage = () => {
    if (selectedPages.length >= doc.pages) return
    const next = Math.min(Math.min(...selectedPages), doc.pages - selectedPages.length - 1)
    pendingNav.current = next
    setSelectedPage(next)
    setPageSel([next])
    pageOps.remove(selectedPages)
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
   * `paraOverrides`, when given, replaces the head frame's per-paragraph spaceBefore/spaceAfter overrides too (see
   * `applyEdit`, the one caller that has them — spliced to stay lined up with the story's new paragraphs).
   */
  const commitStory = (headId: string, text: string, runs: Run[], abs: number, key: string, paraOverrides?: { paraSpaceBefore?: (number | null)[]; paraSpaceAfter?: (number | null)[] } & Pick<TextFrame, 'paragraphStyleIds' | 'paragraphStyleNames' | 'paragraphStylePatches'>) => {
    const next = frames.map((f) => (f.id === headId ? { ...f, text, runs, ...paraOverrides } : f))
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
    // Enter at the end of a paragraph whose style names a different "next style" (InDesign): the new paragraph follows
    // that one instead of just repeating this one's, and the "\n" just typed is restyled to it too, so whatever gets
    // typed next already looks right (editStory picks new text's look from the character right before it - the "\n")
    let base = head
    let runs = r.runs
    let nextStyleAt: { index: number; style: ParagraphStyleRecord } | null = null
    if (insert === '\n' && from === to) {
      const sourceIndex = paraIndexAt(head.text, from)
      const sourceId = paragraphStyleIdOf(head, sourceIndex)
      const source = sourceId ? paragraphStyles.find((style) => style.id === sourceId) : undefined
      const next = source?.nextStyleId && source.nextStyleId !== source.id ? paragraphStyles.find((style) => style.id === source.nextStyleId) : undefined
      if (next) {
        // spliceParagraphStyles needs a real list to splice a new slot into; without one, seed it from what every
        // paragraph already resolves to, so nothing else changes look and only the new slot gets the next style
        if (!head.paragraphStyleIds?.length) {
          const count = head.text.split('\n').length
          const ids = Array.from({ length: count }, (_, i) => paragraphStyleIdOf(head, i) ?? '')
          const names = ids.map((id) => paragraphStyles.find((style) => style.id === id)?.name ?? '')
          base = { ...head, paragraphStyleIds: ids, paragraphStyleNames: names }
        }
        nextStyleAt = { index: sourceIndex + 1, style: next }
        const resolved = resolveParagraphStyle(next.id)
        const charKeys = ['fontFamily', 'color', 'weight', 'italic', 'fontSize', 'tracking'] as const
        const charPatch = Object.fromEntries(charKeys.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]])) as Partial<CharStyle>
        // what the style being left set and the next one leaves alone goes back to plain, same as clicking a style does
        const leaving = source ? resolveParagraphStyle(source.id) : {}
        if (leaving.weight !== undefined && charPatch.weight === undefined) charPatch.weight = 400
        if (leaving.italic !== undefined && charPatch.italic === undefined) charPatch.italic = false
        if (leaving.tracking !== undefined && charPatch.tracking === undefined) charPatch.tracking = 0
        runs = styleRange(runs, from, from + 1, charPatch)
      }
    }
    const paragraphLists = spliceParagraphStyles(base, base.text, from, to, insert)
    if (nextStyleAt) {
      const { index, style } = nextStyleAt
      const setAt = <T,>(list: T[] | undefined, value: T): T[] | undefined => list?.map((item, i) => (i === index ? value : item))
      const resolved = resolveParagraphStyle(style.id)
      const layoutKeys = ['leading', 'align', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent'] as const
      const layoutPatch = Object.fromEntries(layoutKeys.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]]))
      paragraphLists.paragraphStyleIds = setAt(paragraphLists.paragraphStyleIds, style.id)
      if (paragraphLists.paragraphStyleNames) paragraphLists.paragraphStyleNames = setAt(paragraphLists.paragraphStyleNames, style.name)
      paragraphLists.paragraphStylePatches = setAt(paragraphLists.paragraphStylePatches ?? paragraphLists.paragraphStyleIds!.map(() => ({})), layoutPatch)
    }
    commitStory(headId, r.text, runs, from + insert.length, `type:${headId}`, {
      paraSpaceBefore: spliceParaOverrides(head.paraSpaceBefore, head.text, from, to, insert),
      paraSpaceAfter: spliceParaOverrides(head.paraSpaceAfter, head.text, from, to, insert),
      ...paragraphLists,
    })
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

  /** an Up/Down that ran out of lines in `frameId`: hand the caret to the previous/next frame of its thread, same column */
  const pendingLineJump = useRef<{ frameId: string; x: number; dir: 1 | -1 } | null>(null)
  const jumpToLine = (frameId: string, dir: 1 | -1, x: number) => {
    const fl = flow.get(frameId)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const chain = chainOf(frames, head.id)
    const index = chain.findIndex((f) => f.id === frameId)
    const target = chain[index + dir]
    if (!target) return
    pendingLineJump.current = { frameId: target.id, x, dir }
    setSelectedId(target.id)
    setEditingId(target.id)
    const page = ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)
    setSelectedPage(page)
    goTo(spreadOfPage(page))
  }
  // the target frame's editor mounts only once `editingId` reaches it; then its DOM is up so caretOffsetAt can place
  // the caret at the requested column, on its first line (arriving from above) or its last (arriving from below) -
  // the same edge the jump crossed - same as the browser's own Up/Down landing on the nearest offset of that line.
  // A plain effect, not a layout one: jumpToLine may also have scrolled a new page into view, and that scroll is
  // applied by the viewport's own layout effect, which must run first for this element's rect to be the final one.
  useEffect(() => {
    const pending = pendingLineJump.current
    if (!pending || pending.frameId !== editingId) return
    pendingLineJump.current = null
    const el = document.querySelector('.rich-editor')
    if (!(el instanceof HTMLElement)) return
    const rect = el.getBoundingClientRect()
    const y = pending.dir === 1 ? rect.top + 4 : rect.bottom - 4
    const offset = caretOffsetAt(pending.x, y, el)
    if (offset !== null) askSelection(pending.frameId, offset, offset)
  }, [editingId])

  /**
   * A text-selection drag has carried the pointer above/below its own frame's box (RichEditor's onDragOutside,
   * fired for as long as the button stays down, wherever the pointer goes next - even once this frame has stopped
   * being `editingId`). A plain contenteditable has no way to extend a selection into a different element, let
   * alone one on another page, so this does it by hand: `anchorLocal` is where the drag started (fixed for the
   * whole gesture, an offset into `frameId`'s own text), and every call re-resolves which frame of the same thread
   * the pointer is over now, purely from its own box on screen (the same tx/ty/zoom every frame's own position
   * already uses) - no different from clicking that frame directly. Landing on a frame that isn't the live editor
   * hands editing to it, exactly like an Up/Down that runs off the end of one frame already does.
   */
  const extendSelectionAcrossFrames = (frameId: string, clientX: number, clientY: number, anchorLocal: number) => {
    const fl = flow.get(frameId)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const anchorGlobal = fl.start + anchorLocal
    const target = chainOf(frames, head.id).find((f) => {
      const left = tx + f.x * zoom
      const top = ty + f.y * zoom
      return clientX >= left - 4 && clientX <= left + f.w * zoom + 4 && clientY >= top - 4 && clientY <= top + f.h * zoom + 4
    })
    const targetFlow = target && flow.get(target.id)
    if (!target || !targetFlow) return
    const el = document.querySelector(`[data-frame-id="${target.id}"] .rich-editor, [data-frame-id="${target.id}"] .text-frame-body`)
    const local = el instanceof HTMLElement ? caretOffsetAt(clientX, clientY, el) : null
    const localOffset = local ?? (clientY < ty + target.y * zoom ? 0 : targetFlow.slice.length)
    const globalTarget = targetFlow.start + localOffset
    const a = Math.min(anchorGlobal, globalTarget)
    const b = Math.max(anchorGlobal, globalTarget)
    setTextSel((prev) => (prev && prev.headId === fl.headId && prev.a === a && prev.b === b ? prev : { headId: fl.headId, a, b }))
    if (editingId !== target.id) {
      setSelectedId(target.id)
      setEditingId(target.id)
      const page = ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)
      setSelectedPage(page)
      goTo(spreadOfPage(page))
    }
    askSelection(target.id, Math.max(0, a - targetFlow.start), Math.min(targetFlow.slice.length, b - targetFlow.start))
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
    const sel = editingId === id && textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length ? textSel : null
    const chainIds = new Set(chainOf(frames, id).map((f) => f.id))
    const key = `style:${head.id}:${Object.keys(patch).join(',')}`
    const applyWholeStyle = (f: TextFrame) => ({ ...f, ...patch, runs: styleRange(runs, 0, head.text.length, patch) })
    onFramesChange(
      frames.map((f) => {
        if (sel) return f.id === head.id ? { ...f, runs: styleRange(runs, sel.a, sel.b, patch) } : f
        if (f.id === head.id) return applyWholeStyle(f)
        return chainIds.has(f.id) ? { ...f, ...patch } : f
      }),
      key,
    )
  }

  /**
   * The size arrows: every size in the text (the selection, or the whole story) moves by `delta`, so a story with a heading
   * and body text keeps its sizes apart. Typing a size sets them all to it (applyCharStyle).
   */
  const stepFontSize = (id: string, delta: number) => {
    const fl = flow.get(id)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const runs = normalizeRuns(head.text, head.runs, head)
    const sel = editingId === id && textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length ? textSel : null
    const chainIds = new Set(chainOf(frames, id).map((f) => f.id))
    const clampSize = (size: number) => Math.min(999, Math.max(1, size + delta))
    onFramesChange(
      frames.map((f) => {
        if (sel) return f.id === head.id ? { ...f, runs: restyleRange(runs, sel.a, sel.b, (style) => ({ fontSize: clampSize(style.fontSize) })) } : f
        if (!chainIds.has(f.id)) return f
        return { ...f, fontSize: clampSize(f.fontSize), ...(f.id === head.id ? { runs: restyleRange(runs, 0, head.text.length, (style) => ({ fontSize: clampSize(style.fontSize) })) } : {}) }
      }),
      `style:${head.id}:fontSizeStep`,
    )
  }

  const sampleTextStyle = (id: string) => {
    const fl = flow.get(id)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const runs = normalizeRuns(head.text, head.runs, head)
    const selected = editingId === id && textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length
    const style = selected && textSel ? styleAtChar(runs, textSel.a, head) : charStyleOf(head)
    setSampledTextStyle(style)
  }

  /** alignment belongs to the whole story */
  const applyAlign = (id: string, align: TextAlign) => {
    const ids = new Set(chainOf(frames, id).map((f) => f.id))
    // a paragraph's own alignment (from a paragraph style) would otherwise still win over what was just chosen
    const withoutAlign = (patches: NonNullable<TextFrame['paragraphStylePatches']>) =>
      patches.map((patch) => {
        const next = { ...patch }
        delete next.align
        return next
      })
    onFramesChange(frames.map((f) => (ids.has(f.id) ? { ...f, align, ...(f.paragraphStylePatches ? { paragraphStylePatches: withoutAlign(f.paragraphStylePatches) } : {}) } : f)), `align:${id}`)
  }

  /** Apply paragraph layout to the selected text, or to the paragraphs shown by the selected frame. */
  const applyParagraphStyle = (
    id: string,
    patch: Partial<Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>,
  ) => {
    const flowPart = flow.get(id)
    const head = flowPart && frames.find((frame) => frame.id === flowPart.headId)
    if (!flowPart || !head) return
    const selected = textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length ? textSel : null
    const indexes = selected ? paragraphsInRange(head.text, selected.a, selected.b) : paragraphsInRange(head.text, flowPart.start, Math.max(flowPart.start + 1, flowPart.end))
    const patches = head.paragraphStylePatches ? head.paragraphStylePatches.slice() : head.text.split('\n').map(() => ({}))
    for (const index of indexes) patches[index] = { ...(patches[index] ?? {}), ...patch }
    onFramesChange(frames.map((frame) => frame.id === head.id ? { ...frame, paragraphStylePatches: patches } : frame), `paragraph:${id}:${Object.keys(patch).join(',')}`)
  }

  /**
   * spaceBefore/spaceAfter: applies to every paragraph touched by the current text selection, or the whole story
   * when nothing is selected — the two independent controls asked for ("select the middle paragraph, spaceBefore
   * pushes it away from the one above, spaceAfter pushes the one after it away"). See document.ts's `paraGaps` for
   * how a paragraph's own override interacts with its neighbours' when both set one.
   */
  const applyParaSpacing = (id: string, patch: Partial<Pick<TextStyle, 'spaceBefore' | 'spaceAfter'>>) => {
    const flowPart = flow.get(id)
    const head = flowPart && frames.find((frame) => frame.id === flowPart.headId)
    if (!head) return
    const sel = textSel && textSel.headId === head.id && textSel.a !== textSel.b && textSel.b <= head.text.length ? textSel : null
    let paraSpaceBefore = head.paraSpaceBefore
    let paraSpaceAfter = head.paraSpaceAfter
    const indexes = sel ? paragraphsInRange(head.text, sel.a, sel.b) : paragraphsInRange(head.text, flowPart.start, Math.max(flowPart.start + 1, flowPart.end))
    for (const i of indexes) {
      if (patch.spaceBefore !== undefined) paraSpaceBefore = withParaOverride(paraSpaceBefore, i, patch.spaceBefore)
      if (patch.spaceAfter !== undefined) paraSpaceAfter = withParaOverride(paraSpaceAfter, i, patch.spaceAfter)
    }
    onFramesChange(frames.map((f) => (f.id === head.id ? { ...f, paraSpaceBefore, paraSpaceAfter } : f)), `parastyle:${id}:${Object.keys(patch).join(',')}`)
  }

  /**
   * Removes repeated spaces and empty paragraphs: from the selected text if there is one (Ctrl+A first selects the
   * whole story, so that also works), otherwise from every story in the document. One undo step either way.
   */
  const cleanSpacingCmd = () => {
    // the paragraph overrides are re-indexed from the net {from,to,insert} of old→new text (diffEdit), even though
    // cleanSpacing itself may have applied several small edits internally — the net effect is all that matters here
    if (textSel && textSel.a !== textSel.b) {
      const head = frames.find((f) => f.id === textSel.headId)
      if (!head) return
      const runs = normalizeRuns(head.text, head.runs, head)
      const { text, runs: newRuns } = cleanSpacing(head.text, runs, head, textSel.a, Math.min(textSel.b, head.text.length))
      const d = diffEdit(head.text, text)
      onFramesChange(
        frames.map((f) =>
          f.id === head.id
            ? {
                ...f,
                text,
                runs: newRuns,
                paraSpaceBefore: spliceParaOverrides(f.paraSpaceBefore, head.text, d.from, d.to, d.insert),
                paraSpaceAfter: spliceParaOverrides(f.paraSpaceAfter, head.text, d.from, d.to, d.insert),
                ...spliceParagraphStyles(f, head.text, d.from, d.to, d.insert),
              }
            : f,
        ),
      )
      setTextSel(null)
      return
    }
    const cleaned = new Map(headFrames(frames).map((h) => [h.id, cleanSpacing(h.text, normalizeRuns(h.text, h.runs, h), h)]))
    if (cleaned.size === 0) return
    onFramesChange(
      frames.map((f) => {
        const c = cleaned.get(f.id)
        if (!c) return f
        const d = diffEdit(f.text, c.text)
        return {
          ...f,
          text: c.text,
          runs: c.runs,
          paraSpaceBefore: spliceParaOverrides(f.paraSpaceBefore, f.text, d.from, d.to, d.insert),
          paraSpaceAfter: spliceParaOverrides(f.paraSpaceAfter, f.text, d.from, d.to, d.insert),
          ...spliceParagraphStyles(f, f.text, d.from, d.to, d.insert),
        }
      }),
    )
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

  const importedStyleId = (style: ImportedParagraphStyle, used: Set<string>) => {
    const stem = `paragraph-style-word-${style.wordId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'style'}`
    let id = stem
    let suffix = 2
    while (used.has(id)) id = `${stem}-${suffix++}`
    used.add(id)
    return id
  }

  const preparePlacedText = (placed: PlacedText): PlacedText => {
    if (!placed.paragraphStyles?.length || !placed.paragraphStyleIds?.length) return placed
    const nextStyles = [...paragraphStyles]
    const used = new Set(nextStyles.map((style) => style.id))
    const ids = new Map<string, string>()
    for (const imported of placed.paragraphStyles) {
      const existing = nextStyles.find((style) => style.name === imported.name)
      const id = existing?.id ?? importedStyleId(imported, used)
      ids.set(imported.wordId, id)
      if (!existing) nextStyles.push({ id, name: imported.name, patch: imported.patch })
    }
    if (nextStyles.length !== paragraphStyles.length) onParagraphStylesChange(nextStyles)
    return { ...placed, paragraphStyleIds: placed.paragraphStyleIds.map((wordId) => ids.get(wordId) ?? wordId) }
  }


  /**
   * Pour the loaded text into a frame at `target`. Shift = semi-automatic, Alt = automatic, otherwise the mode
   * chosen in the banner. The whole result is one undo step.
   */
  const doPlace = (target: { box: Box; frameId?: string }, mods: { shift: boolean; alt: boolean }) => {
    if (!placing) return
    const mode: FlowMode = mods.shift ? 'semi' : mods.alt ? 'auto' : flowMode
    const result = pourText(doc, frames, images, preparePlacedText(placing), target, mode, shapes)
    pageOps.commit({ ...result.content, frames: result.content.frames.map((frame) => ({ ...frame, layerId: activeLayerId })) })
    setSelectedId(result.headId)
    setEditingId(null)
    onPlacingChange(result.remaining)
  }

  const replaceSelectedText = (placed: PlacedText) => {
    const selected = selectedId ? frames.find((frame) => frame.id === selectedId) : undefined
    if (!selected) return false
    const result = pourText(doc, frames, images, preparePlacedText(placed), { box: { x: selected.x, y: selected.y, w: selected.w, h: selected.h }, frameId: selected.id }, 'single', shapes)
    pageOps.commit({ ...result.content, frames: result.content.frames.map((frame) => ({ ...frame, layerId: frame.layerId ?? activeLayerId })) })
    setSelectedId(result.headId)
    setEditingId(null)
    return true
  }

  /**
   * Put the first loaded picture on the page. A dragged rectangle: the picture is fitted into it keeping its shape.
   * A click: natural size (one pixel = one point), scaled down to fit the text area, kept on the page.
   */
  const placeImage = (rect: Box | null, at: { x: number; y: number }) => {
    const next = placingImages[0]
    if (!next) return
    const { asset, assetId } = next
    // a plain click (not a dragged rectangle) on a shape that has no picture of its own yet: the picture goes inside it,
    // clipped to its outline, instead of a new rectangular frame on top of it
    if (!rect) {
      const target = emptyShapeAt(at.x, at.y)
      if (target) {
        pageOps.commit({
          shapes: shapes.map((sh) => (sh.id === target.id ? { ...sh, image: { assetId, fit: 'fill' as const } } : sh)),
          ...(assets[assetId] ? {} : { assets: { ...assets, [assetId]: asset } }),
        })
        setSelectedId(target.id)
        setEditingId(null)
        onPlacingImagesChange(placingImages.slice(1))
        return
      }
    }
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
    const frame: ImageFrame = { id: newFrameId(), layerId: activeLayerId, x, y, w: Math.max(MIN_FRAME_PT, w), h: Math.max(MIN_FRAME_PT, h), assetId, fit: 'fill', z: nextZ(frames, images, shapes) }
    pageOps.commit({ images: [...images, frame], assets: assets[assetId] ? assets : { ...assets, [assetId]: asset } })
    setSelectedId(frame.id)
    setEditingId(null)
    onPlacingImagesChange(placingImages.slice(1))
  }

  /** clicking a picture: the Selection tool selects it and starts moving it (other tools pass the click on) */
  const onImagePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0 || (tool !== 'select' && tool !== 'transform' && tool !== 'direct')) return
    if (layerLocked || itemLocks[id]) return
    if (layerLocked) return
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

  const flipShape = (id: string, axis: 'x' | 'y') => {
    const shape = shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    const flipVertex = (vertex: PathVertex): PathVertex => {
      if (Array.isArray(vertex)) return axis === 'x' ? [1 - vertex[0], vertex[1]] : [vertex[0], 1 - vertex[1]]
      return {
        p: axis === 'x' ? [1 - vertex.p[0], vertex.p[1]] : [vertex.p[0], 1 - vertex.p[1]],
        hi: vertex.hi ? (axis === 'x' ? [-vertex.hi[0], vertex.hi[1]] : [vertex.hi[0], -vertex.hi[1]]) : undefined,
        ho: vertex.ho ? (axis === 'x' ? [-vertex.ho[0], vertex.ho[1]] : [vertex.ho[0], -vertex.ho[1]]) : undefined,
      }
    }
    const patch: Partial<ShapeFrame> = {}
    if (shape.kind === 'path' && shape.geom) patch.geom = shape.geom.map((poly) => poly.map((ring) => ring.map(flipVertex)))
    if (shape.kind === 'rect' && shape.radii) patch.radii = axis === 'x' ? [shape.radii[1], shape.radii[0], shape.radii[3], shape.radii[2]] : [shape.radii[3], shape.radii[2], shape.radii[1], shape.radii[0]]
    if (shape.kind === 'line') patch.flip = shape.flip ? undefined : true
    if (Object.keys(patch).length > 0) updateShape(id, patch, `flip:${axis}:${id}`)
  }

  const updateImage = (id: string, patch: Partial<ImageFrame>, key?: string) =>
    onImagesChange(images.map((im) => (im.id === id ? { ...im, ...patch } : im)), key)

  /** move an object in the stacking order (frames and pictures together): one undo step */
  const arrangeObject = (id: string | null, op: ArrangeOp) => {
    if (!id) return
    const r = arrange(frames, images, id, op, shapes)
    if (r) pageOps.commit(r)
  }

  const alignObjects = (op: AlignOp) => {
    if (multiSel.length < 2) return
    const chosen = chosenObjects()
    if (chosen.length < 2) return
    const left = Math.min(...chosen.map((o) => o.x))
    const top = Math.min(...chosen.map((o) => o.y))
    const right = Math.max(...chosen.map((o) => o.x + o.w))
    const bottom = Math.max(...chosen.map((o) => o.y + o.h))
    const patch = (o: (typeof chosen)[number]) => {
      if (op === 'left') return { x: left }
      if (op === 'centerX') return { x: (left + right - o.w) / 2 }
      if (op === 'right') return { x: right - o.w }
      if (op === 'top') return { y: top }
      if (op === 'centerY') return { y: (top + bottom - o.h) / 2 }
      return { y: bottom - o.h }
    }
    const ids = new Set(multiSel)
    onFramesChange(frames.map((o) => (ids.has(o.id) ? { ...o, ...patch(o) } : o)), `align:${op}`)
    onImagesChange(images.map((o) => (ids.has(o.id) ? { ...o, ...patch(o) } : o)), `align:${op}`)
    onShapesChange(shapes.map((o) => (ids.has(o.id) ? { ...o, ...patch(o) } : o)), `align:${op}`)
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
    const color = displayGuideColor(orig?.color ?? guideColor)
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
  const groupSelection = (() => {
    if (selectedId || multiSel.length < 2) return null
    const objects = chosenObjects()
    if (objects.length < 2) return null
    const x = Math.min(...objects.map((o) => o.x))
    const y = Math.min(...objects.map((o) => o.y))
    const right = Math.max(...objects.map((o) => o.x + o.w))
    const bottom = Math.max(...objects.map((o) => o.y + o.h))
    return { box: { x, y, w: Math.max(MIN_FRAME_PT, right - x), h: Math.max(MIN_FRAME_PT, bottom - y) }, objects }
  })()

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

  // ── copy, paste, duplicate ─────────────────────────────────────────────────────
  /** the selected text frames, pictures and shapes (not guides) */
  const selectedObjectIds = () => (selectedId ? [selectedId] : multiSel).filter((id) => frames.some((f) => f.id === id) || images.some((im) => im.id === id) || shapes.some((sh) => sh.id === id))

  const inferRepeatOffset = (ids: string[]): { x: number; y: number } | null => {
    if (ids.length !== 1) return null
    const id = ids[0]
    const selectedShape = shapes.find((o) => o.id === id)
    const selectedImage = images.find((o) => o.id === id)
    const selectedFrame = frames.find((o) => o.id === id)
    const selected = selectedShape ?? selectedImage ?? selectedFrame
    if (!selected) return null
    const pool = selectedShape ? shapes : selectedImage ? images : frames
    const candidates = pool
      .filter((o) => o.id !== id && Math.abs(o.w - selected.w) < 0.5 && Math.abs(o.h - selected.h) < 0.5)
      .map((o) => ({ object: o, distance: Math.hypot(o.x - selected.x, o.y - selected.y) }))
      .filter((o) => o.distance > 0)
      .sort((a, b) => a.distance - b.distance)
    const nearest = candidates[0]?.object
    if (!nearest) return null
    const selectedIsAbove = (selected.z ?? 0) >= (nearest.z ?? 0)
    return selectedIsAbove ? { x: selected.x - nearest.x, y: selected.y - nearest.y } : { x: nearest.x - selected.x, y: nearest.y - selected.y }
  }

  /**
   * Copies of the given objects, as they are now. A text frame is copied as what it shows (a frame of a thread only its
   * part of the story), as one frame of its own.
   */
  const snapshotObjects = (ids: string[]): ClipObjects | null => {
    const set = new Set(ids)
    const nf = frames
      .filter((f) => set.has(f.id))
      .map((f): TextFrame => {
        const fl = flow.get(f.id)
        return fl ? { ...f, ...fl.style, text: fl.slice, runs: fl.runs, next: null } : { ...f, next: null }
      })
    const ni = images.filter((im) => set.has(im.id))
    const ns = shapes.filter((sh) => set.has(sh.id))
    if (nf.length + ni.length + ns.length === 0) return null
    const used = Object.fromEntries(ni.filter((im) => assets[im.assetId]).map((im) => [im.assetId, assets[im.assetId]]))
    return { frames: nf, images: ni, shapes: ns, assets: used }
  }

  /**
   * Put copies of the objects into the document, in front of everything and moved by `by`, in one undo step. The new
   * objects are selected. Returns their ids, in the order frames, pictures, shapes.
   */
  const insertObjects = (data: ClipObjects, by: { x: number; y: number }): string[] => {
    // keep the objects' order among themselves: the copies get consecutive layers above everything
    const order = new Map(stackOrder(data.frames, data.images, data.shapes).map((o, i) => [o.id, i]))
    const base = nextZ(frames, images, shapes)
    const layer = (id: string) => base + (order.get(id) ?? 0)
    const moved = <T extends { id: string; x: number; y: number; z?: number }>(o: T): T => ({ ...o, id: newFrameId(), x: o.x + by.x, y: o.y + by.y, z: layer(o.id) })
    const nf = data.frames.map(moved)
    const ni = data.images.map(moved)
    const ns = data.shapes.map(moved)
    const missing = Object.fromEntries(Object.entries(data.assets).filter(([id]) => !assets[id]))
    pageOps.commit({
      frames: [...frames, ...nf],
      images: [...images, ...ni],
      shapes: [...shapes, ...ns],
      ...(Object.keys(missing).length > 0 ? { assets: { ...assets, ...missing } } : {}),
    })
    const ids = [...nf, ...ni, ...ns].map((o) => o.id)
    setGuideSel([])
    setEditingId(null)
    setPathEdit(null)
    if (ids.length === 1) {
      setMultiSel([])
      setSelectedIdRaw(ids[0])
    } else {
      setMultiSel(ids)
      setSelectedIdRaw(null)
    }
    return ids
  }

  /** copy (or cut) the selected objects into the program's clipboard; returns the marker text for the system clipboard, or null if nothing is selected */
  const copyObjects = (cut: boolean): string | null => {
    const ids = selectedObjectIds()
    const data = snapshotObjects(ids)
    if (!data) return null
    const token = setClip(data)
    if (cut) deleteSelection(ids, [])
    return token
  }
  /** the menu's Copy / Cut: there is no clipboard event, so the marker text is written to the system clipboard here */
  const copyToClipboard = async (cut: boolean) => {
    const token = copyObjects(cut)
    if (!token) return
    try {
      await navigator.clipboard?.writeText(token)
    } catch {
      // no permission: pasting inside the program still works from the menu
    }
  }

  /** paste copied objects: each paste lands a bit further right and lower than the one before */
  const pasteEntry = (entry: NonNullable<ReturnType<typeof lastClip>>) => {
    entry.pastes += 1
    insertObjects(entry.data, { x: entry.pastes * 14, y: entry.pastes * 14 })
  }
  const pasteFromClipboard = () => {
    const entry = lastClip()
    if (entry) pasteEntry(entry)
  }

  /** a copy right on top of the selected objects (Ctrl+F) */
  const duplicateSelection = () => {
      const data = snapshotObjects(selectedObjectIds())
      if (!data) return
      const ids = insertObjects(data, { x: 0, y: 0 })
      const sourceObjects = [...data.frames, ...data.images, ...data.shapes]
      repeatPending.current = { ids, sources: sourceObjects.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })) }
  }
    const repeatDuplicate = () => {
      const ids = selectedObjectIds()
      const inferred = inferRepeatOffset(ids)
      const offset = inferred ?? repeatOffset.current
      if (!offset) {
        duplicateSelection()
        return
      }
      repeatOffset.current = offset
      const data = snapshotObjects(ids)
      if (data) insertObjects(data, offset)
    }
    const learnRepeatOffset = (id?: string, placed?: Box) => {
      const pending = repeatPending.current
      if (!pending || pending.ids.length === 0) return
      const all = [...frames, ...images, ...shapes]
      const index = id ? pending.ids.indexOf(id) : 0
      if (index < 0) return
      const current = placed ?? all.find((o) => o.id === pending.ids[index])
      if (!current) return
      const source = pending.sources[index]
      const offset = { x: current.x - source.x, y: current.y - source.y }
      if (offset.x !== 0 || offset.y !== 0) repeatOffset.current = offset
      repeatPending.current = null
    }

  /**
   * Alt + drag on an object: it is copied on the spot and the copy is what the pointer drags, so the original stays.
   * With several objects selected all of them are copied and dragged together.
   */
  const altDuplicateDrag = (id: string, e: ReactPointerEvent<Element>): boolean => {
    const ids = multiSel.length > 1 && multiSel.includes(id) ? multiSel : [id]
    const data = snapshotObjects(ids)
    if (!data) return false
    e.stopPropagation()
    e.preventDefault()
    const created = insertObjects(data, { x: 0, y: 0 })
    const flat = [...data.frames, ...data.images, ...data.shapes]
    dragSeq.current += 1
    const start = toWorld(e.clientX, e.clientY)
    if (created.length === 1) {
      const src = flat[0]
      frameDrag.current = {
        id: created[0],
        mode: 'move',
        start,
        orig: { x: src.x, y: src.y, w: src.w, h: src.h },
        key: `drag:${dragSeq.current}`,
        kind: data.shapes.length ? 'shape' : data.images.length ? 'image' : 'frame',
      }
    } else {
      groupDrag.current = { origins: new Map(created.map((cid, i) => [cid, { x: flat[i].x, y: flat[i].y }])), start, key: `group:${dragSeq.current}` }
    }
    vpRef.current!.setPointerCapture(e.pointerId)
    return true
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

  /** exactly one picture and one shape selected together: offered as "put the picture inside the shape" */
  const imageShapeMerge: { image: ImageFrame; shape: ShapeFrame } | null =
    multiSel.length === 2
      ? (() => {
          const image = images.find((im) => multiSel.includes(im.id))
          const shape = shapes.find((sh) => multiSel.includes(sh.id))
          return image && shape ? { image, shape } : null
        })()
      : null
  /** the picture the user chose replaces the shape's own outline: it is put inside it, scaled to the shape (a huge picture
   * shrinks to match), and the separate picture frame is gone — one undo step */
  const insertImageIntoShape = () => {
    if (!imageShapeMerge) return
    const { image, shape } = imageShapeMerge
    pageOps.commit({
      shapes: shapes.map((sh) => (sh.id === shape.id ? { ...sh, image: { assetId: image.assetId, fit: 'fill' } } : sh)),
      images: images.filter((im) => im.id !== image.id),
    })
    setMultiSel([])
    setSelectedIdRaw(shape.id)
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
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) return altDuplicateDrag(id, e)
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
    selectTool: (nextTool) => setTool(nextTool),
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
    copy: () => void copyToClipboard(false),
    cut: () => void copyToClipboard(true),
    paste: () => pasteFromClipboard(),
    duplicateInPlace: () => duplicateSelection(),
    repeatDuplicate: () => repeatDuplicate(),
    createGuides: () => setGuidesDialog(true),
    clearGuides: () => {
      if (guides.some((g) => g.page === selPage)) onGuidesChange(guides.filter((g) => g.page !== selPage))
    },
    cleanSpacing: cleanSpacingCmd,
    canReplaceSelectedText: () => !!selectedId && !!frames.find((frame) => frame.id === selectedId),
    replaceSelectedText,
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
      if ((layerLocked || (selectedId && itemLocks[selectedId])) && e.key !== 'Escape') return
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
      } else if (tool === 'direct' && pointSel && (e.key === 'Delete' || e.key === 'Backspace')) {
        // the point-editing tool, with points of its own selected: only they go, not the whole shape (unless too few would be left)
        e.preventDefault()
        const sh = shapes.find((x) => x.id === pointSel.id)
        const ring = sh && (sh.kind === 'path' ? sh.geom?.[0]?.[0] : editableRing(sh))
        if (sh && ring) {
          const keep = ring.filter((_, i) => !pointSel.indices.includes(i))
          if (keep.length >= 3) {
            const base: PathGeom = sh.kind === 'path' ? (sh.geom ?? [[ring]]) : [[ring]]
            const geom: PathGeom = [[keep, ...base[0].slice(1)], ...base.slice(1)]
            onShapesChange(shapes.map((x) => (x.id === sh.id ? { ...x, kind: 'path', geom, sides: undefined, radii: undefined } : x)), `del-points:${sh.id}`)
          }
        }
        setPointSel(null)
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
  }, [selectedId, multiSel, guideSel, guidesVisible, linkFrom, frames, images, shapes, guides, layerLocked, itemLocks, onFramesChange, onImagesChange, onShapesChange, onGuidesChange, tool, pointSel])


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

  // Ctrl+C / Ctrl+X / Ctrl+V on objects: the browser's own copy, cut and paste events, so the keys work like everywhere else
  const clipOps = useRef({ copy: copyObjects, paste: pasteEntry })
  clipOps.current = { copy: copyObjects, paste: pasteEntry }
  useEffect(() => {
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return // text being edited (or a field): the normal copy of the text
      const token = clipOps.current.copy(e.type === 'cut')
      if (!token) return // no object selected: leave the event alone
      e.preventDefault()
      e.clipboardData?.setData('text/plain', token)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      // only our own marker: text or pictures from elsewhere go to the place-text / place-picture cursor as before
      if (!isClipToken(text)) return
      const entry = clipForToken(text)
      e.preventDefault()
      e.stopImmediatePropagation()
      if (entry) clipOps.current.paste(entry)
    }
    window.addEventListener('copy', onCopyOrCut)
    window.addEventListener('cut', onCopyOrCut)
    window.addEventListener('paste', onPaste, true) // capture: before the program's other paste handler
    return () => {
      window.removeEventListener('copy', onCopyOrCut)
      window.removeEventListener('cut', onCopyOrCut)
      window.removeEventListener('paste', onPaste, true)
    }
  }, [])

  // a shape is selected and empty when pictures are loaded (File > Place with it already chosen): the first picture goes
  // straight into it, clipped to its outline, with no click needed
  useEffect(() => {
    const sh = selectedId ? shapes.find((x) => x.id === selectedId) : undefined
    if (placingImages.length === 0 || !sh || !sh.frame || sh.image) return
    const { asset, assetId } = placingImages[0]
    pageOps.commit({
      shapes: shapes.map((x) => (x.id === sh.id ? { ...x, image: { assetId, fit: 'fill' as const } } : x)),
      ...(assets[assetId] ? {} : { assets: { ...assets, [assetId]: asset } }),
    })
    onPlacingImagesChange(placingImages.slice(1))
    // only when a fresh batch of pictures is loaded, not on every selection change while some are still queued
  }, [placingImages])

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

  // ── text on the outline of a shape ────────────────────────────────────────────
  /** the outline nearest to a world point, if one is within reach (the topmost shape wins a tie) */
  const nearestOutline = (p: { x: number; y: number }) => {
    const reach = 9 / live.current.zoom
    let best: { shape: ShapeFrame; fraction: number; dist: number } | null = null
    for (const sh of shapes) {
      if (p.x < sh.x - reach || p.x > sh.x + sh.w + reach || p.y < sh.y - reach || p.y > sh.y + sh.h + reach) continue
      const info = ringInfo(sh)
      if (!info) continue
      const n = nearestOnRing(info, [p.x - sh.x, p.y - sh.y])
      if (n.dist <= reach && (!best || n.dist <= best.dist)) best = { shape: sh, fraction: n.fraction, dist: n.dist }
    }
    return best
  }

  /** the topmost shape, without a picture of its own already, whose outline holds a world point — where a placed picture goes into the shape instead of a new frame of its own */
  const emptyShapeAt = (x: number, y: number): ShapeFrame | undefined => {
    let best: ShapeFrame | undefined
    let bestRank = -1
    for (const sh of shapes) {
      if (!sh.frame || sh.image) continue
      if (x < sh.x || x > sh.x + sh.w || y < sh.y || y > sh.y + sh.h) continue
      const info = ringInfo(sh)
      if (!info || !pointInRing(info, [x - sh.x, y - sh.y])) continue
      const r = rank.get(sh.id) ?? 0
      if (r > bestRank) {
        best = sh
        bestRank = r
      }
    }
    return best
  }

  const updatePathText = (id: string, patch: Partial<PathText>, key?: string) =>
    onShapesChange(shapes.map((sh) => (sh.id === id && sh.pathText ? { ...sh, pathText: { ...sh.pathText, ...patch } } : sh)), key)

  /** ask the text box to put the caret at [a, b] of the text of shape `id` */
  const askPathSelection = (id: string, a: number, b: number) => {
    pathRequestToken.current += 1
    setPathRequest({ id, a, b, token: pathRequestToken.current })
  }

  /** a click with the text-on-a-path tool: the shape gets a place for text at that point of its outline, and the text box opens */
  const startPathText = (hit: { shape: ShapeFrame; fraction: number }) => {
    const sh = hit.shape
    if (!sh.pathText) {
      const pt: PathText = { text: '', runs: [], style: { ...DEFAULT_PATH_TEXT_STYLE }, anchor: hit.fraction, span: 0.98, side: 'outside', color: DEFAULT_PATH_TEXT_COLOR }
      onShapesChange(shapes.map((x) => (x.id === sh.id ? { ...x, pathText: pt } : x)))
    }
    setSelectedId(sh.id)
    setEditingId(null)
    setPathEdit(sh.id)
    setPathSel(null)
  }

  /** the text box lost the focus: editing ends, and a text that was never typed is dropped */
  const stopPathEdit = (id: string) => {
    setPathEdit((cur) => (cur === id ? null : cur))
    const sh = shapes.find((x) => x.id === id)
    if (sh?.pathText && sh.pathText.text === '') onShapesChange(shapes.map((x) => (x.id === id ? { ...x, pathText: undefined } : x)))
  }

  const applyPathEdit = (id: string, from: number, to: number, insert: string) => {
    const pt = shapes.find((x) => x.id === id)?.pathText
    if (!pt) return
    const r = editStory(pt.text, pt.runs, from, to, insert, pt.style)
    updatePathText(id, { text: r.text, runs: r.runs }, `pathtext:${id}`)
    askPathSelection(id, from + insert.length, from + insert.length)
  }

  /** a change of font, size, weight or style: the selected part of the text, or all of it */
  const applyPathChar = (id: string, patch: Partial<CharStyle>) => {
    const pt = shapes.find((x) => x.id === id)?.pathText
    if (!pt) return
    const runs = normalizeRuns(pt.text, pt.runs, pt.style)
    const sel = pathSel && pathSel.id === id && pathSel.a !== pathSel.b && pathSel.b <= pt.text.length ? pathSel : null
    const key = `pathstyle:${id}:${Object.keys(patch).join(',')}`
    updatePathText(id, sel ? { runs: styleRange(runs, sel.a, sel.b, patch) } : { style: { ...pt.style, ...patch }, runs: styleRange(runs, 0, pt.text.length, patch) }, key)
  }

  /** grabbing a peg of the text on an outline */
  const onPegDown = (id: string) => (peg: PathPeg, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    dragSeq.current += 1
    pegDrag.current = { id, peg, key: `peg:${dragSeq.current}` }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const movePeg = (d: NonNullable<typeof pegDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const sh = shapes.find((x) => x.id === d.id)
    const pt = sh?.pathText
    const info = sh ? ringInfo(sh) : null
    if (!sh || !pt || !info) return
    const p = toWorld(e.clientX, e.clientY)
    const local: Pt = [p.x - sh.x, p.y - sh.y]
    const near = nearestOnRing(info, local)
    const { rtl, dir } = textPlacement(pt)
    const mod1 = (v: number) => ((v % 1) + 1) % 1
    if (d.peg === 'anchor') {
      // when the middle of the text reaches the center line of the shape it is held there and a guide line shows it (Ctrl = free)
      let anchor = near.fraction
      let guide: SnapLine | null = null
      if (!(e.ctrlKey || e.metaKey)) {
        const s = snapTextToCenter(sh, info, pt, anchor, SNAP_PX / live.current.zoom)
        if (s) {
          anchor = s.anchor
          const over = 24 / live.current.zoom
          guide =
            s.axis === 'x'
              ? { axis: 'v', at: sh.x + sh.w / 2, from: sh.y - over, to: sh.y + sh.h + over, kind: 'guide' }
              : { axis: 'h', at: sh.y + sh.h / 2, from: sh.x - over, to: sh.x + sh.w + over, kind: 'guide' }
        }
      }
      setSnapShown(guide ? [guide] : (cur) => (cur.length ? [] : cur))
      updatePathText(d.id, { anchor }, d.key)
    }
    else if (d.peg === 'end') {
      // the text runs from the anchor along the outline: the peg sets how far
      const span = mod1(rtl ? dir * (pt.anchor - near.fraction) : dir * (near.fraction - pt.anchor))
      updatePathText(d.id, { span: Math.min(1, Math.max(MIN_SPAN, span)) }, d.key)
    } else {
      // pulling the middle peg into the shape puts the text inside it, pulling it out puts the text outside
      updatePathText(d.id, { side: pointInRing(info, local) ? 'inside' : 'outside' }, d.key)
    }
  }

  /** a dragged point held on the page edges, margins, column edges and guides (each coordinate on its own); `off` skips it */
  const snapPoint = (p: { x: number; y: number }, off: boolean) => {
    if (off) return { p, lines: [] as SnapLine[] }
    const tol = SNAP_PX / live.current.zoom
    const sx = snapEdges([p.x], [...snapLinesRef.current.v, ...snapLinesRef.current.cv], tol)
    const sy = snapEdges([p.y], [...snapLinesRef.current.h, ...snapLinesRef.current.ch], tol)
    return { p: { x: p.x + (sx?.delta ?? 0), y: p.y + (sy?.delta ?? 0) }, lines: [sx?.line, sy?.line].filter((l): l is SnapLine => !!l) }
  }

  /**
   * A moved or resized object: the edges that move are held exactly on a line when one is near. The move / resize gets
   * corrected offsets, and the lines to show.
   */
  const snapDrag = (orig: Box, mode: 'move' | HandleId, dx: number, dy: number, fromCenter = false, objs?: ReturnType<typeof objectLines>) => {
    const tol = SNAP_PX / live.current.zoom
    const move = mode === 'move'
    // the document's lines, then the edges and middles of the other objects (which lose a tie)
    const L = { v: [...snapLinesRef.current.v, ...(objs?.v ?? [])], h: [...snapLinesRef.current.h, ...(objs?.h ?? [])], cv: [...snapLinesRef.current.cv, ...(objs?.cv ?? [])], ch: [...snapLinesRef.current.ch, ...(objs?.ch ?? [])] }
    if (fromCenter && !move) {
      // stretching to both sides: the edge under the pointer and the opposite edge, which moves the other way, can each catch a line
      const axis = (lo: boolean, hi: boolean, at: number, size: number, d: number, lines: SnapLine[]) => {
        if (!lo && !hi) return { d, line: undefined as SnapLine | undefined }
        const moving = snapEdges([hi ? at + size + d : at + d], lines, tol)
        const mirror = snapEdges([hi ? at - d : at + size - d], lines, tol)
        if (moving && (!mirror || Math.abs(moving.delta) <= Math.abs(mirror.delta))) return { d: d + moving.delta, line: moving.line }
        if (mirror) return { d: d - mirror.delta, line: mirror.line }
        return { d, line: undefined }
      }
      const cx = axis(mode.includes('w'), mode.includes('e'), orig.x, orig.w, dx, L.v)
      const cy = axis(mode.includes('n'), mode.includes('s'), orig.y, orig.h, dy, L.h)
      return { dx: cx.d, dy: cy.d, lines: [cx.line, cy.line].filter((l): l is SnapLine => !!l) }
    }
    const xs = move ? [orig.x + dx, orig.x + orig.w + dx] : [...(mode.includes('w') ? [orig.x + dx] : []), ...(mode.includes('e') ? [orig.x + orig.w + dx] : [])]
    const ys = move ? [orig.y + dy, orig.y + orig.h + dy] : [...(mode.includes('n') ? [orig.y + dy] : []), ...(mode.includes('s') ? [orig.y + orig.h + dy] : [])]
    let sx = xs.length ? snapEdges(xs, L.v, tol) : null
    let sy = ys.length ? snapEdges(ys, L.h, tol) : null
    if (move) {
      // the middle of the moved object on the middle of the page: a guide line shows it (both lines when it is right in the middle)
      const mx = snapEdges([orig.x + orig.w / 2 + dx], L.cv, tol)
      const my = snapEdges([orig.y + orig.h / 2 + dy], L.ch, tol)
      if (mx && (!sx || Math.abs(mx.delta) <= Math.abs(sx.delta))) sx = mx
      if (my && (!sy || Math.abs(my.delta) <= Math.abs(sy.delta))) sy = my
    }
    return { dx: dx + (sx?.delta ?? 0), dy: dy + (sy?.delta ?? 0), lines: [sx?.line, sy?.line].filter((l): l is SnapLine => !!l) }
  }

  /** A line's angle for the small degrees readout (InDesign shows the same thing next to its own line tool):
   *  counter-clockwise-positive from the horizontal, the common design-tool reading — the opposite sign of
   *  `angleOf`'s own screen/clockwise convention (used for object rotation) — and folded to -180…180, not 0…360. */
  const lineAngleDeg = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const deg = normalizeDeg(-angleOf(from, to))
    return deg > 180 ? deg - 360 : deg
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
    if (s0.kind === 'line') {
      // Shift/Enter locks the angle to 45° steps instead of a fixed aspect ratio, so it stays straight while stretching
      if (m.shift || enterHeld.current) {
        const step = Math.PI / 4
        const angle = Math.round(Math.atan2(dy, dx) / step) * step
        const dist = Math.hypot(dx, dy)
        dx = Math.cos(angle) * dist
        dy = Math.sin(angle) * dist
      }
      const a = m.alt || m.ctrl ? { x: s0.x - dx, y: s0.y - dy } : { x: s0.x, y: s0.y }
      const b = { x: s0.x + dx, y: s0.y + dy }
      const { x, y, w, h, flip } = boxFromEndpoints([a.x, a.y], [b.x, b.y])
      shapeBoxRef.current = { x, y, w, h }
      shapeFlipRef.current = flip
      setShapeBox({ x, y, w, h })
      setShapeFlip(flip)
      setAngleTip({ x: b.x, y: b.y, deg: lineAngleDeg(a, b) })
      return
    }
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
  const newShape = (kind: DrawKind, box: Box, frame: boolean, flip?: true): ShapeFrame => {
    const r = kind === 'rect' ? shapePrefs.rect.radius : 0
    return {
      id: newFrameId(),
      layerId: activeLayerId,
      kind,
      ...box,
      ...(kind === 'polygon' ? { sides: shapePrefs.polygon.sides } : {}),
      ...(r > 0 ? { radii: [r, r, r, r] as [number, number, number, number] } : {}),
      ...(frame ? { frame: true as const } : {}),
      ...(flip ? { flip } : {}),
      fill: null,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: drawingStrokeWidth,
      z: nextZ(frames, images, shapes),
    }
  }

  const pathShapeFromPoints = (points: WorldPathPoint[], closed: boolean, smooth: boolean, allowSingle = false, smoothFactor = 0.28, strokeCap: 'butt' | 'round' = 'round'): ShapeFrame | null => {
    const clean = points.filter((point, index) => index === 0 || point.hi || point.ho || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >= 2)
    if (clean.length < (closed ? 3 : 2) && !(allowSingle && clean.length === 1)) return null
    // a curve with handles bulges out of the box of its anchors (two anchors on a level line, with a drawn arc between them,
    // would be a box of no height), so the box takes in samples along every such segment too
    const extent: { x: number; y: number }[] = [...clean]
    for (let i = 0; i < (closed ? clean.length : clean.length - 1); i++) {
      const a = clean[i]
      const b = clean[(i + 1) % clean.length]
      if (!a.ho && !b.hi) continue
      const c1 = { x: a.x + (a.ho?.x ?? 0), y: a.y + (a.ho?.y ?? 0) }
      const c2 = { x: b.x + (b.hi?.x ?? 0), y: b.y + (b.hi?.y ?? 0) }
      for (let step = 1; step < 16; step++) {
        const t = step / 16
        const m = 1 - t
        extent.push({
          x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x,
          y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y,
        })
      }
    }
    const x = Math.min(...extent.map((point) => point.x))
    const y = Math.min(...extent.map((point) => point.y))
    const w = Math.max(MIN_FRAME_PT / 20, Math.max(...extent.map((point) => point.x)) - x)
    const h = Math.max(MIN_FRAME_PT / 20, Math.max(...extent.map((point) => point.y)) - y)
    const vertex = (point: WorldPathPoint, index: number): PathVertex => {
      const p: [number, number] = [(point.x - x) / w, (point.y - y) / h]
      if (!smooth && !point.hi && !point.ho) return p
      const previous = clean[index - 1] ?? (closed ? clean[clean.length - 1] : undefined)
      const next = clean[index + 1] ?? (closed ? clean[0] : undefined)
      const result: PathSmoothPoint = { p }
      if (point.hi) result.hi = [point.hi.x / w, point.hi.y / h]
      if (point.ho) result.ho = [point.ho.x / w, point.ho.y / h]
      if (smooth && (!point.hi || !point.ho) && (previous || next)) {
        const before = previous ?? { x: point.x - (next!.x - point.x), y: point.y - (next!.y - point.y) }
        const after = next ?? { x: point.x + (point.x - previous!.x), y: point.y + (point.y - previous!.y) }
        // Both handles lie along the line through the two neighbours, one on each side, so the curve runs smoothly
        // through the point. (Pointing each handle at its own neighbour instead put both control points of every
        // segment on the chord: the "curve" was a straight polyline, kinked at every point.) Each handle is a fraction of
        // the segment on its own side, and the fraction is capped so a strong bend cannot loop.
        const tangent = { x: after.x - before.x, y: after.y - before.y }
        const length = Math.hypot(tangent.x, tangent.y)
        if (length > 1e-6) {
          const ux = tangent.x / length
          const uy = tangent.y / length
          const k = Math.min(0.5, smoothFactor)
          const incoming = Math.hypot(point.x - before.x, point.y - before.y) * k
          const outgoing = Math.hypot(after.x - point.x, after.y - point.y) * k
          if (!point.hi) result.hi = [(-ux * incoming) / w, (-uy * incoming) / h]
          if (!point.ho) result.ho = [(ux * outgoing) / w, (uy * outgoing) / h]
        }
      }
      return result
    }
    return {
      id: newFrameId(),
      kind: 'path',
      layerId: activeLayerId,
      x,
      y,
      w,
      h,
      geom: [[clean.map(vertex)]],
      closed,
      curveMode: smooth ? 'quadratic' : undefined,
      strokeCap,
      fill: null,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: drawingStrokeWidth,
      z: nextZ(frames, images, shapes),
    }
  }

  /**
   * The pencil's stroke as a few Bezier anchors. Both sliders widen how far the curve may stray from what was drawn, so the
   * higher they are the fewer anchors it takes, and at the top of both it is a single curve: an anchor at each end, with a
   * handle each.
   */
  const fitPencilStroke = (points: WorldPathPoint[]): WorldPathPoint[] => {
    const fidelity = (pencilSettings.fidelity - 0.5) / 9.5
    const smoothness = pencilSettings.smoothness / 100
    if (fidelity >= 0.999 && smoothness >= 0.999) return fitPath(points, Infinity)
    const size = Math.max(Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)), Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)))
    return fitPath(points, (pencilSettings.fidelity * (0.5 + 1.5 * smoothness)) / zoom + size * 0.25 * (fidelity * smoothness) ** 2)
  }

  const commitFreehandPath = (points: WorldPathPoint[], closed: boolean, smooth: boolean) => {
    // a pencil stroke becomes fitted curves; a pen path keeps its own points, straight segments and sharp corners
    const fitted = !closed && smooth && points.every((point) => !point.hi && !point.ho)
    if (fitted && !points.some((point) => Math.hypot(point.x - points[0].x, point.y - points[0].y) >= 2)) return // a click, not a stroke
    const shape = fitted
      ? pathShapeFromPoints(fitPencilStroke(points), false, false, false, 0.28, pencilSettings.cap)
      : pathShapeFromPoints(points, closed, smooth, false, 0.28, 'butt')
    if (!shape) return
    onShapesChange([...shapes, shape])
    lastPencilPathId.current = shape.id
    setSelectedId(shape.id)
    setSelectedPage(ownerPage(rects, shape.x + shape.w / 2, shape.y + shape.h / 2))
  }

  const finishPen = (closed = true) => {
    commitFreehandPath(penPoints.current, closed, false)
    penPoints.current = []
    setFreehandPreview(null)
    setPenHover(null)
  }

  const finishPencil = () => {
    const target = pencilEditTarget.current
    const existing = target && shapes.find((shape) => shape.id === target.id && shape.kind === 'path')
    if (existing) {
      const ring = existing.geom?.[0]?.[0] ?? []
      const original: WorldPathPoint[] = ring.map((vertex) => {
        const point = vertexPoint(vertex)
        const hi = vertexHi(vertex)
        const ho = vertexHo(vertex)
        return {
          x: existing.x + point[0] * existing.w,
          y: existing.y + point[1] * existing.h,
          ...(hi ? { hi: { x: hi[0] * existing.w, y: hi[1] * existing.h } } : {}),
          ...(ho ? { ho: { x: ho[0] * existing.w, y: ho[1] * existing.h } } : {}),
        }
      })
      // the new stroke starts exactly on the anchor it continues from, and is fitted on its own; the join takes the stroke's handle
      const joinAt = target.mode === 'start' ? 0 : target.mode === 'end' ? original.length - 1 : target.index
      const anchor = original[joinAt]
      const stroke = [{ x: anchor.x, y: anchor.y }, ...pencilPoints.current.slice(1)]
      const extended = stroke.some((point) => Math.hypot(point.x - anchor.x, point.y - anchor.y) >= 2)
      let combined = original
      if (extended && target.mode === 'start') {
        const fitted = fitPencilStroke(stroke.reverse())
        combined = [...fitted.slice(0, -1), { ...anchor, hi: fitted[fitted.length - 1].hi }, ...original.slice(1)]
      } else if (extended) {
        const fitted = fitPencilStroke(stroke)
        combined = [...original.slice(0, joinAt), { ...anchor, ho: fitted[0].ho }, ...fitted.slice(1)]
      }
      const edited = pathShapeFromPoints(combined, false, false, false, 0.28, pencilSettings.cap)
      if (edited) {
        const next = { ...existing, x: edited.x, y: edited.y, w: edited.w, h: edited.h, geom: edited.geom, closed: false }
        onShapesChange(shapes.map((shape) => (shape.id === existing.id ? next : shape)))
        lastPencilPathId.current = existing.id
        setSelectedId(existing.id)
      }
    } else {
      commitFreehandPath(pencilPoints.current, false, true)
    }
    pencilEditTarget.current = null
    pencilPoints.current = []
    setFreehandPreview(null)
  }

  const pencilEditHit = (point: { x: number; y: number }) => {
    if (!pencilSettings.editSelected) return null
    const distanceToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy
      const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
    const limit = pencilSettings.within / zoom
    const preferred = [selectedId, lastPencilPathId.current].filter((id): id is string => !!id)
    const candidates = [...shapes.filter((shape) => shape.kind === 'path' && preferred.includes(shape.id)), ...shapes.filter((shape) => shape.kind === 'path' && !preferred.includes(shape.id))]
    let best: { id: string; index: number; mode: 'start' | 'end' | 'segment'; snap?: { x: number; y: number }; distance: number } | null = null
    for (const shape of candidates) {
      const ring = shape.geom?.[0]?.[0]
      if (!ring || ring.length === 0) continue
      const world = ring.map((vertex) => {
        const p = vertexPoint(vertex)
        return { x: shape.x + p[0] * shape.w, y: shape.y + p[1] * shape.h }
      })
      const startDistance = Math.hypot(point.x - world[0].x, point.y - world[0].y)
      const endDistance = Math.hypot(point.x - world[world.length - 1].x, point.y - world[world.length - 1].y)
      if (startDistance <= limit && (!best || startDistance < best.distance)) best = { id: shape.id, index: 0, mode: 'start', snap: world[0], distance: startDistance }
      if (endDistance <= limit && (!best || endDistance < best.distance)) best = { id: shape.id, index: world.length - 2, mode: 'end', snap: world[world.length - 1], distance: endDistance }
      for (let i = 0; i < world.length - 1; i++) {
        const distance = distanceToSegment(point, world[i], world[i + 1])
        if (distance <= limit && (!best || distance < best.distance)) best = { id: shape.id, index: i, mode: 'segment', distance }
      }
    }
    if (!best) return null
    const { distance: _distance, ...target } = best
    return target
  }

  const worldPointsOf = (shape: ShapeFrame): WorldPathPoint[] =>
    (shape.geom?.[0]?.[0] ?? []).map((vertex) => {
      const p = vertexPoint(vertex)
      return { x: shape.x + p[0] * shape.w, y: shape.y + p[1] * shape.h }
    })

  const scissorHit = (point: { x: number; y: number }) => {
    const limit = 12 / zoom
    const distanceToSegment = (a: WorldPathPoint, b: WorldPathPoint) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy
      const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0
      return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
    }
    return shapes.some((shape) => {
      if (shape.kind !== 'path') return false
      const points = worldPointsOf(shape)
      return points.some((candidate, index) => Math.hypot(point.x - candidate.x, point.y - candidate.y) <= limit || (index < points.length - 1 && distanceToSegment(candidate, points[index + 1]) <= limit))
    })
  }

  const pathWithWorldPoints = (base: ShapeFrame, points: WorldPathPoint[]): ShapeFrame | null => {
    const made = pathShapeFromPoints(points, false, true, false, 0.28, base.strokeCap === 'butt' ? 'butt' : 'round')
    return made ? { ...base, x: made.x, y: made.y, w: made.w, h: made.h, geom: made.geom, closed: false, curveMode: 'quadratic' } : null
  }

  const splitPathAt = (id: string, point: { x: number; y: number }) => {
    const shape = shapes.find((candidate) => candidate.id === id && candidate.kind === 'path')
    if (!shape) return
    const points = worldPointsOf(shape)
    if (points.length < 3) return
    const index = points.reduce((best, candidate, i) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(points[best].x - point.x, points[best].y - point.y) ? i : best, 0)
    if (index <= 0 || index >= points.length - 1) return
    const first = pathWithWorldPoints(shape, points.slice(0, index + 1))
    const second = pathWithWorldPoints(shape, points.slice(index))
    if (!first || !second) return
    onShapesChange([...shapes.filter((candidate) => candidate.id !== id), { ...first, id: newFrameId() }, { ...second, id: newFrameId() }])
    setSelectedId(null)
  }

  const eraseAt = (point: { x: number; y: number }) => {
    const limit = eraserRadius / zoom
    for (const shape of shapes) {
      if (shape.kind !== 'path' || eraserTouched.current.has(shape.id)) continue
      const points = worldPointsOf(shape)
      const close = points.some((candidate, index) => {
        if (Math.hypot(point.x - candidate.x, point.y - candidate.y) <= limit) return true
        if (index >= points.length - 1) return false
        const next = points[index + 1]
        const dx = next.x - candidate.x
        const dy = next.y - candidate.y
        const lengthSquared = dx * dx + dy * dy
        const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - candidate.x) * dx + (point.y - candidate.y) * dy) / lengthSquared)) : 0
        return Math.hypot(point.x - (candidate.x + t * dx), point.y - (candidate.y + t * dy)) <= limit
      })
      if (close) {
        const replacementIds = eraseSegmentAt(shape.id, point)
        eraserTouched.current.add(shape.id)
        replacementIds.forEach((replacementId) => eraserTouched.current.add(replacementId))
        return
      }
    }
  }

  const eraseSegmentAt = (id: string, point: { x: number; y: number }): string[] => {
    const shape = shapes.find((candidate) => candidate.id === id && candidate.kind === 'path')
    if (!shape) return []
    const points = worldPointsOf(shape)
    if (points.length < 2) return []
    let index = 0
    let nearest = Infinity
    let nearestT = 0
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy
      const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0
      const projected = { x: a.x + t * dx, y: a.y + t * dy }
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y)
      if (distance < nearest) {
        nearest = distance
        index = i
        nearestT = t
      }
    }
    const a = points[index]
    const b = points[index + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.max(1, Math.hypot(dx, dy))
    const radius = eraserRadius / zoom
    const center = { x: a.x + nearestT * dx, y: a.y + nearestT * dy }
    const cutStart = { x: center.x - (dx / length) * radius, y: center.y - (dy / length) * radius }
    const cutEnd = { x: center.x + (dx / length) * radius, y: center.y + (dy / length) * radius }
    const left = pathWithWorldPoints(shape, [...points.slice(0, index + 1), cutStart])
    const right = pathWithWorldPoints(shape, [cutEnd, ...points.slice(index + 1)])
    const replacement = [left, right].filter((part): part is ShapeFrame => !!part).map((part) => ({ ...part, id: newFrameId() }))
    onShapesChange([...shapes.filter((candidate) => candidate.id !== id), ...replacement])
    setSelectedId(null)
    return replacement.map((part) => part.id)
  }

  const joinSelectedPaths = () => {
    const ids = [...new Set([...multiSel, ...(selectedId ? [selectedId] : [])])]
    const picked = ids.map((id) => shapes.find((shape) => shape.id === id && shape.kind === 'path')).filter((shape): shape is ShapeFrame => !!shape)
    if (picked.length !== 2) return
    const [first, second] = picked
    const a = worldPointsOf(first)
    const b = worldPointsOf(second)
    if (a.length < 2 || b.length < 2) return
    const options = [
      { aa: a, bb: b },
      { aa: a, bb: [...b].reverse() },
      { aa: [...a].reverse(), bb: b },
      { aa: [...a].reverse(), bb: [...b].reverse() },
    ]
    const best = options.sort((left, right) => Math.hypot(left.aa[left.aa.length - 1].x - left.bb[0].x, left.aa[left.aa.length - 1].y - left.bb[0].y) - Math.hypot(right.aa[right.aa.length - 1].x - right.bb[0].x, right.aa[right.aa.length - 1].y - right.bb[0].y))[0]
    const merged = pathWithWorldPoints(first, [...best.aa, ...best.bb])
    if (!merged) return
    const joined = { ...merged, id: newFrameId() }
    onShapesChange([...shapes.filter((shape) => !ids.includes(shape.id)), joined])
    setSelectedId(joined.id)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j' && !isTyping(event.target)) {
        event.preventDefault()
        joinSelectedPaths()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [multiSel, selectedId, shapes])

  const previousDrawingTool = useRef(tool)
  useEffect(() => {
    if (previousDrawingTool.current === 'pen' && tool !== 'pen' && penPoints.current.length >= 2) finishPen(false)
    if (previousDrawingTool.current === 'pen' && tool !== 'pen' && penPoints.current.length < 2) {
      penPoints.current = []
      setFreehandPreview(null)
    }
    previousDrawingTool.current = tool
  }, [tool])

  useEffect(() => {
    if (tool !== 'eraser') setEraserPoint(null)
  }, [tool])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (tool !== 'eraser' || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '[' || event.key === '{' || event.key === '(' || event.code === 'BracketLeft') {
        event.preventDefault()
        setEraserRadius((value) => Math.max(1, value - 1))
      } else if (event.key === ']' || event.key === '}' || event.key === ')' || event.code === 'BracketRight') {
        event.preventDefault()
        setEraserRadius((value) => Math.min(96, value + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool])

  /** clicking a shape with the Selection or point-editing tool selects it and starts moving it (the shape tools draw a new one instead) */
  const onShapePointerDown = (id: string) => (e: ReactPointerEvent<SVGPathElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0) return
    if (layerLocked || itemLocks[id]) return
    if (layerLocked) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    if (tool === 'scissors' || tool === 'eraser') {
      e.stopPropagation()
      e.preventDefault()
      const point = toWorld(e.clientX, e.clientY)
      if (tool === 'scissors') splitPathAt(id, point)
      else {
        eraserDragging.current = true
        eraserTouched.current.clear()
        eraseAt(point)
        vpRef.current?.setPointerCapture(e.pointerId)
      }
      return
    }
    if (tool === 'color' || tool === 'gradient' || tool === 'swatches') {
      e.stopPropagation()
      e.preventDefault()
      setSelectedPage(ownerPage(rects, sh.x + sh.w / 2, sh.y + sh.h / 2))
      setSelectedId(id)
      setEditingId(null)
      return
    }
    if (tool !== 'select' && tool !== 'direct' && tool !== 'pen' && tool !== 'pencil' && tool !== 'transform') return
    if (handleMultiPointer(id, e)) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedPage(ownerPage(rects, sh.x + sh.w / 2, sh.y + sh.h / 2))
    setSelectedId(id)
    setEditingId(null)
    if (tool === 'direct') return
    beginFrameDrag(e as unknown as ReactPointerEvent<HTMLElement>, id, 'move')
  }

  /** a world point, translated into the shape's own unrotated frame (as if `rotation` were 0) — corner-rounding is
   *  worked out entirely in that frame, since `radii`/`CORNERS` are themselves unrotated; without this, dragging a
   *  rounding handle on a turned shape read the pointer's position along the wrong (pre-rotation) axes */
  const toShapeLocal = (sh: ShapeFrame, p: { x: number; y: number }) => {
    if (!sh.rotation) return p
    const c = { x: sh.x + sh.w / 2, y: sh.y + sh.h / 2 }
    const [dx, dy] = rotateVec(p.x - c.x, p.y - c.y, -sh.rotation)
    return { x: c.x + dx, y: c.y + dy }
  }
  /**
   * Grabbing a rounding handle. With "all corners together" that rounds all four. Without it: the corners picked before
   * are rounded together, or (nothing picked yet) only this one until the pointer passes over another corner's handle,
   * which picks that corner too. What is picked stays after the button is released.
   */
  const onCornerDown = (id: string) => (corner: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    e.stopPropagation()
    e.preventDefault()
    const active = activeCornersOf(id)
    const corners = roundTogether
      ? [0, 1, 2, 3]
      : active.length < 4
        ? active.includes(corner)
          ? active
          : [...active, corner]
        : [corner]
    setSelectedId(id)
    const c = CORNERS[corner]
    const p = toShapeLocal(sh, toWorld(e.clientX, e.clientY))
    const inward = ((p.x - (sh.x + c.fx * sh.w)) * c.sx + (p.y - (sh.y + c.fy * sh.h)) * c.sy) / 2
    dragSeq.current += 1
    cornerDrag.current = { id, corners, origin: corner, sweep: !roundTogether, grab: inward - fitRadii(sh.radii, sh.w, sh.h)[corner], last: p, key: `round:${dragSeq.current}` }
    setHotCorners(corners)
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /** where the rounding handle of a corner is, in the shape's own unrotated frame (world points, but only really
   *  "world" when the shape itself isn't rotated — every caller already works in that same frame via `toShapeLocal`) */
  const cornerHandleAt = (sh: ShapeFrame, k: number) => {
    const c = CORNERS[k]
    const at = fitRadii(sh.radii, sh.w, sh.h)[k] + CORNER_HANDLE_OFFSET / live.current.zoom
    return { x: sh.x + c.fx * sh.w + c.sx * at, y: sh.y + c.fy * sh.h + c.sy * at }
  }
  /** the corners whose rounding handles a world rectangle touches */
  const cornerHitsInRect = (id: string, x0: number, y0: number, x1: number, y1: number): number[] => {
    const sh = shapes.find((x) => x.id === id)
    if (!sh || sh.kind !== 'rect') return []
    const pad = 7 / live.current.zoom // a handle has some size of its own
    // the rect is in world space; the handles are worked out in the shape's own unrotated frame, so bring the rect
    // there instead (a single corner sweep is small enough that treating its own box as still axis-aligned is fine)
    const [p0, p1] = [toShapeLocal(sh, { x: x0, y: y0 }), toShapeLocal(sh, { x: x1, y: y1 })]
    const [lx, hx, ly, hy] = [Math.min(p0.x, p1.x) - pad, Math.max(p0.x, p1.x) + pad, Math.min(p0.y, p1.y) - pad, Math.max(p0.y, p1.y) + pad]
    return CORNERS.flatMap((_, k) => {
      const h = cornerHandleAt(sh, k)
      return h.x >= lx && h.x <= hx && h.y >= ly && h.y <= hy ? [k] : []
    })
  }
  const moveCorner = (d: NonNullable<typeof cornerDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const sh = shapes.find((x) => x.id === d.id)
    if (!sh) return
    const p = toShapeLocal(sh, toWorld(e.clientX, e.clientY))
    const maxR = Math.min(sh.w, sh.h) / 2
    // passing over the rounding handle of another corner while the button is held adds that corner
    // (the whole stretch the pointer went since the last move counts, so a quick sweep cannot jump over a handle)
    const reach = 14 / live.current.zoom
    CORNERS.forEach((_, k) => {
      if (!d.sweep || d.corners.includes(k)) return
      const h = cornerHandleAt(sh, k)
      const [sx, sy] = [p.x - d.last.x, p.y - d.last.y]
      const len2 = sx * sx + sy * sy
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((h.x - d.last.x) * sx + (h.y - d.last.y) * sy) / len2)) : 0
      if (Math.hypot(d.last.x + sx * t - h.x, d.last.y + sy * t - h.y) <= reach) d.corners = [...d.corners, k]
    })
    d.last = p
    setHotCorners(d.corners)
    // the radius follows the pointer's distance in from the corner that was grabbed
    const c0 = CORNERS[d.origin]
    const inward = ((p.x - (sh.x + c0.fx * sh.w)) * c0.sx + (p.y - (sh.y + c0.fy * sh.h)) * c0.sy) / 2
    const r = Math.round(Math.min(maxR, Math.max(0, inward - d.grab)) * 100) / 100
    const radii = [...(sh.radii ?? [0, 0, 0, 0])] as [number, number, number, number]
    for (const k of d.corners) radii[k] = r
    onShapesChange(shapes.map((x) => (x.id === d.id ? { ...x, radii } : x)), d.key)
  }

  /** the shape's outline right now, as a path's own geometry (one polygon, one ring): its rounding or its regular corners turn into plain points */
  const geomOf = (sh: ShapeFrame): PathGeom => (sh.kind === 'path' ? (sh.geom ?? [[[]]]) : [[editableRing(sh) ?? []]])

  /** which mirror (across the shape's vertical or horizontal middle) maps point `a` onto point `b` — see onEdgeDown's Alt */
  const mirrorAxis = (geom: PathGeom, a: number, b: number): 'v' | 'h' => {
    const p = vertexPoint(geom[0][0][a])
    const q = vertexPoint(geom[0][0][b])
    return Math.abs(q[0] - (1 - p[0])) < 0.02 && Math.abs(q[1] - p[1]) < 0.02 ? 'v' : 'h'
  }

  /**
   * Grabbing one of a shape's own points (the point-editing tool).
   * Plain click: selects just this point. Shift: adds it to / removes it from the selection. A point already part of a
   * multi-point selection: the whole group moves together. Alt: instead of moving it, pulls a new, symmetric pair of
   * curve handles out of it, turning a sharp corner into a smooth one.
   */
  const onPointDown = (id: string) => (index: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    e.stopPropagation()
    e.preventDefault()
    const now = Date.now()
    const last = lastPointDown.current
    const isDoubleClick = !!last && last.id === id && last.index === index && now - last.time < 400
    lastPointDown.current = isDoubleClick ? null : { id, index, time: now }
    if (isDoubleClick) {
      onPointDouble(id)(index)
      return
    }
    setSelectedId(id)
    const geomBase = geomOf(sh)
    const box = { x: sh.x, y: sh.y, w: sh.w, h: sh.h }
    dragSeq.current += 1
    e.currentTarget.setPointerCapture(e.pointerId)
    vpRef.current?.setPointerCapture(e.pointerId)
    if (e.altKey) {
      const v = geomBase[0][0][index]
      const geom = replaceVertex(geomBase, index, { p: vertexPoint(v), hi: [0, 0], ho: [0, 0] })
      setPointSel({ id, indices: [index] })
      pointDrag.current = { kind: 'handle', id, geom, index, which: 'ho', forceMirror: true, box, key: `curve:${dragSeq.current}` }
    } else {
      const already = pointSel?.id === id ? pointSel.indices : []
      const indices = e.shiftKey ? (already.includes(index) ? already.filter((i) => i !== index) : [...already, index]) : already.includes(index) && already.length > 1 ? already : [index]
      setPointSel(indices.length ? { id, indices } : null)
      if (indices.length === 0) return
      pointDrag.current = { kind: 'anchor', id, geom: geomBase, indices, anchor: index, box, key: `points:${dragSeq.current}` }
    }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /**
   * grabbing the middle of a shape's edge: a new point goes in right there, selected on its own, and drags from then on
   * like any other. With Alt the opposite edge (the one mirrored across the shape's vertical middle, or its horizontal
   * middle for a top / bottom edge) gets its own new point too, and it follows in parallel, mirrored — pulling in the
   * middle of one end of a rectangle pulls in the other end just the same.
   */
  const onEdgeDown = (id: string) => (edgeIndex: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    const base = geomOf(sh)
    const ring = base[0][0]
    const middleOf = (k: number): [number, number] => {
      const a = vertexPoint(ring[k])
      const b = vertexPoint(ring[(k + 1) % ring.length])
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    }
    const grabbed = middleOf(edgeIndex)
    let partnerEdge = -1
    if (e.altKey) {
      const near = (x: number, y: number) => Math.abs(x - y) < 0.02
      for (const axis of ['v', 'h'] as const) {
        partnerEdge = ring.findIndex((_, k) => {
          if (k === edgeIndex) return false
          const q = middleOf(k)
          return axis === 'v' ? near(q[0], 1 - grabbed[0]) && near(q[1], grabbed[1]) : near(q[0], grabbed[0]) && near(q[1], 1 - grabbed[1])
        })
        if (partnerEdge >= 0) break
      }
    }
    const nextRing: PathVertex[] = []
    let index = -1
    let partner = -1
    ring.forEach((v, k) => {
      nextRing.push(v)
      if (k === edgeIndex) {
        index = nextRing.length
        nextRing.push(grabbed)
      }
      if (k === partnerEdge) {
        partner = nextRing.length
        nextRing.push(middleOf(k))
      }
    })
    const geom: PathGeom = [[nextRing, ...base[0].slice(1)], ...base.slice(1)]
    dragSeq.current += 1
    setPointSel({ id, indices: [index] })
    pointDrag.current = { kind: 'anchor', id, geom, indices: [index], anchor: index, ...(partner >= 0 ? { twin: partner } : {}), box: { x: sh.x, y: sh.y, w: sh.w, h: sh.h }, key: `points:${dragSeq.current}` }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /** double click on a point: a sharp corner becomes a smooth curve point (handles a third of the way to each neighbour), or a curve point loses its handles and becomes a sharp corner again */
  const onPointDouble = (id: string) => (index: number) => {
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    const geomBase = geomOf(sh)
    const ring = geomBase[0][0]
    const v = ring[index]
    const nv: PathVertex = vertexHi(v) || vertexHo(v)
      ? vertexPoint(v)
      : (() => {
          const p = vertexPoint(v)
          const prev = vertexPoint(ring[(index - 1 + ring.length) % ring.length])
          const next = vertexPoint(ring[(index + 1) % ring.length])
          const smooth: PathSmoothPoint = { p, hi: [(prev[0] - p[0]) / 3, (prev[1] - p[1]) / 3], ho: [(next[0] - p[0]) / 3, (next[1] - p[1]) / 3] }
          return smooth
        })()
    const geom = replaceVertex(geomBase, index, nv)
    onShapesChange(shapes.map((x) => (x.id === id ? { ...x, kind: 'path', geom, sides: undefined, radii: undefined } : x)), `curve-toggle:${id}:${index}`)
  }
  /** grabbing one of a point's own curve handles: it reshapes the curve on that side */
  const onHandleGrab = (id: string) => (index: number, which: 'hi' | 'ho', e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    setPointSel({ id, indices: [index] })
    dragSeq.current += 1
    const vertex = geomOf(sh)[0][0][index]
    pointDrag.current = { kind: 'handle', id, geom: geomOf(sh), index, which, forceMirror: !vertexHi(vertex) && !vertexHo(vertex), box: { x: sh.x, y: sh.y, w: sh.w, h: sh.h }, key: `handle:${dragSeq.current}` }
    e.currentTarget.setPointerCapture(e.pointerId)
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /** one or more of a shape's own points follow the pointer as one rigid group (snapped like anything else, by the point actually grabbed); the box grows or shrinks to keep holding every point (its curve handles keep their own length), and the rest of the outline rides along with it */
  const moveAnchors = (d: Extract<NonNullable<typeof pointDrag.current>, { kind: 'anchor' }>, e: ReactPointerEvent<HTMLDivElement>) => {
    const snapped = snapPoint(toWorld(e.clientX, e.clientY), e.ctrlKey || e.metaKey)
    setSnapShown(snapped.lines)
    const anchorFrac = vertexPoint(d.geom[0][0][d.anchor])
    const anchorWorld = { x: d.box.x + anchorFrac[0] * d.box.w, y: d.box.y + anchorFrac[1] * d.box.h }
    const dx = snapped.p.x - anchorWorld.x
    const dy = snapped.p.y - anchorWorld.y
    const sel = new Set(d.indices)
    // an Alt-grabbed edge: the point made on the opposite edge follows by the mirrored amount
    const twins = new Map<number, { dx: number; dy: number }>()
    if (d.twin !== undefined && !sel.has(d.twin)) twins.set(d.twin, mirrorAxis(d.geom, d.anchor, d.twin) === 'v' ? { dx: -dx, dy } : { dx, dy: -dy })
    const world = d.geom.map((poly, pi) =>
      poly.map((ring, ri) =>
        ring.map((v, vi) => {
          const p = vertexPoint(v)
          const at = { x: d.box.x + p[0] * d.box.w, y: d.box.y + p[1] * d.box.h }
          if (pi !== 0 || ri !== 0) return at
          if (sel.has(vi)) return { x: at.x + dx, y: at.y + dy }
          const twin = twins.get(vi)
          return twin ? { x: at.x + twin.dx, y: at.y + twin.dy } : at
        }),
      ),
    )
    const flat = world.flat(2)
    const nx = Math.min(...flat.map((p) => p.x))
    const ny = Math.min(...flat.map((p) => p.y))
    const nw = Math.max(MIN_FRAME_PT / 20, Math.max(...flat.map((p) => p.x)) - nx)
    const nh = Math.max(MIN_FRAME_PT / 20, Math.max(...flat.map((p) => p.y)) - ny)
    // a handle offset keeps the same actual length: measured in the old box, put back in the new one
    const rescale = (hd: [number, number] | undefined): [number, number] | undefined => (hd ? [(hd[0] * d.box.w) / nw, (hd[1] * d.box.h) / nh] : undefined)
    const geom: PathGeom = d.geom.map((poly, pi) =>
      poly.map((ring, ri) =>
        ring.map((v, vi) => {
          const at = world[pi][ri][vi]
          const p: [number, number] = [(at.x - nx) / nw, (at.y - ny) / nh]
          const hi = rescale(vertexHi(v))
          const ho = rescale(vertexHo(v))
          return hi || ho ? { p, hi, ho } : p
        }),
      ),
    )
    onShapesChange(shapes.map((sh) => (sh.id === d.id ? { ...sh, kind: 'path', x: nx, y: ny, w: nw, h: nh, geom, sides: undefined, radii: undefined } : sh)), d.key)
  }
  /**
   * One of a point's own curve handles follows the pointer. On a smooth point (both sides already have a handle, or this
   * is the symmetric pair just being pulled out of a corner) the other side mirrors it — same angle, its own length —
   * unless Alt is held, which lets the two sides point anywhere, independently.
   */
  const moveHandle = (d: Extract<NonNullable<typeof pointDrag.current>, { kind: 'handle' }>, e: ReactPointerEvent<HTMLDivElement>) => {
    const snapped = snapPoint(toWorld(e.clientX, e.clientY), e.ctrlKey || e.metaKey)
    setSnapShown(snapped.lines)
    const v = d.geom[0][0][d.index]
    const anchorFrac = vertexPoint(v)
    const anchorWorld = { x: d.box.x + anchorFrac[0] * d.box.w, y: d.box.y + anchorFrac[1] * d.box.h }
    // the mirror keeps its angle and length in WORLD units, where a straight visual mirror is a straight numeric one too
    // (a handle's fraction units are stretched by the box's own aspect ratio, so mirroring in that space would not look straight
    // on a shape that is not square)
    const offsetWorld: [number, number] = [snapped.p.x - anchorWorld.x, snapped.p.y - anchorWorld.y]
    const otherFrac = d.which === 'hi' ? vertexHo(v) : vertexHi(v)
    const otherWorld: [number, number] | undefined = otherFrac ? [otherFrac[0] * d.box.w, otherFrac[1] * d.box.h] : undefined
    const mirror = d.forceMirror || !e.altKey
    const olen = Math.hypot(offsetWorld[0], offsetWorld[1])
    // a fresh symmetric pair (still both zero-length): the other side grows to match this one, not its own (zero) length
    const mirrorLen = d.forceMirror ? olen : otherWorld ? Math.hypot(otherWorld[0], otherWorld[1]) : 0
    const mirroredWorld: [number, number] | undefined = mirror && olen > 1e-6
      ? otherWorld
        ? [(-offsetWorld[0] / olen) * mirrorLen, (-offsetWorld[1] / olen) * mirrorLen]
        : [-offsetWorld[0], -offsetWorld[1]]
      : otherWorld
    const toFrac = (w: [number, number]): [number, number] => [w[0] / d.box.w, w[1] / d.box.h]
    const offset = toFrac(offsetWorld)
    const mirrored = mirroredWorld && toFrac(mirroredWorld)
    const nv: PathSmoothPoint = { p: anchorFrac, hi: d.which === 'hi' ? offset : mirrored, ho: d.which === 'ho' ? offset : mirrored }
    const geom = replaceVertex(d.geom, d.index, nv)
    onShapesChange(shapes.map((sh) => (sh.id === d.id ? { ...sh, kind: 'path', geom, sides: undefined, radii: undefined } : sh)), d.key)
  }
  const movePoint = (d: NonNullable<typeof pointDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => (d.kind === 'handle' ? moveHandle(d, e) : moveAnchors(d, e))

  /** grabbing the round handle at the middle of a shape's picture: it pans within the frame, which stays put */
  const onContentGrab = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    const asset = sh?.image && assets[sh.image.assetId]
    if (!sh || !asset) return
    e.stopPropagation()
    e.preventDefault()
    contentDrag.current = { kind: 'move', id, start: toWorld(e.clientX, e.clientY), origBox: imageGeometry(sh, asset) }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /** grabbing one of the picture's own corners: it resizes on its own, keeping its natural proportions */
  const onContentResize = (id: string) => (corner: 'nw' | 'ne' | 'se' | 'sw', e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    const asset = sh?.image && assets[sh.image.assetId]
    if (!sh || !asset) return
    e.stopPropagation()
    e.preventDefault()
    contentDrag.current = { kind: 'resize', id, corner, start: toWorld(e.clientX, e.clientY), origBox: imageGeometry(sh, asset), ratio: asset.width / asset.height }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const moveContent = (d: NonNullable<typeof contentDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const p = toWorld(e.clientX, e.clientY)
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    const sh = shapes.find((x) => x.id === d.id)
    if (!sh?.image) return
    if (d.kind === 'move') {
      onShapesChange(shapes.map((x) => (x.id === d.id ? { ...x, image: { ...x.image!, offset: { x: d.origBox.x + dx, y: d.origBox.y + dy } } } : x)), `content:${d.id}`)
      return
    }
    const box = dragBox(d.origBox, d.corner, dx, dy, 8, d.ratio)
    const asset = assets[sh.image.assetId]
    const scale = asset ? box.w / asset.width : (sh.image.scale ?? 1)
    onShapesChange(shapes.map((x) => (x.id === d.id ? { ...x, image: { ...x.image!, offset: { x: box.x, y: box.y }, scale } } : x)), `content:${d.id}`)
  }

  /** grabbing one of a line's two endpoint handles: it moves on its own, the other end staying put */
  const onLineEndDown = (id: string) => (which: 0 | 1, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh || sh.kind !== 'line') return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    const ends = lineEndpoints(sh)
    const fixed = ends[which === 0 ? 1 : 0]
    const moving = ends[which]
    lineEndDrag.current = { id, fixed: { x: fixed[0], y: fixed[1] } }
    // reuses the same rotate-guide overlay as onRotateDown (w/h = 0: no ghost box for a line, just the wedge —
    // its "centre" is the fixed end, its "starting rotation" is the line's own angle before this drag)
    setRotatePreview({ cx: fixed[0], cy: fixed[1], w: 0, h: 0, startRotation: angleOf({ x: fixed[0], y: fixed[1] }, { x: moving[0], y: moving[1] }), sweep: 0 })
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const moveLineEnd = (d: NonNullable<typeof lineEndDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const snapped = snapPoint(toWorld(e.clientX, e.clientY), e.ctrlKey || e.metaKey)
    setSnapShown(snapped.lines)
    let p = snapped.p
    if (e.shiftKey) {
      const dx = p.x - d.fixed.x
      const dy = p.y - d.fixed.y
      const step = Math.PI / 4
      const angle = Math.round(Math.atan2(dy, dx) / step) * step
      const dist = Math.hypot(dx, dy)
      p = { x: d.fixed.x + Math.cos(angle) * dist, y: d.fixed.y + Math.sin(angle) * dist }
    }
    setRotatePreview((prev) => (prev ? { ...prev, sweep: normalizeDeg(angleOf(d.fixed, p) - prev.startRotation) } : prev))
    const box = boxFromEndpoints([d.fixed.x, d.fixed.y], [p.x, p.y])
    onShapesChange(shapes.map((x) => (x.id === d.id ? { ...x, x: box.x, y: box.y, w: box.w, h: box.h, flip: box.flip } : x)), `lineend:${d.id}`)
    setAngleTip({ x: p.x, y: p.y, deg: lineAngleDeg(d.fixed, p) })
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
  const beginGroupResize = (mode: HandleId, e: ReactPointerEvent<HTMLDivElement>) => {
    if (!groupSelection || e.button !== 0 || panMode) return
    e.stopPropagation()
    e.preventDefault()
    dragSeq.current += 1
    groupResize.current = {
      mode,
      start: toWorld(e.clientX, e.clientY),
      box: { ...groupSelection.box },
      objects: groupSelection.objects.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h })),
      key: `group-resize:${dragSeq.current}`,
    }
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  const moveGroupResize = (d: NonNullable<typeof groupResize.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const p = toWorld(e.clientX, e.clientY)
    const raw = { x: p.x - d.start.x, y: p.y - d.start.y }
    const next = dragBox(d.box, d.mode, raw.x, raw.y, MIN_FRAME_PT, e.shiftKey ? d.box.w / d.box.h : undefined)
    const sx = next.w / d.box.w
    const sy = next.h / d.box.h
    const update = <T extends { id: string; x: number; y: number; w: number; h: number }>(list: T[]) =>
      list.map((o) => {
        const original = d.objects.find((x) => x.id === o.id)
        if (!original) return o
        return {
          ...o,
          x: next.x + (original.x - d.box.x) * sx,
          y: next.y + (original.y - d.box.y) * sy,
          w: Math.max(MIN_FRAME_PT, original.w * sx),
          h: Math.max(MIN_FRAME_PT, original.h * sy),
        }
      })
    onFramesChange(update(frames), d.key)
    onImagesChange(update(images), d.key)
    onShapesChange(update(shapes), d.key)
  }

  /** grabbing the ring around one of an object's corners: it turns around its own centre from then on (any corner starts
   * the same way — the turning angle always follows the pointer from wherever it grabbed) */
  const onRotateDown = (id: string) => (_corner: RotateCorner, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(id)
    const isImage = images.some((x) => x.id === id)
    const isShape = shapes.some((x) => x.id === id)
    const f = isImage ? images.find((x) => x.id === id) : isShape ? shapes.find((x) => x.id === id) : frames.find((x) => x.id === id)
    if (!f) return
    const center = { x: f.x + f.w / 2, y: f.y + f.h / 2 }
    const grabbed = toWorld(e.clientX, e.clientY)
    dragSeq.current += 1
    rotateDrag.current = {
      id,
      kind: isImage ? 'image' : isShape ? 'shape' : 'frame',
      center,
      startAngle: angleOf(center, grabbed),
      startRotation: f.rotation ?? 0,
      key: `rotate:${dragSeq.current}`,
    }
    setRotatePreview({ cx: center.x, cy: center.y, w: f.w, h: f.h, startRotation: f.rotation ?? 0, sweep: 0 })
    setAngleTip({ x: grabbed.x, y: grabbed.y, deg: 0 })
    vpRef.current!.setPointerCapture(e.pointerId)
  }
  /** the object follows the pointer around its own centre; Shift holds it to 45° steps */
  const moveRotate = (d: NonNullable<typeof rotateDrag.current>, e: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = toWorld(e.clientX, e.clientY)
    const angle = angleOf(d.center, pointer)
    let rotation = d.startRotation + (angle - d.startAngle)
    if (e.shiftKey) rotation = Math.round(rotation / 45) * 45
    rotation = normalizeDeg(rotation)
    const sweep = normalizeDeg(rotation - d.startRotation)
    setRotatePreview((p) => (p ? { ...p, sweep } : p))
    setAngleTip({ x: pointer.x, y: pointer.y, deg: sweep > 180 ? sweep - 360 : sweep })
    const patch = { rotation: rotation || undefined }
    if (d.kind === 'shape') onShapesChange(shapes.map((sh) => (sh.id === d.id ? { ...sh, ...patch } : sh)), d.key)
    else if (d.kind === 'image') onImagesChange(images.map((im) => (im.id === d.id ? { ...im, ...patch } : im)), d.key)
    else updateFrame(d.id, patch, d.key)
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
    const swapped = isFacing(doc) && side === 'left'
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
    if (e.target === e.currentTarget && tool !== 'pen' && tool !== 'pencil') return // scrollbars
    if (layerLocked && !panMode && tool !== 'zoom') return
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
    } else if (tool === 'pen' && e.button === 0) {
      const point = toWorld(e.clientX, e.clientY)
      const first = penPoints.current[0]
      if (first && penPoints.current.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= 10 / zoom) {
        finishPen()
        e.preventDefault()
        return
      }
      // a click makes a plain corner point (a straight line to the previous one); only dragging on it pulls handles out
      penPoints.current = [...penPoints.current, { x: point.x, y: point.y }]
      penDrag.current = { index: penPoints.current.length - 1, start: point, mode: 'new', moved: false }
      setPenDragging(true)
      setPenHover(null)
      setFreehandPreview({ points: penPoints.current, closed: false })
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'pencil' && e.button === 0) {
      const point = toWorld(e.clientX, e.clientY)
      const target = e.ctrlKey || e.metaKey ? pencilEditHit(point) : null
      pencilEditTarget.current = target
      pencilPoints.current = [target?.snap ?? point]
      setFreehandPreview({ points: pencilPoints.current, closed: false })
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'eraser' && e.button === 0) {
      eraserDragging.current = true
      eraserTouched.current.clear()
      eraseAt(toWorld(e.clientX, e.clientY))
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
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
    } else if (tool === 'pathtype' && e.button === 0) {
      const hit = nearestOutline(toWorld(e.clientX, e.clientY))
      if (hit) {
        e.preventDefault()
        startPathText(hit)
      } else {
        setSelectedId(null)
        setPathEdit(null)
      }
    } else if ((tool === 'rect' || tool === 'ellipse' || tool === 'polygon' || tool === 'line' || FRAME_TOOL_KIND[tool]) && e.button === 0) {
      const frameKind = FRAME_TOOL_KIND[tool]
      const p = snapPoint(toWorld(e.clientX, e.clientY), false).p
      shapeStart.current = { kind: frameKind ?? (tool as DrawKind), x: p.x, y: p.y, frame: !!frameKind }
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
      const near = selectedId ? shapes.find((x) => x.id === selectedId) : undefined
      cornerMarquee.current = !additive && !roundTogether && !previewMode && near?.kind === 'rect' && Math.min(near.w, near.h) * zoom >= MIN_CORNER_HANDLES ? { id: near.id, picking: false } : null
      setSelectedId(null)
      if (!additive) {
        setGuideSel([])
        setMultiSel([])
      } else if (before.length > 0) setMultiSel(before)
      const p = toWorld(e.clientX, e.clientY)
      marqueeBase.current = { guides: additive ? guideSel : [], objects: additive ? before : [] }
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'direct' && e.button === 0) {
      // the point-editing tool only ever has one shape open at a time; clicking empty canvas closes it
      setSelectedId(null)
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pegDrag.current) {
      movePeg(pegDrag.current, e)
      return
    }
    if (tool === 'pathtype') {
      // over an outline the cursor says that text can be typed there
      const over = !!nearestOutline(toWorld(e.clientX, e.clientY))
      setPathHover((cur) => (cur === over ? cur : over))
    }
    if (tool === 'scissors') setScissorHover(scissorHit(toWorld(e.clientX, e.clientY)))
    else if (scissorHover) setScissorHover(false)
    if (tool === 'eraser') setEraserPoint(toWorld(e.clientX, e.clientY))
    else if (eraserPoint) setEraserPoint(null)
    if (tool === 'eraser' && eraserDragging.current && e.buttons !== 0) {
      eraseAt(toWorld(e.clientX, e.clientY))
      return
    }
    if (tool === 'pen' && !penDrag.current) {
      if (penPoints.current.length > 0) setPenHover(toWorld(e.clientX, e.clientY))
    } else if (penHover) setPenHover(null)
    if (penDrag.current) {
      const d = penDrag.current
      const point = toWorld(e.clientX, e.clientY)
      const anchor = penPoints.current[d.index]
      if (anchor) {
        const dx = point.x - d.start.x
        const dy = point.y - d.start.y
        if (!d.moved && Math.hypot(dx, dy) * zoom < 3) return // still a click
        d.moved = true
        if (d.mode === 'move' && d.origin) {
          anchor.x = d.origin.x + dx
          anchor.y = d.origin.y + dy
        } else if (d.mode === 'handle' && d.which) {
          const handle = { x: point.x - anchor.x, y: point.y - anchor.y }
          const opposite = { x: -handle.x, y: -handle.y }
          if (d.which === 'ho') {
            anchor.ho = handle
            if (!e.altKey) anchor.hi = opposite
          } else {
            anchor.hi = handle
            if (!e.altKey) anchor.ho = opposite
          }
        } else {
          anchor.ho = { x: dx, y: dy }
          anchor.hi = { x: -dx, y: -dy }
        }
        setFreehandPreview({ points: penPoints.current, closed: false })
      }
      return
    }
    if (pencilPoints.current.length > 0) {
      const point = toWorld(e.clientX, e.clientY)
      const last = pencilPoints.current[pencilPoints.current.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) >= pencilSettings.fidelity / zoom) {
        pencilPoints.current = [...pencilPoints.current, point]
        setFreehandPreview({ points: pencilPoints.current, closed: false })
      }
      return
    }
    if (shapeStart.current) {
      updateShapeDraft(e.clientX, e.clientY, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey })
      return
    }
    if (lineEndDrag.current) {
      moveLineEnd(lineEndDrag.current, e)
      return
    }
    if (cornerDrag.current) {
      moveCorner(cornerDrag.current, e)
      return
    }
    if (pointDrag.current) {
      if (e.buttons === 0) {
        pointDrag.current = null
        return
      }
      movePoint(pointDrag.current, e)
      return
    }
    if (contentDrag.current) {
      moveContent(contentDrag.current, e)
      return
    }
    if (groupResize.current) {
      moveGroupResize(groupResize.current, e)
      return
    }
    if (groupDrag.current) {
      const d = groupDrag.current
      const p = toWorld(e.clientX, e.clientY)
      offsetObjects(d.origins, p.x - d.start.x, p.y - d.start.y, d.key)
      return
    }
    if (cornerMarquee.current && marquee) {
      const cm = cornerMarquee.current
      const p = toWorld(e.clientX, e.clientY)
      const hits = cornerHitsInRect(cm.id, marquee.x0, marquee.y0, p.x, p.y)
      if (hits.length > 0 || cm.picking) {
        // the band is over the rounding handles: it picks those corners, and the shape stays the selected object
        cm.picking = true
        setMarquee({ ...marquee, x1: p.x, y1: p.y })
        if (selectedId !== cm.id) {
          keepPick.current = cm.id
          setSelectedIdRaw(cm.id)
        }
        setMultiSel([])
        setGuideSel([])
        setCornerPick(hits.length > 0 && hits.length < 4 ? { id: cm.id, corners: hits } : null)
        return
      }
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
    if (rotateDrag.current) {
      if (e.buttons === 0) {
        rotateDrag.current = null
        setRotatePreview(null)
        return
      }
      moveRotate(rotateDrag.current, e)
      return
    }
    if (frameDrag.current) {
      if (e.buttons === 0) {
        frameDrag.current = null
        setSpacingShown((cur) => (cur.length ? [] : cur))
        return
      }
      const d = frameDrag.current
      const p = toWorld(e.clientX, e.clientY)
      const raw = { x: p.x - d.start.x, y: p.y - d.start.y }
      const resizeRaw = raw
      const free = !(e.ctrlKey || e.metaKey)
      // the other objects on the page the dragged one is over
      const page = ownerPage(rects, d.orig.x + raw.x + d.orig.w / 2, d.orig.y + raw.y + d.orig.h / 2)
      const near = [...frames, ...images, ...shapes].filter((o) => o.id !== d.id && ownerPage(rects, o.x + o.w / 2, o.y + o.h / 2) === page)
      // the edges that move are held on the margins, column edges, page edges, guides and the edges and middles of the other objects (Ctrl = free)
      // Alt stretches to both sides at once, around the middle
      const snapped = free ? snapDrag(d.orig, d.mode, resizeRaw.x, resizeRaw.y, e.altKey, objectLines(near)) : null
      let dx = snapped ? snapped.dx : resizeRaw.x
      let dy = snapped ? snapped.dy : resizeRaw.y
      if (d.mode === 'move') {
        // the gaps to the neighbours: shown as numbers, and held equal to another gap when close to one (not where a line already holds the object)
        const box = { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }
        const sp = spacing(box, near, SNAP_PX / live.current.zoom, { x: free && dx === raw.x, y: free && dy === raw.y })
        dx += sp.dx
        dy += sp.dy
        setSpacingShown(sp.marks)
      } else setSpacingShown((cur) => (cur.length ? [] : cur))
      // the lines that hold the object; one along other objects runs across them and the dragged object, to show they are in line
      const now = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT)
      setSnapShown((cur) => {
        if (!snapped || snapped.lines.length === 0) return cur.length ? [] : cur
        return snapped.lines.map((l) => (l.kind !== 'object' ? l : l.axis === 'v' ? { ...l, from: Math.min(l.from, now.y), to: Math.max(l.to, now.y + now.h) } : { ...l, from: Math.min(l.from, now.x), to: Math.max(l.to, now.x + now.w) }))
      })
      if (d.kind === 'shape') {
        // Shift keeps the shape's proportions
        const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, e.shiftKey ? d.orig.w / d.orig.h : undefined, e.altKey)
        if (d.mode === 'move') learnRepeatOffset(d.id, box)
        onShapesChange(shapes.map((sh) => (sh.id === d.id ? { ...sh, ...box } : sh)), d.key)
        return
      }
      if (d.kind === 'image') {
        // corners keep the picture's proportions unless Shift is held
        const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, e.shiftKey ? undefined : d.orig.w / d.orig.h, e.altKey)
        if (d.mode === 'move') learnRepeatOffset(d.id, box)
        onImagesChange(images.map((im) => (im.id === d.id ? { ...im, ...box } : im)), d.key)
        return
      }
      const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, undefined, e.altKey)
      if (d.mode === 'move') learnRepeatOffset(d.id, box)
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
      const d = cornerDrag.current
      cornerDrag.current = null
      setHotCorners([])
      // without "all corners together" the corners that took part are what stays picked
      if (!roundTogether) setCornerPick(d.corners.length < 4 ? { id: d.id, corners: [...d.corners].sort() } : null)
    }
    if (!s0) return
    const box = shapeBoxRef.current
    const flip = shapeFlipRef.current
    shapeStart.current = null
    shapeBoxRef.current = null
    shapeFlipRef.current = undefined
    setShapeBox(null)
    setShapeFlip(undefined)
    setAngleTip(null)
    // a line only needs its LENGTH to be big enough (one side is often 0 — a horizontal or vertical line); every
    // other shape needs both sides big enough. A click without a real drag makes nothing — it used to drop a
    // default-size shape centered on the click point, but that meant an ordinary click anywhere on the canvas
    // (not meant as a draw gesture at all) would silently create a shape, and repeated clicks kept stacking more
    const bigEnough = box && (s0.kind === 'line' ? Math.hypot(box.w, box.h) >= MIN_FRAME_PT : box.w >= MIN_FRAME_PT && box.h >= MIN_FRAME_PT)
    if (!bigEnough) return
    const shape = newShape(s0.kind, box!, s0.frame, flip)
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
          layerId: activeLayerId,
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
    eraserDragging.current = false
    eraserTouched.current.clear()
    if (eraserPoint) setEraserPoint(null)
    pegDrag.current = null
    const penGesture = penDrag.current
    if (penGesture?.mode === 'handles' && !penGesture.moved) {
      // a plain Alt click on a smooth point turns it back into a corner
      const anchor = penPoints.current[penGesture.index]
      if (anchor && (anchor.hi || anchor.ho)) {
        delete anchor.hi
        delete anchor.ho
        setFreehandPreview({ points: penPoints.current, closed: false })
      }
    }
    penDrag.current = null
    setPenDragging(false)
    if (pencilPoints.current.length > 0) finishPencil()
    finishShape()
    finishDraft()
    setSnapShown((cur) => (cur.length ? [] : cur))
    setSpacingShown((cur) => (cur.length ? [] : cur))
    if (frameDrag.current?.mode === 'move') learnRepeatOffset()
    groupResize.current = null
    // a rubber band that caught a single object leaves it selected the ordinary way (with its panel and handles)
    if (marqueeBase.current && multiSel.length === 1 && guideSel.length === 0) {
      setSelectedIdRaw(multiSel[0])
      setMultiSel([])
    }
    groupDrag.current = null
    pointDrag.current = null
    contentDrag.current = null
    lineEndDrag.current = null
    setAngleTip(null)
    frameDrag.current = null
    rotateDrag.current = null
    setRotatePreview(null)
    pageDrag.current = null
    setPageSnap(null)
    marginDrag.current = null
    marqueeBase.current = null
    cornerMarquee.current = null
    setMarquee(null)
    drag.current = null
    setPanning(false)
  }
  const cancelDrag = () => {
    eraserDragging.current = false
    eraserTouched.current.clear()
    setEraserPoint(null)
    pegDrag.current = null
    penDrag.current = null
    setPenDragging(false)
    penPoints.current = []
    setPenHover(null)
    pencilPoints.current = []
    pencilEditTarget.current = null
    setFreehandPreview(null)
    setSnapShown((cur) => (cur.length ? [] : cur))
    setSpacingShown((cur) => (cur.length ? [] : cur))
    shapeStart.current = null
    shapeBoxRef.current = null
    shapeFlipRef.current = undefined
    setShapeBox(null)
    setShapeFlip(undefined)
    lineEndDrag.current = null
    setAngleTip(null)
    groupDrag.current = null
    cornerDrag.current = null
    setHotCorners([])
    pointDrag.current = null
    contentDrag.current = null
    createStart.current = null
    frameDrag.current = null
    groupResize.current = null
    rotateDrag.current = null
    setRotatePreview(null)
    pageDrag.current = null
    setPageSnap(null)
    marginDrag.current = null
    marqueeBase.current = null
    cornerMarquee.current = null
    setMarquee(null)
    setDraft(null)
    drag.current = null
    setPanning(false)
  }

  /** clicking a frame: Type tool edits its text, Selection tool selects it and starts moving it */
  const onFramePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode) return // let the pan handler see it
    if (layerLocked || itemLocks[id]) return
    if (layerLocked) return
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
    if (tool === 'eyedropper') {
      e.stopPropagation()
      e.preventDefault()
      if (sampledTextStyle) {
        applyCharStyle(id, sampledTextStyle)
        setSampledTextStyle(null)
        setTool('select')
      } else {
        sampleTextStyle(id)
      }
      return
    }
    if (tool !== 'type' && tool !== 'select' && tool !== 'transform' && tool !== 'direct') return
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
  const inViewY = (y: number, h: number) => {
    const y0 = ty + y * zoom
    return y0 + h * zoom >= scroll.y - 300 && y0 <= scroll.y + vp.h + 300
  }
  const visible = spreads.filter((s) => inViewY(s.y, s.h))
  // text frames, pictures and shapes are virtualized the same way, EXCEPT whatever is actively selected/edited/
  // linked-from — an import of a 100-page Word file otherwise creates 100+ live components that all re-render on
  // every keystroke, even though at most a couple of pages are ever on screen at once
  const alwaysMounted = new Set([selectedId, editingId, linkFrom, pathEdit, ...multiSel].filter((id): id is string => !!id))
  const visibleFrames = layerVisible ? frames.filter((f) => itemVisibility[f.id] !== false && (alwaysMounted.has(f.id) || inViewY(f.y, f.h))) : []
  const visibleImages = layerVisible ? images.filter((im) => itemVisibility[im.id] !== false && (alwaysMounted.has(im.id) || inViewY(im.y, im.h))) : []
  const visibleShapes = layerVisible ? shapes.filter((sh) => itemVisibility[sh.id] !== false && (alwaysMounted.has(sh.id) || inViewY(sh.y, sh.h))) : []

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
              : tool === 'pen'
                ? ' pentool'
                : tool === 'pencil'
                  ? ' penciltool'
                : tool === 'scissors'
                  ? ' scissorstool'
                  : tool === 'eraser'
                    ? ' erasertool'
              : tool === 'eyedropper'
                ? ' eyedropper'
              : tool === 'rect' || tool === 'ellipse' || tool === 'polygon' || FRAME_TOOL_KIND[tool]
                ? ' shapetool'
                : tool === 'line'
                  ? ' linetool'
                : tool === 'pathtype'
                  ? ' pathtool' + (pathHover ? ' overpath' : '')
            : tool === 'type'
              ? ' texttool'
              : tool === 'direct'
                ? ' directtool'
                : tool === 'transform'
                  ? ' transformtool'
              : tool === 'select'
                ? ' selecttool'
                : '') + (penDragging ? ' pen-dragging' : '') + (scissorHover ? ' scissors-target' : '')

  // ── selection info for the properties panel and the thread lines ────────────────
  const selFrame = selectedId ? (frames.find((f) => f.id === selectedId) ?? null) : null
  const selImage = selectedId ? (images.find((im) => im.id === selectedId) ?? null) : null
  const selShape = selectedId ? (shapes.find((sh) => sh.id === selectedId) ?? null) : null
  const colorTool = tool === 'color' || tool === 'gradient' || tool === 'swatches' ? tool : null
  /** what the text-on-outline controls show: the style of the selected text, else the text's own */
  const pathStyleShown = (sh: ShapeFrame): CharStyle => {
    const pt = sh.pathText!
    return pathSel && pathSel.id === sh.id && pathSel.a !== pathSel.b && pathSel.b <= pt.text.length ? styleAtChar(normalizeRuns(pt.text, pt.runs, pt.style), pathSel.a, pt.style) : pt.style
  }
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
  // a caret with nothing selected while editing: the panel shows the text at the caret - the character before it, as typing
  // there would carry on that look (at the start of a paragraph, the one after it)
  const textEditing = !!editingId && selChain.some((f) => f.id === editingId)
  const panelCaret =
    panelHead && !panelSel && textEditing && textSel && textSel.headId === panelHead.id && textSel.a === textSel.b && textSel.a <= panelHead.text.length
      ? textSel
      : null
  // the Paragraph panel: indents/leading/etc. are always the whole story's own settings (never selection-scoped);
  // spaceBefore/spaceAfter show the FIRST paragraph the selection touches (own override if it has one, else the
  // story's own default) when there is a selection, since that is what applyParaSpacing would actually change
  // leading, indents and alignment can now differ paragraph by paragraph (a paragraph style, or a change made while
  // some text / a frame is selected is stored as a per-paragraph patch), so the fields show the first paragraph in
  // scope — otherwise a value just typed would snap back to the story's own the moment it was applied
  const scopeFlow = selFrame ? flow.get(selFrame.id) : undefined
  const scopeParagraph = panelHead
    ? panelSel
      ? paragraphsInRange(panelHead.text, panelSel.a, panelSel.b)[0]
      : scopeFlow
        ? paragraphsInRange(panelHead.text, scopeFlow.start, Math.max(scopeFlow.start + 1, scopeFlow.end))[0]
        : 0
    : 0
  const scopePatch = panelHead?.paragraphStylePatches?.[scopeParagraph ?? 0]
  const paragraphStyle: TextStyle | null = panelHead
    ? {
        ...styleOf(panelHead),
        ...(scopePatch?.leading !== undefined ? { leading: scopePatch.leading } : {}),
        ...(scopePatch?.indentLeft !== undefined ? { indentLeft: scopePatch.indentLeft } : {}),
        ...(scopePatch?.indentRight !== undefined ? { indentRight: scopePatch.indentRight } : {}),
        ...(scopePatch?.firstLineIndent !== undefined ? { firstLineIndent: scopePatch.firstLineIndent } : {}),
        ...(scopePatch?.align !== undefined ? { align: scopePatch.align } : {}),
        ...(panelSel
          ? {
              spaceBefore: panelHead.paraSpaceBefore?.[paragraphsInRange(panelHead.text, panelSel.a, panelSel.b)[0]] ?? panelHead.spaceBefore,
              spaceAfter: panelHead.paraSpaceAfter?.[paragraphsInRange(panelHead.text, panelSel.a, panelSel.b)[0]] ?? panelHead.spaceAfter,
            }
          : {}),
      }
    : null
  const panelStyle: TextStyle | null = panelHead
    ? {
        ...(panelSel
          ? styleAtChar(normalizeRuns(panelHead.text, panelHead.runs, panelHead), panelSel.a, panelHead)
          : panelCaret
            ? styleAtChar(normalizeRuns(panelHead.text, panelHead.runs, panelHead), panelCaret.a > 0 && panelHead.text[panelCaret.a - 1] !== '\n' ? panelCaret.a - 1 : panelCaret.a, panelHead)
            : charStyleOf(panelHead)),
        align: scopePatch?.align ?? panelHead.align,
        // word-spacing bounds belong to the whole story; leading / alignment show the paragraph in scope (see above)
        leading: scopePatch?.leading ?? panelHead.leading,
        wordSpacingMin: panelHead.wordSpacingMin,
        wordSpacingMax: panelHead.wordSpacingMax,
      }
    : null

  // more than one size in the text the panel speaks for: its size field must not pretend one of them is the size
  const panelSizeMixed = panelHead && !panelCaret
    ? new Set(
        (panelSel ? sliceRuns(normalizeRuns(panelHead.text, panelHead.runs, panelHead), panelSel.a, panelSel.b) : normalizeRuns(panelHead.text, panelHead.runs, panelHead)).map((run) => run.style.fontSize),
      ).size > 1
    : false

  // the paragraph style the Paragraph Styles panel highlights: the one of the paragraph the selection (or the caret) is in
  // a paragraph with none of these carries the document's base style (paragraphStyles[0]), same as a frame nobody has
  // ever touched - there is no such thing as "no paragraph style", only one that was never made explicit
  const paragraphStyleIdOf = (frame: TextFrame, index: number): string | null => {
    const listed = frame.paragraphStyleIds?.[index]
    const named = frame.paragraphStyleNames?.[index]
    return (
      paragraphStyles.find((style) => style.id === listed)?.id ??
      paragraphStyles.find((style) => !!named && style.name === named)?.id ??
      paragraphStyles.find((style) => style.id === frame.paragraphStyleId)?.id ??
      paragraphStyles[0]?.id ??
      null
    )
  }
  // the range a paragraph-style click acts on: the actual text selection/caret while editing, or - with a text frame
  // simply selected (Selection tool, nothing open for editing) - its whole story. Selecting a frame and clicking a
  // paragraph style restyles the whole thing, the same as InDesign; a lone frame in this app is almost always meant
  // to read as a single style throughout, so this is also what decides which style, if any, the frame is shown under.
  const panelRange: { a: number; b: number } | null = !panelHead
    ? null
    : textEditing && textSel && textSel.headId === panelHead.id
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: 0, b: panelHead.text.length }
  const highlightedStyleId: string | null | undefined = (() => {
    if (!panelHead || !panelRange) return undefined
    const ids = new Set(paragraphsInRange(panelHead.text, panelRange.a, panelRange.b).map((index) => paragraphStyleIdOf(panelHead, index)))
    if (ids.size > 1) return null // the range reaches across several styles: none is "the" style
    const only = [...ids][0]
    return only ?? undefined
  })()

  const resolveParagraphStyle = (id: string, source = paragraphStyles, seen = new Set<string>()): ParagraphStyleRecord['patch'] => {
    if (seen.has(id)) return {}
    const style = source.find((candidate) => candidate.id === id)
    if (!style) return {}
    const nextSeen = new Set(seen).add(id)
    return { ...(style.basedOnId ? resolveParagraphStyle(style.basedOnId, source, nextSeen) : {}), ...style.patch }
  }
  // the paragraph style the selection (or caret) is in, and whether its text carries changes of its own beyond that style
  // "+": the paragraph(s) the selection is in have changed since we started looking at them - not "differ from the
  // style's own definition" (an older document, or a paragraph a Word import mapped to the wrong style, may already
  // differ, with nothing just done about it). The baseline resets whenever the tracked paragraph or its style changes,
  // so switching a paragraph onto a style, or moving to a different paragraph, starts clean; further edits (through
  // the Properties panel, the toolbar, or a partial selection restyled by hand) show up against that reset point.
  // a ref, not state: the automatic reset below settles within the render that triggers it, so it never needs one of its
  // own; the explicit "אישור" action does change what the NEXT render should show without anything else changing, so
  // it also bumps this plain counter to ask for that render
  const paragraphBaselineRef = useRef<{ key: string; look: string } | null>(null)
  const [, bumpOverrideBaseline] = useState(0)
  // panelRange already falls back to the whole story for a merely-selected frame (see above), so a frame's "+" works
  // the same whether you are inside its text editing a word or just have it selected with the Selection tool
  const overrideParagraphs = panelHead && panelRange && typeof highlightedStyleId === 'string' ? paragraphsInRange(panelHead.text, panelRange.a, panelRange.b) : null
  // what actually diverges from the style right now (never sensitive to how much text there is - typing more of an
  // already-matching look must not look like a change): its own keys/values are the signature, not the raw text
  const overrideLook =
    overrideParagraphs && panelHead && typeof highlightedStyleId === 'string'
      ? overrideParagraphs.map((index) => JSON.stringify(paragraphOverrides(panelHead, index, resolveParagraphStyle(highlightedStyleId)))).join('|')
      : null
  const overrideKey = overrideParagraphs && panelHead ? `${panelHead.id}:${overrideParagraphs.join(',')}:${highlightedStyleId}` : null
  // the tracked paragraph or its style just changed: this render's baseline is its current look, so it starts clean
  if (overrideKey !== paragraphBaselineRef.current?.key) paragraphBaselineRef.current = overrideKey && overrideLook !== null ? { key: overrideKey, look: overrideLook } : null
  const styleHasOverrides = !!overrideKey && overrideLook !== paragraphBaselineRef.current?.look

  /** "אישור": stop flagging the paragraph's current look as pending - accept it as is, without making a new style */
  const commitParagraphOverrides = () => {
    if (overrideKey && overrideLook !== null) {
      paragraphBaselineRef.current = { key: overrideKey, look: overrideLook }
      bumpOverrideBaseline((n) => n + 1)
    }
  }
  /** "ביטול": put the paragraph(s) back exactly as their style defines them, discarding what was done since the baseline */
  const discardParagraphOverrides = () => {
    if (!panelHead || !overrideParagraphs || typeof highlightedStyleId !== 'string') return
    let next: TextFrame = panelHead
    for (const index of overrideParagraphs) next = restyleParagraphs(next, [index], highlightedStyleId, highlightedStyleId, false, paragraphStyles, true)
    onFramesChange(frames.map((frame) => (frame.id === panelHead.id ? next : frame)), `paragraph-style-discard:${highlightedStyleId}`)
  }

  /**
   * Apply a paragraph style to whatever the panel currently speaks for: the selection or caret's paragraph(s) while
   * editing text, or - with a text frame merely selected - its whole story (see `panelRange`). Every paragraph goes
   * through `restyleParagraphs` on its own, so a frame with paragraphs on different styles resets each correctly
   * (restyleParagraphs itself notices when that covers the whole story and updates the frame's own top-level look too).
   */
  const applyParagraphStyleToFrame = (id: string) => {
    if (!selectedId) return
    const selected = frames.find((frame) => frame.id === selectedId)
    if (!selected) return
    const head = chainOf(frames, selected.id)[0]
    const range = textEditing && textSel && textSel.headId === head.id ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) } : { a: 0, b: head.text.length }
    const indexes = paragraphsInRange(head.text, range.a, range.b)
    let next: TextFrame = head
    for (const index of indexes) next = restyleParagraphs(next, [index], paragraphStyleIdOf(next, index) ?? '', id)
    onFramesChange(frames.map((frame) => (frame.id === head.id ? next : frame)), `paragraph-style-selection:${head.id}`)
  }
  const changeParagraphStyle = (id: string, patch: Partial<ParagraphStyleRecord>) => {
    const nextStyles = paragraphStyles.map((style) => style.id === id ? { ...style, ...patch, patch: { ...style.patch, ...(patch.patch ?? {}) } } : style)
    onParagraphStylesChange(nextStyles)
    const resolved = resolveParagraphStyle(id, nextStyles)
    const charPatch = Object.fromEntries(['fontFamily', 'color', 'weight', 'italic', 'fontSize', 'tracking'].filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]])) as Partial<CharStyle>
    const updateImportedParagraphs = (frame: TextFrame) => {
      const hasFrameStyle = frame.paragraphStyleId === id
      const hasParagraphStyles = !!frame.paragraphStyleIds?.length
      if (!hasFrameStyle && !frame.paragraphStyleIds?.includes(id)) return frame
      if (hasFrameStyle && !hasParagraphStyles) return { ...frame, ...resolved }
      const paragraphStyleIds = frame.paragraphStyleIds ?? []
      const paragraphStylePatches = frame.paragraphStylePatches ? frame.paragraphStylePatches.slice() : paragraphStyleIds.map(() => ({}))
      let paraSpaceBefore = frame.paraSpaceBefore
      let paraSpaceAfter = frame.paraSpaceAfter
      let runs = normalizeRuns(frame.text, frame.runs, frame)
      let start = 0
      paragraphStyleIds.forEach((styleId, index) => {
        const end = index + 1 < paragraphStyleIds.length ? (frame.text.indexOf('\n', start) + 1 || frame.text.length) : frame.text.length
        if (styleId === id) {
          runs = styleRange(runs, start, end, charPatch)
          paragraphStylePatches[index] = Object.fromEntries(['leading', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align'].filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]]))
          if (resolved.spaceBefore !== undefined) paraSpaceBefore = withParaOverride(paraSpaceBefore, index, resolved.spaceBefore)
          if (resolved.spaceAfter !== undefined) paraSpaceAfter = withParaOverride(paraSpaceAfter, index, resolved.spaceAfter)
        }
        start = end
      })
      const sameStyle = paragraphStyleIds.length > 0 && paragraphStyleIds.every((styleId) => styleId === id)
      return { ...frame, ...(sameStyle ? resolved : {}), paragraphStylePatches, paraSpaceBefore, paraSpaceAfter, runs }
    }
    onFramesChange(frames.map(updateImportedParagraphs), `paragraph-style-edit:${id}`)
  }
  const createParagraphStyle = () => {
    // an id from the clock, not the list length: deleting a style and adding another must never reuse an id
    const id = `paragraph-style-${Date.now()}`
    const head = panelHead
    const range = head && textEditing && textSel && textSel.headId === head.id ? textSel : null
    if (!head || !range) {
      onParagraphStylesChange([...paragraphStyles, { id, name: `סגנון ${paragraphStyles.length + 1}`, basedOnId: 'body', patch: {} }])
      return
    }
    // from text (as InDesign's new style does): the style takes what the paragraph carries beyond its own style, is based on
    // that style, and is applied to the paragraph - which is why the "+" of the old style goes away
    const indexes = paragraphsInRange(head.text, Math.min(range.a, range.b), Math.max(range.a, range.b))
    const baseId = typeof highlightedStyleId === 'string' ? highlightedStyleId : paragraphStyles[0]?.id
    const base = baseId ? resolveParagraphStyle(baseId) : {}
    const overrides = indexes.map((index) => paragraphOverrides(head, index, base)).find((found) => Object.keys(found).length > 0) ?? {}
    const created: ParagraphStyleRecord = { id, name: `סגנון ${paragraphStyles.length + 1}`, ...(baseId ? { basedOnId: baseId } : {}), patch: overrides }
    const nextStyles = [...paragraphStyles, created]
    onParagraphStylesChange(nextStyles)
    onFramesChange(frames.map((frame) => (frame.id === head.id ? restyleParagraphs(frame, indexes, baseId ?? '', id, true, nextStyles) : frame)), `paragraph-style-create:${id}`)
  }
  const deleteParagraphStyle = (id: string, baseFrames = frames, fallbackId?: string) => {
    if (paragraphStyles.length <= 1) return
    const fallback = fallbackId ?? paragraphStyles.find((style) => style.id !== id)?.id
    onParagraphStylesChange(paragraphStyles.filter((style) => style.id !== id))
    const uses = (frame: TextFrame) => frame.paragraphStyleId === id || !!frame.paragraphStyleIds?.includes(id)
    if (fallback && baseFrames.some(uses))
      onFramesChange(
        baseFrames.map((frame) =>
          uses(frame)
            ? {
                ...frame,
                ...(frame.paragraphStyleId === id ? { paragraphStyleId: fallback } : {}),
                ...(frame.paragraphStyleIds ? { paragraphStyleIds: frame.paragraphStyleIds.map((styleId) => (styleId === id ? fallback : styleId)) } : {}),
              }
            : frame,
        ),
        `paragraph-style-delete:${id}`,
      )
  }

  const paragraphBounds = (text: string, index: number) => {
    let start = 0
    for (let i = 0; i < index; i++) {
      const end = text.indexOf('\n', start)
      start = end < 0 ? text.length : end + 1
    }
    const end = text.indexOf('\n', start)
    return [start, end < 0 ? text.length : end + 1] as const
  }

  const paragraphUsesStyle = (frame: TextFrame, index: number, styleId: string) => {
    // an id that names no defined style "matches" nothing - resolving it to {} would otherwise match every paragraph
    if (!paragraphStyles.some((style) => style.id === styleId)) return false
    const style = resolveParagraphStyle(styleId)
    const [start] = paragraphBounds(frame.text, index)
    const run = styleAtChar(normalizeRuns(frame.text, frame.runs, frame), start, frame)
    return Object.entries(style).filter(([key]) => ['fontFamily', 'fontSize', 'weight', 'italic', 'color'].includes(key)).every(([key, value]) => value === undefined || run[key as keyof CharStyle] === value)
  }

  /**
   * The paragraphs of a story that carry a style: the ones its per-paragraph lists name it for, or - for a story that has
   * no lists - all of them when the story itself has the style, or those whose look matches it.
   */
  const paragraphsWithStyle = (frame: TextFrame, styleId: string): number[] => {
    const name = paragraphStyles.find((style) => style.id === styleId)?.name
    return frame.text.split('\n').flatMap((_, index) => {
      const idsMatch = frame.paragraphStyleIds?.[index] === styleId
      const namesMatch = !!name && frame.paragraphStyleNames?.[index] === name
      const legacyMatch = !frame.paragraphStyleIds?.length && paragraphUsesStyle(frame, index, styleId)
      return frame.paragraphStyleId === styleId || idsMatch || namesMatch || legacyMatch ? [index] : []
    })
  }

  /** every paragraph that carries a style, story by story in reading order */
  const styleOccurrences = (styleId: string) =>
    headFrames(frames).flatMap((frame) =>
      paragraphsWithStyle(frame, styleId).map((index) => {
        const [start, end] = paragraphBounds(frame.text, index)
        return { frame, index, start, end }
      }),
    )

  /**
   * Gives paragraphs of a story another paragraph style: its name in the per-paragraph lists, the character look in the
   * runs, and the paragraph look (leading, spacing, indents, alignment) in the paragraph overrides. A story that has no
   * lists yet gets them here, so the paragraphs that stay on `sourceId` still carry it afterwards.
   */
  const restyleParagraphs = (frame: TextFrame, indexes: number[], sourceId: string, targetId: string, keepLook = false, styles = paragraphStyles, hardReset = false): TextFrame => {
    if (indexes.length === 0) return frame
    const resolved = resolveParagraphStyle(targetId, styles)
    const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]]))
    const charPatch = pick(['fontFamily', 'color', 'weight', 'italic', 'fontSize', 'tracking']) as Partial<CharStyle>
    // what the old style set and the new one leaves alone goes back to plain: bold text swapped to a regular style must
    // not stay bold. hardReset (discarding a paragraph's own overrides back to its own style) has no "old style" to
    // compare against - it always fills in plain, since the point is to match the style exactly, run-level formatting
    // the style never mentions included
    const leaving = keepLook ? {} : resolveParagraphStyle(sourceId, styles)
    if ((hardReset || leaving.weight !== undefined) && charPatch.weight === undefined) charPatch.weight = 400
    if ((hardReset || leaving.italic !== undefined) && charPatch.italic === undefined) charPatch.italic = false
    if ((hardReset || leaving.tracking !== undefined) && charPatch.tracking === undefined) charPatch.tracking = 0
    const layout = pick(['leading', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align']) as NonNullable<TextFrame['paragraphStylePatches']>[number]
    const count = frame.text.split('\n').length
    const hadLists = !!frame.paragraphStyleIds?.length
    const carriesSource = hadLists ? new Set<number>() : new Set(paragraphsWithStyle(frame, sourceId))
    const sourceName = paragraphStyles.find((style) => style.id === sourceId)?.name ?? ''
    const targetName = styles.find((style) => style.id === targetId)?.name ?? ''
    const ids = Array.from({ length: count }, (_, i) => (hadLists ? frame.paragraphStyleIds![i] ?? '' : carriesSource.has(i) ? sourceId : frame.paragraphStyleId ?? ''))
    const names = Array.from({ length: count }, (_, i) => (hadLists ? frame.paragraphStyleNames?.[i] ?? '' : carriesSource.has(i) ? sourceName : ''))
    const patches = Array.from({ length: count }, (_, i) => frame.paragraphStylePatches?.[i] ?? {})
    const override = (list: (number | null)[] | undefined, index: number, value: number | undefined) => {
      if (value !== undefined) return withParaOverride(list, index, value)
      if (list?.[index] == null) return list
      const out = list.slice()
      out[index] = null
      return out
    }
    let runs = normalizeRuns(frame.text, frame.runs, frame)
    let paraSpaceBefore = frame.paraSpaceBefore
    let paraSpaceAfter = frame.paraSpaceAfter
    for (const index of indexes) {
      const [start, end] = paragraphBounds(frame.text, index)
      ids[index] = targetId
      names[index] = targetName
      patches[index] = layout
      // keepLook: the text already looks the way the style says (a style made from it), it is only tagged
      if (keepLook) continue
      runs = styleRange(runs, start, end, charPatch)
      paraSpaceBefore = override(paraSpaceBefore, index, layout.spaceBefore)
      paraSpaceAfter = override(paraSpaceAfter, index, layout.spaceAfter)
    }
    // every paragraph moved: the story as a whole is now on the target style too
    const whole = new Set(indexes).size >= count
    const storyStyle = whole && !keepLook ? (pick(['fontFamily', 'color', 'weight', 'italic', 'fontSize', 'leading', 'tracking', 'align', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent']) as Partial<TextStyle>) : {}
    const paragraphStyleId = whole ? targetId : !hadLists || frame.paragraphStyleId === sourceId ? undefined : frame.paragraphStyleId
    return { ...frame, ...storyStyle, paragraphStyleId, paragraphStyleIds: ids, paragraphStyleNames: names, paragraphStylePatches: patches, paraSpaceBefore, paraSpaceAfter, runs }
  }

  const swapParagraphStyles = (sourceId: string, targetId: string, removeSource: boolean) => {
    if (sourceId === targetId) return
    const heads = new Set(headFrames(frames).map((frame) => frame.id))
    const nextFrames = frames.map((frame) => (heads.has(frame.id) ? restyleParagraphs(frame, paragraphsWithStyle(frame, sourceId), sourceId, targetId) : frame))
    onFramesChange(nextFrames, `style-swap:${sourceId}:${targetId}`)
    delete styleSearchIndex.current[sourceId]
    if (removeSource) deleteParagraphStyle(sourceId, nextFrames, targetId)
  }

  const findParagraphStyle = (styleId: string, direction: -1 | 0 | 1 = 0) => {
    const occurrences = styleOccurrences(styleId)
    if (occurrences.length > 0) {
      const previous = styleSearchIndex.current[styleId]
      const index = direction === 0 ? 0 : previous === undefined ? (direction < 0 ? occurrences.length - 1 : 0) : (previous + direction + occurrences.length) % occurrences.length
      styleSearchIndex.current[styleId] = index
      const occurrence = occurrences[index]
      const chain = chainOf(frames, occurrence.frame.id)
      const target = chain.find((frame) => {
        const flowPart = flow.get(frame.id)
        return !!flowPart && occurrence.start < flowPart.end && occurrence.end > flowPart.start
      }) ?? occurrence.frame
      const targetFlow = flow.get(target.id)
      const localStart = targetFlow ? Math.max(0, occurrence.start - targetFlow.start) : 0
      const localEnd = targetFlow ? Math.min(targetFlow.slice.length, occurrence.end - targetFlow.start) : 0
      const page = ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)
      setSelectedPage(page)
      setSelectedId(target.id)
      setEditingId(target.id)
      setTextSel({ headId: occurrence.frame.id, a: occurrence.start, b: occurrence.end })
      askSelection(target.id, localStart, localEnd)
      goTo(spreadOfPage(page))
    }
    return occurrences.length
  }

  /** Replaces the style of the occurrence the explorer is on (the first, when it has not been used); returns how many are left. */
  const swapOneParagraphStyle = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return 0
    const occurrences = styleOccurrences(sourceId)
    if (occurrences.length === 0) return 0
    const current = Math.min(styleSearchIndex.current[sourceId] ?? 0, occurrences.length - 1)
    const occurrence = occurrences[current]
    onFramesChange(frames.map((frame) => (frame.id === occurrence.frame.id ? restyleParagraphs(frame, [occurrence.index], sourceId, targetId) : frame)), `style-swap-one:${sourceId}:${targetId}`)
    // the list is one shorter now, and the next occurrence sits where this one was
    if (current > 0) styleSearchIndex.current[sourceId] = current - 1
    else delete styleSearchIndex.current[sourceId]
    return occurrences.length - 1
  }

  const batchSwapParagraphStyles = (pairs: { sourceId: string; targetId: string }[]) => {
    const heads = new Set(headFrames(frames).map((frame) => frame.id))
    let nextFrames = frames
    for (const pair of pairs) {
      if (pair.sourceId === pair.targetId) continue
      nextFrames = nextFrames.map((frame) => (heads.has(frame.id) ? restyleParagraphs(frame, paragraphsWithStyle(frame, pair.sourceId), pair.sourceId, pair.targetId) : frame))
      delete styleSearchIndex.current[pair.sourceId]
    }
    onFramesChange(nextFrames, 'style-batch-swap')
  }

  const createManagedParagraphStyle = (name: string, patch: ParagraphStyleRecord['patch']) => {
    const id = `paragraph-style-${Date.now()}`
    onParagraphStylesChange([...paragraphStyles, { id, name, patch }])
  }

  /**
   * Finds every paragraph carrying `tag` (or just the first, when `all` is off) and gives it `styleId` - through
   * `restyleParagraphs`, the same path every other "apply this style to these paragraphs" action in this file uses,
   * so only the tagged paragraphs change (not the whole story's own look) and the character/leading/spacing look
   * comes out identical to applying the style by hand. Removing the tag text itself never removes a "\n", so the
   * paragraph each occurrence was found in stays the same paragraph (same index) throughout - the tag can safely be
   * stripped first and the style applied to the resulting text in one pass.
   */
  const applyTagStyle = (tag: string, styleId: string, removeTag: boolean, all: boolean) => {
    if (!tag || !styleId) return
    const nextFrames = frames.map((frame) => {
      if (!frame.text || !headFrames(frames).some((head) => head.id === frame.id)) return frame
      let text = frame.text
      let runs = normalizeRuns(text, frame.runs, frame)
      const indexes: number[] = []
      let at = text.indexOf(tag)
      while (at >= 0) {
        const index = paraIndexAt(text, at)
        if (!indexes.includes(index)) indexes.push(index)
        const end = at + tag.length
        if (removeTag) {
          const edited = editStory(text, runs, at, end, '', frame)
          text = edited.text
          runs = edited.runs
        }
        if (!all) break
        at = text.indexOf(tag, removeTag ? at : end)
      }
      if (indexes.length === 0) return frame
      return restyleParagraphs({ ...frame, text, runs }, indexes, frame.paragraphStyleId ?? paragraphStyles[0]?.id ?? '', styleId, false, paragraphStyles)
    })
    onFramesChange(nextFrames, `tag-style:${styleId}`)
  }

  /** every place `tag` appears in the text of any story (its head frame), story by story in reading order - the
   * same shape as `styleOccurrences`, just matching literal text instead of style membership */
  const tagOccurrences = (tag: string) => {
    const out: { frame: TextFrame; start: number; end: number }[] = []
    if (!tag) return out
    for (const frame of headFrames(frames)) {
      if (!frame.text) continue
      let at = frame.text.indexOf(tag)
      while (at >= 0) {
        out.push({ frame, start: at, end: at + tag.length })
        at = frame.text.indexOf(tag, at + tag.length)
      }
    }
    return out
  }

  /** Selects the next/previous/first occurrence of `tag` in the document and scrolls to it, the explorer for
   * "סימן לחיפוש" (ניהול סגנונות > כלים) - identical in spirit to findParagraphStyle, just searching by the tag's
   * own text instead of by which style a paragraph carries. */
  const findTagOccurrence = (tag: string, direction: -1 | 0 | 1 = 0) => {
    const occurrences = tagOccurrences(tag)
    if (occurrences.length > 0) {
      const previous = tagSearchIndex.current[tag]
      const index = direction === 0 ? 0 : previous === undefined ? (direction < 0 ? occurrences.length - 1 : 0) : (previous + direction + occurrences.length) % occurrences.length
      tagSearchIndex.current[tag] = index
      const occurrence = occurrences[index]
      const chain = chainOf(frames, occurrence.frame.id)
      const target = chain.find((frame) => {
        const flowPart = flow.get(frame.id)
        return !!flowPart && occurrence.start < flowPart.end && occurrence.end > flowPart.start
      }) ?? occurrence.frame
      const targetFlow = flow.get(target.id)
      const localStart = targetFlow ? Math.max(0, occurrence.start - targetFlow.start) : 0
      const localEnd = targetFlow ? Math.min(targetFlow.slice.length, occurrence.end - targetFlow.start) : 0
      const page = ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)
      setSelectedPage(page)
      setSelectedId(target.id)
      setEditingId(target.id)
      setTextSel({ headId: occurrence.frame.id, a: occurrence.start, b: occurrence.end })
      askSelection(target.id, localStart, localEnd)
      goTo(spreadOfPage(page))
    } else {
      delete tagSearchIndex.current[tag]
    }
    return occurrences.length
  }

  /** Gives the tag occurrence the explorer is on (the first, when it has not been used) `styleId`, optionally
   * removing the tag itself; returns how many occurrences are left. Mirrors swapOneParagraphStyle. */
  const swapOneTagOccurrence = (tag: string, styleId: string, removeTag: boolean) => {
    if (!tag || !styleId) return 0
    const occurrences = tagOccurrences(tag)
    if (occurrences.length === 0) return 0
    const current = Math.min(tagSearchIndex.current[tag] ?? 0, occurrences.length - 1)
    const occurrence = occurrences[current]
    const frame = occurrence.frame
    let text = frame.text
    let runs = normalizeRuns(text, frame.runs, frame)
    if (removeTag) {
      const edited = editStory(text, runs, occurrence.start, occurrence.end, '', frame)
      text = edited.text
      runs = edited.runs
    }
    const index = paraIndexAt(frame.text, occurrence.start)
    const restyled = restyleParagraphs({ ...frame, text, runs }, [index], frame.paragraphStyleId ?? paragraphStyles[0]?.id ?? '', styleId, false, paragraphStyles)
    onFramesChange(frames.map((f) => (f.id === frame.id ? restyled : f)), `tag-swap-one:${styleId}`)
    // the list is one shorter now, and the next occurrence sits where this one was (see swapOneParagraphStyle)
    if (current > 0) tagSearchIndex.current[tag] = current - 1
    else delete tagSearchIndex.current[tag]
    return occurrences.length - 1
  }

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
  const displayGuideColor = (color: string) => (color.toLowerCase() === '#00d1b2' ? '#3d8bff' : color)
  const guideStyle = (axis: GuideAxis, page: number, pos: number, color: string): CSSProperties | null => {
    const r = rects[page]
    if (!r) return null
    const base = axis === 'h'
      ? { left: tx + r.x * zoom, top: ty + (r.y + pos) * zoom - 3, width: r.w * zoom }
      : { left: tx + (r.x + pos) * zoom - 3, top: ty + r.y * zoom, height: r.h * zoom }
    return { ...base, '--gc': color } as unknown as CSSProperties
  }

  /** the part of a frame's text to draw highlighted (frames that are not being edited) */
  const highlightFor = (fl: FrameFlow): [number, number] | null => {
    if (!textSel || textSel.headId !== fl.headId || textSel.a >= textSel.b) return null
    const a = Math.max(textSel.a, fl.start)
    const b = Math.min(textSel.b, fl.end)
    return a < b ? [a - fl.start, b - fl.start] : null
  }
  const freehandShape = freehandPreview
    ? pathShapeFromPoints(
        freehandPreview.points,
        freehandPreview.closed,
        tool === 'pencil',
        tool === 'pen',
        pencilSettings.cap === 'round' ? 0.75 : 0.18 + (pencilSettings.smoothness / 100) * 0.36,
        tool === 'pencil' ? pencilSettings.cap : 'butt',
      )
    : null

  void showProps
  void showPages
  void showParagraph

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

      <ContextToolbar
        tool={space ? 'hand' : tool}
        shape={selShape}
        image={selImage}
        frame={selFrame}
        textStyle={panelStyle}
        paragraphStyle={paragraphStyle}
        strokeWidth={drawingStrokeWidth}
        colorTarget={colorTarget}
        onColorTarget={setColorTarget}
        onFlip={(axis) => selShape && flipShape(selShape.id, axis)}
        onArrange={(op) => selShape ? arrangeObject(selShape.id, op) : selImage ? arrangeObject(selImage.id, op) : selFrame ? arrangeObject(selFrame.id, op) : undefined}
        onOpacity={(value) => {
          if (selShape) updateShape(selShape.id, { opacity: value }, `context-opacity:${selShape.id}`)
          else if (selImage) updateImage(selImage.id, { opacity: value }, `context-opacity:${selImage.id}`)
        }}
        onImageFit={(fit) => selImage && updateImage(selImage.id, { fit })}
        onImageFlip={(axis) => selImage && updateImage(selImage.id, axis === 'x' ? { flipX: !selImage.flipX } : { flipY: !selImage.flipY })}
        onImageWrap={(wrap) => selImage && updateImage(selImage.id, { wrap })}
        onImageMatchShape={() => { const asset = selImage && assets[selImage.assetId]; if (selImage && asset) updateImage(selImage.id, { h: selImage.w * (asset.height / asset.width) }) }}
        onImageDelete={() => { if (selImage) { onImagesChange(images.filter((image) => image.id !== selImage.id)); setSelectedId(null) } }}
        onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)}
        onAlign={(align) => selFrame && applyAlign(selFrame.id, align)}
        onLeading={(leading) => selFrame && applyParagraphStyle(selFrame.id, { leading })}
        onParagraphStyle={(patch) => selFrame && applyParagraphStyle(selFrame.id, patch)}
        onParagraphSpacing={(patch) => selFrame && applyParaSpacing(selFrame.id, patch)}
        onFill={(color) => selShape && updateShape(selShape.id, colorTarget === 'fill' ? { fill: color, fillGradient: undefined } : { stroke: color }, `context-${colorTarget}:${selShape.id}`)}
        onStrokeWidth={(value) => {
          setDrawingStrokeWidth(value)
          if (selShape) updateShape(selShape.id, { strokeWidth: value }, `context-stroke:${selShape.id}`)
        }}
      />

      <div className="ws-main">
        <Toolbox
          tool={space ? 'hand' : tool}
          onSelect={setTool}
          onSettings={(id) => setToolDialog(id === 'pen' || id === 'pencil' ? id : id === 'rect' || id === 'polygon' ? id : (FRAME_TOOL_KIND[id] ?? null))}
          previewMode={previewMode}
          onPreviewMode={onPreviewMode}
          colorTarget={colorTarget}
          fillColor={selShape?.fill}
          strokeColor={selShape?.stroke}
          onColorTarget={setColorTarget}
          onOpenColor={(target) => {
            setColorTarget(target)
            setColorDialogTarget(target)
            setTool('color')
          }}
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
            onDoubleClick={(e) => {
              if (tool === 'pen' && penPoints.current.length >= 2) {
                e.preventDefault()
                finishPen(false)
              }
            }}
          >
            <div className="sheet" style={{ width: sheetW, height: sheetH }}>
              <svg width={sheetW} height={sheetH}>
                {visible.map((s) => (
                  <SpreadView key={s.y} doc={doc} spread={s} zoom={zoom} tx={tx} ty={ty} showGuides={showGuides && !previewMode} />
                ))}
              </svg>
              {groupSelection && !previewMode && !placing && placingImages.length === 0 && tool === 'select' && (
                <div
                  className="group-selection"
                  style={{
                    left: tx + groupSelection.box.x * zoom,
                    top: ty + groupSelection.box.y * zoom,
                    width: groupSelection.box.w * zoom,
                    height: groupSelection.box.h * zoom,
                  }}
                >
                  {HANDLES.map((h) => (
                    <div key={h} className={'handle ' + h} onPointerDown={(e) => beginGroupResize(h, e)} />
                  ))}
                </div>
              )}
              {visibleImages.map((im) => (
                <ImageFrameView
                  key={im.id}
                  image={im}
                  asset={assets[im.assetId]}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(im.id) ?? 0}
                  selected={im.id === selectedId}
                  locked={layerLocked || !!itemLocks[im.id]}
                  marked={!previewMode && multiSel.includes(im.id)}
                  showEdge={!previewMode}
                  onPointerDown={onImagePointerDown(im.id)}
                  onHandleDown={onHandleDown(im.id)}
                  onRotateDown={onRotateDown(im.id)}
                />
              ))}
              {visibleShapes.map((sh) => (
                <ShapeFrameView
                  key={sh.id}
                  shape={sh}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(sh.id) ?? 0}
                  selected={sh.id === selectedId && tool !== 'pencil'}
                  locked={layerLocked || !!itemLocks[sh.id]}
                  marked={!previewMode && multiSel.includes(sh.id)}
                  showEdge={!previewMode}
                  hotCorners={sh.id === selectedId ? hotCorners : undefined}
                  activeCorners={sh.id === selectedId ? [0, 1, 2, 3] : undefined}
                  together={roundTogether}
                  directMode={tool === 'direct'}
                  selectedPoints={tool === 'direct' ? (editableRing(sh)?.map((_, index) => index) ?? undefined) : sh.id === pointSel?.id ? pointSel.indices : undefined}
                  asset={sh.image ? assets[sh.image.assetId] : undefined}
                  onPointerDown={onShapePointerDown(sh.id)}
                  onHandleDown={onHandleDown(sh.id)}
                  onRotateDown={onRotateDown(sh.id)}
                  onCornerDown={onCornerDown(sh.id)}
                  onDoubleClick={() => {
                    if (sh.pathText && tool === 'select') {
                      setSelectedId(sh.id)
                      setPathEdit(sh.id)
                    }
                  }}
                  onPegDown={onPegDown(sh.id)}
                  onPointDown={onPointDown(sh.id)}
                  onDirectMove={tool === 'direct' ? (event) => beginFrameDrag(event as unknown as ReactPointerEvent<HTMLElement>, sh.id, 'move') : undefined}
                  onEdgeDown={onEdgeDown(sh.id)}
                  onHandleGrab={onHandleGrab(sh.id)}
                  onContentGrab={onContentGrab(sh.id)}
                  onContentResize={onContentResize(sh.id)}
                  onLineEndDown={onLineEndDown(sh.id)}
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
                    ...(shapeFlip ? { flip: shapeFlip } : {}),
                    fill: null,
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
              {freehandShape && (
                <ShapeFrameView
                  ghost
                  shape={freehandShape}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={900002}
                  selected={tool === 'pen'}
                  directMode={tool === 'pen'}
                  selectedPoints={tool === 'pen' && freehandShape.geom ? freehandShape.geom[0][0].map((_, index) => index) : undefined}
                  onPointDown={
                    tool === 'pen'
                      ? (index, event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          const anchor = penPoints.current[index]
                          if (!anchor) return
                          // the first point again closes the path; Alt on any point pulls its handles out; otherwise it moves
                          if (index === 0 && !event.altKey && penPoints.current.length >= 3) {
                            finishPen()
                            return
                          }
                          penDrag.current = { index, start: toWorld(event.clientX, event.clientY), origin: { x: anchor.x, y: anchor.y }, mode: event.altKey ? 'handles' : 'move', moved: false }
                          setPenDragging(true)
                          setPenHover(null)
                          event.currentTarget.setPointerCapture(event.pointerId)
                          vpRef.current?.setPointerCapture(event.pointerId)
                        }
                      : undefined
                  }
                  onHandleGrab={
                    tool === 'pen'
                      ? (index, which, event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          penDrag.current = { index, start: toWorld(event.clientX, event.clientY), mode: 'handle', which, moved: false }
                          setPenDragging(true)
                          setPenHover(null)
                          event.currentTarget.setPointerCapture(event.pointerId)
                          vpRef.current?.setPointerCapture(event.pointerId)
                        }
                      : undefined
                  }
                  showEdge
                />
              )}
              {tool === 'eraser' && eraserPoint && (
                <div
                  className="eraser-brush"
                  aria-hidden="true"
                  style={{ left: tx + eraserPoint.x * zoom - eraserRadius, top: ty + eraserPoint.y * zoom - eraserRadius, width: eraserRadius * 2, height: eraserRadius * 2 }}
                />
              )}
              {angleTip && (
                <div className="guide-tip" style={{ left: tx + angleTip.x * zoom + 10, top: ty + angleTip.y * zoom - 24 }}>
                  {angleTip.deg.toFixed(1)}°
                </div>
              )}
              {visibleFrames.map((f) => {
                const fl = flow.get(f.id)
                if (!fl) return null
                const storyHead = chainOf(frames, f.id)[0]
                return (
                  <TextFrameView
                    key={f.id}
                    frame={f}
                    style={fl.style}
                    slice={fl.slice}
                    runs={fl.runs}
                    highlight={highlightFor(fl)}
                    floats={floatsFor(f, images, fl.style, fl.prevId === null)}
                    paraGaps={fl.paraGaps}
                    startParaIndex={fl.startParaIndex}
                    atParaStart={fl.atParaStart}
                    paragraphPatches={storyHead.paragraphStylePatches}
                    spaceBeforeFirst={fl.spaceBeforeFirst}
                    spaceAfterLast={fl.spaceAfterLast}
                    z={rank.get(f.id) ?? 0}
                    overflow={fl.overflow}
                    hasPrev={fl.prevId !== null}
                    zoom={zoom}
                    tx={tx}
                    ty={ty}
                    selected={f.id === selectedId}
                    locked={layerLocked || !!itemLocks[f.id]}
                    marked={!previewMode && multiSel.includes(f.id)}
                    editing={f.id === editingId}
                    armed={f.id === linkFrom}
                    showEdge={!previewMode}
                    showHidden={showHiddenChars && !previewMode}
                    request={request && request.frameId === f.id ? request : null}
                    onPointerDown={onFramePointerDown(f.id)}
                    onDoubleClick={() => {
                      if (!panMode) {
                        setSelectedId(f.id)
                        setEditingId(f.id)
                      }
                    }}
                    onHandleDown={onHandleDown(f.id)}
                    onRotateDown={onRotateDown(f.id)}
                    onOutPortDown={onOutPortDown(f.id)}
                    onInPortDown={onInPortDown(f.id)}
                    onEdit={(from, to, insert) => handleEdit(f.id, from, to, insert)}
                    onSelect={(a, b) => handleSelect(f.id, a, b)}
                    onCopyText={() => copyText(f.id)}
                    onBackspaceAtStart={() => backspaceAtStart(f.id)}
                    onLineBoundary={(dir, x) => jumpToLine(f.id, dir, x)}
                    onDragOutside={(x, y, anchor) => extendSelectionAcrossFrames(f.id, x, y, anchor)}
                    onStopEditing={() => setEditingId((c) => (c === f.id ? null : c))}
                  />
                )
              })}
              {showGuides && !previewMode && (
                <>
                  {guides.map((g) => {
                    if (g.id === guideDrag?.id) return null
                    const st = guideStyle(g.axis, g.page, g.pos, displayGuideColor(g.color ?? DEFAULT_GUIDE_COLOR))
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
                          <div className={`guide ${guideDrag.axis} dragging${guideDrag.remove ? ' removing' : ''}${snap ? ' aligned' : ''}`} style={st} />
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
                  <div key={`snap${i}`} className={'guide-align v' + (l.kind === 'center' ? ' center' : l.kind === 'object' ? ' object' : '')} style={{ left: tx + l.at * zoom - 1, top: ty + l.from * zoom, width: 2, height: (l.to - l.from) * zoom }} />
                ) : (
                  <div key={`snap${i}`} className={'guide-align h' + (l.kind === 'center' ? ' center' : l.kind === 'object' ? ' object' : '')} style={{ left: tx + l.from * zoom, top: ty + l.at * zoom - 1, width: (l.to - l.from) * zoom, height: 2 }} />
                ),
              )}
              {spacingShown.length > 0 && (
                <svg className="spacing-layer" aria-hidden="true">
                  {spacingShown.map((m, i) => {
                    const a = m.axis === 'v' ? { x: tx + m.at * zoom, y: ty + m.from * zoom } : { x: tx + m.from * zoom, y: ty + m.at * zoom }
                    const b = m.axis === 'v' ? { x: a.x, y: ty + m.to * zoom } : { x: tx + m.to * zoom, y: a.y }
                    const len = Math.hypot(b.x - a.x, b.y - a.y)
                    const s = Math.max(2, Math.min(6, len / 3)) // arrowhead size
                    const [ux, uy] = m.axis === 'v' ? [0, 1] : [1, 0] // along the stretch
                    const [nx, ny] = [-uy, ux] // across it
                    const head = (at: { x: number; y: number }, dir: 1 | -1) =>
                      `${at.x},${at.y} ${at.x - dir * ux * s * 1.6 + nx * s},${at.y - dir * uy * s * 1.6 + ny * s} ${at.x - dir * ux * s * 1.6 - nx * s},${at.y - dir * uy * s * 1.6 - ny * s}`
                    const text = formatLength(m.value, doc.unit)
                    const w = text.length * 6.4 + 12
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                    // the number sits beside a vertical stretch and above a horizontal one
                    const box = m.axis === 'v' ? { x: mid.x + 8, y: mid.y - 9 } : { x: mid.x - w / 2, y: mid.y - 24 }
                    return (
                      <g key={`gap${i}`} className={'gap-mark' + (m.equal ? ' equal' : '')}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                        <line x1={a.x - nx * 5} y1={a.y - ny * 5} x2={a.x + nx * 5} y2={a.y + ny * 5} />
                        <line x1={b.x - nx * 5} y1={b.y - ny * 5} x2={b.x + nx * 5} y2={b.y + ny * 5} />
                        <polygon points={head(a, -1)} />
                        <polygon points={head(b, 1)} />
                        <rect x={box.x} y={box.y} width={w} height={18} rx={4} />
                        <text x={box.x + w / 2} y={box.y + 12.5} textAnchor="middle">
                          {text}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              )}
              {tool === 'pen' && freehandPreview && freehandPreview.points.length > 0 && penHover && !penDragging &&
                (() => {
                  const points = freehandPreview.points
                  const last = points[points.length - 1]
                  const first = points[0]
                  // near the first point (with a shape's worth of points) the next click closes the path
                  const closing = points.length >= 3 && Math.hypot(penHover.x - first.x, penHover.y - first.y) <= 10 / zoom
                  const to = closing ? first : penHover
                  const screen = (q: { x: number; y: number }) => ({ x: tx + q.x * zoom, y: ty + q.y * zoom })
                  const a = screen(last)
                  const b = screen(to)
                  const out = last.ho ? screen({ x: last.x + last.ho.x, y: last.y + last.ho.y }) : null
                  const into = closing && first.hi ? screen({ x: first.x + first.hi.x, y: first.y + first.hi.y }) : null
                  const d = out || into ? `M${a.x} ${a.y} C${(out ?? a).x} ${(out ?? a).y} ${(into ?? b).x} ${(into ?? b).y} ${b.x} ${b.y}` : `M${a.x} ${a.y} L${b.x} ${b.y}`
                  return (
                    <svg className="spacing-layer" aria-hidden="true">
                      <path d={d} className="pen-rubber" />
                      {closing && <circle cx={b.x} cy={b.y} r={8} className="pen-close-ring" />}
                    </svg>
                  )
                })()}
              {rotatePreview &&
                (() => {
                  const { cx, cy, w, h, startRotation, sweep } = rotatePreview
                  const sx = tx + cx * zoom
                  const sy = ty + cy * zoom
                  const sw = w * zoom
                  const sh = h * zoom
                  const r = Math.min(80, Math.max(24, Math.min(sw, sh) * 0.4))
                  const rad = (deg: number) => (deg * Math.PI) / 180
                  const p2 = { x: sx + r * Math.cos(rad(sweep)), y: sy + r * Math.sin(rad(sweep)) }
                  const largeArc = sweep > 180 ? 1 : 0
                  const wedge = `M${sx} ${sy} L${sx + r} ${sy} A${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`
                  return (
                    <svg className="spacing-layer" aria-hidden="true">
                      <rect x={sx - sw / 2} y={sy - sh / 2} width={sw} height={sh} className="rotate-ghost" transform={`rotate(${startRotation} ${sx} ${sy})`} />
                      <path d={wedge} className="rotate-wedge" />
                    </svg>
                  )
                })()}
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
        <DockingPanels
          panels={[
            {
              id: 'properties',
              label: 'מאפיינים',
              visible: true,
              content: (
                <>
                  {selGuides.length > 0 && (
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
                  {multiSel.length > 1 && (
                    <MultiSelectionPanel
                      count={multiSel.length}
                      shapeCount={shapes.filter((sh) => multiSel.includes(sh.id)).length}
                      onShapeOp={combineSelectedShapes}
                      onAlign={alignObjects}
                      canInsertImage={!!imageShapeMerge}
                      onInsertImage={insertImageIntoShape}
                      onDelete={() => deleteSelection(multiSel, [])}
                    />
                  )}
                  {selShape && (
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
                      linked={roundTogether}
                      onLinkedChange={(v) => {
                        setRoundTogether(v)
                        setCornerPick(null)
                      }}
                      cornersPicked={activeCornersOf(selShape.id).length < 4}
                      onPickAllCorners={() => setCornerPick(null)}
                      pathStyle={selShape.pathText ? pathStyleShown(selShape) : null}
                      pathScope={selShape.pathText && pathSel && pathSel.id === selShape.id && pathSel.a !== pathSel.b && pathSel.b <= selShape.pathText.text.length ? 'selection' : 'all'}
                      onPathChar={(patch) => applyPathChar(selShape.id, patch)}
                      onPathChange={(patch) => updatePathText(selShape.id, patch, `path:${selShape.id}`)}
                      onEditPath={() => setPathEdit(selShape.id)}
                      onRemovePath={() => {
                        onShapesChange(shapes.map((x) => (x.id === selShape.id ? { ...x, pathText: undefined } : x)))
                        setPathEdit(null)
                      }}
                    />
                  )}
                  {selImage && (
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
                  {!selImage && !selShape && selGuides.length === 0 && multiSel.length < 2 && (
                    <PropertiesPanel
                      frame={selFrame}
                      style={panelStyle}
                      scope={panelSel ? 'selection' : 'all'}
                      unit={doc.unit}
                      thread={threadInfo}
                      onGeometry={(patch) => selFrame && updateFrame(selFrame.id, patch, `geo:${selFrame.id}`)}
                      onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)}
                      sizeMixed={panelSizeMixed}
                      onSizeStep={(delta) => selFrame && stepFontSize(selFrame.id, delta)}
                      onAlign={(align) => selFrame && applyAlign(selFrame.id, align)}
                      onParagraphStyle={(patch) => selFrame && applyParagraphStyle(selFrame.id, patch)}
                      onArrange={(op) => selFrame && arrangeObject(selFrame.id, op)}
                      onLink={() => selFrame && setLinkFrom(selFrame.id)}
                      onUnlink={() => selFrame && onFramesChange(unlinkBefore(frames, selFrame.id))}
                    />
                  )}
                </>
              ),
            },
            {
              id: 'paragraph',
              label: 'פסקה',
              visible: true,
              content: <ParagraphPanel frame={selFrame} style={paragraphStyle} scope={panelSel ? 'selection' : 'all'} unit={doc.unit} onChange={(patch) => selFrame && applyParagraphStyle(selFrame.id, patch)} onSpacingChange={(patch) => selFrame && applyParaSpacing(selFrame.id, patch)} />,
            },
            {
              id: 'paragraph-styles',
              label: 'סגנונות פסקה',
              content: <ParagraphStylesPanel styles={paragraphStyles} unit={doc.unit} highlightId={highlightedStyleId} modified={styleHasOverrides} onApply={applyParagraphStyleToFrame} onChange={changeParagraphStyle} onCreate={createParagraphStyle} onDelete={(id) => deleteParagraphStyle(id)} onConfirmOverrides={commitParagraphOverrides} onDiscardOverrides={discardParagraphOverrides} />,
            },
            {
              id: 'style-manager',
              label: 'ניהול סגנונות',
              content: <StyleManagerPanel styles={paragraphStyles} onChange={changeParagraphStyle} onCreate={createManagedParagraphStyle} onSwap={swapParagraphStyles} onSwapOne={swapOneParagraphStyle} onBatch={batchSwapParagraphStyles} onFindStyle={findParagraphStyle} onTag={applyTagStyle} onFindTag={findTagOccurrence} onSwapOneTag={swapOneTagOccurrence} onClean={() => cleanSpacingCmd()} />,
            },
            {
              id: 'pages',
              label: 'עמודים',
              visible: true,
              content: <PagesPanel doc={doc} frames={frames} images={images} shapes={shapes} spreads={spreads} currentSpread={cur} selectedPages={selectedPages} onSelect={selectPage} onInsert={insertPages} onDelete={deleteSelectedPage} onMove={movePage} onView={(perRow) => { pageOps.setup({ ...doc, perRow, rowsCustom: false, pageJoins: [] }); window.setTimeout(() => fitSpread(), 80) }} />,
            },
            {
              id: 'color',
              label: 'צבע',
              content: <ColorToolsPanel tool={colorTool ?? 'color'} shape={selShape} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => selShape && updateShape(selShape.id, patch, `color-tool:${colorTool ?? 'color'}`)} />,
            },
            {
              id: 'gradient',
              label: 'מעבר צבע',
              content: <ColorToolsPanel tool="gradient" shape={selShape} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => selShape && updateShape(selShape.id, patch, 'color-tool:gradient')} />,
            },
            {
              id: 'swatches',
              label: 'דוגמיות',
              content: <ColorToolsPanel tool="swatches" shape={selShape} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => selShape && updateShape(selShape.id, patch, 'color-tool:swatches')} />,
            },
            {
              id: 'layers',
              label: 'שכבות',
              content: <LayersPanel frames={frames} images={images} shapes={shapes} selectedId={selectedId} activeLayerId={activeLayerId} onActiveLayer={setActiveLayerId} onSelect={setSelectedId} onVisibility={setLayerVisible} onLock={(locked) => { setLayerLocked(locked); if (locked) { setSelectedId(null); setMultiSel([]); setGuideSel([]) } }} onItemVisibility={(id, visible) => { setItemVisibility((current) => ({ ...current, [id]: visible })); if (!visible && selectedId === id) setSelectedId(null) }} onItemLock={(id, locked) => { setItemLocks((current) => ({ ...current, [id]: locked })); if (locked && selectedId === id) setSelectedId(null) }} />,
            },
          ]}
        />
      </div>

      {colorDialogTarget && (
        <ColorPickerDialog
          initial={colorDialogTarget === 'fill' ? selShape?.fill ?? '#0066ff' : selShape?.stroke ?? '#000000'}
          target={colorDialogTarget}
          onApply={(color) => {
            if (!selShape) return
            updateShape(selShape.id, colorDialogTarget === 'fill' ? { fill: color, fillGradient: undefined } : { stroke: color }, `color-dialog:${colorDialogTarget}`)
          }}
          onClose={() => setColorDialogTarget(null)}
        />
      )}

      {pathEdit &&
        (() => {
          const sh = shapes.find((x) => x.id === pathEdit)
          const pt = sh?.pathText
          if (!sh || !pt) return null
          return (
            <PathTextEditor
              text={pt.text}
              runs={normalizeRuns(pt.text, pt.runs, pt.style)}
              request={pathRequest && pathRequest.id === sh.id ? pathRequest : null}
              onEdit={(from, to, insert) => applyPathEdit(sh.id, from, to, insert)}
              onSelect={(a, b) => setPathSel((cur) => (cur && cur.id === sh.id && cur.a === a && cur.b === b ? cur : { id: sh.id, a, b }))}
              onStop={() => stopPathEdit(sh.id)}
            />
          )
        })()}
      {(toolDialog === 'pen' || toolDialog === 'pencil') && (
        <StrokeSettingsDialog
          toolName={toolDialog === 'pen' ? 'העט' : 'העיפרון'}
          value={drawingStrokeWidth}
          unit={doc.unit}
          pencil={toolDialog === 'pencil' ? pencilSettings : undefined}
          onPencilChange={setPencilSettings}
          onApply={setDrawingStrokeWidth}
          onClose={() => setToolDialog(null)}
        />
      )}
      {toolDialog && toolDialog !== 'pen' && toolDialog !== 'pencil' && (
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
