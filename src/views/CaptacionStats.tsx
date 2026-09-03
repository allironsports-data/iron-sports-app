import { useMemo, useState } from 'react'
import { ClipboardList, Users, PenLine, UserSearch, Brain } from 'lucide-react'
import { ScoutStats } from './ScoutStats'
import { ModeloLlamar } from './ModeloLlamar'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch, FirmasEntry, FirmasStatus } from '../types'
import type { Profile } from '../contexts/AuthContext'

// ── Estadísticas de Captación (antes pestaña dentro de Captación,
//    ahora sección interna del panel de administración) ────────

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// «Firmar» se unificó con «Llamar» (ver migration_merge_firmar_llamar.sql)
function normConclusion(c?: string): string | undefined {
  return c === 'Firmar' ? 'Llamar' : c || undefined
}

function personaToName(persona: string | undefined, profiles: Profile[]): string {
  if (!persona) return '—'
  const p = profiles.find(pr => pr.avatar === persona)
  return p ? p.name : persona
}

function StatBar({ label, value, max, color = 'bg-blue-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-24 flex-shrink-0 text-slate-600 truncate">{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right text-slate-500 font-medium">{value}</div>
    </div>
  )
}

const FIRMAS_STATUSES: FirmasStatus[] = ['llamar', 'caliente', 'templado', 'frio', 'decidir', 'firmado']
const FIRMAS_LABEL: Record<FirmasStatus, string> = { llamar: 'Llamar', caliente: 'Caliente', templado: 'Templado', frio: 'Frío', decidir: 'Decidir', firmado: 'Firmado' }
const FIRMAS_BAR: Record<FirmasStatus, string> = { llamar: 'bg-amber-400', caliente: 'bg-red-500', templado: 'bg-yellow-400', frio: 'bg-sky-400', decidir: 'bg-violet-400', firmado: 'bg-green-500' }

// Cadencia máxima por estatus (misma regla que el semáforo de la pestaña Firmar)
const FIRMAS_AGING_DAYS: Partial<Record<FirmasStatus, number>> = { caliente: 10, templado: 50, frio: 90 }

interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  firmasEntries: FirmasEntry[]
  profiles: Profile[]
}

