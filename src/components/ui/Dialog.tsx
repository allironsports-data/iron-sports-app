import {
  useCallback, useEffect, useId, useRef, useState,
  type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject,
} from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
import { ConfirmModal } from '../ConfirmModal'
import { useBackClose } from '../../hooks/useBackClose'
import { L } from '../../lib/labels'

// ═════════════════════════════════════════════════════════════
// Dialog: modal accesible sin librerías.
//  - role="dialog" aria-modal aria-labelledby
//  - Foco atrapado (Tab/Shift+Tab ciclan), foco inicial y devolución
//    del foco al elemento anterior al cerrar.
//  - Bloqueo del scroll del body mientras hay diálogos abiertos.
//  - Escape / fondo / X cierran (si `dirty`, antes se pregunta).
//  - `onSubmit`: cuerpo+footer dentro de <form>; Enter envía en inputs y
//    Ctrl/Cmd+Enter en textarea.
//  - Botón atrás del móvil cierra (useBackClose).
//  - En <sm es una hoja anclada abajo (mobile='sheet') o centrado.
// Sheet: mismo componente como panel lateral derecho en escritorio.
// ═════════════════════════════════════════════════════════════

export type DialogSize = 'sm' | 'md' | 'lg' | 'full'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: DialogSize
  /** Con cambios sin guardar: cerrar pregunta antes */
  dirty?: boolean
  /** Si se pasa, el cuerpo se envuelve en <form onSubmit> */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** Elemento que recibe el foco al abrir (por defecto el primer focusable) */
  initialFocus?: RefObject<HTMLElement | null>
  closeOnBackdrop?: boolean
  /** En móvil: hoja anclada abajo (por defecto) o centrado */
  mobile?: 'sheet' | 'center'
  /** Solo para Sheet: panel lateral en escritorio */
  side?: 'right' | 'left'
  /** Clave estable para el historial (useBackClose) */
  historyKey?: string
  className?: string
  /** Oculta el botón X de la cabecera */
  hideClose?: boolean
}

const SIZE: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-3xl',
  full: 'sm:max-w-[min(96vw,1200px)] sm:h-[92dvh]',
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Pila de diálogos abiertos: solo el de arriba responde a Escape.
const pila: string[] = []
// Contador para el bloqueo del scroll del body (diálogos anidados).
let bloqueos = 0
let overflowPrevio = ''

