import { describe, expect, it } from 'vitest'
import { buildZip } from './testZip'
import { unzipEntries, unzipEntry } from './zip'

const text = (bytes: Uint8Array | null | undefined) => (bytes ? new TextDecoder().decode(bytes) : null)

describe('reading a zip', () => {
  it('gives the stored and the deflated entries back as they were', async () => {
    const zip = await buildZip([
      { name: 'a.txt', data: 'stored text' },
      { name: 'folder/b.txt', data: 'deflated text '.repeat(200), deflate: true },
    ])
    expect(text(await unzipEntry(zip, 'a.txt'))).toBe('stored text')
    expect(text(await unzipEntry(zip, 'folder/b.txt'))).toBe('deflated text '.repeat(200))
    expect(await unzipEntry(zip, 'missing.txt')).toBeNull()
  })

  it('gives the entries asked for, and leaves out the folders and the others', async () => {
    const zip = await buildZip([
      { name: 'Stories/', data: '' },
      { name: 'Stories/one.xml', data: '<a/>' },
      { name: 'Links/skip.bin', data: 'x' },
    ])
    const found = await unzipEntries(zip, (name) => name.startsWith('Stories/'))
    expect([...found.keys()]).toEqual(['Stories/one.xml'])
  })

  it('stops an entry that unpacks to more than its header says, without keeping what it gave', async () => {
    const big = new Uint8Array(4 * 1024 * 1024)
    const zip = await buildZip([{ name: 'bomb.bin', data: big, deflate: true, declaredUnpacked: 1000 }])
    await expect(unzipEntry(zip, 'bomb.bin')).rejects.toThrow(/too large/)
  })

  it('refuses an entry that unpacks to less than its header says', async () => {
    const zip = await buildZip([{ name: 'short.bin', data: 'abc', deflate: true, declaredUnpacked: 40 }])
    await expect(unzipEntry(zip, 'short.bin')).rejects.toThrow(/corrupt/)
  })

  it('refuses an entry that says it is bigger than a file may be', async () => {
    const zip = await buildZip([{ name: 'huge.bin', data: 'x', declaredUnpacked: 300 * 1024 * 1024 }])
    await expect(unzipEntry(zip, 'huge.bin')).rejects.toThrow(/too large/)
  })

  it('refuses an archive whose chosen entries together are too large', async () => {
    const zip = await buildZip(Array.from({ length: 4 }, (_, index) => ({ name: `part${index}.bin`, data: 'x', declaredUnpacked: 70 * 1024 * 1024 })))
    await expect(unzipEntries(zip, () => true)).rejects.toThrow(/too large/)
  })

  it('refuses an encrypted entry', async () => {
    const zip = await buildZip([{ name: 'secret.txt', data: 'x', flags: 1 }])
    await expect(unzipEntry(zip, 'secret.txt')).rejects.toThrow(/encrypted/)
  })

  it('refuses what is not a zip, and a zip with a broken directory', async () => {
    await expect(unzipEntry(new TextEncoder().encode('not a zip at all, not even close').buffer as ArrayBuffer, 'a')).rejects.toThrow(/not a zip/)
    const zip = new Uint8Array(await buildZip([{ name: 'a.txt', data: 'hello' }]))
    // the directory points at nothing
    new DataView(zip.buffer).setUint32(zip.length - 22 + 16, 5, true)
    await expect(unzipEntry(zip.buffer as ArrayBuffer, 'a.txt')).rejects.toThrow(/corrupt/)
  })
})
