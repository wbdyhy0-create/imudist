import type { Asset } from './document'
import { MAX_IMAGE_BYTES } from './document'
import { hashId } from './assetHash'
import modelUrl from './assets/birefnet-lite-512.onnx?url'
import { makeInputTensorData, stableSigmoid } from './backgroundRemovalMath'

const MODEL_SIZE = 512

type InferenceSession = import('onnxruntime-web').InferenceSession
type Tensor = import('onnxruntime-web').Tensor

let gpuSession: Promise<InferenceSession> | undefined
let cpuSession: Promise<InferenceSession> | undefined

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('הדפדפן לא הצליח להכין משטח עיבוד לתמונה.')
  return { canvas, context }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('לא ניתן לפתוח את התמונה לעיבוד.'))
    image.src = dataUrl
  })
}

async function createSession(backend: 'webgpu' | 'wasm') {
  const runtime = backend === 'webgpu'
    ? await import('onnxruntime-web/webgpu')
    : await import('onnxruntime-web/wasm')
  return runtime.InferenceSession.create(modelUrl, {
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
  })
}

function getCpuSession() {
  cpuSession ??= createSession('wasm').catch((error: unknown) => {
    cpuSession = undefined
    throw error
  })
  return cpuSession
}

function getGpuSession() {
  gpuSession ??= createSession('webgpu').catch((error: unknown) => {
    gpuSession = undefined
    throw error
  })
  return gpuSession
}

async function runInference(input: Tensor) {
  const run = async (session: InferenceSession) => {
    const outputs = await session.run({ [session.inputNames[0]]: input })
    const output = outputs[session.outputNames[0]]
    if (!output || !(output.data instanceof Float32Array) || output.data.length !== MODEL_SIZE * MODEL_SIZE) {
      throw new Error('המודל החזיר מסיכה בפורמט לא צפוי.')
    }
    return output.data
  }

  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      return await run(await getGpuSession())
    } catch (gpuError) {
      console.warn('Background removal GPU inference failed; falling back to CPU.', gpuError)
    }
  }
  return run(await getCpuSession())
}

function blobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('לא ניתן לקרוא את תמונת ה-PNG שנוצרה.'))
    reader.onerror = () => reject(reader.error ?? new Error('לא ניתן לקרוא את תמונת ה-PNG שנוצרה.'))
    reader.readAsDataURL(blob)
  })
}

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('לא ניתן ליצור קובץ PNG עם רקע שקוף.'))
    }, 'image/png')
  })
}

export async function removeImageBackground(asset: Asset): Promise<{ assetId: string; asset: Asset }> {
  if (asset.mime === 'image/gif') {
    throw new Error('הסרת הרקע מתמונות GIF אינה נתמכת כדי לא לאבד את האנימציה.')
  }
  if (!asset.dataUrl) throw new Error('נתוני התמונה אינם זמינים לעיבוד.')

  const image = await loadImage(asset.dataUrl)
  const { naturalWidth: width, naturalHeight: height } = image
  if (!width || !height) throw new Error('לתמונה אין מידות תקינות.')

  const input = createCanvas(MODEL_SIZE, MODEL_SIZE)
  input.context.fillStyle = '#fff'
  input.context.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  input.context.drawImage(image, 0, 0, MODEL_SIZE, MODEL_SIZE)
  const pixels = input.context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const tensorData = makeInputTensorData(pixels, MODEL_SIZE)
  const runtime = typeof navigator !== 'undefined' && 'gpu' in navigator
    ? await import('onnxruntime-web/webgpu')
    : await import('onnxruntime-web/wasm')
  const maskValues = await runInference(new runtime.Tensor('float32', tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]))

  const mask = createCanvas(MODEL_SIZE, MODEL_SIZE)
  const maskPixels = mask.context.createImageData(MODEL_SIZE, MODEL_SIZE)
  for (let pixel = 0; pixel < maskValues.length; pixel += 1) {
    const offset = pixel * 4
    const alpha = Math.round(stableSigmoid(maskValues[pixel]) * 255)
    maskPixels.data[offset] = 255
    maskPixels.data[offset + 1] = 255
    maskPixels.data[offset + 2] = 255
    maskPixels.data[offset + 3] = alpha
  }
  mask.context.putImageData(maskPixels, 0, 0)

  const output = createCanvas(width, height)
  output.context.drawImage(image, 0, 0, width, height)
  output.context.globalCompositeOperation = 'destination-in'
  output.context.drawImage(mask.canvas, 0, 0, width, height)
  const blob = await toPngBlob(output.canvas)
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('תמונת ה-PNG שנוצרה גדולה מ-50MB. הקטינו את התמונה ונסו שוב.')
  }

  const bytes = await blob.arrayBuffer()
  const baseName = asset.name.replace(/\.[^.]+$/, '') || 'image'
  const result: Asset = {
    name: `${baseName}-רקע-שקוף.png`,
    mime: 'image/png',
    dataUrl: await blobAsDataUrl(blob),
    width,
    height,
  }
  return { assetId: await hashId(bytes), asset: result }
}
