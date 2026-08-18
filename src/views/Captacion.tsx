import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, ChevronDown,
  FileText, Calendar, ChevronRight,
  TrendingUp, Eye, Maximize2, Minimize2, Pencil,
  ClipboardList, Users, Inbox, Send, Target, Sun,
  PenLine, MapPin, MessageSquare, ExternalLink, LayoutGrid,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { Player, ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, BoulemaPeticion, FirmasEntry, FirmasStatus, FirmasComment } from '../types'
import type { Profile } from '../contexts/AuthContext'
import * as db from '../lib/db'
import { parsearAlineacion, emparejar, type Emparejamiento } from '../lib/lineup'
import { ConfirmModal } from '../components/ConfirmModal'
import { ScoutingTable } from './ScoutingTable'
import { ToastStack } from '../components/ToastStack'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useDebounce } from '../hooks/useDebounce'
import { isValidName } from '../lib/validate'

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info', action?: { label: string; fn: () => void }) => void

// ── Constants ────────────────────────────────────────────────

type CaptacionTab = 'jugadores' | 'firmar' | 'conclusiones' | 'contratos' | 'informes' | 'partidos' | 'pretemporada'

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

// «Visto» no es un veredicto: es «lo he visto y no concluyo» (poco rato, mal
// sitio, partido malo). Sirve para distinguir al scout que decide no mojarse
// del que se olvidó de marcar nada, y se excluye de exigencia y de debates.
const CONCLUSION_OPTIONS = ['', 'Seguir', 'Llamar', 'Descartar', 'Visto'] as const
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
  Visto:     'bg-slate-100 text-slate-600 border border-slate-300',
  // legado — por si hay registros antiguos sin migrar
  Firmar:    'bg-amber-100 text-amber-700 border border-amber-200',
  Decidir:   'bg-orange-100 text-orange-700 border border-orange-200',
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Plantilla opcional de informe — homogeneiza sin obligar
export const REPORT_TEMPLATE = 'FÍSICO:\n\nTÉCNICA:\n\nTÁCTICA:\n\nMENTALIDAD:\n\nCONTEXTO (equipo, rol, rival):\n\nCONCLUSIÓN:\n'

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

// Estrictamente posterior a hoy. «Ocultar futuros» usa esta: los partidos
// de HOY se siguen viendo (son los que toca ver esta tarde).
function isAfterToday(dateStr: string): boolean {
  return dateStr > todayISO()
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
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'the', 'of',
])

function normTeamTokens(name: string): string[] {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0 && !TEAM_NOISE_TOKENS.has(t))
}

// Palabras que comparten decenas de clubes distintos: por sí solas NO identifican
// a ninguno ("Real Madrid" vs "Real Sociedad", "Atlético Madrid" vs "Atlético Baleares").
const TEAM_GENERIC_TOKENS = new Set([
  'real', 'atletico', 'athletic', 'atletic', 'deportivo', 'sporting', 'racing', 'union',
  'cultural', 'sociedad', 'madrid', 'san', 'santa', 'futbol', 'football', 'balompie',
  'olimpico', 'olimpica', 'municipal', 'escuela', 'independiente', 'internacional',
  'nacional', 'ciudad', 'recreativo', 'gimnastic', 'gimnastica', 'sportiva', 'calcio',
])

/**
 * ¿Se refieren al mismo club?
 * - 'exacto'  → mismo club: mismo nombre normalizado, o uno es prefijo del otro
 *               con alguna palabra distintiva ("Getafe" ⊂ "Getafe B").
 * - 'parcial' → coincidencia ambigua: el nombre corto solo tiene palabras genéricas
 *               ("Atlético" ⊂ "Atlético Madrid"). Puede ser, pero no es seguro.
 * - null      → clubes distintos.
 */
function teamMatchKind(a?: string, b?: string): 'exacto' | 'parcial' | null {
  if (!a || !b) return null
  const ta = normTeamTokens(a), tb = normTeamTokens(b)
  if (ta.length === 0 || tb.length === 0) return null
  if (ta.join(' ') === tb.join(' ')) return 'exacto'

  const short = ta.length <= tb.length ? ta : tb
  const long = short === ta ? tb : ta
  const isPrefix = long.slice(0, short.length).join(' ') === short.join(' ')
  const shortHasDistinctive = short.some(t => !TEAM_GENERIC_TOKENS.has(t))
  if (isPrefix) return shortHasDistinctive ? 'exacto' : 'parcial'

  // Sin prefijo: exigimos al menos una palabra distintiva compartida.
  const sharedDistinctive = ta.filter(t => tb.includes(t) && !TEAM_GENERIC_TOKENS.has(t))
  if (sharedDistinctive.length === 0) return null
  const shared = ta.filter(t => tb.includes(t)).length
  return shared / Math.max(ta.length, tb.length) >= 0.5 ? 'exacto' : 'parcial'
}

/** ¿Se refieren (probablemente) al mismo club? */
function teamsAlike(a?: string, b?: string): boolean {
  return teamMatchKind(a, b) !== null
}

/** Scout que cubre un partido, con su propio estado (pendiente / visto) */
type MatchScoutInfo = { scout: string; status: 'pendiente' | 'visto'; viewMode: 'campo' | 'video' }

