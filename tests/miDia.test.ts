import { describe, it, expect } from 'vitest'
import { construirMiDia, contarMiDia, partidosAsignados, tituloDia, type MiDiaInput } from '../src/lib/miDia'
import type { Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, ScoutingPlayer } from '../src/types'

const HOY = '2026-09-02'
const YO = 'p-nb'
const OTRO = 'p-pp'

const task = (o: Partial<Task> & { id: string }): Task => ({
  playerId: 'general', title: o.id, description: '', assigneeId: YO, status: 'pendiente',
  priority: 'media', createdAt: '2026-08-01T00:00:00Z', comments: [], ...o,
})
const match = (o: Partial<ScoutingMatch> & { id: string }): ScoutingMatch => ({
  date: HOY, homeTeam: 'Athletic', awayTeam: 'Real', status: 'pendiente', createdAt: '', ...o,
})
const scout = (o: Partial<ScoutingMatchScout> & { matchId: string; scout: string }): ScoutingMatchScout => ({
  id: `${o.matchId}-${o.scout}`, status: 'pendiente', createdAt: '', ...o,
})
const firma = (o: Partial<FirmasEntry> & { id: string }): FirmasEntry => ({
  playerName: o.id, zone: 'Bizkaia', status: 'caliente', managers: [YO], comments: [], sortPos: 0,
  createdAt: '', updatedAt: '', ...o,
})
const pp = (o: Partial<Postpartido> & { id: string }): Postpartido => ({ assigneeId: YO, createdAt: '', ...o })

const base = (o: Partial<MiDiaInput> = {}): MiDiaInput => ({
  profileId: YO, avatar: 'NB', hoy: HOY, tasks: [], scoutingMatches: [], matchScouts: [],
  firmasEntries: [], postpartidos: [], players: [] as Player[], scoutingPlayers: [] as ScoutingPlayer[], ...o,
})

describe('construirMiDia · partidos', () => {
  it('incluye los partidos de hoy asignados por matchScouts y respeta el estado de ESE scout', () => {
    const m1 = match({ id: 'm1', time: '18:00' })
    const m2 = match({ id: 'm2', time: '12:00', homeTeam: 'Eibar', awayTeam: 'Alavés' })
    const m3 = match({ id: 'm3', date: '2026-09-03' })
    const items = construirMiDia(base({
      scoutingMatches: [m1, m2, m3],
      matchScouts: [
        scout({ matchId: 'm1', scout: 'NB', viewMode: 'campo' }),
        scout({ matchId: 'm2', scout: 'NB', status: 'visto' }),
        scout({ matchId: 'm2', scout: 'PP' }),
        scout({ matchId: 'm3', scout: 'NB' }),
      ],
    }))
    expect(items.map(i => i.id)).toEqual(['partido:m1'])
    expect(items[0].hora).toBe('18:00')
    expect(items[0].subtitulo).toContain('En el campo')
    expect(items[0].vencido).toBe(false)
  })

  it('sin scouts en la tabla, cae a assignedTo como hace el Dashboard', () => {
    const items = construirMiDia(base({
      scoutingMatches: [match({ id: 'a', assignedTo: 'NB' }), match({ id: 'b', assignedTo: 'PP' }), match({ id: 'c', assignedTo: 'NB', status: 'visto' })],
    }))
    expect(items.map(i => i.ref.matchId)).toEqual(['a'])
  })

  it('partidosAsignados sin avatar devuelve vacío', () => {
    expect(partidosAsignados([match({ id: 'a', assignedTo: 'NB' })], [], undefined, HOY)).toEqual([])
  })
})

describe('construirMiDia · acciones de Firmar', () => {
  it('acciones con fecha <= hoy donde soy manager o asignado; las futuras y firmadas no', () => {
    const items = construirMiDia(base({
      firmasEntries: [
        firma({ id: 'f-hoy', nextAction: 'Llamar', nextActionKind: 'llamada', nextActionDate: HOY }),
        firma({ id: 'f-vencida', nextAction: 'Reunión', nextActionDate: '2026-08-30' }),
        firma({ id: 'f-futura', nextAction: 'Llamar', nextActionDate: '2026-09-05' }),
        firma({ id: 'f-firmado', status: 'firmado', nextAction: 'Llamar', nextActionDate: HOY }),
        firma({ id: 'f-otro', managers: [OTRO], nextAction: 'Llamar', nextActionDate: HOY }),
        firma({ id: 'f-asignada', managers: [OTRO], nextActionAssignee: YO, nextAction: 'WhatsApp', nextActionDate: HOY }),
        // soy manager pero la acción la tiene asignada otro → no es mía
        firma({ id: 'f-delegada', managers: [YO], nextActionAssignee: OTRO, nextAction: 'Llamar', nextActionDate: HOY }),
      ],
    }))
    expect(items.map(i => i.id)).toEqual(['accion:f-vencida', 'accion:f-hoy', 'accion:f-asignada'])
    const vencida = items[0]
    expect(vencida.vencido).toBe(true)
    expect(vencida.subtitulo).toContain('30 ago')
    expect(items[1].titulo).toBe('Llamar · f-hoy')
    expect(items[1].subtitulo).toContain('Llamada')
  })

  it('no duplica la tarea del tablero generada por la acción', () => {
    const items = construirMiDia(base({
      firmasEntries: [firma({ id: 'f1', nextAction: 'Llamar', nextActionDate: HOY, nextActionTaskId: 't-sync' })],
      tasks: [task({ id: 't-sync', dueDate: HOY })],
    }))
    expect(items.map(i => i.id)).toEqual(['accion:f1'])
    expect(items[0].ref.taskId).toBe('t-sync')
  })
})

