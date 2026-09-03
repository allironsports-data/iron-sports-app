import React, { useState, useMemo, useEffect } from 'react'
import { Search, Star, Building2, X, Check, AlertCircle } from 'lucide-react'
import type { Player, Club, ClubNeed, DistributionEntry, ClubNegotiation, ClubNegotiationUpdate } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ManagerSelect } from '../../components/ManagerSelect'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { isValidName, isValidDate } from '../../lib/validate'
import { POSITIONS, positionLabel } from '../../lib/positions'
import { countryCode3 } from '../../lib/clubTiers'
import { norm } from '../../lib/texto'
import { BtnSpinner, Avatar } from './shared'
import { CONDITIONS, NEG_STATUSES, STATUS_CONFIG, PRIORITY_CONFIG } from './constantes'

// ── Modales de Distribución ───────────────────────────────────

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

  // Shared priority + condition fields (reused in both modes)
  const sharedFields = (
    <div className="space-y-3 pt-1">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Prioridad</label>
        <div className="flex gap-2">
          {(['A', 'B', 'C', 'D'] as const).map(p => {
            const cfg = PRIORITY_CONFIG[p]
            return (
              <button key={p} onClick={() => setPriority(p)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${priority === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-400 border-slate-200'}`}
              >{p}</button>
            )
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Condición de salida</label>
        <select value={condition} onChange={e => setCondition(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
          <option value="">Sin especificar</option>
          {CONDITIONS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
        <input value={transferFee} onChange={e => setTransferFee(e.target.value)}
          placeholder="Importe: 400k, 2M…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      )}
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
    </div>
  )

  return (
    <ModalShell title="Añadir jugador a distribución" onClose={onClose}>
      {/* Mode toggle */}
      {onCreatePlayer && (
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'existing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Cartera AIS
          </button>
          <button
            onClick={() => setMode('intermediar')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'intermediar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Solo intermediar
          </button>
        </div>
      )}

      {mode === 'existing' ? (
        /* ── Existing player flow ── */
        !selected ? (
          <div>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar jugador…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-2"
            />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {available.slice(0, 20).map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left">
                  <Avatar name={p.name} photo={p.photo} />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.positions[0]}</div>
                  </div>
                </button>
              ))}
              {available.length === 0 && <div className="text-sm text-slate-400 text-center py-4">Sin resultados</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
              <Avatar name={selected.name} photo={selected.photo} size="md" />
              <div>
                <div className="font-medium text-slate-800">{selected.name}</div>
                <div className="text-xs text-slate-500">{selected.positions[0]}</div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Quitar selección" className="ml-auto text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sharedFields}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
              {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Añadir a distribución'}
            </button>
          </div>
        )
      ) : (
        /* ── Nuevo jugador Solo Intermediar ── */
        <div className="space-y-3">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Este jugador aparecerá solo en Distribución. No tendrá ficha de mantenimiento (tareas, contrato, etc.).
          </p>
          <div>
            <input autoFocus value={newName} onChange={e => { setNewName(e.target.value); if (nameError) setNameError('') }}
              placeholder="Nombre completo *"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${nameError ? 'border-red-300' : 'border-slate-200'}`}
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>
          <select value={newPosition} onChange={e => setNewPosition(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-700">
            <option value="">Posición *</option>
            {POSITIONS.map(p => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
          </select>
          <div className="flex gap-2">
            <input value={newNationality} onChange={e => setNewNationality(e.target.value)}
              placeholder="Nacionalidad"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <div className="w-32">
              <input value={newBirthYear} onChange={e => { setNewBirthYear(e.target.value); if (yearError) setYearError('') }}
                placeholder="Año nacimiento"
                type="number" min="1985" max={new Date().getFullYear() - 16}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${yearError ? 'border-red-300' : 'border-slate-200'}`}
              />
              {yearError && <p className="text-xs text-red-600 mt-1">{yearError}</p>}
            </div>
          </div>
          <input value={newClub} onChange={e => setNewClub(e.target.value)}
            placeholder="Club actual (opcional)"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {sharedFields}
          <button
            onClick={handleCreateIntermediar}
            disabled={!newName || !newPosition || saving}
            className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Crear y añadir a distribución'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ── ADD CLUB MODAL ────────────────────────────────────────────

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

  async function handleSave() {
    if (!position) return
    setSaving(true)
    try {
      await onSave({ position, ageMax: Number.isFinite(parseInt(ageMax)) ? parseInt(ageMax) : undefined, transferBudget: transferBudget || undefined, salaryBudget: salaryBudget || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Posición *</label>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map(p => (
            <button key={p.code} type="button" onClick={() => setPosition(p.code)} title={p.es}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${position === p.code ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >{p.code}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Edad máx.</label>
          <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="23" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Traspaso</label>
          <input value={transferBudget} onChange={e => setTransferBudget(e.target.value)} placeholder="400k, 2M…" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Salario</label>
          <input value={salaryBudget} onChange={e => setSalaryBudget(e.target.value)} placeholder="60k/año…" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Notas</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto…" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
        <button onClick={handleSave} disabled={!position || saving} className="flex-1 py-1.5 text-sm bg-primary text-white rounded-lg disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── ADD CLUB MODAL ────────────────────────────────────────────

export function AddClubModal({ onClose, onSave, leagueOptions, profiles, currentProfileAvatar }: {
  onClose: () => void
  onSave: (data: Omit<Club, 'id' | 'createdAt'>) => Promise<void>
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

  async function handleSave() {
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

  return (
    <ModalShell title="Añadir club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre *</label>
          <input autoFocus value={name} onChange={e => { setName(e.target.value); if (error) setError('') }} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Deportivo, Racing…" className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${error ? 'border-red-300' : 'border-slate-200'}`} />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        {/* Liga — searchable dropdown */}
        <div className="relative">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input
            value={leagueSearch}
            onChange={e => { setLeagueSearch(e.target.value); setLeague(''); setLeagueOpen(true) }}
            onFocus={() => setLeagueOpen(true)}
            placeholder="Buscar liga…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {leagueOpen && (filteredLeagues.length > 0 || leagueSearch.trim() !== '') && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLeagueOpen(false)} />
              <div className="absolute z-50 mt-1 w-full max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                {filteredLeagues.slice(0, 60).map(l => (
                  <button
                    key={`${l.league}|${l.country}`}
                    type="button"
                    onClick={() => selectLeague(l)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{l.league}{l.country && <span className="text-slate-400 font-normal"> · {countryCode3(l.country)}</span>}</span>
                    {l.country && <span className="text-xs text-slate-400 flex-shrink-0">{l.country}</span>}
                  </button>
                ))}
                {leagueSearch.trim() !== '' && !leagueOptions.some(l => l.league.toLowerCase() === leagueSearch.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => { setLeague(leagueSearch.trim()); setLeagueOpen(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm text-blue-600 font-medium border-t border-slate-100"
                  >
                    + Crear liga «{leagueSearch.trim()}»
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">País</label>
          <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Spain, France…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Nombre del contacto" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-40 sm:w-44">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-slate-600">Club prioritario</span>
          <Star className="w-3.5 h-3.5 text-green-500" />
        </label>
        <button onClick={handleSave} disabled={!name.trim() || saving} className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Añadir club'}
        </button>
      </div>
    </ModalShell>
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
  // Gestor por defecto: encargado del club; si no hay, quien crea. Editable.
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

  async function handleSave() {
    if (!playerId || !clubId) return
    setSaving(true)
    try {
      await onSave({ playerId, clubId, needPosition: fixedNeedPosition, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir negociación" onClose={onClose}>
      <div className="space-y-3">
        {fixedNeedPosition && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs text-amber-700">Petición: <strong>{fixedNeedPosition}</strong></span>
          </div>
        )}
        {!fixedPlayerId && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Jugador *</label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Seleccionar jugador…</option>
              {selectablePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {!fixedClubId && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Club *</label>
            <ClubSearchSelect clubs={clubs} value={clubId} onChange={setClubId} />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
          <div className="flex flex-wrap gap-1.5">
            {NEG_STATUSES.map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${status === s ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500'}`}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <ManagerSelect value={aisManager || undefined} onChange={(v) => { setMgrTouched(true); setAisManager(v ?? '') }} profiles={profiles} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="El club está interesado…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <button onClick={handleSave} disabled={!playerId || !clubId || saving} className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── CLUB SEARCH SELECT ────────────────────────────────────────
// Buscador con autocompletado para elegir club: escribir en vez de
// recorrer una lista de 1.400 clubes.
export function ClubSearchSelect({ clubs, value, onChange }: {
  clubs: Club[]
  value: string
  onChange: (clubId: string) => void
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
      <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{selected.name}</div>
          {(selected.league || selected.country) && (
            <div className="text-[11px] text-slate-400 truncate">
              {[selected.league, selected.country].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button
          onClick={() => { onChange(''); setQuery(''); setOpen(false) }}
          aria-label="Cambiar club"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input
        value={query}
        autoFocus={false}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Escribe para buscar club…"
        className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {open && query.trim().length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => { onChange(c.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="text-sm text-slate-800">{c.name}</div>
              {(c.league || c.country) && (
                <div className="text-[11px] text-slate-400">{[c.league, c.country].filter(Boolean).join(' · ')}</div>
              )}
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400 italic">Sin resultados para «{query}»</div>
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

  async function handleSave() {
    setSaving(true)
    try { await onSave({ priority, condition: condition || undefined, transferFee: transferFee || undefined, notes: notes || undefined }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar distribución" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Prioridad</label>
          <div className="flex gap-2">
            {(['A', 'B', 'C', 'D'] as const).map(p => {
              const cfg = PRIORITY_CONFIG[p]
              return (
                <button key={p} onClick={() => setPriority(p)} className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${priority === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-400 border-slate-200'}`}>{p}</button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Condición</label>
          <select value={condition} onChange={e => setCondition(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            <option value="">Sin especificar</option>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Importe</label>
            <input value={transferFee} onChange={e => setTransferFee(e.target.value)} placeholder="400k, 2M…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </ModalShell>
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

  async function handleSave() {
    setSaving(true)
    try { await onSave({ name, country, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">País</label>
            <input value={country} onChange={e => setCountry(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
            <input
              value={league}
              onChange={e => setLeague(e.target.value)}
              list="edit-club-league-list"
              placeholder="Buscar liga…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <datalist id="edit-club-league-list">
              {leagueOptions.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-40 sm:w-44">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-slate-600">Club prioritario</span>
        </label>
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </ModalShell>
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
  const player = players.find(p => p.id === neg.playerId)
  const club = clubs.find(c => c.id === neg.clubId)
  const sortedUpdates = [...(neg.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  async function handleSave() {
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
    if (!updateText.trim()) return
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
    <ModalShell title="Editar negociación" onClose={onClose} escDisabled={confirmingDelete}>
      <div className="space-y-3">
        {player && club && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
            <Avatar name={player.name} photo={player.photo} />
            <span className="font-medium">{player.name}</span>
            <span className="text-slate-400">→</span>
            <Building2 className="w-4 h-4 text-slate-400" />
            <span>{club.name}</span>
          </div>
        )}
        {neg.needPosition && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs text-amber-700">Petición: <strong>{neg.needPosition}</strong></span>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
          <div className="flex flex-wrap gap-1.5">
            {NEG_STATUSES.map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${status === s ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500'}`}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>

        {/* ── Notas de seguimiento ── */}
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notas de seguimiento</div>
          {sortedUpdates.length > 0 && (
            <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
              {sortedUpdates.map(u => (
                <div key={u.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    {u.author && <span className="text-[11px] font-mono bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{u.author}</span>}
                    <span className="text-[11px] text-slate-400 ml-auto">
                      {new Date(u.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      {' '}
                      {new Date(u.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">{u.text}</p>
                </div>
              ))}
            </div>
          )}
          {sortedUpdates.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2 mb-2">Sin notas aún</p>
          )}
          <textarea
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            placeholder="Añadir nota de seguimiento…"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-200"
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleAddUpdate() } }}
          />
          <button
            onClick={handleAddUpdate}
            disabled={!updateText.trim() || savingUpdate}
            className="mt-1.5 w-full py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-200 transition-colors font-medium"
            title="Guarda esta nota ahora y deja el diálogo abierto para añadir más"
          >
            {savingUpdate ? 'Guardando…' : 'Añadir otra nota'}
          </button>
          {updateText.trim() && (
            <p className="mt-1.5 text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Esta nota se guardará al pulsar «Guardar».
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex-1 py-2 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50"
          >
            Eliminar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
            {saving
              ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span>
              : <span className="flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Guardar</span>}
          </button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()}>
        <ConfirmModal
          open={confirmingDelete}
          title="¿Eliminar esta negociación?"
          message="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await onDelete()
            setConfirmingDelete(false)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
    </ModalShell>
  )
}

// ── MODAL SHELL ───────────────────────────────────────────────

export function ModalShell({ title, onClose, children, escDisabled = false }: { title: string; onClose: () => void; children: React.ReactNode; escDisabled?: boolean }) {
  useEscapeKey(onClose, !escDisabled)
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl sm:rounded-t-2xl">
          <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 safe-area-bottom">{children}</div>
      </div>
    </div>
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

  async function handleSave() {
    if (!clubId || !position) return
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
    <ModalShell title="Añadir solicitud de club" onClose={onClose}>
      <div className="space-y-3">
        {!selectedClub ? (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Club *</label>
            <input
              autoFocus
              value={clubSearch}
              onChange={e => setClubSearch(e.target.value)}
              placeholder="Buscar club…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-2"
            />
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {visibleClubs.slice(0, 25).map(c => (
                <button
                  key={c.id}
                  onClick={() => setClubId(c.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 text-left"
                >
                  <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                    {c.league && <div className="text-xs text-slate-400">{c.league}</div>}
                  </div>
                </button>
              ))}
              {visibleClubs.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">Sin resultados</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{selectedClub.name}</div>
                {selectedClub.league && <div className="text-xs text-slate-400">{selectedClub.league}</div>}
              </div>
              <button onClick={() => setClubId('')} aria-label="Quitar selección" className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Posición *</label>
              <div className="flex flex-wrap gap-1.5">
                {POSITIONS.map(p => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPosition(p.code)}
                    title={p.es}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      position === p.code
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800'
                    }`}
                  >
                    {positionLabel(p.code)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Edad máx.</label>
                <input
                  type="number"
                  value={ageMax}
                  onChange={e => setAgeMax(e.target.value)}
                  placeholder="23"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Presup. traspaso</label>
                <input
                  value={transferBudget}
                  onChange={e => setTransferBudget(e.target.value)}
                  placeholder="500k, 2M…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Salario / mes</label>
              <input
                value={salaryBudget}
                onChange={e => setSalaryBudget(e.target.value)}
                placeholder="3k, 10k…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!position || saving}
              className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Añadir solicitud'}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  )
}
