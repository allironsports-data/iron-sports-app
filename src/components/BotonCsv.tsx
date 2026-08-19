import { exportarCsv } from '../lib/csv'

/**
 * Botón de descarga para cualquier tabla. Exporta lo que se está viendo
 * (con los filtros puestos), no toda la base de datos.
 */
export function BotonCsv({ nombre, cabeceras, filas, className = '' }: {
  nombre: string
  cabeceras: string[]
  filas: () => unknown[][]
  className?: string
}) {
  return (
    <button
      onClick={() => exportarCsv(nombre, cabeceras, filas())}
      title="Descargar en CSV lo que estás viendo (se abre en Excel)"
      className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold border border-slate-200 text-slate-500 rounded-lg bg-white hover:border-primary hover:text-primary transition-colors ${className}`}
    >
      ⤓ CSV
    </button>
  )
}
