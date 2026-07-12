import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, ChevronDown,
  FileText, Calendar, ChevronRight,
  TrendingUp, Eye, Maximize2, Minimize2, Pencil,
  BarChart2, ClipboardList, Users, Inbox, Send, Target,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, ScoutingMatchPlayer, BoulemaPeticion } from '../types'
import type { Profile } from '../contexts/AuthContext'
import * as db from '../lib/db'
import { ConfirmModal } from '../components/ConfirmModal'
import { ToastStack } from '../components/ToastStack'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useDebounce } from '../hooks/useDebounce'
import { isValidName } from '../lib/validate'

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info') => void

// ── Constants ────────────────────────────────────────────────

type CaptacionTab = 'jugadores' | 'conclusiones' | 'informes' | 'estadisticas' | 'partidos' | 'boulema'

const ASSESSMENT_CONFIG: Record<ScoutingAssessment, { label: string; bg: string; text: string; border: string }> = {
  Llamar:     { label: 'Llamar',     bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  Seguir:     { label: 'Seguir',     bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  Decidir:    { label: 'Decidir',    bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
  Basque:     { label: 'Basque',     bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
  Visto:      { label: 'Visto',      bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200' },
  Descartado: { label: 'Descartado', bg: 'bg-red-100',     text: 'text-red-600',     border: 'border-red-200' },
}

const ALL_ASSESSMENTS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir', 'Basque', 'Visto', 'Descartado']

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

const CONCLUSION_OPTIONS = ['', 'Seguir', 'Llamar', 'Firmar', 'Descartar'] as const
type ConclusionOption = typeof CONCLUSION_OPTIONS[number]

const CONCLUSION_STYLE: Record<string, string> = {
  Seguir:    'bg-blue-100 text-blue-700 border border-blue-200',
  Llamar:    'bg-amber-100 text-amber-700 border border-amber-200',
  Firmar:    'bg-green-100 text-green-700 border border-green-200',
  Descartar: 'bg-red-100 text-red-600 border border-red-200',
  // legado — por si hay registros antiguos con estos valores
  Decidir:   'bg-orange-100 text-orange-700 border border-orange-200',
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Competition options ──────────────────────────────────────

const COMPETITION_OPTIONS = [
  // Competiciones profesionales
  'Primera', 'Segunda', 'Primera RFEF', 'Segunda RFEF', 'Tercera RFEF', 'Tercera', 'Preferente',
  // Categorías base
  'Juvenil DH', 'Juvenil LN', 'Juvenil Pref', 'Juvenil Autonómico', 'Juvenil LC',
  'Cadete DH', 'Cadete Pref', 'Cadete Autonómico', 'Cadete', 'Infantil',
  'División Honor',
  // Internacionales / selecciones
  'Internacional', 'Selecciones', 'Youth League',
  'Euro U17', 'Euro U21', 'Mundial U20', 'Mundialito Juveniles',
  // Torneos
  'MIC', 'COTIF', 'Copa del Rey', 'Copa del Rey Juv', 'Amistoso', 'Pretemporada',
  // Ligas extranjeras
  'Ligue 1', 'Eredivisie', 'Serie A', 'Belgium 1', 'CESA',
]

// ── Helpers ─────────────────────────────────────────────────

function birthYearFromBirthdate(birthdate?: string): string {
  if (!birthdate) return '—'
  return birthdate.slice(0, 4)
}

function personaToName(persona: string | undefined, profiles: Profile[]): string {
  if (!persona) return ''
  const p = profiles.find(pr => pr.avatar === persona)
  return p ? p.name : persona
}

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

// ── Normalización de equipos (matching de sugerencias) ──────
// "Real Madrid Juv B" ↔ "Real Madrid Juvenil B" ↔ "real madrid"
const TEAM_NOISE_TOKENS = new Set([
  'cf', 'cd', 'ud', 'fc', 'sd', 'ad', 'ce', 'sad', 'club',
  'juv', 'juvenil', 'cadete', 'cad', 'inf', 'infantil', 'alevin',
  'a', 'b', 'c', 'equipo', 'filial',
])

function normTeamTokens(name: string): string[] {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0 && !TEAM_NOISE_TOKENS.has(t))
}

/** ¿Se refieren (probablemente) al mismo club? */
function teamsAlike(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const ta = normTeamTokens(a), tb = normTeamTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  const na = ta.join(' '), nb = tb.join(' ')
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  let hits = 0
  for (const t of ta) if (tb.includes(t)) hits++
  return hits / Math.max(ta.length, tb.length) >= 0.5
}

// ── Grupos de posición y slots del campograma ────────────────
type PosGroup = 'POR' | 'DEF' | 'MED' | 'EXT' | 'DEL'
const POS_GROUPS: PosGroup[] = ['POR', 'DEF', 'MED', 'EXT', 'DEL']

function normPos(pos?: string): string {
  return (pos ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function posGroupOf(pos?: string): PosGroup | null {
  const s = normPos(pos)
  if (!s) return null
  if (s.includes('portero') || s === 'por' || s === 'gk') return 'POR'
  if (s.includes('lateral') || s.includes('central') || s.includes('defensa') || s.includes('carrilero')) return 'DEF'
  if (s.includes('mediapunta') || s.includes('media punta') || s.includes('enganche')) return 'MED'
  if (s.includes('pivote') || s.includes('medio') || s.includes('interior') || s.includes('volante')) return 'MED'
  if (s.includes('extremo') || s.includes('banda')) return 'EXT'
  if (s.includes('delantero') || s.includes('punta') || s.includes('ariete') || s.includes('killer')) return 'DEL'
  return null
}

// Slots del campograma (x/y en % — portería propia abajo)
type PitchSlotId = 'POR' | 'LD' | 'CTD' | 'CT' | 'CTI' | 'LI' | 'PIV' | 'MC' | 'MP' | 'ED' | 'EI' | 'DEL'
const PITCH_SLOTS: { id: PitchSlotId; x: number; y: number }[] = [
  { id: 'POR', x: 50, y: 93 },
  { id: 'LD',  x: 84, y: 74 },
  { id: 'CTD', x: 66, y: 82 },
  { id: 'CT',  x: 50, y: 84 },
  { id: 'CTI', x: 34, y: 82 },
  { id: 'LI',  x: 16, y: 74 },
  { id: 'PIV', x: 50, y: 62 },
  { id: 'MC',  x: 32, y: 49 },
  { id: 'MP',  x: 60, y: 40 },
  { id: 'ED',  x: 85, y: 26 },
  { id: 'EI',  x: 15, y: 26 },
  { id: 'DEL', x: 50, y: 12 },
]

function pitchSlotOf(pos?: string): PitchSlotId | null {
  const s = normPos(pos)
  if (!s) return null
  if (s.includes('portero')) return 'POR'
  if (s.includes('lateral') && s.includes('der')) return 'LD'
  if (s.includes('lateral') && s.includes('izq')) return 'LI'
  if (s.includes('lateral') || s.includes('carrilero')) return 'LD'
  if (s.includes('central') && s.includes('der')) return 'CTD'
  if (s.includes('central') && s.includes('izq')) return 'CTI'
  if (s.includes('central') || s.includes('defensa')) return 'CT'
  if (s.includes('pivote')) return 'PIV'
  if (s.includes('mediapunta') || s.includes('media punta') || s.includes('enganche')) return 'MP'
  if (s.includes('mediocentro') || s.includes('medio') || s.includes('interior') || s.includes('volante')) return 'MC'
  if (s.includes('extremo') && s.includes('izq')) return 'EI'
  if (s.includes('extremo') || s.includes('banda')) return 'ED'
  if (s.includes('delantero') || s.includes('punta') || s.includes('ariete')) return 'DEL'
  return null
}

// ── Sub-components ───────────────────────────────────────────

function AssessmentChip({ a, small }: { a?: ScoutingAssessment; small?: boolean }) {
  if (!a) return <span className="text-slate-300 text-xs">—</span>
  const cfg = ASSESSMENT_CONFIG[a]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'text-[11px] px-1' : ''}`}>
      {cfg.label}
    </span>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-2">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-medium text-slate-700 mt-0.5 truncate">{value}</div>
    </div>
  )
}

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

// ── Chips de filtros activos ─────────────────────────────────
type FilterChip = { key: string; label: string; onRemove: () => void }
function ActiveFilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Filtros:</span>
      {chips.map(c => (
        <button
          key={c.key}
          onClick={c.onRemove}
          aria-label={`Quitar filtro ${c.label}`}
          className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/20 transition-colors"
        >
          {c.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 px-1.5 py-1.5 sm:py-0.5"
      >
        Limpiar filtros
      </button>
    </div>
  )
}

function StatBar({ label, value, max, color = 'bg-blue-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-24 flex-shrink-0 text-slate-600 truncate">{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right text-slate-500 font-medium">{value}</div>
    </div>
  )
}

// ── ReportCard ───────────────────────────────────────────────

function ReportCard({
  report,
  profiles,
  currentProfile,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onUpdate,
  playerName,
  matchLabel,
  showToast,
  onEditingChange,
}: {
  report: ScoutingReport
  profiles: Profile[]
  currentProfile: Profile
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => Promise<void>
  onUpdate?: (r: ScoutingReport) => Promise<void>
  playerName?: string
  matchLabel?: string   // e.g. "Real Madrid vs Barça · 12 Mar '25"
  showToast?: ShowToast
  onEditingChange?: (editing: boolean) => void
}) {
  const isConfirming = confirmDeleteId === report.id
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState(report.titulo ?? '')
  const [editText, setEditText] = useState(report.texto ?? '')
  const initialConclusion: ConclusionOption =
    (CONCLUSION_OPTIONS as readonly string[]).includes(report.conclusion ?? '') ? (report.conclusion ?? '') as ConclusionOption : ''
  const [editConclusion, setEditConclusion] = useState<ConclusionOption>(initialConclusion)
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const authorName = personaToName(report.persona, profiles)

  function setEditing(v: boolean) {
    setEditMode(v)
    onEditingChange?.(v)
  }

  // ¿Hay cambios sin guardar respecto al estado inicial?
  const isDirty =
    editTitle !== (report.titulo ?? '') ||
    editText !== (report.texto ?? '') ||
    editConclusion !== initialConclusion

  function discardEdit() {
    setEditTitle(report.titulo ?? '')
    setEditText(report.texto ?? '')
    setEditConclusion(initialConclusion)
    setConfirmDiscard(false)
    setEditing(false)
  }

  function requestCloseEdit() {
    if (isDirty) setConfirmDiscard(true)
    else discardEdit()
  }

  useEscapeKey(requestCloseEdit, editMode && !confirmDiscard)

  async function handleSaveEdit() {
    if (!onUpdate || !editText.trim() || saving) return
    setSaving(true)
    try {
      const updated: ScoutingReport = {
        ...report,
        titulo: editTitle.trim() || undefined,
        texto: editText.trim() || undefined,
        conclusion: editConclusion || undefined,
      }
      await onUpdate(updated)
      setEditing(false)
      showToast?.('Informe actualizado')
    } catch {
      showToast?.('Error al guardar el informe', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (editMode) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-2">
        <ConfirmModal
          open={confirmDiscard}
          title="¿Descartar cambios?"
          message="Has modificado el informe. Si cierras ahora se perderán los cambios."
          confirmLabel="Descartar"
          variant="danger"
          onConfirm={discardEdit}
          onCancel={() => setConfirmDiscard(false)}
        />
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Editando informe</span>
          <button onClick={requestCloseEdit} aria-label="Cerrar edición" className="text-slate-400 hover:text-slate-600 p-2 -m-2 sm:p-0 sm:m-0"><X className="w-3.5 h-3.5" /></button>
        </div>
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder="Título (opcional)"
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={5}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
        />
        <select
          value={editConclusion}
          onChange={e => setEditConclusion(e.target.value as ConclusionOption)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">Sin conclusión</option>
          {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {!editText.trim() && (
          <p className="text-[11px] text-red-500">El informe no puede estar vacío.</p>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={requestCloseEdit} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={saving || !editText.trim()}
            className="flex-1 py-1.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {saving && <Spinner />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {playerName && (
            <div className="text-[11px] font-semibold text-slate-800 mb-0.5">{playerName}</div>
          )}
          {report.titulo && (
            <div className="font-semibold text-slate-700 text-sm mb-0.5 truncate">{report.titulo}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(report.fecha)}
            </span>
            {report.persona && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-semibold" title={authorName}>
                {report.persona}
                {authorName && authorName !== report.persona && (
                  <span className="font-sans font-normal ml-1 text-slate-500">· {authorName}</span>
                )}
              </span>
            )}
            {report.conclusion && (
              <span className={`px-1.5 py-0.5 rounded font-medium text-[11px] ${CONCLUSION_STYLE[report.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                {report.conclusion}
              </span>
            )}
            {matchLabel && (
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-[11px] flex items-center gap-0.5">
                🏟 {matchLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onUpdate && (
            <button
              onClick={() => setEditing(true)}
              className="text-slate-300 hover:text-blue-500 p-2 sm:p-0.5 rounded"
              title="Editar informe"
              aria-label="Editar informe"
            >
              <Pencil className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            </button>
          )}
          {currentProfile.is_admin && (
            isConfirming ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(report.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded font-medium">Eliminar</button>
                <button onClick={() => onConfirmDelete(null)} className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600">No</button>
              </div>
            ) : (
              <button onClick={() => onConfirmDelete(report.id)} aria-label="Eliminar informe" className="text-slate-300 hover:text-red-500 p-2 sm:p-0.5 rounded">
                <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
            )
          )}
        </div>
      </div>
      {report.texto && (
        <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{report.texto}</p>
      )}
    </div>
  )
}

// ── Scout color palette (cycles through profiles deterministically) ──────────
const SCOUT_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800',  border: 'border-violet-200' },
  { bg: 'bg-emerald-100',text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-amber-100',  text: 'text-amber-800',   border: 'border-amber-200' },
  { bg: 'bg-rose-100',   text: 'text-rose-800',    border: 'border-rose-200' },
  { bg: 'bg-cyan-100',   text: 'text-cyan-800',    border: 'border-cyan-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800',  border: 'border-orange-200' },
]

// Returns a stable color for a given avatar string
function scoutColor(avatar: string) {
  let hash = 0
  for (let i = 0; i < avatar.length; i++) hash = avatar.charCodeAt(i) + ((hash << 5) - hash)
  return SCOUT_COLORS[Math.abs(hash) % SCOUT_COLORS.length]
}

// ── MatchRow ──────────────────────────────────────────────────

function MatchRow({
  match, scoutName, profiles, currentProfile, isAdmin,
  scoutingPlayers, linkedPlayerIds,
  scoutingReports, allMatches, matchPlayersByMatchId,
  onEdit, onDelete, onToggleStatus, onAssign,
  onAddMatchPlayer, onRemoveMatchPlayer,
  onAddReport, onOpenPlayer,
  showToast,
}: {
  match: ScoutingMatch
  scoutName: string
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  scoutingReports: ScoutingReport[]
  allMatches: ScoutingMatch[]
  matchPlayersByMatchId: Record<string, string[]>
  onEdit: (m: ScoutingMatch) => void
  onDelete: (id: string) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onAssign: (m: ScoutingMatch, assignedTo: string) => void
  onAddMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onAddReport: (r: ScoutingReport) => void
  onOpenPlayer?: (id: string) => void
  showToast?: ShowToast
}) {
  const [confirm, setConfirm] = useState(false)

  async function handleAddPlayer(playerId: string) {
    try {
      await onAddMatchPlayer(match.id, playerId)
    } catch {
      showToast?.('Error al vincular el jugador al partido', 'error')
    }
  }

  async function handleRemovePlayer(playerId: string) {
    try {
      await onRemoveMatchPlayer(match.id, playerId)
    } catch {
      showToast?.('Error al desvincular el jugador del partido', 'error')
    }
  }
  const [assignOpen, setAssignOpen] = useState(false)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')
  // Filtros de afinado de sugerencias
  const [suggYearFilter, setSuggYearFilter] = useState<string | null>(null)
  const [suggPosFilter, setSuggPosFilter] = useState<PosGroup | null>(null)
  // Informe rápido inline
  const [reportFormFor, setReportFormFor] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [quickConclusion, setQuickConclusion] = useState<ConclusionOption>('')
  const [savingQuick, setSavingQuick] = useState(false)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'
  const isPendingForMe = match.assignedTo === currentProfile.avatar && !isVisto

  const linkedPlayers = scoutingPlayers.filter(p => linkedPlayerIds.includes(p.id))

  // Informes de ESTE partido, por jugador
  const matchReportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    for (const r of scoutingReports) {
      if (r.matchId !== match.id) continue
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    return map
  }, [scoutingReports, match.id])
  const linkedWithReport = linkedPlayers.filter(p => (matchReportsByPlayer[p.id] ?? []).length > 0).length

  async function saveQuickReport() {
    if (!reportFormFor || !quickText.trim() || savingQuick) return
    setSavingQuick(true)
    try {
      const saved = await db.createScoutingReport({
        playerId: reportFormFor,
        fecha: new Date().toISOString(),
        texto: quickText.trim(),
        persona: currentProfile.avatar,
        conclusion: quickConclusion || undefined,
        matchId: match.id,
        authorId: currentProfile.id,
      })
      onAddReport(saved)
      setReportFormFor(null)
      setQuickText('')
      setQuickConclusion('')
      showToast?.('Informe guardado — visible en la ficha del jugador')
    } catch {
      showToast?.('Error al guardar el informe', 'error')
    } finally {
      setSavingQuick(false)
    }
  }

  // ── Sugerencias: matching normalizado + historial ──────────
  const suggestionPool = useMemo(() => {
    if (!playersOpen) return [] as { p: ScoutingPlayer; why: 'equipo' | 'historial' }[]
    // 1) Equipo en BD coincide (tokens normalizados, sin acentos/sufijos)
    const byTeam = new Map<string, 'equipo' | 'historial'>()
    for (const p of scoutingPlayers) {
      if (linkedPlayerIds.includes(p.id)) continue
      if (teamsAlike(p.team, match.homeTeam) || teamsAlike(p.team, match.awayTeam)) {
        byTeam.set(p.id, 'equipo')
      }
    }
    // 2) Historial: vinculados a partidos anteriores de estos mismos equipos
    for (const m2 of allMatches) {
      if (m2.id === match.id) continue
      const sameTeams =
        teamsAlike(m2.homeTeam, match.homeTeam) || teamsAlike(m2.homeTeam, match.awayTeam) ||
        teamsAlike(m2.awayTeam, match.homeTeam) || teamsAlike(m2.awayTeam, match.awayTeam)
      if (!sameTeams) continue
      for (const pid of (matchPlayersByMatchId[m2.id] ?? [])) {
        if (linkedPlayerIds.includes(pid) || byTeam.has(pid)) continue
        byTeam.set(pid, 'historial')
      }
    }
    return Array.from(byTeam.entries())
      .map(([id, why]) => ({ p: scoutingPlayers.find(sp => sp.id === id)!, why }))
      .filter(x => x.p)
  }, [playersOpen, scoutingPlayers, linkedPlayerIds, allMatches, matchPlayersByMatchId, match.id, match.homeTeam, match.awayTeam])

  // Opciones de afinado derivadas del pool
  const suggYears = useMemo(() =>
    Array.from(new Set(suggestionPool.map(x => x.p.birthdate?.slice(0, 4)).filter(Boolean) as string[]))
      .sort((a, b) => b.localeCompare(a)),
  [suggestionPool])
  const suggPosGroups = useMemo(() =>
    POS_GROUPS.filter(g => suggestionPool.some(x => posGroupOf(x.p.position1) === g || posGroupOf(x.p.position2) === g)),
  [suggestionPool])

  const teamSuggested = suggestionPool
    .filter(x => !suggYearFilter || x.p.birthdate?.slice(0, 4) === suggYearFilter)
    .filter(x => !suggPosFilter || posGroupOf(x.p.position1) === suggPosFilter || posGroupOf(x.p.position2) === suggPosFilter)
    .sort((a, b) => (a.why === b.why ? a.p.fullName.localeCompare(b.p.fullName) : a.why === 'equipo' ? -1 : 1))
    .slice(0, 16)

  const searchResults = playerSearch.length >= 2
    ? scoutingPlayers.filter(p =>
        !linkedPlayerIds.includes(p.id) &&
        p.fullName.toLowerCase().includes(playerSearch.toLowerCase())
      ).slice(0, 8).map(p => ({ p, why: 'equipo' as const }))
    : teamSuggested

  return (
    <>
      <tr className={`transition-colors ${isPendingForMe ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/60'}`}>
        {/* Fecha */}
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{day} {mon} '{yr}</td>
        {/* Local */}
        <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">{match.homeTeam}</td>
        {/* vs */}
        <td className="px-2 py-2 text-[11px] font-bold text-slate-400 text-center">vs</td>
        {/* Visitante */}
        <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">{match.awayTeam}</td>
        {/* Competición */}
        <td className="px-3 py-2">
          {match.competition && (
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap">{match.competition}</span>
          )}
        </td>
        {/* Modo */}
        <td className="px-3 py-2 text-xs whitespace-nowrap">
          {match.viewMode === 'campo'
            ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] font-medium">🏟️ Campo</span>
            : <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[11px] font-medium">📹 Vídeo</span>
          }
        </td>
        {/* Scout */}
        <td className="px-3 py-2 text-xs whitespace-nowrap">
          {assignOpen ? (
            <select autoFocus
              className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              defaultValue={match.assignedTo ?? ''}
              onBlur={() => setAssignOpen(false)}
              onChange={e => { onAssign(match, e.target.value); setAssignOpen(false) }}
            >
              <option value="">Sin asignar</option>
              {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
            </select>
          ) : (
            <button onClick={() => setAssignOpen(true)} className="text-left hover:opacity-80 transition-opacity" title="Clic para reasignar">
              {match.assignedTo ? (() => {
                const c = scoutColor(match.assignedTo)
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
                    <span className="font-mono">{match.assignedTo}</span>
                    {scoutName && scoutName !== match.assignedTo && <span className="font-normal opacity-70">({scoutName})</span>}
                  </span>
                )
              })() : <span className="text-slate-300 text-xs">— asignar</span>}
            </button>
          )}
        </td>
        {/* Jugadores vinculados + estado de informes */}
        <td className="px-3 py-2">
          <button
            onClick={() => { setPlayersOpen(o => !o); setPlayerSearch('') }}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap ${
              linkedPlayers.length === 0
                ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                : linkedWithReport < linkedPlayers.length
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
            }`}
            title={linkedPlayers.length > 0
              ? `${linkedWithReport} de ${linkedPlayers.length} jugadores con informe de este partido`
              : 'Ver / añadir jugadores vistos en este partido'}
          >
            👤 {linkedPlayers.length > 0 ? `${linkedWithReport}/${linkedPlayers.length}` : '+'}
          </button>
        </td>
        {/* Notas */}
        <td className="px-3 py-2 text-xs text-slate-500 max-w-[160px] truncate" title={match.notes ?? ''}>{match.notes ?? '—'}</td>
        {/* Visto */}
        <td className="px-3 py-2 text-center">
          <button onClick={() => onToggleStatus(match)}
            title={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
            aria-label={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
              isVisto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2.5,8 6,11.5 13.5,4" />
            </svg>
          </button>
        </td>
        {/* Acciones */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => onEdit(match)} className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="Editar" aria-label="Editar partido">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (confirm
              ? <div className="flex items-center gap-1">
                  <button onClick={() => { onDelete(match.id); setConfirm(false) }} className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded font-medium">Sí</button>
                  <button onClick={() => setConfirm(false)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600">No</button>
                </div>
              : <button onClick={() => setConfirm(true)} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Eliminar" aria-label="Eliminar partido"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </td>
      </tr>

      {/* ── Fila expandida: jugadores vinculados + informes rápidos ── */}
      {playersOpen && (
        <tr className="bg-violet-50/40">
          <td colSpan={11} className="px-4 py-3">
            {/* Jugadores vinculados, con estado de informe y formulario inline */}
            {linkedPlayers.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <span className="text-[11px] font-semibold text-violet-600 uppercase tracking-wide">
                  Vistos en este partido · {linkedPlayers.length} jugador{linkedPlayers.length !== 1 ? 'es' : ''} · {linkedWithReport} con informe
                </span>
                {linkedPlayers.map(p => {
                  const pReports = matchReportsByPlayer[p.id] ?? []
                  const isFormOpen = reportFormFor === p.id
                  return (
                    <div key={p.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onOpenPlayer?.(p.id)}
                          className="text-xs font-semibold text-slate-800 hover:text-primary transition-colors"
                          title="Abrir ficha del jugador"
                        >
                          {p.fullName}
                        </button>
                        <span className="text-[11px] text-slate-400">
                          {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                        </span>
                        <AssessmentChip a={p.assessment} small />
                        <span className="flex-1" />
                        {pReports.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            ✓ Informe{pReports.length > 1 ? `s (${pReports.length})` : ''} · {pReports[0].persona ?? '—'}
                            {pReports[0].conclusion && (
                              <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${CONCLUSION_STYLE[pReports[0].conclusion] ?? 'bg-slate-100 text-slate-500'}`}>
                                {pReports[0].conclusion}
                              </span>
                            )}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setReportFormFor(isFormOpen ? null : p.id)
                              setQuickText('')
                              setQuickConclusion('')
                            }}
                            className="text-[11px] font-bold border border-primary text-primary bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            {isFormOpen ? 'Cancelar' : '+ Informe'}
                          </button>
                        )}
                        <button onClick={() => handleRemovePlayer(p.id)} aria-label={`Desvincular a ${p.fullName}`} className="text-slate-300 hover:text-red-500 p-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Mini-formulario de informe rápido */}
                      {isFormOpen && (
                        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                          <textarea
                            value={quickText}
                            onChange={e => setQuickText(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder={`Informe corto de ${p.fullName.split(' ')[0]} en este partido…`}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                            onKeyDown={e => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveQuickReport() }
                            }}
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 font-medium">Conclusión:</span>
                            {CONCLUSION_OPTIONS.filter(Boolean).map(c => (
                              <button
                                key={c}
                                onClick={() => setQuickConclusion(quickConclusion === c ? '' : c)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                                  quickConclusion === c
                                    ? (CONCLUSION_STYLE[c] ?? 'bg-slate-200 text-slate-700')
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">Se vincula a este partido y aparece en la ficha del jugador · ⌘+Enter</span>
                            <button
                              onClick={saveQuickReport}
                              disabled={!quickText.trim() || savingQuick}
                              className="px-3 py-1.5 text-[11px] font-bold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 inline-flex items-center gap-1.5"
                            >
                              {savingQuick && <Spinner />}
                              {savingQuick ? 'Guardando…' : 'Guardar informe'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Buscar / sugerencias con afinado */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-shrink-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <input
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Buscar jugador..."
                    className="pl-6 pr-3 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 w-48"
                  />
                </div>
                {/* Afinado: año y posición */}
                {playerSearch.length < 2 && suggestionPool.length > 0 && (suggYears.length > 1 || suggPosGroups.length > 1) && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Afinar:</span>
                    {suggYears.slice(0, 6).map(y => (
                      <button
                        key={y}
                        onClick={() => setSuggYearFilter(f => f === y ? null : y)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                          suggYearFilter === y ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                    {suggPosGroups.length > 1 && <span className="text-slate-200">|</span>}
                    {suggPosGroups.map(g => (
                      <button
                        key={g}
                        onClick={() => setSuggPosFilter(f => f === g ? null : g)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                          suggPosFilter === g ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                {searchResults.length > 0 ? (
                  <div className="flex flex-wrap gap-1 items-center">
                    {playerSearch.length < 2 && teamSuggested.length > 0 && (
                      <span className="text-[11px] text-violet-500 font-semibold uppercase tracking-wide mr-1">
                        Sugeridos:
                      </span>
                    )}
                    {searchResults.map(({ p, why }) => (
                      <button
                        key={p.id}
                        onClick={() => { handleAddPlayer(p.id); setPlayerSearch('') }}
                        className="text-xs bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />{p.fullName}
                        <span className="text-violet-400 text-[11px]">
                          {[p.birthdate ? `'${p.birthdate.slice(2, 4)}` : null, p.team].filter(Boolean).join(' · ')}
                          {why === 'historial' ? ' · visto antes con este equipo' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : playerSearch.length >= 2 ? (
                  <span className="text-xs text-slate-400 italic">Sin resultados</span>
                ) : suggestionPool.length === 0 && linkedPlayers.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">Busca un jugador para vincular</span>
                ) : teamSuggested.length === 0 && suggestionPool.length > 0 ? (
                  <span className="text-xs text-slate-400 italic">Ningún sugerido con esos filtros — <button className="underline" onClick={() => { setSuggYearFilter(null); setSuggPosFilter(null) }}>quitar afinado</button></span>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── ConclusionesTab ──────────────────────────────────────────
// Punto de conclusiones: candidatos a Llamar, mapa por generación ×
// posición/categoría (matriz o campograma) y movimientos recientes.

const MAP_ASSESSMENTS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir']

function ConclusionesTab({ players, reports, onSetAssessment, onOpenPlayer }: {
  players: ScoutingPlayer[]
  reports: ScoutingReport[]
  onSetAssessment: (p: ScoutingPlayer, a: ScoutingAssessment) => Promise<void>
  onOpenPlayer: (id: string) => void
}) {
  const [threshold, setThreshold] = useState<number>(() => {
    const v = parseInt(sessionStorage.getItem('capt_concl_threshold') ?? '3')
    return [2, 3, 4].includes(v) ? v : 3
  })
  useEffect(() => { sessionStorage.setItem('capt_concl_threshold', String(threshold)) }, [threshold])
  const [mapAssessment, setMapAssessment] = useState<ScoutingAssessment>('Llamar')
  const [mapView, setMapView] = useState<'matriz' | 'campo'>('matriz')
  const [mapDim, setMapDim] = useState<'pos' | 'cat'>('pos')
  const [selectedCell, setSelectedCell] = useState<{ row: string; col: string } | null>(null)
  const [genFilter, setGenFilter] = useState<string>('all')
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [showStale, setShowStale] = useState(false)

  // Informes por jugador (desc por fecha)
  const reportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    for (const r of reports) {
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
    }
    return map
  }, [reports])

  // ── a) Candidatos a Llamar ──────────────────────────────────
  // Cuenta solo los informes: cualquier jugador con N+ informes «Llamar»
  // aparece aquí, independientemente de su etiqueta actual.
  const candidates = useMemo(() => {
    return players
      .map(p => {
        const rs = reportsByPlayer[p.id] ?? []
        const llamar = rs.filter(r => r.conclusion === 'Llamar')
        if (llamar.length < threshold) return null
        const byConclusion: Record<string, number> = {}
        rs.forEach(r => { if (r.conclusion) byConclusion[r.conclusion] = (byConclusion[r.conclusion] ?? 0) + 1 })
        return {
          p,
          llamarCount: llamar.length,
          byConclusion,
          lastReport: rs[0],
          lastLlamarDate: llamar[0]?.fecha ?? llamar[0]?.createdAt,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.lastLlamarDate ?? '').localeCompare(a!.lastLlamarDate ?? '')) as {
        p: ScoutingPlayer; llamarCount: number; byConclusion: Record<string, number>
        lastReport?: ScoutingReport; lastLlamarDate?: string
      }[]
  }, [players, reportsByPlayer, threshold])

  // ── b) Mapa ─────────────────────────────────────────────────
  const mapPlayers = useMemo(
    () => players.filter(p => p.assessment === mapAssessment),
    [players, mapAssessment]
  )
  const genRows = useMemo(() => {
    const gens = new Set<string>()
    mapPlayers.forEach(p => gens.add(p.birthdate ? p.birthdate.slice(0, 4) : '—'))
    return Array.from(gens).sort((a, b) => b.localeCompare(a))
  }, [mapPlayers])

  const catCols = useMemo(() => {
    const counts: Record<string, number> = {}
    mapPlayers.forEach(p => { const c = p.categoria ?? 'Sin categoría'; counts[c] = (counts[c] ?? 0) + 1 })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
    return top
  }, [mapPlayers])

  const cols: string[] = mapDim === 'pos' ? POS_GROUPS : catCols

  function colOf(p: ScoutingPlayer): string | null {
    if (mapDim === 'pos') return posGroupOf(p.position1) ?? posGroupOf(p.position2)
    const c = p.categoria ?? 'Sin categoría'
    return catCols.includes(c) ? c : null
  }

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, ScoutingPlayer[]>> = {}
    genRows.forEach(g => { m[g] = {}; cols.forEach(c => { m[g][c] = [] }) })
    mapPlayers.forEach(p => {
      const g = p.birthdate ? p.birthdate.slice(0, 4) : '—'
      const c = colOf(p)
      if (c && m[g]) m[g][c].push(p)
    })
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPlayers, genRows, cols, mapDim])

  const maxCell = useMemo(() => {
    let mx = 1
    genRows.forEach(g => cols.forEach(c => { mx = Math.max(mx, matrix[g]?.[c]?.length ?? 0) }))
    return mx
  }, [matrix, genRows, cols])

  const cellPlayers = selectedCell ? (matrix[selectedCell.row]?.[selectedCell.col] ?? []) : []

  // Campograma
  const pitchGens = useMemo(() => {
    const gens = new Set<string>()
    mapPlayers.forEach(p => { if (p.birthdate) gens.add(p.birthdate.slice(0, 4)) })
    return Array.from(gens).sort((a, b) => b.localeCompare(a))
  }, [mapPlayers])

  const pitchBySlot = useMemo(() => {
    const map: Record<string, ScoutingPlayer[]> = {}
    let unmapped = 0
    mapPlayers
      .filter(p => genFilter === 'all' || p.birthdate?.slice(0, 4) === genFilter)
      .forEach(p => {
        const slot = pitchSlotOf(p.position1) ?? pitchSlotOf(p.position2)
        if (!slot) { unmapped++; return }
        if (!map[slot]) map[slot] = []
        map[slot].push(p)
      })
    return { map, unmapped }
  }, [mapPlayers, genFilter])

  // ── c) Movimientos ──────────────────────────────────────────
  const nowMs = Date.now()
  const D21 = 21 * 86400000
  const D42 = 42 * 86400000
  const movements = useMemo(() => {
    type Mov = { date: string; node: React.ReactNode }
    const items: Mov[] = []
    players.forEach(p => {
      if (!p.assessment || !p.assessmentUpdatedAt) return
      if (nowMs - Date.parse(p.assessmentUpdatedAt) > D21) return
      items.push({
        date: p.assessmentUpdatedAt,
        node: (
          <span>
            <button onClick={() => onOpenPlayer(p.id)} className="font-semibold text-slate-800 hover:text-primary">{p.fullName}</button>
            {' '}marcado en <AssessmentChip a={p.assessment} small />
          </span>
        ),
      })
    })
    reports.forEach(r => {
      if (r.conclusion !== 'Llamar' && r.conclusion !== 'Firmar') return
      const d = r.fecha ?? r.createdAt
      if (nowMs - Date.parse(d) > D21) return
      const p = players.find(pl => pl.id === r.playerId)
      if (!p) return
      const nth = (reportsByPlayer[p.id] ?? []).filter(x =>
        x.conclusion === r.conclusion && (x.fecha ?? x.createdAt) <= d
      ).length
      items.push({
        date: d,
        node: (
          <span>
            Informe de <span className="font-mono font-semibold">{r.persona ?? '—'}</span> sobre{' '}
            <button onClick={() => onOpenPlayer(p.id)} className="font-semibold text-slate-800 hover:text-primary">{p.fullName}</button>
            {' '}concluye <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${CONCLUSION_STYLE[r.conclusion!] ?? ''}`}>{r.conclusion}</span>
            {nth > 1 && <span className="text-slate-400 text-[11px]"> ({nth}º en {r.conclusion})</span>}
          </span>
        ),
      })
    })
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, reports, reportsByPlayer])

  const staleDecidir = useMemo(() =>
    players.filter(p => {
      if (p.assessment !== 'Decidir') return false
      const last = reportsByPlayer[p.id]?.[0]
      return !last || nowMs - Date.parse(last.fecha ?? last.createdAt) > D42
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [players, reportsByPlayer])

  const [savingId, setSavingId] = useState<string | null>(null)
  async function setAssessment(p: ScoutingPlayer, a: ScoutingAssessment) {
    setSavingId(p.id)
    try { await onSetAssessment(p, a) } finally { setSavingId(null) }
  }

  const segBtn = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${active ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="space-y-4">
      {/* ── a) Candidatos a Llamar ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">🔔 Candidatos a Llamar</h3>
          <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-semibold">{candidates.length}</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">jugadores con {threshold}+ informes «Llamar», sea cual sea su etiqueta</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Umbral</span>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => setThreshold(n)} className={segBtn(threshold === n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        {candidates.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-5">
            Ningún jugador acumula {threshold}+ informes con conclusión «Llamar».
          </p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map(({ p, llamarCount, byConclusion, lastReport }) => (
              <div key={p.id} className="border border-amber-200 rounded-xl p-3 bg-gradient-to-b from-amber-50/70 to-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button onClick={() => onOpenPlayer(p.id)} className="text-sm font-bold text-slate-900 hover:text-primary text-left leading-tight">
                      {p.fullName}
                    </button>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1"><AssessmentChip a={p.assessment} small /></div>
                  </div>
                  <span className="text-[10px] font-extrabold bg-amber-500 text-white rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                    {llamarCount}× Llamar
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(byConclusion).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                    <span key={c} className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${CONCLUSION_STYLE[c] ?? 'bg-slate-100 text-slate-500'}`}>
                      {n}× {c}
                    </span>
                  ))}
                </div>
                {lastReport?.texto && (
                  <div className="mt-2 text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg px-2.5 py-2 leading-relaxed italic">
                    “{lastReport.texto.length > 130 ? lastReport.texto.slice(0, 130) + '…' : lastReport.texto}”
                    <div className="not-italic text-[10px] text-slate-400 mt-1">
                      {lastReport.persona ?? '—'} · {fmtDate(lastReport.fecha ?? lastReport.createdAt)} · último informe
                    </div>
                  </div>
                )}
                <div className="flex gap-1.5 mt-2.5">
                  {p.assessment === 'Llamar' ? (
                    <span className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-600 text-center">
                      ✓ Ya en Llamar
                    </span>
                  ) : (
                    <button
                      onClick={() => setAssessment(p, 'Llamar')}
                      disabled={savingId === p.id}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-amber-100 border border-amber-200 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                    >
                      {savingId === p.id ? '…' : '☎ Marcar Llamar'}
                    </button>
                  )}
                  <button
                    onClick={() => setAssessment(p, 'Seguir')}
                    disabled={savingId === p.id}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Seguir
                  </button>
                  <button
                    onClick={() => setAssessment(p, 'Descartado')}
                    disabled={savingId === p.id}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </div>

      {/* ── b) Mapa ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">🗺️ Jugadores en {mapAssessment}</h3>
          <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-semibold">{mapPlayers.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button className={segBtn(mapView === 'matriz')} onClick={() => setMapView('matriz')}>Matriz</button>
              <button className={segBtn(mapView === 'campo')} onClick={() => setMapView('campo')}>⚽ Campograma</button>
            </div>
            {mapView === 'matriz' && (
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button className={segBtn(mapDim === 'pos')} onClick={() => { setMapDim('pos'); setSelectedCell(null) }}>× Posición</button>
                <button className={segBtn(mapDim === 'cat')} onClick={() => { setMapDim('cat'); setSelectedCell(null) }}>× Categoría</button>
              </div>
            )}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {MAP_ASSESSMENTS.map(a => (
                <button key={a} className={segBtn(mapAssessment === a)} onClick={() => { setMapAssessment(a); setSelectedCell(null) }}>{a}</button>
              ))}
            </div>
          </div>
        </div>

        {mapPlayers.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-5">No hay jugadores en {mapAssessment}.</p>
        ) : mapView === 'matriz' ? (
          <>
            <div className="p-4 overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5" />
                    {cols.map(c => (
                      <th key={c} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">{c}</th>
                    ))}
                    <th className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {genRows.map(g => {
                    const total = cols.reduce((s, c) => s + (matrix[g]?.[c]?.length ?? 0), 0)
                    return (
                      <tr key={g}>
                        <td className="px-2 py-1 text-xs font-bold text-slate-600 whitespace-nowrap">
                          {g}{g !== '—' && <span className="text-slate-400 font-medium text-[10px]"> ({new Date().getFullYear() - parseInt(g)} años)</span>}
                        </td>
                        {cols.map(c => {
                          const n = matrix[g]?.[c]?.length ?? 0
                          const isSel = selectedCell?.row === g && selectedCell?.col === c
                          if (n === 0) return <td key={c} className="p-0.5"><div className="h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-200 text-xs">·</div></td>
                          return (
                            <td key={c} className="p-0.5">
                              <button
                                onClick={() => setSelectedCell(isSel ? null : { row: g, col: c })}
                                className={`w-full h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-all border ${
                                  isSel ? 'border-amber-500 scale-105' : 'border-transparent hover:border-amber-300'
                                }`}
                                style={{ background: `rgba(245,158,11,${0.10 + 0.28 * (n / maxCell)})`, color: '#92400e' }}
                              >
                                {n}
                              </button>
                            </td>
                          )
                        })}
                        <td className="p-0.5"><div className="h-9 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500">{total}</div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {selectedCell && cellPlayers.length > 0 && (
              <div className="mx-4 mb-4 border-t border-dashed border-slate-200 pt-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  {mapAssessment} · {selectedCell.row} · {selectedCell.col}
                </p>
                <div className="space-y-0.5">
                  {cellPlayers.map(p => {
                    const last = reportsByPlayer[p.id]?.[0]
                    return (
                      <button
                        key={p.id}
                        onClick={() => onOpenPlayer(p.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left"
                      >
                        <span className="text-xs font-semibold text-slate-800">{p.fullName}</span>
                        <span className="text-[11px] text-slate-400">{p.team ?? ''}</span>
                        <span className="ml-auto text-[10px] text-slate-400">
                          {last ? `últ. informe ${fmtDate(last.fecha ?? last.createdAt)}` : 'sin informes'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-4">
            {/* Filtro de generación */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Generación:</span>
              <button
                onClick={() => setGenFilter('all')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                  genFilter === 'all' ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                }`}
              >
                Todas
              </button>
              {pitchGens.map(g => (
                <button
                  key={g}
                  onClick={() => setGenFilter(f => f === g ? 'all' : g)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                    genFilter === g ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Campo */}
            <div className="relative w-full max-w-[560px] mx-auto rounded-xl overflow-hidden"
              style={{ aspectRatio: '100 / 130', background: 'linear-gradient(180deg,#15803d 0%,#166534 100%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,.18)' }}>
              <svg viewBox="0 0 100 130" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
                <rect x="1" y="1" width="98" height="128" rx="2" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <line x1="1" y1="65" x2="99" y2="65" stroke="#ffffff55" strokeWidth=".7" />
                <circle cx="50" cy="65" r="10" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="24" y="109" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="38" y="121" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="24" y="1" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="38" y="1" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              </svg>
              {PITCH_SLOTS.map(s => {
                const pls = pitchBySlot.map[s.id] ?? []
                const isExpanded = expandedSlots.has(s.id)
                const visible = isExpanded ? pls : pls.slice(0, 3)
                const extra = pls.length - visible.length
                return (
                  <div key={s.id} className="absolute flex flex-col items-center gap-0.5 z-10" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                    <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-white text-[10px] font-extrabold tracking-wide border ${pls.length === 0 ? 'opacity-40 border-white/30 bg-white/10' : 'border-white/40 bg-white/15'}`}
                      style={{ backdropFilter: 'blur(2px)' }}>
                      {s.id}
                      {pls.length > 0 && <span className="bg-amber-500 text-[9px] text-amber-950 rounded-full px-1.5 font-extrabold">{pls.length}</span>}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      {visible.map(p => (
                        <button
                          key={p.id}
                          onClick={() => onOpenPlayer(p.id)}
                          title={`${p.fullName}${p.team ? ' · ' + p.team : ''}${p.position2 ? ' · 2ª: ' + p.position2 : ''}`}
                          className="bg-amber-50 border border-amber-200 text-amber-900 text-[9.5px] font-bold rounded-md px-1.5 py-px whitespace-nowrap shadow hover:bg-amber-100 transition-colors max-w-[130px] truncate"
                        >
                          {p.fullName.split(' ').slice(0, 2).join(' ')}
                          {p.birthdate && <span className="font-medium text-amber-600"> '{p.birthdate.slice(2, 4)}</span>}
                        </button>
                      ))}
                      {extra > 0 && (
                        <button
                          onClick={() => setExpandedSlots(prev => { const n = new Set(prev); n.add(s.id); return n })}
                          className="text-[9px] text-white/85 hover:text-white font-semibold"
                        >
                          +{extra} más
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10.5px] text-slate-400 text-center mt-2 max-w-[560px] mx-auto leading-relaxed">
              Clic en un jugador → ficha. Los jugadores con 2ª posición cuentan en la principal (la 2ª se ve al pasar el ratón).
              {pitchBySlot.unmapped > 0 && ` · ${pitchBySlot.unmapped} jugador${pitchBySlot.unmapped !== 1 ? 'es' : ''} sin posición reconocida (no se muestran)`}
            </p>
          </div>
        )}
      </div>

      {/* ── c) Movimientos ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">📈 Movimientos · últimas 3 semanas</h3>
          {staleDecidir.length > 0 && (
            <button
              onClick={() => setShowStale(v => !v)}
              className="ml-auto text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors"
            >
              ⚠️ {staleDecidir.length} en Decidir sin actividad {'>'}6 sem {showStale ? '▴' : '▾'}
            </button>
          )}
        </div>
        {showStale && staleDecidir.length > 0 && (
          <div className="px-4 py-2.5 bg-orange-50/50 border-b border-orange-100 flex flex-wrap gap-1.5">
            {staleDecidir.map(p => (
              <button
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                className="text-[11px] font-semibold bg-white border border-orange-200 text-orange-800 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors"
              >
                {p.fullName}{p.birthdate ? ` '${p.birthdate.slice(2, 4)}` : ''}
              </button>
            ))}
          </div>
        )}
        {movements.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-5">Sin movimientos en las últimas 3 semanas.</p>
        ) : (
          <div className="px-4 py-2">
            {movements.map((m, i) => (
              <div key={i} className="flex items-baseline gap-3 py-2 border-b border-slate-50 last:border-b-0 text-xs text-slate-600">
                <span className="text-[10.5px] text-slate-400 whitespace-nowrap w-14 flex-shrink-0">
                  {new Date(m.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                {m.node}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────

interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  profiles: Profile[]
  currentProfile: Profile
  onBack: () => void
  onGoToSection: (s: 'tareas' | 'jugadores' | 'distribucion') => void
  onLogout: () => void
  onAdmin?: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onUpdatePlayer: (p: ScoutingPlayer) => void
  onDeletePlayer: (id: string) => void
  onAddReport: (r: ScoutingReport) => void
  onUpdateReport: (r: ScoutingReport) => void
  onDeleteReport: (id: string) => void
  onAddMatch: (m: ScoutingMatch) => void
  onUpdateMatch: (m: ScoutingMatch) => void
  onDeleteMatch: (id: string) => void
  matchPlayers: ScoutingMatchPlayer[]
  onAddMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  boulemaPeticiones: BoulemaPeticion[]
  onAddBoulemaPeticion: (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => Promise<void>
  onUpdateBoulemaPeticion: (p: BoulemaPeticion) => Promise<void>
  onDeleteBoulemaPeticion: (id: string) => Promise<void>
}

// ── MatchFormPanel — isolated so keystrokes don't re-render the whole list ──
type MatchFormState = { date: string; homeTeam: string; awayTeam: string; competition: string; assignedTo: string; viewMode: 'video' | 'campo'; notes: string }
function emptyMatchForm(): MatchFormState {
  return { date: '', homeTeam: '', awayTeam: '', competition: '', assignedTo: '', viewMode: 'video', notes: '' }
}
function MatchFormPanel({ initial, profiles, onSave, onCancel, showToast }: {
  initial?: ScoutingMatch
  profiles: Profile[]
  onSave: (f: MatchFormState) => Promise<void>
  onCancel: () => void
  showToast?: ShowToast
}) {
  const [form, setForm] = useState<MatchFormState>(initial
    ? { date: initial.date, homeTeam: initial.homeTeam, awayTeam: initial.awayTeam, competition: initial.competition ?? '', assignedTo: initial.assignedTo ?? '', viewMode: initial.viewMode ?? 'video', notes: initial.notes ?? '' }
    : emptyMatchForm()
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof MatchFormState, v: string) => setForm(f => ({ ...f, [k]: v }))
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FormRow label="Fecha"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="field" /></FormRow>
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

// ── Main component ───────────────────────────────────────────

export function Captacion({
  scoutingPlayers,
  scoutingReports,
  scoutingMatches,
  profiles,
  currentProfile,
  onGoToSection,
  onLogout,
  onAdmin,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onAddReport,
  onUpdateReport,
  onDeleteReport,
  onAddMatch,
  onUpdateMatch,
  onDeleteMatch,
  matchPlayers,
  onAddMatchPlayer,
  onRemoveMatchPlayer,
  boulemaPeticiones,
  onAddBoulemaPeticion,
  onUpdateBoulemaPeticion,
  onDeleteBoulemaPeticion,
}: Props) {
  const isAdmin = currentProfile.is_admin

  // ── toasts ──
  const { toasts, showToast, dismissToast } = useToast()

  // ── section tab ── (must be before header-height effect)
  const [captTab, setCaptTab] = useState<CaptacionTab>('jugadores')

  // ── header height (for panel offset) ──
  const headerRef = React.useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const measure = () => {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [captTab]) // recalculate if tabs change row count

  // ── filter state ──
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [assessFilter, setAssessFilter] = useState<ScoutingAssessment | 'all'>('all')
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all')
  const [posFilter, setPosFilter] = useState<string>('all')
  const [showCatMenu, setShowCatMenu] = useState(false)
  const [showPosMenu, setShowPosMenu] = useState(false)
  const [quickAssessId, setQuickAssessId] = useState<string | null>(null)

  // ── panel state ──
  const [panelPlayerId, setPanelPlayerId] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showEditPlayer, setShowEditPlayer] = useState(false)
  const [editTarget, setEditTarget] = useState<ScoutingPlayer | null>(null)

  // ── report state ──
  const [reportText, setReportText] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [reportConclusion, setReportConclusion] = useState<ConclusionOption>('')
  const [reportMatchId, setReportMatchId] = useState<string>('')
  const [showAddReportForm, setShowAddReportForm] = useState(false)
  const [matchSearchInput, setMatchSearchInput] = useState('')
  const [matchSearchOpen, setMatchSearchOpen] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<string | null>(null)
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false)

  // ── match state ──
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [editingMatch, setEditingMatch] = useState<ScoutingMatch | null>(null)

  // ── match filters ──
  const [matchSearch, setMatchSearch] = useState('')
  const [matchPersonaFilter, setMatchPersonaFilter] = useState('all')
  const [matchCompFilter, setMatchCompFilter] = useState('all')
  const [matchModeFilter, setMatchModeFilter] = useState<'all' | 'video' | 'campo'>('all')
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'visto' | 'pendiente'>('all')
  const [reportPersonaFilter, setReportPersonaFilter] = useState('all')

  // ── pagination ──
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)

  // ── boulema ──
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

  const panelPlayer = panelPlayerId ? scoutingPlayers.find(p => p.id === panelPlayerId) ?? null : null
  const panelReports = useMemo(() => {
    if (!panelPlayerId) return []
    return scoutingReports
      .filter(r => r.playerId === panelPlayerId)
      .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
  }, [panelPlayerId, scoutingReports])

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    scoutingPlayers.forEach(p => { if (p.categoria) cats.add(p.categoria) })
    return Array.from(cats).sort()
  }, [scoutingPlayers])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim()
    return scoutingPlayers.filter(p => {
      if (assessFilter !== 'all' && p.assessment !== assessFilter) return false
      if (categoriaFilter !== 'all' && p.categoria !== categoriaFilter) return false
      if (posFilter !== 'all') {
        const pos = posFilter.toLowerCase()
        if (!(p.position1?.toLowerCase().includes(pos) || p.position2?.toLowerCase().includes(pos))) return false
      }
      if (q) {
        if (
          !p.fullName.toLowerCase().includes(q) &&
          !(p.team?.toLowerCase().includes(q)) &&
          !(p.nationality?.toLowerCase().includes(q))
        ) return false
      }
      return true
    })
  }, [scoutingPlayers, debouncedSearch, assessFilter, categoriaFilter, posFilter])

  useEffect(() => { setPage(0) }, [debouncedSearch, assessFilter, categoriaFilter, posFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // ── statistics ──
  const stats = useMemo(() => {
    // Reports per persona
    const byPersona: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const k = r.persona ?? '—'
      byPersona[k] = (byPersona[k] ?? 0) + 1
    })
    const personaRanked = Object.entries(byPersona).sort((a, b) => b[1] - a[1])

    // Conclusions
    const byConclusion: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const k = r.conclusion || 'Sin conclusión'
      byConclusion[k] = (byConclusion[k] ?? 0) + 1
    })

    // Assessment distribution (players)
    const byAssessment: Record<string, number> = {}
    scoutingPlayers.forEach(p => {
      const k = p.assessment ?? 'Sin valorar'
      byAssessment[k] = (byAssessment[k] ?? 0) + 1
    })

    // Positions most scouted (from player position1)
    const byPosition: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const p = scoutingPlayers.find(pl => pl.id === r.playerId)
      const pos = p?.position1 ?? '—'
      byPosition[pos] = (byPosition[pos] ?? 0) + 1
    })
    const positionRanked = Object.entries(byPosition).sort((a, b) => b[1] - a[1]).slice(0, 8)

    // Monthly activity last 12 months
    const now = new Date()
    const months: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS_ES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
      const count = scoutingReports.filter(r => (r.fecha ?? r.createdAt).startsWith(key)).length
      months.push({ label, count })
    }

    // Players with most reports
    const reportsByPlayer: Record<string, number> = {}
    scoutingReports.forEach(r => { reportsByPlayer[r.playerId] = (reportsByPlayer[r.playerId] ?? 0) + 1 })
    const topPlayers = Object.entries(reportsByPlayer)
      .sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([id, count]) => ({ name: scoutingPlayers.find(p => p.id === id)?.fullName ?? id, count }))

    return { byPersona, personaRanked, byConclusion, byAssessment, positionRanked, months, topPlayers }
  }, [scoutingReports, scoutingPlayers])

  // ── match statistics ──
  const matchStats = useMemo(() => {
    // Partidos por persona
    const byPersona: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      const k = m.assignedTo ?? '—'
      byPersona[k] = (byPersona[k] ?? 0) + 1
    })
    const personaRanked = Object.entries(byPersona).sort((a, b) => b[1] - a[1])

    // Vídeo vs campo
    let video = 0, campo = 0
    scoutingMatches.forEach(m => { m.viewMode === 'campo' ? campo++ : video++ })

    // Vistos vs pendientes
    const visto = scoutingMatches.filter(m => m.status === 'visto').length
    const pendiente = scoutingMatches.length - visto

    // Competiciones más vistas
    const byCompetition: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      const k = m.competition ?? 'Sin categoría'
      byCompetition[k] = (byCompetition[k] ?? 0) + 1
    })
    const competitionRanked = Object.entries(byCompetition).sort((a, b) => b[1] - a[1]).slice(0, 10)

    // Equipos más vistos (local + visitante)
    const byTeam: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      byTeam[m.homeTeam] = (byTeam[m.homeTeam] ?? 0) + 1
      byTeam[m.awayTeam] = (byTeam[m.awayTeam] ?? 0) + 1
    })
    const teamRanked = Object.entries(byTeam).sort((a, b) => b[1] - a[1]).slice(0, 15)

    // Actividad mensual de partidos (últimos 12 meses)
    const now = new Date()
    const matchMonths: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS_ES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
      const count = scoutingMatches.filter(m => m.date.startsWith(key)).length
      matchMonths.push({ label, count })
    }

    // Pendientes por persona
    const pendienteByPersona: Record<string, number> = {}
    scoutingMatches.filter(m => m.status !== 'visto' && m.assignedTo).forEach(m => {
      const k = m.assignedTo!
      pendienteByPersona[k] = (pendienteByPersona[k] ?? 0) + 1
    })

    return { byPersona, personaRanked, video, campo, visto, pendiente, competitionRanked, teamRanked, matchMonths, pendienteByPersona }
  }, [scoutingMatches])

  // ── filtered matches ──
  const filteredMatches = useMemo(() => {
    const q = matchSearch.toLowerCase().trim()
    return scoutingMatches.filter(m => {
      if (matchPersonaFilter !== 'all' && m.assignedTo !== matchPersonaFilter) return false
      if (matchCompFilter !== 'all' && m.competition !== matchCompFilter) return false
      if (matchModeFilter !== 'all' && (m.viewMode ?? 'video') !== matchModeFilter) return false
      if (matchStatusFilter !== 'all' && (m.status ?? 'pendiente') !== matchStatusFilter) return false
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.competition ?? ''} ${m.notes ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [scoutingMatches, matchSearch, matchPersonaFilter, matchCompFilter, matchModeFilter, matchStatusFilter])

  // ── matchPlayers lookup map (avoids O(n*m) scan per row during render) ──
  const matchPlayersByMatchId = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const mp of matchPlayers) {
      if (!map[mp.matchId]) map[mp.matchId] = []
      map[mp.matchId].push(mp.playerId)
    }
    return map
  }, [matchPlayers])

  // ── recent reports ──
  const reportPersonas = useMemo(() => {
    const set = new Set(scoutingReports.map(r => r.persona).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [scoutingReports])

  const recentReports = useMemo(() => {
    return [...scoutingReports]
      .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
      .filter(r => reportPersonaFilter === 'all' || r.persona === reportPersonaFilter)
      .slice(0, 60)
  }, [scoutingReports, reportPersonaFilter])

  // ── handlers ──

  async function handleAddReport() {
    if (!panelPlayer || !reportText.trim()) return
    setSavingReport(true)
    try {
      const saved = await db.createScoutingReport({
        playerId: panelPlayer.id,
        fecha: new Date().toISOString(),
        titulo: reportTitle.trim() || undefined,
        texto: reportText.trim(),
        persona: currentProfile.avatar,
        conclusion: reportConclusion || undefined,
        matchId: reportMatchId || undefined,
        authorId: currentProfile.id,
      })
      onAddReport(saved)
      // Also link player to the match if one was selected
      if (reportMatchId) {
        await onAddMatchPlayer(reportMatchId, panelPlayer.id)
      }
      setReportTitle('')
      setReportText('')
      setReportConclusion('')
      setReportMatchId('')
      showToast('Informe guardado')
    } catch {
      showToast('Error al guardar el informe', 'error')
    } finally {
      setSavingReport(false)
    }
  }

  async function handleUpdateReport(r: ScoutingReport) {
    await db.updateScoutingReport(r)
    onUpdateReport(r)
  }

  async function handleDeleteReport(id: string) {
    try {
      await db.deleteScoutingReport(id)
      onDeleteReport(id)
      setConfirmDeleteReport(null)
      showToast('Informe eliminado')
    } catch {
      showToast('Error al eliminar el informe', 'error')
    }
  }

  async function handleDeletePlayer() {
    if (!panelPlayer) return
    try {
      await db.deleteScoutingPlayer(panelPlayer.id)
      onDeletePlayer(panelPlayer.id)
      setPanelPlayerId(null)
      setConfirmDeletePlayer(false)
      showToast('Jugador eliminado')
    } catch {
      showToast('Error al eliminar el jugador', 'error')
    }
  }

  async function handleQuickAssessment(player: ScoutingPlayer, assessment: ScoutingAssessment | undefined) {
    try {
      const updated = {
        ...player,
        assessment,
        // registrar cuándo cambió (para "Movimientos" en Conclusiones)
        assessmentUpdatedAt: assessment !== player.assessment ? new Date().toISOString() : player.assessmentUpdatedAt,
      }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
    } catch {
      showToast('Error al actualizar el assessment', 'error')
    }
  }

  // ── player form ──
  const emptyForm = (): Omit<ScoutingPlayer, 'id' | 'createdAt'> => ({
    fullName: '', position1: '', position2: '', birthdate: '', foot: '',
    team: '', assessment: undefined, nationality: '', agency: '',
    clubContract: '', contacto: '', categoria: '', comentarios: '',
  })
  const [form, setForm] = useState(emptyForm())
  const [savingPlayer, setSavingPlayer] = useState(false)
  const [playerNameError, setPlayerNameError] = useState('')

  function openAddPlayer() {
    setForm(emptyForm())
    setPlayerNameError('')
    setShowAddPlayer(true)
    setShowEditPlayer(false)
    setEditTarget(null)
  }

  function openEditPlayer(p: ScoutingPlayer) {
    setForm({
      fullName: p.fullName, position1: p.position1 ?? '', position2: p.position2 ?? '',
      birthdate: p.birthdate ?? '', foot: p.foot ?? '', team: p.team ?? '',
      assessment: p.assessment, nationality: p.nationality ?? '', agency: p.agency ?? '',
      clubContract: p.clubContract ?? '', contacto: p.contacto ?? '',
      categoria: p.categoria ?? '', comentarios: p.comentarios ?? '',
    })
    setPlayerNameError('')
    setEditTarget(p)
    setShowEditPlayer(true)
    setShowAddPlayer(false)
  }

  async function handleSavePlayer() {
    if (savingPlayer) return
    if (!isValidName(form.fullName)) {
      setPlayerNameError('Introduce un nombre válido (mínimo 2 caracteres)')
      return
    }
    setPlayerNameError('')
    const payload = {
      fullName: form.fullName.trim(),
      position1: form.position1?.trim() || undefined,
      position2: form.position2?.trim() || undefined,
      birthdate: form.birthdate?.trim() || undefined,
      foot: form.foot?.trim() || undefined,
      team: form.team?.trim() || undefined,
      assessment: form.assessment || undefined,
      nationality: form.nationality?.trim() || undefined,
      agency: form.agency?.trim() || undefined,
      clubContract: form.clubContract?.trim() || undefined,
      contacto: form.contacto?.trim() || undefined,
      categoria: form.categoria?.trim() || undefined,
      comentarios: form.comentarios?.trim() || undefined,
    }
    setSavingPlayer(true)
    try {
      if (showEditPlayer && editTarget) {
        const updated = {
          ...editTarget,
          ...payload,
          assessmentUpdatedAt: payload.assessment !== editTarget.assessment
            ? new Date().toISOString()
            : editTarget.assessmentUpdatedAt,
        }
        await db.updateScoutingPlayer(updated)
        onUpdatePlayer(updated)
        setPanelPlayerId(updated.id)
        showToast('Jugador actualizado')
      } else {
        const saved = await db.createScoutingPlayer(payload)
        onAddPlayer(saved)
        setPanelPlayerId(saved.id)
        showToast('Jugador creado')
      }
      setShowAddPlayer(false)
      setShowEditPlayer(false)
      setEditTarget(null)
    } catch {
      showToast('Error al guardar el jugador', 'error')
    } finally {
      setSavingPlayer(false)
    }
  }

  // ── match handlers ──
  function openAddMatch() {
    setEditingMatch(null)
    setShowAddMatch(true)
  }

  function openEditMatch(m: ScoutingMatch) {
    setEditingMatch(m)
    setShowAddMatch(true)
  }

  async function handleSaveMatch(form: MatchFormState) {
    const payload = {
      date: form.date,
      homeTeam: form.homeTeam.trim(),
      awayTeam: form.awayTeam.trim(),
      competition: form.competition.trim() || undefined,
      assignedTo: form.assignedTo.trim() || undefined,
      viewMode: form.viewMode,
      status: (editingMatch?.status ?? 'pendiente') as 'pendiente' | 'visto',
      notes: form.notes.trim() || undefined,
    }
    if (editingMatch) {
      const updated: ScoutingMatch = { ...editingMatch, ...payload }
      await db.updateScoutingMatch(updated)
      onUpdateMatch(updated)
    } else {
      const saved = await db.createScoutingMatch(payload)
      onAddMatch(saved)
    }
    setShowAddMatch(false)
    setEditingMatch(null)
  }

  async function handleDeleteMatch(id: string) {
    try {
      await db.deleteScoutingMatch(id)
      onDeleteMatch(id)
      showToast('Partido eliminado')
    } catch {
      showToast('Error al eliminar el partido', 'error')
    }
  }

  async function handleToggleMatchStatus(m: ScoutingMatch) {
    try {
      const updated: ScoutingMatch = { ...m, status: m.status === 'visto' ? 'pendiente' : 'visto' }
      await db.updateScoutingMatch(updated)
      onUpdateMatch(updated)
    } catch {
      showToast('Error al actualizar el estado del partido', 'error')
    }
  }

  async function handleAssignMatch(m: ScoutingMatch, assignedTo: string) {
    try {
      const updated: ScoutingMatch = { ...m, assignedTo: assignedTo || undefined, status: 'pendiente' }
      await db.updateScoutingMatch(updated)
      onUpdateMatch(updated)
    } catch {
      showToast('Error al asignar el partido', 'error')
    }
  }

  const closeCatMenu = () => setShowCatMenu(false)
  const closePosMenu = () => setShowPosMenu(false)

  function closePanel() {
    setPanelPlayerId(null)
    setShowAddPlayer(false)
    setShowEditPlayer(false)
    setConfirmDeletePlayer(false)
    setFullscreen(false)
    setEditingReportCount(0)
  }

  // ── ESC: cerrar panel lateral (sin pisar modales ni formularios abiertos) ──
  const [editingReportCount, setEditingReportCount] = useState(0)
  useEffect(() => { setEditingReportCount(0) }, [panelPlayerId])
  const handleReportEditingChange = useCallback(
    (editing: boolean) => setEditingReportCount(c => Math.max(0, c + (editing ? 1 : -1))),
    []
  )

  // ── render ───────────────────────────────────────────────────

  const hasPanel = !!panelPlayer || showAddPlayer || showEditPlayer

  useEscapeKey(
    closePanel,
    hasPanel &&
      !showAddPlayer && !showEditPlayer && !showAddReportForm &&
      editingReportCount === 0 &&
      !showAddBoulema && !editingPeticion && !respondingPeticion
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header ref={headerRef} className="bg-white border-b border-slate-200 sticky top-0 z-50">
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
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
            <Eye className="w-3.5 h-3.5" />
            Captación
          </button>
        </div>

        {/* Captación sub-tabs */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          {([
            { id: 'jugadores' as CaptacionTab, label: 'Jugadores', labelMobile: 'Jugadores', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'conclusiones' as CaptacionTab, label: 'Conclusiones', labelMobile: 'Concl.', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'informes' as CaptacionTab, label: 'Informes recientes', labelMobile: 'Informes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'estadisticas' as CaptacionTab, label: 'Estadísticas', labelMobile: 'Stats', icon: <BarChart2 className="w-3.5 h-3.5" /> },
            { id: 'partidos' as CaptacionTab, label: 'Partidos', labelMobile: 'Partidos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { id: 'boulema' as CaptacionTab, label: 'Boulema', labelMobile: 'Boulema', icon: <Inbox className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setCaptTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                captTab === t.id
                  ? 'bg-primary text-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.labelMobile}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── JUGADORES TAB ────────────────────────────────────── */}
      {captTab === 'jugadores' && (
        <>
          {/* Filters bar */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar jugador, equipo..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Assessment chips */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setAssessFilter('all')}
                  className={`px-2.5 py-1.5 sm:py-1 text-xs font-medium rounded-full border transition-colors ${
                    assessFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  Todos
                </button>
                {ALL_ASSESSMENTS.map(a => {
                  const cfg = ASSESSMENT_CONFIG[a]
                  const active = assessFilter === a
                  return (
                    <button
                      key={a}
                      onClick={() => setAssessFilter(active ? 'all' : a)}
                      className={`px-2.5 py-1.5 sm:py-1 text-xs font-medium rounded-full border transition-colors ${
                        active ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {a}
                    </button>
                  )
                })}
              </div>

              {/* Categoria dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowCatMenu(!showCatMenu); setShowPosMenu(false) }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:border-slate-400 transition-colors"
                >
                  {categoriaFilter === 'all' ? 'Categoría' : categoriaFilter}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {showCatMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={closeCatMenu} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setCategoriaFilter('all'); closeCatMenu() }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${categoriaFilter === 'all' ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
                      >
                        Todas las categorías
                      </button>
                      {allCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => { setCategoriaFilter(cat); closeCatMenu() }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${categoriaFilter === cat ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Position dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowPosMenu(!showPosMenu); setShowCatMenu(false) }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:border-slate-400 transition-colors"
                >
                  {posFilter === 'all' ? 'Posición' : posFilter}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {showPosMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={closePosMenu} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setPosFilter('all'); closePosMenu() }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${posFilter === 'all' ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
                      >
                        Todas las posiciones
                      </button>
                      {POSITIONS_SCOUTING.map(pos => (
                        <button
                          key={pos}
                          onClick={() => { setPosFilter(pos); closePosMenu() }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${posFilter === pos ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1" />
              <span className="text-xs text-slate-400">{filtered.length} jugadores</span>

              {/* Add player — available to all users */}
              <button
                onClick={openAddPlayer}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 py-4">
            {/* Chips de filtros activos */}
            {(() => {
              const chips: FilterChip[] = []
              if (search.trim()) chips.push({ key: 'search', label: `Búsqueda: "${search.trim()}"`, onRemove: () => setSearch('') })
              if (assessFilter !== 'all') chips.push({ key: 'assess', label: `Assessment: ${assessFilter}`, onRemove: () => setAssessFilter('all') })
              if (categoriaFilter !== 'all') chips.push({ key: 'cat', label: `Categoría: ${categoriaFilter}`, onRemove: () => setCategoriaFilter('all') })
              if (posFilter !== 'all') chips.push({ key: 'pos', label: `Posición: ${posFilter}`, onRemove: () => setPosFilter('all') })
              if (chips.length === 0) return null
              return (
                <div className="mb-3">
                  <ActiveFilterChips
                    chips={chips}
                    onClearAll={() => { setSearch(''); setAssessFilter('all'); setCategoriaFilter('all'); setPosFilter('all') }}
                  />
                </div>
              )
            })()}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Jugador</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Posición</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Año nasc.</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Equipo</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Categoría</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assessment</th>
                      <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Informes</th>
                      <th className="text-right px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            icon={<Users className="w-10 h-10" />}
                            title="No se encontraron jugadores"
                            subtitle="Prueba a cambiar o limpiar los filtros actuales"
                          />
                        </td>
                      </tr>
                    ) : paginated.map(p => {
                      const reportCount = scoutingReports.filter(r => r.playerId === p.id).length
                      return (
                        <tr
                          key={p.id}
                          onClick={() => { setPanelPlayerId(p.id); setShowAddPlayer(false); setShowEditPlayer(false) }}
                          className={`cursor-pointer hover:bg-slate-50 transition-colors ${panelPlayerId === p.id ? 'bg-blue-50/40' : ''}`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800 text-sm max-w-[140px] sm:max-w-none truncate">{p.fullName}</div>
                            {p.nationality && <div className="text-xs text-slate-400 max-w-[140px] sm:max-w-none truncate">{p.nationality}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-slate-600">
                            <div>{p.position1 ?? '—'}</div>
                            {p.position2 && <div className="text-slate-400">{p.position2}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-slate-600 hidden sm:table-cell">
                            {birthYearFromBirthdate(p.birthdate)}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-slate-600 hidden md:table-cell max-w-[160px] truncate">
                            {p.team ?? '—'}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-slate-500 hidden lg:table-cell">
                            {p.categoria ?? '—'}
                          </td>
                          <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="relative inline-block">
                              <button
                                onClick={() => setQuickAssessId(quickAssessId === p.id ? null : p.id)}
                                className="group flex items-center gap-1 p-2 -m-2 sm:p-0 sm:m-0"
                                title="Cambiar assessment"
                              >
                                <AssessmentChip a={p.assessment} />
                                <ChevronDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
                              </button>
                              {quickAssessId === p.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setQuickAssessId(null)} />
                                  <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[130px]">
                                    <button
                                      onClick={async () => { await handleQuickAssessment(p, undefined); setQuickAssessId(null) }}
                                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${!p.assessment ? 'font-semibold text-slate-700' : 'text-slate-500'}`}
                                    >
                                      Sin valorar
                                    </button>
                                    {ALL_ASSESSMENTS.map(a => {
                                      const cfg = ASSESSMENT_CONFIG[a]
                                      return (
                                        <button
                                          key={a}
                                          onClick={async () => { await handleQuickAssessment(p, a); setQuickAssessId(null) }}
                                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50 transition-colors ${p.assessment === a ? `font-semibold ${cfg.text}` : 'text-slate-600'}`}
                                        >
                                          {p.assessment === a && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.bg} border ${cfg.border}`} />}
                                          {a}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 hidden sm:table-cell">
                            {reportCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <FileText className="w-3 h-3 text-slate-400" />
                                {reportCount}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 inline" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
                  <span className="text-sm text-slate-600 font-medium">
                    Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      aria-label="Página anterior"
                      className="px-3 py-2 sm:py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Anterior
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const idx = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i
                      return (
                        <button
                          key={idx}
                          onClick={() => setPage(idx)}
                          aria-label={`Ir a la página ${idx + 1}`}
                          aria-current={idx === page ? 'page' : undefined}
                          className={`w-10 h-10 sm:w-8 sm:h-8 text-sm font-medium rounded-lg border transition-colors ${
                            idx === page
                              ? 'bg-primary text-white border-primary'
                              : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      aria-label="Página siguiente"
                      className="px-3 py-2 sm:py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── CONCLUSIONES TAB ─────────────────────────────────── */}
      {captTab === 'conclusiones' && (
        <div className="flex-1 w-full px-3 sm:px-6 py-4">
          <div className="max-w-6xl mx-auto">
            <ConclusionesTab
              players={scoutingPlayers}
              reports={scoutingReports}
              onSetAssessment={async (p, a) => {
                await handleQuickAssessment(p, a)
                showToast(`${p.fullName} → ${a}`)
              }}
              onOpenPlayer={id => setPanelPlayerId(id)}
            />
          </div>
        </div>
      )}

      {/* ── INFORMES RECIENTES TAB ─────────────────────────── */}
      {captTab === 'informes' && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
          {/* Per-author stats */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" /> Informes por explorador
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {stats.personaRanked.map(([persona, count]) => {
                const name = personaToName(persona, profiles)
                return (
                  <div key={persona} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-lg font-bold text-slate-800">{count}</div>
                    <div className="text-[11px] font-mono font-semibold text-slate-600">{persona}</div>
                    {name && name !== persona && (
                      <div className="text-[11px] text-slate-400 truncate">{name}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent reports list */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Últimos informes ({recentReports.length})
              </h3>
              {/* Persona filter chips */}
              {reportPersonas.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setReportPersonaFilter('all')}
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${reportPersonaFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    Todos
                  </button>
                  {reportPersonas.map(p => (
                    <button
                      key={p}
                      onClick={() => setReportPersonaFilter(prev => prev === p ? 'all' : p)}
                      className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold transition-colors ${reportPersonaFilter === p ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {recentReports.map(r => {
                const player = scoutingPlayers.find(p => p.id === r.playerId)
                const rel = relativeDate(r.fecha)
                return (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all"
                    onClick={() => { setCaptTab('jugadores'); setPanelPlayerId(r.playerId) }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-semibold text-slate-800 text-sm">{player?.fullName ?? '—'}</span>
                          {player?.position1 && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{player.position1}</span>}
                          {r.conclusion && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${CONCLUSION_STYLE[r.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                              {r.conclusion}
                            </span>
                          )}
                        </div>
                        {r.titulo && <div className="text-xs font-medium text-slate-600 mb-0.5">{r.titulo}</div>}
                        {r.texto && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{r.texto}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right min-w-[72px]">
                        <div className="flex flex-col items-end gap-0.5">
                          {rel && (
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${rel === 'hoy' ? 'bg-green-100 text-green-700' : rel === 'ayer' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              {rel}
                            </span>
                          )}
                          <div className="text-[11px] text-slate-400">{fmtDate(r.fecha)}</div>
                          {r.persona && (
                            <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{r.persona}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {recentReports.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Sin informes de {reportPersonaFilter !== 'all' ? reportPersonaFilter : 'ningún explorador'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ESTADÍSTICAS TAB ──────────────────────────────── */}
      {captTab === 'estadisticas' && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total informes', value: scoutingReports.length },
              { label: 'Total jugadores', value: scoutingPlayers.length },
              { label: 'Exploradores activos', value: stats.personaRanked.length },
              { label: 'Partidos vistos', value: scoutingMatches.length },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reports by author */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Informes por explorador</h3>
              <div className="space-y-2">
                {stats.personaRanked.slice(0, 8).map(([persona, count]) => {
                  const name = personaToName(persona, profiles)
                  return (
                    <StatBar
                      key={persona}
                      label={name && name !== persona ? `${persona} · ${name.split(' ')[0]}` : persona}
                      value={count}
                      max={stats.personaRanked[0]?.[1] ?? 1}
                      color="bg-blue-500"
                    />
                  )
                })}
              </div>
            </div>

            {/* Conclusions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Distribución de conclusiones</h3>
              <div className="space-y-2">
                {Object.entries(stats.byConclusion)
                  .sort((a, b) => b[1] - a[1])
                  .map(([conclusion, count]) => (
                    <StatBar
                      key={conclusion}
                      label={conclusion}
                      value={count}
                      max={Math.max(...Object.values(stats.byConclusion))}
                      color={
                        conclusion === 'Seguir' ? 'bg-blue-500' :
                        conclusion === 'Firmar' || conclusion === 'Llamar' ? 'bg-green-500' :
                        conclusion === 'Descartar' ? 'bg-red-400' :
                        'bg-slate-300'
                      }
                    />
                  ))}
              </div>
            </div>

            {/* Positions most scouted */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Posiciones más vistas</h3>
              <div className="space-y-2">
                {stats.positionRanked.map(([pos, count]) => (
                  <StatBar
                    key={pos}
                    label={pos}
                    value={count}
                    max={stats.positionRanked[0]?.[1] ?? 1}
                    color="bg-violet-500"
                  />
                ))}
              </div>
            </div>

            {/* Assessment distribution */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Assessment de jugadores</h3>
              <div className="space-y-2">
                {Object.entries(stats.byAssessment)
                  .sort((a, b) => b[1] - a[1])
                  .map(([assessment, count]) => (
                    <StatBar
                      key={assessment}
                      label={assessment}
                      value={count}
                      max={Math.max(...Object.values(stats.byAssessment))}
                      color={
                        assessment === 'Llamar' ? 'bg-amber-400' :
                        assessment === 'Seguir' ? 'bg-blue-500' :
                        assessment === 'Basque' ? 'bg-violet-500' :
                        assessment === 'Visto' ? 'bg-slate-400' :
                        assessment === 'Descartado' ? 'bg-red-400' :
                        'bg-orange-400'
                      }
                    />
                  ))}
              </div>
            </div>

            {/* Monthly trend */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Actividad mensual (últimos 12 meses)</h3>
              <div className="overflow-x-auto scrollbar-none">
              <div className="flex items-end gap-1 h-24 min-w-[440px]">
                {stats.months.map(({ label, count }) => {
                  const maxCount = Math.max(...stats.months.map(m => m.count), 1)
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px] text-slate-500 font-medium">{count || ''}</div>
                      <div className="w-full bg-slate-100 rounded-t" style={{ height: '60px' }}>
                        <div
                          className="w-full bg-primary rounded-t transition-all"
                          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-400 whitespace-nowrap">{label}</div>
                    </div>
                  )
                })}
              </div>
              </div>
            </div>

            {/* Top players by reports */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Jugadores más seguidos
                <span className="ml-2 text-xs font-normal text-slate-400">top {stats.topPlayers.length}</span>
              </h3>
              <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                {stats.topPlayers.map(({ name, count }) => (
                  <StatBar
                    key={name}
                    label={name}
                    value={count}
                    max={stats.topPlayers[0]?.count ?? 1}
                    color="bg-emerald-500"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── ESTADÍSTICAS DE PARTIDOS ── */}
          <div className="mt-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" /> Estadísticas de partidos
            </h2>
            {scoutingMatches.length === 0 ? (
              <p className="text-xs text-slate-400">No hay partidos registrados aún.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                {/* KPIs rápidos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2 xl:col-span-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    {[
                      { label: 'Total partidos', value: scoutingMatches.length, color: 'text-slate-800' },
                      { label: 'Vistos', value: matchStats.visto, color: 'text-emerald-600' },
                      { label: 'Pendientes', value: matchStats.pendiente, color: 'text-amber-600' },
                      { label: 'En campo', value: matchStats.campo, color: 'text-violet-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className={`text-2xl font-bold ${color}`}>{value}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Partidos por scout */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" /> Partidos por explorador
                  </h3>
                  <div className="space-y-2">
                    {matchStats.personaRanked.map(([persona, count]) => {
                      const name = personaToName(persona, profiles)
                      return (
                        <StatBar
                          key={persona}
                          label={name && name !== persona ? `${persona} · ${name.split(' ')[0]}` : persona}
                          value={count}
                          max={matchStats.personaRanked[0]?.[1] ?? 1}
                          color="bg-blue-500"
                        />
                      )
                    })}
                  </div>
                  {/* Pendientes por persona */}
                  {Object.keys(matchStats.pendienteByPersona).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-amber-600 uppercase mb-2">Pendientes de ver</div>
                      {Object.entries(matchStats.pendienteByPersona).map(([persona, count]) => (
                        <StatBar
                          key={persona}
                          label={persona}
                          value={count}
                          max={Math.max(...Object.values(matchStats.pendienteByPersona))}
                          color="bg-amber-400"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Vídeo vs Campo */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Modo de visualización</h3>
                  <div className="space-y-2">
                    <StatBar label="📹 Vídeo" value={matchStats.video} max={scoutingMatches.length} color="bg-blue-400" />
                    <StatBar label="🏟️ Campo" value={matchStats.campo} max={scoutingMatches.length} color="bg-emerald-500" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {matchStats.video > 0 && (
                      <div className="flex-1 text-center bg-blue-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-blue-700">{Math.round((matchStats.video / scoutingMatches.length) * 100)}%</div>
                        <div className="text-[11px] text-blue-500">vídeo</div>
                      </div>
                    )}
                    {matchStats.campo > 0 && (
                      <div className="flex-1 text-center bg-emerald-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-emerald-700">{Math.round((matchStats.campo / scoutingMatches.length) * 100)}%</div>
                        <div className="text-[11px] text-emerald-500">campo</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Competiciones más vistas */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Competiciones más vistas</h3>
                  <div className="space-y-2">
                    {matchStats.competitionRanked.map(([comp, count]) => (
                      <StatBar
                        key={comp}
                        label={comp}
                        value={count}
                        max={matchStats.competitionRanked[0]?.[1] ?? 1}
                        color="bg-violet-500"
                      />
                    ))}
                  </div>
                </div>

                {/* Equipos más vistos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Equipos más vistos</h3>
                  <div className="overflow-y-auto max-h-64 space-y-2 pr-1">
                    {matchStats.teamRanked.map(([team, count]) => (
                      <StatBar
                        key={team}
                        label={team}
                        value={count}
                        max={matchStats.teamRanked[0]?.[1] ?? 1}
                        color="bg-orange-400"
                      />
                    ))}
                  </div>
                </div>

                {/* Actividad mensual de partidos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Partidos por mes (últimos 12 meses)</h3>
                  <div className="overflow-x-auto scrollbar-none">
                  <div className="flex items-end gap-1 h-24 min-w-[440px]">
                    {matchStats.matchMonths.map(({ label, count }) => {
                      const maxCount = Math.max(...matchStats.matchMonths.map(m => m.count), 1)
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={label} className="flex-1 flex flex-col items-center gap-1">
                          <div className="text-[9px] text-slate-500 font-medium">{count || ''}</div>
                          <div className="w-full bg-slate-100 rounded-t" style={{ height: '60px' }}>
                            <div
                              className="w-full bg-orange-400 rounded-t transition-all"
                              style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                            />
                          </div>
                          <div className="text-[9px] text-slate-400 whitespace-nowrap">{label}</div>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PARTIDOS TAB ──────────────────────────────────── */}
      {captTab === 'partidos' && (
        <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
          {/* Notificación de partidos pendientes */}
          {(() => {
            const myPending = scoutingMatches.filter(m => m.assignedTo === currentProfile.avatar && m.status !== 'visto')
            if (myPending.length === 0) return null
            return (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
                <span className="text-amber-500 text-base">🔔</span>
                <div className="flex-1">
                  <span className="font-semibold text-amber-800">Tienes {myPending.length} partido{myPending.length > 1 ? 's' : ''} pendiente{myPending.length > 1 ? 's' : ''} de ver</span>
                  <span className="text-amber-600 ml-2 text-xs">{myPending.map(m => `${m.homeTeam} vs ${m.awayTeam}`).join(' · ')}</span>
                </div>
              </div>
            )
          })()}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Partidos visualizados</h2>
              <p className="text-xs text-slate-400">{scoutingMatches.length} partido{scoutingMatches.length !== 1 ? 's' : ''} registrado{scoutingMatches.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={openAddMatch}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir partido
            </button>
          </div>

          {/* Add/edit match form */}
          {showAddMatch && (
            <MatchFormPanel
              key={editingMatch?.id ?? 'new'}
              initial={editingMatch ?? undefined}
              profiles={profiles}
              onSave={handleSaveMatch}
              onCancel={() => { setShowAddMatch(false); setEditingMatch(null) }}
              showToast={showToast}
            />
          )}

          {/* Filtros */}
          {scoutingMatches.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
              {/* Búsqueda libre */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={matchSearch}
                  onChange={e => setMatchSearch(e.target.value)}
                  placeholder="Buscar equipo, jugador..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {matchSearch && (
                  <button onClick={() => setMatchSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Scout */}
              <select
                value={matchPersonaFilter}
                onChange={e => setMatchPersonaFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
              >
                <option value="all">Todos los scouts</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>
                ))}
              </select>

              {/* Competición */}
              <select
                value={matchCompFilter}
                onChange={e => setMatchCompFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
              >
                <option value="all">Todas las competiciones</option>
                {Array.from(new Set(scoutingMatches.map(m => m.competition).filter(Boolean))).sort().map(c => (
                  <option key={c} value={c!}>{c}</option>
                ))}
              </select>

              {/* Modo */}
              <select
                value={matchModeFilter}
                onChange={e => setMatchModeFilter(e.target.value as typeof matchModeFilter)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
              >
                <option value="all">Vídeo + Campo</option>
                <option value="video">📹 Vídeo</option>
                <option value="campo">🏟️ Campo</option>
              </select>

              {/* Estado */}
              <div className="flex items-center gap-1">
                {(['all', 'visto', 'pendiente'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setMatchStatusFilter(s)}
                    className={`px-2.5 py-1.5 sm:py-1 text-xs font-medium rounded-full border transition-colors ${
                      matchStatusFilter === s
                        ? s === 'visto' ? 'bg-emerald-500 text-white border-emerald-500'
                          : s === 'pendiente' ? 'bg-amber-400 text-white border-amber-400'
                          : 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {s === 'all' ? 'Todos' : s === 'visto' ? '✓ Vistos' : '⏳ Pendientes'}
                  </button>
                ))}
              </div>

              {/* Resultados */}
              <span className="text-xs text-slate-400 ml-auto">
                {filteredMatches.length === scoutingMatches.length
                  ? `${scoutingMatches.length} partidos`
                  : `${filteredMatches.length} de ${scoutingMatches.length}`}
              </span>
            </div>
          )}

          {/* Chips de filtros activos (partidos) */}
          {(() => {
            const chips: FilterChip[] = []
            if (matchSearch.trim()) chips.push({ key: 'search', label: `Búsqueda: "${matchSearch.trim()}"`, onRemove: () => setMatchSearch('') })
            if (matchPersonaFilter !== 'all') chips.push({ key: 'scout', label: `Scout: ${matchPersonaFilter}`, onRemove: () => setMatchPersonaFilter('all') })
            if (matchCompFilter !== 'all') chips.push({ key: 'comp', label: `Competición: ${matchCompFilter}`, onRemove: () => setMatchCompFilter('all') })
            if (matchModeFilter !== 'all') chips.push({ key: 'mode', label: matchModeFilter === 'video' ? 'Modo: Vídeo' : 'Modo: Campo', onRemove: () => setMatchModeFilter('all') })
            if (matchStatusFilter !== 'all') chips.push({ key: 'status', label: matchStatusFilter === 'visto' ? 'Estado: Vistos' : 'Estado: Pendientes', onRemove: () => setMatchStatusFilter('all') })
            if (chips.length === 0) return null
            return (
              <ActiveFilterChips
                chips={chips}
                onClearAll={() => { setMatchSearch(''); setMatchPersonaFilter('all'); setMatchCompFilter('all'); setMatchModeFilter('all'); setMatchStatusFilter('all') }}
              />
            )
          })()}

          {scoutingMatches.length === 0 && !showAddMatch ? (
            <EmptyState
              icon={<ClipboardList className="w-10 h-10" />}
              title="No hay partidos registrados aún"
              subtitle="Si acabas de activar esta función, recuerda ejecutar el SQL de creación de tabla en Supabase"
              action={
                <button
                  onClick={openAddMatch}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir partido
                </button>
              }
            />
          ) : (
            <>
              {/* ── Mobile card list (hidden on sm+) ── */}
              <div className="sm:hidden space-y-2">
                {filteredMatches.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">No hay partidos que coincidan con los filtros</div>
                ) : filteredMatches.map(m => {
                  const linkedPlayerIds = matchPlayersByMatchId[m.id] ?? []
                  const linkedPlayers = scoutingPlayers.filter(p => linkedPlayerIds.includes(p.id))
                  const isVisto = m.status === 'visto'
                  const day = m.date.slice(8); const mon = MONTHS_ES[parseInt(m.date.slice(5, 7)) - 1]; const yr = m.date.slice(2, 4)
                  return (
                    <div key={m.id} className={`bg-white border rounded-xl p-3 space-y-2 ${isVisto ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30'}`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800 leading-tight">
                            {m.homeTeam} <span className="text-slate-400 font-normal text-xs">vs</span> {m.awayTeam}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-xs text-slate-400">{day} {mon} &apos;{yr}</span>
                            {m.competition && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{m.competition}</span>}
                            {m.viewMode === 'campo'
                              ? <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">🏟️ Campo</span>
                              : <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">📹 Vídeo</span>
                            }
                            {m.assignedTo && <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{m.assignedTo}</span>}
                          </div>
                          {m.notes && <div className="text-xs text-slate-400 mt-1 truncate">{m.notes}</div>}
                        </div>
                        {/* Right: visto + actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleToggleMatchStatus(m)}
                            aria-label={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
                            className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
                              isVisto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300'
                            }`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2.5,8 6,11.5 13.5,4" />
                            </svg>
                          </button>
                          <button onClick={() => openEditMatch(m)} aria-label="Editar partido" className="p-3 -m-1 text-slate-400 hover:text-blue-500">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Linked players */}
                      {linkedPlayers.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {linkedPlayers.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-0.5 rounded-full">
                              {p.fullName}
                              <button
                                onClick={() => onRemoveMatchPlayer(m.id, p.id).catch(() => showToast('Error al desvincular el jugador del partido', 'error'))}
                                aria-label={`Desvincular a ${p.fullName}`}
                                className="text-violet-400 hover:text-red-500 ml-0.5 p-1.5 -m-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Desktop table (hidden on mobile) ── */}
              <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                        <th className="text-left px-3 py-2.5 font-semibold w-[88px]">Fecha</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Local</th>
                        <th className="text-center px-2 py-2.5 font-semibold w-6">vs</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Visitante</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Competición</th>
                        <th className="text-left px-3 py-2.5 font-semibold w-[90px]">Modo</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Scout</th>
                        <th className="text-left px-3 py-2.5 font-semibold w-14">Vistos</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Notas</th>
                        <th className="text-center px-3 py-2.5 font-semibold w-12">Visto</th>
                        <th className="px-3 py-2.5 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMatches.map(m => {
                        const scoutName = personaToName(m.assignedTo, profiles)
                        const linkedPlayerIds = matchPlayersByMatchId[m.id] ?? []
                        return (
                          <MatchRow
                            key={m.id}
                            match={m}
                            scoutName={scoutName}
                            profiles={profiles}
                            currentProfile={currentProfile}
                            isAdmin={isAdmin}
                            scoutingPlayers={scoutingPlayers}
                            linkedPlayerIds={linkedPlayerIds}
                            scoutingReports={scoutingReports}
                            allMatches={scoutingMatches}
                            matchPlayersByMatchId={matchPlayersByMatchId}
                            onEdit={openEditMatch}
                            onDelete={handleDeleteMatch}
                            onToggleStatus={handleToggleMatchStatus}
                            onAssign={handleAssignMatch}
                            onAddMatchPlayer={onAddMatchPlayer}
                            onRemoveMatchPlayer={onRemoveMatchPlayer}
                            onAddReport={onAddReport}
                            onOpenPlayer={id => setPanelPlayerId(id)}
                            showToast={showToast}
                          />
                        )
                      })}
                      {filteredMatches.length === 0 && (
                        <tr>
                          <td colSpan={10} className="text-center py-10 text-slate-400 text-sm">
                            No hay partidos que coincidan con los filtros
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BOULEMA TAB ──────────────────────────────────────── */}
      {captTab === 'boulema' && (() => {
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
                                  onClick={() => { setCaptTab('jugadores'); const pl = scoutingPlayers.find(x => x.id === report.playerId); if (pl) setPanelPlayerId(pl.id) }}
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

      {/* ── Side panel (persists across tabs) ─────────────────── */}
      {hasPanel && (
        <>
          {!fullscreen && (
            <div
              className="fixed inset-x-0 bottom-0 bg-black/20 z-30"
              style={{ top: headerHeight }}
              onClick={closePanel}
            />
          )}

          <div
            className={
              fullscreen
                ? 'fixed inset-x-0 z-40 flex flex-col bg-white overflow-hidden'
                : 'fixed right-0 w-full sm:w-[480px] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200'
            }
            style={{
              top: headerHeight,
              height: `calc(100vh - ${headerHeight}px)`,
            }}
          >
            {/* Panel header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
              <div className="flex-1 min-w-0">
                {panelPlayer && !showEditPlayer && (
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 truncate">{panelPlayer.fullName}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <AssessmentChip a={panelPlayer.assessment} />
                      {panelPlayer.categoria && (
                        <span className="text-xs text-slate-500">{panelPlayer.categoria}</span>
                      )}
                    </div>
                  </div>
                )}
                {(showAddPlayer || showEditPlayer) && (
                  <h2 className="text-base font-semibold text-slate-800">
                    {showAddPlayer ? 'Nuevo jugador' : `Editar: ${editTarget?.fullName ?? ''}`}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {panelPlayer && !showEditPlayer && (
                  <button
                    onClick={() => setFullscreen(f => !f)}
                    className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title={fullscreen ? 'Minimizar' : 'Pantalla completa'}
                    aria-label={fullscreen ? 'Minimizar panel' : 'Pantalla completa'}
                  >
                    {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={closePanel} aria-label="Cerrar panel" className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className={`flex-1 overflow-y-auto ${fullscreen ? 'max-w-4xl mx-auto w-full' : ''} pb-14 sm:pb-0`}>

              {/* ── Add / Edit player form ── */}
              {(showAddPlayer || showEditPlayer) && (
                <div className="p-4 space-y-3">
                  <FormRow label="Nombre *">
                    <input
                      value={form.fullName}
                      onChange={e => {
                        const v = e.target.value
                        setForm(f => ({ ...f, fullName: v }))
                        if (playerNameError && isValidName(v)) setPlayerNameError('')
                      }}
                      className="field"
                      placeholder="Nombre completo"
                      aria-invalid={!!playerNameError}
                    />
                    {playerNameError && (
                      <p className="text-xs text-red-500 mt-1">{playerNameError}</p>
                    )}
                  </FormRow>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormRow label="Posición 1">
                      <select value={form.position1 ?? ''} onChange={e => setForm(f => ({ ...f, position1: e.target.value }))} className="field">
                        <option value="">—</option>
                        {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                      </select>
                    </FormRow>
                    <FormRow label="Posición 2">
                      <select value={form.position2 ?? ''} onChange={e => setForm(f => ({ ...f, position2: e.target.value }))} className="field">
                        <option value="">—</option>
                        {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                      </select>
                    </FormRow>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormRow label="Fecha nac.">
                      <input type="date" value={form.birthdate ?? ''} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))}
                        className="field" />
                    </FormRow>
                    <FormRow label="Pie">
                      <select value={form.foot ?? ''} onChange={e => setForm(f => ({ ...f, foot: e.target.value }))} className="field">
                        <option value="">—</option>
                        <option>Derecho</option><option>Izquierdo</option><option>Ambidiestro</option>
                      </select>
                    </FormRow>
                  </div>
                  <FormRow label="Equipo">
                    <input value={form.team ?? ''} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                      className="field" placeholder="Club actual" />
                  </FormRow>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormRow label="Categoría">
                      <input value={form.categoria ?? ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                        className="field" placeholder="Primera, Sub-18..." />
                    </FormRow>
                    <FormRow label="Nac.">
                      <input value={form.nationality ?? ''} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                        className="field" placeholder="Española..." />
                    </FormRow>
                  </div>
                  <FormRow label="Assessment">
                    <select value={form.assessment ?? ''} onChange={e => setForm(f => ({ ...f, assessment: (e.target.value as ScoutingAssessment) || undefined }))} className="field">
                      <option value="">Sin valorar</option>
                      {ALL_ASSESSMENTS.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="Agencia">
                    <input value={form.agency ?? ''} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))}
                      className="field" placeholder="Representante..." />
                  </FormRow>
                  <FormRow label="Contrato club">
                    <input value={form.clubContract ?? ''} onChange={e => setForm(f => ({ ...f, clubContract: e.target.value }))}
                      className="field" placeholder="30/06/2026" />
                  </FormRow>
                  <FormRow label="Contacto">
                    <input value={form.contacto ?? ''} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                      className="field" placeholder="Email / teléfono" />
                  </FormRow>
                  <FormRow label="Comentarios">
                    <textarea value={form.comentarios ?? ''} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))}
                      rows={3} className="field resize-none" placeholder="Notas generales..." />
                  </FormRow>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => { setShowAddPlayer(false); setShowEditPlayer(false) }}
                      className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSavePlayer}
                      disabled={!form.fullName.trim() || savingPlayer}
                      className="flex-1 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      {savingPlayer && <Spinner />}
                      {savingPlayer ? 'Guardando…' : showEditPlayer ? 'Guardar cambios' : 'Crear jugador'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Player detail ── */}
              {panelPlayer && !showEditPlayer && (
                <div className={`p-4 space-y-5 ${fullscreen ? 'grid grid-cols-1 sm:grid-cols-2 gap-6 items-start' : ''}`}>
                  <div className="space-y-4">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <InfoItem label="Posición" value={[panelPlayer.position1, panelPlayer.position2].filter(Boolean).join(' / ') || '—'} />
                      <InfoItem label="Año nac." value={birthYearFromBirthdate(panelPlayer.birthdate)} />
                      <InfoItem label="Equipo" value={panelPlayer.team ?? '—'} />
                      <InfoItem label="Categoría" value={panelPlayer.categoria ?? '—'} />
                      <InfoItem label="Pie" value={panelPlayer.foot ?? '—'} />
                      <InfoItem label="Nac." value={panelPlayer.nationality ?? '—'} />
                      {panelPlayer.clubContract && <InfoItem label="Contrato" value={panelPlayer.clubContract} />}
                      {panelPlayer.agency && <InfoItem label="Agencia" value={panelPlayer.agency} />}
                    </div>

                    {panelPlayer.contacto && (
                      <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-700">
                        <span className="font-medium text-slate-500 mr-1">Contacto:</span>
                        {panelPlayer.contacto}
                      </div>
                    )}

                    {panelPlayer.comentarios && (
                      <div className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-slate-700 leading-relaxed">
                        <div className="text-[11px] font-semibold text-amber-600 uppercase mb-1">Comentarios</div>
                        {panelPlayer.comentarios}
                      </div>
                    )}

                    {/* Quick assessment — available to all users */}
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Assessment</div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleQuickAssessment(panelPlayer, undefined)}
                          className={`px-2 py-1.5 sm:py-1 text-[11px] font-medium rounded border transition-colors ${
                            !panelPlayer.assessment ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          Sin valorar
                        </button>
                        {ALL_ASSESSMENTS.map(a => {
                          const cfg = ASSESSMENT_CONFIG[a]
                          const active = panelPlayer.assessment === a
                          return (
                            <button
                              key={a}
                              onClick={() => handleQuickAssessment(panelPlayer, a)}
                              className={`px-2 py-1.5 sm:py-1 text-[11px] font-medium rounded border transition-colors ${
                                active ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              {a}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditPlayer(panelPlayer)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        Editar jugador
                      </button>
                      {isAdmin && (
                        confirmDeletePlayer ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-600">¿Eliminar?</span>
                            <button onClick={handleDeletePlayer} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg font-medium">Sí</button>
                            <button onClick={() => setConfirmDeletePlayer(false)} className="px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-600">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePlayer(true)}
                            aria-label="Eliminar jugador"
                            className="p-2.5 sm:p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-red-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Reports section */}
                  <div className="space-y-4">
                    <div className="border-t border-slate-100 md:hidden" />
                    <div>
                      {/* Header informes + botón añadir */}
                      {(() => {
                        // Matches sorted: player's team first, then rest by date
                        const playerTeam = panelPlayer?.team?.toLowerCase() ?? ''
                        const sortedMatches = [...scoutingMatches].sort((a, b) => {
                          const aMatch = playerTeam && (a.homeTeam.toLowerCase().includes(playerTeam) || a.awayTeam.toLowerCase().includes(playerTeam))
                          const bMatch = playerTeam && (b.homeTeam.toLowerCase().includes(playerTeam) || b.awayTeam.toLowerCase().includes(playerTeam))
                          if (aMatch && !bMatch) return -1
                          if (!aMatch && bMatch) return 1
                          return 0
                        })

                        return (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-slate-400" />
                                Informes
                                {panelReports.length > 0 && (
                                  <span className="ml-1 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{panelReports.length}</span>
                                )}
                              </h3>
                              <button
                                onClick={() => {
                                  setReportTitle(''); setReportText(''); setReportConclusion(''); setReportMatchId('')
                                  // toggle: if form already open close it
                                  setShowAddReportForm(f => !f)
                                }}
                                className="flex items-center gap-1 px-2.5 py-2 sm:py-1 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Añadir informe
                              </button>
                            </div>

                            {/* Add report form — shown at top when open */}
                            {showAddReportForm && (
                              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 mb-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-blue-700">Nuevo informe</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono bg-white border border-blue-200 px-1.5 py-0.5 rounded text-slate-600">
                                      {currentProfile.avatar} · {currentProfile.name.split(' ')[0]}
                                    </span>
                                    <button onClick={() => setShowAddReportForm(false)} aria-label="Cerrar formulario de informe" className="text-slate-400 hover:text-slate-600 p-2 -m-2 sm:p-0 sm:m-0"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                                <input
                                  value={reportTitle}
                                  onChange={e => setReportTitle(e.target.value)}
                                  placeholder="Título (opcional)"
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <textarea
                                  value={reportText}
                                  onChange={e => setReportText(e.target.value)}
                                  rows={4}
                                  placeholder="Texto del informe..."
                                  autoFocus
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                                  onKeyDown={e => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddReport() }
                                  }}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <select
                                    value={reportConclusion}
                                    onChange={e => setReportConclusion(e.target.value as ConclusionOption)}
                                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                  >
                                    <option value="">Sin conclusión</option>
                                    {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  {/* Searchable match selector */}
                                  <div className="relative">
                                    <input
                                      value={reportMatchId
                                        ? (() => { const m = scoutingMatches.find(x => x.id === reportMatchId); return m ? `${m.homeTeam} vs ${m.awayTeam}` : '' })()
                                        : matchSearchInput}
                                      onChange={e => { setMatchSearchInput(e.target.value); setReportMatchId('') }}
                                      onFocus={() => setMatchSearchOpen(true)}
                                      onBlur={() => setTimeout(() => setMatchSearchOpen(false), 150)}
                                      placeholder="🏟 Partido (buscar equipo...)"
                                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    />
                                    {matchSearchOpen && (
                                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        <button
                                          onMouseDown={() => { setReportMatchId(''); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
                                        >
                                          Sin partido vinculado
                                        </button>
                                        {sortedMatches
                                          .filter(m => {
                                            const q = matchSearchInput.toLowerCase()
                                            return !q || m.homeTeam.toLowerCase().includes(q) || m.awayTeam.toLowerCase().includes(q) || (m.competition ?? '').toLowerCase().includes(q)
                                          })
                                          .slice(0, 40)
                                          .map(m => {
                                            const d = `${m.date.slice(8)} ${MONTHS_ES[parseInt(m.date.slice(5,7))-1]} '${m.date.slice(2,4)}`
                                            const isPlayerTeam = playerTeam && (m.homeTeam.toLowerCase().includes(playerTeam) || m.awayTeam.toLowerCase().includes(playerTeam))
                                            return (
                                              <button
                                                key={m.id}
                                                onMouseDown={() => { setReportMatchId(m.id); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 ${isPlayerTeam ? 'bg-violet-50/60' : ''}`}
                                              >
                                                {isPlayerTeam && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                                                <span className="font-medium text-slate-700">{m.homeTeam} vs {m.awayTeam}</span>
                                                <span className="text-slate-400 ml-auto flex-shrink-0">{d}</span>
                                              </button>
                                            )
                                          })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-slate-400">⌘+Enter para guardar</span>
                                  <button
                                    onClick={handleAddReport}
                                    disabled={!reportText.trim() || savingReport}
                                    className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                  >
                                    {savingReport && <Spinner />}
                                    {savingReport ? 'Guardando…' : 'Guardar informe'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}

                      <div className="space-y-3">
                        {panelReports.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Sin informes todavía.</p>
                        ) : panelReports.map(r => {
                          const linkedMatch = r.matchId ? scoutingMatches.find(m => m.id === r.matchId) : undefined
                          const matchLabel = linkedMatch
                            ? `${linkedMatch.homeTeam} vs ${linkedMatch.awayTeam} · ${linkedMatch.date.slice(8)} ${MONTHS_ES[parseInt(linkedMatch.date.slice(5,7))-1]} '${linkedMatch.date.slice(2,4)}`
                            : undefined
                          return (
                            <ReportCard
                              key={r.id}
                              report={r}
                              profiles={profiles}
                              currentProfile={currentProfile}
                              confirmDeleteId={confirmDeleteReport}
                              onConfirmDelete={setConfirmDeleteReport}
                              onDelete={handleDeleteReport}
                              onUpdate={handleUpdateReport}
                              matchLabel={matchLabel}
                              showToast={showToast}
                              onEditingChange={handleReportEditingChange}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {/* ── Partidos vistos ── */}
                    {(() => {
                      if (!panelPlayerId) return null
                      const playerMatchIds = matchPlayers
                        .filter(mp => mp.playerId === panelPlayerId)
                        .map(mp => mp.matchId)
                      if (playerMatchIds.length === 0) return null
                      const playerMatchList = scoutingMatches
                        .filter(m => playerMatchIds.includes(m.id))
                        .sort((a, b) => b.date.localeCompare(a.date))
                      return (
                        <div className="border-t border-slate-100 pt-4 mt-2">
                          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                            <ClipboardList className="w-4 h-4 text-slate-400" />
                            Partidos vistos
                            <span className="ml-1 text-xs bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-semibold">{playerMatchList.length}</span>
                          </h3>
                          <div className="space-y-1.5">
                            {playerMatchList.map(m => {
                              const d = `${m.date.slice(8)} ${MONTHS_ES[parseInt(m.date.slice(5,7))-1]} '${m.date.slice(2,4)}`
                              return (
                                <div key={m.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 group">
                                  <span className="text-[11px] text-slate-400 font-mono flex-shrink-0 w-20">{d}</span>
                                  <span className="text-xs text-slate-700 font-medium flex-1 min-w-0 truncate">
                                    {m.homeTeam} <span className="text-slate-400 font-normal">vs</span> {m.awayTeam}
                                  </span>
                                  {m.competition && (
                                    <span className="text-[11px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{m.competition}</span>
                                  )}
                                  {m.viewMode === 'campo'
                                    ? <span className="text-[11px] text-emerald-600 flex-shrink-0">🏟</span>
                                    : <span className="text-[11px] text-blue-500 flex-shrink-0">📹</span>
                                  }
                                  <button
                                    onClick={() => onRemoveMatchPlayer(m.id, panelPlayerId).catch(() => showToast('Error al desvincular del partido', 'error'))}
                                    className="sm:opacity-0 sm:group-hover:opacity-100 p-2 -m-1.5 sm:p-0 sm:m-0 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity"
                                    title="Desvincular de este partido"
                                    aria-label="Desvincular de este partido"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky close bar — mobile only */}
            {!fullscreen && (
              <div className="sm:hidden flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-white safe-area-bottom">
                <button
                  onClick={closePanel}
                  className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Toasts globales de la vista */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <style>{`
        .field {
          width: 100%;
          padding: 6px 10px;
          font-size: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: white;
          outline: none;
        }
        .field:focus {
          border-color: #93c5fd;
          box-shadow: 0 0 0 3px rgba(147,197,253,0.2);
        }
        select.field { cursor: pointer; }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}
