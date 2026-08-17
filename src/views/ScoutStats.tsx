import { useMemo, useState } from 'react'
import { FileText, Users, Target, Fingerprint, Handshake, Eye, AlertTriangle } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch, FirmasEntry } from '../types'
import type { Profile } from '../contexts/AuthContext'

// ── Estadísticas por scout ───────────────────────────────────
// Evalúa el trabajo de cada persona a partir de sus informes:
// volumen, escritura (muletillas, originalidad), conclusiones,
// congruencia con los demás y acierto (proxy) de sus apuestas.

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

// Palabras vacías: un n-grama compuesto SOLO por estas no cuenta como "frase"
const STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u',
  'que', 'con', 'por', 'para', 'se', 'su', 'sus', 'es', 'ha', 'he', 'lo', 'le', 'les', 'me', 'mi',
  'no', 'si', 'sí', 'ya', 'muy', 'mas', 'más', 'pero', 'como', 'este', 'esta', 'esto', 'ese', 'esa', 'eso',
])

function tokenize(text: string): string[] {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-zñ]+/)
    .filter(t => t.length > 1)
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= tokens.length; i++) {
    const gram = tokens.slice(i, i + n)
    if (gram.every(t => STOP.has(t))) continue
    out.push(gram.join(' '))
  }
  return out
}

interface ScoutMetrics {
  persona: string
  name: string
  total: number
  jugadores: number
  partidos: number
  last30: number
  mesesSpark: { label: string; count: number }[]
  palabrasMedia: number
  cortos: number            // < 40 palabras
  largos: number            // > 150 palabras
  profundidad: number       // % de sus jugadores con ≥2 informes suyos
  frases: { frase: string; veces: number }[]
  originalidad: number | null       // 0-100, null si muestra pequeña
  pctConclusion: number
  conclusiones: Record<string, number>
  exigencia: number | null          // % Descartar sobre informes con conclusión
  congruencia: number | null        // % acuerdo con la mayoría del resto
  comparables: number
  aciertoPos: number | null         // % de sus "Llamar" que hoy son Llamar/Basque/Firmar
  nPos: number
  aciertoDesc: number | null        // % de sus "Descartar" hoy Descartado
  nDesc: number
  temprana: number | null           // % de jugadores destacados donde su informe fue el 1º
  nTemprana: number
}

interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  firmasEntries: FirmasEntry[]
  profiles: Profile[]
}

