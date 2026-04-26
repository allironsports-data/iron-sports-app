import { useState, useMemo } from 'react'
import {
  ArrowLeft, Building2, Star, Plus, X, Pencil,
  ChevronRight, Trash2, Check, LogOut, AlertCircle, Phone,
} from 'lucide-react'
import type { Club, ClubNegotiation, DistributionEntry, Player, ClubNeed } from '../types'
import type { Profile } from '../contexts/AuthContext'

// ── constants ─────────────────────────────────────────────────

const NEG_STATUSES: ClubNegotiation['status'][] = [
  'pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado',
]

const STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-400' },
  ofrecido:    { label: 'Ofrecido',    color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  interesado:  { label: 'Interesado',  color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  negociando:  { label: 'Negociando',  color: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  cerrado:     { label: 'Cerrado',     color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  descartado:  { label: 'Descartado',  color: 'bg-red-100 text-red-600',        dot: 'bg-red-400' },
}

const PRIORITY_CONFIG = {
  A: { bg: 'bg-red-100',   text: 'text-red-700',   label: 'A' },
  B: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'B' },
  C: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'C' },
}

const ACTIVE_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']

// ── types ─────────────────────────────────────────────────────

type TabId = 'jugadores' | 'necesidades' | 'info'

interface Props {
  club: Club
  players: Player[]
  entries: DistributionEntry[]
  negotiations: ClubNegotiation[]
  currentProfile: Profile
  onBack: () => void
  onLogout: () => void
  onAdmin?: () => void
  onSelectPlayer: (id: string) => void
  onUpdateClub: (c: Club) => Promise<void>
  onDeleteClub: (id: string) => Promise<void>
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  onUpdateNegotiation: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation: (id: string) => Promise<void>
}

// ── helpers ───────────────────────────────────────────────────

function Avatar({ name, photo, size = 'sm' }: { name: string; photo?: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-base'
  if (photo) return <img src={photo} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── main component ────────────────────────────────────────────

export function ClubDetail({
  club, players, entries, negotiations, currentProfile,
  onBack, onLogout, onAdmin, onSelectPlayer,
  onUpdateClub, onDeleteClub,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('jugadores')
  const [statusFilter, setStatusFilter] = useState<ClubNegotiation['status'] | 'todos'>('todos')

  // modals
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAddNeed, setShowAddNeed] = useState(false)
  const [editingNeed, setEditingNeed] = useState<{ index: number; need: ClubNeed } | null>(null)

  const clubNegs = negotiations.filter(n => n.clubId === club.id)

  const filteredNegs = useMemo(() => {
    if (statusFilter === 'todos') return clubNegs
    return clubNegs.filter(n => n.status === statusFilter)
  }, [clubNegs, statusFilter])

  // count by status
  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = {}
    clubNegs.forEach(n => { counts[n.status] = (counts[n.status] ?? 0) + 1 })
    return counts
  }, [clubNegs])

  const activeCount = clubNegs.filter(n => ACTIVE_STATUSES.includes(n.status)).length

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'jugadores', label: 'Jugadores', badge: clubNegs.length || undefined },
    { id: 'necesidades', label: 'Necesidades', badge: club.needs.length || undefined },
    { id: 'info', label: 'Info' },
  ]

  async function handleStatusChange(neg: ClubNegotiation, status: ClubNegotiation['status']) {
    await onUpdateNegotiation({ ...neg, status })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 h-11 sm:h-14 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-slate-800 text-sm sm:text-base truncate">{club.name}</h1>
            {club.isPriority && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />}
          </div>
          {club.league && <p className="text-xs text-slate-500">{club.league}</p>}
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {activeCount} activo{activeCount !== 1 ? 's' : ''}
            </span>
          )}
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
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'border-[hsl(220,72%,36%)] text-[hsl(220,72%,36%)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${activeTab === t.id ? 'bg-[hsl(220,72%,36%)] text-white' : 'bg-slate-100 text-slate-500'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24 sm:pb-4">

        {/* ── JUGADORES TAB ── */}
        {activeTab === 'jugadores' && (
          <div className="max-w-2xl space-y-3">
            {/* Status filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${statusFilter === 'todos' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
              >
                Todos ({clubNegs.length})
              </button>
              {NEG_STATUSES.filter(s => (countByStatus[s] ?? 0) > 0).map(s => {
                const cfg = STATUS_CONFIG[s]
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${statusFilter === s ? cfg.color + ' ring-1 ring-current' : 'bg-white border border-slate-200 text-slate-500'}`}
                  >
                    {cfg.label} ({countByStatus[s]})
                  </button>
                )
              })}
            </div>

            {/* Add player button */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddPlayer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)]"
              >
                <Plus className="w-4 h-4" /> Añadir jugador
              </button>
            </div>

            {/* Player list */}
            <div className="space-y-2">
              {filteredNegs.map(neg => {
                const player = players.find(p => p.id === neg.playerId)
                if (!player) return null
                const entry = entries.find(e => e.playerId === neg.playerId)
                const scfg = STATUS_CONFIG[neg.status]
                return (
                  <div key={neg.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                    <Avatar name={player.name} photo={player.photo} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800 text-sm">{player.name}</span>
                        <span className="text-xs text-slate-400">{player.positions[0]}</span>
                        {entry && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${PRIORITY_CONFIG[entry.priority].bg} ${PRIORITY_CONFIG[entry.priority].text}`}>
                            {entry.priority}
                          </span>
                        )}
                        {entry?.condition && (
                          <span className="text-xs text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{entry.condition}</span>
                        )}
                      </div>
                      {neg.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{neg.notes}</p>}
                      {neg.aisManager && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">{neg.aisManager}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Status dropdown */}
                      <select
                        value={neg.status}
                        onChange={e => handleStatusChange(neg, e.target.value as ClubNegotiation['status'])}
                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 ${scfg.color}`}
                      >
                        {NEG_STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingNeg(neg)}
                        className="p-1 text-slate-300 hover:text-slate-500"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onSelectPlayer(player.id)}
                        className="p-1 text-slate-300 hover:text-blue-500"
                        title="Ver ficha"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {filteredNegs.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  {statusFilter === 'todos'
                    ? 'No hay jugadores asignados a este club aún'
                    : `No hay jugadores con estado "${STATUS_CONFIG[statusFilter].label}"`
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── NECESIDADES TAB ── */}
        {activeTab === 'necesidades' && (
          <div className="max-w-2xl space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddNeed(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg hover:bg-[hsl(220,72%,30%)]"
              >
                <Plus className="w-4 h-4" /> Añadir necesidad
              </button>
            </div>

            <div className="space-y-2">
              {club.needs.map((need, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                  {editingNeed?.index === i ? (
                    <NeedForm
                      initial={need}
                      onSave={async (updated) => {
                        const newNeeds = club.needs.map((n, idx) => idx === i ? updated : n)
                        await onUpdateClub({ ...club, needs: newNeeds })
                        setEditingNeed(null)
                      }}
                      onCancel={() => setEditingNeed(null)}
                    />
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800 text-sm">{need.position}</span>
                          {need.ageMax && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Sub-{need.ageMax}</span>}
                          {need.transferBudget && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Traspaso: {need.transferBudget}</span>}
                          {need.salaryBudget && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Salario: {need.salaryBudget}</span>}
                        </div>
                        {need.notes && <p className="text-xs text-slate-500 mt-1">{need.notes}</p>}

                        {/* Matching players */}
                        {(() => {
                          const matchingPlayers = players.filter(p => {
                            const posMatch = need.position
                              ? p.positions.some(pos => pos.toLowerCase().includes(need.position.toLowerCase()) || need.position.toLowerCase().includes(pos.toLowerCase()))
                              : false
                            return posMatch && entries.some(e => e.playerId === p.id)
                          })
                          if (matchingPlayers.length === 0) return null
                          return (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <p className="text-xs text-slate-400 mb-1.5">Jugadores que podrían encajar:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {matchingPlayers.slice(0, 5).map(p => {
                                  const alreadyAssigned = clubNegs.some(n => n.playerId === p.id)
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => onSelectPlayer(p.id)}
                                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${alreadyAssigned ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                      {alreadyAssigned && <Check className="w-3 h-3" />}
                                      {p.name.split(' ')[0]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setEditingNeed({ index: i, need })} className="p-1 text-slate-300 hover:text-slate-500">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await onUpdateClub({ ...club, needs: club.needs.filter((_, idx) => idx !== i) })
                          }}
                          className="p-1 text-slate-300 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {club.needs.length === 0 && !showAddNeed && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No hay necesidades registradas
                </div>
              )}
              {showAddNeed && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <NeedForm
                    onSave={async (need) => {
                      await onUpdateClub({ ...club, needs: [...club.needs, need] })
                      setShowAddNeed(false)
                    }}
                    onCancel={() => setShowAddNeed(false)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INFO TAB ── */}
        {activeTab === 'info' && (
          <div className="max-w-lg space-y-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Información del club</span>
                <button onClick={() => setEditingInfo(!editingInfo)} className="p-1 text-slate-400 hover:text-slate-600">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {editingInfo ? (
                <InfoEditForm
                  club={club}
                  onSave={async (updates) => {
                    await onUpdateClub({ ...club, ...updates })
                    setEditingInfo(false)
                  }}
                  onCancel={() => setEditingInfo(false)}
                />
              ) : (
                <div className="space-y-2.5">
                  {club.league && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-slate-400 w-24">Liga</span>
                      <span className="text-slate-700">{club.league}</span>
                    </div>
                  )}
                  {club.contactPerson && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-slate-400 w-24">Contacto club</span>
                      <span className="text-slate-700 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />{club.contactPerson}
                      </span>
                    </div>
                  )}
                  {club.aisManager && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-slate-400 w-24">Gestor AIS</span>
                      <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{club.aisManager}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-24">Prioritario</span>
                    <span className={`text-xs ${club.isPriority ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                      {club.isPriority ? '⭐ Sí' : 'No'}
                    </span>
                  </div>
                  {club.notes && (
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-400 mb-1">Notas</p>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{club.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Danger zone */}
            {currentProfile.is_admin && (
              <div className="bg-white rounded-xl border border-red-100 p-4">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Zona de peligro</p>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Eliminar club
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">¿Eliminar {club.name} y todas sus negociaciones?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
                      <button onClick={async () => { await onDeleteClub(club.id); onBack() }} className="flex-1 py-1.5 text-sm bg-red-500 text-white rounded-lg">Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── MODALS ── */}

      {showAddPlayer && (
        <AddPlayerToClubModal
          players={players}
          entries={entries}
          existingPlayerIds={clubNegs.map(n => n.playerId)}
          clubId={club.id}
          onClose={() => setShowAddPlayer(false)}
          onSave={async (data) => {
            await onCreateNegotiation(data)
            setShowAddPlayer(false)
          }}
        />
      )}

      {editingNeg && (
        <EditNegModal
          neg={editingNeg}
          onClose={() => setEditingNeg(null)}
          onSave={async (updates) => {
            await onUpdateNegotiation({ ...editingNeg, ...updates })
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

function AddPlayerToClubModal({ players, entries, existingPlayerIds, clubId, onClose, onSave }: {
  players: Player[]
  entries: DistributionEntry[]
  existingPlayerIds: string[]
  clubId: string
  onClose: () => void
  onSave: (data: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [status, setStatus] = useState<ClubNegotiation['status']>('pendiente')
  const [aisManager, setAisManager] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const distPlayerIds = entries.map(e => e.playerId)
  const available = players.filter(p => {
    const inDist = showAll || distPlayerIds.includes(p.id)
    const notAssigned = !existingPlayerIds.includes(p.id)
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase())
    return inDist && notAssigned && matchesQuery
  })

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await onSave({ playerId: selected.id, clubId, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-800 text-sm">Añadir jugador al club</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {!selected ? (
            <>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugador…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                Mostrar todos los jugadores (no solo los en distribución)
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {available.slice(0, 20).map(p => {
                  const entry = entries.find(e => e.playerId === p.id)
                  return (
                    <button key={p.id} onClick={() => setSelected(p)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                        {p.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.positions[0]}</div>
                      </div>
                      {entry && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[entry.priority].bg} ${PRIORITY_CONFIG[entry.priority].text}`}>{entry.priority}</span>
                      )}
                    </button>
                  )
                })}
                {available.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                  {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <span className="font-medium text-slate-800 text-sm">{selected.name}</span>
                <button onClick={() => setSelected(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
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
              <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="Gestor AIS (PP, BGF…)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2 bg-[hsl(220,72%,36%)] text-white text-sm rounded-lg disabled:opacity-60">
                {saving ? 'Guardando…' : 'Añadir'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EDIT NEG MODAL ────────────────────────────────────────────

function EditNegModal({ neg, onClose, onSave, onDelete }: {
  neg: ClubNegotiation
  onClose: () => void
  onSave: (data: Partial<ClubNegotiation>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [status, setStatus] = useState(neg.status)
  const [aisManager, setAisManager] = useState(neg.aisManager ?? '')
  const [notes, setNotes] = useState(neg.notes ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Editar negociación</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
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
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="Gestor AIS (PP, BGF…)"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          <div className="flex gap-2">
            <button onClick={async () => { if (!confirm('¿Eliminar?')) return; await onDelete() }}
              className="px-3 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
            <button
              onClick={async () => { setSaving(true); try { await onSave({ status, aisManager: aisManager || undefined, notes: notes || undefined }) } finally { setSaving(false) } }}
              disabled={saving}
              className="flex-1 py-2 text-sm bg-[hsl(220,72%,36%)] text-white rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
            >
              {saving ? '…' : <><Check className="w-4 h-4" /> Guardar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── NEED FORM ─────────────────────────────────────────────────

const POSITIONS = [
  'Portero',
  'Central', 'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo',
  'Delantero',
]

function NeedForm({ initial, onSave, onCancel }: {
  initial?: ClubNeed
  onSave: (need: ClubNeed) => Promise<void>
  onCancel: () => void
}) {
  const [position, setPosition] = useState(initial?.position ?? '')
  const [ageMax, setAgeMax] = useState(initial?.ageMax?.toString() ?? '')
  const [transferBudget, setTransferBudget] = useState(initial?.transferBudget ?? '')
  const [salaryBudget, setSalaryBudget] = useState(initial?.salaryBudget ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!position.trim()) return
    setSaving(true)
    try {
      await onSave({
        position: position.trim(),
        ageMax: ageMax ? parseInt(ageMax) : undefined,
        transferBudget: transferBudget || undefined,
        salaryBudget: salaryBudget || undefined,
        notes: notes || undefined,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Posición *</label>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                position === pos
                  ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Edad máx.</label>
          <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="Ej: 23"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Traspaso</label>
          <input value={transferBudget} onChange={e => setTransferBudget(e.target.value)} placeholder="400k, 2M…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Salario</label>
          <input value={salaryBudget} onChange={e => setSalaryBudget(e.target.value)} placeholder="60k/año…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto adicional…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
        <button onClick={handleSave} disabled={!position.trim() || saving}
          className="flex-1 py-2 text-sm bg-[hsl(220,72%,36%)] text-white rounded-lg disabled:opacity-60">
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── INFO EDIT FORM ────────────────────────────────────────────

function InfoEditForm({ club, onSave, onCancel }: {
  club: Club
  onSave: (updates: Partial<Club>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(club.name)
  const [country, setCountry] = useState(club.country ?? '')
  const [league, setLeague] = useState(club.league ?? '')
  const [contactPerson, setContactPerson] = useState(club.contactPerson ?? '')
  const [aisManager, setAisManager] = useState(club.aisManager ?? '')
  const [notes, setNotes] = useState(club.notes ?? '')
  const [isPriority, setIsPriority] = useState(club.isPriority)
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre</label>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">País</label>
          <input value={country} onChange={e => setCountry(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <input value={league} onChange={e => setLeague(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
          <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <input value={aisManager} onChange={e => setAisManager(e.target.value)} placeholder="PP, BGF…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notas</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isPriority} onChange={e => setIsPriority(e.target.checked)} className="w-4 h-4 rounded" />
        <span className="text-sm text-slate-600">Club prioritario ⭐</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
        <button
          onClick={async () => {
            setSaving(true)
            try { await onSave({ name, country, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority }) }
            finally { setSaving(false) }
          }}
          disabled={saving}
          className="flex-1 py-2 text-sm bg-[hsl(220,72%,36%)] text-white rounded-lg disabled:opacity-60"
        >
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

