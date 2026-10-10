import { describe, it, expect } from 'vitest'
import {
  extraerAcciones, totalesPorPersona, totalesEquipo, serieEquipo, clavePeriodo, periodoAnterior, periodoDesde,
  etiquetaPeriodo, PESOS, type DatosVolumen,
} from '../src/lib/volumenTrabajo'
import type { Profile } from '../src/contexts/AuthContext'

const perfiles: Profile[] = [
  { id: 'p1', name: 'Pablo', avatar: 'PP', is_admin: true },
  { id: 'p2', name: 'Nacho', avatar: 'NB', is_admin: false },
]

function datos(extra: Partial<DatosVolumen> = {}): DatosVolumen {
  return {
    tasks: [], eventos: [], scoutingMatches: [], matchScouts: [], scoutingReports: [], scoutingInfos: [],
    postpartidos: [], firmasEntries: [], negotiations: [], profiles: perfiles, ...extra,
  }
}

const tarea = (id: string, over: Record<string, unknown> = {}) => ({
  id, playerId: 'j1', title: `Tarea ${id}`, description: '', assigneeId: 'p1', status: 'completada' as const,
  priority: 'media' as const, createdAt: '2026-10-01T10:00:00Z', completedAt: '2026-10-07T10:00:00Z', comments: [], ...over,
})

describe('volumenTrabajo · extracción', () => {
  it('cuenta tareas completadas por asignado, con peso por prioridad', () => {
    const a = extraerAcciones(datos({ tasks: [tarea('t1'), tarea('t2', { priority: 'alta' }), tarea('t3', { status: 'pendiente', completedAt: undefined })] as never }))
    expect(a).toHaveLength(2)
    expect(a.map(x => x.puntos).sort()).toEqual([PESOS.tarea, PESOS.tareaAlta])
    expect(a[0].dia).toBe('2026-10-07')
  })

  it('con tipo, el peso es el del tipo (+1 si es alta) y el subtipo lleva el resultado del cierre', () => {
    const a = extraerAcciones(datos({ tasks: [
      tarea('t1', { label: 'Llamada', cierre: { resultado: 'contesto' } }),
      tarea('t2', { label: 'Análisis', priority: 'alta' }),
      tarea('t3', { label: 'Comida/Visita', cierre: { resultado: 'hecha' } }),
    ] as never }))
    expect(a.map(x => [x.sub, x.puntos])).toEqual([['Llamada · Contestó', 1], ['Análisis (alta)', 4], ['Comida/Visita', 4]])
  })

  it('el evento que nace de completar una tarea no cuenta (la tarea ya cuenta)', () => {
    const a = extraerAcciones(datos({
      eventos: [
        { id: 'e1', titulo: 'Llamada', tipo: 'Llamada', fecha: '2026-10-06', ambito: 'general', playerIds: [], participantIds: ['p1'], authorId: 'p1', taskId: 't1', createdAt: '' },
        { id: 'e2', titulo: 'Reunión', tipo: 'Reunión', fecha: '2026-10-06', ambito: 'general', playerIds: [], participantIds: ['p1'], createdAt: '' },
      ],
    }))
    expect(a.map(x => x.clave)).toEqual(['e:e2'])
  })

  it('la tarea de un postpartido cuenta como postpartido y no como tarea', () => {
    const a = extraerAcciones(datos({
      tasks: [tarea('t1')] as never,
      postpartidos: [{ id: 'pp1', taskId: 't1', assigneeId: 'p2', playerName: 'Jugador X', createdAt: '2026-10-01' }],
    }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ fuente: 'postpartidos', profileId: 'p2', puntos: PESOS.postpartido })
  })

  it('un evento da crédito a autor y asistentes, pero el equipo lo cuenta una vez', () => {
    const a = extraerAcciones(datos({
      eventos: [{ id: 'e1', titulo: 'Reunión', tipo: 'Reunión', fecha: '2026-10-06', ambito: 'general', playerIds: [], participantIds: ['p2'], authorId: 'p1', createdAt: '' }],
    }))
    expect(a).toHaveLength(2)
    const semana = clavePeriodo('2026-10-06', 'semana')
    expect(totalesPorPersona(a, semana, 'semana').size).toBe(2)
    expect(totalesEquipo(a, semana, 'semana').bruto).toBe(1)
    expect(totalesEquipo(a, semana, 'semana').puntos).toBe(PESOS.evento)
  })

  it('partidos vistos por scout con la fecha del partido y el modo del scout', () => {
    const a = extraerAcciones(datos({
      scoutingMatches: [{ id: 'm1', date: '2026-10-04', homeTeam: 'A', awayTeam: 'B', viewMode: 'campo', createdAt: '' }],
      matchScouts: [
        { id: 's1', matchId: 'm1', scout: 'PP', status: 'visto', viewMode: 'video', createdAt: '' },
        { id: 's2', matchId: 'm1', scout: 'NB', status: 'pendiente', createdAt: '' },
      ],
    }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ fuente: 'partidos', profileId: 'p1', puntos: PESOS.partidoVideo, dia: '2026-10-04' })
  })

  it('pipeline: ignora estatus, «✓ Hecho» y apuntes de evento; cuenta llamadas y firmas', () => {
    const a = extraerAcciones(datos({
      firmasEntries: [{
        id: 'f1', playerName: 'Jug', zone: 'Valencia', status: 'firmado', managers: ['p1', 'p2'], sortPos: 0,
        createdAt: '', updatedAt: '', signedAt: '2026-10-08T09:00:00Z',
        comments: [
          { id: 'c1', text: 'hablado', date: '2026-10-05T10:00:00Z', authorId: 'p1', kind: 'llamada' },
          { id: 'c2', text: 'Pasa a caliente', date: '2026-10-05T10:00:00Z', authorId: 'p1', kind: 'estatus' },
          { id: 'c3', text: '✓ Hecho: Llamar', date: '2026-10-05T10:00:00Z', authorId: 'p1', kind: 'llamada' },
          { id: 'c4', text: 'reunión', date: '2026-10-05T10:00:00Z', authorId: 'p1', kind: 'reunion', eventoId: 'e9' },
          { id: 'c5', text: 'de Trello', date: '2026-10-05T10:00:00Z', author: 'Pablo' },
        ],
      }],
    }))
    const subs = a.map(x => x.sub).sort()
    expect(subs).toEqual(['Firmado', 'Firmado', 'Llamada'])
    const semana = clavePeriodo('2026-10-08', 'semana')
    expect(totalesEquipo(a, semana, 'semana').puntos).toBe(PESOS.firmado + PESOS.pipeLlamada)
  })

  it('distribución: alta, apuntes y cierre al gestor (por iniciales)', () => {
    const a = extraerAcciones(datos({
      negotiations: [{
        id: 'n1', playerId: 'j', clubId: 'c', status: 'cerrado', aisManager: 'NB',
        createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z',
        updates: [{ id: 'u1', text: 'x', date: '2026-09-25T10:00:00Z', author: 'PP' }],
      }],
    }))
    expect(a.map(x => [x.sub, x.profileId])).toEqual([
      ['Negociación nueva', 'p2'], ['Apunte negociación', 'p1'], ['Negociación cerrada', 'p2'],
    ])
  })
})

