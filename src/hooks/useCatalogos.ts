import { useContext } from 'react'
import { CatalogosContext, type CatalogosContextValue } from '../contexts/catalogosContext'

const VACIO: CatalogosContextValue = { agencias: [], nacionalidades: [] }

/** Agencias y nacionalidades ya usadas. Fuera del provider, listas vacías (el campo acepta texto libre). */
export function useCatalogos(): CatalogosContextValue {
  return useContext(CatalogosContext) ?? VACIO
}
