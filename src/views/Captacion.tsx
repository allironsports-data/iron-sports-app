import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, ChevronDown,
  FileText, Calendar, ChevronRight,
  TrendingUp, Eye, Maximize2, Minimize2, Pencil,
  ClipboardList, Users, Inbox, Send, Target, Sun,
  PenLine, MapPin, MessageSquare, ExternalLink, LayoutGrid,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, ScoutingMatchPlayer, FirmasEntry, FirmasStatus, FirmasComment } from '../types'
import type { Profile } from '../contexts/AuthContext'
import * as db from '../lib/db'
import { ConfirmModal } from '../components/ConfirmModal'
import { ScoutingTable } from './ScoutingTable'
import { ToastStack } from '../components/ToastStack'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useDebounce } from '../hooks/useDebounce'
import { isValidName } from '../lib/validate'

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info') => void

// ── Constants ────────────────────────────────────────────────

type CaptacionTab = 'jugadores' | 'firmar' | 'conclusiones' | 'informes' | 'partidos' | 'pretemporada'

const ASSESSMENT_CONFIG: Record<ScoutingAssessment, { label: string; bg: string; text: string; border: string }> = {
  Llamar:     { label: 'Llamar',     bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  Seguir:     { label: 'Seguir',     bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  Decidir:    { label: 'Decidir',    bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
  Basque:     { label: 'Basque',     bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
  Visto:      { label: 'Visto',      bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200' },
  Descartado: { label: 'Descartado', bg: 'bg-red-100',     text: 'text-red-600',     border: 'border-red-200' },
}

const ALL_ASSESSMENTS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir', 'Basque', 'Visto', 'Descartado']

// Punto de color sólido para indicar estado en tablas compactas (más legible que el bg pastel de ASSESSMENT_CONFIG)
const ASSESSMENT_DOT: Record<ScoutingAssessment, string> = {
  Llamar: 'bg-amber-500', Seguir: 'bg-blue-500', Decidir: 'bg-orange-500',
  Basque: 'bg-violet-500', Visto: 'bg-slate-400', Descartado: 'bg-red-500',
}

// Pretemporada: solo interesan jugadores nacidos en este año o después
const PRETEMPORADA_MIN_BIRTH_YEAR = 2002

// Estilo compartido para los selectores de filtro (look sobrio: sin globos/chips)
const SELECT_CLS = "text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 hover:border-slate-300 transition-colors"

const POSITIONS_SCOUTING = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

const CONCLUSION_OPTIONS = ['', 'Seguir', 'Llamar', 'Descartar'] as const
type ConclusionOption = typeof CONCLUSION_OPTIONS[number]

// «Firmar» se unificó con «Llamar» (ver migration_merge_firmar_llamar.sql).
// Este helper normaliza registros que aún no hayan pasado por la migración.
function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

const CONCLUSION_STYLE: Record<string, string> = {
  Seguir:    'bg-blue-100 text-blue-700 border border-blue-200',
  Llamar:    'bg-amber-100 text-amber-700 border border-amber-200',
  Descartar: 'bg-red-100 text-red-600 border border-red-200',
  // legado — por si hay registros antiguos sin migrar
  Firmar:    'bg-amber-100 text-amber-700 border border-amber-200',
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

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Partido de hoy en adelante = aún no ha podido jugarse
function isFutureMatch(dateStr: string): boolean {
  return dateStr >= todayISO()
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
    (CONCLUSION_OPTIONS as readonly string[]).includes(normConclusion(report.conclusion) ?? '') ? (normConclusion(report.conclusion) ?? '') as ConclusionOption : ''
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
            {normConclusion(report.conclusion) && (
              <span className={`px-1.5 py-0.5 rounded font-medium text-[11px] ${CONCLUSION_STYLE[normConclusion(report.conclusion)!] ?? 'bg-slate-100 text-slate-600'}`}>
                {normConclusion(report.conclusion)}
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
  const isFuture = isFutureMatch(match.date)

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
      <tr className={`transition-colors ${
        isPendingForMe ? 'bg-amber-50/60 hover:bg-amber-50' :
        isFuture ? 'bg-blue-50/40 hover:bg-blue-50/70' :
        'hover:bg-slate-50/60'
      }`}>
        {/* Fecha */}
        <td className={`px-3 py-2 text-xs whitespace-nowrap ${isFuture ? 'text-blue-600 font-semibold' : 'text-slate-500'}`}>
          {day} {mon} '{yr}
          {match.time && <span className={`block text-[11px] font-normal ${isFuture ? 'text-blue-500' : 'text-slate-400'}`}>{match.time}</span>}
        </td>
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
                            {normConclusion(pReports[0].conclusion) && (
                              <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${CONCLUSION_STYLE[normConclusion(pReports[0].conclusion)!] ?? 'bg-slate-100 text-slate-500'}`}>
                                {normConclusion(pReports[0].conclusion)}
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

function ConclusionesTab({ players, reports, threshold, onThresholdChange, isAdmin, onSetCandidateSeen, onOpenPlayer }: {
  players: ScoutingPlayer[]
  reports: ScoutingReport[]
  threshold: number
  onThresholdChange: (n: number) => void
  isAdmin: boolean
  onSetCandidateSeen: (p: ScoutingPlayer, seenCount?: number) => Promise<void>
  onOpenPlayer: (id: string) => void
}) {
  const [mapAssessment, setMapAssessment] = useState<ScoutingAssessment>('Llamar')
  const [showHidden, setShowHidden] = useState(false)
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
  // Cuenta solo los informes (con «Firmar» legado normalizado a «Llamar»):
  // cualquier jugador con N+ informes «Llamar» aparece aquí,
  // independientemente de su etiqueta actual.
  const candidates = useMemo(() => {
    return players
      .map(p => {
        const rs = reportsByPlayer[p.id] ?? []
        const positive = rs.filter(r => normConclusion(r.conclusion) === 'Llamar')
        if (positive.length < threshold) return null
        const byConclusion: Record<string, number> = {}
        rs.forEach(r => {
          const c = normConclusion(r.conclusion)
          if (c) byConclusion[c] = (byConclusion[c] ?? 0) + 1
        })
        return {
          p,
          llamarCount: positive.length,
          byConclusion,
          lastReport: rs[0],
          lastLlamarDate: positive[0]?.fecha ?? positive[0]?.createdAt,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.lastLlamarDate ?? '').localeCompare(a!.lastLlamarDate ?? '')) as {
        p: ScoutingPlayer; llamarCount: number; byConclusion: Record<string, number>
        lastReport?: ScoutingReport; lastLlamarDate?: string
      }[]
  }, [players, reportsByPlayer, threshold])

  // Bandeja: "nuevos" (sin ocultar, o con informes nuevos desde que se
  // ocultaron) vs "ocultados" (revisados por un admin)
  const isNewCandidate = (c: { p: ScoutingPlayer; llamarCount: number }) =>
    c.p.candidateSeenCount == null || c.llamarCount > c.p.candidateSeenCount
  const newCandidates = candidates.filter(isNewCandidate)
  const hiddenCandidates = candidates.filter(c => !isNewCandidate(c))

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
      const conc = normConclusion(r.conclusion)
      if (conc !== 'Llamar') return
      const d = r.fecha ?? r.createdAt
      if (nowMs - Date.parse(d) > D21) return
      const p = players.find(pl => pl.id === r.playerId)
      if (!p) return
      const nth = (reportsByPlayer[p.id] ?? []).filter(x =>
        normConclusion(x.conclusion) === conc && (x.fecha ?? x.createdAt) <= d
      ).length
      items.push({
        date: d,
        node: (
          <span>
            Informe de <span className="font-mono font-semibold">{r.persona ?? '—'}</span> sobre{' '}
            <button onClick={() => onOpenPlayer(p.id)} className="font-semibold text-slate-800 hover:text-primary">{p.fullName}</button>
            {' '}concluye <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${CONCLUSION_STYLE[conc] ?? ''}`}>{conc}</span>
            {nth > 1 && <span className="text-slate-400 text-[11px]"> ({nth}º en {conc})</span>}
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

  const segBtn = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${active ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="space-y-4">
      {/* ── a) Candidatos a Llamar — bandeja de alertas ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">🔔 Candidatos a Llamar</h3>
          {newCandidates.length > 0 && (
            <span className="text-xs bg-amber-400 text-amber-950 rounded-full px-2 py-0.5 font-bold">{newCandidates.length} nuevo{newCandidates.length !== 1 ? 's' : ''}</span>
          )}
          <span className="text-[11px] text-slate-400 hidden sm:inline">jugadores con {threshold}+ informes «Llamar», sea cual sea su etiqueta</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Umbral</span>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => onThresholdChange(n)} className={segBtn(threshold === n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {(() => {
          const row = (c: typeof candidates[number], hidden: boolean) => {
            const { p, llamarCount, lastReport } = c
            const delta = p.candidateSeenCount != null ? llamarCount - p.candidateSeenCount : null
            const lastDate = lastReport ? (lastReport.fecha ?? lastReport.createdAt) : undefined
            return (
              <div
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                title={lastReport?.texto ? `Último informe (${lastReport.persona ?? '—'}): ${lastReport.texto}` : undefined}
                className={`flex items-center gap-2 px-4 py-2 border-b border-slate-50 last:border-b-0 cursor-pointer transition-colors ${
                  hidden ? 'opacity-60 hover:opacity-90 hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50'
                }`}
              >
                <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">{p.fullName}</span>
                <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                  {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                </span>
                <AssessmentChip a={p.assessment} small />
                <span className="flex-1" />
                <span className="text-[10px] font-extrabold bg-amber-500 text-white rounded-full px-2 py-0.5 whitespace-nowrap">
                  {llamarCount}× Llamar
                </span>
                {!hidden && delta != null && delta > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                    +{delta} desde ocultado
                  </span>
                )}
                {lastDate && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap hidden md:inline">
                    últ. {lastReport?.persona ?? '—'} · {relativeDate(lastDate) || fmtDate(lastDate)}
                  </span>
                )}
                {isAdmin && (
                  hidden ? (
                    <button
                      onClick={e => { e.stopPropagation(); onSetCandidateSeen(p, undefined) }}
                      className="text-[10px] font-semibold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 hover:bg-white hover:text-slate-700 transition-colors"
                    >
                      Restaurar
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onSetCandidateSeen(p, llamarCount) }}
                      title="Ocultar de la bandeja (reaparece si suma informes nuevos)"
                      aria-label={`Ocultar a ${p.fullName}`}
                      className="text-slate-300 hover:text-slate-600 p-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            )
          }

          return (
            <>
              {newCandidates.length === 0 ? (
                <p className="text-xs text-slate-400 italic px-4 py-4">
                  Sin candidatos nuevos — todo revisado. Los ocultados reaparecen si suman informes «Llamar» nuevos.
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {newCandidates.map(c => row(c, false))}
                </div>
              )}
              {hiddenCandidates.length > 0 && (
                <div className="border-t border-slate-100">
                  <button
                    onClick={() => setShowHidden(v => !v)}
                    className="w-full text-left px-4 py-2 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showHidden ? '▴ Ocultar revisados' : `▾ Ver revisados (${hiddenCandidates.length})`}
                  </button>
                  {showHidden && (
                    <div className="max-h-[240px] overflow-y-auto border-t border-slate-50">
                      {hiddenCandidates.map(c => row(c, true))}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
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
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Generación</span>
              <select value={genFilter} onChange={e => setGenFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todas</option>
                {pitchGens.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
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

// ── CAPTACIÓN · FIRMAR (pipeline de firmas, ex-Trello) ───────
// Segunda parte de Captación: conseguir que el jugador firme.
// Jugadores por zona geográfica y estatus de contacto, con encargados,
// historial de contactos tipados, próxima acción, semáforo de
// desatención y avisos cruzados con el resto de la app.

const FIRMAS_STATUSES: FirmasStatus[] = ['llamar', 'caliente', 'templado', 'frio', 'decidir', 'firmado']

const FIRMAS_CONFIG: Record<FirmasStatus, { label: string; dot: string; bg: string; text: string; border: string; col: string }> = {
  llamar:   { label: 'Llamar',   dot: 'bg-amber-500',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  col: 'border-t-amber-400' },
  caliente: { label: 'Caliente', dot: 'bg-red-500',    bg: 'bg-red-100',    text: 'text-red-600',    border: 'border-red-200',    col: 'border-t-red-400' },
  templado: { label: 'Templado', dot: 'bg-yellow-500', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', col: 'border-t-yellow-400' },
  frio:     { label: 'Frío',     dot: 'bg-sky-500',    bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200',    col: 'border-t-sky-400' },
  decidir:  { label: 'Decidir',  dot: 'bg-violet-500', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', col: 'border-t-violet-400' },
  firmado:  { label: 'Firmado',  dot: 'bg-green-500',  bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  col: 'border-t-green-500' },
}

// Cadencia máxima de actualización por estatus (días). Superarla = desatendido.
// (Pedido por Pablo: caliente cada 10 días, templado cada 50, frío cada 90.)
const FIRMAS_AGING_DAYS: Partial<Record<FirmasStatus, number>> = { caliente: 10, templado: 50, frio: 90 }

// Tipos de apunte del historial (bajo esfuerzo: un toque para elegir tipo)
const FIRMAS_KIND_META: Record<string, { icon: string; label: string }> = {
  nota:     { icon: '📝', label: 'Nota' },
  llamada:  { icon: '📞', label: 'Llamada' },
  whatsapp: { icon: '💬', label: 'WhatsApp' },
  reunion:  { icon: '🤝', label: 'Reunión' },
  entorno:  { icon: '👪', label: 'Entorno' },
}

// Orden canónico de zonas (las del Trello); las nuevas van después, alfabéticas
const FIRMAS_ZONE_ORDER = [
  'Valencia',
  'Andalucia / Murcia',
  'Catalunya / Aragon / Baleares / Canarias',
  'Madrid',
  'CyL/Cantabria/Asturias',
  'Cantabria/Galicia/Euskadi',
  'Europa/Resto Mundo',
]

function normSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Última vez que una entrada se "tocó" (cualquier edición, comentario o cambio de estatus)
function firmasLastTouch(e: FirmasEntry): string {
  const candidates = [e.updatedAt, e.statusUpdatedAt, e.createdAt, ...e.comments.map(c => c.date)].filter(Boolean) as string[]
  return candidates.sort().pop() ?? e.createdAt
}

function daysSinceISO(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

/** Semáforo de desatención: null si el estatus no tiene cadencia */
function firmasAging(e: FirmasEntry): { days: number; limit: number; overdue: boolean; warn: boolean } | null {
  const limit = FIRMAS_AGING_DAYS[e.status]
  if (!limit) return null
  const days = daysSinceISO(firmasLastTouch(e))
  return { days, limit, overdue: days > limit, warn: days > limit * 0.7 && days <= limit }
}

// Chip de estatus con desplegable para cambiarlo inline
function FirmasStatusChip({ status, onChange, size = 'sm' }: {
  status: FirmasStatus
  onChange: (s: FirmasStatus) => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const cfg = FIRMAS_CONFIG[status]
  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors ${cfg.bg} ${cfg.text} ${cfg.border} ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[130px]">
            {FIRMAS_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { setOpen(false); if (s !== status) onChange(s) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 ${s === status ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
              >
                <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                {FIRMAS_CONFIG[s].label}
                {s === 'firmado' && <span className="ml-auto">🎉</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Avatares de encargados (iniciales)
function FirmasManagers({ managerIds, profiles, max = 3 }: { managerIds: string[]; profiles: Profile[]; max?: number }) {
  const mgrs = managerIds.map(id => profiles.find(p => p.id === id)).filter(Boolean) as Profile[]
  if (mgrs.length === 0) return null
  return (
    <span className="inline-flex items-center -space-x-1">
      {mgrs.slice(0, max).map(p => {
        const c = scoutColor(p.avatar || p.name)
        return (
          <span
            key={p.id}
            title={p.name}
            className={`w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8.5px] font-bold ${c.bg} ${c.text}`}
          >
            {(p.avatar || p.name.slice(0, 2)).slice(0, 3).toUpperCase()}
          </span>
        )
      })}
      {mgrs.length > max && (
        <span className="w-5 h-5 rounded-full border border-white bg-slate-100 text-slate-500 flex items-center justify-center text-[8.5px] font-bold">
          +{mgrs.length - max}
        </span>
      )}
    </span>
  )
}

// Buscador de jugador de scouting para vincular
function FirmasLinkSearch({ scoutingPlayers, onSelect, placeholder }: {
  scoutingPlayers: ScoutingPlayer[]
  onSelect: (p: ScoutingPlayer) => void
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const n = normSearch(q)
    if (n.length < 2) return []
    return scoutingPlayers
      .filter(p => normSearch(p.fullName).includes(n) || (p.team && normSearch(p.team).includes(n)))
      .slice(0, 8)
  }, [q, scoutingPlayers])
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder ?? 'Buscar en jugadores de Captación…'}
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setQ('') }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
            >
              <span className="text-xs font-medium text-slate-800">{p.fullName}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">
                {[p.team, p.birthdate ? p.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Ficha rápida al pasar el ratón por una tarjeta (solo dispositivos con hover)
function FirmasHoverCard({ entry, sp, reports, profiles, pos }: {
  entry: FirmasEntry
  sp?: ScoutingPlayer
  reports: ScoutingReport[]
  profiles: Profile[]
  pos: { x: number; y: number }
}) {
  const lastReport = reports[0]
  const lastComment = [...entry.comments].reverse().find(c => c.kind !== 'estatus')
  const cfg = FIRMAS_CONFIG[entry.status]
  // clamp para no salirse de la ventana
  const left = Math.min(pos.x, window.innerWidth - 300)
  const top = Math.min(pos.y, window.innerHeight - 230)
  return (
    <div
      className="fixed z-[70] w-[280px] bg-white border border-slate-200 rounded-xl shadow-2xl p-3 pointer-events-none"
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 truncate">{sp?.fullName ?? entry.playerName}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {sp
              ? [sp.position1, sp.birthdate ? sp.birthdate.slice(0, 4) : null, sp.team].filter(Boolean).join(' · ')
              : entry.zone}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold flex-shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
        <span className="bg-slate-100 rounded px-1.5 py-0.5">{entry.zone}</span>
        {sp && (
          <span className="bg-slate-100 rounded px-1.5 py-0.5">
            {reports.length} informe{reports.length !== 1 ? 's' : ''}
            {lastReport?.conclusion ? ` · últ. "${normConclusion(lastReport.conclusion)}"` : ''}
          </span>
        )}
        {entry.nextActionDate && (
          <span className={`rounded px-1.5 py-0.5 ${entry.nextActionDate < todayISO() ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            📌 {entry.nextAction ?? 'Acción'} · {fmtDate(entry.nextActionDate)}
          </span>
        )}
      </div>
      {lastComment && (
        <div className="mt-2 bg-slate-50 rounded-lg px-2 py-1.5 text-[11px] text-slate-600">
          {FIRMAS_KIND_META[lastComment.kind ?? 'nota']?.icon} {lastComment.text.length > 90 ? lastComment.text.slice(0, 90) + '…' : lastComment.text}
          <span className="text-slate-400"> · {lastComment.author?.split(' ')[0]} · {relativeDate(lastComment.date) || fmtDate(lastComment.date)}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <FirmasManagers managerIds={entry.managers} profiles={profiles} />
        <span className="text-[10.5px] text-slate-400">clic para abrir el panel</span>
      </div>
    </div>
  )
}

function FirmasTab({
  entries, profiles, currentProfile, scoutingPlayers, scoutingReports, scoutingMatches,
  onCreate, onUpdate, onDelete, onOpenScoutingPlayer, showToast, headerHeight,
  openEntryId, onOpenEntryConsumed,
}: {
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  onCreate: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  onUpdate: (e: FirmasEntry) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onOpenScoutingPlayer: (id: string) => void
  showToast: ShowToast
  headerHeight: number
  openEntryId?: string | null
  onOpenEntryConsumed?: () => void
}) {
  // ── vista y filtros ──
  const [view, setView] = useState<'estatus' | 'zona' | 'encargado'>(
    () => (sessionStorage.getItem('capt_firmas_view') as 'estatus' | 'zona' | 'encargado') ?? 'estatus'
  )
  useEffect(() => { sessionStorage.setItem('capt_firmas_view', view) }, [view])

  const [search, setSearch] = useState('')
  const debSearch = useDebounce(search, 250)
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<FirmasStatus | 'all'>('all')
  const [managerFilter, setManagerFilter] = useState<string>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  // Vista por zonas: zona seleccionada (persistida)
  const [selZone, setSelZone] = useState<string>(() => sessionStorage.getItem('capt_firmas_zone') ?? '')
  useEffect(() => { if (selZone) sessionStorage.setItem('capt_firmas_zone', selZone) }, [selZone])

  // Renombrar una zona entera (actualiza todas sus entradas)
  const [renamingZone, setRenamingZone] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameZone = async (from: string) => {
    const v = renameValue.trim()
    setRenamingZone(false)
    if (!v || v === from) return
    const list = entries.filter(e => e.zone === from)
    try {
      for (const e of list) await onUpdate({ ...e, zone: v })
      setSelZone(v)
      showToast(`Zona «${from}» renombrada a «${v}» (${list.length} jugadores)`)
    } catch (err) {
      console.error(err)
      showToast('No se pudo renombrar la zona completa', 'error')
    }
  }

  // ── panel y modales ──
  const [panelId, setPanelId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<FirmasEntry | null>(null)
  const [showAlerts, setShowAlerts] = useState(false)

  // ── hover card (solo escritorio) ──
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  const panelEntry = entries.find(e => e.id === panelId) ?? null
  useEscapeKey(() => setPanelId(null), !!panelEntry && !confirmDelete)

  // Navegación externa (p. ej. desde el aviso del Dashboard)
  useEffect(() => {
    if (openEntryId) {
      setPanelId(openEntryId)
      onOpenEntryConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEntryId])

  const spById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    scoutingPlayers.forEach(p => { m[p.id] = p })
    return m
  }, [scoutingPlayers])

  const reportsByPlayer = useMemo(() => {
    const m: Record<string, ScoutingReport[]> = {}
    scoutingReports.forEach(r => { (m[r.playerId] ??= []).push(r) })
    Object.values(m).forEach(list => list.sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt)))
    return m
  }, [scoutingReports])

  // Zonas presentes, en orden canónico + extras alfabéticas
  const zones = useMemo(() => {
    const present = [...new Set(entries.map(e => e.zone))]
    const canonical = FIRMAS_ZONE_ORDER.filter(z => present.includes(z))
    const extra = present.filter(z => !FIRMAS_ZONE_ORDER.includes(z)).sort((a, b) => a.localeCompare(b))
    return [...canonical, ...extra]
  }, [entries])

  // Encargados presentes (para el filtro y la vista por encargado)
  const managerOptions = useMemo(() => {
    const ids = new Set(entries.flatMap(e => e.managers))
    return profiles.filter(p => ids.has(p.id))
  }, [entries, profiles])

  const matchesFilters = useCallback((e: FirmasEntry, ignoreZone = false) => {
    if (!ignoreZone && zoneFilter !== 'all' && e.zone !== zoneFilter) return false
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (managerFilter !== 'all' && !e.managers.includes(managerFilter)) return false
    if (overdueOnly && !firmasAging(e)?.overdue) return false
    const n = normSearch(debSearch)
    if (n) {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const hay = normSearch([e.playerName, sp?.fullName ?? '', sp?.team ?? ''].join(' '))
      if (!hay.includes(n)) return false
    }
    return true
  }, [zoneFilter, statusFilter, managerFilter, overdueOnly, debSearch, spById])

  const filtered = useMemo(() => entries.filter(e => matchesFilters(e)), [entries, matchesFilters])
  // Igual pero sin filtro de zona — alimenta el selector de zonas
  const filteredNoZone = useMemo(() => entries.filter(e => matchesFilters(e, true)), [entries, matchesFilters])

  const overdueCount = useMemo(() => entries.filter(e => firmasAging(e)?.overdue).length, [entries])

  // ── avisos cruzados con el resto de la app ──
  const alerts = useMemo(() => {
    const out: { icon: string; text: string; entryId: string; tone: 'blue' | 'green' | 'amber' | 'red' }[] = []
    const today = todayISO()
    const plus7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString()
    const in30 = Date.now() + 30 * 86400000
    const in180 = Date.now() + 180 * 86400000

    const active = entries.filter(e => e.status !== 'firmado')

    // partidos de Captación próximos (≤7 días) donde juega el equipo del jugador
    const upcoming = scoutingMatches.filter(m => m.date >= today && m.date <= plus7)
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.team) return
      const m = upcoming.find(m => teamsAlike(sp.team, m.homeTeam) || teamsAlike(sp.team, m.awayTeam))
      if (m) out.push({
        icon: '🏟️', tone: 'blue', entryId: e.id,
        text: `${e.playerName}: su equipo juega ${m.homeTeam} vs ${m.awayTeam} el ${fmtDate(m.date)}${m.assignedTo ? ` (lo ve ${m.assignedTo})` : ''}`,
      })
    })

    // informes nuevos (≤14 días) sobre jugadores del pipeline
    active.forEach(e => {
      if (!e.scoutingPlayerId) return
      const recent = (reportsByPlayer[e.scoutingPlayerId] ?? []).filter(r => (r.fecha ?? r.createdAt) >= since14)
      if (recent.length > 0) {
        const r = recent[0]
        out.push({
          icon: '📄', tone: 'green', entryId: e.id,
          text: `Informe nuevo de ${e.playerName}${r.persona ? ` (${r.persona})` : ''}${r.conclusion ? ` — conclusión: ${normConclusion(r.conclusion)}` : ''}`,
        })
      }
    })

    // cumpleaños próximos (≤30 días) — 16 y 18 destacados.
    // Se omiten las fechas placeholder AAAA-02-28 (solo se conocía el año).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.birthdate || sp.birthdate.endsWith('-02-28')) return
      const [by, bm, bd] = sp.birthdate.split('-').map(Number)
      const now = new Date()
      let next = new Date(now.getFullYear(), bm - 1, bd)
      if (next.getTime() < now.getTime() - 86400000) next = new Date(now.getFullYear() + 1, bm - 1, bd)
      if (next.getTime() > in30) return
      const turns = next.getFullYear() - by
      const key = turns === 16 || turns === 18
      out.push({
        icon: '🎂', tone: key ? 'amber' : 'blue', entryId: e.id,
        text: `${e.playerName} cumple ${turns} el ${fmtDate(next.toISOString())}${key ? ' — edad clave para firmar' : ''}`,
      })
    })

    // contrato de club que expira pronto (≤6 meses)
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.clubContract) return
      let d: Date | null = null
      const ddmmyyyy = sp.clubContract.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (ddmmyyyy) d = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1])
      else if (/^\d{4}-\d{2}-\d{2}/.test(sp.clubContract)) d = new Date(sp.clubContract)
      if (!d || isNaN(d.getTime())) return
      if (d.getTime() > Date.now() && d.getTime() <= in180) {
        out.push({ icon: '📃', tone: 'amber', entryId: e.id, text: `El contrato de club de ${e.playerName} acaba el ${fmtDate(d.toISOString())}` })
      }
    })

    // duplicados: mismo jugador de scouting en más de una entrada
    const byLink: Record<string, FirmasEntry[]> = {}
    entries.forEach(e => { if (e.scoutingPlayerId) (byLink[e.scoutingPlayerId] ??= []).push(e) })
    Object.values(byLink).filter(l => l.length > 1).forEach(l => {
      out.push({ icon: '👥', tone: 'red', entryId: l[0].id, text: `${l[0].playerName} está ${l.length} veces en el pipeline (${l.map(x => x.zone).join(' y ')})` })
    })

    return out.slice(0, 30)
  }, [entries, spById, scoutingMatches, reportsByPlayer])

  const patch = async (e: FirmasEntry, changes: Partial<FirmasEntry>) => {
    try {
      await onUpdate({ ...e, ...changes })
    } catch (err) {
      console.error(err)
      showToast('No se pudo guardar el cambio', 'error')
    }
  }

  const changeStatus = (e: FirmasEntry, s: FirmasStatus) => {
    const now = new Date().toISOString()
    // el cambio queda registrado en el historial automáticamente
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `${FIRMAS_CONFIG[e.status].label} → ${FIRMAS_CONFIG[s].label}`,
      date: now,
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind: 'estatus',
    }
    void patch(e, {
      status: s,
      statusUpdatedAt: now,
      signedAt: s === 'firmado' ? (e.signedAt ?? now) : e.signedAt,
      comments: [...e.comments, log],
    })
    showToast(s === 'firmado' ? `🎉 ${e.playerName} firmado` : `${e.playerName} → ${FIRMAS_CONFIG[s].label}`)
  }

  const clearFilters = () => { setSearch(''); setZoneFilter('all'); setStatusFilter('all'); setManagerFilter('all'); setOverdueOnly(false) }

  const startHover = (e: FirmasEntry, ev: React.MouseEvent) => {
    if (!canHover) return
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover({ id: e.id, x: rect.right + 8, y: rect.top }), 350)
  }
  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHover(null)
  }

  // ── tarjeta ──
  const card = (e: FirmasEntry, showStatusDot = false) => {
    const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
    const aging = firmasAging(e)
    const actionOverdue = !!e.nextActionDate && e.nextActionDate < todayISO() && e.status !== 'firmado'
    const actionToday = e.nextActionDate === todayISO()
    return (
      <button
        key={e.id}
        onClick={() => { endHover(); setPanelId(e.id) }}
        onMouseEnter={ev => startHover(e, ev)}
        onMouseLeave={endHover}
        className="w-full text-left bg-white border border-slate-200 rounded-lg px-2.5 py-2 hover:border-slate-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-xs font-semibold text-slate-800 leading-snug flex items-center gap-1.5 min-w-0">
            {showStatusDot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[e.status].dot}`} title={FIRMAS_CONFIG[e.status].label} />}
            <span className="truncate">{e.playerName}</span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {aging?.overdue && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title={`Desatendido: ${aging.days} días sin tocar (límite ${aging.limit})`} />
            )}
            {aging && !aging.overdue && aging.warn && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title={`${aging.days} días sin tocar (límite ${aging.limit})`} />
            )}
            <FirmasManagers managerIds={e.managers} profiles={profiles} />
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="truncate min-w-0">
            {sp
              ? [sp.team, sp.birthdate ? sp.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || e.zone
              : e.zone}
          </span>
          {e.nextActionDate && e.status !== 'firmado' && (
            <span
              className={`flex-shrink-0 font-medium ${actionOverdue ? 'text-red-500' : actionToday ? 'text-blue-600' : 'text-slate-400'}`}
              title={`${e.nextAction ?? 'Próxima acción'} · ${fmtDate(e.nextActionDate)}`}
            >
              📌 {actionOverdue ? 'vencida' : actionToday ? 'hoy' : new Date(e.nextActionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {e.comments.filter(c => c.kind !== 'estatus').length > 0 && (
            <span className="inline-flex items-center gap-0.5 flex-shrink-0">
              <MessageSquare className="w-3 h-3" />
              {e.comments.filter(c => c.kind !== 'estatus').length}
            </span>
          )}
        </div>
      </button>
    )
  }

  // Tablero de columnas por estatus (compartido por vistas estatus y zona)
  const statusBoard = (list: FirmasEntry[]) => {
    const groups: Record<FirmasStatus, FirmasEntry[]> = { llamar: [], caliente: [], templado: [], frio: [], decidir: [], firmado: [] }
    list.forEach(e => groups[e.status].push(e))
    FIRMAS_STATUSES.forEach(s => groups[s].sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)))
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {FIRMAS_STATUSES.map(s => (
          <div key={s} className={`flex-shrink-0 w-[240px] xl:w-auto bg-slate-50 border border-slate-200 border-t-2 ${FIRMAS_CONFIG[s].col} rounded-lg`}>
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{FIRMAS_CONFIG[s].label}</span>
              <span className="text-[11px] text-slate-400 font-medium">{groups[s].length}</span>
            </div>
            <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
              {groups[s].length === 0 ? (
                <div className="text-[11px] text-slate-400 text-center py-4">—</div>
              ) : groups[s].map(e => card(e))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const hoverEntry = hover ? entries.find(e => e.id === hover.id) : null

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Firmar</h2>
          <p className="text-xs text-slate-400">Captación activa: jugadores en proceso de conseguir la firma, por zona y estatus</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir jugador
        </button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<PenLine className="w-10 h-10" />}
          title="Aún no hay jugadores en el pipeline de firmas"
          subtitle="Si acabas de activar esta función, recuerda ejecutar la migración SQL en Supabase y el snippet de importación del Trello"
        />
      ) : (
        <>
          {/* Avisos cruzados */}
          {alerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAlerts(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-100/50 transition-colors"
              >
                <span className="text-sm">🔔</span>
                <span className="text-xs font-semibold text-amber-800">{alerts.length} aviso{alerts.length !== 1 ? 's' : ''}</span>
                <span className="hidden sm:inline text-[11px] text-amber-700/70 truncate">
                  {alerts.slice(0, 2).map(a => a.text.split(':')[0]).join(' · ')}{alerts.length > 2 ? ' · …' : ''}
                </span>
                <ChevronDown className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
              </button>
              {showAlerts && (
                <div className="border-t border-amber-200 divide-y divide-amber-100 max-h-64 overflow-y-auto">
                  {alerts.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => setPanelId(a.entryId)}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-amber-100/40 transition-colors"
                    >
                      <span className="flex-shrink-0">{a.icon}</span>
                      <span>{a.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filtros + toggle de vista */}
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[150px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar jugador, club..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {view === 'estatus' && (
              <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todas las zonas</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
            {view !== 'estatus' && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as FirmasStatus | 'all')} className={SELECT_CLS}>
                <option value="all">Todos los estatus</option>
                {FIRMAS_STATUSES.map(s => <option key={s} value={s}>{FIRMAS_CONFIG[s].label}</option>)}
              </select>
            )}
            {view !== 'encargado' && (
              <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todos los encargados</option>
                {managerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button
              onClick={() => setOverdueOnly(v => !v)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                overdueOnly ? 'bg-red-50 border-red-200 text-red-600 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              title="Desatendidos: caliente sin tocar +10 días, templado +50, frío +90"
            >
              ⚠ <span className="hidden sm:inline">Desatendidos</span> {overdueCount}
            </button>
            {(search || zoneFilter !== 'all' || statusFilter !== 'all' || managerFilter !== 'all' || overdueOnly) && (
              <button
                onClick={clearFilters}
                className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors"
              >
                Limpiar
              </button>
            )}
            <div className="ml-auto flex items-center rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView('estatus')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'estatus' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Estatus</span>
              </button>
              <button
                onClick={() => setView('zona')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'zona' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Zona</span>
              </button>
              <button
                onClick={() => setView('encargado')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'encargado' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Encargado</span>
              </button>
            </div>
          </div>

          {/* ── Vista por ESTATUS (tablero) ── */}
          {view === 'estatus' && statusBoard(filtered)}

          {/* ── Vista por ZONA: selector de zona + tablero de esa zona ── */}
          {view === 'zona' && (() => {
            const zonesAll = zones
            const activeZone = zonesAll.includes(selZone) ? selZone : (zonesAll[0] ?? '')
            const zoneEntries = filteredNoZone.filter(e => e.zone === activeZone)
            return (
              <div className="space-y-3">
                {/* Selector de zonas con resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {zonesAll.map(z => {
                    const zEntries = filteredNoZone.filter(e => e.zone === z)
                    const active = z === activeZone
                    return (
                      <button
                        key={z}
                        onClick={() => setSelZone(z)}
                        className={`text-left rounded-lg border px-3 py-2 transition-all ${
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold truncate ${active ? 'text-primary' : 'text-slate-700'}`}>{z}</span>
                          <span className={`text-xs font-bold flex-shrink-0 ${active ? 'text-primary' : 'text-slate-400'}`}>{zEntries.length}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {FIRMAS_STATUSES.map(s => {
                            const n = zEntries.filter(e => e.status === s).length
                            if (n === 0) return null
                            return (
                              <span key={s} className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-500" title={FIRMAS_CONFIG[s].label}>
                                <span className={`w-1.5 h-1.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                                {n}
                              </span>
                            )
                          })}
                          {zEntries.length === 0 && <span className="text-[10.5px] text-slate-300">sin jugadores</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Tablero de la zona seleccionada */}
                {activeZone ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {renamingZone ? (
                        <span className="flex items-center gap-1.5">
                          <input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void renameZone(activeZone); if (e.key === 'Escape') setRenamingZone(false) }}
                            autoFocus
                            className="text-xs font-bold text-slate-700 border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                          <button onClick={() => void renameZone(activeZone)} className="text-[11px] font-medium text-primary hover:underline">Guardar</button>
                          <button onClick={() => setRenamingZone(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancelar</button>
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{activeZone}</span>
                          <button
                            onClick={() => { setRenameValue(activeZone); setRenamingZone(true) }}
                            className="p-0.5 text-slate-300 hover:text-slate-500"
                            title="Renombrar zona (se aplica a todos sus jugadores)"
                            aria-label="Renombrar zona"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <span className="text-[11px] text-slate-400">{zoneEntries.length} jugador{zoneEntries.length !== 1 ? 'es' : ''}</span>
                    </div>
                    {statusBoard(zoneEntries)}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">No hay zonas todavía</p>
                )}
              </div>
            )
          })()}

          {/* ── Vista por ENCARGADO ── */}
          {view === 'encargado' && (() => {
            const noManager = filtered.filter(e => e.managers.length === 0)
            const cols = managerOptions
              .map(p => ({ profile: p, list: filtered.filter(e => e.managers.includes(p.id)) }))
              .filter(c => c.list.length > 0)
              .sort((a, b) => b.list.length - a.list.length)
            return (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
                {cols.map(({ profile: p, list }) => {
                  const c = scoutColor(p.avatar || p.name)
                  const calientes = list.filter(e => e.status === 'caliente').length
                  const overdue = list.filter(e => firmasAging(e)?.overdue).length
                  return (
                    <div key={p.id} className="flex-shrink-0 w-[250px] bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8.5px] font-bold ${c.bg} ${c.text}`}>
                          {(p.avatar || p.name.slice(0, 2)).slice(0, 3).toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-slate-700 truncate">{p.name.split(' ')[0]}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{list.length}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {calientes > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10.5px] text-red-600 font-semibold" title="Calientes">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{calientes}
                            </span>
                          )}
                          {overdue > 0 && <span className="text-[10.5px] text-red-500" title="Desatendidos">⚠ {overdue}</span>}
                        </span>
                      </div>
                      <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
                        {list
                          .slice()
                          .sort((a, b) => FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) || a.playerName.localeCompare(b.playerName))
                          .map(e => card(e, true))}
                      </div>
                    </div>
                  )
                })}
                {/* Sin encargado — para repartir */}
                <div className={`flex-shrink-0 w-[250px] rounded-lg border ${noManager.length > 0 ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 px-2.5 py-2">
                    <span className={`text-xs font-bold ${noManager.length > 0 ? 'text-red-700' : 'text-slate-400'}`}>⚠ Sin encargado</span>
                    <span className="text-[11px] text-slate-400 font-medium">{noManager.length}</span>
                  </div>
                  <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
                    {noManager.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-4">Todos repartidos ✓</div>
                    ) : noManager.map(e => card(e, true))}
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── Hover card ── */}
      {hoverEntry && hover && (
        <FirmasHoverCard
          entry={hoverEntry}
          sp={hoverEntry.scoutingPlayerId ? spById[hoverEntry.scoutingPlayerId] : undefined}
          reports={hoverEntry.scoutingPlayerId ? (reportsByPlayer[hoverEntry.scoutingPlayerId] ?? []) : []}
          profiles={profiles}
          pos={{ x: hover.x, y: hover.y }}
        />
      )}

      {/* ── Panel de detalle ── */}
      {panelEntry && (
        <FirmasDetailPanel
          key={panelEntry.id}
          entry={panelEntry}
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          spById={spById}
          reportsByPlayer={reportsByPlayer}
          zones={zones}
          headerHeight={headerHeight}
          onClose={() => setPanelId(null)}
          onPatch={patch}
          onChangeStatus={changeStatus}
          onOpenScoutingPlayer={onOpenScoutingPlayer}
          onRequestDelete={() => setConfirmDelete(panelEntry)}
        />
      )}

      {/* ── Confirmar borrado ── */}
      {confirmDelete && (
        <ConfirmModal
          open
          title="Eliminar jugador del pipeline"
          message={`¿Seguro que quieres eliminar a ${confirmDelete.playerName} del pipeline de firmas? Se perderá su historial.`}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={async () => {
            try {
              await onDelete(confirmDelete.id)
              setConfirmDelete(null)
              setPanelId(null)
              showToast('Jugador eliminado del pipeline')
            } catch (err) {
              console.error(err)
              showToast('No se pudo eliminar', 'error')
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Modal de alta ── */}
      {showAdd && (
        <FirmasAddModal
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          zones={zones.length > 0 ? zones : FIRMAS_ZONE_ORDER}
          existing={entries}
          onClose={() => setShowAdd(false)}
          onCreate={async (draft) => {
            try {
              const maxPos = Math.max(0, ...entries.filter(e => e.zone === draft.zone && e.status === draft.status).map(e => e.sortPos))
              const saved = await onCreate({ ...draft, sortPos: maxPos + 1 })
              setShowAdd(false)
              setPanelId(saved.id)
              showToast(`${draft.playerName} añadido al pipeline`)
            } catch (err) {
              console.error(err)
              showToast('No se pudo crear (¿has ejecutado la migración SQL?)', 'error')
            }
          }}
        />
      )}
    </div>
  )
}

// ── Panel de detalle de una entrada del pipeline ─────────────
// Media pantalla en escritorio, dos columnas: datos | historial.
function FirmasDetailPanel({
  entry, profiles, currentProfile, scoutingPlayers, spById, reportsByPlayer,
  zones, headerHeight, onClose, onPatch, onChangeStatus, onOpenScoutingPlayer, onRequestDelete,
}: {
  entry: FirmasEntry
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  spById: Record<string, ScoutingPlayer>
  reportsByPlayer: Record<string, ScoutingReport[]>
  zones: string[]
  headerHeight: number
  onClose: () => void
  onPatch: (e: FirmasEntry, changes: Partial<FirmasEntry>) => Promise<void>
  onChangeStatus: (e: FirmasEntry, s: FirmasStatus) => void
  onOpenScoutingPlayer: (id: string) => void
  onRequestDelete: () => void
}) {
  const isAdmin = currentProfile.is_admin
  const sp = entry.scoutingPlayerId ? spById[entry.scoutingPlayerId] : undefined
  const spReports = entry.scoutingPlayerId ? (reportsByPlayer[entry.scoutingPlayerId] ?? []) : []
  const aging = firmasAging(entry)

  const [name, setName] = useState(entry.playerName)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [editingName, setEditingName] = useState(false)

  // ── composer del historial (bajo esfuerzo) ──
  const [newComment, setNewComment] = useState('')
  const [commentKind, setCommentKind] = useState<string>('nota')
  const [commentOutcome, setCommentOutcome] = useState<'contesto' | 'no_contesto' | null>(null)

  // ── edición de apuntes ──
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  // ── próxima acción ──
  const [editingAction, setEditingAction] = useState(false)
  const [actionLabel, setActionLabel] = useState(entry.nextAction ?? '')
  const [actionDate, setActionDate] = useState(entry.nextActionDate ?? '')
  const [actionAssignee, setActionAssignee] = useState(entry.nextActionAssignee ?? currentProfile.id)

  const zoneOptions = useMemo(() => {
    const base = [...FIRMAS_ZONE_ORDER]
    zones.forEach(z => { if (!base.includes(z)) base.push(z) })
    if (!base.includes(entry.zone)) base.push(entry.zone)
    return base
  }, [zones, entry.zone])

  const saveName = () => {
    setEditingName(false)
    const v = name.trim()
    if (v && v !== entry.playerName) void onPatch(entry, { playerName: v })
    else setName(entry.playerName)
  }

  const saveNotes = () => {
    const v = notes.trim()
    if (v !== (entry.notes ?? '')) void onPatch(entry, { notes: v || undefined })
  }

  const toggleManager = (pid: string) => {
    const managers = entry.managers.includes(pid)
      ? entry.managers.filter(m => m !== pid)
      : [...entry.managers, pid]
    void onPatch(entry, { managers })
  }

  const addComment = () => {
    const kind = commentKind as FirmasComment['kind']
    let text = newComment.trim()
    // sin fricción: una llamada/whatsapp con resultado se puede registrar sin escribir nada
    if (!text && commentOutcome) text = commentOutcome === 'contesto' ? 'Contestó' : 'No contestó'
    if (!text) return
    const c: FirmasComment = {
      id: crypto.randomUUID(),
      text,
      date: new Date().toISOString(),
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind,
      outcome: commentOutcome ?? undefined,
    }
    setNewComment('')
    setCommentKind('nota')
    setCommentOutcome(null)
    void onPatch(entry, { comments: [...entry.comments, c] })
  }

  const deleteComment = (id: string) => {
    void onPatch(entry, { comments: entry.comments.filter(c => c.id !== id) })
  }

  const saveCommentEdit = () => {
    const v = editingCommentText.trim()
    const id = editingCommentId
    setEditingCommentId(null)
    if (!v || !id) return
    void onPatch(entry, { comments: entry.comments.map(c => c.id === id ? { ...c, text: v } : c) })
  }

  const saveAction = () => {
    if (!actionLabel.trim() && !actionDate) { setEditingAction(false); return }
    void onPatch(entry, {
      nextAction: actionLabel.trim() || undefined,
      nextActionDate: actionDate || undefined,
      nextActionAssignee: actionAssignee || undefined,
    })
    setEditingAction(false)
  }

  const completeAction = () => {
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `✓ Hecho: ${entry.nextAction ?? 'próxima acción'}`,
      date: new Date().toISOString(),
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind: 'nota',
    }
    void onPatch(entry, {
      nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined,
      comments: [...entry.comments, log],
    })
    setActionLabel(''); setActionDate('')
  }

  // recientes primero
  const sortedComments = [...entry.comments].sort((a, b) => b.date.localeCompare(a.date))
  const actionAssigneeProfile = entry.nextActionAssignee ? profiles.find(p => p.id === entry.nextActionAssignee) : undefined
  const actionOverdue = !!entry.nextActionDate && entry.nextActionDate < todayISO()

  const LABEL_CLS = 'text-[10px] font-bold text-slate-400 uppercase tracking-wide'

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 bg-black/20 z-30" style={{ top: headerHeight }} onClick={onClose} />
      <div
        className="fixed right-0 w-full lg:w-[55%] xl:w-1/2 max-w-[880px] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200"
        style={{ top: headerHeight, height: `calc(100vh - ${headerHeight}px)` }}
      >
        {/* header compacto */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-200">
          {editingName ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              autoFocus
              className="text-base font-bold text-slate-800 border-b border-blue-300 focus:outline-none min-w-0 flex-shrink"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="group flex items-center gap-1.5 text-left min-w-0 flex-shrink">
              <span className="text-base font-bold text-slate-800 leading-tight truncate">{entry.playerName}</span>
              <Pencil className="w-3 h-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
            </button>
          )}
          <FirmasStatusChip status={entry.status} onChange={s => onChangeStatus(entry, s)} size="md" />
          {entry.status === 'firmado' ? (
            <span className="text-[11px] text-green-600 font-medium hidden sm:inline">🎉 {entry.signedAt ? fmtDate(entry.signedAt) : ''}</span>
          ) : (
            <>
              {entry.statusUpdatedAt && (
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  desde {relativeDate(entry.statusUpdatedAt) || fmtDate(entry.statusUpdatedAt)}
                </span>
              )}
              {aging && (
                <span className={`text-[11px] font-medium hidden sm:inline ${aging.overdue ? 'text-red-500' : aging.warn ? 'text-amber-600' : 'text-slate-400'}`}>
                  {aging.overdue ? '⚠ ' : ''}sin tocar {aging.days}d<span className="opacity-60">/{aging.limit}d</span>
                </span>
              )}
            </>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body: dos columnas en escritorio */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">

            {/* ── Columna izquierda: datos ── */}
            <div className="space-y-3.5 min-w-0">
              {/* próxima acción */}
              {entry.status !== 'firmado' && (
                <div>
                  <label className={LABEL_CLS}>Próxima acción</label>
                  {editingAction ? (
                    <div className="mt-1 border border-blue-200 rounded-lg p-2 bg-blue-50/40 space-y-1.5">
                      <input
                        value={actionLabel}
                        onChange={e => setActionLabel(e.target.value)}
                        placeholder="Llamar, reunión, enviar propuesta…"
                        autoFocus
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="date"
                          value={actionDate}
                          onChange={e => setActionDate(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                        <select value={actionAssignee} onChange={e => setActionAssignee(e.target.value)} className={SELECT_CLS}>
                          {profiles.map(p => <option key={p.id} value={p.id}>{p.avatar || p.name}</option>)}
                        </select>
                        <button onClick={() => setEditingAction(false)} className="px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100">✕</button>
                        <button onClick={saveAction} className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-medium hover:bg-primary/90">OK</button>
                      </div>
                    </div>
                  ) : entry.nextAction || entry.nextActionDate ? (
                    <div className={`mt-1 flex items-center gap-2 border rounded-lg px-2.5 py-1.5 ${actionOverdue ? 'border-red-200 bg-red-50/60' : 'border-blue-200 bg-blue-50/50'}`}>
                      <span className="text-xs font-semibold text-slate-800 truncate">📌 {entry.nextAction ?? 'Acción'}</span>
                      <span className={`text-[11px] flex-shrink-0 ${actionOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {entry.nextActionDate ? fmtDate(entry.nextActionDate) : 'sin fecha'}
                        {actionOverdue ? ' · vencida' : entry.nextActionDate === todayISO() ? ' · hoy' : ''}
                        {actionAssigneeProfile ? ` · ${actionAssigneeProfile.avatar || actionAssigneeProfile.name}` : ''}
                      </span>
                      <span className="ml-auto flex gap-1 flex-shrink-0">
                        <button onClick={completeAction} className="px-2 py-0.5 rounded-md bg-green-600 text-white text-[11px] font-medium hover:bg-green-700" title="Marcar hecha (queda en el historial)">✓</button>
                        <button
                          onClick={() => { setActionLabel(entry.nextAction ?? ''); setActionDate(entry.nextActionDate ?? ''); setActionAssignee(entry.nextActionAssignee ?? currentProfile.id); setEditingAction(true) }}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-white"
                          aria-label="Editar próxima acción"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setActionLabel(''); setActionDate(''); setActionAssignee(currentProfile.id); setEditingAction(true) }}
                      className="mt-1 w-full border border-dashed border-slate-300 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors text-left"
                    >
                      + Programar próxima acción (sale en el Dashboard el día que toca)
                    </button>
                  )}
                </div>
              )}

              {/* zona */}
              <div className="flex items-center gap-2">
                <label className={`${LABEL_CLS} w-16 flex-shrink-0`}>Zona</label>
                <select
                  value={entry.zone}
                  onChange={e => void onPatch(entry, { zone: e.target.value })}
                  className={`flex-1 min-w-0 ${SELECT_CLS}`}
                >
                  {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              {/* encargados */}
              <div>
                <label className={LABEL_CLS}>Encargados</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profiles.map(p => {
                    const active = entry.managers.includes(p.id)
                    const c = scoutColor(p.avatar || p.name)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleManager(p.id)}
                        className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors ${
                          active ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-300 border-slate-200 hover:border-slate-300 hover:text-slate-500'
                        }`}
                        title={p.name}
                      >
                        {p.avatar || p.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* vínculo con jugador de Captación — compacto */}
              <div>
                <label className={LABEL_CLS}>Jugador de Captación</label>
                {sp ? (
                  <div className="mt-1 flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50">
                    <div className="min-w-0 flex-1 text-xs">
                      <span className="font-semibold text-slate-800">{sp.fullName}</span>
                      <span className="text-slate-400">
                        {' · '}
                        {[
                          sp.team,
                          sp.birthdate ? sp.birthdate.slice(0, 4) : null,
                          sp.position1,
                          `${spReports.length} inf.`,
                          sp.assessment,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button
                      onClick={() => onOpenScoutingPlayer(sp.id)}
                      className="text-[11px] font-medium text-primary hover:underline flex-shrink-0"
                    >
                      Ver ficha
                    </button>
                    <button
                      onClick={() => void onPatch(entry, { scoutingPlayerId: undefined })}
                      className="p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0"
                      title="Quitar vínculo"
                      aria-label="Quitar vínculo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <FirmasLinkSearch
                      scoutingPlayers={scoutingPlayers}
                      onSelect={p => void onPatch(entry, { scoutingPlayerId: p.id })}
                      placeholder="Vincular con jugador de Captación…"
                    />
                  </div>
                )}
              </div>

              {/* notas */}
              <div>
                <label className={LABEL_CLS}>Notas</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={3}
                  placeholder="Notas sobre el proceso de captación…"
                  className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                />
              </div>
            </div>

            {/* ── Columna derecha: historial ── */}
            <div className="min-w-0">
              <label className={LABEL_CLS}>
                Historial {sortedComments.length > 0 && <span className="text-slate-300">· {sortedComments.length}</span>}
              </label>

              {/* composer arriba: tipo con un toque + resultado rápido */}
              <div className="mt-1 border border-slate-200 rounded-lg p-2 bg-white space-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {Object.entries(FIRMAS_KIND_META).map(([k, meta]) => (
                    <button
                      key={k}
                      onClick={() => { setCommentKind(k); if (k !== 'llamada' && k !== 'whatsapp') setCommentOutcome(null) }}
                      className={`px-1.5 py-0.5 rounded-md text-[11px] transition-colors ${
                        commentKind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={meta.label}
                    >
                      {meta.icon} <span className="hidden xl:inline">{meta.label}</span>
                    </button>
                  ))}
                  {(commentKind === 'llamada' || commentKind === 'whatsapp') && (
                    <span className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => setCommentOutcome(o => o === 'contesto' ? null : 'contesto')}
                        className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${commentOutcome === 'contesto' ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'text-slate-400 hover:bg-slate-100'}`}
                      >
                        ✓ contestó
                      </button>
                      <button
                        onClick={() => setCommentOutcome(o => o === 'no_contesto' ? null : 'no_contesto')}
                        className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${commentOutcome === 'no_contesto' ? 'bg-red-100 text-red-600 ring-1 ring-red-200' : 'text-slate-400 hover:bg-slate-100'}`}
                      >
                        ✗ no contestó
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addComment() }}
                    placeholder={commentKind === 'nota' ? 'Añadir nota…' : `${FIRMAS_KIND_META[commentKind].label}: ¿qué pasó?`}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button
                    onClick={addComment}
                    disabled={!newComment.trim() && !commentOutcome}
                    aria-label="Guardar apunte"
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* lista: recientes primero */}
              <div className="mt-2 space-y-1.5">
                {sortedComments.length === 0 && (
                  <p className="text-[11px] text-slate-400">Sin actividad todavía.</p>
                )}
                {sortedComments.map(c => (
                  c.kind === 'estatus' ? (
                    <div key={c.id} className="flex items-center gap-1.5 px-1 text-[10.5px] text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span>{c.text}</span>
                      <span className="opacity-70">· {c.author?.split(' ')[0]} · {fmtDate(c.date)}</span>
                    </div>
                  ) : editingCommentId === c.id ? (
                    <div key={c.id} className="border border-blue-200 rounded-lg px-2.5 py-2 bg-blue-50/30">
                      <textarea
                        value={editingCommentText}
                        onChange={e => setEditingCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveCommentEdit() } if (e.key === 'Escape') setEditingCommentId(null) }}
                        autoFocus
                        rows={2}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                      />
                      <div className="mt-1 flex justify-end gap-1.5">
                        <button onClick={() => setEditingCommentId(null)} className="px-2 py-0.5 rounded-md text-[11px] text-slate-500 hover:bg-slate-100">Cancelar</button>
                        <button onClick={saveCommentEdit} className="px-2.5 py-0.5 rounded-md bg-primary text-white text-[11px] font-medium hover:bg-primary/90">Guardar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} className="group border border-slate-100 rounded-lg px-2.5 py-2 bg-slate-50/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{FIRMAS_KIND_META[c.kind ?? 'nota']?.icon ?? '📝'}</span>
                        <span className="text-[11px] font-semibold text-slate-600">{c.author || '—'}</span>
                        {c.outcome && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.outcome === 'contesto' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {c.outcome === 'contesto' ? 'contestó' : 'no contestó'}
                          </span>
                        )}
                        <span className="text-[10.5px] text-slate-400">{relativeDate(c.date) || fmtDate(c.date)}</span>
                        {(isAdmin || c.authorId === currentProfile.id) && (
                          <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text) }}
                              aria-label="Editar apunte"
                              className="p-0.5 text-slate-300 hover:text-blue-500"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteComment(c.id)}
                              aria-label="Eliminar apunte"
                              className="p-0.5 text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-700 whitespace-pre-wrap break-words">{c.text}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-slate-200 px-4 py-2 flex items-center gap-2">
          {entry.trelloUrl && (
            <a
              href={entry.trelloUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
            >
              <ExternalLink className="w-3 h-3" />
              Tarjeta Trello
            </a>
          )}
          <button
            onClick={onRequestDelete}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Eliminar
          </button>
        </div>
      </div>
    </>
  )
}

// ── Modal de alta en el pipeline ─────────────────────────────
function FirmasAddModal({
  profiles, currentProfile, scoutingPlayers, zones, existing, onClose, onCreate,
}: {
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  zones: string[]
  existing: FirmasEntry[]
  onClose: () => void
  onCreate: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt' | 'sortPos'> & { sortPos: number }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [zone, setZone] = useState(zones[0] ?? 'Otros')
  const [newZone, setNewZone] = useState('')
  const [status, setStatus] = useState<FirmasStatus>('llamar')
  const [managers, setManagers] = useState<string[]>([currentProfile.id])
  const [linked, setLinked] = useState<ScoutingPlayer | null>(null)
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose)

  const zoneValue = zone === '__nueva__' ? newZone.trim() : zone
  const duplicate = existing.some(e => normSearch(e.playerName) === normSearch(linked?.fullName ?? name))
  const canSave = (linked || isValidName(name.trim())) && zoneValue && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    await onCreate({
      playerName: (name.trim() || linked?.fullName) ?? '',
      zone: zoneValue,
      status,
      scoutingPlayerId: linked?.id,
      managers,
      notes: undefined,
      comments: [],
      trelloUrl: undefined,
      statusUpdatedAt: new Date().toISOString(),
      sortPos: 0, // recalculado por el llamador
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Añadir jugador al pipeline</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* vincular con scouting (opcional, rellena el nombre) */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Jugador de Captación (opcional)</label>
            {linked ? (
              <div className="mt-1 flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{linked.fullName}</div>
                  <div className="text-[11px] text-slate-400">
                    {[linked.team, linked.birthdate ? linked.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button onClick={() => setLinked(null)} className="text-[11px] text-slate-400 hover:text-red-500 flex-shrink-0">Quitar</button>
              </div>
            ) : (
              <div className="mt-1">
                <FirmasLinkSearch
                  scoutingPlayers={scoutingPlayers}
                  onSelect={p => { setLinked(p); if (!name.trim()) setName(p.fullName) }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nombre *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del jugador"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {duplicate && (
              <p className="mt-1 text-[11px] text-amber-600">Ya hay un jugador con este nombre en el pipeline.</p>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Zona</label>
              <select value={zone} onChange={e => setZone(e.target.value)} className={`mt-1 w-full ${SELECT_CLS}`}>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                <option value="__nueva__">+ Nueva zona…</option>
              </select>
              {zone === '__nueva__' && (
                <input
                  value={newZone}
                  onChange={e => setNewZone(e.target.value)}
                  placeholder="Nombre de la zona"
                  className="mt-1.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              )}
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Estatus</label>
              <select value={status} onChange={e => setStatus(e.target.value as FirmasStatus)} className={`mt-1 w-full ${SELECT_CLS}`}>
                {FIRMAS_STATUSES.map(s => <option key={s} value={s}>{FIRMAS_CONFIG[s].label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Encargados</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {profiles.map(p => {
                const active = managers.includes(p.id)
                const c = scoutColor(p.avatar || p.name)
                return (
                  <button
                    key={p.id}
                    onClick={() => setManagers(prev => active ? prev.filter(m => m !== p.id) : [...prev, p.id])}
                    className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      active ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p.avatar || p.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </div>
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
  onGoToSection: (s: 'tareas' | 'jugadores' | 'distribucion' | 'boulema') => void
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
  /** Abrir la ficha de un jugador al montar (navegación desde otra sección, p. ej. Boulema) */
  openPlayerId?: string | null
  onOpenPlayerConsumed?: () => void
  /** Abrir una entrada del pipeline Firmar (navegación desde el Dashboard) */
  openFirmasEntryId?: string | null
  onOpenFirmasEntryConsumed?: () => void
  firmasEntries: FirmasEntry[]
  onCreateFirmasEntry: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  onUpdateFirmasEntry: (e: FirmasEntry) => Promise<void>
  onDeleteFirmasEntry: (id: string) => Promise<void>
}

// ── MatchFormPanel — isolated so keystrokes don't re-render the whole list ──
type MatchFormState = { date: string; time: string; homeTeam: string; awayTeam: string; competition: string; assignedTo: string; viewMode: 'video' | 'campo'; notes: string }
function emptyMatchForm(): MatchFormState {
  return { date: '', time: '', homeTeam: '', awayTeam: '', competition: '', assignedTo: '', viewMode: 'video', notes: '' }
}
function MatchFormPanel({ initial, profiles, onSave, onCancel, showToast }: {
  initial?: ScoutingMatch
  profiles: Profile[]
  onSave: (f: MatchFormState) => Promise<void>
  onCancel: () => void
  showToast?: ShowToast
}) {
  const [form, setForm] = useState<MatchFormState>(initial
    ? { date: initial.date, time: initial.time ?? '', homeTeam: initial.homeTeam, awayTeam: initial.awayTeam, competition: initial.competition ?? '', assignedTo: initial.assignedTo ?? '', viewMode: initial.viewMode ?? 'video', notes: initial.notes ?? '' }
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
  openPlayerId,
  onOpenPlayerConsumed,
  openFirmasEntryId,
  onOpenFirmasEntryConsumed,
  firmasEntries,
  onCreateFirmasEntry,
  onUpdateFirmasEntry,
  onDeleteFirmasEntry,
}: Props) {
  const isAdmin = currentProfile.is_admin

  // ── toasts ──
  const { toasts, showToast, dismissToast } = useToast()

  // ── section tab ── (must be before header-height effect)
  const [captTab, setCaptTab] = useState<CaptacionTab>('jugadores')

  // Navegación externa: abrir la ficha de un jugador concreto (p. ej. desde Boulema)
  useEffect(() => {
    if (openPlayerId) {
      setCaptTab('jugadores')
      setPanelPlayerId(openPlayerId)
      onOpenPlayerConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPlayerId])

  // Navegación externa: abrir una entrada de Firmar (p. ej. desde el Dashboard)
  useEffect(() => {
    if (openFirmasEntryId) setCaptTab('firmar')
  }, [openFirmasEntryId])

  // ── umbral de candidatos (compartido: badge de pestaña + Conclusiones) ──
  const [conclThreshold, setConclThreshold] = useState<number>(() => {
    const v = parseInt(sessionStorage.getItem('capt_concl_threshold') ?? '3')
    return [2, 3, 4].includes(v) ? v : 3
  })
  useEffect(() => { sessionStorage.setItem('capt_concl_threshold', String(conclThreshold)) }, [conclThreshold])

  // nº de informes «Llamar» por jugador (Firmar legado cuenta como Llamar)
  const llamarCountByPlayer = useMemo(() => {
    const m: Record<string, number> = {}
    scoutingReports.forEach(r => {
      if (normConclusion(r.conclusion) !== 'Llamar') return
      m[r.playerId] = (m[r.playerId] ?? 0) + 1
    })
    return m
  }, [scoutingReports])

  // Candidatos "nuevos": cumplen umbral y no están ocultados (o suman
  // informes nuevos desde que se ocultaron) → badge en la pestaña
  const newCandidatesCount = useMemo(() =>
    scoutingPlayers.filter(p => {
      const n = llamarCountByPlayer[p.id] ?? 0
      if (n < conclThreshold) return false
      return p.candidateSeenCount == null || n > p.candidateSeenCount
    }).length,
  [scoutingPlayers, llamarCountByPlayer, conclThreshold])

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
  const [quickAssessId, setQuickAssessId] = useState<string | null>(null)
  // Vista de Jugadores: lista (con panel) o tabla de edición rápida
  const [jugadoresView, setJugadoresView] = useState<'lista' | 'edicion'>(
    () => (sessionStorage.getItem('capt_jugadores_view') as 'lista' | 'edicion') ?? 'lista'
  )
  useEffect(() => { sessionStorage.setItem('capt_jugadores_view', jugadoresView) }, [jugadoresView])

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

  // ── pretemporada filters ──
  const [preSearch, setPreSearch] = useState('')
  const [preAssessFilter, setPreAssessFilter] = useState<ScoutingAssessment | 'all' | 'sin'>('all')
  const [preClubFilter, setPreClubFilter] = useState('all')
  const [prePosFilter, setPrePosFilter] = useState('all')
  const [preCatFilter, setPreCatFilter] = useState('all')
  const [preSortKey, setPreSortKey] = useState<'name' | 'club' | 'pos' | 'year' | 'cat' | 'matches' | 'assess'>('assess')
  const [preSortDir, setPreSortDir] = useState<1 | -1>(1)

  // ── pagination ──
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)

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

  // Ranking de informes por explorador (usado en la pestaña Informes;
  // las estadísticas completas viven ahora en Admin → Stats Captación)
  const reportsByPersonaRanked = useMemo(() => {
    const byPersona: Record<string, number> = {}
    scoutingReports.forEach(r => { const k = r.persona ?? '—'; byPersona[k] = (byPersona[k] ?? 0) + 1 })
    return Object.entries(byPersona).sort((a, b) => b[1] - a[1])
  }, [scoutingReports])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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

  // ── pretemporada: jugadores vistos en partidos de Pretemporada, nacidos >= PRETEMPORADA_MIN_BIRTH_YEAR ──
  const pretemporadaData = useMemo(() => {
    const preMatches = scoutingMatches.filter(m => m.competition === 'Pretemporada')
    const preMatchIds = new Set(preMatches.map(m => m.id))
    const matchById = new Map(preMatches.map(m => [m.id, m]))

    // playerId -> Set<matchId> (de partidos de pretemporada)
    const matchIdsByPlayer: Record<string, Set<string>> = {}
    for (const mp of matchPlayers) {
      if (!preMatchIds.has(mp.matchId)) continue
      if (!matchIdsByPlayer[mp.playerId]) matchIdsByPlayer[mp.playerId] = new Set()
      matchIdsByPlayer[mp.playerId].add(mp.matchId)
    }
    for (const r of scoutingReports) {
      if (!r.matchId || !preMatchIds.has(r.matchId)) continue
      if (!matchIdsByPlayer[r.playerId]) matchIdsByPlayer[r.playerId] = new Set()
      matchIdsByPlayer[r.playerId].add(r.matchId)
    }

    let sinFechaCount = 0
    const players: { player: ScoutingPlayer; matches: ScoutingMatch[] }[] = []
    for (const p of scoutingPlayers) {
      const matchIds = matchIdsByPlayer[p.id]
      if (!matchIds || matchIds.size === 0) continue
      if (!p.birthdate) { sinFechaCount++; continue }
      const birthYear = parseInt(p.birthdate.slice(0, 4))
      if (isNaN(birthYear) || birthYear < PRETEMPORADA_MIN_BIRTH_YEAR) continue
      const matches = Array.from(matchIds).map(id => matchById.get(id)).filter(Boolean) as ScoutingMatch[]
      players.push({ player: p, matches })
    }

    return { players, sinFechaCount, matchCount: preMatches.length }
  }, [scoutingMatches, matchPlayers, scoutingReports, scoutingPlayers])

  // Opciones de club/categoría presentes en los datos de pretemporada (para los selectores)
  const preClubOptions = useMemo(() => {
    const set = new Set<string>()
    pretemporadaData.players.forEach(({ player }) => set.add(player.team?.trim() || 'Sin equipo'))
    return Array.from(set).sort((a, b) => a === 'Sin equipo' ? 1 : b === 'Sin equipo' ? -1 : a.localeCompare(b))
  }, [pretemporadaData])

  const preCatOptions = useMemo(() => {
    const set = new Set<string>()
    pretemporadaData.players.forEach(({ player }) => { if (player.categoria) set.add(player.categoria) })
    return Array.from(set).sort()
  }, [pretemporadaData])

  const pretemporadaFiltered = useMemo(() => {
    const q = preSearch.toLowerCase().trim()
    const filtered = pretemporadaData.players.filter(({ player }) => {
      if (preAssessFilter === 'sin' && player.assessment) return false
      if (preAssessFilter !== 'all' && preAssessFilter !== 'sin' && player.assessment !== preAssessFilter) return false
      if (preClubFilter !== 'all' && (player.team?.trim() || 'Sin equipo') !== preClubFilter) return false
      if (prePosFilter !== 'all' && player.position1 !== prePosFilter && player.position2 !== prePosFilter) return false
      if (preCatFilter !== 'all' && player.categoria !== preCatFilter) return false
      if (q && !player.fullName.toLowerCase().includes(q) && !(player.team?.toLowerCase().includes(q))) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (preSortKey) {
        case 'assess':
          av = a.player.assessment ? ALL_ASSESSMENTS.indexOf(a.player.assessment) : ALL_ASSESSMENTS.length
          bv = b.player.assessment ? ALL_ASSESSMENTS.indexOf(b.player.assessment) : ALL_ASSESSMENTS.length
          break
        case 'club': av = a.player.team ?? ''; bv = b.player.team ?? ''; break
        case 'pos': av = a.player.position1 ?? ''; bv = b.player.position1 ?? ''; break
        case 'year': av = a.player.birthdate?.slice(0, 4) ?? ''; bv = b.player.birthdate?.slice(0, 4) ?? ''; break
        case 'cat': av = a.player.categoria ?? ''; bv = b.player.categoria ?? ''; break
        case 'matches': av = a.matches.length; bv = b.matches.length; break
        default: av = a.player.fullName; bv = b.player.fullName
      }
      if (av < bv) return -1 * preSortDir
      if (av > bv) return 1 * preSortDir
      return a.player.fullName.localeCompare(b.player.fullName)
    })

    return sorted
  }, [pretemporadaData, preSearch, preAssessFilter, preClubFilter, prePosFilter, preCatFilter, preSortKey, preSortDir])

  function setPreSort(key: typeof preSortKey) {
    if (preSortKey === key) setPreSortDir(d => (d === 1 ? -1 : 1))
    else { setPreSortKey(key); setPreSortDir(1) }
  }

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

  // Ocultar / restaurar candidato (solo admins). seenCount = nº de informes
  // «Llamar» en el momento de ocultar; undefined = restaurar.
  async function handleCandidateSeen(p: ScoutingPlayer, seenCount?: number) {
    try {
      const updated: ScoutingPlayer = {
        ...p,
        candidateSeenCount: seenCount,
        candidateSeenAt: seenCount != null ? new Date().toISOString() : undefined,
      }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
    } catch {
      showToast('Error al actualizar el candidato', 'error')
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
      time: form.time.trim() || undefined,
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
      editingReportCount === 0
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
          <button
            onClick={() => onGoToSection('boulema')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <Inbox className="w-3.5 h-3.5" />
            Boulema
          </button>
        </div>

        {/* Captación sub-tabs */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          {([
            { id: 'jugadores' as CaptacionTab, label: 'Jugadores', labelMobile: 'Jugadores', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'firmar' as CaptacionTab, label: 'Firmar', labelMobile: 'Firmar', icon: <PenLine className="w-3.5 h-3.5" /> },
            { id: 'conclusiones' as CaptacionTab, label: 'Conclusiones', labelMobile: 'Concl.', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'informes' as CaptacionTab, label: 'Informes recientes', labelMobile: 'Informes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'partidos' as CaptacionTab, label: 'Partidos', labelMobile: 'Partidos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { id: 'pretemporada' as CaptacionTab, label: 'Pretemporada', labelMobile: 'Pretemp.', icon: <Sun className="w-3.5 h-3.5" /> },
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
              {t.id === 'conclusiones' && newCandidatesCount > 0 && (
                <span className={`min-w-[16px] text-center text-[10px] font-bold rounded-full px-1 ${
                  captTab === t.id ? 'bg-white/25 text-white' : 'bg-amber-400 text-amber-950'
                }`}>
                  {newCandidatesCount > 99 ? '99+' : newCandidatesCount}
                </span>
              )}
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

              {/* Assessment filter */}
              <select
                value={assessFilter}
                onChange={e => setAssessFilter(e.target.value as ScoutingAssessment | 'all')}
                className={SELECT_CLS}
              >
                <option value="all">Assessment: todos</option>
                {ALL_ASSESSMENTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              {/* Categoria filter */}
              <select
                value={categoriaFilter}
                onChange={e => setCategoriaFilter(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="all">Todas las categorías</option>
                {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              {/* Position filter */}
              <select
                value={posFilter}
                onChange={e => setPosFilter(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="all">Todas las posiciones</option>
                {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
              </select>

              <div className="flex-1" />
              <span className="text-xs text-slate-400">{filtered.length} jugadores</span>

              {/* Vista: lista | edición rápida */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setJugadoresView('lista')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                    jugadoresView === 'lista' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Lista
                </button>
                <button
                  onClick={() => setJugadoresView('edicion')}
                  title="Tabla de edición rápida: edita celdas sin abrir cada jugador"
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                    jugadoresView === 'edicion' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ✎ Edición
                </button>
              </div>

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
            {jugadoresView === 'edicion' ? (
              <ScoutingTable
                players={filtered}
                onUpdatePlayer={onUpdatePlayer}
                showToast={showToast}
              />
            ) : (
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
            )}
          </div>
        </>
      )}

      {/* ── CONCLUSIONES TAB ─────────────────────────────────── */}
      {/* ── FIRMAR TAB ───────────────────────────────────────── */}
      {captTab === 'firmar' && (
        <FirmasTab
          entries={firmasEntries}
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          scoutingReports={scoutingReports}
          scoutingMatches={scoutingMatches}
          openEntryId={openFirmasEntryId}
          onOpenEntryConsumed={onOpenFirmasEntryConsumed}
          onCreate={onCreateFirmasEntry}
          onUpdate={onUpdateFirmasEntry}
          onDelete={onDeleteFirmasEntry}
          onOpenScoutingPlayer={(id) => { setCaptTab('jugadores'); setPanelPlayerId(id) }}
          showToast={showToast}
          headerHeight={headerHeight}
        />
      )}

      {captTab === 'conclusiones' && (
        <div className="flex-1 w-full px-3 sm:px-6 py-4">
          <div className="max-w-6xl mx-auto">
            <ConclusionesTab
              players={scoutingPlayers}
              reports={scoutingReports}
              threshold={conclThreshold}
              onThresholdChange={setConclThreshold}
              isAdmin={isAdmin}
              onSetCandidateSeen={handleCandidateSeen}
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
              {reportsByPersonaRanked.map(([persona, count]) => {
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
              {/* Persona filter */}
              {reportPersonas.length > 0 && (
                <select
                  value={reportPersonaFilter}
                  onChange={e => setReportPersonaFilter(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="all">Todos los scouts</option>
                  {reportPersonas.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
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
                          {normConclusion(r.conclusion) && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${CONCLUSION_STYLE[normConclusion(r.conclusion)!] ?? 'bg-slate-100 text-slate-600'}`}>
                              {normConclusion(r.conclusion)}
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
              <select
                value={matchStatusFilter}
                onChange={e => setMatchStatusFilter(e.target.value as 'all' | 'visto' | 'pendiente')}
                className={SELECT_CLS}
              >
                <option value="all">Todos los estados</option>
                <option value="visto">Vistos</option>
                <option value="pendiente">Pendientes</option>
              </select>

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
                  const isFuture = isFutureMatch(m.date)
                  const day = m.date.slice(8); const mon = MONTHS_ES[parseInt(m.date.slice(5, 7)) - 1]; const yr = m.date.slice(2, 4)
                  return (
                    <div key={m.id} className={`bg-white border rounded-xl p-3 space-y-2 ${
                      isVisto ? 'border-slate-200' :
                      isFuture ? 'border-blue-200 bg-blue-50/30' :
                      'border-amber-200 bg-amber-50/30'
                    }`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800 leading-tight">
                            {m.homeTeam} <span className="text-slate-400 font-normal text-xs">vs</span> {m.awayTeam}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className={`text-xs ${isFuture ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                              {day} {mon} &apos;{yr}{m.time ? ` · ${m.time}` : ''}
                            </span>
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

      {/* ── PRETEMPORADA TAB ──────────────────────────────────── */}
      {captTab === 'pretemporada' && (() => {
        const preCols: { k: typeof preSortKey; l: string }[] = [
          { k: 'name', l: 'Jugador' },
          { k: 'club', l: 'Club' },
          { k: 'pos', l: 'Posición' },
          { k: 'year', l: 'Año' },
          { k: 'cat', l: 'Categoría' },
          { k: 'matches', l: 'Partidos' },
          { k: 'assess', l: 'Estado' },
        ]
        const llamarCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Llamar').length
        const seguirCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Seguir').length
        const decidirCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Decidir').length
        const sinCount = pretemporadaFiltered.filter(x => !x.player.assessment).length
        const clubCount = new Set(pretemporadaFiltered.map(x => x.player.team?.trim() || 'Sin equipo')).size
        return (
        <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Pretemporada</h2>
            <p className="text-xs text-slate-400">
              Jugadores nacidos en {PRETEMPORADA_MIN_BIRTH_YEAR} o después, vistos en {pretemporadaData.matchCount} partido{pretemporadaData.matchCount !== 1 ? 's' : ''} de pretemporada
            </p>
          </div>

          {pretemporadaData.sinFechaCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
              {pretemporadaData.sinFechaCount} jugador{pretemporadaData.sinFechaCount !== 1 ? 'es' : ''} visto{pretemporadaData.sinFechaCount !== 1 ? 's' : ''} en pretemporada sin fecha de nacimiento registrada (no se puede confirmar si cumple el criterio de edad)
            </div>
          )}

          {pretemporadaData.players.length === 0 ? (
            <EmptyState
              icon={<Sun className="w-10 h-10" />}
              title="No hay jugadores de pretemporada aún"
              subtitle="Se mostrarán aquí los jugadores vistos en partidos marcados con competición «Pretemporada»"
            />
          ) : (
            <>
              {/* Estadísticas */}
              <div className="flex border border-slate-200 rounded-lg bg-white overflow-hidden divide-x divide-slate-200">
                {[
                  ['Jugadores', pretemporadaFiltered.length],
                  ['Clubes', clubCount],
                  ['Llamar', llamarCount],
                  ['Seguir', seguirCount],
                  ['Decidir', decidirCount],
                  ['Sin valorar', sinCount],
                ].map(([l, n]) => (
                  <div key={l as string} className="flex-1 px-4 py-2">
                    <div className="text-lg font-bold text-slate-800 leading-tight">{n}</div>
                    <div className="text-[11px] text-slate-400">{l}</div>
                  </div>
                ))}
              </div>

              {/* Filtros: todos selectores */}
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    value={preSearch}
                    onChange={e => setPreSearch(e.target.value)}
                    placeholder="Buscar jugador, club..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  {preSearch && (
                    <button onClick={() => setPreSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <select value={preClubFilter} onChange={e => setPreClubFilter(e.target.value)} className={SELECT_CLS}>
                  <option value="all">Todos los clubes</option>
                  {preClubOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={prePosFilter} onChange={e => setPrePosFilter(e.target.value)} className={SELECT_CLS}>
                  <option value="all">Todas las posiciones</option>
                  {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {preCatOptions.length > 0 && (
                  <select value={preCatFilter} onChange={e => setPreCatFilter(e.target.value)} className={SELECT_CLS}>
                    <option value="all">Todas las categorías</option>
                    {preCatOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <select
                  value={preAssessFilter}
                  onChange={e => setPreAssessFilter(e.target.value as ScoutingAssessment | 'all' | 'sin')}
                  className={SELECT_CLS}
                >
                  <option value="all">Todos los estados</option>
                  {ALL_ASSESSMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="sin">Sin valorar</option>
                </select>
                <button
                  onClick={() => { setPreSearch(''); setPreClubFilter('all'); setPrePosFilter('all'); setPreCatFilter('all'); setPreAssessFilter('all') }}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors"
                >
                  Limpiar filtros
                </button>
                <span className="text-xs text-slate-400 ml-auto">
                  {pretemporadaFiltered.length} de {pretemporadaData.players.length}
                </span>
              </div>

              {/* Tabla */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {preCols.map(c => (
                          <th
                            key={c.k}
                            onClick={() => setPreSort(c.k)}
                            className={`text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-700 ${preSortKey === c.k ? 'text-slate-700' : 'text-slate-400'}`}
                          >
                            {c.l}
                            <span className={`ml-1 text-[9px] ${preSortKey === c.k ? 'opacity-100' : 'opacity-30'}`}>
                              {preSortKey === c.k && preSortDir === -1 ? '▼' : '▲'}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pretemporadaFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={preCols.length} className="text-center py-10 text-slate-400 text-sm">
                            No hay jugadores que coincidan con los filtros
                          </td>
                        </tr>
                      ) : pretemporadaFiltered.map(({ player, matches }) => (
                        <tr
                          key={player.id}
                          onClick={() => { setCaptTab('jugadores'); setPanelPlayerId(player.id) }}
                          className="cursor-pointer hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">{player.fullName}</td>
                          <td className="px-3 py-2 text-slate-500">{player.team || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{player.position1 ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{player.birthdate ? player.birthdate.slice(0, 4) : '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{player.categoria ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{matches.length}</td>
                          <td className="px-3 py-2">
                            {player.assessment ? (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ASSESSMENT_CONFIG[player.assessment].text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${ASSESSMENT_DOT[player.assessment]}`} />
                                {player.assessment}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                Sin valorar
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        )
      })()}

      {/* ── BOULEMA TAB ──────────────────────────────────────── */}
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
