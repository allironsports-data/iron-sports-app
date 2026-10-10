// ── Lista unificada de la agenda: lógica pura ────────────────────────
//
// Una sola lista con todo lo que el equipo tiene que hacer, venga de donde
// venga: tareas del tablero, próximas acciones del pipeline Firmar,
// postpartidos, partidos de Captación con scout asignado y eventos. La
// usan «Mi día» y (después) el calendario, la home y la ficha de jugador,
// para que todas esas pantallas cuenten lo mismo.
//
// Sin React ni Supabase: recibe los datos ya cargados y devuelve items.
// Los «días» son AAAA-MM-DD y se comparan como texto (ver lib/fechas.ts).
//
// Una misma cosa nunca sale dos veces: la tarea que generó una acción de
// Firmar o un postpartido NO se repite como tarea suelta; es su estado.

import type {
  Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, PlayerActivity, AgendaEvento,
} from '../types'
import { fechaLocal, sumarDias } from './fechas'
import { diasDeViaje } from './viajes'
import { SERVICIO_META, tipoDeServicio, tituloDeServicio, participantesDeServicio } from './serviciosAnalisis'
import { norm } from './texto'
import { reunionSinCerrar } from './reuniones'

export type AgendaTipo = 'tarea' | 'llamada' | 'telefono' | 'reunion' | 'postpartido' | 'partido' | 'evento' | 'viaje'
export type AgendaOrigen = 'tarea' | 'firmar' | 'postpartido' | 'captacion' | 'evento' | 'ofrecido'
export type AgendaEstado = Task['status']

/** A dónde lleva «abrir»: la pantalla natural de cada item. Lo resuelve la vista. */
export type AgendaDestino =
  | { tipo: 'tarea'; taskId: string }
  | { tipo: 'firmar'; entryId: string }
  | { tipo: 'postpartido'; postpartidoId: string; taskId?: string }
  | { tipo: 'partido'; matchId: string }
  | { tipo: 'jugador'; playerId: string }
  | { tipo: 'evento'; eventoId: string }
  | { tipo: 'ofrecido'; ofrecimientoId: string }

export interface AgendaItem {
  /** Único en la lista: origen + id (y scout, en partidos con varios) */
  id: string
  tipo: AgendaTipo
  titulo: string
  /** profiles.id del responsable; '' si no tiene */
  personId: string
  /** Otros perfiles a los que también «les toca» (watchers, participantes) */
  otrosIds: string[]
  /** AAAA-MM-DD */
  fecha?: string
  /** HH:MM (solo partidos) */
  hora?: string
  /** Jugador de Mantenimiento: el chip abre su ficha */
  playerId?: string
  /** Jugador de Captación: el chip abre su ficha de scouting */
  scoutingPlayerId?: string
  playerNombre?: string
  categoria?: string
  /** Partidos: esa persona ya ha metido su informe del partido */
  conInforme?: boolean
  /** Reunión del pipeline sin cerrar: id del evento (la fila enseña «Cerrar reunión») */
  cierreEventoId?: string
  /** Dónde es (eventos con lugar) */
  lugar?: string
  estado: AgendaEstado
  /** Día (AAAA-MM-DD local) en que se completó, si se sabe */
  hechaEl?: string
  /** Tareas hechas: qué pasó (resultado legible y nota), para la fila */
  cierre?: { resultado?: string; nota?: string }
  /**
   * Tarea en curso («proceso», como una renovación): no tiene fecha de fin
   * porque depende de muchas cosas, pero exige una nota cada semana.
   * `ultimaActualizacion` = ISO de la última nota (o nada si nunca hubo).
   */
  proceso?: { ultimaActualizacion?: string; diasSinActualizar: number }
  prioridadAlta: boolean
  origen: AgendaOrigen
  abrir: AgendaDestino
  /** ids de los registros reales, para completar/reprogramar/reasignar */
  ref: {
    taskId?: string
    firmasEntryId?: string
    postpartidoId?: string
    matchId?: string
    /** iniciales del scout (partidos con filas en scouting_match_scouts) */
    scout?: string
    activityId?: string
    eventoId?: string
  }
}

