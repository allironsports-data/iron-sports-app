import { useState, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { Club, ClubNegotiation } from '../types'
import { Dialog, Button, Badge } from './ui'
import { L } from '../lib/labels'
import { leagueLabel } from '../lib/clubTiers'

/** Modal "Asignar por liga": marca ligas enteras o clubes sueltos para crear negociaciones en Pendiente. */
export function BulkAssignModal({ clubs, existingNegotiations, onClose, onSave }: {
  clubs: Club[]
  existingNegotiations: ClubNegotiation[]
  onClose: () => void
  onSave: (clubIds: string[]) => Promise<void>
}) {
  const leagues = useMemo(() => {
    // Agrupa por liga+país: "Serie A · ITA" y "Serie A · BRA" son grupos distintos
    const map = new Map<string, Club[]>()
    clubs.forEach(c => {
      const key = leagueLabel(c.league, c.country)
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

  return (
    <Dialog
      open
      onClose={onClose}
      title="Asignar por liga"
      description={<>Marca ligas enteras o clubes individuales. Se crearán como <span className="font-semibold text-purple-700">Pendiente</span>.</>}
      dirty={newIds.length > 0}
      historyKey="bulk-assign"
      onSubmit={e => { e.preventDefault(); void handleSave() }}
      footer={
        <>
          {newIds.length > 0 && (
            <Badge tone="primary" className="mr-auto bg-purple-100 text-purple-700">
              {newIds.length} seleccionado{newIds.length !== 1 ? 's' : ''}
            </Badge>
          )}
          <Button onClick={onClose}>{L.cancelar}</Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={newIds.length === 0}
            className="bg-purple-600 hover:bg-purple-700 disabled:hover:bg-purple-600"
          >
            {saving ? 'Asignando…' : `Asignar ${newIds.length} club${newIds.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div className="-mx-4 sm:-mx-5 -my-4">
        {leagues.map(([league, leagueClubs]) => {
          const isExpanded = expanded.has(league)
          const state = getLeagueState(league)
          const available = leagueClubs.filter(c => !existingIds.has(c.id))
          const allAlreadyAssigned = available.length === 0

          return (
            <div key={league} className="border-b border-slate-100 last:border-0">
              <div className="flex items-center px-4 py-2 gap-3 hover:bg-slate-50">
                {/* Checkbox de toda la liga */}
                <input
                  type="checkbox"
                  aria-label={`Seleccionar toda la liga ${league}`}
                  checked={state !== 'none'}
                  disabled={allAlreadyAssigned}
                  ref={el => { if (el) el.indeterminate = state === 'partial' }}
                  onChange={() => toggleLeague(league)}
                  className="w-4 h-4 rounded text-purple-600 cursor-pointer flex-shrink-0"
                />
                {/* Nombre de la liga: clic para desplegar */}
                <button
                  type="button"
                  onClick={() => toggleExpand(league)}
                  aria-expanded={isExpanded}
                  className="flex-1 flex items-center gap-2 text-left min-w-0 min-h-11 sm:min-h-9 rounded focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                >
                  <span className="font-medium text-slate-800 text-body truncate">{league}</span>
                  <span className="text-meta text-slate-500 flex-shrink-0">{leagueClubs.length}</span>
                  {state === 'all' && !allAlreadyAssigned && (
                    <span className="text-meta text-purple-600 font-medium flex-shrink-0 inline-flex items-center gap-0.5"><Check className="w-3 h-3" aria-hidden="true" /> todos</span>
                  )}
                  {allAlreadyAssigned && (
                    <span className="text-meta text-green-600 flex-shrink-0">ya asignados</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 ml-auto flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
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
                        className={`flex items-center gap-3 px-3 py-2 min-h-11 sm:min-h-0 rounded-lg border cursor-pointer transition-colors ${
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
                        <span className="flex-1 text-body text-slate-800 truncate">{club.name}</span>
                        {club.aisManager && (
                          <span className="text-meta font-mono text-slate-500 flex-shrink-0" title={L.encargado}>{club.aisManager}</span>
                        )}
                        {alreadyExists && <span className="text-meta text-green-600 flex-shrink-0">asignado</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
