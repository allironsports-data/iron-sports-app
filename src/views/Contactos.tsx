import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Search, ChevronRight, ChevronDown, Phone, X, ArrowLeft,
  Users, Star, Plus, Pencil, Filter, Check,
} from 'lucide-react'
import { CONTACTS as STATIC_CONTACTS, type Contact } from '../data/contactos'

// ── LocalStorage keys ─────────────────────────────────────────────────────────

const LS_FAVORITES = 'ais_contact_favorites'
const LS_EXTRA     = 'ais_extra_contacts'
const LS_OVERRIDES = 'ais_contact_overrides'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_REGIONS = new Set(['Agents', 'COACHS', 'PLAYERS', 'FEDERACIONES', 'Coach'])

function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVORITES) ?? '[]')) } catch { return new Set() }
}
function saveFavorites(ids: Set<string>) {
  localStorage.setItem(LS_FAVORITES, JSON.stringify([...ids]))
}
function loadExtra(): Contact[] {
  try { return JSON.parse(localStorage.getItem(LS_EXTRA) ?? '[]') } catch { return [] }
}
function saveExtra(cs: Contact[]) {
  localStorage.setItem(LS_EXTRA, JSON.stringify(cs))
}
function loadOverrides(): Record<string, Partial<Contact>> {
  try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) ?? '{}') } catch { return {} }
}
function saveOverrides(o: Record<string, Partial<Contact>>) {
  localStorage.setItem(LS_OVERRIDES, JSON.stringify(o))
}

function generateId(c: Omit<Contact, 'id'>): string {
  const str = `${c.name}|${c.team}|${c.region}|${c.role}`
  let h = 0
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0 }
  return 'custom_' + Math.abs(h).toString(16).padStart(8, '0')
}

