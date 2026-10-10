// ── Nuevo evento / editar evento ─────────────────────────────────────
//
// Un solo formulario para todo lo que no es una tarea: reuniones,
// videollamadas, citas, sesiones de análisis, partidos… Puede ir ligado a
// jugadores de Mantenimiento, a un jugador de Captación o a nadie, y la
// fecha puede ser pasada (apuntar algo que ya ocurrió). Lo abren «Mi día»
// y el calendario semanal (con persona y día ya puestos).

import { useMemo, useState, type ReactNode } from 'react'
import { X, Users } from 'lucide-react'
import type { Player, ScoutingPlayer, AgendaEvento, EventoAmbito } from '../../types'
import { EVENTO_TIPOS } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { norm } from '../../lib/texto'
import { ZONAS } from '../../lib/zonas'
import { CIUDADES_CONOCIDAS, zonaDeCiudad } from '../../lib/viajes'
import { CompeticionSelect } from '../../views/captacion/partidos/CompeticionSelect'

export type EventoBorrador = Omit<AgendaEvento, 'id' | 'createdAt' | 'activityRef'> & {
  /**
   * Solo al crear con tipo «Partido»: en vez de un evento suelto se da de
   * alta un partido de Captación (sale en Captación → Partidos) y quienes
   * asisten quedan como scouts.
   */
  partido?: { local: string; visitante: string; competicion?: string; viewMode?: 'campo' | 'video' }
}

interface Props {
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  profiles: Profile[]
  currentProfile: Profile
  /** Valores de partida: día y persona de la celda del calendario, o el evento a editar */
  inicial?: Partial<EventoBorrador>
  /** true = se está editando uno que ya existe (cambia los textos) */
  editando?: boolean
  onClose: () => void
  onSave: (e: EventoBorrador) => Promise<void>
  /** Selector Tarea / Evento, encima del formulario (solo al crear) */
  cabecera?: ReactNode
  /** Solo al editar: borra el evento */
  onDelete?: () => Promise<void>
  /** Estatus en el pipeline Firmar del jugador de Captación elegido, si está en él */
  estatusPipeline?: (scoutingPlayerId: string) => string | undefined
  /** Solo al editar una reunión del pipeline: abre el cierre (recap + siguiente paso) */
  onCerrarReunion?: () => void
  /** Solo al editar: la reunión ya está cerrada (recap y quién) */
  cierre?: { recap?: string; cerradoAt: string; por?: string }
}

const AMBITOS: { id: EventoAmbito; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'captacion', label: 'Captación' },
]

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'

