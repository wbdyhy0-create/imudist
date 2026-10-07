import { isTauri } from './fileio'

export async function deliverPng(canvas: HTMLCanvasElement, fileBaseName: string): Promise<boolean> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png')
  })
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: `${fileBaseName}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] })
    if (!path) return false
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return true
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileBaseName}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
