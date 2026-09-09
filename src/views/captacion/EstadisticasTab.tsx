import { useMemo, useState } from 'react'
import { AlertTriangle, History, CalendarDays } from 'lucide-react'
import type { ScoutingAssessment } from '../../types'
import { ZONA_CORTA, SIN_ZONA, type Zona } from '../../lib/zonas'
import { BotonCsv } from '../../components/BotonCsv'
import { ALL_ASSESSMENTS, ASSESSMENT_DOT } from './helpers'
import { type FilaEquipo, etiquetaTemporada, reglaRelevante, reglaCubierto, MIN_LLAMAR_RELEVANTE, MIN_PARTIDOS_CUBIERTO } from './filasEquipos'

// ── Estadísticas de control de equipos (Admin → Control de equipos) ──
// Responde a tres preguntas de un vistazo:
//   ¿de cuántos equipos tenemos control, y de cuáles no?
//   ¿en qué zonas y categorías se concentra lo interesante (Llamar/Seguir)?
//   ¿qué equipos relevantes se nos están quedando sin cubrir?
//
// Todo sale de las mismas filas que la pestaña Equipos: no hay una segunda
// forma de contar que pueda decir algo distinto.

/** Una fila del desglose, ya sea por zona o por categoría */
interface Grupo {
  clave: string
  equipos: number
  relevantes: number
  cubiertos: number
  jugadores: number
  informes: number
  partidos: number
  /** Jugadores «en Llamar» con el MISMO criterio que la regla de equipo
   *  relevante: etiqueta Llamar o informe con ese veredicto. Si aquí se
   *  contaran solo las etiquetas, un equipo saldría relevante con un «—» al
   *  lado y no habría forma de entender por qué. */
  enLlamar: number
  /** jugadores por etiqueta (Llamar aparte, arriba) */
  porEtiqueta: Record<string, number>
}

const grupoVacio = (clave: string): Grupo => ({
  clave, equipos: 0, relevantes: 0, cubiertos: 0, jugadores: 0, informes: 0, partidos: 0,
  enLlamar: 0, porEtiqueta: {},
})

/** Barra de proporción sobria: sin librería de gráficos para no engordar el bundle */
function Barra({ n, max, cls }: { n: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-slate-600 w-6 text-right">{n || '—'}</span>
    </div>
  )
}

