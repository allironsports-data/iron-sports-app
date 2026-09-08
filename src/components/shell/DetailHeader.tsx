import { useRef, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../ui'
import { L } from '../../lib/labels'
import { cn } from '../../lib/cn'
import { SHELL_STICKY, useShellHeight } from './shell'

// ═════════════════════════════════════════════════════════════
// DetailHeader: cabecera de fichas (jugador, miembro, club):
// atrás + breadcrumb + título + acciones. Mismo sticky/z-index que
// AppHeader y también publica `--shell-h`.
// ═════════════════════════════════════════════════════════════

export interface Crumb {
  label: string
  /** Si se pasa, el crumb es clicable */
  onClick?: () => void
}

export interface DetailHeaderProps {
  onBack: () => void
  crumbs?: Crumb[]
  title: ReactNode
  /** Línea secundaria bajo el título */
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  /**
   * Publicar la altura en `--shell-h` (por defecto sí). Poner a false cuando
   * la cabecera va embebida bajo el AppHeader (p. ej. ClubDetail en pantalla
   * partida): si no, las dos se pisarían la variable.
   */
  publishHeight?: boolean
}

export function DetailHeader({ onBack, crumbs = [], title, subtitle, actions, className, publishHeight = true }: DetailHeaderProps) {
  const ref = useRef<HTMLElement>(null)
  useShellHeight(publishHeight ? ref : null)

  return (
    <header ref={ref} className={cn(SHELL_STICKY, className)}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2">
        <IconButton label={L.atras} onClick={onBack} className="-ml-2 text-slate-600">
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          {crumbs.length > 0 && (
            <nav aria-label="Ruta" className="flex items-center gap-1 text-meta text-slate-500 overflow-x-auto scrollbar-none whitespace-nowrap">
              {crumbs.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
                  {c.onClick ? (
                    <button type="button" onClick={c.onClick} className="hover:text-slate-800 hover:underline rounded">
                      {c.label}
                    </button>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-body sm:text-base font-semibold text-slate-900 truncate leading-snug">{title}</h1>
          {subtitle && <p className="text-secondary text-slate-500 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
