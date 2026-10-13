/** Whether the program runs on a Mac (the shortcuts are then named with the Mac's own keys). */
export const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '') && !/iphone|ipad|ipod/i.test(navigator.userAgent || '')

/**
 * `text` with the names of the Windows keys in it put as the Mac names them: Ctrl is ⌘, Alt is ⌥, Shift+ is ⇧ (a Shift
 * alone, as in "hold Shift", stays as the word). Unchanged where the program does not run on a Mac.
 */
export function macKeys(text: string, mac: boolean = isMac): string {
  if (!mac || !/Ctrl|Alt|Shift\+/.test(text)) return text
  return text
    .replace(/\bCtrl\b\+?/g, '⌘')
    .replace(/\bAlt\b\+?/g, '⌥')
    .replace(/\bShift\+/g, '⇧')
}
