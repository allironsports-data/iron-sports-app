import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  LogOut, FileText, Calendar, CalendarDays, TrendingUp, Eye, ClipboardList, Users, Inbox, Target, Sun, PenLine, Shield,
} from 'lucide-react'
import logoImg from '../../assets/logo.jpeg'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, FirmasEntry } from '../../types'
import * as db from '../../lib/db'
import { buscarJugadoresParecidos } from '../../lib/duplicados'
import { guardarBorrador, leerBorrador, borrarBorrador, encolar, leerCola, procesarCola, esErrorDeRed, type ItemCola } from '../../lib/colaInformes'
import { ToastStack } from '../../components/ToastStack'
import { useToast } from '../../hooks/useToast'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useDebounce } from '../../hooks/useDebounce'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { isValidName } from '../../lib/validate'
import { clubBase, normEquipo } from '../../lib/zonas'
import { teamMatchKind } from '../../lib/equipos'
import { generarInformeMensual } from '../../lib/informeMensual'
import { type CaptacionTab, type ConclusionOption, type MatchScoutInfo, ALL_ASSESSMENTS, PRETEMPORADA_MIN_BIRTH_YEAR, normConclusion, personaToName, todayISO, isAfterToday } from './helpers'
import type { Props } from './types'
import { JugadoresTab, PAGE_SIZE, type JugadoresView } from './JugadoresTab'
import { InformesTab } from './InformesTab'
import { PartidosTab, MATCH_PAGE_SIZE, type MatchesView, type MatchModeFilter, type MatchStatusFilter } from './PartidosTab'
import { PretemporadaTab, type PreSortKey, type PreAssessFilter } from './PretemporadaTab'
import { PlanificacionTab } from './PlanificacionTab'
import { construirPlanificacion } from '../../lib/planificacion'
import { PlayerPanel } from './PlayerPanel'
import { EquiposTab, ZonasPanel } from './EquiposTab'
import { useFilasEquipos, inicioTemporada } from './filasEquipos'
import { ConclusionesTab } from './ConclusionesTab'
import { ContratosTab } from './ContratosTab'
import { FirmasTab } from './firmas/FirmasTab'
import { MatchDetailModal } from './partidos/MatchDetailModal'
import { MergeMatchesModal } from './partidos/MergeMatchesModal'
import { ActualizarPlantilla } from './partidos/ActualizarPlantilla'
import type { MatchFormState } from './partidos/MatchFormPanel'

