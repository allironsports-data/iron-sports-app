// ── Al completar una tarea de contacto: ¿qué pasó? ───────────────────
//
// «Llamar a Perico» es una tarea mientras está pendiente. Una vez hecha,
// lo que interesa conservar es que se le llamó ese día y qué dijo: eso es
// un evento. Esta ventanita aparece al completar una tarea de tipo
// Llamada, Reunión o Visita y convierte lo uno en lo otro.

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Task } from '../../types'
import { useEscapeKey } from '../../hooks/useEscapeKey'

export interface RegistroContacto {
  /** Qué pasó (opcional) */
  texto: string
  /** Solo en llamadas */
  contesto?: boolean
}

export function RegistroContactoModal({ task, conQuien, onRegistrar, onSoloCompletar, onClose }: {
  task: Task
  /** Nombre del jugador o persona de la tarea, si lo hay */
  conQuien?: string
  /** Completa la tarea y deja el evento */
  onRegistrar: (r: RegistroContacto) => Promise<void>
  /** Completa la tarea sin dejar nada */
  onSoloCompletar: () => Promise<void>
  onClose: () => void
}) {
  const esLlamada = task.label === 'Llamada'
  const [texto, setTexto] = useState('')
  const [contesto, setContesto] = useState<boolean | undefined>(undefined)
  const [ocupado, setOcupado] = useState(false)
  useEscapeKey(onClose)

  const hacer = async (fn: () => Promise<void>) => {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-800">Hecha. ¿Qué pasó?</h4>
            <p className="text-[11px] text-slate-500 truncate">{task.title}{conQuien ? ` · ${conQuien}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {esLlamada && (
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 w-fit">
              {([[true, 'Contestó'], [false, 'No contestó']] as const).map(([v, txt]) => (
                <button key={txt} type="button" onClick={() => setContesto(c => c === v ? undefined : v)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${contesto === v ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {txt}
                </button>
              ))}
            </div>
          )}
          <textarea
            autoFocus value={texto} onChange={e => setTexto(e.target.value)} rows={3}
            placeholder="Lo que se habló o se acordó (opcional)"
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          <p className="text-[11px] text-slate-400">
            Queda registrado hoy como {task.label === 'Visita' ? 'visita' : (task.label ?? 'evento').toLowerCase()} en el calendario{conQuien ? ` y en la ficha de ${conQuien}` : ''}.
          </p>
          <div className="flex gap-2 safe-area-bottom">
            <button onClick={() => void hacer(onSoloCompletar)} disabled={ocupado}
              className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              Solo completar
            </button>
            <button onClick={() => void hacer(() => onRegistrar({ texto: texto.trim(), contesto }))} disabled={ocupado}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50">
              {ocupado ? 'Guardando…' : 'Completar y registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