function normalise(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls.bg} ${cls.text}`}>
      {tier}
    </span>
  )
}

function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

// ── Main component ────────────────────────────────────────────────────────────

interface ModalState { mode: 'add' | 'edit'; contact?: Contact }

export function Contactos({ onBack }: { onBack: () => void }) {

  // ── Persistent data ──
  const [extraContacts, setExtraContacts] = useState<Contact[]>(loadExtra)
  const [overrides,     setOverrides]     = useState<Record<string, Partial<Contact>>>(loadOverrides)
  const [favorites,     setFavorites]     = useState<Set<string>>(loadFavorites)

  // ── UI state ──
  const [search,         setSearch]         = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [showFavorites,  setShowFavorites]  = useState(false)
  const [expandedTeams,  setExpandedTeams]  = useState<Set<string>>(new Set())
  const [roleFilter,     setRoleFilter]     = useState<string | null>(null)
  const [tierFilter,     setTierFilter]     = useState<string | null>(null)
  const [modal,          setModal]          = useState<ModalState | null>(null)

  // ── Merged contact list ──
  const ALL_CONTACTS = useMemo(() => {
    const base = STATIC_CONTACTS
      .filter(c => !EXCLUDED_REGIONS.has(c.region ?? '') && (c.name || c.phone1 || c.phone2))
      .map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c)
    return [...base, ...extraContacts]
  }, [extraContacts, overrides])

  const ALL_REGIONS = useMemo(() =>
    [...new Set(ALL_CONTACTS.map(c => c.region ?? 'Sin clasificar'))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  , [ALL_CONTACTS])

  const ALL_ROLES = useMemo(() =>
    [...new Set(ALL_CONTACTS.map(c => c.role).filter((r): r is string => !!r))].sort()
  , [ALL_CONTACTS])

  // Map region → set of all teams (for auto-expand)
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

  // ── Filter contacts ──
  const filtered = useMemo<Contact[]>(() => {
    let cs = ALL_CONTACTS
    if (roleFilter) cs = cs.filter(c => c.role === roleFilter)
    if (tierFilter) cs = cs.filter(c => c.tier === tierFilter)
    if (showFavorites) return cs.filter(c => favorites.has(c.id))
    if (!isSearching && !selectedRegion) return cs
    return cs.filter(c => {
      const regionOk = !selectedRegion || (c.region ?? 'Sin clasificar') === selectedRegion
      if (!isSearching) return regionOk
      const hay = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
      return hay.includes(q)
    })
  }, [ALL_CONTACTS, roleFilter, tierFilter, showFavorites, favorites, isSearching, selectedRegion, q])

  // ── Group by region → team ──
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Contact[]>>()
    for (const c of filtered) {
      const region = c.region ?? 'Sin clasificar'
      const team   = c.team   ?? '—'
      if (!map.has(region)) map.set(region, new Map())
      const teams = map.get(region)!
      if (!teams.has(team)) teams.set(team, [])
      teams.get(team)!.push(c)
    }
    return map
  }, [filtered])

  // Region counts (unfiltered total)
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of ALL_CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      m.set(r, (m.get(r) ?? 0) + 1)
    }
    return m
  }, [ALL_CONTACTS])

  // ── Auto-expand when region is selected ──
  useEffect(() => {
    if (!selectedRegion) return
    const keys = new Set<string>()
    for (const t of teamsByRegion.get(selectedRegion) ?? []) keys.add(`${selectedRegion}::${t}`)
    setExpandedTeams(keys)
  }, [selectedRegion, teamsByRegion])

  // When searching or showing favourites → expand all visible teams
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
      saveFavorites(next)
      return next
    })
  }, [])

  // ── Add / Edit contact ──
  function handleSave(data: Omit<Contact, 'id'>) {
    if (!modal) return
    if (modal.mode === 'add') {
      const id = generateId(data)
      const nc: Contact = { ...data, id }
      const updated = [...extraContacts, nc]
      setExtraContacts(updated)
      saveExtra(updated)
    } else if (modal.contact) {
      const { id } = modal.contact
      if (extraContacts.some(c => c.id === id)) {
        const updated = extraContacts.map(c => c.id === id ? { ...data, id } : c)
        setExtraContacts(updated)
        saveExtra(updated)
      } else {
        const upd = { ...overrides, [id]: data }
        setOverrides(upd)
        saveOverrides(upd)
      }
    }
    setModal(null)
  }

  // Sidebar helper
  function selectRegion(region: string) {
    setSelectedRegion(prev => prev === region ? null : region)
    setShowFavorites(false)
    setSearch('')
  }

  const regionsToShow = (isSearching || showFavorites)
    ? [...grouped.keys()].sort((a, b) => a.localeCompare(b))
    : selectedRegion ? [selectedRegion] : []

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 -ml-1 rounded hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-800 mr-1">Contactos</span>
          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-semibold uppercase tracking-wide">Admin</span>

          <div className="flex-1" />

          {/* Role filter */}
          <SelectFilter
            value={roleFilter ?? ''}
            onChange={v => setRoleFilter(v || null)}
            placeholder="Rol: todos"
            options={ALL_ROLES}
            active={!!roleFilter}
          />

          {/* Tier filter */}
          <SelectFilter
            value={tierFilter ?? ''}
            onChange={v => setTierFilter(v || null)}
            placeholder="Tier: todos"
            options={['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4']}
            active={!!tierFilter}
          />

          {/* Add contact */}
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) { setSelectedRegion(null); setShowFavorites(false) } }}
              placeholder="Buscar nombre, equipo…"
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
        <aside className="w-56 flex-shrink-0 mr-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden sticky top-20">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Regiones</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
              {/* Favoritos */}
              <button
                onClick={() => { setShowFavorites(true); setSelectedRegion(null); setSearch('') }}
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

              {/* Region list */}
              {ALL_REGIONS.map(region => {
                const count = regionCounts.get(region) ?? 0
                const active = selectedRegion === region && !isSearching && !showFavorites
                return (
                  <button
                    key={region}
                    onClick={() => selectRegion(region)}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                      active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate flex-1 min-w-0">{region}</span>
                    <span className={`ml-2 flex-shrink-0 text-[11px] rounded-full px-1.5 ${
                      active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                    }`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="flex-1 min-w-0">
          {/* Empty state */}
          {!isSearching && !selectedRegion && !showFavorites && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Selecciona una región</p>
              <p className="text-xs text-slate-400 mt-1">
                {ALL_CONTACTS.length.toLocaleString()} contactos · {ALL_REGIONS.length} regiones
                {(roleFilter || tierFilter) && (
                  <span className="text-blue-500"> · filtros activos</span>
                )}
              </p>
            </div>
          )}

          {/* Favorites header */}
          {showFavorites && !isSearching && (
            <div className="mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-semibold text-slate-700">Favoritos</span>
              <span className="text-xs text-slate-400">{filtered.length} contacto{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Search results info */}
          {isSearching && (
            <div className="mb-3 text-xs text-slate-500">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para «{search}»
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
                      <span className="text-[11px] text-slate-400">{totalInRegion} contacto{totalInRegion !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {teamList.map(([team, contacts]) => {
                      const key = `${region}::${team}`
                      const isOpen = effectiveExpanded.has(key)
                      return (
                        <div key={key} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          {/* Team header */}
                          <button
                            onClick={() => toggleTeam(key)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-semibold text-slate-800 truncate">{team}</span>
                              <span className="text-[11px] text-slate-400 flex-shrink-0">
                                {contacts.length} contacto{contacts.length !== 1 ? 's' : ''}
                              </span>
                              {/* Tier badge on first contact with a tier (team-level) */}
                              {contacts[0]?.tier && <TierBadge tier={contacts[0].tier} />}
                            </div>
                            {isOpen
                              ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            }
                          </button>

                          {/* Contacts list — always visible when open */}
                          {isOpen && (
                            <div className="border-t border-slate-100 divide-y divide-slate-50">
                              {contacts.map((c, i) => (
                                <ContactRow
                                  key={i}
                                  contact={c}
                                  isFavorite={favorites.has(c.id)}
                                  onToggleFavorite={() => toggleFavorite(c.id)}
                                  onEdit={() => setModal({ mode: 'edit', contact: c })}
                                />
                              ))}
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
          {showFavorites && filtered.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <Star className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm">No tienes contactos favoritos aún.</p>
              <p className="text-xs mt-1">Pulsa ★ en cualquier contacto para añadirlo.</p>
            </div>
          )}

          {/* Empty search */}
          {isSearching && filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-slate-400">
              Sin resultados para «{search}»
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
    </div>
  )
}

// ── Select filter ─────────────────────────────────────────────────────────────

function SelectFilter({
  value, onChange, placeholder, options, active,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
  active: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`pl-2 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none cursor-pointer ${
          active ? 'border-blue-300 text-blue-700 font-medium' : 'border-slate-200 text-slate-600'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <Filter className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({
  contact: c, isFavorite, onToggleFavorite, onEdit,
}: {
  contact: Contact
  isFavorite: boolean
  onToggleFavorite: () => void
  onEdit: () => void
}) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors group">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-slate-500">{initials(c.name)}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">
            {c.name ?? <span className="text-slate-400 italic">Sin nombre</span>}
          </span>
          {c.role && <span className="text-xs text-slate-500">{c.role}</span>}
          {c.tier && <TierBadge tier={c.tier} />}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.phone2 && <PhoneLink phone={c.phone2} />}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <button
          onClick={onEdit}
          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
          title="Editar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleFavorite}
          className={`p-1 rounded hover:bg-slate-200 transition-colors ${isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
          title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400' : ''}`} />
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
  const [name,   setName]   = useState(contact?.name   ?? '')
  const [role,   setRole]   = useState(contact?.role   ?? '')
  const [phone1, setPhone1] = useState(contact?.phone1 ?? '')
  const [phone2, setPhone2] = useState(contact?.phone2 ?? '')
  const [region, setRegion] = useState(contact?.region ?? '')
  const [team,   setTeam]   = useState(contact?.team   ?? '')
  const [tier,   setTier]   = useState(contact?.tier   ?? '')
  const [teamInput, setTeamInput] = useState(contact?.team ?? '')
  const [showTeamSuggestions, setShowTeamSuggestions] = useState(false)
  const teamRef = useRef<HTMLDivElement>(null)

  const teamsForRegion = useMemo(() =>
    region ? [...(teamsByRegion.get(region) ?? [])].sort() : []
  , [region, teamsByRegion])

  const teamSuggestions = useMemo(() =>
    teamsForRegion.filter(t => normalise(t).includes(normalise(teamInput)) && t !== teamInput)
  , [teamsForRegion, teamInput])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name:   name || undefined,
      role:   role || undefined,
      phone1: phone1 || undefined,
      phone2: phone2 || undefined,
      region: region || 'Sin clasificar',
      team:   team || undefined,
      tier:   tier || undefined,
    })
  }

  // Close suggestions on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) {
        setShowTeamSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">
            {mode === 'add' ? 'Nuevo contacto' : 'Editar contacto'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Region */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Liga / Región *</label>
            <select
              value={region}
              onChange={e => { setRegion(e.target.value); setTeam(''); setTeamInput('') }}
              required
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Seleccionar región…</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Team (autocomplete) */}
          <div ref={teamRef}>
            <label className="block text-xs font-medium text-slate-600 mb-1">Club / Equipo</label>
            <div className="relative">
              <input
                value={teamInput}
                onChange={e => { setTeamInput(e.target.value); setTeam(e.target.value); setShowTeamSuggestions(true) }}
                onFocus={() => setShowTeamSuggestions(true)}
                placeholder={region ? 'Escribe o elige club…' : 'Selecciona región primero'}
                disabled={!region}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50"
              />
              {showTeamSuggestions && teamSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {teamSuggestions.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTeam(t); setTeamInput(t); setShowTeamSuggestions(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-700"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Role */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Rol / Cargo</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                list="roles-list"
                placeholder="Director deportivo, CEO…"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <datalist id="roles-list">
                {roles.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            {/* Phone 1 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono 1</label>
              <input
                type="tel"
                value={phone1}
                onChange={e => setPhone1(e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Phone 2 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono 2</label>
              <input
                type="tel"
                value={phone2}
                onChange={e => setPhone2(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Tier */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Tier del club</label>
              <div className="flex gap-2">
                {['', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      tier === t
                        ? t === '' ? 'bg-slate-100 border-slate-300 text-slate-600' :
                          t === 'Tier 1' ? 'bg-amber-100 border-amber-300 text-amber-800' :
                          t === 'Tier 2' ? 'bg-blue-50 border-blue-300 text-blue-700' :
                          t === 'Tier 3' ? 'bg-slate-100 border-slate-300 text-slate-600' :
                          'bg-slate-50 border-slate-200 text-slate-400'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {t || 'Sin tier'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {mode === 'add' ? 'Crear contacto' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
