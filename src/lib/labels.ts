import type { Task, ClubNegotiation } from '../types'
import { NEG_STATUS_CONFIG } from '../components/playerClubList'

// ═════════════════════════════════════════════════════════════
// Glosario único de la app. Toda la UI debe coger los términos
// de aquí para que el mismo concepto se llame igual en todas las
// vistas. Decisiones:
//   - Responsable  = quien hace la tarea (assignee).
//   - Encargado    = gestor del jugador/club (sustituye «Gestor AIS»/«manager»).
//   - Seguidores   = watchers/adjuntados a una tarea.
//   - Solicitud    = sustituye «Necesidad»/«Petición» en Distribución
//                    (Boulema mantiene «Peticiones»).
//   - Nivel A-D    = sustituye «Tier».
//   - Etiqueta     = etiqueta del jugador (sustituye «Assessment»).
//   - Veredicto    = sustituye «Conclusión» del informe.
//   - Scout        = sustituye «explorador»/«Persona asignada».
//   - Firmar       = sustituye «Pipeline/Firmar».
// ═════════════════════════════════════════════════════════════

export const L = {
  // Personas y roles
  encargado: 'Encargado',
  encargados: 'Encargados',
  sinEncargado: 'Sin encargado',
  responsable: 'Responsable',
  sinResponsable: 'Sin responsable',
  seguidores: 'Seguidores',
  scout: 'Scout',
  scouts: 'Scouts',
  miembro: 'Miembro',
  equipo: 'Equipo',

  // Distribución
  solicitud: 'Solicitud',
  solicitudes: 'Solicitudes',
  sinSolicitudes: 'Sin solicitudes',
  nivel: 'Nivel',
  club: 'Club',
  clubes: 'Clubes',
  oportunidades: 'Oportunidades',
  negociacion: 'Negociación',
  negociaciones: 'Negociaciones',
  ofrecer: 'Ofrecer',
  ofrecido: 'Ofrecido',

  // Captación
  etiquetaJugador: 'Etiqueta',
  veredicto: 'Veredicto',
  informe: 'Informe',
  informes: 'Informes',
  partido: 'Partido',
  partidos: 'Partidos',
  firmar: 'Firmar',
  planificacion: 'Planificación',

  // Boulema
  peticiones: 'Peticiones',
  peticion: 'Petición',

  // Tareas / genéricos
  tarea: 'Tarea',
  tareas: 'Tareas',
  prioridad: 'Prioridad',
  estado: 'Estado',
  vencimiento: 'Vencimiento',
  jugador: 'Jugador',
  jugadores: 'Jugadores',
  mantenimiento: 'Mantenimiento',
  distribucion: 'Distribución',
  captacion: 'Captación',
  boulema: 'Boulema',
  miDia: 'Mi día',
  inicio: 'Inicio',
  buscar: 'Buscar',
  guardar: 'Guardar',
  cancelar: 'Cancelar',
  eliminar: 'Eliminar',
  cerrar: 'Cerrar',
  atras: 'Atrás',
  sinCambios: 'Tienes cambios sin guardar. ¿Descartarlos?',
} as const

export type LabelKey = keyof typeof L

// ── Mapas de valores → etiqueta visible ──────────────────────

export type TaskPriority = Task['priority']
export type TaskStatus = Task['status']
export type NegStatus = ClubNegotiation['status']

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
}

/** Reexporta las etiquetas de NEG_STATUS_CONFIG (fuente única, no duplicar). */
export const NEG_STATUS_LABELS: Record<NegStatus, string> = Object.fromEntries(
  (Object.keys(NEG_STATUS_CONFIG) as NegStatus[]).map(k => [k, NEG_STATUS_CONFIG[k].label]),
) as Record<NegStatus, string>

export { NEG_STATUS_CONFIG }

/** Capitaliza y sustituye guiones bajos por espacios: "en_progreso" → "En progreso". */
export function capitalizar(s: string): string {
  const t = s.replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/**
 * Devuelve la etiqueta del mapa o, si la clave no está (datos antiguos,
 * valor libre…), la clave capitalizada para que nunca se pinte vacío.
 */
export function label<K extends string>(map: Partial<Record<K, string>>, key: K | null | undefined): string {
  if (key == null || key === '') return ''
  return map[key] ?? capitalizar(String(key))
}
