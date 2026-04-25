import { useState, useMemo } from 'react'
import {
  ArrowLeft, Plus, Search, Star, Building2, Users,
  ChevronRight, X, Check, Pencil, Trash2, LogOut,
  TrendingUp, AlertCircle, CircleDot, Flag,
} from 'lucide-react'
import type { Player, Club, DistributionEntry, ClubNegotiation } from '../types'
import type { Profile } from '../contexts/AuthContext'

// ── constants ─────────────────────────────────────────────────

const SEASONS = ['2025-26', '2024-25']
const CONDITIONS = ['Libre', 'Traspaso', 'Cesión', 'Cesión/Traspaso', 'Traspaso (porcentaje)', 'Cesión con opción']
const NEG_STATUSES: ClubNegotiation['status'][] = ['ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado']

const STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string }> = {
  ofrecido:    { label: 'Ofrecido',    color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  interesado:  { label: 'Interesado',  color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  negociando:  { label: 'Negociando',  color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  cerrado:     { label: 'Cerrado',     color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  descartado:  { label: 'Descartado',  color: 'bg-red-100 text-red-600',       dot: 'bg-red-400' },
}

const PRIORITY_CONFIG = {
  A: { label: 'A', bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    ring: 'ring-red-400' },
  B: { label: 'B', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  ring: 'ring-amber-400' },
  C: { label: 'C', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  ring: 'ring-slate-400' },
}

// ── helpers ───────────────────────────────────────────────────

function genId() { return 'tmp_' + Math.random().toString(36).slice(2) }
function now() { return new Date().toISOString() }

function Avatar({ name, photo, size = 'sm' }: { name: string; photo?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (photo) return <img src={photo} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── props ─────────────────────────────────────────────────────

interface Props {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  negotiations: ClubNegotiation[]
  currentProfile: Profile
  onBack: () => void
  onLogout: () => void
  onAdmin?: () => void
  onSelectPlayer?: (id: string) => void
  onCreateClub: (c: Omit<Club, 'id' | 'createdAt'>) => Promise<Club>
  onUpdateClub: (c: Club) => Promise<void>
  onDeleteClub: (id: string) => Promise<void>
  onCreateEntry: (e: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<DistributionEntry>
  onUpdateEntry: (e: DistributionEntry) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  onUpdateNegotiation: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation: (id: string) => Promise<void>
}

// ── main component ────────────────────────────────────────────

export function Distribution({
  players, clubs, entries, negotiations, currentProfile,
  onBack, onLogout, onAdmin, onSelectPlayer,
  onCreateClub, onUpdateClub, onDeleteClub,
  onCreateEntry, onUpdateEntry, onDeleteEntry,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
}: Props) {
  const [tab, setTab] = useState<'jugadores' | 'clubes' | 'pipeline'>('jugadores')
  const [season, setSeason] = useState('2025-26')
  const [search, setSearch] = useState('')

  // panel state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

  // modals
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showAddClub, setShowAddClub] = useState(false)
  const [showAddNeg, setShowAddNeg] = useState<{ playerId?: string; clubId?: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<DistributionEntry | null>(null)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)

  const seasonEntries = entries.filter(e => e.season === season)
  const filteredEntries = useMemo(() => {
    if (!search) return seasonEntries
    const q = search.toLowerCase()
    return seasonEntries.filter(e => {
      const p = players.find(pl => pl.id === e.playerId)
      return p?.name.toLowerCase().includes(q)
    })
  }, [seasonEntries, search, players])

  const filteredClubs = useMemo(() => {
    if (!search) return clubs
    const q = search.toLowerCase()
    return clubs.filter(c => c.name.toLowerCase().includes(q) || c.league?.toLowerCase().includes(q))
  }, [clubs, search])

  const selectedEntry = seasonEntries.find(e => e.id === selectedEntryId) ?? null
  const selectedClub = clubs.find(c => c.id === selectedClubId) ?? null

  function closePanel() { setSelectedEntryId(null); setSelectedClubId(null) }
  const hasPanel = !!selectedEntry || !!selectedClub

  // group entries by priority
  const byPriority = useMemo(() => ({
    A: filteredEntries.filter(e => e.priority === 'A'),
    B: filteredEntries.filter(e => e.priority === 'B'),
    C: filteredEntries.filter(e => e.priority === 'C'),
  }), [filteredEntries])

  // pipeline columns
  const pipeline = useMemo(() => {
    const cols: Record<ClubNegotiation['status'], ClubNegotiation[]> = {
      ofrecido: [], interesado: [], negociando: [], cerrado: [], descartado: [],
    }
    negotiations.forEach(n => { cols[n.status].push(n) })
    return cols
  }, [negotiations])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 h-11 sm:h-14 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TrendingUp className="w-4 h-4 text-[hsl(220,72%,36%)] flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-sm sm:text-base">Distribución</span>
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            className="ml-2 text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50 text-slate-600"
          >
            {SEASONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {currentProfile.is_admin && onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100 hidden sm:block">Admin</button>
          )}
          <button onClick={onLogout} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-1">
        {(['jugadores', 'clubes', 'pipeline'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); closePanel() }}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-[hsl(220,72%,36%)] text-[hsl(220,72%,36%)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'jugadores' ? `Jugadores (${seasonEntries.length})` :
             t === 'clubes' ? `Clubes (${clubs.length})` :
             'Pipeline'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {tab !== 'pipeline' && (
        <div className="px-4 py-2 bg-white border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'jugadores' ? 'Buscar jugador…' : 'Buscar club…'}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-y-auto p-4 ${hasPanel ? 'hidden sm:block' : ''}`}>

          {/* ── JUGADORES TAB ── */}
          {tab === 'jugadores' && (
            <div className="space-y-4 max-w-3xl">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAddPlayer(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir jugador
                </button>
              </div>

              {(['A', 'B', 'C'] as const).map(pr => {
                const group = byPriority[pr]
                if (group.length === 0) return null
                const cfg = PRIORITY_CONFIG[pr]
                return (
                  <div key={pr}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-2 ${cfg.bg} ${cfg.text}`}>
                      <Flag className="w-3.5 h-3.5" /> Prioridad {pr} — {group.length} jugador{group.length !== 1 ? 'es' : ''}
                    </div>
                    <div className="space-y-2">
                      {group.map(entry => {
                        const player = players.find(p => p.id === entry.playerId)
                        if (!player) return null
                        const negCount = negotiations.filter(n => n.playerId === entry.playerId).length
                        const activeNegs = negotiations.filter(n => n.playerId === entry.playerId && !['descartado'].includes(n.status))
                        const topStatus = activeNegs.find(n => n.status === 'negociando')?.status
                          ?? activeNegs.find(n => n.status === 'interesado')?.status
                          ?? activeNegs.find(n => n.status === 'ofrecido')?.status
                          ?? activeNegs.find(n => n.status === 'cerrado')?.status

                        return (
                          <div
                            key={entry.id}
                            onClick={() => { setSelectedEntryId(entry.id); setSelectedClubId(null) }}
                            className={`bg-white rounded-xl border cursor-pointer hover:shadow-sm transition-all flex items-center gap-3 px-4 py-3 ${
                              selectedEntryId === entry.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'
                            }`}
                          >
                            <Avatar name={player.name} photo={player.photo} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-800 text-sm">{player.name}</span>
                                <span className="text-xs text-slate-400">{player.positions[0]}</span>
                                {entry.condition && (
                                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{entry.condition}</span>
                                )}
                                {entry.transferFee && (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{entry.transferFee}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {topStatus && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[topStatus].color}`}>
                                    {STATUS_CONFIG[topStatus].label}
                                  </span>
                                )}
                                {negCount > 0 && (
                                  <span className="text-xs text-slate-400">{negCount} club{negCount !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {filteredEntries.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {search ? 'Sin resultados' : 'No hay jugadores en distribución para esta temporada'}
                </div>
              )}
            </div>
          )}

          {/* ── CLUBES TAB ── */}
          {tab === 'clubes' && (
            <div className="space-y-2 max-w-3xl">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowAddClub(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir club
                </button>
              </div>

              {filteredClubs.map(club => {
                const offered = negotiations.filter(n => n.clubId === club.id)
                const activeNegs = offered.filter(n => !['descartado'].includes(n.status))
                return (
                  <div
                    key={club.id}
                    onClick={() => { setSelectedClubId(club.id); setSelectedEntryId(null) }}
                    className={`bg-white rounded-xl border cursor-pointer hover:shadow-sm transition-all flex items-center gap-3 px-4 py-3 ${
                      selectedClubId === club.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'
                    } ${club.isPriority ? 'border-l-4 border-l-green-400' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 text-sm">{club.name}</span>
                        {club.isPriority && <Star className="w-3.5 h-3.5 text-green-500 fill-green-500" />}
                        {club.league && <span className="text-xs text-slate-400">{club.league}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        {club.contactPerson && <span>{club.contactPerson}</span>}
                        {club.aisManager && <span className="font-mono bg-slate-100 px-1 rounded">{club.aisManager}</span>}
                        {activeNegs.length > 0 && (
                          <span className="text-blue-600">{activeNegs.length} ofrecido{activeNegs.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>
                )
              })}

              {filteredClubs.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {search ? 'Sin resultados' : 'No hay clubes. Añade uno.'}
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE TAB ── */}
          {tab === 'pipeline' && (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-3 min-w-max">
                {(NEG_STATUSES.filter(s => s !== 'descartado') as ClubNegotiation['status'][]).concat(['descartado'] as ClubNegotiation['status'][]).map(status => {
                  const col = pipeline[status]
                  const cfg = STATUS_CONFIG[status]
                  return (
                    <div key={status} className="w-56 flex-shrink-0">
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${cfg.color}`}>
                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className="text-xs font-semibold">{cfg.label}</span>
                        <span className="ml-auto text-xs opacity-70">{col.length}</span>
                      </div>
                      <div className="space-y-2">
                        {col.map(neg => {
                          const player = players.find(p => p.id === neg.playerId)
                          const club = clubs.find(c => c.id === neg.clubId)
                          if (!player || !club) return null
                          return (
                            <div
                              key={neg.id}
                              onClick={() => setEditingNeg(neg)}
                              className="bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:shadow-sm transition-all"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Avatar name={player.name} photo={player.photo} size="sm" />
                                <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                <Building2 className="w-3 h-3" />
                                <span className="truncate">{club.name}</span>
                              </div>
                              {neg.aisManager && (
                                <span className="text-xs font-mono bg-slate-100 px-1 rounded mt-1 inline-block">{neg.aisManager}</span>
                              )}
                              {neg.notes && (
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{neg.notes}</p>
                              )}
                            </div>
                          )
                        })}
                        {col.length === 0 && (
                          <div className="h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-lg">
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

        {/* ── SIDE PANEL ── */}
        {hasPanel && (
          <div className="w-full sm:w-[380px] flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto fixed sm:static inset-0 sm:inset-auto z-30">
            {selectedEntry && (() => {
              const player = players.find(p => p.id === selectedEntry.playerId)!
              const playerNegs = negotiations.filter(n => n.playerId === selectedEntry.playerId)
              const cfg = PRIORITY_CONFIG[selectedEntry.priority]
              return (
                <div className="h-full flex flex-col">
                  {/* Panel header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <Avatar name={player.name} photo={player.photo} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{player.name}</div>
                      <div className="text-xs text-slate-500">{player.positions[0]}</div>
                    </div>
                    <button
                      onClick={() => onSelectPlayer?.(player.id)}
                      className="text-xs text-blue-600 hover:underline flex-shrink-0"
                    >
                      Ver ficha
                    </button>
                  </div>

                  {/* Entry info */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                        Prioridad {selectedEntry.priority}
                      </span>
                      {selectedEntry.condition && (
                        <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                          {selectedEntry.condition}
                        </span>
                      )}
                      {selectedEntry.transferFee && (
                        <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded-full">
                          {selectedEntry.transferFee}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingEntry(selectedEntry)}
                        className="ml-auto p-1 text-slate-400 hover:text-slate-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {selectedEntry.notes && (
                      <p className="text-xs text-slate-500 mt-2">{selectedEntry.notes}</p>
                    )}
                  </div>

                  {/* Negotiations */}
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clubes ({playerNegs.length})</span>
                      <button
                        onClick={() => setShowAddNeg({ playerId: selectedEntry.playerId })}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Añadir club
                      </button>
                    </div>

                    <div className="space-y-2">
                      {playerNegs.map(neg => {
                        const club = clubs.find(c => c.id === neg.clubId)
                        if (!club) return null
                        const scfg = STATUS_CONFIG[neg.status]
                        return (
                          <div key={neg.id} className="bg-slate-50 rounded-lg p-3 flex items-start gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-slate-700">{club.name}</span>
                                {club.league && <span className="text-xs text-slate-400">{club.league}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                                {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                              </div>
                              {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                            </div>
                            <button
                              onClick={() => setEditingNeg(neg)}
                              className="ml-auto p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                      {playerNegs.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          Aún no se ha ofrecido a ningún club
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete entry */}
                  <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm('¿Quitar este jugador de distribución?')) return
                        await onDeleteEntry(selectedEntry.id)
                        closePanel()
                      }}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar de distribución
                    </button>
                  </div>
                </div>
              )
            })()}

            {selectedClub && (() => {
              const clubNegs = negotiations.filter(n => n.clubId === selectedClub.id)
              return (
                <div className="h-full flex flex-col">
                  {/* Panel header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
                    <button onClick={closePanel} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">{selectedClub.name}</div>
                      <div className="text-xs text-slate-500">{selectedClub.league}</div>
                    </div>
                    <button onClick={() => setEditingClub(selectedClub)} className="p-1 text-slate-400 hover:text-slate-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Club info */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-1.5">
                    {selectedClub.contactPerson && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-600">{selectedClub.contactPerson}</span>
                        <span className="text-xs text-slate-400">contacto del club</span>
                      </div>
                    )}
                    {selectedClub.aisManager && (
                      <div className="flex items-center gap-2 text-sm">
                        <CircleDot className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700">{selectedClub.aisManager}</span>
                        <span className="text-xs text-slate-400">gestor AIS</span>
                      </div>
                    )}
                    {selectedClub.isPriority && (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <Star className="w-3.5 h-3.5 fill-green-500" /> Club prioritario
                      </div>
                    )}
                    {selectedClub.notes && (
                      <p className="text-xs text-slate-500 mt-1">{selectedClub.notes}</p>
                    )}
                  </div>

                  {/* Needs */}
                  {selectedClub.needs.length > 0 && (
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Necesidades</div>
                      <div className="space-y-1">
                        {selectedClub.needs.map((need, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                            <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            <span className="font-medium">{need.position}</span>
                            {need.ageMax && <span>· sub-{need.ageMax}</span>}
                            {need.transferBudget && <span>· {need.transferBudget}</span>}
                            {need.notes && <span className="text-slate-400">· {need.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Negotiations */}
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ofrecidos ({clubNegs.length})</span>
                      <button
                        onClick={() => setShowAddNeg({ clubId: selectedClub.id })}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ofrecer jugador
                      </button>
                    </div>
                    <div className="space-y-2">
                      {clubNegs.map(neg => {
                        const player = players.find(p => p.id === neg.playerId)
                        const entry = entries.find(e => e.playerId === neg.playerId)
                        if (!player) return null
                        const scfg = STATUS_CONFIG[neg.status]
                        const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                        return (
                          <div key={neg.id} className="bg-slate-50 rounded-lg p-3 flex items-start gap-3">
                            <Avatar name={player.name} photo={player.photo} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-700">{player.name}</span>
                                {pcfg && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                                {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                              </div>
                              {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                            </div>
                            <button
                              onClick={() => setEditingNeg(neg)}
                              className="p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                      {clubNegs.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          Sin jugadores ofrecidos aún
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete club */}
                  <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm('¿Eliminar este club?')) return
                        await onDeleteClub(selectedClub.id)
                        closePanel()
                      }}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar club
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Add player to distribution */}
      {showAddPlayer && (
        <AddPlayerModal
          players={players}
          existingPlayerIds={seasonEntries.map(e => e.playerId)}
          season={season}
          onClose={() => setShowAddPlayer(false)}
          onSave={async (data) => {
            const saved = await onCreateEntry(data)
            setSelectedEntryId(saved.id)
            setShowAddPlayer(false)
          }}
        />
      )}

      {/* Add club */}
      {showAddClub && (
        <AddClubModal
          onClose={() => setShowAddClub(false)}
          onSave={async (data) => {
            const saved = await onCreateClub(data)
            setSelectedClubId(saved.id)
            setShowAddClub(false)
          }}
        />
      )}

      {/* Add negotiation */}
      {showAddNeg && (
        <AddNegotiationModal
          players={players}
          clubs={clubs}
          entries={entries}
          fixedPlayerId={showAddNeg.playerId}
          fixedClubId={showAddNeg.clubId}
          onClose={() => setShowAddNeg(null)}
          onSave={async (data) => {
            await onCreateNegotiation(data)
            setShowAddNeg(null)
          }}
        />
      )}

      {/* Edit entry */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (data) => {
            await onUpdateEntry({ ...editingEntry, ...data })
            setEditingEntry(null)
          }}
        />
      )}

      {/* Edit club */}
      {editingClub && (
        <EditClubModal
          club={editingClub}
          onClose={() => setEditingClub(null)}
          onSave={async (data) => {
            await onUpdateClub({ ...editingClub, ...data })
            setEditingClub(null)
          }}
        />
      )}

      {/* Edit negotiation */}
      {editingNeg && (
        <EditNegotiationModal
          neg={editingNeg}
          clubs={clubs}
          players={players}
          onClose={() => setEditingNeg(null)}
          onSave={async (data) => {
            await onUpdateNegotiation({ ...editingNeg, ...data })
            setEditingNeg(null)
          }}
          onDelete={async () => {
            await onDeleteNegotiation(editingNeg.id)
            setEditingNeg(null)
          }}
        />
      )}
    </div>
  )
}

// ── ADD PLAYER MODAL ──────────────────────────────────────────

function AddPlayerModal({ players, existingPlayerIds, season, onClose, onSave }: {
  players: Player[]
  existingPlayerIds: string[]
  season: string
  onClose: () => void
  onSave: (data: Omit<DistributionEntry, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('B')
  const [condition, setCondition] = useState('')
  const [transferFee, setTransferFee] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const available = players.filter(p =>
    !existingPlayerIds.includes(p.id) &&
    (p.name.toLowerCase().includes(query.toLowerCase()))
  )

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await onSave({
        playerId: selected.id,
        season,
        priority,
        condition: condition || undefined,
        transferFee: transferFee || undefined,
        notes: notes || undefined,
        active: true,
      })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir jugador a distribución" onClose={onClose}>
      {!selected ? (
        <div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar jugador…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-2"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {available.slice(0, 20).map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left"
              >
                <Avatar name={p.name} photo={p.photo} />
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.positions[0]}</div>
                </div>
              </button>
            ))}
            {available.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-4">Sin resultados</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
            <Avatar name={selected.name} photo={selected.photo} size="md" />
            <div>
              <div className="font-medium text-slate-800">{selected.name}</div>
              <div className="text-xs text-slate-500">{selected.positions[0]}</div>
            </div>
            <button onClick={() => setSelected(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Priority — tap to select */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Prioridad</label>
            <div className="flex gap-2">
              {(['A', 'B', 'C'] as const).map(p => {
                const cfg = PRIORITY_CONFIG[p]
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${
                      priority === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >{p}</button>
                )
              })}
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Condición de salida</label>
            <select
              value={condition}
              onChange={e => setCondition(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Sin especificar</option>
              {CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Fee (only if traspaso) */}
          {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Importe</label>
              <input
                value={transferFee}
                onChange={e => setTransferFee(e.target.value)}
                placeholder="Ej: 400k, 2M…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Añadir a distribución'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ── ADD CLUB MODAL ────────────────────────────────────────────

function AddClubModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: Omit<Club, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [league, setLeague] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [aisManager, setAisManager] = useState('')
  const [notes, setNotes] = useState('')
  const [isPriority, setIsPriority] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), league: league || undefined, country: 'Spain', contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority, needs: [] })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre *</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Deportivo, Racing…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input value={league} onChange={e => setLeague(e.target.value)} placeholder="Spain 2, Spain 3, Greece…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Nombre del contacto" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-slate-600">Club prioritario</span>
          <Star className="w-3.5 h-3.5 text-green-500" />
        </label>
        <button onClick={handleSave} disabled={!name.trim() || saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Añadir club'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── ADD NEGOTIATION MODAL ─────────────────────────────────────

function AddNegotiationModal({ players, clubs, entries, fixedPlayerId, fixedClubId, onClose, onSave }: {
  players: Player[]
  clubs: Club[]
  entries: DistributionEntry[]
  fixedPlayerId?: string
  fixedClubId?: string
  onClose: () => void
  onSave: (data: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const distributionPlayerIds = entries.map(e => e.playerId)
  const [playerId, setPlayerId] = useState(fixedPlayerId ?? '')
  const [clubId, setClubId] = useState(fixedClubId ?? '')
  const [status, setStatus] = useState<ClubNegotiation['status']>('ofrecido')
  const [aisManager, setAisManager] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectablePlayers = players.filter(p => distributionPlayerIds.includes(p.id))

  async function handleSave() {
    if (!playerId || !clubId) return
    setSaving(true)
    try {
      await onSave({ playerId, clubId, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Añadir negociación" onClose={onClose}>
      <div className="space-y-3">
        {!fixedPlayerId && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Jugador *</label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Seleccionar jugador…</option>
              {selectablePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {!fixedClubId && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Club *</label>
            <select value={clubId} onChange={e => setClubId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Seleccionar club…</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}{c.league ? ` (${c.league})` : ''}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
          <div className="flex flex-wrap gap-1.5">
            {NEG_STATUSES.map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${status === s ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500'}`}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF, LT…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="El club está interesado…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <button onClick={handleSave} disabled={!playerId || !clubId || saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT ENTRY MODAL ──────────────────────────────────────────

function EditEntryModal({ entry, onClose, onSave }: {
  entry: DistributionEntry
  onClose: () => void
  onSave: (data: Partial<DistributionEntry>) => Promise<void>
}) {
  const [priority, setPriority] = useState(entry.priority)
  const [condition, setCondition] = useState(entry.condition ?? '')
  const [transferFee, setTransferFee] = useState(entry.transferFee ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ priority, condition: condition || undefined, transferFee: transferFee || undefined, notes: notes || undefined }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar distribución" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Prioridad</label>
          <div className="flex gap-2">
            {(['A', 'B', 'C'] as const).map(p => {
              const cfg = PRIORITY_CONFIG[p]
              return (
                <button key={p} onClick={() => setPriority(p)} className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${priority === p ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-400 border-slate-200'}`}>{p}</button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Condición</label>
          <select value={condition} onChange={e => setCondition(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            <option value="">Sin especificar</option>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        {(condition.includes('Traspaso') || condition.includes('traspaso')) && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Importe</label>
            <input value={transferFee} onChange={e => setTransferFee(e.target.value)} placeholder="400k, 2M…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT CLUB MODAL ───────────────────────────────────────────

function EditClubModal({ club, onClose, onSave }: {
  club: Club
  onClose: () => void
  onSave: (data: Partial<Club>) => Promise<void>
}) {
  const [name, setName] = useState(club.name)
  const [league, setLeague] = useState(club.league ?? '')
  const [contactPerson, setContactPerson] = useState(club.contactPerson ?? '')
  const [aisManager, setAisManager] = useState(club.aisManager ?? '')
  const [notes, setNotes] = useState(club.notes ?? '')
  const [isPriority, setIsPriority] = useState(club.isPriority)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ name, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar club" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input value={league} onChange={e => setLeague(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
            <input value={aisManager} onChange={e => setAisManager(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-slate-600">Club prioritario</span>
        </label>
        <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EDIT NEGOTIATION MODAL ────────────────────────────────────

function EditNegotiationModal({ neg, clubs, players, onClose, onSave, onDelete }: {
  neg: ClubNegotiation
  clubs: Club[]
  players: Player[]
  onClose: () => void
  onSave: (data: Partial<ClubNegotiation>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [status, setStatus] = useState(neg.status)
  const [aisManager, setAisManager] = useState(neg.aisManager ?? '')
  const [notes, setNotes] = useState(neg.notes ?? '')
  const [saving, setSaving] = useState(false)
  const player = players.find(p => p.id === neg.playerId)
  const club = clubs.find(c => c.id === neg.clubId)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ status, aisManager: aisManager || undefined, notes: notes || undefined }) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar negociación" onClose={onClose}>
      <div className="space-y-3">
        {player && club && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
            <Avatar name={player.name} photo={player.photo} />
            <span className="font-medium">{player.name}</span>
            <span className="text-slate-400">→</span>
            <Building2 className="w-4 h-4 text-slate-400" />
            <span>{club.name}</span>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
          <div className="flex flex-wrap gap-1.5">
            {NEG_STATUSES.map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${status === s ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500'}`}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { if (!confirm('¿Eliminar esta negociación?')) return; await onDelete() }}
            className="flex-1 py-2 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50"
          >
            Eliminar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)] disabled:opacity-60">
            {saving ? '…' : <span className="flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Guardar</span>}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── MODAL SHELL ───────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl sm:rounded-t-2xl">
          <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// suppress unused import warnings
void genId
void now
