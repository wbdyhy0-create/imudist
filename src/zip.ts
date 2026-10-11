/**
 * A small ZIP reader for document importers. It reads the central directory, and refuses what it cannot read safely: an encrypted
 * entry, ZIP64, an entry that unpacks to more than it says (or than is allowed), and an archive with too many entries or too much in it.
 */

/** the most one entry may unpack to */
const MAX_UNPACKED = 80 * 1024 * 1024
/** the most all the entries asked for may unpack to together: they are held in memory, and parsed after that */
const MAX_SELECTED_UNPACKED = 200 * 1024 * 1024
const MAX_ENTRIES = 50_000
const decodeName = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes)

/** `data` inflated; it is stopped as soon as it gives more than `limit` bytes (a small archive that unpacks to gigabytes) */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new Error('file too large')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    result.set(chunk, at)
    at += chunk.byteLength
  }
  return result
}

interface Entry {
  name: string
  method: number
  compressed: number
  unpacked: number
  local: number
}

function directory(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (i >= 0 && view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || offset === 0xffffffff) throw new Error('zip64 archives are not supported')
  if (count > MAX_ENTRIES) throw new Error('too many entries in the archive')
  const entries: Entry[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('corrupt zip')
    const flags = view.getUint16(offset + 8, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > buffer.byteLength) throw new Error('corrupt zip')
    const compressed = view.getUint32(offset + 20, true)
    const unpacked = view.getUint32(offset + 24, true)
    const local = view.getUint32(offset + 42, true)
    if (flags & 1) throw new Error('encrypted zip entries are not supported')
    if (compressed === 0xffffffff || unpacked === 0xffffffff || local === 0xffffffff) throw new Error('zip64 archives are not supported')
    entries.push({ name: decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength)), method: view.getUint16(offset + 10, true), compressed, unpacked, local })
    offset = end
  }
  return { view, bytes, entries }
}

type ZipDirectory = ReturnType<typeof directory>

async function extract(buffer: ArrayBuffer, archive: ZipDirectory, entry: Entry): Promise<Uint8Array> {
  const { view, bytes } = archive
  if (entry.unpacked > MAX_UNPACKED) throw new Error('file too large')
  if (entry.local + 30 > buffer.byteLength || view.getUint32(entry.local, true) !== 0x04034b50) throw new Error('corrupt zip')
  const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true)
  if (start + entry.compressed > buffer.byteLength) throw new Error('corrupt zip')
  const packed = bytes.subarray(start, start + entry.compressed)
  const data = entry.method === 0 ? packed : entry.method === 8 ? await inflateRaw(packed, entry.unpacked) : null
  if (!data || data.byteLength !== entry.unpacked) throw new Error('unsupported or corrupt zip entry')
  return data
}

/** The contents of `name` inside the zip, or null when it is not present. */
export async function unzipEntry(buffer: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const archive = directory(buffer)
  const entry = archive.entries.find((candidate) => candidate.name === name)
  return entry ? extract(buffer, archive, entry) : null
}

/** Extract selected files from an archive, refusing oversized or corrupt entries. */
export async function unzipEntries(buffer: ArrayBuffer, include: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const archive = directory(buffer)
  const selected = archive.entries.filter((entry) => !entry.name.endsWith('/') && include(entry.name))
  const declaredSize = selected.reduce((sum, entry) => sum + entry.unpacked, 0)
  if (declaredSize > MAX_SELECTED_UNPACKED) throw new Error('archive contents are too large')
  const result = new Map<string, Uint8Array>()
  for (const entry of selected) result.set(entry.name, await extract(buffer, archive, entry))
  return result
}
