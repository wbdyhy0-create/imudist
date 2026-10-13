import { afterEach, describe, expect, it } from 'vitest'
import { directionOf, getLanguage, LANGUAGES, setLanguage, t } from './i18n'
import { ar } from './locales/ar'
import { en } from './locales/en'

afterEach(() => setLanguage('he'))

describe('the language of the interface', () => {
  it('is Hebrew until another is chosen, and Hebrew gives the text of the code as it is', () => {
    expect(getLanguage()).toBe('he')
    expect(t('קובץ')).toBe('קובץ')
    expect(t('טקסט שאין לו תרגום בשום מקום')).toBe('טקסט שאין לו תרגום בשום מקום')
  })

  it('gives the text in the language chosen, and goes back when the language does', () => {
    setLanguage('en')
    expect(getLanguage()).toBe('en')
    expect(t('קובץ')).toBe('File')
    expect(t('שמור בשם…')).toBe('Save as…')
    setLanguage('ar')
    expect(t('קובץ')).toBe('ملف')
    setLanguage('he')
    expect(t('קובץ')).toBe('קובץ')
  })

  it('leaves what a language does not have to the next one: Arabic to English, English to the Hebrew of the code', () => {
    setLanguage('ar')
    expect(en['טקסט על קו']).toBeDefined()
    expect(ar['טקסט על קו']).toBeUndefined()
    expect(t('טקסט על קו')).toBe(en['טקסט על קו'])
    expect(t('משפט שלא תורגם')).toBe('משפט שלא תורגם')
  })

  it('fills the values written as {name}, and leaves a name it was not given', () => {
    expect(t('נבחרו {count} פריטים', { count: 3 })).toBe('נבחרו 3 פריטים')
    expect(t('שלום {name} ו-{other}', { name: 'דנה' })).toBe('שלום דנה ו-{other}')
  })

  it('takes the direction of its writing', () => {
    expect(directionOf('he')).toBe('rtl')
    expect(directionOf('ar')).toBe('rtl')
    expect(directionOf('en')).toBe('ltr')
    setLanguage('en')
    expect(directionOf()).toBe('ltr')
  })

  it('has every language of the picker in a sensible shape', () => {
    expect(LANGUAGES.map((language) => language.id)).toEqual(['he', 'en', 'ar'])
    for (const language of LANGUAGES) expect(language.name.length).toBeGreaterThan(1)
  })

  it('has translations that are never empty and keep the values of their source', () => {
    for (const [name, table] of [['en', en], ['ar', ar]] as const) {
      for (const [source, translation] of Object.entries(table)) {
        expect(translation.trim(), `${name}: ${source}`).not.toBe('')
        const values = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
        expect(values(translation), `${name}: ${source}`).toEqual(values(source))
      }
    }
  })
})
