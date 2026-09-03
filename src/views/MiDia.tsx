// ── Vista «Mi día» ────────────────────────────────────────────────────
//
// Lista de una columna (móvil primero) con lo que toca HOY: partidos,
// acciones de Firmar, tareas y postpartidos. La lógica está en
// src/lib/miDia.ts; aquí solo se pinta y se llaman los callbacks.
//
// CÓMO CABLEARLO DESDE App.tsx (los handlers ya existen salvo donde se indica):
//
//   <MiDia
//     profile={profile}                       // perfil autenticado (AuthContext)
//     profiles={profiles}
//     isAdmin={!!profile.is_admin}
//     tasks={tasks} scoutingMatches={scoutingMatches} matchScouts={matchScouts}
//     firmasEntries={firmasEntries} postpartidos={postpartidos}
//     players={players} scoutingPlayers={scoutingPlayers}
//     onBack={() => setMainSection('tareas')}
//     // Abrir tarea: el tablero está en Dashboard; basta ir a 'tareas' y
//     // abrir el TaskDetailPanel (p. ej. con un estado `openTaskId` que
//     // Dashboard consuma como hace Captacion con openFirmasEntryId).
//     onOpenTask={(id) => { setOpenTaskId(id); setMainSection('tareas') }}
//     // Abrir partido: Captación no tiene aún prop de apertura de partido;
//     // hoy lo más cercano es ir a la sección (o añadir `openMatchId` a
//     // Captacion, que internamente hace setDetailMatchId).
//     onOpenMatch={() => setMainSection('captacion')}
//     onOpenFirmasEntry={(id) => { setCaptacionOpenFirmasId(id); setMainSection('captacion') }}
//     onOpenPlayer={(id) => navigateToPlayer(id, false)}
//     // «Hecho» en tarea → handleUpdateTask (fija completedAt y sincroniza Firmar)
//     onCompleteTask={async (id) => { const t = tasks.find(x => x.id === id); if (t) await handleUpdateTask({ ...t, status: 'completada' }) }}
//     // «Visto» en partido → handleSetMatchScoutStatus(matchId, profile.avatar, 'visto').
//     // Si el partido no tiene scouts en la tabla (solo assignedTo), usar el
//     // handler de actualización de partido (updateScoutingMatch con status 'visto').
//     onSetMatchSeen={(id) => handleSetMatchScoutStatus(id, profile.avatar, 'visto')}
//     // «Hecho» en acción de Firmar → handlePatchFirmasEntry(id, changes) (nuevo;
//     // limpia nextAction* y añade el apunte «✓ Hecho»). Mientras no exista,
//     // equivale a completar su tarea vinculada con handleUpdateTask, que ya
//     // hace esa limpieza en Firmar (ver handleUpdateTask en App.tsx).
//     onCompleteFirmasAction={(id) => handlePatchFirmasEntry(id, { nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined })}
//   />
//
// Ruta sugerida: `#/mi-dia` (añadir 'mi-dia' a la lista de secciones del
// router de hash en App.tsx).

import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, CheckCircle2, ExternalLink, Eye, Phone, ClipboardList, Trophy, ListTodo, AlertTriangle, Sun } from 'lucide-react'
import type { Task, ScoutingMatch, ScoutingMatchScout, FirmasEntry, Postpartido, Player, ScoutingPlayer } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { hoyISO } from '../lib/fechas'
import { construirMiDia, contarMiDia, tituloDia, type MiDiaItem, type MiDiaTipo } from '../lib/miDia'
import { EmptyState } from '../components/EmptyState'

