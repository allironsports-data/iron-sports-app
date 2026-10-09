import { useMemo, useState } from 'react'
import type { ScoutingPlayer, ScoutingReport, FirmasEntry } from '../types'
import type { Zona } from '../lib/zonas'
import { ZONA_CORTA, esZona } from '../lib/zonas'
import { calcularStatsJugadores, ordenarGrupos, SIN_DATO, type Grupo, type OrdenGrupo } from '../lib/statsJugadores'
import { BotonCsv } from '../components/BotonCsv'

// ── Admin → Stats Captación → Base de datos ──────────────────────────
// De qué está hecha la base de jugadores: agencias, nacionalidades,
// posiciones, categorías, zonas, quintas, pie y equipos, y en cada grupo
// cuántos están en Llamar y en el pipeline. Los números salen de
// lib/statsJugadores.ts.

interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  firmasEntries: FirmasEntry[]
  clubZonas: Record<string, Zona>
}

const ORDENES: { id: OrdenGrupo; label: string }[] = [
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'llamar', label: 'En Llamar' },
  { id: 'pctLlamar', label: '% Llamar' },
  { id: 'pipeline', label: 'En pipeline' },
  { id: 'informes', label: 'Informes' },
]

function pct(n: number, total: number): string {
  return total ? `${Math.round(100 * n / total)}%` : '—'
}

function Barra({ label, value, max, extra, color = 'bg-blue-500' }: { label: string; value: number; max: number; extra?: string; color?: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 flex-shrink-0 text-slate-600 truncate" title={label}>{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <div className="w-8 text-right text-slate-700 font-medium tabular-nums">{value}</div>
      {extra !== undefined && <div className="w-16 text-right text-slate-400 tabular-nums">{extra}</div>}
    </div>
  )
}

