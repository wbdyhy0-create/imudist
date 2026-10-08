import { describe, expect, it } from 'vitest'
import { clustersOf, firstFamily, isBlankCluster, parseCssColor } from './vectorText'

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
