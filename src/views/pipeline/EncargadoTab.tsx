import { useMemo, useState } from 'react'
import { AlertTriangle, Flame, PhoneOff, CalendarClock, ChevronRight, Inbox } from 'lucide-react'
import type { FirmasEntry, FirmasStatus } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { BotonCsv } from '../../components/BotonCsv'
import { FIRMAS_STATUSES, FIRMAS_CONFIG, FIRMAS_ACTION_KIND_META, necesitaTelefono, firmasAging } from '../captacion/firmas/helpers'

// ── Panel del encargado ──────────────────────────────────────────────
// «¿Qué tengo que hacer con mi pipeline?». Cuatro bloques de trabajo
// arriba (lo que urge) y, debajo, mi pipeline entero: embudo por estatus
// + tabla con lo que hace falta para decidir a quién tocar.
//
// Todo sale de las tarjetas de Firmar: no hay datos nuevos ni migración.

/** Día de hoy en AAAA-MM-DD local (nextActionDate se guarda así) */
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const dias = (iso?: string): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}

/** «hoy», «hace 3 d», «en 2 d» para una fecha AAAA-MM-DD */
function cuandoAccion(fecha?: string): { txt: string; vencida: boolean } {
  if (!fecha) return { txt: 'sin fecha', vencida: false }
  const hoy = hoyISO()
  if (fecha === hoy) return { txt: 'hoy', vencida: true }
  const d = Math.round((new Date(fecha + 'T12:00:00').getTime() - new Date(hoy + 'T12:00:00').getTime()) / 86400000)
  if (d < 0) return { txt: `hace ${-d} d`, vencida: true }
  return { txt: `en ${d} d`, vencida: false }
}

