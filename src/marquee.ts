import html2canvas from 'html2canvas'

export type MarqueeKind = 'rect' | 'ellipse'

export interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
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

export function splitObjectCanvas(source: HTMLCanvasElement, target: ScreenBox, selection: ScreenBox, kind: MarqueeKind) {
  const scaleX = source.width / target.width
  const scaleY = source.height / target.height
  const piece = document.createElement('canvas')
  piece.width = Math.max(1, Math.ceil(selection.width * scaleX))
  piece.height = Math.max(1, Math.ceil(selection.height * scaleY))
  const pieceContext = piece.getContext('2d')!
  pieceContext.drawImage(source, (target.left - selection.left) * scaleX, (target.top - selection.top) * scaleY)
  pieceContext.globalCompositeOperation = 'destination-in'
  addMarqueePath(pieceContext, kind, { left: 0, top: 0, width: selection.width, height: selection.height }, scaleX, scaleY)
  pieceContext.fillStyle = '#fff'
  pieceContext.fill()
  pieceContext.globalCompositeOperation = 'source-over'

  const remainder = document.createElement('canvas')
  remainder.width = source.width
  remainder.height = source.height
  const remainderContext = remainder.getContext('2d')!
  remainderContext.drawImage(source, 0, 0)
  remainderContext.globalCompositeOperation = 'destination-out'
  addMarqueePath(remainderContext, kind, {
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