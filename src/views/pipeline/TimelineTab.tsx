import { useMemo, useState } from 'react'
import { Search, X, MessageSquare, ArrowRightLeft, UserPlus, ListTodo, PartyPopper, Phone, Handshake, Home } from 'lucide-react'
import type { FirmasEntry, FirmasStatus, Task } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { norm as normSearch } from '../../lib/texto'
import { EmptyState } from '../../components/EmptyState'
import { FIRMAS_CONFIG } from '../captacion/firmas/helpers'

// ── Timeline del pipeline ────────────────────────────────────────────
// Todo lo que se mueve en Firmar, de más reciente a más antiguo: apuntes
// (notas, llamadas, whatsapps, reuniones, entorno), cambios de estatus,
// altas en el pipeline, firmas y las tareas que nacen de una próxima acción.
//
// No hay tabla de eventos: se reconstruye de lo que ya está guardado
// (entry.comments, entry.createdAt, entry.signedAt y las tareas vinculadas
// por nextActionTaskId). Por eso no hace falta migración ninguna.

type TipoEvento = 'apunte' | 'estatus' | 'alta' | 'firmado' | 'tarea'

interface Evento {
  id: string
  tipo: TipoEvento
  fecha: string            // ISO
  entryId: string
  jugador: string
  estatus: FirmasStatus
  texto?: string
  autor?: string           // nombre visible
  /** subtipo del apunte: llamada, whatsapp, reunión… */
  kind?: string
}

const TIPO_META: Record<TipoEvento, { label: string; icon: typeof MessageSquare; punto: string; texto: string }> = {
  apunte:   { label: 'Apuntes',            icon: MessageSquare,   punto: 'bg-slate-400',   texto: 'text-slate-600' },
  estatus:  { label: 'Cambios de estatus', icon: ArrowRightLeft,  punto: 'bg-violet-500',  texto: 'text-violet-700' },
  alta:     { label: 'Altas',              icon: UserPlus,        punto: 'bg-blue-500',    texto: 'text-blue-700' },
  firmado:  { label: 'Firmados',           icon: PartyPopper,     punto: 'bg-green-500',   texto: 'text-green-700' },
  tarea:    { label: 'Tareas',             icon: ListTodo,        punto: 'bg-amber-500',   texto: 'text-amber-700' },
}

const TIPOS: TipoEvento[] = ['apunte', 'estatus', 'alta', 'firmado', 'tarea']

/** Icono del subtipo de apunte (llamada, whatsapp…). Sin subtipo, nota suelta. */
const KIND_ICON: Record<string, typeof Phone> = {
  llamada: Phone, whatsapp: MessageSquare, reunion: Handshake, entorno: Home, telefono: Phone,
}