export interface MiDiaProps {
  /** Perfil autenticado */
  profile: Profile
  profiles: Profile[]
  /** Si true, muestra el selector de persona */
  isAdmin?: boolean
  tasks: Task[]
  scoutingMatches: ScoutingMatch[]
  matchScouts: ScoutingMatchScout[]
  firmasEntries: FirmasEntry[]
  postpartidos: Postpartido[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  onOpenTask: (taskId: string) => void
  onOpenMatch: (matchId: string) => void
  onOpenFirmasEntry: (entryId: string) => void
  onOpenPlayer: (playerId: string) => void
  onCompleteTask: (taskId: string) => void | Promise<void>
  onSetMatchSeen: (matchId: string) => void | Promise<void>
  onCompleteFirmasAction: (entryId: string) => void | Promise<void>
  onBack: () => void
}

const ICONO: Record<MiDiaTipo, { Icon: typeof Trophy; cls: string; label: string }> = {
  partido: { Icon: Trophy, cls: 'bg-emerald-50 text-emerald-600', label: 'Partido' },
  accion: { Icon: Phone, cls: 'bg-amber-50 text-amber-600', label: 'Acción Firmar' },
  tarea: { Icon: ListTodo, cls: 'bg-blue-50 text-blue-600', label: 'Tarea' },
  postpartido: { Icon: ClipboardList, cls: 'bg-violet-50 text-violet-600', label: 'Postpartido' },
}

const BTN = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm font-medium transition-colors active:scale-[0.98]'

export function MiDia({
  profile, profiles, isAdmin = false, tasks, scoutingMatches, matchScouts, firmasEntries, postpartidos,
  players, scoutingPlayers, onOpenTask, onOpenMatch, onOpenFirmasEntry, onOpenPlayer,
  onCompleteTask, onSetMatchSeen, onCompleteFirmasAction, onBack,
}: MiDiaProps) {
  const hoy = hoyISO()
  const [personaId, setPersonaId] = useState(profile.id)
  const persona = profiles.find(p => p.id === personaId) ?? profile
  const esYo = persona.id === profile.id
  // ids en vuelo para deshabilitar el botón mientras guarda
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const items = useMemo(() => construirMiDia({
    profileId: persona.id, avatar: persona.avatar, hoy,
    tasks, scoutingMatches, matchScouts, firmasEntries, postpartidos, players, scoutingPlayers,
  }), [persona.id, persona.avatar, hoy, tasks, scoutingMatches, matchScouts, firmasEntries, postpartidos, players, scoutingPlayers])
  const c = contarMiDia(items)

  async function run(id: string, fn: () => void | Promise<void>) {
    setBusy(prev => new Set(prev).add(id))
    try { await fn() } catch (e) { console.error(e) } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  // Botón principal («Visto» / «Hecho») según el tipo. Solo sobre lo mío.
  function accionPrincipal(it: MiDiaItem) {
    if (!esYo) return null
    const disabled = busy.has(it.id)
    if (it.tipo === 'partido' && it.ref.matchId) {
      const id = it.ref.matchId
      return (
        <button disabled={disabled} onClick={() => run(it.id, () => onSetMatchSeen(id))}
          className={`${BTN} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50`}>
          <Eye className="w-4 h-4" /> Visto
        </button>
      )
    }
    if (it.tipo === 'accion' && it.ref.firmasEntryId) {
      const id = it.ref.firmasEntryId
      return (
        <button disabled={disabled} onClick={() => run(it.id, () => onCompleteFirmasAction(id))}
          className={`${BTN} bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50`}>
          <CheckCircle2 className="w-4 h-4" /> Hecho
        </button>
      )
    }
    if (it.tipo === 'tarea' && it.ref.taskId) {
      const id = it.ref.taskId
      return (
        <button disabled={disabled} onClick={() => run(it.id, () => onCompleteTask(id))}
          className={`${BTN} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
          <CheckCircle2 className="w-4 h-4" /> Hecho
        </button>
      )
    }
    // Postpartido: completar exige vídeo → se hace desde su tarea/pantalla, aquí solo «Abrir»
    return null
  }

  // «Abrir»: lleva a la pantalla natural de cada item
  function abrir(it: MiDiaItem) {
    const r = it.ref
    if (it.tipo === 'partido' && r.matchId) return onOpenMatch(r.matchId)
    if (it.tipo === 'accion' && r.firmasEntryId) return onOpenFirmasEntry(r.firmasEntryId)
    if (it.tipo === 'postpartido') {
      if (r.taskId) return onOpenTask(r.taskId)
      if (r.playerId) return onOpenPlayer(r.playerId)
      if (r.matchId) return onOpenMatch(r.matchId)
      return
    }
    if (r.taskId) return onOpenTask(r.taskId)
  }

  const resumen = [
    `${c.partidos} ${c.partidos === 1 ? 'partido' : 'partidos'}`,
    `${c.acciones} ${c.acciones === 1 ? 'acción' : 'acciones'}`,
    `${c.tareas + c.postpartidos} ${c.tareas + c.postpartidos === 1 ? 'tarea' : 'tareas'}`,
  ].join(' · ')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} aria-label="Volver" className="p-2 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800 truncate">
              Mi día · <span className="font-medium text-slate-600">{tituloDia(hoy)}</span>
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {resumen}
              {c.vencidos > 0 && <span className="ml-1 text-red-500 font-medium">· {c.vencidos} {c.vencidos === 1 ? 'vencido' : 'vencidos'}</span>}
            </p>
          </div>
          {isAdmin && profiles.length > 1 && (
            <select value={personaId} onChange={e => setPersonaId(e.target.value)} aria-label="Persona"
              className="min-h-[40px] text-sm border border-slate-200 rounded-lg px-2 bg-white text-slate-700 max-w-[9rem]">
              {profiles.map(p => <option key={p.id} value={p.id}>{p.id === profile.id ? 'Yo' : p.name}</option>)}
            </select>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 sm:px-4 py-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<Sun className="w-12 h-12" />}
            title={esYo ? 'Nada pendiente para hoy' : `${persona.name} no tiene nada pendiente hoy`}
            subtitle="Ni partidos, ni acciones de Firmar, ni tareas vencidas. Buen momento para adelantar trabajo."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map(it => {
              const { Icon, cls, label } = ICONO[it.tipo]
              return (
                <li key={it.id}
                  className={`bg-white rounded-xl border p-3 shadow-sm ${it.vencido ? 'border-red-200' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${cls}`} title={label}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        {it.hora && <span className="text-xl font-bold tabular-nums text-slate-800 leading-none">{it.hora}</span>}
                        {it.vencido && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                            <AlertTriangle className="w-3 h-3" /> Vencido
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 leading-snug mt-0.5 break-words">{it.titulo}</p>
                      <p className="text-xs text-slate-500 mt-0.5 break-words">{it.subtitulo}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {accionPrincipal(it)}
                    <button onClick={() => abrir(it)} className={`${BTN} flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                      <ExternalLink className="w-4 h-4" /> Abrir
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {items.length > 0 && (
          <p className="text-[11px] text-slate-400 text-center mt-6 flex items-center justify-center gap-1">
            <CalendarCheck className="w-3 h-3" /> Lo completado desaparece de la lista
          </p>
        )}
      </main>
    </div>
  )
}
