import { useState, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { EquipoInput } from '../components/EquipoInput'
import { NacionalidadInput } from '../components/NacionalidadInput'
import { BUILD_ID, CHANGELOG } from "../changelog";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { useToastContext } from "../hooks/useToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAtras } from "../hooks/useAtras";
import { isValidName, isValidBirthDate } from "../lib/validate";
import logoImg from '../assets/logo.jpeg';
import type { Player, Task, PlayerActivity, ScoutingMatch, ScoutingMatchScout, ScoutingPlayer, MemberStatus, Postpartido, FirmasEntry, AgendaEvento } from "../types";
import { calcAge, clubsLabel, PLAYER_ESTADOS, EVENTO_DE_TAREA } from "../types";
import { fechaLocal, hoyISO, lunesDe, esVencida, parseDia, sumarDias } from "../lib/fechas";
import { construirAgenda, estaArchivada, type AgendaItem, type AgendaEstado } from "../lib/agendaItems";
import type { AltaRapida } from "../lib/altaRapida";
import { tituloDia } from "../lib/miDia";
import { MiDiaLista } from "./MiDiaLista";
import { AgendaRow } from "../components/agenda/AgendaRow";
import { itemEsDe, seccionesDelDia, DIAS_POSTPARTIDO } from "../lib/agendaItems";
import { resumenSemanal } from "../lib/resumenSemanal";
import { CalendarioSemanal } from "./CalendarioSemanal";
import { EventoModal, type EventoBorrador } from "../components/agenda/EventoModal";
import { CerrarReunionModal } from "../components/agenda/CerrarReunionModal";
import { CerrarLlamadaModal } from "../components/agenda/CerrarLlamadaModal";
import { esReunionCerrable, horaActual } from "../lib/reuniones";
import { apunteDeEvento, aplicarCierreEnTarjeta, aplicarCierreLlamada, conSiguientePaso, esAccionDeLlamada, type DatosCierre, type DatosLlamada } from "./captacion/firmas/cierreReunion";
import { ViajeModal } from "../components/agenda/ViajeModal";
import { TareaModal } from "../components/agenda/TareaModal";
import { RegistroContactoModal, type RegistroContacto } from "../components/agenda/RegistroContactoModal";
import { InformeDatosModal } from "../components/agenda/InformeDatosModal";
import { TipoNuevo } from "../components/agenda/TipoNuevo";
import { useActividadesRango } from "../hooks/useActividadesRango";
import {
  createPlayerActivity, createGroupActivity, deletePlayerActivity, deleteGroupActivity, fetchActivitiesByAuthor, createScoutingMatch,
  createAgendaEvento, updateAgendaEvento, deleteAgendaEvento, esMigracionPendiente,
} from "../lib/db";
import type { Profile } from "../contexts/AuthContext";
import type { AppNotification } from "../App";
import { LogOut, Users, AlertTriangle, Plus, Search, X, Trash2, UserPlus, CheckSquare, Square, Bell, Cake, Calendar, BarChart3, ChevronLeft, ChevronRight, ChevronDown, LayoutList, LayoutGrid, Table, Zap, TrendingUp, Eye, EyeOff, ExternalLink, RotateCcw, Check, Inbox, Sun, Trophy, PenLine, Home } from 'lucide-react';
import { POSITIONS, POSITION_CODES, positionLabel } from "../lib/positions";
import { opcionesPartner, jugadorEsDePartner, PARTNER_TODOS } from "../lib/partners";
import { estadoDe, jugadorEsDeEstado, contarPorEstado, ESTADO_META, ESTADO_TODOS, type FiltroEstado } from "../lib/estadoJugador";
import { jugadorEsDePrioridad, SIN_PRIORIDAD } from "../lib/prioridadJugador";
import { PrioridadBadge } from "../components/PrioridadBadge";
import { PLAYER_PRIORIDADES } from "../types";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  view?: 'tareas' | 'jugadores';   // which section to show
  onViewChange?: (v: 'inicio' | 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'pipeline' | 'boulema' | 'mi-dia') => void;
  /** Abrir una tarea concreta al entrar (p. ej. desde «Mi día»); se consume una vez abierta */
  openTaskId?: string | null;
  onOpenTaskConsumed?: () => void;
  /** Abrir la ventana de alta (tarea o evento) al entrar (desde Inicio); se consume una vez abierta */
  abrirAlta?: boolean;
  onAbrirAltaConsumed?: () => void;
  /** Pipeline de firmas — para el aviso de próximas acciones de hoy */
  firmasEntries?: FirmasEntry[];
  onOpenFirmar?: (entryId: string) => void;
  /** Cambia la próxima acción de una tarjeta de Firmar (y, con ella, su tarea vinculada) */
  onPatchFirmasEntry?: (id: string, changes: Partial<FirmasEntry> | ((e: FirmasEntry) => FirmasEntry)) => Promise<void>;
  /** Scouts asignados a cada partido — para los partidos de «Mi día» */
  matchScouts?: ScoutingMatchScout[];
  /** «partido|iniciales» de cada informe de partido ya escrito */
  informesPartido?: Set<string>;
  /** Informes pedidos en Ofrecidos y sin escribir (uno por ofrecimiento, persona y tipo) */
  informesPedidos?: { ofrecimientoId: string; jugador: string; equipo?: string; avatar: string; tipo: string; pedidoPor?: string; fecha?: string }[];
  /** Procesos (tareas en curso): ISO de la última nota de cada uno */
  ultimasNotas?: Record<string, string>;
  /** Escribe la actualización semanal de un proceso (nota en la tarea) */
  onActualizarProceso?: (taskId: string, texto: string) => Promise<void>;
  /** Se ha escrito una nota en una tarea desde el panel: App lo apunta como actualización */
  onNotaTarea?: (taskId: string, iso: string) => void;
  /** Abre la ficha de un ofrecimiento (Captación → Ofrecidos) */
  onOpenOfrecido?: (ofrecimientoId: string) => void;
  /** Eventos de agenda: los carga App (y los refresca por realtime); aquí se crean, editan y cierran */
  eventos: AgendaEvento[];
  setEventos: Dispatch<SetStateAction<AgendaEvento[]>>;
  /** Asigna un scout (iniciales) a un partido de Captación */
  onAddMatchScout?: (matchId: string, scout: string, viewMode?: 'campo' | 'video') => Promise<void>;
  /** Abre la ficha de un partido de Captación */
  onOpenMatch?: (matchId: string) => void;
  /** Marca un partido como visto/pendiente. `scout` = iniciales si el partido tiene scouts propios */
  onSetMatchSeen?: (matchId: string, scout: string | undefined, visto: boolean) => Promise<void>;
  /** true si hay una versión nueva de la app desplegada (detectado en App.tsx) */
  updateAvailable?: boolean;
  /** Pestaña interna (calendario/equipo/postpartidos) si la lleva App: va en el hash. null = la del `view` */
  tab?: string;
  onTabChange?: (tab: TabInterna | null) => void;
  /** Abre la ficha de Captación de un jugador encima de la pantalla */
  onOpenScoutingPlayer?: (scoutingPlayerId: string) => void;
  /** Abre el buscador global de la app (⌘K): el mismo en todas las secciones */
  onOpenSearch?: () => void;
  /** Jugadores de Captación — para ligar un evento a uno de ellos */
  scoutingPlayers?: ScoutingPlayer[];
  players: Player[];
  tasks: Task[];
  profiles: Profile[];
  currentProfile: Profile;
  onSelectPlayer: (id: string) => void;
  onLogout: () => void;
  onAddPlayer: (player: Player) => void;
  /** Guarda la ficha de un jugador (p. ej. para registrarle un informe de datos enviado) */
  onUpdatePlayer?: (player: Player) => void | Promise<void>;
  onAdmin?: () => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkAssignManager?: (playerIds: string[], managerId: string) => Promise<void>;
  notifications?: AppNotification[];
  onDismissNotification?: (id: string) => void;
  onAddGeneralTask?: (task: Task) => void | Task | Promise<void | Task>;
  onUpdateGeneralTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onDeleteGeneralTask?: (taskId: string) => void;
  onOverview?: () => void;
  onSelectProfile?: (profileId: string) => void;
  scoutingMatches?: ScoutingMatch[];
  memberStatuses?: MemberStatus[];
  onUpdateMemberStatus?: (s: Omit<MemberStatus, 'updatedAt'>) => Promise<void>;
  /** Solo llega si el usuario es admin: oculta/muestra un miembro en el panel de estado */
  onToggleStatusHidden?: (profileId: string, hidden: boolean) => Promise<void>;
  postpartidos?: Postpartido[];
  onCreatePostpartido?: (p: Omit<Postpartido, 'id' | 'createdAt'>) => Promise<Postpartido>;
  onUpdatePostpartido?: (p: Postpartido) => Promise<void>;
  onDeletePostpartido?: (p: Postpartido) => Promise<void>;
  /** Sincroniza en App un partido creado desde aquí (aparece en Captación → Partidos) */
  onAddScoutingMatch?: (m: ScoutingMatch) => void;
}

type TabInterna = 'calendario' | 'equipo' | 'postpartidos';
const esTabInterna = (t?: string): t is TabInterna => t === 'calendario' || t === 'equipo' || t === 'postpartidos';

// Birthday helpers
function isBirthdayToday(birthDate: string): boolean {
  const today = new Date();
  const birth = new Date(birthDate);
  return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
}

function isBirthdaySoon(birthDate: string, days: number): boolean {
  const today = new Date();
  today.setHours(0,0,0,0);
  const birth = new Date(birthDate);
  const thisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (thisYear < today) thisYear.setFullYear(thisYear.getFullYear() + 1);
  const diff = (thisYear.getTime() - today.getTime()) / (1000*60*60*24);
  return diff > 0 && diff <= days;
}

