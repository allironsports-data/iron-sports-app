// ── «Mi día» (pestaña de Mantenimiento) ──────────────────────────────
//
// Lista densa, una línea por item, de todo lo que le toca a una persona:
// tareas, acciones de Firmar, postpartidos, partidos y eventos. Los datos
// llegan ya unificados (lib/agendaItems.ts); aquí solo se filtran, se
// reparten en bloques y se pintan con AgendaRow.
//
// El día tiene dos naturalezas: la AGENDA (citas, se asiste) y el TRABAJO
// (se hace). Lo atrasado no es una sección aparte: es trabajo de hoy, con
// retraso, y va el primero. Las tareas en curso son PROCESOS: salen siempre
// y exigen una nota a la semana (si falta, un aviso fijo arriba lo pide).
// Lo que no tiene fecha es «algún día»: vive en la BANDEJA, fuera del día.
// Por la tarde, lo que queda abierto pide decidir qué se hace con ello.
//
// Qué hace cada acción (completar, reprogramar, reasignar, abrir) lo decide
// quien monta la vista: cada tipo de item se guarda en un sitio distinto.

import { useMemo, useState } from 'react'
import { ChevronDown, Search, X, Sun, CalendarClock, Plus, Inbox, Moon, RefreshCw, ExternalLink } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { parseDia, sumarDias } from '../lib/fechas'
import { parsearAltaRapida, type AltaRapida } from '../lib/altaRapida'
import {
  itemEsDe, seccionesDelDia, categoriasDe, coincideTexto, permisosItem, lunesSiguiente, viernesSemana,
  procesosSinActualizar, pendientesDeCierre, DIAS_ACTUALIZACION_PROCESO,
  type AgendaItem, type AgendaEstado,
} from '../lib/agendaItems'
import { AgendaRow } from '../components/agenda/AgendaRow'
import { EmptyState } from '../components/EmptyState'
import { ConfirmModal } from '../components/ConfirmModal'
import { useOrdenManual, aplicarOrden, recolocar } from '../lib/ordenManual'

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
  /** Reunión del pipeline sin cerrar: abre el formulario de cierre */
  onCerrarReunion?: (eventoId: string) => void
  /** Alta rápida en una línea; si no llega, no se pinta */
  onCrear?: (alta: AltaRapida) => Promise<void>
  /** "HH:MM" de ahora: a partir de las 18:00 se propone el cierre del día */
  ahoraHora?: string
  /** Escribe la nota semanal de un proceso (tarea en curso). Sin esto no se exige. */
  onActualizarProceso?: (taskId: string, texto: string) => Promise<void>
}

type SeccionId = 'agenda' | 'hoy' | 'procesos' | 'proximos' | 'masAdelante' | 'hechasHoy'

const SIN_NOVEDADES = 'Sin novedades esta semana'

