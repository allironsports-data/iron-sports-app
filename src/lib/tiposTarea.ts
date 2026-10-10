// ── Tipos de tarea: qué es cada uno ──────────────────────────────────
//
// TASK_LABELS (types.ts) es la lista; aquí está lo que la app sabe de cada
// tipo: a qué familia pertenece, qué subtipos admite al crearla, si pide
// jugador y cuánto pesa en el volumen de trabajo. El cierre (qué se
// pregunta al completarla) está en lib/cierreTarea.ts.
//
// Familias:
//   contacto    → dejan un evento (Llamada, Reunión, Comida/Visita)
//   entregable  → dejan un artefacto (Informe, Análisis, Postpartido)
//   proceso     → se cierran con un resultado (Negociación, Scouting)
//   generica    → una nota opcional (Otra, Administrativa, Seguimiento, Distribución, Marketing, Comunicación)
//
// Sin React ni Supabase, para poder probarlo.

import type { Task, TaskLabel } from '../types'
import { TASK_LABELS } from '../types'
import { SERVICIO_META, type ServicioTipo } from './serviciosAnalisis'
import { etiquetaResultado } from './cierreTarea'

export type FamiliaTarea = 'contacto' | 'entregable' | 'proceso' | 'generica'

export const FAMILIA_LABEL: Record<FamiliaTarea, string> = {
  contacto: 'Contactos', entregable: 'Entregables', proceso: 'Procesos', generica: 'Otras',
}

/** Subtipos de Negociación: de qué va el hilo */
export const SUBTIPOS_NEGOCIACION = ['renovacion', 'traspaso', 'representacion', 'comision', 'otro'] as const
/** Subtipos de Informe: datos (jugador nuestro) o los de Captación (técnico = de partido) */
export const SUBTIPOS_INFORME = ['datos', 'tecnico', 'entorno', 'mercado', 'personalidad'] as const
export const SUBTIPOS_VISITA = ['Comida', 'Visita presencial'] as const
/** Subtipos de Scouting: qué hay que hacer con el jugador de Captación */
export const SUBTIPOS_SCOUTING = ['seguir', 'ver_partido', 'info'] as const
/** Servicios de análisis (los mismos de Rendimiento → Análisis, sin el informe de datos) */
export const SUBTIPOS_VIDEO = (Object.keys(SERVICIO_META) as ServicioTipo[]).filter(s => s !== 'informe_datos')

export const SUBTIPO_LABEL: Record<string, string> = {
  renovacion: 'Renovación', traspaso: 'Traspaso / cesión', representacion: 'Contrato de representación', comision: 'Comisión', otro: 'Otro',
  datos: 'Informe de datos', tecnico: 'Informe de partido', entorno: 'Entorno', mercado: 'Mercado', personalidad: 'Personalidad',
  Comida: 'Comida', 'Visita presencial': 'Visita presencial',
  seguir: 'Seguir', ver_partido: 'Ver partido', info: 'Recabar información',
  ...Object.fromEntries(SUBTIPOS_VIDEO.map(s => [s, SERVICIO_META[s].label])),
}

export function etiquetaSubtipo(subtipo?: string): string | undefined {
  return subtipo ? (SUBTIPO_LABEL[subtipo] ?? subtipo) : undefined
}

/** Con qué puede ir ligada una tarea de ese tipo */
export type SujetoTarea = 'nuestro' | 'captacion' | 'ofrecimiento'

export interface MetaTipo {
  familia: FamiliaTarea
  /** Subtipos que se eligen al crear la tarea (vacío = no tiene) */
  subtipos: readonly string[]
  /** El subtipo es texto libre («De qué va» en Negociación) */
  subtipoLibre?: boolean
  /** Qué sujetos admite (jugador nuestro, de Captación, ofrecimiento) */
  sujetos: readonly SujetoTarea[]
  /**
   * si          → sin jugador no se puede crear (el cierre no tendría dónde dejar nada)
   * recomendado → se avisa, pero se permite (una llamada a un club, una reunión interna…)
   * no          → da igual
   */
  jugador: 'si' | 'recomendado' | 'no'
  /** Peso en el volumen de trabajo al completarla (ver lib/volumenTrabajo.ts) */
  peso: number
}