// ── Estado del equipo: la tarea en curso sale sola del tablero ──
export function Dashboard({
  view = 'tareas',
  onViewChange,
  openTaskId,
  onOpenTaskConsumed,
  abrirAlta,
  onAbrirAltaConsumed,
  firmasEntries,
  onOpenFirmar,
  onPatchFirmasEntry,
  matchScouts = [],
  scoutingPlayers = [],
  onOpenSearch,
  onOpenScoutingPlayer,
  informesPartido,
  informesPedidos,
  ultimasNotas,
  onActualizarProceso,
  onNotaTarea,
  onOpenOfrecido,
  eventos,
  setEventos,
  onAddMatchScout,
  onOpenMatch,
  onSetMatchSeen,
  updateAvailable,
  tab: tabProp,
  onTabChange,
  players,
  tasks,
  profiles,
  currentProfile,
  onSelectPlayer,
  onLogout,
  onAddPlayer,
  onUpdatePlayer,
  onAdmin,
  onBulkDelete,
  onBulkAssignManager,
  notifications = [],
  onDismissNotification,
  onAddGeneralTask,
  onUpdateGeneralTask,
  onUpdateTask,
  onDeleteGeneralTask,
  onOverview,
  onSelectProfile,
  scoutingMatches = [],
  memberStatuses = [],
  onUpdateMemberStatus,
  onToggleStatusHidden,
  postpartidos = [],
  onCreatePostpartido,
  onUpdatePostpartido,
  onDeletePostpartido,
  onAddScoutingMatch,
}: Props) {
  const { showToast } = useToastContext();
  // Internal tabs: 'equipo'/'postpartidos' se gestionan localmente; 'tareas'/'jugadores' vienen del prop `view`
  // La pestaña la lleva App cuando viene por props (y entonces va en el hash
  // y «atrás» cambia de pestaña). Montado suelto, la lleva el componente.
  const [internalTabLocal, setInternalTabLocal] = useState<TabInterna | null>(null);
  const internalTab: TabInterna | null =
    onTabChange
      ? (esTabInterna(tabProp) ? tabProp : null)
      : internalTabLocal;
  const setInternalTab = (t: TabInterna | null) => { setInternalTabLocal(t); onTabChange?.(t); };
  const activeTab = internalTab ?? view;   // 'tareas' | 'calendario' | 'jugadores' | 'equipo' | 'postpartidos'
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddGeneralTask, setShowAddGeneralTask] = useState(false);

  // ── Postpartidos ──
  const [showAddPostpartido, setShowAddPostpartido] = useState(false);
  // Postpartido que se está editando en el mismo modal (null = creando uno nuevo)
  const [ppEditing, setPpEditing] = useState<Postpartido | null>(null);
  const [ppMatchId, setPpMatchId] = useState('');
  const [ppNewMatchOpen, setPpNewMatchOpen] = useState(false);
  const [ppNewMatch, setPpNewMatch] = useState({ date: '', home: '', away: '', competition: '' });
  const [ppCreatingMatch, setPpCreatingMatch] = useState(false);
  const [ppPlayerId, setPpPlayerId] = useState('');          // id de jugador o '__otro__'
  const [ppPlayerName, setPpPlayerName] = useState('');      // texto libre si '__otro__'
  const [ppAssigneeId, setPpAssigneeId] = useState('');
  const [ppDue, setPpDue] = useState('');
  const [ppNotes, setPpNotes] = useState('');
  const [ppSaving, setPpSaving] = useState(false);
  const [ppShowDone, setPpShowDone] = useState(true);   // completados visibles (solo cambian de color)
  const [ppDeleteConfirm, setPpDeleteConfirm] = useState<Postpartido | null>(null);
  const [ppDeleting, setPpDeleting] = useState(false);
  // Completar exige link de vídeo (Streamable)
  const [ppCompleteTarget, setPpCompleteTarget] = useState<{ pp: Postpartido; task: Task } | null>(null);
  const [ppVideoUrl, setPpVideoUrl] = useState('');
  const [ppCompleting, setPpCompleting] = useState(false);

  async function completePostpartido() {
    if (!ppCompleteTarget || !onUpdatePostpartido || !onUpdateTask || ppCompleting) return;
    const url = ppVideoUrl.trim();
    if (!/^https?:\/\/.+/.test(url)) {
      showToast('Pega el link del vídeo (debe empezar por http…).', 'error');
      return;
    }
    setPpCompleting(true);
    try {
      await onUpdatePostpartido({ ...ppCompleteTarget.pp, videoUrl: url });
      await Promise.resolve(onUpdateTask({ ...ppCompleteTarget.task, status: 'completada' }));
      setPpCompleteTarget(null);
      setPpVideoUrl('');
      showToast('Postpartido completado ✓');
    } catch (err) {
      // Mostramos el motivo real (p. ej. "column video_url does not exist"
      // si falta la migración migration_postpartidos_video_url.sql)
      const msg = err instanceof Error ? err.message : '';
      showToast(msg ? `No se pudo guardar: ${msg}` : 'No se pudo guardar. Inténtalo de nuevo.', 'error');
    } finally {
      setPpCompleting(false);
    }
  }

  function openAddPostpartido() {
    setPpEditing(null);
    setPpMatchId(''); setPpNewMatchOpen(false);
    setPpNewMatch({ date: '', home: '', away: '', competition: '' });
    setPpPlayerId(''); setPpPlayerName('');
    setPpAssigneeId(currentProfile.id);
    setPpDue(''); setPpNotes('');
    setShowAddPostpartido(true);
  }

  // Editar una petición ya creada: partido, jugador, responsable, fecha límite y notas.
  // La fecha límite vive en la tarea asociada; el resto en el propio postpartido.
  function openEditPostpartido(pp: Postpartido, task?: Task) {
    setPpEditing(pp);
    setPpMatchId(pp.matchId ?? ''); setPpNewMatchOpen(false);
    setPpNewMatch({ date: '', home: '', away: '', competition: '' });
    if (pp.playerId) { setPpPlayerId(pp.playerId); setPpPlayerName(''); }
    else if (pp.playerName) { setPpPlayerId('__otro__'); setPpPlayerName(pp.playerName); }
    else { setPpPlayerId(''); setPpPlayerName(''); }
    setPpAssigneeId(pp.assigneeId ?? task?.assigneeId ?? currentProfile.id);
    setPpDue(task?.dueDate ?? '');
    setPpNotes(pp.notes ?? '');
    setShowAddPostpartido(true);
  }

  async function saveEditPostpartido() {
    if (!ppEditing || !onUpdatePostpartido || ppSaving) return;
    const match = scoutingMatches.find(m => m.id === ppMatchId);
    if (!match) { showToast('Elige un partido (o añade uno nuevo).', 'error'); return; }
    const player = ppPlayerId && ppPlayerId !== '__otro__' ? players.find(p => p.id === ppPlayerId) : undefined;
    const playerLabel = player ? player.name : ppPlayerName.trim();
    if (!playerLabel) { showToast('Elige un jugador o escríbelo en texto libre.', 'error'); return; }
    if (!ppAssigneeId) { showToast('Elige un responsable.', 'error'); return; }
    const guardar = onUpdateTask ?? onUpdateGeneralTask;
    const task = ppEditing.taskId ? tasks.find(t => t.id === ppEditing.taskId) : undefined;
    const notes = ppNotes.trim() || undefined;
    setPpSaving(true);
    try {
      // 1) La tarea asociada: título, descripción, responsable, fecha y jugador siguen al postpartido
      if (task && guardar) {
        const prevPlayer = ppEditing.playerId ? players.find(p => p.id === ppEditing.playerId) : undefined;
        const prevLabel = prevPlayer?.name ?? ppEditing.playerName ?? '';
        const prevDesc = [ppEditing.notes?.trim() ?? '', prevPlayer ? '' : `Jugador: ${prevLabel}`].filter(Boolean).join('\n');
        // Solo se regenera la descripción si la generó el propio postpartido (o estaba vacía):
        // si alguien la editó a mano en la tarea, se respeta
        const descAuto = !task.description || task.description === prevDesc;
        await Promise.resolve(guardar({
          ...task,
          playerId: player ? player.id : 'general',
          title: `Postpartido ${match.homeTeam} vs ${match.awayTeam} — ${playerLabel}`,
          description: descAuto
            ? [notes ?? '', player ? '' : `Jugador: ${playerLabel}`].filter(Boolean).join('\n')
            : task.description,
          assigneeId: ppAssigneeId,
          dueDate: ppDue || sumarDias(match.date, DIAS_POSTPARTIDO),
        }));
      }
      // 2) El propio registro
      await onUpdatePostpartido({
        ...ppEditing,
        matchId: match.id,
        playerId: player?.id,
        playerName: player ? undefined : playerLabel,
        assigneeId: ppAssigneeId,
        notes,
      });
      setShowAddPostpartido(false);
      setPpEditing(null);
      showToast('Postpartido actualizado ✓');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      showToast(msg ? `No se pudo guardar: ${msg}` : 'No se pudo guardar. Inténtalo de nuevo.', 'error');
    } finally {
      setPpSaving(false);
    }
  }

  // Crear un partido nuevo desde el formulario — aparece también en Captación → Partidos
  async function createMatchInline() {
    if (!ppNewMatch.date || !ppNewMatch.home.trim() || !ppNewMatch.away.trim()) {
      showToast('Fecha, local y visitante son obligatorios.', 'error');
      return;
    }
    setPpCreatingMatch(true);
    try {
      const saved = await createScoutingMatch({
        date: ppNewMatch.date,
        homeTeam: ppNewMatch.home.trim(),
        awayTeam: ppNewMatch.away.trim(),
        competition: ppNewMatch.competition.trim() || undefined,
        status: 'pendiente',
      });
      onAddScoutingMatch?.(saved);
      setPpMatchId(saved.id);
      setPpNewMatchOpen(false);
      setPpNewMatch({ date: '', home: '', away: '', competition: '' });
      showToast('Partido añadido (visible en Captación → Partidos)');
    } catch {
      showToast('No se pudo crear el partido. Inténtalo de nuevo.', 'error');
    } finally {
      setPpCreatingMatch(false);
    }
  }

  async function createPostpartido() {
    if (!onCreatePostpartido || !onAddGeneralTask || ppSaving) return;
    const match = scoutingMatches.find(m => m.id === ppMatchId);
    if (!match) { showToast('Elige un partido (o añade uno nuevo).', 'error'); return; }
    const player = ppPlayerId && ppPlayerId !== '__otro__' ? players.find(p => p.id === ppPlayerId) : undefined;
    const playerLabel = player ? player.name : ppPlayerName.trim();
    if (!playerLabel) { showToast('Elige un jugador o escríbelo en texto libre.', 'error'); return; }
    if (!ppAssigneeId) { showToast('Elige un responsable.', 'error'); return; }
    setPpSaving(true);
    try {
      // 1) La tarea: aparece en el tablero del responsable y en la ficha del jugador
      const t: Task = {
        id: 't' + Date.now(),
        playerId: player ? player.id : 'general',
        title: `Postpartido ${match.homeTeam} vs ${match.awayTeam} — ${playerLabel}`,
        description: [ppNotes.trim(), player ? '' : `Jugador: ${playerLabel}`].filter(Boolean).join('\n'),
        assigneeId: ppAssigneeId,
        watchers: [],
        priority: 'media',
        status: 'pendiente',
        label: 'Postpartido',
        // Sin fecha elegida, a los dos días del partido: un postpartido nunca es un «algún día»
        dueDate: ppDue || sumarDias(match.date, DIAS_POSTPARTIDO),
        createdAt: new Date().toISOString(),
        comments: [],
      };
      const result = await Promise.resolve(onAddGeneralTask(t));
      const savedTask = result && typeof result === 'object' && 'id' in result ? (result as Task) : undefined;
      // 2) El registro de postpartido con sus tres vínculos
      await onCreatePostpartido({
        matchId: match.id,
        playerId: player?.id,
        playerName: player ? undefined : playerLabel,
        assigneeId: ppAssigneeId,
        taskId: savedTask?.id,
        notes: ppNotes.trim() || undefined,
      });
      setShowAddPostpartido(false);
      const assignee = profiles.find(pr => pr.id === ppAssigneeId);
      showToast(`Postpartido creado y asignado a ${assignee?.name.split(' ')[0] ?? 'responsable'}`);
    } catch {
      showToast('No se pudo crear el postpartido. Inténtalo de nuevo.', 'error');
    } finally {
      setPpSaving(false);
    }
  }

  // ── Eventos de agenda (tabla agenda_eventos; opcional hasta migrar): estado de App ──
  // Sube al crear/editar/borrar un evento: invalida las actividades cacheadas
  const [actsVersion, setActsVersion] = useState(0);
  // Modal de evento: valores de partida y, si se edita, el evento original
  const [eventoModal, setEventoModal] = useState<{ inicial: Partial<EventoBorrador>; original?: AgendaEvento } | null>(null);
  // Tarea de contacto que se está completando: antes de cerrarla se pregunta qué pasó
  const [registro, setRegistro] = useState<Task | null>(null);
  // Tarea de tipo «Informe» de un jugador que se está completando: se pregunta si registrar el informe de datos
  const [informeDatos, setInformeDatos] = useState<Task | null>(null);
  // Reunión del pipeline que se está cerrando (recap + siguiente paso)
  const [cierre, setCierre] = useState<AgendaEvento | null>(null);
  // Llamada del pipeline que se está marcando hecha (¿contestó?)
  const [llamada, setLlamada] = useState<FirmasEntry | null>(null);
  // "HH:MM" de ahora, cada 5 minutos: una reunión de hoy pasa a «sin cerrar» cuando llega su hora
  const [ahoraHora, setAhoraHora] = useState(() => horaActual());
  useEffect(() => {
    const t = setInterval(() => setAhoraHora(horaActual()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // Viaje abierto (id): enseña a qué jugadores del pipeline se puede visitar
  const [viajeId, setViajeId] = useState<string | null>(null);
  useAtras(!!viajeId, () => setViajeId(null), 'viaje');
  // Valores de partida de «Nueva tarea» cuando se abre desde una celda del calendario
  const [tareaInicial, setTareaInicial] = useState<{ assigneeId?: string; dueDate?: string }>({});
  function openAddEvent(inicial: Partial<EventoBorrador> = {}) {
    setEventoModal({ inicial: { fecha: fechaLocal(new Date()), participantIds: [currentProfile.id], ...inicial } });
  }

  // Los eventos con jugadores de Mantenimiento se apuntan además en su
  // actividad (player_activities), que es lo que lee la ficha del jugador.
  async function crearActividades(e: EventoBorrador): Promise<string | undefined> {
    if (e.playerIds.length === 0) return undefined;
    const input = {
      date: e.fecha, type: e.tipo,
      notes: [e.titulo, e.notas].filter(Boolean).join(' — ') || undefined,
      authorId: e.authorId ?? currentProfile.id,
      participantProfileIds: e.participantIds.length > 0 ? e.participantIds : undefined,
    };
    if (e.playerIds.length > 1) {
      const filas = await createGroupActivity(e.playerIds, input);
      return filas[0]?.groupId;
    }
    return (await createPlayerActivity(e.playerIds[0], input)).id;
  }
  async function borrarActividades(ref?: string) {
    if (!ref) return;
    // activity_ref es el id de una fila o el group_id de varias: se prueba con los dos
    await deleteGroupActivity(ref).catch(() => {});
    await deletePlayerActivity(ref).catch(() => {});
  }

  // ── Evento ⇄ pipeline Firmar ──
  // Un evento ligado a un jugador de Captación que está en el pipeline queda
  // apuntado en el historial de su tarjeta (y se quita si el evento se borra).
  // Al revés ya ocurre: la próxima acción de la tarjeta sale en Mi día y en el
  // calendario como llamada o reunión.
  const tarjetaDe = (scoutingPlayerId?: string) =>
    scoutingPlayerId ? (firmasEntries ?? []).find(f => f.scoutingPlayerId === scoutingPlayerId) : undefined;
  const idApunte = (eventoId: string) => `evento-${eventoId}`;

  async function apuntarEnPipeline(ev: AgendaEvento, anterior?: AgendaEvento) {
    if (!onPatchFirmasEntry) return;
    const antes = tarjetaDe(anterior?.scoutingPlayerId);
    const ahora = tarjetaDe(ev.scoutingPlayerId);
    try {
      if (antes && antes.id !== ahora?.id) {
        await onPatchFirmasEntry(antes.id, f => ({ ...f, comments: f.comments.filter(c => c.id !== idApunte(ev.id)) }));
      }
      if (!ahora) return;
      // Mismo apunte que usa el cierre (views/captacion/firmas/cierreReunion):
      // una reunión queda marcada «pendiente de cerrar» hasta que se cierra
      const apunte = apunteDeEvento(ev, currentProfile, hoyISO());
      await onPatchFirmasEntry(ahora.id, f => ({ ...f, comments: [...f.comments.filter(c => c.id !== apunte.id), apunte] }));
    } catch (err) { console.error('No se pudo apuntar el evento en la tarjeta de Firmar:', err); }
  }

  // Tarea ⇄ pipeline: un comentario en la tarea de una próxima acción de Firmar
  // («conseguir el contacto»…) queda también en el historial de su tarjeta.
  function comentarioAFirmar(task: Task, texto: string) {
    // Una nota en una tarea en curso cuenta como su actualización semanal
    onNotaTarea?.(task.id, new Date().toISOString());
    const tarjeta = (firmasEntries ?? []).find(f => f.nextActionTaskId === task.id);
    if (!tarjeta || !onPatchFirmasEntry) return;
    onPatchFirmasEntry(tarjeta.id, f => ({
      ...f,
      comments: [...f.comments, {
        id: crypto.randomUUID(),
        text: `💬 ${texto}`,
        date: new Date().toISOString(),
        author: currentProfile.name,
        authorId: currentProfile.id,
        kind: 'nota' as const,
      }],
    })).catch(err => console.error('No se pudo apuntar el comentario en la tarjeta de Firmar:', err));
  }

  // Desde un viaje: deja apuntada la visita a un jugador del pipeline un día concreto
  async function crearVisitaDeViaje(viaje: AgendaEvento, tarjeta: FirmasEntry, dia: string) {
    try {
      const creado = await createAgendaEvento({
        titulo: `Visita · ${tarjeta.playerName}`,
        tipo: 'Visita presencial',
        fecha: dia,
        ambito: 'captacion',
        playerIds: [],
        scoutingPlayerId: tarjeta.scoutingPlayerId,
        participantIds: viaje.participantIds,
        lugar: viaje.lugar,
        notas: `Durante el viaje a ${viaje.lugar ?? 'destino'}`,
        authorId: currentProfile.id,
      });
      setEventos(prev => [creado, ...prev]);
      await apuntarEnPipeline(creado);
      showToast(`Visita a ${tarjeta.playerName} apuntada`, 'success');
    } catch {
      showToast('No se pudo apuntar la visita. Inténtalo de nuevo.', 'error');
    }
  }

  // ── Tarea de contacto → evento ──
  // «Llamar a X» es tarea mientras está pendiente; hecha, lo que queda es el
  // evento (se le llamó ese día y qué dijo). Las tareas que nacen de Firmar ya
  // dejan su apunte en la tarjeta: a esas no se les pregunta.
  const pideRegistro = (antes: Task, despues: Task) =>
    despues.status === 'completada' && antes.status !== 'completada' &&
    !!antes.label && !!EVENTO_DE_TAREA[antes.label] &&
    !(firmasEntries ?? []).some(f => f.nextActionTaskId === antes.id);

  // Tarea «Informe» de un jugador nuestro → al completarla se ofrece registrarla como
  // «Informe de datos» enviado, en su ficha (Rendimiento → Análisis).
  const jugadorDe = (t: Task) => t.playerId && t.playerId !== 'general' ? players.find(p => p.id === t.playerId) : undefined;
  const pideInformeDatos = (antes: Task, despues: Task) =>
    despues.status === 'completada' && antes.status !== 'completada' &&
    antes.label === 'Informe' && !!jugadorDe(antes) && !!onUpdatePlayer;

  async function completarInforme(task: Task, r: { enlace: string; nota: string } | null) {
    try {
      if (guardarTarea) await Promise.resolve(guardarTarea(task));
      setInformeDatos(null);
      if (detailTask?.id === task.id) setDetailTask(null);
      const jugador = jugadorDe(task);
      if (!r || !jugador || !onUpdatePlayer) { showToast('Tarea hecha', 'success'); return; }
      await Promise.resolve(onUpdatePlayer({
        ...jugador,
        videoSessions: [{
          id: 'vs' + Date.now(), tipo: 'informe_datos', titulo: task.title, description: r.nota,
          date: hoyISO(), videoUrl: r.enlace, participantes: [task.assigneeId || currentProfile.id],
        }, ...(jugador.videoSessions ?? [])],
      }));
      showToast(`Tarea hecha e informe registrado en la ficha de ${jugador.name.split(' ')[0]}`, 'success');
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
    }
  }

  // Tarea de una llamada o WhatsApp del pipeline que se está completando:
  // se pregunta si contestó; la tarea la completa App al retirar la acción.
  const llamadaDeFirmar = (antes: Task, despues: Task) =>
    despues.status === 'completada' && antes.status !== 'completada'
      ? (firmasEntries ?? []).find(f => f.nextActionTaskId === antes.id && esAccionDeLlamada(f.nextActionKind))
      : undefined;

  async function guardarLlamada(tarjeta: FirmasEntry, datos: DatosLlamada) {
    if (!onPatchFirmasEntry) return;
    try {
      const ahora = new Date().toISOString();
      await onPatchFirmasEntry(tarjeta.id, f => aplicarCierreLlamada(f, datos, currentProfile, ahora));
      // Segundo guardado: así la tarea de la llamada se completa antes de crear la del paso nuevo
      if (datos.contesto && datos.siguiente) {
        const s = datos.siguiente;
        await onPatchFirmasEntry(tarjeta.id, f => conSiguientePaso(f, s));
      }
      setLlamada(null);
      if (detailTask && tarjeta.nextActionTaskId === detailTask.id) setDetailTask(null);
      showToast(!datos.contesto ? 'Apuntado: no contestó' : datos.siguiente ? 'Llamada cerrada · siguiente paso programado' : 'Llamada cerrada', 'success');
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
    }
  }

  /** Guarda la tarea; si es de contacto y se está completando, antes pregunta qué pasó. true = guardada ya. */
  async function guardarTareaOPreguntar(antes: Task, despues: Task): Promise<boolean> {
    const tarjetaLlamada = llamadaDeFirmar(antes, despues);
    if (tarjetaLlamada) { setLlamada(tarjetaLlamada); return false; }
    // Tarea de una reunión del pipeline con evento: completarla es cerrar la reunión
    if (despues.status === 'completada' && antes.status !== 'completada') {
      const tarjetaReunion = (firmasEntries ?? []).find(f => f.nextActionTaskId === antes.id && f.nextActionEventoId);
      if (tarjetaReunion?.nextActionEventoId && eventos.some(e => e.id === tarjetaReunion.nextActionEventoId)) {
        abrirCierre(tarjetaReunion.nextActionEventoId); return false;
      }
    }
    if (pideRegistro(antes, despues)) { setRegistro(despues); return false; }
    if (pideInformeDatos(antes, despues)) { setInformeDatos(despues); return false; }
    if (guardarTarea) await Promise.resolve(guardarTarea(despues));
    return true;
  }

  async function completarRegistrando(task: Task, r: RegistroContacto | null) {
    try {
      if (guardarTarea) await Promise.resolve(guardarTarea(task));
      setRegistro(null);
      if (detailTask?.id === task.id) setDetailTask(null);
      if (!r) { showToast('Tarea hecha', 'success'); return; }
      const jugador = task.playerId && task.playerId !== 'general' ? players.find(p => p.id === task.playerId) : undefined;
      const e: EventoBorrador = {
        titulo: task.title,
        tipo: EVENTO_DE_TAREA[task.label!] ?? 'Nota general',
        fecha: hoyISO(),
        ambito: jugador ? 'mantenimiento' : task.scoutingPlayerId ? 'captacion' : 'general',
        playerIds: jugador ? [jugador.id] : [],
        scoutingPlayerId: jugador ? undefined : task.scoutingPlayerId,
        participantIds: [task.assigneeId || currentProfile.id],
        notas: [r.contesto === undefined ? '' : r.contesto ? 'Contestó' : 'No contestó', r.texto].filter(Boolean).join(' — ') || undefined,
        authorId: currentProfile.id,
      };
      const activityRef = await crearActividades(e);
      try {
        const creado = await createAgendaEvento({ ...e, activityRef });
        setEventos(prev => [creado, ...prev]);
        await apuntarEnPipeline(creado);
      } catch (err) {
        // Sin la tabla de eventos, el contacto con un jugador nuestro queda igualmente en su actividad
        if (!(esMigracionPendiente(err) && activityRef)) throw err;
      }
      setActsVersion(v => v + 1);
      showToast('Tarea hecha y registrada', 'success');
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
    }
  }

  async function guardarEvento(e: EventoBorrador) {
    const original = eventoModal?.original;
    try {
      if (e.partido && !original) {
        // Un «Partido» no es un evento suelto: es un partido de Captación, con sus scouts.
        // Mismo convenio que Captación → Partidos: el primer scout va también en
        // assignedTo, y el modo por defecto es vídeo.
        const scouts = e.participantIds
          .map(pid => profiles.find(p => p.id === pid)?.avatar)
          .filter((a): a is string => !!a);
        const viewMode = e.partido.viewMode ?? 'video';
        const partido = await createScoutingMatch({
          date: e.fecha, time: e.hora || undefined,
          homeTeam: e.partido.local, awayTeam: e.partido.visitante,
          competition: e.partido.competicion, assignedTo: scouts[0], viewMode,
          notes: e.notas, status: 'pendiente',
        });
        onAddScoutingMatch?.(partido);
        // El partido ya existe: si falla un scout no se pierde ni se deja el
        // formulario abierto (reintentar crearía el partido dos veces).
        let fallos = 0;
        for (const scout of scouts) {
          try { await onAddMatchScout?.(partido.id, scout, viewMode); } catch (err) { fallos++; console.error(err); }
        }
        setEventoModal(null);
        showToast(
          fallos > 0
            ? 'Partido creado, pero no se pudo asignar algún scout. Revísalo en Captación → Partidos.'
            : 'Partido creado (visible en Captación → Partidos)',
          fallos > 0 ? 'error' : 'success');
        return;
      }
      if (original) {
        await borrarActividades(original.activityRef);
        const activityRef = await crearActividades(e);
        const actualizado: AgendaEvento = { ...original, ...e, activityRef };
        await updateAgendaEvento(actualizado);
        setEventos(prev => prev.map(x => x.id === actualizado.id ? actualizado : x));
        await apuntarEnPipeline(actualizado, original);
        showToast('Evento actualizado', 'success');
      } else {
        const activityRef = await crearActividades(e);
        try {
          const creado = await createAgendaEvento({ ...e, activityRef });
          setEventos(prev => [creado, ...prev]);
          await apuntarEnPipeline(creado);
        } catch (err) {
          // Sin la tabla nueva, un evento con jugador sigue quedando en su actividad (como antes)
          if (!(esMigracionPendiente(err) && activityRef)) throw err;
        }
        showToast('Evento guardado', 'success');
      }
      setActsVersion(v => v + 1);
      setEventoModal(null);
    } catch (err) {
      showToast(
        esMigracionPendiente(err)
          ? (currentProfile.is_admin
            ? 'Falta ejecutar migration_agenda_eventos.sql: hasta entonces solo se pueden guardar eventos con jugador de Mantenimiento.'
            : 'De momento solo se pueden guardar eventos con un jugador de Mantenimiento.')
          : 'No se pudo guardar el evento. Inténtalo de nuevo.',
        'error');
    }
  }

  async function borrarEvento() {
    const original = eventoModal?.original;
    if (!original) return;
    try {
      await deleteAgendaEvento(original.id);
      await borrarActividades(original.activityRef);
      const tarjeta = tarjetaDe(original.scoutingPlayerId);
      if (tarjeta && onPatchFirmasEntry) {
        await onPatchFirmasEntry(tarjeta.id, f => ({ ...f, comments: f.comments.filter(c => c.id !== idApunte(original.id)) })).catch(console.error);
      }
      setEventos(prev => prev.filter(x => x.id !== original.id));
      setActsVersion(v => v + 1);
      setEventoModal(null);
      showToast('Evento eliminado', 'info');
    } catch {
      showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error');
    }
  }

  // ── Cerrar una reunión del pipeline: recap en el evento y en la tarjeta,
  // siguiente paso como próxima acción (que crea su tarea), estatus si cambia.
  function abrirCierre(eventoId: string) {
    const ev = eventos.find(x => x.id === eventoId);
    if (ev) { setEventoModal(null); setCierre(ev); }
  }
  async function guardarCierre(ev: AgendaEvento, datos: DatosCierre, participantIds: string[]) {
    const ahora = new Date().toISOString();
    const cerrado: AgendaEvento = { ...ev, participantIds, recap: datos.recap, cerradoAt: ahora, cerradoPor: currentProfile.id };
    try {
      await updateAgendaEvento(cerrado);
      setEventos(prev => prev.map(x => x.id === cerrado.id ? cerrado : x));
      const tarjeta = tarjetaDe(ev.scoutingPlayerId);
      if (tarjeta && onPatchFirmasEntry) {
        await onPatchFirmasEntry(tarjeta.id, f => aplicarCierreEnTarjeta(f, cerrado, datos, currentProfile, hoyISO(), ahora));
        // Segundo guardado: si la reunión era la próxima acción, su tarea se completa antes de crear la del paso nuevo
        if (datos.siguiente) {
          const s = datos.siguiente;
          await onPatchFirmasEntry(tarjeta.id, f => conSiguientePaso(f, s));
        }
      }
      setCierre(null);
      showToast(datos.siguiente ? 'Reunión cerrada · siguiente paso programado' : 'Reunión cerrada', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo cerrar la reunión. Inténtalo de nuevo.', 'error');
    }
  }
  const [managerFilter, setManagerFilter] = useState<string>("all");
  // Partner del jugador. Se recuerda entre pantallas: si estás revisando la
  // cartera de un partner, cambiar a Tareas y volver no debería perderlo.
  const [partnerFilter, setPartnerFilter] = useState<string>(
    () => sessionStorage.getItem('nav_partner_filter') ?? PARTNER_TODOS
  );
  // Estado del jugador. Arranca en «activo» a propósito: la cartera de
  // trabajo son los activos, y los inactivos y los de gestión partner solo
  // estorban en el día a día. Quien quiera verlos los pide.
  const [estadoFilter, setEstadoFilter] = useState<FiltroEstado>(
    () => (sessionStorage.getItem('nav_estado_filter') as FiltroEstado) ?? 'activo'
  );
  // quick filter from stat cards: overlays on top of the person filter
  const [quickFilter, setQuickFilter] = useState<"overdue" | "today" | "week" | "inprogress" | null>(null);
  // Mantenimiento / Captación. Se recuerda entre pantallas como el de persona.
  const [origenFilter, setOrigenFilter] = useState<'todas' | 'mantenimiento' | 'captacion'>(
    () => (sessionStorage.getItem('nav_origen_filter') as 'todas' | 'mantenimiento' | 'captacion') ?? 'todas'
  );
  const [showNotifications, setShowNotifications] = useState(false);
  // Person filter for the unified board: 'me' | 'all' | <profileId>
  const [personFilter, setPersonFilter] = useState<string>(
    () => sessionStorage.getItem('nav_person_filter') ?? 'me'
  );
  // Board grouping: estado (kanban/compacto/tabla) | jugador | persona
  const [groupBy, setGroupBy] = useState<'estado' | 'jugador' | 'persona'>(
    () => (sessionStorage.getItem('nav_group_by') as 'estado' | 'jugador' | 'persona') ?? 'estado'
  );
  // Tareas: mi lista (por defecto) o todas las tareas; y de quién es la lista
  const [vistaTareas, setVistaTareas] = useState<'lista' | 'tablero'>(
    () => sessionStorage.getItem('nav_tareas_vista') === 'tablero' ? 'tablero' : 'lista'
  );
  const [diaPersonaId, setDiaPersonaId] = useState(currentProfile.id);
  // Calendario: lunes (AAAA-MM-DD) de la semana visible
  const [calLunes, setCalLunes] = useState(() => fechaLocal(lunesDe(new Date())));
  const [weekOffset, setWeekOffset] = useState(0);
  // Activities per profile for the Equipo workload view (cached — week nav does NOT refetch)
  const [teamActivities, setTeamActivities] = useState<Record<string, PlayerActivity[]>>({});
  const [loadingTeamActivities, setLoadingTeamActivities] = useState(false);
  // Sin tarjetas: la lista compacta es la vista por defecto del tablero
  const [misViewMode, setMisViewMode] = useState<'compact' | 'table' | 'semana'>('compact');
  const [taskWeekOffset, setTaskWeekOffset] = useState(0); // vista semana de tareas: 0 = esta semana
  const [taskSortCol, setTaskSortCol] = useState<'title' | 'player' | 'priority' | 'dueDate' | 'status'>('dueDate');
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('asc');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  // «Atrás» del navegador cierra el panel de la tarea en vez de salir de Mantenimiento
  useAtras(!!detailTask, () => setDetailTask(null), 'tarea');
  // Apertura externa de una tarea (desde «Mi día»)
  useEffect(() => {
    if (!openTaskId) return;
    const t = tasks.find(x => x.id === openTaskId);
    if (t) { setInternalTab(null); setDetailTask(t); }
    onOpenTaskConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskId, tasks]);
  // Alta externa (botón «Tarea/evento» de Inicio)
  useEffect(() => {
    if (!abrirAlta) return;
    setTareaInicial({});
    setShowAddGeneralTask(true);
    onAbrirAltaConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirAlta]);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompletedMine, setShowCompletedMine] = useState(false);
  // Lista por defecto: con la cartera entera, las tarjetas obligan a hacer
  // scroll para ver a todo el mundo. La elección se recuerda, como el resto
  // de filtros de esta pantalla.
  const [playerView, setPlayerView] = useState<'grid' | 'list' | 'table'>(
    () => (sessionStorage.getItem('nav_player_view') as 'grid' | 'list' | 'table') ?? 'list'
  );
  const [quickTaskPlayer, setQuickTaskPlayer] = useState<Player | null>(null);

  // Jugadores advanced filters
  const [posFilters, setPosFilters] = useState<string[]>([]);
  const [yearFilters, setYearFilters] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState(false);
  const [prioFilters, setPrioFilters] = useState<string[]>([]);




  // App-level notification toasts (birthday / task alerts from the server)
  const [notifToasts, setNotifToasts] = useState<AppNotification[]>([]);
  useEffect(() => {
    if (notifications.length > 0 && notifications[0].ts > Date.now() - 1000) {
      const latest = notifications[0];
      setNotifToasts((prev) => [latest, ...prev].slice(0, 3));
      const timer = setTimeout(() => setNotifToasts((prev) => prev.filter((t) => t.id !== latest.id)), 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  // Persist board preferences so refresh restores position
  useEffect(() => { sessionStorage.setItem('nav_person_filter', personFilter) }, [personFilter]);
  useEffect(() => { sessionStorage.setItem('nav_origen_filter', origenFilter) }, [origenFilter]);
  useEffect(() => { sessionStorage.setItem('nav_partner_filter', partnerFilter) }, [partnerFilter]);
  useEffect(() => { sessionStorage.setItem('nav_estado_filter', estadoFilter) }, [estadoFilter]);
  useEffect(() => { sessionStorage.setItem('nav_player_view', playerView) }, [playerView]);
  useEffect(() => { sessionStorage.setItem('nav_group_by', groupBy) }, [groupBy]);
  useEffect(() => { sessionStorage.setItem('nav_tareas_vista', vistaTareas) }, [vistaTareas]);

  // Fetch activities for all profiles when the Equipo tab is active.
  // Loaded once and cached: navigating between weeks reuses the same data.
  useEffect(() => {
    if (activeTab !== 'equipo') return;
    if (Object.keys(teamActivities).length > 0) return; // already loaded
    setLoadingTeamActivities(true);
    Promise.all(
      profiles.map(p => fetchActivitiesByAuthor(p.id).then(acts => ({ id: p.id, acts })))
    ).then(results => {
      const byProfile: Record<string, PlayerActivity[]> = {};
      results.forEach(r => { byProfile[r.id] = r.acts; });
      setTeamActivities(byProfile);
    }).catch(() => {}).finally(() => setLoadingTeamActivities(false));
  }, [activeTab, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exclude intermediation-only players from mantenimiento
  const visiblePlayers = players.filter(p => !p.hiddenFromManagement)

  const pendingTasks = tasks.filter((t) => t.status !== "completada");

  // helper: does a profile "own" a task (assignee OR watcher)
  const involvesProfile = (t: Task, pid: string) =>
    t.assigneeId === pid || (t.watchers ?? []).includes(pid);

  // ── Unified board: one dataset filtered by personFilter ────
  // Glosario único: una tarea "es de" alguien si es responsable o watcher.
  const visibleTasks = tasks.filter(t => !(t.adminOnly && !currentProfile.is_admin));

  // Tareas abiertas por jugador, calculado una vez: antes cada tarjeta/fila
  // de jugador recorría todas las tareas con un filter.
  const openTasksByPlayer = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.status === 'completada') continue;
      const arr = m.get(t.playerId);
      if (arr) arr.push(t); else m.set(t.playerId, [t]);
    }
    return m;
  }, [tasks]);
  // Ids de tareas completadas, para contar postpartidos pendientes sin un find por cada uno
  const completedTaskIds = useMemo(
    () => new Set(tasks.filter(t => t.status === 'completada').map(t => t.id)),
    [tasks],
  );
  const boardPersonId = personFilter === 'me' ? currentProfile.id : personFilter;
  const matchesPerson = (t: Task) =>
    personFilter === 'all' || involvesProfile(t, boardPersonId);

  // ── Origen: Mantenimiento vs Captación ──────────────────────
  // «De Captación» = la tarea la generó una próxima acción de una tarjeta de
  // Firmar. Se sabe por el vínculo real (nextActionTaskId), no por el título
  // ni por el tipo: así sigue clasificada bien aunque la renombres o le
  // cambies el tipo desde el tablero.
  const idsTareasPipeline = useMemo(
    () => new Set((firmasEntries ?? []).map(f => f.nextActionTaskId).filter(Boolean) as string[]),
    [firmasEntries],
  );
  const matchesOrigen = (t: Task) =>
    origenFilter === 'todas' ||
    (origenFilter === 'captacion' ? idsTareasPipeline.has(t.id) : !idsTareasPipeline.has(t.id));

  const matchesBoard = (t: Task) => matchesPerson(t) && matchesOrigen(t);
  const boardTasks = visibleTasks.filter(t => t.status !== 'completada' && matchesBoard(t));
  // Las completadas hace más de 30 días se archivan solas: no salen en las listas
  const boardCompleted = visibleTasks.filter(t => t.status === 'completada' && matchesBoard(t) && !estaArchivada(t, hoyISO()));

  // Recuentos del selector: se calculan con el filtro de persona pero SIN el de
  // origen, para que los números no cambien según lo que tengas seleccionado
  const abiertasPersona = visibleTasks.filter(t => t.status !== 'completada' && matchesPerson(t));
  const nCaptacion = abiertasPersona.filter(t => idsTareasPipeline.has(t.id)).length;
  const nMantenimiento = abiertasPersona.length - nCaptacion;

  // ── Tasks stats + week nav ──────────────────────────────────
  // Fecha LOCAL, no UTC: con toISOString(), entre las 00:00 y las 2:00 de la
  // madrugada española "hoy" seguía siendo ayer y las tareas del día no se
  // marcaban como vencidas.
  const todayStr = hoyISO();
  // Week window (driven by weekOffset for the Equipo view)
  // Domingo con setDate, no sumando milisegundos: al cambiar el horario de
  // verano la semana tiene 167 o 169 horas y la suma en ms se comía un día.
  // Y a las 23:59:59.999, no a las 00:00: si no, lo que vence en domingo
  // (parseado a mediodía) quedaba fuera de «esta semana».
  const finDeSemana = (lunes: Date) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  };
  const weekMonday = lunesDe(new Date(), weekOffset);
  const weekSunday = finDeSemana(weekMonday);
  // For the "esta semana" stat in the board we always use offset=0
  const thisMonday = lunesDe(new Date());
  const thisSunday = finDeSemana(thisMonday);

  // ── Lista unificada (tareas + Firmar + postpartidos + partidos + eventos) ──
  // Partidos y eventos van por ventana de días: un partido pasado sin marcar
  // no es una tarea vencida, y hay miles en el histórico. «Mi día» mira de
  // hoy a 7 días; el calendario, la semana visible.
  const esAdmin = !!currentProfile.is_admin;
  const diaHasta = sumarDias(todayStr, 7);
  const calDomingo = sumarDias(calLunes, 6);
  const enCalendario = activeTab === 'calendario';
  const actsDia = useActividadesRango(todayStr, diaHasta, !enCalendario, actsVersion);
  const actsCal = useActividadesRango(calLunes, calDomingo, enCalendario, actsVersion);
  const agendaBase = useMemo(() => {
    const porId = new Map(scoutingPlayers.map(p => [p.id, p.fullName]));
    return {
      hoy: todayStr,
      tasks: tasks.filter(t => !(t.adminOnly && !esAdmin)),
      firmasEntries: firmasEntries ?? [],
      postpartidos, scoutingMatches, matchScouts, profiles, players, eventos, informesPartido, informesPedidos, ahoraHora,
      ultimaNotaTarea: ultimasNotas,
      // Los fines de contrato solo los ven los admins
      vencimientos: esAdmin,
      nombreScouting: (id: string) => porId.get(id),
    };
  }, [todayStr, tasks, esAdmin, firmasEntries, postpartidos, scoutingMatches, matchScouts, profiles, players, eventos, scoutingPlayers, informesPartido, informesPedidos, ahoraHora, ultimasNotas]);
  const agendaItems = useMemo(
    () => construirAgenda({ ...agendaBase, activities: actsDia, rango: { desde: todayStr, hasta: diaHasta } }),
    [agendaBase, actsDia, todayStr, diaHasta],
  );
  // Solo se calcula con el calendario abierto
  const agendaCal = useMemo(
    () => enCalendario
      ? construirAgenda({ ...agendaBase, activities: actsCal, rango: { desde: calLunes, hasta: calDomingo } })
      : [],
    [enCalendario, agendaBase, actsCal, calLunes, calDomingo],
  );
  // Partidos de hoy de todo el equipo, de la misma lista que el calendario.
  // Un partido con varios scouts es un item por scout: aquí se juntan.
  const partidosHoy = useMemo(() => {
    const porPartido = new Map<string, { item: AgendaItem; scouts: string[] }>();
    for (const it of agendaItems) {
      if (it.origen !== 'captacion' || it.fecha !== todayStr || !it.ref.matchId) continue;
      const g = porPartido.get(it.ref.matchId) ?? { item: it, scouts: [] };
      // ✓ = ese scout ya ha metido su informe
      g.scouts.push(`${profiles.find(p => p.id === it.personId)?.avatar ?? '?'}${it.conInforme ? '✓' : ''}`);
      porPartido.set(it.ref.matchId, g);
    }
    return [...porPartido.values()].sort((a, b) => (a.item.hora ?? '99').localeCompare(b.item.hora ?? '99'));
  }, [agendaItems, todayStr, profiles]);
  const diaPersona = profiles.find(p => p.id === diaPersonaId) ?? currentProfile;

  const boardOverdue = boardTasks.filter(t => t.dueDate && t.dueDate < todayStr);
  const boardDueToday = boardTasks.filter(t => t.dueDate === todayStr);
  const boardDueThisWeek = boardTasks.filter(t => {
    if (!t.dueDate) return false;
    const d = parseDia(t.dueDate);
    return d >= thisMonday && d <= thisSunday;
  });
  const boardInProgress = boardTasks.filter(t => t.status === 'en_progreso');

  // Birthdays
  const birthdaysToday = visiblePlayers.filter((p) => isBirthdayToday(p.birthDate));
  const birthdaysSoon = visiblePlayers.filter((p) => isBirthdaySoon(p.birthDate, 7));

  // ── Novedades de la app: visibles hasta descartarlas (por build) ──
  // Los cambios técnicos (adminItems) solo se le enseñan a los admin: al
  // resto del equipo no le dicen nada y ensucian la pantalla de inicio.
  const changelogItems = currentProfile.is_admin
    ? [...CHANGELOG[0].items, ...(CHANGELOG[0].adminItems ?? [])]
    : CHANGELOG[0].items;
  const [showChangelog, setShowChangelog] = useState<boolean>(() => {
    try { return BUILD_ID !== 'dev' && localStorage.getItem('ais_seen_build') !== BUILD_ID && changelogItems.length > 0 } catch { return false }
  });
  const [changelogOpen, setChangelogOpen] = useState(false);

  // ── Contratos de representación que expiran (≤6 meses, o vencidos hace <30 días) ──
  const [showRepContracts, setShowRepContracts] = useState(false);
  const repExpiring = players
    .map(p => ({ p, end: p.representationContract?.end }))
    .filter((x): x is { p: Player; end: string } => {
      if (!x.end) return false;
      const t = new Date(x.end).getTime();
      if (isNaN(t)) return false;
      const diff = t - Date.now();
      return diff > -30 * 86400000 && diff <= 180 * 86400000;
    })
    .sort((a, b) => a.end.localeCompare(b.end));
  // Descartable: se guarda qué lista se descartó, y solo vuelve a salir si
  // entra un contrato nuevo en la ventana (o cambia una fecha)
  const repClave = repExpiring.map(x => `${x.p.id}:${x.end}`).join('|');
  const [repDescartado, setRepDescartado] = useState<string>(() => {
    try { return localStorage.getItem('ais_rep_descartado') ?? '' } catch { return '' }
  });
  const repVisto = repClave.split('|').every(k => repDescartado.split('|').includes(k));

  // ── Estado del equipo: datos derivados ──
  const statusProfiles = profiles.filter(p => !p.hidden_from_status);
  const hiddenStatusProfiles = profiles.filter(p => p.hidden_from_status);
  // Nota libre de cada miembro («en Elche hasta el jueves»): sale en el día de hoy del calendario
  const notasEquipo = useMemo(
    () => Object.fromEntries(memberStatuses.filter(m => m.note).map(m => [m.profileId, m.note as string])),
    [memberStatuses],
  );
  async function guardarMiNota(texto: string) {
    if (!onUpdateMemberStatus) return;
    try {
      await onUpdateMemberStatus({ profileId: currentProfile.id, note: texto.trim() || undefined });
    } catch {
      showToast('No se pudo guardar la nota. Inténtalo de nuevo.', 'error');
    }
  }

  // Available options for multi-filters (derived from visible players)
  const positionOptions = POSITION_CODES;
  const yearOptions = Array.from(new Set(visiblePlayers.map(p => p.birthDate?.slice(0, 4)).filter(Boolean))).sort((a, b) => Number(b) - Number(a)) as string[];

  // El estado es el corte de fuera: primero decides qué cartera miras
  // (activos, por defecto) y dentro de ella van partner, encargado y el resto
  const porEstado = useMemo(
    () => visiblePlayers.filter(p => jugadorEsDeEstado(p, estadoFilter)),
    [visiblePlayers, estadoFilter],
  );
  // Los recuentos del filtro de estado se calculan sobre TODOS: así ves
  // cuántos inactivos hay aunque estés mirando solo los activos
  const nPorEstado = useMemo(() => contarPorEstado(visiblePlayers), [visiblePlayers]);

  const partnerOptions = useMemo(() => opcionesPartner(porEstado), [porEstado]);
  // Si el partner guardado ya no existe (se renombró, o se fue el último
  // jugador que lo tenía) el filtro se cae a «Todos» en vez de dejar la
  // lista vacía sin explicación
  const partnerActivo = partnerFilter !== PARTNER_TODOS && !partnerOptions.some(o => o.key === partnerFilter)
    ? PARTNER_TODOS
    : partnerFilter;

  const jugadoresDelPartner = useMemo(
    () => porEstado.filter(p => jugadorEsDePartner(p.partner, partnerActivo)),
    [porEstado, partnerActivo],
  );

  const filtered = porEstado.filter((p) => {
    const matchPartner = jugadorEsDePartner(p.partner, partnerActivo);
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.positions[0] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.clubs.some((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    const matchManager =
      managerFilter === "all" || p.managedBy.includes(managerFilter);
    const matchPos = posFilters.length === 0 || (p.positions[0] && posFilters.includes(p.positions[0]));
    const matchYear = yearFilters.length === 0 || (p.birthDate && yearFilters.includes(p.birthDate.slice(0, 4)));
    const matchActivity = !activityFilter || tasks.some(t => t.playerId === p.id && t.status !== "completada");
    const matchPrio = !esAdmin || jugadorEsDePrioridad(p.prioridad, prioFilters);
    return matchPartner && matchSearch && matchManager && matchPos && matchYear && matchActivity && matchPrio;
  });


  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const handleBulkDelete = () => {
    if (!onBulkDelete || selected.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    if (!onBulkDelete || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await onBulkDelete(Array.from(selected));
      setShowBulkDeleteConfirm(false);
      exitSelectMode();
      showToast("Jugadores eliminados", "info");
    } catch {
      setShowBulkDeleteConfirm(false);
      showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAssign = async (managerId: string) => {
    if (!onBulkAssignManager || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await onBulkAssignManager(Array.from(selected), managerId);
      setShowAssignModal(false);
      exitSelectMode();
      showToast("Manager asignado", "success");
    } catch {
      showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
    } finally {
      setBulkLoading(false);
    }
  };

  const cycleTaskStatus = async (task: Task) => {
    const next: Record<string, Task["status"]> = {
      "pendiente": "en_progreso",
      "en_progreso": "completada",
      "completada": "pendiente",
    };
    const updated = { ...task, status: next[task.status] ?? "pendiente" };
    try {
      await guardarTareaOPreguntar(task, updated);
    } catch {
      showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
    }
  };

  // ── Acciones sobre un item de la lista unificada ──
  // Cada origen se guarda en su sitio: la tarea en tasks, la acción de Firmar
  // en su tarjeta (que arrastra a su tarea), el partido en Captación.
  const guardarTarea = onUpdateTask ?? onUpdateGeneralTask;
  const tareaDeItem = (it: AgendaItem) => it.ref.taskId ? tasks.find(t => t.id === it.ref.taskId) : undefined;
  const fallo = () => showToast("No se pudo guardar. Inténtalo de nuevo.", "error");

  function agendaAbrir(it: AgendaItem) {
    const d = it.abrir;
    if (d.tipo === 'firmar') return onOpenFirmar?.(d.entryId);
    if (d.tipo === 'partido') return onOpenMatch?.(d.matchId);
    if (d.tipo === 'jugador') return onSelectPlayer(d.playerId);
    if (d.tipo === 'ofrecido') return onOpenOfrecido?.(d.ofrecimientoId);
    if (d.tipo === 'evento') {
      const ev = eventos.find(x => x.id === d.eventoId);
      if (!ev) return;
      // Un viaje abre sus sugerencias de visita; el resto, el formulario
      if (ev.tipo === 'Viaje') setViajeId(ev.id);
      else setEventoModal({ inicial: ev, original: ev });
      return;
    }
    const t = d.taskId ? tasks.find(x => x.id === d.taskId) : undefined;
    if (t) setDetailTask(t);
    else if (d.tipo === 'postpartido') setInternalTab('postpartidos');
  }

  async function agendaEstado(it: AgendaItem, estado: AgendaEstado) {
    try {
      if (it.origen === 'captacion') {
        if (!it.ref.matchId) return;
        await onSetMatchSeen?.(it.ref.matchId, it.ref.scout, estado === 'completada');
        // Visto sin informe: se pregunta por si se ha olvidado, sin crear ninguna tarea
        const scout = it.ref.scout ?? profiles.find(p => p.id === it.personId)?.avatar;
        if (estado === 'completada' && scout === currentProfile.avatar && !informesPartido?.has(`${it.ref.matchId}|${scout}`)) {
          const matchId = it.ref.matchId;
          showToast(`Visto. ¿Se te ha olvidado el informe de ${it.titulo}?`, 'info', { label: 'Escribirlo', fn: () => onOpenMatch?.(matchId) });
        }
        return;
      }
      const task = tareaDeItem(it);
      // Completar un postpartido sigue pidiendo el link del vídeo
      if (it.origen === 'postpartido' && estado === 'completada') {
        const pp = postpartidos.find(p => p.id === it.ref.postpartidoId);
        if (pp && task) { setPpVideoUrl(pp.videoUrl ?? ''); setPpCompleteTarget({ pp, task }); }
        return;
      }
      if (task) {
        // Si es la tarea de una acción de Firmar, App la marca hecha también allí
        if (!(await guardarTareaOPreguntar(task, { ...task, status: estado }))) return;
        // Completar es un gesto fácil de hacer sin querer (deslizar, un toque): se puede deshacer.
        // Solo en tareas normales: una acción de Firmar o una tarea que se repite ya han hecho más cosas.
        if (estado === 'completada' && it.origen === 'tarea' && !task.recurrence && guardarTarea) {
          showToast('Tarea hecha', 'success', {
            label: 'Deshacer',
            fn: () => { Promise.resolve(guardarTarea({ ...task, completedAt: undefined })).catch(fallo); },
          });
        }
        return;
      }
      // Acción de Firmar sin tarea vinculada: hecha = retirarla de la tarjeta, con su apunte
      if (it.origen === 'firmar' && it.ref.firmasEntryId && estado === 'completada') {
        const tarjeta = (firmasEntries ?? []).find(f => f.id === it.ref.firmasEntryId);
        // Una llamada o WhatsApp pregunta antes si contestó
        if (tarjeta && esAccionDeLlamada(tarjeta.nextActionKind)) { setLlamada(tarjeta); return; }
        // Una reunión con evento se cierra (recap + siguiente paso)
        if (tarjeta?.nextActionEventoId && eventos.some(e => e.id === tarjeta.nextActionEventoId)) { abrirCierre(tarjeta.nextActionEventoId); return; }
        await onPatchFirmasEntry?.(it.ref.firmasEntryId, e => ({
          ...e,
          nextAction: undefined, nextActionDate: undefined, nextActionAssignee: undefined, nextActionKind: undefined,
          comments: [...e.comments, {
            id: crypto.randomUUID(),
            text: `✓ Hecho: ${e.nextAction ?? 'próxima acción'}`,
            date: new Date().toISOString(),
            author: currentProfile.name,
            authorId: currentProfile.id,
            kind: (e.nextActionKind ?? 'nota') as NonNullable<FirmasEntry['comments'][number]['kind']>,
          }],
        }));
      }
    } catch { fallo(); }
  }

  // Alta rápida de «Mi día»: sin @persona, la tarea es de quien se está mirando
  async function crearTareaRapida(a: AltaRapida) {
    if (!onAddGeneralTask) return;
    try {
      await Promise.resolve(onAddGeneralTask({
        id: 't' + Date.now(),
        playerId: 'general',
        title: a.titulo,
        description: '',
        assigneeId: a.assigneeId ?? diaPersona.id,
        watchers: [],
        priority: a.prioridadAlta ? 'alta' : 'media',
        status: 'pendiente',
        label: a.label,
        // Desde «Mi día» lo normal es que sea para hoy; a la bandeja se manda desde la fila
        dueDate: a.dueDate ?? todayStr,
        createdAt: new Date().toISOString(),
        comments: [],
      }));
    } catch (err) { fallo(); throw err; }
  }

  async function agendaReprogramar(it: AgendaItem, fecha: string | undefined) {
    try {
      // En Firmar manda la tarjeta: al cambiarla, su tarea se mueve sola
      if (it.origen === 'firmar' && it.ref.firmasEntryId) {
        await onPatchFirmasEntry?.(it.ref.firmasEntryId, { nextActionDate: fecha });
        return;
      }
      const task = tareaDeItem(it);
      if (task && guardarTarea) await Promise.resolve(guardarTarea({ ...task, dueDate: fecha }));
    } catch { fallo(); }
  }

  async function agendaReasignar(it: AgendaItem, profileId: string) {
    try {
      if (it.origen === 'firmar' && it.ref.firmasEntryId) {
        await onPatchFirmasEntry?.(it.ref.firmasEntryId, { nextActionAssignee: profileId });
        return;
      }
      const task = tareaDeItem(it);
      if (task && guardarTarea) await Promise.resolve(guardarTarea({ ...task, assigneeId: profileId }));
      if (it.origen === 'postpartido') {
        const pp = postpartidos.find(p => p.id === it.ref.postpartidoId);
        if (pp && onUpdatePostpartido) await onUpdatePostpartido({ ...pp, assigneeId: profileId });
      }
    } catch { fallo(); }
  }

  const canBulkAction = (onBulkDelete || onBulkAssignManager) && currentProfile.is_admin;
  // Los avisos ya no ocupan la cabecera de la home: viven en la campana.
  const hayNovedades = showChangelog && !updateAvailable && changelogItems.length > 0;
  const hayContratos = repExpiring.length > 0 && !repVisto;
  // Cuántos bloques pinta el panel…
  const nAvisosPanel = Number(hayNovedades) + Number(hayContratos) + Number(partidosHoy.length > 0);
  // …y cuántos cuentan en el número rojo (lo de todos los días no: sería ruido)
  const unreadNotifs = notifications.length + Number(hayNovedades) + Number(hayContratos);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* App-level notification toasts (birthday / task alerts) */}
      {notifToasts.length > 0 && (
        <div className="fixed top-14 right-2 sm:right-4 z-50 flex flex-col gap-2 w-72 sm:w-80">
          {notifToasts.map((t) => (
            <div key={t.id} className={`rounded-lg shadow-lg border p-3 text-sm flex items-start gap-2 animate-[slideIn_0.3s_ease] ${
              t.type === 'task_done' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => setNotifToasts((p) => p.filter((x) => x.id !== t.id))} aria-label="Cerrar notificación" className="text-slate-500 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        {/* Top bar: logo + actions */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-11 sm:h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-white flex-shrink-0">
              <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
            </div>
            <span className="hidden sm:block font-black text-sm tracking-tight text-slate-900 uppercase">All Iron Sports</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2 min-w-0">
            {/* Global search */}
            <button
              onClick={() => onOpenSearch?.()}
              className="flex items-center gap-1.5 px-2 py-2 sm:py-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
              title="Buscar (⌘K)"
              aria-label="Buscar (⌘K)"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline text-xs text-slate-400 border border-slate-200 rounded px-1 py-px">⌘K</span>
            </button>
            {/* Notification bell */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 sm:p-1.5 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
              title="Notificaciones"
              aria-label="Notificaciones"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700">{currentProfile.name}</p>
            </div>
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: PRIMARY }}
            >{currentProfile.avatar}</div>
            {currentProfile.is_admin && onOverview && (
              <button onClick={onOverview} aria-label="Overview" className="p-2 sm:p-1.5 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0" title="Overview">
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {currentProfile.is_admin && onAdmin && (
              <button onClick={onAdmin} aria-label="Administración" className="p-2 sm:p-1.5 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0" title="Admin">
                <Users className="w-4 h-4" />
              </button>
            )}
            <button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión" className="text-slate-500 hover:text-slate-700 transition-colors p-2 sm:p-1.5 flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-level nav: Mantenimiento | Distribución | Captación → Tareas | Calendario | Jugadores | Equipo | Postpartidos */}
        {onViewChange && (
          <>
            {/* Level 1: main sections */}
            <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
              <button
                onClick={() => { setInternalTab(null); onViewChange('inicio'); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Inicio
              </button>
              {/* Mantenimiento — always active while Dashboard is mounted */}
              <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors">
                Mantenimiento
              </button>
              <button
                onClick={() => { setInternalTab(null); onViewChange('distribucion'); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Distribución
              </button>
              <button
                onClick={() => { setInternalTab(null); onViewChange('captacion'); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Captación
              </button>
              <button
                onClick={() => { setInternalTab(null); onViewChange('pipeline'); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <PenLine className="w-3.5 h-3.5" />
                Pipeline
              </button>
              <button
                onClick={() => { setInternalTab(null); onViewChange('boulema'); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <Inbox className="w-3.5 h-3.5" />
                Boulema
              </button>
            </div>

            {/* Level 2: Mantenimiento sub-tabs */}
            <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center bg-slate-50 border-t border-slate-100 overflow-x-auto scrollbar-none">
              {([
                { id: 'tareas'       as const, label: 'Tareas' },
                { id: 'calendario'   as const, label: 'Calendario' },
                { id: 'jugadores'    as const, label: 'Jugadores' },
                { id: 'equipo'       as const, label: 'Equipo' },
                { id: 'postpartidos' as const, label: 'Postpartidos' },
              ]).map(tab => {
                const isActive = activeTab === tab.id;
                const ppPending = tab.id === 'postpartidos'
                  ? postpartidos.filter(pp => !pp.taskId || !completedTaskIds.has(pp.taskId)).length
                  : 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (esTabInterna(tab.id)) {
                        setInternalTab(tab.id);
                      } else {
                        setInternalTab(null);
                        onViewChange(tab.id);
                      }
                    }}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {tab.label}
                    {ppPending > 0 && (
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full px-1.5 py-px">{ppPending}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </header>

      {/* Notifications dropdown */}
      {showNotifications && (
        <div className="fixed top-12 sm:top-14 right-2 sm:right-4 z-30 w-[calc(100vw-1rem)] sm:w-[28rem] max-h-[75vh] bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Notificaciones</span>
            <button onClick={() => setShowNotifications(false)} aria-label="Cerrar notificaciones" className="text-slate-500 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
          </div>
          {/* Avisos: lo que antes ocupaba la cabecera de la home (novedades, contratos, partidos de hoy) */}
          {nAvisosPanel > 0 && (
            <div className="p-2 space-y-2 border-b border-slate-100">
        {/* Novedades tras actualizar (descartable) */}
        {showChangelog && !updateAvailable && changelogItems.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <span className="text-sm flex-shrink-0">🆕</span>
              <button onClick={() => setChangelogOpen(v => !v)} className="flex-1 text-left">
                <span className="text-sm font-semibold text-violet-800">Novedades de la app</span>
                <span className="hidden sm:inline text-xs text-violet-600/70 ml-2">
                  {new Date(CHANGELOG[0].date).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} · {changelogItems.length} cambio{changelogItems.length !== 1 ? "s" : ""}
                </span>
              </button>
              <button onClick={() => setChangelogOpen(v => !v)} aria-label="Ver novedades" className="p-1 text-violet-600">
                <ChevronDown className={`w-4 h-4 transition-transform ${changelogOpen ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={() => {
                  try { localStorage.setItem("ais_seen_build", BUILD_ID) } catch { /* modo privado */ }
                  setShowChangelog(false);
                }}
                aria-label="Descartar novedades"
                className="p-1 text-violet-400 hover:text-violet-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {changelogOpen && (
              <ul className="border-t border-violet-200 px-4 py-2.5 space-y-1.5">
                {changelogItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <span className="text-violet-500 flex-shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Contratos de representación que expiran */}
        {repExpiring.length > 0 && !repVisto && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden relative">
            <button
              onClick={() => {
                try { localStorage.setItem('ais_rep_descartado', repClave) } catch { /* modo privado */ }
                setRepDescartado(repClave);
              }}
              aria-label="Descartar aviso"
              title="Descartar: vuelve a salir solo si entra otro contrato"
              className="absolute right-2 top-2.5 p-1 text-amber-500 hover:text-amber-700 z-[1]"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowRepContracts(v => !v)}
              className="w-full flex items-center gap-2 p-3 pr-10 text-left hover:bg-amber-100/50 transition-colors"
            >
              <span className="text-sm flex-shrink-0">📃</span>
              <span className="text-sm font-semibold text-amber-800">
                {repExpiring.length} contrato{repExpiring.length !== 1 ? "s" : ""} de representación en sus últimos 6 meses
              </span>
              <span className="hidden sm:inline text-xs text-amber-700/70 font-normal truncate">
                {repExpiring.slice(0, 3).map(x => x.p.name.split(" ")[0]).join(" · ")}{repExpiring.length > 3 ? " · …" : ""}
              </span>
              <ChevronDown className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${showRepContracts ? "rotate-180" : ""}`} />
            </button>
            {showRepContracts && (
              <div className="border-t border-amber-200 divide-y divide-amber-100">
                {repExpiring.map(({ p, end }) => {
                  const expired = new Date(end).getTime() < Date.now();
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPlayer(p.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-amber-100/40 transition-colors"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className={expired ? "text-red-600 font-semibold" : "text-slate-500"}>
                        {expired ? "venció" : "vence"} el {new Date(end).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="ml-auto text-[11px] text-amber-600 flex-shrink-0">Abrir ficha →</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Partidos de hoy con scout asignado (misma fuente que el calendario) */}
        {partidosHoy.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> {partidosHoy.length} partido{partidosHoy.length !== 1 ? 's' : ''} hoy
            </span>
            {partidosHoy.map(({ item, scouts }) => (
              <button
                key={item.ref.matchId}
                onClick={() => agendaAbrir(item)}
                title="Abrir el partido"
                className="text-[11px] text-emerald-900 hover:underline"
              >
                {item.hora && <span className="font-semibold tabular-nums">{item.hora} </span>}
                {item.titulo} <span className="font-mono font-bold text-emerald-700">{scouts.join(' ')}</span>
              </button>
            ))}
            <button onClick={() => { setInternalTab('calendario'); setShowNotifications(false); }} className="ml-auto text-[11px] text-emerald-700 hover:underline flex-shrink-0">Calendario →</button>
          </div>
        )}

            </div>
          )}
          {notifications.length === 0 ? (
            nAvisosPanel === 0 ? <div className="p-4 text-center text-xs text-slate-400">Sin notificaciones</div> : null
          ) : (
            notifications.slice(0, 20).map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.playerId) onSelectPlayer(n.playerId); setShowNotifications(false); }}
                className="w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-start gap-2"
              >
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.type === 'task_done' ? 'bg-emerald-500' : n.type === 'birthday' ? 'bg-amber-400' : n.type === 'negotiation' ? 'bg-violet-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {onDismissNotification && (
                  <button onClick={(e) => { e.stopPropagation(); onDismissNotification(n.id); }} aria-label="Descartar notificación" className="text-slate-400 hover:text-slate-600 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* El calendario usa todo el ancho de la pantalla: siete columnas en 1150px quedaban estrechas */}
      <main className={`${activeTab === 'calendario' ? 'max-w-[1900px]' : 'max-w-6xl'} mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-20 sm:pb-6`}>
        {/* Birthday alerts */}
        {(birthdaysToday.length > 0 || birthdaysSoon.length > 0) && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {birthdaysToday.length > 0 && (
              <div className="flex items-center gap-2 mb-1">
                <Cake className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">
                  ¡Hoy cumple años {birthdaysToday.map((p) => p.name).join(", ")}!
                </span>
              </div>
            )}
            {birthdaysSoon.length > 0 && (
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-amber-500 mt-0.5" />
                <span className="text-xs text-amber-700">
                  Próximos 7 días: {birthdaysSoon.map((p) => {
                    const birth = new Date(p.birthDate);
                    const dayMonth = `${birth.getDate()}/${birth.getMonth() + 1}`;
                    return `${p.name} (${dayMonth})`;
                  }).join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Versión nueva desplegada: recargar para actualizar */}
        {updateAvailable && (
          <div className="mb-4 flex items-center gap-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-lg px-4 py-3 shadow-sm">
            <span className="text-base flex-shrink-0">🚀</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Hay una versión nueva de la app</p>
              <p className="text-[11px] opacity-80">Actualiza para ver las últimas funciones y correcciones</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-lg bg-white text-blue-700 text-xs font-bold hover:bg-blue-50 transition-colors"
            >
              Actualizar ahora
            </button>
          </div>
        )}

        {/* Mi día en pequeño: lo de hoy (y lo vencido), solo en Equipo y Postpartidos */}
        {(activeTab === 'equipo' || activeTab === 'postpartidos') && (() => {
          const mio = seccionesDelDia(agendaItems.filter(it => itemEsDe(it, currentProfile.id)), todayStr);
          const deHoy = [...mio.hoy, ...mio.procesos, ...mio.agenda];
          if (deHoy.length === 0) return null;
          return (
            <div className="mb-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100">
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-slate-700">Mis tareas de hoy</span>
                <span className="text-[11px] text-slate-400">
                  {mio.hoy.length} para hoy{mio.vencidas.length > 0 && <span className="text-red-500 font-semibold"> · {mio.vencidas.length} con retraso</span>}{mio.procesos.length > 0 && <> · {mio.procesos.length} en curso</>}{mio.agenda.length > 0 && <> · {mio.agenda.length} en agenda</>}
                </span>
                <button onClick={() => { setVistaTareas('lista'); setDiaPersonaId(currentProfile.id); setInternalTab(null); onViewChange?.('tareas'); }}
                  className="ml-auto text-[11px] font-semibold text-blue-600 hover:underline">
                  Ver todo ({deHoy.length}) →
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {deHoy.slice(0, 5).map(it => (
                  <AgendaRow key={it.id} item={it} hoy={todayStr} profiles={profiles}
                    onAbrir={agendaAbrir} onEstado={agendaEstado} onReprogramar={agendaReprogramar} onReasignar={agendaReasignar}
                    onOpenPlayer={onSelectPlayer} onOpenScoutingPlayer={onOpenScoutingPlayer} onCerrarReunion={abrirCierre} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Tareas section ──────────────────────────────── */}
        {activeTab === 'tareas' && (<>

        {/* ── Cabecera: de quién es el día · vista · acciones ── */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 truncate">
              {vistaTareas === 'tablero' ? 'Todas las tareas'
                : diaPersona.id === currentProfile.id ? 'Mis tareas' : `Tareas de ${diaPersona.name.split(' ')[0]}`}
              <span className="font-normal text-slate-400"> · {tituloDia(todayStr)}</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Persona (solo admins): la misma pantalla con el día de otro */}
            {vistaTareas === 'lista' && esAdmin && profiles.length > 1 && (
              <select
                value={diaPersona.id}
                onChange={e => setDiaPersonaId(e.target.value)}
                aria-label="Ver el día de"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {profiles.map(p => <option key={p.id} value={p.id}>{p.id === currentProfile.id ? 'Yo' : p.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5">
              {([
                { id: 'lista' as const, label: 'Lista', Icono: LayoutList },
                { id: 'tablero' as const, label: 'Todas', Icono: Table },
              ]).map(v => (
                <button
                  key={v.id}
                  onClick={() => setVistaTareas(v.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                    vistaTareas === v.id ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <v.Icono className="w-3 h-3" /> {v.label}
                </button>
              ))}
            </div>
            {/* Una sola puerta: la ventana deja elegir arriba si es tarea o evento */}
            {onAddGeneralTask ? (
              <button
                onClick={() => { setTareaInicial({}); setShowAddGeneralTask(true); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary text-primary hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3 h-3" /> Tarea/evento
              </button>
            ) : (
              <button
                onClick={() => openAddEvent()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary text-primary hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3 h-3" /> Evento
              </button>
            )}
          </div>
        </div>

          {vistaTareas === 'lista' && (
            <MiDiaLista
              items={agendaItems}
              hoy={todayStr}
              personaId={diaPersona.id}
              esYo={diaPersona.id === currentProfile.id}
              profiles={profiles}
              onAbrir={agendaAbrir}
              onEstado={agendaEstado}
              onReprogramar={agendaReprogramar}
              onReasignar={agendaReasignar}
              onOpenPlayer={onSelectPlayer}
              onOpenScoutingPlayer={onOpenScoutingPlayer}
              onCerrarReunion={abrirCierre}
              onCrear={onAddGeneralTask ? crearTareaRapida : undefined}
              ahoraHora={ahoraHora}
              onActualizarProceso={onActualizarProceso}
            />
          )}


          {vistaTareas === 'tablero' && (<>
          {/* ── Estadísticas + filtro rápido de tareas ── */}
          <div className="flex border border-slate-200 rounded-lg bg-white overflow-hidden divide-x divide-slate-200 mb-3">
            <div className="flex-1 px-3 py-2">
              <div className={`text-lg font-bold leading-tight ${boardOverdue.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{boardOverdue.length}</div>
              <div className="text-[11px] text-slate-400">Vencidas</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className="text-lg font-bold leading-tight text-slate-800">{boardDueToday.length}</div>
              <div className="text-[11px] text-slate-400">Hoy</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className="text-lg font-bold leading-tight text-slate-800">{boardDueThisWeek.length}</div>
              <div className="text-[11px] text-slate-400">Esta semana</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className={`text-lg font-bold leading-tight ${boardInProgress.length > 0 ? 'text-blue-600' : 'text-slate-800'}`}>{boardInProgress.length}</div>
              <div className="text-[11px] text-slate-400">En progreso</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {/* Persona */}
            <select value={personFilter} onChange={e => { setPersonFilter(e.target.value); setQuickFilter(null); }} aria-label="Tareas de" className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="me">Mis tareas ({visibleTasks.filter(t => t.status !== 'completada' && involvesProfile(t, currentProfile.id)).length})</option>
              <option value="all">Todo el equipo ({pendingTasks.filter(t => !(t.adminOnly && !currentProfile.is_admin)).length})</option>
              {profiles.filter(p => p.id !== currentProfile.id).map(p => {
                const n = visibleTasks.filter(t => t.status !== 'completada' && involvesProfile(t, p.id)).length;
                return n === 0 && personFilter !== p.id ? null : <option key={p.id} value={p.id}>{p.name.split(' ')[0]} ({n})</option>;
              })}
            </select>
            {/* Origen: de dónde nace la tarea. Las de Captación son las próximas
                acciones del pipeline de Firmar; el resto, Mantenimiento. */}
            <select value={origenFilter} onChange={e => setOrigenFilter(e.target.value as typeof origenFilter)} aria-label="Origen" className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="todas">Mantenimiento y Captación ({abiertasPersona.length})</option>
              <option value="mantenimiento">Solo Mantenimiento ({nMantenimiento})</option>
              <option value="captacion">Solo Captación ({nCaptacion})</option>
            </select>
            <select
              value={quickFilter ?? 'none'}
              onChange={e => setQuickFilter(e.target.value === 'none' ? null : e.target.value as typeof quickFilter)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
            >
              <option value="none">Todas las tareas</option>
              <option value="overdue">Vencidas ({boardOverdue.length})</option>
              <option value="today">Hoy ({boardDueToday.length})</option>
              <option value="week">Esta semana ({boardDueThisWeek.length})</option>
              <option value="inprogress">En progreso ({boardInProgress.length})</option>
            </select>
          </div>

          {/* Unified board */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-slate-600 flex-1">
                {personFilter === 'me' ? 'Mis tareas'
                  : personFilter === 'all' ? 'Todas las tareas'
                  : `Tareas de ${profiles.find(p => p.id === personFilter)?.name.split(' ')[0] ?? ''}`}
                {origenFilter !== 'todas' && (
                  <span className="font-normal text-slate-400">
                    {origenFilter === 'captacion' ? ' · solo Captación' : ' · solo Mantenimiento'}
                  </span>
                )}
                {' '}<span className="font-normal text-slate-400">({boardTasks.length})</span>
              </p>
              {origenFilter !== 'todas' && (
                <button onClick={() => setOrigenFilter('todas')} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <X className="w-3 h-3" /> Ver todas
                </button>
              )}
              {quickFilter && (
                <button onClick={() => setQuickFilter(null)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpiar filtro
                </button>
              )}
              {/* Agrupar por: estado | jugador | persona */}
              <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5">
                {([
                  { id: 'estado' as const, label: 'Estado' },
                  { id: 'jugador' as const, label: 'Jugador' },
                  { id: 'persona' as const, label: 'Persona' },
                ]).map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGroupBy(g.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                      groupBy === g.id ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {groupBy === 'estado' && <ViewModeToggle mode={misViewMode} onChange={setMisViewMode} />}
            </div>
            {(() => {
              const filteredBoard = quickFilter === 'overdue'
                ? boardTasks.filter(t => t.dueDate && t.dueDate < todayStr)
                : quickFilter === 'today'
                  ? boardTasks.filter(t => t.dueDate === todayStr)
                  : quickFilter === 'week'
                    ? boardTasks.filter(t => {
                        if (!t.dueDate) return false;
                        const d = parseDia(t.dueDate);
                        return d >= thisMonday && d <= thisSunday;
                      })
                    : quickFilter === 'inprogress'
                      ? boardTasks.filter(t => t.status === 'en_progreso')
                      : boardTasks;

              // ── Agrupado por jugador o persona ──
              if (groupBy === 'jugador' || groupBy === 'persona') {
                type Group = { key: string; label: string; avatar?: string; gtasks: Task[] };
                const map = new Map<string, Task[]>();
                filteredBoard.forEach(t => {
                  const k = groupBy === 'jugador'
                    ? (t.playerId && t.playerId !== 'general' ? t.playerId : '__general__')
                    : (t.assigneeId || '__nadie__');
                  if (!map.has(k)) map.set(k, []);
                  map.get(k)!.push(t);
                });
                const groups: Group[] = Array.from(map.entries()).map(([k, gtasks]) => {
                  if (groupBy === 'jugador') {
                    const pl = players.find(p => p.id === k);
                    return { key: k, label: pl?.name ?? 'Generales (sin jugador)', gtasks };
                  }
                  const prof = profiles.find(p => p.id === k);
                  return { key: k, label: prof?.name ?? 'Sin asignar', avatar: prof?.avatar, gtasks };
                }).sort((a, b) => b.gtasks.length - a.gtasks.length);

                if (groups.length === 0) {
                  return <p className="text-center py-8 text-sm text-slate-400">✓ Sin tareas pendientes</p>;
                }
                return (
                  <div>
                    {groups.map(g => (
                      <div key={g.key} className="border-b border-slate-100 last:border-b-0">
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                          {groupBy === 'persona' && g.avatar && (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                              style={{ background: PRIMARY }}>{g.avatar}</span>
                          )}
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                          <span className="text-[11px] text-slate-400 ml-auto">{g.gtasks.length}</span>
                        </div>
                        <CompactTaskList
                          plano tasks={g.gtasks} completedTasks={[]}
                          players={players} profiles={profiles}
                          onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                          showCompleted={false} onToggleCompleted={() => {}}
                        />
                      </div>
                    ))}
                  </div>
                );
              }

              // ── Agrupado por estado (compacto / tabla / semana) ──
              if (misViewMode === 'semana') {
                // Lunes de la semana elegida
                const base = new Date();
                const day = (base.getDay() + 6) % 7; // 0 = lunes
                base.setDate(base.getDate() - day + taskWeekOffset * 7);
                const days = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(base); d.setDate(base.getDate() + i);
                  return fechaLocal(d);
                });
                const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
                const noDate = filteredBoard.filter(t => !t.dueDate);
                const before = filteredBoard.filter(t => t.dueDate && t.dueDate < days[0]);
                return (
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => setTaskWeekOffset(o => o - 1)} aria-label="Semana anterior" className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <span className="text-xs font-semibold text-slate-700">
                        {new Date(days[0]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – {new Date(days[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {taskWeekOffset === 0 && <span className="text-slate-400 font-normal"> · esta semana</span>}
                      </span>
                      {taskWeekOffset !== 0 && (
                        <button onClick={() => setTaskWeekOffset(0)} className="text-[11px] text-blue-600 hover:underline">hoy</button>
                      )}
                      <button onClick={() => setTaskWeekOffset(o => o + 1)} aria-label="Semana siguiente" className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"><ChevronRight className="w-3.5 h-3.5" /></button>
                      {before.length > 0 && taskWeekOffset === 0 && (
                        <span className="ml-auto text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{before.length} vencida{before.length !== 1 ? 's' : ''} anteriores</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
                      {days.map((d, i) => {
                        const dayTasks = filteredBoard.filter(t => t.dueDate === d);
                        const isToday = d === todayStr;
                        if (dayTasks.length === 0 && (i === 5 || i === 6)) return null; // finde vacío fuera (móvil lo agradece)
                        return (
                          <div key={d} className={`rounded-lg border p-1.5 min-h-[70px] ${isToday ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
                            <div className={`text-[10px] font-bold uppercase mb-1 ${isToday ? 'text-blue-700' : 'text-slate-400'}`}>
                              {DOW[i]} {new Date(d).getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayTasks.map(t => {
                                const assignee = profiles.find(pr => pr.id === t.assigneeId);
                                const tp = t.playerId !== 'general' ? players.find(x => x.id === t.playerId) : undefined;
                                return (
                                  <button
                                    key={t.id}
                                    onClick={() => setDetailTask(t)}
                                    className={`w-full text-left rounded-md border px-1.5 py-1 bg-white hover:border-slate-300 transition-colors ${t.priority === 'alta' ? 'border-red-200' : 'border-slate-200'}`}
                                  >
                                    <div className="text-[11px] font-medium text-slate-700 leading-tight line-clamp-2">{t.title}</div>
                                    <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-slate-400">
                                      {assignee && <span className="font-mono font-bold">{assignee.avatar}</span>}
                                      {tp && <span className="truncate">{tp.name.split(' ')[0]}</span>}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {noDate.length > 0 && (
                      <p className="mt-2 text-[11px] text-slate-400">{noDate.length} tarea{noDate.length !== 1 ? 's' : ''} sin fecha límite (visibles en las otras vistas)</p>
                    )}
                  </div>
                );
              }
              if (misViewMode === 'table') {
                return (
                  <TaskTableView
                    tasks={[...filteredBoard, ...boardCompleted]}
                    players={players} profiles={profiles}
                    onOpenDetail={setDetailTask} onCycleStatus={cycleTaskStatus} detailTaskId={detailTask?.id}
                    sortCol={taskSortCol} sortDir={taskSortDir}
                    onSort={(col) => { if (col === taskSortCol) setTaskSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setTaskSortCol(col); setTaskSortDir('asc'); } }}
                  />
                );
              }
                return (
                  <CompactTaskList
                    tasks={filteredBoard} completedTasks={boardCompleted}
                    players={players} profiles={profiles}
                    onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                  />
                );
            })()}
          </div>
          </>)}

        </>)}

        {/* ── Calendario semanal de toda la empresa ─────────── */}
        {activeTab === 'calendario' && (
          <CalendarioSemanal
            items={agendaCal}
            lunes={calLunes}
            onLunes={setCalLunes}
            hoy={todayStr}
            profiles={profiles}
            currentProfile={currentProfile}
            onAbrir={agendaAbrir}
            notas={notasEquipo}
            onGuardarMiNota={onUpdateMemberStatus ? guardarMiNota : undefined}
            onNuevo={(que, personId, fecha) => {
              if (que === 'viaje') return openAddEvent({ tipo: 'Viaje', fecha, participantIds: [personId] });
              // Tarea o evento: se abre como tarea y arriba se cambia a evento
              if (!onAddGeneralTask) return openAddEvent({ fecha, participantIds: [personId] });
              setTareaInicial({ assigneeId: personId, dueDate: fecha });
              setShowAddGeneralTask(true);
            }}
          />
        )}

        {/* ── Jugadores section ────────────────────────────── */}
        {activeTab === 'jugadores' && (<>

        {/* ── Estado y partner: desplegables ───────────────────
            Estado arranca en Activos (la cartera con la que se trabaja) y
            sus recuentos son sobre todos los jugadores. Partner cuenta
            dentro del estado elegido y solo sale si hay más de uno, o si
            hay un filtro puesto (uno que no se ve y esconde jugadores es
            peor que un desplegable de más). */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Estado
            <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value as FiltroEstado)} className="text-xs font-medium normal-case tracking-normal border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              {PLAYER_ESTADOS.map(e => <option key={e} value={e} title={ESTADO_META[e].ayuda}>{ESTADO_META[e].label} ({nPorEstado[e]})</option>)}
              <option value={ESTADO_TODOS}>Todos ({visiblePlayers.length})</option>
            </select>
          </label>
          {(partnerOptions.length > 1 || partnerActivo !== PARTNER_TODOS) && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              Partner
              <select value={partnerActivo} onChange={e => setPartnerFilter(e.target.value)} className="text-xs font-medium normal-case tracking-normal border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value={PARTNER_TODOS}>Todos ({porEstado.length})</option>
                {partnerOptions.map(o => <option key={o.key} value={o.key}>{o.label} ({o.count})</option>)}
              </select>
            </label>
          )}
        </div>

        {/* Players list header */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar jugador, club…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canBulkAction && !selectMode && (
                <button onClick={() => setSelectMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-md text-slate-600 bg-white border border-slate-200 text-sm font-medium px-3 py-2 hover:bg-slate-50 transition-colors">
                  <CheckSquare className="w-4 h-4" /><span className="hidden sm:inline">Seleccionar</span>
                </button>
              )}
              {selectMode && (
                <button onClick={exitSelectMode}
                  className="inline-flex items-center gap-1.5 rounded-md text-slate-600 bg-white border border-slate-200 text-sm font-medium px-3 py-2 hover:bg-slate-50 transition-colors">
                  <X className="w-4 h-4" /><span className="hidden sm:inline">Cancelar</span>
                </button>
              )}
              <button onClick={() => setShowAddPlayer(true)}
                aria-label="Nuevo jugador"
                className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 transition-colors flex-shrink-0 bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">Nuevo jugador</span>
              </button>
            </div>
          </div>

          {/* Manager filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={managerFilter}
              onChange={e => setManagerFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
            >
              {/* Los recuentos van dentro del partner elegido: si no, el
                  desplegable ofrecía encargados con 12 jugadores que al
                  seleccionarlos dejaban la lista vacía */}
              <option value="all">Todos ({jugadoresDelPartner.length})</option>
              {profiles.map((m) => {
                const count = jugadoresDelPartner.filter((p) => p.managedBy.includes(m.id)).length;
                if (count === 0) return null;
                return <option key={m.id} value={m.id}>{m.avatar} {m.name.split(" ")[0]} ({count})</option>;
              })}
            </select>
          </div>

          {/* Select-all row */}
          {selectMode && (
            <div className="flex items-center gap-3 px-1">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700">
                {selected.size === filtered.length && filtered.length > 0
                  ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                {selected.size === filtered.length && filtered.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
              {selected.size > 0 && <span className="text-xs text-slate-400">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>}
            </div>
          )}
        </div>

        {/* Advanced filters */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <MultiSelectFilter
            label="Posición"
            options={positionOptions}
            selected={posFilters}
            onChange={setPosFilters}
            optionLabel={positionLabel}
          />
          <MultiSelectFilter
            label="Año nacimiento"
            options={yearOptions}
            selected={yearFilters}
            onChange={setYearFilters}
          />
          {/* La prioridad solo la ven los admins (como el fin del contrato de representación) */}
          {esAdmin && (
            <MultiSelectFilter
              label="Prioridad"
              options={[...PLAYER_PRIORIDADES, SIN_PRIORIDAD]}
              selected={prioFilters}
              onChange={setPrioFilters}
              optionLabel={(v) => v === SIN_PRIORIDAD ? 'Sin prioridad' : `Prioridad ${v}`}
            />
          )}
          <FilterCheck label="Con actividad" checked={activityFilter} onClick={() => setActivityFilter(v => !v)} />
          {(posFilters.length > 0 || yearFilters.length > 0 || activityFilter || prioFilters.length > 0) && (
            <button
              onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false); setPrioFilters([]); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">{filtered.length} jugador{filtered.length !== 1 ? "es" : ""}</span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
            <button onClick={() => setPlayerView('grid')}
              className={`p-1.5 rounded transition-colors ${playerView === 'grid' ? "bg-white shadow-sm text-slate-700" : "text-slate-500 hover:text-slate-700"}`}
              title="Vista tarjetas" aria-label="Vista tarjetas">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlayerView('list')}
              className={`p-1.5 rounded transition-colors ${playerView === 'list' ? "bg-white shadow-sm text-slate-700" : "text-slate-500 hover:text-slate-700"}`}
              title="Vista lista" aria-label="Vista lista">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlayerView('table')}
              className={`p-1.5 rounded transition-colors ${playerView === 'table' ? "bg-white shadow-sm text-slate-700" : "text-slate-500 hover:text-slate-700"}`}
              title="Vista tabla" aria-label="Vista tabla">
              <Table className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── GRID VIEW ── */}
        {playerView === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((player) => {
              const playerTasks = openTasksByPlayer.get(player.id) ?? [];
              const urgent = playerTasks.filter((t) => t.priority === "alta");
              const age = calcAge(player.birthDate);
              const repEnd = new Date(player.representationContract.end).getTime();
              const repDaysLeft = Math.ceil((repEnd - Date.now()) / (1000*60*60*24));
              const repEndStr = player.representationContract.end ? new Date(player.representationContract.end).toLocaleDateString("es-ES", { month: "short", year: "numeric" }) : "—";
              const clubEnd = new Date(player.clubContract.endDate).getTime();
              const clubDaysLeft = Math.ceil((clubEnd - Date.now()) / (1000*60*60*24));
              const clubEndStr = player.clubContract.endDate ? new Date(player.clubContract.endDate).toLocaleDateString("es-ES", { month: "short", year: "numeric" }) : "—";
              const managers = player.managedBy.map((id) => profiles.find((m) => m.id === id)).filter(Boolean) as Profile[];
              const isSelected = selected.has(player.id);
              const isBday = isBirthdayToday(player.birthDate);

              return (
                <div
                  key={player.id}
                  className={`bg-white border rounded-xl p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md relative ${
                    isSelected ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id)}
                >
                  {selectMode && (
                    <div className="absolute top-3 right-3 z-10">
                      {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-slate-300" />}
                    </div>
                  )}
                  {isBday && <span className="absolute top-2 left-3 text-base">🎂</span>}

                  {/* Quick task button */}
                  {!selectMode && onAddGeneralTask && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setQuickTaskPlayer(player); }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors"
                      title="Nueva tarea rápida"
                      aria-label="Nueva tarea rápida"
                    >
                      <Zap className="w-3 h-3" />
                    </button>
                  )}

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate pr-8 flex items-center gap-2">
                    {esAdmin && <PrioridadBadge prioridad={player.prioridad} size="md" />}
                    <span className="truncate">{player.name}</span>
                  </h3>
                  {/* La chapa solo sale cuando NO es activo: si la llevaran
                      todos, dejaría de significar nada */}
                  {estadoDe(player) !== 'activo' && (
                    <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ESTADO_META[estadoDe(player)].chip}`}>
                      {ESTADO_META[estadoDe(player)].label}
                    </span>
                  )}
                  <p className="text-sm text-slate-500 truncate mt-0.5">
                    {player.positions[0]}{player.positions[1] ? ` / ${player.positions[1]}` : ''} · {clubsLabel(player.clubs)}
                  </p>
                  <p className="text-sm text-slate-400">{age} años · {player.nationality}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {currentProfile.is_admin && (
                      <div className={`rounded-lg px-2.5 py-1.5 ${repDaysLeft > 0 && repDaysLeft < 183 ? 'bg-red-50 border border-red-100' : repDaysLeft >= 183 && repDaysLeft < 365 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Repr.</p>
                        <p className={`text-xs font-semibold ${repDaysLeft > 0 && repDaysLeft < 183 ? 'text-red-600' : repDaysLeft >= 183 && repDaysLeft < 365 ? 'text-amber-600' : 'text-slate-700'}`}>{repEndStr}</p>
                      </div>
                    )}
                    <div className={`rounded-lg px-2.5 py-1.5 ${clubDaysLeft > 0 && clubDaysLeft < 183 ? 'bg-red-50 border border-red-100' : clubDaysLeft >= 183 && clubDaysLeft < 365 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide">Club</p>
                      <p className={`text-xs font-semibold ${clubDaysLeft > 0 && clubDaysLeft < 183 ? 'text-red-600' : clubDaysLeft >= 183 && clubDaysLeft < 365 ? 'text-amber-600' : 'text-slate-700'}`}>{clubEndStr}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {managers.map(m => (
                        <span key={m.id} className="w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: PRIMARY }}>{m.avatar}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {playerTasks.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {playerTasks.length} tarea{playerTasks.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {urgent.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                          {urgent.length} urg.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {playerView === 'list' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filtered.map((player, idx) => {
              const playerTasks = openTasksByPlayer.get(player.id) ?? [];
              const urgent = playerTasks.filter((t) => t.priority === "alta");
              const age = calcAge(player.birthDate);
              const clubDaysLeft = Math.ceil((new Date(player.clubContract.endDate).getTime() - Date.now()) / (1000*60*60*24));
              const repDaysLeft = Math.ceil((new Date(player.representationContract.end).getTime() - Date.now()) / (1000*60*60*24));
              const managers = player.managedBy.map((id) => profiles.find((m) => m.id === id)).filter(Boolean) as Profile[];
              const isSelected = selected.has(player.id);
              const isBday = isBirthdayToday(player.birthDate);

              return (
                <div
                  key={player.id}
                  onClick={() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id)}
                  className={`flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  } ${isSelected ? "bg-blue-50" : ""}`}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: PRIMARY }}>
                    {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isBday && <span className="text-sm">🎂</span>}
                      {esAdmin && <PrioridadBadge prioridad={player.prioridad} />}
                      <p className="text-sm font-semibold text-slate-800 truncate">{player.name}</p>
                      {estadoDe(player) !== 'activo' && (
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_META[estadoDe(player)].punto}`}
                          title={ESTADO_META[estadoDe(player)].label}
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {player.positions[0]} · {clubsLabel(player.clubs)} · {age}a · {player.nationality}
                    </p>
                  </div>

                  {/* Contracts (hidden on xs) */}
                  <div className="hidden sm:flex items-center gap-2">
                    {currentProfile.is_admin && (
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        repDaysLeft < 183 ? "bg-red-50 text-red-600" : repDaysLeft < 365 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-500"
                      }`}>R {player.representationContract.end ? new Date(player.representationContract.end).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : "—"}</span>
                    )}
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      clubDaysLeft < 183 ? "bg-red-50 text-red-600" : clubDaysLeft < 365 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-500"
                    }`}>C {player.clubContract.endDate ? new Date(player.clubContract.endDate).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : "—"}</span>
                  </div>

                  {/* Managers */}
                  <div className="hidden sm:flex items-center gap-0.5">
                    {managers.slice(0, 2).map(m => (
                      <span key={m.id} className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ background: PRIMARY }}>{m.avatar}</span>
                    ))}
                  </div>

                  {/* Task badges + quick task */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {urgent.length > 0 && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">{urgent.length}⚡</span>
                    )}
                    {playerTasks.length > 0 && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{playerTasks.length}</span>
                    )}
                    {!selectMode && onAddGeneralTask && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setQuickTaskPlayer(player); }}
                        className="w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors flex-shrink-0"
                        title="Nueva tarea rápida"
                        aria-label="Nueva tarea rápida"
                      >
                        <Zap className="w-3 h-3" />
                      </button>
                    )}
                    {selectMode && (
                      isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TABLE VIEW ── */}
        {playerView === 'table' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-semibold">Jugador</th>
                  {esAdmin && <th className="text-left px-3 py-2.5 font-semibold" title="Prioridad">Prio</th>}
                  <th className="text-left px-3 py-2.5 font-semibold">Posición</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Edad</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Nac.</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Club</th>
                  {currentProfile.is_admin && <th className="text-left px-3 py-2.5 font-semibold">Repr.</th>}
                  <th className="text-left px-3 py-2.5 font-semibold">Contrato</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Gestor</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Tareas</th>
                  {selectMode && <th className="px-3 py-2.5 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((player) => {
                  const playerTasks = openTasksByPlayer.get(player.id) ?? []
                  const urgent = playerTasks.filter(t => t.priority === 'alta')
                  const age = calcAge(player.birthDate)
                  const repEnd = player.representationContract.end
                  const repDaysLeft = repEnd ? Math.ceil((new Date(repEnd).getTime() - Date.now()) / (1000*60*60*24)) : Infinity
                  const repEndStr = repEnd ? new Date(repEnd).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) : '—'
                  const clubEnd = player.clubContract.endDate
                  const clubDaysLeft = clubEnd ? Math.ceil((new Date(clubEnd).getTime() - Date.now()) / (1000*60*60*24)) : Infinity
                  const clubEndStr = clubEnd ? new Date(clubEnd).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) : '—'
                  const managers = player.managedBy.map(id => profiles.find(m => m.id === id)).filter(Boolean) as Profile[]
                  const isSelected = selected.has(player.id)
                  const isBday = isBirthdayToday(player.birthDate)

                  return (
                    <tr
                      key={player.id}
                      onClick={() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id)}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: PRIMARY }}>
                            {player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              {isBday && <span className="text-xs">🎂</span>}
                              <span className="font-semibold text-slate-800 text-xs truncate">{player.name}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Prioridad */}
                      {esAdmin && <td className="px-3 py-2.5"><PrioridadBadge prioridad={player.prioridad} vacio /></td>}
                      {/* Position */}
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {player.positions[0]}{player.positions[1] ? <span className="text-slate-400"> / {player.positions[1]}</span> : ''}
                      </td>
                      {/* Age */}
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{age}a</td>
                      {/* Nationality */}
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{player.nationality || '—'}</td>
                      {/* Club */}
                      <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[140px] truncate">{clubsLabel(player.clubs)}</td>
                      {/* Repr contract */}
                      {currentProfile.is_admin && (
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            repDaysLeft < 183 ? 'bg-red-50 text-red-600' : repDaysLeft < 365 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                          }`}>{repEndStr}</span>
                        </td>
                      )}
                      {/* Club contract */}
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                          clubDaysLeft < 183 ? 'bg-red-50 text-red-600' : clubDaysLeft < 365 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                        }`}>{clubEndStr}</span>
                      </td>
                      {/* Managers */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {managers.map(m => (
                            <span key={m.id} className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white flex-shrink-0" style={{ background: PRIMARY }}>{m.avatar}</span>
                          ))}
                          {managers.length === 0 && <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
                      {/* Tasks */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {urgent.length > 0 && (
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">{urgent.length}⚡</span>
                          )}
                          {playerTasks.length > 0 && (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{playerTasks.length}</span>
                          )}
                        </div>
                      </td>
                      {/* Select checkbox */}
                      {selectMode && (
                        <td className="px-3 py-2.5">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <EmptyState
                icon={<Search className="w-8 h-8" />}
                title="No se encontraron jugadores"
                subtitle="Prueba con otro término de búsqueda o ajusta los filtros."
              />
            )}
          </div>
        )}

        {filtered.length === 0 && playerView !== 'table' && (
          <EmptyState
            icon={<Search className="w-8 h-8" />}
            title="No se encontraron jugadores"
            subtitle="Prueba con otro término de búsqueda o ajusta los filtros."
          />
        )}

        </>)}

        {/* ── Equipo section: carga y actividad por miembro ── */}
        {activeTab === 'equipo' && onSelectProfile && (<>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-800">Equipo</h2>
            <p className="text-xs text-slate-400 mt-0.5">Carga y actividad de cada miembro · clic en una fila para ver el detalle</p>
          </div>

          {/* Week navigator (cached: no refetch al navegar) */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                aria-label="Semana anterior"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  weekOffset === 0
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Esta semana
              </button>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                aria-label="Semana siguiente"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-medium text-slate-500">
              {weekMonday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              {' – '}
              {weekSunday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>

          {/* Resumen semanal automático: hechas / vencidas / creadas, con el cambio respecto a la semana anterior */}
          {(() => {
            const lunesStr = fechaLocal(weekMonday);
            const filas = statusProfiles
              .map(p => ({ p, r: resumenSemanal(visibleTasks, p.id, lunesStr, todayStr) }))
              .filter(({ r }) => r.hechas + r.vencidas + r.creadas + r.antes.hechas + r.antes.vencidas + r.antes.creadas > 0);
            if (filas.length === 0) return null;
            // sube = bueno en hechas, malo en vencidas, neutro en creadas
            const dato = (n: number, antes: number, bueno: 'sube' | 'baja' | null) => {
              const d = n - antes;
              const color = d === 0 || !bueno ? 'text-slate-400' : (d > 0) === (bueno === 'sube') ? 'text-emerald-600' : 'text-red-500';
              return (
                <td className="px-2 py-1.5 text-center tabular-nums">
                  <span className={`text-xs font-semibold ${n > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{n}</span>
                  <span className={`ml-1 text-[11px] ${color}`} title={`Semana anterior: ${antes}`}>{d === 0 ? '=' : d > 0 ? `▲${d}` : `▼${-d}`}</span>
                </td>
              );
            };
            const tot = filas.reduce((a, { r }) => ({ h: a.h + r.hechas, v: a.v + r.vencidas, c: a.c + r.creadas }), { h: 0, v: 0, c: 0 });
            return (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-slate-700">Resumen de la semana</p>
                  <p className="text-[11px] text-slate-400">{tot.h} hechas · {tot.v} vencidas · {tot.c} creadas · ▲▼ respecto a la semana anterior</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-1.5 font-semibold">Miembro</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Hechas</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Vencidas</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Creadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filas.map(({ p, r }) => (
                      <tr key={p.id} onClick={() => onSelectProfile(p.id)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-1.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: PRIMARY }}>{p.avatar}</span>
                            <span className="text-xs font-medium text-slate-700">{p.name.split(' ')[0]}</span>
                          </span>
                        </td>
                        {dato(r.hechas, r.antes.hechas, 'sube')}
                        {dato(r.vencidas, r.antes.vencidas, 'baja')}
                        {dato(r.creadas, r.antes.creadas, null)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Workload table */}
          {(() => {
            const weekMonStr = fechaLocal(weekMonday);
            const weekSunStr = fechaLocal(weekSunday);

            // Eventos deduplicados (los grupales comparten groupId)
            const dedupedEvents = (acts: PlayerActivity[]) => {
              const seen = new Set<string>();
              return acts.filter(a => {
                if (!a.groupId) return true;
                if (seen.has(a.groupId)) return false;
                seen.add(a.groupId);
                return true;
              });
            };

            const rows = statusProfiles.map(p => {
              // Carga abierta: pendiente + en progreso, con o sin fecha (asignado o watcher)
              const open = visibleTasks.filter(t => t.status !== 'completada' && involvesProfile(t, p.id));
              const openAsWatcher = open.filter(t => t.assigneeId !== p.id).length;
              const dueWeek = open.filter(t => t.dueDate && t.dueDate >= weekMonStr && t.dueDate <= weekSunStr);
              const overdue = open.filter(t => t.dueDate && t.dueDate < todayStr);
              const completedWeek = visibleTasks.filter(t =>
                t.status === 'completada' && t.assigneeId === p.id &&
                t.completedAt && t.completedAt.slice(0, 10) >= weekMonStr && t.completedAt.slice(0, 10) <= weekSunStr
              );
              const events = dedupedEvents(teamActivities[p.id] ?? []);
              const eventsWeek = events.filter(a => a.date >= weekMonStr && a.date <= weekSunStr);

              // Actividad 4 semanas (completadas + eventos), terminando en la semana visible
              const spark = [3, 2, 1, 0].map(i => {
                // setDate y no aritmética en ms: con el cambio de hora se desplazaba un día
                const ws = lunesDe(weekMonday, -i);
                const we = new Date(ws); we.setDate(we.getDate() + 6);
                const wsStr = fechaLocal(ws);
                const weStr = fechaLocal(we);
                const nDone = visibleTasks.filter(t =>
                  t.status === 'completada' && t.assigneeId === p.id &&
                  t.completedAt && t.completedAt.slice(0, 10) >= wsStr && t.completedAt.slice(0, 10) <= weStr
                ).length;
                const nEvt = events.filter(a => a.date >= wsStr && a.date <= weStr).length;
                return {
                  v: nDone + nEvt,
                  done: nDone,
                  evt: nEvt,
                  label: `Semana del ${ws.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
                };
              });

              return { p, open, openAsWatcher, dueWeek, overdue, completedWeek, eventsWeek, spark };
            }).sort((a, b) => b.open.length - a.open.length);

            // Escala común a todo el equipo: las barras son comparables entre filas
            const sparkGlobalMax = Math.max(1, ...rows.flatMap(r => r.spark.map(s => s.v)));

            const badge = (n: number, cls: string) =>
              n > 0
                ? <span className={`inline-block min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{n}</span>
                : <span className="text-slate-300 text-[11px]">—</span>;

            return (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-semibold">Miembro</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Carga abierta</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Esta semana</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Vencidas</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Completadas</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Eventos</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Actividad 4 sem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(({ p, open, openAsWatcher, dueWeek, overdue, completedWeek, eventsWeek, spark }) => {
                      const isMe = p.id === currentProfile.id;
                      const sparkTotal = spark.reduce((n, s) => n + s.v, 0);
                      const noActivity = open.length === 0 && completedWeek.length === 0 && eventsWeek.length === 0;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => onSelectProfile(p.id)}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                                style={{ background: PRIMARY }}>{p.avatar}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-800 truncate">
                                  {p.name}{isMe && <span className="ml-1.5 text-[10px] font-medium text-slate-400">(tú)</span>}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {noActivity ? 'Sin actividad' : openAsWatcher > 0 ? `${openAsWatcher} como watcher` : ' '}
                                </p>
                              </div>
                              {onToggleStatusHidden && (
                                <span
                                  onClick={e => {
                                    e.stopPropagation();
                                    onToggleStatusHidden(p.id, true).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'));
                                  }}
                                  title={`Ocultar a ${p.name.split(' ')[0]} de las vistas de equipo`}
                                  className="p-1 text-slate-500 hover:text-slate-500 cursor-pointer flex-shrink-0"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">{badge(open.length, 'bg-slate-100 text-slate-600')}</td>
                          <td className="px-2 py-2.5 text-center">{badge(dueWeek.length, 'bg-blue-50 text-blue-700')}</td>
                          <td className="px-2 py-2.5 text-center">
                            {overdue.length > 0
                              ? <span className="inline-flex items-center gap-1 min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
                                  <AlertTriangle className="w-3 h-3" />{overdue.length}
                                </span>
                              : <span className="text-slate-300 text-[11px]">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {completedWeek.length > 0
                              ? <span className="inline-block min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-600">✓ {completedWeek.length}</span>
                              : <span className="text-slate-300 text-[11px]">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {loadingTeamActivities
                              ? <span className="text-slate-300 text-[11px]">…</span>
                              : badge(eventsWeek.length, 'bg-amber-50 text-amber-600')}
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center justify-center gap-2">
                              <div className="flex items-end gap-1 h-6">
                                {spark.map((s, i) => (
                                  <span
                                    key={i}
                                    title={`${s.label}: ${s.v} (${s.done} tarea${s.done !== 1 ? 's' : ''} · ${s.evt} evento${s.evt !== 1 ? 's' : ''})`}
                                    className={`w-2 rounded-sm cursor-default transition-colors ${
                                      s.v === 0 ? 'bg-slate-100' : i === 3 ? 'bg-primary' : 'bg-slate-300 hover:bg-slate-400'
                                    }`}
                                    style={{ height: s.v === 0 ? '3px' : `${Math.max((s.v / sparkGlobalMax) * 22, 5)}px` }}
                                  />
                                ))}
                              </div>
                              <span className={`text-[11px] w-6 text-right tabular-nums flex-shrink-0 ${
                                sparkTotal > 0 ? 'font-semibold text-slate-600' : 'text-slate-300'
                              }`}>
                                {sparkTotal > 0 ? sparkTotal : '—'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Miembros ocultos (solo admins) — mismo flag que el panel de estado */}
          {onToggleStatusHidden && hiddenStatusProfiles.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap px-1">
              <EyeOff className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="text-[11px] text-slate-400">Ocultos:</span>
              {hiddenStatusProfiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => onToggleStatusHidden(p.id, false).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                  title="Volver a mostrar en las vistas de equipo"
                  className="text-[11px] bg-white border border-slate-200 hover:border-slate-400 rounded-full px-2 py-0.5 text-slate-500 transition-colors"
                >
                  {p.name.split(' ')[0]} · Mostrar
                </button>
              ))}
            </div>
          )}

          {/* Glosario de métricas */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-1 text-[11px] text-slate-400">
            <span><b className="font-semibold text-slate-500">Resumen de la semana</b> = tareas de las que es responsable: completadas y creadas en la semana visible, y vencidas al cierre de esa semana (hoy, si es la actual)</span>
            <span><b className="font-semibold text-slate-500">Carga abierta</b> = pendientes + en progreso, con o sin fecha (incl. watcher)</span>
            <span><b className="font-semibold text-slate-500">Esta semana</b> = abiertas con vencimiento en la semana visible</span>
            <span><b className="font-semibold text-slate-500">Completadas / Eventos</b> = en la semana visible</span>
            <span><b className="font-semibold text-slate-500">Actividad</b> = completadas + eventos por semana (4 últimas, barra azul = semana visible, número = total) · misma escala para todo el equipo · pasa el ratón por una barra para el detalle</span>
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400">No hay miembros del equipo</div>
          )}
        </>)}

        {/* ── Postpartidos section ──────────────────────────── */}
        {activeTab === 'postpartidos' && (() => {
          const rows = postpartidos.map(pp => ({
            pp,
            match: pp.matchId ? scoutingMatches.find(m => m.id === pp.matchId) : undefined,
            player: pp.playerId ? players.find(p => p.id === pp.playerId) : undefined,
            task: pp.taskId ? tasks.find(t => t.id === pp.taskId) : undefined,
            assignee: pp.assigneeId ? profiles.find(pr => pr.id === pp.assigneeId) : undefined,
          }));
          const pending = rows.filter(r => !r.task || r.task.status !== 'completada');
          const done = rows.filter(r => r.task && r.task.status === 'completada');
          const shown = ppShowDone ? [...pending, ...done] : pending;
          const statusBadge = (t?: Task) => {
            if (!t) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">sin tarea</span>;
            if (t.status === 'completada') return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Completado</span>;
            if (t.status === 'en_progreso') return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">En progreso</span>;
            return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Pendiente</span>;
          };
          return (<>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Postpartidos</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Informes postpartido pendientes · cada uno genera una tarea al responsable y queda ligado al jugador y al partido
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPpShowDone(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    ppShowDone ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                  }`}
                >
                  {ppShowDone ? 'Ocultar completados' : `Ver completados (${done.length})`}
                </button>
                {onCreatePostpartido && onAddGeneralTask && (
                  <button
                    onClick={openAddPostpartido}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Nuevo postpartido
                  </button>
                )}
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState
                icon={<Calendar className="w-10 h-10" />}
                title={pending.length === 0 && done.length > 0 ? 'Todo al día' : 'No hay postpartidos'}
                subtitle={pending.length === 0 && done.length > 0
                  ? `Los ${done.length} postpartidos están completados.`
                  : 'Crea el primero con "Nuevo postpartido".'}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
                {shown.map(({ pp, match, player, task, assignee }) => {
                  const isDone = task?.status === 'completada';
                  const isOverdue = !!(task?.dueDate && task.dueDate < todayStr && !isDone);
                  return (
                    <div key={pp.id} className={`flex items-center gap-3 px-4 py-3 ${isDone ? 'bg-emerald-50/60' : isOverdue ? 'bg-red-50/40' : ''}`}>
                      {/* Partido */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDone ? 'text-emerald-800' : 'text-slate-800'}`}>
                          {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Partido eliminado'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-slate-400">
                          {match && (
                            <span>{new Date(match.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                          )}
                          {match?.competition && <span>· {match.competition}</span>}
                          {pp.notes && <span className="italic truncate">· {pp.notes}</span>}
                          {pp.videoUrl && (
                            <a
                              href={pp.videoUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              <ExternalLink className="w-3 h-3" /> Ver vídeo
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Jugador */}
                      <button
                        onClick={() => { if (player) onSelectPlayer(player.id); }}
                        className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full ${
                          player
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer'
                            : 'bg-orange-50 text-orange-600 cursor-default'
                        }`}
                        title={player ? 'Ver ficha del jugador' : 'Jugador externo'}
                      >
                        {player?.name ?? pp.playerName ?? '—'}
                      </button>
                      {/* Responsable — nombre completo visible */}
                      <div className="flex-shrink-0 flex items-center gap-1.5" title={assignee?.name ?? 'Sin responsable'}>
                        <span
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: PRIMARY }}
                        >
                          {assignee?.avatar ?? '?'}
                        </span>
                        <span className="hidden sm:inline text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                          {assignee?.name ?? 'Sin responsable'}
                        </span>
                      </div>
                      {/* Estado + fecha */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {statusBadge(task)}
                        {task?.dueDate && !isDone && (
                          <span className={`text-[11px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                            {parseDia(task.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{isOverdue ? ' ⚠' : ''}
                          </span>
                        )}
                      </div>
                      {/* Acciones */}
                      {onUpdatePostpartido && (
                        <button
                          onClick={() => openEditPostpartido(pp, task)}
                          title="Editar (partido, jugador, responsable, fecha límite, notas)"
                          className="flex-shrink-0 p-1 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <PenLine className="w-4 h-4" />
                        </button>
                      )}
                      {task && !isDone && onUpdateTask && onUpdatePostpartido && (
                        <button
                          onClick={() => { setPpVideoUrl(pp.videoUrl ?? ''); setPpCompleteTarget({ pp, task }); }}
                          title="Completar (pide el link del vídeo)"
                          className="flex-shrink-0 p-1 rounded-full text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </button>
                      )}
                      {task && isDone && onUpdateTask && (
                        <button
                          onClick={async () => {
                            try {
                              await Promise.resolve(onUpdateTask({ ...task, status: 'pendiente' }));
                              showToast('Postpartido reabierto (vuelve a pendiente)', 'info');
                            } catch {
                              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
                            }
                          }}
                          title="Desmarcar (volver a pendiente)"
                          className="flex-shrink-0 p-1 rounded-full text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {onDeletePostpartido && (
                        <button
                          onClick={() => setPpDeleteConfirm(pp)}
                          title="Eliminar postpartido (y su tarea)"
                          className="flex-shrink-0 p-1 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>);
        })()}
      </main>

      {/* Bulk action toolbar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg bottom-[var(--nav-h)]">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              {onBulkAssignManager && (
                <button onClick={() => setShowAssignModal(true)} disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 disabled:opacity-40 transition-colors bg-primary hover:bg-primary/90">
                  <UserPlus className="w-4 h-4" /><span>Asignar manager</span>
                </button>
              )}
              {onBulkDelete && (
                <button onClick={handleBulkDelete} disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors">
                  <Trash2 className="w-4 h-4" /><span>{bulkLoading ? "Borrando…" : "Borrar"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddPlayer && (
        <AddPlayerModal profiles={profiles} onClose={() => setShowAddPlayer(false)}
          onAdd={async (p) => {
            try {
              await Promise.resolve(onAddPlayer(p));
              setShowAddPlayer(false);
              showToast(`Jugador ${p.name} añadido`, "success");
            } catch {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
            }
          }} />
      )}

      {/* Confirmación de borrado masivo */}
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title={`¿Eliminar ${selected.size} jugador${selected.size > 1 ? "es" : ""}?`}
        message="No se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {showAssignModal && (
        <AssignManagerModal profiles={profiles} count={selected.size} loading={bulkLoading}
          onClose={() => setShowAssignModal(false)} onAssign={handleBulkAssign} />
      )}

      {showAddGeneralTask && onAddGeneralTask && (
        <TareaModal
          profiles={profiles} players={players} scoutingPlayers={scoutingPlayers} currentProfileId={currentProfile.id}
          inicial={tareaInicial}
          estatusPipeline={(id) => tarjetaDe(id)?.status}
          // Tarea y evento comparten ventana: arriba se elige cuál es
          cabecera={<TipoNuevo valor="tarea" onCambiar={() => {
            setShowAddGeneralTask(false);
            openAddEvent({ fecha: tareaInicial.dueDate || hoyISO(), participantIds: [tareaInicial.assigneeId ?? currentProfile.id] });
          }} />}
          onClose={() => setShowAddGeneralTask(false)}
          onAdd={async (t) => {
            try {
              await Promise.resolve(onAddGeneralTask(t));
              setShowAddGeneralTask(false);
              showToast("Tarea creada", "success");
              // Tarea de un jugador de Captación que está en el pipeline: queda apuntada en su tarjeta
              const tarjeta = tarjetaDe(t.scoutingPlayerId);
              if (tarjeta && onPatchFirmasEntry) {
                const para = profiles.find(pr => pr.id === t.assigneeId)?.name.split(' ')[0];
                onPatchFirmasEntry(tarjeta.id, f => ({
                  ...f,
                  comments: [...f.comments, {
                    id: crypto.randomUUID(),
                    text: [`📌 Tarea: ${t.title}`, para ? `para ${para}` : undefined,
                      t.dueDate ? `el ${parseDia(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : undefined].filter(Boolean).join(' · '),
                    date: new Date().toISOString(),
                    author: currentProfile.name,
                    authorId: currentProfile.id,
                    kind: 'nota' as const,
                  }],
                })).catch(err => console.error('No se pudo apuntar la tarea en la tarjeta de Firmar:', err));
              }
            } catch {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
            }
          }} />
      )}

      {quickTaskPlayer && onAddGeneralTask && (
        <QuickTaskModal
          player={quickTaskPlayer}
          profiles={profiles}
          currentProfileId={currentProfile.id}
          onClose={() => setQuickTaskPlayer(null)}
          onAdd={async (t) => {
            try {
              await Promise.resolve(onAddGeneralTask(t));
              setQuickTaskPlayer(null);
              showToast("Tarea creada", "success");
            } catch {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
            }
          }}
        />
      )}


      {/* ── Tarea de contacto completada: ¿qué pasó? ── */}
      {registro && (
        <RegistroContactoModal
          task={registro}
          conQuien={registro.playerId && registro.playerId !== 'general'
            ? players.find(p => p.id === registro.playerId)?.name
            : registro.scoutingPlayerId ? scoutingPlayers.find(p => p.id === registro.scoutingPlayerId)?.fullName : undefined}
          onRegistrar={(r) => completarRegistrando(registro, r)}
          onSoloCompletar={() => completarRegistrando(registro, null)}
          onClose={() => setRegistro(null)}
        />
      )}

      {/* ── Tarea «Informe» de un jugador completada: ¿informe de datos enviado? ── */}
      {informeDatos && (
        <InformeDatosModal
          task={informeDatos}
          jugador={jugadorDe(informeDatos)?.name ?? 'el jugador'}
          onRegistrar={(r) => completarInforme(informeDatos, r)}
          onSoloCompletar={() => completarInforme(informeDatos, null)}
          onClose={() => setInformeDatos(null)}
        />
      )}

      {/* ── Viaje: a quién visitar ── */}
      {(() => {
        const viaje = viajeId ? eventos.find(x => x.id === viajeId) : undefined;
        if (!viaje) return null;
        return (
          <ViajeModal
            viaje={viaje}
            hoy={todayStr}
            firmasEntries={firmasEntries ?? []}
            scoutingPlayers={scoutingPlayers}
            eventos={eventos}
            profiles={profiles}
            onClose={() => setViajeId(null)}
            onEditar={() => { setViajeId(null); setEventoModal({ inicial: viaje, original: viaje }); }}
            onAbrirTarjeta={(id) => onOpenFirmar?.(id)}
            onCrearVisita={(tarjeta, dia) => crearVisitaDeViaje(viaje, tarjeta, dia)}
          />
        );
      })()}

      {/* ── Evento: alta y edición ── */}
      {eventoModal && (
        <EventoModal
          key={eventoModal.original?.id ?? 'nuevo'}
          players={players}
          scoutingPlayers={scoutingPlayers}
          profiles={profiles}
          currentProfile={currentProfile}
          inicial={eventoModal.inicial}
          editando={!!eventoModal.original}
          onClose={() => setEventoModal(null)}
          onSave={guardarEvento}
          onDelete={eventoModal.original ? borrarEvento : undefined}
          estatusPipeline={(id) => tarjetaDe(id)?.status}
          onCerrarReunion={eventoModal.original && esReunionCerrable(eventoModal.original) && !eventoModal.original.cerradoAt
            ? () => abrirCierre(eventoModal.original!.id) : undefined}
          cierre={eventoModal.original?.cerradoAt
            ? { recap: eventoModal.original.recap, cerradoAt: eventoModal.original.cerradoAt, por: profiles.find(p => p.id === eventoModal.original?.cerradoPor)?.name.split(' ')[0] }
            : undefined}
          cabecera={!eventoModal.original && onAddGeneralTask ? (
            <TipoNuevo valor="evento" onCambiar={() => {
              setTareaInicial({ assigneeId: eventoModal.inicial.participantIds?.[0], dueDate: eventoModal.inicial.fecha });
              setEventoModal(null);
              setShowAddGeneralTask(true);
            }} />
          ) : undefined}
        />
      )}

      {llamada && (
        <CerrarLlamadaModal
          tarjeta={(firmasEntries ?? []).find(f => f.id === llamada.id) ?? llamada}
          profiles={profiles}
          currentProfile={currentProfile}
          onClose={() => setLlamada(null)}
          onGuardar={(datos) => guardarLlamada(llamada, datos)}
        />
      )}

      {cierre && (
        <CerrarReunionModal
          evento={cierre}
          tarjeta={tarjetaDe(cierre.scoutingPlayerId)}
          playerName={(cierre.scoutingPlayerId && scoutingPlayers.find(p => p.id === cierre.scoutingPlayerId)?.fullName) || cierre.titulo || cierre.tipo}
          profiles={profiles}
          currentProfile={currentProfile}
          onClose={() => setCierre(null)}
          onGuardar={(datos, _nueva, participantIds) => guardarCierre(cierre, datos, participantIds)}
        />
      )}

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          player={players.find((p) => p.id === detailTask.playerId)}
          players={players}
          profiles={profiles}
          currentProfile={currentProfile}
          onGoToPlayer={onSelectPlayer}
          onComment={comentarioAFirmar}
          firmar={(() => {
            const entry = (firmasEntries ?? []).find(f => f.nextActionTaskId === detailTask.id);
            // La tarjeta se abre flotante; el panel de la tarea se cierra para que no la tape
            return entry ? { entry, onAbrir: () => { setDetailTask(null); onOpenFirmar?.(entry.id); } } : undefined;
          })()}
          onClose={() => setDetailTask(null)}
          onUpdate={async (updated) => {
            try {
              // Un único handler: ambos props apuntan al mismo updater en App;
              // llamar a los dos provocaba una doble escritura en la BD.
              await guardarTareaOPreguntar(detailTask, updated);
            } catch {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
            }
          }}
          onSaveAndClose={async (updated) => {
            try {
              const update = onUpdateTask ?? onUpdateGeneralTask;
              if (update) await Promise.resolve(update(updated));
              setDetailTask(null);
              showToast("Tarea actualizada", "success");
            } catch (err) {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
              throw err; // el panel mantiene su estado y muestra el error inline
            }
          }}
          onDelete={async (taskId) => {
            try {
              if (onDeleteGeneralTask) await Promise.resolve(onDeleteGeneralTask(taskId));
              setDetailTask(null);
              showToast("Tarea eliminada", "info");
            } catch (err) {
              showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
              throw err;
            }
          }}
        />
      )}

      {/* ── Modal Nuevo / Editar postpartido ── */}
      {showAddPostpartido && (ppEditing ? !!onUpdatePostpartido : !!(onCreatePostpartido && onAddGeneralTask)) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddPostpartido(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{ppEditing ? 'Editar postpartido' : 'Nuevo postpartido'}</h3>
              <button onClick={() => setShowAddPostpartido(false)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Partido */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">⚽ Partido</label>
                <select
                  value={ppMatchId}
                  onChange={e => setPpMatchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  <option value="">— Elige un partido —</option>
                  {[...scoutingMatches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map(m => (
                    <option key={m.id} value={m.id}>
                      {new Date(m.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {m.homeTeam} vs {m.awayTeam}{m.competition ? ` (${m.competition})` : ''}
                    </option>
                  ))}
                </select>
                {!ppNewMatchOpen ? (
                  <button
                    onClick={() => setPpNewMatchOpen(true)}
                    className="mt-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    + El partido no está — añadirlo nuevo
                  </button>
                ) : (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                    <p className="text-[10px] text-slate-400">Se añadirá también a Captación → Partidos.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={ppNewMatch.date} onChange={e => setPpNewMatch(f => ({ ...f, date: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                      <input placeholder="Competición (opc.)" value={ppNewMatch.competition} onChange={e => setPpNewMatch(f => ({ ...f, competition: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Local" value={ppNewMatch.home} onChange={e => setPpNewMatch(f => ({ ...f, home: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                      <input placeholder="Visitante" value={ppNewMatch.away} onChange={e => setPpNewMatch(f => ({ ...f, away: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setPpNewMatchOpen(false)} className="px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Cancelar</button>
                      <button
                        onClick={createMatchInline}
                        disabled={ppCreatingMatch}
                        className="px-3 py-1.5 text-[11px] font-bold text-white bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {ppCreatingMatch ? 'Creando…' : 'Crear partido'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* Jugador */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">👤 Jugador</label>
                <select
                  value={ppPlayerId}
                  onChange={e => setPpPlayerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  <option value="">— Elige un jugador —</option>
                  {players.filter(p => !p.hiddenFromManagement || p.id === ppEditing?.playerId).sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="__otro__">Otro (texto libre)…</option>
                </select>
                {ppPlayerId === '__otro__' && (
                  <input
                    autoFocus
                    value={ppPlayerName}
                    onChange={e => setPpPlayerName(e.target.value)}
                    placeholder="Nombre del jugador"
                    className="mt-2 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                )}
              </div>
              {/* Responsable */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">✍️ Responsable {ppEditing ? '(la tarea pasa a esta persona)' : '(le aparece como tarea)'}</label>
                <select
                  value={ppAssigneeId}
                  onChange={e => setPpAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.avatar} {p.name.split(' ')[0]}</option>
                  ))}
                </select>
              </div>
              {/* Fecha límite + notas */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">📅 Fecha límite {ppEditing ? '' : '(opc.)'}</label>
                  <input type="date" value={ppDue} onChange={e => setPpDue(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">💬 Notas (opc.)</label>
                  <input value={ppNotes} onChange={e => setPpNotes(e.target.value)} placeholder="Ej. «Centrarse en fase defensiva»"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <button onClick={() => setShowAddPostpartido(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700 rounded-lg">Cancelar</button>
              <button
                onClick={ppEditing ? saveEditPostpartido : createPostpartido}
                disabled={ppSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
              >
                {ppEditing ? (ppSaving ? 'Guardando…' : 'Guardar cambios') : (ppSaving ? 'Creando…' : 'Crear postpartido')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completar postpartido — exige link del vídeo */}
      {ppCompleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPpCompleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Completar postpartido</h3>
              <button onClick={() => setPpCompleteTarget(null)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">🎬 Link del vídeo (obligatorio)</label>
              <input
                autoFocus
                value={ppVideoUrl}
                onChange={e => setPpVideoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') completePostpartido(); }}
                placeholder="https://streamable.com/…"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-[11px] text-slate-400">El link quedará visible en la lista y en la ficha del jugador (Rendimiento → Postpartidos).</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <button onClick={() => setPpCompleteTarget(null)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700 rounded-lg">Cancelar</button>
              <button
                onClick={completePostpartido}
                disabled={ppCompleting || !ppVideoUrl.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {ppCompleting ? 'Guardando…' : '✓ Completar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de borrado de postpartido */}
      <ConfirmModal
        open={!!ppDeleteConfirm}
        title="¿Eliminar este postpartido?"
        message="Se eliminará también la tarea asociada del tablero. No se puede deshacer."
        confirmLabel={ppDeleting ? 'Eliminando…' : 'Eliminar'}
        variant="danger"
        onConfirm={async () => {
          if (!ppDeleteConfirm || !onDeletePostpartido || ppDeleting) return;
          setPpDeleting(true);
          try {
            await onDeletePostpartido(ppDeleteConfirm);
            showToast('Postpartido eliminado', 'info');
          } catch {
            showToast('No se pudo eliminar. Inténtalo de nuevo.', 'error');
          } finally {
            setPpDeleting(false);
            setPpDeleteConfirm(null);
          }
        }}
        onCancel={() => setPpDeleteConfirm(null)}
      />

      {/* ── Editor "Mi estado" ── */}

    </div>
  );
}

/* ── FilterCheck: toggle aséptico, sin fondo de color ── */
function FilterCheck({ label, checked, onClick }: { label: React.ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors text-slate-600"
    >
      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      {label}
    </button>
  )
}

/* ── MultiSelectFilter: dropdown checkbox filter ── */
function MultiSelectFilter({ label, options, selected, onChange, optionLabel }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  optionLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const isActive = selected.length > 0;
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm rounded-lg border transition-colors ${
          isActive
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <span>{label}{isActive ? ` (${selected.length})` : ''}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1 max-h-60 overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded"
                />
                <span className="text-sm text-slate-700">{optionLabel ? optionLabel(opt) : opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── ViewModeToggle: compact / table / semana switcher ── */
function ViewModeToggle({ mode, onChange }: {
  mode: 'compact' | 'table' | 'semana';
  onChange: (m: 'compact' | 'table' | 'semana') => void;
}) {
  const options = [
    { m: 'compact' as const, Icon: LayoutList, label: 'Compacto' },
    { m: 'table' as const, Icon: Table, label: 'Tabla' },
    { m: 'semana' as const, Icon: Calendar, label: 'Semana' },
  ];
  return (
    <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
      {options.map(({ m, Icon, label }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          title={label}
          aria-label={`Vista ${label}`}
          className={`p-1.5 rounded transition-colors ${mode === m ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

/* ── CompactTaskList: dense list view grouped by status ── */
function CompactTaskList({ tasks, completedTasks, players, profiles, onCycleStatus, onOpenDetail, detailTaskId, showCompleted, onToggleCompleted, plano = false }: {
  /** Solo las filas, sin cabeceras por estado (para los grupos por jugador o persona) */
  plano?: boolean;
  tasks: Task[];
  completedTasks: Task[];
  players: Player[];
  profiles: Profile[];
  onCycleStatus: (t: Task) => void;
  onOpenDetail: (t: Task) => void;
  detailTaskId?: string;
  showCompleted: boolean;
  onToggleCompleted: () => void;
}) {
  const hoy = hoyISO();
  const prioBorderColor = (t: Task) =>
    t.status === 'completada' ? '#10b981'
    : t.status === 'en_progreso' ? '#3b82f6'
    : t.priority === 'alta' ? '#E24B4A'
    : t.priority === 'media' ? '#EF9F27' : '#94a3b8';

  const renderRow = (t: Task) => {
    const player   = players.find(p => p.id === t.playerId);
    const assignee = profiles.find(m => m.id === t.assigneeId);
    const isOverdue = esVencida(t.dueDate, hoy) && t.status !== 'completada';
    const isSelected = detailTaskId === t.id;
    const isDone = t.status === 'completada';
    return (
      <div
        key={t.id}
        onClick={() => onOpenDetail(t)}
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-blue-50' : ''}`}
      >
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: prioBorderColor(t) }} />
        <button
          onClick={e => { e.stopPropagation(); onCycleStatus(t); }}
          aria-label="Cambiar estado de la tarea"
          className="flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors"
          style={{
            background: isDone ? '#10b981' : t.status === 'en_progreso' ? '#3b82f6' : 'transparent',
            borderColor: isDone ? '#10b981' : t.status === 'en_progreso' ? '#3b82f6' : prioBorderColor(t),
          }}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</p>
          {player && <p className="text-[11px] text-slate-400 truncate">{player.name}</p>}
        </div>
        {assignee && (
          <span
            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary"
            title={assignee.name}
          >{assignee.avatar}</span>
        )}
        {t.dueDate && (
          <span className={`text-[11px] flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
            {parseDia(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            {isOverdue ? ' ⚠' : ''}
          </span>
        )}
      </div>
    );
  };

  if (plano) return <div>{tasks.map(renderRow)}</div>;

  const pending    = tasks.filter(t => t.status === 'pendiente');
  const inProgress = tasks.filter(t => t.status === 'en_progreso');

  const groupHeader = (color: string, label: string, count: number, extra?: React.ReactNode) => (
    <div className="px-3 py-1.5 flex items-center gap-2 bg-slate-50 border-b border-slate-100">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-[11px] text-slate-400 ml-auto">{count}</span>
      {extra}
    </div>
  );

  return (
    <div>
      {pending.length > 0 && <>{groupHeader('#94a3b8', 'Pendiente', pending.length)}{pending.map(renderRow)}</>}
      {inProgress.length > 0 && <>{groupHeader('#3b82f6', 'En progreso', inProgress.length)}{inProgress.map(renderRow)}</>}
      {groupHeader('#10b981', 'Completada', completedTasks.length,
        <button onClick={onToggleCompleted} className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-600 ml-1">
          {showCompleted ? 'Ocultar' : 'Ver'} <ChevronDown className={`w-3 h-3 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
        </button>
      )}
      {showCompleted && completedTasks.map(renderRow)}
    </div>
  );
}

/* ── TaskTableView: sortable table view ── */
type TaskSortCol = 'title' | 'player' | 'priority' | 'dueDate' | 'status';

// Flecha de orden de la tabla de tareas (a nivel de módulo: no se recrea en cada render)
function SortIndicator({ col, sortCol, sortDir }: { col: TaskSortCol; sortCol: TaskSortCol; sortDir: 'asc' | 'desc' }) {
  if (col !== sortCol) return <ChevronDown className="w-3 h-3 opacity-25 inline-block ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronDown className="w-3 h-3 text-blue-500 inline-block ml-0.5" />
    : <ChevronDown className="w-3 h-3 text-blue-500 inline-block ml-0.5 rotate-180" />;
}

function TaskTableView({ tasks, players, profiles, onOpenDetail, onCycleStatus, detailTaskId, sortCol, sortDir, onSort }: {
  tasks: Task[];
  players: Player[];
  profiles: Profile[];
  onOpenDetail: (t: Task) => void;
  onCycleStatus?: (t: Task) => void;
  detailTaskId?: string;
  sortCol: TaskSortCol;
  sortDir: 'asc' | 'desc';
  onSort: (col: TaskSortCol) => void;
}) {
  const hoy = hoyISO();
  const prioOrder: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  const statusOrder: Record<string, number> = { en_progreso: 0, pendiente: 1, completada: 2 };

  // Nombre por id calculado una vez: el comparador se llama O(n log n) veces
  const playerNameById = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortCol === 'player') {
      const pa = playerNameById.get(a.playerId) ?? '';
      const pb = playerNameById.get(b.playerId) ?? '';
      cmp = pa.localeCompare(pb);
    } else if (sortCol === 'priority') {
      cmp = (prioOrder[a.priority ?? 'baja'] ?? 2) - (prioOrder[b.priority ?? 'baja'] ?? 2);
    } else if (sortCol === 'dueDate') {
      cmp = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    } else if (sortCol === 'status') {
      cmp = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const thCls = "px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap";

  const prioBadge = (p: Task['priority']) =>
    p === 'alta' ? 'bg-red-50 text-red-700 border border-red-200'
    : p === 'media' ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-slate-200 text-slate-700';

  const statusBadge = (s: Task['status']) =>
    s === 'completada' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : s === 'en_progreso' ? 'bg-blue-50 text-blue-700 border border-blue-200'
    : 'bg-slate-100 text-slate-500';

  const statusLabel = (s: Task['status']) =>
    s === 'completada' ? 'Completada' : s === 'en_progreso' ? 'En progreso' : 'Pendiente';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {onCycleStatus && <th style={{ width: '32px' }} />}
            <th className={thCls} style={{ width: '34%' }} onClick={() => onSort('title')}>Tarea<SortIndicator col="title" sortCol={sortCol} sortDir={sortDir} /></th>
            <th className={thCls} style={{ width: '16%' }} onClick={() => onSort('player')}>Jugador<SortIndicator col="player" sortCol={sortCol} sortDir={sortDir} /></th>
            <th className={thCls} style={{ width: '13%' }}>Responsable</th>
            <th className={thCls} style={{ width: '10%' }} onClick={() => onSort('priority')}>Prioridad<SortIndicator col="priority" sortCol={sortCol} sortDir={sortDir} /></th>
            <th className={thCls} style={{ width: '11%' }} onClick={() => onSort('dueDate')}>Fecha<SortIndicator col="dueDate" sortCol={sortCol} sortDir={sortDir} /></th>
            <th className={thCls} style={{ width: '16%' }} onClick={() => onSort('status')}>Estado<SortIndicator col="status" sortCol={sortCol} sortDir={sortDir} /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={onCycleStatus ? 7 : 6} className="py-8 text-center text-sm text-slate-400">Sin tareas</td></tr>
          )}
          {sorted.map((t, i) => {
            const player   = players.find(p => p.id === t.playerId);
            const assignee = profiles.find(m => m.id === t.assigneeId);
            const isOverdue = esVencida(t.dueDate, hoy) && t.status !== 'completada';
            const isSelected = detailTaskId === t.id;
            return (
              <tr
                key={t.id}
                onClick={() => onOpenDetail(t)}
                className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
              >
                {onCycleStatus && (
                  <td className="pl-3 py-2">
                    <button
                      onClick={e => { e.stopPropagation(); onCycleStatus(t); }}
                      aria-label="Cambiar estado de la tarea"
                      title="Pendiente → En progreso → Completada"
                      className="w-3.5 h-3.5 rounded-full border-2 transition-colors block"
                      style={{
                        background: t.status === 'completada' ? '#10b981' : t.status === 'en_progreso' ? '#3b82f6' : 'transparent',
                        borderColor: t.status === 'completada' ? '#10b981' : t.status === 'en_progreso' ? '#3b82f6' : '#94a3b8',
                      }}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <p className={`font-medium truncate ${t.status === 'completada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</p>
                </td>
                <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{player?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  {assignee && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 bg-primary"
                        title={assignee.name}>{assignee.avatar}</span>
                      <span className="text-slate-600 truncate">{assignee.name.split(' ')[0]}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.priority && (
                    <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded font-medium ${prioBadge(t.priority)}`}>{t.priority}</span>
                  )}
                </td>
                <td className={`px-3 py-2 font-medium ${isOverdue ? 'text-red-500' : 'text-slate-500'}`}>
                  {t.dueDate
                    ? `${parseDia(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${isOverdue ? ' ⚠' : ''}`
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded font-medium ${statusBadge(t.status)}`}>{statusLabel(t.status)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignManagerModal({ profiles, count, loading, onClose, onAssign }: {
  profiles: Profile[]; count: number; loading: boolean;
  onClose: () => void; onAssign: (managerId: string) => void;
}) {
  const [managerId, setManagerId] = useState("");
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Asignar manager a {count} jugador{count > 1 ? "es" : ""}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-2 -m-2 sm:p-0 sm:m-0 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 safe-area-bottom">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Selecciona un manager</label>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Elige manager —</option>
              {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
            </select>
          </div>
          <button onClick={() => managerId && onAssign(managerId)} disabled={!managerId || loading}
            className="w-full rounded-md text-white text-sm font-medium py-2.5 sm:py-2 disabled:opacity-40 transition-colors bg-primary hover:bg-primary/90">
            {loading ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPlayerModal({ profiles, onClose, onAdd }: {
  profiles: Profile[]; onClose: () => void; onAdd: (player: Player) => void;
}) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pos1, setPos1] = useState("");
  const [pos2, setPos2] = useState("");
  const [nationality, setNationality] = useState("");
  const [nationality2, setNationality2] = useState("");
  const [club1, setClub1] = useState("");
  const [club2, setClub2] = useState("");
  const [isLoan, setIsLoan] = useState(false);
  const [managed1, setManaged1] = useState("");
  const [managed2, setManaged2] = useState("");
  const [reprStart, setReprStart] = useState("");
  const [reprEnd, setReprEnd] = useState("");
  const [clubEnd, setClubEnd] = useState("");
  const [optYears, setOptYears] = useState("");
  const [errors, setErrors] = useState<{ name?: string; birthDate?: string }>({});

  useEscapeKey(onClose);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validación: nombre y fecha de nacimiento
    const nextErrors: { name?: string; birthDate?: string } = {};
    if (!isValidName(name)) {
      nextErrors.name = "Introduce un nombre válido (mínimo 2 caracteres).";
    }
    if (!isValidBirthDate(birthDate)) {
      nextErrors.birthDate = "Fecha no válida: no puede ser futura ni de hace más de 60 años.";
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.birthDate) return;
    const clubs = [];
    if (isLoan && club1 && club2) {
      clubs.push({ name: club1, type: "propietario" as const });
      clubs.push({ name: club2, type: "cedido_en" as const });
    } else if (club1 && club2) {
      clubs.push({ name: club1, type: "compartido" as const });
      clubs.push({ name: club2, type: "compartido" as const });
    } else if (club1) {
      clubs.push({ name: club1, type: "principal" as const });
    }
    onAdd({
      id: "p" + Date.now(), name, birthDate, positions: [pos1, pos2].filter(Boolean),
      // Las dos nacionalidades van juntas en el mismo campo, «Primera/Segunda»
      nationality: [nationality.trim(), nationality2.trim()].filter(Boolean).join("/"), photo: "", clubs,
      managedBy: [managed1, managed2].filter(Boolean),
      representationContract: { start: reprStart, end: reprEnd },
      clubContract: { endDate: clubEnd, optionalYears: optYears ? parseInt(optYears) : undefined },
      contractHistory: [], clubInterests: [], matchReports: [], videoSessions: [], links: [], performance: [],
      info: { family: "", personality: "", phone: "", passportUrl: "" },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Nuevo jugador</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-2 -m-2 sm:p-0 sm:m-0"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8 safe-area-bottom">
          <F label="Nombre completo" value={name} onChange={(v) => { setName(v); if (errors.name) setErrors(prev => ({ ...prev, name: undefined })); }} required error={errors.name} />
          <div>
            <F label="Fecha de nacimiento" value={birthDate} onChange={(v) => { setBirthDate(v); if (errors.birthDate) setErrors(prev => ({ ...prev, birthDate: undefined })); }} type="date" required error={errors.birthDate} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FNacionalidad label="Nacionalidad" value={nationality} onChange={setNationality} />
            <FNacionalidad label="Segunda nacionalidad" value={nationality2} onChange={setNationality2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Posición principal</label>
              <select value={pos1} onChange={(e) => setPos1(e.target.value)} required
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Seleccionar…</option>
                {POSITIONS.map((p) => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Posición secundaria</label>
              <select value={pos2} onChange={(e) => setPos2(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Seleccionar…</option>
                {POSITIONS.map((p) => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Club(s)</p>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="isLoan" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} className="rounded" />
              <label htmlFor="isLoan" className="text-xs text-slate-600">Jugador cedido</label>
            </div>
            {isLoan ? (
              <div className="grid grid-cols-2 gap-3">
                <FEquipo label="Club propietario" value={club1} onChange={setClub1} />
                <FEquipo label="Club donde juega" value={club2} onChange={setClub2} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FEquipo label="Club (principal)" value={club1} onChange={setClub1} />
                <FEquipo label="Segundo club (opcional)" value={club2} onChange={setClub2} />
              </div>
            )}
          </div>
          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contrato de representación</p>
            <div className="grid grid-cols-2 gap-3">
              <F label="Inicio" value={reprStart} onChange={setReprStart} type="date" />
              <F label="Fin" value={reprEnd} onChange={setReprEnd} type="date" />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contrato con club</p>
            <div className="grid grid-cols-2 gap-3">
              <F label="Fin de contrato" value={clubEnd} onChange={setClubEnd} type="date" />
              <F label="Años opcionales" value={optYears} onChange={setOptYears} type="number" />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Equipo</p>
            <div className="grid grid-cols-2 gap-3">
              <Sel label="Encargado 1" value={managed1} onChange={setManaged1} options={profiles} />
              <Sel label="Encargado 2" value={managed2} onChange={setManaged2} options={profiles} />
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" disabled={!name || !pos1 || !birthDate}
              className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors bg-primary hover:bg-primary/90">
              Añadir jugador
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Nacionalidad: lista cerrada de países (ver NacionalidadInput) */
function FNacionalidad({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <NacionalidadInput value={value} onChange={onChange}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
    </div>
  );
}

/** Club del jugador: lista cerrada de equipos (ver EquipoInput) */
function FEquipo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <EquipoInput value={value} onChange={onChange}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
    </div>
  );
}

function F({ label, value, onChange, type = "text", required = false, error }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-md border bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 ${
          error ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-blue-200"
        }`} />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Profile[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
        <option value="">—</option>
        {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}

// ── QUICK TASK MODAL ─────────────────────────────────────────
function QuickTaskModal({ player, profiles, currentProfileId, onClose, onAdd }: {
  player: Player; profiles: Profile[]; currentProfileId?: string;
  onClose: () => void; onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(currentProfileId ?? "");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");

  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
            <p className="text-xs text-slate-400 truncate">{player.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-2 -m-2 sm:p-0 sm:m-0 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 pb-6 safe-area-bottom">
          <div>
            <input
              autoFocus
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) {
                  onAdd({ id: "t"+Date.now(), playerId: player.id, title: title.trim(), description: "",
                    assigneeId, watchers: player.managedBy ?? [], priority, status: "pendiente",
                    dueDate: dueDate || undefined, createdAt: new Date().toISOString(), comments: [] });
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Asignado a</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">— Sin asignar —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.avatar} {p.name.split(" ")[0]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="media">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fecha límite (opcional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <button
            onClick={() => {
              if (!title.trim()) return;
              onAdd({ id: "t"+Date.now(), playerId: player.id, title: title.trim(), description: "",
                assigneeId, watchers: player.managedBy ?? [], priority, status: "pendiente",
                dueDate: dueDate || undefined, createdAt: new Date().toISOString(), comments: [] });
            }}
            disabled={!title.trim()}
            className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors bg-primary hover:bg-primary/90"
          >
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}
