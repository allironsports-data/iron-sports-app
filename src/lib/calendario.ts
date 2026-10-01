// ── Calendario semanal: lógica pura ──────────────────────────────────
//
// Reparte la lista unificada (lib/agendaItems.ts) en los 7 días de una
// semana. Cada cosa lleva la lista de personas a las que toca, para
// pintar sus iniciales.

import { sumarDias } from './fechas'
import type { AgendaItem } from './agendaItems'

/** Lo que va en una celda: el item y de quién es (un partido con varios scouts es una sola entrada) */
export interface EntradaCalendario {
  item: AgendaItem
  personas: string[]
  /** true si para todas esas personas está hecho. Los eventos nunca: no son tareas. */
  hecha: boolean
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

/**
 * La semana como 7 días enteros: en cada uno, primero lo que tiene hora
 * (por hora) y después lo que no. La mayoría de tareas no tiene hora, así
 * que no se reparte en franjas: un día es una lista.
 */
export function entradasPorDia(items: AgendaItem[], lunes: string): EntradaCalendario[][] {
  const entradas = entradasDe(items)
  return diasDeSemana(lunes).map(d => entradas.filter(e => e.item.fecha === d).sort(orden))
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
