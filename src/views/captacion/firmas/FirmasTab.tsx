import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, X, Plus, ChevronDown, ChevronRight, Pencil, Users, PenLine, MapPin, MessageSquare, LayoutGrid } from 'lucide-react'
import type { Player, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, BoulemaPeticion, FirmasEntry, FirmasStatus, FirmasComment } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { ConfirmModal } from '../../../components/ConfirmModal'
import { EmptyState } from '../../../components/EmptyState'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { useDebounce } from '../../../hooks/useDebounce'
import { ZONAS_PIPELINE as FIRMAS_ZONE_ORDER } from '../../../lib/zonas'
import { teamsAlike, equipoMatchKind } from '../../../lib/equipos'
import { norm as normSearch } from '../../../lib/texto'
import { hoyISO, parseDia, sumarDias } from '../../../lib/fechas'
import { type ShowToast, type PatchFirmasEntry, SELECT_CLS, normConclusion, fmtDate, todayISO, scoutColor } from '../helpers'
import { FirmasManagers, FirmasHoverCard } from './comun'
import { AVISO_TITULO, FIRMAS_STATUSES, FIRMAS_CONFIG, FIRMAS_ACTION_KIND_META, necesitaTelefono, firmasAging } from './helpers'
import { FirmasDetailPanel } from './FirmasDetailPanel'
import { FirmasAddModal } from './FirmasAddModal'

