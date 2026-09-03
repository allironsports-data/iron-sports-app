import { describe, it, expect } from 'vitest'
import { teamsAlike, teamMatchKind, normTeamTokens, categoriaDe, equipoMatchKind, mismoEquipo } from '../src/lib/equipos'

describe('comparar equipos', () => {
  it('el fallo que soltaba avisos falsos: Real Madrid ≠ Real Sociedad', () => {
    expect(teamsAlike('Real Madrid', 'Real Sociedad')).toBe(false)
    expect(teamsAlike('Atlético Madrid', 'Atlético Baleares')).toBe(false)
  })

  it('la misma escritura de siempre, escrita de otra forma', () => {
    expect(teamMatchKind('Real Madrid Juv B', 'Real Madrid Juvenil B')).toBe('exacto')
    expect(teamMatchKind('Castellón Juv A', 'Castellon Juv a')).toBe('exacto')
    expect(teamMatchKind('C.D. Castellón', 'CD Castellon')).toBe('exacto')
  })

  it('el club y su filial se consideran el mismo club', () => {
    expect(teamMatchKind('Getafe', 'Getafe B')).toBe('exacto')
  })

  it('un nombre solo genérico es dudoso, no seguro', () => {
    expect(teamMatchKind('Atlético', 'Atlético Madrid')).toBe('parcial')
  })

  it('vacío no se parece a nada', () => {
    expect(teamsAlike('', 'Valencia')).toBe(false)
    expect(teamsAlike(undefined, undefined)).toBe(false)
  })

  it('las palabras de relleno no cuentan', () => {
    expect(normTeamTokens('C.F. Villarreal Juvenil A')).toEqual(['villarreal'])
  })

  it('mismo club pero distinta categoría NO es el mismo equipo', () => {
    expect(categoriaDe('Villarreal Juvenil A')).toBe('juv a')
    expect(categoriaDe('Getafe B')).toBe('b')
    expect(categoriaDe('C.D. Castellón')).toBe('')
    expect(equipoMatchKind('Villarreal Juv A', 'Villarreal Juvenil A')).toBe('equipo')
    expect(equipoMatchKind('Villarreal Juv B', 'Villarreal Juv A')).toBe('club')
    expect(equipoMatchKind('Villarreal', 'Villarreal B')).toBe('club')
    expect(mismoEquipo('Real Madrid Juv B', 'Real Madrid Juvenil B')).toBe(true)
    expect(mismoEquipo('Real Madrid', 'Real Sociedad')).toBe(false)
  })
})
