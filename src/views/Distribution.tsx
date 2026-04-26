import React, { useState, useMemo } from 'react'
import {
  Plus, Search, Star, Building2, Users,
  ChevronRight, X, Check, Pencil, Trash2, LogOut,
  TrendingUp, AlertCircle, CircleDot, Flag, ChevronDown,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { Player, Club, ClubNeed, DistributionEntry, ClubNegotiation } from '../types'
import type { Profile } from '../contexts/AuthContext'

// ── constants ─────────────────────────────────────────────────

const CURRENT_SEASON = '2025-26'

// Canonical position list (Spanish labels used for needs)
const FOOTBALL_POSITIONS = [
  'Portero',
  'Central', 'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo',
  'Delantero', 'Delantero centro',
]

// Maps need position label → player position abbreviations used in player profiles
const POSITION_ABBRS: Record<string, string[]> = {
  'Portero':           ['GK', 'POR', 'Portero'],
  'Central':           ['CB', 'CT', 'DFC', 'Central'],
  'Lateral derecho':   ['RB', 'RWB', 'LD', 'Lateral derecho'],
  'Lateral izquierdo': ['LB', 'LWB', 'LI', 'Lateral izquierdo'],
  'Pivote':            ['DM', 'CDM', 'MCD', 'Pivote'],
  'Mediocentro':       ['CM', 'MC', 'Mediocentro'],
  'Mediapunta':        ['AM', 'CAM', 'MP', 'Mediapunta'],
  'Extremo derecho':   ['RW', 'RM', 'ED', 'Extremo derecho'],
  'Extremo izquierdo': ['LW', 'LM', 'EI', 'Extremo izquierdo'],
  'Delantero':         ['FW', 'ST', 'CF', 'AT', 'SS', 'Delantero', 'Delantero centro'],
  'Delantero centro':  ['ST', 'CF', 'FW', 'AT', 'Delantero centro', 'Delantero'],
}

function playerMatchesNeedPosition(playerPositions: string[], needPosition: string): boolean {
  const abbrs = POSITION_ABBRS[needPosition] ?? [needPosition]
  return playerPositions.some(p =>
    abbrs.some(a => p.toLowerCase() === a.toLowerCase() || p.toLowerCase().includes(needPosition.toLowerCase()))
  )
}
const CONDITIONS = ['Libre', 'Traspaso', 'Cesión', 'Cesión/Traspaso', 'Traspaso (porcentaje)', 'Cesión con opción']
const NEG_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado']

const STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
  ofrecido:    { label: 'Ofrecido',    color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  interesado:  { label: 'Interesado',  color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  negociando:  { label: 'Negociando',  color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  cerrado:     { label: 'Cerrado',     color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  descartado:  { label: 'Descartado',  color: 'bg-red-100 text-red-600',       dot: 'bg-red-400' },
}

const PRIORITY_CONFIG = {
  A: { label: 'A', bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    ring: 'ring-red-400' },
  B: { label: 'B', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  ring: 'ring-amber-400' },
  C: { label: 'C', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  ring: 'ring-slate-400' },
}

// ── helpers ───────────────────────────────────────────────────

function genId() { return 'tmp_' + Math.random().toString(36).slice(2) }
function now() { return new Date().toISOString() }


/** Short month+year: "jun 2025". Empty string if no date. */
function fmtMonth(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

/** Days from today to a date (negative = past) */
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.round((d.getTime() - Date.now()) / 86_400_000)
}

/** Contract urgency badge: color class + label */
function contractBadge(endDate?: string): { label: string; cls: string } | null {
  const days = daysUntil(endDate)
  if (days === null) return null
  const label = fmtMonth(endDate)
  if (days < 0)   return { label: 'Expirado', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days < 60)  return { label,             cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days < 180) return { label,             cls: 'bg-amber-100 text-amber-700 border-amber-200' }
  return             { label,                 cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}


function Avatar({ name, photo, size = 'sm' }: { name: string; photo?: string; size?: 'xs' | 'sm' | 'md' }) {
  const cls = size === 'xs' ? 'w-6 h-6 text-[10px]' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (photo) return <img src={photo} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── props ─────────────────────────────────────────────────────

interface Props {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  negotiations: ClubNegotiation[]
  currentProfile: Profile
  onBack: () => void          // go to Tareas
  onGoToJugadores?: () => void
  onLogout: () => void
  onAdmin?: () => void
  onSelectPlayer?: (id: string) => void
  onSelectClub?: (id: string) => void
  onCreateClub: (c: Omit<Club, 'id' | 'createdAt'>) => Promise<Club>
  onUpdateClub: (c: Club) => Promise<void>
  onDeleteClub: (id: string) => Promise<void>
  onCreateEntry: (e: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<DistributionEntry>
  onUpdateEntry: (e: DistributionEntry) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  onUpdateNegotiation: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation: (id: string) => Promise<void>
}

// ── main component ────────────────────────────────────────────

export function Distribution({
  players, clubs, entries, negotiations, currentProfile,
  onBack, onGoToJugadores, onLogout, onAdmin, onSelectPlayer, onSelectClub,
  onCreateClub, onUpdateClub, onDeleteClub,
  onCreateEntry, onUpdateEntry, onDeleteEntry,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
}: Props) {
  const [tab, setTab] = useState<'jugadores' | 'clubes' | 'solicitudes' | 'pipeline'>('jugadores')
  const season = CURRENT_SEASON
  const [search, setSearch] = useState('')

  // panel state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

  // modals
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showAddClub, setShowAddClub] = useState(false)
  const [showAddNeg, setShowAddNeg] = useState<{ playerId?: string; clubId?: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<DistributionEntry | null>(null)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [bulkAssignPlayerId, setBulkAssignPlayerId] = useState<string | null>(null)
  // when opening club panel from a solicitud, track which need position to filter offered players
  const [selectedNeedPosition, setSelectedNeedPosition] = useState<string | null>(null)
  // pipeline filters
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [pipelinePosFilter, setPipelinePosFilter] = useState<string>('')
  const [pipelineGestorFilter, setPipelineGestorFilter] = useState<string>('')
  const [showClosedDeals, setShowClosedDeals] = useState(false)

  // filters
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null)
  const [positionFilter, setPositionFilter] = useState('')   // solicitudes tab
  const [posFilters, setPosFilters] = useState<string[]>([])   // jugadores tab
  const [yearFilters, setYearFilters] = useState<string[]>([])
  const [activityFilter, setActivityFilter] = useState(false)
  const [showAddNeed, setShowAddNeed] = useState(false)

  const seasonEntries = entries.filter(e => e.season === season)

  const filteredEntries = useMemo(() => {
    let result = seasonEntries
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e => {
        const p = players.find(pl => pl.id === e.playerId)
        return p?.name.toLowerCase().includes(q)
      })
    }
    if (posFilters.length > 0) {
      result = result.filter(e => {
        const p = players.find(pl => pl.id === e.playerId)
        return p?.positions[0] && posFilters.includes(p.positions[0])
      })
    }
    if (yearFilters.length > 0) {
      result = result.filter(e => {
        const p = players.find(pl => pl.id === e.playerId)
        const y = p?.birthDate?.slice(0, 4) ?? ''
        return yearFilters.includes(y)
      })
    }
    if (activityFilter) {
      result = result.filter(e =>
        negotiations.some(n => n.playerId === e.playerId && n.status !== 'descartado')
      )
    }
    return result
  }, [seasonEntries, search, players, posFilters, yearFilters, activityFilter, negotiations])

  const distributionPositions = useMemo(() => {
    const pos = new Set<string>()
    seasonEntries.forEach(e => {
      const p = players.find(pl => pl.id === e.playerId)
      if (p?.positions[0]) pos.add(p.positions[0])
    })
    return Array.from(pos).sort()
  }, [seasonEntries, players])

  const distributionYears = useMemo(() => {
    const years = new Set<string>()
    seasonEntries.forEach(e => {
      const p = players.find(pl => pl.id === e.playerId)
      const y = p?.birthDate?.slice(0, 4)
      if (y) years.add(y)
    })
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [seasonEntries, players])

  const filteredClubs = useMemo(() => {
    let result = clubs
    if (leagueFilter) result = result.filter(c => (c.league ?? 'Sin liga') === leagueFilter)
    if (!search) return result
    const q = search.toLowerCase()
    return result.filter(c => c.name.toLowerCase().includes(q) || c.league?.toLowerCase().includes(q))
  }, [clubs, search, leagueFilter])

  const sortedLeagues = useMemo(() => {
    const map = new Map<string, number>()
    clubs.forEach(c => {
      const key = c.league ?? 'Sin liga'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [clubs])

  const allNeedsPositions = useMemo(() => {
    const positions = new Set<string>()
    clubs.forEach(c => c.needs.forEach(n => positions.add(n.position)))
    return Array.from(positions).sort()
  }, [clubs])

  const clubNeeds = useMemo(() => {
    const results: Array<{ club: Club; need: ClubNeed }> = []
    clubs.forEach(club => club.needs.forEach(need => results.push({ club, need })))
    const pf = positionFilter.toLowerCase()
    const q = search.toLowerCase()
    return results.filter(r =>
      (!pf || r.need.position.toLowerCase().includes(pf)) &&
      (!q || r.club.name.toLowerCase().includes(q) || r.club.league?.toLowerCase().includes(q) || r.need.position.toLowerCase().includes(q))
    )
  }, [clubs, positionFilter, search])

  const selectedEntry = seasonEntries.find(e => e.id === selectedEntryId) ?? null
  const selectedClub = clubs.find(c => c.id === selectedClubId) ?? null

  function closePanel() { setSelectedEntryId(null); setSelectedClubId(null) }
  const hasPanel = !!selectedEntry || !!selectedClub

  function switchTab(t: typeof tab) {
    setTab(t)
    closePanel()
    setLeagueFilter(null)
    setPositionFilter('')
    setPosFilters([])
    setYearFilters([])
    setActivityFilter(false)
    setSearch('')
  }

  // group entries by priority
  const byPriority = useMemo(() => ({
    A: filteredEntries.filter(e => e.priority === 'A'),
    B: filteredEntries.filter(e => e.priority === 'B'),
    C: filteredEntries.filter(e => e.priority === 'C'),
  }), [filteredEntries])


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 flex-shrink-0">
        {/* Top bar */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-11 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-white flex-shrink-0">
              <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
            </div>
            <span className="hidden sm:block font-black text-sm tracking-tight text-slate-900 uppercase">All Iron Sports</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{CURRENT_SEASON}</span>
            {currentProfile.is_admin && onAdmin && (
              <button onClick={onAdmin} className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-600 transition-colors text-xs hidden sm:block">Admin</button>
            )}
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab nav matching Dashboard */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100">
          {([
            { id: 'tareas',       label: 'Tareas',       icon: null,                                    onClick: onBack },
            { id: 'jugadores',    label: 'Jugadores',    icon: null,                                    onClick: onGoToJugadores ?? onBack },
            { id: 'distribucion', label: 'Distribución', icon: <TrendingUp className="w-3.5 h-3.5" />, onClick: undefined },
          ] as { id: string; label: string; icon: React.ReactNode; onClick: (() => void) | undefined }[]).map(tab => (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab.id === 'distribucion'
                  ? 'border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-1 overflow-x-auto">
        {(['jugadores', 'clubes', 'solicitudes', 'pipeline'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-[hsl(220,72%,36%)] text-[hsl(220,72%,36%)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'jugadores' ? `Jugadores (${seasonEntries.length})` :
             t === 'clubes' ? `Clubes (${clubs.length})` :
             t === 'solicitudes' ? `Solicitudes${clubNeeds.length > 0 ? ` (${clubNeeds.length})` : ''}` :
             'Pipeline'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {tab !== 'pipeline' && (
        <div className="px-4 py-2 bg-white border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={
                tab === 'jugadores' ? 'Buscar jugador…' :
                tab === 'clubes' ? 'Buscar club…' :
                'Buscar solicitud…'
              }
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 ${hasPanel ? 'hidden sm:block' : ''}`}>

          {/* ── JUGADORES TAB ── */}
          {tab === 'jugadores' && (
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <MultiSelect
                    label="Posición"
                    options={distributionPositions}
                    selected={posFilters}
                    onChange={setPosFilters}
                  />
                  <MultiSelect
                    label="Año nacimiento"
                    options={distributionYears}
                    selected={yearFilters}
                    onChange={setYearFilters}
                  />
                  <button
                    onClick={() => setActivityFilter(!activityFilter)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activityFilter
                        ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Con actividad
                  </button>
                  {(posFilters.length > 0 || yearFilters.length > 0 || activityFilter) && (
                    <button
                      onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false) }}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
                    >
                      <X className="w-3 h-3" /> Limpiar
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowAddPlayer(true)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir jugador
                </button>
              </div>

              <div className="space-y-3">
                {(['A', 'B', 'C'] as const).map(pr => {
                  const group = byPriority[pr]
                  if (group.length === 0) return null
                  const cfg = PRIORITY_CONFIG[pr]
                  return (
                    <div key={pr}>
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2 ${cfg.bg} ${cfg.text}`}>
                        <Flag className="w-3 h-3" /> Prioridad {pr} — {group.length} jugador{group.length !== 1 ? 'es' : ''}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                        {group.map(entry => {
                          const player = players.find(p => p.id === entry.playerId)
                          if (!player) return null
                          const negCount = negotiations.filter(n => n.playerId === entry.playerId).length
                          const activeNegs = negotiations.filter(n => n.playerId === entry.playerId && !['descartado'].includes(n.status))
                          const topStatus = activeNegs.find(n => n.status === 'negociando')?.status
                            ?? activeNegs.find(n => n.status === 'interesado')?.status
                            ?? activeNegs.find(n => n.status === 'ofrecido')?.status
                            ?? activeNegs.find(n => n.status === 'cerrado')?.status

                          return (
                            <div
                              key={entry.id}
                              onClick={() => { setSelectedEntryId(entry.id); setSelectedClubId(null) }}
                              className={`bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5 px-3 py-2 ${
                                selectedEntryId === entry.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'
                              }`}
                            >
                              <Avatar name={player.name} photo={player.photo} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-slate-800 text-sm truncate">{player.name}</span>
                                  <span className="text-xs text-slate-400 flex-shrink-0">{player.positions[0]}</span>
                                  {player.hiddenFromManagement && (
                                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Intermediar</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {entry.condition && (
                                    <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{entry.condition}</span>
                                  )}
                                  {(() => {
                                    const badge = contractBadge(player.clubContract?.endDate)
                                    return badge ? (
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                                        {badge.label}
                                      </span>
                                    ) : null
                                  })()}
                                  {topStatus && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_CONFIG[topStatus].color}`}>
                                      {STATUS_CONFIG[topStatus].label}
                                    </span>
                                  )}
                                  {negCount > 0 && (
                                    <span className="text-xs text-slate-400">{negCount} club{negCount !== 1 ? 's' : ''}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {filteredEntries.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {search ? 'Sin resultados' : 'No hay jugadores en distribución para esta temporada'}
                </div>
              )}
            </div>
          )}

          {/* ── CLUBES TAB ── */}
          {tab === 'clubes' && (
            <div className="max-w-5xl mx-auto">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowAddClub(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir club
                </button>
              </div>

              {/* League filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
                <button
                  onClick={() => setLeagueFilter(null)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    leagueFilter === null
                      ? 'bg-[hsl(220,72%,36%)] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas ({clubs.length})
                </button>
                {sortedLeagues.map(([league, count]) => (
                  <button
                    key={league}
                    onClick={() => setLeagueFilter(leagueFilter === league ? null : league)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      leagueFilter === league
                        ? 'bg-[hsl(220,72%,36%)] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {league} ({count})
                  </button>
                ))}
              </div>

              {/* Clubs grid — grouped by league when no filter, flat when filtered */}
              {leagueFilter ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {filteredClubs.map(club => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      negotiations={negotiations}
                      isSelected={selectedClubId === club.id}
                      onClick={() => {
                        if (onSelectClub) { onSelectClub(club.id) }
                        else { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(null) }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedLeagues.map(([league]) => {
                    const leagueClubs = filteredClubs.filter(c => (c.league ?? 'Sin liga') === league)
                    if (leagueClubs.length === 0) return null
                    return (
                      <div key={league}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{league}</span>
                          <span className="text-xs text-slate-400">({leagueClubs.length})</span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                          {leagueClubs.map(club => (
                            <ClubCard
                              key={club.id}
                              club={club}
                              negotiations={negotiations}
                              isSelected={selectedClubId === club.id}
                              onClick={() => {
                                if (onSelectClub) { onSelectClub(club.id) }
                                else { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(null) }
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {filteredClubs.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {search || leagueFilter ? 'Sin resultados' : 'No hay clubes. Añade uno.'}
                </div>
              )}
            </div>
          )}

          {/* ── SOLICITUDES TAB ── */}
          {tab === 'solicitudes' && (
            <div className="max-w-5xl mx-auto">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowAddNeed(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir solicitud
                </button>
              </div>
              {/* Position filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
                <button
                  onClick={() => setPositionFilter('')}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !positionFilter
                      ? 'bg-[hsl(220,72%,36%)] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas las posiciones
                </button>
                {allNeedsPositions.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPositionFilter(positionFilter === pos ? '' : pos)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      positionFilter === pos
                        ? 'bg-[hsl(220,72%,36%)] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              {clubNeeds.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {clubs.every(c => c.needs.length === 0)
                    ? 'Ningún club tiene solicitudes registradas aún'
                    : 'Sin resultados para este filtro'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {clubNeeds.map(({ club, need }, i) => (
                    <div
                      key={`${club.id}-${i}`}
                      className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex items-start gap-2.5 hover:shadow-sm transition-all"
                    >
                      <div
                        className="flex-shrink-0 mt-0.5 cursor-pointer"
                        onClick={() => { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(need.position); }}
                      >
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          {need.position}
                        </span>
                      </div>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(need.position); }}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800 text-sm truncate">{club.name}</span>
                          {club.league && <span className="text-xs text-slate-400">{club.league}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {need.ageMax && <span>Sub-{need.ageMax}</span>}
                          {need.transferBudget && <span>· {need.transferBudget}</span>}
                          {need.salaryBudget && <span>· {need.salaryBudget}/mes</span>}
                          {need.notes && <span className="text-slate-400 truncate">· {need.notes}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowAddNeg({ clubId: club.id })}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-1.5 py-1 rounded hover:bg-blue-50 transition-colors"
                        title="Ofrecer jugador a esta solicitud"
                      >
                        <Plus className="w-3 h-3" /> Ofrecer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE TAB: global CRM kanban ── */}
          {tab === 'pipeline' && (() => {
            // Collect all gestores for filter dropdown
            const allGestores = Array.from(new Set(
              negotiations.map(n => n.aisManager).filter(Boolean)
            )).sort() as string[]

            // All positions from distribution players
            const distPlayerIds = new Set(entries.map(e => e.playerId))
            const allPositions = Array.from(new Set(
              players.filter(p => distPlayerIds.has(p.id)).flatMap(p => p.positions)
            )).sort()

            // Build enriched deals, applying filters
            const deals = negotiations
              .map(neg => {
                const player = players.find(p => p.id === neg.playerId)
                const club = clubs.find(c => c.id === neg.clubId)
                const entry = entries.find(e => e.playerId === neg.playerId)
                return { neg, player, club, entry }
              })
              .filter(({ player, club, neg }) => {
                if (!player || !club) return false
                if (!distPlayerIds.has(player.id)) return false
                if (pipelineSearch && !player.name.toLowerCase().includes(pipelineSearch.toLowerCase())) return false
                if (pipelinePosFilter && !player.positions.some(p => p === pipelinePosFilter)) return false
                if (pipelineGestorFilter && neg.aisManager !== pipelineGestorFilter) return false
                return true
              })

            const activeStatuses: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
            const closedStatuses: ClubNegotiation['status'][] = ['cerrado', 'descartado']
            const visibleStatuses = showClosedDeals ? [...activeStatuses, ...closedStatuses] : activeStatuses

            const totalActive = deals.filter(d => activeStatuses.includes(d.neg.status)).length
            const totalClosed = deals.filter(d => closedStatuses.includes(d.neg.status)).length

            return (
              <div className="-mx-4 -mb-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap px-4 py-3 bg-white border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={pipelineSearch}
                      onChange={e => setPipelineSearch(e.target.value)}
                      placeholder="Jugador…"
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 w-36"
                    />
                  </div>
                  <select
                    value={pipelinePosFilter}
                    onChange={e => setPipelinePosFilter(e.target.value)}
                    className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                  >
                    <option value="">Todas las posiciones</option>
                    {allPositions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {allGestores.length > 0 && (
                    <select
                      value={pipelineGestorFilter}
                      onChange={e => setPipelineGestorFilter(e.target.value)}
                      className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                    >
                      <option value="">Todos los gestores</option>
                      {allGestores.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-slate-400">{totalActive} activos · {totalClosed} cerrados</span>
                    <button
                      onClick={() => setShowClosedDeals(v => !v)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                        showClosedDeals
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {showClosedDeals ? 'Ocultar cerrados' : 'Ver cerrados'}
                    </button>
                  </div>
                </div>

                {/* Kanban board */}
                <div className="overflow-x-auto">
                  <div className="flex gap-3 p-4 min-w-max">
                    {visibleStatuses.map(status => {
                      const col = deals.filter(d => d.neg.status === status)
                      const cfg = STATUS_CONFIG[status]
                      return (
                        <div key={status} className="w-60 flex-shrink-0">
                          {/* Column header */}
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${cfg.color}`}>
                            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            <span className="text-xs font-semibold">{cfg.label}</span>
                            <span className="ml-auto text-xs opacity-60 font-mono">{col.length}</span>
                          </div>
                          {/* Cards */}
                          <div className="space-y-2">
                            {col.map(({ neg, player, club, entry }) => {
                              if (!player || !club) return null
                              const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                              return (
                                <div
                                  key={neg.id}
                                  onClick={() => setEditingNeg(neg)}
                                  className="bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
                                >
                                  {/* Player row */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <Avatar name={player.name} photo={player.photo} size="xs" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-semibold text-slate-800 truncate">{player.name}</div>
                                      <div className="text-[10px] text-slate-400">{player.positions[0]}</div>
                                    </div>
                                    {pcfg && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>
                                        {entry?.priority}
                                      </span>
                                    )}
                                  </div>
                                  {/* Club row */}
                                  <div className="border-t border-slate-100 pt-2">
                                    <div className="text-sm font-medium text-slate-700 truncate">{club.name}</div>
                                    {club.league && <div className="text-xs text-slate-400">{club.league}</div>}
                                  </div>
                                  {/* Meta */}
                                  {(neg.aisManager || neg.notes) && (
                                    <div className="mt-2 space-y-0.5">
                                      {neg.aisManager && (
                                        <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded inline-block">
                                          {neg.aisManager}
                                        </span>
                                      )}
                                      {neg.notes && (
                                        <p className="text-[10px] text-slate-400 line-clamp-2">{neg.notes}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {col.length === 0 && (
                              <div className="h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                                Vacío
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── SIDE PANEL ── */}
        {hasPanel && (
          <div className="w-full sm:w-[380px] flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto fixed sm:static inset-0 sm:inset-auto z-30">
            {selectedEntry && (() => {
              const player = players.find(p => p.id === selectedEntry.playerId)!
              const playerNegs = negotiations.filter(n => n.playerId === selectedEntry.playerId)
              const cfg = PRIORITY_CONFIG[selectedEntry.priority]
              return (
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <Avatar name={player.name} photo={player.photo} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{player.name}</div>
                      <div className="text-xs text-slate-500">{player.positions[0]}</div>
                    </div>
                    <button
                      onClick={() => onSelectPlayer?.(player.id)}
                      className="text-xs text-blue-600 hover:underline flex-shrink-0"
                    >
                      Ver ficha
                    </button>
                  </div>

                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                        Prioridad {selectedEntry.priority}
                      </span>
                      {selectedEntry.condition && (
                        <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                          {selectedEntry.condition}
                        </span>
                      )}
                      {selectedEntry.transferFee && (
                        <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded-full">
                          {selectedEntry.transferFee}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingEntry(selectedEntry)}
                        className="ml-auto p-1 text-slate-400 hover:text-slate-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {selectedEntry.notes && (
                      <p className="text-xs text-slate-500 mt-2">{selectedEntry.notes}</p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clubes ({playerNegs.length})</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBulkAssignPlayerId(selectedEntry.playerId)}
                          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium"
                          title="Asignar por liga"
                        >
                          <Users className="w-3.5 h-3.5" /> Por liga
                        </button>
                        <button
                          onClick={() => setShowAddNeg({ playerId: selectedEntry.playerId })}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" /> Añadir
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {playerNegs.map(neg => {
                        const club = clubs.find(c => c.id === neg.clubId)
                        if (!club) return null
                        const scfg = STATUS_CONFIG[neg.status]
                        return (
                          <div key={neg.id} className="bg-slate-50 rounded-lg p-3 flex items-start gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-slate-700">{club.name}</span>
                                {club.league && <span className="text-xs text-slate-400">{club.league}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                                {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                              </div>
                              {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                            </div>
                            <button
                              onClick={() => setEditingNeg(neg)}
                              className="ml-auto p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                      {playerNegs.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          Aún no se ha ofrecido a ningún club
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm('¿Quitar este jugador de distribución?')) return
                        await onDeleteEntry(selectedEntry.id)
                        closePanel()
                      }}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar de distribución
                    </button>
                  </div>
                </div>
              )
            })()}

            {selectedClub && (() => {
              const clubNegsPanel = negotiations.filter(n => n.clubId === selectedClub.id)
              // when opened from a solicitud, filter offered players to matching position
              const displayedNegs = selectedNeedPosition
                ? clubNegsPanel.filter(neg => {
                    const p = players.find(pl => pl.id === neg.playerId)
                    return p && playerMatchesNeedPosition(p.positions, selectedNeedPosition)
                  })
                : clubNegsPanel
              return (
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{selectedClub.name}</div>
                      <div className="text-xs text-slate-500">{selectedClub.league}</div>
                    </div>
                    <button onClick={() => setEditingClub(selectedClub)} className="p-1 text-slate-400 hover:text-slate-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-1.5">
                    {selectedClub.contactPerson && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-600">{selectedClub.contactPerson}</span>
                        <span className="text-xs text-slate-400">contacto del club</span>
                      </div>
                    )}
                    {selectedClub.aisManager && (
                      <div className="flex items-center gap-2 text-sm">
                        <CircleDot className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700">{selectedClub.aisManager}</span>
                        <span className="text-xs text-slate-400">gestor AIS</span>
                      </div>
                    )}
                    {selectedClub.isPriority && (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <Star className="w-3.5 h-3.5 fill-green-500" /> Club prioritario
                      </div>
                    )}
                    {selectedClub.notes && (
                      <p className="text-xs text-slate-500 mt-1">{selectedClub.notes}</p>
                    )}
                  </div>

                  {selectedClub.needs.length > 0 && (
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Necesidades</div>
                      <div className="space-y-1">
                        {selectedClub.needs.map((need, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                            <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            <span className="font-medium">{need.position}</span>
                            {need.ageMax && <span>· sub-{need.ageMax}</span>}
                            {need.transferBudget && <span>· {need.transferBudget}</span>}
                            {need.notes && <span className="text-slate-400">· {need.notes}</span>}
                            <button
                              className="ml-auto p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0"
                              title="Eliminar solicitud"
                              onClick={async () => {
                                await onUpdateClub({ ...selectedClub, needs: selectedClub.needs.filter((_, idx) => idx !== i) })
                              }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Ofrecidos ({displayedNegs.length}{selectedNeedPosition && displayedNegs.length !== clubNegsPanel.length ? `/${clubNegsPanel.length}` : ''})
                        </span>
                        {selectedNeedPosition && (
                          <button
                            onClick={() => setSelectedNeedPosition(null)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                          >
                            {selectedNeedPosition} <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setShowAddNeg({ clubId: selectedClub.id })}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ofrecer jugador
                      </button>
                    </div>
                    <div className="space-y-2">
                      {displayedNegs.map(neg => {
                        const player = players.find(p => p.id === neg.playerId)
                        const entry = entries.find(e => e.playerId === neg.playerId)
                        if (!player) return null
                        const scfg = STATUS_CONFIG[neg.status]
                        const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                        return (
                          <div key={neg.id} className="bg-slate-50 rounded-lg p-3 flex items-start gap-3">
                            <Avatar name={player.name} photo={player.photo} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-700">{player.name}</span>
                                {pcfg && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                                {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                              </div>
                              {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                            </div>
                            <button
                              onClick={() => setEditingNeg(neg)}
                              className="p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                      {displayedNegs.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          {selectedNeedPosition && clubNegsPanel.length > 0
                            ? `Sin jugadores de posición "${selectedNeedPosition}" ofrecidos`
                            : 'Sin jugadores ofrecidos aún'}
                        </div>
                      )}
                    </div>
                  </div>

                  {currentProfile.is_admin && (
                    <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                      <button
                        onClick={async () => {
                          if (!confirm('¿Eliminar este club?')) return
                          await onDeleteClub(selectedClub.id)
                          closePanel()
                        }}
                        className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar club
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {showAddPlayer && (
        <AddPlayerModal
          players={players}
          existingPlayerIds={seasonEntries.map(e => e.playerId)}
          season={season}
          onClose={() => setShowAddPlayer(false)}
          onSave={async (data) => {
            const saved = await onCreateEntry(data)
            setSelectedEntryId(saved.id)
            setShowAddPlayer(false)
          }}
        />
      )}

      {showAddClub && (
        <AddClubModal
          onClose={() => setShowAddClub(false)}
          onSave={async (data) => {
            const saved = await onCreateClub(data)
            setSelectedClubId(saved.id)
            setShowAddClub(false)
          }}
        />
      )}

      {showAddNeg && (
        <AddNegotiationModal
          players={players}
          clubs={clubs}
          entries={entries}
          fixedPlayerId={showAddNeg.playerId}
          fixedClubId={showAddNeg.clubId}
          onClose={() => setShowAddNeg(null)}
          onSave={async (data) => {
            await onCreateNegotiation(data)
            setShowAddNeg(null)
          }}
        />
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (data) => {
            await onUpdateEntry({ ...editingEntry, ...data })
            setEditingEntry(null)
          }}
        />
      )}

      {editingClub && (
        <EditClubModal
          club={editingClub}
          onClose={() => setEditingClub(null)}
          onSave={async (data) => {
            await onUpdateClub({ ...editingClub, ...data })
            setEditingClub(null)
          }}
        />
      )}

      {editingNeg && (
        <EditNegotiationModal
          neg={editingNeg}
          clubs={clubs}
          players={players}
          onClose={() => setEditingNeg(null)}
          onSave={async (data) => {
            await onUpdateNegotiation({ ...editingNeg, ...data })
            setEditingNeg(null)
          }}
          onDelete={async () => {
            await onDeleteNegotiation(editingNeg.id)
            setEditingNeg(null)
          }}
        />
      )}

      {showAddNeed && (
        <AddNeedModal
          clubs={clubs}
          onClose={() => setShowAddNeed(false)}
          onSave={async (clubId, need) => {
            const club = clubs.find(c => c.id === clubId)
            if (!club) return
            await onUpdateClub({ ...club, needs: [...club.needs, need] })
            setShowAddNeed(false)
          }}
        />
      )}

      {bulkAssignPlayerId && (
        <BulkAssignModal
          clubs={clubs}
          existingNegotiations={negotiations.filter(n => n.playerId === bulkAssignPlayerId)}
          onClose={() => setBulkAssignPlayerId(null)}
          onSave={async (clubIds) => {
            await Promise.all(
              clubIds.map(clubId => onCreateNegotiation({ playerId: bulkAssignPlayerId, clubId, status: 'pendiente' }))
            )
            setBulkAssignPlayerId(null)
          }}
        />
      )}
    </div>
  )
}

// ── CLUB CARD ────────────────────────────────────────────────

function ClubCard({ club, negotiations, isSelected, onClick }: {
  club: Club
  negotiations: ClubNegotiation[]
  isSelected: boolean
  onClick: () => void
}) {
  const activeNegs = negotiations.filter(n => n.clubId === club.id && n.status !== 'descartado')
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5 px-3 py-2 ${
        isSelected ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'
      } ${club.isPriority ? 'border-l-4 border-l-green-400' : ''}`}
    >
      <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Building2 className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-slate-800 text-sm truncate">{club.name}</span>
          {club.isPriority && <Star className="w-3 h-3 text-green-500 fill-green-500 flex-shrink-0" />}
          {club.needs.length > 0 && (
            <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {club.needs.length} nec.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
          {club.contactPerson && <span className="truncate">{club.contactPerson}</span>}
          {activeNegs.length > 0 && (
            <span className="text-blue-600 flex-shrink-0">{activeNegs.length} ofrecido{activeNegs.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </div>
  )
}

// ── ADD PLAYER MODAL ──────────────────────────────────────────

function AddPlayerModal({ players, existingPlayerIds, season, onClose, onSave }: {
  players: Player[]
  existingPlayerIds: string[]
  season: string
  onClose: () => void
  onSave: (data: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('B')
  const [condition, setCondition] = useState('')
  const [transferFee, setTransferFee] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const available = players.filter(p =>
    !existingPlayerIds.includes(p.id) &&
    (p.name.toLowerCase().includes(query.toLowerCase()))
  )

  async function handleSave() {
    if (!selected) return
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
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir jugador a distribución" onClose={onClose}>
      {!selected ? (
        <div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar jugador…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-2"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {available.slice(0, 20).map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left"
              >
                <Avatar name={p.name} photo={p.photo} />
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.positions[0]}</div>
                </div>
              </button>
            ))}
            {available.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-4">Sin resultados</div>
            )}
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
            <button onClick={() => setSelected(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Prioridad</label>
            <div className="flex gap-2">
              {(['A', 'B', 'C'] as const).map(p => {
                const cfg = PRIORITY_CONFIG[p]
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${
                      priority === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >{p}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Condición de salida</label>
            <select
              value={condition}
              onChange={e => setCondition(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Sin especificar</option>
              {CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Importe</label>
              <input
                value={transferFee}
                onChange={e => setTransferFee(e.target.value)}
                placeholder="Ej: 400k, 2M…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Añadir a distribución'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ── ADD CLUB MODAL ────────────────────────────────────────────

function AddClubModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: Omit<Club, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [league, setLeague] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [aisManager, setAisManager] = useState('')
  const [notes, setNotes] = useState('')
  const [isPriority, setIsPriority] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), league: league || undefined, country: 'Spain', contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority, needs: [] })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre *</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Deportivo, Racing…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input value={league} onChange={e => setLeague(e.target.value)} placeholder="La Liga, La Liga 2, Primera RFEF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Nombre del contacto" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
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
        <button onClick={handleSave} disabled={!name.trim() || saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Añadir club'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── ADD NEGOTIATION MODAL ─────────────────────────────────────

function AddNegotiationModal({ players, clubs, entries, fixedPlayerId, fixedClubId, onClose, onSave }: {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  fixedPlayerId?: string
  fixedClubId?: string
  onClose: () => void
  onSave: (data: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const distributionPlayerIds = entries.map(e => e.playerId)
  const [playerId, setPlayerId] = useState(fixedPlayerId ?? '')
  const [clubId, setClubId] = useState(fixedClubId ?? '')
  const [status, setStatus] = useState<ClubNegotiation['status']>('ofrecido')
  const [aisManager, setAisManager] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectablePlayers = players.filter(p => distributionPlayerIds.includes(p.id))

  async function handleSave() {
    if (!playerId || !clubId) return
    setSaving(true)
    try {
      await onSave({ playerId, clubId, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir negociación" onClose={onClose}>
      <div className="space-y-3">
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
            <select value={clubId} onChange={e => setClubId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Seleccionar club…</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}{c.league ? ` (${c.league})` : ''}</option>)}
            </select>
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
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF, LT…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="El club está interesado…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <button onClick={handleSave} disabled={!playerId || !clubId || saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT ENTRY MODAL ──────────────────────────────────────────

function EditEntryModal({ entry, onClose, onSave }: {
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
            {(['A', 'B', 'C'] as const).map(p => {
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
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT CLUB MODAL ───────────────────────────────────────────

function EditClubModal({ club, onClose, onSave }: {
  club: Club
  onClose: () => void
  onSave: (data: Partial<Club>) => Promise<void>
}) {
  const [name, setName] = useState(club.name)
  const [league, setLeague] = useState(club.league ?? '')
  const [contactPerson, setContactPerson] = useState(club.contactPerson ?? '')
  const [aisManager, setAisManager] = useState(club.aisManager ?? '')
  const [notes, setNotes] = useState(club.notes ?? '')
  const [isPriority, setIsPriority] = useState(club.isPriority)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ name, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input value={league} onChange={e => setLeague(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <input value={aisManager} onChange={e => setAisManager(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
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
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT NEGOTIATION MODAL ────────────────────────────────────

function EditNegotiationModal({ neg, clubs, players, onClose, onSave, onDelete }: {
  neg: ClubNegotiation
  clubs: Club[]
  players: Player[]
  onClose: () => void
  onSave: (data: Partial<ClubNegotiation>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [status, setStatus] = useState(neg.status)
  const [aisManager, setAisManager] = useState(neg.aisManager ?? '')
  const [notes, setNotes] = useState(neg.notes ?? '')
  const [saving, setSaving] = useState(false)
  const player = players.find(p => p.id === neg.playerId)
  const club = clubs.find(c => c.id === neg.clubId)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ status, aisManager: aisManager || undefined, notes: notes || undefined }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar negociación" onClose={onClose}>
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
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { if (!confirm('¿Eliminar esta negociación?')) return; await onDelete() }}
            className="flex-1 py-2 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50"
          >
            Eliminar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
            {saving ? '…' : <span className="flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Guardar</span>}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── MODAL SHELL ───────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl sm:rounded-t-2xl">
          <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ── BULK ASSIGN MODAL ─────────────────────────────────────────
// Accordion-style: shows all leagues with select-all checkbox per league.
// Multiple leagues can be expanded and selected simultaneously.

function BulkAssignModal({ clubs, existingNegotiations, onClose, onSave }: {
  clubs: Club[]
  existingNegotiations: ClubNegotiation[]
  onClose: () => void
  onSave: (clubIds: string[]) => Promise<void>
}) {
  const leagues = useMemo(() => {
    const map = new Map<string, Club[]>()
    clubs.forEach(c => {
      const key = c.league ?? 'Sin liga'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [clubs])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const existingIds = new Set(existingNegotiations.map(n => n.clubId))
  const newIds = Array.from(selected).filter(id => !existingIds.has(id))

  function toggleExpand(league: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(league)) next.delete(league); else next.add(league)
      return next
    })
  }

  function getLeagueState(league: string): 'all' | 'partial' | 'none' {
    const available = (leagues.find(([l]) => l === league)?.[1] ?? []).filter(c => !existingIds.has(c.id))
    if (available.length === 0) return 'all'
    const count = available.filter(c => selected.has(c.id)).length
    if (count === 0) return 'none'
    if (count === available.length) return 'all'
    return 'partial'
  }

  function toggleLeague(league: string) {
    const available = (leagues.find(([l]) => l === league)?.[1] ?? [])
      .filter(c => !existingIds.has(c.id))
      .map(c => c.id)
    const state = getLeagueState(league)
    setSelected(prev => {
      const next = new Set(prev)
      if (state === 'all') {
        available.forEach(id => next.delete(id))
      } else {
        available.forEach(id => next.add(id))
      }
      return next
    })
  }

  function toggleClub(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (newIds.length === 0) return
    setSaving(true)
    try { await onSave(newIds) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 text-sm flex-1">Asignar por liga</h2>
          {newIds.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
              {newIds.length} seleccionado{newIds.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 flex-shrink-0">
          Marca ligas enteras o clubes individuales. Se crearán como <span className="font-semibold text-purple-700">Pendiente</span>.
        </p>

        {/* Leagues accordion */}
        <div className="overflow-y-auto flex-1">
          {leagues.map(([league, leagueClubs]) => {
            const isExpanded = expanded.has(league)
            const state = getLeagueState(league)
            const available = leagueClubs.filter(c => !existingIds.has(c.id))
            const allAlreadyAssigned = available.length === 0

            return (
              <div key={league} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center px-4 py-2.5 gap-3 hover:bg-slate-50">
                  {/* League-level checkbox */}
                  <input
                    type="checkbox"
                    checked={state !== 'none'}
                    disabled={allAlreadyAssigned}
                    ref={el => { if (el) el.indeterminate = state === 'partial' }}
                    onChange={() => toggleLeague(league)}
                    className="w-4 h-4 rounded text-purple-600 cursor-pointer flex-shrink-0"
                  />
                  {/* League name — click to expand */}
                  <button
                    onClick={() => toggleExpand(league)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="font-medium text-slate-800 text-sm truncate">{league}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{leagueClubs.length}</span>
                    {state === 'all' && !allAlreadyAssigned && (
                      <span className="text-xs text-purple-600 font-medium flex-shrink-0">✓ todos</span>
                    )}
                    {allAlreadyAssigned && (
                      <span className="text-xs text-green-600 flex-shrink-0">ya asignados</span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-auto flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-2 space-y-1 bg-slate-50">
                    {leagueClubs.map(club => {
                      const alreadyExists = existingIds.has(club.id)
                      const isSelected = selected.has(club.id)
                      return (
                        <label
                          key={club.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            alreadyExists
                              ? 'border-green-200 bg-green-50 cursor-not-allowed opacity-60'
                              : isSelected
                                ? 'border-purple-300 bg-purple-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || alreadyExists}
                            disabled={alreadyExists}
                            onChange={() => !alreadyExists && toggleClub(club.id)}
                            className="w-4 h-4 rounded text-purple-600"
                          />
                          <span className="flex-1 text-sm text-slate-800 truncate">{club.name}</span>
                          {club.aisManager && (
                            <span className="text-xs font-mono text-slate-400 flex-shrink-0">{club.aisManager}</span>
                          )}
                          {alreadyExists && <span className="text-xs text-green-600 flex-shrink-0">asignado</span>}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={newIds.length === 0 || saving}
            className="flex-1 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Asignando…' : `Asignar ${newIds.length} club${newIds.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MULTI-SELECT DROPDOWN ─────────────────────────────────────

function MultiSelect({ label, options, selected, onChange }: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const isActive = selected.length > 0

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val])
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm rounded-lg border transition-colors ${
          isActive
            ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <span>{label}{isActive ? ` (${selected.length})` : ''}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1 max-h-60 overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── ADD NEED MODAL ────────────────────────────────────────────

function AddNeedModal({ clubs, onClose, onSave }: {
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
              <button onClick={() => setClubId('')} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Posición *</label>
              <div className="flex flex-wrap gap-1.5">
                {FOOTBALL_POSITIONS.map(pos => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPosition(pos)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      position === pos
                        ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800'
                    }`}
                  >
                    {pos}
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
              className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Añadir solicitud'}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// suppress unused import warnings
void genId
void now
