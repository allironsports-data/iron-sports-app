// ── Volumen de trabajo del equipo ────────────────────────────────────
//
// Reduce todo lo que la app registra como «trabajo hecho» a una lista de
// ACCIONES con fecha, persona y fuente, y las agrega por semana o por mes.
// Cada acción tiene dos medidas que se enseñan siempre juntas:
//   · bruto  → 1 por acción (recuento puro, sin opinión)
//   · puntos → peso por esfuerzo (PESOS, abajo; se puede ajustar sin tocar nada más)
//
// Fuentes (7): tareas, eventos, partidos vistos, informes, postpartidos,
// pipeline (Firmar) y distribución. Todo sale de los datos ya cargados en
// App.tsx: no hay migración ni consulta nueva.
//
// Reglas para no contar dos veces la misma cosa:
//   · La tarea de un postpartido cuenta solo como postpartido.
//   · El apunte automático «✓ Hecho: …» que deja Firmar al completar la tarea
//     de una próxima acción NO cuenta (la tarea ya cuenta como tarea).
//   · Los apuntes de estatus (automáticos) no cuentan.
//   · Un apunte de Firmar nacido de un evento de agenda (eventoId) no cuenta:
//     el evento ya cuenta como evento.
//   · Un evento con varios asistentes da crédito a cada uno, pero en el total
//     del equipo cuenta UNA vez (clave común: se deduplica por `clave`).

import type {
  Task, AgendaEvento, ScoutingMatch, ScoutingMatchScout, ScoutingReport, ScoutingInfo,
  Postpartido, FirmasEntry, ClubNegotiation,
} from '../types'
import type { Profile } from '../contexts/AuthContext'
import { fechaLocal, lunesDe, parseDia } from './fechas'

export type Fuente = 'tareas' | 'eventos' | 'partidos' | 'informes' | 'postpartidos' | 'pipeline' | 'distribucion'

export const FUENTES: Fuente[] = ['tareas', 'eventos', 'partidos', 'informes', 'postpartidos', 'pipeline', 'distribucion']

export const FUENTE_META: Record<Fuente, { label: string; corto: string; color: string; texto: string }> = {
  tareas:       { label: 'Tareas',          corto: 'Tar',  color: 'bg-slate-500',   texto: 'text-slate-600' },
  eventos:      { label: 'Eventos',         corto: 'Eve',  color: 'bg-sky-500',     texto: 'text-sky-700' },
  partidos:     { label: 'Partidos vistos', corto: 'Par',  color: 'bg-emerald-500', texto: 'text-emerald-700' },
  informes:     { label: 'Informes',        corto: 'Inf',  color: 'bg-blue-600',    texto: 'text-blue-700' },
  postpartidos: { label: 'Postpartidos',    corto: 'Post', color: 'bg-violet-500',  texto: 'text-violet-700' },
  pipeline:     { label: 'Pipeline',        corto: 'Pipe', color: 'bg-amber-500',   texto: 'text-amber-700' },
  distribucion: { label: 'Distribución',    corto: 'Dist', color: 'bg-rose-500',    texto: 'text-rose-700' },
}

/** Pesos por esfuerzo. Cambiar aquí = cambia en toda la pestaña (y en el glosario). */
export const PESOS = {
  tarea: 1,
  tareaAlta: 2,
  evento: 2,
  eventoLigero: 1,        // Llamada, Email, Nota general
  eventoPesado: 4,        // Viaje, Visita presencial
  partidoCampo: 4,
  partidoVideo: 3,
  informe: 3,
  informeConConclusion: 4,
  info: 2,                // informes de entorno / contractual / mercado
  postpartido: 5,
  pipeReunion: 3,
  pipeLlamada: 1,         // llamada, teléfono
  pipeApunte: 0.5,        // whatsapp, nota, entorno
  firmado: 10,
  negNueva: 1,
  negUpdate: 1,
  negCerrada: 5,
} as const

const EVENTO_LIGERO = new Set(['Llamada', 'Email', 'Nota general'])
const EVENTO_PESADO = new Set(['Viaje', 'Visita presencial'])

export interface Accion {
  fuente: Fuente
  /** Subtipo legible (para el detalle / CSV): «Reunión», «Partido en campo», «Firmado»… */
  sub: string
  /** AAAA-MM-DD en hora local */
  dia: string
  /** profiles.id de quien se lleva el crédito */
  profileId: string
  puntos: number
  /** Identidad de la cosa subyacente: dos acciones con la misma clave son la misma cosa vista por dos personas */
  clave: string
  /** Texto corto para listar (título de la tarea, jugador, partido…) */
  texto?: string
}

