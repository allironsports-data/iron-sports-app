import { useRef, type ReactNode } from 'react'
import { Search, Home, TrendingUp, Eye, Inbox, Sun, BarChart3, Shield, LogOut } from 'lucide-react'
import logoImg from '../../assets/logo.jpeg'
import type { MainSection } from '../globalExtras'
import type { Profile } from '../../contexts/AuthContext'
import { IconButton, SectionTabs, type TabItem } from '../ui'
import { L } from '../../lib/labels'
import { cn } from '../../lib/cn'
import { SHELL_STICKY, useShellHeight } from './shell'

// ═════════════════════════════════════════════════════════════
// AppHeader: barra superior única de la app + nivel 1 de navegación.
// Publica su altura en `--shell-h` (document.documentElement) para que
// las sub-pestañas de cada vista puedan hacer `sticky top-[var(--shell-h)]`.
// ═════════════════════════════════════════════════════════════


export interface AppHeaderProps {
  section: MainSection
  onGo: (s: MainSection) => void
  profile: Profile
  onLogout: () => void
  /** Solo admin: botón Administración */
  onAdmin?: () => void
  /** Solo admin: botón Overview */
  onOverview?: () => void
  onSearch: () => void
  /** Campana con su desplegable (lo inyecta App); si no se pasa, no se pinta nada */
  bell?: ReactNode
  /** Cuenta «solo Captación»: nivel 1 con Captación y Mi día únicamente */
  captacionOnly?: boolean
  /** Contadores/alertas por sección (p. ej. tareas vencidas) */
  counts?: Partial<Record<MainSection, { count: number; alert?: boolean }>>
  className?: string
}

/** Sección de nivel 1 que corresponde a la actual (jugadores cuelga de Mantenimiento) */
function nivel1(section: MainSection): MainSection {
  return section === 'jugadores' ? 'tareas' : section
}

export function AppHeader({
  section, onGo, profile, onLogout, onAdmin, onOverview, onSearch, bell, captacionOnly = false, counts, className,
}: AppHeaderProps) {
  const ref = useRef<HTMLElement>(null)
  useShellHeight(ref)

  const c = (id: MainSection) => counts?.[id]
  const items: TabItem<MainSection>[] = [
    { id: 'tareas', label: L.mantenimiento, icon: <Home />, count: c('tareas')?.count, alert: c('tareas')?.alert, hidden: captacionOnly },
    { id: 'distribucion', label: L.distribucion, icon: <TrendingUp />, count: c('distribucion')?.count, alert: c('distribucion')?.alert, hidden: captacionOnly },
    { id: 'captacion', label: L.captacion, icon: <Eye />, count: c('captacion')?.count, alert: c('captacion')?.alert },
    { id: 'boulema', label: L.boulema, icon: <Inbox />, count: c('boulema')?.count, alert: c('boulema')?.alert, hidden: captacionOnly },
  ]
  const trailingItems: TabItem<MainSection>[] = [
    { id: 'mi-dia', label: L.miDia, icon: <Sun />, count: c('mi-dia')?.count, alert: c('mi-dia')?.alert },
  ]
  const esAdmin = !!profile.is_admin && !captacionOnly

  return (
    <header ref={ref} className={cn(SHELL_STICKY, className)}>
      {/* Barra superior: logo + acciones */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onGo(captacionOnly ? 'captacion' : 'tareas')}
          className="flex items-center gap-2 rounded-lg min-w-0"
          aria-label={L.inicio}
        >
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-white flex-shrink-0">
            <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
          </span>
          <span className="hidden sm:block font-black text-body tracking-tight text-slate-900 uppercase">All Iron Sports</span>
        </button>

        <div className="flex items-center gap-0.5 sm:gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onSearch}
            title="Buscar (⌘K)"
            aria-label="Buscar (⌘K)"
            className="inline-flex items-center gap-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:h-8 px-2 justify-center flex-shrink-0"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline text-meta text-slate-400 border border-slate-200 rounded px-1 py-px">⌘K</span>
          </button>
          {bell}
          <div className="flex items-center gap-2 pl-1 pr-0.5 min-w-0">
            <p className="hidden sm:block text-body font-medium text-slate-700 truncate max-w-[10rem]">{profile.name}</p>
            <div
              aria-hidden="true"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary text-white text-badge font-bold flex items-center justify-center flex-shrink-0"
            >
              {profile.avatar}
            </div>
          </div>
          {esAdmin && onOverview && (
            <IconButton label="Overview" onClick={onOverview} className="text-slate-500 hover:text-slate-700">
              <BarChart3 />
            </IconButton>
          )}
          {esAdmin && onAdmin && (
            <IconButton label="Administración" onClick={onAdmin} className="text-slate-500 hover:text-slate-700">
              <Shield />
            </IconButton>
          )}
          <IconButton label="Cerrar sesión" onClick={onLogout} className="text-slate-500 hover:text-slate-700">
            <LogOut />
          </IconButton>
        </div>
      </div>

      {/* Nivel 1 (solo escritorio; en móvil está la BottomNav) */}
      <SectionTabs<MainSection>
        variant="primary"
        label="Secciones"
        items={items}
        trailingItems={trailingItems}
        value={nivel1(section)}
        onChange={onGo}
        className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:block border-t border-slate-100"
      />
    </header>
  )
}
