import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Minimize2, ExternalLink, Search } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { teamMatchKind } from '../../../lib/equipos'
import { AssessmentChip } from '../comun'
import { type MatchScoutInfo, CONCLUSION_STYLE, MONTHS_ES, birthYearFromBirthdate, personaToName, fmtDate, normConclusion, scoutColor } from '../helpers'

// ── MatchExpandedView — vista ampliada del partido ───────────
// Se abre desde la ficha del partido («Ampliar»). Es SOLO lectura: ocupa
// toda la pantalla y enseña lo que en la ficha va comprimido en chips:
// el texto completo de cada informe, los dos equipos en dos columnas,
// un resumen por scout y filtros para quedarse con lo que interesa
// (solo «Llamar», solo un scout, solo los que tienen informe…).

type FiltroVeredicto = '' | 'Llamar' | 'Seguir' | 'Descartar' | 'Visto' | 'sin'

export function MatchExpandedView({
  match, scouts, profiles, currentProfile, linkedPlayers, scoutingReports, allMatches,
  nuestros, onClose, onOpenPlayer, onOpenEquipo,
}: {
  match: ScoutingMatch
  scouts: MatchScoutInfo[]
  profiles: Profile[]
  currentProfile: Profile
  linkedPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  allMatches: ScoutingMatch[]
  nuestros?: string[]
  onClose: () => void
  onOpenPlayer?: (id: string) => void
  onOpenEquipo: (nombre: string) => void
}) {
  const [filtroScout, setFiltroScout] = useState('')
  const [filtroVeredicto, setFiltroVeredicto] = useState<FiltroVeredicto>('')
  const [busqueda, setBusqueda] = useState('')

  useEscapeKey(onClose)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)

  // Informes de este partido, por jugador (los sueltos de esas fechas también,
  // marcados como «sin vincular», igual que en la ficha)
  const informesPorJugador = useMemo(() => {
    const map: Record<string, { r: ScoutingReport; suelto: boolean }[]> = {}
    const t0 = new Date(match.date).getTime()
    for (const r of scoutingReports) {
      let suelto = false
      if (r.matchId !== match.id) {
        if (r.matchId) continue                       // es de otro partido
        const d = r.fecha ?? r.createdAt
        const t = d ? new Date(d).getTime() : NaN
        if (isNaN(t) || isNaN(t0) || Math.abs(t - t0) > 4 * 86400000) continue
        suelto = true
      }
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push({ r, suelto })
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.r.fecha ?? a.r.createdAt).localeCompare(b.r.fecha ?? b.r.createdAt))
    }
    return map
  }, [scoutingReports, match.id, match.date])

  // Resumen por scout: cuántos informes y qué concluyó cada uno
  const resumenScouts = useMemo(() => {
    const m = new Map<string, { n: number; v: Record<string, number> }>()
    for (const s of scouts) m.set(s.scout, { n: 0, v: {} })
    for (const p of linkedPlayers) {
      for (const { r, suelto } of informesPorJugador[p.id] ?? []) {
        if (suelto || !r.persona) continue
        const e = m.get(r.persona) ?? { n: 0, v: {} }
        e.n++
        const c = normConclusion(r.conclusion)
        if (c) e.v[c] = (e.v[c] ?? 0) + 1
        m.set(r.persona, e)
      }
    }
    return Array.from(m.entries())
  }, [scouts, linkedPlayers, informesPorJugador])

  const totalInformes = resumenScouts.reduce((n, [, e]) => n + e.n, 0)

  // Veredicto «dominante» del jugador en este partido (el más fuerte que
  // haya escrito alguien): Llamar > Seguir > Descartar > Visto
  const ORDEN = ['Llamar', 'Seguir', 'Descartar', 'Visto']
  const veredictoDe = (p: ScoutingPlayer): string | undefined => {
    const cs = (informesPorJugador[p.id] ?? []).filter(x => !x.suelto).map(x => normConclusion(x.r.conclusion)).filter(Boolean) as string[]
    return ORDEN.find(o => cs.includes(o))
  }

  const pasaFiltros = (p: ScoutingPlayer) => {
    const infs = informesPorJugador[p.id] ?? []
    if (busqueda && !p.fullName.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (filtroScout && !infs.some(x => x.r.persona === filtroScout)) return false
    if (filtroVeredicto === 'sin') return infs.filter(x => !x.suelto).length === 0
    if (filtroVeredicto) return infs.some(x => !x.suelto && normConclusion(x.r.conclusion) === filtroVeredicto)
    return true
  }

  // Dos columnas: local y visitante (+ otros). Dentro, primero los que tienen
  // veredicto más fuerte, luego por nombre.
  const columnas = useMemo(() => {
    const local: ScoutingPlayer[] = [], visitante: ScoutingPlayer[] = [], otros: ScoutingPlayer[] = []
    for (const p of linkedPlayers) {
      if (teamMatchKind(match.homeTeam, p.team)) local.push(p)
      else if (teamMatchKind(match.awayTeam, p.team)) visitante.push(p)
      else otros.push(p)
    }
    const orden = (a: ScoutingPlayer, b: ScoutingPlayer) => {
      const va = veredictoDe(a), vb = veredictoDe(b)
      const ia = va ? ORDEN.indexOf(va) : 9, ib = vb ? ORDEN.indexOf(vb) : 9
      return ia - ib || a.fullName.localeCompare(b.fullName)
    }
    return [
      { titulo: match.homeTeam, jugadores: local.sort(orden) },
      { titulo: match.awayTeam, jugadores: visitante.sort(orden) },
      { titulo: 'Otros equipos', jugadores: otros.sort(orden) },
    ].filter(c => c.jugadores.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPlayers, match.homeTeam, match.awayTeam, informesPorJugador])

  const visibles = columnas.map(c => ({ ...c, jugadores: c.jugadores.filter(pasaFiltros) }))
  const nVisibles = visibles.reduce((n, c) => n + c.jugadores.length, 0)

  const relacionados = useMemo(() => allMatches
    .filter(m => m.id !== match.id &&
      (teamMatchKind(m.homeTeam, match.homeTeam) || teamMatchKind(m.awayTeam, match.homeTeam) ||
       teamMatchKind(m.homeTeam, match.awayTeam) || teamMatchKind(m.awayTeam, match.awayTeam)))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [allMatches, match])

  const chipVeredicto = (c?: string) => c
    ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CONCLUSION_STYLE[c] ?? 'bg-slate-100 text-slate-500'}`}>{c}</span>
    : null

  // Portal al body: así no depende de la carcasa (modal o panel) que la abre
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-50 overflow-y-auto print:static print:overflow-visible" role="dialog" aria-modal="true" aria-label={`Vista ampliada: ${match.homeTeam} vs ${match.awayTeam}`}>
      {/* ── Cabecera fija ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 print:static">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">{day} {mon} '{yr}{match.time ? ` · ${match.time}` : ''}</span>
              {match.competition && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{match.competition}</span>}
              {match.viewMode === 'campo'
                ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">🏟️ Campo</span>
                : <span className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium">📹 Vídeo</span>}
              <span className={`px-1.5 py-0.5 rounded font-semibold ${match.status === 'visto' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {match.status === 'visto' ? '✓ Visto' : 'Pendiente'}
              </span>
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-slate-800 break-words">
              <button onClick={() => onOpenEquipo(match.homeTeam)} className="hover:text-primary hover:underline decoration-dotted underline-offset-2">{match.homeTeam}</button>
              <span className="text-slate-400 font-medium"> vs </span>
              <button onClick={() => onOpenEquipo(match.awayTeam)} className="hover:text-primary hover:underline decoration-dotted underline-offset-2">{match.awayTeam}</button>
            </h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 print:hidden">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="Volver a la ficha (Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5" /> Volver a la ficha
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        {/* ── Resumen: scouts + números ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="text-left px-3 py-1.5 font-semibold">Scout</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Modo</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Estado</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Informes</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Veredictos</th>
                </tr>
              </thead>
              <tbody>
                {resumenScouts.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-slate-400 italic">Nadie asignado todavía</td></tr>
                )}
                {resumenScouts.map(([scout, e]) => {
                  const info = scouts.find(s => s.scout === scout)
                  const c = scoutColor(scout)
                  const activo = filtroScout === scout
                  return (
                    <tr key={scout} className={`border-t border-slate-100 ${activo ? 'bg-blue-50/60' : ''}`}>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => setFiltroScout(activo ? '' : scout)}
                          title={activo ? 'Quitar filtro' : `Ver solo los informes de ${personaToName(scout, profiles) || scout}`}
                          className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full border text-[11px] font-semibold ${c.bg} ${c.text} ${c.border} ${activo ? 'ring-2 ring-blue-300' : ''}`}
                        >
                          <span className="font-mono">{scout}</span>
                          <span className="font-normal opacity-70">{personaToName(scout, profiles)}</span>
                          {scout === currentProfile.avatar && <span className="font-normal opacity-60">(yo)</span>}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{info ? (info.viewMode === 'campo' ? '🏟️ Campo' : '📹 Vídeo') : <span className="text-slate-400">no asignado</span>}</td>
                      <td className="px-3 py-1.5">
                        {info
                          ? <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full ${info.status === 'visto' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{info.status === 'visto' ? '✓ visto' : 'pendiente'}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-slate-800 tabular-nums">{e.n}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {ORDEN.filter(o => e.v[o]).map(o => (
                            <span key={o} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CONCLUSION_STYLE[o] ?? 'bg-slate-100 text-slate-500'}`}>
                              {o} <span className="opacity-80">{e.v[o]}</span>
                            </span>
                          ))}
                          {e.n === 0 && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { n: linkedPlayers.length, l: 'jugadores vistos', cls: 'text-slate-800' },
              { n: totalInformes, l: totalInformes === 1 ? 'informe' : 'informes', cls: 'text-slate-800' },
              { n: linkedPlayers.filter(p => veredictoDe(p) === 'Llamar').length, l: 'jugadores a llamar', cls: 'text-amber-600' },
              { n: linkedPlayers.filter(p => veredictoDe(p) === 'Seguir').length, l: 'a seguir', cls: 'text-blue-600' },
            ].map(x => (
              <div key={x.l} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className={`text-xl font-bold leading-none ${x.cls}`}>{x.n}</div>
                <div className="text-[10.5px] text-slate-500 mt-1">{x.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Nuestros / notas / otros partidos ── */}
        {(nuestros?.length || match.notes || relacionados.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            {nuestros && nuestros.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">Nuestros en este partido</div>
                <div className="mt-1 font-bold text-slate-800">{nuestros.join(', ')}</div>
              </div>
            )}
            {match.notes && (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 lg:col-span-2">
                <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">Notas del partido</div>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap break-words">{match.notes}</p>
              </div>
            )}
            {relacionados.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">Otros partidos de estos equipos</div>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {relacionados.map(m => (
                    <li key={m.id} className="truncate">
                      <span className="text-slate-400 tabular-nums">{fmtDate(m.date)}</span> · {m.homeTeam} – {m.awayTeam}
                      {m.status === 'visto' && <span className="ml-1 text-emerald-600">✓</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar jugador…"
              className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white w-44 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <span className="text-[11px] text-slate-500 font-medium ml-1">Veredicto:</span>
          {([
            ['', 'Todos'], ['Llamar', 'Llamar'], ['Seguir', 'Seguir'], ['Descartar', 'Descartar'], ['Visto', 'Visto'], ['sin', 'Sin informe'],
          ] as [FiltroVeredicto, string][]).map(([v, l]) => (
            <button
              key={v || 'todos'}
              onClick={() => setFiltroVeredicto(v)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                filtroVeredicto === v
                  ? (v && v !== 'sin' ? (CONCLUSION_STYLE[v] ?? 'bg-slate-800 text-white border-slate-800') : 'bg-slate-800 text-white border-slate-800')
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              {l}
            </button>
          ))}
          {filtroScout && (
            <button onClick={() => setFiltroScout('')} className="text-[11px] text-blue-600 hover:underline">
              solo {filtroScout} ✕
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{nVisibles} de {linkedPlayers.length} jugadores</span>
        </div>

        {/* ── Jugadores en columnas por equipo ── */}
        {linkedPlayers.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Aún no hay jugadores vinculados a este partido.</p>
        ) : (
          <div className={`grid grid-cols-1 gap-4 ${visibles.length >= 2 ? 'xl:grid-cols-2' : ''}`}>
            {visibles.map(col => (
              <section key={col.titulo} className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{col.titulo}</h3>
                  <span className="text-[11px] text-slate-400 tabular-nums">{col.jugadores.length}</span>
                  <span className="flex-1 h-px bg-slate-200" />
                </div>
                {col.jugadores.length === 0 && <p className="text-[11px] text-slate-400 italic">Ninguno con estos filtros.</p>}
                <div className="space-y-2">
                  {col.jugadores.map(p => {
                    const infs = informesPorJugador[p.id] ?? []
                    const v = veredictoDe(p)
                    return (
                      <article key={p.id} className={`bg-white border rounded-lg px-3 py-2.5 ${v === 'Llamar' ? 'border-amber-300' : v === 'Seguir' ? 'border-blue-200' : 'border-slate-200'}`}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            onClick={() => onOpenPlayer?.(p.id)}
                            className="text-sm font-semibold text-slate-800 hover:text-primary inline-flex items-center gap-1"
                            title="Abrir ficha del jugador"
                          >
                            {p.fullName} <ExternalLink className="w-3 h-3 text-slate-300" />
                          </button>
                          <span className="text-[11px] text-slate-500">
                            {[p.position1, p.position2, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.foot, p.team].filter(Boolean).join(' · ')}
                          </span>
                          <span className="flex-1" />
                          <span title="Etiqueta actual del jugador"><AssessmentChip a={p.assessment} small /></span>
                          {v && <span title="Veredicto en este partido (el más fuerte de los informes)">{chipVeredicto(v)}</span>}
                        </div>
                        {(p.clubContract || p.agency || p.nationality) && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {[p.nationality, p.agency && `Agencia: ${p.agency}`, p.clubContract && `Contrato: ${p.clubContract}`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {infs.length === 0 ? (
                          <p className="mt-1.5 text-[11px] text-slate-400 italic">Sin informe en este partido.</p>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {infs.map(({ r, suelto }) => {
                              const c = scoutColor(r.persona ?? '')
                              const mio = (r.authorId && r.authorId === currentProfile.id) || r.persona === currentProfile.avatar
                              return (
                                <div key={r.id} className={`rounded-md px-2.5 py-2 border ${suelto ? 'border-dashed border-slate-300 bg-white' : mio ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className={`font-mono font-bold px-1.5 rounded ${c.bg} ${c.text}`}>{r.persona ?? '—'}</span>
                                    <span className="text-slate-500">{personaToName(r.persona, profiles)}</span>
                                    <span className="text-slate-400">· {fmtDate(r.fecha ?? r.createdAt)}</span>
                                    {chipVeredicto(normConclusion(r.conclusion))}
                                    {suelto && <span className="text-slate-400 italic">sin vincular a este partido</span>}
                                    {r.titulo && <span className="font-semibold text-slate-700">· {r.titulo}</span>}
                                  </div>
                                  {r.texto
                                    ? <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{r.texto}</p>
                                    : <p className="mt-1 text-[11px] text-slate-400 italic">Sin texto.</p>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
