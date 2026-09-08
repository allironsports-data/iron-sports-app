import React, { useState } from 'react'
import { X, Plus, Trash2, FileText, Maximize2, Minimize2, Pencil, ClipboardList, Download, ArrowLeft, Star, Check, Video, MapPin, Link2 } from 'lucide-react'
import { generarInformeScouting } from '../../lib/informeScouting'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, ScoutingMatchPlayer, FirmasEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import type { Equipo as EquipoCatalogo } from '../../lib/db'
import { isValidName } from '../../lib/validate'
import { ZONA_CORTA, SIN_ZONA, normEquipo, type Zona } from '../../lib/zonas'
import type { buscarJugadoresParecidos } from '../../lib/duplicados'
import { Button, IconButton, Field, Input, Select, Textarea, Badge } from '../../components/ui'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useBackClose } from '../../hooks/useBackClose'
import { useBeforeUnload } from '../../hooks/useBeforeUnload'
import { L } from '../../lib/labels'
import { AssessmentChip, InfoItem, ReportCard } from './comun'
import { type ShowToast, type CaptacionTab, type ConclusionOption, ASSESSMENT_CONFIG, ALL_ASSESSMENTS, POSITIONS_SCOUTING, CONCLUSION_OPTIONS, MONTHS_ES, REPORT_TEMPLATE, birthYearFromBirthdate, fmtDate } from './helpers'
import { AddToFirmasButton } from './firmas/AddToFirmasButton'
import { type FilaEquipo, SIN_CATEGORIA, inicioTemporada, etiquetaTemporada } from './filasEquipos'
// ── Panel lateral (persiste entre pestañas) ───────────────────────────
// Tres caras: formulario de alta/edición de jugador, ficha del equipo y
// ficha del jugador (con el formulario de informe, borrador y cola).
// TODO el estado y los handlers viven en Captacion.tsx: el borrador y la
// cola de envío tienen que sobrevivir al cierre del panel, y el ESC de la
// raíz necesita saber si hay un formulario abierto. Aquí solo se pinta.
//
// En escritorio es una columna fija a la derecha (la lista se estrecha);
// en móvil ocupa toda la pantalla (h-dvh) y el botón «atrás» lo cierra.

type PlayerFormState = Omit<ScoutingPlayer, 'id' | 'createdAt'>
type JugadorParecido = ReturnType<typeof buscarJugadoresParecidos>[number]

const LABEL_SECCION = 'text-badge font-semibold text-slate-500 uppercase tracking-wide'

