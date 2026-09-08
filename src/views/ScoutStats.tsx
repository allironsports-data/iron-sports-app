import { useMemo, useState } from 'react'
import { FileText, Users, Target, Fingerprint, Handshake, Eye, AlertTriangle } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch, FirmasEntry } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { grupoLargoDe } from '../lib/campo'
import { norm } from '../lib/texto'

// ── Estadísticas por scout ───────────────────────────────────
// Evalúa el trabajo de cada persona a partir de sus informes:
// volumen, escritura (muletillas, originalidad), conclusiones,
// congruencia con los demás y acierto (proxy) de sus apuestas.

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

// «Visto» significa «lo he visto y no concluyo»: cuenta como informe marcado,
// pero NO como veredicto. Si contase, un Visto frente a un Llamar saldría como
// desacuerdo entre scouts, y meter muchos Vistos bajaría la exigencia sin que
// nadie haya descartado a nadie.
const esVeredicto = (c?: string): boolean => {
  const n = normConclusion(c)
  return n === 'Seguir' || n === 'Llamar' || n === 'Descartar'
}

// Palabras vacías: un n-grama compuesto SOLO por estas no cuenta como "frase"
const STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u',
  'que', 'con', 'por', 'para', 'se', 'su', 'sus', 'es', 'ha', 'he', 'lo', 'le', 'les', 'me', 'mi',
  'no', 'si', 'sí', 'ya', 'muy', 'mas', 'más', 'pero', 'como', 'este', 'esta', 'esto', 'ese', 'esa', 'eso',
])

