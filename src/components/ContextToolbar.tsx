import { useState, type ReactNode } from 'react'
import type { CharStyle, ImageFrame, ShapeFrame, TextAlign, TextFrame } from '../document'
import { FillPicker } from './FillPicker'
import { ALIGNS } from './PropertiesPanel'
import { ArrangeButtons } from './ArrangeButtons'
import type { ToolId } from './Toolbox'
import type { ArrangeOp } from '../stacking'

interface Props {
  tool: ToolId
  shape: ShapeFrame | null
  image: ImageFrame | null
  frame: TextFrame | null
  /** the look of the text the caret / selection is in (font, size, weight, italic, tracking); the frame's own when missing */
  textStyle?: CharStyle | null
  strokeWidth: number
  onStrokeWidth: (value: number) => void
  onFill: (color: string | null) => void
  colorTarget: 'fill' | 'stroke'
  onColorTarget: (target: 'fill' | 'stroke') => void
  onFlip: (axis: 'x' | 'y') => void
  onArrange: (op: ArrangeOp) => void
  onOpacity: (value: number) => void
  onImageFit?: (fit: ImageFrame['fit']) => void
  onImageFlip?: (axis: 'x' | 'y') => void
  onImageWrap?: (wrap: ImageFrame['wrap']) => void
  onImageMatchShape?: () => void
  onImageDelete?: () => void
  onCharStyle?: (patch: Partial<CharStyle>) => void
  onAlign?: (align: TextAlign) => void
  onLeading?: (value: number) => void
  onParagraphStyle?: (patch: Partial<Pick<TextFrame, 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>) => void
  onParagraphSpacing?: (patch: Partial<Pick<TextFrame, 'spaceBefore' | 'spaceAfter'>>) => void
  children?: ReactNode
}

const FONT_CHOICES = ['Segoe UI', 'Arial', 'Tahoma', 'David', 'Times New Roman']

const LABELS: Partial<Record<ToolId, string>> = {
  select: 'בחירה',
  direct: 'עריכת נקודות',
  transform: 'שינוי צורה חופשי',
  type: 'טקסט',
  pen: 'עט',
  pencil: 'עיפרון',
  line: 'קו',
  rect: 'מלבן',
  ellipse: 'אליפסה',
  polygon: 'מצולע',
  scissors: 'מספריים',
  eraser: 'מחק',
}