export interface AgendaInput {
  /** AAAA-MM-DD local */
  hoy: string
  tasks: Task[]
  firmasEntries: FirmasEntry[]
  postpartidos: Postpartido[]
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  /** Solo hace falta id + avatar: los partidos se asignan por iniciales */
  profiles: { id: string; avatar: string }[]
  players: Player[]
  activities?: PlayerActivity[]
  /** Eventos de agenda (tabla agenda_eventos) */
  eventos?: AgendaEvento[]
  /** "HH:MM" de ahora: una reunión de hoy cuenta como pasada si su hora ya llegó */
  ahoraHora?: string
  /** «partido|iniciales» de cada informe de partido ya escrito */
  informesPartido?: Set<string>
  /** Informes pedidos en Ofrecidos y aún sin escribir: uno por ofrecimiento, persona y tipo. `fecha` = para cuándo */
  informesPedidos?: { ofrecimientoId: string; jugador: string; equipo?: string; avatar: string; tipo: string; pedidoPor?: string; fecha?: string }[]
  /** ISO de la última nota (comentario) de cada tarea, para saber si un proceso está al día */
  ultimaNotaTarea?: Record<string, string>
  /** true = incluir los fines de contrato (de representación y con el club). Solo para admins. */
  vencimientos?: boolean
  /** Nombres de jugadores de Captación, para los eventos que apuntan a uno */
  nombreScouting?: (id: string) => string | undefined
  /**
   * Ventana de días (ambos incluidos) para partidos y eventos. Hay miles de
   * partidos históricos y un partido pasado sin marcar no es una «tarea
   * vencida»: quien llama decide qué días le interesan.
   */
  rango: { desde: string; hasta: string }
}

/** Tipo de item según el tipo de la próxima acción de Firmar */
export function tipoDeAccionFirmar(kind?: string): AgendaTipo {
  if (kind === 'telefono') return 'telefono'
  if (kind === 'reunion' || kind === 'entorno') return 'reunion'
  return 'llamada'
}

// Las tareas de Firmar llevan el icono delante del título («📞 Llamar · X»).
// Cuando la acción se completa, la tarjeta suelta la tarea y solo queda el
// título para saber qué era.
const EMOJI_TIPO: [string, AgendaTipo][] = [['📞', 'llamada'], ['💬', 'llamada'], ['🤝', 'reunion'], ['👪', 'reunion']]

function tipoDeTarea(t: Task): AgendaTipo {
  if (t.label === 'Postpartido') return 'postpartido'
  if (t.label === 'Scouting') {
    const hit = EMOJI_TIPO.find(([e]) => t.title.startsWith(e))
    if (hit) return hit[1]
  }
  if (t.label === 'Llamada') return 'llamada'
  if (t.label === 'Reunión' || t.label === 'Comida/Visita') return 'reunion'
  return 'tarea'
}

/** Tipo de item de un evento de agenda: decide el icono y la fila del calendario */
export function tipoDeEvento(tipo: string): AgendaTipo {
  const t = norm(tipo)
  if (t.startsWith('llamada')) return 'llamada'
  if (t.startsWith('partido')) return 'partido'
  if (/^(reunion|videollamada|cita|comida)/.test(t)) return 'reunion'
  return 'evento'
}

/** Días que una tarea completada sigue saliendo en las listas antes de archivarse sola */
export const DIAS_ARCHIVO = 30

/** Completada hace más de 30 días: se oculta de las listas (sigue en la base y en las estadísticas) */
export function estaArchivada(t: Pick<Task, 'status' | 'completedAt' | 'createdAt'>, hoy: string): boolean {
  if (t.status !== 'completada') return false
  const dia = diaDe(t.completedAt ?? t.createdAt)
  return !!dia && dia < sumarDias(hoy, -DIAS_ARCHIVO)
}

/** Día local de un ISO completo (completedAt) */
function diaDe(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return isNaN(d.getTime()) ? undefined : fechaLocal(d)
}

/** Días naturales entre dos AAAA-MM-DD (positivo si `hasta` es después) */
export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** Un partido visto sin informe sale como trabajo pendiente durante estos días */
/** Un postpartido se quiere a los dos días del partido */
export const DIAS_POSTPARTIDO = 2