const TODOS: readonly SujetoTarea[] = ['nuestro', 'captacion']
const META: Record<TaskLabel, MetaTipo> = {
  'Llamada':        { familia: 'contacto',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'recomendado', peso: 1 },
  'Reunión':        { familia: 'contacto',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'recomendado', peso: 2 },
  'Comida/Visita':  { familia: 'contacto',   subtipos: SUBTIPOS_VISITA,      sujetos: TODOS,                                   jugador: 'recomendado', peso: 4 },
  'Informe':        { familia: 'entregable', subtipos: SUBTIPOS_INFORME,     sujetos: ['nuestro', 'captacion', 'ofrecimiento'], jugador: 'si',          peso: 3 },
  'Análisis':       { familia: 'entregable', subtipos: SUBTIPOS_VIDEO,       sujetos: ['nuestro'],                             jugador: 'si',          peso: 3 },
  'Postpartido':    { familia: 'entregable', subtipos: [],                   sujetos: ['nuestro'],                             jugador: 'si',          peso: 5 },
  'Negociación':    { familia: 'proceso',    subtipos: [], subtipoLibre: true, sujetos: ['nuestro'],                           jugador: 'si',          peso: 3 },
  'Scouting':       { familia: 'proceso',    subtipos: SUBTIPOS_SCOUTING,    sujetos: ['captacion'],                           jugador: 'recomendado', peso: 1 },
  'Otra':           { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
  'Administrativa': { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
  'Seguimiento':    { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
  'Distribución':   { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
  'Marketing':      { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
  'Comunicación':   { familia: 'generica',   subtipos: [],                   sujetos: TODOS,                                   jugador: 'no',          peso: 1 },
}

const GENERICA: MetaTipo = META['Otra']

export function metaTipo(label?: TaskLabel | string): MetaTipo {
  if (!label) return GENERICA
  return (META as Record<string, MetaTipo>)[label] ?? GENERICA
}

export function familiaDe(label?: TaskLabel | string): FamiliaTarea {
  return metaTipo(label).familia
}

/** Subtipos válidos de un tipo (vacío si no tiene) */
export function subtiposDe(label?: TaskLabel | string): readonly string[] {
  return metaTipo(label).subtipos
}

/** Si el subtipo no es de ese tipo, se descarta (p. ej. al cambiar el tipo en el panel). Con subtipo libre vale cualquier texto. */
export function subtipoValido(label: TaskLabel | string | undefined, subtipo?: string): string | undefined {
  const s = subtipo?.trim()
  if (!s) return undefined
  if (metaTipo(label).subtipoLibre) return s
  return subtiposDe(label).includes(s) ? s : undefined
}

/**
 * Cita de una tarea: una tarea puede llevar día, hora y lugar, y entonces se crea
 * con ella un evento de agenda enlazado (la cita). Según el tipo y el subtipo:
 *   · no       → sin cita (Negociación es un proceso; un vídeo o un recurso se preparan, no se citan)
 *   · posible  → se ofrece («Programar hora y lugar»)
 *   · defecto  → viene marcada (una sesión o un entrenamiento se hacen con el jugador)
 */
export type Cita = 'no' | 'posible' | 'defecto'
export function citaDeTipo(label: TaskLabel | string | undefined, subtipo?: string): { cita: Cita; tipoEvento: string } {
  switch (label) {
    case 'Negociación': return { cita: 'no', tipoEvento: 'Cita' }
    case 'Llamada': return { cita: 'posible', tipoEvento: 'Llamada' }
    case 'Análisis': {
      const s = subtipoValido(label, subtipo)
      if (s === 'sesion' || s === 'entrenamiento') return { cita: 'defecto', tipoEvento: 'Sesión de análisis' }
      return { cita: s ? 'no' : 'posible', tipoEvento: 'Sesión de análisis' }
    }
    case 'Reunión': return { cita: 'defecto', tipoEvento: 'Reunión' }
    case 'Comida/Visita': return { cita: 'defecto', tipoEvento: subtipo === 'Comida' ? 'Comida' : 'Visita presencial' }
    default: return { cita: 'posible', tipoEvento: 'Cita' }
  }
}

/** Reunión y Comida/Visita son eventos de agenda, no tareas: tipo de evento que les corresponde al crear */
export const EVENTO_EN_VEZ_DE_TAREA: Partial<Record<TaskLabel, string>> = { 'Reunión': 'Reunión', 'Comida/Visita': 'Visita presencial' }

/** Título que se rellena solo al elegir tipo y sujeto (editable después). Vacío si no hay nada que proponer. */
export function tituloAuto(label: TaskLabel | string | undefined, nombre?: string, subtipo?: string): string {
  const n = nombre?.trim()
  const sub = subtipoValido(label, subtipo)
  switch (label) {
    case 'Llamada': return n ? `Llamar a ${n}` : ''
    case 'Informe': return n ? `${etiquetaSubtipo(sub) ?? 'Informe'} · ${n}` : ''
    case 'Análisis': return n ? `${etiquetaSubtipo(sub) ?? 'Análisis'} · ${n}` : ''
    case 'Negociación': return n ? `Negociación${sub ? ` ${sub}` : ''} · ${n}` : ''
    case 'Scouting': return n ? (sub === 'ver_partido' ? `Ver partido de ${n}` : sub === 'info' ? `Recabar información de ${n}` : `Seguir a ${n}`) : ''
    default: return ''
  }
}

/** Qué pasará al completarla, para decirlo al crearla */
export function queHaraAlCerrar(label: TaskLabel | string | undefined, nombre?: string): string | undefined {
  const en = nombre ? ` en la ficha de ${nombre}` : ''
  switch (label) {
    case 'Llamada': return `Al completarla se preguntará si contestó y quedará como llamada en el calendario${en}.`
    case 'Informe': return nombre ? `Al completarla se pedirá el enlace o se abrirá el formulario del informe, y quedará${en}.` : 'Al completarla se pedirá el enlace al informe.'
    case 'Análisis': return `Al completarla se pedirá el vídeo y quedará como servicio${en} (Rendimiento → Análisis).`
    case 'Negociación': return `Es un proceso: nace en curso, sin fecha, y pide una nota cada semana. Al cerrarla se apunta el resultado${en}.`
    case 'Scouting': return 'Al completarla se pedirá la conclusión (seguir, llamar, descartar), que puede cambiar la valoración del jugador.'
    case 'Administrativa': case 'Otra': case 'Seguimiento': case 'Distribución': case 'Marketing': case 'Comunicación':
      return 'Al completarla se puede dejar una nota.'
    default: return undefined
  }
}

export const esTipo = (s: string): s is TaskLabel => (TASK_LABELS as readonly string[]).includes(s)

// ── Reporting: completadas por tipo ──────────────────────────────────

export interface ConteoTipo {
  label: string
  n: number
  /** Resultados, de más a menos frecuente: «2 contestó», «1 no contestó» */
  resultados: { resultado: string; n: number }[]
}

/** Cuántas tareas completadas hay de cada tipo, con sus resultados. Orden: más a menos. */
export function completadasPorTipo(tasks: Pick<Task, 'label' | 'status' | 'cierre'>[]): ConteoTipo[] {
  const porTipo = new Map<string, { n: number; res: Map<string, number> }>()
  for (const t of tasks) {
    if (t.status !== 'completada') continue
    const label = t.label ?? 'Otra'
    let c = porTipo.get(label)
    if (!c) { c = { n: 0, res: new Map() }; porTipo.set(label, c) }
    c.n++
    const r = t.cierre?.resultado
    if (r && r !== 'hecha') c.res.set(r, (c.res.get(r) ?? 0) + 1)
  }
  return [...porTipo.entries()]
    .map(([label, c]) => ({
      label, n: c.n,
      resultados: [...c.res.entries()].map(([resultado, n]) => ({ resultado, n })).sort((a, b) => b.n - a.n),
    }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
}

/** «3 llamadas (2 contestó) · 1 videoanálisis · 1 negociación (acordado)». Vacío si no hay nada. */
export function textoCompletadasPorTipo(conteo: ConteoTipo[], max = 4): string {
  const plural = (label: string, n: number) => {
    const l = label.toLowerCase()
    if (n === 1) return l
    if (l === 'llamada') return 'llamadas'
    if (l === 'reunión') return 'reuniones'
    if (l === 'negociación') return 'negociaciones'
    if (l === 'administrativa') return 'administrativas'
    if (l === 'otra') return 'otras'
    if (l.endsWith('s') || l.includes('/')) return l
    return `${l}s`
  }
  const partes = conteo.slice(0, max).map(c => {
    const detalle = c.resultados.slice(0, 2)
      .map(r => `${r.n === c.n ? '' : `${r.n} `}${(etiquetaResultado(r.resultado) ?? r.resultado).toLowerCase()}`).join(', ')
    return `${c.n} ${plural(c.label, c.n)}${detalle ? ` (${detalle})` : ''}`
  })
  const resto = conteo.slice(max).reduce((s, c) => s + c.n, 0)
  if (resto > 0) partes.push(`+${resto}`)
  return partes.join(' · ')
}
