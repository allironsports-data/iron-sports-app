import { forwardRef, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

// ═════════════════════════════════════════════════════════════
// ClickableRow: fila/tarjeta entera clicable (lista de jugadores,
// tareas, clubes…) con un slot `actions` para botones interiores.
//
// Por qué dos variantes de elemento:
//  - SIN `actions`: es un <button type="button"> real (o <a href>).
//    Semántica nativa, teclado gratis.
//  - CON `actions`: los botones interiores NO pueden ir dentro de un
//    <button> (HTML inválido, y el navegador «desanida»). Entonces el
//    contenedor es un <div role="button" tabIndex=0> con Enter/Espacio,
//    y el slot `actions` para la propagación de click/keydown para que
//    pulsar un botón interior no abra la fila.
// ═════════════════════════════════════════════════════════════

export interface ClickableRowProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  /** Si se pasa, renderiza <a href> (navegación real, abrir en pestaña nueva…) */
  href?: string
  /** Botones interiores (se colocan a la derecha; no propagan click/teclado) */
  actions?: ReactNode
  /** Fila resaltada (seleccionada/activa) */
  selected?: boolean
  disabled?: boolean
  /** Clases del slot de acciones */
  actionsClassName?: string
}

const BASE = 'w-full text-left flex items-center gap-3 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const INTERACTIVE = 'hover:bg-slate-50 active:bg-slate-100 cursor-pointer'

export const ClickableRow = forwardRef<HTMLElement, ClickableRowProps>(function ClickableRow(
  { onClick, href, actions, selected = false, disabled = false, className, actionsClassName, children, ...rest },
  ref,
) {
  const clases = cn(BASE, !disabled && INTERACTIVE, selected && 'bg-primary/5', disabled && 'opacity-50 cursor-not-allowed', className)

  const slotActions = actions ? (
    <div
      className={cn('ml-auto shrink-0 flex items-center gap-1', actionsClassName)}
      // Que los botones interiores no disparen la fila
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {actions}
    </div>
  ) : null

  if (href) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        aria-disabled={disabled || undefined}
        onClick={e => { if (disabled) { e.preventDefault(); return } onClick?.(e) }}
        className={clases}
        {...(rest as HTMLAttributes<HTMLAnchorElement>)}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {slotActions}
      </a>
    )
  }

  if (!actions) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={selected || undefined}
        className={clases}
        {...(rest as HTMLAttributes<HTMLButtonElement>)}
      >
        <div className="min-w-0 flex-1">{children}</div>
      </button>
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(e)
    }
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-pressed={selected || undefined}
      onClick={e => { if (!disabled) onClick?.(e) }}
      onKeyDown={onKeyDown}
      className={clases}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {slotActions}
    </div>
  )
})