export interface DatosVolumen {
  tasks: Task[]
  eventos: AgendaEvento[]
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  scoutingReports: ScoutingReport[]
  scoutingInfos: ScoutingInfo[]
  postpartidos: Postpartido[]
  firmasEntries: FirmasEntry[]
  negotiations: ClubNegotiation[]
  profiles: Profile[]
}

/** Día local AAAA-MM-DD de un ISO (con hora) o de un AAAA-MM-DD. Vacío si no hay fecha válida. */
export function diaDe(iso?: string | null): string | undefined {
  if (!iso) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  return isNaN(d.getTime()) ? undefined : fechaLocal(d)
}

const esVeredicto = (c?: string) => c === 'Seguir' || c === 'Llamar' || c === 'Firmar' || c === 'Descartar'

/** Todas las acciones registradas en la app, sin filtrar por fecha. */
export function extraerAcciones(d: DatosVolumen): Accion[] {
  const out: Accion[] = []
  const porAvatar = new Map<string, string>()
  const porNombre = new Map<string, string>()
  for (const p of d.profiles) {
    if (p.avatar) porAvatar.set(p.avatar, p.id)
    if (p.name) porNombre.set(p.name.trim().toLowerCase(), p.id)
  }
  const idDeAvatar = (a?: string | null) => (a ? porAvatar.get(a) : undefined)
  const idDeNombre = (n?: string | null) => (n ? porNombre.get(n.trim().toLowerCase()) : undefined)
  const add = (a: Accion) => { if (a.dia && a.profileId) out.push(a) }

  // ── Postpartidos (antes que tareas: su tarea no cuenta como tarea) ──
  const tareasPostpartido = new Set<string>()
  const tareaPorId = new Map(d.tasks.map(t => [t.id, t]))
  for (const pp of d.postpartidos) {
    if (!pp.taskId) continue
    tareasPostpartido.add(pp.taskId)
    const t = tareaPorId.get(pp.taskId)
    if (!t || t.status !== 'completada') continue
    const dia = diaDe(t.completedAt)
    if (!dia) continue
    add({
      fuente: 'postpartidos', sub: 'Postpartido', dia,
      profileId: pp.assigneeId ?? t.assigneeId, puntos: PESOS.postpartido,
      clave: `pp:${pp.id}`, texto: pp.playerName ?? t.title,
    })
  }

  // ── Tareas completadas ──
  for (const t of d.tasks) {
    if (t.status !== 'completada' || tareasPostpartido.has(t.id)) continue
    const dia = diaDe(t.completedAt)
    if (!dia) continue
    add({
      fuente: 'tareas', sub: t.priority === 'alta' ? 'Tarea (alta)' : 'Tarea', dia,
      profileId: t.assigneeId, puntos: t.priority === 'alta' ? PESOS.tareaAlta : PESOS.tarea,
      clave: `t:${t.id}`, texto: t.title,
    })
  }

  // ── Eventos de agenda: autor + asistentes ──
  for (const e of d.eventos) {
    const dia = diaDe(e.fecha)
    if (!dia) continue
    const peso = EVENTO_PESADO.has(e.tipo) ? PESOS.eventoPesado : EVENTO_LIGERO.has(e.tipo) ? PESOS.eventoLigero : PESOS.evento
    const personas = new Set<string>([...(e.participantIds ?? []), ...(e.authorId ? [e.authorId] : [])])
    for (const pid of personas) {
      add({ fuente: 'eventos', sub: e.tipo || 'Evento', dia, profileId: pid, puntos: peso, clave: `e:${e.id}`, texto: e.titulo })
    }
  }

  // ── Partidos vistos (por scout). Fecha = la del partido (la app no guarda cuándo se marcó visto) ──
  const partidoPorId = new Map(d.scoutingMatches.map(m => [m.id, m]))
  const conScouts = new Set<string>()
  for (const ms of d.matchScouts) {
    conScouts.add(ms.matchId)
    if (ms.status !== 'visto') continue
    const m = partidoPorId.get(ms.matchId)
    if (!m) continue
    const modo = ms.viewMode ?? m.viewMode ?? 'campo'
    add({
      fuente: 'partidos', sub: modo === 'video' ? 'Partido en vídeo' : 'Partido en campo', dia: m.date,
      profileId: idDeAvatar(ms.scout) ?? '', puntos: modo === 'video' ? PESOS.partidoVideo : PESOS.partidoCampo,
      clave: `m:${m.id}:${ms.scout}`, texto: `${m.homeTeam} – ${m.awayTeam}`,
    })
  }
  // Partidos antiguos sin fila de scout (de antes del multi-scout)
  for (const m of d.scoutingMatches) {
    if (conScouts.has(m.id) || m.status !== 'visto' || !m.assignedTo) continue
    const modo = m.viewMode ?? 'campo'
    add({
      fuente: 'partidos', sub: modo === 'video' ? 'Partido en vídeo' : 'Partido en campo', dia: m.date,
      profileId: idDeAvatar(m.assignedTo) ?? '', puntos: modo === 'video' ? PESOS.partidoVideo : PESOS.partidoCampo,
      clave: `m:${m.id}:${m.assignedTo}`, texto: `${m.homeTeam} – ${m.awayTeam}`,
    })
  }

  // ── Informes de partido + informes de entorno/contractual/mercado ──
  for (const r of d.scoutingReports) {
    const dia = diaDe(r.fecha) ?? diaDe(r.createdAt)
    if (!dia) continue
    const conclu = esVeredicto(r.conclusion)
    add({
      fuente: 'informes', sub: conclu ? 'Informe con conclusión' : 'Informe', dia,
      profileId: r.authorId ?? idDeAvatar(r.persona) ?? '', puntos: conclu ? PESOS.informeConConclusion : PESOS.informe,
      clave: `r:${r.id}`, texto: r.titulo,
    })
  }
  for (const i of d.scoutingInfos) {
    const dia = diaDe(i.fecha) ?? diaDe(i.createdAt)
    if (!dia) continue
    add({
      fuente: 'informes', sub: `Info ${i.tipo}`, dia,
      profileId: i.authorId ?? idDeAvatar(i.persona) ?? '', puntos: PESOS.info, clave: `i:${i.id}`,
    })
  }

  // ── Pipeline (Firmar): apuntes con autor + firmas ──
  for (const f of d.firmasEntries) {
    for (const c of f.comments ?? []) {
      if (!c.kind || c.kind === 'estatus') continue          // sin kind = importado de Trello; estatus = automático
      if (c.eventoId) continue                               // ya cuenta como evento
      if ((c.text ?? '').startsWith('✓ Hecho:')) continue    // ya cuenta como tarea
      const dia = diaDe(c.date)
      if (!dia) continue
      const pid = c.authorId ?? idDeNombre(c.author) ?? ''
      const peso = c.kind === 'reunion' ? PESOS.pipeReunion
        : (c.kind === 'llamada' || c.kind === 'telefono') ? PESOS.pipeLlamada
        : PESOS.pipeApunte
      const sub = c.kind === 'reunion' ? 'Reunión' : c.kind === 'llamada' ? 'Llamada' : c.kind === 'telefono' ? 'Teléfono'
        : c.kind === 'whatsapp' ? 'WhatsApp' : c.kind === 'entorno' ? 'Entorno' : 'Nota'
      add({ fuente: 'pipeline', sub, dia, profileId: pid, puntos: peso, clave: `fc:${c.id}`, texto: f.playerName })
    }
    if (f.status === 'firmado' && f.signedAt) {
      const dia = diaDe(f.signedAt)
      if (dia) for (const pid of f.managers ?? []) {
        add({ fuente: 'pipeline', sub: 'Firmado', dia, profileId: pid, puntos: PESOS.firmado, clave: `fs:${f.id}`, texto: f.playerName })
      }
    }
  }

  // ── Distribución: negociaciones nuevas, apuntes y cierres ──
  for (const n of d.negotiations) {
    const gestor = idDeAvatar(n.aisManager) ?? ''
    const diaAlta = diaDe(n.createdAt)
    if (diaAlta) add({ fuente: 'distribucion', sub: 'Negociación nueva', dia: diaAlta, profileId: gestor, puntos: PESOS.negNueva, clave: `n:${n.id}` })
    for (const u of n.updates ?? []) {
      const dia = diaDe(u.date)
      if (!dia) continue
      add({ fuente: 'distribucion', sub: 'Apunte negociación', dia, profileId: idDeAvatar(u.author) ?? gestor, puntos: PESOS.negUpdate, clave: `nu:${u.id}` })
    }
    if (n.status === 'cerrado') {
      const dia = diaDe(n.updatedAt)
      if (dia) add({ fuente: 'distribucion', sub: 'Negociación cerrada', dia, profileId: gestor, puntos: PESOS.negCerrada, clave: `nc:${n.id}` })
    }
  }

  return out
}

