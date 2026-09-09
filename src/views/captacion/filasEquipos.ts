import { useMemo } from 'react'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch } from '../../types'
import type { Equipo as EquipoCatalogo } from '../../lib/db'
import { SIN_ZONA, zonaDe, clubBase, normEquipo, type Zona } from '../../lib/zonas'
import { ALL_ASSESSMENTS, normConclusion } from './helpers'

// ── Pestaña EQUIPOS · control de cobertura ───────────────────────────
// Para qué: saber, zona a zona y categoría a categoría, de qué equipos
// tenemos control real y de cuáles no. «Control» aquí no es una opinión:
// son jugadores apuntados, informes escritos y partidos vistos.
//
//   ★ relevante → este equipo nos importa
//   ✓ cubierto  → ya lo hemos cubierto esta temporada
//   y al lado, lo que dicen los datos: jugadores, informes y partidos.
//
// Las dos marcas se ponen a mano, pero además se DEDUCEN de los datos
// (ver reglaRelevante / reglaCubierto más abajo): un equipo con 2+ jugadores
// en Llamar es relevante, y uno visto en 2+ partidos está cubierto. La marca
// deducida solo se enseña; se guarda cuando se pulsa «Aplicar» en la pestaña.

/** Temporada actual: del 1 de julio al 30 de junio */
export function inicioTemporada(hoy = new Date()): string {
  // getMonth() es 0-based: julio = 6. Del 1 de julio en adelante ya estamos
  // en la temporada nueva; en junio seguimos en la que acaba.
  const y = hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1
  return `${y}-07-01`
}

