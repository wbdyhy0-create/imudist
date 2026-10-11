/** Builds ZIP archives for tests (not used by the program). */

export interface ZipEntrySpec {
  name: string
  data: Uint8Array | string
  /** deflate the data (otherwise it is stored) */
  deflate?: boolean
  /** the unpacked size the headers say (a lie, for the tests of a wrong one) */
  declaredUnpacked?: number
  /** general purpose bit flags (1 = encrypted) */
  flags?: number
}

export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function buildZip(entries: ZipEntrySpec[]): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const raw = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const packed = entry.deflate ? await deflateRaw(raw) : raw
    const method = entry.deflate ? 8 : 0
    const unpacked = entry.declaredUnpacked ?? raw.length
    const flags = entry.flags ?? 0
    const local = new Uint8Array(30 + name.length + packed.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, packed.length, true)
    lv.setUint32(22, unpacked, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(packed, 30 + name.length)
    locals.push(local)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, packed.length, true)
    cv.setUint32(24, unpacked, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true)
  const whole = new Uint8Array(offset + directorySize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    whole.set(part, at)
    at += part.length
  }
  return whole.buffer
}
