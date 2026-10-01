// ── «Mi día» (pestaña de Mantenimiento) ──────────────────────────────
//
// Lista densa, una línea por item, de todo lo que le toca a una persona:
// tareas, acciones de Firmar, postpartidos, partidos y eventos. Los datos
// llegan ya unificados (lib/agendaItems.ts); aquí solo se filtran, se
// reparten en secciones y se pintan con AgendaRow.
//
// Qué hace cada acción (completar, reprogramar, reasignar, abrir) lo decide
// quien monta la vista: cada tipo de item se guarda en un sitio distinto.

import { useMemo, useState } from 'react'
import { ChevronDown, Search, X, Sun, CalendarClock, Plus } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { parseDia, sumarDias } from '../lib/fechas'
import { parsearAltaRapida, type AltaRapida } from '../lib/altaRapida'
import {
  itemEsDe, seccionesDelDia, categoriasDe, coincideTexto, permisosItem, lunesSiguiente,
  type AgendaItem, type AgendaEstado,
} from '../lib/agendaItems'
import { AgendaRow } from '../components/agenda/AgendaRow'
import { EmptyState } from '../components/EmptyState'
import { ConfirmModal } from '../components/ConfirmModal'

export interface MiDiaListaProps {
  /** Lista unificada de TODO el equipo; aquí se filtra por persona */
  items: AgendaItem[]
  /** AAAA-MM-DD local */
  hoy: string
  /** profiles.id de la persona cuyo día se mira */
  personaId: string
  /** true si la persona es quien usa la app (cambia los textos) */
  esYo: boolean
  profiles: Profile[]
  onAbrir: (item: AgendaItem) => void
  onEstado: (item: AgendaItem, estado: AgendaEstado) => void | Promise<void>
  onReprogramar: (item: AgendaItem, fecha: string | undefined) => void | Promise<void>
  onReasignar: (item: AgendaItem, profileId: string) => void | Promise<void>
  onOpenPlayer: (playerId: string) => void
  onOpenScoutingPlayer?: (scoutingPlayerId: string) => void
  /** Alta rápida en una línea; si no llega, no se pinta */
  onCrear?: (alta: AltaRapida) => Promise<void>
}

type SeccionId = 'vencidas' | 'hoy' | 'proximos' | 'masAdelante' | 'sinFecha' | 'hechasHoy'