describe('volumenTrabajo · periodos', () => {
  it('semana = lunes; mes = AAAA-MM', () => {
    expect(clavePeriodo('2026-10-09', 'semana')).toBe('2026-10-05')
    expect(clavePeriodo('2026-10-05', 'semana')).toBe('2026-10-05')
    expect(clavePeriodo('2026-10-09', 'mes')).toBe('2026-10')
    expect(periodoAnterior('2026-10-05', 'semana')).toBe('2026-09-28')
    expect(periodoAnterior('2026-01', 'mes')).toBe('2025-12')
    expect(periodoDesde(new Date(2026, 9, 9, 12), 'mes', -1)).toBe('2026-09')
    expect(periodoDesde(new Date(2026, 9, 9, 12), 'semana', -1)).toBe('2026-09-28')
    expect(etiquetaPeriodo('2026-10', 'mes', true)).toBe('Octubre 2026')
    expect(etiquetaPeriodo('2026-10-05', 'semana', true)).toBe('Semana del 5 oct al 11 oct')
  })

  it('la serie termina en el periodo de hoy y deduplica por equipo', () => {
    const a = extraerAcciones(datos({
      eventos: [{ id: 'e1', titulo: 'R', tipo: 'Reunión', fecha: '2026-10-06', ambito: 'general', playerIds: [], participantIds: ['p2'], authorId: 'p1', createdAt: '' }],
    }))
    const s = serieEquipo(a, 'semana', 4, new Date(2026, 9, 9, 12))
    expect(s.map(x => x.clave)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])
    expect(s[3].totales.bruto).toBe(1)
  })
})
