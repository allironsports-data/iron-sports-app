import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from '../contexts/toastContext'

/** showToast global. Fuera de un ToastProvider lanza error (evita toasts perdidos). */
export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToastContext debe usarse dentro de <ToastProvider>')
  return ctx
}
