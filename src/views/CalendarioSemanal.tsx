// ── Calendario semanal de toda la empresa ────────────────────────────
//
// Siete columnas, una por día, y en cada una todo lo de ese día de la
// lista unificada: tareas, llamadas y reuniones de Firmar, postpartidos,
// partidos de Captación y eventos. Primero lo que tiene hora; lo demás,
// debajo, sin hora. Cada línea lleva las iniciales de a quién le toca.
//
// Clic en la cabecera de un día lo amplía: ese día solo, a todo el ancho,
// con el título entero, el jugador y la categoría. En móvil no cabe la
// semana: se ve siempre un día y se pasa de uno a otro deslizando.

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Maximize2, CalendarDays, Check } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { parseDia, sumarDias, fechaLocal, lunesDe } from '../lib/fechas'
import { itemEsDe, type AgendaItem } from '../lib/agendaItems'
import { diasDeSemana, entradasPorDia, solapesPorDia, type EntradaCalendario } from '../lib/calendario'
import { AGENDA_TIPO_META, GRUPOS_TIPO } from '../components/agenda/tipoMeta'
import { useIsDesktop } from '../hooks/useIsDesktop'

export interface CalendarioSemanalProps {
  /** Lista unificada con los partidos y eventos de la semana visible */
  items: AgendaItem[]
  /** Lunes (AAAA-MM-DD) de la semana visible */
  lunes: string
  onLunes: (lunes: string) => void
  hoy: string
  profiles: Profile[]
  currentProfile: Profile
  onAbrir: (item: AgendaItem) => void
  onNuevo: (que: 'tarea' | 'evento', personId: string, fecha: string) => void
  /** Nota libre de cada persona (profiles.id → texto): se ve en el día de hoy */
  notas?: Record<string, string>
  /** Si llega, la nota propia se puede editar */
  onGuardarMiNota?: (texto: string) => Promise<void>
}

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const corta = (iso: string) => parseDia(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const BTN = 'px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 bg-white hover:bg-slate-50 transition-colors'
const SELECT = 'text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
/** Líneas que se ven en una columna de la semana antes del «+N más» */
const MAX_COLUMNA = 12
/** Lo que se completa y puede vencer. Eventos y partidos no: ocurren. */
const esTarea = (it: AgendaItem) => it.origen !== 'evento' && it.origen !== 'captacion'

export function CalendarioSemanal({ items, lunes, onLunes, hoy, profiles, currentProfile, onAbrir, onNuevo, notas = {}, onGuardarMiNota }: CalendarioSemanalProps) {
  // Nota propia en edición (null = no se está editando)
  const [notaBorrador, setNotaBorrador] = useState<string | null>(null)
  const esEscritorio = useIsDesktop(768)
  const [grupo, setGrupo] = useState<string>('all')
  const [personaId, setPersonaId] = useState<string>('all')
  const [ocultarHechas, setOcultarHechas] = useState(false)
  // Semana como agenda (días apilados, todo el texto) o en 7 columnas
  const [vista, setVista] = useState<'agenda' | 'columnas'>(
    () => (sessionStorage.getItem('nav_cal_vista') as 'agenda' | 'columnas') ?? 'agenda')
  const cambiarVista = (v: 'agenda' | 'columnas') => { sessionStorage.setItem('nav_cal_vista', v); setVista(v); setAmpliado(null) }
  // Día con el menú de alta abierto (vista de semana)
  const [menuDia, setMenuDia] = useState<string | null>(null)
  const dias = useMemo(() => diasDeSemana(lunes), [lunes])
  // Día ampliado (0 = lunes). En escritorio, null = se ve la semana entera.
  const [ampliado, setAmpliado] = useState<number | null>(null)
  const toque = useRef<{ x: number; y: number } | null>(null)

  const lunesHoy = fechaLocal(lunesDe(parseDia(hoy)))
  const esEstaSemana = lunes === lunesHoy
  const idxHoy = dias.indexOf(hoy)
  // En móvil siempre hay un día a la vista: hoy si cae en la semana, o el lunes
  const diaIdx = ampliado ?? (esEscritorio ? null : Math.max(0, idxHoy))

  const avatarDe = useMemo(() => new Map(profiles.map(p => [p.id, p.avatar])), [profiles])
  const nombreDe = useMemo(() => new Map(profiles.map(p => [p.id, p.name.split(' ')[0]])), [profiles])
  const visibles = useMemo(() => {
    const tiposOn = new Set(GRUPOS_TIPO.filter(g => grupo === 'all' || g.id === grupo).flatMap(g => g.tipos))
    return items.filter(it =>
      !!it.fecha && it.fecha >= dias[0] && it.fecha <= dias[6] &&
      tiposOn.has(it.tipo) &&
      !(ocultarHechas && it.estado === 'completada' && esTarea(it)) &&
      (personaId === 'all' || itemEsDe(it, personaId)))
  }, [items, dias, grupo, ocultarHechas, personaId])
  const porDia = useMemo(() => entradasPorDia(visibles, lunes), [visibles, lunes])
  // Quién tiene dos partidos el mismo día
  const solapes = useMemo(() => solapesPorDia(visibles, lunes), [visibles, lunes])
  const textoSolape = (i: number) => solapes[i].map(x => `${nombreDe.get(x.personId) ?? '?'}: ${x.n} partidos`).join(' · ')

  const irASemana = (l: string, idx: number | null) => { setMenuDia(null); onLunes(l); setAmpliado(idx) }
  const irAHoy = () => irASemana(lunesHoy, diaIdx === null ? null : Math.max(0, diasDeSemana(lunesHoy).indexOf(hoy)))
  const moverSemana = (delta: number) => irASemana(sumarDias(lunes, delta * 7), diaIdx)
  const moverDia = (delta: number) => {
    const n = (diaIdx ?? 0) + delta
    if (n < 0) irASemana(sumarDias(lunes, -7), 6)
    else if (n > 6) irASemana(sumarDias(lunes, 7), 0)
    else setAmpliado(n)
  }

  // A quién se le apunta lo que se crea desde aquí
  const personaAlta = personaId === 'all' ? currentProfile.id : personaId

  // Semana: una línea por cosa — icono · hora · título · iniciales
  const linea = ({ item: it, personas, hecha, conInforme }: EntradaCalendario) => {
    const m = AGENDA_TIPO_META[it.tipo]
    const vencida = !hecha && esTarea(it) && !!it.fecha && it.fecha < hoy
    // Partidos: ✓ junto a las iniciales de quien ya ha metido su informe
    const quien = personas.map(p => `${avatarDe.get(p) ?? '?'}${conInforme.includes(p) ? '✓' : ''}`)
    return (
      <button
        key={it.id}
        onClick={e => { e.stopPropagation(); onAbrir(it) }}
        title={`${m.label}: ${it.titulo}${it.playerNombre ? ` · ${it.playerNombre}` : ''}${it.hora ? ` · ${it.hora}` : ''}${quien.length ? ` · ${quien.join(', ')}` : ''}`}
        className={`w-full flex items-start gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-slate-200/70 transition-colors ${hecha ? 'opacity-50' : ''} ${vencida ? 'text-red-600' : 'text-slate-700'}`}
      >
        <m.Icon className={`w-3 h-3 flex-shrink-0 mt-px ${m.cls}`} />
        {it.hora && <span className="flex-shrink-0 font-semibold tabular-nums">{it.hora}</span>}
        <span className={`min-w-0 flex-1 break-words line-clamp-3 ${hecha ? 'line-through' : ''}`}>
          {it.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle" />}
          {it.titulo}{it.playerNombre && <span className="text-slate-400"> · {it.playerNombre}</span>}
        </span>
        {quien.length > 0 && (
          <span className="flex-shrink-0 text-[8px] font-bold text-primary tracking-tight">
            {quien.slice(0, 2).join(' ')}{quien.length > 2 ? ` +${quien.length - 2}` : ''}
          </span>
        )}
      </button>
    )
  }

  // Día ampliado: la misma cosa con todo a la vista
  const filaDia = ({ item: it, personas, hecha, conInforme }: EntradaCalendario) => {
    const m = AGENDA_TIPO_META[it.tipo]
    const vencida = !hecha && esTarea(it) && !!it.fecha && it.fecha < hoy
    return (
      <button
        key={it.id}
        onClick={() => onAbrir(it)}
        className={`w-full flex items-start gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 transition-colors ${hecha ? 'opacity-50' : ''}`}
      >
        <span className="flex-shrink-0 w-10 text-[11px] font-semibold tabular-nums text-slate-600 pt-px">{it.hora ?? ''}</span>
        <span title={m.label} className="flex-shrink-0 pt-0.5"><m.Icon className={`w-3.5 h-3.5 ${m.cls}`} /></span>
        <span className="flex-1 min-w-0">
          <span className={`text-xs font-medium break-words ${hecha ? 'line-through text-slate-400' : vencida ? 'text-red-600' : 'text-slate-800'}`}>
            {it.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle" />}
            {it.titulo}
          </span>
          <span className="block text-[11px] text-slate-400">
            {[m.label, it.playerNombre, it.categoria && it.categoria !== m.label ? it.categoria : undefined, it.lugar ? `📍 ${it.lugar}` : undefined, it.estado === 'en_progreso' ? 'en curso' : hecha ? 'hecha' : undefined]
              .filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex-shrink-0 flex items-center gap-0.5 flex-wrap justify-end max-w-[8rem]">
          {personas.map(p => (
            <span key={p} title={`${nombreDe.get(p) ?? ''}${conInforme.includes(p) ? ' · informe hecho' : ''}`} className="relative w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary">
              {avatarDe.get(p) ?? '?'}
              {conInforme.includes(p) && (
                <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border border-white flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>
              )}
            </span>
          ))}
        </span>
      </button>
    )
  }

  // ── El equipo ese día: qué tiene cada uno (no solo «la tarea en curso») ──
  // No depende de los filtros de arriba: es la foto del día entero.
  const equipoDelDia = (dia: string) => {
    // Hoy cuenta también lo que está en curso aunque tenga otra fecha (o ninguna)
    const delDia = items.filter(it => it.fecha === dia || (dia === hoy && it.estado === 'en_progreso'))
    const yo = profiles.find(p => p.id === currentProfile.id) ?? currentProfile
    const guardarNota = () => {
      if (notaBorrador !== null && notaBorrador.trim() !== (notas[yo.id] ?? '')) void onGuardarMiNota?.(notaBorrador)
      setNotaBorrador(null)
    }
    return (
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {[yo, ...profiles.filter(p => p.id !== yo.id && !p.hidden_from_status)].map(p => {
          const suyos = delDia.filter(it => itemEsDe(it, p.id))
          const abiertos = suyos.filter(it => it.estado !== 'completada' || !esTarea(it))
            .sort((a, b) => Number(b.estado === 'en_progreso') - Number(a.estado === 'en_progreso') || (a.hora ?? '99').localeCompare(b.hora ?? '99'))
          const hechos = suyos.length - abiertos.length
          const nPend = abiertos.filter(esTarea).length
          const esYo = p.id === yo.id
          const nota = notas[p.id]
          return (
            <div key={p.id} className={`rounded-lg border bg-white px-2.5 py-1.5 ${esYo ? 'border-blue-200' : 'border-slate-200'} ${personaId === p.id ? 'ring-1 ring-primary' : ''}`}>
              <button onClick={() => setPersonaId(id => id === p.id ? 'all' : p.id)} title="Ver solo lo suyo" className="w-full flex items-center gap-1.5 text-left">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">{p.avatar}</span>
                <span className="text-xs font-semibold text-slate-800 truncate">{p.name.split(' ')[0]}{esYo && <span className="font-normal text-slate-400"> (yo)</span>}</span>
                <span className="ml-auto text-[11px] text-slate-400 tabular-nums flex-shrink-0">
                  {nPend > 0 ? `${nPend} pendiente${nPend !== 1 ? 's' : ''}` : abiertos.length > 0 ? `${abiertos.length} en agenda` : suyos.length > 0 ? 'todo hecho' : 'nada'}
                  {hechos > 0 && abiertos.length > 0 && ` · ${hechos} ✓`}
                </span>
              </button>
              {abiertos.slice(0, 3).map(it => {
                const m = AGENDA_TIPO_META[it.tipo]
                return (
                  <button key={it.id} onClick={() => onAbrir(it)} title={it.titulo}
                    className={`w-full flex items-center gap-1 text-left text-[11px] leading-snug hover:underline ${it.estado === 'en_progreso' ? 'text-blue-600 font-semibold' : 'text-slate-600'}`}>
                    <m.Icon className={`w-3 h-3 flex-shrink-0 ${m.cls}`} />
                    {it.hora && <span className="tabular-nums font-semibold">{it.hora}</span>}
                    <span className="truncate">{it.titulo}{it.playerNombre ? ` · ${it.playerNombre.split(' ')[0]}` : ''}</span>
                  </button>
                )
              })}
              {abiertos.length > 3 && <p className="text-[11px] text-slate-400">+{abiertos.length - 3} más</p>}
              {/* Nota libre: solo tiene sentido hoy */}
              {dia === hoy && (esYo && onGuardarMiNota ? (
                notaBorrador !== null ? (
                  <input
                    autoFocus value={notaBorrador} onChange={e => setNotaBorrador(e.target.value)}
                    onBlur={guardarNota}
                    onKeyDown={e => { if (e.key === 'Enter') guardarNota(); if (e.key === 'Escape') setNotaBorrador(null) }}
                    placeholder="Nota (ej. «en Elche hasta el jueves»)"
                    className="mt-0.5 w-full text-[11px] border border-blue-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <button onClick={() => setNotaBorrador(nota ?? '')} className={`mt-0.5 w-full text-left text-[11px] truncate hover:text-slate-800 ${nota ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                    💬 {nota || 'Añadir nota…'}
                  </button>
                )
              ) : nota ? (
                <p className="mt-0.5 text-[11px] text-slate-600 truncate" title={nota}>💬 {nota}</p>
              ) : null)}
            </div>
          )
        })}
      </div>
    )
  }

  const carga = (es: EntradaCalendario[]) => {
    // Eventos y partidos no se «hacen»: la carga cuenta solo tareas, llamadas y postpartidos
    const tareas = es.filter(e => esTarea(e.item))
    const abiertas = tareas.filter(e => !e.hecha).length
    const eventos = es.length - tareas.length
    return (
      <span className="font-normal text-slate-400 tabular-nums" title="Abiertas / total del día (los eventos van aparte)">
        {tareas.length > 0 && `${abiertas}/${tareas.length}`}{eventos > 0 && `${tareas.length > 0 ? ' · ' : ''}${eventos} ev./part.`}
      </span>
    )
  }

  return (
    <div>
      {/* ── Controles ── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <button onClick={() => moverSemana(-1)} aria-label="Semana anterior" className={BTN}><ChevronLeft className="w-3.5 h-3.5" /></button>
        <button onClick={irAHoy} className={`${BTN} font-semibold ${esEstaSemana ? '!bg-slate-800 !text-white !border-slate-800' : ''}`}>Hoy</button>
        <button onClick={() => moverSemana(1)} aria-label="Semana siguiente" className={BTN}><ChevronRight className="w-3.5 h-3.5" /></button>
        <span className="text-xs font-semibold text-slate-700 mr-auto">
          {corta(dias[0])} – {parseDia(dias[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {esEscritorio && (
          <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5">
            {(['agenda', 'columnas'] as const).map(v => (
              <button key={v} onClick={() => cambiarVista(v)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${vista === v && diaIdx === null ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'agenda' ? 'Agenda' : 'Columnas'}
              </button>
            ))}
          </div>
        )}
        <select value={grupo} onChange={e => setGrupo(e.target.value)} aria-label="Filtrar por tipo" className={SELECT}>
          <option value="all">Todos los tipos</option>
          {GRUPOS_TIPO.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select value={personaId} onChange={e => setPersonaId(e.target.value)} aria-label="Filtrar por persona" className={SELECT}>
          <option value="all">Todo el equipo</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentProfile.id ? 'Yo' : p.name}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={ocultarHechas} onChange={e => setOcultarHechas(e.target.checked)} className="w-3.5 h-3.5 rounded" />
          Ocultar completadas
        </label>
        <button onClick={() => onNuevo('evento', personaAlta, diaIdx !== null ? dias[diaIdx] : esEstaSemana ? hoy : dias[0])}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary text-primary bg-white hover:bg-blue-50 transition-colors">
          <Plus className="w-3 h-3" /> Evento
        </button>
      </div>

      {diaIdx === null && vista === 'agenda' ? (
        /* ── Agenda: los 7 días apilados, cada cosa con todo su texto ── */
        <div className="space-y-2">
          {dias.map((d, i) => {
            const es = porDia[i]
            const pasado = d < hoy
            return (
              <section key={d} className={`bg-white border rounded-lg ${d === hoy ? 'border-blue-300' : 'border-slate-200'} ${pasado && es.length === 0 ? 'opacity-60' : ''}`}>
                <div className={`flex items-center gap-2 px-2.5 py-1 ${es.length > 0 ? 'border-b border-slate-100' : ''} ${d === hoy ? 'bg-blue-50 rounded-t-lg' : ''}`}>
                  <button onClick={() => setAmpliado(i)} title="Ver el día con el equipo"
                    className={`text-xs font-bold first-letter:uppercase hover:underline ${d === hoy ? 'text-blue-700' : 'text-slate-700'}`}>
                    {parseDia(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}{d === hoy && ' · hoy'}
                  </button>
                  <span className="text-[11px]">{es.length > 0 ? carga(es) : <span className="text-slate-300">nada</span>}</span>
                  {solapes[i].length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="w-3 h-3" /> Solape: {textoSolape(i)}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => onNuevo('tarea', personaAlta, d)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Plus className="w-3 h-3" /> Tarea</button>
                    <button onClick={() => onNuevo('evento', personaAlta, d)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Plus className="w-3 h-3" /> Evento</button>
                  </div>
                </div>
                {es.length > 0 && <div className="divide-y divide-slate-100">{es.map(filaDia)}</div>}
              </section>
            )
          })}
        </div>
      ) : diaIdx === null ? (
        /* ── Columnas: 7 días enteros, lado a lado ── */
        <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-7 divide-x divide-slate-100">
          {dias.map((d, i) => {
            const es = porDia[i]
            const resto = es.length - MAX_COLUMNA
            return (
              <div key={d} className={`relative min-w-0 flex flex-col ${d === hoy ? 'bg-blue-50/50' : ''}`}>
                <button
                  onClick={() => { setMenuDia(null); setAmpliado(i) }}
                  title="Ampliar este día"
                  className={`group flex items-center gap-1 px-1.5 py-1.5 text-left text-[11px] font-semibold border-b border-slate-200 hover:bg-slate-100 transition-colors ${d === hoy ? 'text-blue-700' : 'text-slate-500'}`}
                >
                  {DOW[i]} <span className="font-normal">{parseDia(d).getDate()}</span>
                  {carga(es)}
                  {solapes[i].length > 0 && (
                    <span className="text-amber-600" title={`Solape: ${textoSolape(i)}`}><AlertTriangle className="w-3 h-3" /></span>
                  )}
                  <Maximize2 className="w-3 h-3 ml-auto text-slate-300 group-hover:text-slate-600" />
                </button>
                {/* Clic en el hueco: alta de tarea o evento ese día */}
                <div
                  onClick={() => setMenuDia(m => m === d ? null : d)}
                  title={es.length === 0 ? 'Añadir tarea o evento' : undefined}
                  className="flex-1 p-0.5 min-h-[8rem] cursor-pointer hover:bg-slate-100/60"
                >
                  {(resto > 0 ? es.slice(0, MAX_COLUMNA - 1) : es).map(linea)}
                  {resto > 0 && (
                    <button onClick={e => { e.stopPropagation(); setMenuDia(null); setAmpliado(i) }}
                      className="w-full text-left px-1 text-[11px] font-semibold text-blue-600 hover:underline">
                      +{resto + 1} más
                    </button>
                  )}
                </div>
                {menuDia === d && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuDia(null)} />
                    <div className={`absolute top-8 z-20 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700 ${i >= 5 ? 'right-1' : 'left-1'}`}>
                      <p className="px-3 py-1 text-[11px] text-slate-400">{corta(d)}</p>
                      {(['tarea', 'evento'] as const).map(que => (
                        <button key={que} onClick={() => { setMenuDia(null); onNuevo(que, personaAlta, d) }}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 text-left">
                          <Plus className="w-3 h-3" /> {que === 'tarea' ? 'Nueva tarea' : 'Nuevo evento'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Un día, ampliado ── */
        <div
          onTouchStart={e => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={e => {
            if (!toque.current) return
            const dx = e.changedTouches[0].clientX - toque.current.x
            const dy = e.changedTouches[0].clientY - toque.current.y
            toque.current = null
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moverDia(dx < 0 ? 1 : -1)
          }}
        >
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <button onClick={() => moverDia(-1)} aria-label="Día anterior" className={BTN}><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => moverDia(1)} aria-label="Día siguiente" className={BTN}><ChevronRight className="w-3.5 h-3.5" /></button>
            <span className={`text-xs font-bold first-letter:uppercase ${dias[diaIdx] === hoy ? 'text-blue-700' : 'text-slate-700'}`}>
              {parseDia(dias[diaIdx]).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              {dias[diaIdx] === hoy && ' · hoy'}
            </span>
            <span className="text-[11px]">{carga(porDia[diaIdx])}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => onNuevo('tarea', personaAlta, dias[diaIdx])} className={`${BTN} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Tarea</button>
              {esEscritorio && (
                <button onClick={() => setAmpliado(null)} className={`${BTN} inline-flex items-center gap-1 font-semibold`}>
                  <CalendarDays className="w-3 h-3" /> Ver la semana
                </button>
              )}
            </div>
          </div>
          {/* Tira de la semana: saltar a otro día sin volver atrás */}
          <div className="flex gap-1 mb-2">
            {dias.map((d, i) => (
              <button key={d} onClick={() => setAmpliado(i)}
                className={`flex-1 py-1 rounded text-[11px] font-semibold ${i === diaIdx ? 'bg-primary text-white' : d === hoy ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {DOW[i]} {parseDia(d).getDate()}
                <span className={`ml-1 font-normal ${i === diaIdx ? 'text-white/70' : 'text-slate-400'}`}>{porDia[i].length || ''}</span>
              </button>
            ))}
          </div>
          {equipoDelDia(dias[diaIdx])}
          {solapes[diaIdx].length > 0 && (
            <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="w-3 h-3" /> Solape: {textoSolape(diaIdx)}</p>
          )}
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {porDia[diaIdx].length === 0
              ? <p className="text-center py-8 text-xs text-slate-400">Nada este día</p>
              : porDia[diaIdx].map(filaDia)}
          </div>
        </div>
      )}
    </div>
  )
}
