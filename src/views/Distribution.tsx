import React, { useState, useMemo, useEffect } from 'react'
import {
  Plus, Search, Star, Building2, Users,
  ChevronRight, X, Check, Pencil, Trash2, LogOut,
  TrendingUp, AlertCircle, CircleDot, Flag, ChevronDown,
  Eye, List, LayoutGrid, SlidersHorizontal, Maximize2, Minimize2,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { Player, Club, ClubNeed, DistributionEntry, ClubNegotiation, ClubNegotiationUpdate } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { ConfirmModal } from '../components/ConfirmModal'
import { ManagerSelect } from '../components/ManagerSelect'
import { EmptyState } from '../components/EmptyState'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isValidName, isValidDate } from '../lib/validate'
import { POSITIONS, POSITION_CODES, positionLabel, positionEs, needMatchesPlayer, normalizePosition } from '../lib/positions'

/** Spinner pequeño para botones de guardado */
function BtnSpinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" />
}

// ── constants ─────────────────────────────────────────────────

const CURRENT_SEASON = '2025-26'

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
  D: { label: 'D', bg: 'bg-orange-50',  text: 'text-orange-600', border: 'border-orange-200', ring: 'ring-orange-300' },
}

// ── League / Club metadata ─────────────────────────────────────

export type LeagueTier = 'A' | 'B' | 'C' | 'D'
export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'AFC' | 'CAF'

