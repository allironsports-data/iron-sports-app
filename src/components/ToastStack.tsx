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
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => {
        const Icon = VARIANT_ICON[t.variant];
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto
              animate-in fade-in slide-in-from-bottom-2 duration-200 ${VARIANT_STYLES[t.variant]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 opacity-90" />
            <span>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
