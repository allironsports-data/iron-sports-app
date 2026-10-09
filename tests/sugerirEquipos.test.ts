import { describe, it, expect } from 'vitest'
import { sugerirEquipos, equipoExacto, type OpcionEquipo } from '../src/lib/sugerirEquipos'

const op = (nombre: string, categoria?: string, zona?: string): OpcionEquipo =>
  ({ nombre, clave: nombre.toLowerCase(), categoria, zona })

const OPCIONES: OpcionEquipo[] = [
  op('Villarreal', 'Primera', 'Comunidad Valenciana'),
  op('Villarreal B', 'Primera RFEF'),
  op('Villarreal Juv A', 'Juveniles'),
  op('Villarreal Juv B', 'Juveniles'),
  op('Real Madrid Juv A', 'Juveniles', 'Madrid'),
  op('Castellón', 'Segunda'),
].map(o => ({ ...o, clave: normClave(o.nombre) }))

// La clave real la pone normEquipo; aquí basta con que sea estable y sin acentos
function normClave(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(juvenil|juv)\b/g, 'juv').replace(/\s+/g, ' ').trim()
}

describe('sugerirEquipos', () => {
  it('sin texto devuelve las primeras opciones', () => {
    expect(sugerirEquipos(OPCIONES, '', 3).map(o => o.nombre)).toEqual(['Villarreal', 'Villarreal B', 'Villarreal Juv A'])
  })
  it('todas las palabras escritas tienen que estar en el nombre, sin acentos ni mayúsculas', () => {
    expect(sugerirEquipos(OPCIONES, 'vill juv').map(o => o.nombre)).toEqual(['Villarreal Juv A', 'Villarreal Juv B'])
    expect(sugerirEquipos(OPCIONES, 'castellon').map(o => o.nombre)).toEqual(['Castellón'])
  })
  it('cada palabra escrita es principio de una palabra del nombre: «juv a» no trae «Juv B»', () => {
    expect(sugerirEquipos(OPCIONES, 'juv a').map(o => o.nombre)).toEqual(['Real Madrid Juv A', 'Villarreal Juv A'])
    expect(sugerirEquipos(OPCIONES, 'madrid').map(o => o.nombre)).toEqual(['Real Madrid Juv A'])
  })
  it('primero las que empiezan por lo escrito, luego las que lo contienen', () => {
    expect(sugerirEquipos([op('Atlético Villarreal'), ...OPCIONES], 'villarreal j').map(o => o.nombre))
      .toEqual(['Villarreal Juv A', 'Villarreal Juv B'])
    expect(sugerirEquipos([op('Atlético Villarreal'), ...OPCIONES], 'villa').map(o => o.nombre))
      .toEqual(['Villarreal', 'Villarreal B', 'Villarreal Juv A', 'Villarreal Juv B', 'Atlético Villarreal'])
  })
  it('respeta el máximo', () => {
    expect(sugerirEquipos(OPCIONES, 'villarreal', 2)).toHaveLength(2)
  })
  it('sin coincidencias, lista vacía (es cuando se ofrece crear uno nuevo)', () => {
    expect(sugerirEquipos(OPCIONES, 'Sporting Gijón')).toEqual([])
  })
})

describe('equipoExacto', () => {
  it('encuentra el equipo escrito con otra grafía equivalente', () => {
    expect(equipoExacto(OPCIONES, 'villarreal juvenil a')?.nombre).toBe('Villarreal Juv A')
    expect(equipoExacto(OPCIONES, 'Castellon')?.nombre).toBe('Castellón')
  })
  it('un prefijo no es exacto: «Villarreal Juv» no es ninguno', () => {
    expect(equipoExacto(OPCIONES, 'Villarreal Juv')).toBeUndefined()
    expect(equipoExacto(OPCIONES, '')).toBeUndefined()
  })
})
