import React, { useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import type { ScoutingMatch } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { type MatchScoutInfo, MONTHS_ES, personaToName, isFutureMatch, scoutColor } from '../helpers'
// ── MatchRow ──────────────────────────────────────────────────

// React.memo: la tabla de partidos re-renderiza a cada tecleo del buscador; con props estables
// (handlers en useCallback, SIN_SCOUTS compartido) las filas que no cambian no se vuelven a pintar.
export const MatchRow = React.memo(function MatchRow({
  match, scoutName, scouts, profiles, currentProfile, isAdmin,
  conteo,
  onEdit, onDelete, onToggleStatus, onOpenDetail,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  match: ScoutingMatch
  scoutName: string
  /** Todos los scouts que cubren el partido (incluye el responsable principal) */
  scouts: MatchScoutInfo[]
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  /** Jugadores vinculados y cuántos tienen informe — ya contados en el padre */
  conteo: { total: number; conInforme: number }
  onEdit: (m: ScoutingMatch) => void
  onDelete: (id: string) => void
  onToggleStatus: (m: ScoutingMatch) => void
  onOpenDetail: (matchId: string) => void
  /** Modo fusión: la fila se selecciona en vez de abrirse */
  mergeMode?: boolean
  mergeSelected?: boolean
  onToggleMerge?: (matchId: string) => void
}) {
  const [confirm, setConfirm] = useState(false)

  const day = match.date.slice(8)
  const mon = MONTHS_ES[parseInt(match.date.slice(5, 7)) - 1]
  const yr = match.date.slice(2, 4)
  const isVisto = match.status === 'visto'
  const myScout = scouts.find(s => s.scout === currentProfile.avatar)
  const isPendingForMe = !!myScout && myScout.status !== 'visto' && !isVisto
  const isFuture = isFutureMatch(match.date)

  const nVinculados = conteo.total
  const linkedWithReport = conteo.conInforme

  const open = () => mergeMode ? onToggleMerge?.(match.id) : onOpenDetail(match.id)

  return (
    <tr
      onClick={open}
      className={`transition-colors cursor-pointer ${
        mergeSelected ? 'bg-violet-50 ring-1 ring-inset ring-violet-300' :
        isPendingForMe ? 'bg-amber-50/60 hover:bg-amber-50' :
        isFuture ? 'bg-blue-50/40 hover:bg-blue-50/70' :
        'hover:bg-slate-50/60'
      }`}
    >
      {/* Fecha */}
      <td className={`px-3 py-2 text-xs whitespace-nowrap ${isFuture ? 'text-blue-600 font-semibold' : 'text-slate-500'}`}>
        {mergeMode && (
          <input
            type="checkbox"
            checked={!!mergeSelected}
            onChange={() => onToggleMerge?.(match.id)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded mr-2 align-middle accent-violet-600"
            aria-label={`Seleccionar ${match.homeTeam} vs ${match.awayTeam} para fusionar`}
          />
        )}
        {day} {mon} '{yr}
        {match.time && <span className={`block text-[11px] font-normal ${isFuture ? 'text-blue-500' : 'text-slate-400'}`}>{match.time}</span>}
      </td>
      {/* Local */}
      <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">{match.homeTeam}</td>
      {/* vs */}
      <td className="px-2 py-2 text-[11px] font-bold text-slate-400 text-center">vs</td>
      {/* Visitante */}
      <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">{match.awayTeam}</td>
      {/* Competición */}
      <td className="px-3 py-2">
        {match.competition && (
          <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap">{match.competition}</span>
        )}
      </td>
      {/* Modo */}
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {match.viewMode === 'campo'
          ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] font-medium">🏟️ Campo</span>
          : <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[11px] font-medium">📹 Vídeo</span>
        }
      </td>
      {/* Scouts (pueden ser varios) */}
      <td className="px-3 py-2 text-xs">
        {scouts.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            {scouts.map(s => {
              const c = scoutColor(s.scout)
              const name = personaToName(s.scout, profiles)
              return (
                <span
                  key={s.scout}
                  title={`${name || s.scout} · ${s.viewMode === 'campo' ? 'en el campo' : 'por vídeo'}${s.status === 'visto' ? ' · ya lo ha visto' : ' · pendiente'}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${c.bg} ${c.text} ${c.border} ${s.status === 'visto' ? '' : 'opacity-70'}`}
                >
                  <span className="font-mono">{s.scout}</span>
                  <span className="text-[9px]">{s.viewMode === 'campo' ? '🏟️' : '📹'}</span>
                  {s.status === 'visto' && <span className="text-[10px]">✓</span>}
                  {scouts.length === 1 && scoutName && scoutName !== s.scout && (
                    <span className="font-normal opacity-70">({scoutName})</span>
                  )}
                </span>
              )
            })}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">— asignar</span>
        )}
      </td>
      {/* Jugadores vinculados + estado de informes */}
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
            nVinculados === 0
              ? 'bg-slate-50 text-slate-400 border-slate-200'
              : linkedWithReport < nVinculados
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-violet-50 text-violet-700 border-violet-200'
          }`}
          title={nVinculados > 0
            ? `${linkedWithReport} de ${nVinculados} jugadores con informe de este partido`
            : 'Abrir el partido para añadir jugadores'}
        >
          👤 {nVinculados > 0 ? `${linkedWithReport}/${nVinculados}` : '+'}
        </span>
      </td>
      {/* Notas */}
      <td className="px-3 py-2 text-xs text-slate-500 max-w-[160px] truncate" title={match.notes ?? ''}>{match.notes ?? '—'}</td>
      {/* Visto */}
      <td className="px-3 py-2 text-center">
        <button onClick={e => { e.stopPropagation(); onToggleStatus(match) }}
          title={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
          aria-label={isVisto ? 'Marcar como pendiente' : 'Marcar como visto'}
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
            isVisto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2.5,8 6,11.5 13.5,4" />
          </svg>
        </button>
      </td>
      {/* Acciones */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={e => { e.stopPropagation(); onEdit(match) }} className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="Editar" aria-label="Editar partido">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (confirm
            ? <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { onDelete(match.id); setConfirm(false) }} className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded font-medium">Sí</button>
                <button onClick={() => setConfirm(false)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600">No</button>
              </div>
            : <button onClick={e => { e.stopPropagation(); setConfirm(true) }} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Eliminar" aria-label="Eliminar partido"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </td>
    </tr>
  )
})

// Carcasa de la ficha de partido: la MISMA ficha se pinta como columna fija
// a la derecha en escritorio y como ventana flotante en móvil. Va a nivel de
// módulo a propósito: si se define dentro del componente, React la remonta en
// cada render y se pierde lo que estuvieras escribiendo.
