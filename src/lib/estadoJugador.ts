import { PLAYER_ESTADOS, type PlayerEstado } from '../types'

// ── Estado del jugador ───────────────────────────────────────────────
// activo / inactivo / partner. Todo lo que no sea uno de los tres —una
// fila anterior a la migración, un valor a medio escribir, un null— se
// trata como ACTIVO: es lo que era antes de que existiera este campo, y
// así nadie desaparece de la lista por un dato que falta.

export const ESTADO_POR_DEFECTO: PlayerEstado = 'activo'

export const ESTADO_META: Record<PlayerEstado, { label: string; corto: string; chip: string; punto: string; ayuda: string }> = {
  activo: {
    label: 'Activo',
    corto: 'Activo',
    chip: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    punto: 'bg-emerald-500',
    ayuda: 'Lo gestionamos nosotros: el día a día es nuestro',
  },
  inactivo: {
    label: 'Inactivo',
    corto: 'Inactivo',
    chip: 'bg-slate-100 text-slate-500 border-slate-200',
    punto: 'bg-slate-400',
    ayuda: 'Nos ha dejado, o su contrato de representación ha vencido',
  },
  partner: {
    label: 'Gestión partner',
    corto: 'Partner',
    chip: 'bg-violet-100 text-violet-700 border-violet-200',
    punto: 'bg-violet-500',
    ayuda: 'El día a día lo lleva el partner, no nosotros',
  },
}

/** Cualquier cosa rara → activo (ver comentario de arriba) */
export function estadoDe(p: { estado?: string | null }): PlayerEstado {
  const e = (p.estado ?? '').trim().toLowerCase()
  return (PLAYER_ESTADOS as readonly string[]).includes(e) ? (e as PlayerEstado) : ESTADO_POR_DEFECTO
}

/** Opción «todos» del filtro: no es un estado, por eso va aparte del tipo */
export const ESTADO_TODOS = 'todos'
export type FiltroEstado = PlayerEstado | typeof ESTADO_TODOS

export function jugadorEsDeEstado(p: { estado?: string | null }, filtro: FiltroEstado): boolean {
  return filtro === ESTADO_TODOS || estadoDe(p) === filtro
}

/** Cuántos jugadores hay en cada estado, para los rótulos del filtro */
export function contarPorEstado(players: { estado?: string | null }[]): Record<PlayerEstado, number> {
  const out: Record<PlayerEstado, number> = { activo: 0, inactivo: 0, partner: 0 }
  for (const p of players) out[estadoDe(p)]++
  return out
}
