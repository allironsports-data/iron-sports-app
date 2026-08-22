import { describe, it, expect } from 'vitest'
import { parsearAlineacion, emparejar } from '../src/lib/lineup'
import { teamsAlike } from '../src/lib/equipos'
import type { ScoutingPlayer } from '../src/types'

const jug = (id: string, fullName: string, team?: string) =>
  ({ id, fullName, team } as ScoutingPlayer)

describe('pegar alineación', () => {
  it('saca los nombres y se salta las cabeceras', () => {
    const texto = [
      'Alineación',
      'Once inicial',
      'Iker Fernández',
      'Marc Puig',
      'Suplentes',
      'Adrián Soler',
    ].join('\n')
    expect(parsearAlineacion(texto)).toEqual(['Iker Fernández', 'Marc Puig', 'Adrián Soler'])
  })

  it('no repite un nombre que aparece dos veces', () => {
    expect(parsearAlineacion('Iker Fernández\nIker Fernández')).toEqual(['Iker Fernández'])
  })

  it('el entrenador va justo después de «Entrenador» y no es un jugador', () => {
    expect(parsearAlineacion('Marc Puig\nEntrenador\nPep Ferrer')).toEqual(['Marc Puig'])
  })

  it('los nombres de los equipos del partido no se cuelan como fichas nuevas', () => {
    const out = parsearAlineacion('Villarreal\nMarc Puig', [], ['Villarreal Juv A', 'Levante Juv A'])
    expect(out).toEqual(['Marc Puig'])
  })
})

describe('emparejar con la base de datos', () => {
  const plantilla = [
    jug('1', 'Iker Fernández', 'Valencia Juv A'),
    jug('2', 'Marc Puig', 'Levante Juv A'),
    jug('3', 'Iker Fernández', 'Levante Juv A'),
  ]

  it('un nombre único es exacto', () => {
    const r = emparejar('Marc Puig', plantilla, undefined, teamsAlike)
    expect(r.certeza).toBe('exacto')
    expect(r.player?.id).toBe('2')
  })

  it('con dos que se llaman igual, manda el equipo del partido', () => {
    const r = emparejar('Iker Fernández', plantilla, 'Valencia Juv A', teamsAlike)
    expect(r.certeza).toBe('exacto')
    expect(r.player?.id).toBe('1')
  })

  it('sin equipo que desempate, se marca ambiguo en vez de elegir al azar', () => {
    const r = emparejar('Iker Fernández', plantilla, undefined, teamsAlike)
    expect(r.certeza).toBe('ambiguo')
    expect(r.player).toBeNull()
  })

  it('alguien que no está se marca como nuevo', () => {
    const r = emparejar('Pablo Ruiz', plantilla, 'Valencia Juv A', teamsAlike)
    expect(r.certeza).toBe('nuevo')
    expect(r.player).toBeNull()
  })

  it('los acentos no impiden encontrarlo', () => {
    const r = emparejar('Iker Fernandez', [jug('1', 'Iker Fernández', 'Valencia Juv A')], undefined, teamsAlike)
    expect(r.player?.id).toBe('1')
  })
})
