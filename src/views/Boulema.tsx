import React, { useState } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, Send,
  FileText, Pencil, Inbox, TrendingUp, Eye,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, BoulemaPeticion } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
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
  onGoToSection,
  onOpenScoutingPlayer,
  onLogout,
  onAdmin,
}: Props) {
  const { toasts, showToast, dismissToast } = useToast()

  // ── estado local ──
  // (movido desde Captacion.tsx)
  const [showAddBoulema, setShowAddBoulema] = useState(false)
  const [editingPeticion, setEditingPeticion] = useState<BoulemaPeticion | null>(null)
  const [respondingPeticion, setRespondingPeticion] = useState<BoulemaPeticion | null>(null)
  const [confirmDeletePeticion, setConfirmDeletePeticion] = useState<string | null>(null)
  const [bouSearch, setBouSearch] = useState('')
  const [bouPosFilter, setBouPosFilter] = useState('all')
  const [bouYearFilter, setBouYearFilter] = useState('all')
  const [bouOfferedFilter, setBouOfferedFilter] = useState('all')
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set())
  function toggleNotes(id: string) {
    setExpandedNoteIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
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
      </header>

      {(() => {

        // Derived filter values
        const bouAllYears = [...new Set(boulemaPeticiones.map(p => p.birthYear).filter(Boolean) as string[])].sort()
        const bouAllPositions = [...new Set(boulemaPeticiones.map(p => p.position).filter(Boolean) as string[])].sort()
        const bouAllOfferedBy = [...new Set(boulemaPeticiones.map(p => p.offeredBy).filter(Boolean) as string[])].sort()

        const filteredPeticiones = boulemaPeticiones
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .filter(p => {
            if (bouPosFilter !== 'all' && p.position !== bouPosFilter) return false
            if (bouYearFilter !== 'all' && p.birthYear !== bouYearFilter) return false
            if (bouOfferedFilter !== 'all' && p.offeredBy !== bouOfferedFilter) return false
            if (bouSearch.trim()) {
              const q = bouSearch.toLowerCase()
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
                    .map(id => scoutingReports.find(r => r.id === id))
                    .filter((r): r is NonNullable<typeof r> => !!r)
                  // Auto-detect: find any report for the same player (by name) written by someone in requestedFrom
                  const matchingScoutPlayer = scoutingPlayers.find(
                    sp => sp.fullName.trim().toLowerCase() === p.playerName.trim().toLowerCase()
                  )
                  const autoDetectedReports = matchingScoutPlayer
                    ? scoutingReports.filter(r =>
                        r.playerId === matchingScoutPlayer.id &&
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
