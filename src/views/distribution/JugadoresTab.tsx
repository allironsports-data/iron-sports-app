import type { Dispatch, SetStateAction } from 'react'
import { Plus, Search, Users, ChevronRight, ChevronDown, Flag, List, LayoutGrid, SlidersHorizontal, X } from 'lucide-react'
import type { DistributionEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { POSITION_CODES } from '../../lib/positions'
import { contractBadge, topNegotiation, topStatus as topStatusOf } from '../../lib/distribution'
import { Avatar, FilterCheck, FilterSheet, MultiSelect } from './shared'
import { PRIORITY_CONFIG, STATUS_CONFIG, SIN_NEGOCIACIONES } from './constantes'
import type { DropPos, Priority } from './constantes'
import type { DistributionIndexes } from './useDistributionIndexes'

export type FilterSheetId = null | 'jugadores' | 'clubes' | 'solicitudes' | 'pipeline'

// ── Pestaña JUGADORES ─────────────────────────────────────────

/** Semáforo de olvido (como en Firmar): verde <15 días, ámbar 15-30, rojo >30, gris sin actividad */
function activityChip(lastNegActivity: Record<string, string>, playerId: string) {
  const last = lastNegActivity[playerId]
  if (!last) return <span className="text-[10.5px] text-slate-300">sin mov.</span>
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
  const cls = days > 30 ? 'text-red-600' : days > 14 ? 'text-amber-600' : 'text-emerald-600'
  const dot = days > 30 ? 'bg-red-500' : days > 14 ? 'bg-amber-400' : 'bg-emerald-500'
  const label = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `${days}d`
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium whitespace-nowrap ${cls}`} title={`Último movimiento de negociación hace ${days} día${days !== 1 ? 's' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export function JugadoresTab({
  search, setSearch, posFilters, setPosFilters, yearFilters, setYearFilters,
  activityFilter, setActivityFilter, hideClosed, setHideClosed, distributionYears, nCerrados,
  jugadoresTableView, setJugadoresTableView, onAddPlayer, filterSheet, setFilterSheet,
  byPriority, filteredEntries, playersById, negsByPlayer, lastNegActivity, profiles,
  selectedEntryId, setSelectedEntryId, setSelectedClubId,
  openStatusDropId, setOpenStatusDropId, setStatusDropPos,
  openManagerDropId, setOpenManagerDropId, setManagerDropPos,
}: {
  search: string
  setSearch: (v: string) => void
  posFilters: string[]
  setPosFilters: (v: string[]) => void
  yearFilters: string[]
  setYearFilters: (v: string[]) => void
  activityFilter: boolean
  setActivityFilter: (v: boolean) => void
  hideClosed: boolean
  setHideClosed: (v: boolean) => void
  distributionYears: string[]
  nCerrados: number
  jugadoresTableView: boolean
  setJugadoresTableView: Dispatch<SetStateAction<boolean>>
  onAddPlayer: () => void
  filterSheet: FilterSheetId
  setFilterSheet: (v: FilterSheetId) => void
  byPriority: Record<Priority, DistributionEntry[]>
  filteredEntries: DistributionEntry[]
  playersById: DistributionIndexes['playersById']
  negsByPlayer: DistributionIndexes['negsByPlayer']
  lastNegActivity: Record<string, string>
  profiles: Profile[]
  selectedEntryId: string | null
  setSelectedEntryId: (id: string | null) => void
  setSelectedClubId: (id: string | null) => void
  openStatusDropId: string | null
  setOpenStatusDropId: (id: string | null) => void
  setStatusDropPos: (p: DropPos | null) => void
  openManagerDropId: string | null
  setOpenManagerDropId: (id: string | null) => void
  setManagerDropPos: (p: DropPos | null) => void
}) {
  const playersActiveFilters = posFilters.length + yearFilters.length + (activityFilter ? 1 : 0) + (hideClosed ? 1 : 0)
  const playersFilterControls = (
    <>
      <MultiSelect
        label="Posición"
        options={POSITION_CODES}
        selected={posFilters}
        onChange={setPosFilters}
      />
      <MultiSelect
        label="Año nacimiento"
        options={distributionYears}
        selected={yearFilters}
        onChange={setYearFilters}
      />
      <FilterCheck label="Con actividad" checked={activityFilter} onClick={() => setActivityFilter(!activityFilter)} />
      <FilterCheck
        label={`Ocultar cerrados${nCerrados > 0 ? ` (${nCerrados})` : ''}`}
        checked={hideClosed}
        onClick={() => setHideClosed(!hideClosed)}
      />
      {playersActiveFilters > 0 && (
        <button
          onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false); setHideClosed(false) }}
          className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
        >
          <SlidersHorizontal className="w-3 h-3" />
          {playersActiveFilters} filtro{playersActiveFilters !== 1 ? 's' : ''} activo{playersActiveFilters !== 1 ? 's' : ''}
          <X className="w-3 h-3 ml-0.5 opacity-60" />
        </button>
      )}
    </>
  )
  return (
  <div className="max-w-5xl mx-auto">
    {/* Desktop: filtros inline */}
    <div className="hidden sm:flex items-center justify-between gap-2 mb-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar jugador…"
            className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {playersFilterControls}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setJugadoresTableView(v => !v)}
          title={jugadoresTableView ? 'Ver tarjetas' : 'Ver tabla'}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            jugadoresTableView
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          {jugadoresTableView
            ? <><LayoutGrid className="w-4 h-4" /> Tarjetas</>
            : <><List className="w-4 h-4" /> Tabla</>}
        </button>
        <button
          onClick={() => onAddPlayer()}
          className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Añadir jugador
        </button>
      </div>
    </div>

    {/* Móvil: barra compacta búsqueda + botón Filtros */}
    <div className="flex sm:hidden items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar jugador…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <button
        onClick={() => setFilterSheet('jugadores')}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          playersActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" /> Filtros
        {playersActiveFilters > 0 && <span className="text-xs">({playersActiveFilters})</span>}
      </button>
      <button
        onClick={() => setJugadoresTableView(v => !v)}
        title={jugadoresTableView ? 'Ver tarjetas' : 'Ver tabla'}
        aria-label={jugadoresTableView ? 'Ver tarjetas' : 'Ver tabla'}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          jugadoresTableView ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
        }`}
      >
        {jugadoresTableView ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
      </button>
    </div>

    <FilterSheet open={filterSheet === 'jugadores'} onClose={() => setFilterSheet(null)} title="Filtros de jugadores">
      {playersFilterControls}
    </FilterSheet>

    {jugadoresTableView ? (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 w-9">Pr.</th>
                <th className="px-3 py-2.5">Jugador</th>
                <th className="px-3 py-2.5">Pos.</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Contrato</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5 text-right">Clubs</th>
                <th className="px-3 py-2.5">Encargado</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {(['A', 'B', 'C', 'D'] as const).flatMap(pr => byPriority[pr]).map(entry => {
                const player = playersById.get(entry.playerId)
                if (!player) return null
                const cfg = PRIORITY_CONFIG[entry.priority]
                const negsDelJugador = negsByPlayer.get(entry.playerId) ?? []
                const negCount = negsDelJugador.length
                const hasClosed = negsDelJugador.some(n => n.status === 'cerrado')
                const topNeg = topNegotiation(negsDelJugador, true)
                const badge = contractBadge(player.clubContract?.endDate)
                return (
                  <tr
                    key={entry.id}
                    onClick={() => { setSelectedEntryId(entry.id); setSelectedClubId(null) }}
                    className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedEntryId === entry.id ? 'bg-blue-50/60' : hasClosed ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-flex w-5 h-5 rounded text-[11px] font-bold items-center justify-center ${cfg.bg} ${cfg.text}`}>
                        {entry.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <Avatar name={player.name} photo={player.photo} size="xs" />
                        <span className="font-medium text-slate-800 truncate">{player.name}</span>
                        {player.hiddenFromManagement && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Interm.</span>
                        )}
                        <span className="ml-auto flex-shrink-0">{activityChip(lastNegActivity, entry.playerId)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{player.positions[0] ?? '—'}</td>
                    <td className="px-3 py-2">
                      {entry.condition
                        ? <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">{entry.condition}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {badge
                        ? <span className={`text-xs px-1.5 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {topNeg ? (
                        <button
                          onClick={(e) => {
                            if (openStatusDropId === topNeg.id) { setOpenStatusDropId(null); setStatusDropPos(null); return }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setStatusDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                            setOpenStatusDropId(topNeg.id)
                          }}
                          title="Cambiar estado"
                          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full whitespace-nowrap transition-colors hover:brightness-95 ${STATUS_CONFIG[topNeg.status].color}`}
                        >
                          {STATUS_CONFIG[topNeg.status].label}
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">{negCount || '—'}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <button
                        title={entry.aisManager
                          ? (profiles.find(p => p.avatar === entry.aisManager)?.name ?? entry.aisManager)
                          : 'Sin encargado'}
                        onClick={e => {
                          if (openManagerDropId === entry.id) {
                            setOpenManagerDropId(null); setManagerDropPos(null); return;
                          }
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setManagerDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                          setOpenManagerDropId(entry.id);
                        }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                          entry.aisManager
                            ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                            : 'bg-slate-100 text-slate-400 border-dashed border-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        {entry.aisManager ?? '+'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
    <div className="space-y-3">
      {(['A', 'B', 'C', 'D'] as const).map(pr => {
        const group = byPriority[pr]
        if (group.length === 0) return null
        const cfg = PRIORITY_CONFIG[pr]
        return (
          <div key={pr}>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2 ${cfg.bg} ${cfg.text}`}>
              <Flag className="w-3 h-3" /> Prioridad {pr} — {group.length} jugador{group.length !== 1 ? 'es' : ''}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {group.map(entry => {
                const player = playersById.get(entry.playerId)
                if (!player) return null
                const negsDelJugador = negsByPlayer.get(entry.playerId) ?? SIN_NEGOCIACIONES
                const negCount = negsDelJugador.length
                const hasClosed = negsDelJugador.some(n => n.status === 'cerrado')
                const topStatus = topStatusOf(negsDelJugador)

                return (
                  <div
                    key={entry.id}
                    onClick={() => { setSelectedEntryId(entry.id); setSelectedClubId(null) }}
                    className={`rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5 px-3 py-2 overflow-hidden relative ${
                      selectedEntryId === entry.id ? 'border-blue-300 ring-1 ring-blue-200 bg-white'
                        : hasClosed ? 'bg-emerald-50 border-emerald-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Negotiation status bar */}
                    {topStatus && (
                      <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l ${STATUS_CONFIG[topStatus].dot}`} />
                    )}
                    <Avatar name={player.name} photo={player.photo} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-800 text-sm truncate">{player.name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{player.positions[0]}</span>
                        {player.hiddenFromManagement && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Intermediar</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {entry.condition && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{entry.condition}</span>
                        )}
                        {(() => {
                          const badge = contractBadge(player.clubContract?.endDate)
                          return badge ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          ) : null
                        })()}
                        {topStatus && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_CONFIG[topStatus].color}`}>
                            {STATUS_CONFIG[topStatus].label}
                          </span>
                        )}
                        {activityChip(lastNegActivity, entry.playerId)}
                        {negCount > 0 && (
                          <span className="text-xs text-slate-400">{negCount} club{negCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Manager badge — fixed dropdown to escape overflow:hidden */}
                    <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        title={entry.aisManager
                          ? (profiles.find(p => p.avatar === entry.aisManager)?.name ?? entry.aisManager)
                          : 'Sin encargado'}
                        onClick={e => {
                          if (openManagerDropId === entry.id) {
                            setOpenManagerDropId(null); setManagerDropPos(null); return;
                          }
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setManagerDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                          setOpenManagerDropId(entry.id);
                        }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                          entry.aisManager
                            ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                            : 'bg-slate-100 text-slate-400 border-dashed border-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        {entry.aisManager ?? '+'}
                      </button>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
    )}

    {filteredEntries.length === 0 && (
      (search || posFilters.length > 0 || yearFilters.length > 0 || activityFilter) ? (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title="Sin resultados"
          subtitle={[
            search && `búsqueda "${search}"`,
            posFilters.length > 0 && `posición: ${posFilters.join(', ')}`,
            yearFilters.length > 0 && `año: ${yearFilters.join(', ')}`,
            activityFilter && 'con actividad',
          ].filter(Boolean).join(' · ')}
          action={
            <button
              onClick={() => { setSearch(''); setPosFilters([]); setYearFilters([]); setActivityFilter(false) }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10" />}
          title="No hay jugadores en distribución"
          subtitle="Añade jugadores de la cartera para empezar a distribuirlos esta temporada."
          action={
            <button
              onClick={() => onAddPlayer()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Añadir jugador
            </button>
          }
        />
      )
    )}

    {/* FAB Añadir jugador — móvil */}
    <button
      onClick={() => onAddPlayer()}
      aria-label="Añadir jugador"
      className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
    >
      <Plus className="w-6 h-6" />
    </button>
  </div>
  )
}
