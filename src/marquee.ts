import html2canvas from 'html2canvas'

export type MarqueeKind = 'rect' | 'ellipse'

export interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
}

export interface MarqueeDragPosition {
  x0: number
  y0: number
  x1: number
  y1: number
  clientX0: number
  clientY0: number
  clientX1: number
  clientY1: number
}

export function translateMarqueeDrag<T extends MarqueeDragPosition>(
  gesture: T,
  worldDelta: { x: number; y: number },
  clientDelta: { x: number; y: number },
): T {
  return {
    ...gesture,
    x0: gesture.x0 + worldDelta.x,
    y0: gesture.y0 + worldDelta.y,
    x1: gesture.x1 + worldDelta.x,
    y1: gesture.y1 + worldDelta.y,
    clientX0: gesture.clientX0 + clientDelta.x,
    clientY0: gesture.clientY0 + clientDelta.y,
    clientX1: gesture.clientX1 + clientDelta.x,
    clientY1: gesture.clientY1 + clientDelta.y,
  }
}

export interface CaptureItem {
  element: HTMLElement
  bounds: ScreenBox
  z: number
  imageSource?: string
}

const CAPTURE_CONTROLS = '.handle, .rotate-handle, .port, .link-badge, .corner-handle, .edge-handle, .point-handle, .direction-handle, .content-handle, .direct-move-handle, .curve-handle-lines, .footnote-width-handle, .footnote-resize-handle'

function cleanCaptureClone(clone: HTMLElement) {
  clone.classList.remove('selected', 'edge', 'marked', 'locked')
  clone.querySelectorAll('.selected, .edge, .marked, .locked, ' + CAPTURE_CONTROLS).forEach((control) => {
    control.classList.remove('selected', 'edge', 'marked', 'locked')
    if (control.matches(CAPTURE_CONTROLS)) control.remove()
  })
}

export async function captureElementRegion(element: HTMLElement, source: ScreenBox, region: ScreenBox, scale: number): Promise<HTMLCanvasElement> {
  if (region.width <= 0 || region.height <= 0) throw new Error('cannot capture an empty region')
  const captureScale = Math.min(
    Math.max(1, scale),
    12000 / region.width,
    12000 / region.height,
    Math.sqrt(40_000_000 / (region.width * region.height)),
  )
  const wrapper = document.createElement('div')
  wrapper.className = 'viewport preview'
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${region.width}px`,
    height: `${region.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    background: '#fff',
  })
  const clone = element.cloneNode(true) as HTMLElement
  cleanCaptureClone(clone)
  clone.querySelectorAll('.group-selection, .page-frame, .text-frame-draft, .marquee-selection-preview, .guide, .page-shadow').forEach((control) => control.remove())
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${source.left - region.left}px`,
    top: `${source.top - region.top}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
    clipPath: 'none',
    margin: '0',
    pointerEvents: 'none',
  })
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)
  try {
    await document.fonts?.ready
    return await html2canvas(wrapper, {
      backgroundColor: '#fff',
      scale: captureScale,
      width: region.width,
      height: region.height,
      logging: false,
    })
  } finally {
    wrapper.remove()
  }
}

export async function captureObjects(items: CaptureItem[], bounds: ScreenBox, scale: number): Promise<HTMLCanvasElement> {
  if (items.length === 0 || bounds.width <= 0 || bounds.height <= 0) throw new Error('cannot capture an empty object selection')
  const captureScale = Math.min(
    Math.max(1, scale),
    12000 / bounds.width,
    12000 / bounds.height,
    Math.sqrt(40_000_000 / (bounds.width * bounds.height)),
  )
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    direction: 'ltr',
  })
  for (const item of items) {
    const clone = item.element.cloneNode(true) as HTMLElement
    cleanCaptureClone(clone)
    const width = item.element.offsetWidth || item.bounds.width
    const height = item.element.offsetHeight || item.bounds.height
    Object.assign(clone.style, {
      position: 'absolute',
      left: `${item.bounds.left - bounds.left + (item.bounds.width - width) / 2}px`,
      top: `${item.bounds.top - bounds.top + (item.bounds.height - height) / 2}px`,
      zIndex: `${item.z}`,
      margin: '0',
      pointerEvents: 'none',
    })
    if (item.imageSource) {
      const image = clone.querySelector('img')
      if (image) {
        image.src = item.imageSource
        image.style.visibility = 'visible'
      }
    }
    wrapper.appendChild(clone)
  }
  document.body.appendChild(wrapper)
  try {
    await document.fonts?.ready
    return await html2canvas(wrapper, {
      backgroundColor: null,
      scale: captureScale,
      width: bounds.width,
      height: bounds.height,
      logging: false,
    })
  } finally {
    wrapper.remove()
  }
}

