import { createPortal } from 'react-dom'
import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { ScoutingPlayer, ScoutingReport } from '../../types'
import { ZONAS, ZONA_CORTA, SIN_ZONA, zonaDe, type Zona } from '../../lib/zonas'
import { normConclusion, birthYearFromBirthdate, relativeDate, fmtDate } from './helpers'

// ── Vista por zonas de «Llamar» ──────────────────────────────────────
// Pantalla completa: todos los jugadores con etiqueta actual «Llamar»,
// agrupados por la zona geográfica de su club, para ver de un vistazo
// las prioridades de cada zona antes de repartir llamadas.
//
// Prioridad dentro de cada zona: más informes con veredicto «Llamar»
// primero; en empate, el informe «Llamar» más reciente primero. Es la
// misma lógica que ya usa la bandeja «Candidatos a Llamar» de arriba.

type Fila = {
  p: ScoutingPlayer
  llamarCount: number
  lastLlamarDate?: string
}

export function LlamarZonasView({ players, reports, clubZonas, onOpenPlayer, onClose }: {
  players: ScoutingPlayer[]
  reports: ScoutingReport[]
  clubZonas: Record<string, Zona>
  onOpenPlayer: (id: string) => void
  onClose: () => void
}) {
  const porZona = useMemo(() => {
    const reportsByPlayer: Record<string, ScoutingReport[]> = {}
    for (const r of reports) {
      if (!reportsByPlayer[r.playerId]) reportsByPlayer[r.playerId] = []
      reportsByPlayer[r.playerId].push(r)
    }

    const grupos: Record<string, Fila[]> = {}
    for (const p of players) {
      if (p.assessment !== 'Llamar') continue
      const rs = reportsByPlayer[p.id] ?? []
      const llamar = rs
        .filter(r => normConclusion(r.conclusion) === 'Llamar')
        .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
      const zona = zonaDe(p.team, clubZonas) ?? SIN_ZONA
      if (!grupos[zona]) grupos[zona] = []
      grupos[zona].push({
        p,
        llamarCount: llamar.length,
        lastLlamarDate: llamar[0]?.fecha ?? llamar[0]?.createdAt,
      })
    }

    for (const zona of Object.keys(grupos)) {
      grupos[zona].sort((a, b) => {
        if (b.llamarCount !== a.llamarCount) return b.llamarCount - a.llamarCount
        const da = a.lastLlamarDate, db = b.lastLlamarDate
        if (da && db) return db.localeCompare(da)
        if (db) return 1
        if (da) return -1
        return a.p.fullName.localeCompare(b.p.fullName)
      })
    }

    const orden: string[] = [...ZONAS, SIN_ZONA]
    return orden
      .map(zona => ({ zona, filas: grupos[zona] ?? [] }))
      .filter(g => g.filas.length > 0)
      .sort((a, b) => b.filas.length - a.filas.length)
  }, [players, reports, clubZonas])

  const total = porZona.reduce((s, g) => s + g.filas.length, 0)

  function abrir(id: string) {
    onOpenPlayer(id)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <h2 className="text-sm font-bold text-slate-800">Por llamar · por zonas</h2>
        <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-bold">{total}</span>
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          orden dentro de cada zona: más informes «Llamar» primero, en empate el más reciente
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar vista por zonas"
          className="ml-auto p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {total === 0 ? (
          <p className="text-xs text-slate-400 italic px-4 py-6">No hay jugadores en «Llamar» todavía.</p>
        ) : (
          <div className="h-full flex gap-3 p-3" style={{ width: 'max-content' }}>
            {porZona.map(({ zona, filas }) => (
              <div key={zona} className="w-[260px] flex-shrink-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs font-bold text-slate-700 truncate" title={zona}>
                    {ZONA_CORTA[zona as Zona] ?? zona}
                  </span>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{filas.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {filas.map(({ p, llamarCount, lastLlamarDate }) => (
                    <button
                      key={p.id}
                      onClick={() => abrir(p.id)}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50/60 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-800 truncate">{p.fullName}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {[p.position1, birthYearFromBirthdate(p.birthdate) !== '—' ? birthYearFromBirthdate(p.birthdate) : null, p.team].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {llamarCount > 0 ? (
                          <span className="text-[10px] font-extrabold bg-amber-500 text-white rounded-full px-1.5 py-0.5">{llamarCount}× Llamar</span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400 italic">sin informe «Llamar»</span>
                        )}
                        {lastLlamarDate && (
                          <span className="text-[10px] text-slate-400">{relativeDate(lastLlamarDate) || fmtDate(lastLlamarDate)}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
