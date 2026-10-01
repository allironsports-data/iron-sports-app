import { ListTodo, CalendarDays } from 'lucide-react'

// ── ¿Tarea o evento? ─────────────────────────────────────────────────
// La misma ventana sirve para las dos cosas; este selector, arriba del
// todo, deja claro cuál es cuál:
//   · Tarea  = algo que hay que HACER. Se marca como hecha y puede vencer.
//   · Evento = algo que OCURRE un día (o ya ocurrió): reunión, visita,
//              llamada, viaje… No se completa ni vence.

export function TipoNuevo({ valor, onCambiar }: { valor: 'tarea' | 'evento'; onCambiar: (v: 'tarea' | 'evento') => void }) {
  const opciones = [
    { id: 'tarea' as const, Icono: ListTodo, titulo: 'Tarea', texto: 'Algo que hay que hacer. Se marca como hecha y puede vencer.' },
    { id: 'evento' as const, Icono: CalendarDays, titulo: 'Evento', texto: 'Algo que ocurre un día, o ya ocurrió. No se completa.' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map(o => {
        const sel = valor === o.id
        return (
          <button key={o.id} type="button" onClick={() => { if (!sel) onCambiar(o.id) }} aria-pressed={sel}
            className={`text-left rounded-lg border px-2.5 py-1.5 transition-colors ${sel ? 'border-primary bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${sel ? 'text-primary' : 'text-slate-600'}`}>
              <o.Icono className="w-3.5 h-3.5" /> {o.titulo}
            </span>
            <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">{o.texto}</span>
          </button>
        )
      })}
    </div>
  )
}
