import { describe, it, expect } from 'vitest'
import {
  cierreRequerido, eventoDeCierre, contactoOcurrio, conCierre, tareaSiguiente, notaDeNegociacion, loQueDejo,
  etiquetaResultado, ASSESSMENT_DE_CONCLUSION, type ContextoCierre,
} from '../src/lib/cierreTarea'
import type { Task, Player, FirmasEntry, AgendaEvento, Postpartido, ScoutingPlayer } from '../src/types'

const HOY = '2026-10-10'

const tarea = (o: Partial<Task> = {}): Task => ({
  id: 't1', playerId: 'general', title: 'Llamar a Perico', description: '', assigneeId: 'p-pp',
  status: 'pendiente', priority: 'media', createdAt: '2026-10-01T10:00:00.000Z', comments: [], ...o,
})
const jugador = { id: 'j1', name: 'Perico Pérez', managedBy: ['p-pp'], clubs: [] } as unknown as Player
const scouting = { id: 'sp1', fullName: 'Joshua', assessment: 'Visto', createdAt: '' } as ScoutingPlayer
const tarjeta = (o: Partial<FirmasEntry> = {}): FirmasEntry => ({
  id: 'f1', playerName: 'Joshua', zone: 'Cataluña', status: 'caliente', scoutingPlayerId: 'sp1', managers: ['p-pp'],
  comments: [], sortPos: 0, createdAt: '', updatedAt: '', ...o,
})
const evento = (o: Partial<AgendaEvento> = {}): AgendaEvento => ({
  id: 'ev1', titulo: 'Reunión', tipo: 'Reunión', fecha: '2026-10-09', ambito: 'captacion', playerIds: [],
  scoutingPlayerId: 'sp1', participantIds: [], createdAt: '', ...o,
})
const ctx = (o: Partial<ContextoCierre> = {}): ContextoCierre => ({
  firmasEntries: [], eventos: [], postpartidos: [], players: [jugador], scoutingPlayers: [scouting], ...o,
})

describe('qué cierre toca', () => {
  it('llamada, reunión y comida/visita son contactos', () => {
    expect(cierreRequerido(tarea({ label: 'Llamada' }), ctx()).tipo).toBe('llamada')
    expect(cierreRequerido(tarea({ label: 'Reunión' }), ctx()).tipo).toBe('reunion')
    expect(cierreRequerido(tarea({ label: 'Comida/Visita' }), ctx()).tipo).toBe('visita')
  })
  it('informe y análisis solo tienen cierre propio con jugador nuestro', () => {
    expect(cierreRequerido(tarea({ label: 'Informe', playerId: 'j1' }), ctx())).toMatchObject({ tipo: 'informe', player: jugador })
    expect(cierreRequerido(tarea({ label: 'Informe' }), ctx()).tipo).toBe('nota')
    expect(cierreRequerido(tarea({ label: 'Análisis', playerId: 'j1' }), ctx())).toMatchObject({ tipo: 'video' })
    expect(cierreRequerido(tarea({ label: 'Análisis' }), ctx()).tipo).toBe('nota')
  })
  it('negociación y scouting llevan su resultado; el resto, una nota', () => {
    expect(cierreRequerido(tarea({ label: 'Negociación', playerId: 'j1' }), ctx())).toMatchObject({ tipo: 'negociacion', player: jugador })
    expect(cierreRequerido(tarea({ label: 'Scouting', scoutingPlayerId: 'sp1' }), ctx())).toMatchObject({ tipo: 'scouting', scoutingPlayer: scouting })
    expect(cierreRequerido(tarea({ label: 'Administrativa' }), ctx()).tipo).toBe('nota')
    expect(cierreRequerido(tarea({ label: 'Otra' }), ctx()).tipo).toBe('nota')
    expect(cierreRequerido(tarea(), ctx()).tipo).toBe('nota')
  })
  it('la tarea de una próxima acción del pipeline sigue a la tarjeta: llamada, reunión con evento o nota', () => {
    const llamada = tarjeta({ nextActionTaskId: 't1', nextAction: 'Llamar', nextActionKind: 'llamada' })
    expect(cierreRequerido(tarea({ label: 'Scouting' }), ctx({ firmasEntries: [llamada] }))).toMatchObject({ tipo: 'pipeline-llamada', entry: llamada })
    const reunion = tarjeta({ nextActionTaskId: 't1', nextAction: 'Reunión', nextActionKind: 'reunion', nextActionEventoId: 'ev1' })
    expect(cierreRequerido(tarea({ label: 'Llamada' }), ctx({ firmasEntries: [reunion], eventos: [evento()] }))).toMatchObject({ tipo: 'pipeline-reunion', evento: { id: 'ev1' } })
    // reunión sin evento (o evento borrado): nota
    expect(cierreRequerido(tarea(), ctx({ firmasEntries: [reunion] })).tipo).toBe('nota')
    // acción ya retirada de la tarjeta: ya no manda
    expect(cierreRequerido(tarea({ label: 'Llamada' }), ctx({ firmasEntries: [tarjeta({ nextActionTaskId: 't1' })] })).tipo).toBe('llamada')
  })
  it('postpartido: pide el vídeo si hay registro; sin registro, nota', () => {
    const pp: Postpartido = { id: 'pp1', taskId: 't1', createdAt: '' }
    expect(cierreRequerido(tarea({ label: 'Postpartido' }), ctx({ postpartidos: [pp] }))).toMatchObject({ tipo: 'postpartido', postpartido: pp })
    expect(cierreRequerido(tarea({ label: 'Postpartido' }), ctx()).tipo).toBe('nota')
  })
})

