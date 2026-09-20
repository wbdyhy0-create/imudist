import { useEffect } from 'react'

export interface ModalButton {
  label: string
  kind?: 'primary' | 'danger'
  /** pressed by Escape */
  cancel?: boolean
  run: () => void
}

export interface ModalSpec {
  title: string
  message: string
  buttons: ModalButton[]
}

/** A blocking message with choices, e.g. "Save changes?". */
export function Modal({ spec }: { spec: ModalSpec }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const cancel = spec.buttons.find((b) => b.cancel)
      if (cancel) {
        e.preventDefault()
        cancel.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spec])

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={spec.title}>
        <h2>{spec.title}</h2>
        <p>{spec.message}</p>
        <div className="modal-buttons">
          {spec.buttons.map((b) => (
            <button
              key={b.label}
              autoFocus={b.kind === 'primary'}
              className={'btn' + (b.kind === 'primary' ? ' primary' : b.kind === 'danger' ? ' danger' : '')}
              onClick={b.run}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
