import { useState } from 'react'
import type { ColorSample, ImageFrame, ShapeFrame } from '../document'
import type { ArrangeOp } from '../stacking'
import { AlignButtons, type AlignOp } from './AlignButtons'
import { ArrangeButtons } from './ArrangeButtons'
import { FillPicker } from './FillPicker'

interface Props {
  count: number
  shapes: ShapeFrame[]
  images: ImageFrame[]
  colorSamples: ColorSample[]
  opacity: number
  opacityMixed: boolean
  onFill: (color: string | null) => void
  onStroke: (color: string | null) => void
  onStrokeWidthStep: (direction: -1 | 1) => void
  onFlipShapes: (axis: 'x' | 'y') => void
  onFit: (fit: ImageFrame['fit']) => void
  onWrap: (wrap: ImageFrame['wrap']) => void
  onFlipImages: (axis: 'x' | 'y') => void
  onMatchImageFrames: () => void
  onArrange: (op: ArrangeOp) => void
  onAlign: (op: AlignOp) => void
  onOpacity: (value: number) => void
}

const sameColor = (a: string | null | undefined, b: string | null | undefined) =>
  a === b || !!a && !!b && a.toLowerCase() === b.toLowerCase()

export function MultiSelectionToolbar({
  count,
  shapes,
  images,
  colorSamples,
  opacity,
  opacityMixed,
  onFill,
  onStroke,
  onStrokeWidthStep,
  onFlipShapes,
  onFit,
  onWrap,
  onFlipImages,
  onMatchImageFrames,
  onArrange,
  onAlign,
  onOpacity,
}: Props) {
  const [openPalette, setOpenPalette] = useState<'fill' | 'stroke' | null>(null)
  const fill = shapes[0]?.fill ?? null
  const stroke = shapes[0]?.stroke ?? null
  const fillMixed = shapes.some((shape) => !sameColor(shape.fill, fill))
  const strokeMixed = shapes.some((shape) => !sameColor(shape.stroke, stroke))
  const strokeWidths = shapes.map((shape) => shape.strokeWidth)
  const strokeWidth = strokeWidths[0] ?? 0
  const strokeWidthMixed = strokeWidths.some((width) => width !== strokeWidth)
  const pureImages = images.length === count
  const firstImage = images[0]
  const sameFit = !!firstImage && images.every((image) => image.fit === firstImage.fit)
  const sameWrap = !!firstImage && images.every((image) => (image.wrap ?? 'none') === (firstImage.wrap ?? 'none'))
  const allFlipX = images.length > 0 && images.every((image) => !!image.flipX)
  const allFlipY = images.length > 0 && images.every((image) => !!image.flipY)

  return (
    <>
      {shapes.length > 0 && (
        <>
          <div className="context-object-colors" role="group" aria-label="צבע מילוי וקו מתאר לצורות">
            <div className="context-swatch-wrap">
              <button
                type="button"
                className="context-color-preview context-fill-preview"
                aria-label="צבע מילוי לצורות"
                aria-expanded={openPalette === 'fill'}
                title={fillMixed ? 'צבע מילוי מעורב — בחר צבע לכל הצורות' : 'צבע מילוי'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpenPalette((current) => current === 'fill' ? null : 'fill')}
              >
                <span className="context-shape-preview context-shape-fill" style={!fillMixed && fill ? { backgroundColor: fill } : undefined} />
              </button>
              {openPalette === 'fill' && <div className="context-swatch-popover"><FillPicker label="צבע מילוי לצורות" value={fillMixed ? null : fill} samples={colorSamples} onChange={(color) => { onFill(color); setOpenPalette(null) }} /></div>}
            </div>
            <div className="context-swatch-wrap context-outline-wrap">
              <button
                type="button"
                className="context-color-preview context-outline-preview"
                aria-label="צבע קו מתאר לצורות"
                aria-expanded={openPalette === 'stroke'}
                title={strokeMixed ? 'צבע קו מתאר מעורב — בחר צבע לכל הצורות' : 'צבע קו מתאר'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpenPalette((current) => current === 'stroke' ? null : 'stroke')}
              >
                <span className="context-shape-preview context-shape-outline" style={{ borderColor: !strokeMixed && stroke ? stroke : '#ffffff', borderWidth: `${Math.min(6, Math.max(1, (strokeWidth || 0.25) * 96 / 72))}px` }} />
              </button>
              {openPalette === 'stroke' && <div className="context-swatch-popover"><FillPicker label="צבע קו מתאר לצורות" value={strokeMixed ? null : stroke} samples={colorSamples} onChange={(color) => { onStroke(color); setOpenPalette(null) }} /></div>}
            </div>
            <div className="context-outline-stepper" role="group" aria-label="עובי קו מתאר">
              <span>{strokeWidthMixed ? '—' : Number(strokeWidth.toFixed(2))}</span>
              <button type="button" aria-label="הגדל עובי קו מתאר" title="הגדל עובי קו מתאר" onMouseDown={(event) => event.preventDefault()} onClick={() => onStrokeWidthStep(1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="M1 5 4 2 7 5" /></svg></button>
              <button type="button" aria-label="הקטן עובי קו מתאר" title="הקטן עובי קו מתאר" onMouseDown={(event) => event.preventDefault()} onClick={() => onStrokeWidthStep(-1)}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="m1 2 3 3 3-3" /></svg></button>
            </div>
          </div>
          <div className="context-flip-buttons" role="group" aria-label="היפוך צורות">
            <button className="context-command" title="היפוך אופקי" onClick={() => onFlipShapes('x')}>⇋</button>
            <button className="context-command" title="היפוך אנכי" onClick={() => onFlipShapes('y')}>⇵</button>
          </div>
        </>
      )}
      {pureImages && firstImage && (
        <>
          <div className="context-image-fits" role="group" aria-label="התאמת תמונות">
            {(['fill', 'fit', 'stretch'] as const).map((fit) => <button key={fit} title={fit === 'fill' ? 'מילוי המסגרות בתמונה' : fit === 'fit' ? 'התאמת התמונות בלי חיתוך' : 'מתיחת התמונות למסגרות'} className={sameFit && firstImage.fit === fit ? 'on' : ''} onClick={() => onFit(fit)}>{fit === 'fill' ? 'מילוי' : fit === 'fit' ? 'התאמה' : 'מתיחה'}</button>)}
          </div>
          <div className="context-image-wrap" role="group" aria-label="עטיפת טקסט לתמונות">
            {(['none', 'around', 'jump'] as const).map((wrap) => <button key={wrap} title={wrap === 'none' ? 'ללא עטיפת טקסט' : wrap === 'around' ? 'טקסט מסביב לתמונות' : 'טקסט מעל ומתחת לתמונות'} className={sameWrap && (firstImage.wrap ?? 'none') === wrap ? 'on' : ''} onClick={() => onWrap(wrap)}>{wrap === 'none' ? 'ללא' : wrap === 'around' ? 'מסביב' : 'קפיצה'}</button>)}
          </div>
          <div className="context-flip-buttons" role="group" aria-label="היפוך תמונות">
            <button className={'context-command' + (allFlipX ? ' active' : '')} title="היפוך אופקי" onClick={() => onFlipImages('x')}>⇋</button>
            <button className={'context-command' + (allFlipY ? ' active' : '')} title="היפוך אנכי" onClick={() => onFlipImages('y')}>⇵</button>
          </div>
          <button className="context-command" title="התאם כל מסגרת ליחס התמונה שלה" onClick={onMatchImageFrames}>התאם מסגרות</button>
        </>
      )}
      <ArrangeButtons onArrange={onArrange} compact />
      <AlignButtons onAlign={onAlign} />
      <label className="context-field" title="שקיפות האובייקטים הנבחרים">
        <span>שקיפות</span>
        <input aria-label="שקיפות האובייקטים הנבחרים" type="range" min="0" max="100" value={opacity} onChange={(event) => onOpacity(Number(event.target.value) / 100)} />
        <span>{opacityMixed ? 'מעורב' : `${opacity}%`}</span>
      </label>
    </>
  )
}
