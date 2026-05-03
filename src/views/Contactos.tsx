import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Search, ChevronRight, ChevronDown, Phone, X, ArrowLeft,
  Users, Star, Plus, Pencil, Check, Trash2,
  List, LayoutList, AlertCircle, UserX,
} from 'lucide-react'
import { CONTACTS as STATIC_CONTACTS, type Contact } from '../data/contactos'

// ── Confederation grouping ────────────────────────────────────────────────────

const CONFEDERATIONS: { label: string; code: string; regions: Set<string> }[] = [
  {
    label: 'UEFA', code: 'UEFA',
    regions: new Set([
      'Alemania', 'Austria', 'Azerbaijan', 'Bielorrusia', 'Bulgaria', 'Bélgica',
      'Chipre', 'Croacia', 'Dinamarca', 'Escocia', 'Eslovaquia', 'Eslovenia',
      'España', 'Finlandia', 'Francia', 'Georgia', 'Grecia', 'Hungría', 'Inglaterra',
      'Israel', 'Italia', 'Kazajistán', 'Letonia', 'Lituania', 'Noruega', 'País de Gales',
      'Países Bajos', 'Polonia', 'Portugal', 'República Checa', 'Rumanía', 'Rusia',
      'Serbia', 'Suecia', 'Suiza', 'Turquía', 'Ucrania', 'Uzbekistán',
    ]),
  },
  {
    label: 'CONMEBOL', code: 'CONMEBOL',
    regions: new Set([
      'Argentina', 'Brasil', 'Chile', 'Colombia', 'Ecuador', 'Perú', 'Uruguay',
    ]),
  },
  {
    label: 'CONCACAF', code: 'CONCACAF',
    regions: new Set(['México', 'USA / MLS', 'Costa Rica']),
  },
  {
    label: 'AFC', code: 'AFC',
    regions: new Set(['Japón', 'India', 'Irán', 'Oriente Medio', 'Asia']),
  },
  {
    label: 'CAF', code: 'CAF',
    regions: new Set(['Egipto']),
  },
]

function getConfederation(region: string) {
  for (const conf of CONFEDERATIONS) {
    if (conf.regions.has(region)) return conf.code
  }
  return 'Otros'
}

// ── LocalStorage keys ─────────────────────────────────────────────────────────

const LS_FAVORITES = 'ais_contact_favorites'
const LS_EXTRA     = 'ais_extra_contacts'
const LS_OVERRIDES = 'ais_contact_overrides'
const LS_DELETED   = 'ais_deleted_contacts'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_REGIONS = new Set(['Agents', 'COACHS', 'PLAYERS', 'FEDERACIONES', 'Coach'])

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set() }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]))
}
function loadJSON<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function saveJSON(key: string, v: unknown) {
  localStorage.setItem(key, JSON.stringify(v))
}

function generateId(c: Omit<Contact, 'id'>): string {
  const str = `${c.name}|${c.team}|${c.region}|${c.role}`
  let h = 0
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0 }
  return 'custom_' + Math.abs(h).toString(16).padStart(8, '0')
}

