import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BLEND_MODES, DEFAULT_SPACE_AFTER, MAX_PAGE_PT, type BlendMode, type CharStyle, type ColorSample, type ImageFrame, type Sharpness, type ShapeFrame, type TextAlign, type TextDirection, type TextFrame, type TextStyle } from '../document'
import { SHARPNESS_LEVELS } from '../sharpness'
import { FillPicker } from './FillPicker'
import { ALIGNS, alignIcon, TEXT_DIRECTIONS } from './PropertiesPanel'
import { ArrangeButtons } from './ArrangeButtons'
import type { ToolId } from './Toolbox'
import type { ArrangeOp } from '../stacking'
import { useFontCatalog } from '../fonts'
import { FontPicker } from './FontPicker'
import { NumberField } from './NumberField'
import { LineToolbarControls } from './LineToolbarControls'
import { MenuRow, ToolbarMenu } from './ToolbarMenu'
import type { Unit } from '../units'
import { t } from '../i18n'

/** the choice of how an object is mixed with what is under it */
const blendSelect = (value: BlendMode | undefined, onChange: (mode: BlendMode | undefined) => void) => (
  <label className="context-field" title={t('מצב שילוב: איך האובייקט משתלב עם מה שמתחתיו')}>
    <span>{t('מצב שילוב')}</span>
    <select aria-label={t('מצב שילוב')} value={value ?? ''} onChange={(event) => onChange(event.target.value ? (event.target.value as BlendMode) : undefined)}>
      <option value="">{t('רגיל')}</option>
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
  /** the reading direction of the paragraph (right to left, left to right, or by its first letter); not given where it has no meaning (a table) */
  onDirection?: (direction: TextDirection) => void
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
  get select() { return t('בחירה') },
  get direct() { return t('עריכת נקודות') },
  get transform() { return t('שינוי צורה חופשי') },
  get type() { return t('טקסט') },
  get pen() { return t('עט') },
  get pencil() { return t('עיפרון') },
  get brush() { return t('מברשת') },
  get line() { return t('קו') },
  get rect() { return t('מרובע') },
  get ellipse() { return t('אליפסה') },
  get polygon() { return t('מצולע') },
  get scissors() { return t('מספריים') },
  get feather() { return t('החלקה') },
  get eraser() { return t('מחק') },
}

