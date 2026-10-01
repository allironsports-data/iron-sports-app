import { describe, it, expect } from 'vitest'
import { ciudadDe, zonaDeCiudad, diasDeViaje, sugerenciasDeViaje } from '../src/lib/viajes'
import type { FirmasEntry } from '../src/types'

const HOY = '2026-10-01'
const firma = (o: Partial<FirmasEntry> & { id: string }): FirmasEntry => ({
  playerName: o.id, zone: 'x', status: 'templado', managers: [], comments: [], sortPos: 0,
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-25T10:00:00Z', ...o,
})

describe('viajes', () => {
  it('ciudadDe: el equipo se reduce a su club y de ahí a la ciudad', () => {
    expect(ciudadDe('Betis Juv A')).toBe('Sevilla')
    expect(ciudadDe('Sevilla Cad B')).toBe('Sevilla')
    expect(ciudadDe('Real Madrid Castilla')).toBe('Madrid')
    expect(ciudadDe('Un club cualquiera')).toBeUndefined()
  })

  it('zonaDeCiudad', () => {
    expect(zonaDeCiudad('sevilla')).toBe('Resto de Andalucía')
    expect(zonaDeCiudad('Madrid')).toBe('Madrid')
    expect(zonaDeCiudad('Villanueva')).toBeUndefined()
  })

  it('diasDeViaje: ambos incluidos, cruzando de mes; sin fin es un día', () => {
    expect(diasDeViaje('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(diasDeViaje('2026-10-01')).toEqual(['2026-10-01'])
    expect(diasDeViaje('2026-10-01', '2026-09-01')).toEqual(['2026-10-01'])
  })

  it('sugerencias: los de la ciudad, luego el resto de la zona; calientes y desatendidos primero; sin firmados', () => {
    const equipos: Record<string, string> = { s1: 'Betis Juv A', s2: 'Sevilla Juv B', s3: 'Malaga Juv A', s4: 'Real Madrid Juv A', s5: 'Betis Cad A' }
    const r = sugerenciasDeViaje({
      ciudad: 'Sevilla', hoy: HOY, equipoDe: id => equipos[id],
      entries: [
        firma({ id: 'templado-reciente', scoutingPlayerId: 's1' }),
        firma({ id: 'caliente', scoutingPlayerId: 's2', status: 'caliente' }),
        firma({ id: 'templado-olvidado', scoutingPlayerId: 's5', createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z' }),
        firma({ id: 'malaga', scoutingPlayerId: 's3' }),
        firma({ id: 'madrid', scoutingPlayerId: 's4' }),
        firma({ id: 'firmado', scoutingPlayerId: 's1', status: 'firmado' }),
        firma({ id: 'sin-equipo' }),
        firma({ id: 'por-club-conocido', knownTeam: 'Cadiz Juv A' }),
      ],
    })
    expect(r.enCiudad.map(s => s.entry.id)).toEqual(['caliente', 'templado-olvidado', 'templado-reciente'])
    expect(r.enZona.map(s => s.entry.id)).toEqual(['malaga', 'por-club-conocido'])
    expect(r.zona).toBe('Resto de Andalucía')
    expect(r.enCiudad[1].diasSinTocar).toBe(61)
  })

  it('ciudad desconocida con zona elegida a mano: todo va a «en la zona»', () => {
    const r = sugerenciasDeViaje({
      ciudad: 'Lucena', zona: 'Resto de Andalucía', hoy: HOY, equipoDe: () => 'Betis Juv A',
      entries: [firma({ id: 'a', scoutingPlayerId: 's1' })],
    })
    expect(r.enCiudad).toEqual([])
    expect(r.enZona.map(s => s.entry.id)).toEqual(['a'])
  })
})
