import { useState, useMemo } from 'react'
import { PenLine } from 'lucide-react'
import type { ScoutingPlayer, FirmasEntry } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { ZONAS_PIPELINE as FIRMAS_ZONE_ORDER } from '../../../lib/zonas'
import { type ShowToast, SELECT_CLS } from '../helpers'
import { FIRMAS_CONFIG } from './helpers'
// ── Botón "Añadir a Firmar" desde la ficha de un jugador ─────
// Si ya está en el pipeline muestra su estatus y salta a su tarjeta;
// si no, pide solo la zona y lo crea vinculado.
export function AddToFirmasButton({ player, firmasEntries, currentProfile, onCreate, onJumpToEntry, showToast }: {
  player: ScoutingPlayer
  firmasEntries: FirmasEntry[]
  currentProfile: Profile
  onCreate: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  onJumpToEntry: (id: string) => void
  showToast: ShowToast
}) {
  const [open, setOpen] = useState(false)
  const [zone, setZone] = useState('')
  const [saving, setSaving] = useState(false)

  const existing = firmasEntries.find(f => f.scoutingPlayerId === player.id)

  const zones = useMemo(() => {
    const present = [...new Set(firmasEntries.map(e => e.zone))]
    const canonical = FIRMAS_ZONE_ORDER.filter(z => present.includes(z))
    const extra = present.filter(z => !FIRMAS_ZONE_ORDER.includes(z)).sort((a, b) => a.localeCompare(b))
    const all = [...canonical, ...extra]
    return all.length > 0 ? all : FIRMAS_ZONE_ORDER
  }, [firmasEntries])

  if (existing) {
    const cfg = FIRMAS_CONFIG[existing.status]
    return (
      <button
        onClick={() => onJumpToEntry(existing.id)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${cfg.bg} ${cfg.text} ${cfg.border}`}
        title="Ver su tarjeta en Firmar"
      >
        <PenLine className="w-3 h-3" />
        En Firmar · {cfg.label} →
      </button>
    )
  }

  const create = async () => {
    if (!zone || saving) return
    setSaving(true)
    try {
      const maxPos = Math.max(0, ...firmasEntries.filter(e => e.zone === zone && e.status === 'llamar').map(e => e.sortPos))
      const saved = await onCreate({
        playerName: player.fullName,
        zone,
        status: 'llamar',
        scoutingPlayerId: player.id,
        knownTeam: player.team,
        managers: [currentProfile.id],
        notes: undefined,
        comments: [],
        trelloUrl: undefined,
        statusUpdatedAt: new Date().toISOString(),
        sortPos: maxPos + 1,
      })
      setOpen(false)
      showToast(`${player.fullName} añadido a Firmar (${zone})`)
      onJumpToEntry(saved.id)
    } catch (err) {
      console.error(err)
      showToast('No se pudo añadir a Firmar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => { setZone(zones[0] ?? ''); setOpen(o => !o) }}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        title="Crear su tarjeta en el pipeline de Firmar, vinculada a esta ficha"
      >
        <PenLine className="w-3 h-3" />
        Añadir a Firmar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-64" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">¿En qué zona?</p>
            <select value={zone} onChange={e => setZone(e.target.value)} className={`w-full ${SELECT_CLS}`}>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <p className="mt-1.5 text-[10.5px] text-slate-400">Entra en estatus «Llamar», vinculado a esta ficha y contigo de encargado.</p>
            <div className="mt-2 flex justify-end gap-1.5">
              <button onClick={() => setOpen(false)} className="px-2.5 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button
                onClick={() => void create()}
                disabled={!zone || saving}
                className="px-3 py-1 rounded-lg bg-primary text-white text-[11px] font-semibold disabled:opacity-40 hover:bg-primary/90"
              >
                {saving ? 'Añadiendo…' : 'Añadir'}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
