import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registrarError } from './lib/dbErrors'
import './index.css'

// Errores fuera de React (listeners, promesas sueltas): también se apuntan
window.addEventListener('error', e => {
  registrarError(e.error ?? e.message, { origen: 'window.error', fuente: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null })
})
window.addEventListener('unhandledrejection', e => {
  registrarError(e.reason, { origen: 'unhandledrejection' })
})

function Fallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<Fallback />}>
            <App />
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
