import type { AgendaEvento, FirmasComment, FirmasEntry, FirmasStatus } from '../../../types'
import { FIRMAS_CONFIG } from './helpers'
import { esReunionCerrable, idApunteEvento } from '../../../lib/reuniones'
import { parseDia } from '../../../lib/fechas'

// ── Cerrar una reunión sobre la tarjeta de Firmar ───────────────────
// Lo que un cierre deja en la tarjeta, como función pura sobre la entrada:
//   · el apunte del evento pasa a «cerrada» con el recap debajo
//   · si la reunión era la próxima acción de la tarjeta, la acción se
//     retira (App completa su tarea al verlo)
//   · si se cambia el estatus, queda el apunte automático de siempre
// El siguiente paso NO va aquí: se pone con `conSiguientePaso` en un
// segundo guardado, para que la tarea de la reunión se complete antes de
// crear la del paso nuevo.
// Lo llaman el Dashboard (cerrar desde Mi día o el evento) y el panel de
// la tarjeta (cerrar desde el historial o registrar una reunión pasada).

export interface SiguientePaso {
  kind: string          // llamada | whatsapp | reunion | entorno | nota | telefono
  label: string
  date?: string         // AAAA-MM-DD
  assigneeId?: string   // profiles.id
}

export interface DatosCierre {
  recap: string
  siguiente?: SiguientePaso
  /** Estatus nuevo de la tarjeta, si se cambia */
  estatus?: FirmasStatus
}

export interface Autor { id: string; name: string }

/** Primera línea del apunte de un evento: «📅 Reunión: título — en Barcelona» */
export function textoApunteEvento(ev: Pick<AgendaEvento, 'tipo' | 'titulo' | 'fecha' | 'hora' | 'lugar' | 'notas'>, hoy: string): string {
  const futuro = ev.fecha > hoy
  const cuando = parseDia(ev.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + (ev.hora ? ` ${ev.hora}` : '')
  return [
    `📅 ${ev.tipo}${ev.titulo ? `: ${ev.titulo}` : ''}`,
    futuro ? `programado para el ${cuando}` : undefined,
    ev.lugar ? `en ${ev.lugar}` : undefined,
    ev.notas,
  ].filter(Boolean).join(' — ')
}

function kindDeEvento(tipo: string): FirmasComment['kind'] {
  const t = tipo.toLowerCase()
  return t.startsWith('llamada') ? 'llamada' : /^(reuni|videollamada|cita|comida|visita)/.test(t) ? 'reunion' : 'nota'
}

/** El apunte que un evento deja en la tarjeta al crearlo o editarlo (sin cerrar) */
export function apunteDeEvento(ev: AgendaEvento, autor: Autor, hoy: string, ahora: string = new Date().toISOString()): FirmasComment {
  const futuro = ev.fecha > hoy
  const base: FirmasComment = {
    id: idApunteEvento(ev.id),
    text: textoApunteEvento(ev, hoy),
    // El historial se ordena por fecha: lo ya ocurrido va en su día; lo futuro, cuando se apunta
    date: futuro ? ahora : new Date(`${ev.fecha}T${ev.hora || '12:00'}:00`).toISOString(),
    author: autor.name,
    authorId: autor.id,
    kind: kindDeEvento(ev.tipo),
    eventoId: ev.id,
  }
  if (!esReunionCerrable(ev)) return base
  return ev.cerradoAt
    ? { ...base, cierre: 'cerrada', text: ev.recap ? `${base.text}\n✓ Cerrada: ${ev.recap}` : base.text }
    : { ...base, cierre: 'pendiente' }
}

/** Aplica el cierre sobre la tarjeta (pura: devuelve la tarjeta nueva) */
export function aplicarCierreEnTarjeta(
  f: FirmasEntry,
  ev: AgendaEvento,
  datos: DatosCierre,
  autor: Autor,
  hoy: string,
  ahora: string = new Date().toISOString(),
): FirmasEntry {
  const recap = datos.recap.trim()
  const cerrado: AgendaEvento = { ...ev, recap, cerradoAt: ev.cerradoAt ?? ahora, cerradoPor: ev.cerradoPor ?? autor.id }
  const apunte = apunteDeEvento(cerrado, autor, hoy, ahora)
  // Si el apunte ya existía, se conserva quién lo apuntó y cuándo
  const previo = f.comments.find(c => c.id === apunte.id)
  const apunteFinal: FirmasComment = previo
    ? { ...previo, text: apunte.text, cierre: 'cerrada', eventoId: ev.id }
    : apunte
  let comments = [...f.comments.filter(c => c.id !== apunte.id), apunteFinal]

  let out: FirmasEntry = { ...f, comments }

  // Era la próxima acción de la tarjeta: hecha. (nextActionTaskId se deja:
  // App completa esa tarea al ver que la acción ya no está.)
  if (f.nextActionEventoId && f.nextActionEventoId === ev.id) {
    out = { ...out, nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined, nextActionEventoId: undefined }
  }

  if (datos.estatus && datos.estatus !== f.status) {
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `${FIRMAS_CONFIG[f.status].label} → ${FIRMAS_CONFIG[datos.estatus].label}`,
      date: ahora,
      author: autor.name,
      authorId: autor.id,
      kind: 'estatus',
    }
    comments = [...comments, log]
    out = {
      ...out,
      status: datos.estatus,
      statusUpdatedAt: ahora,
      signedAt: datos.estatus === 'firmado' ? (f.signedAt ?? ahora) : f.signedAt,
      comments,
    }
  }
  return out
}

