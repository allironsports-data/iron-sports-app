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
import { ChevronDown, Search, X, Sun, CalendarClock } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { parseDia } from '../lib/fechas'
import {
  itemEsDe, seccionesDelDia, categoriasDe, coincideTexto, permisosItem,
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
}

type SeccionId = 'vencidas' | 'hoy' | 'proximos' | 'masAdelante' | 'sinFecha' | 'hechasHoy'

function tituloDiaCorto(iso: string): string {
  return parseDia(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function MiDiaLista({
  items, hoy, personaId, esYo, profiles, onAbrir, onEstado, onReprogramar, onReasignar, onOpenPlayer,
}: MiDiaListaProps) {
  const [q, setQ] = useState('')
  const [categorias, setCategorias] = useState<Set<string>>(new Set())
  // Plegadas de entrada: lo ya hecho y lo que queda lejos
  const [plegadas, setPlegadas] = useState<Set<SeccionId>>(new Set(['hechasHoy', 'masAdelante']))
  const [confirmarMover, setConfirmarMover] = useState(false)
  const [moviendo, setMoviendo] = useState(false)

  const deLaPersona = useMemo(() => items.filter(it => itemEsDe(it, personaId)), [items, personaId])
  // Los chips cuentan lo abierto: son para decidir qué mirar, no un histórico
  const chips = useMemo(() => categoriasDe(deLaPersona.filter(it => it.estado !== 'completada')), [deLaPersona])
  const filtrados = useMemo(
    () => deLaPersona.filter(it =>
      (categorias.size === 0 || (!!it.categoria && categorias.has(it.categoria))) && coincideTexto(it, q)),
    [deLaPersona, categorias, q],
  )
  const s = useMemo(() => seccionesDelDia(filtrados, hoy), [filtrados, hoy])
  const nProximos = s.proximos.reduce((n, g) => n + g.items.length, 0)
  const nAbiertos = s.vencidas.length + s.hoy.length + nProximos + s.masAdelante.length + s.sinFecha.length
  const vencidasMovibles = s.vencidas.filter(it => permisosItem(it).reprogramar)
  const hayFiltro = categorias.size > 0 || q.trim() !== ''

  const alternar = (id: SeccionId) => setPlegadas(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const alternarCategoria = (c: string) => setCategorias(prev => {
    const n = new Set(prev)
    if (n.has(c)) n.delete(c); else n.add(c)
    return n
  })

  async function moverVencidasAHoy() {
    setConfirmarMover(false)
    setMoviendo(true)
    try {
      // De una en una: cada guardado parte del estado que dejó el anterior
      for (const it of vencidasMovibles) await onReprogramar(it, hoy)
    } finally {
      setMoviendo(false)
    }
  }

  const fila = (it: AgendaItem) => (
    <AgendaRow key={it.id} item={it} hoy={hoy} profiles={profiles}
      onAbrir={onAbrir} onEstado={onEstado} onReprogramar={onReprogramar} onReasignar={onReasignar}
      onOpenPlayer={onOpenPlayer} />
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

  return (
    <div>
      {/* Buscador + chips de categoría */}
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
        {chips.length > 1 && (<>
          <button
            onClick={() => setCategorias(new Set())}
            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
              categorias.size === 0 ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            Todas
          </button>
          {chips.map(c => {
            const sel = categorias.has(c.categoria)
            return (
              <button key={c.categoria} onClick={() => alternarCategoria(c.categoria)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                  sel ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {c.categoria} <span className={`font-normal ${sel ? 'text-white/70' : 'text-slate-400'}`}>{c.n}</span>
              </button>
            )
          })}
        </>)}
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
        {seccion('vencidas', 'Vencidas', s.vencidas.length, lista(s.vencidas), {
          rojo: true,
          extra: vencidasMovibles.length > 0 && (
            <button onClick={() => setConfirmarMover(true)} disabled={moviendo}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
              <CalendarClock className="w-3 h-3" /> {moviendo ? 'Moviendo…' : 'Mover todo a hoy'}
            </button>
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
