import type { ScoutingAssessment, ScoutingMatch, FirmasEntry } from '../../types'
import { parseDia } from '../../lib/fechas'
import type { Profile } from '../../contexts/AuthContext'


export type ShowToast = (message: string, variant?: 'success' | 'error' | 'info', action?: { label: string; fn: () => void }) => void

// ── Captación · constantes, tipos y helpers compartidos (sin componentes) ──

// ── Constants ────────────────────────────────────────────────

export type CaptacionTab = 'jugadores' | 'firmar' | 'conclusiones' | 'contratos' | 'equipos' | 'informes' | 'partidos' | 'planificacion' | 'pretemporada'

export const ASSESSMENT_CONFIG: Record<ScoutingAssessment, { label: string; bg: string; text: string; border: string }> = {
  Llamar:     { label: 'Llamar',     bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  Seguir:     { label: 'Seguir',     bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  Decidir:    { label: 'Decidir',    bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
  Basque:     { label: 'Basque',     bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
  Visto:      { label: 'Visto',      bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200' },
  Descartado: { label: 'Descartado', bg: 'bg-red-100',     text: 'text-red-600',     border: 'border-red-200' },
}

export const ALL_ASSESSMENTS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir', 'Basque', 'Visto', 'Descartado']

// Punto de color sólido para indicar estado en tablas compactas (más legible que el bg pastel de ASSESSMENT_CONFIG)
export const ASSESSMENT_DOT: Record<ScoutingAssessment, string> = {
  Llamar: 'bg-amber-500', Seguir: 'bg-blue-500', Decidir: 'bg-orange-500',
  Basque: 'bg-violet-500', Visto: 'bg-slate-400', Descartado: 'bg-red-500',
}

// Pretemporada: solo interesan jugadores nacidos en este año o después
export const PRETEMPORADA_MIN_BIRTH_YEAR = 2002

// Estilo compartido para los selectores de filtro (look sobrio: sin globos/chips)
export const SELECT_CLS = "text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 hover:border-slate-300 transition-colors"

export const POSITIONS_SCOUTING = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

// «Visto» no es un veredicto: es «lo he visto y no concluyo» (poco rato, mal
// sitio, partido malo). Sirve para distinguir al scout que decide no mojarse
// del que se olvidó de marcar nada, y se excluye de exigencia y de debates.
export const CONCLUSION_OPTIONS = ['', 'Seguir', 'Llamar', 'Descartar', 'Visto'] as const
export type ConclusionOption = typeof CONCLUSION_OPTIONS[number]

// «Firmar» se unificó con «Llamar» (ver migration_merge_firmar_llamar.sql).
// Este helper normaliza registros que aún no hayan pasado por la migración.
// Cambio PARCIAL de una tarjeta de Firmas, aplicado por App sobre el estado
// más reciente. Antes se mandaba la tarjeta entera capturada en el render y
// dos guardados seguidos (notas en onBlur + «Enviar apunte») se pisaban.
export type PatchFirmasEntry = (id: string, changes: Partial<FirmasEntry> | ((e: FirmasEntry) => FirmasEntry)) => Promise<void>

export function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

export const CONCLUSION_STYLE: Record<string, string> = {
  Seguir:    'bg-blue-100 text-blue-700 border border-blue-200',
  Llamar:    'bg-amber-100 text-amber-700 border border-amber-200',
  Descartar: 'bg-red-100 text-red-600 border border-red-200',
  Visto:     'bg-slate-100 text-slate-600 border border-slate-300',
  // legado — por si hay registros antiguos sin migrar
  Firmar:    'bg-amber-100 text-amber-700 border border-amber-200',
  Decidir:   'bg-orange-100 text-orange-700 border border-orange-200',
}

export const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Plantilla opcional de informe — homogeneiza sin obligar
export const REPORT_TEMPLATE = 'FÍSICO:\n\nTÉCNICA:\n\nTÁCTICA:\n\nMENTALIDAD:\n\nCONTEXTO (equipo, rol, rival):\n\nCONCLUSIÓN:\n'

// ── Competition options ──────────────────────────────────────

export const COMPETITION_OPTIONS = [
  // Competiciones profesionales
  'Primera', 'Segunda', 'Primera RFEF', 'Segunda RFEF', 'Tercera RFEF', 'Tercera', 'Preferente',
  // Categorías base
  'Juvenil DH', 'Juvenil LN', 'Juvenil Pref', 'Juvenil Autonómico', 'Juvenil LC',
  'Cadete DH', 'Cadete Pref', 'Cadete Autonómico', 'Cadete', 'Infantil',
  'División Honor',
  // Internacionales / selecciones
  'Internacional', 'Selecciones', 'Youth League',
  'Euro U17', 'Euro U21', 'Mundial U20', 'Mundialito Juveniles',
  // Torneos
  'MIC', 'COTIF', 'Copa del Rey', 'Copa del Rey Juv', 'Amistoso', 'Pretemporada',
  // Ligas extranjeras
  'Ligue 1', 'Eredivisie', 'Serie A', 'Belgium 1', 'CESA',
]

// ── Helpers ─────────────────────────────────────────────────

export function birthYearFromBirthdate(birthdate?: string): string {
  if (!birthdate) return '—'
  return birthdate.slice(0, 4)
}

export function personaToName(persona: string | undefined, profiles: Profile[]): string {
  if (!persona) return ''
  const p = profiles.find(pr => pr.avatar === persona)
  return p ? p.name : persona
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  // parseDia ancla los AAAA-MM-DD a mediodía local: new Date('AAAA-MM-DD') es UTC y cambia de día
  return parseDia(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Partido de hoy en adelante = aún no ha podido jugarse
export function isFutureMatch(dateStr: string): boolean {
  return dateStr >= todayISO()
}

// Estrictamente posterior a hoy. «Ocultar futuros» usa esta: los partidos
// de HOY se siguen viendo (son los que toca ver esta tarde).
export function isAfterToday(dateStr: string): boolean {
  return dateStr > todayISO()
}

export function relativeDate(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  if (days < 30) return `hace ${Math.floor(days / 7)}sem`
  return ''
}

// Normalización y comparación de equipos: ahora en lib/equipos.ts (una sola
// versión, compartida con App.tsx).

/** Scout que cubre un partido, con su propio estado (pendiente / visto) */
export type MatchScoutInfo = { scout: string; status: 'pendiente' | 'visto'; viewMode: 'campo' | 'video' }

// Motivo por el que un jugador aparece sugerido en un partido
export type SuggestWhy = 'equipo' | 'posible' | 'historial' | 'busqueda'
export const SUGGEST_ORDER: Record<SuggestWhy, number> = { equipo: 0, posible: 1, historial: 2, busqueda: 3 }
export const SUGGEST_LABEL: Record<SuggestWhy, string> = {
  equipo: '',
  posible: ' · nombre de equipo ambiguo',
  historial: ' · visto antes con este equipo',
  busqueda: '',
}
/** Tope de resultados del buscador libre (las sugerencias por equipo no tienen tope) */
export const SEARCH_LIMIT = 60

// Los grupos de posición, los puestos del campograma y su clasificación
// viven ahora en lib/campo.ts, compartidos con el PDF mensual y con las
// estadísticas de scouts.

// ── Scout color palette (cycles through profiles deterministically) ──────────
const SCOUT_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800',  border: 'border-violet-200' },
  { bg: 'bg-emerald-100',text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-amber-100',  text: 'text-amber-800',   border: 'border-amber-200' },
  { bg: 'bg-rose-100',   text: 'text-rose-800',    border: 'border-rose-200' },
  { bg: 'bg-cyan-100',   text: 'text-cyan-800',    border: 'border-cyan-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800',  border: 'border-orange-200' },
]

// Returns a stable color for a given avatar string
export function scoutColor(avatar: string) {
  let hash = 0
  for (let i = 0; i < avatar.length; i++) hash = avatar.charCodeAt(i) + ((hash << 5) - hash)
  return SCOUT_COLORS[Math.abs(hash) % SCOUT_COLORS.length]
}


export const SIN_CONTEO = { total: 0, conInforme: 0 }
// Referencia estable para las filas sin scouts (un `?? []` nuevo por render rompería el memo de MatchRow)
export const SIN_SCOUTS: MatchScoutInfo[] = []
export const SIN_PARTIDOS: ScoutingMatch[] = []