function bloquearScroll() {
  if (bloqueos++ === 0) {
    overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
function liberarScroll() {
  if (--bloqueos <= 0) {
    bloqueos = 0
    document.body.style.overflow = overflowPrevio
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
  )
}

export function Dialog({
  open, onClose, title, description, children, footer, size = 'md', dirty = false, onSubmit,
  initialFocus, closeOnBackdrop = true, mobile = 'sheet', side, historyKey, className, hideClose = false,
}: DialogProps) {
  const uid = useId()
  const titleId = `dlg-title${uid}`
  const descId = `dlg-desc${uid}`
  const panel = useRef<HTMLDivElement>(null)
  const anterior = useRef<HTMLElement | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const esSheet = !!side

  // Cerrar «pidiendo permiso» si hay cambios
  const requestClose = useCallback(() => {
    if (dirty) setConfirmar(true)
    else onClose()
  }, [dirty, onClose])

  // Botón atrás del móvil. Límite conocido: si hay `dirty` y el usuario
  // cancela el descarte, la entrada de historial ya se consumió.
  useBackClose(open, requestClose, historyKey)

  // Pila + scroll + foco inicial + devolución del foco
  useEffect(() => {
    if (!open) return
    pila.push(uid)
    bloquearScroll()
    anterior.current = document.activeElement as HTMLElement | null
    // Enfocar tras pintar (el contenido puede montar inputs)
    const raf = requestAnimationFrame(() => {
      const objetivo = initialFocus?.current ?? (panel.current ? focusables(panel.current)[0] : null) ?? panel.current
      objetivo?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      const i = pila.lastIndexOf(uid)
      if (i >= 0) pila.splice(i, 1)
      liberarScroll()
      setConfirmar(false)
      const prev = anterior.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
    // initialFocus es un ref: no debe re-disparar el efecto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uid])

  // Escape (solo el diálogo de arriba, y no mientras se muestra el confirm)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmar) return
      if (pila[pila.length - 1] !== uid) return
      e.stopPropagation()
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, uid, confirmar, requestClose])

  // Trampa de foco (Tab / Shift+Tab) y atajo Ctrl/Cmd+Enter en textarea
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab' && panel.current) {
      const els = focusables(panel.current)
      if (els.length === 0) { e.preventDefault(); return }
      const first = els[0], last = els[els.length - 1]
      const activo = document.activeElement
      if (e.shiftKey && (activo === first || activo === panel.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && activo === last) { e.preventDefault(); first.focus() }
      return
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA') {
        e.preventDefault()
        ;(t.closest('form') as HTMLFormElement | null)?.requestSubmit()
      }
    }
  }

  if (!open) return null

  const cuerpo = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">{children}</div>
      {footer && (
        <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white px-4 sm:px-5 py-3 flex flex-wrap items-center justify-end gap-2 safe-area-bottom sm:pb-3">
          {footer}
        </div>
      )}
    </>
  )

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[9000] flex bg-black/40 animate-in fade-in duration-150',
          // Móvil: hoja abajo o centrado
          mobile === 'sheet' ? 'items-end justify-center' : 'items-center justify-center p-4',
          // Escritorio: centrado o panel lateral
          esSheet
            ? cn('sm:items-stretch sm:p-0', side === 'left' ? 'sm:justify-start' : 'sm:justify-end')
            : 'sm:items-center sm:p-6',
        )}
        onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) requestClose() }}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            'relative flex flex-col w-full bg-white shadow-xl outline-none animate-in duration-150',
            mobile === 'sheet' ? 'rounded-t-2xl max-h-[92dvh] slide-in-from-bottom-4' : 'rounded-2xl max-h-[92dvh] zoom-in-95',
            esSheet
              ? cn('sm:h-dvh sm:max-h-none sm:rounded-none sm:max-w-md', side === 'left' ? 'sm:slide-in-from-left-4' : 'sm:slide-in-from-right-4')
              : cn('sm:rounded-2xl sm:max-h-[92dvh]', SIZE[size]),
            className,
          )}
        >
          {/* Cabecera */}
          <div className="shrink-0 flex items-start gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-body font-semibold text-slate-900 leading-snug">{title}</h2>
              {description && <p id={descId} className="text-secondary text-slate-500 mt-0.5">{description}</p>}
            </div>
            {!hideClose && (
              <IconButton label={L.cerrar} onClick={requestClose} className="-mr-2 -mt-1.5 sm:-mr-1 sm:-mt-0.5">
                <X />
              </IconButton>
            )}
          </div>
          {onSubmit ? (
            <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0" noValidate={false}>
              {cuerpo}
            </form>
          ) : cuerpo}
        </div>
      </div>
      <ConfirmModal
        open={confirmar}
        title="Cambios sin guardar"
        message={L.sinCambios}
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        variant="danger"
        onConfirm={() => { setConfirmar(false); onClose() }}
        onCancel={() => setConfirmar(false)}
      />
    </>
  )
}

export interface SheetProps extends Omit<DialogProps, 'mobile' | 'side' | 'size'> {
  /** Lado en escritorio (por defecto derecha) */
  side?: 'right' | 'left'
}

/**
 * Panel de detalle: hoja inferior en móvil y panel lateral (w-full
 * sm:max-w-md h-dvh) en escritorio.
 */
export function Sheet({ side = 'right', ...rest }: SheetProps) {
  return <Dialog {...rest} mobile="sheet" side={side} />
}
