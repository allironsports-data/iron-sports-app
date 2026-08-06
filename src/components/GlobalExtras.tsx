import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, Home, TrendingUp, Eye, Inbox, Bell } from 'lucide-react'
import type { Player, ScoutingPlayer, FirmasEntry, Club, Task } from '../types'
import { onSavingChange } from '../lib/supabase'

// ═════════════════════════════════════════════════════════════
// Extras globales de la app: indicador de guardado, barra de
// navegación inferior (móvil), búsqueda global (⌘K) y permiso
// de notificaciones del sistema.
// ═════════════════════════════════════════════════════════════

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ── Indicador global de guardado ─────────────────────────────
export function SavingIndicator() {
  const [inflight, setInflight] = useState(0)
  const [justSaved, setJustSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSaving = useRef(false)

  useEffect(() => onSavingChange(n => {
    setInflight(n)
    if (n > 0) {
      wasSaving.current = true
      if (timer.current) clearTimeout(timer.current)
      setJustSaved(false)
    } else if (wasSaving.current) {
      wasSaving.current = false
      setJustSaved(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setJustSaved(false), 1500)
    }
  }), [])

  if (inflight === 0 && !justSaved) return null
  return (
    <div className="fixed top-2 right-2 z-[60] pointer-events-none">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm border ${
        inflight > 0 ? 'bg-white border-slate-200 text-slate-500' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}>
        {inflight > 0 ? (
          <>
            <span className="w-2.5 h-2.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            Guardando…
          </>
        ) : (
          <>✓ Guardado</>
        )}
      </span>
    </div>
  )
}

// ── Barra de navegación inferior (solo móvil) ────────────────
export type MainSection = 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'boulema'

export function BottomNav({ current, onGo, onSearch }: {
  current: MainSection
  onGo: (s: MainSection) => void
  onSearch: () => void
}) {
  const items: { id: MainSection; label: string; icon: React.ReactNode; match: MainSection[] }[] = [
    { id: 'tareas', label: 'Manten.', icon: <Home className="w-5 h-5" />, match: ['tareas', 'jugadores'] },
    { id: 'distribucion', label: 'Distrib.', icon: <TrendingUp className="w-5 h-5" />, match: ['distribucion'] },
    { id: 'captacion', label: 'Captación', icon: <Eye className="w-5 h-5" />, match: ['captacion'] },
    { id: 'boulema', label: 'Boulema', icon: <Inbox className="w-5 h-5" />, match: ['boulema'] },
  ]
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
      {items.map(it => {
        const active = it.match.includes(current)
        return (
          <button
            key={it.id}
            onClick={() => onGo(it.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
              active ? 'text-primary' : 'text-slate-400'
            }`}
          >
            {it.icon}
            {it.label}
          </button>
        )
      })}
      <button
        onClick={onSearch}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium text-slate-400"
        aria-label="Buscar"
      >
        <Search className="w-5 h-5" />
        Buscar
      </button>
    </nav>
  )
}

// ── Búsqueda global (⌘K) ─────────────────────────────────────
interface SearchProps {
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  firmasEntries: FirmasEntry[]
  clubs: Club[]
  tasks: Task[]
  onClose: () => void
  onOpenPlayer: (id: string) => void
  onOpenScoutingPlayer: (id: string) => void
  onOpenFirmasEntry: (id: string) => void
  onOpenClub: (id: string) => void
  onGoTareas: () => void
}

export function GlobalSearch({
  players, scoutingPlayers, firmasEntries, clubs, tasks,
  onClose, onOpenPlayer, onOpenScoutingPlayer, onOpenFirmasEntry, onOpenClub, onGoTareas,
}: SearchProps) {
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => {
    const n = norm(q)
    if (n.length < 2) return null
    const LIMIT = 5
    return {
      players: players.filter(p => norm(p.name).includes(n)).slice(0, LIMIT),
      scouting: scoutingPlayers.filter(p => norm(p.fullName).includes(n) || (p.team && norm(p.team).includes(n))).slice(0, LIMIT),
      firmas: firmasEntries.filter(e => norm(e.playerName).includes(n)).slice(0, LIMIT),
      clubs: clubs.filter(c => norm(c.name).includes(n)).slice(0, LIMIT),
      tasks: tasks.filter(t => t.status !== 'completada' && norm(t.title).includes(n)).slice(0, LIMIT),
    }
  }, [q, players, scoutingPlayers, firmasEntries, clubs, tasks])

  const total = results
    ? results.players.length + results.scouting.length + results.firmas.length + results.clubs.length + results.tasks.length
    : 0

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  )
  const Row = ({ onClick, main, sub }: { onClick: () => void; main: string; sub?: string }) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className="w-full flex items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50 active:bg-slate-100"
    >
      <span className="text-sm font-medium text-slate-800 truncate">{main}</span>
      {sub && <span className="text-[11px] text-slate-400 truncate">{sub}</span>}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative border-b border-slate-100">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
            placeholder="Buscar jugador, club, tarea…"
            className="w-full pl-10 pr-10 py-3 text-sm focus:outline-none"
          />
          <button onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto pb-2">
          {!results ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">Escribe al menos 2 letras. Busca en Mantenimiento, Captación, Firmar, clubes y tareas.</p>
          ) : total === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">Sin resultados para «{q}»</p>
          ) : (
            <>
              {results.players.length > 0 && (
                <Group title="Jugadores (Mantenimiento)">
                  {results.players.map(p => (
                    <Row key={p.id} onClick={() => onOpenPlayer(p.id)} main={p.name} sub={p.clubs[0]?.name} />
                  ))}
                </Group>
              )}
              {results.firmas.length > 0 && (
                <Group title="Firmar (pipeline)">
                  {results.firmas.map(e => (
                    <Row key={e.id} onClick={() => onOpenFirmasEntry(e.id)} main={e.playerName} sub={`${e.zone} · ${e.status}`} />
                  ))}
                </Group>
              )}
              {results.scouting.length > 0 && (
                <Group title="Captación (scouting)">
                  {results.scouting.map(p => (
                    <Row
                      key={p.id}
                      onClick={() => onOpenScoutingPlayer(p.id)}
                      main={p.fullName}
                      sub={[p.team, p.birthdate ? p.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ')}
                    />
                  ))}
                </Group>
              )}
              {results.clubs.length > 0 && (
                <Group title="Clubes (Distribución)">
                  {results.clubs.map(c => (
                    <Row key={c.id} onClick={() => onOpenClub(c.id)} main={c.name} sub={c.league} />
                  ))}
                </Group>
              )}
              {results.tasks.length > 0 && (
                <Group title="Tareas abiertas">
                  {results.tasks.map(t => (
                    <Row key={t.id} onClick={onGoTareas} main={t.title} sub={t.dueDate ? `límite ${t.dueDate}` : undefined} />
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
        <div className="hidden sm:block border-t border-slate-100 px-4 py-1.5 text-[10px] text-slate-400">
          Abrir con <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">⌘K</kbd> · cerrar con Esc
        </div>
      </div>
    </div>
  )
}

// ── Permiso de notificaciones del sistema ────────────────────
// Con permiso, los avisos de la campana también saltan como
// notificación del sistema cuando la pestaña está en segundo plano.
export function SystemNotifPrompt() {
  const [visible, setVisible] = useState(() =>
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default' &&
    sessionStorage.getItem('notif_prompt_dismissed') !== '1'
  )
  if (!visible) return null
  return (
    <div className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 bg-slate-800 text-white rounded-full pl-3.5 pr-1.5 py-1.5 shadow-lg text-xs">
      <Bell className="w-3.5 h-3.5 flex-shrink-0" />
      <span>¿Avisos aunque la app esté en segundo plano?</span>
      <button
        onClick={() => { void Notification.requestPermission().finally(() => setVisible(false)) }}
        className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 font-bold transition-colors"
      >
        Activar
      </button>
      <button
        onClick={() => { sessionStorage.setItem('notif_prompt_dismissed', '1'); setVisible(false) }}
        aria-label="Descartar"
        className="p-1 opacity-70 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/** Lanza una notificación del sistema (si hay permiso y la pestaña no está visible) */
export function fireSystemNotification(message: string) {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return
    const opts: NotificationOptions = { body: message, icon: '/icon-192.png', badge: '/icon-192.png' }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) void reg.showNotification('All Iron Sports', opts)
        else new Notification('All Iron Sports', opts)
      }).catch(() => { try { new Notification('All Iron Sports', opts) } catch { /* móvil sin soporte */ } })
    } else {
      new Notification('All Iron Sports', opts)
    }
  } catch { /* Notification no soportado (p. ej. iOS sin PWA instalada) */ }
}
