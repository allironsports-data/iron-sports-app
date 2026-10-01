// ── Fila de la agenda ────────────────────────────────────────────────
//
// Una línea por item de la lista unificada (lib/agendaItems.ts): icono de
// tipo · círculo de estado · título · jugador · categoría · fecha · avatar.
// La usan «Mi día» y, después, la home y la ficha de jugador: una sola
// fila para que una tarea se vea y se maneje igual en todas partes.
//
// Escritorio: las acciones salen al pasar el ratón. Móvil: deslizar a la
// derecha = hecha, a la izquierda = reprogramar; tocar = abrir.

import { useRef, useState } from 'react'
import {
  ListTodo, Phone, Smartphone, Handshake, ClipboardList, Trophy, CalendarDays,
  Check, CalendarClock, UserRound, ExternalLink,
} from 'lucide-react'
import type { Profile } from '../../contexts/AuthContext'
import { parseDia, sumarDias } from '../../lib/fechas'
import {
  permisosItem, siguienteEstado, lunesSiguiente,
  type AgendaItem, type AgendaTipo, type AgendaEstado,
} from '../../lib/agendaItems'

const AGENDA_TIPO_META: Record<AgendaTipo, { Icon: typeof ListTodo; cls: string; label: string }> = {
  tarea:       { Icon: ListTodo,      cls: 'text-slate-400',   label: 'Tarea' },
  llamada:     { Icon: Phone,         cls: 'text-amber-500',   label: 'Llamada (Firmar)' },
  telefono:    { Icon: Smartphone,    cls: 'text-amber-500',   label: 'Conseguir teléfono (Firmar)' },
  reunion:     { Icon: Handshake,     cls: 'text-violet-500',  label: 'Reunión' },
  postpartido: { Icon: ClipboardList, cls: 'text-blue-500',    label: 'Postpartido' },
  partido:     { Icon: Trophy,        cls: 'text-emerald-500', label: 'Partido de Captación' },
  evento:      { Icon: CalendarDays,  cls: 'text-slate-400',   label: 'Evento' },
}

const UMBRAL_SWIPE = 72

export interface AgendaRowProps {
  item: AgendaItem
  /** AAAA-MM-DD local */
  hoy: string
  profiles: Profile[]
  onAbrir: (item: AgendaItem) => void
  onEstado?: (item: AgendaItem, estado: AgendaEstado) => void
  /** fecha undefined = quitar la fecha */
  onReprogramar?: (item: AgendaItem, fecha: string | undefined) => void
  onReasignar?: (item: AgendaItem, profileId: string) => void
  onOpenPlayer?: (playerId: string) => void
}

