import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, ParagraphStyleRecord } from './document'
import { canBeBasedOn, descendantsOf, mergeCharacterStyles, ownSettings, remapNestedStyles, repairBasedOn, resolveCharacterPatch, resolvedRecords, withoutCharacterStyle } from './characterStyleTree'
import { applyCharacterStyle, updateCharacterStyleRuns } from './story'

const base: CharacterStyleRecord = { id: 'base', name: 'בסיס', patch: { weight: 700, color: '#ff0000' } }
const child: CharacterStyleRecord = { id: 'child', name: 'בן', basedOnId: 'base', patch: { color: '#0000ff', fontSize: 14 } }
const grandchild: CharacterStyleRecord = { id: 'grand', name: 'נכד', basedOnId: 'child', patch: { italic: true } }
const all = [base, child, grandchild]

describe('what a style comes to', () => {
  it('takes what it does not set from the style it is based on, all the way up', () => {
    expect(resolveCharacterPatch(all, 'base')).toEqual({ weight: 700, color: '#ff0000' })
    expect(resolveCharacterPatch(all, 'child')).toEqual({ weight: 700, color: '#0000ff', fontSize: 14 })
    expect(resolveCharacterPatch(all, 'grand')).toEqual({ weight: 700, color: '#0000ff', fontSize: 14, italic: true })
  })

  it('does not hang on a loop, and a missing base counts as nothing', () => {
    const loop = [{ ...base, basedOnId: 'child' }, child]
    expect(resolveCharacterPatch(loop, 'child')).toEqual({ weight: 700, color: '#0000ff', fontSize: 14 })
    expect(resolveCharacterPatch([{ ...child, basedOnId: 'nobody' }], 'child')).toEqual(child.patch)
    expect(resolveCharacterPatch(all, 'unknown')).toEqual({})
  })

  it('gives the same list back when nothing is based on anything, and resolved styles otherwise', () => {
    const plain = [base, { id: 'x', name: 'x', patch: { italic: true } }]
    expect(resolvedRecords(plain)).toBe(plain)
    expect(resolvedRecords(all).map((record) => record.patch.weight)).toEqual([700, 700, 700])
    expect(resolvedRecords(all)[2].patch).toEqual({ weight: 700, color: '#0000ff', fontSize: 14, italic: true })
  })
})

describe('who depends on whom', () => {
  it('lists the styles below one, directly or not', () => {
    expect(descendantsOf(all, 'base')).toEqual(['child', 'grand'])
    expect(descendantsOf(all, 'child')).toEqual(['grand'])
    expect(descendantsOf(all, 'grand')).toEqual([])
  })

  it('does not let a style be based on itself or on something below it', () => {
    expect(canBeBasedOn(all, 'base', 'base')).toBe(false)
    expect(canBeBasedOn(all, 'base', 'grand')).toBe(false)
    expect(canBeBasedOn(all, 'grand', 'base')).toBe(true)
    expect(canBeBasedOn(all, 'grand', 'nobody')).toBe(false)
  })

  it('repairs a file that has a base that is gone, or a loop', () => {
    const broken = [{ ...base, basedOnId: 'grand' }, child, grandchild, { id: 'orphan', name: 'יתום', basedOnId: 'nobody', patch: {} }]
    const repaired = repairBasedOn(broken)
    expect(repaired.find((r) => r.id === 'orphan')!.basedOnId).toBeUndefined()
    // everything on the loop is cut: no style is left pointing round in a circle
    for (const record of repaired) expect(descendantsOf(repaired, record.id)).not.toContain(record.id)
    expect(repairBasedOn(all)).toEqual(all)
  })
})

describe('deleting a style others are based on', () => {
  it('moves them up to its own base and keeps what they got from it', () => {
    const after = withoutCharacterStyle(all, 'child')
    expect(after.map((r) => r.id)).toEqual(['base', 'grand'])
    const grand = after.find((r) => r.id === 'grand')!
    expect(grand.basedOnId).toBe('base')
    expect(resolveCharacterPatch(after, 'grand')).toEqual(resolveCharacterPatch(all, 'grand'))
  })

  it('frees a child of the first style when that was the root', () => {
    const after = withoutCharacterStyle(all, 'base')
    const kid = after.find((r) => r.id === 'child')!
    expect(kid.basedOnId).toBeUndefined()
    expect(resolveCharacterPatch(after, 'child')).toEqual(resolveCharacterPatch(all, 'child'))
  })
})

describe('what is really a style\'s own', () => {
  it('leaves out a setting that only repeats the base', () => {
    const repeating = { ...child, patch: { weight: 700, color: '#0000ff' } }
    expect(ownSettings([base, repeating], 'child')).toEqual({ color: '#0000ff' })
  })
})

describe('character styles from another document', () => {
  it('are added under new names and ids, with bases following', () => {
    const current: CharacterStyleRecord[] = [{ id: 'base', name: 'בסיס', patch: {} }]
    const { styles, idMap } = mergeCharacterStyles(current, [base, child])
    expect(styles).toHaveLength(3)
    expect(styles.map((s) => s.name)).toEqual(['בסיס', 'בסיס 2', 'בן'])
    const imported = styles.slice(1)
    expect(new Set(styles.map((s) => s.id)).size).toBe(3)
    expect(imported[1].basedOnId).toBe(imported[0].id)
    expect(idMap.get('base')).toBe(imported[0].id)
    expect(mergeCharacterStyles(current, []).styles).toBe(current)
  })

  it('make the nested rules of the paragraph styles that came with them point at the new ids', () => {
    const paragraph: ParagraphStyleRecord[] = [{ id: 'p', name: 'p', patch: {}, nested: [{ styleId: 'base', unit: 'words', count: 1, inclusive: false }, { styleId: 'zzz', unit: 'words', count: 1, inclusive: false }] }, { id: 'q', name: 'q', patch: {} }]
    const out = remapNestedStyles(paragraph, new Map([['base', 'new-base']]))
    expect(out[0].nested!.map((rule) => rule.styleId)).toEqual(['new-base', 'zzz'])
    expect(out[1]).toBe(paragraph[1])
    expect(remapNestedStyles(paragraph, new Map())).toBe(paragraph)
  })
})

describe('text follows a base style that changes', () => {
  const baseLook = { fontFamily: 'Narkisim', fontSize: 12, weight: 400, italic: false, tracking: 0 }

  it('is rewritten for the style and for every style below it', () => {
    const runs0 = [{ len: 10, style: baseLook }]
    const resolved = resolvedRecords(all)
    // text 0-4 has the child, 5-9 the grandchild
    const runs = applyCharacterStyle(applyCharacterStyle(runs0, 0, 5, resolved[1]), 5, 10, resolved[2])
    const nextBase: CharacterStyleRecord = { ...base, patch: { weight: 900, color: '#00ff00' } }
    const nextAll = [nextBase, child, grandchild]
    let next = runs
    for (const id of ['base', ...descendantsOf(all, 'base')]) {
      next = updateCharacterStyleRuns('אבגדהוזחטי', next, id, resolveCharacterPatch(all, id), resolveCharacterPatch(nextAll, id), () => baseLook)
    }
    const at = (offset: number) => {
      let pos = 0
      for (const r of next) {
        pos += r.len
        if (offset < pos) return r.style
      }
      throw new Error('outside')
    }
    expect(at(2)).toMatchObject({ weight: 900, color: '#0000ff', fontSize: 14, charStyleId: 'child' })
    expect(at(7)).toMatchObject({ weight: 900, color: '#0000ff', italic: true, charStyleId: 'grand' })
  })
})