function tituloDiaCorto(iso: string): string {
  return parseDia(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function MiDiaLista({
  items, hoy, personaId, esYo, profiles, onAbrir, onEstado, onReprogramar, onReasignar, onOpenPlayer, onOpenScoutingPlayer, onCrear,
}: MiDiaListaProps) {
  // Alta rápida
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const alta = useMemo(() => parsearAltaRapida(nueva, { hoy, profiles }), [nueva, hoy, profiles])
  // Selección múltiple de vencidas
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  // Plegadas de entrada: lo ya hecho y lo que queda lejos
  const [plegadas, setPlegadas] = useState<Set<SeccionId>>(new Set(['hechasHoy', 'masAdelante']))
  const [confirmarMover, setConfirmarMover] = useState(false)
  const [moviendo, setMoviendo] = useState(false)

  const deLaPersona = useMemo(() => items.filter(it => itemEsDe(it, personaId)), [items, personaId])
  // El desplegable cuenta lo abierto: son para decidir qué mirar, no un histórico
  const chips = useMemo(() => categoriasDe(deLaPersona.filter(it => it.estado !== 'completada')), [deLaPersona])
  const filtrados = useMemo(
    () => deLaPersona.filter(it =>
      (!categoria || it.categoria === categoria) && coincideTexto(it, q)),
    [deLaPersona, categoria, q],
  )
  const s = useMemo(() => seccionesDelDia(filtrados, hoy), [filtrados, hoy])
  const nProximos = s.proximos.reduce((n, g) => n + g.items.length, 0)
  const nAbiertos = s.vencidas.length + s.hoy.length + nProximos + s.masAdelante.length + s.sinFecha.length
  const vencidasMovibles = s.vencidas.filter(it => permisosItem(it).reprogramar)
  const hayFiltro = !!categoria || q.trim() !== ''

  const alternar = (id: SeccionId) => setPlegadas(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  // De una en una: cada guardado parte del estado que dejó el anterior
  async function moverVarias(its: AgendaItem[], fecha: string) {
    setMoviendo(true)
    try {
      for (const it of its) await onReprogramar(it, fecha)
    } finally {
      setMoviendo(false)
    }
  }
  async function moverVencidasAHoy() {
    setConfirmarMover(false)
    await moverVarias(vencidasMovibles, hoy)
  }
  const seleccionadas = vencidasMovibles.filter(it => seleccion.has(it.id))
  const salirDeSeleccion = () => { setSeleccionando(false); setSeleccion(new Set()) }
  async function moverSeleccion(fecha: string) {
    await moverVarias(seleccionadas, fecha)
    salirDeSeleccion()
  }
  const alternarSeleccion = (it: AgendaItem) => setSeleccion(prev => {
    const n = new Set(prev)
    if (n.has(it.id)) n.delete(it.id); else n.add(it.id)
    return n
  })

  async function crear() {
    if (!onCrear || !alta.titulo || creando) return
    setCreando(true)
    try {
      await onCrear(alta)
      setNueva('')
    } catch { /* quien crea ya avisa; el texto se queda para reintentar */ } finally {
      setCreando(false)
    }
  }

  const fila = (it: AgendaItem) => (
    <AgendaRow key={it.id} item={it} hoy={hoy} profiles={profiles}
      onAbrir={onAbrir} onEstado={onEstado} onReprogramar={onReprogramar} onReasignar={onReasignar}
      onOpenPlayer={onOpenPlayer} onOpenScoutingPlayer={onOpenScoutingPlayer} />
  )

  function seccion(id: SeccionId, titulo: string, n: number, cuerpo: React.ReactNode, opts: { rojo?: boolean; extra?: React.ReactNode } = {}) {
    if (n === 0) return null
    const abierta = !plegadas.has(id)
    return (
      <section key={id} className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => alternar(id)} aria-expanded={abierta}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${abierta ? '' : '-rotate-90'}`} />
            <span className={opts.rojo ? 'text-red-600' : ''}>{titulo}</span>
            <span className={`font-semibold rounded-full px-1.5 py-px ${opts.rojo ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'}`}>{n}</span>
          </button>
          {abierta && opts.extra}
        </div>
        {abierta && cuerpo}
      </section>
    )
  }

  const lista = (its: AgendaItem[]) => (
    <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">{its.map(fila)}</div>
  )
  // Vencidas en modo selección: casilla delante de las que se pueden mover
  const filaVencida = (it: AgendaItem) => seleccionando && permisosItem(it).reprogramar
    ? <AgendaRow key={it.id} item={it} hoy={hoy} profiles={profiles} onAbrir={alternarSeleccion}
        seleccionada={seleccion.has(it.id)} onSeleccionar={alternarSeleccion} />
    : fila(it)
  const personaAlta = alta.assigneeId ? profiles.find(p => p.id === alta.assigneeId) : undefined

  return (
    <div>
      {/* Alta rápida: título @persona #categoría fecha ! */}
      {onCrear && (
        <div className="mb-3">
          <div className="relative">
            <Plus className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void crear(); if (e.key === 'Escape') setNueva('') }}
              disabled={creando}
              placeholder="Nueva tarea…  @persona  #categoría  mañana · viernes · 15/10  !  — Enter para crear"
              aria-label="Alta rápida de tarea"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
            />
          </div>
          {nueva.trim() && (
            <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
              <span className="text-slate-400">Se creará:</span>
              <span className="font-semibold text-slate-700">
                {alta.prioridadAlta && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle" />}
                {alta.titulo || '(falta el título)'}
              </span>
              {personaAlta && <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">@{personaAlta.name.split(' ')[0]}</span>}
              {alta.label && <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">#{alta.label}</span>}
              {alta.dueDate && <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">{tituloDiaCorto(alta.dueDate)}</span>}
              {alta.sinResolver.length > 0 && <span className="text-amber-600">No reconozco {alta.sinResolver.join(', ')}</span>}
            </div>
          )}
        </div>
      )}

      {/* Buscador + categoría */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en la lista…" aria-label="Buscar en la lista"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {(chips.length > 1 || categoria) && (
          <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Todas las categorías</option>
            {chips.map(c => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.n})</option>)}
          </select>
        )}
      </div>

      {nAbiertos === 0 && s.hechasHoy.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg">
          <EmptyState
            icon={<Sun className="w-10 h-10" />}
            title={hayFiltro ? 'Nada coincide con el filtro' : esYo ? 'No tienes nada pendiente' : 'No tiene nada pendiente'}
            subtitle={hayFiltro ? 'Prueba a quitar la búsqueda o las categorías.' : 'Ni tareas, ni acciones de Firmar, ni postpartidos, ni partidos próximos.'}
          />
        </div>
      ) : (<>
        {seccion('vencidas', 'Vencidas', s.vencidas.length, (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">{s.vencidas.map(filaVencida)}</div>
        ), {
          rojo: true,
          extra: vencidasMovibles.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => seleccionando ? salirDeSeleccion() : setSeleccionando(true)} disabled={moviendo}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
                {seleccionando ? 'Cancelar selección' : 'Seleccionar'}
              </button>
              {!seleccionando && (
                <button onClick={() => setConfirmarMover(true)} disabled={moviendo}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
                  <CalendarClock className="w-3 h-3" /> {moviendo ? 'Moviendo…' : 'Mover todo a hoy'}
                </button>
              )}
            </div>
          ),
        })}
        {seccion('hoy', 'Hoy', s.hoy.length, lista(s.hoy))}
        {seccion('proximos', 'Próximos 7 días', nProximos, (
          <div className="bg-white border border-slate-200 rounded-lg overflow-visible">
            {s.proximos.map(g => (
              <div key={g.dia} className="border-b border-slate-100 last:border-b-0">
                <p className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-semibold text-slate-400 first-letter:uppercase">
                  {tituloDiaCorto(g.dia)} <span className="font-normal">· {g.items.length}</span>
                </p>
                <div className="divide-y divide-slate-100">{g.items.map(fila)}</div>
              </div>
            ))}
          </div>
        ))}
        {seccion('sinFecha', 'Sin fecha', s.sinFecha.length, lista(s.sinFecha))}
        {seccion('masAdelante', 'Más adelante', s.masAdelante.length, lista(s.masAdelante))}
        {seccion('hechasHoy', 'Hechas hoy', s.hechasHoy.length, lista(s.hechasHoy))}
      </>)}

      {/* Acciones en masa: por encima de la barra inferior del móvil (z-30) */}
      {seleccionando && seleccionadas.length > 0 && (
        <div className="fixed inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg bottom-[var(--nav-h)]">
          <div className="px-3 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 mr-auto">
              {seleccionadas.length} seleccionada{seleccionadas.length !== 1 ? 's' : ''} · mover a
            </span>
            {([['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Próxima semana', lunesSiguiente(hoy)]] as const).map(([txt, f]) => (
              <button key={txt} onClick={() => void moverSeleccion(f)} disabled={moviendo}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {txt}
              </button>
            ))}
            <button onClick={salirDeSeleccion} disabled={moviendo} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmarMover}
        title={`¿Mover ${vencidasMovibles.length} vencida${vencidasMovibles.length !== 1 ? 's' : ''} a hoy?`}
        message="Se cambia la fecha de todas a hoy. Las acciones de Firmar se mueven también en su tarjeta del pipeline."
        confirmLabel="Mover a hoy"
        variant="default"
        onConfirm={moverVencidasAHoy}
        onCancel={() => setConfirmarMover(false)}
      />
    </div>
  )
}
