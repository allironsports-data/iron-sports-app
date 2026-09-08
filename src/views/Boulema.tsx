import React, { useState, useMemo } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, Send,
  FileText, Pencil, Inbox, TrendingUp, Eye, Users,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, BoulemaPeticion, BoulemaPlayer } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useDebounce } from '../hooks/useDebounce'
import * as db from '../lib/db'

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info') => void

// ── Constantes (compartidas con Captación) ───────────────────

const POSITIONS_SCOUTING = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

const MONTHS_ES_FULL = [
  { v: '1', l: 'Enero' }, { v: '2', l: 'Febrero' }, { v: '3', l: 'Marzo' },
  { v: '4', l: 'Abril' }, { v: '5', l: 'Mayo' }, { v: '6', l: 'Junio' },
  { v: '7', l: 'Julio' }, { v: '8', l: 'Agosto' }, { v: '9', l: 'Septiembre' },
  { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' }, { v: '12', l: 'Diciembre' },
]

const BOULEMA_CONCLUSION_OPTIONS = [
  '', 'Firmar', 'Seguir', 'Descartar', 'Más video, prioritario', 'Más video, no prioritario',
] as const
type BoulemaConclusionOption = typeof BOULEMA_CONCLUSION_OPTIONS[number]

const BOULEMA_CONCLUSION_STYLE: Record<string, string> = {
  'Firmar':                  'bg-green-100 text-green-700 border border-green-200',
  'Seguir':                  'bg-blue-100 text-blue-700 border border-blue-200',
  'Descartar':               'bg-red-100 text-red-600 border border-red-200',
  'Más video, prioritario':  'bg-orange-100 text-orange-700 border border-orange-200',
  'Más video, no prioritario': 'bg-slate-100 text-slate-600 border border-slate-200',
}

// ── Helpers ─────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeDate(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  if (days < 30) return `hace ${Math.floor(days / 7)}sem`
  return ''
}

function personaToName(persona: string | undefined, profiles: Profile[]): string {
  if (!persona) return '—'
  const p = profiles.find(pr => pr.avatar === persona)
  return p ? p.name : persona
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

// ── Chips de filtros activos ─────────────────────────────────
type FilterChip = { key: string; label: string; onRemove: () => void }
function ActiveFilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(c => (
        <span key={c.key} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium">
          {c.label}
          <button onClick={c.onRemove} aria-label={`Quitar filtro ${c.label}`} className="p-0.5 rounded-full hover:bg-blue-100">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] text-slate-400 hover:text-slate-600 underline ml-1">
        Limpiar todo
      </button>
    </div>
  )
}

// ── AddBoulemaModal ───────────────────────────────────────────

