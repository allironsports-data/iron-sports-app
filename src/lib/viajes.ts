// ── Viajes: a quién visitar ──────────────────────────────────────────
//
// Un viaje es un evento de tipo «Viaje» con destino (ciudad) y varios
// días. A partir de él la app sugiere a qué jugadores del pipeline de
// Firmar se puede visitar: primero los que juegan en esa ciudad y, después,
// los del resto de la zona. Lógica pura.
//
// Los clubes no tienen ciudad en la base: la tabla de abajo cubre las
// ciudades con más clubes. Lo que no esté cae en «la zona» (lib/zonas.ts).

import type { FirmasEntry, FirmasStatus } from '../types'
import { sumarDias } from './fechas'
import { norm } from './texto'
import { clubBase, zonaDe, type Zona } from './zonas'

// Claves ya normalizadas (minúsculas, sin acentos): club base, sin filial ni categoría.
const CLUBES_POR_CIUDAD: Record<string, string[]> = {
  'Sevilla': ['sevilla', 'sevilla atletico', 'betis', 'real betis', 'betis deportivo', 'utrera', 'dos hermanas', 'calavera', 'san jose'],
  'Málaga': ['malaga', 'atletico malagueno', 'malagueno', 'san felix', 'puerto malagueno', 'tiro pichon', 'marbella', 'antequera'],
  'Granada': ['granada', 'recreativo granada', 'granada 74', 'arenas armilla'],
  'Cádiz': ['cadiz', 'cadiz mirandilla', 'xerez', 'xerez deportivo', 'san fernando', 'algeciras', 'balon de cadiz'],
  'Córdoba': ['cordoba', 'seneca'],
  'Almería': ['almeria', 'la canada'],
  'Huelva': ['recreativo', 'recreativo huelva', 'recre'],
  'Madrid': ['real madrid', 'atletico madrid', 'rayo vallecano', 'rayo vall', 'rayo', 'getafe', 'leganes', 'alcorcon',
    'rayo majadahonda', 'fuenlabrada', 'mostoles', 'adarve', 'las rozas', 'navalcarnero', 'colonia moscardo', 'moscardo',
    'sanse', 'alcala', 'rayo alcobendas'],
  'Barcelona': ['barcelona', 'fc barcelona', 'espanyol', 'damm', 'cornella', 'europa', 'sant andreu', 'badalona',
    'badalona futur', 'fundacio badalona', 'hospitalet', 'grama', 'sant cugat', 'sabadell', 'terrassa', 'racing sarria'],
  'Girona': ['girona', 'olot', 'peralada'],
  'Tarragona': ['nastic', 'gimnastic', 'reus'],
  'Lleida': ['lleida', 'atletic lleida', 'segre', 'atletic segre'],
  'Zaragoza': ['zaragoza', 'racing zaragoza', 'utebo', 'ejea'],
  'Valencia': ['valencia', 'valencia fund', 'ida valencia', 'levante', 'torrent', 'patacona', 'alboraya', 'torre levante', 'quart', 'almassera'],
  'Castellón': ['villarreal', 'villarreal roda', 'roda', 'castellon'],
  'Alicante': ['hercules', 'intercity', 'elche', 'celtic elche', 'eldense', 'elda', 'kelme', 'torrellano', 'alcoyano', 'orihuela', 'la nucia'],
  'Murcia': ['murcia', 'real murcia', 'ucam', 'ucam murcia', 'cartagena', 'lorca'],
  'Bilbao': ['athletic', 'athletic club', 'bilbao athletic', 'basconia', 'danok bat', 'santutxu', 'barakaldo', 'leioa', 'arenas', 'sestao', 'amorebieta'],
  'San Sebastián': ['real sociedad', 'sanse', 'antiguoko', 'real union', 'eibar'],
  'Vitoria': ['alaves', 'aurrera vitoria'],
  'Pamplona': ['osasuna', 'osasuna promesas', 'txantrea', 'oberena'],
  'Santander': ['racing', 'racing santander', 'rayo cantabria', 'bansander'],
  'Gijón': ['sporting', 'sporting gijon', 'roces'],
  'Oviedo': ['oviedo', 'real oviedo', 'vetusta'],
  'A Coruña': ['deportivo', 'deportivo coruna', 'fabril', 'montaneros'],
  'Vigo': ['celta', 'celta fortuna', 'celta vigo', 'coruxo', 'val minor'],
  'Valladolid': ['valladolid', 'real valladolid', 'promesas'],
  'Palma': ['mallorca', 'atletico baleares', 'san francisco', 'penya arrabal'],
  'Las Palmas': ['las palmas', 'las palmas atletico'],
  'Tenerife': ['tenerife'],
}

