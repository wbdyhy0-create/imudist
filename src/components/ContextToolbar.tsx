import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BLEND_MODES, DEFAULT_SPACE_AFTER, MAX_PAGE_PT, type BlendMode, type CharStyle, type ColorSample, type ImageFrame, type Sharpness, type ShapeFrame, type TextAlign, type TextFrame, type TextStyle } from '../document'
import { SHARPNESS_LEVELS } from '../sharpness'
import { FillPicker } from './FillPicker'
import { ALIGNS } from './PropertiesPanel'
import { ArrangeButtons } from './ArrangeButtons'
import type { ToolId } from './Toolbox'
import type { ArrangeOp } from '../stacking'
import { useFontCatalog } from '../fonts'
import { FontPicker } from './FontPicker'
import { NumberField } from './NumberField'
import { LineToolbarControls } from './LineToolbarControls'
import { MenuRow, ToolbarMenu } from './ToolbarMenu'
import type { Unit } from '../units'

/** the choice of how an object is mixed with what is under it */
const blendSelect = (value: BlendMode | undefined, onChange: (mode: BlendMode | undefined) => void) => (
  <label className="context-field" title="מצב שילוב: איך האובייקט משתלב עם מה שמתחתיו">
    <span>מצב שילוב</span>
    <select aria-label="מצב שילוב" value={value ?? ''} onChange={(event) => onChange(event.target.value ? (event.target.value as BlendMode) : undefined)}>
      <option value="">רגיל</option>
      {BLEND_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
    </select>
  </label>
)

interface Props {
  tool: ToolId
  /** how sharp free-drawn lines and brush strokes are: shown for the pencil and the brush tool, and applied to a selected stroke */
  sharpness?: Sharpness
  onSharpness?: (level: Sharpness) => void
  shape: ShapeFrame | null
  image: ImageFrame | null
  frame: TextFrame | null
  /** the look of the text the caret / selection is in (font, size, weight, italic, tracking); the frame's own when missing */
  textStyle?: CharStyle | null
  tableText?: TextStyle | null
  fontSizeControl?: ReactNode
  /** the paragraph layout (leading, indents, align, spacing) of the caret / selection's own paragraph - a paragraph
   * style, or a change made while some text was selected, can give one paragraph its own; the frame's own when missing */
  paragraphStyle?: TextStyle | null
  colorSamples: ColorSample[]
  onSwatchFill: (color: string | null) => void
  onSwatchStroke: (color: string | null) => void
  outlineWidth: number
  onOutlineWidth: (value: number) => void
  strokeWidth: number
  onStrokeWidth: (value: number) => void
  onFlip: (axis: 'x' | 'y') => void
  onArrange: (op: ArrangeOp) => void
  onOpacity: (value: number) => void
  /** how the selected object is mixed with what is under it (undefined: normal) */
  onBlendMode?: (mode: BlendMode | undefined) => void
  /** the level taken as white for a picture multiplied with what is under it (undefined: the picture as it is) */
  onWhitePoint?: (value: number | undefined) => void
  /** finds the level of the picture's paper (its border) and sets the white point to it */
  onAutoWhitePoint?: () => void
  onImageFit?: (fit: ImageFrame['fit']) => void
  onImageFlip?: (axis: 'x' | 'y') => void
  onImageWrap?: (wrap: ImageFrame['wrap']) => void
  onImageMatchShape?: () => void
  onImageRemoveBackground?: () => void
  imageBackgroundRemovalDisabled?: boolean
  removingImageBackground?: boolean
  onImageDelete?: () => void
  onCharStyle?: (patch: Partial<CharStyle>) => void
  onFontPreview?: (family: string | null) => void
  onTextScale?: (axis: 'x' | 'y', percent: number) => void
  onAlign?: (align: TextAlign) => void
  onLeading?: (value: number) => void
  /** the unit of the document: the indents are shown in it, as in the paragraph panel and the style dialog */
  unit?: Unit
  /** a change of the selected shape's own settings (a line's pattern, ends, thickness, blur, shadow ...) */
  onShapePatch?: (patch: Partial<ShapeFrame>) => void
  /** a change of its position or size */
  onShapeGeometry?: (patch: Partial<ShapeFrame>) => void
  onParagraphStyle?: (patch: Partial<Pick<TextFrame, 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent' | 'wordSpacing'>>) => void
  onParagraphSpacing?: (patch: Partial<Pick<TextFrame, 'spaceBefore' | 'spaceAfter'>>) => void
  children?: ReactNode
}

const LABELS: Partial<Record<ToolId, string>> = {
  select: 'בחירה',
  direct: 'עריכת נקודות',
  transform: 'שינוי צורה חופשי',
  type: 'טקסט',
  pen: 'עט',
  pencil: 'עיפרון',
  brush: 'מברשת',
  line: 'קו',
  rect: 'מרובע',
  ellipse: 'אליפסה',
  polygon: 'מצולע',
  scissors: 'מספריים',
  feather: 'החלקה',
  eraser: 'מחק',
}

export function ContextToolbar({ tool, unit, onShapePatch, onShapeGeometry, sharpness, onSharpness, shape, image, frame, textStyle, tableText, fontSizeControl, paragraphStyle, colorSamples, onSwatchFill, onSwatchStroke, outlineWidth, onOutlineWidth, strokeWidth, onStrokeWidth, onFlip, onArrange, onOpacity, onBlendMode, onWhitePoint, onAutoWhitePoint, onImageFit, onImageFlip, onImageWrap, onImageMatchShape, onImageRemoveBackground, imageBackgroundRemovalDisabled, removingImageBackground, onImageDelete, onCharStyle, onFontPreview, onTextScale, onAlign, onLeading, onParagraphStyle, onParagraphSpacing, children }: Props) {
  const label = LABELS[tool] ?? 'כלי'
  const char = (textStyle ?? tableText ?? frame) as CharStyle
  const fontCatalog = useFontCatalog()
  // leading / indents / align / spacing: the caret's own paragraph may carry a style (or an override) the frame
  // itself doesn't - same reasoning as `char` above, just for paragraph-level layout instead of character look
  const para = (paragraphStyle ?? tableText ?? frame) as TextStyle
  const [openPalette, setOpenPalette] = useState<'fill' | 'stroke' | null>(null)
  const textColorControlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!openPalette) return
    const close = () => setOpenPalette(null)
    const onClickOutside = (event: MouseEvent) => {
      if (!textColorControlsRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('click', onClickOutside)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClickOutside)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openPalette])
  const fillValue = shape ? shape.fill : textStyle?.color ?? '#ffffff'
  const strokeValue = shape ? shape.stroke : (textStyle?.outlineWidth ?? 0) > 0 ? textStyle?.outlineColor ?? '#000000' : null
  const currentOutlineWidth = shape?.strokeWidth ?? textStyle?.outlineWidth ?? (frame ? 0 : outlineWidth)
  const stepOutlineWidth = (direction: -1 | 1) => {
    const next = direction > 0
      ? currentOutlineWidth === 0 ? 0.25 : (Math.floor(currentOutlineWidth * 4 + 1e-9) + 1) / 4
      : Math.max(0, (Math.ceil(currentOutlineWidth * 4 - 1e-9) - 1) / 4)
    onOutlineWidth(Math.min(200, next))
  }
  return (
    <div className={'context-toolbar' + (tableText ? ' table-format-toolbar' : '')} role="toolbar" aria-label={tableText ? 'עיצוב טבלה' : `אפשרויות ${label}`}>
      <span className="context-tool-name">{label}</span>
      <span className="context-divider" />
      {(shape || frame) && (
        <div className="context-object-colors" ref={textColorControlsRef} role="group" aria-label="צבע מילוי וקו מתאר">
          {shape?.kind !== 'line' && <div className="context-swatch-wrap">
            <button
              type="button"
              className={'context-color-preview context-fill-preview' + (openPalette === 'fill' ? ' active' : '')}
              aria-label="צבע מילוי"
              aria-expanded={openPalette === 'fill'}
              title="צבע מילוי"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpenPalette((current) => current === 'fill' ? null : 'fill')}
            >
              {shape
                ? <span className="context-shape-preview context-shape-fill" style={fillValue ? { backgroundColor: fillValue } : undefined} />
                : <span style={{ color: fillValue ?? '#ffffff' }}>א</span>}
            </button>
            {openPalette === 'fill' && (
              <div className="context-swatch-popover">
                <FillPicker label="צבע מילוי" value={fillValue} samples={colorSamples} onChange={(color) => { onSwatchFill(color); setOpenPalette(null) }} />
              </div>
            )}
          </div>}
          <div className="context-swatch-wrap context-outline-wrap">
            <button
              type="button"
              className={'context-color-preview context-outline-preview' + (openPalette === 'stroke' ? ' active' : '')}
              aria-label="צבע קו מתאר"
              aria-expanded={openPalette === 'stroke'}
              title="צבע קו מתאר"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpenPalette((current) => current === 'stroke' ? null : 'stroke')}
            >
              {shape
                ? <span className="context-shape-preview context-shape-outline" style={{ borderColor: strokeValue ?? '#ffffff', borderWidth: `${Math.min(6, Math.max(1, (currentOutlineWidth || 0.25) * 96 / 72))}px` }} />
                : <span style={{ color: 'transparent', WebkitTextStroke: `${Math.max(0.5, (currentOutlineWidth || 0.25) * 96 / 72)}px ${strokeValue ?? '#000000'}` }}>א</span>}
            </button>
            {openPalette === 'stroke' && (
              <div className="context-swatch-popover">
                <FillPicker label="צבע קו מתאר" value={strokeValue} samples={colorSamples} onChange={(color) => { onSwatchStroke(color); setOpenPalette(null) }} />
              </div>
            )}
          </div>
          <div className="context-outline-stepper" role="group" aria-label="עובי קו מתאר">
            <span>{Number(currentOutlineWidth.toFixed(2))}</span>
            <button type="button" aria-label="הגדל עובי קו מתאר" title="הגדל עובי קו מתאר" onMouseDown={(event) => event.preventDefault()} onClick={() => stepOutlineWidth(1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="M1 5 4 2 7 5" /></svg></button>
            <button type="button" aria-label="הקטן עובי קו מתאר" title="הקטן עובי קו מתאר" onMouseDown={(event) => event.preventDefault()} onClick={() => stepOutlineWidth(-1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="m1 2 3 3 3-3" /></svg></button>
          </div>
        </div>
      )}
      {shape && <div className="context-flip-buttons" role="group" aria-label="היפוך צורה"><button className="context-command" title="היפוך אופקי" onClick={() => onFlip('x')}>⇋</button><button className="context-command" title="היפוך אנכי" onClick={() => onFlip('y')}>⇵</button></div>}
      {(shape || image || frame) && shape?.kind !== 'line' && <ArrangeButtons onArrange={onArrange} compact />}
      {shape && shape.kind !== 'line' && onBlendMode && blendSelect(shape.blendMode, onBlendMode)}
      {shape && <label className="context-field"><span>שקיפות</span><input type="range" min="0" max="100" value={Math.round((shape.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((shape.opacity ?? 1) * 100)}%</span></label>}
      {shape?.kind === 'line' && onShapePatch && onShapeGeometry && <LineToolbarControls shape={shape} unit={unit ?? 'mm'} onChange={onShapePatch} onGeometry={onShapeGeometry} />}
      {image && <><div className="context-image-fits" role="group" aria-label="מאפייני תמונה"><button title="מילוי המסגרת בתמונה" className={image.fit === 'fill' ? 'on' : ''} onClick={() => onImageFit?.('fill')}>מילוי</button><button title="התאמת התמונה בלי חיתוך" className={image.fit === 'fit' ? 'on' : ''} onClick={() => onImageFit?.('fit')}>התאמה</button><button title="מתיחת התמונה לגודל המסגרת" className={image.fit === 'stretch' ? 'on' : ''} onClick={() => onImageFit?.('stretch')}>מתיחה</button></div><div className="context-image-wrap" role="group" aria-label="עטיפת טקסט"><button title="ללא עטיפת טקסט" className={!image.wrap || image.wrap === 'none' ? 'on' : ''} onClick={() => onImageWrap?.('none')}>ללא</button><button title="טקסט מסביב לתמונה" className={image.wrap === 'around' ? 'on' : ''} onClick={() => onImageWrap?.('around')}>מסביב</button><button title="טקסט מעל ומתחת לתמונה" className={image.wrap === 'jump' ? 'on' : ''} onClick={() => onImageWrap?.('jump')}>קפיצה</button></div><div className="context-flip-buttons" role="group" aria-label="היפוך תמונה"><button className="context-command" title="היפוך אופקי" onClick={() => onImageFlip?.('x')}>⇋</button><button className="context-command" title="היפוך אנכי" onClick={() => onImageFlip?.('y')}>⇵</button></div><button className="context-command" title="התאם את המסגרת ליחס התמונה" onClick={onImageMatchShape}>התאם מסגרת</button><button type="button" className="context-command" title="הסרת הרקע מתבצעת במחשב" onClick={onImageRemoveBackground} disabled={imageBackgroundRemovalDisabled}>{removingImageBackground ? 'מסיר רקע…' : 'הסר רקע'}</button>{onBlendMode && blendSelect(image.blendMode, onBlendMode)}{image.blendMode === 'multiply' && onWhitePoint && <><label className="context-field" title="הרמה שנחשבת ללבן: מה שבהיר ממנה הופך ללבן מלא ונעלם בכפל. הורידו אותה כשהרקע של הלוגו לא לבן לגמרי"><span>נקודת לבן</span><input type="range" min="128" max="255" value={image.whitePoint ?? 255} onChange={(event) => onWhitePoint(Number(event.target.value) >= 255 ? undefined : Number(event.target.value))} /><span>{image.whitePoint ?? 255}</span></label><button type="button" className="context-command" title="מזהה את הלבן של התמונה לפי הקצה שלה" onClick={onAutoWhitePoint}>זהה אוטומטית</button></>}<label className="context-field" title="שקיפות התמונה"><span>שקיפות</span><input type="range" min="0" max="100" value={Math.round((image.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((image.opacity ?? 1) * 100)}%</span></label><button className="context-command danger" title="מחק את התמונה" onClick={onImageDelete}>מחק תמונה</button></>}
      {frame && <>
        <div className="context-text-controls" aria-label="מאפייני טקסט">
          <FontPicker
            className="context-font-picker"
            value={char.fontFamily}
            families={fontCatalog.families}
            onChange={(fontFamily) => onCharStyle?.({ fontFamily })}
            onPreview={onFontPreview}
          />
          <button className={'context-command' + (char.weight >= 600 ? ' active' : '')} title="מודגש" onClick={() => onCharStyle?.({ weight: char.weight >= 600 ? 400 : 700 })}>B</button>
          <button className={'context-command' + (char.italic ? ' active' : '')} title="נטוי" onClick={() => onCharStyle?.({ italic: !char.italic })}>I</button>
          {fontSizeControl}
          <div className="context-align-buttons" role="group" aria-label="יישור">
            {ALIGNS.map((a) => <button key={a.id} data-tooltip={a.label} title={a.label} className={para.align === a.id ? 'active' : ''} onClick={() => onAlign?.(a.id)}><svg viewBox="0 0 24 24"><path d={a.icon} /></svg></button>)}
          </div>
          <ToolbarMenu label="ריווח" title="ריווח בין אותיות, מילים, שורות ופסקאות">
            <MenuRow label="בין אותיות (% מהגופן)" title="מרווח בין אותיות באחוזים מגודל הגופן">
              <input type="number" step="1" value={char.tracking / 10} onChange={(event) => onCharStyle?.({ tracking: Math.round((Number(event.target.value) || 0) * 10) })} />
            </MenuRow>
            <MenuRow label="בין מילים (%)" title="מרווח בין מילים באחוזים מהרווח הרגיל, 100 = רגיל">
              <input type="number" step="10" min="0" max="500" value={para.wordSpacing ?? 100} onChange={(event) => { const value = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(value)) onParagraphStyle?.({ wordSpacing: Math.min(500, Math.max(0, value)) }) }} />
            </MenuRow>
            <MenuRow label="בין שורות (pt)" title="מרווח שורות">
              <input type="number" min="1" value={para.leading !== undefined && para.leading > 0 ? para.leading : Math.round(char.fontSize * 1.25)} onChange={(event) => { const value = Number(event.target.value); if (value > 0) onLeading?.(value) }} />
            </MenuRow>
            <MenuRow label="בין פסקאות" title="הרווח בין הפסקה לפסקה שאחריה (אותו ערך כמו „הזחה מלמטה” ו„רווח אחרי” בסגנון הפסקה)">
              <NumberField value={para.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceAfter) => onParagraphSpacing?.({ spaceAfter })} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu label="הזחות" title="הזחות הפסקה מהצדדים, מלמעלה ומלמטה">
            <MenuRow label="הזחה מימין">
              <NumberField value={para.indentRight ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(indentRight) => onParagraphStyle?.({ indentRight })} />
            </MenuRow>
            <MenuRow label="הזחה משמאל">
              <NumberField value={para.indentLeft ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(indentLeft) => onParagraphStyle?.({ indentLeft })} />
            </MenuRow>
            <MenuRow label="הזחה מלמעלה" title="הרווח שלפני הפסקה, שדוחף אותה כלפי מטה מהפסקה שמעליה">
              <NumberField value={para.spaceBefore ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceBefore) => onParagraphSpacing?.({ spaceBefore })} />
            </MenuRow>
            <MenuRow label="הזחה מלמטה" title="הרווח שאחרי הפסקה, שדוחף את הפסקה שמתחתיה כלפי מטה">
              <NumberField value={para.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceAfter) => onParagraphSpacing?.({ spaceAfter })} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu label="גודל התו" title="קנה מידה אופקי ואנכי של הטקסט">
            <MenuRow label="רוחב תו (%)" title="קנה מידה אופקי של הטקסט">
              <input aria-label="קנה מידה אופקי של הטקסט" type="number" min="10" max="1000" value={Math.round((frame.textScale?.x ?? 1) * 100)} onChange={(event) => onTextScale?.('x', Number(event.target.value))} />
            </MenuRow>
            <MenuRow label="גובה תו (%)" title="קנה מידה אנכי של הטקסט">
              <input aria-label="קנה מידה אנכי של הטקסט" type="number" min="10" max="1000" value={Math.round((frame.textScale?.y ?? 1) * 100)} onChange={(event) => onTextScale?.('y', Number(event.target.value))} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu label="אטימות צבע" title="אטימות הצבע של הטקסט">
            <MenuRow label={`אטימות: ${Math.round((frame.opacity ?? 1) * 100)}%`}>
              <input
                aria-label="אטימות צבע"
                type="range"
                min="0"
                max="100"
                value={Math.round((frame.opacity ?? 1) * 100)}
                onChange={(event) => onOpacity(Number(event.target.value) / 100)}
              />
            </MenuRow>
          </ToolbarMenu>
        </div>
      </>}
      {(tool === 'pen' || tool === 'pencil' || tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'polygon') && !shape && (
        <label className="context-field">
          <span>עובי קו</span>
          <input type="number" min="0" max="200" step="0.25" value={strokeWidth} onChange={(event) => onStrokeWidth(Number(event.target.value))} />
          <span>pt</span>
        </label>
      )}
      {(tool === 'pencil' || tool === 'brush') && sharpness && onSharpness && (
        <label className="context-field" title={SHARPNESS_LEVELS.find((level) => level.id === sharpness)?.hint}>
          <span>חדות</span>
          <select value={sharpness} aria-label="חדות הקו" onChange={(event) => onSharpness(event.target.value as Sharpness)}>
            {SHARPNESS_LEVELS.map((level) => (
              <option key={level.id} value={level.id} title={level.hint}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {tool === 'pencil' && <>
        <label className="context-field"><span>החלקה</span><input type="range" min="0" max="100" defaultValue="65" /></label>
        <label className="context-field"><span>נאמנות</span><input type="range" min="0.5" max="10" step="0.5" defaultValue="2.5" /></label>
      </>}
      {children}
    </div>
  )
}
