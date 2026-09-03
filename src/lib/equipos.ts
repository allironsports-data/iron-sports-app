import { norm } from './texto'

// ── ¿Estos dos nombres se refieren al mismo club? ─────────────────────
//
// Esto vivía suelto dentro de Captacion.tsx, y App.tsx tenía SU PROPIA
// versión, más antigua y con un fallo: daba por bueno «Real Madrid» ↔
// «Real Sociedad» (una contiene a la otra), y por eso saltaban avisos de
// partidos que no eran del jugador. Ahora hay una sola versión y la
// importan los dos.
//
// "Real Madrid Juv B" ↔ "Real Madrid Juvenil B" ↔ "real madrid"

// Palabras que no distinguen a nadie: categorías, formas jurídicas, artículos.
const TEAM_NOISE_TOKENS = new Set([
  'cf', 'cd', 'ud', 'fc', 'sd', 'ad', 'ce', 'sad', 'club',
  'juv', 'juvenil', 'cadete', 'cad', 'inf', 'infantil', 'alevin',
  'a', 'b', 'c', 'equipo', 'filial',
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'the', 'of',
])

export function normTeamTokens(name: string): string[] {
  return norm(name)
    .split(/[^a-z0-9]+/)
    // Fuera las letras sueltas. Ya estaban 'a', 'b' y 'c' (el filial), pero
    // «C.F. Villarreal» dejaba colgando una «f» y «U.D. Logroñés» una «u»,
    // según se escribiera con puntos o sin ellos. Ningún club se distingue
    // por una letra suelta.
    .filter(t => t.length > 1 && !TEAM_NOISE_TOKENS.has(t))
}

// Palabras que comparten decenas de clubes distintos: por sí solas NO identifican
// a ninguno ("Real Madrid" vs "Real Sociedad", "Atlético Madrid" vs "Atlético Baleares").
const TEAM_GENERIC_TOKENS = new Set([
  'real', 'atletico', 'athletic', 'atletic', 'deportivo', 'sporting', 'racing', 'union',
  'cultural', 'sociedad', 'madrid', 'san', 'santa', 'futbol', 'football', 'balompie',
  'olimpico', 'olimpica', 'municipal', 'escuela', 'independiente', 'internacional',
  'nacional', 'ciudad', 'recreativo', 'gimnastic', 'gimnastica', 'sportiva', 'calcio',
])

/**
 * ¿Se refieren al mismo club?
 * - 'exacto'  → mismo club: mismo nombre normalizado, o uno es prefijo del otro
 *               con alguna palabra distintiva ("Getafe" ⊂ "Getafe B").
 * - 'parcial' → coincidencia ambigua: el nombre corto solo tiene palabras genéricas
 *               ("Atlético" ⊂ "Atlético Madrid"). Puede ser, pero no es seguro.
 * - null      → clubes distintos.
 */
export function teamMatchKind(a?: string, b?: string): 'exacto' | 'parcial' | null {
  if (!a || !b) return null
  const ta = normTeamTokens(a), tb = normTeamTokens(b)
  if (ta.length === 0 || tb.length === 0) return null
  if (ta.join(' ') === tb.join(' ')) return 'exacto'

  const short = ta.length <= tb.length ? ta : tb
  const long = short === ta ? tb : ta
  const isPrefix = long.slice(0, short.length).join(' ') === short.join(' ')
  const shortHasDistinctive = short.some(t => !TEAM_GENERIC_TOKENS.has(t))
  if (isPrefix) return shortHasDistinctive ? 'exacto' : 'parcial'

  // Sin prefijo: exigimos al menos una palabra distintiva compartida.
  const sharedDistinctive = ta.filter(t => tb.includes(t) && !TEAM_GENERIC_TOKENS.has(t))
  if (sharedDistinctive.length === 0) return null
  const shared = ta.filter(t => tb.includes(t)).length
  return shared / Math.max(ta.length, tb.length) >= 0.5 ? 'exacto' : 'parcial'
}

/** ¿Se refieren (probablemente) al mismo club? */
export function teamsAlike(a?: string, b?: string): boolean {
  return teamMatchKind(a, b) !== null
}

// ── Mismo EQUIPO (club + categoría), no solo mismo club ───────────────
//
// teamMatchKind descarta a propósito «Juv», «A», «B», «Cadete»… para saber si
// dos nombres son del MISMO CLUB. Pero hay sitios donde eso no basta: un
// ascenso de «Villarreal Juv B» a «Villarreal Juv A» es un cambio de equipo
// real (es justo lo que traen las alineaciones y lo que hay que avisar como
// «cambió de equipo»), y a esos dos nombres teamMatchKind les da 'exacto'.
//
// Para esos casos: mismoEquipo() = mismo club Y misma categoría.

const CATEGORIA_SINONIMOS: Record<string, string> = {
  juvenil: 'juv', juv: 'juv',
  cadete: 'cad', cad: 'cad',
  infantil: 'inf', inf: 'inf',
  alevin: 'ale',
  filial: 'b',
  a: 'a', b: 'b', c: 'c',
}

/**
 * Firma de categoría del nombre: «Villarreal Juvenil A» → "juv a",
 * «Getafe B» → "b", «Getafe» → "". Sirve para distinguir equipos del mismo club.
 */
export function categoriaDe(name?: string): string {
  if (!name) return ''
  const toks = norm(name).split(/[^a-z0-9]+/).filter(Boolean)
  return toks
    // Las letras sueltas solo cuentan al FINAL del nombre («Getafe B»);
    // al principio son siglas («C.D. Castellón», «U.D. Logroñés»).
    .map((t, i) => (t.length === 1 && i !== toks.length - 1) ? undefined : CATEGORIA_SINONIMOS[t])
    .filter((t): t is string => !!t)
    .join(' ')
}

/**
 * - 'equipo' → mismo club y misma categoría («Villarreal Juv A» ↔ «Villarreal Juvenil A»)
 * - 'club'   → mismo club, distinta categoría («Villarreal Juv A» ↔ «Villarreal B»)
 * - 'parcial'/null → como teamMatchKind
 */
export function equipoMatchKind(a?: string, b?: string): 'equipo' | 'club' | 'parcial' | null {
  const k = teamMatchKind(a, b)
  if (k !== 'exacto') return k
  return categoriaDe(a) === categoriaDe(b) ? 'equipo' : 'club'
}

/** ¿Mismo club y misma categoría? */
export function mismoEquipo(a?: string, b?: string): boolean {
  return equipoMatchKind(a, b) === 'equipo'
}
