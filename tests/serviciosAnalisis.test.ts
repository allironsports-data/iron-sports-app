import { describe, it, expect } from 'vitest'
import { tipoDeServicio, tituloDeServicio, participantesDeServicio, contarServicios } from '../src/lib/serviciosAnalisis'
import type { VideoSession } from '../src/types'

const v = (o: Partial<VideoSession> = {}): VideoSession => ({ id: 'x', date: '2026-10-01', videoUrl: '', description: '', ...o })

describe('servicios de análisis', () => {
  it('los antiguos, sin tipo, son sesiones de videoanálisis; un tipo desconocido también', () => {
    expect(tipoDeServicio(v())).toBe('sesion')
    expect(tipoDeServicio(v({ tipo: 'recurso' }))).toBe('recurso')
    expect(tipoDeServicio(v({ tipo: 'otra-cosa' }))).toBe('sesion')
  })
  it('título: el suyo; en los antiguos, la descripción; y si no hay nada, el nombre del tipo', () => {
    expect(tituloDeServicio(v({ titulo: 'Rupturas', description: 'largo' }))).toBe('Rupturas')
    expect(tituloDeServicio(v({ description: 'Revisión de cortes' }))).toBe('Revisión de cortes')
    expect(tituloDeServicio(v({ tipo: 'informe_datos' }))).toBe('Informe de datos')
  })
  it('participantes: la lista nueva; en los antiguos, el encargado único', () => {
    expect(participantesDeServicio(v({ participantes: ['a', 'b'], responsableId: 'z' }))).toEqual(['a', 'b'])
    expect(participantesDeServicio(v({ responsableId: 'z' }))).toEqual(['z'])
    expect(participantesDeServicio(v())).toEqual([])
  })
  it('contarServicios', () => {
    expect(contarServicios([v(), v({ tipo: 'video' }), v({ tipo: 'video' }), v({ tipo: 'informe_datos' })]))
      .toEqual({ sesion: 1, video: 2, recurso: 0, entrenamiento: 0, informe_datos: 1 })
  })
})