describe('construirMiDia · tareas', () => {
  it('vencidas, de hoy o en curso sin fecha; no las futuras, completadas ni ajenas', () => {
    const items = construirMiDia(base({
      tasks: [
        task({ id: 'vencida', dueDate: '2026-09-01' }),
        task({ id: 'hoy', dueDate: HOY }),
        task({ id: 'futura', dueDate: '2026-09-10' }),
        task({ id: 'en-curso', status: 'en_progreso' }),
        task({ id: 'sin-fecha-pendiente' }),
        task({ id: 'completada', dueDate: HOY, status: 'completada' }),
        task({ id: 'ajena', dueDate: HOY, assigneeId: OTRO }),
        task({ id: 'watcher', dueDate: HOY, assigneeId: OTRO, watchers: [YO] }),
      ],
    }))
    expect(items.map(i => i.id)).toEqual(['tarea:vencida', 'tarea:en-curso', 'tarea:hoy', 'tarea:watcher'])
    expect(items[0].vencido).toBe(true)
    expect(items[1].subtitulo).toContain('En curso')
  })

  it('el subtítulo lleva el nombre del jugador', () => {
    const players = [{ id: 'j1', name: 'Iker' } as Player]
    const items = construirMiDia(base({ players, tasks: [task({ id: 't', playerId: 'j1', dueDate: HOY, label: 'Informe' })] }))
    expect(items[0].subtitulo).toBe('Iker · Informe')
    expect(items[0].ref.playerId).toBe('j1')
  })
})

describe('construirMiDia · postpartidos', () => {
  it('solo los míos sin completar, y no repite su tarea', () => {
    const items = construirMiDia(base({
      scoutingMatches: [match({ id: 'm', date: '2026-08-31', time: '20:00' })],
      players: [{ id: 'j1', name: 'Iker' } as Player],
      postpartidos: [
        pp({ id: 'a', matchId: 'm', playerId: 'j1', taskId: 't-a' }),
        pp({ id: 'b', playerName: 'Otro', taskId: 't-b' }),
        pp({ id: 'c', playerName: 'Con vídeo', videoUrl: 'https://x' }),
        pp({ id: 'd', playerName: 'Ajeno', assigneeId: OTRO }),
      ],
      tasks: [task({ id: 't-a', dueDate: '2026-09-01' }), task({ id: 't-b', status: 'completada' })],
    }))
    expect(items.map(i => i.id)).toEqual(['postpartido:a'])
    expect(items[0].titulo).toBe('Postpartido · Iker')
    expect(items[0].subtitulo).toBe('Athletic vs Real · 31 ago')
    expect(items[0].vencido).toBe(true)
    // el partido del postpartido es de otro día y no tiene hora de hoy: no sale como partido
  })
})

describe('construirMiDia · orden y contadores', () => {
  it('vencidos primero, luego por hora, luego por tipo', () => {
    const items = construirMiDia(base({
      scoutingMatches: [match({ id: 'm-tarde', time: '20:00' }), match({ id: 'm-manana', time: '10:00' }), match({ id: 'm-sin-hora' })],
      matchScouts: [scout({ matchId: 'm-tarde', scout: 'NB' }), scout({ matchId: 'm-manana', scout: 'NB' }), scout({ matchId: 'm-sin-hora', scout: 'NB' })],
      firmasEntries: [firma({ id: 'f', nextAction: 'Llamar', nextActionDate: HOY })],
      tasks: [task({ id: 't-vencida', dueDate: '2026-08-01' }), task({ id: 't-hoy', dueDate: HOY })],
    }))
    expect(items.map(i => i.id)).toEqual([
      'tarea:t-vencida',
      'partido:m-manana', 'partido:m-tarde',
      'partido:m-sin-hora', 'accion:f', 'tarea:t-hoy',
    ])
    expect(contarMiDia(items)).toEqual({ partidos: 3, acciones: 1, tareas: 2, postpartidos: 0, vencidos: 1 })
  })

  it('sin nada que hacer devuelve lista vacía', () => {
    expect(construirMiDia(base())).toEqual([])
  })

  it('tituloDia en castellano', () => {
    expect(tituloDia('2026-09-02')).toBe('miércoles 2 de septiembre')
  })
})
