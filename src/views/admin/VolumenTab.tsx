import { useMemo, useState } from 'react'
import { Activity, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp } from 'lucide-react'
import type { Profile } from '../../contexts/AuthContext'
import {
  FUENTES, FUENTE_META, PESOS, type Accion, type DatosVolumen, type Fuente, type Periodo, type Totales,
  extraerAcciones, totalesPorPersona, totalesEquipo, serieEquipo, periodoDesde, periodoAnterior,
  etiquetaPeriodo, clavePeriodo, variacion, fmtPuntos,
} from '../../lib/volumenTrabajo'
import { exportarCsv } from '../../lib/csv'

// ── Volumen de trabajo del equipo (Admin → Volumen) ─────────────────
// Dos medidas siempre a la vista: BRUTO (nº de acciones) y PUNTOS (ponderado
// por esfuerzo). El cálculo está en lib/volumenTrabajo.ts.

type Props = Omit<DatosVolumen, 'profiles'> & { profiles: Profile[] }

function Delta({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior)
  if (v === null) return <span className="text-[11px] text-slate-300">—</span>
  const cls = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-rose-600' : 'text-slate-400'
  return <span className={`text-[11px] font-medium ${cls}`}>{v > 0 ? '▲' : v < 0 ? '▼' : '='} {Math.abs(v)}%</span>
}

/** Barra apilada por fuente, a escala común (max) */
function BarraFuentes({ t, max, medida }: { t: Totales; max: number; medida: 'puntos' | 'bruto' }) {
  const total = t[medida]
  if (total <= 0) return <div className="h-2.5 rounded bg-slate-100" />
  const w = Math.max(2, (total / Math.max(1, max)) * 100)
  return (
    <div className="h-2.5 rounded overflow-hidden flex bg-slate-100" title={FUENTES.map(f => `${FUENTE_META[f].label}: ${t.porFuente[f].bruto} (${fmtPuntos(t.porFuente[f].puntos)} pt)`).join(' · ')}>
      <div className="h-full flex" style={{ width: `${w}%` }}>
        {FUENTES.map(f => {
          const v = t.porFuente[f][medida]
          if (v <= 0) return null
          return <div key={f} className={`h-full ${FUENTE_META[f].color}`} style={{ width: `${(v / total) * 100}%` }} />
        })}
      </div>
    </div>
  )
}