function AddBoulemaModal({
  profiles,
  currentProfile,
  boulemaPeticiones,
  initial,
  onClose,
  onSave,
}: {
  profiles: Profile[]
  currentProfile: Profile
  boulemaPeticiones: BoulemaPeticion[]
  initial?: BoulemaPeticion
  onClose: () => void
  onSave: (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [playerName, setPlayerName] = useState(initial?.playerName ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [birthMonth, setBirthMonth] = useState(initial?.birthMonth ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [offeredBy, setOfferedBy] = useState(initial?.offeredBy ?? '')
  const [requestedFrom, setRequestedFrom] = useState<string[]>(
    initial?.requestedFrom.length ? initial.requestedFrom : [currentProfile.avatar]
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function toggleAssignee(avatar: string) {
    setRequestedFrom(prev =>
      prev.includes(avatar) ? prev.filter(a => a !== avatar) : [...prev, avatar]
    )
  }

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEscapeKey(onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerName.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        playerName: playerName.trim(),
        position: position.trim() || undefined,
        birthYear: birthYear.trim() || undefined,
        birthMonth: birthMonth.trim() || undefined,
        team: team.trim() || undefined,
        country: country.trim() || undefined,
        nationality: nationality.trim() || undefined,
        offeredBy: offeredBy.trim() || undefined,
        requestedFrom: requestedFrom.length ? requestedFrom : [currentProfile.avatar],
        notes: notes.trim() || undefined,
        requestedBy: currentProfile.avatar,
        reportIds: initial?.reportIds ?? [],
      })
    } catch {
      setError('Error al guardar la petición. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Send className="w-4 h-4 text-slate-400" />
            {initial ? 'Editar petición' : 'Añadir petición de informe'}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <FormRow label="Jugador *">
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Nombre del jugador"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              required
              autoFocus
            />
          </FormRow>

          <FormRow label="Posición">
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="">—</option>
              {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormRow>

          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Año nac.">
              <input
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                placeholder="2007"
                maxLength={4}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </FormRow>
            <FormRow label="Mes nac.">
              <select
                value={birthMonth}
                onChange={e => setBirthMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">—</option>
                {MONTHS_ES_FULL.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </FormRow>
          </div>

          <FormRow label="Equipo">
            <input
              value={team}
              onChange={e => setTeam(e.target.value)}
              placeholder="Club actual"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </FormRow>

          <div className="grid grid-cols-2 gap-2">
            <FormRow label="País (donde juega)">
              <input
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="Senegal"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </FormRow>
            <FormRow label="Nacionalidad">
              <input
                value={nationality}
                onChange={e => setNationality(e.target.value)}
                placeholder="Senegalesa"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </FormRow>
          </div>

          <FormRow label="Ofrecido por">
            <input
              value={offeredBy}
              onChange={e => setOfferedBy(e.target.value)}
              placeholder="Agente, intermediario..."
              list="offeredby-suggestions"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <datalist id="offeredby-suggestions">
              {boulemaPeticiones
                .map(p => p.offeredBy)
                .filter((v): v is string => !!v)
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .map(v => <option key={v} value={v} />)}
            </datalist>
          </FormRow>

          <FormRow label="Pedir informe a">
            <div className="flex flex-wrap gap-2 pt-0.5">
              {profiles.map(p => {
                const selected = requestedFrom.includes(p.avatar)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleAssignee(p.avatar)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-colors ${
                      selected
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="font-mono font-bold text-xs">{p.avatar}</span>
                    <span className="text-xs">{p.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
            {requestedFrom.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Selecciona al menos una persona</p>
            )}
          </FormRow>

          <FormRow label="Notas / contexto">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional sobre el jugador o contexto de la petición..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
            />
          </FormRow>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white -mx-5 -mb-5 px-5 pb-5 safe-area-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!playerName.trim() || saving}
              className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2"
            >
              {saving && <Spinner />}
              {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir petición'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── RespondWithInformeModal ───────────────────────────────────

function RespondWithInformeModal({
  peticion,
  profiles,
  currentProfile,
  scoutingPlayers,
  boulemaPeticiones,
  onClose,
  onAddPlayer,
  onAddReport,
  onLinkReport,
  showToast,
}: {
  peticion: BoulemaPeticion
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  onClose: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  onLinkReport: (peticionId: string, reportId: string) => Promise<void>
  showToast?: ShowToast
}) {
  // Try to find existing player by name match
  const existingPlayer = scoutingPlayers.find(
    p => p.fullName.toLowerCase().trim() === peticion.playerName.toLowerCase().trim()
  )

  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [conclusion, setConclusion] = useState<BoulemaConclusionOption>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEscapeKey(onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || saving) return
    // Verificar que la petición sigue existiendo (estado no obsoleto)
    if (!boulemaPeticiones.some(p => p.id === peticion.id)) {
      showToast?.('La petición ya no existe', 'error')
      onClose()
      return
    }
    setSaving(true)
    setError('')
    try {
      let playerId = existingPlayer?.id ?? ''

      if (!playerId) {
        // Create a new ScoutingPlayer with the peticion data
        const birthdate = peticion.birthYear
          ? `${peticion.birthYear}-${String(peticion.birthMonth ?? '01').padStart(2, '0')}-01`
          : undefined
        const newPlayer = await db.createScoutingPlayer({
          fullName: peticion.playerName,
          position1: peticion.position ?? undefined,
          birthdate,
          team: peticion.team ?? undefined,
        })
        playerId = newPlayer.id
        onAddPlayer(newPlayer)
      }

      const report = await db.createScoutingReport({
        playerId,
        fecha: new Date().toISOString().slice(0, 10),
        titulo: title.trim() || undefined,
        texto: text.trim(),
        conclusion: conclusion || undefined,
        persona: currentProfile.avatar,
      })
      onAddReport(report)
      // Link this report back to the petición
      await onLinkReport(peticion.id, report.id)
      showToast?.('Informe guardado')
      onClose()
    } catch {
      setError('Error al guardar el informe. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const authorName = personaToName(peticion.requestedBy, profiles)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Crear informe
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Context banner */}
        <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs">
          <div className="font-semibold text-blue-800 mb-0.5">
            {peticion.playerName}
            {peticion.position && <span className="font-normal text-blue-600 ml-1.5">· {peticion.position}</span>}
            {peticion.birthYear && <span className="font-normal text-blue-500 ml-1.5">{peticion.birthYear}</span>}
            {peticion.team && <span className="font-normal text-blue-500 ml-1.5 italic">{peticion.team}</span>}
          </div>
          <div className="text-blue-500">
            Pedido por <span className="font-mono font-semibold">{peticion.requestedBy}</span>
            {authorName && authorName !== peticion.requestedBy && ` · ${authorName.split(' ')[0]}`}
          </div>
          {existingPlayer ? (
            <div className="mt-1 text-[11px] text-blue-400">✓ Jugador encontrado en la base de datos</div>
          ) : (
            <div className="mt-1 text-[11px] text-blue-400">Se creará un nuevo jugador en captación</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <FormRow label="Título (opcional)">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título del informe"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </FormRow>

          <FormRow label="Informe *">
              {!text.trim() && (
                <button
                  type="button"
                  onClick={() => setText('FÍSICO:\n\nTÉCNICA:\n\nTÁCTICA:\n\nMENTALIDAD:\n\nCONTEXTO (equipo, rol, rival):\n\nCONCLUSIÓN:\n')}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  📋 Usar plantilla
                </button>
              )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Escribe aquí tu informe sobre el jugador..."
              rows={6}
              required
              autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-y"
            />
          </FormRow>

          <FormRow label="Conclusión">
            <select
              value={conclusion}
              onChange={e => setConclusion(e.target.value as BoulemaConclusionOption)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="">Sin conclusión</option>
              {BOULEMA_CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormRow>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white -mx-5 -mb-5 px-5 pb-5 safe-area-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!text.trim() || saving}
              className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2"
            >
              {saving && <Spinner />}
              {saving ? 'Guardando…' : 'Guardar informe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal de jugador de Boulema (mantenimiento light) ────────
function BoulemaPlayerModal({ profiles, initial, onClose, onSave, promote }: {
  profiles: Profile[]
  initial?: BoulemaPlayer
  onClose: () => void
  onSave: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  /** Pasar el jugador a Captación (solo en edición) */
  promote?: { exists: boolean; run: () => Promise<void> }
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [contacto, setContacto] = useState(initial?.contacto ?? '')
  const [manager, setManager] = useState(initial?.manager ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose)

  const canSave = fullName.trim().length >= 2 && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        fullName: fullName.trim(),
        birthYear: birthYear.trim() || undefined,
        position: position || undefined,
        team: team.trim() || undefined,
        country: country.trim() || undefined,
        nationality: nationality.trim() || undefined,
        contacto: contacto.trim() || undefined,
        manager: manager || undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const INPUT = 'w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{initial ? 'Editar jugador' : 'Añadir jugador de Boulema'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nombre *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre del jugador" autoFocus className={`mt-1 ${INPUT}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Año nac.</label>
              <input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2008" className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Posición</label>
              <select value={position} onChange={e => setPosition(e.target.value)} className={`mt-1 ${INPUT}`}>
                <option value="">—</option>
                {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Club</label>
              <input value={team} onChange={e => setTeam(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">País (donde juega)</label>
              <input value={country} onChange={e => setCountry(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nacionalidad</label>
              <input value={nationality} onChange={e => setNationality(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Encargado AIS</label>
              <select value={manager} onChange={e => setManager(e.target.value)} className={`mt-1 ${INPUT}`}>
                <option value="">—</option>
                {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name.split(' ')[0]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Contacto</label>
            <input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Teléfono, persona…" className={`mt-1 ${INPUT}`} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`mt-1 ${INPUT} resize-y`} />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          {promote && (
            promote.exists ? (
              <span className="text-[11px] text-green-600 font-medium">Ya en Captación ✓</span>
            ) : (
              <button
                onClick={() => void promote.run()}
                className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition-colors"
                title="Crea su ficha en Captación (scouting) con estos datos"
              >
                → Pasar a Captación
              </button>
            )
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
          <button onClick={() => void save()} disabled={!canSave} className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors">
            {saving ? 'Guardando…' : initial ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────

interface Props {
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  boulemaPeticiones: BoulemaPeticion[]
  onAddBoulemaPeticion: (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => Promise<void>
  onUpdateBoulemaPeticion: (p: BoulemaPeticion) => Promise<void>
  onDeleteBoulemaPeticion: (id: string) => Promise<void>
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  boulemaPlayers: BoulemaPlayer[]
  onAddBoulemaPlayer: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateBoulemaPlayer: (p: BoulemaPlayer) => Promise<void>
  onDeleteBoulemaPlayer: (id: string) => Promise<void>
  onGoToSection: (s: 'tareas' | 'distribucion' | 'captacion') => void
  onOpenScoutingPlayer: (id: string) => void
  onLogout: () => void
  onAdmin?: () => void
}

export function Boulema({
  profiles,
  currentProfile,
  scoutingPlayers,
  scoutingReports,
  boulemaPeticiones,
  onAddBoulemaPeticion,
  onUpdateBoulemaPeticion,
  onDeleteBoulemaPeticion,
  onAddPlayer,
  onAddReport,
  boulemaPlayers,
  onAddBoulemaPlayer,
  onUpdateBoulemaPlayer,
  onDeleteBoulemaPlayer,
  onGoToSection,
  onOpenScoutingPlayer,
  onLogout,
  onAdmin,
}: Props) {
  const { toasts, showToast, dismissToast } = useToast()
  // Antes se pintaban SIEMPRE las dos versiones de la lista (la tabla de
  // escritorio y la lista de móvil) y una se escondía con CSS. Ahora se
  // decide aquí y solo se construye la que se ve.
  const esAncha = useIsDesktop(640)

  // ── estado local ──
  // ── pestañas de la sección ──
  const [bouTab, setBouTab] = useState<'peticiones' | 'mantenimiento'>('peticiones')

  // ── mantenimiento light ──
  const [mantSearch, setMantSearch] = useState('')
  const [showAddMantPlayer, setShowAddMantPlayer] = useState(false)
  const [editingMantPlayer, setEditingMantPlayer] = useState<BoulemaPlayer | null>(null)
  const [confirmDeleteMantId, setConfirmDeleteMantId] = useState<string | null>(null)

  // (movido desde Captacion.tsx)
  const [showAddBoulema, setShowAddBoulema] = useState(false)
  const [editingPeticion, setEditingPeticion] = useState<BoulemaPeticion | null>(null)
  const [respondingPeticion, setRespondingPeticion] = useState<BoulemaPeticion | null>(null)
  const [confirmDeletePeticion, setConfirmDeletePeticion] = useState<string | null>(null)
  const [bouSearch, setBouSearch] = useState('')
  const bouSearchDeb = useDebounce(bouSearch)
  const [bouPosFilter, setBouPosFilter] = useState('all')
  const [bouYearFilter, setBouYearFilter] = useState('all')
  const [bouOfferedFilter, setBouOfferedFilter] = useState('all')
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set())

  // Índices para la lista de peticiones: antes cada tarjeta hacía varios `find`/`filter`
  // lineales sobre todos los informes y jugadores en cada render.
  const reportById = useMemo(() => new Map(scoutingReports.map(r => [r.id, r])), [scoutingReports])
  const playerByName = useMemo(
    () => new Map(scoutingPlayers.map(sp => [sp.fullName.trim().toLowerCase(), sp])),
    [scoutingPlayers]
  )
  const reportsByPlayer = useMemo(() => {
    const m = new Map<string, ScoutingReport[]>()
    for (const r of scoutingReports) {
      const l = m.get(r.playerId)
      if (l) l.push(r); else m.set(r.playerId, [r])
    }
    return m
  }, [scoutingReports])

  function toggleNotes(id: string) {
    setExpandedNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-3 h-12 sm:h-14">
          <img src={logoImg} alt="All Iron Sports" className="h-7 sm:h-8 w-auto rounded" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase hidden sm:block">All Iron Sports</span>
          <div className="flex-1" />
          {onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2 sm:py-1 rounded hover:bg-slate-100">Admin</button>
          )}
          <button onClick={onLogout} aria-label="Cerrar sesión" className="text-slate-400 hover:text-slate-700 p-2.5 sm:p-1.5 rounded hover:bg-slate-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Level 1: main sections */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
          <button
            onClick={() => onGoToSection('tareas')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            Mantenimiento
          </button>
          <button
            onClick={() => onGoToSection('distribucion')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Distribución
          </button>
          <button
            onClick={() => onGoToSection('captacion')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Captación
          </button>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
            <Inbox className="w-3.5 h-3.5" />
            Boulema
          </button>
        </div>

        {/* Sub-pestañas de Boulema */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          {([
            { id: 'peticiones' as const, label: 'Peticiones', icon: <Inbox className="w-3.5 h-3.5" /> },
            { id: 'mantenimiento' as const, label: 'Mantenimiento', icon: <Users className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setBouTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                bouTab === t.id ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === 'mantenimiento' && boulemaPlayers.length > 0 && (
                <span className={`min-w-[16px] text-center text-[10px] font-bold rounded-full px-1 ${bouTab === t.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {boulemaPlayers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {bouTab === 'peticiones' && (() => {

        // Derived filter values
        const bouAllYears = [...new Set(boulemaPeticiones.map(p => p.birthYear).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))
        const bouAllPositions = [...new Set(boulemaPeticiones.map(p => p.position).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))
        const bouAllOfferedBy = [...new Set(boulemaPeticiones.map(p => p.offeredBy).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))

        const filteredPeticiones = boulemaPeticiones
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .filter(p => {
            if (bouPosFilter !== 'all' && p.position !== bouPosFilter) return false
            if (bouYearFilter !== 'all' && p.birthYear !== bouYearFilter) return false
            if (bouOfferedFilter !== 'all' && p.offeredBy !== bouOfferedFilter) return false
            if (bouSearchDeb.trim()) {
              const q = bouSearchDeb.toLowerCase()
              if (
                !p.playerName.toLowerCase().includes(q) &&
                !(p.team?.toLowerCase().includes(q)) &&
                !(p.offeredBy?.toLowerCase().includes(q)) &&
                !(p.notes?.toLowerCase().includes(q))
              ) return false
            }
            return true
          })

        return (
          <div className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-6 py-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-slate-400" />
                <h2 className="text-base font-semibold text-slate-800">Boulema</h2>
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {filteredPeticiones.length}{filteredPeticiones.length !== boulemaPeticiones.length ? `/${boulemaPeticiones.length}` : ''}
                </span>
              </div>
              <button
                onClick={() => setShowAddBoulema(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Añadir petición</span>
              </button>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={bouSearch}
                  onChange={e => setBouSearch(e.target.value)}
                  placeholder="Buscar jugador, club, ofrecido por..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {bouSearch && (
                  <button onClick={() => setBouSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Position filter */}
              {bouAllPositions.length > 0 && (
                <select
                  value={bouPosFilter}
                  onChange={e => setBouPosFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="all">Posición</option>
                  {bouAllPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}

              {/* Year filter */}
              {bouAllYears.length > 0 && (
                <select
                  value={bouYearFilter}
                  onChange={e => setBouYearFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="all">Año nac.</option>
                  {bouAllYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}

              {/* Offered by filter */}
              {bouAllOfferedBy.length > 0 && (
                <select
                  value={bouOfferedFilter}
                  onChange={e => setBouOfferedFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="all">Ofrecido por</option>
                  {bouAllOfferedBy.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}

            </div>

            {/* Chips de filtros activos (boulema) */}
            {(() => {
              const chips: FilterChip[] = []
              if (bouSearch.trim()) chips.push({ key: 'search', label: `Búsqueda: "${bouSearch.trim()}"`, onRemove: () => setBouSearch('') })
              if (bouPosFilter !== 'all') chips.push({ key: 'pos', label: `Posición: ${bouPosFilter}`, onRemove: () => setBouPosFilter('all') })
              if (bouYearFilter !== 'all') chips.push({ key: 'year', label: `Año: ${bouYearFilter}`, onRemove: () => setBouYearFilter('all') })
              if (bouOfferedFilter !== 'all') chips.push({ key: 'offered', label: `Ofrecido por: ${bouOfferedFilter}`, onRemove: () => setBouOfferedFilter('all') })
              if (chips.length === 0) return null
              return (
                <ActiveFilterChips
                  chips={chips}
                  onClearAll={() => { setBouSearch(''); setBouPosFilter('all'); setBouYearFilter('all'); setBouOfferedFilter('all') }}
                />
              )
            })()}


            {/* Peticiones list */}
            <div className="space-y-2">
              {boulemaPeticiones.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                  <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">Sin peticiones de informe</p>
                  <p className="text-xs text-slate-300 mt-1">Añade una petición para pedir un informe sobre un jugador</p>
                </div>
              ) : filteredPeticiones.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Sin resultados con los filtros actuales</p>
              ) : (
                filteredPeticiones.map(p => {
                  const requesterProfile = profiles.find(pr => pr.avatar === p.requestedBy)
                  const rel = relativeDate(p.createdAt)
                  const isConfirming = confirmDeletePeticion === p.id
                  // Reports explicitly linked via reportIds
                  const explicitLinkedReports = p.reportIds
                    .map(id => reportById.get(id))
                    .filter((r): r is NonNullable<typeof r> => !!r)
                  // Auto-detect: find any report for the same player (by name) written by someone in requestedFrom
                  const matchingScoutPlayer = playerByName.get(p.playerName.trim().toLowerCase())
                  const autoDetectedReports = matchingScoutPlayer
                    ? (reportsByPlayer.get(matchingScoutPlayer.id) ?? []).filter(r =>
                        r.persona != null && p.requestedFrom.includes(r.persona) &&
                        !explicitLinkedReports.some(lr => lr.id === r.id)
                      )
                    : []
                  const linkedReports = [...explicitLinkedReports, ...autoDetectedReports]
                  const allDone = linkedReports.length > 0 && p.requestedFrom.every(
                    av => linkedReports.some(r => r.persona === av)
                  )
                  const monthLabel = p.birthMonth ? MONTHS_ES_FULL.find(m => m.v === p.birthMonth)?.l?.slice(0, 3) : undefined
                  const notesFirstLine = p.notes?.split('\n')[0] ?? ''
                  const notesHasMore = (p.notes?.split('\n').length ?? 0) > 1 || (p.notes?.length ?? 0) > notesFirstLine.length
                  const notesExpanded = expandedNoteIds.has(p.id)
                  const currentUserDone = linkedReports.some(r => r.persona === currentProfile.avatar)

                  return (
                    <div
                      key={p.id}
                      className={`bg-white border rounded-xl px-4 py-3 transition-colors ${allDone ? 'border-green-200 bg-green-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Player name + chips: NOMBRE / POSICIÓN / FECHA / CLUB / PAÍS / NACIONALIDAD */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-semibold text-slate-800 text-sm">{p.playerName}</span>
                            {p.position && (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.position}</span>
                            )}
                            {(p.birthYear || monthLabel) && (
                              <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                                {[monthLabel, p.birthYear].filter(Boolean).join('/')}
                              </span>
                            )}
                            {p.team && (
                              <span className="text-[11px] text-slate-500 italic">{p.team}</span>
                            )}
                            {p.country && (
                              <span className="text-[11px] text-slate-500 italic">{p.country}</span>
                            )}
                            {p.nationality && (
                              <span className="text-[11px] text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">{p.nationality}</span>
                            )}
                          </div>

                          {/* Offered by */}
                          {p.offeredBy && (
                            <div className="text-[11px] text-slate-500 mb-1">
                              <span className="text-slate-400">Ofrecido por</span>{' '}
                              <span className="font-medium text-slate-600">{p.offeredBy}</span>
                            </div>
                          )}

                          {/* Assignment — multi-destinatario */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                            <span className="text-slate-400">Pedido por</span>
                            <span className="font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.requestedBy}
                              {requesterProfile && (
                                <span className="font-sans font-normal ml-1 text-slate-400">· {requesterProfile.name.split(' ')[0]}</span>
                              )}
                            </span>
                            <span className="text-slate-400">→</span>
                            {p.requestedFrom.map(av => {
                              const pr = profiles.find(x => x.avatar === av)
                              const done = linkedReports.some(r => r.persona === av)
                              return (
                                <span key={av} className={`font-mono font-semibold px-1.5 py-0.5 rounded border text-[11px] ${
                                  done
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                }`}>
                                  {av}
                                  {pr && <span className="font-sans font-normal ml-1 opacity-70">· {pr.name.split(' ')[0]}</span>}
                                  {done && <span className="ml-1">✓</span>}
                                </span>
                              )
                            })}
                          </div>

                          {/* Notes — truncadas con "ver más" inline */}
                          {p.notes && (
                            <div className="mb-1.5 text-xs text-slate-500 leading-relaxed">
                              {notesExpanded ? (
                                <span className="whitespace-pre-wrap">{p.notes}{' '}
                                  <button onClick={() => toggleNotes(p.id)} className="text-blue-500 hover:text-blue-700 whitespace-nowrap">ver menos ▲</button>
                                </span>
                              ) : (
                                <span>
                                  {notesFirstLine}
                                  {notesHasMore && (
                                    <>{' '}<button onClick={() => toggleNotes(p.id)} className="text-blue-500 hover:text-blue-700 whitespace-nowrap">ver más ▼</button></>
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Informes acumulados + botón crear */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {linkedReports.map(report => {
                              const reportDate = report.createdAt
                                ? new Date(report.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                                : ''
                              return (
                                <div
                                  key={report.id}
                                  onClick={() => onOpenScoutingPlayer(report.playerId)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-700 border border-green-200 rounded-lg cursor-pointer hover:bg-green-200 transition-colors"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span className="font-mono font-bold">{report.persona ?? '?'}</span>
                                  {reportDate && <span className="text-green-600 opacity-80">{reportDate}</span>}
                                  {report.conclusion && (
                                    <span className={`ml-0.5 px-1.5 py-0.5 rounded text-[11px] ${BOULEMA_CONCLUSION_STYLE[report.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                                      {report.conclusion}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                            {!currentUserDone && (
                              <button
                                onClick={() => setRespondingPeticion(p)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                              >
                                <FileText className="w-3 h-3" />
                                Crear informe
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Right: date + actions */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {rel && (
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                              rel === 'hoy' ? 'bg-green-100 text-green-700' :
                              rel === 'ayer' ? 'bg-blue-50 text-blue-600' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {rel}
                            </span>
                          )}
                          <div className="text-[11px] text-slate-400">{fmtDate(p.createdAt)}</div>
                          <div className="flex items-center gap-1 mt-1">
                            {isConfirming ? (
                              <>
                                <button
                                  onClick={() => setConfirmDeletePeticion(null)}
                                  className="text-[11px] px-2 py-0.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await onDeleteBoulemaPeticion(p.id)
                                      setConfirmDeletePeticion(null)
                                      showToast('Petición eliminada')
                                    } catch {
                                      showToast('Error al eliminar la petición', 'error')
                                    }
                                  }}
                                  className="text-[11px] px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                                >
                                  Eliminar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingPeticion(p)}
                                  className="p-2 sm:p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                  title="Editar petición"
                                  aria-label="Editar petición"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmDeletePeticion(p.id)}
                                  className="p-2 sm:p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                  title="Eliminar petición"
                                  aria-label="Eliminar petición"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })()}

      {/* ── MANTENIMIENTO (light) ── */}
      {bouTab === 'mantenimiento' && (() => {
        const q = mantSearch.toLowerCase().trim()
        const filtered = boulemaPlayers.filter(p =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          (p.team?.toLowerCase().includes(q)) ||
          (p.country?.toLowerCase().includes(q))
        )
        return (
          <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-400" />
                <h2 className="text-base font-semibold text-slate-800">Mantenimiento</h2>
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{filtered.length}</span>
              </div>
              <button
                onClick={() => setShowAddMantPlayer(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Añadir jugador</span>
              </button>
            </div>

            {boulemaPlayers.length > 0 && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={mantSearch}
                  onChange={e => setMantSearch(e.target.value)}
                  placeholder="Buscar jugador, club, país..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            )}

            {boulemaPlayers.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">Aún no hay jugadores de Boulema</p>
                <p className="text-xs text-slate-300 mt-1">Versión light del mantenimiento: nombre, club, país, contacto y notas</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Sin resultados con la búsqueda</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Escritorio: tabla */}
                {esAncha && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Jugador', 'Año', 'Posición', 'Club', 'País', 'Enc.', 'Notas', ''].map((h, i) => (
                          <th key={i} className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map(p => (
                        <tr key={p.id} onClick={() => setEditingMantPlayer(p)} className="cursor-pointer hover:bg-slate-50/60 transition-colors">
                          <td className="px-3 py-2 font-medium text-slate-800">{p.fullName}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{p.birthYear ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.position ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.team ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.country ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-xs">{p.manager ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs max-w-[220px] truncate">{p.notes ?? ''}</td>
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            {confirmDeleteMantId === p.id ? (
                              <span className="flex items-center gap-1">
                                <button onClick={() => setConfirmDeleteMantId(null)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">No</button>
                                <button
                                  onClick={async () => {
                                    try { await onDeleteBoulemaPlayer(p.id); setConfirmDeleteMantId(null); showToast('Jugador eliminado') }
                                    catch { showToast('No se pudo eliminar', 'error') }
                                  }}
                                  className="text-[11px] px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                                >
                                  Sí
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteMantId(p.id)}
                                className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                aria-label="Eliminar jugador"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                {/* Móvil: lista */}
                {!esAncha && (
                <div className="divide-y divide-slate-100">
                  {filtered.map(p => (
                    <button key={p.id} onClick={() => setEditingMantPlayer(p)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{p.fullName}</span>
                        <span className="block text-[11px] text-slate-400 truncate">
                          {[p.team, p.birthYear, p.country].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      {p.manager && <span className="flex-shrink-0 text-[10px] font-mono font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{p.manager}</span>}
                    </button>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Modales de jugador de Boulema */}
      {showAddMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          onClose={() => setShowAddMantPlayer(false)}
          onSave={async (p) => {
            try { await onAddBoulemaPlayer(p); setShowAddMantPlayer(false); showToast('Jugador añadido') }
            catch { showToast('No se pudo crear (¿has ejecutado la migración SQL?)', 'error') }
          }}
        />
      )}
      {editingMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          initial={editingMantPlayer}
          promote={{
            exists: scoutingPlayers.some(sp => sp.fullName.toLowerCase().trim() === editingMantPlayer.fullName.toLowerCase().trim()),
            run: async () => {
              try {
                const saved = await db.createScoutingPlayer({
                  fullName: editingMantPlayer.fullName,
                  birthdate: editingMantPlayer.birthYear ? `${editingMantPlayer.birthYear}-02-28` : undefined,
                  position1: editingMantPlayer.position,
                  team: editingMantPlayer.team,
                  nationality: editingMantPlayer.nationality,
                  comentarios: editingMantPlayer.notes ? `Origen Boulema · ${editingMantPlayer.notes}` : 'Origen: Boulema',
                })
                onAddPlayer(saved)
                setEditingMantPlayer(null)
                showToast(`${editingMantPlayer.fullName} creado en Captación`)
              } catch {
                showToast('No se pudo crear en Captación', 'error')
              }
            },
          }}
          onClose={() => setEditingMantPlayer(null)}
          onSave={async (p) => {
            try { await onUpdateBoulemaPlayer({ ...editingMantPlayer, ...p }); setEditingMantPlayer(null); showToast('Jugador actualizado') }
            catch { showToast('No se pudo guardar', 'error') }
          }}
        />
      )}

      {/* AddBoulemaModal — nueva petición */}
      {showAddBoulema && (
        <AddBoulemaModal
          profiles={profiles}
          currentProfile={currentProfile}
          boulemaPeticiones={boulemaPeticiones}
          onClose={() => setShowAddBoulema(false)}
          onSave={async (peticion) => {
            await onAddBoulemaPeticion(peticion)
            setShowAddBoulema(false)
            showToast('Petición añadida')
          }}
        />
      )}

      {/* EditBoulemaModal — editar petición existente */}
      {editingPeticion && (
        <AddBoulemaModal
          profiles={profiles}
          currentProfile={currentProfile}
          boulemaPeticiones={boulemaPeticiones}
          initial={editingPeticion}
          onClose={() => setEditingPeticion(null)}
          onSave={async (updated) => {
            await onUpdateBoulemaPeticion({ ...editingPeticion, ...updated })
            setEditingPeticion(null)
            showToast('Petición actualizada')
          }}
        />
      )}

      {/* RespondWithInformeModal — crear informe desde petición */}
      {respondingPeticion && (
        <RespondWithInformeModal
          peticion={respondingPeticion}
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          boulemaPeticiones={boulemaPeticiones}
          showToast={showToast}
          onClose={() => setRespondingPeticion(null)}
          onAddPlayer={onAddPlayer}
          onAddReport={onAddReport}
          onLinkReport={async (peticionId, reportId) => {
            const peticion = boulemaPeticiones.find(x => x.id === peticionId)
            if (peticion) await onUpdateBoulemaPeticion({
              ...peticion,
              reportIds: [...peticion.reportIds.filter(id => id !== reportId), reportId],
            })
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
