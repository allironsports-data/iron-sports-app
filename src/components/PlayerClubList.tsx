import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Search, Edit3, ExternalLink, Trash2, Users, X, CheckSquare, ChevronDown, Check } from 'lucide-react'
import type { Club, ClubNegotiation } from '../types'
import type { Profile } from '../contexts/AuthContext'
import type { ToastVariant } from '../hooks/useToast'
import { ManagerSelect } from './ManagerSelect'
import { ConfirmModal } from './ConfirmModal'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { getClubTier, leagueLabel } from '../lib/clubTiers'

// ── Config compartida de estados de negociación ────────────────

export const NEG_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado']

export const NEG_STATUS_CONFIG: Record<ClubNegotiation['status'], { label: string; color: string; dot: string; rowBorder: string; rowBg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400', rowBorder: 'border-l-purple-400', rowBg: 'bg-purple-100/50' },
  ofrecido:   { label: 'Ofrecido',   color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400',  rowBorder: 'border-l-slate-400',  rowBg: 'bg-slate-100/60' },
  interesado: { label: 'Interesado', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',   rowBorder: 'border-l-blue-500',   rowBg: 'bg-blue-100/50' },
  negociando: { label: 'Negociando', color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500',  rowBorder: 'border-l-amber-500',  rowBg: 'bg-amber-100/60' },
  cerrado:    { label: 'Cerrado',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500',  rowBorder: 'border-l-green-500',  rowBg: 'bg-green-100/60' },
  descartado: { label: 'Descartado', color: 'bg-red-100 text-red-600',       dot: 'bg-red-400',    rowBorder: 'border-l-red-400',    rowBg: 'bg-red-100/40' },
}

export const NEG_STATUS_ORDER: Record<ClubNegotiation['status'], number> = {
  negociando: 0, interesado: 1, ofrecido: 2, pendiente: 3, cerrado: 4, descartado: 5,
}

/** "LT / AV / PP" → ['LT','AV','PP']; normaliza espacios y mayúsculas para evitar dupes */
export const parseGestores = (s?: string) => (s ?? '').split(/[/,+&]/).map(t => t.trim().toUpperCase()).filter(Boolean)

/** Estados con negociación viva (cuentan para "estancada") */
const ACTIVE_STATUSES: ClubNegotiation['status'][] = ['pendiente', 'ofrecido', 'interesado', 'negociando']
const STALE_DAYS = 7

/** Días desde la última actualización; null si no hay fecha */
const daysSince = (iso?: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null

/** Fecha de la última actividad: cambios O notas de seguimiento, lo más reciente */
const lastActivity = (n: ClubNegotiation): string | undefined => {
  const dates = [n.updatedAt ?? n.createdAt, ...(n.updates ?? []).map(u => u.date)].filter(Boolean) as string[]
  return dates.sort().pop()
}

/** Negociación activa sin actividad en más de STALE_DAYS días */
const isStale = (n: ClubNegotiation) => {
  if (!ACTIVE_STATUSES.includes(n.status)) return false
  const d = daysSince(lastActivity(n))
  return d !== null && d > STALE_DAYS
}

// ── Desplegable de filtro multiselección (compacto) ────────────

function FilterDropdown({ label, active, children, widthClass = 'w-60' }: {
  label: string
  active?: number
  children: ReactNode
  widthClass?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors ${active ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
      >
        {label}{active ? ` (${active})` : ''}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 z-50 mt-1 ${widthClass} max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-1`}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function CheckItem({ selected, onToggle, count, children }: {
  selected: boolean
  onToggle: () => void
  count?: number
  children: ReactNode
}) {
  return (
    <button onClick={onToggle} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-slate-50">
      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-primary border-primary' : 'border-slate-300'}`}>
        {selected && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      <span className="flex-1 truncate text-slate-700 flex items-center gap-1.5">{children}</span>
      {count !== undefined && <span className="text-slate-400 font-mono">{count}</span>}
    </button>
  )
}

// ── Detalle de una negociación (contenido compartido overlay / lado) ──

export function NegDetail({ neg, club, profiles, currentProfile, onUpdateNegotiation, onSelectClub, onRequestDelete, onClose, showToast, variant, heading, subheading }: {
  neg: ClubNegotiation
  club: Club
  profiles: Profile[]
  currentProfile: Profile
  onUpdateNegotiation?: (n: ClubNegotiation) => Promise<void>
  onSelectClub?: (id: string) => void
  onRequestDelete?: () => void
  onClose: () => void
  showToast: (message: string, variant?: ToastVariant) => void
  variant: 'overlay' | 'side'
  /** Cabecera alternativa (p. ej. nombre del jugador cuando se abre desde la ficha de un club) */
  heading?: string
  subheading?: string
}) {
  const [notesDraft, setNotesDraft] = useState(neg.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [savingUpdate, setSavingUpdate] = useState(false)

  const scfg = NEG_STATUS_CONFIG[neg.status]
  const sortedUpdates = [...(neg.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  async function changeStatus(s: ClubNegotiation['status']) {
    if (!onUpdateNegotiation) return
    try {
      await onUpdateNegotiation({ ...neg, status: s })
    } catch {
      showToast('No se pudo cambiar el estado', 'error')
    }
  }

  async function changeManager(v: string | undefined) {
    if (!onUpdateNegotiation) return
    try {
      await onUpdateNegotiation({ ...neg, aisManager: v ?? '' })
    } catch {
      showToast('No se pudo cambiar el encargado', 'error')
    }
  }

  async function saveNotes() {
    if (!onUpdateNegotiation) return
    setSavingNotes(true)
    try {
      await onUpdateNegotiation({ ...neg, notes: notesDraft.trim() || undefined })
      showToast('Información guardada')
    } catch {
      showToast('No se pudo guardar la información', 'error')
    } finally { setSavingNotes(false) }
  }

  async function addUpdate() {
    if (!updateText.trim() || !onUpdateNegotiation) return
    setSavingUpdate(true)
    try {
      const newUpdate = {
        id: crypto.randomUUID(),
        text: updateText.trim(),
        date: new Date().toISOString(),
        author: currentProfile.avatar,
      }
      await onUpdateNegotiation({ ...neg, updates: [...(neg.updates ?? []), newUpdate] })
      setUpdateText('')
    } catch {
      showToast('No se pudo guardar la nota', 'error')
    } finally { setSavingUpdate(false) }
  }

  const body = (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 text-sm truncate">{heading ?? club.name}</div>
          <div className="flex items-center gap-1.5">
            {(subheading ?? club.league) && <span className="text-xs text-slate-400">{subheading ?? club.league}</span>}
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar detalle" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Estado + encargado + info */}
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0 space-y-3">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estado</div>
          <div className="flex flex-wrap gap-1">
            {NEG_STATUSES.map(s => {
              const cfg = NEG_STATUS_CONFIG[s]
              return (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${neg.status === s ? cfg.color + ' ring-1 ring-current' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Encargado</div>
          <ManagerSelect value={neg.aisManager || undefined} onChange={changeManager} profiles={profiles} />
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Información</div>
          <textarea
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="Condiciones, contexto, contacto…"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          {notesDraft !== (neg.notes ?? '') && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-1 w-full py-1.5 text-xs bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
            >
              {savingNotes && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {savingNotes ? 'Guardando…' : 'Guardar información'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="text-slate-400">{new Date(neg.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {onSelectClub && (
            <button
              onClick={() => { onClose(); onSelectClub(club.id) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="w-3 h-3" /> Ver ficha del club
            </button>
          )}
          {onRequestDelete && (
            <button
              onClick={onRequestDelete}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 ml-auto"
            >
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Notas de seguimiento */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-2.5 ${variant === 'side' ? 'max-h-72' : ''}`}>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Notas de seguimiento</div>
        {sortedUpdates.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center">Sin notas aún</p>
        )}
        {sortedUpdates.map(u => (
          <div key={u.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              {u.author && <span className="text-[11px] font-mono bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{u.author}</span>}
              <span className="text-[11px] text-slate-400 ml-auto">
                {new Date(u.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                {' '}
                {new Date(u.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-slate-700">{u.text}</p>
          </div>
        ))}
      </div>

      {/* Añadir nota */}
      {onUpdateNegotiation && (
        <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0 space-y-2">
          <textarea
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            placeholder="Añadir nota de seguimiento…"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-200"
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); addUpdate() } }}
          />
          <button
            onClick={addUpdate}
            disabled={!updateText.trim() || savingUpdate}
            className="w-full py-1.5 text-xs bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
          >
            {savingUpdate && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {savingUpdate ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      )}
    </>
  )

  if (variant === 'side') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {body}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-80 z-50 bg-white border-l border-slate-200 shadow-xl flex flex-col">
        {body}
      </div>
    </>
  )
}

// ── Lista unificada de clubes contactados de un jugador ────────
// Se usa en: ficha del jugador (pestaña Distribución) y panel lateral de Distribución.
// Clic en fila → detalle completo (estado, gestor, info, notas de seguimiento).
// Lápiz → edición rápida inline. "Seleccionar varios" activa las acciones en grupo.
// detailMode 'side' (doble vista): el detalle queda fijo a la derecha de la lista.

export function PlayerClubList({
  negotiations, clubs, profiles, currentProfile,
  onUpdateNegotiation, onDeleteNegotiation, onSelectClub,
  onAddClub, onAssignLeague, showToast,
  title = 'Clubes contactados', expanded = false, detailMode = 'overlay',
}: {
  negotiations: ClubNegotiation[]
  clubs: Club[]
  profiles: Profile[]
  currentProfile: Profile
  onUpdateNegotiation?: (n: ClubNegotiation) => Promise<void>
  onDeleteNegotiation?: (id: string) => Promise<void>
  onSelectClub?: (id: string) => void
  onAddClub?: () => void
  onAssignLeague?: () => void
  showToast: (message: string, variant?: ToastVariant) => void
  title?: string
  /** Muestra información extra en cada fila (última actualización y último seguimiento) */
  expanded?: boolean
  /** 'overlay': detalle en slide-over. 'side': detalle fijo a la derecha (doble vista). */
  detailMode?: 'overlay' | 'side'
}) {
  const [statusFilter, setStatusFilter] = useState<ClubNegotiation['status'][]>([])
  const [gestorFilter, setGestorFilter] = useState<string[]>([])
  const [staleOnly, setStaleOnly] = useState(false)
  const [leagueFilter, setLeagueFilter] = useState<string[]>([])
  const [clubSearch, setClubSearch] = useState('')
  const [sortBy, setSortBy] = useState<'estado' | 'nombre' | 'liga' | 'actualizado'>('estado')
  const [groupBy, setGroupBy] = useState<'none' | 'estado' | 'liga' | 'nivel'>('none')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedNegIds, setSelectedNegIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [negToDelete, setNegToDelete] = useState<ClubNegotiation | null>(null)
  const [panelNegId, setPanelNegId] = useState<string | null>(null)

  const panelNeg = negotiations.find(n => n.id === panelNegId) ?? null
  const panelClub = panelNeg ? clubs.find(c => c.id === panelNeg.clubId) ?? null : null

  useEscapeKey(() => setPanelNegId(null), !!panelNegId && detailMode === 'overlay')

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedNegIds(new Set())
  }

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

  const staleCount = withClub.filter(x => isStale(x.neg)).length

  // Ligas presentes en la lista (clave liga+país para no mezclar p. ej. Serie A ITA y BRA)
  const leagueKey = (c: Club) => `${c.league ?? 'Sin liga'}|${c.country ?? ''}`
  const leagueCounts = new Map<string, { label: string; count: number }>()
  withClub.forEach(x => {
    const k = leagueKey(x.club)
    const existing = leagueCounts.get(k)
    leagueCounts.set(k, { label: leagueLabel(x.club.league, x.club.country), count: (existing?.count ?? 0) + 1 })
  })
  const allLeagues = Array.from(leagueCounts.entries())
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => a.label.startsWith('Sin liga') ? 1 : b.label.startsWith('Sin liga') ? -1 : a.label.localeCompare(b.label))

  const q = clubSearch.trim().toLowerCase()
  const visible = withClub
    .filter(x => statusFilter.length === 0 || statusFilter.includes(x.neg.status))
    .filter(x => gestorFilter.length === 0 || parseGestores(x.neg.aisManager).some(g => gestorFilter.includes(g)))
    .filter(x => !staleOnly || isStale(x.neg))
    .filter(x => leagueFilter.length === 0 || leagueFilter.includes(leagueKey(x.club)))
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
    const leagueGroups = new Map<string, string>()
    visible.forEach(x => leagueGroups.set(leagueKey(x.club), leagueLabel(x.club.league, x.club.country)))
    groups = Array.from(leagueGroups.entries())
      .sort((a, b) => a[1].startsWith('Sin liga') ? 1 : b[1].startsWith('Sin liga') ? -1 : a[1].localeCompare(b[1]))
      .map(([k, label]) => ({ key: k, label, items: visible.filter(x => leagueKey(x.club) === k) }))
  } else if (groupBy === 'nivel') {
    const tiers = Array.from(new Set(visible.map(x => getClubTier(x.club.league, x.club.country)))).sort()
    groups = tiers.map(t => ({ key: t, label: `Nivel ${t}`, items: visible.filter(x => getClubTier(x.club.league, x.club.country) === t) }))
  } else {
    groups = [{ key: 'all', label: '', items: visible }]
  }

  const fmtShort = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

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
    const lastUpdate = neg.updates && neg.updates.length > 0
      ? [...neg.updates].sort((a, b) => b.date.localeCompare(a.date))[0]
      : null
    return (
      <div
        key={neg.id}
        onClick={() => selectMode ? toggleNegSelected(neg.id) : setPanelNegId(neg.id)}
        className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all border-l-[3px] ${cfg.rowBorder} ${isSelected ? 'bg-blue-100/60' : panelNegId === neg.id ? 'bg-blue-50/70' : `${cfg.rowBg} hover:brightness-[0.97]`} ${neg.status === 'descartado' ? 'opacity-60' : ''}`}
      >
        {selectMode && (
          <input
            type="checkbox"
            className="w-4 h-4 rounded flex-shrink-0"
            checked={isSelected}
            onClick={e => e.stopPropagation()}
            onChange={() => toggleNegSelected(neg.id)}
            aria-label={`Seleccionar ${club.name}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm font-medium truncate ${neg.status === 'descartado' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{club.name}</span>
            {club.league && <span className="text-[11px] text-slate-400 flex-shrink-0 hidden sm:inline">· {leagueLabel(club.league, club.country)}</span>}
            {neg.updates && neg.updates.length > 0 && <span className="text-[11px] text-slate-400 flex-shrink-0">📝 {neg.updates.length}</span>}
            {isStale(neg) && (
              <span title={`Sin actividad en ${daysSince(lastActivity(neg))} días`} className="text-[11px] font-medium text-amber-600 flex-shrink-0">
                ⏰ {daysSince(lastActivity(neg))}d
              </span>
            )}
          </div>
          {neg.notes && <p className="text-[11px] text-slate-400 truncate mt-0.5">{neg.notes}</p>}
          {expanded && (lastActivity(neg) || lastUpdate) && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {lastActivity(neg) && <span className="text-slate-300">Actualizado {fmtShort(lastActivity(neg))}</span>}
              {lastUpdate && <span> · 📝 {lastUpdate.text}</span>}
            </p>
          )}
        </div>
        {neg.aisManager && <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline">{neg.aisManager}</span>}
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
        {!selectMode && (
          <button
            onClick={e => { e.stopPropagation(); setEditingNeg(neg) }}
            aria-label="Edición rápida"
            title="Edición rápida"
            className="p-1 text-slate-300 hover:text-slate-600 flex-shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
        {!selectMode && onSelectClub && (
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

  const detailNode = panelNeg && panelClub ? (
    <NegDetail
      key={panelNeg.id}
      neg={panelNeg}
      club={panelClub}
      profiles={profiles}
      currentProfile={currentProfile}
      onUpdateNegotiation={onUpdateNegotiation}
      onSelectClub={onSelectClub}
      onRequestDelete={onDeleteNegotiation ? () => setNegToDelete(panelNeg) : undefined}
      onClose={() => setPanelNegId(null)}
      showToast={showToast}
      variant={detailMode}
    />
  ) : null

  const listContent = (
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
          {/* Barra de filtros compacta */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={clubSearch}
                onChange={e => setClubSearch(e.target.value)}
                placeholder="Buscar club, liga o nota…"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Estado (multiselección + estancadas) */}
            <FilterDropdown label="Estado" active={statusFilter.length + (staleOnly ? 1 : 0)} widthClass="w-56">
              <button
                onClick={() => { setStatusFilter([]); setStaleOnly(false) }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium ${statusFilter.length === 0 && !staleOnly ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Todos <span className="font-mono opacity-70">{withClub.length}</span>
              </button>
              {NEG_STATUSES.filter(st => (statusCounts[st] ?? 0) > 0).map(st => {
                const cfg = NEG_STATUS_CONFIG[st]
                const sel = statusFilter.includes(st)
                return (
                  <CheckItem key={st} selected={sel} count={statusCounts[st]} onToggle={() => setStatusFilter(prev => sel ? prev.filter(x => x !== st) : [...prev, st])}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                  </CheckItem>
                )
              })}
              {staleCount > 0 && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <CheckItem selected={staleOnly} count={staleCount} onToggle={() => setStaleOnly(v => !v)}>
                    <span className="text-amber-600">⏰ Estancadas</span>
                  </CheckItem>
                </>
              )}
            </FilterDropdown>

            {/* Gestor (multiselección) */}
            {gestores.length > 1 && (
              <FilterDropdown label="Gestor" active={gestorFilter.length} widthClass="w-44">
                <button
                  onClick={() => setGestorFilter([])}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium ${gestorFilter.length === 0 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Todos
                </button>
                {gestores.map(g => {
                  const sel = gestorFilter.includes(g)
                  return (
                    <CheckItem key={g} selected={sel} onToggle={() => setGestorFilter(prev => sel ? prev.filter(x => x !== g) : [...prev, g])}>
                      <span className="font-mono">{g}</span>
                    </CheckItem>
                  )
                })}
              </FilterDropdown>
            )}

            {/* Ligas (multiselección) */}
            <FilterDropdown label="Ligas" active={leagueFilter.length} widthClass="w-64">
              <button
                onClick={() => setLeagueFilter([])}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium ${leagueFilter.length === 0 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Todas las ligas
              </button>
              {allLeagues.map(({ key, label, count }) => {
                const sel = leagueFilter.includes(key)
                return (
                  <CheckItem key={key} selected={sel} count={count} onToggle={() => setLeagueFilter(prev => sel ? prev.filter(l => l !== key) : [...prev, key])}>
                    {label}
                  </CheckItem>
                )
              })}
            </FilterDropdown>

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
            {(statusFilter.length > 0 || gestorFilter.length > 0 || leagueFilter.length > 0 || staleOnly || clubSearch) && (
              <button
                onClick={() => { setStatusFilter([]); setGestorFilter([]); setLeagueFilter([]); setStaleOnly(false); setClubSearch('') }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Selección múltiple (opt-in) */}
          <div className="flex items-center gap-3 flex-wrap">
            {!selectMode ? (
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Seleccionar varios
              </button>
            ) : (
              <>
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
                <button onClick={exitSelectMode} className="text-xs text-slate-500 hover:text-slate-700">Salir de selección</button>
              </>
            )}
            <span className="text-xs text-slate-400 ml-auto">{visible.length} de {withClub.length} club{withClub.length !== 1 ? 'es' : ''}</span>
          </div>

          {selectMode && selectedNegIds.size > 0 && (
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
    </div>
  )

  return (
    <div className={detailMode === 'side' ? 'flex flex-col sm:flex-row gap-4 items-stretch sm:items-start' : undefined}>
      <div className={detailMode === 'side' ? 'flex-1 min-w-0 order-2 sm:order-1' : undefined}>
        {listContent}
      </div>

      {detailMode === 'side' && (
        <div className="w-full sm:w-80 flex-shrink-0 sm:sticky sm:top-3 order-1 sm:order-2">
          {detailNode ?? (
            <div className="hidden sm:block border-2 border-dashed border-slate-200 rounded-xl py-16 px-6 text-center">
              <p className="text-xs text-slate-400">Haz clic en un club para ver y editar la oportunidad: estado, encargado, información y notas de seguimiento.</p>
            </div>
          )}
        </div>
      )}

      {detailMode === 'overlay' && detailNode}

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
            if (panelNegId === negToDelete.id) setPanelNegId(null)
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
