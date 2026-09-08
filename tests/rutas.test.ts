import { describe, it, expect } from 'vitest'
import { parseHash, buildHash, type Ruta } from '../src/lib/rutas'

describe('rutas', () => {
  it('parsea secciones, sub-pestañas y fichas', () => {
    expect(parseHash('#/tareas')).toEqual({ section: 'tareas' })
    expect(parseHash('#/captacion/partidos')).toEqual({ section: 'captacion', sub: 'partidos' })
    expect(parseHash('#/distribucion/clubes')).toEqual({ section: 'distribucion', sub: 'clubes' })
    expect(parseHash('#/equipo')).toEqual({ section: 'equipo' })
    expect(parseHash('#/postpartidos')).toEqual({ section: 'postpartidos' })
    expect(parseHash('#/mi-dia')).toEqual({ section: 'mi-dia' })
    expect(parseHash('#/jugador/abc-1')).toEqual({ section: 'jugadores', entidad: { tipo: 'jugador', id: 'abc-1' } })
    expect(parseHash('#/club/c9')).toEqual({ section: 'distribucion', entidad: { tipo: 'club', id: 'c9' } })
    expect(parseHash('#/miembro/m2')).toEqual({ section: 'equipo', entidad: { tipo: 'miembro', id: 'm2' } })
    expect(parseHash('#contactos')).toEqual({ section: 'contactos' })
  })
  it('devuelve null para hashes desconocidos', () => {
    expect(parseHash('')).toBeNull()
    expect(parseHash('#/loquesea')).toBeNull()
    expect(parseHash('#/jugador')).toBeNull()
    expect(parseHash('#foo')).toBeNull()
  })
  it('ida y vuelta buildHash(parseHash(h)) === h', () => {
    const hashes = ['#/tareas', '#/captacion/partidos', '#/distribucion/clubes', '#/equipo', '#/postpartidos',
      '#/jugador/ID1', '#/club/ID2', '#/miembro/ID3', '#/mi-dia', '#contactos']
    for (const h of hashes) expect(buildHash(parseHash(h)!)).toBe(h)
    const r: Ruta = { section: 'captacion', sub: 'informes' }
    expect(parseHash(buildHash(r))).toEqual(r)
  })
})
