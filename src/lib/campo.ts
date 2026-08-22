// ── Posiciones de Captación y campograma ─────────────────────────────
//
// La posición de un jugador de Captación es texto libre («Central»,
// «Mediapunta», «Segunda punta»…). Había TRES sitios que la clasificaban por
// su cuenta —Captación, Estadísticas de scouts y el PDF mensual— y ya no
// coincidían: «Segunda punta» salía como delantero en dos de ellos y como
// «Otros» en el tercero. El mismo jugador, tres respuestas.
//
// Aquí solo se clasifica UNA vez, en `slotDe()`. Todo lo demás —el grupo
// grueso, la línea, la etiqueta larga— se deduce de ahí. Así ya no pueden
// separarse: para que dos vistas discrepen tendría que discrepar consigo
// misma una sola función.

import { norm } from './texto'

// ── Los doce puestos ─────────────────────────────────────────────────

export type PitchSlotId =
  | 'POR' | 'LD' | 'CTD' | 'CT' | 'CTI' | 'LI'
  | 'PIV' | 'MC' | 'MP' | 'ED' | 'EI' | 'DEL'

/** Posición en el campograma, en % (la portería propia, abajo). */
export const PITCH_SLOTS: { id: PitchSlotId; x: number; y: number }[] = [
  { id: 'POR', x: 50, y: 93 },
  { id: 'LD',  x: 84, y: 74 },
  { id: 'CTD', x: 66, y: 82 },
  { id: 'CT',  x: 50, y: 84 },
  { id: 'CTI', x: 34, y: 82 },
  { id: 'LI',  x: 16, y: 74 },
  { id: 'PIV', x: 50, y: 62 },
  { id: 'MC',  x: 32, y: 49 },
  { id: 'MP',  x: 60, y: 40 },
  { id: 'ED',  x: 85, y: 26 },
  { id: 'EI',  x: 15, y: 26 },
  { id: 'DEL', x: 50, y: 12 },
]

export const SLOT_LABELS: Record<PitchSlotId, string> = {
  POR: 'Portero',
  LD: 'Lateral derecho',
  CTD: 'Central derecho',
  CT: 'Central',
  CTI: 'Central izquierdo',
  LI: 'Lateral izquierdo',
  PIV: 'Pivote',
  MC: 'Mediocentro',
  MP: 'Mediapunta',
  ED: 'Extremo derecho',
  EI: 'Extremo izquierdo',
  DEL: 'Delantero',
}

/** Orden de lectura de la lista (de atrás hacia arriba), como el Excel */
export const SLOT_ORDER: PitchSlotId[] = [
  'POR', 'CTD', 'CT', 'CTI', 'LD', 'LI', 'PIV', 'MC', 'MP', 'ED', 'EI', 'DEL',
]

// ── LA clasificación. La única. ──────────────────────────────────────

/**
 * De un texto libre al puesto del campograma. El orden de las
 * comprobaciones importa: «mediapunta» tiene que mirarse antes que «medio»,
 * y «segunda punta» antes de que «punta» la mande al nueve.
 */
export function slotDe(pos?: string): PitchSlotId | null {
  const s = norm(pos)
  if (!s) return null

  if (s.includes('portero') || s === 'por' || s === 'gk') return 'POR'

  if (s.includes('lateral') && s.includes('der')) return 'LD'
  if (s.includes('lateral') && s.includes('izq')) return 'LI'
  if (s.includes('lateral') || s.includes('carrilero')) return 'LD'

  if (s.includes('central') && s.includes('der')) return 'CTD'
  if (s.includes('central') && s.includes('izq')) return 'CTI'
  if (s.includes('central') || s.includes('defensa')) return 'CT'

  if (s.includes('pivote')) return 'PIV'
  if (s.includes('mediapunta') || s.includes('media punta') || s.includes('enganche')) return 'MP'
  if (s.includes('mediocentro') || s.includes('medio') || s.includes('interior') || s.includes('volante')) return 'MC'

  if (s.includes('extremo') && s.includes('izq')) return 'EI'
  if (s.includes('extremo') || s.includes('banda')) return 'ED'

  if (s.includes('delantero') || s.includes('punta') || s.includes('ariete') || s.includes('killer')) return 'DEL'

  return null
}

/** El puesto de un jugador: su posición principal, y si no la tiene, la secundaria. */
export function slotDeJugador(pos1?: string, pos2?: string): PitchSlotId | null {
  return slotDe(pos1) ?? slotDe(pos2)
}

// ── Las tres vistas de lo mismo ──────────────────────────────────────

export type PosGroup = 'POR' | 'DEF' | 'MED' | 'EXT' | 'DEL'
export const POS_GROUPS: PosGroup[] = ['POR', 'DEF', 'MED', 'EXT', 'DEL']

const GRUPO_DE_SLOT: Record<PitchSlotId, PosGroup> = {
  POR: 'POR',
  LD: 'DEF', CTD: 'DEF', CT: 'DEF', CTI: 'DEF', LI: 'DEF',
  PIV: 'MED', MC: 'MED', MP: 'MED',
  ED: 'EXT', EI: 'EXT',
  DEL: 'DEL',
}

/** Grupo grueso (el de los filtros y la matriz): POR · DEF · MED · EXT · DEL */
export function grupoDe(pos?: string): PosGroup | null {
  const slot = slotDe(pos)
  return slot ? GRUPO_DE_SLOT[slot] : null
}

export const GRUPO_LARGO: Record<PosGroup, string> = {
  POR: 'Portero', DEF: 'Defensa', MED: 'Medio', EXT: 'Extremo', DEL: 'Delantero',
}

/**
 * El grupo escrito en cristiano, para las estadísticas.
 * Distingue «no lo sabemos» (sin posición apuntada) de «no lo entendemos»
 * (hay algo escrito pero no encaja en ningún puesto).
 */
export function grupoLargoDe(pos?: string): string {
  if (!norm(pos)) return 'Sin posición'
  const g = grupoDe(pos)
  return g ? GRUPO_LARGO[g] : 'Otros'
}

// ── Líneas (el PDF mensual agrupa así) ───────────────────────────────

const LINEA_DE_SLOT: Record<PitchSlotId, string> = {
  POR: 'Porteros',
  LD: 'Defensas', CTD: 'Defensas', CT: 'Defensas', CTI: 'Defensas', LI: 'Defensas',
  PIV: 'Centro del campo', MC: 'Centro del campo', MP: 'Centro del campo',
  ED: 'Bandas', EI: 'Bandas',
  DEL: 'Delanteros',
}

export const ORDEN_LINEAS = [
  'Porteros', 'Defensas', 'Centro del campo', 'Bandas', 'Delanteros', 'Otros',
]

export function lineaDeSlot(slot?: PitchSlotId | null): string {
  return slot ? LINEA_DE_SLOT[slot] : 'Otros'
}