// ── Cerrar una llamada (próxima acción de tipo llamada o WhatsApp) ────
// Al marcarla hecha se pregunta si contestó. Si no, se apunta y ya; si sí,
// recap, estatus si cambia y siguiente paso, como en una reunión.

export const esAccionDeLlamada = (kind?: string): boolean => kind === 'llamada' || kind === 'whatsapp'

export interface DatosLlamada {
  contesto: boolean
  recap?: string
  siguiente?: SiguientePaso
  estatus?: FirmasStatus
}

/**
 * La llamada hecha: apunte con resultado (contestó / no contestó) y recap,
 * la próxima acción se retira (App completa su tarea), y el estatus si
 * cambia. El siguiente paso NO va aquí: se pone con `conSiguientePaso` en
 * un segundo guardado, para que la tarea de la llamada se complete antes
 * de crear la del paso nuevo (si no, se reescribiría la misma tarea).
 */
export function aplicarCierreLlamada(f: FirmasEntry, datos: DatosLlamada, autor: Autor, ahora: string = new Date().toISOString()): FirmasEntry {
  const recap = datos.recap?.trim()
  const log: FirmasComment = {
    id: crypto.randomUUID(),
    text: `✓ Hecho: ${f.nextAction ?? 'llamada'}${recap ? `\n${recap}` : ''}`,
    date: ahora,
    author: autor.name,
    authorId: autor.id,
    kind: esAccionDeLlamada(f.nextActionKind) ? (f.nextActionKind as FirmasComment['kind']) : 'llamada',
    outcome: datos.contesto ? 'contesto' : 'no_contesto',
  }
  let comments = [...f.comments, log]
  let out: FirmasEntry = {
    ...f,
    nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined,
    comments,
  }
  if (datos.contesto && datos.estatus && datos.estatus !== f.status) {
    comments = [...comments, {
      id: crypto.randomUUID(),
      text: `${FIRMAS_CONFIG[f.status].label} → ${FIRMAS_CONFIG[datos.estatus].label}`,
      date: ahora,
      author: autor.name,
      authorId: autor.id,
      kind: 'estatus',
    }]
    out = {
      ...out,
      status: datos.estatus,
      statusUpdatedAt: ahora,
      signedAt: datos.estatus === 'firmado' ? (f.signedAt ?? ahora) : f.signedAt,
      comments,
    }
  }
  return out
}

/** Pone el siguiente paso como próxima acción de la tarjeta (segundo guardado tras el cierre) */
export function conSiguientePaso(f: FirmasEntry, s: SiguientePaso): FirmasEntry {
  if (!s.label.trim() && !s.date) return f
  return {
    ...f,
    nextAction: s.label.trim() || undefined,
    nextActionDate: s.date || undefined,
    nextActionAssignee: s.assigneeId || undefined,
    nextActionKind: s.kind || undefined,
  }
}
