import { useState, useMemo } from 'react'
import type { ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { buscarPartidosParecidos } from '../../../lib/duplicados'
import { useDebounce } from '../../../hooks/useDebounce'
import { Dialog, Button, Field, Input, Select, Textarea } from '../../../components/ui'
import { L } from '../../../lib/labels'
import { type ShowToast, COMPETITION_OPTIONS, fmtDate } from '../helpers'
// ── MatchFormPanel — alta/edición de partido en un Dialog ─────
// Aislado para que las pulsaciones no repinten toda la lista. Enter guarda,
// Escape/atrás cierran y, si hay cambios, se pregunta antes de descartarlos.
export type MatchFormState = { date: string; time: string; homeTeam: string; awayTeam: string; competition: string; assignedTo: string; viewMode: 'video' | 'campo'; notes: string }
function emptyMatchForm(fecha = ''): MatchFormState {
  return { date: fecha, time: '', homeTeam: '', awayTeam: '', competition: '', assignedTo: '', viewMode: 'video', notes: '' }
}
function fromMatch(m: ScoutingMatch): MatchFormState {
  return { date: m.date, time: m.time ?? '', homeTeam: m.homeTeam, awayTeam: m.awayTeam, competition: m.competition ?? '', assignedTo: m.assignedTo ?? '', viewMode: m.viewMode ?? 'video', notes: m.notes ?? '' }
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
  const inicial = useMemo(() => initial ? fromMatch(initial) : emptyMatchForm(fechaInicial), [initial, fechaInicial])
  const [form, setForm] = useState<MatchFormState>(inicial)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof MatchFormState, v: string) => setForm(f => ({ ...f, [k]: v }))
  const dirty = (Object.keys(form) as (keyof MatchFormState)[]).some(k => form[k] !== inicial[k])
  // Aviso de duplicado: solo al crear (al editar saldría el propio partido)
  const [ocultarParecidos, setOcultarParecidos] = useState(false)
  const equiposDeb = useDebounce(`${form.homeTeam}|${form.awayTeam}|${form.date}`, 300)
  const parecidos = useMemo(() => {
    if (initial || ocultarParecidos) return []
    const [h, a, d] = equiposDeb.split('|')
    if (h.trim().length < 3 || a.trim().length < 3 || !d) return []
    return buscarPartidosParecidos(h, a, d, partidos)
  }, [initial, ocultarParecidos, equiposDeb, partidos])
  const puedeGuardar = !!form.homeTeam.trim() && !!form.awayTeam.trim() && !!form.date && !saving
  async function handleSave() {
    if (!puedeGuardar) return
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
    <Dialog
      open
      onClose={onCancel}
      title={initial ? 'Editar partido' : 'Nuevo partido'}
      size="lg"
      dirty={dirty}
      historyKey="form-partido"
      onSubmit={e => { e.preventDefault(); void handleSave() }}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" disabled={!puedeGuardar} loading={saving}>
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir partido'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Field label="Fecha" required><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
          <Field label="Hora (opcional)"><Input type="time" value={form.time} onChange={e => set('time', e.target.value)} /></Field>
          <Field label="Competición">
            <Input value={form.competition} onChange={e => set('competition', e.target.value)} list="competition-options" placeholder="Liga, Copa..." />
          </Field>
          <datalist id="competition-options">{COMPETITION_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
          <Field label="Visualización">
            <Select value={form.viewMode} onChange={e => set('viewMode', e.target.value as 'video' | 'campo')}>
              <option value="video">Vídeo</option>
              <option value="campo">Campo</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Local" required><Input value={form.homeTeam} onChange={e => set('homeTeam', e.target.value)} placeholder="Equipo local" /></Field>
          <Field label="Visitante" required><Input value={form.awayTeam} onChange={e => set('awayTeam', e.target.value)} placeholder="Equipo visitante" /></Field>
        </div>
        {parecidos.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-secondary text-amber-800 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">¿Es alguno de estos? Ya hay un partido parecido</span>
              <Button size="sm" variant="link" onClick={() => setOcultarParecidos(true)} className="ml-auto text-amber-700">No, crear nuevo</Button>
            </div>
            {parecidos.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="min-w-0 truncate">
                  <b>{m.homeTeam} vs {m.awayTeam}</b>
                  <span className="text-amber-700/80"> · {fmtDate(m.date)}{m.competition ? ` · ${m.competition}` : ''}{m.status === 'visto' ? ' · visto' : ''}</span>
                </span>
                {onOpenExisting && (
                  <Button size="sm" onClick={() => onOpenExisting(m.id)} className="ml-auto flex-shrink-0 bg-amber-600 text-white border-amber-600 hover:bg-amber-700">
                    Abrir
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <Field label={L.scout}>
          <Select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
            <option value="">Sin asignar</option>
            {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Notas" hint="Ctrl+Enter para guardar">
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="resize-none" placeholder="Jugadores vistos, observaciones..." />
        </Field>
      </div>
    </Dialog>
  )
}
