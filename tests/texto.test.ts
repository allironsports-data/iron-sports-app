import { describe, it, expect } from 'vitest'
import { sinAcentos, norm, normClave } from '../src/lib/texto'

describe('texto', () => {
  it('quita acentos sin tocar mayúsculas ni espacios', () => {
    expect(sinAcentos('Castellón')).toBe('Castellon')
    expect(sinAcentos('  Peña  ')).toBe('  Pena  ')
  })

  it('norm: minúsculas y sin espacios de sobra', () => {
    expect(norm('  Castellón Juv A ')).toBe('castellon juv a')
    expect(norm(undefined)).toBe('')
  })

  it('la ñ se convierte en n (buscar «Pena» encuentra a «Peña»)', () => {
    expect(norm('Peña')).toBe(norm('Pena'))
  })

  it('normClave quita la puntuación y junta espacios', () => {
    expect(normClave('C.D. Castellón  -  Juv. A')).toBe('c d castellon juv a')
  })
})
