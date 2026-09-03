import { describe, it, expect } from 'vitest'
import { dedupePorId } from '../src/lib/coleccion'

describe('dedupePorId', () => {
  it('sin duplicados devuelve el mismo array (sin copiar)', () => {
    const filas = [{ id: 'a' }, { id: 'b' }]
    expect(dedupePorId(filas)).toBe(filas)
  })

  it('quita la repetida y conserva la posición de la primera aparición', () => {
    const filas = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'a', v: 2 }, { id: 'c', v: 1 }]
    expect(dedupePorId(filas).map(f => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('se queda con los datos de la última copia (la de la página posterior)', () => {
    const filas = [{ id: 'a', v: 1 }, { id: 'a', v: 2 }]
    expect(dedupePorId(filas)).toEqual([{ id: 'a', v: 2 }])
  })

  it('filas sin id se dejan tal cual', () => {
    const filas = [{ id: undefined, v: 1 }, { id: undefined, v: 2 }, { id: 'x', v: 3 }]
    expect(dedupePorId(filas)).toHaveLength(3)
  })

  it('listas vacías o de un elemento', () => {
    expect(dedupePorId([])).toEqual([])
    const uno = [{ id: 1 }]
    expect(dedupePorId(uno)).toBe(uno)
  })
})
