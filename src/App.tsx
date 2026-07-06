import { useState, useEffect, useCallback, useRef, lazy } from 'react'
import { useAuth } from './contexts/AuthContext'
import type { Player, Task, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, BoulemaPeticion } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
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
  const [mainSection, setMainSection] = useState<'tareas' | 'jugadores' | 'distribucion' | 'captacion'>(
    () => (sessionStorage.getItem('nav_section') as 'tareas' | 'jugadores' | 'distribucion' | 'captacion') ?? 'tareas'
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

  // Distribution state
  const [clubs, setClubs] = useState<Club[]>([])
  const [distEntries, setDistEntries] = useState<DistributionEntry[]>([])
  const [negotiations, setNegotiations] = useState<ClubNegotiation[]>([])

  // Captación state
  const [scoutingPlayers, setScoutingPlayers] = useState<ScoutingPlayer[]>([])
  const [scoutingReports, setScoutingReports] = useState<ScoutingReport[]>([])
  const [scoutingMatches, setScoutingMatches] = useState<ScoutingMatch[]>([])
  const [matchPlayers, setMatchPlayers] = useState<ScoutingMatchPlayer[]>([])
  const [boulemaPeticiones, setBoulemaPeticiones] = useState<BoulemaPeticion[]>([])

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
      Promise.all([
        db.fetchClubs(),
        db.fetchDistributionEntries(),
        db.fetchNegotiations(),
        db.fetchScoutingPlayers(),
        db.fetchScoutingReports(),
        db.fetchScoutingMatches(),
        db.fetchMatchPlayers(),
        db.fetchBoulemaPeticiones().catch(() => [] as BoulemaPeticion[]),
      ]).then(([cl, de, ng, sp, sr, sm, mp, bp]) => {
        if (cancelled) return
        setClubs(cl as Club[])
        setDistEntries(de as DistributionEntry[])
        setNegotiations(ng as ClubNegotiation[])
        setScoutingPlayers(sp as ScoutingPlayer[])
        setScoutingReports(sr as ScoutingReport[])
        setScoutingMatches(sm as ScoutingMatch[])
        setMatchPlayers(mp as ScoutingMatchPlayer[])
        setBoulemaPeticiones(bp as BoulemaPeticion[])
      }).catch((err: unknown) => {
        // No bloquea la app: Distribución/Captación mostrarán listas vacías
        console.error('Error cargando datos secundarios:', err)
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

  const handleAddTask = async (task: Task) => {
    const saved = await db.createTask(task)
    setTasks((prev) => [...prev, saved])
  }

  const handleUpdateTask = async (updated: Task) => {
    await db.updateTask(updated)
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  const handleDeleteTask = async (taskId: string) => {
    await db.deleteTask(taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  const handleRefreshProfiles = async () => {
    const pr = await db.fetchProfiles()
    setProfiles(pr as Profile[])
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
  }
  const handleAddMatchPlayer = async (matchId: string, playerId: string) => {
    const mp = await db.addMatchPlayer(matchId, playerId)
    setMatchPlayers(prev => prev.some(x => x.matchId === matchId && x.playerId === playerId) ? prev : [...prev, mp])
  }
  const handleRemoveMatchPlayer = async (matchId: string, playerId: string) => {
    await db.removeMatchPlayer(matchId, playerId)
    setMatchPlayers(prev => prev.filter(x => !(x.matchId === matchId && x.playerId === playerId)))
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
      return (
        <TeamMemberDetail
          profile={selectedProfileData}
          allProfiles={profiles}
          tasks={tasks}
          players={players}
          onBack={() => setSelectedProfileId(null)}
          onSelectPlayer={(id) => { setSelectedProfileId(null); navigateToPlayer(id, false) }}
        />
      )
    }
  }

  if (selectedPlayer) {
    const playerTasks = tasks.filter((t) => t.playerId === selectedPlayer.id)
    return (
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

  if (mainSection === 'captacion') {
    return (
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
        boulemaPeticiones={boulemaPeticiones}
        onAddBoulemaPeticion={handleAddBoulemaPeticion}
        onUpdateBoulemaPeticion={handleUpdateBoulemaPeticion}
        onDeleteBoulemaPeticion={handleDeleteBoulemaPeticion}
      />
    )
  }

  if (mainSection === 'distribucion' || selectedClub) {
    const splitOpen = !!selectedClub
    return (
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
  return (
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
    />
  )
}

