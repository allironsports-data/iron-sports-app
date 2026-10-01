import { describe, it, expect } from 'vitest'
import { parsearAltaRapida } from '../src/lib/altaRapida'

const HOY = '2026-10-01' // jueves
const profiles = [
  { id: 'p1', name: 'Nacho Beristain', avatar: 'NB' },
  { id: 'p2', name: 'Pablo Peña', avatar: 'PP' },
  { id: 'p3', name: 'Pablo Ruiz', avatar: 'PR' },
]
const p = (t: string) => parsearAltaRapida(t, { hoy: HOY, profiles })

describe('parsearAltaRapida', () => {
  it('todo junto: persona, categoría, fecha y prioridad salen del título', () => {
    expect(p('Llamar al padre de Iker @nb #negociacion viernes !')).toEqual({
      titulo: 'Llamar al padre de Iker', assigneeId: 'p1', label: 'Negociación', dueDate: '2026-10-02',
      prioridadAlta: true, sinResolver: [],
    })
  })
  it('solo título', () => {
    expect(p('  Revisar contrato  ')).toEqual({ titulo: 'Revisar contrato', prioridadAlta: false, sinResolver: [] })
  })
  it('fechas en texto', () => {
    expect(p('x hoy').dueDate).toBe('2026-10-01')
    expect(p('x mañana').dueDate).toBe('2026-10-02')
    expect(p('x pasado mañana')).toMatchObject({ titulo: 'x', dueDate: '2026-10-03' })
    expect(p('x jueves').dueDate).toBe('2026-10-08') // hoy es jueves → el siguiente
    expect(p('x miércoles').dueDate).toBe('2026-10-07')
    expect(p('x 15/10').dueDate).toBe('2026-10-15')
    expect(p('x 3/2').dueDate).toBe('2027-02-03') // ya pasó este año
    expect(p('x 15/10/2027').dueDate).toBe('2027-10-15')
    expect(p('x 40/10').dueDate).toBeUndefined()
  })
  it('quita la preposición que se queda colgando', () => {
    expect(p('Informe de Unai para el viernes').titulo).toBe('Informe de Unai')
    expect(p('Llamar mañana a Unai').titulo).toBe('Llamar a Unai')
  })
  it('persona por iniciales o por nombre; si es ambiguo no asigna y avisa', () => {
    expect(p('x @PP').assigneeId).toBe('p2')
    expect(p('x @nacho').assigneeId).toBe('p1')
    expect(p('x @pablo')).toMatchObject({ titulo: 'x @pablo', sinResolver: ['@pablo'] })
    expect(p('x @pablo').assigneeId).toBeUndefined()
  })
  it('categoría por principio del nombre, sin acentos', () => {
    expect(p('x #reunion').label).toBe('Reunión/Comida')
    expect(p('x #info').label).toBe('Informe')
    expect(p('x #nada')).toMatchObject({ titulo: 'x #nada', sinResolver: ['#nada'] })
  })
  it('prioridad con ! pegado al final', () => {
    expect(p('Urgente esto!')).toMatchObject({ titulo: 'Urgente esto', prioridadAlta: true })
  })
})
