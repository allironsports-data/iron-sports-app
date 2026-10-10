// ── Eventos de agenda: lo que dejan alrededor ────────────────────────
//
// Un evento con jugadores de Mantenimiento se apunta además en su
// actividad (player_activities), que es lo que lee la ficha. Y un evento
// ligado a un jugador de Captación que está en el pipeline Firmar queda
// apuntado en el historial de su tarjeta. Lo usan el tablero (alta y
// edición de eventos) y el cierre de tareas (una llamada o reunión hecha
// se convierte en evento).

import type { AgendaEvento, FirmasEntry } from '../types'
import { createPlayerActivity, createGroupActivity, deletePlayerActivity, deleteGroupActivity } from './db'
import { apunteDeEvento, type Autor } from '../views/captacion/firmas/cierreReunion'
import { idApunteEvento } from './reuniones'

export type EventoSinId = Omit<AgendaEvento, 'id' | 'createdAt' | 'activityRef'>

/** Apunta el evento en la actividad de sus jugadores. Devuelve el activity_ref (id de fila o group_id). */
export async function crearActividadesDeEvento(e: EventoSinId, authorId: string): Promise<string | undefined> {
  if (e.playerIds.length === 0) return undefined
  const input = {
    date: e.fecha, type: e.tipo,
    notes: [e.titulo, e.notas].filter(Boolean).join(' — ') || undefined,
    authorId: e.authorId ?? authorId,
    participantProfileIds: e.participantIds.length > 0 ? e.participantIds : undefined,
  }
  if (e.playerIds.length > 1) {
    const filas = await createGroupActivity(e.playerIds, input)
    return filas[0]?.groupId
  }
  return (await createPlayerActivity(e.playerIds[0], input)).id
}

export async function borrarActividadesDeEvento(ref?: string): Promise<void> {
  if (!ref) return
  // activity_ref es el id de una fila o el group_id de varias: se prueba con los dos
  await deleteGroupActivity(ref).catch(() => {})
  await deletePlayerActivity(ref).catch(() => {})
}

/** Tarjeta de Firmar de un jugador de Captación, si está en el pipeline */
export function tarjetaDeScouting(firmasEntries: FirmasEntry[], scoutingPlayerId?: string): FirmasEntry | undefined {
  return scoutingPlayerId ? firmasEntries.find(f => f.scoutingPlayerId === scoutingPlayerId) : undefined
}

/**
 * Deja el evento apuntado en el historial de la tarjeta de Firmar de su
 * jugador (y lo quita de la tarjeta anterior si el evento cambió de jugador).
 * Mismo apunte que usa el cierre de reuniones: una reunión queda «pendiente
 * de cerrar» hasta que se cierra.
 */
export async function apuntarEventoEnPipeline(
  ev: AgendaEvento,
  ctx: {
    firmasEntries: FirmasEntry[]
    autor: Autor
    hoy: string
    patch: (id: string, cambio: (e: FirmasEntry) => FirmasEntry) => Promise<void>
  },
  anterior?: AgendaEvento,
): Promise<void> {
  const antes = tarjetaDeScouting(ctx.firmasEntries, anterior?.scoutingPlayerId)
  const ahora = tarjetaDeScouting(ctx.firmasEntries, ev.scoutingPlayerId)
  try {
    if (antes && antes.id !== ahora?.id) {
      await ctx.patch(antes.id, f => ({ ...f, comments: f.comments.filter(c => c.id !== idApunteEvento(ev.id)) }))
    }
    if (!ahora) return
    const apunte = apunteDeEvento(ev, ctx.autor, ctx.hoy)
    await ctx.patch(ahora.id, f => ({ ...f, comments: [...f.comments.filter(c => c.id !== apunte.id), apunte] }))
  } catch (err) { console.error('No se pudo apuntar el evento en la tarjeta de Firmar:', err) }
}
