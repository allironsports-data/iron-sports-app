import React, { useState } from 'react'
import { Search, X, Plus, ChevronDown, FileText, ChevronRight, ChevronLeft, Users, List, LayoutGrid, Pencil } from 'lucide-react'
import { Button, IconButton, Select, Input } from '../../components/ui'
import { ConfirmModal } from '../../components/ConfirmModal'
import { L } from '../../lib/labels'
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
  jugadoresView, setJugadoresView, openAddPlayer, onUpdatePlayer, showToast, onEdicionPendiente,
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
  /** Nº de cambios sin guardar de la tabla de edición rápida (lo recoge Captacion) */
  onEdicionPendiente?: (n: number) => void
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
  // Cambios pendientes en la tabla de edición: cambiar de vista pregunta antes
  const [pendientes, setPendientes] = useState(0)
  const [vistaPendiente, setVistaPendiente] = useState<JugadoresView | null>(null)
  const notificarPendientes = (n: number) => { setPendientes(n); onEdicionPendiente?.(n) }
  const cambiarVista = (v: JugadoresView) => {
    if (jugadoresView === 'edicion' && pendientes > 0 && v !== 'edicion') { setVistaPendiente(v); return }
    setJugadoresView(v)
  }
  const vistas: { id: JugadoresView; label: string; icon: React.ReactNode; title?: string }[] = [
    { id: 'lista', label: 'Lista', icon: <List /> },
    { id: 'ampliada', label: 'Ampliada', icon: <LayoutGrid />, title: 'Lista ampliada: agencia, fin de contrato, zona, Firmar y último informe' },
    { id: 'edicion', label: 'Edición', icon: <Pencil />, title: 'Tabla de edición rápida: edita celdas sin abrir cada jugador' },
  ]
  return (
    <>
      <ConfirmModal
        open={!!vistaPendiente}
        title="Cambios sin guardar"
        message={`Tienes ${pendientes} cambio${pendientes !== 1 ? 's' : ''} sin guardar en la tabla de edición. Si cambias de vista se perderán.`}
        confirmLabel="Descartar y cambiar"
        cancelLabel="Seguir editando"
        variant="danger"
        onConfirm={() => { if (vistaPendiente) setJugadoresView(vistaPendiente); setVistaPendiente(null); notificarPendientes(0) }}
        onCancel={() => setVistaPendiente(null)}
      />
      {/* Filters bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar jugador, equipo..."
              aria-label="Buscar jugador o equipo"
              className="pl-8 pr-9 py-1.5"
            />
            {search && (
              <IconButton label="Limpiar búsqueda" onClick={() => setSearch('')} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-600">
                <X />
              </IconButton>
            )}
          </div>

          {/* Filtro por etiqueta */}
          <Select
            value={assessFilter}
            onChange={e => setAssessFilter(e.target.value as ScoutingAssessment | 'all')}
            aria-label={`Filtrar por ${L.etiquetaJugador.toLowerCase()}`}
            className={SELECT_CLS}
          >
            <option value="all">{L.etiquetaJugador}: todas</option>
            {ALL_ASSESSMENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>

          {/* Categoria filter */}
          <Select
            value={categoriaFilter}
            onChange={e => setCategoriaFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            className={SELECT_CLS}
          >
            <option value="all">Todas las categorías</option>
            {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </Select>

          {/* Position filter */}
          <Select
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
            aria-label="Filtrar por posición"
            className={SELECT_CLS}
          >
            <option value="all">Todas las posiciones</option>
            {POSITIONS_SCOUTING.map(pos => <option key={pos} value={pos}>{pos}</option>)}
          </Select>

          <div className="flex-1" />
          <span className="text-secondary text-slate-500">{filtered.length} jugadores</span>
          <BotonCsv
            nombre="jugadores-captacion"
            cabeceras={['Jugador', 'Posición 1', 'Posición 2', 'Año nac.', 'Fecha nac.', 'Equipo', 'Categoría', 'Zona', L.etiquetaJugador, 'Agencia', 'Fin contrato', L.firmar, 'Nacionalidad', 'Pie', 'Informes', 'Último informe']}
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

          {/* Vista: lista | ampliada | edición rápida */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5" role="group" aria-label="Vista de la lista">
            {vistas.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => cambiarVista(v.id)}
                title={v.title}
                aria-pressed={jugadoresView === v.id}
                className={`inline-flex items-center gap-1 px-2.5 min-h-9 sm:min-h-0 sm:py-1 rounded text-meta font-semibold transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${
                  jugadoresView === v.id ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {v.icon}
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* «Zonas» y «Actualizar plantilla» viven ahora en la pestaña
              Equipos, que es donde tienen sentido */}

          {/* Add player — available to all users */}
          <Button size="sm" variant="primary" icon={<Plus />} onClick={openAddPlayer}>Añadir</Button>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 mx-auto w-full px-3 sm:px-6 py-4 ${jugadoresView === 'ampliada' ? 'max-w-[1500px]' : 'max-w-6xl'}`}>
        {/* Chips de filtros activos */}
        {(() => {
          const chips: FilterChip[] = []
          if (search.trim()) chips.push({ key: 'search', label: `Búsqueda: "${search.trim()}"`, onRemove: () => setSearch('') })
          if (assessFilter !== 'all') chips.push({ key: 'assess', label: `${L.etiquetaJugador}: ${assessFilter}`, onRemove: () => setAssessFilter('all') })
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
            onDirtyChange={notificarPendientes}
          />
        ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Jugador</th>
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Posición</th>
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Año nac.</th>
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Equipo</th>
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Categoría</th>
                  {jugadoresView === 'ampliada' && <>
                    <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Agencia</th>
                    <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Fin contrato</th>
                    <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Zona</th>
                    <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">{L.firmar}</th>
                  </>}
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">{L.etiquetaJugador}</th>
                  <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Informes</th>
                  {jugadoresView === 'ampliada' && (
                    <th className="text-left px-2 py-2.5 text-meta font-semibold text-slate-500 uppercase tracking-wide">Último</th>
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
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir ficha de ${p.fullName}`}
                      onClick={() => { abrirJugador(p.id); setShowAddPlayer(false); setShowEditPlayer(false) }}
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirJugador(p.id); setShowAddPlayer(false); setShowEditPlayer(false) }
                      }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${panelPlayerId === p.id ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 text-body max-w-[140px] sm:max-w-none truncate">{p.fullName}</div>
                        {p.nationality && <div className="text-meta text-slate-500 max-w-[140px] sm:max-w-none truncate">{p.nationality}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-secondary text-slate-600">
                        <div>{p.position1 ?? '—'}</div>
                        {p.position2 && <div className="text-slate-500">{p.position2}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-secondary text-slate-600 hidden sm:table-cell">
                        {birthYearFromBirthdate(p.birthdate)}
                      </td>
                      <td className="px-2 py-2.5 text-secondary text-slate-600 hidden md:table-cell max-w-[160px] truncate">
                        {p.team ?? '—'}
                      </td>
                      <td className="px-2 py-2.5 text-secondary text-slate-500 hidden lg:table-cell">
                        {p.categoria ?? '—'}
                      </td>
                      {jugadoresView === 'ampliada' && <>
                        <td className="px-2 py-2.5 text-secondary text-slate-600 max-w-[140px] truncate" title={p.agency ?? ''}>
                          {p.agency || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-secondary text-slate-600 whitespace-nowrap">
                          {p.clubContract || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-meta text-slate-500 max-w-[130px] truncate" title={zonaDe(p.team, clubZonas) ?? 'Sin zona'}>
                          {zonaDe(p.team, clubZonas)
                            ? ZONA_CORTA[zonaDe(p.team, clubZonas)!]
                            : <span className="text-amber-500">sin zona</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          {(() => {
                            const fe = firmasByPlayer[p.id]
                            if (!fe) return <span className="text-slate-500 text-secondary">—</span>
                            const cfg = FIRMAS_CONFIG[fe.status]
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-badge font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
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
                            type="button"
                            onClick={() => setQuickAssessId(quickAssessId === p.id ? null : p.id)}
                            className="group flex items-center gap-1 min-h-11 sm:min-h-0 px-1 -mx-1 rounded"
                            title={`Cambiar ${L.etiquetaJugador.toLowerCase()}`}
                            aria-label={`Cambiar ${L.etiquetaJugador.toLowerCase()} de ${p.fullName}`}
                            aria-haspopup="menu"
                            aria-expanded={quickAssessId === p.id}
                          >
                            <AssessmentChip a={p.assessment} />
                            <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" />
                          </button>
                          {quickAssessId === p.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setQuickAssessId(null)} />
                              <div role="menu" className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[130px]">
                                <button
                                  onClick={async () => { await handleQuickAssessment(p, undefined); setQuickAssessId(null) }}
                                  role="menuitem"
                                  className={`w-full text-left px-3 py-2 sm:py-1.5 text-secondary hover:bg-slate-50 transition-colors ${!p.assessment ? 'font-semibold text-slate-700' : 'text-slate-600'}`}
                                >
                                  Sin valorar
                                </button>
                                {ALL_ASSESSMENTS.map(a => {
                                  const cfg = ASSESSMENT_CONFIG[a]
                                  return (
                                    <button
                                      key={a}
                                      onClick={async () => { await handleQuickAssessment(p, a); setQuickAssessId(null) }}
                                      role="menuitem"
                                      className={`w-full text-left px-3 py-2 sm:py-1.5 text-secondary flex items-center gap-2 hover:bg-slate-50 transition-colors ${p.assessment === a ? `font-semibold ${cfg.text}` : 'text-slate-600'}`}
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
                          <span className="inline-flex items-center gap-1 text-secondary text-slate-500">
                            <FileText className="w-3 h-3 text-slate-500" />
                            {reportCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {jugadoresView === 'ampliada' && (
                        <td className="px-2 py-2.5 text-meta text-slate-500 whitespace-nowrap">
                          {ultimoInformeByPlayer[p.id] ? fmtDate(ultimoInformeByPlayer[p.id]) : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 inline" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
              <span className="text-body text-slate-600 font-medium">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Button variant="secondary" icon={<ChevronLeft />} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Página anterior">
                  Anterior
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const idx = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i
                  return (
                    <button
                      key={idx}
                      onClick={() => setPage(idx)}
                      aria-label={`Ir a la página ${idx + 1}`}
                      aria-current={idx === page ? 'page' : undefined}
                      className={`w-10 h-10 sm:w-8 sm:h-8 text-body font-medium rounded-lg border transition-colors ${
                        idx === page
                          ? 'bg-primary text-white border-primary'
                          : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
                <Button variant="secondary" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Página siguiente">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  )
}
