import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

// ═════════════════════════════════════════════════════════════
// Button e IconButton: botones base del kit.
// ═════════════════════════════════════════════════════════════

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 disabled:hover:bg-primary',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:hover:bg-white',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600',
  link: 'text-primary underline-offset-2 hover:underline px-0 h-auto',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-body',
  sm: 'h-8 px-3 text-secondary',
}

/** Spinner pequeño para estados de carga (hereda el color del texto). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full opacity-70 animate-spin', className)}
    />
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icono a la izquierda del texto */
  icon?: ReactNode
  /** Muestra spinner y deshabilita */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, type = 'button', className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <span className="inline-flex shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span> : null}
      {children}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Obligatorio: nombre accesible (aria-label + title) */
  label: string
  children: ReactNode
  variant?: Exclude<ButtonVariant, 'link'>
  size?: ButtonSize
  loading?: boolean
}

/**
 * Botón solo-icono. En móvil (<sm) mide 44×44 (área táctil mínima);
 * en ≥sm, 32×32 (sm) o 36×36 (md).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'sm', loading = false, type = 'button', className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors select-none shrink-0',
        'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0',
        size === 'md' ? 'sm:h-9 sm:w-9' : 'sm:h-8 sm:w-8',
        '[&>svg]:w-4 [&>svg]:h-4',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
})
