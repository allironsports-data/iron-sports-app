import { describe, it, expect } from 'vitest'
import { esReunionCerrable, reunionPasada, reunionSinCerrar, idApunteEvento } from '../src/lib/reuniones'
import { apunteDeEvento, aplicarCierreEnTarjeta, textoApunteEvento, aplicarCierreLlamada, conSiguientePaso, esAccionDeLlamada } from '../src/views/captacion/firmas/cierreReunion'
import type { AgendaEvento, FirmasEntry } from '../src/types'

const HOY = '2026-10-08'
const AUTOR = { id: 'p-pp', name: 'Pablo Peña' }

const evento = (o: Partial<AgendaEvento> = {}): AgendaEvento => ({
  id: 'ev1', titulo: 'Reunión con el padre', tipo: 'Visita presencial', fecha: '2026-10-07', hora: '12:00',
  ambito: 'captacion', playerIds: [], scoutingPlayerId: 'sp1', participantIds: ['p-pp'], createdAt: '', ...o,
})
const tarjeta = (o: Partial<FirmasEntry> = {}): FirmasEntry => ({
  id: 'f1', playerName: 'Joshua', zone: 'Cataluña', status: 'caliente', scoutingPlayerId: 'sp1', managers: ['p-pp'],
  comments: [], sortPos: 0, createdAt: '', updatedAt: '', ...o,
})

describe('qué reuniones se cierran', () => {
  it('reuniones, visitas, citas sí (con quien sea); partidos, viajes y llamadas no', () => {
    expect(esReunionCerrable(evento())).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Reunión' }))).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Videollamada' }))).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Comida' }))).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Partido' }))).toBe(false)
    expect(esReunionCerrable(evento({ tipo: 'Viaje' }))).toBe(false)
    expect(esReunionCerrable(evento({ tipo: 'Llamada' }))).toBe(false)
    // Sin jugador de Captación también: con jugador nuestro el recap va a su ficha; sin nadie, al evento
    expect(esReunionCerrable(evento({ scoutingPlayerId: undefined }))).toBe(true)
  })
  it('pasada: ayer sí; hoy solo con hora ya pasada; mañana no', () => {
    expect(reunionPasada({ fecha: '2026-10-07' }, HOY)).toBe(true)
    expect(reunionPasada({ fecha: HOY, hora: '12:00' }, HOY, '13:00')).toBe(true)
    expect(reunionPasada({ fecha: HOY, hora: '12:00' }, HOY, '11:00')).toBe(false)
    expect(reunionPasada({ fecha: HOY }, HOY, '23:00')).toBe(false)
    expect(reunionPasada({ fecha: '2026-10-09' }, HOY)).toBe(false)
  })
  it('sin cerrar = cerrable + pasada + sin fecha de cierre', () => {
    expect(reunionSinCerrar(evento(), HOY)).toBe(true)
    expect(reunionSinCerrar(evento({ cerradoAt: '2026-10-07T18:00:00Z' }), HOY)).toBe(false)
    expect(reunionSinCerrar(evento({ fecha: '2026-10-20' }), HOY)).toBe(false)
  })
})

describe('apunte del evento en la tarjeta', () => {
  it('lleva el id fijo del evento y marca el cierre pendiente', () => {
    const a = apunteDeEvento(evento(), AUTOR, HOY, '2026-10-08T09:00:00Z')
    expect(a.id).toBe(idApunteEvento('ev1'))
    expect(a.kind).toBe('reunion')
    expect(a.cierre).toBe('pendiente')
    expect(a.eventoId).toBe('ev1')
    expect(a.text).toBe('📅 Visita presencial: Reunión con el padre')
  })
  it('un evento futuro dice cuándo y va fechado al apuntarlo', () => {
    const a = apunteDeEvento(evento({ fecha: '2026-10-20', lugar: 'Barcelona' }), AUTOR, HOY, '2026-10-08T09:00:00Z')
    expect(a.text).toContain('programado para el')
    expect(a.text).toContain('en Barcelona')
    expect(a.date).toBe('2026-10-08T09:00:00Z')
  })
  it('un partido no entra en el circuito de cierre', () => {
    expect(apunteDeEvento(evento({ tipo: 'Partido' }), AUTOR, HOY).cierre).toBeUndefined()
  })
  it('cerrado: el recap va debajo', () => {
    const a = apunteDeEvento(evento({ cerradoAt: '2026-10-07T18:00:00Z', recap: 'Fue bien' }), AUTOR, HOY)
    expect(a.cierre).toBe('cerrada')
    expect(a.text).toBe('📅 Visita presencial: Reunión con el padre\n✓ Cerrada: Fue bien')
  })
  it('textoApunteEvento une tipo, título, lugar y notas', () => {
    expect(textoApunteEvento({ tipo: 'Reunión', titulo: '', fecha: '2026-10-01', notas: 'ok' }, HOY)).toBe('📅 Reunión — ok')
  })
})

