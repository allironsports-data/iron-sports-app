// ── Inicio (Home): lógica pura ───────────────────────────────────────
//
// La Home enseña el día (agenda, partidos del equipo, para hacer, en
// curso) y debajo un acceso a cada parte de la app. Aquí vive lo que no
// es React: la frase que resume el día, la lista de accesos y los
// contadores que acompañan a cada acceso.

import type { MainSection } from '../components/globalExtras'
import { type AgendaItem, type SeccionesDia, esInformePendiente, DIAS_ACTUALIZACION_PROCESO } from './agendaItems'

export type DestinoInicio =
  | { tipo: 'seccion'; seccion: MainSection; tab?: string }
  | { tipo: 'mi-dia' }
  | { tipo: 'contactos' }
  | { tipo: 'admin' }

export interface Acceso {
  id: string
  nombre: string
  /** Nombre del icono (la vista lo traduce a componente) */
  icono: string
  desc: string
  destino: DestinoInicio
  /** Solo lo ven los admins */
  admin?: boolean
}

/** Todo lo que hay en la app, en el orden en que sale en la Home */
export const ACCESOS: Acceso[] = [
  { id: 'mantenimiento', nombre: 'Mantenimiento', icono: 'home',          desc: 'Tareas, calendario, jugadores y equipo',        destino: { tipo: 'seccion', seccion: 'tareas' } },
  { id: 'captacion',     nombre: 'Captación',     icono: 'eye',           desc: 'Partidos, informes, equipos y ofrecidos',       destino: { tipo: 'seccion', seccion: 'captacion' } },
  { id: 'pipeline',      nombre: 'Pipeline',      icono: 'pen-line',      desc: 'Firmar: tarjetas, zonas, encargados y avisos',  destino: { tipo: 'seccion', seccion: 'pipeline' } },
  { id: 'distribucion',  nombre: 'Distribución',  icono: 'trending-up',   desc: 'Jugadores en mercado, clubes y partners',       destino: { tipo: 'seccion', seccion: 'distribucion' } },
  { id: 'jugadores',     nombre: 'Jugadores',     icono: 'users',         desc: 'La plantilla, contratos y prioridades',         destino: { tipo: 'seccion', seccion: 'jugadores' } },
  { id: 'boulema',       nombre: 'Boulema',       icono: 'globe',         desc: 'Jugadores de Boulema y ofrecimientos',          destino: { tipo: 'seccion', seccion: 'boulema' } },
  { id: 'calendario',    nombre: 'Calendario',    icono: 'calendar-days', desc: 'La semana de todo el equipo',                   destino: { tipo: 'seccion', seccion: 'tareas', tab: 'calendario' } },
  { id: 'equipo',        nombre: 'Equipo',        icono: 'users-round',   desc: 'Quién hace qué y resumen de la semana',         destino: { tipo: 'seccion', seccion: 'tareas', tab: 'equipo' } },
  { id: 'contactos',     nombre: 'Contactos',     icono: 'contact',       desc: 'Clubes, agencias y personas',                   destino: { tipo: 'contactos' } },
  { id: 'mi-dia',        nombre: 'Mi día',        icono: 'sun',           desc: 'Tu agenda, tu trabajo y tus procesos',          destino: { tipo: 'mi-dia' } },
  { id: 'avisos',        nombre: 'Avisos',        icono: 'bell',          desc: 'Lo que espera una decisión',                    destino: { tipo: 'seccion', seccion: 'pipeline', tab: 'avisos' } },
  { id: 'admin',         nombre: 'Administración', icono: 'shield',       desc: 'Cuentas, seguimiento, historial y uso',         destino: { tipo: 'admin' }, admin: true },
]

export interface Contador { texto: string; alerta?: boolean }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * El dato que acompaña a cada acceso. Solo cuando aporta: un acceso sin
 * contador sale limpio. `alerta` lo pinta en rojo.
 */
