import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Player, ScoutingMatch, ScoutingMatchOurPlayer, ScoutingMatchScout } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { BotonCsv } from '../../components/BotonCsv'
import {
  type FilaPlanificacion, type Via, CABECERAS_PLANIFICACION,
  construirPlanificacion, rangoFinDeSemana, rangoSemana, tituloRango, planificacionACsv, htmlPlanificacion, modoDeVia,
} from '../../lib/planificacion'
import type { ShowToast } from './helpers'
import { norm } from '../../lib/texto'
import { MatchFormPanel, type MatchFormState } from './partidos/MatchFormPanel'

// ── Pestaña PLANIFICACIÓN · la hoja de fin de semana (Día · Hora · Partido ·
// Jugador · Persona · Vía) con edición en la propia tabla ──

type Modo = 'finde' | 'semana'

// Colores suaves por día, como en la hoja de Excel
const COLOR_DIA: Record<string, { celda: string; fila: string }> = {
  Viernes:   { celda: 'bg-amber-100',   fila: 'bg-amber-50/50' },
  Sábado:    { celda: 'bg-violet-100',  fila: 'bg-violet-50/50' },
  Domingo:   { celda: 'bg-sky-100',     fila: 'bg-sky-50/50' },
  Lunes:     { celda: 'bg-emerald-100', fila: 'bg-emerald-50/50' },
  Martes:    { celda: 'bg-rose-100',    fila: 'bg-rose-50/50' },
  Miércoles: { celda: 'bg-lime-100',    fila: 'bg-lime-50/50' },
  Jueves:    { celda: 'bg-orange-100',  fila: 'bg-orange-50/50' },
}

const SELECT_MINI = 'text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30'

