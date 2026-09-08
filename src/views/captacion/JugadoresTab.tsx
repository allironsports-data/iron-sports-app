import React from 'react'
import { Search, X, Plus, ChevronDown, FileText, ChevronRight, Users } from 'lucide-react'
import type { ScoutingPlayer, ScoutingAssessment, FirmasEntry } from '../../types'
import { ScoutingTable } from '../ScoutingTable'
import { EmptyState } from '../../components/EmptyState'
import { BotonCsv } from '../../components/BotonCsv'
import { ZONA_CORTA, zonaDe, type Zona } from '../../lib/zonas'
import { type FilterChip, AssessmentChip, ActiveFilterChips } from './comun'
import { type ShowToast, ASSESSMENT_CONFIG, ALL_ASSESSMENTS, SELECT_CLS, POSITIONS_SCOUTING, birthYearFromBirthdate, fmtDate } from './helpers'
import { FIRMAS_CONFIG } from './firmas/helpers'
// ── Pestaña JUGADORES · filtros, tabla y paginación ───────────────────
// Todo el estado vive en Captacion.tsx (se comparte con el panel lateral
// y con la exportación CSV); aquí solo se pinta.

export const PAGE_SIZE = 50

export type JugadoresView = 'lista' | 'ampliada' | 'edicion'

