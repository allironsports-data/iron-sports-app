import { useState } from 'react'
import logoImg from '../assets/logo.jpeg'
import { Button, Field, Input } from '../components/ui'

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>
}

/** Detecta un fallo de red (sin conexión o fetch caído) para dar un mensaje útil. */
function esErrorDeRed(err: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /fetch|network|failed to|conexi[oó]n|timeout|ERR_/i.test(err)
}

const MSG_RED = 'No hay conexión. Comprueba tu red e inténtalo de nuevo.'

export function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const err = await onLogin(email, password)
      if (err) setError(esErrorDeRed(err) ? MSG_RED : 'Email o contraseña incorrectos')
    } catch (err) {
      // onLogin no debería lanzar, pero si el fetch revienta lo tratamos como red
      const msg = err instanceof Error ? err.message : ''
      setError(esErrorDeRed(msg) ? MSG_RED : 'No se pudo iniciar sesión. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
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
          <p className="text-meta text-slate-500 mt-1 uppercase tracking-widest">
            Gestión de jugadores
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4"
        >
          {/* Labels a 14px (text-body): Field pone text-meta por defecto */}
          <Field label={<span className="text-body">Email</span>} required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
            />
          </Field>

          <Field label={<span className="text-body">Contraseña</span>} required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>

          {error && (
            <p className="text-secondary text-red-600 text-center" role="alert">{error}</p>
          )}

          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
