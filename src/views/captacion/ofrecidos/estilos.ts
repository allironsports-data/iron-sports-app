import type { EstadoVisible } from '../../../lib/ofrecidos'

// Clases compartidas por la pestaña Ofrecidos. En fichero aparte porque
// Vite Fast Refresh solo funciona si comun.tsx exporta componentes.

export const INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
export const INPUT_SM = 'w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30'

/** Borde izquierdo de la fila en la lista, según estado */
export const ESTADO_BORDE: Record<EstadoVisible['clave'], string> = {
  nuevo: 'border-l-slate-300', informes: 'border-l-blue-500', decidir: 'border-l-orange-500',
  aceptado: 'border-l-green-500', descartado: 'border-l-red-400', caducado: 'border-l-amber-500',
}
