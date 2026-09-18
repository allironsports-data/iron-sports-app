import { describe, it, expect } from 'vitest'
import {
  estadoDe, jugadorEsDeEstado, contarPorEstado, ESTADO_TODOS, ESTADO_META,
} from '../src/lib/estadoJugador'
import { PLAYER_ESTADOS } from '../src/types'

describe('estadoDe', () => {
  it('devuelve el estado guardado', () => {
    expect(estadoDe({ estado: 'activo' })).toBe('activo')
    expect(estadoDe({ estado: 'inactivo' })).toBe('inactivo')
    expect(estadoDe({ estado: 'partner' })).toBe('partner')
  })

  it('sin estado (fila anterior a la migración) es activo', () => {
    expect(estadoDe({})).toBe('activo')
    expect(estadoDe({ estado: undefined })).toBe('activo')
    expect(estadoDe({ estado: null })).toBe('activo')
    expect(estadoDe({ estado: '' })).toBe('activo')
  })

  it('un valor desconocido no hace desaparecer al jugador: es activo', () => {
    expect(estadoDe({ estado: 'baja' })).toBe('activo')
    expect(estadoDe({ estado: 'ACTIVO ' })).toBe('activo')
    expect(estadoDe({ estado: 'Partner' })).toBe('partner')
  })
})

describe('jugadorEsDeEstado', () => {
  it('«todos» acepta cualquiera', () => {
    for (const e of PLAYER_ESTADOS) expect(jugadorEsDeEstado({ estado: e }, ESTADO_TODOS)).toBe(true)
    expect(jugadorEsDeEstado({}, ESTADO_TODOS)).toBe(true)
  })

  it('filtra por estado', () => {
    expect(jugadorEsDeEstado({ estado: 'partner' }, 'partner')).toBe(true)
    expect(jugadorEsDeEstado({ estado: 'partner' }, 'activo')).toBe(false)
  })

  it('los jugadores sin migrar salen con el filtro por defecto (activo)', () => {
    expect(jugadorEsDeEstado({}, 'activo')).toBe(true)
    expect(jugadorEsDeEstado({}, 'inactivo')).toBe(false)
  })
})

describe('contarPorEstado', () => {
  it('cuenta los tres', () => {
    const n = contarPorEstado([
      { estado: 'activo' }, { estado: 'activo' }, {},
      { estado: 'inactivo' },
      { estado: 'partner' }, { estado: 'partner' }, { estado: 'partner' },
    ])
    expect(n).toEqual({ activo: 3, inactivo: 1, partner: 3 })
  })

  it('lista vacía da tres ceros, no un objeto vacío', () => {
    expect(contarPorEstado([])).toEqual({ activo: 0, inactivo: 0, partner: 0 })
  })

  it('el total siempre cuadra', () => {
    const jugadores = [{}, { estado: 'x' }, { estado: 'inactivo' }, { estado: 'partner' }]
    const n = contarPorEstado(jugadores)
    expect(n.activo + n.inactivo + n.partner).toBe(jugadores.length)
  })
})

describe('ESTADO_META', () => {
  it('tiene una entrada por estado', () => {
    for (const e of PLAYER_ESTADOS) {
      expect(ESTADO_META[e]).toBeDefined()
      expect(ESTADO_META[e].label).toBeTruthy()
    }
  })
})