export function EventoModal({ players, scoutingPlayers, profiles, currentProfile, inicial, editando, onClose, onSave, onDelete, estatusPipeline, cabecera, onCerrarReunion, cierre }: Props) {
  const tipoInicial = inicial?.tipo ?? EVENTO_TIPOS[0]
  const esTipoDeLista = (EVENTO_TIPOS as readonly string[]).includes(tipoInicial)
  const [tipo, setTipo] = useState<string>(esTipoDeLista ? tipoInicial : 'custom')
  const [tipoLibre, setTipoLibre] = useState(esTipoDeLista ? '' : tipoInicial)
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [fecha, setFecha] = useState(inicial?.fecha ?? '')
  const [hora, setHora] = useState(inicial?.hora ?? '')
  const [ambito, setAmbito] = useState<EventoAmbito>(inicial?.ambito ?? 'general')
  const [playerIds, setPlayerIds] = useState<string[]>(inicial?.playerIds ?? [])
  const [scoutingPlayerId, setScoutingPlayerId] = useState(inicial?.scoutingPlayerId ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(inicial?.participantIds ?? [])
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [lugar, setLugar] = useState(inicial?.lugar ?? '')
  // Viaje: último día y zona del destino
  const [fechaFin, setFechaFin] = useState(inicial?.fechaFin ?? '')
  const [zona, setZona] = useState(inicial?.zona ?? '')
  // Partido de Captación (solo al crear)
  const [local, setLocal] = useState('')
  const [visitante, setVisitante] = useState('')
  const [competicion, setCompeticion] = useState('')
  const [viewMode, setViewMode] = useState<'' | 'campo' | 'video'>('')
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEscapeKey(onClose)

  const tipoFinal = tipo === 'custom' ? tipoLibre.trim() : tipo
  const esPartido = tipo === 'Partido' && !editando
  const esViaje = tipo === 'Viaje'
  // Si la ciudad es conocida la zona sale sola; si no, se elige a mano
  const zonaViaje = zona || zonaDeCiudad(lugar) || ''
  const valido = !!fecha && !!tipoFinal && (!esPartido || (!!local.trim() && !!visitante.trim())) && (tipo !== 'Viaje' || !!lugar.trim())

  // Buscador de jugador: solo con texto, que en Captación hay miles
  const nq = norm(q)
  const sugeridos = useMemo(() => {
    if (nq.length < 2) return []
    if (ambito === 'mantenimiento') {
      return players.filter(p => !playerIds.includes(p.id) && norm(p.name).includes(nq))
        .slice(0, 8).map(p => ({ id: p.id, nombre: p.name, extra: p.clubs[0]?.name }))
    }
    return scoutingPlayers.filter(p => norm(p.fullName).includes(nq))
      .slice(0, 8).map(p => ({ id: p.id, nombre: p.fullName, extra: p.team }))
  }, [nq, ambito, players, scoutingPlayers, playerIds])
  const scoutingElegido = scoutingPlayerId ? scoutingPlayers.find(p => p.id === scoutingPlayerId) : undefined

  const alternarParticipante = (id: string) =>
    setParticipantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  async function guardar() {
    if (!valido || guardando) return
    setGuardando(true)
    try {
      await onSave({
        titulo: titulo.trim(),
        tipo: tipoFinal,
        fecha,
        hora: hora || undefined,
        ambito: esViaje ? 'general' : ambito,
        playerIds: !esViaje && ambito === 'mantenimiento' ? playerIds : [],
        scoutingPlayerId: !esViaje && ambito === 'captacion' && scoutingPlayerId ? scoutingPlayerId : undefined,
        participantIds,
        notas: notas.trim() || undefined,
        lugar: !esPartido && lugar.trim() ? lugar.trim() : undefined,
        fechaFin: esViaje && fechaFin && fechaFin >= fecha ? fechaFin : undefined,
        zona: esViaje && zonaViaje ? zonaViaje : undefined,
        partido: esPartido
          ? { local: local.trim(), visitante: visitante.trim(), competicion: competicion.trim() || undefined, viewMode: viewMode || undefined }
          : undefined,
        authorId: inicial?.authorId ?? currentProfile.id,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800">{editando ? 'Editar evento' : cabecera ? 'Nueva tarea / evento' : 'Nuevo evento'}</h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {cabecera}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className={CAMPO}>
                {EVENTO_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="custom">Otro…</option>
              </select>
            </div>
            {esPartido ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Competición <span className="text-slate-400 font-normal">(opcional)</span></label>
                <CompeticionSelect value={competicion} onChange={setCompeticion} className={CAMPO} placeholder="— Sin competición —" />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Título <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tipoFinal || 'Ej. Reunión con el padre'} className={CAMPO} />
              </div>
            )}
          </div>
          {tipo === 'custom' && (
            <input autoFocus value={tipoLibre} onChange={e => setTipoLibre(e.target.value)} placeholder="Tipo de evento (ej. Firma de contrato)" className={CAMPO} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{esViaje ? 'Salida' : <>Fecha <span className="text-slate-400 font-normal">(vale una pasada)</span></>}</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={CAMPO} />
            </div>
            {esViaje ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Vuelta</label>
                <input type="date" value={fechaFin} min={fecha} onChange={e => setFechaFin(e.target.value)} className={CAMPO} />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Hora <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={CAMPO} />
              </div>
            )}
          </div>

          {esPartido && (<>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Local <span className="text-red-400">*</span></label>
                <input value={local} onChange={e => setLocal(e.target.value)} placeholder="Equipo local" className={CAMPO} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Visitante <span className="text-red-400">*</span></label>
                <input value={visitante} onChange={e => setVisitante(e.target.value)} placeholder="Equipo visitante" className={CAMPO} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Cómo se ve <span className="text-slate-400 font-normal">(opcional)</span></label>
              <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 w-fit">
                {([['', 'Sin decidir'], ['campo', 'En el campo'], ['video', 'Por vídeo']] as const).map(([v, txt]) => (
                  <button key={v} type="button" onClick={() => setViewMode(v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${viewMode === v ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {txt}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-emerald-700">Se da de alta como partido en Captación → Partidos, con quienes marques abajo como scouts.</p>
          </>)}

          {esViaje && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Destino (ciudad)</label>
                <input value={lugar} onChange={e => { setLugar(e.target.value); setZona('') }} list="ciudades-viaje" placeholder="Ej. Sevilla" className={CAMPO} />
                <datalist id="ciudades-viaje">{CIUDADES_CONOCIDAS.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Zona</label>
                <select value={zonaViaje} onChange={e => setZona(e.target.value)} className={CAMPO}>
                  <option value="">— Sin zona —</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <p className="col-span-2 text-[11px] text-sky-700">
                Al guardar, abre el viaje desde el calendario: te sugiere a qué jugadores del pipeline puedes visitar{lugar.trim() ? ` en ${lugar.trim()}` : ''}{zonaViaje ? ` y en su zona (${zonaViaje})` : ''}.
              </p>
            </div>
          )}
          {!esPartido && !esViaje && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Lugar <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Ej. Oficina, Lezama, restaurante…" className={CAMPO} />
            </div>
          )}

          {/* Ámbito: decide a qué jugador se puede ligar */}
          {!esPartido && !esViaje && <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Relacionado con</label>
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 w-fit">
              {AMBITOS.map(a => (
                <button key={a.id} type="button" onClick={() => { setAmbito(a.id); setQ('') }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${ambito === a.id ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>}

          {!esPartido && !esViaje && ambito !== 'general' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                {ambito === 'mantenimiento' ? 'Jugadores' : 'Jugador de Captación'} <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              {ambito === 'mantenimiento' && playerIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {playerIds.map(id => (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700">
                      {players.find(p => p.id === id)?.name ?? 'Jugador'}
                      <button type="button" onClick={() => setPlayerIds(prev => prev.filter(x => x !== id))} aria-label="Quitar jugador" className="leading-none text-blue-500 hover:text-blue-700">×</button>
                    </span>
                  ))}
                </div>
              )}
              {ambito === 'captacion' && scoutingElegido ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-emerald-300 rounded-lg bg-emerald-50">
                  <span className="flex-1 text-xs font-medium text-slate-800">{scoutingElegido.fullName}{scoutingElegido.team ? ` · ${scoutingElegido.team}` : ''}</span>
                  <button type="button" onClick={() => setScoutingPlayerId('')} aria-label="Quitar jugador" className="text-slate-500 hover:text-slate-700 leading-none text-sm">×</button>
                </div>
              ) : (
                <div className="relative">
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jugador…" className={CAMPO} />
                  {sugeridos.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                      {sugeridos.map(p => (
                        <button key={p.id} type="button"
                          onMouseDown={e => {
                            e.preventDefault()
                            if (ambito === 'mantenimiento') setPlayerIds(prev => [...prev, p.id]); else setScoutingPlayerId(p.id)
                            setQ('')
                          }}
                          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <span className="truncate">{p.nombre}</span>
                          {p.extra && <span className="text-slate-400 truncate">{p.extra}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {ambito === 'captacion' && scoutingPlayerId && estatusPipeline?.(scoutingPlayerId) && (
                <p className="text-[11px] text-violet-600">Está en el pipeline ({estatusPipeline(scoutingPlayerId)}): queda apuntado también en el historial de su tarjeta de Firmar.</p>
              )}
              {ambito === 'mantenimiento' && (
                <p className="text-[11px] text-slate-400">Queda apuntado también en la actividad de la ficha de cada jugador.</p>
              )}
            </div>
          )}

          {/* Quién asiste: una fila de iniciales; el evento sale en el calendario de cada uno */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-400" /> {esPartido ? 'Scouts' : esViaje ? 'Viajan' : 'Asisten'}
            </label>
            <div className="flex flex-wrap gap-1">
              {profiles.map(p => {
                const sel = participantIds.includes(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => alternarParticipante(p.id)}
                    title={p.id === currentProfile.id ? `${p.name} (yo)` : p.name} aria-label={p.name} aria-pressed={sel}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${
                      sel ? 'bg-primary text-white ring-2 ring-blue-200' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-400 hover:text-slate-600'}`}>
                    {p.avatar}
                  </button>
                )
              })}
            </div>
          </div>
          {participantIds.length > 0 && (
            <p className="text-[11px] text-slate-400 -mt-1.5">
              {participantIds.map(id => profiles.find(p => p.id === id)?.name.split(' ')[0]).filter(Boolean).join(', ')}
            </p>
          )}

          {cierre && (
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2 text-xs">
              <div className="font-semibold text-emerald-800">✓ Reunión cerrada{cierre.por ? ` por ${cierre.por}` : ''} · {new Date(cierre.cerradoAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
              {cierre.recap && <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{cierre.recap}</p>}
            </div>
          )}
          {!cierre && onCerrarReunion && (
            <button type="button" onClick={onCerrarReunion}
              className="w-full flex items-center justify-between gap-2 border border-violet-200 bg-violet-50 rounded-lg px-3 py-2 text-xs text-violet-800 hover:bg-violet-100 transition-colors">
              <span><b>Cerrar reunión</b> · recap y siguiente paso en la tarjeta de Firmar</span>
              <span className="text-violet-400">→</span>
            </button>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Notas <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Detalles del evento…" className={`${CAMPO} resize-none`} />
          </div>

          <div className="flex gap-2 pt-1 safe-area-bottom">
            {editando && onDelete && (
              <button
                onClick={async () => { if (guardando) return; setGuardando(true); try { await onDelete() } finally { setGuardando(false) } }}
                disabled={guardando}
                className="px-3 py-2.5 sm:py-2 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                Eliminar
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button onClick={guardar} disabled={!valido || guardando}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 transition-colors bg-primary hover:bg-primary/90">
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : esPartido ? 'Crear partido' : 'Guardar evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
