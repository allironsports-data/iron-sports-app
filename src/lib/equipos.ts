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
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0 && !TEAM_NOISE_TOKENS.has(t))
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
