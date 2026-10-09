// ── Nueva tarea ──────────────────────────────────────────────────────
//
// Una tarea es algo que hay que hacer: tiene responsable, puede tener
// fecha y se marca como hecha. Puede ser general, de un jugador de
// Mantenimiento o de un jugador de Captación (queda ligada a su ficha y,
// si está en el pipeline, apuntada en su tarjeta de Firmar).

import { useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { TASK_LABELS, type Player, type ScoutingPlayer, type Task, type TaskLabel } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { norm } from '../../lib/texto'
import { hoyISO, sumarDias } from '../../lib/fechas'
import { lunesSiguiente, viernesSemana } from '../../lib/agendaItems'
import { RECURRENCIAS, RECURRENCIA_LABEL, type Recurrencia } from '../../lib/recurrencia'

type Ambito = 'general' | 'mantenimiento' | 'captacion'

interface Props {
  profiles: Profile[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  currentProfileId: string
  /** Persona y fecha ya puestas (alta desde el calendario) */
  inicial?: { assigneeId?: string; dueDate?: string }
  /** Selector Tarea / Evento, encima del formulario */
  cabecera?: ReactNode
  /** Estatus en el pipeline del jugador de Captación elegido, si está en él */
  estatusPipeline?: (scoutingPlayerId: string) => string | undefined
  onClose: () => void
  onAdd: (task: Task) => void | Promise<void>
}

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'
const SEG = (on: boolean) => `px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${on ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

export function TareaModal({ profiles, players, scoutingPlayers, currentProfileId, inicial, cabecera, estatusPipeline, onClose, onAdd }: Props) {
  const hoy = hoyISO()
  const [title, setTitle] = useState('')
  const [ambito, setAmbito] = useState<Ambito>('general')
  const [playerId, setPlayerId] = useState('')
  const [scoutingPlayerId, setScoutingPlayerId] = useState('')
  const [q, setQ] = useState('')
  const [assigneeId, setAssigneeId] = useState(inicial?.assigneeId ?? currentProfileId)
  // Toda tarea lleva fecha, aunque sea blanda: por defecto hoy. «Algún día» = sin fecha (bandeja).
  const [dueDate, setDueDate] = useState(inicial?.dueDate ?? hoy)
  const [label, setLabel] = useState<TaskLabel | ''>('')
  const [alta, setAlta] = useState(false)
  const [recurrence, setRecurrence] = useState<Recurrencia | ''>('')
  const [description, setDescription] = useState('')
  const [adminOnly, setAdminOnly] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEscapeKey(onClose)

  const jugador = playerId ? players.find(p => p.id === playerId) : undefined
  const jugadorScouting = scoutingPlayerId ? scoutingPlayers.find(p => p.id === scoutingPlayerId) : undefined

  // Buscador: solo con texto, que en Captación hay miles
  const nq = norm(q)
  const sugeridos = useMemo(() => {
    if (nq.length < 2) return []
    if (ambito === 'mantenimiento') {
      return players.filter(p => !p.hiddenFromManagement && norm(p.name).includes(nq))
        .slice(0, 8).map(p => ({ id: p.id, nombre: p.name, extra: p.clubs[0]?.name }))
    }
    return scoutingPlayers.filter(p => norm(p.fullName).includes(nq))
      .slice(0, 8).map(p => ({ id: p.id, nombre: p.fullName, extra: p.team }))
  }, [nq, ambito, players, scoutingPlayers])

  const cambiarAmbito = (a: Ambito) => {
    setAmbito(a); setQ('')
    // Una tarea de Captación nace con el tipo «Scouting» (se puede cambiar)
    if (a === 'captacion' && !label) setLabel('Scouting')
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || guardando) return
    setGuardando(true)
    try {
      const deCaptacion = ambito === 'captacion' && jugadorScouting
      await onAdd({
        id: 't' + Date.now(),
        title: title.trim(),
        // El nombre va también en la descripción: si la base aún no tiene la columna del vínculo, no se pierde de quién es
        description: [description.trim(), deCaptacion ? `Jugador de Captación: ${jugadorScouting.fullName}${jugadorScouting.team ? ` (${jugadorScouting.team})` : ''}` : '']
          .filter(Boolean).join('\n'),
        playerId: ambito === 'mantenimiento' && playerId ? playerId : 'general',
        scoutingPlayerId: deCaptacion ? jugadorScouting.id : undefined,
        assigneeId,
        priority: alta ? 'alta' : 'media',
        label: label || undefined,
        status: 'pendiente',
        dueDate: dueDate || undefined,
        createdAt: new Date().toISOString(),
        comments: [],
        adminOnly,
        recurrence: recurrence || undefined,
      })
    } finally {
      setGuardando(false)
    }
  }

  const elegido = ambito === 'mantenimiento' ? jugador?.name : ambito === 'captacion' ? jugadorScouting && `${jugadorScouting.fullName}${jugadorScouting.team ? ` · ${jugadorScouting.team}` : ''}` : undefined
  const pipeline = ambito === 'captacion' && scoutingPlayerId ? estatusPipeline?.(scoutingPlayerId) : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800">Nueva tarea</h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={crear} className="p-4 space-y-3">
          {cabecera}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Qué hay que hacer</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Enviar propuesta al padre" className={CAMPO} />
          </div>

          {/* De quién es la tarea: decide a qué ficha queda ligada */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Relacionada con</label>
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => cambiarAmbito('general')} className={SEG(ambito === 'general')}>General</button>
              <button type="button" onClick={() => cambiarAmbito('mantenimiento')} className={SEG(ambito === 'mantenimiento')}>Jugador nuestro</button>
              <button type="button" onClick={() => cambiarAmbito('captacion')} className={SEG(ambito === 'captacion')}>Jugador de Captación</button>
            </div>
            {ambito !== 'general' && (elegido ? (
              <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${ambito === 'captacion' ? 'border-emerald-300 bg-emerald-50' : 'border-blue-300 bg-blue-50'}`}>
                <span className="flex-1 text-xs font-medium text-slate-800 truncate">{elegido}</span>
                <button type="button" onClick={() => { setPlayerId(''); setScoutingPlayerId('') }} aria-label="Quitar jugador" className="text-slate-500 hover:text-slate-700 leading-none text-sm">×</button>
              </div>
            ) : (
              <div className="relative">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jugador…" className={CAMPO} />
                {sugeridos.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                    {sugeridos.map(p => (
                      <button key={p.id} type="button"
                        onMouseDown={e => { e.preventDefault(); if (ambito === 'mantenimiento') setPlayerId(p.id); else setScoutingPlayerId(p.id); setQ('') }}
                        className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <span className="truncate">{p.nombre}</span>
                        {p.extra && <span className="text-slate-400 truncate">{p.extra}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {ambito === 'mantenimiento' && jugador && (
              <p className="text-[11px] text-slate-400">Sale en su ficha, y sus encargados quedan como adjuntos.</p>
            )}
            {ambito === 'captacion' && jugadorScouting && (
              <p className={`text-[11px] ${pipeline ? 'text-violet-600' : 'text-slate-400'}`}>
                {pipeline ? `Está en el pipeline (${pipeline}): la tarea queda apuntada también en el historial de su tarjeta de Firmar.` : 'Queda ligada a su ficha de Captación.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Quién la hace</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={CAMPO}>
                <option value="">— Sin asignar —</option>
                {profiles.map(m => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Para cuándo</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={CAMPO} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap -mt-1">
            {([['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Esta semana', viernesSemana(hoy)], ['Próxima semana', lunesSiguiente(hoy)], ['Algún día', '']] as const).map(([txt, f]) => (
              <button key={txt} type="button" onClick={() => setDueDate(f)}
                title={txt === 'Algún día' ? 'Sin fecha: va a la bandeja, no sale en Mi día ni en el calendario' : txt === 'Esta semana' ? 'El viernes' : undefined}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${dueDate === f ? 'border-primary text-primary bg-blue-50 font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {txt}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Tipo</label>
              <select value={label} onChange={e => setLabel(e.target.value as TaskLabel | '')} className={CAMPO}>
                <option value="">— Sin tipo —</option>
                {TASK_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Prioridad</label>
              <select value={alta ? 'alta' : 'normal'} onChange={e => setAlta(e.target.value === 'alta')} className={CAMPO}>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Repetir</label>
              <select value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrencia | '')} className={CAMPO}
                title="Al completarla se crea la siguiente con la fecha que toque">
                <option value="">No</option>
                {RECURRENCIAS.map(r => <option key={r} value={r}>{RECURRENCIA_LABEL[r]}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Detalles <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${CAMPO} resize-none`} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
            <input type="checkbox" checked={adminOnly} onChange={e => setAdminOnly(e.target.checked)} className="w-3.5 h-3.5 rounded" />
            Solo para admins
          </label>

          <div className="flex gap-2 pt-1 safe-area-bottom">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={!title.trim() || guardando}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 transition-colors bg-primary hover:bg-primary/90">
              {guardando ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
