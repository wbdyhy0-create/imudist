const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export function makeInputTensorData(pixels: Uint8ClampedArray, size: number) {
  const planeSize = size * size
  const data = new Float32Array(planeSize * 3)
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const offset = pixel * 4
    data[pixel] = (pixels[offset] / 255 - MEAN[0]) / STD[0]
    data[planeSize + pixel] = (pixels[offset + 1] / 255 - MEAN[1]) / STD[1]
    data[planeSize * 2 + pixel] = (pixels[offset + 2] / 255 - MEAN[2]) / STD[2]
  }
  return data
}

export function stableSigmoid(value: number) {
  if (value >= 0) return 1 / (1 + Math.exp(-value))
  const exp = Math.exp(value)
  return exp / (1 + exp)
}
