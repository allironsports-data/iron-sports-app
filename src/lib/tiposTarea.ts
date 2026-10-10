// ── Tipos de tarea: qué es cada uno ──────────────────────────────────
//
// TASK_LABELS (types.ts) es la lista; aquí está lo que la app sabe de cada
// tipo: a qué familia pertenece, qué subtipos admite al crearla, si pide
// jugador y cuánto pesa en el volumen de trabajo. El cierre (qué se
// pregunta al completarla) está en lib/cierreTarea.ts.
//
// Familias:
//   contacto    → dejan un evento (Llamada, Reunión, Comida/Visita)
//   entregable  → dejan un artefacto (Informe, Videoanálisis, Postpartido)
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
/** Servicios de videoanálisis (los mismos de Rendimiento → Análisis, sin el informe de datos) */
export const SUBTIPOS_VIDEO = (Object.keys(SERVICIO_META) as ServicioTipo[]).filter(s => s !== 'informe_datos')

export const SUBTIPO_LABEL: Record<string, string> = {
  renovacion: 'Renovación', traspaso: 'Traspaso / cesión', representacion: 'Contrato de representación', comision: 'Comisión', otro: 'Otro',
  datos: 'Informe de datos', tecnico: 'Informe de partido', entorno: 'Entorno', mercado: 'Mercado', personalidad: 'Personalidad',
  Comida: 'Comida', 'Visita presencial': 'Visita presencial',
  ...Object.fromEntries(SUBTIPOS_VIDEO.map(s => [s, SERVICIO_META[s].label])),
}

export function etiquetaSubtipo(subtipo?: string): string | undefined {
  return subtipo ? (SUBTIPO_LABEL[subtipo] ?? subtipo) : undefined
}

export interface MetaTipo {
  familia: FamiliaTarea
  /** Subtipos que se eligen al crear la tarea (vacío = no tiene) */
  subtipos: readonly string[]
  /**
   * si          → sin jugador no se puede crear (el cierre no tendría dónde dejar nada)
   * recomendado → se avisa, pero se permite (una llamada a un club, una reunión interna…)
   * no          → da igual
   */
  jugador: 'si' | 'recomendado' | 'no'
  /** Peso en el volumen de trabajo al completarla (ver lib/volumenTrabajo.ts) */
  peso: number
}

const META: Record<TaskLabel, MetaTipo> = {
  'Llamada':        { familia: 'contacto',   subtipos: [],                    jugador: 'recomendado', peso: 1 },
  'Reunión':        { familia: 'contacto',   subtipos: [],                    jugador: 'recomendado', peso: 2 },
  'Comida/Visita':  { familia: 'contacto',   subtipos: SUBTIPOS_VISITA,       jugador: 'recomendado', peso: 4 },
  'Informe':        { familia: 'entregable', subtipos: SUBTIPOS_INFORME,      jugador: 'si',          peso: 3 },
  'Videoanálisis':  { familia: 'entregable', subtipos: SUBTIPOS_VIDEO,        jugador: 'si',          peso: 3 },
  'Postpartido':    { familia: 'entregable', subtipos: [],                    jugador: 'si',          peso: 5 },
  'Negociación':    { familia: 'proceso',    subtipos: SUBTIPOS_NEGOCIACION,  jugador: 'no',          peso: 3 },
  'Scouting':       { familia: 'proceso',    subtipos: [],                    jugador: 'recomendado', peso: 1 },
  'Otra':           { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
  'Administrativa': { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
  'Seguimiento':    { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
  'Distribución':   { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
  'Marketing':      { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
  'Comunicación':   { familia: 'generica',   subtipos: [],                    jugador: 'no',          peso: 1 },
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

/** Si el subtipo no es de ese tipo, se descarta (p. ej. al cambiar el tipo en el panel) */
export function subtipoValido(label: TaskLabel | string | undefined, subtipo?: string): string | undefined {
  return subtipo && subtiposDe(label).includes(subtipo) ? subtipo : undefined
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
