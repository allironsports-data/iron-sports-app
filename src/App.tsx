import { useState, useEffect, useCallback, useMemo, useRef, lazy } from 'react'
import { useAuth } from './hooks/useAuth'
import type { Player, Task, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, BoulemaPeticion, MemberStatus, Postpartido, FirmasEntry, BoulemaPlayer } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
import { SavingIndicator, BottomNav, GlobalSearch, SystemNotifPrompt } from './components/GlobalExtras'
import { fireSystemNotification, type MainSection } from './components/globalExtras'
import { ConflictModal } from './components/ConflictModal'
import type { ConflictInfo } from './components/conflict'
import { BUILD_ID } from './changelog'
import { esZona, type Zona } from './lib/zonas'
import { teamsAlike } from './lib/equipos'
import type { ReactNode } from 'react'
import type { Club, DistributionEntry, ClubNegotiation } from './types'

// Code-splitting por vista: en móvil solo se descarga el código de la
// sección visitada (reduce mucho la carga inicial del bundle).
const Dashboard        = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })))
const PlayerDetail     = lazy(() => import('./views/PlayerDetail').then(m => ({ default: m.PlayerDetail })))
const AdminPanel       = lazy(() => import('./views/AdminPanel').then(m => ({ default: m.AdminPanel })))
const OverviewPanel    = lazy(() => import('./views/OverviewPanel').then(m => ({ default: m.OverviewPanel })))
const PlayersTable     = lazy(() => import('./views/PlayersTable').then(m => ({ default: m.PlayersTable })))
const Distribution     = lazy(() => import('./views/Distribution').then(m => ({ default: m.Distribution })))
const ClubDetail       = lazy(() => import('./views/ClubDetail').then(m => ({ default: m.ClubDetail })))
const Captacion        = lazy(() => import('./views/Captacion').then(m => ({ default: m.Captacion })))
const Contactos        = lazy(() => import('./views/Contactos').then(m => ({ default: m.Contactos })))
const TeamMemberDetail = lazy(() => import('./views/TeamMemberDetail').then(m => ({ default: m.TeamMemberDetail })))
const Boulema          = lazy(() => import('./views/Boulema').then(m => ({ default: m.Boulema })))
const MiDia            = lazy(() => import('./views/MiDia').then(m => ({ default: m.MiDia })))

export interface AppNotification {
  id: string
  message: string
  type: 'task_new' | 'task_done' | 'birthday' | 'negotiation'
  playerId?: string
  ts: number
}

// Etiquetas de estatus del pipeline (para los avisos a los encargados)
const FIRMAS_STATUS_LABEL: Record<string, string> = {
  llamar: 'Llamar', caliente: 'Caliente', templado: 'Templado',
  frio: 'Frío', decidir: 'Decidir', firmado: 'Firmado',
}

// Las zonas llegan como filas; dentro de la app se usan como diccionario
function zonasAMapa(filas: db.ClubZona[]): Record<string, Zona> {
  const m: Record<string, Zona> = {}
  for (const f of filas) if (esZona(f.zona)) m[f.club] = f.zona
  return m
}

const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

