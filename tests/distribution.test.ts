import { describe, it, expect } from 'vitest'
import {
  daysSince, isStale, topNegotiation, topStatus, ageOf, daysUntil, contractBadge, fmtMonth,
  suggestPlayersForNeed, hideDeadNegotiations, computeOpportunities, STALE_DAYS,
} from '../src/lib/distribution'
import type { Player, Club, ClubNegotiation, DistributionEntry } from '../src/types'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 3, 12, 0, 0).getTime()   // 3 sep 2026, mediodía local
const isoDaysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

function neg(over: Partial<ClubNegotiation> & Pick<ClubNegotiation, 'playerId' | 'clubId' | 'status'>): ClubNegotiation {
  return { id: `${over.playerId}-${over.clubId}-${over.status}`, createdAt: isoDaysAgo(30), updatedAt: isoDaysAgo(1), ...over }
}

function player(over: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    birthDate: '2000-01-01', positions: ['CM'], nationality: '', photo: '', clubs: [],
    managedBy: [], representationContract: { start: '', end: '' }, clubContract: { endDate: '' },
    contractHistory: [], clubInterests: [], matchReports: [], videoSessions: [], links: [], performance: [],
    info: { family: '', personality: '', phone: '' },
    ...over,
  } as Player
}

function club(over: Partial<Club> & Pick<Club, 'id' | 'name'>): Club {
  return { needs: [], isPriority: false, createdAt: '', ...over } as Club
}

function entry(playerId: string, priority: DistributionEntry['priority'] = 'B'): DistributionEntry {
  return { id: `e-${playerId}`, playerId, season: '2025-26', priority, active: true, createdAt: '' }
}

describe('daysSince / isStale', () => {
  it('cuenta días enteros desde un ISO', () => {
    expect(daysSince(isoDaysAgo(0), 999, NOW)).toBe(0)
    expect(daysSince(isoDaysAgo(3), 999, NOW)).toBe(3)
    expect(daysSince(new Date(NOW - 2.9 * DAY).toISOString(), 999, NOW)).toBe(2)
  })

  it('sin fecha devuelve el valor de relleno (999 por defecto)', () => {
    expect(daysSince(undefined)).toBe(999)
    expect(daysSince(null, 0)).toBe(0)
  })

  it('isStale: activa y parada más de STALE_DAYS', () => {
    expect(STALE_DAYS).toBe(7)
    expect(isStale(neg({ playerId: 'p', clubId: 'c', status: 'ofrecido', updatedAt: isoDaysAgo(8) }), NOW)).toBe(true)
    expect(isStale(neg({ playerId: 'p', clubId: 'c', status: 'ofrecido', updatedAt: isoDaysAgo(7) }), NOW)).toBe(false)
    // cerradas/descartadas nunca están «paradas»
    expect(isStale(neg({ playerId: 'p', clubId: 'c', status: 'cerrado', updatedAt: isoDaysAgo(90) }), NOW)).toBe(false)
    expect(isStale(neg({ playerId: 'p', clubId: 'c', status: 'descartado', updatedAt: isoDaysAgo(90) }), NOW)).toBe(false)
  })
})

describe('topNegotiation / topStatus', () => {
  const negs = [
    neg({ playerId: 'p', clubId: 'a', status: 'pendiente' }),
    neg({ playerId: 'p', clubId: 'b', status: 'ofrecido' }),
    neg({ playerId: 'p', clubId: 'c', status: 'interesado' }),
    neg({ playerId: 'p', clubId: 'd', status: 'descartado' }),
  ]

  it('elige negociando > interesado > ofrecido > cerrado', () => {
    expect(topStatus(negs)).toBe('interesado')
    expect(topStatus([...negs, neg({ playerId: 'p', clubId: 'e', status: 'negociando' })])).toBe('negociando')
    expect(topStatus([neg({ playerId: 'p', clubId: 'e', status: 'cerrado' }), neg({ playerId: 'p', clubId: 'f', status: 'ofrecido' })])).toBe('ofrecido')
  })

  it('ignora descartadas y, sin includePending, también pendientes', () => {
    const solo = [neg({ playerId: 'p', clubId: 'a', status: 'pendiente' }), neg({ playerId: 'p', clubId: 'd', status: 'descartado' })]
    expect(topStatus(solo)).toBeUndefined()
    expect(topNegotiation(solo, true)?.status).toBe('pendiente')
    expect(topNegotiation([], true)).toBeUndefined()
  })

  it('devuelve la negociación concreta (para abrir su desplegable de estado)', () => {
    expect(topNegotiation(negs, true)?.clubId).toBe('c')
  })
})

