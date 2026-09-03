import type { ReactNode } from 'react'
import { useToast as useToastLocal } from '../hooks/useToast'
import { ToastStack } from '../components/ToastStack'
import { ToastContext } from './toastContext'

// ── Toasts globales ──────────────────────────────────────────────────
// Un único ToastStack montado en main.tsx. Las vistas que siguen llamando
// a `useToast()` reciben el showToast del contexto (ver hooks/useToast.ts),
// así sus <ToastStack> locales quedan vacíos y no se duplican.
// El contexto vive en toastContext.ts y el hook en hooks/useToastContext.ts.

export function ToastProvider({ children }: { children: ReactNode }) {
  // El hook local es la única «fuente» real de toasts dentro del provider
  const { toasts, showToast, dismissToast } = useToastLocal({ ignoreContext: true })
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}
