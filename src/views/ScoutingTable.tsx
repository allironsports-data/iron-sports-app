import { useState, useRef, useEffect } from 'react'
import type { ScoutingPlayer, ScoutingAssessment } from '../types'
import * as db from '../lib/db'
import { Save, X, Check } from 'lucide-react'
import { isValidDate } from '../lib/validate'

// Tabla de edición rápida de jugadores de scouting (Captación > Jugadores
// > modo Edición). Mismo patrón que PlayersTable de jugadores propios:
// clic en celda para editar, Tab avanza, cambios en lote con Guardar todo.

const ASSESSMENT_OPTIONS: ScoutingAssessment[] = ['Llamar', 'Seguir', 'Decidir', 'Basque', 'Visto', 'Descartado']

const POSITION_OPTIONS = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

const FOOT_OPTIONS = ['Derecho', 'Izquierdo', 'Ambidiestro']

interface EditingCell { playerId: string; field: string }

type ColumnDef = {
  key: string
  label: string
  width: string
  getValue: (p: ScoutingPlayer) => string
  setValue: (p: ScoutingPlayer, value: string) => ScoutingPlayer
  type?: 'text' | 'date' | 'select'
  options?: string[]
}

const PAGE_SIZE = 100

interface Props {
  /** Jugadores ya filtrados por la barra de filtros de Captación */
  players: ScoutingPlayer[]
  onUpdatePlayer: (p: ScoutingPlayer) => void
  showToast: (message: string, variant?: 'success' | 'error' | 'info') => void
}

