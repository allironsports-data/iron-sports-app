import { useState } from 'react'
import logoImg from '../assets/logo.jpeg'

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>
}

export function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await onLogin(email, password)
    if (err) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow mb-4 overflow-hidden">
            <img src={logoImg} className="w-full h-full object-contain p-1" alt="All Iron Sports" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
            All Iron Sports
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
            Gestión de jugadores
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"
        >
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'hsl(220,72%,26%)' } as React.CSSProperties}
          />

          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2"
          />

          {error && (
            <p className="text-xs text-red-500 mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md text-white text-sm font-semibold py-2.5 disabled:opacity-60 transition-colors"
            style={{ background: 'hsl(220,72%,26%)' }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
