// ── Calendario semanal: lógica pura ──────────────────────────────────
//
// Reparte la lista unificada (lib/agendaItems.ts) en una rejilla de
// filas × 7 días. Las filas son personas o tipos; las señales (carga,
// solapes de partidos) salen de la misma rejilla.

import { sumarDias } from './fechas'
import { itemEsDe, type AgendaItem, type AgendaTipo } from './agendaItems'

export interface FilaCalendario {
  id: string
  /** Un array por día, de lunes a domingo */
  dias: AgendaItem[][]
  /** Items de la semana (cada uno una vez) */
  total: number
  /** De esos, los que siguen abiertos */
  abiertos: number
  /** Índices de día (0 = lunes) con dos o más partidos sin ver */
  solapes: number[]
}

/** Los 7 días (AAAA-MM-DD) de la semana que empieza en `lunes` */
export function diasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

function ordenCelda(a: AgendaItem, b: AgendaItem): number {
  if (a.hora !== b.hora) {
    if (!a.hora) return 1
    if (!b.hora) return -1
    return a.hora.localeCompare(b.hora)
  }
  return Number(a.estado === 'completada') - Number(b.estado === 'completada') || a.titulo.localeCompare(b.titulo)
}

function fila(id: string, items: AgendaItem[], dias: string[]): FilaCalendario {
  const porDia = dias.map(d => items.filter(it => it.fecha === d).sort(ordenCelda))
  const todos = porDia.flat()
  return {
    id,
    dias: porDia,
    total: todos.length,
    abiertos: todos.filter(it => it.estado !== 'completada').length,
    solapes: porDia
      .map((its, i) => its.filter(it => it.tipo === 'partido' && it.estado !== 'completada').length >= 2 ? i : -1)
      .filter(i => i >= 0),
  }
}

/** Una fila por persona: sus items (responsable, watcher o participante) */
export function filasPorPersona(items: AgendaItem[], personaIds: string[], lunes: string): FilaCalendario[] {
  const dias = diasDeSemana(lunes)
  return personaIds.map(pid => fila(pid, items.filter(it => itemEsDe(it, pid)), dias))
}

/**
 * Una fila por grupo de tipos. Un partido con varios scouts es un item por
 * scout: aquí se junta en uno solo (se queda el que aún no está visto).
 */
export function filasPorTipo(items: AgendaItem[], grupos: { id: string; tipos: AgendaTipo[] }[], lunes: string): FilaCalendario[] {
  const dias = diasDeSemana(lunes)
  const unicos = new Map<string, AgendaItem>()
  for (const it of items) {
    const clave = it.origen === 'captacion' && it.ref.matchId ? `partido:${it.ref.matchId}` : it.id
    const previo = unicos.get(clave)
    if (!previo || (previo.estado === 'completada' && it.estado !== 'completada')) unicos.set(clave, it)
  }
  const lista = [...unicos.values()]
  return grupos.map(g => fila(g.id, lista.filter(it => g.tipos.includes(it.tipo)), dias))
}