export function clipCanvasToBoxes(source: HTMLCanvasElement, sourceBounds: ScreenBox, boxes: ScreenBox[]): HTMLCanvasElement {
  const intersections = boxes.flatMap((box) => {
    const left = Math.max(sourceBounds.left, box.left)
    const top = Math.max(sourceBounds.top, box.top)
    const right = Math.min(sourceBounds.left + sourceBounds.width, box.left + box.width)
    const bottom = Math.min(sourceBounds.top + sourceBounds.height, box.top + box.height)
    return right > left && bottom > top ? [{ left, top, width: right - left, height: bottom - top }] : []
  })
  if (intersections.length === 0) throw new Error('the selection does not intersect the page canvas')

  const left = Math.min(...intersections.map((box) => box.left))
  const top = Math.min(...intersections.map((box) => box.top))
  const right = Math.max(...intersections.map((box) => box.left + box.width))
  const bottom = Math.max(...intersections.map((box) => box.top + box.height))
  const width = right - left
  const height = bottom - top
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.ceil((width / sourceBounds.width) * source.width))
  output.height = Math.max(1, Math.ceil((height / sourceBounds.height) * source.height))
  const context = output.getContext('2d')
  if (!context) throw new Error('canvas context unavailable')

  context.drawImage(
    source,
    ((left - sourceBounds.left) / sourceBounds.width) * source.width,
    ((top - sourceBounds.top) / sourceBounds.height) * source.height,
    (width / sourceBounds.width) * source.width,
    (height / sourceBounds.height) * source.height,
    0,
    0,
    output.width,
    output.height,
  )
  context.beginPath()
  for (const box of intersections) {
    context.rect(
      ((box.left - left) / width) * output.width,
      ((box.top - top) / height) * output.height,
      (box.width / width) * output.width,
      (box.height / height) * output.height,
    )
  }
  context.globalCompositeOperation = 'destination-in'
  context.fillStyle = '#fff'
  context.fill()
  context.globalCompositeOperation = 'source-over'
  return output
}

