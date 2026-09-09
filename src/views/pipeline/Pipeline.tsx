import React, { useState, useEffect } from 'react'
import { LogOut, TrendingUp, Eye, Inbox, PenLine, Activity } from 'lucide-react'
import logoImg from '../../assets/logo.jpeg'
import type { Player, Task, FirmasEntry, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, BoulemaPeticion } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import type { PatchFirmasEntry } from '../captacion/helpers'
import { ToastStack } from '../../components/ToastStack'
import { useToast } from '../../hooks/useToast'
import { FirmasTab } from '../captacion/firmas/FirmasTab'
import { TimelineTab } from './TimelineTab'

// ── Sección PIPELINE ─────────────────────────────────────────────────
// Antes era la primera pestaña de Captación («Pipeline/Firmar»). Se ha
// sacado a sección propia porque no va de scouting: va del estado de cada
// negociación. Dentro tiene dos vistas:
//   Firmar   → el tablero de siempre, tal cual estaba
//   Timeline → todo lo que se mueve, de más reciente a más antiguo

export type PipelineTab = 'firmar' | 'timeline'

export interface PipelineProps {
  firmasEntries: FirmasEntry[]
  tasks: Task[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  onSyncFirmasActionTasks?: () => Promise<number>
  onCreateFirmasEntry: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  onPatchFirmasEntry: PatchFirmasEntry
  onDeleteFirmasEntry: (id: string) => Promise<void>
  /** Abrir la ficha de un jugador de Captación desde una tarjeta */
  onOpenScoutingPlayer: (id: string) => void
  /** Abrir una tarjeta concreta al entrar (desde el Dashboard, el buscador…) */
  openEntryId?: string | null
  onOpenEntryConsumed?: () => void
  onGoToSection: (s: 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'boulema') => void
  onLogout: () => void
  onAdmin?: () => void
}

export function Pipeline(props: PipelineProps) {
  const {
    firmasEntries, tasks, profiles, currentProfile, openEntryId, onOpenEntryConsumed,
    onGoToSection, onLogout, onAdmin,
  } = props
  const isAdmin = currentProfile.is_admin
  const { toasts, showToast, dismissToast } = useToast()

  const [tabElegida, setTab] = useState<PipelineTab>(
    () => (sessionStorage.getItem('pipeline_tab') as PipelineTab) ?? 'firmar'
  )
  // Si llega un enlace directo a una tarjeta manda el tablero, que es quien
  // sabe abrirla. Derivado en vez de un efecto: así no hay un render con la
  // pestaña equivocada ni un setState dentro de useEffect.
  const tab: PipelineTab = openEntryId ? 'firmar' : tabElegida
  useEffect(() => { sessionStorage.setItem('pipeline_tab', tab) }, [tab])

  // Salto interno desde el Timeline a la tarjeta del tablero
  const [saltoId, setSaltoId] = useState<string | null>(null)

  const headerRef = React.useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const medir = () => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [tab])

  const nav1 = 'flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header ref={headerRef} className="bg-white border-b border-slate-200 sticky top-0 z-50">
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

        {/* Nivel 1 */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
          <button onClick={() => onGoToSection('tareas')} className={nav1}>Mantenimiento</button>
          <button onClick={() => onGoToSection('distribucion')} className={nav1}>
            <TrendingUp className="w-3.5 h-3.5" /> Distribución
          </button>
          <button onClick={() => onGoToSection('captacion')} className={nav1}>
            <Eye className="w-3.5 h-3.5" /> Captación
          </button>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
            <PenLine className="w-3.5 h-3.5" /> Pipeline
          </button>
          <button onClick={() => onGoToSection('boulema')} className={nav1}>
            <Inbox className="w-3.5 h-3.5" /> Boulema
          </button>
        </div>

        {/* Nivel 2 */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 py-1.5 border-t border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
          {([
            { id: 'firmar' as PipelineTab, label: 'Firmar', icon: <PenLine className="w-3.5 h-3.5" /> },
            { id: 'timeline' as PipelineTab, label: 'Timeline', icon: <Activity className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'firmar' && (
        <FirmasTab
          entries={firmasEntries}
          profiles={profiles}
          currentProfile={currentProfile}
          isAdmin={isAdmin}
          scoutingPlayers={props.scoutingPlayers}
          scoutingReports={props.scoutingReports}
          scoutingMatches={props.scoutingMatches}
          matchPlayers={props.matchPlayers}
          boulemaPeticiones={props.boulemaPeticiones}
          players={props.players}
          onCreatePlayer={props.onCreatePlayer}
          onSyncActionTasks={props.onSyncFirmasActionTasks}
          openEntryId={openEntryId ?? saltoId}
          onOpenEntryConsumed={() => { onOpenEntryConsumed?.(); setSaltoId(null) }}
          onCreate={props.onCreateFirmasEntry}
          onPatch={props.onPatchFirmasEntry}
          onDelete={props.onDeleteFirmasEntry}
          onOpenScoutingPlayer={props.onOpenScoutingPlayer}
          showToast={showToast}
          headerHeight={headerHeight}
        />
      )}

      {tab === 'timeline' && (
        <TimelineTab
          entries={firmasEntries}
          tasks={tasks}
          profiles={profiles}
          onOpenEntry={id => { setSaltoId(id); setTab('firmar') }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
