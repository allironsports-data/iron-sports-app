import type { Dispatch, SetStateAction } from 'react'
import { Plus, Search, X, Pencil, AlertCircle, ChevronRight, SlidersHorizontal } from 'lucide-react'
import type { Club, ClubNeed } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { positionEs } from '../../lib/positions'
import { TIER_CONFIG, getClubTier } from '../../lib/clubTiers'
import type { LeagueTier } from '../../lib/clubTiers'
import { FilterSheet, MultiSelect } from './shared'
import { NeedFormInline } from './modales'
import type { FilterSheetId } from './JugadoresTab'

export type NeedsSort = 'recent' | 'club'
export type SelectedNeed = { clubId: string; needIndex: number }
export type EditingNeed = { clubId: string; index: number }

// ── Pestaña SOLICITUDES ───────────────────────────────────────

export function SolicitudesTab({
  search, setSearch,
  needsTierFilter, setNeedsTierFilter, needsLeagueFilter, setNeedsLeagueFilter,
  needsAgeFilter, setNeedsAgeFilter, positionFilter, setPositionFilter, needsSort, setNeedsSort,
  needsLeagues, allNeedsPositions, clubs, clubNeeds, ofrecidosPorNecesidad,
  onAddNeed, filterSheet, setFilterSheet, onSelectClub, currentProfile,
  editingNeed, setEditingNeed, onUpdateClub, showToast,
  setSelectedNeed, setSelectedEntryId, setSelectedClubId,
}: {
  search: string
  setSearch: (v: string) => void
  needsTierFilter: LeagueTier[]
  setNeedsTierFilter: (v: LeagueTier[]) => void
  needsLeagueFilter: string
  setNeedsLeagueFilter: (v: string) => void
  needsAgeFilter: string
  setNeedsAgeFilter: (v: string) => void
  positionFilter: string
  setPositionFilter: (v: string) => void
  needsSort: NeedsSort
  setNeedsSort: Dispatch<SetStateAction<NeedsSort>>
  needsLeagues: [string, number][]
  allNeedsPositions: string[]
  clubs: Club[]
  clubNeeds: Array<{ club: Club; need: ClubNeed }>
  ofrecidosPorNecesidad: (club: Club, need: ClubNeed) => number
  onAddNeed: () => void
  filterSheet: FilterSheetId
  setFilterSheet: (v: FilterSheetId) => void
  onSelectClub?: (id: string) => void
  currentProfile: Profile
  editingNeed: EditingNeed | null
  setEditingNeed: (v: EditingNeed | null) => void
  onUpdateClub: (c: Club) => Promise<void>
  showToast: (msg: string, variant?: 'success' | 'error' | 'info') => void
  setSelectedNeed: (v: SelectedNeed | null) => void
  setSelectedEntryId: (id: string | null) => void
  setSelectedClubId: (id: string | null) => void
}) {
  const hasNeedsFilters = needsTierFilter.length > 0 || !!needsLeagueFilter || !!needsAgeFilter || !!positionFilter
  const needsActiveFilters = needsTierFilter.length + (needsLeagueFilter ? 1 : 0) + (needsAgeFilter ? 1 : 0) + (positionFilter ? 1 : 0)
  const needsFilterControls = (
    <>
    {/* Row 1: Nivel select + League select + Age select + clear */}
    <div className="flex flex-wrap items-center gap-2">
      {/* Nivel (tier) */}
      <MultiSelect
        label="Nivel"
        options={['A', 'B', 'C', 'D']}
        selected={needsTierFilter}
        onChange={v => setNeedsTierFilter(v as LeagueTier[])}
      />

      {/* League select */}
      <select
        value={needsLeagueFilter}
        onChange={e => setNeedsLeagueFilter(e.target.value)}
        className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600 bg-white"
      >
        <option value="">Todas las ligas</option>
        {needsLeagues.map(([league, count]) => (
          <option key={league} value={league}>{league} ({count})</option>
        ))}
      </select>

      {/* Age filter */}
      <select
        value={needsAgeFilter}
        onChange={e => setNeedsAgeFilter(e.target.value)}
        className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600 bg-white"
      >
        <option value="">Cualquier edad</option>
        <option value="18">Sub-18</option>
        <option value="21">Sub-21</option>
        <option value="23">Sub-23</option>
        <option value="25">Sub-25</option>
        <option value="28">Sub-28</option>
      </select>

      {/* Clear filters */}
      {needsActiveFilters > 0 && (
        <button
          onClick={() => { setNeedsTierFilter([]); setNeedsLeagueFilter(''); setNeedsAgeFilter(''); setPositionFilter('') }}
          className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
        >
          <SlidersHorizontal className="w-3 h-3" />
          {needsActiveFilters} filtro{needsActiveFilters !== 1 ? 's' : ''}
          <X className="w-3 h-3 ml-0.5 opacity-60" />
        </button>
      )}
    </div>

    {/* Row 2: Posición */}
    <div className="flex items-center gap-2">
      <select
        value={positionFilter}
        onChange={e => setPositionFilter(e.target.value)}
        className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-600 bg-white"
      >
        <option value="">Todas las posiciones</option>
        {allNeedsPositions.map(pos => (
          <option key={pos} value={pos} title={positionEs(pos) || undefined}>{pos}</option>
        ))}
      </select>
    </div>
    </>
  )
  const needsSortToggle = (
    <button
      onClick={() => setNeedsSort(s => s === 'recent' ? 'club' : 'recent')}
      title={needsSort === 'recent' ? 'Ordenado por más reciente' : 'Ordenado por club'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium bg-white border-slate-200 text-slate-600 hover:border-slate-300 transition-colors"
    >
      {needsSort === 'recent' ? '↓ Reciente' : 'A–Z Club'}
    </button>
  )
  return (
  <div className="max-w-5xl mx-auto">
    {/* Desktop: top row search + sort + add button */}
    <div className="hidden sm:flex items-center justify-between mb-3 gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar solicitud…"
            className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {needsSortToggle}
      </div>
      <button
        onClick={() => onAddNeed()}
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" /> Añadir solicitud
      </button>
    </div>

    {/* Móvil: barra compacta búsqueda + orden + filtros */}
    <div className="flex sm:hidden items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar solicitud…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <button
        onClick={() => setFilterSheet('solicitudes')}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          needsActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" /> Filtros
        {needsActiveFilters > 0 && <span className="text-xs">({needsActiveFilters})</span>}
      </button>
    </div>

    <FilterSheet open={filterSheet === 'solicitudes'} onClose={() => setFilterSheet(null)} title="Filtros de solicitudes">
      <div className="flex items-center gap-2">{needsSortToggle}</div>
      {needsFilterControls}
    </FilterSheet>

    {/* Stats summary */}
    {clubs.some(c => c.needs.length > 0) && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-slate-50 rounded-lg mb-3 text-xs text-slate-500">
        <span><span className="font-semibold text-slate-700">{clubNeeds.length}</span> solicitudes{hasNeedsFilters ? ' (filtradas)' : ''}</span>
        <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.map(({need}) => need.position)).size}</span> posiciones distintas</span>
        <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.filter(({club}) => getClubTier(club.league, club.country) === 'A').map(({club}) => club.id)).size}</span> de clubes Tier A</span>
        <span><span className="font-semibold text-slate-700">{new Set(clubNeeds.map(({club}) => club.league)).size}</span> ligas</span>
      </div>
    )}

    {/* Desktop: Filter bar inline */}
    <div className="hidden sm:block space-y-2 mb-3">
      {needsFilterControls}
    </div>

    {clubNeeds.length === 0 ? (
      clubs.every(c => c.needs.length === 0) ? (
        <EmptyState
          icon={<AlertCircle className="w-10 h-10" />}
          title="Ningún club tiene solicitudes registradas aún"
          subtitle="Registra las posiciones que buscan los clubes para cruzarlas con tu cartera."
          action={
            <button
              onClick={() => onAddNeed()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Añadir solicitud
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title="Sin resultados para este filtro"
          subtitle="Prueba a quitar algún filtro o cambia la búsqueda."
        />
      )
    ) : (
      <>
      {/* ── MOBILE CARD VIEW (hidden sm+) ── */}
      <div className="sm:hidden space-y-2">
        {clubNeeds.map(({ club, need }, i) => {
          const tier = getClubTier(club.league, club.country)
          const tierCfg = TIER_CONFIG[tier]
          const offeredCount = ofrecidosPorNecesidad(club, need)
          return (
            <div
              key={`${club.id}-mobile-${i}`}
              className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer active:bg-slate-50"
              onClick={() => onSelectClub?.(club.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-semibold">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{need.position}
                    </span>
                    {need.ageMax && <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-600">Sub-{need.ageMax}</span>}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{club.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                    <span className="text-xs text-slate-500 truncate">{club.league ?? '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {offeredCount > 0 && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                      {offeredCount} jugadores
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
              {(need.transferBudget || need.salaryBudget || need.notes) && (
                <div className="text-xs text-slate-500 space-y-0.5">
                  {(need.transferBudget || need.salaryBudget) && (
                    <div className="flex gap-3">
                      {need.transferBudget && <span>Traspaso: <span className="text-slate-700 font-medium">{need.transferBudget}</span></span>}
                      {need.salaryBudget && <span>Salario: <span className="text-slate-700 font-medium">{need.salaryBudget}</span></span>}
                    </div>
                  )}
                  {need.notes && <div className="truncate text-slate-400">{need.notes}</div>}
                </div>
              )}
            </div>
          )
        })}
        {clubNeeds.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">Sin resultados</div>
        )}
      </div>

      {/* ── DESKTOP TABLE VIEW (hidden on mobile) ── */}
      <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm table-fixed">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-2 py-2.5 font-semibold w-[140px]">Posición</th>
              <th className="text-left px-2 py-2.5 font-semibold w-[120px]">Club</th>
              <th className="text-left px-2 py-2.5 font-semibold w-[130px]">Liga / Tier</th>
              <th className="text-left px-2 py-2.5 font-semibold w-[60px]">Edad</th>
              <th className="text-left px-2 py-2.5 font-semibold w-[140px]">Presupuesto</th>
              <th className="text-left px-2 py-2.5 font-semibold">Notas</th>
              <th className="text-left px-2 py-2.5 font-semibold w-[80px]">Añadida</th>
              {currentProfile.is_admin && <th className="text-left px-2 py-2.5 font-semibold w-[36px]">Por</th>}
              <th className="text-left px-2 py-2.5 font-semibold w-[90px]">Ofrecidos</th>
              <th className="px-2 py-2.5 w-[80px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clubNeeds.map(({ club, need }, i) => {
              const needIndex = club.needs.indexOf(need)
              const isEditing = editingNeed?.clubId === club.id && editingNeed?.index === needIndex
              const tier = getClubTier(club.league, club.country)
              const tierCfg = TIER_CONFIG[tier]
              const offeredCount = ofrecidosPorNecesidad(club, need)
              return (
                <tr
                  key={`${club.id}-${i}`}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => onSelectClub?.(club.id)}
                >
                  {isEditing ? (
                    <td colSpan={9} className="px-3 py-3">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Editar — {club.name}</span>
                        <button onClick={() => setEditingNeed(null)} className="ml-auto text-slate-300 hover:text-slate-500"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <NeedFormInline
                        initial={need}
                        onSave={async (updated) => {
                          try {
                            const withMeta = { ...updated, createdAt: need.createdAt, addedBy: need.addedBy }
                            const newNeeds = club.needs.map((n, idx) => idx === needIndex ? withMeta : n)
                            await onUpdateClub({ ...club, needs: newNeeds })
                            setEditingNeed(null)
                            showToast('Solicitud actualizada')
                          } catch {
                            showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                          }
                        }}
                        onCancel={() => setEditingNeed(null)}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-semibold">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{need.position}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={e => { e.stopPropagation(); onSelectClub?.(club.id) }}
                          className="font-medium text-slate-800 hover:text-blue-600 text-left text-xs transition-colors w-full truncate block"
                          title={club.name}
                        >
                          {club.name}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className={`text-[11px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                          <span className="text-xs text-slate-500 truncate">{club.league ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        {need.ageMax ? <span className="bg-slate-100 px-1 py-0.5 rounded font-medium">-{need.ageMax}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        {need.transferBudget || need.salaryBudget ? (
                          <div className="flex flex-col gap-0.5">
                            {need.transferBudget && <span className="text-xs text-slate-600 truncate" title={need.transferBudget}>T: {need.transferBudget}</span>}
                            {need.salaryBudget && <span className="text-xs text-slate-600 truncate" title={need.salaryBudget}>S: {need.salaryBudget}</span>}
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-400 truncate" title={need.notes ?? ''}>{need.notes || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap">
                        {need.createdAt
                          ? new Date(need.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
                          : <span className="text-slate-300">—</span>}
                      </td>
                      {currentProfile.is_admin && (
                        <td className="px-2 py-2 text-xs font-mono text-slate-400">
                          {need.addedBy || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        {offeredCount > 0 ? (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedNeed({ clubId: club.id, needIndex }); setSelectedEntryId(null); setSelectedClubId(null) }}
                            className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap hover:bg-blue-100 transition-colors"
                          >
                            {offeredCount} jug.
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingNeed({ clubId: club.id, index: needIndex }) }}
                            aria-label="Editar solicitud"
                            className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedNeed({ clubId: club.id, needIndex }); setSelectedEntryId(null); setSelectedClubId(null) }}
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-1 py-1 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" /> Ofrecer
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>
    )}

    {/* FAB Añadir solicitud — móvil */}
    <button
      onClick={() => onAddNeed()}
      aria-label="Añadir solicitud"
      className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
    >
      <Plus className="w-6 h-6" />
    </button>
  </div>
  )
}
