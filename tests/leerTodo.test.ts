import { describe, it, expect, vi } from 'vitest'

// supabase.ts necesita variables de entorno y fetch: se sustituye por un stub
vi.mock('../src/lib/supabase', () => ({ supabase: { from: () => ({}) } }))

import { leerTodo } from '../src/lib/db'

type Fila = { id: string; n: number }

/** Consulta simulada sobre `total` filas; apunta los rangos pedidos. */
function tablaSimulada(total: number) {
  const filas: Fila[] = Array.from({ length: total }, (_, i) => ({ id: `f${i}`, n: i }))
  const pedidos: Array<[number, number]> = []
  const consulta = (desde: number, hasta: number) => {
    pedidos.push([desde, hasta])
    // llegada desordenada a propósito: las páginas altas responden antes
    const espera = Math.max(0, 5 - Math.floor(desde / 1000)) * 2
    return new Promise<{ data: Fila[] | null; error: unknown }>(resolve =>
      setTimeout(() => resolve({ data: filas.slice(desde, hasta + 1), error: null }), espera))
  }
  return { filas, pedidos, consulta }
}

describe('leerTodo · paginación en paralelo', () => {
  it('2.500 filas: 3 páginas, todas las filas, sin duplicados y en orden', async () => {
    const { pedidos, consulta } = tablaSimulada(2500)
    const res = await leerTodo<Fila>('t', consulta)
    expect(res).toHaveLength(2500)
    expect(new Set(res.map(f => f.id)).size).toBe(2500)
    expect(res.map(f => f.n)).toEqual(Array.from({ length: 2500 }, (_, i) => i))
    // se pidieron las páginas 0, 1 y 2 (el orden de llegada no importa)
    expect(pedidos).toEqual(expect.arrayContaining([[0, 999], [1000, 1999], [2000, 2999]]))
    expect(pedidos[0]).toEqual([0, 999])
  })

  it('999 filas: una sola página', async () => {
    const { pedidos, consulta } = tablaSimulada(999)
    const res = await leerTodo<Fila>('t', consulta)
    expect(res).toHaveLength(999)
    expect(new Set(res.map(f => f.id)).size).toBe(999)
    expect(pedidos).toEqual([[0, 999]])
  })

  it('con `contar`: pide de golpe todas las páginas que faltan', async () => {
    const { pedidos, consulta } = tablaSimulada(2500)
    const res = await leerTodo<Fila>('t', consulta, {
      contar: () => Promise.resolve({ count: 2500, error: null }),
    })
    expect(res).toHaveLength(2500)
    expect(new Set(res.map(f => f.id)).size).toBe(2500)
    expect(pedidos).toHaveLength(3)
    expect(pedidos).toEqual(expect.arrayContaining([[0, 999], [1000, 1999], [2000, 2999]]))
  })

  it('quita las filas repetidas entre páginas', async () => {
    const consulta = (desde: number) => Promise.resolve({
      // la página 1 repite la última fila de la 0 (alguien insertó entre medias)
      data: desde === 0
        ? Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}` }))
        : desde === 1000
          ? Array.from({ length: 10 }, (_, i) => ({ id: `f${999 + i}` }))
          : [],
      error: null,
    })
    const res = await leerTodo<{ id: string }>('t', consulta)
    expect(res).toHaveLength(1009)
    expect(new Set(res.map(f => f.id)).size).toBe(1009)
  })

  it('propaga el error de una página', async () => {
    const consulta = (desde: number) => Promise.resolve(
      desde === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}` })), error: null }
        : { data: null, error: new Error('boom') },
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(leerTodo<{ id: string }>('t', consulta)).rejects.toThrow('boom')
    spy.mockRestore()
  })
})
