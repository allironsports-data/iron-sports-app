// ── Nueva tarea ──────────────────────────────────────────────────────
//
// Una tarea es algo que hay que hacer: tiene responsable, puede tener
// fecha y se marca como hecha. El TIPO va primero y decide el resto del
// formulario (lib/tiposTarea.ts): con quién va ligada (jugador nuestro,
// de Captación, ofrecimiento), qué subtipo tiene, si lleva fecha y qué
// pasará al completarla (lib/cierreTarea.ts). Elegir tipo y jugador
// rellena el título solo.
//
// Reunión y Comida/Visita no son tareas sino eventos: al elegirlas se
// pasa al formulario de evento con ese tipo puesto (onEvento).
//
// Una tarea puede llevar CITA (hora, lugar, quién asiste): entonces se crea
// con ella un evento de agenda enlazado, y en la agenda salen como una sola
// fila. Una sesión de análisis la lleva por defecto; una llamada, si se
// quiere; un recurso o una negociación, nunca (lib/tiposTarea.ts).

import { useMemo, useState, type ReactNode } from 'react'
import { X, Plus } from 'lucide-react'
import { TASK_LABELS, type Player, type ScoutingPlayer, type Ofrecimiento, type Task, type TaskLabel } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { norm } from '../../lib/texto'
import { hoyISO, sumarDias } from '../../lib/fechas'
import { lunesSiguiente, viernesSemana } from '../../lib/agendaItems'
import { RECURRENCIAS, RECURRENCIA_LABEL, type Recurrencia } from '../../lib/recurrencia'
import {
  metaTipo, subtiposDe, subtipoValido, etiquetaSubtipo, tituloAuto, queHaraAlCerrar, citaDeTipo, EVENTO_EN_VEZ_DE_TAREA, type SujetoTarea,
} from '../../lib/tiposTarea'

/** La cita de una tarea nueva: con ella App crea el evento de agenda enlazado */
export interface CitaTarea {
  /** Tipo de evento (Llamada, Sesión de análisis, Cita…) */
  tipoEvento: string
  hora?: string
  lugar?: string
  /** profiles.id de quienes asisten */
  participantIds: string[]
}
import { estadoVisible } from '../../lib/ofrecidos'