function tituloDiaCorto(iso: string): string {
  return parseDia(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function MiDiaLista({
  items, hoy, personaId, esYo, profiles, onAbrir, onEstado, onReprogramar, onReasignar, onOpenPlayer, onOpenScoutingPlayer, onCerrarReunion, onCrear,
  ahoraHora, onActualizarProceso,
}: MiDiaListaProps) {
  // Alta rápida
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const alta = useMemo(() => parsearAltaRapida(nueva, { hoy, profiles }), [nueva, hoy, profiles])
  // Selección múltiple de lo atrasado
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  // Día o bandeja (lo sin fecha se mira aparte, no mezclado con el día)
  const [vista, setVista] = useState<'dia' | 'bandeja'>('dia')
  // Plegadas de entrada: lo ya hecho y lo que queda lejos
  const [plegadas, setPlegadas] = useState<Set<SeccionId>>(new Set(['hechasHoy', 'masAdelante']))
  const [confirmarMover, setConfirmarMover] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  // Cierre del día: «Luego» lo esconde hasta mañana
  const claveCierre = `cierreDia:${hoy}:${personaId}`
  const [cierreOculto, setCierreOculto] = useState(() => { try { return localStorage.getItem(claveCierre) === '1' } catch { return false } })
  // Actualización semanal de procesos: texto por tarea
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [guardandoNota, setGuardandoNota] = useState<string | null>(null)
  const [errorNota, setErrorNota] = useState<string | null>(null)

  const deLaPersona = useMemo(() => items.filter(it => itemEsDe(it, personaId)), [items, personaId])
  // El desplegable cuenta lo abierto: son para decidir qué mirar, no un histórico
  const chips = useMemo(() => categoriasDe(deLaPersona.filter(it => it.estado !== 'completada')), [deLaPersona])
  const filtrados = useMemo(
    () => deLaPersona.filter(it =>
      (!categoria || it.categoria === categoria) && coincideTexto(it, q)),
    [deLaPersona, categoria, q],
  )
  // Orden manual: solo en la lista propia (el orden es personal). Cada bloque
  // (Agenda, Hoy, Procesos, cada día, Bandeja, Más adelante) se ordena por separado.
  const { orden, guardar: guardarOrden } = useOrdenManual(esYo ? personaId : undefined)
  const s = useMemo(() => {
    const base = seccionesDelDia(filtrados, hoy)
    if (!esYo) return base
    return {
      ...base,
      agenda: aplicarOrden(base.agenda, orden),
      hoy: aplicarOrden(base.hoy, orden),
      procesos: aplicarOrden(base.procesos, orden),
      proximos: base.proximos.map(g => ({ ...g, items: aplicarOrden(g.items, orden) })),
      masAdelante: aplicarOrden(base.masAdelante, orden),
      bandeja: aplicarOrden(base.bandeja, orden),
    }
  }, [filtrados, hoy, esYo, orden])
  // Arrastrar: id que se mueve, bloque del que sale y fila sobre la que está
  const [arrastre, setArrastre] = useState<{ id: string; bloque: string } | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  function soltar(bloque: AgendaItem[], destinoId: string) {
    const a = arrastre
    setArrastre(null); setSobre(null)
    if (!a) return
    const ids = recolocar(bloque.map(it => it.id), a.id, destinoId)
    if (ids) guardarOrden(ids, new Set(deLaPersona.map(it => it.id)))
  }
  const nProximos = s.proximos.reduce((n, g) => n + g.items.length, 0)
  const nDelDia = s.agenda.length + s.hoy.length + s.procesos.length + nProximos + s.masAdelante.length
  const atrasadasMovibles = s.vencidas.filter(it => permisosItem(it).reprogramar)
  const hayFiltro = !!categoria || q.trim() !== ''

  // Procesos sin nota desde hace una semana: se exige la actualización antes de nada
  // (solo en la lista propia y solo si hay dónde guardarla)
  const porActualizar = useMemo(
    () => esYo && onActualizarProceso ? procesosSinActualizar(deLaPersona, personaId) : [],
    [esYo, onActualizarProceso, deLaPersona, personaId],
  )
  // Cierre del día: lo que sigue abierto para hoy, cuando ya es tarde
  const deCierre = useMemo(() => esYo && !cierreOculto ? pendientesDeCierre(s, personaId, ahoraHora) : [], [esYo, cierreOculto, s, personaId, ahoraHora])

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
  async function moverAtrasadasAHoy() {
    setConfirmarMover(false)
    await moverVarias(atrasadasMovibles, hoy)
  }
  const seleccionadas = atrasadasMovibles.filter(it => seleccion.has(it.id))
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

  async function guardarNota(it: AgendaItem, texto: string) {
    const taskId = it.ref.taskId
    if (!onActualizarProceso || !taskId || !texto.trim() || guardandoNota) return
    setGuardandoNota(taskId); setErrorNota(null)
    try {
      await onActualizarProceso(taskId, texto.trim())
      setNotas(prev => { const n = { ...prev }; delete n[taskId]; return n })
    } catch {
      setErrorNota('No se ha podido guardar la nota. Inténtalo de nuevo.')
    } finally {
      setGuardandoNota(null)
    }
  }

  function ocultarCierre() {
    setCierreOculto(true)
    try { localStorage.setItem(claveCierre, '1') } catch { /* sin almacenamiento: solo esta vez */ }
  }

  const fila = (it: AgendaItem) => (
    <AgendaRow key={it.id} item={it} hoy={hoy} profiles={profiles}
      onAbrir={onAbrir} onEstado={onEstado} onReprogramar={onReprogramar} onReasignar={onReasignar}
      onOpenPlayer={onOpenPlayer} onOpenScoutingPlayer={onOpenScoutingPlayer} onCerrarReunion={onCerrarReunion} vistaDe={personaId} />
  )
  /** Filas de un bloque que se pueden arrastrar para ordenarlas (solo en la lista propia) */
  const filasOrdenables = (bloque: AgendaItem[], idBloque: string) => !esYo || bloque.length < 2
    ? bloque.map(fila)
    : bloque.map(it => (
      <div key={it.id} draggable
        title="Arrastra para ordenar"
        onDragStart={ev => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', it.id); setArrastre({ id: it.id, bloque: idBloque }) }}
        onDragEnd={() => { setArrastre(null); setSobre(null) }}
        onDragOver={ev => {
          if (arrastre?.bloque !== idBloque || arrastre.id === it.id) return
          ev.preventDefault()
          if (sobre !== it.id) setSobre(it.id)
        }}
        onDrop={ev => { if (arrastre?.bloque === idBloque) { ev.preventDefault(); soltar(bloque, it.id) } }}
        className={`${arrastre?.id === it.id ? 'opacity-40' : ''} ${sobre === it.id && arrastre?.bloque === idBloque ? 'outline outline-2 -outline-offset-2 outline-primary' : ''}`}>
        {fila(it)}
      </div>
    ))

  function seccion(id: SeccionId, titulo: string, n: number, cuerpo: React.ReactNode, opts: { rojo?: boolean; extra?: React.ReactNode; pista?: string } = {}) {
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
          {opts.pista && <span className="hidden sm:inline text-[11px] text-slate-400 normal-case tracking-normal">{opts.pista}</span>}
          {abierta && opts.extra}
        </div>
        {abierta && cuerpo}
      </section>
    )
  }

  const lista = (its: AgendaItem[], idBloque?: string) => (
    <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">{idBloque ? filasOrdenables(its, idBloque) : its.map(fila)}</div>
  )
  // Lo atrasado en modo selección: casilla delante de lo que se puede mover
  const filaHoy = (it: AgendaItem) => seleccionando && it.fecha! < hoy && permisosItem(it).reprogramar
    ? <AgendaRow key={it.id} item={it} hoy={hoy} profiles={profiles} onAbrir={alternarSeleccion}
        seleccionada={seleccion.has(it.id)} onSeleccionar={alternarSeleccion} />
    : fila(it)
  const personaAlta = alta.assigneeId ? profiles.find(p => p.id === alta.assigneeId) : undefined

  // ── Actualización semanal obligatoria: el aviso no se puede cerrar, pero
  //    no tapa el día (la agenda y el trabajo siguen debajo) ──
  const panelActualizacion = porActualizar.length > 0 && (
      <div className="mb-4 bg-white border border-amber-300 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Actualización semanal de tus procesos</h3>
          <p className="text-xs text-amber-800 mt-0.5">
            {porActualizar.length === 1 ? 'Un proceso lleva' : `${porActualizar.length} procesos llevan`} más de {DIAS_ACTUALIZACION_PROCESO} días sin una nota.
            Escribe en qué punto está cada uno (o marca «Sin novedades»). Este aviso no se quita hasta entonces; tu día sigue debajo.
          </p>
        </div>
        {errorNota && <p className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorNota}</p>}
        <div className="divide-y divide-slate-100">
          {porActualizar.map(it => {
            const taskId = it.ref.taskId!
            const texto = notas[taskId] ?? ''
            const ocupado = guardandoNota === taskId
            const dias = it.proceso?.diasSinActualizar ?? 0
            return (
              <div key={it.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => onAbrir(it)} className="text-sm font-semibold text-slate-800 hover:text-primary inline-flex items-center gap-1" title="Abrir la tarea">
                    {it.titulo} <ExternalLink className="w-3 h-3 text-slate-300" />
                  </button>
                  {it.playerNombre && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">{it.playerNombre}</span>}
                  <span className="text-[11px] text-red-600 font-semibold ml-auto">
                    {it.proceso?.ultimaActualizacion ? `sin nota desde hace ${dias} días` : `en curso desde hace ${dias} días, sin ninguna nota`}
                  </span>
                </div>
                <textarea
                  value={texto}
                  onChange={e => setNotas(prev => ({ ...prev, [taskId]: e.target.value }))}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void guardarNota(it, texto) } }}
                  rows={2}
                  disabled={!!guardandoNota}
                  placeholder="¿En qué punto está? ¿Qué falta? ¿De quién depende?"
                  className="mt-2 w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/40 resize-y disabled:opacity-60"
                />
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <button onClick={() => void guardarNota(it, texto)} disabled={!texto.trim() || !!guardandoNota}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50">
                    {ocupado ? 'Guardando…' : 'Guardar actualización'}
                  </button>
                  <button onClick={() => void guardarNota(it, SIN_NOVEDADES)} disabled={!!guardandoNota}
                    title="Se apunta como nota, para que conste que lo has mirado"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    Sin novedades
                  </button>
                  <span className="text-[10.5px] text-slate-400 ml-auto">⌘/Ctrl + Enter para guardar</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
  )

  return (
    <div>
      {panelActualizacion}

      {/* Alta rápida: título @persona #categoría fecha ! */}
      {onCrear && vista === 'dia' && (
        <div className="mb-3">
          <div className="relative">
            <Plus className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void crear(); if (e.key === 'Escape') setNueva('') }}
              disabled={creando}
              placeholder="Nueva tarea para hoy…  @persona  #categoría  mañana · viernes · 15/10  !  — Enter para crear"
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
              <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">{tituloDiaCorto(alta.dueDate ?? hoy)}</span>
              {alta.sinResolver.length > 0 && <span className="text-amber-600">No reconozco {alta.sinResolver.join(', ')}</span>}
            </div>
          )}
        </div>
      )}

      {/* Buscador + categoría + bandeja */}
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
        {/* La bandeja (sin fecha) no se mezcla con el día: se abre aparte */}
        {(s.bandeja.length > 0 || vista === 'bandeja') && (
          <button onClick={() => setVista(v => v === 'dia' ? 'bandeja' : 'dia')}
            title={vista === 'dia' ? 'Lo que no tiene fecha («algún día»): no sale en el día ni en el calendario' : 'Volver al día'}
            className={`ml-auto inline-flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-xl border-2 shadow-sm transition-colors ${vista === 'bandeja' ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700' : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'}`}>
            {vista === 'bandeja'
              ? <><Sun className="w-4 h-4" /> Volver al día</>
              : <><Inbox className="w-4 h-4" /> Tareas pendientes <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">{s.bandeja.length}</span></>}
          </button>
        )}
      </div>

      {/* Leyenda: lo mío frente a lo que solo sigo */}
      {vista === 'dia' && deLaPersona.some(it => it.personId !== personaId && it.estado !== 'completada') && (
        <p className="mb-2 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-primary" /> {esYo ? 'Las llevas tú' : 'Las lleva'}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-slate-300" /> Adjunto: las lleva otra persona y {esYo ? 'tú las sigues' : 'las sigue'} (por ser encargado del jugador o porque te añadieron)</span>
        </p>
      )}

      {/* ── Bandeja: lo sin fecha, para decidir cuándo ── */}
      {vista === 'bandeja' && (
        <section className="mb-3">
          <p className="mb-2 text-[11px] text-slate-500">
            <b className="font-bold uppercase tracking-wider text-slate-500">Tareas pendientes</b> · {esYo ? 'tus' : 'sus'} tareas sin fecha («algún día»). No salen en el día ni en el calendario:
            ponles fecha desde la fila (<CalendarClock className="inline w-3 h-3 align-text-bottom" />) cuando toque, o márcalas hechas si ya no hacen falta.
          </p>
          {s.bandeja.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg">
              <EmptyState icon={<Inbox className="w-10 h-10" />} title="Sin tareas pendientes" subtitle="Todo lo que tienes lleva fecha." />
            </div>
          ) : lista(s.bandeja, 'bandeja')}
        </section>
      )}

      {vista === 'dia' && (nDelDia === 0 && s.hechasHoy.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg">
          <EmptyState
            icon={<Sun className="w-10 h-10" />}
            title={hayFiltro ? 'Nada coincide con el filtro' : esYo ? 'No tienes nada para hoy' : 'No tiene nada para hoy'}
            subtitle={hayFiltro ? 'Prueba a quitar la búsqueda o las categorías.'
              : s.bandeja.length > 0 ? `Ni citas, ni trabajo, ni procesos en curso. En la bandeja hay ${s.bandeja.length} sin fecha.`
              : 'Ni citas, ni trabajo, ni procesos en curso.'}
          />
        </div>
      ) : (<>
        {/* ── Cierre del día: lo que queda abierto, ¿qué hacemos? ── */}
        {deCierre.length > 0 && (
          <section className="mb-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Moon className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-indigo-900">Cierre del día</span>
              <span className="text-xs text-indigo-800">te quedan {deCierre.length} para hoy. ¿Qué hacemos con {deCierre.length === 1 ? 'ella' : 'ellas'}?</span>
              <button onClick={ocultarCierre} className="ml-auto text-[11px] font-semibold text-indigo-600 hover:underline">Luego</button>
            </div>
            <div className="mt-2 divide-y divide-indigo-100">
              {deCierre.map(it => (
                <div key={it.id} className="py-1.5 flex items-center gap-2 flex-wrap">
                  <button onClick={() => onAbrir(it)} className="text-xs text-slate-800 hover:text-primary truncate max-w-[60%] sm:max-w-none text-left" title={it.titulo}>
                    {it.titulo}{it.playerNombre ? <span className="text-slate-500"> · {it.playerNombre}</span> : null}
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    {permisosItem(it).estado && (
                      <button onClick={() => void onEstado(it, 'completada')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Hecha</button>
                    )}
                    {([['Mañana', sumarDias(hoy, 1)], ['Esta semana', viernesSemana(hoy)], ['Próxima semana', lunesSiguiente(hoy)]] as const)
                      .filter(([, f]) => f > hoy)
                      .map(([txt, f]) => (
                        <button key={txt} onClick={() => void onReprogramar(it, f)} disabled={moviendo}
                          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                          {txt}
                        </button>
                      ))}
                    {it.origen === 'tarea' && (
                      <button onClick={() => void onReprogramar(it, undefined)} disabled={moviendo} title="Sin fecha: a la bandeja («algún día»)"
                        className="text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                        Bandeja
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {seccion('agenda', 'Agenda de hoy', s.agenda.length, lista(s.agenda, 'agenda'), { pista: 'citas: partidos, reuniones, eventos' })}
        {seccion('hoy', 'Para hacer hoy', s.hoy.length, (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">{seleccionando ? s.hoy.map(filaHoy) : filasOrdenables(s.hoy, 'hoy')}</div>
        ), {
          extra: s.vencidas.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[11px] font-semibold text-red-600">{s.vencidas.length} con retraso</span>
              {atrasadasMovibles.length > 0 && (<>
                <button onClick={() => seleccionando ? salirDeSeleccion() : setSeleccionando(true)} disabled={moviendo}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
                  {seleccionando ? 'Cancelar selección' : 'Seleccionar'}
                </button>
                {!seleccionando && (
                  <button onClick={() => setConfirmarMover(true)} disabled={moviendo}
                    title="Les pone fecha de hoy: dejan de contar como atrasadas"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
                    <CalendarClock className="w-3 h-3" /> {moviendo ? 'Moviendo…' : 'Fechar hoy'}
                  </button>
                )}
              </>)}
            </div>
          ),
        })}
        {seccion('procesos', 'En curso', s.procesos.length, lista(s.procesos, 'procesos'), { pista: 'procesos sin fecha de fin: una nota a la semana' })}
        {seccion('proximos', 'Próximos 7 días', nProximos, (
          <div className="bg-white border border-slate-200 rounded-lg overflow-visible">
            {s.proximos.map(g => (
              <div key={g.dia} className="border-b border-slate-100 last:border-b-0">
                <p className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-semibold text-slate-400 first-letter:uppercase">
                  {tituloDiaCorto(g.dia)} <span className="font-normal">· {g.items.length}</span>
                </p>
                <div className="divide-y divide-slate-100">{filasOrdenables(g.items, g.dia)}</div>
              </div>
            ))}
          </div>
        ))}
        {seccion('masAdelante', 'Más adelante', s.masAdelante.length, lista(s.masAdelante, 'masAdelante'))}
        {seccion('hechasHoy', 'Hechas hoy', s.hechasHoy.length, lista(s.hechasHoy))}
      </>))}

      {/* Acciones en masa: por encima de la barra inferior del móvil (z-30) */}
      {seleccionando && seleccionadas.length > 0 && (
        <div className="fixed inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg bottom-[var(--nav-h)]">
          <div className="px-3 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 mr-auto">
              {seleccionadas.length} seleccionada{seleccionadas.length !== 1 ? 's' : ''} · mover a
            </span>
            {([['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Esta semana', viernesSemana(hoy)], ['Próxima semana', lunesSiguiente(hoy)]] as const)
              .filter(([txt, f], i, arr) => arr.findIndex(([, g]) => g === f) === i && (txt !== 'Esta semana' || f > hoy))
              .map(([txt, f]) => (
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
        title={`¿Poner fecha de hoy a ${atrasadasMovibles.length === 1 ? 'la atrasada' : `las ${atrasadasMovibles.length} atrasadas`}?`}
        message="Se cambia la fecha de todas a hoy. Las acciones de Firmar se mueven también en su tarjeta del pipeline."
        confirmLabel="Fechar hoy"
        variant="default"
        onConfirm={moverAtrasadasAHoy}
        onCancel={() => setConfirmarMover(false)}
      />
    </div>
  )
}
