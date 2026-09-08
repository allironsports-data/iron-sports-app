import { useState } from 'react'
import { X, Pencil, Trash2, Plus, Users, Star, Building2, CircleDot, AlertCircle, Maximize2, Minimize2, ChevronDown, ExternalLink } from 'lucide-react'
import type { Player, Club, ClubNegotiation, DistributionEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { PlayerClubList } from '../../components/PlayerClubList'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Badge, Button, IconButton, Sheet } from '../../components/ui'
import { L, NEG_STATUS_LABELS } from '../../lib/labels'
import { positionLabel, needMatchesPlayer } from '../../lib/positions'
import { TIER_CONFIG, getClubTier } from '../../lib/clubTiers'
import { suggestPlayersForNeed } from '../../lib/distribution'
import { Avatar } from './shared'
import { PRIORITY_CONFIG, STATUS_CONFIG, SIN_NEGOCIACIONES } from './constantes'
import type { DistributionIndexes } from './useDistributionIndexes'

type ShowToast = (msg: string, variant?: 'success' | 'error' | 'info') => void

// ── Paneles laterales de Distribución (Sheet: lateral en escritorio,
//    hoja inferior en móvil; el botón atrás del móvil los cierra) ──

export function PanelExpandBtn({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <IconButton
      onClick={onToggle}
      label={expanded ? 'Reducir panel' : 'Ampliar panel'}
      className="hidden lg:inline-flex"
    >
      {expanded ? <Minimize2 /> : <Maximize2 />}
    </IconButton>
  )
}

/** Ancho del Sheet: normal o ampliado (para editar cómodamente) */
const SHEET_W = 'sm:max-w-md'
const SHEET_W_EXPANDED = 'sm:max-w-[560px] lg:max-w-[55%] xl:max-w-[60%]'

export type HealthId = 'sin' | 'dup' | 'pos' | 'old'

