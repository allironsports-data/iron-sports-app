import { useState } from 'react'
import logoImg from '../assets/logo.jpeg'

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>
}

/**
 * Antes cualquier fallo (credenciales, sin red, error de Supabase…) mostraba
 * siempre «Email o contraseña incorrectos», que confundía al que se había
 * quedado sin cobertura en el campo con el que se había equivocado de clave.
 */
function mensajeError(raw: string): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sin conexión a internet. Revisa tu conexión e inténtalo de nuevo.'
  }
  if (/invalid login credentials|invalid email or password/i.test(raw)) {
    return 'Email o contraseña incorrectos'
  }
  if (/failed to fetch|network|ecconn|timeout|fetch/i.test(raw)) {
    return 'No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.'
  }
  return 'No se ha podido iniciar sesión. Inténtalo de nuevo.'
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
    if (err) setError(mensajeError(err))
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
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
            autoFocus
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
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
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {error && (
            <p className="text-xs text-red-500 mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md text-white text-sm font-semibold py-2.5 disabled:opacity-60 transition-colors bg-primary hover:bg-primary/90"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