/** Tabla de grupos con ordenación por columna y descarga */
function TablaGrupos({ titulo, grupos, nombreCsv, etiqueta, max = 25, minJugadores = 1, nota }: {
  titulo: string
  grupos: Grupo[]
  nombreCsv: string
  etiqueta: string
  max?: number
  minJugadores?: number
  nota?: string
}) {
  const [orden, setOrden] = useState<OrdenGrupo>('jugadores')
  const [todas, setTodas] = useState(false)
  const [min, setMin] = useState(minJugadores)
  const ordenadas = useMemo(() => ordenarGrupos(grupos, orden, min), [grupos, orden, min])
  const visibles = todas ? ordenadas : ordenadas.slice(0, max)
  const sinDato = grupos.find(g => g.nombre === SIN_DATO)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
        <span className="text-xs text-slate-400">{ordenadas.length} {etiqueta}{sinDato ? ` · ${sinDato.jugadores} jugadores sin dato` : ''}</span>
        <div className="flex-1" />
        <label className="text-[11px] text-slate-500 flex items-center gap-1">mín.
          <input type="number" min={1} value={min} onChange={e => setMin(Math.max(1, Number(e.target.value) || 1))} className="w-12 border border-slate-200 rounded px-1 py-0.5 text-[11px]" aria-label="Mínimo de jugadores" />
        </label>
        <select value={orden} onChange={e => setOrden(e.target.value as OrdenGrupo)} aria-label="Ordenar por" className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600">
          {ORDENES.map(o => <option key={o.id} value={o.id}>Por {o.label.toLowerCase()}</option>)}
        </select>
        <BotonCsv
          nombre={nombreCsv}
          cabeceras={['Nombre', 'Jugadores', 'Llamar', '% Llamar', 'Seguir', 'Sin valorar', 'En pipeline', 'Informes']}
          filas={() => ordenadas.map(g => [g.nombre, g.jugadores, g.llamar, g.pctLlamar, g.seguir, g.sinValorar, g.pipeline, g.informes])}
        />
      </div>
      {nota && <p className="text-[11px] text-slate-400 mb-2">{nota}</p>}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
            <th className="text-left py-1 font-semibold">Nombre</th>
            <th className="text-right py-1 font-semibold">Jug.</th>
            <th className="text-right py-1 font-semibold">Llamar</th>
            <th className="text-right py-1 font-semibold">%</th>
            <th className="text-right py-1 font-semibold hidden sm:table-cell">Seguir</th>
            <th className="text-right py-1 font-semibold hidden sm:table-cell">Sin val.</th>
            <th className="text-right py-1 font-semibold">Pipeline</th>
            <th className="text-right py-1 font-semibold hidden sm:table-cell">Inf.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {visibles.map(g => (
            <tr key={g.nombre}>
              <td className="py-1.5 text-slate-700 truncate max-w-[200px]" title={g.nombre}>{g.nombre}</td>
              <td className="py-1.5 text-right tabular-nums font-medium text-slate-800">{g.jugadores}</td>
              <td className="py-1.5 text-right tabular-nums text-amber-700 font-semibold">{g.llamar || '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{g.llamar ? `${g.pctLlamar}%` : '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-600 hidden sm:table-cell">{g.seguir || '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-400 hidden sm:table-cell">{g.sinValorar || '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-green-700">{g.pipeline || '—'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{g.informes || '—'}</td>
            </tr>
          ))}
          {visibles.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-slate-400">Nada que mostrar</td></tr>}
        </tbody>
      </table>
      {ordenadas.length > max && (
        <button onClick={() => setTodas(t => !t)} className="mt-2 text-[11px] font-semibold text-primary hover:underline">
          {todas ? 'Ver menos' : `Ver las ${ordenadas.length}`}
        </button>
      )}
    </div>
  )
}

/** Barras de un reparto corto (posiciones, categorías, zonas…), con los Llamar al lado */
function Reparto({ titulo, grupos, total, etiqueta, max = 12 }: { titulo: string; grupos: Grupo[]; total: number; etiqueta: (n: string) => string; max?: number }) {
  const top = grupos.slice(0, max)
  const mayor = top[0]?.jugadores ?? 1
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{titulo}</h3>
      <div className="space-y-1.5">
        {top.map(g => (
          <Barra key={g.nombre} label={etiqueta(g.nombre)} value={g.jugadores} max={mayor}
            extra={`${pct(g.jugadores, total)} · ${g.llamar} L`}
            color={g.nombre === SIN_DATO ? 'bg-slate-300' : 'bg-blue-500'} />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">A la derecha: % del total y jugadores en Llamar (L)</p>
    </div>
  )
}

export function StatsBaseDatos({ scoutingPlayers, scoutingReports, firmasEntries, clubZonas }: Props) {
  const s = useMemo(() => calcularStatsJugadores(scoutingPlayers, scoutingReports, firmasEntries, clubZonas), [scoutingPlayers, scoutingReports, firmasEntries, clubZonas])
  const zonaCorta = (z: string) => esZona(z) ? ZONA_CORTA[z] : z
  const resumen = [
    { label: 'Jugadores', value: s.total },
    { label: 'En Llamar', value: s.enLlamar, sub: pct(s.enLlamar, s.total) },
    { label: 'En pipeline', value: s.enPipeline, sub: pct(s.enPipeline, s.total) },
    { label: 'Con agencia', value: s.conAgencia, sub: `${pct(s.conAgencia, s.total)} · ${s.nAgencias} agencias` },
    { label: 'Con nacionalidad', value: s.conNacionalidad, sub: `${pct(s.conNacionalidad, s.total)} · ${s.dobleNacionalidad} dobles` },
    { label: 'Con fecha de nac.', value: s.conFechaNac, sub: pct(s.conFechaNac, s.total) },
    { label: 'Con equipo', value: s.conEquipo, sub: pct(s.conEquipo, s.total) },
    { label: 'Con categoría', value: s.conCategoria, sub: pct(s.conCategoria, s.total) },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {resumen.map(r => (
          <div key={r.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-slate-800 tabular-nums">{r.value}</div>
            <div className="text-xs text-slate-500">{r.label}</div>
            {r.sub && <div className="text-[10px] text-slate-400 mt-0.5">{r.sub}</div>}
          </div>
        ))}
      </div>

      <TablaGrupos titulo="Agencias" grupos={s.agencias} nombreCsv="stats-agencias" etiqueta="agencias" minJugadores={2}
        nota="Qué agencias traen más jugadores y cuáles convierten mejor a Llamar. El mínimo deja fuera las de un solo jugador." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TablaGrupos titulo="Nacionalidades" grupos={s.nacionalidades} nombreCsv="stats-nacionalidades" etiqueta="nacionalidades" max={15}
          nota="Un jugador con doble nacionalidad cuenta en las dos." />
        <TablaGrupos titulo="Equipos con más jugadores" grupos={s.equipos} nombreCsv="stats-equipos-jugadores" etiqueta="equipos" max={15} minJugadores={3} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Reparto titulo="Posiciones (posición 1)" grupos={s.posiciones} total={s.total} etiqueta={n => n} max={14} />
        <Reparto titulo="Categorías" grupos={s.categorias} total={s.total} etiqueta={n => n} />
        <Reparto titulo="Zonas" grupos={s.zonas} total={s.total} etiqueta={zonaCorta} />
        <Reparto titulo="Quintas (año de nacimiento)" grupos={s.quintas.filter(g => g.nombre === SIN_DATO || Number(g.nombre) >= 1995)} total={s.total} etiqueta={n => n} max={20} />
        <Reparto titulo="Pie" grupos={s.pies} total={s.total} etiqueta={n => n} />
      </div>
    </div>
  )
}
