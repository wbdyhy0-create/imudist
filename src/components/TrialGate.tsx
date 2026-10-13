import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isTauri } from '../fileio'
import { trialExpiry, trialStatus, type TrialStatus } from '../trial'
import { localeTag, t } from '../i18n'

const CONSENT_KEY = 'imudist.trial-consent'
const SEEN_KEY = 'imudist.trial-seen'
const RECHECK_MS = 5 * 60 * 1000

const readNumber = (key: string): number | null => {
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

const readText = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // without storage the agreement is asked for again at every start
  }
}

const formatDate = (time: number) => new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(time))

async function leave() {
  try {
    if (isTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
      return
    }
    window.close()
  } catch {
    // a window that cannot be closed from here is left to the person
  }
}

/** The status of the test now, and the latest time that was seen on this computer (kept, to notice a clock that was put back). */
function check(expiresAt: number): TrialStatus {
  const now = Date.now()
  const status = trialStatus(now, expiresAt, readNumber(SEEN_KEY))
  if (status === 'ok') write(SEEN_KEY, String(Math.max(now, readNumber(SEEN_KEY) ?? 0)))
  return status
}

function TrialShell({ expiresAt, children }: { expiresAt: number; children: ReactNode }) {
  const [status, setStatus] = useState<TrialStatus>(() => check(expiresAt))
  const [agreed, setAgreed] = useState(() => readText(CONSENT_KEY) === String(expiresAt))

  useEffect(() => {
    const timer = window.setInterval(() => setStatus(check(expiresAt)), RECHECK_MS)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  if (status !== 'ok') {
    return (
      <div className="modal-backdrop">
        <div className="modal trial-modal" role="alertdialog" aria-modal="true" aria-label={t('גרסת הבדיקה הסתיימה')}>
          <h2>{status === 'expired' ? t('תוקף גרסת הבדיקה הסתיים') : t('לא ניתן להמשיך')}</h2>
          <p>
            {status === 'expired'
              ? t('גרסת הבדיקה הזו הייתה פעילה עד {n1}. כדי להמשיך להשתמש בתוכנה יש לקבל גרסה חדשה.', { n1: formatDate(expiresAt) })
              : t('שעון המחשב הוחזר אחורה, ולכן גרסת הבדיקה אינה יכולה להמשיך לפעול. יש להחזיר את השעון למצבו התקין או לקבל גרסה חדשה.')}
          </p>
          <div className="modal-buttons">
            <button className="btn primary" autoFocus onClick={() => void leave()}>{t('יציאה')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!agreed) {
    return (
      <div className="modal-backdrop">
        <div className="modal trial-modal" role="alertdialog" aria-modal="true" aria-label={t('גרסת בדיקה')}>
          <h2>{t('גרסת בדיקה')}</h2>
          <p>{t('גרסה זו של Imudist ניתנת לך לבדיקה והתנסות בלבד.')}</p>
          <p>{t('בלחיצה על „אני מסכים” אתה מאשר ש:')}</p>
          <ul className="trial-terms">
            <li>{t('אין להעתיק, לפרק, לשחזר או לנסות לחלץ את קוד התוכנה או חלקים ממנו.')}</li>
            <li>{t('אין להפיץ את התוכנה או להעביר אותה לאחרים.')}</li>
            <li>{t('אין להשתמש בה או בחלק ממנה כבסיס לתוכנה אחרת.')}</li>
            <li>{t('הגרסה פעילה עד')} <strong>{formatDate(expiresAt)}</strong> {t('ולאחר מכן תפסיק לעבוד.')}</li>
          </ul>
          <p className="muted">{t('התוכנה ניתנת כמות שהיא, ללא אחריות.')}</p>
          <div className="modal-buttons">
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                write(CONSENT_KEY, String(expiresAt))
                setAgreed(true)
              }}
            >
              {t('אני מסכים')}
            </button>
            <button className="btn" onClick={() => void leave()}>{t('יציאה')}</button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/** Wraps the app: an ordinary build shows it as it is; a build for testing asks for the agreement first and stops on its end date. */
export function TrialGate({ children }: { children: ReactNode }) {
  const expiresAt = useMemo(() => trialExpiry(import.meta.env.VITE_TRIAL_EXPIRES), [])
  if (expiresAt === null) return <>{children}</>
  return <TrialShell expiresAt={expiresAt}>{children}</TrialShell>
}
