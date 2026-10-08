// ── Cerrar una llamada del pipeline ─────────────────────────────────
//
// La próxima acción de una tarjeta de Firmar es una llamada o un
// WhatsApp y se marca hecha: ¿contestó? Si no, se apunta y se acaba. Si
// sí, recap, estatus si cambia y siguiente paso (próxima acción de la
// tarjeta → tarea del tablero), igual que al cerrar una reunión.

import { useState } from 'react'
import { X, Phone } from 'lucide-react'
import type { FirmasEntry, FirmasStatus } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { hoyISO, sumarDias } from '../../lib/fechas'
import { FIRMAS_ACTION_KIND_META } from '../../views/captacion/firmas/helpers'
import type { DatosLlamada } from '../../views/captacion/firmas/cierreReunion'
import { TarjetaCierreCampos, CAMPO } from './CerrarReunionModal'

interface Props {
  tarjeta: FirmasEntry
  profiles: Profile[]
  currentProfile: Profile
  onClose: () => void
  onGuardar: (datos: DatosLlamada) => Promise<void>
}

export function CerrarLlamadaModal({ tarjeta, profiles, currentProfile, onClose, onGuardar }: Props) {
  const [contesto, setContesto] = useState<boolean | null>(null)
  const [recap, setRecap] = useState('')
  const [estatus, setEstatus] = useState<FirmasStatus | ''>(tarjeta.status)
  const [conSiguiente, setConSiguiente] = useState(true)
  const [kind, setKind] = useState('llamada')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(sumarDias(hoyISO(), 7))
  const [assigneeId, setAssigneeId] = useState(currentProfile.id)
  const [guardando, setGuardando] = useState(false)
  useEscapeKey(onClose)

  const icono = FIRMAS_ACTION_KIND_META[tarjeta.nextActionKind ?? 'llamada']?.icon ?? '📞'
  const valido = !!recap.trim() && (!conSiguiente || !!label.trim() || !!date)

  async function guardar(datos: DatosLlamada) {
    if (guardando) return
    setGuardando(true)
    try { await onGuardar(datos) } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Phone className="w-4 h-4 text-amber-500" />
            {icono} {tarjeta.nextAction ?? 'Llamada'} · {tarjeta.playerName}
          </h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">¿Contestó?</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setContesto(true)} disabled={guardando}
                className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${contesto === true ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-200 hover:bg-green-50'}`}>
                ✓ Contestó
              </button>
              <button type="button" onClick={() => { setContesto(false); void guardar({ contesto: false }) }} disabled={guardando}
                className={`py-2.5 rounded-lg text-xs font-semibold border transition-colors ${contesto === false ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}`}>
                {guardando && contesto === false ? 'Guardando…' : '✗ No contestó'}
              </button>
            </div>
            {contesto === null && <p className="text-[11px] text-slate-400">Si no contestó, se apunta y listo: la acción queda hecha y no se pide nada más.</p>}
          </div>

          {contesto === true && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Recap <span className="text-red-400">*</span></label>
                <textarea value={recap} onChange={e => setRecap(e.target.value)} rows={4} autoFocus
                  placeholder="Qué se habló, qué se acordó…" className={`${CAMPO} resize-y`} />
                <p className="text-[11px] text-slate-400">Queda en el historial de la tarjeta, en el apunte de la llamada.</p>
              </div>
              <TarjetaCierreCampos
                tarjeta={tarjeta} profiles={profiles}
                estatus={estatus} setEstatus={setEstatus}
                conSiguiente={conSiguiente} setConSiguiente={setConSiguiente}
                kind={kind} setKind={setKind} label={label} setLabel={setLabel}
                date={date} setDate={setDate} assigneeId={assigneeId} setAssigneeId={setAssigneeId}
              />
              <div className="flex gap-2 pt-1 safe-area-bottom">
                <button onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button
                  onClick={() => void guardar({
                    contesto: true,
                    recap: recap.trim(),
                    estatus: estatus && estatus !== tarjeta.status ? estatus : undefined,
                    siguiente: conSiguiente ? { kind, label: label.trim(), date: date || undefined, assigneeId: assigneeId || undefined } : undefined,
                  })}
                  disabled={!valido || guardando}
                  className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 bg-primary hover:bg-primary/90">
                  {guardando ? 'Guardando…' : 'Cerrar llamada'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
