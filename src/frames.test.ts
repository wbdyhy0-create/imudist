import { describe, expect, it } from 'vitest'
import { dragBoxUniform, styleOf, type Box, type HandleId } from './frames'
import type { TextFrame } from './document'

describe('text frame style', () => {
  it('preserves character colors and effects in the story style', () => {
    const frame: TextFrame = {
      id: 'frame',
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      text: 'א',
      runs: [],
      next: null,
      fontFamily: 'Arial',
      fontSize: 14,
      weight: 400,
      italic: false,
      tracking: 0,
      align: 'right',
      color: '#112233',
      outlineColor: '#0066ff',
      outlineWidth: 1.25,
    }

    expect(styleOf(frame)).toMatchObject({
      color: '#112233',
      outlineColor: '#0066ff',
      outlineWidth: 1.25,
    })
  })
})

describe('uniform text-frame resize', () => {
  const orig: Box = { x: 10, y: 20, w: 100, h: 50 }

  it.each([
    ['n', 0, -10, { x: 0, y: 10, w: 120, h: 60 }],
    ['s', 0, 10, { x: 0, y: 20, w: 120, h: 60 }],
    ['e', 20, 0, { x: 10, y: 15, w: 120, h: 60 }],
    ['w', -20, 0, { x: -10, y: 15, w: 120, h: 60 }],
    ['ne', 20, -10, { x: 10, y: 10, w: 120, h: 60 }],
    ['nw', -20, -10, { x: -10, y: 10, w: 120, h: 60 }],
    ['se', 20, 10, { x: 10, y: 20, w: 120, h: 60 }],
    ['sw', -20, 10, { x: -10, y: 20, w: 120, h: 60 }],
  ] as [HandleId, number, number, Box][])('scales proportionally from the %s handle', (handle, dx, dy, expected) => {
    expect(dragBoxUniform(orig, handle, dx, dy, 6)).toEqual(expected)
  })
})
