import React, { useState, useMemo } from 'react'
import {
  Search, X, Plus, Trash2,
  FileText, Pencil, Inbox, Users, ClipboardList, Check, ArrowRight,
} from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, BoulemaPeticion, BoulemaPlayer } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { ConfirmModal } from '../components/ConfirmModal'
import { Badge, Button, ClickableRow, Dialog, Field, IconButton, Input, SectionTabs, Select, Textarea } from '../components/ui'
import { L } from '../lib/labels'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useDebounce } from '../hooks/useDebounce'
import * as db from '../lib/db'

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info') => void

// ── Constantes (compartidas con Captación) ───────────────────

const POSITIONS_SCOUTING = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

const MONTHS_ES_FULL = [
  { v: '1', l: 'Enero' }, { v: '2', l: 'Febrero' }, { v: '3', l: 'Marzo' },
  { v: '4', l: 'Abril' }, { v: '5', l: 'Mayo' }, { v: '6', l: 'Junio' },
  { v: '7', l: 'Julio' }, { v: '8', l: 'Agosto' }, { v: '9', l: 'Septiembre' },
  { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' }, { v: '12', l: 'Diciembre' },
]

const BOULEMA_CONCLUSION_OPTIONS = [
  '', 'Firmar', 'Seguir', 'Descartar', 'Más video, prioritario', 'Más video, no prioritario',
] as const
type BoulemaConclusionOption = typeof BOULEMA_CONCLUSION_OPTIONS[number]

const BOULEMA_CONCLUSION_STYLE: Record<string, string> = {
  'Firmar':                  'bg-green-100 text-green-700 border border-green-200',
  'Seguir':                  'bg-blue-100 text-blue-700 border border-blue-200',
  'Descartar':               'bg-red-100 text-red-600 border border-red-200',
  'Más video, prioritario':  'bg-orange-100 text-orange-700 border border-orange-200',
  'Más video, no prioritario': 'bg-slate-100 text-slate-600 border border-slate-200',
}

// ── Helpers ─────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeDate(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  if (days < 30) return `hace ${Math.floor(days / 7)}sem`
  return ''
}

function personaToName(persona: string | undefined, profiles: Profile[]): string {
  if (!persona) return '—'
  const p = profiles.find(pr => pr.avatar === persona)
  return p ? p.name : persona
}


// ── Chips de filtros activos ─────────────────────────────────
type FilterChip = { key: string; label: string; onRemove: () => void }
function ActiveFilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(c => (
        <span key={c.key} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5 text-badge font-medium">
          {c.label}
          <IconButton label={`Quitar filtro ${c.label}`} onClick={c.onRemove} className="min-h-0 min-w-0 h-5 w-5 sm:h-5 sm:w-5 hover:bg-blue-100 [&>svg]:w-3 [&>svg]:h-3">
            <X />
          </IconButton>
        </span>
      ))}
      <Button variant="link" size="sm" onClick={onClearAll} className="ml-1">
        Limpiar todo
      </Button>
    </div>
  )
}

// ── AddBoulemaModal ───────────────────────────────────────────