export type { Props } from './types'

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
  matchOurPlayers,
  onAddMatchOurPlayer,
  onRemoveMatchOurPlayer,
  matchScouts,
  onAddMatchScout,
  onRemoveMatchScout,
  onSetMatchScoutStatus,
  onSetMatchScoutMode,
  openPlayerId,
  onOpenPlayerConsumed,
  openFirmasEntryId,
  onOpenFirmasEntryConsumed,
  openMatchId,
  onOpenMatchConsumed,
  openTab,
  onOpenTabConsumed,
  restricted,
  equipos,
  onSaveEquipo,
  clubZonas,
  onSetClubZona,
  players,
  onCreatePlayer,
  boulemaPeticiones,
  onSyncFirmasActionTasks,
  firmasEntries,
  onCreateFirmasEntry,
  onPatchFirmasEntry,
  onDeleteFirmasEntry,
}: Props) {
  const isAdmin = currentProfile.is_admin

  // ── toasts ──
  const { toasts, showToast, dismissToast } = useToast()

  // ── section tab ── (must be before header-height effect)
  const [captTab, setCaptTab] = useState<CaptacionTab>('jugadores')
  const RESTRICTED_TABS: CaptacionTab[] = ['jugadores', 'partidos', 'planificacion', 'informes']
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

  // Navegación externa: abrir la ficha de un partido (p. ej. desde «Mi día»)
  useEffect(() => {
    if (openMatchId) {
      setCaptTab('partidos')
      setDetailMatchId(openMatchId)
      onOpenMatchConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMatchId])

  // Navegación externa: abrir una pestaña (botón flotante «Planificación»)
  useEffect(() => {
    if (openTab) {
      setCaptTab(openTab)
      onOpenTabConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab])

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

  // Para la vista ampliada: último informe y estatus en el pipeline
  const ultimoInformeByPlayer = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of scoutingReports) {
      const d = r.fecha ?? r.createdAt
      if (!d) continue
      if (!m[r.playerId] || d > m[r.playerId]) m[r.playerId] = d
    }
    return m
  }, [scoutingReports])

  const firmasByPlayer = useMemo(() => {
    const m: Record<string, FirmasEntry> = {}
    firmasEntries.forEach(e => { if (e.scoutingPlayerId && !m[e.scoutingPlayerId]) m[e.scoutingPlayerId] = e })
    return m
  }, [firmasEntries])

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
  const [jugadoresView, setJugadoresView] = useState<JugadoresView>(
    () => (sessionStorage.getItem('capt_jugadores_view') as JugadoresView) ?? 'lista'
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
  const [zonasAbierto, setZonasAbierto] = useState(false)
  const [panelEquipo, setPanelEquipo] = useState<string | null>(null)
  // De qué equipo veníamos al abrir un jugador, para poder volver
  const [volverAEquipo, setVolverAEquipo] = useState<string | null>(null)
  /** Abrir la ficha de un jugador. `desdeEquipo` deja el botón «← volver». */
  const abrirJugador = useCallback((id: string | null, desdeEquipo?: string) => {
    setVolverAEquipo(desdeEquipo ?? null)
    setPanelEquipo(null)
    setPanelPlayerId(id)
  }, [])
  const isDesktop = useIsDesktop()   // en escritorio la ficha va a la derecha, no flotando
  // La tabla de partidos aparece a partir de sm (640px). Antes las dos vistas
  // —tarjetas de móvil y tabla— se pintaban SIEMPRE y una se escondía con CSS:
  // en el ordenador se construían 1.900 tarjetas invisibles en cada render.
  const isTablaAncha = useIsDesktop(640)

  // ── match filters ──
  const [matchSearch, setMatchSearch] = useState('')
  const matchSearchDeb = useDebounce(matchSearch, 250)
  // Vista de partidos: lista o agenda semanal
  const [matchesView, setMatchesView] = useState<MatchesView>(
    () => (sessionStorage.getItem('capt_matches_view') as MatchesView) ?? 'lista'
  )
  useEffect(() => { sessionStorage.setItem('capt_matches_view', matchesView) }, [matchesView])
  const [matchWeekOffset, setMatchWeekOffset] = useState(0)
  const [matchPersonaFilter, setMatchPersonaFilter] = useState('all')
  const [matchCompFilter, setMatchCompFilter] = useState('all')
  const [matchModeFilter, setMatchModeFilter] = useState<MatchModeFilter>('all')
  const [matchStatusFilter, setMatchStatusFilter] = useState<MatchStatusFilter>('all')
  /** Ocultar momentáneamente los partidos con fecha posterior a hoy (no se persiste) */
  const [hideFutureMatches, setHideFutureMatches] = useState(false)
  /** Fusión manual de partidos: modo selección + seleccionados + modal */
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [merging, setMerging] = useState(false)
  const toggleMergeSelected = useCallback((id: string) => setMergeSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }), [])
  const [reportPersonaFilter, setReportPersonaFilter] = useState('all')

  // ── pretemporada filters ──
  const [preSearch, setPreSearch] = useState('')
  const [preAssessFilter, setPreAssessFilter] = useState<PreAssessFilter>('all')
  const [preClubFilter, setPreClubFilter] = useState('all')
  const [prePosFilter, setPrePosFilter] = useState('all')
  const [preCatFilter, setPreCatFilter] = useState('all')
  const [preSortKey, setPreSortKey] = useState<PreSortKey>('assess')
  const [preSortDir, setPreSortDir] = useState<1 | -1>(1)

  // ── pagination ──
  const [page, setPage] = useState(0)

  // Fila del equipo que se está viendo en el panel lateral
  // Se calcula UNA vez aquí (antes también lo hacía EquiposTab por su cuenta) y se pasa por prop
  const desdeTemporada = inicioTemporada()
  const filasEquipos = useFilasEquipos(equipos, scoutingPlayers, scoutingReports, scoutingMatches, clubZonas, desdeTemporada)
  const filaEquipoAbierta = useMemo(
    () => panelEquipo ? filasEquipos.find(f => f.clave === normEquipo(panelEquipo)) ?? null : null,
    [filasEquipos, panelEquipo],
  )

  // Renombrar un equipo (el lápiz de la cabecera del panel). Arrastra consigo
  // a sus jugadores y a sus partidos: si no, quedarían apuntando a un equipo
  // que ya no existe y volveríamos a tener dos donde hay uno.
  const [renombrando, setRenombrando] = useState<string | null>(null)
  useEffect(() => { setRenombrando(null) }, [panelEquipo])

  async function guardarRenombre() {
    const f = filaEquipoAbierta
    const nuevo = (renombrando ?? '').trim()
    if (!f || !nuevo) { setRenombrando(null); return }
    if (nuevo === f.nombre) { setRenombrando(null); return }

    const jugadores = scoutingPlayers.filter(p => normEquipo(p.team) === f.clave)
    const local = scoutingMatches.filter(m => normEquipo(m.homeTeam) === f.clave)
    const visitante = scoutingMatches.filter(m => normEquipo(m.awayTeam) === f.clave)
    const partidos = new Set([...local, ...visitante].map(m => m.id)).size

    const yaExiste = filasEquipos.some(x => x.clave === normEquipo(nuevo) && x.clave !== f.clave)
    const aviso = yaExiste
      ? `Ya existe «${nuevo}». Los dos equipos quedarán fusionados en uno.\n\n`
      : ''
    if (!confirm(`${aviso}Renombrar «${f.nombre}» → «${nuevo}».\n\nSe actualizarán ${jugadores.length} jugador${jugadores.length !== 1 ? 'es' : ''} y ${partidos} partido${partidos !== 1 ? 's' : ''}.`)) return

    try {
      await db.renombrarEquipo({
        nombreViejo: f.nombre,
        nombreNuevo: nuevo,
        club: clubBase(nuevo),
        playerIds: jugadores.map(p => p.id),
        matchIdsLocal: local.map(m => m.id),
        matchIdsVisitante: visitante.map(m => m.id),
        quien: currentProfile.avatar,
      })
      jugadores.forEach(p => onUpdatePlayer({ ...p, team: nuevo }))
      local.forEach(m => onUpdateMatch({ ...m, homeTeam: nuevo }))
      visitante.forEach(m => onUpdateMatch({ ...m, awayTeam: nuevo }))
      await onSaveEquipo({ nombre: nuevo, club: clubBase(nuevo) })
      setPanelEquipo(nuevo)
      setRenombrando(null)
      showToast(`Equipo renombrado: ${nuevo}`)
    } catch {
      showToast('No se ha podido renombrar el equipo', 'error')
    }
  }

  // Sugerencias del catálogo para los campos Equipo y Categoría
  const equiposOrdenados = useMemo(
    () => [...equipos].filter(e => e.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [equipos],
  )
  const categoriasConocidas = useMemo(() => {
    const set = new Set<string>()
    for (const e of equipos) if (e.categoria) set.add(e.categoria)
    for (const p of scoutingPlayers) if (p.categoria) set.add(p.categoria)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [equipos, scoutingPlayers])

  // Índice id → jugador. Sin esto, cada sitio que necesita «quién es este id»
  // recorría los 3.700 jugadores enteros, y algunos lo hacían dentro de un map.
  const playersById = useMemo(() => {
    const m = new Map<string, ScoutingPlayer>()
    for (const p of scoutingPlayers) m.set(p.id, p)
    return m
  }, [scoutingPlayers])

  const panelPlayer = panelPlayerId ? playersById.get(panelPlayerId) ?? null : null
  const panelReports = useMemo(() => {
    if (!panelPlayerId) return []
    return scoutingReports
      .filter(r => r.playerId === panelPlayerId)
      .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
  }, [panelPlayerId, scoutingReports])

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    scoutingPlayers.forEach(p => { if (p.categoria) cats.add(p.categoria) })
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'es'))
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

  // ── matchPlayers lookup map (avoids O(n*m) scan per row during render) ──
  const matchPlayersByMatchId = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const mp of matchPlayers) {
      if (!map[mp.matchId]) map[mp.matchId] = []
      map[mp.matchId].push(mp.playerId)
    }
    return map
  }, [matchPlayers])

  // ── filtered matches ──
  // Orden: por día (más reciente primero, ya viene así de la BBDD) y, dentro
  // del mismo día, por hora — también de más reciente a más antigua. Antes
  // el segundo criterio no existía y dentro de un mismo día el orden salía
  // más o menos aleatorio (el de inserción en la base de datos).
  const filteredMatches = useMemo(() => {
    const q = matchSearchDeb.toLowerCase().trim()
    return scoutingMatches
      .filter(m => {
        if (matchPersonaFilter !== 'all' && !(scoutsByMatch[m.id] ?? []).some(s => s.scout === matchPersonaFilter)) return false
        if (matchCompFilter !== 'all' && m.competition !== matchCompFilter) return false
        if (matchModeFilter !== 'all' && (m.viewMode ?? 'video') !== matchModeFilter) return false
        if (matchStatusFilter !== 'all' && (m.status ?? 'pendiente') !== matchStatusFilter) return false
        if (hideFutureMatches && isAfterToday(m.date)) return false
        if (q) {
          const hay = `${m.homeTeam} ${m.awayTeam} ${m.competition ?? ''} ${m.notes ?? ''}`.toLowerCase()
          // también por nombre de los jugadores vinculados al partido
          const conJugador = (matchPlayersByMatchId[m.id] ?? []).some(id => playersById.get(id)?.fullName.toLowerCase().includes(q))
          if (!hay.includes(q) && !conJugador) return false
        }
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))
  }, [scoutingMatches, scoutsByMatch, matchPlayersByMatchId, playersById, matchSearchDeb, matchPersonaFilter, matchCompFilter, matchModeFilter, matchStatusFilter, hideFutureMatches])

  // Agenda semanal: antes, por cada uno de los 7 días se recorrían y ordenaban
  // los 1.900 partidos. Ahora se agrupan por fecha una sola vez.
  const matchesPorFecha = useMemo(() => {
    const map: Record<string, ScoutingMatch[]> = {}
    for (const m of filteredMatches) {
      if (!map[m.date]) map[m.date] = []
      map[m.date].push(m)
    }
    for (const lista of Object.values(map)) {
      lista.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
    }
    return map
  }, [filteredMatches])

  // El desplegable de competiciones se recalculaba con cada tecla del buscador
  const competicionesDisponibles = useMemo(
    () => Array.from(new Set(scoutingMatches.map(m => m.competition).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [scoutingMatches],
  )

  // Mis partidos pendientes (el aviso 🔔): antes se recorrían los 1.900 en cada
  // render, y además se construía un texto con TODOS ellos concatenados.
  const misPendientes = useMemo(
    () => scoutingMatches.filter(m => {
      if (m.status === 'visto') return false
      const mine = (scoutsByMatch[m.id] ?? []).find(s => s.scout === currentProfile.avatar)
      return !!mine && mine.status !== 'visto'
    }),
    [scoutingMatches, scoutsByMatch, currentProfile.avatar],
  )

  // Partidos por páginas (MATCH_PAGE_SIZE vive en PartidosTab)
  const [matchPage, setMatchPage] = useState(0)
  useEffect(() => { setMatchPage(0) }, [matchSearchDeb, matchPersonaFilter, matchCompFilter, matchModeFilter, matchStatusFilter, hideFutureMatches])
  const matchTotalPages = Math.max(1, Math.ceil(filteredMatches.length / MATCH_PAGE_SIZE))
  const matchesPagina = useMemo(
    () => filteredMatches.slice(matchPage * MATCH_PAGE_SIZE, (matchPage + 1) * MATCH_PAGE_SIZE),
    [filteredMatches, matchPage],
  )

  // ── «👤 3/5» de cada fila de Partidos ────────────────────────────────
  // Antes cada fila recorría los 3.700 jugadores Y los 12.000 informes para
  // sacar dos números. Con 1.900 partidos en pantalla eran ~30 millones de
  // vueltas por render, y se repetían con cada tecla del buscador: era la
  // causa principal de que la pestaña Partidos fuese lenta. Ahora se calcula
  // una sola vez para todos los partidos, con índices.
  const conteoPorPartido = useMemo(() => {
    const idsValidos = new Set(scoutingPlayers.map(p => p.id))
    const conInforme: Record<string, Set<string>> = {}
    for (const r of scoutingReports) {
      if (!r.matchId) continue
      if (!conInforme[r.matchId]) conInforme[r.matchId] = new Set()
      conInforme[r.matchId].add(r.playerId)
    }
    const map: Record<string, { total: number; conInforme: number }> = {}
    for (const [matchId, ids] of Object.entries(matchPlayersByMatchId)) {
      const set = conInforme[matchId]
      let total = 0, con = 0
      for (const id of ids) {
        if (!idsValidos.has(id)) continue
        total++
        if (set?.has(id)) con++
      }
      map[matchId] = { total, conInforme: con }
    }
    return map
  }, [matchPlayersByMatchId, scoutingPlayers, scoutingReports])

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
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
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
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [scoutingReports])

  // Ordenar los 12.000 informes es lo caro, y no depende del scout elegido:
  // se ordena una vez y el filtro solo recorre la lista ya ordenada.
  const reportsOrdenados = useMemo(
    () => [...scoutingReports].sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt)),
    [scoutingReports],
  )
  const recentReports = useMemo(() => {
    if (reportPersonaFilter === 'all') return reportsOrdenados.slice(0, 150)
    const out: ScoutingReport[] = []
    for (const r of reportsOrdenados) {
      if (r.persona !== reportPersonaFilter) continue
      out.push(r)
      if (out.length === 150) break
    }
    return out
  }, [reportsOrdenados, reportPersonaFilter])

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

  // Partidos del panel ordenados (los del equipo del jugador primero). Memoizado: antes se
  // copiaba y ordenaba toda la lista en cada render del componente.
  const panelSortedMatches = useMemo(() => {
    const playerTeam = panelPlayer?.team?.toLowerCase() ?? ''
    const sortedMatches = [...scoutingMatches].sort((a, b) => {
      const aMatch = playerTeam && (a.homeTeam.toLowerCase().includes(playerTeam) || a.awayTeam.toLowerCase().includes(playerTeam))
      const bMatch = playerTeam && (b.homeTeam.toLowerCase().includes(playerTeam) || b.awayTeam.toLowerCase().includes(playerTeam))
      if (aMatch && !bMatch) return -1
      if (!aMatch && bMatch) return 1
      return 0
    })
    return { playerTeam, sortedMatches }
  }, [scoutingMatches, panelPlayer?.team])

  // Al cambiar de jugador (o cerrar el panel) el formulario «Nuevo informe» vuelve a cero:
  // antes el texto/partido a medio escribir se arrastraba al siguiente jugador.
  // Va después del efecto de autoselección para que este reset sea el que prevalezca.
  useEffect(() => {
    setShowAddReportForm(false)
    setReportTitle('')
    setReportText('')
    setReportConclusion('')
    setReportMatchId('')
    setMatchSearchInput('')
    // el borrador del jugador anterior NO se toca: se guarda por jugador
    borradorActivoRef.current = false
    setBorradorRecuperado(false)
  }, [panelPlayerId])

  // ── Informes sin cobertura: borrador por jugador + cola de envío ──
  // Mientras se escribe, el informe se guarda en el navegador (600 ms tras la
  // última tecla). Si se cierra la app o se va la luz, al volver a abrir la
  // ficha de ese jugador reaparece. Solo se guarda con el formulario abierto
  // (el ref evita que el reset de arriba borre el borrador del siguiente).
  const borradorActivoRef = React.useRef(false)
  const [borradorRecuperado, setBorradorRecuperado] = useState(false)
  useEffect(() => {
    if (!showAddReportForm || !panelPlayerId) { borradorActivoRef.current = false; return }
    const b = leerBorrador(panelPlayerId)
    // Solo se restaura sobre un formulario vacío (el botón «Añadir informe» lo vacía antes de abrir)
    if (b && !reportText.trim() && !reportTitle.trim()) {
      setReportTitle(b.title)
      setReportText(b.text)
      setReportConclusion(b.conclusion as ConclusionOption)
      if (b.matchId) setReportMatchId(b.matchId)
      setBorradorRecuperado(true)
    }
    borradorActivoRef.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddReportForm, panelPlayerId])
  useEffect(() => {
    if (!borradorActivoRef.current || !panelPlayerId) return
    const t = setTimeout(() => {
      if (borradorActivoRef.current) guardarBorrador(panelPlayerId, { title: reportTitle, text: reportText, conclusion: reportConclusion, matchId: reportMatchId })
    }, 600)
    return () => clearTimeout(t)
  }, [panelPlayerId, reportTitle, reportText, reportConclusion, reportMatchId])
  const descartarBorrador = () => {
    if (panelPlayerId) borrarBorrador(panelPlayerId)
    setBorradorRecuperado(false)
    setReportTitle(''); setReportText(''); setReportConclusion(''); setReportMatchId('')
  }

  // Cola: informes que no se pudieron enviar por falta de red. Se reintenta
  // al montar, al recuperar la conexión, cada 60 s y al pulsar el chip de la
  // cabecera. El envío usa lo mismo que handleAddReport.
  const [colaInformes, setColaInformes] = useState<ItemCola[]>(() => leerCola())
  const procesandoColaRef = React.useRef(false)
  const enviarItemRef = React.useRef<(item: ItemCola) => Promise<void>>(async () => {})
  enviarItemRef.current = async (item: ItemCola) => {
    const saved = await db.createScoutingReport(item.report)
    onAddReport(saved)
    if (item.matchId) {
      // el informe ya está: un fallo del vínculo no debe dejarlo en la cola (se duplicaría)
      try { await onAddMatchPlayer(item.matchId, item.playerId) } catch (err) { console.error(err) }
    }
  }
  const procesarColaInformes = useCallback(async (avisar = false) => {
    if (procesandoColaRef.current) return
    if (leerCola().length === 0) { setColaInformes([]); return }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (avisar) showToast('Sigues sin conexión', 'info')
      return
    }
    procesandoColaRef.current = true
    try {
      const r = await procesarCola(item => enviarItemRef.current(item))
      setColaInformes(leerCola())
      if (r.enviados > 0) showToast(`${r.enviados} informe${r.enviados !== 1 ? 's' : ''} pendiente${r.enviados !== 1 ? 's' : ''} enviado${r.enviados !== 1 ? 's' : ''}`)
      else if (avisar && r.pendientes > 0) showToast('No se ha podido enviar todavía', 'error')
    } finally {
      procesandoColaRef.current = false
    }
  }, [showToast])
  useEffect(() => {
    void procesarColaInformes()
    const onOnline = () => void procesarColaInformes()
    window.addEventListener('online', onOnline)
    const t = setInterval(() => void procesarColaInformes(), 60_000)
    return () => { window.removeEventListener('online', onOnline); clearInterval(t) }
  }, [procesarColaInformes])

  // ── handlers ──

  async function handleAddReport() {
    if (!panelPlayer || !reportText.trim()) return
    setSavingReport(true)
    const datos = {
      playerId: panelPlayer.id,
      fecha: new Date().toISOString(),
      titulo: reportTitle.trim() || undefined,
      texto: reportText.trim(),
      persona: currentProfile.avatar,
      conclusion: reportConclusion || undefined,
      matchId: reportMatchId || undefined,
      authorId: currentProfile.id,
    }
    const limpiarFormulario = () => {
      // el borrador deja de tener sentido: ya está guardado (o en la cola)
      borradorActivoRef.current = false
      borrarBorrador(panelPlayer.id)
      setBorradorRecuperado(false)
      setReportTitle('')
      setReportText('')
      setReportConclusion('')
      setReportMatchId('')
    }
    try {
      const saved = await db.createScoutingReport(datos)
      onAddReport(saved)
      // El informe ya está guardado: se limpia el formulario ANTES de vincular al partido,
      // para que un fallo del vínculo no deje el texto ahí y se acabe guardando dos veces.
      const matchId = reportMatchId
      limpiarFormulario()
      if (matchId) {
        try {
          await onAddMatchPlayer(matchId, panelPlayer.id)
          showToast('Informe guardado')
        } catch {
          showToast('Informe guardado, pero no se pudo vincular al partido', 'error')
        }
      } else {
        showToast('Informe guardado')
      }
    } catch (err) {
      if (esErrorDeRed(err)) {
        // Sin red: a la cola, y se manda solo cuando vuelva la señal
        encolar({ playerId: panelPlayer.id, report: datos, matchId: reportMatchId || undefined })
        setColaInformes(leerCola())
        limpiarFormulario()
        showToast('Sin conexión: el informe se enviará cuando vuelva la señal', 'info')
      } else {
        showToast('Error al guardar el informe', 'error')
      }
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
    // Nuestros asignados a mano a este partido (misma lógica que la hoja de Planificación)
    const nuestros = construirPlanificacion({
      desde: dm.date, hasta: dm.date, scoutingMatches: [dm], matchScouts: [], matchOurPlayers, players,
    })[0]?.nuestros.map(p => p.name) ?? []
    return (
      <MatchDetailModal
        match={dm}
        nuestros={nuestros}
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
        onOpenEquipo={(nombre) => { setDetailMatchId(null); setCaptTab('equipos'); abrirJugador(null); setPanelEquipo(nombre.trim()) }}
        onCreateAndLinkPlayer={handleCreateAndLinkPlayer}
        onFixPlayerTeam={handleFixPlayerTeam}
        onOpenPlayer={id => { if (variant === 'modal') setDetailMatchId(null); abrirJugador(id) }}
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

  // ── aviso de duplicado al crear jugador ──
  // Con ≥ 4 letras se buscan fichas parecidas (por nombre, tokens o erratas)
  // y se enseñan bajo el nombre. No bloquea: «No, crear nuevo» esconde la caja.
  const nombreNuevoDeb = useDebounce(form.fullName, 300)
  const [ocultarParecidos, setOcultarParecidos] = useState(false)
  const jugadoresParecidos = useMemo(() => {
    if (!showAddPlayer || ocultarParecidos || nombreNuevoDeb.trim().length < 4) return []
    return buscarJugadoresParecidos(nombreNuevoDeb, form.team?.trim() || undefined, scoutingPlayers)
  }, [showAddPlayer, ocultarParecidos, nombreNuevoDeb, form.team, scoutingPlayers])

  function openAddPlayer() {
    setForm(emptyForm())
    setPlayerNameError('')
    setOcultarParecidos(false)
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

  // useCallback en los handlers de fila para que el React.memo de MatchRow tenga efecto
  const openEditMatch = useCallback((m: ScoutingMatch) => {
    setEditingMatch(m)
    setShowAddMatch(true)
  }, [])

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

  const handleDeleteMatch = useCallback(async (id: string) => {
    try {
      await db.deleteScoutingMatch(id)
      onDeleteMatch(id)
      showToast('Partido eliminado')
    } catch {
      showToast('Error al eliminar el partido', 'error')
    }
  }, [onDeleteMatch, showToast])

  const handleToggleMatchStatus = useCallback(async (m: ScoutingMatch) => {
    try {
      const updated: ScoutingMatch = { ...m, status: m.status === 'visto' ? 'pendiente' : 'visto' }
      await db.updateScoutingMatch(updated)
      onUpdateMatch(updated)
    } catch {
      showToast('Error al actualizar el estado del partido', 'error')
    }
  }, [onUpdateMatch, showToast])

  /** Guardar un partido ya existente (hora, notas, modo… desde la hoja de Planificación) */
  const guardarPartido = useCallback(async (m: ScoutingMatch) => {
    await db.updateScoutingMatch(m)
    onUpdateMatch(m)
  }, [onUpdateMatch])

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
    setPanelEquipo(null)
    setVolverAEquipo(null)
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

  const hasPanel = !!panelPlayer || showAddPlayer || showEditPlayer || !!panelEquipo

  useEscapeKey(
    closePanel,
    hasPanel &&
      !showAddPlayer && !showEditPlayer && !showAddReportForm &&
      editingReportCount === 0
  )

  // Pantalla partida: en escritorio el panel NO tapa la lista, la estrecha.
  // «Ampliar» (⤢) lo abre entero, ocupando toda la pantalla.
  const anchoPanel = 480
  const pantallaPartida = hasPanel && isDesktop && !fullscreen

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col transition-[padding] duration-150"
      style={pantallaPartida ? { paddingRight: anchoPanel } : undefined}
    >
      {/* Header */}
      <header ref={headerRef} className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-3 h-12 sm:h-14">
          <img src={logoImg} alt="All Iron Sports" className="h-7 sm:h-8 w-auto rounded" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase hidden sm:block">All Iron Sports</span>
          {colaInformes.length > 0 && (
            <button
              onClick={() => void procesarColaInformes(true)}
              title={colaInformes.find(x => x.ultimoError)?.ultimoError
                ? `Último error: ${colaInformes.find(x => x.ultimoError)!.ultimoError}. Clic para reintentar ahora.`
                : 'Se enviarán solos cuando vuelva la conexión. Clic para reintentar ahora.'}
              className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100 whitespace-nowrap"
            >
              📡 {colaInformes.length} informe{colaInformes.length !== 1 ? 's' : ''} pendiente{colaInformes.length !== 1 ? 's' : ''} de enviar
            </button>
          )}
          <div className="flex-1" />
          {/* Informe semanal en PDF: se abre listo para imprimir → «Guardar como PDF» */}
          <button
            onClick={() => generarInformeMensual({ scoutingPlayers, scoutingReports, scoutingMatches })}
            title="Informe mensual para clubes en PDF: jugadores de interés y campograma"
            className="text-xs font-semibold text-slate-500 hover:text-primary px-2 py-2 sm:py-1 rounded hover:bg-slate-100 whitespace-nowrap"
          >
            📄 <span className="hidden sm:inline">Informe mensual</span>
          </button>
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
            { id: 'equipos' as CaptacionTab, label: 'Equipos', labelMobile: 'Equipos', icon: <Shield className="w-3.5 h-3.5" /> },
            { id: 'informes' as CaptacionTab, label: 'Informes recientes', labelMobile: 'Informes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'partidos' as CaptacionTab, label: 'Partidos', labelMobile: 'Partidos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { id: 'planificacion' as CaptacionTab, label: 'Planificación', labelMobile: 'Planif.', icon: <CalendarDays className="w-3.5 h-3.5" /> },
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
        <JugadoresTab
          search={search} setSearch={setSearch}
          assessFilter={assessFilter} setAssessFilter={setAssessFilter}
          categoriaFilter={categoriaFilter} setCategoriaFilter={setCategoriaFilter}
          posFilter={posFilter} setPosFilter={setPosFilter}
          allCategories={allCategories}
          filtered={filtered}
          paginated={paginated}
          clubZonas={clubZonas}
          firmasByPlayer={firmasByPlayer}
          reportCountByPlayer={reportCountByPlayer}
          ultimoInformeByPlayer={ultimoInformeByPlayer}
          jugadoresView={jugadoresView} setJugadoresView={setJugadoresView}
          openAddPlayer={openAddPlayer}
          onUpdatePlayer={onUpdatePlayer}
          showToast={showToast}
          abrirJugador={abrirJugador}
          setShowAddPlayer={setShowAddPlayer} setShowEditPlayer={setShowEditPlayer}
          panelPlayerId={panelPlayerId}
          quickAssessId={quickAssessId} setQuickAssessId={setQuickAssessId}
          handleQuickAssessment={handleQuickAssessment}
          totalPages={totalPages} page={page} setPage={setPage}
        />
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
          onPatch={onPatchFirmasEntry}
          onDelete={onDeleteFirmasEntry}
          onOpenScoutingPlayer={(id) => { setCaptTab('jugadores'); abrirJugador(id) }}
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
              onOpenPlayer={id => abrirJugador(id)}
              clubZonas={clubZonas}
              onAbrirZonas={() => setZonasAbierto(true)}
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
              onOpenPlayer={id => abrirJugador(id)}
              onSetContract={handleQuickContract}
              onToggleMarketMap={handleToggleMarketMap}
              clubZonas={clubZonas}
              onAbrirZonas={() => setZonasAbierto(true)}
            />
          </div>
        </div>
      )}

      {/* ── INFORMES RECIENTES TAB ─────────────────────────── */}
      {captTab === 'equipos' && (
        <EquiposTab
          filas={filasEquipos}
          desde={desdeTemporada}
          onSaveEquipo={onSaveEquipo}
          onAbrirEquipo={n => { abrirJugador(null); setPanelEquipo(n) }}
          equipoAbierto={panelEquipo}
          onAbrirZonas={() => setZonasAbierto(true)}
          onAbrirPlantilla={() => setShowPlantilla(true)}
          showToast={showToast}
        />
      )}

      {captTab === 'informes' && (
        <InformesTab
          reportsByPersonaRanked={reportsByPersonaRanked}
          profiles={profiles}
          recentReports={recentReports}
          playersById={playersById}
          scoutingMatches={scoutingMatches}
          reportPersonas={reportPersonas}
          reportPersonaFilter={reportPersonaFilter} setReportPersonaFilter={setReportPersonaFilter}
          setCaptTab={setCaptTab}
          abrirJugador={abrirJugador}
        />
      )}

      {/* ── ESTADÍSTICAS TAB ──────────────────────────────── */}
      {/* ── PARTIDOS TAB ──────────────────────────────────── */}
      {captTab === 'partidos' && (
        <PartidosTab
          detailMatchId={detailMatchId} setDetailMatchId={setDetailMatchId}
          isDesktop={isDesktop} isTablaAncha={isTablaAncha}
          misPendientes={misPendientes}
          scoutingMatches={scoutingMatches}
          matchesView={matchesView} setMatchesView={setMatchesView}
          openAddMatch={openAddMatch}
          matchWeekOffset={matchWeekOffset} setMatchWeekOffset={setMatchWeekOffset}
          matchesPorFecha={matchesPorFecha}
          showAddMatch={showAddMatch} setShowAddMatch={setShowAddMatch}
          editingMatch={editingMatch} setEditingMatch={setEditingMatch}
          profiles={profiles}
          handleSaveMatch={handleSaveMatch}
          showToast={showToast}
          matchSearch={matchSearch} setMatchSearch={setMatchSearch}
          matchPersonaFilter={matchPersonaFilter} setMatchPersonaFilter={setMatchPersonaFilter}
          matchCompFilter={matchCompFilter} setMatchCompFilter={setMatchCompFilter}
          competicionesDisponibles={competicionesDisponibles}
          matchModeFilter={matchModeFilter} setMatchModeFilter={setMatchModeFilter}
          matchStatusFilter={matchStatusFilter} setMatchStatusFilter={setMatchStatusFilter}
          hideFutureMatches={hideFutureMatches} setHideFutureMatches={setHideFutureMatches}
          mergeMode={mergeMode} setMergeMode={setMergeMode}
          mergeSelected={mergeSelected} setMergeSelected={setMergeSelected} toggleMergeSelected={toggleMergeSelected}
          filteredMatches={filteredMatches}
          matchesPagina={matchesPagina}
          matchPlayersByMatchId={matchPlayersByMatchId}
          playersById={playersById}
          scoutsByMatch={scoutsByMatch}
          conteoPorPartido={conteoPorPartido}
          handleToggleMatchStatus={handleToggleMatchStatus}
          openEditMatch={openEditMatch}
          handleDeleteMatch={handleDeleteMatch}
          onRemoveMatchPlayer={onRemoveMatchPlayer}
          currentProfile={currentProfile}
          isAdmin={isAdmin}
          matchPage={matchPage} setMatchPage={setMatchPage} matchTotalPages={matchTotalPages}
          renderFichaPartido={renderFichaPartido}
        />
      )}

      {/* ── PLANIFICACIÓN TAB (la hoja de fin de semana) ───────── */}
      {captTab === 'planificacion' && (
        <PlanificacionTab
          scoutingMatches={scoutingMatches}
          matchScouts={matchScouts}
          matchOurPlayers={matchOurPlayers}
          players={players}
          profiles={profiles}
          onAddMatchOurPlayer={onAddMatchOurPlayer}
          onRemoveMatchOurPlayer={onRemoveMatchOurPlayer}
          showAddMatch={showAddMatch} setShowAddMatch={setShowAddMatch}
          editingMatch={editingMatch} setEditingMatch={setEditingMatch}
          handleSaveMatch={handleSaveMatch}
          openAddMatch={openAddMatch}
          showToast={showToast}
          guardarPartido={guardarPartido}
          onAddScout={handleAddScoutToMatch}
          onRemoveScout={handleRemoveScoutFromMatch}
          onSetScoutMode={handleScoutMode}
          setDetailMatchId={setDetailMatchId}
          renderFichaPartido={renderFichaPartido}
          isDesktop={isDesktop}
        />
      )}

      {/* ── PRETEMPORADA TAB ──────────────────────────────────── */}
      {captTab === 'pretemporada' && (
        <PretemporadaTab
          pretemporadaData={pretemporadaData}
          pretemporadaFiltered={pretemporadaFiltered}
          preSearch={preSearch} setPreSearch={setPreSearch}
          preClubFilter={preClubFilter} setPreClubFilter={setPreClubFilter}
          preClubOptions={preClubOptions}
          prePosFilter={prePosFilter} setPrePosFilter={setPrePosFilter}
          preCatOptions={preCatOptions}
          preCatFilter={preCatFilter} setPreCatFilter={setPreCatFilter}
          preAssessFilter={preAssessFilter} setPreAssessFilter={setPreAssessFilter}
          preSortKey={preSortKey} preSortDir={preSortDir} setPreSort={setPreSort}
          setCaptTab={setCaptTab}
          abrirJugador={abrirJugador}
        />
      )}

      {/* ── BOULEMA TAB ──────────────────────────────────────── */}
      {/* ── Side panel (persists across tabs) ─────────────────── */}
      {hasPanel && (
        <PlayerPanel
          fullscreen={fullscreen} setFullscreen={setFullscreen}
          isDesktop={isDesktop}
          headerHeight={headerHeight}
          closePanel={closePanel}
          showToast={showToast}
          isAdmin={isAdmin}
          currentProfile={currentProfile}
          profiles={profiles}
          setCaptTab={setCaptTab}
          abrirJugador={abrirJugador}
          panelPlayerId={panelPlayerId} panelPlayer={panelPlayer} setPanelPlayerId={setPanelPlayerId}
          panelEquipo={panelEquipo} setPanelEquipo={setPanelEquipo}
          volverAEquipo={volverAEquipo} setVolverAEquipo={setVolverAEquipo}
          showAddPlayer={showAddPlayer} setShowAddPlayer={setShowAddPlayer}
          showEditPlayer={showEditPlayer} setShowEditPlayer={setShowEditPlayer}
          editTarget={editTarget}
          filaEquipoAbierta={filaEquipoAbierta}
          renombrando={renombrando} setRenombrando={setRenombrando} guardarRenombre={guardarRenombre}
          onSaveEquipo={onSaveEquipo}
          setZonasAbierto={setZonasAbierto}
          setDetailMatchId={setDetailMatchId}
          categoriasConocidas={categoriasConocidas}
          equiposOrdenados={equiposOrdenados}
          equipos={equipos}
          scoutingMatches={scoutingMatches}
          form={form} setForm={setForm} emptyForm={emptyForm}
          playerNameError={playerNameError} setPlayerNameError={setPlayerNameError}
          jugadoresParecidos={jugadoresParecidos} setOcultarParecidos={setOcultarParecidos}
          reportCountByPlayer={reportCountByPlayer}
          handleSavePlayer={handleSavePlayer} savingPlayer={savingPlayer}
          firmasEntries={firmasEntries}
          onCreateFirmasEntry={onCreateFirmasEntry}
          setFirmasJumpId={setFirmasJumpId}
          handleQuickAssessment={handleQuickAssessment}
          openEditPlayer={openEditPlayer}
          confirmDeletePlayer={confirmDeletePlayer} setConfirmDeletePlayer={setConfirmDeletePlayer}
          handleDeletePlayer={handleDeletePlayer}
          panelReports={panelReports}
          panelSortedMatches={panelSortedMatches}
          showAddReportForm={showAddReportForm} setShowAddReportForm={setShowAddReportForm}
          reportTitle={reportTitle} setReportTitle={setReportTitle}
          reportText={reportText} setReportText={setReportText}
          reportConclusion={reportConclusion} setReportConclusion={setReportConclusion}
          reportMatchId={reportMatchId} setReportMatchId={setReportMatchId}
          reportMatchSuggestions={reportMatchSuggestions}
          matchSearchInput={matchSearchInput} setMatchSearchInput={setMatchSearchInput}
          matchSearchOpen={matchSearchOpen} setMatchSearchOpen={setMatchSearchOpen}
          savingReport={savingReport}
          handleAddReport={handleAddReport}
          borradorRecuperado={borradorRecuperado} descartarBorrador={descartarBorrador}
          confirmDeleteReport={confirmDeleteReport} setConfirmDeleteReport={setConfirmDeleteReport}
          handleDeleteReport={handleDeleteReport} handleUpdateReport={handleUpdateReport}
          handleReportEditingChange={handleReportEditingChange}
          matchPlayers={matchPlayers}
          onRemoveMatchPlayer={onRemoveMatchPlayer}
        />
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

      {zonasAbierto && (
        <ZonasPanel
          players={scoutingPlayers}
          clubZonas={clubZonas}
          onSetClubZona={onSetClubZona}
          onClose={() => setZonasAbierto(false)}
          showToast={showToast}
        />
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
