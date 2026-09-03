import { useMemo } from 'react'
import type { Player, Club, DistributionEntry, ClubNegotiation } from '../../types'

// ── Índices ─────────────────────────────────────────────────
// Antes cada fila de la tabla y cada tarjeta de club recorría el array
// entero de negociaciones (miles) varias veces: con 1.400 clubes eran
// millones de comparaciones en cada render. Se calculan una sola vez.

export interface DistributionIndexes {
  seasonEntries: DistributionEntry[]
  playersById: Map<string, Player>
  clubsById: Map<string, Club>
  negsByPlayer: Map<string, ClubNegotiation[]>
  negsByClub: Map<string, ClubNegotiation[]>
  /** Primera entrada de distribución de cada jugador (cualquier temporada) */
  entriesByPlayer: Map<string, DistributionEntry>
}

export function useDistributionIndexes({ players, clubs, entries, negotiations, season }: {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  /** Negociaciones ya filtradas (sin las «muertas» de jugadores cerrados) */
  negotiations: ClubNegotiation[]
  season: string
}): DistributionIndexes {
  // Sin memo, esto creaba un array NUEVO en cada render y con él se
  // invalidaban los tres cálculos más caros de la vista (la lista filtrada,
  // el resumen por jugador y las oportunidades, que lleva bucles anidados).
  // Una línea, pero se rehacía todo al mover el ratón.
  const seasonEntries = useMemo(
    () => entries.filter(e => e.season === season),
    [entries, season],
  )

  const playersById = useMemo(() => {
    const m = new Map<string, Player>()
    players.forEach(p => m.set(p.id, p))
    return m
  }, [players])

  const negsByPlayer = useMemo(() => {
    const m = new Map<string, ClubNegotiation[]>()
    negotiations.forEach(n => {
      const list = m.get(n.playerId)
      if (list) list.push(n); else m.set(n.playerId, [n])
    })
    return m
  }, [negotiations])

  const negsByClub = useMemo(() => {
    const m = new Map<string, ClubNegotiation[]>()
    negotiations.forEach(n => {
      const list = m.get(n.clubId)
      if (list) list.push(n); else m.set(n.clubId, [n])
    })
    return m
  }, [negotiations])

  const clubsById = useMemo(() => {
    const m = new Map<string, Club>()
    clubs.forEach(c => m.set(c.id, c))
    return m
  }, [clubs])

  const entriesByPlayer = useMemo(() => {
    const m = new Map<string, DistributionEntry>()
    entries.forEach(e => { if (!m.has(e.playerId)) m.set(e.playerId, e) })
    return m
  }, [entries])

  return { seasonEntries, playersById, clubsById, negsByPlayer, negsByClub, entriesByPlayer }
}
