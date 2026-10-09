import { describe, it, expect } from 'vitest'
import { separarNacionalidades, unirNacionalidades, PAISES } from '../src/lib/paises'

describe('nacionalidades', () => {
  it('separa dobles nacionalidades escritas de cualquier forma', () => {
    expect(separarNacionalidades('España / Marruecos')).toEqual(['España', 'Marruecos'])
    expect(separarNacionalidades('Spain, Morocco')).toEqual(['Spain', 'Morocco'])
    expect(separarNacionalidades('Española/Costa de Marfil')).toEqual(['Española', 'Costa de Marfil'])
    expect(separarNacionalidades('Estados Unidos - España')).toEqual(['Estados Unidos', 'España'])
    expect(separarNacionalidades('Guinea-Bisáu')).toEqual(['Guinea-Bisáu'])
    expect(separarNacionalidades('')).toEqual([])
    expect(separarNacionalidades(undefined)).toEqual([])
  })
  it('une con « / » y descarta vacíos', () => {
    expect(unirNacionalidades(['España', 'Marruecos'])).toBe('España / Marruecos')
    expect(unirNacionalidades(['España', ''])).toBe('España')
    expect(unirNacionalidades([undefined, 'Marruecos'])).toBe('Marruecos')
  })
  it('la lista de países no tiene repetidos', () => {
    expect(new Set(PAISES).size).toBe(PAISES.length)
  })
})
