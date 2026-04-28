import React, { useState, useMemo, useEffect } from 'react'
import {
  Search, X, Plus, LogOut, Trash2, ChevronDown,
  FileText, Calendar, ChevronRight,
  TrendingUp, Eye,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment } from '../types'
import type { Profile } from '../contexts/AuthContext'
import * as db from '../lib/db'
import { calcAge } from '../types'

// ── constants ──────────────────────────────────────────────────

const ASSESSMENT_CONFIG: Record<ScoutingAssessment, { label: string; bg: string; text: string; border: string }> = {
  Visto:   { label: 'Visto',   bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200' },
  Seguir:  { label: 'Seguir',  bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  Llamar:  { label: 'Llamar',  bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  Basque:  { label: 'Basque',  bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
}

const ALL_ASSESSMENTS: ScoutingAssessment[] = ['Seguir', 'Llamar', 'Basque', 'Visto']

const POSITIONS_SCOUTING = [
  'Portero', 'Central', 'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Delantero',
]

// ── helpers ────────────────────────────────────────────────────

function ageFromBirthdate(birthdate?: string): string {
  if (!birthdate) return '—'
  try { return String(calcAge(birthdate)) } catch { return '—' }
}

function posLabel(p?: string) { return p ?? '—' }

function AssessmentChip({ a, small }: { a?: ScoutingAssessment; small?: boolean }) {
  if (!a) return <span className="text-slate-300 text-xs">—</span>
  const cfg = ASSESSMENT_CONFIG[a]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'text-[10px] px-1' : ''}`}>
      {cfg.label}
    </span>
  )
}

// ── props ──────────────────────────────────────────────────────

interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  currentProfile: Profile
  onBack: () => void
  onGoToSection: (s: 'tareas' | 'jugadores' | 'distribucion') => void
  onLogout: () => void
  onAdmin?: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onUpdatePlayer: (p: ScoutingPlayer) => void
  onDeletePlayer: (id: string) => void
  onAddReport: (r: ScoutingReport) => void
  onDeleteReport: (id: string) => void
}

// ── main component ─────────────────────────────────────────────

export function Captacion({
  scoutingPlayers,
  scoutingReports,
  currentProfile,
  onGoToSection,
  onLogout,
  onAdmin,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onAddReport,
  onDeleteReport,
}: Props) {
  const isAdmin = currentProfile.is_admin

  // ── filter state ──
  const [search, setSearch] = useState('')
  const [assessFilter, setAssessFilter] = useState<ScoutingAssessment | 'all'>('all')
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all')
  const [posFilter, setPosFilter] = useState<string>('all')
  const [showCatMenu, setShowCatMenu] = useState(false)
  const [showPosMenu, setShowPosMenu] = useState(false)

  // ── panel state ──
  const [panelPlayerId, setPanelPlayerId] = useState<string | null>(null)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showEditPlayer, setShowEditPlayer] = useState(false)
  const [editTarget, setEditTarget] = useState<ScoutingPlayer | null>(null)

  // ── report state ──
  const [reportText, setReportText] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [savingReport, setSavingReport] = useState(false)
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<string | null>(null)
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false)

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

  // ── derived category list ──
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    scoutingPlayers.forEach(p => { if (p.categoria) cats.add(p.categoria) })
    return Array.from(cats).sort()
  }, [scoutingPlayers])

  // ── filter logic ──
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

  // reset page when filters change
  useEffect(() => { setPage(0) }, [search, assessFilter, categoriaFilter, posFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // ── report submit ──
  async function handleAddReport() {
    if (!panelPlayer || !reportText.trim()) return
    setSavingReport(true)
    try {
      const saved = await db.createScoutingReport({
        playerId: panelPlayer.id,
        fecha: new Date().toISOString(),
        titulo: reportTitle.trim() || undefined,
        texto: reportText.trim(),
        authorId: currentProfile.id,
      })
      onAddReport(saved)
      setReportTitle('')
      setReportText('')
    } finally {
      setSavingReport(false)
    }
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

  // ── add/edit player form ──
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

  const closeCatMenu = () => setShowCatMenu(false)
  const closePosMenu = () => setShowPosMenu(false)

  // ── render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
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

        {/* Nav tabs */}
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
      </header>

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
          <div className="flex items-center gap-1">
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
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-64 overflow-y-auto">
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

          {/* Result count */}
          <span className="text-xs text-slate-400">{filtered.length} jugadores</span>

          {/* Add player button (admin) */}
          {isAdmin && (
            <button
              onClick={openAddPlayer}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[hsl(220,72%,26%)] text-white rounded-lg hover:bg-[hsl(220,72%,20%)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir
            </button>
          )}
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
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Edad</th>
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
                        <div>{posLabel(p.position1)}</div>
                        {p.position2 && <div className="text-slate-400">{p.position2}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 hidden sm:table-cell">
                        {ageFromBirthdate(p.birthdate)}
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

          {/* Pagination */}
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

      {/* ── Side panel ─────────────────────────────────────────── */}
      {(panelPlayer || showAddPlayer || showEditPlayer) && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => { setPanelPlayerId(null); setShowAddPlayer(false); setShowEditPlayer(false) }}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200">
            {/* Panel header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
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
              <button
                onClick={() => { setPanelPlayerId(null); setShowAddPlayer(false); setShowEditPlayer(false); setConfirmDeletePlayer(false) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Add / Edit player form ── */}
              {(showAddPlayer || showEditPlayer) && (
                <div className="p-4 space-y-3">
                  <FormRow label="Nombre *">
                    <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                      className="field" placeholder="Nombre completo" />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-2">
                    <FormRow label="Posición 1">
                      <input value={form.position1 ?? ''} onChange={e => setForm(f => ({ ...f, position1: e.target.value }))}
                        className="field" placeholder="Ej: Lateral derecho" />
                    </FormRow>
                    <FormRow label="Posición 2">
                      <input value={form.position2 ?? ''} onChange={e => setForm(f => ({ ...f, position2: e.target.value }))}
                        className="field" placeholder="Secundaria" />
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

              {/* ── Player detail panel ── */}
              {panelPlayer && !showEditPlayer && (
                <div className="p-4 space-y-5">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <InfoItem label="Posición" value={[panelPlayer.position1, panelPlayer.position2].filter(Boolean).join(' / ') || '—'} />
                    <InfoItem label="Edad" value={ageFromBirthdate(panelPlayer.birthdate) + (panelPlayer.birthdate ? ` (${panelPlayer.birthdate.slice(0,4)})` : '')} />
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

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditPlayer(panelPlayer)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        Editar jugador
                      </button>
                      {confirmDeletePlayer ? (
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
                      )}
                    </div>
                  )}

                  <div className="border-t border-slate-100" />

                  {/* Reports section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-400" />
                        Informes
                        {panelReports.length > 0 && (
                          <span className="ml-1 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{panelReports.length}</span>
                        )}
                      </h3>
                    </div>

                    {/* Existing reports */}
                    <div className="space-y-3 mb-4">
                      {panelReports.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin informes todavía.</p>
                      ) : panelReports.map(r => (
                        <ReportCard
                          key={r.id}
                          report={r}
                          isAdmin={isAdmin}
                          confirmDeleteId={confirmDeleteReport}
                          onConfirmDelete={setConfirmDeleteReport}
                          onDelete={handleDeleteReport}
                        />
                      ))}
                    </div>

                    {/* Add report form */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                      <div className="text-xs font-semibold text-slate-600 mb-1">Añadir informe</div>
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
              )}
            </div>
          </div>
        </>
      )}

      {/* Global field styles */}
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
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

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

function ReportCard({
  report, isAdmin, confirmDeleteId, onConfirmDelete, onDelete,
}: {
  report: ScoutingReport
  isAdmin: boolean
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => Promise<void>
}) {
  const isConfirming = confirmDeleteId === report.id
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {report.titulo && (
            <div className="font-semibold text-slate-700 text-sm mb-0.5 truncate">{report.titulo}</div>
          )}
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {report.fecha ? new Date(report.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </div>
        </div>
        {isAdmin && (
          isConfirming ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onDelete(report.id)} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded font-medium">Eliminar</button>
              <button onClick={() => onConfirmDelete(null)} className="px-2 py-0.5 text-[10px] border border-slate-200 rounded text-slate-600">No</button>
            </div>
          ) : (
            <button
              onClick={() => onConfirmDelete(report.id)}
              className="text-slate-300 hover:text-red-500 flex-shrink-0 p-0.5"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )
        )}
      </div>
      {report.texto && (
        <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{report.texto}</p>
      )}
    </div>
  )
}