describe('ageOf', () => {
  const today = new Date(2026, 8, 3)   // 3 sep 2026
  it('resta un año si aún no ha cumplido', () => {
    expect(ageOf('2000-09-04', today)).toBe(25)
    expect(ageOf('2000-09-03', today)).toBe(26)
    expect(ageOf('2000-01-15', today)).toBe(26)
  })
  it('sin fecha o inválida → null', () => {
    expect(ageOf(undefined, today)).toBeNull()
    expect(ageOf('', today)).toBeNull()
    expect(ageOf('no-es-fecha', today)).toBeNull()
  })
})

describe('daysUntil / contractBadge / fmtMonth', () => {
  it('daysUntil: null sin fecha o inválida', () => {
    expect(daysUntil(undefined)).toBeNull()
    expect(daysUntil('')).toBeNull()
    expect(daysUntil('xxxx')).toBeNull()
    expect(typeof daysUntil('2030-06-30')).toBe('number')
  })

  it('contractBadge: expirado en rojo, próximo en rojo/ámbar, lejano en gris', () => {
    expect(contractBadge(undefined)).toBeNull()
    const past = contractBadge('2000-06-30')
    expect(past?.label).toBe('Expirado')
    expect(past?.cls).toContain('red')
    const soon = new Date(); soon.setDate(soon.getDate() + 30)
    const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
    expect(contractBadge(soonIso)?.cls).toContain('red')
    const mid = new Date(); mid.setDate(mid.getDate() + 120)
    const midIso = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
    expect(contractBadge(midIso)?.cls).toContain('amber')
    const far = contractBadge('2099-06-30')
    expect(far?.cls).toContain('slate')
    expect(far?.label).toBe(fmtMonth('2099-06-30'))
  })

  it('fmtMonth: vacío sin fecha; usa parseDia (no cambia de día)', () => {
    expect(fmtMonth(undefined)).toBe('')
    expect(fmtMonth('2026-06-30')).toMatch(/2026/)
    expect(fmtMonth('2026-06-30')).toMatch(/jun/i)
  })
})

describe('suggestPlayersForNeed', () => {
  const players = [
    player({ id: 'ok', name: 'Encaja', positions: ['CM'], birthDate: '2000-01-01' }),
    player({ id: 'pos', name: 'Otra posición', positions: ['GK'], birthDate: '2000-01-01' }),
    player({ id: 'nodist', name: 'Fuera de distribución', positions: ['CM'], birthDate: '2000-01-01' }),
    player({ id: 'closed', name: 'Ya firmó', positions: ['CM'], birthDate: '2000-01-01' }),
    player({ id: 'young', name: 'Demasiado joven', positions: ['CM'], birthDate: '2015-01-01' }),
    player({ id: 'nobd', name: 'Sin fecha', positions: ['CM'], birthDate: '' }),
  ]
  const dist = new Set(['ok', 'pos', 'closed', 'young', 'nobd'])
  const negotiations = [neg({ playerId: 'closed', clubId: 'x', status: 'cerrado' })]
  const need = { position: 'CM' }
  const today = new Date(2026, 8, 3)

  it('filtra por posición, distribución, cerrados y edad mínima (16)', () => {
    const ids = suggestPlayersForNeed({ need, players, negotiations, distributionPlayerIds: dist, today }).map(p => p.id)
    expect(ids).toEqual(['ok', 'nobd'])
  })

  it('acepta un Map como índice de distribución y excluye ids ya ofrecidos', () => {
    const map = new Map(Array.from(dist).map(id => [id, true]))
    const ids = suggestPlayersForNeed({ need, players, negotiations, distributionPlayerIds: map, excludeIds: new Set(['ok']), today }).map(p => p.id)
    expect(ids).toEqual(['nobd'])
  })
})

