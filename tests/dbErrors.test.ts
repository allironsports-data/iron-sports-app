import { describe, it, expect, vi, beforeEach } from 'vitest'

// supabase.ts necesita variables de entorno y fetch: se sustituye por un stub
vi.mock('../src/lib/supabase', () => ({ supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) } }))

import { permitirEnvio, _resetThrottle, registrarError } from '../src/lib/dbErrors'

describe('dbErrors · throttle', () => {
  beforeEach(() => _resetThrottle())

  it('no repite el mismo mensaje en 1 minuto', () => {
    expect(permitirEnvio('x', 0)).toBe(true)
    expect(permitirEnvio('x', 30_000)).toBe(false)
    expect(permitirEnvio('x', 61_000)).toBe(true)
  })

  it('máximo 5 por minuto', () => {
    for (let i = 0; i < 5; i++) expect(permitirEnvio(`m${i}`, 0)).toBe(true)
    expect(permitirEnvio('m5', 1000)).toBe(false)
    expect(permitirEnvio('m5', 61_000)).toBe(true)
  })

  it('registrarError nunca lanza', () => {
    expect(() => registrarError(new Error('boom'))).not.toThrow()
    expect(() => registrarError({ circular: undefined })).not.toThrow()
    expect(() => registrarError(undefined)).not.toThrow()
  })
})
