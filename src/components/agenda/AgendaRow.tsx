// ── Fila de la agenda ────────────────────────────────────────────────
//
// Una línea por item de la lista unificada (lib/agendaItems.ts): icono de
// tipo · círculo de estado · título · jugador · categoría · fecha · avatar.
// La usan «Mi día» y, después, la home y la ficha de jugador: una sola
// fila para que una tarea se vea y se maneje igual en todas partes.
//
// Escritorio: las acciones salen al pasar el ratón. Móvil: deslizar a la
// derecha = hecha, a la izquierda = reprogramar; tocar = abrir; y «⋯» al
// final de la fila saca las mismas acciones (incluida reasignar).

import { useRef, useState } from 'react'
import { Check, CalendarClock, UserRound, ExternalLink, MoreHorizontal, Handshake } from 'lucide-react'
import type { Profile } from '../../contexts/AuthContext'
import { parseDia, sumarDias } from '../../lib/fechas'
import {
  permisosItem, siguienteEstado, lunesSiguiente,
  type AgendaItem, type AgendaEstado,
} from '../../lib/agendaItems'
import { AGENDA_TIPO_META } from './tipoMeta'

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
  /**
   * De quién es la lista que se está mirando. Si llega y el responsable del
   * item es otra persona, la fila se pinta como «adjunto»: la ves porque eres
   * encargado del jugador o te han añadido, pero no te toca hacerla a ti.
   */
  vistaDe?: string
  /** Abre la ficha de Captación del jugador (tareas ligadas a un jugador de scouting) */
  onOpenScoutingPlayer?: (scoutingPlayerId: string) => void
  /** Reunión del pipeline sin cerrar: abre el formulario de recap + siguiente paso */
  onCerrarReunion?: (eventoId: string) => void
  /** Selección múltiple: si llega, sale una casilla delante */
  seleccionada?: boolean
  onSeleccionar?: (item: AgendaItem) => void
}

