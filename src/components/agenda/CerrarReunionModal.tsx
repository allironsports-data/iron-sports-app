// ── Cerrar una reunión del pipeline ──────────────────────────────────
//
// Ya ha pasado la reunión (o se registra una que no se apuntó antes):
// un solo formulario con el recap, el estatus de la tarjeta si cambia, y
// el siguiente paso, que se convierte en la próxima acción de la tarjeta
// de Firmar (y de ahí en una tarea del tablero). Lo abren Mi día, el
// modal del evento y la propia tarjeta.

import { useState } from 'react'
import { X, Handshake } from 'lucide-react'
import type { AgendaEvento, FirmasEntry, FirmasStatus } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { hoyISO, parseDia, sumarDias } from '../../lib/fechas'
import { FIRMAS_CONFIG, FIRMAS_STATUSES, FIRMAS_ACTION_KIND_META } from '../../views/captacion/firmas/helpers'
import type { DatosCierre } from '../../views/captacion/firmas/cierreReunion'

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'

/** Datos del evento nuevo cuando se registra una reunión que no estaba apuntada */
export interface ReunionNueva {
  tipo: string
  titulo: string
  fecha: string
  hora?: string
  lugar?: string
  participantIds: string[]
}

interface Props {
  /** Evento que se cierra. Sin él, se registra una reunión nueva (ya pasada). */
  evento?: AgendaEvento
  /** Tarjeta de Firmar del jugador, si está en el pipeline */
  tarjeta?: FirmasEntry
  playerName: string
  profiles: Profile[]
  currentProfile: Profile
  onClose: () => void
  onGuardar: (datos: DatosCierre, nueva?: ReunionNueva) => Promise<void>
}

const TIPOS_REUNION = ['Reunión', 'Visita presencial', 'Videollamada', 'Cita', 'Comida', 'Reunión con jugador']

export function CerrarReunionModal({ evento, tarjeta, playerName, profiles, currentProfile, onClose, onGuardar }: Props) {
  const registrar = !evento
  const [recap, setRecap] = useState(evento?.recap ?? '')
  const [estatus, setEstatus] = useState<FirmasStatus | ''>(tarjeta?.status ?? '')
  // siguiente paso
  const [conSiguiente, setConSiguiente] = useState(true)
  const [kind, setKind] = useState('llamada')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(sumarDias(hoyISO(), 7))
  const [assigneeId, setAssigneeId] = useState(currentProfile.id)
  // reunión nueva
  const [tipo, setTipo] = useState('Reunión')
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [hora, setHora] = useState('')
  const [lugar, setLugar] = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([currentProfile.id])
  const [guardando, setGuardando] = useState(false)
  useEscapeKey(onClose)

  const valido = !!recap.trim() && (!registrar || !!fecha) && (!conSiguiente || !!label.trim() || !!date)

  async function guardar() {
    if (!valido || guardando) return
    setGuardando(true)
    try {
      const datos: DatosCierre = {
        recap: recap.trim(),
        estatus: tarjeta && estatus && estatus !== tarjeta.status ? estatus : undefined,
        siguiente: conSiguiente && tarjeta ? { kind, label: label.trim(), date: date || undefined, assigneeId: assigneeId || undefined } : undefined,
      }
      await onGuardar(datos, registrar
        ? { tipo, titulo: titulo.trim(), fecha, hora: hora || undefined, lugar: lugar.trim() || undefined, participantIds }
        : undefined)
    } finally {
      setGuardando(false)
    }
  }

  const cuando = evento
    ? `${parseDia(evento.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}${evento.hora ? ` · ${evento.hora}` : ''}${evento.lugar ? ` · ${evento.lugar}` : ''}`
    : ''

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Handshake className="w-4 h-4 text-violet-500" />
            {registrar ? 'Registrar reunión' : 'Cerrar reunión'} · {playerName}
          </h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {evento ? (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <b className="text-slate-700">{evento.titulo || evento.tipo}</b> · {cuando}
              {evento.notas && <span className="block mt-0.5 italic">{evento.notas}</span>}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Tipo</label>
                  <select value={tipo} onChange={e => setTipo(e.target.value)} className={CAMPO}>
                    {TIPOS_REUNION.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Título <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej. Con el padre" className={CAMPO} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Fecha</label>
                  <input type="date" value={fecha} max={hoyISO()} onChange={e => setFecha(e.target.value)} className={CAMPO} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Hora</label>
                  <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={CAMPO} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Lugar</label>
                  <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Opcional" className={CAMPO} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 flex-shrink-0">Asistieron</label>
                <div className="flex flex-wrap gap-1">
                  {profiles.map(p => {
                    const sel = participantIds.includes(p.id)
                    return (
                      <button key={p.id} type="button" title={p.name} aria-pressed={sel}
                        onClick={() => setParticipantIds(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${sel ? 'bg-primary text-white ring-2 ring-blue-200' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-400'}`}>
                        {p.avatar}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Recap <span className="text-red-400">*</span></label>
            <textarea value={recap} onChange={e => setRecap(e.target.value)} rows={4} autoFocus
              placeholder="Con quién se habló, qué se dijo, qué se acordó…" className={`${CAMPO} resize-y`} />
            <p className="text-[11px] text-slate-400">Queda en el historial de la tarjeta de Firmar, debajo del apunte de la reunión.</p>
          </div>

          {tarjeta ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Estatus de la tarjeta</label>
                <div className="flex flex-wrap gap-1">
                  {FIRMAS_STATUSES.map(s => {
                    const c = FIRMAS_CONFIG[s]
                    const on = estatus === s
                    return (
                      <button key={s} type="button" onClick={() => setEstatus(s)}
                        className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? `${c.bg} ${c.text} ${c.border} ring-1 ring-current/30` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                        {c.label}{s === tarjeta.status ? ' (actual)' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={conSiguiente} onChange={e => setConSiguiente(e.target.checked)} />
                  Siguiente paso <span className="text-slate-400 font-normal">(próxima acción de la tarjeta; crea la tarea en el tablero)</span>
                </label>
                {conSiguiente && (
                  <>
                    <div className="flex items-center gap-1 flex-wrap">
                      {Object.entries(FIRMAS_ACTION_KIND_META).map(([k, meta]) => (
                        <button key={k} type="button" onClick={() => setKind(k)} title={meta.label}
                          className={`px-1.5 py-0.5 rounded-md text-[11px] transition-colors ${kind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-400 hover:bg-slate-100'}`}>
                          {meta.icon} <span className="hidden sm:inline">{meta.label}</span>
                        </button>
                      ))}
                    </div>
                    <input value={label} onChange={e => setLabel(e.target.value)} placeholder={`${FIRMAS_ACTION_KIND_META[kind]?.label ?? 'Acción'}: ¿qué hay que hacer?`} className={CAMPO} />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={CAMPO} aria-label="Fecha del siguiente paso" />
                      <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={CAMPO} aria-label="Quién lo hace">
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.avatar} · {p.name.split(' ')[0]}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {playerName} no está en el pipeline de Firmar: el recap queda en el evento, pero no hay tarjeta donde apuntar el siguiente paso.
            </p>
          )}

          <div className="flex gap-2 pt-1 safe-area-bottom">
            <button onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={guardar} disabled={!valido || guardando}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 bg-primary hover:bg-primary/90">
              {guardando ? 'Guardando…' : registrar ? 'Registrar y cerrar' : 'Cerrar reunión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