export async function captureObject(element: HTMLElement, bounds: ScreenBox, zoom: number): Promise<HTMLCanvasElement> {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  const clone = element.cloneNode(true) as HTMLElement
  clone.classList.remove('selected', 'edge', 'marked', 'locked')
  clone.querySelectorAll('.handle, .rotate-handle, .port').forEach((control) => control.remove())
  const width = element.offsetWidth || bounds.width
  const height = element.offsetHeight || bounds.height
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${(bounds.width - width) / 2}px`,
    top: `${(bounds.height - height) / 2}px`,
    zIndex: '0',
    margin: '0',
    pointerEvents: 'none',
  })
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)
  try {
    await document.fonts?.ready
    return await html2canvas(wrapper, {
      backgroundColor: null,
      scale: Math.max(1, Math.min(3, 1 / zoom)),
      width: bounds.width,
      height: bounds.height,
      logging: false,
    })
  } finally {
    wrapper.remove()
  }
}

function addMarqueePath(ctx: CanvasRenderingContext2D, kind: MarqueeKind, box: ScreenBox, scaleX: number, scaleY: number) {
  const x = box.left * scaleX
  const y = box.top * scaleY
  const width = box.width * scaleX
  const height = box.height * scaleY
  ctx.beginPath()
  if (kind === 'ellipse') ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  else ctx.rect(x, y, width, height)
}

function addOutlinePath(ctx: CanvasRenderingContext2D, outline: { x: number; y: number }[], originLeft: number, originTop: number, scaleX: number, scaleY: number) {
  ctx.beginPath()
  outline.forEach((point, index) => {
    const x = (point.x - originLeft) * scaleX
    const y = (point.y - originTop) * scaleY
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

/** `outline` (screen points) replaces the rectangle or ellipse of `selection`: the piece is what lies inside the line it draws */
export function splitObjectCanvas(source: HTMLCanvasElement, target: ScreenBox, selection: ScreenBox, kind: MarqueeKind, outline?: { x: number; y: number }[]) {
  const scaleX = source.width / target.width
  const scaleY = source.height / target.height
  const piece = document.createElement('canvas')
  piece.width = Math.max(1, Math.ceil(selection.width * scaleX))
  piece.height = Math.max(1, Math.ceil(selection.height * scaleY))
  const pieceContext = piece.getContext('2d')!
  pieceContext.drawImage(source, (target.left - selection.left) * scaleX, (target.top - selection.top) * scaleY)
  pieceContext.globalCompositeOperation = 'destination-in'
  if (outline) addOutlinePath(pieceContext, outline, selection.left, selection.top, scaleX, scaleY)
  else addMarqueePath(pieceContext, kind, { left: 0, top: 0, width: selection.width, height: selection.height }, scaleX, scaleY)
  pieceContext.fillStyle = '#fff'
  pieceContext.fill()
  pieceContext.globalCompositeOperation = 'source-over'

  const remainder = document.createElement('canvas')
  remainder.width = source.width
  remainder.height = source.height
  const remainderContext = remainder.getContext('2d')!
  remainderContext.drawImage(source, 0, 0)
  remainderContext.globalCompositeOperation = 'destination-out'
  if (outline) addOutlinePath(remainderContext, outline, target.left, target.top, scaleX, scaleY)
  else addMarqueePath(remainderContext, kind, {
    left: selection.left - target.left,
    top: selection.top - target.top,
    width: selection.width,
    height: selection.height,
  }, scaleX, scaleY)
  remainderContext.fillStyle = '#000'
  remainderContext.fill()
  remainderContext.globalCompositeOperation = 'source-over'
  return { remainder, piece }
}

export function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d')
  if (!context) return false
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  const stride = 4 * Math.max(1, Math.floor((width * height) / 250_000))
  for (let index = 3; index < data.length; index += stride) if (data[index] > 0) return true
  return false
}

export function trimTransparentBounds(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; left: number; top: number } | null {
  const context = canvas.getContext('2d')
  if (!context) return null
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) return null
  const trimmed = document.createElement('canvas')
  trimmed.width = right - left + 1
  trimmed.height = bottom - top + 1
  trimmed.getContext('2d')?.drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height)
  return { canvas: trimmed, left, top }
}

export function bridgeTransparentSeams(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  const repaired = new Uint8ClampedArray(data)
  const bridge = (before: number, after: number, between: number[]) => {
    if (between.length === 0 || between.length > 2 || data[before + 3] < 240 || data[after + 3] < 240) return
    for (let index = 0; index < between.length; index++) {
      const t = (index + 1) / (between.length + 1)
      const pixel = between[index]
      for (let channel = 0; channel < 3; channel++) repaired[pixel + channel] = data[before + channel] * (1 - t) + data[after + channel] * t
      repaired[pixel + 3] = 255
    }
  }
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const start = x
      while (x < width && data[(y * width + x) * 4 + 3] < 16) x++
      if (x > start && start > 0 && x < width) bridge((y * width + start - 1) * 4, (y * width + x) * 4, Array.from({ length: x - start }, (_, i) => (y * width + start + i) * 4))
      if (x === start) x++
    }
  }
  for (let x = 0; x < width; x++) {
    let y = 0
    while (y < height) {
      const start = y
      while (y < height && data[(y * width + x) * 4 + 3] < 16) y++
      if (y > start && start > 0 && y < height) bridge(((start - 1) * width + x) * 4, (y * width + x) * 4, Array.from({ length: y - start }, (_, i) => ((start + i) * width + x) * 4))
      if (y === start) y++
    }
  }
  context.putImageData(new ImageData(repaired, width, height), 0, 0)
}

export function canvasDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png')
}