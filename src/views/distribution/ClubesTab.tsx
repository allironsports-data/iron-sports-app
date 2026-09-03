import { useState, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Plus, Search, Star, Building2, Users, X, Check, AlertCircle, CircleDot, Flag, ChevronDown, SlidersHorizontal, CheckSquare } from 'lucide-react'
import type { Club } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { BotonCsv } from '../../components/BotonCsv'
import { TIER_CONFIG, CONFEDERATION_LABELS, getClubTier, getClubConfederation, countryCode3 } from '../../lib/clubTiers'
import type { LeagueTier, Confederation } from '../../lib/clubTiers'
import { fmtDateTime } from '../../lib/distribution'
import { FilterCheck, FilterSheet, MultiSelect } from './shared'
import { SIN_NEGOCIACIONES } from './constantes'
import type { DropPos } from './constantes'
import type { DistributionIndexes } from './useDistributionIndexes'
import type { FilterSheetId } from './JugadoresTab'

export type SortedLeague = { key: string; league: string; count: number; country: string; tier: LeagueTier; confederation: Confederation }

// ── Pestaña CLUBES ────────────────────────────────────────────

export function ClubesTab({
  search, setSearch,
  leagueFilter, setLeagueFilter, countryFilter, setCountryFilter, tierFilter, setTierFilter,
  confederationFilter, setConfederationFilter, priorityOnly, setPriorityOnly, hasNeedsOnly, setHasNeedsOnly,
  hasContactOnly, setHasContactOnly, clubManagerFilter, setClubManagerFilter, staleOnly, setStaleOnly,
  contactedFilter, setContactedFilter, groupByTier, setGroupByTier,
  clubs, sortedLeagues, sortedCountries, clubesPorLiga, filteredClubs, profiles, currentProfile, negsByClub,
  clubBulkMode, setClubBulkMode, clubSelected, setClubSelected, setBulkClubManagerPos,
  onAddClub, onUpdateClub, showToast, filterSheet, setFilterSheet,
  selectedClubId, activeClubId, onSelectClub, setSelectedClubId, setSelectedEntryId,
}: {
  search: string
  setSearch: (v: string) => void
  leagueFilter: string[]
  setLeagueFilter: Dispatch<SetStateAction<string[]>>
  countryFilter: string[]
  setCountryFilter: Dispatch<SetStateAction<string[]>>
  tierFilter: LeagueTier[]
  setTierFilter: (v: LeagueTier[]) => void
  confederationFilter: Confederation[]
  setConfederationFilter: Dispatch<SetStateAction<Confederation[]>>
  priorityOnly: boolean
  setPriorityOnly: Dispatch<SetStateAction<boolean>>
  hasNeedsOnly: boolean
  setHasNeedsOnly: Dispatch<SetStateAction<boolean>>
  hasContactOnly: boolean
  setHasContactOnly: Dispatch<SetStateAction<boolean>>
  clubManagerFilter: string
  setClubManagerFilter: (v: string) => void
  staleOnly: boolean
  setStaleOnly: Dispatch<SetStateAction<boolean>>
  contactedFilter: string
  setContactedFilter: (v: string) => void
  groupByTier: boolean
  setGroupByTier: Dispatch<SetStateAction<boolean>>
  clubs: Club[]
  sortedLeagues: SortedLeague[]
  sortedCountries: { country: string; count: number }[]
  clubesPorLiga: Map<string, Club[]>
  filteredClubs: Club[]
  profiles: Profile[]
  currentProfile: Profile
  negsByClub: DistributionIndexes['negsByClub']
  clubBulkMode: boolean
  setClubBulkMode: Dispatch<SetStateAction<boolean>>
  clubSelected: Set<string>
  setClubSelected: Dispatch<SetStateAction<Set<string>>>
  setBulkClubManagerPos: (p: DropPos | null) => void
  onAddClub: () => void
  onUpdateClub: (c: Club) => Promise<void>
  showToast: (msg: string, variant?: 'success' | 'error' | 'info') => void
  filterSheet: FilterSheetId
  setFilterSheet: (v: FilterSheetId) => void
  selectedClubId: string | null
  activeClubId?: string
  onSelectClub?: (id: string) => void
  setSelectedClubId: (id: string | null) => void
  setSelectedEntryId: (id: string | null) => void
}) {
  // Estado puramente visual de los desplegables: nunca puede quedar abierto
  // al cambiar de pestaña (el overlay que los cierra tapa también la cabecera).
  const [confDropdownOpen, setConfDropdownOpen] = useState(false)
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false)
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [bulkContactedAssigning, setBulkContactedAssigning] = useState(false)

  // ── Clubes en lista ───────────────────────────────────────────────
  // Con 1.372 clubes las tarjetas ocupaban muchísimo y no dejaban comparar.
  // Cada club es una fila: liga, encargado, contacto, ofrecidos y necesidades.
  // «Borja» y «Borja» eran indistinguibles en los desplegables: se enseña
  // nombre y primer apellido, y si aun así coinciden, las siglas.
  // El nombre corto se calculaba DENTRO de cada <option> de cada fila, y
  // encima recorriendo la lista de perfiles entera para ver si estaba
  // repetido. Con 1.500 clubes × 2 desplegables × 10 perfiles eran 30.000
  // llamadas y ~300.000 troceos con expresión regular EN CADA REPINTADO —
  // por ejemplo, en cada tecla del buscador. Ahora se calcula una vez.
  const nombresCortos = useMemo(() => {
    const corto = (p: Profile) => p.name.trim().split(/\s+/).slice(0, 2).join(' ')
    const cuantos = new Map<string, number>()
    profiles.forEach(p => { const c = corto(p); cuantos.set(c, (cuantos.get(c) ?? 0) + 1) })
    const m = new Map<string, string>()
    profiles.forEach(p => {
      const c = corto(p)
      m.set(p.id, (cuantos.get(c) ?? 0) > 1 ? `${c} (${p.avatar})` : c)
    })
    return m
  }, [profiles])

  const nombreCorto = (p: Profile) => nombresCortos.get(p.id) ?? p.name

  // Las opciones de los desplegables son las mismas en las 1.500 filas:
  // se construyen una vez y se reutilizan. React admite reusar los mismos
  // elementos en varios sitios.
  const opcionesEncargado = useMemo(
    () => profiles.filter(p => p.avatar).map(p => (
      <option key={p.id} value={p.avatar}>{nombresCortos.get(p.id) ?? p.name}</option>
    )),
    [profiles, nombresCortos],
  )
  const opcionesContactado = useMemo(
    () => profiles.filter(p => p.avatar).map(p => (
      <option key={p.id} value={p.avatar}>✓ {nombresCortos.get(p.id) ?? p.name}</option>
    )),
    [profiles, nombresCortos],
  )

  const contactedByNombre = (club: Club) =>
    (() => { const p = profiles.find(x => x.avatar === club.contactedBy); return p ? nombreCorto(p) : (club.contactedBy ?? 'sí') })()

  const abrirClub = (id: string) => {
    if (onSelectClub) { onSelectClub(id) }
    else { setSelectedClubId(id); setSelectedEntryId(null) }
  }

  function toggleClubSelected(id: string) {
    setClubSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Tick "contactado" — el primer clic marca automáticamente a quien lo pulsa (quién y cuándo),
  // independiente de negociaciones/solicitudes. Reasignar/quitar se hace desde el
  // <select> de la tarjeta (reassignClubContacted).

  // Reasignar manualmente quién contactó (o quitar la marca)
  async function reassignClubContacted(club: Club, avatar: string | undefined) {
    try {
      if (avatar) {
        await onUpdateClub({ ...club, contacted: true, contactedBy: avatar, contactedAt: new Date().toISOString() })
        showToast(`Contacto reasignado a ${profiles.find(p => p.avatar === avatar)?.name.split(' ')[0] ?? avatar}`)
      } else {
        await onUpdateClub({ ...club, contacted: false, contactedBy: undefined, contactedAt: undefined })
        showToast('Contacto desmarcado')
      }
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
    }
  }

  function renderClubes(lista: Club[]) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] text-slate-500 uppercase tracking-wide">
                  {clubBulkMode && <th className="w-8 px-2 py-2" />}
                  <th className="w-6 px-1 py-2" />
                  <th className="text-left px-2 py-2 font-semibold">Club</th>
                  <th className="text-left px-2 py-2 font-semibold">Liga</th>
                  <th className="text-left px-2 py-2 font-semibold">Encargado</th>
                  <th className="text-left px-2 py-2 font-semibold">Contacto</th>
                  <th className="text-center px-2 py-2 font-semibold" title="Jugadores ofrecidos a este club">Ofr.</th>
                  <th className="text-center px-2 py-2 font-semibold" title="Necesidades declaradas">Nec.</th>
                  <th className="text-left px-2 py-2 font-semibold">Contactado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lista.map(club => {
                  const negs = negsByClub.get(club.id) ?? SIN_NEGOCIACIONES
                  const tier = getClubTier(club.league, club.country)
                  const cfg = TIER_CONFIG[tier]
                  const nNec = club.needs?.length ?? 0
                  const activo = selectedClubId === club.id || activeClubId === club.id
                  return (
                    <tr
                      key={club.id}
                      onClick={() => clubBulkMode ? toggleClubSelected(club.id) : abrirClub(club.id)}
                      className={`cursor-pointer transition-colors ${activo ? 'bg-blue-50/60' : clubSelected.has(club.id) ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                    >
                      {clubBulkMode && (
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="accent-blue-600" checked={clubSelected.has(club.id)} onChange={() => toggleClubSelected(club.id)} />
                        </td>
                      )}
                      <td className="px-1 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => onUpdateClub({ ...club, isPriority: !club.isPriority }).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                          title={club.isPriority ? 'Quitar de prioritarios' : 'Marcar como prioritario'}
                          className={`text-sm leading-none ${club.isPriority ? 'text-green-500' : 'text-slate-200 hover:text-green-400'}`}
                        >★</button>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[9.5px] font-bold px-1 rounded flex-shrink-0 ${cfg.bg} ${cfg.text}`}>{tier}</span>
                          <span className="font-medium text-slate-800 truncate">{club.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                        {club.league ?? '—'}{club.country ? ` · ${countryCode3(club.country)}` : ''}
                      </td>
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                        <select
                          value={club.aisManager ?? ''}
                          onChange={e => onUpdateClub({ ...club, aisManager: e.target.value || undefined })
                            .catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                          className="text-[11px] border border-transparent hover:border-slate-300 rounded px-1 py-0.5 bg-transparent w-full max-w-[150px] focus:outline-none focus:border-primary"
                        >
                          <option value="">—</option>
                          {opcionesEncargado}
                        </select>
                      </td>
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                        <input
                          defaultValue={club.contactPerson ?? ''}
                          placeholder="—"
                          onBlur={e => {
                            const v = e.target.value.trim()
                            if (v === (club.contactPerson ?? '')) return
                            onUpdateClub({ ...club, contactPerson: v || undefined })
                              .catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="text-[11px] border border-transparent hover:border-slate-300 rounded px-1 py-0.5 bg-transparent w-full max-w-[160px] focus:outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        {negs.length ? <span className="font-semibold text-blue-600">{negs.length}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        {nNec ? <span className="font-semibold text-amber-600">{nNec}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <select
                          value={club.contacted ? (club.contactedBy ?? '') : '__no__'}
                          onChange={e => {
                            const v = e.target.value
                            void reassignClubContacted(club, v === '__no__' ? undefined : v)
                          }}
                          title={club.contacted ? `Contactado · ${fmtDateTime(club.contactedAt)}` : 'Sin contactar'}
                          className={`text-[11px] border border-transparent hover:border-slate-300 rounded px-1 py-0.5 bg-transparent focus:outline-none focus:border-primary ${
                            club.contacted ? 'text-emerald-700 font-semibold' : 'text-slate-300'
                          }`}
                        >
                          <option value="__no__">sin contactar</option>
                          {opcionesContactado}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
    )
  }

  const clubsActiveFilters = leagueFilter.length + countryFilter.length + tierFilter.length + confederationFilter.length + (priorityOnly ? 1 : 0) + (hasNeedsOnly ? 1 : 0) + (hasContactOnly ? 1 : 0) + (clubManagerFilter ? 1 : 0) + (staleOnly ? 1 : 0) + (contactedFilter ? 1 : 0) + (groupByTier ? 1 : 0)
  const clubsGroupToggle = (
    <button
      onClick={() => setGroupByTier(v => !v)}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
        groupByTier
          ? 'bg-slate-800 text-white border-slate-800'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
      }`}
    >
      <CircleDot className="w-3.5 h-3.5" />
      {groupByTier ? 'Por nivel' : 'Por liga'}
    </button>
  )
  const clubsFilterControls = (
    <>
    {/* ── Filter row 1: Nivel + Confederation dropdown ── */}
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {/* Nivel (tier) */}
      <MultiSelect
        label="Nivel"
        options={['A', 'B', 'C', 'D']}
        selected={tierFilter}
        onChange={v => setTierFilter(v as LeagueTier[])}
      />

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Confederation dropdown */}
      <div className="relative">
        <button
          onClick={() => setConfDropdownOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
            confederationFilter.length > 0
              ? 'bg-primary text-white border-primary'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          🌍 {confederationFilter.length === 0 ? 'Confederación' : confederationFilter.map(c => c).join(', ')}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {confDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setConfDropdownOpen(false)} />
            <div className="absolute z-50 mt-1 w-52 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
              <div className="p-1.5 border-b border-slate-100">
                <button onClick={() => { setConfederationFilter([]); setConfDropdownOpen(false) }} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-600">Todas las confederaciones</button>
              </div>
              <div className="p-1.5 space-y-0.5">
                {(['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF'] as Confederation[]).map(conf => {
                  const sel = confederationFilter.includes(conf)
                  return (
                    <button key={conf} onClick={() => setConfederationFilter(prev => sel ? prev.filter(c => c !== conf) : [...prev, conf])}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${sel ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                        {sel && <Check className="w-2 h-2 text-white" />}
                      </div>
                      {CONFEDERATION_LABELS[conf]}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {/* ── Filter row 2: League + Country + toggles ── */}
    <div className="relative mb-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* League multi-select */}
        <div className="relative">
          <button
            onClick={() => setLeagueDropdownOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
              leagueFilter.length > 0
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            {leagueFilter.length === 0 ? 'Liga' : `${leagueFilter.length} liga${leagueFilter.length > 1 ? 's' : ''}`}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {leagueDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLeagueDropdownOpen(false)} />
              <div className="absolute z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
                <div className="p-2 border-b border-slate-100">
                  <button onClick={() => { setLeagueFilter([]); setLeagueDropdownOpen(false) }} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${leagueFilter.length === 0 ? 'bg-primary text-white' : 'hover:bg-slate-50 text-slate-700'}`}>
                    Todas las ligas ({clubs.length})
                  </button>
                </div>
                <div className="p-2 space-y-0.5">
                  {sortedLeagues.map(({ key, league, count, country, tier }) => {
                    const selected = leagueFilter.includes(key)
                    const tierCfg = TIER_CONFIG[tier]
                    return (
                      <button key={key}
                        onClick={() => setLeagueFilter(prev => prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key])}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${selected ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                      >
                        <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                          {selected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={`text-[11px] font-bold px-1 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text} flex-shrink-0`}>{tier}</span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{league}{country && <span className="text-slate-400 font-normal"> · {countryCode3(country)}</span>}</span>
                          {country && <span className="text-xs text-slate-400">{country}</span>}
                        </span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Filter row 3: country + toggles */}
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* Country multi-select */}
      <div className="relative">
        <button
          onClick={() => setCountryDropdownOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
            countryFilter.length > 0
              ? 'bg-primary text-white border-primary'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          {countryFilter.length === 0 ? 'País' : `${countryFilter.length} país${countryFilter.length > 1 ? 'es' : ''}`}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {countryDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCountryDropdownOpen(false)} />
            <div className="absolute z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-[50vh] overflow-y-auto">
              <div className="p-1.5 border-b border-slate-100">
                <button onClick={() => { setCountryFilter([]); setCountryDropdownOpen(false) }} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-600">Todos los países</button>
              </div>
              <div className="p-1.5 space-y-0.5">
                {sortedCountries.map(({ country, count }) => {
                  const sel = countryFilter.includes(country)
                  return (
                    <button key={country} onClick={() => setCountryFilter(prev => sel ? prev.filter(c => c !== country) : [...prev, country])}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${sel ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                        {sel && <Check className="w-2 h-2 text-white" />}
                      </div>
                      <span className="flex-1 truncate">{country}</span>
                      <span className="text-slate-400">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Priority toggle */}
      <FilterCheck label={<><Star className="w-3.5 h-3.5" /> Prioritarios</>} checked={priorityOnly} onClick={() => setPriorityOnly(v => !v)} />

      {/* Has needs toggle */}
      <FilterCheck label={<><AlertCircle className="w-3.5 h-3.5" /> Con solicitudes</>} checked={hasNeedsOnly} onClick={() => setHasNeedsOnly(v => !v)} />

      {/* Has contact toggle */}
      <FilterCheck label={<><Users className="w-3.5 h-3.5" /> Con contacto</>} checked={hasContactOnly} onClick={() => setHasContactOnly(v => !v)} />

      {/* Bandeja stale: propuestas paradas */}
      <FilterCheck label="Paradas >7d" checked={staleOnly} onClick={() => setStaleOnly(v => !v)} />

      {/* Filtro por encargado del club */}
      <select
        value={clubManagerFilter}
        onChange={e => setClubManagerFilter(e.target.value)}
        aria-label="Filtrar por encargado"
        className="px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer bg-white border-slate-200 text-slate-600 hover:border-slate-300"
      >
        <option value="">Encargado: todos</option>
        {profiles.map(p => (
          <option key={p.id} value={p.avatar}>{p.name} ({p.avatar})</option>
        ))}
        <option value="__sin__">Sin encargado</option>
      </select>

      {/* Filtro por contactado */}
      <select
        value={contactedFilter}
        onChange={e => setContactedFilter(e.target.value)}
        aria-label="Filtrar por contactado"
        className="px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer bg-white border-slate-200 text-slate-600 hover:border-slate-300"
      >
        <option value="">Contactado: todos</option>
        <option value="yes">Contactados</option>
        <option value="no">Sin contactar</option>
      </select>

      {/* Clear all */}
      {(leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly || clubManagerFilter || staleOnly || contactedFilter) && (() => {
        const count = leagueFilter.length + countryFilter.length + tierFilter.length + confederationFilter.length + (priorityOnly ? 1 : 0) + (hasNeedsOnly ? 1 : 0) + (hasContactOnly ? 1 : 0) + (clubManagerFilter ? 1 : 0) + (staleOnly ? 1 : 0) + (contactedFilter ? 1 : 0)
        return (
          <button
            onClick={() => { setLeagueFilter([]); setCountryFilter([]); setTierFilter([]); setConfederationFilter([]); setPriorityOnly(false); setHasNeedsOnly(false); setHasContactOnly(false); setClubManagerFilter(''); setStaleOnly(false); setContactedFilter('') }}
            className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors ml-1"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {count} filtro{count !== 1 ? 's' : ''}
            <X className="w-3 h-3 ml-0.5 opacity-60" />
          </button>
        )
      })()}

      <span className="ml-auto text-xs text-slate-400">{filteredClubs.length} club{filteredClubs.length !== 1 ? 's' : ''}</span>
    </div>
    </>
  )
  return (
  <div className="max-w-5xl mx-auto">
    {/* Desktop: barra superior búsqueda + agrupar + añadir */}
    <div className="hidden sm:flex items-center justify-between mb-2 gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar club…"
            className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {clubsGroupToggle}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setClubBulkMode(v => !v); if (clubBulkMode) setClubSelected(new Set()) }}
          className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border text-sm rounded-lg font-medium transition-colors ${
            clubBulkMode ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <CheckSquare className="w-4 h-4" /> {clubBulkMode ? 'Cancelar selección' : 'Seleccionar'}
        </button>
        <button
          onClick={() => onAddClub()}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Añadir club
        </button>
      </div>
    </div>

    {/* Desktop: filtros inline */}
    <div className="hidden sm:block">
      {clubsFilterControls}
    </div>

    {/* Barra de selección múltiple — asignar encargado en bulk */}
    {clubBulkMode && (
      <div className="flex items-center gap-3 mb-2 flex-wrap bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            checked={filteredClubs.length > 0 && filteredClubs.every(c => clubSelected.has(c.id))}
            onChange={e => setClubSelected(prev => {
              const next = new Set(prev)
              filteredClubs.forEach(c => { if (e.target.checked) next.add(c.id); else next.delete(c.id) })
              return next
            })}
          />
          Seleccionar visibles
        </label>
        {clubSelected.size > 0 && (
          <>
            <span className="text-xs text-slate-500">{clubSelected.size} club{clubSelected.size !== 1 ? 'es' : ''} seleccionado{clubSelected.size !== 1 ? 's' : ''}</span>
            <button
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setBulkClubManagerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg"
            >
              <Users className="w-3.5 h-3.5" /> Asignar encargado ({clubSelected.size})
            </button>
            <button
              disabled={bulkContactedAssigning}
              onClick={async () => {
                setBulkContactedAssigning(true)
                try {
                  const targets = Array.from(clubSelected).map(id => clubs.find(c => c.id === id)).filter((c): c is Club => !!c)
                  await Promise.all(targets.map(c => onUpdateClub({ ...c, contacted: true, contactedBy: currentProfile.avatar, contactedAt: new Date().toISOString() })))
                  showToast(`${targets.length} club${targets.length !== 1 ? 'es' : ''} marcado${targets.length !== 1 ? 's' : ''} como contactado${targets.length !== 1 ? 's' : ''}`)
                  setClubSelected(new Set())
                  setClubBulkMode(false)
                } catch {
                  showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                } finally {
                  setBulkContactedAssigning(false)
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 rounded-lg"
            >
              <Check className="w-3.5 h-3.5" /> Marcar contactado ({clubSelected.size})
            </button>
            <button onClick={() => setClubSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-700">Limpiar selección</button>
          </>
        )}
      </div>
    )}

    {/* Móvil: barra compacta búsqueda + botón Filtros */}
    <div className="flex sm:hidden items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar club…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <button
        onClick={() => setFilterSheet('clubes')}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          clubsActiveFilters > 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" /> Filtros
        {clubsActiveFilters > 0 && <span className="text-xs">({clubsActiveFilters})</span>}
      </button>
      <BotonCsv
        nombre="clubes-distribucion"
        cabeceras={['Club', 'Liga', 'País', 'Nivel', 'Confederación', 'Encargado', 'Contacto', 'Prioritario', 'Ofrecidos', 'Necesidades', 'Contactado', 'Fecha contacto']}
        filas={() => filteredClubs.map(c => [
          c.name, c.league ?? '', c.country ?? '',
          getClubTier(c.league, c.country),
          CONFEDERATION_LABELS[getClubConfederation(c.country)] ?? '',
          profiles.find(p => p.avatar === c.aisManager)?.name ?? '',
          c.contactPerson ?? '',
          c.isPriority ? 'Sí' : '',
          (negsByClub.get(c.id) ?? SIN_NEGOCIACIONES).length,
          c.needs?.length ?? 0,
          c.contacted ? (contactedByNombre(c)) : '',
          c.contactedAt ? c.contactedAt.slice(0, 10) : '',
        ])}
      />
      <button
        onClick={() => { setClubBulkMode(v => !v); if (clubBulkMode) setClubSelected(new Set()) }}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          clubBulkMode ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200'
        }`}
      >
        <CheckSquare className="w-4 h-4" />
      </button>
    </div>

    <FilterSheet open={filterSheet === 'clubes'} onClose={() => setFilterSheet(null)} title="Filtros de clubes">
      <div className="flex items-center gap-2">{clubsGroupToggle}</div>
      {clubsFilterControls}
    </FilterSheet>

    {/* Clubs grid — grouped by league when no filter, flat when filtered */}
    {(leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly || !!search) ? (
      renderClubes(filteredClubs)
    ) : groupByTier ? (
      <div className="space-y-4">
        {(['A', 'B', 'C', 'D'] as LeagueTier[]).map(t => {
          const tierClubs = filteredClubs.filter(c => getClubTier(c.league, c.country) === t)
          if (tierClubs.length === 0) return null
          const tierCfg = TIER_CONFIG[t]
          return (
            <div key={t}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{t}</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tierCfg.title}</span>
                <span className="text-xs text-slate-400">({tierClubs.length})</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {renderClubes(tierClubs)}
            </div>
          )
        })}
      </div>
    ) : (
      <div className="space-y-4">
        {sortedLeagues.map(({ key, league, country, tier, confederation }) => {
          const leagueClubs = clubesPorLiga.get(`${league}|${country}`)
          if (!leagueClubs || leagueClubs.length === 0) return null
          const tierCfg = TIER_CONFIG[tier]
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{league}{country && ` · ${countryCode3(country)}`}</span>
                <span className="text-xs text-slate-400">({leagueClubs.length})</span>
                <span className="text-xs text-slate-300">{CONFEDERATION_LABELS[confederation]}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {renderClubes(leagueClubs)}
            </div>
          )
        })}
      </div>
    )}

    {filteredClubs.length === 0 && (
      (search || leagueFilter.length > 0 || countryFilter.length > 0 || tierFilter.length > 0 || confederationFilter.length > 0 || priorityOnly || hasNeedsOnly || hasContactOnly) ? (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title="Sin resultados con estos filtros"
          subtitle="Prueba a quitar algún filtro o cambia la búsqueda."
          action={
            <button
              onClick={() => { setSearch(''); setLeagueFilter([]); setCountryFilter([]); setTierFilter([]); setConfederationFilter([]); setPriorityOnly(false); setHasNeedsOnly(false); setHasContactOnly(false) }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<Building2 className="w-10 h-10" />}
          title="No hay clubes todavía"
          subtitle="Añade clubes para poder ofrecerles jugadores y registrar sus solicitudes."
          action={
            <button
              onClick={() => onAddClub()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Añadir club
            </button>
          }
        />
      )
    )}

    {/* FAB Añadir club — móvil */}
    <button
      onClick={() => onAddClub()}
      aria-label="Añadir club"
      className="sm:hidden fixed bottom-5 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center safe-area-bottom"
    >
      <Plus className="w-6 h-6" />
    </button>
  </div>
  )
}
