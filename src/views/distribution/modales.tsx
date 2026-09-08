import { useState, useMemo, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { Search, Star, Building2, X, AlertCircle } from 'lucide-react'
import type { Player, Club, ClubNeed, DistributionEntry, ClubNegotiation, ClubNegotiationUpdate } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ManagerSelect } from '../../components/ManagerSelect'
import { Button, Dialog, Field, IconButton, Input, Select, Textarea } from '../../components/ui'
import { L, NEG_STATUS_LABELS } from '../../lib/labels'
import { isValidName, isValidDate } from '../../lib/validate'
import { POSITIONS, positionLabel } from '../../lib/positions'
import { countryCode3 } from '../../lib/clubTiers'
import { norm } from '../../lib/texto'
import { Avatar } from './shared'
import { CONDITIONS, NEG_STATUSES, STATUS_CONFIG, PRIORITY_CONFIG } from './constantes'

// ── Modales de Distribución ───────────────────────────────────
// Todos van sobre Dialog (foco, Escape, fondo, atrás del móvil). Los que
// tienen texto libre pasan `dirty` para que cerrar pregunte antes.

/** Clase del ManagerSelect para que se vea como el resto de controles del kit */
const MANAGER_CLS = 'ui-input'

/** Fila de botones A/B/C/D de prioridad (radiogroup) */
function PrioridadPicker({ value, onChange }: { value: 'A' | 'B' | 'C' | 'D'; onChange: (p: 'A' | 'B' | 'C' | 'D') => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={L.prioridad}>
      {(['A', 'B', 'C', 'D'] as const).map(p => {
        const cfg = PRIORITY_CONFIG[p]
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={`flex-1 py-2 rounded-lg text-body font-bold border-2 transition-all ${value === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >{p}</button>
        )
      })}
    </div>
  )
}

/** Chips de estado de negociación (radiogroup) */
function EstadoPicker({ value, onChange }: { value: ClubNegotiation['status']; onChange: (s: ClubNegotiation['status']) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={L.estado}>
      {NEG_STATUSES.map(s => {
        const cfg = STATUS_CONFIG[s]
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={`px-3 min-h-9 sm:min-h-8 rounded-full text-secondary font-medium transition-all ${value === s ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {NEG_STATUS_LABELS[s]}
          </button>
        )
      })}
    </div>
  )
}

// ── ADD PLAYER MODAL ──────────────────────────────────────────

export function AddPlayerModal({ players, existingPlayerIds, season, onClose, onSave, onCreatePlayer, onToast }: {
  players: Player[]
  existingPlayerIds: string[]
  season: string
  onClose: () => void
  /** Puede rechazar: el padre ya enseña su toast, el modal solo decide qué hacer después */
  onSave: (data: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<void>
  onCreatePlayer?: (p: Player) => Promise<Player>
  onToast: (msg: string, variant?: 'success' | 'error' | 'info') => void
}) {
  const [mode, setMode] = useState<'existing' | 'intermediar'>('existing')

  // Existing player state
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)

  // New intermediar player state
  const [newName, setNewName] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [newNationality, setNewNationality] = useState('')
  const [newBirthYear, setNewBirthYear] = useState('')
  const [newClub, setNewClub] = useState('')

  // Shared state
  const [priority, setPriority] = useState<'A' | 'B' | 'C' | 'D'>('B')
  const [condition, setCondition] = useState('')
  const [transferFee, setTransferFee] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [yearError, setYearError] = useState('')

  const available = players.filter(p =>
    !existingPlayerIds.includes(p.id) &&
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  const dirty = !!(notes.trim() || newName.trim() || newClub.trim() || transferFee.trim())

  async function handleSave() {
    if (!selected || saving) return
    setSaving(true)
    try {
      await onSave({
        playerId: selected.id,
        season,
        priority,
        condition: condition || undefined,
        transferFee: transferFee || undefined,
        notes: notes || undefined,
        active: true,
      })
    } catch { /* el padre ya ha avisado */ }
    finally { setSaving(false) }
  }

  async function handleCreateIntermediar() {
    if (!newName || !newPosition || !onCreatePlayer || saving) return
    let hasErrors = false
    if (!isValidName(newName)) {
      setNameError('Introduce un nombre válido (mínimo 2 caracteres).')
      hasErrors = true
    }
    if (newBirthYear && (!isValidDate(`${newBirthYear}-01-01`) || Number(newBirthYear) < 1950 || Number(newBirthYear) > new Date().getFullYear())) {
      setYearError('Año de nacimiento no válido.')
      hasErrors = true
    }
    if (hasErrors) return
    setSaving(true)
    try {
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        name: newName,
        birthDate: newBirthYear ? `${newBirthYear}-01-01` : '',
        positions: [newPosition],
        nationality: newNationality,
        photo: '',
        clubs: newClub ? [{ name: newClub, type: 'principal' as const }] : [],
        partner: undefined,
        managedBy: [],
        hiddenFromManagement: true,
        representationContract: { start: '', end: '' },
        clubContract: { endDate: '' },
        contractHistory: [],
        clubInterests: [],
        matchReports: [],
        videoSessions: [],
        links: [],
        performance: [],
        info: { family: '', personality: '', phone: '' },
      }
      // Dos pasos sin transacción: si falla el primero no hay nada creado; si
      // falla el segundo el jugador YA existe y repetir crearía un duplicado.
      let saved: Player
      try {
        saved = await onCreatePlayer(newPlayer)
      } catch (err) {
        console.error(err)
        onToast('No se pudo crear el jugador. Inténtalo de nuevo.', 'error')
        return
      }
      try {
        await onSave({
          playerId: saved.id,
          season,
          priority,
          condition: condition || undefined,
          transferFee: transferFee || undefined,
          notes: notes || undefined,
          active: true,
        })
      } catch {
        onToast(`${saved.name} ya se ha creado como jugador, pero no se pudo añadir a distribución. Añádelo desde «Existente».`, 'error')
      }
    } finally { setSaving(false) }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (mode === 'existing') void handleSave()
    else void handleCreateIntermediar()
  }

  // Shared priority + condition fields (reused in both modes)
  const sharedFields = (
    <div className="space-y-3 pt-1">
      <Field label={L.prioridad}>
        {() => <PrioridadPicker value={priority} onChange={setPriority} />}
      </Field>
      <Field label="Condición de salida">
        <Select value={condition} onChange={e => setCondition(e.target.value)}>
          <option value="">Sin especificar</option>
          {CONDITIONS.map(c => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
        <Field label="Importe">
          <Input value={transferFee} onChange={e => setTransferFee(e.target.value)} placeholder="400k, 2M…" />
        </Field>
      )}
      <Field label="Notas (opcional)">
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </Field>
    </div>
  )

  const puedeGuardar = mode === 'existing' ? !!selected : (!!newName && !!newPosition)
  const footer = (mode === 'existing' && !selected) ? undefined : (
    <>
      <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
      <Button type="submit" variant="primary" loading={saving} disabled={!puedeGuardar}>
        {mode === 'existing' ? 'Añadir a distribución' : 'Crear y añadir a distribución'}
      </Button>
    </>
  )

  return (
    <Dialog open onClose={onClose} title="Añadir jugador a distribución" onSubmit={onSubmit} dirty={dirty} footer={footer} historyKey="dist-add-player">
      {/* Mode toggle */}
      {onCreatePlayer && (
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-lg" role="tablist" aria-label="Origen del jugador">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'existing'}
            onClick={() => setMode('existing')}
            className={`flex-1 py-1.5 rounded-md text-secondary font-medium transition-colors ${mode === 'existing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Cartera AIS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'intermediar'}
            onClick={() => setMode('intermediar')}
            className={`flex-1 py-1.5 rounded-md text-secondary font-medium transition-colors ${mode === 'intermediar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Solo intermediar
          </button>
        </div>
      )}

      {mode === 'existing' ? (
        /* ── Existing player flow ── */
        !selected ? (
          <div>
            <Field label="Buscar jugador">
              <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugador…" className="mb-2" />
            </Field>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {available.slice(0, 20).map(p => (
                <button key={p.id} type="button" onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left">
                  <Avatar name={p.name} photo={p.photo} />
                  <div>
                    <div className="text-body font-medium text-slate-800">{p.name}</div>
                    <div className="text-secondary text-slate-500">{positionLabel(p.positions[0])}</div>
                  </div>
                </button>
              ))}
              {available.length === 0 && <div className="text-body text-slate-500 text-center py-4">Sin resultados</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
              <Avatar name={selected.name} photo={selected.photo} size="md" />
              <div>
                <div className="text-body font-medium text-slate-800">{selected.name}</div>
                <div className="text-secondary text-slate-500">{positionLabel(selected.positions[0])}</div>
              </div>
              <IconButton label="Quitar selección" onClick={() => setSelected(null)} className="ml-auto">
                <X />
              </IconButton>
            </div>
            {sharedFields}
          </div>
        )
      ) : (
        /* ── Nuevo jugador Solo Intermediar ── */
        <div className="space-y-3">
          <p className="text-secondary text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Este jugador aparecerá solo en Distribución. No tendrá ficha de mantenimiento (tareas, contrato, etc.).
          </p>
          <Field label="Nombre completo" required error={nameError || undefined}>
            <Input autoFocus value={newName} onChange={e => { setNewName(e.target.value); if (nameError) setNameError('') }} placeholder="Nombre completo" />
          </Field>
          <Field label="Posición" required>
            <Select value={newPosition} onChange={e => setNewPosition(e.target.value)}>
              <option value="">Seleccionar…</option>
              {POSITIONS.map(p => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Field label="Nacionalidad" className="flex-1">
              <Input value={newNationality} onChange={e => setNewNationality(e.target.value)} placeholder="Nacionalidad" />
            </Field>
            <Field label="Año nacimiento" className="w-36" error={yearError || undefined}>
              <Input value={newBirthYear} onChange={e => { setNewBirthYear(e.target.value); if (yearError) setYearError('') }}
                placeholder="2004" type="number" min="1985" max={new Date().getFullYear() - 16} />
            </Field>
          </div>
          <Field label="Club actual (opcional)">
            <Input value={newClub} onChange={e => setNewClub(e.target.value)} placeholder="Club actual" />
          </Field>
          {sharedFields}
        </div>
      )}
    </Dialog>
  )
}

// ── NEED FORM INLINE (solicitudes tab) ───────────────────────

export function NeedFormInline({ initial, onSave, onCancel }: {
  initial?: ClubNeed
  onSave: (need: ClubNeed) => Promise<void>
  onCancel: () => void
}) {
  const [position, setPosition] = useState(initial?.position ?? '')
  const [ageMax, setAgeMax] = useState(initial?.ageMax?.toString() ?? '')
  const [transferBudget, setTransferBudget] = useState(initial?.transferBudget ?? '')
  const [salaryBudget, setSalaryBudget] = useState(initial?.salaryBudget ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e?: FormEvent) {
    e?.preventDefault()
    if (!position || saving) return
    setSaving(true)
    try {
      await onSave({ position, ageMax: Number.isFinite(parseInt(ageMax)) ? parseInt(ageMax) : undefined, transferBudget: transferBudget || undefined, salaryBudget: salaryBudget || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <Field label="Posición" required>
        {() => (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Posición">
            {POSITIONS.map(p => (
              <button key={p.code} type="button" role="radio" aria-checked={position === p.code} onClick={() => setPosition(p.code)} title={p.es}
                className={`px-2.5 min-h-9 sm:min-h-8 rounded-lg text-secondary font-medium border transition-colors ${position === p.code ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
              >{p.code}</button>
            ))}
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Edad máx.">
          <Input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="23" />
        </Field>
        <Field label="Traspaso">
          <Input value={transferBudget} onChange={e => setTransferBudget(e.target.value)} placeholder="400k, 2M…" />
        </Field>
        <Field label="Salario">
          <Input value={salaryBudget} onChange={e => setSalaryBudget(e.target.value)} placeholder="60k/año…" />
        </Field>
        <Field label="Notas">
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto…" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!position} loading={saving}>{L.guardar}</Button>
      </div>
    </form>
  )
}

// ── ADD CLUB MODAL ────────────────────────────────────────────

export function AddClubModal({ onClose, onSave, leagueOptions, profiles, currentProfileAvatar }: {
  onClose: () => void
  // El componente que abre este modal es quien sabe en qué temporada se está: añade `season` antes de guardar
  onSave: (data: Omit<Club, 'id' | 'createdAt' | 'season'>) => Promise<void>
  leagueOptions: { league: string; country: string }[]
  profiles: Profile[]
  currentProfileAvatar?: string
}) {
  const [name, setName] = useState('')
  const [leagueSearch, setLeagueSearch] = useState('')
  const [league, setLeague] = useState('')
  const [country, setCountry] = useState('')
  const [leagueOpen, setLeagueOpen] = useState(false)
  const [contactPerson, setContactPerson] = useState('')
  const [aisManager, setAisManager] = useState(currentProfileAvatar ?? '')
  const [notes, setNotes] = useState('')
  const [isPriority, setIsPriority] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredLeagues = leagueOptions.filter(l =>
    l.league.toLowerCase().includes(leagueSearch.toLowerCase()) ||
    l.country.toLowerCase().includes(leagueSearch.toLowerCase())
  )

  function selectLeague(l: { league: string; country: string }) {
    setLeague(l.league)
    setCountry(l.country)
    setLeagueSearch(l.league)
    setLeagueOpen(false)
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    if (!isValidName(name)) {
      setError('Introduce un nombre válido (mínimo 2 caracteres).')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        league: (league || leagueSearch).trim() || undefined,
        country: country || '',
        contactPerson: contactPerson || undefined,
        aisManager: aisManager || undefined,
        notes: notes || undefined,
        isPriority,
        needs: [],
      })
    } finally {
      setSaving(false)
    }
  }

  const dirty = !!(name.trim() || notes.trim() || contactPerson.trim())

  return (
    <Dialog
      open onClose={onClose} title="Añadir club" onSubmit={handleSave} dirty={dirty} historyKey="dist-add-club"
      footer={<>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()} loading={saving}>Añadir club</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Nombre" required error={error || undefined}>
          <Input autoFocus value={name} onChange={e => { setName(e.target.value); if (error) setError('') }} placeholder="Deportivo, Racing…" />
        </Field>

        {/* Liga — searchable dropdown */}
        <div className="relative">
          <Field label="Liga">
            <Input
              value={leagueSearch}
              onChange={e => { setLeagueSearch(e.target.value); setLeague(''); setLeagueOpen(true) }}
              onFocus={() => setLeagueOpen(true)}
              placeholder="Buscar liga…"
              autoComplete="off"
            />
          </Field>
          {leagueOpen && (filteredLeagues.length > 0 || leagueSearch.trim() !== '') && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLeagueOpen(false)} />
              <div className="absolute z-50 mt-1 w-full max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                {filteredLeagues.slice(0, 60).map(l => (
                  <button
                    key={`${l.league}|${l.country}`}
                    type="button"
                    onClick={() => selectLeague(l)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-body flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{l.league}{l.country && <span className="text-slate-500 font-normal"> · {countryCode3(l.country)}</span>}</span>
                    {l.country && <span className="text-meta text-slate-500 flex-shrink-0">{l.country}</span>}
                  </button>
                ))}
                {leagueSearch.trim() !== '' && !leagueOptions.some(l => l.league.toLowerCase() === leagueSearch.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => { setLeague(leagueSearch.trim()); setLeagueOpen(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-body text-primary font-medium border-t border-slate-100"
                  >
                    + Crear liga «{leagueSearch.trim()}»
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <Field label="País">
          <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Spain, France…" />
        </Field>

        <div className="flex gap-2">
          <Field label="Contacto club" className="flex-1">
            <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Nombre del contacto" />
          </Field>
          <Field label={L.encargado} className="w-40 sm:w-44">
            {() => <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} className={MANAGER_CLS} placeholder={L.sinEncargado} />}
          </Field>
        </div>
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-body text-slate-700">Club prioritario</span>
          <Star className="w-3.5 h-3.5 text-green-500" aria-hidden="true" />
        </label>
      </div>
    </Dialog>
  )
}

// ── ADD NEGOTIATION MODAL ─────────────────────────────────────

export function AddNegotiationModal({ players, clubs, entries, fixedPlayerId, fixedClubId, fixedNeedPosition, onClose, onSave, profiles, currentProfileAvatar }: {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  fixedPlayerId?: string
  fixedClubId?: string
  fixedNeedPosition?: string
  onClose: () => void
  onSave: (data: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  profiles: Profile[]
  currentProfileAvatar?: string
}) {
  const distributionPlayerIds = entries.map(e => e.playerId)
  const [playerId, setPlayerId] = useState(fixedPlayerId ?? '')
  const [clubId, setClubId] = useState(fixedClubId ?? '')
  const [status, setStatus] = useState<ClubNegotiation['status']>('pendiente')
  // Encargado por defecto: el del club; si no hay, quien crea. Editable.
  const [aisManager, setAisManager] = useState(() => {
    const c = clubs.find(cl => cl.id === (fixedClubId ?? ''))
    return c?.aisManager || currentProfileAvatar || ''
  })
  const [mgrTouched, setMgrTouched] = useState(false)
  useEffect(() => {
    if (mgrTouched) return
    const c = clubs.find(cl => cl.id === clubId)
    setAisManager(c?.aisManager || currentProfileAvatar || '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectablePlayers = players.filter(p => distributionPlayerIds.includes(p.id))

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!playerId || !clubId || saving) return
    setSaving(true)
    try {
      await onSave({ playerId, clubId, needPosition: fixedNeedPosition, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <Dialog
      open onClose={onClose} title="Ofrecer jugador" onSubmit={handleSave} dirty={!!notes.trim()} historyKey="dist-add-neg"
      footer={<>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!playerId || !clubId} loading={saving}>{L.guardar}</Button>
      </>}
    >
      <div className="space-y-3">
        {fixedNeedPosition && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
            <span className="text-secondary text-amber-700">{L.solicitud}: <strong>{positionLabel(fixedNeedPosition)}</strong></span>
          </div>
        )}
        {!fixedPlayerId && (
          <Field label={L.jugador} required>
            <Select value={playerId} onChange={e => setPlayerId(e.target.value)}>
              <option value="">Seleccionar jugador…</option>
              {selectablePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        {!fixedClubId && (
          <Field label={L.club} required>
            {p => <ClubSearchSelect id={p.id} clubs={clubs} value={clubId} onChange={setClubId} />}
          </Field>
        )}
        <Field label={L.estado}>
          {() => <EstadoPicker value={status} onChange={setStatus} />}
        </Field>
        <Field label={L.encargado}>
          {() => <ManagerSelect value={aisManager || undefined} onChange={(v) => { setMgrTouched(true); setAisManager(v ?? '') }} profiles={profiles} className={MANAGER_CLS} placeholder={L.sinEncargado} />}
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="El club está interesado…" />
        </Field>
      </div>
    </Dialog>
  )
}

// ── CLUB SEARCH SELECT ────────────────────────────────────────
// Buscador con autocompletado para elegir club: escribir en vez de
// recorrer una lista de 1.400 clubes.
export function ClubSearchSelect({ clubs, value, onChange, id }: {
  clubs: Club[]
  value: string
  onChange: (clubId: string) => void
  id?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = clubs.find(c => c.id === value)

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return []
    const starts: Club[] = []
    const contains: Club[] = []
    for (const c of clubs) {
      const hay = norm(`${c.name} ${c.league ?? ''} ${c.country ?? ''}`)
      if (!hay.includes(q)) continue
      if (norm(c.name).startsWith(q)) starts.push(c)
      else contains.push(c)
      if (starts.length + contains.length >= 60) break
    }
    return [...starts, ...contains].slice(0, 30)
  }, [clubs, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 border border-slate-300 rounded-lg px-3 py-2 bg-slate-50">
        <div className="min-w-0">
          <div className="text-body font-medium text-slate-800 truncate">{selected.name}</div>
          {(selected.league || selected.country) && (
            <div className="text-meta text-slate-500 truncate">
              {[selected.league, selected.country].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <Button variant="link" size="sm" onClick={() => { onChange(''); setQuery(''); setOpen(false) }} aria-label="Cambiar club">
          Cambiar
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
      <Input
        id={id}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Escribe para buscar club…"
        autoComplete="off"
        className="pl-8"
      />
      {open && query.trim().length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="text-body text-slate-800">{c.name}</div>
              {(c.league || c.country) && (
                <div className="text-meta text-slate-500">{[c.league, c.country].filter(Boolean).join(' · ')}</div>
              )}
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-2 text-secondary text-slate-500 italic">Sin resultados para «{query}»</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── EDIT ENTRY MODAL ──────────────────────────────────────────

export function EditEntryModal({ entry, onClose, onSave }: {
  entry: DistributionEntry
  onClose: () => void
  onSave: (data: Partial<DistributionEntry>) => Promise<void>
}) {
  const [priority, setPriority] = useState(entry.priority)
  const [condition, setCondition] = useState(entry.condition ?? '')
  const [transferFee, setTransferFee] = useState(entry.transferFee ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [saving, setSaving] = useState(false)

  const dirty = priority !== entry.priority || condition !== (entry.condition ?? '') || transferFee !== (entry.transferFee ?? '') || notes !== (entry.notes ?? '')

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try { await onSave({ priority, condition: condition || undefined, transferFee: transferFee || undefined, notes: notes || undefined }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog
      open onClose={onClose} title="Editar distribución" onSubmit={handleSave} dirty={dirty} historyKey="dist-edit-entry"
      footer={<>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" loading={saving}>{L.guardar}</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label={L.prioridad}>
          {() => <PrioridadPicker value={priority} onChange={setPriority} />}
        </Field>
        <Field label="Condición">
          <Select value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="">Sin especificar</option>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
          <Field label="Importe">
            <Input value={transferFee} onChange={e => setTransferFee(e.target.value)} placeholder="400k, 2M…" />
          </Field>
        )}
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  )
}

// ── EDIT CLUB MODAL ───────────────────────────────────────────

export function EditClubModal({ club, leagueOptions = [], onClose, onSave, profiles }: {
  club: Club
  leagueOptions?: string[]
  onClose: () => void
  onSave: (data: Partial<Club>) => Promise<void>
  profiles: Profile[]
}) {
  const [name, setName] = useState(club.name)
  const [country, setCountry] = useState(club.country ?? '')
  const [league, setLeague] = useState(club.league ?? '')
  const [contactPerson, setContactPerson] = useState(club.contactPerson ?? '')
  const [aisManager, setAisManager] = useState(club.aisManager ?? '')
  const [notes, setNotes] = useState(club.notes ?? '')
  const [isPriority, setIsPriority] = useState(club.isPriority)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = name !== club.name || country !== (club.country ?? '') || league !== (club.league ?? '')
    || contactPerson !== (club.contactPerson ?? '') || aisManager !== (club.aisManager ?? '')
    || notes !== (club.notes ?? '') || isPriority !== club.isPriority

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    // Misma validación que AddClubModal: antes se podía dejar el nombre vacío.
    if (!isValidName(name)) {
      setError('Introduce un nombre válido (mínimo 2 caracteres).')
      return
    }
    setError('')
    setSaving(true)
    try { await onSave({ name: name.trim(), country, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog
      open onClose={onClose} title="Editar club" onSubmit={handleSave} dirty={dirty} historyKey="dist-edit-club"
      footer={<>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()} loading={saving}>{L.guardar}</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Nombre" required error={error || undefined}>
          <Input value={name} onChange={e => { setName(e.target.value); if (error) setError('') }} />
        </Field>
        <div className="flex gap-2">
          <Field label="País" className="flex-1">
            <Input value={country} onChange={e => setCountry(e.target.value)} />
          </Field>
          <Field label="Liga" className="flex-1">
            <Input
              value={league}
              onChange={e => setLeague(e.target.value)}
              list="edit-club-league-list"
              placeholder="Buscar liga…"
            />
          </Field>
          <datalist id="edit-club-league-list">
            {leagueOptions.map(l => <option key={l} value={l} />)}
          </datalist>
        </div>
        <div className="flex gap-2">
          <Field label="Contacto club" className="flex-1">
            <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
          </Field>
          <Field label={L.encargado} className="w-40 sm:w-44">
            {() => <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} className={MANAGER_CLS} placeholder={L.sinEncargado} />}
          </Field>
        </div>
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-body text-slate-700">Club prioritario</span>
        </label>
      </div>
    </Dialog>
  )
}

// ── EDIT NEGOTIATION MODAL ────────────────────────────────────

export function EditNegotiationModal({ neg, clubs, players, currentProfile, onClose, onSave, onSaveUpdate, onDelete, profiles }: {
  neg: ClubNegotiation
  clubs: Club[]
  players: Player[]
  currentProfile: Profile
  profiles: Profile[]
  onClose: () => void
  onSave: (data: Partial<ClubNegotiation>) => Promise<void>
  onSaveUpdate: (update: ClubNegotiationUpdate) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [status, setStatus] = useState(neg.status)
  const [aisManager, setAisManager] = useState(neg.aisManager ?? '')
  const [notes, setNotes] = useState(neg.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [savingUpdate, setSavingUpdate] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const updateRef = useRef<HTMLTextAreaElement>(null)
  const player = players.find(p => p.id === neg.playerId)
  const club = clubs.find(c => c.id === neg.clubId)
  const sortedUpdates = [...(neg.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  const dirty = status !== neg.status || aisManager !== (neg.aisManager ?? '') || notes !== (neg.notes ?? '') || !!updateText.trim()

  async function handleSave(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const data: Partial<ClubNegotiation> = { status, aisManager: aisManager || undefined, notes: notes || undefined }
      // No perder la nota de seguimiento en curso: se guarda junto con el resto.
      const pending = updateText.trim()
      if (pending) {
        data.updates = [...(neg.updates ?? []), {
          id: crypto.randomUUID(),
          text: pending,
          date: new Date().toISOString(),
          author: currentProfile.avatar,
        }]
      }
      await onSave(data)
    }
    finally { setSaving(false) }
  }

  async function handleAddUpdate() {
    if (!updateText.trim() || savingUpdate) return
    setSavingUpdate(true)
    try {
      await onSaveUpdate({
        id: crypto.randomUUID(),
        text: updateText.trim(),
        date: new Date().toISOString(),
        author: currentProfile.avatar,
      })
      setUpdateText('')
    } finally { setSavingUpdate(false) }
  }

  return (
    <>
    <Dialog
      open onClose={onClose} title="Editar negociación" onSubmit={handleSave} dirty={dirty} historyKey="dist-edit-neg"
      footer={<>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)} className="mr-auto">{L.eliminar}</Button>
        <Button onClick={onClose}>{L.cancelar}</Button>
        <Button type="submit" variant="primary" loading={saving}>{L.guardar}</Button>
      </>}
    >
      <div className="space-y-3">
        {player && club && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-3 text-body">
            <Avatar name={player.name} photo={player.photo} />
            <span className="font-medium">{player.name}</span>
            <span className="text-slate-400" aria-hidden="true">→</span>
            <Building2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span>{club.name}</span>
          </div>
        )}
        {neg.needPosition && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
            <span className="text-secondary text-amber-700">{L.solicitud}: <strong>{positionLabel(neg.needPosition)}</strong></span>
          </div>
        )}
        <Field label={L.estado}>
          {() => <EstadoPicker value={status} onChange={setStatus} />}
        </Field>
        <Field label={L.encargado}>
          {() => <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} className={MANAGER_CLS} placeholder={L.sinEncargado} />}
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </Field>

        {/* ── Notas de seguimiento ── */}
        <div className="border-t border-slate-100 pt-3">
          <div className="text-meta font-semibold text-slate-600 uppercase tracking-wider mb-2">Notas de seguimiento</div>
          {sortedUpdates.length > 0 && (
            <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
              {sortedUpdates.map(u => (
                <div key={u.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    {u.author && <span className="text-badge font-mono bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{u.author}</span>}
                    <span className="text-meta text-slate-500 ml-auto">
                      {new Date(u.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      {' '}
                      {new Date(u.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-body text-slate-700">{u.text}</p>
                </div>
              ))}
            </div>
          )}
          {sortedUpdates.length === 0 && (
            <p className="text-secondary text-slate-500 text-center py-2 mb-2">Sin notas aún</p>
          )}
          <Field label="Nueva nota de seguimiento" hint="Ctrl+Enter o ⌘+Enter guarda la nota sin cerrar">
            <Textarea
              ref={updateRef}
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              placeholder="Añadir nota de seguimiento…"
              rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); void handleAddUpdate() } }}
            />
          </Field>
          <Button
            size="sm"
            onClick={handleAddUpdate}
            disabled={!updateText.trim()}
            loading={savingUpdate}
            className="mt-1.5 w-full"
            title="Guarda esta nota ahora y deja el diálogo abierto para añadir más"
          >
            Añadir otra nota
          </Button>
          {updateText.trim() && (
            <p className="mt-1.5 text-meta text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              Esta nota se guardará al pulsar «{L.guardar}».
            </p>
          )}
        </div>
      </div>
    </Dialog>
    {/* Fuera del <form> del Dialog: los botones del ConfirmModal no llevan type="button" */}
    <ConfirmModal
      open={confirmingDelete}
      title="¿Eliminar esta negociación?"
      message="Esta acción no se puede deshacer."
      confirmLabel={L.eliminar}
      onConfirm={async () => {
        await onDelete()
        setConfirmingDelete(false)
      }}
      onCancel={() => setConfirmingDelete(false)}
    />
    </>
  )
}

// ── ADD NEED MODAL ────────────────────────────────────────────

export function AddNeedModal({ clubs, onClose, onSave }: {
  clubs: Club[]
  onClose: () => void
  onSave: (clubId: string, need: ClubNeed) => Promise<void>
}) {
  const [clubId, setClubId] = useState('')
  const [clubSearch, setClubSearch] = useState('')
  const [position, setPosition] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [transferBudget, setTransferBudget] = useState('')
  const [salaryBudget, setSalaryBudget] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedClub = clubs.find(c => c.id === clubId)

  const visibleClubs = useMemo(() => {
    if (!clubSearch) return clubs
    const q = clubSearch.toLowerCase()
    return clubs.filter(c => c.name.toLowerCase().includes(q) || c.league?.toLowerCase().includes(q))
  }, [clubs, clubSearch])

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!clubId || !position || saving) return
    setSaving(true)
    try {
      await onSave(clubId, {
        position,
        ageMax: ageMax ? Number(ageMax) : undefined,
        transferBudget: transferBudget || undefined,
        salaryBudget: salaryBudget || undefined,
        notes: notes || undefined,
      })
    } finally { setSaving(false) }
  }

  return (
    <Dialog
      open onClose={onClose} title="Añadir solicitud de club" onSubmit={handleSave} dirty={!!notes.trim()} historyKey="dist-add-need"
      footer={selectedClub ? <>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!position} loading={saving}>Añadir solicitud</Button>
      </> : undefined}
    >
      <div className="space-y-3">
        {!selectedClub ? (
          <div>
            <Field label={L.club} required>
              <Input
                autoFocus
                value={clubSearch}
                onChange={e => setClubSearch(e.target.value)}
                placeholder="Buscar club…"
                className="mb-2"
              />
            </Field>
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {visibleClubs.slice(0, 25).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClubId(c.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 text-left"
                >
                  <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-body font-medium text-slate-800 truncate">{c.name}</div>
                    {c.league && <div className="text-secondary text-slate-500">{c.league}</div>}
                  </div>
                </button>
              ))}
              {visibleClubs.length === 0 && (
                <div className="text-body text-slate-500 text-center py-4">Sin resultados</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="text-body font-medium text-slate-800 truncate">{selectedClub.name}</div>
                {selectedClub.league && <div className="text-secondary text-slate-500">{selectedClub.league}</div>}
              </div>
              <IconButton label="Quitar selección" onClick={() => setClubId('')}>
                <X />
              </IconButton>
            </div>

            <Field label="Posición" required>
              {() => (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Posición">
                  {POSITIONS.map(p => (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={position === p.code}
                      onClick={() => setPosition(p.code)}
                      title={p.es}
                      className={`px-3 min-h-9 sm:min-h-8 rounded-lg text-secondary font-medium border transition-colors ${
                        position === p.code
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400 hover:text-slate-800'
                      }`}
                    >
                      {positionLabel(p.code)}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Edad máx.">
                <Input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="23" />
              </Field>
              <Field label="Presupuesto traspaso">
                <Input value={transferBudget} onChange={e => setTransferBudget(e.target.value)} placeholder="500k, 2M…" />
              </Field>
            </div>

            <Field label="Salario / mes">
              <Input value={salaryBudget} onChange={e => setSalaryBudget(e.target.value)} placeholder="3k, 10k…" />
            </Field>

            <Field label="Notas">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
