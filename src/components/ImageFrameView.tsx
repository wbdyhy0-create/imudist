import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Asset, ImageFrame } from '../document'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'

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
  locked?: boolean
  /** part of a selection of several objects: outlined, without handles */
  marked?: boolean
  /** frame edges and handles are non-printing: hidden in Preview mode */
  showEdge: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick?: () => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onRotateDown: (corner: RotateCorner, e: ReactPointerEvent<HTMLDivElement>) => void
}

const OBJECT_FIT = { fill: 'cover', fit: 'contain', stretch: 'fill' } as const

/** A picture in its frame. The picture is drawn by the browser, scaled to the frame according to `image.fit`. */
export function ImageFrameView({ image, asset, zoom, z, tx, ty, selected, locked, marked, showEdge, onPointerDown, onDoubleClick, onHandleDown, onRotateDown }: Props) {
  return (
    <div
      className={'image-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '') + (locked ? ' locked' : '')}
      style={{
        zIndex: z,
        left: tx + image.x * zoom,
        top: ty + image.y * zoom,
        width: image.w * zoom,
        height: image.h * zoom,
        transform: image.rotation || image.flipX || image.flipY ? `${image.rotation ? `rotate(${image.rotation}deg) ` : ''}scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})` : undefined,
        transformOrigin: 'center',
        opacity: image.opacity ?? 1,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {asset ? (
        <img src={asset.dataUrl} alt={asset.name} draggable={false} style={{ objectFit: OBJECT_FIT[image.fit] }} />
      ) : (
        <div className="image-missing">התמונה חסרה</div>
      )}
      {selected && showEdge && HANDLES.map((h) => <div key={h} className={'handle ' + h} onPointerDown={(e) => onHandleDown(h, e)} />)}
      {selected && showEdge && ROTATE_CORNERS.map((c) => <div key={c} className={'rotate-handle ' + c} title="גרור כדי לסובב (Shift: קפיצות של 45°)" onPointerDown={(e) => onRotateDown(c, e)} />)}
    </div>
  )
}