function Bloque({
  titulo, subtitulo, icono, tono, entries, onAbrir, pie,
}: {
  titulo: string
  subtitulo: string
  icono: React.ReactNode
  tono: string
  entries: { e: FirmasEntry; detalle?: string }[]
  onAbrir: (id: string) => void
  pie?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <span className={tono}>{icono}</span>
        <h3 className="text-sm font-bold text-slate-800 flex-1">{titulo}</h3>
        <span className={`text-sm font-bold ${entries.length ? tono : 'text-slate-300'}`}>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-[11.5px] text-slate-400 italic">{subtitulo}</p>
      ) : (
        <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
          {entries.map(({ e, detalle }) => {
            const cfg = FIRMAS_CONFIG[e.status]
            return (
              <button
                key={e.id}
                onClick={() => onAbrir(e.id)}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <span className="text-xs font-medium text-slate-800 truncate flex-1">{e.playerName}</span>
                {detalle && <span className="text-[11px] text-slate-500 whitespace-nowrap">{detalle}</span>}
                <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
      {pie && entries.length > 0 && <p className="px-4 py-1.5 text-[10.5px] text-slate-400 border-t border-slate-50">{pie}</p>}
    </div>
  )
}

type Orden = 'parado' | 'nombre' | 'estatus' | 'accion'

export function EncargadoTab({
  entries, profiles, currentProfile, onAbrirEntry,
}: {
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  onAbrirEntry: (id: string) => void
}) {
  const [quien, setQuien] = useState(currentProfile.id)
  const [orden, setOrden] = useState<Orden>('parado')
  const [estatusSel, setEstatusSel] = useState<FirmasStatus | 'all'>('all')

  // Solo salen los que tienen alguna tarjeta: la lista de perfiles incluye
  // a gente que no lleva pipeline y ensuciaba el desplegable.
  const conPipeline = useMemo(() => {
    const ids = new Set(entries.flatMap(e => e.managers))
    return profiles.filter(p => ids.has(p.id) || p.id === currentProfile.id)
  }, [entries, profiles, currentProfile.id])

  const mias = useMemo(
    () => entries.filter(e => e.managers.includes(quien)),
    [entries, quien],
  )

  const bloques = useMemo(() => {
    const vivas = mias.filter(e => e.status !== 'firmado')

    // 1. Lo que toca hoy: próxima acción de hoy o vencida
    const hoy = vivas
      .filter(e => e.nextAction && cuandoAccion(e.nextActionDate).vencida)
      .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''))
      .map(e => {
        const meta = e.nextActionKind ? FIRMAS_ACTION_KIND_META[e.nextActionKind] : undefined
        const c = cuandoAccion(e.nextActionDate)
        return { e, detalle: `${meta?.icon ?? ''} ${e.nextAction} · ${c.txt}`.trim() }
      })

    // 2. Se enfrían: pasan la cadencia de su estatus (10/50/90 días)
    const frias = vivas
      .map(e => ({ e, aging: firmasAging(e) }))
      .filter(x => x.aging?.overdue)
      .sort((a, b) => (b.aging!.days - b.aging!.limit) - (a.aging!.days - a.aging!.limit))
      .map(({ e, aging }) => ({ e, detalle: `${aging!.days} d sin tocar (máx. ${aging!.limit})` }))

    // 3. Calientes: las que están a punto
    const calientes = vivas
      .filter(e => e.status === 'caliente')
      .map(e => ({ e, d: dias(e.statusUpdatedAt ?? e.updatedAt) }))
      .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))
      .map(({ e, d }) => ({ e, detalle: d == null ? '' : d === 0 ? 'hoy' : `hace ${d} d` }))

    // 4. Sin teléfono: en la práctica están esperando el número
    const sinTel = vivas.filter(necesitaTelefono).map(e => ({ e }))

    return { hoy, frias, calientes, sinTel }
  }, [mias])

  // ── Mi pipeline: embudo + tabla ──
  const porEstatus = useMemo(() => {
    const m = {} as Record<FirmasStatus, FirmasEntry[]>
    FIRMAS_STATUSES.forEach(s => { m[s] = [] })
    mias.forEach(e => { m[e.status]?.push(e) })
    return m
  }, [mias])

  const maxEstatus = Math.max(1, ...FIRMAS_STATUSES.map(s => porEstatus[s].length))

  const tabla = useMemo(() => {
    const lista = estatusSel === 'all' ? mias : porEstatus[estatusSel]
    const parado = (e: FirmasEntry) => firmasAging(e)?.days ?? dias(e.updatedAt) ?? 0
    return [...lista].sort((a, b) => {
      if (orden === 'nombre') return a.playerName.localeCompare(b.playerName)
      if (orden === 'estatus') return FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) || a.playerName.localeCompare(b.playerName)
      if (orden === 'accion') return (a.nextActionDate ?? '9999').localeCompare(b.nextActionDate ?? '9999')
      return parado(b) - parado(a)
    })
  }, [mias, porEstatus, estatusSel, orden])

  const persona = conPipeline.find(p => p.id === quien)
  const esYo = quien === currentProfile.id

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* ── Cabecera con el selector de persona ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-sm font-semibold text-slate-800">
              {esYo ? 'Mi pipeline' : `Pipeline de ${persona?.name ?? '—'}`}
            </h2>
            <p className="text-xs text-slate-400">
              {mias.length} tarjeta{mias.length !== 1 ? 's' : ''} · {mias.filter(e => e.status !== 'firmado').length} en marcha
            </p>
          </div>
          <select
            value={quien}
            onChange={e => setQuien(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {conPipeline.map(p => (
              <option key={p.id} value={p.id}>{p.id === currentProfile.id ? `${p.name} (yo)` : p.name}</option>
            ))}
          </select>
        </div>

        {mias.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-10 h-10" />}
            title={esYo ? 'No llevas ninguna tarjeta' : 'No lleva ninguna tarjeta'}
            subtitle="Las tarjetas se asignan desde el tablero de Firmar"
          />
        ) : (
          <>
            {/* ── Lo que hay que hacer ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Bloque
                titulo="Qué toca hoy"
                subtitulo="Ninguna acción vencida ni para hoy. Al día."
                icono={<CalendarClock className="w-4 h-4" />}
                tono="text-red-600"
                entries={bloques.hoy}
                onAbrir={onAbrirEntry}
                pie="Próximas acciones con fecha de hoy o pasada"
              />
              <Bloque
                titulo="Se están enfriando"
                subtitulo="Ninguna pasada de plazo."
                icono={<AlertTriangle className="w-4 h-4" />}
                tono="text-orange-600"
                entries={bloques.frias}
                onAbrir={onAbrirEntry}
                pie="Cadencia por estatus: caliente 10 días, templado 50, frío 90"
              />
              <Bloque
                titulo="Mis calientes"
                subtitulo="Ninguna en caliente ahora mismo."
                icono={<Flame className="w-4 h-4" />}
                tono="text-red-500"
                entries={bloques.calientes}
                onAbrir={onAbrirEntry}
                pie="Tiempo desde el último cambio de estatus"
              />
              <Bloque
                titulo="Falta el teléfono"
                subtitulo="Ninguna esperando número."
                icono={<PhoneOff className="w-4 h-4" />}
                tono="text-amber-600"
                entries={bloques.sinTel}
                onAbrir={onAbrirEntry}
              />
            </div>

            {/* ── Embudo ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 flex-1">El embudo</h3>
                {estatusSel !== 'all' && (
                  <button onClick={() => setEstatusSel('all')} className="text-[11px] text-slate-500 underline hover:text-slate-700">
                    Ver todas
                  </button>
                )}
              </div>
              <div className="p-3 space-y-1">
                {FIRMAS_STATUSES.map(s => {
                  const n = porEstatus[s].length
                  const cfg = FIRMAS_CONFIG[s]
                  const sel = estatusSel === s
                  return (
                    <button
                      key={s}
                      onClick={() => setEstatusSel(sel ? 'all' : s)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${sel ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                    >
                      <span className="w-20 text-left text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <span className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <span className={`block h-full rounded-full ${cfg.dot}`} style={{ width: `${(n / maxEstatus) * 100}%` }} />
                      </span>
                      <span className="w-7 text-right text-xs font-bold text-slate-700 tabular-nums">{n || '—'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Tabla detallada ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">
                  {estatusSel === 'all' ? 'Todas mis tarjetas' : `En ${FIRMAS_CONFIG[estatusSel].label}`}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{tabla.length}</span>
                </h3>
                <select
                  value={orden}
                  onChange={e => setOrden(e.target.value as Orden)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none"
                >
                  <option value="parado">Más paradas primero</option>
                  <option value="accion">Por próxima acción</option>
                  <option value="estatus">Por estatus</option>
                  <option value="nombre">Por nombre</option>
                </select>
                <div className="ml-auto">
                  <BotonCsv
                    nombre={`pipeline_${(persona?.name ?? 'encargado').replace(/\s+/g, '_').toLowerCase()}`}
                    cabeceras={['Jugador', 'Estatus', 'Zona', 'Días sin tocar', 'Próxima acción', 'Fecha acción']}
                    filas={() => tabla.map(e => [
                      e.playerName, FIRMAS_CONFIG[e.status].label, e.zone,
                      firmasAging(e)?.days ?? dias(e.updatedAt) ?? '',
                      e.nextAction ?? '', e.nextActionDate ?? '',
                    ])}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Jugador</th>
                      <th className="text-left px-2 py-2 font-semibold">Estatus</th>
                      <th className="text-left px-2 py-2 font-semibold">Zona</th>
                      <th className="text-center px-2 py-2 font-semibold" title="Días desde el último movimiento">Parada</th>
                      <th className="text-left px-2 py-2 font-semibold">Próxima acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tabla.map(e => {
                      const cfg = FIRMAS_CONFIG[e.status]
                      const aging = firmasAging(e)
                      const d = aging?.days ?? dias(e.updatedAt)
                      const c = cuandoAccion(e.nextActionDate)
                      const meta = e.nextActionKind ? FIRMAS_ACTION_KIND_META[e.nextActionKind] : undefined
                      return (
                        <tr
                          key={e.id}
                          onClick={() => onAbrirEntry(e.id)}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">{e.playerName}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full border px-1.5 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-[11px] text-slate-500 whitespace-nowrap">{e.zone || '—'}</td>
                          <td className={`px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap ${
                            aging?.overdue ? 'text-red-600 font-bold' : aging?.warn ? 'text-amber-600 font-semibold' : 'text-slate-500'
                          }`}>
                            {d == null ? '—' : `${d} d`}
                          </td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap">
                            {e.nextAction ? (
                              <span className={c.vencida ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                                {meta?.icon} {e.nextAction} <span className="text-slate-400">· {c.txt}</span>
                              </span>
                            ) : <span className="text-slate-300">sin acción</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
