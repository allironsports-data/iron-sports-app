import { describe, it, expect } from 'vitest'
import { teamsAlike, teamMatchKind, normTeamTokens, categoriaDe, equipoMatchKind, mismoEquipo, avisoEquipoPartido } from '../src/lib/equipos'

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

describe('avisoEquipoPartido — al añadir un jugador a un partido', () => {
  const LOCAL = 'Villarreal Juv A'
  const VISITANTE = 'Elche Juv A'

  it('no avisa si su equipo es uno de los dos que juegan', () => {
    expect(avisoEquipoPartido('Villarreal Juv A', LOCAL, VISITANTE)).toBeNull()
    expect(avisoEquipoPartido('Elche Juv A', LOCAL, VISITANTE)).toBeNull()
  })

  it('no avisa por escribirlo distinto: «Villarreal Juvenil A» es el mismo equipo', () => {
    expect(avisoEquipoPartido('Villarreal Juvenil A', LOCAL, VISITANTE)).toBeNull()
    expect(avisoEquipoPartido('C.F. Villarreal Juvenil A', LOCAL, VISITANTE)).toBeNull()
  })

  it('avisa del filial y sugiere el equipo del mismo club: Juv B → Juv A', () => {
    expect(avisoEquipoPartido('Villarreal Juv B', LOCAL, VISITANTE)).toEqual({ sugerido: LOCAL })
    expect(avisoEquipoPartido('Elche Juv B', LOCAL, VISITANTE)).toEqual({ sugerido: VISITANTE })
  })

  it('avisa sin sugerir nada si es de un club que no juega este partido', () => {
    expect(avisoEquipoPartido('Real Madrid', LOCAL, VISITANTE)).toEqual({ sugerido: null })
    expect(avisoEquipoPartido('Valencia Juv A', LOCAL, VISITANTE)).toEqual({ sugerido: null })
  })

  it('avisa también si no tiene equipo en la ficha', () => {
    expect(avisoEquipoPartido(undefined, LOCAL, VISITANTE)).toEqual({ sugerido: null })
    expect(avisoEquipoPartido('', LOCAL, VISITANTE)).toEqual({ sugerido: null })
  })

  it('«Real Madrid» no se confunde con «Real Sociedad» al sugerir', () => {
    expect(avisoEquipoPartido('Real Madrid Juv A', 'Real Sociedad Juv A', 'Elche Juv A'))
      .toEqual({ sugerido: null })
  })
})