export function ScoutingTable({ players, onUpdatePlayer, showToast }: Props) {
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editInvalid, setEditInvalid] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Map<string, ScoutingPlayer>>(new Map())
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(0)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  const columns: ColumnDef[] = [
    {
      key: 'fullName', label: 'Nombre', width: 'min-w-[170px]',
      getValue: p => p.fullName,
      setValue: (p, v) => ({ ...p, fullName: v.trim() || p.fullName }),
    },
    {
      key: 'position1', label: 'Posición 1', width: 'min-w-[130px]', type: 'select', options: POSITION_OPTIONS,
      getValue: p => p.position1 ?? '',
      setValue: (p, v) => ({ ...p, position1: v || undefined }),
    },
    {
      key: 'position2', label: 'Posición 2', width: 'min-w-[130px]', type: 'select', options: POSITION_OPTIONS,
      getValue: p => p.position2 ?? '',
      setValue: (p, v) => ({ ...p, position2: v || undefined }),
    },
    {
      key: 'birthdate', label: 'Nacimiento', width: 'min-w-[115px]', type: 'date',
      getValue: p => p.birthdate ?? '',
      setValue: (p, v) => ({ ...p, birthdate: v || undefined }),
    },
    {
      key: 'foot', label: 'Pie', width: 'min-w-[95px]', type: 'select', options: FOOT_OPTIONS,
      getValue: p => p.foot ?? '',
      setValue: (p, v) => ({ ...p, foot: v || undefined }),
    },
    {
      key: 'team', label: 'Equipo', width: 'min-w-[140px]',
      getValue: p => p.team ?? '',
      setValue: (p, v) => ({ ...p, team: v.trim() || undefined }),
    },
    {
      key: 'categoria', label: 'Categoría', width: 'min-w-[110px]',
      getValue: p => p.categoria ?? '',
      setValue: (p, v) => ({ ...p, categoria: v.trim() || undefined }),
    },
    {
      key: 'assessment', label: 'Assessment', width: 'min-w-[110px]', type: 'select', options: ASSESSMENT_OPTIONS,
      getValue: p => p.assessment ?? '',
      setValue: (p, v) => ({ ...p, assessment: (v || undefined) as ScoutingAssessment | undefined }),
    },
    {
      key: 'nationality', label: 'Nacionalidad', width: 'min-w-[110px]',
      getValue: p => p.nationality ?? '',
      setValue: (p, v) => ({ ...p, nationality: v.trim() || undefined }),
    },
    {
      key: 'agency', label: 'Agencia', width: 'min-w-[110px]',
      getValue: p => p.agency ?? '',
      setValue: (p, v) => ({ ...p, agency: v.trim() || undefined }),
    },
    {
      key: 'clubContract', label: 'Contrato', width: 'min-w-[100px]',
      getValue: p => p.clubContract ?? '',
      setValue: (p, v) => ({ ...p, clubContract: v.trim() || undefined }),
    },
    {
      key: 'contacto', label: 'Contacto', width: 'min-w-[120px]',
      getValue: p => p.contacto ?? '',
      setValue: (p, v) => ({ ...p, contacto: v.trim() || undefined }),
    },
    {
      key: 'comentarios', label: 'Comentarios', width: 'min-w-[180px]',
      getValue: p => p.comentarios ?? '',
      setValue: (p, v) => ({ ...p, comentarios: v.trim() || undefined }),
    },
  ]

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement && inputRef.current.type === 'text') {
        inputRef.current.select()
      }
    }
  }, [editing])

  // Si cambian los filtros del padre, volver a la primera página
  useEffect(() => { setPage(0) }, [players.length])

  const totalPages = Math.ceil(players.length / PAGE_SIZE)
  const pagePlayers = players.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const getPlayer = (id: string) => pendingChanges.get(id) ?? players.find(p => p.id === id)!

  const startEdit = (playerId: string, field: string) => {
    const col = columns.find(c => c.key === field)!
    setEditing({ playerId, field })
    setEditValue(col.getValue(getPlayer(playerId)))
    setEditInvalid(false)
  }

  const isEditValueValid = (col: ColumnDef, value: string): boolean => {
    if (!value) return true // vacío = borrar valor
    if (col.type === 'date') return isValidDate(value)
    return true
  }

  const confirmEdit = (): boolean => {
    if (!editing) return false
    const col = columns.find(c => c.key === editing.field)!
    if (!isEditValueValid(col, editValue)) { setEditInvalid(true); return false }
    const player = getPlayer(editing.playerId)
    if (editValue !== col.getValue(player)) {
      const updated = col.setValue(player, editValue)
      setPendingChanges(prev => new Map(prev).set(editing.playerId, updated))
    }
    setEditing(null)
    setEditInvalid(false)
    return true
  }

  const cancelEdit = () => { setEditing(null); setEditInvalid(false) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') cancelEdit()
    if (e.key === 'Tab') {
      e.preventDefault()
      const current = editing
      const ok = confirmEdit()
      if (ok && current) {
        const colIdx = columns.findIndex(c => c.key === current.field)
        const playerIdx = pagePlayers.findIndex(p => p.id === current.playerId)
        if (colIdx < columns.length - 1) {
          startEdit(current.playerId, columns[colIdx + 1].key)
        } else if (playerIdx < pagePlayers.length - 1) {
          startEdit(pagePlayers[playerIdx + 1].id, columns[0].key)
        }
      }
    }
  }

  const saveAll = async () => {
    if (saving) return
    const changes = Array.from(pendingChanges.values())
    setSaving(true)
    try {
      for (const p of changes) {
        const original = players.find(x => x.id === p.id)
        // Si cambió el assessment, registrar cuándo (Conclusiones > Movimientos)
        const withTs: ScoutingPlayer = p.assessment !== original?.assessment
          ? { ...p, assessmentUpdatedAt: new Date().toISOString() }
          : p
        await db.updateScoutingPlayer(withTs)
        onUpdatePlayer(withTs)
      }
      setPendingChanges(new Map())
      setSavedFeedback(`${changes.length} jugador${changes.length !== 1 ? 'es' : ''} actualizado${changes.length !== 1 ? 's' : ''}`)
      setTimeout(() => setSavedFeedback(null), 6000)
    } catch {
      showToast('No se pudieron guardar todos los cambios. Revisa e inténtalo de nuevo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const discardAll = () => { setPendingChanges(new Map()); setEditing(null) }
  const hasChanges = pendingChanges.size > 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar de cambios */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
        <span className="text-xs text-slate-500">
          Edición rápida — clic en cualquier celda · Tab avanza · Enter confirma · Esc cancela
        </span>
        <span className="flex-1" />
        {savedFeedback && (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
            <Check className="w-3.5 h-3.5" />{savedFeedback}
          </span>
        )}
        {hasChanges && (
          <>
            <span className="text-xs text-amber-600 font-semibold">{pendingChanges.size} cambio{pendingChanges.size !== 1 ? 's' : ''} sin guardar</span>
            <button onClick={discardAll}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors">
              <X className="w-3 h-3" />Descartar
            </button>
            <button onClick={saveAll} disabled={saving}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white font-semibold bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Save className="w-3 h-3" />{saving ? 'Guardando…' : 'Guardar todo'}
            </button>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map(col => (
                <th key={col.key} className={`text-left px-3 py-2.5 font-semibold text-slate-600 ${col.width} whitespace-nowrap`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagePlayers.map(raw => {
              const player = getPlayer(raw.id)
              const isModified = pendingChanges.has(player.id)
              return (
                <tr key={player.id} className={`border-b border-slate-50 hover:bg-blue-50/30 ${isModified ? 'bg-amber-50/40' : ''}`}>
                  {columns.map(col => {
                    const isEditing = editing?.playerId === player.id && editing?.field === col.key
                    const value = col.getValue(player)
                    const displayValue = col.key === 'birthdate' && value
                      ? new Date(value + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                      : value || '—'
                    return (
                      <td key={col.key} className={`px-3 py-1.5 ${col.width}`}>
                        {isEditing ? (
                          col.type === 'select' ? (
                            <select
                              ref={inputRef as React.RefObject<HTMLSelectElement>}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={confirmEdit}
                              onKeyDown={handleKeyDown}
                              className="w-full rounded border border-blue-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                            >
                              <option value="">—</option>
                              {(col.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input
                              ref={inputRef as React.RefObject<HTMLInputElement>}
                              type={col.type ?? 'text'}
                              value={editValue}
                              onChange={e => { setEditValue(e.target.value); setEditInvalid(false) }}
                              onBlur={confirmEdit}
                              onKeyDown={handleKeyDown}
                              aria-invalid={editInvalid}
                              className={`w-full rounded border px-1.5 py-1 text-xs focus:outline-none focus:ring-2 ${
                                editInvalid ? 'border-red-400 ring-1 ring-red-200 focus:ring-red-200' : 'border-blue-300 focus:ring-blue-200'
                              }`}
                            />
                          )
                        ) : (
                          <div
                            onClick={() => startEdit(player.id, col.key)}
                            title="Clic para editar"
                            className={`cursor-pointer hover:bg-blue-50 rounded px-1.5 py-1 -mx-1.5 -my-0.5 transition-colors truncate max-w-[260px] ${
                              col.key === 'fullName' ? 'font-medium text-slate-800' : 'text-slate-600'
                            } ${!value ? 'text-slate-300' : ''}`}
                          >
                            {displayValue}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {pagePlayers.length === 0 && (
              <tr><td colSpan={columns.length} className="text-center py-10 text-slate-400 text-sm">No hay jugadores que coincidan con los filtros</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
        <span className="text-[11px] text-slate-400">
          {players.length} jugador{players.length !== 1 ? 'es' : ''}
          {totalPages > 1 && ` · mostrando ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, players.length)}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-500 px-1.5">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
