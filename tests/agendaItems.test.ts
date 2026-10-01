import { describe, it, expect } from 'vitest'
import {
  construirAgenda, seccionesDelDia, itemEsDe, permisosItem, siguienteEstado, categoriasDe,
  coincideTexto, lunesSiguiente, tipoDeAccionFirmar, tipoDeEvento, estaArchivada, type AgendaInput,
} from '../src/lib/agendaItems'
import type { Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, PlayerActivity, AgendaEvento } from '../src/types'

const HOY = '2026-10-01' // jueves
const YO = 'p-nb'
const OTRO = 'p-pp'
const PERFILES = [{ id: YO, avatar: 'NB' }, { id: OTRO, avatar: 'PP' }]

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
const jugador = (id: string, name: string) => ({ id, name } as Player)
const evento = (o: Partial<PlayerActivity> & { id: string }): PlayerActivity => ({
  playerId: 'j1', date: HOY, type: 'Llamada', createdAt: '', authorId: YO, ...o,
})

const base = (o: Partial<AgendaInput> = {}): AgendaInput => ({
  hoy: HOY, tasks: [], firmasEntries: [], postpartidos: [], scoutingMatches: [], matchScouts: [],
  profiles: PERFILES, players: [], rango: { desde: HOY, hasta: '2026-10-08' }, ...o,
})

describe('construirAgenda · tareas', () => {
  it('una tarea normal sale con su jugador, categoría y destino', () => {
    const [it0] = construirAgenda(base({
      players: [jugador('j1', 'Iker')],
      tasks: [task({ id: 't1', playerId: 'j1', label: 'Informe', dueDate: HOY, priority: 'alta', watchers: [OTRO] })],
    }))
    expect(it0).toMatchObject({
      id: 'tarea:t1', tipo: 'tarea', origen: 'tarea', personId: YO, otrosIds: [OTRO], fecha: HOY,
      playerId: 'j1', playerNombre: 'Iker', categoria: 'Informe', prioridadAlta: true,
      abrir: { tipo: 'tarea', taskId: 't1' },
    })
  })

  it('las tareas «general» no llevan jugador', () => {
    const [it0] = construirAgenda(base({ tasks: [task({ id: 't1' })] }))
    expect(it0.playerId).toBeUndefined()
    expect(it0.playerNombre).toBeUndefined()
  })
})

describe('construirAgenda · Firmar', () => {
  it('la acción sale una sola vez y toma el estado de su tarea vinculada', () => {
    const items = construirAgenda(base({
      tasks: [task({ id: 't1', title: '📞 Llamar · Unai', label: 'Scouting', status: 'en_progreso', dueDate: HOY })],
      firmasEntries: [firma({ id: 'f1', playerName: 'Unai', nextAction: 'Llamar', nextActionKind: 'llamada', nextActionDate: HOY, nextActionAssignee: OTRO, nextActionTaskId: 't1' })],
    }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'firmar:f1', tipo: 'llamada', origen: 'firmar', personId: OTRO, estado: 'en_progreso',
      playerNombre: 'Unai', categoria: 'Scouting', abrir: { tipo: 'firmar', entryId: 'f1' },
      ref: { firmasEntryId: 'f1', taskId: 't1' },
    })
  })

  it('sin responsable de la acción, es del primer encargado y el resto la ven', () => {
    const [it0] = construirAgenda(base({ firmasEntries: [firma({ id: 'f1', managers: [YO, OTRO], nextAction: 'Reunión', nextActionKind: 'reunion' })] }))
    expect(it0.tipo).toBe('reunion')
    expect(it0.personId).toBe(YO)
    expect(itemEsDe(it0, OTRO)).toBe(true)
  })

  it('no salen las firmadas ni las tarjetas sin próxima acción', () => {
    expect(construirAgenda(base({
      firmasEntries: [firma({ id: 'a', status: 'firmado', nextAction: 'Llamar' }), firma({ id: 'b' })],
    }))).toEqual([])
  })

  it('tipos: teléfono, reunión/entorno y el resto llamada', () => {
    expect(tipoDeAccionFirmar('telefono')).toBe('telefono')
    expect(tipoDeAccionFirmar('entorno')).toBe('reunion')
    expect(tipoDeAccionFirmar('whatsapp')).toBe('llamada')
    expect(tipoDeAccionFirmar(undefined)).toBe('llamada')
  })

  it('la tarea de una acción ya completada conserva el tipo por el icono del título', () => {
    const [it0] = construirAgenda(base({ tasks: [task({ id: 't1', title: '🤝 Reunión · Unai', label: 'Scouting', status: 'completada', completedAt: '2026-09-30T10:00:00Z' })] }))
    expect(it0.tipo).toBe('reunion')
  })
})

