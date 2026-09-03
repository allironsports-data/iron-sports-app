// ── Lógica pura de Distribución ────────────────────────────────
// Helpers sin React ni DOM que antes vivían (a veces triplicados) en
// views/Distribution.tsx y views/ClubDetail.tsx. Se prueban en
// tests/distribution.test.ts.

import type { Player, Club, ClubNeed, ClubNegotiation, DistributionEntry } from '../types'
import { parseDia, diasHasta } from './fechas'
import { needMatchesPlayer, needFamily, normalizePositions } from './positions'
import { getClubTier } from './clubTiers'
import type { LeagueTier } from './clubTiers'

/** Estados de negociación que cuentan como «activa» (ni cerrada ni descartada). */
export const ACTIVE_NEG_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']

/** Días sin mover una propuesta activa a partir de los cuales se considera «parada». */
export const STALE_DAYS = 7

// Fechas de día (AAAA-MM-DD) → parseDia: new Date('2026-06-30') es medianoche
// UTC y en algunas zonas se pintaba/contaba como el día anterior.

/** Short month+year: "jun 2025". Empty string if no date. */
export function fmtMonth(dateStr?: string): string {
  if (!dateStr) return ''
  const d = parseDia(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

/** "8 jul 2026" — para tooltips de "contactado el ..." */
export function fmtDateTime(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Days from today to a date (negative = past) */
export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const d = parseDia(dateStr)
  if (isNaN(d.getTime())) return null
  return diasHasta(dateStr)
}

/** Contract urgency badge: color class + label */
export function contractBadge(endDate?: string): { label: string; cls: string } | null {
  const days = daysUntil(endDate)
  if (days === null) return null
  const label = fmtMonth(endDate)
  if (days < 0)   return { label: 'Expirado', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days < 60)  return { label,             cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days < 180) return { label,             cls: 'bg-amber-100 text-amber-700 border-amber-200' }
  return             { label,                 cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}

/**
 * Días transcurridos desde un ISO (timestamp completo). Si no hay fecha
 * devuelve `missing` (999 por defecto: «hace muchísimo»).
 */
export function daysSince(iso: string | undefined | null, missing = 999, now = Date.now()): number {
  if (!iso) return missing
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000)
}

/** Negociación activa sin mover más de STALE_DAYS días. */
export function isStale(neg: ClubNegotiation, now = Date.now()): boolean {
  return ACTIVE_NEG_STATUSES.includes(neg.status) && daysSince(neg.updatedAt, 999, now) > STALE_DAYS
}

/** Orden de «mejor estado» para resumir las negociaciones de un jugador. */
const TOP_STATUS_ORDER: ClubNegotiation['status'][] = ['negociando', 'interesado', 'ofrecido', 'cerrado']

/**
 * La negociación más avanzada de un jugador (ignorando descartadas):
 * negociando → interesado → ofrecido → cerrado (→ pendiente si `includePending`).
 */
export function topNegotiation(negs: ClubNegotiation[], includePending = false): ClubNegotiation | undefined {
  const active = negs.filter(n => n.status !== 'descartado')
  const order = includePending ? [...TOP_STATUS_ORDER, 'pendiente' as const] : TOP_STATUS_ORDER
  for (const s of order) {
    const found = active.find(n => n.status === s)
    if (found) return found
  }
  return undefined
}

/** Estado de la negociación más avanzada (sin contar «pendiente»). */
export function topStatus(negs: ClubNegotiation[]): ClubNegotiation['status'] | undefined {
  return topNegotiation(negs)?.status
}

/** Edad en años a partir de AAAA-MM-DD (parseDia, no UTC). null si no hay fecha válida. */
export function ageOf(bd?: string, today = new Date()): number | null {
  if (!bd) return null
  const d = parseDia(bd)
  if (isNaN(d.getTime())) return null
  let a = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--
  return a
}

/**
 * Jugadores de la cartera que podrían encajar en una necesidad de club:
 * en distribución, sin ninguna negociación «cerrado», con al menos 16 años
 * y cuya posición encaja. `excludeIds` permite quitar los ya ofrecidos.
 */
export function suggestPlayersForNeed(opts: {
  need: ClubNeed
  players: Player[]
  /** Ids de jugadores en distribución (Set, Map o cualquier cosa con .has) */
  distributionPlayerIds: { has(id: string): boolean }
  negotiations: ClubNegotiation[]
  excludeIds?: { has(id: string): boolean }
  today?: Date
}): Player[] {
  const { need, players, distributionPlayerIds, negotiations, excludeIds, today = new Date() } = opts
  // Jugadores con alguna negociación ya cerrada → no sugerir
  const closedPlayerIds = new Set(negotiations.filter(n => n.status === 'cerrado').map(n => n.playerId))
  // El tope era «2009» fijo: cada año se quedaba más viejo. Ahora: menores de 16.
  const minYear = today.getFullYear() - 16
  return players.filter(p => {
    if (excludeIds?.has(p.id)) return false
    if (!distributionPlayerIds.has(p.id)) return false
    if (closedPlayerIds.has(p.id)) return false                 // ya cerrado en algún club
    const yr = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN
    if (!isNaN(yr) && yr > minYear) return false                // demasiado joven
    return needMatchesPlayer(need.position, p.positions)
  })
}

/**
 * Jugador CERRADO = fuera de la UX de Distribución. Si un jugador ya firmó
 * en algún club (alguna negociación «cerrado»), sus negociaciones abiertas
 * en OTROS clubes están muertas: se ocultan. La «cerrado» sí se conserva.
 */
export function hideDeadNegotiations(negotiations: ClubNegotiation[]): ClubNegotiation[] {
  const closed = new Set(negotiations.filter(n => n.status === 'cerrado').map(n => n.playerId))
  return negotiations.filter(n => n.status === 'cerrado' || !closed.has(n.playerId))
}

// ── MOTOR DE OPORTUNIDADES ──────────────────────────────────
// Cruza tu cartera (entries) con las necesidades abiertas de los clubes,
// excluyendo lo ya ofrecido y respetando edad (Sub-X estricto).
// Orden: prioridad del jugador (A>B>C>D) → tier del club → nombre.

export interface Opportunity {
  player: Player
  entry: DistributionEntry
  club: Club
  need: ClubNeed
  tier: LeagueTier
  age: number | null
}

export function computeOpportunities(opts: {
  seasonEntries: DistributionEntry[]
  playersById: { get(id: string): Player | undefined }
  clubs: Club[]
  negotiations: ClubNegotiation[]
  today?: Date
}): Opportunity[] {
  const { seasonEntries, playersById, clubs, negotiations, today = new Date() } = opts
  const PR: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
  const TR: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
  const closedPlayerIds = new Set(negotiations.filter(n => n.status === 'cerrado').map(n => n.playerId))
  const existingPairs = new Set(negotiations.map(n => `${n.playerId}|${n.clubId}`))
  // Las peticiones de cada club, con su familia de posiciones ya resuelta.
  // Antes se normalizaba el texto de la petición DENTRO del bucle, o sea
  // una vez por cada jugador y cada club: decenas de miles de veces para
  // sacar siempre lo mismo.
  const clubsWithNeeds = clubs
    .filter(c => c.needs && c.needs.length > 0)
    .map(c => ({
      club: c,
      needs: c.needs.map(n => ({ need: n, fam: needFamily(n.position) })),
    }))

  const out: Opportunity[] = []
  for (const entry of seasonEntries) {
    const player = playersById.get(entry.playerId)
    if (!player || player.hiddenFromManagement) continue
    if (closedPlayerIds.has(player.id)) continue
    const age = ageOf(player.birthDate, today)
    const codes = normalizePositions(player.positions)
    for (const { club, needs } of clubsWithNeeds) {
      if (existingPairs.has(`${player.id}|${club.id}`)) continue
      let matched: ClubNeed | null = null
      for (const { need, fam } of needs) {
        const encaja = fam
          ? codes.some(c => fam.includes(c))
          : needMatchesPlayer(need.position, player.positions)
        if (!encaja) continue
        if (need.ageMax && age !== null && age > need.ageMax) continue   // edad estricta
        matched = need; break
      }
      if (!matched) continue
      out.push({ player, entry, club, need: matched, tier: getClubTier(club.league, club.country), age })
    }
  }
  out.sort((a, b) =>
    (PR[a.entry.priority] ?? 9) - (PR[b.entry.priority] ?? 9) ||
    (TR[a.tier] ?? 9) - (TR[b.tier] ?? 9) ||
    a.player.name.localeCompare(b.player.name) ||
    a.club.name.localeCompare(b.club.name)
  )
  return out
}
