import { describe, it, expect } from 'vitest'
import {
  construirAgenda, seccionesDelDia, itemEsDe, permisosItem, siguienteEstado, categoriasDe,
  coincideTexto, lunesSiguiente, tipoDeAccionFirmar, tipoDeEvento, estaArchivada, type AgendaInput,
  esCita, esInformePendiente, procesosSinActualizar, pendientesDeCierre, viernesSemana, diasEntre,
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

  it('una acción Reunión con evento en la agenda sale solo como evento', () => {
    const ev: AgendaEvento = { id: 'ev1', titulo: 'Reunión con el padre', tipo: 'Reunión', fecha: HOY, ambito: 'captacion', playerIds: [], scoutingPlayerId: 'sp1', participantIds: [YO], createdAt: '' }
    const items = construirAgenda(base({
      eventos: [ev],
      firmasEntries: [firma({ id: 'f1', playerName: 'Unai', scoutingPlayerId: 'sp1', nextAction: 'Reunión con el padre', nextActionKind: 'reunion', nextActionDate: HOY, nextActionEventoId: 'ev1' })],
    }))
    expect(items.map(i => i.id)).toEqual(['evento:ev1'])
    // si el evento no está (borrado, o sin migrar), la acción vuelve a salir
    expect(construirAgenda(base({
      firmasEntries: [firma({ id: 'f1', playerName: 'Unai', nextAction: 'Reunión', nextActionKind: 'reunion', nextActionDate: HOY, nextActionEventoId: 'ev1' })],
    })).map(i => i.id)).toEqual(['firmar:f1'])
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
      origen: 'evento', personId: OTRO, abrir: { tipo: 'evento', eventoId: 'e1' },
    })
    expect(it0.playerNombre).toBeUndefined()
    // Lo apunté yo, pero para otro: es suyo y no sale en mi lista
    expect(itemEsDe(it0, OTRO)).toBe(true)
    expect(itemEsDe(it0, YO)).toBe(false)
    // Sin asistentes marcados, es de quien lo apunta
    expect(construirAgenda(base({ eventos: [ev({ id: 'e2' })] }))[0].personId).toBe(YO)
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

  it('sin el enlace guardado, la actividad se empareja por contenido (fecha, jugador, tipo y título)', () => {
    const items = construirAgenda(base({
      players: [jugador('j1', 'Iker')],
      eventos: [ev({ id: 'a', titulo: 'Tema pago CR', tipo: 'Llamada', playerIds: ['j1'] })],
      activities: [
        evento({ id: 'gemela', type: 'Llamada', notes: 'Tema pago CR — Contestó' }),
        evento({ id: 'otra', type: 'Llamada', notes: 'Otro asunto' }),
      ],
    }))
    expect(items.map(i => i.id).sort()).toEqual(['evento:a', 'evento:otra'])
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
      id: 'video:j1:v1', tipo: 'evento', origen: 'evento', categoria: 'Sesión de videoanálisis', titulo: 'Sesión de videoanálisis — Salida de balón',
      personId: OTRO, otrosIds: [YO], playerId: 'j1', abrir: { tipo: 'jugador', playerId: 'j1' }, estado: 'pendiente',
    })  })

  it('con encargado, hora y lugar: sale a nombre del encargado (el analista), no de los gestores', () => {
    const p = { ...jugador('j1', 'Iker'), managedBy: [OTRO], videoSessions: [
      { id: 'v1', date: HOY, videoUrl: '', description: 'Rupturas', time: '17:00', lugar: 'Oficina', responsableId: YO },
    ] } as Player
    expect(construirAgenda(base({ players: [p] }))[0]).toMatchObject({ personId: YO, otrosIds: [], hora: '17:00', lugar: 'Oficina' })
  })

  it('con tipo, título y varios participantes: es de todos ellos y el título dice qué servicio es', () => {
    const p = { ...jugador('j1', 'Iker'), managedBy: ['gestor'], videoSessions: [
      { id: 'v1', date: HOY, videoUrl: '', tipo: 'entrenamiento', titulo: 'Finalización', description: 'Detalle largo', participantes: [OTRO, YO] },
    ] } as Player
    expect(construirAgenda(base({ players: [p] }))[0]).toMatchObject({
      titulo: 'Entrenamiento — Finalización', categoria: 'Entrenamiento', personId: OTRO, otrosIds: [YO],
    })
  })
})