export function PlanificacionTab({
  scoutingMatches, matchScouts, matchOurPlayers, players, profiles,
  showAddMatch, setShowAddMatch, editingMatch, setEditingMatch, handleSaveMatch, openAddMatch, showToast,
  guardarPartido, onAddScout, onRemoveScout, onSetScoutMode, setDetailMatchId, renderFichaPartido, isDesktop,
  onAddMatchOurPlayer, onRemoveMatchOurPlayer,
}: {
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  matchOurPlayers: ScoutingMatchOurPlayer[]
  players: Player[]
  profiles: Profile[]
  showAddMatch: boolean
  setShowAddMatch: React.Dispatch<React.SetStateAction<boolean>>
  editingMatch: ScoutingMatch | null
  setEditingMatch: React.Dispatch<React.SetStateAction<ScoutingMatch | null>>
  handleSaveMatch: (form: MatchFormState) => Promise<void>
  openAddMatch: () => void
  showToast: ShowToast
  /** Guarda el partido en BBDD y en el estado (hora, notas, modo) */
  guardarPartido: (m: ScoutingMatch) => Promise<void>
  onAddScout: (m: ScoutingMatch, scout: string) => Promise<void>
  onRemoveScout: (m: ScoutingMatch, scout: string) => Promise<void>
  onSetScoutMode: (m: ScoutingMatch, scout: string, viewMode: 'campo' | 'video') => Promise<void>
  setDetailMatchId: React.Dispatch<React.SetStateAction<string | null>>
  renderFichaPartido: (variant: 'modal' | 'panel') => React.ReactNode
  isDesktop: boolean
  /** Celda «Jugador»: nuestros asignados a mano (scouting_match_our_players) */
  onAddMatchOurPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchOurPlayer: (matchId: string, playerId: string) => Promise<void>
}) {
  const [modo, setModo] = useState<Modo>('semana')
  const [offset, setOffset] = useState(0)

  const rango = useMemo(
    () => modo === 'finde' ? rangoFinDeSemana(new Date(), offset) : rangoSemana(new Date(), offset),
    [modo, offset],
  )
  const titulo = `${modo === 'finde' ? 'Fin de semana' : 'Semana'} ${tituloRango(rango)}`

  const filas = useMemo(
    () => construirPlanificacion({ desde: rango.desde, hasta: rango.hasta, scoutingMatches, matchScouts, matchOurPlayers, players }),
    [rango, scoutingMatches, matchScouts, matchOurPlayers, players],
  )

  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) { showToast('El navegador ha bloqueado la ventana. Permite las ventanas emergentes.', 'error'); return }
    w.document.write(htmlPlanificacion(filas, titulo))
    w.document.close()
  }

  async function guardar(m: ScoutingMatch, cambios: Partial<ScoutingMatch>) {
    try { await guardarPartido({ ...m, ...cambios }) }
    catch { showToast('No se pudo guardar el partido', 'error') }
  }

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-3">
        {/* Cabecera: rango, navegación, modo y acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} aria-label="Anterior" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 px-1 whitespace-nowrap">{titulo}</h2>
            <button onClick={() => setOffset(o => o + 1)} aria-label="Siguiente" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
            {offset !== 0 && <button onClick={() => setOffset(0)} className="text-[11px] text-blue-600 hover:underline ml-1">hoy</button>}
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            {([['semana', 'Semana (mar-lun)'], ['finde', 'Fin de semana']] as [Modo, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setModo(id); setOffset(0) }}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${modo === id ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={imprimir} title="Abre la hoja lista para imprimir o guardar como PDF" className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold border border-slate-200 text-slate-500 rounded-lg bg-white hover:border-primary hover:text-primary">
            🖨️ Imprimir / PDF
          </button>
          <BotonCsv nombre={`planificacion_${rango.desde}`} conSello={false} etiqueta="⤓ Excel" cabeceras={CABECERAS_PLANIFICACION} filas={() => planificacionACsv(filas)} />
          <button
            onClick={openAddMatch}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir partido
          </button>
        </div>

        {showAddMatch && (
          <MatchFormPanel
            key={editingMatch?.id ?? 'new'}
            initial={editingMatch ?? undefined}
            fechaInicial={rango.desde}
            profiles={profiles}
            onSave={handleSaveMatch}
            onCancel={() => { setShowAddMatch(false); setEditingMatch(null) }}
            showToast={showToast}
            partidos={scoutingMatches}
            onOpenExisting={id => { setShowAddMatch(false); setEditingMatch(null); setDetailMatchId(id) }}
          />
        )}

        {/* La hoja */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                {['Día', 'Hora', 'Partido', 'Jugador', 'Persona', 'Vía', 'Notas'].map(h => (
                  <th key={h} className={`px-2 py-2 font-bold border-b border-slate-200 ${h === 'Notas' ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Sin partidos entre el {rango.desde.slice(8)} y el {rango.hasta.slice(8)}. Añade uno con «＋ Añadir partido».</td></tr>
              )}
              {filas.map(f => {
                const color = COLOR_DIA[f.diaLabel] ?? { celda: 'bg-slate-100', fila: '' }
                const visto = f.status === 'visto'
                const tach = visto ? 'line-through text-slate-400' : ''
                return (
                  <tr key={f.matchId} className={`border-b border-slate-100 ${color.fila} hover:bg-slate-50`}>
                    <td className={`px-2 py-1.5 text-center font-medium whitespace-nowrap ${color.celda}`}>{f.diaLabel}</td>
                    <td className="px-1 py-1 text-center"><HoraCell key={f.hora} fila={f} onSave={t => guardar(f.match, { time: t || undefined })} /></td>
                    <td className={`px-2 py-1.5 text-center ${tach}`}>
                      <PartidoCell
                        key={f.partido}
                        fila={f}
                        onSave={(home, away) => guardar(f.match, { homeTeam: home, awayTeam: away })}
                        onOpenFicha={() => setDetailMatchId(f.matchId)}
                      />
                    </td>
                    <td className={`px-1 py-1 text-center ${tach}`}>
                      <JugadorCell
                        fila={f}
                        players={players}
                        onAddNuestro={id => onAddMatchOurPlayer(f.matchId, id)}
                        onRemoveNuestro={id => onRemoveMatchOurPlayer(f.matchId, id)}
                        showToast={showToast}
                      />
                    </td>
                    <td className={`px-1 py-1 text-center ${tach}`}>
                      <PersonaCell fila={f} profiles={profiles} onAdd={s => onAddScout(f.match, s)} onRemove={s => onRemoveScout(f.match, s)} />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <ViaCell
                        fila={f}
                        onScoutMode={(s, via) => onSetScoutMode(f.match, s, modoDeVia(via))}
                        onMatchMode={via => guardar(f.match, { viewMode: modoDeVia(via) })}
                      />
                    </td>
                    <td className="px-1 py-1"><NotasCell key={f.notas} fila={f} onSave={n => guardar(f.match, { notes: n || undefined })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] text-slate-400">
          Negrita = jugadores nuestros asignados a ese partido (clic en Jugador para añadir o quitar). «Captación» = partido solo de scouting. Tachado = partido ya visto. Clic en el partido para corregir los equipos sin abrir la ficha. Clic en Persona para elegir quién lo ve (perfil o nombre suelto) y quitar a cualquiera con la ✕; la vía se cambia por scout.
        </p>
      </div>

      {/* En escritorio la ficha flotante la pinta esta pestaña (en móvil la pinta la raíz) */}
      {isDesktop && renderFichaPartido('modal')}
    </div>
  )
}

// ── Celdas editables ──────────────────────────────────────────────────

function HoraCell({ fila, onSave }: { fila: FilaPlanificacion; onSave: (t: string) => void }) {
  const [v, setV] = useState(fila.hora)   // se reinicia por `key` cuando cambia la hora guardada
  return (
    <input
      type="time"
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== fila.hora) onSave(v) }}
      className={`${SELECT_MINI} w-[84px] text-center`}
    />
  )
}

function NotasCell({ fila, onSave }: { fila: FilaPlanificacion; onSave: (n: string) => void }) {
  const [v, setV] = useState(fila.notas)  // se reinicia por `key` cuando cambian las notas guardadas
  return (
    <input
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== fila.notas) onSave(v.trim()) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="—"
      className="w-full min-w-[120px] text-[11px] px-1 py-0.5 rounded border border-transparent bg-transparent hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none"
    />
  )
}

/** Estado de un popover que se cierra al hacer clic fuera o con Escape */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return { open, setOpen, ref }
}

const MAX_RESULTADOS = 8

/**
 * Celda «Jugador»: los nuestros (players de Mantenimiento) asignados a mano
 * a este partido, con ✕ para quitar y buscador para añadir. Sin asignados,
 * «Captación».
 */
function JugadorCell({ fila, players, onAddNuestro, onRemoveNuestro, showToast }: {
  fila: FilaPlanificacion
  players: Player[]
  onAddNuestro: (playerId: string) => Promise<void>
  onRemoveNuestro: (playerId: string) => Promise<void>
  showToast: ShowToast
}) {
  const { open, setOpen, ref } = usePopover()
  const [q, setQ] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const nuestrosIds = useMemo(() => new Set(fila.nuestros.map(p => p.id)), [fila.nuestros])

  const resultados = useMemo(() => {
    const n = norm(q)
    if (!n) return []
    return players
      .filter(p => !p.hiddenFromManagement && !nuestrosIds.has(p.id) && norm(p.name).includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .slice(0, MAX_RESULTADOS)
  }, [q, players, nuestrosIds])

  async function accion(fn: () => Promise<void>, error: string) {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } catch { showToast(error, 'error') } finally { setOcupado(false) }
  }

  return (
    <div ref={ref} className="relative inline-block max-w-full">
      <button
        onClick={() => setOpen(o => !o)}
        title="Jugadores nuestros en este partido"
        className={`px-2 py-0.5 rounded border max-w-full ${open ? 'border-primary bg-white' : 'border-transparent hover:border-slate-300 hover:bg-white'}`}
      >
        {fila.nuestros.length > 0
          ? <span className="font-bold">{fila.jugadorTexto}</span>
          : <span className="font-bold text-slate-600">Captación</span>}
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-[260px] text-left no-underline text-slate-700 font-normal">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Jugadores nuestros en este partido</div>
          <ul className="space-y-0.5 mb-1">
            {fila.nuestros.map(p => (
              <li key={p.id} className="flex items-center gap-1 text-[11px]">
                <span className="font-bold truncate flex-1">{p.name}</span>
                <button onClick={() => void accion(() => onRemoveNuestro(p.id), 'No se pudo quitar al jugador')} disabled={ocupado} title="Quitar del partido" className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-3 h-3" /></button>
              </li>
            ))}
            {fila.nuestros.length === 0 && <li className="text-[11px] text-slate-400 italic">Ninguno</li>}
          </ul>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Añadir jugador nuestro…" className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" autoFocus />
          {resultados.length > 0 && (
            <ul className="mt-1 border border-slate-100 rounded max-h-40 overflow-y-auto">
              {resultados.map(p => (
                <li key={p.id}>
                  <button onClick={() => void accion(async () => { await onAddNuestro(p.id); setQ('') }, 'No se pudo asignar al jugador')} disabled={ocupado} className="w-full text-left px-1.5 py-1 text-[11px] hover:bg-slate-50">
                    {p.name}{p.clubs[0]?.name && <span className="text-slate-400"> · {p.clubs[0].name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() !== '' && resultados.length === 0 && <div className="mt-1 text-[10.5px] text-slate-400">Sin resultados en Mantenimiento</div>}
        </div>
      )}
    </div>
  )
}

/**
 * Celda «Partido»: edición ágil del local/visitante desde la propia tabla,
 * sin pasar por la ficha completa. El texto sigue abriendo la ficha con un
 * enlace aparte dentro del popover, por si hace falta tocar otra cosa
 * (competición, notas…).
 */
function PartidoCell({ fila, onSave, onOpenFicha }: {
  fila: FilaPlanificacion
  onSave: (home: string, away: string) => void
  onOpenFicha: () => void
}) {
  const { open, setOpen, ref } = usePopover()
  // `key` en el uso de este componente (más abajo) reinicia home/away cuando cambian en BBDD
  const [home, setHome] = useState(fila.match.homeTeam)
  const [away, setAway] = useState(fila.match.awayTeam)

  function guardarYcerrar() {
    const h = home.trim(), a = away.trim()
    if (h && a && (h !== fila.match.homeTeam || a !== fila.match.awayTeam)) onSave(h, a)
    else { setHome(fila.match.homeTeam); setAway(fila.match.awayTeam) }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block max-w-full">
      <button
        onClick={() => setOpen(o => !o)}
        title="Editar los equipos"
        className="px-1 py-0.5 rounded border border-transparent hover:border-slate-300 hover:bg-white truncate max-w-full"
      >
        {fila.partido}
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-[220px] text-left no-underline font-normal">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Equipos</div>
          <input
            value={home}
            onChange={e => setHome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardarYcerrar(); if (e.key === 'Escape') setOpen(false) }}
            placeholder="Local"
            autoFocus
            className="w-full mb-1 text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <input
            value={away}
            onChange={e => setAway(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') guardarYcerrar(); if (e.key === 'Escape') setOpen(false) }}
            placeholder="Visitante"
            className="w-full mb-1.5 text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <div className="flex items-center justify-between gap-1">
            <button onClick={guardarYcerrar} className="text-[11px] font-semibold px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">Guardar</button>
            <button onClick={() => { setOpen(false); onOpenFicha() }} className="text-[10.5px] text-slate-400 hover:text-primary hover:underline">Ficha completa →</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Quién ve el partido: cualquier texto vale (perfiles del sistema o nombres
 * sueltos como en la hoja de Excel — "Toldra", "Aurelio"…), y cualquiera de
 * los ya asignados se puede quitar con la ✕, sea o no un perfil conocido.
 */
function PersonaCell({ fila, profiles, onAdd, onRemove }: {
  fila: FilaPlanificacion
  profiles: Profile[]
  onAdd: (scout: string) => Promise<void>
  onRemove: (scout: string) => Promise<void>
}) {
  const { open, setOpen, ref } = usePopover()
  const [nuevo, setNuevo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const elegidos = fila.personas
  const elegidosSet = new Set(elegidos)
  const disponibles = profiles.filter(p => !elegidosSet.has(p.avatar))

  async function accion(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } finally { setOcupado(false) }
  }

  function añadirLibre() {
    const v = nuevo.trim()
    if (!v) return
    void accion(() => onAdd(v))
    setNuevo('')
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        title="Elegir quién ve este partido"
        className={`px-2 py-0.5 rounded border font-mono font-semibold whitespace-nowrap ${open ? 'border-primary text-primary bg-white' : 'border-transparent hover:border-slate-300 hover:bg-white'}`}
      >
        {fila.personas.join(' / ') || <span className="text-slate-300 font-sans font-normal">—</span>}
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 min-w-[190px] text-left">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 px-1">Asignados</div>
          <ul className="space-y-0.5 mb-1.5">
            {elegidos.length === 0 && <li className="px-1 py-0.5 text-[11px] text-slate-400 italic">Nadie asignado</li>}
            {elegidos.map(s => (
              <li key={s} className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-50 text-[11px] text-slate-700">
                <span className="font-mono font-bold flex-1 truncate">{s}</span>
                <button onClick={() => void accion(() => onRemove(s))} disabled={ocupado} title="Quitar" className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ul>
          {disponibles.length > 0 && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 px-1">Añadir</div>
              <ul className="space-y-0.5 mb-1.5">
                {disponibles.map(p => (
                  <li key={p.id}>
                    <button onClick={() => void accion(() => onAdd(p.avatar))} disabled={ocupado} className="w-full flex items-center gap-2 px-1 py-0.5 rounded hover:bg-slate-50 text-[11px] text-slate-700 text-left">
                      <span className="font-mono font-bold w-8">{p.avatar}</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="border-t border-slate-100 my-1" />
          <div className="flex gap-1">
            <input
              value={nuevo}
              onChange={e => setNuevo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') añadirLibre() }}
              placeholder="Otro nombre…"
              className="flex-1 min-w-0 text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button onClick={añadirLibre} disabled={ocupado || !nuevo.trim()} className="text-[11px] font-semibold px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40">+</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Vía por scout (campo / tv). Sin scouts reales, cambia el modo del partido */
function ViaCell({ fila, onScoutMode, onMatchMode }: {
  fila: FilaPlanificacion
  onScoutMode: (scout: string, via: Via) => Promise<void>
  onMatchMode: (via: Via) => void
}) {
  const opciones = <><option value="tv">tv</option><option value="campo">campo</option></>
  const reales = fila.scouts.filter(s => s.real)
  if (reales.length === 0) {
    return (
      <select value={fila.via === 'campo' ? 'campo' : 'tv'} onChange={e => onMatchMode(e.target.value as Via)} className={SELECT_MINI} title="Vía del partido">
        {opciones}
      </select>
    )
  }
  if (reales.length === 1) {
    const s = reales[0]
    return (
      <select value={s.via} onChange={e => void onScoutMode(s.scout, e.target.value as Via)} className={SELECT_MINI} title={`Vía de ${s.scout}`}>
        {opciones}
      </select>
    )
  }
  return (
    <div className="inline-flex flex-col gap-0.5 items-stretch">
      {reales.map(s => (
        <label key={s.scout} className="flex items-center gap-1 text-[10.5px] text-slate-500">
          <span className="font-mono font-bold w-7 text-right">{s.scout}</span>
          <select value={s.via} onChange={e => void onScoutMode(s.scout, e.target.value as Via)} className={SELECT_MINI}>
            {opciones}
          </select>
        </label>
      ))}
    </div>
  )
}
