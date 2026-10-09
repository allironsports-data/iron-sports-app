import { useMemo, type KeyboardEvent } from 'react'
import { useCatalogos } from '../hooks/useCatalogos'
import { norm } from '../lib/texto'
import { ComboCerrado, type Opcion } from './ComboCerrado'

// ── Campo «Agencia» de lista cerrada ─────────────────────────────────
// Las opciones son las agencias ya usadas en los jugadores. Una nueva se
// añade desde el propio campo tras confirmar, para no volver a tener
// «AS1», «AS 1» y «As1» como tres agencias.

interface Props {
  value: string
  onChange: (agencia: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onSalir?: () => void
  'aria-label'?: string
}

export function AgenciaInput({ placeholder = 'Escribe y elige una agencia', ...props }: Props) {
  const { agencias } = useCatalogos()
  const opciones = useMemo<Opcion[]>(() => agencias.map(a => ({ nombre: a, clave: norm(a).replace(/\s+/g, ' ').trim() })), [agencias])
  return <ComboCerrado {...props} placeholder={placeholder} opciones={opciones} nuevo={{ etiqueta: 'agencia nueva' }} minNuevo={2} />
}
