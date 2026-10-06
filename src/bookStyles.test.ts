import { describe, expect, it } from 'vitest'
import { planStyleSync, reportCount, syncStyles, type StyleSet } from './bookStyles'
import type { CharacterStyleRecord, ParagraphStyleRecord, TextFrame } from './document'

const para = (id: string, name: string, patch: ParagraphStyleRecord['patch'] = {}, extra: Partial<ParagraphStyleRecord> = {}): ParagraphStyleRecord => ({ id, name, patch, ...extra })
const char = (id: string, name: string, patch: CharacterStyleRecord['patch'] = {}, extra: Partial<CharacterStyleRecord> = {}): CharacterStyleRecord => ({ id, name, patch, ...extra })
const set = (over: Partial<StyleSet> = {}): StyleSet => ({ paragraphStyles: [], characterStyles: [], colorSamples: [], ...over })

const run = (len: number, over: Record<string, unknown> = {}) => ({ len, style: { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, color: '#000000', ...over } })

/** two paragraphs in style `body`, the second with a size picked by hand (10 characters each) */
function frame(): TextFrame {
  return {
    id: 'f1', x: 0, y: 0, w: 400, h: 600, text: 'שלום עולם\nשורה שנייה', fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, color: '#000000', align: 'right',
    runs: [run(10), run(10, { fontSize: 30 })],
    paragraphStyleIds: ['body', 'body'], paragraphStyleNames: ['גוף', 'גוף'], paragraphStylePatches: [{}, {}], next: null,
  } as unknown as TextFrame
}

describe('planStyleSync', () => {
  it('lists what would be added and what would change, by name', () => {
    const master = set({
      paragraphStyles: [para('a', 'גוף', { fontSize: 14 }), para('b', 'כותרת', { fontSize: 24 }), para('c', 'חדש')],
      characterStyles: [char('x', 'הדגשה', { weight: 700 })],
      colorSamples: [{ id: 's1', color: '#ff0000', label: 'אדום' }, { id: 's2', color: '#00ff00', label: 'ירוק' }],
    })
    const target = set({
      paragraphStyles: [para('body', 'גוף', { fontSize: 12 }), para('h', 'כותרת', { fontSize: 24 }), para('only', 'רק כאן')],
      characterStyles: [],
      colorSamples: [{ id: 't1', color: '#FF0000', label: 'red' }],
    })
    expect(planStyleSync(master, target)).toEqual({ addedParagraph: ['חדש'], updatedParagraph: ['גוף'], addedCharacter: ['הדגשה'], updatedCharacter: [], addedColors: ['ירוק'] })
  })

  it('finds nothing to do when the styles already agree', () => {
    const same = set({ paragraphStyles: [para('a', 'גוף', { fontSize: 14 })], characterStyles: [char('x', 'ב', { weight: 700 })] })
    expect(reportCount(planStyleSync(same, { ...same, paragraphStyles: [para('other', 'גוף', { fontSize: 14 })], characterStyles: [char('y', 'ב', { weight: 700 })] }))).toBe(0)
  })
})

describe('syncStyles', () => {
  it('adds the styles and colours the target lacks and takes nothing away', () => {
    const master = set({ paragraphStyles: [para('a', 'חדש', { fontSize: 20 })], characterStyles: [char('x', 'הדגשה', { weight: 700 })], colorSamples: [{ id: 's', color: '#123456', label: 'כחול' }] })
    const target = set({ paragraphStyles: [para('body', 'גוף', { fontSize: 12 })], colorSamples: [{ id: 't', color: '#ffffff', label: 'לבן' }] })
    const result = syncStyles(master, { ...target, frames: [] })
    expect(result.paragraphStyles.map((style) => style.name)).toEqual(['גוף', 'חדש'])
    expect(result.characterStyles.map((style) => style.name)).toEqual(['הדגשה'])
    expect(result.colorSamples.map((sample) => sample.color)).toEqual(['#ffffff', '#123456'])
  })

  it('overwrites a style of the same name, keeps its id, and writes the new look into its paragraphs', () => {
    const master = set({ paragraphStyles: [para('m1', 'גוף', { fontSize: 20, fontFamily: 'Times New Roman', leading: 26, align: 'justify' })] })
    const target = set({ paragraphStyles: [para('body', 'גוף', { fontSize: 12, fontFamily: 'Arial' })] })
    const result = syncStyles(master, { ...target, frames: [frame()] })
    expect(result.paragraphStyles).toHaveLength(1)
    expect(result.paragraphStyles[0]).toMatchObject({ id: 'body', name: 'גוף', patch: { fontSize: 20, fontFamily: 'Times New Roman' } })
    const [out] = result.frames
    // the style's look is written over both paragraphs (a size picked by hand in one of them goes too, as when the style is edited)
    expect(out.runs?.map((r) => [r.len, r.style.fontSize, r.style.fontFamily])).toEqual([[20, 20, 'Times New Roman']])
    expect(out.paragraphStylePatches?.[0]).toMatchObject({ leading: 26, align: 'justify' })
    expect(result.report.updatedParagraph).toEqual(['גוף'])
  })

  it('points the new styles at each other by the ids they get in the target', () => {
    const master = set({
      characterStyles: [char('c1', 'בסיס', { weight: 700 }), char('c2', 'נגזר', { italic: true }, { basedOnId: 'c1' })],
      paragraphStyles: [para('p1', 'ראשי', {}), para('p2', 'משני', {}, { basedOnId: 'p1', nextStyleId: 'p1', nested: [{ styleId: 'c2', unit: 'words', count: 1, inclusive: true }] })],
    })
    const result = syncStyles(master, { ...set({ characterStyles: [char('c1', 'משהו אחר')] }), frames: [] })
    const base = result.characterStyles.find((style) => style.name === 'בסיס')!
    const derived = result.characterStyles.find((style) => style.name === 'נגזר')!
    // 'c1' was taken in the target (by a style of another name), so the master's gets a new id and the link follows it
    expect(base.id).not.toBe('c1')
    expect(derived.basedOnId).toBe(base.id)
    const second = result.paragraphStyles.find((style) => style.name === 'משני')!
    expect(second.basedOnId).toBe(result.paragraphStyles.find((style) => style.name === 'ראשי')!.id)
    expect(second.nested?.[0].styleId).toBe(derived.id)
  })

  it('writes a changed character style into the runs that carry it', () => {
    const f = frame()
    f.runs = [run(10, { weight: 700, charStyleId: 'c1' }), run(10)] as TextFrame['runs']
    const master = set({ characterStyles: [char('m', 'הדגשה', { weight: 900 })] })
    const target = set({ paragraphStyles: [para('body', 'גוף', {})], characterStyles: [char('c1', 'הדגשה', { weight: 700 })] })
    const result = syncStyles(master, { ...target, frames: [f] })
    expect(result.characterStyles).toEqual([{ id: 'c1', name: 'הדגשה', patch: { weight: 900 } }])
    expect(result.frames[0].runs?.[0].style.weight).toBe(900)
    expect(result.frames[0].runs?.[1].style.weight).toBe(400)
  })

  it('changes nothing when the styles already agree', () => {
    const same = set({ paragraphStyles: [para('body', 'גוף', { fontSize: 12 })] })
    const f = frame()
    const result = syncStyles(same, { ...same, frames: [f] })
    expect(result.frames[0]).toBe(f)
    expect(reportCount(result.report)).toBe(0)
  })
})
