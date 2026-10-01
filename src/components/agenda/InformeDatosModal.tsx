// ── Al completar una tarea de tipo «Informe» de un jugador ───────────
//
// Si el informe era de datos y se le ha enviado al jugador, queda
// registrado en su ficha (Rendimiento → Análisis) como «Informe de datos»,
// con el enlace. Es opcional: «Solo completar» cierra la tarea sin más.

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Task } from '../../types'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { isValidUrl, normalizeUrl } from '../../lib/validate'

export function InformeDatosModal({ task, jugador, onRegistrar, onSoloCompletar, onClose }: {
  task: Task
  jugador: string
  /** Completa la tarea y registra el informe en la ficha del jugador */
  onRegistrar: (r: { enlace: string; nota: string }) => Promise<void>
  onSoloCompletar: () => Promise<void>
  onClose: () => void
}) {
  const [enlace, setEnlace] = useState('')
  const [nota, setNota] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEscapeKey(onClose)

  const hacer = async (fn: () => Promise<void>) => {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } finally { setOcupado(false) }
  }
  const registrar = () => {
    if (enlace.trim() && !isValidUrl(enlace)) { setUrlError(true); return }
    void hacer(() => onRegistrar({ enlace: enlace.trim() ? normalizeUrl(enlace) : '', nota: nota.trim() }))
  }

  const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-800">Hecha. ¿Se le ha enviado un informe de datos?</h4>
            <p className="text-[11px] text-slate-500 truncate">{task.title} · {jugador}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Enlace al informe <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input autoFocus value={enlace} onChange={e => { setEnlace(e.target.value); setUrlError(false) }}
              onKeyDown={e => { if (e.key === 'Enter') registrar() }} placeholder="https://…" className={CAMPO} />
            {urlError && <p className="text-[11px] text-red-500">URL no válida</p>}
          </div>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Qué contenía, cómo se le envió… (opcional)" className={`${CAMPO} resize-none`} />
          <p className="text-[11px] text-slate-400">Queda registrado hoy en la ficha de {jugador}, en Rendimiento → Análisis, como «Informe de datos».</p>
          <div className="flex gap-2 safe-area-bottom">
            <button onClick={() => void hacer(onSoloCompletar)} disabled={ocupado}
              className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              Solo completar
            </button>
            <button onClick={registrar} disabled={ocupado}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50">
              {ocupado ? 'Guardando…' : 'Completar y registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
