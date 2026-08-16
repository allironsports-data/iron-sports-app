import { useState, useEffect, useCallback, useRef, lazy } from 'react'
import { useAuth } from './contexts/AuthContext'
import type { Player, Task, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, BoulemaPeticion, MemberStatus, Postpartido, FirmasEntry, BoulemaPlayer } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
import { SavingIndicator, BottomNav, GlobalSearch, SystemNotifPrompt, fireSystemNotification } from './components/GlobalExtras'
import { BUILD_ID } from './changelog'
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

export interface AppNotification {
  id: string
  message: string
  type: 'task_new' | 'task_done' | 'birthday' | 'negotiation'
  playerId?: string
  ts: number
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const { user, profile, loading, signIn, signOut } = useAuth()

  const [players, setPlayers] = useState<Player[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const profilesRef = useRef<Profile[]>([])
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
  // four main sections
  const [mainSection, setMainSection] = useState<'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'boulema'>(
    () => (sessionStorage.getItem('nav_section') as 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'boulema') ?? 'tareas'
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

  // Captación state
  const [scoutingPlayers, setScoutingPlayers] = useState<ScoutingPlayer[]>([])
  const [scoutingReports, setScoutingReports] = useState<ScoutingReport[]>([])
  const [scoutingMatches, setScoutingMatches] = useState<ScoutingMatch[]>([])
  const [matchPlayers, setMatchPlayers] = useState<ScoutingMatchPlayer[]>([])
  const [matchScouts, setMatchScouts] = useState<ScoutingMatchScout[]>([])
  const [boulemaPeticiones, setBoulemaPeticiones] = useState<BoulemaPeticion[]>([])
  const [firmasEntries, setFirmasEntries] = useState<FirmasEntry[]>([])
  const [boulemaPlayers, setBoulemaPlayers] = useState<BoulemaPlayer[]>([])

  // Guard anti-bucle de la sincronización Firmar ⇄ Tareas.
  // DEBE declararse aquí arriba: es un hook y no puede ir después de los
  // returns tempranos (loading/login) — romperlo deja la app en blanco.
  const firmasSyncGuard = useRef(false)

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
    const names: Record<string, string> = { tareas: 'Mantenimiento', jugadores: 'Jugadores', distribucion: 'Distribución', captacion: 'Captación', boulema: 'Boulema' }
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

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash
      if (!h || h === '#contactos') return
      const m = h.match(/^#\/(jugador|club|miembro)\/(.+)$/)
      if (m) {
        if (m[1] === 'jugador') { setSelectedProfileId(null); setSelectedPlayerId(m[2]) }
        else if (m[1] === 'club') { setSelectedPlayerId(null); setSelectedProfileId(null); setSelectedClubId(m[2]); setMainSection('distribucion') }
        else { setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(m[2]) }
        return
      }
      const s = h.replace('#/', '')
      if (['tareas', 'jugadores', 'distribucion', 'captacion', 'boulema'].includes(s)) {
        setSelectedPlayerId(null); setSelectedClubId(null); setSelectedProfileId(null)
        setMainSection(s as typeof mainSection)
      }
    }
    window.addEventListener('hashchange', apply)
    apply() // enlace compartido al cargar
    return () => window.removeEventListener('hashchange', apply)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      Promise.all([
        db.fetchClubs(),
        db.fetchDistributionEntries(),
        db.fetchNegotiations(),
        db.fetchScoutingPlayers(),
        db.fetchScoutingReports(),
        db.fetchScoutingMatches(),
        db.fetchMatchPlayers(),
        db.fetchMatchScouts().catch(() => [] as ScoutingMatchScout[]),
        db.fetchBoulemaPeticiones().catch(() => [] as BoulemaPeticion[]),
        db.fetchMemberStatuses().catch(() => [] as MemberStatus[]),
        db.fetchPostpartidos().catch(() => [] as Postpartido[]),
        db.fetchFirmasEntries().catch(() => [] as FirmasEntry[]),
        db.fetchBoulemaPlayers().catch(() => [] as BoulemaPlayer[]),
      ]).then(([cl, de, ng, sp, sr, sm, mp, msc, bp, ms, pp, fe, bpl]) => {
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
        // Refresh tasks
        db.fetchTasks().then((t) => setTasks(t))
        // Check if player is managed by current user
        setPlayers((prev) => {
          const p = prev.find((pl) => pl.id === playerId)
          if (p && p.managedBy.includes(profile.id)) {
            addNotification(`Nueva tarea: "${title}" para ${p.name}`, 'task_new', playerId)
          }
          return prev
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const playerId = row.player_id as string
        const title = row.title as string
        const status = row.status as string
        // Refresh tasks
        db.fetchTasks().then((t) => setTasks(t))
        if (status === 'completada') {
          setPlayers((prev) => {
            const p = prev.find((pl) => pl.id === playerId)
            if (p && p.managedBy.includes(profile.id)) {
              addNotification(`Tarea completada: "${title}" de ${p.name}`, 'task_done', playerId)
            }
            return prev
          })
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
        setTasks((prev) => {
          const task = prev.find((t) => t.id === taskId)
          if (!task) return prev
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
          return prev
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scouting_match_players' }, (payload: { new: Record<string, unknown> }) => {
        // Un scout ha añadido a un jugador al campograma: si está en el pipeline
        // de Firmar y soy su encargado, acaba de haber contacto visual — avisar
        const row = payload.new as Record<string, unknown>
        const playerId = row.player_id as string
        const matchId = row.match_id as string
        setScoutingMatches((prevM) => {
          setFirmasEntries((prevFe) => {
            const e = prevFe.find((x) => x.scoutingPlayerId === playerId && x.status !== 'firmado' && x.managers.includes(profile.id))
            if (e) {
              const m = prevM.find((x) => x.id === matchId)
              addNotification(
                `Firmar · ${e.playerName}: le han visto en ${m ? `${m.homeTeam} vs ${m.awayTeam}` : 'un partido'} — buen momento para llamar`,
                'task_new'
              )
            }
            return prevFe
          })
          return prevM
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scouting_matches' }, (payload: { new: Record<string, unknown> }) => {
        // Partido nuevo: avisar a los encargados de jugadores del pipeline cuyo equipo juega
        const row = payload.new as Record<string, unknown>
        const home = (row.home_team as string) ?? ''
        const away = (row.away_team as string) ?? ''
        const date = (row.date as string) ?? ''
        const NOISE = new Set(['cf','cd','ud','fc','sd','ad','ce','sad','club','juv','juvenil','cadete','cad','inf','infantil','alevin','a','b','c','equipo','filial'])
        const normTeam = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t && !NOISE.has(t)).join(' ')
        const alike = (a: string, b: string) => {
          const na = normTeam(a), nb = normTeam(b)
          return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na))
        }
        // leer estado actual sin cerrar sobre valores viejos
        setScoutingPlayers((prevSp) => {
          setFirmasEntries((prevFe) => {
            prevFe
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
            return prevFe
          })
          return prevSp
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'captacion_firmas' }, (payload: { new: Record<string, unknown> }) => {
        // Aviso a los encargados taggeados cuando otro añade un apunte o cambia el estatus
        const row = payload.new as Record<string, unknown>
        const managers = (row.managers as string[]) ?? []
        if (!managers.includes(profile.id)) return
        const comments = (row.comments as { text?: string; date?: string; author?: string; authorId?: string; kind?: string }[]) ?? []
        const last = comments[comments.length - 1]
        if (!last?.date) return
        if (last.authorId === profile.id) return                       // mis propios cambios no me avisan
        if (Date.now() - new Date(last.date).getTime() > 60000) return // solo actividad recién añadida
        const who = (last.author ?? 'Alguien').split(' ')[0]
        const playerName = (row.player_name as string) ?? 'jugador'
        const preview = (last.text ?? '').length > 45 ? (last.text ?? '').slice(0, 45) + '…' : (last.text ?? '')
        const what = last.kind === 'estatus' ? `cambió el estatus (${preview})` : `añadió: "${preview}"`
        addNotification(`Firmar · ${playerName}: ${who} ${what}`, 'task_new')
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_negotiations' }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>
        const status = (row.status as string) ?? 'pendiente'
        // Solo avisamos de propuestas nuevas pendientes
        if (status !== 'pendiente') return
        const playerId = row.player_id as string
        const clubId = row.club_id as string
        const clubManagerAvatar = (row.ais_manager as string) ?? undefined
        // Refrescar negociaciones en la app
        db.fetchNegotiations().then((ng) => setNegotiations(ng))
        // ¿Soy responsable del jugador o del club?
        setPlayers((prevPlayers) => {
          const player = prevPlayers.find((pl) => pl.id === playerId)
          const isPlayerManager = !!player && player.managedBy.includes(profile.id)
          setClubs((prevClubs) => {
            const club = prevClubs.find((c) => c.id === clubId)
            const isClubManager =
              (!!club && club.aisManager === profile.avatar) ||
              clubManagerAvatar === profile.avatar
            if (isPlayerManager || isClubManager) {
              const pName = player?.name ?? 'Un jugador'
              const cName = club?.name ?? 'un club'
              addNotification(`Nueva propuesta pendiente: ${pName} → ${cName}`, 'negotiation', playerId)
            }
            return prevClubs
          })
          return prevPlayers
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, profile, addNotification])

  // Supabase realtime: sincronización de datos entre usuarios.
  // Cualquier cambio (insert/update/delete) en las tablas clave hace un refetch
  // con debounce, así todos ven los cambios sin recargar la página.
  useEffect(() => {
    if (!user) return
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    const debouncedRefetch = (table: string, fn: () => void) => {
      clearTimeout(timers[table])
      timers[table] = setTimeout(fn, 800)
    }
    const channel = supabase.channel('data-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_negotiations' }, () =>
        debouncedRefetch('club_negotiations', () => db.fetchNegotiations().then((d) => setNegotiations(d as ClubNegotiation[])).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution_entries' }, () =>
        debouncedRefetch('distribution_entries', () => db.fetchDistributionEntries().then((d) => setDistEntries(d as DistributionEntry[])).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clubs' }, () =>
        debouncedRefetch('clubs', () => db.fetchClubs().then((d) => setClubs(d as Club[])).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () =>
        debouncedRefetch('players', () => db.fetchPlayers().then((d) => setPlayers(d)).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () =>
        debouncedRefetch('tasks', () => db.fetchTasks().then((d) => setTasks(d)).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_status' }, () =>
        debouncedRefetch('member_status', () => db.fetchMemberStatuses().then((d) => setMemberStatuses(d)).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'postpartidos' }, () =>
        debouncedRefetch('postpartidos', () => db.fetchPostpartidos().then((d) => setPostpartidos(d)).catch(() => {})))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captacion_firmas' }, () =>
        debouncedRefetch('captacion_firmas', () => db.fetchFirmasEntries().then((d) => setFirmasEntries(d)).catch(() => {})))
      .subscribe()
    return () => {
      Object.values(timers).forEach(clearTimeout)
      supabase.removeChannel(channel)
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
  if (!user || !profile) return <LoginScreen onLogin={signIn} />
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

  const handleUpdatePlayer = async (updated: Player) => {
    await db.updatePlayer(updated)
    setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

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
  const handleUpdateClub = async (c: Club) => {
    await db.updateClub(c)
    setClubs(prev => prev.map(x => x.id === c.id ? c : x))
  }
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
  const handleUpdateNegotiation = async (n: ClubNegotiation) => {
    await db.updateNegotiation(n)
    setNegotiations(prev => prev.map(x => x.id === n.id ? n : x))
  }
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
  const handleAddMatchScout = async (matchId: string, scout: string) => {
    const row = await db.addMatchScout(matchId, scout)
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
        await db.updateFirmasEntry(updated)
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

  // Extras globales: se añaden a todas las pantallas principales
  const withExtras = (node: ReactNode) => (
    <>
      {node}
      <SavingIndicator />
      {phase2Loading && (
        <div className="fixed bottom-16 sm:bottom-3 left-1/2 -translate-x-1/2 z-[45] pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 text-white text-[11px] font-medium shadow-lg">
            <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sincronizando datos…
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
          tasks={tasks}
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
      />
    )
  }

  if (showOverview && profile.is_admin) {
    return (
      <OverviewPanel
        players={players}
        profiles={profiles}
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
          tasks={tasks}
          players={players}
          onBack={() => setSelectedProfileId(null)}
          onSelectPlayer={(id) => { setSelectedProfileId(null); navigateToPlayer(id, false) }}
          onUpdateTask={handleUpdateTask}
        />
      )
    }
  }

  if (selectedPlayer) {
    const playerTasks = tasks.filter((t) => t.playerId === selectedPlayer.id)
    return withExtras(
      <PlayerDetail
        player={selectedPlayer}
        players={players}
        tasks={playerTasks}
        allTasks={tasks}
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

  if (mainSection === 'captacion') {
    return withExtras(
      <Captacion
        scoutingPlayers={scoutingPlayers}
        scoutingReports={scoutingReports}
        scoutingMatches={scoutingMatches}
        profiles={profiles}
        currentProfile={profile}
        onBack={() => setMainSection('tareas')}
        onGoToSection={(s) => setMainSection(s)}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => { setMainSection('tareas'); setShowAdmin(true) } : undefined}
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
        openPlayerId={captacionOpenPlayerId}
        onOpenPlayerConsumed={() => setCaptacionOpenPlayerId(null)}
        openFirmasEntryId={captacionOpenFirmasId}
        onOpenFirmasEntryConsumed={() => setCaptacionOpenFirmasId(null)}
        players={players}
        onCreatePlayer={handleAddPlayer}
        boulemaPeticiones={boulemaPeticiones}
        firmasEntries={firmasEntries}
        onSyncFirmasActionTasks={handleSyncFirmasActionTasks}
        onCreateFirmasEntry={handleCreateFirmasEntry}
        onUpdateFirmasEntry={handleUpdateFirmasEntry}
        onDeleteFirmasEntry={handleDeleteFirmasEntry}
      />
    )
  }

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
      updateAvailable={updateAvailable}
    />
  )
}