export function JugadoresTab({
  search, setSearch, assessFilter, setAssessFilter, categoriaFilter, setCategoriaFilter, posFilter, setPosFilter,
  allCategories, filtered, paginated, clubZonas, firmasByPlayer, reportCountByPlayer, ultimoInformeByPlayer,
  jugadoresView, setJugadoresView, openAddPlayer, onUpdatePlayer, showToast,
  abrirJugador, setShowAddPlayer, setShowEditPlayer, panelPlayerId,
  quickAssessId, setQuickAssessId, handleQuickAssessment,
  totalPages, page, setPage,
}: {
  search: string
  setSearch: React.Dispatch<React.SetStateAction<string>>
  assessFilter: ScoutingAssessment | 'all'
  setAssessFilter: React.Dispatch<React.SetStateAction<ScoutingAssessment | 'all'>>
  categoriaFilter: string
  setCategoriaFilter: React.Dispatch<React.SetStateAction<string>>
  posFilter: string
  setPosFilter: React.Dispatch<React.SetStateAction<string>>
  allCategories: string[]
  filtered: ScoutingPlayer[]
  paginated: ScoutingPlayer[]
  clubZonas: Record<string, Zona>
  firmasByPlayer: Record<string, FirmasEntry>
  reportCountByPlayer: Record<string, number>
  ultimoInformeByPlayer: Record<string, string>
  jugadoresView: JugadoresView
  setJugadoresView: React.Dispatch<React.SetStateAction<JugadoresView>>
  openAddPlayer: () => void
  onUpdatePlayer: (p: ScoutingPlayer) => void
  showToast: ShowToast
  abrirJugador: (id: string | null, desdeEquipo?: string) => void
  setShowAddPlayer: React.Dispatch<React.SetStateAction<boolean>>
  setShowEditPlayer: React.Dispatch<React.SetStateAction<boolean>>
  panelPlayerId: string | null
  quickAssessId: string | null
  setQuickAssessId: React.Dispatch<React.SetStateAction<string | null>>
  handleQuickAssessment: (player: ScoutingPlayer, assessment: ScoutingAssessment | undefined) => Promise<void>
  totalPages: number
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
}) {
  return (
    <>
      {/* Filters bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar jugador, equipo..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Assessment filter */}
          <select
            value={assessFilter}
            onChange={e => setAssessFilter(e.target.value as ScoutingAssessment | 'all')}
            className={SELECT_CLS}
          >
            <option value="all">Assessment: todos</option>
            {ALL_ASSESSMENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Categoria filter */}
          <select
            value={categoriaFilter}
            onChange={e => setCategoriaFilter(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">Todas las categorías</option>
            {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>

          {/* Position filter */}
          <select
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">Todas las posiciones</option>
            {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
          </select>

          <div className="flex-1" />
          <span className="text-xs text-slate-400">{filtered.length} jugadores</span>
          <BotonCsv
            nombre="jugadores-captacion"
            cabeceras={['Jugador', 'Posición 1', 'Posición 2', 'Año nac.', 'Fecha nac.', 'Equipo', 'Categoría', 'Zona', 'Assessment', 'Agencia', 'Fin contrato', 'Pipeline', 'Nacionalidad', 'Pie', 'Informes', 'Último informe']}
            filas={() => filtered.map(p => [
              p.fullName, p.position1 ?? '', p.position2 ?? '',
              birthYearFromBirthdate(p.birthdate), p.birthdate ?? '',
              p.team ?? '', p.categoria ?? '',
              zonaDe(p.team, clubZonas) ?? '',
              p.assessment ?? '', p.agency ?? '', p.clubContract ?? '',
              firmasByPlayer[p.id] ? FIRMAS_CONFIG[firmasByPlayer[p.id].status].label : '',
              p.nationality ?? '', p.foot ?? '',
              reportCountByPlayer[p.id] ?? 0,
              ultimoInformeByPlayer[p.id]?.slice(0, 10) ?? '',
            ])}
          />

          {/* Vista: lista | edición rápida */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setJugadoresView('lista')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                jugadoresView === 'lista' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setJugadoresView('ampliada')}
              title="Lista ampliada: agencia, fin de contrato, zona, pipeline y último informe"
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                jugadoresView === 'ampliada' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              ⊞ Ampliada
            </button>
            <button
              onClick={() => setJugadoresView('edicion')}
              title="Tabla de edición rápida: edita celdas sin abrir cada jugador"
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                jugadoresView === 'edicion' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              ✎ Edición
            </button>
          </div>

          {/* «Zonas» y «Actualizar plantilla» viven ahora en la pestaña
              Equipos, que es donde tienen sentido */}

          {/* Add player — available to all users */}
          <button
            onClick={openAddPlayer}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 mx-auto w-full px-3 sm:px-6 py-4 ${jugadoresView === 'ampliada' ? 'max-w-[1500px]' : 'max-w-6xl'}`}>
        {/* Chips de filtros activos */}
        {(() => {
          const chips: FilterChip[] = []
          if (search.trim()) chips.push({ key: 'search', label: `Búsqueda: "${search.trim()}"`, onRemove: () => setSearch('') })
          if (assessFilter !== 'all') chips.push({ key: 'assess', label: `Assessment: ${assessFilter}`, onRemove: () => setAssessFilter('all') })
          if (categoriaFilter !== 'all') chips.push({ key: 'cat', label: `Categoría: ${categoriaFilter}`, onRemove: () => setCategoriaFilter('all') })
          if (posFilter !== 'all') chips.push({ key: 'pos', label: `Posición: ${posFilter}`, onRemove: () => setPosFilter('all') })
          if (chips.length === 0) return null
          return (
            <div className="mb-3">
              <ActiveFilterChips
                chips={chips}
                onClearAll={() => { setSearch(''); setAssessFilter('all'); setCategoriaFilter('all'); setPosFilter('all') }}
              />
            </div>
          )
        })()}
        {jugadoresView === 'edicion' ? (
          <ScoutingTable
            players={filtered}
            onUpdatePlayer={onUpdatePlayer}
            showToast={showToast}
          />
        ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Jugador</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Posición</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Año nasc.</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Equipo</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Categoría</th>
                  {jugadoresView === 'ampliada' && <>
                    <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agencia</th>
                    <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fin contrato</th>
                    <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Zona</th>
                    <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pipeline</th>
                  </>}
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assessment</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Informes</th>
                  {jugadoresView === 'ampliada' && (
                    <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Último</th>
                  )}
                  <th className="text-right px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={jugadoresView === 'ampliada' ? 13 : 8}>
                      <EmptyState
                        icon={<Users className="w-10 h-10" />}
                        title="No se encontraron jugadores"
                        subtitle="Prueba a cambiar o limpiar los filtros actuales"
                      />
                    </td>
                  </tr>
                ) : paginated.map(p => {
                  const reportCount = reportCountByPlayer[p.id] ?? 0
                  return (
                    <tr
                      key={p.id}
                      onClick={() => { abrirJugador(p.id); setShowAddPlayer(false); setShowEditPlayer(false) }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${panelPlayerId === p.id ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 text-sm max-w-[140px] sm:max-w-none truncate">{p.fullName}</div>
                        {p.nationality && <div className="text-xs text-slate-400 max-w-[140px] sm:max-w-none truncate">{p.nationality}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-600">
                        <div>{p.position1 ?? '—'}</div>
                        {p.position2 && <div className="text-slate-400">{p.position2}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 hidden sm:table-cell">
                        {birthYearFromBirthdate(p.birthdate)}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 hidden md:table-cell max-w-[160px] truncate">
                        {p.team ?? '—'}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-500 hidden lg:table-cell">
                        {p.categoria ?? '—'}
                      </td>
                      {jugadoresView === 'ampliada' && <>
                        <td className="px-2 py-2.5 text-xs text-slate-600 max-w-[140px] truncate" title={p.agency ?? ''}>
                          {p.agency || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                          {p.clubContract || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-slate-500 max-w-[130px] truncate" title={zonaDe(p.team, clubZonas) ?? 'Sin zona'}>
                          {zonaDe(p.team, clubZonas)
                            ? ZONA_CORTA[zonaDe(p.team, clubZonas)!]
                            : <span className="text-amber-500">sin zona</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          {(() => {
                            const fe = firmasByPlayer[p.id]
                            if (!fe) return <span className="text-slate-300 text-xs">—</span>
                            const cfg = FIRMAS_CONFIG[fe.status]
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            )
                          })()}
                        </td>
                      </>}
                      <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            onClick={() => setQuickAssessId(quickAssessId === p.id ? null : p.id)}
                            className="group flex items-center gap-1 p-2 -m-2 sm:p-0 sm:m-0"
                            title="Cambiar assessment"
                          >
                            <AssessmentChip a={p.assessment} />
                            <ChevronDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </button>
                          {quickAssessId === p.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setQuickAssessId(null)} />
                              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[130px]">
                                <button
                                  onClick={async () => { await handleQuickAssessment(p, undefined); setQuickAssessId(null) }}
                                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${!p.assessment ? 'font-semibold text-slate-700' : 'text-slate-500'}`}
                                >
                                  Sin valorar
                                </button>
                                {ALL_ASSESSMENTS.map(a => {
                                  const cfg = ASSESSMENT_CONFIG[a]
                                  return (
                                    <button
                                      key={a}
                                      onClick={async () => { await handleQuickAssessment(p, a); setQuickAssessId(null) }}
                                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50 transition-colors ${p.assessment === a ? `font-semibold ${cfg.text}` : 'text-slate-600'}`}
                                    >
                                      {p.assessment === a && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.bg} border ${cfg.border}`} />}
                                      {a}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 hidden sm:table-cell">
                        {reportCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <FileText className="w-3 h-3 text-slate-400" />
                            {reportCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {jugadoresView === 'ampliada' && (
                        <td className="px-2 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                          {ultimoInformeByPlayer[p.id] ? fmtDate(ultimoInformeByPlayer[p.id]) : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 inline" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
              <span className="text-sm text-slate-600 font-medium">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Página anterior"
                  className="px-3 py-2 sm:py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const idx = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i
                  return (
                    <button
                      key={idx}
                      onClick={() => setPage(idx)}
                      aria-label={`Ir a la página ${idx + 1}`}
                      aria-current={idx === page ? 'page' : undefined}
                      className={`w-10 h-10 sm:w-8 sm:h-8 text-sm font-medium rounded-lg border transition-colors ${
                        idx === page
                          ? 'bg-primary text-white border-primary'
                          : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  aria-label="Página siguiente"
                  className="px-3 py-2 sm:py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  )
}