describe('construirAgenda · postpartidos', () => {
  it('toma fecha y estado de su tarea y no repite la tarea', () => {
    const items = construirAgenda(base({
      players: [jugador('j1', 'Iker')],
      scoutingMatches: [match({ id: 'm1', date: '2026-09-20' })],
      tasks: [task({ id: 't1', label: 'Postpartido', dueDate: '2026-09-28' })],
      postpartidos: [pp({ id: 'pp1', matchId: 'm1', playerId: 'j1', taskId: 't1' })],
    }))
    expect(items).toHaveLength(1) // el partido queda fuera del rango y la tarea no se duplica
    expect(items[0]).toMatchObject({
      id: 'postpartido:pp1', tipo: 'postpartido', titulo: 'Postpartido Athletic vs Real', fecha: '2026-09-28',
      estado: 'pendiente', playerId: 'j1', abrir: { tipo: 'postpartido', postpartidoId: 'pp1', taskId: 't1' },
    })
  })

  it('sin tarea: no se puede cambiar desde la lista', () => {
    const [it0] = construirAgenda(base({ postpartidos: [pp({ id: 'pp1', playerName: 'Otro' })] }))
    expect(it0.playerNombre).toBe('Otro')
    expect(permisosItem(it0)).toEqual({ estado: false, enCurso: false, reprogramar: false, reasignar: false })
  })
})

describe('construirAgenda · partidos', () => {
  it('multi-scout: una fila por scout, cada una con su estado', () => {
    const items = construirAgenda(base({
      scoutingMatches: [match({ id: 'm1', time: '18:00' })],
      matchScouts: [scout({ matchId: 'm1', scout: 'NB' }), scout({ matchId: 'm1', scout: 'PP', status: 'visto' }), scout({ matchId: 'm1', scout: 'ZZ' })],
    }))
    expect(items.map(i => [i.id, i.personId, i.estado])).toEqual([
      ['partido:m1:NB', YO, 'pendiente'],
      ['partido:m1:PP', OTRO, 'completada'],
    ])
    expect(items[0].hora).toBe('18:00')
    expect(items[0].ref).toEqual({ matchId: 'm1', scout: 'NB' })
  })

  it('sin filas de scouts cae a assignedTo; sin asignar no sale', () => {
    const items = construirAgenda(base({
      scoutingMatches: [match({ id: 'a', assignedTo: 'PP' }), match({ id: 'b' })],
    }))
    expect(items.map(i => [i.id, i.personId])).toEqual([['partido:a', OTRO]])
  })

  it('solo los del rango pedido', () => {
    const items = construirAgenda(base({
      scoutingMatches: [match({ id: 'ayer', date: '2026-09-30', assignedTo: 'NB' }), match({ id: 'lejos', date: '2026-10-09', assignedTo: 'NB' }), match({ id: 'ok', date: '2026-10-08', assignedTo: 'NB' })],
    }))
    expect(items.map(i => i.ref.matchId)).toEqual(['ok'])
  })

  it('un partido solo admite visto/pendiente', () => {
    const [it0] = construirAgenda(base({ scoutingMatches: [match({ id: 'a', assignedTo: 'NB' })] }))
    expect(permisosItem(it0)).toEqual({ estado: true, enCurso: false, reprogramar: false, reasignar: false })
    expect(siguienteEstado(it0)).toBe('completada')
  })
})

