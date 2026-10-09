import { describe, it, expect } from 'vitest'
import { calcularStatsJugadores, ordenarGrupos, SIN_DATO } from '../src/lib/statsJugadores'
import type { ScoutingPlayer, ScoutingReport, FirmasEntry } from '../src/types'

const j = (o: Partial<ScoutingPlayer> & { id: string }): ScoutingPlayer => ({ fullName: o.id, createdAt: '', ...o })
const PLAYERS: ScoutingPlayer[] = [
  j({ id: 'a', agency: 'AS1', nationality: 'España', position1: 'Delantero', team: 'Villarreal Juv A', categoria: 'Juveniles', birthdate: '2008-01-01', assessment: 'Llamar', foot: 'Derecho' }),
  j({ id: 'b', agency: 'AS1', nationality: 'España / Marruecos', position1: 'Delantero', team: 'Villarreal Juv A', categoria: 'Juveniles', birthdate: '2008-05-05', assessment: 'Seguir' }),
  j({ id: 'c', agency: ' You First ', nationality: 'Marruecos', position1: 'Portero', team: 'Betis', birthdate: '2004-01-01' }),
  j({ id: 'd', nationality: '', team: 'Betis', assessment: 'Llamar' }),
]
const REPORTS: ScoutingReport[] = [
  { id: 'r1', playerId: 'a', createdAt: '2026-01-01' } as ScoutingReport,
  { id: 'r2', playerId: 'a', createdAt: '2026-01-02' } as ScoutingReport,
  { id: 'r3', playerId: 'c', createdAt: '2026-01-03' } as ScoutingReport,
]
const FIRMAS: FirmasEntry[] = [{ id: 'f1', scoutingPlayerId: 'b', status: 'caliente', managers: [], comments: [] } as unknown as FirmasEntry]

describe('calcularStatsJugadores', () => {
  const s = calcularStatsJugadores(PLAYERS, REPORTS, FIRMAS, {})
  it('resumen: cuántos tienen cada dato', () => {
    expect(s.total).toBe(4)
    expect(s.conAgencia).toBe(3)
    expect(s.conNacionalidad).toBe(3)
    expect(s.dobleNacionalidad).toBe(1)
    expect(s.conFechaNac).toBe(3)
    expect(s.enLlamar).toBe(2)
    expect(s.enPipeline).toBe(1)
    expect(s.nAgencias).toBe(2)
  })
  it('agencias: jugadores, Llamar, % Llamar, pipeline e informes; el nombre se recorta', () => {
    const as1 = s.agencias.find(g => g.nombre === 'AS1')!
    expect(as1).toMatchObject({ jugadores: 2, llamar: 1, seguir: 1, pctLlamar: 50, pipeline: 1, informes: 2 })
    expect(s.agencias.find(g => g.nombre === 'You First')).toBeTruthy()
    expect(s.agencias.at(-1)?.nombre).toBe(SIN_DATO)
  })
  it('nacionalidades: la doble cuenta en las dos', () => {
    expect(s.nacionalidades.find(g => g.nombre === 'España')?.jugadores).toBe(2)
    expect(s.nacionalidades.find(g => g.nombre === 'Marruecos')?.jugadores).toBe(2)
    expect(s.nacionalidades.find(g => g.nombre === SIN_DATO)?.jugadores).toBe(1)
  })
  it('zonas salen del club del equipo; quintas por año', () => {
    expect(s.zonas.find(g => g.nombre === 'Comunidad Valenciana')?.jugadores).toBe(2)
    expect(s.zonas.find(g => g.nombre === 'Resto de Andalucía')?.jugadores).toBe(2)
    expect(s.quintas.map(g => g.nombre)).toEqual(['2004', '2008', SIN_DATO])
  })
  it('ordenarGrupos: por columna, con mínimo y sin «Sin dato»', () => {
    expect(ordenarGrupos(s.agencias, 'llamar').map(g => g.nombre)).toEqual(['AS1', 'You First'])
    expect(ordenarGrupos(s.agencias, 'jugadores', 2).map(g => g.nombre)).toEqual(['AS1'])
  })
})
