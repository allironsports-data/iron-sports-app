// ── «Mi día»: lógica pura ─────────────────────────────────────────────
//
// Junta en una sola lista lo que una persona tiene que hacer HOY:
//   · partidos de Captación de hoy que tiene asignados (y no ha visto)
//   · próximas acciones del pipeline Firmar vencidas o de hoy
//   · tareas del tablero vencidas, de hoy o en curso sin fecha
//   · postpartidos de los que es responsable y no ha completado
//
// Sin React ni Supabase: recibe los datos ya cargados en App y devuelve
// items ordenados. Los «días» son AAAA-MM-DD y se comparan como texto
// (ver src/lib/fechas.ts).

import type {
  Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, ScoutingPlayer,
} from '../types'

export type MiDiaTipo = 'partido' | 'accion' | 'tarea' | 'postpartido'

export interface MiDiaItem {
  id: string
  tipo: MiDiaTipo
  /** "HH:MM" si se conoce (solo partidos) */
  hora?: string
  titulo: string
  subtitulo: string
  /** true si la fecha ya pasó (nunca «vencido» por vencer hoy) */
  vencido: boolean
  /** ids para abrir/completar desde la vista */
  ref: {
    taskId?: string
    matchId?: string
    firmasEntryId?: string
    playerId?: string
    scoutingPlayerId?: string
    postpartidoId?: string
  }
}

export interface MiDiaInput {
  /** profiles.id de la persona */
  profileId: string
  /** profiles.avatar (iniciales) — así se asignan los partidos */
  avatar?: string
  /** AAAA-MM-DD local */
  hoy: string
  tasks: Task[]
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  firmasEntries: FirmasEntry[]
  postpartidos: Postpartido[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
}

const ORDEN_TIPO: Record<MiDiaTipo, number> = { partido: 0, accion: 1, tarea: 2, postpartido: 3 }

const FIRMAS_KIND_LABEL: Record<string, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', reunion: 'Reunión', entorno: 'Entorno', nota: 'Nota',
}

/** Fecha corta "2 sep" para subtítulos de vencidos. */
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return y && m && d ? `${d} ${meses[m - 1]}` : iso
}

/** Una tarea «es de» alguien si es responsable o watcher (mismo criterio que el tablero). */
export function tareaDe(t: Task, profileId: string): boolean {
  return t.assigneeId === profileId || (t.watchers ?? []).includes(profileId)
}

/** Partidos de un día asignados a una persona: por scouts del partido o, si no tiene, por assignedTo. */
export function partidosAsignados(
  matches: ScoutingMatch[], matchScouts: ScoutingMatchScout[], avatar: string | undefined, hoy: string,
): { match: ScoutingMatch; scout?: ScoutingMatchScout }[] {
  if (!avatar) return []
  const scoutsPorPartido = new Map<string, ScoutingMatchScout[]>()
  for (const ms of matchScouts) {
    const arr = scoutsPorPartido.get(ms.matchId)
    if (arr) arr.push(ms); else scoutsPorPartido.set(ms.matchId, [ms])
  }
  const out: { match: ScoutingMatch; scout?: ScoutingMatchScout }[] = []
  for (const m of matches) {
    if (m.date !== hoy) continue
    const scouts = scoutsPorPartido.get(m.id)
    if (scouts && scouts.length > 0) {
      const mio = scouts.find(s => s.scout === avatar)
      if (mio && mio.status !== 'visto') out.push({ match: m, scout: mio })
    } else if (m.assignedTo === avatar && m.status !== 'visto') {
      out.push({ match: m })
    }
  }
  return out
}

