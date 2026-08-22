import { normClave as norm } from './texto'

import type { ScoutingPlayer } from '../types'

// ── Alineaciones pegadas ─────────────────────────────────────────────
// Copias la alineación de Sofascore, Flashscore, BeSoccer o de donde sea,
// la pegas, y la app saca los nombres y los cruza con la base de datos de
// Captación. No hace falta que el formato sea ninguno en concreto: se
// limpian dorsales, minutos, notas, iconos y códigos de posición.


const CABECERAS = /^(alineaci|once|suplent|entrenador|banquillo|titular|formaci|estad|arbitr|árbitr|sustitu|cambio|gol|amarilla|roja|tarjeta|posesi|tiro|falta|corner|córner|fuera de juego|paradas|local|visitante|equipo|minuto|resumen|previa|clasificaci|jornada|lesion|no convocad|reserva|técnico|tecnico|coach)/i

// Después de «Entrenador» viene su nombre, que no es un jugador
const CABECERA_ENTRENADOR = /^(entrenador|técnico|tecnico|coach)/i

// Códigos de posición que algunas webs pegan detrás del nombre
const POSICION_COLA = /\s+(POR|GK|DFC|DFI|DFD|LI|LD|MCD|MCO|MC|MP|EI|ED|DC|SD|DF|MF|FW|SUP|ENT)$/

function limpiarLinea(raw: string): string | null {
  let s = raw.replace(/\t+/g, ' ').trim()
  if (!s) return null
  if (CABECERAS.test(s)) return null
  s = s.replace(/^\d{1,2}\s*[.)\-–]?\s*/, '')      // dorsal delante
  s = s.replace(/\(([^)]*)\)/g, ' ')                // (45'), (c)…
  s = s.replace(/\d{1,3}\s*['´’‘]/g, ' ')           // minutos: 45' 90'
  s = s.replace(/[⚽🟨🟥🅨🅡↑↓⇅→←]/g, ' ')            // goles, tarjetas, cambios
  s = s.replace(/\b\d+[.,]\d+\b/g, ' ')             // notas: 7.4
  s = s.replace(/\b\d+\b/g, ' ')                    // números sueltos
  s = s.replace(/\s{2,}/g, ' ').trim()
  s = s.replace(POSICION_COLA, '').trim()
  s = s.replace(/^[·•\-–|]+\s*/, '').replace(/\s*[·•\-–|]+$/, '').trim()
  if (s.length < 3) return null
  if (!/^[\p{L}][\p{L}\s.'’-]*$/u.test(s)) return null
  const palabras = s.split(/\s+/)
  if (palabras.length === 1 && s.length < 4) return null
  if (palabras.length > 5) return null               // eso ya es una frase
  return s
}

/**
 * Nombres de jugador encontrados en un texto pegado, sin repetidos.
 * `noJugadores` sirve para descartar los nombres de los equipos, que las
 * webs meten entre los jugadores y acababan colándose como fichas nuevas.
 */
export function parsearAlineacion(texto: string, noJugadores: string[] = [], equiposDelPartido: string[] = []): string[] {
  const veto = new Set(noJugadores.map(t => norm(t)).filter(Boolean))
  // De los dos equipos del partido se vetan también sus palabras sueltas
  // («Deportivo» de «Deportivo de La Coruña»); del resto de clubes conocidos
  // solo el nombre completo, para no cargarse apellidos como «Villar».
  equiposDelPartido.forEach(t => norm(t).split(' ').forEach(w => { if (w.length > 3) veto.add(w) }))
  const vistos = new Set<string>()
  const out: string[] = []
  let saltarSiguiente = false
  for (const linea of texto.split(/\r?\n/)) {
    if (CABECERA_ENTRENADOR.test(linea.trim())) { saltarSiguiente = true; continue }
    const n = limpiarLinea(linea)
    if (!n) continue
    if (saltarSiguiente) { saltarSiguiente = false; continue }   // el entrenador
    const k = n.toLowerCase()
    if (vistos.has(k)) continue
    if (veto.has(norm(n))) continue          // es el nombre de un equipo
    vistos.add(k)
    out.push(n)
  }
  return out
}

export type Certeza = 'exacto' | 'probable' | 'ambiguo' | 'nuevo'

export interface Emparejamiento {
  nombre: string
  player: ScoutingPlayer | null
  certeza: Certeza
  candidatos?: ScoutingPlayer[]
}

/**
 * Busca a quién corresponde un nombre pegado.
 * Entiende «M. Rivas», «Rivas Mario» y «Mario Rivas», y ante dos jugadores
 * con el mismo nombre se queda con el del equipo del partido.
 */
export function emparejar(
  nombre: string,
  jugadores: ScoutingPlayer[],
  equipoPreferido: string | undefined,
  mismoEquipo: (a?: string, b?: string) => boolean,
): Emparejamiento {
  const n = norm(nombre)
  const tokens = n.split(' ')

  const exactos = jugadores.filter(p => norm(p.fullName) === n)
  if (exactos.length === 1) return { nombre, player: exactos[0], certeza: 'exacto' }
  if (exactos.length > 1) {
    const delEquipo = exactos.filter(p => mismoEquipo(p.team, equipoPreferido))
    if (delEquipo.length === 1) return { nombre, player: delEquipo[0], certeza: 'exacto' }
    return { nombre, player: null, certeza: 'ambiguo', candidatos: exactos.slice(0, 4) }
  }

  // «M. Rivas» = inicial + apellidos; «Rivas Mario» = orden invertido
  const esInicial = tokens.length >= 2 && tokens[0].length === 1
  const apellidos = esInicial ? tokens.slice(1) : tokens
  let cands = jugadores.filter(p => {
    const pt = norm(p.fullName).split(' ')
    if (!apellidos.every(a => pt.includes(a))) return false
    return esInicial ? pt[0]?.[0] === tokens[0] : true
  })
  if (cands.length > 1) {
    const delEquipo = cands.filter(p => mismoEquipo(p.team, equipoPreferido))
    if (delEquipo.length >= 1) cands = delEquipo
  }
  if (cands.length === 1) return { nombre, player: cands[0], certeza: 'probable' }
  if (cands.length > 1) return { nombre, player: null, certeza: 'ambiguo', candidatos: cands.slice(0, 4) }
  return { nombre, player: null, certeza: 'nuevo' }
}
