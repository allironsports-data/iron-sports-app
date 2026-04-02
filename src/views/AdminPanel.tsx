import { useState } from 'react'
import logoImg from '../assets/logo.jpeg'
import type { Profile } from '../contexts/AuthContext'
import { updateProfile } from '../lib/db'
import { supabase } from '../lib/supabase'
import { ArrowLeft, LogOut, Shield, UserPlus, Check, X, Edit3, Copy, Trash2, KeyRound } from 'lucide-react'

const PRIMARY = 'hsl(220,72%,26%)'

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface Props {
  profiles: Profile[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onLogout: () => void
}

export function AdminPanel({ profiles, onBack, onRefresh, onLogout }: Props) {
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
        options: {
          data: { name: inviteName, avatar },
        },
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
      const { error } = await supabase.rpc('update_user_password', {
        target_user_id: profileId,
        new_password: newPassword,
      })
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
      const { error } = await supabase.rpc('delete_user', {
        target_user_id: p.id,
      })
      if (error) throw error
      setDeleteId(null)
      await onRefresh()
    } catch {
      // ignore
    }
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex-shrink-0">
              <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
            </div>
            <span className="font-semibold text-slate-900 text-sm">Panel de administración</span>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Create new member */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Añadir miembro del equipo
          </h2>

          {/* Success card */}
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
              <button
                onClick={handleCopy}
                className="text-xs flex items-center gap-1 text-emerald-700 hover:text-emerald-900"
              >
                <Copy className="w-3 h-3" />
                {copied ? '¡Copiado!' : 'Copiar al portapapeles'}
              </button>
              <button
                onClick={() => { setCreatedInfo(null); setInviteStatus('idle') }}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline block"
              >
                Añadir otro miembro
              </button>
            </div>
          )}

          {inviteStatus !== 'ok' && (
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    placeholder="nombre@email.com"
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                    placeholder="Nombre Apellido"
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Siglas (avatar)</label>
                  <input
                    type="text"
                    value={inviteAvatar}
                    onChange={(e) => setInviteAvatar(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="Auto (iniciales)"
                    maxLength={3}
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña temporal</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      required
                      className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() => setTempPassword(generatePassword())}
                      className="text-xs px-2 py-1.5 border border-slate-200 rounded-md text-slate-500 hover:text-slate-700 whitespace-nowrap"
                    >
                      Nueva
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={inviteStatus === 'sending'}
                  className="rounded-md text-white text-sm font-medium px-4 py-2 disabled:opacity-50 transition-colors"
                  style={{ background: PRIMARY }}
                >
                  {inviteStatus === 'sending' ? 'Creando...' : 'Crear usuario'}
                </button>
                {inviteStatus === 'error' && (
                  <span className="text-xs text-red-500">Error al crear el usuario. Comprueba que el email no esté ya registrado.</span>
                )}
              </div>
            </form>
          )}
          <p className="text-xs text-slate-400 mt-3">
            Sin emails — tú compartes la contraseña directamente con el miembro. Pueden cambiarla después.
          </p>
        </div>

        {/* Team members list */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">
              Miembros del equipo ({profiles.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {profiles.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">
                No hay perfiles aún. Invita al equipo usando el formulario de arriba.
              </p>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                  style={{ background: PRIMARY }}
                >
                  {p.avatar}
                </div>

                {/* Name / editing */}
                {editingId === p.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 w-48"
                    />
                    <input
                      value={editAvatar}
                      onChange={(e) => setEditAvatar(e.target.value.toUpperCase().slice(0, 3))}
                      className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 w-16"
                      maxLength={3}
                    />
                    <button onClick={() => handleSaveEdit(p.id)} className="text-emerald-500 hover:text-emerald-700">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      {p.is_admin && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                          <Shield className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{p.avatar}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => { setEditingId(p.id); setEditName(p.name); setEditAvatar(p.avatar) }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Editar nombre/siglas"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setResetId(p.id); setNewPassword(generatePassword()) }}
                    className="text-slate-400 hover:text-amber-500"
                    title="Cambiar contraseña"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(p.id)}
                    className="text-slate-400 hover:text-red-500"
                    title="Eliminar usuario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleAdmin(p)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      p.is_admin
                        ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {p.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                </div>

                {/* Reset password inline */}
                {resetId === p.id && (
                  <div className="w-full mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="flex-1 rounded border border-amber-200 px-2 py-1 text-sm font-mono"
                      placeholder="Nueva contraseña"
                    />
                    <button
                      onClick={() => handleResetPassword(p.id)}
                      disabled={resetStatus === 'saving'}
                      className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
                    >
                      {resetStatus === 'ok' ? '✓' : resetStatus === 'saving' ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setResetId(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {resetStatus === 'error' && (
                      <span className="text-xs text-red-500">Cámbiala desde Supabase Auth</span>
                    )}
                  </div>
                )}

                {/* Delete confirm inline */}
                {deleteId === p.id && (
                  <div className="w-full mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded p-2">
                    <span className="text-xs text-red-700 flex-1">¿Eliminar a {p.name}?</span>
                    <button
                      onClick={() => handleDeleteUser(p)}
                      className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                    >
                      Eliminar
                    </button>
                    <button onClick={() => setDeleteId(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Cómo añadir al equipo</h3>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Rellena el email, nombre y contraseña temporal</li>
            <li>Haz clic en "Crear usuario"</li>
            <li>Copia las credenciales y envíaselas por WhatsApp o email</li>
            <li>El miembro entra en allironsports.vercel.app con esos datos</li>
            <li>Puede cambiar su contraseña cuando quiera</li>
          </ol>
        </div>

      </main>
    </div>
  )
}
