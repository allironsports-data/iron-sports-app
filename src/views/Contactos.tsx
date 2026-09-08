import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import {
  Search, ChevronRight, ChevronDown, Phone, X,
  Users, Star, Plus, Pencil, Check, Trash2,
  List, LayoutList, AlertCircle, AlertTriangle, UserX, Database, CloudUpload,
} from 'lucide-react'
import { Badge, Button, Dialog, Field, IconButton, Input, Select } from '../components/ui'
import { DetailHeader } from '../components/shell'
import { ConfirmModal } from '../components/ConfirmModal'
import { L } from '../lib/labels'
import {
  cargarContactos, aplicarOverride, sinNulos, rowToContact, contactToRow,
  type Contact, type ContactDraft,
} from '../data/contactos'
import {
  fetchContactos, upsertContacto, marcarBorrado, fetchFavoritos, toggleFavorito,
  guardarFavoritos, importarBase, esTablaInexistente,
} from '../lib/dbContactos'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { ToastStack } from '../components/ToastStack'
import { supabase } from '../lib/supabase'
import { normClave } from '../lib/texto'

// ── Confederation grouping ────────────────────────────────────────────────────

const CONFEDERATIONS: { label: string; code: string; regions: Set<string> }[] = [
  {
    label: 'UEFA', code: 'UEFA',
    regions: new Set([
      'Alemania', 'Austria', 'Azerbaijan', 'Bielorrusia', 'Bulgaria', 'Bélgica',
      'Chipre', 'Croacia', 'Dinamarca', 'Escocia', 'Eslovaquia', 'Eslovenia',
      'España', 'Finlandia', 'Francia', 'Georgia', 'Grecia', 'Hungría', 'Inglaterra',
      'Israel', 'Italia', 'Kazajistán', 'Letonia', 'Lituania', 'Noruega', 'País de Gales',
      'Países Bajos', 'Polonia', 'Portugal', 'República Checa', 'Rumanía', 'Rusia',
      'Serbia', 'Suecia', 'Suiza', 'Turquía', 'Ucrania', 'Uzbekistán',
    ]),
  },
  {
    label: 'CONMEBOL', code: 'CONMEBOL',
    regions: new Set([
      'Argentina', 'Brasil', 'Chile', 'Colombia', 'Ecuador', 'Perú', 'Uruguay',
    ]),
  },
  {
    label: 'CONCACAF', code: 'CONCACAF',
    regions: new Set(['México', 'USA / MLS', 'Costa Rica']),
  },
  {
    label: 'AFC', code: 'AFC',
    regions: new Set(['Japón', 'India', 'Irán', 'Oriente Medio', 'Asia']),
  },
  {
    label: 'CAF', code: 'CAF',
    regions: new Set(['Egipto']),
  },
]

function getConfederation(region: string) {
  for (const conf of CONFEDERATIONS) {
    if (conf.regions.has(region)) return conf.code
  }
  return 'Otros'
}

// ── LocalStorage keys ─────────────────────────────────────────────────────────

const LS_FAVORITES = 'ais_contact_favorites'
const LS_EXTRA     = 'ais_extra_contacts'
const LS_OVERRIDES = 'ais_contact_overrides'
const LS_DELETED   = 'ais_deleted_contacts'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_REGIONS = new Set(['Agents', 'COACHS', 'PLAYERS', 'FEDERACIONES', 'Coach'])

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set() }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]))
}
function loadJSON<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function saveJSON(key: string, v: unknown) {
  localStorage.setItem(key, JSON.stringify(v))
}

// Id aleatorio para contactos nuevos. Antes se derivaba de nombre|equipo|…
// y dos contactos iguales (o el mismo dado de alta dos veces) chocaban de id:
// uno pisaba al otro y el borrado se llevaba a los dos.
function generateId(): string {
  return 'custom_' + crypto.randomUUID()
}

// ContactDraft / sinNulos / aplicarOverride viven en src/data/contactos.ts
// (son puros y los comparte la importación a Supabase).

const normalise = normClave

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  'Tier 1': { bg: 'bg-amber-100', text: 'text-amber-800' },
  'Tier 2': { bg: 'bg-blue-50',   text: 'text-blue-700' },
  'Tier 3': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'Tier 4': { bg: 'bg-slate-50',  text: 'text-slate-600' },
}

/** «Tier 1» (valor guardado) → «Nivel 1» (texto visible). No cambia el dato. */
function tierLabel(tier?: string): string {
  if (!tier) return ''
  return tier.replace(/^Tier\s*/i, `${L.nivel} `)
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  const cls = TIER_COLORS[tier] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  return <span className={`px-1.5 py-0.5 rounded text-badge font-medium ${cls.bg} ${cls.text}`}>{tierLabel(tier)}</span>
}

function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

type ViewMode = 'regions' | 'alpha'

// ── Main component ────────────────────────────────────────────────────────────

interface ModalState { mode: 'add' | 'edit'; contact?: Contact }
interface DeleteState { ids: string[]; single?: boolean }

/**
 * `isAdmin`: opcional. Si App no lo pasa, se toma de profile.is_admin del
 * AuthContext (hoy App solo muestra Contactos a admins, así que da igual).
 * Solo controla quién ve el botón «Importar ahora».
 */
