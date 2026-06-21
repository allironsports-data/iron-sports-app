import { useState, useMemo, useEffect } from 'react'
import {
  ArrowLeft, Building2, Star, Plus, X, Pencil,
  ChevronRight, Trash2, Check, LogOut, AlertCircle, Phone, Users,
  Maximize2, Minimize2,
} from 'lucide-react'
import type { Club, ClubNegotiation, DistributionEntry, Player, ClubNeed } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ConfirmModal } from '../components/ConfirmModal'
import { EmptyState } from '../components/EmptyState'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isValidName } from '../lib/validate'
import { ManagerSelect } from '../components/ManagerSelect'

/** Spinner pequeño para botones de guardado */
function BtnSpinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" />
}

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
  A: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'A' },
  B: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  C: { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'C' },
  D: { bg: 'bg-orange-50',  text: 'text-orange-600', label: 'D' },
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
  profiles: Profile[]
  onBack: () => void
  onLogout: () => void
  onAdmin?: () => void
  onSelectPlayer: (id: string) => void
  onUpdateClub: (c: Club) => Promise<void>
  onDeleteClub: (id: string) => Promise<void>
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  onUpdateNegotiation: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation: (id: string) => Promise<void>
  /** Modo panel (pantalla partida): cabecera compacta con cerrar/ampliar */
  embedded?: boolean
  /** Si el panel está ampliado a pantalla completa */
  expanded?: boolean
  /** Alternar ampliar/reducir el panel */
  onExpand?: () => void
}

// ── helpers ───────────────────────────────────────────────────