describe('construirAgenda · Ofrecidos y vencimientos', () => {
  it('un informe pedido en Ofrecidos es una tarea pendiente de quien tiene que escribirlo', () => {
    const items = construirAgenda(base({ informesPedidos: [
      { ofrecimientoId: 'b1', jugador: 'Diallo', equipo: 'ASEC', avatar: 'PP', tipo: 'técnico' }, { ofrecimientoId: 'b1', jugador: 'Diallo', avatar: 'ZZ', tipo: 'técnico' },
    ] }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'ofrecido:b1:PP:técnico', tipo: 'tarea', origen: 'ofrecido', personId: OTRO, titulo: 'Informe técnico pedido — Diallo (ASEC)', abrir: { tipo: 'ofrecido', ofrecimientoId: 'b1' } })
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
      task({ id: 'hoy-a', dueDate: HOY, priority: 'alta' }),
      task({ id: 'proceso', dueDate: HOY, status: 'en_progreso' }),
      task({ id: 'proceso-lejos', dueDate: '2026-11-20', status: 'en_progreso' }),
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

  it('agenda de hoy: las citas, por hora', () => {
    expect(ids(s.agenda)).toEqual(['m2', 'm1'])
  })
  it('para hacer hoy: lo atrasado primero (lo más antiguo arriba), luego lo de hoy por prioridad', () => {
    expect(ids(s.hoy)).toEqual(['mas-vieja', 'vieja', 'hoy-a', 'hoy-b'])
    expect(ids(s.vencidas)).toEqual(['mas-vieja', 'vieja'])
  })
  it('los procesos (en curso) salen siempre, tengan la fecha que tengan, y no se repiten', () => {
    expect(ids(s.procesos).sort()).toEqual(['proceso', 'proceso-lejos'])
    expect(ids(s.hoy)).not.toContain('proceso')
    expect(s.masAdelante.map(i => i.id)).not.toContain('tarea:proceso-lejos')
  })
  it('próximos 7 días agrupados por día; lo de después va a «más adelante»', () => {
    expect(s.proximos.map(g => [g.dia, ids(g.items)])).toEqual([['2026-10-02', ['manana']], ['2026-10-08', ['limite']]])
    expect(ids(s.masAdelante)).toEqual(['lejos'])
  })
  it('bandeja (sin fecha) y hechas hoy (lo de otros días no sale)', () => {
    expect(ids(s.bandeja)).toEqual(['sin'])
    expect(ids(s.hechasHoy)).toEqual(['hecha'])
  })
  it('ningún item abierto se queda fuera', () => {
    const n = s.agenda.length + s.hoy.length + s.procesos.length + s.proximos.reduce((a, g) => a + g.items.length, 0) + s.masAdelante.length + s.bandeja.length
    expect(n).toBe(items.filter(i => i.estado !== 'completada').length)
  })
  it('una cita pasada ya ocurrió: no es trabajo atrasado', () => {
    const its = construirAgenda(base({
      scoutingMatches: [match({ id: 'pasado', date: '2026-09-28', assignedTo: 'NB' })],
      rango: { desde: '2026-09-25', hasta: '2026-10-08' },
    }))
    const sec = seccionesDelDia(its, HOY)
    expect(sec.hoy).toEqual([])
    expect(sec.vencidas).toEqual([])
  })
})

describe('cita frente a trabajo', () => {
  it('partidos y eventos son citas; tareas, acciones de Firmar y «cerrar reunión» son trabajo', () => {
    const ev: AgendaEvento = {
      id: 'e1', titulo: 'Reunión con Yarek', tipo: 'Reunión', fecha: HOY, hora: '10:00', ambito: 'general',
      playerIds: [], participantIds: [YO], createdAt: '',
    }
    const its = construirAgenda(base({
      tasks: [task({ id: 't1', dueDate: HOY })],
      scoutingMatches: [match({ id: 'm1', assignedTo: 'NB' })],
      eventos: [ev],
      firmasEntries: [firma({ id: 'f1', nextAction: 'Llamar', nextActionDate: HOY, nextActionKind: 'llamada' })],
    }))
    const porId = Object.fromEntries(its.map(i => [i.id, i]))
    expect(esCita(porId['partido:m1'])).toBe(true)
    expect(esCita(porId['evento:e1'])).toBe(true)
    expect(esCita(porId['tarea:t1'])).toBe(false)
    expect(esCita(porId['firmar:f1'])).toBe(false)
  })
})

describe('postpartidos: fecha automática', () => {
  it('sin fecha en la tarea, se quiere a los dos días del partido (nunca «algún día»)', () => {
    const its = construirAgenda(base({
      scoutingMatches: [match({ id: 'm1', date: '2026-09-26' })],
      tasks: [task({ id: 't1', label: 'Postpartido' })],
      postpartidos: [pp({ id: 'pp1', matchId: 'm1', taskId: 't1', playerName: 'Iker' })],
    }))
    expect(its.find(i => i.id === 'postpartido:pp1')?.fecha).toBe('2026-09-28')
    expect(seccionesDelDia(its, HOY).bandeja).toEqual([])
  })
})

describe('partido visto sin informe', () => {
  const partidos = [match({ id: 'reciente', date: '2026-09-29' }), match({ id: 'con-informe', date: '2026-09-30' })]
  const scouts = [
    scout({ matchId: 'reciente', scout: 'NB', status: 'visto' }),
    scout({ matchId: 'con-informe', scout: 'NB', status: 'visto' }),
  ]
  it('no genera ninguna tarea: marcar visto no obliga a escribir (se pregunta al marcarlo)', () => {
    const its = construirAgenda(base({ scoutingMatches: partidos, matchScouts: scouts, informesPartido: new Set(['con-informe|NB']) }))
    expect(its.some(esInformePendiente)).toBe(false)
    expect(its.some(i => i.id.startsWith('informe:'))).toBe(false)
  })
  it('el partido lleva la marca de informe hecho solo cuando lo hay', () => {
    const its = construirAgenda(base({ scoutingMatches: partidos, matchScouts: scouts, informesPartido: new Set(['con-informe|NB']), rango: { desde: '2026-09-29', hasta: HOY } }))
    expect(its.find(i => i.id === 'partido:con-informe:NB')?.conInforme).toBe(true)
    expect(its.find(i => i.id === 'partido:reciente:NB')?.conInforme).toBe(false)
  })
})
describe('procesos: actualización semanal', () => {
  const tasks = [
    task({ id: 'al-dia', status: 'en_progreso', createdAt: '2026-08-01T00:00:00Z' }),
    task({ id: 'desatendido', status: 'en_progreso', createdAt: '2026-08-01T00:00:00Z' }),
    task({ id: 'nunca', status: 'en_progreso', createdAt: '2026-09-20T00:00:00Z' }),
    task({ id: 'de-otro', status: 'en_progreso', assigneeId: OTRO, watchers: [YO], createdAt: '2026-08-01T00:00:00Z' }),
    task({ id: 'pendiente', createdAt: '2026-08-01T00:00:00Z' }),
  ]
  const its = construirAgenda(base({
    tasks,
    ultimaNotaTarea: { 'al-dia': '2026-09-29T09:00:00Z', 'desatendido': '2026-09-20T09:00:00Z' },
  }))
  const porId = Object.fromEntries(its.map(i => [i.id, i]))
  it('cada tarea en curso lleva cuántos días hace de su última nota (sin nota: desde que se creó)', () => {
    expect(porId['tarea:al-dia'].proceso).toEqual({ ultimaActualizacion: '2026-09-29T09:00:00Z', diasSinActualizar: 2 })
    expect(porId['tarea:desatendido'].proceso?.diasSinActualizar).toBe(11)
    expect(porId['tarea:nunca'].proceso).toEqual({ ultimaActualizacion: undefined, diasSinActualizar: 11 })
    expect(porId['tarea:pendiente'].proceso).toBeUndefined()
  })
  it('piden actualización los míos con 7 días o más sin nota, el más desatendido primero', () => {
    expect(procesosSinActualizar(its, YO).map(i => i.id)).toEqual(['tarea:desatendido', 'tarea:nunca'])
    // El de otro lo sigo, pero la nota semanal se la pide a él
    expect(procesosSinActualizar(its, OTRO).map(i => i.id)).toEqual(['tarea:de-otro'])
  })
})

describe('cierre del día', () => {
  const its = construirAgenda(base({
    tasks: [
      task({ id: 'abierta', dueDate: HOY }), task({ id: 'atrasada', dueDate: '2026-09-25' }), task({ id: 'proceso', status: 'en_progreso' }),
      // La lleva otro y yo solo la sigo: no me toca a mí decidir qué se hace con ella
      task({ id: 'adjunta', dueDate: HOY, assigneeId: OTRO, watchers: [YO] }),
    ],
    scoutingMatches: [match({ id: 'm1', assignedTo: 'NB' })],
  }))
  const s = seccionesDelDia(its.filter(it => itemEsDe(it, YO)), HOY)
  it('antes de las 18:00 no se propone nada', () => {
    expect(pendientesDeCierre(s, YO, '17:59')).toEqual([])
    expect(pendientesDeCierre(s, YO)).toEqual([])
  })
  it('a partir de las 18:00, el trabajo de hoy que llevo yo, sigue abierto y se puede mover (ni citas, ni procesos, ni adjuntas)', () => {
    expect(s.hoy.map(i => i.id)).toContain('tarea:adjunta')
    expect(pendientesDeCierre(s, YO, '18:00').map(i => i.id)).toEqual(['tarea:atrasada', 'tarea:abierta'])
  })
})

describe('fechas blandas', () => {
  it('viernes de esta semana; en fin de semana, el siguiente', () => {
    expect(viernesSemana('2026-10-01')).toBe('2026-10-02') // jueves
    expect(viernesSemana('2026-10-02')).toBe('2026-10-02') // viernes
    expect(viernesSemana('2026-10-03')).toBe('2026-10-09') // sábado
    expect(viernesSemana('2026-10-04')).toBe('2026-10-09') // domingo
    expect(viernesSemana('2026-10-05')).toBe('2026-10-09') // lunes
  })
  it('diasEntre cuenta días naturales', () => {
    expect(diasEntre('2026-09-20', '2026-10-01')).toBe(11)
    expect(diasEntre('2026-10-01', '2026-10-01')).toBe(0)
    expect(diasEntre('2026-10-02', '2026-10-01')).toBe(-1)
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
