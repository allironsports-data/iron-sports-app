import { createContext } from 'react'
import type { ToastAction, ToastVariant } from '../hooks/useToast'

// Contexto de toasts (fuera del .tsx del provider por fast refresh)

export type ShowToast = (message: string, variant?: ToastVariant, action?: ToastAction) => void

export interface ToastContextValue {
  showToast: ShowToast
}

export const ToastContext = createContext<ToastContextValue | null>(null)
