import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import type { Player, Task } from './types'
import * as db from './lib/db'
import type { Profile } from './contexts/AuthContext'
import { LoginScreen } from './views/LoginScreen'
import { Dashboard } from './views/Dashboard'
import { PlayerDetail } from './views/PlayerDetail'
import { AdminPanel } from './views/AdminPanel'

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

  if (showAdmin && profile.is_admin) {
    return (
      <AdminPanel
        profiles={profiles}
        onBack={() => setShowAdmin(false)}
        onRefresh={handleRefreshProfiles}
        onLogout={signOut}
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
    />
  )
}
