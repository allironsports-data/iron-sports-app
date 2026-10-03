import React from 'react'
import { Search, X, Plus, Calendar, Pencil, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScoutingPlayer, ScoutingMatch } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/EmptyState'
import { BotonCsv } from '../../components/BotonCsv'
import { parseDia } from '../../lib/fechas'
import { type FilterChip, ActiveFilterChips } from './comun'
import { type ShowToast, type MatchScoutInfo, SELECT_CLS, MONTHS_ES, personaToName, todayISO, isFutureMatch, SIN_CONTEO, SIN_SCOUTS, SIN_PARTIDOS } from './helpers'
import { MatchRow } from './partidos/MatchRow'
import { MatchFormPanel, type MatchFormState } from './partidos/MatchFormPanel'
import { MatchEditRow } from './partidos/MatchEditRow'

// ── Pestaña PARTIDOS · aviso de pendientes, agenda semanal, filtros, lista
// (tarjetas en móvil / tabla en escritorio) y ficha del partido al lado ──
// El estado y los handlers viven en Captacion.tsx; aquí solo se pinta.

// Partidos por páginas: con 1.900 en pantalla el navegador se atragantaba
// solo de pintarlos. Igual que la pestaña Jugadores, que ya iba de 50 en 50.
export const MATCH_PAGE_SIZE = 60

export type MatchesView = 'lista' | 'semana'
export type MatchModeFilter = 'all' | 'video' | 'campo'
export type MatchStatusFilter = 'all' | 'visto' | 'pendiente'

