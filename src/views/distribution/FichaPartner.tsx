// ── Ficha reducida (cuentas de partner externo) ──────────────────────
//
// Lo único que un partner ve de un jugador: los datos deportivos básicos.
// Nada de contrato de representación, teléfono, notas ni tareas — esos
// datos ni siquiera le llegan desde la base de datos.
//   · Jugador suyo            → puede editar estos datos.
//   · Jugador de otro partner
//     o nuestro compartido    → solo lectura.

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Player } from '../../types'
import { POSITIONS, positionLabel } from '../../lib/positions'
import { isValidName, isValidDate } from '../../lib/validate'
import { parseDia } from '../../lib/fechas'
import { BtnSpinner, Avatar } from './shared'
import { ModalShell } from './modales'

const PIES: { id: NonNullable<Player['foot']>; label: string }[] = [
  { id: 'derecho', label: 'Diestro' },
  { id: 'izquierdo', label: 'Zurdo' },
  { id: 'ambidiestro', label: 'Ambidiestro' },
]

const campo = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
const etiqueta = 'text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1'

export function FichaPartner({ player, editable, onClose, onSave }: {
  player: Player
  /** true si el jugador es del partner de la cuenta */
  editable: boolean
  onClose: () => void
  /** Puede rechazar: aquí se enseña el error y la ficha sigue abierta */
  onSave: (p: Player) => Promise<void>
}) {
  const clubActual = player.clubs.find(c => c.type === 'principal') ?? player.clubs[0]
  const [name, setName] = useState(player.name)
  const [birthDate, setBirthDate] = useState(player.birthDate ?? '')
  const [position, setPosition] = useState(player.positions[0] ?? '')
  const [nationality, setNationality] = useState(player.nationality ?? '')
  const [foot, setFoot] = useState<string>(player.foot ?? '')
  const [club, setClub] = useState(clubActual?.name ?? '')
  const [tm, setTm] = useState(player.transfermarktUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (saving) return
    if (!isValidName(name)) { setError('Introduce un nombre válido (mínimo 2 caracteres).'); return }
    if (birthDate && !isValidDate(birthDate)) { setError('Fecha de nacimiento no válida.'); return }
    if (!position) { setError('Elige una posición.'); return }
    setError('')
    setSaving(true)
    try {
      // El club actual se cambia en su sitio; el resto de clubes (cesiones…) se conserva
      const otros = player.clubs.filter(c => c !== clubActual)
      const clubs = club.trim()
        ? [{ ...(clubActual ?? { type: 'principal' as const }), name: club.trim() }, ...otros]
        : otros
      await onSave({
        ...player,
        name: name.trim(),
        birthDate,
        positions: [position, ...player.positions.filter(p => p !== position && p !== player.positions[0])],
        nationality: nationality.trim(),
        foot: (foot || undefined) as Player['foot'],
        clubs,
        transfermarktUrl: tm.trim() || undefined,
      })
      onClose()
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  if (!editable) {
    const nacimiento = player.birthDate && isValidDate(player.birthDate)
      ? parseDia(player.birthDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined
    const dato = (titulo: string, valor?: string) => (
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{titulo}</p>
        <p className="text-sm text-slate-800">{valor || '—'}</p>
      </div>
    )
    const enlaces = [
      ...(player.transfermarktUrl ? [{ label: 'Transfermarkt', url: player.transfermarktUrl }] : []),
      ...(player.links ?? []).filter(l => l.url).map(l => ({ label: l.label || 'Enlace', url: l.url })),
    ]
    return (
      <ModalShell title="Ficha del jugador" onClose={onClose}>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={player.name} photo={player.photo} size="md" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{player.name}</p>
            <p className="text-xs text-slate-500">
              {player.partnerOrigen ? `Jugador de ${player.partnerOrigen}` : 'Jugador de All Iron Sports'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {dato('Posición', player.positions.map(positionLabel).join(', '))}
          {dato('Nacimiento', nacimiento)}
          {dato('Nacionalidad', player.nationality)}
          {dato('Pie', PIES.find(p => p.id === player.foot)?.label)}
          <div className="col-span-2">{dato('Club', player.clubs.map(c => c.name).filter(Boolean).join(' · '))}</div>
        </div>
        {enlaces.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {enlaces.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-100 bg-blue-50 rounded-lg px-2 py-1 hover:bg-blue-100">
                <ExternalLink className="w-3 h-3" /> {l.label}
              </a>
            ))}
          </div>
        )}
      </ModalShell>
    )
  }

  return (
    <ModalShell title="Editar jugador" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={etiqueta}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} className={campo} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={etiqueta}>Posición</label>
            <select value={position} onChange={e => setPosition(e.target.value)} className={`${campo} text-slate-700`}>
              <option value="">—</option>
              {POSITIONS.map(p => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Pie</label>
            <select value={foot} onChange={e => setFoot(e.target.value)} className={`${campo} text-slate-700`}>
              <option value="">—</option>
              {PIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Nacimiento</label>
            <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={etiqueta}>Nacionalidad</label>
            <input value={nationality} onChange={e => setNationality(e.target.value)} className={campo} />
          </div>
        </div>
        <div>
          <label className={etiqueta}>Club actual</label>
          <input value={club} onChange={e => setClub(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>Transfermarkt</label>
          <input value={tm} onChange={e => setTm(e.target.value)} placeholder="https://www.transfermarkt…" className={campo} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={() => void guardar()} disabled={saving}
          className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}
