import React, { useState } from 'react'
import { X, Plus, Trash2, FileText, Maximize2, Minimize2, Pencil, ClipboardList, Download } from 'lucide-react'
import { generarInformeScouting } from '../../lib/informeScouting'
import type { ScoutingPlayer, ScoutingReport, ScoutingAssessment, ScoutingMatch, ScoutingMatchPlayer, FirmasEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import type { Equipo as EquipoCatalogo } from '../../lib/db'
import { isValidName } from '../../lib/validate'
import { ZONA_CORTA, SIN_ZONA, normEquipo, type Zona } from '../../lib/zonas'
import type { buscarJugadoresParecidos } from '../../lib/duplicados'
import { AssessmentChip, FormRow, InfoItem, Spinner, ReportCard } from './comun'
import { type ShowToast, type CaptacionTab, type ConclusionOption, ASSESSMENT_CONFIG, ALL_ASSESSMENTS, POSITIONS_SCOUTING, CONCLUSION_OPTIONS, MONTHS_ES, REPORT_TEMPLATE, birthYearFromBirthdate, fmtDate } from './helpers'
import { AddToFirmasButton } from './firmas/AddToFirmasButton'
import { type FilaEquipo, SIN_CATEGORIA, inicioTemporada, etiquetaTemporada } from './filasEquipos'
// ── Panel lateral (persiste entre pestañas) ───────────────────────────
// Tres caras: formulario de alta/edición de jugador, ficha del equipo y
// ficha del jugador (con el formulario de informe, borrador y cola).
// TODO el estado y los handlers viven en Captacion.tsx: el borrador y la
// cola de envío tienen que sobrevivir al cierre del panel, y el ESC de la
// raíz necesita saber si hay un formulario abierto. Aquí solo se pinta.

type PlayerFormState = Omit<ScoutingPlayer, 'id' | 'createdAt'>
type JugadorParecido = ReturnType<typeof buscarJugadoresParecidos>[number]

export function PlayerPanel({
  // carcasa
  fullscreen, setFullscreen, isDesktop, headerHeight, closePanel, showToast, isAdmin, currentProfile, profiles,
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
  headerHeight: number
  closePanel: () => void
  showToast: ShowToast
  isAdmin: boolean
  currentProfile: Profile
  profiles: Profile[]
  setCaptTab: React.Dispatch<React.SetStateAction<CaptacionTab>>
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

  return (
    <>
      {!fullscreen && !isDesktop && (
        <div
          className="fixed inset-x-0 bottom-0 bg-black/20 z-30"
          style={{ top: headerHeight }}
          onClick={closePanel}
        />
      )}

      <div
        className={
          fullscreen
            ? 'fixed inset-x-0 z-40 flex flex-col bg-white overflow-hidden'
            : 'fixed right-0 w-full sm:w-[480px] bg-white shadow-2xl z-40 flex flex-col border-l border-slate-200'
        }
        style={{
          top: headerHeight,
          height: `calc(100vh - ${headerHeight}px)`,
        }}
      >
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          {volverAEquipo && panelPlayer && !showEditPlayer && (
            <button
              onClick={() => { setPanelPlayerId(null); setPanelEquipo(volverAEquipo); setVolverAEquipo(null) }}
              title={`Volver a ${volverAEquipo}`}
              className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-primary border border-slate-200 rounded-lg px-2 py-1 bg-white"
            >
              ← <span className="hidden sm:inline max-w-[110px] truncate">{volverAEquipo}</span>
            </button>
          )}
          <div className="flex-1 min-w-0">
            {panelEquipo && (
              <div>
                <h2 className="text-base font-semibold text-slate-800 truncate flex items-center gap-1.5">
                  {renombrando === null ? (
                    <>
                      <span className="truncate">{filaEquipoAbierta?.nombre ?? panelEquipo}</span>
                      <button
                        onClick={() => setRenombrando(filaEquipoAbierta?.nombre ?? panelEquipo)}
                        title="Cambiar el nombre del equipo"
                        className="text-slate-300 hover:text-primary flex-shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <input
                      value={renombrando}
                      onChange={e => setRenombrando(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void guardarRenombre()
                        if (e.key === 'Escape') setRenombrando(null)
                      }}
                      autoFocus
                      className="text-base font-semibold border border-primary rounded-lg px-2 py-0.5 w-full focus:outline-none"
                    />
                  )}
                </h2>
                <div className="text-xs text-slate-500 mt-0.5">
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
                <h2 className="text-base font-semibold text-slate-800 truncate">{panelPlayer.fullName}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <AssessmentChip a={panelPlayer.assessment} />
                  {panelPlayer.categoria && (
                    <span className="text-xs text-slate-500">{panelPlayer.categoria}</span>
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
              <h2 className="text-base font-semibold text-slate-800">
                {showAddPlayer ? 'Nuevo jugador' : `Editar: ${editTarget?.fullName ?? ''}`}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {panelPlayer && !showEditPlayer && (
              <button
                onClick={() => setFullscreen(f => !f)}
                className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title={fullscreen ? 'Minimizar' : 'Pantalla completa'}
                aria-label={fullscreen ? 'Minimizar panel' : 'Pantalla completa'}
              >
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            <button onClick={closePanel} aria-label="Cerrar panel" className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div className={`flex-1 overflow-y-auto ${fullscreen ? 'max-w-4xl mx-auto w-full' : ''} pb-14 sm:pb-0`}>

          {/* ── Add / Edit player form ── */}
          {(showAddPlayer || showEditPlayer) && (
            <div className="p-4 space-y-3">
              <FormRow label="Nombre *">
                <input
                  value={form.fullName}
                  onChange={e => {
                    const v = e.target.value
                    setForm(f => ({ ...f, fullName: v }))
                    if (playerNameError && isValidName(v)) setPlayerNameError('')
                  }}
                  className="field"
                  placeholder="Nombre completo"
                  aria-invalid={!!playerNameError}
                />
                {playerNameError && (
                  <p className="text-xs text-red-500 mt-1">{playerNameError}</p>
                )}
                {jugadoresParecidos.length > 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-xs text-amber-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">¿Es alguno de estos?</span>
                      <button onClick={() => setOcultarParecidos(true)} className="ml-auto text-[11px] text-amber-700 hover:underline">No, crear nuevo</button>
                    </div>
                    {jugadoresParecidos.map(({ player: p, tipo, mismoEquipo }) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="min-w-0 truncate">
                          <b>{p.fullName}</b>
                          <span className="text-amber-700/80"> · {p.team || 'sin equipo'} · {reportCountByPlayer[p.id] ?? 0} inf.</span>
                          {tipo === 'exacto' && <span className="ml-1 text-[10px] font-bold uppercase">mismo nombre</span>}
                          {tipo !== 'exacto' && mismoEquipo && <span className="ml-1 text-[10px] font-bold uppercase">mismo equipo</span>}
                        </span>
                        <button
                          onClick={() => { setShowAddPlayer(false); setForm(emptyForm()); abrirJugador(p.id) }}
                          className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-md bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700"
                        >
                          Abrir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </FormRow>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormRow label="Posición 1">
                  <select value={form.position1 ?? ''} onChange={e => setForm(f => ({ ...f, position1: e.target.value }))} className="field">
                    <option value="">—</option>
                    {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Posición 2">
                  <select value={form.position2 ?? ''} onChange={e => setForm(f => ({ ...f, position2: e.target.value }))} className="field">
                    <option value="">—</option>
                    {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </FormRow>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormRow label="Fecha nac.">
                  <input type="date" value={form.birthdate ?? ''} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))}
                    className="field" />
                </FormRow>
                <FormRow label="Pie">
                  <select value={form.foot ?? ''} onChange={e => setForm(f => ({ ...f, foot: e.target.value }))} className="field">
                    <option value="">—</option>
                    <option>Derecho</option><option>Izquierdo</option><option>Ambidiestro</option>
                  </select>
                </FormRow>
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
              <FormRow label="Equipo">
                <input
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
                  className="field" placeholder="Escribe y elige, o pon uno nuevo" />
              </FormRow>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormRow label="Categoría">
                  <input
                    list="lista-categorias"
                    value={form.categoria ?? ''}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="field" placeholder="Juveniles, Segunda RFEF..." />
                </FormRow>
                <FormRow label="Nac.">
                  <input value={form.nationality ?? ''} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                    className="field" placeholder="Española..." />
                </FormRow>
              </div>
              <FormRow label="Assessment">
                <select value={form.assessment ?? ''} onChange={e => setForm(f => ({ ...f, assessment: (e.target.value as ScoutingAssessment) || undefined }))} className="field">
                  <option value="">Sin valorar</option>
                  {ALL_ASSESSMENTS.map(a => <option key={a}>{a}</option>)}
                </select>
              </FormRow>
              <FormRow label="Agencia">
                <input value={form.agency ?? ''} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))}
                  className="field" placeholder="Representante..." />
              </FormRow>
              <FormRow label="Contrato club">
                <input value={form.clubContract ?? ''} onChange={e => setForm(f => ({ ...f, clubContract: e.target.value }))}
                  className="field" placeholder="30/06/2026" />
              </FormRow>
              <FormRow label="Contacto">
                <input value={form.contacto ?? ''} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                  className="field" placeholder="Email / teléfono" />
              </FormRow>
              <FormRow label="Comentarios">
                <textarea value={form.comentarios ?? ''} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))}
                  rows={3} className="field resize-none" placeholder="Notas generales..." />
              </FormRow>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowAddPlayer(false); setShowEditPlayer(false) }}
                  className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePlayer}
                  disabled={!form.fullName.trim() || savingPlayer}
                  className="flex-1 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {savingPlayer && <Spinner />}
                  {savingPlayer ? 'Guardando…' : showEditPlayer ? 'Guardar cambios' : 'Crear jugador'}
                </button>
              </div>
            </div>
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
                    <button
                      onClick={() => void guardar({ relevante: !f.relevante })}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-lg border px-3 py-1.5 transition-colors ${
                        f.relevante ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400'
                      }`}
                    >★ {f.relevante ? 'Relevante' : 'Marcar relevante'}</button>
                    <button
                      onClick={() => void guardar({ cubierto: !f.cubierto })}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-lg border px-3 py-1.5 transition-colors ${
                        f.cubierto ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-slate-500 border-slate-200 hover:border-green-400'
                      }`}
                    >✓ {f.cubierto ? 'Cubierto' : 'Marcar cubierto'}</button>
                  </div>

                  {/* Los números */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { n: f.jugadores, l: 'jugadores' },
                      { n: f.informes, l: 'informes' },
                      { n: f.partidos, l: `partidos ${etiquetaTemporada(inicioTemporada())}` },
                      { n: f.partidosHist, l: 'partidos total' },
                    ].map(x => (
                      <div key={x.l} className="bg-slate-50 rounded-lg px-2 py-1.5">
                        <div className="text-base font-bold text-slate-800 leading-none">{x.n}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{x.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Categoría (la zona se cambia en 📍 Zonas, porque es del club) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoría</label>
                      <select
                        value={f.categoria === SIN_CATEGORIA ? '' : f.categoria}
                        onChange={e => void guardar({ categoria: e.target.value || undefined })}
                        className="field"
                      >
                        <option value="">— sin categoría —</option>
                        {categoriasConocidas.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zona (del club {f.club})</label>
                      <button onClick={() => setZonasAbierto(true)} className="field text-left hover:border-primary">
                        {f.zona === SIN_ZONA ? <span className="text-amber-600">sin zona — asignar</span> : f.zona}
                      </button>
                    </div>
                  </div>

                  {/* Últimos partidos */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Partidos suyos ({partidosEquipo.length})</p>
                    {partidosEquipo.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Ninguno todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {partidosEquipo.slice(0, 8).map(m => (
                          <button
                            key={m.id}
                            onClick={() => { closePanel(); setCaptTab('partidos'); setDetailMatchId(m.id) }}
                            className="w-full text-left text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 hover:border-primary flex items-center gap-2"
                          >
                            <span className="text-slate-400 w-14 flex-shrink-0">{fmtDate(m.date)}</span>
                            <span className="text-slate-700 truncate">{m.homeTeam} – {m.awayTeam}</span>
                            {m.status === 'visto' && <span className="ml-auto text-green-600">✓</span>}
                          </button>
                        ))}
                        {partidosEquipo.length > 8 && (
                          <p className="text-[10.5px] text-slate-400 italic">y {partidosEquipo.length - 8} más</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Plantilla */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                    Jugadores en la BBDD ({f.plantilla.length})
                  </p>
                  {f.plantilla.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">
                      Ninguno. Usa «📋 Actualizar plantilla» para pegar la plantilla del club de golpe.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {f.plantilla.map(p => (
                        <button
                          key={p.id}
                          onClick={() => abrirJugador(p.id, f.nombre)}
                          className="w-full flex items-center gap-2 text-left bg-white border border-slate-200 rounded-lg px-2 py-1.5 hover:border-primary"
                        >
                          <span className="text-xs font-semibold text-slate-700 truncate flex-1">{p.fullName}</span>
                          <span className="text-[10px] text-slate-400 w-10 text-right">{p.position1 ?? '—'}</span>
                          <span className="text-[10px] text-slate-400 w-8 text-right">{birthYearFromBirthdate(p.birthdate)}</span>
                          <AssessmentChip a={p.assessment} small />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Player detail ── */}
          {panelPlayer && !showEditPlayer && (
            <div className={`p-4 space-y-5 ${fullscreen ? 'grid grid-cols-1 sm:grid-cols-2 gap-6 items-start' : ''}`}>
              <div className="space-y-4">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2">
                  <InfoItem label="Posición" value={[panelPlayer.position1, panelPlayer.position2].filter(Boolean).join(' / ') || '—'} />
                  <InfoItem label="Año nac." value={birthYearFromBirthdate(panelPlayer.birthdate)} />
                  <InfoItem label="Equipo" value={panelPlayer.team ?? '—'} />
                  <InfoItem label="Categoría" value={panelPlayer.categoria ?? '—'} />
                  <InfoItem label="Pie" value={panelPlayer.foot ?? '—'} />
                  <InfoItem label="Nac." value={panelPlayer.nationality ?? '—'} />
                  {panelPlayer.clubContract && <InfoItem label="Contrato" value={panelPlayer.clubContract} />}
                  {panelPlayer.agency && <InfoItem label="Agencia" value={panelPlayer.agency} />}
                </div>

                {panelPlayer.contacto && (
                  <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-700">
                    <span className="font-medium text-slate-500 mr-1">Contacto:</span>
                    {panelPlayer.contacto}
                  </div>
                )}

                {panelPlayer.comentarios && (
                  <div className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-slate-700 leading-relaxed">
                    <div className="text-[11px] font-semibold text-amber-600 uppercase mb-1">Comentarios</div>
                    {panelPlayer.comentarios}
                  </div>
                )}

                {/* Quick assessment — available to all users */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Assessment</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => handleQuickAssessment(panelPlayer, undefined)}
                      className={`px-2 py-1.5 sm:py-1 text-[11px] font-medium rounded border transition-colors ${
                        !panelPlayer.assessment ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
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
                          onClick={() => handleQuickAssessment(panelPlayer, a)}
                          className={`px-2 py-1.5 sm:py-1 text-[11px] font-medium rounded border transition-colors ${
                            active ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {a}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditPlayer(panelPlayer)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    Editar jugador
                  </button>
                  <button
                    onClick={handleExportarInforme}
                    disabled={exportandoInforme}
                    title="Ficha y observaciones en PDF, listo para compartir (incluye un resumen generado por IA)"
                    aria-label="Exportar informe"
                    className="p-2.5 sm:p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 border border-slate-200 disabled:opacity-60"
                  >
                    {exportandoInforme
                      ? <span className="block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                  </button>
                  {isAdmin && (
                    confirmDeletePlayer ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600">¿Eliminar?</span>
                        <button onClick={handleDeletePlayer} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg font-medium">Sí</button>
                        <button onClick={() => setConfirmDeletePlayer(false)} className="px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-600">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeletePlayer(true)}
                        aria-label="Eliminar jugador"
                        className="p-2.5 sm:p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-red-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Reports section */}
              <div className="space-y-4">
                <div className="border-t border-slate-100 md:hidden" />
                <div>
                  {/* Header informes + botón añadir */}
                  {(() => {
                    const { playerTeam, sortedMatches } = panelSortedMatches

                    return (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-400" />
                            Informes
                            {panelReports.length > 0 && (
                              <span className="ml-1 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{panelReports.length}</span>
                            )}
                          </h3>
                          <button
                            onClick={() => {
                              setReportTitle(''); setReportText(''); setReportConclusion(''); setReportMatchId('')
                              // toggle: if form already open close it
                              setShowAddReportForm(f => !f)
                            }}
                            className="flex items-center gap-1 px-2.5 py-2 sm:py-1 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Añadir informe
                          </button>
                        </div>

                        {/* Add report form — shown at top when open */}
                        {showAddReportForm && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-blue-700 flex items-center gap-2">
                                Nuevo informe
                                {borradorRecuperado && (
                                  <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                    Borrador recuperado
                                    <button onClick={descartarBorrador} className="underline hover:text-amber-900" title="Vaciar el formulario y olvidar el borrador">Descartar</button>
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono bg-white border border-blue-200 px-1.5 py-0.5 rounded text-slate-600">
                                  {currentProfile.avatar} · {currentProfile.name.split(' ')[0]}
                                </span>
                                <button onClick={() => setShowAddReportForm(false)} aria-label="Cerrar formulario de informe" className="text-slate-400 hover:text-slate-600 p-2 -m-2 sm:p-0 sm:m-0"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                            <input
                              value={reportTitle}
                              onChange={e => setReportTitle(e.target.value)}
                              placeholder="Título (opcional)"
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            />
                            {!reportText.trim() && (
                              <button
                                onClick={() => setReportText(REPORT_TEMPLATE)}
                                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                              >
                                📋 Usar plantilla (físico · técnica · táctica · mentalidad · contexto)
                              </button>
                            )}
                            <textarea
                              value={reportText}
                              onChange={e => setReportText(e.target.value)}
                              rows={4}
                              placeholder="Texto del informe..."
                              autoFocus
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                              onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddReport() }
                              }}
                            />
                            {/* ¿De qué partido es este informe? Un toque y queda vinculado */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Partido</span>
                              {reportMatchSuggestions.list.map(({ m, linked, days }) => {
                                const sel = reportMatchId === m.id
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => setReportMatchId(sel ? '' : m.id)}
                                    title={`${m.homeTeam} vs ${m.awayTeam} · ${fmtDate(m.date)}${linked ? ' · ya vinculado a este jugador' : ''}`}
                                    className={`text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
                                      sel
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                                    }`}
                                  >
                                    {linked && '✓ '}{m.homeTeam} vs {m.awayTeam}
                                    <span className={sel ? 'text-white/70' : 'text-slate-400'}> · {days === 0 ? 'hoy' : `hace ${days}d`}</span>
                                  </button>
                                )
                              })}
                              {reportMatchSuggestions.list.length === 0 && (
                                <span className="text-[11px] text-slate-400">Sin partidos recientes de su equipo — búscalo abajo</span>
                              )}
                            </div>
                            {!reportMatchId && (
                              <p className="text-[10.5px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                                Sin partido: el informe se guarda igual, pero no aparecerá en la ficha del partido.
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <select
                                value={reportConclusion}
                                onChange={e => setReportConclusion(e.target.value as ConclusionOption)}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                              >
                                <option value="">Sin conclusión</option>
                                {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              {/* Searchable match selector */}
                              <div className="relative">
                                <input
                                  value={reportMatchId
                                    ? (() => { const m = scoutingMatches.find(x => x.id === reportMatchId); return m ? `${m.homeTeam} vs ${m.awayTeam}` : '' })()
                                    : matchSearchInput}
                                  onChange={e => { setMatchSearchInput(e.target.value); setReportMatchId('') }}
                                  onFocus={() => setMatchSearchOpen(true)}
                                  onBlur={() => setTimeout(() => setMatchSearchOpen(false), 150)}
                                  placeholder="🏟 Partido (buscar equipo...)"
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                />
                                {matchSearchOpen && (
                                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    <button
                                      onMouseDown={() => { setReportMatchId(''); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
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
                                            onMouseDown={() => { setReportMatchId(m.id); setMatchSearchInput(''); setMatchSearchOpen(false) }}
                                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 ${isPlayerTeam ? 'bg-violet-50/60' : ''}`}
                                          >
                                            {isPlayerTeam && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                                            <span className="font-medium text-slate-700">{m.homeTeam} vs {m.awayTeam}</span>
                                            <span className="text-slate-400 ml-auto flex-shrink-0">{d}</span>
                                          </button>
                                        )
                                      })}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">⌘+Enter para guardar</span>
                              <button
                                onClick={handleAddReport}
                                disabled={!reportText.trim() || savingReport}
                                className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              >
                                {savingReport && <Spinner />}
                                {savingReport ? 'Guardando…' : 'Guardar informe'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}

                  <div className="space-y-3">
                    {panelReports.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin informes todavía.</p>
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
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                        <ClipboardList className="w-4 h-4 text-slate-400" />
                        Partidos vistos
                        <span className="ml-1 text-xs bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-semibold">{playerMatchList.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {playerMatchList.map(m => {
                          const d = `${m.date.slice(8)} ${MONTHS_ES[parseInt(m.date.slice(5,7))-1]} '${m.date.slice(2,4)}`
                          return (
                            <div key={m.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 group">
                              <span className="text-[11px] text-slate-400 font-mono flex-shrink-0 w-20">{d}</span>
                              <span className="text-xs text-slate-700 font-medium flex-1 min-w-0 truncate">
                                {m.homeTeam} <span className="text-slate-400 font-normal">vs</span> {m.awayTeam}
                              </span>
                              {m.competition && (
                                <span className="text-[11px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">{m.competition}</span>
                              )}
                              {m.viewMode === 'campo'
                                ? <span className="text-[11px] text-emerald-600 flex-shrink-0">🏟</span>
                                : <span className="text-[11px] text-blue-500 flex-shrink-0">📹</span>
                              }
                              <button
                                onClick={() => onRemoveMatchPlayer(m.id, panelPlayerId).catch(() => showToast('Error al desvincular del partido', 'error'))}
                                className="sm:opacity-0 sm:group-hover:opacity-100 p-2 -m-1.5 sm:p-0 sm:m-0 text-slate-300 hover:text-red-400 flex-shrink-0 transition-opacity"
                                title="Desvincular de este partido"
                                aria-label="Desvincular de este partido"
                              >
                                <X className="w-3 h-3" />
                              </button>
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

        {/* Sticky close bar — mobile only */}
        {!fullscreen && (
          <div className="sm:hidden flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-white safe-area-bottom">
            <button
              onClick={closePanel}
              className="w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </>
  )
}
