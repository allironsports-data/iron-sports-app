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
  Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, PlayerActivity,
} from '../types'
import { fechaLocal, sumarDias } from './fechas'
import { norm } from './texto'

export type AgendaTipo = 'tarea' | 'llamada' | 'telefono' | 'reunion' | 'postpartido' | 'partido' | 'evento'
export type AgendaOrigen = 'tarea' | 'firmar' | 'postpartido' | 'captacion' | 'evento'
export type AgendaEstado = Task['status']

/** A dónde lleva «abrir»: la pantalla natural de cada item. Lo resuelve la vista. */
export type AgendaDestino =
  | { tipo: 'tarea'; taskId: string }
  | { tipo: 'firmar'; entryId: string }
  | { tipo: 'postpartido'; postpartidoId: string; taskId?: string }
  | { tipo: 'partido'; matchId: string }
  | { tipo: 'jugador'; playerId: string }

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
  playerNombre?: string
  categoria?: string
  estado: AgendaEstado
  /** Día (AAAA-MM-DD local) en que se completó, si se sabe */
  hechaEl?: string
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
  if (t.label === 'Reunión/Comida') return 'reunion'
  return 'tarea'
}

/** Día local de un ISO completo (completedAt) */
function diaDe(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return isNaN(d.getTime()) ? undefined : fechaLocal(d)
}

export function construirAgenda(input: AgendaInput): AgendaItem[] {
  const { tasks, firmasEntries, postpartidos, scoutingMatches, matchScouts, profiles, players, activities = [], rango } = input
  const items: AgendaItem[] = []
  const tareasPorId = new Map(tasks.map(t => [t.id, t]))
  const jugadoresPorId = new Map(players.map(p => [p.id, p]))
  const perfilPorAvatar = new Map(profiles.filter(p => p.avatar).map(p => [p.avatar, p.id]))
  const usadas = new Set<string>() // tareas que ya salen como acción de Firmar o postpartido

  // ── Próximas acciones de Firmar ──
  for (const e of firmasEntries) {
    if (e.status === 'firmado' || !(e.nextAction || e.nextActionDate)) continue
    const task = e.nextActionTaskId ? tareasPorId.get(e.nextActionTaskId) : undefined
    if (task) usadas.add(task.id)
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
    if (task) usadas.add(task.id)
    const match = pp.matchId ? partidosPorId.get(pp.matchId) : undefined
    const jugador = pp.playerId ? jugadoresPorId.get(pp.playerId) : undefined
    items.push({
      id: `postpartido:${pp.id}`,
      tipo: 'postpartido',
      titulo: match ? `Postpartido ${match.homeTeam} vs ${match.awayTeam}` : (task?.title ?? 'Postpartido'),
      personId: pp.assigneeId ?? task?.assigneeId ?? '',
      otrosIds: task?.watchers ?? [],
      fecha: task?.dueDate,
      playerId: jugador?.id,
      playerNombre: jugador?.name ?? pp.playerName,
      categoria: 'Postpartido',
      estado: task?.status ?? (pp.videoUrl ? 'completada' : 'pendiente'),
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
      playerNombre: jugador?.name,
      categoria: t.label,
      estado: t.status,
      hechaEl: diaDe(t.completedAt),
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
        ref: { matchId: m.id },
      })
    }
  }

  // ── Eventos (player_activities). Un evento de grupo es una fila por
  //    jugador con el mismo groupId: aquí sale una sola vez. ──
  const grupos = new Set<string>()
  for (const a of activities) {
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
      // Un evento no se «hace»: pasa. Lo de antes de hoy cuenta como pasado.
      estado: a.date.slice(0, 10) < input.hoy ? 'completada' : 'pendiente',
      prioridadAlta: false,
      origen: 'evento',
      abrir: { tipo: 'jugador', playerId: a.playerId },
      ref: { activityId: a.id },
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
    case 'evento':     return { estado: false, enCurso: false, reprogramar: false, reasignar: false }
    // La fecha y los scouts de un partido se cambian en Captación; aquí solo «visto»
    case 'captacion':  return { estado: true, enCurso: false, reprogramar: false, reasignar: false }
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

export interface SeccionesDia {
  vencidas: AgendaItem[]
  hoy: AgendaItem[]
  /** Próximos 7 días, un grupo por día con algo */
  proximos: { dia: string; items: AgendaItem[] }[]
  /** Con fecha a más de 7 días: no se pierden de vista */
  masAdelante: AgendaItem[]
  sinFecha: AgendaItem[]
  hechasHoy: AgendaItem[]
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

export function seccionesDelDia(items: AgendaItem[], hoy: string): SeccionesDia {
  const limite = sumarDias(hoy, 7)
  const s: SeccionesDia = { vencidas: [], hoy: [], proximos: [], masAdelante: [], sinFecha: [], hechasHoy: [] }
  const porDia = new Map<string, AgendaItem[]>()
  for (const it of items) {
    if (it.estado === 'completada') {
      // Un evento pasado no es algo «hecho hoy»
      if (it.origen !== 'evento' && it.hechaEl === hoy) s.hechasHoy.push(it)
      continue
    }
    if (!it.fecha) { s.sinFecha.push(it); continue }
    if (it.fecha < hoy) s.vencidas.push(it)
    else if (it.fecha === hoy) s.hoy.push(it)
    else if (it.fecha <= limite) {
      const arr = porDia.get(it.fecha)
      if (arr) arr.push(it); else porDia.set(it.fecha, [it])
    } else s.masAdelante.push(it)
  }
  s.vencidas.sort(porFecha)
  s.hoy.sort(ordenDelDia)
  s.proximos = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, its]) => ({ dia, items: its.sort(ordenDelDia) }))
  s.masAdelante.sort(porFecha)
  s.sinFecha.sort(ordenDelDia)
  s.hechasHoy.sort(porTitulo)
  return s
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
