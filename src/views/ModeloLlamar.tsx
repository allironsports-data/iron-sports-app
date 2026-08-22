import { useEffect, useMemo, useState } from 'react'
import { Brain, Flame, AlertTriangle, FlaskConical } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { normClave } from '../lib/texto'

// ── Modelo «¿esto es un Llamar?» ─────────────────────────────────────
//
// Aprende del texto de VUESTROS informes qué palabras acompañan a un
// «Llamar» y cuáles a un «Seguir»/«Descartar», y con eso le pone una
// probabilidad a cualquier informe: un «Seguir» con probabilidad alta es
// un candidato que quizá se os está escapando; un «Llamar» con
// probabilidad baja es un Llamar que el propio texto no sostiene.
//
// Es una regresión logística con bolsa de palabras (1 y 2 palabras),
// entrenada en el navegador. Se valida con validación cruzada de 5
// bloques: entrena con el 80% y se examina con el 20% que no ha visto,
// cinco veces. Todas las cifras que se enseñan salen de ese examen.

// ── Preparación del texto ────────────────────────────────────────────

const STOP = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','al','a','ante','bajo','con','contra','desde','en','entre',
  'hacia','hasta','para','por','segun','sin','sobre','tras','y','e','o','u','ni','que','se','su','sus','le','les','lo',
  'me','mi','te','tu','nos','os','es','son','ser','esta','este','esto','estos','estas','ese','esa','eso','esos','esas',
  'como','mas','pero','muy','ya','si','no','tambien','tiene','tienen','tener','hace','hacer','han','ha','habia','hay',
  'cuando','donde','porque','aunque','sino','solo','todo','toda','todos','todas','otro','otra','otros','otras','cada',
  'algo','nada','poco','mucho','bien','mal','vez','veces','partido','jugador','equipo','minuto','minutos','primera',
  'segunda','parte','balon','juego','campo','banda','area','tiempo','ver','vi','visto','le','del','por','asi',
])

function tokenize(raw: string): string[] {
  const clean = normClave(raw)
  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w))
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    out.push(words[i])
    if (i + 1 < words.length) out.push(`${words[i]} ${words[i + 1]}`)   // bigrama
  }
  return out
}

// «Firmar» legado = «Llamar»
function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

// Generador pseudoaleatorio con semilla: mismo resultado en cada visita
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface Sample { idx: number[]; y: number }

interface Trained { w: Float64Array; bias: number }

// Sigmoide a prueba de desbordamientos (un informe largo activa cientos de
// términos; sin acotar, z se dispara y salen NaN)
function sigmoid(z: number): number {
  if (!isFinite(z)) return z > 0 ? 1 : 0
  const c = z > 30 ? 30 : z < -30 ? -30 : z
  return 1 / (1 + Math.exp(-c))
}

// Peso de cada término dentro del informe: 1/√(nº de términos). Así un
// informe de 400 palabras y otro de 40 pesan igual y el entrenamiento no
// se desestabiliza con los textos largos.
const scaleOf = (n: number) => (n > 0 ? 1 / Math.sqrt(n) : 0)

function train(samples: Sample[], nFeat: number, opts: { epochs: number; lr: number; l2: number; seed: number }): Trained {
  const w = new Float64Array(nFeat)
  let bias = 0
  const order = samples.map((_, i) => i)
  const rng = makeRng(opts.seed)
  let t = 0
  for (let ep = 0; ep < opts.epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) {           // barajado Fisher-Yates
      const j = Math.floor(rng() * (i + 1))
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }
    for (const oi of order) {
      const s = samples[oi]
      if (!s.idx.length) continue
      const sc = scaleOf(s.idx.length)
      let z = bias
      for (const f of s.idx) z += w[f] * sc
      const p = sigmoid(z)
      const g = p - s.y
      const lr = opts.lr / (1 + t * 1e-4)
      t++
      bias -= lr * g
      for (const f of s.idx) w[f] -= lr * (g * sc + opts.l2 * w[f])
    }
  }
  // Red de seguridad: si algo se fuera de madre, el término se anula en vez
  // de contaminar todas las cuentas con NaN
  for (let i = 0; i < w.length; i++) if (!isFinite(w[i])) w[i] = 0
  if (!isFinite(bias)) bias = 0
  return { w, bias }
}

function rawZ(m: Trained, idx: number[]): number {
  if (!idx.length) return m.bias
  const sc = scaleOf(idx.length)
  let z = m.bias
  for (const f of idx) z += m.w[f] * sc
  return z
}