export function construirAgenda(input: AgendaInput): AgendaItem[] {
  const { hoy, firmasEntries, postpartidos, scoutingMatches, matchScouts, profiles, players, activities = [], eventos = [], rango } = input
  // Tarea en curso = proceso: cuántos días lleva sin una nota
  const procesoDe = (t?: Task): AgendaItem['proceso'] => {
    if (!t || t.status !== 'en_progreso') return undefined
    const ultima = input.ultimaNotaTarea?.[t.id]
    const dia = diaDe(ultima ?? t.createdAt)
    return { ultimaActualizacion: ultima, diasSinActualizar: dia ? Math.max(0, diasEntre(dia, hoy)) : 0 }
  }
  const archivadas = new Set<string>()
  const tasks = input.tasks.filter(t => {
    if (!estaArchivada(t, hoy)) return true
    archivadas.add(t.id)
    return false
  })
  const items: AgendaItem[] = []
  const tareasPorId = new Map(tasks.map(t => [t.id, t]))
  const jugadoresPorId = new Map(players.map(p => [p.id, p]))
  const perfilPorAvatar = new Map(profiles.filter(p => p.avatar).map(p => [p.avatar, p.id]))
  const usadas = new Set<string>() // tareas que ya salen como acción de Firmar o postpartido

  // ── Próximas acciones de Firmar ──
  const eventosPorId = new Map(eventos.map(e => [e.id, e]))
  for (const e of firmasEntries) {
    if (e.status === 'firmado' || !(e.nextAction || e.nextActionDate)) continue
    const task = e.nextActionTaskId ? tareasPorId.get(e.nextActionTaskId) : undefined
    if (task) usadas.add(task.id)
    // Una reunión con evento en la agenda sale como evento (con hora, lugar y
    // el cierre cuando pasa), no también como acción: sería la misma fila dos veces
    if (e.nextActionEventoId && eventosPorId.has(e.nextActionEventoId)) continue
    items.push({
      id: `firmar:${e.id}`,
      tipo: tipoDeAccionFirmar(e.nextActionKind),
      titulo: e.nextAction || 'Próxima acción',
      personId: e.nextActionAssignee ?? task?.assigneeId ?? e.managers[0] ?? '',
      otrosIds: e.nextActionAssignee ? [] : e.managers.slice(1),
      fecha: e.nextActionDate,
      playerNombre: e.playerName,
      categoria: 'Scouting',
      estado: task && task.status !== 'completada' ? task.status : 'pendiente',
      proceso: procesoDe(task),
      prioridadAlta: task?.priority === 'alta',
      origen: 'firmar',
      abrir: { tipo: 'firmar', entryId: e.id },
      ref: { firmasEntryId: e.id, taskId: task?.id },
    })
  }

  // ── Postpartidos (la tarea vinculada lleva estado, fecha y responsable) ──
  const partidosPorId = new Map(scoutingMatches.map(m => [m.id, m]))
  for (const pp of postpartidos) {
    const task = pp.taskId ? tareasPorId.get(pp.taskId) : undefined
    // Su tarea está archivada (completada hace más de 30 días): el postpartido tampoco sale
    if (pp.taskId && archivadas.has(pp.taskId)) continue
    if (task) usadas.add(task.id)
    const match = pp.matchId ? partidosPorId.get(pp.matchId) : undefined
    const jugador = pp.playerId ? jugadoresPorId.get(pp.playerId) : undefined
    items.push({
      id: `postpartido:${pp.id}`,
      tipo: 'postpartido',
      titulo: match ? `Postpartido ${match.homeTeam} vs ${match.awayTeam}` : (task?.title ?? 'Postpartido'),
      personId: pp.assigneeId ?? task?.assigneeId ?? '',
      otrosIds: task?.watchers ?? [],
      // Sin fecha en la tarea, se quiere a los dos días del partido: un
      // postpartido es lo más fechable que hay, no un «algún día»
      fecha: task?.dueDate ?? (match ? sumarDias(match.date, DIAS_POSTPARTIDO) : undefined),
      playerId: jugador?.id,
      playerNombre: jugador?.name ?? pp.playerName,
      categoria: 'Postpartido',
      estado: task?.status ?? (pp.videoUrl ? 'completada' : 'pendiente'),
      proceso: procesoDe(task),
      hechaEl: diaDe(task?.completedAt),
      prioridadAlta: task?.priority === 'alta',
      origen: 'postpartido',
      abrir: { tipo: 'postpartido', postpartidoId: pp.id, taskId: task?.id },
      ref: { postpartidoId: pp.id, taskId: task?.id, matchId: pp.matchId },
    })
  }

  // ── Tareas del tablero ──
  for (const t of tasks) {
    if (usadas.has(t.id)) continue
    const jugador = t.playerId && t.playerId !== 'general' ? jugadoresPorId.get(t.playerId) : undefined
    items.push({
      id: `tarea:${t.id}`,
      tipo: tipoDeTarea(t),
      titulo: t.title,
      personId: t.assigneeId ?? '',
      otrosIds: t.watchers ?? [],
      fecha: t.dueDate?.slice(0, 10),
      playerId: jugador?.id,
      scoutingPlayerId: jugador ? undefined : t.scoutingPlayerId,
      playerNombre: jugador?.name ?? (t.scoutingPlayerId ? input.nombreScouting?.(t.scoutingPlayerId) : undefined),
      categoria: t.label,
      estado: t.status,
      proceso: procesoDe(t),
      hechaEl: diaDe(t.completedAt),
      cierre: t.cierre && (t.cierre.resultado || t.cierre.nota) ? { resultado: t.cierre.resultado, nota: t.cierre.nota } : undefined,
      prioridadAlta: t.priority === 'alta',
      origen: 'tarea',
      abrir: { tipo: 'tarea', taskId: t.id },
      ref: { taskId: t.id },
    })
  }

  // ── Partidos de Captación con scout asignado: uno por scout ──
  const scoutsPorPartido = new Map<string, ScoutingMatchScout[]>()
  for (const ms of matchScouts) {
    const arr = scoutsPorPartido.get(ms.matchId)
    if (arr) arr.push(ms); else scoutsPorPartido.set(ms.matchId, [ms])
  }
  for (const m of scoutingMatches) {
    if (m.date < rango.desde || m.date > rango.hasta) continue
    const base = {
      tipo: 'partido' as const,
      titulo: `${m.homeTeam} vs ${m.awayTeam}`,
      otrosIds: [],
      fecha: m.date,
      hora: m.time || undefined,
      categoria: 'Partido',
      prioridadAlta: false,
      origen: 'captacion' as const,
      abrir: { tipo: 'partido' as const, matchId: m.id },
    }
    const scouts = scoutsPorPartido.get(m.id)
    if (scouts && scouts.length > 0) {
      for (const s of scouts) {
        const personId = perfilPorAvatar.get(s.scout)
        if (!personId) continue
        items.push({
          ...base, id: `partido:${m.id}:${s.scout}`, personId,
          estado: s.status === 'visto' ? 'completada' : 'pendiente',
          hechaEl: s.status === 'visto' ? m.date : undefined,
          conInforme: input.informesPartido?.has(`${m.id}|${s.scout}`),
          ref: { matchId: m.id, scout: s.scout },
        })
      }
    } else if (m.assignedTo) {
      const personId = perfilPorAvatar.get(m.assignedTo)
      if (!personId) continue
      items.push({
        ...base, id: `partido:${m.id}`, personId,
        estado: m.status === 'visto' ? 'completada' : 'pendiente',
        hechaEl: m.status === 'visto' ? m.date : undefined,
        conInforme: input.informesPartido?.has(`${m.id}|${m.assignedTo}`),
        ref: { matchId: m.id },
      })
    }
  }

  // Un partido visto sin informe NO genera una tarea: marcar visto no obliga
  // a escribir. En el momento de marcarlo se pregunta si se ha olvidado el
  // informe (Captación y Mi día), y en el widget de partidos el scout sale
  // sin la ✓ hasta que lo escribe.

  // ── Eventos (player_activities). Un evento de grupo es una fila por
  //    jugador con el mismo groupId: aquí sale una sola vez. ──
  // Las actividades que nacieron de un evento de agenda ya salen como evento.
  // Se emparejan por el enlace que guarda el evento y, por si falta (eventos
  // antiguos o editados), también por contenido: misma fecha, jugador, tipo y
  // título. La actividad se apunta como «título — notas», de ahí el corte.
  const yaComoEvento = new Set(eventos.map(e => e.activityRef).filter(Boolean) as string[])
  const claveEvento = (fecha: string, playerId: string, tipo: string, titulo: string) =>
    `${fecha}|${playerId}|${norm(tipo)}|${norm(titulo)}`
  const mismoContenido = new Set(eventos.flatMap(e => e.playerIds.map(pid => claveEvento(e.fecha, pid, e.tipo, e.titulo || e.tipo))))
  const grupos = new Set<string>()
  for (const a of activities) {
    if (yaComoEvento.has(a.groupId ?? a.id)) continue
    if (a.date && mismoContenido.has(claveEvento(a.date.slice(0, 10), a.playerId, a.type, (a.notes ?? '').split(' — ')[0] || a.type))) continue
    if (!a.date || a.date < rango.desde || a.date > rango.hasta) continue
    if (a.groupId) {
      if (grupos.has(a.groupId)) continue
      grupos.add(a.groupId)
    }
    const jugador = jugadoresPorId.get(a.playerId)
    const mas = (a.linkedPlayerIds?.length ?? 1) - 1
    const participantes = a.participantProfileIds ?? []
    items.push({
      id: `evento:${a.groupId ?? a.id}`,
      tipo: 'evento',
      titulo: a.notes ? `${a.type} — ${a.notes}` : a.type,
      personId: a.authorId ?? participantes[0] ?? '',
      otrosIds: participantes,
      fecha: a.date.slice(0, 10),
      playerId: jugador?.id,
      playerNombre: jugador ? (mas > 0 ? `${jugador.name} +${mas}` : jugador.name) : undefined,
      categoria: 'Evento',
      // Un evento no se «hace» ni vence: no es una tarea. Nunca sale tachado.
      estado: 'pendiente',
      prioridadAlta: false,
      origen: 'evento',
      abrir: { tipo: 'jugador', playerId: a.playerId },
      ref: { activityId: a.id },
    })
  }

  // ── Informes pedidos en Ofrecidos: una tarea para quien tiene que escribirlo ──
  for (const pet of input.informesPedidos ?? []) {
    const personId = perfilPorAvatar.get(pet.avatar)
    if (!personId) continue
    items.push({
      id: `ofrecido:${pet.ofrecimientoId}:${pet.avatar}:${pet.tipo}`,
      tipo: 'tarea',
      titulo: `Informe ${pet.tipo} pedido — ${pet.jugador}${pet.equipo ? ` (${pet.equipo})` : ''}`,
      personId,
      otrosIds: [],
      fecha: pet.fecha,
      categoria: 'Ofrecidos',
      estado: 'pendiente',
      prioridadAlta: false,
      origen: 'ofrecido',
      abrir: { tipo: 'ofrecido', ofrecimientoId: pet.ofrecimientoId },
      ref: {},
    })
  }

  // ── Fines de contrato (solo admins): de representación y con el club ──
  if (input.vencimientos) {
    for (const p of players) {
      const fechas: [string | undefined, string][] = [
        [p.representationContract?.end, 'Fin del contrato de representación'],
        [p.clubContract?.endDate, 'Fin del contrato con el club'],
      ]
      for (const [fecha, titulo] of fechas) {
        const dia = fecha?.slice(0, 10)
        if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia < rango.desde || dia > rango.hasta) continue
        items.push({
          id: `vence:${p.id}:${titulo}`,
          tipo: 'evento',
          titulo,
          personId: p.managedBy?.[0] ?? '',
          otrosIds: p.managedBy?.slice(1) ?? [],
          fecha: dia,
          playerId: p.id,
          playerNombre: p.name,
          categoria: 'Vencimiento',
          estado: 'pendiente',
          prioridadAlta: true,
          origen: 'evento',
          abrir: { tipo: 'jugador', playerId: p.id },
          ref: {},
        })
      }
    }
  }

  // ── Sesiones de videoanálisis de la ficha del jugador (Rendimiento → Vídeo) ──
  // Viven dentro del jugador; aquí salen como evento, a nombre de sus encargados.
  for (const p of players) {
    for (const v of p.videoSessions ?? []) {
      const dia = v.date?.slice(0, 10)
      if (!dia || dia < rango.desde || dia > rango.hasta) continue
      // Es de quienes han participado (analistas…); los antiguos, sin nadie puesto, de los gestores del jugador
      const quienes = participantesDeServicio(v)
      const tipoServicio = SERVICIO_META[tipoDeServicio(v)].label
      items.push({
        id: `video:${p.id}:${v.id}`,
        tipo: 'evento',
        titulo: `${tipoServicio} — ${tituloDeServicio(v)}`,
        personId: quienes[0] ?? p.managedBy?.[0] ?? '',
        otrosIds: quienes.length > 0 ? quienes.slice(1) : (p.managedBy?.slice(1) ?? []),
        fecha: dia,
        hora: v.time || undefined,
        lugar: v.lugar || undefined,
        playerId: p.id,
        playerNombre: p.name,
        categoria: tipoServicio,
        estado: 'pendiente',
        prioridadAlta: false,
        origen: 'evento',
        abrir: { tipo: 'jugador', playerId: p.id },
        ref: {},
      })
    }
  }

  // ── Eventos de agenda (con o sin jugador) ──
  for (const e of eventos) {
    // Un viaje dura varios días: sale en cada uno, a nombre de quienes viajan
    if (norm(e.tipo) === 'viaje') {
      const dias = diasDeViaje(e.fecha, e.fechaFin)
      dias.forEach((dia, i) => {
        if (dia < rango.desde || dia > rango.hasta) return
        items.push({
          id: `evento:${e.id}:${dia}`,
          tipo: 'viaje',
          titulo: `${e.titulo || 'Viaje'}${e.lugar ? ` · ${e.lugar}` : ''}${dias.length > 1 ? ` (día ${i + 1} de ${dias.length})` : ''}`,
          personId: e.participantIds[0] ?? e.authorId ?? '',
          otrosIds: e.participantIds.slice(1),
          fecha: dia,
          categoria: 'Viaje',
          lugar: e.lugar,
          estado: 'pendiente',
          prioridadAlta: false,
          origen: 'evento',
          abrir: { tipo: 'evento', eventoId: e.id },
          ref: { eventoId: e.id },
        })
      })
      continue
    }
    // Reunión del pipeline ya pasada y sin cerrar: pendiente de hoy para quienes
    // asistieron, hasta que alguien apunte el recap y el siguiente paso
    const sinCerrar = reunionSinCerrar(e, hoy, input.ahoraHora)
      && firmasEntries.some(f => f.scoutingPlayerId === e.scoutingPlayerId && f.status !== 'firmado')
    if (sinCerrar && hoy >= rango.desde && hoy <= rango.hasta) {
      items.push({
        id: `cierre:${e.id}`,
        tipo: 'reunion',
        titulo: `Cerrar reunión: ${e.titulo || e.tipo}`,
        personId: e.participantIds[0] ?? e.authorId ?? '',
        otrosIds: e.participantIds.slice(1),
        fecha: hoy,
        playerNombre: input.nombreScouting?.(e.scoutingPlayerId ?? ''),
        scoutingPlayerId: e.scoutingPlayerId,
        categoria: 'Reunión sin cerrar',
        estado: 'pendiente',
        prioridadAlta: false,
        origen: 'evento',
        abrir: { tipo: 'evento', eventoId: e.id },
        ref: { eventoId: e.id },
        cierreEventoId: e.id,
      })
    }
    if (e.fecha < rango.desde || e.fecha > rango.hasta) continue
    const jugador = e.playerIds.length > 0 ? jugadoresPorId.get(e.playerIds[0]) : undefined
    const mas = e.playerIds.length - 1
    const nombre = jugador
      ? (mas > 0 ? `${jugador.name} +${mas}` : jugador.name)
      : e.scoutingPlayerId ? input.nombreScouting?.(e.scoutingPlayerId) : undefined
    items.push({
      id: `evento:${e.id}`,
      tipo: tipoDeEvento(e.tipo),
      titulo: e.titulo || e.tipo,
      // El evento es de quienes asisten, no de quien lo apunta: si lo creo para
      // otros dos, sale a su nombre y no en mi lista. Sin asistentes, del autor.
      personId: e.participantIds[0] ?? e.authorId ?? '',
      otrosIds: e.participantIds.slice(1),
      fecha: e.fecha,
      hora: e.hora,
      playerId: jugador?.id,
      playerNombre: nombre,
      categoria: e.tipo,
      lugar: e.lugar,
      estado: 'pendiente',
      prioridadAlta: false,
      origen: 'evento',
      abrir: { tipo: 'evento', eventoId: e.id },
      ref: { eventoId: e.id },
      cierreEventoId: sinCerrar ? e.id : undefined,
    })
  }

  return items
}

