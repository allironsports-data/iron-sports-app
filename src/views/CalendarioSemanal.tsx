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
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Maximize2, CalendarDays } from 'lucide-react'
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
}

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const corta = (iso: string) => parseDia(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const BTN = 'px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 bg-white hover:bg-slate-50 transition-colors'
const SELECT = 'text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
/** Líneas que se ven en una columna de la semana antes del «+N más» */
const MAX_COLUMNA = 14

export function CalendarioSemanal({ items, lunes, onLunes, hoy, profiles, currentProfile, onAbrir, onNuevo }: CalendarioSemanalProps) {
  const esEscritorio = useIsDesktop(768)
  const [grupo, setGrupo] = useState<string>('all')
  const [personaId, setPersonaId] = useState<string>('all')
  const [ocultarHechas, setOcultarHechas] = useState(false)
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
      !(ocultarHechas && it.estado === 'completada') &&
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
  const linea = ({ item: it, personas, hecha }: EntradaCalendario) => {
    const m = AGENDA_TIPO_META[it.tipo]
    const vencida = !hecha && it.origen !== 'evento' && !!it.fecha && it.fecha < hoy
    const quien = personas.map(p => avatarDe.get(p) ?? '?')
    return (
      <button
        key={it.id}
        onClick={e => { e.stopPropagation(); onAbrir(it) }}
        title={`${m.label}: ${it.titulo}${it.playerNombre ? ` · ${it.playerNombre}` : ''}${it.hora ? ` · ${it.hora}` : ''}${quien.length ? ` · ${quien.join(', ')}` : ''}`}
        className={`w-full flex items-center gap-1 rounded px-1 py-px text-left text-[11px] leading-tight hover:bg-slate-200/70 transition-colors ${hecha ? 'opacity-50' : ''} ${vencida ? 'text-red-600' : 'text-slate-700'}`}
      >
        <m.Icon className={`w-3 h-3 flex-shrink-0 ${m.cls}`} />
        {it.hora && <span className="flex-shrink-0 font-semibold tabular-nums">{it.hora}</span>}
        <span className={`min-w-0 flex-1 truncate ${hecha ? 'line-through' : ''}`}>
          {it.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle" />}
          {it.titulo}
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
  const filaDia = ({ item: it, personas, hecha }: EntradaCalendario) => {
    const m = AGENDA_TIPO_META[it.tipo]
    const vencida = !hecha && it.origen !== 'evento' && !!it.fecha && it.fecha < hoy
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
            {[m.label, it.playerNombre, it.categoria && it.categoria !== m.label ? it.categoria : undefined, it.estado === 'en_progreso' ? 'en curso' : hecha ? 'hecha' : undefined]
              .filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex-shrink-0 flex items-center gap-0.5 flex-wrap justify-end max-w-[8rem]">
          {personas.map(p => (
            <span key={p} title={nombreDe.get(p)} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary">
              {avatarDe.get(p) ?? '?'}
            </span>
          ))}
        </span>
      </button>
    )
  }

  const carga = (es: EntradaCalendario[]) => {
    const abiertas = es.filter(e => !e.hecha).length
    return <span className="font-normal text-slate-400 tabular-nums" title="Abiertas / total del día">{abiertas}/{es.length}</span>
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

      {diaIdx === null ? (
        /* ── Semana: 7 días enteros ── */
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
