import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportError } from './utils/monitoring'

window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { source: 'window.error' })
})

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { source: 'unhandledrejection' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the offline shell only in production builds. Registering during
// development makes Vite HMR serve stale cached modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[SpellSift] Service worker registration failed:', error)
    })
  })
}
