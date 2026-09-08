import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Search, Edit3, ExternalLink, Trash2, Users, X, CheckSquare, ChevronDown, Check, ArrowLeft, List, LayoutGrid, MessageSquare, Clock } from 'lucide-react'
import type { Club, ClubNegotiation } from '../types'
import type { Profile } from '../contexts/AuthContext'
import type { ToastVariant } from '../hooks/useToast'
import { ManagerSelect } from './ManagerSelect'
import { ConfirmModal } from './ConfirmModal'
import { Button, ClickableRow, IconButton, Input, Select, Sheet, Textarea } from './ui'
import { L, NEG_STATUS_LABELS } from '../lib/labels'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { getClubTier, leagueLabel } from '../lib/clubTiers'
import { NEG_STATUSES, NEG_STATUS_CONFIG, NEG_STATUS_ORDER, parseGestores } from './playerClubList'

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
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2.5 min-h-9 sm:min-h-8 border rounded-lg text-secondary font-medium transition-colors ${active ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}
      >
        {label}{active ? ` (${active})` : ''}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
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
    <button type="button" role="checkbox" aria-checked={selected} onClick={onToggle} className="w-full text-left px-2.5 py-1.5 rounded-lg text-secondary flex items-center gap-2 hover:bg-slate-50">
      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-primary border-primary' : 'border-slate-300'}`} aria-hidden="true">
        {selected && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      <span className="flex-1 truncate text-slate-700 flex items-center gap-1.5">{children}</span>
      {count !== undefined && <span className="text-slate-500 font-mono">{count}</span>}
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

  // Cambios sin guardar (información o nota en curso): el Sheet pregunta antes de cerrar
  const dirty = notesDraft !== (neg.notes ?? '') || !!updateText.trim()

  const cabecera = (
    <>
      <div className="font-semibold text-slate-800 text-body truncate">{heading ?? club.name}</div>
      <div className="flex items-center gap-1.5">
        {(subheading ?? club.league) && <span className="text-secondary text-slate-500">{subheading ?? club.league}</span>}
        <span className={`text-badge font-medium px-1.5 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
      </div>
    </>
  )

  const cuerpo = (
    <>
      {/* Estado + encargado + info */}
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0 space-y-3">
        <div>
          <div className="text-meta font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{L.estado}</div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={L.estado}>
            {NEG_STATUSES.map(s => {
              const cfg = NEG_STATUS_CONFIG[s]
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={neg.status === s}
                  onClick={() => changeStatus(s)}
                  className={`px-2 min-h-9 sm:min-h-7 rounded-full text-secondary font-medium transition-colors ${neg.status === s ? cfg.color + ' ring-1 ring-current' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-meta font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{L.encargado}</div>
          <ManagerSelect value={neg.aisManager || undefined} onChange={changeManager} profiles={profiles} />
        </div>

        <div>
          <label className="block text-meta font-semibold text-slate-600 uppercase tracking-wider mb-1.5" htmlFor={`neg-info-${neg.id}`}>Información</label>
          <Textarea
            id={`neg-info-${neg.id}`}
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="Condiciones, contexto, contacto…"
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveNotes() } }}
          />
          {notesDraft !== (neg.notes ?? '') && (
            <Button variant="primary" size="sm" onClick={saveNotes} loading={savingNotes} className="mt-1 w-full">
              Guardar información
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-secondary text-slate-600 flex-wrap">
          <span className="text-slate-500">{new Date(neg.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          {onSelectClub && (
            <Button variant="link" size="sm" icon={<ExternalLink />} onClick={() => { onClose(); onSelectClub(club.id) }}>
              Ver ficha del club
            </Button>
          )}
          {onRequestDelete && (
            <Button variant="link" size="sm" icon={<Trash2 />} onClick={onRequestDelete} className="ml-auto text-red-600">
              {L.eliminar}
            </Button>
          )}
        </div>
      </div>

      {/* Notas de seguimiento */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-2.5 ${variant === 'side' ? 'max-h-72' : ''}`}>
        <div className="text-meta font-semibold text-slate-600 uppercase tracking-wider">Notas de seguimiento</div>
        {sortedUpdates.length === 0 && (
          <p className="text-secondary text-slate-500 py-4 text-center">Sin notas aún</p>
        )}
        {sortedUpdates.map(u => (
          <div key={u.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              {u.author && <span className="text-badge font-mono bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{u.author}</span>}
              <span className="text-meta text-slate-500 ml-auto">
                {new Date(u.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                {' '}
                {new Date(u.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-body text-slate-700">{u.text}</p>
          </div>
        ))}
      </div>

      {/* Añadir nota */}
      {onUpdateNegotiation && (
        <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0 space-y-2">
          <label className="sr-only" htmlFor={`neg-nota-${neg.id}`}>Nueva nota de seguimiento</label>
          <Textarea
            id={`neg-nota-${neg.id}`}
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            placeholder="Añadir nota de seguimiento…"
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void addUpdate() } }}
          />
          <Button variant="primary" size="sm" onClick={addUpdate} disabled={!updateText.trim()} loading={savingUpdate} className="w-full" title="Ctrl+Enter o ⌘+Enter">
            Guardar nota
          </Button>
        </div>
      )}
    </>
  )

  if (variant === 'side') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex-1 min-w-0">{cabecera}</div>
          <IconButton label="Cerrar detalle" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        {cuerpo}
      </div>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      historyKey="neg-detalle"
      title={heading ?? club.name}
      description={
        <span className="flex items-center gap-1.5">
          {(subheading ?? club.league) && <span>{subheading ?? club.league}</span>}
          <span className={`text-badge font-medium px-1.5 py-0.5 rounded-full ${scfg.color}`}>{scfg.label}</span>
        </span>
      }
      className="sm:max-w-sm"
    >
      <div className="-mx-4 sm:-mx-5 -my-4 flex flex-col">{cuerpo}</div>
    </Sheet>
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
  title = 'Clubes contactados', expanded = false, detailMode = 'push',
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
  /** 'push': el detalle sustituye a la lista con "volver" (paneles estrechos).
   *  'side': detalle fijo a la derecha (doble vista). */
  detailMode?: 'push' | 'side'
}) {
  const [statusFilter, setStatusFilter] = useState<ClubNegotiation['status'][]>([])
  const [gestorFilter, setGestorFilter] = useState<string[]>([])
  const [staleOnly, setStaleOnly] = useState(false)
  const [leagueFilter, setLeagueFilter] = useState<string[]>([])
  const [clubSearch, setClubSearch] = useState('')
  const [sortBy, setSortBy] = useState<'estado' | 'nombre' | 'liga' | 'actualizado'>('estado')
  const [groupBy, setGroupBy] = useState<'none' | 'estado' | 'liga' | 'nivel'>('none')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedNegIds, setSelectedNegIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [editingNeg, setEditingNeg] = useState<ClubNegotiation | null>(null)
  const [negToDelete, setNegToDelete] = useState<ClubNegotiation | null>(null)
  const [panelNegId, setPanelNegId] = useState<string | null>(null)

  const panelNeg = negotiations.find(n => n.id === panelNegId) ?? null
  const panelClub = panelNeg ? clubs.find(c => c.id === panelNeg.clubId) ?? null : null

  useEscapeKey(() => setPanelNegId(null), !!panelNegId && detailMode === 'push')

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
  const gestores = Array.from(new Set(withClub.flatMap(x => parseGestores(x.neg.aisManager)))).sort((a, b) => a.localeCompare(b, 'es'))

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
    // Por defecto ("Todos") se ocultan los cerrados: quedan como historial,
    // visibles solo si se marca "Cerrado" explícitamente en el filtro de Estado.
    .filter(x => statusFilter.length > 0 ? statusFilter.includes(x.neg.status) : x.neg.status !== 'cerrado')
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
    // Orden: negociando → interesado → ofrecido → pendiente → cerrado → descartado
    groups = [...NEG_STATUSES]
      .sort((a, b) => NEG_STATUS_ORDER[a] - NEG_STATUS_ORDER[b])
      .map(s => ({ key: s, label: NEG_STATUS_CONFIG[s].label, items: visible.filter(x => x.neg.status === s) }))
      .filter(g => g.items.length > 0)
  } else if (groupBy === 'liga') {
    const leagueGroups = new Map<string, string>()
    visible.forEach(x => leagueGroups.set(leagueKey(x.club), leagueLabel(x.club.league, x.club.country)))
    groups = Array.from(leagueGroups.entries())
      .sort((a, b) => a[1].startsWith('Sin liga') ? 1 : b[1].startsWith('Sin liga') ? -1 : a[1].localeCompare(b[1]))
      .map(([k, label]) => ({ key: k, label, items: visible.filter(x => leagueKey(x.club) === k) }))
  } else if (groupBy === 'nivel') {
    const tiers = Array.from(new Set(visible.map(x => getClubTier(x.club.league, x.club.country)))).sort((a, b) => a.localeCompare(b, 'es'))
    groups = tiers.map(t => ({ key: t, label: `Nivel ${t}`, items: visible.filter(x => getClubTier(x.club.league, x.club.country) === t) }))
  } else {
    groups = [{ key: 'all', label: '', items: visible }]
  }

  const fmtShort = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

  const renderRow = ({ neg, club }: { neg: ClubNegotiation; club: Club }) => {
    const cfg = NEG_STATUS_CONFIG[neg.status]
    if (editingNeg?.id === neg.id) {
      return (
        <form key={neg.id} onSubmit={e => { e.preventDefault(); void saveEditNeg() }} className="bg-slate-50 px-3 py-3 space-y-2">
          <div className="text-secondary font-semibold text-slate-700">{club.name}</div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={L.estado}>
            {NEG_STATUSES.map(s => {
              const c2 = NEG_STATUS_CONFIG[s]
              return <button key={s} type="button" role="radio" aria-checked={editingNeg!.status === s} onClick={() => setEditingNeg({ ...editingNeg!, status: s })} className={`px-2 min-h-8 sm:min-h-7 rounded-full text-badge font-medium ${editingNeg!.status === s ? c2.color + ' ring-1 ring-current' : 'bg-white border border-slate-200 text-slate-600'}`}>{c2.label}</button>
            })}
          </div>
          <div className="w-full"><ManagerSelect value={editingNeg!.aisManager || undefined} onChange={(v) => setEditingNeg({ ...editingNeg!, aisManager: v ?? '' })} profiles={profiles} /></div>
          <Input value={editingNeg!.notes ?? ''} onChange={e => setEditingNeg({ ...editingNeg!, notes: e.target.value })} placeholder="Notas" aria-label="Notas" />
          <div className="flex gap-1.5 justify-end">
            {onDeleteNegotiation && <Button size="sm" variant="danger" onClick={() => setNegToDelete(neg)} className="mr-auto">{L.eliminar}</Button>}
            <Button size="sm" onClick={() => setEditingNeg(null)}>{L.cancelar}</Button>
            <Button size="sm" type="submit" variant="primary">{L.guardar}</Button>
          </div>
        </form>
      )
    }
    const isSelected = selectedNegIds.has(neg.id)
    const lastUpdate = neg.updates && neg.updates.length > 0
      ? [...neg.updates].sort((a, b) => b.date.localeCompare(a.date))[0]
      : null
    return (
      <ClickableRow
        key={neg.id}
        onClick={() => selectMode ? toggleNegSelected(neg.id) : setPanelNegId(neg.id)}
        selected={panelNegId === neg.id}
        className={`rounded-none gap-2.5 px-3 py-2.5 transition-all border-l-[3px] ${cfg.rowBorder} ${isSelected ? 'bg-blue-100/60 hover:bg-blue-100/60' : panelNegId === neg.id ? 'bg-blue-50/70 hover:bg-blue-50/70' : `${cfg.rowBg} hover:brightness-[0.97] hover:bg-transparent`} ${neg.status === 'descartado' ? 'opacity-60' : ''}`}
        actionsClassName="gap-0.5"
        actions={
          <>
            {neg.aisManager && <span className="text-badge font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline" title={L.encargado}>{neg.aisManager}</span>}
            <span className={`text-badge font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
            {!selectMode && (
              <IconButton label="Edición rápida" onClick={() => setEditingNeg(neg)}>
                <Edit3 />
              </IconButton>
            )}
            {!selectMode && onSelectClub && (
              <IconButton label="Ver ficha del club" onClick={() => onSelectClub(club.id)} className="hidden sm:inline-flex">
                <ExternalLink />
              </IconButton>
            )}
          </>
        }
      >
        <div className="flex items-center gap-2.5 min-w-0">
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
            <span className={`text-body font-medium flex-shrink-0 max-w-[60%] truncate ${neg.status === 'descartado' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{club.name}</span>
            {club.league && <span className="text-meta text-slate-500 truncate min-w-0 hidden sm:inline">· {leagueLabel(club.league, club.country)}</span>}
            {neg.updates && neg.updates.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-meta text-slate-500 flex-shrink-0" title={`${neg.updates.length} nota${neg.updates.length !== 1 ? 's' : ''} de seguimiento`}>
                <MessageSquare className="w-3 h-3" aria-hidden="true" /> {neg.updates.length}
              </span>
            )}
            {isStale(neg) && (
              <span title={`Sin actividad en ${daysSince(lastActivity(neg))} días`} className="inline-flex items-center gap-0.5 text-meta font-medium text-amber-700 flex-shrink-0">
                <Clock className="w-3 h-3" aria-hidden="true" /> {daysSince(lastActivity(neg))}d
              </span>
            )}
          </div>
          {neg.notes && <p className="text-meta text-slate-500 truncate mt-0.5">{neg.notes}</p>}
          {expanded && (lastActivity(neg) || lastUpdate) && (
            <p className="text-meta text-slate-500 truncate mt-0.5">
              {lastActivity(neg) && <span>Actualizado {fmtShort(lastActivity(neg))}</span>}
              {lastUpdate && <span> · {lastUpdate.text}</span>}
            </p>
          )}
        </div>
        </div>
      </ClickableRow>
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
      variant="side"
    />
  ) : null

  const listContent = (
    <div className="space-y-2">
      {/* Cabecera: título + acciones */}
      <div className="flex items-center justify-between">
        <span className="text-meta font-semibold text-slate-600 uppercase tracking-wider">
          {title} <span>({withClub.length})</span>
        </span>
        <div className="flex items-center gap-2">
          {/* Vista: lista (1 col) / tarjetas (2 col) */}
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden flex-shrink-0">
            <IconButton
              label="Vista de lista"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`rounded-none ${viewMode === 'list' ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`}
            >
              <List />
            </IconButton>
            <IconButton
              label="Vista de tarjetas (2 columnas)"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={`rounded-none border-l border-slate-300 ${viewMode === 'grid' ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`}
            >
              <LayoutGrid />
            </IconButton>
          </div>
          {onAssignLeague && (
            <Button variant="link" size="sm" icon={<Users />} onClick={onAssignLeague} className="text-purple-700" title="Asignar ligas completas">
              Por liga
            </Button>
          )}
          {onAddClub && (
            <Button variant="link" size="sm" icon={<Plus />} onClick={onAddClub}>
              Añadir club
            </Button>
          )}
        </div>
      </div>

      {withClub.length === 0 ? (
        <p className="text-center text-slate-500 text-secondary py-6">Sin clubes contactados aún</p>
      ) : (
        <>
          {/* Barra de filtros compacta */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <Input
                value={clubSearch}
                onChange={e => setClubSearch(e.target.value)}
                placeholder="Buscar club, liga o nota…"
                aria-label="Buscar club, liga o nota"
                className="pl-8 py-1.5"
              />
            </div>

            {/* Estado (multiselección + estancadas) */}
            <FilterDropdown label={L.estado} active={statusFilter.length + (staleOnly ? 1 : 0)} widthClass="w-56">
              <button
                type="button"
                onClick={() => { setStatusFilter([]); setStaleOnly(false) }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-secondary font-medium ${statusFilter.length === 0 && !staleOnly ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Todos <span className="font-mono opacity-70">{withClub.length}</span>
              </button>
              {NEG_STATUSES.filter(st => (statusCounts[st] ?? 0) > 0).map(st => {
                const cfg = NEG_STATUS_CONFIG[st]
                const sel = statusFilter.includes(st)
                return (
                  <CheckItem key={st} selected={sel} count={statusCounts[st]} onToggle={() => setStatusFilter(prev => sel ? prev.filter(x => x !== st) : [...prev, st])}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />{cfg.label}
                  </CheckItem>
                )
              })}
              {staleCount > 0 && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <CheckItem selected={staleOnly} count={staleCount} onToggle={() => setStaleOnly(v => !v)}>
                    <span className="inline-flex items-center gap-1 text-amber-700"><Clock className="w-3 h-3" aria-hidden="true" /> Estancadas</span>
                  </CheckItem>
                </>
              )}
            </FilterDropdown>

            {/* Gestor (multiselección) */}
            {gestores.length > 1 && (
              <FilterDropdown label={L.encargado} active={gestorFilter.length} widthClass="w-44">
                <button
                  type="button"
                  onClick={() => setGestorFilter([])}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-secondary font-medium ${gestorFilter.length === 0 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
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
                type="button"
                onClick={() => setLeagueFilter([])}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-secondary font-medium ${leagueFilter.length === 0 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
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

            <Select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} aria-label="Ordenar" className="w-auto py-1 text-secondary">
              <option value="estado">Orden: estado</option>
              <option value="nombre">Orden: nombre</option>
              <option value="liga">Orden: liga</option>
              <option value="actualizado">Orden: actualizado</option>
            </Select>
            <Select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)} aria-label="Agrupar" className="w-auto py-1 text-secondary">
              <option value="none">Sin agrupar</option>
              <option value="estado">Agrupar: estado</option>
              <option value="liga">Agrupar: liga</option>
              <option value="nivel">Agrupar: nivel</option>
            </Select>
            {(statusFilter.length > 0 || gestorFilter.length > 0 || leagueFilter.length > 0 || staleOnly || clubSearch) && (
              <Button variant="link" size="sm" onClick={() => { setStatusFilter([]); setGestorFilter([]); setLeagueFilter([]); setStaleOnly(false); setClubSearch('') }}>
                Limpiar
              </Button>
            )}
          </div>

          {/* Selección múltiple (opt-in) */}
          <div className="flex items-center gap-3 flex-wrap">
            {!selectMode ? (
              <Button variant="ghost" size="sm" icon={<CheckSquare />} onClick={() => setSelectMode(true)}>
                Seleccionar varios
              </Button>
            ) : (
              <>
                <label className="flex items-center gap-1.5 text-secondary text-slate-600 cursor-pointer">
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
                <Button variant="ghost" size="sm" onClick={exitSelectMode}>Salir de selección</Button>
              </>
            )}
            <span className="text-secondary text-slate-500 ml-auto">{visible.length} de {withClub.length} club{withClub.length !== 1 ? 'es' : ''}</span>
          </div>

          {selectMode && selectedNegIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span className="text-secondary font-semibold text-slate-700">{selectedNegIds.size} seleccionado{selectedNegIds.size !== 1 ? 's' : ''}</span>
              {onUpdateNegotiation && (
                <Select
                  value=""
                  disabled={bulkBusy}
                  onChange={e => { const v = e.target.value as ClubNegotiation['status'] | ''; if (v) bulkChangeStatus(v) }}
                  aria-label="Cambiar estado de los seleccionados"
                  className="w-auto py-1 text-secondary"
                >
                  <option value="">Cambiar estado a…</option>
                  {NEG_STATUSES.filter(s => s !== 'descartado').map(s => <option key={s} value={s}>{NEG_STATUS_LABELS[s]}</option>)}
                </Select>
              )}
              {onUpdateNegotiation && (
                <Button size="sm" onClick={() => bulkChangeStatus('descartado')} disabled={bulkBusy} className="border-red-200 text-red-600 hover:bg-red-50">
                  Descartar
                </Button>
              )}
              {onDeleteNegotiation && (
                <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy}>
                  {L.eliminar}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedNegIds(new Set())} className="ml-auto">Limpiar</Button>
              {bulkBusy && <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
            </div>
          )}

          {/* Lista */}
          {visible.length === 0 ? (
            <p className="text-center text-slate-500 text-secondary py-6">Ningún club coincide con los filtros</p>
          ) : (
            <div className={viewMode === 'grid' ? 'space-y-3' : 'border border-slate-200 rounded-xl overflow-hidden bg-white'}>
              {groups.map(g => (
                <div key={g.key}>
                  {groupBy !== 'none' && (
                    <div className={`px-3 py-1.5 text-meta font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 ${viewMode === 'grid' ? '' : 'bg-slate-50 border-y border-slate-100'}`}>
                      {g.label} <span className="font-mono opacity-60">{g.items.length}</span>
                    </div>
                  )}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.items.map(x => (
                        <div key={x.neg.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                          {renderRow(x)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {g.items.map(renderRow)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Modo push: el detalle ocupa el panel entero, con "volver a la lista" ──
  if (detailMode === 'push' && detailNode) {
    return (
      <div className="space-y-2">
        <Button variant="link" size="sm" icon={<ArrowLeft />} onClick={() => setPanelNegId(null)}>
          Volver a la lista ({withClub.length})
        </Button>
        {detailNode}

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
              if (panelNegId === negToDelete.id) setPanelNegId(null)
              setNegToDelete(null)
              showToast('Negociación eliminada', 'info')
            } catch {
              showToast('No se pudo eliminar la negociación', 'error')
            }
          }}
          onCancel={() => setNegToDelete(null)}
        />
      </div>
    )
  }

  return (
    <div className={detailMode === 'side' ? 'sm:h-full sm:min-h-0 flex flex-col sm:flex-row gap-4 items-stretch' : undefined}>
      {/* Doble vista: cada columna scrollea por separado; el detalle siempre queda visible */}
      <div className={detailMode === 'side' ? 'flex-1 min-w-0 order-2 sm:order-1 sm:min-h-0 sm:overflow-y-auto sm:pr-1' : undefined}>
        {listContent}
      </div>

      {detailMode === 'side' && (
        <div className="w-full sm:w-80 flex-shrink-0 order-1 sm:order-2 sm:min-h-0 sm:overflow-y-auto">
          {detailNode ?? (
            <div className="hidden sm:block border-2 border-dashed border-slate-200 rounded-xl py-16 px-6 text-center">
              <p className="text-secondary text-slate-500">Haz clic en un club para ver y editar la negociación: estado, encargado, información y notas de seguimiento.</p>
            </div>
          )}
        </div>
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
