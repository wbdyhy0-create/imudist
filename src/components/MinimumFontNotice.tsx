import { useEffect, useState } from 'react'
import { detectMinimumFontSize } from '../browserFontLimit'
import { t } from '../i18n'

const DISMISSED_KEY = 'imudist.minimum-font-notice'

function dismissedSize(): number | null {
  try {
    const value = Number(window.localStorage.getItem(DISMISSED_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Says so when the browser holds a minimum font size: text under it is drawn at it, so a size field that is turned down seems to
 * stop working. Shown once per size, until the person closes it.
 */
export function MinimumFontNotice() {
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const check = () => {
      if (!alive) return
      const found = detectMinimumFontSize()
      setSize(found !== null && found !== dismissedSize() ? found : null)
    }
    // after the fonts are in: a text measured while its font is still loading is measured by the one that stands in for it
    const ready = document.fonts?.ready
    if (ready) ready.then(check, check)
    else check()
    return () => {
      alive = false
    }
  }, [])

  if (size === null) return null
  return (
    <div className="min-font-notice" role="alert">
      <div>
        <strong>{t('בדפדפן מוגדר גודל גופן מינימלי ({size}px)', { size })}</strong>
        <p>{t('טקסט שהגודל שלו מוגדר קטן מ-{size} מוצג כאן בגודל {size}, ולכן הקטנת גודל גופן, גודל מספרי הפניה וכדומה לא נראית מתחת לגודל הזה. כדי לבטל את ההגבלה: בהגדרות הדפדפן, „מראה” ← „התאמה אישית של גופנים” ← „גודל גופן מינימלי”, הזיזו את המחוון לקצה הקטן, ואז רעננו את הדף.', { size })}</p>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED_KEY, String(size))
          } catch {
            // the notice only comes back at the next start
          }
          setSize(null)
        }}
      >
        {t('הבנתי')}
      </button>
    </div>
  )
}
