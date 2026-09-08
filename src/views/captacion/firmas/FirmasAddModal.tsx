import { useState } from 'react'
import { X } from 'lucide-react'
import type { ScoutingPlayer, FirmasEntry, FirmasStatus } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { isValidName } from '../../../lib/validate'
import { norm as normSearch } from '../../../lib/texto'
import { SELECT_CLS, scoutColor } from '../helpers'
import { FirmasLinkSearch } from './comun'
import { FIRMAS_STATUSES, FIRMAS_CONFIG } from './helpers'
// ── Modal de alta en el pipeline ─────────────────────────────
export function FirmasAddModal({
  profiles, currentProfile, scoutingPlayers, zones, existing, onClose, onCreate,
}: {
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  zones: string[]
  existing: FirmasEntry[]
  onClose: () => void
  onCreate: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt' | 'sortPos'> & { sortPos: number }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [zone, setZone] = useState(zones[0] ?? 'Otros')
  const [newZone, setNewZone] = useState('')
  const [status, setStatus] = useState<FirmasStatus>('llamar')
  const [managers, setManagers] = useState<string[]>([currentProfile.id])
  const [linked, setLinked] = useState<ScoutingPlayer | null>(null)
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose)

  const zoneValue = zone === '__nueva__' ? newZone.trim() : zone
  const duplicate = existing.some(e => normSearch(e.playerName) === normSearch(linked?.fullName ?? name))
  const canSave = (linked || isValidName(name.trim())) && zoneValue && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    await onCreate({
      playerName: (name.trim() || linked?.fullName) ?? '',
      zone: zoneValue,
      status,
      scoutingPlayerId: linked?.id,
      knownTeam: linked?.team,
      managers,
      notes: undefined,
      comments: [],
      trelloUrl: undefined,
      statusUpdatedAt: new Date().toISOString(),
      sortPos: 0, // recalculado por el llamador
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Añadir jugador al pipeline</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* vincular con scouting (opcional, rellena el nombre) */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Jugador de Captación (opcional)</label>
            {linked ? (
              <div className="mt-1 flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{linked.fullName}</div>
                  <div className="text-[11px] text-slate-400">
                    {[linked.team, linked.birthdate ? linked.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button onClick={() => setLinked(null)} className="text-[11px] text-slate-400 hover:text-red-500 flex-shrink-0">Quitar</button>
              </div>
            ) : (
              <div className="mt-1">
                <FirmasLinkSearch
                  scoutingPlayers={scoutingPlayers}
                  onSelect={p => { setLinked(p); if (!name.trim()) setName(p.fullName) }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nombre *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del jugador"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {duplicate && (
              <p className="mt-1 text-[11px] text-amber-600">Ya hay un jugador con este nombre en el pipeline.</p>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Zona</label>
              <select value={zone} onChange={e => setZone(e.target.value)} className={`mt-1 w-full ${SELECT_CLS}`}>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                <option value="__nueva__">+ Nueva zona…</option>
              </select>
              {zone === '__nueva__' && (
                <input
                  value={newZone}
                  onChange={e => setNewZone(e.target.value)}
                  placeholder="Nombre de la zona"
                  className="mt-1.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              )}
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Estatus</label>
              <select value={status} onChange={e => setStatus(e.target.value as FirmasStatus)} className={`mt-1 w-full ${SELECT_CLS}`}>
                {FIRMAS_STATUSES.map(s => <option key={s} value={s}>{FIRMAS_CONFIG[s].label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Encargados</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {profiles.map(p => {
                const active = managers.includes(p.id)
                const c = scoutColor(p.avatar || p.name)
                return (
                  <button
                    key={p.id}
                    onClick={() => setManagers(prev => active ? prev.filter(m => m !== p.id) : [...prev, p.id])}
                    className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      active ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p.avatar || p.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}
