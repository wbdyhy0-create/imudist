import { repairImageStroke, type ImagePixelPoint } from '../imageRepair'
import { fontInstalled, useFontCatalog, weightName } from '../fonts'
import { runPreflight, type PreflightIssue } from '../preflight'
import { bridgeTransparentSeams, canvasDataUrl, captureObject, captureObjects, clipCanvasToBoxes, splitObjectCanvas, trimTransparentBounds, type CaptureItem, type MarqueeKind, type ScreenBox } from '../marquee'
import { applyFeatherCanvasMask } from '../feather'
import { paintImageStroke } from '../imagePaint'
import { removeImageBackground } from '../backgroundRemoval'
import { deliverPng } from '../pngExport'
import { hexToRgb, linearGradientLine, rgbToHex } from '../colorModels'
import { createPortal } from 'react-dom'
import { changedFootnoteOffset, footnoteDividerHeight, footnoteDividerTextStyle, footnoteTextStyle, formatFootnoteNumber, numberFootnotes, updateFootnoteParagraphStyle } from '../footnoteLayout'
import { layoutEndnotes } from '../endnotes'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import {
  DEFAULT_GUIDE_COLOR,
  DEFAULT_FOOTNOTE_CONFIG,
  KEEP_ALL_LINES,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_TEXT_STYLE,
  defaultTextStyle,
  DEFAULT_SPACE_AFTER,
  FOOTNOTE_MARKER,
  frameSpaceAfter,
  frameSpaceBefore,
  isFacing,
  MAX_GUIDES,
  MAX_PAGE_PT,
  MIN_FRAME_PT,
  marginsOf,
  maxMargin,
  minPageSize,
  pageSize,
  paraGaps as paraGapsOf,
  validateDoc,
  withPageMargins,
  withPageSize,
  type Asset,
  type Assets,
  type ColorSample,
  type CharStyle,
  type DocSettings,
  type Feather,
  type Guide,
  type GuideAxis,
  type FootnoteItem,
  type FootnoteLayoutConfig,
  type GradientFeather,
  type DrawKind,
  type PathGeom,
  type PathSmoothPoint,
  type PathText,
  type PathVertex,
  type ParentPage,
  type ShapeFrame,
  type Sides,
  type ImageFit,
  type ImageFrame,
  type LayerInfo,
  type PageSection,
  type Run,
  type CharacterStyleRecord,
  type CharacterStyleSettings,
  type TextAlign,
  type ParagraphBox,
  type TextFrame,
  type TextStyle,
  PAGE_NUMBER_MARKER,
  INTERNAL_PAGE_NUMBER_MARKER,
  LETTER_PAGE_NUMBER_MARKER,
  EXTERNAL_PAGE_NUMBER_MARKER,
  INTERNAL_LETTER_PAGE_NUMBER_MARKER,
  RUNNING_HEADER_MARKER,
  TOC_LEADER_MARKER,
  TOC_PAGE_MARKER,
  textFlowBoxOf,
  type TocConfig,
  type TocPageReference,
} from '../document'
import { editRangeInStory, reportIsViewOf } from '../oversetCaret'
import { isTyping } from '../dom'
import { HANDLES, angleOf, chainOf, dragBox, dragBoxUniform, headFrames, insetBox, linkFrames, normalizeDeg, removeFrame, rotateVec, styleOf, unlinkBefore, type Box, type HandleId, type RotateCorner } from '../frames'
import type { PlacedImage } from '../importImage'
import { countWords, type ImportedCharacterStyle, type ImportedParagraphStyle, type PlacedText } from '../importText'
import { applyGuideSpec, snapGuide, type GuideSnap } from '../guides'
import { computeLayout, pageMargins, pageSidesOf } from '../layout'
import { boxAtClick, columnBoxes, pourText, primaryTextFrameOrder, primaryTextFramePageGroups, type FlowMode } from '../placeText'
import { creationLayerOf, layerIdOf, layerViewsOf, isHiddenItem, isLockedItem } from '../layers'
import { detachedParentContent, ownerPage, pageRects, parentShadowContent, runningHeaderLookup, type ParentOverride, type ParentShadowRef } from '../pages'
import { plainTocHeading, sliceTocDisplayMarkers, tocDisplayMarkers } from '../toc'
import { caretOffsetAt } from '../richtext'
import { DEFAULT_PATH_TEXT_COLOR, DEFAULT_PATH_TEXT_STYLE, MIN_SPAN, nearestOnRing, pointInRing, ringInfo, snapTextToCenter, textPlacement, type Pt } from '../pathText'
import { boxFromEndpoints, CORNERS, editableRing, fitRadii, imageGeometry, lineEndpoints, regularRatio, replaceVertex, splitPathVerticesAt, vertexHi, vertexHo, vertexPoint, type ImageBox, type ShapePrefs } from '../shapes'
import { spacing, spacingMarksForSelection, type SpacingMark } from '../spacing'
import { expandGapObject, findGaps, moveGap, type GapMember, type GapObject, type GapRegion } from '../gapTool'
import { paragraphOverrides } from '../styleOverrides'
import { fitPath } from '../curveFit'
import { objectLines, snapEdges, snapLinesOf, type SnapLine } from '../snapping'
import { clipForToken, isClipToken, lastClip, setClip, type ClipObjects } from '../objectClipboard'
import { frameAsOwnStory } from '../storySlice'
import { BOOL_OP_NAMES, combineShapes, splitShapeByMask, type BoolOp } from '../shapeOps'
import { arrange, nextZ, stackOrder, type ArrangeOp } from '../stacking'
import { applyCharacterStyle, applyParagraphLook, atParaEnd, characterStyleIdsIn, charStyleOf, cleanSpacingPlan, clearCharacterStyle, clearParagraphFirstLineIndent, editStory, mergeRuns, normalizeRuns, paraIndexAt, paragraphsInRange, restyleRange, setParaOverride, sliceRuns, spliceParagraphStyles, spliceParaOverrides, styleAtChar, styleKeepOverride, styleRange, updateCharacterStyleRuns, withParaOverride } from '../story'
import { countParagraphLines, flowFrames, flowFramesWithFootnoteContinuation, lastLineWordCount, windowOffset, type FrameFlow } from '../textLayout'
import { openingRange, WINDOW_MAX_SHARE, type WindowTextOptions } from '../windowText'
import { collectHits, compilePattern, replaceInNote, replaceInStory, type StoryHits } from '../findReplace'
import type { VectorShapeData } from '../importEps'
import { floatsFor } from '../wrap'
import type { RichTextClipboard } from '../richTextClipboard'
import { ContextMenu } from './ContextMenu'
import { DockingPanels } from './DockingPanels'
import { GuidedToolTour } from './GuidedToolTour'
import { ColorToolsPanel } from './ColorToolsPanel'
import { ColorSamplerLens, type ColorSamplerPreview } from './ColorSamplerLens'
import { ContextToolbar } from './ContextToolbar'
import { FontPicker } from './FontPicker'
import type { AlignOp } from './AlignButtons'
import { MultiSelectionToolbar } from './MultiSelectionToolbar'
import { CreateGuidesDialog, type CreateGuidesRequest } from './CreateGuidesDialog'
import { SmartLayoutDialog, type SmartLayoutRequest } from './SmartLayoutDialog'
import { GuideProperties } from './GuideProperties'
import { ImageFrameView } from './ImageFrameView'
import { ImageProperties } from './ImageProperties'
import { MultiSelectionPanel } from './MultiSelectionPanel'
import { NumberField } from './NumberField'
import { FootnoteEditorDialog, FootnoteOptionsDialog } from './FootnoteDialogs'
import { ParagraphPanel } from './ParagraphPanel'
import { ParagraphStylesPanel, type ParagraphStyleRecord } from './ParagraphStylesPanel'
import { StyleManagerPanel } from './StyleManagerPanel'
import { PathTextEditor } from './PathTextEditor'
import { CORNER_HANDLE_OFFSET, MIN_CORNER_HANDLES, ShapeFrameView, type PathPeg } from './ShapeFrameView'
import { ShapeProperties } from './ShapeProperties'
import { ShapeToolDialog } from './ShapeToolDialog'
import { PagesPanel, type InsertWhere } from './PagesPanel'
import { LinksPanel, type LinkUse } from './LinksPanel'
import { embedLinkedAsset, pickOneImagePath, relinkAsset, updateLinkedAsset, useLinkWatcher } from '../imageLinks'
import { isTauri } from '../fileio'
import { LayersPanel } from './LayersPanel'
import { TocDialog } from './TocDialog'
import { InsertTableDialog, type InsertTableOptions } from './InsertTableDialog'
import { CharacterStylesPanel } from './CharacterStylesPanel'
import { applyNestedStyles } from '../nestedStyles'
import { descendantsOf, ownSettings, resolveCharacterPatch, resolvedRecords, withoutCharacterStyle } from '../characterStyleTree'
import { TableOptionsDialog } from './TableOptionsDialog'
import { CellOptionsDialog, type CellPatch } from './CellOptionsDialog'
import type { TableSelection } from './TableView'
import { createTable, deleteCols, deleteRows, expandRange, insertCols, insertRows, mergeRange, originsOf, patchCells, resolveCell, scaleTable, tableCols, tableRows, unmergeAt, type TableCell, type TableData } from '../table'
import { layoutOfShape } from '../tableLayout'
import { PageToolBar } from './PageToolBar'
import { PropertiesPanel } from './PropertiesPanel'
import type { SelRequest } from './RichEditor'
import { Ruler } from './Ruler'
import { RunningHeaderDialog } from './RunningHeaderDialog'
import { FirstWordStylerDialog, type FirstWordTarget } from './FirstWordStylerDialog'
import { WindowTextDialog, type WindowTextResult } from './WindowTextDialog'
import { FindReplacePanel, type FindSearch, type FindSummary } from './FindReplacePanel'
import { SpreadView } from './SpreadView'
import { StrokeSettingsDialog, type PencilSettings } from './StrokeSettingsDialog'
import { StatusBar, formatZoom } from './StatusBar'
import { UNIT_OPTIONS, formatLength, type Unit } from '../units'
import { TextFrameView } from './TextFrameView'
import { EndnotesPageView } from './EndnotesPageView'
import { FRAME_TOOL_KIND, TOOLS, Toolbox, type ToolId } from './Toolbox'
import type { PageOps, TabView } from '../useDocumentSession'

/** pasteboard around the pages, screen px */
const PAD = 120
const RULER = 20
/** for handler props a read-only render (a parent page's shadow on a document page) must supply but never fires */
const noop = () => {}
const FIT_MARGIN = 40
/** a dragged guide is held on another guide when it is this close, screen px */
const SNAP_PX = 6
/** thickness of the area that grabs a margin line, screen px */
const MARGIN_HIT = 9
const ZOOM_MIN = 0.05
const ZOOM_MAX = 40
const ZOOM_STEPS = [0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 40]

function textFrameResizeBox(orig: Box, mode: HandleId, dx: number, dy: number, shift: boolean, alt: boolean): Box {
  return shift && !alt
    ? dragBoxUniform(orig, mode, dx, dy, MIN_FRAME_PT)
    : dragBox(orig, mode, dx, dy, MIN_FRAME_PT, undefined, false)
}

interface MarqueeTarget {
  id: string
  kind: 'frame' | 'image' | 'shape'
  element: HTMLElement
  bounds: ScreenBox
  layerId?: string
  z: number
  name: string
}

interface MarqueeGesture {
  kind: MarqueeKind
  x0: number
  y0: number
  x1: number
  y1: number
  clientX0: number
  clientY0: number
  clientX1: number
  clientY1: number
}

interface FeatherTarget {
  id: string
  kind: 'frame' | 'image' | 'shape'
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  flipX?: boolean
  flipY?: boolean
}

interface FeatherDrag {
  target: FeatherTarget
  startClient: { x: number; y: number }
  endClient: { x: number; y: number }
  feather: GradientFeather
}

interface GapDrag {
  start: { x: number; y: number }
  gaps: GapRegion[]
  originals: GapObject[]
  key: string
  nearestOnly: boolean
  grabbedEdges: Partial<Record<'x' | 'y', 'before' | 'after'>>
}

interface GapCandidateCache {
  signature: readonly unknown[]
  bySpread: Map<number, GapObject[]>
}

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
const stepZoom = (z: number, dir: 1 | -1) =>
  dir > 0
    ? (ZOOM_STEPS.find((s) => s > z * 1.001) ?? ZOOM_MAX)
    : ([...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? ZOOM_MIN)

/** what the Table menu can do to the selected table */
/** the settings a character style can hold, as keys of a text's look */
const CHAR_LOOK_KEYS = ['fontFamily', 'fontSize', 'weight', 'italic', 'tracking', 'baselineShift', 'color', 'outlineColor', 'outlineWidth'] as const satisfies readonly (keyof CharacterStyleSettings)[]

export type TableOp = 'select-row' | 'select-column' | 'select-table' | 'row-above' | 'row-below' | 'col-start' | 'col-end' | 'delete-row' | 'delete-col' | 'merge' | 'unmerge' | 'options' | 'cell-options'

export interface WorkspaceHandle {
  /** show a problem of the preflight check: select what it is about and bring it to the middle of the view */
  goToIssue: (issue: PreflightIssue) => void
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
  /** zero-based page index nearest the center of the visible spread */
  currentPageIndex: () => number
  /** Ctrl+A while editing text: select the whole story (all frames of the thread) */
  selectAllText: () => void
  /** add one page after the selected page / delete the selected page */
  addPage: () => void
  deletePage: () => void
  /** move the selected object in the stacking order */
  arrange: (op: ArrangeOp) => void
  /** remove the background from the selected image */
  removeBackgroundFromSelection: () => void
  /** combine the selected shapes (unite, subtract, intersect, exclude) */
  shapeOp: (op: BoolOp) => void
  group: () => void
  ungroup: () => void
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
  insertRunningHeader: () => void
  insertTableOfContents: () => void
  firstWordStyler: () => void
  windowText: () => void
  /** table: open the dialog that adds one */
  insertTable: () => void
  /** table: a command on the selected table (and the cells picked in it) */
  tableCommand: (op: TableOp) => void
  findReplace: () => void
  canReplaceSelectedText: () => boolean
  replaceSelectedText: (placed: PlacedText) => boolean
  /** types the auto-page-number marker at the text caret (טיפוגרפיה > הוספת מספר עמוד אוטומטי) */
  insertPageNumberMarker: (kind?: 'document' | 'internal-number' | 'external-number' | 'internal-letter' | 'external-letter') => void
  /** opens the dialog for the "יתומים, אלמנות וכיווץ" tools (טיפוגרפיה) */
  openSmartLayout: () => void
  insertFootnote: () => void
  openFootnoteOptions: () => void
  /** center imported vector shapes in the visible workspace */
  placeVectorShapes: (shapes: VectorShapeData[]) => boolean
}

/**
 * Changes of the frames go through here. Changes that share a `key` and come close together (typing, dragging,
 * stepping a value) are merged into one undo step.
 */
export type FramesChange = (frames: TextFrame[], coalesceKey?: string, silent?: boolean) => void

interface Props {
  doc: DocSettings
  initiallySelectPrimaryFrame?: boolean
  onInitialSelectionApplied?: () => void
  startInitialTour?: boolean
  onInitialTourComplete?: () => void
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
  documentSessionId: number | null
  images: ImageFrame[]
  assets: Assets
  colorSamples: ColorSample[]
  onImagesChange: (images: ImageFrame[], coalesceKey?: string) => void
  onReplaceImageAsset: (docId: number, parentId: string | null, imageId: string, expectedAssetId: string, assetId: string, asset: Asset) => boolean
  onNotify: (message: string) => void
  onShowError: (title: string, error: unknown) => void
  /** pictures waiting to be placed (the loaded image cursor); the first is placed by the next click */
  placingImages: PlacedImage[]
  onPlacingImagesChange: (images: PlacedImage[]) => void
  guides: Guide[]
  onGuidesChange: (guides: Guide[], coalesceKey?: string) => void
  shapes: ShapeFrame[]
  /** `silent`: a follow-up the program makes by itself (a measurement kept up to date): it joins the undo step it follows */
  onShapesChange: (shapes: ShapeFrame[], coalesceKey?: string, silent?: boolean) => void
  layerOrder: string[]
  /** names, colours, hidden and locked of the layers, by id */
  layers: Record<string, LayerInfo>
  /** the layers in their new order and with their new names, colours, hidden and locked: one step of the history */
  onLayersChange: (layerOrder: string[], layers: Record<string, LayerInfo>, coalesceKey?: string) => void
  paragraphStyles: ParagraphStyleRecord[]
  /** the document's named character styles */
  characterStyles: CharacterStyleRecord[]
  onParagraphStylesChange: (styles: ParagraphStyleRecord[], coalesceKey?: string) => void
  /** the document's parent (master) pages */
  parents: ParentPage[]
  onParentsChange: (parents: ParentPage[], coalesceKey?: string) => void
  /** which parent applies to each document page, by index */
  pageParents: (string | null)[]
  onPageParentsChange: (pageParents: (string | null)[], coalesceKey?: string) => void
  /** independently-numbered runs of pages (Section Options) */
  sections: PageSection[]
  onSectionsChange: (sections: PageSection[], coalesceKey?: string) => void
  parentOverrides: ParentOverride[]
  /** the parent page open for editing instead of the document itself, or null while editing the document normally */
  editingParentId: string | null
  onEditParent: (id: string) => void
  onExitParentEdit: () => void
  /** the parent a click in "עמודי אב" marked "current": new pages get it automatically. Kept in App, not here,
   *  because editing a parent remounts this component (its `key` changes with `editingParentId`). */
  activeParentId: string | null
  onSelectParent: (id: string) => void
  /** which dock tab (מאפיינים / עמודים / …) is open, kept in App for the same reason: this component remounting
   *  (entering or leaving parent-edit mode) shouldn't close whatever panel the user had open */
  dockOpenId: string | null
  onDockOpenChange: (id: string | null) => void
  onDockPanelToggle: (id: string) => void
  enabledDockPanelIds: string[]
  dockTabOrder: string[]
  onDockTabOrderChange: (tabOrder: string[]) => void
  floatingDockPanelId: string | null
  onFloatingDockPanelChange: (id: string | null) => void
  floatingDockPosition: { x: number; y: number }
  onFloatingDockPositionChange: (position: { x: number; y: number }) => void
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
interface SampledTextDesign {
  character: CharStyle
  paragraph: {
    align: TextAlign
    leading?: number
    wordSpacingMin?: number
    wordSpacingMax?: number
    spaceBefore: number
    spaceAfter: number
    indentLeft?: number
    indentRight?: number
    firstLineIndent?: number
    secondLineIndent?: number
    windowIndent?: number
    windowWords?: number
  }
  keepFirstLines: number
  keepLastLines: number
  keepWithNext: number
  feather?: Feather
}

interface FootnoteSel {
  headId: string
  noteId: string
  a: number
  b: number
  allNotes?: boolean
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
  initiallySelectPrimaryFrame = false,
  onInitialSelectionApplied,
  startInitialTour = false,
  onInitialTourComplete,
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
  documentSessionId,
  images,
  assets,
  colorSamples,
  onImagesChange,
  onReplaceImageAsset,
  onNotify,
  onShowError,
  placingImages,
  onPlacingImagesChange,
  guides,
  onGuidesChange,
  shapes,
  onShapesChange,
  layerOrder,
  layers,
  onLayersChange,
  paragraphStyles,
  characterStyles,
  onParagraphStylesChange,
  parents,
  onParentsChange,
  pageParents,
  onPageParentsChange,
  sections,
  onSectionsChange,
  parentOverrides,
  editingParentId,
  onEditParent,
  onExitParentEdit,
  activeParentId,
  onSelectParent,
  dockOpenId,
  onDockOpenChange,
  onDockPanelToggle,
  enabledDockPanelIds,
  dockTabOrder,
  onDockTabOrderChange,
  floatingDockPanelId,
  onFloatingDockPanelChange,
  floatingDockPosition,
  onFloatingDockPositionChange,
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
  const fontCatalog = useFontCatalog()
  const [removingBackgroundId, setRemovingBackgroundId] = useState<string | null>(null)
  const previewClipId = useId().replace(/:/g, '')
  const [fontPreview, setFontPreview] = useState<{ frameId: string; family: string } | null>(null)
  const documentRects = useMemo(() => pageRects(doc), [doc])
  const [footnotePreviewConfig, setFootnotePreviewConfig] = useState<FootnoteLayoutConfig | null>(null)
  const footnoteConfig = footnotePreviewConfig ?? doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG
  const footnoteDividerHeading = footnoteConfig.dividerMode === 'heading' ? {
    text: footnoteConfig.dividerText,
    height: footnoteDividerHeight(footnoteConfig, paragraphStyles),
    style: footnoteDividerTextStyle(footnoteConfig, paragraphStyles),
    showLines: footnoteConfig.dividerHeadingLines,
    decoration: footnoteConfig.dividerHeadingDecoration,
  } : undefined
  // the offset `commitStory` just edited at, read (not a dependency) so typing one more character still only pays for
  // re-laying-out the frame it landed in and whatever follows - not the whole story's frames from its very start.
  // Safe when stale (e.g. after a resize instead of a text edit): flowFrames only reuses a frame's cached range when
  // its own full signature (size, floats, style...) still matches too, and re-verifies the reused text didn't change.
  const dirtyOffsetRef = useRef<number | undefined>(undefined)
  const primaryFrameIds = useMemo(() => primaryTextFrameOrder(doc, frames), [doc, frames])
  const sharedFootnoteGroups = useMemo(() => primaryTextFramePageGroups(doc, frames), [doc, frames])
  const provisionalFlow = useMemo(() => sharedFootnoteGroups.length
    ? flowFramesWithFootnoteContinuation(frames, images, footnoteConfig, new Map(), primaryFrameIds, paragraphStyles, dirtyOffsetRef.current, sharedFootnoteGroups)
    : flowFrames(frames, images, footnoteConfig, undefined, new Map(), paragraphStyles, dirtyOffsetRef.current), [frames, images, footnoteConfig, paragraphStyles, primaryFrameIds, sharedFootnoteGroups])
  const footnoteNumbers = useMemo(() => {
    const byId = new Map(frames.map((frame) => [frame.id, frame]))
    const entries = [...provisionalFlow].flatMap(([frameId, frameFlow]) => {
      const frame = byId.get(frameId)
      if (!frame) return []
      const page = ownerPage(documentRects, frame.x + frame.w / 2, frame.y + frame.h / 2)
      const pageRect = documentRects[page]
      const spread = pageRect ? Math.round(pageRect.y * 1000) : page
      return frameFlow.footnoteReferences.map((note) => ({ id: note.id, page, spread, frameX: frame.x, frameY: frame.y, anchor: note.anchor }))
    })
    return numberFootnotes(entries, footnoteConfig, doc.binding)
  }, [frames, provisionalFlow, documentRects, footnoteConfig, doc.binding])
  useEffect(() => {
    if (!doc.primaryTextFrame || previewMode || editingParentId || primaryFrameIds.length < 2) return
    const primaryFrames = primaryFrameIds.map((id) => frames.find((frame) => frame.id === id)).filter((frame): frame is TextFrame => !!frame)
    if (primaryFrames.filter((frame) => !!frame.text || !!frame.footnotes?.length).length > 1) return

    let nextFrames = frames
    for (let index = 0; index + 1 < primaryFrameIds.length; index++) {
      const fromId = primaryFrameIds[index]
      const toId = primaryFrameIds[index + 1]
      const from = nextFrames.find((frame) => frame.id === fromId)
      const to = nextFrames.find((frame) => frame.id === toId)
      if (!from || !to || from.next || to.text || to.footnotes?.length || nextFrames.some((frame) => frame.next === toId)) continue
      nextFrames = nextFrames.map((frame) => frame.id === fromId ? { ...frame, next: toId } : frame)
    }
    if (nextFrames !== frames) onFramesChange(nextFrames, 'primary-thread-migration')
  }, [doc.primaryTextFrame, previewMode, editingParentId, primaryFrameIds, frames, onFramesChange])
  const flow = useMemo(() => footnoteNumbers.size
    ? flowFramesWithFootnoteContinuation(frames, images, footnoteConfig, footnoteNumbers, primaryFrameIds, paragraphStyles, dirtyOffsetRef.current, sharedFootnoteGroups)
    : provisionalFlow, [frames, images, footnoteConfig, footnoteNumbers, primaryFrameIds, paragraphStyles, provisionalFlow, sharedFootnoteGroups])
  const endnotePages = useMemo(() => layoutEndnotes(doc, frames, footnoteConfig, footnoteNumbers, paragraphStyles), [doc, frames, footnoteConfig, footnoteNumbers, paragraphStyles])
  const viewDoc = useMemo(() => endnotePages.frames.length ? { ...doc, pages: doc.pages + endnotePages.frames.length } : doc, [doc, endnotePages.frames.length])
  const documentSpreads = useMemo(() => computeLayout(doc).spreads, [doc])
  const { spreads, bounds } = useMemo(() => computeLayout(viewDoc), [viewDoc])
  const rects = useMemo(() => pageRects(viewDoc), [viewDoc])
  // the check behind the status bar's light, run again whenever the document or its layout changes
  const fontAvailable = useMemo(() => {
    const installed = fontCatalog.status === 'system' ? new Set(fontCatalog.families.map((family) => family.family.toLowerCase())) : null
    return (family: string) => !!installed?.has(family.toLowerCase()) || fontInstalled(family)
  }, [fontCatalog])
  const preflightIssues = useMemo(
    () => runPreflight({ doc, frames, images, shapes, assets, flows: flow, pageRects: rects, isFontAvailable: fontAvailable }),
    [doc, frames, images, shapes, assets, flow, rects, fontAvailable],
  )
  useLinkWatcher(assets)
  const assetsRef = useRef(assets)
  assetsRef.current = assets
  /** where each linked picture is used, for the Links panel */
  const linkUses = useMemo(() => {
    const uses: Record<string, LinkUse[]> = {}
    const numbers = new Map(documentSpreads.flatMap((s) => s.pages.map((p) => [p.index, p.number] as const)))
    const pageAt = (x: number, y: number) => {
      const index = ownerPage(rects, x, y)
      return numbers.get(index) ?? index + 1
    }
    const add = (assetId: string, use: LinkUse) => void (assets[assetId]?.link && (uses[assetId] ??= []).push(use))
    for (const im of images) add(im.assetId, { id: im.id, page: pageAt(im.x + im.w / 2, im.y + im.h / 2) })
    for (const sh of shapes) if (sh.image) add(sh.image.assetId, { id: sh.id, page: pageAt(sh.x + sh.w / 2, sh.y + sh.h / 2) })
    for (const parent of parents) {
      for (const im of parent.images) add(im.assetId, { id: im.id, page: null, parentName: parent.name })
      for (const sh of parent.shapes) if (sh.image) add(sh.image.assetId, { id: sh.id, page: null, parentName: parent.name })
    }
    return uses
  }, [assets, images, shapes, parents, rects, documentSpreads])
  const tocMarkersByHead = useMemo(() => new Map(headFrames(frames).flatMap((head) => head.tocPageReferences?.length
    ? [[head.id, tocDisplayMarkers(head.tocPageReferences, head.text, 0, head.text.length, frames, flow, rects, sections, doc, doc.toc?.leader ?? '.', head.tocFootnoteReferences) ]]
    : [])), [frames, flow, rects, sections, doc])
  /** stacking rank of every object (1 = the back) */
  const rank = useMemo(() => new Map(stackOrder(frames, images, shapes, layerOrder).map((o, i) => [o.id, i + 1])), [frames, images, shapes, layerOrder])
  /** the page that Insert / Delete act on (the last one clicked) */
  const [selectedPage, setSelectedPage] = useState(0)
  /** the pages selected in the Pages panel; `selectedPage` is the one the selection grows from */
  const [pageSel, setPageSel] = useState<number[]>([])
  // `activeParentId` falls back to the first parent whenever it no longer exists (deleted, or none was ever
  // picked), instead of leaving new pages without a master for no visible reason.
  const effectiveActiveParent = activeParentId && parents.some((p) => p.id === activeParentId) ? activeParentId : (parents[0]?.id ?? null)
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
    const [textColorTarget, setTextColorTarget] = useState<'fill' | 'outline'>('fill')
  const [defaultShapePaint, setDefaultShapePaint] = useState<Partial<ShapeFrame>>({ fill: null, stroke: DEFAULT_SHAPE_STROKE })
  const [sampledShapeStyle, setSampledShapeStyle] = useState<{ sourceId: string; paint: Pick<ShapeFrame, 'fill' | 'fillGradient' | 'stroke' | 'strokeWidth' | 'strokeDash' | 'strokeCap' | 'opacity'> } | null>(null)
  useEffect(() => {
    if (tool !== 'eyedropper') setSampledShapeStyle(null)
  }, [tool])
  const [colorSamplerActive, setColorSamplerActive] = useState(false)
  const [rasterBrushColor, setRasterBrushColor] = useState<string | null>(null)
  const [colorSamplerPreview, setColorSamplerPreview] = useState<ColorSamplerPreview | null>(null)
  const colorSamplerLensRef = useRef<HTMLDivElement>(null)
  const samplerImageCache = useRef(new Map<string, Promise<HTMLCanvasElement>>())
  const samplerMoveToken = useRef(0)
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gapCancel.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      gapCancel.current()
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [])
  useEffect(() => {
    if (!colorSamplerActive && !rasterBrushColor) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setColorSamplerActive(false)
      setRasterBrushColor(null)
      setColorSamplerPreview(null)
      paintStroke.current = null
      setEraserPoint(null)
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [colorSamplerActive, rasterBrushColor])
  useEffect(() => {
    if (tool !== 'color' && tool !== 'gradient' && tool !== 'swatches') setRasterBrushColor(null)
  }, [tool])
  const [sampledTextStyle, setSampledTextStyle] = useState<SampledTextDesign | null>(null)
  const [space, setSpace] = useState(false)
  const [shiftPressed, setShiftPressed] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftPressed(true) }
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftPressed(false) }
    const onBlur = () => setShiftPressed(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  const parentShadowZ = doc.parentItemsAbovePageContent || shiftPressed ? rank.size + 1 : 0
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  /** the selected text frame or picture (guides have their own, multiple, selection) */
  const [selectedId, setSelectedIdRaw] = useState<string | null>(() =>
    initiallySelectPrimaryFrame ? primaryFrameIds[0] ?? null : null,
  )
  useEffect(() => {
    if (initiallySelectPrimaryFrame) onInitialSelectionApplied?.()
  }, [initiallySelectPrimaryFrame, onInitialSelectionApplied])
  const [isolatedGroupId, setIsolatedGroupId] = useState<string | null>(null)
  const [activeLayerId, setActiveLayerId] = useState('layer-1')
  const layerViews = useMemo(() => layerViewsOf(layerOrder, layers), [layerOrder, layers])
  const layerViewById = useMemo(() => new Map(layerViews.map((view) => [view.id, view])), [layerViews])
  // an object is shown unless it, or its layer, is hidden; it can be selected and changed unless it, or its layer, is locked
  const { itemVisibility, itemLocks } = useMemo(() => {
    const visibility: Record<string, boolean> = {}
    const locks: Record<string, boolean> = {}
    for (const item of [...frames, ...images, ...shapes]) {
      if (isHiddenItem(item, layerViewById, layerOrder)) visibility[item.id] = false
      if (isLockedItem(item, layerViewById, layerOrder)) locks[item.id] = true
    }
    return { itemVisibility: visibility, itemLocks: locks }
  }, [frames, images, shapes, layerViewById, layerOrder])
  // the thumbnails of the Pages panel draw what is shown, not what is hidden
  const shownFrames = useMemo(() => frames.filter((frame) => itemVisibility[frame.id] !== false), [frames, itemVisibility])
  const shownImages = useMemo(() => images.filter((image) => itemVisibility[image.id] !== false), [images, itemVisibility])
  const shownShapes = useMemo(() => shapes.filter((shape) => itemVisibility[shape.id] !== false), [shapes, itemVisibility])
  // new objects go on the active layer, or on the first open one when it is hidden or locked (what is made there could not be used)
  const creationLayerId = creationLayerOf(activeLayerId, layerViews)
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
  const [marqueeCut, setMarqueeCut] = useState<MarqueeGesture | null>(null)
  const marqueeCutRef = useRef<MarqueeGesture | null>(null)
  const [featherDrag, setFeatherDrag] = useState<FeatherDrag | null>(null)
  const featherDragRef = useRef<FeatherDrag | null>(null)
  /** the snapping lines of the document, and the ones an object is held on right now (drawn while dragging) */
  const snapLines = useMemo(() => snapLinesOf(doc, guides), [doc, guides])
  const snapLinesRef = useRef(snapLines)
  snapLinesRef.current = snapLines
  const [snapShown, setSnapShown] = useState<SnapLine[]>([])
  /** the gaps between the moved object and its neighbours (measured, and marked when equal) */
  const [spacingShown, setSpacingShown] = useState<SpacingMark[]>([])
  const [gapPreview, setGapPreview] = useState<GapRegion[]>([])
  const gapDrag = useRef<GapDrag | null>(null)
  const gapCancel = useRef<(() => void) | null>(null)
  const gapCandidatesCache = useRef<GapCandidateCache | null>(null)
  const gapHoverFrame = useRef<number | null>(null)
  const gapHoverPointer = useRef<{ point: { x: number; y: number }; nearestOnly: boolean } | null>(null)
  const applyGapRectsRef = useRef<(rectangles: GapObject[], key: string) => void>(() => {})
  const updateGapPreview = (next: GapRegion[]) => setGapPreview((current) => {
    const same = current.length === next.length && current.every((gap, index) => {
      const candidate = next[index]
      return gap.axis === candidate.axis && gap.x === candidate.x && gap.y === candidate.y && gap.w === candidate.w && gap.h === candidate.h &&
        gap.beforeIds.length === candidate.beforeIds.length && gap.beforeIds.every((id, idIndex) => id === candidate.beforeIds[idIndex]) &&
        gap.afterIds.length === candidate.afterIds.length && gap.afterIds.every((id, idIndex) => id === candidate.afterIds[idIndex])
    })
    return same ? current : next
  })
  /** text on the outline of a shape: the shape being edited, the selected range of its text, the caret request, and whether the pointer is over an outline (for the cursor) */
  const [pathEdit, setPathEdit] = useState<string | null>(null)
  const [pathSel, setPathSel] = useState<{ id: string; a: number; b: number } | null>(null)
  const [pathRequest, setPathRequest] = useState<(SelRequest & { id: string }) | null>(null)
  const pathRequestToken = useRef(0)
  const [pathHover, setPathHover] = useState(false)
  const [scissorHover, setScissorHover] = useState(false)
  const eraserDragging = useRef(false)
  const eraserDragKey = useRef<string | null>(null)
  const eraserPreviousPoint = useRef<{ x: number; y: number } | null>(null)
  const repairStroke = useRef<{ id: string; assetId: string; points: ImagePixelPoint[]; radius: number } | null>(null)
  const paintStroke = useRef<{ kind: 'image' | 'shape'; id: string; assetId: string; points: ImagePixelPoint[]; radius: number; color: string; strength: number } | null>(null)
  const [eraserRadius, setEraserRadius] = useState(12)
  const [rasterBrushStrength, setRasterBrushStrength] = useState(100)
  const [eraserPoint, setEraserPoint] = useState<{ x: number; y: number } | null>(null)
  const activateTool = useCallback((nextTool: ToolId) => {
    setTool(nextTool)
    if (nextTool === 'color' || nextTool === 'gradient' || nextTool === 'swatches') return
    setColorSamplerActive(false)
    setRasterBrushColor(null)
    setColorSamplerPreview(null)
    setEraserPoint(null)
  }, [])
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
  const [objectMenu, setObjectMenu] = useState<{ x: number; y: number; sourceShapeId?: string; targetShapeId?: string; textFrameId?: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // the newest editing frame, for the selection drag: RichEditor keeps calling the callback it had when it was last
  // rendered even after it unmounts (the drag moved editing to another frame), so a closure over `editingId` is stale there
  const editingIdRef = useRef<string | null>(null)
  editingIdRef.current = editingId
  /** an out-port was clicked: the next click on a frame continues the text there */
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  /** where the editor should put its selection (and in which frame) */
  const [request, setRequest] = useState<(SelRequest & { frameId: string }) | null>(null)
  const requestToken = useRef(0)
  /**
   * The caret is in text that does not fit in any frame (typing on after the last line a frame holds). The editor can only show
   * a caret in what the frame shows, so it is put at the end of that, and what the editor then says about the caret is not the
   * caret's place: the real one stays in `textSel` until the user moves it (clicks, or a key takes the caret off the end).
   */
  const oversetCaret = useRef(false)
  /** the selected text of a story — what the panel's character controls apply to */
  const [textSel, setTextSel] = useState<TextSel | null>(null)
  const [footnoteSel, setFootnoteSel] = useState<FootnoteSel | null>(null)
  const [editingFootnoteId, setEditingFootnoteId] = useState<string | null>(null)
  const [editingFootnoteFrameId, setEditingFootnoteFrameId] = useState<string | null>(null)
  const [editingFootnoteOffset, setEditingFootnoteOffset] = useState<number | null>(null)
  const [footnoteRequest, setFootnoteRequest] = useState<{ noteId: string; frameId: string; a: number; b: number; token: number } | null>(null)
  const styleSearchIndex = useRef<Record<string, number>>({})
  /** which occurrence of the tag search (ניהול סגנונות > כלים) the explorer is on, per tag text */
  const tagSearchIndex = useRef<Record<string, number>>({})
  /** rubber-band rectangle (world pt) while dragging a new text frame with the Type tool */
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const createStart = useRef<{ x: number; y: number } | null>(null)
  /** moving a frame ("move") or resizing it by a handle, with the Selection tool */
  const frameDrag = useRef<{ id: string; mode: 'move' | HandleId; start: { x: number; y: number }; orig: Box; key: string; kind: 'frame' | 'image' | 'shape'; table?: TableData; origTextScale?: { x: number; y: number } } | null>(null)
  const [graphicFrameHandleDragging, setGraphicFrameHandleDragging] = useState(false)
  /** turning a frame, a picture or a shape around its own centre, from one of its rotate handles */
  const rotateDrag = useRef<{ id: string; kind: 'frame' | 'image' | 'shape'; center: { x: number; y: number }; startAngle: number; startRotation: number; key: string } | null>(null)
  /** The "fine outline" rotation guides professional layout tools show: a faint outline of the object's box at the angle this drag
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
   *  (as professional layout tools do) — world point of the moving end, and the angle to show there */
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
  const [runningHeaderDialog, setRunningHeaderDialog] = useState(false)
  const [tocDialogOpen, setTocDialogOpen] = useState(false)
  const [firstWordDialog, setFirstWordDialog] = useState(false)
  const [windowTextDialog, setWindowTextDialog] = useState(false)
  const [insertTableOpen, setInsertTableOpen] = useState(false)
  const [tableOptionsOpen, setTableOptionsOpen] = useState(false)
  const [cellOptionsOpen, setCellOptionsOpen] = useState(false)
  /** the cells picked in the selected table */
  const [tableSel, setTableSel] = useState<(TableSelection & { id: string }) | null>(null)
  const [tableMenu, setTableMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  /** bumped on every open, so the panel starts afresh (and takes the focus) even when it was already there */
  const [findKey, setFindKey] = useState(0)
  const [findSeed, setFindSeed] = useState('')
  /** the part of one story "selection only" searches: taken when the user picks that, so stepping through matches (which selects them) does not narrow it */
  const findRange = useRef<{ headId: string; a: number; b: number } | null>(null)
  /** a search to step on from once the text it just changed has been laid out again */
  const pendingFind = useRef<FindSearch | null>(null)
  const [footnoteDialog, setFootnoteDialog] = useState<{ headId: string; from: number; to: number; noteId?: string; initial: string; initialRuns?: Run[] } | null>(null)
  const [footnoteOptionsOpen, setFootnoteOptionsOpen] = useState(false)
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(1)
  const [pencilSettings, setPencilSettings] = useState<PencilSettings>({ fidelity: 2.5, smoothness: 65, cap: 'round', editSelected: true, within: 12 })
  /** dragging one margin line of the Page tool: which side (physical) and the page it is on */
  /** the dragged page has the same height as the pages beside it: where the dashed line goes (world y) and how far it reaches */
  const [pageSnap, setPageSnap] = useState<{ world: number; span: [number, number]; height: number } | null>(null)
  const marginDrag = useRef<{ edge: keyof Sides; page: number; key: string } | null>(null)
  /** a guide being dragged out of a ruler or moved (not yet stored); `remove` = it is over a ruler / panel, so letting go deletes it */
  const [guideDrag, setGuideDrag] = useState<{ id: string | null; axis: GuideAxis; page: number; pos: number; color: string; remove: boolean; snap: GuideSnap | null; centerSnap: boolean } | null>(null)
  /** the color new guides get: the last one the user chose */
  const [guideColor, setGuideColor] = useState(DEFAULT_GUIDE_COLOR)
  const [guidesDialog, setGuidesDialog] = useState(false)
  const [smartLayoutDialog, setSmartLayoutDialog] = useState(false)
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

  /** from the list of problems: select what a problem is about and bring it to the middle of the view */
  const goToIssue = (issue: PreflightIssue) => {
    setEditingId(null)
    setSelectedPage(issue.page)
    if (!issue.target) {
      goTo(spreadOfPage(issue.page))
      return
    }
    setSelectedId(issue.target.id)
    const target = [...frames, ...images, ...shapes].find((item) => item.id === issue.target!.id)
    if (target) applyView(zoom, target.x + target.w / 2, target.y + target.h / 2, vp.w / 2, vp.h / 2)
    else goTo(spreadOfPage(issue.page))
  }

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
  /**
   * `master`: which parent to give the new pages. Left out, they get whichever parent is currently marked "current"
   * in "עמודי אב" (a click there, not a click on a document page) - so a run of added pages keeps using the same
   * master without picking it again each time. Passed explicitly (including `null` for "none"), that choice is
   * used instead.
   */
  const insertPages = (count: number, where: InsertWhere, master?: string | null, pageIndex?: number) => {
    if (doc.pages >= 9999) return
    // "beside": the new page stands in the row of the selected page (to its left in a right-to-left document)
    const anchorPage = pageIndex ?? selPage
    const at = where === 'end' ? doc.pages : where === 'before' ? anchorPage : anchorPage + 1
    const pageToShow = Math.min(doc.pages + count - 1, where === 'before' ? at + count : at)
    const parentId = master !== undefined ? master : effectiveActiveParent
    pendingNav.current = pageToShow
    setSelectedPage(pageToShow)
    setPageSel([pageToShow])
    pageOps.insert(at, count, where === 'beside', parentId)
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
  const updateFrame = (id: string, patch: Partial<TextFrame>, key?: string) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'footnotes')) {
      const frame = frames.find((candidate) => candidate.id === id)
      dirtyOffsetRef.current = changedFootnoteOffset(frame?.footnotes ?? [], patch.footnotes ?? [])
    }
    onFramesChange(frames.map((f) => (f.id === id ? { ...f, ...patch } : f)), key)
  }

  const setFrameTextScale = (id: string, axis: 'x' | 'y', percent: number) => {
    const frame = frames.find((candidate) => candidate.id === id)
    if (!frame) return
    const scale = Math.min(10, Math.max(0.1, percent / 100))
    const next = { x: frame.textScale?.x ?? 1, y: frame.textScale?.y ?? 1, [axis]: scale }
    // a text at 100% both ways is just a text: no scale to keep
    updateFrame(id, { textScale: Math.abs(next.x - 1) < 1e-6 && Math.abs(next.y - 1) < 1e-6 ? undefined : next }, `text-scale:${id}:${axis}`)
  }

  const askSelection = (frameId: string, a: number, b: number) => {
    requestToken.current += 1
    setRequest({ frameId, a, b, token: requestToken.current })
  }

  const alignFootnotesToMarkers = (text: string, notes: FootnoteItem[]) => {
    const markers: number[] = []
    for (let index = 0; index < text.length; index++) if (text[index] === FOOTNOTE_MARKER) markers.push(index)
    return notes
      .slice()
      .sort((a, b) => a.anchor - b.anchor)
      .slice(0, markers.length)
      .map((note, index) => ({ ...note, anchor: markers[index] }))
  }

  /**
   * Store a story's new text and runs. `abs` is where the caret goes, as an offset into the new story. The text may
   * have reflowed, so the caret (and the editing focus) moves to whichever frame now contains that offset.
   * `paraOverrides`, when given, replaces the head frame's per-paragraph spaceBefore/spaceAfter overrides too (see
   * `applyEdit`, the one caller that has them — spliced to stay lined up with the story's new paragraphs).
   */
  const commitStory = (headId: string, text: string, runs: Run[], abs: number, key: string, paraOverrides?: { paraSpaceBefore?: (number | null)[]; paraSpaceAfter?: (number | null)[]; paraKeepFirstLines?: (number | null)[]; paraKeepLastLines?: (number | null)[]; paraKeepWithNext?: (number | null)[] } & Pick<TextFrame, 'paragraphStyleIds' | 'paragraphStyleNames' | 'paragraphStylePatches' | 'footnotes'>, dirtyOffset?: number) => {
    dirtyOffsetRef.current = dirtyOffset
    const next = frames.map((f) => (f.id === headId ? { ...f, text, runs, ...paraOverrides } : f))
    const nf = flowFrames(next, images, doc.footnotes, undefined, new Map(), paragraphStyles, dirtyOffset)
    const chain = chainOf(next, headId)
    const target =
      chain.find((f) => abs < nf.get(f.id)!.end) ?? chain.find((f) => nf.get(f.id)!.end >= text.length) ?? chain[chain.length - 1]
    const tf = nf.get(target.id)!
    const pos = Math.max(0, Math.min(abs - tf.start, tf.slice.length))
    oversetCaret.current = abs > tf.end
    askSelection(target.id, pos, pos)
    setTextSel({ headId, a: abs, b: abs })
    setEditingId(target.id)
    setSelectedId(target.id)
    onFramesChange(next, key)
  }

  /** Replace [from, to) of a story with `insert`. */
  const applyEdit = (headId: string, from: number, to: number, insert: string, newFootnote?: Omit<FootnoteItem, 'anchor'>, formatted?: RichTextClipboard) => {
    const head = frames.find((f) => f.id === headId)
    if (!head) return
    const r = editStory(head.text, head.runs, from, to, insert, head)
    const formattedPaste = formatted?.text === insert && formatted.runs.reduce((length, run) => length + run.len, 0) === insert.length
      ? formatted
      : undefined
    // Enter at the end of a paragraph whose style names a different "next style" (as in professional layout tools): the new paragraph follows
    // that one instead of just repeating this one's, and the "\n" just typed is restyled to it too, so whatever gets
    // typed next already looks right (editStory picks new text's look from the character right before it - the "\n")
    let base = head
    let runs = r.runs
    let nextStyleAt: { index: number; style: ParagraphStyleRecord } | null = null
    if (!formattedPaste && insert === '\n' && from === to && atParaEnd(head.text, from)) {
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
        const charKeys = ['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'] as const
        const charPatch = Object.fromEntries(charKeys.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]])) as Partial<CharStyle>
        // what the style being left set and the next one leaves alone goes back to plain, same as clicking a style does
        const leaving = source ? resolveParagraphStyle(source.id) : {}
        if (leaving.weight !== undefined && charPatch.weight === undefined) charPatch.weight = 400
        if (leaving.italic !== undefined && charPatch.italic === undefined) charPatch.italic = false
        if (leaving.tracking !== undefined && charPatch.tracking === undefined) charPatch.tracking = 0
        if (leaving.outlineWidth !== undefined && charPatch.outlineWidth === undefined) charPatch.outlineWidth = 0
        if (leaving.outlineColor !== undefined && charPatch.outlineColor === undefined) charPatch.outlineColor = '#000000'
        runs = styleRange(runs, from, from + 1, charPatch)
      }
    }
    if (formattedPaste) {
      runs = mergeRuns([
        ...sliceRuns(r.runs, 0, from),
        ...formattedPaste.runs,
        ...sliceRuns(r.runs, from + insert.length, r.text.length),
      ])
    }
    const paragraphLists = spliceParagraphStyles(base, base.text, from, to, insert)
    const shift = insert.length - (to - from)
    const footnotes = (head.footnotes ?? []).flatMap((note) => {
      if (note.anchor >= from && note.anchor < to) return []
      const moves = note.anchor >= to || (from === to && note.anchor >= from)
      return [{ ...note, anchor: note.anchor + (moves ? shift : 0) }]
    })
    if (newFootnote) footnotes.push({ ...newFootnote, anchor: from })
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
    let copiedParagraphOverrides: Pick<TextFrame, 'paraSpaceBefore' | 'paraSpaceAfter' | 'paraKeepFirstLines' | 'paraKeepLastLines' | 'paraKeepWithNext'> = {}
    if (formattedPaste) {
      const paragraphCount = r.text.split('\n').length
      const pastedAt = paraIndexAt(head.text, from)
      const ids = Array.from({ length: paragraphCount }, (_, index) => paragraphLists.paragraphStyleIds?.[index] ?? paragraphStyleIdOf(head, index) ?? '')
      const names = Array.from({ length: paragraphCount }, (_, index) => paragraphLists.paragraphStyleNames?.[index] ?? paragraphStyles.find((style) => style.id === ids[index])?.name ?? '')
      const patches = Array.from({ length: paragraphCount }, (_, index) => paragraphLists.paragraphStylePatches?.[index] ?? head.paragraphStylePatches?.[index] ?? {})
      formattedPaste.paragraphs.forEach((paragraph, index) => {
        const target = pastedAt + index
        if (target >= paragraphCount) return
        ids[target] = paragraph.styleId
        names[target] = paragraph.styleName
        patches[target] = paragraph.patch
      })
      paragraphLists.paragraphStyleIds = ids.some(Boolean) ? ids : undefined
      paragraphLists.paragraphStyleNames = names.some(Boolean) ? names : undefined
      paragraphLists.paragraphStylePatches = patches.some((patch) => Object.keys(patch).length > 0) ? patches : undefined
      const copyOverrides = (source: (number | null)[] | undefined, key: keyof RichTextClipboard['paragraphs'][number]) => {
        const values = Array.from({ length: paragraphCount }, (_, index) => source?.[index] ?? null)
        formattedPaste.paragraphs.forEach((paragraph, index) => {
          const target = pastedAt + index
          if (target < paragraphCount) values[target] = paragraph[key] as number | null
        })
        return values.some((value) => value !== null) ? values : undefined
      }
      copiedParagraphOverrides = {
        paraSpaceBefore: copyOverrides(spliceParaOverrides(head.paraSpaceBefore, head.text, from, to, insert), 'spaceBefore'),
        paraSpaceAfter: copyOverrides(spliceParaOverrides(head.paraSpaceAfter, head.text, from, to, insert), 'spaceAfter'),
        paraKeepFirstLines: copyOverrides(spliceParaOverrides(head.paraKeepFirstLines, head.text, from, to, insert, true), 'keepFirstLines'),
        paraKeepLastLines: copyOverrides(spliceParaOverrides(head.paraKeepLastLines, head.text, from, to, insert, true), 'keepLastLines'),
        paraKeepWithNext: copyOverrides(spliceParaOverrides(head.paraKeepWithNext, head.text, from, to, insert), 'keepWithNext'),
      }
    }
    // nested styles follow ordinary typing; a formatted paste keeps the source's exact character runs.
    const touched = new Set<number>()
    for (let index = paraIndexAt(r.text, from), last = paraIndexAt(r.text, from + insert.length); index <= last; index++) touched.add(index)
    if (!formattedPaste) runs = applyNestedToFrame({ ...head, ...paragraphLists, text: r.text, runs, footnotes }, paragraphStyles, undefined, touched).runs ?? runs
    commitStory(headId, r.text, runs, from + insert.length, `type:${headId}`, {
      paraSpaceBefore: spliceParaOverrides(head.paraSpaceBefore, head.text, from, to, insert),
      paraSpaceAfter: spliceParaOverrides(head.paraSpaceAfter, head.text, from, to, insert),
      paraKeepFirstLines: spliceParaOverrides(head.paraKeepFirstLines, head.text, from, to, insert, true),
      paraKeepLastLines: spliceParaOverrides(head.paraKeepLastLines, head.text, from, to, insert, true),
      paraKeepWithNext: spliceParaOverrides(head.paraKeepWithNext, head.text, from, to, insert),
      ...paragraphLists,
      ...copiedParagraphOverrides,
      footnotes: alignFootnotesToMarkers(r.text, footnotes),
    }, from)
  }

  const insertFootnote = () => {
    if (!textSel) return
    const head = frames.find((frame) => frame.id === textSel.headId)
    if (!head) return
    setFootnoteDialog({ headId: head.id, from: textSel.a, to: textSel.b, initial: '' })
  }

  const editFootnote = (headId: string, noteId: string, frameId: string, localOffset: number, fragmentOffset: number) => {
    const note = frames.find((frame) => frame.id === headId)?.footnotes?.find((item) => item.id === noteId)
    if (!note) return
    const caret = Math.max(0, Math.min(localOffset, note.content.length - fragmentOffset))
    requestToken.current += 1
    setLinkFrom(null)
    setTool('type')
    setSelectedId(headId)
    setEditingId(null)
    setTextSel(null)
    setFootnoteSel({ headId, noteId, a: fragmentOffset + caret, b: fragmentOffset + caret })
    setEditingFootnoteId(noteId)
    setEditingFootnoteFrameId(frameId)
    setEditingFootnoteOffset(fragmentOffset)
    setFootnoteRequest({ noteId, frameId, a: caret, b: caret, token: requestToken.current })
  }

  const selectAllFootnote = (headId: string, noteId: string) => {
    const head = frames.find((frame) => frame.id === headId)
    const note = head?.footnotes?.find((item) => item.id === noteId)
    if (head && note) setFootnoteSel({ headId: head.id, noteId, a: 0, b: note.content.length, allNotes: true })
  }

  const applyFootnoteEdit = (headId: string, noteId: string, from: number, to: number, insert: string) => {
    const head = frames.find((frame) => frame.id === headId)
    const note = head?.footnotes?.find((item) => item.id === noteId)
    if (!head || !note) return
    const baseStyle = note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)
    const result = editStory(note.content, note.runs ?? [], from, to, insert, baseStyle)
    const caret = from + insert.length
    updateFrame(head.id, { footnotes: head.footnotes?.map((item) => item.id === noteId ? { ...item, content: result.text, runs: result.runs } : item) }, `footnote:${noteId}`)
    setFootnoteSel({ headId, noteId, a: caret, b: caret })
    if (editingFootnoteId === noteId && editingFootnoteFrameId) {
      requestToken.current += 1
      const fragmentOffset = editingFootnoteOffset ?? 0
      const localCaret = Math.max(0, Math.min(caret - fragmentOffset, result.text.length - fragmentOffset))
      setFootnoteRequest({ noteId, frameId: editingFootnoteFrameId, a: localCaret, b: localCaret, token: requestToken.current })
    }
  }

  const applyFootnoteCharStyle = (patch: Partial<CharStyle>) => {
    if (!footnoteSel) return
    const head = frames.find((frame) => frame.id === footnoteSel.headId)
    const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
    if (!head || !note) return
    const selectedNotes = new Set(footnoteSel.allNotes ? (head.footnotes ?? []).map((item) => item.id) : [note.id])
    const nextFootnotes = (head.footnotes ?? []).map((item) => {
      if (!selectedNotes.has(item.id)) return item
      const base = item.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, item.paragraphStyleId)
      const runs = normalizeRuns(item.content, item.runs, base)
      const selected = footnoteSel.allNotes || (footnoteSel.a !== footnoteSel.b && item.id === note.id)
      const wholeNoteSelected = footnoteSel.allNotes || (item.id === note.id && footnoteSel.a === 0 && footnoteSel.b === item.content.length)
      const from = selected && !footnoteSel.allNotes ? Math.min(footnoteSel.a, footnoteSel.b) : 0
      const to = selected && !footnoteSel.allNotes ? Math.max(footnoteSel.a, footnoteSel.b) : item.content.length
      const nextRuns = styleRange(runs, from, to, patch)
      const nextStyle = patch.fontSize !== undefined && wholeNoteSelected ? { ...(item.style ?? base), ...patch } : selected ? item.style : { ...base, ...patch }
      return { ...item, runs: nextRuns, ...(nextStyle ? { style: nextStyle } : {}) }
    })
    updateFrame(head.id, { footnotes: nextFootnotes }, `footnote-style:${footnoteSel.allNotes ? 'all' : note.id}:${Object.keys(patch).join(',')}`)
  }

  const stepFootnoteFontSize = (delta: number) => {
    if (!footnoteSel) return
    const head = frames.find((frame) => frame.id === footnoteSel.headId)
    const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
    if (!head || !note) return
    const size = (value: number) => Math.max(1, Math.min(999, value + delta))
    const selectedNotes = new Set(footnoteSel.allNotes ? (head.footnotes ?? []).map((item) => item.id) : [note.id])
    const nextFootnotes = (head.footnotes ?? []).map((item) => {
      if (!selectedNotes.has(item.id)) return item
      const base = item.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, item.paragraphStyleId)
      const runs = normalizeRuns(item.content, item.runs, base)
      const selected = footnoteSel.allNotes || (footnoteSel.a !== footnoteSel.b && item.id === note.id)
      const wholeNoteSelected = footnoteSel.allNotes || (item.id === note.id && footnoteSel.a === 0 && footnoteSel.b === item.content.length)
      const from = selected && !footnoteSel.allNotes ? Math.min(footnoteSel.a, footnoteSel.b) : 0
      const to = selected && !footnoteSel.allNotes ? Math.max(footnoteSel.a, footnoteSel.b) : item.content.length
      const nextRuns = restyleRange(runs, from, to, (style) => ({ fontSize: size(style.fontSize) }))
      const nextStyle = wholeNoteSelected ? { ...(item.style ?? base), fontSize: size(base.fontSize) } : selected ? item.style : { ...base, fontSize: size(base.fontSize) }
      return { ...item, runs: nextRuns, ...(nextStyle ? { style: nextStyle } : {}) }
    })
    updateFrame(head.id, { footnotes: nextFootnotes }, `footnote-style:${footnoteSel.allNotes ? 'all' : note.id}:fontSizeStep`)
  }

  const applyFootnoteParagraphStyle = (patch: Partial<TextStyle>) => {
    if (!footnoteSel) return
    const head = frames.find((frame) => frame.id === footnoteSel.headId)
    const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
    if (!head || !note) return
    const selectedNotes = new Set(footnoteSel.allNotes ? (head.footnotes ?? []).map((item) => item.id) : [note.id])
    updateFrame(head.id, { footnotes: head.footnotes?.map((item) => selectedNotes.has(item.id) ? { ...item, style: { ...(item.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, item.paragraphStyleId)), ...patch } } : item) }, `footnote-paragraph:${footnoteSel.allNotes ? 'all' : note.id}`)
  }

  const saveFootnote = (content: string, runs: Run[]) => {
    if (!footnoteDialog) return
    if (footnoteDialog.noteId) {
      const head = frames.find((frame) => frame.id === footnoteDialog.headId)
      if (head) updateFrame(head.id, { footnotes: head.footnotes?.map((note) => note.id === footnoteDialog.noteId ? { ...note, content, runs } : note) })
    } else {
      applyEdit(footnoteDialog.headId, footnoteDialog.from, footnoteDialog.to, FOOTNOTE_MARKER, { id: newFrameId(), content, runs })
    }
    setFootnoteDialog(null)
  }

  const deleteFootnote = () => {
    if (!footnoteDialog?.noteId) return
    const head = frames.find((frame) => frame.id === footnoteDialog.headId)
    const note = head?.footnotes?.find((item) => item.id === footnoteDialog.noteId)
    if (head && note) applyEdit(head.id, note.anchor, note.anchor + 1, '')
    setFootnoteDialog(null)
  }

  const saveFootnoteOptions = (config: FootnoteLayoutConfig) => {
    pageOps.setup({ ...doc, footnotes: config }, 'footnotes:options')
    setFootnotePreviewConfig(null)
    setFootnoteOptionsOpen(false)
  }

  const commitFootnoteWidth = (widthScale: number) => {
    pageOps.setup({ ...doc, footnotes: { ...(doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG), widthScale } }, 'footnotes:width')
    setFootnotePreviewConfig(null)
  }

  /** an edit reported by a frame's editor: offsets are inside that frame's part of the story */
  const handleEdit = (frameId: string, from: number, to: number, insert: string) => {
    const fl = flow.get(frameId)
    if (!fl) return
    // a selection across a thread (Ctrl+A) is what the edit replaces; a caret in text no frame shows is where it is made
    const { a, b } = editRangeInStory(fl, from, to, textSel?.headId === fl.headId ? textSel : null, oversetCaret.current)
    applyEdit(fl.headId, a, b, insert)
  }

  const handlePasteFormattedText = (frameId: string, from: number, to: number, clipboard: RichTextClipboard) => {
    const fl = flow.get(frameId)
    if (!fl) return
    const { a, b } = editRangeInStory(fl, from, to, textSel?.headId === fl.headId ? textSel : null, oversetCaret.current)
    applyEdit(fl.headId, a, b, clipboard.text, undefined, clipboard)
  }

  /**
   * טיפוגרפיה > הוספת מספר עמוד אוטומטי: types the auto-page-number marker at the caret, exactly like any other
   * character (see document.ts's PAGE_NUMBER_MARKER) - only meaningful while typing is possible, i.e. a text frame
   * is actually being edited and has a caret/selection of its own.
   */
  const insertPageNumberMarker = (kind: 'document' | 'internal-number' | 'external-number' | 'internal-letter' | 'external-letter' = 'document') => {
    // not `editingId`: choosing this from the menu blurs the text frame first (its onStopEditing already cleared
    // that), but leaves `textSel` - the caret it was left at - alone, and that's what the marker should go at
    if (!textSel) return
    const marker = kind === 'internal-number' ? INTERNAL_PAGE_NUMBER_MARKER : kind === 'external-number' ? EXTERNAL_PAGE_NUMBER_MARKER : kind === 'internal-letter' ? INTERNAL_LETTER_PAGE_NUMBER_MARKER : kind === 'external-letter' ? LETTER_PAGE_NUMBER_MARKER : PAGE_NUMBER_MARKER
    applyEdit(textSel.headId, textSel.a, textSel.b, marker)
  }

  const insertRunningHeader = () => setRunningHeaderDialog(true)
  const createTableOfContents = (config: TocConfig): boolean => {
    if (editingParentId || previewMode || !doc) return false
    const existingTocIds = new Set(headFrames(frames)
      .filter((head) => head.tocPageReferences?.length)
      .flatMap((head) => chainOf(frames, head.id).map((frame) => frame.id)))
    const sourceFrames = frames.filter((frame) => !existingTocIds.has(frame.id))
    const levelByStyle = new Map(config.levels.map((level, index) => [level.sourceStyleId, { ...level, index }]))
    const entries: {
      text: string
      sourceText: string
      sourceStyleId: string
      sourceFrameId: string
      sourceParagraphIndex: number
      pageIndex: number
      frameX: number
      frameY: number
      level: TocConfig['levels'][number]
    }[] = []

    for (const head of headFrames(sourceFrames)) {
      if (head.tocPageReferences?.length) continue
      const paragraphs = head.text.split('\n')
      const chain = chainOf(sourceFrames, head.id)
      let offset = 0
      paragraphs.forEach((paragraph, sourceParagraphIndex) => {
        const sourceText = paragraph.trim()
        const text = plainTocHeading(sourceText)
        const sourceStyleId = head.paragraphStyleIds?.[sourceParagraphIndex]
          ?? (sourceParagraphIndex === 0 ? head.paragraphStyleId : undefined)
          ?? paragraphStyles.find((style) => style.name === head.paragraphStyleNames?.[sourceParagraphIndex])?.id
        const mappedLevel = sourceStyleId ? levelByStyle.get(sourceStyleId) : undefined
        if (text && sourceStyleId && mappedLevel) {
          const sourceFrame = chain.find((candidate) => {
            const part = flow.get(candidate.id)
            return part && offset >= part.start && offset < part.end
          })
          if (sourceFrame) {
            const pageIndex = ownerPage(rects, sourceFrame.x + sourceFrame.w / 2, sourceFrame.y + sourceFrame.h / 2)
            entries.push({
              text,
              sourceText,
              sourceStyleId,
              sourceFrameId: head.id,
              sourceParagraphIndex,
              pageIndex,
              frameX: sourceFrame.x,
              frameY: sourceFrame.y,
              level: mappedLevel,
            })
          }
        }
        offset += paragraph.length + 1
      })
    }

    entries.sort((a, b) => a.pageIndex - b.pageIndex || a.frameY - b.frameY || (doc.binding === 'rtl' ? b.frameX - a.frameX : a.frameX - b.frameX) || a.sourceParagraphIndex - b.sourceParagraphIndex)
    if (entries.length === 0) return false

    let story = ''
    const runs: Run[] = []
    const paragraphStyleIds: string[] = []
    const paragraphStyleNames: string[] = []
    const paragraphStylePatches: NonNullable<TextFrame['paragraphStylePatches']> = []
    const tocPageReferences: TocPageReference[] = []
    const occurrences = new Map<string, number>()
    for (const entry of entries) {
      const lineStart = story.length
      const line = `${entry.text}\t${TOC_LEADER_MARKER}${TOC_PAGE_MARKER}\n`
      const offset = lineStart + entry.text.length + 2
      const occurrenceKey = `${entry.sourceStyleId}\u0000${entry.sourceText}`
      const occurrence = occurrences.get(occurrenceKey) ?? 0
      occurrences.set(occurrenceKey, occurrence + 1)
      tocPageReferences.push({ offset, sourceFrameId: entry.sourceFrameId, sourceParagraphIndex: entry.sourceParagraphIndex, sourceStyleId: entry.sourceStyleId, sourceText: entry.sourceText, occurrence })

      const outputStyleId = paragraphStyles.some((style) => style.id === entry.level.outputStyleId) ? entry.level.outputStyleId : 'body'
      const outputStyle = resolveParagraphStyle(outputStyleId)
      const runStyle = {
        ...DEFAULT_TEXT_STYLE,
        ...(outputStyle.fontFamily ? { fontFamily: outputStyle.fontFamily } : {}),
        ...(outputStyle.color ? { color: outputStyle.color } : {}),
        ...(outputStyle.fontSize ? { fontSize: outputStyle.fontSize } : {}),
        ...(outputStyle.weight ? { weight: outputStyle.weight } : {}),
        ...(outputStyle.italic !== undefined ? { italic: outputStyle.italic } : {}),
        ...(outputStyle.tracking !== undefined ? { tracking: outputStyle.tracking } : {}),
      }
      runs.push({ len: line.length, style: runStyle })
      paragraphStyleIds.push(outputStyleId)
      paragraphStyleNames.push(paragraphStyles.find((style) => style.id === outputStyleId)?.name ?? '')
      paragraphStylePatches.push({
        align: outputStyle.align ?? 'right',
        indentRight: (outputStyle.indentRight ?? 0) + entry.level.indent,
        ...(outputStyle.indentLeft ? { indentLeft: outputStyle.indentLeft } : {}),
        ...(outputStyle.leading ? { leading: outputStyle.leading } : {}),
        ...(outputStyle.firstLineIndent ? { firstLineIndent: outputStyle.firstLineIndent } : {}),
      })
      story += line
    }

    const pageIndex = Math.min(selectedPage, doc.pages - 1)
    const firstBox = columnBoxes(doc, rects[pageIndex], pageSidesOf(doc)[pageIndex], pageIndex)[0]
    const placed: PlacedText = {
      name: 'תוכן עניינים',
      text: story,
      runs,
      style: DEFAULT_TEXT_STYLE,
      paragraphStyleIds,
      paragraphStyleNames,
      paragraphStylePatches,
      tocPageReferences,
    }
    const result = pourText(doc, sourceFrames, images, placed, { box: firstBox }, 'auto', shapes)
    if (result.overflow || !result.headId) return false
    const nextPageParents = [...pageParents]
    while (nextPageParents.length < result.content.doc.pages) nextPageParents.push(effectiveActiveParent)
    const nextDoc = { ...result.content.doc, toc: config }
    pageOps.commit({ doc: nextDoc, frames: result.content.frames, pageParents: nextPageParents })
    setSelectedId(result.headId)
    setEditingId(null)
    setPageSel([pageIndex])
    setSelectedPage(pageIndex)
    setTocDialogOpen(false)
    return true
  }
  const applyRunningHeader = (styleId: string, strategy: 'first' | 'last') => {
    if (!selectedId) return
    const frame = frames.find((candidate) => candidate.id === selectedId)
    if (!frame) return
    const baseRuns = normalizeRuns(frame.text, frame.runs, frame)
    const edited = editStory(frame.text, baseRuns, frame.text.length, frame.text.length, RUNNING_HEADER_MARKER, frame)
    onFramesChange(frames.map((candidate) => candidate.id === frame.id ? { ...candidate, ...edited, runningHeaderStyleId: styleId, runningHeaderStrategy: strategy } : candidate), `running-header:${frame.id}`)
  }

  const firstWordRange = (text: string, start: number, end: number): [number, number] | null => {
    let cursor = start
    while (cursor < end && /\s/.test(text[cursor])) cursor++
    if (cursor >= end) return null
    const tokenEnd = () => { let at = cursor; while (at < end && !/\s/.test(text[at])) at++; return at }
    let wordEnd = tokenEnd()
    const token = text.slice(cursor, wordEnd)
    if (/^[\d\u05D0-\u05EA]+\)$/.test(token) || /^[\(\[\{][\d\u05D0-\u05EA]+$/.test(token)) {
      cursor = wordEnd
      while (cursor < end && /\s/.test(text[cursor])) cursor++
      if (cursor >= end) return null
      wordEnd = tokenEnd()
    }
    return wordEnd > cursor ? [cursor, wordEnd] : null
  }

  const applyFirstWordStyle = (sourceId: string, target: FirstWordTarget, scope: 'document' | 'selection') => {
    const record = target.kind === 'character' ? characterStyles.find((style) => style.id === target.id) : undefined
    if (target.kind === 'character' && !record) return
    const resolved = target.kind === 'paragraph' ? resolveParagraphStyle(target.id) : {}
    const charPatch = Object.fromEntries(['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'fontSize', 'weight', 'italic', 'tracking'].filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]])) as Partial<CharStyle>
    const selectedHead = textSel?.headId
    const nextFrames = frames.map((frame) => {
      if (!frame.text || (scope === 'selection' && frame.id !== selectedHead)) return frame
      const ranges: [number, number][] = []
      let offset = 0
      frame.text.split('\n').forEach((paragraph, index) => {
        const end = offset + paragraph.length
        const matches = frame.paragraphStyleIds?.[index] === sourceId || (index === 0 && frame.paragraphStyleId === sourceId)
        const selected = scope === 'document' || (!!textSel && textSel.a < end && textSel.b > offset)
        if (matches && selected) {
          const range = firstWordRange(frame.text, offset, end)
          if (range) ranges.push(range)
        }
        offset = end + 1
      })
      if (ranges.length === 0) return frame
      const nextRuns = ranges.reduce((runs, range) => (record ? applyCharacterStyle(runs, range[0], range[1], record) : styleRange(runs, range[0], range[1], charPatch)), normalizeRuns(frame.text, frame.runs, frame))
      return { ...frame, runs: nextRuns }
    })
    onFramesChange(nextFrames, 'first-word-style')
    setFirstWordDialog(false)
  }

  /** how wide the frame a paragraph starts in lets its lines be: its text width, the story's own side indents taken off */
  const paragraphTextWidth = (chain: TextFrame[], flows: (FrameFlow | undefined)[], storyStyle: { indentLeft?: number; indentRight?: number }, start: number) => {
    const flowIndex = Math.max(0, flows.findIndex((fl) => !!fl && start >= fl.start && start < fl.end))
    const frame = chain[flowIndex] ?? chain[0]
    return textFlowBoxOf(frame).w - (storyStyle.indentLeft ?? 0) - (storyStyle.indentRight ?? 0)
  }

  /**
   * טיפוגרפיה > יצירת חלון בטקסט. For every paragraph in the chosen paragraph style (everywhere, or only in the
   * selection) that is long enough: the opening word(s) take the chosen look, and the paragraph gets a `windowIndent`
   * that puts its second line exactly under the word that follows them on the first (see windowText.ts and
   * textLayout.ts's `windowOffset`). Removing clears it and leaves the look alone. A paragraph that is too short, or
   * whose opening words leave no room for a second line beside them, ends up with no window.
   */
  const runWindowText = (options: WindowTextOptions, remove: boolean): WindowTextResult => {
    const result: WindowTextResult = { changed: 0, skippedShort: 0, skippedWide: 0 }
    const opening = options.openingStyleId && !remove ? resolveParagraphStyle(options.openingStyleId) : null
    const charPatch = opening
      ? Object.fromEntries(['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'fontSize', 'weight', 'italic', 'tracking'].filter((key) => opening[key as keyof typeof opening] !== undefined).map((key) => [key, opening[key as keyof typeof opening]])) as Partial<CharStyle>
      : null
    const updates = new Map<string, TextFrame>()
    for (const head of headFrames(frames)) {
      if (!head.text || (options.scope === 'selection' && head.id !== textSel?.headId)) continue
      const chain = chainOf(frames, head.id)
      const flows = chain.map((frame) => flow.get(frame.id))
      const storyStyle = flows[0]?.style ?? styleOf(head)
      let runs = normalizeRuns(head.text, head.runs, head)
      const patches: NonNullable<TextFrame['paragraphStylePatches']> = head.paragraphStylePatches ? head.paragraphStylePatches.slice() : head.text.split('\n').map(() => ({}))
      let touched = false
      let offset = 0
      head.text.split('\n').forEach((paragraph, index) => {
        const start = offset
        const end = start + paragraph.length
        offset = end + 1
        if (paragraphStyleIdOf(head, index) !== options.styleId) return
        if (options.scope === 'selection' && !(textSel && textSel.a < end && textSel.b > start)) return
        const patch = patches[index] ?? {}
        const clear = () => {
          if (patch.windowIndent === undefined && patch.windowWords === undefined) return false
          const { windowIndent: _removed, windowWords: _words, ...rest } = patch
          patches[index] = rest
          touched = true
          return true
        }
        if (remove) {
          if (clear()) result.changed++
          return
        }
        const width = paragraphTextWidth(chain, flows, storyStyle, start)
        const range = openingRange(head.text, start, end, options.words)
        // no word after the opening ones: nothing to line the second line up with
        if (!range || range.next < 0) {
          clear()
          result.skippedShort++
          return
        }
        // the lines the paragraph has with a plain opening: an opening word already enlarged by an earlier run of this
        // tool would otherwise count as extra lines
        const plainRuns = styleRange(sliceRuns(runs, start, end), range.start - start, range.end - start, { fontSize: styleAtChar(runs, range.next, head).fontSize })
        if (countParagraphLines(paragraph, plainRuns, storyStyle, width, patch) < options.minLines) {
          clear()
          result.skippedShort++
          return
        }
        if (charPatch) {
          runs = styleRange(runs, range.start, range.end, charPatch)
          touched = true
        }
        const measured = windowOffset(paragraph, sliceRuns(runs, start, end), storyStyle, width, patch, options.words)
        if (measured === null || measured <= 0 || measured > width * WINDOW_MAX_SHARE) {
          clear()
          result.skippedWide++
          return
        }
        patches[index] = { ...patch, windowIndent: Math.round(measured * 100) / 100, windowWords: options.words }
        touched = true
        result.changed++
      })
      if (touched) updates.set(head.id, { ...head, runs, paragraphStylePatches: patches })
    }
    if (updates.size) onFramesChange(frames.map((frame) => updates.get(frame.id) ?? frame), remove ? 'window-text-remove' : 'window-text')
    return result
  }

  // A window is only right while its second line starts exactly under the word it was measured at, and the first line
  // is usually justified: typing in it, resizing the frame or changing a font moves that word. So every window is
  // measured again after the layout changes, and corrected when it is off - quietly, as part of the change that
  // moved it (no undo step of its own).
  useEffect(() => {
    if (previewMode || editingParentId) return
    const updates = new Map<string, TextFrame>()
    for (const head of headFrames(frames)) {
      const patches = head.paragraphStylePatches
      if (!head.text || !patches?.some((patch) => patch?.windowIndent && patch.windowWords)) continue
      const chain = chainOf(frames, head.id)
      const flows = chain.map((frame) => flow.get(frame.id))
      const storyStyle = flows[0]?.style ?? styleOf(head)
      const runs = normalizeRuns(head.text, head.runs, head)
      const next = patches.slice()
      let changed = false
      let offset = 0
      head.text.split('\n').forEach((paragraph, index) => {
        const start = offset
        offset = start + paragraph.length + 1
        const patch = patches[index]
        if (!patch?.windowIndent || !patch.windowWords) return
        const width = paragraphTextWidth(chain, flows, storyStyle, start)
        const measured = windowOffset(paragraph, sliceRuns(runs, start, start + paragraph.length), storyStyle, width, patch, patch.windowWords)
        // an opening that no longer leaves room (or has no next word) keeps the window it had until the user decides
        if (measured === null || measured <= 0 || measured > width * WINDOW_MAX_SHARE || Math.abs(measured - patch.windowIndent) < 0.3) return
        next[index] = { ...patch, windowIndent: Math.round(measured * 100) / 100 }
        changed = true
      })
      if (changed) updates.set(head.id, { ...head, paragraphStylePatches: next })
    }
    if (updates.size) onFramesChange(frames.map((frame) => updates.get(frame.id) ?? frame), 'window-text-sync', true)
  }, [flow, frames, previewMode, editingParentId, onFramesChange])

  // ── חיפוש והחלפה (עריכה) ───────────────────────────────────────────────────────────

  const openFind = () => {
    const range = textSel && textSel.a !== textSel.b ? { headId: textSel.headId, a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) } : null
    const selected = range ? frames.find((frame) => frame.id === range.headId)?.text.slice(range.a, range.b) ?? '' : ''
    setFindSeed(selected.length > 0 && selected.length <= 60 && !selected.includes('\n') ? selected : '')
    setFindKey((key) => key + 1)
    setFindOpen(true)
  }

  /** the matches of a search, story by story (a story is its head frame), or why the pattern is no good */
  const findHits = (search: FindSearch): { hits: StoryHits[]; error?: string } => {
    const compiled = compilePattern(search.options)
    if (!compiled) return { hits: [] }
    if (!compiled.ok) return { hits: [], error: compiled.error }
    const range = search.scope === 'selection' ? findRange.current : null
    if (search.scope === 'selection' && !range) return { hits: [] }
    return { hits: collectHits(headFrames(frames), compiled, { footnotes: search.notes, range: range ?? undefined }) }
  }

  /** the frame of a story that shows `offset` (the last one when it is beyond what the frames hold) */
  const frameAtOffset = (chain: TextFrame[], offset: number) =>
    chain.find((frame) => {
      const part = flow.get(frame.id)
      return !!part && offset >= part.start && offset < part.end
    }) ?? chain[chain.length - 1]
  const pageOfFrame = (frame: TextFrame) => ownerPage(rects, frame.x + frame.w / 2, frame.y + frame.h / 2)

  const summarizeFind = (search: FindSearch): FindSummary => {
    const { hits, error } = findHits(search)
    let total = 0
    let inNotes = 0
    const pages = new Set<number>()
    for (const hit of hits) {
      const chain = chainOf(frames, hit.head.id)
      total += hit.matches.length
      for (const match of hit.matches) pages.add(pageOfFrame(frameAtOffset(chain, match.start)))
      for (const { note, matches } of hit.notes) {
        inNotes += matches.length
        pages.add(pageOfFrame(frameAtOffset(chain, note.anchor)))
      }
    }
    return { total: total + inNotes, inNotes, pages: pages.size, ...(error ? { error } : {}) }
  }

  const compareKeys = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }

  /** every match in reading order - a story's text, then its footnotes - each with the position it is ordered by */
  type FindHit = { headId: string; noteId?: string; start: number; end: number; key: number[] }
  const orderedFindHits = (search: FindSearch): FindHit[] => {
    const heads = headFrames(frames)
    const out: FindHit[] = []
    for (const hit of findHits(search).hits) {
      const index = heads.findIndex((head) => head.id === hit.head.id)
      for (const match of hit.matches) out.push({ headId: hit.head.id, start: match.start, end: match.end, key: [index, 0, 0, match.start] })
      for (const { note, matches } of hit.notes) {
        for (const match of matches) out.push({ headId: hit.head.id, noteId: note.id, start: match.start, end: match.end, key: [index, 1, note.anchor, match.start] })
      }
    }
    return out.sort((a, b) => compareKeys(a.key, b.key))
  }

  /** where the user is in the text: the selection, or the selected footnote */
  const findPosition = (): { from: number[]; to: number[] } | null => {
    const heads = headFrames(frames)
    if (footnoteSel) {
      const index = heads.findIndex((head) => head.id === footnoteSel.headId)
      const note = heads[index]?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (note) return { from: [index, 1, note.anchor, Math.min(footnoteSel.a, footnoteSel.b)], to: [index, 1, note.anchor, Math.max(footnoteSel.a, footnoteSel.b)] }
    }
    if (textSel) {
      const index = heads.findIndex((head) => head.id === textSel.headId)
      if (index >= 0) return { from: [index, 0, 0, Math.min(textSel.a, textSel.b)], to: [index, 0, 0, Math.max(textSel.a, textSel.b)] }
    }
    return null
  }

  /**
   * Show a match: its page comes into view and it is highlighted - without opening the text for editing, so the
   * keyboard stays in the search panel (a key typed there must never land on the highlighted text).
   */
  const showFindHit = (hit: FindHit) => {
    const head = frames.find((frame) => frame.id === hit.headId)
    if (!head) return
    const chain = chainOf(frames, head.id)
    setEditingId(null)
    setEditingFootnoteId(null)
    setEditingFootnoteFrameId(null)
    setEditingFootnoteOffset(null)
    setFootnoteRequest(null)
    if (hit.noteId) {
      const note = head.footnotes?.find((item) => item.id === hit.noteId)
      if (!note) return
      const frame = chain.find((candidate) => flow.get(candidate.id)?.footnotes.some((placed) => placed.id === note.id)) ?? frameAtOffset(chain, note.anchor)
      const page = pageOfFrame(frame)
      setSelectedPage(page)
      setSelectedId(frame.id)
      setTextSel(null)
      setFootnoteSel({ headId: head.id, noteId: note.id, a: 0, b: note.content.length })
      goTo(spreadOfPage(page))
      return
    }
    const target = chain.find((frame) => {
      const part = flow.get(frame.id)
      return !!part && hit.start < part.end && hit.end > part.start
    }) ?? frameAtOffset(chain, hit.start)
    const page = pageOfFrame(target)
    setSelectedPage(page)
    setSelectedId(target.id)
    setFootnoteSel(null)
    setTextSel({ headId: head.id, a: hit.start, b: hit.end })
    goTo(spreadOfPage(page))
  }

  /** the next (or previous) match after the position the user is at, wrapping round at the end of the document */
  const stepFind = (search: FindSearch, direction: 1 | -1) => {
    const list = orderedFindHits(search)
    if (list.length === 0) return
    const at = findPosition()
    let hit: FindHit | undefined
    if (!at) hit = direction > 0 ? list[0] : list[list.length - 1]
    else if (direction > 0) hit = list.find((candidate) => compareKeys(candidate.key, at.to) >= 0) ?? list[0]
    else hit = [...list].reverse().find((candidate) => compareKeys([...candidate.key.slice(0, 3), candidate.key[3] + (candidate.end - candidate.start)], at.from) <= 0) ?? list[list.length - 1]
    showFindHit(hit)
  }

  /** the base look of a footnote, where it has no runs of its own */
  const footnoteBase = (note: FootnoteItem) => note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)

  /** Replace (or, with `remove`, delete) every match in the whole document - or in the selection - as one undo step. Returns how many. */
  const replaceAllFind = (search: FindSearch, remove: boolean): number => {
    const effective: FindSearch = remove ? { ...search, options: { ...search.options, replace: '' } } : search
    const { hits } = findHits(effective)
    if (hits.length === 0) return 0
    const byHead = new Map(hits.map((hit) => [hit.head.id, hit]))
    let count = 0
    let delta = 0
    const next = frames.map((frame) => {
      const hit = byHead.get(frame.id)
      if (!hit) return frame
      let edited = replaceInStory(frame, hit.matches)
      count += hit.matches.length
      for (const match of hit.matches) delta += match.replacement.length - (match.end - match.start)
      if (hit.notes.length) {
        const found = new Map(hit.notes.map(({ note, matches }) => [note.id, matches]))
        edited = { ...edited, footnotes: edited.footnotes?.map((note) => (found.has(note.id) ? replaceInNote(note, found.get(note.id)!, footnoteBase(note)) : note)) }
        for (const { matches } of hit.notes) count += matches.length
      }
      return edited
    })
    // the text of the area "selection only" searches is now longer or shorter by what the replacements changed
    if (effective.scope === 'selection' && findRange.current) findRange.current = { ...findRange.current, b: findRange.current.b + delta }
    dirtyOffsetRef.current = undefined
    onFramesChange(next, 'find-replace')
    setTextSel(null)
    setFootnoteSel(null)
    return count
  }

  /** "Replace": the match that is selected right now, then on to the next one; with none selected it only goes to the next */
  const replaceOneFind = (search: FindSearch) => {
    const { hits } = findHits(search)
    if (textSel && textSel.a !== textSel.b) {
      const a = Math.min(textSel.a, textSel.b)
      const b = Math.max(textSel.a, textSel.b)
      const hit = hits.find((candidate) => candidate.head.id === textSel.headId)
      const match = hit?.matches.find((candidate) => candidate.start === a && candidate.end === b)
      if (hit && match) {
        dirtyOffsetRef.current = undefined
        onFramesChange(frames.map((frame) => (frame.id === hit.head.id ? replaceInStory(frame, [match]) : frame)), 'find-replace-one')
        const caret = match.start + match.replacement.length
        setTextSel({ headId: hit.head.id, a: caret, b: caret })
        if (search.scope === 'selection' && findRange.current) findRange.current = { ...findRange.current, b: findRange.current.b + match.replacement.length - (match.end - match.start) }
        pendingFind.current = search
        return
      }
    }
    stepFind(search, 1)
  }

  const captureFindSelection = () => {
    if (!textSel || textSel.a === textSel.b) return false
    findRange.current = { headId: textSel.headId, a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
    return true
  }

  // after "Replace": the text has been laid out again, so the next match can be found and shown
  useEffect(() => {
    const search = pendingFind.current
    if (!search) return
    pendingFind.current = null
    stepFind(search, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new layout (flow) triggers this
  }, [flow])

  /** Backspace at the very start of a threaded frame deletes the last character of the previous frame */
  const backspaceAtStart = (frameId: string) => {
    const fl = flow.get(frameId)
    if (fl && fl.start > 0) applyEdit(fl.headId, fl.start - 1, fl.start, '')
  }

  const backspaceAtParagraphStart = (frameId: string, offset: number): boolean => {
    const fl = flow.get(frameId)
    const head = fl && frames.find((frame) => frame.id === fl.headId)
    if (!fl || !head) return false
    const absolute = fl.start + offset
    if (absolute > 0 && head.text[absolute - 1] !== '\n') return false
    const index = paraIndexAt(head.text, absolute)
    const patches = clearParagraphFirstLineIndent(
      head.paragraphStylePatches,
      index,
      head.text.split('\n').length,
      head.firstLineIndent ?? 0,
    )
    if (!patches) return false
    onFramesChange(
      frames.map((frame) => frame.id === head.id ? { ...frame, paragraphStylePatches: patches } : frame),
      `first-line-indent:${head.id}:${index}`,
    )
    return true
  }

  /** an Up/Down that ran out of lines in `frameId`: hand the caret to the previous/next frame of its thread, same column */
  const pendingLineJump = useRef<{ frameId: string; x: number; dir: 1 | -1; toStart: boolean } | null>(null)
  const jumpToLine = (frameId: string, dir: 1 | -1, x: number, toStart = false) => {
    const fl = flow.get(frameId)
    const head = fl && frames.find((f) => f.id === fl.headId)
    if (!fl || !head) return
    const chain = chainOf(frames, head.id)
    const index = chain.findIndex((f) => f.id === frameId)
    const target = chain[index + dir]
    if (!target) return
    pendingLineJump.current = { frameId: target.id, x, dir, toStart }
    setSelectedId(target.id)
    setEditingId(target.id)
    const page = ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)
    setSelectedPage(page)
    // no jump to the page as a whole: the view moves only as far as it takes for the line the caret lands on to show (below)
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
    // the edge the caret arrives at (the top of the frame coming from above, its bottom coming from below) is brought into
    // the view, with a little room round it, by the smallest scroll that does it - and nothing at all when it is in view
    // already, so the arrows keep going from where the eye is
    const viewport = vpRef.current
    if (viewport) {
      const room = 48
      const box = viewport.getBoundingClientRect()
      const frameBox = el.getBoundingClientRect()
      const edge = pending.dir === 1 ? frameBox.top + 4 : frameBox.bottom - 4
      const dy = edge < box.top + room ? edge - (box.top + room) : edge > box.bottom - room ? edge - (box.bottom - room) : 0
      const across = Math.min(Math.max(pending.toStart ? frameBox.right - 4 : pending.x, frameBox.left), frameBox.right)
      const dx = across < box.left + room ? across - (box.left + room) : across > box.right - room ? across - (box.right - room) : 0
      if (dy !== 0) viewport.scrollTop += dy
      if (dx !== 0) setScrollX(viewport, getScrollX(viewport) + dx)
    }
    // from the very end of the last paragraph of the previous frame: the start of this one, not a column of its first line
    if (pending.toStart) {
      askSelection(pending.frameId, 0, 0)
      return
    }
    const rect = el.getBoundingClientRect()
    // a point inside the line the caret arrives on: the frame's own edge can lie in empty room under the last line (a frame
    // whose text ends short of its bottom), where there is no text to hit - so the last paragraph's own box is measured
    const block = pending.dir === 1 ? el.firstElementChild : el.lastElementChild
    const blockBox = block instanceof HTMLElement ? block.getBoundingClientRect() : null
    const y = pending.dir === 1 ? rect.top + 4 : blockBox && blockBox.height > 0 ? Math.min(rect.bottom - 4, blockBox.bottom - 3) : rect.bottom - 4
    const column = Math.min(Math.max(pending.x, rect.left + 2), rect.right - 2)
    // a point at the very edge of the frame can be over one of its selection handles, which are not part of its text: when it
    // misses, the next tries are a little further in along the line, and a little further in from the edge of the frame
    const inward = Math.sign((rect.left + rect.right) / 2 - column) || 1
    let offset: number | null = null
    for (const deeper of [0, 10]) {
      for (const across of [0, 8]) {
        offset = caretOffsetAt(column + inward * across, pending.dir === 1 ? y + deeper : y - deeper, el)
        if (offset !== null) break
      }
      if (offset !== null) break
    }
    if (offset === null) return
    // below the last line of a frame the story goes on after, the place after its last break is the next frame's first: the
    // caret stays on that last line
    const landed = flow.get(pending.frameId)
    const last = landed && landed.end < landed.story.length && landed.story[landed.end - 1] === '\n' ? Math.max(0, landed.end - landed.start - 1) : Infinity
    const at = Math.min(offset, last)
    askSelection(pending.frameId, at, at)
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
    // client (window) coordinates -> world: tx/ty are positions inside the scrolling content, not on the window, so
    // comparing clientX/clientY with them directly picked the wrong frame (or none) whenever the viewport is offset or scrolled
    const world = toWorld(clientX, clientY)
    const slack = 4 / zoom
    const target = chainOf(frames, head.id).find((f) => world.x >= f.x - slack && world.x <= f.x + f.w + slack && world.y >= f.y - slack && world.y <= f.y + f.h + slack)
    const targetFlow = target && flow.get(target.id)
    if (!target || !targetFlow) return
    const el = document.querySelector(`[data-frame-id="${target.id}"] .rich-editor, [data-frame-id="${target.id}"] .text-frame-body`)
    const local = el instanceof HTMLElement ? caretOffsetAt(clientX, clientY, el) : null
    const localOffset = local ?? (world.y < target.y ? 0 : targetFlow.slice.length)
    const globalTarget = targetFlow.start + localOffset
    const a = Math.min(anchorGlobal, globalTarget)
    const b = Math.max(anchorGlobal, globalTarget)
    setTextSel((prev) => (prev && prev.headId === fl.headId && prev.a === a && prev.b === b ? prev : { headId: fl.headId, a, b }))
    if (editingIdRef.current !== target.id) {
      editingIdRef.current = target.id
      setSelectedId(target.id)
      setEditingId(target.id)
      // no goTo here: the pointer is already over this frame (so it is on screen), and re-centring the view on every
      // pointer move of a drag would fight the user's own mouse
      setSelectedPage(ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2))
    }
    askSelection(target.id, Math.max(0, a - targetFlow.start), Math.min(targetFlow.slice.length, b - targetFlow.start))
  }

  const handleSelect = (frameId: string, a: number, b: number) => {
    const fl = flow.get(frameId)
    if (!fl) return
    setFootnoteSel(null)
    const shownEnd = fl.end - fl.start
    if (!(a === shownEnd && b === shownEnd)) oversetCaret.current = false
    // keep a selection that runs across several frames (Ctrl+A, or a drag from one frame into another) while the
    // browser reports only this frame's part of it: the editing frame's own selection change would otherwise overwrite
    // the whole range with just its own piece, so a drag from page 2 up into page 1 ended up selecting page 1 alone.
    // The same for a caret in text that fits in no frame: the editor shows it at the end of what the frame shows
    setTextSel((prev) => {
      if (prev && prev.headId === fl.headId && reportIsViewOf(prev, fl, a, b, oversetCaret.current)) return prev
      return prev && prev.headId === fl.headId && prev.a === fl.start + a && prev.b === fl.start + b
        ? prev
        : { headId: fl.headId, a: fl.start + a, b: fl.start + b }
    })
  }

  /** text for the clipboard when the selection spans several frames */
  const copyText = (frameId: string): string | null => {
    const fl = flow.get(frameId)
    if (fl && textSel && textSel.headId === fl.headId && (textSel.a < fl.start || textSel.b > fl.end)) {
      return fl.story.slice(textSel.a, textSel.b)
    }
    return null
  }

  const copyFormattedText = (frameId: string, from: number, to: number): RichTextClipboard | null => {
    const fl = flow.get(frameId)
    if (!fl) return null
    const range = textSel?.headId === fl.headId && (textSel.a < fl.start || textSel.b > fl.end)
      ? { a: textSel.a, b: textSel.b }
      : { a: fl.start + Math.min(from, to), b: fl.start + Math.max(from, to) }
    const head = frames.find((frame) => frame.id === fl.headId)
    if (!head || range.a === range.b) return null
    const text = fl.story.slice(range.a, range.b)
    if (!text) return null
    const normalizedRuns = normalizeRuns(head.text, head.runs, head)
    const startParagraph = paraIndexAt(head.text, range.a)
    const endParagraph = paraIndexAt(head.text, Math.max(range.a, range.b - 1))
    const paragraphKeys = [
      'leading', 'wordSpacingMin', 'wordSpacingMax', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight',
      'firstLineIndent', 'secondLineIndent', 'align', 'windowIndent', 'windowWords', 'listKind', 'listGap',
      'background', 'borderWidth', 'borderColor',
    ] as const
    const paragraphs: RichTextClipboard['paragraphs'] = []
    for (let index = startParagraph; index <= endParagraph; index++) {
      const styleId = paragraphStyleIdOf(head, index) ?? ''
      const resolved = styleId ? resolveParagraphStyle(styleId) : {}
      const patchSource = { ...head, ...resolved, ...head.paragraphStylePatches?.[index] }
      const patch = Object.fromEntries(paragraphKeys
        .filter((key) => patchSource[key] !== undefined)
        .map((key) => [key, patchSource[key]])) as RichTextClipboard['paragraphs'][number]['patch']
      paragraphs.push({
        styleId,
        styleName: paragraphStyles.find((style) => style.id === styleId)?.name ?? '',
        patch,
        spaceBefore: head.paraSpaceBefore?.[index] ?? null,
        spaceAfter: head.paraSpaceAfter?.[index] ?? null,
        keepFirstLines: head.paraKeepFirstLines?.[index] ?? null,
        keepLastLines: head.paraKeepLastLines?.[index] ?? null,
        keepWithNext: head.paraKeepWithNext?.[index] ?? null,
      })
    }
    return {
      text,
      runs: sliceRuns(normalizedRuns, range.a, range.b),
      paragraphs,
    }
  }

  const selectAllStory = (frameId: string) => {
    const fl = flow.get(frameId)
    if (!fl) return
    setFootnoteSel(null)
    setTextSel({ headId: fl.headId, a: 0, b: fl.story.length })
    askSelection(frameId, 0, fl.slice.length)
  }

  const selectStoryToStart = (frameId: string, localOffset: number) => {
    const fl = flow.get(frameId)
    if (!fl) return
    const offset = Math.max(0, Math.min(localOffset, fl.slice.length))
    setFootnoteSel(null)
    setTextSel({ headId: fl.headId, a: 0, b: fl.start + offset })
    askSelection(frameId, 0, offset)
  }

  const selectAllText = () => {
    if (editingFootnoteId && footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (head && note) {
        selectAllFootnote(head.id, note.id)
        return
      }
    }
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
    selectAllStory(editingId)
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
    const offset = Math.max(0, Math.min(head.text.length, selected && textSel ? Math.min(textSel.a, textSel.b) : fl.start))
    const paragraphIndex = paraIndexAt(head.text, offset)
    const paragraphOverride = head.paragraphStylePatches?.[paragraphIndex] ?? {}
    const style = charStyleOf(styleAtChar(runs, offset, head))
    setSampledTextStyle({
      character: style,
      paragraph: {
        align: paragraphOverride.align ?? head.align,
        leading: paragraphOverride.leading ?? head.leading,
        wordSpacingMin: paragraphOverride.wordSpacingMin ?? head.wordSpacingMin,
        wordSpacingMax: paragraphOverride.wordSpacingMax ?? head.wordSpacingMax,
        spaceBefore: head.paraSpaceBefore?.[paragraphIndex] ?? paragraphOverride.spaceBefore ?? (paragraphIndex === 0 ? head.spaceBefore ?? 0 : 0),
        spaceAfter: head.paraSpaceAfter?.[paragraphIndex] ?? paragraphOverride.spaceAfter ?? head.spaceAfter ?? DEFAULT_SPACE_AFTER,
        indentLeft: paragraphOverride.indentLeft ?? head.indentLeft,
        indentRight: paragraphOverride.indentRight ?? head.indentRight,
        firstLineIndent: paragraphOverride.firstLineIndent ?? head.firstLineIndent,
        secondLineIndent: paragraphOverride.secondLineIndent ?? head.secondLineIndent,
        windowIndent: paragraphOverride.windowIndent,
        windowWords: paragraphOverride.windowWords,
      },
      keepFirstLines: head.paraKeepFirstLines?.[paragraphIndex] ?? 0,
      keepLastLines: head.paraKeepLastLines?.[paragraphIndex] ?? 0,
      keepWithNext: head.paraKeepWithNext?.[paragraphIndex] ?? 0,
      feather: head.feather,
    })
  }

  const applySampledTextStyle = (id: string, sampled: SampledTextDesign) => {
    const part = flow.get(id)
    const head = part && frames.find((frame) => frame.id === part.headId)
    if (!part || !head) return
    const chainIds = new Set(chainOf(frames, id).map((frame) => frame.id))
    const runs = normalizeRuns(head.text, head.runs, head)
    const characterPatch: Partial<CharStyle> = {
      fontFamily: sampled.character.fontFamily,
      color: sampled.character.color,
      outlineColor: sampled.character.outlineColor,
      outlineWidth: sampled.character.outlineWidth,
      shadowOffsetX: sampled.character.shadowOffsetX,
      shadowOffsetY: sampled.character.shadowOffsetY,
      shadowOffset: sampled.character.shadowOffset,
      shadowColor: sampled.character.shadowColor,
      shadowOpacity: sampled.character.shadowOpacity,
      fontSize: sampled.character.fontSize,
      weight: sampled.character.weight,
      italic: sampled.character.italic,
      tracking: sampled.character.tracking,
      baselineShift: sampled.character.baselineShift,
      charStyleId: sampled.character.charStyleId,
    }
    const paragraphPatch = sampled.paragraph
    const paragraphCount = head.text.split('\n').length
    const paragraphStylePatches = Array.from({ length: paragraphCount }, () => ({ ...paragraphPatch }))
    const paraSpaceBefore = Array.from({ length: paragraphCount }, () => paragraphPatch.spaceBefore)
    const paraSpaceAfter = Array.from({ length: paragraphCount }, () => paragraphPatch.spaceAfter)
    const paraKeepFirstLines = Array.from({ length: paragraphCount }, () => sampled.keepFirstLines || null)
    const paraKeepLastLines = Array.from({ length: paragraphCount }, () => sampled.keepLastLines || null)
    const paraKeepWithNext = Array.from({ length: paragraphCount }, () => sampled.keepWithNext || null)
    onFramesChange(frames.map((frame) => {
      if (!chainIds.has(frame.id)) return frame
      return {
        ...frame,
        ...characterPatch,
        align: paragraphPatch.align,
        leading: paragraphPatch.leading,
        wordSpacingMin: paragraphPatch.wordSpacingMin,
        wordSpacingMax: paragraphPatch.wordSpacingMax,
        spaceBefore: paragraphPatch.spaceBefore,
        spaceAfter: paragraphPatch.spaceAfter,
        indentLeft: paragraphPatch.indentLeft,
        indentRight: paragraphPatch.indentRight,
        firstLineIndent: paragraphPatch.firstLineIndent,
        secondLineIndent: paragraphPatch.secondLineIndent,
        feather: sampled.feather,
        ...(frame.id === head.id ? {
          runs: styleRange(runs, 0, head.text.length, characterPatch),
          paragraphStylePatches,
          paraSpaceBefore,
          paraSpaceAfter,
          paraKeepFirstLines,
          paraKeepLastLines,
          paraKeepWithNext,
        } : {}),
      }
    }), `eyedropper-text:${head.id}`)
  }

  const applyAlign = (id: string, align: TextAlign) => {
    const frameFlow = flow.get(id)
    const head = frameFlow && frames.find((frame) => frame.id === frameFlow.headId)
    if (!frameFlow || !head) return
    const range = textSel?.headId === head.id
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: frameFlow.start, b: Math.max(frameFlow.start + 1, frameFlow.end) }
    const indexes = paragraphsInRange(head.text, range.a, range.b)
    const patches: NonNullable<TextFrame['paragraphStylePatches']> = head.paragraphStylePatches ? head.paragraphStylePatches.slice() : head.text.split('\n').map(() => ({}))
    for (const index of indexes) patches[index] = { ...(patches[index] ?? {}), align }
    onFramesChange(frames.map((frame) => frame.id === head.id ? { ...frame, paragraphStylePatches: patches } : frame), `align:${head.id}:${indexes.join(',')}`)
  }

  /** Apply paragraph layout to the selected text, or to the paragraphs shown by the selected frame. */
  const applyParagraphStyle = (
    id: string,
    patch: Partial<Pick<TextStyle, 'align' | 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>,
  ) => {
    const flowPart = flow.get(id)
    const head = flowPart && frames.find((frame) => frame.id === flowPart.headId)
    if (!flowPart || !head) return
    const range = textSel?.headId === head.id && textSel.b <= head.text.length
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: flowPart.start, b: Math.max(flowPart.start + 1, flowPart.end) }
    const indexes = paragraphsInRange(head.text, range.a, range.b)
    const patches: NonNullable<TextFrame['paragraphStylePatches']> = head.paragraphStylePatches ? head.paragraphStylePatches.slice() : head.text.split('\n').map(() => ({}))
    // a leading of 0 is no leading: it takes the paragraph's own setting away (back to automatic) instead of storing a line height of nothing
    const wanted = patch.leading !== undefined && !(patch.leading > 0) ? { ...patch, leading: undefined } : patch
    for (const index of indexes) patches[index] = { ...(patches[index] ?? {}), ...wanted }
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
    const range = textSel?.headId === head.id && textSel.b <= head.text.length
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: flowPart.start, b: Math.max(flowPart.start + 1, flowPart.end) }
    let paraSpaceBefore = head.paraSpaceBefore
    let paraSpaceAfter = head.paraSpaceAfter
    const indexes = paragraphsInRange(head.text, range.a, range.b)
    for (const i of indexes) {
      if (patch.spaceBefore !== undefined) paraSpaceBefore = withParaOverride(paraSpaceBefore, i, patch.spaceBefore)
      if (patch.spaceAfter !== undefined) paraSpaceAfter = withParaOverride(paraSpaceAfter, i, patch.spaceAfter)
    }
    onFramesChange(frames.map((f) => (f.id === head.id ? { ...f, paraSpaceBefore, paraSpaceAfter } : f)), `parastyle:${id}:${Object.keys(patch).join(',')}`)
  }

  /** "keep with next" for the selected paragraphs only (or the caret's), without touching their paragraph style */
  const applyParagraphKeepWithNext = (id: string, on: boolean) => {
    const flowPart = flow.get(id)
    const head = flowPart && frames.find((frame) => frame.id === flowPart.headId)
    if (!flowPart || !head) return
    const range = textSel?.headId === head.id && textSel.b <= head.text.length
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: flowPart.start, b: Math.max(flowPart.start + 1, flowPart.end) }
    let paraKeepWithNext = head.paraKeepWithNext
    for (const index of paragraphsInRange(head.text, range.a, range.b)) paraKeepWithNext = setParaOverride(paraKeepWithNext, index, on ? 1 : undefined)
    onFramesChange(frames.map((frame) => (frame.id === head.id ? { ...frame, paraKeepWithNext } : frame)), `paragraph-keep-next:${id}`)
  }

  const applyParagraphKeepLines = (id: string, patch: Partial<{ first: number; last: number }>) => {
    const flowPart = flow.get(id)
    const head = flowPart && frames.find((frame) => frame.id === flowPart.headId)
    if (!flowPart || !head) return
    const range = textSel?.headId === head.id && textSel.b <= head.text.length
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: flowPart.start, b: Math.max(flowPart.start + 1, flowPart.end) }
    let paraKeepFirstLines = head.paraKeepFirstLines
    let paraKeepLastLines = head.paraKeepLastLines
    for (const index of paragraphsInRange(head.text, range.a, range.b)) {
      if (patch.first !== undefined) paraKeepFirstLines = withParaOverride(paraKeepFirstLines, index, patch.first)
      if (patch.last !== undefined) paraKeepLastLines = withParaOverride(paraKeepLastLines, index, patch.last)
    }
    onFramesChange(frames.map((frame) => frame.id === head.id ? { ...frame, paraKeepFirstLines, paraKeepLastLines } : frame), `paragraph-keep:${id}`)
  }

  /**
   * Removes repeated spaces and empty paragraphs (story.ts's cleanSpacingRanges): from the selected text if there is
   * one (Ctrl+A first selects the whole story, so that also works), otherwise from every story in the document. One
   * undo step either way. Every removal is a real edit of its story (findReplace.ts's replaceInStory), so the runs,
   * the per-paragraph styles and spacing, and the footnote anchors of the paragraphs that stay keep following the text:
   * a single combined edit from the first change to the last would have handed every paragraph in between the
   * look of the first one.
   */
  const cleanSpacingCmd = () => {
    const selection = textSel && textSel.a !== textSel.b ? { headId: textSel.headId, from: Math.min(textSel.a, textSel.b), to: Math.max(textSel.a, textSel.b) } : null
    const heads = selection ? frames.filter((f) => f.id === selection.headId) : headFrames(frames).filter((head) => !head.tocPageReferences?.length)
    const edited = new Map<string, TextFrame>()
    for (const head of heads) {
      const { ranges, dropped } = selection ? cleanSpacingPlan(head.text, selection.from, Math.min(selection.to, head.text.length)) : cleanSpacingPlan(head.text)
      if (ranges.length) edited.set(head.id, replaceInStory(head, ranges.map(([start, end]) => ({ start, end, replacement: '' })), { dropParagraphs: dropped }))
    }
    if (selection) setTextSel(null)
    if (edited.size === 0) return
    dirtyOffsetRef.current = undefined
    onFramesChange(frames.map((f) => edited.get(f.id) ?? f), 'clean-spacing')
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

  /** the character style id the document gives a Word character style: a style of the same name is reused */
  const importedCharacterStyleId = (style: ImportedCharacterStyle, used: Set<string>) => {
    const stem = `character-style-word-${style.wordId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'style'}`
    let id = stem
    let suffix = 2
    while (used.has(id)) id = `${stem}-${suffix++}`
    used.add(id)
    return id
  }

  /**
   * Imported text, made ready to be placed: its Word paragraph styles and character styles are matched with (or added to) the
   * document's, and the text is told the ids. `styles` / `chars` are the lists the document will have once it is placed.
   */
  const preparePlacedText = (placed: PlacedText): { placed: PlacedText; styles: ParagraphStyleRecord[]; chars: CharacterStyleRecord[] } => {
    const nextChars = [...characterStyles]
    const charIds = new Map<string, string>()
    if (placed.characterStyles?.length) {
      const usedChars = new Set(nextChars.map((style) => style.id))
      for (const imported of placed.characterStyles) {
        const existing = nextChars.find((style) => style.name === imported.name)
        const id = existing?.id ?? importedCharacterStyleId(imported, usedChars)
        charIds.set(imported.wordId, id)
        if (!existing) nextChars.push({ id, name: imported.name, patch: imported.patch })
      }
    }
    const relinkRuns = (runs: Run[]) => runs.map((run) => {
      const link = run.style.charStyleId
      if (!link) return run
      const mapped = charIds.get(link)
      const { charStyleId: _old, ...rest } = run.style
      return { ...run, style: mapped ? { ...rest, charStyleId: mapped } : rest }
    })
    const withCharacterStyles: PlacedText = charIds.size
      ? { ...placed, runs: relinkRuns(placed.runs), ...(placed.footnotes?.length ? { footnotes: placed.footnotes.map((note) => (note.runs ? { ...note, runs: relinkRuns(note.runs) } : note)) } : {}) }
      : placed
    const chars = nextChars.length === characterStyles.length ? characterStyles : nextChars
    if (!placed.paragraphStyles?.length) return { placed: withCharacterStyles, styles: paragraphStyles, chars }
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
    return {
      placed: {
        ...withCharacterStyles,
        ...(placed.paragraphStyleIds?.length ? { paragraphStyleIds: placed.paragraphStyleIds.map((wordId) => ids.get(wordId) ?? wordId) } : {}),
        ...(withCharacterStyles.footnotes?.length ? { footnotes: withCharacterStyles.footnotes.map((note) => ({ ...note, ...(note.paragraphStyleId ? { paragraphStyleId: ids.get(note.paragraphStyleId) ?? note.paragraphStyleId } : {}) })) } : {}),
      },
      styles: nextStyles,
      chars,
    }
  }

  /** the frames of a placing result: layer, and the nested styles of the stories whose text just changed */
  const placedFrames = (resultFrames: TextFrame[], prepared: { styles: ParagraphStyleRecord[]; chars: CharacterStyleRecord[] }, layer: (frame: TextFrame) => string | undefined) =>
    resultFrames.map((frame) => {
      const before = frames.find((old) => old.id === frame.id)
      const nested = !before || before.text !== frame.text ? applyNestedToFrame(frame, prepared.styles, undefined, undefined, [], resolvedRecords(prepared.chars)) : frame
      return { ...nested, layerId: layer(frame) }
    })

  /**
   * Pour the loaded text into a frame at `target`. Shift = semi-automatic, Alt = automatic, otherwise the mode
   * chosen in the banner. The whole result is one undo step.
   */
  const doPlace = (target: { box: Box; frameId?: string }, mods: { shift: boolean; alt: boolean }) => {
    if (!placing) return
    const mode: FlowMode = mods.shift ? 'semi' : mods.alt ? 'auto' : flowMode
    const prepared = preparePlacedText(placing)
    const result = pourText(doc, frames, images, prepared.placed, target, mode, shapes)
    pageOps.commit({ ...result.content, frames: placedFrames(result.content.frames, prepared, () => creationLayerId), ...(prepared.chars !== characterStyles ? { characterStyles: prepared.chars } : {}) })
    setSelectedId(result.headId)
    setEditingId(null)
    onPlacingChange(result.remaining)
  }

  const replaceSelectedText = (placed: PlacedText) => {
    const selected = selectedId ? frames.find((frame) => frame.id === selectedId) : undefined
    if (!selected) return false
    const prepared = preparePlacedText(placed)
    const result = pourText(doc, frames, images, prepared.placed, { box: { x: selected.x, y: selected.y, w: selected.w, h: selected.h }, frameId: selected.id }, 'single', shapes)
    pageOps.commit({ ...result.content, frames: placedFrames(result.content.frames, prepared, (frame) => frame.layerId ?? creationLayerId), ...(prepared.chars !== characterStyles ? { characterStyles: prepared.chars } : {}) })
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
    const frame: ImageFrame = { id: newFrameId(), layerId: creationLayerId, x, y, w: Math.max(MIN_FRAME_PT, w), h: Math.max(MIN_FRAME_PT, h), assetId, fit: 'fill', z: nextZ(frames, images, shapes) }
    pageOps.commit({ images: [...images, frame], assets: assets[assetId] ? assets : { ...assets, [assetId]: asset } })
    setSelectedId(frame.id)
    setEditingId(null)
    onPlacingImagesChange(placingImages.slice(1))
  }

  /** clicking a picture: the Selection tool selects it and starts moving it (other tools pass the click on) */
  const onImagePointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0 || (tool !== 'select' && tool !== 'transform' && tool !== 'direct' && tool !== 'heal')) return
    if (itemLocks[id]) return
    const im = images.find((x) => x.id === id)
    if (!im) return
    if (tool === 'heal') {
      beginRepairStroke(im, e)
      return
    }
    if (handleMultiPointer(id, e)) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedPage(ownerPage(rects, im.x + im.w / 2, im.y + im.h / 2))
    setSelectedId(id)
    setEditingId(null)
    beginFrameDrag(e, id, 'move')
  }

  // ── tables ──────────────────────────────────────────────────────────────────
  const selectedTable = (): (ShapeFrame & { table: TableData }) | null => {
    const shape = shapes.find((sh) => sh.id === selectedId)
    return shape && shape.kind === 'table' && shape.table ? (shape as ShapeFrame & { table: TableData }) : null
  }

  /** a new version of a table: its height follows from the text, so it is set together with it */
  const commitTable = (id: string, table: TableData, key?: string) =>
    onShapesChange(shapes.map((sh) => (sh.id === id && sh.kind === 'table' ? { ...sh, table, h: layoutOfShape({ table, w: sh.w })?.height ?? sh.h } : sh)), key)

  const tableUiFor = (sh: ShapeFrame, active: boolean) => {
    const layout = layoutOfShape(sh)
    if (!layout) return undefined
    return {
      layout,
      active,
      selection: tableSel && tableSel.id === sh.id ? tableSel : null,
      onSelection: (next: TableSelection | null) => setTableSel(next ? { ...next, id: sh.id } : null),
      onContextMenu: (selection: Pick<TableSelection, 'r0' | 'c0' | 'r1' | 'c1'>, x: number, y: number) => {
        setSelectedId(sh.id)
        setTableSel({ ...selection, editing: false, id: sh.id })
        setTableMenu({ id: sh.id, x, y })
      },
      onTable: (table: TableData, key?: string) => commitTable(sh.id, table, key),
    }
  }

  const insertTableShape = (options: InsertTableOptions) => {
    const page = pageSize(doc, selectedPage)
    const width = Math.round(page.w * 0.7)
    const table = createTable({ rows: options.rows, cols: options.cols, headerRows: options.headerRows, footerRows: options.footerRows, width, cellGapX: options.cellGapX, cellGapY: options.cellGapY, cellRadius: options.cellRadius, headerContinuous: options.headerContinuous })
    const height = layoutOfShape({ table, w: width })?.height ?? 100
    const viewport = vpRef.current
    const box = viewport?.getBoundingClientRect()
    const center = viewport && box ? toWorld(box.left + viewport.clientWidth / 2, box.top + viewport.clientHeight / 2) : null
    const pageIndex = center ? ownerPage(rects, center.x, center.y) : selectedPage
    const area = rects[pageIndex] ?? rects[selectedPage]
    const x = area ? area.x + (area.w - width) / 2 : 0
    const y = area ? Math.max(area.y + 20, Math.min(center ? center.y - height / 2 : area.y + 60, area.y + area.h - height - 20)) : 0
    const shape: ShapeFrame = { id: newFrameId(), kind: 'table', x, y, w: width, h: height, table, fill: null, stroke: null, strokeWidth: 0, layerId: creationLayerId, z: nextZ(frames, images, shapes) }
    onShapesChange([...shapes, shape], 'table:insert')
    setTool('select')
    setSelectedId(shape.id)
    if (area) setSelectedPage(pageIndex)
    setTableSel({ id: shape.id, r0: 0, c0: 0, r1: 0, c1: 0, editing: true })
    setInsertTableOpen(false)
  }

  const runTableOp = (op: TableOp) => {
    const sh = selectedTable()
    if (!sh) return
    const t = sh.table
    const current = tableSel?.id === sh.id ? expandRange(t, tableSel) : null
    if (op === 'select-table') {
      setTableSel({ id: sh.id, r0: 0, c0: 0, r1: tableRows(t) - 1, c1: tableCols(t) - 1, editing: false })
      return
    }
    if (op === 'select-row') {
      const row = current?.r0 ?? 0
      const range = expandRange(t, { r0: row, c0: 0, r1: row, c1: tableCols(t) - 1 })
      setTableSel({ id: sh.id, ...range, editing: false })
      return
    }
    if (op === 'select-column') {
      const col = current?.c0 ?? 0
      const range = expandRange(t, { r0: 0, c0: col, r1: tableRows(t) - 1, c1: col })
      setTableSel({ id: sh.id, ...range, editing: false })
      return
    }
    if (op === 'options') return setTableOptionsOpen(true)
    if (op === 'cell-options') return tableSel && tableSel.id === sh.id ? setCellOptionsOpen(true) : undefined
    const area = tableSel && tableSel.id === sh.id ? expandRange(t, tableSel) : null
    let next: TableData | null = null
    let pick: { r: number; c: number } | null = null
    if (op === 'row-above') { const at = area ? area.r0 : 0; next = insertRows(t, at); pick = { r: at, c: area?.c0 ?? 0 } }
    else if (op === 'row-below') { const at = area ? area.r1 + 1 : tableRows(t); next = insertRows(t, at); pick = { r: at, c: area?.c0 ?? 0 } }
    else if (op === 'col-start') { const at = area ? area.c0 : 0; next = insertCols(t, at); pick = { r: area?.r0 ?? 0, c: at } }
    else if (op === 'col-end') { const at = area ? area.c1 + 1 : tableCols(t); next = insertCols(t, at); pick = { r: area?.r0 ?? 0, c: at } }
    else if (!area) return
    else if (op === 'delete-row') { next = deleteRows(t, area.r0, area.r1); pick = { r: Math.min(area.r0, tableRows(t) - (area.r1 - area.r0 + 1) - 1), c: area.c0 } }
    else if (op === 'delete-col') { next = deleteCols(t, area.c0, area.c1); pick = { r: area.r0, c: Math.min(area.c0, tableCols(t) - (area.c1 - area.c0 + 1) - 1) } }
    else if (op === 'merge') { next = mergeRange(t, area); pick = { r: area.r0, c: area.c0 } }
    else if (op === 'unmerge') { next = unmergeAt(t, area.r0, area.c0); pick = { r: area.r0, c: area.c0 } }
    if (!next || next === t) return
    commitTable(sh.id, next, `table-op:${op}`)
    if (pick) {
      const origin = originsOf(next).find((o) => o.r0 <= pick.r && o.r1 >= pick.r && o.c0 <= pick.c && o.c1 >= pick.c)
      if (origin) setTableSel({ id: sh.id, r0: origin.r0, c0: origin.c0, r1: origin.r1, c1: origin.c1, editing: false })
    }
  }

  const applyCellPatch = (patch: CellPatch) => {
    const sh = selectedTable()
    if (sh && tableSel && tableSel.id === sh.id) commitTable(sh.id, patchCells(sh.table, tableSel, patch), 'table-cells')
    setCellOptionsOpen(false)
  }

    const applyTableFormatting = (patch: Partial<Pick<TableCell, 'fontFamily' | 'fontSize' | 'leading' | 'tracking' | 'spaceBefore' | 'spaceAfter' | 'weight' | 'italic' | 'color' | 'align'>>) => {
      const sh = selectedTable()
      if (!sh) return
      if (tableSel?.id === sh.id) commitTable(sh.id, patchCells(sh.table, tableSel, patch), 'table-text-style')
      else commitTable(sh.id, { ...sh.table, style: { ...sh.table.style, ...patch } }, 'table-default-text-style')
    }

  // a table is as tall as its text makes it: after a change of its width (or a file written with other fonts) the height is caught up
  useEffect(() => {
    const stale = shapes.flatMap((sh) => {
      const layout = sh.kind === 'table' ? layoutOfShape(sh) : null
      return layout && Math.abs(layout.height - sh.h) > 0.25 ? [[sh.id, layout.height] as const] : []
    })
    if (stale.length === 0) return
    const fixed = new Map(stale)
    onShapesChange(shapes.map((sh) => (fixed.has(sh.id) ? { ...sh, h: fixed.get(sh.id)! } : sh)), 'table:sync', true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes])

  useEffect(() => {
    if (tableSel && tableSel.id !== selectedId) setTableSel(null)
  }, [selectedId, tableSel])

  const updateShape = (id: string, patch: Partial<ShapeFrame>, key?: string) =>
    onShapesChange(shapes.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)), key)

  const copyShapeSize = (targetId: string, sourceId: string) => {
    const target = shapes.find((shape) => shape.id === targetId)
    const source = shapes.find((shape) => shape.id === sourceId)
    if (target && source && target.id !== source.id) updateShape(target.id, { w: source.w, h: source.h }, `shape-size:${target.id}`)
  }

  const applyGapRects = (rectangles: GapObject[], key: string) => {
    const byId = new Map<string, GapMember>()
    for (const rectangle of rectangles) {
      for (const member of expandGapObject(rectangle, MIN_FRAME_PT)) byId.set(member.id, member)
    }
    const update = <T extends { id: string; x: number; y: number; w: number; h: number }>(items: T[]) => {
      let changed = false
      const next = items.map((item) => {
        const rectangle = byId.get(item.id)
        if (!rectangle || (item.x === rectangle.x && item.y === rectangle.y && item.w === rectangle.w && item.h === rectangle.h)) return item
        changed = true
        return { ...item, x: rectangle.x, y: rectangle.y, w: rectangle.w, h: rectangle.h }
      })
      return changed ? next : null
    }
    const nextFrames = update(frames)
    const nextImages = update(images)
    const nextShapes = update(shapes)
    if (nextFrames) onFramesChange(nextFrames, key)
    if (nextImages) onImagesChange(nextImages, key)
    if (nextShapes) onShapesChange(nextShapes, key)
  }
  applyGapRectsRef.current = applyGapRects

  const flipShapeData = (shape: ShapeFrame, axis: 'x' | 'y'): ShapeFrame => {
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
    if (shape.feather?.type === 'gradient') patch.feather = {
      ...shape.feather,
      ...(axis === 'x' ? { x0: 1 - shape.feather.x0, x1: 1 - shape.feather.x1 } : { y0: 1 - shape.feather.y0, y1: 1 - shape.feather.y1 }),
    }
    if (shape.feather?.type === 'directional') patch.feather = axis === 'x'
      ? { ...shape.feather, left: shape.feather.right, right: shape.feather.left }
      : { ...shape.feather, top: shape.feather.bottom, bottom: shape.feather.top }
    return Object.keys(patch).length > 0 ? { ...shape, ...patch } : shape
  }

  const flipShape = (id: string, axis: 'x' | 'y') => {
    const shape = shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    const flipped = flipShapeData(shape, axis)
    if (flipped !== shape) updateShape(id, flipped, `flip:${axis}:${id}`)
  }

  const updateImage = (id: string, patch: Partial<ImageFrame>, key?: string) =>
    onImagesChange(images.map((im) => (im.id === id ? { ...im, ...patch } : im)), key)

  /** move an object in the stacking order (frames and pictures together): one undo step */
  const arrangeObject = (id: string | null, op: ArrangeOp) => {
    if (!id) return
    const r = arrange(frames, images, id, op, shapes, layerOrder)
    if (r) pageOps.commit(r)
  }

  const arrangeSelectedObjects = (op: ArrangeOp) => {
    const selected = new Set(multiSel)
    if (selected.size < 2) return
    let nextFrames = frames
    let nextImages = images
    let nextShapes = shapes
    const orderedIds = stackOrder(frames, images, shapes, layerOrder).filter((item) => selected.has(item.id)).map((item) => item.id)
    if (op === 'forward' || op === 'back') orderedIds.reverse()
    for (const id of orderedIds) {
      const result = arrange(nextFrames, nextImages, id, op, nextShapes, layerOrder)
      if (!result) continue
      nextFrames = result.frames
      nextImages = result.images
      nextShapes = result.shapes
    }
    if (nextFrames === frames && nextImages === images && nextShapes === shapes) return
    if (editingParentId) {
      onParentsChange(parents.map((parent) => parent.id === editingParentId
        ? { ...parent, frames: nextFrames, images: nextImages, shapes: nextShapes }
        : parent), 'parent:multi-arrange')
    } else pageOps.commit({ frames: nextFrames, images: nextImages, shapes: nextShapes })
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
    let last: { page: number; pos: number; remove: boolean; snap: GuideSnap | null; centerSnap: boolean } | null = orig ? { page: orig.page, pos: orig.pos, remove: false, snap: null, centerSnap: false } : null
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
      const world = axis === 'h' ? r.y + pos : r.x + pos
      const centerWorld = axis === 'h' ? r.y + r.h / 2 : r.x + r.w / 2
      const tolerance = SNAP_PX / live.current.zoom
      const guideSnap = ev.altKey || !inside ? null : snapGuide(axis, world, page, id, latestGuides.current, rects, tolerance)
      const centerDistance = Math.abs(centerWorld - world)
      const centerSnap = !ev.altKey && inside && centerDistance <= tolerance && (!guideSnap || centerDistance <= Math.abs(guideSnap.world - world))
      const snap = centerSnap ? null : guideSnap
      if (centerSnap) pos = Math.round(((axis === 'h' ? r.h : r.w) / 2) * 1000) / 1000
      else if (snap) pos = Math.round((snap.world - (axis === 'h' ? r.y : r.x)) * 1000) / 1000
      last = { page, pos, remove: !inside, snap, centerSnap }
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
  const commitMultiObjectChange = (next: { frames?: TextFrame[]; images?: ImageFrame[]; shapes?: ShapeFrame[] }, key: string) => {
    if (editingParentId) {
      onParentsChange(parents.map((parent) => parent.id === editingParentId ? {
        ...parent,
        ...(next.frames ? { frames: next.frames } : {}),
        ...(next.images ? { images: next.images } : {}),
        ...(next.shapes ? { shapes: next.shapes } : {}),
      } : parent), `parent:${key}`)
    } else {
      pageOps.commit(next)
    }
  }
  const flipSelectedShapes = (axis: 'x' | 'y') => {
    const selected = new Set(selectedObjectIds().filter((id) => shapes.some((shape) => shape.id === id)))
    if (selected.size === 0) return
    commitMultiObjectChange({ shapes: shapes.map((shape) => selected.has(shape.id) ? flipShapeData(shape, axis) : shape) }, `multi-flip:${axis}`)
  }
  const setSelectedShapeFill = (color: string | null) => {
    const selected = new Set(selectedObjectIds().filter((id) => shapes.some((shape) => shape.id === id)))
    if (selected.size === 0) return
    commitMultiObjectChange({ shapes: shapes.map((shape) => selected.has(shape.id) ? { ...shape, fill: color, fillGradient: undefined } : shape) }, 'multi-fill')
  }
  const setSelectedShapeStroke = (color: string | null) => {
    const selected = new Set(selectedObjectIds().filter((id) => shapes.some((shape) => shape.id === id)))
    if (selected.size === 0) return
    commitMultiObjectChange({
      shapes: shapes.map((shape) => selected.has(shape.id) ? {
        ...shape,
        stroke: color,
        ...(color === null ? { strokeWidth: 0 } : shape.strokeWidth === 0 ? { strokeWidth: 0.25 } : {}),
      } : shape),
    }, 'multi-stroke')
  }
  const stepSelectedShapeStrokeWidth = (direction: -1 | 1) => {
    const selected = new Set(selectedObjectIds().filter((id) => shapes.some((shape) => shape.id === id)))
    if (selected.size === 0) return
    commitMultiObjectChange({
      shapes: shapes.map((shape) => {
        if (!selected.has(shape.id)) return shape
        const next = direction > 0
          ? shape.strokeWidth === 0 ? 0.25 : (Math.floor(shape.strokeWidth * 4 + 1e-9) + 1) / 4
          : Math.max(0, (Math.ceil(shape.strokeWidth * 4 - 1e-9) - 1) / 4)
        return { ...shape, strokeWidth: Math.min(200, next) }
      }),
    }, 'multi-stroke-width')
  }
  const updateSelectedImages = (update: (image: ImageFrame) => ImageFrame, key: string) => {
    const selected = new Set(selectedObjectIds().filter((id) => images.some((image) => image.id === id)))
    if (selected.size === 0) return
    commitMultiObjectChange({ images: images.map((image) => selected.has(image.id) ? update(image) : image) }, key)
  }
  const setSelectedImageFit = (fit: ImageFrame['fit']) => updateSelectedImages((image) => ({ ...image, fit }), 'multi-image-fit')
  const setSelectedImageWrap = (wrap: ImageFrame['wrap']) => updateSelectedImages((image) => ({ ...image, wrap }), 'multi-image-wrap')
  const flipSelectedImages = (axis: 'x' | 'y') => {
    const selected = selectedObjectIds().filter((id) => images.some((image) => image.id === id))
    const chosen = images.filter((image) => selected.includes(image.id))
    const flipOn = !chosen.every((image) => axis === 'x' ? !!image.flipX : !!image.flipY)
    updateSelectedImages((image) => axis === 'x' ? { ...image, flipX: flipOn } : { ...image, flipY: flipOn }, `multi-image-flip:${axis}`)
  }
  const matchSelectedImageFrames = () => updateSelectedImages((image) => {
    const asset = assets[image.assetId]
    return asset && asset.width > 0 ? { ...image, h: image.w * (asset.height / asset.width) } : image
  }, 'multi-image-match')
  const setSelectedObjectsOpacity = (opacity: number) => {
    const selected = new Set(selectedObjectIds())
    if (selected.size === 0) return
    commitMultiObjectChange({
      frames: frames.map((frame) => selected.has(frame.id) ? { ...frame, opacity } : frame),
      images: images.map((image) => selected.has(image.id) ? { ...image, opacity } : image),
      shapes: shapes.map((shape) => selected.has(shape.id) ? { ...shape, opacity } : shape),
    }, 'multi-opacity')
  }
  const selectedImageShapePair = () => {
    const ids = selectedObjectIds()
    if (ids.length !== 2) return null
    const image = images.find((item) => ids.includes(item.id))
    const shape = shapes.find((item) => ids.includes(item.id))
    if (!image || !shape || !assets[image.assetId] || shape.kind === 'line' || shape.kind === 'table' || shape.kind === 'path' && shape.closed === false) return null
    return { image, shape }
  }
  const insertSelectedImageIntoShape = () => {
    const pair = selectedImageShapePair()
    if (!pair || itemLocks[pair.image.id] || itemLocks[pair.shape.id]) return
    const nextImages = images.filter((image) => image.id !== pair.image.id)
    const nextShapes = shapes.map((shape) => shape.id === pair.shape.id
      ? { ...shape, image: { assetId: pair.image.assetId, fit: pair.image.fit } }
      : shape)
    if (editingParentId) {
      onParentsChange(parents.map((parent) => parent.id === editingParentId
        ? { ...parent, images: nextImages, shapes: nextShapes }
        : parent), 'parent:image-into-shape')
    } else {
      pageOps.commit({ images: nextImages, shapes: nextShapes })
    }
    setSelectedId(pair.shape.id)
    setMultiSel([])
  }

  const objectGroupId = (id: string) => frames.find((f) => f.id === id)?.groupId ?? images.find((im) => im.id === id)?.groupId ?? shapes.find((sh) => sh.id === id)?.groupId
  const objectsInGroup = (groupId: string) => [...frames, ...images, ...shapes].filter((object) => object.groupId === groupId).map((object) => object.id)
  const enterGroupIsolation = (id: string) => {
    const groupId = objectGroupId(id)
    if (!groupId) return false
    setIsolatedGroupId(groupId)
    setSelectedId(id)
    setMultiSel([])
    return true
  }
  const groupSelectedObjects = () => {
    const ids = selectedObjectIds()
    if (ids.length < 2) return
    const groupId = newFrameId()
    const chosen = new Set(ids)
    onFramesChange(frames.map((frame) => chosen.has(frame.id) ? { ...frame, groupId } : frame), 'group:create')
    onImagesChange(images.map((image) => chosen.has(image.id) ? { ...image, groupId } : image), 'group:create')
    onShapesChange(shapes.map((shape) => chosen.has(shape.id) ? { ...shape, groupId } : shape), 'group:create')
  }
  const ungroupSelectedObjects = () => {
    const ids = selectedObjectIds()
    const groups = new Set(ids.map(objectGroupId).filter((id): id is string => !!id))
    if (groups.size === 0) return
    const chosen = new Set(ids.flatMap((id) => { const group = objectGroupId(id); return group ? objectsInGroup(group) : [id] }))
    onFramesChange(frames.map((frame) => chosen.has(frame.id) ? { ...frame, groupId: undefined } : frame), 'group:release')
    onImagesChange(images.map((image) => chosen.has(image.id) ? { ...image, groupId: undefined } : image), 'group:release')
    onShapesChange(shapes.map((shape) => chosen.has(shape.id) ? { ...shape, groupId: undefined } : shape), 'group:release')
  }

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
        return fl ? frameAsOwnStory(f, fl) : { ...f, next: null }
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
    const order = new Map(stackOrder(data.frames, data.images, data.shapes, layerOrder).map((o, i) => [o.id, i]))
    const base = nextZ(frames, images, shapes)
    const layer = (id: string) => base + (order.get(id) ?? 0)
    // objects that were grouped together are grouped together again, as a group of their own (not with the objects they are copies of)
    const groupSizes = new Map<string, number>()
    for (const o of [...data.frames, ...data.images, ...data.shapes]) if (o.groupId) groupSizes.set(o.groupId, (groupSizes.get(o.groupId) ?? 0) + 1)
    const newGroups = new Map<string, string>()
    const groupOf = (groupId: string | undefined) => {
      if (!groupId || (groupSizes.get(groupId) ?? 0) < 2) return undefined
      if (!newGroups.has(groupId)) newGroups.set(groupId, newFrameId())
      return newGroups.get(groupId)
    }
    const moved = <T extends { id: string; x: number; y: number; z?: number; groupId?: string }>(o: T): T => ({ ...o, id: newFrameId(), groupId: groupOf(o.groupId), x: o.x + by.x, y: o.y + by.y, z: layer(o.id) })
    const nf = data.frames.map(moved)
    const ni = data.images.map(moved)
    const ns = data.shapes.map(moved)
    const missing = Object.fromEntries(Object.entries(data.assets).filter(([id]) => !assets[id]))
    if (editingParentId) {
      onParentsChange(parents.map((parent) => parent.id === editingParentId
        ? { ...parent, frames: [...parent.frames, ...nf], images: [...parent.images, ...ni], shapes: [...parent.shapes, ...ns] }
        : parent), 'parent:clipboard-insert')
    } else {
      pageOps.commit({
        frames: [...frames, ...nf],
        images: [...images, ...ni],
        shapes: [...shapes, ...ns],
        ...(Object.keys(missing).length > 0 ? { assets: { ...assets, ...missing } } : {}),
      })
    }
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
    const picked = shapes.filter((sh) => chosen.has(sh.id) && sh.kind !== 'table')
    if (picked.length < 2) return
    const rankOf = new Map(stackOrder(frames, images, shapes, layerOrder).map((o, i) => [o.id, i]))
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

  const selectedImagesToMerge = multiSel.length === 2 ? images.filter((image) => multiSel.includes(image.id)) : []
  const canMergeImages = selectedImagesToMerge.length === 2 && selectedImagesToMerge.every((image) => !!assets[image.assetId])
  type FlattenCandidate =
    | { id: string; kind: 'image'; layerId?: string; z?: number; image: ImageFrame }
    | { id: string; kind: 'shape'; layerId?: string; z?: number; shape: ShapeFrame }
    | { id: string; kind: 'frame'; layerId?: string; z?: number; frame: TextFrame }
  const candidatesForIds = (ids: string[]): FlattenCandidate[] => {
    const candidates: FlattenCandidate[] = []
    for (const id of ids) {
      const image = images.find((candidate) => candidate.id === id)
      if (image) {
        candidates.push({ id, kind: 'image', layerId: image.layerId, z: image.z, image })
        continue
      }
      const shape = shapes.find((candidate) => candidate.id === id)
      if (shape) {
        candidates.push({ id, kind: 'shape', layerId: shape.layerId, z: shape.z, shape })
        continue
      }
      const frame = frames.find((candidate) => candidate.id === id)
      if (frame) candidates.push({ id, kind: 'frame', layerId: frame.layerId, z: frame.z, frame })
    }
    return candidates
  }
  const flattenCandidates = candidatesForIds(multiSel)
  const exportIds = selectedObjectIds()
  const exportCandidates = candidatesForIds(exportIds)
  const hasRequiredAssets = (candidate: FlattenCandidate) =>
    (candidate.kind !== 'image' || !!assets[candidate.image.assetId]) &&
    (candidate.kind !== 'shape' || !candidate.shape.image || !!assets[candidate.shape.image.assetId])
  const canExportPng = exportCandidates.length > 0 &&
    exportCandidates.length === exportIds.length &&
    exportCandidates.every(hasRequiredAssets)

  const captureSelection = async (candidates: FlattenCandidate[]) => {
    const elements = vpRef.current?.querySelectorAll<HTMLElement>('[data-object-id][data-object-kind]')
    if (!elements) throw new Error('canvas is unavailable')
    const captureItems: CaptureItem[] = candidates.flatMap((candidate) => {
      const element = Array.from(elements).find((item) =>
        item.dataset.objectId === candidate.id &&
        item.dataset.objectKind === candidate.kind &&
        !item.closest('.parent-shadow'),
      )
      if (!element) return []
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return []
      const image = candidate.kind === 'image' ? candidate.image : undefined
      return [{
        element,
        bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
        z: rank.get(candidate.id) ?? 0,
        ...(image && assets[image.assetId] ? { imageSource: assets[image.assetId].dataUrl } : {}),
      }]
    })
    if (captureItems.length !== candidates.length) throw new Error('one or more selected objects are not visible')
    const left = Math.min(...captureItems.map((item) => item.bounds.left))
    const top = Math.min(...captureItems.map((item) => item.bounds.top))
    const right = Math.max(...captureItems.map((item) => item.bounds.left + item.bounds.width))
    const bottom = Math.max(...captureItems.map((item) => item.bounds.top + item.bounds.height))
    const bounds = { left, top, width: right - left, height: bottom - top }
    const imageDensities = candidates.flatMap((candidate) => {
      if (candidate.kind === 'image') {
        const asset = assets[candidate.image.assetId]
        return asset ? [asset.width / (candidate.image.w * zoom), asset.height / (candidate.image.h * zoom)] : []
      }
      if (candidate.kind === 'shape' && candidate.shape.image) {
        const asset = assets[candidate.shape.image.assetId]
        const imageBox = asset ? imageGeometry(candidate.shape, asset) : null
        return asset && imageBox ? [asset.width / (imageBox.w * zoom), asset.height / (imageBox.h * zoom)] : []
      }
      return []
    })
    const captureScale = Math.max(Math.min(3, 1 / zoom), ...imageDensities, 1)
    const canvas = await captureObjects(captureItems, bounds, captureScale)
    if (canvas.width < 1 || canvas.height < 1) throw new Error('image capture returned an empty canvas')
    return { canvas, bounds }
  }

  const exportSelectedPng = async () => {
    if (!canExportPng) return
    try {
      const { canvas, bounds } = await captureSelection(exportCandidates)
      const viewport = vpRef.current
      if (!viewport) throw new Error('canvas viewport is unavailable')
      const viewportBounds = viewport.getBoundingClientRect()
      const pageBoxes: ScreenBox[] = rects.map((page) => ({
        left: viewportBounds.left + vp.sb - getScrollX(viewport) + tx + page.x * zoom,
        top: viewportBounds.top - viewport.scrollTop + ty + page.y * zoom,
        width: page.w * zoom,
        height: page.h * zoom,
      }))
      const clippedCanvas = clipCanvasToBoxes(canvas, bounds, pageBoxes)
      const safeName = doc.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '-').trim() || 'Imudist'
      await deliverPng(clippedCanvas, `${safeName}-selection`)
    } catch (error) {
      console.error('Could not export the selected objects as PNG.', error)
    }
  }
  const canCreateImage =
    flattenCandidates.length === multiSel.length &&
    flattenCandidates.length >= 2 &&
    flattenCandidates.every((candidate) =>
      !itemLocks[candidate.id] &&
      (candidate.kind !== 'image' || !!assets[candidate.image.assetId]) &&
      (candidate.kind !== 'shape' || !candidate.shape.image || !!assets[candidate.shape.image.assetId]),
    )

  const createImageFromSelection = async () => {
    if (!canCreateImage) return
    try {
      const { canvas, bounds } = await captureSelection(flattenCandidates)
      const imageAssetId = newFrameId()
      const imageAsset: Asset = {
        name: `תמונה מאוחדת — ${flattenCandidates.length} אובייקטים.png`,
        mime: 'image/png',
        dataUrl: canvasDataUrl(canvas),
        width: canvas.width,
        height: canvas.height,
      }
      const topmost = [...flattenCandidates].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).at(-1)!
      const worldOrigin = toWorld(bounds.left, bounds.top)
      const mergedImage: ImageFrame = {
        id: newFrameId(),
        label: 'תמונה מאוחדת',
        layerId: topmost.layerId ?? creationLayerId,
        x: worldOrigin.x,
        y: worldOrigin.y,
        w: bounds.width / zoom,
        h: bounds.height / zoom,
        assetId: imageAssetId,
        fit: 'stretch',
        z: topmost.z,
        ...(topmost.kind === 'image' ? { wrap: topmost.image.wrap, wrapOffset: topmost.image.wrapOffset } : {}),
      }
      const selected = new Set(multiSel)
      const nextAssets = { ...assetsRef.current, [imageAssetId]: imageAsset }
      if (editingParentId) {
        pageOps.commit({
          assets: nextAssets,
          parents: parents.map((parent) => parent.id !== editingParentId ? parent : {
            ...parent,
            frames: parent.frames.filter((frame) => !selected.has(frame.id)),
            images: [...parent.images.filter((image) => !selected.has(image.id)), mergedImage],
            shapes: parent.shapes.filter((shape) => !selected.has(shape.id)),
          }),
        })
      } else {
        pageOps.commit({
          assets: nextAssets,
          frames: frames.filter((frame) => !selected.has(frame.id)),
          images: [...images.filter((image) => !selected.has(image.id)), mergedImage],
          shapes: shapes.filter((shape) => !selected.has(shape.id)),
        })
      }
      setMultiSel([])
      setGuideSel([])
      setSelectedIdRaw(mergedImage.id)
      setSelectedPage(ownerPage(rects, mergedImage.x + mergedImage.w / 2, mergedImage.y + mergedImage.h / 2))
    } catch (error) {
      console.error('Could not create an image from the selected objects.', error)
    }
  }

  const mergeSelectedImages = async () => {
    if (!canMergeImages) return
    const ordered = [...selectedImagesToMerge].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    const loaded = await Promise.all(ordered.map((image) => new Promise<{ image: ImageFrame; asset: Asset; bitmap: HTMLImageElement }>((resolve, reject) => {
      const asset = assets[image.assetId]
      const bitmap = new Image()
      bitmap.onload = () => resolve({ image, asset, bitmap })
      bitmap.onerror = () => reject(new Error('image failed to load'))
      bitmap.src = asset.dataUrl
    })))
    const corners = loaded.flatMap(({ image }) => {
      const cx = image.x + image.w / 2
      const cy = image.y + image.h / 2
      const angle = ((image.rotation ?? 0) * Math.PI) / 180
      return [[image.x, image.y], [image.x + image.w, image.y], [image.x + image.w, image.y + image.h], [image.x, image.y + image.h]].map(([x, y]) => ({
        x: cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
        y: cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle),
      }))
    })
    const left = Math.min(...corners.map((point) => point.x))
    const top = Math.min(...corners.map((point) => point.y))
    const right = Math.max(...corners.map((point) => point.x))
    const bottom = Math.max(...corners.map((point) => point.y))
    const worldWidth = right - left
    const worldHeight = bottom - top
    const density = Math.max(1, ...loaded.flatMap(({ image, asset }) => [asset.width / image.w, asset.height / image.h]))
    const scale = Math.min(density, 12000 / worldWidth, 12000 / worldHeight, Math.sqrt(40_000_000 / (worldWidth * worldHeight)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(worldWidth * scale))
    canvas.height = Math.max(1, Math.ceil(worldHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    for (const { image, bitmap } of loaded) {
      const width = image.w * scale
      const height = image.h * scale
      context.save()
      context.translate((image.x + image.w / 2 - left) * scale, (image.y + image.h / 2 - top) * scale)
      context.rotate(((image.rotation ?? 0) * Math.PI) / 180)
      context.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1)
      context.beginPath()
      context.rect(-width / 2, -height / 2, width, height)
      context.clip()
      context.globalAlpha = image.opacity ?? 1
      let drawWidth = width
      let drawHeight = height
      if (image.fit !== 'stretch') {
        const fitScale = image.fit === 'fit'
          ? Math.min(width / bitmap.naturalWidth, height / bitmap.naturalHeight)
          : Math.max(width / bitmap.naturalWidth, height / bitmap.naturalHeight)
        drawWidth = bitmap.naturalWidth * fitScale
        drawHeight = bitmap.naturalHeight * fitScale
      }
      context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      context.restore()
    }
    bridgeTransparentSeams(canvas)
    const trimmed = trimTransparentBounds(canvas)
    if (!trimmed) return
    const topmost = ordered[ordered.length - 1]
    const mergedAssetId = newFrameId()
    const mergedAsset: Asset = {
      name: `מיזוג — ${loaded.map(({ asset }) => asset.name).join(' + ')}`,
      mime: 'image/png',
      dataUrl: canvasDataUrl(trimmed.canvas),
      width: trimmed.canvas.width,
      height: trimmed.canvas.height,
    }
    const mergedFrame: ImageFrame = {
      id: newFrameId(),
      label: 'מיזוג תמונות',
      layerId: topmost.layerId ?? creationLayerId,
      x: left + trimmed.left / scale,
      y: top + trimmed.top / scale,
      w: trimmed.canvas.width / scale,
      h: trimmed.canvas.height / scale,
      assetId: mergedAssetId,
      fit: 'stretch',
      z: topmost.z,
      wrap: topmost.wrap,
      wrapOffset: topmost.wrapOffset,
    }
    const mergedIds = new Set(ordered.map((image) => image.id))
    const nextImages = [...images.filter((image) => !mergedIds.has(image.id)), mergedFrame]
    const nextAssets = { ...assets, [mergedAssetId]: mergedAsset }
    if (editingParentId) {
      pageOps.commit({
        assets: nextAssets,
        parents: parents.map((parent) => parent.id === editingParentId ? { ...parent, images: [...parent.images.filter((image) => !mergedIds.has(image.id)), mergedFrame] } : parent),
      })
    } else {
      pageOps.commit({ images: nextImages, assets: nextAssets })
    }
    setMultiSel([])
    setSelectedIdRaw(mergedFrame.id)
    setSelectedPage(ownerPage(rects, mergedFrame.x + mergedFrame.w / 2, mergedFrame.y + mergedFrame.h / 2))
  }

  /** delete text frames, pictures, shapes and guides in one undo step */
  const deleteSelection = (ids: string[], guideIds: string[]) => {
    const gone = new Set(ids)
    const goneGuides = new Set(guideIds)
    if (ids.length > 0) {
      const nextFrames = ids.reduce((acc, id) => (acc.some((f) => f.id === id) ? removeFrame(acc, id) : acc), frames)
      const nextImages = images.filter((im) => !gone.has(im.id))
      const nextShapes = shapes.filter((sh) => !gone.has(sh.id))
      if (editingParentId) {
        onFramesChange(nextFrames, 'delete:objects')
        onImagesChange(nextImages, 'delete:objects')
        onShapesChange(nextShapes, 'delete:objects')
      } else {
        pageOps.commit({ frames: nextFrames, images: nextImages, shapes: nextShapes })
      }
    }
    if (goneGuides.size > 0) onGuidesChange(guides.filter((g) => !goneGuides.has(g.id)), 'delete:guides')
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
    const groupId = objectGroupId(id)
    if (tool === 'select' && groupId && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.stopPropagation()
      e.preventDefault()
      setGuideSel([])
      setEditingId(null)
      setMultiSel(objectsInGroup(groupId))
      setSelectedIdRaw(null)
      const groupObjects = [...frames, ...images, ...shapes].filter((object) => object.groupId === groupId)
      const origins = new Map(groupObjects.map((object) => [object.id, { x: object.x, y: object.y }]))
      dragSeq.current += 1
      groupDrag.current = { origins, start: toWorld(e.clientX, e.clientY), key: `group:${dragSeq.current}` }
      vpRef.current?.setPointerCapture(e.pointerId)
      return true
    }
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

  const placeVectorShapes = (imported: VectorShapeData[]) => {
    const viewport = vpRef.current
    if (!viewport || imported.length === 0) return false
    const minX = Math.min(...imported.map((shape) => shape.x))
    const minY = Math.min(...imported.map((shape) => shape.y))
    const maxX = Math.max(...imported.map((shape) => shape.x + shape.w))
    const maxY = Math.max(...imported.map((shape) => shape.y + shape.h))
    const contentWidth = Math.max(0.01, maxX - minX)
    const contentHeight = Math.max(0.01, maxY - minY)
    const page = pageSize(doc, selectedPage)
    const scale = Math.min(1, page.w * 0.8 / contentWidth, page.h * 0.8 / contentHeight)
    const viewportRect = viewport.getBoundingClientRect()
    const center = toWorld(viewportRect.left + viewport.clientWidth / 2, viewportRect.top + viewport.clientHeight / 2)
    const z = nextZ(frames, images, shapes)
    const placed = imported.map((shape, index): ShapeFrame => ({
      ...shape,
      layerId: creationLayerId,
      x: center.x + (shape.x - (minX + maxX) / 2) * scale,
      y: center.y + (shape.y - (minY + maxY) / 2) * scale,
      w: shape.w * scale,
      h: shape.h * scale,
      strokeWidth: shape.strokeWidth * scale,
      z: z + index,
    }))
    onShapesChange([...shapes, ...placed], 'eps:import')
    setMultiSel(placed.map((shape) => shape.id))
    setSelectedIdRaw(null)
    setTool('select')
    setSelectedPage(ownerPage(rects, center.x, center.y))
    return true
  }

  const applyGuideRequest = (r: CreateGuidesRequest) => {
    const pages = r.allPages ? Array.from({ length: doc.pages }, (_, i) => i) : [selPage]
    setGuideColor(r.color)
    onGuidesChange(applyGuideSpec(doc, pageSidesOf(doc), guides, pages, r.spec, r.color, r.replace, newGuideId))
    setGuidesDialog(false)
    onShowGuides()
  }

  const currentPageIndex = () => {
    const spread = spreads[cur]
    if (!spread?.pages.length) return 0
    const selected = spread.pages.find((page) => page.index === selPage)
    if (selected) return selected.index
    const centerX = (scroll.x + vp.w / 2 - tx) / zoom
    return [...spread.pages].sort((a, b) =>
      Math.abs(a.x + a.w / 2 - centerX) - Math.abs(b.x + b.w / 2 - centerX),
    )[0].index
  }

  const removeBackgroundFromSelection = () => {
    const image = selectedId ? images.find((candidate) => candidate.id === selectedId) : undefined
    if (!image) {
      onNotify('בחרו תמונה בעמוד כדי להסיר את הרקע שלה.')
      return
    }
    const sourceAsset = assets[image.assetId]
    if (!sourceAsset) {
      onShowError('הסרת הרקע נכשלה', new Error('קובץ התמונה אינו זמין במסמך.'))
      return
    }
    if (documentSessionId === null) {
      onNotify('אי אפשר להסיר רקע במצב תצוגה מקדימה.')
      return
    }
    if (removingBackgroundId !== null) {
      onNotify('הסרת הרקע כבר מתבצעת.')
      return
    }
    const { id: imageId, assetId: expectedAssetId } = image
    const docId = documentSessionId
    const parentId = editingParentId
    setRemovingBackgroundId(imageId)
    onNotify('מסיר את הרקע במחשב…')
    void removeImageBackground(sourceAsset)
      .then(({ assetId, asset }) => {
        if (!onReplaceImageAsset(docId, parentId, imageId, expectedAssetId, assetId, asset)) {
          throw new Error('התמונה השתנתה או הוסרה לפני סיום העיבוד, ולכן התוצאה לא הוחלה.')
        }
        onNotify('הרקע הוסר. אפשר לבטל כדי לחזור לתמונה המקורית.')
      })
      .catch((error: unknown) => onShowError('הסרת הרקע נכשלה', error))
      .finally(() => setRemovingBackgroundId(null))
  }

  useImperativeHandle(ref, () => ({
    goToIssue,
    selectTool: activateTool,
    zoomIn: () => zoomAt(stepZoom(zoom, 1), vp.w / 2, vp.h / 2),
    zoomOut: () => zoomAt(stepZoom(zoom, -1), vp.w / 2, vp.h / 2),
    fitPage: () => fitPage(),
    fitSpread: () => fitSpread(),
    actualSize: () => zoomAt(1, vp.w / 2, vp.h / 2),
    firstPage: () => goTo(0),
    prevPage: () => goTo(cur - 1),
    nextPage: () => goTo(cur + 1),
    lastPage: () => goTo(spreads.length - 1),
    currentPageIndex,
    selectAllText,
    placeVectorShapes,
    addPage: () => insertPages(1, 'after'),
    deletePage: deleteSelectedPage,
    arrange: (op) => arrangeObject(selectedId, op),
    removeBackgroundFromSelection,
    shapeOp: (op) => combineSelectedShapes(op),
    group: groupSelectedObjects,
    ungroup: ungroupSelectedObjects,
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
    insertRunningHeader,
    insertTableOfContents: () => setTocDialogOpen(true),
    firstWordStyler: () => setFirstWordDialog(true),
    windowText: () => setWindowTextDialog(true),
    insertTable: () => setInsertTableOpen(true),
    tableCommand: runTableOp,
    findReplace: () => openFind(),
    canReplaceSelectedText: () => !!selectedId && !!frames.find((frame) => frame.id === selectedId),
    replaceSelectedText,
    insertPageNumberMarker,
    openSmartLayout: () => setSmartLayoutDialog(true),
    insertFootnote,
    openFootnoteOptions: () => setFootnoteOptionsOpen(true),
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

  // Ctrl/meta+wheel pans horizontally; Alt alone zooms towards the pointer.
  useEffect(() => {
    const el = vpRef.current!
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
        const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1
        setScrollX(el, getScrollX(el) + delta * multiplier)
        return
      }
      if (e.altKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025))
        zoomAtRef.current(live.current.zoom * factor, e.clientX - rect.left - live.current.sb, e.clientY - rect.top)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onFootnoteShortcut = (event: KeyboardEvent) => {
      const inEditor = event.target instanceof HTMLElement && !!event.target.closest('.rich-editor')
      if (!inEditor || !textSel || !(event.ctrlKey || event.metaKey) || !event.altKey || !event.shiftKey || event.code !== 'KeyF') return
      event.preventDefault()
      insertFootnote()
    }
    window.addEventListener('keydown', onFootnoteShortcut)
    return () => window.removeEventListener('keydown', onFootnoteShortcut)
  }, [textSel, frames])

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
      if (t) activateTool(t.id)
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
  }, [activateTool])

  // Delete removes the selected frame or guides, arrows nudge them (Shift = 10 pt), Escape deselects / cancels linking
  useEffect(() => {
    const guidesSelected = guidesVisible && guideSel.length > 0
    if (!selectedId && !linkFrom && !guidesSelected && multiSel.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (((selectedId && itemLocks[selectedId]) || multiSel.some((id) => itemLocks[id])) && e.key !== 'Escape') return
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
  }, [selectedId, multiSel, guideSel, guidesVisible, linkFrom, frames, images, shapes, guides, itemLocks, onFramesChange, onImagesChange, onShapesChange, onGuidesChange, tool, pointSel])


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

  /** the topmost unlocked, visible frame/picture/shape whose bounding box overlaps a world-space rectangle — resolved from
   *  the drawn marquee at release, so the drag may start outside the target and still cut it in two. */
  const marqueeTargetIn = (x0: number, y0: number, x1: number, y1: number): MarqueeTarget | null => {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)]
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)]
    const overlaps = (o: { x: number; y: number; w: number; h: number }) => o.x < bx && o.x + o.w > ax && o.y < by && o.y + o.h > ay
    const candidates = [
      ...visibleFrames.filter((f) => !itemLocks[f.id] && overlaps(f)).map((f) => ({ id: f.id, kind: 'frame' as const, layerId: f.layerId, z: f.z ?? 1, name: 'תיבת טקסט' })),
      ...visibleImages.filter((im) => !itemLocks[im.id] && overlaps(im)).map((im) => ({ id: im.id, kind: 'image' as const, layerId: im.layerId, z: im.z ?? 0, name: assets[im.assetId]?.name ?? 'תמונה' })),
      ...visibleShapes.filter((sh) => !itemLocks[sh.id] && overlaps(sh)).map((sh) => ({ id: sh.id, kind: 'shape' as const, layerId: sh.layerId, z: sh.z ?? 1, name: sh.kind === 'path' ? 'נתיב' : 'צורה' })),
    ]
    if (candidates.length === 0) return null
    const top = candidates.reduce((best, c) => ((rank.get(c.id) ?? 0) > (rank.get(best.id) ?? 0) ? c : best))
    const element = vpRef.current?.querySelector<HTMLElement>(`[data-object-id="${top.id}"][data-object-kind="${top.kind}"]`)
    if (!element || element.closest('.parent-shadow')) return null
    const bounds = element.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return { id: top.id, kind: top.kind, element, bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }, layerId: top.layerId, z: top.z, name: top.name }
  }

  const imagePixelAt = (image: ImageFrame, asset: Asset, point: { x: number; y: number }) => {
    const cx = image.x + image.w / 2
    const cy = image.y + image.h / 2
    const angle = ((image.rotation ?? 0) * Math.PI) / 180
    let x = (point.x - cx) * Math.cos(angle) + (point.y - cy) * Math.sin(angle)
    let y = -(point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle)
    if (image.flipX) x = -x
    if (image.flipY) y = -y
    x += image.w / 2
    y += image.h / 2
    const fitScale = image.fit === 'stretch' ? null : image.fit === 'fit'
      ? Math.min(image.w / asset.width, image.h / asset.height)
      : Math.max(image.w / asset.width, image.h / asset.height)
    const contentWidth = fitScale === null ? image.w : asset.width * fitScale
    const contentHeight = fitScale === null ? image.h : asset.height * fitScale
    const offsetX = (image.w - contentWidth) / 2
    const offsetY = (image.h - contentHeight) / 2
    if (x < offsetX || x > offsetX + contentWidth || y < offsetY || y > offsetY + contentHeight) return null
    return { x: ((x - offsetX) / contentWidth) * asset.width, y: ((y - offsetY) / contentHeight) * asset.height }
  }

  const samplerCanvas = (asset: Asset) => {
    let cached = samplerImageCache.current.get(asset.dataUrl)
    if (!cached) {
      cached = new Promise<HTMLCanvasElement>((resolve, reject) => {
        const bitmap = new Image()
        bitmap.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.naturalWidth || asset.width
          canvas.height = bitmap.naturalHeight || asset.height
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) return reject(new Error('canvas context unavailable'))
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          resolve(canvas)
        }
        bitmap.onerror = () => reject(new Error('image failed to load'))
        bitmap.src = asset.dataUrl
      })
      samplerImageCache.current.set(asset.dataUrl, cached)
    }
    return cached
  }

  const cssColorHex = (value: string) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return '#000000'
    context.fillStyle = '#000000'
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    return rgbToHex({ red, green, blue })
  }

  const shapeColorAt = (shape: ShapeFrame, point: { x: number; y: number }) => {
    const gradient = shape.fillGradient
    if (!gradient?.stops?.length) return shape.fill ?? shape.stroke ?? '#000000'
    const centerX = shape.x + shape.w / 2
    const centerY = shape.y + shape.h / 2
    const radians = ((shape.rotation ?? 0) * Math.PI) / 180
    const dx = point.x - centerX
    const dy = point.y - centerY
    const x = dx * Math.cos(radians) + dy * Math.sin(radians) + shape.w / 2
    const y = -dx * Math.sin(radians) + dy * Math.cos(radians) + shape.h / 2
    let position: number
    if (gradient.type === 'radial') {
      position = Math.min(1, Math.hypot(x - shape.w / 2, y - shape.h / 2) / (Math.max(shape.w, shape.h) * 0.7))
    } else {
      const line = linearGradientLine((gradient.angle ?? 0) + (gradient.reverse ? 180 : 0), shape.w, shape.h)
      const lineX = line.x2 - line.x1
      const lineY = line.y2 - line.y1
      position = Math.max(0, Math.min(1, ((x - line.x1) * lineX + (y - line.y1) * lineY) / (lineX * lineX + lineY * lineY || 1)))
    }
    const stops = [...gradient.stops].sort((a, b) => a.offset - b.offset)
    const upper = stops.findIndex((stop) => stop.offset >= position)
    if (upper <= 0) return stops[upper < 0 ? stops.length - 1 : upper].color
    const before = stops[upper - 1]
    const after = stops[upper]
    const amount = (position - before.offset) / Math.max(0.0001, after.offset - before.offset)
    const start = hexToRgb(before.color)
    const end = hexToRgb(after.color)
    return rgbToHex({
      red: start.red + (end.red - start.red) * amount,
      green: start.green + (end.green - start.green) * amount,
      blue: start.blue + (end.blue - start.blue) * amount,
    })
  }

  const shapeImagePixelAt = (shape: ShapeFrame, asset: Asset, point: { x: number; y: number }) => {
    const centerX = shape.x + shape.w / 2
    const centerY = shape.y + shape.h / 2
    const radians = ((shape.rotation ?? 0) * Math.PI) / 180
    const dx = point.x - centerX
    const dy = point.y - centerY
    const x = dx * Math.cos(radians) + dy * Math.sin(radians) + shape.w / 2
    const y = -dx * Math.sin(radians) + dy * Math.cos(radians) + shape.h / 2
    const box = imageGeometry(shape, asset)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h || box.w <= 0 || box.h <= 0) return null
    return { x: ((x - box.x) / box.w) * asset.width, y: ((y - box.y) / box.h) * asset.height }
  }

  const updateColorSampler = async (clientX: number, clientY: number): Promise<string | null> => {
    const moveToken = ++samplerMoveToken.current
    const target = document.elementsFromPoint(clientX, clientY).map((element) => element.closest<HTMLElement>('[data-object-id][data-object-kind]')).find((element): element is HTMLElement => !!element)
    const kind = target?.dataset.objectKind
    const id = target?.dataset.objectId
    const image = kind === 'image' ? images.find((item) => item.id === id) ?? parentShadows.images.find((item) => item.id === id) : undefined
    const shape = kind === 'shape' ? shapes.find((item) => item.id === id) ?? parentShadows.shapes.find((item) => item.id === id) : undefined
    const asset = image ? assets[image.assetId] : shape?.image ? assets[shape.image.assetId] : undefined
    const samplesImage = !!asset && (!!image || !!shape?.image)
    const pixels: string[] = []
    let centerColor = '#ffffff'
    try {
      const canvas = asset ? await samplerCanvas(asset) : null
      if (moveToken !== samplerMoveToken.current) return null
      const context = canvas?.getContext('2d', { willReadFrequently: true })
      const imagePointAt = (point: { x: number; y: number }) => image && asset ? imagePixelAt(image, asset, point) : shape && asset && shape.image ? shapeImagePixelAt(shape, asset, point) : null
      const imageCenter = samplesImage ? imagePointAt(toWorld(clientX, clientY)) : null
      const imagePoints = samplesImage && asset && canvas && context
        ? Array.from({ length: 81 }, (_, index) => {
            const row = Math.floor(index / 9) - 4
            const column = index % 9 - 4
            if (!imageCenter) return null
            const world = toWorld(clientX + column, clientY + row)
            return image && asset ? imagePixelAt(image, asset, world) : shape && asset ? shapeImagePixelAt(shape, asset, world) : null
          })
        : null
      const validImagePoints = imagePoints?.filter((point): point is { x: number; y: number } => !!point) ?? []
      const imageRegion = validImagePoints.length && canvas && context
        ? (() => {
            const left = Math.min(canvas.width - 1, Math.max(0, Math.floor(Math.min(...validImagePoints.map((point) => point.x)))))
            const top = Math.min(canvas.height - 1, Math.max(0, Math.floor(Math.min(...validImagePoints.map((point) => point.y)))))
            const right = Math.min(canvas.width, Math.ceil(Math.max(...validImagePoints.map((point) => point.x))) + 1)
            const bottom = Math.min(canvas.height, Math.ceil(Math.max(...validImagePoints.map((point) => point.y))) + 1)
            const width = Math.max(1, right - left)
            const height = Math.max(1, bottom - top)
            return { left, top, width, data: context.getImageData(left, top, width, height).data }
          })()
        : null
      let pixelIndex = 0
      for (let row = -4; row <= 4; row++) {
        for (let column = -4; column <= 4; column++) {
          const world = toWorld(clientX + column, clientY + row)
          let color = '#ffffff'
          if (samplesImage && asset && canvas && imagePoints) {
            const pixel = imagePoints[pixelIndex]
            if (pixel && imageRegion) {
              const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.floor(pixel.x)))
              const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.floor(pixel.y)))
              const offset = ((sampleY - imageRegion.top) * imageRegion.width + sampleX - imageRegion.left) * 4
              const alpha = imageRegion.data[offset + 3] / 255
              const backdrop = shape ? hexToRgb(shapeColorAt(shape, world)) : { red: 255, green: 255, blue: 255 }
              color = rgbToHex({ red: imageRegion.data[offset] * alpha + backdrop.red * (1 - alpha), green: imageRegion.data[offset + 1] * alpha + backdrop.green * (1 - alpha), blue: imageRegion.data[offset + 2] * alpha + backdrop.blue * (1 - alpha) })
            } else if (shape) color = shapeColorAt(shape, world)
          } else if (shape) {
            color = shapeColorAt(shape, world)
          } else if (kind === 'frame' && target) {
            color = cssColorHex(getComputedStyle(document.elementFromPoint(clientX + column, clientY + row) ?? target).color)
          }
          pixels.push(color)
          if (row === 0 && column === 0) centerColor = color
          pixelIndex++
        }
      }
      if (moveToken === samplerMoveToken.current) setColorSamplerPreview({ ...samplerLensPosition(clientX, clientY), color: centerColor, pixels, source: kind ?? 'page' })
      return centerColor
    } catch {
      if (moveToken === samplerMoveToken.current) setColorSamplerPreview({ ...samplerLensPosition(clientX, clientY), color: centerColor, pixels: Array(81).fill(centerColor), source: kind ?? 'page' })
      return centerColor
    }
  }

  const samplerLensPosition = (clientX: number, clientY: number) => {
    const left = Math.max(0, Math.min(clientX - 42, window.innerWidth - 84))
    const top = Math.max(0, Math.min(clientY - 42, window.innerHeight - 84))
    const readoutTop = top > window.innerHeight - 112 ? -22 : 88
    return { left, top, focusX: clientX - left, focusY: clientY - top, readoutTop }
  }

  const moveColorSamplerLens = (clientX: number, clientY: number) => {
    const position = samplerLensPosition(clientX, clientY)
    const lens = colorSamplerLensRef.current
    if (lens) {
      lens.style.left = `${position.left}px`
      lens.style.top = `${position.top}px`
      lens.style.setProperty('--sampler-focus-x', `${position.focusX}px`)
      lens.style.setProperty('--sampler-focus-y', `${position.focusY}px`)
      lens.style.setProperty('--sampler-readout-top', `${position.readoutTop}px`)
    } else {
      setColorSamplerPreview((current) => current ?? { ...position, color: '#ffffff', pixels: Array(81).fill('#ffffff'), source: 'page' })
    }
  }

  const addColorSample = (color: string) => {
    pageOps.commit({ colorSamples: [...colorSamples, { id: globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now()}`, color, label: `דגימה ${colorSamples.length + 1}` }] })
    setRasterBrushColor(color)
    setColorSamplerActive(false)
    setColorSamplerPreview(null)
  }

  const startColorSampler = () => {
    setRasterBrushColor(null)
    setColorSamplerActive(true)
    setColorSamplerPreview(null)
  }

  const toggleColorSamplerTool = () => {
    if (dockOpenId === 'color') {
      onDockOpenChange(null)
      setColorSamplerActive(false)
      setColorSamplerPreview(null)
      return
    }
    if (enabledDockPanelIds.includes('color')) onDockOpenChange('color')
    else onDockPanelToggle('color')
    startColorSampler()
  }

  const deleteColorSample = (id: string) => pageOps.commit({ colorSamples: colorSamples.filter((sample) => sample.id !== id) })

  const beginRepairStroke = (image: ImageFrame, event: ReactPointerEvent<HTMLDivElement>) => {
    const asset = assets[image.assetId]
    if (!asset) return
    const point = imagePixelAt(image, asset, toWorld(event.clientX, event.clientY))
    if (!point) return
    const fitScale = image.fit === 'stretch' ? null : image.fit === 'fit'
      ? Math.min(image.w / asset.width, image.h / asset.height)
      : Math.max(image.w / asset.width, image.h / asset.height)
    const contentWidth = fitScale === null ? image.w : asset.width * fitScale
    repairStroke.current = {
      id: image.id,
      assetId: image.assetId,
      points: [point],
      radius: Math.max(1, (eraserRadius * asset.width) / (contentWidth * zoom)),
    }
    setSelectedPage(ownerPage(rects, image.x + image.w / 2, image.y + image.h / 2))
    setSelectedId(image.id)
    setEditingId(null)
    event.preventDefault()
    event.stopPropagation()
    vpRef.current?.setPointerCapture(event.pointerId)
  }

  const finishRepairStroke = async (stroke: NonNullable<typeof repairStroke.current>) => {
    const image = images.find((candidate) => candidate.id === stroke.id)
    const asset = assets[stroke.assetId]
    if (!image || image.assetId !== stroke.assetId || !asset || stroke.points.length === 0) return
    try {
      const bitmap = new Image()
      await new Promise<void>((resolve, reject) => {
        bitmap.onload = () => resolve()
        bitmap.onerror = () => reject(new Error('image failed to load'))
        bitmap.src = asset.dataUrl
      })
      const source = document.createElement('canvas')
      source.width = bitmap.naturalWidth || asset.width
      source.height = bitmap.naturalHeight || asset.height
      source.getContext('2d')?.drawImage(bitmap, 0, 0, source.width, source.height)
      const repaired = repairImageStroke(source, stroke.points, stroke.radius)
      const nextAssetId = newFrameId()
      const nextAsset: Asset = {
        name: `${asset.name.replace(/\.png$/i, '')} — תיקון.png`,
        mime: 'image/png',
        dataUrl: canvasDataUrl(repaired),
        width: repaired.width,
        height: repaired.height,
      }
      const nextAssets = { ...assets, [nextAssetId]: nextAsset }
      const nextImages = images.map((candidate) => candidate.id === image.id ? { ...candidate, assetId: nextAssetId } : candidate)
      if (editingParentId) {
        pageOps.commit({
          assets: nextAssets,
          parents: parents.map((parent) => parent.id === editingParentId ? { ...parent, images: parent.images.map((candidate) => candidate.id === image.id ? { ...candidate, assetId: nextAssetId } : candidate) } : parent),
        })
      } else {
        pageOps.commit({ assets: nextAssets, images: nextImages })
      }
    } catch (error) {
      console.warn('Could not repair the image seam.', error)
    }
  }

  const beginPaintStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const color = rasterBrushColor
    if (!color) return
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-object-id][data-object-kind]')
      : null
    const kind = target?.dataset.objectKind
    const id = target?.dataset.objectId
    if (!target || target.classList.contains('locked') || !id || (kind !== 'image' && kind !== 'shape') || itemLocks[id]) return
    const image = kind === 'image' ? images.find((candidate) => candidate.id === id) : undefined
    const shape = kind === 'shape' ? shapes.find((candidate) => candidate.id === id && !!candidate.image) : undefined
    const assetId = image?.assetId ?? shape?.image?.assetId
    const asset = assetId ? assets[assetId] : undefined
    const object = image ?? shape
    if (!asset || !assetId || !object) return
    const pointAt = (point: { x: number; y: number }) => image
      ? imagePixelAt(image, asset, point)
      : shape?.image ? shapeImagePixelAt(shape, asset, point) : null
    const point = pointAt(toWorld(event.clientX, event.clientY))
    if (!point) return
    const contentWidth = image
      ? image.fit === 'stretch'
        ? image.w
        : asset.width * (image.fit === 'fit' ? Math.min(image.w / asset.width, image.h / asset.height) : Math.max(image.w / asset.width, image.h / asset.height))
      : shape?.image ? imageGeometry(shape, asset).w : 0
    paintStroke.current = {
      kind: image ? 'image' : 'shape',
      id,
      assetId,
      points: [point],
      radius: Math.max(1, (eraserRadius * asset.width) / (contentWidth * zoom)),
      color,
      strength: rasterBrushStrength,
    }
    setEraserPoint(toWorld(event.clientX, event.clientY))
    setSelectedPage(ownerPage(rects, object.x + object.w / 2, object.y + object.h / 2))
    setSelectedId(id)
    setEditingId(null)
    event.preventDefault()
    event.stopPropagation()
    vpRef.current?.setPointerCapture(event.pointerId)
  }

  const finishPaintStroke = async (stroke: NonNullable<typeof paintStroke.current>) => {
    const image = stroke.kind === 'image' ? images.find((candidate) => candidate.id === stroke.id) : undefined
    const shape = stroke.kind === 'shape' ? shapes.find((candidate) => candidate.id === stroke.id) : undefined
    const asset = assetsRef.current[stroke.assetId]
    if ((!image && !shape) || (image && image.assetId !== stroke.assetId) || (shape && shape.image?.assetId !== stroke.assetId) || !asset || stroke.points.length === 0) return
    try {
      const source = await samplerCanvas(asset)
      const painted = paintImageStroke(source, stroke.points, stroke.radius, stroke.color, stroke.strength)
      const nextAssetId = newFrameId()
      const nextAsset: Asset = {
        name: `${asset.name.replace(/\.png$/i, '')} — צביעה.png`,
        mime: 'image/png',
        dataUrl: canvasDataUrl(painted),
        width: painted.width,
        height: painted.height,
      }
      const nextAssets = { ...assetsRef.current, [nextAssetId]: nextAsset }
      if (editingParentId) {
        pageOps.commit({
          assets: nextAssets,
          parents: parents.map((parent) => parent.id !== editingParentId ? parent : {
            ...parent,
            images: image ? parent.images.map((candidate) => candidate.id === image.id ? { ...candidate, assetId: nextAssetId } : candidate) : parent.images,
            shapes: shape ? parent.shapes.map((candidate) => candidate.id === shape.id && candidate.image ? { ...candidate, image: { ...candidate.image, assetId: nextAssetId } } : candidate) : parent.shapes,
          }),
        })
      } else if (image) {
        pageOps.commit({
          assets: nextAssets,
          images: images.map((candidate) => candidate.id === image.id ? { ...candidate, assetId: nextAssetId } : candidate),
        })
      } else if (shape) {
        pageOps.commit({
          assets: nextAssets,
          shapes: shapes.map((candidate) => candidate.id === shape.id && candidate.image
            ? { ...candidate, image: { ...candidate.image, assetId: nextAssetId } }
            : candidate),
        })
      }
    } catch (error) {
      console.error('Could not paint the image.', error)
    }
  }

  const finishMarqueeCut = async (gesture: MarqueeGesture, target: MarqueeTarget) => {
    const selection: ScreenBox = {
      left: Math.min(gesture.clientX0, gesture.clientX1),
      top: Math.min(gesture.clientY0, gesture.clientY1),
      width: Math.abs(gesture.clientX1 - gesture.clientX0),
      height: Math.abs(gesture.clientY1 - gesture.clientY0),
    }
    const overlapsTarget = selection.left < target.bounds.left + target.bounds.width &&
      selection.left + selection.width > target.bounds.left &&
      selection.top < target.bounds.top + target.bounds.height &&
      selection.top + selection.height > target.bounds.top
    if (selection.width < 4 || selection.height < 4 || !overlapsTarget) return

    try {
      const vectorShape = target.kind === 'shape' ? shapes.find((shape) => shape.id === target.id) : undefined
      if (vectorShape && !vectorShape.feather && !vectorShape.image && !vectorShape.frame && vectorShape.kind !== 'line' && vectorShape.kind !== 'table' && !(vectorShape.kind === 'path' && vectorShape.closed === false)) {
        const start = toWorld(gesture.clientX0, gesture.clientY0)
        const end = toWorld(gesture.clientX1, gesture.clientY1)
        const mask: ShapeFrame = {
          id: newFrameId(),
          kind: gesture.kind === 'ellipse' ? 'ellipse' : 'rect',
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
          fill: '#000000',
          stroke: null,
          strokeWidth: 0,
        }
        const split = splitShapeByMask(vectorShape, mask)
        if (!split.piece) return
        const makePiece = (geometry: NonNullable<typeof split.piece>, z: number): ShapeFrame => ({
          ...vectorShape,
          id: newFrameId(),
          kind: 'path',
          ...geometry,
          closed: true,
          curveMode: undefined,
          pathText: undefined,
          image: undefined,
          frame: undefined,
          radii: undefined,
          sides: undefined,
          groupId: undefined,
          rotation: undefined,
          z,
        })
        const pieces = [
          ...(split.remainder ? [makePiece(split.remainder, vectorShape.z ?? target.z)] : []),
          makePiece(split.piece, (vectorShape.z ?? target.z) + 0.001),
        ]
        if (editingParentId) {
          pageOps.commit({
            parents: parents.map((parent) => parent.id === editingParentId ? { ...parent, shapes: [...parent.shapes.filter((shape) => shape.id !== vectorShape.id), ...pieces] } : parent),
          })
        } else {
          pageOps.commit({ shapes: [...shapes.filter((shape) => shape.id !== vectorShape.id), ...pieces] })
        }
        const selectedPiece = pieces[pieces.length - 1]
        setSelectedId(selectedPiece.id)
        setEditingId(null)
        setTool('select')
        setSelectedPage(ownerPage(rects, selectedPiece.x + selectedPiece.w / 2, selectedPiece.y + selectedPiece.h / 2))
        return
      }

      const sourceCanvas = await captureObject(target.element, target.bounds, live.current.zoom)
      const sourceFeather = target.kind === 'frame'
        ? frames.find((frame) => frame.id === target.id)?.feather
        : target.kind === 'image'
          ? images.find((image) => image.id === target.id)?.feather
          : shapes.find((shape) => shape.id === target.id)?.feather
      if (sourceFeather) {
        const objectScale = sourceCanvas.width / target.bounds.width
        const objectWidth = target.element.offsetWidth * objectScale
        const objectHeight = target.element.offsetHeight * objectScale
        const sourceImage = target.kind === 'image' ? images.find((image) => image.id === target.id) : undefined
        const sourceShape = target.kind === 'shape' ? shapes.find((shape) => shape.id === target.id) : undefined
        const sourceFrame = target.kind === 'frame' ? frames.find((frame) => frame.id === target.id) : undefined
        const context = sourceCanvas.getContext('2d')!
        context.save()
        context.globalCompositeOperation = 'destination-in'
        context.translate(sourceCanvas.width / 2, sourceCanvas.height / 2)
        const rotation = sourceImage?.rotation ?? sourceShape?.rotation ?? sourceFrame?.rotation ?? 0
        if (rotation) context.rotate((rotation * Math.PI) / 180)
        if (sourceImage?.flipX || sourceImage?.flipY) context.scale(sourceImage.flipX ? -1 : 1, sourceImage.flipY ? -1 : 1)
        context.translate(-objectWidth / 2, -objectHeight / 2)
        const sourceWidth = sourceImage?.w ?? sourceShape?.w ?? sourceFrame?.w ?? target.bounds.width / live.current.zoom
        applyFeatherCanvasMask(context, sourceFeather, objectWidth, objectHeight, objectWidth / sourceWidth)
        context.restore()
      }
      const { remainder, piece } = splitObjectCanvas(sourceCanvas, target.bounds, selection, gesture.kind)
      const trimmedPiece = trimTransparentBounds(piece)
      if (!trimmedPiece) return
      const trimmedRemainder = trimTransparentBounds(remainder)

      const nextAssets: Assets = { ...assets }
      const imageFor = (canvas: HTMLCanvasElement, name: string): ImageFrame => {
        const assetId = newFrameId()
        const asset: Asset = { name: `${name}.png`, mime: 'image/png', dataUrl: canvasDataUrl(canvas), width: canvas.width, height: canvas.height }
        nextAssets[assetId] = asset
        return {
          id: newFrameId(),
          label: name,
          layerId: target.layerId ?? creationLayerId,
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          assetId,
          fit: 'stretch',
          z: target.z,
        }
      }
      const sourceWorld = toWorld(target.bounds.left, target.bounds.top)
      const sourceBox = { x: sourceWorld.x, y: sourceWorld.y, w: target.bounds.width / live.current.zoom, h: target.bounds.height / live.current.zoom }
      const selectionWorld = toWorld(selection.left, selection.top)
      const pieceBox = { x: selectionWorld.x, y: selectionWorld.y, w: selection.width / live.current.zoom, h: selection.height / live.current.zoom }
      const tightBox = (box: typeof sourceBox, original: HTMLCanvasElement, trimmed: { canvas: HTMLCanvasElement; left: number; top: number }) => ({
        x: box.x + (trimmed.left / original.width) * box.w,
        y: box.y + (trimmed.top / original.height) * box.h,
        w: (trimmed.canvas.width / original.width) * box.w,
        h: (trimmed.canvas.height / original.height) * box.h,
      })
      const remainderFrame = trimmedRemainder ? imageFor(trimmedRemainder.canvas, `שארית — ${target.name}`) : null
      const pieceFrame = imageFor(trimmedPiece.canvas, `חלק חתוך — ${target.name}`)
      const placed = (frame: ImageFrame, box: typeof sourceBox, z: number): ImageFrame => ({ ...frame, ...box, z })
      const nextImages = images.filter((image) => image.id !== (target.kind === 'image' ? target.id : ''))
      const nextShapes = shapes.filter((shape) => shape.id !== (target.kind === 'shape' ? target.id : ''))
      const nextFrames = target.kind === 'frame'
        ? frames.map((frame) => frame.id === target.id ? { ...frame, rasterized: true } : frame)
        : frames
      const additions = [
        ...(remainderFrame && trimmedRemainder ? [placed(remainderFrame, tightBox(sourceBox, remainder, trimmedRemainder), target.z)] : []),
        placed(pieceFrame, tightBox(pieceBox, piece, trimmedPiece), target.z + 0.001),
      ]

      if (editingParentId) {
        pageOps.commit({
          assets: nextAssets,
          parents: parents.map((parent) => parent.id === editingParentId ? { ...parent, frames: nextFrames, images: [...nextImages, ...additions], shapes: nextShapes } : parent),
        })
      } else {
        pageOps.commit({ frames: nextFrames, images: [...nextImages, ...additions], shapes: nextShapes, assets: nextAssets })
      }
      setSelectedId(pieceFrame.id)
      setEditingId(null)
      setTool('select')
    } catch (error) {
      console.warn('Could not cut the selected object.', error)
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

  const snapNewTextFramePoint = (p: { x: number; y: number }, off: boolean) => {
    if (off) return { p, lines: [] as SnapLine[] }
    const tol = SNAP_PX / live.current.zoom
    const edges = objectLines(frames)
    const sx = snapEdges([p.x], [...snapLinesRef.current.v, ...snapLinesRef.current.cv, ...edges.v], tol)
    const sy = snapEdges([p.y], [...snapLinesRef.current.h, ...snapLinesRef.current.ch, ...edges.h], tol)
    return { p: { x: p.x + (sx?.delta ?? 0), y: p.y + (sy?.delta ?? 0) }, lines: [sx?.line, sy?.line].filter((line): line is SnapLine => !!line) }
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

  /** A line's angle for the small degrees readout (professional layout tools show the same thing next to their line tool):
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
    const constrainShape = s0.kind === 'rect' && !s0.frame
      ? m.shift
      : m.shift || enterHeld.current
    if (constrainShape) {
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
      layerId: creationLayerId,
      kind,
      ...box,
      ...(kind === 'polygon' ? { sides: shapePrefs.polygon.sides } : {}),
      ...(r > 0 ? { radii: [r, r, r, r] as [number, number, number, number] } : {}),
      ...(frame ? { frame: true as const } : {}),
      ...(flip ? { flip } : {}),
      fill: defaultShapePaint.fill ?? null,
      fillGradient: defaultShapePaint.fillGradient,
      stroke: defaultShapePaint.stroke ?? DEFAULT_SHAPE_STROKE,
      strokeWidth: defaultShapePaint.strokeWidth ?? drawingStrokeWidth,
      strokeDash: defaultShapePaint.strokeDash,
      strokeCap: defaultShapePaint.strokeCap,
      opacity: defaultShapePaint.opacity,
      z: nextZ(frames, images, shapes),
    }
  }

  const pathShapeFromPoints = (points: WorldPathPoint[], closed: boolean, smooth: boolean, allowSingle = false, smoothFactor = 0.28, strokeCap: 'butt' | 'round' = 'round'): ShapeFrame | null => {
    const preserveClosingPoint = !closed && points.length > 2 && Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) < 2
    const clean = points.filter((point, index) => index === 0 || preserveClosingPoint && index === points.length - 1 || point.hi || point.ho || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >= 2)
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
      layerId: creationLayerId,
      x,
      y,
      w,
      h,
      geom: [[clean.map(vertex)]],
      closed,
      curveMode: smooth ? 'quadratic' : undefined,
      strokeCap: defaultShapePaint.strokeCap ?? strokeCap,
      fill: defaultShapePaint.fill ?? null,
      fillGradient: defaultShapePaint.fillGradient,
      stroke: defaultShapePaint.stroke ?? DEFAULT_SHAPE_STROKE,
      strokeWidth: defaultShapePaint.strokeWidth ?? drawingStrokeWidth,
      strokeDash: defaultShapePaint.strokeDash,
      opacity: defaultShapePaint.opacity,
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
      const hi = vertexHi(vertex)
      const ho = vertexHo(vertex)
      return {
        x: shape.x + p[0] * shape.w,
        y: shape.y + p[1] * shape.h,
        ...(hi ? { hi: { x: hi[0] * shape.w, y: hi[1] * shape.h } } : {}),
        ...(ho ? { ho: { x: ho[0] * shape.w, y: ho[1] * shape.h } } : {}),
      }
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
      return points.some((candidate, index) => {
        if (Math.hypot(point.x - candidate.x, point.y - candidate.y) <= limit) return true
        const hasNext = index < points.length - 1 || shape.closed !== false
        return hasNext && distanceToSegment(candidate, points[(index + 1) % points.length]) <= limit
      })
    })
  }

  const pathWithWorldPoints = (base: ShapeFrame, points: WorldPathPoint[]): ShapeFrame | null => {
    const made = pathShapeFromPoints(points, false, false, false, 0.28, base.strokeCap === 'butt' ? 'butt' : 'round')
    return made ? { ...base, x: made.x, y: made.y, w: made.w, h: made.h, geom: made.geom, closed: false, curveMode: base.curveMode } : null
  }

  const splitPathAt = (id: string, point: { x: number; y: number }) => {
    const shape = shapes.find((candidate) => candidate.id === id && candidate.kind === 'path')
    if (!shape) return
    const points = worldPointsOf(shape)
    if (points.length < (shape.closed === false ? 3 : 3)) return
    const index = points.reduce((best, candidate, i) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(points[best].x - point.x, points[best].y - point.y) ? i : best, 0)
    const pieces = splitPathVerticesAt(points, index, shape.closed !== false)
    if (!pieces) return
    const opened = pieces.map((piece) => pathWithWorldPoints(shape, piece))
    if (opened.some((piece) => !piece)) return
    if (shape.closed !== false) {
      onShapesChange(shapes.map((candidate) => candidate.id === id ? { ...opened[0]!, id } : candidate))
      setSelectedId(id)
    } else {
      onShapesChange([...shapes.filter((candidate) => candidate.id !== id), { ...opened[0]!, id: newFrameId() }, { ...opened[1]!, id: newFrameId() }])
      setSelectedId(null)
    }
  }

  const eraseSegmentFromShapes = (source: ShapeFrame[], shape: ShapeFrame, point: { x: number; y: number }, radius: number): ShapeFrame[] => {
    const points = worldPointsOf(shape)
    if (points.length < 2) return source
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
    if (nearest > radius) return source
    const a = points[index]
    const b = points[index + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.max(1, Math.hypot(dx, dy))
    const center = { x: a.x + nearestT * dx, y: a.y + nearestT * dy }
    const cutStart = { x: center.x - (dx / length) * radius, y: center.y - (dy / length) * radius }
    const cutEnd = { x: center.x + (dx / length) * radius, y: center.y + (dy / length) * radius }
    const left = pathWithWorldPoints(shape, [...points.slice(0, index + 1), cutStart])
    const right = pathWithWorldPoints(shape, [cutEnd, ...points.slice(index + 1)])
    const replacement = [left, right].filter((part): part is ShapeFrame => !!part).map((part) => ({ ...part, id: newFrameId() }))
    return [...source.filter((candidate) => candidate.id !== shape.id), ...replacement]
  }

  const eraseAt = (point: { x: number; y: number }) => {
    const previous = eraserPreviousPoint.current ?? point
    const radius = eraserRadius / zoom
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.6)))
    let nextShapes = shapes
    let changed = false
    for (let step = 1; step <= steps; step++) {
      const sample = {
        x: previous.x + (point.x - previous.x) * (step / steps),
        y: previous.y + (point.y - previous.y) * (step / steps),
      }
      const candidates = [...nextShapes].filter((shape) => {
        if (shape.kind !== 'path') return false
        const points = worldPointsOf(shape)
        return points.some((candidate, index) => {
          if (Math.hypot(sample.x - candidate.x, sample.y - candidate.y) <= radius) return true
          if (index >= points.length - 1) return false
          const next = points[index + 1]
          const dx = next.x - candidate.x
          const dy = next.y - candidate.y
          const lengthSquared = dx * dx + dy * dy
          const t = lengthSquared ? Math.max(0, Math.min(1, ((sample.x - candidate.x) * dx + (sample.y - candidate.y) * dy) / lengthSquared)) : 0
          return Math.hypot(sample.x - (candidate.x + t * dx), sample.y - (candidate.y + t * dy)) <= radius
        })
      })
      for (const shape of candidates) {
        const next = eraseSegmentFromShapes(nextShapes, shape, sample, radius)
        if (next !== nextShapes) {
          nextShapes = next
          changed = true
        }
      }
    }
    eraserPreviousPoint.current = point
    if (changed) {
      onShapesChange(nextShapes, eraserDragKey.current ?? undefined)
      setSelectedId(null)
    }
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
    if (tool !== 'eraser' && tool !== 'heal' && !rasterBrushColor) setEraserPoint(null)
  }, [tool, rasterBrushColor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((tool !== 'eraser' && tool !== 'heal' && !rasterBrushColor) || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
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
  }, [tool, rasterBrushColor])

  /** clicking a shape with the Selection or point-editing tool selects it and starts moving it (the shape tools draw a new one instead) */
  const onShapePointerDown = (id: string) => (e: ReactPointerEvent<SVGPathElement>) => {
    if (e.button !== 0 || panMode || linkFrom || placing || placingImages.length > 0) return
    if (itemLocks[id]) return
    const sh = shapes.find((x) => x.id === id)
    if (!sh) return
    if (tool === 'eyedropper') {
      e.stopPropagation()
      e.preventDefault()
      const paint = {
        fill: sh.fill,
        fillGradient: sh.fillGradient,
        stroke: sh.stroke,
        strokeWidth: sh.strokeWidth,
        strokeDash: sh.strokeDash,
        strokeCap: sh.strokeCap,
        opacity: sh.opacity ?? 1,
      }
      if (sampledShapeStyle && sampledShapeStyle.sourceId !== id) {
        const selectedTargets = selectedObjectIds().filter((targetId) => targetId !== sampledShapeStyle.sourceId && shapes.some((shape) => shape.id === targetId))
        const targets = new Set(selectedTargets.length > 0 ? selectedTargets : [id])
        onShapesChange(shapes.map((shape) => targets.has(shape.id) ? { ...shape, ...sampledShapeStyle.paint } : shape))
        setSampledShapeStyle(null)
        setSelectedId(id)
        setMultiSel([])
        setTool('select')
      } else {
        setDefaultShapePaint((current) => ({ ...current, ...paint }))
        const selectedTargets = selectedObjectIds().filter((targetId) => targetId !== id && shapes.some((shape) => shape.id === targetId))
        if (selectedTargets.length > 0) {
          const targets = new Set(selectedTargets)
          onShapesChange(shapes.map((shape) => targets.has(shape.id) ? { ...shape, ...paint } : shape))
          setSampledShapeStyle(null)
          setTool('select')
        } else {
          setSampledShapeStyle({ sourceId: id, paint })
        }
      }
      return
    }
    if ((tool === 'scissors' || tool === 'eraser') && sh.kind !== 'table') {
      e.stopPropagation()
      e.preventDefault()
      const point = toWorld(e.clientX, e.clientY)
      if (tool === 'scissors') splitPathAt(id, point)
      else {
        eraserDragging.current = true
        dragSeq.current += 1
        eraserDragKey.current = `eraser:${dragSeq.current}`
        eraserPreviousPoint.current = null
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
    const table = isShape ? shapes.find((shape) => shape.id === id)?.table : undefined
    const f = isImage ? images.find((x) => x.id === id) : isShape ? shapes.find((x) => x.id === id) : frames.find((x) => x.id === id)
    if (!f) return
    const textFrame = !isImage && !isShape ? frames.find((frame) => frame.id === id) : undefined
    dragSeq.current += 1
    frameDrag.current = {
      id,
      mode,
      start: toWorld(e.clientX, e.clientY),
      orig: { x: f.x, y: f.y, w: f.w, h: f.h },
      key: `drag:${dragSeq.current}`,
      kind: isImage ? 'image' : isShape ? 'shape' : 'frame',
      ...(table ? { table } : {}),
      ...(textFrame?.textScale ? { origTextScale: textFrame.textScale } : {}),
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
  const marqueeTool = tool === 'marqueeRect' || tool === 'marqueeEllipse'
  const featherTargetForId = (id: string): FeatherTarget | null => {
    const frame = frames.find((candidate) => candidate.id === id)
    if (frame) return { id, kind: 'frame', x: frame.x, y: frame.y, w: frame.w, h: frame.h, rotation: frame.rotation }
    const image = images.find((candidate) => candidate.id === id)
    if (image) return { id, kind: 'image', x: image.x, y: image.y, w: image.w, h: image.h, rotation: image.rotation, flipX: image.flipX, flipY: image.flipY }
    const shape = shapes.find((candidate) => candidate.id === id)
    if (shape && shape.w > 0 && shape.h > 0) return { id, kind: 'shape', x: shape.x, y: shape.y, w: shape.w, h: shape.h, rotation: shape.rotation }
    return null
  }
  const featherTargetAt = (clientX: number, clientY: number) => {
    if (selectedId) {
      const selected = featherTargetForId(selectedId)
      if (selected) return selected
    }
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const object = element.closest<HTMLElement>('[data-object-id][data-object-kind]')
      if (!object || object.closest('.parent-shadow')) continue
      const id = object.dataset.objectId
      const target = id ? featherTargetForId(id) : null
      if (target && !itemLocks[target.id]) return target
    }
    return null
  }
  const featherPointAt = (target: FeatherTarget, clientX: number, clientY: number) => {
    const world = toWorld(clientX, clientY)
    let [x, y] = rotateVec(world.x - target.x - target.w / 2, world.y - target.y - target.h / 2, -(target.rotation ?? 0))
    if (target.flipX) x = -x
    if (target.flipY) y = -y
    return { x: (x + target.w / 2) / target.w, y: (y + target.h / 2) / target.h }
  }
  const featherWorldPoint = (target: FeatherTarget, x: number, y: number) => {
    let localX = (x - 0.5) * target.w
    let localY = (y - 0.5) * target.h
    if (target.flipX) localX = -localX
    if (target.flipY) localY = -localY
    const [rotatedX, rotatedY] = rotateVec(localX, localY, target.rotation ?? 0)
    return { x: target.x + target.w / 2 + rotatedX, y: target.y + target.h / 2 + rotatedY }
  }
  const withFeather = <T extends { id: string; feather?: Feather }>(item: T, feather: Feather | null): T => {
    const { feather: _current, ...rest } = item
    return (feather ? { ...rest, feather } : rest) as T
  }
  const commitFeather = (target: FeatherTarget, feather: Feather | null) => {
    const key = `feather:${target.id}`
    if (target.kind === 'frame') onFramesChange(frames.map((frame) => frame.id === target.id ? withFeather(frame, feather) : frame), key)
    else if (target.kind === 'image') onImagesChange(images.map((image) => image.id === target.id ? withFeather(image, feather) : image), key)
    else onShapesChange(shapes.map((shape) => shape.id === target.id ? withFeather(shape, feather) : shape), key)
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === 'feather' && e.button === 0) {
      const target = featherTargetAt(e.clientX, e.clientY)
      if (!target || itemLocks[target.id]) return
      const start = featherPointAt(target, e.clientX, e.clientY)
      const gesture: FeatherDrag = {
        target,
        startClient: { x: e.clientX, y: e.clientY },
        endClient: { x: e.clientX, y: e.clientY },
        feather: { type: 'gradient', x0: start.x, y0: start.y, x1: start.x, y1: start.y, points: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }] },
      }
      featherDragRef.current = gesture
      setFeatherDrag(gesture)
      setSelectedId(target.id)
      setEditingId(null)
      setMultiSel([])
      const world = toWorld(e.clientX, e.clientY)
      setSelectedPage(ownerPage(rects, world.x, world.y))
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    const clickedCanvas = e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sheet')
    if (clickedCanvas && tool !== 'pen' && tool !== 'pencil' && !marqueeTool) {
      if (isolatedGroupId) {
        setIsolatedGroupId(null)
        setSelectedIdRaw(null)
        setMultiSel(objectsInGroup(isolatedGroupId))
      }
      return // scrollbars
    }
    if (linkFrom && !panMode) {
      setLinkFrom(null) // clicked away from any frame
      return
    }
    if (marqueeTool && e.button === 0) {
      // the target (whichever object the drawn rectangle ends up over) is resolved at release, not here — so the
      // drag may start outside every shape and still cut whichever one it crosses
      const world = toWorld(e.clientX, e.clientY)
      const gesture: MarqueeGesture = {
        kind: tool === 'marqueeEllipse' ? 'ellipse' : 'rect',
        x0: world.x,
        y0: world.y,
        x1: world.x,
        y1: world.y,
        clientX0: e.clientX,
        clientY0: e.clientY,
        clientX1: e.clientX,
        clientY1: e.clientY,
      }
      marqueeCutRef.current = gesture
      setMarqueeCut(gesture)
      setSelectedPage(ownerPage(rects, world.x, world.y))
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
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
      dragSeq.current += 1
      eraserDragKey.current = `eraser:${dragSeq.current}`
      eraserPreviousPoint.current = null
      eraseAt(toWorld(e.clientX, e.clientY))
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if ((tool === 'type' || placing || placingImages.length > 0) && e.button === 0) {
      // start dragging a new text frame (with text loaded, the frame receives it)
      placeMods.current = { shift: e.shiftKey, alt: e.altKey }
      const point = toWorld(e.clientX, e.clientY)
      const snap = tool === 'type' && !placing && placingImages.length === 0 ? snapNewTextFramePoint : snapPoint
      const p = snap(point, e.ctrlKey || e.metaKey).p
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
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === 'gap' && !panMode && e.button === 0) {
      e.preventDefault()
      e.stopPropagation()
      const start = toWorld(e.clientX, e.clientY)
      const originals = gapObjectsForPoint(start)
      const nearestOnly = e.shiftKey
      const gaps = findGaps(start, originals, nearestOnly)
      if (gaps.length === 0) {
        updateGapPreview([])
        cancelGapPreviewFrame()
        return
      }
      const grabbedEdges: GapDrag['grabbedEdges'] = {}
      for (const gap of gaps) {
        const coordinate = gap.axis === 'x' ? start.x : start.y
        const firstEdge = gap.axis === 'x' ? gap.x : gap.y
        const secondEdge = gap.axis === 'x' ? gap.x + gap.w : gap.y + gap.h
        grabbedEdges[gap.axis] = Math.abs(coordinate - firstEdge) <= Math.abs(coordinate - secondEdge) ? 'before' : 'after'
      }
      dragSeq.current += 1
      const key = `gap:${newFrameId()}:${dragSeq.current}`
      gapDrag.current = { start, gaps, originals, key, nearestOnly, grabbedEdges }
      gapCancel.current = () => {
        applyGapRectsRef.current(originals, key)
        gapDrag.current = null
        gapCancel.current = null
        cancelGapPreviewFrame()
        updateGapPreview([])
      }
      cancelGapPreviewFrame()
      updateGapPreview(gaps)
      setSpacingShown([])
      setSelectedPage(ownerPage(rects, start.x, start.y))
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (rasterBrushColor && e.button === 0) {
      e.preventDefault()
      e.stopPropagation()
      beginPaintStroke(e)
      return
    }
    if (!colorSamplerActive || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    moveColorSamplerLens(e.clientX, e.clientY)
    void updateColorSampler(e.clientX, e.clientY).then((color) => { if (color) addColorSample(color) })
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (colorSamplerActive) {
      moveColorSamplerLens(e.clientX, e.clientY)
      void updateColorSampler(e.clientX, e.clientY)
    }
    if (rasterBrushColor && !paintStroke.current) setEraserPoint(toWorld(e.clientX, e.clientY))
    const featherGesture = featherDragRef.current
    if (featherGesture) {
      const point = featherPointAt(featherGesture.target, e.clientX, e.clientY)
      const next = {
        ...featherGesture,
        endClient: { x: e.clientX, y: e.clientY },
        feather: { ...featherGesture.feather, x1: point.x, y1: point.y },
      }
      featherDragRef.current = next
      setFeatherDrag(next)
      return
    }
    const activeGap = gapDrag.current
    if (activeGap) {
      const point = toWorld(e.clientX, e.clientY)
      const moved = moveGap(activeGap.gaps, activeGap.originals, { x: point.x - activeGap.start.x, y: point.y - activeGap.start.y }, MIN_FRAME_PT, { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, grabbedEdges: activeGap.grabbedEdges })
      if (moved.delta.x !== 0 || moved.delta.y !== 0) applyGapRects(moved.objects, activeGap.key)
      updateGapPreview(moved.gaps)
      return
    }
    if (tool === 'gap' && !panMode) {
      const point = toWorld(e.clientX, e.clientY)
      queueGapPreview(point, e.shiftKey)
      return
    }
    if (gapPreview.length) updateGapPreview([])
    cancelGapPreviewFrame()
    if (marqueeCutRef.current) {
      const previous = marqueeCutRef.current
      const world = toWorld(e.clientX, e.clientY)
      const next = { ...previous, x1: world.x, y1: world.y, clientX1: e.clientX, clientY1: e.clientY }
      marqueeCutRef.current = next
      setMarqueeCut(next)
      return
    }
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
    if (tool === 'eraser' || tool === 'heal' || rasterBrushColor) setEraserPoint(toWorld(e.clientX, e.clientY))
    else if (eraserPoint) setEraserPoint(null)
    if (paintStroke.current && e.buttons !== 0) {
      const stroke = paintStroke.current
      const point = toWorld(e.clientX, e.clientY)
      const target = document.elementsFromPoint(e.clientX, e.clientY)
        .map((element) => element.closest<HTMLElement>('[data-object-id][data-object-kind]'))
        .find((element): element is HTMLElement => !!element && element.dataset.objectId === stroke.id)
      const image = stroke.kind === 'image' ? images.find((candidate) => candidate.id === stroke.id) : undefined
      const shape = stroke.kind === 'shape' ? shapes.find((candidate) => candidate.id === stroke.id) : undefined
      const asset = assets[stroke.assetId]
      const imagePoint = target && asset && image
        ? imagePixelAt(image, asset, point)
        : target && asset && shape?.image ? shapeImagePixelAt(shape, asset, point) : null
      const previous = stroke.points[stroke.points.length - 1]
      if (imagePoint && Math.hypot(imagePoint.x - previous.x, imagePoint.y - previous.y) >= 1) stroke.points.push(imagePoint)
      return
    }
    if (repairStroke.current && tool === 'heal' && e.buttons !== 0) {
      const stroke = repairStroke.current
      const image = images.find((candidate) => candidate.id === stroke.id)
      const asset = assets[stroke.assetId]
      const point = image && asset ? imagePixelAt(image, asset, toWorld(e.clientX, e.clientY)) : null
      const previous = stroke.points[stroke.points.length - 1]
      if (point && Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) stroke.points.push(point)
      return
    }
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
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      const movedIds = new Set(d.origins.keys())
      const objects = [...frames, ...images, ...shapes]
      const unselected = objects.filter((object) => !movedIds.has(object.id))
      const moved = objects.flatMap((object) => {
        const origin = d.origins.get(object.id)
        return origin ? [{ ...object, x: origin.x + dx, y: origin.y + dy }] : []
      })
      const marks = moved.flatMap((object) => {
        const page = ownerPage(rects, object.x + object.w / 2, object.y + object.h / 2)
        const spread = spreads.find((candidate) => candidate.pages.some((item) => item.index === page))
        const spreadPages = new Set(spread?.pages.map((item) => item.index) ?? [page])
        const near = unselected.filter((other) => spreadPages.has(ownerPage(rects, other.x + other.w / 2, other.y + other.h / 2)))
        return spacingMarksForSelection([object], near)
      })
      setSpacingShown(marks)
      offsetObjects(d.origins, dx, dy, d.key)
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
        setGraphicFrameHandleDragging(false)
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
      const currentSpread = spreads.find((spread) => spread.pages.some((candidate) => candidate.index === page))
      const spreadPages = new Set(currentSpread?.pages.map((candidate) => candidate.index) ?? [page])
      const near = [...frames, ...images, ...shapes].filter((o) => {
        if (o.id === d.id) return false
        const objectPage = ownerPage(rects, o.x + o.w / 2, o.y + o.h / 2)
        return spreadPages.has(objectPage)
      })
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
      const now = d.kind === 'frame' && d.mode !== 'move'
        ? textFrameResizeBox(d.orig, d.mode, dx, dy, e.shiftKey, e.altKey)
        : dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, d.table && e.shiftKey ? d.orig.w / d.orig.h : undefined)
      const equalLines: SnapLine[] = []
      const tol = SNAP_PX / live.current.zoom
      const same = (a: number, b: number) => Math.abs(a - b) <= tol
      for (const other of near) {
        const vertical = [now.x, now.x + now.w].find((edge) => [other.x, other.x + other.w].some((candidate) => same(edge, candidate)))
        const horizontal = [now.y, now.y + now.h].find((edge) => [other.y, other.y + other.h].some((candidate) => same(edge, candidate)))
        if (vertical !== undefined) equalLines.push({ axis: 'v', at: vertical, from: Math.min(now.y, other.y), to: Math.max(now.y + now.h, other.y + other.h), kind: 'object' })
        if (horizontal !== undefined) equalLines.push({ axis: 'h', at: horizontal, from: Math.min(now.x, other.x), to: Math.max(now.x + now.w, other.x + other.w), kind: 'object' })
      }
      const heldLines = (snapped?.lines ?? []).map((l) => (l.kind !== 'object' ? l : l.axis === 'v' ? { ...l, from: Math.min(l.from, now.y), to: Math.max(l.to, now.y + now.h) } : { ...l, from: Math.min(l.from, now.x), to: Math.max(l.to, now.x + now.w) }))
      setSnapShown([...heldLines, ...equalLines])
      if (d.kind === 'shape') {
        // Shift keeps the shape's proportions
        const box = dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT, e.shiftKey ? d.orig.w / d.orig.h : undefined, e.altKey)
        if (d.mode === 'move') learnRepeatOffset(d.id, box)
        if (d.table && d.mode !== 'move') {
          let table = d.table
          if (d.mode.length === 2) {
            if (e.shiftKey) table = scaleTable(d.table, box.w / Math.max(1, d.orig.w))
            else {
              const scaleY = box.h / Math.max(1, d.orig.h)
              table = { ...d.table, rowHeights: d.table.rowHeights.map((height) => Math.max(1, height * scaleY)) }
            }
          }
          const height = layoutOfShape({ table, w: box.w })?.height ?? box.h
          const resized = { ...box, h: height }
          onShapesChange(shapes.map((shape) => shape.id === d.id ? { ...shape, ...resized, table } : shape), d.key)
          return
        }
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
      // Shift scales text and its frame together; Alt only changes the text's vertical scale.
      const shiftUniformScale = d.mode !== 'move' && !e.altKey && e.shiftKey
      const box = d.mode === 'move'
        ? dragBox(d.orig, d.mode, dx, dy, MIN_FRAME_PT)
        : textFrameResizeBox(d.orig, d.mode, dx, dy, e.shiftKey, e.altKey)
      if (d.mode === 'move') learnRepeatOffset(d.id, box)
      const altScale = d.mode !== 'move' && e.altKey
      const originalScale = d.origTextScale ?? { x: 1, y: 1 }
      const scaleX = box.w / Math.max(1, d.orig.w)
      const scaleY = box.h / Math.max(1, d.orig.h)
      const textScale = shiftUniformScale
        ? { x: originalScale.x * scaleX, y: originalScale.y * scaleY }
        : altScale
          ? {
              x: originalScale.x,
              y: originalScale.y * (d.mode.includes('n') || d.mode.includes('s') ? scaleY : 1),
            }
          : undefined
      onFramesChange(frames.map((f) => f.id === d.id ? {
        ...f,
        ...box,
        // a plain resize keeps the scale the text already has (the text then reflows in the frame divided by it, see
        // textFlowBoxOf); only Shift/Alt change it
        textScale: textScale ?? d.origTextScale,
      } : f), d.key)
      return
    }
    if (createStart.current) {
      const point = toWorld(e.clientX, e.clientY)
      const snap = tool === 'type' && !placing && placingImages.length === 0 ? snapNewTextFramePoint : snapPoint
      const snapped = snap(point, e.ctrlKey || e.metaKey)
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
          ...defaultTextStyle(),
          id: newFrameId(),
          layerId: creationLayerId,
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
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeGap = gapDrag.current
    if (activeGap) {
      const point = toWorld(event.clientX, event.clientY)
      const moved = moveGap(activeGap.gaps, activeGap.originals, { x: point.x - activeGap.start.x, y: point.y - activeGap.start.y }, MIN_FRAME_PT, { ctrl: event.ctrlKey || event.metaKey, alt: event.altKey, grabbedEdges: activeGap.grabbedEdges })
      if (moved.delta.x !== 0 || moved.delta.y !== 0) applyGapRects(moved.objects, activeGap.key)
      gapDrag.current = null
      gapCancel.current = null
      cancelGapPreviewFrame()
      updateGapPreview([])
      return
    }
    const featherGesture = featherDragRef.current
    if (featherGesture) {
      const point = featherPointAt(featherGesture.target, event.clientX, event.clientY)
      const nextFeather = { ...featherGesture.feather, x1: point.x, y1: point.y }
      const distance = Math.hypot(event.clientX - featherGesture.startClient.x, event.clientY - featherGesture.startClient.y)
      featherDragRef.current = null
      setFeatherDrag(null)
      if (distance >= 4) commitFeather(featherGesture.target, nextFeather)
      return
    }
    const paintingStroke = paintStroke.current
    if (paintingStroke) {
      paintStroke.current = null
      setEraserPoint(null)
      void finishPaintStroke(paintingStroke)
      return
    }
    const healingStroke = repairStroke.current
    if (healingStroke) {
      repairStroke.current = null
      setEraserPoint(null)
      void finishRepairStroke(healingStroke)
      return
    }
    const cutGesture = marqueeCutRef.current
    if (cutGesture) {
      marqueeCutRef.current = null
      setMarqueeCut(null)
      if (Math.abs(cutGesture.clientX1 - cutGesture.clientX0) >= 4 && Math.abs(cutGesture.clientY1 - cutGesture.clientY0) >= 4) {
        const target = marqueeTargetIn(cutGesture.x0, cutGesture.y0, cutGesture.x1, cutGesture.y1)
        if (target) void finishMarqueeCut(cutGesture, target)
      }
      return
    }
    eraserDragging.current = false
    eraserDragKey.current = null
    eraserPreviousPoint.current = null
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
    setGraphicFrameHandleDragging(false)
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
    cancelGapPreviewFrame()
    if (gapCancel.current) gapCancel.current()
    else {
      gapDrag.current = null
      updateGapPreview([])
    }
    featherDragRef.current = null
    setFeatherDrag(null)
    repairStroke.current = null
    paintStroke.current = null
    marqueeCutRef.current = null
    setMarqueeCut(null)
    eraserDragging.current = false
    eraserDragKey.current = null
    eraserPreviousPoint.current = null
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
    setGraphicFrameHandleDragging(false)
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
    oversetCaret.current = false
    setFootnoteSel(null)
    if (itemLocks[id]) return
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
        applySampledTextStyle(id, sampledTextStyle)
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
      setTextSel(null)
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
    if (FRAME_TOOL_KIND[tool] && shapes.some((shape) => shape.id === id && shape.frame)) setGraphicFrameHandleDragging(true)
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
  const visible = useMemo(() => spreads.filter((spread) => {
    const top = ty + spread.y * zoom
    return top + spread.h * zoom >= scroll.y - 300 && top <= scroll.y + vp.h + 300
  }), [spreads, ty, zoom, scroll.y, vp.h])
  // text frames, pictures and shapes are virtualized the same way, EXCEPT whatever is actively selected/edited/
  // linked-from — an import of a 100-page Word file otherwise creates 100+ live components that all re-render on
  // every keystroke, even though at most a couple of pages are ever on screen at once
  const alwaysMounted = useMemo(() => new Set([selectedId, editingId, linkFrom, pathEdit, ...multiSel].filter((id): id is string => !!id)), [selectedId, editingId, linkFrom, pathEdit, multiSel])
  const visibleFrames = useMemo(() => frames.filter((frame) => {
    const top = ty + frame.y * zoom
    return itemVisibility[frame.id] !== false && (alwaysMounted.has(frame.id) || (top + frame.h * zoom >= scroll.y - 300 && top <= scroll.y + vp.h + 300))
  }), [frames, itemVisibility, alwaysMounted, ty, zoom, scroll.y, vp.h])
  const visibleImages = useMemo(() => images.filter((image) => {
    const top = ty + image.y * zoom
    return itemVisibility[image.id] !== false && (alwaysMounted.has(image.id) || (top + image.h * zoom >= scroll.y - 300 && top <= scroll.y + vp.h + 300))
  }), [images, itemVisibility, alwaysMounted, ty, zoom, scroll.y, vp.h])
  const visibleShapes = useMemo(() => shapes.filter((shape) => {
    const top = ty + shape.y * zoom
    return itemVisibility[shape.id] !== false && (alwaysMounted.has(shape.id) || (top + shape.h * zoom >= scroll.y - 300 && top <= scroll.y + vp.h + 300))
  }), [shapes, itemVisibility, alwaysMounted, ty, zoom, scroll.y, vp.h])
  const gapCandidateSignature = [frames, images, shapes, itemLocks, itemVisibility, isolatedGroupId, spreads]
  const buildGapCandidatesBySpread = () => {
    const candidates = new Map<number, GapObject[]>()
    type Source = GapMember & { groupId?: string; eligible: boolean }
    const sources: Source[] = [
      ...frames.map((frame) => ({ id: frame.id, x: frame.x, y: frame.y, w: frame.w, h: frame.h, groupId: frame.groupId, eligible: !frame.rasterized && !frame.rotation && !itemLocks[frame.id] && itemVisibility[frame.id] !== false })),
      ...images.map((image) => ({ id: image.id, x: image.x, y: image.y, w: image.w, h: image.h, groupId: image.groupId, eligible: !image.rotation && !itemLocks[image.id] && itemVisibility[image.id] !== false })),
      ...shapes.map((shape) => ({ id: shape.id, x: shape.x, y: shape.y, w: shape.w, h: shape.h, groupId: shape.groupId, eligible: shape.kind !== 'line' && !shape.rotation && !itemLocks[shape.id] && itemVisibility[shape.id] !== false })),
    ]
    const spreadAt = (x: number, y: number) => spreads.findIndex((spread) => x >= spread.contentX && x <= spread.contentX + spread.contentW && y >= spread.y && y <= spread.y + spread.h)
    const groups = new Map<string, { id: string; members: Source[]; eligible: boolean }>()
    for (const source of sources) {
      if (source.groupId) {
        if (isolatedGroupId && source.groupId !== isolatedGroupId) continue
        let group = groups.get(source.groupId)
        if (!group) groups.set(source.groupId, group = { id: source.groupId, members: [], eligible: true })
        group.members.push(source)
        group.eligible &&= source.eligible
      } else if (!isolatedGroupId && source.eligible) {
        const index = spreadAt(source.x + source.w / 2, source.y + source.h / 2)
        if (index >= 0) candidates.set(index, [...(candidates.get(index) ?? []), { id: source.id, x: source.x, y: source.y, w: source.w, h: source.h }])
      }
    }
    for (const group of groups.values()) {
      if (!group.eligible || group.members.length === 0) continue
      const x = Math.min(...group.members.map((member) => member.x))
      const y = Math.min(...group.members.map((member) => member.y))
      const right = Math.max(...group.members.map((member) => member.x + member.w))
      const bottom = Math.max(...group.members.map((member) => member.y + member.h))
      const groupObject: GapObject = {
        id: `group:${group.id}`,
        x,
        y,
        w: Math.max(MIN_FRAME_PT, right - x),
        h: Math.max(MIN_FRAME_PT, bottom - y),
        memberIds: group.members.map((member) => member.id),
        members: group.members.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
      }
      const index = spreadAt(groupObject.x + groupObject.w / 2, groupObject.y + groupObject.h / 2)
      if (index >= 0) candidates.set(index, [...(candidates.get(index) ?? []), groupObject])
    }
    return candidates
  }
  const gapObjectsForPoint = (point: { x: number; y: number }): GapObject[] => {
    const cached = gapCandidatesCache.current
    if (!cached || cached.signature.length !== gapCandidateSignature.length || cached.signature.some((value, index) => value !== gapCandidateSignature[index])) {
      gapCandidatesCache.current = { signature: gapCandidateSignature, bySpread: buildGapCandidatesBySpread() }
    }
    const spread = visible.find((candidate) => point.x >= candidate.contentX && point.x <= candidate.contentX + candidate.contentW && point.y >= candidate.y && point.y <= candidate.y + candidate.h)
    const index = spread ? spreads.indexOf(spread) : -1
    return index >= 0 ? gapCandidatesCache.current?.bySpread.get(index) ?? [] : []
  }
  const queueGapPreview = (point: { x: number; y: number }, nearestOnly: boolean) => {
    gapHoverPointer.current = { point, nearestOnly }
    if (gapHoverFrame.current !== null) return
    gapHoverFrame.current = requestAnimationFrame(() => {
      gapHoverFrame.current = null
      const pending = gapHoverPointer.current
      gapHoverPointer.current = null
      if (!pending || gapDrag.current || tool !== 'gap') return
      updateGapPreview(findGaps(pending.point, gapObjectsForPoint(pending.point), pending.nearestOnly))
    })
  }
  const cancelGapPreviewFrame = () => {
    if (gapHoverFrame.current !== null) cancelAnimationFrame(gapHoverFrame.current)
    gapHoverFrame.current = null
    gapHoverPointer.current = null
  }

  // which paragraph of a style a running header shows on each page: worked out from where the text really lies, by the same
  // function the PDF export uses, so a page shows the same header on screen and in the file
  const runningHeaderForPage = useMemo(() => runningHeaderLookup(doc, frames, flow), [doc, frames, flow])

  /**
   * Every parent (master) page's objects, translated onto every document page that uses it - behind that page's own
   * objects, and not selectable (see the `parent-shadow` CSS: pointer-events: none lets a click reach whatever is
   * really on the page, or the pasteboard, right through them). Never shown while editing a parent itself.
   */
  const parentShadows = useMemo(() => {
    if (editingParentId) return { frames: [], images: [], shapes: [] }
    // only the pages actually on screen need their parent content computed
    const inView = pageParents.map((parentId, pageIndex) => {
      const rect = rects[pageIndex]
      return rect && inViewY(rect.y, rect.h) ? parentId : null
    })
    return parentShadowContent(doc, parents, inView, sections, frames, runningHeaderForPage, parentOverrides, images, shapes)
  }, [doc, parents, pageParents, sections, frames, images, shapes, parentOverrides, flow, runningHeaderForPage, rects, editingParentId, scroll.y, vp.h])

  const overrideParentItem = (kind: ParentOverride['kind'], source: TextFrame | ImageFrame | ShapeFrame, event: ReactPointerEvent<Element>) => {
    const parentShadowRef = (source as typeof source & { parentShadowRef?: ParentShadowRef }).parentShadowRef
    if (!event.shiftKey || !parentShadowRef || editingParentId || previewMode) return
    event.preventDefault()
    event.stopPropagation()
    const localId = newFrameId()
    const record: ParentOverride = { ...parentShadowRef, localId, kind }
    const sourceWithRef = source as typeof source & { parentShadowRef?: ParentShadowRef }
    const { parentShadowRef: _shadowRef, ...base } = sourceWithRef
    const z = nextZ(frames, images, shapes)
    if (kind === 'frame') {
      const frame: TextFrame = { ...base, id: localId, next: null, layerId: creationLayerId, z } as TextFrame
      pageOps.commit({ frames: [...frames, frame], parentOverrides: [...parentOverrides, record] })
      if (tool === 'type') setEditingId(localId)
    } else if (kind === 'image') {
      const image: ImageFrame = { ...base, id: localId, layerId: creationLayerId, z } as ImageFrame
      pageOps.commit({ images: [...images, image], parentOverrides: [...parentOverrides, record] })
    } else {
      const shape: ShapeFrame = { ...base, id: localId, layerId: creationLayerId, z } as ShapeFrame
      pageOps.commit({ shapes: [...shapes, shape], parentOverrides: [...parentOverrides, record] })
    }
    setSelectedPage(parentShadowRef.pageIndex)
    setSelectedId(localId)
  }

  const relockParentOverride = (localId: string) => {
    if (!parentOverrides.some((override) => override.localId === localId)) return false
    pageOps.commit({
      frames: frames.filter((frame) => frame.id !== localId),
      images: images.filter((image) => image.id !== localId),
      shapes: shapes.filter((shape) => shape.id !== localId),
      parentOverrides: parentOverrides.filter((override) => override.localId !== localId),
    })
    setEditingId((current) => current === localId ? null : current)
    if (selectedId === localId) setSelectedId(null)
    setMultiSel((current) => current.filter((id) => id !== localId))
    return true
  }

  const gapCursorClass = gapPreview.some((gap) => gap.axis === 'x') && gapPreview.some((gap) => gap.axis === 'y')
    ? ' gap-node'
    : gapPreview.some((gap) => gap.axis === 'x')
      ? ' gap-x'
      : gapPreview.some((gap) => gap.axis === 'y')
        ? ' gap-y'
        : ''
  const viewportClass =
    'viewport' +
    (previewMode ? ' preview' : '') +
    (colorSamplerActive ? ' color-sampler-active' : '') +
    (rasterBrushColor ? ' raster-brush-active' : '') +
    (tool === 'feather' ? ' feathertool' : '') +
    (!panMode && tool === 'gap' ? ' gaptool' + gapCursorClass : '') +
    (panning
      ? ' panning'
      : panMode
        ? ' pan'
        : marqueeTool
          ? ' marqueetool'
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
                  : tool === 'heal'
                    ? ' healtool'
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
                : '') + (penDragging ? ' pen-dragging' : '') + (scissorHover ? ' scissors-target' : '') + (graphicFrameHandleDragging ? ' graphic-frame-handle-dragging' : '') + (shiftPressed ? ' parent-override-mode' : '')

  // ── selection info for the properties panel and the thread lines ────────────────
  const selFrame = selectedId ? (frames.find((f) => f.id === selectedId) ?? null) : null
  const selImage = selectedId ? (images.find((im) => im.id === selectedId) ?? null) : null
  const selShape = selectedId ? (shapes.find((sh) => sh.id === selectedId) ?? null) : null
  useEffect(() => {
    if (fontPreview && fontPreview.frameId !== selFrame?.id) setFontPreview(null)
  }, [fontPreview, selFrame?.id])
  const selectedPaintShapes = multiSel.length > 1
    ? shapes.filter((shape) => multiSel.includes(shape.id))
    : selShape ? [selShape] : []
  const applySelectedShapePaint = (patch: Partial<ShapeFrame>, key: string) => {
    if (selectedPaintShapes.length === 0) {
      setDefaultShapePaint((current) => ({ ...current, ...patch }))
      return
    }
    const selected = new Set(selectedPaintShapes.map((shape) => shape.id))
    onShapesChange(shapes.map((shape) => selected.has(shape.id) ? { ...shape, ...patch } : shape), `${key}:${[...selected].join(',')}`)
  }
  /** the layers changed in the panel (order, names, colours, hidden, locked): what just became hidden or locked can no longer stay selected */
  const changeLayerSetup = (order: string[], next: Record<string, LayerInfo>, coalesceKey?: string) => {
    onLayersChange(order, next, coalesceKey)
    const views = new Map(layerViewsOf(order, next).map((view) => [view.id, view]))
    const closed = new Set([...frames, ...images, ...shapes].filter((item) => {
      const view = views.get(layerIdOf(item, order))
      return view?.hidden || view?.locked
    }).map((item) => item.id))
    if (selectedId && closed.has(selectedId)) setSelectedId(null)
    setMultiSel((current) => (current.some((id) => closed.has(id)) ? current.filter((id) => !closed.has(id)) : current))
  }
  /** an object hidden, locked or renamed in the panel: kept on the object itself, so that it is saved, undone and exported with it */
  const changeLayerItem = (id: string, patch: { hidden?: boolean; locked?: boolean; label?: string }, coalesceKey?: string) => {
    const apply = <T extends { id: string; hidden?: true; locked?: true; label?: string }>(item: T): T => {
      if (item.id !== id) return item
      const next = { ...item }
      if (patch.hidden !== undefined) {
        if (patch.hidden) next.hidden = true
        else delete next.hidden
      }
      if (patch.locked !== undefined) {
        if (patch.locked) next.locked = true
        else delete next.locked
      }
      if (patch.label !== undefined) {
        const label = patch.label.trim()
        if (label) next.label = label
        else delete next.label
      }
      return next
    }
    if (frames.some((frame) => frame.id === id)) onFramesChange(frames.map(apply), coalesceKey)
    else if (images.some((image) => image.id === id)) onImagesChange(images.map(apply), coalesceKey)
    else onShapesChange(shapes.map(apply), coalesceKey)
    if (patch.hidden || patch.locked) {
      if (selectedId === id) setSelectedId(null)
      setMultiSel((current) => current.filter((candidate) => candidate !== id))
    }
  }
  const reorderLayerItems = (layerId: string, orderedIds: string[]) => {
    const order = new Map(orderedIds.map((id, index) => [id, index]))
    const selected = new Set(orderedIds)
    const inLayer = (item: { layerId?: string }) => (item.layerId ?? 'layer-1') === layerId
    const nextFrames = frames.map((frame) => selected.has(frame.id) && inLayer(frame) ? { ...frame, z: order.get(frame.id) } : frame)
    const nextImages = images.map((image) => selected.has(image.id) && inLayer(image) ? { ...image, z: order.get(image.id) } : image)
    const nextShapes = shapes.map((shape) => selected.has(shape.id) && inLayer(shape) ? { ...shape, z: order.get(shape.id) } : shape)
    if (editingParentId) {
      onParentsChange(parents.map((parent) => parent.id === editingParentId ? { ...parent, frames: nextFrames, images: nextImages, shapes: nextShapes } : parent), 'parent:layer-item-order')
    } else pageOps.commit({ frames: nextFrames, images: nextImages, shapes: nextShapes })
  }
  const deleteLayerContents = (layerId: string) => {
    if (layerId === 'layer-1') return
    const belongsToLayer = (item: { layerId?: string }) => (item.layerId ?? 'layer-1') === layerId
    const ids = [...frames, ...images, ...shapes].filter(belongsToLayer).map((item) => item.id)
    const removed = new Set(ids)
    const nextFrames = ids.reduce((current, id) => current.some((frame) => frame.id === id) ? removeFrame(current, id) : current, frames)
    const nextImages = images.filter((image) => !removed.has(image.id))
    const nextShapes = shapes.filter((shape) => !removed.has(shape.id))
    const nextLayerOrder = layerOrder.filter((id) => id !== layerId)
    const { [layerId]: _removedLayer, ...nextLayers } = layers
    if (editingParentId) {
      onFramesChange(nextFrames, 'delete:layer-objects')
      onImagesChange(nextImages, 'delete:layer-objects')
      onShapesChange(nextShapes, 'delete:layer-objects')
    } else pageOps.commit({ frames: nextFrames, images: nextImages, shapes: nextShapes, layerOrder: nextLayerOrder, layers: nextLayers })
    setMultiSel((current) => current.filter((id) => !removed.has(id)))
    if (selectedId && removed.has(selectedId)) setSelectedIdRaw(null)
  }
  const selectedFeatherTarget = selectedId ? featherTargetForId(selectedId) : null
  const selectedFeather = selFrame?.feather ?? selImage?.feather ?? selShape?.feather ?? null
  const setSelectedFeatherEnabled = (enabled: boolean) => {
    if (!selectedFeatherTarget) return
    const next = enabled ? selectedFeather ?? { type: 'gradient' as const, x0: 0.5, y0: 0, x1: 0.5, y1: 1, points: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }] } : null
    commitFeather(selectedFeatherTarget, next)
  }
  const setSelectedFeatherOpacity = (index: number, opacity: number) => {
    if (!selectedFeatherTarget || selectedFeather?.type === 'basic' || selectedFeather?.type === 'directional' || !selectedFeather) return
    const points = selectedFeather.points.map((point, pointIndex) => pointIndex === index ? { ...point, opacity } : point)
    commitFeather(selectedFeatherTarget, { ...selectedFeather, points })
  }
  const featherGuide = featherDrag ? {
    start: featherWorldPoint(featherDrag.target, featherDrag.feather.x0, featherDrag.feather.y0),
    end: featherWorldPoint(featherDrag.target, featherDrag.feather.x1, featherDrag.feather.y1),
  } : null
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
  const textEditing = !!editingId && selChain.some((frame) => frame.id === editingId)
  // a collapsed text selection remains the active paragraph scope after focus moves into a toolbar
  const panelCaret =
    panelHead && !panelSel && textSel && textSel.headId === panelHead.id && textSel.a === textSel.b && textSel.a <= panelHead.text.length
      ? textSel
      : null
  // the Paragraph panel: indents/leading/etc. are always the whole story's own settings (never selection-scoped);
  // spaceBefore/spaceAfter show the FIRST paragraph the selection touches (own override if it has one, else the
  // story's own default) when there is a selection, since that is what applyParaSpacing would actually change
  // leading, indents and alignment can now differ paragraph by paragraph (a paragraph style, or a change made while
  // some text / a frame is selected is stored as a per-paragraph patch), so the fields show the first paragraph in
  // scope — otherwise a value just typed would snap back to the story's own the moment it was applied
  const scopeFlow = selFrame ? flow.get(selFrame.id) : undefined
  const panelParagraphRange = panelSel ?? panelCaret
  const scopeParagraph = panelHead
    ? panelParagraphRange
      ? paragraphsInRange(panelHead.text, panelParagraphRange.a, panelParagraphRange.b)[0]
      : scopeFlow
        ? paragraphsInRange(panelHead.text, scopeFlow.start, Math.max(scopeFlow.start + 1, scopeFlow.end))[0]
        : 0
    : 0
  const panelParagraphIndexes = panelHead
    ? panelParagraphRange
      ? paragraphsInRange(panelHead.text, panelParagraphRange.a, panelParagraphRange.b)
      : scopeFlow
        ? paragraphsInRange(panelHead.text, scopeFlow.start, Math.max(scopeFlow.start + 1, scopeFlow.end))
        : [0]
    : []
  const keepFirstLineValues = new Set(panelParagraphIndexes.map((index) => panelHead?.paraKeepFirstLines?.[index] ?? 0))
  const keepWithNextValues = new Set(panelParagraphIndexes.map((index) => (panelHead?.paraKeepWithNext?.[index] ? 1 : 0)))
  const keepLastLineValues = new Set(panelParagraphIndexes.map((index) => panelHead?.paraKeepLastLines?.[index] ?? 0))
  const scopePatch = panelHead?.paragraphStylePatches?.[scopeParagraph ?? 0]
  const paragraphStyle: TextStyle | null = panelHead
    ? {
        ...styleOf(panelHead),
        ...(scopePatch?.leading !== undefined ? { leading: scopePatch.leading } : {}),
        ...(scopePatch?.indentLeft !== undefined ? { indentLeft: scopePatch.indentLeft } : {}),
        ...(scopePatch?.indentRight !== undefined ? { indentRight: scopePatch.indentRight } : {}),
        ...(scopePatch?.firstLineIndent !== undefined ? { firstLineIndent: scopePatch.firstLineIndent } : {}),
        ...(scopePatch?.secondLineIndent !== undefined ? { secondLineIndent: scopePatch.secondLineIndent } : {}),
        ...(scopePatch?.align !== undefined ? { align: scopePatch.align } : {}),
        ...(scopePatch?.wordSpacingMin !== undefined ? { wordSpacingMin: scopePatch.wordSpacingMin } : {}),
        ...(scopePatch?.wordSpacingMax !== undefined ? { wordSpacingMax: scopePatch.wordSpacingMax } : {}),
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
        wordSpacingMin: scopePatch?.wordSpacingMin ?? panelHead.wordSpacingMin,
        wordSpacingMax: scopePatch?.wordSpacingMax ?? panelHead.wordSpacingMax,
      }
    : null

    const activeFootnoteHead = footnoteSel ? frames.find((frame) => frame.id === footnoteSel.headId) : undefined
    const activeFootnote = activeFootnoteHead?.footnotes?.find((note) => note.id === footnoteSel?.noteId)
    const activeFootnoteStyle = activeFootnote ? activeFootnote.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, activeFootnote.paragraphStyleId) : null
    const activeFootnoteRuns = activeFootnote && activeFootnoteStyle ? normalizeRuns(activeFootnote.content, activeFootnote.runs, activeFootnoteStyle) : []
    const activeFootnoteSelected = !!footnoteSel && footnoteSel.a !== footnoteSel.b
    const footnoteToolbarStyle: TextStyle | null = activeFootnote && activeFootnoteStyle
      ? {
          ...activeFootnoteStyle,
          ...(activeFootnoteSelected
            ? styleAtChar(activeFootnoteRuns, Math.min(footnoteSel!.a, footnoteSel!.b), activeFootnoteStyle)
            : styleAtChar(activeFootnoteRuns, Math.max(0, footnoteSel!.a - 1), activeFootnoteStyle)),
        }
      : null
    const toolbarTextStyle = footnoteToolbarStyle ?? panelStyle
    const toolbarParagraphStyle = activeFootnoteStyle ?? paragraphStyle
    const toolbarTable = selectedTable()
    const toolbarTableResolved = toolbarTable
      ? resolveCell(toolbarTable.table, tableSel?.id === toolbarTable.id ? tableSel.r0 : 0, tableSel?.id === toolbarTable.id ? tableSel.c0 : 0)
      : null
    const toolbarTableText: TextStyle | null = toolbarTableResolved ? {
      fontFamily: toolbarTableResolved.fontFamily,
      fontSize: toolbarTableResolved.fontSize,
      color: toolbarTableResolved.color,
      weight: toolbarTableResolved.weight,
      italic: toolbarTableResolved.italic,
      tracking: toolbarTableResolved.tracking,
      align: toolbarTableResolved.align,
      leading: toolbarTableResolved.leading,
      spaceBefore: toolbarTableResolved.spaceBefore,
      spaceAfter: toolbarTableResolved.spaceAfter,
    } : null

  // more than one size in the text the panel speaks for: its size field must not pretend one of them is the size
  const allFootnoteSizes = footnoteSel?.allNotes && activeFootnoteHead
    ? (activeFootnoteHead.footnotes ?? []).flatMap((note) => normalizeRuns(note.content, note.runs, note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)).map((run) => run.style.fontSize))
    : []
  const panelSizeMixed = footnoteSel
    ? footnoteSel.allNotes
      ? new Set(allFootnoteSizes).size > 1
      : activeFootnote && activeFootnoteSelected
        ? new Set(sliceRuns(activeFootnoteRuns, Math.min(footnoteSel.a, footnoteSel.b), Math.max(footnoteSel.a, footnoteSel.b)).map((run) => run.style.fontSize)).size > 1
        : false
    : panelHead && !panelCaret
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
  // paragraph style restyles the whole thing, as in professional layout tools; a lone frame in this app is almost always meant
  // to read as a single style throughout, so this is also what decides which style, if any, the frame is shown under.
  const panelRange: { a: number; b: number } | null = !panelHead
    ? null
    : textSel && textSel.headId === panelHead.id
      ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) }
      : { a: 0, b: panelHead.text.length }
  const highlightedStyleId: string | null | undefined = (() => {
    if (footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      return note?.paragraphStyleId ?? null
    }
    if (!panelHead || !panelRange) return undefined
    const ids = new Set(paragraphsInRange(panelHead.text, panelRange.a, panelRange.b).map((index) => paragraphStyleIdOf(panelHead, index)))
    if (ids.size > 1) return null // the range reaches across several styles: none is "the" style
    const only = [...ids][0]
    return only ?? undefined
  })()

  /** a style's fill and line, as a paragraph carries them (a line needs a width; its colour defaults to black) */
  const paragraphBoxOf = (look: ParagraphStyleRecord['patch']): ParagraphBox => ({
    ...(look.background ? { background: look.background } : {}),
    ...(look.borderWidth ? { borderWidth: look.borderWidth, borderColor: look.borderColor ?? '#000000' } : {}),
  })

  const resolveParagraphStyle = (id: string, source = paragraphStyles, seen = new Set<string>()): ParagraphStyleRecord['patch'] => {
    if (seen.has(id)) return {}
    const style = source.find((candidate) => candidate.id === id)
    if (!style) return {}
    const nextSeen = new Set(seen).add(id)
    return { ...(style.basedOnId ? resolveParagraphStyle(style.basedOnId, source, nextSeen) : {}), ...style.patch }
  }

  // ── character styles ────────────────────────────────────────────────────────
  /** the character styles with what each is based on already folded in: what the functions that write a style into text want */
  const resolvedChars = resolvedRecords(characterStyles)
  /** how a paragraph looks before any character style: the story's own look, then what its paragraph style says */
  const paragraphLookAt = (head: TextFrame, offset: number): CharStyle => {
    const id = paragraphStyleIdOf(head, paraIndexAt(head.text, offset))
    const resolved = id ? resolveParagraphStyle(id) : {}
    const look: Record<string, unknown> = { ...charStyleOf(head) }
    for (const key of CHAR_LOOK_KEYS) {
      const value = (resolved as Record<string, unknown>)[key]
      if (value !== undefined) look[key] = value
    }
    return look as unknown as CharStyle
  }

  /** a story's head with `change` applied to the runs of its text and of each of its notes (`base`: the look a text goes back to) */
  const withStoryRuns = (frame: TextFrame, change: (text: string, runs: Run[], base: (paragraphStart: number) => Partial<CharStyle>) => Run[]): TextFrame => {
    let next = frame
    if (frame.text) {
      const runs = normalizeRuns(frame.text, frame.runs, frame)
      const changed = change(frame.text, runs, (start) => paragraphLookAt(frame, start))
      if (changed !== runs) next = { ...next, runs: changed }
    }
    if (frame.footnotes?.length) {
      let touched = false
      const footnotes = frame.footnotes.map((item) => {
        const base = item.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, item.paragraphStyleId)
        const runs = normalizeRuns(item.content, item.runs, base)
        const changed = change(item.content, runs, () => base)
        if (changed === runs) return item
        touched = true
        return { ...item, runs: changed }
      })
      if (touched) next = { ...next, footnotes }
    }
    return next
  }

  /**
   * The nested styles of the paragraph styles in `styles` given to the paragraphs of a story that are in those styles
   * (`onlyStyleId`: just that one; `onlyIndexes`: just those paragraphs). `formerly`: styles the rules of `onlyStyleId` used
   * before, which are let go of too. `chars`: the character styles to use when the document's own list is about to change.
   */
  const applyNestedToFrame = (frame: TextFrame, styles: ParagraphStyleRecord[], onlyStyleId?: string, onlyIndexes?: ReadonlySet<number>, formerly: Iterable<string> = [], chars: CharacterStyleRecord[] = resolvedChars): TextFrame => {
    if (!frame.text || chars.length === 0) return frame
    const rulesOf = new Map(styles.filter((style) => (!onlyStyleId || style.id === onlyStyleId) && (style.nested?.length || (onlyStyleId && [...formerly].length > 0))).map((style) => [style.id, style.nested ?? []]))
    if (rulesOf.size === 0) return frame
    // the paragraph style a paragraph is in, looked up in `styles` (the list may be one the document does not have yet)
    const styleIdOf = (index: number): string | undefined => {
      const listed = frame.paragraphStyleIds?.[index]
      const named = frame.paragraphStyleNames?.[index]
      return styles.find((style) => style.id === listed)?.id ?? styles.find((style) => !!named && style.name === named)?.id ?? styles.find((style) => style.id === frame.paragraphStyleId)?.id ?? styles[0]?.id
    }
    let runs = normalizeRuns(frame.text, frame.runs, frame)
    let changed = false
    let offset = 0
    frame.text.split('\n').forEach((paragraph, index) => {
      const start = offset
      offset += paragraph.length + 1
      if (onlyIndexes && !onlyIndexes.has(index)) return
      const styleId = styleIdOf(index)
      const rules = styleId ? rulesOf.get(styleId) : undefined
      if (!rules) return
      const next = applyNestedStyles(frame.text, runs, start, start + paragraph.length, rules, chars, (at) => paragraphLookAt(frame, at), formerly)
      if (next !== runs) {
        runs = next
        changed = true
      }
    })
    return changed ? { ...frame, runs } : frame
  }

  /** the nested styles of one paragraph style, given again to all the paragraphs that are in it */
  const applyNestedStylesCmd = (styleId: string) => {
    const nextFrames = frames.map((frame) => applyNestedToFrame(frame, paragraphStyles, styleId))
    if (nextFrames.some((frame, index) => frame !== frames[index])) onFramesChange(nextFrames, `nested-styles:${styleId}`)
  }

  /**
   * The frames with a character style (as a record that is already resolved) on the selected text, or on the whole text when
   * nothing is picked - null as the record takes the style off - or null when there is no text to give it to.
   */
  const characterStyleApplied = (record: CharacterStyleRecord | null): TextFrame[] | null => {
    if (footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (!head || !note) return null
      const selectedNotes = new Set(footnoteSel.allNotes ? (head.footnotes ?? []).map((item) => item.id) : [note.id])
      const nextNotes = (head.footnotes ?? []).map((item) => {
        if (!selectedNotes.has(item.id)) return item
        const base = item.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, item.paragraphStyleId)
        const runs = normalizeRuns(item.content, item.runs, base)
        const partial = !footnoteSel.allNotes && item.id === note.id && footnoteSel.a !== footnoteSel.b
        const from = partial ? Math.min(footnoteSel.a, footnoteSel.b) : 0
        const to = partial ? Math.max(footnoteSel.a, footnoteSel.b) : item.content.length
        if (to <= from) return item
        return { ...item, runs: record ? applyCharacterStyle(runs, from, to, record) : clearCharacterStyle(item.content, runs, from, to, resolvedChars, () => base) }
      })
      return frames.map((frame) => (frame.id === head.id ? { ...frame, footnotes: nextNotes } : frame))
    }
    if (!panelHead) return null
    const runs = normalizeRuns(panelHead.text, panelHead.runs, panelHead)
    const from = panelSel ? Math.min(panelSel.a, panelSel.b) : 0
    const to = panelSel ? Math.max(panelSel.a, panelSel.b) : panelHead.text.length
    if (to <= from) return null
    const nextRuns = record ? applyCharacterStyle(runs, from, to, record) : clearCharacterStyle(panelHead.text, runs, from, to, resolvedChars, (start) => paragraphLookAt(panelHead, start))
    return frames.map((frame) => (frame.id === panelHead.id ? { ...frame, runs: nextRuns } : frame))
  }

  /** a character style on the selected text; null takes the style off */
  const applyCharacterStyleCmd = (styleId: string | null) => {
    const record = styleId ? resolvedChars.find((style) => style.id === styleId) : undefined
    if (styleId && !record) return
    const next = characterStyleApplied(record ?? null)
    if (next) onFramesChange(next, `charstyle:${styleId ?? 'none'}`)
  }

  /** a new style, given to the selected text right away when asked: one undo step for both */
  const createCharacterStyle = (name: string, patch: CharacterStyleSettings, apply: boolean, basedOnId?: string) => {
    const record: CharacterStyleRecord = { id: `character-style-${newFrameId()}`, name, ...(basedOnId ? { basedOnId } : {}), patch }
    const list = [...characterStyles, record]
    const next = apply ? characterStyleApplied(resolvedRecords(list).find((style) => style.id === record.id) ?? null) : null
    pageOps.commit({ characterStyles: list, ...(next ? { frames: next } : {}) })
  }

  /**
   * A character style was edited: the text that has it - and the text of every style based on it - follows, in one undo
   * step with the styles themselves.
   */
  const changeCharacterStyle = (id: string, name: string, patch: CharacterStyleSettings, basedOnId?: string) => {
    const before = characterStyles.find((style) => style.id === id)
    if (!before) return
    const { basedOnId: _previousBase, ...rest } = before
    const nextStyles = characterStyles.map((style) => (style.id === id ? { ...rest, name, ...(basedOnId ? { basedOnId } : {}), patch } : style))
    const affected = [id, ...descendantsOf(nextStyles, id)]
    const nextFrames = frames.map((frame) => withStoryRuns(frame, (text, runs, base) => affected.reduce(
      (current, styleId) => updateCharacterStyleRuns(text, current, styleId, resolveCharacterPatch(characterStyles, styleId), resolveCharacterPatch(nextStyles, styleId), base),
      runs,
    )))
    pageOps.commit({ characterStyles: nextStyles, ...(nextFrames.some((frame, index) => frame !== frames[index]) ? { frames: nextFrames } : {}) })
  }

  /** deleting a style takes it off all the text that has it first, and the styles based on it move up to its own base */
  const deleteCharacterStyle = (id: string) => {
    const nextFrames = frames.map((frame) => withStoryRuns(frame, (text, runs, base) => (characterStyleIdsIn(runs).has(id) ? clearCharacterStyle(text, runs, 0, text.length, resolvedChars, base) : runs)))
    pageOps.commit({ characterStyles: withoutCharacterStyle(characterStyles, id), ...(nextFrames.some((frame, index) => frame !== frames[index]) ? { frames: nextFrames } : {}) })
  }

  /** the run style at the start of the selected text: undefined = no text is selected */
  const activeCharacterRunStyle: CharStyle | undefined = (() => {
    if (footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (!note) return undefined
      const base = note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)
      return styleAtChar(normalizeRuns(note.content, note.runs, base), Math.min(footnoteSel.a, footnoteSel.b), base)
    }
    if (!panelHead) return undefined
    return styleAtChar(normalizeRuns(panelHead.text, panelHead.runs, panelHead), panelSel ? Math.min(panelSel.a, panelSel.b) : 0, panelHead)
  })()
  /** the character style of the selected text: undefined = no text is selected, null = it has none */
  const activeCharacterStyleId: string | null | undefined = activeCharacterRunStyle === undefined ? undefined : activeCharacterRunStyle.charStyleId ?? null
  /** the selected text differs from its character style in something the style sets: the "+" beside the style's name */
  const activeCharacterStyleModified = (() => {
    const id = activeCharacterRunStyle?.charStyleId
    if (!id || !activeCharacterRunStyle) return false
    const wanted = resolveCharacterPatch(characterStyles, id) as Record<string, unknown>
    const have = activeCharacterRunStyle as unknown as Record<string, unknown>
    return Object.entries(wanted).some(([key, value]) => String(have[key]).toLowerCase() !== String(value).toLowerCase())
  })()

  /** what the selected text sets beyond its paragraph's own look: the start of a style made from it */
  const characterStyleSelectionLook = (): CharacterStyleSettings => {
    let style: CharStyle
    let base: Partial<CharStyle>
    if (footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (!note) return {}
      const noteBase = note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)
      style = styleAtChar(normalizeRuns(note.content, note.runs, noteBase), Math.min(footnoteSel.a, footnoteSel.b), noteBase)
      base = noteBase
    } else if (panelHead) {
      const at = panelSel ? Math.min(panelSel.a, panelSel.b) : 0
      style = styleAtChar(normalizeRuns(panelHead.text, panelHead.runs, panelHead), at, panelHead)
      base = paragraphLookAt(panelHead, at)
    } else return {}
    const patch: Record<string, unknown> = {}
    for (const key of CHAR_LOOK_KEYS) {
      const value = style[key]
      if (value !== undefined && value !== base[key]) patch[key] = value
    }
    return patch as CharacterStyleSettings
  }

  /** the style becomes what the selected text looks like (what it keeps from its base is not repeated), and all text with it follows */
  const redefineCharacterStyle = (id: string) => {
    const record = characterStyles.find((style) => style.id === id)
    if (!record) return
    const patch = ownSettings(characterStyles.map((style) => (style.id === id ? { ...style, patch: characterStyleSelectionLook() } : style)), id)
    changeCharacterStyle(id, record.name, patch, record.basedOnId)
  }

  // where a character style is used, in reading order: the body text of each story, then its notes
  const charStyleSearchIndex = useRef<Record<string, number>>({})
  const characterStyleHits = (id: string): FindHit[] => {
    const out: FindHit[] = []
    headFrames(frames).forEach((head, index) => {
      const scan = (text: string, runs: Run[], key: (start: number) => number[], noteId?: string) => {
        let pos = 0
        let open: number | null = null
        const close = (end: number) => {
          if (open === null) return
          // a paragraph break at the end of the piece is not part of what the style is on
          const trimmed = text[end - 1] === '\n' ? end - 1 : end
          if (trimmed > open) out.push({ headId: head.id, ...(noteId ? { noteId } : {}), start: open, end: trimmed, key: key(open) })
          open = null
        }
        for (const run of runs) {
          const inside = run.style.charStyleId === id
          if (inside && open === null) open = pos
          if (!inside) close(pos)
          pos += run.len
        }
        close(pos)
      }
      if (head.text) scan(head.text, normalizeRuns(head.text, head.runs, head), (start) => [index, 0, 0, start])
      for (const note of head.footnotes ?? []) {
        const base = note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId)
        scan(note.content, normalizeRuns(note.content, note.runs, base), (start) => [index, 1, note.anchor, start], note.id)
      }
    })
    return out
  }

  /** selects the next (previous; 0: the first) piece of text that has the character style, and says how many there are */
  const findCharacterStyle = (id: string, direction: -1 | 0 | 1) => {
    const hits = characterStyleHits(id)
    if (hits.length === 0) return 0
    const previous = charStyleSearchIndex.current[id]
    const index = direction === 0 || previous === undefined ? (direction < 0 ? hits.length - 1 : 0) : (previous + direction + hits.length) % hits.length
    charStyleSearchIndex.current[id] = index
    showFindHit(hits[index])
    return hits.length
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
  const overrideParagraphs = !footnoteSel && panelHead && panelRange && typeof highlightedStyleId === 'string' ? paragraphsInRange(panelHead.text, panelRange.a, panelRange.b) : null
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
    if (footnoteSel) {
      const head = frames.find((frame) => frame.id === footnoteSel.headId)
      const note = head?.footnotes?.find((item) => item.id === footnoteSel.noteId)
      if (!head || !note) return
      const style = footnoteTextStyle(footnoteConfig, paragraphStyles, id)
      const selectedNotes = new Set(footnoteSel.allNotes ? (head.footnotes ?? []).map((item) => item.id) : [note.id])
      updateFrame(head.id, {
        footnotes: head.footnotes?.map((item) => selectedNotes.has(item.id)
          ? { ...item, paragraphStyleId: id, style: undefined, runs: normalizeRuns(item.content, undefined, style) }
          : item),
      }, `footnote-paragraph-style:${footnoteSel.allNotes ? 'all' : note.id}:${id}`)
      return
    }
    if (!selectedId) return
    const selected = frames.find((frame) => frame.id === selectedId)
    if (!selected) return
    const head = chainOf(frames, selected.id)[0]
    const range = textSel && textSel.headId === head.id ? { a: Math.min(textSel.a, textSel.b), b: Math.max(textSel.a, textSel.b) } : { a: 0, b: head.text.length }
    const indexes = paragraphsInRange(head.text, range.a, range.b)
    let next: TextFrame = head
    for (const index of indexes) next = restyleParagraphs(next, [index], paragraphStyleIdOf(next, index) ?? '', id)
    onFramesChange(frames.map((frame) => (frame.id === head.id ? next : frame)), `paragraph-style-selection:${head.id}`)
  }
  const changeParagraphStyle = (id: string, patch: Partial<ParagraphStyleRecord>) => {
    const nextStyles = paragraphStyles.map((style) => style.id === id ? { ...style, ...patch, patch: { ...style.patch, ...(patch.patch ?? {}) } } : style)
    onParagraphStylesChange(nextStyles)
    const previous = resolveParagraphStyle(id)
    const resolved = resolveParagraphStyle(id, nextStyles)
    const charPatch = Object.fromEntries(['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'].filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]])) as Partial<CharStyle>
    const refreshStyleRuns = (frame: TextFrame) => restyleRange(normalizeRuns(frame.text, frame.runs, frame), 0, frame.text.length, (style) => Object.fromEntries(
      (['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'] as const)
        .filter((key) => style[key] === previous[key] && resolved[key] !== undefined)
        .map((key) => [key, resolved[key]]),
    ) as Partial<CharStyle>)
    const oldFootnoteStyle = footnoteTextStyle(footnoteConfig, paragraphStyles, id)
    const nextFootnoteStyle = footnoteTextStyle(footnoteConfig, nextStyles, id)
    const updateFootnoteStyles = (frame: TextFrame) => {
      if (!frame.footnotes?.some((note) => note.paragraphStyleId === id)) return frame
      const footnotes = frame.footnotes.map((note) => {
        if (note.paragraphStyleId !== id) return note
        return updateFootnoteParagraphStyle(note, oldFootnoteStyle, nextFootnoteStyle)
      })
      return { ...frame, footnotes }
    }
    const updateImportedParagraphs = (frame: TextFrame) => {
      const hasFrameStyle = frame.paragraphStyleId === id
      const hasParagraphStyles = !!frame.paragraphStyleIds?.length
      const usesDefaultStyle = !frame.paragraphStyleId && !hasParagraphStyles && paragraphStyles[0]?.id === id
      if (!hasFrameStyle && !frame.paragraphStyleIds?.includes(id) && !usesDefaultStyle) return frame
      // the story as a whole is on this style: its look becomes the frame's own (the keep setting is a paragraph one, not a frame field)
      const { keepLinesTogether, keepWithNext, listKind, listGap, background, borderColor, borderWidth, ...frameLook } = resolved
      if ((hasFrameStyle || usesDefaultStyle) && !hasParagraphStyles) {
        const count = frame.text.split('\n').length
        // "keep all lines" follows the style; a minimum of first/last lines set on a paragraph itself stays
        const keepOf = (list: (number | null)[] | undefined) => {
          const kept = Array.from({ length: count }, (_, index) => styleKeepOverride(list?.[index], !!keepLinesTogether) ?? null)
          return kept.some((value) => value) ? kept : undefined
        }
        const paragraphStylePatches = Array.from({ length: count }, (_, index) => {
          const patch = { ...(frame.paragraphStylePatches?.[index] ?? {}) }
          if (listKind) patch.listKind = listKind
          else delete patch.listKind
          if (listKind && listGap !== undefined) patch.listGap = listGap
          else delete patch.listGap
          delete patch.background
          delete patch.borderColor
          delete patch.borderWidth
          Object.assign(patch, paragraphBoxOf(resolved))
          return patch
        })
        return { ...frame, ...frameLook, paragraphStylePatches, paraKeepFirstLines: keepOf(frame.paraKeepFirstLines), paraKeepLastLines: keepOf(frame.paraKeepLastLines), paraKeepWithNext: keepWithNext ? Array.from({ length: count }, () => 1) : undefined, runs: refreshStyleRuns(frame) }
      }
      const paragraphStyleIds = frame.paragraphStyleIds ?? []
      const paragraphStylePatches: NonNullable<TextFrame['paragraphStylePatches']> = frame.paragraphStylePatches ? frame.paragraphStylePatches.slice() : paragraphStyleIds.map(() => ({}))
      let paraSpaceBefore = frame.paraSpaceBefore
      let paraSpaceAfter = frame.paraSpaceAfter
      let paraKeepFirstLines = frame.paraKeepFirstLines
      let paraKeepLastLines = frame.paraKeepLastLines
      let paraKeepWithNext = frame.paraKeepWithNext
      let runs = normalizeRuns(frame.text, frame.runs, frame)
      let start = 0
      paragraphStyleIds.forEach((styleId, index) => {
        const end = index + 1 < paragraphStyleIds.length ? (frame.text.indexOf('\n', start) + 1 || frame.text.length) : frame.text.length
        if (styleId === id) {
          runs = applyParagraphLook(runs, start, end, charPatch, resolvedChars)
          // a window under the opening words is not part of the style: it stays when the style is edited
          const keptWindow = paragraphStylePatches[index]?.windowIndent
          const keptWindowWords = paragraphStylePatches[index]?.windowWords
          paragraphStylePatches[index] = {
            ...Object.fromEntries(['leading', 'wordSpacingMin', 'wordSpacingMax', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align'].filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]])),
            ...(listKind ? { listKind } : {}),
            ...(listKind && listGap !== undefined ? { listGap } : {}),
            ...paragraphBoxOf(resolved),
            ...(keptWindow ? { windowIndent: keptWindow, ...(keptWindowWords ? { windowWords: keptWindowWords } : {}) } : {}),
          }
          if (resolved.spaceBefore !== undefined) paraSpaceBefore = withParaOverride(paraSpaceBefore, index, resolved.spaceBefore)
          if (resolved.spaceAfter !== undefined) paraSpaceAfter = withParaOverride(paraSpaceAfter, index, resolved.spaceAfter)
          paraKeepFirstLines = setParaOverride(paraKeepFirstLines, index, styleKeepOverride(paraKeepFirstLines?.[index], !!keepLinesTogether))
          paraKeepLastLines = setParaOverride(paraKeepLastLines, index, styleKeepOverride(paraKeepLastLines?.[index], !!keepLinesTogether))
          paraKeepWithNext = setParaOverride(paraKeepWithNext, index, keepWithNext ? 1 : undefined)
        }
        start = end
      })
      const sameStyle = paragraphStyleIds.length > 0 && paragraphStyleIds.every((styleId) => styleId === id)
      return { ...frame, ...(sameStyle ? frameLook : {}), paragraphStylePatches, paraSpaceBefore, paraSpaceAfter, paraKeepFirstLines, paraKeepLastLines, paraKeepWithNext, runs }
    }
    const formerlyNested = (paragraphStyles.find((style) => style.id === id)?.nested ?? []).map((rule) => rule.styleId)
    onFramesChange(frames.map((frame) => applyNestedToFrame(updateImportedParagraphs(updateFootnoteStyles(frame)), nextStyles, id, undefined, formerlyNested)), `paragraph-style-edit:${id}`)
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
    // from text (as a new style does in professional layout tools): the style takes what the paragraph carries beyond its own style, is based on
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

  const deleteParagraphStyles = (styleIds: string[]) => {
    const removed = new Set(styleIds.filter((id) => paragraphStyles.some((style) => style.id === id)))
    if (removed.size === 0 || removed.size >= paragraphStyles.length) return
    const remaining = paragraphStyles.filter((style) => !removed.has(style.id))
    const fallback = remaining[0]
    const removedNames = new Set(paragraphStyles.filter((style) => removed.has(style.id)).map((style) => style.name))
    const nextStyles = remaining.map((style) => ({
      ...style,
      ...(style.basedOnId && removed.has(style.basedOnId) ? { basedOnId: fallback.id } : {}),
      ...(style.nextStyleId && removed.has(style.nextStyleId) ? { nextStyleId: fallback.id } : {}),
    }))
    const nextFrames = frames.map((frame) => {
      const paragraphStyleId = frame.paragraphStyleId && removed.has(frame.paragraphStyleId) ? fallback.id : frame.paragraphStyleId
      const paragraphStyleIds = frame.paragraphStyleIds?.map((id) => removed.has(id) ? fallback.id : id)
      const paragraphStyleNames = frame.paragraphStyleNames?.map((name, index) =>
        (frame.paragraphStyleIds?.[index] && removed.has(frame.paragraphStyleIds[index]) || removedNames.has(name)) ? fallback.name : name,
      )
      const footnotes = frame.footnotes?.map((note) => note.paragraphStyleId && removed.has(note.paragraphStyleId) ? { ...note, paragraphStyleId: fallback.id } : note)
      const changed = paragraphStyleId !== frame.paragraphStyleId ||
        paragraphStyleIds?.some((id, index) => id !== frame.paragraphStyleIds?.[index]) ||
        paragraphStyleNames?.some((name, index) => name !== frame.paragraphStyleNames?.[index]) ||
        footnotes?.some((note, index) => note !== frame.footnotes?.[index])
      return changed ? { ...frame, paragraphStyleId, paragraphStyleIds, paragraphStyleNames, footnotes } : frame
    })
    onParagraphStylesChange(nextStyles)
    if (nextFrames.some((frame, index) => frame !== frames[index])) onFramesChange(nextFrames, 'paragraph-style-delete-many')
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

  // ── "יתומים, אלמנות וכיווץ" (טיפוגרפיה) ──────────────────────────────────────────
  /** every story touched by the chosen scope, paired with which of its paragraphs are in it: every paragraph of
   *  every story for "doc"; for "selection", the paragraphs the current text selection spans, or (nothing text-
   *  selected, but a frame is) that frame's whole story. */
  const scopedParagraphs = (scope: 'doc' | 'selection', styleId = ''): { head: TextFrame; indexes: number[] }[] => {
    const inStyle = (head: TextFrame, indexes: number[]) => (styleId ? indexes.filter((index) => paragraphStyleIdOf(head, index) === styleId) : indexes)
    const allIndexes = (text: string) => Array.from({ length: text.split('\n').length }, (_, i) => i)
    if (scope === 'doc') return headFrames(frames).map((head) => ({ head, indexes: inStyle(head, allIndexes(head.text)) }))
    if (textSel) {
      const head = frames.find((f) => f.id === textSel.headId)
      return head ? [{ head, indexes: inStyle(head, paragraphsInRange(head.text, Math.min(textSel.a, textSel.b), Math.max(textSel.a, textSel.b))) }] : []
    }
    const headId = selectedId ? flow.get(selectedId)?.headId : null
    const head = headId ? frames.find((f) => f.id === headId) : undefined
    return head ? [{ head, indexes: inStyle(head, allIndexes(head.text)) }] : []
  }

  /** Sets (or clears, with 0) the minimum first/last lines of the scope's paragraphs that must stay together with
   *  the rest of the paragraph instead of splitting alone into the next frame - see textLayout.ts's `flowFrames`,
   *  the only thing that actually acts on `paraKeepFirstLines`/`paraKeepLastLines`. */
  const withKeepLinesTogether = (sourceFrames: TextFrame[], targets: { head: TextFrame; indexes: number[] }[], keepFirst: number, keepLast: number): TextFrame[] =>
    sourceFrames.map((f) => {
      const target = targets.find((t) => t.head.id === f.id)
      if (!target) return f
      let paraKeepFirstLines = f.paraKeepFirstLines
      let paraKeepLastLines = f.paraKeepLastLines
      for (const index of target.indexes) {
        // a paragraph that keeps ALL its lines together (a paragraph style's option) is stricter than any minimum: it stays so
        if (f.paraKeepFirstLines?.[index] === KEEP_ALL_LINES && f.paraKeepLastLines?.[index] === KEEP_ALL_LINES) continue
        paraKeepFirstLines = withParaOverride(paraKeepFirstLines, index, keepFirst)
        paraKeepLastLines = withParaOverride(paraKeepLastLines, index, keepLast)
      }
      return { ...f, paraKeepFirstLines, paraKeepLastLines }
    })

  /** A lone last word left at the bottom of a paragraph (or top of the next frame) reads badly: this swaps the
   *  space right before each target paragraph's last word for a non-breaking one, the same trick GREP-based "no
   *  break" tools use - the word can now only wrap together with the one before it. A one-word paragraph, or one
   *  already ending in a non-breaking space, is left alone. Pure, like `withKeepLinesTogether` above - see
   *  `applySmartLayout` for why these all return a new array instead of calling `onFramesChange` themselves. */
  const withNoBreakLastWord = (sourceFrames: TextFrame[], targets: { head: TextFrame; indexes: number[] }[]): TextFrame[] => {
    const NBSP = ' '
    return sourceFrames.map((f) => {
      const target = targets.find((t) => t.head.id === f.id)
      if (!target) return f
      let text = f.text
      for (const index of target.indexes) {
        const [start, boundEnd] = paragraphBounds(text, index)
        const end = text[boundEnd - 1] === '\n' ? boundEnd - 1 : boundEnd
        const trimmed = text.slice(start, end).replace(/\s+$/, '')
        // the gap before the last word: a space, or already a non-breaking one (then the word is glued and the paragraph is left alone,
        // so running the tool again does not glue one more word to the tail each time)
        const lastGap = Math.max(trimmed.lastIndexOf(' '), trimmed.lastIndexOf(NBSP))
        if (lastGap <= 0 || trimmed[lastGap] === NBSP) continue // a single word, or nothing earlier to keep it together with, or done already
        text = text.slice(0, start + lastGap) + NBSP + text.slice(start + lastGap + 1)
      }
      return text === f.text ? f : { ...f, text }
    })
  }

  /** Tightens (negative `tracking`, 1/1000 em) any target paragraph whose own last wrapped line is short (at most
   *  `maxWords` words) and isn't its only line - nudging just enough text back onto that line to avoid a visibly
   *  short one. Measured at the paragraph's own story's frame width; a story threaded across frames of different
   *  widths is measured at its first frame's, an accepted approximation. Pure, like the two tools above. */
  const withSmartTracking = (sourceFrames: TextFrame[], targets: { head: TextFrame; indexes: number[] }[], tracking: number, maxWords: number): TextFrame[] =>
    sourceFrames.map((f) => {
      const target = targets.find((t) => t.head.id === f.id)
      if (!target) return f
      const style = styleOf(f)
      const width = insetBox(f, style, 0, 0).w
      const sourceRuns = normalizeRuns(f.text, f.runs, f)
      let runs = sourceRuns
      for (const index of target.indexes) {
        const [start, boundEnd] = paragraphBounds(f.text, index)
        const end = f.text[boundEnd - 1] === '\n' ? boundEnd - 1 : boundEnd
        const para = f.text.slice(start, end)
        const totalWords = para.trim().split(/\s+/).filter(Boolean).length
        if (totalWords <= 1) continue
        const paragraphPatch = f.paragraphStylePatches?.[index]
        const paragraphRuns = sliceRuns(sourceRuns, start, end)
        const lastWords = lastLineWordCount(para, style, width, paragraphRuns, paragraphPatch)
        if (lastWords < totalWords && lastWords <= maxWords) runs = styleRange(runs, start, end, { tracking })
      }
      return runs === f.runs ? f : { ...f, runs }
    })

  /** SmartLayoutDialog's "החל": chains every tool that was turned on onto the SAME frames array (each tool above
   *  is a pure `frames -> frames` step, not an `onFramesChange` of its own), so they combine into one array and
   *  one `onFramesChange` / undo step instead of each undoing whichever ran before it. */
  const applySmartLayout = (r: SmartLayoutRequest): number => {
    // only the stories that have a paragraph in the chosen style (and, with a style, only those paragraphs) are touched
    const targets = scopedParagraphs(r.scope, r.styleId).filter((target) => target.indexes.length > 0)
    const matched = targets.reduce((sum, target) => sum + target.indexes.length, 0)
    if (targets.length === 0) {
      // with a style chosen, "nothing in it" is worth telling: the dialog stays and says so
      if (r.styleId) return 0
      setSmartLayoutDialog(false)
      return 0
    }
    let next = frames
    if (r.keepLines) next = withKeepLinesTogether(next, targets, r.keepFirst, r.keepLast)
    if (r.noBreak) next = withNoBreakLastWord(next, targets)
    if (r.smartTracking) next = withSmartTracking(next, targets, r.tracking, r.maxWords)
    if (next !== frames) onFramesChange(next, 'smart-layout')
    setSmartLayoutDialog(false)
    return matched
  }

  const paragraphUsesStyle = (frame: TextFrame, index: number, styleId: string) => {
    // an id that names no defined style "matches" nothing - resolving it to {} would otherwise match every paragraph
    if (!paragraphStyles.some((style) => style.id === styleId)) return false
    const style = resolveParagraphStyle(styleId)
    const [start] = paragraphBounds(frame.text, index)
    const run = styleAtChar(normalizeRuns(frame.text, frame.runs, frame), start, frame)
    return Object.entries(style).filter(([key]) => ['fontFamily', 'fontSize', 'weight', 'italic', 'color', 'outlineColor', 'outlineWidth'].includes(key)).every(([key, value]) => value === undefined || run[key as keyof CharStyle] === value)
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

  const footnoteStyleOccurrences = (styleId: string) => headFrames(frames).flatMap((head) =>
    (head.footnotes ?? []).filter((note) => note.paragraphStyleId === styleId).map((note) => {
      const targetId = [...flow].find(([, part]) => part.headId === head.id && part.footnotes.some((placed) => placed.id === note.id && (placed.offset ?? 0) === 0 && !placed.continued))?.[0]
      return { frame: head, target: frames.find((frame) => frame.id === targetId) ?? head, note }
    }),
  )

  const allStyleOccurrences = (styleId: string) => [
    ...styleOccurrences(styleId).map((occurrence) => ({ kind: 'body' as const, ...occurrence })),
    ...footnoteStyleOccurrences(styleId).map((occurrence) => ({ kind: 'footnote' as const, ...occurrence })),
  ]

  /**
   * Gives paragraphs of a story another paragraph style: its name in the per-paragraph lists, the character look in the
   * runs, and the paragraph look (leading, spacing, indents, alignment) in the paragraph overrides. A story that has no
   * lists yet gets them here, so the paragraphs that stay on `sourceId` still carry it afterwards.
   */
  const restyleParagraphs = (frame: TextFrame, indexes: number[], sourceId: string, targetId: string, keepLook = false, styles = paragraphStyles, hardReset = false): TextFrame => {
    if (indexes.length === 0) return frame
    const resolved = resolveParagraphStyle(targetId, styles)
    const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => resolved[key as keyof typeof resolved] !== undefined).map((key) => [key, resolved[key as keyof typeof resolved]]))
    const charPatch = pick(['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking']) as Partial<CharStyle>
    // what the old style set and the new one leaves alone goes back to plain: bold text swapped to a regular style must
    // not stay bold. hardReset (discarding a paragraph's own overrides back to its own style) has no "old style" to
    // compare against - it always fills in plain, since the point is to match the style exactly, run-level formatting
    // the style never mentions included
    const leaving = keepLook ? {} : resolveParagraphStyle(sourceId, styles)
    if ((hardReset || leaving.weight !== undefined) && charPatch.weight === undefined) charPatch.weight = 400
    if ((hardReset || leaving.italic !== undefined) && charPatch.italic === undefined) charPatch.italic = false
    if ((hardReset || leaving.tracking !== undefined) && charPatch.tracking === undefined) charPatch.tracking = 0
    if ((hardReset || leaving.outlineWidth !== undefined) && charPatch.outlineWidth === undefined) charPatch.outlineWidth = 0
    if ((hardReset || leaving.outlineColor !== undefined) && charPatch.outlineColor === undefined) charPatch.outlineColor = '#000000'
    const layout = {
      ...pick(['leading', 'wordSpacingMin', 'wordSpacingMax', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'align', 'listGap']),
      ...(resolved.listKind ? { listKind: resolved.listKind } : {}),
      ...paragraphBoxOf(resolved),
    } as NonNullable<TextFrame['paragraphStylePatches']>[number]
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
    let paraKeepFirstLines = frame.paraKeepFirstLines
    let paraKeepLastLines = frame.paraKeepLastLines
    let paraKeepWithNext = frame.paraKeepWithNext
    // "keep lines together": the paragraph never splits between frames - its first and its last lines both stay with the rest
    const keepsAll = !!resolved.keepLinesTogether
    const keepNext = resolved.keepWithNext ? 1 : undefined
    for (const index of indexes) {
      const [start, end] = paragraphBounds(frame.text, index)
      ids[index] = targetId
      names[index] = targetName
      patches[index] = layout
      // keepLook: the text already looks the way the style says (a style made from it), it is only tagged
      if (keepLook) continue
      runs = applyParagraphLook(runs, start, end, charPatch, resolvedChars)
      paraSpaceBefore = override(paraSpaceBefore, index, layout.spaceBefore)
      paraSpaceAfter = override(paraSpaceAfter, index, layout.spaceAfter)
      paraKeepFirstLines = setParaOverride(paraKeepFirstLines, index, styleKeepOverride(paraKeepFirstLines?.[index], keepsAll))
      paraKeepLastLines = setParaOverride(paraKeepLastLines, index, styleKeepOverride(paraKeepLastLines?.[index], keepsAll))
      paraKeepWithNext = setParaOverride(paraKeepWithNext, index, keepNext)
    }
    // every paragraph moved: the story as a whole is now on the target style too
    const whole = new Set(indexes).size >= count
    const storyStyle = whole && !keepLook ? (pick(['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'leading', 'tracking', 'align', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent']) as Partial<TextStyle>) : {}
    const paragraphStyleId = whole ? targetId : !hadLists || frame.paragraphStyleId === sourceId ? undefined : frame.paragraphStyleId
    const restyled: TextFrame = { ...frame, ...storyStyle, paragraphStyleId, paragraphStyleIds: ids, paragraphStyleNames: names, paragraphStylePatches: patches, paraSpaceBefore, paraSpaceAfter, paraKeepFirstLines, paraKeepLastLines, paraKeepWithNext, runs }
    return applyNestedToFrame(restyled, styles, targetId, new Set(indexes))
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
    const occurrences = allStyleOccurrences(styleId)
    if (occurrences.length > 0) {
      const previous = styleSearchIndex.current[styleId]
      const index = direction === 0 ? 0 : previous === undefined ? (direction < 0 ? occurrences.length - 1 : 0) : (previous + direction + occurrences.length) % occurrences.length
      styleSearchIndex.current[styleId] = index
      const occurrence = occurrences[index]
      if (occurrence.kind === 'footnote') {
        const page = ownerPage(rects, occurrence.target.x + occurrence.target.w / 2, occurrence.target.y + occurrence.target.h / 2)
        setSelectedPage(page)
        setSelectedId(occurrence.target.id)
        setEditingId(null)
        setTextSel(null)
        setEditingFootnoteId(null)
        setEditingFootnoteFrameId(null)
        setEditingFootnoteOffset(null)
        setFootnoteRequest(null)
        setFootnoteSel({ headId: occurrence.frame.id, noteId: occurrence.note.id, a: 0, b: occurrence.note.content.length })
        goTo(spreadOfPage(page))
        return occurrences.length
      }
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
    const occurrences = allStyleOccurrences(sourceId)
    if (occurrences.length === 0) return 0
    const current = Math.min(styleSearchIndex.current[sourceId] ?? 0, occurrences.length - 1)
    const occurrence = occurrences[current]
    if (occurrence.kind === 'footnote') {
      const oldBase = footnoteTextStyle(footnoteConfig, paragraphStyles, occurrence.note.paragraphStyleId)
      const nextBase = footnoteTextStyle(footnoteConfig, paragraphStyles, targetId)
      const styleKeys = ['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'leading', 'tracking', 'align', 'wordSpacingMin', 'wordSpacingMax', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent'] as const
      const styleOverrides = occurrence.note.style
        ? Object.fromEntries(styleKeys.filter((key) => occurrence.note.style![key] !== undefined && occurrence.note.style![key] !== oldBase[key]).map((key) => [key, occurrence.note.style![key]])) as Partial<TextStyle>
        : {}
      const charKeys = ['fontFamily', 'color', 'outlineColor', 'outlineWidth', 'weight', 'italic', 'fontSize', 'tracking'] as const
      const runs = occurrence.note.runs?.map((run) => {
        const runStyle = { ...run.style }
        for (const key of charKeys) if (runStyle[key] === oldBase[key]) Object.assign(runStyle, { [key]: nextBase[key] })
        return { ...run, style: runStyle }
      })
      const nextNote = {
        ...occurrence.note,
        paragraphStyleId: targetId,
        ...(occurrence.note.style ? { style: { ...nextBase, ...styleOverrides } } : { style: undefined }),
        ...(runs ? { runs } : {}),
      }
      onFramesChange(frames.map((frame) => frame.id === occurrence.frame.id
        ? { ...frame, footnotes: frame.footnotes?.map((note) => note.id === occurrence.note.id ? nextNote : note) }
        : frame), `style-swap-one-footnote:${sourceId}:${targetId}`)
    } else {
      onFramesChange(frames.map((frame) => (frame.id === occurrence.frame.id ? restyleParagraphs(frame, [occurrence.index], sourceId, targetId) : frame)), `style-swap-one:${sourceId}:${targetId}`)
    }
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

  // ── parent (master) pages ──────────────────────────────────────────────────────
  /** A, B, C … Z, then AA, AB … - never reusing a prefix already on another parent */
  const nextParentPrefix = () => {
    const used = new Set(parents.map((p) => p.prefix))
    for (let n = 0; ; n++) {
      let s = ''
      let k = n
      do {
        s = String.fromCharCode(65 + (k % 26)) + s
        k = Math.floor(k / 26) - 1
      } while (k >= 0)
      if (!used.has(s)) return s
    }
  }
  const createParent = () => {
    const prefix = nextParentPrefix()
    const parent: ParentPage = { id: newFrameId(), prefix, name: `אב ${prefix}`, w: doc.width, h: doc.height, frames: [], images: [], shapes: [] }
    onParentsChange([...parents, parent])
    onSelectParent(parent.id)
    onEditParent(parent.id)
  }
  /** Removes a parent; every page that used it reverts to none (no parent applied), as in professional layout tools. */
  const deleteParent = (id: string) => {
    onParentsChange(parents.filter((p) => p.id !== id))
    if (pageParents.some((p) => p === id)) onPageParentsChange(pageParents.map((p) => (p === id ? null : p)))
    if (editingParentId === id) onExitParentEdit()
  }
  /** Applies a parent (or none) to the given document pages. */
  const applyParentToPages = (parentId: string | null, pageIndices: number[]) => {
    const set = new Set(pageIndices)
    const next = doc.pages > pageParents.length ? [...pageParents, ...Array<string | null>(doc.pages - pageParents.length).fill(null)] : pageParents.slice()
    for (const i of set) next[i] = parentId
    onPageParentsChange(next)
  }
  /**
   * "Detach": copies what every given page shows of its parent onto the page itself, as ordinary editable objects
   * at fresh ids (the matching half of a facing parent, each auto page number written out as that page's own
   * number), then clears that page's own parent - so every page keeps looking the same but stops following its
   * parent from then on. Every page is folded into the same three new arrays in one pass (not one onFramesChange
   * call per page), so detaching several pages at once doesn't have each call's stale `frames` overwrite the last.
   */
  const detachPagesFromParent = (pageIndices: number[]) => {
    const { frames: newFrames, images: newImages, shapes: newShapes } = detachedParentContent(doc, parents, pageParents, pageIndices, sections, frames, images, shapes, parentOverrides, newFrameId, runningHeaderForPage)
    if (newFrames.length) onFramesChange([...frames, ...newFrames])
    if (newImages.length) onImagesChange([...images, ...newImages])
    if (newShapes.length) onShapesChange([...shapes, ...newShapes])
    applyParentToPages(null, pageIndices)
  }
  /** the Pages panel's own entry points: act on whichever pages are currently selected there */
  const applyParentToSelectedPages = (parentId: string | null) => applyParentToPages(parentId, selectedPages)
  const applyParentToPage = (parentId: string | null, pageIndex: number) => applyParentToPages(parentId, [pageIndex])
  const detachSelectedPagesFromParent = () => detachPagesFromParent(selectedPages)

  // ── linked pictures (Links panel) ───────────────────────────────────────────────
  /** Changes the given linked pictures one by one (those that fail keep their old state); one undo step. Resolves to what went wrong. */
  const changeLinkedAssets = async (assetIds: string[], change: (asset: Asset) => Promise<Asset>): Promise<string | null> => {
    const changed: Assets = {}
    const problems: string[] = []
    for (const id of assetIds) {
      const asset = assetsRef.current[id]
      if (!asset?.link) continue
      try {
        changed[id] = await change(asset)
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (Object.keys(changed).length > 0) pageOps.commit({ assets: { ...assetsRef.current, ...changed } })
    return problems.length > 0 ? problems.join('\n') : null
  }
  const updateLinks = (assetIds: string[]) => changeLinkedAssets(assetIds, updateLinkedAsset)
  const embedLinks = (assetIds: string[]) => changeLinkedAssets(assetIds, embedLinkedAsset)
  const relinkLink = async (assetId: string) => {
    const path = await pickOneImagePath()
    return path ? changeLinkedAssets([assetId], () => relinkAsset(path)) : null
  }
  /** selects a picture that uses the link and brings its page into view */
  const showLinkedPicture = (assetId: string) => {
    const use = linkUses[assetId]?.find((u) => u.page !== null)
    if (!use) return
    const target = images.find((im) => im.id === use.id) ?? shapes.find((sh) => sh.id === use.id)
    if (!target) return
    setSelectedId(target.id)
    goTo(spreadOfPage(ownerPage(rects, target.x + target.w / 2, target.y + target.h / 2)))
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
  const openObjectMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.rich-editor')) return
    const ids = selectedObjectIds()
    const hasGroup = ids.some((id) => !!objectGroupId(id))
    const targetShapeId = ids.length === 1 && shapes.some((shape) => shape.id === ids[0]) ? ids[0] : undefined
    const clickedElement = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-object-kind="shape"]') : null
    const sourceShapeId = clickedElement?.dataset.objectId
    const canCopySize = !!targetShapeId && !!sourceShapeId && sourceShapeId !== targetShapeId && shapes.some((shape) => shape.id === sourceShapeId)
    const clickedFrame = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-object-kind="frame"]') : null
    const textFrameId = clickedFrame?.dataset.objectId
    if (ids.length < 2 && !hasGroup && !canCopySize && !canExportPng && !textFrameId) return
    event.preventDefault()
    event.stopPropagation()
    setObjectMenu({ x: event.clientX, y: event.clientY, ...(canCopySize ? { sourceShapeId, targetShapeId } : {}), ...(textFrameId ? { textFrameId } : {}) })
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
  /** where the selection lies in a frame's own text, a caret included (highlightFor leaves those out) */
  const selectionIn = (fl: FrameFlow): [number, number] | null => {
    if (!textSel || textSel.headId !== fl.headId) return null
    const a = Math.max(textSel.a, fl.start)
    const b = Math.min(textSel.b, fl.end)
    return a <= b ? [a - fl.start, b - fl.start] : null
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
        shape={tool === 'feather' || toolbarTable ? null : selShape}
        image={tool === 'feather' ? null : selImage}
        frame={tool === 'feather' ? null : selFrame}
        textStyle={toolbarTextStyle}
        tableText={toolbarTableText}
        onFontPreview={(family) => setFontPreview(family && selFrame && !footnoteSel ? { frameId: selFrame.id, family } : null)}
        fontSizeControl={selFrame && toolbarTextStyle ? (
          <div className="context-font-size-field" role="group" aria-label="גודל גופן">
            <NumberField
              ariaLabel="גודל גופן"
              value={toolbarTextStyle.fontSize}
              unit="px"
              unitLabel="pt"
              step={1}
              min={1}
              max={999}
              mixed={panelSizeMixed}
              onStep={(delta) => footnoteSel ? stepFootnoteFontSize(delta) : stepFontSize(selFrame.id, delta)}
              onChange={(fontSize) => footnoteSel ? applyFootnoteCharStyle({ fontSize }) : applyCharStyle(selFrame.id, { fontSize })}
            />
          </div>
        ) : null}
        paragraphStyle={toolbarParagraphStyle}
        colorSamples={colorSamples}
        outlineWidth={toolbarTextStyle?.outlineWidth ?? selShape?.strokeWidth ?? drawingStrokeWidth}
        onOutlineWidth={(value) => {
          if (selShape) updateShape(selShape.id, { strokeWidth: value }, `context-stroke:${selShape.id}`)
          else if (footnoteSel) applyFootnoteCharStyle({ outlineWidth: value })
          else if (selFrame) applyCharStyle(selFrame.id, { outlineWidth: value })
          else if (panelHead) applyCharStyle(panelHead.id, { outlineWidth: value })
        }}
        onSwatchFill={(color) => {
          if (selShape) updateShape(selShape.id, { fill: color, fillGradient: undefined }, `context-fill:${selShape.id}`)
          else if (footnoteSel) applyFootnoteCharStyle({ color: color ?? '#ffffff' })
          else if (selFrame) applyCharStyle(selFrame.id, { color: color ?? '#ffffff' })
          else if (panelHead) applyCharStyle(panelHead.id, { color: color ?? '#ffffff' })
          else if (toolbarTable) applyTableFormatting({ color: color ?? '#ffffff' })
        }}
        onSwatchStroke={(color) => {
          if (selShape) updateShape(selShape.id, {
            stroke: color,
            ...(color === null ? { strokeWidth: 0 } : selShape.strokeWidth === 0 ? { strokeWidth: 0.25 } : {}),
          }, `context-stroke-color:${selShape.id}`)
          else {
            const nextWidth = color === null ? 0 : Math.max(0.25, toolbarTextStyle?.outlineWidth ?? 0)
            const patch = { outlineColor: color ?? '#000000', outlineWidth: nextWidth }
            if (footnoteSel) applyFootnoteCharStyle(patch)
            else if (selFrame) applyCharStyle(selFrame.id, patch)
            else if (panelHead) applyCharStyle(panelHead.id, patch)
          }
        }}
        strokeWidth={drawingStrokeWidth}
        onFlip={(axis) => selShape && flipShape(selShape.id, axis)}
        onArrange={(op) => selShape ? arrangeObject(selShape.id, op) : selImage ? arrangeObject(selImage.id, op) : selFrame ? arrangeObject(selFrame.id, op) : undefined}
        onOpacity={(value) => {
          if (selShape) updateShape(selShape.id, { opacity: value }, `context-opacity:${selShape.id}`)
          else if (selImage) updateImage(selImage.id, { opacity: value }, `context-opacity:${selImage.id}`)
          else if (selFrame) updateFrame(selFrame.id, { opacity: value }, `context-opacity:${selFrame.id}`)
        }}
        onImageFit={(fit) => selImage && updateImage(selImage.id, { fit })}
        onImageFlip={(axis) => selImage && updateImage(selImage.id, axis === 'x' ? { flipX: !selImage.flipX } : { flipY: !selImage.flipY })}
        onImageWrap={(wrap) => selImage && updateImage(selImage.id, { wrap })}
        onImageMatchShape={() => { const asset = selImage && assets[selImage.assetId]; if (selImage && asset) updateImage(selImage.id, { h: selImage.w * (asset.height / asset.width) }) }}
        onImageDelete={() => { if (selImage) { onImagesChange(images.filter((image) => image.id !== selImage.id)); setSelectedId(null) } }}
        onCharStyle={(patch) => footnoteSel ? applyFootnoteCharStyle(patch) : selFrame ? applyCharStyle(selFrame.id, patch) : applyTableFormatting(patch)}
        onTextScale={(axis, percent) => selFrame && setFrameTextScale(selFrame.id, axis, percent)}
        onAlign={(align) => footnoteSel ? applyFootnoteParagraphStyle({ align }) : selFrame ? applyAlign(selFrame.id, align) : applyTableFormatting({ align })}
        onLeading={(leading) => footnoteSel ? applyFootnoteParagraphStyle({ leading }) : selFrame ? applyParagraphStyle(selFrame.id, { leading }) : applyTableFormatting({ leading })}
        onParagraphStyle={(patch) => footnoteSel ? applyFootnoteParagraphStyle(patch) : selFrame && applyParagraphStyle(selFrame.id, patch)}
        onParagraphSpacing={(patch) => footnoteSel ? applyFootnoteParagraphStyle(patch) : selFrame ? applyParaSpacing(selFrame.id, patch) : applyTableFormatting(patch)}
        onStrokeWidth={(value) => {
          setDrawingStrokeWidth(value)
          if (selShape) updateShape(selShape.id, { strokeWidth: value }, `context-stroke:${selShape.id}`)
        }}
      >
      {toolbarTable && toolbarTableText && <div className="context-text-controls table-text-format-controls" role="group" aria-label="עיצוב טקסט בתאים">
          <div aria-label="גופן הטבלה" title="גופן"><FontPicker className="table-font-picker" value={toolbarTableText.fontFamily} families={fontCatalog.families} onChange={(fontFamily) => applyTableFormatting({ fontFamily })} /></div>
          <select aria-label="משקל וסגנון הגופן בטבלה" title="משקל וסגנון" value={`${toolbarTableText.weight}|${toolbarTableText.italic ? 1 : 0}`} onChange={(event) => {
            const [weight, italic] = event.target.value.split('|')
            applyTableFormatting({ weight: Number(weight), italic: italic === '1' })
          }}>
            {(() => {
              const faces = fontCatalog.families.find((font) => font.family === toolbarTableText.fontFamily)?.faces ?? []
              const current = `${toolbarTableText.weight}|${toolbarTableText.italic ? 1 : 0}`
              return <>
                {!faces.some((face) => `${face.weight}|${face.italic ? 1 : 0}` === current) && <option value={current}>{weightName(toolbarTableText.weight)}{toolbarTableText.italic ? ' · נטוי' : ''}</option>}
                {faces.map((face) => <option key={`${face.weight}|${face.italic}`} value={`${face.weight}|${face.italic ? 1 : 0}`}>{weightName(face.weight)}{face.italic ? ' · נטוי' : ''} ({face.style})</option>)}
              </>
            })()}
          </select>
          <input aria-label="צבע גופן בטבלה" title="צבע גופן" type="color" value={toolbarTableText.color ?? '#000000'} onChange={(event) => applyTableFormatting({ color: event.target.value })} />
          <button className={'context-command' + (toolbarTableText.weight >= 600 ? ' active' : '')} title="מודגש" onClick={() => applyTableFormatting({ weight: toolbarTableText.weight >= 600 ? 400 : 700 })}>B</button>
          <button className={'context-command' + (toolbarTableText.italic ? ' active' : '')} title="נטוי" onClick={() => applyTableFormatting({ italic: !toolbarTableText.italic })}>I</button>
          <div className="context-font-size-field" role="group" aria-label="גודל גופן">
            <NumberField
              ariaLabel="גודל גופן"
              value={toolbarTableText.fontSize}
              unit="px"
              unitLabel="pt"
              step={1}
              min={1}
              max={999}
              onStep={(delta) => applyTableFormatting({ fontSize: Math.min(999, Math.max(1, toolbarTableText.fontSize + delta)) })}
              onChange={(fontSize) => applyTableFormatting({ fontSize })}
            />
          </div>
          <select aria-label="יישור טקסט בטבלה" title="יישור" value={toolbarTableText.align} onChange={(event) => applyTableFormatting({ align: event.target.value as TextAlign })}>
            <option value="right">ימין</option><option value="center">מרכז</option><option value="left">שמאל</option><option value="justify">מיושר</option>
          </select>
          <label className="context-field" title="מרווח אותיות"><span>מרווח אותיות</span><input type="number" step="1" value={toolbarTableText.tracking ?? 0} onChange={(event) => applyTableFormatting({ tracking: Number(event.target.value) })} /></label>
          <label className="context-field" title="מרווח בין שורות"><span>שורה</span><input type="number" min="0" value={toolbarTableText.leading ?? Math.round(toolbarTableText.fontSize * 1.25)} onChange={(event) => applyTableFormatting({ leading: Number(event.target.value) })} />pt</label>
          <label className="context-field" title="רווח לפני"><span>לפני</span><input type="number" min="0" value={toolbarTableText.spaceBefore ?? 0} onChange={(event) => applyTableFormatting({ spaceBefore: Number(event.target.value) })} /></label>
          <label className="context-field" title="רווח אחרי"><span>אחרי</span><input type="number" min="0" value={toolbarTableText.spaceAfter ?? 0} onChange={(event) => applyTableFormatting({ spaceAfter: Number(event.target.value) })} /></label>
        </div>}
        {tool === 'feather' && (
          <div className="context-feather-controls" role="group" aria-label="החלקת מעבר צבע">
            <label className="context-feather-toggle"><input type="checkbox" checked={!!selectedFeather} disabled={!selectedFeatherTarget} onChange={(event) => setSelectedFeatherEnabled(event.target.checked)} />החלקה</label>
            {!selectedFeatherTarget ? <span className="context-tool-hint">בחר אובייקט</span> : <>
              {selectedFeather?.type !== 'basic' && selectedFeather?.type !== 'directional' ? <>
                <label className="context-field"><span>התחלה {Math.round((selectedFeather?.points[0]?.opacity ?? 1) * 100)}%</span><input type="range" aria-label="אטימות התחלה" min={0} max={100} value={Math.round((selectedFeather?.points[0]?.opacity ?? 1) * 100)} disabled={!selectedFeather} onChange={(event) => setSelectedFeatherOpacity(0, Number(event.target.value) / 100)} /></label>
                <label className="context-field"><span>סוף {Math.round((selectedFeather?.points.at(-1)?.opacity ?? 0) * 100)}%</span><input type="range" aria-label="אטימות סוף" min={0} max={100} value={Math.round((selectedFeather?.points.at(-1)?.opacity ?? 0) * 100)} disabled={!selectedFeather} onChange={(event) => setSelectedFeatherOpacity((selectedFeather?.points.length ?? 2) - 1, Number(event.target.value) / 100)} /></label>
                <div className="feather-toolbar-ramp" style={{ '--feather-start-opacity': selectedFeather?.points[0]?.opacity ?? 1, '--feather-end-opacity': selectedFeather?.points.at(-1)?.opacity ?? 0 } as CSSProperties} aria-hidden="true" />
              </> : <span className="context-tool-hint">לעריכת סוג זה, השתמש במאפייני האובייקט</span>}
              <button className="context-command danger" disabled={!selectedFeather} onClick={() => selectedFeatherTarget && commitFeather(selectedFeatherTarget, null)}>הסר החלקה</button>
            </>}
          </div>
        )}
        {multiSel.length > 1 && (() => {
          const selectedIds = new Set(selectedObjectIds())
          const selectedShapes = shapes.filter((shape) => selectedIds.has(shape.id))
          const selectedImages = images.filter((image) => selectedIds.has(image.id))
          const selectedFrames = frames.filter((frame) => selectedIds.has(frame.id))
          const selectedShapeCount = selectedShapes.length
          const opacityValues = [...selectedShapes, ...selectedImages, ...selectedFrames].map((object) => object.opacity ?? 1)
          const averageOpacity = opacityValues.length > 0 ? opacityValues.reduce((sum, value) => sum + value, 0) / opacityValues.length : 1
          const opacityMixed = opacityValues.some((value) => Math.abs(value - opacityValues[0]) > 0.001)
          const hasSelectedGroup = selectedObjectIds().some((id) => !!objectGroupId(id))
          return (
            <div className="context-multi-selection" role="group" aria-label="פעולות לבחירה מרובה">
              <span className="context-divider" />
              <span className="context-multi-count">{multiSel.length} נבחרו</span>
              <MultiSelectionToolbar
                count={selectedIds.size}
                shapes={selectedShapes}
                images={selectedImages}
                colorSamples={colorSamples}
                opacity={Math.round(averageOpacity * 100)}
                opacityMixed={opacityMixed}
                onFill={setSelectedShapeFill}
                onStroke={setSelectedShapeStroke}
                onStrokeWidthStep={stepSelectedShapeStrokeWidth}
                onFlipShapes={flipSelectedShapes}
                onFit={setSelectedImageFit}
                onWrap={setSelectedImageWrap}
                onFlipImages={flipSelectedImages}
                onMatchImageFrames={matchSelectedImageFrames}
                onArrange={arrangeSelectedObjects}
                onAlign={alignObjects}
                onOpacity={setSelectedObjectsOpacity}
              />
              {selectedShapeCount >= 2 && (
                <div className="context-multi-operations" role="group" aria-label="בניית צורות">
                  {(['unite', 'subtract', 'intersect', 'exclude'] as BoolOp[]).map((op) => (
                    <button key={op} className="context-command" title={BOOL_OP_NAMES[op]} onClick={() => combineSelectedShapes(op)}>
                      {BOOL_OP_NAMES[op]}
                    </button>
                  ))}
                </div>
              )}
              <button className="context-command" onClick={groupSelectedObjects}>צור גרופ</button>
              {hasSelectedGroup && <button className="context-command" onClick={ungroupSelectedObjects}>שחרר גרופ</button>}
              {imageShapeMerge && <button className="context-command" onClick={insertImageIntoShape}>הכנס תמונה לצורה</button>}
              {canMergeImages && <button className="context-command" onClick={() => void mergeSelectedImages()}>מזג תמונות</button>}
              {canCreateImage && <button className="context-command" onClick={() => void createImageFromSelection()}>צור תמונה אחת מהנבחרים</button>}
              {canExportPng && <button className="context-command" onClick={() => void exportSelectedPng()}>ייצא בחירה ל־PNG</button>}
              <button className="context-command danger" onClick={() => deleteSelection(multiSel, [])}>מחק</button>
            </div>
          )
        })()}
      </ContextToolbar>

      {editingParentId && (
        <div className="parent-edit-bar">
          <span>עריכת עמוד אב: {parents.find((p) => p.id === editingParentId)?.name ?? ''}</span>
          <button className="btn small" onClick={onExitParentEdit}>
            חזרה למסמך
          </button>
        </div>
      )}

      <div className="ws-main">
        <Toolbox
          tool={space ? 'hand' : tool}
          onSelect={activateTool}
          colorSamplerActive={colorSamplerActive}
          onToggleColorSampler={toggleColorSamplerTool}
          onSettings={(id) => setToolDialog(id === 'pen' || id === 'pencil' ? id : id === 'rect' || id === 'polygon' ? id : (FRAME_TOOL_KIND[id] ?? null))}
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
            onContextMenuCapture={openObjectMenu}
            onScroll={(e) => setScroll({ x: getScrollX(e.currentTarget), y: e.currentTarget.scrollTop })}
            onPointerDownCapture={onPointerDownCapture}
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
              {marqueeCut && <div
                className={'marquee-selection-preview' + (marqueeCut.kind === 'ellipse' ? ' ellipse' : '')}
                style={{
                  left: tx + Math.min(marqueeCut.x0, marqueeCut.x1) * zoom,
                  top: ty + Math.min(marqueeCut.y0, marqueeCut.y1) * zoom,
                  width: Math.abs(marqueeCut.x1 - marqueeCut.x0) * zoom,
                  height: Math.abs(marqueeCut.y1 - marqueeCut.y0) * zoom,
                }}
                aria-hidden="true"
              />}
              {featherGuide && <svg className="feather-gesture-layer" width={sheetW} height={sheetH} aria-hidden="true">
                <line x1={tx + featherGuide.start.x * zoom} y1={ty + featherGuide.start.y * zoom} x2={tx + featherGuide.end.x * zoom} y2={ty + featherGuide.end.y * zoom} />
                <circle cx={tx + featherGuide.start.x * zoom} cy={ty + featherGuide.start.y * zoom} r={4} />
                <circle cx={tx + featherGuide.end.x * zoom} cy={ty + featherGuide.end.y * zoom} r={4} />
              </svg>}
              <svg width={sheetW} height={sheetH}>
                {previewMode && (
                  <defs>
                    <clipPath id={`preview-page-clip-${previewClipId}`} clipPathUnits="userSpaceOnUse">
                      {visible.flatMap((spread) => spread.pages.map((page) => {
                        const rect = rects[page.index]
                        return rect ? <rect key={page.index} x={tx + rect.x * zoom} y={ty + rect.y * zoom} width={rect.w * zoom} height={rect.h * zoom} /> : null
                      }))}
                    </clipPath>
                  </defs>
                )}
                {visible.map((s) => (
                  <SpreadView key={s.y} doc={viewDoc} spread={s} zoom={zoom} tx={tx} ty={ty} showGuides={showGuides && !previewMode} />
                ))}
              </svg>
              <div
                className="preview-artwork"
                style={{
                  width: sheetW,
                  height: sheetH,
                  clipPath: previewMode ? `url(#preview-page-clip-${previewClipId})` : undefined,
                }}
              >
              {parentShadows.images.map((im) => (
                <div className="parent-shadow" key={im.id}>
                  <ImageFrameView image={im} asset={assets[im.assetId]} zoom={zoom} tx={tx} ty={ty} z={parentShadowZ} selected={false} locked showEdge={false} onPointerDown={(event) => overrideParentItem('image', im, event)} onHandleDown={noop} onRotateDown={noop} />
                </div>
              ))}
              {parentShadows.shapes.map((sh) => (
                <div className="parent-shadow" key={sh.id}>
                  <ShapeFrameView shape={sh} zoom={zoom} tx={tx} ty={ty} z={parentShadowZ} selected={false} locked showEdge={false} onPointerDown={(event) => overrideParentItem('shape', sh, event)} tableUi={sh.kind === 'table' ? tableUiFor(sh, false) : undefined} />
                </div>
              ))}
              {parentShadows.frames.map((f) => {
                const style = styleOf(f)
                const runs = normalizeRuns(f.text, f.runs, f)
                return (
                  <div className="parent-shadow" key={f.id}>
                  <TextFrameView
                    frame={f}
                    style={style}
                    slice={f.text}
                    runs={runs}
                    highlight={null}
                    floats={[]}
                    z={parentShadowZ}
                    overflow={false}
                    continuesParagraphAtEnd={false}
                    hasPrev={false}
                    zoom={zoom}
                    tx={tx}
                    ty={ty}
                    selected={false}
                    locked
                    editing={false}
                    armed={false}
                    showEdge={false}
                    showHidden={false}
                    paraGaps={paraGapsOf(style, f, f.text)}
                    startParaIndex={0}
                    atParaStart={true}
                    paragraphPatches={f.paragraphStylePatches}
                    spaceBeforeFirst={frameSpaceBefore(style, f)}
                    spaceAfterLast={frameSpaceAfter(style, f, f.text)}
                    footnoteHeight={0}
                    request={null}
                    onPointerDown={(event) => overrideParentItem('frame', f, event)}
                    onDoubleClick={noop}
                    onHandleDown={noop}
                    onRotateDown={noop}
                    onOutPortDown={noop}
                    onInPortDown={noop}
                    onEdit={noop}
                    onSelect={noop}
                    onCopyText={() => null}
                    onBackspaceAtStart={noop}
                    onStopEditing={noop}
                  />
                  </div>
                )
              })}
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
                  featherOverride={featherDrag?.target.kind === 'image' && featherDrag.target.id === im.id ? featherDrag.feather : undefined}
                  asset={assets[im.assetId]}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(im.id) ?? 0}
                  selected={im.id === selectedId}
                  locked={!!itemLocks[im.id]}
                  marked={!previewMode && multiSel.includes(im.id)}
                  showEdge={!previewMode && !marqueeTool && multiSel.length < 2}
                  onPointerDown={onImagePointerDown(im.id)}
                  onDoubleClick={() => { if (!relockParentOverride(im.id)) enterGroupIsolation(im.id) }}
                  onHandleDown={onHandleDown(im.id)}
                  onRotateDown={onRotateDown(im.id)}
                />
              ))}
              {visibleShapes.map((sh) => (
                <ShapeFrameView
                  key={sh.id}
                  shape={sh}
                  featherOverride={featherDrag?.target.kind === 'shape' && featherDrag.target.id === sh.id ? featherDrag.feather : undefined}
                  zoom={zoom}
                  tx={tx}
                  ty={ty}
                  z={rank.get(sh.id) ?? 0}
                  selected={sh.id === selectedId && tool !== 'pencil'}
                  locked={!!itemLocks[sh.id]}
                  marked={!previewMode && multiSel.includes(sh.id)}
                  showEdge={!previewMode && !marqueeTool && multiSel.length < 2}
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
                    if (relockParentOverride(sh.id)) return
                    if (enterGroupIsolation(sh.id)) {
                      if (tool === 'select') setTool('direct')
                      setSelectedId(sh.id)
                      if (sh.pathText && tool === 'select') setPathEdit(sh.id)
                      return
                    }
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
                  tableUi={sh.kind === 'table' ? tableUiFor(sh, tool === 'select') : undefined}
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
                    fill: defaultShapePaint.fill ?? null,
                    fillGradient: defaultShapePaint.fillGradient,
                    stroke: defaultShapePaint.stroke ?? DEFAULT_SHAPE_STROKE,
                    strokeWidth: defaultShapePaint.strokeWidth ?? drawingStrokeWidth,
                    strokeDash: defaultShapePaint.strokeDash,
                    strokeCap: defaultShapePaint.strokeCap,
                    opacity: defaultShapePaint.opacity,
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
              {(tool === 'eraser' || tool === 'heal' || rasterBrushColor) && eraserPoint && (
                <div
                  className={tool === 'heal' ? 'heal-brush' : rasterBrushColor ? 'paint-brush' : 'eraser-brush'}
                  aria-hidden="true"
                  style={{ left: tx + eraserPoint.x * zoom - eraserRadius, top: ty + eraserPoint.y * zoom - eraserRadius, width: eraserRadius * 2, height: eraserRadius * 2, ...(rasterBrushColor ? { backgroundColor: `${rasterBrushColor}22` } : {}) }}
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
                const selectedFootnote = footnoteSel?.headId === fl.headId
                  ? storyHead.footnotes?.find((note) => note.id === footnoteSel.noteId)
                  : undefined
                const footnoteSelection = footnoteSel && selectedFootnote
                  ? { noteId: selectedFootnote.id, all: footnoteSel.allNotes || footnoteSel.a === 0 && footnoteSel.b === selectedFootnote.content.length, allNotes: footnoteSel.allNotes }
                  : null
                const sourceFootnotes = [...(storyHead.footnotes ?? [])].sort((a, b) => a.anchor - b.anchor)
                const tocMarkers = sliceTocDisplayMarkers(tocMarkersByHead.get(fl.headId), fl.start, fl.end)
                const markersBeforeFrame = [...fl.story.slice(0, fl.start)].filter((char) => char === FOOTNOTE_MARKER).length
                const markerOffsets = [...fl.slice].flatMap((char, index) => char === FOOTNOTE_MARKER ? [index] : [])
                const footnoteMarkers = {
                  ...Object.fromEntries(markerOffsets.flatMap((offset, index) => {
                  const anchor = fl.start + offset
                  const noteIndex = sourceFootnotes.findIndex((note) => note.anchor === anchor)
                  const note = noteIndex >= 0 ? sourceFootnotes[noteIndex] : sourceFootnotes[markersBeforeFrame + index]
                  if (!note) return []
                  const indexInStory = sourceFootnotes.indexOf(note)
                  const number = footnoteNumbers.get(note.id) ?? footnoteConfig.startAt + indexInStory
                  return [[offset, formatFootnoteNumber(number, footnoteConfig.numberStyle, 'plain')]]
                  })),
                  ...tocMarkers?.footnotes,
                }
                const lastParagraphStart = fl.slice.lastIndexOf('\n') + 1
                const endsWithFootnoteReference = markerOffsets.some((offset) => offset >= lastParagraphStart)
                return (
                  <TextFrameView
                    key={f.id}
                    frame={f}
                    previewFontFamily={fontPreview?.frameId === f.id ? fontPreview.family : undefined}
                    featherOverride={featherDrag?.target.kind === 'frame' && featherDrag.target.id === f.id ? featherDrag.feather : undefined}
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
                    firstLineLift={fl.firstLineLift}
                    spaceAfterLast={fl.spaceAfterLast}
                    footnoteMarkers={footnoteMarkers}
                    tocPageMarkers={tocMarkers?.pageNumbers}
                    tocLeaderMarkers={tocMarkers?.leaders}
                    footnoteReferenceScale={footnoteConfig.referenceScale}
                    footnoteAlignment={footnoteConfig.alignment}
                    footnotes={fl.footnotes}
                    footnoteHeight={fl.footnoteHeight}
                    footnoteAreaX={fl.footnoteAreaX}
                    footnoteAreaWidth={fl.footnoteAreaWidth}
                    footnoteDividerGap={footnoteConfig.dividerGap}
                    footnoteDividerWidth={footnoteConfig.dividerWidth}
                    footnoteDividerThickness={footnoteConfig.dividerThickness}
                    footnoteDividerAlignment={footnoteConfig.dividerAlignment}
                    footnoteDividerHeading={footnoteDividerHeading}
                    footnoteNumberGap={footnoteConfig.numberTextGap}
                    footnoteWidthScale={footnoteConfig.widthScale}
                    footnoteMode={footnoteConfig.mode}
                    footnoteColumns={footnoteConfig.columns}
                    onFootnoteWidthPreview={(widthScale) => setFootnotePreviewConfig(widthScale === null ? null : { ...footnoteConfig, widthScale })}
                    onFootnoteWidthCommit={commitFootnoteWidth}
                    onFootnoteEdit={(noteId, localOffset, fragmentOffset) => editFootnote(fl.headId, noteId, f.id, localOffset, fragmentOffset)}
                    onFootnoteSelectionStart={(noteId) => setFootnoteSel((previous) => previous?.headId === fl.headId && previous.noteId === noteId && previous.allNotes ? { headId: previous.headId, noteId: previous.noteId, a: previous.a, b: previous.b } : previous)}
                    editingFootnoteId={editingFootnoteId}
                    editingFootnoteFrameId={editingFootnoteFrameId}
                    editingFootnoteOffset={editingFootnoteOffset}
                    footnoteRequest={footnoteRequest?.frameId === f.id ? footnoteRequest : null}
                    footnoteSelection={footnoteSelection}
                    onFootnoteCopyText={(noteId) => {
                      const sourceNote = storyHead.footnotes?.find((note) => note.id === noteId)
                      return sourceNote && footnoteSel?.headId === fl.headId && footnoteSel.noteId === noteId && footnoteSel.a === 0 && footnoteSel.b === sourceNote.content.length ? sourceNote.content : null
                    }}
                    onFootnoteTextEdit={(noteId, from, to, insert) => {
                      const sourceNote = frames.find((frame) => frame.id === fl.headId)?.footnotes?.find((note) => note.id === noteId)
                      const selectedAll = sourceNote && footnoteSel?.headId === fl.headId && footnoteSel.noteId === noteId && footnoteSel.a === 0 && footnoteSel.b === sourceNote.content.length
                      applyFootnoteEdit(fl.headId, noteId, selectedAll ? 0 : from, selectedAll ? sourceNote.content.length : to, insert)
                    }}
                    onFootnoteSelect={(noteId, from, to) => setFootnoteSel((previous) => {
                      const wholeVisibleFragment = fl.footnotes?.some((placement) => placement.id === noteId && from === (placement.offset ?? 0) && to === (placement.offset ?? 0) + placement.content.length)
                      if (previous?.allNotes && previous.headId === fl.headId && previous.noteId === noteId && wholeVisibleFragment) return previous
                      return previous?.headId === fl.headId && previous.noteId === noteId && previous.a === from && previous.b === to ? previous : { headId: fl.headId, noteId, a: from, b: to }
                    })}
                    onFootnoteSelectAll={(noteId) => selectAllFootnote(fl.headId, noteId)}
                    onFootnoteStop={() => { setEditingFootnoteId(null); setEditingFootnoteFrameId(null); setEditingFootnoteOffset(null); setFootnoteRequest(null) }}
                    onSelectAllText={() => selectAllStory(f.id)}
                    onSelectToStartText={(frameId, offset) => selectStoryToStart(frameId, offset)}
                    z={rank.get(f.id) ?? 0}
                    overflow={fl.overflow}
                    continuesParagraphAtEnd={fl.end < fl.story.length && fl.story[fl.end - 1] !== '\n' && !endsWithFootnoteReference}
                    storyContinues={fl.end < fl.story.length}
                    hasPrev={fl.prevId !== null}
                    zoom={zoom}
                    tx={tx}
                    ty={ty}
                    selected={f.id === selectedId}
                    locked={!!itemLocks[f.id]}
                    marked={!previewMode && multiSel.includes(f.id)}
                    editing={f.id === editingId}
                    armed={f.id === linkFrom}
                    showEdge={!previewMode && !marqueeTool && multiSel.length < 2}
                    showHidden={showHiddenChars && !previewMode}
                    request={request && request.frameId === f.id ? request : null}
                    selectionHint={f.id === editingId ? selectionIn(fl) : null}
                    onPointerDown={onFramePointerDown(f.id)}
                    onDoubleClick={() => {
                      if (relockParentOverride(f.id)) return
                      if (!panMode) {
                        enterGroupIsolation(f.id)
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
                    onCopyFormattedText={(from, to) => copyFormattedText(f.id, from, to)}
                    onPasteFormattedText={(from, to, clipboard) => handlePasteFormattedText(f.id, from, to, clipboard)}
                    onBackspaceAtStart={() => backspaceAtStart(f.id)}
                    onBackspaceAtParagraphStart={(offset) => backspaceAtParagraphStart(f.id, offset)}
                    onLineBoundary={(dir, x, toStart) => jumpToLine(f.id, dir, x, toStart)}
                    onDragOutside={(x, y, anchor) => extendSelectionAcrossFrames(f.id, x, y, anchor)}
                    onStopEditing={() => setEditingId((c) => (c === f.id ? null : c))}
                  />
                )
              })}
              {endnotePages.frames.map((frame) => {
                const frameFlow = endnotePages.flows.get(frame.id)
                return frameFlow ? <EndnotesPageView key={frame.id} frame={frame} flow={frameFlow} config={footnoteConfig} paragraphStyles={paragraphStyles} zoom={zoom} tx={tx} ty={ty} z={rank.size + 1} /> : null
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
                      const centerAlign: CSSProperties | null = guideDrag.centerSnap
                        ? guideDrag.axis === 'h'
                          ? { left: tx + r.x * zoom, top: ty + (r.y + r.h / 2) * zoom - 1, width: r.w * zoom, height: 2 }
                          : { left: tx + (r.x + r.w / 2) * zoom - 1, top: ty + r.y * zoom, width: 2, height: r.h * zoom }
                        : null
                      return (
                        <>
                          {align && <div className={`guide-align ${guideDrag.axis}`} style={align} />}
                          {centerAlign && <div className={`guide-align center ${guideDrag.axis}`} style={centerAlign} />}
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
              {(spacingShown.length > 0 || gapPreview.length > 0) && (
                <svg className="spacing-layer" aria-hidden="true">
                  {gapPreview.map((gap, index) => {
                    const x = tx + gap.x * zoom
                    const y = ty + gap.y * zoom
                    const width = gap.w * zoom
                    const height = gap.h * zoom
                    const label = formatLength(gap.axis === 'x' ? gap.w : gap.h, doc.unit)
                    const labelWidth = label.length * 6.4 + 12
                    return (
                      <g key={`gap-preview-${index}`} className="gap-preview-label">
                        <rect className="gap-preview" x={x} y={y} width={Math.max(1, width)} height={Math.max(1, height)} />
                        <rect x={x + width / 2 - labelWidth / 2} y={y + height / 2 - 9} width={labelWidth} height={18} rx={4} />
                        <text x={x + width / 2} y={y + height / 2 + 3.5} textAnchor="middle">{label}</text>
                      </g>
                    )
                  })}
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
        </div>
        {colorSamplerActive && colorSamplerPreview && createPortal(<ColorSamplerLens ref={colorSamplerLensRef} preview={colorSamplerPreview} />, document.body)}
        <DockingPanels
          enabledPanelIds={enabledDockPanelIds}
          tabOrder={dockTabOrder}
          onTabOrderChange={onDockTabOrderChange}
          floatingPanelId={floatingDockPanelId}
          onFloatingPanelChange={onFloatingDockPanelChange}
          floatingPosition={floatingDockPosition}
          onFloatingPositionChange={onFloatingDockPositionChange}
          openId={dockOpenId}
          onOpenChange={onDockOpenChange}
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
                      canMergeImages={canMergeImages}
                      onMergeImages={() => void mergeSelectedImages()}
                      canCreateImage={canCreateImage}
                      onCreateImage={() => void createImageFromSelection()}
                      canExportPng={canExportPng}
                      onExportPng={() => void exportSelectedPng()}
                      onDelete={() => deleteSelection(multiSel, [])}
                    />
                  )}
                  {selShape && (
                    <ShapeProperties
                      shape={selShape}
                      unit={doc.unit}
                      onGeometry={(patch) => updateShape(selShape.id, patch, `geo:${selShape.id}`)}
                      onChange={(patch) => updateShape(
                        selShape.id,
                        patch,
                        patch.radii || patch.strokeWidth !== undefined
                          ? `shape:${selShape.id}`
                          : Object.prototype.hasOwnProperty.call(patch, 'feather') ? `feather:${selShape.id}` : undefined,
                      )}
                      onUseFeatherTool={() => setTool('feather')}
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
                      onShadowChange={(patch) => updateImage(selImage.id, patch, `shadow:${selImage.id}`)}
                      onFeatherChange={(feather) => updateImage(selImage.id, { feather }, `feather:${selImage.id}`)}
                      onUseFeatherTool={() => setTool('feather')}
                      onArrange={(op) => arrangeObject(selImage.id, op)}
                      onMatchShape={() => {
                        const a = assets[selImage.assetId]
                        if (a) updateImage(selImage.id, { h: selImage.w * (a.height / a.width) })
                      }}
                      onRemoveBackground={removeBackgroundFromSelection}
                      removingBackground={removingBackgroundId !== null}
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
                      colorSamples={colorSamples}
                      unit={doc.unit}
                      thread={threadInfo}
                      onGeometry={(patch) => selFrame && updateFrame(selFrame.id, patch, `geo:${selFrame.id}`)}
                      onFeatherChange={(feather) => selFrame && updateFrame(selFrame.id, { feather }, `feather:${selFrame.id}`)}
                      onUseFeatherTool={() => setTool('feather')}
                      onTextScale={(axis, percent) => selFrame && setFrameTextScale(selFrame.id, axis, percent)}
                      onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)}
                      sizeMixed={panelSizeMixed}
                      onSizeStep={(delta) => selFrame && stepFontSize(selFrame.id, delta)}
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
              content: <ParagraphPanel frame={selFrame} style={paragraphStyle} textStyle={panelStyle} colorSamples={colorSamples} onCharStyle={(patch) => selFrame && applyCharStyle(selFrame.id, patch)} sizeMixed={panelSizeMixed} onSizeStep={(delta) => selFrame && stepFontSize(selFrame.id, delta)} scope={panelSel ? 'selection' : 'all'} unit={doc.unit} onChange={(patch) => selFrame && applyParagraphStyle(selFrame.id, patch)} onSpacingChange={(patch) => selFrame && applyParaSpacing(selFrame.id, patch)} keepFirstLines={panelHead?.paraKeepFirstLines?.[scopeParagraph ?? 0] ?? 0} keepLastLines={panelHead?.paraKeepLastLines?.[scopeParagraph ?? 0] ?? 0} keepFirstMixed={keepFirstLineValues.size > 1} keepLastMixed={keepLastLineValues.size > 1} onKeepLinesChange={(patch) => selFrame && applyParagraphKeepLines(selFrame.id, patch)} keepWithNext={keepWithNextValues.has(1)} keepWithNextMixed={keepWithNextValues.size > 1} onKeepWithNextChange={(on) => selFrame && applyParagraphKeepWithNext(selFrame.id, on)} />,
            },
            {
              id: 'paragraph-styles',
              label: 'סגנונות פסקה',
              content: <ParagraphStylesPanel styles={paragraphStyles} unit={doc.unit} highlightId={highlightedStyleId} modified={styleHasOverrides} onApply={applyParagraphStyleToFrame} onChange={changeParagraphStyle} onCreate={createParagraphStyle} onDelete={(id) => deleteParagraphStyle(id)} onDeleteMany={deleteParagraphStyles} onConfirmOverrides={commitParagraphOverrides} onDiscardOverrides={discardParagraphOverrides} characterStyles={characterStyles} onApplyNested={applyNestedStylesCmd} />,
            },
            {
              id: 'character-styles',
              label: 'סגנונות תו',
              content: <CharacterStylesPanel styles={characterStyles} activeId={activeCharacterStyleId} modified={activeCharacterStyleModified} canApply={!!panelHead || !!footnoteSel} onApply={applyCharacterStyleCmd} onSelectionLook={characterStyleSelectionLook} onCreate={createCharacterStyle} onChange={changeCharacterStyle} onDelete={deleteCharacterStyle} onRedefine={redefineCharacterStyle} onFind={findCharacterStyle} />,
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
              content: <PagesPanel doc={doc} frames={shownFrames} images={shownImages} shapes={shownShapes} spreads={documentSpreads} currentSpread={Math.min(cur, documentSpreads.length - 1)} selectedPages={selectedPages} onSelect={selectPage} onInsert={insertPages} onInsertWithMaster={insertPages} onDelete={deleteSelectedPage} onMove={movePage} onView={(perRow) => { pageOps.setup({ ...doc, perRow, rowsCustom: false, pageJoins: [] }); window.setTimeout(() => fitSpread(), 80) }} parents={parents} pageParents={pageParents} activeParentId={effectiveActiveParent} onSelectParent={onSelectParent} onCreateParent={createParent} onDeleteParent={deleteParent} onEditParent={onEditParent} onApplyParent={applyParentToSelectedPages} onApplyParentToPage={applyParentToPage} onDetachParent={detachSelectedPagesFromParent} sections={sections} onSectionsChange={onSectionsChange} canEditPages={!editingParentId} />,
            },
            {
              id: 'links',
              label: 'קישורים',
              content: <LinksPanel assets={assets} uses={linkUses} available={isTauri} onShow={showLinkedPicture} onUpdate={updateLinks} onRelink={relinkLink} onEmbed={embedLinks} />,
            },
            {
              id: 'color',
              label: 'צבע',
              content: <ColorToolsPanel tool={colorTool ?? 'color'} shape={selShape} selectedShapes={selectedPaintShapes} textStyle={toolbarTextStyle} textId={footnoteSel ? `${footnoteSel.headId}:${footnoteSel.noteId}` : panelHead?.id} onTextColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ color }); else if (panelHead) applyCharStyle(panelHead.id, { color }) }} onTextOutlineColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ outlineColor: color }); else if (panelHead) applyCharStyle(panelHead.id, { outlineColor: color }) }} textColorTarget={textColorTarget} onTextColorTarget={setTextColorTarget} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => applySelectedShapePaint(patch, `color-tool:${colorTool ?? 'color'}`)} samples={colorSamples} onSelectBrushColor={setRasterBrushColor} brushColor={rasterBrushColor} brushRadius={eraserRadius} onBrushRadiusChange={setEraserRadius} brushStrength={rasterBrushStrength} onBrushStrengthChange={setRasterBrushStrength} onExitBrush={() => setRasterBrushColor(null)} onStartSampler={startColorSampler} onDeleteSample={deleteColorSample} />,
            },
            {
              id: 'gradient',
              label: 'מעבר צבע',
              content: <ColorToolsPanel tool="gradient" shape={selShape} selectedShapes={selectedPaintShapes} textStyle={toolbarTextStyle} textId={footnoteSel ? `${footnoteSel.headId}:${footnoteSel.noteId}` : panelHead?.id} onTextColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ color }); else if (panelHead) applyCharStyle(panelHead.id, { color }) }} onTextOutlineColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ outlineColor: color }); else if (panelHead) applyCharStyle(panelHead.id, { outlineColor: color }) }} textColorTarget={textColorTarget} onTextColorTarget={setTextColorTarget} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => applySelectedShapePaint(patch, 'color-tool:gradient')} samples={colorSamples} onSelectBrushColor={setRasterBrushColor} brushColor={rasterBrushColor} brushRadius={eraserRadius} onBrushRadiusChange={setEraserRadius} brushStrength={rasterBrushStrength} onBrushStrengthChange={setRasterBrushStrength} onExitBrush={() => setRasterBrushColor(null)} onStartSampler={startColorSampler} onDeleteSample={deleteColorSample} />,
            },
            {
              id: 'swatches',
              label: 'דוגמיות',
              content: <ColorToolsPanel tool="swatches" shape={selShape} selectedShapes={selectedPaintShapes} textStyle={toolbarTextStyle} textId={footnoteSel ? `${footnoteSel.headId}:${footnoteSel.noteId}` : panelHead?.id} onTextColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ color }); else if (panelHead) applyCharStyle(panelHead.id, { color }) }} onTextOutlineColor={(color) => { if (footnoteSel) applyFootnoteCharStyle({ outlineColor: color }); else if (panelHead) applyCharStyle(panelHead.id, { outlineColor: color }) }} textColorTarget={textColorTarget} onTextColorTarget={setTextColorTarget} target={colorTarget} onTarget={setColorTarget} onShape={(patch) => applySelectedShapePaint(patch, 'color-tool:swatches')} samples={colorSamples} onSelectBrushColor={setRasterBrushColor} brushColor={rasterBrushColor} brushRadius={eraserRadius} onBrushRadiusChange={setEraserRadius} brushStrength={rasterBrushStrength} onBrushStrengthChange={setRasterBrushStrength} onExitBrush={() => setRasterBrushColor(null)} onStartSampler={startColorSampler} onDeleteSample={deleteColorSample} />,
            },
            {
              id: 'layers',
              label: 'שכבות',
              content: <LayersPanel frames={frames} images={images} shapes={shapes} layerOrder={layerOrder} layers={layers} onLayersChange={changeLayerSetup} onItemOrderChange={reorderLayerItems} onLayerDelete={deleteLayerContents} onItemDelete={(id) => deleteSelection([id], [])} selectedId={selectedId} activeLayerId={activeLayerId} onActiveLayer={setActiveLayerId} onSelect={setSelectedId} onItemChange={changeLayerItem} parentItemsAbovePageContent={doc.parentItemsAbovePageContent ?? false} canChangeParentOrder={!editingParentId && !previewMode} onParentItemsAbovePageContentChange={(above) => { if (!editingParentId && !previewMode) pageOps.commit({ doc: { ...doc, parentItemsAbovePageContent: above } }) }} />,
            },
          ]}
        />
      </div>

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
      {runningHeaderDialog && (
        <RunningHeaderDialog styles={paragraphStyles} onApply={applyRunningHeader} onClose={() => setRunningHeaderDialog(false)} />
      )}
      {tocDialogOpen && (
        <TocDialog styles={paragraphStyles} initial={doc.toc} onConfirm={createTableOfContents} onClose={() => setTocDialogOpen(false)} />
      )}
      {firstWordDialog && (
        <FirstWordStylerDialog styles={paragraphStyles} characterStyles={characterStyles} hasSelection={!!textSel && textSel.a !== textSel.b} onApply={applyFirstWordStyle} onClose={() => setFirstWordDialog(false)} />
      )}
      {insertTableOpen && <InsertTableDialog onConfirm={insertTableShape} onClose={() => setInsertTableOpen(false)} />}
      {tableOptionsOpen && (() => {
        const sh = selectedTable()
        return sh ? <TableOptionsDialog table={sh.table} onApply={(table) => { commitTable(sh.id, table, 'table-options'); setTableOptionsOpen(false) }} onClose={() => setTableOptionsOpen(false)} /> : null
      })()}
      {cellOptionsOpen && (() => {
        const sh = selectedTable()
        const area = sh && tableSel && tableSel.id === sh.id ? expandRange(sh.table, tableSel) : null
        const first = sh && area ? sh.table.cells[area.r0][area.c0] : null
        return sh && area && first ? <CellOptionsDialog cell={first} count={originsOf(sh.table).filter((o) => o.r0 >= area.r0 && o.r1 <= area.r1 && o.c0 >= area.c0 && o.c1 <= area.c1).length} onApply={applyCellPatch} onClose={() => setCellOptionsOpen(false)} /> : null
      })()}
      {windowTextDialog && (
        <WindowTextDialog
          styles={paragraphStyles}
          hasSelection={!!textSel && textSel.a !== textSel.b}
          onApply={(options) => runWindowText(options, false)}
          onRemove={(options) => runWindowText(options, true)}
          onClose={() => setWindowTextDialog(false)}
        />
      )}
      {findOpen && (
        <FindReplacePanel
          key={findKey}
          seed={findSeed}
          hasSelection={!!textSel && textSel.a !== textSel.b}
          revision={flow}
          summarize={summarizeFind}
          captureSelection={captureFindSelection}
          onStep={stepFind}
          onReplaceOne={replaceOneFind}
          onReplaceAll={replaceAllFind}
          onClose={() => setFindOpen(false)}
        />
      )}
      {footnoteDialog && (
        <FootnoteEditorDialog
          title={footnoteDialog.noteId ? 'עריכת הערת שוליים' : 'הוספת הערת שוליים'}
          initial={footnoteDialog.initial}
          initialRuns={footnoteDialog.initialRuns}
          baseStyle={footnoteTextStyle(footnoteConfig, paragraphStyles)}
          onSave={saveFootnote}
          onDelete={footnoteDialog.noteId ? deleteFootnote : undefined}
          onClose={() => setFootnoteDialog(null)}
        />
      )}
      {footnoteOptionsOpen && (
        <FootnoteOptionsDialog value={doc.footnotes} paragraphStyles={paragraphStyles} onPreview={setFootnotePreviewConfig} onSave={saveFootnoteOptions} onClose={() => { setFootnotePreviewConfig(null); setFootnoteOptionsOpen(false) }} />
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
      {objectMenu && (
        <ContextMenu
          x={objectMenu.x}
          y={objectMenu.y}
          onClose={() => setObjectMenu(null)}
          items={[
            ...(() => {
              const frame = objectMenu.textFrameId ? frames.find((candidate) => candidate.id === objectMenu.textFrameId) : null
              if (!frame) return []
              const hasPrevious = frames.some((candidate) => candidate.next === frame.id)
              return [
                ...(frame.next === null ? [{
                  label: 'שרשר לתיבה הבאה',
                  disabled: !!itemLocks[frame.id],
                  onClick: () => {
                    setSelectedId(frame.id)
                    setEditingId(null)
                    setTool('select')
                    setLinkFrom(frame.id)
                  },
                }] : []),
                ...(hasPrevious ? [{
                  label: 'בטל שרשור',
                  disabled: !!itemLocks[frame.id],
                  onClick: () => {
                    onFramesChange(unlinkBefore(frames, frame.id))
                    setSelectedId(frame.id)
                  },
                }] : []),
                ...(frame.next === null || hasPrevious ? [{ separator: true }] : []),
              ]
            })(),
            ...(objectMenu.sourceShapeId && objectMenu.targetShapeId ? [{ label: 'העתק רוחב וגובה לצורה המסומנת', onClick: () => copyShapeSize(objectMenu.targetShapeId!, objectMenu.sourceShapeId!) }] : []),
            ...(objectMenu.sourceShapeId ? [{ separator: true }] : []),
            ...(() => {
              const pair = selectedImageShapePair()
              return pair ? [{ label: 'הכנס תמונה לתוך צורה', disabled: !!itemLocks[pair.image.id] || !!itemLocks[pair.shape.id], onClick: insertSelectedImageIntoShape }] : []
            })(),
            { label: 'צור גרופ', disabled: selectedObjectIds().length < 2, onClick: groupSelectedObjects },
            { label: 'שחרר גרופ', disabled: !selectedObjectIds().some((id) => !!objectGroupId(id)), onClick: ungroupSelectedObjects },
            { separator: true },
            { label: 'מזג צורות', disabled: selectedObjectIds().length < 2 || selectedObjectIds().some((id) => !shapes.some((shape) => shape.id === id)), onClick: () => combineSelectedShapes('unite') },
            { label: 'מזג תמונות לשכבה אחת', disabled: !canMergeImages, onClick: () => void mergeSelectedImages() },
            { label: 'ייצא בחירה ל־PNG', disabled: !canExportPng, onClick: () => void exportSelectedPng() },
          ]}
        />
      )}
      {tableMenu && (() => {
        const sh = shapes.find((shape) => shape.id === tableMenu.id && shape.kind === 'table' && shape.table) as (ShapeFrame & { table: TableData }) | undefined
        if (!sh) return null
        const area = tableSel?.id === sh.id ? expandRange(sh.table, tableSel) : null
        const mergedOrigin = area && originsOf(sh.table).find((origin) => origin.r0 === area.r0 && origin.c0 === area.c0 && origin.r1 === area.r1 && origin.c1 === area.c1)
        const canUnmerge = !!mergedOrigin && (mergedOrigin.r0 !== mergedOrigin.r1 || mergedOrigin.c0 !== mergedOrigin.c1)
        const close = () => setTableMenu(null)
        return <ContextMenu
          x={tableMenu.x}
          y={tableMenu.y}
          onClose={close}
          items={[
            { label: 'בחר שורה', onClick: () => { close(); runTableOp('select-row') } },
            { label: 'בחר עמודה', onClick: () => { close(); runTableOp('select-column') } },
            { label: 'בחר טבלה', onClick: () => { close(); runTableOp('select-table') } },
            { separator: true },
            { label: 'אפשרויות טבלה…', onClick: () => { close(); setTableOptionsOpen(true) } },
            { label: 'אפשרויות תא…', disabled: !area, onClick: () => { close(); setCellOptionsOpen(true) } },
            { separator: true },
            { label: 'הוספת שורה מעל', onClick: () => { close(); runTableOp('row-above') } },
            { label: 'הוספת שורה מתחת', onClick: () => { close(); runTableOp('row-below') } },
            { label: 'הוספת עמודה בתחילת הבחירה', onClick: () => { close(); runTableOp('col-start') } },
            { label: 'הוספת עמודה בסוף הבחירה', onClick: () => { close(); runTableOp('col-end') } },
            { separator: true },
            { label: 'מחיקת שורה', disabled: !area || tableRows(sh.table) <= 1, onClick: () => { close(); runTableOp('delete-row') } },
            { label: 'מחיקת עמודה', disabled: !area || tableCols(sh.table) <= 1, onClick: () => { close(); runTableOp('delete-col') } },
            { separator: true },
            { label: 'מיזוג תאים', disabled: !area || (area.r0 === area.r1 && area.c0 === area.c1), onClick: () => { close(); runTableOp('merge') } },
            { label: 'ביטול מיזוג תאים', disabled: !canUnmerge, onClick: () => { close(); runTableOp('unmerge') } },
          ]}
        />
      })()}
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
      {smartLayoutDialog && (
        <SmartLayoutDialog
          hasSelection={!!textSel || !!(selectedId && flow.get(selectedId))}
          styles={paragraphStyles.map((style) => ({ id: style.id, name: style.name }))}
          onApply={applySmartLayout}
          onClose={() => setSmartLayoutDialog(false)}
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
        issues={preflightIssues}
        onGoToIssue={goToIssue}
      />
      <GuidedToolTour enabled={startInitialTour} onComplete={onInitialTourComplete ?? noop} />
    </div>
  )
}
