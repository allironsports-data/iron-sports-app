import type { ReactNode } from 'react'
import { AppHeader, type AppHeaderProps } from './AppHeader'

// ═════════════════════════════════════════════════════════════
// AppShell: AppHeader + <main>. NO incluye BottomNav ni toasts
// (los sigue poniendo App.withExtras).
// ═════════════════════════════════════════════════════════════

export interface AppShellProps extends AppHeaderProps {
  children: ReactNode
  /** Clases del <main> (por defecto contenedor centrado max-w-6xl) */
  mainClassName?: string
}

export function AppShell({ children, mainClassName, ...header }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader {...header} />
      <main className={mainClassName ?? 'max-w-6xl mx-auto px-3 sm:px-6 py-4'}>{children}</main>
    </div>
  )
}
