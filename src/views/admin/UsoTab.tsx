import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import type { Profile } from '../../contexts/AuthContext'
import { fetchUsoResumen, fmtBloques, type UsoUsuario } from '../../lib/dbUso'
import { fechaRelativa } from '../../lib/formato'
import { NOMBRE_SECCION } from '../../lib/rutas'

// ── Admin → Uso ──────────────────────────────────────────────────────
// Cuánto tiempo pasa cada uno dentro de la app y en qué parte. Sale de
// app_uso (un bloque de 5 min por cada minuto activo con la pestaña
// visible, ver useLatidoUso). No es tiempo «de reloj» exacto: es tiempo
// con la app delante y tocándola, redondeado a bloques de 5 minutos.

type Rango = 7 | 30 | 90

const NOMBRE_VISTA: Record<string, string> = {
  ...NOMBRE_SECCION,
  jugador: 'Ficha de jugador',
  club: 'Ficha de club',
  miembro: 'Ficha de miembro',
  contactos: 'Contactos',
  admin: 'Administración',
}
const nombreVista = (v: string) => NOMBRE_VISTA[v] ?? (v || 'Sin sección')

/** Días del rango, de más antiguo a hoy, en 'YYYY-MM-DD' (hora local) */
function diasDelRango(n: number): string[] {
  const out: string[] = []
  const d = new Date(); d.setHours(12, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setDate(d.getDate() - i)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`)
  }
  return out
}

export function UsoTab({ profiles }: { profiles: Profile[] }) {
  const [rango, setRango] = useState<Rango>(30)
  const [filas, setFilas] = useState<UsoUsuario[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  // Si se cambia de rango antes de que llegue la respuesta anterior, esa se ignora
  const peticion = useRef(0)
  const cargar = useCallback(async (r: Rango) => {
    const n = ++peticion.current
    setCargando(true); setError(null)
    const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - (r - 1))
    try {
      const f = await fetchUsoResumen(desde)
      if (n === peticion.current) setFilas(f)
    } catch (e) {
      if (n !== peticion.current) return
      const code = (e as { code?: string } | null)?.code
      setError(code === '42883' || code === '42P01' || code === 'PGRST202'
        ? 'El registro de uso aún no está activado (falta ejecutar migration_uso_app.sql en Supabase).'
        : 'No se ha podido cargar el uso.')
    } finally {
      if (n === peticion.current) setCargando(false)
    }
  }, [])
  useEffect(() => { void cargar(rango) }, [cargar, rango])

  const dias = useMemo(() => diasDelRango(rango), [rango])
  const maxDia = useMemo(() => Math.max(1, ...filas.flatMap(f => Object.values(f.dias))), [filas])
  const totalBloques = filas.reduce((n, f) => n + f.bloques, 0)
  const perfilDe = (id: string) => profiles.find(p => p.id === id)
  const sinUso = profiles.filter(p => !p.hidden_from_status && !filas.some(f => f.userId === p.id))

  // Dónde se va el tiempo en conjunto
  const vistasEquipo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of filas) for (const [v, n] of Object.entries(f.vistas)) m[v] = (m[v] ?? 0) + n
    const total = Object.values(m).reduce((a, b) => a + b, 0) || 1
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n, pct: Math.round(n * 100 / total) }))
  }, [filas])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Clock className="w-4 h-4" /> Uso de la app</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tiempo con la app delante y tocándola (pestaña visible y algo de actividad en los últimos 5 min), en bloques de 5 minutos. Una pestaña abierta y olvidada no cuenta.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {([7, 30, 90] as Rango[]).map(r => (
            <button key={r} onClick={() => setRango(r)}
              className={`px-2.5 py-1 rounded-md border ${rango === r ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {r} días
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { l: 'tiempo total del equipo', v: fmtBloques(totalBloques) },
            { l: 'personas activas', v: String(filas.length) },
            { l: 'media por persona activa', v: fmtBloques(filas.length ? Math.round(totalBloques / filas.length) : 0) },
            { l: 'sección más usada', v: vistasEquipo[0] ? `${nombreVista(vistasEquipo[0].v)} · ${vistasEquipo[0].pct}%` : '—' },
          ].map(x => (
            <div key={x.l} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-lg font-bold leading-tight text-slate-800 truncate" title={x.v}>{x.v}</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">{x.l}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {cargando && <p className="text-xs text-slate-400 px-4 py-3">Cargando…</p>}
        {!cargando && !error && filas.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">Sin uso registrado en estos {rango} días.</p>
        )}
        {filas.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="text-left px-3 py-2 font-semibold">Quién</th>
                <th className="text-right px-3 py-2 font-semibold">Tiempo</th>
                <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Días activo</th>
                <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Por día activo</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Por día</th>
                <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Última vez</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const p = perfilDe(f.userId)
                const vistas = Object.entries(f.vistas).sort((a, b) => b[1] - a[1])
                const totalV = vistas.reduce((n, [, v]) => n + v, 0) || 1
                const esAbierto = abierto === f.userId
                return (
                  <Fragment key={f.userId}>
                    <tr onClick={() => setAbierto(esAbierto ? null : f.userId)}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${esAbierto ? 'bg-slate-50' : ''}`}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">{p?.avatar ?? '?'}</span>
                          <span className="font-semibold text-slate-800">{p?.name ?? f.userId.slice(0, 8)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtBloques(f.bloques)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{f.diasActivo}<span className="text-slate-400"> / {rango}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">{fmtBloques(f.diasActivo ? Math.round(f.bloques / f.diasActivo) : 0)}</td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {/* Una barrita por día del rango: se ve de un vistazo si entra a diario o a rachas */}
                        <div className="flex items-end gap-px h-5" title="Tiempo por día (más alto = más tiempo)">
                          {dias.map(d => {
                            const n = f.dias[d] ?? 0
                            return (
                              <span key={d} title={`${d}: ${fmtBloques(n)}`}
                                className={`flex-1 min-w-[2px] max-w-[8px] rounded-sm ${n > 0 ? 'bg-primary' : 'bg-slate-100'}`}
                                style={{ height: n > 0 ? `${Math.max(15, Math.round(n * 100 / maxDia))}%` : '2px' }} />
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap" title={f.ultimo ? new Date(f.ultimo).toLocaleString('es-ES') : ''}>
                        {f.ultimo ? fechaRelativa(f.ultimo) : '—'}
                      </td>
                    </tr>
                    {esAbierto && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-3 pb-3 pt-0">
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">En qué parte de la app</p>
                          <div className="space-y-1">
                            {vistas.map(([v, n]) => (
                              <div key={v} className="flex items-center gap-2">
                                <span className="w-36 truncate text-slate-700">{nombreVista(v)}</span>
                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(2, Math.round(n * 100 / totalV))}%` }} />
                                </div>
                                <span className="w-24 text-right tabular-nums text-slate-500 whitespace-nowrap">{fmtBloques(n)} · {Math.round(n * 100 / totalV)}%</span>
                              </div>
                            ))}
                          </div>
                          {f.primero && <p className="mt-2 text-[10.5px] text-slate-400">Primera actividad en el periodo: {new Date(f.primero).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!error && sinUso.length > 0 && (
        <p className="text-xs text-slate-400">
          <span className="font-semibold">Sin uso en estos {rango} días:</span> {sinUso.map(p => p.name).join(', ')}
        </p>
      )}

      {!error && vistasEquipo.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Dónde se va el tiempo del equipo</p>
          <div className="flex flex-wrap gap-1.5">
            {vistasEquipo.map(x => (
              <span key={x.v} className="text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5 text-slate-700">
                {nombreVista(x.v)} <span className="text-slate-400">{x.pct}% · {fmtBloques(x.n)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