describe('construirAgenda · eventos', () => {
  it('un evento de grupo sale una vez, con el resto de jugadores resumido', () => {
    const items = construirAgenda(base({
      players: [jugador('j1', 'Iker'), jugador('j2', 'Unai')],
      activities: [
        evento({ id: 'e1', playerId: 'j1', groupId: 'g', linkedPlayerIds: ['j1', 'j2'], participantProfileIds: [OTRO] }),
        evento({ id: 'e2', playerId: 'j2', groupId: 'g', linkedPlayerIds: ['j1', 'j2'], participantProfileIds: [OTRO] }),
        evento({ id: 'viejo', date: '2026-09-01' }),
      ],
    }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'evento:g', tipo: 'evento', playerNombre: 'Iker +1', abrir: { tipo: 'jugador', playerId: 'j1' } })
    expect(itemEsDe(items[0], OTRO)).toBe(true)
    expect(permisosItem(items[0]).estado).toBe(false)
  })
})

describe('construirAgenda · eventos de agenda', () => {
  const ev = (o: Partial<AgendaEvento> & { id: string }): AgendaEvento => ({
    titulo: '', tipo: 'Reunión', fecha: HOY, ambito: 'general', playerIds: [], participantIds: [], authorId: YO, createdAt: '', ...o,
  })

  it('sin jugador: sale con su hora, su tipo y sus asistentes', () => {
    const [it0] = construirAgenda(base({ eventos: [ev({ id: 'e1', tipo: 'Videollamada', titulo: 'Con el club', hora: '17:30', participantIds: [OTRO] })] }))
    expect(it0).toMatchObject({
      id: 'evento:e1', tipo: 'reunion', titulo: 'Con el club', hora: '17:30', categoria: 'Videollamada',
      origen: 'evento', personId: YO, abrir: { tipo: 'evento', eventoId: 'e1' },
    })
    expect(it0.playerNombre).toBeUndefined()
    expect(itemEsDe(it0, OTRO)).toBe(true)
  })

  it('con jugadores de Mantenimiento o uno de Captación', () => {
    const items = construirAgenda(base({
      players: [jugador('j1', 'Iker'), jugador('j2', 'Unai')],
      nombreScouting: id => id === 's1' ? 'Promesa' : undefined,
      eventos: [
        ev({ id: 'a', ambito: 'mantenimiento', playerIds: ['j1', 'j2'], tipo: 'Sesión de análisis' }),
        ev({ id: 'b', ambito: 'captacion', scoutingPlayerId: 's1', tipo: 'Llamada' }),
      ],
    }))
    expect(items.map(i => [i.tipo, i.titulo, i.playerNombre, i.playerId])).toEqual([
      ['evento', 'Sesión de análisis', 'Iker +1', 'j1'],
      ['llamada', 'Llamada', 'Promesa', undefined],
    ])
  })

  it('la actividad que generó el evento no sale por duplicado; fuera de rango no sale', () => {
    const items = construirAgenda(base({
      players: [jugador('j1', 'Iker')],
      eventos: [ev({ id: 'a', playerIds: ['j1'], activityRef: 'act1' }), ev({ id: 'viejo', fecha: '2026-08-01' })],
      activities: [evento({ id: 'act1' }), evento({ id: 'act2' })],
    }))
    expect(items.map(i => i.id)).toEqual(['evento:act2', 'evento:a'])
  })

  it('un evento pasado no es una tarea: ni hecha, ni vencida', () => {
    const items = construirAgenda(base({
      rango: { desde: '2026-09-20', hasta: HOY },
      eventos: [ev({ id: 'pasado', fecha: '2026-09-24' })],
      activities: [evento({ id: 'act', date: '2026-09-24' })],
    }))
    expect(items.map(i => i.estado)).toEqual(['pendiente', 'pendiente'])
    const s = seccionesDelDia(items, HOY)
    expect(s.vencidas).toEqual([])
    expect(s.hechasHoy).toEqual([])
  })

  it('tipoDeEvento', () => {
    expect(tipoDeEvento('Reunión con jugador')).toBe('reunion')
    expect(tipoDeEvento('Cita')).toBe('reunion')
    expect(tipoDeEvento('Partido')).toBe('partido')
    expect(tipoDeEvento('Firma de contrato')).toBe('evento')
  })
})

