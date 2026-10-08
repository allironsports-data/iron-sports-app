import { describe, it, expect } from 'vitest'
import { esReunionCerrable, reunionPasada, reunionSinCerrar, idApunteEvento } from '../src/lib/reuniones'
import { apunteDeEvento, aplicarCierreEnTarjeta, textoApunteEvento } from '../src/views/captacion/firmas/cierreReunion'
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
  it('reuniones, visitas, citas con jugador de Captación sí; partidos, viajes, llamadas y sin jugador no', () => {
    expect(esReunionCerrable(evento())).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Reunión' }))).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Videollamada' }))).toBe(true)
    expect(esReunionCerrable(evento({ tipo: 'Partido' }))).toBe(false)
    expect(esReunionCerrable(evento({ tipo: 'Viaje' }))).toBe(false)
    expect(esReunionCerrable(evento({ tipo: 'Llamada' }))).toBe(false)
    expect(esReunionCerrable(evento({ scoutingPlayerId: undefined }))).toBe(false)
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

    expect(out).toMatchObject({ status: 'templado', statusUpdatedAt: '2026-10-08T10:00:00Z', nextAction: 'Llamar al padre', nextActionDate: '2026-10-15', nextActionAssignee: 'p-pp', nextActionKind: 'llamada' })
    const log = out.comments.find(c => c.kind === 'estatus')!
    expect(log.text).toBe('Caliente → Templado')
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
