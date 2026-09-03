import { describe, it, expect, vi } from 'vitest'

// El componente importa dbAudit → supabase (necesita env): stub
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
import { fechaRelativa, valorCorto } from '../src/lib/formato'

describe('HistorialCambios · formato', () => {
  it('fecha relativa', () => {
    const ahora = Date.parse('2026-09-03T12:00:00Z')
    expect(fechaRelativa('2026-09-03T11:59:50Z', ahora)).toBe('ahora mismo')
    expect(fechaRelativa('2026-09-03T11:30:00Z', ahora)).toBe('hace 30 min')
    expect(fechaRelativa('2026-09-03T09:00:00Z', ahora)).toBe('hace 3 h')
    expect(fechaRelativa('2026-09-02T12:00:00Z', ahora)).toBe('ayer')
    expect(fechaRelativa('2026-08-31T12:00:00Z', ahora)).toBe('hace 3 días')
    expect(fechaRelativa('basura', ahora)).toBe('—')
  })
  it('valor corto', () => {
    expect(valorCorto(null)).toBe('∅')
    expect(valorCorto('')).toBe('∅')
    expect(valorCorto(true)).toBe('true')
    expect(valorCorto(['a', 'b'])).toBe('a, b')
    expect(valorCorto('x'.repeat(100)).length).toBe(60)
  })
})