/** Un item «es de» alguien si es responsable, watcher o participante (mismo criterio que el tablero). */
export function itemEsDe(it: AgendaItem, profileId: string): boolean {
  return it.personId === profileId || it.otrosIds.includes(profileId)
}

/** Lo que se puede cambiar de cada item desde la lista */
export function permisosItem(it: AgendaItem): { estado: boolean; enCurso: boolean; reprogramar: boolean; reasignar: boolean } {
  switch (it.origen) {
    // Un evento no se «hace»; y un informe pedido en Ofrecidos se completa escribiéndolo allí, no desde aquí
    case 'evento':
    case 'ofrecido':   return { estado: false, enCurso: false, reprogramar: false, reasignar: false }
    // La fecha y los scouts de un partido se cambian en Captación; aquí solo «visto».
    // Un informe pendiente se completa escribiéndolo en la ficha del partido.
    case 'captacion':  return esInformePendiente(it)
      ? { estado: false, enCurso: false, reprogramar: false, reasignar: false }
      : { estado: true, enCurso: false, reprogramar: false, reasignar: false }
    // Sin tarea vinculada no hay dónde guardar el «en curso»
    case 'firmar':     return { estado: true, enCurso: !!it.ref.taskId, reprogramar: true, reasignar: true }
    case 'postpartido': return { estado: !!it.ref.taskId, enCurso: !!it.ref.taskId, reprogramar: !!it.ref.taskId, reasignar: !!it.ref.taskId }
    default:           return { estado: true, enCurso: true, reprogramar: true, reasignar: true }
  }
}

