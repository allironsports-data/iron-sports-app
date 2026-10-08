import { PLAYER_PRIORIDADES, type PlayerPrioridad } from '../types'

// ── Prioridad A / B / C de un jugador de Mantenimiento ──────────────

export const PRIORIDAD_META: Record<PlayerPrioridad, { label: string; chip: string; ayuda: string }> = {
  A: { label: 'A', chip: 'bg-red-600 text-white border-red-600',          ayuda: 'Prioridad máxima: el que más tiempo y atención se lleva' },
  B: { label: 'B', chip: 'bg-amber-400 text-amber-950 border-amber-400',  ayuda: 'Prioridad media' },
  C: { label: 'C', chip: 'bg-slate-200 text-slate-600 border-slate-200',  ayuda: 'Prioridad baja: seguimiento de fondo' },
}

/** Valor del filtro «Sin prioridad» en las listas */
export const SIN_PRIORIDAD = 'sin'

export function esPrioridad(v: unknown): v is PlayerPrioridad {
  return typeof v === 'string' && (PLAYER_PRIORIDADES as readonly string[]).includes(v)
}

/** true si el jugador pasa el filtro (varias prioridades, o «sin» para los que no tienen) */
export function jugadorEsDePrioridad(prioridad: PlayerPrioridad | undefined, filtro: string[]): boolean {
  if (filtro.length === 0) return true
  return prioridad ? filtro.includes(prioridad) : filtro.includes(SIN_PRIORIDAD)
}

/** Orden A → B → C → sin, para ordenar listas */
export function pesoPrioridad(p?: PlayerPrioridad): number {
  return p ? PLAYER_PRIORIDADES.indexOf(p) : PLAYER_PRIORIDADES.length
}
