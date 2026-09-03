import { useState, useMemo } from 'react'
import { Search, X, Plus, Pencil } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import * as db from '../../../lib/db'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { teamMatchKind, teamsAlike } from '../../../lib/equipos'
import { POS_GROUPS, grupoDe as posGroupOf, type PosGroup } from '../../../lib/campo'
import { AssessmentChip, Spinner, FichaCarcasa } from '../comun'
import { type ShowToast, type MatchScoutInfo, type ConclusionOption, type SuggestWhy, CONCLUSION_OPTIONS, normConclusion, CONCLUSION_STYLE, MONTHS_ES, birthYearFromBirthdate, personaToName, fmtDate, SUGGEST_ORDER, SUGGEST_LABEL, SEARCH_LIMIT, scoutColor } from '../helpers'
import { PegarAlineacion } from './PegarAlineacion'

// ── MatchDetailModal — ficha del partido ─────────────────────
// Todo lo del partido en una ventana: scouts asignados (varios), jugadores
// vistos con los informes de cada scout, y buscador/sugeridos para añadir más.

export function MatchDetailModal({
  match, scouts, profiles, currentProfile, isAdmin,
  scoutingPlayers, linkedPlayerIds, scoutingReports, allMatches, matchPlayersByMatchId,
  onClose, onEdit, onToggleStatus,
  onAddScout, onRemoveScout, onSetScoutStatus, onSetScoutMode,
  onAddMatchPlayer, onRemoveMatchPlayer, onAddReport, onLinkReportToMatch, onCreateAndLinkPlayer, onOpenEquipo,
  onFixPlayerTeam, onOpenPlayer, onOpenMatch, showToast,
  variant = 'modal',
}: {
  match: ScoutingMatch
  scouts: MatchScoutInfo[]
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  scoutingReports: ScoutingReport[]
  allMatches: ScoutingMatch[]
  matchPlayersByMatchId: Record<string, string[]>
  onClose: () => void
  onEdit: (m: ScoutingMatch) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onAddScout: (m: ScoutingMatch, scout: string) => void
  onRemoveScout: (m: ScoutingMatch, scout: string) => void
  onSetScoutStatus: (m: ScoutingMatch, scout: string, status: 'pendiente' | 'visto') => void
  onSetScoutMode: (m: ScoutingMatch, scout: string, viewMode: 'campo' | 'video') => void
  onAddMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onAddReport: (r: ScoutingReport) => void
  /** matchId = null → suelta el informe del partido (sin borrarlo) */
  onLinkReportToMatch: (r: ScoutingReport, matchId: string | null) => Promise<void>
  /** Abrir la ficha de un equipo desde el nombre del partido */
  onOpenEquipo: (nombre: string) => void
  /** Crea un jugador que no estaba en la BBDD y lo vincula al partido */
  onCreateAndLinkPlayer: (nombre: string, equipo: string, matchId: string) => Promise<void>
  /** Corrige en la BBDD el equipo de un jugador */
  onFixPlayerTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
  onOpenPlayer?: (id: string) => void
  /** Saltar a la ficha de otro partido sin salir de la pantalla */
  onOpenMatch?: (id: string) => void
  showToast?: ShowToast
  /** 'modal' = ventana flotante (móvil) · 'panel' = columna fija a la derecha */
  variant?: 'modal' | 'panel'
}) {
  const [playerSearch, setPlayerSearch] = useState('')
  const [suggYearFilter, setSuggYearFilter] = useState<string | null>(null)
  const [suggPosFilter, setSuggPosFilter] = useState<PosGroup | null>(null)
  const [reportFormFor, setReportFormFor] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [quickConclusion, setQuickConclusion] = useState<ConclusionOption>('')
  const [savingQuick, setSavingQuick] = useState(false)
  const [addScoutOpen, setAddScoutOpen] = useState(false)
  const [informeAbierto, setInformeAbierto] = useState<string | null>(null)

  useEscapeKey(onClose)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'

  const linkedPlayers = scoutingPlayers.filter(p => linkedPlayerIds.includes(p.id))

  const matchReportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    for (const r of scoutingReports) {
      if (r.matchId !== match.id) continue
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    return map
  }, [scoutingReports, match.id])

  // Informes escritos por esas mismas fechas pero SIN vincular a este partido
  // (el scout los escribió desde la ficha del jugador). Se enseñan igual, en
  // gris, con un botón para engancharlos al partido de un clic.
  const looseReportsByPlayer = useMemo(() => {
    const map: Record<string, ScoutingReport[]> = {}
    const matchTime = new Date(match.date).getTime()
    if (isNaN(matchTime)) return map
    for (const r of scoutingReports) {
      if (r.matchId === match.id) continue
      const d = r.fecha ?? r.createdAt
      if (!d) continue
      const t = new Date(d).getTime()
      if (isNaN(t) || Math.abs(t - matchTime) > 4 * 86400000) continue   // ±4 días
      if (!map[r.playerId]) map[r.playerId] = []
      map[r.playerId].push(r)
    }
    return map
  }, [scoutingReports, match.id, match.date])
  const linkedWithReport = linkedPlayers.filter(p => (matchReportsByPlayer[p.id] ?? []).length > 0).length

  // Resumen del partido: cuántos informes y qué se concluyó
  const totalInformes = Object.values(matchReportsByPlayer).reduce((n, rs) => n + rs.length, 0)
  const conclusionCounts = useMemo(() => {
    const m: Record<string, number> = {}
    Object.values(matchReportsByPlayer).forEach(rs => rs.forEach(r => {
      const c = normConclusion(r.conclusion)
      if (c) m[c] = (m[c] ?? 0) + 1
    }))
    return m
  }, [matchReportsByPlayer])

  // Los jugadores se agrupan por equipo: local, visitante y «otros», que es
  // como se mira un partido de verdad
  const playersBySide = useMemo(() => {
    const local: ScoutingPlayer[] = []
    const visitante: ScoutingPlayer[] = []
    const otros: ScoutingPlayer[] = []
    linkedPlayers.forEach(p => {
      if (teamMatchKind(match.homeTeam, p.team)) local.push(p)
      else if (teamMatchKind(match.awayTeam, p.team)) visitante.push(p)
      else otros.push(p)
    })
    return [
      { titulo: match.homeTeam, jugadores: local },
      { titulo: match.awayTeam, jugadores: visitante },
      { titulo: 'Otros equipos', jugadores: otros },
    ].filter(g => g.jugadores.length > 0)
  }, [linkedPlayers, match.homeTeam, match.awayTeam])

  // Otros partidos de estos mismos equipos, para saltar de uno a otro
  const partidosRelacionados = useMemo(() => allMatches
    .filter(m => m.id !== match.id &&
      (teamMatchKind(m.homeTeam, match.homeTeam) || teamMatchKind(m.awayTeam, match.homeTeam) ||
       teamMatchKind(m.homeTeam, match.awayTeam) || teamMatchKind(m.awayTeam, match.awayTeam)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4), [allMatches, match.id, match.homeTeam, match.awayTeam])

  async function handleAddPlayer(playerId: string) {
    try {
      await onAddMatchPlayer(match.id, playerId)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      showToast?.(
        err?.code === '23503'
          ? 'Ese partido ya no existe (se fusionó con otro). Recarga la página.'
          : `Error al vincular el jugador: ${err?.message ?? 'desconocido'}`,
        'error')
    }
  }

  async function handleRemovePlayer(playerId: string) {
    try {
      await onRemoveMatchPlayer(match.id, playerId)
    } catch {
      showToast?.('Error al desvincular el jugador del partido', 'error')
    }
  }

  async function saveQuickReport() {
    if (!reportFormFor || !quickText.trim() || savingQuick) return
    setSavingQuick(true)
    try {
      const saved = await db.createScoutingReport({
        playerId: reportFormFor,
        fecha: new Date().toISOString(),
        texto: quickText.trim(),
        persona: currentProfile.avatar,
        conclusion: quickConclusion || undefined,
        matchId: match.id,
        authorId: currentProfile.id,
      })
      onAddReport(saved)
      setReportFormFor(null)
      setQuickText('')
      setQuickConclusion('')
      showToast?.('Informe guardado — visible en la ficha del jugador')
    } catch {
      showToast?.('Error al guardar el informe', 'error')
    } finally {
      setSavingQuick(false)
    }
  }

  // ── Sugerencias: matching normalizado + historial ──────────
  const suggestionPool = useMemo(() => {
    const byTeam = new Map<string, SuggestWhy>()
    for (const p of scoutingPlayers) {
      if (linkedPlayerIds.includes(p.id)) continue
      const kind = teamMatchKind(p.team, match.homeTeam) ?? teamMatchKind(p.team, match.awayTeam)
      if (kind === 'exacto') byTeam.set(p.id, 'equipo')
      else if (kind === 'parcial') byTeam.set(p.id, 'posible')
    }
    for (const m2 of allMatches) {
      if (m2.id === match.id) continue
      const sameFixture =
        (teamsAlike(m2.homeTeam, match.homeTeam) && teamsAlike(m2.awayTeam, match.awayTeam)) ||
        (teamsAlike(m2.homeTeam, match.awayTeam) && teamsAlike(m2.awayTeam, match.homeTeam))
      const sameTeams = sameFixture ||
        teamsAlike(m2.homeTeam, match.homeTeam) || teamsAlike(m2.homeTeam, match.awayTeam) ||
        teamsAlike(m2.awayTeam, match.homeTeam) || teamsAlike(m2.awayTeam, match.awayTeam)
      if (!sameTeams) continue
      for (const pid of (matchPlayersByMatchId[m2.id] ?? [])) {
        if (linkedPlayerIds.includes(pid) || byTeam.has(pid)) continue
        const sp = scoutingPlayers.find(x => x.id === pid)
        if (!sp) continue
        if (sp.team?.trim() && !sameFixture) continue
        byTeam.set(pid, 'historial')
      }
    }
    return Array.from(byTeam.entries())
      .map(([id, why]) => ({ p: scoutingPlayers.find(sp => sp.id === id)!, why }))
      .filter(x => x.p)
  }, [scoutingPlayers, linkedPlayerIds, allMatches, matchPlayersByMatchId, match.id, match.homeTeam, match.awayTeam])

  const suggYears = useMemo(() =>
    Array.from(new Set(suggestionPool.map(x => x.p.birthdate?.slice(0, 4)).filter(Boolean) as string[]))
      .sort((a, b) => b.localeCompare(a)),
  [suggestionPool])
  const suggPosGroups = useMemo(() =>
    POS_GROUPS.filter(g => suggestionPool.some(x => posGroupOf(x.p.position1) === g || posGroupOf(x.p.position2) === g)),
  [suggestionPool])

  // Sin tope: se muestran todos los sugeridos (el contenedor hace scroll)
  const teamSuggested = suggestionPool
    .filter(x => !suggYearFilter || x.p.birthdate?.slice(0, 4) === suggYearFilter)
    .filter(x => !suggPosFilter || posGroupOf(x.p.position1) === suggPosFilter || posGroupOf(x.p.position2) === suggPosFilter)
    .sort((a, b) => (a.why === b.why
      ? a.p.fullName.localeCompare(b.p.fullName)
      : SUGGEST_ORDER[a.why] - SUGGEST_ORDER[b.why]))

  const searchMatches = playerSearch.length >= 2
    ? scoutingPlayers.filter(p =>
        !linkedPlayerIds.includes(p.id) &&
        p.fullName.toLowerCase().includes(playerSearch.toLowerCase())
      )
    : []
  const searchResults = playerSearch.length >= 2
    ? searchMatches.slice(0, SEARCH_LIMIT).map(p => ({ p, why: 'busqueda' as const }))
    : teamSuggested

  const freeProfiles = profiles.filter(p => p.avatar && !scouts.some(s => s.scout === p.avatar))

  const esPanel = variant === 'panel'

  return (
    <FichaCarcasa esPanel={esPanel} onClose={onClose}>
      <>
        {/* ── Cabecera ── */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">{day} {mon} '{yr}{match.time ? ` · ${match.time}` : ''}</span>
              {match.competition && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{match.competition}</span>}
              {match.viewMode === 'campo'
                ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">🏟️ Campo</span>
                : <span className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium">📹 Vídeo</span>}
            </div>
            <h3 className="mt-1 text-base font-bold text-slate-800 break-words">
              {/* Los nombres llevan a la ficha del equipo: cobertura, plantilla y sus partidos */}
              <button
                onClick={() => onOpenEquipo(match.homeTeam)}
                title={`Ver la ficha de ${match.homeTeam}`}
                className="hover:text-primary hover:underline decoration-dotted underline-offset-2"
              >{match.homeTeam}</button>
              <span className="text-slate-400 font-medium"> vs </span>
              <button
                onClick={() => onOpenEquipo(match.awayTeam)}
                title={`Ver la ficha de ${match.awayTeam}`}
                className="hover:text-primary hover:underline decoration-dotted underline-offset-2"
              >{match.awayTeam}</button>
            </h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggleStatus(match)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                isVisto
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Estado del partido"
            >
              {isVisto ? '✓ Visto' : 'Pendiente'}
            </button>
            <button onClick={() => { onEdit(match); onClose() }} className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg" title="Editar partido" aria-label="Editar partido">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={`px-4 sm:px-5 py-4 space-y-5 overflow-y-auto ${esPanel ? 'max-h-[calc(100vh-13rem)]' : 'max-h-[72vh]'}`}>
          {/* ── Scouts asignados ── */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Scouts asignados {scouts.length > 1 ? `(${scouts.length})` : ''}
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {scouts.map(s => {
                const c = scoutColor(s.scout)
                const name = personaToName(s.scout, profiles)
                const isMe = s.scout === currentProfile.avatar
                return (
                  <span key={s.scout} className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}>
                    <span className="font-mono">{s.scout}</span>
                    {name && name !== s.scout && <span className="font-normal opacity-70">{name}</span>}
                    <button
                      onClick={() => onSetScoutMode(match, s.scout, s.viewMode === 'campo' ? 'video' : 'campo')}
                      title={s.viewMode === 'campo' ? 'Lo vio en el campo — clic para cambiar a vídeo' : 'Lo vio por vídeo — clic para cambiar a campo'}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                        s.viewMode === 'campo'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      {s.viewMode === 'campo' ? '🏟️ Campo' : '📹 Vídeo'}
                    </button>
                    <button
                      onClick={() => onSetScoutStatus(match, s.scout, s.status === 'visto' ? 'pendiente' : 'visto')}
                      title={s.status === 'visto' ? 'Ya lo ha visto — marcar como pendiente' : 'Marcar como visto'}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors ${
                        s.status === 'visto'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white'
                      }`}
                    >
                      {s.status === 'visto' ? '✓ visto' : isMe ? 'marcar visto' : 'pendiente'}
                    </button>
                    {(isAdmin || isMe) && (
                      <button
                        onClick={() => onRemoveScout(match, s.scout)}
                        aria-label={`Quitar a ${name || s.scout} del partido`}
                        className="text-slate-400 hover:text-red-500 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                )
              })}
              {addScoutOpen ? (
                <select
                  autoFocus
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                  defaultValue=""
                  onBlur={() => setAddScoutOpen(false)}
                  onChange={e => { if (e.target.value) onAddScout(match, e.target.value); setAddScoutOpen(false) }}
                >
                  <option value="">Añadir scout…</option>
                  {freeProfiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setAddScoutOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 px-2 py-1 rounded-full transition-colors"
                >
                  <Plus className="w-3 h-3" /> Añadir scout
                </button>
              )}
              {scouts.length === 0 && <span className="text-xs text-slate-400 italic">Nadie asignado todavía</span>}
            </div>
            {scouts.length > 1 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Cada scout marca su parte y escribe su propio informe de cada jugador.
              </p>
            )}
          </div>

          {/* ── Resumen de un vistazo ── */}
          {linkedPlayers.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { n: linkedPlayers.length, l: 'jugadores vistos', cls: 'text-slate-800' },
                { n: totalInformes, l: totalInformes === 1 ? 'informe' : 'informes', cls: 'text-slate-800' },
                { n: conclusionCounts['Llamar'] ?? 0, l: 'Llamar', cls: 'text-amber-600' },
                { n: conclusionCounts['Descartar'] ?? 0, l: 'Descartar', cls: 'text-slate-500' },
              ].map(x => (
                <div key={x.l} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <div className={`text-base font-bold leading-none ${x.cls}`}>{x.n}</div>
                  <div className="text-[10.5px] text-slate-500 mt-0.5">{x.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Notas del partido ── */}
          {match.notes && (
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Notas</span>
              <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap break-words">{match.notes}</p>
            </div>
          )}

          {/* ── Jugadores vistos ── */}
          <div>
            <span className="text-[11px] font-semibold text-violet-600 uppercase tracking-wide">
              Vistos en este partido · {linkedPlayers.length} jugador{linkedPlayers.length !== 1 ? 'es' : ''} · {linkedWithReport} con informe
            </span>
            <div className="mt-1.5 space-y-1.5">
              {linkedPlayers.length === 0 && (
                <p className="text-xs text-slate-400 italic">Aún no hay jugadores vinculados a este partido.</p>
              )}
              {playersBySide.flatMap(grupo => grupo.jugadores.map((p, i) => {
                const pReports = matchReportsByPlayer[p.id] ?? []
                const isFormOpen = reportFormFor === p.id
                // Cada scout puede escribir SU informe del mismo jugador en el mismo
                // partido: el botón solo desaparece si ya escribí yo.
                const myReport = pReports.find(r =>
                  (r.authorId && r.authorId === currentProfile.id) || r.persona === currentProfile.avatar)
                return (
                  <div key={p.id}>
                  {/* Cabecera del equipo: se ve de un vistazo de qué lado juega cada uno */}
                  {i === 0 && (
                    <div className="flex items-center gap-1.5 mt-2 mb-1 first:mt-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{grupo.titulo}</span>
                      <span className="text-[10px] text-slate-400">{grupo.jugadores.length}</span>
                      <span className="flex-1 h-px bg-slate-100" />
                    </div>
                  )}
                  <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onOpenPlayer?.(p.id)}
                        className="text-xs font-semibold text-slate-800 hover:text-primary transition-colors"
                        title="Abrir ficha del jugador"
                      >
                        {p.fullName}
                      </button>
                      <span className="text-[11px] text-slate-400">
                        {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                      </span>
                      <AssessmentChip a={p.assessment} small />
                      <span className="flex-1" />
                      {/* Un chip por informe: se ve quién ha escrito cada uno */}
                      {pReports.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setInformeAbierto(id => id === r.id ? null : r.id)}
                          title="Ver el informe completo"
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            (r.authorId && r.authorId === currentProfile.id) || r.persona === currentProfile.avatar
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                          } ${informeAbierto === r.id ? 'ring-1 ring-slate-300' : ''}`}
                        >
                          ✓ {r.persona ?? '—'}
                          {normConclusion(r.conclusion) && (
                            <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${CONCLUSION_STYLE[normConclusion(r.conclusion)!] ?? 'bg-slate-100 text-slate-500'}`}>
                              {normConclusion(r.conclusion)}
                            </span>
                          )}
                        </button>
                      ))}
                      {/* Informes de esas fechas que no están enganchados a este
                          partido. Los que YA son de otro partido se enseñan solo
                          como contexto, sin botón: el ⇄ se los robaba al partido
                          al que pertenecían y no había forma de deshacerlo. */}
                      {(looseReportsByPlayer[p.id] ?? []).map(r => {
                        const otherMatch = r.matchId ? allMatches.find(m => m.id === r.matchId) : undefined
                        return (
                          <span
                            key={r.id}
                            title={otherMatch
                              ? `Informe de ${r.persona ?? '—'} en ${otherMatch.homeTeam} vs ${otherMatch.awayTeam} (${fmtDate(otherMatch.date)}). Pertenece a ese partido; aquí sale solo como referencia.`
                              : `Informe de ${r.persona ?? '—'} sin partido asignado — pulsa ⇄ para vincularlo a este`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 bg-white"
                          >
                            {r.persona ?? '—'}
                            {normConclusion(r.conclusion) && (
                              <span className="ml-0.5 px-1.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
                                {normConclusion(r.conclusion)}
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400">
                              {otherMatch ? `${otherMatch.homeTeam} – ${otherMatch.awayTeam}` : 'sin partido'}
                            </span>
                            {!otherMatch && (
                              <button
                                onClick={() => void onLinkReportToMatch(r, match.id)}
                                className="ml-0.5 text-slate-400 hover:text-primary font-bold"
                                aria-label="Vincular este informe al partido"
                              >
                                ⇄
                              </button>
                            )}
                          </span>
                        )
                      })}
                      {!myReport && (
                        <button
                          onClick={() => {
                            setReportFormFor(isFormOpen ? null : p.id)
                            setQuickText('')
                            setQuickConclusion('')
                          }}
                          className="text-[11px] font-bold border border-primary text-primary bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          {isFormOpen ? 'Cancelar' : pReports.length > 0 ? '+ Mi informe' : '+ Informe'}
                        </button>
                      )}
                      <button onClick={() => handleRemovePlayer(p.id)} aria-label={`Desvincular a ${p.fullName}`} className="text-slate-300 hover:text-red-500 p-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Mini-formulario de informe rápido */}
                    {isFormOpen && (
                      <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                        <textarea
                          value={quickText}
                          onChange={e => setQuickText(e.target.value)}
                          rows={3}
                          autoFocus
                          placeholder={`Informe corto de ${p.fullName.split(' ')[0]} en este partido…`}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveQuickReport() }
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-medium">Conclusión:</span>
                          {CONCLUSION_OPTIONS.filter(Boolean).map(c => (
                            <button
                              key={c}
                              onClick={() => setQuickConclusion(quickConclusion === c ? '' : c)}
                              title={c === 'Visto'
                                ? 'Lo he visto y no concluyo (poco rato, mal partido, no da para decidir). No cuenta como veredicto en las estadísticas.'
                                : undefined}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                                quickConclusion === c
                                  ? (CONCLUSION_STYLE[c] ?? 'bg-slate-200 text-slate-700')
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                              } ${c === 'Visto' ? 'ml-1' : ''}`}
                            >
                              {c}
                            </button>
                          ))}
                          {!quickConclusion && (
                            <span className="text-[10px] text-slate-400">o déjalo sin marcar</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">Se vincula a este partido y aparece en la ficha del jugador · ⌘+Enter</span>
                          <button
                            onClick={saveQuickReport}
                            disabled={!quickText.trim() || savingQuick}
                            className="px-3 py-1.5 text-[11px] font-bold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 inline-flex items-center gap-1.5"
                          >
                            {savingQuick && <Spinner />}
                            {savingQuick ? 'Guardando…' : 'Guardar informe'}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Informe desplegado: antes había que adivinarlo por el tooltip */}
                    {pReports.filter(r => r.id === informeAbierto).map(r => (
                      <div key={r.id} className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-slate-600">{personaToName(r.persona, profiles) || r.persona}</span>
                          <span className="text-[10.5px] text-slate-400">{fmtDate(r.fecha ?? r.createdAt)}</span>
                          {r.titulo && <span className="text-[10.5px] text-slate-500 italic truncate">{r.titulo}</span>}
                          {/* Deshacer: si un informe se enganchó aquí por error,
                              se suelta sin tener que tocar la base de datos */}
                          <button
                            onClick={() => {
                              if (confirm(`¿Quitar este informe de ${match.homeTeam} – ${match.awayTeam}?\n\nEl informe NO se borra: sigue en la ficha de ${p.fullName}, solo deja de estar asignado a este partido.`)) {
                                void onLinkReportToMatch(r, null)
                              }
                            }}
                            className="ml-auto text-[10px] font-semibold text-slate-400 hover:text-red-500"
                            title="Quitar este informe del partido (no se borra)"
                          >
                            quitar del partido
                          </button>
                          <button onClick={() => setInformeAbierto(null)} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar informe">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                          {r.texto || <span className="italic text-slate-400">Sin texto</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                  </div>
                )
              }))}
            </div>
          </div>

          {/* ── Pegar alineación de una web ── */}
          <PegarAlineacion
            match={match}
            scoutingPlayers={scoutingPlayers}
            linkedPlayerIds={linkedPlayerIds}
            onLink={async (playerId) => { await handleAddPlayer(playerId) }}
            onCreateAndLink={async (nombre, equipo) => { await onCreateAndLinkPlayer(nombre, equipo, match.id) }}
            onFixTeam={onFixPlayerTeam}
          />

          {/* ── Otros partidos de estos equipos ── */}
          {partidosRelacionados.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Otros partidos de estos equipos</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {partidosRelacionados.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onOpenMatch?.(m.id)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors"
                    title={`${(matchPlayersByMatchId[m.id] ?? []).length} jugadores vinculados`}
                  >
                    {m.homeTeam} vs {m.awayTeam}
                    <span className="text-slate-400"> · {fmtDate(m.date)}</span>
                    {(matchPlayersByMatchId[m.id] ?? []).length > 0 && (
                      <span className="ml-1 text-violet-500 font-semibold">{(matchPlayersByMatchId[m.id] ?? []).length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Buscar / sugerencias con afinado ── */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="pl-6 pr-3 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 w-48"
                />
              </div>
              {/* Afinado: año y posición */}
              {playerSearch.length < 2 && suggestionPool.length > 0 && (suggYears.length > 1 || suggPosGroups.length > 1) && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Afinar:</span>
                  {suggYears.slice(0, 8).map(y => (
                    <button
                      key={y}
                      onClick={() => setSuggYearFilter(f => f === y ? null : y)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                        suggYearFilter === y ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                  {suggPosGroups.length > 1 && <span className="text-slate-200">|</span>}
                  {suggPosGroups.map(g => (
                    <button
                      key={g}
                      onClick={() => setSuggPosFilter(f => f === g ? null : g)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                        suggPosFilter === g ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              {searchResults.length > 0 ? (
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-1 items-center">
                    {playerSearch.length < 2 && teamSuggested.length > 0 && (
                      <span className="text-[11px] text-violet-500 font-semibold uppercase tracking-wide mr-1">
                        Sugeridos ({teamSuggested.length}):
                      </span>
                    )}
                    {playerSearch.length >= 2 && (
                      <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mr-1">
                        {searchMatches.length > SEARCH_LIMIT
                          ? `${SEARCH_LIMIT} de ${searchMatches.length} — afina la búsqueda:`
                          : `${searchMatches.length} resultado${searchMatches.length !== 1 ? 's' : ''}:`}
                      </span>
                    )}
                    {searchResults.map(({ p, why }) => (
                      <button
                        key={p.id}
                        onClick={() => { handleAddPlayer(p.id); setPlayerSearch('') }}
                        className={`text-xs bg-white border px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                          why === 'equipo' || why === 'busqueda'
                            ? 'border-violet-200 text-violet-700 hover:bg-violet-100'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <Plus className="w-3 h-3" />{p.fullName}
                        <span className={why === 'equipo' || why === 'busqueda' ? 'text-violet-400 text-[11px]' : 'text-slate-400 text-[11px]'}>
                          {[p.birthdate ? `'${p.birthdate.slice(2, 4)}` : null, p.team].filter(Boolean).join(' · ')}
                          {SUGGEST_LABEL[why]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : playerSearch.length >= 2 ? (
                <span className="text-xs text-slate-400 italic">Sin resultados</span>
              ) : suggestionPool.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Busca un jugador para vincularlo al partido</span>
              ) : teamSuggested.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Ningún sugerido con esos filtros — <button className="underline" onClick={() => { setSuggYearFilter(null); setSuggPosFilter(null) }}>quitar afinado</button></span>
              ) : null}
            </div>
          </div>
        </div>
      </>
    </FichaCarcasa>
  )
}