interface Props {
  profiles: Profile[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  /** Ofrecimientos (Captación → Ofrecidos), para tareas Informe sobre un jugador ofrecido */
  ofrecimientos?: Ofrecimiento[]
  currentProfileId: string
  /** Persona y fecha ya puestas (alta desde el calendario). `playerId`: tarea de ese jugador nuestro (alta desde su ficha) */
  inicial?: { assigneeId?: string; dueDate?: string; playerId?: string }
  /** Selector Tarea / Evento, encima del formulario */
  cabecera?: ReactNode
  /** Estatus en el pipeline del jugador de Captación elegido, si está en él */
  estatusPipeline?: (scoutingPlayerId: string) => string | undefined
  /** Reunión y Comida/Visita son eventos: al elegirlas se abre el formulario de evento con ese tipo. Sin esto no se ofrecen. */
  onEvento?: (tipoEvento: string) => void
  /** Alta rápida de un jugador de Captación desde aquí (Informe, Scouting). Sin esto no se ofrece. */
  onCreateScoutingPlayer?: (p: { fullName: string; team?: string }) => Promise<ScoutingPlayer>
  onClose: () => void
  onAdd: (task: Task, cita?: CitaTarea) => void | Promise<void>
}

type Sujeto = { kind: 'nuestro'; id: string } | { kind: 'captacion'; id: string } | { kind: 'ofrecimiento'; id: string }

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'
const BADGE: Record<SujetoTarea, { txt: string; cls: string }> = {
  nuestro:      { txt: 'Nuestro',      cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  captacion:    { txt: 'Captación',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  ofrecimiento: { txt: 'Ofrecimiento', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
}

export function TareaModal({
  profiles, players, scoutingPlayers, ofrecimientos = [], currentProfileId, inicial, cabecera, estatusPipeline,
  onEvento, onCreateScoutingPlayer, onClose, onAdd,
}: Props) {
  const hoy = hoyISO()
  const jugadorFijo = !!inicial?.playerId
  const [label, setLabel] = useState<TaskLabel | ''>('')
  const [subtipo, setSubtipo] = useState('')
  const [sujeto, setSujeto] = useState<Sujeto | null>(inicial?.playerId ? { kind: 'nuestro', id: inicial.playerId } : null)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [tituloTocado, setTituloTocado] = useState(false)
  const [assigneeId, setAssigneeId] = useState(inicial?.assigneeId ?? currentProfileId)
  // Toda tarea lleva fecha, aunque sea blanda: por defecto hoy. «Algún día» = sin fecha (bandeja).
  const [dueDate, setDueDate] = useState(inicial?.dueDate ?? hoy)
  // cita: hora, lugar y asistentes (el día es «para cuándo»)
  const [conCita, setConCita] = useState(false)
  const [citaTocada, setCitaTocada] = useState(false)
  const [hora, setHora] = useState('')
  const [lugar, setLugar] = useState('')
  const [asisten, setAsisten] = useState<string[]>([inicial?.assigneeId ?? currentProfileId])
  const [mas, setMas] = useState(false)
  const [alta, setAlta] = useState(false)
  const [recurrence, setRecurrence] = useState<Recurrencia | ''>('')
  const [description, setDescription] = useState('')
  const [adminOnly, setAdminOnly] = useState(false)
  // alta rápida de jugador de Captación
  const [nuevo, setNuevo] = useState<{ nombre: string; equipo: string } | null>(null)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEscapeKey(onClose)

  const meta = label ? metaTipo(label) : undefined
  const sujetosPermitidos = useMemo<readonly SujetoTarea[]>(() => (label ? metaTipo(label).sujetos : ['nuestro', 'captacion']), [label])
  const subtipos = subtiposDe(label)
  const esProceso = label === 'Negociación'
  const cita = citaDeTipo(label || undefined, subtipo)
  const citaActiva = cita.cita !== 'no' && (citaTocada ? conCita : cita.cita === 'defecto')

  // Tipos que se ofrecen: Postpartido tiene su propia alta; Reunión y Comida/Visita son eventos (solo si hay a dónde ir);
  // con jugador nuestro fijo no tiene sentido Scouting
  const tipos = TASK_LABELS.filter(l =>
    l !== 'Postpartido' &&
    (!EVENTO_EN_VEZ_DE_TAREA[l] || !!onEvento) &&
    !(jugadorFijo && !metaTipo(l).sujetos.includes('nuestro')),
  )

  const jugador = sujeto?.kind === 'nuestro' ? players.find(p => p.id === sujeto.id) : undefined
  const jugadorScouting = sujeto?.kind === 'captacion' ? scoutingPlayers.find(p => p.id === sujeto.id) : undefined
  const ofrecido = sujeto?.kind === 'ofrecimiento' ? ofrecimientos.find(o => o.id === sujeto.id) : undefined
  const nombreSujeto = jugador?.name ?? jugadorScouting?.fullName ?? ofrecido?.playerName
  const extraSujeto = jugador ? jugador.clubs[0]?.name : jugadorScouting ? jugadorScouting.team : ofrecido ? `${ofrecido.team ?? ''}${ofrecido.ofreceNombre ? ` · ofrece ${ofrecido.ofreceNombre}` : ''}` : undefined
  const sinSujeto = !sujeto
  const faltaSujeto = meta?.jugador === 'si' && sinSujeto
  const pipeline = jugadorScouting ? estatusPipeline?.(jugadorScouting.id) : undefined

  // Buscador unificado: jugadores nuestros, de Captación y ofrecimientos abiertos, según lo que admita el tipo
  const nq = norm(q)
  const sugeridos = useMemo(() => {
    if (nq.length < 2) return [] as { s: Sujeto; nombre: string; extra?: string }[]
    const out: { s: Sujeto; nombre: string; extra?: string }[] = []
    if (sujetosPermitidos.includes('nuestro')) {
      for (const p of players) if (!p.hiddenFromManagement && norm(p.name).includes(nq)) out.push({ s: { kind: 'nuestro', id: p.id }, nombre: p.name, extra: p.clubs[0]?.name })
    }
    if (sujetosPermitidos.includes('ofrecimiento')) {
      for (const o of ofrecimientos) {
        const e = estadoVisible(o, hoy).clave
        if ((e === 'nuevo' || e === 'informes' || e === 'decidir') && norm(o.playerName).includes(nq)) out.push({ s: { kind: 'ofrecimiento', id: o.id }, nombre: o.playerName, extra: o.team })
      }
    }
    if (sujetosPermitidos.includes('captacion')) {
      for (const p of scoutingPlayers) if (norm(p.fullName).includes(nq)) out.push({ s: { kind: 'captacion', id: p.id }, nombre: p.fullName, extra: p.team })
    }
    return out.slice(0, 8)
  }, [nq, sujetosPermitidos, players, scoutingPlayers, ofrecimientos, hoy])

  const cambiarTipo = (l: TaskLabel | '') => {
    const ev = l ? EVENTO_EN_VEZ_DE_TAREA[l] : undefined
    if (ev && onEvento) { onEvento(ev); return }
    setLabel(l)
    const sub = subtipoValido(l, subtipo) ?? ''
    setSubtipo(sub)
    setCitaTocada(false)
    // El sujeto se conserva si el tipo nuevo lo admite
    if (sujeto && !metaTipo(l || undefined).sujetos.includes(sujeto.kind) && !(l === '' && sujeto.kind !== 'ofrecimiento')) setSujeto(jugadorFijo ? sujeto : null)
    if (!tituloTocado) setTitle(tituloAuto(l, nombreSujeto, sub))
  }
  const cambiarSubtipo = (s: string) => {
    setSubtipo(s)
    setCitaTocada(false)
    if (!tituloTocado) setTitle(tituloAuto(label, nombreSujeto, s))
  }
  const elegirSujeto = (s: Sujeto | null, nombre?: string) => {
    setSujeto(s); setQ(''); setNuevo(null)
    if (!tituloTocado) setTitle(tituloAuto(label, nombre, subtipo))
  }

  async function crearJugadorScouting() {
    if (!onCreateScoutingPlayer || !nuevo || !nuevo.nombre.trim() || creando) return
    setCreando(true)
    try {
      const p = await onCreateScoutingPlayer({ fullName: nuevo.nombre.trim(), team: nuevo.equipo.trim() || undefined })
      elegirSujeto({ kind: 'captacion', id: p.id }, p.fullName)
    } finally {
      setCreando(false)
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || guardando || faltaSujeto || !label) return
    if (citaActiva && !dueDate) return
    setGuardando(true)
    try {
      const sp = jugadorScouting ?? (ofrecido?.scoutingPlayerId ? scoutingPlayers.find(p => p.id === ofrecido.scoutingPlayerId) : undefined)
      await onAdd({
        id: 't' + Date.now(),
        title: title.trim(),
        // El nombre va también en la descripción: si la base aún no tiene la columna del vínculo, no se pierde de quién es
        description: [
          description.trim(),
          jugadorScouting ? `Jugador de Captación: ${jugadorScouting.fullName}${jugadorScouting.team ? ` (${jugadorScouting.team})` : ''}` : '',
          ofrecido ? `Ofrecimiento: ${ofrecido.playerName}${ofrecido.team ? ` (${ofrecido.team})` : ''}${ofrecido.ofreceNombre ? ` · ofrece ${ofrecido.ofreceNombre}` : ''}` : '',
        ].filter(Boolean).join('\n'),
        playerId: jugador ? jugador.id : 'general',
        scoutingPlayerId: sp?.id,
        ofrecimientoId: ofrecido?.id,
        assigneeId,
        priority: alta ? 'alta' : 'media',
        label: label || 'Otra',
        subtipo: subtipoValido(label, subtipo),
        // Una negociación es un proceso: nace en curso y sin fecha (pide nota semanal)
        status: esProceso ? 'en_progreso' : 'pendiente',
        dueDate: esProceso ? undefined : (dueDate || undefined),
        createdAt: new Date().toISOString(),
        comments: [],
        adminOnly,
        recurrence: recurrence || undefined,
      }, citaActiva && dueDate ? {
        tipoEvento: cita.tipoEvento, hora: hora || undefined, lugar: lugar.trim() || undefined,
        participantIds: asisten.length > 0 ? asisten : [assigneeId || currentProfileId],
      } : undefined)
    } finally {
      setGuardando(false)
    }
  }

  const etiquetaSujeto = !meta ? 'Relacionada con'
    : label === 'Llamada' ? 'A quién'
    : label === 'Scouting' ? 'Jugador de Captación'
    : label === 'Informe' ? 'De quién'
    : 'Jugador'
  const placeholderBuscar = sujetosPermitidos.length === 1 && sujetosPermitidos[0] === 'nuestro' ? 'Buscar jugador nuestro…'
    : sujetosPermitidos.length === 1 && sujetosPermitidos[0] === 'captacion' ? 'Buscar en Captación…'
    : sujetosPermitidos.includes('ofrecimiento') ? 'Jugador nuestro, de Captación u ofrecido…'
    : 'Jugador nuestro o de Captación…'
  const puedeCrearScouting = !!onCreateScoutingPlayer && sujetosPermitidos.includes('captacion')
  const pie = queHaraAlCerrar(label || undefined, nombreSujeto?.split(' ')[0])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800">{cabecera ? 'Nueva tarea / evento' : 'Nueva tarea'}</h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={crear} className="p-4 space-y-3">
          {cabecera}

          {/* 1. Tipo: decide el resto */}
          <div className={`grid gap-3 ${subtipos.length > 0 || meta?.subtipoLibre ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Tipo <span className="text-red-500">*</span></label>
              <select autoFocus value={label} onChange={e => cambiarTipo(e.target.value as TaskLabel | '')} className={CAMPO}>
                <option value="" disabled>— Elegir tipo —</option>
                {tipos.map(l => <option key={l} value={l}>{l}{EVENTO_EN_VEZ_DE_TAREA[l] ? ' (evento)' : ''}</option>)}
              </select>
            </div>
            {subtipos.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  {label === 'Informe' ? 'Qué informe' : label === 'Análisis' ? 'Qué servicio' : label === 'Scouting' ? 'Qué hacer' : 'Cuál'}
                </label>
                <select value={subtipo} onChange={e => cambiarSubtipo(e.target.value)} className={CAMPO}>
                  <option value="">— Elegir —</option>
                  {subtipos.map(s => <option key={s} value={s}>{etiquetaSubtipo(s)}</option>)}
                </select>
              </div>
            )}
            {meta?.subtipoLibre && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">De qué va</label>
                <input value={subtipo} onChange={e => cambiarSubtipo(e.target.value)} placeholder="Renovación, traspaso, comisión…" className={CAMPO} />
              </div>
            )}
          </div>

          {/* 2. Con quién: decide a qué ficha queda ligada */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              {etiquetaSujeto}
              {meta?.jugador === 'si' ? <span className="text-red-500"> *</span> : <span className="text-slate-400 font-normal"> (opcional)</span>}
            </label>
            {sujeto && nombreSujeto ? (
              <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${sujeto.kind === 'captacion' ? 'border-emerald-300 bg-emerald-50' : sujeto.kind === 'ofrecimiento' ? 'border-amber-300 bg-amber-50' : 'border-blue-300 bg-blue-50'}`}>
                <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">
                  {nombreSujeto}{extraSujeto ? <span className="text-slate-500 font-normal"> · {extraSujeto}</span> : null}
                </span>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${BADGE[sujeto.kind].cls}`}>{BADGE[sujeto.kind].txt}</span>
                {!jugadorFijo && <button type="button" onClick={() => elegirSujeto(null)} aria-label="Quitar" className="text-slate-500 hover:text-slate-700 leading-none text-sm">×</button>}
              </div>
            ) : nuevo ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-2">
                <p className="text-[11px] text-emerald-800 font-medium">Nuevo jugador de Captación</p>
                <div className="grid grid-cols-2 gap-2">
                  <input autoFocus value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" className={CAMPO} />
                  <input value={nuevo.equipo} onChange={e => setNuevo({ ...nuevo, equipo: e.target.value })} placeholder="Equipo (opcional)" className={CAMPO} />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setNuevo(null)} className="px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancelar</button>
                  <button type="button" onClick={() => void crearJugadorScouting()} disabled={!nuevo.nombre.trim() || creando}
                    className="px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                    {creando ? 'Creando…' : 'Crear y usar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholderBuscar} className={CAMPO} />
                {(sugeridos.length > 0 || (puedeCrearScouting && nq.length >= 2)) && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-56 overflow-y-auto">
                    {sugeridos.map(({ s, nombre, extra }) => (
                      <button key={`${s.kind}:${s.id}`} type="button"
                        onMouseDown={e => { e.preventDefault(); elegirSujeto(s, nombre) }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <span className="flex-1 min-w-0 truncate">{nombre}{extra && <span className="text-slate-400"> · {extra}</span>}</span>
                        {sujetosPermitidos.length > 1 && <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${BADGE[s.kind].cls}`}>{BADGE[s.kind].txt}</span>}
                      </button>
                    ))}
                    {puedeCrearScouting && nq.length >= 2 && (
                      <button type="button" onMouseDown={e => { e.preventDefault(); setNuevo({ nombre: q.trim(), equipo: '' }) }}
                        className="w-full text-left flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-t border-slate-100">
                        <Plus className="w-3 h-3" /> «{q.trim()}» no está: añadirlo a Captación
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {jugador && !jugadorFijo && <p className="text-[11px] text-slate-400">Sale en su ficha, y sus encargados quedan como adjuntos.</p>}
            {jugadorScouting && (
              <p className={`text-[11px] ${pipeline ? 'text-violet-600' : 'text-slate-400'}`}>
                {pipeline ? `Está en el pipeline (${pipeline}): la tarea queda apuntada también en el historial de su tarjeta de Firmar.` : 'Queda ligada a su ficha de Captación.'}
              </p>
            )}
            {ofrecido && <p className="text-[11px] text-slate-400">Al completarla se abrirá el ofrecimiento para registrar el informe.</p>}
            {faltaSujeto && <p className="text-[11px] text-red-600">Una tarea de tipo {label} necesita jugador: al completarla deja algo en su ficha.</p>}
            {!faltaSujeto && meta?.jugador === 'recomendado' && sinSujeto && (
              <p className="text-[11px] text-amber-600">Sin jugador, al completarla quedará solo en el calendario, no en ninguna ficha.</p>
            )}
          </div>

          {/* 3. Qué hay que hacer: se rellena solo con tipo y jugador */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Qué hay que hacer</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setTituloTocado(e.target.value.trim() !== '') }}
              placeholder={label ? 'Se rellena al elegir con quién' : 'Ej. Enviar propuesta al padre'} className={CAMPO} />
          </div>

          {/* 4. Quién y cuándo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Quién la hace</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={CAMPO}>
                <option value="">— Sin asignar —</option>
                {profiles.map(m => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
              </select>
            </div>
            {!esProceso && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Para cuándo</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={CAMPO} />
              </div>
            )}
          </div>
          {!esProceso && cita.cita !== 'no' && (
            <div className="space-y-2 -mt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                <input type="checkbox" checked={citaActiva} onChange={e => { setCitaTocada(true); setConCita(e.target.checked) }} className="w-3.5 h-3.5 rounded" />
                {cita.cita === 'defecto' ? 'Con cita: hora, lugar y quién va' : 'Programar hora y lugar (sale como cita en el calendario)'}
              </label>
              {citaActiva && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-500">Hora</label>
                      <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={CAMPO} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-500">Lugar</label>
                      <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Oficina, Lezama…" className={CAMPO} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500">Quién va</label>
                    <div className="flex flex-wrap gap-1">
                      {profiles.map(m => (
                        <button key={m.id} type="button" title={m.name}
                          onClick={() => setAsisten(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                          className={`w-7 h-7 rounded-full text-[10px] font-bold border transition-colors ${asisten.includes(m.id) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                          {m.avatar}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!dueDate && <p className="text-[11px] text-red-600">Una cita necesita día: elige «para cuándo».</p>}
                  <p className="text-[11px] text-slate-400">Queda como «{cita.tipoEvento}» en el calendario{nombreSujeto ? ` y en la ficha de ${nombreSujeto.split(' ')[0]}` : ''}, enlazada a la tarea.</p>
                </div>
              )}
            </div>
          )}
          {!esProceso && (
            <div className="flex items-center gap-1.5 flex-wrap -mt-1">
              {([['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Esta semana', viernesSemana(hoy)], ['Próxima semana', lunesSiguiente(hoy)], ['Algún día', '']] as const).map(([txt, f]) => (
                <button key={txt} type="button" onClick={() => setDueDate(f)}
                  title={txt === 'Algún día' ? 'Sin fecha: va a la bandeja, no sale en Mi día ni en el calendario' : txt === 'Esta semana' ? 'El viernes' : undefined}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${dueDate === f ? 'border-primary text-primary bg-blue-50 font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {txt}
                </button>
              ))}
            </div>
          )}

          {/* 5. Lo secundario, plegado */}
          <button type="button" onClick={() => setMas(v => !v)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
            {mas ? '− Menos opciones' : '+ Más opciones'}{!mas && <span className="font-normal text-slate-400"> (prioridad, repetir, detalles, solo admins)</span>}
          </button>
          {mas && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Prioridad</label>
                  <select value={alta ? 'alta' : 'normal'} onChange={e => setAlta(e.target.value === 'alta')} className={CAMPO}>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                {!esProceso && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Repetir</label>
                    <select value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrencia | '')} className={CAMPO}
                      title="Al completarla se crea la siguiente con la fecha que toque">
                      <option value="">No</option>
                      {RECURRENCIAS.map(r => <option key={r} value={r}>{RECURRENCIA_LABEL[r]}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Detalles</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${CAMPO} resize-none`} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                <input type="checkbox" checked={adminOnly} onChange={e => setAdminOnly(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                Solo para admins
              </label>
            </div>
          )}

          {/* 6. Qué pasará al completarla */}
          {pie && <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">{pie}</p>}

          <div className="flex gap-2 pt-1 safe-area-bottom">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={!title.trim() || guardando || faltaSujeto || !label || (citaActiva && !dueDate)}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 transition-colors bg-primary hover:bg-primary/90">
              {guardando ? 'Creando…' : esProceso ? 'Abrir negociación' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