const TIER_CONFIG: Record<LeagueTier, { label: string; bg: string; text: string; border: string; title: string }> = {
  A: { label: 'A', bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200', title: 'Elite (Top 5 EU + equivalentes)' },
  B: { label: 'B', bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',   title: 'Fuerte (ligas de nivel alto)' },
  C: { label: 'C', bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',   title: 'Medio (ligas competitivas)' },
  D: { label: 'D', bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-200',  title: 'Otros / menor nivel' },
}

// Tier assigned per league name. Conflicts resolved in getClubTier().
const LEAGUE_TIERS: Record<string, LeagueTier> = {
  // ── UEFA Tier A ──
  'Premier League':           'A',
  'La Liga':                  'A',
  'Bundesliga':               'A',
  'Serie A':                  'A', // Italy (Brazil handled via country)
  'Ligue 1':                  'A',
  'Eredivisie':               'A',
  'Primeira Liga':            'A',
  'Pro League':               'A',
  'Süper Lig':                'A',
  // ── UEFA Tier B ──
  'Championship':             'B',
  'La Liga 2':                'B',
  '2. Bundesliga':            'B',
  'Serie B':                  'B',
  'Ligue 2':                  'B',
  'Swiss Super League':       'B',
  'Scottish Premiership':     'B',
  'Austrian Bundesliga':      'B',
  'Ekstraklasa':              'B',
  'Czech First League':       'B',
  'NB I':                     'B',
  'Allsvenskan':              'B',
  'Eliteserien':              'B',
  'Superliga':                'B',
  '1. Lig':                   'B',
  'Primera RFEF':             'B',
  'Segunda RFEF':             'C',
  '1B Pro League':            'B',
  'EFL League One':           'B',
  'Liga Portugal 2':          'B',
  'HNL':                      'B',
  'Super liga':               'B',
  'First Professional League':'B',
  'Super League Greece':      'B',
  'Israeli Premier League':   'B',
  // ── UEFA Tier C ──
  'EFL League Two':           'C',
  '3. Liga':                  'C',
  'Austrian 2. Liga':         'C',
  'Slovak Super Liga':        'C',
  'PrvaLiga':                 'C',
  'Eerste Divisie':           'C',
  'First Division Cyprus':    'C',
  'Veikkausliiga':            'C',
  'Erovnuli Liga':            'C',
  'Ukrainian Premier League': 'C',
  'Challenge League':         'C',
  'Premier League Russia':    'C',
  'Liga 1':                   'C', // Romania / Peru — same name, resolved by country
  // ── CONMEBOL ──
  'Liga Betplay':             'B',
  'LigaPro':                  'C',
  // ── CONCACAF ──
  'MLS':                      'A',
  'Liga MX':                  'A',
  // ── AFC ──
  'Saudi Pro League':         'A',
  'Qatar Stars League':       'B',
  'Arabian Gulf League':      'B',
  'Indian Super League':      'C',
  'Premier League Kazakhstan':'D',
  // ── CAF ──
  // (no CAF leagues in current DB)
  // ── Misc ──
  'Baltic Leagues':           'D',
}

// Country → confederation
const COUNTRY_CONFEDERATION: Record<string, Confederation> = {
  // UEFA
  Spain: 'UEFA', England: 'UEFA', Germany: 'UEFA', France: 'UEFA', Italy: 'UEFA',
  Netherlands: 'UEFA', Portugal: 'UEFA', Belgium: 'UEFA', Switzerland: 'UEFA',
  Austria: 'UEFA', Scotland: 'UEFA', Poland: 'UEFA', 'Czech Republic': 'UEFA',
  Hungary: 'UEFA', Turkey: 'UEFA', Sweden: 'UEFA', Norway: 'UEFA', Denmark: 'UEFA',
  Finland: 'UEFA', Bulgaria: 'UEFA', Romania: 'UEFA', Serbia: 'UEFA', Croatia: 'UEFA',
  Slovenia: 'UEFA', Slovakia: 'UEFA', Cyprus: 'UEFA', Greece: 'UEFA', Israel: 'UEFA',
  Ukraine: 'UEFA', Georgia: 'UEFA', Russia: 'UEFA', Baltics: 'UEFA',
  // CONMEBOL
  Brazil: 'CONMEBOL', Argentina: 'CONMEBOL', Colombia: 'CONMEBOL',
  Chile: 'CONMEBOL', Peru: 'CONMEBOL', Ecuador: 'CONMEBOL', Uruguay: 'CONMEBOL',
  // CONCACAF
  USA: 'CONCACAF', Mexico: 'CONCACAF',
  // AFC
  'Saudi Arabia': 'AFC', Qatar: 'AFC', UAE: 'AFC', India: 'AFC', Kazakhstan: 'AFC',
}

const CONFEDERATION_LABELS: Record<Confederation, string> = {
  UEFA:     '🌍 UEFA',
  CONMEBOL: '🌎 CONMEBOL',
  CONCACAF: '🌎 CONCACAF',
  AFC:      '🌏 AFC',
  CAF:      '🌍 CAF',
}

function getClubTier(league: string | undefined, country: string | undefined): LeagueTier {
  if (!league) return 'D'
  // Resolve name conflicts using country
  if (league === 'Primera Division') {
    if (country === 'Argentina') return 'A'
    if (country === 'Brazil') return 'A'    // just in case
    return 'C'                              // Uruguay, Chile, etc.
  }
  if (league === 'Serie A' && country === 'Brazil') return 'A'
  if (league === 'Liga 1' && country === 'Romania') return 'B'
  if (league === 'Super League' && country === 'Switzerland') return 'B'
  return LEAGUE_TIERS[league] ?? 'D'
}

function getClubConfederation(country: string | undefined): Confederation {
  return COUNTRY_CONFEDERATION[country ?? ''] ?? 'UEFA'
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
  const cls = size === 'xs' ? 'w-6 h-6 text-[11px]' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (photo) return <img src={photo} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── mobile helpers ────────────────────────────────────────────

/** True cuando el viewport es < 640px (breakpoint sm de Tailwind). */
function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Bottom-sheet reutilizable para filtros en móvil. */
function FilterSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  useEscapeKey(onClose, open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto p-4 safe-area-bottom animate-in slide-in-from-bottom">
        <div className="sticky -top-4 -mx-4 px-4 pt-1 pb-3 bg-white flex items-center justify-between border-b border-slate-100 mb-3 z-10">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar filtros" className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {children}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Ver resultados
        </button>
      </div>
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
  profiles: Profile[]
  onBack: () => void          // go to Tareas
  onGoToJugadores?: () => void
  onGoToCaptacion?: () => void
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
  onCreatePlayer?: (p: Player) => Promise<Player>
  /** Pantalla partida: la lista va en media pantalla → menos columnas */
  splitActive?: boolean
  /** Club abierto en el panel (para resaltarlo en la lista) */
  activeClubId?: string
}

// ── main component ────────────────────────────────────────────

export function Distribution({
  players, clubs, entries, negotiations, currentProfile, profiles,
  onBack, onGoToCaptacion, onLogout, onAdmin, onSelectPlayer, onSelectClub,
  onCreateClub, onUpdateClub, onDeleteClub,
  onCreateEntry, onUpdateEntry, onDeleteEntry,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
  onCreatePlayer, splitActive = false, activeClubId,
}: Props) {
  // Rejilla de clubes: en pantalla partida usamos menos columnas
  const clubGridCls = splitActive
    ? 'grid grid-cols-1 2xl:grid-cols-2 gap-1.5'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5'
  const [tab, setTab] = useState<'jugadores' | 'clubes' | 'solicitudes' | 'oportunidades' | 'pipeline' | 'encargados'>(
    () => (sessionStorage.getItem('nav_dist_tab') as 'jugadores' | 'clubes' | 'solicitudes' | 'oportunidades' | 'pipeline' | 'encargados') ?? 'jugadores'
  )
  // Oportunidades tab
  const [oppSearch, setOppSearch] = useState('')
  const [oppPriority, setOppPriority] = useState<'A' | 'B' | 'C' | 'D' | ''>('')
  const [oppPos, setOppPos] = useState('')          // filtro por posición del jugador
  const [oppLeague, setOppLeague] = useState('')    // filtro por liga del club
  const [oppMineOnly, setOppMineOnly] = useState(false)
  const [offeringOppKey, setOfferingOppKey] = useState<string | null>(null)
  const [dismissingOppKey, setDismissingOppKey] = useState<string | null>(null)
  // Salud de datos (Encargados tab, admin)
  const [healthOpen, setHealthOpen] = useState<null | 'sin' | 'dup' | 'pos' | 'old'>(null)
  useEffect(() => { sessionStorage.setItem('nav_dist_tab', tab) }, [tab])
  const season = CURRENT_SEASON

  // Móvil: bottom-sheet de filtros + detección de viewport
  const isMobile = useIsMobile()
  const [filterSheet, setFilterSheet] = useState<null | 'jugadores' | 'clubes' | 'solicitudes' | 'pipeline'>(null)

  // Filtros de la pestaña Clubes — persistidos en sessionStorage para que
  // se conserven al navegar a fichas y volver, y entre refrescos.
  const FILTERS_KEY = 'dist_club_filters'
  const storedF: Record<string, unknown> = (() => {
    try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}') } catch { return {} }
  })()
  const [search, setSearch] = useState<string>((storedF.search as string) ?? '')

  // toasts + confirmaciones
  const { toasts, showToast, dismissToast } = useToast()
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null)
  const [confirmDeleteClubId, setConfirmDeleteClubId] = useState<string | null>(null)

  // panel state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [openManagerDropId, setOpenManagerDropId] = useState<string | null>(null)
  const [managerDropPos, setManagerDropPos]       = useState<{ top: number; right: number } | null>(null)
  // Encargado de hablar con el club (dropdown en ClubCard)
  const [openClubManagerId, setOpenClubManagerId]   = useState<string | null>(null)
  const [clubManagerDropPos, setClubManagerDropPos] = useState<{ top: number; right: number } | null>(null)

  // Close manager dropdowns on outside click.
  // Se cierra también con scroll AMPLIO (el dropdown es fixed y se desalinearía),
  // pero ignorando micro-scrolls para que no desaparezca antes de elegir.
  useEffect(() => {
    if (!openManagerDropId && !openClubManagerId) return
    const close = () => {
      setOpenManagerDropId(null); setManagerDropPos(null)
      setOpenClubManagerId(null); setClubManagerDropPos(null)
    }
    // Espera al siguiente tick para no capturar el mismo clic que lo abrió
    let startY = window.scrollY
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 80) close()
    }
    const timer = setTimeout(() => {
      startY = window.scrollY
      document.addEventListener('click', close)
      window.addEventListener('scroll', onScroll, true)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [openManagerDropId, openClubManagerId])

  // modals
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showAddClub, setShowAddClub] = useState(false)
  const [showAddNeg, setShowAddNeg] = useState<{ playerId?: string; clubId?: string; needPosition?: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<DistributionEntry | null>(null)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [bulkAssignPlayerId, setBulkAssignPlayerId] = useState<string | null>(null)
  // when opening club panel from a solicitud, track which need position to filter offered players
  const [selectedNeedPosition, setSelectedNeedPosition] = useState<string | null>(null)
  // need-specific panel (solicitudes tab)
  const [selectedNeed, setSelectedNeed] = useState<{ clubId: string; needIndex: number } | null>(null)
  // pipeline filters
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [pipelinePosFilter, setPipelinePosFilter] = useState<string>('')
  const [pipelineGestorFilter, setPipelineGestorFilter] = useState<string>('')
  const [showClosedDeals, setShowClosedDeals] = useState(false)
  const [pipelineMyOnly, setPipelineMyOnly] = useState(false)
  const [pipelineListView, setPipelineListView] = useState(false)

  // filters
  const [leagueFilter, setLeagueFilter] = useState<string[]>((storedF.leagueFilter as string[]) ?? [])
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false)
  const [countryFilter, setCountryFilter] = useState<string[]>((storedF.countryFilter as string[]) ?? [])
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [tierFilter, setTierFilter] = useState<LeagueTier[]>((storedF.tierFilter as LeagueTier[]) ?? [])
  const [confederationFilter, setConfederationFilter] = useState<Confederation[]>((storedF.confederationFilter as Confederation[]) ?? [])
  const [confDropdownOpen, setConfDropdownOpen] = useState(false)
  const [priorityOnly, setPriorityOnly] = useState<boolean>((storedF.priorityOnly as boolean) ?? false)
  const [hasNeedsOnly, setHasNeedsOnly] = useState<boolean>((storedF.hasNeedsOnly as boolean) ?? false)
  const [hasContactOnly, setHasContactOnly] = useState<boolean>((storedF.hasContactOnly as boolean) ?? false)
  const [clubManagerFilter, setClubManagerFilter] = useState<string>((storedF.clubManagerFilter as string) ?? '')   // '' = todos, '__sin__' = sin encargado, o avatar
  const [staleOnly, setStaleOnly] = useState<boolean>((storedF.staleOnly as boolean) ?? false)   // bandeja: clubes con propuestas activas sin mover >7d

  // Guardar filtros de Clubes al cambiar
  useEffect(() => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
      search, leagueFilter, countryFilter, tierFilter, confederationFilter,
      priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, leagueFilter, countryFilter, tierFilter, confederationFilter, priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly])
  const [positionFilter, setPositionFilter] = useState('')   // solicitudes tab
  const [editingNeed, setEditingNeed] = useState<{ clubId: string; index: number } | null>(null)
  const [posFilters, setPosFilters] = useState<string[]>([])   // jugadores tab
  const [yearFilters, setYearFilters] = useState<string[]>([])
  const [activityFilter, setActivityFilter] = useState(false)
  const [showAddNeed, setShowAddNeed] = useState(false)
  const [groupByTier, setGroupByTier] = useState(false)
  const [playerPanelGestorFilter, setPlayerPanelGestorFilter] = useState('')
  // solicitudes filters
  const [needsTierFilter, setNeedsTierFilter] = useState<LeagueTier[]>([])
  const [needsLeagueFilter, setNeedsLeagueFilter] = useState('')
  const [needsAgeFilter, setNeedsAgeFilter] = useState('')
  const [needsSort, setNeedsSort] = useState<'recent' | 'club'>('recent')

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
    if (leagueFilter.length > 0) result = result.filter(c => leagueFilter.includes(c.league ?? 'Sin liga'))
    if (countryFilter.length > 0) result = result.filter(c => countryFilter.includes(c.country ?? ''))
    if (tierFilter.length > 0) result = result.filter(c => tierFilter.includes(getClubTier(c.league, c.country)))
    if (confederationFilter.length > 0) result = result.filter(c => confederationFilter.includes(getClubConfederation(c.country)))
    if (priorityOnly) result = result.filter(c => c.isPriority)
    if (hasNeedsOnly) result = result.filter(c => c.needs.length > 0)
    if (hasContactOnly) result = result.filter(c => !!c.contactPerson)
    if (clubManagerFilter === '__sin__') result = result.filter(c => !c.aisManager)
    else if (clubManagerFilter) result = result.filter(c => c.aisManager === clubManagerFilter)
    if (staleOnly) {
      const ACTIVE: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
      result = result.filter(c => {
        const active = negotiations.filter(n => n.clubId === c.id && ACTIVE.includes(n.status))
        if (active.length === 0) return false
        const last = active.reduce<string | undefined>((m, n) => (!m || n.updatedAt > m ? n.updatedAt : m), undefined)
        const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : 0
        return days > 7
      })
    }
    if (!search) return result
    const q = search.toLowerCase()
    return result.filter(c => c.name.toLowerCase().includes(q) || c.league?.toLowerCase().includes(q))
  }, [clubs, negotiations, search, leagueFilter, countryFilter, tierFilter, confederationFilter, priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly])

  const sortedLeagues = useMemo(() => {
    const map = new Map<string, { count: number; country: string }>()
    clubs.forEach(c => {
      const key = c.league ?? 'Sin liga'
      const existing = map.get(key)
      map.set(key, { count: (existing?.count ?? 0) + 1, country: existing?.country || c.country || '' })
    })
    return Array.from(map.entries())
      .map(([league, { count, country }]) => ({
        league, count, country,
        tier: getClubTier(league, country),
        confederation: getClubConfederation(country),
      }))
      .sort((a, b) => {
        // Spanish leagues always first (La Liga → La Liga 2 → Primera RFEF → Segunda RFEF)
        const SPANISH_LEAGUES = ['La Liga', 'La Liga 2', 'Primera RFEF', 'Segunda RFEF']
        const aSpain = SPANISH_LEAGUES.includes(a.league)
        const bSpain = SPANISH_LEAGUES.includes(b.league)
        if (aSpain && !bSpain) return -1
        if (!aSpain && bSpain) return 1
        if (aSpain && bSpain) return SPANISH_LEAGUES.indexOf(a.league) - SPANISH_LEAGUES.indexOf(b.league)
        // Rest: sort by tier then name
        const tierOrder: Record<LeagueTier, number> = { A: 0, B: 1, C: 2, D: 3 }
        const td = tierOrder[a.tier] - tierOrder[b.tier]
        if (td !== 0) return td
        return a.league.localeCompare(b.league)
      })
  }, [clubs])

  const sortedCountries = useMemo(() => {
    const map = new Map<string, number>()
    clubs.forEach(c => { const k = c.country ?? ''; map.set(k, (map.get(k) ?? 0) + 1) })
    return Array.from(map.entries())
      .filter(([c]) => c)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => a.country.localeCompare(b.country))
  }, [clubs])

  const allNeedsPositions = useMemo(() => {
    // Normaliza a código estándar (p.ej. "Centrocampista" → CM) para que no
    // aparezcan duplicados con valores antiguos. Ordena según POSITIONS.
    const codes = new Set<string>()
    clubs.forEach(c => c.needs.forEach(n => codes.add(normalizePosition(n.position) ?? n.position)))
    const order = POSITION_CODES
    return Array.from(codes).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [clubs])

  const clubNeeds = useMemo(() => {
    const results: Array<{ club: Club; need: ClubNeed }> = []
    clubs.forEach(club => club.needs.forEach(need => results.push({ club, need })))
    const pf = positionFilter   // código estándar seleccionado (o '')
    const q = search.toLowerCase()
    const filtered = results.filter(r =>
      (!pf || (normalizePosition(r.need.position) ?? r.need.position) === pf) &&
      (!q || r.club.name.toLowerCase().includes(q) || r.club.league?.toLowerCase().includes(q) || r.need.position.toLowerCase().includes(q)) &&
      (needsTierFilter.length === 0 || needsTierFilter.includes(getClubTier(r.club.league, r.club.country))) &&
      (!needsLeagueFilter || r.club.league === needsLeagueFilter) &&
      (!needsAgeFilter || (r.need.ageMax !== undefined && r.need.ageMax <= Number(needsAgeFilter)))
    )
    if (needsSort === 'recent') {
      filtered.sort((a, b) => {
        const da = a.need.createdAt ?? ''
        const db2 = b.need.createdAt ?? ''
        if (!da && !db2) return 0
        if (!da) return 1
        if (!db2) return -1
        return db2.localeCompare(da)
      })
    }
    return filtered
  }, [clubs, positionFilter, search, needsTierFilter, needsLeagueFilter, needsAgeFilter, needsSort])

  const needsLeagues = useMemo(() => {
    const m = new Map<string, number>()
    clubs.forEach(c => { if (c.league && c.needs.length > 0) m.set(c.league, (m.get(c.league) ?? 0) + c.needs.length) })
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [clubs])

  const selectedEntry = seasonEntries.find(e => e.id === selectedEntryId) ?? null
  const selectedClub = clubs.find(c => c.id === selectedClubId) ?? null

  // ── helpers ───────────────────────────────────────────────────
  function daysSince(iso: string | undefined): number {
    if (!iso) return 999
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  }

  const myActiveNegCount = useMemo(() =>
    negotiations.filter(n =>
      n.aisManager === currentProfile.avatar &&
      ['pendiente', 'ofrecido', 'interesado', 'negociando'].includes(n.status)
    ).length
  , [negotiations, currentProfile.avatar])

  // ── Bandeja de pendientes: propuestas 'pendiente' donde soy encargado
  //    del club o del jugador. Se calcula del estado, así que aparece al entrar. ──
  const [showPendingInbox, setShowPendingInbox] = useState(false)
  const myPending = useMemo(() => {
    return negotiations
      .filter(n => n.status === 'pendiente')
      .map(n => {
        const club = clubs.find(c => c.id === n.clubId)
        const player = players.find(p => p.id === n.playerId)
        return { neg: n, club, player }
      })
      .filter(({ neg, club, player }) =>
        (club?.aisManager === currentProfile.avatar) ||
        (!!player && player.managedBy.includes(currentProfile.id)) ||
        (neg.aisManager === currentProfile.avatar)
      )
      .sort((a, b) => (b.neg.createdAt ?? '').localeCompare(a.neg.createdAt ?? ''))
  }, [negotiations, clubs, players, currentProfile.avatar, currentProfile.id])

  // ── MOTOR DE OPORTUNIDADES ──────────────────────────────────
  // Cruza tu cartera (entries) con las necesidades abiertas de los clubes,
  // excluyendo lo ya ofrecido y respetando edad (Sub-X estricto).
  // Orden: prioridad del jugador (A>B>C>D) → tier del club → nombre.
  const opportunities = useMemo(() => {
    const PR: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
    const TR: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
    const today = new Date()
    const ageOf = (bd?: string): number | null => {
      if (!bd) return null
      const d = new Date(bd)
      if (isNaN(d.getTime())) return null
      let a = today.getFullYear() - d.getFullYear()
      const m = today.getMonth() - d.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--
      return a
    }
    const closedPlayerIds = new Set(negotiations.filter(n => n.status === 'cerrado').map(n => n.playerId))
    const existingPairs = new Set(negotiations.map(n => `${n.playerId}|${n.clubId}`))
    const clubsWithNeeds = clubs.filter(c => c.needs && c.needs.length > 0)

    const out: Array<{ player: Player; entry: DistributionEntry; club: Club; need: ClubNeed; tier: LeagueTier; age: number | null }> = []
    for (const entry of seasonEntries) {
      const player = players.find(p => p.id === entry.playerId)
      if (!player || player.hiddenFromManagement) continue
      if (closedPlayerIds.has(player.id)) continue
      const age = ageOf(player.birthDate)
      for (const club of clubsWithNeeds) {
        if (existingPairs.has(`${player.id}|${club.id}`)) continue
        let matched: ClubNeed | null = null
        for (const need of club.needs) {
          if (!needMatchesPlayer(need.position, player.positions)) continue
          if (need.ageMax && age !== null && age > need.ageMax) continue   // edad estricta
          matched = need; break
        }
        if (!matched) continue
        out.push({ player, entry, club, need: matched, tier: getClubTier(club.league, club.country), age })
      }
    }
    out.sort((a, b) =>
      (PR[a.entry.priority] ?? 9) - (PR[b.entry.priority] ?? 9) ||
      (TR[a.tier] ?? 9) - (TR[b.tier] ?? 9) ||
      a.player.name.localeCompare(b.player.name) ||
      a.club.name.localeCompare(b.club.name)
    )
    return out
  }, [seasonEntries, players, clubs, negotiations])

  const oppLeagues = useMemo(
    () => Array.from(new Set(opportunities.map(o => o.club.league).filter(Boolean) as string[])).sort(),
    [opportunities]
  )
  const filteredOpportunities = useMemo(() => {
    const q = oppSearch.trim().toLowerCase()
    return opportunities.filter(o => {
      if (oppPriority && o.entry.priority !== oppPriority) return false
      if (oppPos && !o.player.positions.includes(oppPos)) return false
      if (oppLeague && o.club.league !== oppLeague) return false
      if (oppMineOnly) {
        const mine = o.club.aisManager === currentProfile.avatar || o.player.managedBy.includes(currentProfile.id)
        if (!mine) return false
      }
      if (q && !(o.player.name.toLowerCase().includes(q) || o.club.name.toLowerCase().includes(q) ||
        (o.club.league ?? '').toLowerCase().includes(q) || (o.club.country ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [opportunities, oppSearch, oppPriority, oppPos, oppLeague, oppMineOnly, currentProfile.avatar, currentProfile.id])

  function closePanel() { setSelectedEntryId(null); setSelectedClubId(null); setSelectedNeed(null); setPlayerPanelGestorFilter(''); setPanelExpanded(false) }
  const hasPanel = tab !== 'encargados' && (!!selectedEntry || !!selectedClub || !!selectedNeed)
  // Panel lateral ampliable (más ancho para editar cómodamente)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const PanelExpandBtn = () => (
    <button
      onClick={() => setPanelExpanded(e => !e)}
      aria-label={panelExpanded ? 'Reducir panel' : 'Ampliar panel'}
      title={panelExpanded ? 'Reducir' : 'Ampliar'}
      className="hidden lg:inline-flex p-1.5 rounded hover:bg-slate-100 text-slate-400 flex-shrink-0"
    >
      {panelExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    </button>
  )

  function switchTab(t: typeof tab) {
    setTab(t)
    closePanel()
    setLeagueFilter([])
    setCountryFilter([])
    setPriorityOnly(false)
    setHasNeedsOnly(false)
    setHasContactOnly(false)
    setPositionFilter('')
    setPosFilters([])
    setYearFilters([])
    setActivityFilter(false)
    setSearch('')
    setNeedsTierFilter([])
    setNeedsLeagueFilter('')
    setNeedsAgeFilter('')
  }

  // group entries by priority — intermediar players always go to D
  const byPriority = useMemo(() => {
    const withEffectivePriority = filteredEntries.map(e => {
      const player = players.find(p => p.id === e.playerId)
      const effectivePriority = player?.hiddenFromManagement ? 'D' : e.priority
      return { ...e, priority: effectivePriority as 'A' | 'B' | 'C' | 'D' }
    })
    return {
      A: withEffectivePriority.filter(e => e.priority === 'A'),
      B: withEffectivePriority.filter(e => e.priority === 'B'),
      C: withEffectivePriority.filter(e => e.priority === 'C'),
      D: withEffectivePriority.filter(e => e.priority === 'D'),
    }
  }, [filteredEntries, players])


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
            <button onClick={onLogout} aria-label="Cerrar sesión" className="text-slate-400 hover:text-slate-600 transition-colors p-2 sm:p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Level 1: main sections */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            Mantenimiento
          </button>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
            <TrendingUp className="w-3.5 h-3.5" />
            Distribución
          </button>
          <button
            onClick={onGoToCaptacion}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Captación
          </button>
        </div>

        {/* Sub-tabs — inside header so they stay sticky */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex gap-1 border-t border-slate-100 overflow-x-auto scrollbar-none">
          {(['jugadores', 'clubes', 'solicitudes', 'oportunidades', 'pipeline', 'encargados'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'jugadores' ? (
                <>Jugadores ({seasonEntries.length})</>
              ) : t === 'clubes' ? (
                <>Clubes ({clubs.length})</>
              ) : t === 'solicitudes' ? (
                <>Solicitudes{clubNeeds.length > 0 ? ` (${clubNeeds.length})` : ''}</>
              ) : t === 'oportunidades' ? (
                <span className="flex items-center gap-1.5">
                  Oportunidades
                  {opportunities.length > 0 && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                      tab === t ? 'bg-primary text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}>{opportunities.length}</span>
                  )}
                </span>
              ) : t === 'encargados' ? (
                <>Encargados</>
              ) : (
                <span className="flex items-center gap-1.5">
                  Pipeline
                  {myActiveNegCount > 0 && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                      tab === t ? 'bg-primary text-white' : 'bg-slate-200 text-slate-600'
                    }`}>{myActiveNegCount}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>


      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-y-auto p-4 pb-20 sm:pb-4 ${hasPanel ? 'hidden sm:block' : ''}`}>

          {/* ── BANDEJA DE PENDIENTES (propuestas que requieren tu atención) ── */}
          {myPending.length > 0 && (
            <div className="mb-4 max-w-6xl mx-auto rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <button
                onClick={() => setShowPendingInbox(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-100/60 transition-colors"
              >
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-800">
                  {myPending.length} propuesta{myPending.length !== 1 ? 's' : ''} pendiente{myPending.length !== 1 ? 's' : ''} para ti
                </span>
                <ChevronDown className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${showPendingInbox ? 'rotate-180' : ''}`} />
              </button>
              {showPendingInbox && (
                <div className="border-t border-amber-200 divide-y divide-amber-100 max-h-[50vh] overflow-y-auto">
                  {myPending.map(({ neg, club, player }) => (
                    <button
                      key={neg.id}
                      onClick={() => { if (club) onSelectClub?.(club.id) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-white hover:bg-amber-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-800 truncate">{player?.name ?? 'Jugador'}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                      <span className="text-sm text-slate-600 truncate">{club?.name ?? 'Club'}</span>
                      {neg.needPosition && (
                        <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{neg.needPosition}</span>
                      )}
                      <span className="ml-auto text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Pendiente</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── JUGADORES TAB ── */}
          {tab === 'jugadores' && (() => {
            const playersActiveFilters = posFilters.length + yearFilters.length + (activityFilter ? 1 : 0)
            const playersFilterControls = (
              <>
                <MultiSelect
                  label="Posición"
                  options={POSITION_CODES}
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
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Con actividad
                </button>
                {playersActiveFilters > 0 && (
                  <button
                    onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false) }}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    {playersActiveFilters} filtro{playersActiveFilters !== 1 ? 's' : ''} activo{playersActiveFilters !== 1 ? 's' : ''}
                    <X className="w-3 h-3 ml-0.5 opacity-60" />
                  </button>
                )}
              </>
            )
            return (
            <div className="max-w-5xl mx-auto">
              {/* Desktop: filtros inline */}
              <div className="hidden sm:flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar jugador…"
                      className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  {playersFilterControls}
                </div>
                <button
                  onClick={() => setShowAddPlayer(true)}
                  className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir jugador
                </button>
              </div>

              {/* Móvil: barra compacta búsqueda + botón Filtros */}
              <div className="flex sm:hidden items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar jugador…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <button
                  onClick={() => setFilterSheet('jugadores')}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    playersActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" /> Filtros
                  {playersActiveFilters > 0 && <span className="text-xs">({playersActiveFilters})</span>}
                </button>
              </div>

              <FilterSheet open={filterSheet === 'jugadores'} onClose={() => setFilterSheet(null)} title="Filtros de jugadores">
                {playersFilterControls}
              </FilterSheet>

              <div className="space-y-3">
                {(['A', 'B', 'C', 'D'] as const).map(pr => {
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
                              className={`bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5 px-3 py-2 overflow-hidden relative ${
                                selectedEntryId === entry.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'
                              }`}
                            >
                              {/* Negotiation status bar */}
                              {topStatus && (
                                <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l ${STATUS_CONFIG[topStatus].dot}`} />
                              )}
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

                              {/* Manager badge — fixed dropdown to escape overflow:hidden */}
                              <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <button
                                  title={entry.aisManager
                                    ? (profiles.find(p => p.avatar === entry.aisManager)?.name ?? entry.aisManager)
                                    : 'Sin encargado'}
                                  onClick={e => {
                                    if (openManagerDropId === entry.id) {
                                      setOpenManagerDropId(null); setManagerDropPos(null); return;
                                    }
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setManagerDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                    setOpenManagerDropId(entry.id);
                                  }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                                    entry.aisManager
                                      ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                                      : 'bg-slate-100 text-slate-400 border-dashed border-slate-300 hover:bg-slate-200'
                                  }`}
                                >
                                  {entry.aisManager ?? '+'}
                                </button>
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
                (search || posFilters.length > 0 || yearFilters.length > 0 || activityFilter) ? (
                  <EmptyState
                    icon={<Search className="w-10 h-10" />}
                    title="Sin resultados"
                    subtitle={[
                      search && `búsqueda "${search}"`,
                      posFilters.length > 0 && `posición: ${posFilters.join(', ')}`,
                      yearFilters.length > 0 && `año: ${yearFilters.join(', ')}`,
                      activityFilter && 'con actividad',
                    ].filter(Boolean).join(' · ')}
                    action={
                      <button
                        onClick={() => { setSearch(''); setPosFilters([]); setYearFilters([]); setActivityFilter(false) }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Limpiar filtros
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Users className="w-10 h-10" />}
                    title="No hay jugadores en distribución"
                    subtitle="Añade jugadores de la cartera para empezar a distribuirlos esta temporada."
                    action={
                      <button
                        onClick={() => setShowAddPlayer(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Añadir jugador
                      </button>
                    }
                  />
                )
              )}

              {/* FAB Añadir jugador — móvil */}
              <button
                onClick={() => setShowAddPlayer(true)}
                aria-label="Añadir jugador"
                className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            )
          })()}

          {/* ── CLUBES TAB ── */}
          {tab === 'clubes' && (() => {
            const clubsActiveFilters = leagueFilter.length + countryFilter.length + tierFilter.length + confederationFilter.length + (priorityOnly ? 1 : 0) + (hasNeedsOnly ? 1 : 0) + (hasContactOnly ? 1 : 0) + (clubManagerFilter ? 1 : 0) + (staleOnly ? 1 : 0) + (groupByTier ? 1 : 0)
            const clubsGroupToggle = (
              <button
                onClick={() => setGroupByTier(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                  groupByTier
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <CircleDot className="w-3.5 h-3.5" />
                {groupByTier ? 'Por nivel' : 'Por liga'}
              </button>
            )
            const clubsFilterControls = (
              <>
              {/* ── Filter row 1: Tier chips + Confederation dropdown ── */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Tier chips */}
                <span className="text-xs text-slate-400 font-medium">Nivel:</span>
                {(['A', 'B', 'C', 'D'] as LeagueTier[]).map(t => {
                  const cfg = TIER_CONFIG[t]
                  const active = tierFilter.includes(t)
                  return (
                    <button
                      key={t}
                      title={cfg.title}
                      onClick={() => setTierFilter(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                      className={`w-7 h-7 rounded-lg text-xs font-bold border transition-all ${
                        active ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-2 ring-offset-1 ring-current` : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Confederation dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setConfDropdownOpen(o => !o)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                      confederationFilter.length > 0
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    🌍 {confederationFilter.length === 0 ? 'Confederación' : confederationFilter.map(c => c).join(', ')}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  {confDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setConfDropdownOpen(false)} />
                      <div className="absolute z-50 mt-1 w-52 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                        <div className="p-1.5 border-b border-slate-100">
                          <button onClick={() => { setConfederationFilter([]); setConfDropdownOpen(false) }} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-600">Todas las confederaciones</button>
                        </div>
                        <div className="p-1.5 space-y-0.5">
                          {(['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF'] as Confederation[]).map(conf => {
                            const sel = confederationFilter.includes(conf)
                            return (
                              <button key={conf} onClick={() => setConfederationFilter(prev => sel ? prev.filter(c => c !== conf) : [...prev, conf])}
                                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${sel ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                                  {sel && <Check className="w-2 h-2 text-white" />}
                                </div>
                                {CONFEDERATION_LABELS[conf]}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Filter row 2: League + Country + toggles ── */}
              <div className="relative mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* League multi-select */}
                  <div className="relative">
                    <button
                      onClick={() => setLeagueDropdownOpen(o => !o)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                        leagueFilter.length > 0
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {leagueFilter.length === 0 ? 'Liga' : `${leagueFilter.length} liga${leagueFilter.length > 1 ? 's' : ''}`}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    {leagueDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setLeagueDropdownOpen(false)} />
                        <div className="absolute z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                          <div className="p-2 border-b border-slate-100">
                            <button onClick={() => { setLeagueFilter([]); setLeagueDropdownOpen(false) }} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${leagueFilter.length === 0 ? 'bg-primary text-white' : 'hover:bg-slate-50 text-slate-700'}`}>
                              Todas las ligas ({clubs.length})
                            </button>
                          </div>
                          <div className="p-2 space-y-0.5">
                            {sortedLeagues.map(({ league, count, country, tier }) => {
                              const selected = leagueFilter.includes(league)
                              const tierCfg = TIER_CONFIG[tier]
                              return (
                                <button key={league}
                                  onClick={() => setLeagueFilter(prev => prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league])}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${selected ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                                    {selected && <Check className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                  <span className={`text-[11px] font-bold px-1 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text} flex-shrink-0`}>{tier}</span>
                                  <span className="flex-1 min-w-0">
                                    <span className="font-medium truncate block">{league}</span>
                                    {country && <span className="text-xs text-slate-400">{country}</span>}
                                  </span>
                                  <span className="text-xs text-slate-400 flex-shrink-0">{count}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter row 3: country + toggles */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {/* Country multi-select */}
                <div className="relative">
                  <button
                    onClick={() => setCountryDropdownOpen(o => !o)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                      countryFilter.length > 0
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {countryFilter.length === 0 ? 'País' : `${countryFilter.length} país${countryFilter.length > 1 ? 'es' : ''}`}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  {countryDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCountryDropdownOpen(false)} />
                      <div className="absolute z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                        <div className="p-1.5 border-b border-slate-100">
                          <button onClick={() => { setCountryFilter([]); setCountryDropdownOpen(false) }} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-600">Todos los países</button>
                        </div>
                        <div className="p-1.5 space-y-0.5">
                          {sortedCountries.map(({ country, count }) => {
                            const sel = countryFilter.includes(country)
                            return (
                              <button key={country} onClick={() => setCountryFilter(prev => sel ? prev.filter(c => c !== country) : [...prev, country])}
                                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${sel ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                                  {sel && <Check className="w-2 h-2 text-white" />}
                                </div>
                                <span className="flex-1 truncate">{country}</span>
                                <span className="text-slate-400">{count}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Priority toggle */}
                <button
                  onClick={() => setPriorityOnly(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                    priorityOnly ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" /> Prioritarios
                </button>

                {/* Has needs toggle */}
                <button
                  onClick={() => setHasNeedsOnly(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                    hasNeedsOnly ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Con solicitudes
                </button>

                {/* Has contact toggle */}
                <button
                  onClick={() => setHasContactOnly(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                    hasContactOnly ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Con contacto
                </button>

                {/* Bandeja stale: propuestas paradas */}
                <button
                  onClick={() => setStaleOnly(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                    staleOnly ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  ⏰ Paradas &gt;7d
                </button>

                {/* Filtro por encargado del club */}
                <select
                  value={clubManagerFilter}
                  onChange={e => setClubManagerFilter(e.target.value)}
                  aria-label="Filtrar por encargado"
                  className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    clubManagerFilter ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <option value="">Encargado: todos</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.avatar}>{p.name} ({p.avatar})</option>
                  ))}
                  <option value="__sin__">Sin encargado</option>
                </select>

                {/* Clear all */}
                {(leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly || clubManagerFilter || staleOnly) && (() => {
                  const count = leagueFilter.length + countryFilter.length + tierFilter.length + confederationFilter.length + (priorityOnly ? 1 : 0) + (hasNeedsOnly ? 1 : 0) + (hasContactOnly ? 1 : 0) + (clubManagerFilter ? 1 : 0) + (staleOnly ? 1 : 0)
                  return (
                    <button
                      onClick={() => { setLeagueFilter([]); setCountryFilter([]); setTierFilter([]); setConfederationFilter([]); setPriorityOnly(false); setHasNeedsOnly(false); setHasContactOnly(false); setClubManagerFilter(''); setStaleOnly(false) }}
                      className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors ml-1"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {count} filtro{count !== 1 ? 's' : ''}
                      <X className="w-3 h-3 ml-0.5 opacity-60" />
                    </button>
                  )
                })()}

                <span className="ml-auto text-xs text-slate-400">{filteredClubs.length} club{filteredClubs.length !== 1 ? 's' : ''}</span>
              </div>
              </>
            )
            return (
            <div className="max-w-5xl mx-auto">
              {/* Desktop: barra superior búsqueda + agrupar + añadir */}
              <div className="hidden sm:flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar club…"
                      className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  {clubsGroupToggle}
                </div>
                <button
                  onClick={() => setShowAddClub(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir club
                </button>
              </div>

              {/* Desktop: filtros inline */}
              <div className="hidden sm:block">
                {clubsFilterControls}
              </div>

              {/* Móvil: barra compacta búsqueda + botón Filtros */}
              <div className="flex sm:hidden items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar club…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <button
                  onClick={() => setFilterSheet('clubes')}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    clubsActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" /> Filtros
                  {clubsActiveFilters > 0 && <span className="text-xs">({clubsActiveFilters})</span>}
                </button>
              </div>

              <FilterSheet open={filterSheet === 'clubes'} onClose={() => setFilterSheet(null)} title="Filtros de clubes">
                <div className="flex items-center gap-2">{clubsGroupToggle}</div>
                {clubsFilterControls}
              </FilterSheet>

              {/* Clubs grid — grouped by league when no filter, flat when filtered */}
              {(leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly || !!search) ? (
                <div className={clubGridCls}>
                  {filteredClubs.map(club => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      negotiations={negotiations}
                      isSelected={selectedClubId === club.id || activeClubId === club.id}
                      onClick={() => {
                        if (onSelectClub) { onSelectClub(club.id) }
                        else { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(null) }
                      }}
                      onOffer={() => setShowAddNeg({ clubId: club.id })}
                      onTogglePriority={() => onUpdateClub({ ...club, isPriority: !club.isPriority }).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                      managerName={profiles.find(p => p.avatar === club.aisManager)?.name}
                      managerDropOpen={openClubManagerId === club.id}
                      onToggleManagerDrop={(pos) => {
                        if (!pos) { setOpenClubManagerId(null); setClubManagerDropPos(null) }
                        else { setOpenClubManagerId(club.id); setClubManagerDropPos(pos) }
                      }}
                    />
                  ))}
                </div>
              ) : groupByTier ? (
                <div className="space-y-4">
                  {(['A', 'B', 'C', 'D'] as LeagueTier[]).map(t => {
                    const tierClubs = filteredClubs.filter(c => getClubTier(c.league, c.country) === t)
                    if (tierClubs.length === 0) return null
                    const tierCfg = TIER_CONFIG[t]
                    return (
                      <div key={t}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{t}</span>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tierCfg.title}</span>
                          <span className="text-xs text-slate-400">({tierClubs.length})</span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className={clubGridCls}>
                          {tierClubs.map(club => (
                            <ClubCard
                              key={club.id}
                              club={club}
                              negotiations={negotiations}
                              isSelected={selectedClubId === club.id || activeClubId === club.id}
                              onClick={() => {
                                if (onSelectClub) { onSelectClub(club.id) }
                                else { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(null) }
                              }}
                              onOffer={() => setShowAddNeg({ clubId: club.id })}
                              onTogglePriority={() => onUpdateClub({ ...club, isPriority: !club.isPriority }).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                              managerName={profiles.find(p => p.avatar === club.aisManager)?.name}
                              managerDropOpen={openClubManagerId === club.id}
                              onToggleManagerDrop={(pos) => {
                                if (!pos) { setOpenClubManagerId(null); setClubManagerDropPos(null) }
                                else { setOpenClubManagerId(club.id); setClubManagerDropPos(pos) }
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedLeagues.map(({ league, tier, confederation }) => {
                    const leagueClubs = filteredClubs.filter(c => (c.league ?? 'Sin liga') === league)
                    if (leagueClubs.length === 0) return null
                    const tierCfg = TIER_CONFIG[tier]
                    return (
                      <div key={league}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{league}</span>
                          <span className="text-xs text-slate-400">({leagueClubs.length})</span>
                          <span className="text-xs text-slate-300">{CONFEDERATION_LABELS[confederation]}</span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className={clubGridCls}>
                          {leagueClubs.map(club => (
                            <ClubCard
                              key={club.id}
                              club={club}
                              negotiations={negotiations}
                              isSelected={selectedClubId === club.id || activeClubId === club.id}
                              onClick={() => {
                                if (onSelectClub) { onSelectClub(club.id) }
                                else { setSelectedClubId(club.id); setSelectedEntryId(null); setSelectedNeedPosition(null) }
                              }}
                              onOffer={() => setShowAddNeg({ clubId: club.id })}
                              onTogglePriority={() => onUpdateClub({ ...club, isPriority: !club.isPriority }).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                              managerName={profiles.find(p => p.avatar === club.aisManager)?.name}
                              managerDropOpen={openClubManagerId === club.id}
                              onToggleManagerDrop={(pos) => {
                                if (!pos) { setOpenClubManagerId(null); setClubManagerDropPos(null) }
                                else { setOpenClubManagerId(club.id); setClubManagerDropPos(pos) }
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
                (search || leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly) ? (
                  <EmptyState
                    icon={<Search className="w-10 h-10" />}
                    title="Sin resultados con estos filtros"
                    subtitle="Prueba a quitar algún filtro o cambia la búsqueda."
                    action={
                      <button
                        onClick={() => { setSearch(''); setLeagueFilter([]); setCountryFilter([]); setTierFilter([]); setConfederationFilter([]); setPriorityOnly(false); setHasNeedsOnly(false); setHasContactOnly(false) }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Limpiar filtros
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Building2 className="w-10 h-10" />}
                    title="No hay clubes todavía"
                    subtitle="Añade clubes para poder ofrecerles jugadores y registrar sus solicitudes."
                    action={
                      <button
                        onClick={() => setShowAddClub(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Añadir club
                      </button>
                    }
                  />
                )
              )}

              {/* FAB Añadir club — móvil */}
              <button
                onClick={() => setShowAddClub(true)}
                aria-label="Añadir club"
                className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            )
          })()}

          {/* ── SOLICITUDES TAB ── */}
          {tab === 'solicitudes' && (() => {
            const hasNeedsFilters = needsTierFilter.length > 0 || !!needsLeagueFilter || !!needsAgeFilter || !!positionFilter
            const needsActiveFilters = needsTierFilter.length + (needsLeagueFilter ? 1 : 0) + (needsAgeFilter ? 1 : 0) + (positionFilter ? 1 : 0)
            const needsFilterControls = (
              <>
              {/* Row 1: Tier chips + League select + Age select + clear */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Tier chips */}
                {(['A', 'B', 'C', 'D'] as LeagueTier[]).map(t => {
                  const cfg = TIER_CONFIG[t]
                  const active = needsTierFilter.includes(t)
                  return (
                    <button
                      key={t}
                      onClick={() => setNeedsTierFilter(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                      title={cfg.title}
                      className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-bold transition-colors ${
                        active
                          ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      Tier {t}
                    </button>
                  )
                })}

                {/* League select */}
                <select
                  value={needsLeagueFilter}
                  onChange={e => setNeedsLeagueFilter(e.target.value)}
                  className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600 bg-white"
                >
                  <option value="">Todas las ligas</option>
                  {needsLeagues.map(([league, count]) => (
                    <option key={league} value={league}>{league} ({count})</option>
                  ))}
                </select>

                {/* Age filter */}
                <select
                  value={needsAgeFilter}
                  onChange={e => setNeedsAgeFilter(e.target.value)}
                  className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600 bg-white"
                >
                  <option value="">Cualquier edad</option>
                  <option value="18">Sub-18</option>
                  <option value="21">Sub-21</option>
                  <option value="23">Sub-23</option>
                  <option value="25">Sub-25</option>
                  <option value="28">Sub-28</option>
                </select>

                {/* Clear filters */}
                {needsActiveFilters > 0 && (
                  <button
                    onClick={() => { setNeedsTierFilter([]); setNeedsLeagueFilter(''); setNeedsAgeFilter(''); setPositionFilter('') }}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    {needsActiveFilters} filtro{needsActiveFilters !== 1 ? 's' : ''}
                    <X className="w-3 h-3 ml-0.5 opacity-60" />
                  </button>
                )}
              </div>

              {/* Row 2: Position chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                <button
                  onClick={() => setPositionFilter('')}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !positionFilter ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas las posiciones
                </button>
                {allNeedsPositions.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPositionFilter(positionFilter === pos ? '' : pos)}
                    title={positionEs(pos) || undefined}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      positionFilter === pos ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              </>
            )
            const needsSortToggle = (
              <button
                onClick={() => setNeedsSort(s => s === 'recent' ? 'club' : 'recent')}
                title={needsSort === 'recent' ? 'Ordenado por más reciente' : 'Ordenado por club'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium bg-white border-slate-200 text-slate-600 hover:border-slate-300 transition-colors"
              >
                {needsSort === 'recent' ? '↓ Reciente' : 'A–Z Club'}
              </button>
            )
            return (
            <div className="max-w-5xl mx-auto">
              {/* Desktop: top row search + sort + add button */}
              <div className="hidden sm:flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar solicitud…"
                      className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  {needsSortToggle}
                </div>
                <button
                  onClick={() => setShowAddNeed(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir solicitud
                </button>
              </div>

              {/* Móvil: barra compacta búsqueda + orden + filtros */}
              <div className="flex sm:hidden items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar solicitud…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <button
                  onClick={() => setFilterSheet('solicitudes')}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    needsActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" /> Filtros
                  {needsActiveFilters > 0 && <span className="text-xs">({needsActiveFilters})</span>}
                </button>
              </div>

              <FilterSheet open={filterSheet === 'solicitudes'} onClose={() => setFilterSheet(null)} title="Filtros de solicitudes">
                <div className="flex items-center gap-2">{needsSortToggle}</div>
                {needsFilterControls}
              </FilterSheet>

              {/* Stats summary */}
              {clubs.some(c => c.needs.length > 0) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-slate-50 rounded-lg mb-3 text-xs text-slate-500">
                  <span><span className="font-semibold text-slate-700">{clubNeeds.length}</span> solicitudes{hasNeedsFilters ? ' (filtradas)' : ''}</span>
                  <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.map(({need}) => need.position)).size}</span> posiciones distintas</span>
                  <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.filter(({club}) => getClubTier(club.league, club.country) === 'A').map(({club}) => club.id)).size}</span> de clubes Tier A</span>
                  <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.map(({club}) => club.league)).size}</span> ligas</span>
                </div>
              )}

              {/* Desktop: Filter bar inline */}
              <div className="hidden sm:block space-y-2 mb-3">
                {needsFilterControls}
              </div>

              {clubNeeds.length === 0 ? (
                clubs.every(c => c.needs.length === 0) ? (
                  <EmptyState
                    icon={<AlertCircle className="w-10 h-10" />}
                    title="Ningún club tiene solicitudes registradas aún"
                    subtitle="Registra las posiciones que buscan los clubes para cruzarlas con tu cartera."
                    action={
                      <button
                        onClick={() => setShowAddNeed(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Añadir solicitud
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Search className="w-10 h-10" />}
                    title="Sin resultados para este filtro"
                    subtitle="Prueba a quitar algún filtro o cambia la búsqueda."
                  />
                )
              ) : (
                <>
                {/* ── MOBILE CARD VIEW (hidden sm+) ── */}
                <div className="sm:hidden space-y-2">
                  {clubNeeds.map(({ club, need }, i) => {
                    const tier = getClubTier(club.league, club.country)
                    const tierCfg = TIER_CONFIG[tier]
                    const offeredCount = negotiations.filter(n => {
                      if (n.clubId !== club.id || n.status === 'descartado') return false
                      if (n.needPosition) return n.needPosition === need.position
                      const p = players.find(pl => pl.id === n.playerId)
                      return p ? needMatchesPlayer(need.position, p.positions) : false
                    }).length
                    return (
                      <div
                        key={`${club.id}-mobile-${i}`}
                        className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer active:bg-slate-50"
                        onClick={() => onSelectClub?.(club.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-semibold">
                                <AlertCircle className="w-3 h-3 flex-shrink-0" />{need.position}
                              </span>
                              {need.ageMax && <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-600">Sub-{need.ageMax}</span>}
                            </div>
                            <div className="text-sm font-semibold text-slate-800">{club.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                              <span className="text-xs text-slate-500 truncate">{club.league ?? '—'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {offeredCount > 0 && (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                                {offeredCount} jugadores
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </div>
                        </div>
                        {(need.transferBudget || need.salaryBudget || need.notes) && (
                          <div className="text-xs text-slate-500 space-y-0.5">
                            {(need.transferBudget || need.salaryBudget) && (
                              <div className="flex gap-3">
                                {need.transferBudget && <span>Traspaso: <span className="text-slate-700 font-medium">{need.transferBudget}</span></span>}
                                {need.salaryBudget && <span>Salario: <span className="text-slate-700 font-medium">{need.salaryBudget}</span></span>}
                              </div>
                            )}
                            {need.notes && <div className="truncate text-slate-400">{need.notes}</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {clubNeeds.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">Sin resultados</div>
                  )}
                </div>

                {/* ── DESKTOP TABLE VIEW (hidden on mobile) ── */}
                <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-2 py-2.5 font-semibold w-[140px]">Posición</th>
                        <th className="text-left px-2 py-2.5 font-semibold w-[120px]">Club</th>
                        <th className="text-left px-2 py-2.5 font-semibold w-[130px]">Liga / Tier</th>
                        <th className="text-left px-2 py-2.5 font-semibold w-[60px]">Edad</th>
                        <th className="text-left px-2 py-2.5 font-semibold w-[140px]">Presupuesto</th>
                        <th className="text-left px-2 py-2.5 font-semibold">Notas</th>
                        <th className="text-left px-2 py-2.5 font-semibold w-[80px]">Añadida</th>
                        {currentProfile.is_admin && <th className="text-left px-2 py-2.5 font-semibold w-[36px]">Por</th>}
                        <th className="text-left px-2 py-2.5 font-semibold w-[90px]">Ofrecidos</th>
                        <th className="px-2 py-2.5 w-[80px]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clubNeeds.map(({ club, need }, i) => {
                        const needIndex = club.needs.indexOf(need)
                        const isEditing = editingNeed?.clubId === club.id && editingNeed?.index === needIndex
                        const tier = getClubTier(club.league, club.country)
                        const tierCfg = TIER_CONFIG[tier]
                        const offeredCount = negotiations.filter(n => {
                          if (n.clubId !== club.id || n.status === 'descartado') return false
                          if (n.needPosition) return n.needPosition === need.position
                          const p = players.find(pl => pl.id === n.playerId)
                          return p ? needMatchesPlayer(need.position, p.positions) : false
                        }).length
                        return (
                          <tr
                            key={`${club.id}-${i}`}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                            onClick={() => onSelectClub?.(club.id)}
                          >
                            {isEditing ? (
                              <td colSpan={9} className="px-3 py-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Editar — {club.name}</span>
                                  <button onClick={() => setEditingNeed(null)} className="ml-auto text-slate-300 hover:text-slate-500"><X className="w-3.5 h-3.5" /></button>
                                </div>
                                <NeedFormInline
                                  initial={need}
                                  onSave={async (updated) => {
                                    try {
                                      const withMeta = { ...updated, createdAt: need.createdAt, addedBy: need.addedBy }
                                      const newNeeds = club.needs.map((n, idx) => idx === needIndex ? withMeta : n)
                                      await onUpdateClub({ ...club, needs: newNeeds })
                                      setEditingNeed(null)
                                      showToast('Solicitud actualizada')
                                    } catch {
                                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                                    }
                                  }}
                                  onCancel={() => setEditingNeed(null)}
                                />
                              </td>
                            ) : (
                              <>
                                <td className="px-2 py-2">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-semibold">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{need.position}</span>
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); onSelectClub?.(club.id) }}
                                    className="font-medium text-slate-800 hover:text-blue-600 text-left text-xs transition-colors w-full truncate block"
                                    title={club.name}
                                  >
                                    {club.name}
                                  </button>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[11px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                                    <span className="text-xs text-slate-500 truncate">{club.league ?? '—'}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-xs text-slate-600">
                                  {need.ageMax ? <span className="bg-slate-100 px-1 py-0.5 rounded font-medium">-{need.ageMax}</span> : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {need.transferBudget || need.salaryBudget ? (
                                    <div className="flex flex-col gap-0.5">
                                      {need.transferBudget && <span className="text-xs text-slate-600 truncate" title={need.transferBudget}>T: {need.transferBudget}</span>}
                                      {need.salaryBudget && <span className="text-xs text-slate-600 truncate" title={need.salaryBudget}>S: {need.salaryBudget}</span>}
                                    </div>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-2 py-2 text-xs text-slate-400 truncate" title={need.notes ?? ''}>{need.notes || <span className="text-slate-300">—</span>}</td>
                                <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap">
                                  {need.createdAt
                                    ? new Date(need.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                {currentProfile.is_admin && (
                                  <td className="px-2 py-2 text-xs font-mono text-slate-400">
                                    {need.addedBy || <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                                  {offeredCount > 0 ? (
                                    <button
                                      onClick={e => { e.stopPropagation(); setSelectedNeed({ clubId: club.id, needIndex }); setSelectedEntryId(null); setSelectedClubId(null) }}
                                      className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap hover:bg-blue-100 transition-colors"
                                    >
                                      {offeredCount} jug.
                                    </button>
                                  ) : (
                                    <span className="text-slate-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <button
                                      onClick={e => { e.stopPropagation(); setEditingNeed({ clubId: club.id, index: needIndex }) }}
                                      aria-label="Editar solicitud"
                                      className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); setSelectedNeed({ clubId: club.id, needIndex }); setSelectedEntryId(null); setSelectedClubId(null) }}
                                      className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-1 py-1 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
                                    >
                                      <Plus className="w-3 h-3" /> Ofrecer
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}

              {/* FAB Añadir solicitud — móvil */}
              <button
                onClick={() => setShowAddNeed(true)}
                aria-label="Añadir solicitud"
                className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            )
          })()}

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
                if (pipelineMyOnly && neg.aisManager !== currentProfile.avatar) return false
                if (pipelineSearch && !player.name.toLowerCase().includes(pipelineSearch.toLowerCase())) return false
                if (pipelinePosFilter && !player.positions.some(p => p === pipelinePosFilter)) return false
                if (!pipelineMyOnly && pipelineGestorFilter && neg.aisManager !== pipelineGestorFilter) return false
                return true
              })

            const activeStatuses: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
            const closedStatuses: ClubNegotiation['status'][] = ['cerrado', 'descartado']
            const visibleStatuses = showClosedDeals ? [...activeStatuses, ...closedStatuses] : activeStatuses

            const totalActive = deals.filter(d => activeStatuses.includes(d.neg.status)).length
            const totalClosed = deals.filter(d => closedStatuses.includes(d.neg.status)).length

            const pipelineActiveFilters = (pipelineMyOnly ? 1 : 0) + (pipelinePosFilter ? 1 : 0) + (pipelineGestorFilter ? 1 : 0) + (showClosedDeals ? 1 : 0)
            const pipelineMiCola = (
              <button
                onClick={() => { setPipelineMyOnly(v => !v); setPipelineGestorFilter('') }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  pipelineMyOnly
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                👤 {pipelineMyOnly ? `Mis negs (${deals.length})` : 'Mis negs'}
              </button>
            )
            const pipelineFilterControls = (
              <>
                {pipelineMiCola}
                <select
                  value={pipelinePosFilter}
                  onChange={e => setPipelinePosFilter(e.target.value)}
                  className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                >
                  <option value="">Todas las posiciones</option>
                  {allPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {!pipelineMyOnly && allGestores.length > 0 && (
                  <select
                    value={pipelineGestorFilter}
                    onChange={e => setPipelineGestorFilter(e.target.value)}
                    className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                  >
                    <option value="">Todos los gestores</option>
                    {allGestores.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
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
              </>
            )
            // En móvil siempre vista lista; el kanban es inusable a 375px
            const usingListView = isMobile || pipelineListView
            return (
              <div className="-mx-4 -mb-4">
                {/* Desktop: Filter bar inline */}
                <div className="hidden sm:flex items-center gap-2 flex-wrap px-4 py-3 bg-white border-b border-slate-100">
                  {pipelineMiCola}

                  <div className="w-px h-5 bg-slate-200" />

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
                  {!pipelineMyOnly && allGestores.length > 0 && (
                    <select
                      value={pipelineGestorFilter}
                      onChange={e => setPipelineGestorFilter(e.target.value)}
                      className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                    >
                      <option value="">Todos los gestores</option>
                      {allGestores.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-400">{totalActive} activos · {totalClosed} cerrados</span>
                    {/* Lista / Kanban toggle — oculto en móvil */}
                    <button
                      onClick={() => setPipelineListView(v => !v)}
                      title={pipelineListView ? 'Ver kanban' : 'Ver lista'}
                      className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                        pipelineListView
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {pipelineListView
                        ? <><LayoutGrid className="w-3.5 h-3.5" /> Kanban</>
                        : <><List className="w-3.5 h-3.5" /> Lista</>}
                    </button>
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

                {/* Móvil: barra compacta búsqueda + Filtros */}
                <div className="flex sm:hidden items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={pipelineSearch}
                      onChange={e => setPipelineSearch(e.target.value)}
                      placeholder="Jugador…"
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <button
                    onClick={() => setFilterSheet('pipeline')}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      pipelineActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" /> Filtros
                    {pipelineActiveFilters > 0 && <span className="text-xs">({pipelineActiveFilters})</span>}
                  </button>
                </div>

                <FilterSheet open={filterSheet === 'pipeline'} onClose={() => setFilterSheet(null)} title="Filtros de pipeline">
                  {pipelineFilterControls}
                  <p className="text-xs text-slate-400">{totalActive} activos · {totalClosed} cerrados</p>
                </FilterSheet>

                {/* ── VISTA LISTA ── */}
                {usingListView ? (
                  <div className="max-w-5xl mx-auto p-4">
                    {visibleStatuses.map(status => {
                      const col = deals.filter(d => d.neg.status === status)
                      if (col.length === 0) return null
                      const cfg = STATUS_CONFIG[status]
                      return (
                        <div key={status} className="mb-6">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2 w-fit ${cfg.color}`}>
                            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            <span className="text-xs font-semibold">{cfg.label}</span>
                            <span className="text-xs opacity-60 font-mono">{col.length}</span>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {col.map(({ neg, player, club, entry }, i) => {
                              if (!player || !club) return null
                              const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                              const stale = activeStatuses.includes(neg.status) && daysSince(neg.updatedAt) > 7
                              const daysAgo = daysSince(neg.updatedAt)
                              return (
                                <div
                                  key={neg.id}
                                  onClick={() => setEditingNeg(neg)}
                                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${i > 0 ? 'border-t border-slate-100' : ''} ${stale ? 'border-l-4 border-l-orange-400' : ''}`}
                                >
                                  <Avatar name={player.name} photo={player.photo} size="xs" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-slate-800">{player.name}</span>
                                    <span className="text-xs text-slate-400 ml-2">{player.positions[0]}</span>
                                  </div>
                                  <div className="text-sm text-slate-600 truncate w-24 sm:w-36 flex-shrink-0">{club.name}</div>
                                  {neg.aisManager && (
                                    <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{neg.aisManager}</span>
                                  )}
                                  {pcfg && (
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>
                                  )}
                                  <div className="text-right flex-shrink-0 w-20">
                                    <span className={`text-[11px] ${stale ? 'text-orange-500 font-semibold' : 'text-slate-400'}`}>
                                      {stale ? `⏰ ${daysAgo}d` : daysAgo < 999 ? `${daysAgo}d` : '—'}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {deals.filter(d => visibleStatuses.includes(d.neg.status)).length === 0 && (
                      <div className="text-center text-sm text-slate-400 py-16">No hay negociaciones</div>
                    )}
                  </div>
                ) : (
                  /* ── VISTA KANBAN ── */
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
                                const stale = activeStatuses.includes(neg.status) && daysSince(neg.updatedAt) > 7
                                return (
                                  <div
                                    key={neg.id}
                                    onClick={() => setEditingNeg(neg)}
                                    className={`bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${
                                      stale ? 'border-orange-300 border-l-4 border-l-orange-400' : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {/* Player row */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <Avatar name={player.name} photo={player.photo} size="xs" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-slate-800 truncate">{player.name}</div>
                                        <div className="text-[11px] text-slate-400">{player.positions[0]}</div>
                                      </div>
                                      {pcfg && (
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>
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
                                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                      {neg.aisManager && (
                                        <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                          {neg.aisManager}
                                        </span>
                                      )}
                                      {stale && (
                                        <span className="text-[11px] text-orange-500 font-semibold">⏰ {daysSince(neg.updatedAt)}d sin cambios</span>
                                      )}
                                      {neg.notes && !stale && (
                                        <p className="text-[11px] text-slate-400 line-clamp-2 w-full">{neg.notes}</p>
                                      )}
                                    </div>
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
                )}
              </div>
            )
          })()}

          {/* ── OPORTUNIDADES TAB ── */}
          {tab === 'oportunidades' && (() => {
            const CAP = 200
            const shown = filteredOpportunities.slice(0, CAP)
            return (
              <div className="max-w-5xl mx-auto">
                {/* Intro + filtros */}
                <div className="mb-3">
                  <p className="text-xs text-slate-500 mb-2">
                    Cruces jugador → club con necesidad compatible (posición y edad) que <strong>aún no has ofrecido</strong>.
                    Ordenado por prioridad del jugador y nivel del club.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={oppSearch}
                        onChange={e => setOppSearch(e.target.value)}
                        placeholder="Buscar jugador o club…"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {(['A', 'B', 'C', 'D'] as const).map(pr => (
                        <button
                          key={pr}
                          onClick={() => setOppPriority(oppPriority === pr ? '' : pr)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            oppPriority === pr ? `${PRIORITY_CONFIG[pr].bg} ${PRIORITY_CONFIG[pr].text} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title={`Prioridad ${pr}`}
                        >
                          {pr}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-slate-400 ml-auto">
                      {filteredOpportunities.length} oportunidad{filteredOpportunities.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  {/* Segunda fila de filtros */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <select
                      value={oppPos}
                      onChange={e => setOppPos(e.target.value)}
                      aria-label="Filtrar por posición"
                      className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium cursor-pointer ${oppPos ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <option value="">Posición: todas</option>
                      {POSITIONS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.es}</option>)}
                    </select>
                    <select
                      value={oppLeague}
                      onChange={e => setOppLeague(e.target.value)}
                      aria-label="Filtrar por liga"
                      className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium cursor-pointer max-w-[160px] ${oppLeague ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <option value="">Liga: todas</option>
                      {oppLeagues.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button
                      onClick={() => setOppMineOnly(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${oppMineOnly ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <Users className="w-3.5 h-3.5" /> Solo mías
                    </button>
                    {(oppPos || oppLeague || oppMineOnly || oppPriority || oppSearch) && (
                      <button
                        onClick={() => { setOppPos(''); setOppLeague(''); setOppMineOnly(false); setOppPriority(''); setOppSearch('') }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-1"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                {filteredOpportunities.length === 0 ? (
                  <EmptyState
                    icon={<TrendingUp className="w-10 h-10" />}
                    title="Sin oportunidades nuevas"
                    subtitle="Cuando haya jugadores de tu cartera que encajen con necesidades de clubes y no estén ofrecidos, aparecerán aquí."
                  />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {shown.map(({ player, entry, club, need, tier, age }) => {
                      const key = `${player.id}|${club.id}`
                      const prCfg = PRIORITY_CONFIG[entry.priority]
                      const tierCfg = TIER_CONFIG[tier]
                      const offering = offeringOppKey === key
                      return (
                        <div key={key} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                          <button
                            onClick={() => onSelectClub?.(club.id)}
                            className="flex-1 min-w-0 flex items-center gap-2 text-left"
                          >
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${prCfg.bg} ${prCfg.text}`}>{entry.priority}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
                                <span className="text-[11px] text-slate-400 flex-shrink-0">{player.positions[0]}{age !== null ? ` · ${age}a` : ''}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 min-w-0">
                                <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                                <span className="font-medium text-slate-700 truncate">{club.name}</span>
                                {club.league && <span className="text-slate-400 truncate hidden sm:inline">· {club.league}</span>}
                                <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                                  {need.position}{need.ageMax ? ` ·Sub-${need.ageMax}` : ''}
                                </span>
                              </div>
                            </div>
                          </button>
                          <button
                            disabled={offering || dismissingOppKey === key}
                            onClick={async () => {
                              setOfferingOppKey(key)
                              try {
                                await onCreateNegotiation({ playerId: player.id, clubId: club.id, needPosition: need.position, status: 'pendiente', aisManager: currentProfile.avatar })
                                showToast(`${player.name} ofrecido a ${club.name}`)
                              } catch {
                                showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                              } finally {
                                setOfferingOppKey(null)
                              }
                            }}
                            className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 px-3 py-2 sm:py-1.5 rounded-lg"
                          >
                            {offering ? <BtnSpinner /> : <Plus className="w-3.5 h-3.5" />}
                            Ofrecer
                          </button>
                          <button
                            disabled={offering || dismissingOppKey === key}
                            onClick={async () => {
                              setDismissingOppKey(key)
                              try {
                                await onCreateNegotiation({ playerId: player.id, clubId: club.id, needPosition: need.position, status: 'descartado', aisManager: currentProfile.avatar })
                                showToast('Oportunidad descartada')
                              } catch {
                                showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                              } finally {
                                setDismissingOppKey(null)
                              }
                            }}
                            title="Descartar: no encaja"
                            aria-label="Descartar oportunidad"
                            className="flex-shrink-0 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-60 p-2 rounded-lg"
                          >
                            {dismissingOppKey === key ? <span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )
                    })}
                    {filteredOpportunities.length > CAP && (
                      <div className="px-3 py-2.5 text-center text-xs text-slate-400">
                        Mostrando las primeras {CAP} de {filteredOpportunities.length}. Afina con la búsqueda o la prioridad.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── ENCARGADOS TAB ── */}
          {tab === 'encargados' && (() => {
            const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

            const grouped: Record<string, DistributionEntry[]> = {}
            for (const entry of seasonEntries) {
              // Priority D never shown in encargados view
              if (entry.priority === 'D') continue
              // Intermediar (hiddenFromManagement) players not shown
              const entryPlayer = players.find(p => p.id === entry.playerId)
              if (entryPlayer?.hiddenFromManagement) continue
              const key = entry.aisManager ?? '__sin__'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(entry)
            }
            Object.values(grouped).forEach(g =>
              g.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
            )

            const managerProfiles = profiles
              .filter(p => grouped[p.avatar])
              .sort((a, b) => (grouped[b.avatar]?.length ?? 0) - (grouped[a.avatar]?.length ?? 0))

            const STATUS_COLORS_E: Record<string, string> = {
              negociando: 'bg-amber-100 text-amber-700',
              interesado: 'bg-blue-100 text-blue-700',
              ofrecido:   'bg-slate-100 text-slate-600',
              cerrado:    'bg-green-100 text-green-700',
            }
            const PRIORITY_BADGE: Record<string, string> = {
              A: 'bg-red-100 text-red-700',
              B: 'bg-amber-100 text-amber-700',
              C: 'bg-slate-100 text-slate-500',
              D: 'bg-orange-100 text-orange-700',
            }

            const renderRow = (entry: DistributionEntry) => {
              const player = players.find(p => p.id === entry.playerId)
              if (!player) return null
              const activeNegs = negotiations.filter(n =>
                n.playerId === entry.playerId && !['descartado'].includes(n.status)
              )
              const topStatus = activeNegs.find(n => n.status === 'negociando')?.status
                ?? activeNegs.find(n => n.status === 'interesado')?.status
                ?? activeNegs.find(n => n.status === 'ofrecido')?.status
                ?? activeNegs.find(n => n.status === 'cerrado')?.status
              const badge = contractBadge(player.clubContract?.endDate)

              return (
                <div
                  key={entry.id}
                  onClick={() => onSelectPlayer?.(player.id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  <Avatar name={player.name} photo={player.photo} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 text-sm">{player.name}</span>
                      <span className="text-xs text-slate-400">{player.positions[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[entry.priority]}`}>
                        {entry.priority}
                      </span>
                      {entry.condition && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{entry.condition}</span>
                      )}
                      {badge && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                      )}
                      {topStatus && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS_E[topStatus] ?? ''}`}>
                          {topStatus.charAt(0).toUpperCase() + topStatus.slice(1)}
                        </span>
                      )}
                      {activeNegs.length > 0 && (
                        <span className="text-xs text-slate-400">{activeNegs.length} club{activeNegs.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </div>
              )
            }

            const renderSection = (
              avatar: string,
              name: string,
              entries: DistributionEntry[],
              muted = false
            ) => (
              <div key={avatar} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    muted
                      ? 'bg-slate-200 text-slate-400'
                      : 'bg-primary text-white'
                  }`}>
                    {avatar === '__sin__' ? '?' : avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${muted ? 'text-slate-400' : 'text-slate-800'}`}>{name}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {entries.length} jugador{entries.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                {/* Player rows */}
                <div>
                  {entries.map(renderRow)}
                </div>
              </div>
            )

            // ── Resumen por encargado (CLUBES) ──────────────────────
            const STALE_DAYS = 7
            const ACTIVE_ST: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
            const daysSince = (iso?: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null
            const clubStats = profiles.map(p => {
              const myClubIds = new Set(clubs.filter(c => c.aisManager === p.avatar).map(c => c.id))
              const activeNegs = negotiations.filter(n => myClubIds.has(n.clubId) && ACTIVE_ST.includes(n.status))
              const stale = activeNegs.filter(n => (daysSince(n.updatedAt) ?? 0) > STALE_DAYS)
              return { profile: p, clubs: myClubIds.size, active: activeNegs.length, stale: stale.length }
            }).filter(s => s.clubs > 0)
              .sort((a, b) => b.clubs - a.clubs)
            const sinEncargadoClubs = clubs.filter(c => !c.aisManager).length
            const totalStale = clubStats.reduce((sum, s) => sum + s.stale, 0)
            const goToClubs = (avatar: string) => { setClubManagerFilter(avatar); setTab('clubes') }

            // ── Salud de datos ──────────────────────────────────
            const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
            const clubsSinEnc = clubs.filter(c => !c.aisManager)
            // Duplicados por nombre normalizado
            const byName = new Map<string, Club[]>()
            clubs.forEach(c => {
              const k = strip(c.name)
              if (!byName.has(k)) byName.set(k, [])
              byName.get(k)!.push(c)
            })
            const dupGroups = Array.from(byName.values()).filter(g => g.length > 1)
            // Necesidades con posición no estándar
            const badNeeds: Array<{ club: Club; pos: string }> = []
            clubs.forEach(c => (c.needs ?? []).forEach(n => {
              if (n.position && !normalizePosition(n.position)) badNeeds.push({ club: c, pos: n.position })
            }))
            // Necesidades antiguas (>180 días)
            const OLD_DAYS = 180
            const oldNeeds: Array<{ club: Club; pos: string; days: number }> = []
            clubs.forEach(c => (c.needs ?? []).forEach(n => {
              const d = n.createdAt ? Math.floor((Date.now() - new Date(n.createdAt).getTime()) / 86_400_000) : null
              if (d !== null && d > OLD_DAYS) oldNeeds.push({ club: c, pos: n.position, days: d })
            }))
            oldNeeds.sort((a, b) => b.days - a.days)

            const HealthCard = ({ id, label, count, tone, onAction, actionLabel }: {
              id: 'sin' | 'dup' | 'pos' | 'old'; label: string; count: number; tone: string; onAction?: () => void; actionLabel?: string
            }) => (
              <div className={`rounded-xl border ${count > 0 ? tone : 'border-slate-200 bg-white'} overflow-hidden`}>
                <button
                  onClick={() => setHealthOpen(healthOpen === id ? null : id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-lg font-bold tabular-nums">{count}</span>
                  <span className="text-sm font-medium text-slate-700 flex-1 min-w-0">{label}</span>
                  {onAction && count > 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); onAction() }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
                    >
                      {actionLabel}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${healthOpen === id ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )

            return (
              <div className="max-w-5xl mx-auto space-y-6">
                {/* Salud de datos (solo admin) */}
                {currentProfile.is_admin && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Salud de datos</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <HealthCard id="sin" label="Clubes sin encargado" count={clubsSinEnc.length} tone="border-amber-200 bg-amber-50"
                        onAction={() => goToClubs('__sin__')} actionLabel="Repartir →" />
                      <HealthCard id="dup" label="Clubes posiblemente duplicados" count={dupGroups.length} tone="border-orange-200 bg-orange-50" />
                      <HealthCard id="pos" label="Necesidades con posición no estándar" count={badNeeds.length} tone="border-red-200 bg-red-50" />
                      <HealthCard id="old" label={`Necesidades antiguas (>${OLD_DAYS}d)`} count={oldNeeds.length} tone="border-slate-200 bg-slate-50" />
                    </div>

                    {/* Detalle desplegable */}
                    {healthOpen === 'dup' && dupGroups.length > 0 && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                        {dupGroups.map((g, i) => (
                          <div key={i} className="px-3 py-2">
                            <p className="text-xs font-semibold text-slate-700 mb-1">{g[0].name} ({g.length})</p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.map(c => (
                                <button key={c.id} onClick={() => onSelectClub?.(c.id)}
                                  className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                  {c.league ?? 'sin liga'}{c.aisManager ? ` · ${c.aisManager}` : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {healthOpen === 'pos' && badNeeds.length > 0 && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                        {badNeeds.slice(0, 100).map((b, i) => (
                          <button key={i} onClick={() => onSelectClub?.(b.club.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <span className="text-sm text-slate-700 truncate flex-1">{b.club.name}</span>
                            <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded flex-shrink-0">“{b.pos}”</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {healthOpen === 'old' && oldNeeds.length > 0 && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                        {oldNeeds.slice(0, 100).map((o, i) => (
                          <button key={i} onClick={() => onSelectClub?.(o.club.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <span className="text-sm text-slate-700 truncate flex-1">{o.club.name}</span>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">{o.pos} · {Math.floor(o.days / 30)}m</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {healthOpen === 'sin' && (
                      <p className="mt-2 text-xs text-slate-500">
                        Pulsa “Repartir →” para ir a la lista de clubes filtrada por “Sin encargado” y asignarlos desde el círculo de siglas de cada tarjeta.
                      </p>
                    )}
                  </div>
                )}

                {/* Resumen por encargado (clubes) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-700">Resumen por encargado · Clubes</h3>
                    {totalStale > 0 && (
                      <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {totalStale} propuesta{totalStale !== 1 ? 's' : ''} sin mover &gt;{STALE_DAYS}d
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[460px]">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-2 font-semibold">Encargado</th>
                          <th className="px-3 py-2 font-semibold text-right">Clubes</th>
                          <th className="px-3 py-2 font-semibold text-right">Propuestas activas</th>
                          <th className="px-4 py-2 font-semibold text-right">Sin mover &gt;{STALE_DAYS}d</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clubStats.length === 0 && (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-xs">Aún no hay clubes con encargado asignado.</td></tr>
                        )}
                        {clubStats.map(s => (
                          <tr
                            key={s.profile.id}
                            onClick={() => goToClubs(s.profile.avatar)}
                            className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                            title={`Ver los clubes de ${s.profile.name}`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{s.profile.avatar}</span>
                                <span className="font-medium text-slate-700 truncate">{s.profile.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{s.clubs}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{s.active}</td>
                            <td className="px-4 py-2.5 text-right">
                              {s.stale > 0
                                ? <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">⏰ {s.stale}</span>
                                : <span className="text-slate-300">0</span>}
                            </td>
                          </tr>
                        ))}
                        {sinEncargadoClubs > 0 && (
                          <tr
                            onClick={() => goToClubs('__sin__')}
                            className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                            title="Ver clubes sin encargado"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0">?</span>
                                <span className="font-medium text-slate-400">Sin encargado</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-400">{sinEncargadoClubs}</td>
                            <td className="px-3 py-2.5 text-right text-slate-300">—</td>
                            <td className="px-4 py-2.5 text-right text-slate-300">—</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Móvil: tarjetas por encargado */}
                  <div className="sm:hidden space-y-2">
                    {clubStats.length === 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-slate-400 text-xs">Aún no hay clubes con encargado asignado.</div>
                    )}
                    {clubStats.map(s => (
                      <div
                        key={s.profile.id}
                        onClick={() => goToClubs(s.profile.avatar)}
                        className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 cursor-pointer active:bg-slate-50"
                      >
                        <span className="w-9 h-9 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{s.profile.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-700 truncate">{s.profile.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Clubes: {s.clubs} · Activas: {s.active} · {s.stale > 0 ? <span className="text-orange-600 font-medium">Paradas: {s.stale}</span> : <>Paradas: 0</>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      </div>
                    ))}
                    {sinEncargadoClubs > 0 && (
                      <div
                        onClick={() => goToClubs('__sin__')}
                        className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 cursor-pointer active:bg-slate-50"
                      >
                        <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center flex-shrink-0">?</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-400">Sin encargado</div>
                          <div className="text-xs text-slate-400 mt-0.5">Clubes: {sinEncargadoClubs} · Activas: — · Paradas: —</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1.5">Pulsa una fila para ver los clubes de esa persona.</p>
                </div>

                {/* Jugadores por encargado */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Jugadores por encargado</h3>
                  {managerProfiles.length === 0 && !grouped['__sin__'] && (
                    <EmptyState
                      icon={<Users className="w-10 h-10" />}
                      title="No hay jugadores con encargado asignado"
                      subtitle="Asigna un encargado a cada jugador desde la pestaña Jugadores."
                    />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    {managerProfiles.map(p =>
                      renderSection(p.avatar, p.name, grouped[p.avatar] ?? [])
                    )}

                    {grouped['__sin__'] &&
                      renderSection('__sin__', 'Sin encargado', grouped['__sin__'], true)
                    }
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── SIDE PANEL ── */}
        {hasPanel && (
          <div className={`w-full flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto fixed sm:static inset-0 sm:inset-auto z-30 transition-[width] duration-200 ${
            panelExpanded ? 'sm:w-[560px] lg:w-[55%] xl:w-[60%]' : 'sm:w-[380px]'
          }`}>
            {selectedEntry && (() => {
              const player = players.find(p => p.id === selectedEntry.playerId)!
              const playerNegs = negotiations.filter(n => n.playerId === selectedEntry.playerId)
              const cfg = PRIORITY_CONFIG[selectedEntry.priority]
              return (
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <Avatar name={player.name} photo={player.photo} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{player.name}</div>
                      <div className="text-xs text-slate-500">{player.positions[0]}</div>
                    </div>
                    <PanelExpandBtn />
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
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setEditingEntry(selectedEntry)}
                          className="p-2 sm:p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                          title="Editar"
                          aria-label="Editar entrada de distribución"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteEntryId(selectedEntry.id)}
                          className="p-2 sm:p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50"
                          title="Quitar de distribución"
                          aria-label="Quitar de distribución"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {selectedEntry.notes && (
                      <p className="text-xs text-slate-500 mt-2">{selectedEntry.notes}</p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    {(() => {
                      const panelGestores = Array.from(new Set(playerNegs.map(n => n.aisManager).filter(Boolean))) as string[]
                      const visibleNegs = playerPanelGestorFilter
                        ? playerNegs.filter(n => n.aisManager === playerPanelGestorFilter)
                        : playerNegs
                      return (<>
                    <div className="flex items-center justify-between mb-2">
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
                    {panelGestores.length > 1 && (
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        <button onClick={() => setPlayerPanelGestorFilter('')} className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${!playerPanelGestorFilter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>Todos</button>
                        {panelGestores.map(g => (
                          <button key={g} onClick={() => setPlayerPanelGestorFilter(playerPanelGestorFilter === g ? '' : g)} className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${playerPanelGestorFilter === g ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{g}</button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {visibleNegs.map(neg => {
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
                              aria-label="Editar negociación"
                              className="ml-auto p-2 sm:p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
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
                    </>)})()}
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0 space-y-2 sticky bottom-0 bg-white safe-area-bottom">
                    {/* Close — mobile only */}
                    <button
                      onClick={closePanel}
                      className="sm:hidden w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={() => setConfirmDeleteEntryId(selectedEntry.id)}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar de distribución
                    </button>
                  </div>
                </div>
              )
            })()}

            {selectedNeed && (() => {
              const club = clubs.find(c => c.id === selectedNeed.clubId)
              if (!club) return null
              const need = club.needs[selectedNeed.needIndex]
              if (!need) return null
              const tier = getClubTier(club.league, club.country)
              const tierCfg = TIER_CONFIG[tier]
              const offeredToClub = negotiations.filter(n => n.clubId === club.id)
              // Negs linked to this specific need (by needPosition when set, fallback to position matching for old data)
              const offeredForNeed = offeredToClub.filter(neg => {
                if (neg.needPosition) return neg.needPosition === need.position
                const p = players.find(pl => pl.id === neg.playerId)
                return p && needMatchesPlayer(need.position, p.positions)
              })
              const offeredForNeedPlayerIds = new Set(offeredForNeed.map(n => n.playerId))
              // Jugadores con alguna negociación ya cerrada → no sugerir
              const closedPlayerIds = new Set(negotiations.filter(n => n.status === 'cerrado').map(n => n.playerId))
              const suggestedPlayers = players.filter(p => {
                if (offeredForNeedPlayerIds.has(p.id)) return false
                if (!entries.some(e => e.playerId === p.id)) return false
                if (closedPlayerIds.has(p.id)) return false                 // ya cerrado en algún club
                const yr = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN
                if (!isNaN(yr) && yr > 2009) return false                   // demasiado joven (>2009)
                return needMatchesPlayer(need.position, p.positions)
              })
              return (
                <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-semibold">
                          <AlertCircle className="w-3 h-3" />{positionLabel(need.position)}
                        </span>
                        {need.ageMax && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Sub-{need.ageMax}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                        <span className={`text-[11px] font-bold px-1 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                        <span className="font-medium text-slate-700">{club.name}</span>
                        {club.league && <span className="text-slate-400">· {club.league}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => { onSelectClub?.(club.id); closePanel() }}
                      className="p-2 sm:p-1 text-slate-400 hover:text-slate-600 flex-shrink-0"
                      title="Abrir ficha del club"
                      aria-label="Abrir ficha del club"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Need budget/notes row */}
                  {(need.transferBudget || need.salaryBudget || need.notes) && (
                    <div className="px-4 py-2 bg-amber-50/40 border-b border-slate-100 flex flex-wrap gap-2">
                      {need.transferBudget && <span className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded">Traspaso: {need.transferBudget}</span>}
                      {need.salaryBudget && <span className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">Salario: {need.salaryBudget}</span>}
                      {need.notes && <span className="text-xs text-slate-500 italic">{need.notes}</span>}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">

                    {/* Offered players for this specific position */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Ofrecidos · {positionLabel(need.position)} ({offeredForNeed.length})
                        </span>
                        <button
                          onClick={() => setShowAddNeg({ clubId: club.id, needPosition: need.position })}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" /> Ofrecer
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {offeredForNeed.map(neg => {
                          const p = players.find(pl => pl.id === neg.playerId)
                          if (!p) return null
                          const scfg = STATUS_CONFIG[neg.status]
                          const entry = entries.find(e => e.playerId === p.id)
                          const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                          return (
                            <div key={neg.id} className="bg-slate-50 rounded-lg p-2.5 flex items-center gap-2">
                              <Avatar name={p.name} photo={p.photo} size="xs" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                                  {pcfg && <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${scfg.color}`}>{scfg.label}</span>
                              </div>
                              <button onClick={() => setEditingNeg(neg)} aria-label="Editar negociación" className="p-2 sm:p-1 text-slate-300 hover:text-slate-500 flex-shrink-0">
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        })}
                        {offeredForNeed.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                            Ningún jugador ofrecido para {need.position} aún
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Suggested players from distribution */}
                    {suggestedPlayers.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                          Disponibles en cartera ({suggestedPlayers.length})
                        </span>
                        <div className="space-y-1.5">
                          {suggestedPlayers.map(p => {
                            const entry = entries.find(e => e.playerId === p.id)
                            const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                            return (
                              <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2 hover:border-slate-300 transition-colors">
                                <Avatar name={p.name} photo={p.photo} size="xs" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                                    {pcfg && <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                                  </div>
                                  <div className="text-xs text-slate-400">{p.positions[0]}</div>
                                </div>
                                <button
                                  onClick={async () => {
                                    try {
                                      await onCreateNegotiation({ playerId: p.id, clubId: club.id, needPosition: need.position, status: 'pendiente' })
                                      showToast(`${p.name} ofrecido a ${club.name}`)
                                    } catch {
                                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                                    }
                                  }}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2 sm:py-1 rounded hover:bg-blue-50 transition-colors flex-shrink-0"
                                >
                                  <Plus className="w-3 h-3" /> Ofrecer
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {suggestedPlayers.length === 0 && offeredForNeed.length > 0 && (
                      <p className="text-xs text-slate-400 text-center">
                        Todos los jugadores de {need.position} ya están ofrecidos a este club
                      </p>
                    )}
                  </div>
                  {/* Close — mobile only */}
                  <div className="sm:hidden flex-shrink-0 px-4 py-3 border-t border-slate-100 safe-area-bottom sticky bottom-0 bg-white">
                    <button onClick={closePanel} className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                      Cerrar
                    </button>
                  </div>
                </div>
              )
            })()}

            {selectedClub && (() => {
              const clubNegsPanel = negotiations.filter(n => n.clubId === selectedClub.id)
              // when opened from a solicitud, filter by needPosition or fall back to position matching for old data
              const displayedNegs = selectedNeedPosition
                ? clubNegsPanel.filter(neg => {
                    if (neg.needPosition) return neg.needPosition === selectedNeedPosition
                    const p = players.find(pl => pl.id === neg.playerId)
                    return p && needMatchesPlayer(selectedNeedPosition, p.positions)
                  })
                : clubNegsPanel
              return (
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{selectedClub.name}</div>
                      <div className="text-xs text-slate-500">{selectedClub.league}</div>
                    </div>
                    <button
                      onClick={() => { onSelectClub?.(selectedClub.id); closePanel() }}
                      aria-label="Abrir ficha del club"
                      title="Abrir ficha del club"
                      className="p-2 sm:p-1 text-slate-400 hover:text-slate-600"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingClub(selectedClub)} aria-label="Editar club" className="p-2 sm:p-1 text-slate-400 hover:text-slate-600">
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
                            <span className="font-medium">{positionLabel(need.position)}</span>
                            {need.ageMax && <span>· sub-{need.ageMax}</span>}
                            {need.transferBudget && <span>· {need.transferBudget}</span>}
                            {need.notes && <span className="text-slate-400">· {need.notes}</span>}
                            <button
                              className="ml-auto p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0"
                              title="Eliminar solicitud"
                              aria-label="Eliminar solicitud"
                              onClick={async () => {
                                try {
                                  await onUpdateClub({ ...selectedClub, needs: selectedClub.needs.filter((_, idx) => idx !== i) })
                                  showToast('Solicitud eliminada')
                                } catch {
                                  showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
                                }
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
                            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
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
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                                {neg.needPosition && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                    {neg.needPosition}
                                  </span>
                                )}
                                {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                              </div>
                              {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                            </div>
                            <button
                              onClick={() => setEditingNeg(neg)}
                              aria-label="Editar negociación"
                              className="p-2 sm:p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
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
                        onClick={() => setConfirmDeleteClubId(selectedClub.id)}
                        className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar club
                      </button>
                    </div>
                  )}
                  {/* Close — mobile only */}
                  <div className="sm:hidden flex-shrink-0 px-4 py-3 border-t border-slate-100 safe-area-bottom sticky bottom-0 bg-white">
                    <button onClick={closePanel} className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                      Cerrar
                    </button>
                  </div>
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
          onCreatePlayer={onCreatePlayer}
          onSave={async (data) => {
            try {
              const saved = await onCreateEntry(data)
              setSelectedEntryId(saved.id)
              setShowAddPlayer(false)
              showToast('Jugador añadido a distribución')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {showAddClub && (
        <AddClubModal
          leagueOptions={sortedLeagues.map(l => ({ league: l.league, country: l.country }))}
          profiles={profiles}
          currentProfileAvatar={currentProfile.avatar}
          onClose={() => setShowAddClub(false)}
          onSave={async (data) => {
            try {
              const saved = await onCreateClub(data)
              setSelectedClubId(saved.id)
              setShowAddClub(false)
              showToast('Club creado correctamente')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
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
          fixedNeedPosition={showAddNeg.needPosition}
          profiles={profiles}
          currentProfileAvatar={currentProfile.avatar}
          onClose={() => setShowAddNeg(null)}
          onSave={async (data) => {
            try {
              await onCreateNegotiation(data)
              setShowAddNeg(null)
              showToast('Negociación creada')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (data) => {
            try {
              await onUpdateEntry({ ...editingEntry, ...data })
              setEditingEntry(null)
              showToast('Cambios guardados')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {editingClub && (
        <EditClubModal
          club={editingClub}
          leagueOptions={sortedLeagues.map(l => l.league)}
          profiles={profiles}
          onClose={() => setEditingClub(null)}
          onSave={async (data) => {
            try {
              await onUpdateClub({ ...editingClub, ...data })
              setEditingClub(null)
              showToast('Cambios guardados')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {editingNeg && (
        <EditNegotiationModal
          neg={editingNeg}
          clubs={clubs}
          players={players}
          currentProfile={currentProfile}
          profiles={profiles}
          onClose={() => setEditingNeg(null)}
          onSave={async (data) => {
            try {
              await onUpdateNegotiation({ ...editingNeg, ...data })
              setEditingNeg(null)
              showToast('Cambios guardados')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
          onSaveUpdate={async (update) => {
            try {
              const updated = { ...editingNeg, updates: [...(editingNeg.updates ?? []), update] }
              await onUpdateNegotiation(updated)
              setEditingNeg(updated)
              showToast('Nota guardada')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
          onDelete={async () => {
            try {
              await onDeleteNegotiation(editingNeg.id)
              setEditingNeg(null)
              showToast('Negociación eliminada')
            } catch {
              showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
            }
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
            try {
              const enriched = { ...need, createdAt: new Date().toISOString(), addedBy: currentProfile.avatar }
              await onUpdateClub({ ...club, needs: [...club.needs, enriched] })
              setShowAddNeed(false)
              showToast('Solicitud añadida')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {bulkAssignPlayerId && (
        <BulkAssignModal
          clubs={clubs}
          existingNegotiations={negotiations.filter(n => n.playerId === bulkAssignPlayerId)}
          onClose={() => setBulkAssignPlayerId(null)}
          onSave={async (clubIds) => {
            try {
              await Promise.all(
                clubIds.map(clubId => onCreateNegotiation({ playerId: bulkAssignPlayerId, clubId, status: 'pendiente' }))
              )
              setBulkAssignPlayerId(null)
              showToast(`${clubIds.length} club${clubIds.length !== 1 ? 's' : ''} asignado${clubIds.length !== 1 ? 's' : ''}`)
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {/* Manager dropdown — fixed to escape overflow:hidden on cards */}
      {openManagerDropId && managerDropPos && (() => {
        const entry = entries.find(e => e.id === openManagerDropId)
        if (!entry) return null
        return (
          <div
            className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px] max-w-[calc(100vw-2rem)] max-h-[50vh] overflow-y-auto"
            style={{ top: managerDropPos.top, right: managerDropPos.right }}
            onClick={e => e.stopPropagation()}
          >
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={async () => {
                  try {
                    await onUpdateEntry({ ...entry, aisManager: p.avatar })
                  } catch {
                    showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                  }
                  setOpenManagerDropId(null); setManagerDropPos(null)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${
                  entry.aisManager === p.avatar ? 'font-semibold text-blue-700' : 'text-slate-700'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {p.avatar}
                </span>
                {p.name.split(' ')[0]}
              </button>
            ))}
            {entry.aisManager && (
              <>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={async () => {
                    try {
                      await onUpdateEntry({ ...entry, aisManager: undefined })
                    } catch {
                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                    }
                    setOpenManagerDropId(null); setManagerDropPos(null)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Quitar encargado
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Encargado del club — dropdown fijo (escapa del overflow de las tarjetas) */}
      {openClubManagerId && clubManagerDropPos && (() => {
        const club = clubs.find(c => c.id === openClubManagerId)
        if (!club) return null
        const closeDrop = () => { setOpenClubManagerId(null); setClubManagerDropPos(null) }
        return (
          <div
            className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[180px] max-w-[calc(100vw-2rem)] max-h-[50vh] overflow-y-auto"
            style={{ top: clubManagerDropPos.top, right: clubManagerDropPos.right }}
            onClick={e => e.stopPropagation()}
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Encargado de {club.name}
            </p>
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={async () => {
                  try {
                    await onUpdateClub({ ...club, aisManager: p.avatar })
                    showToast(`${p.name.split(' ')[0]} asignado a ${club.name}`)
                  } catch {
                    showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                  }
                  closeDrop()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${
                  club.aisManager === p.avatar ? 'font-semibold text-blue-700' : 'text-slate-700'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {p.avatar}
                </span>
                {p.name.split(' ')[0]}
              </button>
            ))}
            {club.aisManager && (
              <>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={async () => {
                    try {
                      await onUpdateClub({ ...club, aisManager: undefined })
                      showToast('Encargado quitado')
                    } catch {
                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                    }
                    closeDrop()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Quitar encargado
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* ── Confirmaciones ── */}
      <ConfirmModal
        open={!!confirmDeleteEntryId}
        title="¿Quitar este jugador de distribución?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Quitar"
        onConfirm={async () => {
          if (!confirmDeleteEntryId) return
          try {
            await onDeleteEntry(confirmDeleteEntryId)
            closePanel()
            showToast('Jugador quitado de distribución')
          } catch {
            showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
          } finally {
            setConfirmDeleteEntryId(null)
          }
        }}
        onCancel={() => setConfirmDeleteEntryId(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteClubId}
        title={`¿Eliminar ${clubs.find(c => c.id === confirmDeleteClubId)?.name ?? 'este club'}?`}
        message="Se eliminarán también sus negociaciones. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!confirmDeleteClubId) return
          try {
            await onDeleteClub(confirmDeleteClubId)
            closePanel()
            showToast('Club eliminado')
          } catch {
            showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
          } finally {
            setConfirmDeleteClubId(null)
          }
        }}
        onCancel={() => setConfirmDeleteClubId(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

// ── CLUB CARD ────────────────────────────────────────────────

function ClubCard({ club, negotiations, isSelected, onClick, onOffer, onTogglePriority, managerName, managerDropOpen, onToggleManagerDrop }: {
  club: Club
  negotiations: ClubNegotiation[]
  isSelected: boolean
  onClick: () => void
  onOffer?: () => void
  onTogglePriority?: () => void
  /** Nombre completo del encargado (para el tooltip) */
  managerName?: string
  managerDropOpen?: boolean
  onToggleManagerDrop?: (pos: { top: number; right: number } | null) => void
}) {
  const activeStatuses: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
  const activeNegs = negotiations.filter(n => n.clubId === club.id && n.status !== 'descartado')
  const activeOnlyNegs = negotiations.filter(n => n.clubId === club.id && activeStatuses.includes(n.status))
  const tier = getClubTier(club.league, club.country)
  const tierCfg = TIER_CONFIG[tier]

  // Last activity
  const lastUpdated = activeNegs.reduce<string | undefined>((latest, n) => {
    if (!latest) return n.updatedAt
    return n.updatedAt > latest ? n.updatedAt : latest
  }, undefined)
  const daysAgo = lastUpdated ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86_400_000) : null
  const isStale = activeOnlyNegs.length > 0 && daysAgo !== null && daysAgo > 7

  function fmtDays(d: number) {
    if (d === 0) return 'hoy'
    if (d === 1) return 'ayer'
    if (d < 7) return `${d}d`
    if (d < 30) return `${Math.floor(d / 7)}sem`
    return `${Math.floor(d / 30)}m`
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all group flex items-center gap-2.5 px-3 py-2 ${
        isSelected ? 'border-blue-300 ring-1 ring-blue-200' : isStale ? 'border-orange-300' : 'border-slate-200'
      } ${club.isPriority ? 'border-l-4 border-l-green-400' : isStale ? 'border-l-4 border-l-orange-400' : ''}`}
    >
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${tierCfg.bg} ${tierCfg.text}`}>
        {tier}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-slate-800 text-sm truncate">{club.name}</span>
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
          {daysAgo !== null && (
            <span className={`flex-shrink-0 ml-auto ${isStale ? 'text-orange-500 font-semibold' : 'text-slate-400'}`}>
              {isStale ? `⏰ ${fmtDays(daysAgo)}` : fmtDays(daysAgo)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {onToggleManagerDrop && (
          <button
            onClick={e => {
              e.stopPropagation()
              if (managerDropOpen) { onToggleManagerDrop(null); return }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onToggleManagerDrop({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
            }}
            title={club.aisManager ? `Encargado: ${managerName ?? club.aisManager}` : 'Asignar encargado'}
            aria-label={club.aisManager ? `Encargado: ${managerName ?? club.aisManager}` : 'Asignar encargado'}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors flex-shrink-0 ${
              club.aisManager
                ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                : 'bg-slate-50 text-slate-400 border-dashed border-slate-300 hover:bg-slate-200 sm:opacity-0 sm:group-hover:opacity-100'
            } ${managerDropOpen ? 'ring-2 ring-blue-200 sm:opacity-100' : ''}`}
          >
            {club.aisManager ?? '+'}
          </button>
        )}
        {onTogglePriority && (
          <button
            onClick={e => { e.stopPropagation(); onTogglePriority() }}
            title={club.isPriority ? 'Quitar prioritario' : 'Marcar como prioritario'}
            className={`p-2 sm:p-1 rounded transition-all ${
              club.isPriority
                ? 'text-green-500 hover:text-green-600'
                : 'text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 hover:text-amber-400'
            }`}
          >
            <Star className={`w-4 h-4 ${club.isPriority ? 'fill-green-500' : ''}`} />
          </button>
        )}
        {onOffer ? (
          <button
            onClick={e => { e.stopPropagation(); onOffer() }}
            className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-1.5 py-2 sm:py-1 rounded hover:bg-blue-50"
          >
            <Plus className="w-3 h-3" /> Ofrecer
          </button>
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-300" />
        )}
      </div>
    </div>
  )
}

// ── ADD PLAYER MODAL ──────────────────────────────────────────

function AddPlayerModal({ players, existingPlayerIds, season, onClose, onSave, onCreatePlayer }: {
  players: Player[]
  existingPlayerIds: string[]
  season: string
  onClose: () => void
  onSave: (data: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<void>
  onCreatePlayer?: (p: Player) => Promise<Player>
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
    } finally { setSaving(false) }
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
      const saved = await onCreatePlayer(newPlayer)
      await onSave({
        playerId: saved.id,
        season,
        priority,
        condition: condition || undefined,
        transferFee: transferFee || undefined,
        notes: notes || undefined,
        active: true,
      })
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
                type="number" min="1985" max="2010"
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

function NeedFormInline({ initial, onSave, onCancel }: {
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
      await onSave({ position, ageMax: ageMax ? parseInt(ageMax) : undefined, transferBudget: transferBudget || undefined, salaryBudget: salaryBudget || undefined, notes: notes || undefined })
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

function AddClubModal({ onClose, onSave, leagueOptions, profiles, currentProfileAvatar }: {
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
        league: league || undefined,
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
          {leagueOpen && filteredLeagues.length > 0 && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLeagueOpen(false)} />
              <div className="absolute z-50 mt-1 w-full max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                {filteredLeagues.slice(0, 60).map(l => (
                  <button
                    key={l.league}
                    type="button"
                    onClick={() => selectLeague(l)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{l.league}</span>
                    {l.country && <span className="text-xs text-slate-400 flex-shrink-0">{l.country}</span>}
                  </button>
                ))}
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

function AddNegotiationModal({ players, clubs, entries, fixedPlayerId, fixedClubId, fixedNeedPosition, onClose, onSave, profiles, currentProfileAvatar }: {
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
  const [aisManager, setAisManager] = useState(currentProfileAvatar ?? '')
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
          <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
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
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT CLUB MODAL ───────────────────────────────────────────

function EditClubModal({ club, leagueOptions = [], onClose, onSave, profiles }: {
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

function EditNegotiationModal({ neg, clubs, players, currentProfile, onClose, onSave, onSaveUpdate, onDelete, profiles }: {
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
    try { await onSave({ status, aisManager: aisManager || undefined, notes: notes || undefined }) }
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
          >
            {savingUpdate ? 'Guardando…' : 'Guardar nota'}
          </button>
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

function ModalShell({ title, onClose, children, escDisabled = false }: { title: string; onClose: () => void; children: React.ReactNode; escDisabled?: boolean }) {
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

  useEscapeKey(onClose)

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
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
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
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0 safe-area-bottom">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={newIds.length === 0 || saving}
            className="flex-1 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Asignando…</span> : `Asignar ${newIds.length} club${newIds.length !== 1 ? 's' : ''}`}
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
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <span>{label}{isActive ? ` (${selected.length})` : ''}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] max-w-[calc(100vw-2rem)] py-1 max-h-[50vh] overflow-y-auto">
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

// suppress unused import warnings
void genId
void now