/** Siguiente estado al pulsar el círculo: pendiente → en curso → hecha → pendiente */
export function siguienteEstado(it: AgendaItem): AgendaEstado {
  const p = permisosItem(it)
  if (it.estado === 'pendiente') return p.enCurso ? 'en_progreso' : 'completada'
  if (it.estado === 'en_progreso') return 'completada'
  return 'pendiente'
}

// ── Secciones de «Mi día» ────────────────────────────────────────────
//
// El día tiene dos naturalezas y se separan: la AGENDA (citas: partidos,
// eventos, viajes… se asiste, no se «hace») y el TRABAJO (tareas, llamadas,
// postpartidos, informes… se hace o no se hace). Lo atrasado no es una
// sección aparte: es trabajo de hoy, con retraso, y va el primero. Las
// tareas en curso son procesos: salen siempre. Lo que no tiene fecha es
// «algún día» y vive en la bandeja, fuera del día.

export interface SeccionesDia {
  /** Citas de hoy, por hora */
  agenda: AgendaItem[]
  /** Para hacer hoy: trabajo con fecha de hoy o anterior (lo atrasado primero) */
  hoy: AgendaItem[]
  /** Subconjunto de `hoy` con la fecha ya pasada (para contadores y avisos) */
  vencidas: AgendaItem[]
  /** Tareas en curso (procesos): tengan la fecha que tengan, la más desatendida primero */
  procesos: AgendaItem[]
  /** Próximos 7 días, un grupo por día con algo */
  proximos: { dia: string; items: AgendaItem[] }[]
  /** Con fecha a más de 7 días: no se pierden de vista */
  masAdelante: AgendaItem[]
  /** Sin fecha («algún día»): no es del día, se mira aparte */
  bandeja: AgendaItem[]
  hechasHoy: AgendaItem[]
}