function tokenize(text: string): string[] {
  return norm(text).split(/[^a-z]+/).filter(t => t.length > 1)
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

// Descarga una lista como CSV (se abre en Excel). Con BOM para que los
// acentos no salgan rotos.
function descargarCsv(nombre: string, cabecera: string[], filas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cabecera, ...filas].map(f => f.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ScoutStats({ scoutingPlayers, scoutingReports, scoutingMatches: _sm, firmasEntries, profiles }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [verTodo, setVerTodo] = useState({ debates: false, frios: false })

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
    // Se guarda la fecha junto a la conclusión para quedarse con la MÁS RECIENTE por scout
    // sin volver a recorrer `reports` (el find anterior era O(n²) y además podía encontrar
    // un informe distinto con la misma conclusión).
    const conclusionDe = new Map<string, Map<string, string>>()   // playerId → persona → conclusión
    {
      const ultima = new Map<string, Map<string, { c: string; f: string }>>()
      for (const r of reports) {
        if (!esVeredicto(r.conclusion)) continue
        const c = normConclusion(r.conclusion)
        if (!c) continue
        let m = ultima.get(r.playerId)
        if (!m) { m = new Map(); ultima.set(r.playerId, m) }
        const f = r.fecha ?? r.createdAt
        const prev = m.get(r.persona!)
        if (!prev || f > prev.f) m.set(r.persona!, { c, f })
      }
      for (const [pid, m] of ultima) conclusionDe.set(pid, new Map([...m].map(([sc, v]) => [sc, v.c])))
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
      // Exigencia = % de Descartar, pero solo sobre los que sí son veredicto:
      // los «Visto» no son ni un sí ni un no.
      const veredictos = list.filter(r => esVeredicto(r.conclusion))
      const exigencia = veredictos.length >= 10
        ? Math.round(((conclusiones['Descartar'] ?? 0) / veredictos.length) * 100)
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

  // ── Estadísticas del EQUIPO ──
  const team = useMemo(() => {
    const reports = scoutingReports.filter(r => r.persona && (r.texto ?? '').trim().length > 0)
    const playersById = new Map(scoutingPlayers.map(p => [p.id, p]))
    const enFirmar = new Set(firmasEntries.map(f => f.scoutingPlayerId).filter(Boolean) as string[])
    const firmados = firmasEntries.filter(f => f.status === 'firmado').length

    const hoy = new Date()
    const iso = (d: Date) => d.toISOString()
    const hace30 = iso(new Date(hoy.getTime() - 30 * 86400000))
    const hace60 = iso(new Date(hoy.getTime() - 60 * 86400000))
    const fecha = (r: ScoutingReport) => r.fecha ?? r.createdAt

    // Ritmo: 12 meses + comparación 30d vs 30 anteriores
    const meses: { key: string; label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      meses.push({ key, label: MONTHS_ES[d.getMonth()], count: 0 })
    }
    const mesIdx = new Map(meses.map((m, i) => [m.key, i]))
    let ult30 = 0, prev30 = 0
    const hace60b = iso(new Date(hoy.getTime() - 60 * 86400000))
    for (const r of reports) {
      const f = fecha(r)
      const i = mesIdx.get(f.slice(0, 7))
      if (i !== undefined) meses[i].count++
      if (f >= hace30) ult30++
      else if (f >= hace60b) prev30++
    }

    // Cobertura
    const jugadoresConInforme = new Set(reports.map(r => r.playerId))
    const partidosConInforme = new Set(reports.map(r => r.matchId).filter(Boolean)).size
    const ultimoInformeDe = new Map<string, string>()
    for (const r of reports) {
      const f = fecha(r)
      if ((ultimoInformeDe.get(r.playerId) ?? '') < f) ultimoInformeDe.set(r.playerId, f)
    }
    const destacados = scoutingPlayers.filter(p => p.assessment === 'Llamar' || p.assessment === 'Basque')
    const frios = destacados
      .filter(p => (ultimoInformeDe.get(p.id) ?? '') < hace60)
      .sort((a, b) => (ultimoInformeDe.get(a.id) ?? '').localeCompare(ultimoInformeDe.get(b.id) ?? ''))

    // Conclusiones por scout y jugador → consenso, debates, doble opinión.
    // Solo veredictos: un «Visto» no discrepa de nadie.
    // Se conserva la conclusión MÁS RECIENTE de cada scout (antes se quedaba la última
    // procesada, que depende del orden de llegada y no de la fecha).
    const conclusionDe = new Map<string, Map<string, string>>()
    {
      const ultima = new Map<string, Map<string, { c: string; f: string }>>()
      for (const r of reports) {
        if (!esVeredicto(r.conclusion)) continue
        const c = normConclusion(r.conclusion)
        if (!c) continue
        let m = ultima.get(r.playerId)
        if (!m) { m = new Map(); ultima.set(r.playerId, m) }
        const f = fecha(r)
        const prev = m.get(r.persona!)
        if (!prev || f > prev.f) m.set(r.persona!, { c, f })
      }
      for (const [pid, m] of ultima) conclusionDe.set(pid, new Map([...m].map(([sc, v]) => [sc, v.c])))
    }
    let unanime = 0, dividido = 0, multi = 0
    const debates: { id: string; nombre: string; detalle: string }[] = []
    for (const [pid, m] of conclusionDe) {
      if (m.size < 2) continue
      multi++
      const cs = new Set(m.values())
      if (cs.size === 1) unanime++
      else {
        dividido++
        if (cs.has('Llamar') && cs.has('Descartar')) {
          const p = playersById.get(pid)
          if (p) debates.push({
            id: p.id,
            nombre: p.fullName,
            detalle: [...m.entries()].map(([sc, c]) => `${sc}: ${c}`).join(' · '),
          })
        }
      }
    }
    const dobleOpinion = destacados.length
      ? Math.round((destacados.filter(p => (conclusionDe.get(p.id)?.size ?? 0) >= 2 ||
          new Set(reports.filter(r => r.playerId === p.id).map(r => r.persona)).size >= 2).length / destacados.length) * 100)
      : null

    // Embudo
    const conLlamarDeAlguien = [...conclusionDe.values()].filter(m => [...m.values()].includes('Llamar')).length
    const embudo = [
      { label: 'Jugadores en BBDD', n: scoutingPlayers.length },
      { label: 'Con informe', n: jugadoresConInforme.size },
      { label: 'Con algún «Llamar»', n: conLlamarDeAlguien },
      { label: 'En pipeline Firmar', n: enFirmar.size },
      { label: 'Firmados', n: firmados },
    ]

    // Reparto del esfuerzo
    const porScout = new Map<string, number>()
    for (const r of reports) porScout.set(r.persona!, (porScout.get(r.persona!) ?? 0) + 1)
    const reparto = [...porScout.entries()].sort((a, b) => b[1] - a[1])
    const cargaMax = reports.length ? Math.round((reparto[0][1] / reports.length) * 100) : 0

    // Posiciones cubiertas (grupo grueso)
    const porPosicion = new Map<string, number>()
    for (const r of reports) {
      const g = grupoLargoDe(playersById.get(r.playerId)?.position1)
      porPosicion.set(g, (porPosicion.get(g) ?? 0) + 1)
    }
    const posiciones = ['Portero', 'Defensa', 'Medio', 'Extremo', 'Delantero']
      .map(g => ({ g, n: porPosicion.get(g) ?? 0 }))

    return {
      total: reports.length, ult30, prev30, meses,
      jugadoresConInforme: jugadoresConInforme.size,
      partidosConInforme, partidosTotal: _sm.length,
      friosCount: frios.length,
      friosTop: frios.map(p => ({
        id: p.id,
        nombre: p.fullName,
        ultimo: (ultimoInformeDe.get(p.id) ?? '').slice(0, 10) || 'nunca',
        equipo: p.team ?? '',
        pos: p.position1 ?? '',
        anyo: p.birthdate ? p.birthdate.slice(0, 4) : '',
      })),
      destacadosTotal: destacados.length,
      multi, unanime, dividido, debates, dobleOpinion,
      embudo, reparto, cargaMax, posiciones,
    }
  }, [scoutingPlayers, scoutingReports, firmasEntries, _sm])

  const sel = metrics.find(m => m.persona === selected) ?? metrics[0]
  const maxSpark = sel ? Math.max(...sel.mesesSpark.map(m => m.count), 1) : 1

  if (metrics.length === 0) {
    return <p className="text-sm text-slate-400 italic py-8 text-center">Aún no hay informes con autor para analizar.</p>
  }

  const pct = (v: number | null, warnBelow?: number) =>
    v === null
      ? <span className="text-slate-300">— <span className="text-[9px]">(pocos datos)</span></span>
      : <span className={warnBelow !== undefined && v < warnBelow ? 'text-amber-600 font-semibold' : 'font-semibold'}>{v}%</span>

  const maxMes = Math.max(...team.meses.map(m => m.count), 1)
  const maxEmbudo = Math.max(...team.embudo.map(e => e.n), 1)
  const maxPos = Math.max(...team.posiciones.map(p => p.n), 1)
  const tendencia = team.prev30 > 0 ? Math.round(((team.ult30 - team.prev30) / team.prev30) * 100) : null

  return (
    <div className="space-y-4">
      {/* ── EL EQUIPO ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">El equipo</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Cómo trabajamos entre todos: ritmo, cobertura, consenso y embudo.</p>
        </div>

        {/* Cifras + tendencia */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{team.total}</div>
            <div className="text-[11px] text-slate-500">Informes totales</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">
              {team.ult30}
              {tendencia !== null && (
                <span className={`text-xs font-bold ml-1 ${tendencia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {tendencia >= 0 ? '↑' : '↓'}{Math.abs(tendencia)}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">Últimos 30 días vs los 30 anteriores</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{team.jugadoresConInforme}</div>
            <div className="text-[11px] text-slate-500">Jugadores con informe</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{team.partidosConInforme}<span className="text-sm text-slate-400">/{team.partidosTotal}</span></div>
            <div className="text-[11px] text-slate-500">Partidos con algún informe</div>
          </div>
        </div>

        {/* Ritmo 12 meses */}
        <div className="border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ritmo del equipo · 12 meses</p>
          <div className="flex items-end gap-1 mt-2 h-20">
            {team.meses.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[8px] text-slate-400">{m.count || ''}</span>
                <div className="w-full bg-blue-400 rounded-t" style={{ height: `${Math.max((m.count / maxMes) * 56, m.count ? 2 : 0)}px` }} />
                <span className="text-[8px] text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Embudo */}
          <div className="border border-slate-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Embudo: de la BBDD a la firma</p>
            <div className="mt-2 space-y-1.5">
              {team.embudo.map((e, i) => {
                const prev = i > 0 ? team.embudo[i - 1].n : 0
                const paso = i > 0 && prev > 0 ? Math.round((e.n / prev) * 100) : null
                return (
                  <div key={e.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-32 text-slate-600 flex-shrink-0">{e.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${['bg-slate-400','bg-blue-400','bg-amber-400','bg-violet-400','bg-emerald-500'][i]}`}
                           style={{ width: `${Math.max(Math.round((e.n / maxEmbudo) * 100), e.n ? 2 : 0)}%` }} />
                    </div>
                    {/* qué porcentaje sobrevive de la etapa anterior: ahí se ve el atasco */}
                    <span className="w-10 text-right text-[10px] text-slate-400 tabular-nums" title={paso !== null ? `${e.n} de ${prev} (${paso}%)` : ''}>
                      {paso !== null ? `${paso}%` : ''}
                    </span>
                    <span className="w-12 text-right font-semibold text-slate-700">{e.n}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Consenso */}
          <div className="border border-slate-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Consenso del equipo</p>
            {team.multi > 0 ? (
              <div className="mt-2 text-xs text-slate-600 space-y-1">
                <p><strong>{team.multi}</strong> jugadores con conclusión de 2+ scouts:</p>
                <p className="text-emerald-700">{team.unanime} unánimes ({Math.round((team.unanime / team.multi) * 100)}%)</p>
                <p className="text-amber-700">{team.dividido} divididos</p>
                <p className="mt-1.5">
                  Doble opinión en destacados: {team.dobleOpinion !== null
                    ? <strong>{team.dobleOpinion}%</strong>
                    : '—'}{' '}
                  <span className="text-slate-400">de los {team.destacadosTotal} Llamar/Basque tienen 2+ scouts detrás</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mt-2">Aún no hay jugadores con conclusiones de varios scouts.</p>
            )}
          </div>
        </div>

        {/* Debates + fríos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">⚖️ Debates pendientes</p>
                <p className="text-[10px] text-slate-400 mb-1.5">Un scout dice «Llamar» y otro «Descartar» — merecen una charla</p>
              </div>
              {team.debates.length > 0 && (
                <button
                  onClick={() => descargarCsv('debates_pendientes', ['Jugador', 'Conclusiones'], team.debates.map(d => [d.nombre, d.detalle]))}
                  className="flex-shrink-0 text-[10px] font-semibold text-amber-700 hover:text-amber-900 underline decoration-dotted"
                >
                  ↓ Excel
                </button>
              )}
            </div>
            {team.debates.length > 0 ? (
              <>
                <ul className={`space-y-1 text-[11px] text-slate-700 ${verTodo.debates ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
                  {(verTodo.debates ? team.debates : team.debates.slice(0, 8)).map(d => (
                    <li key={d.id}><strong>{d.nombre}</strong> <span className="text-slate-400">— {d.detalle}</span></li>
                  ))}
                </ul>
                {team.debates.length > 8 && (
                  <button
                    onClick={() => setVerTodo(v => ({ ...v, debates: !v.debates }))}
                    className="mt-1.5 text-[10.5px] font-semibold text-amber-700 hover:text-amber-900"
                  >
                    {verTodo.debates ? '← Ver solo los primeros' : `Ver los ${team.debates.length} →`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Ninguno — sin choques frontales ahora mismo.</p>
            )}
          </div>

          <div className="border border-sky-200 bg-sky-50/40 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wide">🧊 Destacados que se enfrían</p>
                <p className="text-[10px] text-slate-400 mb-1.5">Llamar/Basque sin ningún informe en los últimos 60 días ({team.friosCount} de {team.destacadosTotal})</p>
              </div>
              {team.friosTop.length > 0 && (
                <button
                  onClick={() => descargarCsv('destacados_que_se_enfrian',
                    ['Jugador', 'Equipo', 'Posición', 'Año', 'Último informe'],
                    team.friosTop.map(f => [f.nombre, f.equipo, f.pos, f.anyo, f.ultimo]))}
                  className="flex-shrink-0 text-[10px] font-semibold text-sky-700 hover:text-sky-900 underline decoration-dotted"
                >
                  ↓ Excel
                </button>
              )}
            </div>
            {team.friosTop.length > 0 ? (
              <>
                <ul className={`space-y-1 text-[11px] text-slate-700 ${verTodo.frios ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
                  {(verTodo.frios ? team.friosTop : team.friosTop.slice(0, 6)).map(f => (
                    <li key={f.id}>
                      <strong>{f.nombre}</strong>
                      <span className="text-slate-400">
                        {[f.equipo, f.pos, f.anyo].filter(Boolean).length > 0 && ` (${[f.equipo, f.pos, f.anyo].filter(Boolean).join(' · ')})`}
                        {' '}— último informe: {f.ultimo}
                      </span>
                    </li>
                  ))}
                </ul>
                {team.friosTop.length > 6 && (
                  <button
                    onClick={() => setVerTodo(v => ({ ...v, frios: !v.frios }))}
                    className="mt-1.5 text-[10.5px] font-semibold text-sky-700 hover:text-sky-900"
                  >
                    {verTodo.frios ? '← Ver solo los primeros' : `Ver los ${team.friosTop.length} →`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Todos los destacados tienen informe reciente. 👏</p>
            )}
          </div>
        </div>

        {/* Reparto + posiciones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-slate-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Reparto del esfuerzo</p>
            <div className="flex h-3 rounded-full overflow-hidden mt-2">
              {team.reparto.map(([sc, n], i) => (
                <div key={sc}
                     title={`${sc}: ${n} informes (${Math.round((n / team.total) * 100)}%)`}
                     className={['bg-blue-500','bg-emerald-500','bg-amber-400','bg-violet-500','bg-rose-400','bg-sky-400','bg-lime-500','bg-orange-400'][i % 8]}
                     style={{ width: `${(n / team.total) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-slate-500">
              {team.reparto.map(([sc, n]) => <span key={sc}><strong>{sc}</strong> {Math.round((n / team.total) * 100)}%</span>)}
            </div>
            {team.cargaMax >= 50 && (
              <p className="text-[10px] text-amber-600 mt-1.5">⚠ Un solo scout firma el {team.cargaMax}% de los informes.</p>
            )}
          </div>

          <div className="border border-slate-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Informes por posición</p>
            <div className="mt-2 space-y-1.5">
              {team.posiciones.map(pz => (
                <div key={pz.g} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 text-slate-600 flex-shrink-0">{pz.g}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${Math.round((pz.n / maxPos) * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right text-slate-500">{pz.n}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-300 mt-1.5">Una barra muy corta = zona del campo que apenas estamos viendo.</p>
          </div>
        </div>
      </div>

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
                <th className="text-right px-3 py-2 font-medium" title="% Descartar sobre informes con veredicto (Seguir/Llamar/Descartar; los «Visto» no cuentan) — un scout que nunca descarta no está filtrando">Exigencia</th>
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
                {(['Llamar', 'Seguir', 'Descartar', 'Visto'] as const).map(c => {
                  const n = sel.conclusiones[c] ?? 0
                  const total = Object.values(sel.conclusiones).reduce((a, b) => a + b, 0) || 1
                  const color = c === 'Llamar' ? 'bg-amber-400' : c === 'Seguir' ? 'bg-blue-400' : c === 'Visto' ? 'bg-slate-300' : 'bg-red-400'
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

        </div>
      )}

      {/* ── Glosario ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">📖 Glosario de métricas</h3>
        <dl className="space-y-3 text-xs text-slate-600">
          <div>
            <dt className="font-bold text-slate-800">Concluye</dt>
            <dd className="mt-0.5">
              Porcentaje de sus informes que llevan una conclusión (Llamar, Seguir o Descartar), no solo texto.
              Un informe sin conclusión describe; con conclusión, decide. <span className="text-slate-400">Cuanto más alto mejor:
              por debajo del 50% se marca en ámbar.</span>
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Exigencia</dt>
            <dd className="mt-0.5">
              De sus informes con veredicto —Seguir, Llamar o Descartar; los «Visto» no cuentan—, el porcentaje que son
              «Descartar». Mide si el scout filtra o le vale todo.
              <span className="text-slate-400"> No es «cuanto más mejor»: un 0% avisa de que nunca descarta (no filtra), y
              un valor altísimo puede indicar que va a ver a los jugadores equivocados. Lo sano es un término medio, y
              sobre todo que sea parecido entre scouts que ven el mismo nivel de fútbol.</span>
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Originalidad</dt>
            <dd className="mt-0.5">
              Porcentaje de expresiones de 4 palabras que no se repiten entre sus propios informes. Detecta los informes
              «de plantilla»: si escribe casi lo mismo de cada jugador, el número baja.
              <span className="text-slate-400"> Por debajo del 55% se marca en ámbar: sus informes se parecen demasiado
              entre sí. Complementa a las «frases habituales», que enseñan exactamente qué muletillas repite.</span>
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Congruencia</dt>
            <dd className="mt-0.5">
              Sobre los jugadores que también evaluaron otros scouts, el porcentaje de veces que su conclusión coincide
              con la mayoría del resto. <span className="text-slate-400">Ni un extremo ni el otro es bueno: muy baja
              significa que va por libre (o que ve cosas que los demás no ven — merece revisión caso a caso); un 100%
              constante significa que no aporta criterio propio. Solo se calcula con 5 o más jugadores en común.</span>
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Acierto</dt>
            <dd className="mt-0.5">
              De los jugadores que él concluyó «Llamar», el porcentaje que HOY sigue destacado: en estado Llamar o Basque,
              o dentro del pipeline de Firmar. En su ficha se añaden los «descartes confirmados»: de sus «Descartar»,
              cuántos están hoy Descartados. <span className="text-slate-400">Es una aproximación, no una nota: el estado
              actual del jugador puede deberse en parte a sus propios informes, y a un fichaje aún le queda demostrar.
              Con más histórico se puede afinar comparando contra firmas y minutos reales.</span>
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Seguimiento</dt>
            <dd className="mt-0.5">
              Porcentaje de sus jugadores a los que ha hecho 2 o más informes. Distingue al scout que revisita y confirma
              del que solo deja primeras impresiones.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-800">Detección temprana</dt>
            <dd className="mt-0.5">
              Entre los jugadores hoy destacados que fueron vistos por varios scouts, el porcentaje de veces que el primer
              informe fue el suyo. Mide quién llega antes a los buenos.
            </dd>
          </div>
        </dl>
        <p className="text-[10px] text-slate-400 mt-3">
          Regla general de toda la página: cuando una métrica tiene pocos datos (menos de 5 casos comparables, menos de
          10 conclusiones, textos escasos…) se muestra «—» en vez de un porcentaje que engañaría.
        </p>
      </div>
    </div>
  )
}