export function ScoutStats({ scoutingPlayers, scoutingReports, scoutingMatches: _sm, firmasEntries, profiles }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const metrics = useMemo<ScoutMetrics[]>(() => {
    const playersById = new Map(scoutingPlayers.map(p => [p.id, p]))
    const enFirmar = new Set(firmasEntries.map(f => f.scoutingPlayerId).filter(Boolean) as string[])

    // Informes válidos, agrupados por persona
    const reports = scoutingReports.filter(r => r.persona && (r.texto ?? '').trim().length > 0)
    const byPersona = new Map<string, ScoutingReport[]>()
    for (const r of reports) {
      const list = byPersona.get(r.persona!) ?? []
      list.push(r)
      byPersona.set(r.persona!, list)
    }

    // Conclusión (la última) de cada scout sobre cada jugador — para congruencia y acierto
    const conclusionDe = new Map<string, Map<string, string>>()   // playerId → persona → conclusión
    for (const r of reports) {
      const c = normConclusion(r.conclusion)
      if (!c) continue
      let m = conclusionDe.get(r.playerId)
      if (!m) { m = new Map(); conclusionDe.set(r.playerId, m) }
      const prev = m.get(r.persona!)
      // nos quedamos con la más reciente
      if (!prev) m.set(r.persona!, c)
      else {
        const prevR = reports.find(x => x.playerId === r.playerId && x.persona === r.persona && normConclusion(x.conclusion) === prev)
        if (!prevR || (r.fecha ?? r.createdAt) > (prevR.fecha ?? prevR.createdAt)) m.set(r.persona!, c)
      }
    }

    // Primer informe de cada jugador (para detección temprana)
    const primerAutor = new Map<string, { persona: string; nAutores: number }>()
    {
      const porJugador = new Map<string, ScoutingReport[]>()
      for (const r of reports) {
        const l = porJugador.get(r.playerId) ?? []
        l.push(r)
        porJugador.set(r.playerId, l)
      }
      for (const [pid, list] of porJugador) {
        const sorted = [...list].sort((a, b) => (a.fecha ?? a.createdAt).localeCompare(b.fecha ?? b.createdAt))
        primerAutor.set(pid, { persona: sorted[0].persona!, nAutores: new Set(list.map(x => x.persona)).size })
      }
    }

    const hoy = new Date()
    const hace30 = new Date(hoy.getTime() - 30 * 86400000).toISOString()
    const meses: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS_ES[d.getMonth()] })
    }

    const esDestacadoHoy = (pid: string) => {
      const p = playersById.get(pid)
      return (p && (p.assessment === 'Llamar' || p.assessment === 'Basque')) || enFirmar.has(pid)
    }

    const out: ScoutMetrics[] = []
    for (const [persona, list] of byPersona) {
      const name = profiles.find(p => p.avatar === persona)?.name ?? persona

      // ── volumen y ritmo ──
      const jugadoresSet = new Set(list.map(r => r.playerId))
      const partidosSet = new Set(list.map(r => r.matchId).filter(Boolean))
      const last30 = list.filter(r => (r.fecha ?? r.createdAt) >= hace30).length
      const mesesSpark = meses.map(m => ({
        label: m.label,
        count: list.filter(r => (r.fecha ?? r.createdAt).startsWith(m.key)).length,
      }))

      // ── escritura ──
      const tokensPorInforme = list.map(r => tokenize(r.texto!))
      const palabras = tokensPorInforme.map(t => t.length)
      const palabrasMedia = palabras.length ? Math.round(palabras.reduce((a, b) => a + b, 0) / palabras.length) : 0
      const cortos = palabras.filter(n => n < 40).length
      const largos = palabras.filter(n => n > 150).length

      // frases habituales: trigramas repetidos entre SUS informes (1 vez por informe)
      const fraseCount = new Map<string, number>()
      for (const toks of tokensPorInforme) {
        const vistos = new Set(ngrams(toks, 3))
        for (const g of vistos) fraseCount.set(g, (fraseCount.get(g) ?? 0) + 1)
      }
      const frases = [...fraseCount.entries()]
        .filter(([, v]) => v >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([frase, veces]) => ({ frase, veces }))

      // originalidad: % de 4-gramas únicos sobre el total de 4-gramas que escribe
      let originalidad: number | null = null
      {
        const todos: string[] = []
        for (const toks of tokensPorInforme) todos.push(...ngrams(toks, 4))
        if (todos.length >= 200) {
          originalidad = Math.round((new Set(todos).size / todos.length) * 100)
        }
      }

      // profundidad de seguimiento
      const porJugador = new Map<string, number>()
      for (const r of list) porJugador.set(r.playerId, (porJugador.get(r.playerId) ?? 0) + 1)
      const repetidos = [...porJugador.values()].filter(n => n >= 2).length
      const profundidad = jugadoresSet.size ? Math.round((repetidos / jugadoresSet.size) * 100) : 0

      // ── conclusiones ──
      const conConcl = list.filter(r => normConclusion(r.conclusion))
      const pctConclusion = list.length ? Math.round((conConcl.length / list.length) * 100) : 0
      const conclusiones: Record<string, number> = {}
      for (const r of conConcl) {
        const c = normConclusion(r.conclusion)!
        conclusiones[c] = (conclusiones[c] ?? 0) + 1
      }
      const exigencia = conConcl.length >= 10
        ? Math.round(((conclusiones['Descartar'] ?? 0) / conConcl.length) * 100)
        : null

      // ── congruencia con otros scouts ──
      let acuerdo = 0, comparables = 0
      for (const [pid, m] of conclusionDe) {
        const mia = m.get(persona)
        if (!mia || m.size < 2) continue
        const resto = [...m.entries()].filter(([p]) => p !== persona).map(([, c]) => c)
        if (resto.length === 0) continue
        const counts = new Map<string, number>()
        for (const c of resto) counts.set(c, (counts.get(c) ?? 0) + 1)
        const maxN = Math.max(...counts.values())
        const modas = [...counts.entries()].filter(([, n]) => n === maxN).map(([c]) => c)
        comparables++
        if (modas.includes(mia)) acuerdo++
        void pid
      }
      const congruencia = comparables >= 5 ? Math.round((acuerdo / comparables) * 100) : null

      // ── acierto (proxy: dónde está hoy el jugador) ──
      let posHit = 0, nPos = 0, descHit = 0, nDesc = 0
      for (const [pid, m] of conclusionDe) {
        const mia = m.get(persona)
        if (!mia) continue
        if (mia === 'Llamar') { nPos++; if (esDestacadoHoy(pid)) posHit++ }
        if (mia === 'Descartar') { nDesc++; if (playersById.get(pid)?.assessment === 'Descartado') descHit++ }
      }
      const aciertoPos = nPos >= 5 ? Math.round((posHit / nPos) * 100) : null
      const aciertoDesc = nDesc >= 5 ? Math.round((descHit / nDesc) * 100) : null

      // ── detección temprana ──
      let primeros = 0, nTemprana = 0
      for (const pid of jugadoresSet) {
        const info = primerAutor.get(pid)
        if (!info || info.nAutores < 2 || !esDestacadoHoy(pid)) continue
        nTemprana++
        if (info.persona === persona) primeros++
      }
      const temprana = nTemprana >= 5 ? Math.round((primeros / nTemprana) * 100) : null

      out.push({
        persona, name, total: list.length, jugadores: jugadoresSet.size, partidos: partidosSet.size,
        last30, mesesSpark, palabrasMedia, cortos, largos, profundidad, frases, originalidad,
        pctConclusion, conclusiones, exigencia, congruencia, comparables,
        aciertoPos, nPos, aciertoDesc, nDesc, temprana, nTemprana,
      })
    }
    return out.sort((a, b) => b.total - a.total)
  }, [scoutingPlayers, scoutingReports, firmasEntries, profiles])

  const sel = metrics.find(m => m.persona === selected) ?? metrics[0]
  const maxSpark = sel ? Math.max(...sel.mesesSpark.map(m => m.count), 1) : 1

  if (metrics.length === 0) {
    return <p className="text-sm text-slate-400 italic py-8 text-center">Aún no hay informes con autor para analizar.</p>
  }

  const pct = (v: number | null, warnBelow?: number) =>
    v === null
      ? <span className="text-slate-300">— <span className="text-[9px]">(pocos datos)</span></span>
      : <span className={warnBelow !== undefined && v < warnBelow ? 'text-amber-600 font-semibold' : 'font-semibold'}>{v}%</span>

  return (
    <div className="space-y-4">
      {/* ── Tabla comparativa ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Comparativa de scouts</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Clic en una fila para ver el detalle. Las métricas con pocos datos se muestran como «—» en vez de engañar.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-left px-3 py-2 font-medium">Scout</th>
                <th className="text-right px-3 py-2 font-medium">Informes</th>
                <th className="text-right px-3 py-2 font-medium">Jugadores</th>
                <th className="text-right px-3 py-2 font-medium" title="Palabras de media por informe">Palabras</th>
                <th className="text-right px-3 py-2 font-medium" title="% de informes que llevan conclusión">Concluye</th>
                <th className="text-right px-3 py-2 font-medium" title="% Descartar sobre informes con conclusión — un scout que nunca descarta no está filtrando">Exigencia</th>
                <th className="text-right px-3 py-2 font-medium" title="% de 4-gramas únicos en sus textos: bajo = se repite mucho">Originalidad</th>
                <th className="text-right px-3 py-2 font-medium" title="% de acuerdo con la conclusión mayoritaria de los demás scouts sobre el mismo jugador">Congruencia</th>
                <th className="text-right px-3 py-2 font-medium" title="% de sus «Llamar» que hoy siguen destacados (Llamar/Basque o en Firmar)">Acierto</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr
                  key={m.persona}
                  onClick={() => setSelected(m.persona)}
                  className={`border-t border-slate-50 cursor-pointer transition-colors ${sel?.persona === m.persona ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-[9px] font-bold flex items-center justify-center text-slate-600">{m.persona}</span>
                      <span className="font-medium text-slate-800">{m.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{m.total}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{m.jugadores}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{m.palabrasMedia}</td>
                  <td className="px-3 py-2 text-right">{pct(m.pctConclusion, 50)}</td>
                  <td className="px-3 py-2 text-right">{pct(m.exigencia)}</td>
                  <td className="px-3 py-2 text-right">{pct(m.originalidad, 55)}</td>
                  <td className="px-3 py-2 text-right">{pct(m.congruencia)}</td>
                  <td className="px-3 py-2 text-right">{pct(m.aciertoPos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalle del scout seleccionado ── */}
      {sel && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center">{sel.persona}</span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">{sel.name}</h3>
              <p className="text-[11px] text-slate-400">{sel.total} informes · {sel.jugadores} jugadores · {sel.partidos} partidos con informe</p>
            </div>
          </div>

          {/* Ritmo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><FileText className="w-3 h-3" /> Ritmo (6 meses)</p>
              <div className="flex items-end gap-1.5 mt-2 h-16">
                {sel.mesesSpark.map(m => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className="text-[9px] text-slate-500">{m.count || ''}</span>
                    <div className="w-full bg-blue-400 rounded-t" style={{ height: `${Math.max((m.count / maxSpark) * 44, m.count ? 3 : 0)}px` }} />
                    <span className="text-[9px] text-slate-400">{m.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">{sel.last30} en los últimos 30 días</p>
            </div>

            {/* Escritura */}
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Escritura</p>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <p><strong>{sel.palabrasMedia}</strong> palabras/informe de media</p>
                <p>{sel.cortos} cortos (&lt;40) · {sel.largos} largos (&gt;150)</p>
                <p>Originalidad: {sel.originalidad !== null ? <strong className={sel.originalidad < 55 ? 'text-amber-600' : ''}>{sel.originalidad}%</strong> : <span className="text-slate-300">pocos datos</span>}</p>
                <p>Seguimiento: <strong>{sel.profundidad}%</strong> de sus jugadores con ≥2 informes</p>
              </div>
            </div>

            {/* Conclusiones */}
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Target className="w-3 h-3" /> Conclusiones ({sel.pctConclusion}% de sus informes)</p>
              <div className="mt-2 space-y-1.5">
                {(['Llamar', 'Seguir', 'Descartar'] as const).map(c => {
                  const n = sel.conclusiones[c] ?? 0
                  const total = Object.values(sel.conclusiones).reduce((a, b) => a + b, 0) || 1
                  const color = c === 'Llamar' ? 'bg-amber-400' : c === 'Seguir' ? 'bg-blue-400' : 'bg-red-400'
                  return (
                    <div key={c} className="flex items-center gap-2 text-[11px]">
                      <span className="w-16 text-slate-600">{c}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${color}`} style={{ width: `${Math.round((n / total) * 100)}%` }} />
                      </div>
                      <span className="w-8 text-right text-slate-500">{n}</span>
                    </div>
                  )
                })}
                {sel.exigencia !== null && sel.exigencia === 0 && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Nunca descarta: puede que no esté filtrando</p>
                )}
              </div>
            </div>
          </div>

          {/* Congruencia + acierto + temprana */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Handshake className="w-3 h-3" /> Congruencia con el resto</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{sel.congruencia !== null ? `${sel.congruencia}%` : '—'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {sel.comparables > 0
                  ? `Coincide con la mayoría en ${sel.comparables} jugador${sel.comparables !== 1 ? 'es' : ''} evaluados también por otros`
                  : 'Sin jugadores evaluados en común con otros scouts'}
              </p>
            </div>
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Target className="w-3 h-3" /> Acierto de sus apuestas</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{sel.aciertoPos !== null ? `${sel.aciertoPos}%` : '—'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                De sus {sel.nPos} «Llamar», los que hoy siguen destacados (Llamar/Basque o en Firmar).
                {sel.aciertoDesc !== null && ` Descartes confirmados: ${sel.aciertoDesc}% de ${sel.nDesc}.`}
              </p>
            </div>
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Eye className="w-3 h-3" /> Detección temprana</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{sel.temprana !== null ? `${sel.temprana}%` : '—'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {sel.nTemprana > 0
                  ? `De ${sel.nTemprana} jugadores destacados que vieron varios scouts, las veces que su informe fue el primero`
                  : 'Aún sin jugadores destacados vistos por varios scouts'}
              </p>
            </div>
          </div>

          {/* Frases habituales */}
          <div className="border border-slate-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Users className="w-3 h-3" /> Frases habituales</p>
            {sel.frases.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sel.frases.map(f => (
                  <span key={f.frase} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    «{f.frase}» <span className="text-slate-400">×{f.veces}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic mt-1.5">Sin muletillas detectables — buena señal.</p>
            )}
            <p className="text-[10px] text-slate-300 mt-1.5">Expresiones de 3 palabras que aparecen en 3 o más informes suyos.</p>
          </div>

          <p className="text-[10px] text-slate-300">
            Nota: «acierto» es una aproximación — compara sus conclusiones con dónde está el jugador HOY, y el estado actual
            puede deberse en parte a sus propios informes. Las métricas se ocultan («—») cuando hay pocos datos para no engañar.
          </p>
        </div>
      )}
    </div>
  )
}
