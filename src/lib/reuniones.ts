import type { AgendaEvento } from '../types'
import { norm } from './texto'

// ── Reuniones: cuáles se cierran y cuándo ───────────────────────────
// Una reunión, visita, videollamada, cita o comida se «cierra» cuando ya
// ha pasado: recap (y, si el jugador está en el pipeline Firmar, estatus
// y siguiente paso). Vale para cualquier reunión: con jugador nuestro el
// recap queda en su actividad; sin jugador, en el propio evento.
// Esto es lo que decide qué eventos entran en ese circuito. Sin React ni
// base de datos, para poder probarlo.

/** Tipos de evento que NO se cierran: no son una reunión con alguien */
const NO_CERRABLES = ['partido', 'viaje', 'nota general', 'email', 'transferencia', 'llamada', 'sesion de analisis']

export function esReunionCerrable(e: Pick<AgendaEvento, 'tipo'>): boolean {
  const t = norm(e.tipo)
  return !NO_CERRABLES.some(x => t.startsWith(x))
}

/** true si la reunión ya ha pasado (hoy cuenta solo si tiene hora y ya es más tarde) */
export function reunionPasada(e: Pick<AgendaEvento, 'fecha' | 'hora'>, hoy: string, ahoraHora?: string): boolean {
  if (e.fecha < hoy) return true
  if (e.fecha > hoy) return false
  return !!e.hora && !!ahoraHora && e.hora <= ahoraHora
}

export function reunionSinCerrar(e: AgendaEvento, hoy: string, ahoraHora?: string): boolean {
  return esReunionCerrable(e) && !e.cerradoAt && reunionPasada(e, hoy, ahoraHora)
}

/** id del apunte que un evento deja en el historial de la tarjeta de Firmar */
export const idApunteEvento = (eventoId: string): string => `evento-${eventoId}`

/** "HH:MM" local de ahora, para reunionPasada */
export function horaActual(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
