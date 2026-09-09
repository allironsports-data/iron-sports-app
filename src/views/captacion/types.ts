import type { CaptacionTab } from './helpers'
import type { Player, ScoutingPlayer, ScoutingReport, ScoutingInfo, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchOurPlayer, ScoutingMatchScout, BoulemaPeticion, FirmasEntry } from '../../types'
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
  onGoToSection: (s: 'tareas' | 'jugadores' | 'distribucion' | 'pipeline' | 'boulema') => void
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
  boulemaPeticiones: BoulemaPeticion[]
  /** Solo para leer: la etiqueta de pipeline que sale en las listas de jugadores */
  firmasEntries: FirmasEntry[]
  onCreateFirmasEntry: (e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FirmasEntry>
  /** Saltar a la sección Pipeline y abrir esa tarjeta */
  onOpenFirmas: (id: string) => void
}
