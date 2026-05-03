import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, Phone, X, ArrowLeft, Users } from 'lucide-react'
import { CONTACTS as ALL_CONTACTS, type Contact } from '../data/contactos'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_REGIONS = new Set(['Agents', 'COACHS', 'PLAYERS', 'FEDERACIONES', 'Coach'])

/** Only real club contacts: exclude special categories and rows with no name + no phone */
const CONTACTS = ALL_CONTACTS.filter(c => {
  if (EXCLUDED_REGIONS.has(c.region ?? '')) return false
  if (!c.name && !c.phone1 && !c.phone2) return false
  return true
})

/** All unique regions from filtered set, sorted */
const ALL_REGIONS = [...new Set(CONTACTS.map(c => c.region ?? 'Sin clasificar'))]
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b))

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  'Tier 1': { bg: 'bg-amber-100', text: 'text-amber-800' },
  'Tier 2': { bg: 'bg-blue-50',   text: 'text-blue-700' },
  'Tier 3': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'Tier 4': { bg: 'bg-slate-50',  text: 'text-slate-400' },
}

function tierBadge(tier?: string) {
  if (!tier) return null
  const cls = TIER_COLORS[tier] ?? { bg: 'bg-slate-100', text: 'text-slate-500' }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls.bg} ${cls.text}`}>
      {tier}
    </span>
  )
}

function normalise(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Main component ────────────────────────────────────────────────────────────

export function Contactos({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const q = normalise(search.trim())

  // When searching, ignore region filter and show all matches
  const isSearching = q.length > 1

  // Filter contacts
  const filtered = useMemo<Contact[]>(() => {
    if (!isSearching && !selectedRegion) return CONTACTS
    return CONTACTS.filter(c => {
      const regionMatch = !selectedRegion || (c.region ?? 'Sin clasificar') === selectedRegion
      if (!isSearching) return regionMatch
      const haystack = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
      return haystack.includes(q)
    })
  }, [isSearching, selectedRegion, q])

  // Group by region → team
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Contact[]>>()
    for (const c of filtered) {
      const region = c.region ?? 'Sin clasificar'
      const team = c.team ?? '—'
      if (!map.has(region)) map.set(region, new Map())
      const teams = map.get(region)!
      if (!teams.has(team)) teams.set(team, [])
      teams.get(team)!.push(c)
    }
    return map
  }, [filtered])

  // Region list for sidebar (counts filtered)
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      m.set(r, (m.get(r) ?? 0) + 1)
    }
    return m
  }, [])

  function toggleTeam(key: string) {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // When searching, auto-expand all teams
  const effectiveExpanded = isSearching
    ? new Set([...grouped.values()].flatMap(teams => [...teams.keys()]))
    : expandedTeams

  const totalFiltered = filtered.length

  // Regions to show in the main area
  const regionsToShow = isSearching
    ? [...grouped.keys()].sort((a, b) => a.localeCompare(b))
    : selectedRegion
      ? [selectedRegion]
      : []

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 -ml-1 rounded hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-800">Contactos</span>
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-semibold uppercase tracking-wide">Admin</span>
          </div>
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nombre, equipo, teléfono…"
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
        {/* ── Sidebar: Region list ── */}
        <aside className="w-56 flex-shrink-0 mr-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden sticky top-20">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Regiones</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
              {ALL_REGIONS.map(region => {
                const count = regionCounts.get(region) ?? 0
                const active = selectedRegion === region && !isSearching
                return (
                  <button
                    key={region}
                    onClick={() => {
                      setSelectedRegion(active ? null : region)
                      setSearch('')
                      setExpandedTeams(new Set())
                    }}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-800 font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
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
          {/* State: nothing selected */}
          {!isSearching && !selectedRegion && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Selecciona una región</p>
              <p className="text-xs text-slate-400 mt-1">{CONTACTS.length.toLocaleString()} contactos en {ALL_REGIONS.length} regiones</p>
            </div>
          )}

          {/* Stats bar when searching */}
          {isSearching && (
            <div className="mb-3 text-xs text-slate-500">
              {totalFiltered} resultado{totalFiltered !== 1 ? 's' : ''} para «{search}»
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
                  {isSearching && (
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{region}</h2>
                      <span className="text-[11px] text-slate-400">{totalInRegion} contacto{totalInRegion !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {teamList.map(([team, contacts]) => {
                      const key = `${region}::${team}`
                      const isOpen = effectiveExpanded.has(key) || isSearching
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
                            </div>
                            {isOpen
                              ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            }
                          </button>

                          {/* Contacts list */}
                          {isOpen && (
                            <div className="border-t border-slate-100 divide-y divide-slate-50">
                              {contacts.map((c, i) => (
                                <ContactRow key={i} contact={c} />
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

          {/* Empty search result */}
          {isSearching && totalFiltered === 0 && (
            <div className="text-center py-16 text-sm text-slate-400">
              Sin resultados para «{search}»
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({ contact: c }: { contact: Contact }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-slate-500">
          {initials(c.name)}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">
            {c.name ?? <span className="text-slate-400 italic">Sin nombre</span>}
          </span>
          {c.role && (
            <span className="text-xs text-slate-500">{c.role}</span>
          )}
          {c.tier && tierBadge(c.tier)}
        </div>
        {/* Phones */}
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.phone2 && <PhoneLink phone={c.phone2} />}
        </div>
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

function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}
