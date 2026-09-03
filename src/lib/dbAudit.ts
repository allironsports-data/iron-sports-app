// ── Lectura del historial de cambios (public.audit_log) ──────────────
// La tabla la rellena un trigger (migration_audit_log.sql); desde la
// app solo se lee.

import { supabase } from './supabase'

export type AuditAccion = 'INSERT' | 'UPDATE' | 'DELETE'

export interface AuditEntry {
  id: number
  at: string
  userId: string | null
  tabla: string
  filaId: string
  accion: AuditAccion
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  /** Solo en UPDATE: { campo: [antes, despues] } */
  cambios: Record<string, [unknown, unknown]> | null
}

/** Tablas auditadas, con etiqueta para el filtro */
export const AUDIT_TABLAS: { id: string; label: string }[] = [
  { id: 'players', label: 'Jugadores' },
  { id: 'clubs', label: 'Clubes' },
  { id: 'club_negotiations', label: 'Negociaciones' },
  { id: 'captacion_firmas', label: 'Firmas captación' },
  { id: 'scouting_players', label: 'Jugadores scouting' },
  { id: 'scouting_reports', label: 'Informes' },
  { id: 'tasks', label: 'Tareas' },
]

interface Row {
  id: number; at: string; user_id: string | null; tabla: string; fila_id: string
  accion: AuditAccion; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null
  cambios: Record<string, [unknown, unknown]> | null
}

const rowToEntry = (r: Row): AuditEntry => ({
  id: r.id, at: r.at, userId: r.user_id, tabla: r.tabla, filaId: r.fila_id,
  accion: r.accion, antes: r.antes, despues: r.despues, cambios: r.cambios,
})

/**
 * Página de historial, de más reciente a más antiguo. `before` = fecha ISO
 * del último elemento cargado, para «Cargar más».
 */
export async function fetchAudit(opts: { tabla?: string; filaId?: string; limit?: number; before?: string } = {}): Promise<AuditEntry[]> {
  const { tabla, filaId, limit = 200, before } = opts
  let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (tabla) q = q.eq('tabla', tabla)
  if (filaId) q = q.eq('fila_id', filaId)
  if (before) q = q.lt('at', before)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Row[]).map(rowToEntry)
}
