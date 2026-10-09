import { describe, it, expect } from 'vitest'
import { construirAgenda, seccionesDelDia, type AgendaInput } from '../src/lib/agendaItems'
import { fraseDelDia, contadoresInicio, partidosDeHoy, esMioEnInicio, ACCESOS } from '../src/lib/inicio'
import type { Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, AgendaEvento } from '../src/types'

const HOY = '2026-10-01'
const YO = 'p-nb', OTRO = 'p-pp'
const PERFILES = [{ id: YO, avatar: 'NB' }, { id: OTRO, avatar: 'PP' }]
const task = (o: Partial<Task> & { id: string }): Task => ({
  playerId: 'general', title: o.id, description: '', assigneeId: YO, status: 'pendiente',
  priority: 'media', createdAt: '2026-08-01T00:00:00Z', comments: [], ...o,
})
const match = (o: Partial<ScoutingMatch> & { id: string }): ScoutingMatch => ({ date: HOY, homeTeam: 'Athletic', awayTeam: 'Real', status: 'pendiente', createdAt: '', ...o })
const scout = (o: Partial<ScoutingMatchScout> & { matchId: string; scout: string }): ScoutingMatchScout => ({ id: `${o.matchId}-${o.scout}`, status: 'pendiente', createdAt: '', ...o })
const firma = (o: Partial<FirmasEntry> & { id: string }): FirmasEntry => ({ playerName: o.id, zone: 'Bizkaia', status: 'caliente', managers: [YO], comments: [], sortPos: 0, createdAt: '', updatedAt: '', ...o })
const base = (o: Partial<AgendaInput> = {}): AgendaInput => ({
  hoy: HOY, tasks: [], firmasEntries: [], postpartidos: [], scoutingMatches: [], matchScouts: [],
  profiles: PERFILES, players: [], rango: { desde: HOY, hasta: HOY }, ...o,
})
const avatarDe = (id: string) => PERFILES.find(p => p.id === id)?.avatar

describe('fraseDelDia', () => {
  it('día despejado', () => {
    expect(fraseDelDia(seccionesDelDia([], HOY))).toBe('Día despejado.')
  })
  it('primera cita con hora, cuántas más, retraso y proceso que pide nota', () => {
    const ev: AgendaEvento = { id: 'e1', titulo: 'Reunión con Yarek', tipo: 'Reunión', fecha: HOY, hora: '10:00', ambito: 'general', playerIds: [], participantIds: [YO], createdAt: '' }
    const items = construirAgenda(base({
      eventos: [ev],
      scoutingMatches: [match({ id: 'm1', time: '17:00', assignedTo: 'NB' })],
      tasks: [task({ id: 'atrasada', dueDate: '2026-09-28' }), task({ id: 'Renovación de Yarek', status: 'en_progreso', createdAt: '2026-09-01T00:00:00Z' })],
    }))
    expect(fraseDelDia(seccionesDelDia(items, HOY)))
      .toBe('Reunión con Yarek a las 10:00 y 1 cita más. 1 tarea con retraso. A «Renovación de Yarek» le toca nota.')
  })
  it('sin citas pero con trabajo', () => {
    const items = construirAgenda(base({ tasks: [task({ id: 'a', dueDate: HOY }), task({ id: 'b', dueDate: HOY })] }))
    expect(fraseDelDia(seccionesDelDia(items, HOY))).toBe('Sin citas. 2 cosas para hacer.')
  })
})

describe('partidosDeHoy', () => {
  it('junta los scouts de un mismo partido y deja fuera el informe pendiente', () => {
    const items = construirAgenda(base({
      scoutingMatches: [match({ id: 'm1', time: '12:00' }), match({ id: 'ayer', date: '2026-09-30' })],
      matchScouts: [scout({ matchId: 'm1', scout: 'NB' }), scout({ matchId: 'm1', scout: 'PP', status: 'visto' }), scout({ matchId: 'ayer', scout: 'NB', status: 'visto' })],
      informesPartido: new Set(['m1|PP']),
    }))
    const p = partidosDeHoy(items, HOY, avatarDe)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ matchId: 'm1', hora: '12:00', titulo: 'Athletic vs Real' })
    expect(p[0].scouts).toEqual([{ avatar: 'NB', conInforme: false }, { avatar: 'PP', conInforme: true }])
  })
})

describe('contadoresInicio', () => {
  it('solo cuenta lo que aporta, y en rojo lo que pide atención', () => {
    const items = construirAgenda(base({
      tasks: [task({ id: 'hoy', dueDate: HOY }), task({ id: 'pp', label: 'Postpartido', dueDate: '2026-10-05' })],
      firmasEntries: [firma({ id: 'f1', nextAction: 'Llamar', nextActionDate: '2026-09-25', nextActionAssignee: OTRO })],
    }))
    const mias = seccionesDelDia(items.filter(i => i.personId === YO), HOY)
    const c = contadoresInicio({ mias, equipo: items, hoy: HOY, partidosSemana: 3, tarjetasAbiertas: 5, ofrecidosADecidir: 2 })
    expect(c.postpartidos).toEqual({ texto: '1 pendiente' })
    expect(c.planificacion).toEqual({ texto: '3 partidos esta semana' })
    expect(c.ofrecidos).toEqual({ texto: '2 a decidir', alerta: true })
    // En Pipeline manda lo que espera decisión (la acción atrasada de otro) sobre el total de tarjetas
    expect(c.pipeline).toEqual({ texto: '1 esperando decisión', alerta: true })
    expect(c.tareas).toBeUndefined()
  })
  it('sin nada que espere, Pipeline enseña las tarjetas abiertas', () => {
    const c = contadoresInicio({ mias: seccionesDelDia([], HOY), equipo: [], hoy: HOY, partidosSemana: 0, tarjetasAbiertas: 5, ofrecidosADecidir: 0 })
    expect(c.pipeline).toEqual({ texto: '5 tarjetas abiertas' })
    expect(Object.keys(c)).toEqual(['pipeline'])
  })
})

describe('ACCESOS', () => {
  it('el orden acordado, sin Tareas ni Contactos; Administración solo para admins', () => {
    expect(ACCESOS.map(a => a.id)).toEqual(['mantenimiento', 'calendario', 'postpartidos', 'captacion', 'cjugadores', 'planificacion', 'ofrecidos', 'pipeline', 'distribucion', 'boulema', 'admin'])
    expect(ACCESOS.filter(a => a.admin).map(a => a.id)).toEqual(['admin'])
  })
})

describe('esMioEnInicio', () => {
  it('el trabajo solo si lo llevo; las citas, si asisto', () => {
    const ev: AgendaEvento = { id: 'e1', titulo: 'Reunión', tipo: 'Reunión', fecha: HOY, hora: '10:00', ambito: 'general', playerIds: [], participantIds: [OTRO, YO], createdAt: '' }
    const items = construirAgenda(base({
      tasks: [task({ id: 'mia' }), task({ id: 'adjunto', assigneeId: OTRO, watchers: [YO] })],
      eventos: [ev],
    }))
    expect(items.filter(i => esMioEnInicio(i, YO)).map(i => i.id).sort()).toEqual(['evento:e1', 'tarea:mia'])
  })
})