/** «hace 3 h», «ayer», «12 mar» — lo que se lee de un vistazo en un timeline */
function cuando(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

/** Cabecera de día: «Hoy», «Ayer» o la fecha larga */
function etiquetaDia(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(Date.now() - 86400000)
  const mismo = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mismo(d, hoy)) return 'Hoy'
  if (mismo(d, ayer)) return 'Ayer'
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

const PAGINA = 60

export function TimelineTab({
  entries, tasks, profiles, onOpenEntry,
}: {
  entries: FirmasEntry[]
  /** Tareas del tablero: solo entran las que nacieron de una próxima acción */
  tasks: Task[]
  profiles: Profile[]
  onOpenEntry: (id: string) => void
}) {
  const [tiposOn, setTiposOn] = useState<Set<TipoEvento>>(new Set(TIPOS))
  const [q, setQ] = useState('')
  const [autorSel, setAutorSel] = useState('all')
  const [visibles, setVisibles] = useState(PAGINA)

  const nombreDe = useMemo(() => {
    const m = new Map(profiles.map(p => [p.id, p.name]))
    return (id?: string, fallback?: string) => (id && m.get(id)) || fallback || undefined
  }, [profiles])

  const eventos = useMemo(() => {
    const out: Evento[] = []
    // Las tareas se buscan por id: cada entrada apunta a la suya con nextActionTaskId
    const tareaDe = new Map(tasks.map(t => [t.id, t]))

    for (const e of entries) {
      const base = { entryId: e.id, jugador: e.playerName, estatus: e.status }

      for (const c of e.comments ?? []) {
        if (!c.date) continue
        const esEstatus = c.kind === 'estatus'
        out.push({
          ...base,
          id: `c-${c.id}`,
          tipo: esEstatus ? 'estatus' : 'apunte',
          fecha: c.date,
          texto: c.text,
          autor: nombreDe(c.authorId, c.author),
          kind: esEstatus ? undefined : c.kind,
        })
      }

      if (e.createdAt) out.push({ ...base, id: `a-${e.id}`, tipo: 'alta', fecha: e.createdAt })
      if (e.signedAt) out.push({ ...base, id: `f-${e.id}`, tipo: 'firmado', fecha: e.signedAt })

      const t = e.nextActionTaskId ? tareaDe.get(e.nextActionTaskId) : undefined
      if (t?.createdAt) {
        out.push({
          ...base,
          id: `t-${t.id}`,
          tipo: 'tarea',
          fecha: t.createdAt,
          texto: t.title,
          autor: nombreDe(t.assigneeId),
        })
      }
    }

    return out.sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [entries, tasks, nombreDe])

  const autores = useMemo(
    () => [...new Set(eventos.map(e => e.autor).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es')),
    [eventos],
  )

  const nq = normSearch(q)
  const filtrados = useMemo(() => eventos.filter(e => {
    if (!tiposOn.has(e.tipo)) return false
    if (autorSel !== 'all' && e.autor !== autorSel) return false
    if (nq && !normSearch(`${e.jugador} ${e.texto ?? ''}`).includes(nq)) return false
    return true
  }), [eventos, tiposOn, autorSel, nq])

  const conteos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of eventos) m[e.tipo] = (m[e.tipo] ?? 0) + 1
    return m
  }, [eventos])

  const alPaso = filtrados.slice(0, visibles)
  const toggleTipo = (t: TipoEvento) => setTiposOn(prev => {
    const n = new Set(prev)
    if (n.has(t)) n.delete(t); else n.add(t)
    // Dejarlo todo apagado no enseña nada: se vuelve a encender todo
    return n.size === 0 ? new Set(TIPOS) : n
  })

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-4xl mx-auto space-y-3">

        {/* ── Filtros ── */}
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setVisibles(PAGINA) }}
              placeholder="Buscar jugador o texto…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TIPOS.map(t => {
              const meta = TIPO_META[t]
              const on = tiposOn.has(t)
              return (
                <button
                  key={t}
                  onClick={() => { toggleTipo(t); setVisibles(PAGINA) }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-white/70' : meta.punto}`} />
                  {meta.label}
                  <span className={on ? 'text-white/60' : 'text-slate-400'}>{conteos[t] ?? 0}</span>
                </button>
              )
            })}
          </div>
          {autores.length > 1 && (
            <select
              value={autorSel}
              onChange={e => { setAutorSel(e.target.value); setVisibles(PAGINA) }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="all">Todo el equipo</option>
              {autores.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Línea de tiempo ── */}
        {alPaso.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="w-10 h-10" />}
            title="Nada por aquí todavía"
            subtitle="Aquí irán apareciendo los apuntes, cambios de estatus y altas del pipeline"
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {alPaso.map((ev, i) => {
              const meta = TIPO_META[ev.tipo]
              const Icono = ev.kind && KIND_ICON[ev.kind] ? KIND_ICON[ev.kind] : meta.icon
              const cfg = FIRMAS_CONFIG[ev.estatus]
              const diaAnterior = i > 0 ? etiquetaDia(alPaso[i - 1].fecha) : null
              const dia = etiquetaDia(ev.fecha)
              return (
                <div key={ev.id}>
                  {dia !== diaAnterior && (
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide first-letter:uppercase">
                      {dia}
                    </div>
                  )}
                  <button
                    onClick={() => onOpenEntry(ev.entryId)}
                    className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${meta.punto}`}>
                      <Icono className="w-3 h-3 text-white" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800">{ev.jugador}</span>
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full border px-1.5 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        {ev.tipo !== 'apunte' && (
                          <span className={`text-[10.5px] font-semibold ${meta.texto}`}>
                            {ev.tipo === 'alta' ? 'entra en el pipeline'
                              : ev.tipo === 'firmado' ? 'firmado'
                              : ev.tipo === 'tarea' ? 'tarea nueva'
                              : 'cambio de estatus'}
                          </span>
                        )}
                      </span>
                      {ev.texto && (
                        <span className="block text-[11.5px] text-slate-600 leading-relaxed line-clamp-3 mt-0.5 whitespace-pre-wrap">
                          {ev.texto}
                        </span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className="block text-[10.5px] text-slate-400 whitespace-nowrap">{cuando(ev.fecha)}</span>
                      {ev.autor && <span className="block text-[10.5px] text-slate-500 whitespace-nowrap">{ev.autor}</span>}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {filtrados.length > alPaso.length && (
          <button
            onClick={() => setVisibles(v => v + PAGINA)}
            className="w-full py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
          >
            Ver más ({filtrados.length - alPaso.length} restantes)
          </button>
        )}
      </div>
    </div>
  )
}
