import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { X, Trash2, Pencil, Send, ExternalLink, Check } from 'lucide-react'
import { Sheet, Button, IconButton, Input, Textarea, Select } from '../../../components/ui'
import { useBeforeUnload } from '../../../hooks/useBeforeUnload'
import { L } from '../../../lib/labels'
import type { Player, ScoutingPlayer, ScoutingReport, FirmasEntry, FirmasStatus, FirmasComment } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { ZONAS_PIPELINE as FIRMAS_ZONE_ORDER } from '../../../lib/zonas'
import { equipoMatchKind } from '../../../lib/equipos'
import { norm as normSearch } from '../../../lib/texto'
import { type ShowToast, type PatchFirmasEntry, fmtDate, todayISO, relativeDate, scoutColor } from '../helpers'
import { FirmasStatusChip, FirmasLinkSearch } from './comun'
import { FIRMAS_KIND_META, FIRMAS_ACTION_KIND_META, firmasAging } from './helpers'
// ── Panel de detalle de una entrada del pipeline ─────────────
// Sheet: media pantalla en escritorio (dos columnas: datos | historial),
// hoja a pantalla completa en móvil con pestañas Datos/Historial.
export function FirmasDetailPanel({
  entry, profiles, currentProfile, scoutingPlayers, spById, reportsByPlayer,
  players, onCreatePlayer, showToast,
  zones, onClose, onPatch, onChangeStatus, onOpenScoutingPlayer, onRequestDelete,
}: {
  entry: FirmasEntry
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  spById: Record<string, ScoutingPlayer>
  reportsByPlayer: Record<string, ScoutingReport[]>
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  showToast: ShowToast
  zones: string[]
  onClose: () => void
  onPatch: PatchFirmasEntry
  onChangeStatus: (e: FirmasEntry, s: FirmasStatus) => void
  onOpenScoutingPlayer: (id: string) => void
  onRequestDelete: () => void
}) {
  const isAdmin = currentProfile.is_admin
  const sp = entry.scoutingPlayerId ? spById[entry.scoutingPlayerId] : undefined
  const spReports = entry.scoutingPlayerId ? (reportsByPlayer[entry.scoutingPlayerId] ?? []) : []
  const aging = firmasAging(entry)

  const [name, setName] = useState(entry.playerName)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [editingName, setEditingName] = useState(false)

  // móvil: el panel se divide en pestañas para evitar el scroll infinito
  const [panelTab, setPanelTab] = useState<'datos' | 'historial'>('datos')

  // ── composer del historial (bajo esfuerzo) ──
  const [newComment, setNewComment] = useState('')
  const [commentKind, setCommentKind] = useState<string>('nota')
  const [commentOutcome, setCommentOutcome] = useState<'contesto' | 'no_contesto' | null>(null)

  // ── edición de apuntes ──
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  // ── próxima acción ──
  const [editingAction, setEditingAction] = useState(false)
  const [actionLabel, setActionLabel] = useState(entry.nextAction ?? '')
  const [actionDate, setActionDate] = useState(entry.nextActionDate ?? '')
  const [actionAssignee, setActionAssignee] = useState(entry.nextActionAssignee ?? currentProfile.id)
  const [actionKind, setActionKind] = useState<string>(entry.nextActionKind ?? 'llamada')

  const zoneOptions = useMemo(() => {
    const base = [...FIRMAS_ZONE_ORDER]
    zones.forEach(z => { if (!base.includes(z)) base.push(z) })
    if (!base.includes(entry.zone)) base.push(entry.zone)
    return base
  }, [zones, entry.zone])

  // known_team: al abrir la ficha se sincroniza en silencio la primera vez
  useEffect(() => {
    if (sp?.team && !entry.knownTeam) void onPatch(entry.id, { knownTeam: sp.team })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.id])

  // ── crear en Mantenimiento al firmar ──
  const existsInMaintenance = players.some(p => normSearch(p.name) === normSearch(sp?.fullName ?? entry.playerName))
  const createInMaintenance = async () => {
    try {
      await onCreatePlayer({
        id: crypto.randomUUID(), // lo genera la BBDD; el tipo lo exige
        name: sp?.fullName ?? entry.playerName,
        birthDate: sp?.birthdate ?? '',
        positions: [sp?.position1, sp?.position2].filter(Boolean) as string[],
        nationality: sp?.nationality ?? '',
        photo: '',
        clubs: sp?.team ? [{ name: sp.team, type: 'principal' as const }] : [],
        managedBy: entry.managers,
        representationContract: { start: (entry.signedAt ?? new Date().toISOString()).slice(0, 10), end: '' },
        clubContract: { endDate: sp?.clubContract ?? '' },
        contractHistory: [],
        clubInterests: [],
        performance: [],
        matchReports: [],
        videoSessions: [],
        info: { family: '', personality: '' },
        links: [],
      })
      const log: FirmasComment = {
        id: crypto.randomUUID(),
        text: '→ Creado como jugador de Mantenimiento',
        date: new Date().toISOString(),
        author: currentProfile.name,
        authorId: currentProfile.id,
        kind: 'nota',
      }
      void onPatch(entry.id, e => ({ ...e, comments: [...e.comments, log] }))
      showToast('Creado en Mantenimiento — completa su ficha cuando quieras')
    } catch (err) {
      console.error(err)
      showToast('No se pudo crear en Mantenimiento', 'error')
    }
  }

  const saveName = () => {
    setEditingName(false)
    const v = name.trim()
    if (v && v !== entry.playerName) void onPatch(entry.id, { playerName: v })
    else setName(entry.playerName)
  }

  // Notas: se guardan solas a los 600 ms de dejar de escribir, al salir del
  // campo y al cerrar el panel (ESC / clic fuera desmontan el componente y
  // el cleanup manda lo que quede pendiente). Como el patch va por id, no
  // pisa a un apunte o un «✓ Hecho» que se haya guardado entre medias.
  const notesRef = React.useRef(notes)
  notesRef.current = notes
  const notesGuardadasRef = React.useRef((entry.notes ?? '').trim())
  const saveNotes = useCallback(() => {
    const v = notesRef.current.trim()
    if (v === notesGuardadasRef.current) return
    notesGuardadasRef.current = v
    void onPatch(entry.id, { notes: v || undefined })
  }, [entry.id, onPatch])
  useEffect(() => {
    const t = setTimeout(saveNotes, 600)
    return () => clearTimeout(t)
  }, [notes, saveNotes])
  useEffect(() => () => saveNotes(), [saveNotes])

  // Notas escritas y aún no enviadas (autoguardado a 600 ms) o apunte a medias
  useBeforeUnload(notes.trim() !== notesGuardadasRef.current || newComment.trim().length > 0)

  const toggleManager = (pid: string) => {
    const managers = entry.managers.includes(pid)
      ? entry.managers.filter(m => m !== pid)
      : [...entry.managers, pid]
    void onPatch(entry.id, { managers })
  }

  const addComment = () => {
    const kind = commentKind as FirmasComment['kind']
    let text = newComment.trim()
    // sin fricción: una llamada/whatsapp con resultado se puede registrar sin escribir nada
    if (!text && commentOutcome) text = commentOutcome === 'contesto' ? 'Contestó' : 'No contestó'
    if (!text) return
    const c: FirmasComment = {
      id: crypto.randomUUID(),
      text,
      date: new Date().toISOString(),
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind,
      outcome: commentOutcome ?? undefined,
    }
    setNewComment('')
    setCommentKind('nota')
    setCommentOutcome(null)
    void onPatch(entry.id, e => ({ ...e, comments: [...e.comments, c] }))
  }

  const deleteComment = (id: string) => {
    const borrado = entry.comments.find(c => c.id === id)
    void onPatch(entry.id, e => ({ ...e, comments: e.comments.filter(c => c.id !== id) }))
    // Deshacer = volver a meter ese apunte (si nadie lo ha repuesto ya)
    showToast('Apunte eliminado', 'info', { label: 'Deshacer', fn: () => {
      if (borrado) void onPatch(entry.id, e => e.comments.some(c => c.id === id) ? e : { ...e, comments: [...e.comments, borrado] })
    } })
  }

  const saveCommentEdit = () => {
    const v = editingCommentText.trim()
    const id = editingCommentId
    setEditingCommentId(null)
    if (!v || !id) return
    void onPatch(entry.id, e => ({ ...e, comments: e.comments.map(c => c.id === id ? { ...c, text: v } : c) }))
  }

  const saveAction = () => {
    if (!actionLabel.trim() && !actionDate) { setEditingAction(false); return }
    void onPatch(entry.id, {
      nextAction: actionLabel.trim() || undefined,
      nextActionDate: actionDate || undefined,
      nextActionAssignee: actionAssignee || undefined,
      nextActionKind: actionKind || undefined,
    })
    setEditingAction(false)
  }

  const completeAction = () => {
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `✓ Hecho: ${entry.nextAction ?? 'próxima acción'}`,
      date: new Date().toISOString(),
      author: currentProfile.name,
      authorId: currentProfile.id,
      // coherencia con el historial: una llamada hecha queda como llamada
      kind: (entry.nextActionKind as FirmasComment['kind']) ?? 'nota',
    }
    const prev = { nextAction: entry.nextAction, nextActionDate: entry.nextActionDate, nextActionAssignee: entry.nextActionAssignee, nextActionKind: entry.nextActionKind }
    void onPatch(entry.id, e => ({
      ...e,
      nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined,
      comments: [...e.comments, log],
    }))
    setActionLabel(''); setActionDate('')
    // Deshacer: se recupera la acción y se quita SOLO el apunte «✓ Hecho»,
    // sin tocar lo que se haya escrito mientras tanto
    showToast('Acción marcada como hecha', 'success', { label: 'Deshacer', fn: () =>
      void onPatch(entry.id, e => ({ ...e, ...prev, comments: e.comments.filter(c => c.id !== log.id) })) })
  }

  // recientes primero
  const sortedComments = [...entry.comments].sort((a, b) => b.date.localeCompare(a.date))
  const actionAssigneeProfile = entry.nextActionAssignee ? profiles.find(p => p.id === entry.nextActionAssignee) : undefined
  const actionOverdue = !!entry.nextActionDate && entry.nextActionDate < todayISO()

  const LABEL_CLS = 'text-badge font-bold text-slate-500 uppercase tracking-wide'

  const cabecera = (
    <div className="flex items-center gap-2.5 flex-wrap">
      {editingName ? (
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(entry.playerName); setEditingName(false) } }}
          autoFocus
          aria-label="Nombre del jugador"
          className="text-base font-bold py-1 max-w-xs"
        />
      ) : (
        <button type="button" onClick={() => setEditingName(true)} className="group flex items-center gap-1.5 text-left min-w-0 flex-shrink rounded" title="Cambiar el nombre">
          <span className="text-base font-bold text-slate-800 leading-tight truncate">{entry.playerName}</span>
          <Pencil className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 flex-shrink-0" aria-hidden="true" />
        </button>
      )}
      <FirmasStatusChip status={entry.status} onChange={s => onChangeStatus(entry, s)} size="md" />
      {entry.status === 'firmado' ? (
        <span className="text-badge text-green-600 font-medium hidden sm:inline">🎉 {entry.signedAt ? fmtDate(entry.signedAt) : ''}</span>
      ) : (
        <>
          {entry.statusUpdatedAt && (
            <span className="text-badge text-slate-500 hidden sm:inline">
              desde {relativeDate(entry.statusUpdatedAt) || fmtDate(entry.statusUpdatedAt)}
            </span>
          )}
          {aging && (
            <span className={`text-badge font-medium hidden sm:inline ${aging.overdue ? 'text-red-500' : aging.warn ? 'text-amber-600' : 'text-slate-500'}`}>
              {aging.overdue ? '⚠ ' : ''}sin tocar {aging.days}d<span className="opacity-60">/{aging.limit}d</span>
            </span>
          )}
        </>
      )}
    </div>
  )

  const pie = (
    <>
      {entry.trelloUrl && (
        <a
          href={entry.trelloUrl}
          target="_blank"
          rel="noreferrer"
          className="mr-auto inline-flex items-center gap-1 text-meta text-slate-600 hover:text-slate-900"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          Tarjeta Trello
        </a>
      )}
      <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onRequestDelete} className="ml-auto text-slate-600 hover:text-red-600">
        {L.eliminar}
      </Button>
    </>
  )

  return (
    <Sheet
      open
      onClose={onClose}
      title={cabecera}
      historyKey="firmas-detalle"
      footer={pie}
      // Más ancho que un Sheet normal: dos columnas en escritorio
      className="h-dvh max-h-none rounded-none sm:max-w-none sm:w-[min(100%,880px)] lg:w-[55%] xl:w-1/2"
    >
      <div className="-mx-4 sm:-mx-5 -mt-4">
        {/* móvil: info de estatus + pestañas Datos/Historial */}
        <div className="lg:hidden border-b border-slate-200 mb-3">
          {entry.status !== 'firmado' && (entry.statusUpdatedAt || aging) && (
            <div className="px-4 pt-1.5 pb-0.5 flex items-center gap-2 text-badge text-slate-500 sm:hidden">
              {entry.statusUpdatedAt && <span>desde {relativeDate(entry.statusUpdatedAt) || fmtDate(entry.statusUpdatedAt)}</span>}
              {aging && (
                <span className={aging.overdue ? 'text-red-500 font-medium' : aging.warn ? 'text-amber-600' : ''}>
                  {aging.overdue ? '⚠ ' : ''}sin tocar {aging.days}d/{aging.limit}d
                </span>
              )}
            </div>
          )}
          <div role="tablist" className="px-4 sm:px-5 flex gap-4">
            <button
              onClick={() => setPanelTab('datos')}
              role="tab" aria-selected={panelTab === 'datos'}
              className={`py-2 text-secondary font-semibold border-b-2 transition-colors ${panelTab === 'datos' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
            >
              Datos
            </button>
            <button
              onClick={() => setPanelTab('historial')}
              role="tab" aria-selected={panelTab === 'historial'}
              className={`py-2 text-secondary font-semibold border-b-2 transition-colors ${panelTab === 'historial' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
            >
              Historial{entry.comments.length > 0 ? ` · ${entry.comments.length}` : ''}
            </button>
          </div>
        </div>

        {/* body: dos columnas en escritorio, pestañas en móvil */}
        <div className="px-4 sm:px-5 py-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">

            {/* ── Columna izquierda: datos ── */}
            <div className={`space-y-3.5 min-w-0 ${panelTab === 'datos' ? 'block' : 'hidden'} lg:block`}>
              {/* firmado 🎉 → traspaso a Mantenimiento */}
              {entry.status === 'firmado' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-green-700 font-medium">🎉 Firmado{entry.signedAt ? ` el ${fmtDate(entry.signedAt)}` : ''}</span>
                  {existsInMaintenance ? (
                    <span className="ml-auto text-badge text-green-600 font-medium">Ya en Mantenimiento ✓</span>
                  ) : (
                    <button
                      onClick={() => void createInMaintenance()}
                      className="ml-auto px-2.5 py-1 rounded-lg bg-green-600 text-white text-badge font-semibold hover:bg-green-700 transition-colors"
                    >
                      Crear en Mantenimiento
                    </button>
                  )}
                </div>
              )}

              {/* próxima acción */}
              {entry.status !== 'firmado' && (
                <div>
                  <label className={LABEL_CLS}>Próxima acción</label>
                  {editingAction ? (
                    <div className="mt-1 border border-blue-200 rounded-lg p-2 bg-blue-50/40 space-y-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {Object.entries(FIRMAS_ACTION_KIND_META).map(([k, meta]) => (
                          <button
                            key={k}
                            onClick={() => {
                              setActionKind(k)
                              // Acción predefinida: elegir 📵 rellena el texto solo
                              if (k === 'telefono' && (!actionLabel.trim() || actionLabel === 'Conseguir teléfono')) setActionLabel('Conseguir teléfono')
                              else if (k !== 'telefono' && actionLabel === 'Conseguir teléfono') setActionLabel('')
                            }}
                            className={`px-1.5 py-0.5 rounded-md text-badge transition-colors ${
                              actionKind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-600 hover:bg-white'
                            }`}
                            title={meta.label}
                          >
                            {meta.icon} <span className="hidden xl:inline">{meta.label}</span>
                          </button>
                        ))}
                      </div>
                      <Input
                        value={actionLabel}
                        onChange={e => setActionLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveAction() } }}
                        placeholder="Llamar, reunión, enviar propuesta…"
                        aria-label="Próxima acción"
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <Input
                          type="date"
                          value={actionDate}
                          onChange={e => setActionDate(e.target.value)}
                          aria-label="Fecha de la próxima acción"
                          className="flex-1"
                        />
                        <Select value={actionAssignee} onChange={e => setActionAssignee(e.target.value)} aria-label={L.responsable} className="w-auto">
                          {profiles.map(p => <option key={p.id} value={p.id}>{p.avatar || p.name}</option>)}
                        </Select>
                        <IconButton label="Cancelar edición de la acción" onClick={() => setEditingAction(false)}><X /></IconButton>
                        <Button size="sm" variant="primary" onClick={saveAction}>OK</Button>
                      </div>
                    </div>
                  ) : entry.nextAction || entry.nextActionDate ? (
                    <div className={`mt-1 flex items-center gap-2 border rounded-lg px-2.5 py-1.5 ${actionOverdue ? 'border-red-200 bg-red-50/60' : 'border-blue-200 bg-blue-50/50'}`}>
                      <span className="text-xs font-semibold text-slate-800 truncate">{FIRMAS_ACTION_KIND_META[entry.nextActionKind ?? '']?.icon ?? '📌'} {entry.nextAction ?? 'Acción'}</span>
                      <span className={`text-badge flex-shrink-0 ${actionOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {entry.nextActionDate ? fmtDate(entry.nextActionDate) : 'sin fecha'}
                        {actionOverdue ? ' · vencida' : entry.nextActionDate === todayISO() ? ' · hoy' : ''}
                        {actionAssigneeProfile ? ` · ${actionAssigneeProfile.avatar || actionAssigneeProfile.name}` : ''}
                      </span>
                      <span className="ml-auto flex gap-1 flex-shrink-0">
                        <IconButton label="Marcar la acción como hecha (queda en el historial)" onClick={completeAction} className="bg-green-600 text-white hover:bg-green-700"><Check /></IconButton>
                        <IconButton
                          label="Editar próxima acción"
                          onClick={() => { setActionLabel(entry.nextAction ?? ''); setActionDate(entry.nextActionDate ?? ''); setActionAssignee(entry.nextActionAssignee ?? currentProfile.id); setActionKind(entry.nextActionKind ?? 'llamada'); setEditingAction(true) }}
                        >
                          <Pencil />
                        </IconButton>
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setActionLabel(''); setActionDate(''); setActionAssignee(currentProfile.id); setActionKind('llamada'); setEditingAction(true) }}
                      className="mt-1 w-full border border-dashed border-slate-300 rounded-lg px-2.5 py-1.5 text-badge text-slate-600 hover:text-slate-900 hover:border-slate-400 transition-colors text-left"
                    >
                      + Programar próxima acción (sale en el Dashboard el día que toca)
                    </button>
                  )}
                </div>
              )}

              {/* zona */}
              <div className="flex items-center gap-2">
                <label className={`${LABEL_CLS} w-16 flex-shrink-0`}>Zona</label>
                <Select
                  value={entry.zone}
                  onChange={e => void onPatch(entry.id, { zone: e.target.value })}
                  aria-label="Zona"
                  className="flex-1 min-w-0"
                >
                  {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
                </Select>
              </div>

              {/* encargados */}
              <div>
                <label className={LABEL_CLS}>{L.encargados}</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profiles.map(p => {
                    const active = entry.managers.includes(p.id)
                    const c = scoutColor(p.avatar || p.name)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleManager(p.id)}
                        className={`px-1.5 py-0.5 rounded-full text-badge font-semibold border transition-colors ${
                          active ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                        }`}
                        title={p.name}
                      >
                        {p.avatar || p.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* vínculo con jugador de Captación — compacto */}
              <div>
                <label className={LABEL_CLS}>Jugador de Captación</label>
                {sp?.team && entry.knownTeam && equipoMatchKind(entry.knownTeam, sp.team) !== 'equipo' && (
                  <div className="mt-1 mb-1 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-badge text-amber-800">
                    {equipoMatchKind(entry.knownTeam, sp.team) === 'club'
                      ? <span>🔁 Cambio de equipo dentro del club: <b>{entry.knownTeam}</b> → <b>{sp.team}</b>.</span>
                      : <span>🔁 Cambio de club: <b>{entry.knownTeam}</b> → <b>{sp.team}</b>. Revisa la zona.</span>}
                    <button
                      onClick={() => void onPatch(entry.id, { knownTeam: sp.team })}
                      className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-md bg-amber-600 text-white text-badge font-semibold hover:bg-amber-700"
                    >
                      Entendido
                    </button>
                  </div>
                )}
                {sp ? (
                  <div className="mt-1 flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50">
                    <div className="min-w-0 flex-1 text-xs">
                      <span className="font-semibold text-slate-800">{sp.fullName}</span>
                      <span className="text-slate-500">
                        {' · '}
                        {[
                          sp.team,
                          sp.birthdate ? sp.birthdate.slice(0, 4) : null,
                          sp.position1,
                          `${spReports.length} inf.`,
                          sp.assessment,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button
                      onClick={() => onOpenScoutingPlayer(sp.id)}
                      className="text-badge font-medium text-primary hover:underline flex-shrink-0"
                    >
                      Ver ficha
                    </button>
                    <IconButton label="Quitar vínculo" onClick={() => void onPatch(entry.id, { scoutingPlayerId: undefined, knownTeam: undefined })} className="text-slate-600 hover:text-red-600">
                      <X />
                    </IconButton>
                  </div>
                ) : (
                  <div className="mt-1">
                    <FirmasLinkSearch
                      scoutingPlayers={scoutingPlayers}
                      onSelect={p => void onPatch(entry.id, { scoutingPlayerId: p.id, knownTeam: p.team })}
                      placeholder="Vincular con jugador de Captación…"
                    />
                  </div>
                )}
              </div>

              {/* notas */}
              <div>
                <label className={LABEL_CLS}>Notas</label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={3}
                  placeholder="Notas sobre el proceso de captación…"
                  aria-label="Notas"
                  className="mt-1 resize-y"
                />
              </div>
            </div>

            {/* ── Columna derecha: historial ── */}
            <div className={`min-w-0 ${panelTab === 'historial' ? 'block' : 'hidden'} lg:block`}>
              <label className={LABEL_CLS}>
                Historial {sortedComments.length > 0 && <span className="text-slate-500">· {sortedComments.length}</span>}
              </label>

              {/* composer arriba: tipo con un toque + resultado rápido */}
              <div className="mt-1 border border-slate-200 rounded-lg p-2 bg-white space-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {Object.entries(FIRMAS_KIND_META).map(([k, meta]) => (
                    <button
                      key={k}
                      onClick={() => { setCommentKind(k); if (k !== 'llamada' && k !== 'whatsapp') setCommentOutcome(null) }}
                      className={`px-1.5 py-0.5 rounded-md text-badge transition-colors ${
                        commentKind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                      title={meta.label}
                    >
                      {meta.icon} <span className="hidden xl:inline">{meta.label}</span>
                    </button>
                  ))}
                  {(commentKind === 'llamada' || commentKind === 'whatsapp') && (
                    <span className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => setCommentOutcome(o => o === 'contesto' ? null : 'contesto')}
                        className={`px-1.5 py-0.5 rounded-md text-badge font-medium transition-colors ${commentOutcome === 'contesto' ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        ✓ contestó
                      </button>
                      <button
                        onClick={() => setCommentOutcome(o => o === 'no_contesto' ? null : 'no_contesto')}
                        className={`px-1.5 py-0.5 rounded-md text-badge font-medium transition-colors ${commentOutcome === 'no_contesto' ? 'bg-red-100 text-red-600 ring-1 ring-red-200' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        ✗ no contestó
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addComment() }}
                    placeholder={commentKind === 'nota' ? 'Añadir nota…' : `${FIRMAS_KIND_META[commentKind].label}: ¿qué pasó?`}
                    aria-label="Nuevo apunte"
                    className="flex-1"
                  />
                  <IconButton
                    label="Guardar apunte"
                    variant="primary"
                    size="md"
                    onClick={addComment}
                    disabled={!newComment.trim() && !commentOutcome}
                  >
                    <Send />
                  </IconButton>
                </div>
              </div>

              {/* lista: recientes primero */}
              <div className="mt-2 space-y-1.5">
                {sortedComments.length === 0 && (
                  <p className="text-badge text-slate-500">Sin actividad todavía.</p>
                )}
                {sortedComments.map(c => (
                  c.kind === 'estatus' ? (
                    <div key={c.id} className="flex items-center gap-1.5 px-1 text-badge text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span>{c.text}</span>
                      <span className="opacity-70">· {c.author?.split(' ')[0]} · {fmtDate(c.date)}</span>
                    </div>
                  ) : editingCommentId === c.id ? (
                    <div key={c.id} className="border border-blue-200 rounded-lg px-2.5 py-2 bg-blue-50/30">
                      <Textarea
                        value={editingCommentText}
                        onChange={e => setEditingCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveCommentEdit() } if (e.key === 'Escape') setEditingCommentId(null) }}
                        autoFocus
                        rows={2}
                        aria-label="Editar apunte"
                        className="resize-y"
                      />
                      <div className="mt-1 flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>{L.cancelar}</Button>
                        <Button size="sm" variant="primary" onClick={saveCommentEdit}>{L.guardar}</Button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} className="group border border-slate-100 rounded-lg px-2.5 py-2 bg-slate-50/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{FIRMAS_ACTION_KIND_META[c.kind ?? 'nota']?.icon ?? '📝'}</span>
                        <span className="text-badge font-semibold text-slate-600">{c.author || '—'}</span>
                        {c.outcome && (
                          <span className={`text-badge font-semibold px-1.5 py-0.5 rounded-full ${c.outcome === 'contesto' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {c.outcome === 'contesto' ? 'contestó' : 'no contestó'}
                          </span>
                        )}
                        <span className="text-badge text-slate-500">{relativeDate(c.date) || fmtDate(c.date)}</span>
                        {(isAdmin || c.authorId === currentProfile.id) && (
                          // en móvil no hay hover: por debajo de sm los botones se ven siempre
                          <span className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <IconButton label="Editar apunte" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text) }} className="text-slate-600 hover:text-blue-600">
                              <Pencil />
                            </IconButton>
                            <IconButton label="Eliminar apunte" onClick={() => deleteComment(c.id)} className="text-slate-600 hover:text-red-600">
                              <Trash2 />
                            </IconButton>
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-700 whitespace-pre-wrap break-words">{c.text}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </Sheet>
  )
}
