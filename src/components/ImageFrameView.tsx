import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Asset, GradientFeather, ImageFrame } from '../document'
import { featherCss } from '../feather'
import { dropShadowFilter } from '../shadow'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { useDisplaySrc } from '../imageProxy'
import { useLinkStatus } from '../imageLinks'

interface Props {
  image: ImageFrame
  featherOverride?: GradientFeather
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
export function ImageFrameView({ image, featherOverride, asset, zoom, z, tx, ty, selected, locked, marked, showEdge, onPointerDown, onDoubleClick, onHandleDown, onRotateDown }: Props) {
  const linkState = useLinkStatus(asset?.link)
  // a big picture (a 300-DPI page from a PDF) is drawn from a smaller copy while it is shown small - see imageProxy.ts
  const aspect = asset && asset.height > 0 ? asset.width / asset.height : 1
  const neededPx = Math.ceil(Math.max(image.w, image.h * aspect) * zoom * (window.devicePixelRatio || 1))
  const src = useDisplaySrc(image.assetId, asset, neededPx)
  return (
    <div
      className={'image-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '') + (locked ? ' locked' : '')}
      data-object-id={image.id}
      data-object-kind="image"
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
        <img
          src={src}
          alt={asset.name}
          draggable={false}
          style={{
            // the copy of a big picture is a moment away the first time: nothing (not the alt text) shows until then
            visibility: src ? undefined : 'hidden',
            objectFit: OBJECT_FIT[image.fit],
            filter: dropShadowFilter(image.shadowOffsetX, image.shadowOffsetY ?? image.shadowOffset, image.shadowOpacity, zoom, image.shadowColor),
            ...((featherOverride ?? image.feather) ? { maskImage: featherCss(featherOverride ?? image.feather!, image.w * zoom, image.h * zoom), WebkitMaskImage: featherCss(featherOverride ?? image.feather!, image.w * zoom, image.h * zoom) } : {}),
          }}
        />
      ) : (
        <div className="image-missing">התמונה חסרה</div>
      )}
      {linkState && showEdge && (
        <span className={'link-badge ' + linkState} title={linkState === 'ok' ? `מקושר: ${asset?.link?.path}` : linkState === 'modified' ? 'הקובץ המקושר השתנה בדיסק — עדכן אותו בלוח הקישורים' : 'הקובץ המקושר חסר — קשר מחדש בלוח הקישורים'}>
          {linkState === 'ok' ? '🔗' : linkState === 'modified' ? '⚠' : '?'}
        </span>
      )}
      {selected && showEdge && HANDLES.map((h) => <div key={h} className={'handle ' + h} onPointerDown={(e) => onHandleDown(h, e)} />)}
      {selected && showEdge && ROTATE_CORNERS.map((c) => <div key={c} className={'rotate-handle ' + c} title="גרור כדי לסובב (Shift: קפיצות של 45°)" onPointerDown={(e) => onRotateDown(c, e)} />)}
    </div>
  )
}