describe('construirAgenda · sesiones de videoanálisis del jugador', () => {
  it('salen como evento del día, a nombre de sus encargados, y abren la ficha', () => {
    const p = { ...jugador('j1', 'Iker'), managedBy: [OTRO, YO], videoSessions: [
      { id: 'v1', date: HOY, videoUrl: '', description: 'Salida de balón' },
      { id: 'v0', date: '2026-08-01', videoUrl: '', description: 'vieja' },
    ] } as Player
    const items = construirAgenda(base({ players: [p] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'video:j1:v1', tipo: 'evento', origen: 'evento', categoria: 'Videoanálisis', titulo: 'Videoanálisis — Salida de balón',
      personId: OTRO, otrosIds: [YO], playerId: 'j1', abrir: { tipo: 'jugador', playerId: 'j1' }, estado: 'pendiente',
    })
  })
})

describe('construirAgenda · Boulema y vencimientos', () => {
  it('un informe de Boulema pedido es una tarea pendiente de quien tiene que escribirlo', () => {
    const items = construirAgenda(base({ peticionesBoulema: [
      { id: 'b1', jugador: 'Diallo', equipo: 'ASEC', avatar: 'PP' }, { id: 'b1', jugador: 'Diallo', avatar: 'ZZ' },
    ] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'boulema:b1:PP', tipo: 'tarea', origen: 'boulema', personId: OTRO, titulo: 'Informe Boulema — Diallo (ASEC)', abrir: { tipo: 'boulema' } })
    expect(permisosItem(items[0]).estado).toBe(false)
  })

  it('los fines de contrato solo salen si se piden (admins) y caen en el rango', () => {
    const p = { ...jugador('j1', 'Iker'), managedBy: [YO], representationContract: { start: '', end: '2026-10-05' }, clubContract: { endDate: '2027-06-30' } } as Player
    expect(construirAgenda(base({ players: [p] }))).toEqual([])
    const items = construirAgenda(base({ players: [p], vencimientos: true }))
    expect(items.map(i => [i.titulo, i.fecha, i.categoria])).toEqual([['Fin del contrato de representación', '2026-10-05', 'Vencimiento']])
  })
})

describe('archivo automático', () => {
  it('las completadas hace más de 30 días no salen; las recientes y las abiertas sí', () => {
    const items = construirAgenda(base({
      tasks: [
        task({ id: 'vieja', status: 'completada', completedAt: '2026-08-15T10:00:00Z' }),
        task({ id: 'reciente', status: 'completada', completedAt: '2026-09-20T10:00:00Z' }),
        task({ id: 'abierta-antigua', createdAt: '2025-01-01T00:00:00Z' }),
      ],
      postpartidos: [pp({ id: 'pp-viejo', taskId: 'vieja', videoUrl: 'https://x' })],
    }))
    expect(items.map(i => i.id)).toEqual(['tarea:reciente', 'tarea:abierta-antigua'])
  })
  it('estaArchivada: el límite son 30 días', () => {
    expect(estaArchivada({ status: 'completada', completedAt: '2026-09-01T12:00:00', createdAt: '' }, HOY)).toBe(false)
    expect(estaArchivada({ status: 'completada', completedAt: '2026-08-31T12:00:00', createdAt: '' }, HOY)).toBe(true)
    expect(estaArchivada({ status: 'pendiente', createdAt: '2020-01-01T00:00:00Z' }, HOY)).toBe(false)
  })
})

describe('siguienteEstado', () => {
  it('pendiente → en curso → hecha → pendiente', () => {
    const de = (status: Task['status']) => construirAgenda(base({ tasks: [task({ id: 't', status, completedAt: status === 'completada' ? '2026-09-30T10:00:00Z' : undefined })] }))[0]
    expect(siguienteEstado(de('pendiente'))).toBe('en_progreso')
    expect(siguienteEstado(de('en_progreso'))).toBe('completada')
    expect(siguienteEstado(de('completada'))).toBe('pendiente')
  })
})

describe('seccionesDelDia', () => {
  const hechaHoy = new Date(2026, 9, 1, 10).toISOString()
  const items = construirAgenda(base({
    tasks: [
      task({ id: 'vieja', dueDate: '2026-09-20' }),
      task({ id: 'mas-vieja', dueDate: '2026-09-10' }),
      task({ id: 'hoy-b', dueDate: HOY }),
      task({ id: 'hoy-a', dueDate: HOY, status: 'en_progreso' }),
      task({ id: 'manana', dueDate: '2026-10-02' }),
      task({ id: 'limite', dueDate: '2026-10-08' }),
      task({ id: 'lejos', dueDate: '2026-10-09' }),
      task({ id: 'sin' }),
      task({ id: 'hecha', status: 'completada', completedAt: hechaHoy }),
      task({ id: 'hecha-ayer', status: 'completada', completedAt: '2026-09-29T10:00:00Z' }),
    ],
    scoutingMatches: [match({ id: 'm1', time: '12:00', assignedTo: 'NB' }), match({ id: 'm2', time: '09:30', assignedTo: 'NB' })],
  }))
  const s = seccionesDelDia(items, HOY)
  const ids = (xs: { id: string }[]) => xs.map(x => x.id.replace(/^\w+:/, ''))

  it('vencidas, de la más antigua a la más reciente', () => {
    expect(ids(s.vencidas)).toEqual(['mas-vieja', 'vieja'])
  })
  it('hoy: primero lo que tiene hora, por hora; luego en curso', () => {
    expect(ids(s.hoy)).toEqual(['m2', 'm1', 'hoy-a', 'hoy-b'])
  })
  it('próximos 7 días agrupados por día; lo de después va a «más adelante»', () => {
    expect(s.proximos.map(g => [g.dia, ids(g.items)])).toEqual([['2026-10-02', ['manana']], ['2026-10-08', ['limite']]])
    expect(ids(s.masAdelante)).toEqual(['lejos'])
  })
  it('sin fecha y hechas hoy (lo de otros días no sale)', () => {
    expect(ids(s.sinFecha)).toEqual(['sin'])
    expect(ids(s.hechasHoy)).toEqual(['hecha'])
  })
  it('ningún item abierto se queda fuera', () => {
    const n = s.vencidas.length + s.hoy.length + s.proximos.reduce((a, g) => a + g.items.length, 0) + s.masAdelante.length + s.sinFecha.length
    expect(n).toBe(items.filter(i => i.estado !== 'completada').length)
  })
})

describe('filtros', () => {
  const items = construirAgenda(base({
    players: [jugador('j1', 'Iñaki Peña')],
    tasks: [task({ id: 'a', title: 'Renovación', playerId: 'j1', label: 'Negociación' }), task({ id: 'b', label: 'Informe' }), task({ id: 'c', label: 'Informe' }), task({ id: 'd' })],
  }))
  it('categoriasDe cuenta y ordena de más a menos', () => {
    expect(categoriasDe(items)).toEqual([{ categoria: 'Informe', n: 2 }, { categoria: 'Negociación', n: 1 }])
  })
  it('coincideTexto busca en título, jugador y categoría sin acentos', () => {
    expect(items.filter(i => coincideTexto(i, 'pena')).map(i => i.id)).toEqual(['tarea:a'])
    expect(items.filter(i => coincideTexto(i, 'RENOVACION')).map(i => i.id)).toEqual(['tarea:a'])
    expect(items.filter(i => coincideTexto(i, 'informe'))).toHaveLength(2)
    expect(items.filter(i => coincideTexto(i, '  '))).toHaveLength(4)
  })
})

describe('lunesSiguiente', () => {
  it('siempre el lunes de la semana que viene', () => {
    expect(lunesSiguiente('2026-10-01')).toBe('2026-10-05') // jueves
    expect(lunesSiguiente('2026-10-05')).toBe('2026-10-12') // lunes
    expect(lunesSiguiente('2026-10-04')).toBe('2026-10-05') // domingo
  })
})