export function PlayerPanel({
  // carcasa
  fullscreen, setFullscreen, isDesktop, closePanel, showToast, isAdmin, currentProfile, profiles,
  setCaptTab, abrirJugador,
  // jugador / equipo / formulario abiertos
  panelPlayerId, panelPlayer, setPanelPlayerId, panelEquipo, setPanelEquipo, volverAEquipo, setVolverAEquipo,
  showAddPlayer, setShowAddPlayer, showEditPlayer, setShowEditPlayer, editTarget,
  // ficha del equipo
  filaEquipoAbierta, renombrando, setRenombrando, guardarRenombre, onSaveEquipo, setZonasAbierto, setDetailMatchId,
  categoriasConocidas, equiposOrdenados, equipos, scoutingMatches,
  // formulario de jugador
  form, setForm, emptyForm, playerNameError, setPlayerNameError, jugadoresParecidos, setOcultarParecidos,
  reportCountByPlayer, handleSavePlayer, savingPlayer,
  // ficha del jugador
  firmasEntries, onCreateFirmasEntry, setFirmasJumpId, handleQuickAssessment, openEditPlayer,
  confirmDeletePlayer, setConfirmDeletePlayer, handleDeletePlayer,
  // informes
  panelReports, panelSortedMatches, showAddReportForm, setShowAddReportForm,
  reportTitle, setReportTitle, reportText, setReportText, reportConclusion, setReportConclusion,
  reportMatchId, setReportMatchId, reportMatchSuggestions, matchSearchInput, setMatchSearchInput,
  matchSearchOpen, setMatchSearchOpen, savingReport, handleAddReport, borradorRecuperado, descartarBorrador,
  confirmDeleteReport, setConfirmDeleteReport, handleDeleteReport, handleUpdateReport, handleReportEditingChange,
  matchPlayers, onRemoveMatchPlayer,
}: {
  fullscreen: boolean
  setFullscreen: React.Dispatch<React.SetStateAction<boolean>>
  isDesktop: boolean
  closePanel: () => void
  showToast: ShowToast
  isAdmin: boolean
  currentProfile: Profile
  profiles: Profile[]
  setCaptTab: (t: CaptacionTab) => void
  abrirJugador: (id: string | null, desdeEquipo?: string) => void
  panelPlayerId: string | null
  panelPlayer: ScoutingPlayer | null
  setPanelPlayerId: React.Dispatch<React.SetStateAction<string | null>>
  panelEquipo: string | null
  setPanelEquipo: React.Dispatch<React.SetStateAction<string | null>>
  volverAEquipo: string | null
  setVolverAEquipo: React.Dispatch<React.SetStateAction<string | null>>
  showAddPlayer: boolean
  setShowAddPlayer: React.Dispatch<React.SetStateAction<boolean>>
  showEditPlayer: boolean
  setShowEditPlayer: React.Dispatch<React.SetStateAction<boolean>>
  editTarget: ScoutingPlayer | null
  filaEquipoAbierta: FilaEquipo | null
  renombrando: string | null
  setRenombrando: React.Dispatch<React.SetStateAction<string | null>>
  guardarRenombre: () => Promise<void>
  onSaveEquipo: (e: Partial<EquipoCatalogo> & { nombre: string; club: string }) => Promise<void>
  setZonasAbierto: React.Dispatch<React.SetStateAction<boolean>>
  setDetailMatchId: React.Dispatch<React.SetStateAction<string | null>>
  categoriasConocidas: string[]
  equiposOrdenados: EquipoCatalogo[]
  equipos: EquipoCatalogo[]
  scoutingMatches: ScoutingMatch[]
  form: PlayerFormState
  setForm: React.Dispatch<React.SetStateAction<PlayerFormState>>
  emptyForm: () => PlayerFormState
  playerNameError: string
  setPlayerNameError: React.Dispatch<React.SetStateAction<string>>
  jugadoresParecidos: JugadorParecido[]
  setOcultarParecidos: React.Dispatch<React.SetStateAction<boolean>>
  reportCountByPlayer: Record<string, number>
  handleSavePlayer: () => Promise<void>
  savingPlayer: boolean
  firmasEntries: FirmasEntry[]
  onCreateFirmasEntry: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  setFirmasJumpId: React.Dispatch<React.SetStateAction<string | null>>
  handleQuickAssessment: (player: ScoutingPlayer, assessment: ScoutingAssessment | undefined) => Promise<void>
  openEditPlayer: (p: ScoutingPlayer) => void
  confirmDeletePlayer: boolean
  setConfirmDeletePlayer: React.Dispatch<React.SetStateAction<boolean>>
  handleDeletePlayer: () => Promise<void>
  panelReports: ScoutingReport[]
  panelSortedMatches: { playerTeam: string; sortedMatches: ScoutingMatch[] }
  showAddReportForm: boolean
  setShowAddReportForm: React.Dispatch<React.SetStateAction<boolean>>
  reportTitle: string
  setReportTitle: React.Dispatch<React.SetStateAction<string>>
  reportText: string
  setReportText: React.Dispatch<React.SetStateAction<string>>
  reportConclusion: ConclusionOption
  setReportConclusion: React.Dispatch<React.SetStateAction<ConclusionOption>>
  reportMatchId: string
  setReportMatchId: React.Dispatch<React.SetStateAction<string>>
  reportMatchSuggestions: { list: { m: ScoutingMatch; linked: boolean; days: number }[]; auto: ScoutingMatch | null }
  matchSearchInput: string
  setMatchSearchInput: React.Dispatch<React.SetStateAction<string>>
  matchSearchOpen: boolean
  setMatchSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  savingReport: boolean
  handleAddReport: () => Promise<void>
  borradorRecuperado: boolean
  descartarBorrador: () => void
  confirmDeleteReport: string | null
  setConfirmDeleteReport: React.Dispatch<React.SetStateAction<string | null>>
  handleDeleteReport: (id: string) => Promise<void>
  handleUpdateReport: (r: ScoutingReport) => Promise<void>
  handleReportEditingChange: (editing: boolean) => void
  matchPlayers: ScoutingMatchPlayer[]
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
}) {
  const [exportandoInforme, setExportandoInforme] = useState(false)

  // Botón «atrás» del móvil: cierra el panel (el componente solo se monta abierto)
  useBackClose(true, closePanel, 'capt-panel')
  // El informe a medio escribir se guarda como borrador, pero avisamos igual al recargar
  useBeforeUnload(showAddReportForm && (reportText.trim().length > 0 || reportTitle.trim().length > 0))

  async function handleExportarInforme() {
    if (!panelPlayer || exportandoInforme) return
    setExportandoInforme(true)
    try {
      await generarInformeScouting(panelPlayer, panelReports, scoutingMatches)
    } catch {
      showToast('No se ha podido generar el informe', 'error')
    } finally {
      setExportandoInforme(false)
    }
  }

  const titulo = panelEquipo
    ? (filaEquipoAbierta?.nombre ?? panelEquipo)
    : (showAddPlayer ? 'Nuevo jugador' : showEditPlayer ? `Editar: ${editTarget?.fullName ?? ''}` : panelPlayer?.fullName ?? '')

  // Posición: en móvil pantalla completa; en escritorio columna derecha bajo la cabecera
  const carcasa = fullscreen
    ? 'fixed inset-x-0 top-0 lg:top-[var(--shell-h,0px)] h-dvh lg:h-[calc(100dvh-var(--shell-h,0px))] z-[60] lg:z-40 flex flex-col bg-white overflow-hidden'
    : 'fixed inset-0 h-dvh z-[60] lg:inset-auto lg:right-0 lg:top-[var(--shell-h,0px)] lg:h-[calc(100dvh-var(--shell-h,0px))] lg:w-[480px] lg:z-40 bg-white shadow-2xl flex flex-col border-l border-slate-200'

  return (
    <>
      {!fullscreen && !isDesktop && (
        <div className="fixed inset-0 bg-black/20 z-50" onClick={closePanel} aria-hidden="true" />
      )}

      <div role="dialog" aria-modal={!isDesktop || fullscreen ? true : undefined} aria-label={titulo} className={carcasa}>
        {/* Cabecera del panel */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          {volverAEquipo && panelPlayer && !showEditPlayer && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeft />}
              onClick={() => { setPanelPlayerId(null); setPanelEquipo(volverAEquipo); setVolverAEquipo(null) }}
              title={`Volver a ${volverAEquipo}`}
              aria-label={`Volver a ${volverAEquipo}`}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline max-w-[110px] truncate">{volverAEquipo}</span>
            </Button>
          )}
          <div className="flex-1 min-w-0">
            {panelEquipo && (
              <div>
                <h2 className="text-body sm:text-base font-semibold text-slate-800 truncate flex items-center gap-1.5">
                  {renombrando === null ? (
                    <>
                      <span className="truncate">{filaEquipoAbierta?.nombre ?? panelEquipo}</span>
                      <IconButton
                        label="Cambiar el nombre del equipo"
                        onClick={() => setRenombrando(filaEquipoAbierta?.nombre ?? panelEquipo)}
                        className="text-slate-600 hover:text-primary"
                      >
                        <Pencil />
                      </IconButton>
                    </>
                  ) : (
                    <Input
                      value={renombrando}
                      onChange={e => setRenombrando(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void guardarRenombre()
                        if (e.key === 'Escape') setRenombrando(null)
                      }}
                      autoFocus
                      aria-label="Nuevo nombre del equipo"
                      className="font-semibold py-0.5"
                    />
                  )}
                </h2>
                <div className="text-meta text-slate-500 mt-0.5">
                  {(() => {
                    const f = filaEquipoAbierta
                    if (!f) return null
                    const z = f.zona === SIN_ZONA ? 'sin zona' : (ZONA_CORTA[f.zona as Zona] ?? f.zona)
                    return `${z} · ${f.categoria === SIN_CATEGORIA ? 'sin categoría' : f.categoria}`
                  })()}
                </div>
              </div>
            )}
            {panelPlayer && !showEditPlayer && (
              <div>
                <h2 className="text-body sm:text-base font-semibold text-slate-800 truncate">{panelPlayer.fullName}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <AssessmentChip a={panelPlayer.assessment} />
                  {panelPlayer.categoria && (
                    <span className="text-meta text-slate-500">{panelPlayer.categoria}</span>
                  )}
                  <AddToFirmasButton
                    player={panelPlayer}
                    firmasEntries={firmasEntries}
                    currentProfile={currentProfile}
                    onCreate={onCreateFirmasEntry}
                    onJumpToEntry={(id) => { closePanel(); setCaptTab('firmar'); setFirmasJumpId(id) }}
                    showToast={showToast}
                  />
                </div>
              </div>
            )}
            {(showAddPlayer || showEditPlayer) && (
              <h2 className="text-body sm:text-base font-semibold text-slate-800">
                {showAddPlayer ? 'Nuevo jugador' : `Editar: ${editTarget?.fullName ?? ''}`}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {panelPlayer && !showEditPlayer && (
              <IconButton
                label={fullscreen ? 'Minimizar panel' : 'Pantalla completa'}
                onClick={() => setFullscreen(f => !f)}
                className="hidden sm:inline-flex"
              >
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
              </IconButton>
            )}
            <IconButton label="Cerrar panel" onClick={closePanel}>
              <X />
            </IconButton>
          </div>
        </div>

        {/* Cuerpo del panel */}
        <div className={`flex-1 overflow-y-auto ${fullscreen ? 'max-w-4xl mx-auto w-full' : ''} pb-14 sm:pb-0`}>

          {/* ── Alta / edición de jugador ── */}
          {(showAddPlayer || showEditPlayer) && (
            <form
              className="p-4 space-y-3"
              onSubmit={e => { e.preventDefault(); void handleSavePlayer() }}
            >
              <Field label="Nombre" required error={playerNameError || undefined}>
                <Input
                  value={form.fullName}
                  onChange={e => {
                    const v = e.target.value
                    setForm(f => ({ ...f, fullName: v }))
                    if (playerNameError && isValidName(v)) setPlayerNameError('')
                  }}
                  placeholder="Nombre completo"
                  autoFocus
                />
              </Field>
              {jugadoresParecidos.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-secondary text-amber-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">¿Es alguno de estos?</span>
                    <Button size="sm" variant="link" onClick={() => setOcultarParecidos(true)} className="ml-auto text-amber-700">No, crear nuevo</Button>
                  </div>
                  {jugadoresParecidos.map(({ player: p, tipo, mismoEquipo }) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="min-w-0 truncate">
                        <b>{p.fullName}</b>
                        <span className="text-amber-700/80"> · {p.team || 'sin equipo'} · {reportCountByPlayer[p.id] ?? 0} inf.</span>
                        {tipo === 'exacto' && <span className="ml-1 text-badge font-bold uppercase">mismo nombre</span>}
                        {tipo !== 'exacto' && mismoEquipo && <span className="ml-1 text-badge font-bold uppercase">mismo equipo</span>}
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => { setShowAddPlayer(false); setForm(emptyForm()); abrirJugador(p.id) }}
                        className="ml-auto flex-shrink-0 bg-amber-600 hover:bg-amber-700"
                      >
                        Abrir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Posición 1">
                  <Select value={form.position1 ?? ''} onChange={e => setForm(f => ({ ...f, position1: e.target.value }))}>
                    <option value="">—</option>
                    {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </Select>
                </Field>
                <Field label="Posición 2">
                  <Select value={form.position2 ?? ''} onChange={e => setForm(f => ({ ...f, position2: e.target.value }))}>
                    <option value="">—</option>
                    {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Fecha de nacimiento">
                  <Input type="date" value={form.birthdate ?? ''} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))} />
                </Field>
                <Field label="Pie">
                  <Select value={form.foot ?? ''} onChange={e => setForm(f => ({ ...f, foot: e.target.value }))}>
                    <option value="">—</option>
                    <option>Derecho</option><option>Izquierdo</option><option>Ambidiestro</option>
                  </Select>
                </Field>
              </div>
              {/* Equipo y categoría: se sugiere el catálogo, pero se puede
                  escribir cualquier cosa (un equipo nuevo se da de alta solo). */}
              <datalist id="lista-equipos">
                {equiposOrdenados.map(e => (
                  <option key={e.nombre} value={e.nombre}>{e.categoria ?? ''}</option>
                ))}
              </datalist>
              <datalist id="lista-categorias">
                {categoriasConocidas.map(c => <option key={c} value={c} />)}
              </datalist>
              <Field label="Equipo">
                <Input
                  list="lista-equipos"
                  value={form.team ?? ''}
                  onChange={e => {
                    const team = e.target.value
                    // Al elegir uno del catálogo, la categoría se rellena sola
                    const delCatalogo = equipos.find(x => x.nombre === team)
                    setForm(f => ({
                      ...f,
                      team,
                      categoria: delCatalogo?.categoria && !f.categoria ? delCatalogo.categoria : f.categoria,
                    }))
                  }}
                  placeholder="Escribe y elige, o pon uno nuevo"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Categoría">
                  <Input
                    list="lista-categorias"
                    value={form.categoria ?? ''}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    placeholder="Juveniles, Segunda RFEF..."
                  />
                </Field>
                <Field label="Nacionalidad">
                  <Input value={form.nationality ?? ''} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="Española..." />
                </Field>
              </div>
              <Field label={L.etiquetaJugador}>
                <Select value={form.assessment ?? ''} onChange={e => setForm(f => ({ ...f, assessment: (e.target.value as ScoutingAssessment) || undefined }))}>
                  <option value="">Sin valorar</option>
                  {ALL_ASSESSMENTS.map(a => <option key={a}>{a}</option>)}
                </Select>
              </Field>
              <Field label="Agencia">
                <Input value={form.agency ?? ''} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} placeholder="Representante..." />
              </Field>
              <Field label="Contrato club">
                <Input value={form.clubContract ?? ''} onChange={e => setForm(f => ({ ...f, clubContract: e.target.value }))} placeholder="30/06/2026" />
              </Field>
              <Field label="Contacto">
                <Input value={form.contacto ?? ''} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="Email / teléfono" />
              </Field>
              <Field label="Comentarios">
                <Textarea value={form.comentarios ?? ''} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))} rows={3} placeholder="Notas generales..." />
              </Field>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setShowAddPlayer(false); setShowEditPlayer(false) }} className="flex-1">
                  {L.cancelar}
                </Button>
                <Button type="submit" variant="primary" loading={savingPlayer} disabled={!form.fullName.trim()} className="flex-1">
                  {savingPlayer ? 'Guardando…' : showEditPlayer ? 'Guardar cambios' : 'Crear jugador'}
                </Button>
              </div>
            </form>
          )}

          {/* ── Ficha del equipo ── */}
          {panelEquipo && filaEquipoAbierta && (() => {
            const f = filaEquipoAbierta
            const partidosEquipo = scoutingMatches
              .filter(m => normEquipo(m.homeTeam) === f.clave || normEquipo(m.awayTeam) === f.clave)
              .sort((a, b) => b.date.localeCompare(a.date))
            const guardar = (campo: Partial<EquipoCatalogo>) =>
              onSaveEquipo({ nombre: f.nombre, club: f.club, ...campo }).catch(() => showToast('No se ha podido guardar', 'error'))
            return (
              <div className={`p-4 space-y-4 ${fullscreen ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : ''}`}>
                <div className="space-y-4">
                  {/* Marcas de control */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Star className={f.relevante ? 'fill-current' : ''} />}
                      aria-pressed={f.relevante}
                      onClick={() => void guardar({ relevante: !f.relevante })}
                      className={f.relevante ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100' : 'hover:border-amber-400'}
                    >
                      {f.relevante ? 'Relevante' : 'Marcar relevante'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Check />}
                      aria-pressed={f.cubierto}
                      onClick={() => void guardar({ cubierto: !f.cubierto })}
                      className={f.cubierto ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-100' : 'hover:border-green-400'}
                    >
                      {f.cubierto ? 'Cubierto' : 'Marcar cubierto'}
                    </Button>
                  </div>

                  {/* Los números */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { n: f.jugadores, l: 'jugadores' },
                      { n: f.informes, l: 'informes' },
                      { n: f.partidos, l: `partidos ${etiquetaTemporada(inicioTemporada())}` },
                      { n: f.partidosHist, l: 'partidos total' },
                    ].map(x => (
                      <div key={x.l} className="bg-slate-50 rounded-lg px-2 py-1.5">
                        <div className="text-base font-bold text-slate-800 leading-none">{x.n}</div>
                        <div className="text-meta text-slate-500 mt-0.5">{x.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Categoría (la zona se cambia en Zonas, porque es del club) */}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Categoría">
                      <Select
                        value={f.categoria === SIN_CATEGORIA ? '' : f.categoria}
                        onChange={e => void guardar({ categoria: e.target.value || undefined })}
                      >
                        <option value="">— sin categoría —</option>
                        {categoriasConocidas.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <div className="flex flex-col gap-1">
                      <span className="text-meta font-semibold text-slate-600">Zona (del club {f.club})</span>
                      <Button variant="secondary" icon={<MapPin />} onClick={() => setZonasAbierto(true)} className="justify-start">
                        {f.zona === SIN_ZONA ? <span className="text-amber-600">sin zona — asignar</span> : f.zona}
                      </Button>
                    </div>
                  </div>

                  {/* Últimos partidos */}
                  <div>
                    <p className={`${LABEL_SECCION} mb-1.5`}>Partidos suyos ({partidosEquipo.length})</p>
                    {partidosEquipo.length === 0 ? (
                      <p className="text-secondary text-slate-500 italic">Ninguno todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {partidosEquipo.slice(0, 8).map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { closePanel(); setCaptTab('partidos'); setDetailMatchId(m.id) }}
                            className="w-full text-left text-secondary bg-white border border-slate-200 rounded-lg px-2 py-2 sm:py-1 hover:border-primary flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                          >
                            <span className="text-slate-500 w-16 flex-shrink-0">{fmtDate(m.date)}</span>
                            <span className="text-slate-700 truncate">{m.homeTeam} – {m.awayTeam}</span>
                            {m.status === 'visto' && <Check aria-label="Visto" className="ml-auto w-3.5 h-3.5 text-green-600" />}
                          </button>
                        ))}
                        {partidosEquipo.length > 8 && (
                          <p className="text-meta text-slate-500 italic">y {partidosEquipo.length - 8} más</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Plantilla */}
                <div>
                  <p className={`${LABEL_SECCION} mb-1.5`}>
                    Jugadores registrados ({f.plantilla.length})
                  </p>
                  {f.plantilla.length === 0 ? (
                    <p className="text-secondary text-slate-500 italic">
                      Ninguno. Usa «Actualizar plantilla» para pegar la plantilla del club de golpe.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {f.plantilla.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => abrirJugador(p.id, f.nombre)}
                          className="w-full flex items-center gap-2 text-left bg-white border border-slate-200 rounded-lg px-2 py-2 sm:py-1.5 hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                        >
                          <span className="text-secondary font-semibold text-slate-700 truncate flex-1">{p.fullName}</span>
                          <span className="text-meta text-slate-500 w-12 text-right truncate">{p.position1 ?? '—'}</span>
                          <span className="text-meta text-slate-500 w-8 text-right">{birthYearFromBirthdate(p.birthdate)}</span>
                          <AssessmentChip a={p.assessment} small />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Ficha del jugador ── */}
          {panelPlayer && !showEditPlayer && (
            <div className={`p-4 space-y-5 ${fullscreen ? 'grid grid-cols-1 sm:grid-cols-2 gap-6 items-start' : ''}`}>
              <div className="space-y-4">
                {/* Datos */}
                <div className="grid grid-cols-2 gap-2">
                  <InfoItem label="Posición" value={[panelPlayer.position1, panelPlayer.position2].filter(Boolean).join(' / ') || '—'} />
                  <InfoItem label="Año nac." value={birthYearFromBirthdate(panelPlayer.birthdate)} />
                  <InfoItem label="Equipo" value={panelPlayer.team ?? '—'} />
                  <InfoItem label="Categoría" value={panelPlayer.categoria ?? '—'} />
                  <InfoItem label="Pie" value={panelPlayer.foot ?? '—'} />
                  <InfoItem label="Nacionalidad" value={panelPlayer.nationality ?? '—'} />
                  {panelPlayer.clubContract && <InfoItem label="Contrato" value={panelPlayer.clubContract} />}
                  {panelPlayer.agency && <InfoItem label="Agencia" value={panelPlayer.agency} />}
                </div>

                {panelPlayer.contacto && (
                  <div className="px-3 py-2 bg-slate-50 rounded-lg text-secondary text-slate-700">
                    <span className="font-medium text-slate-500 mr-1">Contacto:</span>
                    {panelPlayer.contacto}
                  </div>
                )}

                {panelPlayer.comentarios && (
                  <div className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-secondary text-slate-700 leading-relaxed">
                    <div className="text-badge font-semibold text-amber-700 uppercase mb-1">Comentarios</div>
                    {panelPlayer.comentarios}
                  </div>
                )}

                {/* Etiqueta rápida — para todos los usuarios */}
                <div>
                  <div className={`${LABEL_SECCION} mb-1.5`}>{L.etiquetaJugador}</div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={L.etiquetaJugador}>
                    <button
                      type="button"
                      onClick={() => handleQuickAssessment(panelPlayer, undefined)}
                      aria-pressed={!panelPlayer.assessment}
                      className={`px-2.5 min-h-9 sm:min-h-0 sm:py-1 text-meta font-medium rounded border transition-colors ${
                        !panelPlayer.assessment ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      Sin valorar
                    </button>
                    {ALL_ASSESSMENTS.map(a => {
                      const cfg = ASSESSMENT_CONFIG[a]
                      const active = panelPlayer.assessment === a
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => handleQuickAssessment(panelPlayer, a)}
                          aria-pressed={active}
                          className={`px-2.5 min-h-9 sm:min-h-0 sm:py-1 text-meta font-medium rounded border transition-colors ${
                            active ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {a}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => openEditPlayer(panelPlayer)} className="flex-1">
                    Editar jugador
                  </Button>
                  <IconButton
                    label="Exportar informe en PDF"
                    variant="secondary"
                    loading={exportandoInforme}
                    onClick={handleExportarInforme}
                    title="Ficha y observaciones en PDF, listo para compartir (incluye un resumen generado por IA)"
                  >
                    <Download />
                  </IconButton>
                  {isAdmin && (
                    <IconButton
                      label="Eliminar jugador"
                      variant="secondary"
                      onClick={() => setConfirmDeletePlayer(true)}
                      className="text-red-600 border-red-100 hover:bg-red-50"
                    >
                      <Trash2 />
                    </IconButton>
                  )}
                </div>
                <ConfirmModal
                  open={confirmDeletePlayer}
                  title={`Eliminar a ${panelPlayer.fullName}`}
                  message={`Se eliminará la ficha${(reportCountByPlayer[panelPlayer.id] ?? 0) > 0 ? ` y sus ${reportCountByPlayer[panelPlayer.id]} informe${reportCountByPlayer[panelPlayer.id] !== 1 ? 's' : ''}` : ''}, y dejará de aparecer en los partidos a los que estaba vinculado. Esta acción no se puede deshacer.`}
                  confirmLabel={L.eliminar}
                  variant="danger"
                  onConfirm={handleDeletePlayer}
                  onCancel={() => setConfirmDeletePlayer(false)}
                />
              </div>

              {/* Informes */}
              <div className="space-y-4">
                <div className="border-t border-slate-100 md:hidden" />
                <div>
                  {(() => {
                    const { playerTeam, sortedMatches } = panelSortedMatches

                    return (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-body font-semibold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-500" />
                            {L.informes}
                            {panelReports.length > 0 && <Badge>{panelReports.length}</Badge>}
                          </h3>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Plus />}
                            aria-expanded={showAddReportForm}
                            onClick={() => {
                              setReportTitle(''); setReportText(''); setReportConclusion(''); setReportMatchId('')
                              // toggle: si ya está abierto, se cierra
                              setShowAddReportForm(f => !f)
                            }}
                          >
                            Añadir informe
                          </Button>
                        </div>

                        {/* Formulario de informe nuevo — arriba cuando está abierto */}
                        {showAddReportForm && (
                          <form
                            className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 mb-3"
                            aria-label="Nuevo informe"
                            onSubmit={e => { e.preventDefault(); void handleAddReport() }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-secondary font-semibold text-blue-700 flex items-center gap-2 flex-wrap">
                                Nuevo informe
                                {borradorRecuperado && (
                                  <span className="inline-flex items-center gap-1 text-badge font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                    Borrador recuperado
                                    <button type="button" onClick={descartarBorrador} className="underline hover:text-amber-900" title="Vaciar el formulario y olvidar el borrador">Descartar</button>
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-badge font-mono bg-white border border-blue-200 px-1.5 py-0.5 rounded text-slate-600">
                                  {currentProfile.avatar} · {currentProfile.name.split(' ')[0]}
                                </span>
                                <IconButton label="Cerrar formulario de informe" onClick={() => setShowAddReportForm(false)}><X /></IconButton>
                              </div>
                            </div>
                            <Input
                              value={reportTitle}
                              onChange={e => setReportTitle(e.target.value)}
                              placeholder="Título (opcional)"
                              aria-label="Título del informe"
                            />
                            {!reportText.trim() && (
                              <Button size="sm" variant="link" icon={<ClipboardList />} onClick={() => setReportText(REPORT_TEMPLATE)}>
                                Usar plantilla (físico · técnica · táctica · mentalidad · contexto)
                              </Button>
                            )}
                            <Textarea
                              value={reportText}
                              onChange={e => setReportText(e.target.value)}
                              rows={5}
                              placeholder="Texto del informe..."
                              aria-label="Texto del informe"
                              autoFocus
                              onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddReport() }
                              }}
                            />
                            {/* ¿De qué partido es este informe? Un toque y queda vinculado */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={LABEL_SECCION}>{L.partido}</span>
                              {reportMatchSuggestions.list.map(({ m, linked, days }) => {
                                const sel = reportMatchId === m.id
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setReportMatchId(sel ? '' : m.id)}
                                    aria-pressed={sel}
                                    title={`${m.homeTeam} vs ${m.awayTeam} · ${fmtDate(m.date)}${linked ? ' · ya vinculado a este jugador' : ''}`}
                                    className={`inline-flex items-center gap-1 text-badge font-medium rounded-full px-2 min-h-9 sm:min-h-0 sm:py-0.5 border transition-colors ${
                                      sel
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                                    }`}
                                  >
                                    {linked && <Link2 className="w-3 h-3" aria-label="Ya vinculado" />}
                                    {m.homeTeam} vs {m.awayTeam}
                                    <span className={sel ? 'text-white/70' : 'text-slate-500'}> · {days === 0 ? 'hoy' : `hace ${days}d`}</span>
                                  </button>
                                )
                              })}
                              {reportMatchSuggestions.list.length === 0 && (
                                <span className="text-badge text-slate-500">Sin partidos recientes de su equipo — búscalo abajo</span>
                              )}
                            </div>
                            {!reportMatchId && (
                              <p className="text-badge text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                                Sin partido: el informe se guarda igual, pero no aparecerá en la ficha del partido.
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Select
                                value={reportConclusion}
                                onChange={e => setReportConclusion(e.target.value as ConclusionOption)}
                                aria-label={L.veredicto}
                              >
                                <option value="">Sin {L.veredicto.toLowerCase()}</option>
                                {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                              </Select>
                              {/* Buscador de partido */}
                              <div className="relative">
                                <Input
                                  value={reportMatchId
                                    ? (() => { const m = scoutingMatches.find(x => x.id === reportMatchId); return m ? `${m.homeTeam} vs ${m.awayTeam}` : '' })()
                                    : matchSearchInput}
                                  onChange={e => { setMatchSearchInput(e.target.value); setReportMatchId('') }}
                                  onFocus={() => setMatchSearchOpen(true)}
                                  onBlur={() => setTimeout(() => setMatchSearchOpen(false), 150)}
                                  placeholder="Partido (buscar equipo...)"
                                  aria-label="Buscar partido"
                                  role="combobox"
                                  aria-expanded={matchSearchOpen}
                                  aria-autocomplete="list"
                                />
                                {matchSearchOpen && (
                                  <div role="listbox" className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={!reportMatchId}
                                      onMouseDown={() => { setReportMatchId(''); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                      className="w-full text-left px-3 py-2 sm:py-1.5 text-secondary text-slate-500 hover:bg-slate-50 border-b border-slate-100"
                                    >
                                      Sin partido vinculado
                                    </button>
                                    {sortedMatches
                                      .filter(m => {
                                        const q = matchSearchInput.toLowerCase()
                                        return !q || m.homeTeam.toLowerCase().includes(q) || m.awayTeam.toLowerCase().includes(q) || (m.competition ?? '').toLowerCase().includes(q)
                                      })
                                      .slice(0, 40)
                                      .map(m => {
                                        const d = `${m.date.slice(8)} ${MONTHS_ES[parseInt(m.date.slice(5,7))-1]} '${m.date.slice(2,4)}`
                                        const isPlayerTeam = playerTeam && (m.homeTeam.toLowerCase().includes(playerTeam) || m.awayTeam.toLowerCase().includes(playerTeam))
                                        return (
                                          <button
                                            key={m.id}
                                            type="button"
                                            role="option"
                                            aria-selected={reportMatchId === m.id}
                                            onMouseDown={() => { setReportMatchId(m.id); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                            className={`w-full text-left px-3 py-2 sm:py-1.5 text-secondary hover:bg-slate-50 flex items-center gap-2 ${isPlayerTeam ? 'bg-violet-50/60' : ''}`}
                                          >
                                            {isPlayerTeam && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                                            <span className="font-medium text-slate-700">{m.homeTeam} vs {m.awayTeam}</span>
                                            <span className="text-slate-500 ml-auto flex-shrink-0">{d}</span>
                                          </button>
                                        )
                                      })}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-badge text-slate-500">Ctrl/⌘+Enter para guardar</span>
                              <Button type="submit" size="sm" variant="primary" loading={savingReport} disabled={!reportText.trim()}>
                                {savingReport ? 'Guardando…' : 'Guardar informe'}
                              </Button>
                            </div>
                          </form>
                        )}
                      </>
                    )
                  })()}

                  <div className="space-y-3">
                    {panelReports.length === 0 ? (
                      <p className="text-secondary text-slate-500 italic">Sin informes todavía.</p>
                    ) : panelReports.map(r => {
                      const linkedMatch = r.matchId ? scoutingMatches.find(m => m.id === r.matchId) : undefined
                      const matchLabel = linkedMatch
                        ? `${linkedMatch.homeTeam} vs ${linkedMatch.awayTeam} · ${linkedMatch.date.slice(8)} ${MONTHS_ES[parseInt(linkedMatch.date.slice(5,7))-1]} '${linkedMatch.date.slice(2,4)}`
                        : undefined
                      return (
                        <ReportCard
                          key={r.id}
                          report={r}
                          profiles={profiles}
                          currentProfile={currentProfile}
                          confirmDeleteId={confirmDeleteReport}
                          onConfirmDelete={setConfirmDeleteReport}
                          onDelete={handleDeleteReport}
                          onUpdate={handleUpdateReport}
                          matchLabel={matchLabel}
                          showToast={showToast}
                          onEditingChange={handleReportEditingChange}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* ── Partidos vistos ── */}
                {(() => {
                  if (!panelPlayerId) return null
                  const playerMatchIds = matchPlayers
                    .filter(mp => mp.playerId === panelPlayerId)
                    .map(mp => mp.matchId)
                  if (playerMatchIds.length === 0) return null
                  const playerMatchList = scoutingMatches
                    .filter(m => playerMatchIds.includes(m.id))
                    .sort((a, b) => b.date.localeCompare(a.date))
                  return (
                    <div className="border-t border-slate-100 pt-4 mt-2">
                      <h3 className="text-body font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                        <ClipboardList className="w-4 h-4 text-slate-500" />
                        Partidos vistos
                        <Badge tone="primary">{playerMatchList.length}</Badge>
                      </h3>
                      <div className="space-y-1.5">
                        {playerMatchList.map(m => {
                          const d = `${m.date.slice(8)} ${MONTHS_ES[parseInt(m.date.slice(5,7))-1]} '${m.date.slice(2,4)}`
                          return (
                            <div key={m.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 group">
                              <span className="text-badge text-slate-500 font-mono flex-shrink-0 w-20">{d}</span>
                              <span className="text-secondary text-slate-700 font-medium flex-1 min-w-0 truncate">
                                {m.homeTeam} <span className="text-slate-500 font-normal">vs</span> {m.awayTeam}
                              </span>
                              {m.competition && (
                                <span className="text-badge bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{m.competition}</span>
                              )}
                              {m.viewMode === 'campo'
                                ? <MapPin aria-label="En el campo" className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                : <Video aria-label="Por vídeo" className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              }
                              <IconButton
                                label="Desvincular de este partido"
                                onClick={() => onRemoveMatchPlayer(m.id, panelPlayerId).catch(() => showToast('Error al desvincular del partido', 'error'))}
                                className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 text-slate-600 hover:text-red-600 transition-opacity"
                              >
                                <X />
                              </IconButton>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Barra fija de cierre — solo móvil */}
        {!fullscreen && (
          <div className="sm:hidden flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-white safe-area-bottom">
            <Button variant="secondary" onClick={closePanel} className="w-full">
              {L.cerrar}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