export function contadoresInicio(a: {
  /** Secciones del día de quien mira */
  mias: SeccionesDia
  /** Agenda de todo el equipo para hoy (para lo que espera decisión) */
  equipo: AgendaItem[]
  hoy: string
  partidosSemana: number
  jugadores: number
  tarjetasAbiertas: number
}): Record<string, Contador> {
  const out: Record<string, Contador> = {}
  if (a.mias.hoy.length > 0) out.mantenimiento = { texto: plural(a.mias.hoy.length, 'para hoy', 'para hoy') }
  if (a.partidosSemana > 0) out.captacion = { texto: plural(a.partidosSemana, 'partido esta semana', 'partidos esta semana') }
  if (a.tarjetasAbiertas > 0) out.pipeline = { texto: plural(a.tarjetasAbiertas, 'tarjeta abierta', 'tarjetas abiertas') }
  if (a.jugadores > 0) out.jugadores = { texto: String(a.jugadores) }
  if (a.mias.vencidas.length > 0) out['mi-dia'] = { texto: plural(a.mias.vencidas.length, 'con retraso', 'con retraso'), alerta: true }
  // Lo que espera una decisión en el equipo: acciones de Firmar atrasadas y reuniones sin cerrar
  const esperando = a.equipo.filter(it => it.estado !== 'completada' && (
    (it.origen === 'firmar' && !!it.fecha && it.fecha < a.hoy) || it.categoria === 'Reunión sin cerrar'))
  if (esperando.length > 0) out.avisos = { texto: String(esperando.length), alerta: true }
  return out
}

/** Partidos del equipo de hoy: un partido con varios scouts es un item por scout, aquí se juntan */
export interface PartidoHoy {
  matchId: string
  hora?: string
  titulo: string
  /** iniciales de cada scout y si ya ha escrito informe */
  scouts: { avatar: string; conInforme: boolean }[]
  /** el primero que lo ve: en campo o por vídeo no se sabe aquí; sale lo que haya */
  item: AgendaItem
}
export function partidosDeHoy(items: AgendaItem[], hoy: string, avatarDe: (profileId: string) => string | undefined): PartidoHoy[] {
  const m = new Map<string, PartidoHoy>()
  for (const it of items) {
    if (it.origen !== 'captacion' || esInformePendiente(it) || it.fecha !== hoy || !it.ref.matchId) continue
    const g = m.get(it.ref.matchId) ?? { matchId: it.ref.matchId, hora: it.hora, titulo: it.titulo, scouts: [], item: it }
    const avatar = avatarDe(it.personId)
    if (avatar && !g.scouts.some(s => s.avatar === avatar)) g.scouts.push({ avatar, conInforme: !!it.conInforme })
    m.set(it.ref.matchId, g)
  }
  return [...m.values()].sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99'))
}

/**
 * Una frase que resume el día de quien mira: la primera cita, cuántas más,
 * lo que lleva retraso y los procesos que piden nota. Sin cursilerías.
 */
export function fraseDelDia(s: SeccionesDia): string {
  const partes: string[] = []
  const [primera, ...resto] = s.agenda
  if (primera) {
    let p = primera.hora ? `${primera.titulo} a las ${primera.hora}` : primera.titulo
    if (resto.length > 0) p += ` y ${plural(resto.length, 'cita más', 'citas más')}`
    partes.push(p)
  } else if (s.hoy.length > 0) {
    partes.push(`Sin citas. ${plural(s.hoy.length, 'cosa para hacer', 'cosas para hacer')}`)
  }
  if (s.vencidas.length > 0) partes.push(plural(s.vencidas.length, 'tarea con retraso', 'tareas con retraso'))
  const pidenNota = s.procesos.filter(p => (p.proceso?.diasSinActualizar ?? 0) >= DIAS_ACTUALIZACION_PROCESO)
  if (pidenNota.length === 1) partes.push(`A «${pidenNota[0].titulo}» le toca nota`)
  else if (pidenNota.length > 1) partes.push(`${pidenNota.length} procesos piden nota`)
  if (partes.length === 0) return s.procesos.length > 0 ? 'Día despejado. Solo lo que tienes en curso.' : 'Día despejado.'
  return partes.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('. ') + '.'
}
