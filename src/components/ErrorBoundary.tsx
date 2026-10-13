import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * The last net under the whole app: a rendering error anywhere used to unmount everything and leave a black window with
 * no word about what happened. Now the window says so, shows the error, and offers to try again or reload (the document
 * is autosaved, so a reload does not lose it).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app crashed while rendering:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
       
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100vh', padding: 24, background: '#1e1818', color: '#e8e0e0', font: '15px system-ui, sans-serif', textAlign: 'center' }}
      >
        <h2 style={{ margin: 0 }}>{t('משהו השתבש בתצוגה')}</h2>
        <p style={{ margin: 0, maxWidth: 560, opacity: 0.8 }}>
          {t('התוכנה נתקלה בשגיאה ולכן הפסיקה להציג את המסך. המסמך נשמר אוטומטית, ולכן טעינה מחדש לא אמורה לאבד ממנו כלום.')}
        </p>
        <pre style={{ margin: 0, maxWidth: 640, maxHeight: 160, overflow: 'auto', padding: 10, background: '#2a2020', borderRadius: 6, direction: 'ltr', textAlign: 'left', fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {error.message || String(error)}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => this.setState({ error: null })}>{t('נסה שוב')}</button>
          <button className="btn primary" onClick={() => window.location.reload()}>{t('טען מחדש')}</button>
        </div>
      </div>
    )
  }
}
