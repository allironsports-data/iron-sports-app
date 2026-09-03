// ── Modelo «¿esto es un Llamar?» · lógica pura (sin React) ──────────
//
// Aprende del texto de los informes qué palabras acompañan a un «Llamar»
// y cuáles a un «Seguir»/«Descartar», y con eso le pone una probabilidad
// a cualquier informe. Regresión logística con bolsa de palabras (1 y 2
// palabras), validada con 5 bloques (entrena con el 80%, examina el 20%).
//
// Este fichero lo importan el worker (src/workers/modeloLlamar.worker.ts),
// la vista (ModeloLlamar.tsx, solo para puntuar el probador) y los tests.
// Nada de aquí toca el DOM.

import type { ScoutingReport } from '../types'
import { normClave } from './texto'

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

export function tokenize(raw: string): string[] {
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
export function normConclusion(c?: string): string | undefined {
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

export interface Trained { w: Float64Array; bias: number }

// Sigmoide a prueba de desbordamientos (un informe largo activa cientos de
// términos; sin acotar, z se dispara y salen NaN)
function sigmoid(z: number): number {
  if (!isFinite(z)) return z > 0 ? 1 : 0
  const c = z > 30 ? 30 : z < -30 ? -30 : z
  return 1 / (1 + Math.exp(-c))
}

// Peso de cada término dentro del informe: 1/√(nº de términos). Así un
// informe de 400 palabras y otro de 40 pesan igual.
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

export function rawZ(m: Trained, idx: number[]): number {
  if (!idx.length) return m.bias
  const sc = scaleOf(idx.length)
  let z = m.bias
  for (const f of idx) z += m.w[f] * sc
  return z
}

// Calibración de Platt: ajusta una recta (a·z + b) sobre las puntuaciones
// de validación para que un 70% signifique de verdad un 70%.
export interface Platt { a: number; b: number }

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

export const applyPlatt = (pl: Platt, z: number) => sigmoid(pl.a * z + pl.b)

export function auc(pairs: { p: number; y: number }[]): number {
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

export interface ModelResult {
  ok: false
  reason: string
}
export interface ModelOk {
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
export type ModelOutput = ModelOk | ModelResult

/** Aviso de progreso mientras entrena («Entrenando… fold 3/5»). */
export type ProgressFn = (msg: string) => void

/**
 * Clave de caché: si no cambia el nº de informes ni el más reciente, el
 * modelo sería el mismo y no hace falta reentrenar.
 */
export function claveModelo(reports: ScoutingReport[]): string {
  let masReciente: ScoutingReport | undefined
  for (const r of reports) {
    const f = r.createdAt ?? r.fecha ?? ''
    const g = masReciente ? (masReciente.createdAt ?? masReciente.fecha ?? '') : ''
    if (!masReciente || f > g || (f === g && r.id > masReciente.id)) masReciente = r
  }
  return `${reports.length}:${masReciente?.id ?? ''}`
}

const K = 5

export function buildModel(reports: ScoutingReport[], onProgress?: ProgressFn): ModelOutput {
  const progress = onProgress ?? (() => {})
  progress('Preparando los textos…')

  // 1) Informes utilizables: con texto y con conclusión de las tres que
  //    forman la decisión
  const usable = reports.filter(r => {
    const c = normConclusion(r.conclusion)
    return (r.texto ?? '').trim().length >= 30 && (c === 'Llamar' || c === 'Seguir' || c === 'Descartar')
  })
  const llamar = usable.filter(r => normConclusion(r.conclusion) === 'Llamar').length
  if (usable.length < 150 || llamar < 25) {
    return { ok: false, reason: `Hacen falta al menos 150 informes con texto y conclusión (hay ${usable.length}) y 25 «Llamar» (hay ${llamar}).` }
  }

  // 2) Vocabulario: términos en 8+ informes y no en más de la mitad
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

  const HP = { epochs: 20, lr: 0.6, l2: 1e-5, seed: 20260817 }

  // 3) Validación cruzada de 5 bloques
  const fold = samples.map((_, i) => i % K)
  const cvRaw: { z: number; y: number }[] = []
  for (let k = 0; k < K; k++) {
    progress(`Entrenando… fold ${k + 1}/${K}`)
    const tr = samples.filter((_, i) => fold[i] !== k)
    const te = samples.map((s, i) => ({ s, i })).filter(x => fold[x.i] === k)
    const m = train(tr, vocab.length, { ...HP, seed: HP.seed + k })
    te.forEach(({ s }) => cvRaw.push({ z: rawZ(m, s.idx), y: s.y }))
  }
  // La recta de calibración se aprende SOLO con puntuaciones de validación
  const platt = fitPlatt(cvRaw)
  const cvPairs = cvRaw.map(x => ({ p: applyPlatt(platt, x.z), y: x.y }))
  const aucCv = auc(cvPairs)

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

  const sortedCv = [...cvPairs].sort((a, b) => b.p - a.p)
  const topN = Math.max(10, Math.round(sortedCv.length * 0.1))
  const precisionTop = sortedCv.slice(0, topN).filter(x => x.y === 1).length / topN

  // 4) Modelo final con todo
  progress('Entrenando el modelo final…')
  const model = train(samples, vocab.length, HP)
  const weighted = vocab.map((term, i) => ({ term, w: model.w[i], df: df[term] ?? 0 }))
    .filter(x => x.df >= 12)
    .sort((a, b) => b.w - a.w)
  const top = weighted.slice(0, 25)
  const bottom = weighted.slice(-25).reverse()

  // 5) Puntuación de todos los informes con texto
  progress('Puntuando informes…')
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

/** Puntúa un texto suelto con un modelo ya entrenado (probador). */
export function puntuarTexto(result: ModelOk, texto: string): { p: number; hits: { term: string; w: number }[] } {
  const vIndex: Record<string, number> = {}
  result.vocab.forEach((t, i) => { vIndex[t] = i })
  const idx: number[] = []
  const hits: { term: string; w: number }[] = []
  new Set(tokenize(texto)).forEach(tk => {
    const j = vIndex[tk]
    if (j !== undefined) { idx.push(j); hits.push({ term: tk, w: result.model.w[j] }) }
  })
  hits.sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
  return { p: applyPlatt(result.platt, rawZ(result.model, idx)), hits: hits.slice(0, 8) }
}
