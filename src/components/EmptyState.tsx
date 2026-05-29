import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="text-slate-200 mb-4">{icon}</div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
