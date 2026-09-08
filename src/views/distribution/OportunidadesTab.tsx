import { useMemo, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Plus, Search, Users, Trash2, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react'
import type { ClubNegotiation } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { EmptyState } from '../../components/EmptyState'
import { POSITIONS } from '../../lib/positions'
import { TIER_CONFIG } from '../../lib/clubTiers'
import type { Opportunity } from '../../lib/distribution'
import { BtnSpinner } from './shared'
import { PRIORITY_CONFIG } from './constantes'
import type { Priority } from './constantes'

// ── Pestaña OPORTUNIDADES ─────────────────────────────────────

export function OportunidadesTab({
  opportunities, currentProfile,
  oppSearch, setOppSearch, oppPriority, setOppPriority, oppPos, setOppPos, oppLeague, setOppLeague,
  oppMineOnly, setOppMineOnly, oppNoMgrOnly, setOppNoMgrOnly,
  offeringOppKey, setOfferingOppKey, dismissingOppKey, setDismissingOppKey,
  oppSelected, setOppSelected, confirmBulkDismiss, setConfirmBulkDismiss, bulkDismissing, setBulkDismissing,
  onCreateNegotiation, onSelectClub, showToast,
}: {
  opportunities: Opportunity[]
  currentProfile: Profile
  oppSearch: string
  setOppSearch: (v: string) => void
  oppPriority: Priority | ''
  setOppPriority: (v: Priority | '') => void
  oppPos: string
  setOppPos: (v: string) => void
  oppLeague: string
  setOppLeague: (v: string) => void
  oppMineOnly: boolean
  setOppMineOnly: Dispatch<SetStateAction<boolean>>
  oppNoMgrOnly: boolean
  setOppNoMgrOnly: Dispatch<SetStateAction<boolean>>
  offeringOppKey: string | null
  setOfferingOppKey: (v: string | null) => void
  dismissingOppKey: string | null
  setDismissingOppKey: (v: string | null) => void
  oppSelected: Set<string>
  setOppSelected: Dispatch<SetStateAction<Set<string>>>
  confirmBulkDismiss: boolean
  setConfirmBulkDismiss: (v: boolean) => void
  bulkDismissing: boolean
  setBulkDismissing: (v: boolean) => void
  onCreateNegotiation: (n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClubNegotiation>
  onSelectClub?: (id: string) => void
  showToast: (msg: string, variant?: 'success' | 'error' | 'info') => void
}) {
  const oppLeagues = useMemo(
    () => Array.from(new Set(opportunities.map(o => o.club.league).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [opportunities]
  )
  const oppByKey = useMemo(() => {
    const m = new Map<string, typeof opportunities[number]>()
    opportunities.forEach(o => m.set(`${o.player.id}|${o.club.id}`, o))
    return m
  }, [opportunities])

  const toggleOppSelected = useCallback((key: string) => {
    setOppSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [setOppSelected])

  async function bulkDismissOpportunities() {
    const keys = Array.from(oppSelected)
    setBulkDismissing(true)
    let ok = 0
    try {
      // En lotes para no saturar la base de datos
      const CHUNK = 20
      for (let i = 0; i < keys.length; i += CHUNK) {
        const batch = keys.slice(i, i + CHUNK)
        await Promise.all(batch.map(async k => {
          const o = oppByKey.get(k)
          if (!o) return
          await onCreateNegotiation({ playerId: o.player.id, clubId: o.club.id, needPosition: o.need.position, status: 'descartado', aisManager: o.club.aisManager || currentProfile.avatar })
          ok++
        }))
      }
      showToast(`${ok} oportunidad${ok !== 1 ? 'es' : ''} descartada${ok !== 1 ? 's' : ''}`)
    } catch {
      showToast(`Descartadas ${ok}; algunas fallaron. Reintenta.`, 'error')
    } finally {
      setBulkDismissing(false)
      setConfirmBulkDismiss(false)
      setOppSelected(new Set())
    }
  }
  const filteredOpportunities = useMemo(() => {
    const q = oppSearch.trim().toLowerCase()
    return opportunities.filter(o => {
      if (oppPriority && o.entry.priority !== oppPriority) return false
      if (oppPos && !o.player.positions.includes(oppPos)) return false
      if (oppLeague && o.club.league !== oppLeague) return false
      if (oppNoMgrOnly && o.club.aisManager) return false
      if (oppMineOnly) {
        const mine = o.club.aisManager === currentProfile.avatar || o.player.managedBy.includes(currentProfile.id)
        if (!mine) return false
      }
      if (q && !(o.player.name.toLowerCase().includes(q) || o.club.name.toLowerCase().includes(q) ||
        (o.club.league ?? '').toLowerCase().includes(q) || (o.club.country ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [opportunities, oppSearch, oppPriority, oppPos, oppLeague, oppMineOnly, oppNoMgrOnly, currentProfile.avatar, currentProfile.id])

  // Clubes que tienen oportunidades pero NO tienen encargado asignado
  const clubsWithOppNoMgr = useMemo(() => {
    const ids = new Set<string>()
    opportunities.forEach(o => { if (!o.club.aisManager) ids.add(o.club.id) })
    return ids.size
  }, [opportunities])

  const CAP = 200
  const shown = filteredOpportunities.slice(0, CAP)
  return (
    <div className="max-w-5xl mx-auto">
      {/* Aviso: clubes con oportunidades pero sin encargado */}
      {clubsWithOppNoMgr > 0 && (
        <button
          onClick={() => setOppNoMgrOnly(v => !v)}
          className={`w-full mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-left transition-colors ${
            oppNoMgrOnly ? 'bg-red-100 border-red-300' : 'bg-red-50 border-red-200 hover:bg-red-100'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-800 flex-1 min-w-0">
            {clubsWithOppNoMgr} club{clubsWithOppNoMgr !== 1 ? 'es' : ''} con oportunidades sin encargado asignado
          </span>
          <span className="text-xs font-medium text-red-700 flex-shrink-0">
            {oppNoMgrOnly ? 'Quitar filtro' : 'Ver solo estos →'}
          </span>
        </button>
      )}
      {/* Intro + filtros */}
      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-2">
          Cruces jugador → club con necesidad compatible (posición y edad) que <strong>aún no has ofrecido</strong>.
          Ordenado por prioridad del jugador y nivel del club.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={oppSearch}
              onChange={e => setOppSearch(e.target.value)}
              placeholder="Buscar jugador o club…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex items-center gap-1">
            {(['A', 'B', 'C', 'D'] as const).map(pr => (
              <button
                key={pr}
                onClick={() => setOppPriority(oppPriority === pr ? '' : pr)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  oppPriority === pr ? `${PRIORITY_CONFIG[pr].bg} ${PRIORITY_CONFIG[pr].text} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={`Prioridad ${pr}`}
              >
                {pr}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-auto">
            {filteredOpportunities.length} oportunidad{filteredOpportunities.length !== 1 ? 'es' : ''}
          </span>
        </div>
        {/* Segunda fila de filtros */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <select
            value={oppPos}
            onChange={e => setOppPos(e.target.value)}
            aria-label="Filtrar por posición"
            className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium cursor-pointer ${oppPos ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            <option value="">Posición: todas</option>
            {POSITIONS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.es}</option>)}
          </select>
          <select
            value={oppLeague}
            onChange={e => setOppLeague(e.target.value)}
            aria-label="Filtrar por liga"
            className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium cursor-pointer max-w-[160px] ${oppLeague ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            <option value="">Liga: todas</option>
            {oppLeagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button
            onClick={() => setOppMineOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${oppMineOnly ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            <Users className="w-3.5 h-3.5" /> Solo mías
          </button>
          {(oppPos || oppLeague || oppMineOnly || oppPriority || oppSearch || oppNoMgrOnly) && (
            <button
              onClick={() => { setOppPos(''); setOppLeague(''); setOppMineOnly(false); setOppPriority(''); setOppSearch(''); setOppNoMgrOnly(false) }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-1"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {filteredOpportunities.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-10 h-10" />}
          title="Sin oportunidades nuevas"
          subtitle="Cuando haya jugadores de tu cartera que encajen con necesidades de clubes y no estén ofrecidos, aparecerán aquí."
        />
      ) : (
        <>
        {/* Barra de selección múltiple */}
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={shown.length > 0 && shown.every(o => oppSelected.has(`${o.player.id}|${o.club.id}`))}
              onChange={e => setOppSelected(prev => {
                const next = new Set(prev)
                shown.forEach(o => { const k = `${o.player.id}|${o.club.id}`; if (e.target.checked) next.add(k); else next.delete(k) })
                return next
              })}
            />
            Seleccionar visibles
          </label>
          {oppSelected.size > 0 && (
            <>
              <span className="text-xs text-slate-500">{oppSelected.size} seleccionada{oppSelected.size !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setConfirmBulkDismiss(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Descartar ({oppSelected.size})
              </button>
              <button onClick={() => setOppSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-700">Limpiar selección</button>
            </>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {shown.map(({ player, entry, club, need, tier, age }) => {
            const key = `${player.id}|${club.id}`
            const prCfg = PRIORITY_CONFIG[entry.priority]
            const tierCfg = TIER_CONFIG[tier]
            const offering = offeringOppKey === key
            return (
              <div key={key} className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${oppSelected.has(key) ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded flex-shrink-0"
                  checked={oppSelected.has(key)}
                  onChange={() => toggleOppSelected(key)}
                />
                <button
                  onClick={() => onSelectClub?.(club.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${prCfg.bg} ${prCfg.text}`}>{entry.priority}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">{player.positions[0]}{age !== null ? ` · ${age}a` : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 min-w-0">
                      <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${tierCfg.bg} ${tierCfg.text}`}>{tier}</span>
                      <span className="font-medium text-slate-700 truncate">{club.name}</span>
                      {club.league && <span className="text-slate-400 truncate hidden sm:inline">· {club.league}</span>}
                      <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                        {need.position}{need.ageMax ? ` ·Sub-${need.ageMax}` : ''}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  disabled={offering || dismissingOppKey === key}
                  onClick={async () => {
                    setOfferingOppKey(key)
                    try {
                      await onCreateNegotiation({ playerId: player.id, clubId: club.id, needPosition: need.position, status: 'pendiente', aisManager: club.aisManager || currentProfile.avatar })
                      showToast(`${player.name} ofrecido a ${club.name}`)
                    } catch {
                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                    } finally {
                      setOfferingOppKey(null)
                    }
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 px-3 py-2 sm:py-1.5 rounded-lg"
                >
                  {offering ? <BtnSpinner /> : <Plus className="w-3.5 h-3.5" />}
                  Ofrecer
                </button>
                <button
                  disabled={offering || dismissingOppKey === key}
                  onClick={async () => {
                    setDismissingOppKey(key)
                    try {
                      await onCreateNegotiation({ playerId: player.id, clubId: club.id, needPosition: need.position, status: 'descartado', aisManager: club.aisManager || currentProfile.avatar })
                      showToast('Oportunidad descartada')
                    } catch {
                      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error')
                    } finally {
                      setDismissingOppKey(null)
                    }
                  }}
                  title="Descartar: no encaja"
                  aria-label="Descartar oportunidad"
                  className="flex-shrink-0 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-60 p-2 rounded-lg"
                >
                  {dismissingOppKey === key ? <span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            )
          })}
          {filteredOpportunities.length > CAP && (
            <div className="px-3 py-2.5 text-center text-xs text-slate-400">
              Mostrando las primeras {CAP} de {filteredOpportunities.length}. Afina con la búsqueda o la prioridad.
            </div>
          )}
        </div>
        </>
      )}

      <ConfirmModal
        open={confirmBulkDismiss}
        title={`¿Descartar ${oppSelected.size} oportunidad${oppSelected.size !== 1 ? 'es' : ''}?`}
        message="Se marcarán como descartadas (jugador–club) y desaparecerán de Oportunidades para el equipo."
        confirmLabel={bulkDismissing ? 'Descartando…' : 'Descartar'}
        onConfirm={bulkDismissOpportunities}
        onCancel={() => setConfirmBulkDismiss(false)}
      />
    </div>
  )
}
