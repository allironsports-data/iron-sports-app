import { describe, it, expect } from 'vitest'
import {
  guardarBorrador, leerBorrador, borrarBorrador,
  encolar, leerCola, quitarDeCola, procesarCola, esErrorDeRed,
  type StorageLike,
} from '../src/lib/colaInformes'

// localStorage de mentira: un objeto y ya
function almacen(): StorageLike & { datos: Record<string, string> } {
  const datos: Record<string, string> = {}
  return {
    datos,
    getItem: k => datos[k] ?? null,
    setItem: (k, v) => { datos[k] = v },
    removeItem: k => { delete datos[k] },
  }
}

const informe = (playerId: string) => ({ playerId, texto: 'Buen partido', fecha: '2026-09-02T10:00:00Z' })

describe('borradores', () => {
  it('se guardan y se leen por jugador', () => {
    const st = almacen()
    guardarBorrador('p1', { title: 't', text: 'hola', conclusion: 'Seguir', matchId: '' }, st)
    const b = leerBorrador('p1', st)
    expect(b?.text).toBe('hola')
    expect(b?.savedAt).toBeTruthy()
    expect(leerBorrador('p2', st)).toBeNull()
  })

  it('un borrador vacío se borra en vez de guardarse', () => {
    const st = almacen()
    guardarBorrador('p1', { title: '', text: 'x', conclusion: '', matchId: '' }, st)
    guardarBorrador('p1', { title: '', text: '  ', conclusion: '', matchId: '' }, st)
    expect(leerBorrador('p1', st)).toBeNull()
  })

  it('borrarBorrador lo quita', () => {
    const st = almacen()
    guardarBorrador('p1', { title: '', text: 'x', conclusion: '', matchId: '' }, st)
    borrarBorrador('p1', st)
    expect(st.datos['ais_borrador_informe_p1']).toBeUndefined()
  })

  it('un JSON roto no revienta', () => {
    const st = almacen()
    st.datos['ais_borrador_informe_p1'] = '{no es json'
    expect(leerBorrador('p1', st)).toBeNull()
  })
})

describe('cola de envío', () => {
  it('encolar/leer/quitar', () => {
    const st = almacen()
    const a = encolar({ playerId: 'p1', report: informe('p1') }, st)
    encolar({ playerId: 'p2', report: informe('p2'), matchId: 'm1' }, st)
    expect(leerCola(st).map(x => x.playerId)).toEqual(['p1', 'p2'])
    expect(leerCola(st)[0].intentos).toBe(0)
    quitarDeCola(a.id, st)
    expect(leerCola(st).map(x => x.playerId)).toEqual(['p2'])
    expect(leerCola(st)[0].matchId).toBe('m1')
  })

  it('procesarCola quita los enviados y deja los fallidos con intentos+1', async () => {
    const st = almacen()
    encolar({ playerId: 'ok', report: informe('ok') }, st)
    encolar({ playerId: 'mal', report: informe('mal') }, st)
    const orden: string[] = []
    const r = await procesarCola(async item => {
      orden.push(item.playerId)
      if (item.playerId === 'mal') throw new Error('sin red')
    }, st)
    expect(orden).toEqual(['ok', 'mal'])
    expect(r).toEqual({ enviados: 1, pendientes: 1 })
    const cola = leerCola(st)
    expect(cola).toHaveLength(1)
    expect(cola[0].playerId).toBe('mal')
    expect(cola[0].intentos).toBe(1)
    expect(cola[0].ultimoError).toBe('sin red')
  })

  it('la cola vacía desaparece del almacén', async () => {
    const st = almacen()
    encolar({ playerId: 'p1', report: informe('p1') }, st)
    await procesarCola(async () => {}, st)
    expect(st.datos['ais_cola_informes']).toBeUndefined()
  })
})

describe('esErrorDeRed', () => {
  it('reconoce el fallo típico del navegador sin señal', () => {
    expect(esErrorDeRed(new TypeError('Failed to fetch'))).toBe(true)
    expect(esErrorDeRed(new Error('NetworkError when attempting to fetch resource'))).toBe(true)
    expect(esErrorDeRed({ message: 'TypeError: Load failed' })).toBe(true)
  })
  it('un error de datos o de permisos no es de red', () => {
    expect(esErrorDeRed(new Error('new row violates row-level security policy'))).toBe(false)
    expect(esErrorDeRed(null)).toBe(false)
  })
})
