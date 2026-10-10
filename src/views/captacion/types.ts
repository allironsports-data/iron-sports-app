import type { CaptacionTab } from './helpers'
import type { Player, ScoutingPlayer, ScoutingReport, ScoutingInfo, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchOurPlayer, ScoutingMatchScout, Ofrecimiento, OfrecimientoOrigen, FirmasEntry } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import type { Equipo as EquipoCatalogo } from '../../lib/db'
import type { Zona } from '../../lib/zonas'
// ── Props ────────────────────────────────────────────────────

export interface Props {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  profiles: Profile[]
  currentProfile: Profile
  onBack: () => void
  onGoToSection: (s: 'inicio' | 'tareas' | 'jugadores' | 'distribucion' | 'pipeline' | 'boulema') => void
  onLogout: () => void
  onAdmin?: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onUpdatePlayer: (p: ScoutingPlayer) => void
  onDeletePlayer: (id: string) => void
  onAddReport: (r: ScoutingReport) => void
  onUpdateReport: (r: ScoutingReport) => void
  onDeleteReport: (id: string) => void
  /** Informes que no son de partido: personalidad, contractual, mercado */
  scoutingInfos: ScoutingInfo[]
  onAddScoutingInfo: (i: ScoutingInfo) => void
  onUpdateScoutingInfo: (i: ScoutingInfo) => void
  onDeleteScoutingInfo: (id: string) => void
  onAddMatch: (m: ScoutingMatch) => void
  onUpdateMatch: (m: ScoutingMatch) => void
  onDeleteMatch: (id: string) => void
  matchPlayers: ScoutingMatchPlayer[]
  onAddMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchPlayer: (matchId: string, playerId: string) => Promise<void>
  /** Jugadores NUESTROS (players) asignados a mano a un partido (Planificación) */
  matchOurPlayers: ScoutingMatchOurPlayer[]
  onAddMatchOurPlayer: (matchId: string, playerId: string) => Promise<void>
  onRemoveMatchOurPlayer: (matchId: string, playerId: string) => Promise<void>
  /** Varios scouts por partido (tabla scouting_match_scouts) */
  matchScouts: ScoutingMatchScout[]
  onAddMatchScout: (matchId: string, scout: string, viewMode?: 'campo' | 'video') => Promise<void>
  onRemoveMatchScout: (matchId: string, scout: string) => Promise<void>
  onSetMatchScoutStatus: (matchId: string, scout: string, status: 'pendiente' | 'visto') => Promise<void>
  onSetMatchScoutMode: (matchId: string, scout: string, viewMode: 'campo' | 'video') => Promise<void>
  /** Abrir la ficha de un jugador al montar (navegación desde otra sección, p. ej. Boulema) */
  openPlayerId?: string | null
  onOpenPlayerConsumed?: () => void
  /** Abrir la ficha de un partido (navegación desde «Mi día») */
  openMatchId?: string | null
  onOpenMatchConsumed?: () => void
  /** Abrir una pestaña concreta desde fuera (botón flotante «Planificación») */
  openTab?: CaptacionTab | null
  onOpenTabConsumed?: () => void
  /**
   * Modo flotante: no se pinta la sección, solo la ficha de ese partido o de
   * ese jugador encima de la pantalla en la que esté el usuario (calendario,
   * tareas, pipeline…). Al cerrarla se llama a onCerrarSolo.
   */
  /** `informe`: abrir la ficha con el formulario de ese informe ya desplegado (desde el cierre de una tarea Informe) */
  solo?: { partidoId?: string; jugadorId?: string; informe?: 'tecnico' | 'entorno' | 'mercado' | 'personalidad' }
  onCerrarSolo?: () => void
  /** Pestaña activa, si la lleva App (va en el hash: «atrás» cambia de pestaña) */
  tab?: string
  onTabChange?: (tab: CaptacionTab) => void
  /** Cuenta "solo Captación": oculta el resto de secciones y deja solo Jugadores, Partidos e Informes */
  restricted?: boolean
  /** Catálogo de equipos (pestaña Equipos) */
  equipos: EquipoCatalogo[]
  onSaveEquipo: (e: Partial<EquipoCatalogo> & { nombre: string; club: string }) => Promise<void>
  /** Zonas de club corregidas a mano (mandan sobre la clasificación por defecto) */
  clubZonas: Record<string, Zona>
  onSetClubZona: (club: string, nombre: string, zona: Zona | null) => Promise<void>
  /** Para los avisos del pipeline Firmar y el alta en Mantenimiento al firmar */
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  /** Pestaña Ofrecidos: jugadores que nos ofrecen de fuera */
  ofrecimientos: Ofrecimiento[]
  onCreateOfrecimiento: (o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Ofrecimiento>
  onPatchOfrecimiento: (id: string, fn: (o: Ofrecimiento) => Ofrecimiento) => Promise<void>
  onDeleteOfrecimiento: (id: string) => Promise<void>
  /** Abrir la ficha de un ofrecimiento al entrar (desde Mi día, la campana…) */
  openOfrecidoId?: string | null
  onOpenOfrecidoConsumed?: () => void
  /** Filtro de origen al entrar en Ofrecidos (acceso directo desde Boulema) */
  ofrecidosOrigen?: OfrecimientoOrigen | null
  onOfrecidosOrigenConsumed?: () => void
  /** Solo para leer: la etiqueta de pipeline que sale en las listas de jugadores */
  firmasEntries: FirmasEntry[]
  onCreateFirmasEntry: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  /** Saltar a la sección Pipeline y abrir esa tarjeta */
  onOpenFirmas: (id: string) => void
}