/** Informe de partido pendiente (partido visto sin informe): trabajo, aunque venga de Captación */
export function esInformePendiente(it: AgendaItem): boolean {
  return it.origen === 'captacion' && it.categoria === 'Informe de partido'
}

/** Cita (se asiste) frente a trabajo (se hace). «Cerrar reunión» y el informe pendiente son trabajo. */
export function esCita(it: AgendaItem): boolean {
  if (it.origen === 'captacion') return !esInformePendiente(it)
  if (it.origen === 'evento') return !it.cierreEventoId || it.id.startsWith('evento:')
  return false
}

const porTitulo = (a: AgendaItem, b: AgendaItem) => a.titulo.localeCompare(b.titulo)

/** Con hora primero y por hora; luego en curso, prioridad alta y alfabético */
function ordenDelDia(a: AgendaItem, b: AgendaItem): number {
  if (a.hora !== b.hora) {
    if (!a.hora) return 1
    if (!b.hora) return -1
    return a.hora.localeCompare(b.hora)
  }
  const enCurso = Number(b.estado === 'en_progreso') - Number(a.estado === 'en_progreso')
  if (enCurso) return enCurso
  const prio = Number(b.prioridadAlta) - Number(a.prioridadAlta)
  return prio || porTitulo(a, b)
}

