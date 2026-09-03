import { describe, it, expect } from 'vitest'
import {
  construirPlanificacion, rangoFinDeSemana, rangoSemana, tituloRango, planificacionACsv, htmlPlanificacion,
} from '../src/lib/planificacion'
import type { Player, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, ScoutingPlayer } from '../src/types'

function player(over: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    birthDate: '2000-01-01', positions: ['CM'], nationality: '', photo: '', clubs: [],
    managedBy: [], representationContract: { start: '', end: '' }, clubContract: { endDate: '' },
    contractHistory: [], clubInterests: [], matchReports: [], videoSessions: [], links: [], performance: [],
    info: { family: '', personality: '', phone: '' },
    ...over,
  } as Player
}

function match(over: Partial<ScoutingMatch> & Pick<ScoutingMatch, 'id' | 'homeTeam' | 'awayTeam'>): ScoutingMatch {
  return { date: '2026-09-05', createdAt: '', ...over }
}

function scout(matchId: string, s: string, over: Partial<ScoutingMatchScout> = {}): ScoutingMatchScout {
  return { id: `${matchId}-${s}`, matchId, scout: s, status: 'pendiente', createdAt: `2026-09-01T00:00:0${s.length}`, ...over }
}

const base = { scoutingPlayers: [] as ScoutingPlayer[], matchPlayers: [] as ScoutingMatchPlayer[], matchScouts: [] as ScoutingMatchScout[], players: [] as Player[] }

describe('rangos', () => {
  it('lunes-jueves → el viernes que viene; viernes-domingo → el fin de semana en curso', () => {
    expect(rangoFinDeSemana(new Date(2026, 8, 3))).toEqual({ desde: '2026-09-04', hasta: '2026-09-06' })  // jueves
    expect(rangoFinDeSemana(new Date(2026, 8, 6))).toEqual({ desde: '2026-09-04', hasta: '2026-09-06' })  // domingo
    expect(rangoFinDeSemana(new Date(2026, 8, 7))).toEqual({ desde: '2026-09-11', hasta: '2026-09-13' })  // lunes
    expect(rangoFinDeSemana(new Date(2026, 8, 3), 1)).toEqual({ desde: '2026-09-11', hasta: '2026-09-13' })
  })

  it('rangoSemana va de martes a lunes de la semana siguiente', () => {
    expect(rangoSemana(new Date(2026, 8, 3))).toEqual({ desde: '2026-09-01', hasta: '2026-09-07' })   // jueves
    expect(rangoSemana(new Date(2026, 8, 1))).toEqual({ desde: '2026-09-01', hasta: '2026-09-07' })   // martes
    expect(rangoSemana(new Date(2026, 8, 7))).toEqual({ desde: '2026-09-01', hasta: '2026-09-07' })   // lunes → semana que termina
    expect(rangoSemana(new Date(2026, 8, 8))).toEqual({ desde: '2026-09-08', hasta: '2026-09-14' })   // martes siguiente
    expect(rangoSemana(new Date(2026, 8, 3), -1)).toEqual({ desde: '2026-08-25', hasta: '2026-08-31' })
  })

  it('título del rango', () => {
    expect(tituloRango({ desde: '2026-09-04', hasta: '2026-09-06' })).toBe('4-6 septiembre')
    expect(tituloRango({ desde: '2026-09-28', hasta: '2026-10-04' })).toBe('28 septiembre - 4 octubre')
  })
})