// Calibración de Platt: el modelo ordena bien pero sus porcentajes se
// quedan cortos o se pasan. Esto ajusta una recta (a·z + b) sobre las
// puntuaciones de validación para que un 70% signa de verdad un 70%.
interface Platt { a: number; b: number }

function fitPlatt(pairs: { z: number; y: number }[]): Platt {
  let a = 1
  let b = 0
  const n = pairs.length
  if (!n) return { a, b }
  for (let it = 0; it < 400; it++) {
    let ga = 0
    let gb = 0
    for (const { z, y } of pairs) {
      const p = sigmoid(a * z + b)
      const d = p - y
      ga += d * z
      gb += d
    }
    a -= (0.5 * ga) / n
    b -= (0.5 * gb) / n
    if (!isFinite(a) || !isFinite(b)) return { a: 1, b: 0 }
  }
  return { a, b }
}

const applyPlatt = (pl: Platt, z: number) => sigmoid(pl.a * z + pl.b)

function auc(pairs: { p: number; y: number }[]): number {
  const pos = pairs.filter(x => x.y === 1).length
  const neg = pairs.length - pos
  if (!pos || !neg) return 0.5
  const sorted = [...pairs].sort((a, b) => a.p - b.p)
  let rankSum = 0
  let i = 0
  while (i < sorted.length) {                                // rangos medios en empates
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].p === sorted[i].p) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) if (sorted[k].y === 1) rankSum += avgRank
    i = j + 1
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg)
}

interface ModelResult {
  ok: false
  reason: string
}
interface ModelOk {
  ok: true
  vocab: string[]
  model: Trained
  platt: Platt
  nTrain: number
  baseRate: number
  aucCv: number
  calib: { bucket: string; n: number; pred: number; real: number }[]
  top: { term: string; w: number; df: number }[]
  bottom: { term: string; w: number; df: number }[]
  scored: { r: ScoutingReport; p: number }[]
  precisionTop: number      // % de Llamar reales entre el 10% con más probabilidad (en validación)
}