export function PartidosTab({
  detailMatchId, setDetailMatchId, isDesktop, isTablaAncha, misPendientes, scoutingMatches,
  matchesView, setMatchesView, openAddMatch, matchWeekOffset, setMatchWeekOffset, matchesPorFecha,
  showAddMatch, setShowAddMatch, editingMatch, setEditingMatch, profiles, handleSaveMatch, showToast,
  matchSearch, setMatchSearch, matchPersonaFilter, setMatchPersonaFilter, matchCompFilter, setMatchCompFilter,
  competicionesDisponibles, matchModeFilter, setMatchModeFilter, matchStatusFilter, setMatchStatusFilter,
  hideFutureMatches, setHideFutureMatches, mergeMode, setMergeMode, mergeSelected, setMergeSelected, toggleMergeSelected,
  filteredMatches, matchesPagina, matchPlayersByMatchId, playersById, scoutsByMatch, conteoPorPartido,
  handleToggleMatchStatus, openEditMatch, handleDeleteMatch, onRemoveMatchPlayer, currentProfile, isAdmin,
  matchPage, setMatchPage, matchTotalPages, renderFichaPartido,
}: {
  detailMatchId: string | null
  setDetailMatchId: React.Dispatch<React.SetStateAction<string | null>>
  isDesktop: boolean
  isTablaAncha: boolean
  misPendientes: ScoutingMatch[]
  scoutingMatches: ScoutingMatch[]
  matchesView: MatchesView
  setMatchesView: React.Dispatch<React.SetStateAction<MatchesView>>
  openAddMatch: () => void
  matchWeekOffset: number
  setMatchWeekOffset: React.Dispatch<React.SetStateAction<number>>
  matchesPorFecha: Record<string, ScoutingMatch[]>
  showAddMatch: boolean
  setShowAddMatch: React.Dispatch<React.SetStateAction<boolean>>
  editingMatch: ScoutingMatch | null
  setEditingMatch: React.Dispatch<React.SetStateAction<ScoutingMatch | null>>
  profiles: Profile[]
  handleSaveMatch: (form: MatchFormState) => Promise<void>
  showToast: ShowToast
  matchSearch: string
  setMatchSearch: React.Dispatch<React.SetStateAction<string>>
  matchPersonaFilter: string
  setMatchPersonaFilter: React.Dispatch<React.SetStateAction<string>>
  matchCompFilter: string
  setMatchCompFilter: React.Dispatch<React.SetStateAction<string>>
  competicionesDisponibles: string[]
  matchModeFilter: MatchModeFilter
  setMatchModeFilter: React.Dispatch<React.SetStateAction<MatchModeFilter>>
  matchStatusFilter: MatchStatusFilter
  setMatchStatusFilter: React.Dispatch<React.SetStateAction<MatchStatusFilter>>
  hideFutureMatches: boolean
  setHideFutureMatches: React.Dispatch<React.SetStateAction<boolean>>
  mergeMode: boolean
  setMergeMode: React.Dispatch<React.SetStateAction<boolean>>
  mergeSelected: Set<string>
  setMergeSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  toggleMergeSelected: (id: string) => void
  filteredMatches: ScoutingMatch[]
  matchesPagina: ScoutingMatch[]
  matchPlayersByMatchId: Record<string, string[]>
  playersById: Map<string, ScoutingPlayer>
  scoutsByMatch: Record<string, MatchScoutInfo[]>
  conteoPorPartido: Record<string, { total: number; conInforme: number }>
  handleToggleMatchStatus: (m: ScoutingMatch) => Promise<void>
  openEditMatch: (m: ScoutingMatch) => void
  handleDeleteMatch: (id: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  currentProfile: Profile
  isAdmin: boolean
  matchPage: number
  setMatchPage: React.Dispatch<React.SetStateAction<number>>
  matchTotalPages: number
  /** La ficha del partido se pinta desde la raíz (comparte handlers con la versión flotante de móvil) */
  renderFichaPartido: (variant: 'modal' | 'panel') => React.ReactNode
}) {
  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      {/* Pantalla partida: lista a la izquierda, ficha del partido a la derecha */}
      <div className={detailMatchId && isDesktop ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,36%)] lg:gap-4 lg:items-start' : ''}>
        <div className="space-y-3 min-w-0">
      {/* Notificación de partidos pendientes */}
      {misPendientes.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
          <span className="text-amber-500 text-base">🔔</span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-amber-800">Tienes {misPendientes.length} partido{misPendientes.length > 1 ? 's' : ''} pendiente{misPendientes.length > 1 ? 's' : ''} de ver</span>
            <span className="text-amber-600 ml-2 text-xs">
              {misPendientes.slice(0, 6).map(m => `${m.homeTeam} vs ${m.awayTeam}`).join(' · ')}
              {misPendientes.length > 6 && ` · y ${misPendientes.length - 6} más`}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Partidos visualizados</h2>
          <p className="text-xs text-slate-400">{scoutingMatches.length} partido{scoutingMatches.length !== 1 ? 's' : ''} registrado{scoutingMatches.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setMatchesView('lista')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${matchesView === 'lista' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <ClipboardList className="w-3.5 h-3.5" /><span className="hidden sm:inline">Lista</span>
            </button>
            <button
              onClick={() => setMatchesView('semana')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${matchesView === 'semana' ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <Calendar className="w-3.5 h-3.5" /><span className="hidden sm:inline">Semana</span>
            </button>
          </div>
          <button
            onClick={openAddMatch}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir partido
          </button>
        </div>
      </div>

      {/* ── Agenda semanal de partidos ── */}
      {matchesView === 'semana' && (() => {
        const base = new Date()
        const dow0 = (base.getDay() + 6) % 7
        base.setDate(base.getDate() - dow0 + matchWeekOffset * 7)
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(base); d.setDate(base.getDate() + i)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })
        const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        return (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setMatchWeekOffset(o => o - 1)} aria-label="Semana anterior" className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-xs font-semibold text-slate-700">
                {parseDia(days[0]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – {parseDia(days[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                {matchWeekOffset === 0 && <span className="text-slate-400 font-normal"> · esta semana</span>}
              </span>
              {matchWeekOffset !== 0 && (
                <button onClick={() => setMatchWeekOffset(0)} className="text-[11px] text-blue-600 hover:underline">hoy</button>
              )}
              <button onClick={() => setMatchWeekOffset(o => o + 1)} aria-label="Semana siguiente" className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            {/* Un bloque por día, a lo ancho: el día a la izquierda y sus
                partidos en filas de una línea, con sitio para leerlos. Antes
                eran 7 columnas estrechas con letra de 9 px. */}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {days.map((d, i) => {
                const dayMatches = matchesPorFecha[d] ?? SIN_PARTIDOS
                const isToday = d === todayISO()
                return (
                  <div key={d} className={`flex items-stretch ${isToday ? 'bg-blue-50/50' : dayMatches.length === 0 ? 'bg-slate-50/60' : 'bg-white'}`}>
                    <div className={`w-[72px] sm:w-[88px] flex-shrink-0 px-2.5 py-2 border-r border-slate-100 ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                      <div className="text-[11px] font-bold uppercase">{DOW[i]}</div>
                      <div className="text-sm font-semibold leading-tight">{parseInt(d.slice(8), 10)} <span className="text-[11px] font-normal">{parseDia(d).toLocaleDateString('es-ES', { month: 'short' })}</span></div>
                      {isToday && <div className="text-[11px] font-semibold">hoy</div>}
                    </div>
                    <div className="flex-1 min-w-0 divide-y divide-slate-100">
                      {dayMatches.length === 0 && <div className="px-3 py-2 text-xs text-slate-300">—</div>}
                      {dayMatches.map(m => {
                        const scs = scoutsByMatch[m.id] ?? SIN_SCOUTS
                        const c = conteoPorPartido[m.id] ?? SIN_CONTEO
                        return (
                          <div
                            key={m.id}
                            onClick={() => setDetailMatchId(m.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 ${m.status === 'visto' ? 'text-slate-400' : 'text-slate-700'}`}
                          >
                            <span className={`w-11 flex-shrink-0 text-xs tabular-nums ${m.status === 'visto' ? '' : 'font-semibold'}`}>{m.time ?? '—'}</span>
                            <span className="min-w-0 flex-1 truncate text-xs">
                              <span className={`font-medium ${m.status === 'visto' ? '' : 'text-slate-800'}`}>{m.homeTeam}</span>
                              <span className="text-slate-400 mx-1">vs</span>
                              <span className={`font-medium ${m.status === 'visto' ? '' : 'text-slate-800'}`}>{m.awayTeam}</span>
                              {m.competition && <span className="ml-2 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{m.competition}</span>}
                            </span>
                            <span className="flex-shrink-0 text-[11px]" title={m.viewMode === 'campo' ? 'En el campo' : 'Por vídeo'}>{m.viewMode === 'campo' ? '🏟️' : '📹'}</span>
                            {c.total > 0 && (
                              <span className="flex-shrink-0 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded" title={`${c.conInforme} de ${c.total} jugadores con informe`}>
                                👤 {c.conInforme}/{c.total}
                              </span>
                            )}
                            <span className="flex-shrink-0 flex items-center gap-1">
                              {scs.length === 0 && <span className="text-[11px] text-slate-300">sin scout</span>}
                              {scs.map(s2 => (
                                <span key={s2.scout} title={`${personaToName(s2.scout, profiles) || s2.scout}${s2.status === 'visto' ? ' · visto' : ' · pendiente'}`}
                                  className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${s2.status === 'visto' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'}`}>
                                  {s2.scout}{s2.status === 'visto' ? ' ✓' : ''}
                                </span>
                              ))}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); handleToggleMatchStatus(m) }}
                              title={m.status === 'visto' ? 'Marcar como pendiente' : 'Marcar como visto'}
                              aria-label={m.status === 'visto' ? 'Marcar como pendiente' : 'Marcar como visto'}
                              className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border ${m.status === 'visto' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'}`}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5,8 6,11.5 13.5,4" /></svg>
                            </button>
                            <button onClick={e => { e.stopPropagation(); openEditMatch(m) }} title="Editar" aria-label="Editar partido"
                              className="flex-shrink-0 p-1 text-slate-300 hover:text-blue-500">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">La agenda respeta los filtros de abajo. Clic en un partido para abrirlo.</p>
          </div>
        )
      })()}

      {/* Alta de partido. La edición va en la propia fila o tarjeta; el panel
          solo se usa para editar si el partido no está a la vista en la lista
          (otra página, filtrado, o desde la vista de semana). */}
      {showAddMatch && (!editingMatch || matchesView === 'semana' || !matchesPagina.some(m => m.id === editingMatch.id)) && (
        <MatchFormPanel
          key={editingMatch?.id ?? 'new'}
          initial={editingMatch ?? undefined}
          profiles={profiles}
          onSave={handleSaveMatch}
          onCancel={() => { setShowAddMatch(false); setEditingMatch(null) }}
          showToast={showToast}
          partidos={scoutingMatches}
          onOpenExisting={id => { setShowAddMatch(false); setEditingMatch(null); setDetailMatchId(id) }}
        />
      )}

      {/* Filtros */}
      {scoutingMatches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
          {/* Búsqueda libre */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={matchSearch}
              onChange={e => setMatchSearch(e.target.value)}
              placeholder="Buscar equipo, jugador, competición, notas..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {matchSearch && (
              <button onClick={() => setMatchSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Scout */}
          <select
            value={matchPersonaFilter}
            onChange={e => setMatchPersonaFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
          >
            <option value="all">Todos los scouts</option>
            {profiles.map(p => (
              <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>
            ))}
          </select>

          {/* Competición */}
          <select
            value={matchCompFilter}
            onChange={e => setMatchCompFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
          >
            <option value="all">Todas las competiciones</option>
            {competicionesDisponibles.map(c => (
              <option key={c} value={c!}>{c}</option>
            ))}
          </select>

          {/* Modo */}
          <select
            value={matchModeFilter}
            onChange={e => setMatchModeFilter(e.target.value as typeof matchModeFilter)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
          >
            <option value="all">Vídeo + Campo</option>
            <option value="video">📹 Vídeo</option>
            <option value="campo">🏟️ Campo</option>
          </select>

          {/* Estado */}
          <select
            value={matchStatusFilter}
            onChange={e => setMatchStatusFilter(e.target.value as 'all' | 'visto' | 'pendiente')}
            className={SELECT_CLS}
          >
            <option value="all">Todos los estados</option>
            <option value="visto">Vistos</option>
            <option value="pendiente">Pendientes</option>
          </select>

          {/* Ocultar futuros */}
          <button
            onClick={() => setHideFutureMatches(v => !v)}
            title={hideFutureMatches ? 'Mostrando hasta hoy incluido — clic para ver también los de mañana en adelante' : 'Ocultar los partidos de mañana en adelante (los de hoy se siguen viendo)'}
            className={`text-xs border rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              hideFutureMatches
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {hideFutureMatches ? '👁 Hasta hoy' : 'Ocultar futuros'}
          </button>

          {/* Fusionar partidos */}
          <button
            onClick={() => { setMergeMode(v => !v); setMergeSelected(new Set()) }}
            title={mergeMode ? 'Salir del modo fusión' : 'Seleccionar partidos duplicados y fusionarlos en uno'}
            className={`text-xs border rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              mergeMode
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {mergeMode ? '✕ Cancelar fusión' : '⇄ Fusionar'}
          </button>

          {/* Resultados */}
          <span className="text-xs text-slate-400 ml-auto">
            {filteredMatches.length === scoutingMatches.length
              ? `${scoutingMatches.length} partidos`
              : `${filteredMatches.length} de ${scoutingMatches.length}`}
          </span>
        </div>
      )}

      {/* Chips de filtros activos (partidos) */}
      {(() => {
        const chips: FilterChip[] = []
        if (matchSearch.trim()) chips.push({ key: 'search', label: `Búsqueda: "${matchSearch.trim()}"`, onRemove: () => setMatchSearch('') })
        if (matchPersonaFilter !== 'all') chips.push({ key: 'scout', label: `Scout: ${matchPersonaFilter}`, onRemove: () => setMatchPersonaFilter('all') })
        if (matchCompFilter !== 'all') chips.push({ key: 'comp', label: `Competición: ${matchCompFilter}`, onRemove: () => setMatchCompFilter('all') })
        if (matchModeFilter !== 'all') chips.push({ key: 'mode', label: matchModeFilter === 'video' ? 'Modo: Vídeo' : 'Modo: Campo', onRemove: () => setMatchModeFilter('all') })
        if (matchStatusFilter !== 'all') chips.push({ key: 'status', label: matchStatusFilter === 'visto' ? 'Estado: Vistos' : 'Estado: Pendientes', onRemove: () => setMatchStatusFilter('all') })
        if (hideFutureMatches) chips.push({ key: 'nofuture', label: 'Hasta hoy incluido', onRemove: () => setHideFutureMatches(false) })
        if (chips.length === 0) return null
        return (
          <ActiveFilterChips
            chips={chips}
            onClearAll={() => { setMatchSearch(''); setMatchPersonaFilter('all'); setMatchCompFilter('all'); setMatchModeFilter('all'); setMatchStatusFilter('all'); setHideFutureMatches(false) }}
          />
        )
      })()}

      {scoutingMatches.length === 0 && !showAddMatch ? (
        <EmptyState
          icon={<ClipboardList className="w-10 h-10" />}
          title="No hay partidos registrados aún"
          subtitle={isAdmin ? 'Si acabas de activar esta función, recuerda ejecutar el SQL de creación de tabla en Supabase' : 'Añade el primero'}
          action={
            <button
              onClick={openAddMatch}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir partido
            </button>
          }
        />
      ) : (
        matchesView === 'semana' ? null : (
        <>
          {/* ── Tarjetas (solo en móvil: en escritorio ni se construyen) ── */}
          {!isTablaAncha && (
          <div className="space-y-2">
            {matchesPagina.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No hay partidos que coincidan con los filtros</div>
            ) : matchesPagina.map(m => {
              if (editingMatch?.id === m.id) {
                return (
                  <MatchFormPanel
                    key={`edit-${m.id}`}
                    initial={m}
                    profiles={profiles}
                    onSave={handleSaveMatch}
                    onCancel={() => { setShowAddMatch(false); setEditingMatch(null) }}
                    showToast={showToast}
                  />
                )
              }
              const linkedPlayerIds = matchPlayersByMatchId[m.id] ?? []
              const linkedPlayers = linkedPlayerIds.map(id => playersById.get(id)).filter(Boolean) as ScoutingPlayer[]
              const isVisto = m.status === 'visto'
              const isFuture = isFutureMatch(m.date)
              const day = m.date.slice(8); const mon = MONTHS_ES[parseInt(m.date.slice(5, 7)) - 1]; const yr = m.date.slice(2, 4)
              return (
                <div key={m.id} className={`bg-white border rounded-xl p-3 space-y-2 ${
                  isVisto ? 'border-slate-200' :
                  isFuture ? 'border-blue-200 bg-blue-50/30' :
                  'border-amber-200 bg-amber-50/30'
                }`}>
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    {mergeMode && (
                      <input
                        type="checkbox"
                        checked={mergeSelected.has(m.id)}
                        onChange={() => toggleMergeSelected(m.id)}
                        className="w-5 h-5 rounded mt-0.5 flex-shrink-0 accent-violet-600"
                        aria-label={`Seleccionar ${m.homeTeam} vs ${m.awayTeam} para fusionar`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 leading-tight">
                        {m.homeTeam} <span className="text-slate-400 font-normal text-xs">vs</span> {m.awayTeam}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`text-xs ${isFuture ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                          {day} {mon} &apos;{yr}{m.time ? ` · ${m.time}` : ''}
                        </span>
                        {m.competition && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{m.competition}</span>}
                        {m.viewMode === 'campo'
                          ? <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">🏟️ Campo</span>
                          : <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">📹 Vídeo</span>
                        }
                        {(scoutsByMatch[m.id] ?? []).map(s2 => (
                          <span key={s2.scout} className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${s2.status === 'visto' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'}`}>
                            {s2.scout}{s2.status === 'visto' ? ' ✓' : ''}
                          </span>
                        ))}
                      </div>
                      {m.notes && <div className="text-xs text-slate-400 mt-1 truncate">{m.notes}</div>}
                    </div>
                    {/* Right: visto + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleMatchStatus(m)}
                        aria-label={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
                          isVisto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300'
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2.5,8 6,11.5 13.5,4" />
                        </svg>
                      </button>
                      <button onClick={() => openEditMatch(m)} aria-label="Editar partido" className="p-3 -m-1 text-slate-400 hover:text-blue-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Linked players */}
                  {linkedPlayers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {linkedPlayers.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-0.5 rounded-full">
                          {p.fullName}
                          <button
                            onClick={() => onRemoveMatchPlayer(m.id, p.id).catch(() => showToast('Error al desvincular el jugador del partido', 'error'))}
                            aria-label={`Desvincular a ${p.fullName}`}
                            className="text-violet-400 hover:text-red-500 ml-0.5 p-1.5 -m-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setDetailMatchId(m.id)}
                    className="w-full text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg py-2 hover:bg-violet-100 transition-colors"
                  >
                    Abrir partido · jugadores, scouts e informes
                  </button>
                </div>
              )
            })}
          </div>
          )}

          {/* ── Tabla (solo en escritorio) ── */}
          {isTablaAncha && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2.5 font-semibold w-[88px]">Fecha</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Local</th>
                    <th className="text-center px-2 py-2.5 font-semibold w-6">vs</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Visitante</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Competición</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-[90px]">Modo</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Scout</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-14">Vistos</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Notas</th>
                    <th className="text-center px-3 py-2.5 font-semibold w-12">Visto</th>
                    <th className="px-3 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchesPagina.map(m => {
                    if (editingMatch?.id === m.id) {
                      return (
                        <MatchEditRow
                          key={`edit-${m.id}`}
                          match={m}
                          profiles={profiles}
                          onSave={async (f) => { await handleSaveMatch(f); showToast('Partido actualizado') }}
                          onCancel={() => { setShowAddMatch(false); setEditingMatch(null) }}
                        />
                      )
                    }
                    const scoutName = personaToName(m.assignedTo, profiles)
                    return (
                      <MatchRow
                        key={m.id}
                        match={m}
                        scoutName={scoutName}
                        scouts={scoutsByMatch[m.id] ?? SIN_SCOUTS}
                        profiles={profiles}
                        currentProfile={currentProfile}
                        isAdmin={isAdmin}
                        conteo={conteoPorPartido[m.id] ?? SIN_CONTEO}
                        onEdit={openEditMatch}
                        onDelete={handleDeleteMatch}
                        onToggleStatus={handleToggleMatchStatus}
                        onOpenDetail={setDetailMatchId}
                        mergeMode={mergeMode}
                        mergeSelected={mergeSelected.has(m.id)}
                        onToggleMerge={toggleMergeSelected}
                      />
                    )
                  })}
                  {filteredMatches.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-slate-400 text-sm">
                        No hay partidos que coincidan con los filtros
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Paginador de partidos */}
          {filteredMatches.length > MATCH_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 mt-3 text-xs text-slate-500">
              <span>
                Mostrando {matchPage * MATCH_PAGE_SIZE + 1}–{Math.min((matchPage + 1) * MATCH_PAGE_SIZE, filteredMatches.length)} de {filteredMatches.length} partidos
              </span>
              <BotonCsv
                nombre="partidos-captacion"
                cabeceras={['Fecha', 'Hora', 'Local', 'Visitante', 'Competición', 'Modo', 'Estado', 'Scouts', 'Jugadores vinculados', 'Con informe', 'Notas']}
                filas={() => filteredMatches.map(m => {
                  const c = conteoPorPartido[m.id] ?? SIN_CONTEO
                  return [
                    m.date, m.time ?? '', m.homeTeam, m.awayTeam, m.competition ?? '',
                    m.viewMode === 'campo' ? 'Campo' : 'Vídeo',
                    m.status === 'visto' ? 'Visto' : 'Pendiente',
                    (scoutsByMatch[m.id] ?? []).map(x => x.scout).join(', '),
                    c.total, c.conInforme, m.notes ?? '',
                  ]
                })}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMatchPage(p => Math.max(0, p - 1))}
                  disabled={matchPage === 0}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40 hover:border-slate-400"
                >
                  ← Anterior
                </button>
                <span className="font-semibold text-slate-600">{matchPage + 1} / {matchTotalPages}</span>
                <button
                  onClick={() => setMatchPage(p => Math.min(matchTotalPages - 1, p + 1))}
                  disabled={matchPage >= matchTotalPages - 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40 hover:border-slate-400"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
        )
      )}
        </div>

        {/* Ficha del partido, pegada al lado de la lista pero con scroll
            propio: antes, si la ficha era más alta que la pantalla, no
            había forma de llegar al final. */}
        {detailMatchId && isDesktop && (
          <aside className="hidden lg:block lg:sticky lg:top-4 min-w-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            {renderFichaPartido('panel')}
          </aside>
        )}
      </div>
    </div>
  )
}
