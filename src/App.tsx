import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './contexts/AuthContext'
import type { Player, Task } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
import { Dashboard } from './views/Dashboard'
import { PlayerDetail } from './views/PlayerDetail'
import { AdminPanel } from './views/AdminPanel'
import { OverviewPanel } from './views/OverviewPanel'
import { PlayersTable } from './views/PlayersTable'

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
  const [showAdmin, setShowAdmin] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

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
    ]).then(([p, t, pr]) => {
      setPlayers(p)
      setTasks(t)
      setProfiles(pr as Profile[])
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

  const handleAddPlayer = async (player: Player) => {
    const saved = await db.createPlayer(player)
    setPlayers((prev) => [...prev, saved])
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

  // ── routing ─────────────────────────────────────────────────

  if (showTable && profile.is_admin) {
    return (
      <PlayersTable
        players={players}
        profiles={profiles}
        currentProfile={profile}
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
        onBack={() => setSelectedPlayerId(null)}
        onAddTask={handleAddTask}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onUpdatePlayer={handleUpdatePlayer}
        onDeletePlayer={profile.is_admin ? handleDeletePlayer : undefined}
        onLogout={signOut}
        onAdmin={profile.is_admin ? () => setShowAdmin(true) : undefined}
      />
    )
  }

  return (
    <Dashboard
      players={players}
      tasks={tasks}
      profiles={profiles}
      currentProfile={profile}
      onSelectPlayer={setSelectedPlayerId}
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
      onDeleteGeneralTask={handleDeleteTask}
    />
  )
}