const porFecha = (a: AgendaItem, b: AgendaItem) =>
  (a.fecha ?? '').localeCompare(b.fecha ?? '') || ordenDelDia(a, b)

/** Procesos: el que lleva más días sin nota, primero */
const porDesatencion = (a: AgendaItem, b: AgendaItem) =>
  (b.proceso?.diasSinActualizar ?? 0) - (a.proceso?.diasSinActualizar ?? 0) || porTitulo(a, b)

export function seccionesDelDia(items: AgendaItem[], hoy: string): SeccionesDia {
  const limite = sumarDias(hoy, 7)
  const s: SeccionesDia = { agenda: [], hoy: [], vencidas: [], procesos: [], proximos: [], masAdelante: [], bandeja: [], hechasHoy: [] }
  const porDia = new Map<string, AgendaItem[]>()
  for (const it of items) {
    if (it.estado === 'completada') {
      if (it.hechaEl === hoy) s.hechasHoy.push(it)
      continue
    }
    const cita = esCita(it)
    // Un proceso es de hoy siempre: tenga fecha, no la tenga, o sea para dentro de un mes
    if (it.estado === 'en_progreso' && !cita) { s.procesos.push(it); continue }
    if (!it.fecha) { s.bandeja.push(it); continue }
    if (it.fecha < hoy) {
      // Una cita pasada simplemente ya ocurrió; el trabajo atrasado es de hoy, con retraso
      if (!cita) { s.hoy.push(it); s.vencidas.push(it) }
    }
    else if (it.fecha === hoy) (cita ? s.agenda : s.hoy).push(it)
    else if (it.fecha <= limite) {
      const arr = porDia.get(it.fecha)
      if (arr) arr.push(it); else porDia.set(it.fecha, [it])
    } else s.masAdelante.push(it)
  }
  s.agenda.sort(ordenDelDia)
  // Hoy: lo atrasado primero (lo más antiguo arriba), luego lo de hoy
  s.hoy.sort((a, b) => {
    const ra = a.fecha! < hoy, rb = b.fecha! < hoy
    if (ra !== rb) return ra ? -1 : 1
    return ra ? porFecha(a, b) : ordenDelDia(a, b)
  })
  s.vencidas.sort(porFecha)
  s.procesos.sort(porDesatencion)
  s.proximos = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, its]) => ({ dia, items: its.sort(ordenDelDia) }))
  s.masAdelante.sort(porFecha)
  s.bandeja.sort(ordenDelDia)
  s.hechasHoy.sort(porTitulo)
  return s
}

