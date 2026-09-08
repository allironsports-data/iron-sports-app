import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

// ═════════════════════════════════════════════════════════════
// Chip (filtro/toggle interactivo) y Badge (solo lectura).
// ═════════════════════════════════════════════════════════════

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

/** Estilos del chip: [inactivo, activo] */
const CHIP_TONE: Record<Tone, { off: string; on: string }> = {
  neutral: { off: 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50', on: 'border-slate-800 bg-slate-800 text-white' },
  primary: { off: 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50', on: 'border-primary bg-primary text-white' },
  success: { off: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50', on: 'border-emerald-600 bg-emerald-600 text-white' },
  warning: { off: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50', on: 'border-amber-500 bg-amber-500 text-white' },
  danger: { off: 'border-red-200 bg-white text-red-600 hover:bg-red-50', on: 'border-red-600 bg-red-600 text-white' },
}

const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  active?: boolean
  onClick?: () => void
  /** Contador a la derecha (p. ej. resultados del filtro) */
  count?: number
  tone?: Tone
  /** Si se pasa, muestra una X para quitar el filtro */
  onRemove?: () => void
  icon?: ReactNode
}

/**
 * Chip de filtro/toggle. Es un `<button aria-pressed>`; en móvil tiene
 * min-h-9 para que sea fácil de tocar. El botón de quitar NO se anida
 * dentro (sería button dentro de button): va como hermano en un wrapper.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { active = false, onClick, count, tone = 'primary', onRemove, icon, className, children, type = 'button', ...rest },
  ref,
) {
  const t = CHIP_TONE[tone]
  const base = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 text-secondary font-medium whitespace-nowrap transition-colors select-none',
    'min-h-9 sm:min-h-8',
    active ? t.on : t.off,
    'disabled:opacity-50 disabled:cursor-not-allowed',
  )
  const contenido = (
    <>
      {icon && <span className="inline-flex shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
      <span className="truncate">{children}</span>
      {count != null && (
        <span className={cn('rounded-full px-1.5 text-badge font-semibold leading-none py-0.5', active ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>
          {count}
        </span>
      )}
    </>
  )
  const label = typeof children === 'string' ? children : 'filtro'

  if (!onRemove) {
    return (
      <button ref={ref} type={type} aria-pressed={active} onClick={onClick} className={cn(base, className)} {...rest}>
        {contenido}
      </button>
    )
  }
  return (
    <span className={cn('inline-flex items-stretch', className)}>
      <button ref={ref} type={type} aria-pressed={active} onClick={onClick} className={cn(base, 'rounded-r-none pr-2')} {...rest}>
        {contenido}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        title={`Quitar filtro ${label}`}
        className={cn(
          'inline-flex items-center justify-center rounded-r-full border border-l-0 px-2 min-h-9 sm:min-h-8 transition-colors',
          active ? t.on : t.off,
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  )
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  /** Forma redonda (para contadores) */
  pill?: boolean
}

/** Etiqueta de solo lectura (estado, contador…). 11px. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', pill = true, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-px text-badge font-semibold whitespace-nowrap',
        pill ? 'rounded-full' : 'rounded',
        BADGE_TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
})
