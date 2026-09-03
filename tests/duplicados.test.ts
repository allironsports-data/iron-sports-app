import { describe, it, expect } from 'vitest'
import { buscarJugadoresParecidos, buscarPartidosParecidos, levenshtein } from '../src/lib/duplicados'
import type { ScoutingPlayer, ScoutingMatch } from '../src/types'

const jug = (id: string, fullName: string, team?: string) => ({ id, fullName, team } as ScoutingPlayer)
const par = (id: string, homeTeam: string, awayTeam: string, date: string) => ({ id, homeTeam, awayTeam, date } as ScoutingMatch)

describe('levenshtein', () => {
  it('cuenta erratas', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('fernandez', 'fernandes')).toBe(1)
    expect(levenshtein('marc puig', 'marc puig')).toBe(0)
  })
})

describe('jugadores parecidos', () => {
  const bbdd = [
    jug('1', 'Iker Fernández', 'Valencia Juv A'),
    jug('2', 'Iker Fernández Gómez', 'Levante Juv A'),
    jug('3', 'Marc Puig', 'Levante Juv A'),
    jug('4', 'Adrián Soler Ruiz', 'Castellón'),
  ]

  it('mismo nombre sin acentos = exacto, y va el primero', () => {
    const r = buscarJugadoresParecidos('iker fernandez', undefined, bbdd)
    expect(r[0].player.id).toBe('1')
    expect(r[0].tipo).toBe('exacto')
  })

  it('el nombre nuevo contenido en uno existente (o al revés) es parecido', () => {
    const r = buscarJugadoresParecidos('Iker Fernández', undefined, bbdd)
    expect(r.map(x => x.player.id)).toEqual(['1', '2'])
    expect(r[1].tipo).toBe('parecido')
  })

  it('con dos parecidos, el del mismo equipo va antes', () => {
    const r = buscarJugadoresParecidos('Fernández', 'Levante', bbdd)
    expect(r[0].player.id).toBe('2')
    expect(r[0].mismoEquipo).toBe(true)
  })

  it('una errata en un nombre largo también salta', () => {
    const r = buscarJugadoresParecidos('Adrian Solar Ruiz', undefined, bbdd)
    expect(r.map(x => x.player.id)).toEqual(['4'])
  })

  it('en nombres cortos no se buscan erratas (demasiados falsos positivos)', () => {
    expect(buscarJugadoresParecidos('Mar Pug', undefined, bbdd)).toEqual([])
  })

  it('las palabras cortas («de», «el») no cuentan', () => {
    const r = buscarJugadoresParecidos('Marc de Puig', undefined, bbdd)
    expect(r.map(x => x.player.id)).toEqual(['3'])
  })

  it('respeta el máximo y devuelve nada con nombre vacío', () => {
    expect(buscarJugadoresParecidos('', undefined, bbdd)).toEqual([])
    expect(buscarJugadoresParecidos('Iker Fernández', undefined, bbdd, 1)).toHaveLength(1)
  })
})

describe('partidos parecidos', () => {
  const partidos = [
    par('a', 'Villarreal Juv A', 'Levante Juv A', '2026-09-05'),
    par('b', 'Levante Juv A', 'Villarreal Juv A', '2026-09-20'),
    par('c', 'Valencia Juv A', 'Levante Juv A', '2026-09-05'),
  ]

  it('mismos equipos en cualquier orden y fecha a ±3 días', () => {
    expect(buscarPartidosParecidos('Levante', 'Villarreal', '2026-09-07', partidos).map(m => m.id)).toEqual(['a'])
    expect(buscarPartidosParecidos('Villarreal', 'Levante', '2026-09-02', partidos).map(m => m.id)).toEqual(['a'])
  })

  it('fuera de la ventana de fechas no cuenta', () => {
    expect(buscarPartidosParecidos('Villarreal', 'Levante', '2026-09-12', partidos)).toEqual([])
  })

  it('sin equipos o sin fecha no hay candidatos', () => {
    expect(buscarPartidosParecidos('', 'Levante', '2026-09-05', partidos)).toEqual([])
    expect(buscarPartidosParecidos('Villarreal', 'Levante', '', partidos)).toEqual([])
  })
})
