import { Users, AlertCircle, ChevronRight, Clock } from 'lucide-react'
import type { Club, DistributionEntry, ClubNegotiation } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { Badge, ClickableRow } from '../../components/ui'
import { L, NEG_STATUS_LABELS } from '../../lib/labels'
import { normalizePosition, positionLabel } from '../../lib/positions'
import { norm } from '../../lib/texto'
import { contractBadge, topStatus as topStatusOf, daysSince, STALE_DAYS, ACTIVE_NEG_STATUSES } from '../../lib/distribution'
import { Avatar } from './shared'
import { SIN_NEGOCIACIONES } from './constantes'
import { HealthCard } from './paneles'
import type { HealthId } from './paneles'
import type { DistributionIndexes } from './useDistributionIndexes'

// ── Pestaña ENCARGADOS ────────────────────────────────────────

export function EncargadosTab({
  seasonEntries, playersById, negsByPlayer, profiles, clubs, negotiations, currentProfile,
  healthOpen, setHealthOpen, onSelectPlayer, onSelectClub, onGoToClubs,
}: {
  seasonEntries: DistributionEntry[]
  playersById: DistributionIndexes['playersById']
  negsByPlayer: DistributionIndexes['negsByPlayer']
  profiles: Profile[]
  clubs: Club[]
  negotiations: ClubNegotiation[]
  currentProfile: Profile
  healthOpen: HealthId | null
  setHealthOpen: (v: HealthId | null) => void
  onSelectPlayer?: (id: string) => void
  onSelectClub?: (id: string) => void
  /** Ir a la pestaña Clubes filtrada por encargado ('__sin__' = sin encargado) */
  onGoToClubs: (avatar: string) => void
}) {
  const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

  const grouped: Record<string, DistributionEntry[]> = {}
  for (const entry of seasonEntries) {
    // Priority D never shown in encargados view
    if (entry.priority === 'D') continue
    // Intermediar (hiddenFromManagement) players not shown
    const entryPlayer = playersById.get(entry.playerId)
    if (entryPlayer?.hiddenFromManagement) continue
    const key = entry.aisManager ?? '__sin__'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(entry)
  }
  Object.values(grouped).forEach(g =>
    g.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
  )

  const managerProfiles = profiles
    .filter(p => grouped[p.avatar])
    .sort((a, b) => (grouped[b.avatar]?.length ?? 0) - (grouped[a.avatar]?.length ?? 0))

  const STATUS_COLORS_E: Record<string, string> = {
    negociando: 'bg-amber-100 text-amber-700',
    interesado: 'bg-blue-100 text-blue-700',
    ofrecido:   'bg-slate-100 text-slate-600',
    cerrado:    'bg-green-100 text-green-700',
  }
  const PRIORITY_BADGE: Record<string, string> = {
    A: 'bg-red-100 text-red-700',
    B: 'bg-amber-100 text-amber-700',
    C: 'bg-slate-100 text-slate-500',
    D: 'bg-orange-100 text-orange-700',
  }

  const renderRow = (entry: DistributionEntry) => {
    const player = playersById.get(entry.playerId)
    if (!player) return null
    const activeNegs = (negsByPlayer.get(entry.playerId) ?? SIN_NEGOCIACIONES)
      .filter(n => n.status !== 'descartado')
    const topStatus = topStatusOf(activeNegs)
    const badge = contractBadge(player.clubContract?.endDate)

    return (
      <ClickableRow
        key={entry.id}
        onClick={() => onSelectPlayer?.(player.id)}
        className="rounded-none px-4 py-3 border-b border-slate-100 last:border-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={player.name} photo={player.photo} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800 text-body">{player.name}</span>
              <span className="text-secondary text-slate-500" title={positionLabel(player.positions[0])}>{player.positions[0]}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-badge font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[entry.priority]}`} title={`${L.prioridad} ${entry.priority}`}>
                {entry.priority}
              </span>
              {entry.condition && (
                <Badge>{entry.condition}</Badge>
              )}
              {badge && (
                <span className={`text-badge px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
              )}
              {topStatus && (
                <span className={`text-badge px-1.5 py-0.5 rounded-full ${STATUS_COLORS_E[topStatus] ?? ''}`}>
                  {NEG_STATUS_LABELS[topStatus]}
                </span>
              )}
              {activeNegs.length > 0 && (
                <span className="text-secondary text-slate-500">{activeNegs.length} club{activeNegs.length !== 1 ? 'es' : ''}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
        </div>
      </ClickableRow>
    )
  }

  const renderSection = (
    avatar: string,
    name: string,
    entries: DistributionEntry[],
    muted = false
  ) => (
    <div key={avatar} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-meta font-bold flex-shrink-0 ${
          muted
            ? 'bg-slate-200 text-slate-600'
            : 'bg-primary text-white'
        }`}>
          {avatar === '__sin__' ? '?' : avatar}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-body font-semibold ${muted ? 'text-slate-600' : 'text-slate-800'}`}>{name}</p>
        </div>
        <span className="text-secondary text-slate-500 flex-shrink-0">
          {entries.length} jugador{entries.length !== 1 ? 'es' : ''}
        </span>
      </div>
      {/* Player rows */}
      <div>
        {entries.map(renderRow)}
      </div>
    </div>
  )

  // ── Resumen por encargado (CLUBES) ──────────────────────
  const ACTIVE_ST = ACTIVE_NEG_STATUSES
  const clubStats = profiles.map(p => {
    const myClubIds = new Set(clubs.filter(c => c.aisManager === p.avatar).map(c => c.id))
    const activeNegs = negotiations.filter(n => myClubIds.has(n.clubId) && ACTIVE_ST.includes(n.status))
    // Sin fecha (no debería pasar) cuenta como 0 días: no se marca parada.
    const stale = activeNegs.filter(n => daysSince(n.updatedAt, 0) > STALE_DAYS)
    return { profile: p, clubs: myClubIds.size, active: activeNegs.length, stale: stale.length }
  }).filter(s => s.clubs > 0)
    .sort((a, b) => b.clubs - a.clubs)
  const sinEncargadoClubs = clubs.filter(c => !c.aisManager).length
  const totalStale = clubStats.reduce((sum, s) => sum + s.stale, 0)
  const goToClubs = onGoToClubs

  // ── Salud de datos ──────────────────────────────────
  const strip = norm
  const clubsSinEnc = clubs.filter(c => !c.aisManager)
  // Duplicados por nombre normalizado
  const byName = new Map<string, Club[]>()
  clubs.forEach(c => {
    const k = strip(c.name)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(c)
  })
  const dupGroups = Array.from(byName.values()).filter(g => g.length > 1)
  // Necesidades con posición no estándar
  const badNeeds: Array<{ club: Club; pos: string }> = []
  clubs.forEach(c => (c.needs ?? []).forEach(n => {
    if (n.position && !normalizePosition(n.position)) badNeeds.push({ club: c, pos: n.position })
  }))
  // Necesidades antiguas (>180 días)
  const OLD_DAYS = 180
  const oldNeeds: Array<{ club: Club; pos: string; days: number }> = []
  clubs.forEach(c => (c.needs ?? []).forEach(n => {
    const d = n.createdAt ? Math.floor((Date.now() - new Date(n.createdAt).getTime()) / 86_400_000) : null
    if (d !== null && d > OLD_DAYS) oldNeeds.push({ club: c, pos: n.position, days: d })
  }))
  oldNeeds.sort((a, b) => b.days - a.days)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Salud de datos (solo admin) */}
      {currentProfile.is_admin && (
        <div>
          <h3 className="text-body font-semibold text-slate-700 mb-2">Salud de datos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <HealthCard id="sin" open={healthOpen} onToggle={setHealthOpen} label="Clubes sin encargado" count={clubsSinEnc.length} tone="border-amber-200 bg-amber-50"
              onAction={() => goToClubs('__sin__')} actionLabel="Repartir →" />
            <HealthCard id="dup" open={healthOpen} onToggle={setHealthOpen} label="Clubes posiblemente duplicados" count={dupGroups.length} tone="border-orange-200 bg-orange-50" />
            <HealthCard id="pos" open={healthOpen} onToggle={setHealthOpen} label="Solicitudes con posición no estándar" count={badNeeds.length} tone="border-red-200 bg-red-50" />
            <HealthCard id="old" open={healthOpen} onToggle={setHealthOpen} label={`Solicitudes antiguas (>${OLD_DAYS}d)`} count={oldNeeds.length} tone="border-slate-200 bg-slate-50" />
          </div>

          {/* Detalle desplegable */}
          {healthOpen === 'dup' && dupGroups.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
              {dupGroups.map((g, i) => (
                <div key={i} className="px-3 py-2">
                  <p className="text-secondary font-semibold text-slate-700 mb-1">{g[0].name} ({g.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.map(c => (
                      <button key={c.id} type="button" onClick={() => onSelectClub?.(c.id)}
                        className="text-badge bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
                        {c.league ?? 'sin liga'}{c.aisManager ? ` · ${c.aisManager}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {healthOpen === 'pos' && badNeeds.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
              {badNeeds.slice(0, 100).map((b, i) => (
                <button key={i} type="button" onClick={() => onSelectClub?.(b.club.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="text-body text-slate-700 truncate flex-1">{b.club.name}</span>
                  <span className="text-badge bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded flex-shrink-0">“{b.pos}”</span>
                </button>
              ))}
            </div>
          )}
          {healthOpen === 'old' && oldNeeds.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
              {oldNeeds.slice(0, 100).map((o, i) => (
                <button key={i} type="button" onClick={() => onSelectClub?.(o.club.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="text-body text-slate-700 truncate flex-1">{o.club.name}</span>
                  <span className="text-badge text-slate-500 flex-shrink-0">{o.pos} · {Math.floor(o.days / 30)}m</span>
                </button>
              ))}
            </div>
          )}
          {healthOpen === 'sin' && (
            <p className="mt-2 text-secondary text-slate-600">
              Pulsa «Repartir →» para ir a la lista de clubes filtrada por «{L.sinEncargado}» y asignarlos desde el desplegable de cada fila.
            </p>
          )}
        </div>
      )}

      {/* Resumen por encargado (clubes) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-body font-semibold text-slate-700">Resumen por {L.encargado.toLowerCase()} · {L.clubes}</h3>
          {totalStale > 0 && (
            <span className="text-secondary text-orange-700 font-medium flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> {totalStale} propuesta{totalStale !== 1 ? 's' : ''} sin mover &gt;{STALE_DAYS}d
            </span>
          )}
        </div>
        <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead>
              <tr className="bg-slate-50 text-left text-meta text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">{L.encargado}</th>
                <th className="px-3 py-2 font-semibold text-right">{L.clubes}</th>
                <th className="px-3 py-2 font-semibold text-right">Propuestas activas</th>
                <th className="px-4 py-2 font-semibold text-right">Sin mover &gt;{STALE_DAYS}d</th>
              </tr>
            </thead>
            <tbody>
              {clubStats.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-secondary">Aún no hay clubes con {L.encargado.toLowerCase()} asignado.</td></tr>
              )}
              {clubStats.map(s => (
                <tr
                  key={s.profile.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => goToClubs(s.profile.avatar)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToClubs(s.profile.avatar) } }}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                  title={`Ver los clubes de ${s.profile.name}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary text-white text-badge font-bold flex items-center justify-center flex-shrink-0">{s.profile.avatar}</span>
                      <span className="font-medium text-slate-700 truncate">{s.profile.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{s.clubs}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.active}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.stale > 0
                      ? <span className="inline-flex items-center gap-1 text-orange-700 font-semibold"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> {s.stale}</span>
                      : <span className="text-slate-400">0</span>}
                  </td>
                </tr>
              ))}
              {sinEncargadoClubs > 0 && (
                <tr
                  tabIndex={0}
                  role="button"
                  onClick={() => goToClubs('__sin__')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToClubs('__sin__') } }}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                  title="Ver clubes sin encargado"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-badge font-bold flex items-center justify-center flex-shrink-0">?</span>
                      <span className="font-medium text-slate-600">{L.sinEncargado}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-600">{sinEncargadoClubs}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">—</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Móvil: tarjetas por encargado */}
        <div className="sm:hidden space-y-2">
          {clubStats.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-slate-500 text-secondary">Aún no hay clubes con {L.encargado.toLowerCase()} asignado.</div>
          )}
          {clubStats.map(s => (
            <ClickableRow
              key={s.profile.id}
              onClick={() => goToClubs(s.profile.avatar)}
              className="bg-white border border-slate-200 rounded-xl p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-primary text-white text-meta font-bold flex items-center justify-center flex-shrink-0">{s.profile.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 truncate">{s.profile.name}</div>
                  <div className="text-secondary text-slate-600 mt-0.5">
                    Clubes: {s.clubs} · Activas: {s.active} · {s.stale > 0 ? <span className="text-orange-700 font-medium">Paradas: {s.stale}</span> : <>Paradas: 0</>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
              </div>
            </ClickableRow>
          ))}
          {sinEncargadoClubs > 0 && (
            <ClickableRow
              onClick={() => goToClubs('__sin__')}
              className="bg-white border border-slate-200 rounded-xl p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 text-meta font-bold flex items-center justify-center flex-shrink-0">?</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-600">{L.sinEncargado}</div>
                  <div className="text-secondary text-slate-500 mt-0.5">Clubes: {sinEncargadoClubs} · Activas: — · Paradas: —</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
              </div>
            </ClickableRow>
          )}
        </div>

        <p className="text-meta text-slate-500 mt-1.5">Pulsa una fila para ver los clubes de esa persona.</p>
      </div>

      {/* Jugadores por encargado */}
      <div>
        <h3 className="text-body font-semibold text-slate-700 mb-2">Jugadores por {L.encargado.toLowerCase()}</h3>
        {managerProfiles.length === 0 && !grouped['__sin__'] && (
          <EmptyState
            icon={<Users className="w-10 h-10" />}
            title={`No hay jugadores con ${L.encargado.toLowerCase()} asignado`}
            subtitle={`Asigna un ${L.encargado.toLowerCase()} a cada jugador desde la pestaña Jugadores.`}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          {managerProfiles.map(p =>
            renderSection(p.avatar, p.name, grouped[p.avatar] ?? [])
          )}

          {grouped['__sin__'] &&
            renderSection('__sin__', L.sinEncargado, grouped['__sin__'], true)
          }
        </div>
      </div>
    </div>
  )
}
