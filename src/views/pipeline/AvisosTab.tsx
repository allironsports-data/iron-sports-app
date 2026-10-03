import { useCallback, useMemo, useState } from 'react'
import { BellOff, Check, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import type { Aviso, GrupoAviso } from '../captacion/firmas/avisos'
import type { FirmasEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { FIRMAS_CONFIG } from '../captacion/firmas/helpers'
import { FirmasManagers } from '../captacion/firmas/comun'

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
  onPosponer, onVisto, ocultos, onRestaurarPospuestos,
  entries, profiles, currentProfile, onOpenScoutingPlayer,
}: {
  /** Para pintar cada aviso con su contexto (estatus, zona, encargados) y filtrar «solo los míos» */
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  onOpenScoutingPlayer?: (id: string) => void
  grupos: GrupoAviso[]
  urgentes: number
  total: number
  avisosMudos: Set<string>
  onSilenciar: (kind: string) => void
  onRestaurar: () => void
  onAbrirEntry: (id: string) => void
  onPosponer: (a: Aviso, dias?: number) => void
  onVisto: (a: Aviso) => void
  ocultos: number
  onRestaurarPospuestos: () => void
}) {
  const [soloUrgentes, setSoloUrgentes] = useState(false)
  const porId = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries])
  // «Solo los míos»: los avisos de las tarjetas que llevo yo. Por defecto
  // activo si llevo alguna: cada encargado ve lo suyo, no la lista entera.
  const llevoAlguna = useMemo(() => entries.some(e => e.managers.includes(currentProfile.id)), [entries, currentProfile.id])
  const [soloMios, setSoloMios] = useState<boolean | null>(null)
  const soloMiosActivo = soloMios ?? llevoAlguna
  const esMio = useCallback((a: Aviso) => !!porId.get(a.entryId)?.managers.includes(currentProfile.id), [porId, currentProfile.id])
  const visibles = useMemo(() => {
    let gs = soloUrgentes ? grupos.filter(g => g.tone === 'red') : grupos
    if (soloMiosActivo) gs = gs.map(g => ({ ...g, items: g.items.filter(esMio) })).filter(g => g.items.length > 0)
    return gs
  }, [grupos, soloUrgentes, soloMiosActivo, esMio])
  const nMios = useMemo(() => grupos.reduce((n, g) => n + g.items.filter(esMio).length, 0), [grupos, esMio])

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
          {llevoAlguna && (
            <button
              onClick={() => setSoloMios(!soloMiosActivo)}
              className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ${
                soloMiosActivo ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Avisos de las tarjetas que llevas tú"
            >
              Solo los míos · {nMios}
            </button>
          )}
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

        {total > 0 && visibles.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10" />}
            title={soloMiosActivo ? 'Nada pendiente en tus tarjetas' : 'Nada urgente'}
            subtitle={soloMiosActivo ? `Hay ${total} aviso${total !== 1 ? 's' : ''} en tarjetas de otros encargados — quita «Solo los míos» para verlos` : 'Quita el filtro para ver el resto'}
          />
        ) : total === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10" />}
            title="Nada que revisar"
            subtitle={ocultos > 0
              ? `No queda ningún aviso pendiente (${ocultos} pospuesto${ocultos !== 1 ? 's' : ''} o visto${ocultos !== 1 ? 's' : ''})`
              : 'No hay ningún aviso pendiente en el pipeline'}
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
                    {g.items.map(a => {
                      const e = porId.get(a.entryId)
                      const cfg = e ? FIRMAS_CONFIG[e.status] : undefined
                      // El texto del aviso suele empezar por el nombre: se quita para no repetirlo
                      const detalle = e && a.text.startsWith(e.playerName) ? a.text.slice(e.playerName.length).replace(/^[\s:·—-]+/, '') : a.text
                      return (
                      <div key={`${a.kind}|${a.entryId}`} className="flex items-center hover:bg-slate-50 transition-colors">
                        <button
                          onClick={() => onAbrirEntry(a.entryId)}
                          className="flex-1 min-w-0 text-left pl-3 pr-2 py-1.5"
                        >
                          {e ? (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {cfg && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} title={cfg.label} />}
                              {e.potencialTop && <span className="text-[11px]" title="Potencial top">⭐</span>}
                              <span className="text-xs font-semibold text-slate-800">{e.playerName}</span>
                              <span className="text-[11px] text-slate-400">{e.zone}</span>
                              <FirmasManagers managerIds={e.managers} profiles={profiles} max={2} />
                            </span>
                          ) : null}
                          <span className="block text-[11.5px] text-slate-700">{detalle}</span>
                        </button>
                        <span className="flex items-center gap-0.5 pr-2 flex-shrink-0">
                          {e?.scoutingPlayerId && onOpenScoutingPlayer && (
                            <button
                              onClick={() => onOpenScoutingPlayer(e.scoutingPlayerId!)}
                              title="Abrir su ficha de Captación (informes, partidos)"
                              aria-label="Abrir ficha de Captación"
                              className="p-1 rounded text-slate-300 hover:text-primary hover:bg-blue-50"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onPosponer(a, 7)}
                            title="Posponer 7 días"
                            aria-label="Posponer 7 días"
                            className="p-1 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onVisto(a)}
                            title="Visto — no volver a avisarme de esto (vuelve si cambia)"
                            aria-label="Marcar como visto"
                            className="p-1 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {ocultos > 0 && (
            <button
              onClick={onRestaurarPospuestos}
              className="text-[11px] text-slate-500 hover:text-slate-700 underline text-left"
            >
              {ocultos} aviso{ocultos !== 1 ? 's' : ''} pospuesto{ocultos !== 1 ? 's' : ''} o dado{ocultos !== 1 ? 's' : ''} por visto{ocultos !== 1 ? 's' : ''} — volver a enseñarlo{ocultos !== 1 ? 's' : ''}
            </button>
          )}
          {avisosMudos.size > 0 && (
            <button
              onClick={onRestaurar}
              className="text-[11px] text-slate-500 hover:text-slate-700 underline text-left"
            >
              Tienes {avisosMudos.size} tipo{avisosMudos.size !== 1 ? 's' : ''} de aviso silenciado{avisosMudos.size !== 1 ? 's' : ''} — volver a enseñarlos
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
