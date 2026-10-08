import type { jsPDF } from 'jspdf'

/**
 * A page drawn in RGB (as the screen has it) written into the PDF in CMYK (as a printing press has it).
 *
 * This is a plain conversion of the numbers, with no colour profile: black and every grey become black ink only (so black text
 * is not four inks that have to meet exactly), the rest is split into cyan, magenta, yellow and the black that is under them.
 * A shop that needs the colours matched to a press profile still has to convert them with its own.
 */

/**
 * Pixels of RGB(A), 4 numbers each, as pixels of CMYK, 4 bytes each (255 = full ink). `invert` writes 255 - ink instead, which is how
 * jsPDF writes a CMYK image: it states the image's values reversed (Decode [1 0 ...]).
 */
export function rgbaToCmyk(rgba: ArrayLike<number>, invert = false): Uint8Array {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    let r = rgba[i]
    let g = rgba[i + 1]
    let b = rgba[i + 2]
    const alpha = rgba[i + 3]
    if (alpha < 255) {
      // a see-through pixel lies on white paper
      r = (r * alpha + 255 * (255 - alpha)) / 255
      g = (g * alpha + 255 * (255 - alpha)) / 255
      b = (b * alpha + 255 * (255 - alpha)) / 255
    }
    const max = Math.max(r, g, b)
    let c = 0
    let m = 0
    let y = 0
    if (max > 0) {
      c = ((max - r) * 255) / max
      m = ((max - g) * 255) / max
      y = ((max - b) * 255) / max
    }
    const k = 255 - max
    out[i] = invert ? 255 - Math.round(c) : Math.round(c)
    out[i + 1] = invert ? 255 - Math.round(m) : Math.round(m)
    out[i + 2] = invert ? 255 - Math.round(y) : Math.round(y)
    out[i + 3] = invert ? 255 - Math.round(k) : Math.round(k)
  }
  return out
}

/** zlib-compressed, which is what a PDF's FlateDecode reads */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** bytes as a "binary string" (one character per byte), the form jsPDF keeps image data in */
function binaryString(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[])
  return text
}

let pictureCount = 0

/** Puts the canvas on the current page of the PDF as a CMYK picture. Gives back about how many bytes it takes in the file. */
export async function addCmykPicture(pdf: jsPDF, canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): Promise<number> {
  const { width, height } = canvas
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas has no 2d context')
  const packed = await deflate(rgbaToCmyk(context.getImageData(0, 0, width, height).data, true) as Uint8Array<ArrayBuffer>)
  const data = binaryString(packed)
  // jsPDF has no CMYK picture of its own to add (only a CMYK JPEG): its raw-pixels step is taken over, for this one picture, to give
  // it the finished CMYK data instead
  const host = pdf as unknown as { processRGBA?: (image: unknown, index: number, alias: string) => unknown }
  host.processRGBA = (_image, index, alias) => ({ data, index, alias, colorSpace: 'DeviceCMYK', bitsPerComponent: 8, width, height, filter: 'FlateDecode' })
  try {
    pdf.addImage({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData, 'RGBA', x, y, w, h, `imudist-cmyk-${++pictureCount}`, 'NONE')
  } finally {
    delete host.processRGBA
  }
  return packed.length
}
