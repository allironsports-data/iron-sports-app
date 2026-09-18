import { describe, it, expect } from 'vitest'
import { construirHash, parsearHash, SECCIONES, NOMBRE_SECCION } from '../src/lib/rutas'

describe('construirHash', () => {
  it('sección sola', () => {
    expect(construirHash({ tipo: 'seccion', seccion: 'tareas' })).toBe('#/tareas')
  })
  it('sección con pestaña', () => {
    expect(construirHash({ tipo: 'seccion', seccion: 'captacion', tab: 'partidos' })).toBe('#/captacion/partidos')
    expect(construirHash({ tipo: 'seccion', seccion: 'pipeline', tab: 'avisos' })).toBe('#/pipeline/avisos')
  })
  it('una pestaña con caracteres raros no entra en el hash', () => {
    expect(construirHash({ tipo: 'seccion', seccion: 'tareas', tab: 'a/b' })).toBe('#/tareas')
    expect(construirHash({ tipo: 'seccion', seccion: 'tareas', tab: '' })).toBe('#/tareas')
  })
  it('fichas', () => {
    expect(construirHash({ tipo: 'jugador', id: 'p1' })).toBe('#/jugador/p1')
    expect(construirHash({ tipo: 'club', id: 'c1' })).toBe('#/club/c1')
    expect(construirHash({ tipo: 'miembro', id: 'u1' })).toBe('#/miembro/u1')
    expect(construirHash({ tipo: 'contactos' })).toBe('#contactos')
  })
})

describe('parsearHash', () => {
  it('vacío o roto → null', () => {
    expect(parsearHash('')).toBeNull()
    expect(parsearHash('#')).toBeNull()
    expect(parsearHash('#/')).toBeNull()
    expect(parsearHash('#/loquesea')).toBeNull()
    expect(parsearHash('#/jugador')).toBeNull()
    expect(parsearHash('#/jugador/')).toBeNull()
  })
  it('todas las secciones, incluida pipeline', () => {
    for (const s of SECCIONES) {
      expect(parsearHash(`#/${s}`)).toEqual({ tipo: 'seccion', seccion: s })
    }
    expect(parsearHash('#/pipeline')).toEqual({ tipo: 'seccion', seccion: 'pipeline' })
  })
  it('sección con pestaña', () => {
    expect(parsearHash('#/captacion/partidos')).toEqual({ tipo: 'seccion', seccion: 'captacion', tab: 'partidos' })
    expect(parsearHash('#/tareas/equipo')).toEqual({ tipo: 'seccion', seccion: 'tareas', tab: 'equipo' })
    expect(parsearHash('#/pipeline/avisos/')).toEqual({ tipo: 'seccion', seccion: 'pipeline', tab: 'avisos' })
  })
  it('fichas', () => {
    expect(parsearHash('#/jugador/abc-123')).toEqual({ tipo: 'jugador', id: 'abc-123' })
    expect(parsearHash('#/club/c9')).toEqual({ tipo: 'club', id: 'c9' })
    expect(parsearHash('#/miembro/u2')).toEqual({ tipo: 'miembro', id: 'u2' })
    expect(parsearHash('#contactos')).toEqual({ tipo: 'contactos' })
  })
  it('ida y vuelta', () => {
    const rutas = [
      { tipo: 'seccion', seccion: 'boulema' },
      { tipo: 'seccion', seccion: 'distribucion', tab: 'clubes' },
      { tipo: 'jugador', id: 'x' },
      { tipo: 'contactos' },
    ] as const
    for (const r of rutas) expect(parsearHash(construirHash(r))).toEqual(r)
  })
})

describe('NOMBRE_SECCION', () => {
  it('tiene nombre para todas las secciones', () => {
    for (const s of SECCIONES) expect(NOMBRE_SECCION[s]).toBeTruthy()
  })
})
