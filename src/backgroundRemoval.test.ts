import { describe, expect, it } from 'vitest'
import { makeInputTensorData, stableSigmoid } from './backgroundRemovalMath'

describe('background-removal model input', () => {
  it('converts RGBA pixels to normalized RGB planes', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      128, 128, 128, 255,
    ])
    const data = makeInputTensorData(pixels, 2)

    expect(data).toHaveLength(12)
    expect(data[0]).toBeCloseTo((1 - 0.485) / 0.229)
    expect(data[5]).toBeCloseTo((1 - 0.456) / 0.224)
    expect(data[10]).toBeCloseTo((1 - 0.406) / 0.225)
  })

  it('converts model logits to stable alpha values', () => {
    expect(stableSigmoid(0)).toBe(0.5)
    expect(stableSigmoid(1000)).toBe(1)
    expect(stableSigmoid(-1000)).toBe(0)
  })
})
