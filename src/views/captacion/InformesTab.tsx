import React from 'react'
import { FileText, Users } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { BotonCsv } from '../../components/BotonCsv'
import { type CaptacionTab, SELECT_CLS, normConclusion, CONCLUSION_STYLE, personaToName, fmtDate, relativeDate } from './helpers'
// ── Pestaña INFORMES RECIENTES · ranking por explorador + últimos informes ──

export function InformesTab({
  reportsByPersonaRanked, profiles, recentReports, playersById, scoutingMatches,
  reportPersonas, reportPersonaFilter, setReportPersonaFilter, setCaptTab, abrirJugador,
}: {
  reportsByPersonaRanked: [string, number][]
  profiles: Profile[]
  recentReports: ScoutingReport[]
  playersById: Map<string, ScoutingPlayer>
  scoutingMatches: ScoutingMatch[]
  reportPersonas: string[]
  reportPersonaFilter: string
  setReportPersonaFilter: React.Dispatch<React.SetStateAction<string>>
  setCaptTab: React.Dispatch<React.SetStateAction<CaptacionTab>>
  abrirJugador: (id: string | null, desdeEquipo?: string) => void
}) {
  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
      {/* Per-author stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" /> Informes por explorador
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {reportsByPersonaRanked.map(([persona, count]) => {
            const name = personaToName(persona, profiles)
            return (
              <div key={persona} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-slate-800">{count}</div>
                <div className="text-[11px] font-mono font-semibold text-slate-600">{persona}</div>
                {name && name !== persona && (
                  <div className="text-[11px] text-slate-400 truncate">{name}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent reports list */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Últimos informes ({recentReports.length})
          </h3>
          <BotonCsv
            nombre="informes-captacion"
            cabeceras={['Fecha', 'Jugador', 'Equipo', 'Scout', 'Conclusión', 'Partido', 'Texto']}
            filas={() => recentReports.map(r => {
              const p = playersById.get(r.playerId)
              const m = r.matchId ? scoutingMatches.find(x => x.id === r.matchId) : undefined
              return [
                (r.fecha ?? r.createdAt ?? '').slice(0, 10),
                p?.fullName ?? '', p?.team ?? '',
                personaToName(r.persona, profiles) || r.persona || '',
                normConclusion(r.conclusion) ?? '',
                m ? `${m.homeTeam} - ${m.awayTeam}` : '',
                r.texto ?? '',
              ]
            })}
          />
          {/* Persona filter */}
          {reportPersonas.length > 0 && (
            <select
              value={reportPersonaFilter}
              onChange={e => setReportPersonaFilter(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="all">Todos los scouts</option>
              {reportPersonas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
        <div className="space-y-2">
          {recentReports.map(r => {
            const player = playersById.get(r.playerId)
            const rel = relativeDate(r.fecha)
            return (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all"
                onClick={() => { setCaptTab('jugadores'); abrirJugador(r.playerId) }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-semibold text-slate-800 text-sm">{player?.fullName ?? '—'}</span>
                      {player?.position1 && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{player.position1}</span>}
                      {normConclusion(r.conclusion) && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${CONCLUSION_STYLE[normConclusion(r.conclusion)!] ?? 'bg-slate-100 text-slate-600'}`}>
                          {normConclusion(r.conclusion)}
                        </span>
                      )}
                    </div>
                    {r.titulo && <div className="text-xs font-medium text-slate-600 mb-0.5">{r.titulo}</div>}
                    {r.texto && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{r.texto}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right min-w-[72px]">
                    <div className="flex flex-col items-end gap-0.5">
                      {rel && (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${rel === 'hoy' ? 'bg-green-100 text-green-700' : rel === 'ayer' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                          {rel}
                        </span>
                      )}
                      <div className="text-[11px] text-slate-400">{fmtDate(r.fecha)}</div>
                      {r.persona && (
                        <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{r.persona}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {recentReports.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">Sin informes de {reportPersonaFilter !== 'all' ? reportPersonaFilter : 'ningún explorador'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
