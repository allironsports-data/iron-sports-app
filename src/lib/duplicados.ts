import { norm } from './texto'
import { teamsAlike } from './equipos'
import { parseDia } from './fechas'
import type { ScoutingPlayer, ScoutingMatch } from '../types'

// ── Aviso de duplicados al dar de alta ───────────────────────────────
//
// Antes de crear un jugador o un partido se mira si ya hay uno parecido
// en la BBDD. No bloquea nada: solo enseña candidatos para que quien
// escribe decida. Por eso las reglas son «generosas» (mejor un aviso de
// más que dos fichas del mismo chaval).

/** Distancia de Levenshtein clásica (para erratas: «Fernandez» ↔ «Fernandes»). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + coste)
    }
    prev = cur
  }
  return prev[b.length]
}

/** Palabras «con sustancia» del nombre: ≥ 3 letras (fuera «de», «el»…). */
function tokens(nombreNorm: string): string[] {
  return nombreNorm.split(/[^a-z0-9]+/).filter(t => t.length >= 3)
}

export type ParecidoJugador = {
  player: ScoutingPlayer
  /** 'exacto' = mismo nombre normalizado; 'parecido' = por tokens o erratas */
  tipo: 'exacto' | 'parecido'
  mismoEquipo: boolean
}

/**
 * Jugadores que podrían ser el que se está creando.
 * Coincide si: el nombre normalizado es igual; o todas las palabras de uno
 * (≥ 3 letras) están en el otro («Iker Fernández» ⊂ «Iker Fernández Gómez»);
 * o, para nombres largos (≥ 8 chars), hay ≤ 2 erratas de distancia.
 * Orden: exactos > mismo equipo > resto.
 */
export function buscarJugadoresParecidos(
  nombre: string,
  equipo: string | undefined,
  jugadores: ScoutingPlayer[],
  max = 3,
): ParecidoJugador[] {
  const n = norm(nombre).replace(/\s+/g, ' ')
  if (!n) return []
  const toksNuevo = tokens(n)
  const out: ParecidoJugador[] = []
  for (const p of jugadores) {
    const pn = norm(p.fullName).replace(/\s+/g, ' ')
    if (!pn) continue
    let tipo: ParecidoJugador['tipo'] | null = null
    if (pn === n) tipo = 'exacto'
    else {
      const toksExist = tokens(pn)
      const subconjunto = toksNuevo.length > 0 && toksExist.length > 0 && (
        toksNuevo.every(t => toksExist.includes(t)) || toksExist.every(t => toksNuevo.includes(t))
      )
      if (subconjunto) tipo = 'parecido'
      else if (n.length >= 8 && Math.abs(n.length - pn.length) <= 2 && levenshtein(n, pn) <= 2) tipo = 'parecido'
    }
    if (!tipo) continue
    out.push({ player: p, tipo, mismoEquipo: !!equipo && !!p.team && teamsAlike(equipo, p.team) })
  }
  const peso = (x: ParecidoJugador) => (x.tipo === 'exacto' ? 2 : 0) + (x.mismoEquipo ? 1 : 0)
  return out.sort((a, b) => peso(b) - peso(a)).slice(0, max)
}

/**
 * Partidos que podrían ser el que se está creando: mismos dos equipos
 * (en cualquier orden, comparados a nivel club) y fecha a ±3 días.
 * Los más cercanos en fecha primero.
 */
export function buscarPartidosParecidos(
  home: string,
  away: string,
  date: string,
  partidos: ScoutingMatch[],
  max = 3,
): ScoutingMatch[] {
  if (!home.trim() || !away.trim()) return []
  const t0 = date ? parseDia(date).getTime() : NaN
  const dias = (m: ScoutingMatch) => {
    const t = parseDia(m.date).getTime()
    if (isNaN(t) || isNaN(t0)) return Infinity
    return Math.abs(Math.round((t - t0) / 86400000))
  }
  return partidos
    .filter(m => {
      const directo = teamsAlike(m.homeTeam, home) && teamsAlike(m.awayTeam, away)
      const cruzado = teamsAlike(m.homeTeam, away) && teamsAlike(m.awayTeam, home)
      return (directo || cruzado) && dias(m) <= 3
    })
    .sort((a, b) => dias(a) - dias(b))
    .slice(0, max)
}
