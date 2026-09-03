import { X, Pencil, Trash2, Plus, Users, Star, Building2, CircleDot, AlertCircle, Maximize2, Minimize2, ChevronDown } from 'lucide-react'
import type { Player, Club, ClubNegotiation, DistributionEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { PlayerClubList } from '../../components/PlayerClubList'
import { positionLabel, needMatchesPlayer } from '../../lib/positions'
import { TIER_CONFIG, getClubTier } from '../../lib/clubTiers'
import { suggestPlayersForNeed } from '../../lib/distribution'
import { Avatar } from './shared'
import { PRIORITY_CONFIG, STATUS_CONFIG, SIN_NEGOCIACIONES } from './constantes'
import type { DistributionIndexes } from './useDistributionIndexes'

type ShowToast = (msg: string, variant?: 'success' | 'error' | 'info') => void

// ── Paneles laterales de Distribución ─────────────────────────

export function PanelExpandBtn({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={expanded ? 'Reducir panel' : 'Ampliar panel'}
      title={expanded ? 'Reducir' : 'Ampliar'}
      className="hidden lg:inline-flex p-1.5 rounded hover:bg-slate-100 text-slate-400 flex-shrink-0"
    >
      {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    </button>
  )
}

export type HealthId = 'sin' | 'dup' | 'pos' | 'old'

/** Tarjeta de «Salud de datos» (pestaña Encargados, admin) */
export function HealthCard({ id, label, count, tone, onAction, actionLabel, open, onToggle }: {
  id: HealthId; label: string; count: number; tone: string; onAction?: () => void; actionLabel?: string
  open: HealthId | null; onToggle: (id: HealthId | null) => void
}) {
  return (
    <div className={`rounded-xl border ${count > 0 ? tone : 'border-slate-200 bg-white'} overflow-hidden`}>
      <button
        onClick={() => onToggle(open === id ? null : id)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-lg font-bold tabular-nums">{count}</span>
        <span className="text-sm font-medium text-slate-700 flex-1 min-w-0">{label}</span>
        {onAction && count > 0 && (
          <span
            onClick={e => { e.stopPropagation(); onAction() }}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
          >
            {actionLabel}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open === id ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}

// ── PANEL DE JUGADOR (entrada de distribución seleccionada) ───

export function PlayerPanel({
  selectedEntry, playersById, negotiations, clubs, profiles, currentProfile, panelExpanded,
  onTogglePanelExpanded, onClose, onSelectPlayer, onSelectClub, onEditEntry, onRequestDeleteEntry,
  onAddClub, onAssignLeague, onUpdateNegotiation, onDeleteNegotiation, showToast,
}: {
  selectedEntry: DistributionEntry
  playersById: DistributionIndexes['playersById']
  negotiations: ClubNegotiation[]
  clubs: Club[]
  profiles: Profile[]
  currentProfile: Profile
  panelExpanded: boolean
  onTogglePanelExpanded: () => void
  onClose: () => void
  onSelectPlayer?: (id: string) => void
  onSelectClub?: (id: string) => void
  onEditEntry: (e: DistributionEntry) => void
  onRequestDeleteEntry: (id: string) => void
  onAddClub: (playerId: string) => void
  onAssignLeague: (playerId: string) => void
  onUpdateNegotiation: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation: (id: string) => Promise<void>
  showToast: ShowToast
}) {
  const player = playersById.get(selectedEntry.playerId)
  // Puede no existir (jugador borrado con la entrada aún abierta): antes el `!` reventaba la vista.
  if (!player) return null
  const playerNegs = negotiations.filter(n => n.playerId === selectedEntry.playerId)
  const cfg = PRIORITY_CONFIG[selectedEntry.priority]
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <button onClick={onClose} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
        <Avatar name={player.name} photo={player.photo} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 text-sm">{player.name}</div>
          <div className="text-xs text-slate-500">{player.positions[0]}</div>
        </div>
        <PanelExpandBtn expanded={panelExpanded} onToggle={() => onTogglePanelExpanded()} />
        <button
          onClick={() => onSelectPlayer?.(player.id)}
          className="text-xs text-blue-600 hover:underline flex-shrink-0"
        >
          Ver ficha
        </button>
      </div>

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
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEditEntry(selectedEntry)}
              className="p-2 sm:p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
              title="Editar"
              aria-label="Editar entrada de distribución"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRequestDeleteEntry(selectedEntry.id)}
              className="p-2 sm:p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50"
              title="Quitar de distribución"
              aria-label="Quitar de distribución"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {selectedEntry.notes && (
          <p className="text-xs text-slate-500 mt-2">{selectedEntry.notes}</p>
        )}
      </div>

      <div className={panelExpanded ? 'flex-1 min-h-0 px-4 py-3 overflow-y-auto sm:overflow-hidden' : 'flex-1 overflow-y-auto px-4 py-3'}>
        <PlayerClubList
          negotiations={playerNegs}
          clubs={clubs}
          profiles={profiles}
          currentProfile={currentProfile}
          onUpdateNegotiation={onUpdateNegotiation}
          onDeleteNegotiation={onDeleteNegotiation}
          onSelectClub={id => { onSelectClub?.(id); onClose() }}
          onAddClub={() => onAddClub(selectedEntry.playerId)}
          onAssignLeague={() => onAssignLeague(selectedEntry.playerId)}
          showToast={showToast}
          title="Clubes"
          expanded={panelExpanded}
          detailMode={panelExpanded ? 'side' : 'push'}
        />
      </div>

      <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0 space-y-2 sticky bottom-0 bg-white safe-area-bottom">
        {/* Close — mobile only */}
        <button
          onClick={onClose}
          className="sm:hidden w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
        >
          Cerrar
        </button>
        <button
          onClick={() => onRequestDeleteEntry(selectedEntry.id)}
          className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" /> Quitar de distribución
        </button>
      </div>
    </div>
  )
}

// ── PANEL DE NECESIDAD (pestaña Solicitudes → «Ofrecer») ──────

export function NeedPanel({
  selectedNeed, clubs, players, negotiations, playersById, entriesByPlayer, negsByClub, currentProfile,
  onClose, onSelectClub, onAddNegotiation, onEditNegotiation, onCreateNegotiation, showToast,
}: {
  selectedNeed: { clubId: string; needIndex: number }
  clubs: Club[]
  players: Player[]
  negotiations: ClubNegotiation[]
  playersById: DistributionIndexes['playersById']
  entriesByPlayer: DistributionIndexes['entriesByPlayer']
  negsByClub: DistributionIndexes['negsByClub']
  currentProfile: Profile
  onClose: () => void
  onSelectClub?: (id: string) => void
  onAddNegotiation: (opts: { clubId: string; needPosition: string }) => void
  onEditNegotiation: (n: ClubNegotiation) => void
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  showToast: ShowToast
}) {
  const club = clubs.find(c => c.id === selectedNeed.clubId)
  if (!club) return null
  const need = club.needs[selectedNeed.needIndex]
  if (!need) return null
  const tier = getClubTier(club.league, club.country)
  const tierCfg = TIER_CONFIG[tier]
  const offeredToClub = negsByClub.get(club.id) ?? SIN_NEGOCIACIONES
  // Negs linked to this specific need (by needPosition when set, fallback to position matching for old data)
  const offeredForNeed = offeredToClub.filter(neg => {
    if (neg.needPosition) return neg.needPosition === need.position
    const p = playersById.get(neg.playerId)
    return p && needMatchesPlayer(need.position, p.positions)
  })
  const offeredForNeedPlayerIds = new Set(offeredForNeed.map(n => n.playerId))
  const suggestedPlayers = suggestPlayersForNeed({
    need, players, negotiations,
    distributionPlayerIds: entriesByPlayer,
    excludeIds: offeredForNeedPlayerIds,
  })
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <button onClick={onClose} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-semibold">
              <AlertCircle className="w-3 h-3" />{positionLabel(need.position)}
            </span>
            {need.ageMax && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Sub-{need.ageMax}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
            <span className={`text-[11px] font-bold px-1 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
            <span className="font-medium text-slate-700">{club.name}</span>
            {club.league && <span className="text-slate-400">· {club.league}</span>}
          </div>
        </div>
        <button
          onClick={() => { onSelectClub?.(club.id); onClose() }}
          className="p-2 sm:p-1 text-slate-400 hover:text-slate-600 flex-shrink-0"
          title="Abrir ficha del club"
          aria-label="Abrir ficha del club"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Need budget/notes row */}
      {(need.transferBudget || need.salaryBudget || need.notes) && (
        <div className="px-4 py-2 bg-amber-50/40 border-b border-slate-100 flex flex-wrap gap-2">
          {need.transferBudget && <span className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded">Traspaso: {need.transferBudget}</span>}
          {need.salaryBudget && <span className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">Salario: {need.salaryBudget}</span>}
          {need.notes && <span className="text-xs text-slate-500 italic">{need.notes}</span>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">

        {/* Offered players for this specific position */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ofrecidos · {positionLabel(need.position)} ({offeredForNeed.length})
            </span>
            <button
              onClick={() => onAddNegotiation({ clubId: club.id, needPosition: need.position })}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Ofrecer
            </button>
          </div>
          <div className="space-y-1.5">
            {offeredForNeed.map(neg => {
              const p = playersById.get(neg.playerId)
              if (!p) return null
              const scfg = STATUS_CONFIG[neg.status]
              const entry = entriesByPlayer.get(p.id)
              const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
              return (
                <div key={neg.id} className="bg-slate-50 rounded-lg p-2.5 flex items-center gap-2">
                  <Avatar name={p.name} photo={p.photo} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                      {pcfg && <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${scfg.color}`}>{scfg.label}</span>
                  </div>
                  <button onClick={() => onEditNegotiation(neg)} aria-label="Editar negociación" className="p-2 sm:p-1 text-slate-300 hover:text-slate-500 flex-shrink-0">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
            {offeredForNeed.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                Ningún jugador ofrecido para {need.position} aún
              </p>
            )}
          </div>
        </div>

        {/* Suggested players from distribution */}
        {suggestedPlayers.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
              Disponibles en cartera ({suggestedPlayers.length})
            </span>
            <div className="space-y-1.5">
              {suggestedPlayers.map(p => {
                const entry = entriesByPlayer.get(p.id)
                const pcfg = entry ? PRIORITY_CONFIG[entry.priority] : null
                return (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2 hover:border-slate-300 transition-colors">
                    <Avatar name={p.name} photo={p.photo} size="xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                        {pcfg && <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                      </div>
                      <div className="text-xs text-slate-400">{p.positions[0]}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await onCreateNegotiation({ playerId: p.id, clubId: club.id, needPosition: need.position, status: 'pendiente', aisManager: club.aisManager || currentProfile.avatar })
                          showToast(`${p.name} ofrecido a ${club.name}`)
                        } catch {
                          showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                        }
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2 sm:py-1 rounded hover:bg-blue-50 transition-colors flex-shrink-0"
                    >
                      <Plus className="w-3 h-3" /> Ofrecer
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {suggestedPlayers.length === 0 && offeredForNeed.length > 0 && (
          <p className="text-xs text-slate-400 text-center">
            Todos los jugadores de {need.position} ya están ofrecidos a este club
          </p>
        )}
      </div>
      {/* Close — mobile only */}
      <div className="sm:hidden flex-shrink-0 px-4 py-3 border-t border-slate-100 safe-area-bottom sticky bottom-0 bg-white">
        <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
          Cerrar
        </button>
      </div>
    </div>
  )
}

// ── PANEL DE CLUB (club seleccionado sin ficha completa) ──────

export function ClubPanel({
  selectedClub, playersById, entriesByPlayer, negsByClub, currentProfile,
  onClose, onSelectClub, onEditClub, onUpdateClub, onAddNegotiation, onEditNegotiation, onRequestDeleteClub, showToast,
}: {
  selectedClub: Club
  playersById: DistributionIndexes['playersById']
  entriesByPlayer: DistributionIndexes['entriesByPlayer']
  negsByClub: DistributionIndexes['negsByClub']
  currentProfile: Profile
  onClose: () => void
  onSelectClub?: (id: string) => void
  onEditClub: (c: Club) => void
  onUpdateClub: (c: Club) => Promise<void>
  onAddNegotiation: (opts: { clubId: string }) => void
  onEditNegotiation: (n: ClubNegotiation) => void
  onRequestDeleteClub: (id: string) => void
  showToast: ShowToast
}) {
  const clubNegsPanel = negsByClub.get(selectedClub.id) ?? SIN_NEGOCIACIONES
  const displayedNegs = clubNegsPanel
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <button onClick={onClose} aria-label="Cerrar panel" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 text-sm">{selectedClub.name}</div>
          <div className="text-xs text-slate-500">{selectedClub.league}</div>
        </div>
        <button
          onClick={() => { onSelectClub?.(selectedClub.id); onClose() }}
          aria-label="Abrir ficha del club"
          title="Abrir ficha del club"
          className="p-2 sm:p-1 text-slate-400 hover:text-slate-600"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button onClick={() => onEditClub(selectedClub)} aria-label="Editar club" className="p-2 sm:p-1 text-slate-400 hover:text-slate-600">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

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

      {selectedClub.needs.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Necesidades</div>
          <div className="space-y-1">
            {selectedClub.needs.map((need, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                <span className="font-medium">{positionLabel(need.position)}</span>
                {need.ageMax && <span>· sub-{need.ageMax}</span>}
                {need.transferBudget && <span>· {need.transferBudget}</span>}
                {need.notes && <span className="text-slate-400">· {need.notes}</span>}
                <button
                  className="ml-auto p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0"
                  title="Eliminar solicitud"
                  aria-label="Eliminar solicitud"
                  onClick={async () => {
                    try {
                      await onUpdateClub({ ...selectedClub, needs: selectedClub.needs.filter((_, idx) => idx !== i) })
                      showToast('Solicitud eliminada')
                    } catch {
                      showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
                    }
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ofrecidos ({displayedNegs.length})
            </span>
          </div>
          <button
            onClick={() => onAddNegotiation({ clubId: selectedClub.id })}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Ofrecer jugador
          </button>
        </div>
        <div className="space-y-2">
          {displayedNegs.map(neg => {
            const player = playersById.get(neg.playerId)
            const entry = entriesByPlayer.get(neg.playerId)
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
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
                    {neg.needPosition && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                        {neg.needPosition}
                      </span>
                    )}
                    {neg.aisManager && <span className="text-xs font-mono text-slate-500">{neg.aisManager}</span>}
                  </div>
                  {neg.notes && <p className="text-xs text-slate-500 mt-1">{neg.notes}</p>}
                </div>
                <button
                  onClick={() => onEditNegotiation(neg)}
                  aria-label="Editar negociación"
                  className="p-2 sm:p-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          {displayedNegs.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs">
              Sin jugadores ofrecidos aún
            </div>
          )}
        </div>
      </div>

      {currentProfile.is_admin && (
        <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={() => onRequestDeleteClub(selectedClub.id)}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar club
          </button>
        </div>
      )}
      {/* Close — mobile only */}
      <div className="sm:hidden flex-shrink-0 px-4 py-3 border-t border-slate-100 safe-area-bottom sticky bottom-0 bg-white">
        <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
          Cerrar
        </button>
      </div>
    </div>
  )
}
