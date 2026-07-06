import { useState, useMemo } from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { Club, ClubNegotiation } from '../types'
import { useEscapeKey } from '../hooks/useEscapeKey'

/** Modal "Asignar por liga": marca ligas enteras o clubes sueltos para crear negociaciones en Pendiente. */
export function BulkAssignModal({ clubs, existingNegotiations, onClose, onSave }: {
  clubs: Club[]
  existingNegotiations: ClubNegotiation[]
  onClose: () => void
  onSave: (clubIds: string[]) => Promise<void>
}) {
  const leagues = useMemo(() => {
    const map = new Map<string, Club[]>()
    clubs.forEach(c => {
      const key = c.league ?? 'Sin liga'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [clubs])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const existingIds = new Set(existingNegotiations.map(n => n.clubId))
  const newIds = Array.from(selected).filter(id => !existingIds.has(id))

  function toggleExpand(league: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(league)) next.delete(league); else next.add(league)
      return next
    })
  }

  function getLeagueState(league: string): 'all' | 'partial' | 'none' {
    const available = (leagues.find(([l]) => l === league)?.[1] ?? []).filter(c => !existingIds.has(c.id))
    if (available.length === 0) return 'all'
    const count = available.filter(c => selected.has(c.id)).length
    if (count === 0) return 'none'
    if (count === available.length) return 'all'
    return 'partial'
  }

  function toggleLeague(league: string) {
    const available = (leagues.find(([l]) => l === league)?.[1] ?? [])
      .filter(c => !existingIds.has(c.id))
      .map(c => c.id)
    const state = getLeagueState(league)
    setSelected(prev => {
      const next = new Set(prev)
      if (state === 'all') {
        available.forEach(id => next.delete(id))
      } else {
        available.forEach(id => next.add(id))
      }
      return next
    })
  }

  function toggleClub(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (newIds.length === 0) return
    setSaving(true)
    try { await onSave(newIds) } finally { setSaving(false) }
  }

  useEscapeKey(onClose)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 text-sm flex-1">Asignar por liga</h2>
          {newIds.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
              {newIds.length} seleccionado{newIds.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100 flex-shrink-0">
          Marca ligas enteras o clubes individuales. Se crearán como <span className="font-semibold text-purple-700">Pendiente</span>.
        </p>

        {/* Leagues accordion */}
        <div className="overflow-y-auto flex-1">
          {leagues.map(([league, leagueClubs]) => {
            const isExpanded = expanded.has(league)
            const state = getLeagueState(league)
            const available = leagueClubs.filter(c => !existingIds.has(c.id))
            const allAlreadyAssigned = available.length === 0

            return (
              <div key={league} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center px-4 py-2.5 gap-3 hover:bg-slate-50">
                  {/* League-level checkbox */}
                  <input
                    type="checkbox"
                    checked={state !== 'none'}
                    disabled={allAlreadyAssigned}
                    ref={el => { if (el) el.indeterminate = state === 'partial' }}
                    onChange={() => toggleLeague(league)}
                    className="w-4 h-4 rounded text-purple-600 cursor-pointer flex-shrink-0"
                  />
                  {/* League name — click to expand */}
                  <button
                    onClick={() => toggleExpand(league)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="font-medium text-slate-800 text-sm truncate">{league}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{leagueClubs.length}</span>
                    {state === 'all' && !allAlreadyAssigned && (
                      <span className="text-xs text-purple-600 font-medium flex-shrink-0">✓ todos</span>
                    )}
                    {allAlreadyAssigned && (
                      <span className="text-xs text-green-600 flex-shrink-0">ya asignados</span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-auto flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-2 space-y-1 bg-slate-50">
                    {leagueClubs.map(club => {
                      const alreadyExists = existingIds.has(club.id)
                      const isSelected = selected.has(club.id)
                      return (
                        <label
                          key={club.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            alreadyExists
                              ? 'border-green-200 bg-green-50 cursor-not-allowed opacity-60'
                              : isSelected
                                ? 'border-purple-300 bg-purple-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || alreadyExists}
                            disabled={alreadyExists}
                            onChange={() => !alreadyExists && toggleClub(club.id)}
                            className="w-4 h-4 rounded text-purple-600"
                          />
                          <span className="flex-1 text-sm text-slate-800 truncate">{club.name}</span>
                          {club.aisManager && (
                            <span className="text-xs font-mono text-slate-400 flex-shrink-0">{club.aisManager}</span>
                          )}
                          {alreadyExists && <span className="text-xs text-green-600 flex-shrink-0">asignado</span>}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0 safe-area-bottom">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={newIds.length === 0 || saving}
            className="flex-1 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            {saving
              ? <span className="flex items-center justify-center gap-2"><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" /> Asignando…</span>
              : `Asignar ${newIds.length} club${newIds.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
