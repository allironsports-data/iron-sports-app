import { describe, it, expect } from 'vitest'
import { resumenSemanal } from '../src/lib/resumenSemanal'
import type { Task } from '../src/types'

const HOY = '2026-10-01'        // jueves
const LUNES = '2026-09-28'
const en = (d: string) => `${d}T12:00:00`
const task = (o: Partial<Task> & { id: string }): Task => ({
  playerId: 'general', title: o.id, description: '', assigneeId: 'yo', status: 'pendiente',
  priority: 'media', createdAt: en('2026-08-01'), comments: [], ...o,
})

describe('resumenSemanal', () => {
  const tasks = [
    task({ id: 'hecha-esta', status: 'completada', completedAt: en('2026-09-29'), label: 'Llamada', cierre: { resultado: 'contesto' } }),
    task({ id: 'hecha-anterior', status: 'completada', completedAt: en('2026-09-24') }),
    task({ id: 'hecha-anterior-2', status: 'completada', completedAt: en('2026-09-22') }),
    task({ id: 'creada-esta', createdAt: en('2026-09-30') }),
    task({ id: 'vencida-ahora', dueDate: '2026-09-29' }),
    task({ id: 'vence-hoy', dueDate: HOY }),
    // Venció el 20, se completó el 29: estaba vencida al cerrar la semana anterior, ya no
    task({ id: 'recuperada', dueDate: '2026-09-20', status: 'completada', completedAt: en('2026-09-29') }),
    task({ id: 'de-otro', assigneeId: 'otro', status: 'completada', completedAt: en('2026-09-29'), dueDate: '2026-09-01' }),
  ]
  it('cuenta la semana y la anterior solo con lo de esa persona', () => {
    expect(resumenSemanal(tasks, 'yo', LUNES, HOY)).toEqual({
      hechas: 2, vencidas: 1, creadas: 1,
      tipos: [{ label: 'Llamada', n: 1, resultados: [{ resultado: 'contesto', n: 1 }] }, { label: 'Otra', n: 1, resultados: [] }],
      antes: { hechas: 2, vencidas: 1, creadas: 0, tipos: [{ label: 'Otra', n: 2, resultados: [] }] },
    })
  })
  it('una semana futura no tiene vencidas', () => {
    expect(resumenSemanal(tasks, 'yo', '2026-10-05', HOY).vencidas).toBe(0)
  })
})
