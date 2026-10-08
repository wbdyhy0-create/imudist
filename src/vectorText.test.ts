import { describe, expect, it } from 'vitest'
import { clustersOf, countPicture, emptyReport, firstFamily, isBlankCluster, parseCssColor, placeOnPage, PICTURE_REASONS, type FrameGeometry } from './vectorText'

describe('clustersOf', () => {
  it('keeps a letter and its marks together', () => {
    const word = 'בְּרֵאשִׁית'
    const clusters = clustersOf(word).map((cluster) => cluster.text)
    expect(clusters).toHaveLength(6)
    expect(clusters.join('')).toBe(word)
    expect(clusters[0]).toBe('בְּ')
  })

  it('says where each one starts', () => {
    const clusters = clustersOf('אָב ג')
    expect(clusters.map((cluster) => cluster.at)).toEqual([0, 2, 3, 4])
  })

  it('does not split a character that is two code units long', () => {
    expect(clustersOf('a😀b').map((cluster) => cluster.text)).toEqual(['a', '😀', 'b'])
    expect(clustersOf('a😀b').map((cluster) => cluster.at)).toEqual([0, 1, 3])
  })
})

describe('isBlankCluster', () => {
  it('knows what has nothing to draw', () => {
    for (const blank of [' ', '\n', '\t', ' ', '‏', '‎​', '']) expect(isBlankCluster(blank)).toBe(true)
    for (const shown of ['א', 'a', '1', '.', 'אָ']) expect(isBlankCluster(shown)).toBe(false)
  })
})

describe('parseCssColor', () => {
  it('reads the colours the browser reports', () => {
    expect(parseCssColor('rgb(17, 17, 17)')).toEqual([17, 17, 17])
    expect(parseCssColor('rgb(255, 0, 128)')).toEqual([255, 0, 128])
    expect(parseCssColor('rgba(10, 20, 30, 1)')).toEqual([10, 20, 30])
    expect(parseCssColor('rgb(10 20 30 / 100%)')).toEqual([10, 20, 30])
  })

  it('has nothing for a colour that shows the paper through', () => {
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toBeNull()
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toBeNull()
    expect(parseCssColor('transparent')).toBeNull()
    expect(parseCssColor('red')).toBeNull()
  })
})

describe('firstFamily', () => {
  it('takes the first font of the list', () => {
    expect(firstFamily('"Frank Ruehl CLM", "Segoe UI", Arial, sans-serif')).toBe('Frank Ruehl CLM')
    expect(firstFamily("'David', serif")).toBe('David')
    expect(firstFamily('Arial')).toBe('Arial')
  })
})

describe('placeOnPage', () => {
  const frame: FrameGeometry = { x: 100, y: 50, w: 200, h: 80, rotation: 0, scale: 1 }

  it("puts a point of the text at the frame's own place when nothing is turned or scaled", () => {
    expect(placeOnPage(frame, 0, 0)).toEqual({ x: 100, y: 50 })
    expect(placeOnPage(frame, 30, 12)).toEqual({ x: 130, y: 62 })
  })

  it("scales the text about the frame's top-left corner", () => {
    // laid out in half the width and height, shown twice as big
    const scaled = { ...frame, w: 200, h: 80, scale: 2 }
    const corner = placeOnPage({ ...scaled, w: 200, h: 80 }, 0, 0)
    expect(corner.x).toBeCloseTo(100, 9)
    expect(corner.y).toBeCloseTo(50, 9)
    const far = placeOnPage(scaled, 100, 40)
    expect(far.x).toBeCloseTo(300, 9)
    expect(far.y).toBeCloseTo(130, 9)
  })

  it('turns the frame about its centre, clockwise', () => {
    const quarter = { ...frame, rotation: 90 }
    // the top-left corner goes to the top-right, the top-right to the bottom-right (screen y points down)
    const topLeft = placeOnPage(quarter, 0, 0)
    expect(topLeft.x).toBeCloseTo(100 + 100 + 40, 6)
    expect(topLeft.y).toBeCloseTo(50 + 40 - 100, 6)
    const centre = placeOnPage(quarter, 100, 40)
    expect(centre.x).toBeCloseTo(200, 9)
    expect(centre.y).toBeCloseTo(90, 9)
  })

  it('keeps the distance to the centre whatever the turn', () => {
    const turned = { ...frame, rotation: 33 }
    const a = placeOnPage(turned, 10, 5)
    const distance = Math.hypot(a.x - 200, a.y - 90)
    expect(distance).toBeCloseTo(Math.hypot(10 - 100, 5 - 40), 9)
  })
})

describe('the report of an export', () => {
  it('counts the frames that stayed a picture, by reason', () => {
    const report = emptyReport()
    report.text += 3
    countPicture(report, 'marks')
    countPicture(report, 'marks')
    countPicture(report, 'footnotes')
    expect(report).toMatchObject({ text: 3, picture: 3, reasons: { marks: 2, footnotes: 1 } })
  })

  it('has words for every reason', () => {
    for (const reason of Object.keys(PICTURE_REASONS)) expect(PICTURE_REASONS[reason as keyof typeof PICTURE_REASONS].length).toBeGreaterThan(2)
  })
})
