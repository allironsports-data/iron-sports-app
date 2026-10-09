import { createContext } from 'react'
import type { Zona } from '../lib/zonas'
import type { OpcionEquipo } from '../lib/sugerirEquipos'

// Catálogo de equipos para el campo «Equipo» de toda la app (ver
// components/EquipoInput.tsx). Lo provee App.tsx: la lista sale del catálogo
// más los equipos que ya tienen jugadores o partidos, igual que la pestaña
// Captación → Equipos. Contexto fuera del .tsx por fast refresh.

export interface EquiposContextValue {
  opciones: OpcionEquipo[]
  /** Categorías ya usadas (para elegir la del equipo nuevo) */
  categorias: string[]
  /** Zona que ya tendría ese equipo por su club, si se conoce */
  zonaDeducida: (nombre: string) => Zona | null
  /** Alta de un equipo nuevo con lo mínimo exigido: categoría y zona */
  crear: (equipo: { nombre: string; categoria: string; zona: Zona }) => Promise<void>
}

export const EquiposContext = createContext<EquiposContextValue | null>(null)