function ClubInfoStrip({ club }: { club: Club }) {
  const hasAny = club.league || club.contactPerson || club.aisManager || club.isPriority
  if (!hasAny) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500">
      {club.league && (
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Liga</span>
          <span className="font-medium text-slate-700">{club.league}</span>
        </span>
      )}
      {club.contactPerson && (
        <span className="flex items-center gap-1">
          <Phone className="w-3 h-3 text-slate-400" />
          <span className="font-medium text-slate-700">{club.contactPerson}</span>
        </span>
      )}
      {club.aisManager && (
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Gestor</span>
          <span className="font-mono bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{club.aisManager}</span>
        </span>
      )}
      {club.isPriority && (
        <span className="flex items-center gap-1 text-amber-600 font-medium">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          Prioritario
        </span>
      )}
    </div>
  )
}

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
  club, players, entries, negotiations, currentProfile, profiles,
  onBack, onLogout, onAdmin, onSelectPlayer,
  onUpdateClub, onDeleteClub,
  onCreateNegotiation, onUpdateNegotiation, onDeleteNegotiation,
  embedded = false, expanded = false, onExpand,
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
  const [offeringPlayerId, setOfferingPlayerId] = useState<string | null>(null)
  // position hint when opening AddPlayerToClubModal from a need card
  const [addPlayerPositionHint, setAddPlayerPositionHint] = useState<string | undefined>(undefined)

  // toasts + feedback de guardado
  const { toasts, showToast, dismissToast } = useToast()
  const [updatingNegId, setUpdatingNegId] = useState<string | null>(null)
  const [confirmDeleteNeedIdx, setConfirmDeleteNeedIdx] = useState<number | null>(null)

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
    setUpdatingNegId(neg.id)
    try {
      await onUpdateNegotiation({ ...neg, status })
      showToast(`Estado actualizado a "${STATUS_CONFIG[status].label}"`)
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
    } finally {
      setUpdatingNegId(null)
    }
  }

  return (
    <div className={`${embedded ? 'h-full' : 'min-h-screen'} bg-slate-50 flex flex-col`}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 h-11 sm:h-14 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          aria-label={embedded ? 'Cerrar' : 'Volver'}
          title={embedded ? 'Cerrar panel' : 'Volver'}
          className="p-2 sm:p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"
        >
          {embedded ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </button>
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-slate-800 text-sm sm:text-base truncate">{club.name}</h1>
            {club.isPriority && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />}
          </div>
          {club.league && <p className="text-xs text-slate-500 truncate">{club.league}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {activeCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {activeCount} activo{activeCount !== 1 ? 's' : ''}
            </span>
          )}
          {embedded && onExpand && (
            <button
              onClick={onExpand}
              aria-label={expanded ? 'Reducir panel' : 'Ampliar panel'}
              title={expanded ? 'Reducir' : 'Ampliar'}
              className="hidden lg:inline-flex p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          {!embedded && currentProfile.is_admin && onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100 hidden sm:block">Admin</button>
          )}
          {!embedded && (
            <button onClick={onLogout} aria-label="Cerrar sesión" className="p-2 sm:p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-1 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${activeTab === t.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
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
            <ClubInfoStrip club={club} />
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
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
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-medium text-slate-800 text-sm truncate max-w-full">{player.name}</span>
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
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 flex-shrink-0">
                      {/* Status dropdown */}
                      <select
                        value={neg.status}
                        disabled={updatingNegId === neg.id}
                        onChange={e => handleStatusChange(neg, e.target.value as ClubNegotiation['status'])}
                        aria-label="Cambiar estado de la negociación"
                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-wait ${scfg.color}`}
                      >
                        {NEG_STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => setEditingNeg(neg)}
                          aria-label="Editar negociación"
                          className="p-2 sm:p-1 text-slate-300 hover:text-slate-500"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onSelectPlayer(player.id)}
                          className="p-2 sm:p-1 text-slate-300 hover:text-blue-500"
                          title="Ver ficha"
                          aria-label="Ver ficha del jugador"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredNegs.length === 0 && (
                statusFilter === 'todos' ? (
                  <EmptyState
                    icon={<Users className="w-10 h-10" />}
                    title="No hay jugadores asignados a este club aún"
                    subtitle="Ofrece jugadores de la cartera para empezar a negociar con este club."
                    action={
                      <button
                        onClick={() => setShowAddPlayer(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
                      >
                        <Plus className="w-4 h-4" /> Añadir jugador
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Users className="w-10 h-10" />}
                    title={`No hay jugadores con estado "${STATUS_CONFIG[statusFilter].label}"`}
                    subtitle="Prueba con otro filtro de estado o muestra todos."
                    action={
                      <button
                        onClick={() => setStatusFilter('todos')}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Ver todos
                      </button>
                    }
                  />
                )
              )}
            </div>
          </div>
        )}

        {/* ── NECESIDADES TAB ── */}
        {activeTab === 'necesidades' && (
          <div className="max-w-2xl space-y-3">
            <ClubInfoStrip club={club} />
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddNeed(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
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
                        try {
                          const withMeta = { ...updated, createdAt: need.createdAt, addedBy: need.addedBy }
                          const newNeeds = club.needs.map((n, idx) => idx === i ? withMeta : n)
                          await onUpdateClub({ ...club, needs: newNeeds })
                          setEditingNeed(null)
                          showToast('Necesidad actualizada')
                        } catch {
                          showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                        }
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
                        {(need.createdAt || need.addedBy) && (
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {need.createdAt && (
                              <span>{new Date(need.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            )}
                            {need.addedBy && currentProfile.is_admin && (
                              <span className="font-mono bg-slate-100 px-1 rounded">{need.addedBy}</span>
                            )}
                          </div>
                        )}

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
                                {matchingPlayers.slice(0, 8).map(p => {
                                  const alreadyAssigned = clubNegs.some(n => n.playerId === p.id)
                                  const isOffering = offeringPlayerId === p.id
                                  if (alreadyAssigned) {
                                    return (
                                      <span
                                        key={p.id}
                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-blue-50 border-blue-200 text-blue-700"
                                      >
                                        <Check className="w-3 h-3" />
                                        {p.name.split(' ')[0]}
                                      </span>
                                    )
                                  }
                                  return (
                                    <button
                                      key={p.id}
                                      disabled={isOffering}
                                      onClick={async () => {
                                        setOfferingPlayerId(p.id)
                                        try {
                                          await onCreateNegotiation({ playerId: p.id, clubId: club.id, status: 'ofrecido' })
                                          showToast(`${p.name.split(' ')[0]} ofrecido a ${club.name}`)
                                        } catch {
                                          showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                                        } finally {
                                          setOfferingPlayerId(null)
                                        }
                                      }}
                                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition-colors"
                                    >
                                      {isOffering ? '…' : <Plus className="w-3 h-3" />}
                                      {p.name.split(' ')[0]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1 flex-shrink-0 items-end sm:items-center">
                        <button
                          onClick={() => { setAddPlayerPositionHint(need.position); setShowAddPlayer(true) }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors border border-blue-200"
                          title="Ofrecer jugador para esta necesidad"
                        >
                          <Plus className="w-3 h-3" /> Ofrecer
                        </button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingNeed({ index: i, need })} aria-label="Editar necesidad" className="p-2 sm:p-1 text-slate-300 hover:text-slate-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteNeedIdx(i)}
                            aria-label="Eliminar necesidad"
                            className="p-2 sm:p-1 text-slate-300 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {club.needs.length === 0 && !showAddNeed && (
                <EmptyState
                  icon={<AlertCircle className="w-10 h-10" />}
                  title="No hay necesidades registradas"
                  subtitle="Anota las posiciones que busca este club para cruzarlas con tu cartera."
                  action={
                    <button
                      onClick={() => setShowAddNeed(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
                    >
                      <Plus className="w-4 h-4" /> Añadir necesidad
                    </button>
                  }
                />
              )}
              {showAddNeed && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <NeedForm
                    onSave={async (need) => {
                      try {
                        const enriched = { ...need, createdAt: new Date().toISOString(), addedBy: currentProfile.avatar }
                        await onUpdateClub({ ...club, needs: [...club.needs, enriched] })
                        setShowAddNeed(false)
                        showToast('Necesidad añadida')
                      } catch {
                        showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                      }
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
                <button onClick={() => setEditingInfo(!editingInfo)} aria-label="Editar información del club" className="p-2 sm:p-1 text-slate-400 hover:text-slate-600">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {editingInfo ? (
                <InfoEditForm
                  club={club}
                  profiles={profiles}
                  onSave={async (updates) => {
                    try {
                      await onUpdateClub({ ...club, ...updates })
                      setEditingInfo(false)
                      showToast('Información del club guardada')
                    } catch {
                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                    }
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
                      <span className="text-slate-700 text-sm flex items-center gap-1.5">
                        {profiles.find(p => p.avatar === club.aisManager)?.name ?? null}
                        <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{club.aisManager}</span>
                      </span>
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
                      <button
                        onClick={async () => {
                          try {
                            await onDeleteClub(club.id)
                            onBack()
                          } catch {
                            showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
                          }
                        }}
                        className="flex-1 py-1.5 text-sm bg-red-500 text-white rounded-lg"
                      >
                        Eliminar
                      </button>
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
          positionHint={addPlayerPositionHint}
          profiles={profiles}
          currentProfile={currentProfile}
          onClose={() => { setShowAddPlayer(false); setAddPlayerPositionHint(undefined) }}
          onSave={async (data) => {
            try {
              await onCreateNegotiation(data)
              setShowAddPlayer(false)
              setAddPlayerPositionHint(undefined)
              showToast('Jugador ofrecido al club')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {editingNeg && (
        <EditNegModal
          neg={editingNeg}
          profiles={profiles}
          onClose={() => setEditingNeg(null)}
          onSave={async (updates) => {
            try {
              await onUpdateNegotiation({ ...editingNeg, ...updates })
              setEditingNeg(null)
              showToast('Cambios guardados')
            } catch {
              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
            }
          }}
          onDelete={async () => {
            try {
              await onDeleteNegotiation(editingNeg.id)
              setEditingNeg(null)
              showToast('Negociación eliminada')
            } catch {
              showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
            }
          }}
        />
      )}

      {/* Confirmación de borrado de necesidad */}
      <ConfirmModal
        open={confirmDeleteNeedIdx !== null}
        title={`¿Eliminar la necesidad${confirmDeleteNeedIdx !== null && club.needs[confirmDeleteNeedIdx] ? ` de ${club.needs[confirmDeleteNeedIdx].position}` : ''}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (confirmDeleteNeedIdx === null) return
          try {
            await onUpdateClub({ ...club, needs: club.needs.filter((_, idx) => idx !== confirmDeleteNeedIdx) })
            showToast('Necesidad eliminada')
          } catch {
            showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
          } finally {
            setConfirmDeleteNeedIdx(null)
          }
        }}
        onCancel={() => setConfirmDeleteNeedIdx(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

// ── ADD PLAYER MODAL ──────────────────────────────────────────

function AddPlayerToClubModal({ players, entries, existingPlayerIds, clubId, positionHint, profiles, currentProfile, onClose, onSave }: {
  players: Player[]
  entries: DistributionEntry[]
  existingPlayerIds: string[]
  clubId: string
  positionHint?: string
  profiles: Profile[]
  currentProfile: Profile
  onClose: () => void
  onSave: (data: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [status, setStatus] = useState<ClubNegotiation['status']>('ofrecido')
  const [aisManager, setAisManager] = useState(currentProfile.avatar)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const distPlayerIds = entries.map(e => e.playerId)

  // Position matching helper
  function matchesPosition(playerPositions: string[], hint: string): boolean {
    const h = hint.toLowerCase()
    return playerPositions.some(p => p.toLowerCase().includes(h) || h.includes(p.toLowerCase()))
  }

  const baseAvailable = players.filter(p => {
    const inDist = showAll || distPlayerIds.includes(p.id)
    const notAssigned = !existingPlayerIds.includes(p.id)
    const matchesQuery = !query || p.name.toLowerCase().includes(query.toLowerCase())
    return inDist && notAssigned && matchesQuery
  })

  // When positionHint: sort matching positions first
  const available = positionHint && !query
    ? [
        ...baseAvailable.filter(p => matchesPosition(p.positions, positionHint)),
        ...baseAvailable.filter(p => !matchesPosition(p.positions, positionHint)),
      ]
    : baseAvailable

  useEscapeKey(onClose)

  async function handleSave() {
    if (!selected || saving) return
    setSaving(true)
    try {
      await onSave({ playerId: selected.id, clubId, status, aisManager: aisManager || undefined, notes: notes || undefined })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Ofrecer jugador</h2>
            {positionHint && (
              <p className="text-xs text-blue-600 mt-0.5">Buscando: <span className="font-semibold">{positionHint}</span></p>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3 safe-area-bottom">
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
                  const posMatch = positionHint ? matchesPosition(p.positions, positionHint) : false
                  return (
                    <button key={p.id} onClick={() => setSelected(p)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 text-left ${posMatch && !query ? 'bg-blue-50/50' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                        {p.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.positions[0]}</div>
                      </div>
                      {posMatch && !query && (
                        <span className="text-[11px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">✓ pos.</span>
                      )}
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
                <button onClick={() => setSelected(null)} aria-label="Quitar selección" className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
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
              <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Añadir'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EDIT NEG MODAL ────────────────────────────────────────────

function EditNegModal({ neg, profiles, onClose, onSave, onDelete }: {
  neg: ClubNegotiation
  profiles: Profile[]
  onClose: () => void
  onSave: (data: Partial<ClubNegotiation>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [status, setStatus] = useState(neg.status)
  const [aisManager, setAisManager] = useState(neg.aisManager ?? '')
  const [notes, setNotes] = useState(neg.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEscapeKey(onClose, !confirmingDelete)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-800 text-sm">Editar negociación</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3 safe-area-bottom">
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
          <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setConfirmingDelete(true)}
              aria-label="Eliminar negociación"
              className="px-3 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
            <button
              onClick={async () => { if (saving) return; setSaving(true); try { await onSave({ status, aisManager: aisManager || undefined, notes: notes || undefined }) } finally { setSaving(false) } }}
              disabled={saving}
              className="flex-1 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-1"
            >
              {saving ? <><BtnSpinner /> Guardando…</> : <><Check className="w-4 h-4" /> Guardar</>}
            </button>
          </div>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()}>
        <ConfirmModal
          open={confirmingDelete}
          title="¿Eliminar esta negociación?"
          message="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await onDelete()
            setConfirmingDelete(false)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
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
    if (!position.trim() || saving) return
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
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          className="flex-1 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60">
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── LIGAS CONOCIDAS ───────────────────────────────────────────
const KNOWN_LEAGUES = [
  '1. Lig', '1B Pro League', '2. Bundesliga', '3. Liga',
  'Allsvenskan', 'Arabian Gulf League', 'Austrian 2. Liga', 'Austrian Bundesliga',
  'Baltic Leagues', 'Bundesliga', 'Challenge League', 'Championship',
  'Czech First League', 'Eerste Divisie', 'EFL League One', 'EFL League Two',
  'Ekstraklasa', 'Eliteserien', 'Eredivisie', 'Erovnuli Liga',
  'First Division Cyprus', 'First Professional League',
  'HNL', 'Indian Super League', 'Israeli Premier League',
  'La Liga', 'La Liga 2', 'Liga 1', 'Liga Betplay', 'Liga MX', 'Liga Portugal 2',
  'LigaPro', 'Ligue 1', 'Ligue 2', 'MLS', 'NB I',
  'Premier League', 'Premier League Kazakhstan', 'Premier League Russia',
  'Primera Division', 'Primera RFEF', 'Primeira Liga', 'Pro League',
  'PrvaLiga', 'Qatar Stars League', 'Saudi Pro League', 'Scottish Premiership',
  'Segunda RFEF', 'Serie A', 'Serie B', 'Slovak Super Liga',
  'Super League Greece', 'Super liga', 'Superliga', 'Swiss Super League',
  'Süper Lig', 'Ukrainian Premier League', 'Veikkausliiga',
]

// ── INFO EDIT FORM ────────────────────────────────────────────

function InfoEditForm({ club, profiles, onSave, onCancel }: {
  club: Club
  profiles: Profile[]
  onSave: (updates: Partial<Club>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(club.name)
  const [country, setCountry] = useState(club.country ?? '')
  const isCustomLeague = !!club.league && !KNOWN_LEAGUES.includes(club.league)
  const [league, setLeague] = useState(club.league ?? '')
  const [showCustomLeague, setShowCustomLeague] = useState(isCustomLeague)
  const [customLeague, setCustomLeague] = useState(isCustomLeague ? club.league ?? '' : '')
  const [allLeagues, setAllLeagues] = useState<string[]>(KNOWN_LEAGUES)

  useEffect(() => {
    supabase.from('clubs').select('league').not('league', 'is', null).then(({ data }) => {
      if (!data) return
      const dbLeagues = data.map((r: { league: string }) => r.league).filter(Boolean) as string[]
      const merged = Array.from(new Set([...KNOWN_LEAGUES, ...dbLeagues])).sort()
      setAllLeagues(merged)
    })
  }, [])
  const [contactPerson, setContactPerson] = useState(club.contactPerson ?? '')
  const [aisManager, setAisManager] = useState(club.aisManager ?? '')
  const [notes, setNotes] = useState(club.notes ?? '')
  const [isPriority, setIsPriority] = useState(club.isPriority)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  async function handleSave() {
    if (saving) return
    if (!isValidName(name)) {
      setNameError('Introduce un nombre válido (mínimo 2 caracteres).')
      return
    }
    setNameError('')
    setSaving(true)
    try {
      await onSave({ name: name.trim(), country, league: league || undefined, contactPerson: contactPerson || undefined, aisManager: aisManager || undefined, notes: notes || undefined, isPriority })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nombre</label>
        <input value={name} onChange={e => { setName(e.target.value); if (nameError) setNameError('') }} className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${nameError ? 'border-red-300' : 'border-slate-200'}`} />
        {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">País</label>
          <input value={country} onChange={e => setCountry(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Liga</label>
          <select
            value={showCustomLeague ? '__new__' : league}
            onChange={e => {
              if (e.target.value === '__new__') {
                setShowCustomLeague(true)
                setLeague(customLeague)
              } else {
                setShowCustomLeague(false)
                setCustomLeague('')
                setLeague(e.target.value)
              }
            }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">— Sin liga —</option>
            {allLeagues.map(l => <option key={l} value={l}>{l}</option>)}
            <option value="__new__">➕ Añadir nueva liga</option>
          </select>
          {showCustomLeague && (
            <input
              autoFocus
              value={customLeague}
              onChange={e => { setCustomLeague(e.target.value); setLeague(e.target.value) }}
              placeholder="Nombre de la nueva liga…"
              className="mt-2 w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contacto club</label>
          <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gestor AIS</label>
          <ManagerSelect value={aisManager || undefined} onChange={(v) => setAisManager(v ?? '')} profiles={profiles} />
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
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? <span className="flex items-center justify-center gap-2"><BtnSpinner /> Guardando…</span> : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