export function construirMiDia(input: MiDiaInput): MiDiaItem[] {
  const { profileId, avatar, hoy, tasks, scoutingMatches, matchScouts, firmasEntries, postpartidos, players, scoutingPlayers } = input
  const items: MiDiaItem[] = []
  const nombreJugador = (id?: string) => id ? players.find(p => p.id === id)?.name : undefined
  const equipoScouting = (id?: string) => id ? scoutingPlayers.find(p => p.id === id)?.team : undefined
  const tareasPorId = new Map(tasks.map(t => [t.id, t]))

  // ── Partidos de hoy ──
  for (const { match: m, scout } of partidosAsignados(scoutingMatches, matchScouts, avatar, hoy)) {
    const modo = scout?.viewMode ?? m.viewMode
    const sub = [m.competition, modo === 'campo' ? 'En el campo' : modo === 'video' ? 'Por vídeo' : undefined]
      .filter(Boolean).join(' · ')
    items.push({
      id: `partido:${m.id}`, tipo: 'partido', hora: m.time || undefined,
      titulo: `${m.homeTeam} vs ${m.awayTeam}`, subtitulo: sub || 'Partido de Captación',
      vencido: false, ref: { matchId: m.id },
    })
  }

  // ── Acciones del pipeline Firmar ──
  // Si la acción ya generó una tarea del tablero, la tarea no se repite abajo.
  const tareasDeAcciones = new Set<string>()
  for (const e of firmasEntries) {
    if (e.status === 'firmado' || !e.nextActionDate || e.nextActionDate > hoy) continue
    const mia = e.nextActionAssignee ? e.nextActionAssignee === profileId : e.managers.includes(profileId)
    if (!mia) continue
    if (e.nextActionTaskId) tareasDeAcciones.add(e.nextActionTaskId)
    const vencido = e.nextActionDate < hoy
    const kind = FIRMAS_KIND_LABEL[e.nextActionKind ?? '']
    const equipo = equipoScouting(e.scoutingPlayerId) ?? e.knownTeam
    const sub = [kind, equipo ?? e.zone, vencido ? `desde el ${fechaCorta(e.nextActionDate)}` : undefined]
      .filter(Boolean).join(' · ')
    items.push({
      id: `accion:${e.id}`, tipo: 'accion',
      titulo: `${e.nextAction || 'Próxima acción'} · ${e.playerName}`, subtitulo: sub,
      vencido, ref: { firmasEntryId: e.id, taskId: e.nextActionTaskId, scoutingPlayerId: e.scoutingPlayerId },
    })
  }

  // ── Postpartidos míos sin completar (la tarea vinculada lleva el estado) ──
  const tareasDePostpartidos = new Set<string>()
  for (const pp of postpartidos) {
    if (pp.assigneeId !== profileId) continue
    const task = pp.taskId ? tareasPorId.get(pp.taskId) : undefined
    if (task?.status === 'completada' || pp.videoUrl) continue
    if (pp.taskId) tareasDePostpartidos.add(pp.taskId)
    const match = pp.matchId ? scoutingMatches.find(m => m.id === pp.matchId) : undefined
    const jugador = nombreJugador(pp.playerId) ?? pp.playerName ?? 'Jugador'
    const vencido = !!task?.dueDate && task.dueDate < hoy
    const sub = [match ? `${match.homeTeam} vs ${match.awayTeam}` : undefined, match?.date ? fechaCorta(match.date) : undefined]
      .filter(Boolean).join(' · ')
    items.push({
      id: `postpartido:${pp.id}`, tipo: 'postpartido',
      titulo: `Postpartido · ${jugador}`, subtitulo: sub || 'Informe pendiente',
      vencido, ref: { postpartidoId: pp.id, taskId: pp.taskId, matchId: pp.matchId, playerId: pp.playerId },
    })
  }

  // ── Tareas: vencidas, de hoy, o en curso sin fecha ──
  for (const t of tasks) {
    if (t.status === 'completada' || !tareaDe(t, profileId)) continue
    if (tareasDeAcciones.has(t.id) || tareasDePostpartidos.has(t.id)) continue
    const toca = t.dueDate ? t.dueDate <= hoy : t.status === 'en_progreso'
    if (!toca) continue
    const vencido = !!t.dueDate && t.dueDate < hoy
    const jugador = t.playerId && t.playerId !== 'general' ? nombreJugador(t.playerId) : undefined
    const sub = [
      jugador, t.label, t.priority === 'alta' ? 'Prioridad alta' : undefined,
      vencido ? `vencía el ${fechaCorta(t.dueDate!)}` : !t.dueDate ? 'En curso' : undefined,
    ].filter(Boolean).join(' · ')
    items.push({
      id: `tarea:${t.id}`, tipo: 'tarea', titulo: t.title, subtitulo: sub || 'Tarea',
      vencido, ref: { taskId: t.id, playerId: t.playerId && t.playerId !== 'general' ? t.playerId : undefined },
    })
  }

  // Orden: vencidos primero, luego por hora (sin hora al final), luego por tipo, luego alfabético
  return items.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    if (a.hora !== b.hora) {
      if (!a.hora) return 1
      if (!b.hora) return -1
      return a.hora.localeCompare(b.hora)
    }
    if (ORDEN_TIPO[a.tipo] !== ORDEN_TIPO[b.tipo]) return ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
    return a.titulo.localeCompare(b.titulo)
  })
}

/** Contadores para la cabecera. */
export function contarMiDia(items: MiDiaItem[]): { partidos: number; acciones: number; tareas: number; postpartidos: number; vencidos: number } {
  const c = { partidos: 0, acciones: 0, tareas: 0, postpartidos: 0, vencidos: 0 }
  for (const it of items) {
    if (it.tipo === 'partido') c.partidos++
    else if (it.tipo === 'accion') c.acciones++
    else if (it.tipo === 'tarea') c.tareas++
    else c.postpartidos++
    if (it.vencido) c.vencidos++
  }
  return c
}

/** "miércoles 2 de septiembre" a partir de AAAA-MM-DD (sin pasar por UTC). */
export function tituloDia(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  // Sin toLocaleDateString: el formato varía según el ICU del navegador/Node (coma o no)
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dt = new Date(y, m - 1, d, 12)
  return `${dias[dt.getDay()]} ${d} de ${meses[m - 1]}`
}