// ── Periodos ─────────────────────────────────────────────────────────

export type Periodo = 'semana' | 'mes'

/** Clave de periodo de un día: lunes de su semana (AAAA-MM-DD) o AAAA-MM. */
export function clavePeriodo(dia: string, periodo: Periodo): string {
  return periodo === 'mes' ? dia.slice(0, 7) : fechaLocal(lunesDe(parseDia(dia)))
}

/** Clave del periodo que contiene `hoy`, desplazada `offset` periodos (negativo = atrás). */
export function periodoDesde(hoy: Date, periodo: Periodo, offset: number): string {
  if (periodo === 'mes') {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return fechaLocal(lunesDe(hoy, offset))
}

/** Clave del periodo anterior al dado. */
export function periodoAnterior(clave: string, periodo: Periodo): string {
  if (periodo === 'mes') {
    const [y, m] = clave.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return fechaLocal(lunesDe(parseDia(clave), -1))
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «Semana del 6 oct» / «6–12 oct» · «Octubre 2026» */
export function etiquetaPeriodo(clave: string, periodo: Periodo, larga = false): string {
  if (periodo === 'mes') {
    const [y, m] = clave.split('-').map(Number)
    const nombre = MESES_LARGO[m - 1] ?? clave
    return larga ? `${nombre[0].toUpperCase()}${nombre.slice(1)} ${y}` : `${MESES[m - 1]} ${String(y).slice(2)}`
  }
  const ini = parseDia(clave)
  const fin = new Date(ini); fin.setDate(fin.getDate() + 6)
  const f = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`
  return larga ? `Semana del ${f(ini)} al ${f(fin)}` : `${ini.getDate()} ${MESES[ini.getMonth()]}`
}

// ── Agregación ───────────────────────────────────────────────────────

export interface Totales {
  bruto: number
  puntos: number
  porFuente: Record<Fuente, { bruto: number; puntos: number }>
}

export function totalesVacios(): Totales {
  const porFuente = {} as Totales['porFuente']
  for (const f of FUENTES) porFuente[f] = { bruto: 0, puntos: 0 }
  return { bruto: 0, puntos: 0, porFuente }
}

function sumar(t: Totales, a: Accion) {
  t.bruto += 1
  t.puntos += a.puntos
  t.porFuente[a.fuente].bruto += 1
  t.porFuente[a.fuente].puntos += a.puntos
}

/** Totales por persona en un periodo. */
export function totalesPorPersona(acciones: Accion[], clave: string, periodo: Periodo): Map<string, Totales> {
  const m = new Map<string, Totales>()
  for (const a of acciones) {
    if (clavePeriodo(a.dia, periodo) !== clave) continue
    let t = m.get(a.profileId)
    if (!t) { t = totalesVacios(); m.set(a.profileId, t) }
    sumar(t, a)
  }
  return m
}

/** Totales del equipo en un periodo: cada cosa cuenta UNA vez aunque tenga varias personas. */
export function totalesEquipo(acciones: Accion[], clave: string, periodo: Periodo): Totales {
  const t = totalesVacios()
  const vistas = new Set<string>()
  for (const a of acciones) {
    if (clavePeriodo(a.dia, periodo) !== clave) continue
    if (vistas.has(a.clave)) continue
    vistas.add(a.clave)
    sumar(t, a)
  }
  return t
}

/** Serie de los últimos `n` periodos (el último = el que contiene `hoy`), equipo deduplicado. */
export function serieEquipo(acciones: Accion[], periodo: Periodo, n: number, hoy = new Date()): { clave: string; totales: Totales }[] {
  const claves = Array.from({ length: n }, (_, i) => periodoDesde(hoy, periodo, i - (n - 1)))
  const porClave = new Map(claves.map(c => [c, totalesVacios()]))
  const vistas = new Set<string>()
  for (const a of acciones) {
    const c = clavePeriodo(a.dia, periodo)
    const t = porClave.get(c)
    if (!t) continue
    const k = `${c}|${a.clave}`
    if (vistas.has(k)) continue
    vistas.add(k)
    sumar(t, a)
  }
  return claves.map(clave => ({ clave, totales: porClave.get(clave)! }))
}

/** Variación en % respecto al periodo anterior; null si no hay con qué comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

export const fmtPuntos = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
