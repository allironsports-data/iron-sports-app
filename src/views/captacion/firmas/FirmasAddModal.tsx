import { useState } from 'react'
import type { ScoutingPlayer, FirmasEntry, FirmasStatus } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { Dialog, Button, Field, Input, Select } from '../../../components/ui'
import { L } from '../../../lib/labels'
import { isValidName } from '../../../lib/validate'
import { norm as normSearch } from '../../../lib/texto'
import { scoutColor } from '../helpers'
import { FirmasLinkSearch } from './comun'
import { FIRMAS_STATUSES, FIRMAS_CONFIG } from './helpers'
// ── Modal de alta en Firmar ──────────────────────────────────
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

  const zoneValue = zone === '__nueva__' ? newZone.trim() : zone
  const duplicate = existing.some(e => normSearch(e.playerName) === normSearch(linked?.fullName ?? name))
  const canSave = (linked || isValidName(name.trim())) && zoneValue && !saving
  const dirty = name.trim().length > 0 || !!linked

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
    <Dialog
      open
      onClose={onClose}
      title={`Añadir jugador a ${L.firmar}`}
      size="sm"
      dirty={dirty}
      historyKey="firmas-alta"
      onSubmit={e => { e.preventDefault(); void save() }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" disabled={!canSave} loading={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* vincular con scouting (opcional, rellena el nombre) */}
        <div>
          <span className="text-meta font-semibold text-slate-600">Jugador de Captación (opcional)</span>
          {linked ? (
            <div className="mt-1 flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
              <div className="min-w-0">
                <div className="text-secondary font-semibold text-slate-800 truncate">{linked.fullName}</div>
                <div className="text-badge text-slate-500">
                  {[linked.team, linked.birthdate ? linked.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <Button size="sm" variant="link" onClick={() => setLinked(null)} className="text-slate-600 hover:text-red-600">Quitar</Button>
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

        <Field label="Nombre" required hint={duplicate ? `Ya hay un jugador con este nombre en ${L.firmar}.` : undefined}>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del jugador" />
        </Field>

        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Field label="Zona">
              <Select value={zone} onChange={e => setZone(e.target.value)}>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                <option value="__nueva__">+ Nueva zona…</option>
              </Select>
            </Field>
            {zone === '__nueva__' && (
              <Input
                value={newZone}
                onChange={e => setNewZone(e.target.value)}
                placeholder="Nombre de la zona"
                aria-label="Nombre de la nueva zona"
              />
            )}
          </div>
          <Field label="Estatus" className="flex-1">
            <Select value={status} onChange={e => setStatus(e.target.value as FirmasStatus)}>
              {FIRMAS_STATUSES.map(s => <option key={s} value={s}>{FIRMAS_CONFIG[s].label}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <span className="text-meta font-semibold text-slate-600">{L.encargados}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={L.encargados}>
            {profiles.map(p => {
              const active = managers.includes(p.id)
              const c = scoutColor(p.avatar || p.name)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  title={p.name}
                  onClick={() => setManagers(prev => active ? prev.filter(m => m !== p.id) : [...prev, p.id])}
                  className={`px-2 py-1 rounded-full text-badge font-semibold border transition-colors ${
                    active ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                  }`}
                >
                  {p.avatar || p.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
