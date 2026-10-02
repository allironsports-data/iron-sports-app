import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

import { aplicarOrden, recolocar } from '../src/lib/ordenManual'

const ids = (xs: { id: string }[]) => xs.map(x => x.id).join('')
const items = (s: string) => s.split('').map(id => ({ id }))

describe('recolocar', () => {
  it('bajando queda debajo del destino', () => {
    expect(recolocar(['a', 'b', 'c', 'd'], 'a', 'c')?.join('')).toBe('bcad')
  })
  it('subiendo queda encima del destino', () => {
    expect(recolocar(['a', 'b', 'c', 'd'], 'd', 'b')?.join('')).toBe('adbc')
  })
  it('sobre sí mismo o con ids de otro bloque no cambia nada', () => {
    expect(recolocar(['a', 'b'], 'a', 'a')).toBeNull()
    expect(recolocar(['a', 'b'], 'x', 'a')).toBeNull()
  })
})

describe('aplicarOrden', () => {
  it('sin posiciones devuelve la lista tal cual', () => {
    const l = items('abc')
    expect(aplicarOrden(l, {})).toBe(l)
  })
  it('ordena por posición y deja detrás, en su orden, las que no tienen', () => {
    expect(ids(aplicarOrden(items('abcd'), { c: 1, a: 2 }))).toBe('cabd')
  })
})
