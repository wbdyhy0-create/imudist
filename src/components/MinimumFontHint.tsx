import { useMinimumFontSize } from '../browserFontLimit'
import { t } from '../i18n'

/**
 * Next to a font size field: a mark that says so when the size asked for is under the minimum the browser holds, since the text is
 * then drawn at the minimum (and only the number changes). The notice at the start of the program says it once; this stays.
 */
export function MinimumFontHint({ size }: { size: number | undefined }) {
  const minimum = useMinimumFontSize()
  if (minimum === null || size === undefined || !(size < minimum)) return null
  const text = t('בדפדפן מוגדר גודל גופן מינימלי ({size}px), ולכן טקסט בגודל קטן מזה מוצג כאן בגודל {size}. כדי לראות גדלים קטנים יותר יש לשנות את ההגדרה בדפדפן (הגדרות › מראה › התאמה אישית של גופנים › גודל גופן מינימלי).', { size: minimum })
  return (
    <span className="min-font-hint" role="img" aria-label={text} title={text}>
      ⚠
    </span>
  )
}
