// ── Calendario semanal: lógica pura ──────────────────────────────────
//
// Reparte la lista unificada (lib/agendaItems.ts) en una rejilla de
// filas × 7 días. Las filas son franjas horarias (o tipos); cada cosa
// lleva la lista de personas a las que toca, para pintar sus iniciales.

import { sumarDias } from './fechas'
import type { AgendaItem, AgendaTipo } from './agendaItems'

/** Lo que va en una celda: el item y de quién es (un partido con varios scouts es una sola entrada) */
export interface EntradaCalendario {
  item: AgendaItem
  personas: string[]
  /** true si para todas esas personas está hecho */
  hecha: boolean
}

export interface FilaCalendario {
  id: string
  /** Un array por día, de lunes a domingo */
  dias: EntradaCalendario[][]
  total: number
  abiertos: number
}

export const FRANJAS = [
  { id: 'sin-hora', label: 'Sin hora', detalle: 'tareas del día' },
  { id: 'manana',   label: 'Mañana',   detalle: 'hasta las 14:00' },
  { id: 'tarde',    label: 'Tarde',    detalle: '14:00 – 20:00' },
  { id: 'noche',    label: 'Noche',    detalle: 'desde las 20:00' },
] as const
export type FranjaId = typeof FRANJAS[number]['id']

export function franjaDe(hora?: string): FranjaId {
  if (!hora) return 'sin-hora'
  if (hora < '14:00') return 'manana'
  if (hora < '20:00') return 'tarde'
  return 'noche'
}

/** Los 7 días (AAAA-MM-DD) de la semana que empieza en `lunes` */
export function diasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/**
 * Junta lo que es la misma cosa para varias personas: un partido con varios
 * scouts es un item por scout y aquí pasa a ser una entrada con todos ellos.
 * El resto lleva a su responsable y, detrás, a watchers y participantes.
 */
export function entradasDe(items: AgendaItem[]): EntradaCalendario[] {
  const porClave = new Map<string, EntradaCalendario>()
  for (const it of items) {
    const clave = it.origen === 'captacion' && it.ref.matchId ? `partido:${it.ref.matchId}` : it.id
    const previa = porClave.get(clave)
    const hecha = it.estado === 'completada'
    if (!previa) {
      const personas = [it.personId, ...it.otrosIds].filter((p, i, a) => !!p && a.indexOf(p) === i)
      porClave.set(clave, { item: it, personas, hecha })
      continue
    }
    if (it.personId && !previa.personas.includes(it.personId)) previa.personas.push(it.personId)
    // La entrada se abre con el item de quien aún lo tiene pendiente
    if (previa.hecha && !hecha) previa.item = it
    previa.hecha = previa.hecha && hecha
  }
  return [...porClave.values()]
}

function orden(a: EntradaCalendario, b: EntradaCalendario): number {
  if (a.item.hora !== b.item.hora) {
    if (!a.item.hora) return 1
    if (!b.item.hora) return -1
    return a.item.hora.localeCompare(b.item.hora)
  }
  return Number(a.hecha) - Number(b.hecha) || a.item.titulo.localeCompare(b.item.titulo)
}

function fila(id: string, entradas: EntradaCalendario[], dias: string[]): FilaCalendario {
  const porDia = dias.map(d => entradas.filter(e => e.item.fecha === d).sort(orden))
  const todas = porDia.flat()
  return { id, dias: porDia, total: todas.length, abiertos: todas.filter(e => !e.hecha).length }
}

/** Una fila por franja horaria; lo que no tiene hora (casi todas las tareas) va a «Sin hora» */
export function filasPorFranja(items: AgendaItem[], lunes: string): FilaCalendario[] {
  const dias = diasDeSemana(lunes)
  const entradas = entradasDe(items)
  return FRANJAS.map(f => fila(f.id, entradas.filter(e => franjaDe(e.item.hora) === f.id), dias))
}

/** Una fila por grupo de tipos */
export function filasPorTipo(items: AgendaItem[], grupos: { id: string; tipos: AgendaTipo[] }[], lunes: string): FilaCalendario[] {
  const dias = diasDeSemana(lunes)
  const entradas = entradasDe(items)
  return grupos.map(g => fila(g.id, entradas.filter(e => g.tipos.includes(e.item.tipo)), dias))
}

/** Por día (0 = lunes): quién tiene dos o más partidos sin ver ese día */
export function solapesPorDia(items: AgendaItem[], lunes: string): { personId: string; n: number }[][] {
  return diasDeSemana(lunes).map(d => {
    const n = new Map<string, number>()
    for (const it of items) {
      if (it.fecha !== d || it.tipo !== 'partido' || it.estado === 'completada' || !it.personId) continue
      n.set(it.personId, (n.get(it.personId) ?? 0) + 1)
    }
    return [...n.entries()].filter(([, v]) => v >= 2).map(([personId, v]) => ({ personId, n: v }))
  })
}
