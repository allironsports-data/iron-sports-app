// ── Errores del cliente → public.client_errors ───────────────────────
// registrarError() nunca lanza y se autolimita: máximo 5 por minuto y no
// repite el mismo mensaje en 1 minuto. Se llama desde ErrorBoundary y
// desde los listeners globales de main.tsx.

import { supabase } from './supabase'
import { BUILD_ID } from '../changelog'

const MAX_POR_MINUTO = 5
const VENTANA_MS = 60_000

let enviados: number[] = []                       // timestamps de los últimos envíos
const ultimoPorMensaje = new Map<string, number>() // mensaje → último envío

function extraer(err: unknown): { mensaje: string; stack: string | null } {
  if (err instanceof Error) return { mensaje: err.message || err.name, stack: err.stack ?? null }
  if (typeof err === 'string') return { mensaje: err, stack: null }
  try { return { mensaje: JSON.stringify(err).slice(0, 500), stack: null } } catch { return { mensaje: String(err), stack: null } }
}

/** Solo para tests: reinicia el throttle */
export function _resetThrottle() {
  enviados = []
  ultimoPorMensaje.clear()
}

/** ¿Toca enviar este mensaje ahora? (aplica el throttle y lo registra) */
export function permitirEnvio(mensaje: string, ahora = Date.now()): boolean {
  enviados = enviados.filter(t => ahora - t < VENTANA_MS)
  const ult = ultimoPorMensaje.get(mensaje)
  if (ult !== undefined && ahora - ult < VENTANA_MS) return false
  if (enviados.length >= MAX_POR_MINUTO) return false
  enviados.push(ahora)
  ultimoPorMensaje.set(mensaje, ahora)
  return true
}

export function registrarError(err: unknown, contexto?: Record<string, unknown>): void {
  try {
    const { mensaje, stack } = extraer(err)
    if (!mensaje) return
    if (!permitirEnvio(mensaje)) return
    const fila = {
      build_id: BUILD_ID,
      ruta: typeof location !== 'undefined' ? location.hash : null,
      mensaje: mensaje.slice(0, 2000),
      stack: stack ? stack.slice(0, 8000) : null,
      contexto: contexto ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    }
    // Sin sesión (login) el insert fallará por RLS: se ignora
    void supabase.from('client_errors').insert(fila).then(({ error }) => {
      if (error) console.warn('[errores] no se pudo registrar:', error.message)
    }, () => { /* red caída: nada que hacer */ })
  } catch { /* nunca lanza */ }
}

export interface ClientError {
  id: number
  at: string
  userId: string | null
  buildId: string | null
  ruta: string | null
  mensaje: string
  stack: string | null
  contexto: Record<string, unknown> | null
  userAgent: string | null
}

export async function fetchClientErrors(opts: { limit?: number; before?: string } = {}): Promise<ClientError[]> {
  const { limit = 200, before } = opts
  let q = supabase.from('client_errors').select('*').order('at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (before) q = q.lt('at', before)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as number, at: r.at as string, userId: (r.user_id as string) ?? null,
    buildId: (r.build_id as string) ?? null, ruta: (r.ruta as string) ?? null,
    mensaje: (r.mensaje as string) ?? '', stack: (r.stack as string) ?? null,
    contexto: (r.contexto as Record<string, unknown>) ?? null, userAgent: (r.user_agent as string) ?? null,
  }))
}

/** Borra los errores anteriores a `dias` días (solo admin por RLS) */
export async function vaciarErroresAntiguos(dias = 30): Promise<void> {
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { error } = await supabase.from('client_errors').delete().lt('at', limite)
  if (error) throw error
}
