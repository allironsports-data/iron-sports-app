import { describe, it, expect } from 'vitest'
import {
  metaTipo, familiaDe, subtiposDe, subtipoValido, completadasPorTipo, textoCompletadasPorTipo, etiquetaSubtipo, esTipo,
} from '../src/lib/tiposTarea'
import { TASK_LABELS } from '../src/types'

describe('metadatos por tipo', () => {
  it('todos los tipos tienen familia y los desconocidos se tratan como genéricos', () => {
    for (const l of TASK_LABELS) expect(['contacto', 'entregable', 'proceso', 'generica']).toContain(familiaDe(l))
    expect(familiaDe(undefined)).toBe('generica')
    expect(familiaDe('Inventado')).toBe('generica')
    expect(metaTipo('Llamada').familia).toBe('contacto')
    expect(metaTipo('Videoanálisis')).toMatchObject({ familia: 'entregable', jugador: 'si' })
    expect(metaTipo('Negociación')).toMatchObject({ familia: 'proceso', jugador: 'no' })
  })
  it('subtipos: Negociación, Informe, Comida/Visita y Videoanálisis los tienen; el resto no', () => {
    expect(subtiposDe('Negociación')).toContain('renovacion')
    expect(subtiposDe('Informe')).toEqual(['datos', 'tecnico', 'entorno', 'mercado', 'personalidad'])
    expect(subtiposDe('Videoanálisis')).toEqual(['sesion', 'video', 'recurso', 'entrenamiento'])
    expect(subtiposDe('Llamada')).toEqual([])
    expect(subtipoValido('Negociación', 'renovacion')).toBe('renovacion')
    expect(subtipoValido('Llamada', 'renovacion')).toBeUndefined()
    expect(subtipoValido('Negociación', undefined)).toBeUndefined()
    expect(etiquetaSubtipo('traspaso')).toBe('Traspaso / cesión')
    expect(etiquetaSubtipo('sesion')).toBe('Sesión de videoanálisis')
    expect(esTipo('Llamada')).toBe(true)
    expect(esTipo('General')).toBe(false)
  })
})

describe('completadas por tipo', () => {
  const tasks = [
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'contesto' } },
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'contesto' } },
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'no_contesto' } },
    { label: 'Llamada', status: 'pendiente' },
    { label: 'Videoanálisis', status: 'completada', cierre: { resultado: 'video' } },
    { label: 'Negociación', status: 'completada', cierre: { resultado: 'acordado' } },
    { status: 'completada', cierre: { resultado: 'hecha' } },
  ] as const
  it('cuenta solo completadas, por tipo y resultado, de más a menos', () => {
    const c = completadasPorTipo(tasks as never)
    expect(c.map(x => [x.label, x.n])).toEqual([['Llamada', 3], ['Negociación', 1], ['Otra', 1], ['Videoanálisis', 1]])
    expect(c[0].resultados).toEqual([{ resultado: 'contesto', n: 2 }, { resultado: 'no_contesto', n: 1 }])
    expect(c.find(x => x.label === 'Otra')?.resultados).toEqual([])
  })
  it('texto legible, con plurales y el resto sumado', () => {
    const c = completadasPorTipo(tasks as never)
    expect(textoCompletadasPorTipo(c)).toBe('3 llamadas (2 contestó, 1 no contestó) · 1 negociación (acordado) · 1 otra · 1 videoanálisis (sesión registrada)')
    expect(textoCompletadasPorTipo(c, 2)).toBe('3 llamadas (2 contestó, 1 no contestó) · 1 negociación (acordado) · +2')
    expect(textoCompletadasPorTipo([])).toBe('')
  })
})
