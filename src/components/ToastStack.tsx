import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { Toast } from "../hooks/useToast";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const VARIANT_STYLES = {
  success: "bg-emerald-600 text-white",
  error:   "bg-red-600 text-white",
  info:    "bg-slate-800 text-white",
};

const VARIANT_ICON = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
};

export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] sm:bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => {
        const Icon = VARIANT_ICON[t.variant];
        return (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-body font-medium pointer-events-auto
              animate-in fade-in slide-in-from-bottom-2 duration-200 ${VARIANT_STYLES[t.variant]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 opacity-90" />
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.fn(); onDismiss(t.id); }}
                type="button"
                className="ml-1 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-secondary font-bold transition-colors"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Cerrar aviso"
              className="ml-1 inline-flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:h-6 sm:w-6 -my-2 -mr-2 sm:my-0 sm:mr-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
