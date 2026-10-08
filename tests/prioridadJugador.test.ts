import { describe, it, expect } from 'vitest'
import { jugadorEsDePrioridad, pesoPrioridad, esPrioridad, SIN_PRIORIDAD } from '../src/lib/prioridadJugador'

describe('prioridad de jugador', () => {
  it('filtro vacío deja pasar a todos; «sin» coge a los que no tienen', () => {
    expect(jugadorEsDePrioridad(undefined, [])).toBe(true)
    expect(jugadorEsDePrioridad('A', ['A', 'B'])).toBe(true)
    expect(jugadorEsDePrioridad('C', ['A', 'B'])).toBe(false)
    expect(jugadorEsDePrioridad(undefined, ['A'])).toBe(false)
    expect(jugadorEsDePrioridad(undefined, [SIN_PRIORIDAD])).toBe(true)
  })
  it('orden A → B → C → sin', () => {
    expect([undefined, 'C', 'A', 'B'].map(p => pesoPrioridad(p as never))).toEqual([3, 2, 0, 1])
  })
  it('esPrioridad valida el valor', () => {
    expect(esPrioridad('B')).toBe(true)
    expect(esPrioridad('D')).toBe(false)
    expect(esPrioridad(undefined)).toBe(false)
  })
})
