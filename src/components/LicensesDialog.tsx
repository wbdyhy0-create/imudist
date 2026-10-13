import { useEffect, useState } from 'react'

/** Help > רישיונות: the notices of the third-party parts, read from the file that ships with the program and shown in the window. */
export function LicensesDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/THIRD-PARTY-NOTICES.txt')
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        if (alive) setText(body)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal licenses-dialog" role="dialog" aria-modal="true" aria-label="רישיונות">
        <h2>רישיונות</h2>
        <p>הרישיונות של רכיבי צד שלישי שבהם משתמשת התוכנה.</p>
        {failed ? (
          <p className="muted">לא ניתן לקרוא את קובץ הרישיונות.</p>
        ) : (
          <pre className="licenses-text" dir="ltr" tabIndex={0}>
            {text ?? '…'}
          </pre>
        )}
        <div className="modal-buttons">
          <button className="btn primary" autoFocus onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  )
}
