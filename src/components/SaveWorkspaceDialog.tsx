import { useEffect, useState, type FormEvent } from 'react'

interface Props {
  onSave: (name: string) => void
  onClose: () => void
}

export function SaveWorkspaceDialog({ onSave, onClose }: Props) {
  const [name, setName] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed)
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-label="שמירת סביבת עבודה" onSubmit={submit}>
        <h2>שמירת סביבת עבודה</h2>
        <p>תן שם לסידור הנוכחי של חלוניות הצד. שם שכבר קיים יעדכן את סביבת העבודה השמורה.</p>
        <label className="workspace-name-label">
          שם סביבת העבודה
          <input
            className="workspace-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>שמירה</button>
        </div>
      </form>
    </div>
  )
}