function fechaCorta(iso: string): string {
  return parseDia(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function AgendaRow({
  item, hoy, profiles, onAbrir, onEstado, onReprogramar, onReasignar, onOpenPlayer, onOpenScoutingPlayer, vistaDe,
  seleccionada, onSeleccionar, onCerrarReunion,
}: AgendaRowProps) {
  const [menu, setMenu] = useState<null | 'fecha' | 'persona'>(null)
  const [dx, setDx] = useState(0)
  // Móvil: barra de acciones abierta con «⋯» (en escritorio sale al pasar el ratón)
  const [acciones, setAcciones] = useState(false)
  const toque = useRef<{ x: number; y: number } | null>(null)

  const p = permisosItem(item)
  const hecha = item.estado === 'completada'
  // Eventos y partidos no son tareas: ni se tachan ni vencen
  const esTarea = item.origen !== 'evento' && item.origen !== 'captacion'
  const tachar = hecha && esTarea
  const vencida = !hecha && esTarea && !!item.fecha && item.fecha < hoy
  const puedeEstado = p.estado && !!onEstado
  const puedeFecha = p.reprogramar && !!onReprogramar
  const puedePersona = p.reasignar && !!onReasignar
  const { Icon, cls, label } = AGENDA_TIPO_META[item.tipo]
  const persona = profiles.find(x => x.id === item.personId)
  // Adjunto: no soy el responsable, solo la sigo
  const adjunto = !!vistaDe && item.personId !== vistaDe

  const textoFecha = !item.fecha
    ? ''
    : item.fecha === hoy
      ? (item.hora ?? 'hoy')
      : `${fechaCorta(item.fecha)}${item.hora ? ` · ${item.hora}` : ''}`

  const colorEstado = hecha ? '#10b981' : item.estado === 'en_progreso' ? '#3b82f6' : undefined
  const tituloEstado = !puedeEstado ? undefined
    : item.origen === 'captacion' ? (hecha ? 'Marcar como no visto' : 'Marcar como visto')
    : hecha ? 'Reabrir'
    : siguienteEstado(item) === 'en_progreso' ? 'Pasar a en curso' : 'Marcar como hecha'

  // ── Swipe (móvil) ──
  const onTouchStart = (e: React.TouchEvent) => {
    if (menu || acciones) return
    const x = e.touches[0].clientX
    // Pegado al borde es el gesto «atrás» del navegador: no se compite con él
    if (x < 24 || x > window.innerWidth - 24) return
    toque.current = { x, y: e.touches[0].clientY }
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

  const btnAccion = 'p-2 sm:p-1 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors'

  return (
    <div className={`relative ${menu || acciones ? 'z-20' : ''}`}>
      {/* Fondo del swipe: lo que va a pasar al soltar */}
      {dx !== 0 && (
        <div className={`absolute inset-0 flex items-center px-3 text-[11px] font-semibold text-white ${dx > 0 ? 'bg-emerald-500 justify-start' : 'bg-blue-500 justify-end'}`}>
          {dx > 0 ? <><Check className="w-3.5 h-3.5 mr-1" /> Hecha</> : <>Reprogramar <CalendarClock className="w-3.5 h-3.5 ml-1" /></>}
        </div>
      )}
      <div
        onClick={() => onAbrir(item)}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ touchAction: 'pan-y', ...(dx ? { transform: `translateX(${dx}px)` } : {}) }}
        className={`group relative flex items-center gap-2 px-2.5 py-1.5 cursor-pointer ${vencida ? 'bg-red-50 hover:bg-red-100/70' : adjunto ? 'bg-slate-50 hover:bg-slate-100' : 'bg-white hover:bg-slate-50'} ${adjunto ? 'border-l-2 border-l-slate-300' : vistaDe ? 'border-l-2 border-l-primary' : ''} ${dx ? '' : 'transition-transform'}`}
      >
        {onSeleccionar && (
          <input
            type="checkbox" checked={!!seleccionada}
            onChange={() => onSeleccionar(item)} onClick={e => e.stopPropagation()}
            aria-label="Seleccionar" className="w-3.5 h-3.5 rounded flex-shrink-0"
          />
        )}
        <span title={label} className="flex-shrink-0"><Icon className={`w-3.5 h-3.5 ${cls}`} /></span>
        {/* Estado: pendiente → en curso → hecha */}
        {/* Solo lo que se puede completar lleva círculo: un evento no es una tarea */}
        {p.estado ? (
          <button
            onClick={e => { e.stopPropagation(); if (puedeEstado) onEstado!(item, siguienteEstado(item)) }}
            disabled={!puedeEstado}
            title={tituloEstado}
            aria-label="Cambiar estado"
            className="relative flex-shrink-0 p-1 -m-1 rounded-full disabled:cursor-default enabled:hover:bg-slate-200 transition-colors before:absolute before:-inset-2 before:content-[''] sm:before:hidden"
          >
            <span
              className={`block w-3.5 h-3.5 rounded-full border-2 ${colorEstado ? '' : 'border-slate-300'} ${puedeEstado ? '' : 'opacity-40'}`}
              style={colorEstado ? { background: colorEstado, borderColor: colorEstado } : undefined}
            />
          </button>
        ) : <span className="w-3.5 flex-shrink-0" />}
        <span className={`flex-1 min-w-0 line-clamp-2 sm:line-clamp-1 break-words text-xs font-medium ${tachar ? 'line-through text-slate-400' : adjunto ? 'text-slate-500 font-normal' : 'text-slate-800'}`} title={item.titulo}>
          {item.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle" title="Prioridad alta" />}
          {item.titulo}
          {item.conInforme && <Check className="inline w-3 h-3 ml-1 text-emerald-500" aria-label="Informe hecho" />}
        </span>
        {item.cierreEventoId && onCerrarReunion && (
          <button
            onClick={e => { e.stopPropagation(); onCerrarReunion(item.cierreEventoId!) }}
            title="Apuntar el recap y el siguiente paso"
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            <Handshake className="w-3 h-3" /> Cerrar
          </button>
        )}
        {adjunto && (
          <span className="flex-shrink-0 text-[11px] italic text-slate-400" title={`La lleva ${persona?.name ?? 'otra persona'}; tú estás como adjunto`}>adjunto</span>
        )}
        {item.playerNombre && (
          item.playerId && onOpenPlayer ? (
            <button
              onClick={e => { e.stopPropagation(); onOpenPlayer(item.playerId!) }}
              title={`Abrir la ficha de ${item.playerNombre}`}
              className="flex-shrink-0 max-w-[5.5rem] sm:max-w-[11rem] truncate text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              {item.playerNombre}
            </button>
          ) : item.scoutingPlayerId && onOpenScoutingPlayer ? (
            <button
              onClick={e => { e.stopPropagation(); onOpenScoutingPlayer(item.scoutingPlayerId!) }}
              title={`Abrir la ficha de Captación de ${item.playerNombre}`}
              className="flex-shrink-0 max-w-[5.5rem] sm:max-w-[11rem] truncate text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
            >
              {item.playerNombre}
            </button>
          ) : (
            <span className="flex-shrink-0 max-w-[5.5rem] sm:max-w-[11rem] truncate text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
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

        {/* Móvil: «⋯» abre las acciones (con el ratón salen solas) */}
        <button
          onClick={e => { e.stopPropagation(); setAcciones(true) }}
          aria-label="Acciones"
          className="sm:hidden relative flex-shrink-0 p-1 -my-1 -mr-1 text-slate-400 before:absolute before:-inset-2 before:content-['']"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {/* Acciones: al pasar el ratón (escritorio) o con «⋯» (móvil) */}
        <div
          onClick={e => e.stopPropagation()}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 items-center gap-0.5 rounded-md bg-slate-100 border border-slate-200 px-0.5 py-0.5 shadow-sm ${menu || acciones ? 'flex' : 'hidden sm:group-hover:flex sm:group-focus-within:flex'}`}
        >
          {puedeEstado && !hecha && (
            <button onClick={() => { setAcciones(false); onEstado!(item, 'completada') }} title="Hecha" aria-label="Marcar como hecha" className={`${btnAccion} hover:!text-emerald-600`}>
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
          <button onClick={() => { setAcciones(false); onAbrir(item) }} title="Abrir" aria-label="Abrir" className={btnAccion}>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {acciones && !menu && <div className="fixed inset-0 z-10" onClick={() => setAcciones(false)} />}
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setMenu(null); setAcciones(false) }} />
          <div className="absolute right-1.5 top-full -mt-0.5 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700">
            {menu === 'fecha' && (<>
              {([
                ['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Próxima semana', lunesSiguiente(hoy)],
              ] as const).map(([txt, f]) => (
                <button key={txt} onClick={() => { setMenu(null); setAcciones(false); onReprogramar?.(item, f) }}
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
                  <button key={pr.id} onClick={() => { setMenu(null); setAcciones(false); if (pr.id !== item.personId) onReasignar?.(item, pr.id) }}
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
