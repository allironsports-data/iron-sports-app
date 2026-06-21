// ── Posiciones estándar (única fuente de verdad) ──────────────
// Se usan los mismos códigos en jugadores (Mantenimiento) y en
// peticiones de clubes (Distribución), con correspondencia castellana.

export interface PositionDef { code: string; es: string; en: string }

// Orden lógico defensa → ataque (derecha a izquierda en la zaga)
export const POSITIONS: PositionDef[] = [
  { code: 'GK',  es: 'Portero',           en: 'Goalkeeper' },
  { code: 'RB',  es: 'Lateral derecho',   en: 'Right back' },
  { code: 'RCB', es: 'Central derecho',   en: 'Right centreback' },
  { code: 'CB',  es: 'Central',           en: 'Centreback' },
  { code: 'LCB', es: 'Central izquierdo', en: 'Left centreback' },
  { code: 'LB',  es: 'Lateral izquierdo', en: 'Left back' },
  { code: 'DM',  es: 'Pivote',            en: 'Defensive midfielder' },
  { code: 'CM',  es: 'Mediocentro',       en: 'Centre midfielder' },
  { code: 'AM',  es: 'Mediapunta',        en: 'Attacking midfielder' },
  { code: 'RW',  es: 'Extremo derecho',   en: 'Right winger' },
  { code: 'LW',  es: 'Extremo izquierdo', en: 'Left winger' },
  { code: 'FW',  es: 'Delantero',         en: 'Forward' },
]

export const POSITION_CODES = POSITIONS.map(p => p.code)

const ES_BY_CODE = Object.fromEntries(POSITIONS.map(p => [p.code, p.es])) as Record<string, string>

/** Nombre en castellano de un código ('CB' → 'Central'). */
export function positionEs(code?: string): string {
  if (!code) return ''
  return ES_BY_CODE[code] ?? code
}

/** Etiqueta completa para sitios con espacio: 'CB · Central'. */
export function positionLabel(code?: string): string {
  if (!code) return ''
  const es = ES_BY_CODE[code]
  return es ? `${code} · ${es}` : code
}

// ── Normalización de valores antiguos/libres → código estándar ──

function strip(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// alias (ya sin acentos, en minúscula) → código
const ALIASES: Record<string, string> = {
  // GK
  'gk': 'GK', 'por': 'GK', 'portero': 'GK', 'goalkeeper': 'GK', 'arquero': 'GK', 'meta': 'GK',
  // RB
  'rb': 'RB', 'rwb': 'RB', 'ld': 'RB', 'lateral derecho': 'RB', 'right back': 'RB', 'rightback': 'RB', 'carrilero derecho': 'RB',
  // RCB
  'rcb': 'RCB', 'central derecho': 'RCB', 'dfc derecho': 'RCB', 'right centreback': 'RCB', 'right center back': 'RCB',
  // CB
  'cb': 'CB', 'ct': 'CB', 'dfc': 'CB', 'central': 'CB', 'centreback': 'CB', 'centre back': 'CB', 'center back': 'CB', 'defensa central': 'CB',
  // LCB
  'lcb': 'LCB', 'central izquierdo': 'LCB', 'dfc izquierdo': 'LCB', 'left centreback': 'LCB', 'left center back': 'LCB',
  // LB
  'lb': 'LB', 'lwb': 'LB', 'li': 'LB', 'lateral izquierdo': 'LB', 'left back': 'LB', 'leftback': 'LB', 'carrilero izquierdo': 'LB',
  // DM
  'dm': 'DM', 'cdm': 'DM', 'mcd': 'DM', 'pivote': 'DM', 'defensive midfielder': 'DM', 'mediocentro defensivo': 'DM', 'medio centro defensivo': 'DM', 'centrocampista defensivo': 'DM', 'contencion': 'DM',
  // CM
  'cm': 'CM', 'mc': 'CM', 'mediocentro': 'CM', 'medio centro': 'CM', 'centre midfielder': 'CM', 'center midfielder': 'CM', 'interior': 'CM', 'centrocampista': 'CM', 'mediocampista': 'CM', 'medio': 'CM', 'volante': 'CM', 'centrocampista mixto': 'CM',
  // AM
  'am': 'AM', 'cam': 'AM', 'mp': 'AM', 'mco': 'AM', 'mediapunta': 'AM', 'media punta': 'AM', 'attacking midfielder': 'AM', 'mediocentro ofensivo': 'AM', 'medio centro ofensivo': 'AM', 'centrocampista ofensivo': 'AM', 'enganche': 'AM',
  // RW
  'rw': 'RW', 'rm': 'RW', 'ed': 'RW', 'extremo derecho': 'RW', 'right winger': 'RW', 'banda derecha': 'RW',
  // LW
  'lw': 'LW', 'lm': 'LW', 'ei': 'LW', 'extremo izquierdo': 'LW', 'left winger': 'LW', 'banda izquierda': 'LW',
  // FW
  'fw': 'FW', 'st': 'FW', 'cf': 'FW', 'at': 'FW', 'ss': 'FW', 'delantero': 'FW', 'delantero centro': 'FW', 'forward': 'FW', 'striker': 'FW', 'segunda punta': 'FW', 'punta': 'FW', '9': 'FW',
}

/** Convierte cualquier valor (es/abreviatura/inglés) al código estándar, o null si no se reconoce. */
export function normalizePosition(raw?: string): string | null {
  if (!raw) return null
  const k = strip(raw)
  if (!k) return null
  if (POSITION_CODES.includes(k.toUpperCase())) return k.toUpperCase()
  return ALIASES[k] ?? null
}

// ── Cruce petición de club → jugador ──────────────────────────
// Una petición de CB engloba los tres centrales; LCB/RCB también
// aceptan un central genérico (CB).
const NEED_FAMILY: Record<string, string[]> = {
  GK:  ['GK'],
  RB:  ['RB'],
  RCB: ['RCB', 'CB'],
  CB:  ['LCB', 'CB', 'RCB'],
  LCB: ['LCB', 'CB'],
  LB:  ['LB'],
  DM:  ['DM'],
  CM:  ['CM'],
  AM:  ['AM'],
  RW:  ['RW'],
  LW:  ['LW'],
  FW:  ['FW'],
}

/** ¿Las posiciones del jugador satisfacen la petición indicada? */
export function needMatchesPlayer(needRaw: string, playerPositions: string[]): boolean {
  const need = normalizePosition(needRaw)
  const playerCodes = playerPositions
    .map(p => normalizePosition(p))
    .filter((c): c is string => !!c)
  if (!need) {
    // valor de petición no reconocido → coincidencia textual de respaldo
    const q = strip(needRaw)
    return playerPositions.some(p => strip(p).includes(q) || q.includes(strip(p)))
  }
  const fam = NEED_FAMILY[need] ?? [need]
  return playerCodes.some(c => fam.includes(c))
}
