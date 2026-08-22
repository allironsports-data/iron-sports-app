import { describe, it, expect } from 'vitest'
import { zonaDe, clubBase, normEquipo, esZona, ZONAS } from '../src/lib/zonas'

describe('zonas', () => {
  it('recorta el filial y la categoría para llegar al club', () => {
    expect(clubBase('Villarreal Juv C')).toBe(clubBase('Villarreal'))
    expect(clubBase('Castellón B')).toBe(clubBase('Castellón'))
  })

  it('la zona sale del club, no del equipo concreto', () => {
    expect(zonaDe('Valencia Juv A')).toBe('Comunidad Valenciana')
    expect(zonaDe('Valencia')).toBe('Comunidad Valenciana')
    expect(zonaDe('Real Madrid Cad B')).toBe('Madrid')
  })

  it('sin acentos también', () => {
    expect(zonaDe('Castellon Juv A')).toBe(zonaDe('Castellón Juv A'))
  })

  it('las correcciones a mano mandan sobre la tabla', () => {
    const base = clubBase('Valencia Juv A')
    expect(zonaDe('Valencia Juv A', { [base]: 'Madrid' })).toBe('Madrid')
  })

  it('un club desconocido no revienta, se queda sin zona', () => {
    expect(zonaDe('Club Inventado FC')).toBeNull()
    expect(zonaDe('')).toBeNull()
    expect(zonaDe(undefined)).toBeNull()
  })

  it('normEquipo conserva la categoría (no es lo mismo el Juv A que el Cad A)', () => {
    expect(normEquipo('Castellón Juvenil A')).toBe(normEquipo('Castellon Juv A'))
    expect(normEquipo('Castellón Juv A')).not.toBe(normEquipo('Castellón Cad A'))
  })

  it('esZona filtra lo que venga raro de la base de datos', () => {
    expect(esZona('Madrid')).toBe(true)
    expect(esZona('Valencia')).toBe(false)   // ésa es del vocabulario viejo del pipeline
    expect(esZona(null)).toBe(false)
    ZONAS.forEach(z => expect(esZona(z)).toBe(true))
  })
})
