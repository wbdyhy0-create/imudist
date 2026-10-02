import type { CSSProperties, Ref } from 'react'

export interface ColorSamplerPreview {
  left: number
  top: number
  focusX: number
  focusY: number
  readoutTop: number
  color: string
  pixels: string[]
  source: string
}

export function ColorSamplerLens({ preview, ref }: { preview: ColorSamplerPreview; ref: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="color-sampler-lens" style={{ left: preview.left, top: preview.top, '--sampler-focus-x': `${preview.focusX}px`, '--sampler-focus-y': `${preview.focusY}px`, '--sampler-readout-top': `${preview.readoutTop}px` } as CSSProperties} aria-hidden="true">
      <div className="color-sampler-grid">
        {preview.pixels.map((color, index) => <span key={index} style={{ backgroundColor: color }} />)}
      </div>
      <span className="color-sampler-crosshair" />
      <div className="color-sampler-readout">
        <span className="color-sampler-chip" style={{ backgroundColor: preview.color }} />
        <bdi dir="ltr">{preview.color}</bdi>
      </div>
    </div>
  )
}