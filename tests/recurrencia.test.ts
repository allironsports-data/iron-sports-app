import { describe, it, expect } from 'vitest'
import { siguienteFecha } from '../src/lib/recurrencia'

const HOY = '2026-10-01'

describe('siguienteFecha', () => {
  it('semanal: una semana después de la fecha que tenía', () => {
    expect(siguienteFecha('2026-10-02', 'semanal', HOY)).toBe('2026-10-09')
    expect(siguienteFecha('2026-09-28', 'semanal', HOY)).toBe('2026-10-05')
  })
  it('completada con mucho retraso: salta hasta no quedar en el pasado', () => {
    expect(siguienteFecha('2026-09-03', 'semanal', HOY)).toBe('2026-10-01')
    expect(siguienteFecha('2026-06-15', 'mensual', HOY)).toBe('2026-10-15')
  })
  it('sin fecha: cuenta desde hoy', () => {
    expect(siguienteFecha(undefined, 'semanal', HOY)).toBe('2026-10-08')
    expect(siguienteFecha(undefined, 'mensual', HOY)).toBe('2026-11-01')
  })
  it('mensual: fin de mes y cambio de año', () => {
    expect(siguienteFecha('2027-01-31', 'mensual', HOY)).toBe('2027-02-28')
    expect(siguienteFecha('2026-12-15', 'mensual', HOY)).toBe('2027-01-15')
  })
})
