import { describe, it, expect } from 'vitest'
import { fechaLocal, parseDia, sumarDias, lunesDe, esVencida, diasHasta } from '../src/lib/fechas'

describe('fechas', () => {
  it('fechaLocal usa el día local, no el UTC', () => {
    // 00:30 local del 2 de septiembre: en UTC+2 el ISO diría 1 de septiembre
    const d = new Date(2026, 8, 2, 0, 30)
    expect(fechaLocal(d)).toBe('2026-09-02')
  })

  it('parseDia ancla a mediodía y no cambia de día', () => {
    const d = parseDia('2026-09-02')
    expect(d.getDate()).toBe(2)
    expect(d.getHours()).toBe(12)
    // un ISO completo se respeta tal cual
    expect(parseDia('2026-09-02T08:15:00Z').toISOString()).toBe('2026-09-02T08:15:00.000Z')
  })

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('lunesDe devuelve el lunes de la semana y respeta el cambio de hora', () => {
    expect(fechaLocal(lunesDe(new Date(2026, 8, 2)))).toBe('2026-08-31') // miércoles → lunes
    expect(fechaLocal(lunesDe(new Date(2026, 8, 6)))).toBe('2026-08-31') // domingo → mismo lunes
    // 4 semanas atrás desde un lunes de abril cruza el cambio a horario de verano
    expect(fechaLocal(lunesDe(new Date(2026, 3, 13), -4))).toBe('2026-03-16')
    expect(lunesDe(new Date(2026, 3, 13), -4).getHours()).toBe(0)
  })

  it('esVencida: vencer hoy no es estar vencida', () => {
    expect(esVencida('2026-09-01', '2026-09-02')).toBe(true)
    expect(esVencida('2026-09-02', '2026-09-02')).toBe(false)
    expect(esVencida(undefined, '2026-09-02')).toBe(false)
    expect(esVencida('2026-09-01T23:00:00', '2026-09-02')).toBe(true)
  })

  it('diasHasta cuenta días naturales', () => {
    const hoy = new Date(2026, 8, 2, 23, 59)
    expect(diasHasta('2026-09-03', hoy)).toBe(1)
    expect(diasHasta('2026-09-02', hoy)).toBe(0)
    expect(diasHasta('2026-08-31', hoy)).toBe(-2)
  })
})
