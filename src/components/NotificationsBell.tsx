import { useEffect, useId, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import type { AppNotification } from '../App'
import { IconButton } from './ui'
import { cn } from '../lib/cn'

// ═════════════════════════════════════════════════════════════
// NotificationsBell: campana de la cabecera + desplegable con la
// lista de avisos + toasts transitorios cuando llega uno nuevo.
// App.tsx la pasa al AppShell como `bell`. Antes vivía en Dashboard,
// así que solo funcionaba en Mantenimiento; ahora es global.
// ═════════════════════════════════════════════════════════════

export interface NotificationsBellProps {
  notifications: AppNotification[]
  onDismiss?: (id: string) => void
  /** Aviso ligado a un jugador: abre su ficha */
  onOpenPlayer?: (playerId: string) => void
  className?: string
}

const DOT: Record<AppNotification['type'], string> = {
  task_done: 'bg-emerald-500',
  birthday: 'bg-amber-400',
  negotiation: 'bg-violet-500',
  task_new: 'bg-blue-500',
}

export function NotificationsBell({ notifications, onDismiss, onOpenPlayer, className }: NotificationsBellProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const uid = useId()
  const panelId = `notif-panel${uid}`
  const unread = notifications.length

  // Cierra al hacer clic fuera y con Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Toasts transitorios: solo para avisos recién llegados (ts en el último segundo)
  const [toasts, setToasts] = useState<AppNotification[]>([])
  useEffect(() => {
    if (notifications.length > 0 && notifications[0].ts > Date.now() - 1000) {
      const latest = notifications[0]
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con avisos externos
      setToasts(prev => [latest, ...prev].slice(0, 3))
      const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== latest.id)), 5000)
      return () => clearTimeout(timer)
    }
  }, [notifications])

  return (
    <div ref={root} className={cn('relative', className)}>
      <IconButton
        label={unread > 0 ? `Notificaciones (${unread})` : 'Notificaciones'}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        className="relative text-slate-500 hover:text-slate-700"
      >
        <Bell />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute top-1 right-1 sm:-top-0.5 sm:-right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-badge font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notificaciones"
          className="fixed sm:absolute top-12 sm:top-full right-2 sm:right-0 sm:mt-1 z-40 w-[calc(100vw-1rem)] sm:w-80 max-h-96 bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto"
        >
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-secondary font-semibold text-slate-700">Notificaciones</span>
            <IconButton label="Cerrar notificaciones" onClick={() => setOpen(false)}><X /></IconButton>
          </div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-secondary text-slate-500">Sin notificaciones</div>
          ) : (
            <ul>
              {notifications.slice(0, 20).map(n => {
                const abrir = n.playerId && onOpenPlayer
                  ? () => { onOpenPlayer(n.playerId!); setOpen(false) }
                  : undefined
                return (
                  // Sin botones anidados: la fila es un div con el botón de abrir
                  // y el de descartar como hermanos.
                  <li key={n.id} className="flex items-start gap-2 px-3 py-2 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <span aria-hidden="true" className={cn('w-2 h-2 rounded-full mt-2 flex-shrink-0', DOT[n.type])} />
                    <button
                      type="button"
                      onClick={abrir}
                      disabled={!abrir}
                      className="flex-1 min-w-0 text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default"
                    >
                      <p className="text-secondary text-slate-700">{n.message}</p>
                      <p className="text-meta text-slate-500 mt-0.5">
                        {new Date(n.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {abrir && ' · Ver ficha'}
                      </p>
                    </button>
                    {onDismiss && (
                      <IconButton label="Descartar notificación" onClick={() => onDismiss(n.id)} className="-mr-1">
                        <X />
                      </IconButton>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Toasts de aviso nuevo (cumpleaños / tareas) */}
      {toasts.length > 0 && (
        <div className="fixed top-14 right-2 sm:right-4 z-50 flex flex-col gap-2 w-72 sm:w-80" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} role="status" className={cn(
              'rounded-lg shadow-lg border p-3 text-secondary flex items-start gap-2 animate-in slide-in-from-right-4 duration-200',
              t.type === 'task_done' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-800',
            )}>
              <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1">{t.message}</span>
              <IconButton label="Cerrar aviso" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="-my-2 -mr-2 text-slate-600">
                <X />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