function buildModel(reports: ScoutingReport[]): ModelOk | ModelResult {
  // 1) Informes utilizables: con texto y con conclusión de las tres que
  //    forman la decisión (el resto no enseña nada al modelo)
  const usable = reports.filter(r => {
    const c = normConclusion(r.conclusion)
    return (r.texto ?? '').trim().length >= 30 && (c === 'Llamar' || c === 'Seguir' || c === 'Descartar')
  })
  const llamar = usable.filter(r => normConclusion(r.conclusion) === 'Llamar').length
  if (usable.length < 150 || llamar < 25) {
    return { ok: false, reason: `Hacen falta al menos 150 informes con texto y conclusión (hay ${usable.length}) y 25 «Llamar» (hay ${llamar}).` }
  }

  // 2) Vocabulario: términos que aparecen en 8+ informes y no en más de la
  //    mitad (los que salen en todos no distinguen nada)
  const tokensPerDoc = usable.map(r => new Set(tokenize(r.texto ?? '')))
  const df: Record<string, number> = {}
  tokensPerDoc.forEach(set => set.forEach(tk => { df[tk] = (df[tk] ?? 0) + 1 }))
  const maxDf = usable.length * 0.5
  const vocab = Object.entries(df)
    .filter(([, n]) => n >= 8 && n <= maxDf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4000)
    .map(([t]) => t)
  if (vocab.length < 40) return { ok: false, reason: 'Los textos son demasiado cortos o demasiado distintos entre sí para encontrar patrones.' }
  const vIndex: Record<string, number> = {}
  vocab.forEach((t, i) => { vIndex[t] = i })

  const samples: Sample[] = tokensPerDoc.map((set, i) => {
    const idx: number[] = []
    set.forEach(tk => { const j = vIndex[tk]; if (j !== undefined) idx.push(j) })
    return { idx, y: normConclusion(usable[i].conclusion) === 'Llamar' ? 1 : 0 }
  })

  // lr moderado: con el vector normalizado el paso ya es estable, y 20
  // pasadas dan de sobra para textos de scouting
  const HP = { epochs: 20, lr: 0.6, l2: 1e-5, seed: 20260817 }

  // 3) Validación cruzada de 5 bloques: cada informe se puntúa con un
  //    modelo que NO lo ha visto al entrenar
  const K = 5
  const fold = samples.map((_, i) => i % K)
  const cvRaw: { z: number; y: number }[] = []
  for (let k = 0; k < K; k++) {
    const tr = samples.filter((_, i) => fold[i] !== k)
    const te = samples.map((s, i) => ({ s, i })).filter(x => fold[x.i] === k)
    const m = train(tr, vocab.length, { ...HP, seed: HP.seed + k })
    te.forEach(({ s }) => cvRaw.push({ z: rawZ(m, s.idx), y: s.y }))
  }
  // La recta de calibración se aprende SOLO con puntuaciones de validación
  const platt = fitPlatt(cvRaw)
  const cvPairs = cvRaw.map(x => ({ p: applyPlatt(platt, x.z), y: x.y }))
  const aucCv = auc(cvPairs)

  // Calibración: ¿cuando dice 70% acierta el 70%?
  const buckets = [0, 0.1, 0.2, 0.35, 0.5, 0.7, 1.01]
  const calib = buckets.slice(0, -1).map((lo, i) => {
    const hi = buckets[i + 1]
    const inB = cvPairs.filter(x => x.p >= lo && x.p < hi)
    return {
      bucket: `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`,
      n: inB.length,
      pred: inB.length ? inB.reduce((s, x) => s + x.p, 0) / inB.length : 0,
      real: inB.length ? inB.filter(x => x.y === 1).length / inB.length : 0,
    }
  })

  // Precisión en el 10% de informes con más probabilidad (lo que importa
  // si se usa como bandeja de revisión)
  const sortedCv = [...cvPairs].sort((a, b) => b.p - a.p)
  const topN = Math.max(10, Math.round(sortedCv.length * 0.1))
  const precisionTop = sortedCv.slice(0, topN).filter(x => x.y === 1).length / topN

  // 4) Modelo final con todo y factores más pesados
  const model = train(samples, vocab.length, HP)
  const weighted = vocab.map((term, i) => ({ term, w: model.w[i], df: df[term] ?? 0 }))
    .filter(x => x.df >= 12)
    .sort((a, b) => b.w - a.w)
  const top = weighted.slice(0, 25)
  const bottom = weighted.slice(-25).reverse()

  // 5) Puntuación de todos los informes con texto (incluidos los que no
  //    entraron al entrenamiento por no tener conclusión)
  const scored = reports
    .filter(r => (r.texto ?? '').trim().length >= 30)
    .map(r => {
      const idx: number[] = []
      new Set(tokenize(r.texto ?? '')).forEach(tk => { const j = vIndex[tk]; if (j !== undefined) idx.push(j) })
      return { r, p: applyPlatt(platt, rawZ(model, idx)) }
    })

  return {
    ok: true, vocab, model, platt, nTrain: usable.length, baseRate: llamar / usable.length,
    aucCv, calib, top, bottom, scored, precisionTop,
  }
}

// ── Componente ───────────────────────────────────────────────────────

export function ModeloLlamar({ scoutingPlayers, scoutingReports, profiles }: {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  profiles: Profile[]
}) {
  const [result, setResult] = useState<ModelOk | ModelResult | null>(null)
  const [probe, setProbe] = useState('')

  // Entrenar en cuanto se abre la pestaña, dejando pintar la UI primero
  useEffect(() => {
    setResult(null)
    const t = setTimeout(() => setResult(buildModel(scoutingReports)), 30)
    return () => clearTimeout(t)
  }, [scoutingReports])

  const playerById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    scoutingPlayers.forEach(p => { m[p.id] = p })
    return m
  }, [scoutingPlayers])

  const probeP = useMemo(() => {
    if (!result?.ok || probe.trim().length < 20) return null
    const idx: number[] = []
    const vIndex: Record<string, number> = {}
    result.vocab.forEach((t, i) => { vIndex[t] = i })
    const hits: { term: string; w: number }[] = []
    new Set(tokenize(probe)).forEach(tk => {
      const j = vIndex[tk]
      if (j !== undefined) { idx.push(j); hits.push({ term: tk, w: result.model.w[j] }) }
    })
    hits.sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    return { p: applyPlatt(result.platt, rawZ(result.model, idx)), hits: hits.slice(0, 8) }
  }, [probe, result])

  if (!result) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
        <span className="text-xs text-slate-500">Entrenando el modelo con vuestros informes…</span>
      </div>
    )
  }

  if (!result.ok) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Brain className="w-4 h-4 text-slate-400" /> Modelo de «Llamar»</h3>
        <p className="mt-2 text-xs text-slate-500">{result.reason}</p>
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
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Brain className="w-4 h-4 text-slate-400" /> Modelo de «Llamar»
        </h3>
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
