import { describe, expect, it, vi } from 'vitest'
import { RUNNING_HEADER_MARKER, type TextFrame } from './document'
vi.mock('./fileio', () => ({ isTauri: false }))
import { resolvePdfRunningHeader } from './pdfExport'

const textFrame = (id: string, y: number, text: string): TextFrame => ({
  id,
  x: 20,
  y,
  w: 300,
  h: 60,
  text,
  runs: [],
  next: null,
  fontFamily: 'Arial',
  fontSize: 12,
  weight: 400,
  italic: false,
  tracking: 0,
  align: 'right',
  color: '#000000',
})

describe('PDF export running headers', () => {
  it('resolves the marker to the matching page title', () => {
    const header = { ...textFrame('header', 20, RUNNING_HEADER_MARKER), runningHeaderStyleId: 'chapter-title' }
    const lookup = vi.fn((page: number, styleId: string) => page === 0 && styleId === 'chapter-title' ? 'עץ החיים' : '')
    const resolved = resolvePdfRunningHeader(header, 0, lookup)

    expect(resolved.text).toBe('עץ החיים')
    expect(lookup).toHaveBeenCalledWith(0, 'chapter-title', 'last')
  })
})
