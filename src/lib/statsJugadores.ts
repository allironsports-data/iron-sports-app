import type { ScoutingPlayer, ScoutingReport, FirmasEntry, ScoutingAssessment } from '../types'
import { zonaDe, SIN_ZONA, type Zona } from './zonas'
import { separarNacionalidades } from './paises'

// ── Estadísticas de la base de jugadores de Captación ───────────────
// Para la pestaña Admin → Stats Captación → Base de datos: de qué
// agencias, nacionalidades, posiciones, categorías, zonas y quintas son
// los jugadores, y cuántos de cada grupo están en Llamar o en el pipeline.
// Lógica pura (sin React) para poder probarla.

export interface Grupo {
  nombre: string
  jugadores: number
  /** Jugadores por assessment («Sin valorar» para los que no tienen) */
  por: Record<string, number>
  llamar: number
  seguir: number
  sinValorar: number
  /** Jugadores con ficha en el pipeline de firmas */
  pipeline: number
  informes: number
  /** % de jugadores del grupo en Llamar (0-100) */
  pctLlamar: number
}

export interface StatsJugadores {
  total: number
  conAgencia: number
  conNacionalidad: number
  conFechaNac: number
  conEquipo: number
  conCategoria: number
  enLlamar: number
  enPipeline: number
  dobleNacionalidad: number
  agencias: Grupo[]
  nacionalidades: Grupo[]
  posiciones: Grupo[]
  categorias: Grupo[]
  zonas: Grupo[]
  quintas: Grupo[]
  pies: Grupo[]
  equipos: Grupo[]
  /** Nacionalidades distintas (sin contar «Sin nacionalidad») */
  nNacionalidades: number
  nAgencias: number
}

const SIN = 'Sin dato'

function nuevoGrupo(nombre: string): Grupo {
  return { nombre, jugadores: 0, por: {}, llamar: 0, seguir: 0, sinValorar: 0, pipeline: 0, informes: 0, pctLlamar: 0 }
}

export function calcularStatsJugadores(
  players: ScoutingPlayer[],
  reports: ScoutingReport[],
  firmas: FirmasEntry[],
  clubZonas: Record<string, Zona>,
): StatsJugadores {
  const informesPor = new Map<string, number>()
  for (const r of reports) informesPor.set(r.playerId, (informesPor.get(r.playerId) ?? 0) + 1)
  const enPipeline = new Set<string>()
  for (const f of firmas) if (f.scoutingPlayerId) enPipeline.add(f.scoutingPlayerId)

  const agencias = new Map<string, Grupo>(), nacionalidades = new Map<string, Grupo>(), posiciones = new Map<string, Grupo>()
  const categorias = new Map<string, Grupo>(), zonas = new Map<string, Grupo>(), quintas = new Map<string, Grupo>()
  const pies = new Map<string, Grupo>(), equipos = new Map<string, Grupo>()
  const suma = (m: Map<string, Grupo>, clave: string, p: ScoutingPlayer) => {
    let g = m.get(clave)
    if (!g) { g = nuevoGrupo(clave); m.set(clave, g) }
    g.jugadores++
    const a: string = p.assessment ?? 'Sin valorar'
    g.por[a] = (g.por[a] ?? 0) + 1
    if (p.assessment === 'Llamar') g.llamar++
    if (p.assessment === 'Seguir') g.seguir++
    if (!p.assessment) g.sinValorar++
    if (enPipeline.has(p.id)) g.pipeline++
    g.informes += informesPor.get(p.id) ?? 0
  }

  let conAgencia = 0, conNacionalidad = 0, conFechaNac = 0, conEquipo = 0, conCategoria = 0, enLlamar = 0, dobleNacionalidad = 0, pipeline = 0
  for (const p of players) {
    const ag = p.agency?.trim()
    if (ag) conAgencia++
    suma(agencias, ag || SIN, p)
    const nacs = separarNacionalidades(p.nationality)
    if (nacs.length) conNacionalidad++
    if (nacs.length > 1) dobleNacionalidad++
    // Un jugador con dos nacionalidades cuenta en las dos
    if (nacs.length === 0) suma(nacionalidades, SIN, p)
    for (const n of nacs) suma(nacionalidades, n, p)
    if (p.birthdate) conFechaNac++
    suma(quintas, p.birthdate ? p.birthdate.slice(0, 4) : SIN, p)
    if (p.team?.trim()) conEquipo++
    suma(equipos, p.team?.trim() || SIN, p)
    if (p.categoria?.trim()) conCategoria++
    suma(categorias, p.categoria?.trim() || SIN, p)
    suma(posiciones, p.position1?.trim() || SIN, p)
    suma(pies, p.foot?.trim() || SIN, p)
    suma(zonas, p.team ? (zonaDe(p.team, clubZonas) ?? SIN_ZONA) : SIN, p)
    if (p.assessment === 'Llamar') enLlamar++
    if (enPipeline.has(p.id)) pipeline++
  }

  const lista = (m: Map<string, Grupo>, orden: 'jugadores' | 'nombre' = 'jugadores') => {
    const out = [...m.values()]
    for (const g of out) g.pctLlamar = g.jugadores ? Math.round(100 * g.llamar / g.jugadores) : 0
    return out.sort((a, b) => {
      // «Sin dato» siempre al final
      if (a.nombre === SIN) return 1
      if (b.nombre === SIN) return -1
      return orden === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es') : b.jugadores - a.jugadores || a.nombre.localeCompare(b.nombre, 'es')
    })
  }

  return {
    total: players.length,
    conAgencia, conNacionalidad, conFechaNac, conEquipo, conCategoria, enLlamar, enPipeline: pipeline, dobleNacionalidad,
    agencias: lista(agencias),
    nacionalidades: lista(nacionalidades),
    posiciones: lista(posiciones),
    categorias: lista(categorias),
    zonas: lista(zonas),
    quintas: lista(quintas, 'nombre'),
    pies: lista(pies),
    equipos: lista(equipos),
    nNacionalidades: [...nacionalidades.keys()].filter(k => k !== SIN).length,
    nAgencias: [...agencias.keys()].filter(k => k !== SIN).length,
  }
}

export const SIN_DATO = SIN

/** Orden de un listado de grupos por una columna */
export type OrdenGrupo = 'jugadores' | 'llamar' | 'pctLlamar' | 'pipeline' | 'informes'
export function ordenarGrupos(grupos: Grupo[], orden: OrdenGrupo, minJugadores = 1): Grupo[] {
  return grupos
    .filter(g => g.nombre !== SIN && g.jugadores >= minJugadores)
    .sort((a, b) => b[orden] - a[orden] || b.jugadores - a.jugadores || a.nombre.localeCompare(b.nombre, 'es'))
}

export const ASSESSMENTS_ORDEN: (ScoutingAssessment | 'Sin valorar')[] = ['Llamar', 'Seguir', 'Decidir', 'Basque', 'Visto', 'Descartado', 'Sin valorar']