export function Contactos({ onBack, isAdmin }: { onBack: () => void; isAdmin?: boolean }) {
  const { user, profile } = useAuth()
  const esAdmin = isAdmin ?? !!profile?.is_admin
  const userId = user?.id ?? null
  const { toasts, showToast, dismissToast } = useToast()

  // ── Persistent data (modo localStorage: mientras la tabla no exista) ──
  const [extraContacts, setExtraContacts] = useState<Contact[]>(() => loadJSON(LS_EXTRA, []))
  const [overrides,     setOverrides]     = useState<Record<string, ContactDraft>>(() => loadJSON(LS_OVERRIDES, {}))
  const [favorites,     setFavorites]     = useState<Set<string>>(() => loadSet(LS_FAVORITES))
  const [deleted,       setDeleted]       = useState<Set<string>>(() => loadSet(LS_DELETED))

  // ── Modo Supabase ──
  // dbContacts === null → la tabla no existe o está vacía: se sigue con
  // localStorage como siempre. Con filas → todo va a la base de datos.
  const [dbContacts, setDbContacts] = useState<Contact[] | null>(null)
  const migrado = dbContacts !== null
  const [importando, setImportando] = useState<string | null>(null)   // texto de progreso
  const [errorDb, setErrorDb] = useState(false)   // fallo raro (red, RLS…) al leer la tabla

  // ── UI state ──
  const [viewMode,       setViewMode]       = useState<ViewMode>('regions')
  const [search,         setSearch]         = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [showFavorites,  setShowFavorites]  = useState(false)
  const [expandedTeams,  setExpandedTeams]  = useState<Set<string>>(new Set())
  const [roleFilter,     setRoleFilter]     = useState<string | null>(null)
  const [tierFilter,     setTierFilter]     = useState<string | null>(null)
  const [expandedConfs,  setExpandedConfs]  = useState<Set<string>>(new Set(['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'Otros']))
  const [modal,          setModal]          = useState<ModalState | null>(null)
  const [deleteState,    setDeleteState]    = useState<DeleteState | null>(null)
  const [selected,       setSelected]       = useState<Set<string>>(new Set())

  // Los 3.065 contactos de base (public/contactos.json). Solo se descargan
  // si la agenda aún no está en Supabase (o para importarla).
  const [STATIC_CONTACTS, setStaticContacts] = useState<Contact[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)

  // Lee la tabla. Devuelve true si hay filas (modo Supabase).
  // Las filas deleted se quedan fuera aquí; la tabla se trae entera.
  const cargarDb = useCallback(async (): Promise<boolean> => {
    try {
      const filas = await fetchContactos()
      setErrorDb(false)
      if (filas.length === 0) { setDbContacts(null); return false }
      setDbContacts(filas.filter(f => !f.deleted).map(rowToContact))
      return true
    } catch (err) {
      if (!esTablaInexistente(err)) { console.error('[contactos] supabase', err); setErrorDb(true) }
      setDbContacts(null)
      return false
    }
  }, [])

  const cargarLocal = useCallback(async () => {
    try {
      setStaticContacts(await cargarContactos())
      setErrorCarga(false)
    } catch (err) {
      console.error('[contactos]', err)
      setErrorCarga(true)
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const enDb = await cargarDb()
      if (cancelado) return
      if (!enDb) await cargarLocal()
      if (!cancelado) setCargando(false)
    })()
    return () => { cancelado = true }
  }, [cargarDb, cargarLocal])

  // Favoritos por usuario (solo en modo Supabase)
  useEffect(() => {
    if (!migrado || !userId) return
    let cancelado = false
    fetchFavoritos(userId)
      .then(f => { if (!cancelado) setFavorites(f) })
      .catch(err => { console.error('[contactos] favoritos', err); showToast('No se han podido cargar tus favoritos', 'error') })
    return () => { cancelado = true }
  }, [migrado, userId, showToast])

  // Realtime: cualquier cambio en la tabla → refetch con debounce 800 ms
  useEffect(() => {
    if (!migrado) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const channel = supabase.channel('contactos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => {
        clearTimeout(timer)
        timer = setTimeout(() => { void cargarDb() }, 800)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [migrado, cargarDb])

  // ── Importación inicial (solo admin, una vez) ──
  async function importarAhora() {
    if (importando) return
    setImportando('Preparando…')
    try {
      const base = STATIC_CONTACTS.length ? STATIC_CONTACTS : await cargarContactos()
      const n = await importarBase(base, overrides, extraContacts, deleted,
        (subidas, total) => setImportando(`Subiendo ${subidas.toLocaleString()} / ${total.toLocaleString()}…`))
      if (userId && favorites.size) {
        setImportando('Guardando favoritos…')
        await guardarFavoritos(userId, favorites)
      }
      await cargarDb()
      showToast(`${n.toLocaleString()} contactos importados`, 'success')
    } catch (err) {
      console.error('[contactos] importar', err)
      showToast('No se ha podido importar: ' + ((err as { message?: string })?.message ?? 'error'), 'error')
    } finally {
      setImportando(null)
    }
  }

  // ── Merged contact list ──
  const ALL_CONTACTS = useMemo(() => {
    if (dbContacts) return dbContacts.filter(c => !EXCLUDED_REGIONS.has(c.region ?? ''))
    const base = STATIC_CONTACTS
      .filter(c => !EXCLUDED_REGIONS.has(c.region ?? '') && !deleted.has(c.id))
      .map(c => overrides[c.id] ? aplicarOverride(c, overrides[c.id]) : c)
    const extra = extraContacts.filter(c => !deleted.has(c.id))
    return [...base, ...extra]
  }, [dbContacts, STATIC_CONTACTS, extraContacts, overrides, deleted])

  // Real contacts (with a person) vs. empty club placeholders
  const REAL_CONTACTS = useMemo(() =>
    ALL_CONTACTS.filter(c => !c._noContact && (c.name || c.phone1 || c.phone2))
  , [ALL_CONTACTS])

  const ALL_REGIONS = useMemo(() =>
    [...new Set(ALL_CONTACTS.map(c => c.region ?? 'Sin clasificar'))].filter(Boolean).sort((a, b) => a.localeCompare(b))
  , [ALL_CONTACTS])

  // Regions grouped by confederation (for sidebar)
  const regionsByConfederation = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const r of ALL_REGIONS) {
      const conf = getConfederation(r)
      if (!map.has(conf)) map.set(conf, [])
      map.get(conf)!.push(r)
    }
    // Sort confederation order to match CONFEDERATIONS array
    const confOrder = [...CONFEDERATIONS.map(c => c.code), 'Otros']
    return confOrder
      .filter(c => map.has(c))
      .map(c => ({ code: c, label: CONFEDERATIONS.find(x => x.code === c)?.label ?? c, regions: map.get(c)! }))
  }, [ALL_REGIONS])

  const ALL_ROLES = useMemo(() =>
    [...new Set(REAL_CONTACTS.map(c => c.role).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, 'es'))
  , [REAL_CONTACTS])

  const teamsByRegion = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const c of ALL_CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      const t = c.team ?? '—'
      if (!map.has(r)) map.set(r, new Set())
      map.get(r)!.add(t)
    }
    return map
  }, [ALL_CONTACTS])

  const q = normalise(search.trim())
  const isSearching = q.length > 1

  // ── Apply filters ──
  const applyFilters = useCallback((cs: Contact[]) => {
    let out = cs
    if (roleFilter) out = out.filter(c => c.role === roleFilter)
    if (tierFilter) out = out.filter(c => c.tier === tierFilter)
    return out
  }, [roleFilter, tierFilter])

  // ── Region view filtered contacts ──
  const regionFiltered = useMemo<Contact[]>(() => {
    const cs = applyFilters(ALL_CONTACTS)
    if (showFavorites) return cs.filter(c => favorites.has(c.id))
    if (!isSearching && !selectedRegion) return cs
    return cs.filter(c => {
      const regionOk = !selectedRegion || (c.region ?? 'Sin clasificar') === selectedRegion
      if (!isSearching) return regionOk
      const hay = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
      return hay.includes(q)
    })
  }, [ALL_CONTACTS, applyFilters, showFavorites, favorites, isSearching, selectedRegion, q])

  // ── Alpha view filtered contacts ──
  const alphaFiltered = useMemo<Contact[]>(() => {
    let cs = applyFilters(REAL_CONTACTS)
    if (isSearching) {
      cs = cs.filter(c => {
        const hay = normalise([c.name, c.team, c.region, c.role, c.phone1, c.phone2].filter(Boolean).join(' '))
        return hay.includes(q)
      })
    }
    return [...cs].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [REAL_CONTACTS, applyFilters, isSearching, q])

  // ── Group for region view ──
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Contact[]>>()
    for (const c of regionFiltered) {
      const region = c.region ?? 'Sin clasificar'
      const team   = c.team   ?? '—'
      if (!map.has(region)) map.set(region, new Map())
      const teams = map.get(region)!
      if (!teams.has(team)) teams.set(team, [])
      teams.get(team)!.push(c)
    }
    return map
  }, [regionFiltered])

  const regionCounts = useMemo(() => {
    const m = new Map<string, { total: number; withContact: number }>()
    for (const c of ALL_CONTACTS) {
      const r = c.region ?? 'Sin clasificar'
      const cur = m.get(r) ?? { total: 0, withContact: 0 }
      cur.total++
      if (!c._noContact && (c.name || c.phone1 || c.phone2)) cur.withContact++
      m.set(r, cur)
    }
    return m
  }, [ALL_CONTACTS])

  // ── Auto-expand when region selected ──
  // Solo al cambiar de región: si dependiera de teamsByRegion, cada alta o
  // edición volvía a desplegar todos los equipos que el usuario había cerrado.
  const teamsByRegionRef = useRef(teamsByRegion)
  useEffect(() => { teamsByRegionRef.current = teamsByRegion }, [teamsByRegion])
  useEffect(() => {
    if (!selectedRegion) return
    const keys = new Set<string>()
    for (const t of teamsByRegionRef.current.get(selectedRegion) ?? []) keys.add(`${selectedRegion}::${t}`)
    setExpandedTeams(keys)
  }, [selectedRegion])

  const allGroupedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [region, teams] of grouped) {
      for (const team of teams.keys()) keys.add(`${region}::${team}`)
    }
    return keys
  }, [grouped])

  const effectiveExpanded = (isSearching || showFavorites) ? allGroupedKeys : expandedTeams

  function toggleTeam(key: string) {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── Favorites ──
  const toggleFavorite = useCallback((id: string) => {
    if (migrado && userId) {
      // Optimista: se pinta ya y, si la base falla, se deshace.
      const era = favorites.has(id)
      setFavorites(prev => { const n = new Set(prev); if (era) n.delete(id); else n.add(id); return n })
      toggleFavorito(userId, id, era).catch(err => {
        console.error('[contactos] favorito', err)
        setFavorites(prev => { const n = new Set(prev); if (era) n.add(id); else n.delete(id); return n })
        showToast('No se ha podido guardar el favorito', 'error')
      })
      return
    }
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveSet(LS_FAVORITES, next)
      return next
    })
  }, [migrado, userId, favorites, showToast])

  // ── Delete ──
  function confirmDelete(ids: string[]) {
    setDeleteState(null)
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
    if (migrado) {
      // Borrado lógico en Supabase, optimista con rollback
      const antes = dbContacts
      const borrar = new Set(ids)
      setDbContacts(prev => (prev ?? []).filter(c => !borrar.has(c.id)))
      marcarBorrado(ids)
        .then(() => showToast(ids.length === 1 ? 'Contacto eliminado' : `${ids.length} contactos eliminados`, 'success'))
        .catch(err => {
          console.error('[contactos] borrar', err)
          setDbContacts(antes)
          showToast('No se ha podido eliminar', 'error')
        })
      return
    }
    // Los contactos extra se quitan de su lista y punto: meterlos en
    // LS_DELETED solo hacía crecer esa lista para siempre.
    const extraIds = new Set(extraContacts.map(c => c.id))
    const staticIds = ids.filter(id => !extraIds.has(id))
    if (staticIds.length) {
      const newDeleted = new Set([...deleted, ...staticIds])
      setDeleted(newDeleted)
      saveSet(LS_DELETED, newDeleted)
    }
    const borrar = new Set(ids)
    const newExtra = extraContacts.filter(c => !borrar.has(c.id))
    if (newExtra.length !== extraContacts.length) {
      setExtraContacts(newExtra)
      saveJSON(LS_EXTRA, newExtra)
    }
    // Clear overrides for deleted
    const newOverrides = { ...overrides }
    ids.forEach(id => delete newOverrides[id])
    setOverrides(newOverrides)
    saveJSON(LS_OVERRIDES, newOverrides)
  }

  // ── Multi-select (alpha view) ──
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function selectAll() {
    setSelected(new Set(alphaFiltered.map(c => c.id)))
  }
  function clearSelection() { setSelected(new Set()) }

  // ── Add / Edit contact ──
  function handleSave(data: ContactDraft) {
    if (!modal) return
    setModal(null)
    if (migrado) {
      // null del formulario = columna a null (contactToRow lo traduce)
      const esAlta = modal.mode === 'add' || !modal.contact
      const nc: Contact = esAlta
        ? { ...sinNulos(data), id: generateId() }
        : aplicarOverride(modal.contact!, data)
      const origen = esAlta || modal.contact!.id.startsWith('custom_') ? 'manual' : 'base'
      const antes = dbContacts
      setDbContacts(prev => {
        const lista = prev ?? []
        return esAlta ? [...lista, nc] : lista.map(c => c.id === nc.id ? nc : c)
      })
      upsertContacto(contactToRow(nc, origen))
        .then(() => showToast(esAlta ? 'Contacto añadido' : 'Contacto guardado', 'success'))
        .catch(err => {
          console.error('[contactos] guardar', err)
          setDbContacts(antes)
          showToast('No se ha podido guardar', 'error')
        })
      return
    }
    if (modal.mode === 'add') {
      const id = generateId()
      const nc: Contact = { ...sinNulos(data), id }
      const updated = [...extraContacts, nc]
      setExtraContacts(updated)
      saveJSON(LS_EXTRA, updated)
    } else if (modal.contact) {
      const { id } = modal.contact
      if (extraContacts.some(c => c.id === id)) {
        const updated = extraContacts.map(c => c.id === id ? { ...sinNulos(data), id } : c)
        setExtraContacts(updated)
        saveJSON(LS_EXTRA, updated)
      } else {
        const upd = { ...overrides, [id]: data }
        setOverrides(upd)
        saveJSON(LS_OVERRIDES, upd)
      }
    }
  }

  function selectRegion(region: string) {
    setSelectedRegion(prev => prev === region ? null : region)
    setShowFavorites(false)
    setSearch('')
    setViewMode('regions')
  }

  const regionsToShow = (isSearching || showFavorites)
    ? [...grouped.keys()].sort((a, b) => a.localeCompare(b))
    : selectedRegion ? [selectedRegion] : []

  // Alpha view letters
  const alphaByLetter = useMemo(() => {
    const map = new Map<string, Contact[]>()
    for (const c of alphaFiltered) {
      const letter = (c.name?.[0] ?? '#').toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(c)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [alphaFiltered])

  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      {/* ── Cabecera (DetailHeader: atrás + título) ── */}
      <DetailHeader
        onBack={onBack}
        title={
          <span className="inline-flex items-center gap-2">
            Contactos
            <Badge tone="danger" pill={false} className="uppercase tracking-wide">Admin</Badge>
          </span>
        }
        actions={
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setModal({ mode: 'add' })}>
            Añadir
          </Button>
        }
      />

      {/* Aviso honesto: mientras la agenda no esté en la base de datos,
          lo que edites aquí no lo ve nadie más ni te sigue al móvil */}
      {!migrado && !cargando && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-secondary text-amber-800" role="status">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Solo en este dispositivo.</strong> Los contactos que añadas o edites se guardan solo en este navegador: no se comparten con el equipo ni aparecen en tu móvil, y se pierden si borras los datos del navegador.
            </span>
          </div>
        </div>
      )}

      {/* ── Barra de acciones: vista, filtros y búsqueda ── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <Button
              size="sm"
              variant="ghost"
              icon={<LayoutList />}
              onClick={() => setViewMode('regions')}
              aria-pressed={viewMode === 'regions'}
              className={`rounded-none ${viewMode === 'regions' ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`}
              title="Vista por liga"
            >
              <span className="hidden sm:inline">Por liga</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<List />}
              onClick={() => { setViewMode('alpha'); setShowFavorites(false) }}
              aria-pressed={viewMode === 'alpha'}
              className={`rounded-none border-l border-slate-300 ${viewMode === 'alpha' ? 'bg-slate-800 text-white hover:bg-slate-700' : ''}`}
              title="Vista alfabética"
            >
              <span className="hidden sm:inline">A–Z</span>
            </Button>
          </div>

          {/* Filters (compact) */}
          <Select
            value={roleFilter ?? ''}
            onChange={e => setRoleFilter(e.target.value || null)}
            aria-label="Filtrar por rol"
            className="w-auto max-w-[150px] py-1 text-secondary"
          >
            <option value="">Rol: todos</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>

          <Select
            value={tierFilter ?? ''}
            onChange={e => setTierFilter(e.target.value || null)}
            aria-label={`Filtrar por ${L.nivel.toLowerCase()}`}
            className="w-auto py-1 text-secondary"
          >
            <option value="">{L.nivel}: todos</option>
            <option value="Tier 1">{L.nivel} 1</option>
            <option value="Tier 2">{L.nivel} 2</option>
            <option value="Tier 3">{L.nivel} 3</option>
            <option value="Tier 4">{L.nivel} 4</option>
          </Select>

          {/* Search — wider; full row on mobile */}
          <div className="relative w-full sm:w-64 sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) { setSelectedRegion(null); setShowFavorites(false) } }}
              placeholder="Buscar nombre, club, teléfono…"
              aria-label="Buscar contacto"
              className="pl-8 pr-9 py-1.5"
            />
            {search && (
              <IconButton label="Limpiar búsqueda" onClick={() => setSearch('')} className="absolute right-0.5 top-1/2 -translate-y-1/2">
                <X />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      {cargando && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            Cargando contactos…
          </div>
        </div>
      )}
      {/* Sin migrar: aviso + botón de importación (solo admin) */}
      {!migrado && !cargando && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <Database className="w-4 h-4 flex-shrink-0" />
            <span>
              Contactos aún no está en la base de datos.
              {errorDb
                ? ' No se ha podido consultar la tabla (revisa la migración o la conexión); mientras tanto se usa la copia de este navegador.'
                : esAdmin
                  ? ' Al importar se suben los contactos de base más las correcciones, altas y borrados guardados en este navegador.'
                  : ' Pide a un administrador que la importe.'}
            </span>
            {esAdmin && !errorDb && (
              <Button
                size="sm"
                icon={<CloudUpload />}
                onClick={importarAhora}
                disabled={!!errorCarga}
                loading={!!importando}
                className="ml-auto bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
              >
                {importando ? importando : 'Importar ahora'}
              </Button>
            )}
            {errorDb && (
              <button onClick={() => { void cargarDb() }} className="ml-auto underline font-medium text-xs">reintentar</button>
            )}
          </div>
        </div>
      )}
      {errorCarga && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            No se ha podido cargar la agenda de contactos.
            <button onClick={() => window.location.reload()} className="underline font-medium">reintentar</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row flex-1 gap-0 px-4 py-4">

        {/* ── Sidebar ── */}
        <aside className="w-full sm:w-52 flex-shrink-0 mb-4 sm:mb-0 sm:mr-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden sm:sticky sm:top-[calc(var(--shell-h)+1rem)]">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-meta font-semibold text-slate-500 uppercase tracking-wide">Regiones</p>
            </div>
            <div className="overflow-y-auto max-h-64 sm:max-h-[calc(100vh-120px)]">
              {/* Favoritos */}
              <button
                onClick={() => { setShowFavorites(true); setSelectedRegion(null); setSearch(''); setViewMode('regions') }}
                className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors border-b border-slate-100 ${
                  showFavorites ? 'bg-amber-50 text-amber-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Star className={`w-3.5 h-3.5 ${showFavorites ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  Favoritos
                </span>
                <span className={`ml-2 text-badge rounded-full px-1.5 ${showFavorites ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                  {favorites.size}
                </span>
              </button>

              {/* Region list grouped by confederation */}
              {regionsByConfederation.map(({ code, label, regions }) => {
                const isConfOpen = expandedConfs.has(code)
                const confTotal = regions.reduce((s, r) => s + (regionCounts.get(r)?.withContact ?? 0), 0)
                return (
                  <div key={code}>
                    {/* Confederation header */}
                    <button
                      onClick={() => setExpandedConfs(prev => {
                        const next = new Set(prev)
                        if (next.has(code)) next.delete(code); else next.add(code)
                        return next
                      })}
                      className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-50 border-y border-slate-100 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        {isConfOpen
                          ? <ChevronDown className="w-3 h-3 text-slate-400" />
                          : <ChevronRight className="w-3 h-3 text-slate-400" />
                        }
                        <span className="text-meta font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                      </span>
                      <span className="text-meta text-slate-500">{confTotal}</span>
                    </button>

                    {/* Regions in this confederation */}
                    {isConfOpen && regions.map(region => {
                      const counts = regionCounts.get(region) ?? { total: 0, withContact: 0 }
                      const missing = counts.total - counts.withContact
                      const active = selectedRegion === region && !isSearching && !showFavorites && viewMode === 'regions'
                      return (
                        <button
                          key={region}
                          onClick={() => selectRegion(region)}
                          className={`w-full text-left flex items-center justify-between px-3 pl-7 py-1.5 text-sm transition-colors ${
                            active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate flex-1 min-w-0 flex items-center gap-1">
                            {missing > 0 && (
                              <span title={`${missing} sin contacto`}><AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" /></span>
                            )}
                            {region}
                          </span>
                          <span className={`ml-1 flex-shrink-0 text-badge rounded-full px-1.5 ${
                            active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                          }`}>{counts.withContact}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="flex-1 min-w-0">

          {/* ═══ ALPHA VIEW ═══ */}
          {viewMode === 'alpha' && (
            <div>
              {/* Selection toolbar */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === alphaFiltered.length && alphaFiltered.length > 0}
                    onChange={e => e.target.checked ? selectAll() : clearSelection()}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  <span className="text-xs text-slate-500">
                    {alphaFiltered.length.toLocaleString()} contactos
                    {selected.size > 0 && ` · ${selected.size} seleccionados`}
                  </span>
                </label>
                {selected.size > 0 && (
                  <button
                    onClick={() => setDeleteState({ ids: [...selected] })}
                    className="flex items-center gap-1 ml-auto px-2.5 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar {selected.size}
                  </button>
                )}
                {isSearching && (
                  <span className="ml-auto text-xs text-slate-500">{alphaFiltered.length} resultado{alphaFiltered.length !== 1 ? 's' : ''} para «{search}»</span>
                )}
              </div>

              {/* Alphabetical list */}
              {alphaByLetter.map(([letter, contacts]) => (
                <div key={letter} className="mb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                      {letter}
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-50">
                    {contacts.map(c => (
                      <AlphaContactRow
                        key={c.id}
                        contact={c}
                        isSelected={selected.has(c.id)}
                        isFavorite={favorites.has(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onToggleFavorite={() => toggleFavorite(c.id)}
                        onEdit={() => setModal({ mode: 'edit', contact: c })}
                        onDelete={() => setDeleteState({ ids: [c.id], single: true })}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {alphaFiltered.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <Users className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm">Sin resultados{search ? ` para «${search}»` : ''}</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ REGION VIEW ═══ */}
          {viewMode === 'regions' && (
            <div>
              {/* Empty state */}
              {!isSearching && !selectedRegion && !showFavorites && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Users className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Selecciona una región</p>
                  <p className="text-secondary text-slate-500 mt-1">
                    {REAL_CONTACTS.length.toLocaleString()} contactos · {ALL_REGIONS.length} regiones
                  </p>
                </div>
              )}

              {/* Favorites header */}
              {showFavorites && !isSearching && (
                <div className="mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-700">Favoritos</span>
                  <span className="text-secondary text-slate-500">{regionFiltered.length} contacto{regionFiltered.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Search stats */}
              {isSearching && (
                <div className="mb-3 text-xs text-slate-500">
                  {regionFiltered.length} resultado{regionFiltered.length !== 1 ? 's' : ''} para «{search}»
                </div>
              )}

              {/* Region blocks */}
              <div className="space-y-4">
                {regionsToShow.map(region => {
                  const teams = grouped.get(region)
                  if (!teams) return null
                  const teamList = [...teams.entries()].sort(([a], [b]) => a.localeCompare(b))
                  const totalInRegion = [...teams.values()].reduce((s, c) => s + c.length, 0)

                  return (
                    <div key={region}>
                      {(isSearching || showFavorites) && (
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{region}</h2>
                          <span className="text-meta text-slate-500">{totalInRegion}</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {teamList.map(([team, contacts]) => {
                          const key = `${region}::${team}`
                          const isOpen = effectiveExpanded.has(key)
                          const hasOnlyPlaceholder = contacts.every(c => c._noContact || (!c.name && !c.phone1 && !c.phone2))
                          const realContacts = contacts.filter(c => !c._noContact && (c.name || c.phone1 || c.phone2))

                          return (
                            <div key={key} className={`bg-white border rounded-lg overflow-hidden ${hasOnlyPlaceholder ? 'border-amber-200 opacity-60' : 'border-slate-200'}`}>
                              <button
                                onClick={() => toggleTeam(key)}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {hasOnlyPlaceholder && (
                                    <span title="Sin contacto asignado"><AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /></span>
                                  )}
                                  <span className="text-sm font-semibold text-slate-800 truncate">{team}</span>
                                  {!hasOnlyPlaceholder && (
                                    <span className="text-meta text-slate-500 flex-shrink-0">
                                      {realContacts.length} contacto{realContacts.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {hasOnlyPlaceholder && (
                                    <span className="text-meta text-amber-500 flex-shrink-0">Sin contacto</span>
                                  )}
                                  {contacts[0]?.tier && <TierBadge tier={contacts[0].tier} />}
                                </div>
                                {isOpen
                                  ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                  : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                }
                              </button>

                              {isOpen && !hasOnlyPlaceholder && (
                                <div className="border-t border-slate-100 divide-y divide-slate-50">
                                  {realContacts.map(c => (
                                    <ContactRow
                                      key={c.id}
                                      contact={c}
                                      isFavorite={favorites.has(c.id)}
                                      onToggleFavorite={() => toggleFavorite(c.id)}
                                      onEdit={() => setModal({ mode: 'edit', contact: c })}
                                      onDelete={() => setDeleteState({ ids: [c.id], single: true })}
                                    />
                                  ))}
                                </div>
                              )}
                              {isOpen && hasOnlyPlaceholder && (
                                <div className="border-t border-amber-100 px-4 py-3 flex items-center gap-3">
                                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                  <p className="text-xs text-amber-600">No hay ningún contacto para este club.</p>
                                  <button
                                    onClick={() => setModal({ mode: 'add' })}
                                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                                  >
                                    <Plus className="w-3 h-3" /> Añadir
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Empty favorites */}
              {showFavorites && regionFiltered.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                  <Star className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm">No tienes contactos favoritos aún.</p>
                </div>
              )}

              {/* Empty search */}
              {isSearching && regionFiltered.length === 0 && (
                <div className="text-center py-16 text-body text-slate-500">
                  Sin resultados para «{search}»
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Add / Edit modal ── */}
      {modal && (
        <ContactFormModal
          mode={modal.mode}
          contact={modal.contact}
          regions={ALL_REGIONS}
          teamsByRegion={teamsByRegion}
          roles={ALL_ROLES}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Delete confirmation ── */}
      <ConfirmModal
        open={!!deleteState}
        title={`Eliminar ${deleteState?.ids.length === 1 ? 'contacto' : `${deleteState?.ids.length ?? 0} contactos`}`}
        message="Esta acción no se puede deshacer."
        confirmLabel={L.eliminar}
        onConfirm={() => { if (deleteState) confirmDelete(deleteState.ids) }}
        onCancel={() => setDeleteState(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

// ── Alpha contact row ─────────────────────────────────────────────────────────

function AlphaContactRow({
  contact: c, isSelected, isFavorite, onToggleSelect, onToggleFavorite, onEdit, onDelete,
}: {
  contact: Contact
  isSelected: boolean
  isFavorite: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-blue-50' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="w-4 h-4 accent-blue-600 flex-shrink-0"
        aria-label={`Seleccionar ${c.name ?? 'contacto'}`}
      />
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
        <span className="text-badge font-semibold text-slate-600">{initials(c.name)}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-x-3 gap-y-0.5 items-center">
        <div className="min-w-0">
          <p className="text-body font-medium text-slate-800 truncate">
            {c.name ?? <span className="text-slate-500 italic text-secondary">Sin nombre</span>}
          </p>
          {c.role && <p className="text-secondary text-slate-500 truncate">{c.role}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-secondary text-slate-600 truncate font-medium">{c.team ?? '—'}</p>
          <p className="text-meta text-slate-500 truncate">{c.region}</p>
        </div>
        <div className="flex items-center gap-2">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.tier && <TierBadge tier={c.tier} />}
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity flex-shrink-0">
        <IconButton label="Editar" onClick={onEdit}><Pencil /></IconButton>
        <IconButton
          label={isFavorite ? 'Quitar favorito' : 'Añadir favorito'}
          aria-pressed={isFavorite}
          onClick={onToggleFavorite}
          className={isFavorite ? 'text-amber-500' : ''}
        >
          <Star className={isFavorite ? 'fill-amber-400' : ''} />
        </IconButton>
        <IconButton label={L.eliminar} onClick={onDelete} className="hover:text-red-600 hover:bg-red-50"><Trash2 /></IconButton>
      </div>
    </div>
  )
}

// ── Region contact row ────────────────────────────────────────────────────────

function ContactRow({
  contact: c, isFavorite, onToggleFavorite, onEdit, onDelete,
}: {
  contact: Contact
  isFavorite: boolean
  onToggleFavorite: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors group">
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
        <span className="text-badge font-semibold text-slate-600">{initials(c.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body font-medium text-slate-800">
            {c.name ?? <span className="text-slate-500 italic text-secondary">Sin nombre</span>}
          </span>
          {c.role && <span className="text-secondary text-slate-600">{c.role}</span>}
          {c.tier && <TierBadge tier={c.tier} />}
          {c._noClub && (
            <span className="flex items-center gap-0.5 text-meta text-slate-500">
              <UserX className="w-3 h-3" aria-hidden="true" /> Sin club
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone1 && <PhoneLink phone={c.phone1} />}
          {c.phone2 && <PhoneLink phone={c.phone2} />}
        </div>
      </div>
      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <IconButton label="Editar" onClick={onEdit}><Pencil /></IconButton>
        <IconButton
          label={isFavorite ? 'Quitar favorito' : 'Añadir favorito'}
          aria-pressed={isFavorite}
          onClick={onToggleFavorite}
          className={isFavorite ? 'text-amber-500' : ''}
        >
          <Star className={isFavorite ? 'fill-amber-400' : ''} />
        </IconButton>
        <IconButton label={L.eliminar} onClick={onDelete} className="hover:text-red-600 hover:bg-red-50"><Trash2 /></IconButton>
      </div>
    </div>
  )
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, '')}`}
      className="inline-flex items-center gap-1 text-secondary text-primary hover:underline min-h-9 sm:min-h-0"
    >
      <Phone className="w-3 h-3" aria-hidden="true" />
      {phone}
    </a>
  )
}

// ── Contact form modal ────────────────────────────────────────────────────────

function ContactFormModal({
  mode, contact, regions, teamsByRegion, roles, onSave, onClose,
}: {
  mode: 'add' | 'edit'
  contact?: Contact
  regions: string[]
  teamsByRegion: Map<string, Set<string>>
  roles: string[]
  onSave: (data: ContactDraft) => void
  onClose: () => void
}) {
  const [name,    setName]    = useState(contact?.name    ?? '')
  const [role,    setRole]    = useState(contact?.role    ?? '')
  const [phone1,  setPhone1]  = useState(contact?.phone1  ?? '')
  const [phone2,  setPhone2]  = useState(contact?.phone2  ?? '')
  const [region,  setRegion]  = useState(contact?.region  ?? '')
  const [team,    setTeam]    = useState(contact?.team    ?? '')
  const [tier,    setTier]    = useState(contact?.tier    ?? '')
  const [noClub,  setNoClub]  = useState(contact?._noClub ?? false)
  const [teamInput, setTeamInput] = useState(contact?.team ?? '')
  const [showSugg,  setShowSugg]  = useState(false)
  const teamRef = useRef<HTMLDivElement>(null)

  const teamsForRegion = useMemo(() =>
    region ? [...(teamsByRegion.get(region) ?? [])].sort((a, b) => a.localeCompare(b, 'es')) : []
  , [region, teamsByRegion])

  const teamSuggestions = useMemo(() =>
    teamsForRegion.filter(t => {
      const ti = normalise(teamInput)
      return ti.length > 0 && normalise(t).includes(ti) && t !== teamInput
    })
  , [teamsForRegion, teamInput])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) setShowSugg(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // null = «campo borrado» (ver ContactDraft)
    onSave({
      name:     name  || null,
      role:     role  || null,
      phone1:   phone1 || null,
      phone2:   phone2 || null,
      region:   noClub ? 'Sin club' : (region || 'Sin clasificar'),
      team:     noClub ? null : (team || null),
      tier:     tier  || null,
      _noClub:  noClub || null,
    })
  }

  const dirty = mode === 'add'
    ? !!(name.trim() || role.trim() || phone1.trim())
    : (name !== (contact?.name ?? '') || role !== (contact?.role ?? '') || phone1 !== (contact?.phone1 ?? '') || phone2 !== (contact?.phone2 ?? '') || team !== (contact?.team ?? '') || tier !== (contact?.tier ?? ''))

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'add' ? 'Nuevo contacto' : 'Editar contacto'}
      onSubmit={handleSubmit}
      dirty={dirty}
      historyKey="contacto-form"
      footer={<>
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" icon={<Check />}>{mode === 'add' ? 'Crear' : L.guardar}</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Nombre completo">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" autoFocus />
        </Field>

        <Field label="Rol / Cargo">
          <Input value={role} onChange={e => setRole(e.target.value)} list="roles-list" placeholder="Director deportivo, CEO…" />
        </Field>
        <datalist id="roles-list">{roles.map(r => <option key={r} value={r} />)}</datalist>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono 1">
            <Input type="tel" value={phone1} onChange={e => setPhone1(e.target.value)} placeholder="+34 600…" />
          </Field>
          <Field label="Teléfono 2">
            <Input type="tel" value={phone2} onChange={e => setPhone2(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        {/* Sin club toggle */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
          <button
            type="button"
            role="switch"
            aria-checked={noClub}
            aria-label="Sin club / Libre"
            onClick={() => setNoClub(v => !v)}
            className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${noClub ? 'bg-amber-400' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${noClub ? 'left-4' : 'left-0.5'}`} />
          </button>
          <div>
            <p className="text-body font-medium text-slate-700">Sin club / Libre</p>
            <p className="text-meta text-slate-500">Persona sin club asignado actualmente</p>
          </div>
          {noClub && <UserX className="w-4 h-4 text-amber-500 ml-auto" aria-hidden="true" />}
        </div>

        {/* Region + Team (hidden if noClub) */}
        {!noClub && (
          <>
            <Field label="Liga / Región" required>
              <Select value={region} onChange={e => { setRegion(e.target.value); setTeam(''); setTeamInput('') }} required>
                <option value="">Seleccionar región…</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <div ref={teamRef}>
              <Field label="Club / Equipo">
                {p => (
                  <div className="relative">
                    <Input
                      {...p}
                      value={teamInput}
                      onChange={e => { setTeamInput(e.target.value); setTeam(e.target.value); setShowSugg(true) }}
                      onFocus={() => setShowSugg(true)}
                      placeholder={region ? 'Escribe o elige club…' : 'Selecciona región primero'}
                      disabled={!region}
                      autoComplete="off"
                    />
                    {showSugg && teamSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {teamSuggestions.map(t => (
                          <button key={t} type="button"
                            onClick={() => { setTeam(t); setTeamInput(t); setShowSugg(false) }}
                            className="w-full text-left px-3 py-2 text-body hover:bg-blue-50 text-slate-700"
                          >{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Field>
            </div>
          </>
        )}

        {/* Nivel */}
        <Field label={`${L.nivel} del club`}>
          {() => (
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={`${L.nivel} del club`}>
              {['', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(t => (
                <button key={t} type="button" role="radio" aria-checked={tier === t} onClick={() => setTier(t)}
                  className={`px-2.5 min-h-9 sm:min-h-8 rounded text-secondary font-medium border transition-colors ${
                    tier === t
                      ? t === '' ? 'bg-slate-100 border-slate-300 text-slate-700'
                        : t === 'Tier 1' ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : t === 'Tier 2' ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : t === 'Tier 3' ? 'bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-slate-50 border-slate-300 text-slate-600'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {t ? tierLabel(t) : `Sin ${L.nivel.toLowerCase()}`}
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
