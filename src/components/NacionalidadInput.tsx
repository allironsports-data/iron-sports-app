import { useMemo, type KeyboardEvent } from 'react'
import { useCatalogos } from '../hooks/useCatalogos'
import { PAISES } from '../lib/paises'
import { norm } from '../lib/texto'
import { ComboCerrado, type Opcion } from './ComboCerrado'

// ── Campo «Nacionalidad» de lista cerrada ────────────────────────────
// Opciones: la lista de países (lib/paises) más lo que ya haya en los
// jugadores. Una nueva se añade tras confirmar. Un campo = una
// nacionalidad; la segunda va en otro campo (ver unirNacionalidades).

interface Props {
  value: string
  onChange: (nacionalidad: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onSalir?: () => void
  'aria-label'?: string
}

export function NacionalidadInput({ placeholder = 'España, Marruecos…', ...props }: Props) {
  const { nacionalidades } = useCatalogos()
  const opciones = useMemo<Opcion[]>(() => {
    const vistas = new Set<string>()
    const out: Opcion[] = []
    for (const n of [...PAISES, ...nacionalidades]) {
      const clave = norm(n).replace(/\s+/g, ' ').trim()
      if (!clave || vistas.has(clave)) continue
      vistas.add(clave)
      out.push({ nombre: n, clave })
    }
    return out
  }, [nacionalidades])
  return <ComboCerrado {...props} placeholder={placeholder} opciones={opciones} nuevo={{ etiqueta: 'nacionalidad nueva' }} minNuevo={3} />
}
