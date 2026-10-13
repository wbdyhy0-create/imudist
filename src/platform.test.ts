import { describe, expect, it } from 'vitest'
import { macKeys } from './platform'

describe('the names of the keys on a Mac', () => {
  it('puts the Mac keys for the Windows ones', () => {
    expect(macKeys('Ctrl+X', true)).toBe('⌘X')
    expect(macKeys('Ctrl+Shift+Z', true)).toBe('⌘⇧Z')
    expect(macKeys('Ctrl+Alt+Shift+K', true)).toBe('⌘⌥⇧K')
    expect(macKeys('לחצו Alt+גרירה כדי להוציא ידיות', true)).toBe('לחצו ⌥גרירה כדי להוציא ידיות')
  })

  it('leaves a word alone that is not a key, and a Shift that is held, not pressed with a letter', () => {
    expect(macKeys('Control panel', true)).toBe('Control panel')
    expect(macKeys('Shift: קפיצות של 45°', true)).toBe('Shift: קפיצות של 45°')
  })

  it('changes nothing off a Mac', () => {
    expect(macKeys('Ctrl+Shift+Z', false)).toBe('Ctrl+Shift+Z')
  })
})
