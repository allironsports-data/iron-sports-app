import { describe, it, expect } from 'vitest'
import {
  metaTipo, familiaDe, subtiposDe, subtipoValido, completadasPorTipo, textoCompletadasPorTipo, etiquetaSubtipo, esTipo,
  tituloAuto, queHaraAlCerrar, EVENTO_EN_VEZ_DE_TAREA, citaDeTipo,
} from '../src/lib/tiposTarea'
import { TASK_LABELS } from '../src/types'

describe('metadatos por tipo', () => {
  it('todos los tipos tienen familia y los desconocidos se tratan como genéricos', () => {
    for (const l of TASK_LABELS) expect(['contacto', 'entregable', 'proceso', 'generica']).toContain(familiaDe(l))
    expect(familiaDe(undefined)).toBe('generica')
    expect(familiaDe('Inventado')).toBe('generica')
    expect(metaTipo('Llamada').familia).toBe('contacto')
    expect(metaTipo('Análisis')).toMatchObject({ familia: 'entregable', jugador: 'si' })
    expect(metaTipo('Negociación')).toMatchObject({ familia: 'proceso', jugador: 'si', subtipoLibre: true })
  })
  it('subtipos: Negociación, Informe, Comida/Visita y Análisis los tienen; el resto no', () => {
    expect(subtiposDe('Negociación')).toEqual([])
    expect(metaTipo('Negociación').subtipoLibre).toBe(true)
    expect(subtiposDe('Scouting')).toEqual(['seguir', 'ver_partido', 'info'])
    expect(subtiposDe('Informe')).toEqual(['datos', 'tecnico', 'entorno', 'mercado', 'personalidad'])
    expect(subtiposDe('Análisis')).toEqual(['sesion', 'video', 'recurso', 'entrenamiento'])
    expect(subtiposDe('Llamada')).toEqual([])
    expect(subtipoValido('Negociación', ' renovación 2 años ')).toBe('renovación 2 años')   // texto libre
    expect(subtipoValido('Negociación', '  ')).toBeUndefined()
    expect(subtipoValido('Scouting', 'ver_partido')).toBe('ver_partido')
    expect(subtipoValido('Llamada', 'renovacion')).toBeUndefined()
    expect(subtipoValido('Negociación', undefined)).toBeUndefined()
    expect(etiquetaSubtipo('traspaso')).toBe('Traspaso / cesión')
    expect(etiquetaSubtipo('sesion')).toBe('Sesión de análisis')
    expect(esTipo('Llamada')).toBe(true)
    expect(esTipo('General')).toBe(false)
  })
})

describe('al crear: título automático y qué pasará', () => {
  it('el título sale del tipo, el sujeto y el subtipo', () => {
    expect(tituloAuto('Llamada', 'Perico')).toBe('Llamar a Perico')
    expect(tituloAuto('Llamada')).toBe('')
    // con quién (persona) + sobre qué jugador
    expect(tituloAuto('Llamada', 'Jakub Dobias', undefined, 'director deportivo del Valencia')).toBe('Llamar a director deportivo del Valencia · Jakub Dobias')
    expect(tituloAuto('Llamada', undefined, undefined, 'el padre')).toBe('Llamar a el padre')
    expect(tituloAuto('Informe', 'Joshua', 'tecnico')).toBe('Informe de partido · Joshua')
    expect(tituloAuto('Informe', 'Joshua')).toBe('Informe · Joshua')
    expect(tituloAuto('Análisis', 'Perico', 'sesion')).toBe('Sesión de análisis · Perico')
    expect(tituloAuto('Negociación', 'Perico', 'renovación')).toBe('Negociación renovación · Perico')
    expect(tituloAuto('Scouting', 'Joshua', 'ver_partido')).toBe('Ver partido de Joshua')
    expect(tituloAuto('Scouting', 'Joshua')).toBe('Seguir a Joshua')
    expect(tituloAuto('Administrativa', 'Perico')).toBe('')
  })
  it('cita: una sesión o entrenamiento la lleva por defecto; un vídeo o recurso no; una llamada puede; una negociación nunca', () => {
    expect(citaDeTipo('Análisis', 'sesion')).toEqual({ cita: 'defecto', tipoEvento: 'Sesión de análisis' })
    expect(citaDeTipo('Análisis', 'entrenamiento').cita).toBe('defecto')
    expect(citaDeTipo('Análisis', 'recurso').cita).toBe('no')
    expect(citaDeTipo('Análisis').cita).toBe('posible')
    expect(citaDeTipo('Llamada')).toEqual({ cita: 'posible', tipoEvento: 'Llamada' })
    expect(citaDeTipo('Negociación').cita).toBe('no')
    expect(citaDeTipo('Scouting', 'ver_partido')).toEqual({ cita: 'posible', tipoEvento: 'Cita' })
    expect(citaDeTipo('Comida/Visita', 'Comida').tipoEvento).toBe('Comida')
  })
  it('Reunión y Comida/Visita se crean como evento; el pie cuenta qué pasará al cerrar', () => {
    expect(EVENTO_EN_VEZ_DE_TAREA['Reunión']).toBe('Reunión')
    expect(EVENTO_EN_VEZ_DE_TAREA['Comida/Visita']).toBe('Visita presencial')
    expect(EVENTO_EN_VEZ_DE_TAREA['Llamada']).toBeUndefined()
    expect(queHaraAlCerrar('Llamada', 'Perico')).toContain('ficha de Perico')
    expect(queHaraAlCerrar('Negociación')).toContain('proceso')
    expect(queHaraAlCerrar(undefined)).toBeUndefined()
  })
})

describe('completadas por tipo', () => {
  const tasks = [
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'contesto' } },
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'contesto' } },
    { label: 'Llamada', status: 'completada', cierre: { resultado: 'no_contesto' } },
    { label: 'Llamada', status: 'pendiente' },
    { label: 'Análisis', status: 'completada', cierre: { resultado: 'video' } },
    { label: 'Negociación', status: 'completada', cierre: { resultado: 'acordado' } },
    { status: 'completada', cierre: { resultado: 'hecha' } },
  ] as const
  it('cuenta solo completadas, por tipo y resultado, de más a menos', () => {
    const c = completadasPorTipo(tasks as never)
    expect(c.map(x => [x.label, x.n])).toEqual([['Llamada', 3], ['Análisis', 1], ['Negociación', 1], ['Otra', 1]])
    expect(c[0].resultados).toEqual([{ resultado: 'contesto', n: 2 }, { resultado: 'no_contesto', n: 1 }])
    expect(c.find(x => x.label === 'Otra')?.resultados).toEqual([])
  })
  it('texto legible, con plurales y el resto sumado', () => {
    const c = completadasPorTipo(tasks as never)
    expect(textoCompletadasPorTipo(c)).toBe('3 llamadas (2 contestó, 1 no contestó) · 1 análisis (sesión registrada) · 1 negociación (acordado) · 1 otra')
    expect(textoCompletadasPorTipo(c, 2)).toBe('3 llamadas (2 contestó, 1 no contestó) · 1 análisis (sesión registrada) · +2')
    expect(textoCompletadasPorTipo([])).toBe('')
  })
})
