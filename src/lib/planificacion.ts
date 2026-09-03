// ── Planificación de fin de semana (la hoja de Excel, pero nativa) ─────
// Lógica pura: qué partidos entran en el rango, qué jugadores nuestros
// juegan cada uno, quién lo ve y por dónde. Sin React ni navegador, para
// poder probarla (tests/planificacion.test.ts).

import type { Player, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, ScoutingPlayer } from '../types'
import { teamMatchKind } from './equipos'
import { fechaLocal, lunesDe, parseDia, sumarDias } from './fechas'

export type Via = 'tv' | 'campo'

export interface ScoutPlanificacion {
  scout: string
  status: 'pendiente' | 'visto'
  via: Via
  /** true si viene de scouting_match_scouts (editable por scout); false si solo está en assigned_to */
  real: boolean
}

export interface FilaPlanificacion {
  matchId: string
  match: ScoutingMatch
  fecha: string            // AAAA-MM-DD
  diaLabel: string         // «Viernes», «Sábado»…
  hora: string             // «HH:MM» o ''
  partido: string          // «Home - Away»
  nuestros: Player[]
  captacion: ScoutingPlayer[]
  /** Nombres de los nuestros separados por coma, o «Captación» si el partido es solo de scouting */
  jugadorTexto: string
  personas: string[]
  scouts: ScoutPlanificacion[]
  via: string              // «tv», «campo», «tv / campo»…
  status: 'pendiente' | 'visto'
  notas: string
}

export interface Rango { desde: string; hasta: string }

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function diaSemanaLabel(iso: string): string {
  return DIAS[parseDia(iso).getDay()]
}

export function viaDeModo(modo?: 'video' | 'campo'): Via {
  return modo === 'campo' ? 'campo' : 'tv'
}

export function modoDeVia(via: Via): 'video' | 'campo' {
  return via === 'campo' ? 'campo' : 'video'
}

/**
 * Viernes-domingo. Lunes a jueves → el fin de semana que viene; viernes a
 * domingo → el que está en curso. `offset` en semanas.
 */
export function rangoFinDeSemana(base: Date, offset = 0): Rango {
  const lunes = lunesDe(base, offset)
  const viernes = new Date(lunes)
  viernes.setDate(lunes.getDate() + 4)
  const desde = fechaLocal(viernes)
  return { desde, hasta: sumarDias(desde, 2) }
}

/**
 * Semana de planificación: de MARTES a LUNES de la semana siguiente (así el
 * lunes, día de partidos aplazados y de cerrar el fin de semana, va con la
 * semana que termina, no con la que empieza). Un lunes pertenece a la
 * semana que arrancó el martes anterior. `offset` en semanas.
 */
export function rangoSemana(base: Date, offset = 0): Rango {
  const lunes = lunesDe(base, offset)
  // Si `base` es lunes, su semana de planificación empezó el martes de hace 6 días
  const martes = new Date(lunes)
  martes.setDate(lunes.getDate() + (base.getDay() === 1 ? -6 : 1))
  const desde = fechaLocal(martes)
  return { desde, hasta: sumarDias(desde, 6) }
}

/** «5-7 septiembre» o «30 septiembre - 2 octubre» */
export function tituloRango(r: Rango): string {
  const a = parseDia(r.desde), b = parseDia(r.hasta)
  const ma = MESES[a.getMonth()], mb = MESES[b.getMonth()]
  if (ma === mb && a.getFullYear() === b.getFullYear()) return `${a.getDate()}-${b.getDate()} ${ma}`
  return `${a.getDate()} ${ma} - ${b.getDate()} ${mb}`
}

/** ¿Juega alguno de los clubes del jugador en este partido? (mismo club, cualquier categoría) */
function juegaEn(p: Player, m: ScoutingMatch): boolean {
  return p.clubs.some(c => teamMatchKind(c.name, m.homeTeam) === 'exacto' || teamMatchKind(c.name, m.awayTeam) === 'exacto')
}

