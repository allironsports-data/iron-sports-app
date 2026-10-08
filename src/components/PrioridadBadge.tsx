import type { PlayerPrioridad } from '../types'
import { PRIORIDAD_META } from '../lib/prioridadJugador'

// Chapa A / B / C. Si no hay prioridad no pinta nada (que la lleven todos
// la dejaría sin significado); con `vacio` enseña un «—» discreto.
export function PrioridadBadge({ prioridad, size = 'sm', vacio }: { prioridad?: PlayerPrioridad; size?: 'sm' | 'md'; vacio?: boolean }) {
  const cls = size === 'md' ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'
  if (!prioridad) {
    return vacio ? <span className={`inline-flex items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-300 font-bold flex-shrink-0 ${cls}`} title="Sin prioridad">·</span> : null
  }
  const m = PRIORIDAD_META[prioridad]
  return (
    <span className={`inline-flex items-center justify-center rounded-md border font-extrabold flex-shrink-0 ${cls} ${m.chip}`} title={`Prioridad ${m.label} · ${m.ayuda}`}>
      {m.label}
    </span>
  )
}
