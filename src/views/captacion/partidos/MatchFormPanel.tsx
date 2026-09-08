import { useState, useMemo } from 'react'
import type { ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { buscarPartidosParecidos } from '../../../lib/duplicados'
import { useDebounce } from '../../../hooks/useDebounce'
import { FormRow, Spinner } from '../comun'
import { type ShowToast, COMPETITION_OPTIONS, fmtDate } from '../helpers'
// ── MatchFormPanel — isolated so keystrokes don't re-render the whole list ──
export type MatchFormState = { date: string; time: string; homeTeam: string; awayTeam: string; competition: string; assignedTo: string; viewMode: 'video' | 'campo'; notes: string }
function emptyMatchForm(fecha = ''): MatchFormState {
  return { date: fecha, time: '', homeTeam: '', awayTeam: '', competition: '', assignedTo: '', viewMode: 'video', notes: '' }
}
export function MatchFormPanel({ initial, fechaInicial, profiles, onSave, onCancel, showToast, partidos = [], onOpenExisting }: {
  initial?: ScoutingMatch
  /** Fecha preseleccionada al crear (p. ej. el viernes de la planificación) */
  fechaInicial?: string
  profiles: Profile[]
  onSave: (f: MatchFormState) => Promise<void>
  onCancel: () => void
  showToast?: ShowToast
  /** Para avisar de un partido que ya existe (mismos equipos, fecha ±3 días) */
  partidos?: ScoutingMatch[]
  onOpenExisting?: (id: string) => void
}) {
  const [form, setForm] = useState<MatchFormState>(initial
    ? { date: initial.date, time: initial.time ?? '', homeTeam: initial.homeTeam, awayTeam: initial.awayTeam, competition: initial.competition ?? '', assignedTo: initial.assignedTo ?? '', viewMode: initial.viewMode ?? 'video', notes: initial.notes ?? '' }
    : emptyMatchForm(fechaInicial)
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof MatchFormState, v: string) => setForm(f => ({ ...f, [k]: v }))
  // Aviso de duplicado: solo al crear (al editar saldría el propio partido)
  const [ocultarParecidos, setOcultarParecidos] = useState(false)
  const equiposDeb = useDebounce(`${form.homeTeam}|${form.awayTeam}|${form.date}`, 300)
  const parecidos = useMemo(() => {
    if (initial || ocultarParecidos) return []
    const [h, a, d] = equiposDeb.split('|')
    if (h.trim().length < 3 || a.trim().length < 3 || !d) return []
    return buscarPartidosParecidos(h, a, d, partidos)
  }, [initial, ocultarParecidos, equiposDeb, partidos])
  async function handleSave() {
    if (!form.homeTeam.trim() || !form.awayTeam.trim() || !form.date || saving) return
    setSaving(true)
    try {
      await onSave(form)
      showToast?.(initial ? 'Partido actualizado' : 'Partido añadido')
    } catch {
      showToast?.('Error al guardar el partido', 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">{initial ? 'Editar partido' : 'Nuevo partido'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <FormRow label="Fecha"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="field" /></FormRow>
        <FormRow label="Hora (opcional)"><input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="field" /></FormRow>
        <FormRow label="Competición">
          <input value={form.competition} onChange={e => set('competition', e.target.value)} list="competition-options" className="field" placeholder="Liga, Copa..." />
          <datalist id="competition-options">{COMPETITION_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
        </FormRow>
        <FormRow label="Visualización">
          <select value={form.viewMode} onChange={e => set('viewMode', e.target.value as 'video' | 'campo')} className="field">
            <option value="video">📹 Vídeo</option>
            <option value="campo">🏟️ Campo</option>
          </select>
        </FormRow>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <FormRow label="Local"><input value={form.homeTeam} onChange={e => set('homeTeam', e.target.value)} className="field" placeholder="Equipo local" /></FormRow>
        <FormRow label="Visitante"><input value={form.awayTeam} onChange={e => set('awayTeam', e.target.value)} className="field" placeholder="Equipo visitante" /></FormRow>
      </div>
      {parecidos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">¿Es alguno de estos? Ya hay un partido parecido</span>
            <button onClick={() => setOcultarParecidos(true)} className="ml-auto text-[11px] text-amber-700 hover:underline">No, crear nuevo</button>
          </div>
          {parecidos.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="min-w-0 truncate">
                <b>{m.homeTeam} vs {m.awayTeam}</b>
                <span className="text-amber-700/80"> · {fmtDate(m.date)}{m.competition ? ` · ${m.competition}` : ''}{m.status === 'visto' ? ' · visto' : ''}</span>
              </span>
              {onOpenExisting && (
                <button onClick={() => onOpenExisting(m.id)} className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-md bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700">
                  Abrir
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <FormRow label="Asignado a">
        <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className="field">
          <option value="">Sin asignar</option>
          {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
        </select>
      </FormRow>
      <FormRow label="Notas">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="field resize-none" placeholder="Jugadores vistos, observaciones..." />
      </FormRow>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving || !form.homeTeam.trim() || !form.awayTeam.trim() || !form.date}
          className="flex-1 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
          {saving && <Spinner />}
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir partido'}
        </button>
      </div>
    </div>
  )
}
