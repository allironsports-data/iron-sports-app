// ── Cierre de tareas por tipo · lógica pura ──────────────────────────
//
// Una tarea es una promesa; completarla es contar qué pasó. Cada tipo de
// tarea tiene su cierre: una llamada pide si contestó, una reunión el
// recap, un videoanálisis el vídeo, una negociación el resultado… Aquí se
// decide, a partir de la tarea y de lo que hay alrededor (pipeline,
// eventos, postpartidos, jugador), qué cierre toca y qué deja.
//
// Hay UN solo camino para completar una tarea: App.handleUpdateTask
// intercepta el paso a «completada» y abre el cierre (CierreTareaHost).
// Ninguna vista escribe status = completada por su cuenta.
//
// Sin React ni Supabase, para poder probarlo.

import type { Task, TaskCierre, FirmasEntry, AgendaEvento, Postpartido, Player, ScoutingPlayer, ScoutingAssessment } from '../types'
import { EVENTO_DE_TAREA } from '../types'
import { esAccionDeLlamada } from '../views/captacion/firmas/cierreReunion'
import type { ServicioTipo } from './serviciosAnalisis'

// ── Qué cierre toca ──────────────────────────────────────────────────

export type TipoCierre =
  /** Llamada o WhatsApp del pipeline Firmar: ¿contestó? + recap + estatus + siguiente paso (CerrarLlamadaModal) */
  | { tipo: 'pipeline-llamada'; entry: FirmasEntry }
  /** Reunión del pipeline con evento de agenda: recap + estatus + siguiente paso (CerrarReunionModal) */
  | { tipo: 'pipeline-reunion'; entry: FirmasEntry; evento: AgendaEvento }
  /** Postpartido: el link del vídeo es obligatorio */
  | { tipo: 'postpartido'; postpartido: Postpartido }
  /** Llamada (Mantenimiento o general): ¿contestó? + nota + siguiente paso opcional */
  | { tipo: 'llamada' }
  /** Reunión (Mantenimiento o general): ¿se celebró? + recap */
  | { tipo: 'reunion' }
  /** Comida / Visita: cuál de las dos + recap */
  | { tipo: 'visita' }
  /** Informe de un jugador nuestro: enlace + nota → informe de datos en su ficha */
  | { tipo: 'informe'; player: Player }
  /** Informe de un jugador de Captación: qué informe (partido / entorno / mercado / personalidad) → abre su ficha para escribirlo */
  | { tipo: 'informe-captacion'; scoutingPlayer: ScoutingPlayer }
  /** Informe sobre un jugador ofrecido: qué informe → abre el ofrecimiento para registrarlo */
  | { tipo: 'informe-ofrecido'; ofrecimientoId: string }
  /** Videoanálisis de un jugador nuestro: servicio + vídeo → sesión en Rendimiento → Análisis */
  | { tipo: 'video'; player: Player }
  /** Negociación: resultado + nota (→ actividad en la ficha si hay jugador) */
  | { tipo: 'negociacion'; player?: Player }
  /** Scouting: conclusión + nota (→ assessment del jugador de Captación si se elige) */
  | { tipo: 'scouting'; scoutingPlayer?: ScoutingPlayer }
  /** Todo lo demás: una nota opcional */
  | { tipo: 'nota' }

