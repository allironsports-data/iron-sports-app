import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Search, List, LayoutGrid, SlidersHorizontal } from 'lucide-react'
import type { Player, DistributionEntry, ClubNegotiation } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { daysSince } from '../../lib/distribution'
import { Avatar, FilterCheck, FilterSheet } from './shared'
import { PRIORITY_CONFIG, STATUS_CONFIG } from './constantes'
import type { DistributionIndexes } from './useDistributionIndexes'
import type { FilterSheetId } from './JugadoresTab'

// ── Pestaña PIPELINE: global CRM kanban ───────────────────────

export function PipelineTab({
  negotiations, players, entries, playersById, clubsById, entriesByPlayer, currentProfile,
  pipelineSearch, setPipelineSearch, pipelinePosFilter, setPipelinePosFilter,
  pipelineGestorFilter, setPipelineGestorFilter, showClosedDeals, setShowClosedDeals,
  pipelineMyOnly, setPipelineMyOnly, pipelineListView, setPipelineListView,
  isMobile, filterSheet, setFilterSheet, onEditNegotiation,
}: {
  negotiations: ClubNegotiation[]
  players: Player[]
  entries: DistributionEntry[]
  playersById: DistributionIndexes['playersById']
  clubsById: DistributionIndexes['clubsById']
  entriesByPlayer: DistributionIndexes['entriesByPlayer']
  currentProfile: Profile
  pipelineSearch: string
  setPipelineSearch: (v: string) => void
  pipelinePosFilter: string
  setPipelinePosFilter: (v: string) => void
  pipelineGestorFilter: string
  setPipelineGestorFilter: (v: string) => void
  showClosedDeals: boolean
  setShowClosedDeals: Dispatch<SetStateAction<boolean>>
  pipelineMyOnly: boolean
  setPipelineMyOnly: Dispatch<SetStateAction<boolean>>
  pipelineListView: boolean
  setPipelineListView: Dispatch<SetStateAction<boolean>>
  isMobile: boolean
  filterSheet: FilterSheetId
  setFilterSheet: (v: FilterSheetId) => void
  onEditNegotiation: (n: ClubNegotiation) => void
}) {
  const setEditingNeg = onEditNegotiation

  // Collect all gestores for filter dropdown
  const allGestores = useMemo(
    () => Array.from(new Set(negotiations.map(n => n.aisManager).filter((m): m is string => !!m))).sort((a, b) => a.localeCompare(b, 'es')),
    [negotiations],
  )

  // All positions from distribution players
  const distPlayerIds = useMemo(() => new Set(entries.map(e => e.playerId)), [entries])
  const allPositions = useMemo(
    () => Array.from(new Set(players.filter(p => distPlayerIds.has(p.id)).flatMap(p => p.positions))).sort((a, b) => a.localeCompare(b, 'es')),
    [players, distPlayerIds],
  )

  // Build enriched deals, applying filters
  // Los .find() por negociación recorrían players/clubs/entries
  // enteros en cada tecla del buscador: con índices es O(1) por fila
  const deals = useMemo(() => {
    // El buscador se pasaba a minúsculas DENTRO del filtro: una vez por
    // negociación (miles) y por cada tecla.
    const qPipeline = pipelineSearch.toLowerCase()
    return negotiations
      .map(neg => ({
        neg,
        player: playersById.get(neg.playerId),
        club: clubsById.get(neg.clubId),
        entry: entriesByPlayer.get(neg.playerId),
      }))
      .filter(({ player, club, neg }) => {
        if (!player || !club) return false
        if (!distPlayerIds.has(player.id)) return false
        if (pipelineMyOnly && neg.aisManager !== currentProfile.avatar) return false
        if (qPipeline && !player.name.toLowerCase().includes(qPipeline)) return false
        if (pipelinePosFilter && !player.positions.some(p => p === pipelinePosFilter)) return false
        if (!pipelineMyOnly && pipelineGestorFilter && neg.aisManager !== pipelineGestorFilter) return false
        return true
      })
  }, [negotiations, playersById, clubsById, entriesByPlayer, distPlayerIds, pipelineMyOnly, currentProfile.avatar, pipelineSearch, pipelinePosFilter, pipelineGestorFilter])

  const activeStatuses: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
  const closedStatuses: ClubNegotiation['status'][] = ['cerrado', 'descartado']
  const visibleStatuses = showClosedDeals ? [...activeStatuses, ...closedStatuses] : activeStatuses

  const totalActive = deals.filter(d => activeStatuses.includes(d.neg.status)).length
  const totalClosed = deals.filter(d => closedStatuses.includes(d.neg.status)).length

  const pipelineActiveFilters = (pipelineMyOnly ? 1 : 0) + (pipelinePosFilter ? 1 : 0) + (pipelineGestorFilter ? 1 : 0) + (showClosedDeals ? 1 : 0)
  // Un solo bloque de controles de filtro, reutilizado en escritorio (barra
  // superior) y en móvil (bottom-sheet), como en Jugadores/Clubes/Solicitudes.
  const pipelineFilterControls = (
    <>
      <FilterCheck
        label={pipelineMyOnly ? `Mis negs (${deals.length})` : 'Mis negs'}
        checked={pipelineMyOnly}
        onClick={() => { setPipelineMyOnly(v => !v); setPipelineGestorFilter('') }}
      />
      <select
        value={pipelinePosFilter}
        onChange={e => setPipelinePosFilter(e.target.value)}
        className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
      >
        <option value="">Todas las posiciones</option>
        {allPositions.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {!pipelineMyOnly && allGestores.length > 0 && (
        <select
          value={pipelineGestorFilter}
          onChange={e => setPipelineGestorFilter(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
        >
          <option value="">Todos los gestores</option>
          {allGestores.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      )}
      <FilterCheck label="Ver cerrados" checked={showClosedDeals} onClick={() => setShowClosedDeals(v => !v)} />
    </>
  )
  // En móvil siempre vista lista; el kanban es inusable a 375px
  const usingListView = isMobile || pipelineListView
  return (
    <div className="-mx-4 -mb-4">
      {/* Desktop: Filter bar inline */}
      <div className="hidden sm:flex items-center gap-2 flex-wrap px-4 py-3 bg-white border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={pipelineSearch}
            onChange={e => setPipelineSearch(e.target.value)}
            placeholder="Jugador…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 w-36"
          />
        </div>

        <div className="w-px h-5 bg-slate-200" />

        {pipelineFilterControls}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{totalActive} activos · {totalClosed} cerrados</span>
          {/* Lista / Kanban toggle — oculto en móvil */}
          <button
            onClick={() => setPipelineListView(v => !v)}
            title={pipelineListView ? 'Ver kanban' : 'Ver lista'}
            className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              pipelineListView
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            {pipelineListView
              ? <><LayoutGrid className="w-3.5 h-3.5" /> Kanban</>
              : <><List className="w-3.5 h-3.5" /> Lista</>}
          </button>
        </div>
      </div>

      {/* Móvil: barra compacta búsqueda + Filtros */}
      <div className="flex sm:hidden items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={pipelineSearch}
            onChange={e => setPipelineSearch(e.target.value)}
            placeholder="Jugador…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button
          onClick={() => setFilterSheet('pipeline')}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            pipelineActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" /> Filtros
          {pipelineActiveFilters > 0 && <span className="text-xs">({pipelineActiveFilters})</span>}
        </button>
      </div>

      <FilterSheet open={filterSheet === 'pipeline'} onClose={() => setFilterSheet(null)} title="Filtros de pipeline">
        {pipelineFilterControls}
        <p className="text-xs text-slate-400">{totalActive} activos · {totalClosed} cerrados</p>
      </FilterSheet>

      {/* ── VISTA LISTA ── */}
      {usingListView ? (
        <div className="max-w-5xl mx-auto p-4">
          {visibleStatuses.map(status => {
            const col = deals.filter(d => d.neg.status === status)
            if (col.length === 0) return null
            const cfg = STATUS_CONFIG[status]
            return (
              <div key={status} className="mb-6">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2 w-fit ${cfg.color}`}>
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-xs font-semibold">{cfg.label}</span>
                  <span className="text-xs opacity-60 font-mono">{col.length}</span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {col.map(({ neg, player, club, entry }, i) => {
                    if (!player || !club) return null
                    const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                    const stale = activeStatuses.includes(neg.status) && daysSince(neg.updatedAt) > 7
                    const daysAgo = daysSince(neg.updatedAt)
                    return (
                      <div
                        key={neg.id}
                        onClick={() => setEditingNeg(neg)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${i > 0 ? 'border-t border-slate-100' : ''} ${stale ? 'border-l-4 border-l-orange-400' : ''}`}
                      >
                        <Avatar name={player.name} photo={player.photo} size="xs" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-800">{player.name}</span>
                          <span className="text-xs text-slate-400 ml-2">{player.positions[0]}</span>
                        </div>
                        <div className="text-sm text-slate-600 truncate w-24 sm:w-36 flex-shrink-0">{club.name}</div>
                        {neg.aisManager && (
                          <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{neg.aisManager}</span>
                        )}
                        {pcfg && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>
                        )}
                        <div className="text-right flex-shrink-0 w-20">
                          <span className={`text-[11px] ${stale ? 'text-orange-500 font-semibold' : 'text-slate-400'}`}>
                            {stale ? `⏰ ${daysAgo}d` : daysAgo < 999 ? `${daysAgo}d` : '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {deals.filter(d => visibleStatuses.includes(d.neg.status)).length === 0 && (
            <div className="text-center text-sm text-slate-400 py-16">No hay negociaciones</div>
          )}
        </div>
      ) : (
        /* ── VISTA KANBAN ── */
        <div className="overflow-x-auto">
          <div className="flex gap-3 p-4 min-w-max">
            {visibleStatuses.map(status => {
              const col = deals.filter(d => d.neg.status === status)
              const cfg = STATUS_CONFIG[status]
              return (
                <div key={status} className="w-60 flex-shrink-0">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${cfg.color}`}>
                    <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className="text-xs font-semibold">{cfg.label}</span>
                    <span className="ml-auto text-xs opacity-60 font-mono">{col.length}</span>
                  </div>
                  {/* Cards */}
                  <div className="space-y-2">
                    {col.map(({ neg, player, club, entry }) => {
                      if (!player || !club) return null
                      const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                      const stale = activeStatuses.includes(neg.status) && daysSince(neg.updatedAt) > 7
                      return (
                        <div
                          key={neg.id}
                          onClick={() => setEditingNeg(neg)}
                          className={`bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${
                            stale ? 'border-orange-300 border-l-4 border-l-orange-400' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Player row */}
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar name={player.name} photo={player.photo} size="xs" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-slate-800 truncate">{player.name}</div>
                              <div className="text-[11px] text-slate-400">{player.positions[0]}</div>
                            </div>
                            {pcfg && (
                              <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>
                                {entry?.priority}
                              </span>
                            )}
                          </div>
                          {/* Club row */}
                          <div className="border-t border-slate-100 pt-2">
                            <div className="text-sm font-medium text-slate-700 truncate">{club.name}</div>
                            {club.league && <div className="text-xs text-slate-400">{club.league}</div>}
                          </div>
                          {/* Meta */}
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {neg.aisManager && (
                              <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                {neg.aisManager}
                              </span>
                            )}
                            {stale && (
                              <span className="text-[11px] text-orange-500 font-semibold">⏰ {daysSince(neg.updatedAt)}d sin cambios</span>
                            )}
                            {neg.notes && !stale && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 w-full">{neg.notes}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {col.length === 0 && (
                      <div className="h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                        Vacío
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
