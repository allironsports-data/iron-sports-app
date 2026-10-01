// ── Calendario semanal de toda la empresa ────────────────────────────
//
// Una fila por persona (o por tipo) × 7 días, con un chip por cada cosa de
// la lista unificada: tareas, llamadas y reuniones de Firmar, postpartidos,
// partidos de Captación y eventos (citas, videollamadas, sesiones…).
// Clic en un chip lo abre; clic en un hueco da de alta una tarea o un
// evento con la persona y el día ya puestos.
//
// En móvil no cabe una rejilla de 7 columnas: se ve un día por pantalla y
// se pasa de uno a otro deslizando.

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, AlertTriangle } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { parseDia, sumarDias, fechaLocal, lunesDe } from '../lib/fechas'
import { itemEsDe, type AgendaItem } from '../lib/agendaItems'
import { diasDeSemana, filasPorPersona, filasPorTipo, type FilaCalendario } from '../lib/calendario'
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
const SEG = (on: boolean) => `px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${on ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

export function CalendarioSemanal({ items, lunes, onLunes, hoy, profiles, currentProfile, onAbrir, onNuevo }: CalendarioSemanalProps) {
  const esEscritorio = useIsDesktop(768)
  const [modo, setModo] = useState<'persona' | 'tipo'>('persona')
  const [gruposOff, setGruposOff] = useState<Set<string>>(new Set())
  const [personaId, setPersonaId] = useState<string>('all')
  const [ocultarHechas, setOcultarHechas] = useState(false)
  // Celda con el menú de alta abierto: "fila|día"
  const [celda, setCelda] = useState<string | null>(null)
  // Móvil: día visible (0 = lunes) y filas plegadas
  const dias = useMemo(() => diasDeSemana(lunes), [lunes])
  const [diaIdx, setDiaIdx] = useState(() => Math.max(0, dias.indexOf(hoy)))
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set())
  const toque = useRef<{ x: number; y: number } | null>(null)

  const lunesHoy = fechaLocal(lunesDe(parseDia(hoy)))
  const esEstaSemana = lunes === lunesHoy

  // Yo primero; el resto, en el orden del equipo
  const personas = useMemo(() => {
    const yo = profiles.find(p => p.id === currentProfile.id) ?? currentProfile
    const todas = [yo, ...profiles.filter(p => p.id !== yo.id)]
    return personaId === 'all' ? todas : todas.filter(p => p.id === personaId)
  }, [profiles, currentProfile, personaId])

  const tiposOn = useMemo(
    () => new Set(GRUPOS_TIPO.filter(g => !gruposOff.has(g.id)).flatMap(g => g.tipos)),
    [gruposOff],
  )
  const visibles = useMemo(() => items.filter(it =>
    !!it.fecha && it.fecha >= dias[0] && it.fecha <= dias[6] &&
    tiposOn.has(it.tipo) &&
    !(ocultarHechas && it.estado === 'completada') &&
    (personaId === 'all' || itemEsDe(it, personaId)),
  ), [items, dias, tiposOn, ocultarHechas, personaId])

  const filas: (FilaCalendario & { label: string; avatar?: string; mia?: boolean })[] = useMemo(() => {
    if (modo === 'persona') {
      const fs = filasPorPersona(visibles, personas.map(p => p.id), lunes)
      return fs.map((f, i) => ({ ...f, label: personas[i].name.split(' ')[0], avatar: personas[i].avatar, mia: personas[i].id === currentProfile.id }))
    }
    const grupos = GRUPOS_TIPO.filter(g => !gruposOff.has(g.id))
    return filasPorTipo(visibles, grupos, lunes).map((f, i) => ({ ...f, label: grupos[i].label }))
  }, [modo, visibles, personas, lunes, gruposOff, currentProfile.id])

  const alternarGrupo = (id: string) => setGruposOff(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const irASemana = (l: string, idx?: number) => { setCelda(null); onLunes(l); if (idx !== undefined) setDiaIdx(idx) }
  const irAHoy = () => irASemana(lunesHoy, Math.max(0, diasDeSemana(lunesHoy).indexOf(hoy)))
  const moverDia = (delta: number) => {
    const n = diaIdx + delta
    if (n < 0) irASemana(sumarDias(lunes, -7), 6)
    else if (n > 6) irASemana(sumarDias(lunes, 7), 0)
    else setDiaIdx(n)
  }

  // A quién se le apunta lo que se crea desde una celda
  const personaDeFila = (f: FilaCalendario) => modo === 'persona' ? f.id : (personaId === 'all' ? currentProfile.id : personaId)

  const chip = (it: AgendaItem, ancho = false) => {
    const m = AGENDA_TIPO_META[it.tipo]
    const hecha = it.estado === 'completada'
    const vencida = !hecha && it.origen !== 'evento' && !!it.fecha && it.fecha < hoy
    return (
      <button
        key={it.id}
        onClick={e => { e.stopPropagation(); onAbrir(it) }}
        title={`${m.label}: ${it.titulo}${it.playerNombre ? ` · ${it.playerNombre}` : ''}${it.hora ? ` · ${it.hora}` : ''}`}
        className={`w-full flex items-center gap-1 rounded border px-1 py-0.5 text-left text-[11px] leading-tight hover:brightness-95 transition ${m.chip} ${hecha ? 'opacity-50' : ''} ${vencida ? '!border-red-300' : ''}`}
      >
        <m.Icon className={`w-3 h-3 flex-shrink-0 ${m.cls}`} />
        {it.hora && <span className="flex-shrink-0 font-semibold tabular-nums">{it.hora}</span>}
        <span className={`min-w-0 truncate ${hecha ? 'line-through' : ''}`}>
          {it.prioridadAlta && !hecha && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle" />}
          {it.titulo}{ancho && it.playerNombre ? ` · ${it.playerNombre}` : ''}
        </span>
      </button>
    )
  }

  const menuAlta = (f: FilaCalendario, dia: string) => (
    <>
      <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setCelda(null) }} />
      <div className="absolute left-1 top-1 z-20 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs text-slate-700" onClick={e => e.stopPropagation()}>
        <p className="px-3 py-1 text-[11px] text-slate-400">{corta(dia)}</p>
        {(['tarea', 'evento'] as const).map(que => (
          <button key={que} onClick={() => { setCelda(null); onNuevo(que, personaDeFila(f), dia) }}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 text-left">
            <Plus className="w-3 h-3" /> {que === 'tarea' ? 'Nueva tarea' : 'Nuevo evento'}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div>
      {/* ── Controles ── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <button onClick={() => irASemana(sumarDias(lunes, -7))} aria-label="Semana anterior" className={BTN}><ChevronLeft className="w-3.5 h-3.5" /></button>
        <button onClick={irAHoy} className={`${BTN} font-semibold ${esEstaSemana ? '!bg-slate-800 !text-white !border-slate-800' : ''}`}>Hoy</button>
        <button onClick={() => irASemana(sumarDias(lunes, 7))} aria-label="Semana siguiente" className={BTN}><ChevronRight className="w-3.5 h-3.5" /></button>
        <span className="text-xs font-semibold text-slate-700 mr-auto">
          {corta(dias[0])} – {parseDia(dias[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setModo('persona')} className={SEG(modo === 'persona')}>Por persona</button>
          <button onClick={() => setModo('tipo')} className={SEG(modo === 'tipo')}>Por tipo</button>
        </div>
        <select value={personaId} onChange={e => setPersonaId(e.target.value)} aria-label="Filtrar por persona"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          <option value="all">Todo el equipo</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentProfile.id ? 'Yo' : p.name}</option>)}
        </select>
        <button onClick={() => onNuevo('evento', personaId === 'all' ? currentProfile.id : personaId, esEstaSemana ? hoy : dias[0])}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary text-primary bg-white hover:bg-blue-50 transition-colors">
          <Plus className="w-3 h-3" /> Evento
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {GRUPOS_TIPO.map(g => {
          const on = !gruposOff.has(g.id)
          const m = AGENDA_TIPO_META[g.tipos[0]]
          return (
            <button key={g.id} onClick={() => alternarGrupo(g.id)} aria-pressed={on}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                on ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-100 border-slate-200 text-slate-400 line-through'}`}>
              <m.Icon className={`w-3 h-3 ${on ? m.cls : ''}`} /> {g.label}
            </button>
          )
        })}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={ocultarHechas} onChange={e => setOcultarHechas(e.target.checked)} className="w-3.5 h-3.5 rounded" />
          Ocultar completadas
        </label>
      </div>

      {esEscritorio ? (
        /* ── Rejilla semanal ── */
        <div className="bg-white border border-slate-200 rounded-lg">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="text-[11px] text-slate-500">
                <th className="w-28 px-2 py-1.5 text-left font-semibold border-b border-slate-200">{modo === 'persona' ? 'Persona' : 'Tipo'}</th>
                {dias.map((d, i) => (
                  <th key={d} className={`px-1 py-1.5 text-left font-semibold border-b border-l border-slate-200 ${d === hoy ? 'bg-blue-50 text-blue-700' : ''}`}>
                    {DOW[i]} <span className="font-normal">{parseDia(d).getDate()}</span>
                  </th>
                ))}
                <th className="w-12 px-1 py-1.5 text-center font-semibold border-b border-l border-slate-200" title="Abiertas / total de la semana">Carga</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id} className={f.mia ? 'bg-blue-50/40' : ''}>
                  <td className={`px-2 py-1.5 align-top border-b border-slate-100 ${f.mia ? 'border-l-2 border-l-primary' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      {f.avatar && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">{f.avatar}</span>}
                      <span className="text-xs font-semibold text-slate-700 truncate">{f.label}{f.mia && <span className="font-normal text-slate-400"> (yo)</span>}</span>
                    </div>
                    {f.solapes.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-600" title="Dos o más partidos el mismo día">
                        <AlertTriangle className="w-3 h-3" /> Solape
                      </p>
                    )}
                  </td>
                  {dias.map((d, i) => {
                    const clave = `${f.id}|${d}`
                    const solape = modo === 'persona' && f.solapes.includes(i)
                    return (
                      <td key={d}
                        onClick={() => setCelda(c => c === clave ? null : clave)}
                        title={f.dias[i].length === 0 ? 'Añadir tarea o evento' : undefined}
                        className={`relative p-1 align-top border-b border-l border-slate-100 cursor-pointer hover:bg-slate-100/70 ${d === hoy ? 'bg-blue-50/50' : ''} ${solape ? 'ring-1 ring-inset ring-amber-400' : ''}`}>
                        <div className="space-y-0.5 min-h-[1.75rem]">
                          {solape && <p className="text-[11px] font-semibold text-amber-600">⚠ {f.dias[i].filter(x => x.tipo === 'partido').length} partidos</p>}
                          {f.dias[i].map(it => chip(it))}
                        </div>
                        {celda === clave && menuAlta(f, d)}
                      </td>
                    )
                  })}
                  <td className="px-1 py-1.5 align-top text-center border-b border-l border-slate-100 text-[11px] tabular-nums">
                    <span className={`font-bold ${f.abiertos > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{f.abiertos}</span>
                    <span className="text-slate-400">/{f.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 && <p className="text-center py-8 text-xs text-slate-400">No hay filas con ese filtro</p>}
        </div>
      ) : (
        /* ── Móvil: un día por pantalla ── */
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
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => moverDia(-1)} aria-label="Día anterior" className={BTN}><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className={`text-xs font-bold first-letter:uppercase ${dias[diaIdx] === hoy ? 'text-blue-700' : 'text-slate-700'}`}>
              {parseDia(dias[diaIdx]).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
              {dias[diaIdx] === hoy && ' · hoy'}
            </span>
            <button onClick={() => moverDia(1)} aria-label="Día siguiente" className={BTN}><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex gap-1 mb-2">
            {dias.map((d, i) => (
              <button key={d} onClick={() => setDiaIdx(i)}
                className={`flex-1 py-1 rounded text-[11px] font-semibold ${i === diaIdx ? 'bg-primary text-white' : d === hoy ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {DOW[i][0]}{parseDia(d).getDate()}
              </button>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {filas.map(f => {
              const its = f.dias[diaIdx]
              const abierta = !plegadas.has(f.id)
              const solape = modo === 'persona' && f.solapes.includes(diaIdx)
              return (
                <div key={f.id} className={f.mia ? 'bg-blue-50/40' : ''}>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                    <button
                      onClick={() => setPlegadas(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })}
                      aria-expanded={abierta} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${abierta ? '' : '-rotate-90'}`} />
                      {f.avatar && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">{f.avatar}</span>}
                      <span className="text-xs font-semibold text-slate-700 truncate">{f.label}</span>
                      <span className="text-[11px] text-slate-400">{its.length}</span>
                      {solape && <span className="text-[11px] font-semibold text-amber-600">⚠ solape</span>}
                    </button>
                    <span className="text-[11px] text-slate-400 tabular-nums" title="Abiertas / total de la semana">{f.abiertos}/{f.total} sem.</span>
                    <button onClick={() => onNuevo('evento', personaDeFila(f), dias[diaIdx])} aria-label="Nuevo evento" className="p-1 text-slate-500 hover:text-primary">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {abierta && its.length > 0 && <div className="px-2.5 pb-2 space-y-1">{its.map(it => chip(it, true))}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
