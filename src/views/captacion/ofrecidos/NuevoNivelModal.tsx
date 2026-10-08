import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { Profile } from '../../../contexts/AuthContext'
import type { Ofrecimiento, TipoInformePedido } from '../../../types'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { conNivelNuevo, nivelActivo, pasosPendientes } from '../../../lib/ofrecidos'
import { FormRow, Spinner } from '../comun'
import { Modal, PickPersonas, PickTipos } from './comun'
import { INPUT } from './estilos'

// ── Pedir un nivel más de informes ──────────────────────────────────

export function NuevoNivelModal({ ofrecimiento: o, profiles, currentProfile, onClose, onSave }: {
  ofrecimiento: Ofrecimiento
  profiles: Profile[]
  currentProfile: Profile
  onClose: () => void
  onSave: (fn: (o: Ofrecimiento) => Ofrecimiento) => Promise<void>
}) {
  const [pedirA, setPedirA] = useState<string[]>([])
  const [tipos, setTipos] = useState<TipoInformePedido[]>(['tecnico'])
  const [mensaje, setMensaje] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeKey(onClose)

  const n = (nivelActivo(o)?.n ?? 0) + 1
  const pendientes = pasosPendientes(o)

  async function guardar() {
    if (!pedirA.length || !tipos.length || saving) return
    setSaving(true); setError('')
    try {
      const pedir = pedirA.flatMap(av => tipos.map(tipo => ({ avatar: av, tipo })))
      await onSave(x => conNivelNuevo(x, currentProfile.avatar, pedir, mensaje))
      onClose()
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo={`Nivel ${n} · ${o.playerName}`} icono={<Layers className="w-4 h-4 text-slate-400" />} onClose={onClose}>
      <div className="p-5 space-y-3">
        <FormRow label="Pedir a">
          <PickPersonas profiles={profiles} value={pedirA} onChange={setPedirA} />
        </FormRow>
        <FormRow label="Tipo de informe">
          <PickTipos value={tipos} onChange={setTipos} />
          <p className="text-[11px] text-slate-400 mt-1">
            {pedirA.length > 1 && tipos.length > 1
              ? 'Se pide cada tipo a cada persona marcada. Si quieres tipos distintos por persona, añade un nivel por cada uno.'
              : 'Cada persona marcada recibe un pendiente por cada tipo.'}
          </p>
        </FormRow>
        <FormRow label="Mensaje">
          <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={2} placeholder="Qué quieres que miren (opcional)" className={`${INPUT} resize-y`} />
        </FormRow>
        {pendientes.length > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            Hay {pendientes.length} informe{pendientes.length !== 1 ? 's' : ''} sin contestar en niveles anteriores. Se puede abrir este nivel igualmente; esos pendientes siguen vivos.
          </p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!pedirA.length || !tipos.length || saving}
            className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {saving && <Spinner />}
            {saving ? 'Guardando…' : `Pedir nivel ${n}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
