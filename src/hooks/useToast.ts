import { useState, useCallback, useEffect, useRef, useContext } from "react";
import { ToastContext } from "../contexts/toastContext";

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

const noop = () => {};

/**
 * Toasts de una vista. Si hay un <ToastProvider> por encima, devuelve el
 * showToast global y una lista vacía: los <ToastStack> locales no pintan
 * nada y no se duplican con el global. `ignoreContext` lo usa el propio
 * provider para tener su estado real.
 */
export function useToast(opts?: { ignoreContext?: boolean }) {
  const ctx = useContext(ToastContext);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Timers vivos, para cancelarlos al desmontar y no hacer setState
  // sobre un componente que ya no existe.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const set = timers.current;
    return () => { set.forEach(clearTimeout); set.clear(); };
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "success", action?: ToastAction) => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, variant, action }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setToasts(prev => prev.filter(x => x.id !== id));
    }, action ? 6000 : 3500); // con acción (Deshacer) damos más margen
    timers.current.add(t);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (ctx && !opts?.ignoreContext) {
    return { toasts: [] as Toast[], showToast: ctx.showToast, dismissToast: noop as (id: string) => void };
  }
  return { toasts, showToast, dismissToast };
}
