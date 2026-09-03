import type { ClubNegotiation } from '../../types'
import { NEG_STATUSES as SHARED_NEG_STATUSES, NEG_STATUS_CONFIG } from '../../components/playerClubList'

// ── Constantes y helpers sin JSX de Distribución ──────────────
// (en fichero aparte para que Fast Refresh funcione en shared.tsx)

// ── constants ─────────────────────────────────────────────────

export const CONDITIONS = ['Libre', 'Traspaso', 'Cesión', 'Cesión/Traspaso', 'Traspaso (porcentaje)', 'Cesión con opción']
// Estados de negociación: config compartida (ver PlayerClubList)
export const NEG_STATUSES = SHARED_NEG_STATUSES
export const STATUS_CONFIG = NEG_STATUS_CONFIG

// Array vacío estable: evita crear uno nuevo en cada render (rompería memo)
export const SIN_NEGOCIACIONES: ClubNegotiation[] = []

export const PRIORITY_CONFIG = {
  A: { label: 'A', bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    ring: 'ring-red-400' },
  B: { label: 'B', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  ring: 'ring-amber-400' },
  C: { label: 'C', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  ring: 'ring-slate-400' },
  D: { label: 'D', bg: 'bg-orange-50',  text: 'text-orange-600', border: 'border-orange-200', ring: 'ring-orange-300' },
}

export type Priority = keyof typeof PRIORITY_CONFIG
export type DropPos = { top: number; right: number }

// ── League / Club metadata ── movido a ../../lib/clubTiers.ts ────

// ── helpers ───────────────────────────────────────────────────

/** Posición de dropdown fijo que nunca se sale de la pantalla.
 *  Si no cabe por abajo, sube el dropdown lo necesario; siempre con scroll interno. */
export function clampDropPos(top: number, itemCount: number): { top: number; maxHeight: number } {
  const estimated = itemCount * 36 + 70
  const maxHeight = Math.min(estimated, Math.floor(window.innerHeight * 0.6), window.innerHeight - 16)
  const clampedTop = Math.max(8, Math.min(top, window.innerHeight - maxHeight - 8))
  return { top: clampedTop, maxHeight }
}
