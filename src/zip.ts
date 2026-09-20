/** A minimal ZIP reader (enough for .docx): finds one file by name and inflates it with the browser's own decompressor. */

/** Refuse to inflate anything larger than this (protects against zip bombs). */
const MAX_UNPACKED = 80 * 1024 * 1024

const decodeName = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes)

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The contents of `name` inside the zip, or null if the archive has no such file. Throws if it isn't a zip. */
export async function unzipEntry(buffer: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // the end-of-central-directory record sits at the very end (followed only by an optional comment)
  let eocd = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compressed = view.getUint32(p + 20, true)
    const unpacked = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const local = view.getUint32(p + 42, true)
    const entry = decodeName(bytes.subarray(p + 46, p + 46 + nameLen))

    if (entry === name) {
      if (unpacked > MAX_UNPACKED) throw new Error('file too large')
      if (view.getUint32(local, true) !== 0x04034b50) throw new Error('corrupt zip')
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const data = bytes.subarray(start, start + compressed)
      if (method === 0) return data
      if (method === 8) return inflateRaw(data)
      throw new Error('unsupported compression')
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}