function Tarjeta({ n, label, tono }: { n: number | string; label: string; tono?: string }) {
  return (
    <div className="flex-1 min-w-[110px] bg-white border border-slate-200 rounded-lg px-4 py-2.5">
      <div className={`text-xl font-bold leading-tight ${tono ?? 'text-slate-800'}`}>{n}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

export function EstadisticasTab({
  filas, desde,
}: {
  filas: FilaEquipo[]
  /** Inicio de la temporada actual (inicioTemporada()) */
  desde: string
}) {
  const [dim, setDim] = useState<'zona' | 'categoria'>('zona')
  const [historico, setHistorico] = useState(false)

  const nPartidos = (f: FilaEquipo) => historico ? f.partidosHist : f.partidos
  const esRelevante = (f: FilaEquipo) => f.relevante || reglaRelevante(f)
  const esCubierto = (f: FilaEquipo) => f.cubierto || reglaCubierto(nPartidos(f))

  const datos = useMemo(() => {
    const porZona: Record<string, Grupo> = {}
    const porCat: Record<string, Grupo> = {}
    const total = grupoVacio('Total')
    const sinCubrir: FilaEquipo[] = []

    for (const f of filas) {
      const rel = esRelevante(f)
      const cub = esCubierto(f)
      if (rel && !cub) sinCubrir.push(f)

      for (const [mapa, clave] of [[porZona, f.zona], [porCat, f.categoria]] as const) {
        mapa[clave] ??= grupoVacio(clave)
        const g = mapa[clave]
        g.equipos++
        if (rel) g.relevantes++
        if (rel && cub) g.cubiertos++
        g.jugadores += f.jugadores
        g.informes += f.informes
        g.partidos += nPartidos(f)
        g.enLlamar += f.enLlamar
        for (const p of f.plantilla) {
          if (!p.assessment) continue
          g.porEtiqueta[p.assessment] = (g.porEtiqueta[p.assessment] ?? 0) + 1
        }
      }

      total.equipos++
      if (rel) total.relevantes++
      if (rel && cub) total.cubiertos++
      total.jugadores += f.jugadores
      total.informes += f.informes
      total.partidos += nPartidos(f)
      total.enLlamar += f.enLlamar
      for (const p of f.plantilla) {
        if (!p.assessment) continue
        total.porEtiqueta[p.assessment] = (total.porEtiqueta[p.assessment] ?? 0) + 1
      }
    }

    // Los equipos con más gente en Llamar: por dónde conviene apretar
    const topEquipos = [...filas]
      .filter(f => f.enLlamar > 0)
      .sort((a, b) => b.enLlamar - a.enLlamar || b.informes - a.informes || a.nombre.localeCompare(b.nombre))
      .slice(0, 12)

    sinCubrir.sort((a, b) => b.enLlamar - a.enLlamar || a.nombre.localeCompare(b.nombre))

    return { porZona, porCat, total, sinCubrir, topEquipos }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, historico])

  const grupos = useMemo(() => {
    const m = dim === 'zona' ? datos.porZona : datos.porCat
    // Ordenados por lo que más interesa: dónde hay más gente en Llamar
    return Object.values(m).sort((a, b) =>
      b.enLlamar - a.enLlamar ||
      b.jugadores - a.jugadores ||
      a.clave.localeCompare(b.clave))
  }, [datos, dim])

  const nombreGrupo = (c: string) =>
    dim === 'zona' ? (c === SIN_ZONA ? 'Sin zona' : (ZONA_CORTA[c as Zona] ?? c)) : c

  const maxLlamar = Math.max(1, ...grupos.map(g => g.enLlamar))
  const maxJug = Math.max(1, ...grupos.map(g => g.jugadores))
  const t = datos.total
  const pctCobertura = t.relevantes > 0 ? Math.round((t.cubiertos / t.relevantes) * 100) : 0

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-4">

        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-[240px]">
            <h2 className="text-sm font-semibold text-slate-800">Control de equipos</h2>
            <p className="text-xs text-slate-400">
              Relevante = {MIN_LLAMAR_RELEVANTE}+ jugadores en Llamar (etiqueta o informe con ese veredicto).
              {' '}Cubierto = {MIN_PARTIDOS_CUBIERTO}+ partidos vistos. Cuenta también lo que hayáis marcado a mano.
            </p>
          </div>
          <button
            onClick={() => setHistorico(h => !h)}
            title={historico
              ? 'Ahora se cuentan TODOS los partidos. Pulsa para contar solo los de esta temporada.'
              : 'Ahora solo se cuentan los partidos de esta temporada. Pulsa para contar todo el histórico.'}
            className="inline-flex items-center gap-1 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:border-slate-400"
          >
            {historico
              ? <><History className="w-3 h-3" /> Todo el histórico</>
              : <><CalendarDays className="w-3 h-3" /> Temporada {etiquetaTemporada(desde)}</>}
          </button>
        </div>

        {/* ── De un vistazo ── */}
        <div className="flex flex-wrap gap-2">
          <Tarjeta n={t.equipos} label="equipos" />
          <Tarjeta n={t.relevantes} label="relevantes" tono="text-amber-600" />
          <Tarjeta n={`${pctCobertura}%`} label={`cubiertos (${t.cubiertos} de ${t.relevantes})`} tono={pctCobertura >= 70 ? 'text-emerald-600' : 'text-orange-600'} />
          <Tarjeta n={t.enLlamar} label="jugadores en Llamar" tono="text-amber-600" />
          <Tarjeta n={t.porEtiqueta['Seguir'] ?? 0} label="en Seguir" tono="text-blue-600" />
          <Tarjeta n={t.jugadores} label="jugadores" />
        </div>

        {/* ── Desglose por zona o categoría ── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Dónde está lo interesante</h3>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {(['zona', 'categoria'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDim(d)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                    dim === d ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >{d === 'zona' ? 'Por zona' : 'Por categoría'}</button>
              ))}
            </div>
            <div className="ml-auto">
              <BotonCsv
                nombre={`control_por_${dim}`}
                cabeceras={['Grupo', 'Equipos', 'Relevantes', 'Cubiertos', 'Jugadores', 'En Llamar', ...ALL_ASSESSMENTS.map(a => `Etiqueta ${a}`), 'Informes', 'Partidos']}
                filas={() => grupos.map(g => [
                  nombreGrupo(g.clave), g.equipos, g.relevantes, g.cubiertos, g.jugadores, g.enLlamar,
                  ...ALL_ASSESSMENTS.map(a => g.porEtiqueta[a] ?? 0), g.informes, g.partidos,
                ])}

              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-semibold">{dim === 'zona' ? 'Zona' : 'Categoría'}</th>
                  <th className="text-center px-2 py-2 font-semibold">Equipos</th>
                  <th className="text-center px-2 py-2 font-semibold" title="Relevantes cubiertos / relevantes">Cobertura</th>
                  <th className="text-left px-2 py-2 font-semibold w-32">Jugadores</th>
                  <th className="text-left px-2 py-2 font-semibold w-32" title="Con la etiqueta Llamar o con informes de veredicto Llamar — el mismo criterio que marca un equipo como relevante">En Llamar</th>
                  {ALL_ASSESSMENTS.filter(a => a !== 'Llamar').map(a => (
                    <th key={a} className="text-center px-2 py-2 font-semibold">{a}</th>
                  ))}
                  <th className="text-center px-2 py-2 font-semibold">Inf.</th>
                  <th className="text-center px-2 py-2 font-semibold">Part.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {grupos.length === 0 && (
                  <tr><td colSpan={6 + ALL_ASSESSMENTS.length} className="text-center py-10 text-slate-400 text-sm">Todavía no hay datos.</td></tr>
                )}
                {grupos.map(g => {
                  const pct = g.relevantes > 0 ? Math.round((g.cubiertos / g.relevantes) * 100) : null
                  return (
                    <tr key={g.clave} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{nombreGrupo(g.clave)}</td>
                      <td className="px-2 py-2 text-center text-xs text-slate-600 tabular-nums">{g.equipos}</td>
                      <td className="px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
                        {pct === null
                          ? <span className="text-slate-300">—</span>
                          : <span className={pct >= 70 ? 'text-emerald-600 font-semibold' : pct >= 40 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'}>
                              {pct}% <span className="text-slate-400 font-normal">({g.cubiertos}/{g.relevantes})</span>
                            </span>}
                      </td>
                      <td className="px-2 py-2"><Barra n={g.jugadores} max={maxJug} cls="bg-slate-400" /></td>
                      <td className="px-2 py-2"><Barra n={g.enLlamar} max={maxLlamar} cls="bg-amber-400" /></td>
                      {ALL_ASSESSMENTS.filter(a => a !== 'Llamar').map(a => (
                        <td key={a} className={`px-2 py-2 text-center text-xs tabular-nums ${g.porEtiqueta[a] ? 'text-slate-600' : 'text-slate-300'}`}>
                          {g.porEtiqueta[a] || '—'}
                        </td>
                      ))}
                      <td className={`px-2 py-2 text-center text-xs tabular-nums ${g.informes ? 'text-slate-600' : 'text-slate-300'}`}>{g.informes || '—'}</td>
                      <td className={`px-2 py-2 text-center text-xs tabular-nums ${g.partidos ? 'text-slate-600' : 'text-slate-300'}`}>{g.partidos || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Equipos con más gente en Llamar ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Equipos con más jugadores en Llamar</h3>
              <p className="text-[11px] text-slate-400">Cuenta la etiqueta Llamar o tener informes con ese veredicto</p>
            </div>
            {datos.topEquipos.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 italic">Todavía no hay ningún jugador en Llamar.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {datos.topEquipos.map(f => (
                  <div key={f.clave} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-xs font-medium text-slate-800 truncate flex-1">{f.nombre}</span>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">
                      {f.zona === SIN_ZONA ? 'sin zona' : (ZONA_CORTA[f.zona as Zona] ?? f.zona)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${ASSESSMENT_DOT['Llamar' as ScoutingAssessment] ?? 'bg-amber-400'}`} />
                      {f.enLlamar}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Huecos: relevantes sin cubrir ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Relevantes sin cubrir
              </h3>
              <p className="text-[11px] text-slate-400">Nos importan y no llegamos a los partidos mínimos</p>
            </div>
            {datos.sinCubrir.length === 0 ? (
              <p className="px-4 py-6 text-xs text-emerald-600">Todos los equipos relevantes están cubiertos.</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                {datos.sinCubrir.slice(0, 40).map(f => (
                  <div key={f.clave} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-xs font-medium text-slate-800 truncate flex-1">{f.nombre}</span>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">
                      {f.zona === SIN_ZONA ? 'sin zona' : (ZONA_CORTA[f.zona as Zona] ?? f.zona)}
                    </span>
                    {f.enLlamar > 0 && (
                      <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">{f.enLlamar} en Llamar</span>
                    )}
                    <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                      {nPartidos(f)} part.
                    </span>
                  </div>
                ))}
                {datos.sinCubrir.length > 40 && (
                  <p className="px-4 py-2 text-[11px] text-slate-400">y {datos.sinCubrir.length - 40} más</p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
