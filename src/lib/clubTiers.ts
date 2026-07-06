// ── League / Club metadata (compartido entre vistas) ──────────

export type LeagueTier = 'A' | 'B' | 'C' | 'D'
export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'AFC' | 'CAF' | 'OFC'

export const TIER_CONFIG: Record<LeagueTier, { label: string; bg: string; text: string; border: string; title: string }> = {
  A: { label: 'A', bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200', title: 'Elite (Top 5 EU + equivalentes)' },
  B: { label: 'B', bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',   title: 'Fuerte (ligas de nivel alto)' },
  C: { label: 'C', bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',   title: 'Medio (ligas competitivas)' },
  D: { label: 'D', bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-200',  title: 'Otros / menor nivel' },
}

// Tier assigned per league name. Conflicts resolved in getClubTier().
const LEAGUE_TIERS: Record<string, LeagueTier> = {
  // ── UEFA Tier A ──
  'Premier League':           'A',
  'La Liga':                  'A',
  'Bundesliga':               'A',
  'Serie A':                  'A', // Italy (Brazil handled via country)
  'Ligue 1':                  'A',
  'Eredivisie':               'A',
  'Primeira Liga':            'A',
  'Pro League':               'A',
  'Süper Lig':                'A',
  // ── UEFA Tier B ──
  'Championship':             'B',
  'La Liga 2':                'B',
  '2. Bundesliga':            'B',
  'Serie B':                  'B',
  'Ligue 2':                  'B',
  'Swiss Super League':       'B',
  'Scottish Premiership':     'B',
  'Austrian Bundesliga':      'B',
  'Ekstraklasa':              'B',
  'Czech First League':       'B',
  'NB I':                     'B',
  'Allsvenskan':              'B',
  'Eliteserien':              'B',
  'Superliga':                'B',
  '1. Lig':                   'B',
  'Primera RFEF':             'B',
  'Segunda RFEF':             'C',
  '1B Pro League':            'B',
  'EFL League One':           'B',
  'Liga Portugal 2':          'B',
  'HNL':                      'B',
  'Super liga':               'B',
  'First Professional League':'B',
  'Super League Greece':      'B',
  'Israeli Premier League':   'B',
  // ── UEFA Tier C ──
  'EFL League Two':           'C',
  '3. Liga':                  'C',
  'Austrian 2. Liga':         'C',
  'Slovak Super Liga':        'C',
  'PrvaLiga':                 'C',
  'Eerste Divisie':           'C',
  'First Division Cyprus':    'C',
  'Veikkausliiga':            'C',
  'Erovnuli Liga':            'C',
  'Ukrainian Premier League': 'C',
  'Challenge League':         'C',
  'Premier League Russia':    'C',
  'Liga 1':                   'C', // Romania / Peru — same name, resolved by country
  // ── CONMEBOL ──
  'Liga Betplay':             'B',
  'LigaPro':                  'C',
  // ── CONCACAF ──
  'MLS':                      'A',
  'Liga MX':                  'A',
  // ── AFC ──
  'Saudi Pro League':         'A',
  'Qatar Stars League':       'B',
  'Arabian Gulf League':      'B',
  'Indian Super League':      'C',
  'Premier League Kazakhstan':'D',
  // ── CAF ──
  // (no CAF leagues in current DB)
  // ── Misc ──
  'Baltic Leagues':           'D',
  // ── Variantes de nombre presentes en datos antiguos ──
  'Bundesliga Austria':       'B',
  'Czech 1. Liga':            'B',
  'Fortuna Liga':             'C', // Eslovaquia (los checos usan 'Czech First League')
}

// Country → confederation
const COUNTRY_CONFEDERATION: Record<string, Confederation> = {
  // UEFA
  Spain: 'UEFA', England: 'UEFA', Germany: 'UEFA', France: 'UEFA', Italy: 'UEFA',
  Netherlands: 'UEFA', Portugal: 'UEFA', Belgium: 'UEFA', Switzerland: 'UEFA',
  Austria: 'UEFA', Scotland: 'UEFA', Poland: 'UEFA', 'Czech Republic': 'UEFA',
  Hungary: 'UEFA', Turkey: 'UEFA', Sweden: 'UEFA', Norway: 'UEFA', Denmark: 'UEFA',
  Finland: 'UEFA', Bulgaria: 'UEFA', Romania: 'UEFA', Serbia: 'UEFA', Croatia: 'UEFA',
  Slovenia: 'UEFA', Slovakia: 'UEFA', Cyprus: 'UEFA', Greece: 'UEFA', Israel: 'UEFA',
  Ukraine: 'UEFA', Georgia: 'UEFA', Russia: 'UEFA', Baltics: 'UEFA',
  // CONMEBOL
  Brazil: 'CONMEBOL', Argentina: 'CONMEBOL', Colombia: 'CONMEBOL',
  Chile: 'CONMEBOL', Peru: 'CONMEBOL', Ecuador: 'CONMEBOL', Uruguay: 'CONMEBOL',
  // CONCACAF
  USA: 'CONCACAF', Mexico: 'CONCACAF', Canada: 'CONCACAF',
  // AFC
  'Saudi Arabia': 'AFC', Qatar: 'AFC', UAE: 'AFC', India: 'AFC', Kazakhstan: 'AFC',
  Japan: 'AFC', 'South Korea': 'AFC', China: 'AFC', Australia: 'AFC',
  // CAF
  'South Africa': 'CAF', Morocco: 'CAF', Egypt: 'CAF',
  // OFC
  'New Zealand': 'OFC',
}

export const CONFEDERATION_LABELS: Record<Confederation, string> = {
  UEFA:     '🌍 UEFA',
  CONMEBOL: '🌎 CONMEBOL',
  CONCACAF: '🌎 CONCACAF',
  AFC:      '🌏 AFC',
  CAF:      '🌍 CAF',
  OFC:      '🌏 OFC',
}

export function getClubTier(league: string | undefined, country: string | undefined): LeagueTier {
  if (!league) return 'D'
  // Resolve name conflicts using country
  if (league === 'Primera Division') {
    if (country === 'Argentina') return 'A'
    if (country === 'Brazil') return 'A'    // just in case
    return 'C'                              // Uruguay, Chile, etc.
  }
  if (league === 'Serie A' && country === 'Brazil') return 'A'
  if (league === 'Liga 1' && country === 'Romania') return 'B'
  if (league === 'Super League' && country === 'Switzerland') return 'B'
  return LEAGUE_TIERS[league] ?? 'D'
}

export function getClubConfederation(country: string | undefined): Confederation {
  return COUNTRY_CONFEDERATION[country ?? ''] ?? 'UEFA'
}

// ── Códigos de país (3 letras, estilo FIFA) ────────────────────
// Incluye alias en español por si hay datos escritos así.
const COUNTRY_CODE3: Record<string, string> = {
  England: 'ENG', Inglaterra: 'ENG', Scotland: 'SCO', Escocia: 'SCO', Wales: 'WAL', Gales: 'WAL',
  Ireland: 'IRL', Irlanda: 'IRL', 'Northern Ireland': 'NIR',
  Spain: 'ESP', 'España': 'ESP', Germany: 'GER', Alemania: 'GER', France: 'FRA', Francia: 'FRA',
  Italy: 'ITA', Italia: 'ITA', Netherlands: 'NED', 'Países Bajos': 'NED', Holanda: 'NED',
  Portugal: 'POR', Belgium: 'BEL', 'Bélgica': 'BEL', Switzerland: 'SUI', Suiza: 'SUI',
  Austria: 'AUT', Poland: 'POL', Polonia: 'POL', 'Czech Republic': 'CZE', Chequia: 'CZE', Czechia: 'CZE',
  Hungary: 'HUN', 'Hungría': 'HUN', Turkey: 'TUR', 'Turquía': 'TUR',
  Sweden: 'SWE', Suecia: 'SWE', Norway: 'NOR', Noruega: 'NOR', Denmark: 'DEN', Dinamarca: 'DEN',
  Finland: 'FIN', Finlandia: 'FIN', Iceland: 'ISL', Islandia: 'ISL',
  Bulgaria: 'BUL', Romania: 'ROU', 'Rumanía': 'ROU', Serbia: 'SRB', Croatia: 'CRO', Croacia: 'CRO',
  Slovenia: 'SVN', Eslovenia: 'SVN', Slovakia: 'SVK', Eslovaquia: 'SVK',
  Cyprus: 'CYP', Chipre: 'CYP', Greece: 'GRE', Grecia: 'GRE', Israel: 'ISR',
  Ukraine: 'UKR', Ucrania: 'UKR', Georgia: 'GEO', Russia: 'RUS', Rusia: 'RUS',
  Estonia: 'EST', Latvia: 'LVA', Letonia: 'LVA', Lithuania: 'LTU', Lituania: 'LTU', Baltics: 'BAL',
  Brazil: 'BRA', Brasil: 'BRA', Argentina: 'ARG', Colombia: 'COL', Chile: 'CHI',
  Peru: 'PER', 'Perú': 'PER', Ecuador: 'ECU', Uruguay: 'URU',
  USA: 'USA', 'United States': 'USA', 'Estados Unidos': 'USA', Mexico: 'MEX', 'México': 'MEX',
  'Saudi Arabia': 'KSA', 'Arabia Saudí': 'KSA', Qatar: 'QAT', Catar: 'QAT', UAE: 'UAE',
  India: 'IND', Kazakhstan: 'KAZ', 'Kazajistán': 'KAZ', Japan: 'JPN', 'Japón': 'JPN',
  'South Korea': 'KOR', 'Corea del Sur': 'KOR', China: 'CHN', Australia: 'AUS',
  Morocco: 'MAR', Marruecos: 'MAR', Egypt: 'EGY', Egipto: 'EGY',
  'South Africa': 'RSA', 'Sudáfrica': 'RSA', Canada: 'CAN', 'Canadá': 'CAN',
  'New Zealand': 'NZL', 'Nueva Zelanda': 'NZL',
}

/** Código de 3 letras del país ('' si no hay país) */
export function countryCode3(country: string | undefined): string {
  const c = (country ?? '').trim()
  if (!c) return ''
  return COUNTRY_CODE3[c] ?? c.slice(0, 3).toUpperCase()
}

/** Etiqueta "Liga · PAÍS" para desplegables (evita mezclar Serie A italiana y brasileña) */
export function leagueLabel(league: string | undefined, country: string | undefined): string {
  const l = league ?? 'Sin liga'
  const code = countryCode3(country)
  return code ? `${l} · ${code}` : l
}
