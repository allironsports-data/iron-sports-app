import { createContext } from 'react'

// Valores ya usados en la base de datos para los campos de lista cerrada
// que no tienen tabla propia (agencia, nacionalidad). Los calcula App.tsx a
// partir de los jugadores; el campo los ofrece al escribir y, si lo escrito
// no es ninguno, pide confirmar antes de crear uno nuevo. Contexto fuera del
// .tsx por fast refresh.

export interface CatalogosContextValue {
  agencias: string[]
  nacionalidades: string[]
}

export const CatalogosContext = createContext<CatalogosContextValue | null>(null)
