import { describe, it, expect } from 'vitest'
import {
  estadoVisible, estaCaducado, diasHastaLimite, pasosPendientes, informesPedidos,
  veredictoDesdeConclusion, conNivelNuevo, conRespuesta, sinPaso, resumenVeredictos, ordenLista, birthdateDe,
} from '../src/lib/ofrecidos'
import type { Ofrecimiento } from '../src/types'

const HOY = '2026-10-08'

const ofr = (o: Partial<Ofrecimiento> & { id: string }): Ofrecimiento => ({
  playerName: o.id, origen: 'agente', estado: 'abierto', niveles: [], contactos: [],
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...o,
})

describe('estadoVisible', () => {
  it('sin niveles es Nuevo; con niveles, el nivel activo', () => {
    expect(estadoVisible(ofr({ id: 'a' }), HOY).clave).toBe('nuevo')
    const b = conNivelNuevo(ofr({ id: 'b' }), 'PP', [{ avatar: 'AV', tipo: 'tecnico' }])
    expect(estadoVisible(b, HOY)).toMatchObject({ clave: 'informes', label: 'Nivel 1', nivel: 1 })
  })
  it('la fecha límite pasada manda sobre abierto y decidir, pero no sobre cerrado', () => {
    expect(estadoVisible(ofr({ id: 'a', fechaLimite: '2026-10-07' }), HOY).clave).toBe('caducado')
    expect(estadoVisible(ofr({ id: 'a', estado: 'decidir', fechaLimite: '2026-10-07' }), HOY).clave).toBe('caducado')
    expect(estadoVisible(ofr({ id: 'a', estado: 'aceptado', fechaLimite: '2026-10-07' }), HOY).clave).toBe('aceptado')
    // hoy mismo todavía no ha caducado
    expect(estaCaducado(ofr({ id: 'a', fechaLimite: HOY }), HOY)).toBe(false)
  })
  it('cuenta los días hasta el límite', () => {
    expect(diasHastaLimite(ofr({ id: 'a', fechaLimite: '2026-10-14' }), HOY)).toBe(6)
    expect(diasHastaLimite(ofr({ id: 'a', fechaLimite: '2026-10-06' }), HOY)).toBe(-2)
    expect(diasHastaLimite(ofr({ id: 'a' }), HOY)).toBeNull()
  })
})

describe('niveles y respuestas', () => {
  const base = conNivelNuevo(ofr({ id: 'x', team: 'Antiguoko' }), 'PP',
    [{ avatar: 'AV', tipo: 'tecnico' }, { avatar: 'RP', tipo: 'tecnico' }, { avatar: 'AV', tipo: 'tecnico' }], ' ver el sábado ', '2026-10-02T10:00:00Z')

  it('no repite persona+tipo y guarda el mensaje recortado', () => {
    expect(base.niveles[0].pasos).toHaveLength(2)
    expect(base.niveles[0].mensaje).toBe('ver el sábado')
    expect(base.niveles[0]).toMatchObject({ n: 1, pedidoPor: 'PP', pedidoAt: '2026-10-02T10:00:00Z' })
  })

  it('los pendientes salen uno por persona, con tipo y nivel', () => {
    expect(informesPedidos([base])).toEqual([
      { ofrecimientoId: 'x', jugador: 'x', equipo: 'Antiguoko', avatar: 'AV', tipo: 'tecnico', nivel: 1, pedidoPor: 'PP' },
      { ofrecimientoId: 'x', jugador: 'x', equipo: 'Antiguoko', avatar: 'RP', tipo: 'tecnico', nivel: 1, pedidoPor: 'PP' },
    ])
  })

  it('una respuesta marca solo ese paso y conserva los demás', () => {
    const r = conRespuesta(base, 1, 'AV', 'tecnico', { veredicto: 'ok', reportId: 'rep1', comentario: ' bien ' }, '2026-10-03T00:00:00Z')
    expect(r.niveles[0].pasos[0]).toMatchObject({ avatar: 'AV', veredicto: 'ok', reportId: 'rep1', comentario: 'bien', respondidoAt: '2026-10-03T00:00:00Z' })
    expect(r.niveles[0].pasos[1].veredicto).toBe('pendiente')
    expect(pasosPendientes(r).map(p => p.paso.avatar)).toEqual(['RP'])
  })

  it('un nivel nuevo se numera seguido y saca de «decidir»', () => {
    const d = { ...base, estado: 'decidir' as const }
    const n2 = conNivelNuevo(d, 'PP', [{ avatar: 'NB', tipo: 'entorno' }])
    expect(n2.estado).toBe('abierto')
    expect(n2.niveles.map(n => n.n)).toEqual([1, 2])
    // los pendientes de niveles anteriores siguen vivos
    expect(pasosPendientes(n2)).toHaveLength(3)
  })

  it('cerrado = sin pendientes, aunque haya pasos sin contestar', () => {
    expect(pasosPendientes({ ...base, estado: 'descartado' })).toEqual([])
  })

  it('quitar un paso; el nivel vacío desaparece', () => {
    const s = sinPaso(sinPaso(base, 1, 'AV', 'tecnico'), 1, 'RP', 'tecnico')
    expect(s.niveles).toEqual([])
  })

  it('resumen de veredictos', () => {
    const r = conRespuesta(base, 1, 'AV', 'tecnico', { veredicto: 'mas' })
    expect(resumenVeredictos(r)).toEqual({ pendiente: 1, ok: 0, no: 0, mas: 1 })
  })
})

describe('veredictoDesdeConclusion', () => {
  it('Firmar/Seguir → ok, Descartar → no, Más video → mas', () => {
    expect(veredictoDesdeConclusion('Firmar')).toBe('ok')
    expect(veredictoDesdeConclusion('Seguir')).toBe('ok')
    expect(veredictoDesdeConclusion('Descartar')).toBe('no')
    expect(veredictoDesdeConclusion('Más video, prioritario')).toBe('mas')
    expect(veredictoDesdeConclusion(undefined)).toBe('ok')
  })
})

describe('ordenLista', () => {
  it('caducados, decidir, nuevos, en informes, cerrados; dentro, por fecha límite', () => {
    const items = [
      ofr({ id: 'cerrado', estado: 'aceptado' }),
      conNivelNuevo(ofr({ id: 'informes' }), 'PP', [{ avatar: 'AV', tipo: 'tecnico' }]),
      ofr({ id: 'nuevo-tarde', fechaLimite: '2026-10-20' }),
      ofr({ id: 'nuevo-pronto', fechaLimite: '2026-10-10' }),
      ofr({ id: 'decidir', estado: 'decidir' }),
      ofr({ id: 'caducado', fechaLimite: '2026-10-01' }),
    ]
    expect([...items].sort((a, b) => ordenLista(a, b, HOY)).map(o => o.id))
      .toEqual(['caducado', 'decidir', 'nuevo-pronto', 'nuevo-tarde', 'informes', 'cerrado'])
  })
})

describe('birthdateDe', () => {
  it('año y mes → primer día; sin mes → enero; sin año → nada', () => {
    expect(birthdateDe({ birthYear: '2007', birthMonth: '3' })).toBe('2007-03-01')
    expect(birthdateDe({ birthYear: '2007' })).toBe('2007-01-01')
    expect(birthdateDe({ birthYear: 'x' })).toBeUndefined()
  })
})
