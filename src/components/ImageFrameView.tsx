import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Asset, ImageFrame } from '../document'
import { HANDLES, type HandleId } from '../frames'

interface Props {
  image: ImageFrame
  asset: Asset | undefined
  zoom: number
  /** stacking rank (higher = in front) */
  z: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  selected: boolean
  /** frame edges and handles are non-printing: hidden in Preview mode */
  showEdge: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
}

const OBJECT_FIT = { fill: 'cover', fit: 'contain', stretch: 'fill' } as const

/** A picture in its frame. The picture is drawn by the browser, scaled to the frame according to `image.fit`. */
export function ImageFrameView({ image, asset, zoom, z, tx, ty, selected, showEdge, onPointerDown, onHandleDown }: Props) {
  return (
    <div
      className={'image-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '')}
      style={{ zIndex: z, left: tx + image.x * zoom, top: ty + image.y * zoom, width: image.w * zoom, height: image.h * zoom }}
      onPointerDown={onPointerDown}
    >
      {asset ? (
        <img src={asset.dataUrl} alt={asset.name} draggable={false} style={{ objectFit: OBJECT_FIT[image.fit] }} />
      ) : (
        <div className="image-missing">התמונה חסרה</div>
      )}
      {selected && showEdge && HANDLES.map((h) => <div key={h} className={'handle ' + h} onPointerDown={(e) => onHandleDown(h, e)} />)}
    </div>
  )
}