function fechaCorta(iso: string): string {
  return parseDia(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function AgendaRow({
  item, hoy, profiles, onAbrir, onEstado, onReprogramar, onReasignar, onOpenPlayer,
}: AgendaRowProps) {
  const [menu, setMenu] = useState<null | 'fecha' | 'persona'>(null)
  const [dx, setDx] = useState(0)
  const toque = useRef<{ x: number; y: number } | null>(null)

  const p = permisosItem(item)
  const hecha = item.estado === 'completada'
  const vencida = !hecha && !!item.fecha && item.fecha < hoy
  const puedeEstado = p.estado && !!onEstado
  const puedeFecha = p.reprogramar && !!onReprogramar
  const puedePersona = p.reasignar && !!onReasignar
  const { Icon, cls, label } = AGENDA_TIPO_META[item.tipo]
  const persona = profiles.find(x => x.id === item.personId)

  const textoFecha = !item.fecha
    ? ''
    : item.fecha === hoy
      ? (item.hora ?? 'hoy')
      : `${fechaCorta(item.fecha)}${item.hora ? ` · ${item.hora}` : ''}`

  const colorEstado = hecha ? '#10b981' : item.estado === 'en_progreso' ? '#3b82f6' : undefined
  const tituloEstado = !puedeEstado ? undefined
    : hecha ? 'Reabrir'
    : siguienteEstado(item) === 'en_progreso' ? 'Pasar a en curso' : 'Marcar como hecha'

  // ── Swipe (móvil) ──
  const onTouchStart = (e: React.TouchEvent) => {
    if (menu) return
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!toque.current) return
    const ddx = e.touches[0].clientX - toque.current.x
    const ddy = e.touches[0].clientY - toque.current.y
    // Gesto vertical: es scroll, no swipe
    if (dx === 0 && Math.abs(ddy) > Math.abs(ddx)) { toque.current = null; return }
    const max = puedeEstado && !hecha ? 120 : 0
    const min = puedeFecha && !hecha ? -120 : 0
    setDx(Math.max(min, Math.min(max, ddx)))
  }
  const onTouchEnd = () => {
    if (dx > UMBRAL_SWIPE) onEstado?.(item, 'completada')
    else if (dx < -UMBRAL_SWIPE) setMenu('fecha')
    toque.current = null
    setDx(0)
  }

  const btnAccion = 'p-1 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors'

  return (
    <div className={`relative ${menu ? 'z-20' : ''}`}>
      {/* Fondo del swipe: lo que va a pasar al soltar */}
      {dx !== 0 && (
        <div className={`absolute inset-0 flex items-center px-3 text-[11px] font-semibold text-white ${dx > 0 ? 'bg-emerald-500 justify-start' : 'bg-blue-500 justify-end'}`}>
          {dx > 0 ? <><Check className="w-3.5 h-3.5 mr-1" /> Hecha</> : <>Reprogramar <CalendarClock className="w-3.5 h-3.5 ml-1" /></>}
        </div>
      )}
      <div
        onClick={() => onAbrir(item)}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={`group relative flex items-center gap-2 px-2.5 py-1.5 cursor-pointer ${vencida ? 'bg-red-50 hover:bg-red-100/70' : 'bg-white hover:bg-slate-50'} ${dx ? '' : 'transition-transform'}`}
      >
        <span title={label} className="flex-shrink-0"><Icon className={`w-3.5 h-3.5 ${cls}`} /></span>
        {/* Estado: pendiente → en curso → hecha */}
        <button
          onClick={e => { e.stopPropagation(); if (puedeEstado) onEstado!(item, siguienteEstado(item)) }}
          disabled={!puedeEstado}
          title={tituloEstado}
          aria-label="Cambiar estado"
          className="flex-shrink-0 p-1 -m-1 rounded-full disabled:cursor-default enabled:hover:bg-slate-200 transition-colors"
        >
          <span
            className={`block w-3.5 h-3.5 rounded-full border-2 ${colorEstado ? '' : 'border-slate-300'} ${puedeEstado ? '' : 'opacity-40'}`}
            style={colorEstado ? { background: colorEstado, borderColor: colorEstado } : undefined}
          />
        </button>
        <span className={`flex-1 min-w-0 truncate text-xs font-medium ${hecha ? 'line-through text-slate-400' : 'text-slate-800'}`} title={item.titulo}>
          {item.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle" title="Prioridad alta" />}
          {item.titulo}
        </span>
        {item.playerNombre && (
          item.playerId && onOpenPlayer ? (
            <button
              onClick={e => { e.stopPropagation(); onOpenPlayer(item.playerId!) }}
              title={`Abrir la ficha de ${item.playerNombre}`}
              className="flex-shrink-0 max-w-[7rem] sm:max-w-[11rem] truncate text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              {item.playerNombre}
            </button>
          ) : (
            <span className="flex-shrink-0 max-w-[7rem] sm:max-w-[11rem] truncate text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
              {item.playerNombre}
            </span>
          )
        )}
        {item.categoria && (
          <span className="hidden sm:inline flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
            {item.categoria}
          </span>
        )}
        {textoFecha && (
          <span className={`flex-shrink-0 text-[11px] tabular-nums ${vencida ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>{textoFecha}</span>
        )}
        <span
          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${persona ? 'text-white bg-primary' : 'text-slate-400 border border-dashed border-slate-300'}`}
          title={persona?.name ?? 'Sin asignar'}
        >
          {persona?.avatar ?? '?'}
        </span>

        {/* Acciones al pasar el ratón (escritorio) */}
        <div
          onClick={e => e.stopPropagation()}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 items-center gap-0.5 rounded-md bg-slate-100 border border-slate-200 px-0.5 py-0.5 shadow-sm ${menu ? 'flex' : 'hidden sm:group-hover:flex'}`}
        >
          {puedeEstado && !hecha && (
            <button onClick={() => onEstado!(item, 'completada')} title="Hecha" aria-label="Marcar como hecha" className={`${btnAccion} hover:!text-emerald-600`}>
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {puedeFecha && (
            <button onClick={() => setMenu(m => m === 'fecha' ? null : 'fecha')} title="Reprogramar" aria-label="Reprogramar" className={btnAccion}>
              <CalendarClock className="w-3.5 h-3.5" />
            </button>
          )}
          {puedePersona && (
            <button onClick={() => setMenu(m => m === 'persona' ? null : 'persona')} title="Reasignar" aria-label="Reasignar" className={btnAccion}>
              <UserRound className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onAbrir(item)} title="Abrir" aria-label="Abrir" className={btnAccion}>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
          <div className="absolute right-1.5 top-full -mt-0.5 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700">
            {menu === 'fecha' && (<>
              {([
                ['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Próxima semana', lunesSiguiente(hoy)],
              ] as const).map(([txt, f]) => (
                <button key={txt} onClick={() => { setMenu(null); onReprogramar?.(item, f) }}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-left">
                  {txt} <span className="text-[11px] text-slate-400">{fechaCorta(f)}</span>
                </button>
              ))}
              <label className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-100">
                Elegir
                <input
                  type="date" defaultValue={item.fecha ?? ''}
                  onChange={e => { if (e.target.value) { setMenu(null); onReprogramar?.(item, e.target.value) } }}
                  className="text-[11px] border border-slate-200 rounded px-1 py-0.5 w-[7.5rem]"
                />
              </label>
              {item.fecha && item.origen === 'tarea' && (
                <button onClick={() => { setMenu(null); onReprogramar?.(item, undefined) }}
                  className="w-full px-3 py-1.5 hover:bg-slate-50 text-left text-slate-500 border-t border-slate-100">
                  Quitar fecha
                </button>
              )}
            </>)}
            {menu === 'persona' && (
              <div className="max-h-56 overflow-y-auto">
                {profiles.map(pr => (
                  <button key={pr.id} onClick={() => { setMenu(null); if (pr.id !== item.personId) onReasignar?.(item, pr.id) }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 text-left ${pr.id === item.personId ? 'font-semibold text-primary' : ''}`}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">{pr.avatar}</span>
                    <span className="truncate">{pr.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