// Tablas que se sincronizan solas entre usuarios: las escucha el realtime y
// se vuelven a pedir enteras al volver a la pestaña (ver «resync» más abajo).
const SYNC_TABLES = [
  'club_negotiations', 'distribution_entries', 'clubs', 'players', 'tasks',
  'member_status', 'postpartidos', 'captacion_firmas',
  'scouting_matches', 'scouting_match_players', 'scouting_match_scouts',
  'scouting_reports', 'scouting_players', 'scouting_club_zonas', 'scouting_equipos',
] as const

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const { profileMissing, profileError, refreshProfile, user, profile, loading, signIn, signOut } = useAuth()

  const [players, setPlayers] = useState<Player[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const profilesRef = useRef<Profile[]>([])
  // Refs con el estado actual para los handlers de realtime. Antes leían el
  // estado con setX(prev => { ...avisos...; return prev }): un updater debe
  // ser puro y con StrictMode React lo ejecuta dos veces → avisos duplicados.
  const playersRef = useRef<Player[]>([])
  const tasksRef = useRef<Task[]>([])
  const clubsRef = useRef<Club[]>([])
  const scoutingPlayersRef = useRef<ScoutingPlayer[]>([])
  const scoutingMatchesRef = useRef<ScoutingMatch[]>([])
  const firmasEntriesRef = useRef<FirmasEntry[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // ── Nav state — persisted in sessionStorage so refresh restores position ──
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    () => sessionStorage.getItem('nav_playerId')
  )
  const [selectedClubId, setSelectedClubId] = useState<string | null>(
    () => sessionStorage.getItem('nav_clubId')
  )
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    () => sessionStorage.getItem('nav_profileId')
  )
  // secciones principales (+ «Mi día»)
  const [mainSection, setMainSection] = useState<MainSection>(
    () => (sessionStorage.getItem('nav_section') as MainSection) ?? 'tareas'
  )
  // where to return after closing PlayerDetail
  const [playerReturnToClub, setPlayerReturnToClub] = useState(false)
  // club en pantalla partida ampliado a pantalla completa
  const [clubExpanded, setClubExpanded] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [showContacts, setShowContacts] = useState(() => window.location.hash === '#contactos')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [phase2Loading, setPhase2Loading] = useState(false)
  // Qué tablas han fallado al cargar. Antes fallaban en silencio y la app
  // enseñaba listas vacías: parecía «no hay datos» cuando era «no he podido
  // preguntar». Ahora sale un aviso rojo con el nombre de lo que falta.
  const [cargasFallidas, setCargasFallidas] = useState<string[]>([])
  const [updateAvailable, setUpdateAvailable] = useState(false)

  // Distribution state
  const [clubs, setClubs] = useState<Club[]>([])
  const [distEntries, setDistEntries] = useState<DistributionEntry[]>([])
  const [negotiations, setNegotiations] = useState<ClubNegotiation[]>([])

  // Estado del equipo (panel "¿con qué está cada uno?")
  const [memberStatuses, setMemberStatuses] = useState<MemberStatus[]>([])

  // Postpartidos
  const [postpartidos, setPostpartidos] = useState<Postpartido[]>([])

  // Navegación externa a una ficha de Captación (p. ej. desde Boulema)
  const [captacionOpenPlayerId, setCaptacionOpenPlayerId] = useState<string | null>(null)
  const [captacionOpenFirmasId, setCaptacionOpenFirmasId] = useState<string | null>(null)
  // Abrir una pestaña concreta de Captación (botón flotante «Planificación»)
  const [captacionOpenTab, setCaptacionOpenTab] = useState<'planificacion' | null>(null)
  // Abrir un partido concreto en Captación (desde «Mi día»)
  const [captacionOpenMatchId, setCaptacionOpenMatchId] = useState<string | null>(null)
  // Abrir una tarea concreta en el tablero (desde «Mi día»)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  // Captación state
  const [scoutingPlayers, setScoutingPlayers] = useState<ScoutingPlayer[]>([])
  const [scoutingReports, setScoutingReports] = useState<ScoutingReport[]>([])
  const [scoutingMatches, setScoutingMatches] = useState<ScoutingMatch[]>([])
  const [matchPlayers, setMatchPlayers] = useState<ScoutingMatchPlayer[]>([])
  const [matchScouts, setMatchScouts] = useState<ScoutingMatchScout[]>([])
  const [boulemaPeticiones, setBoulemaPeticiones] = useState<BoulemaPeticion[]>([])
  const [firmasEntries, setFirmasEntries] = useState<FirmasEntry[]>([])
  const [boulemaPlayers, setBoulemaPlayers] = useState<BoulemaPlayer[]>([])
  // Correcciones de zona hechas a mano (la clasificación por defecto vive en src/lib/zonas.ts)
  const [clubZonas, setClubZonas] = useState<Record<string, Zona>>({})
  // Catálogo de equipos (pestaña Captación → Equipos)
  const [equipos, setEquipos] = useState<db.Equipo[]>([])

  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { clubsRef.current = clubs }, [clubs])
  useEffect(() => { scoutingPlayersRef.current = scoutingPlayers }, [scoutingPlayers])
  useEffect(() => { scoutingMatchesRef.current = scoutingMatches }, [scoutingMatches])
  useEffect(() => { firmasEntriesRef.current = firmasEntries }, [firmasEntries])

  // Tareas «solo admin»: quien no es admin no debe verlas en ningún sitio
  // (ficha de jugador, ficha de miembro, búsqueda global). Dashboard ya
  // filtra por su cuenta, así que ahí se le sigue pasando `tasks`.
  const tasksVisibles = useMemo(
    () => profile?.is_admin ? tasks : tasks.filter(t => !t.adminOnly),
    [tasks, profile?.is_admin],
  )

  // Guard anti-bucle de la sincronización Firmar ⇄ Tareas.
  // DEBE declararse aquí arriba: es un hook y no puede ir después de los
  // returns tempranos (loading/login) — romperlo deja la app en blanco.
  const firmasSyncGuard = useRef(false)

  // Conflicto de edición pendiente de decisión (ver guardarConControl más
  // abajo). `recargar` aplica lo suyo; `reintentar` sobrescribe.
  const [conflict, setConflict] = useState<(ConflictInfo & { recargar: () => void }) | null>(null)
  // Si llegan dos conflictos seguidos (raro), el segundo espera a que se
  // resuelva el primero en vez de pisarle el modal.
  const conflictChainRef = useRef<Promise<void>>(Promise.resolve())

  // Cola de parches por tarjeta de Firmar: dos parches al mismo id se
  // ejecutan uno detrás de otro (si no, el segundo update pisa al primero).
  const patchQueue = useRef(new Map<string, Promise<void>>())

  // Contador por tabla para refetchTable: si mientras llegaba una lectura
  // se ha pedido otra más nueva de la misma tabla, la vieja se descarta
  // (llegaban fuera de orden y dejaban el estado con datos antiguos).
  const seqRef = useRef<Record<string, number>>({})

  // ── Detector de versión nueva de la app ───────────────────
  // Compara el BUILD_ID compilado con /version.json (que cambia en cada
  // deploy). Comprueba cada 5 min y al volver a la pestaña.
  const updateNotifiedRef = useRef(false)
  useEffect(() => {
    if (BUILD_ID === 'dev') return
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { buildId?: string }
        if (!cancelled && j.buildId && j.buildId !== BUILD_ID) {
          setUpdateAvailable(true)
          if (!updateNotifiedRef.current) {
            updateNotifiedRef.current = true
            addNotification('🚀 Hay una versión nueva de la app — recarga para ver las novedades', 'task_new')
          }
        }
      } catch { /* sin red o respuesta no JSON: se reintenta en el siguiente ciclo */ }
    }
    const iv = setInterval(check, 5 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVis)
    const initial = setTimeout(check, 60 * 1000)
    return () => { cancelled = true; clearInterval(iv); clearTimeout(initial); document.removeEventListener('visibilitychange', onVis) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Búsqueda global: ⌘K / Ctrl+K ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Título del documento según dónde estés ────────────────
  useEffect(() => {
    const names: Record<string, string> = { tareas: 'Mantenimiento', jugadores: 'Jugadores', distribucion: 'Distribución', captacion: 'Captación', boulema: 'Boulema', 'mi-dia': 'Mi día' }
    const player = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : undefined
    document.title = player ? `${player.name} · AIS` : `${names[mainSection] ?? 'AIS'} · All Iron Sports`
  }, [mainSection, selectedPlayerId, players])

  // ── Rutas compartibles (hash): #/seccion, #/jugador/id, #/club/id, #/miembro/id ──
  useEffect(() => {
    if (showContacts) return  // #contactos se gestiona aparte
    const h = selectedPlayerId ? `#/jugador/${selectedPlayerId}`
      : selectedProfileId ? `#/miembro/${selectedProfileId}`
      : selectedClubId ? `#/club/${selectedClubId}`
      : `#/${mainSection}`
    if (window.location.hash !== h) window.location.hash = h
  }, [mainSection, selectedPlayerId, selectedClubId, selectedProfileId, showContacts])

  // Cuenta «solo Captación»: el router de hash no debe abrir jugador/club/
  // miembro ni otras secciones aunque alguien pegue el enlace.
  const captacionOnlyRef = useRef(false)
  useEffect(() => {
    captacionOnlyRef.current = !!profile?.captacion_only
    if (profile?.captacion_only) {
      setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null)
      setMainSection('captacion')
    }
  }, [profile?.captacion_only])

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash
      if (!h || h === '#contactos') return
      const m = h.match(/^#\/(jugador|club|miembro)\/(.+)$/)
      if (captacionOnlyRef.current) {
        // solo Captación y Mi día
        if (h === '#/mi-dia') setMainSection('mi-dia')
        else if (h !== '#/captacion') setMainSection('captacion')
        return
      }
      if (m) {
        if (m[1] === 'jugador') { setSelectedProfileId(null); setSelectedPlayerId(m[2]) }
        else if (m[1] === 'club') { setSelectedPlayerId(null); setSelectedProfileId(null); setSelectedClubId(m[2]); setMainSection('distribucion') }
        else { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(m[2]) }
        return
      }
      const s = h.replace('#/', '')
      if (['tareas', 'jugadores', 'distribucion', 'captacion', 'boulema', 'mi-dia'].includes(s)) {
        setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null)
        setMainSection(s as typeof mainSection)
      }
    }
    window.addEventListener('hashchange', apply)
    apply() // enlace compartido al cargar
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  // ── Persist nav state to sessionStorage ───────────────────
  useEffect(() => {
    if (selectedPlayerId)  sessionStorage.setItem('nav_playerId',  selectedPlayerId)
    else                   sessionStorage.removeItem('nav_playerId')
  }, [selectedPlayerId])
  useEffect(() => {
    if (selectedClubId)    sessionStorage.setItem('nav_clubId',    selectedClubId)
    else                   sessionStorage.removeItem('nav_clubId')
  }, [selectedClubId])
  useEffect(() => {
    if (selectedProfileId) sessionStorage.setItem('nav_profileId', selectedProfileId)
    else                   sessionStorage.removeItem('nav_profileId')
  }, [selectedProfileId])
  useEffect(() => {
    sessionStorage.setItem('nav_section', mainSection)
  }, [mainSection])

  const addNotification = useCallback((msg: string, type: AppNotification['type'], playerId?: string) => {
    setNotifications((prev) => [
      { id: 'n' + Date.now() + Math.random(), message: msg, type, playerId, ts: Date.now() },
      ...prev,
    ].slice(0, 50))
    // Con permiso, también salta como notificación del sistema si la pestaña está en segundo plano
    fireSystemNotification(msg)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // Load all data once authenticated — depend on user.id not the object reference
  // so token refreshes (which create a new user object) don't trigger a reload
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setDataLoading(true)
    setDataError(null)

    // FASE 1 — datos críticos (bloquean la UI): jugadores, tareas y perfiles.
    // FASE 2 — el resto carga en segundo plano (importante en datos móviles:
    // la app es usable en cuanto llega la fase 1).
    Promise.all([
      db.fetchPlayers(),
      db.fetchTasks(),
      db.fetchProfiles(),
    ]).then(([p, t, pr]) => {
      if (cancelled) return
      setPlayers(p)
      setTasks(t)
      profilesRef.current = pr as Profile[]
      setProfiles(pr as Profile[])
      setDataLoading(false)

      // Fase 2 en background
      setPhase2Loading(true)
      // Cada lectura va protegida por separado: si una falla, las demás
      // siguen cargando y apuntamos cuál ha sido para avisar en pantalla.
      // (Antes, un fallo en cualquiera de las 7 primeras tiraba la fase
      //  entera y las otras 8 devolvían [] sin decir nada.)
      const fallos: string[] = []
      const opc = <T,>(nombre: string, p: Promise<T>, vacio: T): Promise<T> =>
        p.catch((err: unknown) => {
          console.error(`[carga] ${nombre}:`, err)
          fallos.push(nombre)
          return vacio
        })
      Promise.all([
        opc('Clubes', db.fetchClubs(), []),
        opc('Distribución', db.fetchDistributionEntries(), []),
        opc('Negociaciones', db.fetchNegotiations(), []),
        opc('Jugadores de captación', db.fetchScoutingPlayers(), []),
        opc('Informes', db.fetchScoutingReports(), []),
        opc('Partidos', db.fetchScoutingMatches(), []),
        opc('Alineaciones', db.fetchMatchPlayers(), []),
        opc('Scouts de partido', db.fetchMatchScouts(), [] as ScoutingMatchScout[]),
        opc('Peticiones Boulema', db.fetchBoulemaPeticiones(), [] as BoulemaPeticion[]),
        opc('Estado del equipo', db.fetchMemberStatuses(), [] as MemberStatus[]),
        opc('Postpartidos', db.fetchPostpartidos(), [] as Postpartido[]),
        opc('Pipeline de firmas', db.fetchFirmasEntries(), [] as FirmasEntry[]),
        opc('Jugadores Boulema', db.fetchBoulemaPlayers(), [] as BoulemaPlayer[]),
        opc('Zonas', db.fetchClubZonas(), [] as db.ClubZona[]),
        opc('Catálogo de equipos', db.fetchEquipos(), [] as db.Equipo[]),
      ]).then(([cl, de, ng, sp, sr, sm, mp, msc, bp, ms, pp, fe, bpl, cz, eq]) => {
        if (cancelled) return
        setClubs(cl as Club[])
        setDistEntries(de as DistributionEntry[])
        setNegotiations(ng as ClubNegotiation[])
        setScoutingPlayers(sp as ScoutingPlayer[])
        setScoutingReports(sr as ScoutingReport[])
        setScoutingMatches(sm as ScoutingMatch[])
        setMatchPlayers(mp as ScoutingMatchPlayer[])
        setMatchScouts(msc as ScoutingMatchScout[])
        setBoulemaPeticiones(bp as BoulemaPeticion[])
        setMemberStatuses(ms as MemberStatus[])
        setPostpartidos(pp as Postpartido[])
        setFirmasEntries(fe as FirmasEntry[])
        setBoulemaPlayers(bpl as BoulemaPlayer[])
        setClubZonas(zonasAMapa(cz as db.ClubZona[]))
        setEquipos(eq as db.Equipo[])
        setCargasFallidas(fallos)
        setPhase2Loading(false)
      }).catch((err: unknown) => {
        // No bloquea la app: Distribución/Captación mostrarán listas vacías
        console.error('Error cargando datos secundarios:', err)
        setPhase2Loading(false)
      })
    }).catch((err: unknown) => {
      if (cancelled) return
      console.error('Error cargando datos iniciales:', err)
      setDataError(err instanceof Error ? err.message : 'Error desconocido')
      setDataLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reloadKey])  // user.id — not the object — so token refreshes don't re-trigger this

  // Supabase realtime: listen for task changes from other users
  useEffect(() => {
    if (!user || !profile) return

    const channel = supabase.channel('task-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const playerId = row.player_id as string
        const title = row.title as string
        // (el canal data-sync ya recarga las tareas: no duplicamos la lectura)
        // Check if player is managed by current user
        const p = playersRef.current.find((pl) => pl.id === playerId)
        if (p && p.managedBy.includes(profile.id)) {
          addNotification(`Nueva tarea: "${title}" para ${p.name}`, 'task_new', playerId)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const playerId = row.player_id as string
        const title = row.title as string
        const status = row.status as string
        // (el canal data-sync ya recarga las tareas: no duplicamos la lectura)
        if (status === 'completada') {
          const p = playersRef.current.find((pl) => pl.id === playerId)
          if (p && p.managedBy.includes(profile.id)) {
            addNotification(`Tarea completada: "${title}" de ${p.name}`, 'task_done', playerId)
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const authorId = row.author_id as string
        // Don't notify if I wrote the comment
        if (authorId === profile.id) return
        const taskId = row.task_id as string
        const content = row.content as string
        const preview = content.length > 40 ? content.slice(0, 40) + '…' : content
        const task = tasksRef.current.find((t) => t.id === taskId)
        if (!task) return
        // Notify if I'm the assignee or a watcher
        const amInvolved =
          task.assigneeId === profile.id ||
          (task.watchers ?? []).includes(profile.id)
        if (amInvolved) {
          const authorProfile = profilesRef.current.find((p) => p.id === authorId)
          const who = authorProfile?.name.split(' ')[0] ?? 'Alguien'
          addNotification(
            `${who} comentó en "${task.title}": ${preview}`,
            'task_new',
            task.playerId !== 'general' ? task.playerId : undefined
          )
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scouting_match_players' }, (payload: { new: Record<string, unknown> }) => {
        // Un scout ha añadido a un jugador al campograma: si está en el pipeline
        // de Firmar y soy su encargado, acaba de haber contacto visual — avisar
        const row = payload.new as Record<string, unknown>
        const playerId = row.player_id as string
        const matchId = row.match_id as string
        const e = firmasEntriesRef.current.find((x) => x.scoutingPlayerId === playerId && x.status !== 'firmado' && x.managers.includes(profile.id))
        if (e) {
          const m = scoutingMatchesRef.current.find((x) => x.id === matchId)
          addNotification(
            `Firmar · ${e.playerName}: le han visto en ${m ? `${m.homeTeam} vs ${m.awayTeam}` : 'un partido'} — buen momento para llamar`,
            'task_new'
          )
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scouting_matches' }, (payload: { new: Record<string, unknown> }) => {
        // Partido nuevo: avisar a los encargados de jugadores del pipeline cuyo equipo juega
        const row = payload.new as Record<string, unknown>
        const home = (row.home_team as string) ?? ''
        const away = (row.away_team as string) ?? ''
        const date = (row.date as string) ?? ''
        // Antes hab\u00eda aqu\u00ed una comparaci\u00f3n propia que daba por buenos
        // \u00abReal Madrid\u00bb \u2194 \u00abReal Sociedad\u00bb (una contiene a la otra) y soltaba
        // avisos de partidos que no eran. Ahora usa la misma que Captaci\u00f3n.
        const alike = teamsAlike
        // leer estado actual sin cerrar sobre valores viejos
        const prevSp = scoutingPlayersRef.current
        firmasEntriesRef.current
          .filter((e) => e.status !== 'firmado' && e.managers.includes(profile.id) && e.scoutingPlayerId)
          .forEach((e) => {
            const sp = prevSp.find((p) => p.id === e.scoutingPlayerId)
            if (!sp?.team) return
            if (alike(sp.team, home) || alike(sp.team, away)) {
              addNotification(
                `Firmar · ${e.playerName}: partido nuevo de su equipo — ${home} vs ${away}${date ? ` (${date})` : ''}`,
                'task_new'
              )
            }
          })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'captacion_firmas' }, (payload: { new: Record<string, unknown> }) => {
        // Aviso a los encargados taggeados de CUALQUIER cambio en la tarjeta:
        // apuntes nuevos, estatus, próxima acción, zona, notas o encargados.
        // El "antes" lo saca del estado local (Supabase no manda payload.old),
        // así que el aviso dice exactamente qué ha cambiado.
        const row = payload.new as Record<string, unknown>
        const id = row.id as string
        const managers = (row.managers as string[]) ?? []
        const playerName = (row.player_name as string) ?? 'jugador'
        const comments = (row.comments as { text?: string; date?: string; author?: string; authorId?: string; kind?: string }[]) ?? []
        const last = comments[comments.length - 1]
        const recent = !!last?.date && Date.now() - new Date(last.date).getTime() < 60000
        const mineJustNow = recent && last?.authorId === profile.id
        const who = recent ? (last?.author ?? '').split(' ')[0] : ''

        {
          const before = firmasEntriesRef.current.find((e) => e.id === id)
          const wasManager = !!before?.managers.includes(profile.id)
          const isManager = managers.includes(profile.id)

          // Me acaban de asignar la tarjeta → aviso aunque antes no fuera mío
          if (isManager && !wasManager && before) {
            addNotification(`Pipeline · ${playerName}: te han puesto como encargado`, 'task_new')
            return
          }
          if (!isManager || mineJustNow) return   // no es mía, o el cambio es mío

          const changes: string[] = []
          if (before) {
            if ((row.status as string) !== before.status) {
              changes.push(`estatus → ${FIRMAS_STATUS_LABEL[row.status as string] ?? row.status}`)
            }
            const naBefore = `${before.nextAction ?? ''}|${before.nextActionDate ?? ''}`
            const naAfter = `${(row.next_action as string) ?? ''}|${(row.next_action_date as string) ?? ''}`
            if (naBefore !== naAfter) {
              changes.push((row.next_action as string)
                ? `próxima acción: ${row.next_action}${row.next_action_date ? ` (${fmtShortDate(row.next_action_date as string)})` : ''}`
                : 'acción completada')
            }
            if (((row.zone as string) ?? '') !== (before.zone ?? '')) changes.push(`zona → ${row.zone}`)
            if (((row.notes as string) ?? '') !== (before.notes ?? '')) changes.push('notas actualizadas')
            if (comments.length > before.comments.length && recent && last) {
              const preview = (last.text ?? '').length > 45 ? (last.text ?? '').slice(0, 45) + '…' : (last.text ?? '')
              changes.push(last.kind === 'estatus' ? `«${preview}»` : `apunte: "${preview}"`)
            }
          } else if (recent && last) {
            const preview = (last.text ?? '').length > 45 ? (last.text ?? '').slice(0, 45) + '…' : (last.text ?? '')
            changes.push(`apunte: "${preview}"`)
          }

          if (changes.length) {
            addNotification(`Pipeline · ${playerName}: ${who ? `${who} — ` : ''}${changes.join(' · ')}`, 'task_new')
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_negotiations' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const status = (row.status as string) ?? 'pendiente'
        // Solo avisamos de propuestas nuevas pendientes
        if (status !== 'pendiente') return
        const playerId = row.player_id as string
        const clubId = row.club_id as string
        const clubManagerAvatar = (row.ais_manager as string) ?? undefined
        // (el canal data-sync ya recarga club_negotiations: no duplicamos la lectura)
        // ¿Soy responsable del jugador o del club?
        const player = playersRef.current.find((pl) => pl.id === playerId)
        const isPlayerManager = !!player && player.managedBy.includes(profile.id)
        const club = clubsRef.current.find((c) => c.id === clubId)
        const isClubManager =
          (!!club && club.aisManager === profile.avatar) ||
          clubManagerAvatar === profile.avatar
        if (isPlayerManager || isClubManager) {
          const pName = player?.name ?? 'Un jugador'
          const cName = club?.name ?? 'un club'
          addNotification(`Nueva propuesta pendiente: ${pName} → ${cName}`, 'negotiation', playerId)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, profile, addNotification])

  // Vuelve a pedir UNA tabla. Lo usan dos cosas: el realtime (cuando llega el
  // aviso de un cambio) y el resync al volver a la pestaña (cuando el aviso
  // nunca llegó porque el navegador estaba desconectado).
  // Cada petición lleva un número de serie; al resolver, si ya hay una más
  // nueva para esa tabla, la respuesta se tira (también cubre al resync,
  // que pasa por aquí).
  const refetchTable = useCallback((table: string): void => {
    const seq = (seqRef.current[table] ?? 0) + 1
    seqRef.current[table] = seq
    const ignora = () => {}
    // Aplica el resultado solo si sigue siendo la petición más reciente
    const si = <T,>(p: Promise<T>, aplicar: (d: T) => void) =>
      p.then((d) => { if (seqRef.current[table] === seq) aplicar(d) }).catch(ignora)
    switch (table) {
      case 'club_negotiations':     si(db.fetchNegotiations(), (d) => setNegotiations(d as ClubNegotiation[])); break
      case 'distribution_entries':  si(db.fetchDistributionEntries(), (d) => setDistEntries(d as DistributionEntry[])); break
      case 'clubs':                 si(db.fetchClubs(), (d) => setClubs(d as Club[])); break
      case 'players':               si(db.fetchPlayers(), (d) => setPlayers(d)); break
      case 'tasks':                 si(db.fetchTasks(), (d) => setTasks(d)); break
      case 'member_status':         si(db.fetchMemberStatuses(), (d) => setMemberStatuses(d)); break
      case 'postpartidos':          si(db.fetchPostpartidos(), (d) => setPostpartidos(d)); break
      case 'captacion_firmas':      si(db.fetchFirmasEntries(), (d) => setFirmasEntries(d)); break
      // Captación · partidos: un partido lo comparten varios scouts, así que los
      // jugadores vinculados y los informes cambian mientras tienes la ficha abierta.
      case 'scouting_matches':      si(db.fetchScoutingMatches(), (d) => setScoutingMatches(d as ScoutingMatch[])); break
      case 'scouting_match_players':si(db.fetchMatchPlayers(), (d) => setMatchPlayers(d as ScoutingMatchPlayer[])); break
      case 'scouting_match_scouts': si(db.fetchMatchScouts(), (d) => setMatchScouts(d as ScoutingMatchScout[])); break
      case 'scouting_reports':      si(db.fetchScoutingReports(), (d) => setScoutingReports(d as ScoutingReport[])); break
      // Los propios jugadores de Captación también los tocan varios a la vez:
      // valoración, fin de contrato, campograma de mercado…
      case 'scouting_players':      si(db.fetchScoutingPlayers(), (d) => setScoutingPlayers(d as ScoutingPlayer[])); break
      case 'scouting_club_zonas':   si(db.fetchClubZonas(), (d) => setClubZonas(zonasAMapa(d))); break
      case 'scouting_equipos':      si(db.fetchEquipos(), (d) => setEquipos(d)); break
    }
  }, [])

  // Supabase realtime: sincronización de datos entre usuarios.
  // Cualquier cambio (insert/update/delete) en las tablas clave hace un refetch
  // con debounce, así todos ven los cambios sin recargar la página.
  useEffect(() => {
    if (!user) return
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    let channel = supabase.channel('data-sync')
    for (const t of SYNC_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        clearTimeout(timers[t])
        timers[t] = setTimeout(() => refetchTable(t), 800)
      })
    }
    channel.subscribe()
    return () => {
      Object.values(timers).forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // ── Al volver a la pestaña, volver a pedir los datos ────────────────
  // El realtime solo entrega lo que pasa MIENTRAS el navegador está conectado.
  // Si el portátil se duerme, la pestaña se queda de fondo horas o se cae el
  // wifi, el websocket se corta y esos cambios NO se recuperan al reconectar:
  // había que recargar la página a mano (18-ago: informes metidos desde el
  // móvil que en el ordenador no salían hasta pulsar recargar).
  // Al volver a la pestaña, o al recuperar conexión, se piden otra vez.
  useEffect(() => {
    if (!user) return
    let ultimo = Date.now()
    // Volver a pedirlo TODO no es gratis (son ~12.000 informes), así que solo
    // se hace si de verdad has estado fuera un rato. Alternar pestañas un
    // momento no dispara nada.
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimo < 60000) return
      ultimo = Date.now()
      SYNC_TABLES.forEach((t) => refetchTable(t))
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    window.addEventListener('online', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
      window.removeEventListener('online', resync)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Listen for hash changes so navigating to #contactos opens the panel
  useEffect(() => {
    const onHashChange = () => setShowContacts(window.location.hash === '#contactos')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (loading) return <Spinner />
  if (!user) return <LoginScreen onLogin={signIn} />
  if (!profile) {
    // El perfil no se pudo leer (red, RLS…): antes se quedaba en el spinner
    // para siempre. Ofrecemos reintentar sin tener que salir y volver a entrar.
    if (profileError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-sm text-center bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">No se ha podido cargar tu perfil</p>
            <p className="text-xs text-slate-500 mt-2">{profileError}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => { void refreshProfile() }}
                className="px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                Reintentar
              </button>
              <button
                onClick={signOut}
                className="px-4 py-2 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700"
              >
                Volver al login
              </button>
            </div>
          </div>
        </div>
      )
    }
    // Autenticado pero sin fila en profiles (o aún cargando): sin esto, la
    // cuenta "entra y vuelve a salirse" sin ninguna pista.
    return profileMissing ? (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Tu cuenta no tiene perfil todavía</p>
          <p className="text-xs text-slate-500 mt-2">
            El acceso es correcto, pero falta crear tu perfil en la base de datos.
            Avisa al administrador para que lo cree y vuelve a entrar.
          </p>
          <button
            onClick={signOut}
            className="mt-4 px-4 py-2 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700"
          >
            Volver al login
          </button>
        </div>
      </div>
    ) : <Spinner />
  }
  if (profile.activo === false) {
    // La cuenta existe pero un admin todavía no la ha activado. La base de
    // datos no le entrega nada, así que sin esta pantalla vería la app
    // entera vacía sin entender por qué.
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Cuenta pendiente de activar</p>
          <p className="text-xs text-slate-500 mt-2">
            Tu cuenta se ha creado correctamente, pero un administrador tiene que
            darle acceso antes de que puedas entrar. Avísale y vuelve a intentarlo.
          </p>
          <button
            onClick={signOut}
            className="mt-4 px-4 py-2 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700"
          >
            Volver al login
          </button>
        </div>
      </div>
    )
  }
  if (dataLoading) return <Spinner />
  if (dataError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 px-6 text-center">
        <p className="text-slate-700 font-medium">No se pudieron cargar los datos.</p>
        <p className="text-slate-500 text-sm max-w-md">{dataError}</p>
        <button
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-primary hover:bg-primary/90"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId)

  // ── handlers ────────────────────────────────────────────────

  const handleAddPlayer = async (player: Player): Promise<Player> => {
    const saved = await db.createPlayer(player)
    setPlayers((prev) => [...prev, saved])
    return saved
  }

  // ── Guardado con control de conflictos (jugador, club, negociación) ──
  //
  // Flujo: db.updateX manda el updated_at que teníamos al leer. Si otro
  // usuario ha guardado entre medias, db lanza ConflictError con su fila.
  // Entonces el handler NO lanza todavía: abre el modal (ConflictModal,
  // montado en todas las vistas) y devuelve una promesa que se queda
  // esperando la decisión:
  //   · «Recargar»     → se aplica lo suyo al estado y la promesa se RECHAZA
  //                      con Error('conflicto'): la vista (PlayerDetail…)
  //                      lo enseña como «No se pudo guardar» y no cierra la
  //                      edición, que es lo correcto porque lo mío no se guardó.
  //   · «Sobrescribir» → se reintenta con updatedAt = el de lo suyo; si va
  //                      bien se aplica la fila guardada y la promesa se
  //                      RESUELVE (la vista muestra «guardado»). Si vuelve a
  //                      chocar, el modal sigue abierto con la fila más nueva.
  // Las vistas no cambian: siguen llamando a onUpdatePlayer/Club/Negotiation.
  const guardarConControl = <T extends { id: string; updatedAt?: string }>(
    tabla: string,
    guardar: (x: T) => Promise<T>,
    aplicar: (saved: T) => void,
  ) => async (x: T): Promise<void> => {
    try {
      aplicar(await guardar(x))
      return
    } catch (err) {
      if (!(err instanceof db.ConflictError)) throw err
      let suyo = err.actual as T
      // Espera a que se resuelva un conflicto anterior antes de abrir este
      const anterior = conflictChainRef.current
      const mio = new Promise<void>((resolve, reject) => {
        anterior.finally(() => {
          const cerrar = () => setConflict(null)
          setConflict({
            tabla,
            mio: x as unknown as Record<string, unknown>,
            suyo: suyo as unknown as Record<string, unknown>,
            recargar: () => { aplicar(suyo); cerrar(); reject(new Error('conflicto')) },
            reintentar: async () => {
              try {
                const saved = await guardar({ ...x, updatedAt: suyo.updatedAt })
                aplicar(saved); cerrar(); resolve()
              } catch (e2) {
                if (e2 instanceof db.ConflictError) {
                  // Ha vuelto a cambiar: se enseña la fila más nueva y se puede reintentar
                  suyo = e2.actual as T
                  setConflict(prev => prev ? { ...prev, suyo: suyo as unknown as Record<string, unknown> } : prev)
                }
                throw e2
              }
            },
          })
        })
      })
      conflictChainRef.current = mio.then(() => {}, () => {})
      await mio
    }
  }

  const handleUpdatePlayer = guardarConControl<Player>(
    'players',
    (p) => db.updatePlayer(p),
    // se usa la fila devuelta: trae el updated_at nuevo para el siguiente guardado
    (saved) => setPlayers((prev) => prev.map((p) => (p.id === saved.id ? saved : p))),
  )

  const handleDeletePlayer = async (id: string) => {
    await db.deletePlayer(id)
    setPlayers((prev) => prev.filter((p) => p.id !== id))
    setSelectedPlayerId(null)
  }

  const handleBulkDelete = async (ids: string[]) => {
    await db.deletePlayers(ids)
    setPlayers((prev) => prev.filter((p) => !ids.includes(p.id)))
  }

  const handleBulkAssignManager = async (playerIds: string[], managerId: string) => {
    await db.assignManagerToPlayers(playerIds, managerId)
    setPlayers((prev) =>
      prev.map((p) => {
        if (!playerIds.includes(p.id)) return p
        const manager2 = p.managedBy[1] ?? null
        const updated = manager2 ? [managerId, manager2] : [managerId]
        return { ...p, managedBy: updated }
      })
    )
  }

  const handleAddTask = async (task: Task): Promise<Task> => {
    const withCompleted: Task = task.status === 'completada' && !task.completedAt
      ? { ...task, completedAt: new Date().toISOString() }
      : task
    const saved = await db.createTask(withCompleted)
    setTasks((prev) => [...prev, saved])
    return saved
  }

  const handleUpdateTask = async (updated: Task) => {
    // completedAt se gestiona centralmente: se fija al pasar a "completada"
    // y se limpia si la tarea se reabre.
    const previous = tasks.find((t) => t.id === updated.id)
    const withCompleted: Task = updated.status === 'completada'
      ? { ...updated, completedAt: updated.completedAt ?? previous?.completedAt ?? new Date().toISOString() }
      : { ...updated, completedAt: undefined }
    await db.updateTask(withCompleted)
    setTasks((prev) => prev.map((t) => (t.id === withCompleted.id ? withCompleted : t)))

    // Firmar ⇄ Tareas: si esta tarea era la próxima acción de un jugador del
    // pipeline y se acaba de completar, se marca hecha también en Firmar
    // (el guard evita el bucle cuando el origen es la propia sincronización).
    if (!firmasSyncGuard.current && withCompleted.status === 'completada' && previous?.status !== 'completada') {
      const fe = firmasEntries.find(f => f.nextActionTaskId === withCompleted.id && (f.nextAction || f.nextActionDate))
      if (fe && profile) {
        const log = {
          id: crypto.randomUUID(),
          text: `✓ Hecho: ${fe.nextAction ?? 'próxima acción'}`,
          date: new Date().toISOString(),
          author: profile.name,
          authorId: profile.id,
          kind: (fe.nextActionKind ?? 'nota') as NonNullable<FirmasEntry['comments'][number]['kind']>,
        }
        const cleared: FirmasEntry = {
          ...fe,
          nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined,
          nextActionKind: undefined, nextActionTaskId: undefined,
          comments: [...fe.comments, log],
        }
        try {
          await db.updateFirmasEntry(cleared)
          setFirmasEntries(prev => prev.map(x => x.id === cleared.id ? cleared : x))
        } catch (err) { console.error(err) }
      }
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    await db.deleteTask(taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  const handleRefreshProfiles = async () => {
    const pr = await db.fetchProfiles()
    setProfiles(pr as Profile[])
  }

  // ── Postpartidos ────────────────────────────────────────────
  const handleCreatePostpartido = async (p: Omit<Postpartido, 'id' | 'createdAt'>) => {
    const saved = await db.createPostpartido(p)
    setPostpartidos(prev => [saved, ...prev])
    return saved
  }
  const handleUpdatePostpartido = async (p: Postpartido) => {
    await db.updatePostpartido(p)
    setPostpartidos(prev => prev.map(x => x.id === p.id ? p : x))
  }
  const handleDeletePostpartido = async (pp: Postpartido) => {
    // Borrar también su tarea asociada (la fila de postpartidos cae en cascada,
    // pero limpiamos el estado local de ambas cosas)
    if (pp.taskId) {
      try { await db.deleteTask(pp.taskId) } catch { /* la tarea puede no existir ya */ }
      setTasks(prev => prev.filter(t => t.id !== pp.taskId))
    }
    try { await db.deletePostpartido(pp.id) } catch { /* puede haber caído en cascada */ }
    setPostpartidos(prev => prev.filter(x => x.id !== pp.id))
  }

  // Ocultar/mostrar un miembro en el panel de estado (solo admins)
  const handleToggleStatusHidden = async (profileId: string, hidden: boolean) => {
    await db.updateProfile(profileId, { hidden_from_status: hidden })
    await handleRefreshProfiles()
  }

  const handleUpdateMemberStatus = async (s: Omit<MemberStatus, 'updatedAt'>) => {
    const saved = await db.upsertMemberStatus(s)
    setMemberStatuses(prev => {
      const exists = prev.some(x => x.profileId === saved.profileId)
      return exists ? prev.map(x => x.profileId === saved.profileId ? saved : x) : [...prev, saved]
    })
  }

  // ── distribution handlers ────────────────────────────────────

  const handleCreateClub = async (c: Omit<Club, 'id' | 'createdAt'>) => {
    const saved = await db.createClub(c)
    setClubs(prev => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)))
    return saved
  }
  const handleUpdateClub = guardarConControl<Club>(
    'clubs',
    (c) => db.updateClub(c),
    (saved) => setClubs(prev => prev.map(x => x.id === saved.id ? saved : x)),
  )
  const handleDeleteClub = async (id: string) => {
    await db.deleteClub(id)
    setClubs(prev => prev.filter(x => x.id !== id))
    setNegotiations(prev => prev.filter(n => n.clubId !== id))
  }

  const handleCreateEntry = async (e: Omit<DistributionEntry, 'id' | 'createdAt'>) => {
    const saved = await db.createDistributionEntry(e)
    setDistEntries(prev => [...prev, saved])
    return saved
  }
  const handleUpdateEntry = async (e: DistributionEntry) => {
    await db.updateDistributionEntry(e)
    setDistEntries(prev => prev.map(x => x.id === e.id ? e : x))
  }
  const handleDeleteEntry = async (id: string) => {
    await db.deleteDistributionEntry(id)
    setDistEntries(prev => prev.filter(x => x.id !== id))
  }

  const handleCreateNegotiation = async (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => {
    const saved = await db.createNegotiation(n)
    setNegotiations(prev => [saved, ...prev])
    return saved
  }
  // La fila devuelta trae el updated_at real; antes el estado local se
  // quedaba con el viejo hasta el siguiente refetch.
  const handleUpdateNegotiation = guardarConControl<ClubNegotiation>(
    'club_negotiations',
    (n) => db.updateNegotiation(n),
    (saved) => setNegotiations(prev => prev.map(x => x.id === saved.id ? saved : x)),
  )
  const handleDeleteNegotiation = async (id: string) => {
    await db.deleteNegotiation(id)
    setNegotiations(prev => prev.filter(x => x.id !== id))
  }

  // ── scouting handlers ────────────────────────────────────────

  const handleAddScoutingPlayer = (p: ScoutingPlayer) => {
    setScoutingPlayers(prev => [...prev, p].sort((a, b) => a.fullName.localeCompare(b.fullName)))
  }
  const handleUpdateScoutingPlayer = (p: ScoutingPlayer) => {
    setScoutingPlayers(prev => prev.map(x => x.id === p.id ? p : x))
  }
  /** Guardar un equipo del catálogo (marcas de control, categoría, alta manual) */
  const handleSaveEquipo = async (e: Partial<db.Equipo> & { nombre: string; club: string }) => {
    await db.upsertEquipo(e, profile?.avatar)
    setEquipos(prev => {
      const i = prev.findIndex(x => x.nombre === e.nombre)
      if (i === -1) {
        return [...prev, {
          categoria: undefined, zona: undefined, relevante: false, cubierto: false,
          activo: true, manual: false, ...e,
        } as db.Equipo].sort((a, b) => a.nombre.localeCompare(b.nombre))
      }
      const next = [...prev]
      next[i] = { ...next[i], ...e, cubiertoAt: e.cubierto ? new Date().toISOString() : next[i].cubiertoAt }
      return next
    })
  }

  /** Cambiar a mano la zona de un club (zona = null vuelve a la de por defecto) */
  const handleSetClubZona = async (club: string, nombre: string, zona: Zona | null) => {
    await db.setClubZona(club, nombre, zona, profile?.avatar)
    setClubZonas(prev => {
      const next = { ...prev }
      if (zona) next[club] = zona
      else delete next[club]
      return next
    })
  }
  const handleDeleteScoutingPlayer = (id: string) => {
    setScoutingPlayers(prev => prev.filter(x => x.id !== id))
    setScoutingReports(prev => prev.filter(r => r.playerId !== id))
  }
  const handleAddScoutingReport = (r: ScoutingReport) => {
    setScoutingReports(prev => [r, ...prev])
  }
  const handleUpdateScoutingReport = (r: ScoutingReport) => {
    setScoutingReports(prev => prev.map(x => x.id === r.id ? r : x))
  }
  const handleDeleteScoutingReport = (id: string) => {
    setScoutingReports(prev => prev.filter(r => r.id !== id))
  }
  const handleAddScoutingMatch = (m: ScoutingMatch) => {
    setScoutingMatches(prev => [m, ...prev])
  }
  const handleUpdateScoutingMatch = (m: ScoutingMatch) => {
    setScoutingMatches(prev => prev.map(x => x.id === m.id ? m : x))
  }
  const handleDeleteScoutingMatch = (id: string) => {
    setScoutingMatches(prev => prev.filter(x => x.id !== id))
    setMatchPlayers(prev => prev.filter(mp => mp.matchId !== id))
    setMatchScouts(prev => prev.filter(ms => ms.matchId !== id))
  }
  const handleAddMatchPlayer = async (matchId: string, playerId: string) => {
    const mp = await db.addMatchPlayer(matchId, playerId)
    setMatchPlayers(prev => prev.some(x => x.matchId === matchId && x.playerId === playerId) ? prev : [...prev, mp])
  }
  const handleRemoveMatchPlayer = async (matchId: string, playerId: string) => {
    await db.removeMatchPlayer(matchId, playerId)
    setMatchPlayers(prev => prev.filter(x => !(x.matchId === matchId && x.playerId === playerId)))
  }
  // ── Varios scouts por partido (scouting_match_scouts) ──
  const handleAddMatchScout = async (matchId: string, scout: string, viewMode?: 'campo' | 'video') => {
    const row = await db.addMatchScout(matchId, scout, viewMode)
    setMatchScouts(prev => prev.some(x => x.matchId === matchId && x.scout === scout) ? prev : [...prev, row])
  }
  const handleRemoveMatchScout = async (matchId: string, scout: string) => {
    await db.removeMatchScout(matchId, scout)
    setMatchScouts(prev => prev.filter(x => !(x.matchId === matchId && x.scout === scout)))
  }
  const handleSetMatchScoutStatus = async (matchId: string, scout: string, status: 'pendiente' | 'visto') => {
    await db.setMatchScoutStatus(matchId, scout, status)
    setMatchScouts(prev => prev.map(x => x.matchId === matchId && x.scout === scout ? { ...x, status } : x))
  }
  const handleSetMatchScoutMode = async (matchId: string, scout: string, viewMode: 'campo' | 'video') => {
    await db.setMatchScoutMode(matchId, scout, viewMode)
    setMatchScouts(prev => prev.map(x => x.matchId === matchId && x.scout === scout ? { ...x, viewMode } : x))
  }

  // ── Firmar ⇄ Tareas: cada próxima acción genera una tarea real ──
  // La tarea vive en el tablero (asignada al encargado, fecha límite =
  // fecha de la acción) y se sincroniza en ambos sentidos.
  const FIRMAS_KIND_ICON: Record<string, string> = { llamada: '📞', whatsapp: '💬', reunion: '🤝', entorno: '👪', nota: '📝' }

  const firmasActionTaskDraft = (f: FirmasEntry): Task => ({
    id: 'tmp',
    playerId: 'general',
    title: `${FIRMAS_KIND_ICON[f.nextActionKind ?? ''] ?? '📌'} ${f.nextAction ?? 'Próxima acción'} · ${f.playerName}`,
    description: `Próxima acción del pipeline Firmar — ${f.playerName} (${f.zone}). Al completarla aquí se marca hecha en Firmar, y viceversa.`,
    assigneeId: f.nextActionAssignee ?? '',
    status: 'pendiente',
    priority: 'media',
    label: 'Scouting',
    dueDate: f.nextActionDate,
    createdAt: new Date().toISOString(),
    comments: [],
  })

  /** Crea/actualiza/completa la tarea vinculada según el cambio de la acción */
  const syncFirmasActionTask = async (prev: FirmasEntry | undefined, next: FirmasEntry): Promise<FirmasEntry> => {
    const has = !!(next.nextAction || next.nextActionDate)
    const had = !!(prev?.nextAction || prev?.nextActionDate)
    const changed = !prev
      ? has
      : prev.nextAction !== next.nextAction || prev.nextActionDate !== next.nextActionDate ||
        prev.nextActionAssignee !== next.nextActionAssignee || prev.nextActionKind !== next.nextActionKind
    const taskId = next.nextActionTaskId
    const existing = taskId ? tasks.find(t => t.id === taskId) : undefined

    firmasSyncGuard.current = true
    try {
      if (has && (changed || !existing)) {
        const draft = firmasActionTaskDraft(next)
        if (existing) {
          await handleUpdateTask({
            ...existing,
            title: draft.title,
            description: draft.description,
            assigneeId: draft.assigneeId || existing.assigneeId,
            dueDate: draft.dueDate,
            label: existing.label ?? 'Scouting',
            status: existing.status === 'completada' ? 'pendiente' : existing.status,
          })
          return next
        }
        const saved = await handleAddTask(draft)
        return { ...next, nextActionTaskId: saved.id }
      }
      if (!has && had && existing && existing.status !== 'completada') {
        // acción hecha o retirada desde Firmar → la tarea se completa
        await handleUpdateTask({ ...existing, status: 'completada' })
        return { ...next, nextActionTaskId: undefined }
      }
      if (!has && taskId) return { ...next, nextActionTaskId: undefined }
      return next
    } catch (err) {
      console.error('No se pudo sincronizar la tarea de la próxima acción:', err)
      return next
    } finally {
      firmasSyncGuard.current = false
    }
  }

  /** Crea tareas para las acciones ya existentes que aún no tienen (backfill de la Agenda) */
  const handleSyncFirmasActionTasks = async (): Promise<number> => {
    const pending = firmasEntries.filter(f =>
      f.status !== 'firmado' && (f.nextAction || f.nextActionDate) &&
      (!f.nextActionTaskId || !tasks.some(t => t.id === f.nextActionTaskId))
    )
    let n = 0
    for (const f of pending) {
      try {
        firmasSyncGuard.current = true
        const saved = await handleAddTask(firmasActionTaskDraft(f))
        firmasSyncGuard.current = false
        const updated = { ...f, nextActionTaskId: saved.id }
        try {
          await db.updateFirmasEntry(updated)
        } catch (err) {
          // Si no se puede enlazar la tarea con la tarjeta, la borramos: si no,
          // cada backfill creaba otra tarea huérfana para la misma acción.
          await handleDeleteTask(saved.id).catch(console.error)
          throw err
        }
        setFirmasEntries(prev => prev.map(x => x.id === f.id ? updated : x))
        n++
      } catch (err) {
        firmasSyncGuard.current = false
        console.error(err)
      }
    }
    return n
  }

  // ── Captación · Firmar (pipeline de firmas) ─────────────────
  const handleCreateFirmasEntry = async (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const saved = await db.createFirmasEntry(e)
    setFirmasEntries(prev => [...prev, saved])
    return saved
  }
  const handleUpdateFirmasEntry = async (e: FirmasEntry) => {
    const prev = firmasEntries.find(x => x.id === e.id)
    const final = await syncFirmasActionTask(prev, e)
    await db.updateFirmasEntry(final)
    setFirmasEntries(prevList => prevList.map(x => x.id === final.id ? final : x))
  }
  /**
   * Parche parcial de una tarjeta de Firmar. A diferencia de
   * handleUpdateFirmasEntry (formulario de edición completa, manda la tarjeta
   * entera), aquí solo se aplican `changes` sobre lo que HAY AHORA: escribir
   * en «Notas» y pulsar «Enviar apunte» en el mismo gesto ya no hace que el
   * segundo guardado borre las notas del primero. Optimista: la UI cambia
   * al momento y se revierte si falla. Los parches al mismo id van en cola.
   */
  const handlePatchFirmasEntry = async (
    id: string,
    changes: Partial<FirmasEntry> | ((e: FirmasEntry) => FirmasEntry),
  ): Promise<void> => {
    const aplicarCambio = (e: FirmasEntry): FirmasEntry => ({
      ...(typeof changes === 'function' ? changes(e) : { ...e, ...changes }),
      updatedAt: new Date().toISOString(),
    })
    const trabajo = async () => {
      const before = firmasEntriesRef.current.find(x => x.id === id)
      if (!before) throw new Error('La tarjeta ya no existe')
      const merged = aplicarCambio(before)
      // Optimista, y sobre `prev` (no sobre la copia leída) para no perder
      // nada que haya cambiado entre medias.
      setFirmasEntries(prev => prev.map(x => x.id === id ? aplicarCambio(x) : x))
      try {
        const final = await syncFirmasActionTask(before, merged)
        await db.updateFirmasEntry(final)
        // si ha creado/quitado tarea, el id de tarea también va al estado
        if (final !== merged) setFirmasEntries(prev => prev.map(x => x.id === id ? { ...x, nextActionTaskId: final.nextActionTaskId } : x))
      } catch (err) {
        setFirmasEntries(prev => prev.map(x => x.id === id ? before : x))
        throw err
      }
    }
    // Serialización por id: cada parche espera al anterior (falle o no).
    const previo = patchQueue.current.get(id) ?? Promise.resolve()
    const mio = previo.catch(() => {}).then(trabajo)
    patchQueue.current.set(id, mio)
    try {
      await mio
    } finally {
      if (patchQueue.current.get(id) === mio) patchQueue.current.delete(id)
    }
  }
  const handleDeleteFirmasEntry = async (id: string) => {
    await db.deleteFirmasEntry(id)
    setFirmasEntries(prev => prev.filter(x => x.id !== id))
  }

  // ── Boulema · jugadores (mantenimiento light) ───────────────
  const handleAddBoulemaPlayer = async (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => {
    const saved = await db.createBoulemaPlayer(p)
    setBoulemaPlayers(prev => [...prev, saved].sort((a, b) => a.fullName.localeCompare(b.fullName)))
  }
  const handleUpdateBoulemaPlayer = async (p: BoulemaPlayer) => {
    await db.updateBoulemaPlayer(p)
    setBoulemaPlayers(prev => prev.map(x => x.id === p.id ? p : x))
  }
  const handleDeleteBoulemaPlayer = async (id: string) => {
    await db.deleteBoulemaPlayer(id)
    setBoulemaPlayers(prev => prev.filter(x => x.id !== id))
  }

  const handleAddBoulemaPeticion = async (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => {
    const saved = await db.createBoulemaPeticion(p)
    setBoulemaPeticiones(prev => [saved, ...prev])
  }
  const handleUpdateBoulemaPeticion = async (p: BoulemaPeticion) => {
    await db.updateBoulemaPeticion(p)
    setBoulemaPeticiones(prev => prev.map(x => x.id === p.id ? p : x))
  }
  const handleDeleteBoulemaPeticion = async (id: string) => {
    await db.deleteBoulemaPeticion(id)
    setBoulemaPeticiones(prev => prev.filter(x => x.id !== id))
  }

  // ── helpers ─────────────────────────────────────────────────

  function navigateToPlayer(id: string, fromClub = false) {
    setPlayerReturnToClub(fromClub)
    setSelectedPlayerId(id)
  }

  function handlePlayerBack() {
    setSelectedPlayerId(null)
    if (playerReturnToClub) {
      // stay on ClubDetail (selectedClubId remains set)
    } else {
      setSelectedClubId(null)
    }
  }

  function navigateToClub(id: string) {
    setSelectedPlayerId(null)
    setSelectedClubId(id)
    setClubExpanded(false)
    setMainSection('distribucion')
  }

  // Modal de conflicto de edición: tiene que salir en cualquier vista
  const conflictNode = (
    <ConflictModal
      conflict={conflict}
      onRecargar={() => conflict?.recargar()}
      onSobrescribir={() => conflict?.reintentar() ?? Promise.resolve()}
    />
  )

  // Botón flotante «Planificación» (la hoja del fin de semana), visible en
  // todas las pantallas, también en móvil (encima de la barra inferior).
  const irAPlanificacion = () => {
    setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null)
    setShowTable(false); setShowAdmin(false); setShowContacts(false); setShowOverview(false)
    setCaptacionOpenTab('planificacion')
    setMainSection('captacion')
  }
  const planificacionFab = (
    <button
      onClick={irAPlanificacion}
      title="Planificación del fin de semana"
      aria-label="Planificación"
      className="fixed bottom-[5.5rem] sm:bottom-4 right-3 sm:right-4 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg hover:bg-slate-700 print:hidden"
    >
      🗓️ <span className="hidden sm:inline">Planificación</span>
    </button>
  )

  // Extras globales: se añaden a todas las pantallas principales
  const withExtras = (node: ReactNode) => (
    <>
      {node}
      {planificacionFab}
      <SavingIndicator />
      {conflictNode}
      {phase2Loading && (
        <div className="fixed bottom-16 sm:bottom-3 left-1/2 -translate-x-1/2 z-[45] pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 text-white text-[11px] font-medium shadow-lg">
            <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sincronizando datos…
          </span>
        </div>
      )}
      {!phase2Loading && cargasFallidas.length > 0 && (
        <div className="fixed bottom-16 sm:bottom-3 left-1/2 -translate-x-1/2 z-[46] px-3 max-w-[92vw]">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 text-white text-[11px] font-semibold shadow-lg">
            <span className="truncate">No se ha podido cargar: {cargasFallidas.join(', ')}</span>
            <button onClick={() => window.location.reload()} className="underline underline-offset-2 flex-shrink-0">
              reintentar
            </button>
            <button onClick={() => setCargasFallidas([])} className="opacity-70 hover:opacity-100 flex-shrink-0">
              ✕
            </button>
          </span>
        </div>
      )}
      <BottomNav
        current={mainSection}
        onGo={(s) => { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null); setClubExpanded(false); setMainSection(s) }}
        onSearch={() => setSearchOpen(true)}
      />
      <SystemNotifPrompt />
      {searchOpen && (
        <GlobalSearch
          players={players}
          scoutingPlayers={scoutingPlayers}
          firmasEntries={firmasEntries}
          clubs={clubs}
          tasks={tasksVisibles}
          onClose={() => setSearchOpen(false)}
          onOpenPlayer={(id) => navigateToPlayer(id, false)}
          onOpenScoutingPlayer={(id) => { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null); setCaptacionOpenPlayerId(id); setMainSection('captacion') }}
          onOpenFirmasEntry={(id) => { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null); setCaptacionOpenFirmasId(id); setMainSection('captacion') }}
          onOpenClub={navigateToClub}
          onGoTareas={() => { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null); setMainSection('tareas') }}
        />
      )}
    </>
  )

  // ── routing ─────────────────────────────────────────────────

  // Cuenta «solo Captación»: se resuelve ANTES de jugador/club/miembro/boulema
  // para que ninguna de esas ramas pueda enseñarle nada por un id guardado en
  // sessionStorage o en el hash. Sin extras que naveguen fuera (bottom nav,
  // búsqueda global); solo el indicador de guardado.
  const captacionNode = (
    <Captacion
      scoutingPlayers={scoutingPlayers}
      scoutingReports={scoutingReports}
      scoutingMatches={scoutingMatches}
      profiles={profiles}
      currentProfile={profile}
      onBack={() => { if (!profile.captacion_only) setMainSection('tareas') }}
      onGoToSection={(s) => { if (!profile.captacion_only) setMainSection(s) }}
      onLogout={signOut}
      onAdmin={profile.is_admin && !profile.captacion_only ? () => { setMainSection('tareas'); setShowAdmin(true) } : undefined}
      onAddPlayer={handleAddScoutingPlayer}
      onUpdatePlayer={handleUpdateScoutingPlayer}
      onDeletePlayer={handleDeleteScoutingPlayer}
      onAddReport={handleAddScoutingReport}
      onUpdateReport={handleUpdateScoutingReport}
      onDeleteReport={handleDeleteScoutingReport}
      onAddMatch={handleAddScoutingMatch}
      onUpdateMatch={handleUpdateScoutingMatch}
      onDeleteMatch={handleDeleteScoutingMatch}
      matchPlayers={matchPlayers}
      onAddMatchPlayer={handleAddMatchPlayer}
      onRemoveMatchPlayer={handleRemoveMatchPlayer}
      matchScouts={matchScouts}
      onAddMatchScout={handleAddMatchScout}
      onRemoveMatchScout={handleRemoveMatchScout}
      onSetMatchScoutStatus={handleSetMatchScoutStatus}
      onSetMatchScoutMode={handleSetMatchScoutMode}
      openPlayerId={captacionOpenPlayerId}
      onOpenPlayerConsumed={() => setCaptacionOpenPlayerId(null)}
      openFirmasEntryId={captacionOpenFirmasId}
      onOpenFirmasEntryConsumed={() => setCaptacionOpenFirmasId(null)}
      openMatchId={captacionOpenMatchId}
      openTab={captacionOpenTab}
      onOpenTabConsumed={() => setCaptacionOpenTab(null)}
      onOpenMatchConsumed={() => setCaptacionOpenMatchId(null)}
      players={players}
      onCreatePlayer={handleAddPlayer}
      boulemaPeticiones={boulemaPeticiones}
      firmasEntries={firmasEntries}
      onSyncFirmasActionTasks={handleSyncFirmasActionTasks}
      onCreateFirmasEntry={handleCreateFirmasEntry}
      onUpdateFirmasEntry={handleUpdateFirmasEntry}
      onPatchFirmasEntry={handlePatchFirmasEntry}
      onDeleteFirmasEntry={handleDeleteFirmasEntry}
      clubZonas={clubZonas}
      onSetClubZona={handleSetClubZona}
      equipos={equipos}
      onSaveEquipo={handleSaveEquipo}
      restricted={!!profile.captacion_only}
    />
  )
  // «Mi día»: agenda personal de hoy. También para la cuenta solo-Captación.
  const miDiaNode = (
    <MiDia
      profile={profile}
      profiles={profiles}
      isAdmin={!!profile.is_admin}
      tasks={tasksVisibles}
      scoutingMatches={scoutingMatches}
      matchScouts={matchScouts}
      firmasEntries={firmasEntries}
      postpartidos={postpartidos}
      players={players}
      scoutingPlayers={scoutingPlayers}
      onBack={() => setMainSection(profile.captacion_only ? 'captacion' : 'tareas')}
      onOpenTask={(id) => { setOpenTaskId(id); setMainSection('tareas') }}
      onOpenMatch={(id) => { setCaptacionOpenMatchId(id); setMainSection('captacion') }}
      onOpenFirmasEntry={(id) => { setCaptacionOpenFirmasId(id); setMainSection('captacion') }}
      onOpenPlayer={(id) => navigateToPlayer(id, false)}
      onCompleteTask={async (id) => {
        const t = tasks.find(x => x.id === id)
        if (t) await handleUpdateTask({ ...t, status: 'completada' })
      }}
      onSetMatchSeen={async (id) => {
        const m = scoutingMatches.find(x => x.id === id)
        if (!m) return
        const mios = matchScouts.some(s => s.matchId === id && s.scout === profile.avatar)
        if (mios) {
          await handleSetMatchScoutStatus(id, profile.avatar, 'visto')
        } else {
          // sin filas de scouts: el estado vive en el propio partido
          const visto = { ...m, status: 'visto' as const }
          await db.updateScoutingMatch(visto)
          handleUpdateScoutingMatch(visto)
        }
      }}
      // limpia nextAction* y, vía syncFirmasActionTask, completa la tarea vinculada
      onCompleteFirmasAction={(id) => handlePatchFirmasEntry(id, {
        nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined,
      })}
    />
  )

  if (profile.captacion_only) {
    if (mainSection === 'mi-dia') return <>{miDiaNode}<SavingIndicator />{conflictNode}</>
    // Sin bottom nav: acceso a «Mi día» con un botón flotante
    return (
      <>
        {captacionNode}
        <button
          onClick={() => setMainSection('mi-dia')}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold shadow-lg hover:bg-amber-600"
          aria-label="Mi día"
        >
          ☀️ Mi día
        </button>
        <button
          onClick={() => setCaptacionOpenTab('planificacion')}
          title="Planificación del fin de semana"
          aria-label="Planificación"
          className="fixed bottom-16 right-4 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg hover:bg-slate-700"
        >
          🗓️ Planificación
        </button>
        <SavingIndicator />{conflictNode}
      </>
    )
  }

  if (showContacts && profile.is_admin) {
    return (
      <Contactos
        onBack={() => {
          window.location.hash = ''
          setShowContacts(false)
        }}
      />
    )
  }

  if (showTable && profile.is_admin) {
    return (
      <PlayersTable
        players={players}
        profiles={profiles}
        onUpdatePlayer={handleUpdatePlayer}
        onBack={() => setShowTable(false)}
        onLogout={signOut}
        onAdmin={() => { setShowTable(false); setShowAdmin(true); }}
        onDeletePlayer={handleDeletePlayer}
      />
    )
  }

  if (showOverview && profile.is_admin) {
    return (
      <OverviewPanel
        players={players}
        profiles={profiles}
        postpartidos={postpartidos}
        tasks={tasks}
        onBack={() => setShowOverview(false)}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => { setShowOverview(false); setShowAdmin(true); } : undefined}
      />
    )
  }

  if (showAdmin && profile.is_admin) {
    return (
      <AdminPanel
        profiles={profiles}
        tasks={tasks}
        players={players}
        scoutingPlayers={scoutingPlayers}
        scoutingReports={scoutingReports}
        scoutingMatches={scoutingMatches}
        firmasEntries={firmasEntries}
        onBack={() => setShowAdmin(false)}
        onRefresh={handleRefreshProfiles}
        onLogout={signOut}
        onOpenTable={() => { setShowAdmin(false); setShowTable(true); }}
      />
    )
  }

  if (selectedProfileId) {
    const selectedProfileData = profiles.find(p => p.id === selectedProfileId)
    if (selectedProfileData) {
      return withExtras(
        <TeamMemberDetail
          profile={selectedProfileData}
          allProfiles={profiles}
          tasks={tasksVisibles}
          players={players}
          onBack={() => setSelectedProfileId(null)}
          onSelectPlayer={(id) => { setSelectedProfileId(null); navigateToPlayer(id, false) }}
          onUpdateTask={handleUpdateTask}
        />
      )
    }
  }

  if (selectedPlayer) {
    const playerTasks = tasksVisibles.filter((t) => t.playerId === selectedPlayer.id)
    return withExtras(
      <PlayerDetail
        player={selectedPlayer}
        players={players}
        tasks={playerTasks}
        allTasks={tasksVisibles}
        profiles={profiles}
        currentProfile={profile}
        onBack={handlePlayerBack}
        onAddTask={handleAddTask}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onUpdatePlayer={handleUpdatePlayer}
        onDeletePlayer={profile.is_admin ? handleDeletePlayer : undefined}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => setShowAdmin(true) : undefined}
        distributionEntry={distEntries.find(e => e.playerId === selectedPlayer.id)}
        playerNegotiations={negotiations.filter(n => n.playerId === selectedPlayer.id)}
        clubs={clubs}
        onUpdateEntry={handleUpdateEntry}
        onCreateNegotiation={handleCreateNegotiation}
        onUpdateNegotiation={handleUpdateNegotiation}
        onDeleteNegotiation={handleDeleteNegotiation}
        onSelectClub={navigateToClub}
        postpartidos={postpartidos.filter(pp => pp.playerId === selectedPlayer.id)}
        scoutingMatches={scoutingMatches}
      />
    )
  }

  const selectedClub = clubs.find(c => c.id === selectedClubId)

  // El detalle de club se muestra en pantalla partida dentro de Distribución
  // (ver más abajo), por lo que la lista no se desmonta y los filtros se conservan.
  const clubDetailNode = selectedClub ? (
    <ClubDetail
      key={selectedClub.id}
      club={selectedClub}
      players={players}
      entries={distEntries}
      negotiations={negotiations}
      currentProfile={profile}
      profiles={profiles}
      embedded
      expanded={clubExpanded}
      onExpand={() => setClubExpanded(e => !e)}
      onBack={() => { setSelectedClubId(null); setClubExpanded(false) }}
      onLogout={signOut}
      onAdmin={profile.is_admin ? () => { setSelectedClubId(null); setClubExpanded(false); setShowAdmin(true) } : undefined}
      onSelectPlayer={(id) => navigateToPlayer(id, true)}
      onUpdateClub={handleUpdateClub}
      onDeleteClub={async (id) => { await handleDeleteClub(id); setSelectedClubId(null); setClubExpanded(false) }}
      onCreateNegotiation={handleCreateNegotiation}
      onUpdateNegotiation={handleUpdateNegotiation}
      onDeleteNegotiation={handleDeleteNegotiation}
    />
  ) : null

  if (mainSection === 'boulema') {
    return withExtras(
      <Boulema
        profiles={profiles}
        currentProfile={profile}
        scoutingPlayers={scoutingPlayers}
        scoutingReports={scoutingReports}
        boulemaPeticiones={boulemaPeticiones}
        onAddBoulemaPeticion={handleAddBoulemaPeticion}
        onUpdateBoulemaPeticion={handleUpdateBoulemaPeticion}
        onDeleteBoulemaPeticion={handleDeleteBoulemaPeticion}
        onAddPlayer={handleAddScoutingPlayer}
        onAddReport={handleAddScoutingReport}
        boulemaPlayers={boulemaPlayers}
        onAddBoulemaPlayer={handleAddBoulemaPlayer}
        onUpdateBoulemaPlayer={handleUpdateBoulemaPlayer}
        onDeleteBoulemaPlayer={handleDeleteBoulemaPlayer}
        onGoToSection={(s) => setMainSection(s)}
        onOpenScoutingPlayer={(id) => { setCaptacionOpenPlayerId(id); setMainSection('captacion') }}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => { setMainSection('tareas'); setShowAdmin(true) } : undefined}
      />
    )
  }

  if (mainSection === 'captacion') return withExtras(captacionNode)

  if (mainSection === 'mi-dia') return withExtras(miDiaNode)

  if (mainSection === 'distribucion' || selectedClub) {
    const splitOpen = !!selectedClub
    return withExtras(
      <div className="flex h-screen overflow-hidden">
        {/* Lista (se oculta en móvil cuando hay club abierto, y al ampliar) */}
        <div
          className={
            !splitOpen
              ? 'flex-1 min-w-0 h-screen overflow-y-auto'
              : clubExpanded
                ? 'hidden'
                : 'hidden lg:block lg:w-[44%] xl:w-[40%] flex-shrink-0 h-screen overflow-y-auto border-r border-slate-200'
          }
        >
          <Distribution
            players={players}
            clubs={clubs}
            entries={distEntries}
            negotiations={negotiations}
            currentProfile={profile}
            profiles={profiles}
            splitActive={splitOpen && !clubExpanded}
            activeClubId={selectedClubId ?? undefined}
            onBack={() => setMainSection('tareas')}
            onGoToJugadores={() => setMainSection('jugadores')}
            onGoToCaptacion={() => setMainSection('captacion')}
            onGoToBoulema={() => setMainSection('boulema')}
            onLogout={signOut}
            onAdmin={profile.is_admin ? () => { setMainSection('tareas'); setShowAdmin(true) } : undefined}
            onSelectPlayer={(id) => navigateToPlayer(id, false)}
            onSelectClub={navigateToClub}
            onCreateClub={handleCreateClub}
            onUpdateClub={handleUpdateClub}
            onDeleteClub={handleDeleteClub}
            onCreateEntry={handleCreateEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onCreateNegotiation={handleCreateNegotiation}
            onUpdateNegotiation={handleUpdateNegotiation}
            onDeleteNegotiation={handleDeleteNegotiation}
            onCreatePlayer={handleAddPlayer}
          />
        </div>

        {/* Panel del club */}
        {splitOpen && (
          <div className="flex-1 min-w-0 h-screen overflow-y-auto bg-white">
            {clubDetailNode}
          </div>
        )}
      </div>
    )
  }

  // 'tareas' and 'jugadores' both use Dashboard with a view prop
  return withExtras(
    <Dashboard
      view={mainSection === 'jugadores' ? 'jugadores' : 'tareas'}
      onViewChange={(v) => setMainSection(v)}
      players={players}
      tasks={tasks}
      profiles={profiles}
      currentProfile={profile}
      onSelectPlayer={(id) => navigateToPlayer(id, false)}
      onLogout={signOut}
      onAddPlayer={handleAddPlayer}
      onAdmin={profile.is_admin ? () => setShowAdmin(true) : undefined}
      onBulkDelete={profile.is_admin ? handleBulkDelete : undefined}
      onBulkAssignManager={profile.is_admin ? handleBulkAssignManager : undefined}
      onOverview={profile.is_admin ? () => setShowOverview(true) : undefined}
      notifications={notifications}
      onDismissNotification={dismissNotification}
      onAddGeneralTask={handleAddTask}
      onUpdateGeneralTask={handleUpdateTask}
      onUpdateTask={handleUpdateTask}
      onDeleteGeneralTask={handleDeleteTask}
      onSelectProfile={(id) => setSelectedProfileId(id)}
      scoutingMatches={scoutingMatches}
      memberStatuses={memberStatuses}
      onUpdateMemberStatus={handleUpdateMemberStatus}
      onToggleStatusHidden={profile.is_admin ? handleToggleStatusHidden : undefined}
      postpartidos={postpartidos}
      onCreatePostpartido={handleCreatePostpartido}
      onUpdatePostpartido={handleUpdatePostpartido}
      onDeletePostpartido={handleDeletePostpartido}
      onAddScoutingMatch={handleAddScoutingMatch}
      firmasEntries={firmasEntries}
      onOpenFirmar={(id) => { setCaptacionOpenFirmasId(id); setMainSection('captacion') }}
      openTaskId={openTaskId}
      onOpenTaskConsumed={() => setOpenTaskId(null)}
      updateAvailable={updateAvailable}
    />
  )
}