describe('el evento que deja un contacto', () => {
  it('una llamada a un jugador nuestro: evento de Mantenimiento con él, hoy, con quien la hizo', () => {
    const e = eventoDeCierre(tarea({ label: 'Llamada', playerId: 'j1' }), 'llamada', { resultado: 'contesto', nota: 'Todo bien' }, { hoy: HOY, authorId: 'p-pp', players: [jugador] })
    expect(e).toMatchObject({ tipo: 'Llamada', fecha: HOY, ambito: 'mantenimiento', playerIds: ['j1'], participantIds: ['p-pp'], notas: 'Contestó — Todo bien', taskId: 't1' })
    // llamada a otra persona sobre el jugador: queda con quién en las notas
    const e2 = eventoDeCierre(tarea({ label: 'Llamada', playerId: 'j1', conQuien: 'el padre' }), 'llamada', { resultado: 'contesto' }, { hoy: HOY, authorId: 'p-pp', players: [jugador] })
    expect(e2.notas).toBe('Con el padre — Contestó')
  })
  it('con jugador de Captación es de Captación; sin nadie, general', () => {
    expect(eventoDeCierre(tarea({ label: 'Reunión', scoutingPlayerId: 'sp1' }), 'reunion', {}, { hoy: HOY, authorId: 'p-pp', players: [] }))
      .toMatchObject({ tipo: 'Reunión', ambito: 'captacion', scoutingPlayerId: 'sp1', playerIds: [] })
    expect(eventoDeCierre(tarea({ label: 'Reunión' }), 'reunion', {}, { hoy: HOY, authorId: 'p-pp', players: [] }).ambito).toBe('general')
  })
  it('comida/visita elige el tipo de evento al cerrar y respeta fecha y participantes dados', () => {
    const base = { hoy: HOY, authorId: 'p-pp', players: [jugador] }
    expect(eventoDeCierre(tarea({ label: 'Comida/Visita' }), 'visita', { subtipo: 'Comida', fecha: '2026-10-08', participantes: ['p-nb', 'p-pp'] }, base))
      .toMatchObject({ tipo: 'Comida', fecha: '2026-10-08', participantIds: ['p-nb', 'p-pp'] })
    expect(eventoDeCierre(tarea({ label: 'Comida/Visita' }), 'visita', {}, base).tipo).toBe('Visita presencial')
  })
  it('una llamada sin contestar o una reunión que no se celebró no dejan evento', () => {
    expect(contactoOcurrio('llamada', { resultado: 'no_contesto' })).toBe(false)
    expect(contactoOcurrio('llamada', { resultado: 'contesto' })).toBe(true)
    expect(contactoOcurrio('reunion', { resultado: 'no_celebrada' })).toBe(false)
    expect(contactoOcurrio('visita', { resultado: 'comida' })).toBe(true)
  })
})

describe('la tarea cerrada', () => {
  it('queda completada con resultado, nota y solo las referencias que hay', () => {
    const t = conCierre(tarea(), { resultado: 'contesto', nota: 'ok' }, { eventoId: 'ev9', activityId: undefined })
    expect(t.status).toBe('completada')
    expect(t.cierre).toEqual({ resultado: 'contesto', nota: 'ok', ref: { eventoId: 'ev9' } })
    expect(conCierre(tarea(), {}).cierre).toEqual({ resultado: undefined, nota: undefined, ref: undefined })
  })
  it('el enlace va a la nota si no estaba ya', () => {
    expect(conCierre(tarea(), { enlace: 'https://x.y/v' }).cierre?.nota).toBe('https://x.y/v')
    expect(conCierre(tarea(), { nota: 'Vídeo https://x.y/v', enlace: 'https://x.y/v' }).cierre?.nota).toBe('Vídeo https://x.y/v')
  })
  it('el siguiente paso nace pendiente, con la misma persona y jugador salvo que se cambie', () => {
    const t = tareaSiguiente(tarea({ label: 'Llamada', playerId: 'j1', recurrence: 'semanal' }), { titulo: 'Volver a llamar', fecha: '2026-10-14' }, '2026-10-10T12:00:00.000Z')
    expect(t).toMatchObject({ id: 'tmp', title: 'Volver a llamar', status: 'pendiente', dueDate: '2026-10-14', assigneeId: 'p-pp', playerId: 'j1', label: 'Llamada', comments: [] })
    expect(t.recurrence).toBeUndefined()
    expect(t.cierre).toBeUndefined()
    expect(tareaSiguiente(tarea(), { titulo: 'x', assigneeId: 'p-nb' }, '').assigneeId).toBe('p-nb')
  })
  it('textos: resultado legible, nota de negociación y qué dejó', () => {
    expect(etiquetaResultado('acordado')).toBe('Acordado')
    expect(etiquetaResultado('raro')).toBe('raro')
    expect(etiquetaResultado(undefined)).toBeUndefined()
    expect(notaDeNegociacion({ title: 'Renovación' }, { resultado: 'acordado', nota: '2 años' })).toBe('Negociación · Acordado: Renovación — 2 años')
    expect(loQueDejo({ ref: { eventoId: 'e', siguienteTaskId: 't' } })).toEqual(['Evento en la agenda', 'Siguiente paso creado como tarea'])
    expect(loQueDejo(undefined)).toEqual([])
    expect(ASSESSMENT_DE_CONCLUSION.descartar).toBe('Descartado')
    expect(ASSESSMENT_DE_CONCLUSION.sin_novedad).toBeUndefined()
  })
})
