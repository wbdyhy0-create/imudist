import { describe, expect, it } from 'vitest'
import { splitPathVerticesAt } from './shapes'

describe('scissors path splitting', () => {
  it('opens a closed ring at an anchor and keeps the closing edge in the open path', () => {
    const ring = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(ring, 3, true)).toEqual([['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']])
  })

  it('splits an open path at an interior anchor without smoothing or dropping either segment', () => {
    const path = ['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(path, 3, false)).toEqual([
      ['bottom-left', 'top-left', 'top-right', 'bottom-right'],
      ['bottom-right', 'bottom-left'],
    ])
    expect(splitPathVerticesAt(path, 0, false)).toBeNull()
    expect(splitPathVerticesAt(path, path.length - 1, false)).toBeNull()
  })
})
