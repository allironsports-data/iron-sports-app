// ── Uso de la app → public.app_uso ───────────────────────────────────
// latidoUso() marca el bloque de 5 minutos en curso para el usuario y la
// vista en la que está. Nunca lanza: si falla (sin red, migración sin
// ejecutar) se calla. fetchUsoResumen() lee el resumen por usuario que
// enseña Admin → Uso (RPC uso_app_resumen, migration_uso_app.sql).

import { supabase } from './supabase'

export const BLOQUE_MS = 5 * 60 * 1000

/** Inicio (ISO) del bloque de 5 minutos al que pertenece `t` */
export function bloqueDe(t = Date.now()): string {
  return new Date(Math.floor(t / BLOQUE_MS) * BLOQUE_MS).toISOString()
}

/** Marca el bloque actual como usado. Devuelve si se apuntó (para no repetir). */
export async function latidoUso(userId: string, vista: string, bloque = bloqueDe()): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_uso')
      .upsert({ user_id: userId, bloque, vista }, { onConflict: 'user_id,bloque,vista', ignoreDuplicates: true })
    if (error) {
      // 42P01 = tabla sin crear: no hace falta avisar cada minuto
      if (error.code !== '42P01') console.warn('[uso] no se pudo apuntar:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

export interface UsoUsuario {
  userId: string
  /** Bloques de 5 min distintos con actividad */
  bloques: number
  diasActivo: number
  primero: string | null
  ultimo: string | null
  /** vista → bloques */
  vistas: Record<string, number>
  /** 'YYYY-MM-DD' (hora de Madrid) → bloques */
  dias: Record<string, number>
}

interface Fila {
  user_id: string; bloques: number; dias_activo: number; primero: string | null; ultimo: string | null
  vistas: Record<string, number> | null; dias: Record<string, number> | null
}

export async function fetchUsoResumen(desde: Date, hasta?: Date): Promise<UsoUsuario[]> {
  const { data, error } = await supabase.rpc('uso_app_resumen', {
    p_desde: desde.toISOString(),
    ...(hasta ? { p_hasta: hasta.toISOString() } : {}),
  })
  if (error) throw error
  return ((data ?? []) as Fila[]).map(f => ({
    userId: f.user_id,
    bloques: Number(f.bloques) || 0,
    diasActivo: Number(f.dias_activo) || 0,
    primero: f.primero,
    ultimo: f.ultimo,
    vistas: f.vistas ?? {},
    dias: f.dias ?? {},
  }))
}

/** «3 h 25 min», «45 min», «< 5 min» */
export function fmtBloques(bloques: number): string {
  const min = bloques * 5
  if (min <= 0) return '0 min'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
