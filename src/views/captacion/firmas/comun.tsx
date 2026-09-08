import { useState, useMemo } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport, FirmasEntry, FirmasStatus } from '../../../types'
import type { Profile } from '../../../contexts/AuthContext'
import { norm as normSearch } from '../../../lib/texto'
import { normConclusion, fmtDate, todayISO, relativeDate, scoutColor } from '../helpers'
import { FIRMAS_STATUSES, FIRMAS_CONFIG, FIRMAS_ACTION_KIND_META, necesitaTelefono } from './helpers'

// ── Firmar · componentes pequeños compartidos ──

export function FirmasStatusChip({ status, onChange, size = 'sm' }: {
  status: FirmasStatus
  onChange: (s: FirmasStatus) => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const cfg = FIRMAS_CONFIG[status]
  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors ${cfg.bg} ${cfg.text} ${cfg.border} ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[130px]">
            {FIRMAS_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { setOpen(false); if (s !== status) onChange(s) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 ${s === status ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
              >
                <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[s].dot}`} />
                {FIRMAS_CONFIG[s].label}
                {s === 'firmado' && <span className="ml-auto">🎉</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Avatares de encargados (iniciales)
export function FirmasManagers({ managerIds, profiles, max = 3 }: { managerIds: string[]; profiles: Profile[]; max?: number }) {
  const mgrs = managerIds.map(id => profiles.find(p => p.id === id)).filter(Boolean) as Profile[]
  if (mgrs.length === 0) return null
  return (
    <span className="inline-flex items-center -space-x-1">
      {mgrs.slice(0, max).map(p => {
        const c = scoutColor(p.avatar || p.name)
        return (
          <span
            key={p.id}
            title={p.name}
            className={`w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8.5px] font-bold ${c.bg} ${c.text}`}
          >
            {(p.avatar || p.name.slice(0, 2)).slice(0, 3).toUpperCase()}
          </span>
        )
      })}
      {mgrs.length > max && (
        <span className="w-5 h-5 rounded-full border border-white bg-slate-100 text-slate-500 flex items-center justify-center text-[8.5px] font-bold">
          +{mgrs.length - max}
        </span>
      )}
    </span>
  )
}

// Buscador de jugador de scouting para vincular
export function FirmasLinkSearch({ scoutingPlayers, onSelect, placeholder }: {
  scoutingPlayers: ScoutingPlayer[]
  onSelect: (p: ScoutingPlayer) => void
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const n = normSearch(q)
    if (n.length < 2) return []
    return scoutingPlayers
      .filter(p => normSearch(p.fullName).includes(n) || (p.team && normSearch(p.team).includes(n)))
      .slice(0, 8)
  }, [q, scoutingPlayers])
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder ?? 'Buscar en jugadores de Captación…'}
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setQ('') }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
            >
              <span className="text-xs font-medium text-slate-800">{p.fullName}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">
                {[p.team, p.birthdate ? p.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Ficha rápida al pasar el ratón por una tarjeta (solo dispositivos con hover)
export function FirmasHoverCard({ entry, sp, reports, profiles, pos }: {
  entry: FirmasEntry
  sp?: ScoutingPlayer
  reports: ScoutingReport[]
  profiles: Profile[]
  pos: { x: number; y: number }
}) {
  const lastReport = reports[0]
  const lastComment = [...entry.comments].reverse().find(c => c.kind !== 'estatus')
  const cfg = FIRMAS_CONFIG[entry.status]
  // clamp para no salirse de la ventana
  const left = Math.min(pos.x, window.innerWidth - 300)
  const top = Math.min(pos.y, window.innerHeight - 230)
  return (
    <div
      className="fixed z-[70] w-[280px] bg-white border border-slate-200 rounded-xl shadow-2xl p-3 pointer-events-none"
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 truncate">{sp?.fullName ?? entry.playerName}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {sp
              ? [sp.position1, sp.birthdate ? sp.birthdate.slice(0, 4) : null, sp.team].filter(Boolean).join(' · ')
              : entry.zone}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold flex-shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
        <span className="bg-slate-100 rounded px-1.5 py-0.5">{entry.zone}</span>
        {sp && (
          <span className="bg-slate-100 rounded px-1.5 py-0.5">
            {reports.length} informe{reports.length !== 1 ? 's' : ''}
            {lastReport?.conclusion ? ` · últ. "${normConclusion(lastReport.conclusion)}"` : ''}
          </span>
        )}
        {entry.nextActionDate && (
          <span className={`rounded px-1.5 py-0.5 ${entry.nextActionDate < todayISO() ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            {FIRMAS_ACTION_KIND_META[entry.nextActionKind ?? '']?.icon ?? '📌'} {entry.nextAction ?? 'Acción'} · {fmtDate(entry.nextActionDate)}
          </span>
        )}
        {necesitaTelefono(entry) && (
          <span className="rounded px-1.5 py-0.5 bg-violet-50 text-violet-700">📵 sin teléfono</span>
        )}
      </div>
      {lastComment && (
        <div className="mt-2 bg-slate-50 rounded-lg px-2 py-1.5 text-[11px] text-slate-600">
          {FIRMAS_ACTION_KIND_META[lastComment.kind ?? 'nota']?.icon} {lastComment.text.length > 90 ? lastComment.text.slice(0, 90) + '…' : lastComment.text}
          <span className="text-slate-400"> · {lastComment.author?.split(' ')[0]} · {relativeDate(lastComment.date) || fmtDate(lastComment.date)}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <FirmasManagers managerIds={entry.managers} profiles={profiles} />
        <span className="text-[10.5px] text-slate-400">clic para abrir el panel</span>
      </div>
    </div>
  )
}
