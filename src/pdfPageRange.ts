/** Parse comma-separated page numbers and inclusive ranges into sorted, unique, 1-based page numbers. */
export function parsePageRange(value: string, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1 || !value.trim()) return []
  const pages = new Set<number>()
  for (const part of value.split(',')) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim())
    if (!match) return []
    const first = Number(match[1])
    const last = Number(match[2] ?? match[1])
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last) return []
    for (let page = Math.max(1, first), end = Math.min(totalPages, last); page <= end; page++) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}