function normalise(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  'Tier 1': { bg: 'bg-amber-100', text: 'text-amber-800' },
  'Tier 2': { bg: 'bg-blue-50',   text: 'text-blue-700' },
  'Tier 3': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'Tier 4': { bg: 'bg-slate-50',  text: 'text-slate-400' },
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  const cls = TIER_COLORS[tier] ?? { bg: 'bg-slate-100', text: 'text-slate-500' }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls.bg} ${cls.text}`}>{tier}</span>
}

function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

type ViewMode = 'regions' | 'alpha'

// ── Main component ────────────────────────────────────────────────────────────

interface ModalState { mode: 'add' | 'edit'; contact?: Contact }
interface DeleteState { ids: string[]; single?: boolean }

export function Contactos({ onBack }: { onBack: () => void }) {

  // ── Persistent data ──
  const [extraContacts, setExtraContacts] = useState<Contact[]>(() => loadJSON(LS_EXTRA, []))
  const [overrides,     setOverrides]     = useState<Record<string, Partial<Contact>>>(() => loadJSON(LS_OVERRIDES, {}))
  const [favorites,     setFavorites]     = useState<Set<string>>(() => loadSet(LS_FAVORITES))
  const [deleted,       setDeleted]       = useState<Set<string>>(() => loadSet(LS_DELETED))

  // ── UI state ──
  const [viewMode,       setViewMode]       = useState<ViewMode>('regions')
  const [search,         setSearch]         = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [showFavorites,  setShowFavorites]  = useState(false)
  const [expandedTeams,  setExpandedTeams]  = useState<Set<string>>(new Set())
  const [roleFilter,     setRoleFilter]     = useState<string | null>(null)
  const [tierFilter,     setTierFilter]     = useState<string | null>(null)
  const [expandedConfs,  setExpandedConfs]  = useState<Set<string>>(new Set(['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'Otros']))
  const [modal,          setModal]          = useState<ModalState | null>(null)
  const [deleteState,    setDeleteState]    = useState<DeleteState | null>(null)
  const [selected,       setSelected]       = useState<Set<string>>(new Set())

  // ── Merged contact list ──
  const ALL_CONTACTS = useMemo(() => {
    const base = STATIC_CONTACTS
      .filter(c => !EXCLUDED_REGIONS.has(c.region ?? '') && !deleted.has(c.id))
      .map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c)
    const extra = extraContacts.filter(c => !deleted.has(c.id))
    return [...base, ...extra]
  }, [extraContacts, overrides, deleted])

  // Real contacts (with a person) vs. empty club placeholders
  const REAL_CONTACTS = useMemo(() =>
    ALL_CONTACTS.filter(c => !c._noContact && (c.name || c.phone1 || c.phone2))
  , [ALL_CONTACTS])

  const ALL_REGIONS = useMemo(() =>
    [...new Set(ALL_CONTACTS.map(c => c.region ?? 'Sin clasificar'))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  , [ALL_CONTACTS])

  // Regions grouped by confederation (for sidebar)
  const regionsByConfederation = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const r of ALL_REGIONS) {
      const conf = getConfederation(r)
      if (!map.has(conf)) map.set(conf, [])
      map.get(conf)!.push(r)
    }
    // Sort confederation order to match CONFEDERATIONS array
    const confOrder = [...CONFEDERATIONS.map(c => c.code), 'Otros']
    return confOrder
      .filter(c => map.has(c))
      .map(c => ({ code: c, label: CONFEDERATIONS.find(x => x.code === c)?.label ?? c, regions: map.get(c)! }))
  }, [ALL_REGIONS])

  const ALL_ROLES = useMemo(() =>
    [...new Set(REAL_CONTACTS.map(c => c.role).filter((r): r is string => !!r))].sort()
  , [REAL_CONTACTS])

  const teamsByRegion = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const c of ALL_CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      const t = c.team ?? '—'
      if (!map.has(r)) map.set(r, new Set())
      map.get(r)!.add(t)
    }
    return map
  }, [ALL_CONTACTS])

  const q = normalise(search.trim())
  const isSearching = q.length > 1

  // ── Apply filters ──
  const applyFilters = useCallback((cs: Contact[]) => {
    let out = cs
    if (roleFilter) out = out.filter(c => c.role === roleFilter)
    if (tierFilter) out = out.filter(c => c.tier === tierFilter)
    return out
  }, [roleFilter, tierFilter])

  // ── Region view filtered contacts ──
  const regionFiltered = useMemo<Contact[]>(() => {
    let cs = applyFilters(ALL_CONTACTS)
    if (showFavorites) return cs.filter(c => favorites.has(c.id))
    if (!isSearching && !selectedRegion) return cs
    return cs.filter(c => {
      const regionOk = !selectedRegion || (c.region ?? 'Sin clasificar') === selectedRegion
      if (!isSearching) return regionOk
      const hay = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
      return hay.includes(q)
    })
  }, [ALL_CONTACTS, applyFilters, showFavorites, favorites, isSearching, selectedRegion, q])

  // ── Alpha view filtered contacts ──
  const alphaFiltered = useMemo<Contact[]>(() => {
    let cs = applyFilters(REAL_CONTACTS)
    if (isSearching) {
      cs = cs.filter(c => {
        const hay = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
        return hay.includes(q)
      })
    }
    return [...cs].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [REAL_CONTACTS, applyFilters, isSearching, q])

  // ── Group for region view ──
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Contact[]>>()
    for (const c of regionFiltered) {
      const region = c.region ?? 'Sin clasificar'
      const team   = c.team   ?? '—'
      if (!map.has(region)) map.set(region, new Map())
      const teams = map.get(region)!
      if (!teams.has(team)) teams.set(team, [])
      teams.get(team)!.push(c)
    }
    return map
  }, [regionFiltered])

  const regionCounts = useMemo(() => {
    const m = new Map<string, { total: number; withContact: number }>()
    for (const c of ALL_CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      const cur = m.get(r) ?? { total: 0, withContact: 0 }
      cur.total++
      if (!c._noContact && (c.name || c.phone1 || c.phone2)) cur.withContact++
      m.set(r, cur)
    }
    return m
  }, [ALL_CONTACTS])

  // ── Auto-expand when region selected ──
  useEffect(() => {
    if (!selectedRegion) return
    const keys = new Set<string>()
    for (const t of teamsByRegion.get(selectedRegion) ?? []) keys.add(`${selectedRegion}::${t}`)
    setExpandedTeams(keys)
  }, [selectedRegion, teamsByRegion])

  const allGroupedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [region, teams] of grouped) {
      for (const team of teams.keys()) keys.add(`${region}::${team}`)
    }
    return keys
  }, [grouped])

  const effectiveExpanded = (isSearching || showFavorites) ? allGroupedKeys : expandedTeams

  function toggleTeam(key: string) {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Favorites ──
  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveSet(LS_FAVORITES, next)
      return next
    })
  }, [])

  // ── Delete ──
  function confirmDelete(ids: string[]) {
    const newDeleted = new Set([...deleted, ...ids])
    setDeleted(newDeleted)
    saveSet(LS_DELETED, newDeleted)
    // If extra contact, also remove from extra
    const extraIds = new Set(ids)
    const newExtra = extraContacts.filter(c => !extraIds.has(c.id))
    if (newExtra.length !== extraContacts.length) {
      setExtraContacts(newExtra)
      saveJSON(LS_EXTRA, newExtra)
    }
    // Clear overrides for deleted
    const newOverrides = { ...overrides }
    ids.forEach(id => delete newOverrides[id])
    setOverrides(newOverrides)
    saveJSON(LS_OVERRIDES, newOverrides)
    // Clear selection
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
    setDeleteState(null)
  }

  // ── Multi-select (alpha view) ──
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll() {
    setSelected(new Set(alphaFiltered.map(c => c.id)))
  }
  function clearSelection() { setSelected(new Set()) }

  // ── Add / Edit contact ──
  function handleSave(data: Omit<Contact, 'id'>) {
    if (!modal) return
    if (modal.mode === 'add') {
      const id = generateId(data)
      const nc: Contact = { ...data, id }
      const updated = [...extraContacts, nc]
      setExtraContacts(updated)
      saveJSON(LS_EXTRA, updated)
    } else if (modal.contact) {
      const { id } = modal.contact
      if (extraContacts.some(c => c.id === id)) {
        const updated = extraContacts.map(c => c.id === id ? { ...data, id } : c)
        setExtraContacts(updated)
        saveJSON(LS_EXTRA, updated)
      } else {
        const upd = { ...overrides, [id]: data }
        setOverrides(upd)
        saveJSON(LS_OVERRIDES, upd)
      }
    }
    setModal(null)
  }

  function selectRegion(region: string) {
    setSelectedRegion(prev => prev === region ? null : region)
    setShowFavorites(false)
    setSearch('')
    setViewMode('regions')
  }

  const regionsToShow = (isSearching || showFavorites)
    ? [...grouped.keys()].sort((a, b) => a.localeCompare(b))
    : selectedRegion ? [selectedRegion] : []

  // Alpha view letters
  const alphaByLetter = useMemo(() => {
    const map = new Map<string, Contact[]>()
    for (const c of alphaFiltered) {
      const letter = (c.name?.[0] ?? '#').toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(c)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [alphaFiltered])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 -ml-1 rounded hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-800">Contactos</span>
          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-semibold uppercase tracking-wide">Admin</span>

          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('regions')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'regions' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vista por liga"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Por liga</span>
            </button>
            <button
              onClick={() => { setViewMode('alpha'); setShowFavorites(false) }}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'alpha' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vista alfabética"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">A–Z</span>
            </button>
          </div>

          {/* Filters (compact) */}
          <select
            value={roleFilter ?? ''}
            onChange={e => setRoleFilter(e.target.value || null)}
            className={`pl-2 pr-1 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none max-w-[110px] ${roleFilter ? 'border-blue-300 text-blue-700 font-medium' : 'border-slate-200 text-slate-500'}`}
          >
            <option value="">Rol…</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={tierFilter ?? ''}
            onChange={e => setTierFilter(e.target.value || null)}
            className={`pl-2 pr-1 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none max-w-[80px] ${tierFilter ? 'border-amber-300 text-amber-700 font-medium' : 'border-slate-200 text-slate-500'}`}
          >
            <option value="">Tier…</option>
            <option value="Tier 1">T1</option>
            <option value="Tier 2">T2</option>
            <option value="Tier 3">T3</option>
            <option value="Tier 4">T4</option>
          </select>

          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>

          {/* Search — wider */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) { setSelectedRegion(null); setShowFavorites(false) } }}
              placeholder="Buscar nombre, club, teléfono…"
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full flex flex-1 gap-0 px-4 py-4">

        {/* ── Sidebar ── */}
        <aside className="w-52 flex-shrink-0 mr-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden sticky top-20">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Regiones</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
              {/* Favoritos */}
              <button
                onClick={() => { setShowFavorites(true); setSelectedRegion(null); setSearch(''); setViewMode('regions') }}
                className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors border-b border-slate-100 ${
                  showFavorites ? 'bg-amber-50 text-amber-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Star className={`w-3.5 h-3.5 ${showFavorites ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  Favoritos
                </span>
                <span className={`ml-2 text-[11px] rounded-full px-1.5 ${showFavorites ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                  {favorites.size}
                </span>
              </button>

              {/* Region list grouped by confederation */}
              {regionsByConfederation.map(({ code, label, regions }) => {
                const isConfOpen = expandedConfs.has(code)
                const confTotal = regions.reduce((s, r) => s + (regionCounts.get(r)?.withContact ?? 0), 0)
                return (
                  <div key={code}>
                    {/* Confederation header */}
                    <button
                      onClick={() => setExpandedConfs(prev => {
                        const next = new Set(prev)
                        next.has(code) ? next.delete(code) : next.add(code)
                        return next
                      })}
                      className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-50 border-y border-slate-100 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        {isConfOpen
                          ? <ChevronDown className="w-3 h-3 text-slate-400" />
                          : <ChevronRight className="w-3 h-3 text-slate-400" />
                        }
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">{confTotal}</span>
                    </button>

                    {/* Regions in this confederation */}
                    {isConfOpen && regions.map(region => {
                      const counts = regionCounts.get(region) ?? { total: 0, withContact: 0 }
                      const missing = counts.total - counts.withContact
                      const active = selectedRegion === region && !isSearching && !showFavorites && viewMode === 'regions'
                      return (
                        <button
                          key={region}
                          onClick={() => selectRegion(region)}
                          className={`w-full text-left flex items-center justify-between px-3 pl-7 py-1.5 text-sm transition-colors ${
                            active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate flex-1 min-w-0 flex items-center gap-1">
                            {missing > 0 && (
                              <span title={`${missing} sin contacto`}><AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" /></span>
                            )}
                            {region}
                          </span>
                          <span className={`ml-1 flex-shrink-0 text-[11px] rounded-full px-1.5 ${
                            active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                          }`}>{counts.withContact}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="flex-1 min-w-0">

          {/* ═══ ALPHA VIEW ═══ */}
          {viewMode === 'alpha' && (
            <div>
              {/* Selection toolbar */}
              <div className="mb-3 flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === alphaFiltered.length && alphaFiltered.length > 0}
                    onChange={e => e.target.checked ? selectAll() : clearSelection()}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  <span className="text-xs text-slate-500">
                    {alphaFiltered.length.toLocaleString()} contactos
                    {selected.size > 0 && ` · ${selected.size} seleccionados`}
                  </span>
                </label>
                {selected.size > 0 && (
                  <button
                    onClick={() => setDeleteState({ ids: [...selected] })}
                    className="flex items-center gap-1 ml-auto px-2.5 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar {selected.size}
                  </button>
                )}
                {isSearching && (
                  <span className="ml-auto text-xs text-slate-500">{alphaFiltered.length} resultado{alphaFiltered.length !== 1 ? 's' : ''} para «{search}»</span>
                )}
              </div>

              {/* Alphabetical list */}
              {alphaByLetter.map(([letter, contacts]) => (
                <div key={letter} className="mb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                      {letter}
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-50">
                    {contacts.map((c, i) => (
                      <AlphaContactRow
                        key={i}
                        contact={c}
                        isSelected={selected.has(c.id)}
                        isFavorite={favorites.has(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onToggleFavorite={() => toggleFavorite(c.id)}
                        onEdit={() => setModal({ mode: 'edit', contact: c })}
                        onDelete={() => setDeleteState({ ids: [c.id], single: true })}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {alphaFiltered.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <Users className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm">Sin resultados{search ? ` para «${search}»` : ''}</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ REGION VIEW ═══ */}
          {viewMode === 'regions' && (
            <div>
              {/* Empty state */}
              {!isSearching && !selectedRegion && !showFavorites && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Users className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Selecciona una región</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {REAL_CONTACTS.length.toLocaleString()} contactos · {ALL_REGIONS.length} regiones
                  </p>
                </div>
              )}

              {/* Favorites header */}
              {showFavorites && !isSearching && (
                <div className="mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-700">Favoritos</span>
                  <span className="text-xs text-slate-400">{regionFiltered.length} contacto{regionFiltered.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Search stats */}
              {isSearching && (
                <div className="mb-3 text-xs text-slate-500">
                  {regionFiltered.length} resultado{regionFiltered.length !== 1 ? 's' : ''} para «{search}»
                </div>
              )}

              {/* Region blocks */}
              <div className="space-y-4">
                {regionsToShow.map(region => {
                  const teams = grouped.get(region)
                  if (!teams) return null
                  const teamList = [...teams.entries()].sort(([a], [b]) => a.localeCompare(b))
                  const totalInRegion = [...teams.values()].reduce((s, c) => s + c.length, 0)

                  return (
                    <div key={region}>
                      {(isSearching || showFavorites) && (
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{region}</h2>
                          <span className="text-[11px] text-slate-400">{totalInRegion}</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {teamList.map(([team, contacts]) => {
                          const key = `${region}::${team}`
                          const isOpen = effectiveExpanded.has(key)
                          const hasOnlyPlaceholder = contacts.every(c => c._noContact || (!c.name && !c.phone1 && !c.phone2))
                          const realContacts = contacts.filter(c => !c._noContact && (c.name || c.phone1 || c.phone2))

                          return (
                            <div key={key} className={`bg-white border rounded-lg overflow-hidden ${hasOnlyPlaceholder ? 'border-amber-200 opacity-60' : 'border-slate-200'}`}>
                              <button
                                onClick={() => toggleTeam(key)}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {hasOnlyPlaceholder && (
                                    <span title="Sin contacto asignado"><AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /></span>
                                  )}
                                  <span className="text-sm font-semibold text-slate-800 truncate">{team}</span>
                                  {!hasOnlyPlaceholder && (
                                    <span className="text-[11px] text-slate-400 flex-shrink-0">
                                      {realContacts.length} contacto{realContacts.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {hasOnlyPlaceholder && (
                                    <span className="text-[11px] text-amber-500 flex-shrink-0">Sin contacto</span>
                                  )}
                                  {contacts[0]?.tier && <TierBadge tier={contacts[0].tier} />}
                                </div>
                                {isOpen
                                  ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                  : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                }
                              </button>

                              {isOpen && !hasOnlyPlaceholder && (
                                <div className="border-t border-slate-100 divide-y divide-slate-50">
                                  {realContacts.map((c, i) => (
                                    <ContactRow
                                      key={i}
                                      contact={c}
                                      isFavorite={favorites.has(c.id)}
                                      onToggleFavorite={() => toggleFavorite(c.id)}
                                      onEdit={() => setModal({ mode: 'edit', contact: c })}
                                      onDelete={() => setDeleteState({ ids: [c.id], single: true })}
                                    />
                                  ))}
                                </div>
                              )}
                              {isOpen && hasOnlyPlaceholder && (
                                <div className="border-t border-amber-100 px-4 py-3 flex items-center gap-3">
                                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                  <p className="text-xs text-amber-600">No hay ningún contacto para este club.</p>
                                  <button
                                    onClick={() => setModal({ mode: 'add' })}
                                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                                  >
                                    <Plus className="w-3 h-3" /> Añadir
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Empty favorites */}
              {showFavorites && regionFiltered.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <Star className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm">No tienes contactos favoritos aún.</p>
                </div>
              )}

              {/* Empty search */}
              {isSearching && regionFiltered.length === 0 && (
                <div className="text-center py-16 text-sm text-slate-400">
                  Sin resultados para «{search}»
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Add / Edit modal ── */}
      {modal && (
        <ContactFormModal
          mode={modal.mode}
          contact={modal.contact}
          regions={ALL_REGIONS}
          teamsByRegion={teamsByRegion}
          roles={ALL_ROLES}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteState && (
        <DeleteConfirmModal
          count={deleteState.ids.length}
          onConfirm={() => confirmDelete(deleteState.ids)}
          onCancel={() => setDeleteState(null)}
        />
      )}
    </div>
  )
}

// ── Alpha contact row ─────────────────────────────────────────────────────────

function AlphaContactRow({
  contact: c, isSelected, isFavorite, onToggleSelect, onToggleFavorite, onEdit, onDelete,
}: {
  contact: Contact
  isSelected: boolean
  isFavorite: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-blue-50' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
      />
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-semibold text-slate-500">{initials(c.name)}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_1fr_auto] gap-x-3 items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {c.name ?? <span className="text-slate-400 italic text-xs">Sin nombre</span>}
          </p>
          {c.role && <p className="text-xs text-slate-400 truncate">{c.role}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-600 truncate font-medium">{c.team ?? '—'}</p>
          <p className="text-[11px] text-slate-400 truncate">{c.region}</p>
        </div>
        <div className="flex items-center gap-2">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.tier && <TierBadge tier={c.tier} />}
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-200 text-slate-400" title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleFavorite}
          className={`p-1.5 rounded hover:bg-slate-200 ${isFavorite ? 'text-amber-400' : 'text-slate-300'}`}
          title={isFavorite ? 'Quitar favorito' : 'Añadir favorito'}
        >
          <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-100 text-slate-300 hover:text-red-500" title="Eliminar">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Region contact row ────────────────────────────────────────────────────────

function ContactRow({
  contact: c, isFavorite, onToggleFavorite, onEdit, onDelete,
}: {
  contact: Contact
  isFavorite: boolean
  onToggleFavorite: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors group">
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-slate-500">{initials(c.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">
            {c.name ?? <span className="text-slate-400 italic text-xs">Sin nombre</span>}
          </span>
          {c.role && <span className="text-xs text-slate-500">{c.role}</span>}
          {c.tier && <TierBadge tier={c.tier} />}
          {c._noClub && (
            <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
              <UserX className="w-3 h-3" /> Sin club
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.phone2 && <PhoneLink phone={c.phone2} />}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-200 text-slate-400" title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleFavorite}
          className={`p-1.5 rounded hover:bg-slate-200 ${isFavorite ? 'text-amber-400' : 'text-slate-300'}`}
        >
          <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-100 text-slate-300 hover:text-red-500" title="Eliminar">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, '')}`}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
    >
      <Phone className="w-3 h-3" />
      {phone}
    </a>
  )
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ count, onConfirm, onCancel }: {
  count: number; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Eliminar {count === 1 ? 'contacto' : `${count} contactos`}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Contact form modal ────────────────────────────────────────────────────────

function ContactFormModal({
  mode, contact, regions, teamsByRegion, roles, onSave, onClose,
}: {
  mode: 'add' | 'edit'
  contact?: Contact
  regions: string[]
  teamsByRegion: Map<string, Set<string>>
  roles: string[]
  onSave: (data: Omit<Contact, 'id'>) => void
  onClose: () => void
}) {
  const [name,    setName]    = useState(contact?.name    ?? '')
  const [role,    setRole]    = useState(contact?.role    ?? '')
  const [phone1,  setPhone1]  = useState(contact?.phone1  ?? '')
  const [phone2,  setPhone2]  = useState(contact?.phone2  ?? '')
  const [region,  setRegion]  = useState(contact?.region  ?? '')
  const [team,    setTeam]    = useState(contact?.team    ?? '')
  const [tier,    setTier]    = useState(contact?.tier    ?? '')
  const [noClub,  setNoClub]  = useState(contact?._noClub ?? false)
  const [teamInput, setTeamInput] = useState(contact?.team ?? '')
  const [showSugg,  setShowSugg]  = useState(false)
  const teamRef = useRef<HTMLDivElement>(null)

  const teamsForRegion = useMemo(() =>
    region ? [...(teamsByRegion.get(region) ?? [])].sort() : []
  , [region, teamsByRegion])

  const teamSuggestions = useMemo(() =>
    teamsForRegion.filter(t => {
      const ti = normalise(teamInput)
      return ti.length > 0 && normalise(t).includes(ti) && t !== teamInput
    })
  , [teamsForRegion, teamInput])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) setShowSugg(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name:     name  || undefined,
      role:     role  || undefined,
      phone1:   phone1 || undefined,
      phone2:   phone2 || undefined,
      region:   noClub ? 'Sin club' : (region || 'Sin clasificar'),
      team:     noClub ? undefined : (team || undefined),
      tier:     tier  || undefined,
      _noClub:  noClub || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">
            {mode === 'add' ? 'Nuevo contacto' : 'Editar contacto'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rol / Cargo</label>
            <input value={role} onChange={e => setRole(e.target.value)} list="roles-list" placeholder="Director deportivo, CEO…" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <datalist id="roles-list">{roles.map(r => <option key={r} value={r} />)}</datalist>
          </div>

          {/* Phones */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono 1</label>
              <input type="tel" value={phone1} onChange={e => setPhone1(e.target.value)} placeholder="+34 600…" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono 2</label>
              <input type="tel" value={phone2} onChange={e => setPhone2(e.target.value)} placeholder="Opcional" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>

          {/* Sin club toggle */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setNoClub(v => !v)}
              className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${noClub ? 'bg-amber-400' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${noClub ? 'left-4' : 'left-0.5'}`} />
            </button>
            <div>
              <p className="text-xs font-medium text-slate-700">Sin club / Libre</p>
              <p className="text-[11px] text-slate-400">Persona sin club asignado actualmente</p>
            </div>
            {noClub && <UserX className="w-4 h-4 text-amber-500 ml-auto" />}
          </div>

          {/* Region + Team (hidden if noClub) */}
          {!noClub && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Liga / Región *</label>
                <select value={region} onChange={e => { setRegion(e.target.value); setTeam(''); setTeamInput('') }} required className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Seleccionar región…</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div ref={teamRef}>
                <label className="block text-xs font-medium text-slate-600 mb-1">Club / Equipo</label>
                <div className="relative">
                  <input
                    value={teamInput}
                    onChange={e => { setTeamInput(e.target.value); setTeam(e.target.value); setShowSugg(true) }}
                    onFocus={() => setShowSugg(true)}
                    placeholder={region ? 'Escribe o elige club…' : 'Selecciona región primero'}
                    disabled={!region}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50"
                  />
                  {showSugg && teamSuggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {teamSuggestions.map(t => (
                        <button key={t} type="button"
                          onClick={() => { setTeam(t); setTeamInput(t); setShowSugg(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-700"
                        >{t}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Tier */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tier del club</label>
            <div className="flex gap-2 flex-wrap">
              {['', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(t => (
                <button key={t} type="button" onClick={() => setTier(t)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    tier === t
                      ? t === '' ? 'bg-slate-100 border-slate-300 text-slate-600'
                        : t === 'Tier 1' ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : t === 'Tier 2' ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : t === 'Tier 3' ? 'bg-slate-100 border-slate-300 text-slate-600'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {t || 'Sin tier'}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              {mode === 'add' ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
