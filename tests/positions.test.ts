import { describe, it, expect } from 'vitest'
import { normalizePosition, needMatchesPlayer, needFamily, normalizePositions } from '../src/lib/positions'

describe('posiciones de agencia', () => {
  it('entiende castellano, inglés y abreviaturas', () => {
    expect(normalizePosition('Portero')).toBe('GK')
    expect(normalizePosition('goalkeeper')).toBe('GK')
    expect(normalizePosition('gk')).toBe('GK')
    expect(normalizePosition('Lateral izquierdo')).toBe('LB')
    expect(normalizePosition('Mediapunta')).toBe('AM')
    expect(normalizePosition('no existe')).toBeNull()
  })

  it('una petición de central acepta los tres centrales', () => {
    expect(needMatchesPlayer('CB', ['LCB'])).toBe(true)
    expect(needMatchesPlayer('CB', ['RCB'])).toBe(true)
    expect(needMatchesPlayer('Central', ['Central derecho'])).toBe(true)
    expect(needMatchesPlayer('CB', ['GK'])).toBe(false)
  })

  it('needFamily da lo mismo que el camino largo', () => {
    const fam = needFamily('CB')!
    const codes = normalizePositions(['Central izquierdo'])
    expect(codes.some(c => fam.includes(c))).toBe(needMatchesPlayer('CB', ['Central izquierdo']))
  })

  it('una petición que no se entiende cae al parecido por texto', () => {
    expect(needFamily('lo que sea')).toBeNull()
    expect(needMatchesPlayer('carrilero', ['Carrilero derecho'])).toBe(true)
  })
})