const CIUDAD_POR_CLUB = new Map<string, string>()
for (const [ciudad, clubes] of Object.entries(CLUBES_POR_CIUDAD)) {
  for (const c of clubes) if (!CIUDAD_POR_CLUB.has(c)) CIUDAD_POR_CLUB.set(c, ciudad)
}

/** Ciudades que la app conoce, para el desplegable del destino */
export const CIUDADES_CONOCIDAS = Object.keys(CLUBES_POR_CIUDAD).sort((a, b) => a.localeCompare(b))

/** Ciudad de un equipo («Betis Juv A» → «Sevilla»), si se conoce */
export function ciudadDe(equipo?: string): string | undefined {
  return CIUDAD_POR_CLUB.get(clubBase(equipo))
}

/** Zona geográfica de una ciudad conocida (la de su primer club) */
export function zonaDeCiudad(ciudad?: string): Zona | undefined {
  const clave = norm(ciudad)
  const entrada = Object.entries(CLUBES_POR_CIUDAD).find(([c]) => norm(c) === clave)
  if (!entrada) return undefined
  for (const club of entrada[1]) {
    const z = zonaDe(club)
    if (z) return z
  }
  return undefined
}

/** Los días (AAAA-MM-DD) de un viaje, ambos incluidos. Como mucho 31. */
export function diasDeViaje(fecha: string, fechaFin?: string): string[] {
  const fin = fechaFin && fechaFin >= fecha ? fechaFin : fecha
  const dias: string[] = []
  for (let d = fecha; d <= fin && dias.length < 31; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

export interface SugerenciaViaje {
  entry: FirmasEntry
  equipo?: string
  /** Días desde la última vez que se tocó la tarjeta */
  diasSinTocar: number
}

// Los más calientes primero; dentro de cada estatus, los más desatendidos
const ORDEN_ESTATUS: Record<FirmasStatus, number> = { caliente: 0, llamar: 1, templado: 2, decidir: 3, frio: 4, firmado: 9 }

function diasSinTocar(e: FirmasEntry, hoy: string): number {
  const ultimo = [e.updatedAt, e.statusUpdatedAt, e.createdAt, ...e.comments.map(c => c.date)].filter(Boolean).sort().pop()
  if (!ultimo) return 0
  const ms = new Date(`${hoy}T12:00:00`).getTime() - new Date(ultimo).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * Jugadores del pipeline a los que se puede visitar en un viaje.
 * `equipoDe` da el equipo actual del jugador de Captación vinculado.
 */
export function sugerenciasDeViaje(input: {
  ciudad?: string
  /** Zona del viaje; si no llega se deduce de la ciudad */
  zona?: string
  entries: FirmasEntry[]
  equipoDe: (scoutingPlayerId: string) => string | undefined
  hoy: string
}): { enCiudad: SugerenciaViaje[]; enZona: SugerenciaViaje[]; zona?: string } {
  const ciudad = norm(input.ciudad)
  const zona = input.zona || zonaDeCiudad(input.ciudad)
  const enCiudad: SugerenciaViaje[] = []
  const enZona: SugerenciaViaje[] = []
  for (const e of input.entries) {
    if (e.status === 'firmado') continue
    const equipo = (e.scoutingPlayerId ? input.equipoDe(e.scoutingPlayerId) : undefined) ?? e.knownTeam
    if (!equipo) continue
    const s: SugerenciaViaje = { entry: e, equipo, diasSinTocar: diasSinTocar(e, input.hoy) }
    if (ciudad && norm(ciudadDe(equipo)) === ciudad) enCiudad.push(s)
    else if (zona && zonaDe(equipo) === zona) enZona.push(s)
  }
  const orden = (a: SugerenciaViaje, b: SugerenciaViaje) =>
    ORDEN_ESTATUS[a.entry.status] - ORDEN_ESTATUS[b.entry.status] || b.diasSinTocar - a.diasSinTocar ||
    a.entry.playerName.localeCompare(b.entry.playerName)
  return { enCiudad: enCiudad.sort(orden), enZona: enZona.sort(orden), zona }
}
