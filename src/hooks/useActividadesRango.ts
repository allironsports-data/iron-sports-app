import { useEffect, useState } from 'react'
import type { PlayerActivity } from '../types'
import { fetchActivitiesEntre } from '../lib/db'

/**
 * Actividades (eventos de jugador) de todo el equipo entre dos días.
 * Cada rango se pide una vez y se guarda; `version` lo invalida (súbelo
 * al crear o borrar un evento). Con `activo = false` no pide nada.
 */
export function useActividadesRango(desde: string, hasta: string, activo: boolean, version: number): PlayerActivity[] {
  const clave = `${desde}|${hasta}|${version}`
  const [cache, setCache] = useState<Record<string, PlayerActivity[]>>({})
  useEffect(() => {
    if (!activo || cache[clave]) return
    let vivo = true
    fetchActivitiesEntre(desde, hasta)
      .then(acts => { if (vivo) setCache(prev => ({ ...prev, [clave]: acts })) })
      .catch(() => {}) // sin eventos la agenda sigue siendo útil; db.ts ya lo deja en consola
    return () => { vivo = false }
  }, [activo, clave, desde, hasta, cache])
  return cache[clave] ?? VACIO
}

const VACIO: PlayerActivity[] = []