/** Tarjeta de «Salud de datos» (pestaña Encargados, admin) */
export function HealthCard({ id, label, count, tone, onAction, actionLabel, open, onToggle }: {
  id: HealthId; label: string; count: number; tone: string; onAction?: () => void; actionLabel?: string
  open: HealthId | null; onToggle: (id: HealthId | null) => void
}) {
  return (
    <div className={`rounded-xl border ${count > 0 ? tone : 'border-slate-200 bg-white'} overflow-hidden flex items-stretch`}>
      <button
        type="button"
        onClick={() => onToggle(open === id ? null : id)}
        aria-expanded={open === id}
        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-lg font-bold tabular-nums">{count}</span>
        <span className="text-body font-medium text-slate-700 flex-1 min-w-0">{label}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${open === id ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {/* La acción va FUERA del botón desplegable (antes era un span clicable anidado) */}
      {onAction && count > 0 && (
        <Button variant="link" size="sm" onClick={onAction} className="px-3 shrink-0">
          {actionLabel}
        </Button>
      )}
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
    <Sheet
      open
      onClose={onClose}
      historyKey="dist-panel-jugador"
      className={panelExpanded ? SHEET_W_EXPANDED : SHEET_W}
      title={
        <span className="flex items-center gap-3">
          <Avatar name={player.name} photo={player.photo} size="md" />
          <span className="min-w-0">
            <span className="block truncate">{player.name}</span>
            <span className="block text-secondary font-normal text-slate-500">{positionLabel(player.positions[0])}</span>
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => onRequestDeleteEntry(selectedEntry.id)} className="mr-auto text-red-600 hover:bg-red-50">
            Quitar de distribución
          </Button>
          <Button onClick={onClose}>{L.cerrar}</Button>
        </>
      }
    >
      <div className="-mx-4 sm:-mx-5 -mt-4">
        <div className="px-4 sm:px-5 py-2 border-b border-slate-100 flex items-center gap-1 justify-end">
          <PanelExpandBtn expanded={panelExpanded} onToggle={() => onTogglePanelExpanded()} />
          <Button variant="link" size="sm" icon={<ExternalLink />} onClick={() => onSelectPlayer?.(player.id)}>
            Ver ficha
          </Button>
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-secondary font-bold ${cfg.bg} ${cfg.text}`}>
              {L.prioridad} {selectedEntry.priority}
            </span>
            {selectedEntry.condition && (
              <span className="text-secondary bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                {selectedEntry.condition}
              </span>
            )}
            {selectedEntry.transferFee && (
              <span className="text-secondary bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                {selectedEntry.transferFee}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <IconButton label="Editar entrada de distribución" onClick={() => onEditEntry(selectedEntry)}>
                <Pencil />
              </IconButton>
              <IconButton label="Quitar de distribución" onClick={() => onRequestDeleteEntry(selectedEntry.id)} className="text-red-600 hover:bg-red-50">
                <Trash2 />
              </IconButton>
            </div>
          </div>
          {selectedEntry.notes && (
            <p className="text-secondary text-slate-600 mt-2">{selectedEntry.notes}</p>
          )}
        </div>
      </div>

      <div className="pt-3">
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
          title={L.clubes}
          expanded={panelExpanded}
          detailMode={panelExpanded ? 'side' : 'push'}
        />
      </div>
    </Sheet>
  )
}

// ── PANEL DE SOLICITUD (pestaña Solicitudes → «Ofrecer») ──────

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
    <Sheet
      open
      onClose={onClose}
      historyKey="dist-panel-solicitud"
      title={
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-secondary font-semibold">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />{positionLabel(need.position)}
          </span>
          {need.ageMax && <Badge>Sub-{need.ageMax}</Badge>}
        </span>
      }
      description={
        <span className="flex items-center gap-1.5">
          <span className={`text-badge font-bold px-1 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`} title={`${L.nivel} ${tier}`}>{tier}</span>
          <span className="font-medium text-slate-700">{club.name}</span>
          {club.league && <span className="text-slate-500">· {club.league}</span>}
        </span>
      }
      footer={<Button onClick={onClose}>{L.cerrar}</Button>}
    >
      <div className="-mx-4 sm:-mx-5 -mt-4">
        <div className="px-4 sm:px-5 py-2 border-b border-slate-100 flex items-center justify-end">
          <Button variant="link" size="sm" icon={<ExternalLink />} onClick={() => { onSelectClub?.(club.id); onClose() }}>
            Abrir ficha del club
          </Button>
        </div>
        {/* Need budget/notes row */}
        {(need.transferBudget || need.salaryBudget || need.notes) && (
          <div className="px-4 sm:px-5 py-2 bg-amber-50/40 border-b border-slate-100 flex flex-wrap gap-2">
            {need.transferBudget && <span className="text-secondary bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded">Traspaso: {need.transferBudget}</span>}
            {need.salaryBudget && <span className="text-secondary bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded">Salario: {need.salaryBudget}</span>}
            {need.notes && <span className="text-secondary text-slate-600 italic">{need.notes}</span>}
          </div>
        )}
      </div>

      <div className="pt-3 space-y-5">

        {/* Offered players for this specific position */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-meta font-semibold text-slate-600 uppercase tracking-wider">
              Ofrecidos · {positionLabel(need.position)} ({offeredForNeed.length})
            </span>
            <Button variant="link" size="sm" icon={<Plus />} onClick={() => onAddNegotiation({ clubId: club.id, needPosition: need.position })}>
              {L.ofrecer}
            </Button>
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
                      <span className="text-body font-medium text-slate-700 truncate">{p.name}</span>
                      {pcfg && <span className={`text-badge px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                    </div>
                    <span className={`text-badge px-2 py-0.5 rounded-full inline-block mt-0.5 ${scfg.color}`}>{NEG_STATUS_LABELS[neg.status]}</span>
                  </div>
                  <IconButton label="Editar negociación" onClick={() => onEditNegotiation(neg)}>
                    <Pencil />
                  </IconButton>
                </div>
              )
            })}
            {offeredForNeed.length === 0 && (
              <p className="text-secondary text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                Ningún jugador ofrecido para {positionLabel(need.position)} aún
              </p>
            )}
          </div>
        </div>

        {/* Suggested players from distribution */}
        {suggestedPlayers.length > 0 && (
          <div>
            <span className="text-meta font-semibold text-slate-600 uppercase tracking-wider mb-2 block">
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
                        <span className="text-body font-medium text-slate-700 truncate">{p.name}</span>
                        {pcfg && <span className={`text-badge px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>}
                      </div>
                      <div className="text-secondary text-slate-500">{positionLabel(p.positions[0])}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="link"
                      icon={<Plus />}
                      onClick={async () => {
                        try {
                          await onCreateNegotiation({ playerId: p.id, clubId: club.id, needPosition: need.position, status: 'pendiente', aisManager: club.aisManager || currentProfile.avatar })
                          showToast(`${p.name} ofrecido a ${club.name}`)
                        } catch {
                          showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                        }
                      }}
                    >
                      {L.ofrecer}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {suggestedPlayers.length === 0 && offeredForNeed.length > 0 && (
          <p className="text-secondary text-slate-500 text-center">
            Todos los jugadores de {positionLabel(need.position)} ya están ofrecidos a este club
          </p>
        )}
      </div>
    </Sheet>
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
  // Confirmación antes de borrar una solicitud (antes se borraba al primer clic)
  const [needToDelete, setNeedToDelete] = useState<number | null>(null)
  return (
    <>
    <Sheet
      open
      onClose={onClose}
      historyKey="dist-panel-club"
      title={
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate">{selectedClub.name}</span>
            {selectedClub.league && <span className="block text-secondary font-normal text-slate-500">{selectedClub.league}</span>}
          </span>
        </span>
      }
      footer={
        <>
          {currentProfile.is_admin && (
            <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => onRequestDeleteClub(selectedClub.id)} className="mr-auto text-red-600 hover:bg-red-50">
              Eliminar club
            </Button>
          )}
          <Button onClick={onClose}>{L.cerrar}</Button>
        </>
      }
    >
      <div className="-mx-4 sm:-mx-5 -mt-4">
        <div className="px-4 sm:px-5 py-2 border-b border-slate-100 flex items-center justify-end gap-1">
          <IconButton label="Editar club" onClick={() => onEditClub(selectedClub)}>
            <Pencil />
          </IconButton>
          <Button variant="link" size="sm" icon={<ExternalLink />} onClick={() => { onSelectClub?.(selectedClub.id); onClose() }}>
            Abrir ficha del club
          </Button>
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-100 space-y-1.5">
          {selectedClub.contactPerson && (
            <div className="flex items-center gap-2 text-body">
              <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-slate-700">{selectedClub.contactPerson}</span>
              <span className="text-secondary text-slate-500">contacto del club</span>
            </div>
          )}
          {selectedClub.aisManager && (
            <div className="flex items-center gap-2 text-body">
              <CircleDot className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="font-mono text-slate-700">{selectedClub.aisManager}</span>
              <span className="text-secondary text-slate-500">{L.encargado.toLowerCase()}</span>
            </div>
          )}
          {selectedClub.isPriority && (
            <div className="flex items-center gap-2 text-secondary text-green-700">
              <Star className="w-3.5 h-3.5 fill-green-500 text-green-500" aria-hidden="true" /> Club prioritario
            </div>
          )}
          {selectedClub.notes && (
            <p className="text-secondary text-slate-600 mt-1">{selectedClub.notes}</p>
          )}
        </div>

        {selectedClub.needs.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
            <div className="text-meta font-semibold text-slate-600 uppercase tracking-wider mb-2">{L.solicitudes}</div>
            <div className="space-y-1">
              {selectedClub.needs.map((need, i) => (
                <div key={i} className="flex items-center gap-2 text-secondary text-slate-600 bg-slate-50 rounded-lg pl-3 pr-1 py-1">
                  <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" aria-hidden="true" />
                  <span className="font-medium">{positionLabel(need.position)}</span>
                  {need.ageMax && <span>· sub-{need.ageMax}</span>}
                  {need.transferBudget && <span>· {need.transferBudget}</span>}
                  {need.notes && <span className="text-slate-500 truncate">· {need.notes}</span>}
                  <IconButton label="Eliminar solicitud" onClick={() => setNeedToDelete(i)} className="ml-auto text-slate-600 hover:text-red-600 hover:bg-red-50">
                    <X />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-meta font-semibold text-slate-600 uppercase tracking-wider">
            Ofrecidos ({displayedNegs.length})
          </span>
          <Button variant="link" size="sm" icon={<Plus />} onClick={() => onAddNegotiation({ clubId: selectedClub.id })}>
            Ofrecer jugador
          </Button>
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
                    <span className="text-body font-medium text-slate-700">{player.name}</span>
                    {pcfg && (
                      <span className={`text-badge px-1.5 py-0.5 rounded font-bold ${pcfg.bg} ${pcfg.text}`}>{entry?.priority}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-badge px-2 py-0.5 rounded-full ${scfg.color}`}>{NEG_STATUS_LABELS[neg.status]}</span>
                    {neg.needPosition && (
                      <span className="text-badge px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium" title={positionLabel(neg.needPosition)}>
                        {neg.needPosition}
                      </span>
                    )}
                    {neg.aisManager && <span className="text-secondary font-mono text-slate-600">{neg.aisManager}</span>}
                  </div>
                  {neg.notes && <p className="text-secondary text-slate-600 mt-1">{neg.notes}</p>}
                </div>
                <IconButton label="Editar negociación" onClick={() => onEditNegotiation(neg)}>
                  <Pencil />
                </IconButton>
              </div>
            )
          })}
          {displayedNegs.length === 0 && (
            <div className="text-center py-6 text-slate-500 text-secondary">
              Sin jugadores ofrecidos aún
            </div>
          )}
        </div>
      </div>
    </Sheet>
    <ConfirmModal
      open={needToDelete !== null}
      title={`¿Eliminar la solicitud${needToDelete !== null && selectedClub.needs[needToDelete] ? ` de ${positionLabel(selectedClub.needs[needToDelete].position)}` : ''}?`}
      message="Esta acción no se puede deshacer."
      confirmLabel={L.eliminar}
      onConfirm={async () => {
        if (needToDelete === null) return
        try {
          await onUpdateClub({ ...selectedClub, needs: selectedClub.needs.filter((_, idx) => idx !== needToDelete) })
          showToast('Solicitud eliminada')
        } catch {
          showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error')
        } finally {
          setNeedToDelete(null)
        }
      }}
      onCancel={() => setNeedToDelete(null)}
    />
    </>
  )
}