export function construirPlanificacion({ desde, hasta, scoutingMatches, matchScouts, matchPlayers, scoutingPlayers, players }: {
  desde: string
  hasta: string
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  matchPlayers: ScoutingMatchPlayer[]
  scoutingPlayers: ScoutingPlayer[]
  players: Player[]
}): FilaPlanificacion[] {
  const scoutsPorPartido: Record<string, ScoutingMatchScout[]> = {}
  for (const s of matchScouts) (scoutsPorPartido[s.matchId] ??= []).push(s)
  for (const l of Object.values(scoutsPorPartido)) l.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const jugadoresPorPartido: Record<string, string[]> = {}
  for (const mp of matchPlayers) (jugadoresPorPartido[mp.matchId] ??= []).push(mp.playerId)
  const scoutingById = new Map(scoutingPlayers.map(p => [p.id, p]))

  const visibles = players.filter(p => !p.hiddenFromManagement)

  const filas = scoutingMatches
    .filter(m => m.date >= desde && m.date <= hasta)
    .map((m): FilaPlanificacion => {
      const nuestros = visibles.filter(p => juegaEn(p, m)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
      const captacion = (jugadoresPorPartido[m.id] ?? [])
        .map(id => scoutingById.get(id))
        .filter((p): p is ScoutingPlayer => !!p)

      const reales = scoutsPorPartido[m.id] ?? []
      const scouts: ScoutPlanificacion[] = reales.length > 0
        ? reales.map(s => ({ scout: s.scout, status: s.status, via: viaDeModo(s.viewMode ?? m.viewMode), real: true }))
        : (m.assignedTo ?? '').split('/').map(s => s.trim()).filter(Boolean)
          .map(scout => ({ scout, status: m.status === 'visto' ? 'visto' : 'pendiente', via: viaDeModo(m.viewMode), real: false }))

      const vias = scouts.length > 0
        ? [...new Set(scouts.map(s => s.via))]
        : m.viewMode ? [viaDeModo(m.viewMode)] : []

      return {
        matchId: m.id,
        match: m,
        fecha: m.date,
        diaLabel: diaSemanaLabel(m.date),
        hora: m.time ?? '',
        partido: `${m.homeTeam} - ${m.awayTeam}`,
        nuestros,
        captacion,
        jugadorTexto: nuestros.length > 0 ? nuestros.map(p => p.name).join(', ') : 'Captación',
        personas: scouts.map(s => s.scout),
        scouts,
        via: vias.join(' / '),
        status: m.status === 'visto' ? 'visto' : 'pendiente',
        notas: m.notes ?? '',
      }
    })

  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99') || a.partido.localeCompare(b.partido, 'es'))
}

export const CABECERAS_PLANIFICACION = ['Día', 'Hora', 'Partido', 'Jugador', 'Persona', 'Vía', 'Estado', 'Notas']

export function planificacionACsv(filas: FilaPlanificacion[]): unknown[][] {
  return filas.map(f => [f.diaLabel, f.hora, f.partido, f.jugadorTexto, f.personas.join(' / '), f.via, f.status, f.notas])
}

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Colores suaves por día, como en la hoja
const COLOR_DIA: Record<string, string> = { Viernes: '#fdf3d8', Sábado: '#e4e0f3', Domingo: '#dcebf7' }

/** HTML autocontenido de la hoja, listo para window.print() (patrón de informeMensual) */
export function htmlPlanificacion(filas: FilaPlanificacion[], titulo: string): string {
  const cuerpo = filas.map(f => `
    <tr class="${f.status === 'visto' ? 'visto' : ''}">
      <td class="dia" style="background:${COLOR_DIA[f.diaLabel] ?? '#f1f5f9'}">${esc(f.diaLabel)}</td>
      <td class="c">${esc(f.hora)}</td>
      <td class="c">${esc(f.partido)}</td>
      <td class="c${f.nuestros.length ? ' b' : ''}">${esc(f.jugadorTexto)}</td>
      <td class="c">${esc(f.personas.join(' / ') || '-')}</td>
      <td class="c">${esc(f.via || '-')}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { background: #e2e8f0; font-weight: 700; padding: 4px 6px; border: 0.5pt solid #cbd5e1; }
  td { padding: 3px 6px; border: 0.5pt solid #cbd5e1; }
  td.dia { font-weight: 500; }
  td.c { text-align: center; }
  td.b { font-weight: 700; }
  tr.visto td { text-decoration: line-through; color: #64748b; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head>
<body>
<h1>${esc(titulo)}</h1>
<table>
  <thead><tr><th>Día</th><th>Hora</th><th>Partido</th><th>Jugador</th><th>Persona</th><th>Vía</th></tr></thead>
  <tbody>${cuerpo || '<tr><td colspan="6" class="c">Sin partidos en este rango</td></tr>'}</tbody>
</table>
<script>window.onload = function () { window.print() }</script>
</body></html>`
}
