// ── Viaje: a quién visitar ───────────────────────────────────────────
//
// Se abre al pulsar un viaje en el calendario. Enseña los jugadores del
// pipeline de Firmar a los que se puede visitar: primero los que juegan en
// la ciudad de destino y, después, los del resto de la zona. Desde cada
// uno se puede abrir su tarjeta o dejar la visita apuntada en un día del
// viaje (queda en el calendario y en el historial de su tarjeta).

import { useMemo, useState } from 'react'
import { X, Plane, Pencil, Plus, Check, ExternalLink } from 'lucide-react'
import type { AgendaEvento, FirmasEntry, ScoutingPlayer } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { parseDia } from '../../lib/fechas'
import { diasDeViaje, sugerenciasDeViaje, type SugerenciaViaje } from '../../lib/viajes'
import { useEscapeKey } from '../../hooks/useEscapeKey'

const ESTATUS: Record<string, { label: string; cls: string }> = {
  llamar:   { label: 'Llamar',   cls: 'bg-amber-100 text-amber-700' },
  caliente: { label: 'Caliente', cls: 'bg-red-100 text-red-600' },
  templado: { label: 'Templado', cls: 'bg-yellow-100 text-yellow-700' },
  frio:     { label: 'Frío',     cls: 'bg-sky-100 text-sky-700' },
  decidir:  { label: 'Decidir',  cls: 'bg-violet-100 text-violet-700' },
}

const diaCorto = (iso: string) => parseDia(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

export function ViajeModal({
  viaje, hoy, firmasEntries, scoutingPlayers, eventos, profiles,
  onClose, onEditar, onAbrirTarjeta, onCrearVisita,
}: {
  viaje: AgendaEvento
  hoy: string
  firmasEntries: FirmasEntry[]
  scoutingPlayers: ScoutingPlayer[]
  /** Todos los eventos: para saber qué visitas del viaje ya están apuntadas */
  eventos: AgendaEvento[]
  profiles: Profile[]
  onClose: () => void
  onEditar: () => void
  onAbrirTarjeta: (entryId: string) => void
  onCrearVisita: (entry: FirmasEntry, dia: string) => Promise<void>
}) {
  useEscapeKey(onClose)
  const dias = useMemo(() => diasDeViaje(viaje.fecha, viaje.fechaFin), [viaje.fecha, viaje.fechaFin])
  // Día en el que se apuntan las visitas: por defecto el primero que no haya pasado
  const [dia, setDia] = useState(() => dias.find(d => d >= hoy) ?? dias[0])
  const [guardando, setGuardando] = useState<string | null>(null)

  const sugerencias = useMemo(() => {
    const equipoPorId = new Map(scoutingPlayers.map(p => [p.id, p.team]))
    return sugerenciasDeViaje({
      ciudad: viaje.lugar, zona: viaje.zona, entries: firmasEntries, hoy,
      equipoDe: id => equipoPorId.get(id),
    })
  }, [viaje.lugar, viaje.zona, firmasEntries, scoutingPlayers, hoy])

  // Visitas ya apuntadas durante el viaje, por jugador de Captación
  const visitas = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of eventos) {
      if (e.scoutingPlayerId && e.id !== viaje.id && dias.includes(e.fecha)) m.set(e.scoutingPlayerId, e.fecha)
    }
    return m
  }, [eventos, dias, viaje.id])

  const viajan = viaje.participantIds.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p)

  async function apuntar(s: SugerenciaViaje) {
    if (guardando) return
    setGuardando(s.entry.id)
    try { await onCrearVisita(s.entry, dia) } finally { setGuardando(null) }
  }

  const fila = (s: SugerenciaViaje) => {
    const e = s.entry
    const est = ESTATUS[e.status]
    const visita = e.scoutingPlayerId ? visitas.get(e.scoutingPlayerId) : undefined
    return (
      <div key={e.id} className="flex items-center gap-2 px-3 py-1.5">
        <span className={`flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${est?.cls ?? 'bg-slate-100 text-slate-500'}`}>{est?.label ?? e.status}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate" title={e.playerName}>{e.playerName}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {[s.equipo, `${s.diasSinTocar} d sin tocar`, e.nextAction ? `próx.: ${e.nextAction}${e.nextActionDate ? ` (${diaCorto(e.nextActionDate)})` : ''}` : undefined]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        {visita ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Check className="w-3 h-3" /> visita {diaCorto(visita)}</span>
        ) : (
          <button onClick={() => void apuntar(s)} disabled={!!guardando || !e.scoutingPlayerId}
            title={e.scoutingPlayerId ? `Apuntar la visita el ${diaCorto(dia)}` : 'La tarjeta no está vinculada a un jugador de Captación'}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-primary text-primary hover:bg-blue-50 disabled:opacity-40 transition-colors">
            <Plus className="w-3 h-3" /> {guardando === e.id ? 'Apuntando…' : 'Visita'}
          </button>
        )}
        <button onClick={() => onAbrirTarjeta(e.id)} title="Abrir su tarjeta del pipeline" aria-label="Abrir tarjeta"
          className="flex-shrink-0 p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const bloque = (titulo: string, lista: SugerenciaViaje[], vacio: string) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        {titulo} <span className="font-semibold rounded-full px-1.5 py-px bg-slate-200 text-slate-600">{lista.length}</span>
      </p>
      {lista.length === 0
        ? <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{vacio}</p>
        : <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">{lista.map(fila)}</div>}
    </div>
  )

  return (
    // z-30: la tarjeta de Firmar (z-40) se abre por encima y al cerrarla sigues en el viaje
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-slate-50 rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10 rounded-t-2xl sm:rounded-t-xl">
          <Plane className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-800 truncate">{viaje.titulo || 'Viaje'}{viaje.lugar ? ` · ${viaje.lugar}` : ''}</h4>
            <p className="text-[11px] text-slate-500">
              {diaCorto(dias[0])}{dias.length > 1 ? ` – ${diaCorto(dias[dias.length - 1])} · ${dias.length} días` : ''}
              {viajan.length > 0 && ` · ${viajan.map(p => p.name.split(' ')[0]).join(', ')}`}
            </p>
          </div>
          <button onClick={onEditar} title="Editar el viaje" aria-label="Editar el viaje" className="p-1 text-slate-500 hover:text-slate-800"><Pencil className="w-4 h-4" /></button>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {viaje.notas && <p className="text-xs text-slate-600 whitespace-pre-wrap">{viaje.notas}</p>}
          {dias.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Apuntar las visitas el
              <select value={dia} onChange={e => setDia(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {dias.map(d => <option key={d} value={d}>{diaCorto(d)}</option>)}
              </select>
            </label>
          )}
          {bloque(`En ${viaje.lugar || 'la ciudad'}`, sugerencias.enCiudad,
            'Ningún jugador del pipeline juega en un club de esta ciudad (o la app no conoce la ciudad de su club).')}
          {bloque(sugerencias.zona ? `Cerca · ${sugerencias.zona}` : 'Cerca', sugerencias.enZona,
            sugerencias.zona ? 'Nadie más del pipeline en esta zona.' : 'Este viaje no tiene zona: edítalo y elige una para ver a quién más tienes cerca.')}
          <p className="text-[11px] text-slate-400">
            Salen los jugadores del pipeline de Firmar que no están firmados, según el club en el que juegan. Los calientes y los que llevan más tiempo sin tocar, primero.
          </p>
        </div>
      </div>
    </div>
  )
}
