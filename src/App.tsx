import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './contexts/AuthContext'
import type { Player, Task, ScoutingPlayer, ScoutingReport, ScoutingMatch } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
import { Dashboard } from './views/Dashboard'
import { PlayerDetail } from './views/PlayerDetail'
import { AdminPanel } from './views/AdminPanel'
import { OverviewPanel } from './views/OverviewPanel'
import { PlayersTable } from './views/PlayersTable'
import { Distribution } from './views/Distribution'
import { ClubDetail } from './views/ClubDetail'
import { Captacion } from './views/Captacion'
import type { Club, DistributionEntry, ClubNegotiation } from './types'

export interface AppNotification {
  id: string
  message: string
  type: 'task_new' | 'task_done' | 'birthday'
  playerId?: string
  ts: number
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-[hsl(220,72%,26%)] rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const { user, profile, loading, signIn, signOut } = useAuth()

  const [players, setPlayers] = useState<Player[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  // four main sections
  const [mainSection, setMainSection] = useState<'tareas' | 'jugadores' | 'distribucion' | 'captacion'>('tareas')
  // where to return after closing PlayerDetail
  const [playerReturnToClub, setPlayerReturnToClub] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  // Distribution state
  const [clubs, setClubs] = useState<Club[]>([])
  const [distEntries, setDistEntries] = useState<DistributionEntry[]>([])
  const [negotiations, setNegotiations] = useState<ClubNegotiation[]>([])

  // Captación state
  const [scoutingPlayers, setScoutingPlayers] = useState<ScoutingPlayer[]>([])
  const [scoutingReports, setScoutingReports] = useState<ScoutingReport[]>([])
  const [scoutingMatches, setScoutingMatches] = useState<ScoutingMatch[]>([])

  const addNotification = useCallback((msg: string, type: AppNotification['type'], playerId?: string) => {
    setNotifications((prev) => [
      { id: 'n' + Date.now() + Math.random(), message: msg, type, playerId, ts: Date.now() },
      ...prev,
    ].slice(0, 50))
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // Load all data once authenticated
  useEffect(() => {
    if (!user) return
    setDataLoading(true)
    Promise.all([
      db.fetchPlayers(),
      db.fetchTasks(),
      db.fetchProfiles(),
      db.fetchClubs(),
      db.fetchDistributionEntries(),
      db.fetchNegotiations(),
      db.fetchScoutingPlayers(),
      db.fetchScoutingReports(),
      db.fetchScoutingMatches(),
    ]).then(([p, t, pr, cl, de, ng, sp, sr, sm]) => {
      setPlayers(p)
      setTasks(t)
      setProfiles(pr as Profile[])
      setClubs(cl as Club[])
      setDistEntries(de as DistributionEntry[])
      setNegotiations(ng as ClubNegotiation[])
      setScoutingPlayers(sp as ScoutingPlayer[])
      setScoutingReports(sr as ScoutingReport[])
      setScoutingMatches(sm as ScoutingMatch[])
    }).finally(() => setDataLoading(false))
  }, [user])

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
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, profile, addNotification])

  if (loading) return <Spinner />
  if (!user || !profile) return <LoginScreen onLogin={signIn} />
  if (dataLoading) return <Spinner />

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
    setMainSection('distribucion')
  }

  // ── routing ─────────────────────────────────────────────────

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

  if (selectedPlayer) {
    const playerTasks = tasks.filter((t) => t.playerId === selectedPlayer.id)
    return (
      <PlayerDetail
        player={selectedPlayer}
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
  if (selectedClub) {
    return (
      <ClubDetail
        club={selectedClub}
        players={players}
        entries={distEntries}
        negotiations={negotiations}
        currentProfile={profile}
        onBack={() => setSelectedClubId(null)}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => { setSelectedClubId(null); setShowAdmin(true) } : undefined}
        onSelectPlayer={(id) => navigateToPlayer(id, true)}
        onUpdateClub={handleUpdateClub}
        onDeleteClub={async (id) => { await handleDeleteClub(id); setSelectedClubId(null) }}
        onCreateNegotiation={handleCreateNegotiation}
        onUpdateNegotiation={handleUpdateNegotiation}
        onDeleteNegotiation={handleDeleteNegotiation}
      />
    )
  }

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
      />
    )
  }

  if (mainSection === 'distribucion') {
    return (
      <Distribution
        players={players}
        clubs={clubs}
        entries={distEntries}
        negotiations={negotiations}
        currentProfile={profile}
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
    />
  )
}