export function ContextToolbar({ tool, unit, onShapePatch, onShapeGeometry, sharpness, onSharpness, shape, image, frame, textStyle, tableText, fontSizeControl, paragraphStyle, colorSamples, onSwatchFill, onSwatchStroke, outlineWidth, onOutlineWidth, strokeWidth, onStrokeWidth, onFlip, onArrange, onOpacity, onBlendMode, onWhitePoint, onAutoWhitePoint, onImageFit, onImageFlip, onImageWrap, onImageMatchShape, onImageRemoveBackground, imageBackgroundRemovalDisabled, removingImageBackground, onImageDelete, onCharStyle, onFontPreview, onTextScale, onAlign, onDirection, onLeading, onParagraphStyle, onParagraphSpacing, children }: Props) {
  const label = LABELS[tool] ?? t('כלי')
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
    <div className={'context-toolbar' + (tableText ? ' table-format-toolbar' : '')} role="toolbar" aria-label={tableText ? t('עיצוב טבלה') : t('אפשרויות {label}', { label })}>
      <span className="context-tool-name">{label}</span>
      <span className="context-divider" />
      {(shape || frame) && (
        <div className="context-object-colors" ref={textColorControlsRef} role="group" aria-label={t('צבע מילוי וקו מתאר')}>
          {shape?.kind !== 'line' && <div className="context-swatch-wrap">
            <button
              type="button"
              className={'context-color-preview context-fill-preview' + (openPalette === 'fill' ? ' active' : '') + (!shape && fillValue === 'transparent' ? ' none' : '')}
              aria-label={t('צבע מילוי')}
              aria-expanded={openPalette === 'fill'}
              title={t('צבע מילוי')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpenPalette((current) => current === 'fill' ? null : 'fill')}
            >
              {shape
                ? <span className="context-shape-preview context-shape-fill" style={fillValue ? { backgroundColor: fillValue } : undefined} />
                : <span style={{ color: fillValue ?? '#ffffff' }}>{t('א')}</span>}
            </button>
            {openPalette === 'fill' && (
              <div className="context-swatch-popover">
                <FillPicker label={t('צבע מילוי')} value={fillValue === 'transparent' ? null : fillValue} samples={colorSamples} onChange={(color) => { onSwatchFill(color); setOpenPalette(null) }} />
              </div>
            )}
          </div>}
          <div className="context-swatch-wrap context-outline-wrap">
            <button
              type="button"
              className={'context-color-preview context-outline-preview' + (openPalette === 'stroke' ? ' active' : '')}
              aria-label={t('צבע קו מתאר')}
              aria-expanded={openPalette === 'stroke'}
              title={t('צבע קו מתאר')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpenPalette((current) => current === 'stroke' ? null : 'stroke')}
            >
              {shape
                ? <span className="context-shape-preview context-shape-outline" style={{ borderColor: strokeValue ?? '#ffffff', borderWidth: `${Math.min(6, Math.max(1, (currentOutlineWidth || 0.25) * 96 / 72))}px` }} />
                : <span>{t('א')}</span>}
            </button>
            {openPalette === 'stroke' && (
              <div className="context-swatch-popover">
                <FillPicker label={t('צבע קו מתאר')} value={strokeValue} samples={colorSamples} onChange={(color) => { onSwatchStroke(color); setOpenPalette(null) }} />
              </div>
            )}
          </div>
          <div className="context-outline-stepper" role="group" aria-label={t('עובי קו מתאר')}>
            <span>{Number(currentOutlineWidth.toFixed(2))}</span>
            <button type="button" aria-label={t('הגדל עובי קו מתאר')} title={t('הגדל עובי קו מתאר')} onMouseDown={(event) => event.preventDefault()} onClick={() => stepOutlineWidth(1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="M1 5 4 2 7 5" /></svg></button>
            <button type="button" aria-label={t('הקטן עובי קו מתאר')} title={t('הקטן עובי קו מתאר')} onMouseDown={(event) => event.preventDefault()} onClick={() => stepOutlineWidth(-1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="m1 2 3 3 3-3" /></svg></button>
          </div>
        </div>
      )}
      {shape && <div className="context-flip-buttons" role="group" aria-label={t('היפוך צורה')}><button className="context-command" title={t('היפוך אופקי')} onClick={() => onFlip('x')}>⇋</button><button className="context-command" title={t('היפוך אנכי')} onClick={() => onFlip('y')}>⇵</button></div>}
      {(shape || image || frame) && shape?.kind !== 'line' && <ArrangeButtons onArrange={onArrange} compact />}
      {shape && shape.kind !== 'line' && onBlendMode && blendSelect(shape.blendMode, onBlendMode)}
      {shape && <label className="context-field"><span>{t('שקיפות')}</span><input type="range" min="0" max="100" value={Math.round((shape.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((shape.opacity ?? 1) * 100)}%</span></label>}
      {shape?.kind === 'line' && onShapePatch && onShapeGeometry && <LineToolbarControls shape={shape} unit={unit ?? 'mm'} onChange={onShapePatch} onGeometry={onShapeGeometry} />}
      {image && <><div className="context-image-fits" role="group" aria-label={t('מאפייני תמונה')}><button title={t('מילוי המסגרת בתמונה')} className={image.fit === 'fill' ? 'on' : ''} onClick={() => onImageFit?.('fill')}>{t('מילוי')}</button><button title={t('התאמת התמונה בלי חיתוך')} className={image.fit === 'fit' ? 'on' : ''} onClick={() => onImageFit?.('fit')}>{t('התאמה')}</button><button title={t('מתיחת התמונה לגודל המסגרת')} className={image.fit === 'stretch' ? 'on' : ''} onClick={() => onImageFit?.('stretch')}>{t('מתיחה')}</button></div><div className="context-image-wrap" role="group" aria-label={t('עטיפת טקסט')}><button title={t('ללא עטיפת טקסט')} className={!image.wrap || image.wrap === 'none' ? 'on' : ''} onClick={() => onImageWrap?.('none')}>{t('ללא')}</button><button title={t('טקסט מסביב לתמונה')} className={image.wrap === 'around' ? 'on' : ''} onClick={() => onImageWrap?.('around')}>{t('מסביב')}</button><button title={t('טקסט מעל ומתחת לתמונה')} className={image.wrap === 'jump' ? 'on' : ''} onClick={() => onImageWrap?.('jump')}>{t('קפיצה')}</button></div><div className="context-flip-buttons" role="group" aria-label={t('היפוך תמונה')}><button className="context-command" title={t('היפוך אופקי')} onClick={() => onImageFlip?.('x')}>⇋</button><button className="context-command" title={t('היפוך אנכי')} onClick={() => onImageFlip?.('y')}>⇵</button></div><button className="context-command" title={t('התאם את המסגרת ליחס התמונה')} onClick={onImageMatchShape}>{t('התאם מסגרת')}</button><button type="button" className="context-command" title={t('הסרת הרקע מתבצעת במחשב')} onClick={onImageRemoveBackground} disabled={imageBackgroundRemovalDisabled}>{removingImageBackground ? t('מסיר רקע…') : t('הסר רקע')}</button>{onBlendMode && blendSelect(image.blendMode, onBlendMode)}{image.blendMode === 'multiply' && onWhitePoint && <><label className="context-field" title={t('הרמה שנחשבת ללבן: מה שבהיר ממנה הופך ללבן מלא ונעלם בכפל. הורידו אותה כשהרקע של הלוגו לא לבן לגמרי')}><span>{t('נקודת לבן')}</span><input type="range" min="128" max="255" value={image.whitePoint ?? 255} onChange={(event) => onWhitePoint(Number(event.target.value) >= 255 ? undefined : Number(event.target.value))} /><span>{image.whitePoint ?? 255}</span></label><button type="button" className="context-command" title={t('מזהה את הלבן של התמונה לפי הקצה שלה')} onClick={onAutoWhitePoint}>{t('זהה אוטומטית')}</button></>}<label className="context-field" title={t('שקיפות התמונה')}><span>{t('שקיפות')}</span><input type="range" min="0" max="100" value={Math.round((image.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((image.opacity ?? 1) * 100)}%</span></label><button className="context-command danger" title={t('מחק את התמונה')} onClick={onImageDelete}>{t('מחק תמונה')}</button></>}
      {frame && <>
        <div className="context-text-controls" aria-label={t('מאפייני טקסט')}>
          <FontPicker
            className="context-font-picker"
            value={char.fontFamily}
            families={fontCatalog.families}
            onChange={(fontFamily) => onCharStyle?.({ fontFamily })}
            onPreview={onFontPreview}
          />
          <button className={'context-command' + (char.weight >= 600 ? ' active' : '')} title={t('מודגש')} onClick={() => onCharStyle?.({ weight: char.weight >= 600 ? 400 : 700 })}>B</button>
          <button className={'context-command' + (char.italic ? ' active' : '')} title={t('נטוי')} onClick={() => onCharStyle?.({ italic: !char.italic })}>I</button>
          {fontSizeControl}
          <div className="context-align-buttons" role="group" aria-label={t('יישור')}>
            {ALIGNS.map((a) => <button key={a.id} data-tooltip={a.label} title={a.label} className={para.align === a.id ? 'active' : ''} onClick={() => onAlign?.(a.id)}><svg viewBox="0 0 24 24"><path d={alignIcon(a, para.direction)} /></svg></button>)}
          </div>
          {onDirection && (
            <ToolbarMenu highlighted compact label={(TEXT_DIRECTIONS.find((d) => d.id === (para.direction ?? 'rtl')) ?? TEXT_DIRECTIONS[0]).short} title={t('כיוון הטקסט')}>
              <div className="context-align-buttons" role="radiogroup" aria-label={t('כיוון הטקסט')}>
                {[...TEXT_DIRECTIONS].reverse().map((d) => <button key={d.id} role="radio" aria-checked={(para.direction ?? 'rtl') === d.id} data-tooltip={d.title} title={d.title} className={(para.direction ?? 'rtl') === d.id ? 'active' : ''} onClick={() => onDirection(d.id)}>{d.short}</button>)}
              </div>
            </ToolbarMenu>
          )}
          <ToolbarMenu compact label={t('ריווח')} title={t('ריווח בין אותיות, מילים, שורות ופסקאות')}>
            <MenuRow label={t('בין אותיות (% מהגופן)')} title={t('מרווח בין אותיות באחוזים מגודל הגופן')}>
              <input type="number" step="1" value={char.tracking / 10} onChange={(event) => onCharStyle?.({ tracking: Math.round((Number(event.target.value) || 0) * 10) })} />
            </MenuRow>
            <MenuRow label={t('בין מילים (%)')} title={t('מרווח בין מילים באחוזים מהרווח הרגיל, 100 = רגיל')}>
              <input type="number" step="10" min="0" max="500" value={para.wordSpacing ?? 100} onChange={(event) => { const value = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(value)) onParagraphStyle?.({ wordSpacing: Math.min(500, Math.max(0, value)) }) }} />
            </MenuRow>
            <MenuRow label={t('בין שורות (pt)')} title={t('מרווח שורות')}>
              <input type="number" min="1" value={para.leading !== undefined && para.leading > 0 ? para.leading : Math.round(char.fontSize * 1.25)} onChange={(event) => { const value = Number(event.target.value); if (value > 0) onLeading?.(value) }} />
            </MenuRow>
            <MenuRow label={t('בין פסקאות')} title={t('הרווח בין הפסקה לפסקה שאחריה (אותו ערך כמו „הזחה מלמטה” ו„רווח אחרי” בסגנון הפסקה)')}>
              <NumberField value={para.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceAfter) => onParagraphSpacing?.({ spaceAfter })} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu compact label={t('הזחות')} title={t('הזחות הפסקה מהצדדים, מלמעלה ומלמטה')}>
            <MenuRow label={t('הזחה מימין')}>
              <NumberField value={para.indentRight ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(indentRight) => onParagraphStyle?.({ indentRight })} />
            </MenuRow>
            <MenuRow label={t('הזחה משמאל')}>
              <NumberField value={para.indentLeft ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(indentLeft) => onParagraphStyle?.({ indentLeft })} />
            </MenuRow>
            <MenuRow label={t('הזחה מלמעלה')} title={t('הרווח שלפני הפסקה, שדוחף אותה כלפי מטה מהפסקה שמעליה')}>
              <NumberField value={para.spaceBefore ?? 0} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceBefore) => onParagraphSpacing?.({ spaceBefore })} />
            </MenuRow>
            <MenuRow label={t('הזחה מלמטה')} title={t('הרווח שאחרי הפסקה, שדוחף את הפסקה שמתחתיה כלפי מטה')}>
              <NumberField value={para.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit ?? 'mm'} min={0} max={MAX_PAGE_PT} onChange={(spaceAfter) => onParagraphSpacing?.({ spaceAfter })} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu label={t('גודל התו')} title={t('קנה מידה אופקי ואנכי של הטקסט')}>
            <MenuRow label={t('רוחב תו (%)')} title={t('קנה מידה אופקי של הטקסט')}>
              <input aria-label={t('קנה מידה אופקי של הטקסט')} type="number" min="10" max="1000" value={Math.round((frame.textScale?.x ?? 1) * 100)} onChange={(event) => onTextScale?.('x', Number(event.target.value))} />
            </MenuRow>
            <MenuRow label={t('גובה תו (%)')} title={t('קנה מידה אנכי של הטקסט')}>
              <input aria-label={t('קנה מידה אנכי של הטקסט')} type="number" min="10" max="1000" value={Math.round((frame.textScale?.y ?? 1) * 100)} onChange={(event) => onTextScale?.('y', Number(event.target.value))} />
            </MenuRow>
          </ToolbarMenu>
          <ToolbarMenu label={t('אטימות צבע')} title={t('אטימות הצבע של הטקסט')}>
            <MenuRow label={t('אטימות: {n1}%', { n1: Math.round((frame.opacity ?? 1) * 100) })}>
              <input
                aria-label={t('אטימות צבע')}
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
          <span>{t('עובי קו')}</span>
          <input type="number" min="0" max="200" step="0.25" value={strokeWidth} onChange={(event) => onStrokeWidth(Number(event.target.value))} />
          <span>pt</span>
        </label>
      )}
      {(tool === 'pencil' || tool === 'brush') && sharpness && onSharpness && (
        <label className="context-field" title={SHARPNESS_LEVELS.find((level) => level.id === sharpness)?.hint}>
          <span>{t('חדות')}</span>
          <select value={sharpness} aria-label={t('חדות הקו')} onChange={(event) => onSharpness(event.target.value as Sharpness)}>
            {SHARPNESS_LEVELS.map((level) => (
              <option key={level.id} value={level.id} title={level.hint}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {tool === 'pencil' && <>
        <label className="context-field"><span>{t('החלקה')}</span><input type="range" min="0" max="100" defaultValue="65" /></label>
        <label className="context-field"><span>{t('נאמנות')}</span><input type="range" min="0.5" max="10" step="0.5" defaultValue="2.5" /></label>
      </>}
      {children}
    </div>
  )
}
