import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, Bell } from 'lucide-react'
import { Dialog, Button, IconButton } from './ui'
import { L } from '../lib/labels'
import type { Player, ScoutingPlayer, FirmasEntry, Club, Task } from '../types'
import { onSavingChange } from '../lib/supabase'
import { norm } from '../lib/texto'

// ═════════════════════════════════════════════════════════════
// Extras globales de la app: indicador de guardado, barra de
// navegación inferior (móvil), búsqueda global (⌘K) y permiso
// de notificaciones del sistema.
// ═════════════════════════════════════════════════════════════



// ── Indicador global de guardado ─────────────────────────────
export function SavingIndicator() {
  const [inflight, setInflight] = useState(0)
  const [justSaved, setJustSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSaving = useRef(false)

  useEffect(() => {
    const off = onSavingChange(n => {
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
    })
    // Al desmontar también cancelamos el timer pendiente (setState huérfano).
    return () => {
      off()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (inflight === 0 && !justSaved) return null
  return (
    <div className="fixed top-2 right-2 z-[60] pointer-events-none">
      <span role="status" className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-badge font-medium shadow-sm border ${
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
// Vive en shell/BottomNav.tsx; se reexporta aquí para no romper imports.
export { BottomNav } from './shell/BottomNav'

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
  /** Si se pasa, una tarea abre su detalle; si no, se va al tablero (onGoTareas) */
  onOpenTask?: (id: string) => void
}

/** Resultado plano para la navegación con teclado (índice global). */
interface Resultado {
  id: string
  main: string
  sub?: string
  run: () => void
}

interface Grupo { title: string; items: Resultado[] }

const MIN_LETRAS = 2
const LIMIT = 5

export function GlobalSearch({
  players, scoutingPlayers, firmasEntries, clubs, tasks,
  onClose, onOpenPlayer, onOpenScoutingPlayer, onOpenFirmasEntry, onOpenClub, onGoTareas, onOpenTask,
}: SearchProps) {
  const [q, setQ] = useState('')
  const [activo, setActivo] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const grupos = useMemo<Grupo[] | null>(() => {
    const n = norm(q)
    if (n.length < MIN_LETRAS) return null
    const g: Grupo[] = [
      {
        title: 'Jugadores (Mantenimiento)',
        items: players.filter(p => norm(p.name).includes(n)).slice(0, LIMIT)
          .map(p => ({ id: `p-${p.id}`, main: p.name, sub: p.clubs[0]?.name, run: () => onOpenPlayer(p.id) })),
      },
      {
        title: `${L.firmar} (Captación)`,
        items: firmasEntries.filter(e => norm(e.playerName).includes(n)).slice(0, LIMIT)
          .map(e => ({ id: `f-${e.id}`, main: e.playerName, sub: `${e.zone} · ${e.status}`, run: () => onOpenFirmasEntry(e.id) })),
      },
      {
        title: 'Captación (scouting)',
        items: scoutingPlayers.filter(p => norm(p.fullName).includes(n) || (p.team && norm(p.team).includes(n))).slice(0, LIMIT)
          .map(p => ({
            id: `s-${p.id}`, main: p.fullName,
            sub: [p.team, p.birthdate ? p.birthdate.slice(0, 4) : null].filter(Boolean).join(' · '),
            run: () => onOpenScoutingPlayer(p.id),
          })),
      },
      {
        title: 'Clubes (Distribución)',
        items: clubs.filter(c => norm(c.name).includes(n)).slice(0, LIMIT)
          .map(c => ({ id: `c-${c.id}`, main: c.name, sub: c.league, run: () => onOpenClub(c.id) })),
      },
      {
        title: 'Tareas abiertas',
        items: tasks.filter(t => t.status !== 'completada' && norm(t.title).includes(n)).slice(0, LIMIT)
          .map(t => ({
            id: `t-${t.id}`, main: t.title, sub: t.dueDate ? `límite ${t.dueDate}` : undefined,
            run: () => (onOpenTask ? onOpenTask(t.id) : onGoTareas()),
          })),
      },
    ]
    return g.filter(x => x.items.length > 0)
  }, [q, players, scoutingPlayers, firmasEntries, clubs, tasks, onOpenPlayer, onOpenFirmasEntry, onOpenScoutingPlayer, onOpenClub, onOpenTask, onGoTareas])

  const planos = useMemo(() => (grupos ?? []).flatMap(g => g.items), [grupos])
  const total = planos.length

  // La opción activa se mantiene visible al moverse con las flechas
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${activo}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'nearest' }) } catch { /* jsdom */ }
    }
  }, [activo])

  const elegir = (r: Resultado) => { r.run(); onClose() }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (total === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => (i + 1) % total) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => (i - 1 + total) % total) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = planos[activo]; if (r) elegir(r) }
  }

  const listboxId = 'gsearch-lista'
  const activoId = total > 0 ? `gsearch-opt-${activo}` : undefined

  return (
    <Dialog
      open
      onClose={onClose}
      title={L.buscar}
      size="md"
      mobile="center"
      initialFocus={inputRef}
      historyKey="global-search"
      className="sm:self-start sm:mt-[8vh]"
    >
      <div className="-mx-4 sm:-mx-5 -my-4">
        <div className="relative border-b border-slate-200">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActivo(0) }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={total > 0}
            aria-controls={listboxId}
            aria-activedescendant={activoId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Jugador, club, tarea… (mín. 2 letras)"
            className="w-full pl-10 pr-4 py-3 text-body text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <div ref={listaRef} id={listboxId} role="listbox" aria-label="Resultados" className="max-h-[55vh] overflow-y-auto pb-2">
          {!grupos ? (
            <p className="px-4 py-6 text-secondary text-slate-500 text-center">
              Escribe al menos {MIN_LETRAS} letras. Busca en Mantenimiento, Captación, {L.firmar}, clubes y tareas.
            </p>
          ) : total === 0 ? (
            <p className="px-4 py-6 text-secondary text-slate-500 text-center">Sin resultados para «{q}»</p>
          ) : (
            (() => {
              let idx = -1
              return grupos.map(g => (
                <div key={g.title} role="group" aria-label={g.title}>
                  <div className="px-3 pt-2.5 pb-1 text-badge font-bold uppercase tracking-wide text-slate-500">{g.title}</div>
                  {g.items.map(r => {
                    idx += 1
                    const i = idx
                    const sel = i === activo
                    return (
                      <button
                        key={r.id}
                        type="button"
                        id={`gsearch-opt-${i}`}
                        data-idx={i}
                        role="option"
                        aria-selected={sel}
                        tabIndex={-1}
                        onMouseEnter={() => setActivo(i)}
                        onClick={() => elegir(r)}
                        className={`w-full flex items-baseline gap-2 px-3 py-2 text-left min-h-11 sm:min-h-0 ${sel ? 'bg-primary/10' : 'hover:bg-slate-50'} active:bg-slate-100`}
                      >
                        <span className="text-body font-medium text-slate-800 truncate">{r.main}</span>
                        {r.sub && <span className="text-meta text-slate-500 truncate">{r.sub}</span>}
                      </button>
                    )
                  })}
                </div>
              ))
            })()
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 border-t border-slate-200 px-4 py-1.5 text-meta text-slate-500">
          <span><kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">↑↓</kbd> moverse</span>
          <span><kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">Enter</kbd> abrir</span>
          <span><kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">Esc</kbd> cerrar</span>
          <span className="ml-auto">Abrir con <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">⌘K</kbd></span>
        </div>
      </div>
    </Dialog>
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
    <div
      role="status"
      className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+8px)] sm:bottom-4 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 bg-slate-800 text-white rounded-full pl-3.5 pr-1 py-1 shadow-lg text-secondary max-w-[calc(100vw-1.5rem)]"
    >
      <Bell className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">¿Avisos aunque la app esté en segundo plano?</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => { void Notification.requestPermission().finally(() => setVisible(false)) }}
        className="rounded-full bg-white/20 hover:bg-white/30 text-white font-bold h-9 sm:h-7"
      >
        Activar
      </Button>
      <IconButton
        label="Descartar aviso"
        onClick={() => { sessionStorage.setItem('notif_prompt_dismissed', '1'); setVisible(false) }}
        className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
      >
        <X />
      </IconButton>
    </div>
  )
}
