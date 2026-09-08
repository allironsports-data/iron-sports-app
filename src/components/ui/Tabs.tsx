import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Badge } from './Chip'

// ═════════════════════════════════════════════════════════════
// SectionTabs: pestañas de nivel 1 (primary: cabecera de la app)
// y nivel 2 (secondary: sub-pestañas de cada vista).
// ═════════════════════════════════════════════════════════════

export interface TabItem<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
  count?: number
  /** Contador en rojo (algo pendiente/urgente) */
  alert?: boolean
  hidden?: boolean
}

export interface SectionTabsProps<T extends string = string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  variant?: 'primary' | 'secondary'
  /** Pestañas alineadas a la derecha (ml-auto), p. ej. «Mi día». Mismo estilo. */
  trailingItems?: TabItem<T>[]
  /** Nodo libre a la derecha (ml-auto si no hay trailingItems) */
  trailing?: ReactNode
  className?: string
  /** aria-label del tablist */
  label?: string
}

export function SectionTabs<T extends string = string>({
  items, value, onChange, variant = 'primary', trailingItems = [], trailing, className, label,
}: SectionTabsProps<T>) {
  const visiblesIzq = items.filter(i => !i.hidden)
  const visiblesDer = trailingItems.filter(i => !i.hidden)
  // Orden de navegación por teclado: izquierda + derecha
  const visibles = [...visiblesIzq, ...visiblesDer]
  const scroller = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  // Degradados laterales cuando hay contenido oculto por overflow
  const medir = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setOverflow(o => (o.left === left && o.right === right ? o : { left, right }))
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', medir); ro?.disconnect() }
  }, [medir, visibles.length])

  // La activa se centra al cambiar
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[role="tab"][data-id="${CSS.escape(value)}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ inline: 'center', block: 'nearest' }) } catch { /* jsdom */ }
    }
  }, [value])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    let next = idx
    if (e.key === 'ArrowLeft') next = (idx - 1 + visibles.length) % visibles.length
    if (e.key === 'ArrowRight') next = (idx + 1) % visibles.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = visibles.length - 1
    const item = visibles[next]
    onChange(item.id)
    scroller.current?.querySelector<HTMLElement>(`[role="tab"][data-id="${CSS.escape(item.id)}"]`)?.focus()
  }

  const primary = variant === 'primary'

  return (
    <div className={cn('relative', !primary && 'bg-slate-50', className)}>
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        className="flex items-center overflow-x-auto scrollbar-none"
      >
        {visibles.map((it, idx) => {
          const active = it.id === value
          const primeroDerecha = idx === visiblesIzq.length && visiblesDer.length > 0
          return (
            <button
              key={it.id}
              type="button"
              role="tab"
              data-id={it.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(it.id)}
              onKeyDown={e => onKeyDown(e, idx)}
              className={cn(
                'flex-shrink-0 inline-flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap',
                primeroDerecha && 'ml-auto',
                primary ? 'px-4 py-2.5 text-body' : 'px-3 sm:px-4 py-2 text-secondary',
                active
                  ? cn('border-primary text-primary', primary ? 'font-semibold' : 'font-medium')
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 font-medium',
              )}
            >
              {it.icon && <span className="inline-flex shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{it.icon}</span>}
              {it.label}
              {it.count != null && it.count > 0 && (
                <Badge tone={it.alert ? 'danger' : 'neutral'}>{it.count}</Badge>
              )}
            </button>
          )
        })}
        {trailing && <div className={cn('flex-shrink-0 flex items-center', visiblesDer.length === 0 && 'ml-auto')}>{trailing}</div>}
      </div>
      {/* Degradados: pistas de que hay más pestañas a los lados */}
      <div aria-hidden="true" className={cn('pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent transition-opacity', primary ? 'from-white' : 'from-slate-50', overflow.left ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden="true" className={cn('pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l to-transparent transition-opacity', primary ? 'from-white' : 'from-slate-50', overflow.right ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}
