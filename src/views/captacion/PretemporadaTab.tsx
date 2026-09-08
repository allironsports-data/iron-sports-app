import React from 'react'
import { Search, X, Sun, ChevronDown, ChevronUp } from 'lucide-react'
import type { ScoutingPlayer, ScoutingAssessment, ScoutingMatch } from '../../types'
import { EmptyState } from '../../components/EmptyState'
import { type CaptacionTab, ASSESSMENT_CONFIG, ALL_ASSESSMENTS, ASSESSMENT_DOT, PRETEMPORADA_MIN_BIRTH_YEAR, SELECT_CLS, POSITIONS_SCOUTING } from './helpers'
// ── Pestaña PRETEMPORADA · jugadores jóvenes vistos en partidos de verano ──
// Los datos (pretemporadaData / pretemporadaFiltered) y los filtros viven en
// Captacion.tsx para que sobrevivan al cambio de pestaña; aquí solo se pinta.

export type PreSortKey = 'name' | 'club' | 'pos' | 'year' | 'cat' | 'matches' | 'assess'
export type PreAssessFilter = ScoutingAssessment | 'all' | 'sin'
type PretemporadaRow = { player: ScoutingPlayer; matches: ScoutingMatch[] }

export function PretemporadaTab({
  pretemporadaData, pretemporadaFiltered,
  preSearch, setPreSearch, preClubFilter, setPreClubFilter, preClubOptions, prePosFilter, setPrePosFilter,
  preCatOptions, preCatFilter, setPreCatFilter, preAssessFilter, setPreAssessFilter,
  preSortKey, preSortDir, setPreSort, setCaptTab, abrirJugador,
}: {
  pretemporadaData: { players: PretemporadaRow[]; sinFechaCount: number; matchCount: number }
  pretemporadaFiltered: PretemporadaRow[]
  preSearch: string
  setPreSearch: React.Dispatch<React.SetStateAction<string>>
  preClubFilter: string
  setPreClubFilter: React.Dispatch<React.SetStateAction<string>>
  preClubOptions: string[]
  prePosFilter: string
  setPrePosFilter: React.Dispatch<React.SetStateAction<string>>
  preCatOptions: string[]
  preCatFilter: string
  setPreCatFilter: React.Dispatch<React.SetStateAction<string>>
  preAssessFilter: PreAssessFilter
  setPreAssessFilter: React.Dispatch<React.SetStateAction<PreAssessFilter>>
  preSortKey: PreSortKey
  preSortDir: 1 | -1
  setPreSort: (key: PreSortKey) => void
  setCaptTab: (t: CaptacionTab) => void
  abrirJugador: (id: string | null, desdeEquipo?: string) => void
}) {
  const preCols: { k: typeof preSortKey; l: string }[] = [
    { k: 'name', l: 'Jugador' },
    { k: 'club', l: 'Club' },
    { k: 'pos', l: 'Posición' },
    { k: 'year', l: 'Año' },
    { k: 'cat', l: 'Categoría' },
    { k: 'matches', l: 'Partidos' },
    { k: 'assess', l: 'Estado' },
  ]
  const llamarCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Llamar').length
  const seguirCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Seguir').length
  const decidirCount = pretemporadaFiltered.filter(x => x.player.assessment === 'Decidir').length
  const sinCount = pretemporadaFiltered.filter(x => !x.player.assessment).length
  const clubCount = new Set(pretemporadaFiltered.map(x => x.player.team?.trim() || 'Sin equipo')).size
  return (
  <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
    <div>
      <h2 className="text-sm font-semibold text-slate-800">Pretemporada</h2>
      <p className="text-secondary text-slate-500">
        Jugadores nacidos en {PRETEMPORADA_MIN_BIRTH_YEAR} o después, vistos en {pretemporadaData.matchCount} partido{pretemporadaData.matchCount !== 1 ? 's' : ''} de pretemporada
      </p>
    </div>

    {pretemporadaData.sinFechaCount > 0 && (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
        {pretemporadaData.sinFechaCount} jugador{pretemporadaData.sinFechaCount !== 1 ? 'es' : ''} visto{pretemporadaData.sinFechaCount !== 1 ? 's' : ''} en pretemporada sin fecha de nacimiento registrada (no se puede confirmar si cumple el criterio de edad)
      </div>
    )}

    {pretemporadaData.players.length === 0 ? (
      <EmptyState
        icon={<Sun className="w-10 h-10" />}
        title="No hay jugadores de pretemporada aún"
        subtitle="Se mostrarán aquí los jugadores vistos en partidos marcados con competición «Pretemporada»"
      />
    ) : (
      <>
        {/* Estadísticas */}
        <div className="flex border border-slate-200 rounded-lg bg-white overflow-hidden divide-x divide-slate-200">
          {[
            ['Jugadores', pretemporadaFiltered.length],
            ['Clubes', clubCount],
            ['Llamar', llamarCount],
            ['Seguir', seguirCount],
            ['Decidir', decidirCount],
            ['Sin valorar', sinCount],
          ].map(([l, n]) => (
            <div key={l as string} className="flex-1 px-4 py-2">
              <div className="text-lg font-bold text-slate-800 leading-tight">{n}</div>
              <div className="text-badge text-slate-500">{l}</div>
            </div>
          ))}
        </div>

        {/* Filtros: todos selectores */}
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={preSearch}
              onChange={e => setPreSearch(e.target.value)}
              placeholder="Buscar jugador, club..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {preSearch && (
              <button type="button" onClick={() => setPreSearch('')} aria-label="Limpiar búsqueda" className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 inline-flex items-center justify-center text-slate-600 hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <select value={preClubFilter} onChange={e => setPreClubFilter(e.target.value)} className={SELECT_CLS}>
            <option value="all">Todos los clubes</option>
            {preClubOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={prePosFilter} onChange={e => setPrePosFilter(e.target.value)} className={SELECT_CLS}>
            <option value="all">Todas las posiciones</option>
            {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {preCatOptions.length > 0 && (
            <select value={preCatFilter} onChange={e => setPreCatFilter(e.target.value)} className={SELECT_CLS}>
              <option value="all">Todas las categorías</option>
              {preCatOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select
            value={preAssessFilter}
            onChange={e => setPreAssessFilter(e.target.value as ScoutingAssessment | 'all' | 'sin')}
            className={SELECT_CLS}
          >
            <option value="all">Todos los estados</option>
            {ALL_ASSESSMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            <option value="sin">Sin valorar</option>
          </select>
          <button
            onClick={() => { setPreSearch(''); setPreClubFilter('all'); setPrePosFilter('all'); setPreCatFilter('all'); setPreAssessFilter('all') }}
            className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors"
          >
            Limpiar filtros
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            {pretemporadaFiltered.length} de {pretemporadaData.players.length}
          </span>
        </div>

        {/* Tabla */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {preCols.map(c => (
                    <th
                      key={c.k}
                      aria-sort={preSortKey === c.k ? (preSortDir === -1 ? 'descending' : 'ascending') : 'none'}
                      className={`text-left px-1 py-1 text-meta font-semibold uppercase tracking-wide whitespace-nowrap ${preSortKey === c.k ? 'text-slate-700' : 'text-slate-500'}`}
                    >
                      <button type="button" onClick={() => setPreSort(c.k)} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:text-slate-900 hover:bg-slate-100">
                        {c.l}
                        {preSortKey === c.k && preSortDir === -1
                          ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
                          : <ChevronUp className={`w-3 h-3 ${preSortKey === c.k ? '' : 'opacity-30'}`} aria-hidden="true" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pretemporadaFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={preCols.length} className="text-center py-10 text-slate-500 text-sm">
                      No hay jugadores que coincidan con los filtros
                    </td>
                  </tr>
                ) : pretemporadaFiltered.map(({ player, matches }) => (
                  <tr
                    key={player.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir ficha de ${player.fullName}`}
                    onClick={() => { setCaptTab('jugadores'); abrirJugador(player.id) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCaptTab('jugadores'); abrirJugador(player.id) } }}
                    className="cursor-pointer hover:bg-slate-50/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{player.fullName}</td>
                    <td className="px-3 py-2 text-slate-500">{player.team || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{player.position1 ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums">{player.birthdate ? player.birthdate.slice(0, 4) : '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{player.categoria ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums">{matches.length}</td>
                    <td className="px-3 py-2">
                      {player.assessment ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ASSESSMENT_CONFIG[player.assessment].text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ASSESSMENT_DOT[player.assessment]}`} />
                          {player.assessment}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          Sin valorar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
  </div>
  )
}