/** «2026-07-01» → «26-27» */
export function etiquetaTemporada(desde: string): string {
  const y = Number(desde.slice(0, 4))
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`
}

export interface FilaEquipo {
  nombre: string
  /** nombre normalizado: la clave con la que se cruza todo */
  clave: string
  club: string
  categoria: string
  zona: string
  relevante: boolean
  cubierto: boolean
  enCatalogo: boolean
  jugadores: number
  plantilla: ScoutingPlayer[]
  informes: number
  /** Jugadores suyos «en Llamar»: con esa etiqueta o con algún informe de veredicto Llamar */
  enLlamar: number
  /** Quiénes son, para poder enseñar POR QUÉ el equipo sale como relevante */
  enLlamarIds: string[]
  partidos: number
  partidosHist: number
  ultimoPartido?: string
}

export const SIN_CATEGORIA = 'Sin categoría'


/** Todo lo que sabemos de cada equipo: lo que tú marcas y lo que dicen los datos.
 *  Función pura (sin React) para poder probarla sin montar componentes. */
export function calcularFilasEquipos(
  equipos: EquipoCatalogo[],
  scoutingPlayers: ScoutingPlayer[],
  scoutingReports: ScoutingReport[],
  scoutingMatches: ScoutingMatch[],
  clubZonas: Record<string, Zona>,
  desde: string,
): FilaEquipo[] {
  // ⚠ Todo se cruza por NOMBRE NORMALIZADO, nunca por el texto tal cual.
  // Los partidos guardan el equipo como lo escribió cada scout («Castellon
  // Juv a») y el catálogo lo tiene bien («Castellón Juv A»): comparando
  // literales, la ficha del equipo no encontraba sus propios partidos.
  const porEquipo = new Map<string, { nombres: Map<string, number>; jugadores: ScoutingPlayer[] }>()
  for (const p of scoutingPlayers) {
    const raw = (p.team ?? '').trim()
    const k = normEquipo(raw)
    if (!k) continue
    let e = porEquipo.get(k)
    if (!e) { e = { nombres: new Map(), jugadores: [] }; porEquipo.set(k, e) }
    e.jugadores.push(p)
    e.nombres.set(raw, (e.nombres.get(raw) ?? 0) + 1)
  }

  const informesPorJugador: Record<string, number> = {}
  // Jugadores con algún informe cuyo veredicto es «Llamar» (Firmar legado incluido:
  // de eso se encarga normConclusion). Cuenta el jugador, no el nº de informes.
  const conInformeLlamar = new Set<string>()
  for (const r of scoutingReports) {
    informesPorJugador[r.playerId] = (informesPorJugador[r.playerId] ?? 0) + 1
    if (normConclusion(r.conclusion) === 'Llamar') conInformeLlamar.add(r.playerId)
  }

  const partidos = new Map<string, { temporada: number; total: number; ultimo?: string }>()
  const anota = (equipo: string | undefined, fecha: string) => {
    const k = normEquipo(equipo)
    if (!k) return
    const e = partidos.get(k) ?? { temporada: 0, total: 0 }
    e.total++
    if (fecha >= desde) e.temporada++
    if (!e.ultimo || fecha > e.ultimo) e.ultimo = fecha
    partidos.set(k, e)
  }
  for (const m of scoutingMatches) { anota(m.homeTeam, m.date); anota(m.awayTeam, m.date) }

  // Nombre que se enseña: el del catálogo si está; si no, la grafía que
  // más se repite entre los jugadores.
  const delCatalogo = new Map<string, EquipoCatalogo>()
  for (const e of equipos) delCatalogo.set(normEquipo(e.nombre), e)

  const claves = new Set<string>([...delCatalogo.keys(), ...porEquipo.keys()])
  const out: FilaEquipo[] = []
  for (const k of claves) {
    const cat = delCatalogo.get(k)
    const grupo = porEquipo.get(k)
    const jug = grupo?.jugadores ?? []
    const masUsado = grupo
      ? [...grupo.nombres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      : undefined
    const nombre = cat?.nombre ?? masUsado ?? k
    const pt = partidos.get(k)
    const enLlamarIds = jug
      .filter(p => p.assessment === 'Llamar' || conInformeLlamar.has(p.id))
      .map(p => p.id)
    out.push({
      nombre,
      clave: k,
      club: cat?.club ?? clubBase(nombre),
      categoria: cat?.categoria || SIN_CATEGORIA,
      zona: (cat?.zona as string) || zonaDe(nombre, clubZonas) || SIN_ZONA,
      relevante: cat?.relevante ?? false,
      cubierto: cat?.cubierto ?? false,
      enCatalogo: !!cat,
      jugadores: jug.length,
      // Los valorados primero, y entre ellos por orden de interés
      // (Llamar, Seguir, Decidir…). Sin valorar, al final: si no se hace
      // así, indexOf devuelve -1 y los sin valorar salían los primeros.
      plantilla: [...jug].sort((a, b) => {
        const orden = (x?: string) => {
          const i = ALL_ASSESSMENTS.indexOf(x as ScoutingAssessment)
          return i === -1 ? ALL_ASSESSMENTS.length : i
        }
        return orden(a.assessment) - orden(b.assessment) || a.fullName.localeCompare(b.fullName)
      }),
      informes: jug.reduce((n, p) => n + (informesPorJugador[p.id] ?? 0), 0),
      enLlamar: enLlamarIds.length,
      enLlamarIds,
      partidos: pt?.temporada ?? 0,
      partidosHist: pt?.total ?? 0,
      ultimoPartido: pt?.ultimo,
    })
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** La misma cuenta, memorizada para las vistas */
export function useFilasEquipos(
  equipos: EquipoCatalogo[],
  scoutingPlayers: ScoutingPlayer[],
  scoutingReports: ScoutingReport[],
  scoutingMatches: ScoutingMatch[],
  clubZonas: Record<string, Zona>,
  desde: string,
): FilaEquipo[] {
  return useMemo(
    () => calcularFilasEquipos(equipos, scoutingPlayers, scoutingReports, scoutingMatches, clubZonas, desde),
    [equipos, scoutingPlayers, scoutingReports, scoutingMatches, clubZonas, desde],
  )
}

/** Semáforo de control. No es una opinión: sale de los datos. */
export function semaforoEquipo(f: FilaEquipo, partidos: number): { cls: string; txt: string } {
  if (!f.relevante) return { cls: 'bg-slate-100 text-slate-400 border-slate-200', txt: '—' }
  if (f.jugadores === 0) return { cls: 'bg-red-100 text-red-700 border-red-200', txt: 'sin nadie' }
  if (partidos === 0) return { cls: 'bg-amber-100 text-amber-700 border-amber-200', txt: 'sin partidos' }
  if (f.informes === 0) return { cls: 'bg-amber-100 text-amber-700 border-amber-200', txt: 'sin informes' }
  return { cls: 'bg-green-100 text-green-700 border-green-200', txt: 'controlado' }
}

// ── Reglas automáticas ───────────────────────────────────────────────
// Umbrales acordados: se enseñan solas y se guardan con «Aplicar».

/** Partidos vistos a partir de los cuales damos el equipo por cubierto */
export const MIN_PARTIDOS_CUBIERTO = 2
/** Jugadores «en Llamar» a partir de los cuales el equipo nos interesa */
export const MIN_LLAMAR_RELEVANTE = 2

/** ¿La regla dice que es relevante? (independiente de la marca manual) */
export function reglaRelevante(f: FilaEquipo): boolean {
  return f.enLlamar >= MIN_LLAMAR_RELEVANTE
}

/** ¿La regla dice que está cubierto? `partidos` según la vista (temporada o histórico) */
export function reglaCubierto(partidos: number): boolean {
  return partidos >= MIN_PARTIDOS_CUBIERTO
}
