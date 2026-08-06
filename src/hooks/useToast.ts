import { useState, useCallback } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastAction {
  label: string;      // ej. "Deshacer"
  fn: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = "success", action?: ToastAction) => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, variant, action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 6000 : 3500); // con acción (Deshacer) damos más margen
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
