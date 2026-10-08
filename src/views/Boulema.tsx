import { useState, useEffect } from 'react'
import {
  Search, X, Plus, LogOut, Trash2,
  Inbox, TrendingUp, Eye, Users, PenLine} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { ScoutingPlayer, BoulemaPlayer } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useIsDesktop } from '../hooks/useIsDesktop'
import * as db from '../lib/db'

// ── Constantes (compartidas con Captación) ───────────────────

const POSITIONS_SCOUTING = [
  'Portero',
  'Central', 'Central derecho', 'Central izquierdo',
  'Lateral derecho', 'Lateral izquierdo',
  'Pivote', 'Mediocentro', 'Mediapunta',
  'Extremo derecho', 'Extremo izquierdo', 'Extremo', 'Delantero',
]

// ── Modal de jugador de Boulema (mantenimiento light) ────────
function BoulemaPlayerModal({ profiles, initial, onClose, onSave, promote }: {
  profiles: Profile[]
  initial?: BoulemaPlayer
  onClose: () => void
  onSave: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  /** Pasar el jugador a Captación (solo en edición) */
  promote?: { exists: boolean; run: () => Promise<void> }
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [contacto, setContacto] = useState(initial?.contacto ?? '')
  const [manager, setManager] = useState(initial?.manager ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose)

  const canSave = fullName.trim().length >= 2 && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        fullName: fullName.trim(),
        birthYear: birthYear.trim() || undefined,
        position: position || undefined,
        team: team.trim() || undefined,
        country: country.trim() || undefined,
        nationality: nationality.trim() || undefined,
        contacto: contacto.trim() || undefined,
        manager: manager || undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const INPUT = 'w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{initial ? 'Editar jugador' : 'Añadir jugador de Boulema'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nombre *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre del jugador" autoFocus className={`mt-1 ${INPUT}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Año nac.</label>
              <input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2008" className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Posición</label>
              <select value={position} onChange={e => setPosition(e.target.value)} className={`mt-1 ${INPUT}`}>
                <option value="">—</option>
                {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Club</label>
              <input value={team} onChange={e => setTeam(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">País (donde juega)</label>
              <input value={country} onChange={e => setCountry(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nacionalidad</label>
              <input value={nationality} onChange={e => setNationality(e.target.value)} className={`mt-1 ${INPUT}`} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Encargado AIS</label>
              <select value={manager} onChange={e => setManager(e.target.value)} className={`mt-1 ${INPUT}`}>
                <option value="">—</option>
                {profiles.map(p => <option key={p.id} value={p.avatar}>{p.avatar} · {p.name.split(' ')[0]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Contacto</label>
            <input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Teléfono, persona…" className={`mt-1 ${INPUT}`} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`mt-1 ${INPUT} resize-y`} />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          {promote && (
            promote.exists ? (
              <span className="text-[11px] text-green-600 font-medium">Ya en Captación ✓</span>
            ) : (
              <button
                onClick={() => void promote.run()}
                className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition-colors"
                title="Crea su ficha en Captación (scouting) con estos datos"
              >
                → Pasar a Captación
              </button>
            )
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
          <button onClick={() => void save()} disabled={!canSave} className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors">
            {saving ? 'Guardando…' : initial ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────

interface Props {
  profiles: Profile[]
  scoutingPlayers: ScoutingPlayer[]
  /** Ofrecimientos abiertos con origen Boulema (viven en Captación → Ofrecidos) */
  ofrecimientosBoulema: number
  onGoToOfrecidos: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  boulemaPlayers: BoulemaPlayer[]
  onAddBoulemaPlayer: (p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateBoulemaPlayer: (p: BoulemaPlayer) => Promise<void>
  onDeleteBoulemaPlayer: (id: string) => Promise<void>
  onGoToSection: (s: 'tareas' | 'distribucion' | 'captacion' | 'pipeline') => void
  /** Pestaña activa, si la lleva App (va en el hash: «atrás» cambia de pestaña) */
  tab?: string
  onTabChange?: (tab: 'mantenimiento') => void
  onLogout: () => void
  onAdmin?: () => void
}

export function Boulema({
  profiles,
  scoutingPlayers,
  ofrecimientosBoulema,
  onGoToOfrecidos,
  onAddPlayer,
  boulemaPlayers,
  onAddBoulemaPlayer,
  onUpdateBoulemaPlayer,
  onDeleteBoulemaPlayer,
  onGoToSection,
  onLogout,
  onAdmin,
  tab: tabProp,
  onTabChange,
}: Props) {
  const { toasts, showToast, dismissToast } = useToast()
  // Antes se pintaban SIEMPRE las dos versiones de la lista (la tabla de
  // escritorio y la lista de móvil) y una se escondía con CSS. Ahora se
  // decide aquí y solo se construye la que se ve.
  const esAncha = useIsDesktop(640)

  // ── estado local ──
  // Solo queda una pestaña (Mantenimiento): las peticiones de informe se
  // han movido a Captación → Ofrecidos. La pestaña se deja fijada en el
  // hash para que los enlaces antiguos sigan funcionando.
  useEffect(() => { if (tabProp !== 'mantenimiento') onTabChange?.('mantenimiento') }, [tabProp, onTabChange])

  // ── mantenimiento light ──
  const [mantSearch, setMantSearch] = useState('')
  const [showAddMantPlayer, setShowAddMantPlayer] = useState(false)
  const [editingMantPlayer, setEditingMantPlayer] = useState<BoulemaPlayer | null>(null)
  const [confirmDeleteMantId, setConfirmDeleteMantId] = useState<string | null>(null)


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-3 h-12 sm:h-14">
          <img src={logoImg} alt="All Iron Sports" className="h-7 sm:h-8 w-auto rounded" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase hidden sm:block">All Iron Sports</span>
          <div className="flex-1" />
          {onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2 sm:py-1 rounded hover:bg-slate-100">Admin</button>
          )}
          <button onClick={onLogout} aria-label="Cerrar sesión" className="text-slate-400 hover:text-slate-700 p-2.5 sm:p-1.5 rounded hover:bg-slate-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Level 1: main sections */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
          <button
            onClick={() => onGoToSection('tareas')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            Mantenimiento
          </button>
          <button
            onClick={() => onGoToSection('distribucion')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Distribución
          </button>
          <button
            onClick={() => onGoToSection('captacion')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Captación
          </button>
          <button
            onClick={() => onGoToSection('pipeline')}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            Pipeline
          </button>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
            <Inbox className="w-3.5 h-3.5" />
            Boulema
          </button>
        </div>

        {/* Sub-pestañas de Boulema: solo queda Mantenimiento. Las peticiones
            de informe viven ahora en Captación → Ofrecidos (origen Boulema). */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          <button className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white">
            <Users className="w-3.5 h-3.5" />
            Mantenimiento
            {boulemaPlayers.length > 0 && (
              <span className="min-w-[16px] text-center text-[10px] font-bold rounded-full px-1 bg-white/25 text-white">{boulemaPlayers.length}</span>
            )}
          </button>
          <button
            onClick={onGoToOfrecidos}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            title="Los ofrecimientos de Boulema están en Captación → Ofrecidos"
          >
            <Inbox className="w-3.5 h-3.5" />
            Ofrecimientos de Boulema
            {ofrecimientosBoulema > 0 && (
              <span className="min-w-[16px] text-center text-[10px] font-bold rounded-full px-1 bg-slate-200 text-slate-600">{ofrecimientosBoulema}</span>
            )}
            <span className="text-slate-300">↗</span>
          </button>
        </div>
      </header>

      {/* ── MANTENIMIENTO (light) ── */}
      {(() => {
        const q = mantSearch.toLowerCase().trim()
        const filtered = boulemaPlayers.filter(p =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          (p.team?.toLowerCase().includes(q)) ||
          (p.country?.toLowerCase().includes(q))
        )
        return (
          <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-400" />
                <h2 className="text-base font-semibold text-slate-800">Mantenimiento</h2>
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{filtered.length}</span>
              </div>
              <button
                onClick={() => setShowAddMantPlayer(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Añadir jugador</span>
              </button>
            </div>

            {boulemaPlayers.length > 0 && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={mantSearch}
                  onChange={e => setMantSearch(e.target.value)}
                  placeholder="Buscar jugador, club, país..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            )}

            {boulemaPlayers.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">Aún no hay jugadores de Boulema</p>
                <p className="text-xs text-slate-300 mt-1">Versión light del mantenimiento: nombre, club, país, contacto y notas</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Sin resultados con la búsqueda</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Escritorio: tabla */}
                {esAncha && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Jugador', 'Año', 'Posición', 'Club', 'País', 'Enc.', 'Notas', ''].map((h, i) => (
                          <th key={i} className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map(p => (
                        <tr key={p.id} onClick={() => setEditingMantPlayer(p)} className="cursor-pointer hover:bg-slate-50/60 transition-colors">
                          <td className="px-3 py-2 font-medium text-slate-800">{p.fullName}</td>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{p.birthYear ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.position ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.team ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{p.country ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-xs">{p.manager ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs max-w-[220px] truncate">{p.notes ?? ''}</td>
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            {confirmDeleteMantId === p.id ? (
                              <span className="flex items-center gap-1">
                                <button onClick={() => setConfirmDeleteMantId(null)} className="text-[11px] px-2 py-0.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">No</button>
                                <button
                                  onClick={async () => {
                                    try { await onDeleteBoulemaPlayer(p.id); setConfirmDeleteMantId(null); showToast('Jugador eliminado') }
                                    catch { showToast('No se pudo eliminar', 'error') }
                                  }}
                                  className="text-[11px] px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                                >
                                  Sí
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteMantId(p.id)}
                                className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                aria-label="Eliminar jugador"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                {/* Móvil: lista */}
                {!esAncha && (
                <div className="divide-y divide-slate-100">
                  {filtered.map(p => (
                    <button key={p.id} onClick={() => setEditingMantPlayer(p)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{p.fullName}</span>
                        <span className="block text-[11px] text-slate-400 truncate">
                          {[p.team, p.birthYear, p.country].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      {p.manager && <span className="flex-shrink-0 text-[10px] font-mono font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{p.manager}</span>}
                    </button>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Modales de jugador de Boulema */}
      {showAddMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          onClose={() => setShowAddMantPlayer(false)}
          onSave={async (p) => {
            try { await onAddBoulemaPlayer(p); setShowAddMantPlayer(false); showToast('Jugador añadido') }
            catch { showToast('No se pudo crear (¿has ejecutado la migración SQL?)', 'error') }
          }}
        />
      )}
      {editingMantPlayer && (
        <BoulemaPlayerModal
          profiles={profiles}
          initial={editingMantPlayer}
          promote={{
            exists: scoutingPlayers.some(sp => sp.fullName.toLowerCase().trim() === editingMantPlayer.fullName.toLowerCase().trim()),
            run: async () => {
              try {
                const saved = await db.createScoutingPlayer({
                  fullName: editingMantPlayer.fullName,
                  birthdate: editingMantPlayer.birthYear ? `${editingMantPlayer.birthYear}-02-28` : undefined,
                  position1: editingMantPlayer.position,
                  team: editingMantPlayer.team,
                  nationality: editingMantPlayer.nationality,
                  comentarios: editingMantPlayer.notes ? `Origen Boulema · ${editingMantPlayer.notes}` : 'Origen: Boulema',
                })
                onAddPlayer(saved)
                setEditingMantPlayer(null)
                showToast(`${editingMantPlayer.fullName} creado en Captación`)
              } catch {
                showToast('No se pudo crear en Captación', 'error')
              }
            },
          }}
          onClose={() => setEditingMantPlayer(null)}
          onSave={async (p) => {
            try { await onUpdateBoulemaPlayer({ ...editingMantPlayer, ...p }); setEditingMantPlayer(null); showToast('Jugador actualizado') }
            catch { showToast('No se pudo guardar', 'error') }
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
