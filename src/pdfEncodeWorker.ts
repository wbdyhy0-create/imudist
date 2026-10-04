/// <reference lib="webworker" />
/**
 * Encodes a drawn PDF page as a PNG asset, off the main thread (see importPdf.ts): the bitmap it is sent is turned into
 * PNG bytes, which come back as the data: URL the file keeps and the hash that names the asset. Many of these run at
 * once, one page each - the PNG encoder is the slowest part of importing a PDF, and it is the part that parallelizes.
 */
import { hashId } from './assetHash'

export interface EncodeRequest {
  id: number
  bitmap?: ImageBitmap
}
export type EncodeReply = { id: number; ready: true } | { id: number; dataUrl: string; assetId: string; width: number; height: number } | { id: number; error: string }

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { id, bitmap } = event.data
  // a message without a picture is only a check that this worker started
  if (!bitmap) return void self.postMessage({ id, ready: true } satisfies EncodeReply)
  try {
    const { width, height } = bitmap
    const canvas = new OffscreenCanvas(width, height)
    // the picture changes hands without a copy
    canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const [dataUrl, assetId] = await Promise.all([blobDataUrl(blob), blob.arrayBuffer().then(hashId)])
    self.postMessage({ id, dataUrl, assetId, width, height } satisfies EncodeReply)
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies EncodeReply)
  }
}