// Motivo por el que un jugador aparece sugerido en un partido
type SuggestWhy = 'equipo' | 'posible' | 'historial' | 'busqueda'
const SUGGEST_ORDER: Record<SuggestWhy, number> = { equipo: 0, posible: 1, historial: 2, busqueda: 3 }
const SUGGEST_LABEL: Record<SuggestWhy, string> = {
  equipo: '',
  posible: ' · nombre de equipo ambiguo',
  historial: ' · visto antes con este equipo',
  busqueda: '',
}
/** Tope de resultados del buscador libre (las sugerencias por equipo no tienen tope) */
const SEARCH_LIMIT = 60

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
  match, scoutName, scouts, profiles, currentProfile, isAdmin,
  scoutingPlayers, linkedPlayerIds,
  scoutingReports,
  onEdit, onDelete, onToggleStatus, onOpenDetail,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  match: ScoutingMatch
  scoutName: string
  /** Todos los scouts que cubren el partido (incluye el responsable principal) */
  scouts: MatchScoutInfo[]
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  scoutingReports: ScoutingReport[]
  onEdit: (m: ScoutingMatch) => void
  onDelete: (id: string) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onOpenDetail: (matchId: string) => void
  /** Modo fusión: la fila se selecciona en vez de abrirse */
  mergeMode?: boolean
  mergeSelected?: boolean
  onToggleMerge?: (matchId: string) => void
}) {
  const [confirm, setConfirm] = useState(false)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'
  const myScout = scouts.find(s => s.scout === currentProfile.avatar)
  const isPendingForMe = !!myScout && myScout.status !== 'visto' && !isVisto
  const isFuture = isFutureMatch(match.date)

  const linkedPlayers = scoutingPlayers.filter(p => linkedPlayerIds.includes(p.id))
  const reportedIds = new Set(scoutingReports.filter(r => r.matchId === match.id).map(r => r.playerId))
  const linkedWithReport = linkedPlayers.filter(p => reportedIds.has(p.id)).length

  const open = () => mergeMode ? onToggleMerge?.(match.id) : onOpenDetail(match.id)

  return (
    <tr
      onClick={open}
      className={`transition-colors cursor-pointer ${
        mergeSelected ? 'bg-violet-50 ring-1 ring-inset ring-violet-300' :
        isPendingForMe ? 'bg-amber-50/60 hover:bg-amber-50' :
        isFuture ? 'bg-blue-50/40 hover:bg-blue-50/70' :
        'hover:bg-slate-50/60'
      }`}
    >
      {/* Fecha */}
      <td className={`px-3 py-2 text-xs whitespace-nowrap ${isFuture ? 'text-blue-600 font-semibold' : 'text-slate-500'}`}>
        {mergeMode && (
          <input
            type="checkbox"
            checked={!!mergeSelected}
            onChange={() => onToggleMerge?.(match.id)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded mr-2 align-middle accent-violet-600"
            aria-label={`Seleccionar ${match.homeTeam} vs ${match.awayTeam} para fusionar`}
          />
        )}
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
      {/* Scouts (pueden ser varios) */}
      <td className="px-3 py-2 text-xs">
        {scouts.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            {scouts.map(s => {
              const c = scoutColor(s.scout)
              const name = personaToName(s.scout, profiles)
              return (
                <span
                  key={s.scout}
                  title={`${name || s.scout} · ${s.viewMode === 'campo' ? 'en el campo' : 'por vídeo'}${s.status === 'visto' ? ' · ya lo ha visto' : ' · pendiente'}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${c.bg} ${c.text} ${c.border} ${s.status === 'visto' ? '' : 'opacity-70'}`}
                >
                  <span className="font-mono">{s.scout}</span>
                  <span className="text-[9px]">{s.viewMode === 'campo' ? '🏟️' : '📹'}</span>
                  {s.status === 'visto' && <span className="text-[10px]">✓</span>}
                  {scouts.length === 1 && scoutName && scoutName !== s.scout && (
                    <span className="font-normal opacity-70">({scoutName})</span>
                  )}
                </span>
              )
            })}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">— asignar</span>
        )}
      </td>
      {/* Jugadores vinculados + estado de informes */}
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
            linkedPlayers.length === 0
              ? 'bg-slate-50 text-slate-400 border-slate-200'
              : linkedWithReport < linkedPlayers.length
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-violet-50 text-violet-700 border-violet-200'
          }`}
          title={linkedPlayers.length > 0
            ? `${linkedWithReport} de ${linkedPlayers.length} jugadores con informe de este partido`
            : 'Abrir el partido para añadir jugadores'}
        >
          👤 {linkedPlayers.length > 0 ? `${linkedWithReport}/${linkedPlayers.length}` : '+'}
        </span>
      </td>
      {/* Notas */}
      <td className="px-3 py-2 text-xs text-slate-500 max-w-[160px] truncate" title={match.notes ?? ''}>{match.notes ?? '—'}</td>
      {/* Visto */}
      <td className="px-3 py-2 text-center">
        <button onClick={e => { e.stopPropagation(); onToggleStatus(match) }}
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
          <button onClick={e => { e.stopPropagation(); onEdit(match) }} className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="Editar" aria-label="Editar partido">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (confirm
            ? <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { onDelete(match.id); setConfirm(false) }} className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded font-medium">Sí</button>
                <button onClick={() => setConfirm(false)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600">No</button>
              </div>
            : <button onClick={e => { e.stopPropagation(); setConfirm(true) }} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Eliminar" aria-label="Eliminar partido"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </td>
    </tr>
  )
}

// Carcasa de la ficha de partido: la MISMA ficha se pinta como columna fija
// a la derecha en escritorio y como ventana flotante en móvil. Va a nivel de
// módulo a propósito: si se define dentro del componente, React la remonta en
// cada render y se pierde lo que estuvieras escribiendo.
function FichaCarcasa({ esPanel, onClose, children }: {
  esPanel: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (esPanel) {
    return <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">{children}</div>
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ¿Hay sitio para la pantalla partida? (a partir de lg = 1024px)
function useIsDesktop(minWidth = 1024): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(min-width:${minWidth}px)`).matches)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(min-width:${minWidth}px)`)
    const onChange = () => setIs(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [minWidth])
  return is
}


// ── PegarAlineacion ──────────────────────────────────────────────────
// Copias la alineación de Sofascore / Flashscore / BeSoccer, la pegas y la
// app te dice quién de esos jugadores ya está en la BBDD, quién ya está
// vinculado al partido y quién es nuevo — y los vincula de una tacada.

function PegarAlineacion({ match, scoutingPlayers, linkedPlayerIds, onLink, onCreateAndLink, onFixTeam }: {
  match: ScoutingMatch
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  onLink: (playerId: string) => Promise<void>
  onCreateAndLink: (nombre: string, equipo: string) => Promise<void>
  /** Corrige el equipo del jugador con el del partido */
  onFixTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [lado, setLado] = useState<'local' | 'visitante'>('local')
  const [resultado, setResultado] = useState<Emparejamiento[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const equipo = lado === 'local' ? match.homeTeam : match.awayTeam

  function analizar() {
    // No son jugadores: los dos equipos del partido ni ningún nombre de
    // club que ya exista en la BBDD (a veces se pega la columna de equipos)
    const equiposConocidos = Array.from(new Set(scoutingPlayers.map(p => p.team).filter(Boolean) as string[]))
    const nombres = parsearAlineacion(texto, [match.homeTeam, match.awayTeam, ...equiposConocidos], [match.homeTeam, match.awayTeam])
    const mismoEquipo = (a?: string, b?: string) => !!teamMatchKind(a, b)
    setResultado(nombres.map(n => emparejar(n, scoutingPlayers, equipo, mismoEquipo)))
    setHechos(new Set())
  }

  const yaVinculado = (p: ScoutingPlayer | null) => !!p && linkedPlayerIds.includes(p.id)

  async function vincularTodos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) {
        if (e.player && !yaVinculado(e.player)) {
          await onLink(e.player.id)
          setHechos(h => new Set(h).add(e.nombre))
        }
      }
    } finally { setTrabajando(false) }
  }

  async function crearTodos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) {
        await onCreateAndLink(e.nombre, equipo)
        setHechos(h => new Set(h).add(e.nombre))
      }
    } finally { setTrabajando(false) }
  }

  if (!abierto) {
    return (
      <div className="border-t border-slate-100 pt-3">
        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-violet-400 hover:text-violet-600 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          📋 Pegar alineación
          <span className="font-normal text-slate-400">de Sofascore, Flashscore, BeSoccer…</span>
        </button>
      </div>
    )
  }

  const enBbdd = (resultado ?? []).filter(e => e.player && !yaVinculado(e.player) && !hechos.has(e.nombre))
  const vinculados = (resultado ?? []).filter(e => (e.player && yaVinculado(e.player)) || hechos.has(e.nombre))
  const ambiguos = (resultado ?? []).filter(e => e.certeza === 'ambiguo')
  const nuevos = (resultado ?? []).filter(e => e.certeza === 'nuevo' && !hechos.has(e.nombre))
  // Jugadores que SÍ están en la BBDD pero con otro equipo: la alineación es
  // una fuente fiable para corregirlo (juegan ahí hoy)
  const conEquipoDistinto = (resultado ?? []).filter(e => e.player && !teamMatchKind(e.player.team, equipo))

  async function corregirEquipos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) if (e.player) await onFixTeam(e.player, equipo)
    } finally { setTrabajando(false) }
  }

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">📋 Pegar alineación</span>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {(['local', 'visitante'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLado(l)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                lado === l ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {l === 'local' ? match.homeTeam : match.awayTeam}
            </button>
          ))}
        </div>
        <button onClick={() => { setAbierto(false); setTexto(''); setResultado(null) }} className="ml-auto text-slate-400 hover:text-slate-600" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        placeholder={`Pega aquí la alineación del ${equipo} tal cual la copies de la web — da igual el formato: dorsales, minutos y notas se ignoran solos.`}
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={analizar}
          disabled={texto.trim().length < 5}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40"
        >
          Analizar
        </button>
        {resultado && (
          <span className="text-[11px] text-slate-400">
            {resultado.length} nombre{resultado.length !== 1 ? 's' : ''} detectado{resultado.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {resultado && resultado.length === 0 && (
        <p className="text-[11px] text-amber-600">No he reconocido ningún nombre. Copia solo el bloque de la alineación, sin las estadísticas.</p>
      )}

      {enBbdd.length > 0 && (
        <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-violet-700">Ya en la BBDD · {enBbdd.length}</span>
            <button
              onClick={() => void vincularTodos(enBbdd)}
              disabled={trabajando}
              className="ml-auto text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Vinculando…' : `Vincular los ${enBbdd.length}`}
            </button>
          </div>
          <div className="space-y-0.5">
            {enBbdd.map(e => {
              const equipoDistinto = !teamMatchKind(e.player!.team, equipo)
              return (
                <div key={e.nombre} className="flex items-center gap-1.5 text-[11px]">
                  <button onClick={() => void vincularTodos([e])} className="text-violet-600 font-bold" title="Vincular a este partido">+</button>
                  <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                  {/* Lo que pegaste, si no coincide letra por letra: así ves de un
                      vistazo si el emparejamiento es el bueno */}
                  {e.certeza === 'probable' && <span className="text-slate-400">«{e.nombre}»</span>}
                  {equipoDistinto ? (
                    <button
                      onClick={() => void onFixTeam(e.player!, equipo)}
                      className="inline-flex items-center gap-1 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                      title={`En la BBDD figura en ${e.player!.team || 'sin equipo'} — pásalo a ${equipo}`}
                    >
                      <span className="line-through text-amber-500">{e.player!.team || 'sin equipo'}</span>
                      → {equipo}
                    </button>
                  ) : (
                    <span className="text-slate-400 truncate">{e.player!.team}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nuevos.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-emerald-700">No están en la BBDD · {nuevos.length}</span>
            <button
              onClick={() => void crearTodos(nuevos)}
              disabled={trabajando}
              className="ml-auto text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Creando…' : `Crear los ${nuevos.length} en ${equipo}`}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {nuevos.map(e => (
              <button
                key={e.nombre}
                onClick={() => void crearTodos([e])}
                className="text-[11px] bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100"
                title={`Crear «${e.nombre}» en ${equipo} y vincularlo`}
              >
                + {e.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {ambiguos.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2">
          <span className="text-[11px] font-bold text-amber-700">Hay varios con ese nombre · {ambiguos.length}</span>
          <div className="mt-1 space-y-1">
            {ambiguos.map(e => (
              <div key={e.nombre} className="text-[11px]">
                <span className="font-semibold text-slate-700">{e.nombre}</span>
                <span className="text-slate-400"> → </span>
                {e.candidatos?.map(c => (
                  <button
                    key={c.id}
                    onClick={() => void onLink(c.id).then(() => setHechos(h => new Set(h).add(e.nombre)))}
                    className="mr-1 underline decoration-dotted text-amber-800 hover:text-amber-900"
                  >
                    {c.fullName} ({c.team || 'sin equipo'})
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {conEquipoDistinto.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50/70 border border-amber-200 rounded-lg px-2 py-1.5">
          <span className="text-[11px] text-amber-800">
            {conEquipoDistinto.length} figura{conEquipoDistinto.length !== 1 ? 'n' : ''} en la BBDD con otro equipo
          </span>
          <button
            onClick={() => void corregirEquipos(conEquipoDistinto)}
            disabled={trabajando}
            className="ml-auto text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-md disabled:opacity-40"
          >
            {trabajando ? 'Corrigiendo…' : `Pasarlos a ${equipo}`}
          </button>
        </div>
      )}

      {vinculados.length > 0 && (
        <p className="text-[11px] text-slate-400">✓ {vinculados.length} ya vinculado{vinculados.length !== 1 ? 's' : ''} a este partido</p>
      )}
    </div>
  )
}


// ── ActualizarPlantilla ──────────────────────────────────────────────
// Pegas la plantilla de un club (de Sofascore, BeSoccer, Transfermarkt…)
// y la app pone a todos esos jugadores en ese equipo de una tacada. Es la
// forma rápida de poner al día los fichajes sin ir partido a partido.

function ActualizarPlantilla({ scoutingPlayers, onClose, onFixTeam, onCreate, showToast }: {
  scoutingPlayers: ScoutingPlayer[]
  onClose: () => void
  onFixTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
  onCreate: (nombre: string, equipo: string) => Promise<void>
  showToast: ShowToast
}) {
  const [equipo, setEquipo] = useState('')
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<Emparejamiento[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  useEscapeKey(onClose)

  const equiposConocidos = useMemo(
    () => Array.from(new Set(scoutingPlayers.map(p => p.team).filter(Boolean) as string[])).sort(),
    [scoutingPlayers])

  function analizar() {
    const nombres = parsearAlineacion(texto, [equipo, ...equiposConocidos], [equipo])
    const mismoEquipo = (a?: string, b?: string) => !!teamMatchKind(a, b)
    setResultado(nombres.map(n => emparejar(n, scoutingPlayers, equipo, mismoEquipo)))
    setHechos(new Set())
  }

  const cambian = (resultado ?? []).filter(e => e.player && !teamMatchKind(e.player.team, equipo) && !hechos.has(e.nombre))
  const yaEstan = (resultado ?? []).filter(e => e.player && teamMatchKind(e.player.team, equipo))
  const nuevos  = (resultado ?? []).filter(e => e.certeza === 'nuevo' && !hechos.has(e.nombre))
  const dudosos = (resultado ?? []).filter(e => e.certeza === 'ambiguo')

  async function aplicar(lista: Emparejamiento[], crear: boolean) {
    setTrabajando(true)
    let n = 0
    try {
      for (const e of lista) {
        if (crear) await onCreate(e.nombre, equipo)
        else if (e.player) await onFixTeam(e.player, equipo)
        setHechos(h => new Set(h).add(e.nombre))
        n++
      }
      showToast(`${n} jugador${n !== 1 ? 'es' : ''} ${crear ? 'creados en' : 'pasados a'} ${equipo}`)
    } catch {
      showToast('Se ha quedado a medias — vuelve a darle', 'error')
    } finally { setTrabajando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Actualizar plantilla de un club</h3>
            <p className="text-[11px] text-slate-400">
              Pega la plantilla y la app pone a todos esos jugadores en ese equipo. Para ponerse al día con los fichajes de golpe.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto p-1.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Club</label>
            <input
              value={equipo}
              onChange={e => setEquipo(e.target.value)}
              list="equipos-conocidos"
              placeholder="Sporting Gijón"
              className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <datalist id="equipos-conocidos">
              {equiposConocidos.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Plantilla pegada</label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={6}
              placeholder="Pega aquí los nombres — da igual que vengan con dorsal, posición o valor de mercado."
              className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={analizar}
              disabled={!equipo.trim() || texto.trim().length < 5}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40"
            >
              Analizar
            </button>
            {resultado && <span className="text-[11px] text-slate-400">{resultado.length} nombres detectados</span>}
          </div>

          {cambian.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-amber-800">Cambian de equipo · {cambian.length}</span>
                <button
                  onClick={() => void aplicar(cambian, false)}
                  disabled={trabajando}
                  className="ml-auto text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-md disabled:opacity-40"
                >
                  {trabajando ? 'Aplicando…' : `Pasarlos a ${equipo}`}
                </button>
              </div>
              <div className="space-y-0.5">
                {cambian.map(e => (
                  <div key={e.nombre} className="flex items-center gap-1.5 text-[11px]">
                    <button onClick={() => void aplicar([e], false)} className="text-amber-700 font-bold" title="Cambiar solo este">→</button>
                    <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                    {e.certeza === 'probable' && <span className="text-slate-400">«{e.nombre}»</span>}
                    <span className="text-slate-400 line-through">{e.player!.team || 'sin equipo'}</span>
                    <span className="text-amber-700 font-medium">{equipo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {nuevos.length > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-emerald-800">No están en la BBDD · {nuevos.length}</span>
                <button
                  onClick={() => void aplicar(nuevos, true)}
                  disabled={trabajando}
                  className="ml-auto text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-md disabled:opacity-40"
                >
                  {trabajando ? 'Creando…' : `Crear los ${nuevos.length}`}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {nuevos.map(e => (
                  <button key={e.nombre} onClick={() => void aplicar([e], true)}
                    className="text-[11px] bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100">
                    + {e.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {dudosos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <span className="text-[11px] font-bold text-slate-600">Varios con ese nombre · {dudosos.length}</span>
              <div className="mt-1 space-y-1">
                {dudosos.map(e => (
                  <div key={e.nombre} className="text-[11px]">
                    <span className="font-semibold text-slate-700">{e.nombre}</span>
                    <span className="text-slate-400"> → </span>
                    {e.candidatos?.map(c => (
                      <button key={c.id}
                        onClick={() => void onFixTeam(c, equipo).then(() => setHechos(h => new Set(h).add(e.nombre)))}
                        className="mr-1 underline decoration-dotted text-slate-600 hover:text-slate-900">
                        {c.fullName} ({c.team || 'sin equipo'})
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {yaEstan.length > 0 && (
            <p className="text-[11px] text-slate-400">✓ {yaEstan.length} ya figuraban en {equipo}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MatchDetailModal — ficha del partido ─────────────────────
// Todo lo del partido en una ventana: scouts asignados (varios), jugadores
// vistos con los informes de cada scout, y buscador/sugeridos para añadir más.

function MatchDetailModal({
  match, scouts, profiles, currentProfile, isAdmin,
  scoutingPlayers, linkedPlayerIds, scoutingReports, allMatches, matchPlayersByMatchId,
  onClose, onEdit, onToggleStatus,
  onAddScout, onRemoveScout, onSetScoutStatus, onSetScoutMode,
  onAddMatchPlayer, onRemoveMatchPlayer, onAddReport, onLinkReportToMatch, onCreateAndLinkPlayer,
  onFixPlayerTeam, onOpenPlayer, onOpenMatch, showToast,
  variant = 'modal',
}: {
  match: ScoutingMatch
  scouts: MatchScoutInfo[]
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  scoutingReports: ScoutingReport[]
  allMatches: ScoutingMatch[]
  matchPlayersByMatchId: Record<string, string[]>
  onClose: () => void
  onEdit: (m: ScoutingMatch) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onAddScout: (m: ScoutingMatch, scout: string) => void
  onRemoveScout: (m: ScoutingMatch, scout: string) => void
  onSetScoutStatus: (m: ScoutingMatch, scout: string, status: 'pendiente' | 'visto') => void
  onSetScoutMode: (m: ScoutingMatch, scout: string, viewMode: 'campo' | 'video') => void
  onAddMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onAddReport: (r: ScoutingReport) => void
  /** matchId = null → suelta el informe del partido (sin borrarlo) */
  onLinkReportToMatch: (r: ScoutingReport, matchId: string | null) => Promise<void>
  /** Crea un jugador que no estaba en la BBDD y lo vincula al partido */
  onCreateAndLinkPlayer: (nombre: string, equipo: string, matchId: string) => Promise<void>
  /** Corrige en la BBDD el equipo de un jugador */
  onFixPlayerTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
  onOpenPlayer?: (id: string) => void
  /** Saltar a la ficha de otro partido sin salir de la pantalla */
  onOpenMatch?: (id: string) => void
  showToast?: ShowToast
  /** 'modal' = ventana flotante (móvil) · 'panel' = columna fija a la derecha */
  variant?: 'modal' | 'panel'
}) {
  const [playerSearch, setPlayerSearch] = useState('')
  const [suggYearFilter, setSuggYearFilter] = useState<string | null>(null)
  const [suggPosFilter, setSuggPosFilter] = useState<PosGroup | null>(null)
  const [reportFormFor, setReportFormFor] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [quickConclusion, setQuickConclusion] = useState<ConclusionOption>('')
  const [savingQuick, setSavingQuick] = useState(false)
  const [addScoutOpen, setAddScoutOpen] = useState(false)
  const [informeAbierto, setInformeAbierto] = useState<string | null>(null)

  useEscapeKey(onClose)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'

  const linkedPlayers = scoutingPlayers.filter(p => linkedPlayerIds.includes(p.id))

  const matchReportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    for (const r of scoutingReports) {
      if (r.matchId !== match.id) continue
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    return map
  }, [scoutingReports, match.id])

  // Informes escritos por esas mismas fechas pero SIN vincular a este partido
  // (el scout los escribió desde la ficha del jugador). Se enseñan igual, en
  // gris, con un botón para engancharlos al partido de un clic.
  const looseReportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    const matchTime = new Date(match.date).getTime()
    if (isNaN(matchTime)) return map
    for (const r of scoutingReports) {
      if (r.matchId === match.id) continue
      const d = r.fecha ?? r.createdAt
      if (!d) continue
      const t = new Date(d).getTime()
      if (isNaN(t) || Math.abs(t - matchTime) > 4 * 86400000) continue   // ±4 días
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    return map
  }, [scoutingReports, match.id, match.date])
  const linkedWithReport = linkedPlayers.filter(p => (matchReportsByPlayer[p.id] ?? []).length > 0).length

  // Resumen del partido: cuántos informes y qué se concluyó
  const totalInformes = Object.values(matchReportsByPlayer).reduce((n, rs) => n + rs.length, 0)
  const conclusionCounts = useMemo(() => {
    const m: Record<string, number> = {}
    Object.values(matchReportsByPlayer).forEach(rs => rs.forEach(r => {
      const c = normConclusion(r.conclusion)
      if (c) m[c] = (m[c] ?? 0) + 1
    }))
    return m
  }, [matchReportsByPlayer])

  // Los jugadores se agrupan por equipo: local, visitante y «otros», que es
  // como se mira un partido de verdad
  const playersBySide = useMemo(() => {
    const local: ScoutingPlayer[] = []
    const visitante: ScoutingPlayer[] = []
    const otros: ScoutingPlayer[] = []
    linkedPlayers.forEach(p => {
      if (teamMatchKind(match.homeTeam, p.team)) local.push(p)
      else if (teamMatchKind(match.awayTeam, p.team)) visitante.push(p)
      else otros.push(p)
    })
    return [
      { titulo: match.homeTeam, jugadores: local },
      { titulo: match.awayTeam, jugadores: visitante },
      { titulo: 'Otros equipos', jugadores: otros },
    ].filter(g => g.jugadores.length > 0)
  }, [linkedPlayers, match.homeTeam, match.awayTeam])

  // Otros partidos de estos mismos equipos, para saltar de uno a otro
  const partidosRelacionados = useMemo(() => allMatches
    .filter(m => m.id !== match.id &&
      (teamMatchKind(m.homeTeam, match.homeTeam) || teamMatchKind(m.awayTeam, match.homeTeam) ||
       teamMatchKind(m.homeTeam, match.awayTeam) || teamMatchKind(m.awayTeam, match.awayTeam)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4), [allMatches, match.id, match.homeTeam, match.awayTeam])

  async function handleAddPlayer(playerId: string) {
    try {
      await onAddMatchPlayer(match.id, playerId)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      showToast?.(
        err?.code === '23503'
          ? 'Ese partido ya no existe (se fusionó con otro). Recarga la página.'
          : `Error al vincular el jugador: ${err?.message ?? 'desconocido'}`,
        'error')
    }
  }

  async function handleRemovePlayer(playerId: string) {
    try {
      await onRemoveMatchPlayer(match.id, playerId)
    } catch {
      showToast?.('Error al desvincular el jugador del partido', 'error')
    }
  }

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
    const byTeam = new Map<string, SuggestWhy>()
    for (const p of scoutingPlayers) {
      if (linkedPlayerIds.includes(p.id)) continue
      const kind = teamMatchKind(p.team, match.homeTeam) ?? teamMatchKind(p.team, match.awayTeam)
      if (kind === 'exacto') byTeam.set(p.id, 'equipo')
      else if (kind === 'parcial') byTeam.set(p.id, 'posible')
    }
    for (const m2 of allMatches) {
      if (m2.id === match.id) continue
      const sameFixture =
        (teamsAlike(m2.homeTeam, match.homeTeam) && teamsAlike(m2.awayTeam, match.awayTeam)) ||
        (teamsAlike(m2.homeTeam, match.awayTeam) && teamsAlike(m2.awayTeam, match.homeTeam))
      const sameTeams = sameFixture ||
        teamsAlike(m2.homeTeam, match.homeTeam) || teamsAlike(m2.homeTeam, match.awayTeam) ||
        teamsAlike(m2.awayTeam, match.homeTeam) || teamsAlike(m2.awayTeam, match.awayTeam)
      if (!sameTeams) continue
      for (const pid of (matchPlayersByMatchId[m2.id] ?? [])) {
        if (linkedPlayerIds.includes(pid) || byTeam.has(pid)) continue
        const sp = scoutingPlayers.find(x => x.id === pid)
        if (!sp) continue
        if (sp.team?.trim() && !sameFixture) continue
        byTeam.set(pid, 'historial')
      }
    }
    return Array.from(byTeam.entries())
      .map(([id, why]) => ({ p: scoutingPlayers.find(sp => sp.id === id)!, why }))
      .filter(x => x.p)
  }, [scoutingPlayers, linkedPlayerIds, allMatches, matchPlayersByMatchId, match.id, match.homeTeam, match.awayTeam])

  const suggYears = useMemo(() =>
    Array.from(new Set(suggestionPool.map(x => x.p.birthdate?.slice(0, 4)).filter(Boolean) as string[]))
      .sort((a, b) => b.localeCompare(a)),
  [suggestionPool])
  const suggPosGroups = useMemo(() =>
    POS_GROUPS.filter(g => suggestionPool.some(x => posGroupOf(x.p.position1) === g || posGroupOf(x.p.position2) === g)),
  [suggestionPool])

  // Sin tope: se muestran todos los sugeridos (el contenedor hace scroll)
  const teamSuggested = suggestionPool
    .filter(x => !suggYearFilter || x.p.birthdate?.slice(0, 4) === suggYearFilter)
    .filter(x => !suggPosFilter || posGroupOf(x.p.position1) === suggPosFilter || posGroupOf(x.p.position2) === suggPosFilter)
    .sort((a, b) => (a.why === b.why
      ? a.p.fullName.localeCompare(b.p.fullName)
      : SUGGEST_ORDER[a.why] - SUGGEST_ORDER[b.why]))

  const searchMatches = playerSearch.length >= 2
    ? scoutingPlayers.filter(p =>
        !linkedPlayerIds.includes(p.id) &&
        p.fullName.toLowerCase().includes(playerSearch.toLowerCase())
      )
    : []
  const searchResults = playerSearch.length >= 2
    ? searchMatches.slice(0, SEARCH_LIMIT).map(p => ({ p, why: 'busqueda' as const }))
    : teamSuggested

  const freeProfiles = profiles.filter(p => p.avatar && !scouts.some(s => s.scout === p.avatar))

  const esPanel = variant === 'panel'

  return (
    <FichaCarcasa esPanel={esPanel} onClose={onClose}>
      <>
        {/* ── Cabecera ── */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">{day} {mon} '{yr}{match.time ? ` · ${match.time}` : ''}</span>
              {match.competition && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{match.competition}</span>}
              {match.viewMode === 'campo'
                ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">🏟️ Campo</span>
                : <span className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium">📹 Vídeo</span>}
            </div>
            <h3 className="mt-1 text-base font-bold text-slate-800 break-words">
              {match.homeTeam} <span className="text-slate-400 font-medium">vs</span> {match.awayTeam}
            </h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggleStatus(match)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                isVisto
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Estado del partido"
            >
              {isVisto ? '✓ Visto' : 'Pendiente'}
            </button>
            <button onClick={() => { onEdit(match); onClose() }} className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg" title="Editar partido" aria-label="Editar partido">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={`px-4 sm:px-5 py-4 space-y-5 overflow-y-auto ${esPanel ? 'max-h-[calc(100vh-13rem)]' : 'max-h-[72vh]'}`}>
          {/* ── Scouts asignados ── */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Scouts asignados {scouts.length > 1 ? `(${scouts.length})` : ''}
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {scouts.map(s => {
                const c = scoutColor(s.scout)
                const name = personaToName(s.scout, profiles)
                const isMe = s.scout === currentProfile.avatar
                return (
                  <span key={s.scout} className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
                    <span className="font-mono">{s.scout}</span>
                    {name && name !== s.scout && <span className="font-normal opacity-70">{name}</span>}
                    <button
                      onClick={() => onSetScoutMode(match, s.scout, s.viewMode === 'campo' ? 'video' : 'campo')}
                      title={s.viewMode === 'campo' ? 'Lo vio en el campo — clic para cambiar a vídeo' : 'Lo vio por vídeo — clic para cambiar a campo'}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                        s.viewMode === 'campo'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      {s.viewMode === 'campo' ? '🏟️ Campo' : '📹 Vídeo'}
                    </button>
                    <button
                      onClick={() => onSetScoutStatus(match, s.scout, s.status === 'visto' ? 'pendiente' : 'visto')}
                      title={s.status === 'visto' ? 'Ya lo ha visto — marcar como pendiente' : 'Marcar como visto'}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors ${
                        s.status === 'visto'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white'
                      }`}
                    >
                      {s.status === 'visto' ? '✓ visto' : isMe ? 'marcar visto' : 'pendiente'}
                    </button>
                    {(isAdmin || isMe) && (
                      <button
                        onClick={() => onRemoveScout(match, s.scout)}
                        aria-label={`Quitar a ${name || s.scout} del partido`}
                        className="text-slate-400 hover:text-red-500 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                )
              })}
              {addScoutOpen ? (
                <select
                  autoFocus
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                  defaultValue=""
                  onBlur={() => setAddScoutOpen(false)}
                  onChange={e => { if (e.target.value) onAddScout(match, e.target.value); setAddScoutOpen(false) }}
                >
                  <option value="">Añadir scout…</option>
                  {freeProfiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setAddScoutOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 px-2 py-1 rounded-full transition-colors"
                >
                  <Plus className="w-3 h-3" /> Añadir scout
                </button>
              )}
              {scouts.length === 0 && <span className="text-xs text-slate-400 italic">Nadie asignado todavía</span>}
            </div>
            {scouts.length > 1 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Cada scout marca su parte y escribe su propio informe de cada jugador.
              </p>
            )}
          </div>

          {/* ── Resumen de un vistazo ── */}
          {linkedPlayers.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { n: linkedPlayers.length, l: 'jugadores vistos', cls: 'text-slate-800' },
                { n: totalInformes, l: totalInformes === 1 ? 'informe' : 'informes', cls: 'text-slate-800' },
                { n: conclusionCounts['Llamar'] ?? 0, l: 'Llamar', cls: 'text-amber-600' },
                { n: conclusionCounts['Descartar'] ?? 0, l: 'Descartar', cls: 'text-slate-500' },
              ].map(x => (
                <div key={x.l} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <div className={`text-base font-bold leading-none ${x.cls}`}>{x.n}</div>
                  <div className="text-[10.5px] text-slate-500 mt-0.5">{x.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Notas del partido ── */}
          {match.notes && (
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Notas</span>
              <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap break-words">{match.notes}</p>
            </div>
          )}

          {/* ── Jugadores vistos ── */}
          <div>
            <span className="text-[11px] font-semibold text-violet-600 uppercase tracking-wide">
              Vistos en este partido · {linkedPlayers.length} jugador{linkedPlayers.length !== 1 ? 'es' : ''} · {linkedWithReport} con informe
            </span>
            <div className="mt-1.5 space-y-1.5">
              {linkedPlayers.length === 0 && (
                <p className="text-xs text-slate-400 italic">Aún no hay jugadores vinculados a este partido.</p>
              )}
              {playersBySide.flatMap(grupo => grupo.jugadores.map((p, i) => {
                const pReports = matchReportsByPlayer[p.id] ?? []
                const isFormOpen = reportFormFor === p.id
                // Cada scout puede escribir SU informe del mismo jugador en el mismo
                // partido: el botón solo desaparece si ya escribí yo.
                const myReport = pReports.find(r =>
                  (r.authorId && r.authorId === currentProfile.id) || r.persona === currentProfile.avatar)
                return (
                  <div key={p.id}>
                  {/* Cabecera del equipo: se ve de un vistazo de qué lado juega cada uno */}
                  {i === 0 && (
                    <div className="flex items-center gap-1.5 mt-2 mb-1 first:mt-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{grupo.titulo}</span>
                      <span className="text-[10px] text-slate-400">{grupo.jugadores.length}</span>
                      <span className="flex-1 h-px bg-slate-100" />
                    </div>
                  )}
                  <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
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
                      {/* Un chip por informe: se ve quién ha escrito cada uno */}
                      {pReports.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setInformeAbierto(id => id === r.id ? null : r.id)}
                          title="Ver el informe completo"
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            (r.authorId && r.authorId === currentProfile.id) || r.persona === currentProfile.avatar
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                          } ${informeAbierto === r.id ? 'ring-1 ring-slate-300' : ''}`}
                        >
                          ✓ {r.persona ?? '—'}
                          {normConclusion(r.conclusion) && (
                            <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${CONCLUSION_STYLE[normConclusion(r.conclusion)!] ?? 'bg-slate-100 text-slate-500'}`}>
                              {normConclusion(r.conclusion)}
                            </span>
                          )}
                        </button>
                      ))}
                      {/* Informes de esas fechas que no están enganchados a este
                          partido. Los que YA son de otro partido se enseñan solo
                          como contexto, sin botón: el ⇄ se los robaba al partido
                          al que pertenecían y no había forma de deshacerlo. */}
                      {(looseReportsByPlayer[p.id] ?? []).map(r => {
                        const otherMatch = r.matchId ? allMatches.find(m => m.id === r.matchId) : undefined
                        return (
                          <span
                            key={r.id}
                            title={otherMatch
                              ? `Informe de ${r.persona ?? '—'} en ${otherMatch.homeTeam} vs ${otherMatch.awayTeam} (${fmtDate(otherMatch.date)}). Pertenece a ese partido; aquí sale solo como referencia.`
                              : `Informe de ${r.persona ?? '—'} sin partido asignado — pulsa ⇄ para vincularlo a este`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 bg-white"
                          >
                            {r.persona ?? '—'}
                            {normConclusion(r.conclusion) && (
                              <span className="ml-0.5 px-1.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
                                {normConclusion(r.conclusion)}
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400">
                              {otherMatch ? `${otherMatch.homeTeam} – ${otherMatch.awayTeam}` : 'sin partido'}
                            </span>
                            {!otherMatch && (
                              <button
                                onClick={() => void onLinkReportToMatch(r, match.id)}
                                className="ml-0.5 text-slate-400 hover:text-primary font-bold"
                                aria-label="Vincular este informe al partido"
                              >
                                ⇄
                              </button>
                            )}
                          </span>
                        )
                      })}
                      {!myReport && (
                        <button
                          onClick={() => {
                            setReportFormFor(isFormOpen ? null : p.id)
                            setQuickText('')
                            setQuickConclusion('')
                          }}
                          className="text-[11px] font-bold border border-primary text-primary bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          {isFormOpen ? 'Cancelar' : pReports.length > 0 ? '+ Mi informe' : '+ Informe'}
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
                              title={c === 'Visto'
                                ? 'Lo he visto y no concluyo (poco rato, mal partido, no da para decidir). No cuenta como veredicto en las estadísticas.'
                                : undefined}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                                quickConclusion === c
                                  ? (CONCLUSION_STYLE[c] ?? 'bg-slate-200 text-slate-700')
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                              } ${c === 'Visto' ? 'ml-1' : ''}`}
                            >
                              {c}
                            </button>
                          ))}
                          {!quickConclusion && (
                            <span className="text-[10px] text-slate-400">o déjalo sin marcar</span>
                          )}
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
                    {/* Informe desplegado: antes había que adivinarlo por el tooltip */}
                    {pReports.filter(r => r.id === informeAbierto).map(r => (
                      <div key={r.id} className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-slate-600">{personaToName(r.persona, profiles) || r.persona}</span>
                          <span className="text-[10.5px] text-slate-400">{fmtDate(r.fecha ?? r.createdAt)}</span>
                          {r.titulo && <span className="text-[10.5px] text-slate-500 italic truncate">{r.titulo}</span>}
                          {/* Deshacer: si un informe se enganchó aquí por error,
                              se suelta sin tener que tocar la base de datos */}
                          <button
                            onClick={() => {
                              if (confirm(`¿Quitar este informe de ${match.homeTeam} – ${match.awayTeam}?\n\nEl informe NO se borra: sigue en la ficha de ${p.fullName}, solo deja de estar asignado a este partido.`)) {
                                void onLinkReportToMatch(r, null)
                              }
                            }}
                            className="ml-auto text-[10px] font-semibold text-slate-400 hover:text-red-500"
                            title="Quitar este informe del partido (no se borra)"
                          >
                            quitar del partido
                          </button>
                          <button onClick={() => setInformeAbierto(null)} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar informe">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                          {r.texto || <span className="italic text-slate-400">Sin texto</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                  </div>
                )
              }))}
            </div>
          </div>

          {/* ── Pegar alineación de una web ── */}
          <PegarAlineacion
            match={match}
            scoutingPlayers={scoutingPlayers}
            linkedPlayerIds={linkedPlayerIds}
            onLink={async (playerId) => { await handleAddPlayer(playerId) }}
            onCreateAndLink={async (nombre, equipo) => { await onCreateAndLinkPlayer(nombre, equipo, match.id) }}
            onFixTeam={onFixPlayerTeam}
          />

          {/* ── Otros partidos de estos equipos ── */}
          {partidosRelacionados.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Otros partidos de estos equipos</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {partidosRelacionados.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onOpenMatch?.(m.id)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors"
                    title={`${(matchPlayersByMatchId[m.id] ?? []).length} jugadores vinculados`}
                  >
                    {m.homeTeam} vs {m.awayTeam}
                    <span className="text-slate-400"> · {fmtDate(m.date)}</span>
                    {(matchPlayersByMatchId[m.id] ?? []).length > 0 && (
                      <span className="ml-1 text-violet-500 font-semibold">{(matchPlayersByMatchId[m.id] ?? []).length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Buscar / sugerencias con afinado ── */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
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
                  {suggYears.slice(0, 8).map(y => (
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
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-1 items-center">
                    {playerSearch.length < 2 && teamSuggested.length > 0 && (
                      <span className="text-[11px] text-violet-500 font-semibold uppercase tracking-wide mr-1">
                        Sugeridos ({teamSuggested.length}):
                      </span>
                    )}
                    {playerSearch.length >= 2 && (
                      <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mr-1">
                        {searchMatches.length > SEARCH_LIMIT
                          ? `${SEARCH_LIMIT} de ${searchMatches.length} — afina la búsqueda:`
                          : `${searchMatches.length} resultado${searchMatches.length !== 1 ? 's' : ''}:`}
                      </span>
                    )}
                    {searchResults.map(({ p, why }) => (
                      <button
                        key={p.id}
                        onClick={() => { handleAddPlayer(p.id); setPlayerSearch('') }}
                        className={`text-xs bg-white border px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                          why === 'equipo' || why === 'busqueda'
                            ? 'border-violet-200 text-violet-700 hover:bg-violet-100'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <Plus className="w-3 h-3" />{p.fullName}
                        <span className={why === 'equipo' || why === 'busqueda' ? 'text-violet-400 text-[11px]' : 'text-slate-400 text-[11px]'}>
                          {[p.birthdate ? `'${p.birthdate.slice(2, 4)}` : null, p.team].filter(Boolean).join(' · ')}
                          {SUGGEST_LABEL[why]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : playerSearch.length >= 2 ? (
                <span className="text-xs text-slate-400 italic">Sin resultados</span>
              ) : suggestionPool.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Busca un jugador para vincularlo al partido</span>
              ) : teamSuggested.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Ningún sugerido con esos filtros — <button className="underline" onClick={() => { setSuggYearFilter(null); setSuggPosFilter(null) }}>quitar afinado</button></span>
              ) : null}
            </div>
          </div>
        </div>
      </>
    </FichaCarcasa>
  )
}

