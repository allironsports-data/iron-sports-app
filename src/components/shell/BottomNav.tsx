import type { ReactNode } from 'react'
import { Search, Home, TrendingUp, Eye, Inbox, Sun } from 'lucide-react'
import type { MainSection } from '../globalExtras'
import { L } from '../../lib/labels'
import { cn } from '../../lib/cn'

// ── Barra de navegación inferior (solo móvil) ────────────────

export interface BottomNavProps {
  current: MainSection
  onGo: (s: MainSection) => void
  onSearch: () => void
  /** Cuenta «solo Captación»: solo Mi día, Captación y Buscar */
  captacionOnly?: boolean
}

export function BottomNav({ current, onGo, onSearch, captacionOnly = false }: BottomNavProps) {
  type Item = { id: MainSection; label: string; icon: ReactNode; match: MainSection[] }
  const items = ([
    { id: 'mi-dia', label: L.miDia, icon: <Sun className="w-5 h-5" />, match: ['mi-dia'] },
    { id: 'tareas', label: L.inicio, icon: <Home className="w-5 h-5" />, match: ['tareas', 'jugadores'] },
    { id: 'distribucion', label: L.distribucion, icon: <TrendingUp className="w-5 h-5" />, match: ['distribucion'] },
    { id: 'captacion', label: L.captacion, icon: <Eye className="w-5 h-5" />, match: ['captacion'] },
    { id: 'boulema', label: L.boulema, icon: <Inbox className="w-5 h-5" />, match: ['boulema'] },
  ] as Item[]).filter(it => !captacionOnly || it.id === 'mi-dia' || it.id === 'captacion')

  const itemClass = 'flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-badge font-medium transition-colors'
  return (
    <nav
      aria-label="Navegación principal"
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(it => {
        const active = it.match.includes(current)
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onGo(it.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(itemClass, active ? 'text-primary' : 'text-slate-400')}
          >
            {it.icon}
            <span className="w-full truncate text-center">{it.label}</span>
          </button>
        )
      })}
      <button type="button" onClick={onSearch} className={cn(itemClass, 'text-slate-400')} aria-label={L.buscar}>
        <Search className="w-5 h-5" />
        <span className="w-full truncate text-center">{L.buscar}</span>
      </button>
    </nav>
  )
}
