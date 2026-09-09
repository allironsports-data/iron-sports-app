import { describe, it, expect } from 'vitest'
import { calcularFilasEquipos, reglaRelevante, reglaCubierto, MIN_LLAMAR_RELEVANTE, MIN_PARTIDOS_CUBIERTO } from '../src/views/captacion/filasEquipos'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../src/types'

// ── Reglas automáticas de la pestaña Equipos ─────────────────────────
//   relevante → 2+ jugadores «en Llamar» (etiqueta Llamar O informe con
//               veredicto Llamar: cuenta el jugador, no el nº de informes)
//   cubierto  → 2+ partidos vistos

const jug = (id: string, team: string, assessment?: ScoutingPlayer['assessment']): ScoutingPlayer =>
  ({ id, fullName: 'J' + id, team, assessment, createdAt: '2026-01-01' })

const inf = (id: string, playerId: string, conclusion?: string): ScoutingReport =>
  ({ id, playerId, conclusion, fecha: '2026-08-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' })

const part = (id: string, home: string, away: string, date = '2026-08-10'): ScoutingMatch =>
  ({ id, date, homeTeam: home, awayTeam: away, createdAt: '2026-08-01' })

const DESDE = '2026-07-01'
const filasDe = (players: ScoutingPlayer[], reports: ScoutingReport[], matches: ScoutingMatch[]) =>
  calcularFilasEquipos([], players, reports, matches, {}, DESDE)

const fila = (players: ScoutingPlayer[], reports: ScoutingReport[], matches: ScoutingMatch[], equipo: string) =>
  filasDe(players, reports, matches).find(f => f.nombre === equipo)!

describe('regla: relevante con 2+ jugadores en Llamar', () => {
  it('cuenta a los que tienen la ETIQUETA Llamar', () => {
    const ps = [jug('1', 'Elche Juv A', 'Llamar'), jug('2', 'Elche Juv A', 'Llamar'), jug('3', 'Elche Juv A', 'Seguir')]
    const f = fila(ps, [], [], 'Elche Juv A')
    expect(f.enLlamar).toBe(2)
    expect(reglaRelevante(f)).toBe(true)
  })

  it('cuenta también a los que tienen un INFORME con veredicto Llamar aunque su etiqueta sea otra', () => {
    const ps = [jug('1', 'Elche Juv A', 'Seguir'), jug('2', 'Elche Juv A')]
    const rs = [inf('r1', '1', 'Llamar'), inf('r2', '2', 'Llamar')]
    const f = fila(ps, rs, [], 'Elche Juv A')
    expect(f.enLlamar).toBe(2)
    expect(reglaRelevante(f)).toBe(true)
  })

  it('un mismo jugador no cuenta dos veces por tener etiqueta e informes', () => {
    const ps = [jug('1', 'Elche Juv A', 'Llamar')]
    const rs = [inf('r1', '1', 'Llamar'), inf('r2', '1', 'Llamar'), inf('r3', '1', 'Llamar')]
    const f = fila(ps, rs, [], 'Elche Juv A')
    expect(f.enLlamar).toBe(1)
    expect(reglaRelevante(f)).toBe(false)
  })

  it('con uno solo no salta', () => {
    const ps = [jug('1', 'Elche Juv A', 'Llamar'), jug('2', 'Elche Juv A', 'Descartar')]
    expect(reglaRelevante(fila(ps, [], [], 'Elche Juv A'))).toBe(false)
  })

  it('los veredictos que no son Llamar no cuentan', () => {
    const ps = [jug('1', 'Elche Juv A'), jug('2', 'Elche Juv A')]
    const rs = [inf('r1', '1', 'Seguir'), inf('r2', '2', 'Descartar')]
    expect(fila(ps, rs, [], 'Elche Juv A').enLlamar).toBe(0)
  })

  it('«Firmar» del sistema antiguo se sigue contando como Llamar', () => {
    const ps = [jug('1', 'Elche Juv A'), jug('2', 'Elche Juv A')]
    const rs = [inf('r1', '1', 'Firmar'), inf('r2', '2', 'Firmar')]
    expect(reglaRelevante(fila(ps, rs, [], 'Elche Juv A'))).toBe(true)
  })
})

describe('regla: cubierto con 2+ partidos', () => {
  it('con dos partidos sí, con uno no', () => {
    expect(reglaCubierto(0)).toBe(false)
    expect(reglaCubierto(1)).toBe(false)
    expect(reglaCubierto(2)).toBe(true)
    expect(reglaCubierto(9)).toBe(true)
  })

  it('cuenta los partidos del equipo juegue en casa o fuera', () => {
    const ms = [part('m1', 'Elche Juv A', 'Villarreal Juv A'), part('m2', 'Levante Juv A', 'Elche Juv A')]
    const f = fila([jug('1', 'Elche Juv A')], [], ms, 'Elche Juv A')
    expect(f.partidos).toBe(2)
    expect(reglaCubierto(f.partidos)).toBe(true)
  })

  it('los partidos de temporadas anteriores no cuentan para la temporada en curso', () => {
    const ms = [
      part('m1', 'Elche Juv A', 'Villarreal Juv A', '2025-10-01'),
      part('m2', 'Elche Juv A', 'Levante Juv A', '2025-11-01'),
    ]
    const f = fila([jug('1', 'Elche Juv A')], [], ms, 'Elche Juv A')
    expect(f.partidos).toBe(0)          // temporada en curso
    expect(f.partidosHist).toBe(2)      // histórico
    expect(reglaCubierto(f.partidos)).toBe(false)
    expect(reglaCubierto(f.partidosHist)).toBe(true)
  })

  it('el equipo escrito de otra forma suma al mismo (se cruza normalizado)', () => {
    const ms = [part('m1', 'elche juv a', 'X'), part('m2', 'Elche Juv A', 'Y')]
    const f = fila([jug('1', 'Elche Juv A')], [], ms, 'Elche Juv A')
    expect(f.partidos).toBe(2)
  })
})

describe('umbrales', () => {
  it('son los acordados', () => {
    expect(MIN_LLAMAR_RELEVANTE).toBe(2)
    expect(MIN_PARTIDOS_CUBIERTO).toBe(2)
  })
})
