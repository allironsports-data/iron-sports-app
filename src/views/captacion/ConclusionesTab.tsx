import React, { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment } from '../../types'
import { ZONAS, SIN_ZONA, zonaDe, type Zona } from '../../lib/zonas'
import { PITCH_SLOTS, POS_GROUPS, slotDe as pitchSlotOf, grupoDe as posGroupOf } from '../../lib/campo'
import { AssessmentChip } from './comun'
import { SELECT_CLS, normConclusion, CONCLUSION_STYLE, birthYearFromBirthdate, fmtDate, relativeDate } from './helpers'
// ── ConclusionesTab ──────────────────────────────────────────
// Punto de conclusiones: candidatos a Llamar, mapa por generación ×
// posición/categoría (matriz o campograma) y movimientos recientes.

const MAP_ASSESSMENTS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir']

export function ConclusionesTab({ players, reports, threshold, onThresholdChange, isAdmin, onSetCandidateSeen, onOpenPlayer, clubZonas, onAbrirZonas }: {
  players: ScoutingPlayer[]
  reports: ScoutingReport[]
  threshold: number
  onThresholdChange: (n: number) => void
  isAdmin: boolean
  onSetCandidateSeen: (p: ScoutingPlayer, seenCount?: number) => Promise<void>
  onOpenPlayer: (id: string) => void
  clubZonas: Record<string, Zona>
  onAbrirZonas: () => void
}) {
  const [mapAssessment, setMapAssessment] = useState<ScoutingAssessment>('Llamar')
  const [showHidden, setShowHidden] = useState(false)
  const [mapView, setMapView] = useState<'matriz' | 'campo'>('matriz')
  const [mapDim, setMapDim] = useState<'pos' | 'cat'>('pos')
  const [selectedCell, setSelectedCell] = useState<{ row: string; col: string } | null>(null)
  const [genFilter, setGenFilter] = useState<string>('all')
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [showStale, setShowStale] = useState(false)
  const [zonaFilter, setZonaFilter] = useState<string>('all')

  // Informes por jugador (desc por fecha)
  const reportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    for (const r of reports) {
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
    }
    return map
  }, [reports])

  // ── a) Candidatos a Llamar ──────────────────────────────────
  // Cuenta solo los informes (con «Firmar» legado normalizado a «Llamar»):
  // cualquier jugador con N+ informes «Llamar» aparece aquí,
  // independientemente de su etiqueta actual.
  const candidates = useMemo(() => {
    return players
      .map(p => {
        const rs = reportsByPlayer[p.id] ?? []
        const positive = rs.filter(r => normConclusion(r.conclusion) === 'Llamar')
        if (positive.length < threshold) return null
        const byConclusion: Record<string, number> = {}
        rs.forEach(r => {
          const c = normConclusion(r.conclusion)
          if (c) byConclusion[c] = (byConclusion[c] ?? 0) + 1
        })
        return {
          p,
          llamarCount: positive.length,
          byConclusion,
          lastReport: rs[0],
          lastLlamarDate: positive[0]?.fecha ?? positive[0]?.createdAt,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.lastLlamarDate ?? '').localeCompare(a!.lastLlamarDate ?? '')) as {
        p: ScoutingPlayer; llamarCount: number; byConclusion: Record<string, number>
        lastReport?: ScoutingReport; lastLlamarDate?: string
      }[]
  }, [players, reportsByPlayer, threshold])

  // Bandeja: "nuevos" (sin ocultar, o con informes nuevos desde que se
  // ocultaron) vs "ocultados" (revisados por un admin)
  const isNewCandidate = (c: { p: ScoutingPlayer; llamarCount: number }) =>
    c.p.candidateSeenCount == null || c.llamarCount > c.p.candidateSeenCount
  const newCandidates = candidates.filter(isNewCandidate)
  const hiddenCandidates = candidates.filter(c => !isNewCandidate(c))

  // ── b) Mapa ─────────────────────────────────────────────────
  const mapPlayers = useMemo(
    () => players.filter(p =>
      p.assessment === mapAssessment &&
      (zonaFilter === 'all' || (zonaDe(p.team, clubZonas) ?? SIN_ZONA) === zonaFilter)
    ),
    [players, mapAssessment, zonaFilter, clubZonas]
  )

  // Cuántos hay en cada zona con la valoración elegida (para el desplegable)
  const conteoZonas = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of players) {
      if (p.assessment !== mapAssessment) continue
      const z = zonaDe(p.team, clubZonas) ?? SIN_ZONA
      m[z] = (m[z] ?? 0) + 1
    }
    return m
  }, [players, mapAssessment, clubZonas])
  const genRows = useMemo(() => {
    const gens = new Set<string>()
    mapPlayers.forEach(p => gens.add(p.birthdate ? p.birthdate.slice(0, 4) : '—'))
    return Array.from(gens).sort((a, b) => b.localeCompare(a))
  }, [mapPlayers])

  const catCols = useMemo(() => {
    const counts: Record<string, number> = {}
    mapPlayers.forEach(p => { const c = p.categoria ?? 'Sin categoría'; counts[c] = (counts[c] ?? 0) + 1 })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
    return top
  }, [mapPlayers])

  const cols: string[] = mapDim === 'pos' ? POS_GROUPS : catCols

  function colOf(p: ScoutingPlayer): string | null {
    if (mapDim === 'pos') return posGroupOf(p.position1) ?? posGroupOf(p.position2)
    const c = p.categoria ?? 'Sin categoría'
    return catCols.includes(c) ? c : null
  }

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, ScoutingPlayer[]>> = {}
    genRows.forEach(g => { m[g] = {}; cols.forEach(c => { m[g][c] = [] }) })
    mapPlayers.forEach(p => {
      const g = p.birthdate ? p.birthdate.slice(0, 4) : '—'
      const c = colOf(p)
      if (c && m[g]) m[g][c].push(p)
    })
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPlayers, genRows, cols, mapDim])

  const maxCell = useMemo(() => {
    let mx = 1
    genRows.forEach(g => cols.forEach(c => { mx = Math.max(mx, matrix[g]?.[c]?.length ?? 0) }))
    return mx
  }, [matrix, genRows, cols])

  const cellPlayers = selectedCell ? (matrix[selectedCell.row]?.[selectedCell.col] ?? []) : []

  // Campograma
  const pitchGens = useMemo(() => {
    const gens = new Set<string>()
    mapPlayers.forEach(p => { if (p.birthdate) gens.add(p.birthdate.slice(0, 4)) })
    return Array.from(gens).sort((a, b) => b.localeCompare(a))
  }, [mapPlayers])

  const pitchBySlot = useMemo(() => {
    const map: Record<string, ScoutingPlayer[]> = {}
    let unmapped = 0
    mapPlayers
      .filter(p => genFilter === 'all' || p.birthdate?.slice(0, 4) === genFilter)
      .forEach(p => {
        const slot = pitchSlotOf(p.position1) ?? pitchSlotOf(p.position2)
        if (!slot) { unmapped++; return }
        if (!map[slot]) map[slot] = []
        map[slot].push(p)
      })
    return { map, unmapped }
  }, [mapPlayers, genFilter])

  // ── c) Movimientos ──────────────────────────────────────────
  const nowMs = Date.now()
  const D21 = 21 * 86400000
  const D42 = 42 * 86400000
  const movements = useMemo(() => {
    type Mov = { date: string; node: React.ReactNode }
    const items: Mov[] = []
    players.forEach(p => {
      if (!p.assessment || !p.assessmentUpdatedAt) return
      if (nowMs - Date.parse(p.assessmentUpdatedAt) > D21) return
      items.push({
        date: p.assessmentUpdatedAt,
        node: (
          <span>
            <button onClick={() => onOpenPlayer(p.id)} className="font-semibold text-slate-800 hover:text-primary">{p.fullName}</button>
            {' '}marcado en <AssessmentChip a={p.assessment} small />
          </span>
        ),
      })
    })
    reports.forEach(r => {
      const conc = normConclusion(r.conclusion)
      if (conc !== 'Llamar') return
      const d = r.fecha ?? r.createdAt
      if (nowMs - Date.parse(d) > D21) return
      const p = players.find(pl => pl.id === r.playerId)
      if (!p) return
      const nth = (reportsByPlayer[p.id] ?? []).filter(x =>
        normConclusion(x.conclusion) === conc && (x.fecha ?? x.createdAt) <= d
      ).length
      items.push({
        date: d,
        node: (
          <span>
            Informe de <span className="font-mono font-semibold">{r.persona ?? '—'}</span> sobre{' '}
            <button onClick={() => onOpenPlayer(p.id)} className="font-semibold text-slate-800 hover:text-primary">{p.fullName}</button>
            {' '}concluye <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${CONCLUSION_STYLE[conc] ?? ''}`}>{conc}</span>
            {nth > 1 && <span className="text-slate-400 text-[11px]"> ({nth}º en {conc})</span>}
          </span>
        ),
      })
    })
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, reports, reportsByPlayer])

  const staleDecidir = useMemo(() =>
    players.filter(p => {
      if (p.assessment !== 'Decidir') return false
      const last = reportsByPlayer[p.id]?.[0]
      return !last || nowMs - Date.parse(last.fecha ?? last.createdAt) > D42
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [players, reportsByPlayer])

  const segBtn = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${active ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="space-y-4">
      {/* ── a) Candidatos a Llamar — bandeja de alertas ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">🔔 Candidatos a Llamar</h3>
          {newCandidates.length > 0 && (
            <span className="text-xs bg-amber-400 text-amber-950 rounded-full px-2 py-0.5 font-bold">{newCandidates.length} nuevo{newCandidates.length !== 1 ? 's' : ''}</span>
          )}
          <span className="text-[11px] text-slate-400 hidden sm:inline">jugadores con {threshold}+ informes «Llamar», sea cual sea su etiqueta</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Umbral</span>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => onThresholdChange(n)} className={segBtn(threshold === n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {(() => {
          const row = (c: typeof candidates[number], hidden: boolean) => {
            const { p, llamarCount, lastReport } = c
            const delta = p.candidateSeenCount != null ? llamarCount - p.candidateSeenCount : null
            const lastDate = lastReport ? (lastReport.fecha ?? lastReport.createdAt) : undefined
            return (
              <div
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                title={lastReport?.texto ? `Último informe (${lastReport.persona ?? '—'}): ${lastReport.texto}` : undefined}
                className={`flex items-center gap-2 px-4 py-2 border-b border-slate-50 last:border-b-0 cursor-pointer transition-colors ${
                  hidden ? 'opacity-60 hover:opacity-90 hover:bg-slate-50' : 'bg-amber-50/40 hover:bg-amber-50'
                }`}
              >
                <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">{p.fullName}</span>
                <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                  {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                </span>
                <AssessmentChip a={p.assessment} small />
                <span className="flex-1" />
                <span className="text-[10px] font-extrabold bg-amber-500 text-white rounded-full px-2 py-0.5 whitespace-nowrap">
                  {llamarCount}× Llamar
                </span>
                {!hidden && delta != null && delta > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                    +{delta} desde ocultado
                  </span>
                )}
                {lastDate && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap hidden md:inline">
                    últ. {lastReport?.persona ?? '—'} · {relativeDate(lastDate) || fmtDate(lastDate)}
                  </span>
                )}
                {isAdmin && (
                  hidden ? (
                    <button
                      onClick={e => { e.stopPropagation(); onSetCandidateSeen(p, undefined) }}
                      className="text-[10px] font-semibold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 hover:bg-white hover:text-slate-700 transition-colors"
                    >
                      Restaurar
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onSetCandidateSeen(p, llamarCount) }}
                      title="Ocultar de la bandeja (reaparece si suma informes nuevos)"
                      aria-label={`Ocultar a ${p.fullName}`}
                      className="text-slate-300 hover:text-slate-600 p-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            )
          }

          return (
            <>
              {newCandidates.length === 0 ? (
                <p className="text-xs text-slate-400 italic px-4 py-4">
                  Sin candidatos nuevos — todo revisado. Los ocultados reaparecen si suman informes «Llamar» nuevos.
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {newCandidates.map(c => row(c, false))}
                </div>
              )}
              {hiddenCandidates.length > 0 && (
                <div className="border-t border-slate-100">
                  <button
                    onClick={() => setShowHidden(v => !v)}
                    className="w-full text-left px-4 py-2 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showHidden ? '▴ Ocultar revisados' : `▾ Ver revisados (${hiddenCandidates.length})`}
                  </button>
                  {showHidden && (
                    <div className="max-h-[240px] overflow-y-auto border-t border-slate-50">
                      {hiddenCandidates.map(c => row(c, true))}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* ── b) Mapa ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">🗺️ Jugadores en {mapAssessment}</h3>
          <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-semibold">{mapPlayers.length}</span>
          {zonaFilter !== 'all' && (
            <button
              onClick={() => { setZonaFilter('all'); setSelectedCell(null) }}
              className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-100"
              title="Quitar el filtro de zona"
            >
              📍 {zonaFilter} ✕
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {/* Filtro geográfico: los clubes están agrupados por zona en src/lib/zonas.ts */}
            <select
              value={zonaFilter}
              onChange={e => { setZonaFilter(e.target.value); setSelectedCell(null) }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              title="Filtrar por zona geográfica del club"
            >
              <option value="all">📍 Todas las zonas</option>
              {ZONAS.map(z => (
                <option key={z} value={z} disabled={!conteoZonas[z]}>
                  {z} ({conteoZonas[z] ?? 0})
                </option>
              ))}
              {!!conteoZonas[SIN_ZONA] && (
                <option value={SIN_ZONA}>{SIN_ZONA} ({conteoZonas[SIN_ZONA]})</option>
              )}
            </select>
            <button
              onClick={onAbrirZonas}
              title="Cambiar la zona de un club"
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-400"
            >⚙</button>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button className={segBtn(mapView === 'matriz')} onClick={() => setMapView('matriz')}>Matriz</button>
              <button className={segBtn(mapView === 'campo')} onClick={() => setMapView('campo')}>⚽ Campograma</button>
            </div>
            {mapView === 'matriz' && (
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button className={segBtn(mapDim === 'pos')} onClick={() => { setMapDim('pos'); setSelectedCell(null) }}>× Posición</button>
                <button className={segBtn(mapDim === 'cat')} onClick={() => { setMapDim('cat'); setSelectedCell(null) }}>× Categoría</button>
              </div>
            )}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {MAP_ASSESSMENTS.map(a => (
                <button key={a} className={segBtn(mapAssessment === a)} onClick={() => { setMapAssessment(a); setSelectedCell(null) }}>{a}</button>
              ))}
            </div>
          </div>
        </div>

        {mapPlayers.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-5">
            No hay jugadores en {mapAssessment}{zonaFilter !== 'all' ? ` en ${zonaFilter}` : ''}.
          </p>
        ) : mapView === 'matriz' ? (
          <>
            <div className="p-4 overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5" />
                    {cols.map(c => (
                      <th key={c} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">{c}</th>
                    ))}
                    <th className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {genRows.map(g => {
                    const total = cols.reduce((s, c) => s + (matrix[g]?.[c]?.length ?? 0), 0)
                    return (
                      <tr key={g}>
                        <td className="px-2 py-1 text-xs font-bold text-slate-600 whitespace-nowrap">
                          {g}{g !== '—' && <span className="text-slate-400 font-medium text-[10px]"> ({new Date().getFullYear() - parseInt(g)} años)</span>}
                        </td>
                        {cols.map(c => {
                          const n = matrix[g]?.[c]?.length ?? 0
                          const isSel = selectedCell?.row === g && selectedCell?.col === c
                          if (n === 0) return <td key={c} className="p-0.5"><div className="h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-200 text-xs">·</div></td>
                          return (
                            <td key={c} className="p-0.5">
                              <button
                                onClick={() => setSelectedCell(isSel ? null : { row: g, col: c })}
                                className={`w-full h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-all border ${
                                  isSel ? 'border-amber-500 scale-105' : 'border-transparent hover:border-amber-300'
                                }`}
                                style={{ background: `rgba(245,158,11,${0.10 + 0.28 * (n / maxCell)})`, color: '#92400e' }}
                              >
                                {n}
                              </button>
                            </td>
                          )
                        })}
                        <td className="p-0.5"><div className="h-9 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500">{total}</div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {selectedCell && cellPlayers.length > 0 && (
              <div className="mx-4 mb-4 border-t border-dashed border-slate-200 pt-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  {mapAssessment} · {selectedCell.row} · {selectedCell.col}
                </p>
                <div className="space-y-0.5">
                  {cellPlayers.map(p => {
                    const last = reportsByPlayer[p.id]?.[0]
                    return (
                      <button
                        key={p.id}
                        onClick={() => onOpenPlayer(p.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left"
                      >
                        <span className="text-xs font-semibold text-slate-800">{p.fullName}</span>
                        <span className="text-[11px] text-slate-400">{p.team ?? ''}</span>
                        <span className="ml-auto text-[10px] text-slate-400">
                          {last ? `últ. informe ${fmtDate(last.fecha ?? last.createdAt)}` : 'sin informes'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-4">
            {/* Filtro de generación */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Generación</span>
              <select value={genFilter} onChange={e => setGenFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todas</option>
                {pitchGens.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Campo */}
            <div className="relative w-full max-w-[560px] mx-auto rounded-xl overflow-hidden"
              style={{ aspectRatio: '100 / 130', background: 'linear-gradient(180deg,#15803d 0%,#166534 100%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,.18)' }}>
              <svg viewBox="0 0 100 130" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
                <rect x="1" y="1" width="98" height="128" rx="2" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <line x1="1" y1="65" x2="99" y2="65" stroke="#ffffff55" strokeWidth=".7" />
                <circle cx="50" cy="65" r="10" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="24" y="109" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="38" y="121" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="24" y="1" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
                <rect x="38" y="1" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              </svg>
              {PITCH_SLOTS.map(s => {
                const pls = pitchBySlot.map[s.id] ?? []
                const isExpanded = expandedSlots.has(s.id)
                const visible = isExpanded ? pls : pls.slice(0, 3)
                const extra = pls.length - visible.length
                return (
                  <div key={s.id} className="absolute flex flex-col items-center gap-0.5 z-10" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                    <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-white text-[10px] font-extrabold tracking-wide border ${pls.length === 0 ? 'opacity-40 border-white/30 bg-white/10' : 'border-white/40 bg-white/15'}`}
                      style={{ backdropFilter: 'blur(2px)' }}>
                      {s.id}
                      {pls.length > 0 && <span className="bg-amber-500 text-[9px] text-amber-950 rounded-full px-1.5 font-extrabold">{pls.length}</span>}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      {visible.map(p => (
                        <button
                          key={p.id}
                          onClick={() => onOpenPlayer(p.id)}
                          title={`${p.fullName}${p.team ? ' · ' + p.team : ''}${p.position2 ? ' · 2ª: ' + p.position2 : ''}`}
                          className="bg-amber-50 border border-amber-200 text-amber-900 text-[9.5px] font-bold rounded-md px-1.5 py-px whitespace-nowrap shadow hover:bg-amber-100 transition-colors max-w-[130px] truncate"
                        >
                          {p.fullName.split(' ').slice(0, 2).join(' ')}
                          {p.birthdate && <span className="font-medium text-amber-600"> '{p.birthdate.slice(2, 4)}</span>}
                        </button>
                      ))}
                      {extra > 0 && (
                        <button
                          onClick={() => setExpandedSlots(prev => { const n = new Set(prev); n.add(s.id); return n })}
                          className="text-[9px] text-white/85 hover:text-white font-semibold"
                        >
                          +{extra} más
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10.5px] text-slate-400 text-center mt-2 max-w-[560px] mx-auto leading-relaxed">
              Clic en un jugador → ficha. Los jugadores con 2ª posición cuentan en la principal (la 2ª se ve al pasar el ratón).
              {pitchBySlot.unmapped > 0 && ` · ${pitchBySlot.unmapped} jugador${pitchBySlot.unmapped !== 1 ? 'es' : ''} sin posición reconocida (no se muestran)`}
            </p>
          </div>
        )}
      </div>

      {/* ── c) Movimientos ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">📈 Movimientos · últimas 3 semanas</h3>
          {staleDecidir.length > 0 && (
            <button
              onClick={() => setShowStale(v => !v)}
              className="ml-auto text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors"
            >
              ⚠️ {staleDecidir.length} en Decidir sin actividad {'>'}6 sem {showStale ? '▴' : '▾'}
            </button>
          )}
        </div>
        {showStale && staleDecidir.length > 0 && (
          <div className="px-4 py-2.5 bg-orange-50/50 border-b border-orange-100 flex flex-wrap gap-1.5">
            {staleDecidir.map(p => (
              <button
                key={p.id}
                onClick={() => onOpenPlayer(p.id)}
                className="text-[11px] font-semibold bg-white border border-orange-200 text-orange-800 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors"
              >
                {p.fullName}{p.birthdate ? ` '${p.birthdate.slice(2, 4)}` : ''}
              </button>
            ))}
          </div>
        )}
        {movements.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-5">Sin movimientos en las últimas 3 semanas.</p>
        ) : (
          <div className="px-4 py-2">
            {movements.map((m, i) => (
              <div key={i} className="flex items-baseline gap-3 py-2 border-b border-slate-50 last:border-b-0 text-xs text-slate-600">
                <span className="text-[10.5px] text-slate-400 whitespace-nowrap w-14 flex-shrink-0">
                  {new Date(m.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                {m.node}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