export function CaptacionStats({ scoutingPlayers, scoutingReports, scoutingMatches, firmasEntries, profiles }: Props) {
  const [statsTab, setStatsTab] = useState<'general' | 'scouts' | 'modelo'>('general')
  // ── statistics ──
  const stats = useMemo(() => {
    // Índice por id: evita un `find` lineal por cada informe
    const byId = new Map(scoutingPlayers.map(p => [p.id, p]))
    // Reports per persona
    const byPersona: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const k = r.persona ?? '—'
      byPersona[k] = (byPersona[k] ?? 0) + 1
    })
    const personaRanked = Object.entries(byPersona).sort((a, b) => b[1] - a[1])

    // Conclusions («Firmar» legado se cuenta como «Llamar»)
    const byConclusion: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const k = normConclusion(r.conclusion) ?? 'Sin conclusión'
      byConclusion[k] = (byConclusion[k] ?? 0) + 1
    })

    // Assessment distribution (players)
    const byAssessment: Record<string, number> = {}
    scoutingPlayers.forEach(p => {
      const k = p.assessment ?? 'Sin valorar'
      byAssessment[k] = (byAssessment[k] ?? 0) + 1
    })

    // Positions most scouted (from player position1)
    const byPosition: Record<string, number> = {}
    scoutingReports.forEach(r => {
      const p = byId.get(r.playerId)
      const pos = p?.position1 ?? '—'
      byPosition[pos] = (byPosition[pos] ?? 0) + 1
    })
    const positionRanked = Object.entries(byPosition).sort((a, b) => b[1] - a[1]).slice(0, 8)

    // Monthly activity last 12 months
    const now = new Date()
    const months: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS_ES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
      const count = scoutingReports.filter(r => (r.fecha ?? r.createdAt).startsWith(key)).length
      months.push({ label, count })
    }

    // Players with most reports
    const reportsByPlayer: Record<string, number> = {}
    scoutingReports.forEach(r => { reportsByPlayer[r.playerId] = (reportsByPlayer[r.playerId] ?? 0) + 1 })
    const topPlayers = Object.entries(reportsByPlayer)
      .sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([id, count]) => ({ id, name: byId.get(id)?.fullName ?? id, count }))

    return { byPersona, personaRanked, byConclusion, byAssessment, positionRanked, months, topPlayers }
  }, [scoutingReports, scoutingPlayers])

  // ── match statistics ──

  const matchStats = useMemo(() => {
    // Partidos por persona
    const byPersona: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      const k = m.assignedTo ?? '—'
      byPersona[k] = (byPersona[k] ?? 0) + 1
    })
    const personaRanked = Object.entries(byPersona).sort((a, b) => b[1] - a[1])

    // Vídeo vs campo
    let video = 0, campo = 0
    scoutingMatches.forEach(m => { if (m.viewMode === 'campo') campo++; else video++ })

    // Vistos vs pendientes
    const visto = scoutingMatches.filter(m => m.status === 'visto').length
    const pendiente = scoutingMatches.length - visto

    // Competiciones más vistas
    const byCompetition: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      const k = m.competition ?? 'Sin categoría'
      byCompetition[k] = (byCompetition[k] ?? 0) + 1
    })
    const competitionRanked = Object.entries(byCompetition).sort((a, b) => b[1] - a[1]).slice(0, 10)

    // Equipos más vistos (local + visitante)
    const byTeam: Record<string, number> = {}
    scoutingMatches.forEach(m => {
      byTeam[m.homeTeam] = (byTeam[m.homeTeam] ?? 0) + 1
      byTeam[m.awayTeam] = (byTeam[m.awayTeam] ?? 0) + 1
    })
    const teamRanked = Object.entries(byTeam).sort((a, b) => b[1] - a[1]).slice(0, 15)

    // Actividad mensual de partidos (últimos 12 meses)
    const now = new Date()
    const matchMonths: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS_ES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
      const count = scoutingMatches.filter(m => m.date.startsWith(key)).length
      matchMonths.push({ label, count })
    }

    // Pendientes por persona
    const pendienteByPersona: Record<string, number> = {}
    scoutingMatches.filter(m => m.status !== 'visto' && m.assignedTo).forEach(m => {
      const k = m.assignedTo!
      pendienteByPersona[k] = (pendienteByPersona[k] ?? 0) + 1
    })

    return { byPersona, personaRanked, video, campo, visto, pendiente, competitionRanked, teamRanked, matchMonths, pendienteByPersona }
  }, [scoutingMatches])

  // ── extras: actividad reciente ──
  const last30 = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    return {
      reports: scoutingReports.filter(r => (r.fecha ?? r.createdAt) >= cutoff).length,
      players: scoutingPlayers.filter(p => p.createdAt >= cutoff).length,
      matches: scoutingMatches.filter(m => m.createdAt >= cutoff).length,
    }
  }, [scoutingReports, scoutingPlayers, scoutingMatches])

  // ── pipeline de firmas ──
  const firmasStats = useMemo(() => {
    const byStatus: Record<FirmasStatus, number> = { llamar: 0, caliente: 0, templado: 0, frio: 0, decidir: 0, firmado: 0 }
    const byZone: Record<string, { activos: number; firmados: number }> = {}
    const byManager: Record<string, number> = {}
    let stale = 0, linked = 0
    firmasEntries.forEach(e => {
      byStatus[e.status]++
      const z = (byZone[e.zone] ??= { activos: 0, firmados: 0 })
      if (e.status === 'firmado') z.firmados++; else z.activos++
      e.managers.forEach(m => { byManager[m] = (byManager[m] ?? 0) + 1 })
      if (e.scoutingPlayerId) linked++
      // desatendido según la cadencia del estatus (caliente 10d, templado 50d, frío 90d)
      const limit = FIRMAS_AGING_DAYS[e.status]
      if (limit) {
        const lastTouch = [e.updatedAt, e.statusUpdatedAt, e.createdAt, ...e.comments.map(c => c.date)].filter(Boolean).sort().pop()
        const days = lastTouch ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000) : Infinity
        if (days > limit) stale++
      }
    })
    const zoneRanked = Object.entries(byZone).sort((a, b) => (b[1].activos + b[1].firmados) - (a[1].activos + a[1].firmados))
    const managerRanked = Object.entries(byManager)
      .map(([id, n]) => [profiles.find(p => p.id === id)?.name ?? '—', n, id] as [string, number, string])
      .sort((a, b) => b[1] - a[1])
    const total = firmasEntries.length
    const firmados = byStatus.firmado
    return { byStatus, zoneRanked, managerRanked, stale, linked, total, firmados, conversion: total > 0 ? firmados / total : 0 }
  }, [firmasEntries, profiles])

  return (
    <div className="space-y-4">
      {/* Pestañas: visión general / análisis por scout */}
      <div className="flex items-center gap-1">
        {([
          { id: 'general' as const, label: 'Visión general', icon: <ClipboardList className="w-3.5 h-3.5" /> },
          { id: 'scouts' as const, label: 'Scouts', icon: <UserSearch className="w-3.5 h-3.5" /> },
          { id: 'modelo' as const, label: 'Modelo de Llamar', icon: <Brain className="w-3.5 h-3.5" /> },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setStatsTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statsTab === t.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {statsTab === 'modelo' && (
        <ModeloLlamar
          scoutingPlayers={scoutingPlayers}
          scoutingReports={scoutingReports}
          profiles={profiles}
        />
      )}

      {statsTab === 'scouts' && (
        <ScoutStats
          scoutingPlayers={scoutingPlayers}
          scoutingReports={scoutingReports}
          scoutingMatches={scoutingMatches}
          firmasEntries={firmasEntries}
          profiles={profiles}
        />
      )}

      {statsTab === 'general' && (<>
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total informes', value: scoutingReports.length },
              { label: 'Total jugadores', value: scoutingPlayers.length },
              { label: 'Exploradores activos', value: stats.personaRanked.length },
              { label: 'Partidos vistos', value: scoutingMatches.length },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reports by author */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Informes por explorador</h3>
              <div className="space-y-2">
                {stats.personaRanked.slice(0, 8).map(([persona, count]) => {
                  const name = personaToName(persona, profiles)
                  return (
                    <StatBar
                      key={persona}
                      label={name && name !== persona ? `${persona} · ${name.split(' ')[0]}` : persona}
                      value={count}
                      max={stats.personaRanked[0]?.[1] ?? 1}
                      color="bg-blue-500"
                    />
                  )
                })}
              </div>
            </div>

            {/* Conclusions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Distribución de conclusiones</h3>
              <div className="space-y-2">
                {Object.entries(stats.byConclusion)
                  .sort((a, b) => b[1] - a[1])
                  .map(([conclusion, count]) => (
                    <StatBar
                      key={conclusion}
                      label={conclusion}
                      value={count}
                      max={Math.max(...Object.values(stats.byConclusion))}
                      color={
                        conclusion === 'Seguir' ? 'bg-blue-500' :
                        conclusion === 'Firmar' || conclusion === 'Llamar' ? 'bg-green-500' :
                        conclusion === 'Descartar' ? 'bg-red-400' :
                        'bg-slate-300'
                      }
                    />
                  ))}
              </div>
            </div>

            {/* Positions most scouted */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Posiciones más vistas</h3>
              <div className="space-y-2">
                {stats.positionRanked.map(([pos, count]) => (
                  <StatBar
                    key={pos}
                    label={pos}
                    value={count}
                    max={stats.positionRanked[0]?.[1] ?? 1}
                    color="bg-violet-500"
                  />
                ))}
              </div>
            </div>

            {/* Assessment distribution */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Assessment de jugadores</h3>
              <div className="space-y-2">
                {Object.entries(stats.byAssessment)
                  .sort((a, b) => b[1] - a[1])
                  .map(([assessment, count]) => (
                    <StatBar
                      key={assessment}
                      label={assessment}
                      value={count}
                      max={Math.max(...Object.values(stats.byAssessment))}
                      color={
                        assessment === 'Llamar' ? 'bg-amber-400' :
                        assessment === 'Seguir' ? 'bg-blue-500' :
                        assessment === 'Basque' ? 'bg-violet-500' :
                        assessment === 'Visto' ? 'bg-slate-400' :
                        assessment === 'Descartado' ? 'bg-red-400' :
                        'bg-orange-400'
                      }
                    />
                  ))}
              </div>
            </div>

            {/* Monthly trend */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Actividad mensual (últimos 12 meses)</h3>
              <div className="overflow-x-auto scrollbar-none">
              <div className="flex items-end gap-1 h-24 min-w-[440px]">
                {stats.months.map(({ label, count }) => {
                  const maxCount = Math.max(...stats.months.map(m => m.count), 1)
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px] text-slate-500 font-medium">{count || ''}</div>
                      <div className="w-full bg-slate-100 rounded-t" style={{ height: '60px' }}>
                        <div
                          className="w-full bg-primary rounded-t transition-all"
                          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-400 whitespace-nowrap">{label}</div>
                    </div>
                  )
                })}
              </div>
              </div>
            </div>

            {/* Top players by reports */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Jugadores más seguidos
                <span className="ml-2 text-xs font-normal text-slate-400">top {stats.topPlayers.length}</span>
              </h3>
              <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                {stats.topPlayers.map(({ id, name, count }) => (
                  <StatBar
                    key={id}
                    label={name}
                    value={count}
                    max={stats.topPlayers[0]?.count ?? 1}
                    color="bg-emerald-500"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── ESTADÍSTICAS DE PARTIDOS ── */}
          <div className="mt-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" /> Estadísticas de partidos
            </h2>
            {scoutingMatches.length === 0 ? (
              <p className="text-xs text-slate-400">No hay partidos registrados aún.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                {/* KPIs rápidos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2 xl:col-span-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    {[
                      { label: 'Total partidos', value: scoutingMatches.length, color: 'text-slate-800' },
                      { label: 'Vistos', value: matchStats.visto, color: 'text-emerald-600' },
                      { label: 'Pendientes', value: matchStats.pendiente, color: 'text-amber-600' },
                      { label: 'En campo', value: matchStats.campo, color: 'text-violet-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className={`text-2xl font-bold ${color}`}>{value}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Partidos por scout */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" /> Partidos por explorador
                  </h3>
                  <div className="space-y-2">
                    {matchStats.personaRanked.map(([persona, count]) => {
                      const name = personaToName(persona, profiles)
                      return (
                        <StatBar
                          key={persona}
                          label={name && name !== persona ? `${persona} · ${name.split(' ')[0]}` : persona}
                          value={count}
                          max={matchStats.personaRanked[0]?.[1] ?? 1}
                          color="bg-blue-500"
                        />
                      )
                    })}
                  </div>
                  {/* Pendientes por persona */}
                  {Object.keys(matchStats.pendienteByPersona).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-amber-600 uppercase mb-2">Pendientes de ver</div>
                      {Object.entries(matchStats.pendienteByPersona).map(([persona, count]) => (
                        <StatBar
                          key={persona}
                          label={persona}
                          value={count}
                          max={Math.max(...Object.values(matchStats.pendienteByPersona))}
                          color="bg-amber-400"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Vídeo vs Campo */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Modo de visualización</h3>
                  <div className="space-y-2">
                    <StatBar label="📹 Vídeo" value={matchStats.video} max={scoutingMatches.length} color="bg-blue-400" />
                    <StatBar label="🏟️ Campo" value={matchStats.campo} max={scoutingMatches.length} color="bg-emerald-500" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {matchStats.video > 0 && (
                      <div className="flex-1 text-center bg-blue-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-blue-700">{Math.round((matchStats.video / scoutingMatches.length) * 100)}%</div>
                        <div className="text-[11px] text-blue-500">vídeo</div>
                      </div>
                    )}
                    {matchStats.campo > 0 && (
                      <div className="flex-1 text-center bg-emerald-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-emerald-700">{Math.round((matchStats.campo / scoutingMatches.length) * 100)}%</div>
                        <div className="text-[11px] text-emerald-500">campo</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Competiciones más vistas */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Competiciones más vistas</h3>
                  <div className="space-y-2">
                    {matchStats.competitionRanked.map(([comp, count]) => (
                      <StatBar
                        key={comp}
                        label={comp}
                        value={count}
                        max={matchStats.competitionRanked[0]?.[1] ?? 1}
                        color="bg-violet-500"
                      />
                    ))}
                  </div>
                </div>

                {/* Equipos más vistos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Equipos más vistos</h3>
                  <div className="overflow-y-auto max-h-64 space-y-2 pr-1">
                    {matchStats.teamRanked.map(([team, count]) => (
                      <StatBar
                        key={team}
                        label={team}
                        value={count}
                        max={matchStats.teamRanked[0]?.[1] ?? 1}
                        color="bg-orange-400"
                      />
                    ))}
                  </div>
                </div>

                {/* Actividad mensual de partidos */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Partidos por mes (últimos 12 meses)</h3>
                  <div className="overflow-x-auto scrollbar-none">
                  <div className="flex items-end gap-1 h-24 min-w-[440px]">
                    {matchStats.matchMonths.map(({ label, count }) => {
                      const maxCount = Math.max(...matchStats.matchMonths.map(m => m.count), 1)
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={label} className="flex-1 flex flex-col items-center gap-1">
                          <div className="text-[9px] text-slate-500 font-medium">{count || ''}</div>
                          <div className="w-full bg-slate-100 rounded-t" style={{ height: '60px' }}>
                            <div
                              className="w-full bg-orange-400 rounded-t transition-all"
                              style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                            />
                          </div>
                          <div className="text-[9px] text-slate-400 whitespace-nowrap">{label}</div>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

      {/* ── PIPELINE DE FIRMAS ── */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-slate-400" /> Pipeline de firmas
        </h2>
        {firmasEntries.length === 0 ? (
          <p className="text-xs text-slate-400">No hay jugadores en el pipeline aún.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
                {[
                  { label: 'En pipeline', value: firmasStats.total - firmasStats.firmados, color: 'text-slate-800' },
                  { label: 'Firmados 🎉', value: firmasStats.firmados, color: 'text-green-600' },
                  { label: 'Conversión', value: `${Math.round(firmasStats.conversion * 100)}%`, color: 'text-green-600' },
                  { label: 'Vinculados', value: firmasStats.linked, color: 'text-blue-600' },
                  { label: 'Calientes', value: firmasStats.byStatus.caliente, color: 'text-red-600' },
                  { label: 'Desatendidos', value: firmasStats.stale, color: 'text-amber-600' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400 text-center">Desatendidos: calientes sin tocar +10 días, templados +50, fríos +90</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Por estatus</h3>
              <div className="space-y-2">
                {FIRMAS_STATUSES.map(s => (
                  <StatBar
                    key={s}
                    label={FIRMAS_LABEL[s]}
                    value={firmasStats.byStatus[s]}
                    max={Math.max(...FIRMAS_STATUSES.map(x => firmasStats.byStatus[x]), 1)}
                    color={FIRMAS_BAR[s]}
                  />
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Por zona (activos · firmados · conversión)</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1 font-semibold">Zona</th>
                    <th className="text-right py-1 font-semibold">Activos</th>
                    <th className="text-right py-1 font-semibold">Firmados</th>
                    <th className="text-right py-1 font-semibold">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {firmasStats.zoneRanked.map(([zone, z]) => {
                    const tot = z.activos + z.firmados
                    return (
                      <tr key={zone}>
                        <td className="py-1.5 text-slate-700 truncate max-w-[160px]">{zone}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{z.activos}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-green-600">{z.firmados || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">{tot > 0 && z.firmados > 0 ? `${Math.round(z.firmados / tot * 100)}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Jugadores por encargado
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {firmasStats.managerRanked.map(([name, count, id]) => (
                  <StatBar key={id} label={name} value={count} max={firmasStats.managerRanked[0]?.[1] ?? 1} color="bg-blue-500" />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── ACTIVIDAD ÚLTIMOS 30 DÍAS ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Últimos 30 días</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Informes nuevos', value: last30.reports, color: 'text-blue-600' },
            { label: 'Jugadores añadidos', value: last30.players, color: 'text-emerald-600' },
            { label: 'Partidos añadidos', value: last30.matches, color: 'text-violet-600' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}
