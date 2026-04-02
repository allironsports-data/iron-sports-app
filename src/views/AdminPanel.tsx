import { useState } from 'react'
import type { Profile } from '../contexts/AuthContext'
import { updateProfile } from '../lib/db'
import { supabase } from '../lib/supabase'
import { ArrowLeft, LogOut, Shield, Mail, Check, X, Edit3 } from 'lucide-react'

const PRIMARY = 'hsl(220,72%,26%)'

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
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteStatus('sending')
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail
        ? // Try admin invite first (won't work from client, fallback below)
          { error: new Error('use_otp') }
        : { error: null }

      if (error) {
        // Fallback: send magic link (OTP) — user sets password on first login
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: inviteEmail,
          options: {
            shouldCreateUser: true,
            data: { name: inviteName, avatar: inviteAvatar || inviteName.slice(0, 2).toUpperCase() },
          },
        })
        if (otpError) throw otpError
      }

      setInviteStatus('ok')
      setInviteEmail('')
      setInviteName('')
      setInviteAvatar('')
      await onRefresh()
      setTimeout(() => setInviteStatus('idle'), 3000)
    } catch {
      setInviteStatus('error')
      setTimeout(() => setInviteStatus('idle'), 3000)
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
            <div className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-black" style={{ background: PRIMARY }}>
              AI
            </div>
            <span className="font-semibold text-slate-900 text-sm">Panel de administración</span>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Invite new member */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Invitar miembro del equipo
          </h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  placeholder="PP"
                  maxLength={3}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={inviteStatus === 'sending'}
                className="rounded-md text-white text-sm font-medium px-4 py-2 disabled:opacity-50 transition-colors"
                style={{ background: PRIMARY }}
              >
                {inviteStatus === 'sending' ? 'Enviando...' : 'Enviar invitación'}
              </button>
              {inviteStatus === 'ok' && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Invitación enviada — recibirá un email con un enlace de acceso
                </span>
              )}
              {inviteStatus === 'error' && (
                <span className="text-xs text-red-500">Error al enviar. Inténtalo de nuevo.</span>
              )}
            </div>
          </form>
          <p className="text-xs text-slate-400 mt-3">
            El miembro recibirá un email con un enlace para establecer su contraseña y acceder a la app.
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingId(p.id); setEditName(p.name); setEditAvatar(p.avatar) }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Editar nombre/siglas"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleAdmin(p)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      p.is_admin
                        ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                    title={p.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  >
                    {p.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Cómo añadir al equipo</h3>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Introduce el email, nombre y siglas del miembro</li>
            <li>Haz clic en "Enviar invitación"</li>
            <li>Recibirán un email con un enlace para acceder</li>
            <li>En su primera visita establecerán su contraseña</li>
            <li>Vuelve aquí para hacer admin a quien necesites</li>
          </ol>
        </div>

      </main>
    </div>
  )
}
