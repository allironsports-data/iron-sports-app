import { useState } from 'react'
import { Plus, Search, Edit3, ExternalLink, Trash2, Users } from 'lucide-react'
import type { Club, ClubNegotiation } from '../types'
import type { Profile } from '../contexts/AuthContext'
import type { ToastVariant } from '../hooks/useToast'
import { ManagerSelect } from './ManagerSelect'
import { ConfirmModal } from './ConfirmModal'
import { getClubTier } from '../lib/clubTiers'

// ── Config compartida de estados de negociación ────────────────

export const NEG_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado']

export const NEG_STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string; rowBorder: string; rowBg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400', rowBorder: 'border-l-purple-300', rowBg: 'bg-purple-50/40' },
  ofrecido:   { label: 'Ofrecido',   color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400',  rowBorder: 'border-l-slate-300',  rowBg: 'bg-white' },
  interesado: { label: 'Interesado', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',   rowBorder: 'border-l-blue-400',   rowBg: 'bg-blue-50/40' },
  negociando: { label: 'Negociando', color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500',  rowBorder: 'border-l-amber-400',  rowBg: 'bg-amber-50/50' },
  cerrado:    { label: 'Cerrado',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500',  rowBorder: 'border-l-green-400',  rowBg: 'bg-green-50/50' },
  descartado: { label: 'Descartado', color: 'bg-red-100 text-red-600',       dot: 'bg-red-400',    rowBorder: 'border-l-red-300',    rowBg: 'bg-red-50/30' },
}

export const NEG_STATUS_ORDER: Record<ClubNegotiation['status'], number> = {
  negociando: 0, interesado: 1, ofrecido: 2, pendiente: 3, cerrado: 4, descartado: 5,
}

/** "LT / AV / PP" → ['LT','AV','PP']; normaliza espacios y mayúsculas para evitar dupes */
export const parseGestores = (s?: string) => (s ?? '').split(/[/,+&]/).map(t => t.trim().toUpperCase()).filter(Boolean)

// ── Lista unificada de clubes contactados de un jugador ────────
// Se usa en: ficha del jugador (pestaña Distribución) y panel lateral de Distribución.

export function PlayerClubList({
  negotiations, clubs, profiles,
  onUpdateNegotiation, onDeleteNegotiation, onSelectClub, onRowClick, activeNegId,
  onAddClub, onAssignLeague, showToast,
  title = 'Clubes contactados',
}: {
  negotiations: ClubNegotiation[]
  clubs: Club[]
  profiles: Profile[]
  onUpdateNegotiation?: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation?: (id: string) => Promise<void>
  onSelectClub?: (id: string) => void
  /** Clic en una fila. Si no se pasa, el clic abre la edición inline. */
  onRowClick?: (neg: ClubNegotiation) => void
  activeNegId?: string | null
  onAddClub?: () => void
  onAssignLeague?: () => void
  showToast: (message: string, variant?: ToastVariant) => void
  title?: string
}) {
  const [statusFilter, setStatusFilter] = useState<ClubNegotiation['status'] | ''>('')
  const [gestorFilter, setGestorFilter] = useState('')
  const [clubSearch, setClubSearch] = useState('')
  const [sortBy, setSortBy] = useState<'estado' | 'nombre' | 'liga' | 'actualizado'>('estado')
  const [groupBy, setGroupBy] = useState<'none' | 'estado' | 'liga' | 'nivel'>('none')
  const [selectedNegIds, setSelectedNegIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [negToDelete, setNegToDelete] = useState<ClubNegotiation | null>(null)

  function toggleNegSelected(id: string) {
    setSelectedNegIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function saveEditNeg() {
    if (!editingNeg) return
    try {
      await onUpdateNegotiation?.(editingNeg)
      setEditingNeg(null)
    } catch {
      showToast('No se pudieron guardar los cambios', 'error')
    }
  }

  async function bulkChangeStatus(status: ClubNegotiation['status']) {
    if (!onUpdateNegotiation || selectedNegIds.size === 0) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    for (const id of Array.from(selectedNegIds)) {
      const n = negotiations.find(x => x.id === id)
      if (!n) continue
      if (n.status === status) { ok++; continue }
      try { await onUpdateNegotiation({ ...n, status }); ok++ } catch { fail++ }
    }
    setBulkBusy(false)
    setSelectedNegIds(new Set())
    if (fail > 0) showToast(`${fail} club${fail !== 1 ? 'es' : ''} no se pudieron actualizar`, 'error')
    else showToast(`${ok} club${ok !== 1 ? 'es' : ''} → ${NEG_STATUS_CONFIG[status].label}`)
  }

  async function bulkDelete() {
    if (!onDeleteNegotiation || selectedNegIds.size === 0) return
    setBulkBusy(true)
    let fail = 0
    for (const id of Array.from(selectedNegIds)) {
      try { await onDeleteNegotiation(id) } catch { fail++ }
    }
    setBulkBusy(false)
    setConfirmBulkDelete(false)
    setSelectedNegIds(new Set())
    if (fail > 0) showToast(`${fail} club${fail !== 1 ? 'es' : ''} no se pudieron eliminar`, 'error')
    else showToast('Clubes eliminados', 'info')
  }

  const withClub = negotiations
    .map(neg => ({ neg, club: clubs.find(c => c.id === neg.clubId) }))
    .filter((x): x is { neg: ClubNegotiation; club: Club } => !!x.club)

  const statusCounts: Record<string, number> = {}
  withClub.forEach(({ neg }) => { statusCounts[neg.status] = (statusCounts[neg.status] ?? 0) + 1 })
  const gestores = Array.from(new Set(withClub.flatMap(x => parseGestores(x.neg.aisManager)))).sort()

  const q = clubSearch.trim().toLowerCase()
  const visible = withClub
    .filter(x => !statusFilter || x.neg.status === statusFilter)
    .filter(x => !gestorFilter || parseGestores(x.neg.aisManager).includes(gestorFilter))
    .filter(x => !q || x.club.name.toLowerCase().includes(q) || (x.club.league ?? '').toLowerCase().includes(q) || (x.neg.notes ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortBy === 'nombre') return a.club.name.localeCompare(b.club.name)
      if (sortBy === 'liga') return (a.club.league ?? '￿').localeCompare(b.club.league ?? '￿') || a.club.name.localeCompare(b.club.name)
      if (sortBy === 'actualizado') return (b.neg.updatedAt ?? '').localeCompare(a.neg.updatedAt ?? '')
      return NEG_STATUS_ORDER[a.neg.status] - NEG_STATUS_ORDER[b.neg.status] || a.club.name.localeCompare(b.club.name)
    })

  const allVisibleSelected = visible.length > 0 && visible.every(x => selectedNegIds.has(x.neg.id))

  let groups: { key: string; label: string; items: typeof visible }[]
  if (groupBy === 'estado') {
    groups = NEG_STATUSES
      .map(s => ({ key: s, label: NEG_STATUS_CONFIG[s].label, items: visible.filter(x => x.neg.status === s) }))
      .filter(g => g.items.length > 0)
  } else if (groupBy === 'liga') {
    const leagues = Array.from(new Set(visible.map(x => x.club.league ?? 'Sin liga')))
      .sort((a, b) => a === 'Sin liga' ? 1 : b === 'Sin liga' ? -1 : a.localeCompare(b))
    groups = leagues.map(l => ({ key: l, label: l, items: visible.filter(x => (x.club.league ?? 'Sin liga') === l) }))
  } else if (groupBy === 'nivel') {
    const tiers = Array.from(new Set(visible.map(x => getClubTier(x.club.league, x.club.country)))).sort()
    groups = tiers.map(t => ({ key: t, label: `Nivel ${t}`, items: visible.filter(x => getClubTier(x.club.league, x.club.country) === t) }))
  } else {
    groups = [{ key: 'all', label: '', items: visible }]
  }

  const renderRow = ({ neg, club }: { neg: ClubNegotiation; club: Club }) => {
    const cfg = NEG_STATUS_CONFIG[neg.status]
    if (editingNeg?.id === neg.id) {
      return (
        <div key={neg.id} className="bg-slate-50 px-3 py-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">{club.name}</div>
          <div className="flex flex-wrap gap-1">
            {NEG_STATUSES.map(s => {
              const c2 = NEG_STATUS_CONFIG[s]
              return <button key={s} onClick={() => setEditingNeg({ ...editingNeg!, status: s })} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${editingNeg!.status === s ? c2.color + ' ring-1 ring-current' : 'bg-white border border-slate-200 text-slate-500'}`}>{c2.label}</button>
            })}
          </div>
          <div className="w-full"><ManagerSelect value={editingNeg!.aisManager || undefined} onChange={(v) => setEditingNeg({ ...editingNeg!, aisManager: v ?? '' })} profiles={profiles} /></div>
          <input value={editingNeg!.notes ?? ''} onChange={e => setEditingNeg({ ...editingNeg!, notes: e.target.value })} placeholder="Notas" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
          <div className="flex gap-1.5">
            {onDeleteNegotiation && <button onClick={() => setNegToDelete(neg)} className="px-2 py-1 text-[11px] border border-red-200 text-red-500 rounded-lg">Eliminar</button>}
            <button onClick={() => setEditingNeg(null)} className="flex-1 py-1 text-[11px] border border-slate-200 rounded-lg text-slate-500">Cancelar</button>
            <button onClick={saveEditNeg} className="flex-1 py-1 text-[11px] bg-primary hover:bg-primary/90 text-white rounded-lg">Guardar</button>
          </div>
        </div>
      )
    }
    const isSelected = selectedNegIds.has(neg.id)
    return (
      <div
        key={neg.id}
        onClick={() => onRowClick ? onRowClick(neg) : setEditingNeg(neg)}
        className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all border-l-[3px] ${cfg.rowBorder} ${isSelected ? 'bg-blue-100/60' : activeNegId === neg.id ? 'bg-blue-50/70' : `${cfg.rowBg} hover:brightness-[0.97]`} ${neg.status === 'descartado' ? 'opacity-60' : ''}`}
      >
        <input
          type="checkbox"
          className="w-4 h-4 rounded flex-shrink-0"
          checked={isSelected}
          onClick={e => e.stopPropagation()}
          onChange={() => toggleNegSelected(neg.id)}
          aria-label={`Seleccionar ${club.name}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm font-medium truncate ${neg.status === 'descartado' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{club.name}</span>
            {club.league && <span className="text-[11px] text-slate-400 flex-shrink-0 hidden sm:inline">· {club.league}</span>}
            {neg.updates && neg.updates.length > 0 && <span className="text-[11px] text-slate-400 flex-shrink-0">📝 {neg.updates.length}</span>}
          </div>
          {neg.notes && <p className="text-[11px] text-slate-400 truncate mt-0.5">{neg.notes}</p>}
        </div>
        {neg.aisManager && <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline">{neg.aisManager}</span>}
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
        <button
          onClick={e => { e.stopPropagation(); setEditingNeg(neg) }}
          aria-label="Editar negociación"
          className="p-1 text-slate-300 hover:text-slate-600 flex-shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        {onSelectClub && (
          <button
            onClick={e => { e.stopPropagation(); onSelectClub(club.id) }}
            title="Ver ficha del club"
            className="p-1 text-slate-300 hover:text-blue-500 flex-shrink-0 hidden sm:inline-flex"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Cabecera: título + acciones */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title} <span>({withClub.length})</span>
        </span>
        <div className="flex items-center gap-2">
          {onAssignLeague && (
            <button onClick={onAssignLeague} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium" title="Asignar ligas completas">
              <Users className="w-3.5 h-3.5" /> Por liga
            </button>
          )}
          {onAddClub && (
            <button onClick={onAddClub} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> Añadir club
            </button>
          )}
        </div>
      </div>

      {withClub.length === 0 ? (
        <p className="text-center text-slate-400 text-xs py-6">Sin clubes contactados aún</p>
      ) : (
        <>
          {/* Chips de estado */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setStatusFilter('')} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!statusFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              Todos <span className="font-mono opacity-70">{withClub.length}</span>
            </button>
            {NEG_STATUSES.filter(s => (statusCounts[s] ?? 0) > 0).map(s => {
              const cfg = NEG_STATUS_CONFIG[s]
              return (
                <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? cfg.color + ' ring-1 ring-current' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label} <span className="font-mono opacity-60">{statusCounts[s]}</span>
                </button>
              )
            })}
          </div>

          {/* Chips de gestor */}
          {gestores.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setGestorFilter('')} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!gestorFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Gestor: todos</button>
              {gestores.map(g => (
                <button key={g} onClick={() => setGestorFilter(gestorFilter === g ? '' : g)} className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-colors ${gestorFilter === g ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{g}</button>
              ))}
            </div>
          )}

          {/* Búsqueda + orden + agrupación */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={clubSearch}
                onChange={e => setClubSearch(e.target.value)}
                placeholder="Buscar club, liga o nota…"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} aria-label="Ordenar" className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600">
              <option value="estado">Orden: estado</option>
              <option value="nombre">Orden: nombre</option>
              <option value="liga">Orden: liga</option>
              <option value="actualizado">Orden: actualizado</option>
            </select>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)} aria-label="Agrupar" className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600">
              <option value="none">Sin agrupar</option>
              <option value="estado">Agrupar: estado</option>
              <option value="liga">Agrupar: liga</option>
              <option value="nivel">Agrupar: nivel</option>
            </select>
          </div>

          {/* Barra de selección múltiple */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                checked={allVisibleSelected}
                onChange={e => setSelectedNegIds(prev => {
                  const next = new Set(prev)
                  visible.forEach(x => { if (e.target.checked) next.add(x.neg.id); else next.delete(x.neg.id) })
                  return next
                })}
              />
              Seleccionar visibles
            </label>
            <span className="text-xs text-slate-400 ml-auto">{visible.length} de {withClub.length} club{withClub.length !== 1 ? 'es' : ''}</span>
          </div>

          {selectedNegIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-slate-700">{selectedNegIds.size} seleccionado{selectedNegIds.size !== 1 ? 's' : ''}</span>
              {onUpdateNegotiation && (
                <select
                  value=""
                  disabled={bulkBusy}
                  onChange={e => { const v = e.target.value as ClubNegotiation['status'] | ''; if (v) bulkChangeStatus(v) }}
                  aria-label="Cambiar estado de los seleccionados"
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600 disabled:opacity-50"
                >
                  <option value="">Cambiar estado a…</option>
                  {NEG_STATUSES.filter(s => s !== 'descartado').map(s => <option key={s} value={s}>{NEG_STATUS_CONFIG[s].label}</option>)}
                </select>
              )}
              {onUpdateNegotiation && (
                <button onClick={() => bulkChangeStatus('descartado')} disabled={bulkBusy} className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Descartar
                </button>
              )}
              {onDeleteNegotiation && (
                <button onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
              <button onClick={() => setSelectedNegIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 ml-auto">Limpiar</button>
              {bulkBusy && <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
            </div>
          )}

          {/* Lista */}
          {visible.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-6">Ningún club coincide con los filtros</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              {groups.map(g => (
                <div key={g.key}>
                  {groupBy !== 'none' && (
                    <div className="px-3 py-1.5 bg-slate-50 border-y border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      {g.label} <span className="font-mono opacity-60">{g.items.length}</span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {g.items.map(renderRow)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Confirmación de borrado individual */}
      <ConfirmModal
        open={!!negToDelete}
        title="¿Eliminar negociación?"
        message={negToDelete ? `Se eliminará la negociación con ${clubs.find(c => c.id === negToDelete.clubId)?.name ?? 'este club'}. Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={async () => {
          if (!negToDelete) return
          try {
            await onDeleteNegotiation?.(negToDelete.id)
            setEditingNeg(null)
            setNegToDelete(null)
            showToast('Negociación eliminada', 'info')
          } catch {
            showToast('No se pudo eliminar la negociación', 'error')
          }
        }}
        onCancel={() => setNegToDelete(null)}
      />

      {/* Confirmación de borrado en grupo */}
      <ConfirmModal
        open={confirmBulkDelete}
        title={`¿Eliminar ${selectedNegIds.size} club${selectedNegIds.size !== 1 ? 'es' : ''} de la lista?`}
        message="Se eliminarán las negociaciones seleccionadas de este jugador. Esta acción no se puede deshacer. Si solo quieres apartarlos, usa «Descartar»."
        confirmLabel={bulkBusy ? 'Eliminando…' : 'Eliminar'}
        variant="danger"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  )
}