export function ContextToolbar({ tool, shape, image, frame, textStyle, strokeWidth, onStrokeWidth, onFill, colorTarget, onColorTarget, onFlip, onArrange, onOpacity, onImageFit, onImageFlip, onImageWrap, onImageMatchShape, onImageDelete, onCharStyle, onAlign, onLeading, onParagraphStyle, onParagraphSpacing, children }: Props) {
  const label = LABELS[tool] ?? 'כלי'
  const char = (textStyle ?? frame) as CharStyle
  const [showSwatches, setShowSwatches] = useState(false)
  return (
    <div className="context-toolbar" role="toolbar" aria-label={`אפשרויות ${label}`}>
      <span className="context-tool-name">{label}</span>
      <span className="context-divider" />
      {shape && <div className="context-swatch-wrap"><button className="context-command" title="פתיחת פלטת מילוי וסטרוק" onClick={() => setShowSwatches((value) => !value)}>דוגמיות</button>{showSwatches && <div className="context-swatch-popover"><div className="context-swatch-row"><FillPicker label="דוגמיות צבע" value={colorTarget === 'fill' ? shape.fill : shape.stroke} onChange={onFill} /><div className="context-swatch-pair"><button className={'context-fill-square' + (colorTarget === 'fill' ? ' active' : '')} style={shape.fill ? { background: shape.fill } : undefined} aria-label="בחר מילוי" title="החל על מילוי" onClick={() => onColorTarget('fill')} /><button className={'context-stroke-square' + (colorTarget === 'stroke' ? ' active' : '')} style={shape.stroke ? { borderColor: shape.stroke } : undefined} aria-label="בחר סטרוק" title="החל על סטרוק" onClick={() => onColorTarget('stroke')} /></div></div></div>}</div>}
      {shape && <div className="context-flip-buttons" role="group" aria-label="היפוך צורה"><button className="context-command" title="היפוך אופקי" onClick={() => onFlip('x')}>⇋</button><button className="context-command" title="היפוך אנכי" onClick={() => onFlip('y')}>⇵</button></div>}
      {(shape || image || frame) && <ArrangeButtons onArrange={onArrange} />}
      {shape && <label className="context-field"><span>שקיפות</span><input type="range" min="0" max="100" value={Math.round((shape.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((shape.opacity ?? 1) * 100)}%</span></label>}
      {image && <><div className="context-image-fits" role="group" aria-label="מאפייני תמונה"><button title="מילוי המסגרת בתמונה" className={image.fit === 'fill' ? 'on' : ''} onClick={() => onImageFit?.('fill')}>מילוי</button><button title="התאמת התמונה בלי חיתוך" className={image.fit === 'fit' ? 'on' : ''} onClick={() => onImageFit?.('fit')}>התאמה</button><button title="מתיחת התמונה לגודל המסגרת" className={image.fit === 'stretch' ? 'on' : ''} onClick={() => onImageFit?.('stretch')}>מתיחה</button></div><div className="context-image-wrap" role="group" aria-label="עטיפת טקסט"><button title="ללא עטיפת טקסט" className={!image.wrap || image.wrap === 'none' ? 'on' : ''} onClick={() => onImageWrap?.('none')}>ללא</button><button title="טקסט מסביב לתמונה" className={image.wrap === 'around' ? 'on' : ''} onClick={() => onImageWrap?.('around')}>מסביב</button><button title="טקסט מעל ומתחת לתמונה" className={image.wrap === 'jump' ? 'on' : ''} onClick={() => onImageWrap?.('jump')}>קפיצה</button></div><div className="context-flip-buttons" role="group" aria-label="היפוך תמונה"><button className="context-command" title="היפוך אופקי" onClick={() => onImageFlip?.('x')}>⇋</button><button className="context-command" title="היפוך אנכי" onClick={() => onImageFlip?.('y')}>⇵</button></div><button className="context-command" title="התאם את המסגרת ליחס התמונה" onClick={onImageMatchShape}>התאם מסגרת</button><label className="context-field" title="שקיפות התמונה"><span>שקיפות</span><input type="range" min="0" max="100" value={Math.round((image.opacity ?? 1) * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /><span>{Math.round((image.opacity ?? 1) * 100)}%</span></label><button className="context-command danger" title="מחק את התמונה" onClick={onImageDelete}>מחק תמונה</button></>}
      {frame && <><div className="context-text-controls" aria-label="מאפייני טקסט"><select title="גופן" value={char.fontFamily} onChange={(event) => onCharStyle?.({ fontFamily: event.target.value })}>{(FONT_CHOICES.includes(char.fontFamily) ? FONT_CHOICES : [char.fontFamily, ...FONT_CHOICES]).map((name) => <option key={name}>{name}</option>)}</select><label className="context-field" title="גודל גופן"><input type="number" min="1" max="999" value={char.fontSize} onChange={(event) => onCharStyle?.({ fontSize: Number(event.target.value) })} />pt</label><button className={'context-command' + (char.weight >= 600 ? ' active' : '')} title="מודגש" onClick={() => onCharStyle?.({ weight: char.weight >= 600 ? 400 : 700 })}>B</button><button className={'context-command' + (char.italic ? ' active' : '')} title="נטוי" onClick={() => onCharStyle?.({ italic: !char.italic })}>I</button><label className="context-field" title="ריווח בין אותיות"><span>Tracking</span><input type="number" step="1" value={char.tracking} onChange={(event) => onCharStyle?.({ tracking: Number(event.target.value) })} /></label><div className="context-align-buttons" role="group" aria-label="יישור">{ALIGNS.map((a) => <button key={a.id} data-tooltip={a.label} title={a.label} className={frame.align === a.id ? 'active' : ''} onClick={() => onAlign?.(a.id)}><svg viewBox="0 0 24 24"><path d={a.icon} /></svg></button>)}</div><label className="context-field" title="מרווח בין שורות"><span>Leading</span><input type="number" min="1" value={frame.leading ?? Math.round(frame.fontSize * 1.25)} onChange={(event) => onLeading?.(Number(event.target.value))} />pt</label></div><div className="context-paragraph-controls" aria-label="מאפייני פסקה"><label title="רווח לפני">לפני<input type="number" value={frame.spaceBefore ?? 0} onChange={(event) => onParagraphSpacing?.({ spaceBefore: Number(event.target.value) })} /></label><label title="רווח אחרי">אחרי<input type="number" value={frame.spaceAfter ?? 0} onChange={(event) => onParagraphSpacing?.({ spaceAfter: Number(event.target.value) })} /></label><label title="הזחה מימין">ימין<input type="number" value={frame.indentRight ?? 0} onChange={(event) => onParagraphStyle?.({ indentRight: Number(event.target.value) })} /></label><label title="הזחה משמאל">שמאל<input type="number" value={frame.indentLeft ?? 0} onChange={(event) => onParagraphStyle?.({ indentLeft: Number(event.target.value) })} /></label><label title="הזחת שורה ראשונה">ראשונה<input type="number" value={frame.firstLineIndent ?? 0} onChange={(event) => onParagraphStyle?.({ firstLineIndent: Number(event.target.value) })} /></label><label title="הזחת שורה שנייה">שנייה<input type="number" value={frame.secondLineIndent ?? 0} onChange={(event) => onParagraphStyle?.({ secondLineIndent: Number(event.target.value) })} /></label></div></>}
      {(tool === 'pen' || tool === 'pencil' || tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'polygon' || !!shape) && (
        <label className="context-field">
          <span>עובי קו</span>
          <input type="number" min="0" max="200" step="0.25" value={shape?.strokeWidth ?? strokeWidth} onChange={(event) => onStrokeWidth(Number(event.target.value))} />
          <span>pt</span>
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