function AddBoulemaModal({
  profiles,
  currentProfile,
  boulemaPeticiones,
  initial,
  onClose,
  onSave,
}: {
  profiles: Profile[]
  currentProfile: Profile
  boulemaPeticiones: BoulemaPeticion[]
  initial?: BoulemaPeticion
  onClose: () => void
  onSave: (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [playerName, setPlayerName] = useState(initial?.playerName ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [birthMonth, setBirthMonth] = useState(initial?.birthMonth ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [offeredBy, setOfferedBy] = useState(initial?.offeredBy ?? '')
  const [requestedFrom, setRequestedFrom] = useState<string[]>(
    initial?.requestedFrom.length ? initial.requestedFrom : [currentProfile.avatar]
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function toggleAssignee(avatar: string) {
    setRequestedFrom(prev =>
      prev.includes(avatar) ? prev.filter(a => a !== avatar) : [...prev, avatar]
    )
  }

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = initial
    ? (playerName !== initial.playerName || notes !== (initial.notes ?? '') || team !== (initial.team ?? ''))
    : !!(playerName.trim() || notes.trim() || team.trim())

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!playerName.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        playerName: playerName.trim(),
        position: position.trim() || undefined,
        birthYear: birthYear.trim() || undefined,
        birthMonth: birthMonth.trim() || undefined,
        team: team.trim() || undefined,
        country: country.trim() || undefined,
        nationality: nationality.trim() || undefined,
        offeredBy: offeredBy.trim() || undefined,
        requestedFrom: requestedFrom.length ? requestedFrom : [currentProfile.avatar],
        notes: notes.trim() || undefined,
        requestedBy: currentProfile.avatar,
        reportIds: initial?.reportIds ?? [],
      })
    } catch {
      setError('Error al guardar la petición. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={initial ? 'Editar petición' : 'Añadir petición de informe'}
      onSubmit={handleSubmit}
      dirty={dirty}
      historyKey="boulema-peticion"
      footer={<>
        {error && <p className="text-secondary text-red-600 w-full" role="alert">{error}</p>}
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!playerName.trim()} loading={saving}>
          {initial ? 'Guardar cambios' : 'Añadir petición'}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <Field label={L.jugador} required>
          <Input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Nombre del jugador"
            required
            autoFocus
          />
        </Field>

        <Field label="Posición">
          <Select value={position} onChange={e => setPosition(e.target.value)}>
            <option value="">—</option>
            {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Año nac.">
            <Input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2007" maxLength={4} />
          </Field>
          <Field label="Mes nac.">
            <Select value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
              <option value="">—</option>
              {MONTHS_ES_FULL.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Equipo">
          <Input value={team} onChange={e => setTeam(e.target.value)} placeholder="Club actual" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="País (donde juega)">
            <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Senegal" />
          </Field>
          <Field label="Nacionalidad">
            <Input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="Senegalesa" />
          </Field>
        </div>

        <Field label="Ofrecido por">
          <Input
            value={offeredBy}
            onChange={e => setOfferedBy(e.target.value)}
            placeholder="Agente, intermediario..."
            list="offeredby-suggestions"
          />
        </Field>
        <datalist id="offeredby-suggestions">
          {boulemaPeticiones
            .map(p => p.offeredBy)
            .filter((v): v is string => !!v)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map(v => <option key={v} value={v} />)}
        </datalist>

        <Field label="Pedir informe a" error={requestedFrom.length === 0 ? 'Selecciona al menos una persona' : undefined}>
          {() => (
            <div className="flex flex-wrap gap-2 pt-0.5" role="group" aria-label="Pedir informe a">
              {profiles.map(p => {
                const selected = requestedFrom.includes(p.avatar)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleAssignee(p.avatar)}
                    className={`flex items-center gap-1.5 px-2.5 min-h-9 sm:min-h-8 rounded-lg border text-secondary transition-colors ${
                      selected
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <span className="font-mono font-bold">{p.avatar}</span>
                    <span>{p.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        <Field label="Notas / contexto">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Información adicional sobre el jugador o contexto de la petición..."
            rows={3}
          />
        </Field>
      </div>
    </Dialog>
  )
}

// ── RespondWithInformeModal ───────────────────────────────────

function RespondWithInformeModal({
  peticion,
  profiles,
  currentProfile,
  scoutingPlayers,
  boulemaPeticiones,
  onClose,
  onAddPlayer,
  onAddReport,
  onLinkReport,
  showToast,
}: {
  peticion: BoulemaPeticion
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  onClose: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  onLinkReport: (peticionId: string, reportId: string) => Promise<void>
  showToast?: ShowToast
}) {
  // Try to find existing player by name match
  const existingPlayer = scoutingPlayers.find(
    p => p.fullName.toLowerCase().trim() === peticion.playerName.toLowerCase().trim()
  )

  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [conclusion, setConclusion] = useState<BoulemaConclusionOption>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim() || saving) return
    // Verificar que la petición sigue existiendo (estado no obsoleto)
    if (!boulemaPeticiones.some(p => p.id === peticion.id)) {
      showToast?.('La petición ya no existe', 'error')
      onClose()
      return
    }
    setSaving(true)
    setError('')
    try {
      let playerId = existingPlayer?.id ?? ''

      if (!playerId) {
        // Create a new ScoutingPlayer with the peticion data
        const birthdate = peticion.birthYear
          ? `${peticion.birthYear}-${String(peticion.birthMonth ?? '01').padStart(2, '0')}-01`
          : undefined
        const newPlayer = await db.createScoutingPlayer({
          fullName: peticion.playerName,
          position1: peticion.position ?? undefined,
          birthdate,
          team: peticion.team ?? undefined,
        })
        playerId = newPlayer.id
        onAddPlayer(newPlayer)
      }

      const report = await db.createScoutingReport({
        playerId,
        fecha: new Date().toISOString().slice(0, 10),
        titulo: title.trim() || undefined,
        texto: text.trim(),
        conclusion: conclusion || undefined,
        persona: currentProfile.avatar,
      })
      onAddReport(report)
      // Link this report back to the petición
      await onLinkReport(peticion.id, report.id)
      showToast?.('Informe guardado')
      onClose()
    } catch {
      setError('Error al guardar el informe. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const authorName = personaToName(peticion.requestedBy, profiles)

  return (
    <Dialog
      open
      onClose={onClose}
      title="Crear informe"
      onSubmit={handleSubmit}
      dirty={!!(text.trim() || title.trim())}
      historyKey="boulema-informe"
      footer={<>
        {error && <p className="text-secondary text-red-600 w-full" role="alert">{error}</p>}
        <Button onClick={onClose} className="mr-auto">{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!text.trim()} loading={saving}>Guardar informe</Button>
      </>}
    >
      {/* Context banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-secondary mb-3">
        <div className="font-semibold text-blue-800 mb-0.5">
          {peticion.playerName}
          {peticion.position && <span className="font-normal text-blue-700 ml-1.5">· {peticion.position}</span>}
          {peticion.birthYear && <span className="font-normal text-blue-600 ml-1.5">{peticion.birthYear}</span>}
          {peticion.team && <span className="font-normal text-blue-600 ml-1.5 italic">{peticion.team}</span>}
        </div>
        <div className="text-blue-600">
          Pedido por <span className="font-mono font-semibold">{peticion.requestedBy}</span>
          {authorName && authorName !== peticion.requestedBy && ` · ${authorName.split(' ')[0]}`}
        </div>
        {existingPlayer ? (
          <div className="mt-1 text-meta text-blue-600 inline-flex items-center gap-1"><Check className="w-3 h-3" aria-hidden="true" /> Jugador encontrado en la base de datos</div>
        ) : (
          <div className="mt-1 text-meta text-blue-600">Se creará un nuevo jugador en captación</div>
        )}
      </div>

      <div className="space-y-3">
        <Field label="Título (opcional)">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del informe" />
        </Field>

        <Field label={L.informe} required hint="Ctrl+Enter o ⌘+Enter guarda">
          {p => (
            <>
              {!text.trim() && (
                <Button
                  variant="link"
                  size="sm"
                  icon={<ClipboardList />}
                  onClick={() => setText('FÍSICO:\n\nTÉCNICA:\n\nTÁCTICA:\n\nMENTALIDAD:\n\nCONTEXTO (equipo, rol, rival):\n\nCONCLUSIÓN:\n')}
                  className="self-start"
                >
                  Usar plantilla
                </Button>
              )}
              <Textarea
                {...p}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Escribe aquí tu informe sobre el jugador..."
                rows={6}
                required
                autoFocus
              />
            </>
          )}
        </Field>

        <Field label={L.veredicto}>
          <Select value={conclusion} onChange={e => setConclusion(e.target.value as BoulemaConclusionOption)}>
            <option value="">Sin veredicto</option>
            {BOULEMA_CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  )
}

// ── Modal de jugador de Boulema (mantenimiento light) ────────
function BoulemaPlayerModal({ profiles, initial, onClose, onSave, promote }: {
  profiles: Profile[]
  initial?: BoulemaPlayer
  onClose: () => void
  onSave: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  /** Pasar el jugador a Captación (solo en edición) */
  promote?: { exists: boolean; run: () => Promise<void> }
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [contacto, setContacto] = useState(initial?.contacto ?? '')
  const [manager, setManager] = useState(initial?.manager ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const canSave = fullName.trim().length >= 2 && !saving
  const dirty = initial
    ? (fullName !== initial.fullName || notes !== (initial.notes ?? '') || contacto !== (initial.contacto ?? '') || team !== (initial.team ?? ''))
    : !!(fullName.trim() || notes.trim())

  const save = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        fullName: fullName.trim(),
        birthYear: birthYear.trim() || undefined,
        position: position || undefined,
        team: team.trim() || undefined,
        country: country.trim() || undefined,
        nationality: nationality.trim() || undefined,
        contacto: contacto.trim() || undefined,
        manager: manager || undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={initial ? 'Editar jugador' : 'Añadir jugador de Boulema'}
      onSubmit={save}
      dirty={dirty}
      historyKey="boulema-jugador"
      footer={<>
        {promote && (
          promote.exists ? (
            <span className="text-secondary text-green-700 font-medium inline-flex items-center gap-1 mr-auto"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Ya en {L.captacion}</span>
          ) : (
            <Button
              size="sm"
              icon={<ArrowRight />}
              onClick={() => void promote.run()}
              className="mr-auto border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              title="Crea su ficha en Captación (scouting) con estos datos"
            >
              Pasar a {L.captacion}
            </Button>
          )
        )}
        <Button onClick={onClose} className={promote ? '' : 'mr-auto'}>{L.cancelar}</Button>
        <Button type="submit" variant="primary" disabled={!canSave} loading={saving}>
          {initial ? L.guardar : 'Añadir'}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Nombre" required>
          <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre del jugador" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Año nac.">
            <Input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2008" />
          </Field>
          <Field label="Posición">
            <Select value={position} onChange={e => setPosition(e.target.value)}>
              <option value="">—</option>
              {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label={L.club}>
            <Input value={team} onChange={e => setTeam(e.target.value)} />
          </Field>
          <Field label="País (donde juega)">
            <Input value={country} onChange={e => setCountry(e.target.value)} />
          </Field>
          <Field label="Nacionalidad">
            <Input value={nationality} onChange={e => setNationality(e.target.value)} />
          </Field>
          <Field label={L.encargado}>
            <Select value={manager} onChange={e => setManager(e.target.value)}>
              <option value="">{L.sinEncargado}</option>
              {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name.split(' ')[0]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Contacto">
          <Input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Teléfono, persona…" />
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </Field>
      </div>
    </Dialog>
  )
}

// ── Vista principal ──────────────────────────────────────────

interface Props {
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  boulemaPeticiones: BoulemaPeticion[]
  onAddBoulemaPeticion: (p: Omit<BoulemaPeticion, 'id' | 'createdAt'>) => Promise<void>
  onUpdateBoulemaPeticion: (p: BoulemaPeticion) => Promise<void>
  onDeleteBoulemaPeticion: (id: string) => Promise<void>
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  boulemaPlayers: BoulemaPlayer[]
  onAddBoulemaPlayer: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateBoulemaPlayer: (p: BoulemaPlayer) => Promise<void>
  onDeleteBoulemaPlayer: (id: string) => Promise<void>
  onOpenScoutingPlayer: (id: string) => void
  /** Sub-pestaña controlada desde fuera (App la sincroniza con #/boulema/sub) */
  tab?: BoulemaTabId
  onTabChange?: (tab: BoulemaTabId) => void
}

export type BoulemaTabId = 'peticiones' | 'mantenimiento'
const BOU_TABS: readonly BoulemaTabId[] = ['peticiones', 'mantenimiento']

export function Boulema({
  profiles,
  currentProfile,
  scoutingPlayers,
  scoutingReports,
  boulemaPeticiones,
  onAddBoulemaPeticion,
  onUpdateBoulemaPeticion,
  onDeleteBoulemaPeticion,
  onAddPlayer,
  onAddReport,
  boulemaPlayers,
  onAddBoulemaPlayer,
  onUpdateBoulemaPlayer,
  onDeleteBoulemaPlayer,
  onOpenScoutingPlayer,
  tab: tabProp,
  onTabChange,
}: Props) {
  const { toasts, showToast, dismissToast } = useToast()
  // Antes se pintaban SIEMPRE las dos versiones de la lista (la tabla de
  // escritorio y la lista de móvil) y una se escondía con CSS. Ahora se
  // decide aquí y solo se construye la que se ve.
  const esAncha = useIsDesktop(640)

  // ── estado local ──
  // ── pestañas de la sección ──
  // Si App pasa `tab` manda la prop; si no, estado interno.
  const [bouTabInterno, setBouTabInterno] = useState<BoulemaTabId>('peticiones')
  const bouTab: BoulemaTabId = tabProp && BOU_TABS.includes(tabProp) ? tabProp : bouTabInterno
  const setBouTab = (t: BoulemaTabId) => { setBouTabInterno(t); onTabChange?.(t) }

  // ── mantenimiento light ──
  const [mantSearch, setMantSearch] = useState('')
  const [showAddMantPlayer, setShowAddMantPlayer] = useState(false)
  const [editingMantPlayer, setEditingMantPlayer] = useState<BoulemaPlayer | null>(null)
  const [confirmDeleteMantId, setConfirmDeleteMantId] = useState<string | null>(null)

  // (movido desde Captacion.tsx)
  const [showAddBoulema, setShowAddBoulema] = useState(false)
  const [editingPeticion, setEditingPeticion] = useState<BoulemaPeticion | null>(null)
  const [respondingPeticion, setRespondingPeticion] = useState<BoulemaPeticion | null>(null)
  const [confirmDeletePeticion, setConfirmDeletePeticion] = useState<string | null>(null)
  const [bouSearch, setBouSearch] = useState('')
  const bouSearchDeb = useDebounce(bouSearch)
  const [bouPosFilter, setBouPosFilter] = useState('all')
  const [bouYearFilter, setBouYearFilter] = useState('all')
  const [bouOfferedFilter, setBouOfferedFilter] = useState('all')
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set())

  // Índices para la lista de peticiones: antes cada tarjeta hacía varios `find`/`filter`
  // lineales sobre todos los informes y jugadores en cada render.
  const reportById = useMemo(() => new Map(scoutingReports.map(r => [r.id, r])), [scoutingReports])
  const playerByName = useMemo(
    () => new Map(scoutingPlayers.map(sp => [sp.fullName.trim().toLowerCase(), sp])),
    [scoutingPlayers]
  )
  const reportsByPlayer = useMemo(() => {
    const m = new Map<string, ScoutingReport[]>()
    for (const r of scoutingReports) {
      const l = m.get(r.playerId)
      if (l) l.push(r); else m.set(r.playerId, [r])
    }
    return m
  }, [scoutingReports])

  function toggleNotes(id: string) {
    setExpandedNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }


  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      {/* Sub-pestañas de Boulema (la barra superior y el nivel 1 los pinta AppShell) */}
      <div className="sticky top-[var(--shell-h)] z-20 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6">
          <SectionTabs<BoulemaTabId>
            variant="secondary"
            label="Secciones de Boulema"
            value={bouTab}
            onChange={setBouTab}
            items={[
              { id: 'peticiones', label: L.peticiones, icon: <Inbox /> },
              { id: 'mantenimiento', label: L.mantenimiento, icon: <Users />, count: boulemaPlayers.length },
            ]}
            className="bg-white"
          />
        </div>
      </div>

      {bouTab === 'peticiones' && (() => {

        // Derived filter values
        const bouAllYears = [...new Set(boulemaPeticiones.map(p => p.birthYear).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))
        const bouAllPositions = [...new Set(boulemaPeticiones.map(p => p.position).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))
        const bouAllOfferedBy = [...new Set(boulemaPeticiones.map(p => p.offeredBy).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es'))

        const filteredPeticiones = boulemaPeticiones
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .filter(p => {
            if (bouPosFilter !== 'all' && p.position !== bouPosFilter) return false
            if (bouYearFilter !== 'all' && p.birthYear !== bouYearFilter) return false
            if (bouOfferedFilter !== 'all' && p.offeredBy !== bouOfferedFilter) return false
            if (bouSearchDeb.trim()) {
              const q = bouSearchDeb.toLowerCase()
              if (
                !p.playerName.toLowerCase().includes(q) &&
                !(p.team?.toLowerCase().includes(q)) &&
                !(p.offeredBy?.toLowerCase().includes(q)) &&
                !(p.notes?.toLowerCase().includes(q))
              ) return false
            }
            return true
          })

        return (
          <div className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-6 py-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-slate-500" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-800">{L.peticiones}</h2>
                <Badge>
                  {filteredPeticiones.length}{filteredPeticiones.length !== boulemaPeticiones.length ? `/${boulemaPeticiones.length}` : ''}
                </Badge>
              </div>
              <Button variant="primary" icon={<Plus />} onClick={() => setShowAddBoulema(true)}>
                Añadir petición
              </Button>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
                <Input
                  value={bouSearch}
                  onChange={e => setBouSearch(e.target.value)}
                  placeholder="Buscar jugador, club, ofrecido por..."
                  aria-label="Buscar petición"
                  className="pl-8 pr-9 py-1.5"
                />
                {bouSearch && (
                  <IconButton label="Limpiar búsqueda" onClick={() => setBouSearch('')} className="absolute right-0.5 top-1/2 -translate-y-1/2">
                    <X />
                  </IconButton>
                )}
              </div>

              {/* Position filter */}
              {bouAllPositions.length > 0 && (
                <Select
                  value={bouPosFilter}
                  onChange={e => setBouPosFilter(e.target.value)}
                  aria-label="Filtrar por posición"
                  className="w-auto py-1 text-secondary font-medium"
                >
                  <option value="all">Posición</option>
                  {bouAllPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              )}

              {/* Year filter */}
              {bouAllYears.length > 0 && (
                <Select
                  value={bouYearFilter}
                  onChange={e => setBouYearFilter(e.target.value)}
                  aria-label="Filtrar por año de nacimiento"
                  className="w-auto py-1 text-secondary font-medium"
                >
                  <option value="all">Año nac.</option>
                  {bouAllYears.map(y => <option key={y} value={y}>{y}</option>)}
                </Select>
              )}

              {/* Offered by filter */}
              {bouAllOfferedBy.length > 0 && (
                <Select
                  value={bouOfferedFilter}
                  onChange={e => setBouOfferedFilter(e.target.value)}
                  aria-label="Filtrar por ofrecido por"
                  className="w-auto py-1 text-secondary font-medium"
                >
                  <option value="all">Ofrecido por</option>
                  {bouAllOfferedBy.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              )}

            </div>

            {/* Chips de filtros activos (boulema) */}
            {(() => {
              const chips: FilterChip[] = []
              if (bouSearch.trim()) chips.push({ key: 'search', label: `Búsqueda: "${bouSearch.trim()}"`, onRemove: () => setBouSearch('') })
              if (bouPosFilter !== 'all') chips.push({ key: 'pos', label: `Posición: ${bouPosFilter}`, onRemove: () => setBouPosFilter('all') })
              if (bouYearFilter !== 'all') chips.push({ key: 'year', label: `Año: ${bouYearFilter}`, onRemove: () => setBouYearFilter('all') })
              if (bouOfferedFilter !== 'all') chips.push({ key: 'offered', label: `Ofrecido por: ${bouOfferedFilter}`, onRemove: () => setBouOfferedFilter('all') })
              if (chips.length === 0) return null
              return (
                <ActiveFilterChips
                  chips={chips}
                  onClearAll={() => { setBouSearch(''); setBouPosFilter('all'); setBouYearFilter('all'); setBouOfferedFilter('all') }}
                />
              )
            })()}


            {/* Peticiones list */}
            <div className="space-y-2">
              {boulemaPeticiones.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                  <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  <p className="text-body text-slate-600 font-medium">Sin peticiones de informe</p>
                  <p className="text-secondary text-slate-500 mt-1">Añade una petición para pedir un informe sobre un jugador</p>
                </div>
              ) : filteredPeticiones.length === 0 ? (
                <p className="text-secondary text-slate-500 text-center py-8">Sin resultados con los filtros actuales</p>
              ) : (
                filteredPeticiones.map(p => {
                  const requesterProfile = profiles.find(pr => pr.avatar === p.requestedBy)
                  const rel = relativeDate(p.createdAt)
                  // Reports explicitly linked via reportIds
                  const explicitLinkedReports = p.reportIds
                    .map(id => reportById.get(id))
                    .filter((r): r is NonNullable<typeof r> => !!r)
                  // Auto-detect: find any report for the same player (by name) written by someone in requestedFrom
                  const matchingScoutPlayer = playerByName.get(p.playerName.trim().toLowerCase())
                  const autoDetectedReports = matchingScoutPlayer
                    ? (reportsByPlayer.get(matchingScoutPlayer.id) ?? []).filter(r =>
                        r.persona != null && p.requestedFrom.includes(r.persona) &&
                        !explicitLinkedReports.some(lr => lr.id === r.id)
                      )
                    : []
                  const linkedReports = [...explicitLinkedReports, ...autoDetectedReports]
                  const allDone = linkedReports.length > 0 && p.requestedFrom.every(
                    av => linkedReports.some(r => r.persona === av)
                  )
                  const monthLabel = p.birthMonth ? MONTHS_ES_FULL.find(m => m.v === p.birthMonth)?.l?.slice(0, 3) : undefined
                  const notesFirstLine = p.notes?.split('\n')[0] ?? ''
                  const notesHasMore = (p.notes?.split('\n').length ?? 0) > 1 || (p.notes?.length ?? 0) > notesFirstLine.length
                  const notesExpanded = expandedNoteIds.has(p.id)
                  const currentUserDone = linkedReports.some(r => r.persona === currentProfile.avatar)

                  return (
                    <div
                      key={p.id}
                      className={`bg-white border rounded-xl px-4 py-3 transition-colors ${allDone ? 'border-green-200 bg-green-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Player name + chips: NOMBRE / POSICIÓN / FECHA / CLUB / PAÍS / NACIONALIDAD */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-semibold text-slate-800 text-body">{p.playerName}</span>
                            {p.position && (
                              <Badge pill={false}>{p.position}</Badge>
                            )}
                            {(p.birthYear || monthLabel) && (
                              <span className="text-badge text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                                {[monthLabel, p.birthYear].filter(Boolean).join('/')}
                              </span>
                            )}
                            {p.team && (
                              <span className="text-secondary text-slate-600 italic">{p.team}</span>
                            )}
                            {p.country && (
                              <span className="text-secondary text-slate-600 italic">{p.country}</span>
                            )}
                            {p.nationality && (
                              <span className="text-badge text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">{p.nationality}</span>
                            )}
                          </div>

                          {/* Offered by */}
                          {p.offeredBy && (
                            <div className="text-secondary text-slate-600 mb-1">
                              <span className="text-slate-500">Ofrecido por</span>{' '}
                              <span className="font-medium text-slate-700">{p.offeredBy}</span>
                            </div>
                          )}

                          {/* Assignment — multi-destinatario */}
                          <div className="flex flex-wrap items-center gap-1.5 text-secondary text-slate-600 mb-1">
                            <span className="text-slate-500">Pedido por</span>
                            <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.requestedBy}
                              {requesterProfile && (
                                <span className="font-sans font-normal ml-1 text-slate-500">· {requesterProfile.name.split(' ')[0]}</span>
                              )}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-500" aria-hidden="true" />
                            {p.requestedFrom.map(av => {
                              const pr = profiles.find(x => x.avatar === av)
                              const done = linkedReports.some(r => r.persona === av)
                              return (
                                <span key={av} className={`font-mono font-semibold px-1.5 py-0.5 rounded border text-badge ${
                                  done
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                }`}>
                                  {av}
                                  {pr && <span className="font-sans font-normal ml-1 opacity-70">· {pr.name.split(' ')[0]}</span>}
                                  {done && <Check className="w-3 h-3 inline ml-1" aria-label="Informe hecho" />}
                                </span>
                              )
                            })}
                          </div>

                          {/* Notes — truncadas con "ver más" inline */}
                          {p.notes && (
                            <div className="mb-1.5 text-secondary text-slate-600 leading-relaxed">
                              {notesExpanded ? (
                                <span className="whitespace-pre-wrap">{p.notes}{' '}
                                  <button type="button" onClick={() => toggleNotes(p.id)} aria-expanded="true" className="text-primary hover:underline whitespace-nowrap">ver menos</button>
                                </span>
                              ) : (
                                <span>
                                  {notesFirstLine}
                                  {notesHasMore && (
                                    <>{' '}<button type="button" onClick={() => toggleNotes(p.id)} aria-expanded="false" className="text-primary hover:underline whitespace-nowrap">ver más</button></>
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Informes acumulados + botón crear */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {linkedReports.map(report => {
                              const reportDate = report.createdAt
                                ? new Date(report.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                                : ''
                              return (
                                <button
                                  key={report.id}
                                  type="button"
                                  onClick={() => onOpenScoutingPlayer(report.playerId)}
                                  title="Abrir informe en Captación"
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-9 sm:min-h-8 text-secondary font-medium bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 transition-colors"
                                >
                                  <FileText className="w-3 h-3" aria-hidden="true" />
                                  <span className="font-mono font-bold">{report.persona ?? '?'}</span>
                                  {reportDate && <span className="text-green-700 opacity-80">{reportDate}</span>}
                                  {report.conclusion && (
                                    <span className={`ml-0.5 px-1.5 py-0.5 rounded text-badge ${BOULEMA_CONCLUSION_STYLE[report.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>
                                      {report.conclusion}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                            {!currentUserDone && (
                              <Button size="sm" variant="primary" icon={<FileText />} onClick={() => setRespondingPeticion(p)}>
                                Crear informe
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Right: date + actions */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {rel && (
                            <span className={`text-badge font-semibold px-1.5 py-0.5 rounded-full ${
                              rel === 'hoy' ? 'bg-green-100 text-green-700' :
                              rel === 'ayer' ? 'bg-blue-50 text-blue-600' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {rel}
                            </span>
                          )}
                          <div className="text-meta text-slate-500">{fmtDate(p.createdAt)}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <IconButton label="Editar petición" onClick={() => setEditingPeticion(p)}>
                              <Pencil />
                            </IconButton>
                            <IconButton label="Eliminar petición" onClick={() => setConfirmDeletePeticion(p.id)} className="hover:text-red-600 hover:bg-red-50">
                              <Trash2 />
                            </IconButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })()}

      {/* ── MANTENIMIENTO (light) ── */}
      {bouTab === 'mantenimiento' && (() => {
        const q = mantSearch.toLowerCase().trim()
        const filtered = boulemaPlayers.filter(p =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          (p.team?.toLowerCase().includes(q)) ||
          (p.country?.toLowerCase().includes(q))
        )
        return (
          <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-500" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-800">{L.mantenimiento}</h2>
                <Badge>{filtered.length}</Badge>
              </div>
              <Button variant="primary" icon={<Plus />} onClick={() => setShowAddMantPlayer(true)}>
                Añadir jugador
              </Button>
            </div>

            {boulemaPlayers.length > 0 && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
                <Input
                  value={mantSearch}
                  onChange={e => setMantSearch(e.target.value)}
                  placeholder="Buscar jugador, club, país..."
                  aria-label="Buscar jugador"
                  className="pl-8 py-1.5"
                />
              </div>
            )}

            {boulemaPlayers.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                <p className="text-body text-slate-600 font-medium">Aún no hay jugadores de Boulema</p>
                <p className="text-secondary text-slate-500 mt-1">Versión light del mantenimiento: nombre, club, país, contacto y notas</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-secondary text-slate-500 text-center py-8">Sin resultados con la búsqueda</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Escritorio: tabla */}
                {esAncha && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {[L.jugador, 'Año', 'Posición', L.club, 'País', L.encargado, 'Notas', ''].map((h, i) => (
                          <th key={i} className="text-left px-3 py-2 text-meta font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">{h || <span className="sr-only">Acciones</span>}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map(p => (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          role="button"
                          onClick={() => setEditingMantPlayer(p)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingMantPlayer(p) } }}
                          className="cursor-pointer hover:bg-slate-50/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">{p.fullName}</td>
                          <td className="px-3 py-2 text-slate-600 tabular-nums">{p.birthYear ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.position ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.team ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.country ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 font-mono text-secondary">{p.manager ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 text-secondary max-w-[220px] truncate">{p.notes ?? ''}</td>
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            <IconButton label={`Eliminar a ${p.fullName}`} onClick={() => setConfirmDeleteMantId(p.id)} className="hover:text-red-600 hover:bg-red-50">
                              <Trash2 />
                            </IconButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                {/* Móvil: lista */}
                {!esAncha && (
                <div className="divide-y divide-slate-100">
                  {filtered.map(p => (
                    <ClickableRow key={p.id} onClick={() => setEditingMantPlayer(p)} className="rounded-none px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-semibold text-slate-800 truncate">{p.fullName}</span>
                          <span className="block text-meta text-slate-500 truncate">
                            {[p.team, p.birthYear, p.country].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        {p.manager && <span className="flex-shrink-0 text-badge font-mono font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5" title={L.encargado}>{p.manager}</span>}
                      </div>
                    </ClickableRow>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Modales de jugador de Boulema */}
      {showAddMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          onClose={() => setShowAddMantPlayer(false)}
          onSave={async (p) => {
            try { await onAddBoulemaPlayer(p); setShowAddMantPlayer(false); showToast('Jugador añadido') }
            catch { showToast('No se pudo crear (¿has ejecutado la migración SQL?)', 'error') }
          }}
        />
      )}
      {editingMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          initial={editingMantPlayer}
          promote={{
            exists: scoutingPlayers.some(sp => sp.fullName.toLowerCase().trim() === editingMantPlayer.fullName.toLowerCase().trim()),
            run: async () => {
              try {
                const saved = await db.createScoutingPlayer({
                  fullName: editingMantPlayer.fullName,
                  birthdate: editingMantPlayer.birthYear ? `${editingMantPlayer.birthYear}-02-28` : undefined,
                  position1: editingMantPlayer.position,
                  team: editingMantPlayer.team,
                  nationality: editingMantPlayer.nationality,
                  comentarios: editingMantPlayer.notes ? `Origen Boulema · ${editingMantPlayer.notes}` : 'Origen: Boulema',
                })
                onAddPlayer(saved)
                setEditingMantPlayer(null)
                showToast(`${editingMantPlayer.fullName} creado en Captación`)
              } catch {
                showToast('No se pudo crear en Captación', 'error')
              }
            },
          }}
          onClose={() => setEditingMantPlayer(null)}
          onSave={async (p) => {
            try { await onUpdateBoulemaPlayer({ ...editingMantPlayer, ...p }); setEditingMantPlayer(null); showToast('Jugador actualizado') }
            catch { showToast('No se pudo guardar', 'error') }
          }}
        />
      )}

      {/* AddBoulemaModal — nueva petición */}
      {showAddBoulema && (
        <AddBoulemaModal
          profiles={profiles}
          currentProfile={currentProfile}
          boulemaPeticiones={boulemaPeticiones}
          onClose={() => setShowAddBoulema(false)}
          onSave={async (peticion) => {
            await onAddBoulemaPeticion(peticion)
            setShowAddBoulema(false)
            showToast('Petición añadida')
          }}
        />
      )}

      {/* EditBoulemaModal — editar petición existente */}
      {editingPeticion && (
        <AddBoulemaModal
          profiles={profiles}
          currentProfile={currentProfile}
          boulemaPeticiones={boulemaPeticiones}
          initial={editingPeticion}
          onClose={() => setEditingPeticion(null)}
          onSave={async (updated) => {
            await onUpdateBoulemaPeticion({ ...editingPeticion, ...updated })
            setEditingPeticion(null)
            showToast('Petición actualizada')
          }}
        />
      )}

      {/* RespondWithInformeModal — crear informe desde petición */}
      {respondingPeticion && (
        <RespondWithInformeModal
          peticion={respondingPeticion}
          profiles={profiles}
          currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers}
          boulemaPeticiones={boulemaPeticiones}
          showToast={showToast}
          onClose={() => setRespondingPeticion(null)}
          onAddPlayer={onAddPlayer}
          onAddReport={onAddReport}
          onLinkReport={async (peticionId, reportId) => {
            const peticion = boulemaPeticiones.find(x => x.id === peticionId)
            if (peticion) await onUpdateBoulemaPeticion({
              ...peticion,
              reportIds: [...peticion.reportIds.filter(id => id !== reportId), reportId],
            })
          }}
        />
      )}

      {/* Confirmaciones de borrado */}
      <ConfirmModal
        open={!!confirmDeletePeticion}
        title="¿Eliminar esta petición?"
        message="Esta acción no se puede deshacer."
        confirmLabel={L.eliminar}
        onConfirm={async () => {
          if (!confirmDeletePeticion) return
          try {
            await onDeleteBoulemaPeticion(confirmDeletePeticion)
            showToast('Petición eliminada')
          } catch {
            showToast('Error al eliminar la petición', 'error')
          } finally {
            setConfirmDeletePeticion(null)
          }
        }}
        onCancel={() => setConfirmDeletePeticion(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteMantId}
        title={`¿Eliminar a ${boulemaPlayers.find(p => p.id === confirmDeleteMantId)?.fullName ?? 'este jugador'}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel={L.eliminar}
        onConfirm={async () => {
          if (!confirmDeleteMantId) return
          try {
            await onDeleteBoulemaPlayer(confirmDeleteMantId)
            showToast('Jugador eliminado')
          } catch {
            showToast('No se pudo eliminar', 'error')
          } finally {
            setConfirmDeleteMantId(null)
          }
        }}
        onCancel={() => setConfirmDeleteMantId(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