export interface ContextoCierre {
  firmasEntries: FirmasEntry[]
  eventos: AgendaEvento[]
  postpartidos: Postpartido[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
}

export function jugadorDeTarea(t: Pick<Task, 'playerId'>, players: Player[]): Player | undefined {
  return t.playerId && t.playerId !== 'general' ? players.find(p => p.id === t.playerId) : undefined
}

/** Qué cierre pide una tarea al completarla */
export function cierreRequerido(t: Task, ctx: ContextoCierre): TipoCierre {
  // Tarea de una próxima acción del pipeline Firmar: manda la tarjeta
  const tarjeta = ctx.firmasEntries.find(f => f.nextActionTaskId === t.id && (f.nextAction || f.nextActionDate))
  if (tarjeta) {
    if (esAccionDeLlamada(tarjeta.nextActionKind)) return { tipo: 'pipeline-llamada', entry: tarjeta }
    const evento = tarjeta.nextActionEventoId ? ctx.eventos.find(e => e.id === tarjeta.nextActionEventoId) : undefined
    if (evento) return { tipo: 'pipeline-reunion', entry: tarjeta, evento }
    return { tipo: 'nota' }
  }
  const postpartido = ctx.postpartidos.find(p => p.taskId === t.id)
  if (postpartido || t.label === 'Postpartido') {
    if (postpartido) return { tipo: 'postpartido', postpartido }
    return { tipo: 'nota' }
  }
  const player = jugadorDeTarea(t, ctx.players)
  switch (t.label) {
    case 'Llamada': return { tipo: 'llamada' }
    case 'Reunión': return { tipo: 'reunion' }
    case 'Comida/Visita': return { tipo: 'visita' }
    case 'Informe': {
      if (player) return { tipo: 'informe', player }
      if (t.ofrecimientoId) return { tipo: 'informe-ofrecido', ofrecimientoId: t.ofrecimientoId }
      const sp = t.scoutingPlayerId ? ctx.scoutingPlayers.find(p => p.id === t.scoutingPlayerId) : undefined
      return sp ? { tipo: 'informe-captacion', scoutingPlayer: sp } : { tipo: 'nota' }
    }
    case 'Videoanálisis': return player ? { tipo: 'video', player } : { tipo: 'nota' }
    case 'Negociación': return { tipo: 'negociacion', player }
    case 'Scouting': return { tipo: 'scouting', scoutingPlayer: t.scoutingPlayerId ? ctx.scoutingPlayers.find(p => p.id === t.scoutingPlayerId) : undefined }
    default: return { tipo: 'nota' }
  }
}

// ── Resultados por tipo ──────────────────────────────────────────────

export const RESULTADOS_NEGOCIACION = ['acordado', 'rechazado', 'aplazado', 'descartado'] as const
export const RESULTADOS_SCOUTING = ['seguir', 'llamar', 'descartar', 'sin_novedad'] as const

export const RESULTADO_LABEL: Record<string, string> = {
  contesto: 'Contestó', no_contesto: 'No contestó',
  celebrada: 'Celebrada', no_celebrada: 'No se celebró',
  comida: 'Comida', visita: 'Visita presencial',
  acordado: 'Acordado', rechazado: 'Rechazado', aplazado: 'Aplazado', descartado: 'Descartado',
  seguir: 'Seguir', llamar: 'Llamar', descartar: 'Descartar', sin_novedad: 'Sin novedad',
  informe: 'Informe enviado', video: 'Sesión registrada', postpartido: 'Vídeo entregado', hecha: 'Hecha',
  tecnico: 'Informe de partido', entorno: 'Informe de entorno', mercado: 'Informe de mercado', personalidad: 'Informe de personalidad',
}

/** Conclusión de Scouting → assessment del jugador de Captación (sin_novedad no toca nada) */
export const ASSESSMENT_DE_CONCLUSION: Partial<Record<string, ScoutingAssessment>> = {
  seguir: 'Seguir', llamar: 'Llamar', descartar: 'Descartado',
}

export function etiquetaResultado(resultado?: string): string | undefined {
  return resultado ? (RESULTADO_LABEL[resultado] ?? resultado) : undefined
}

// ── Lo que el usuario cuenta al cerrar ───────────────────────────────

export interface DatosCierre {
  resultado?: string
  nota?: string
  /** Informe, vídeo, postpartido: enlace */
  enlace?: string
  /** Comida/Visita: 'Comida' | 'Visita presencial'. Videoanálisis: ServicioTipo */
  subtipo?: string
  /** Día real (AAAA-MM-DD). Sin valor = hoy */
  fecha?: string
  /** profiles.id de quienes participaron (vídeo, contacto) */
  participantes?: string[]
  /** Llamada: siguiente paso, que nace como tarea nueva */
  siguiente?: { titulo: string; fecha?: string; assigneeId?: string }
}

/** Un contacto deja evento solo si ocurrió: una llamada sin contestar o una reunión que no se celebró, no */
export function contactoOcurrio(tipo: TipoCierre['tipo'], d: DatosCierre): boolean {
  if (tipo === 'llamada') return d.resultado !== 'no_contesto'
  if (tipo === 'reunion') return d.resultado !== 'no_celebrada'
  return true
}

/** Borrador del evento de agenda que deja un contacto completado (sin id ni activityRef) */
export function eventoDeCierre(
  t: Task, tipo: 'llamada' | 'reunion' | 'visita', d: DatosCierre,
  ctx: { hoy: string; authorId: string; players: Player[] },
): Omit<AgendaEvento, 'id' | 'createdAt' | 'activityRef'> {
  const jugador = jugadorDeTarea(t, ctx.players)
  const tipoEvento = tipo === 'visita'
    ? (d.subtipo === 'Comida' ? 'Comida' : 'Visita presencial')
    : (EVENTO_DE_TAREA[t.label!] ?? 'Nota general')
  const participantes = d.participantes && d.participantes.length > 0 ? d.participantes : [t.assigneeId || ctx.authorId]
  return {
    titulo: t.title,
    tipo: tipoEvento,
    fecha: d.fecha || ctx.hoy,
    ambito: jugador ? 'mantenimiento' : t.scoutingPlayerId ? 'captacion' : 'general',
    playerIds: jugador ? [jugador.id] : [],
    scoutingPlayerId: jugador ? undefined : t.scoutingPlayerId,
    participantIds: participantes,
    notas: [etiquetaResultado(d.resultado), d.nota].filter(Boolean).join(' — ') || undefined,
    authorId: ctx.authorId,
    taskId: t.id,
  }
}

/** Texto de la actividad que una negociación cerrada deja en la ficha del jugador */
export function notaDeNegociacion(t: Pick<Task, 'title'>, d: DatosCierre): string {
  return [`Negociación · ${etiquetaResultado(d.resultado) ?? 'cerrada'}: ${t.title}`, d.nota].filter(Boolean).join(' — ')
}

/** La tarea de siguiente paso que nace de una llamada (misma persona y jugador salvo que se diga otra cosa) */
export function tareaSiguiente(t: Task, s: NonNullable<DatosCierre['siguiente']>, ahora: string): Task {
  return {
    ...t,
    id: 'tmp',
    title: s.titulo,
    description: `Siguiente paso de «${t.title}»`,
    assigneeId: s.assigneeId || t.assigneeId,
    status: 'pendiente',
    dueDate: s.fecha,
    createdAt: ahora,
    completedAt: undefined,
    cierre: undefined,
    recurrence: undefined,
    comments: [],
  }
}

/** La tarea completada con su cierre escrito */
export function conCierre(t: Task, d: DatosCierre, ref: NonNullable<TaskCierre['ref']> = {}): Task {
  const nota = [d.nota, d.enlace && !d.nota?.includes(d.enlace) ? d.enlace : undefined].filter(Boolean).join('\n') || undefined
  const limpio = Object.fromEntries(Object.entries(ref).filter(([, v]) => !!v))
  return {
    ...t,
    status: 'completada',
    cierre: {
      resultado: d.resultado,
      nota,
      ref: Object.keys(limpio).length > 0 ? limpio : undefined,
    },
  }
}

/** Qué dejó el cierre, para enseñarlo en la tarea («Evento en la agenda · Sesión en Rendimiento…») */
export function loQueDejo(c: TaskCierre | undefined): string[] {
  const r = c?.ref
  if (!r) return []
  const out: string[] = []
  if (r.eventoId) out.push('Evento en la agenda')
  if (r.activityId) out.push('Actividad en la ficha del jugador')
  if (r.videoSessionId) out.push('Registro en Rendimiento → Análisis')
  if (r.postpartidoId) out.push('Vídeo del postpartido')
  if (r.siguienteTaskId) out.push('Siguiente paso creado como tarea')
  return out
}

/** Tipo de servicio por defecto para un videoanálisis (lo normal es una sesión) */
export const SERVICIO_VIDEO_DEFECTO: ServicioTipo = 'sesion'
