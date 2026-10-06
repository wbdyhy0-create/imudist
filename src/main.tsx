import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './guides.css'
import './setup.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// makes the app installable (see public/manifest.webmanifest); a failure only means it can't be installed
if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
