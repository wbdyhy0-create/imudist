export async function hashId(buffer: ArrayBuffer): Promise<string> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
    return Array.from(digest.subarray(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
}