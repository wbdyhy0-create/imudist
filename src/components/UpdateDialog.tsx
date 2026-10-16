import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { percentDone, type UpdateStatus } from '../updater'

/**
 * Help > בדוק עדכונים…, and what the program shows by itself when it finds a newer version: asks whether to install it (the program
 * closes and opens again), shows how far the download is, and says so when there is nothing new or the list could not be read.
 * `unsaved`: some open document has changes that are not saved; the install waits for them, since the program closes when it is done.
 */
export function UpdateDialog({ status, unsaved, onClose }: { status: UpdateStatus; unsaved: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<{ kind: 'ask' } | { kind: 'installing'; received: number; total: number | null } | { kind: 'failed'; reason: string }>({ kind: 'ask' })
  const installing = phase.kind === 'installing'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !installing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [installing, onClose])

  const install = async () => {
    if (status.kind !== 'available') return
    setPhase({ kind: 'installing', received: 0, total: null })
    try {
      await status.offer.install((received, total) => setPhase({ kind: 'installing', received, total }))
    } catch (error) {
      console.error('The update failed:', error)
      setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const percent = phase.kind === 'installing' ? percentDone(phase.received, phase.total) : null

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal update-dialog" role="dialog" aria-modal="true" aria-label={t('עדכון לתוכנה')}>
        <h2>{t('עדכון לתוכנה')}</h2>

        {status.kind === 'checking' && <p>{t('בודק אם יש עדכון…')}</p>}
        {status.kind === 'none' && <p>{t('אין עדכון חדש: זו הגרסה האחרונה.')}</p>}
        {status.kind === 'failed' && <p>{t('לא ניתן לבדוק עדכונים כרגע. בדוק את החיבור לאינטרנט ונסה שוב.')}</p>}

        {status.kind === 'available' && (
          <>
            <p>{t('גרסה {version} זמינה (הגרסה שלך: {current}).', { version: status.offer.version, current: status.offer.currentVersion })}</p>
            {status.offer.notes && <pre className="update-notes">{status.offer.notes}</pre>}
            {phase.kind === 'ask' && unsaved && <p className="update-warning">{t('יש מסמכים שלא נשמרו. שמור אותם לפני ההתקנה: התוכנה נסגרת ונפתחת מחדש בסיומה.')}</p>}
            {installing && (
              <p role="status">
                {percent === null ? t('מוריד…') : t('מוריד… {percent}%', { percent })}
                {percent === 100 && ' ' + t('מתקין ופותח מחדש…')}
              </p>
            )}
            {phase.kind === 'failed' && <p role="alert">{t('ההתקנה נכשלה: {reason}', { reason: phase.reason })}</p>}
          </>
        )}

        <div className="modal-buttons">
          {status.kind === 'available' && phase.kind !== 'failed' && (
            <button className="btn primary" autoFocus disabled={installing || unsaved} onClick={() => void install()}>
              {t('התקן ופתח מחדש')}
            </button>
          )}
          <button className="btn" disabled={installing} onClick={onClose}>
            {status.kind === 'available' && phase.kind === 'ask' ? t('אחר כך') : t('סגירה')}
          </button>
        </div>
      </div>
    </div>
  )
}
