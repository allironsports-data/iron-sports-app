// ── Orden manual de la lista de Tareas ───────────────────────────────
//
// Cada persona ordena SU lista arrastrando filas. Se guarda un mapa
// { id del item → posición }: al arrastrar dentro de un bloque (Hoy, un día
// concreto, Sin fecha…) se renumeran todas las filas de ese bloque. Las que
// nunca se han movido no tienen posición y van detrás, en su orden de
// siempre.
//
// Dónde vive: en el navegador (al instante) y en la tabla agenda_orden
// (para que sea igual en el móvil). Si la tabla no existe todavía
// (migration_agenda_orden.sql sin ejecutar), se queda solo en el navegador.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type OrdenManual = Record<string, number>

const clave = (userId: string) => `ais:orden-tareas:${userId}`

function leerLocal(userId: string): OrdenManual {
  try { return JSON.parse(localStorage.getItem(clave(userId)) || '{}') as OrdenManual } catch { return {} }
}

/** Ordena `items` por su posición manual; los que no tienen, detrás y como venían */
export function aplicarOrden<T extends { id: string }>(items: T[], orden: OrdenManual): T[] {
  if (items.length < 2 || !items.some(it => orden[it.id] !== undefined)) return items
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (orden[a.it.id] ?? Infinity) - (orden[b.it.id] ?? Infinity) || a.i - b.i)
    .map(x => x.it)
}

/**
 * Nuevo orden de ids al soltar `movido` sobre `destino` dentro de `ids`.
 * Bajando se queda debajo del destino; subiendo, encima. null si no cambia nada.
 */
export function recolocar(ids: string[], movido: string, destino: string): string[] | null {
  const desde = ids.indexOf(movido)
  const hasta = ids.indexOf(destino)
  if (desde === -1 || hasta === -1 || desde === hasta) return null
  const resto = ids.filter(id => id !== movido)
  resto.splice(resto.indexOf(destino) + (desde < hasta ? 1 : 0), 0, movido)
  return resto
}

/**
 * Orden manual del usuario. `guardar(ids, vivos)` fija el orden de un bloque;
 * `vivos` son los ids que existen ahora mismo, para no acumular los de
 * tareas que ya no están.
 */
export function useOrdenManual(userId: string | undefined) {
  const [orden, setOrden] = useState<OrdenManual>(() => userId ? leerLocal(userId) : {})
  const ordenRef = useRef(orden)
  useEffect(() => { ordenRef.current = orden }, [orden])

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    void supabase.from('agenda_orden').select('orden').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelado || error || !data?.orden) return   // sin tabla o sin fila: vale lo del navegador
        const remoto = data.orden as OrdenManual
        setOrden(remoto)
        try { localStorage.setItem(clave(userId), JSON.stringify(remoto)) } catch { /* sin almacenamiento */ }
      })
    return () => { cancelado = true }
  }, [userId])

  const guardar = useCallback((ids: string[], vivos: Set<string>) => {
    if (!userId) return
    const nuevo: OrdenManual = {}
    for (const [id, pos] of Object.entries(ordenRef.current)) if (vivos.has(id)) nuevo[id] = pos
    ids.forEach((id, i) => { nuevo[id] = i + 1 })
    ordenRef.current = nuevo
    setOrden(nuevo)
    try { localStorage.setItem(clave(userId), JSON.stringify(nuevo)) } catch { /* sin almacenamiento */ }
    void supabase.from('agenda_orden')
      .upsert({ user_id: userId, orden: nuevo, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[orden] no se pudo guardar en el servidor (queda en este navegador):', error.message) })
  }, [userId])

  return { orden, guardar }
}
