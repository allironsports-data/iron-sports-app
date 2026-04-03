import { useState } from 'react'
import logoImg from '../assets/logo.jpeg'
import type { Profile } from '../contexts/AuthContext'
import type { Task, Player } from '../types'
import { updateProfile } from '../lib/db'
import { supabase } from '../lib/supabase'
import { ArrowLeft, LogOut, Shield, UserPlus, Check, X, Edit3, Copy, Trash2, KeyRound, AlertTriangle, BarChart3, Users } from 'lucide-react'

const PRIMARY = 'hsl(220,72%,26%)'

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface Props {
  profiles: Profile[]
  tasks: Task[]
  players: Player[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onLogout: () => void
}

type AdminTab = 'equipo' | 'tareas'

export function AdminPanel({ profiles, tasks, players, onBack, onRefresh, onLogout }: Props) {
  const [tab, setTab] = useState<AdminTab>('equipo')

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'equipo', label: 'Equipo', icon: <Users className="w-4 h-4" /> },
    { id: 'tareas', label: 'Seguimiento', icon: <BarChart3 className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src={logoImg} alt="" className="h-8 w-auto rounded" />
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-800">Administración</h1>
            <p className="text-xs text-slate-400">Gestión del equipo y seguimiento</p>
          </div>
          <button onClick={onLogout} className="p-2 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Cerrar sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-[hsl(220,72%,26%)] text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'equipo' && <TeamTab profiles={profiles} players={players} onRefresh={onRefresh} />}
        {tab === 'tareas' && <TaskTrackingTab profiles={profiles} tasks={tasks} players={players} />}
      </main>
    </div>
  )
}

