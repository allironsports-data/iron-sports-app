import { describe, it, expect } from 'vitest'
import { L, PRIORITY_LABELS, TASK_STATUS_LABELS, NEG_STATUS_LABELS, label } from '../src/lib/labels'

describe('labels', () => {
  it('glosario con los términos acordados', () => {
    expect(L.encargado).toBe('Encargado')
    expect(L.solicitud).toBe('Solicitud')
    expect(L.nivel).toBe('Nivel')
  })
  it('mapas de estados y prioridades', () => {
    expect(PRIORITY_LABELS.alta).toBe('Alta')
    expect(TASK_STATUS_LABELS.en_progreso).toBe('En progreso')
    expect(NEG_STATUS_LABELS.negociando).toBe('Negociando')
  })
  it('label() devuelve la clave capitalizada si no está en el mapa', () => {
    expect(label(PRIORITY_LABELS, 'media')).toBe('Media')
    expect(label(TASK_STATUS_LABELS as Record<string, string>, 'en_revision')).toBe('En revision')
    expect(label(PRIORITY_LABELS, undefined)).toBe('')
  })
})
