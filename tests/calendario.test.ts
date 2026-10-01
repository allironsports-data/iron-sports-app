import { describe, it, expect } from 'vitest'
import { diasDeSemana, filasPorFranja, filasPorTipo, solapesPorDia, entradasDe, franjaDe } from '../src/lib/calendario'
import type { AgendaItem } from '../src/lib/agendaItems'

const LUNES = '2026-09-28'
const item = (o: Partial<AgendaItem> & { id: string }): AgendaItem => ({
  tipo: 'tarea', titulo: o.id, personId: 'yo', otrosIds: [], estado: 'pendiente', prioridadAlta: false,
  origen: 'tarea', abrir: { tipo: 'tarea', taskId: o.id }, ref: {}, fecha: LUNES, ...o,
})
const partido = (matchId: string, scout: string, personId: string, o: Partial<AgendaItem> = {}) =>
  item({ id: `partido:${matchId}:${scout}`, tipo: 'partido', origen: 'captacion', ref: { matchId, scout }, personId, ...o })

describe('calendario', () => {
  it('diasDeSemana: de lunes a domingo, cruzando de mes', () => {
    expect(diasDeSemana(LUNES)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('franjaDe', () => {
    expect([franjaDe(undefined), franjaDe('09:30'), franjaDe('14:00'), franjaDe('19:59'), franjaDe('20:00')])
      .toEqual(['sin-hora', 'manana', 'tarde', 'tarde', 'noche'])
  })

  it('por franja: cada cosa en su franja y su día, por hora, con la carga de la fila', () => {
    const [sin, manana, tarde, noche] = filasPorFranja([
      item({ id: 'tarea' }),
      item({ id: 'b', hora: '12:00' }),
      item({ id: 'a', hora: '09:00' }),
      item({ id: 'c', hora: '18:00', estado: 'completada', fecha: '2026-10-01' }),
      item({ id: 'fuera', fecha: '2026-10-05' }),
      item({ id: 'sin-fecha', fecha: undefined }),
    ], LUNES)
    expect(sin.dias[0].map(e => e.item.id)).toEqual(['tarea'])
    expect(manana.dias[0].map(e => e.item.id)).toEqual(['a', 'b'])
    expect(tarde.dias[3].map(e => e.item.id)).toEqual(['c'])
    expect([tarde.total, tarde.abiertos, noche.total]).toEqual([1, 0, 0])
  })

  it('un partido con varios scouts es una entrada con todos; hecha solo si lo han visto todos', () => {
    const [e] = entradasDe([partido('m1', 'NB', 'nb', { estado: 'completada' }), partido('m1', 'PP', 'pp')])
    expect(e.personas).toEqual(['nb', 'pp'])
    expect(e.hecha).toBe(false)
    expect(e.item.personId).toBe('pp') // se abre con el de quien lo tiene pendiente
  })

  it('las personas de una entrada: responsable y luego watchers/participantes, sin repetir', () => {
    const [e] = entradasDe([item({ id: 'x', otrosIds: ['otro', 'yo'] })])
    expect(e.personas).toEqual(['yo', 'otro'])
  })

  it('por tipo', () => {
    const [partidos, tareas] = filasPorTipo(
      [partido('m1', 'NB', 'nb'), partido('m1', 'PP', 'pp'), item({ id: 't1' })],
      [{ id: 'partidos', tipos: ['partido'] }, { id: 'tareas', tipos: ['tarea'] }], LUNES)
    expect([partidos.total, tareas.total]).toEqual([1, 1])
  })

  it('solapes: dos partidos sin ver el mismo día para la misma persona', () => {
    const s = solapesPorDia([
      partido('m1', 'NB', 'nb'), partido('m2', 'NB', 'nb'), partido('m2', 'PP', 'pp'),
      partido('m3', 'PP', 'pp', { fecha: '2026-09-30' }), partido('m4', 'PP', 'pp', { fecha: '2026-09-30', estado: 'completada' }),
    ], LUNES)
    expect(s[0]).toEqual([{ personId: 'nb', n: 2 }])
    expect(s[2]).toEqual([])
  })
})
