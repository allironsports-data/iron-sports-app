import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ChevronRight, Check, Trash2, LogOut,
  TrendingUp, AlertCircle, ChevronDown, Eye, Inbox,
} from 'lucide-react'
import logoImg from '../../assets/logo.jpeg'
import type { Player, Club, ClubNeed, DistributionEntry, ClubNegotiation } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ToastStack } from '../../components/ToastStack'
import { useToast } from '../../hooks/useToast'
import { POSITION_CODES, needMatchesPlayer, normalizePosition } from '../../lib/positions'
import { getClubTier, getClubConfederation } from '../../lib/clubTiers'
import type { LeagueTier, Confederation } from '../../lib/clubTiers'
import { BulkAssignModal } from '../../components/BulkAssignModal'
import { computeOpportunities, hideDeadNegotiations } from '../../lib/distribution'
import { NEG_STATUSES, STATUS_CONFIG, SIN_NEGOCIACIONES, clampDropPos } from './constantes'
import { useIsMobile } from './useIsMobile'
import type { DropPos, Priority } from './constantes'
import { useDistributionIndexes } from './useDistributionIndexes'
import { JugadoresTab } from './JugadoresTab'
import type { FilterSheetId } from './JugadoresTab'
import { ClubesTab } from './ClubesTab'
import { SolicitudesTab } from './SolicitudesTab'
import type { NeedsSort, SelectedNeed, EditingNeed } from './SolicitudesTab'
import { PipelineTab } from './PipelineTab'
import { OportunidadesTab } from './OportunidadesTab'
import { EncargadosTab } from './EncargadosTab'
import { PlayerPanel, NeedPanel, ClubPanel } from './paneles'
import type { HealthId } from './paneles'
import {
  AddPlayerModal, AddClubModal, AddNegotiationModal, EditEntryModal, EditClubModal,
  EditNegotiationModal, AddNeedModal,
} from './modales'

// ── constants ─────────────────────────────────────────────────

const CURRENT_SEASON = '2025-26'

type TabId = 'jugadores' | 'clubes' | 'solicitudes' | 'oportunidades' | 'pipeline' | 'encargados'

// ── props ─────────────────────────────────────────────────────