// ── MergeMatchesModal ─────────────────────────────────────────
// Fusión manual: eliges qué copia sobrevive y con qué fecha; el resto
// aporta sus scouts, jugadores e informes y se elimina.
function MergeMatchesModal({ matches, scoutsByMatch, matchPlayersByMatchId, scoutingReports, merging, onClose, onConfirm }: {
  matches: ScoutingMatch[]
  scoutsByMatch: Record<string, MatchScoutInfo[]>
  matchPlayersByMatchId: Record<string, string[]>
  scoutingReports: ScoutingReport[]
  merging: boolean
  onClose: () => void
  onConfirm: (survivorId: string, newDate: string) => void
}) {
  const info = (m: ScoutingMatch) => ({
    jug: (matchPlayersByMatchId[m.id] ?? []).length,
    inf: scoutingReports.filter(r => r.matchId === m.id).length,
    scouts: (scoutsByMatch[m.id] ?? []).map(x => x.scout),
  })
  // Superviviente por defecto: la copia con más contenido
  const defaultSurvivor = [...matches].sort((a, b) => {
    const ia = info(a), ib = info(b)
    return (ib.jug + ib.inf) - (ia.jug + ia.inf) || a.createdAt.localeCompare(b.createdAt)
  })[0]
  const [survivorId, setSurvivorId] = useState(defaultSurvivor.id)
  const [newDate, setNewDate] = useState(defaultSurvivor.date)

  useEscapeKey(onClose, !merging)

  const survivor = matches.find(m => m.id === survivorId)!
  const others = matches.filter(m => m.id !== survivorId)
  const totalScouts = new Set(matches.flatMap(m => info(m).scouts)).size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={merging ? undefined : onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800">Fusionar {matches.length} partidos en uno</h3>
          <button onClick={onClose} disabled={merging} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Elige qué copia se queda. Las demás le pasan sus scouts, jugadores vinculados e informes (cada informe conserva su autor) y se eliminan. No se pierde nada.
        </p>

        <div className="space-y-1.5">
          {matches.map(m => {
            const i = info(m)
            const sel = m.id === survivorId
            return (
              <label
                key={m.id}
                className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  sel ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="survivor"
                  checked={sel}
                  onChange={() => { setSurvivorId(m.id); setNewDate(m.date) }}
                  className="mt-1 accent-violet-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {m.homeTeam} <span className="text-slate-400 font-normal">vs</span> {m.awayTeam}
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                    <span className="font-medium">{m.date}{m.time ? ` · ${m.time}` : ''}</span>
                    {m.competition && <span>{m.competition}</span>}
                    <span>{i.scouts.length > 0 ? i.scouts.join(' + ') : 'sin scout'}</span>
                    <span className="text-violet-600">{i.jug} jug · {i.inf} inf</span>
                  </div>
                </div>
                {sel && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5 flex-shrink-0 mt-0.5">SE QUEDA</span>}
              </label>
            )
          })}
        </div>

        <div className="mt-3">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Fecha del partido fusionado</label>
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-500">
          Resultado: <strong>{survivor.homeTeam} vs {survivor.awayTeam}</strong> el <strong>{newDate}</strong> con {totalScouts} scout{totalScouts !== 1 ? 's' : ''},{' '}
          {matches.reduce((n, m) => n + info(m).jug, 0)} vínculos de jugador y {matches.reduce((n, m) => n + info(m).inf, 0)} informes.
          Se eliminarán {others.length} copia{others.length !== 1 ? 's' : ''}.
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={merging} className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(survivorId, newDate)}
            disabled={merging || !newDate}
            className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {merging && <Spinner />}
            {merging ? 'Fusionando…' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
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

// Tipos de PRÓXIMA ACCIÓN: los del historial + "Conseguir teléfono" (📵).
// Pedido por Pablo: muchos jugadores en "Llamar" están realmente en fase de
// conseguir el número; el 📵 en la tarjeta lo distingue de un vistazo.
const FIRMAS_ACTION_KIND_META: Record<string, { icon: string; label: string }> = {
  ...FIRMAS_KIND_META,
  telefono: { icon: '📵', label: 'Conseguir teléfono' },
}

// ¿Está pendiente de conseguir teléfono? Detecta tanto el tipo explícito
// como el texto de acciones ya existentes ("Conseguir teléfono", "buscar
// número", "tlf", "móvil"…), así funciona retroactivamente sin tocar datos.
const necesitaTelefono = (e: FirmasEntry): boolean =>
  e.status !== 'firmado' && (
    e.nextActionKind === 'telefono' ||
    /tel[eé]fono|n[uú]mero|\btlf\b|m[oó]vil/i.test(e.nextAction ?? '')
  )

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
            {FIRMAS_ACTION_KIND_META[entry.nextActionKind ?? '']?.icon ?? '📌'} {entry.nextAction ?? 'Acción'} · {fmtDate(entry.nextActionDate)}
          </span>
        )}
        {necesitaTelefono(entry) && (
          <span className="rounded px-1.5 py-0.5 bg-violet-50 text-violet-700">📵 sin teléfono</span>
        )}
      </div>
      {lastComment && (
        <div className="mt-2 bg-slate-50 rounded-lg px-2 py-1.5 text-[11px] text-slate-600">
          {FIRMAS_ACTION_KIND_META[lastComment.kind ?? 'nota']?.icon} {lastComment.text.length > 90 ? lastComment.text.slice(0, 90) + '…' : lastComment.text}
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
  matchPlayers, boulemaPeticiones, players, onCreatePlayer, onSyncActionTasks,
  onCreate, onUpdate, onDelete, onOpenScoutingPlayer, showToast, headerHeight,
  openEntryId, onOpenEntryConsumed,
}: {
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  onSyncActionTasks?: () => Promise<number>
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
  const [showAgenda, setShowAgenda] = useState(false)
  const [showResumen, setShowResumen] = useState(false)
  const [syncingTasks, setSyncingTasks] = useState(false)
  const [dragOverCol, setDragOverCol] = useState<FirmasStatus | null>(null)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const touchStart = React.useRef<{ x: number; y: number } | null>(null)

  // ── versión móvil: estatus/encargado seleccionados en las píldoras ──
  const [mobStatus, setMobStatus] = useState<FirmasStatus | 'all'>('all')
  const [mobManager, setMobManager] = useState<string>('')

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
    const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const minus14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString()
    const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const in30 = Date.now() + 30 * 86400000
    const in180 = Date.now() + 180 * 86400000

    const active = entries.filter(e => e.status !== 'firmado')

    // caliente sin próxima acción programada — el olvido más caro
    active.filter(e => e.status === 'caliente' && !e.nextActionDate).forEach(e => {
      out.push({ icon: '🔥', tone: 'red', entryId: e.id, text: `${e.playerName} está caliente sin próxima acción programada — ponle fecha` })
    })

    // alta sin encargado
    active.filter(e => e.managers.length === 0).forEach(e => {
      out.push({ icon: '👤', tone: 'red', entryId: e.id, text: `${e.playerName} no tiene encargado asignado` })
    })

    // incoherencia con el assessment de scouting.
    // Nota: que en scouting esté en «Llamar» y aquí frío/templado es NORMAL —
    // el proceso natural es: scouting decide «Llamar» → pasa a Firmar, y aquí
    // vive su propio estatus. Solo avisamos del caso contradictorio (Descartado).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (sp?.assessment === 'Descartado') {
        out.push({ icon: '🚫', tone: 'red', entryId: e.id, text: `${e.playerName}: en scouting está Descartado — ¿sacarlo del pipeline?` })
      }
    })

    // frío que se calienta solo: 2+ informes «Llamar» en 90 días
    active.filter(e => e.status === 'frio' && e.scoutingPlayerId).forEach(e => {
      const n = (reportsByPlayer[e.scoutingPlayerId!] ?? [])
        .filter(r => (r.fecha ?? r.createdAt) >= since90 && normConclusion(r.conclusion) === 'Llamar').length
      if (n >= 2) out.push({ icon: '📈', tone: 'amber', entryId: e.id, text: `${e.playerName} acumula ${n} informes «Llamar» recientes — candidato a recalentar` })
    })

    // le vieron en un partido (añadido al campograma, últimos 14 días)
    const recentMatches = new Map(scoutingMatches.filter(m => m.date <= today && m.date >= minus14).map(m => [m.id, m]))
    const seenByPlayer: Record<string, ScoutingMatch> = {}
    matchPlayers.forEach(mp => {
      const m = recentMatches.get(mp.matchId)
      if (m && (!seenByPlayer[mp.playerId] || m.date > seenByPlayer[mp.playerId].date)) seenByPlayer[mp.playerId] = m
    })
    active.forEach(e => {
      const m = e.scoutingPlayerId ? seenByPlayer[e.scoutingPlayerId] : undefined
      if (m) out.push({ icon: '👀', tone: 'green', entryId: e.id, text: `A ${e.playerName} le vieron el ${fmtDate(m.date)} en ${m.homeTeam} vs ${m.awayTeam} — buen momento para llamar` })
    })

    // partidos de Captación registrados (≤30 días vista) donde juega su equipo
    const upcoming = scoutingMatches.filter(m => m.date >= today && m.date <= plus30).sort((a, b) => a.date.localeCompare(b.date))
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

    // también está en Boulema: petición de informe sobre el mismo jugador
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const names = new Set([normSearch(e.playerName), ...(sp ? [normSearch(sp.fullName)] : [])])
      const pet = boulemaPeticiones.find(p => names.has(normSearch(p.playerName)))
      if (pet) out.push({ icon: '📥', tone: 'blue', entryId: e.id, text: `Hay una petición en Boulema sobre ${e.playerName} (pedida por ${pet.requestedBy})` })
    })

    // cambio de club en su ficha de scouting
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (sp?.team && e.knownTeam && !teamsAlike(e.knownTeam, sp.team)) {
        out.push({ icon: '🔁', tone: 'amber', entryId: e.id, text: `${e.playerName} cambió de club: ${e.knownTeam} → ${sp.team} — revisa la zona (confírmalo en su panel)` })
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

    // firmado que aún no está en Mantenimiento
    entries.filter(e => e.status === 'firmado').forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const nm = normSearch(sp?.fullName ?? e.playerName)
      if (!players.some(p => normSearch(p.name) === nm)) {
        out.push({ icon: '🎉', tone: 'green', entryId: e.id, text: `${e.playerName} está firmado y aún no está en Mantenimiento — créalo desde su panel` })
      }
    })

    const rank = { red: 0, amber: 1, blue: 2, green: 3 }
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 40)
  }, [entries, spById, scoutingMatches, matchPlayers, reportsByPlayer, boulemaPeticiones, players])

  // ── agenda: todas las próximas acciones pendientes, por fecha ──
  const agenda = useMemo(() =>
    entries
      .filter(e => e.status !== 'firmado' && e.nextActionDate)
      .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? '')),
  [entries])

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
        draggable={canHover}
        onDragStart={ev => { endHover(); ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move' }}
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
          {necesitaTelefono(e) && !(e.nextActionDate && e.nextActionKind === 'telefono') && (
            <span className="flex-shrink-0" title="Pendiente de conseguir teléfono">📵</span>
          )}
          {e.nextActionDate && e.status !== 'firmado' && (
            <span
              className={`flex-shrink-0 font-medium ${actionOverdue ? 'text-red-500' : actionToday ? 'text-blue-600' : 'text-slate-400'}`}
              title={`${e.nextAction ?? 'Próxima acción'} · ${fmtDate(e.nextActionDate)}`}
            >
              {FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'} {actionOverdue ? 'vencida' : actionToday ? 'hoy' : new Date(e.nextActionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
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

  // ── fila compacta para la lista móvil ──
  const mobileRow = (e: FirmasEntry, showStatusDot = true) => {
    const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
    const aging = firmasAging(e)
    const actionOverdue = !!e.nextActionDate && e.nextActionDate < todayISO() && e.status !== 'firmado'
    const actionToday = e.nextActionDate === todayISO()
    // deslizada: fila de estatus rápidos
    if (swipedId === e.id) {
      return (
        <div key={e.id} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50">
          <span className="text-xs font-semibold text-slate-700 truncate flex-1 min-w-0">{e.playerName}</span>
          {FIRMAS_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { if (s !== e.status) changeStatus(e, s); setSwipedId(null) }}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                s === e.status ? `${FIRMAS_CONFIG[s].bg} ${FIRMAS_CONFIG[s].border} ring-1 ring-current ${FIRMAS_CONFIG[s].text}` : 'bg-white border-slate-200'
              }`}
              title={FIRMAS_CONFIG[s].label}
              aria-label={FIRMAS_CONFIG[s].label}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
            </button>
          ))}
          <button onClick={() => setSwipedId(null)} aria-label="Cerrar" className="p-1 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
      )
    }
    return (
      <button
        key={e.id}
        onClick={() => setPanelId(e.id)}
        onTouchStart={ev => { touchStart.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY } }}
        onTouchEnd={ev => {
          const s0 = touchStart.current
          touchStart.current = null
          if (!s0) return
          const dx = ev.changedTouches[0].clientX - s0.x
          const dy = ev.changedTouches[0].clientY - s0.y
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
            ev.preventDefault()
            setSwipedId(dx < 0 ? e.id : null)
          }
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 transition-colors"
      >
        {showStatusDot && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[e.status].dot}`} title={FIRMAS_CONFIG[e.status].label} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800 truncate leading-tight">{e.playerName}</span>
          <span className="block text-[11px] text-slate-400 truncate">
            {sp
              ? [sp.team, sp.birthdate ? sp.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || e.zone
              : e.zone}
            {necesitaTelefono(e) && !(e.nextActionDate && e.nextActionKind === 'telefono') && (
              <span className="ml-1.5" title="Pendiente de conseguir teléfono">📵</span>
            )}
            {e.nextActionDate && e.status !== 'firmado' && (
              <span className={`ml-1.5 font-medium ${actionOverdue ? 'text-red-500' : actionToday ? 'text-blue-600' : 'text-slate-400'}`}>
                {FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'} {actionOverdue ? 'vencida' : actionToday ? 'hoy' : new Date(e.nextActionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </span>
        </span>
        {aging?.overdue && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title={`${aging.days} días sin tocar`} />}
        {!aging?.overdue && aging?.warn && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
        <FirmasManagers managerIds={e.managers} profiles={profiles} max={2} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
      </button>
    )
  }

  const mobileList = (list: FirmasEntry[], showStatusDot = true) => (
    list.length === 0 ? (
      <div className="bg-white border border-slate-200 rounded-lg py-8 text-center text-xs text-slate-400">Sin jugadores</div>
    ) : (
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
        {list.map(e => mobileRow(e, showStatusDot))}
      </div>
    )
  )

  // Tablero de columnas por estatus (compartido por vistas estatus y zona)
  const statusBoard = (list: FirmasEntry[]) => {
    const groups: Record<FirmasStatus, FirmasEntry[]> = { llamar: [], caliente: [], templado: [], frio: [], decidir: [], firmado: [] }
    list.forEach(e => groups[e.status].push(e))
    FIRMAS_STATUSES.forEach(s => groups[s].sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)))
    return (
      <div className="hidden sm:flex gap-3 overflow-x-auto pb-2 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {FIRMAS_STATUSES.map(s => (
          <div
            key={s}
            onDragOver={ev => { ev.preventDefault(); if (dragOverCol !== s) setDragOverCol(s) }}
            onDragLeave={() => setDragOverCol(cur => cur === s ? null : cur)}
            onDrop={ev => {
              ev.preventDefault()
              setDragOverCol(null)
              const id = ev.dataTransfer.getData('text/plain')
              const en = entries.find(x => x.id === id)
              if (en && en.status !== s) changeStatus(en, s)
            }}
            className={`flex-shrink-0 w-[240px] xl:w-auto bg-slate-50 border border-t-2 ${FIRMAS_CONFIG[s].col} rounded-lg transition-colors ${
              dragOverCol === s ? 'border-primary ring-2 ring-primary/30 bg-blue-50/50' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{FIRMAS_CONFIG[s].label}</span>
              <span className="text-[11px] text-slate-400 font-medium">{groups[s].length}</span>
              {groups[s].filter(necesitaTelefono).length > 0 && (
                <span className="ml-auto text-[11px] text-violet-600 font-medium" title="Pendientes de conseguir teléfono">
                  📵 {groups[s].filter(necesitaTelefono).length}
                </span>
              )}
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
          <h2 className="text-sm font-semibold text-slate-800">Pipeline/Firmar</h2>
          <p className="text-xs text-slate-400">Captación activa: jugadores en proceso de conseguir la firma, por zona y estatus</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => setShowResumen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
            title="Resumen semanal del pipeline, listo para copiar"
          >
            📋 <span className="hidden sm:inline">Resumen</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir jugador
          </button>
        </div>
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

          {/* Agenda: todas las próximas acciones programadas, por fecha */}
          {agenda.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAgenda(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-100/50 transition-colors"
              >
                <span className="text-sm">📌</span>
                <span className="text-xs font-semibold text-blue-800">Agenda · {agenda.length} próxima{agenda.length !== 1 ? 's' : ''} acci{agenda.length !== 1 ? 'ones' : 'ón'}</span>
                {agenda.some(e => (e.nextActionDate ?? '') < todayISO()) && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {agenda.filter(e => (e.nextActionDate ?? '') < todayISO()).length} vencida{agenda.filter(e => (e.nextActionDate ?? '') < todayISO()).length !== 1 ? 's' : ''}
                  </span>
                )}
                {onSyncActionTasks && agenda.some(e => !e.nextActionTaskId) && (
                  <span
                    onClick={async (ev) => {
                      ev.stopPropagation()
                      if (syncingTasks) return
                      setSyncingTasks(true)
                      try {
                        const n = await onSyncActionTasks()
                        showToast(n > 0 ? `${n} tarea${n !== 1 ? 's' : ''} creada${n !== 1 ? 's' : ''} en el tablero` : 'Todas las acciones ya tienen tarea', n > 0 ? 'success' : 'info')
                      } catch {
                        showToast('No se pudieron crear las tareas', 'error')
                      } finally {
                        setSyncingTasks(false)
                      }
                    }}
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
                    title="Crea una tarea en el tablero por cada acción que aún no la tenga (asignada a su encargado, con la fecha como límite)"
                  >
                    {syncingTasks ? 'Creando…' : `⇪ Crear tareas (${agenda.filter(e => !e.nextActionTaskId).length})`}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-blue-600 ml-auto flex-shrink-0 transition-transform ${showAgenda ? 'rotate-180' : ''}`} />
              </button>
              {showAgenda && (
                <div className="border-t border-blue-200 divide-y divide-blue-100 max-h-64 overflow-y-auto">
                  {agenda.map(e => {
                    const overdue = (e.nextActionDate ?? '') < todayISO()
                    const isToday = e.nextActionDate === todayISO()
                    const assignee = e.nextActionAssignee ? profiles.find(p => p.id === e.nextActionAssignee) : undefined
                    return (
                      <button
                        key={e.id}
                        onClick={() => setPanelId(e.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-100/40 transition-colors"
                      >
                        <span className={`flex-shrink-0 font-semibold tabular-nums ${overdue ? 'text-red-600' : isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                          {overdue ? '⚠ ' : ''}{isToday ? 'hoy' : new Date(e.nextActionDate!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="flex-shrink-0">{FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'}</span>
                        <span className="font-semibold truncate">{e.playerName}</span>
                        <span className="text-slate-500 truncate">{e.nextAction ?? ''}</span>
                        {assignee && (
                          <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono font-bold text-[10px]">
                            {assignee.avatar || assignee.name.split(' ')[0]}
                          </span>
                        )}
                      </button>
                    )
                  })}
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

          {/* ── Vista por ESTATUS: móvil = píldoras + lista · escritorio = tablero ── */}
          {view === 'estatus' && (
            <>
              <div className="sm:hidden space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
                  <button
                    onClick={() => setMobStatus('all')}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      mobStatus === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    Todos {filtered.length}
                  </button>
                  {FIRMAS_STATUSES.map(s => {
                    const n = filtered.filter(e => e.status === s).length
                    return (
                      <button
                        key={s}
                        onClick={() => setMobStatus(s)}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          mobStatus === s ? `${FIRMAS_CONFIG[s].bg} ${FIRMAS_CONFIG[s].text} ${FIRMAS_CONFIG[s].border} ring-1 ring-current` : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                        {FIRMAS_CONFIG[s].label} {n}
                      </button>
                    )
                  })}
                </div>
                {mobileList(
                  (mobStatus === 'all' ? [...filtered] : filtered.filter(e => e.status === mobStatus))
                    .sort((a, b) =>
                      FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) ||
                      a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)
                    ),
                  mobStatus === 'all'
                )}
              </div>
              {statusBoard(filtered)}
            </>
          )}

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
                    <div className="sm:hidden space-y-2.5">
                      {FIRMAS_STATUSES.map(s => {
                        const l = zoneEntries
                          .filter(e => e.status === s)
                          .sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName))
                        if (l.length === 0) return null
                        return (
                          <div key={s}>
                            <div className="flex items-center gap-1.5 px-1 pb-1">
                              <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{FIRMAS_CONFIG[s].label}</span>
                              <span className="text-[11px] text-slate-400">{l.length}</span>
                            </div>
                            {mobileList(l, false)}
                          </div>
                        )
                      })}
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
            const effManager = cols.some(c => c.profile.id === mobManager) || mobManager === 'sin'
              ? mobManager
              : (cols[0]?.profile.id ?? 'sin')
            const mobList = effManager === 'sin' ? noManager : (cols.find(c => c.profile.id === effManager)?.list ?? [])
            return (
              <>
              <div className="sm:hidden space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
                  {cols.map(({ profile: p, list }) => {
                    const c = scoutColor(p.avatar || p.name)
                    const active = effManager === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setMobManager(p.id)}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active ? `${c.bg} ${c.text} ${c.border} ring-1 ring-current` : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        {(p.avatar || p.name.slice(0, 2)).toUpperCase()} {list.length}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setMobManager('sin')}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      effManager === 'sin' ? 'bg-red-50 text-red-600 border-red-200 ring-1 ring-current' : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    ⚠ Sin encargado {noManager.length}
                  </button>
                </div>
                {mobileList(
                  [...mobList].sort((a, b) =>
                    FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) || a.playerName.localeCompare(b.playerName)
                  )
                )}
              </div>
              <div className="hidden sm:flex gap-3 overflow-x-auto pb-2 sm:mx-0 sm:px-0">
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
              </>
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
          players={players}
          onCreatePlayer={onCreatePlayer}
          showToast={showToast}
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

      {/* ── Resumen semanal (copiable) ── */}
      {showResumen && (() => {
        const active = entries.filter(e => e.status !== 'firmado')
        const calientes = active.filter(e => e.status === 'caliente')
        const vencidas = active.filter(e => e.nextActionDate && e.nextActionDate < todayISO())
        const desatendidos = active.filter(e => firmasAging(e)?.overdue)
        const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
        const firmados7 = entries.filter(e => e.status === 'firmado' && (e.signedAt ?? '') >= since7)
        const nombreEnc = (e: FirmasEntry) => e.managers.map(id => profiles.find(p => p.id === id)?.avatar).filter(Boolean).join('/')
        const lines: string[] = []
        lines.push(`📋 PIPELINE FIRMAR · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`)
        lines.push('')
        lines.push(`Activos: ${active.length} · ${FIRMAS_STATUSES.filter(s => s !== 'firmado').map(s => `${entries.filter(e => e.status === s).length} ${FIRMAS_CONFIG[s].label.toLowerCase()}`).join(' · ')}`)
        lines.push('')
        lines.push(`🔥 CALIENTES (${calientes.length})`)
        calientes.forEach(e => lines.push(`  · ${e.playerName} (${nombreEnc(e) || 'sin enc.'}) — ${e.nextAction ? `${e.nextAction} el ${e.nextActionDate ? fmtDate(e.nextActionDate) : 's/f'}` : '⚠ SIN PRÓXIMA ACCIÓN'}`))
        if (vencidas.length) {
          lines.push('')
          lines.push(`⏰ ACCIONES VENCIDAS (${vencidas.length})`)
          vencidas.forEach(e => lines.push(`  · ${e.playerName}: ${e.nextAction ?? 'acción'} (${e.nextActionDate ? fmtDate(e.nextActionDate) : ''}, ${nombreEnc(e) || '—'})`))
        }
        if (desatendidos.length) {
          lines.push('')
          lines.push(`🚨 DESATENDIDOS: ${desatendidos.length} (caliente +10d / templado +50d / frío +90d)`)
          desatendidos.slice(0, 8).forEach(e => lines.push(`  · ${e.playerName} (${FIRMAS_CONFIG[e.status].label.toLowerCase()}, ${firmasAging(e)?.days}d sin tocar)`))
          if (desatendidos.length > 8) lines.push(`  · … y ${desatendidos.length - 8} más`)
        }
        if (firmados7.length) {
          lines.push('')
          lines.push(`🎉 FIRMADOS ESTA SEMANA: ${firmados7.map(e => e.playerName).join(', ')}`)
        }
        const text = lines.join('\n')
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setShowResumen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">Resumen del pipeline</h3>
                <button onClick={() => setShowResumen(false)} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <pre className="flex-1 overflow-y-auto text-[11.5px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-sans">{text}</pre>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(text)
                      .then(() => showToast('Resumen copiado — pégalo en WhatsApp'))
                      .catch(() => showToast('No se pudo copiar', 'error'))
                  }}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  📋 Copiar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

// ── Botón "Añadir a Firmar" desde la ficha de un jugador ─────
// Si ya está en el pipeline muestra su estatus y salta a su tarjeta;
// si no, pide solo la zona y lo crea vinculado.
function AddToFirmasButton({ player, firmasEntries, currentProfile, onCreate, onJumpToEntry, showToast }: {
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

// ── Panel de detalle de una entrada del pipeline ─────────────
// Media pantalla en escritorio, dos columnas: datos | historial.
function FirmasDetailPanel({
  entry, profiles, currentProfile, scoutingPlayers, spById, reportsByPlayer,
  players, onCreatePlayer, showToast,
  zones, headerHeight, onClose, onPatch, onChangeStatus, onOpenScoutingPlayer, onRequestDelete,
}: {
  entry: FirmasEntry
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  spById: Record<string, ScoutingPlayer>
  reportsByPlayer: Record<string, ScoutingReport[]>
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  showToast: ShowToast
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

  // móvil: el panel se divide en pestañas para evitar el scroll infinito
  const [panelTab, setPanelTab] = useState<'datos' | 'historial'>('datos')

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
  const [actionKind, setActionKind] = useState<string>(entry.nextActionKind ?? 'llamada')

  const zoneOptions = useMemo(() => {
    const base = [...FIRMAS_ZONE_ORDER]
    zones.forEach(z => { if (!base.includes(z)) base.push(z) })
    if (!base.includes(entry.zone)) base.push(entry.zone)
    return base
  }, [zones, entry.zone])

  // known_team: al abrir la ficha se sincroniza en silencio la primera vez
  useEffect(() => {
    if (sp?.team && !entry.knownTeam) void onPatch(entry, { knownTeam: sp.team })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.id])

  // ── crear en Mantenimiento al firmar ──
  const existsInMaintenance = players.some(p => normSearch(p.name) === normSearch(sp?.fullName ?? entry.playerName))
  const createInMaintenance = async () => {
    try {
      await onCreatePlayer({
        id: crypto.randomUUID(), // lo genera la BBDD; el tipo lo exige
        name: sp?.fullName ?? entry.playerName,
        birthDate: sp?.birthdate ?? '',
        positions: [sp?.position1, sp?.position2].filter(Boolean) as string[],
        nationality: sp?.nationality ?? '',
        photo: '',
        clubs: sp?.team ? [{ name: sp.team, type: 'principal' as const }] : [],
        managedBy: entry.managers,
        representationContract: { start: (entry.signedAt ?? new Date().toISOString()).slice(0, 10), end: '' },
        clubContract: { endDate: sp?.clubContract ?? '' },
        contractHistory: [],
        clubInterests: [],
        performance: [],
        matchReports: [],
        videoSessions: [],
        info: { family: '', personality: '' },
        links: [],
      })
      const log: FirmasComment = {
        id: crypto.randomUUID(),
        text: '→ Creado como jugador de Mantenimiento',
        date: new Date().toISOString(),
        author: currentProfile.name,
        authorId: currentProfile.id,
        kind: 'nota',
      }
      void onPatch(entry, { comments: [...entry.comments, log] })
      showToast('Creado en Mantenimiento — completa su ficha cuando quieras')
    } catch (err) {
      console.error(err)
      showToast('No se pudo crear en Mantenimiento', 'error')
    }
  }

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
    const prev = entry.comments
    void onPatch(entry, { comments: prev.filter(c => c.id !== id) })
    showToast('Apunte eliminado', 'info', { label: 'Deshacer', fn: () => void onPatch(entry, { comments: prev }) })
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
      nextActionKind: actionKind || undefined,
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
      // coherencia con el historial: una llamada hecha queda como llamada
      kind: (entry.nextActionKind as FirmasComment['kind']) ?? 'nota',
    }
    const prev = { nextAction: entry.nextAction, nextActionDate: entry.nextActionDate, nextActionAssignee: entry.nextActionAssignee, nextActionKind: entry.nextActionKind, comments: entry.comments }
    void onPatch(entry, {
      nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined,
      comments: [...entry.comments, log],
    })
    setActionLabel(''); setActionDate('')
    showToast('Acción marcada como hecha', 'success', { label: 'Deshacer', fn: () => void onPatch(entry, prev) })
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

        {/* móvil: info de estatus + pestañas Datos/Historial */}
        <div className="lg:hidden border-b border-slate-200">
          {entry.status !== 'firmado' && (entry.statusUpdatedAt || aging) && (
            <div className="px-4 pt-1.5 pb-0.5 flex items-center gap-2 text-[11px] text-slate-400 sm:hidden">
              {entry.statusUpdatedAt && <span>desde {relativeDate(entry.statusUpdatedAt) || fmtDate(entry.statusUpdatedAt)}</span>}
              {aging && (
                <span className={aging.overdue ? 'text-red-500 font-medium' : aging.warn ? 'text-amber-600' : ''}>
                  {aging.overdue ? '⚠ ' : ''}sin tocar {aging.days}d/{aging.limit}d
                </span>
              )}
            </div>
          )}
          <div className="px-4 flex gap-4">
            <button
              onClick={() => setPanelTab('datos')}
              className={`py-2 text-xs font-semibold border-b-2 transition-colors ${panelTab === 'datos' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}
            >
              Datos
            </button>
            <button
              onClick={() => setPanelTab('historial')}
              className={`py-2 text-xs font-semibold border-b-2 transition-colors ${panelTab === 'historial' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}
            >
              Historial{entry.comments.length > 0 ? ` · ${entry.comments.length}` : ''}
            </button>
          </div>
        </div>

        {/* body: dos columnas en escritorio, pestañas en móvil */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">

            {/* ── Columna izquierda: datos ── */}
            <div className={`space-y-3.5 min-w-0 ${panelTab === 'datos' ? 'block' : 'hidden'} lg:block`}>
              {/* firmado 🎉 → traspaso a Mantenimiento */}
              {entry.status === 'firmado' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-green-700 font-medium">🎉 Firmado{entry.signedAt ? ` el ${fmtDate(entry.signedAt)}` : ''}</span>
                  {existsInMaintenance ? (
                    <span className="ml-auto text-[11px] text-green-600 font-medium">Ya en Mantenimiento ✓</span>
                  ) : (
                    <button
                      onClick={() => void createInMaintenance()}
                      className="ml-auto px-2.5 py-1 rounded-lg bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 transition-colors"
                    >
                      Crear en Mantenimiento
                    </button>
                  )}
                </div>
              )}

              {/* próxima acción */}
              {entry.status !== 'firmado' && (
                <div>
                  <label className={LABEL_CLS}>Próxima acción</label>
                  {editingAction ? (
                    <div className="mt-1 border border-blue-200 rounded-lg p-2 bg-blue-50/40 space-y-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {Object.entries(FIRMAS_ACTION_KIND_META).map(([k, meta]) => (
                          <button
                            key={k}
                            onClick={() => {
                              setActionKind(k)
                              // Acción predefinida: elegir 📵 rellena el texto solo
                              if (k === 'telefono' && (!actionLabel.trim() || actionLabel === 'Conseguir teléfono')) setActionLabel('Conseguir teléfono')
                              else if (k !== 'telefono' && actionLabel === 'Conseguir teléfono') setActionLabel('')
                            }}
                            className={`px-1.5 py-0.5 rounded-md text-[11px] transition-colors ${
                              actionKind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-400 hover:bg-white'
                            }`}
                            title={meta.label}
                          >
                            {meta.icon} <span className="hidden xl:inline">{meta.label}</span>
                          </button>
                        ))}
                      </div>
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
                      <span className="text-xs font-semibold text-slate-800 truncate">{FIRMAS_ACTION_KIND_META[entry.nextActionKind ?? '']?.icon ?? '📌'} {entry.nextAction ?? 'Acción'}</span>
                      <span className={`text-[11px] flex-shrink-0 ${actionOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {entry.nextActionDate ? fmtDate(entry.nextActionDate) : 'sin fecha'}
                        {actionOverdue ? ' · vencida' : entry.nextActionDate === todayISO() ? ' · hoy' : ''}
                        {actionAssigneeProfile ? ` · ${actionAssigneeProfile.avatar || actionAssigneeProfile.name}` : ''}
                      </span>
                      <span className="ml-auto flex gap-1 flex-shrink-0">
                        <button onClick={completeAction} className="px-2 py-0.5 rounded-md bg-green-600 text-white text-[11px] font-medium hover:bg-green-700" title="Marcar hecha (queda en el historial)">✓</button>
                        <button
                          onClick={() => { setActionLabel(entry.nextAction ?? ''); setActionDate(entry.nextActionDate ?? ''); setActionAssignee(entry.nextActionAssignee ?? currentProfile.id); setActionKind(entry.nextActionKind ?? 'llamada'); setEditingAction(true) }}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-white"
                          aria-label="Editar próxima acción"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setActionLabel(''); setActionDate(''); setActionAssignee(currentProfile.id); setActionKind('llamada'); setEditingAction(true) }}
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
                {sp?.team && entry.knownTeam && !teamsAlike(entry.knownTeam, sp.team) && (
                  <div className="mt-1 mb-1 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-800">
                    <span>🔁 Cambio de club: <b>{entry.knownTeam}</b> → <b>{sp.team}</b>. Revisa la zona.</span>
                    <button
                      onClick={() => void onPatch(entry, { knownTeam: sp.team })}
                      className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10.5px] font-semibold hover:bg-amber-700"
                    >
                      Entendido
                    </button>
                  </div>
                )}
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
                      onClick={() => void onPatch(entry, { scoutingPlayerId: undefined, knownTeam: undefined })}
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
                      onSelect={p => void onPatch(entry, { scoutingPlayerId: p.id, knownTeam: p.team })}
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
            <div className={`min-w-0 ${panelTab === 'historial' ? 'block' : 'hidden'} lg:block`}>
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
                        <span className="text-xs">{FIRMAS_ACTION_KIND_META[c.kind ?? 'nota']?.icon ?? '📝'}</span>
                        <span className="text-[11px] font-semibold text-slate-600">{c.author || '—'}</span>
                        {c.outcome && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.outcome === 'contesto' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {c.outcome === 'contesto' ? 'contestó' : 'no contestó'}
                          </span>
                        )}
                        <span className="text-[10.5px] text-slate-400">{relativeDate(c.date) || fmtDate(c.date)}</span>
                        {(isAdmin || c.authorId === currentProfile.id) && (
                          // en móvil no hay hover: por debajo de sm los botones se ven siempre
                          <span className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
      knownTeam: linked?.team,
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
  /** Varios scouts por partido (tabla scouting_match_scouts) */
  matchScouts: ScoutingMatchScout[]
  onAddMatchScout: (matchId: string, scout: string, viewMode?: 'campo' | 'video') => Promise<void>
  onRemoveMatchScout: (matchId: string, scout: string) => Promise<void>
  onSetMatchScoutStatus: (matchId: string, scout: string, status: 'pendiente' | 'visto') => Promise<void>
  onSetMatchScoutMode: (matchId: string, scout: string, viewMode: 'campo' | 'video') => Promise<void>
  /** Abrir la ficha de un jugador al montar (navegación desde otra sección, p. ej. Boulema) */
  openPlayerId?: string | null
  onOpenPlayerConsumed?: () => void
  /** Abrir una entrada del pipeline Firmar (navegación desde el Dashboard) */
  openFirmasEntryId?: string | null
  onOpenFirmasEntryConsumed?: () => void
  /** Cuenta "solo Captación": oculta el resto de secciones y deja solo Jugadores, Partidos e Informes */
  restricted?: boolean
  /** Para los avisos del pipeline Firmar y el alta en Mantenimiento al firmar */
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  boulemaPeticiones: BoulemaPeticion[]
  /** Crear tareas del tablero para las próximas acciones que aún no tienen (backfill) */
  onSyncFirmasActionTasks?: () => Promise<number>
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

// ── ContratosTab ─────────────────────────────────────────────
// FIN DE CONTRATO: el campograma de mercado por año de expiración.
// Eliges un año (2026, 2027…) y ves quién se queda libre, colocado por
// posición, con su equipo y su agencia: la versión viva del Excel.

const SLOT_LABELS: Record<PitchSlotId, string> = {
  POR: 'Portero',
  LD: 'Lateral derecho',
  CTD: 'Central derecho',
  CT: 'Central',
  CTI: 'Central izquierdo',
  LI: 'Lateral izquierdo',
  PIV: 'Pivote',
  MC: 'Mediocentro',
  MP: 'Mediapunta',
  ED: 'Extremo derecho',
  EI: 'Extremo izquierdo',
  DEL: 'Delantero',
}

// Orden de lectura de la lista (arriba atrás, abajo arriba), como el Excel
const SLOT_ORDER: PitchSlotId[] = ['POR', 'CTD', 'CT', 'CTI', 'LD', 'LI', 'PIV', 'MC', 'MP', 'ED', 'EI', 'DEL']

// ── Ligas ────────────────────────────────────────────────────
// Composición real de la temporada 2026-27 (LaLiga EA Sports, Hypermotion
// y los dos grupos de Primera Federación), con los nombres tal y como
// están escritos en la BBDD de Captación. Al cambiar de temporada solo
// hay que retocar estas tres listas.
type Liga = '1ª' | '2ª' | '1ª RFEF'
const LIGA_LISTS: { liga: Liga; teams: string[] }[] = [
  { liga: '1ª', teams: [
    'Barcelona', 'Real Madrid', 'Villarreal', 'Atlético Madrid', 'Atletico Madrid', 'Atlético', 'Atletico',
    'Real Betis', 'Betis', 'Celta', 'Celta de Vigo', 'Real Sociedad', 'Getafe', 'Athletic', 'Athletic Club',
    'Athletic Bilbao', 'Valencia', 'Sevilla', 'Rayo Vallecano', 'Rayo', 'Osasuna', 'Espanyol', 'Alaves',
    'Alavés', 'Levante', 'Elche', 'Racing Santander', 'Racing de Santander', 'Deportivo',
    'Deportivo La Coruña', 'Málaga', 'Malaga',
  ] },
  { liga: '2ª', teams: [
    'Oviedo', 'Real Oviedo', 'Mallorca', 'Girona', 'Almería', 'Almeria', 'Las Palmas', 'Castellón',
    'Castellon', 'Burgos', 'Eibar', 'Córdoba', 'Cordoba', 'Sporting', 'Sporting Gijon', 'Sporting de Gijón',
    'Ceuta', 'Albacete', 'Andorra', 'Granada', 'Real Sociedad B', 'Leganes', 'Leganés', 'Valladolid',
    'Cádiz', 'Cadiz', 'Tenerife', 'Eldense', 'Celta B', 'Celta Fortuna', 'Sabadell',
  ] },
  { liga: '1ª RFEF', teams: [
    'Merida', 'Mérida', 'Arenas', 'Arenas Club', 'Bilbao Athletic', 'Athletic B', 'Barakaldo', 'Coria',
    'Extremadura', 'Lugo', 'Mirandes', 'Mirandés', 'Cacereño', 'Cacereno', 'Cultural Leonesa', 'Pontevedra',
    'Racing Ferrol', 'Deportivo B', 'Deportivo Fabril', 'Fabril', 'Real Avilés', 'Real Aviles', 'Real Union',
    'Real Unión', 'Ponferradina', 'UD Logroñes', 'UD Logroñés', 'Logroñes', 'Logroñés', 'Ourense',
    'Unionistas', 'Zamora', 'Alcorcon', 'Alcorcón', 'Aguilas', 'Águilas', 'Algeciras', 'Antequera',
    'Atlético Madrid B', 'Atletico Madrid B', 'Atlético Madrileño', 'Teruel', 'Europa', 'Rayo Majadahonda',
    'Cartagena', 'Nastic', 'Nàstic', 'Gimnastic', 'Hercules', 'Hércules', 'Juventud Torremolinos',
    'Real Jaen', 'Real Jaén', 'Jaen', 'Real Madrid Castilla', 'Castilla', 'Murcia', 'Real Murcia',
    'Zaragoza', 'Huesca', 'Ibiza', 'UD Ibiza', 'Sant Andreu', 'Villarreal B',
  ] },
]
const TEAM_LIGA: Record<string, Liga> = (() => {
  const m: Record<string, Liga> = {}
  LIGA_LISTS.forEach(({ liga, teams }) => teams.forEach(t => { if (!m[normSearch(t)]) m[normSearch(t)] = liga }))
  return m
})()
const LIGAS: Liga[] = ['1ª', '2ª', '1ª RFEF']
function ligaOf(team?: string): Liga | null {
  return TEAM_LIGA[normSearch(team ?? '')] ?? null
}

/** Fin de contrato en texto libre → fecha y año. Acepta 30/06/2027,
 *  2027-06-30, 30-06-2027, 06/2027, 30/06/27 y un «2027» suelto. */
function parseContract(s?: string): { date: Date | null; year: string | null } {
  const t = (s ?? '').trim()
  if (!t) return { date: null, year: null }
  let m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    return { date: new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)), year: String(y) }
  }
  m = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), year: m[1] }
  m = t.match(/^(\d{1,2})[/\-.](\d{4})$/)            // 06/2027
  if (m) return { date: new Date(+m[2], +m[1] - 1, 30), year: m[2] }
  m = t.match(/(19|20)(\d{2})/)                      // «2027», «junio 2027»
  if (m) return { date: new Date(+`${m[1]}${m[2]}`, 5, 30), year: `${m[1]}${m[2]}` }
  return { date: null, year: null }
}

function ContratosTab({ players, firmasEntries, isAdmin, onOpenPlayer, onSetContract, onToggleMarketMap }: {
  players: ScoutingPlayer[]
  firmasEntries: FirmasEntry[]
  isAdmin: boolean
  onOpenPlayer: (id: string) => void
  onSetContract: (p: ScoutingPlayer, value: string) => Promise<void>
  onToggleMarketMap: (p: ScoutingPlayer, value: boolean) => Promise<void>
}) {
  const [view, setView] = useState<'campo' | 'lista'>('lista')
  const [source, setSource] = useState<'mapa' | 'todos'>('mapa')
  const [yearSel, setYearSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [assessFilter, setAssessFilter] = useState<'all' | ScoutingAssessment>('all')
  const [ligaFilter, setLigaFilter] = useState<Set<string>>(new Set(LIGAS as string[]))
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const all = useMemo(
    () => players.map(p => { const c = parseContract(p.clubContract); return { p, date: c.date, year: c.year, liga: ligaOf(p.team) } }),
    [players]
  )
  const enMapa = useMemo(() => all.filter(e => e.p.marketMap), [all])

  // Estatus en el pipeline (Firmar) de cada jugador, por si está en él
  const firmasByPlayer = useMemo(() => {
    const m: Record<string, FirmasEntry> = {}
    firmasEntries.forEach(e => { if (e.scoutingPlayerId && !m[e.scoutingPlayerId]) m[e.scoutingPlayerId] = e })
    return m
  }, [firmasEntries])

  // Fuente: mi campograma de mercado (los que me has pasado) o toda la
  // BBDD filtrada por liga (1ª, 2ª, 1ª RFEF) para poder añadir jugadores.
  const parsed = useMemo(() => source === 'mapa'
    ? enMapa
    : all.filter(e => ligaFilter.has(e.liga ?? 'otros')),
    [source, enMapa, all, ligaFilter])

  // Solo las tres ventanas que importan (2026, 2027, 2028 — avanza solo
  // cada año). El resto de años cae en «Otros», que solo aparece si hay
  // alguien ahí para que nadie quede escondido.
  const windowYears = useMemo(() => {
    const y0 = new Date().getFullYear()
    return [String(y0), String(y0 + 1), String(y0 + 2)]
  }, [])
  const inWindow = useCallback((y: string | null) => !!y && windowYears.includes(y), [windowYears])

  const { counts, sinFecha, otros } = useMemo(() => {
    const c: Record<string, number> = {}
    windowYears.forEach(y => { c[y] = 0 })
    let sin = 0
    let otr = 0
    parsed.forEach(({ year: y }) => {
      if (!y) sin++
      else if (windowYears.includes(y)) c[y]++
      else otr++
    })
    return { counts: c, sinFecha: sin, otros: otr }
  }, [parsed, windowYears])

  // Año por defecto: la ventana con más jugadores (hoy, 2027)
  const defaultYear = useMemo(
    () => windowYears.reduce((best, y) => counts[y] > counts[best] ? y : best, windowYears[0]),
    [windowYears, counts]
  )
  const year = yearSel ?? defaultYear

  const nq = normSearch(q)
  // Al buscar en toda la BBDD el año se ignora: si buscas a alguien por
  // nombre es para encontrarlo, no para pelearte con el filtro
  const ignoreYear = source === 'todos' && !!nq
  const shown = useMemo(() => parsed.filter(({ p, year: y }) => {
    if (!ignoreYear && (year === 'sin' ? !!y : year === 'otros' ? (!y || inWindow(y)) : y !== year)) return false
    if (assessFilter !== 'all' && p.assessment !== assessFilter) return false
    if (nq && !normSearch(`${p.fullName} ${p.team ?? ''} ${p.agency ?? ''}`).includes(nq)) return false
    return true
  }), [parsed, year, assessFilter, nq, inWindow, ignoreYear])

  // Reparto por posición del campograma
  const { bySlot, sinPos } = useMemo(() => {
    const map: Record<string, typeof shown> = {}
    const sp: typeof shown = []
    shown.forEach(e => {
      const slot = pitchSlotOf(e.p.position1) ?? pitchSlotOf(e.p.position2)
      if (!slot) { sp.push(e); return }
      if (!map[slot]) map[slot] = []
      map[slot].push(e)
    })
    Object.keys(map).forEach(k => map[k].sort((a, b) =>
      (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || a.p.fullName.localeCompare(b.p.fullName)))
    return { bySlot: map, sinPos: sp }
  }, [shown])

  const fmtShort = (d: Date | null) => d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

  const toggleLiga = (l: string) => setLigaFilter(prev => {
    const n = new Set(prev)
    if (n.has(l)) n.delete(l); else n.add(l)
    return n.size ? n : prev            // nunca dejar los cuatro apagados
  })

  async function saveContract(p: ScoutingPlayer) {
    setSaving(true)
    try {
      await onSetContract(p, editValue.trim())
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  // Fila de jugador de la lista
  const playerRow = (e: { p: ScoutingPlayer; date: Date | null; liga: Liga | null }) => {
    const { p } = e
    if (editingId === p.id) {
      return (
        <div key={p.id} className="flex items-center gap-1 px-2 py-1 bg-blue-50/60">
          <input
            value={editValue}
            onChange={ev => setEditValue(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') void saveContract(p); if (ev.key === 'Escape') setEditingId(null) }}
            placeholder="30/06/2027"
            autoFocus
            className="flex-1 min-w-0 text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button onClick={() => setEditingId(null)} className="px-1.5 py-1 text-[11px] text-slate-500 hover:bg-white rounded">✕</button>
          <button onClick={() => void saveContract(p)} disabled={saving}
            className="px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-40">OK</button>
        </div>
      )
    }
    return (
      <div key={p.id} className="group flex items-center gap-1.5 px-2 py-1 hover:bg-slate-50 transition-colors">
        <button onClick={() => onOpenPlayer(p.id)} className="min-w-0 flex-1 text-left">
          <span className="block text-[11.5px] font-semibold text-slate-800 truncate">
            {p.fullName}
            {p.birthdate && <span className="text-slate-400 font-medium"> '{p.birthdate.slice(2, 4)}</span>}
          </span>
          <span className="block text-[10.5px] text-slate-400 truncate">
            {e.liga && <span className="text-slate-500 font-semibold">{e.liga}</span>}
            {e.liga ? ' · ' : ''}{p.team || '—'}{p.agency ? ` · ${p.agency}` : ''}
          </span>
        </button>
        {(() => {
          // Estatus en el pipeline: color + etiqueta (o punto hueco si no está)
          const fe = firmasByPlayer[p.id]
          if (!fe) return (
            <span className="w-1.5 h-1.5 rounded-full border border-slate-200 flex-shrink-0" title="No está en el pipeline" />
          )
          const cfg = FIRMAS_CONFIG[fe.status]
          return (
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}
              title={`Pipeline: ${cfg.label}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className="hidden sm:inline">{cfg.label}</span>
            </span>
          )
        })()}
        <span className="text-[10.5px] text-slate-400 flex-shrink-0 tabular-nums">{fmtShort(e.date)}</span>
        {isAdmin && (
          <>
            <button
              onClick={() => { setEditingId(p.id); setEditValue(p.clubContract ?? '') }}
              className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-white transition-colors flex-shrink-0"
              title="Editar fin de contrato"
              aria-label="Editar fin de contrato"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {/* Estrella siempre visible: es la forma de meter y sacar
                jugadores del campograma (también en móvil, sin hover) */}
            <button
              onClick={() => void onToggleMarketMap(p, !p.marketMap)}
              className={`px-0.5 text-[13px] leading-none flex-shrink-0 transition-colors ${
                p.marketMap ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-500'
              }`}
              title={p.marketMap ? 'Quitar del campograma de mercado' : 'Añadir al campograma de mercado'}
              aria-label={p.marketMap ? 'Quitar del campograma' : 'Añadir al campograma'}
            >
              {p.marketMap ? '★' : '☆'}
            </button>
          </>
        )}
      </div>
    )
  }

  const chip = (id: string, label: string, n: number) => (
    <button
      key={id}
      onClick={() => { setYearSel(id); setExpandedSlots(new Set()) }}
      className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
        year === id ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}
      <span className={`ml-1.5 text-[10px] font-bold ${year === id ? 'text-white/75' : 'text-slate-400'}`}>{n}</span>
    </button>
  )

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Fin de contrato</h2>
          <p className="text-xs text-slate-400">
            {source === 'mapa'
              ? 'Tu campograma de mercado: solo los jugadores marcados con ★, por año de fin de contrato'
              : 'Toda la BBDD de 1ª, 2ª y 1ª RFEF — marca con ☆ los que quieras en tu campograma'}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { setSource('mapa'); setYearSel(null); setExpandedSlots(new Set()) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${source === 'mapa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >★ Mi campograma <span className="text-slate-400 font-semibold">{enMapa.length}</span></button>
          <button
            onClick={() => { setSource('todos'); setYearSel(null); setExpandedSlots(new Set()) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${source === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >Toda la BBDD</button>
        </div>
      </div>

      {/* Ligas (solo al mirar toda la BBDD) */}
      {source === 'todos' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Liga</span>
          {[...LIGAS as string[], 'otros'].map(l => (
            <button
              key={l}
              onClick={() => toggleLiga(l)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                ligaFilter.has(l)
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
              }`}
            >
              {l === 'otros' ? 'Resto' : l}
              <span className="ml-1 text-[10px] opacity-70">{all.filter(e => (e.liga ?? 'otros') === l).length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Años */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {windowYears.map(y => chip(y, y, counts[y]))}
        {chip('sin', 'Sin fecha', sinFecha)}
        {otros > 0 && chip('otros', 'Otros años', otros)}
      </div>

      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setView('lista')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >☰ Lista</button>
          <button
            onClick={() => setView('campo')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === 'campo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >⚽ Campograma</button>
        </div>
        <select value={assessFilter} onChange={e => setAssessFilter(e.target.value as 'all' | ScoutingAssessment)} className={SELECT_CLS}>
          <option value="all">Todos los estados</option>
          {(['Llamar', 'Basque', 'Seguir', 'Decidir', 'Visto', 'Descartado'] as ScoutingAssessment[]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Jugador, equipo o agencia…"
            className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          {shown.length} jugador{shown.length !== 1 ? 'es' : ''}
          {ignoreYear && <span className="text-slate-300"> · buscando en todos los años</span>}
        </span>
        {source === 'todos' && isAdmin && (
          <span className="text-[11px] text-amber-600 font-medium">☆ = añadir al campograma</span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center">
          <p className="text-xs text-slate-400 italic">
            {source === 'mapa' && enMapa.length === 0
              ? 'Tu campograma está vacío: entra en «Toda la BBDD» y marca jugadores con ☆.'
              : year === 'sin' ? 'Todos los jugadores del filtro tienen fin de contrato.'
              : year === 'otros' ? 'Nadie con fin de contrato fuera de estos tres años.'
              : `Ningún jugador acaba contrato en ${year} con ese filtro.`}
          </p>
        </div>
      ) : view === 'lista' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SLOT_ORDER.filter(s => (bySlot[s]?.length ?? 0) > 0).map(s => (
            <div key={s} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{SLOT_LABELS[s]}</span>
                <span className="text-[10px] font-bold text-slate-400">{bySlot[s].length}</span>
              </div>
              <div className="divide-y divide-slate-50">{bySlot[s].map(playerRow)}</div>
            </div>
          ))}
          {sinPos.length > 0 && (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Sin posición</span>
                <span className="text-[10px] font-bold text-slate-400">{sinPos.length}</span>
              </div>
              <div className="divide-y divide-slate-50">{sinPos.map(playerRow)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
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
              const pls = bySlot[s.id] ?? []
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
                    {visible.map(({ p, date }) => {
                      const fe = firmasByPlayer[p.id]
                      return (
                        <button
                          key={p.id}
                          onClick={() => onOpenPlayer(p.id)}
                          title={`${p.fullName}${p.team ? ' · ' + p.team : ''}${p.agency ? ' · ' + p.agency : ''} · fin ${p.clubContract ?? '—'}${fe ? ` · pipeline: ${FIRMAS_CONFIG[fe.status].label}` : ''}`}
                          className="bg-amber-50 border border-amber-200 text-amber-900 text-[9.5px] font-bold rounded-md px-1.5 py-px whitespace-nowrap shadow hover:bg-amber-100 transition-colors max-w-[130px] truncate inline-flex items-center gap-1"
                        >
                          {fe && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[fe.status].dot}`} />}
                          {p.fullName.split(' ').slice(0, 2).join(' ')}
                          {date && <span className="font-medium text-amber-600">{fmtShort(date).slice(0, 5)}</span>}
                        </button>
                      )
                    })}
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
            Clic en un jugador → su ficha. Al pasar el ratón ves equipo, agencia y la fecha exacta.
            {sinPos.length > 0 && ` · ${sinPos.length} sin posición reconocida (solo salen en la lista)`}
          </p>
        </div>
      )}
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
  matchScouts,
  onAddMatchScout,
  onRemoveMatchScout,
  onSetMatchScoutStatus,
  onSetMatchScoutMode,
  openPlayerId,
  onOpenPlayerConsumed,
  openFirmasEntryId,
  onOpenFirmasEntryConsumed,
  restricted,
  players,
  onCreatePlayer,
  boulemaPeticiones,
  onSyncFirmasActionTasks,
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
  const RESTRICTED_TABS: CaptacionTab[] = ['jugadores', 'partidos', 'informes']
  useEffect(() => {
    if (restricted && !RESTRICTED_TABS.includes(captTab)) setCaptTab('jugadores')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted, captTab])

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

  // Salto interno a una tarjeta de Firmar (desde la ficha de un jugador)
  const [firmasJumpId, setFirmasJumpId] = useState<string | null>(null)

  // ── umbral de candidatos (compartido: badge de pestaña + Conclusiones) ──
  const [conclThreshold, setConclThreshold] = useState<number>(() => {
    const v = parseInt(sessionStorage.getItem('capt_concl_threshold') ?? '3')
    return [2, 3, 4].includes(v) ? v : 3
  })
  useEffect(() => { sessionStorage.setItem('capt_concl_threshold', String(conclThreshold)) }, [conclThreshold])

  // nº de informes «Llamar» por jugador (Firmar legado cuenta como Llamar)
  // Nº de informes por jugador, calculado una vez: antes cada fila de la
  // tabla recorría los >10.000 informes (50 filas × 10.000 por tecleo)
  const reportCountByPlayer = useMemo(() => {
    const m: Record<string, number> = {}
    scoutingReports.forEach(r => { m[r.playerId] = (m[r.playerId] ?? 0) + 1 })
    return m
  }, [scoutingReports])

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
  /** Ficha de partido abierta en ventana */
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null)
  const isDesktop = useIsDesktop()   // en escritorio la ficha va a la derecha, no flotando

  // ── match filters ──
  const [matchSearch, setMatchSearch] = useState('')
  // Vista de partidos: lista o agenda semanal
  const [matchesView, setMatchesView] = useState<'lista' | 'semana'>(
    () => (sessionStorage.getItem('capt_matches_view') as 'lista' | 'semana') ?? 'lista'
  )
  useEffect(() => { sessionStorage.setItem('capt_matches_view', matchesView) }, [matchesView])
  const [matchWeekOffset, setMatchWeekOffset] = useState(0)
  const [matchPersonaFilter, setMatchPersonaFilter] = useState('all')
  const [matchCompFilter, setMatchCompFilter] = useState('all')
  const [matchModeFilter, setMatchModeFilter] = useState<'all' | 'video' | 'campo'>('all')
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'visto' | 'pendiente'>('all')
  /** Ocultar momentáneamente los partidos con fecha posterior a hoy (no se persiste) */
  const [hideFutureMatches, setHideFutureMatches] = useState(false)
  /** Fusión manual de partidos: modo selección + seleccionados + modal */
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [merging, setMerging] = useState(false)
  const toggleMergeSelected = (id: string) => setMergeSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
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

  // ── scouts por partido (tabla nueva + assigned_to legacy) ──
  const scoutsByMatch = useMemo(() => {
    const map: Record<string, MatchScoutInfo[]> = {}
    const modoDe = (id: string) => scoutingMatches.find(m => m.id === id)?.viewMode ?? 'video'
    for (const ms of matchScouts) {
      if (!map[ms.matchId]) map[ms.matchId] = []
      map[ms.matchId].push({ scout: ms.scout, status: ms.status, viewMode: ms.viewMode ?? modoDe(ms.matchId) })
    }
    // Compatibilidad: el responsable de assigned_to cuenta como scout aunque
    // la migración de scouting_match_scouts todavía no se haya ejecutado.
    for (const m of scoutingMatches) {
      if (!m.assignedTo) continue
      if (!map[m.id]) map[m.id] = []
      if (!map[m.id].some(s => s.scout === m.assignedTo)) {
        map[m.id].unshift({ scout: m.assignedTo, status: m.status === 'visto' ? 'visto' : 'pendiente', viewMode: m.viewMode ?? 'video' })
      }
    }
    return map
  }, [matchScouts, scoutingMatches])

  // ── filtered matches ──
  const filteredMatches = useMemo(() => {
    const q = matchSearch.toLowerCase().trim()
    return scoutingMatches.filter(m => {
      if (matchPersonaFilter !== 'all' && !(scoutsByMatch[m.id] ?? []).some(s => s.scout === matchPersonaFilter)) return false
      if (matchCompFilter !== 'all' && m.competition !== matchCompFilter) return false
      if (matchModeFilter !== 'all' && (m.viewMode ?? 'video') !== matchModeFilter) return false
      if (matchStatusFilter !== 'all' && (m.status ?? 'pendiente') !== matchStatusFilter) return false
      if (hideFutureMatches && isAfterToday(m.date)) return false
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.competition ?? ''} ${m.notes ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [scoutingMatches, scoutsByMatch, matchSearch, matchPersonaFilter, matchCompFilter, matchModeFilter, matchStatusFilter, hideFutureMatches])

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
    // Cuenta como pretemporada: la competición "Pretemporada", los torneos
    // veraniegos tipo "Best Cup" y, en general, cualquier partido jugado en
    // julio o agosto (la ventana 1-jul → 1-sep de cada año).
    const esPretemporada = (m: ScoutingMatch) => {
      const comp = (m.competition ?? '').trim().toLowerCase()
      if (comp === 'pretemporada' || comp === 'best cup') return true
      const mes = parseInt(m.date.slice(5, 7), 10)
      return mes === 7 || mes === 8
    }
    const preMatches = scoutingMatches.filter(esPretemporada)
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
      .slice(0, 150)
  }, [scoutingReports, reportPersonaFilter])

  // Partidos candidatos para el informe que se está escribiendo desde la
  // ficha del jugador: primero aquellos a los que ya está vinculado, luego
  // los de su equipo, siempre los más cercanos en el tiempo. Así el scout
  // no tiene que buscar el partido a mano (y dejan de nacer informes
  // huérfanos que luego no salen en la ficha del partido).
  const reportMatchSuggestions = useMemo(() => {
    const empty = { list: [] as { m: ScoutingMatch; linked: boolean; days: number }[], auto: null as ScoutingMatch | null }
    if (!panelPlayer) return empty
    const hoy = new Date(todayISO()).getTime()
    const cand = scoutingMatches
      .map(m => {
        const t = new Date(m.date).getTime()
        if (isNaN(t) || t > hoy + 86400000) return null            // partidos aún por jugar, fuera
        const days = Math.round((hoy - t) / 86400000)
        if (days > 120) return null                                 // demasiado antiguo para sugerirlo
        const linked = (matchPlayersByMatchId[m.id] ?? []).includes(panelPlayer.id)
        const kind = teamMatchKind(m.homeTeam, panelPlayer.team) ?? teamMatchKind(m.awayTeam, panelPlayer.team)
        if (!linked && kind !== 'exacto') return null
        return { m, linked, days, score: (linked ? 1000 : 0) - days }
      })
      .filter((x): x is { m: ScoutingMatch; linked: boolean; days: number; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    // Si ya estaba vinculado a un partido reciente, se da por hecho que el
    // informe es de ese partido (se puede quitar de un clic)
    const auto = cand.find(c => c.linked && c.days <= 14)?.m ?? null
    return { list: cand.map(({ m, linked, days }) => ({ m, linked, days })), auto }
  }, [panelPlayer, scoutingMatches, matchPlayersByMatchId])

  // Al abrir el formulario, el partido probable viene ya puesto
  useEffect(() => {
    if (showAddReportForm && !reportMatchId && reportMatchSuggestions.auto) {
      setReportMatchId(reportMatchSuggestions.auto.id)
    }
    // solo al abrirlo: si el scout lo quita a mano, no se lo volvemos a poner
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddReportForm, panelPlayerId])

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

  // Alta rápida desde una alineación pegada: crea la ficha mínima del
  // jugador (nombre + equipo) y lo vincula al partido de una vez
  async function handleCreateAndLinkPlayer(nombre: string, equipo: string, matchId: string) {
    try {
      const saved = await db.createScoutingPlayer({ fullName: nombre.trim(), team: equipo || undefined })
      onAddPlayer(saved)
      await onAddMatchPlayer(matchId, saved.id)
    } catch {
      showToast(`No se pudo crear ${nombre}`, 'error')
    }
  }

  // Corregir el equipo de un jugador (desde una alineación pegada, que es
  // información del día del partido y suele estar más al día que la ficha)
  async function handleFixPlayerTeam(p: ScoutingPlayer, equipo: string) {
    try {
      const updated: ScoutingPlayer = { ...p, team: equipo }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
      showToast(`${p.fullName}: ${p.team || 'sin equipo'} → ${equipo}`)
    } catch {
      showToast('No se pudo corregir el equipo', 'error')
    }
  }

  // Engancha a este partido un informe que se escribió sin partido (o que
  // quedó colgado de otro): así la ficha del partido enseña TODOS los informes
  async function handleLinkReportToMatch(r: ScoutingReport, matchId: string | null) {
    try {
      const updated: ScoutingReport = { ...r, matchId: matchId ?? undefined }
      await db.updateScoutingReport(updated)
      onUpdateReport(updated)
      showToast(matchId ? 'Informe vinculado al partido' : 'Informe quitado del partido')
    } catch {
      showToast(matchId ? 'Error al vincular el informe' : 'Error al quitar el informe', 'error')
    }
  }

  // Fin de contrato editable desde la pestaña Contratos (texto libre:
  // 30/06/2027, 2027-06-30 o incluso «2027»; vacío = quitar la fecha)
  async function handleQuickContract(player: ScoutingPlayer, value: string) {
    try {
      const updated: ScoutingPlayer = { ...player, clubContract: value.trim() || undefined }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
      showToast(value.trim() ? `${player.fullName}: fin de contrato ${value.trim()}` : `${player.fullName}: fecha quitada`)
    } catch {
      showToast('Error al guardar el fin de contrato', 'error')
    }
  }

  // Añadir / quitar del campograma de mercado (pestaña Fin de contrato)
  async function handleToggleMarketMap(player: ScoutingPlayer, value: boolean) {
    try {
      const updated: ScoutingPlayer = { ...player, marketMap: value }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
      showToast(value ? `${player.fullName} añadido al campograma` : `${player.fullName} quitado del campograma`)
    } catch {
      showToast('Error al actualizar el campograma', 'error')
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

  // La ficha de partido se pinta igual en los dos sitios: como columna a la
  // derecha de la lista (escritorio) o como ventana (móvil).
  function renderFichaPartido(variant: 'modal' | 'panel') {
    const dm = detailMatchId ? scoutingMatches.find(m => m.id === detailMatchId) : null
    if (!dm) return null
    return (
      <MatchDetailModal
        match={dm}
        scouts={scoutsByMatch[dm.id] ?? []}
        profiles={profiles}
        currentProfile={currentProfile}
        isAdmin={isAdmin}
        scoutingPlayers={scoutingPlayers}
        linkedPlayerIds={matchPlayersByMatchId[dm.id] ?? []}
        scoutingReports={scoutingReports}
        allMatches={scoutingMatches}
        matchPlayersByMatchId={matchPlayersByMatchId}
        onClose={() => setDetailMatchId(null)}
        onEdit={openEditMatch}
        onToggleStatus={handleToggleMatchStatus}
        onAddScout={handleAddScoutToMatch}
        onRemoveScout={handleRemoveScoutFromMatch}
        onSetScoutStatus={handleScoutStatus}
        onSetScoutMode={handleScoutMode}
        onAddMatchPlayer={onAddMatchPlayer}
        onRemoveMatchPlayer={onRemoveMatchPlayer}
        onAddReport={onAddReport}
        onLinkReportToMatch={handleLinkReportToMatch}
        onCreateAndLinkPlayer={handleCreateAndLinkPlayer}
        onFixPlayerTeam={handleFixPlayerTeam}
        onOpenPlayer={id => { if (variant === 'modal') setDetailMatchId(null); setPanelPlayerId(id) }}
        onOpenMatch={id => setDetailMatchId(id)}
        showToast={showToast}
        variant={variant}
      />
    )
  }

  // ── player form ──
  const emptyForm = (): Omit<ScoutingPlayer, 'id' | 'createdAt'> => ({
    fullName: '', position1: '', position2: '', birthdate: '', foot: '',
    team: '', assessment: undefined, nationality: '', agency: '',
    clubContract: '', contacto: '', categoria: '', comentarios: '',
  })
  const [form, setForm] = useState(emptyForm())
  const [savingPlayer, setSavingPlayer] = useState(false)
  const [showPlantilla, setShowPlantilla] = useState(false)
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

  // ── Varios scouts por partido ──
  // assigned_to sigue guardando al responsable principal (Dashboard, avisos).
  async function handleAddScoutToMatch(m: ScoutingMatch, scout: string) {
    if (!scout) return
    try {
      await onAddMatchScout(m.id, scout, m.viewMode ?? 'video')
      if (!m.assignedTo) {
        const updated: ScoutingMatch = { ...m, assignedTo: scout }
        await db.updateScoutingMatch(updated)
        onUpdateMatch(updated)
      }
      showToast(`${personaToName(scout, profiles) || scout} asignado a este partido`)
    } catch {
      showToast('No se pudo asignar el scout. ¿Está ejecutada la migración de match_scouts?', 'error')
    }
  }

  async function handleRemoveScoutFromMatch(m: ScoutingMatch, scout: string) {
    try {
      await onRemoveMatchScout(m.id, scout)
      if (m.assignedTo === scout) {
        const rest = (scoutsByMatch[m.id] ?? []).filter(s => s.scout !== scout)
        const updated: ScoutingMatch = { ...m, assignedTo: rest[0]?.scout }
        await db.updateScoutingMatch(updated)
        onUpdateMatch(updated)
      }
    } catch {
      showToast('No se pudo quitar el scout del partido', 'error')
    }
  }

  async function handleScoutStatus(m: ScoutingMatch, scout: string, status: 'pendiente' | 'visto') {
    try {
      await onSetMatchScoutStatus(m.id, scout, status)
    } catch {
      showToast('No se pudo cambiar el estado del scout', 'error')
    }
  }

  async function handleScoutMode(m: ScoutingMatch, scout: string, viewMode: 'campo' | 'video') {
    try {
      await onSetMatchScoutMode(m.id, scout, viewMode)
    } catch {
      showToast('No se pudo cambiar el modo del scout', 'error')
    }
  }

  /** Fusión manual: superviviente elegido por el usuario; el resto aporta
   *  scouts, jugadores e informes y desaparece. */
  async function handleMergeMatches(survivorId: string, newDate: string) {
    const survivor = scoutingMatches.find(m => m.id === survivorId)
    if (!survivor || merging) return
    const victims = scoutingMatches.filter(m => mergeSelected.has(m.id) && m.id !== survivorId)
    if (victims.length === 0) return
    setMerging(true)
    try {
      // 1) scouts de las copias → superviviente (conservando visto y campo/vídeo)
      for (const v of victims) {
        for (const sc of (scoutsByMatch[v.id] ?? [])) {
          const ya = (scoutsByMatch[survivorId] ?? []).find(x => x.scout === sc.scout)
          if (!ya) {
            await onAddMatchScout(survivorId, sc.scout, sc.viewMode)
            if (sc.status === 'visto') await onSetMatchScoutStatus(survivorId, sc.scout, 'visto')
          } else {
            if (sc.status === 'visto' && ya.status !== 'visto') await onSetMatchScoutStatus(survivorId, sc.scout, 'visto')
            if (sc.viewMode === 'campo' && ya.viewMode !== 'campo') await onSetMatchScoutMode(survivorId, sc.scout, 'campo')
          }
        }
      }
      // 2) informes, jugadores y postpartidos + borrar copias (en BBDD)
      const updated = await db.mergeScoutingMatches(survivor, victims, newDate || undefined)
      onUpdateMatch(updated)
      victims.forEach(v => onDeleteMatch(v.id))
      setMergeSelected(new Set())
      setMergeMode(false)
      setShowMergeModal(false)
      showToast(`${victims.length + 1} partidos fusionados en uno`)
    } catch {
      showToast('No se pudo completar la fusión. Recarga y comprueba el estado del partido.', 'error')
    } finally {
      setMerging(false)
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

        {/* Level 1: main sections (oculto para cuentas solo-Captación) */}
        {!restricted && (
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
        )}

        {/* Captación sub-tabs */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          {([
            { id: 'firmar' as CaptacionTab, label: 'Pipeline/Firmar', labelMobile: 'Pipeline', icon: <PenLine className="w-3.5 h-3.5" /> },
            { id: 'conclusiones' as CaptacionTab, label: 'Conclusiones', labelMobile: 'Concl.', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'contratos' as CaptacionTab, label: 'Fin de contrato', labelMobile: 'Contratos', icon: <Calendar className="w-3.5 h-3.5" /> },
            { id: 'jugadores' as CaptacionTab, label: 'Jugadores', labelMobile: 'Jugadores', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'informes' as CaptacionTab, label: 'Informes recientes', labelMobile: 'Informes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'partidos' as CaptacionTab, label: 'Partidos', labelMobile: 'Partidos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { id: 'pretemporada' as CaptacionTab, label: 'Pretemporada', labelMobile: 'Pretemp.', icon: <Sun className="w-3.5 h-3.5" /> },
          ]).filter(t => !restricted || RESTRICTED_TABS.includes(t.id)).map(t => (
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

              {/* Poner al día los equipos de golpe pegando una plantilla */}
              <button
                onClick={() => setShowPlantilla(true)}
                title="Pega la plantilla de un club y actualiza el equipo de todos esos jugadores de una vez"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-600 rounded-lg hover:border-primary hover:text-primary transition-colors"
              >
                📋 <span className="hidden sm:inline">Actualizar plantilla</span>
              </button>

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
                      const reportCount = reportCountByPlayer[p.id] ?? 0
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
          matchPlayers={matchPlayers}
          boulemaPeticiones={boulemaPeticiones}
          players={players}
          onCreatePlayer={onCreatePlayer}
          onSyncActionTasks={onSyncFirmasActionTasks}
          openEntryId={openFirmasEntryId ?? firmasJumpId}
          onOpenEntryConsumed={() => { onOpenFirmasEntryConsumed?.(); setFirmasJumpId(null) }}
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

      {/* ── FIN DE CONTRATO TAB ──────────────────────────────── */}
      {captTab === 'contratos' && (
        <div className="flex-1 w-full">
          <div className="max-w-6xl mx-auto">
            <ContratosTab
              players={scoutingPlayers}
              firmasEntries={firmasEntries}
              isAdmin={isAdmin}
              onOpenPlayer={id => setPanelPlayerId(id)}
              onSetContract={handleQuickContract}
              onToggleMarketMap={handleToggleMarketMap}
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
        <div className="flex-1 w-full px-3 sm:px-6 py-4">
          {/* Pantalla partida: lista a la izquierda, ficha del partido a la derecha */}
          <div className={detailMatchId && isDesktop ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,36%)] lg:gap-4 lg:items-start' : ''}>
            <div className="space-y-3 min-w-0">
          {/* Notificación de partidos pendientes */}
          {(() => {
            const myPending = scoutingMatches.filter(m => {
              if (m.status === 'visto') return false
              const mine = (scoutsByMatch[m.id] ?? []).find(s => s.scout === currentProfile.avatar)
              return !!mine && mine.status !== 'visto'
            })
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
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setMatchesView('lista')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${matchesView === 'lista' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <ClipboardList className="w-3.5 h-3.5" /><span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  onClick={() => setMatchesView('semana')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${matchesView === 'semana' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <Calendar className="w-3.5 h-3.5" /><span className="hidden sm:inline">Semana</span>
                </button>
              </div>
              <button
                onClick={openAddMatch}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir partido
              </button>
            </div>
          </div>

          {/* ── Agenda semanal de partidos ── */}
          {matchesView === 'semana' && (() => {
            const base = new Date()
            const dow0 = (base.getDay() + 6) % 7
            base.setDate(base.getDate() - dow0 + matchWeekOffset * 7)
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(base); d.setDate(base.getDate() + i)
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            })
            const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setMatchWeekOffset(o => o - 1)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">←</button>
                  <span className="text-xs font-semibold text-slate-700">
                    {new Date(days[0]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – {new Date(days[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {matchWeekOffset === 0 && <span className="text-slate-400 font-normal"> · esta semana</span>}
                  </span>
                  {matchWeekOffset !== 0 && (
                    <button onClick={() => setMatchWeekOffset(0)} className="text-[11px] text-blue-600 hover:underline">hoy</button>
                  )}
                  <button onClick={() => setMatchWeekOffset(o => o + 1)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">→</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
                  {days.map((d, i) => {
                    const dayMatches = filteredMatches.filter(m => m.date === d).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
                    const isToday = d === todayISO()
                    return (
                      <div key={d} className={`rounded-lg border p-1.5 min-h-[64px] ${isToday ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
                        <div className={`text-[10px] font-bold uppercase mb-1 ${isToday ? 'text-blue-700' : 'text-slate-400'}`}>
                          {DOW[i]} {parseInt(d.slice(8), 10)}
                        </div>
                        <div className="space-y-1">
                          {dayMatches.map(m => (
                            <div
                              key={m.id}
                              className={`rounded-md border px-1.5 py-1 bg-white ${m.status === 'visto' ? 'border-slate-200 opacity-70' : 'border-blue-200'}`}
                              title={`${m.homeTeam} vs ${m.awayTeam}${m.competition ? ` · ${m.competition}` : ''}${m.assignedTo ? ` · lo ve ${m.assignedTo}` : ''}`}
                            >
                              <div className="text-[10.5px] font-medium text-slate-700 leading-tight">{m.homeTeam} – {m.awayTeam}</div>
                              <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-slate-400">
                                {m.time && <span>{m.time}</span>}
                                {m.assignedTo && <span className="font-mono font-bold text-slate-500">{m.assignedTo}</span>}
                                <span>{m.viewMode === 'campo' ? '🏟️' : '📹'}</span>
                                {m.status === 'visto' && <span className="text-emerald-600">✓</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-[10.5px] text-slate-400">La agenda respeta los filtros. Para editar o marcar visto un partido, usa la vista Lista.</p>
              </div>
            )
          })()}

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

              {/* Ocultar futuros */}
              <button
                onClick={() => setHideFutureMatches(v => !v)}
                title={hideFutureMatches ? 'Mostrando hasta hoy incluido — clic para ver también los de mañana en adelante' : 'Ocultar los partidos de mañana en adelante (los de hoy se siguen viendo)'}
                className={`text-xs border rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
                  hideFutureMatches
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {hideFutureMatches ? '👁 Hasta hoy' : 'Ocultar futuros'}
              </button>

              {/* Fusionar partidos */}
              <button
                onClick={() => { setMergeMode(v => !v); setMergeSelected(new Set()) }}
                title={mergeMode ? 'Salir del modo fusión' : 'Seleccionar partidos duplicados y fusionarlos en uno'}
                className={`text-xs border rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
                  mergeMode
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {mergeMode ? '✕ Cancelar fusión' : '⇄ Fusionar'}
              </button>

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
            if (hideFutureMatches) chips.push({ key: 'nofuture', label: 'Hasta hoy incluido', onRemove: () => setHideFutureMatches(false) })
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
            matchesView === 'semana' ? null : (
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
                        {mergeMode && (
                          <input
                            type="checkbox"
                            checked={mergeSelected.has(m.id)}
                            onChange={() => toggleMergeSelected(m.id)}
                            className="w-5 h-5 rounded mt-0.5 flex-shrink-0 accent-violet-600"
                            aria-label={`Seleccionar ${m.homeTeam} vs ${m.awayTeam} para fusionar`}
                          />
                        )}
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
                            {(scoutsByMatch[m.id] ?? []).map(s2 => (
                              <span key={s2.scout} className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${s2.status === 'visto' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'}`}>
                                {s2.scout}{s2.status === 'visto' ? ' ✓' : ''}
                              </span>
                            ))}
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
                      <button
                        onClick={() => setDetailMatchId(m.id)}
                        className="w-full text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg py-2 hover:bg-violet-100 transition-colors"
                      >
                        Abrir partido · jugadores, scouts e informes
                      </button>
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
                            scouts={scoutsByMatch[m.id] ?? []}
                            profiles={profiles}
                            currentProfile={currentProfile}
                            isAdmin={isAdmin}
                            scoutingPlayers={scoutingPlayers}
                            linkedPlayerIds={linkedPlayerIds}
                            scoutingReports={scoutingReports}
                            onEdit={openEditMatch}
                            onDelete={handleDeleteMatch}
                            onToggleStatus={handleToggleMatchStatus}
                            onOpenDetail={setDetailMatchId}
                            mergeMode={mergeMode}
                            mergeSelected={mergeSelected.has(m.id)}
                            onToggleMerge={toggleMergeSelected}
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
            )
          )}
            </div>

            {/* Ficha del partido, fija al lado de la lista */}
            {detailMatchId && isDesktop && (
              <aside className="hidden lg:block lg:sticky lg:top-4 min-w-0">
                {renderFichaPartido('panel')}
              </aside>
            )}
          </div>
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
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <AssessmentChip a={panelPlayer.assessment} />
                      {panelPlayer.categoria && (
                        <span className="text-xs text-slate-500">{panelPlayer.categoria}</span>
                      )}
                      <AddToFirmasButton
                        player={panelPlayer}
                        firmasEntries={firmasEntries}
                        currentProfile={currentProfile}
                        onCreate={onCreateFirmasEntry}
                        onJumpToEntry={(id) => { closePanel(); setCaptTab('firmar'); setFirmasJumpId(id) }}
                        showToast={showToast}
                      />
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
                                {!reportText.trim() && (
                                  <button
                                    onClick={() => setReportText(REPORT_TEMPLATE)}
                                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    📋 Usar plantilla (físico · técnica · táctica · mentalidad · contexto)
                                  </button>
                                )}
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
                                {/* ¿De qué partido es este informe? Un toque y queda vinculado */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Partido</span>
                                  {reportMatchSuggestions.list.map(({ m, linked, days }) => {
                                    const sel = reportMatchId === m.id
                                    return (
                                      <button
                                        key={m.id}
                                        onClick={() => setReportMatchId(sel ? '' : m.id)}
                                        title={`${m.homeTeam} vs ${m.awayTeam} · ${fmtDate(m.date)}${linked ? ' · ya vinculado a este jugador' : ''}`}
                                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
                                          sel
                                            ? 'bg-violet-600 text-white border-violet-600'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                                        }`}
                                      >
                                        {linked && '✓ '}{m.homeTeam} vs {m.awayTeam}
                                        <span className={sel ? 'text-white/70' : 'text-slate-400'}> · {days === 0 ? 'hoy' : `hace ${days}d`}</span>
                                      </button>
                                    )
                                  })}
                                  {reportMatchSuggestions.list.length === 0 && (
                                    <span className="text-[11px] text-slate-400">Sin partidos recientes de su equipo — búscalo abajo</span>
                                  )}
                                </div>
                                {!reportMatchId && (
                                  <p className="text-[10.5px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                                    Sin partido: el informe se guarda igual, pero no aparecerá en la ficha del partido.
                                  </p>
                                )}
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

      {/* ── Barra de fusión ── */}
      {mergeMode && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-violet-600 text-white rounded-full shadow-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs font-semibold whitespace-nowrap">
            {mergeSelected.size === 0
              ? 'Toca los partidos que quieras fusionar'
              : `${mergeSelected.size} partido${mergeSelected.size !== 1 ? 's' : ''} seleccionado${mergeSelected.size !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => setShowMergeModal(true)}
            disabled={mergeSelected.size < 2}
            className="text-xs font-bold bg-white text-violet-700 rounded-full px-3 py-1.5 disabled:opacity-40 whitespace-nowrap"
          >
            Fusionar →
          </button>
        </div>
      )}

      {/* ── Modal de fusión ── */}
      {showMergeModal && mergeSelected.size >= 2 && (
        <MergeMatchesModal
          matches={scoutingMatches.filter(m => mergeSelected.has(m.id))}
          scoutsByMatch={scoutsByMatch}
          matchPlayersByMatchId={matchPlayersByMatchId}
          scoutingReports={scoutingReports}
          merging={merging}
          onClose={() => setShowMergeModal(false)}
          onConfirm={handleMergeMatches}
        />
      )}

      {/* ── Actualizar plantilla de un club (equipos al día de golpe) ── */}
      {showPlantilla && (
        <ActualizarPlantilla
          scoutingPlayers={scoutingPlayers}
          onClose={() => setShowPlantilla(false)}
          onFixTeam={handleFixPlayerTeam}
          onCreate={async (nombre, equipo) => {
            const saved = await db.createScoutingPlayer({ fullName: nombre.trim(), team: equipo || undefined })
            onAddPlayer(saved)
          }}
          showToast={showToast}
        />
      )}

      {/* ── Ficha de partido: ventana flotante solo en móvil (en escritorio
             va al lado de la lista, dentro de la pestaña Partidos) ── */}
      {!isDesktop && renderFichaPartido('modal')}

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
