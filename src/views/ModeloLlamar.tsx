import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Flame, AlertTriangle, FlaskConical, RefreshCw } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { buildModel, claveModelo, normConclusion, puntuarTexto, type ModelOutput } from '../lib/modeloLlamar'
import type { WorkerOut } from '../workers/modeloLlamar.worker'

// ── Modelo «¿esto es un Llamar?» ─────────────────────────────────────
//
// La lógica (bolsa de palabras + regresión logística + validación de 5
// bloques) vive en src/lib/modeloLlamar.ts. Aquí solo se lanza en un
// Web Worker para no congelar la pestaña, se cachea el resultado y se
// pinta.

// Caché a nivel de módulo: sobrevive a desmontar/volver a montar la
// pestaña. Clave = nº de informes + id del más reciente.
let cache: { clave: string; result: ModelOutput } | null = null

function crearWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('../workers/modeloLlamar.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

// ── Componente ───────────────────────────────────────────────────────

export function ModeloLlamar({ scoutingPlayers, scoutingReports, profiles }: {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  profiles: Profile[]
}) {
  const MSG_INICIAL = 'Entrenando el modelo con vuestros informes…'
  const [tick, setTick] = useState(0)          // «Reentrenar» vacía la caché y relanza
  const [probe, setProbe] = useState('')
  // Clave del modelo que toca pintar. `tick` entra para que «Reentrenar»
  // invalide también lo que tenga el estado local.
  const clave = useMemo(() => claveModelo(scoutingReports), [scoutingReports])
  const claveTick = `${clave}#${tick}`
  // Resultado y progreso van etiquetados con su clave: así se derivan en el
  // render sin tener que resetearlos con setState dentro del efecto.
  const [entrenado, setEntrenado] = useState<{ clave: string; result: ModelOutput } | null>(null)
  const [progresoDe, setProgresoDe] = useState<{ clave: string; msg: string } | null>(null)
  const result: ModelOutput | null =
    entrenado?.clave === claveTick ? entrenado.result
    : cache?.clave === clave ? cache.result
    : null
  const progreso = progresoDe?.clave === claveTick ? progresoDe.msg : MSG_INICIAL

  const reentrenar = useCallback(() => { cache = null; setTick(t => t + 1) }, [])

  // Entrenar al abrir la pestaña, cuando cambian los informes o al pulsar «Reentrenar»
  useEffect(() => {
    if (cache && cache.clave === clave) return   // ya derivado en el render
    const reports = scoutingReports
    let cancelado = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const guardar = (r: ModelOutput) => {
      cache = { clave, result: r }
      if (!cancelado) setEntrenado({ clave: claveTick, result: r })
    }
    // Sin Worker (navegador antiguo) o si no arranca: hilo principal,
    // dejando pintar la UI antes
    const enHiloPrincipal = () => { timer = setTimeout(() => guardar(buildModel(reports)), 30) }

    const w = crearWorker()
    if (!w) {
      enHiloPrincipal()
      return () => { cancelado = true; clearTimeout(timer) }
    }
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if ('progress' in m) { if (!cancelado) setProgresoDe({ clave: claveTick, msg: m.progress }) }
      else if ('result' in m) { guardar(m.result); w.terminate() }
      else { if (!cancelado) setEntrenado({ clave: claveTick, result: { ok: false, reason: `Fallo al entrenar: ${m.error}` } }); w.terminate() }
    }
    w.onerror = () => { w.terminate(); if (!cancelado) enHiloPrincipal() }
    w.postMessage({ reports })
    return () => { cancelado = true; clearTimeout(timer); w.terminate() }
  }, [scoutingReports, clave, claveTick])

  const playerById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    scoutingPlayers.forEach(p => { m[p.id] = p })
    return m
  }, [scoutingPlayers])

  const probeP = useMemo(() => {
    if (!result?.ok || probe.trim().length < 20) return null
    return puntuarTexto(result, probe)
  }, [probe, result])

  if (!result) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
        <span className="text-xs text-slate-500">{progreso}</span>
      </div>
    )
  }

  if (!result.ok) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Brain className="w-4 h-4 text-slate-400" /> Modelo de «Llamar»</h3>
        <p className="mt-2 text-xs text-slate-500">{result.reason}</p>
        <button onClick={reentrenar} className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md px-2 py-1">
          <RefreshCw className="w-3 h-3" /> Reentrenar
        </button>
      </div>
    )
  }

  const pct = (x: number) => (isFinite(x) ? `${Math.round(x * 100)}%` : '—')
  const nombre = (r: ScoutingReport) => playerById[r.playerId]?.fullName ?? 'Jugador'
  const scout = (r: ScoutingReport) => {
    const p = profiles.find(pr => pr.avatar === r.persona)
    return p ? p.name.split(' ')[0] : (r.persona ?? '—')
  }
  const fecha = (r: ScoutingReport) => (r.fecha ?? r.createdAt ?? '').slice(0, 10).split('-').reverse().join('/')

  // Bandejas: «Seguir» que parecen Llamar y «Llamar» que el texto no sostiene
  const seguirCalientes = result.scored
    .filter(x => normConclusion(x.r.conclusion) === 'Seguir')
    .sort((a, b) => b.p - a.p).slice(0, 20)
  const llamarFlojos = result.scored
    .filter(x => normConclusion(x.r.conclusion) === 'Llamar')
    .sort((a, b) => a.p - b.p).slice(0, 12)

  const calidad = result.aucCv >= 0.8 ? { label: 'Muy bueno', cls: 'text-green-700 bg-green-50 border-green-200' }
    : result.aucCv >= 0.7 ? { label: 'Útil', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
    : result.aucCv >= 0.6 ? { label: 'Flojo — tómalo como pista', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    : { label: 'Poco fiable', cls: 'text-red-700 bg-red-50 border-red-200' }

  return (
    <div className="space-y-4">
      {/* Qué es esto */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Brain className="w-4 h-4 text-slate-400" /> Modelo de «Llamar»
          </h3>
          <button onClick={reentrenar} title="Vuelve a entrenar aunque no hayan cambiado los informes"
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md px-2 py-1">
            <RefreshCw className="w-3 h-3" /> Reentrenar
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
          Aprende del texto de vuestros informes qué se dice de un jugador cuando acaba en «Llamar» y qué se dice
          cuando acaba en «Seguir» o «Descartar». Con eso le pone una probabilidad a cada informe. Sirve para dos cosas:
          pescar los <strong>«Seguir» que suenan a Llamar</strong> y detectar los <strong>«Llamar» que el propio texto no sostiene</strong>.
        </p>
        <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
          Ojo con lo que significa: predice <em>la etiqueta que le pondríais vosotros</em>, no si el jugador triunfará.
          Si el equipo tiene un sesgo, el modelo lo aprende igual.
        </p>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Informes usados', value: result.nTrain.toLocaleString('es-ES') },
            { label: '% Llamar de base', value: pct(result.baseRate) },
            { label: 'Capacidad de acierto (AUC)', value: result.aucCv.toFixed(2) },
            { label: 'Aciertos en el top 10%', value: pct(result.precisionTop) },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg px-3 py-2">
              <div className="text-base font-bold text-slate-800">{s.value}</div>
              <div className="text-[10.5px] text-slate-500 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${calidad.cls}`}>{calidad.label}</span>
          <span className="text-[11px] text-slate-400">
            AUC = probabilidad de que, cogiendo un Llamar y un no-Llamar al azar, el modelo puntúe más alto al Llamar.
            0,50 sería tirar una moneda. Medido siempre sobre informes que no ha visto al entrenar.
          </span>
        </div>
      </div>

      {/* Factores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-red-500" /> Lo que empuja hacia «Llamar»</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.top.map(t => (
              <span key={t.term} className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-700 border border-red-100 rounded-full px-2 py-0.5"
                title={`Peso ${t.w.toFixed(2)} · aparece en ${t.df} informes`}>
                {t.term}<span className="text-[9px] text-red-400">{t.df}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">❄ Lo que aleja de «Llamar»</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.bottom.map(t => (
              <span key={t.term} className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5"
                title={`Peso ${t.w.toFixed(2)} · aparece en ${t.df} informes`}>
                {t.term}<span className="text-[9px] text-slate-400">{t.df}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bandeja principal */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-500" /> «Seguir» que el modelo ve como Llamar
        </h4>
        <p className="text-[11px] text-slate-400 mt-0.5">Informes marcados Seguir cuyo texto se parece al de un Llamar. Para revisarlos, no para cambiarlos solos.</p>
        <div className="mt-2 divide-y divide-slate-50">
          {seguirCalientes.length === 0 && <p className="text-xs text-slate-400 italic py-2">No hay «Seguir» con texto suficiente.</p>}
          {seguirCalientes.map(({ r, p }) => (
            <div key={r.id} className="flex items-center gap-2 py-1.5">
              <span className={`text-[11px] font-bold tabular-nums w-10 text-right ${p >= 0.6 ? 'text-red-600' : p >= 0.4 ? 'text-amber-600' : 'text-slate-400'}`}>{pct(p)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-semibold text-slate-800 truncate">{nombre(r)}</span>
                <span className="block text-[10.5px] text-slate-400 truncate">{scout(r)} · {fecha(r)} · {(r.texto ?? '').slice(0, 90)}…</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Llamar poco sostenidos */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-slate-400" /> «Llamar» que el texto no sostiene
        </h4>
        <p className="text-[11px] text-slate-400 mt-0.5">Puede ser un informe escrito corto y de carrerilla, o un Llamar por motivos que no están escritos (contexto, encargo, precio).</p>
        <div className="mt-2 divide-y divide-slate-50">
          {llamarFlojos.map(({ r, p }) => (
            <div key={r.id} className="flex items-center gap-2 py-1.5">
              <span className="text-[11px] font-bold tabular-nums w-10 text-right text-slate-400">{pct(p)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-semibold text-slate-800 truncate">{nombre(r)}</span>
                <span className="block text-[10.5px] text-slate-400 truncate">{scout(r)} · {fecha(r)} · {(r.texto ?? '').slice(0, 90)}…</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Probador */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-slate-400" /> Probar un informe</h4>
        <p className="text-[11px] text-slate-400 mt-0.5">Pega aquí el texto de un informe nuevo y te dice qué probabilidad de «Llamar» le ve.</p>
        <textarea
          value={probe}
          onChange={e => setProbe(e.target.value)}
          rows={4}
          placeholder="Pega el texto del informe…"
          className="mt-2 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
        {probeP && (
          <div className="mt-2 flex items-start gap-3 flex-wrap">
            <div className={`text-2xl font-bold tabular-nums ${probeP.p >= 0.6 ? 'text-red-600' : probeP.p >= 0.4 ? 'text-amber-600' : 'text-slate-500'}`}>
              {pct(probeP.p)}
            </div>
            <div className="text-[11px] text-slate-500 flex-1 min-w-[200px]">
              <span className="block mb-1">
                {probeP.p >= 0.6 ? 'Suena claramente a Llamar.' : probeP.p >= 0.4 ? 'Zona dudosa: merece una segunda opinión.' : 'Suena a Seguir/Descartar.'}
                {' '}Base del equipo: {pct(result.baseRate)}.
              </span>
              <span className="flex flex-wrap gap-1">
                {probeP.hits.map(h => (
                  <span key={h.term} className={`px-1.5 py-0.5 rounded-full border text-[10px] ${h.w > 0 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {h.term} {h.w > 0 ? '+' : ''}{h.w.toFixed(2)}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Calibración */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-slate-700">¿Se puede fiar uno del porcentaje?</h4>
        <p className="text-[11px] text-slate-400 mt-0.5">De los informes a los que dijo «x%», cuántos acabaron siendo Llamar de verdad. Cuanto más parecidas las dos columnas, mejor.</p>
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="font-semibold py-1">Probabilidad que dio</th>
              <th className="font-semibold">Informes</th>
              <th className="font-semibold">Media que dijo</th>
              <th className="font-semibold">Llamar reales</th>
            </tr>
          </thead>
          <tbody>
            {result.calib.map(c => (
              <tr key={c.bucket} className="border-t border-slate-50">
                <td className="py-1 text-slate-600">{c.bucket}</td>
                <td className="text-slate-500">{c.n}</td>
                <td className="text-slate-500">{c.n ? pct(c.pred) : '—'}</td>
                <td className={`font-semibold ${c.n ? 'text-slate-700' : 'text-slate-300'}`}>{c.n ? pct(c.real) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