/* ========== TEAM TAB ========== */
function TeamTab({ profiles, players, onRefresh }: { profiles: Profile[]; players: Player[]; onRefresh: () => Promise<void> }) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteAvatar, setInviteAvatar] = useState('')
  const [tempPassword, setTempPassword] = useState(() => generatePassword())
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [resetId, setResetId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetStatus, setResetStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteStatus('sending')
    try {
      const avatar = inviteAvatar || inviteName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
      const { error } = await supabase.auth.signUp({
        email: inviteEmail,
        password: tempPassword,
        options: { data: { name: inviteName, avatar } },
      })
      if (error) throw error
      setCreatedInfo({ email: inviteEmail, password: tempPassword })
      setInviteStatus('ok')
      setInviteEmail('')
      setInviteName('')
      setInviteAvatar('')
      setTempPassword(generatePassword())
      await onRefresh()
    } catch (err: unknown) {
      console.error(err)
      setInviteStatus('error')
      setTimeout(() => setInviteStatus('idle'), 4000)
    }
  }

  const handleCopy = () => {
    if (!createdInfo) return
    navigator.clipboard.writeText(`URL: https://allironsports.vercel.app\nEmail: ${createdInfo.email}\nContraseña: ${createdInfo.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleResetPassword = async (profileId: string) => {
    if (!newPassword || newPassword.length < 6) return
    setResetStatus('saving')
    try {
      const { error } = await supabase.rpc('update_user_password', { target_user_id: profileId, new_password: newPassword })
      if (error) throw error
      setResetStatus('ok')
      setTimeout(() => { setResetStatus('idle'); setResetId(null); setNewPassword('') }, 2000)
    } catch {
      setResetStatus('error')
      setTimeout(() => setResetStatus('idle'), 3000)
    }
  }

  const handleDeleteUser = async (p: Profile) => {
    try {
      const { error } = await supabase.rpc('delete_user', { target_user_id: p.id })
      if (error) throw error
      setDeleteId(null)
      await onRefresh()
    } catch { /* ignore */ }
  }

  const handleToggleAdmin = async (p: Profile) => {
    await updateProfile(p.id, { is_admin: !p.is_admin })
    await onRefresh()
  }

  const handleSaveEdit = async (id: string) => {
    await updateProfile(id, { name: editName, avatar: editAvatar })
    await onRefresh()
    setEditingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Create new member */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Añadir miembro del equipo
        </h2>

        {inviteStatus === 'ok' && createdInfo && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Usuario creado. Comparte estos datos:</span>
            </div>
            <div className="bg-white rounded border border-emerald-100 px-3 py-2 text-sm font-mono text-slate-700 mb-2">
              <div>Email: <strong>{createdInfo.email}</strong></div>
              <div>Contraseña: <strong>{createdInfo.password}</strong></div>
              <div className="text-xs text-slate-400 mt-1">allironsports.vercel.app</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleCopy} className="text-xs flex items-center gap-1 text-emerald-700 hover:text-emerald-900">
                <Copy className="w-3 h-3" />{copied ? '¡Copiado!' : 'Copiar al portapapeles'}
              </button>
              <button onClick={() => { setCreatedInfo(null); setInviteStatus('idle') }}
                className="text-xs text-slate-400 hover:text-slate-600 underline">
                Añadir otro
              </button>
            </div>
          </div>
        )}

        {inviteStatus !== 'ok' && (
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required
                  placeholder="nombre@email.com"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required
                  placeholder="Nombre Apellido"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Siglas (avatar)</label>
                <input type="text" value={inviteAvatar} onChange={(e) => setInviteAvatar(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="Auto (iniciales)" maxLength={3}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña temporal</label>
                <div className="flex gap-2">
                  <input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2" />
                  <button type="button" onClick={() => setTempPassword(generatePassword())}
                    className="text-xs px-2 py-1.5 border border-slate-200 rounded-md text-slate-500 hover:text-slate-700 whitespace-nowrap">
                    Nueva
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={inviteStatus === 'sending'}
                className="rounded-md text-white text-sm font-medium px-4 py-2 disabled:opacity-50" style={{ background: PRIMARY }}>
                {inviteStatus === 'sending' ? 'Creando...' : 'Crear usuario'}
              </button>
              {inviteStatus === 'error' && (
                <span className="text-xs text-red-500">Error al crear el usuario. Comprueba que el email no esté ya registrado.</span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Team members */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Miembros del equipo ({profiles.length})</h2>
        </div>
        {profiles.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Sin miembros aún.</p>
        )}
        <div className="divide-y divide-slate-100">
          {profiles.map((p) => {
            const managedCount = players.filter(pl => pl.managedBy.includes(p.id)).length
            return (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: PRIMARY }}>{p.avatar}</div>

                  {editingId === p.id ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 w-40" />
                      <input value={editAvatar} onChange={(e) => setEditAvatar(e.target.value.toUpperCase().slice(0, 3))}
                        className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 w-16" maxLength={3} />
                      <button onClick={() => handleSaveEdit(p.id)} className="text-emerald-500 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{p.name}</span>
                        {p.is_admin && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                            <Shield className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{managedCount} jugador{managedCount !== 1 ? 'es' : ''}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setEditingId(p.id); setEditName(p.name); setEditAvatar(p.avatar) }}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Editar">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setResetId(resetId === p.id ? null : p.id); setNewPassword(generatePassword()) }}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-500" title="Cambiar contraseña">
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(deleteId === p.id ? null : p.id)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleAdmin(p)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                        p.is_admin ? 'border-blue-200 text-blue-600 hover:bg-blue-50' : 'border-slate-200 text-slate-500 hover:text-slate-700'
                      }`}>
                      {p.is_admin ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                  </div>
                </div>

                {/* Reset password */}
                {resetId === p.id && (
                  <div className="mt-2 ml-12 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      className="flex-1 rounded border border-amber-200 px-2 py-1 text-sm font-mono" placeholder="Nueva contraseña" />
                    <button onClick={() => handleResetPassword(p.id)} disabled={resetStatus === 'saving'}
                      className="text-xs px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600">
                      {resetStatus === 'ok' ? '✓ Guardada' : resetStatus === 'saving' ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setResetId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                    {resetStatus === 'error' && <span className="text-xs text-red-500">Error — usa Supabase Auth</span>}
                  </div>
                )}

                {/* Delete confirm */}
                {deleteId === p.id && (
                  <div className="mt-2 ml-12 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <span className="text-xs text-red-700 flex-1">¿Eliminar a <strong>{p.name}</strong>? Esta acción no se puede deshacer.</span>
                    <button onClick={() => handleDeleteUser(p)}
                      className="text-xs px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600">Eliminar</button>
                    <button onClick={() => setDeleteId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ========== TASK TRACKING TAB ========== */
function TaskTrackingTab({ profiles, tasks, players }: { profiles: Profile[]; tasks: Task[]; players: Player[] }) {
  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryBox label="Total tareas" value={tasks.length} color="blue" />
        <SummaryBox label="Completadas" value={tasks.filter(t => t.status === 'completada').length} color="green" />
        <SummaryBox label="Pendientes" value={tasks.filter(t => t.status === 'pendiente').length} color="amber" />
        <SummaryBox label="Vencidas" value={tasks.filter(t => t.status !== 'completada' && t.dueDate && new Date(t.dueDate) < new Date()).length} color="red" />
      </div>

      {/* Per-user cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {profiles.map(p => {
          const assigned = tasks.filter(t => t.assigneeId === p.id)
          const completed = assigned.filter(t => t.status === 'completada')
          const pending = assigned.filter(t => t.status !== 'completada')
          const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < new Date())
          const inProgress = assigned.filter(t => t.status === 'en_progreso')
          const managedCount = players.filter(pl => pl.managedBy.includes(p.id)).length

          return (
            <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: PRIMARY }}>{p.avatar}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">{managedCount} jugador{managedCount !== 1 ? 'es' : ''}</p>
                </div>
                {overdue.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{overdue.length}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-slate-800">{assigned.length}</p>
                  <p className="text-[10px] text-slate-500">Total</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-600">{completed.length}</p>
                  <p className="text-[10px] text-emerald-600">Hechas</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-violet-600">{inProgress.length}</p>
                  <p className="text-[10px] text-violet-600">En curso</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-600">{pending.length}</p>
                  <p className="text-[10px] text-amber-600">Pendientes</p>
                </div>
              </div>
              {assigned.length > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${(completed.length / assigned.length) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{Math.round((completed.length / assigned.length) * 100)}% completado</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryBox({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.blue}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] font-medium opacity-70 uppercase tracking-wide">{label}</p>
    </div>
  )
}
