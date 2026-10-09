import { useContext } from 'react'
import { EquiposContext, type EquiposContextValue } from '../contexts/equiposContext'

const SIN_CATALOGO: EquiposContextValue = {
  opciones: [],
  categorias: [],
  zonaDeducida: () => null,
  crear: async () => { throw new Error('Sin catálogo de equipos') },
}

/** Catálogo de equipos. Fuera del provider (o antes de cargar) el campo se comporta como texto libre. */
export function useEquipos(): EquiposContextValue {
  return useContext(EquiposContext) ?? SIN_CATALOGO
}