// ── Procesos: actualización semanal obligatoria ──────────────────────

/** Un proceso sin nota desde hace tantos días pide actualización */
export const DIAS_ACTUALIZACION_PROCESO = 7

/** Procesos de los que `personaId` es responsable y llevan una semana o más sin nota */
export function procesosSinActualizar(items: AgendaItem[], personaId: string): AgendaItem[] {
  return items
    .filter(it => it.estado === 'en_progreso' && it.proceso && it.personId === personaId
      && !!it.ref.taskId && it.proceso.diasSinActualizar >= DIAS_ACTUALIZACION_PROCESO)
    .sort(porDesatencion)
}

// ── Cierre del día ───────────────────────────────────────────────────

/** A partir de esta hora, lo que queda abierto para hoy pide decidir qué se hace con ello */
export const HORA_CIERRE_DIA = '18:00'

/** Trabajo de hoy del que `personaId` es responsable, sigue abierto y se puede mover (si ya es hora de cerrar el día).
 *  Lo adjunto (lo lleva otra persona) no entra: decidir qué hacer con ello no es cosa de quien solo lo sigue. */
export function pendientesDeCierre(s: SeccionesDia, personaId: string, ahoraHora?: string): AgendaItem[] {
  if (!ahoraHora || ahoraHora < HORA_CIERRE_DIA) return []
  return s.hoy.filter(it => it.personId === personaId && permisosItem(it).reprogramar)
}

/** Viernes de esta semana (el mismo día si hoy es viernes); en fin de semana, el viernes siguiente */
export function viernesSemana(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  const dow = (new Date(y, m - 1, d, 12).getDay() + 6) % 7 // 0 = lunes
  return sumarDias(hoy, dow <= 4 ? 4 - dow : 11 - dow)
}

/** Categorías presentes, con su recuento, de más a menos */
export function categoriasDe(items: AgendaItem[]): { categoria: string; n: number }[] {
  const m = new Map<string, number>()
  for (const it of items) if (it.categoria) m.set(it.categoria, (m.get(it.categoria) ?? 0) + 1)
  return [...m.entries()].map(([categoria, n]) => ({ categoria, n }))
    .sort((a, b) => b.n - a.n || a.categoria.localeCompare(b.categoria))
}

/** Buscador de texto: título, jugador y categoría, sin acentos ni mayúsculas */
export function coincideTexto(it: AgendaItem, q: string): boolean {
  const n = norm(q)
  if (!n) return true
  return norm(`${it.titulo} ${it.playerNombre ?? ''} ${it.categoria ?? ''}`).includes(n)
}

/** Lunes de la semana siguiente a `hoy` (AAAA-MM-DD) */
export function lunesSiguiente(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  const dow = (new Date(y, m - 1, d, 12).getDay() + 6) % 7 // 0 = lunes
  return sumarDias(hoy, 7 - dow)
}
