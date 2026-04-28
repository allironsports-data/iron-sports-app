import React, { useState, useMemo, useEffect } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, ChevronDown,
  FileText, Calendar, ChevronRight,
  TrendingUp, Eye, Maximize2, Minimize2, Pencil,
  BarChart2, ClipboardList, Users,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch } from '../types'
import type { Profile } from '../contexts/AuthContext'
import * as db from '../lib/db'

// ── Constants ────────────────────────────────────────────────

type CaptacionTab = 'jugadores' | 'informes' | 'estadisticas' | 'partidos'

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
  'Portero', 'Central', 'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Delantero',
]

const CONCLUSION_OPTIONS = ['', 'Seguir', 'Firmar', 'Descartar'] as const
type ConclusionOption = typeof CONCLUSION_OPTIONS[number]

const CONCLUSION_STYLE: Record<string, string> = {
  Seguir:    'bg-blue-100 text-blue-700 border border-blue-200',
  Firmar:    'bg-green-100 text-green-700 border border-green-200',
  Descartar: 'bg-red-100 text-red-600 border border-red-200',
  // legado — por si hay registros antiguos con estos valores
  Llamar:    'bg-green-100 text-green-700 border border-green-200',
  Decidir:   'bg-orange-100 text-orange-700 border border-orange-200',
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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

// ── Sub-components ───────────────────────────────────────────

function AssessmentChip({ a, small }: { a?: ScoutingAssessment; small?: boolean }) {
  if (!a) return <span className="text-slate-300 text-xs">—</span>
  const cfg = ASSESSMENT_CONFIG[a]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'text-[10px] px-1' : ''}`}>
      {cfg.label}
    </span>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-2">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-medium text-slate-700 mt-0.5 truncate">{value}</div>
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
}: {
  report: ScoutingReport
  profiles: Profile[]
  currentProfile: Profile
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => Promise<void>
  onUpdate?: (r: ScoutingReport) => Promise<void>
  playerName?: string  // optional: shown in "informes recientes" tab
}) {
  const isConfirming = confirmDeleteId === report.id
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState(report.titulo ?? '')
  const [editText, setEditText] = useState(report.texto ?? '')
  const [editConclusion, setEditConclusion] = useState<ConclusionOption>(
    (CONCLUSION_OPTIONS as readonly string[]).includes(report.conclusion ?? '') ? (report.conclusion ?? '') as ConclusionOption : ''
  )
  const [saving, setSaving] = useState(false)

  const authorName = personaToName(report.persona, profiles)

  async function handleSaveEdit() {
    if (!onUpdate) return
    setSaving(true)
    try {
      const updated: ScoutingReport = {
        ...report,
        titulo: editTitle.trim() || undefined,
        texto: editText.trim() || undefined,
        conclusion: editConclusion || undefined,
      }
      await onUpdate(updated)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  if (editMode) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Editando informe</span>
          <button onClick={() => setEditMode(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
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
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditMode(false)} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={saving || !editText.trim()}
            className="flex-1 py-1.5 bg-[hsl(220,72%,26%)] text-white rounded-lg font-medium hover:bg-[hsl(220,72%,20%)] disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar'}
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
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
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
              <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${CONCLUSION_STYLE[report.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                {report.conclusion}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onUpdate && (
            <button
              onClick={() => setEditMode(true)}
              className="text-slate-300 hover:text-blue-500 p-0.5"
              title="Editar informe"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {currentProfile.is_admin && (
            isConfirming ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(report.id)} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded font-medium">Eliminar</button>
                <button onClick={() => onConfirmDelete(null)} className="px-2 py-0.5 text-[10px] border border-slate-200 rounded text-slate-600">No</button>
              </div>
            ) : (
              <button onClick={() => onConfirmDelete(report.id)} className="text-slate-300 hover:text-red-500 p-0.5">
                <Trash2 className="w-3 h-3" />
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

// ── MatchRow ──────────────────────────────────────────────────

function MatchRow({
  match,
  scoutName,
  profiles,
  currentProfile,
  isAdmin,
  onEdit,
  onDelete,
  onToggleStatus,
  onAssign,
}: {
  match: ScoutingMatch
  scoutName: string
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  onEdit: (m: ScoutingMatch) => void
  onDelete: (id: string) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onAssign: (m: ScoutingMatch, assignedTo: string) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'
  const isAssignedToMe = match.assignedTo === currentProfile.avatar
  // highlight row if assigned to me and pending
  const isPendingForMe = isAssignedToMe && !isVisto

  return (
    <tr className={`transition-colors ${isPendingForMe ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/60'}`}>
      {/* Fecha */}
      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
        {day} {mon} '{yr}
      </td>
      {/* Local */}
      <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">{match.homeTeam}</td>
      {/* vs */}
      <td className="px-2 py-2 text-[10px] font-bold text-slate-400 text-center">vs</td>
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
        {match.viewMode === 'campo' ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
            🏟️ Campo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
            📹 Vídeo
          </span>
        )}
      </td>
      {/* Scout / Asignación */}
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {assignOpen ? (
          <select
            autoFocus
            className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            defaultValue={match.assignedTo ?? ''}
            onBlur={() => setAssignOpen(false)}
            onChange={e => { onAssign(match, e.target.value); setAssignOpen(false) }}
          >
            <option value="">Sin asignar</option>
            {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
          </select>
        ) : (
          <button
            onClick={() => setAssignOpen(true)}
            className={`text-left hover:underline ${match.assignedTo ? '' : 'text-slate-300 italic'}`}
            title="Clic para reasignar"
          >
            {match.assignedTo ? (
              <>
                <span className="font-mono font-semibold text-slate-700">{match.assignedTo}</span>
                {scoutName && scoutName !== match.assignedTo && (
                  <span className="text-slate-400 ml-1">({scoutName})</span>
                )}
              </>
            ) : (
              <span className="text-slate-300">— asignar</span>
            )}
          </button>
        )}
      </td>
      {/* Jugadores/notas */}
      <td className="px-3 py-2 text-xs text-slate-500 max-w-[180px] truncate" title={match.notes ?? ''}>
        {match.notes ?? '—'}
      </td>
      {/* Visto */}
      <td className="px-3 py-2 text-center">
        <button
          onClick={() => onToggleStatus(match)}
          title={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
            isVisto
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
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
          <button
            onClick={() => onEdit(match)}
            className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (
            confirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(match.id); setConfirm(false) }}
                  className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded font-medium"
                >
                  Sí
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  className="px-2 py-0.5 text-[10px] border border-slate-200 rounded text-slate-600"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </td>
    </tr>
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
}: Props) {
  const isAdmin = currentProfile.is_admin

  // ── section tab ──
  const [captTab, setCaptTab] = useState<CaptacionTab>('jugadores')

  // ── filter state ──
  const [search, setSearch] = useState('')
  const [assessFilter, setAssessFilter] = useState<ScoutingAssessment | 'all'>('all')
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all')
  const [posFilter, setPosFilter] = useState<string>('all')
  const [showCatMenu, setShowCatMenu] = useState(false)
  const [showPosMenu, setShowPosMenu] = useState(false)

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
  const [savingReport, setSavingReport] = useState(false)
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<string | null>(null)
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false)

  // ── match state ──
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [editingMatch, setEditingMatch] = useState<ScoutingMatch | null>(null)
  const [matchForm, setMatchForm] = useState({ date: '', homeTeam: '', awayTeam: '', competition: '', assignedTo: '', viewMode: 'video' as 'video' | 'campo', notes: '' })
  const [savingMatch, setSavingMatch] = useState(false)

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
    const q = search.toLowerCase().trim()
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
  }, [scoutingPlayers, search, assessFilter, categoriaFilter, posFilter])

  useEffect(() => { setPage(0) }, [search, assessFilter, categoriaFilter, posFilter])

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

  // ── recent reports ──
  const recentReports = useMemo(() => {
    return [...scoutingReports]
      .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
      .slice(0, 60)
  }, [scoutingReports])

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
        authorId: currentProfile.id,
      })
      onAddReport(saved)
      setReportTitle('')
      setReportText('')
      setReportConclusion('')
    } finally {
      setSavingReport(false)
    }
  }

  async function handleUpdateReport(r: ScoutingReport) {
    await db.updateScoutingReport(r)
    onUpdateReport(r)
  }

  async function handleDeleteReport(id: string) {
    await db.deleteScoutingReport(id)
    onDeleteReport(id)
    setConfirmDeleteReport(null)
  }

  async function handleDeletePlayer() {
    if (!panelPlayer) return
    await db.deleteScoutingPlayer(panelPlayer.id)
    onDeletePlayer(panelPlayer.id)
    setPanelPlayerId(null)
    setConfirmDeletePlayer(false)
  }

  async function handleQuickAssessment(player: ScoutingPlayer, assessment: ScoutingAssessment | undefined) {
    const updated = { ...player, assessment }
    await db.updateScoutingPlayer(updated)
    onUpdatePlayer(updated)
  }

  // ── player form ──
  const emptyForm = (): Omit<ScoutingPlayer, 'id' | 'createdAt'> => ({
    fullName: '', position1: '', position2: '', birthdate: '', foot: '',
    team: '', assessment: undefined, nationality: '', agency: '',
    clubContract: '', contacto: '', categoria: '', comentarios: '',
  })
  const [form, setForm] = useState(emptyForm())

  function openAddPlayer() {
    setForm(emptyForm())
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
    setEditTarget(p)
    setShowEditPlayer(true)
    setShowAddPlayer(false)
  }

  async function handleSavePlayer() {
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
    if (showEditPlayer && editTarget) {
      const updated = { ...editTarget, ...payload }
      await db.updateScoutingPlayer(updated)
      onUpdatePlayer(updated)
      setPanelPlayerId(updated.id)
    } else {
      const saved = await db.createScoutingPlayer(payload)
      onAddPlayer(saved)
      setPanelPlayerId(saved.id)
    }
    setShowAddPlayer(false)
    setShowEditPlayer(false)
    setEditTarget(null)
  }

  // ── match handlers ──
  function openAddMatch() {
    const today = new Date().toISOString().slice(0, 10)
    setMatchForm({ date: today, homeTeam: '', awayTeam: '', competition: '', assignedTo: currentProfile.avatar, viewMode: 'video', notes: '' })
    setEditingMatch(null)
    setShowAddMatch(true)
  }

  function openEditMatch(m: ScoutingMatch) {
    setMatchForm({ date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam, competition: m.competition ?? '', assignedTo: m.assignedTo ?? '', viewMode: m.viewMode ?? 'video', notes: m.notes ?? '' })
    setEditingMatch(m)
    setShowAddMatch(true)
  }

  async function handleSaveMatch() {
    if (!matchForm.homeTeam.trim() || !matchForm.awayTeam.trim() || !matchForm.date) return
    setSavingMatch(true)
    try {
      const payload = {
        date: matchForm.date,
        homeTeam: matchForm.homeTeam.trim(),
        awayTeam: matchForm.awayTeam.trim(),
        competition: matchForm.competition.trim() || undefined,
        assignedTo: matchForm.assignedTo.trim() || undefined,
        viewMode: matchForm.viewMode,
        status: (editingMatch?.status ?? 'pendiente') as 'pendiente' | 'visto',
        notes: matchForm.notes.trim() || undefined,
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
    } finally {
      setSavingMatch(false)
    }
  }

  async function handleDeleteMatch(id: string) {
    await db.deleteScoutingMatch(id)
    onDeleteMatch(id)
  }

  async function handleToggleMatchStatus(m: ScoutingMatch) {
    const updated: ScoutingMatch = { ...m, status: m.status === 'visto' ? 'pendiente' : 'visto' }
    await db.updateScoutingMatch(updated)
    onUpdateMatch(updated)
  }

  async function handleAssignMatch(m: ScoutingMatch, assignedTo: string) {
    const updated: ScoutingMatch = { ...m, assignedTo: assignedTo || undefined, status: 'pendiente' }
    await db.updateScoutingMatch(updated)
    onUpdateMatch(updated)
  }

  const closeCatMenu = () => setShowCatMenu(false)
  const closePosMenu = () => setShowPosMenu(false)

  function closePanel() {
    setPanelPlayerId(null)
    setShowAddPlayer(false)
    setShowEditPlayer(false)
    setConfirmDeletePlayer(false)
    setFullscreen(false)
  }

  // ── render ───────────────────────────────────────────────────

  const hasPanel = !!panelPlayer || showAddPlayer || showEditPlayer

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-3 h-12 sm:h-14">
          <img src={logoImg} alt="All Iron Sports" className="h-7 sm:h-8 w-auto rounded" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase hidden sm:block">All Iron Sports</span>
          <div className="flex-1" />
          {onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100">Admin</button>
          )}
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Main nav tabs */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100">
          {([
            { id: 'tareas' as const, label: 'Tareas' },
            { id: 'jugadores' as const, label: 'Jugadores' },
            { id: 'distribucion' as const, label: 'Distribución', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'captacion' as const, label: 'Captación', icon: <Eye className="w-3.5 h-3.5" /> },
          ]).map(tab => {
            const isActive = tab.id === 'captacion'
            return (
              <button
                key={tab.id}
                onClick={() => tab.id === 'captacion' ? undefined : onGoToSection(tab.id as 'tareas' | 'jugadores' | 'distribucion')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Captación sub-tabs */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60">
          {([
            { id: 'jugadores' as CaptacionTab, label: 'Jugadores', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'informes' as CaptacionTab, label: 'Informes recientes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'estadisticas' as CaptacionTab, label: 'Estadísticas', icon: <BarChart2 className="w-3.5 h-3.5" /> },
            { id: 'partidos' as CaptacionTab, label: 'Partidos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setCaptTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                captTab === t.id
                  ? 'bg-[hsl(220,72%,26%)] text-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── JUGADORES TAB ────────────────────────────────────── */}
      {captTab === 'jugadores' && (
        <>
          {/* Filters bar */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
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
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Assessment chips */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setAssessFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
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
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
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
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[hsl(220,72%,26%)] text-white rounded-lg hover:bg-[hsl(220,72%,20%)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-4">
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
                        <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                          No se encontraron jugadores con los filtros actuales
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
                            <div className="font-medium text-slate-800 text-sm">{p.fullName}</div>
                            {p.nationality && <div className="text-xs text-slate-400">{p.nationality}</div>}
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
                          <td className="px-2 py-2.5">
                            <AssessmentChip a={p.assessment} />
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
                <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50">
                  <span className="text-xs text-slate-500">
                    Página {page + 1} de {totalPages} · {filtered.length} resultados
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Anterior
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const idx = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i
                      return (
                        <button
                          key={idx}
                          onClick={() => setPage(idx)}
                          className={`w-7 h-7 text-xs font-medium rounded border transition-colors ${
                            idx === page
                              ? 'bg-[hsl(220,72%,26%)] text-white border-[hsl(220,72%,26%)]'
                              : 'border-slate-200 hover:bg-white text-slate-600'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <div className="text-[10px] text-slate-400 truncate">{name}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent reports list */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Últimos {recentReports.length} informes
            </h3>
            <div className="space-y-2">
              {recentReports.map(r => {
                const player = scoutingPlayers.find(p => p.id === r.playerId)
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
                          {player?.position1 && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{player.position1}</span>}
                          {r.conclusion && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CONCLUSION_STYLE[r.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                              {r.conclusion}
                            </span>
                          )}
                        </div>
                        {r.titulo && <div className="text-xs font-medium text-slate-600 mb-0.5">{r.titulo}</div>}
                        {r.texto && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{r.texto}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-slate-400">{fmtDate(r.fecha)}</div>
                        {r.persona && (
                          <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">{r.persona}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
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
              <div className="flex items-end gap-1 h-24">
                {stats.months.map(({ label, count }) => {
                  const maxCount = Math.max(...stats.months.map(m => m.count), 1)
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px] text-slate-500 font-medium">{count || ''}</div>
                      <div className="w-full bg-slate-100 rounded-t" style={{ height: '60px' }}>
                        <div
                          className="w-full bg-[hsl(220,72%,36%)] rounded-t transition-all"
                          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-400 whitespace-nowrap">{label}</div>
                    </div>
                  )
                })}
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
                      <div className="text-[10px] font-semibold text-amber-600 uppercase mb-2">Pendientes de ver</div>
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
                        <div className="text-[10px] text-blue-500">vídeo</div>
                      </div>
                    )}
                    {matchStats.campo > 0 && (
                      <div className="flex-1 text-center bg-emerald-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-emerald-700">{Math.round((matchStats.campo / scoutingMatches.length) * 100)}%</div>
                        <div className="text-[10px] text-emerald-500">campo</div>
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
                  <div className="flex items-end gap-1 h-24">
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[hsl(220,72%,26%)] text-white rounded-lg hover:bg-[hsl(220,72%,20%)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir partido
            </button>
          </div>

          {/* Add/edit match form */}
          {showAddMatch && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">{editingMatch ? 'Editar partido' : 'Nuevo partido'}</h3>
              <div className="grid grid-cols-3 gap-2">
                <FormRow label="Fecha">
                  <input type="date" value={matchForm.date} onChange={e => setMatchForm(f => ({ ...f, date: e.target.value }))} className="field" />
                </FormRow>
                <FormRow label="Competición">
                  <input
                    value={matchForm.competition}
                    onChange={e => setMatchForm(f => ({ ...f, competition: e.target.value }))}
                    list="competition-options"
                    className="field"
                    placeholder="Liga, Copa..."
                  />
                  <datalist id="competition-options">
                    {COMPETITION_OPTIONS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </FormRow>
                <FormRow label="Visualización">
                  <select value={matchForm.viewMode} onChange={e => setMatchForm(f => ({ ...f, viewMode: e.target.value as 'video' | 'campo' }))} className="field">
                    <option value="video">📹 Vídeo</option>
                    <option value="campo">🏟️ Campo</option>
                  </select>
                </FormRow>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormRow label="Local">
                  <input value={matchForm.homeTeam} onChange={e => setMatchForm(f => ({ ...f, homeTeam: e.target.value }))} className="field" placeholder="Equipo local" />
                </FormRow>
                <FormRow label="Visitante">
                  <input value={matchForm.awayTeam} onChange={e => setMatchForm(f => ({ ...f, awayTeam: e.target.value }))} className="field" placeholder="Equipo visitante" />
                </FormRow>
              </div>
              <FormRow label="Asignado a">
                <select value={matchForm.assignedTo} onChange={e => setMatchForm(f => ({ ...f, assignedTo: e.target.value }))} className="field">
                  <option value="">Sin asignar</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="Notas">
                <textarea value={matchForm.notes} onChange={e => setMatchForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="field resize-none" placeholder="Jugadores vistos, observaciones..." />
              </FormRow>
              <div className="flex gap-2">
                <button onClick={() => { setShowAddMatch(false); setEditingMatch(null) }} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button
                  onClick={handleSaveMatch}
                  disabled={savingMatch || !matchForm.homeTeam.trim() || !matchForm.awayTeam.trim() || !matchForm.date}
                  className="flex-1 py-2 text-sm bg-[hsl(220,72%,26%)] text-white rounded-lg font-medium hover:bg-[hsl(220,72%,20%)] disabled:opacity-40"
                >
                  {savingMatch ? 'Guardando...' : editingMatch ? 'Guardar cambios' : 'Añadir partido'}
                </button>
              </div>
            </div>
          )}

          {scoutingMatches.length === 0 && !showAddMatch ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>No hay partidos registrados aún</p>
              <p className="text-xs mt-1 text-slate-300">Si acabas de activar esta función, recuerda ejecutar el SQL de creación de tabla en Supabase</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2.5 font-semibold w-[88px]">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Local</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-6">vs</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Visitante</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Competición</th>
                      <th className="text-left px-3 py-2.5 font-semibold w-[90px]">Modo</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Scout</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Jugadores</th>
                      <th className="text-center px-3 py-2.5 font-semibold w-12">Visto</th>
                      <th className="px-3 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scoutingMatches.map(m => {
                      const scoutName = personaToName(m.assignedTo, profiles)
                      return (
                        <MatchRow
                          key={m.id}
                          match={m}
                          scoutName={scoutName}
                          profiles={profiles}
                          currentProfile={currentProfile}
                          isAdmin={isAdmin}
                          onEdit={openEditMatch}
                          onDelete={handleDeleteMatch}
                          onToggleStatus={handleToggleMatchStatus}
                          onAssign={handleAssignMatch}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Side panel (persists across tabs) ─────────────────── */}
      {hasPanel && (
        <>
          {!fullscreen && (
            <div className="fixed inset-0 bg-black/20 z-30" onClick={closePanel} />
          )}

          <div className={
            fullscreen
              ? 'fixed inset-0 z-40 flex flex-col bg-white overflow-hidden'
              : 'fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200'
          }>
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
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title={fullscreen ? 'Minimizar' : 'Pantalla completa'}
                  >
                    {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={closePanel} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className={`flex-1 overflow-y-auto ${fullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>

              {/* ── Add / Edit player form ── */}
              {(showAddPlayer || showEditPlayer) && (
                <div className="p-4 space-y-3">
                  <FormRow label="Nombre *">
                    <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                      className="field" placeholder="Nombre completo" />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
                      disabled={!form.fullName.trim()}
                      className="flex-1 py-2 text-sm bg-[hsl(220,72%,26%)] text-white rounded-lg font-medium hover:bg-[hsl(220,72%,20%)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {showEditPlayer ? 'Guardar cambios' : 'Crear jugador'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Player detail ── */}
              {panelPlayer && !showEditPlayer && (
                <div className={`p-4 space-y-5 ${fullscreen ? 'grid grid-cols-2 gap-6 items-start' : ''}`}>
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
                        <div className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Comentarios</div>
                        {panelPlayer.comentarios}
                      </div>
                    )}

                    {/* Quick assessment — available to all users */}
                    <div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Assessment</div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleQuickAssessment(panelPlayer, undefined)}
                          className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
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
                              className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
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
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-red-100"
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
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        Informes
                        {panelReports.length > 0 && (
                          <span className="ml-1 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{panelReports.length}</span>
                        )}
                      </h3>

                      <div className="space-y-3 mb-4">
                        {panelReports.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Sin informes todavía.</p>
                        ) : panelReports.map(r => (
                          <ReportCard
                            key={r.id}
                            report={r}
                            profiles={profiles}
                            currentProfile={currentProfile}
                            confirmDeleteId={confirmDeleteReport}
                            onConfirmDelete={setConfirmDeleteReport}
                            onDelete={handleDeleteReport}
                            onUpdate={handleUpdateReport}
                          />
                        ))}
                      </div>

                      {/* Add report form */}
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold text-slate-600">Añadir informe</div>
                          <span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                            {currentProfile.avatar} · {currentProfile.name.split(' ')[0]}
                          </span>
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
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddReport() }
                          }}
                        />
                        <select
                          value={reportConclusion}
                          onChange={e => setReportConclusion(e.target.value as ConclusionOption)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                          <option value="">Sin conclusión</option>
                          {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">⌘+Enter para guardar</span>
                          <button
                            onClick={handleAddReport}
                            disabled={!reportText.trim() || savingReport}
                            className="px-3 py-1.5 text-xs font-semibold bg-[hsl(220,72%,26%)] text-white rounded-lg hover:bg-[hsl(220,72%,20%)] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {savingReport ? 'Guardando...' : 'Guardar informe'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