export function VolumenTab({ profiles, tasks, eventos, scoutingMatches, matchScouts, scoutingReports, scoutingInfos, postpartidos, firmasEntries, negotiations }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [offset, setOffset] = useState(0)          // 0 = periodo actual, -1 = anterior…
  const [medida, setMedida] = useState<'puntos' | 'bruto'>('puntos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  const equipo = useMemo(() => profiles.filter(p => !p.partner_only), [profiles])
  const acciones = useMemo(
    () => extraerAcciones({ tasks, eventos, scoutingMatches, matchScouts, scoutingReports, scoutingInfos, postpartidos, firmasEntries, negotiations, profiles: equipo }),
    [tasks, eventos, scoutingMatches, matchScouts, scoutingReports, scoutingInfos, postpartidos, firmasEntries, negotiations, equipo],
  )

  const hoy = useMemo(() => new Date(), [])
  const clave = periodoDesde(hoy, periodo, offset)
  const claveAnt = periodoAnterior(clave, periodo)

  const porPersona = useMemo(() => totalesPorPersona(acciones, clave, periodo), [acciones, clave, periodo])
  const porPersonaAnt = useMemo(() => totalesPorPersona(acciones, claveAnt, periodo), [acciones, claveAnt, periodo])
  const equipoTot = useMemo(() => totalesEquipo(acciones, clave, periodo), [acciones, clave, periodo])
  const equipoAnt = useMemo(() => totalesEquipo(acciones, claveAnt, periodo), [acciones, claveAnt, periodo])

  const nSerie = periodo === 'semana' ? 12 : 12
  const serie = useMemo(() => serieEquipo(acciones, periodo, nSerie - offset, hoy).slice(0, nSerie), [acciones, periodo, nSerie, offset, hoy])
  // Media de referencia: los periodos ANTERIORES al visible que tengan algo (hasta 8)
  const media = useMemo(() => {
    const previos = serie.filter(s => s.clave < clave && s.totales.bruto > 0).slice(-8)
    if (!previos.length) return null
    return {
      puntos: previos.reduce((n, s) => n + s.totales.puntos, 0) / previos.length,
      bruto: previos.reduce((n, s) => n + s.totales.bruto, 0) / previos.length,
      n: previos.length,
    }
  }, [serie, clave])

  const filas = useMemo(() => {
    const base = equipo
      .filter(p => verTodos || !p.hidden_from_status || porPersona.has(p.id))
      .map(p => ({ p, t: porPersona.get(p.id), ant: porPersonaAnt.get(p.id) }))
      .filter(r => verTodos || r.t || r.ant)
    return base.sort((a, b) => (b.t?.[medida] ?? 0) - (a.t?.[medida] ?? 0) || a.p.name.localeCompare(b.p.name))
  }, [equipo, porPersona, porPersonaAnt, medida, verTodos])

  const maxPersona = Math.max(1, ...filas.map(r => r.t?.[medida] ?? 0))
  const maxSerie = Math.max(1, ...serie.map(s => s.totales[medida]))

  const detalle = useMemo(() => {
    if (!abierto) return []
    return acciones
      .filter(a => a.profileId === abierto && clavePeriodo(a.dia, periodo) === clave)
      .sort((a, b) => b.dia.localeCompare(a.dia) || FUENTES.indexOf(a.fuente) - FUENTES.indexOf(b.fuente))
  }, [abierto, acciones, clave, periodo])

  const exportar = () => {
    const cab = ['Periodo', 'Persona', 'Bruto', 'Puntos', ...FUENTES.flatMap(f => [`${FUENTE_META[f].label} (nº)`, `${FUENTE_META[f].label} (pt)`])]
    const fila = (nombre: string, t: Totales) => [etiquetaPeriodo(clave, periodo, true), nombre, t.bruto, fmtPuntos(t.puntos), ...FUENTES.flatMap(f => [t.porFuente[f].bruto, fmtPuntos(t.porFuente[f].puntos)])]
    exportarCsv(`volumen_${periodo}_${clave}`, cab, [
      ...filas.filter(r => r.t).map(r => fila(r.p.name, r.t!)),
      fila('EQUIPO (sin duplicar)', equipoTot),
    ])
  }

  const esActual = offset === 0

  return (
    <div className="space-y-4">
      {/* Cabecera + controles */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Activity className="w-4 h-4" /> Volumen de trabajo</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Todo lo que queda registrado como hecho: tareas, eventos, partidos vistos, informes, postpartidos, pipeline y distribución.
            <span className="font-medium text-slate-500"> Bruto</span> = nº de acciones · <span className="font-medium text-slate-500">Puntos</span> = ponderado por esfuerzo (pesos al pie).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1">
            {(['semana', 'mes'] as Periodo[]).map(p => (
              <button key={p} onClick={() => { setPeriodo(p); setOffset(0); setAbierto(null) }}
                className={`px-2.5 py-1 rounded-md border ${periodo === p ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {p === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(['puntos', 'bruto'] as const).map(m => (
              <button key={m} onClick={() => setMedida(m)}
                className={`px-2.5 py-1 rounded-md border ${medida === m ? 'bg-primary/10 text-slate-800 border-primary/40' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                title="Qué manda en las barras y el orden">
                {m === 'puntos' ? 'Ordenar por puntos' : 'Ordenar por bruto'}
              </button>
            ))}
          </div>
          <button onClick={exportar} className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1" title="Descargar CSV del periodo">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Navegación de periodo */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => { setOffset(o => o - 1); setAbierto(null) }} className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Periodo anterior"><ChevronLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-800">{etiquetaPeriodo(clave, periodo, true)}{esActual && <span className="ml-2 text-[11px] font-medium text-emerald-600">en curso</span>}</div>
          <div className="text-[11px] text-slate-400">vs. {etiquetaPeriodo(claveAnt, periodo, true).toLowerCase()}</div>
        </div>
        <button onClick={() => { setOffset(o => Math.min(0, o + 1)); setAbierto(null) }} disabled={esActual} className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label="Periodo siguiente"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* Resumen del equipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { l: 'acciones del equipo (bruto)', v: String(equipoTot.bruto), d: <Delta actual={equipoTot.bruto} anterior={equipoAnt.bruto} /> },
          { l: 'puntos del equipo', v: fmtPuntos(equipoTot.puntos), d: <Delta actual={equipoTot.puntos} anterior={equipoAnt.puntos} /> },
          { l: 'personas con actividad', v: String(porPersona.size), d: <Delta actual={porPersona.size} anterior={porPersonaAnt.size} /> },
          { l: media ? `media ${periodo === 'semana' ? 'semanal' : 'mensual'} (${media.n} ant.)` : 'media de referencia', v: media ? `${Math.round(media.bruto)} · ${fmtPuntos(Math.round(media.puntos))} pt` : '—', d: media ? <Delta actual={equipoTot.puntos} anterior={media.puntos} /> : null },
        ].map(x => (
          <div key={x.l} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">{x.l}</div>
            <div className="flex items-baseline gap-2"><span className="text-lg font-bold text-slate-800">{x.v}</span>{x.d}</div>
          </div>
        ))}
      </div>

      {/* Serie del equipo */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-700">Equipo · últimos {serie.length} {periodo === 'semana' ? 'semanas' : 'meses'} ({medida})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {FUENTES.map(f => <span key={f} className="flex items-center gap-1 text-[10px] text-slate-500"><span className={`w-2 h-2 rounded-sm ${FUENTE_META[f].color}`} />{FUENTE_META[f].label}</span>)}
          </div>
        </div>
        <div className="flex items-end gap-1 h-28">
          {serie.map(s => {
            const total = s.totales[medida]
            const h = total > 0 ? Math.max(4, (total / maxSerie) * 100) : 0
            const sel = s.clave === clave
            return (
              <div key={s.clave} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${etiquetaPeriodo(s.clave, periodo, true)}: ${s.totales.bruto} acciones · ${fmtPuntos(s.totales.puntos)} pt`}>
                <div className={`text-[10px] mb-0.5 ${sel ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{total > 0 ? fmtPuntos(total) : ''}</div>
                <button onClick={() => { setOffset(serie.indexOf(s) - (serie.length - 1) + offset); setAbierto(null) }}
                  className={`w-full rounded-t overflow-hidden flex flex-col-reverse ${sel ? 'ring-2 ring-slate-800 ring-offset-1' : ''} ${total === 0 ? 'bg-slate-100' : ''}`}
                  style={{ height: total > 0 ? `${h}%` : '3px' }}>
                  {FUENTES.map(f => {
                    const v = s.totales.porFuente[f][medida]
                    return v > 0 ? <div key={f} className={FUENTE_META[f].color} style={{ height: `${(v / total) * 100}%` }} /> : null
                  })}
                </button>
                <div className={`text-[10px] mt-1 truncate w-full text-center ${sel ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{etiquetaPeriodo(s.clave, periodo)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabla por persona */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Persona</th>
                <th className="text-left px-2 py-2 font-medium w-48">Reparto</th>
                <th className="text-right px-2 py-2 font-medium" title="Nº de acciones">Bruto</th>
                <th className="text-right px-2 py-2 font-medium" title="Ponderado por esfuerzo">Puntos</th>
                <th className="text-right px-2 py-2 font-medium" title="Variación de puntos vs. periodo anterior">Δ</th>
                {FUENTES.map(f => <th key={f} className={`text-right px-2 py-2 font-medium ${FUENTE_META[f].texto}`} title={FUENTE_META[f].label}>{FUENTE_META[f].corto}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={5 + FUENTES.length} className="px-3 py-6 text-center text-slate-400">Sin actividad registrada en este periodo.</td></tr>
              )}
              {filas.map(({ p, t, ant }) => {
                const tt = t ?? { bruto: 0, puntos: 0, porFuente: Object.fromEntries(FUENTES.map(f => [f, { bruto: 0, puntos: 0 }])) as Totales['porFuente'] }
                const open = abierto === p.id
                return (
                  <FilaPersona key={p.id} p={p} t={tt} ant={ant} max={maxPersona} medida={medida} open={open} onToggle={() => setAbierto(open ? null : p.id)} detalle={open ? detalle : []} />
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
              <tr>
                <td className="px-3 py-2">Equipo <span className="font-normal text-[10px] text-slate-400">(cada cosa una vez)</span></td>
                <td className="px-2 py-2"><BarraFuentes t={equipoTot} max={Math.max(maxPersona, equipoTot[medida])} medida={medida} /></td>
                <td className="text-right px-2 py-2">{equipoTot.bruto}</td>
                <td className="text-right px-2 py-2">{fmtPuntos(equipoTot.puntos)}</td>
                <td className="text-right px-2 py-2"><Delta actual={equipoTot.puntos} anterior={equipoAnt.puntos} /></td>
                {FUENTES.map(f => <td key={f} className="text-right px-2 py-2">{equipoTot.porFuente[f].bruto || <span className="text-slate-300 font-normal">·</span>}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Columnas por fuente: nº de acciones (los puntos, al pasar el ratón por la barra). Clic en una persona para ver el detalle.</span>
          <button onClick={() => setVerTodos(v => !v)} className="hover:text-slate-600 underline-offset-2 hover:underline">{verTodos ? 'Ocultar sin actividad' : 'Ver a todos'}</button>
        </div>
      </div>

      {/* Glosario / pesos */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-[11px] text-slate-500 space-y-1.5">
        <div className="font-semibold text-slate-700 text-xs">Cómo se cuenta</div>
        <p><b className="text-slate-600">Tareas</b> completadas (fecha de completado, asignado): {PESOS.tarea} pt · prioridad alta {PESOS.tareaAlta} pt. La tarea de un postpartido no cuenta aquí.</p>
        <p><b className="text-slate-600">Eventos</b> de agenda (fecha del evento; autor y cada asistente): {PESOS.evento} pt · llamada/email/nota {PESOS.eventoLigero} pt · viaje/visita presencial {PESOS.eventoPesado} pt.</p>
        <p><b className="text-slate-600">Partidos vistos</b> por scout (fecha del partido): campo {PESOS.partidoCampo} pt · vídeo {PESOS.partidoVideo} pt.</p>
        <p><b className="text-slate-600">Informes</b> de partido (fecha del informe, autor): {PESOS.informe} pt · con conclusión {PESOS.informeConConclusion} pt · informes de entorno/contractual/mercado {PESOS.info} pt.</p>
        <p><b className="text-slate-600">Postpartidos</b> con tarea completada (responsable): {PESOS.postpartido} pt.</p>
        <p><b className="text-slate-600">Pipeline</b> (Firmar): reunión {PESOS.pipeReunion} pt · llamada/teléfono {PESOS.pipeLlamada} pt · whatsapp/nota/entorno {PESOS.pipeApunte} pt · <b>firmado {PESOS.firmado} pt</b> (a cada encargado). No cuentan los cambios de estatus automáticos, el «✓ Hecho» de una tarea ni los apuntes nacidos de un evento.</p>
        <p><b className="text-slate-600">Distribución</b>: negociación nueva {PESOS.negNueva} pt · apunte {PESOS.negUpdate} pt · negociación cerrada {PESOS.negCerrada} pt (gestor AIS).</p>
        <p>En la fila <b>Equipo</b> cada cosa cuenta una sola vez aunque tenga varias personas (un evento de 3 asistentes suma 3 a las personas y 1 al equipo). Mide trabajo <i>registrado</i>, no tiempo: para el tiempo está la pestaña Uso.</p>
      </div>
    </div>
  )
}

function FilaPersona({ p, t, ant, max, medida, open, onToggle, detalle }: {
  p: Profile; t: Totales; ant?: Totales; max: number; medida: 'puntos' | 'bruto'; open: boolean; onToggle: () => void; detalle: Accion[]
}) {
  return (
    <>
      <tr className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${open ? 'bg-slate-50' : ''}`} onClick={onToggle}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{p.avatar}</span>
            <span className="font-medium text-slate-800 truncate">{p.name}</span>
            {open ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-300" />}
          </div>
        </td>
        <td className="px-2 py-2"><BarraFuentes t={t} max={max} medida={medida} /></td>
        <td className="text-right px-2 py-2 font-semibold text-slate-800">{t.bruto || <span className="text-slate-300 font-normal">—</span>}</td>
        <td className="text-right px-2 py-2 font-semibold text-slate-800">{t.puntos ? fmtPuntos(t.puntos) : <span className="text-slate-300 font-normal">—</span>}</td>
        <td className="text-right px-2 py-2"><Delta actual={t.puntos} anterior={ant?.puntos ?? 0} /></td>
        {FUENTES.map(f => (
          <td key={f} className="text-right px-2 py-2 text-slate-600" title={`${t.porFuente[f].bruto} · ${fmtPuntos(t.porFuente[f].puntos)} pt`}>
            {t.porFuente[f].bruto || <span className="text-slate-300">·</span>}
          </td>
        ))}
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={5 + FUENTES.length} className="px-3 pb-3 pt-1">
            {detalle.length === 0 ? (
              <div className="text-[11px] text-slate-400">Nada registrado en este periodo.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {detalle.map((a, i) => (
                  <div key={`${a.clave}-${i}`} className="flex items-center gap-2 text-[11px] py-0.5 min-w-0">
                    <span className="text-slate-400 w-12 flex-shrink-0 tabular-nums">{a.dia.slice(8, 10)}/{a.dia.slice(5, 7)}</span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${FUENTE_META[a.fuente as Fuente].color}`} />
                    <span className={`flex-shrink-0 ${FUENTE_META[a.fuente as Fuente].texto}`}>{a.sub}</span>
                    <span className="text-slate-600 truncate">{a.texto ?? ''}</span>
                    <span className="ml-auto text-slate-400 flex-shrink-0">{fmtPuntos(a.puntos)} pt</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
