// ── Servicios de análisis de un jugador ──────────────────────────────
// Lo que se le hace o se le manda a un jugador nuestro: sesiones de
// videoanálisis, vídeos, recursos, entrenamientos e informes de datos.
// Viven en players.video_sessions (el nombre es histórico: empezó siendo
// solo «sesiones de vídeo»). Lógica pura.

import type { VideoSession } from '../types'

export const SERVICIO_TIPOS = ['sesion', 'video', 'recurso', 'entrenamiento', 'informe_datos'] as const
export type ServicioTipo = typeof SERVICIO_TIPOS[number]

export const SERVICIO_META: Record<ServicioTipo, { label: string; ayuda: string; punto: string; chip: string; borde: string }> = {
  sesion:        { label: 'Sesión de análisis', ayuda: 'Nos sentamos con el jugador a repasar acciones',
                   punto: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 border-blue-200',          borde: 'border-l-blue-500' },
  video:         { label: 'Vídeo',                   ayuda: 'Un vídeo preparado expresamente para él, con o sin sesión',
                   punto: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-700 border-violet-200',    borde: 'border-l-violet-500' },
  recurso:       { label: 'Recurso',                 ayuda: 'Un vídeo de un concepto táctico, aprovechando material hecho para otro jugador',
                   punto: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200',       borde: 'border-l-amber-500' },
  entrenamiento: { label: 'Entrenamiento',           ayuda: 'Sesión en campo',
                   punto: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', borde: 'border-l-emerald-500' },
  informe_datos: { label: 'Informe de datos',        ayuda: 'Se le ha enviado un informe de datos',
                   punto: 'bg-slate-500',   chip: 'bg-slate-100 text-slate-700 border-slate-300',      borde: 'border-l-slate-500' },
}

/** Tipo de un servicio. Los antiguos, sin tipo, eran todos sesiones de videoanálisis. */
export function tipoDeServicio(v: Pick<VideoSession, 'tipo'>): ServicioTipo {
  return v.tipo && (SERVICIO_TIPOS as readonly string[]).includes(v.tipo) ? v.tipo as ServicioTipo : 'sesion'
}

/** Título que se enseña: el suyo; en los antiguos (solo descripción), la descripción */
export function tituloDeServicio(v: Pick<VideoSession, 'titulo' | 'description' | 'tipo'>): string {
  return v.titulo?.trim() || v.description?.trim() || SERVICIO_META[tipoDeServicio(v)].label
}

/** Quiénes del equipo participaron. Los antiguos solo tenían un encargado. */
export function participantesDeServicio(v: Pick<VideoSession, 'participantes' | 'responsableId'>): string[] {
  if (v.participantes && v.participantes.length > 0) return v.participantes
  return v.responsableId ? [v.responsableId] : []
}

/** Cuántos hay de cada tipo */
export function contarServicios(vs: VideoSession[]): Record<ServicioTipo, number> {
  const n = { sesion: 0, video: 0, recurso: 0, entrenamiento: 0, informe_datos: 0 }
  for (const v of vs) n[tipoDeServicio(v)]++
  return n
}