export interface Props {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  negotiations: ClubNegotiation[]
  currentProfile: Profile
  profiles: Profile[]
  onBack: () => void          // go to Tareas
  onGoToJugadores?: () => void
  onGoToCaptacion?: () => void
  onGoToBoulema?: () => void
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
  players, clubs, entries, negotiations: negotiationsAll, currentProfile, profiles,
  onBack, onGoToCaptacion, onGoToBoulema, onLogout, onAdmin, onSelectPlayer, onSelectClub,
  onCreateClub, onUpdateClub, onDeleteClub,
  onCreateEntry, onUpdateEntry, onDeleteEntry,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
  onCreatePlayer, activeClubId,
}: Props) {
  // ── Jugador CERRADO = fuera de la UX de Distribución ────────
  // Si un jugador ya firmó en algún club (alguna negociación «cerrado»),
  // sus negociaciones abiertas en OTROS clubes están muertas: se ocultan
  // de pipeline, clubes, solicitudes y contadores. Los datos no se borran
  // (siguen en la BBDD y en la ficha del jugador); la negociación «cerrado»
  // sí se conserva como historial.
  const negotiations = useMemo(() => hideDeadNegotiations(negotiationsAll), [negotiationsAll])

  const [tab, setTab] = useState<TabId>(
    () => {
      const saved = sessionStorage.getItem('nav_dist_tab') as TabId | 'panel' | null
      return saved && saved !== 'panel' ? saved : 'jugadores'
    }
  )
  // Oportunidades tab
  const [oppSearch, setOppSearch] = useState('')
  const [oppPriority, setOppPriority] = useState<Priority | ''>('')
  const [oppPos, setOppPos] = useState('')          // filtro por posición del jugador
  const [oppLeague, setOppLeague] = useState('')    // filtro por liga del club
  const [oppMineOnly, setOppMineOnly] = useState(false)
  const [oppNoMgrOnly, setOppNoMgrOnly] = useState(false)  // solo oportunidades de clubes sin encargado
  const [offeringOppKey, setOfferingOppKey] = useState<string | null>(null)
  const [dismissingOppKey, setDismissingOppKey] = useState<string | null>(null)
  const [oppSelected, setOppSelected] = useState<Set<string>>(new Set())
  const [confirmBulkDismiss, setConfirmBulkDismiss] = useState(false)
  const [bulkDismissing, setBulkDismissing] = useState(false)
  // Salud de datos (Encargados tab, admin)
  const [healthOpen, setHealthOpen] = useState<HealthId | null>(null)
  useEffect(() => { sessionStorage.setItem('nav_dist_tab', tab) }, [tab])

  // Móvil: bottom-sheet de filtros + detección de viewport
  const isMobile = useIsMobile()
  const [filterSheet, setFilterSheet] = useState<FilterSheetId>(null)

  // Filtros de la pestaña Clubes — persistidos en sessionStorage para que
  // se conserven al navegar a fichas y volver, y entre refrescos.
  const FILTERS_KEY = 'dist_club_filters'
  // Se leía y se parseaba el JSON de sessionStorage en CADA render, cuando
  // solo hace falta al montar para rellenar los valores iniciales.
  const [storedF] = useState<Record<string, unknown>>(() => {
    try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}') } catch { return {} }
  })
  // El texto buscado solo se restaura si volvemos a la pestaña Clubes (es su
  // filtro): en Jugadores aparecía una búsqueda «fantasma» que vaciaba la lista.
  const [search, setSearch] = useState<string>(tab === 'clubes' ? ((storedF.search as string) ?? '') : '')

  // toasts + confirmaciones
  const { toasts, showToast, dismissToast } = useToast()
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null)
  const [confirmDeleteClubId, setConfirmDeleteClubId] = useState<string | null>(null)

  // panel state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [openManagerDropId, setOpenManagerDropId] = useState<string | null>(null)
  const [managerDropPos, setManagerDropPos]       = useState<DropPos | null>(null)
  // Cambiar estado de negociación desde la vista tabla, sin abrir la ficha
  const [openStatusDropId, setOpenStatusDropId]   = useState<string | null>(null)
  const [statusDropPos, setStatusDropPos]         = useState<DropPos | null>(null)


  // Bulk: asignar encargado a varios clubes a la vez (pestaña Clubes)
  const [clubBulkMode, setClubBulkMode] = useState(false)
  const [clubSelected, setClubSelected] = useState<Set<string>>(new Set())
  const [bulkClubManagerPos, setBulkClubManagerPos] = useState<DropPos | null>(null)
  const [bulkClubAssigning, setBulkClubAssigning] = useState(false)

  // Close manager dropdowns on outside click.
  // Se cierra también con scroll AMPLIO (el dropdown es fixed y se desalinearía),
  // pero ignorando micro-scrolls para que no desaparezca antes de elegir.
  useEffect(() => {
    if (!openManagerDropId && !bulkClubManagerPos && !openStatusDropId) return
    const close = () => {
      setOpenManagerDropId(null); setManagerDropPos(null)
      setBulkClubManagerPos(null)
      setOpenStatusDropId(null); setStatusDropPos(null)
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
  }, [openManagerDropId, bulkClubManagerPos, openStatusDropId])

  // modals
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showAddClub, setShowAddClub] = useState(false)
  const [showAddNeg, setShowAddNeg] = useState<{ playerId?: string; clubId?: string; needPosition?: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<DistributionEntry | null>(null)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [bulkAssignPlayerId, setBulkAssignPlayerId] = useState<string | null>(null)
  // need-specific panel (solicitudes tab)
  const [selectedNeed, setSelectedNeed] = useState<SelectedNeed | null>(null)
  // pipeline filters
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [pipelinePosFilter, setPipelinePosFilter] = useState<string>('')
  const [pipelineGestorFilter, setPipelineGestorFilter] = useState<string>('')
  const [showClosedDeals, setShowClosedDeals] = useState(false)
  const [pipelineMyOnly, setPipelineMyOnly] = useState(false)
  const [pipelineListView, setPipelineListView] = useState(false)
  const [jugadoresTableView, setJugadoresTableView] = useState<boolean>(() => sessionStorage.getItem('dist_jugadores_table_view') === '1')
  useEffect(() => { sessionStorage.setItem('dist_jugadores_table_view', jugadoresTableView ? '1' : '0') }, [jugadoresTableView])

  // filters
  const [leagueFilter, setLeagueFilter] = useState<string[]>((storedF.leagueFilter as string[]) ?? [])
  const [countryFilter, setCountryFilter] = useState<string[]>((storedF.countryFilter as string[]) ?? [])
  const [tierFilter, setTierFilter] = useState<LeagueTier[]>((storedF.tierFilter as LeagueTier[]) ?? [])
  const [confederationFilter, setConfederationFilter] = useState<Confederation[]>((storedF.confederationFilter as Confederation[]) ?? [])
  const [priorityOnly, setPriorityOnly] = useState<boolean>((storedF.priorityOnly as boolean) ?? false)
  const [hasNeedsOnly, setHasNeedsOnly] = useState<boolean>((storedF.hasNeedsOnly as boolean) ?? false)
  const [hasContactOnly, setHasContactOnly] = useState<boolean>((storedF.hasContactOnly as boolean) ?? false)
  const [clubManagerFilter, setClubManagerFilter] = useState<string>((storedF.clubManagerFilter as string) ?? '')   // '' = todos, '__sin__' = sin encargado, o avatar
  const [staleOnly, setStaleOnly] = useState<boolean>((storedF.staleOnly as boolean) ?? false)   // bandeja: clubes con propuestas activas sin mover >7d
  const [contactedFilter, setContactedFilter] = useState<string>((storedF.contactedFilter as string) ?? '')   // '' = todos, 'yes' = contactados, 'no' = sin contactar

  // Guardar filtros de Clubes al cambiar
  useEffect(() => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
      search, leagueFilter, countryFilter, tierFilter, confederationFilter,
      priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly, contactedFilter,
    }))
  }, [search, leagueFilter, countryFilter, tierFilter, confederationFilter, priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly, contactedFilter])
  const [positionFilter, setPositionFilter] = useState('')   // solicitudes tab
  const [editingNeed, setEditingNeed] = useState<EditingNeed | null>(null)
  const [posFilters, setPosFilters] = useState<string[]>([])   // jugadores tab
  const [yearFilters, setYearFilters] = useState<string[]>([])
  const [activityFilter, setActivityFilter] = useState(false)
  // Ocultar jugadores que ya han firmado en algún sitio (negociación «cerrado»)
  const [hideClosed, setHideClosed] = useState<boolean>(() => sessionStorage.getItem('dist_hide_closed') === '1')
  useEffect(() => { sessionStorage.setItem('dist_hide_closed', hideClosed ? '1' : '0') }, [hideClosed])
  const [showAddNeed, setShowAddNeed] = useState(false)
  const [groupByTier, setGroupByTier] = useState(false)
  // solicitudes filters
  const [needsTierFilter, setNeedsTierFilter] = useState<LeagueTier[]>([])
  const [needsLeagueFilter, setNeedsLeagueFilter] = useState('')
  const [needsAgeFilter, setNeedsAgeFilter] = useState('')
  const [needsSort, setNeedsSort] = useState<NeedsSort>('recent')

  // Última actividad de negociación por jugador (semáforo de olvido, como en Firmar):
  // verde <15 días, ámbar 15-30, rojo >30, gris sin actividad ninguna
  const lastNegActivity = useMemo(() => {
    const m: Record<string, string> = {}
    negotiations.forEach(n => {
      const dates = [n.updatedAt, n.createdAt, ...(n.updates ?? []).map(u => u.date)].filter(Boolean) as string[]
      const last = dates.sort().pop()
      if (last && (!m[n.playerId] || last > m[n.playerId])) m[n.playerId] = last
    })
    return m
  }, [negotiations])

  const season = CURRENT_SEASON
  const { seasonEntries, playersById, clubsById, negsByPlayer, negsByClub, entriesByPlayer } =
    useDistributionIndexes({ players, clubs, entries, negotiations, season })

  const filteredEntries = useMemo(() => {
    let result = seasonEntries
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e => playersById.get(e.playerId)?.name.toLowerCase().includes(q))
    }
    if (posFilters.length > 0) {
      result = result.filter(e => {
        const p = playersById.get(e.playerId)
        return !!p?.positions[0] && posFilters.includes(p.positions[0])
      })
    }
    if (yearFilters.length > 0) {
      result = result.filter(e => {
        const y = playersById.get(e.playerId)?.birthDate?.slice(0, 4) ?? ''
        return yearFilters.includes(y)
      })
    }
    if (activityFilter) {
      result = result.filter(e =>
        (negsByPlayer.get(e.playerId) ?? []).some(n => n.status !== 'descartado')
      )
    }
    if (hideClosed) {
      result = result.filter(e =>
        !(negsByPlayer.get(e.playerId) ?? []).some(n => n.status === 'cerrado')
      )
    }
    return result
  }, [seasonEntries, search, playersById, posFilters, yearFilters, activityFilter, hideClosed, negsByPlayer])

  const distributionYears = useMemo(() => {
    const years = new Set<string>()
    seasonEntries.forEach(e => {
      const y = playersById.get(e.playerId)?.birthDate?.slice(0, 4)
      if (y) years.add(y)
    })
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [seasonEntries, playersById])


  // Cuántos jugadores han firmado ya en algún sitio. Iba calculado a pelo
  // dentro de la etiqueta de un checkbox: 300 entries × 2.000 negociaciones
  // en cada repintado para enseñar un número entre paréntesis.
  const nCerrados = useMemo(
    () => seasonEntries.filter(e =>
      (negsByPlayer.get(e.playerId) ?? []).some(n => n.status === 'cerrado')).length,
    [seasonEntries, negsByPlayer],
  )

  const filteredClubs = useMemo(() => {
    let result = clubs
    if (leagueFilter.length > 0) result = result.filter(c => leagueFilter.includes(`${c.league ?? 'Sin liga'}|${c.country ?? ''}`))
    if (countryFilter.length > 0) result = result.filter(c => countryFilter.includes(c.country ?? ''))
    if (tierFilter.length > 0) result = result.filter(c => tierFilter.includes(getClubTier(c.league, c.country)))
    if (confederationFilter.length > 0) result = result.filter(c => confederationFilter.includes(getClubConfederation(c.country)))
    if (priorityOnly) result = result.filter(c => c.isPriority)
    if (hasNeedsOnly) result = result.filter(c => c.needs.length > 0)
    if (hasContactOnly) result = result.filter(c => !!c.contactPerson)
    if (clubManagerFilter === '__sin__') result = result.filter(c => !c.aisManager)
    else if (clubManagerFilter) result = result.filter(c => c.aisManager === clubManagerFilter)
    if (contactedFilter === 'yes') result = result.filter(c => !!c.contacted)
    else if (contactedFilter === 'no') result = result.filter(c => !c.contacted)
    if (staleOnly) {
      const ACTIVE: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
      result = result.filter(c => {
        const active = (negsByClub.get(c.id) ?? SIN_NEGOCIACIONES).filter(n => ACTIVE.includes(n.status))
        if (active.length === 0) return false
        const last = active.reduce<string | undefined>((m, n) => (!m || n.updatedAt > m ? n.updatedAt : m), undefined)
        const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : 0
        return days > 7
      })
    }
    if (!search) return result
    const q = search.toLowerCase()
    return result.filter(c => c.name.toLowerCase().includes(q) || c.league?.toLowerCase().includes(q))
  }, [clubs, negsByClub, search, leagueFilter, countryFilter, tierFilter, confederationFilter, priorityOnly, hasNeedsOnly, hasContactOnly, clubManagerFilter, staleOnly, contactedFilter])

  // Los clubes ya agrupados por liga+país. Antes, la vista agrupada
  // recorría los 1.500 clubes UNA VEZ POR LIGA (~300 ligas): medio millón
  // de comparaciones en cada repintado para partir una lista en trozos.
  // Cuántos jugadores hay ofrecidos para cada necesidad de cada club.
  // Iba a pelo dentro del JSX: por cada una de las ~400 solicitudes recorría
  // las 2.000 negociaciones y, dentro, buscaba al jugador entre los 300.
  // Y como la lista se pintaba dos veces (móvil y escritorio), el doble.
  const ofrecidos = useMemo(() => {
    const m = new Map<string, number>()
    negotiations.forEach(n => {
      if (n.status === 'descartado') return
      if (n.needPosition) {
        const k = `${n.clubId}|${n.needPosition}`
        m.set(k, (m.get(k) ?? 0) + 1)
        return
      }
      // Sin posición apuntada: cuenta en las necesidades que encajen con
      // las posiciones del jugador.
      const p = playersById.get(n.playerId)
      const club = clubsById.get(n.clubId)
      if (!p || !club) return
      club.needs?.forEach(need => {
        if (!needMatchesPlayer(need.position, p.positions)) return
        const k = `${n.clubId}|${need.position}`
        m.set(k, (m.get(k) ?? 0) + 1)
      })
    })
    return m
  }, [negotiations, playersById, clubsById])

  const ofrecidosPorNecesidad = useCallback(
    (club: Club, need: ClubNeed) => ofrecidos.get(`${club.id}|${need.position}`) ?? 0,
    [ofrecidos],
  )

  const clubesPorLiga = useMemo(() => {
    const m = new Map<string, Club[]>()
    filteredClubs.forEach(c => {
      const k = `${c.league ?? 'Sin liga'}|${c.country ?? ''}`
      const l = m.get(k)
      if (l) l.push(c); else m.set(k, [c])
    })
    return m
  }, [filteredClubs])

  const sortedLeagues = useMemo(() => {
    // Clave liga+país: "Serie A" de Italia y la de Brasil son entradas distintas
    const map = new Map<string, { league: string; country: string; count: number }>()
    clubs.forEach(c => {
      const league = c.league ?? 'Sin liga'
      const country = c.country ?? ''
      const key = `${league}|${country}`
      const existing = map.get(key)
      map.set(key, { league, country, count: (existing?.count ?? 0) + 1 })
    })
    return Array.from(map.entries())
      .map(([key, { league, country, count }]) => ({
        key, league, count, country,
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

  const selectedEntry = selectedEntryId
    ? (seasonEntries.find(e => e.id === selectedEntryId) ?? null) : null
  const selectedClub = selectedClubId ? (clubsById.get(selectedClubId) ?? null) : null

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
        const club = clubsById.get(n.clubId)
        const player = playersById.get(n.playerId)
        return { neg: n, club, player }
      })
      // Solo las de los clubes de los que soy encargado: es quien debe mover la propuesta
      .filter(({ club }) => club?.aisManager === currentProfile.avatar)
      .sort((a, b) => (b.neg.createdAt ?? '').localeCompare(a.neg.createdAt ?? ''))
  }, [negotiations, clubsById, playersById, currentProfile.avatar])

  // ── MOTOR DE OPORTUNIDADES ── (lógica en lib/distribution.ts) ──
  const opportunities = useMemo(
    () => computeOpportunities({ seasonEntries, playersById, clubs, negotiations }),
    [seasonEntries, playersById, clubs, negotiations],
  )

  function closePanel() { setSelectedEntryId(null); setSelectedClubId(null); setSelectedNeed(null); setPanelExpanded(false) }
  const hasPanel = tab !== 'encargados' && (!!selectedEntry || !!selectedClub || !!selectedNeed)
  // Panel lateral ampliable (más ancho para editar cómodamente)
  const [panelExpanded, setPanelExpanded] = useState(false)

  function switchTab(t: TabId) {
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
      const player = playersById.get(e.playerId)
      const effectivePriority = player?.hiddenFromManagement ? 'D' : e.priority
      return { ...e, priority: effectivePriority as 'A' | 'B' | 'C' | 'D' }
    })
    return {
      A: withEffectivePriority.filter(e => e.priority === 'A'),
      B: withEffectivePriority.filter(e => e.priority === 'B'),
      C: withEffectivePriority.filter(e => e.priority === 'C'),
      D: withEffectivePriority.filter(e => e.priority === 'D'),
    }
  }, [filteredEntries, playersById])


  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
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
        <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
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
          <button
            onClick={onGoToBoulema}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <Inbox className="w-3.5 h-3.5" />
            Boulema
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
                    <div
                      key={neg.id}
                      onClick={() => { if (club) onSelectClub?.(club.id) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-white hover:bg-amber-50 transition-colors cursor-pointer"
                    >
                      <span className="text-sm font-medium text-slate-800 truncate">{player?.name ?? 'Jugador'}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                      <span className="text-sm text-slate-600 truncate">{club?.name ?? 'Club'}</span>
                      {neg.needPosition && (
                        <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{neg.needPosition}</span>
                      )}
                      <span className="ml-auto text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Pendiente</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await onUpdateNegotiation({ ...neg, status: 'descartado' })
                            showToast(`${player?.name ?? 'Propuesta'} → ${club?.name ?? 'club'} descartada`, 'info')
                          } catch {
                            showToast('No se pudo descartar. Inténtalo de nuevo.', 'error')
                          }
                        }}
                        title="Descartar propuesta"
                        aria-label="Descartar propuesta"
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── JUGADORES TAB ── */}
          {tab === 'jugadores' && (
            <JugadoresTab
              search={search} setSearch={setSearch}
              posFilters={posFilters} setPosFilters={setPosFilters}
              yearFilters={yearFilters} setYearFilters={setYearFilters}
              activityFilter={activityFilter} setActivityFilter={setActivityFilter}
              hideClosed={hideClosed} setHideClosed={setHideClosed}
              distributionYears={distributionYears} nCerrados={nCerrados}
              jugadoresTableView={jugadoresTableView} setJugadoresTableView={setJugadoresTableView}
              onAddPlayer={() => setShowAddPlayer(true)}
              filterSheet={filterSheet} setFilterSheet={setFilterSheet}
              byPriority={byPriority} filteredEntries={filteredEntries}
              playersById={playersById} negsByPlayer={negsByPlayer}
              lastNegActivity={lastNegActivity} profiles={profiles}
              selectedEntryId={selectedEntryId} setSelectedEntryId={setSelectedEntryId} setSelectedClubId={setSelectedClubId}
              openStatusDropId={openStatusDropId} setOpenStatusDropId={setOpenStatusDropId} setStatusDropPos={setStatusDropPos}
              openManagerDropId={openManagerDropId} setOpenManagerDropId={setOpenManagerDropId} setManagerDropPos={setManagerDropPos}
            />
          )}

          {/* ── CLUBES TAB ── */}
          {tab === 'clubes' && (
            <ClubesTab
              search={search} setSearch={setSearch}
              leagueFilter={leagueFilter} setLeagueFilter={setLeagueFilter}
              countryFilter={countryFilter} setCountryFilter={setCountryFilter}
              tierFilter={tierFilter} setTierFilter={setTierFilter}
              confederationFilter={confederationFilter} setConfederationFilter={setConfederationFilter}
              priorityOnly={priorityOnly} setPriorityOnly={setPriorityOnly}
              hasNeedsOnly={hasNeedsOnly} setHasNeedsOnly={setHasNeedsOnly}
              hasContactOnly={hasContactOnly} setHasContactOnly={setHasContactOnly}
              clubManagerFilter={clubManagerFilter} setClubManagerFilter={setClubManagerFilter}
              staleOnly={staleOnly} setStaleOnly={setStaleOnly}
              contactedFilter={contactedFilter} setContactedFilter={setContactedFilter}
              groupByTier={groupByTier} setGroupByTier={setGroupByTier}
              clubs={clubs} sortedLeagues={sortedLeagues} sortedCountries={sortedCountries}
              clubesPorLiga={clubesPorLiga} filteredClubs={filteredClubs}
              profiles={profiles} currentProfile={currentProfile} negsByClub={negsByClub}
              clubBulkMode={clubBulkMode} setClubBulkMode={setClubBulkMode}
              clubSelected={clubSelected} setClubSelected={setClubSelected}
              setBulkClubManagerPos={setBulkClubManagerPos}
              onAddClub={() => setShowAddClub(true)}
              onUpdateClub={onUpdateClub} showToast={showToast}
              filterSheet={filterSheet} setFilterSheet={setFilterSheet}
              selectedClubId={selectedClubId} activeClubId={activeClubId} onSelectClub={onSelectClub}
              setSelectedClubId={setSelectedClubId} setSelectedEntryId={setSelectedEntryId}
            />
          )}

          {/* ── SOLICITUDES TAB ── */}
          {tab === 'solicitudes' && (
            <SolicitudesTab
              search={search} setSearch={setSearch}
              needsTierFilter={needsTierFilter} setNeedsTierFilter={setNeedsTierFilter}
              needsLeagueFilter={needsLeagueFilter} setNeedsLeagueFilter={setNeedsLeagueFilter}
              needsAgeFilter={needsAgeFilter} setNeedsAgeFilter={setNeedsAgeFilter}
              positionFilter={positionFilter} setPositionFilter={setPositionFilter}
              needsSort={needsSort} setNeedsSort={setNeedsSort}
              needsLeagues={needsLeagues} allNeedsPositions={allNeedsPositions}
              clubs={clubs} clubNeeds={clubNeeds} ofrecidosPorNecesidad={ofrecidosPorNecesidad}
              onAddNeed={() => setShowAddNeed(true)}
              filterSheet={filterSheet} setFilterSheet={setFilterSheet}
              onSelectClub={onSelectClub} currentProfile={currentProfile}
              editingNeed={editingNeed} setEditingNeed={setEditingNeed}
              onUpdateClub={onUpdateClub} showToast={showToast}
              setSelectedNeed={setSelectedNeed} setSelectedEntryId={setSelectedEntryId} setSelectedClubId={setSelectedClubId}
            />
          )}

          {/* ── PIPELINE TAB: global CRM kanban ── */}
          {tab === 'pipeline' && (
            <PipelineTab
              negotiations={negotiations} players={players} entries={entries}
              playersById={playersById} clubsById={clubsById} entriesByPlayer={entriesByPlayer}
              currentProfile={currentProfile}
              pipelineSearch={pipelineSearch} setPipelineSearch={setPipelineSearch}
              pipelinePosFilter={pipelinePosFilter} setPipelinePosFilter={setPipelinePosFilter}
              pipelineGestorFilter={pipelineGestorFilter} setPipelineGestorFilter={setPipelineGestorFilter}
              showClosedDeals={showClosedDeals} setShowClosedDeals={setShowClosedDeals}
              pipelineMyOnly={pipelineMyOnly} setPipelineMyOnly={setPipelineMyOnly}
              pipelineListView={pipelineListView} setPipelineListView={setPipelineListView}
              isMobile={isMobile} filterSheet={filterSheet} setFilterSheet={setFilterSheet}
              onEditNegotiation={setEditingNeg}
            />
          )}

          {/* ── OPORTUNIDADES TAB ── */}
          {tab === 'oportunidades' && (
            <OportunidadesTab
              opportunities={opportunities} currentProfile={currentProfile}
              oppSearch={oppSearch} setOppSearch={setOppSearch}
              oppPriority={oppPriority} setOppPriority={setOppPriority}
              oppPos={oppPos} setOppPos={setOppPos}
              oppLeague={oppLeague} setOppLeague={setOppLeague}
              oppMineOnly={oppMineOnly} setOppMineOnly={setOppMineOnly}
              oppNoMgrOnly={oppNoMgrOnly} setOppNoMgrOnly={setOppNoMgrOnly}
              offeringOppKey={offeringOppKey} setOfferingOppKey={setOfferingOppKey}
              dismissingOppKey={dismissingOppKey} setDismissingOppKey={setDismissingOppKey}
              oppSelected={oppSelected} setOppSelected={setOppSelected}
              confirmBulkDismiss={confirmBulkDismiss} setConfirmBulkDismiss={setConfirmBulkDismiss}
              bulkDismissing={bulkDismissing} setBulkDismissing={setBulkDismissing}
              onCreateNegotiation={onCreateNegotiation} onSelectClub={onSelectClub} showToast={showToast}
            />
          )}

          {/* ── ENCARGADOS TAB ── */}
          {tab === 'encargados' && (
            <EncargadosTab
              seasonEntries={seasonEntries} playersById={playersById} negsByPlayer={negsByPlayer}
              profiles={profiles} clubs={clubs} negotiations={negotiations} currentProfile={currentProfile}
              healthOpen={healthOpen} setHealthOpen={setHealthOpen}
              onSelectPlayer={onSelectPlayer} onSelectClub={onSelectClub}
              onGoToClubs={(avatar) => { setClubManagerFilter(avatar); setTab('clubes') }}
            />
          )}
        </div>

        {/* ── SIDE PANEL ── */}
        {hasPanel && (
          <div className={`w-full flex-shrink-0 border-l border-slate-200 bg-white fixed sm:static inset-0 sm:inset-auto z-30 transition-[width] duration-200 ${
            panelExpanded && selectedEntry ? 'overflow-y-auto sm:overflow-hidden' : 'overflow-y-auto'
          } ${
            panelExpanded ? 'sm:w-[560px] lg:w-[55%] xl:w-[60%]' : 'sm:w-[380px]'
          }`}>
            {selectedEntry && (
              <PlayerPanel
                selectedEntry={selectedEntry} playersById={playersById} negotiations={negotiations}
                clubs={clubs} profiles={profiles} currentProfile={currentProfile}
                panelExpanded={panelExpanded} onTogglePanelExpanded={() => setPanelExpanded(e => !e)}
                onClose={closePanel} onSelectPlayer={onSelectPlayer} onSelectClub={onSelectClub}
                onEditEntry={setEditingEntry} onRequestDeleteEntry={setConfirmDeleteEntryId}
                onAddClub={(playerId) => setShowAddNeg({ playerId })}
                onAssignLeague={setBulkAssignPlayerId}
                onUpdateNegotiation={onUpdateNegotiation} onDeleteNegotiation={onDeleteNegotiation}
                showToast={showToast}
              />
            )}

            {selectedNeed && (
              <NeedPanel
                selectedNeed={selectedNeed} clubs={clubs} players={players} negotiations={negotiations}
                playersById={playersById} entriesByPlayer={entriesByPlayer} negsByClub={negsByClub}
                currentProfile={currentProfile} onClose={closePanel} onSelectClub={onSelectClub}
                onAddNegotiation={setShowAddNeg} onEditNegotiation={setEditingNeg}
                onCreateNegotiation={onCreateNegotiation} showToast={showToast}
              />
            )}

            {selectedClub && (
              <ClubPanel
                selectedClub={selectedClub} playersById={playersById} entriesByPlayer={entriesByPlayer}
                negsByClub={negsByClub} currentProfile={currentProfile} onClose={closePanel}
                onSelectClub={onSelectClub} onEditClub={setEditingClub} onUpdateClub={onUpdateClub}
                onAddNegotiation={setShowAddNeg} onEditNegotiation={setEditingNeg}
                onRequestDeleteClub={setConfirmDeleteClubId} showToast={showToast}
              />
            )}
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
          onToast={showToast}
          onSave={async (data) => {
            try {
              const saved = await onCreateEntry(data)
              setSelectedEntryId(saved.id)
              setShowAddPlayer(false)
              showToast('Jugador añadido a distribución')
            } catch (err) {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
              throw err // el modal decide qué hacer (p. ej. avisar de que el jugador ya existe)
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
            } catch (err: unknown) {
              console.error('Error al crear club:', err)
              const code = (err as { code?: string })?.code
              if (code === '23505') {
                showToast(`Ya existe un club llamado "${data.name}". Búscalo en la lista y edítalo en vez de crear uno nuevo.`, 'error')
              } else {
                showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
              }
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
          leagueOptions={Array.from(new Set(sortedLeagues.map(l => l.league)))}
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

      {editingNeg && (() => {
        // La negociación puede cambiar por fuera (realtime, otra pestaña) mientras
        // el modal está abierto: al guardar partimos siempre de la versión fresca
        // para no pisar notas/estado ajenos con la copia vieja de editingNeg.
        const freshNeg = negotiations.find(n => n.id === editingNeg.id) ?? editingNeg
        return (
        <EditNegotiationModal
          neg={editingNeg}
          clubs={clubs}
          players={players}
          currentProfile={currentProfile}
          profiles={profiles}
          onClose={() => setEditingNeg(null)}
          onSave={async (data) => {
            try {
              await onUpdateNegotiation({ ...freshNeg, ...data })
              setEditingNeg(null)
              showToast('Cambios guardados')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
          onSaveUpdate={async (update) => {
            try {
              const updated = { ...freshNeg, updates: [...(freshNeg.updates ?? []), update] }
              await onUpdateNegotiation(updated)
              setEditingNeg(updated)
              showToast('Nota guardada')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
          onDelete={async () => {
            try {
              await onDeleteNegotiation(freshNeg.id)
              setEditingNeg(null)
              showToast('Negociación eliminada')
            } catch {
              showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
        )
      })()}

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
                clubIds.map(clubId => onCreateNegotiation({ playerId: bulkAssignPlayerId, clubId, status: 'pendiente', aisManager: clubs.find(c => c.id === clubId)?.aisManager || currentProfile.avatar }))
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
        const pos = clampDropPos(managerDropPos.top, profiles.length + (entry.aisManager ? 1 : 0))
        return (
          <div
            className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px] max-w-[calc(100vw-2rem)] overflow-y-auto"
            style={{ top: pos.top, right: managerDropPos.right, maxHeight: pos.maxHeight }}
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

      {/* Cambiar estado de negociación — dropdown fijo, usado desde la vista tabla de jugadores */}
      {openStatusDropId && statusDropPos && (() => {
        const neg = negotiations.find(n => n.id === openStatusDropId)
        if (!neg) return null
        const club = clubs.find(c => c.id === neg.clubId)
        const pos = clampDropPos(statusDropPos.top, NEG_STATUSES.length + 1)
        return (
          <div
            className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[180px] max-w-[calc(100vw-2rem)] overflow-y-auto"
            style={{ top: pos.top, right: statusDropPos.right, maxHeight: pos.maxHeight }}
            onClick={e => e.stopPropagation()}
          >
            {club && (
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                {club.name}
              </p>
            )}
            {NEG_STATUSES.map(s => (
              <button
                key={s}
                onClick={async () => {
                  try {
                    await onUpdateNegotiation({ ...neg, status: s })
                  } catch {
                    showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                  }
                  setOpenStatusDropId(null); setStatusDropPos(null)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${
                  neg.status === s ? 'font-semibold text-slate-800' : 'text-slate-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_CONFIG[s].dot}`} />
                {STATUS_CONFIG[s].label}
                {neg.status === s && <Check className="w-3.5 h-3.5 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Asignar encargado en bulk — a todos los clubes seleccionados en pestaña Clubes */}
      {bulkClubManagerPos && (() => {
        const closeDrop = () => setBulkClubManagerPos(null)
        const ids = Array.from(clubSelected)
        const pos = clampDropPos(bulkClubManagerPos.top, profiles.length + 2)
        async function assignBulk(avatar: string | undefined) {
          setBulkClubAssigning(true)
          try {
            const targets = ids.map(id => clubs.find(c => c.id === id)).filter((c): c is Club => !!c)
            await Promise.all(targets.map(c => onUpdateClub({ ...c, aisManager: avatar })))
            showToast(avatar ? `Encargado asignado a ${targets.length} club${targets.length !== 1 ? 'es' : ''}` : `Encargado quitado de ${targets.length} club${targets.length !== 1 ? 'es' : ''}`)
            setClubSelected(new Set())
            setClubBulkMode(false)
          } catch {
            showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
          } finally {
            setBulkClubAssigning(false)
            closeDrop()
          }
        }
        return (
          <div
            className="fixed z-[200] bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[200px] max-w-[calc(100vw-2rem)] overflow-y-auto"
            style={{ top: pos.top, right: bulkClubManagerPos.right, maxHeight: pos.maxHeight }}
            onClick={e => e.stopPropagation()}
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Asignar a {ids.length} club{ids.length !== 1 ? 'es' : ''}
            </p>
            {profiles.map(p => (
              <button
                key={p.id}
                disabled={bulkClubAssigning}
                onClick={() => assignBulk(p.avatar)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="w-5 h-5 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {p.avatar}
                </span>
                {p.name.split(' ')[0]}
              </button>
            ))}
            <div className="border-t border-slate-100 my-1" />
            <button
              disabled={bulkClubAssigning}
              onClick={() => assignBulk(undefined)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Quitar encargado
            </button>
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