export function FirmasTab({
  entries, profiles, currentProfile, scoutingPlayers, scoutingReports, scoutingMatches,
  matchPlayers, boulemaPeticiones, players, onCreatePlayer, onSyncActionTasks,
  onCreate, onPatch, onDelete, onOpenScoutingPlayer, showToast, headerHeight,
  openEntryId, onOpenEntryConsumed,
}: {
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  onSyncActionTasks?: () => Promise<number>
  onCreate: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  onPatch: PatchFirmasEntry
  onDelete: (id: string) => Promise<void>
  onOpenScoutingPlayer: (id: string) => void
  showToast: ShowToast
  headerHeight: number
  openEntryId?: string | null
  onOpenEntryConsumed?: () => void
}) {
  // ── vista y filtros ──
  const [view, setView] = useState<'estatus' | 'zona' | 'encargado'>(
    () => (sessionStorage.getItem('capt_firmas_view') as 'estatus' | 'zona' | 'encargado') ?? 'estatus'
  )
  useEffect(() => { sessionStorage.setItem('capt_firmas_view', view) }, [view])

  const [search, setSearch] = useState('')
  const debSearch = useDebounce(search, 250)
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<FirmasStatus | 'all'>('all')
  const [managerFilter, setManagerFilter] = useState<string>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  // Vista por zonas: zona seleccionada (persistida)
  const [selZone, setSelZone] = useState<string>(() => sessionStorage.getItem('capt_firmas_zone') ?? '')
  useEffect(() => { if (selZone) sessionStorage.setItem('capt_firmas_zone', selZone) }, [selZone])

  // Renombrar una zona entera (actualiza todas sus entradas)
  const [renamingZone, setRenamingZone] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameZone = async (from: string) => {
    const v = renameValue.trim()
    setRenamingZone(false)
    if (!v || v === from) return
    const list = entries.filter(e => e.zone === from)
    try {
      for (const e of list) await onPatch(e.id, { zone: v })
      setSelZone(v)
      showToast(`Zona «${from}» renombrada a «${v}» (${list.length} jugadores)`)
    } catch (err) {
      console.error(err)
      showToast('No se pudo renombrar la zona completa', 'error')
    }
  }

  // ── panel y modales ──
  const [panelId, setPanelId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<FirmasEntry | null>(null)
  const [showAlerts, setShowAlerts] = useState(false)
  const [showAgenda, setShowAgenda] = useState(false)
  const [showResumen, setShowResumen] = useState(false)
  const [syncingTasks, setSyncingTasks] = useState(false)
  const [dragOverCol, setDragOverCol] = useState<FirmasStatus | null>(null)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const touchStart = React.useRef<{ x: number; y: number } | null>(null)

  // ── versión móvil: estatus/encargado seleccionados en las píldoras ──
  const [mobStatus, setMobStatus] = useState<FirmasStatus | 'all'>('all')
  const [mobManager, setMobManager] = useState<string>('')

  // ── hover card (solo escritorio) ──
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

  const panelEntry = entries.find(e => e.id === panelId) ?? null
  useEscapeKey(() => setPanelId(null), !!panelEntry && !confirmDelete)

  // Navegación externa (p. ej. desde el aviso del Dashboard)
  useEffect(() => {
    if (openEntryId) {
      setPanelId(openEntryId)
      onOpenEntryConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEntryId])

  const spById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    scoutingPlayers.forEach(p => { m[p.id] = p })
    return m
  }, [scoutingPlayers])

  const reportsByPlayer = useMemo(() => {
    const m: Record<string, ScoutingReport[]> = {}
    scoutingReports.forEach(r => { (m[r.playerId] ??= []).push(r) })
    Object.values(m).forEach(list => list.sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt)))
    return m
  }, [scoutingReports])

  // Zonas presentes, en orden canónico + extras alfabéticas
  const zones = useMemo(() => {
    const present = [...new Set(entries.map(e => e.zone))]
    const canonical = FIRMAS_ZONE_ORDER.filter(z => present.includes(z))
    const extra = present.filter(z => !FIRMAS_ZONE_ORDER.includes(z)).sort((a, b) => a.localeCompare(b))
    return [...canonical, ...extra]
  }, [entries])

  // Encargados presentes (para el filtro y la vista por encargado)
  const managerOptions = useMemo(() => {
    const ids = new Set(entries.flatMap(e => e.managers))
    return profiles.filter(p => ids.has(p.id))
  }, [entries, profiles])

  const matchesFilters = useCallback((e: FirmasEntry, ignoreZone = false) => {
    if (!ignoreZone && zoneFilter !== 'all' && e.zone !== zoneFilter) return false
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (managerFilter !== 'all' && !e.managers.includes(managerFilter)) return false
    if (overdueOnly && !firmasAging(e)?.overdue) return false
    const n = normSearch(debSearch)
    if (n) {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const hay = normSearch([e.playerName, sp?.fullName ?? '', sp?.team ?? ''].join(' '))
      if (!hay.includes(n)) return false
    }
    return true
  }, [zoneFilter, statusFilter, managerFilter, overdueOnly, debSearch, spById])

  const filtered = useMemo(() => entries.filter(e => matchesFilters(e)), [entries, matchesFilters])
  // Igual pero sin filtro de zona — alimenta el selector de zonas
  const filteredNoZone = useMemo(() => entries.filter(e => matchesFilters(e, true)), [entries, matchesFilters])

  const overdueCount = useMemo(() => entries.filter(e => firmasAging(e)?.overdue).length, [entries])

  // ── avisos cruzados con el resto de la app ──
  const alerts = useMemo(() => {
    const out: { icon: string; text: string; entryId: string; tone: 'blue' | 'green' | 'amber' | 'red'; kind: string }[] = []
    const today = todayISO()
    // sumarDias trabaja en día local; toISOString() daba el día UTC (entre 00:00 y 02:00 «hoy» aún es ayer)
    const plus30 = sumarDias(hoyISO(), 30)
    const minus14 = sumarDias(hoyISO(), -14)
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString()
    const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const in30 = Date.now() + 30 * 86400000
    const in180 = Date.now() + 180 * 86400000

    const active = entries.filter(e => e.status !== 'firmado')

    // caliente sin próxima acción programada — el olvido más caro
    active.filter(e => e.status === 'caliente' && !e.nextActionDate).forEach(e => {
      out.push({ icon: '🔥', tone: 'red', entryId: e.id, kind: 'sin-accion', text: `${e.playerName} está caliente sin próxima acción programada — ponle fecha` })
    })

    // alta sin encargado
    active.filter(e => e.managers.length === 0).forEach(e => {
      out.push({ icon: '👤', tone: 'red', entryId: e.id, kind: 'sin-encargado', text: `${e.playerName} no tiene encargado asignado` })
    })

    // incoherencia con el assessment de scouting.
    // Nota: que en scouting esté en «Llamar» y aquí frío/templado es NORMAL —
    // el proceso natural es: scouting decide «Llamar» → pasa a Firmar, y aquí
    // vive su propio estatus. Solo avisamos del caso contradictorio (Descartado).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (sp?.assessment === 'Descartado') {
        out.push({ icon: '🚫', tone: 'red', entryId: e.id, kind: 'descartado', text: `${e.playerName}: en scouting está Descartado — ¿sacarlo del pipeline?` })
      }
    })

    // frío que se calienta solo: 2+ informes «Llamar» en 90 días
    active.filter(e => e.status === 'frio' && e.scoutingPlayerId).forEach(e => {
      const n = (reportsByPlayer[e.scoutingPlayerId!] ?? [])
        .filter(r => (r.fecha ?? r.createdAt) >= since90 && normConclusion(r.conclusion) === 'Llamar').length
      if (n >= 2) out.push({ icon: '📈', tone: 'amber', entryId: e.id, kind: 'recalentar', text: `${e.playerName} acumula ${n} informes «Llamar» recientes — candidato a recalentar` })
    })

    // le vieron en un partido (añadido al campograma, últimos 14 días)
    const recentMatches = new Map(scoutingMatches.filter(m => m.date <= today && m.date >= minus14).map(m => [m.id, m]))
    const seenByPlayer: Record<string, ScoutingMatch> = {}
    matchPlayers.forEach(mp => {
      const m = recentMatches.get(mp.matchId)
      if (m && (!seenByPlayer[mp.playerId] || m.date > seenByPlayer[mp.playerId].date)) seenByPlayer[mp.playerId] = m
    })
    active.forEach(e => {
      const m = e.scoutingPlayerId ? seenByPlayer[e.scoutingPlayerId] : undefined
      if (m) out.push({ icon: '👀', tone: 'green', entryId: e.id, kind: 'visto', text: `A ${e.playerName} le vieron el ${fmtDate(m.date)} en ${m.homeTeam} vs ${m.awayTeam} — buen momento para llamar` })
    })

    // partidos de Captación registrados (≤30 días vista) donde juega su equipo
    const upcoming = scoutingMatches.filter(m => m.date >= today && m.date <= plus30).sort((a, b) => a.date.localeCompare(b.date))
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.team) return
      const m = upcoming.find(m => teamsAlike(sp.team, m.homeTeam) || teamsAlike(sp.team, m.awayTeam))
      if (m) out.push({
        icon: '🏟️', tone: 'blue', entryId: e.id, kind: 'juega',
        text: `${e.playerName}: su equipo juega ${m.homeTeam} vs ${m.awayTeam} el ${fmtDate(m.date)}${m.assignedTo ? ` (lo ve ${m.assignedTo})` : ''}`,
      })
    })

    // informes nuevos (≤14 días) sobre jugadores del pipeline
    active.forEach(e => {
      if (!e.scoutingPlayerId) return
      const recent = (reportsByPlayer[e.scoutingPlayerId] ?? []).filter(r => (r.fecha ?? r.createdAt) >= since14)
      if (recent.length > 0) {
        const r = recent[0]
        out.push({
          icon: '📄', tone: 'green', entryId: e.id, kind: 'informe',
          text: `Informe nuevo de ${e.playerName}${r.persona ? ` (${r.persona})` : ''}${r.conclusion ? ` — conclusión: ${normConclusion(r.conclusion)}` : ''}`,
        })
      }
    })

    // también está en Boulema: petición de informe sobre el mismo jugador
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const names = new Set([normSearch(e.playerName), ...(sp ? [normSearch(sp.fullName)] : [])])
      const pet = boulemaPeticiones.find(p => names.has(normSearch(p.playerName)))
      if (pet) out.push({ icon: '📥', tone: 'blue', entryId: e.id, kind: 'boulema', text: `Hay una petición en Boulema sobre ${e.playerName} (pedida por ${pet.requestedBy})` })
    })

    // cambio de club en su ficha de scouting
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      // mismo club pero otra categoría (Juv B → Juv A) también avisa, pero
      // con otro texto: no hace falta revisar la zona
      const cambio = sp?.team && e.knownTeam ? equipoMatchKind(e.knownTeam, sp.team) : 'equipo'
      if (sp?.team && e.knownTeam && cambio !== 'equipo') {
        out.push({ icon: '🔁', tone: 'amber', entryId: e.id, kind: 'cambio-club', text: cambio === 'club'
          ? `${e.playerName} cambió de equipo dentro del club: ${e.knownTeam} → ${sp.team} (confírmalo en su panel)`
          : `${e.playerName} cambió de club: ${e.knownTeam} → ${sp.team} — revisa la zona (confírmalo en su panel)` })
      }
    })

    // cumpleaños próximos (≤30 días) — 16 y 18 destacados.
    // Se omiten las fechas placeholder AAAA-02-28 (solo se conocía el año).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.birthdate || sp.birthdate.endsWith('-02-28')) return
      const [by, bm, bd] = sp.birthdate.split('-').map(Number)
      const now = new Date()
      let next = new Date(now.getFullYear(), bm - 1, bd)
      if (next.getTime() < now.getTime() - 86400000) next = new Date(now.getFullYear() + 1, bm - 1, bd)
      if (next.getTime() > in30) return
      const turns = next.getFullYear() - by
      const key = turns === 16 || turns === 18
      out.push({
        icon: '🎂', tone: key ? 'amber' : 'blue', entryId: e.id, kind: 'cumple',
        text: `${e.playerName} cumple ${turns} el ${fmtDate(next.toISOString())}${key ? ' — edad clave para firmar' : ''}`,
      })
    })

    // contrato de club que expira pronto (≤6 meses)
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.clubContract) return
      let d: Date | null = null
      const ddmmyyyy = sp.clubContract.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (ddmmyyyy) d = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1])
      else if (/^\d{4}-\d{2}-\d{2}/.test(sp.clubContract)) d = new Date(sp.clubContract)
      if (!d || isNaN(d.getTime())) return
      if (d.getTime() > Date.now() && d.getTime() <= in180) {
        out.push({ icon: '📃', tone: 'amber', entryId: e.id, kind: 'contrato', text: `El contrato de club de ${e.playerName} acaba el ${fmtDate(d.toISOString())}` })
      }
    })

    // duplicados: mismo jugador de scouting en más de una entrada
    const byLink: Record<string, FirmasEntry[]> = {}
    entries.forEach(e => { if (e.scoutingPlayerId) (byLink[e.scoutingPlayerId] ??= []).push(e) })
    Object.values(byLink).filter(l => l.length > 1).forEach(l => {
      out.push({ icon: '👥', tone: 'red', entryId: l[0].id, kind: 'duplicado', text: `${l[0].playerName} está ${l.length} veces en el pipeline (${l.map(x => x.zone).join(' y ')})` })
    })

    // firmado que aún no está en Mantenimiento
    entries.filter(e => e.status === 'firmado').forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const nm = normSearch(sp?.fullName ?? e.playerName)
      if (!players.some(p => normSearch(p.name) === nm)) {
        out.push({ icon: '🎉', tone: 'green', entryId: e.id, kind: 'firmado', text: `${e.playerName} está firmado y aún no está en Mantenimiento — créalo desde su panel` })
      }
    })

    const rank = { red: 0, amber: 1, blue: 2, green: 3 }
    return out.sort((a, b) => rank[a.tone] - rank[b.tone] || a.text.localeCompare(b.text))
  }, [entries, spById, scoutingMatches, matchPlayers, reportsByPlayer, boulemaPeticiones, players])

  // Avisos silenciados: cada uno decide qué tipos no quiere ver. Se guarda en
  // este navegador, así que no molesta a nadie más.
  const [avisosMudos, setAvisosMudos] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('firmas_avisos_mudos') ?? '[]') as string[]) }
    catch { return new Set() }
  })
  const silenciar = (kind: string) => setAvisosMudos(prev => {
    const next = new Set(prev)
    if (next.has(kind)) next.delete(kind); else next.add(kind)
    localStorage.setItem('firmas_avisos_mudos', JSON.stringify([...next]))
    return next
  })

  // Agrupados por tipo: 20 líneas iguales no son 20 avisos, son uno con 20 casos
  const gruposAviso = useMemo(() => {
    const m = new Map<string, { kind: string; icon: string; tone: string; titulo: string; items: typeof alerts }>()
    for (const a of alerts) {
      if (avisosMudos.has(a.kind)) continue
      let g = m.get(a.kind)
      if (!g) { g = { kind: a.kind, icon: a.icon, tone: a.tone, titulo: AVISO_TITULO[a.kind] ?? a.kind, items: [] }; m.set(a.kind, g) }
      g.items.push(a)
    }
    const rank: Record<string, number> = { red: 0, amber: 1, blue: 2, green: 3 }
    return [...m.values()].sort((a, b) => rank[a.tone] - rank[b.tone] || b.items.length - a.items.length)
  }, [alerts, avisosMudos])

  const urgentes = useMemo(() => gruposAviso.filter(g => g.tone === 'red').reduce((n, g) => n + g.items.length, 0), [gruposAviso])
  const totalAvisos = useMemo(() => gruposAviso.reduce((n, g) => n + g.items.length, 0), [gruposAviso])
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null)

  // ── agenda: todas las próximas acciones pendientes, por fecha ──
  const agenda = useMemo(() =>
    entries
      .filter(e => e.status !== 'firmado' && e.nextActionDate)
      .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? '')),
  [entries])

  // Estable (useCallback): el panel lo usa como dependencia del autoguardado de notas
  const patch: PatchFirmasEntry = useCallback(async (id, changes) => {
    try {
      await onPatch(id, changes)
    } catch (err) {
      console.error(err)
      showToast('No se pudo guardar el cambio', 'error')
    }
  }, [onPatch, showToast])

  const changeStatus = async (e: FirmasEntry, s: FirmasStatus) => {
    const now = new Date().toISOString()
    // el cambio queda registrado en el historial automáticamente
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `${FIRMAS_CONFIG[e.status].label} → ${FIRMAS_CONFIG[s].label}`,
      date: now,
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind: 'estatus',
    }
    // El toast de éxito va DESPUÉS del await: antes se mostraba aunque el guardado fallara
    try {
      // forma funcional: parte de la tarjeta MÁS RECIENTE, no de la del render
      await onPatch(e.id, cur => ({
        ...cur,
        status: s,
        statusUpdatedAt: now,
        signedAt: s === 'firmado' ? (cur.signedAt ?? now) : cur.signedAt,
        comments: [...cur.comments, log],
      }))
      showToast(s === 'firmado' ? `🎉 ${e.playerName} firmado` : `${e.playerName} → ${FIRMAS_CONFIG[s].label}`)
    } catch (err) {
      console.error(err)
      showToast('No se pudo guardar el cambio', 'error')
    }
  }

  const clearFilters = () => { setSearch(''); setZoneFilter('all'); setStatusFilter('all'); setManagerFilter('all'); setOverdueOnly(false) }

  const startHover = (e: FirmasEntry, ev: React.MouseEvent) => {
    if (!canHover) return
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover({ id: e.id, x: rect.right + 8, y: rect.top }), 350)
  }
  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHover(null)
  }

  // ── tarjeta ──
  const card = (e: FirmasEntry, showStatusDot = false) => {
    const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
    const aging = firmasAging(e)
    const actionOverdue = !!e.nextActionDate && e.nextActionDate < todayISO() && e.status !== 'firmado'
    const actionToday = e.nextActionDate === todayISO()
    return (
      <button
        key={e.id}
        onClick={() => { endHover(); setPanelId(e.id) }}
        onMouseEnter={ev => startHover(e, ev)}
        onMouseLeave={endHover}
        draggable={canHover}
        onDragStart={ev => { endHover(); ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move' }}
        className="w-full text-left bg-white border border-slate-200 rounded-lg px-2.5 py-2 hover:border-slate-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-xs font-semibold text-slate-800 leading-snug flex items-center gap-1.5 min-w-0">
            {showStatusDot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[e.status].dot}`} title={FIRMAS_CONFIG[e.status].label} />}
            <span className="truncate">{e.playerName}</span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {aging?.overdue && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title={`Desatendido: ${aging.days} días sin tocar (límite ${aging.limit})`} />
            )}
            {aging && !aging.overdue && aging.warn && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title={`${aging.days} días sin tocar (límite ${aging.limit})`} />
            )}
            <FirmasManagers managerIds={e.managers} profiles={profiles} />
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="truncate min-w-0">
            {sp
              ? [sp.team, sp.birthdate ? sp.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || e.zone
              : e.zone}
          </span>
          {necesitaTelefono(e) && !(e.nextActionDate && e.nextActionKind === 'telefono') && (
            <span className="flex-shrink-0" title="Pendiente de conseguir teléfono">📵</span>
          )}
          {e.nextActionDate && e.status !== 'firmado' && (
            <span
              className={`flex-shrink-0 font-medium ${actionOverdue ? 'text-red-500' : actionToday ? 'text-blue-600' : 'text-slate-400'}`}
              title={`${e.nextAction ?? 'Próxima acción'} · ${fmtDate(e.nextActionDate)}`}
            >
              {FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'} {actionOverdue ? 'vencida' : actionToday ? 'hoy' : parseDia(e.nextActionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {e.comments.filter(c => c.kind !== 'estatus').length > 0 && (
            <span className="inline-flex items-center gap-0.5 flex-shrink-0">
              <MessageSquare className="w-3 h-3" />
              {e.comments.filter(c => c.kind !== 'estatus').length}
            </span>
          )}
        </div>
      </button>
    )
  }

  // ── fila compacta para la lista móvil ──
  const mobileRow = (e: FirmasEntry, showStatusDot = true) => {
    const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
    const aging = firmasAging(e)
    const actionOverdue = !!e.nextActionDate && e.nextActionDate < todayISO() && e.status !== 'firmado'
    const actionToday = e.nextActionDate === todayISO()
    // deslizada: fila de estatus rápidos
    if (swipedId === e.id) {
      return (
        <div key={e.id} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50">
          <span className="text-xs font-semibold text-slate-700 truncate flex-1 min-w-0">{e.playerName}</span>
          {FIRMAS_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { if (s !== e.status) changeStatus(e, s); setSwipedId(null) }}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                s === e.status ? `${FIRMAS_CONFIG[s].bg} ${FIRMAS_CONFIG[s].border} ring-1 ring-current ${FIRMAS_CONFIG[s].text}` : 'bg-white border-slate-200'
              }`}
              title={FIRMAS_CONFIG[s].label}
              aria-label={FIRMAS_CONFIG[s].label}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
            </button>
          ))}
          <button onClick={() => setSwipedId(null)} aria-label="Cerrar" className="p-1 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
      )
    }
    return (
      <button
        key={e.id}
        onClick={() => setPanelId(e.id)}
        onTouchStart={ev => { touchStart.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY } }}
        onTouchEnd={ev => {
          const s0 = touchStart.current
          touchStart.current = null
          if (!s0) return
          const dx = ev.changedTouches[0].clientX - s0.x
          const dy = ev.changedTouches[0].clientY - s0.y
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
            ev.preventDefault()
            setSwipedId(dx < 0 ? e.id : null)
          }
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 transition-colors"
      >
        {showStatusDot && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[e.status].dot}`} title={FIRMAS_CONFIG[e.status].label} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800 truncate leading-tight">{e.playerName}</span>
          <span className="block text-[11px] text-slate-400 truncate">
            {sp
              ? [sp.team, sp.birthdate ? sp.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || e.zone
              : e.zone}
            {necesitaTelefono(e) && !(e.nextActionDate && e.nextActionKind === 'telefono') && (
              <span className="ml-1.5" title="Pendiente de conseguir teléfono">📵</span>
            )}
            {e.nextActionDate && e.status !== 'firmado' && (
              <span className={`ml-1.5 font-medium ${actionOverdue ? 'text-red-500' : actionToday ? 'text-blue-600' : 'text-slate-400'}`}>
                {FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'} {actionOverdue ? 'vencida' : actionToday ? 'hoy' : parseDia(e.nextActionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </span>
        </span>
        {aging?.overdue && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title={`${aging.days} días sin tocar`} />}
        {!aging?.overdue && aging?.warn && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
        <FirmasManagers managerIds={e.managers} profiles={profiles} max={2} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
      </button>
    )
  }

  const mobileList = (list: FirmasEntry[], showStatusDot = true) => (
    list.length === 0 ? (
      <div className="bg-white border border-slate-200 rounded-lg py-8 text-center text-xs text-slate-400">Sin jugadores</div>
    ) : (
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
        {list.map(e => mobileRow(e, showStatusDot))}
      </div>
    )
  )

  // Tablero de columnas por estatus (compartido por vistas estatus y zona)
  const statusBoard = (list: FirmasEntry[]) => {
    const groups: Record<FirmasStatus, FirmasEntry[]> = { llamar: [], caliente: [], templado: [], frio: [], decidir: [], firmado: [] }
    list.forEach(e => groups[e.status].push(e))
    FIRMAS_STATUSES.forEach(s => groups[s].sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)))
    return (
      <div className="hidden sm:flex gap-3 overflow-x-auto pb-2 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {FIRMAS_STATUSES.map(s => (
          <div
            key={s}
            onDragOver={ev => { ev.preventDefault(); if (dragOverCol !== s) setDragOverCol(s) }}
            onDragLeave={() => setDragOverCol(cur => cur === s ? null : cur)}
            onDrop={ev => {
              ev.preventDefault()
              setDragOverCol(null)
              const id = ev.dataTransfer.getData('text/plain')
              const en = entries.find(x => x.id === id)
              if (en && en.status !== s) changeStatus(en, s)
            }}
            className={`flex-shrink-0 w-[240px] xl:w-auto bg-slate-50 border border-t-2 ${FIRMAS_CONFIG[s].col} rounded-lg transition-colors ${
              dragOverCol === s ? 'border-primary ring-2 ring-primary/30 bg-blue-50/50' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{FIRMAS_CONFIG[s].label}</span>
              <span className="text-[11px] text-slate-400 font-medium">{groups[s].length}</span>
              {groups[s].filter(necesitaTelefono).length > 0 && (
                <span className="ml-auto text-[11px] text-violet-600 font-medium" title="Pendientes de conseguir teléfono">
                  📵 {groups[s].filter(necesitaTelefono).length}
                </span>
              )}
            </div>
            <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
              {groups[s].length === 0 ? (
                <div className="text-[11px] text-slate-400 text-center py-4">—</div>
              ) : groups[s].map(e => card(e))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const hoverEntry = hover ? entries.find(e => e.id === hover.id) : null

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Pipeline/Firmar</h2>
          <p className="text-xs text-slate-400">Captación activa: jugadores en proceso de conseguir la firma, por zona y estatus</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => setShowResumen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
            title="Resumen semanal del pipeline, listo para copiar"
          >
            📋 <span className="hidden sm:inline">Resumen</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir jugador
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<PenLine className="w-10 h-10" />}
          title="Aún no hay jugadores en el pipeline de firmas"
          subtitle="Si acabas de activar esta función, recuerda ejecutar la migración SQL en Supabase y el snippet de importación del Trello"
        />
      ) : (
        <>
          {/* Avisos cruzados. Agrupados por tipo y con lo urgente delante:
              una tira de 40 líneas sueltas no la lee nadie. */}
          {totalAvisos > 0 && (
            <div className={`border rounded-lg overflow-hidden ${urgentes > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <button
                onClick={() => setShowAlerts(v => !v)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${urgentes > 0 ? 'hover:bg-red-100/50' : 'hover:bg-slate-100/60'}`}
              >
                {urgentes > 0 ? (
                  <>
                    <span className="text-sm">⚠️</span>
                    <span className="text-xs font-bold text-red-700">{urgentes} que requieren acción</span>
                    {totalAvisos > urgentes && (
                      <span className="text-[11px] text-slate-500">· {totalAvisos - urgentes} informativos</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-sm">🔔</span>
                    <span className="text-xs font-semibold text-slate-600">{totalAvisos} avisos informativos</span>
                  </>
                )}
                <span className="hidden sm:inline text-[11px] text-slate-500 truncate ml-1">
                  {gruposAviso.slice(0, 3).map(g => `${g.titulo} (${g.items.length})`).join(' · ')}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 ml-auto flex-shrink-0 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
              </button>

              {showAlerts && (
                <div className="border-t border-slate-200 divide-y divide-slate-100 bg-white max-h-[26rem] overflow-y-auto">
                  {gruposAviso.map(g => {
                    const abierto = grupoAbierto === g.kind
                    return (
                      <div key={g.kind}>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <button
                            onClick={() => setGrupoAbierto(abierto ? null : g.kind)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            <span className="flex-shrink-0">{g.icon}</span>
                            <span className={`text-xs font-semibold truncate ${g.tone === 'red' ? 'text-red-700' : 'text-slate-700'}`}>{g.titulo}</span>
                            <span className={`text-[10px] font-bold rounded-full px-1.5 py-px flex-shrink-0 ${
                              g.tone === 'red' ? 'bg-red-100 text-red-700' :
                              g.tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                            }`}>{g.items.length}</span>
                            <ChevronDown className={`w-3 h-3 text-slate-300 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                          </button>
                          <button
                            onClick={() => silenciar(g.kind)}
                            title="No volver a enseñarme este tipo de aviso (solo en este navegador)"
                            className="text-[10px] text-slate-300 hover:text-slate-600 flex-shrink-0"
                          >silenciar</button>
                        </div>
                        {abierto && (
                          <div className="bg-slate-50/70 divide-y divide-slate-100">
                            {g.items.map((a, i) => (
                              <button
                                key={i}
                                onClick={() => setPanelId(a.entryId)}
                                className="w-full text-left text-[11.5px] text-slate-700 px-3 py-1.5 pl-9 hover:bg-white transition-colors"
                              >
                                {a.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {avisosMudos.size > 0 && (
                    <button
                      onClick={() => { setAvisosMudos(new Set()); localStorage.removeItem('firmas_avisos_mudos') }}
                      className="w-full text-[11px] text-slate-400 hover:text-slate-600 px-3 py-2 text-left"
                    >
                      Tienes {avisosMudos.size} tipo{avisosMudos.size !== 1 ? 's' : ''} de aviso silenciado{avisosMudos.size !== 1 ? 's' : ''} — volver a enseñarlos
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Agenda: todas las próximas acciones programadas, por fecha */}
          {agenda.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAgenda(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-100/50 transition-colors"
              >
                <span className="text-sm">📌</span>
                <span className="text-xs font-semibold text-blue-800">Agenda · {agenda.length} próxima{agenda.length !== 1 ? 's' : ''} acci{agenda.length !== 1 ? 'ones' : 'ón'}</span>
                {agenda.some(e => (e.nextActionDate ?? '') < todayISO()) && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {agenda.filter(e => (e.nextActionDate ?? '') < todayISO()).length} vencida{agenda.filter(e => (e.nextActionDate ?? '') < todayISO()).length !== 1 ? 's' : ''}
                  </span>
                )}
                {onSyncActionTasks && agenda.some(e => !e.nextActionTaskId) && (
                  <span
                    onClick={async (ev) => {
                      ev.stopPropagation()
                      if (syncingTasks) return
                      setSyncingTasks(true)
                      try {
                        const n = await onSyncActionTasks()
                        showToast(n > 0 ? `${n} tarea${n !== 1 ? 's' : ''} creada${n !== 1 ? 's' : ''} en el tablero` : 'Todas las acciones ya tienen tarea', n > 0 ? 'success' : 'info')
                      } catch {
                        showToast('No se pudieron crear las tareas', 'error')
                      } finally {
                        setSyncingTasks(false)
                      }
                    }}
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
                    title="Crea una tarea en el tablero por cada acción que aún no la tenga (asignada a su encargado, con la fecha como límite)"
                  >
                    {syncingTasks ? 'Creando…' : `⇪ Crear tareas (${agenda.filter(e => !e.nextActionTaskId).length})`}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-blue-600 ml-auto flex-shrink-0 transition-transform ${showAgenda ? 'rotate-180' : ''}`} />
              </button>
              {showAgenda && (
                <div className="border-t border-blue-200 divide-y divide-blue-100 max-h-64 overflow-y-auto">
                  {agenda.map(e => {
                    const overdue = (e.nextActionDate ?? '') < todayISO()
                    const isToday = e.nextActionDate === todayISO()
                    const assignee = e.nextActionAssignee ? profiles.find(p => p.id === e.nextActionAssignee) : undefined
                    return (
                      <button
                        key={e.id}
                        onClick={() => setPanelId(e.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-100/40 transition-colors"
                      >
                        <span className={`flex-shrink-0 font-semibold tabular-nums ${overdue ? 'text-red-600' : isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                          {overdue ? '⚠ ' : ''}{isToday ? 'hoy' : parseDia(e.nextActionDate!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="flex-shrink-0">{FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'}</span>
                        <span className="font-semibold truncate">{e.playerName}</span>
                        <span className="text-slate-500 truncate">{e.nextAction ?? ''}</span>
                        {assignee && (
                          <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono font-bold text-[10px]">
                            {assignee.avatar || assignee.name.split(' ')[0]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filtros + toggle de vista */}
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[150px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar jugador, club..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {view === 'estatus' && (
              <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todas las zonas</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
            {view !== 'estatus' && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as FirmasStatus | 'all')} className={SELECT_CLS}>
                <option value="all">Todos los estatus</option>
                {FIRMAS_STATUSES.map(s => <option key={s} value={s}>{FIRMAS_CONFIG[s].label}</option>)}
              </select>
            )}
            {view !== 'encargado' && (
              <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Todos los encargados</option>
                {managerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button
              onClick={() => setOverdueOnly(v => !v)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                overdueOnly ? 'bg-red-50 border-red-200 text-red-600 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              title="Desatendidos: caliente sin tocar +10 días, templado +50, frío +90"
            >
              ⚠ <span className="hidden sm:inline">Desatendidos</span> {overdueCount}
            </button>
            {(search || zoneFilter !== 'all' || statusFilter !== 'all' || managerFilter !== 'all' || overdueOnly) && (
              <button
                onClick={clearFilters}
                className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors"
              >
                Limpiar
              </button>
            )}
            <div className="ml-auto flex items-center rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView('estatus')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'estatus' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Estatus</span>
              </button>
              <button
                onClick={() => setView('zona')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'zona' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Zona</span>
              </button>
              <button
                onClick={() => setView('encargado')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'encargado' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Encargado</span>
              </button>
            </div>
          </div>

          {/* ── Vista por ESTATUS: móvil = píldoras + lista · escritorio = tablero ── */}
          {view === 'estatus' && (
            <>
              <div className="sm:hidden space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
                  <button
                    onClick={() => setMobStatus('all')}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      mobStatus === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    Todos {filtered.length}
                  </button>
                  {FIRMAS_STATUSES.map(s => {
                    const n = filtered.filter(e => e.status === s).length
                    return (
                      <button
                        key={s}
                        onClick={() => setMobStatus(s)}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          mobStatus === s ? `${FIRMAS_CONFIG[s].bg} ${FIRMAS_CONFIG[s].text} ${FIRMAS_CONFIG[s].border} ring-1 ring-current` : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                        {FIRMAS_CONFIG[s].label} {n}
                      </button>
                    )
                  })}
                </div>
                {mobileList(
                  (mobStatus === 'all' ? [...filtered] : filtered.filter(e => e.status === mobStatus))
                    .sort((a, b) =>
                      FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) ||
                      a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)
                    ),
                  mobStatus === 'all'
                )}
              </div>
              {statusBoard(filtered)}
            </>
          )}

          {/* ── Vista por ZONA: selector de zona + tablero de esa zona ── */}
          {view === 'zona' && (() => {
            const zonesAll = zones
            const activeZone = zonesAll.includes(selZone) ? selZone : (zonesAll[0] ?? '')
            const zoneEntries = filteredNoZone.filter(e => e.zone === activeZone)
            return (
              <div className="space-y-3">
                {/* Selector de zonas con resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {zonesAll.map(z => {
                    const zEntries = filteredNoZone.filter(e => e.zone === z)
                    const active = z === activeZone
                    return (
                      <button
                        key={z}
                        onClick={() => setSelZone(z)}
                        className={`text-left rounded-lg border px-3 py-2 transition-all ${
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold truncate ${active ? 'text-primary' : 'text-slate-700'}`}>{z}</span>
                          <span className={`text-xs font-bold flex-shrink-0 ${active ? 'text-primary' : 'text-slate-400'}`}>{zEntries.length}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {FIRMAS_STATUSES.map(s => {
                            const n = zEntries.filter(e => e.status === s).length
                            if (n === 0) return null
                            return (
                              <span key={s} className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-500" title={FIRMAS_CONFIG[s].label}>
                                <span className={`w-1.5 h-1.5 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                                {n}
                              </span>
                            )
                          })}
                          {zEntries.length === 0 && <span className="text-[10.5px] text-slate-300">sin jugadores</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Tablero de la zona seleccionada */}
                {activeZone ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {renamingZone ? (
                        <span className="flex items-center gap-1.5">
                          <input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void renameZone(activeZone); if (e.key === 'Escape') setRenamingZone(false) }}
                            autoFocus
                            className="text-xs font-bold text-slate-700 border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                          <button onClick={() => void renameZone(activeZone)} className="text-[11px] font-medium text-primary hover:underline">Guardar</button>
                          <button onClick={() => setRenamingZone(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancelar</button>
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{activeZone}</span>
                          <button
                            onClick={() => { setRenameValue(activeZone); setRenamingZone(true) }}
                            className="p-0.5 text-slate-300 hover:text-slate-500"
                            title="Renombrar zona (se aplica a todos sus jugadores)"
                            aria-label="Renombrar zona"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <span className="text-[11px] text-slate-400">{zoneEntries.length} jugador{zoneEntries.length !== 1 ? 'es' : ''}</span>
                    </div>
                    <div className="sm:hidden space-y-2.5">
                      {FIRMAS_STATUSES.map(s => {
                        const l = zoneEntries
                          .filter(e => e.status === s)
                          .sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName))
                        if (l.length === 0) return null
                        return (
                          <div key={s}>
                            <div className="flex items-center gap-1.5 px-1 pb-1">
                              <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{FIRMAS_CONFIG[s].label}</span>
                              <span className="text-[11px] text-slate-400">{l.length}</span>
                            </div>
                            {mobileList(l, false)}
                          </div>
                        )
                      })}
                    </div>
                    {statusBoard(zoneEntries)}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">No hay zonas todavía</p>
                )}
              </div>
            )
          })()}

          {/* ── Vista por ENCARGADO ── */}
          {view === 'encargado' && (() => {
            const noManager = filtered.filter(e => e.managers.length === 0)
            const cols = managerOptions
              .map(p => ({ profile: p, list: filtered.filter(e => e.managers.includes(p.id)) }))
              .filter(c => c.list.length > 0)
              .sort((a, b) => b.list.length - a.list.length)
            const effManager = cols.some(c => c.profile.id === mobManager) || mobManager === 'sin'
              ? mobManager
              : (cols[0]?.profile.id ?? 'sin')
            const mobList = effManager === 'sin' ? noManager : (cols.find(c => c.profile.id === effManager)?.list ?? [])
            return (
              <>
              <div className="sm:hidden space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
                  {cols.map(({ profile: p, list }) => {
                    const c = scoutColor(p.avatar || p.name)
                    const active = effManager === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setMobManager(p.id)}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active ? `${c.bg} ${c.text} ${c.border} ring-1 ring-current` : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        {(p.avatar || p.name.slice(0, 2)).toUpperCase()} {list.length}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setMobManager('sin')}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      effManager === 'sin' ? 'bg-red-50 text-red-600 border-red-200 ring-1 ring-current' : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    ⚠ Sin encargado {noManager.length}
                  </button>
                </div>
                {mobileList(
                  [...mobList].sort((a, b) =>
                    FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) || a.playerName.localeCompare(b.playerName)
                  )
                )}
              </div>
              <div className="hidden sm:flex gap-3 overflow-x-auto pb-2 sm:mx-0 sm:px-0">
                {cols.map(({ profile: p, list }) => {
                  const c = scoutColor(p.avatar || p.name)
                  const calientes = list.filter(e => e.status === 'caliente').length
                  const overdue = list.filter(e => firmasAging(e)?.overdue).length
                  return (
                    <div key={p.id} className="flex-shrink-0 w-[250px] bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8.5px] font-bold ${c.bg} ${c.text}`}>
                          {(p.avatar || p.name.slice(0, 2)).slice(0, 3).toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-slate-700 truncate">{p.name.split(' ')[0]}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{list.length}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {calientes > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10.5px] text-red-600 font-semibold" title="Calientes">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{calientes}
                            </span>
                          )}
                          {overdue > 0 && <span className="text-[10.5px] text-red-500" title="Desatendidos">⚠ {overdue}</span>}
                        </span>
                      </div>
                      <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
                        {list
                          .slice()
                          .sort((a, b) => FIRMAS_STATUSES.indexOf(a.status) - FIRMAS_STATUSES.indexOf(b.status) || a.playerName.localeCompare(b.playerName))
                          .map(e => card(e, true))}
                      </div>
                    </div>
                  )
                })}
                {/* Sin encargado — para repartir */}
                <div className={`flex-shrink-0 w-[250px] rounded-lg border ${noManager.length > 0 ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 px-2.5 py-2">
                    <span className={`text-xs font-bold ${noManager.length > 0 ? 'text-red-700' : 'text-slate-400'}`}>⚠ Sin encargado</span>
                    <span className="text-[11px] text-slate-400 font-medium">{noManager.length}</span>
                  </div>
                  <div className="px-2 pb-2 space-y-1.5 max-h-[65vh] overflow-y-auto">
                    {noManager.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-4">Todos repartidos ✓</div>
                    ) : noManager.map(e => card(e, true))}
                  </div>
                </div>
              </div>
              </>
            )
          })()}
        </>
      )}

      {/* ── Hover card ── */}
      {hoverEntry && hover && (
        <FirmasHoverCard
          entry={hoverEntry}
          sp={hoverEntry.scoutingPlayerId ? spById[hoverEntry.scoutingPlayerId] : undefined}
          reports={hoverEntry.scoutingPlayerId ? (reportsByPlayer[hoverEntry.scoutingPlayerId] ?? []) : []}
          profiles={profiles}
          pos={{ x: hover.x, y: hover.y }}
        />
      )}

      {/* ── Panel de detalle ── */}
      {panelEntry && (
        <FirmasDetailPanel
          key={panelEntry.id}
          entry={panelEntry}
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          spById={spById}
          reportsByPlayer={reportsByPlayer}
          zones={zones}
          players={players}
          onCreatePlayer={onCreatePlayer}
          showToast={showToast}
          headerHeight={headerHeight}
          onClose={() => setPanelId(null)}
          onPatch={patch}
          onChangeStatus={changeStatus}
          onOpenScoutingPlayer={onOpenScoutingPlayer}
          onRequestDelete={() => setConfirmDelete(panelEntry)}
        />
      )}

      {/* ── Confirmar borrado ── */}
      {confirmDelete && (
        <ConfirmModal
          open
          title="Eliminar jugador del pipeline"
          message={`¿Seguro que quieres eliminar a ${confirmDelete.playerName} del pipeline de firmas? Se perderá su historial.`}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={async () => {
            try {
              await onDelete(confirmDelete.id)
              setConfirmDelete(null)
              setPanelId(null)
              showToast('Jugador eliminado del pipeline')
            } catch (err) {
              console.error(err)
              showToast('No se pudo eliminar', 'error')
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Resumen semanal (copiable) ── */}
      {showResumen && (() => {
        const active = entries.filter(e => e.status !== 'firmado')
        const calientes = active.filter(e => e.status === 'caliente')
        const vencidas = active.filter(e => e.nextActionDate && e.nextActionDate < todayISO())
        const desatendidos = active.filter(e => firmasAging(e)?.overdue)
        const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
        const firmados7 = entries.filter(e => e.status === 'firmado' && (e.signedAt ?? '') >= since7)
        const nombreEnc = (e: FirmasEntry) => e.managers.map(id => profiles.find(p => p.id === id)?.avatar).filter(Boolean).join('/')
        const lines: string[] = []
        lines.push(`📋 PIPELINE FIRMAR · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`)
        lines.push('')
        lines.push(`Activos: ${active.length} · ${FIRMAS_STATUSES.filter(s => s !== 'firmado').map(s => `${entries.filter(e => e.status === s).length} ${FIRMAS_CONFIG[s].label.toLowerCase()}`).join(' · ')}`)
        lines.push('')
        lines.push(`🔥 CALIENTES (${calientes.length})`)
        calientes.forEach(e => lines.push(`  · ${e.playerName} (${nombreEnc(e) || 'sin enc.'}) — ${e.nextAction ? `${e.nextAction} el ${e.nextActionDate ? fmtDate(e.nextActionDate) : 's/f'}` : '⚠ SIN PRÓXIMA ACCIÓN'}`))
        if (vencidas.length) {
          lines.push('')
          lines.push(`⏰ ACCIONES VENCIDAS (${vencidas.length})`)
          vencidas.forEach(e => lines.push(`  · ${e.playerName}: ${e.nextAction ?? 'acción'} (${e.nextActionDate ? fmtDate(e.nextActionDate) : ''}, ${nombreEnc(e) || '—'})`))
        }
        if (desatendidos.length) {
          lines.push('')
          lines.push(`🚨 DESATENDIDOS: ${desatendidos.length} (caliente +10d / templado +50d / frío +90d)`)
          desatendidos.slice(0, 8).forEach(e => lines.push(`  · ${e.playerName} (${FIRMAS_CONFIG[e.status].label.toLowerCase()}, ${firmasAging(e)?.days}d sin tocar)`))
          if (desatendidos.length > 8) lines.push(`  · … y ${desatendidos.length - 8} más`)
        }
        if (firmados7.length) {
          lines.push('')
          lines.push(`🎉 FIRMADOS ESTA SEMANA: ${firmados7.map(e => e.playerName).join(', ')}`)
        }
        const text = lines.join('\n')
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setShowResumen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">Resumen del pipeline</h3>
                <button onClick={() => setShowResumen(false)} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <pre className="flex-1 overflow-y-auto text-[11.5px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-sans">{text}</pre>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(text)
                      .then(() => showToast('Resumen copiado — pégalo en WhatsApp'))
                      .catch(() => showToast('No se pudo copiar', 'error'))
                  }}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  📋 Copiar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal de alta ── */}
      {showAdd && (
        <FirmasAddModal
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          zones={zones.length > 0 ? zones : FIRMAS_ZONE_ORDER}
          existing={entries}
          onClose={() => setShowAdd(false)}
          onCreate={async (draft) => {
            try {
              const maxPos = Math.max(0, ...entries.filter(e => e.zone === draft.zone && e.status === draft.status).map(e => e.sortPos))
              const saved = await onCreate({ ...draft, sortPos: maxPos + 1 })
              setShowAdd(false)
              setPanelId(saved.id)
              showToast(`${draft.playerName} añadido al pipeline`)
            } catch (err) {
              console.error(err)
              showToast('No se pudo crear (¿has ejecutado la migración SQL?)', 'error')
            }
          }}
        />
      )}
    </div>
  )
}
