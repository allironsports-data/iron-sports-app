import type { ClubNegotiation } from '../types'

// ── Config compartida de estados de negociación ────────────────

export const NEG_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado']

export const NEG_STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string; rowBorder: string; rowBg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400', rowBorder: 'border-l-purple-400', rowBg: 'bg-purple-100/50' },
  ofrecido:   { label: 'Ofrecido',   color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400',  rowBorder: 'border-l-slate-400',  rowBg: 'bg-slate-100/60' },
  interesado: { label: 'Interesado', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',   rowBorder: 'border-l-blue-500',   rowBg: 'bg-blue-100/50' },
  negociando: { label: 'Negociando', color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500',  rowBorder: 'border-l-amber-500',  rowBg: 'bg-amber-100/60' },
  cerrado:    { label: 'Cerrado',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500',  rowBorder: 'border-l-green-500',  rowBg: 'bg-green-100/60' },
  descartado: { label: 'Descartado', color: 'bg-red-100 text-red-600',       dot: 'bg-red-400',    rowBorder: 'border-l-red-400',    rowBg: 'bg-red-100/40' },
}

export const NEG_STATUS_ORDER: Record<ClubNegotiation['status'], number> = {
  negociando: 0, interesado: 1, ofrecido: 2, pendiente: 3, cerrado: 4, descartado: 5,
}

/** "LT / AV / PP" → ['LT','AV','PP']; normaliza espacios y mayúsculas para evitar dupes */
export const parseGestores = (s?: string) => (s ?? '').split(/[/,+&]/).map(t => t.trim().toUpperCase()).filter(Boolean)
