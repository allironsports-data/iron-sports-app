import { useState } from 'react'
import { BellOff, CheckCircle2, ChevronRight } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import type { GrupoAviso } from '../captacion/firmas/avisos'

// ── Avisos del pipeline ──────────────────────────────────────────────
// Antes era un desplegable encima del tablero: para leerlo había que
// abrirlo, y dentro abrir cada grupo. Ahora es una pestaña, así que caben
// todos los grupos abiertos a la vez, en dos columnas y con lo urgente
// delante — que es como se repasa esto de verdad.

const TONO = {
  red:   { borde: 'border-l-red-400',     titulo: 'text-red-700',     pill: 'bg-red-100 text-red-700' },
  amber: { borde: 'border-l-amber-400',   titulo: 'text-amber-700',   pill: 'bg-amber-100 text-amber-700' },
  blue:  { borde: 'border-l-sky-400',     titulo: 'text-sky-700',     pill: 'bg-sky-100 text-sky-700' },
  green: { borde: 'border-l-emerald-400', titulo: 'text-emerald-700', pill: 'bg-emerald-100 text-emerald-700' },
} as const

const tonoDe = (t: string) => TONO[t as keyof typeof TONO] ?? TONO.blue

export function AvisosTab({
  grupos, urgentes, total, avisosMudos, onSilenciar, onRestaurar, onAbrirEntry,
}: {
  grupos: GrupoAviso[]
  urgentes: number
  total: number
  avisosMudos: Set<string>
  onSilenciar: (kind: string) => void
  onRestaurar: () => void
  onAbrirEntry: (id: string) => void
}) {
  const [soloUrgentes, setSoloUrgentes] = useState(false)
  const visibles = soloUrgentes ? grupos.filter(g => g.tone === 'red') : grupos

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-3">

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-sm font-semibold text-slate-800">Avisos</h2>
            <p className="text-xs text-slate-400">
              Cosas que pasan fuera de Firmar y deberían mover una tarjeta: partidos, informes, cambios de club, contratos…
            </p>
          </div>
          {urgentes > 0 && (
            <button
              onClick={() => setSoloUrgentes(v => !v)}
              className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ${
                soloUrgentes
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
              }`}
            >
              {soloUrgentes ? 'Ver todos' : `Solo los ${urgentes} que requieren acción`}
            </button>
          )}
        </div>

        {total === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10" />}
            title="Nada que revisar"
            subtitle="No hay ningún aviso pendiente en el pipeline"
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {visibles.map(g => {
              const t = tonoDe(g.tone)
              return (
                <div key={g.kind} className={`bg-white border border-slate-200 border-l-[3px] ${t.borde} rounded-xl overflow-hidden`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                    <span className="flex-shrink-0">{g.icon}</span>
                    <h3 className={`text-xs font-bold flex-1 truncate ${t.titulo}`}>{g.titulo}</h3>
                    <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${t.pill}`}>{g.items.length}</span>
                    <button
                      onClick={() => onSilenciar(g.kind)}
                      title="No volver a enseñarme este tipo de aviso (solo en este navegador)"
                      aria-label={`Silenciar «${g.titulo}»`}
                      className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto">
                    {g.items.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => onAbrirEntry(a.entryId)}
                        className="w-full flex items-center gap-2 text-left text-[11.5px] text-slate-700 px-3 py-1.5 hover:bg-slate-50 transition-colors"
                      >
                        <span className="flex-1">{a.text}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {avisosMudos.size > 0 && (
          <button
            onClick={onRestaurar}
            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
          >
            Tienes {avisosMudos.size} tipo{avisosMudos.size !== 1 ? 's' : ''} de aviso silenciado{avisosMudos.size !== 1 ? 's' : ''} — volver a enseñarlos
          </button>
        )}
      </div>
    </div>
  )
}
