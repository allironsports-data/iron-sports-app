// ── Fila de edición de un partido, dentro de la propia tabla ──────────
//
// Al pulsar el lápiz, la fila se convierte en formulario en su sitio: los
// mismos campos que el panel de alta pero cada uno en su columna. Antes el
// panel se abría arriba del todo y, con la lista larga, ni se veía.

import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { COMPETITION_OPTIONS } from '../helpers'
import { Spinner } from '../comun'
import type { MatchFormState } from './MatchFormPanel'

const campo = 'w-full border border-slate-300 rounded-md px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30'

export function MatchEditRow({ match, profiles, onSave, onCancel, equipos = [] }: {
  equipos?: string[]
  match: ScoutingMatch
  profiles: Profile[]
  onSave: (f: MatchFormState) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<MatchFormState>({
    date: match.date, time: match.time ?? '', homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    competition: match.competition ?? '', assignedTo: match.assignedTo ?? '', viewMode: match.viewMode ?? 'video', notes: match.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof MatchFormState, v: string) => setForm(f => ({ ...f, [k]: v }))
  const valido = !!form.homeTeam.trim() && !!form.awayTeam.trim() && !!form.date
  useEscapeKey(onCancel)
  // Si se edita desde la ficha o desde otro sitio, que la fila quede a la vista
  const fila = useRef<HTMLTableRowElement>(null)
  useEffect(() => { fila.current?.scrollIntoView({ block: 'nearest' }) }, [])

  async function guardar() {
    if (!valido || saving) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }
  const alIntro = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void guardar() } }

  return (
    <tr ref={fila} className="bg-blue-50/60 ring-1 ring-inset ring-blue-200" onClick={e => e.stopPropagation()}>
      <td className="px-2 py-1.5 align-top space-y-1">
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={campo} aria-label="Fecha" />
        <input type="time" value={form.time} onChange={e => set('time', e.target.value)} className={campo} aria-label="Hora" />
      </td>
      <td className="px-2 py-1.5 align-top">
        <datalist id="equipos-conocidos-fila">{equipos.map(n => <option key={n} value={n} />)}</datalist>
        <input autoFocus value={form.homeTeam} onChange={e => set('homeTeam', e.target.value)} onKeyDown={alIntro} list="equipos-conocidos-fila" className={campo} placeholder="Local" aria-label="Local" />
      </td>
      <td className="px-1 py-1.5 align-top text-center text-[11px] font-bold text-slate-400 pt-2.5">vs</td>
      <td className="px-2 py-1.5 align-top">
        <input value={form.awayTeam} onChange={e => set('awayTeam', e.target.value)} onKeyDown={alIntro} list="equipos-conocidos-fila" className={campo} placeholder="Visitante" aria-label="Visitante" />
      </td>
      <td className="px-2 py-1.5 align-top">
        <input value={form.competition} onChange={e => set('competition', e.target.value)} onKeyDown={alIntro} list="competition-options-fila" className={campo} placeholder="Competición" aria-label="Competición" />
        <datalist id="competition-options-fila">{COMPETITION_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
      </td>
      <td className="px-2 py-1.5 align-top">
        <select value={form.viewMode} onChange={e => set('viewMode', e.target.value as 'video' | 'campo')} className={campo} aria-label="Visualización">
          <option value="video">📹 Vídeo</option>
          <option value="campo">🏟️ Campo</option>
        </select>
      </td>
      <td className="px-2 py-1.5 align-top">
        <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className={campo} aria-label="Responsable">
          <option value="">Sin asignar</option>
          {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5 align-top" />
      <td className="px-2 py-1.5 align-top">
        <input value={form.notes} onChange={e => set('notes', e.target.value)} onKeyDown={alIntro} className={campo} placeholder="Notas" aria-label="Notas" />
      </td>
      <td className="px-2 py-1.5 align-top" />
      <td className="px-2 py-1.5 align-top">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => void guardar()} disabled={!valido || saving} title="Guardar (Enter)" aria-label="Guardar"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40">
            {saving ? <Spinner /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onCancel} title="Cancelar (Esc)" aria-label="Cancelar" className="p-1 rounded-md border border-slate-200 text-slate-500 hover:bg-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}
