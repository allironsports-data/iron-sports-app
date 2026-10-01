// ── Tareas recurrentes ───────────────────────────────────────────────
// Al completar una tarea que se repite, App crea la siguiente con la fecha
// que sale de aquí. Columna tasks.recurrence (migration_tasks_recurrence.sql).

import { sumarDias } from './fechas'

export const RECURRENCIAS = ['semanal', 'mensual'] as const
export type Recurrencia = typeof RECURRENCIAS[number]
export const RECURRENCIA_LABEL: Record<Recurrencia, string> = { semanal: 'Cada semana', mensual: 'Cada mes' }

/** Mismo día del mes siguiente; si no existe (31 → febrero), el último día de ese mes */
function sumarMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const anio = m === 12 ? y + 1 : y
  const mes = m === 12 ? 1 : m + 1
  const ultimo = new Date(anio, mes, 0).getDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

/**
 * Fecha de la siguiente repetición. Parte de la fecha que tenía la tarea
 * (o de hoy si no tenía) y avanza de periodo en periodo hasta no caer en
 * el pasado: completar con tres semanas de retraso no crea otra ya vencida.
 */
export function siguienteFecha(fecha: string | undefined, r: Recurrencia, hoy: string): string {
  const paso = (f: string) => r === 'semanal' ? sumarDias(f, 7) : sumarMes(f)
  let f = paso(fecha?.slice(0, 10) || hoy)
  while (f < hoy) f = paso(f)
  return f
}