describe('construirPlanificacion', () => {
  it('filtra por rango y ordena por fecha + hora (sin hora al final)', () => {
    const filas = construirPlanificacion({
      ...base, desde: '2026-09-04', hasta: '2026-09-06',
      scoutingMatches: [
        match({ id: 'a', homeTeam: 'A', awayTeam: 'B', date: '2026-09-06', time: '11:00' }),
        match({ id: 'b', homeTeam: 'C', awayTeam: 'D', date: '2026-09-05' }),
        match({ id: 'c', homeTeam: 'E', awayTeam: 'F', date: '2026-09-05', time: '09:00' }),
        match({ id: 'x', homeTeam: 'G', awayTeam: 'H', date: '2026-09-07' }),
      ],
    })
    expect(filas.map(f => f.matchId)).toEqual(['c', 'b', 'a'])
    expect(filas[0].diaLabel).toBe('Sábado')
    expect(filas[2].diaLabel).toBe('Domingo')
    expect(filas[0].partido).toBe('E - F')
  })

  it('jugadores nuestros por club (cualquier categoría), sin los ocultos; si no hay, «Captación»', () => {
    const players = [
      player({ id: 'p1', name: 'Fode Minite', clubs: [{ name: 'Villarreal Juvenil A', type: 'principal' }] }),
      player({ id: 'p2', name: 'Carlos Maciá', clubs: [{ name: 'Villarreal CF', type: 'principal' }] }),
      player({ id: 'p3', name: 'Oculto', clubs: [{ name: 'Murcia', type: 'principal' }], hiddenFromManagement: true }),
      player({ id: 'p4', name: 'Otro', clubs: [{ name: 'Real Sociedad', type: 'cedido_en' }] }),
    ]
    const filas = construirPlanificacion({
      ...base, players, desde: '2026-09-05', hasta: '2026-09-05',
      scoutingMatches: [
        match({ id: 'm1', homeTeam: 'Villarreal Juv A', awayTeam: 'Murcia Juv A' }),
        match({ id: 'm2', homeTeam: 'Castilla', awayTeam: 'Torremolinos' }),
      ],
    })
    const m1 = filas.find(f => f.matchId === 'm1')!, m2 = filas.find(f => f.matchId === 'm2')!
    expect(m1.nuestros.map(p => p.name)).toEqual(['Carlos Maciá', 'Fode Minite'])
    expect(m1.jugadorTexto).toBe('Carlos Maciá, Fode Minite')
    expect(m2.nuestros).toEqual([])
    expect(m2.jugadorTexto).toBe('Captación')
  })

  it('jugadores de captación vinculados por matchPlayers', () => {
    const filas = construirPlanificacion({
      ...base, desde: '2026-09-05', hasta: '2026-09-05',
      scoutingMatches: [match({ id: 'm1', homeTeam: 'A', awayTeam: 'B' })],
      scoutingPlayers: [{ id: 's1', fullName: 'Chaval', createdAt: '' }],
      matchPlayers: [{ id: 'mp', matchId: 'm1', playerId: 's1', createdAt: '' }, { id: 'mp2', matchId: 'm1', playerId: 'borrado', createdAt: '' }],
    })
    expect(filas[0].captacion.map(p => p.fullName)).toEqual(['Chaval'])
  })

  it('personas y vía desde los scouts del partido; «tv / campo» si cada uno lo ve distinto', () => {
    const filas = construirPlanificacion({
      ...base, desde: '2026-09-05', hasta: '2026-09-05',
      scoutingMatches: [match({ id: 'm1', homeTeam: 'A', awayTeam: 'B', viewMode: 'video', assignedTo: 'NB' })],
      matchScouts: [scout('m1', 'NB', { viewMode: 'video' }), scout('m1', 'LT', { viewMode: 'campo' }), scout('m1', 'PP')],
    })
    expect(filas[0].personas).toEqual(['NB', 'LT', 'PP'])
    expect(filas[0].via).toBe('tv / campo')
    expect(filas[0].scouts.map(s => s.via)).toEqual(['tv', 'campo', 'tv'])
    expect(filas[0].scouts.every(s => s.real)).toBe(true)
  })

  it('sin filas de scouts: assignedTo troceado por «/» y vía del partido', () => {
    const filas = construirPlanificacion({
      ...base, desde: '2026-09-05', hasta: '2026-09-05',
      scoutingMatches: [
        match({ id: 'm1', homeTeam: 'A', awayTeam: 'B', assignedTo: 'AB / AT /PP', viewMode: 'campo', status: 'visto' }),
        match({ id: 'm2', homeTeam: 'C', awayTeam: 'D' }),
      ],
    })
    expect(filas[0].personas).toEqual(['AB', 'AT', 'PP'])
    expect(filas[0].via).toBe('campo')
    expect(filas[0].status).toBe('visto')
    expect(filas[0].scouts[0].real).toBe(false)
    expect(filas[1].personas).toEqual([])
    expect(filas[1].via).toBe('')
  })

  it('CSV y HTML', () => {
    const filas = construirPlanificacion({
      ...base, desde: '2026-09-05', hasta: '2026-09-05',
      scoutingMatches: [match({ id: 'm1', homeTeam: 'A <b>', awayTeam: 'B', time: '19:00', assignedTo: 'IK', viewMode: 'campo', notes: 'si va Idu' })],
    })
    expect(planificacionACsv(filas)).toEqual([['Sábado', '19:00', 'A <b> - B', 'Captación', 'IK', 'campo', 'pendiente', 'si va Idu']])
    const html = htmlPlanificacion(filas, 'Fin de semana 5-7 septiembre')
    expect(html).toContain('A &lt;b&gt; - B')
    expect(html).toContain('<h1>Fin de semana 5-7 septiembre</h1>')
    expect(html).toContain('window.print()')
  })
})
