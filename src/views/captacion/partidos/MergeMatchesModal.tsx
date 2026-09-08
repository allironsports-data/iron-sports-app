import { useState } from 'react'
import { X } from 'lucide-react'
import type { ScoutingReport, ScoutingMatch } from '../../../types'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { Spinner } from '../comun'
import { type MatchScoutInfo } from '../helpers'
// ── MergeMatchesModal ─────────────────────────────────────────
// Fusión manual: eliges qué copia sobrevive y con qué fecha; el resto
// aporta sus scouts, jugadores e informes y se elimina.
export function MergeMatchesModal({ matches, scoutsByMatch, matchPlayersByMatchId, scoutingReports, merging, onClose, onConfirm }: {
  matches: ScoutingMatch[]
  scoutsByMatch: Record<string, MatchScoutInfo[]>
  matchPlayersByMatchId: Record<string, string[]>
  scoutingReports: ScoutingReport[]
  merging: boolean
  onClose: () => void
  onConfirm: (survivorId: string, newDate: string) => void
}) {
  const info = (m: ScoutingMatch) => ({
    jug: (matchPlayersByMatchId[m.id] ?? []).length,
    inf: scoutingReports.filter(r => r.matchId === m.id).length,
    scouts: (scoutsByMatch[m.id] ?? []).map(x => x.scout),
  })
  // Superviviente por defecto: la copia con más contenido
  const defaultSurvivor = [...matches].sort((a, b) => {
    const ia = info(a), ib = info(b)
    return (ib.jug + ib.inf) - (ia.jug + ia.inf) || a.createdAt.localeCompare(b.createdAt)
  })[0]
  const [survivorId, setSurvivorId] = useState(defaultSurvivor.id)
  const [newDate, setNewDate] = useState(defaultSurvivor.date)

  useEscapeKey(onClose, !merging)

  const survivor = matches.find(m => m.id === survivorId)!
  const others = matches.filter(m => m.id !== survivorId)
  const totalScouts = new Set(matches.flatMap(m => info(m).scouts)).size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={merging ? undefined : onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800">Fusionar {matches.length} partidos en uno</h3>
          <button onClick={onClose} disabled={merging} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Elige qué copia se queda. Las demás le pasan sus scouts, jugadores vinculados e informes (cada informe conserva su autor) y se eliminan. No se pierde nada.
        </p>

        <div className="space-y-1.5">
          {matches.map(m => {
            const i = info(m)
            const sel = m.id === survivorId
            return (
              <label
                key={m.id}
                className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  sel ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="survivor"
                  checked={sel}
                  onChange={() => { setSurvivorId(m.id); setNewDate(m.date) }}
                  className="mt-1 accent-violet-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {m.homeTeam} <span className="text-slate-400 font-normal">vs</span> {m.awayTeam}
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                    <span className="font-medium">{m.date}{m.time ? ` · ${m.time}` : ''}</span>
                    {m.competition && <span>{m.competition}</span>}
                    <span>{i.scouts.length > 0 ? i.scouts.join(' + ') : 'sin scout'}</span>
                    <span className="text-violet-600">{i.jug} jug · {i.inf} inf</span>
                  </div>
                </div>
                {sel && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5 flex-shrink-0 mt-0.5">SE QUEDA</span>}
              </label>
            )
          })}
        </div>

        <div className="mt-3">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Fecha del partido fusionado</label>
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-500">
          Resultado: <strong>{survivor.homeTeam} vs {survivor.awayTeam}</strong> el <strong>{newDate}</strong> con {totalScouts} scout{totalScouts !== 1 ? 's' : ''},{' '}
          {matches.reduce((n, m) => n + info(m).jug, 0)} vínculos de jugador y {matches.reduce((n, m) => n + info(m).inf, 0)} informes.
          Se eliminarán {others.length} copia{others.length !== 1 ? 's' : ''}.
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={merging} className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(survivorId, newDate)}
            disabled={merging || !newDate}
            className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {merging && <Spinner />}
            {merging ? 'Fusionando…' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
