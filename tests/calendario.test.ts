import { describe, it, expect } from 'vitest'
import { diasDeSemana, filasPorPersona, filasPorTipo } from '../src/lib/calendario'
import type { AgendaItem } from '../src/lib/agendaItems'

const LUNES = '2026-09-28'
const item = (o: Partial<AgendaItem> & { id: string }): AgendaItem => ({
  tipo: 'tarea', titulo: o.id, personId: 'yo', otrosIds: [], estado: 'pendiente', prioridadAlta: false,
  origen: 'tarea', abrir: { tipo: 'tarea', taskId: o.id }, ref: {}, fecha: LUNES, ...o,
})

describe('calendario', () => {
  it('diasDeSemana: de lunes a domingo, cruzando de mes', () => {
    expect(diasDeSemana(LUNES)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('por persona: cada uno ve lo suyo (responsable o participante), por hora, con su carga', () => {
    const [yo, otro] = filasPorPersona([
      item({ id: 'b', hora: '18:00' }),
      item({ id: 'a', hora: '09:00', otrosIds: ['otro'] }),
      item({ id: 'c', estado: 'completada', fecha: '2026-10-01' }),
      item({ id: 'fuera', fecha: '2026-10-05' }),
      item({ id: 'sin-fecha', fecha: undefined }),
    ], ['yo', 'otro'], LUNES)
    expect(yo.dias[0].map(i => i.id)).toEqual(['a', 'b'])
    expect(yo.dias[3].map(i => i.id)).toEqual(['c'])
    expect([yo.total, yo.abiertos]).toEqual([3, 2])
    expect(otro.dias[0].map(i => i.id)).toEqual(['a'])
    expect([otro.total, otro.abiertos]).toEqual([1, 1])
  })

  it('solape: dos partidos sin ver el mismo día', () => {
    const p = (id: string, o: Partial<AgendaItem> = {}) => item({ id, tipo: 'partido', origen: 'captacion', ...o })
    const [f] = filasPorPersona([p('m1'), p('m2'), p('m3', { fecha: '2026-09-30' }), p('m4', { fecha: '2026-09-30', estado: 'completada' })], ['yo'], LUNES)
    expect(f.solapes).toEqual([0])
  })

  it('por tipo: un partido con varios scouts cuenta una vez', () => {
    const [partidos, tareas] = filasPorTipo([
      item({ id: 'partido:m1:NB', tipo: 'partido', origen: 'captacion', ref: { matchId: 'm1', scout: 'NB' }, estado: 'completada' }),
      item({ id: 'partido:m1:PP', tipo: 'partido', origen: 'captacion', ref: { matchId: 'm1', scout: 'PP' }, personId: 'otro' }),
      item({ id: 't1' }),
    ], [{ id: 'partidos', tipos: ['partido'] }, { id: 'tareas', tipos: ['tarea'] }], LUNES)
    expect(partidos.dias[0].map(i => i.id)).toEqual(['partido:m1:PP'])
    expect(partidos.abiertos).toBe(1)
    expect(tareas.total).toBe(1)
  })
})