describe('hideDeadNegotiations', () => {
  it('oculta las abiertas de un jugador que ya cerró en otro club, conserva la cerrada', () => {
    const negs = [
      neg({ playerId: 'p1', clubId: 'a', status: 'cerrado' }),
      neg({ playerId: 'p1', clubId: 'b', status: 'ofrecido' }),
      neg({ playerId: 'p2', clubId: 'b', status: 'ofrecido' }),
    ]
    const out = hideDeadNegotiations(negs)
    expect(out.map(n => `${n.playerId}|${n.clubId}`)).toEqual(['p1|a', 'p2|b'])
  })
})

describe('computeOpportunities', () => {
  const today = new Date(2026, 8, 3)
  const players = [
    player({ id: 'a', name: 'Ana', positions: ['CM'], birthDate: '2000-01-01' }),
    player({ id: 'b', name: 'Bea', positions: ['CM'], birthDate: '1990-01-01' }),
    player({ id: 'c', name: 'Cid', positions: ['GK'], birthDate: '2000-01-01' }),
    player({ id: 'h', name: 'Oculto', positions: ['CM'], birthDate: '2000-01-01', hiddenFromManagement: true }),
  ]
  const playersById = new Map(players.map(p => [p.id, p]))
  const clubs = [
    club({ id: 'c1', name: 'Zeta', league: 'La Liga', country: 'Spain', needs: [{ position: 'CM', ageMax: 30 }] }),
    club({ id: 'c2', name: 'Alfa', league: 'La Liga', country: 'Spain', needs: [{ position: 'CM' }] }),
    club({ id: 'c3', name: 'Sin necesidades' }),
  ]
  const seasonEntries = [entry('a', 'B'), entry('b', 'A'), entry('c', 'A'), entry('h', 'A')]

  it('cruza cartera con necesidades respetando edad y excluyendo lo ya ofrecido/cerrado/oculto', () => {
    const negotiations = [neg({ playerId: 'a', clubId: 'c2', status: 'ofrecido' })]
    const out = computeOpportunities({ seasonEntries, playersById, clubs, negotiations, today })
    const keys = out.map(o => `${o.player.id}|${o.club.id}`)
    // Bea (A) tiene 36 años: no pasa el Sub-30 de c1 pero sí c2. Ana ya está ofrecida a c2.
    expect(keys).toEqual(['b|c2', 'a|c1'])
    expect(out[0].tier).toBe('A')
    expect(out[0].age).toBe(36)
  })

  it('ordena por prioridad, luego tier, luego nombre de jugador y de club', () => {
    const out = computeOpportunities({ seasonEntries, playersById, clubs, negotiations: [], today })
    const keys = out.map(o => `${o.player.id}|${o.club.id}`)
    // Bea es prioridad A; Ana (B) tiene dos: Alfa (c2) antes que Zeta (c1) por nombre de club
    expect(keys).toEqual(['b|c2', 'a|c2', 'a|c1'])
  })

  it('un jugador con negociación cerrada no genera oportunidades', () => {
    const negotiations = [neg({ playerId: 'a', clubId: 'c3', status: 'cerrado' })]
    const out = computeOpportunities({ seasonEntries, playersById, clubs, negotiations, today })
    expect(out.every(o => o.player.id !== 'a')).toBe(true)
  })
})