describe('aplicarCierreEnTarjeta', () => {
  it('actualiza el apunte existente (conservando autor y fecha), pone la próxima acción y cambia el estatus con su log', () => {
    const previo = apunteDeEvento(evento(), { id: 'p-nb', name: 'Nahuel' }, HOY, '2026-10-01T09:00:00Z')
    const f = tarjeta({ comments: [previo] })
    const out = aplicarCierreEnTarjeta(f, evento(), {
      recap: ' Buena reunión, el padre quiere firmar ',
      siguiente: { kind: 'llamada', label: 'Llamar al padre', date: '2026-10-15', assigneeId: 'p-pp' },
      estatus: 'templado',
    }, AUTOR, HOY, '2026-10-08T10:00:00Z')

    const ap = out.comments.find(c => c.id === previo.id)!
    expect(ap.cierre).toBe('cerrada')
    expect(ap.author).toBe('Nahuel')
    expect(ap.date).toBe(previo.date)
    expect(ap.text).toContain('✓ Cerrada: Buena reunión, el padre quiere firmar')

    expect(out).toMatchObject({ status: 'templado', statusUpdatedAt: '2026-10-08T10:00:00Z' })
    const log = out.comments.find(c => c.kind === 'estatus')!
    expect(log.text).toBe('Caliente → Templado')
    // el siguiente paso va en un segundo guardado
    expect(out.nextAction).toBeUndefined()
    expect(conSiguientePaso(out, { kind: 'llamada', label: 'Llamar al padre', date: '2026-10-15', assigneeId: 'p-pp' }))
      .toMatchObject({ nextAction: 'Llamar al padre', nextActionDate: '2026-10-15', nextActionAssignee: 'p-pp', nextActionKind: 'llamada' })
  })

  it('si la reunión era la próxima acción de la tarjeta, cerrarla la retira (la tarea la completa App)', () => {
    const f = tarjeta({ nextAction: 'Reunión con el padre', nextActionKind: 'reunion', nextActionDate: '2026-10-07', nextActionEventoId: 'ev1', nextActionTaskId: 't1' })
    const out = aplicarCierreEnTarjeta(f, evento(), { recap: 'ok' }, AUTOR, HOY)
    expect(out.nextAction).toBeUndefined()
    expect(out.nextActionEventoId).toBeUndefined()
    expect(out.nextActionTaskId).toBe('t1')
    // otra reunión distinta no toca la acción
    const otra = aplicarCierreEnTarjeta(f, evento({ id: 'ev2' }), { recap: 'ok' }, AUTOR, HOY)
    expect(otra.nextAction).toBe('Reunión con el padre')
  })
  it('sin apunte previo lo crea; sin estatus ni siguiente paso no toca nada más', () => {
    const out = aplicarCierreEnTarjeta(tarjeta(), evento(), { recap: 'ok' }, AUTOR, HOY)
    expect(out.comments).toHaveLength(1)
    expect(out.comments[0].cierre).toBe('cerrada')
    expect(out.status).toBe('caliente')
    expect(out.nextAction).toBeUndefined()
  })
  it('el mismo estatus no genera log', () => {
    const out = aplicarCierreEnTarjeta(tarjeta(), evento(), { recap: 'ok', estatus: 'caliente' }, AUTOR, HOY)
    expect(out.comments.some(c => c.kind === 'estatus')).toBe(false)
  })
})

describe('aplicarCierreLlamada', () => {
  const conLlamada = () => tarjeta({ nextAction: 'Llamar al padre', nextActionKind: 'whatsapp', nextActionDate: '2026-10-08', nextActionAssignee: 'p-pp', nextActionTaskId: 't1' })

  it('solo llamadas y whatsapps', () => {
    expect(esAccionDeLlamada('llamada')).toBe(true)
    expect(esAccionDeLlamada('whatsapp')).toBe(true)
    expect(esAccionDeLlamada('reunion')).toBe(false)
    expect(esAccionDeLlamada(undefined)).toBe(false)
  })

  it('no contestó: apunte con resultado, se retira la acción y nada más', () => {
    const out = aplicarCierreLlamada(conLlamada(), { contesto: false, estatus: 'frio' }, AUTOR, '2026-10-08T10:00:00Z')
    expect(out.comments).toHaveLength(1)
    expect(out.comments[0]).toMatchObject({ kind: 'whatsapp', outcome: 'no_contesto', text: '✓ Hecho: Llamar al padre' })
    expect(out.nextAction).toBeUndefined()
    expect(out.nextActionKind).toBeUndefined()
    // la tarea vinculada se conserva: App la completa al ver que la acción ya no está
    expect(out.nextActionTaskId).toBe('t1')
    // sin contestar no se cambia el estatus aunque venga
    expect(out.status).toBe('caliente')
  })

  it('contestó: recap debajo del apunte y cambio de estatus con su log', () => {
    const out = aplicarCierreLlamada(conLlamada(), { contesto: true, recap: ' Quiere vernos en noviembre ', estatus: 'templado' }, AUTOR, '2026-10-08T10:00:00Z')
    expect(out.comments[0]).toMatchObject({ outcome: 'contesto', text: '✓ Hecho: Llamar al padre\nQuiere vernos en noviembre' })
    expect(out.comments[1]).toMatchObject({ kind: 'estatus', text: 'Caliente → Templado' })
    expect(out.status).toBe('templado')
    expect(out.nextAction).toBeUndefined()
  })

  it('conSiguientePaso pone la próxima acción; vacío no toca nada', () => {
    const base = aplicarCierreLlamada(conLlamada(), { contesto: true, recap: 'ok' }, AUTOR)
    const con = conSiguientePaso(base, { kind: 'reunion', label: 'Reunión en casa', date: '2026-11-03', assigneeId: 'p-nb' })
    expect(con).toMatchObject({ nextAction: 'Reunión en casa', nextActionKind: 'reunion', nextActionDate: '2026-11-03', nextActionAssignee: 'p-nb' })
    expect(conSiguientePaso(base, { kind: 'llamada', label: '  ' })).toBe(base)
  })
})
