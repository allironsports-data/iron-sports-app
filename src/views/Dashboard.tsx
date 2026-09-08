import { useState, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { BUILD_ID, CHANGELOG } from "../changelog";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { useToastContext } from "../hooks/useToastContext";
import { isValidName, isValidBirthDate } from "../lib/validate";
import type { Player, Task, TaskLabel, PlayerActivity, ScoutingMatch, MemberStatus, Postpartido, FirmasEntry } from "../types";
import { calcAge, clubsLabel, TASK_LABELS } from "../types";
import { fechaLocal, hoyISO, lunesDe, esVencida, parseDia } from "../lib/fechas";
import { createPlayerActivity, fetchActivitiesByAuthor, createScoutingMatch } from "../lib/db";
import type { Profile } from "../contexts/AuthContext";
import { Button, IconButton, Chip, Badge, SectionTabs, Field, Input, Select, Textarea, Dialog, ClickableRow } from "../components/ui";
import { L, PRIORITY_LABELS, TASK_STATUS_LABELS, label as labelDe } from "../lib/labels";
import { cn } from "../lib/cn";
import {
  Users,
  AlertTriangle,
  Plus,
  Search,
  X,
  Trash2,
  UserPlus,
  CheckSquare,
  Square,
  Cake,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  Table,
  Zap,
  EyeOff,
  Activity,
  ExternalLink,
  RotateCcw,
  Check,
  Rocket,
  Sparkles,
  FileText,
  Pin,
  Phone,
  MessageCircle,
  MessageSquare,
  Handshake,
  Play,
  Film,
  Trophy,
  User,
  PenLine,
} from "lucide-react";
import { POSITIONS, POSITION_CODES, positionLabel } from "../lib/positions";

const PRIMARY = "hsl(220,72%,26%)";

export type DashboardTab = 'tareas' | 'jugadores' | 'equipo' | 'postpartidos';

interface Props {
  /** Sub-pestaña activa (controlada desde App/#ruta). Si no llega, se gestiona internamente. */
  tab?: DashboardTab;
  onTabChange?: (tab: DashboardTab) => void;
  /** Abrir una tarea concreta al entrar (p. ej. desde «Mi día»); se consume una vez abierta */
  openTaskId?: string | null;
  onOpenTaskConsumed?: () => void;
  /** Pipeline de firmas — para el aviso de próximas acciones de hoy */
  firmasEntries?: FirmasEntry[];
  onOpenFirmar?: (entryId: string) => void;
  /** true si hay una versión nueva de la app desplegada (detectado en App.tsx) */
  updateAvailable?: boolean;
  players: Player[];
  tasks: Task[];
  profiles: Profile[];
  currentProfile: Profile;
  onSelectPlayer: (id: string) => void;
  onAddPlayer: (player: Player) => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkAssignManager?: (playerIds: string[], managerId: string) => Promise<void>;
  onAddGeneralTask?: (task: Task) => void | Task | Promise<void | Task>;
  onUpdateGeneralTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onDeleteGeneralTask?: (taskId: string) => void;
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

const ACTIVITY_TYPES_DASH = [
  'Comunicación con club', 'Reunión con jugador', 'Llamada',
  'Email', 'Visita presencial', 'Partido', 'Transferencia', 'Nota general',
] as const;

// ── Helpers de accesibilidad para filas/tarjetas clicables ──
// Fila `div`/`tr` que abre algo: role=button + teclado. Los botones interiores
// no la disparan (se comprueba que el evento nace en la propia fila).
function rowProps(fn: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    },
  };
}
const ROW_FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/** Círculo de estado de una tarea: objetivo táctil de 44px en móvil (la lógica del ciclo no cambia). */
function StatusDot({ task, color, onCycle, className }: { task: Task; color: string; onCycle: (t: Task) => void; className?: string }) {
  const filled = task.status === 'completada' ? '#10b981' : task.status === 'en_progreso' ? '#3b82f6' : null;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onCycle(task); }}
      onKeyDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      aria-label={`Cambiar estado (ahora: ${labelDe(TASK_STATUS_LABELS, task.status)})`}
      title="Pendiente → En progreso → Completada"
      className={cn(
        'flex-shrink-0 inline-flex items-center justify-center rounded-full transition-colors hover:bg-slate-100',
        'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:h-6 sm:w-6 -my-3 -ml-2.5 sm:m-0',
        className,
      )}
    >
      <span className="block w-4 h-4 rounded-full border-2" style={{ background: filled ?? 'transparent', borderColor: filled ?? color }} />
    </button>
  );
}

/** Avatar de iniciales (mínimo 24px con text-badge). */
function Avatar({ text, className, title }: { text: string; className?: string; title?: string }) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn('w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-white flex-shrink-0 leading-none', text.length > 2 ? 'text-[11px] tracking-tighter' : 'text-badge', className)}
      style={{ background: PRIMARY }}
    >
      {text.slice(0, 3)}
    </span>
  );
}

// ── Estado del equipo: la tarea en curso sale sola del tablero ──
export function Dashboard({
  tab,
  onTabChange,
  openTaskId,
  onOpenTaskConsumed,
  firmasEntries,
  onOpenFirmar,
  updateAvailable,
  players,
  tasks,
  profiles,
  currentProfile,
  onSelectPlayer,
  onAddPlayer,
  onBulkDelete,
  onBulkAssignManager,
  onAddGeneralTask,
  onUpdateGeneralTask,
  onUpdateTask,
  onDeleteGeneralTask,
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
  // Sub-pestaña: la prop `tab` manda cuando llega (App la sincroniza con #/ruta);
  // sin prop, se gestiona internamente (compatibilidad).
  const [internalTab, setInternalTab] = useState<DashboardTab>(tab ?? 'tareas');
  const activeTab: DashboardTab = tab ?? internalTab;
  const changeTab = (t: DashboardTab) => { setInternalTab(t); onTabChange?.(t); };
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showFirmasToday, setShowFirmasToday] = useState(false);
  const [showAddGeneralTask, setShowAddGeneralTask] = useState(false);

  // ── Estado del equipo (automático: tarea en curso + nota opcional) ──
  // Panel plegado por defecto para no comer pantalla; recuerda tu elección
  const [statusPanelOpen, setStatusPanelOpen] = useState<boolean>(() => sessionStorage.getItem('dash_status_open') === '1');
  useEffect(() => { sessionStorage.setItem('dash_status_open', statusPanelOpen ? '1' : '0'); }, [statusPanelOpen]);
  // Nota rápida propia ("si hace falta añadir algo")
  const [myNoteEditing, setMyNoteEditing] = useState(false);
  const [myNoteDraft, setMyNoteDraft] = useState('');

  // ── Postpartidos ──
  const [showAddPostpartido, setShowAddPostpartido] = useState(false);
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
    setPpMatchId(''); setPpNewMatchOpen(false);
    setPpNewMatch({ date: '', home: '', away: '', competition: '' });
    setPpPlayerId(''); setPpPlayerName('');
    setPpAssigneeId(currentProfile.id);
    setPpDue(''); setPpNotes('');
    setShowAddPostpartido(true);
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
        dueDate: ppDue || undefined,
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

  // Add event modal state
  const [showAddEvent, setShowAddEvent]           = useState(false);
  const [evtPlayer, setEvtPlayer]                 = useState("");
  const [evtPlayerQ, setEvtPlayerQ]               = useState("");
  const [evtDate, setEvtDate]                     = useState("");
  const [evtType, setEvtType]                     = useState<string>(ACTIVITY_TYPES_DASH[0]);
  const [evtCustomType, setEvtCustomType]         = useState("");
  const [evtNotes, setEvtNotes]                   = useState("");
  const [evtExtraPlayers, setEvtExtraPlayers]     = useState<string[]>([]); // additional player IDs
  const [evtExtraPlayerQ, setEvtExtraPlayerQ]     = useState("");
  const [evtParticipants, setEvtParticipants]     = useState<string[]>([]); // staff profile IDs
  const [evtParticipantQ, setEvtParticipantQ]     = useState("");
  const [evtSaving, setEvtSaving]                 = useState(false);

  function openAddEvent() {
    setEvtPlayer("");
    setEvtPlayerQ("");
    setEvtDate(fechaLocal(new Date()));
    setEvtType(ACTIVITY_TYPES_DASH[0]);
    setEvtCustomType("");
    setEvtNotes("");
    setEvtExtraPlayers([]);
    setEvtExtraPlayerQ("");
    setEvtParticipants([]);
    setEvtParticipantQ("");
    setShowAddEvent(true);
  }

  async function handleSaveEvent() {
    const resolvedType = evtType === 'custom' ? evtCustomType.trim() : evtType;
    if (!evtPlayer || !evtDate || !resolvedType) return;
    setEvtSaving(true);
    try {
      const input = {
        date: evtDate, type: resolvedType,
        notes: evtNotes.trim() || undefined,
        authorId: currentProfile.id,
        participantProfileIds: evtParticipants.length > 0 ? evtParticipants : undefined,
      };
      const allPlayerIds = [evtPlayer, ...evtExtraPlayers.filter(id => id !== evtPlayer)];
      if (allPlayerIds.length > 1) {
        const { createGroupActivity } = await import("../lib/db");
        await createGroupActivity(allPlayerIds, input);
      } else {
        await createPlayerActivity(evtPlayer, input);
      }
      setShowAddEvent(false);
      const playerName = players.find(p => p.id === evtPlayer)?.name ?? 'jugador';
      showToast(`Evento registrado para ${playerName}`, "success");
    } catch {
      showToast("No se pudo guardar el evento", "error");
    } finally {
      setEvtSaving(false);
    }
  }
  const [managerFilter, setManagerFilter] = useState<string>("all");
  // quick filter from stat cards: overlays on top of the person filter
  const [quickFilter, setQuickFilter] = useState<"overdue" | "today" | "week" | "inprogress" | null>(null);
  // Person filter for the unified board: 'me' | 'all' | <profileId>
  const [personFilter, setPersonFilter] = useState<string>(
    () => sessionStorage.getItem('nav_person_filter') ?? 'me'
  );
  // Board grouping: estado (kanban/compacto/tabla) | jugador | persona
  const [groupBy, setGroupBy] = useState<'estado' | 'jugador' | 'persona'>(
    () => (sessionStorage.getItem('nav_group_by') as 'estado' | 'jugador' | 'persona') ?? 'estado'
  );
  const [weekOffset, setWeekOffset] = useState(0);
  // Activities per profile for the Equipo workload view (cached — week nav does NOT refetch)
  const [teamActivities, setTeamActivities] = useState<Record<string, PlayerActivity[]>>({});
  const [loadingTeamActivities, setLoadingTeamActivities] = useState(false);
  const [misViewMode, setMisViewMode] = useState<'kanban' | 'compact' | 'table' | 'semana'>('kanban');
  const [taskWeekOffset, setTaskWeekOffset] = useState(0); // vista semana de tareas: 0 = esta semana
  const [taskSortCol, setTaskSortCol] = useState<'title' | 'player' | 'priority' | 'dueDate' | 'status'>('dueDate');
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('asc');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  // Apertura externa de una tarea (desde «Mi día»)
  useEffect(() => {
    if (!openTaskId) return;
    const t = tasks.find(x => x.id === openTaskId);
    if (t) { if (activeTab !== 'tareas') changeTab('tareas'); setDetailTask(t); }
    onOpenTaskConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskId, tasks]);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompletedMine, setShowCompletedMine] = useState(false);
  const [playerView, setPlayerView] = useState<'grid' | 'list' | 'table'>('grid');
  const [quickTaskPlayer, setQuickTaskPlayer] = useState<Player | null>(null);

  // Jugadores advanced filters
  const [posFilters, setPosFilters] = useState<string[]>([]);
  const [yearFilters, setYearFilters] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState(false);


  // Persist board preferences so refresh restores position
  useEffect(() => { sessionStorage.setItem('nav_person_filter', personFilter) }, [personFilter]);
  useEffect(() => { sessionStorage.setItem('nav_group_by', groupBy) }, [groupBy]);

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
  const boardTasks = visibleTasks.filter(t => t.status !== 'completada' && matchesPerson(t));
  const boardCompleted = visibleTasks.filter(t => t.status === 'completada' && matchesPerson(t));

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

  // ── Firmar: iconos por tipo de acción (coherentes con el historial) ──
  const FIRMAS_KIND_ICON: Record<string, React.ReactNode> = {
    llamada: <Phone className="w-3 h-3" />, whatsapp: <MessageCircle className="w-3 h-3" />, reunion: <Handshake className="w-3 h-3" />,
    entorno: <Users className="w-3 h-3" />, nota: <FileText className="w-3 h-3" />,
  };

  // ── Novedades de la app: visibles hasta descartarlas (por build) ──
  // Los cambios técnicos (adminItems) solo se le enseñan a los admin: al
  // resto del equipo no le dicen nada y ensucian la pantalla de inicio.
  const changelogItems = currentProfile.is_admin
    ? [...CHANGELOG[0].items, ...(CHANGELOG[0].adminItems ?? [])]
    : CHANGELOG[0].items;
  const [showChangelog, setShowChangelog] = useState<boolean>(() => {
    try { return BUILD_ID !== 'dev' && localStorage.getItem('ais_seen_build') !== BUILD_ID && CHANGELOG.length > 0 } catch { return false }
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

  // ── Firmar: próximas acciones que tocan hoy (o están vencidas) ──
  const firmasActionsToday = (firmasEntries ?? [])
    .filter((e) => e.nextActionDate && e.nextActionDate <= todayStr && e.status !== 'firmado')
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''));

  // ── Estado del equipo: datos derivados ──
  const statusProfiles = profiles.filter(p => !p.hidden_from_status);
  const hiddenStatusProfiles = profiles.filter(p => p.hidden_from_status);
  const myStatus = memberStatuses.find(s => s.profileId === currentProfile.id);

  // Tarea "en progreso" más reciente de un miembro — el panel la muestra
  // automáticamente aunque no la haya elegido en su estado.
  const inProgressTaskFor = (profileId: string): Task | undefined =>
    tasks
      .filter(t => t.status === 'en_progreso' && t.assigneeId === profileId)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];

  // Guardar mi nota rápida (lo único editable del panel: la tarea sale sola)
  async function saveMyNote() {
    setMyNoteEditing(false);
    if (!onUpdateMemberStatus) return;
    const v = myNoteDraft.trim();
    if (v === (myStatus?.note ?? '')) return;
    try {
      await onUpdateMemberStatus({ profileId: currentProfile.id, note: v || undefined });
    } catch {
      showToast('No se pudo guardar la nota. Inténtalo de nuevo.', 'error');
    }
  }

  // Available options for multi-filters (derived from visible players)
  const positionOptions = POSITION_CODES;
  const yearOptions = Array.from(new Set(visiblePlayers.map(p => p.birthDate?.slice(0, 4)).filter(Boolean))).sort((a, b) => Number(b) - Number(a)) as string[];

  const filtered = visiblePlayers.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.positions[0] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.clubs.some((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    const matchManager =
      managerFilter === "all" || p.managedBy.includes(managerFilter);
    const matchPos = posFilters.length === 0 || (p.positions[0] && posFilters.includes(p.positions[0]));
    const matchYear = yearFilters.length === 0 || (p.birthDate && yearFilters.includes(p.birthDate.slice(0, 4)));
    const matchActivity = !activityFilter || tasks.some(t => t.playerId === p.id && t.status !== "completada");
    return matchSearch && matchManager && matchPos && matchYear && matchActivity;
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
      showToast(`${L.encargado} asignado`, "success");
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
      if (task.playerId === "general" || task.playerId === "") {
        if (onUpdateGeneralTask) await Promise.resolve(onUpdateGeneralTask(updated));
      } else {
        if (onUpdateTask) await Promise.resolve(onUpdateTask(updated));
      }
    } catch {
      showToast("No se pudo guardar. Inténtalo de nuevo.", "error");
    }
  };

  const canBulkAction = (onBulkDelete || onBulkAssignManager) && currentProfile.is_admin;
  const ppPending = postpartidos.filter(pp => !pp.taskId || !completedTaskIds.has(pp.taskId)).length;

  return (
    <div>
      {/* Sub-pestañas de Mantenimiento (nivel 2). La barra superior y el nivel 1 los pone AppShell. */}
      <SectionTabs<DashboardTab>
        variant="secondary"
        label="Secciones de Mantenimiento"
        className="sticky top-[var(--shell-h)] z-20 bg-white -mt-4 -mx-3 sm:-mx-6 px-3 sm:px-6 mb-4 border-b border-slate-200"
        items={[
          { id: 'tareas', label: L.tareas },
          { id: 'jugadores', label: L.jugadores },
          { id: 'equipo', label: L.equipo },
          { id: 'postpartidos', label: 'Postpartidos', count: ppPending, alert: false },
        ]}
        value={activeTab}
        onChange={changeTab}
      />

      <div className="pb-16 sm:pb-0">
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
                <span className="text-secondary text-amber-800">
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
            <Rocket className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold leading-tight">Hay una versión nueva de la app</p>
              <p className="text-meta opacity-90">Actualiza para ver las últimas funciones y correcciones</p>
            </div>
            <Button size="sm" onClick={() => window.location.reload()} className="bg-white text-blue-700 border-white hover:bg-blue-50 font-bold">
              Actualizar ahora
            </Button>
          </div>
        )}

        {/* Novedades tras actualizar (descartable) */}
        {showChangelog && !updateAvailable && changelogItems.length > 0 && (
          <div className="mb-4 bg-violet-50 border border-violet-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-2 pl-3">
              <Sparkles className="w-4 h-4 text-violet-700 flex-shrink-0" aria-hidden="true" />
              <button type="button" aria-expanded={changelogOpen} onClick={() => setChangelogOpen(v => !v)} className={cn("flex-1 flex items-center gap-2 text-left min-h-9 rounded", ROW_FOCUS)}>
                <span className="text-body font-semibold text-violet-800">Novedades de la app</span>
                <span className="hidden sm:inline text-secondary text-violet-700/80">
                  {new Date(CHANGELOG[0].date).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} · {changelogItems.length} cambio{changelogItems.length !== 1 ? "s" : ""}
                </span>
                <ChevronDown className={`w-4 h-4 text-violet-700 ml-auto transition-transform ${changelogOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              <IconButton
                label="Descartar novedades"
                onClick={() => {
                  try { localStorage.setItem("ais_seen_build", BUILD_ID) } catch { /* modo privado */ }
                  setShowChangelog(false);
                }}
                className="text-violet-700 hover:text-violet-900 hover:bg-violet-100"
              >
                <X />
              </IconButton>
            </div>
            {changelogOpen && (
              <ul className="border-t border-violet-200 px-4 py-2.5 space-y-1.5">
                {changelogItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-secondary text-slate-700">
                    <span className="text-violet-500 flex-shrink-0 mt-0.5" aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Contratos de representación que expiran */}
        {repExpiring.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
            <button
              type="button"
              aria-expanded={showRepContracts}
              onClick={() => setShowRepContracts(v => !v)}
              className={cn("w-full flex items-center gap-2 p-3 text-left hover:bg-amber-100/50 transition-colors", ROW_FOCUS)}
            >
              <FileText className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
              <span className="text-body font-semibold text-amber-800">
                {repExpiring.length} contrato{repExpiring.length !== 1 ? "s" : ""} de representación en sus últimos 6 meses
              </span>
              <span className="hidden sm:inline text-secondary text-amber-800/80 font-normal truncate">
                {repExpiring.slice(0, 3).map(x => x.p.name.split(" ")[0]).join(" · ")}{repExpiring.length > 3 ? " · …" : ""}
              </span>
              <ChevronDown className={`w-4 h-4 text-amber-700 ml-auto flex-shrink-0 transition-transform ${showRepContracts ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {showRepContracts && (
              <div className="border-t border-amber-200 divide-y divide-amber-100">
                {repExpiring.map(({ p, end }) => {
                  const expired = new Date(end).getTime() < Date.now();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPlayer(p.id)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 min-h-11 text-left text-secondary text-slate-700 hover:bg-amber-100/40 transition-colors", ROW_FOCUS)}
                    >
                      <span className="font-semibold text-body">{p.name}</span>
                      <span className={expired ? "text-red-600 font-semibold" : "text-slate-600"}>
                        {expired ? "venció" : "vence"} el {new Date(end).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="ml-auto text-meta text-amber-800 flex-shrink-0 inline-flex items-center gap-0.5">Abrir ficha <ChevronRight className="w-3 h-3" aria-hidden="true" /></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Próximas acciones de Firmar para hoy (Captación → Firmar) */}
        {firmasActionsToday.length > 0 && (
          <div className="mb-4 bg-violet-50 border border-violet-200 rounded-lg overflow-hidden">
            <button
              type="button"
              aria-expanded={showFirmasToday}
              onClick={() => setShowFirmasToday((v) => !v)}
              className={cn("w-full flex items-center gap-2 p-3 text-left hover:bg-violet-100/50 transition-colors", ROW_FOCUS)}
            >
              <Pin className="w-4 h-4 text-violet-700 flex-shrink-0" aria-hidden="true" />
              <span className="text-body font-semibold text-violet-800">
                {firmasActionsToday.length} acci{firmasActionsToday.length !== 1 ? "ones" : "ón"} de {L.firmar} para hoy
              </span>
              <span className="hidden sm:inline text-secondary text-violet-700/80 font-normal truncate">
                {firmasActionsToday.slice(0, 3).map((e) => e.playerName).join(" · ")}{firmasActionsToday.length > 3 ? " · …" : ""}
              </span>
              <ChevronDown className={`w-4 h-4 text-violet-700 ml-auto flex-shrink-0 transition-transform ${showFirmasToday ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {showFirmasToday && (
              <div className="border-t border-violet-200 divide-y divide-violet-100">
                {firmasActionsToday.map((e) => {
                  const assignee = e.nextActionAssignee ? profiles.find((p) => p.id === e.nextActionAssignee) : undefined;
                  const overdue = (e.nextActionDate ?? "") < todayStr;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpenFirmar?.(e.id)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 min-h-11 text-left text-secondary text-slate-700 hover:bg-violet-100/40 transition-colors", ROW_FOCUS)}
                    >
                      <span className="font-semibold text-body">{e.playerName}</span>
                      <span className="text-slate-600 truncate inline-flex items-center gap-1">{FIRMAS_KIND_ICON[e.nextActionKind ?? ""] ?? <Pin className="w-3 h-3" />} {e.nextAction ?? "Acción"}</span>
                      {assignee && (
                        <Badge pill={false} className="bg-violet-100 text-violet-700 font-mono" title={assignee.name}>
                          {assignee.avatar || assignee.name.split(" ")[0]}
                        </Badge>
                      )}
                      {overdue && <Badge tone="danger">vencida</Badge>}
                      <span className="ml-auto text-meta text-violet-700 flex-shrink-0 inline-flex items-center gap-0.5">Abrir <ChevronRight className="w-3 h-3" aria-hidden="true" /></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tareas section ──────────────────────────────── */}
        {activeTab === 'tareas' && (<>

        {/* ── Cabecera: filtro por persona + acciones ── */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por persona">
            <Chip
              active={personFilter === 'me'}
              onClick={() => { setPersonFilter('me'); setQuickFilter(null); }}
              count={visibleTasks.filter(t => t.status !== 'completada' && involvesProfile(t, currentProfile.id)).length}
            >
              Yo
            </Chip>
            <Chip
              active={personFilter === 'all'}
              onClick={() => { setPersonFilter('all'); setQuickFilter(null); }}
              count={pendingTasks.filter(t => !(t.adminOnly && !currentProfile.is_admin)).length}
            >
              Todos
            </Chip>
            {/* Resto del equipo (solo con tareas abiertas) */}
            {profiles.filter(p => p.id !== currentProfile.id).map(p => {
              const n = visibleTasks.filter(t => t.status !== 'completada' && involvesProfile(t, p.id)).length;
              if (n === 0) return null;
              return (
                <Chip
                  key={p.id}
                  active={personFilter === p.id}
                  onClick={() => { setPersonFilter(p.id); setQuickFilter(null); }}
                  count={n}
                >
                  {p.name.split(' ')[0]}
                </Chip>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon={<Activity />} onClick={openAddEvent}>Evento</Button>
            {onAddGeneralTask && (
              <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setShowAddGeneralTask(true)}>Nueva tarea</Button>
            )}
          </div>
        </div>

          {/* ── Panel de estado del equipo (plegable; sustituye a los 4 stats) ── */}
          <div className="mb-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Barra plegada: un vistazo del equipo en ~40px */}
            <button
              type="button"
              aria-expanded={statusPanelOpen}
              onClick={() => setStatusPanelOpen(v => !v)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-2 min-h-11 hover:bg-slate-50 transition-colors", ROW_FOCUS)}
              title={statusPanelOpen ? 'Plegar panel de equipo' : 'Ver estado del equipo'}
            >
              <span className="text-badge font-bold uppercase tracking-wider text-slate-500 flex-shrink-0">{L.equipo}</span>
              <div className="flex items-center gap-2 flex-1 overflow-x-auto py-0.5">
                {statusProfiles.map(p => {
                  const curTask = inProgressTaskFor(p.id);
                  return (
                    <span
                      key={p.id}
                      className="relative flex-shrink-0"
                      title={`${p.name.split(' ')[0]} · ${curTask ? `En curso: ${curTask.title}` : 'sin tarea en curso'}`}
                    >
                      <Avatar text={p.avatar} />
                      <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${curTask ? 'bg-blue-500' : 'bg-slate-300'}`} />
                    </span>
                  );
                })}
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${statusPanelOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {/* Panel desplegado: tarjetas completas */}
            {statusPanelOpen && (
              <div className="border-t border-slate-100 p-2.5 bg-slate-50/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {statusProfiles.map(p => {
                    const s = memberStatuses.find(x => x.profileId === p.id);
                    const curTask = inProgressTaskFor(p.id);
                    const taskPlayer = curTask && curTask.playerId !== 'general' ? players.find(x => x.id === curTask.playerId) : undefined;
                    const isMe = p.id === currentProfile.id;
                    return (
                      <div
                        key={p.id}
                        {...rowProps(() => onSelectProfile?.(p.id))}
                        className={cn(`cursor-pointer text-left rounded-xl border px-3 py-2 transition-all hover:shadow-sm bg-white border-slate-200 hover:border-slate-300 ${isMe ? 'ring-1 ring-blue-200' : ''}`, ROW_FOCUS)}
                        title={`Ver detalle de ${p.name.split(' ')[0]}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="relative flex-shrink-0">
                            <Avatar text={p.avatar} />
                            <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${curTask ? 'bg-blue-500' : 'bg-slate-300'}`} />
                          </span>
                          <span className="text-secondary font-bold text-slate-800 truncate flex-1">
                            {p.name.split(' ')[0]}{isMe && <span className="font-normal text-slate-500"> (yo)</span>}
                          </span>
                          {onToggleStatusHidden && (
                            <IconButton
                              label={`Ocultar a ${p.name.split(' ')[0]} del panel`}
                              onClick={e => {
                                e.stopPropagation();
                                onToggleStatusHidden(p.id, true).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'));
                              }}
                              className="-my-2 -mr-2 text-slate-600"
                            >
                              <EyeOff />
                            </IconButton>
                          )}
                        </div>
                        {/* Tarea en curso — automática, del tablero */}
                        <div className={`text-meta truncate flex items-center gap-1 ${curTask ? 'text-blue-700 font-semibold' : 'text-slate-500 italic'}`}>
                          <Play className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{curTask ? `${curTask.title}${taskPlayer ? ` · ${taskPlayer.name.split(' ')[0]}` : ''}` : 'Ninguna tarea en curso'}</span>
                        </div>
                        {/* Nota opcional — lo único editable (solo la tuya) */}
                        {isMe && myNoteEditing ? (
                          <Input
                            value={myNoteDraft}
                            onChange={e => setMyNoteDraft(e.target.value)}
                            onBlur={() => void saveMyNote()}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') void saveMyNote(); if (e.key === 'Escape') setMyNoteEditing(false); }}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                            aria-label="Mi nota rápida"
                            placeholder="Nota rápida (ej. «en Elche hasta el jueves»)"
                            className="mt-1 py-1 text-secondary"
                          />
                        ) : isMe && onUpdateMemberStatus ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMyNoteDraft(s?.note ?? ''); setMyNoteEditing(true); }}
                            className={cn(`w-full text-left text-meta truncate flex items-center gap-1 rounded min-h-7 ${s?.note ? 'text-slate-600' : 'text-slate-500 italic'} hover:text-slate-800`, ROW_FOCUS)}
                            title="Editar mi nota"
                          >
                            <MessageSquare className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">{s?.note || 'Añadir nota…'}</span>
                          </button>
                        ) : (
                          <div className={`text-meta truncate flex items-center gap-1 ${s?.note ? 'text-slate-600' : 'text-slate-500 italic'}`}>
                            <MessageSquare className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">{s?.note || '—'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Miembros ocultos (solo admins) */}
                {onToggleStatusHidden && hiddenStatusProfiles.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <EyeOff className="w-3 h-3 text-slate-500 flex-shrink-0" aria-hidden="true" />
                    <span className="text-meta text-slate-500">Ocultos:</span>
                    {hiddenStatusProfiles.map(p => (
                      <Chip
                        key={p.id}
                        tone="neutral"
                        onClick={() => onToggleStatusHidden(p.id, false).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                        title="Volver a mostrar en el panel"
                      >
                        {p.name.split(' ')[0]} · Mostrar
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Estadísticas + filtro rápido de tareas ── */}
          <div className="flex border border-slate-200 rounded-lg bg-white overflow-hidden divide-x divide-slate-200 mb-3">
            <div className="flex-1 px-3 py-2">
              <div className={`text-lg font-bold leading-tight ${boardOverdue.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{boardOverdue.length}</div>
              <div className="text-meta text-slate-500">Vencidas</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className="text-lg font-bold leading-tight text-slate-800">{boardDueToday.length}</div>
              <div className="text-meta text-slate-500">Hoy</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className="text-lg font-bold leading-tight text-slate-800">{boardDueThisWeek.length}</div>
              <div className="text-meta text-slate-500">Esta semana</div>
            </div>
            <div className="flex-1 px-3 py-2">
              <div className={`text-lg font-bold leading-tight ${boardInProgress.length > 0 ? 'text-blue-600' : 'text-slate-800'}`}>{boardInProgress.length}</div>
              <div className="text-meta text-slate-500">{TASK_STATUS_LABELS.en_progreso}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <label htmlFor="dash-quick-filter" className="text-meta text-slate-500 font-medium">Filtro rápido</label>
            <Select
              id="dash-quick-filter"
              value={quickFilter ?? 'none'}
              onChange={e => setQuickFilter(e.target.value === 'none' ? null : e.target.value as typeof quickFilter)}
              className="w-auto py-1.5 text-secondary"
            >
              <option value="none">Todas las tareas</option>
              <option value="overdue">Vencidas ({boardOverdue.length})</option>
              <option value="today">Hoy ({boardDueToday.length})</option>
              <option value="week">Esta semana ({boardDueThisWeek.length})</option>
              <option value="inprogress">En progreso ({boardInProgress.length})</option>
            </Select>
          </div>

          {/* Unified board */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
              <p className="text-secondary font-semibold text-slate-700 flex-1">
                {personFilter === 'me' ? 'Mis tareas'
                  : personFilter === 'all' ? 'Todas las tareas'
                  : `Tareas de ${profiles.find(p => p.id === personFilter)?.name.split(' ')[0] ?? ''}`}
                {' '}<span className="font-normal text-slate-500">({boardTasks.length})</span>
              </p>
              {quickFilter && (
                <Button variant="ghost" size="sm" icon={<X />} onClick={() => setQuickFilter(null)}>Limpiar filtro</Button>
              )}
              {/* Agrupar por: estado | jugador | persona */}
              <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5" role="group" aria-label="Agrupar por">
                {([
                  { id: 'estado' as const, label: L.estado },
                  { id: 'jugador' as const, label: L.jugador },
                  { id: 'persona' as const, label: 'Persona' },
                ]).map(g => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={groupBy === g.id}
                    onClick={() => setGroupBy(g.id)}
                    className={cn(`px-2.5 min-h-8 rounded text-meta font-semibold transition-colors ${
                      groupBy === g.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`, ROW_FOCUS)}
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
                  return <p className="text-center py-8 text-body text-slate-500 inline-flex w-full justify-center items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Sin tareas pendientes</p>;
                }
                return (
                  <div>
                    {groups.map(g => (
                      <div key={g.key} className="border-b border-slate-100 last:border-b-0">
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                          {groupBy === 'persona' && g.avatar && <Avatar text={g.avatar} />}
                          <p className="text-badge font-semibold uppercase tracking-wide text-slate-600">{g.label}</p>
                          <span className="text-meta text-slate-500 ml-auto">{g.gtasks.length}</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {g.gtasks.map(t => (
                            <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                              onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                              detailTaskId={detailTask?.id}
                              overdue={!!(t.dueDate && t.dueDate < todayStr)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              // ── Agrupado por estado (kanban / compacto / tabla) ──
              const colPending    = filteredBoard.filter(t => t.status === 'pendiente');
              const colInProgress = filteredBoard.filter(t => t.status === 'en_progreso');
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
                      <IconButton label="Semana anterior" variant="secondary" onClick={() => setTaskWeekOffset(o => o - 1)}><ChevronLeft /></IconButton>
                      <span className="text-secondary font-semibold text-slate-700">
                        {new Date(days[0]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – {new Date(days[6]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {taskWeekOffset === 0 && <span className="text-slate-500 font-normal"> · esta semana</span>}
                      </span>
                      {taskWeekOffset !== 0 && (
                        <Button variant="link" size="sm" onClick={() => setTaskWeekOffset(0)}>hoy</Button>
                      )}
                      <IconButton label="Semana siguiente" variant="secondary" onClick={() => setTaskWeekOffset(o => o + 1)}><ChevronRight /></IconButton>
                      {before.length > 0 && taskWeekOffset === 0 && (
                        <Badge tone="danger" className="ml-auto">{before.length} vencida{before.length !== 1 ? 's' : ''} anteriores</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
                      {days.map((d, i) => {
                        const dayTasks = filteredBoard.filter(t => t.dueDate === d);
                        const isToday = d === todayStr;
                        if (dayTasks.length === 0 && (i === 5 || i === 6)) return null; // finde vacío fuera (móvil lo agradece)
                        return (
                          <div key={d} className={`rounded-lg border p-1.5 min-h-[70px] ${isToday ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
                            <div className={`text-badge font-bold uppercase mb-1 ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                              {DOW[i]} {new Date(d).getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayTasks.map(t => {
                                const assignee = profiles.find(pr => pr.id === t.assigneeId);
                                const tp = t.playerId !== 'general' ? players.find(x => x.id === t.playerId) : undefined;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setDetailTask(t)}
                                    className={cn(`w-full text-left rounded-md border px-1.5 py-1 min-h-11 sm:min-h-0 bg-white hover:border-slate-300 transition-colors ${t.priority === 'alta' ? 'border-red-200' : 'border-slate-200'}`, ROW_FOCUS)}
                                  >
                                    <div className="text-secondary font-medium text-slate-800 leading-tight line-clamp-2">{t.title}</div>
                                    <div className="mt-0.5 flex items-center gap-1 text-badge text-slate-500">
                                      {assignee && <span className="font-mono font-bold" title={assignee.name}>{assignee.avatar}</span>}
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
                      <p className="mt-2 text-meta text-slate-500">{noDate.length} tarea{noDate.length !== 1 ? 's' : ''} sin fecha límite (visibles en las otras vistas)</p>
                    )}
                  </div>
                );
              }
              if (misViewMode === 'compact') {
                return (
                  <CompactTaskList
                    tasks={filteredBoard} completedTasks={boardCompleted}
                    players={players} profiles={profiles}
                    onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                  />
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
                <>
                  <div className="hidden sm:grid grid-cols-3 gap-0 divide-x divide-slate-100 p-4 pt-3">
                    <KanbanCol label={TASK_STATUS_LABELS.pendiente} dotColor="#94a3b8"
                      tasks={colPending} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    />
                    <KanbanCol label={TASK_STATUS_LABELS.en_progreso} dotColor="#378ADD"
                      tasks={colInProgress} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    />
                    <KanbanCol label={TASK_STATUS_LABELS.completada} dotColor="#1D9E75"
                      tasks={[]} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                      completedCount={boardCompleted.length} completedTasks={boardCompleted}
                      isCompletedCol
                    />
                  </div>
                  <div className="sm:hidden p-4 space-y-2">
                    {[...colPending, ...colInProgress].length === 0
                      ? <p className="text-center py-6 text-body text-slate-500 inline-flex w-full justify-center items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Sin tareas pendientes</p>
                      : [...colPending, ...colInProgress].map(t => (
                          <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                            onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                            detailTaskId={detailTask?.id}
                            overdue={!!(t.dueDate && t.dueDate < todayStr)} />
                        ))
                    }
                  </div>
                </>
              );
            })()}
          </div>

        </>)}

        {/* ── Jugadores section ────────────────────────────── */}
        {activeTab === 'jugadores' && (<>

        {/* Players list header */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar jugador, club…"
                aria-label="Buscar jugador o club"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canBulkAction && !selectMode && (
                <Button icon={<CheckSquare />} onClick={() => setSelectMode(true)} aria-label="Seleccionar jugadores">
                  <span className="hidden sm:inline">Seleccionar</span>
                </Button>
              )}
              {selectMode && (
                <Button icon={<X />} onClick={exitSelectMode} aria-label="Cancelar selección">
                  <span className="hidden sm:inline">{L.cancelar}</span>
                </Button>
              )}
              <Button variant="primary" icon={<Plus />} onClick={() => setShowAddPlayer(true)} aria-label="Nuevo jugador">
                <span className="hidden sm:inline">Nuevo jugador</span>
              </Button>
            </div>
          </div>

          {/* Filtro por encargado */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Select
              value={managerFilter}
              onChange={e => setManagerFilter(e.target.value)}
              aria-label={L.encargado}
              className="w-auto py-1.5 text-secondary"
            >
              <option value="all">Todos los {L.encargados.toLowerCase()} ({visiblePlayers.length})</option>
              {profiles.map((m) => {
                const count = visiblePlayers.filter((p) => p.managedBy.includes(m.id)).length;
                if (count === 0) return null;
                return <option key={m.id} value={m.id}>{m.avatar} {m.name.split(" ")[0]} ({count})</option>;
              })}
            </Select>
          </div>

          {/* Seleccionar todos */}
          {selectMode && (
            <div className="flex items-center gap-3 px-1">
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}
                icon={selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="text-blue-600" /> : <Square />}>
                {selected.size === filtered.length && filtered.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
              </Button>
              {selected.size > 0 && <span className="text-secondary text-slate-500">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>}
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
          <FilterCheck label="Con actividad" checked={activityFilter} onClick={() => setActivityFilter(v => !v)} />
          {(posFilters.length > 0 || yearFilters.length > 0 || activityFilter) && (
            <Button variant="ghost" size="sm" icon={<X />} onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false); }}>
              Limpiar
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-secondary text-slate-500">{filtered.length} jugador{filtered.length !== 1 ? "es" : ""}</span>
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5" role="group" aria-label="Vista">
            {([
              { id: 'grid' as const, Icon: LayoutGrid, label: 'Vista tarjetas' },
              { id: 'list' as const, Icon: LayoutList, label: 'Vista lista' },
              { id: 'table' as const, Icon: Table, label: 'Vista tabla' },
            ]).map(({ id, Icon, label }) => (
              <IconButton key={id} label={label} aria-pressed={playerView === id} onClick={() => setPlayerView(id)}
                className={cn('rounded', playerView === id ? 'bg-white shadow-sm text-slate-800 hover:bg-white' : 'text-slate-600 hover:text-slate-800')}>
                <Icon />
              </IconButton>
            ))}
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
                  {...rowProps(() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id))}
                  aria-pressed={selectMode ? isSelected : undefined}
                  className={cn(`bg-white border rounded-xl p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md relative ${
                    isSelected ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"
                  }`, ROW_FOCUS)}
                >
                  {selectMode && (
                    <div className="absolute top-3 right-3 z-10" aria-hidden="true">
                      {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                    </div>
                  )}
                  {isBday && <Cake className="absolute top-3 left-3 w-4 h-4 text-amber-600" aria-label="Cumpleaños" />}

                  {/* Tarea rápida */}
                  {!selectMode && onAddGeneralTask && (
                    <IconButton
                      label={`Nueva tarea rápida para ${player.name}`}
                      onClick={(e) => { e.stopPropagation(); setQuickTaskPlayer(player); }}
                      className="absolute top-1 right-1 sm:top-3 sm:right-3 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700"
                    >
                      <Zap />
                    </IconButton>
                  )}

                  <h3 className={`text-base sm:text-lg font-bold text-slate-900 truncate pr-8 ${isBday ? 'pl-6' : ''}`}>{player.name}</h3>
                  <p className="text-sm text-slate-600 truncate mt-0.5">
                    {player.positions[0]}{player.positions[1] ? ` / ${player.positions[1]}` : ''} · {clubsLabel(player.clubs)}
                  </p>
                  <p className="text-sm text-slate-500">{age} años · {player.nationality}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {currentProfile.is_admin && (
                      <div className={`rounded-lg px-2.5 py-1.5 ${repDaysLeft > 0 && repDaysLeft < 183 ? 'bg-red-50 border border-red-100' : repDaysLeft >= 183 && repDaysLeft < 365 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                        <p className="text-badge text-slate-500 uppercase tracking-wide">Repr.</p>
                        <p className={`text-xs font-semibold ${repDaysLeft > 0 && repDaysLeft < 183 ? 'text-red-600' : repDaysLeft >= 183 && repDaysLeft < 365 ? 'text-amber-600' : 'text-slate-700'}`}>{repEndStr}</p>
                      </div>
                    )}
                    <div className={`rounded-lg px-2.5 py-1.5 ${clubDaysLeft > 0 && clubDaysLeft < 183 ? 'bg-red-50 border border-red-100' : clubDaysLeft >= 183 && clubDaysLeft < 365 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <p className="text-badge text-slate-500 uppercase tracking-wide">{L.club}</p>
                      <p className={`text-xs font-semibold ${clubDaysLeft > 0 && clubDaysLeft < 183 ? 'text-red-600' : clubDaysLeft >= 183 && clubDaysLeft < 365 ? 'text-amber-600' : 'text-slate-700'}`}>{clubEndStr}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {managers.map(m => <Avatar key={m.id} text={m.avatar} title={`${L.encargado}: ${m.name}`} />)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {playerTasks.length > 0 && (
                        <Badge tone="primary" className="px-2.5 py-1 text-meta">
                          {playerTasks.length} tarea{playerTasks.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {urgent.length > 0 && (
                        <Badge tone="danger" className="px-2.5 py-1 text-meta">
                          {urgent.length} urg.
                        </Badge>
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
                <ClickableRow
                  key={player.id}
                  onClick={() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id)}
                  selected={isSelected}
                  className={cn("px-3 sm:px-4 py-3 rounded-none", idx > 0 && "border-t border-slate-100", isSelected && "bg-blue-50")}
                  actions={
                    <>
                      {urgent.length > 0 && <Badge tone="danger" title="Tareas urgentes"><Zap className="w-3 h-3" aria-hidden="true" />{urgent.length}</Badge>}
                      {playerTasks.length > 0 && <Badge tone="primary" title="Tareas abiertas">{playerTasks.length}</Badge>}
                      {!selectMode && onAddGeneralTask && (
                        <IconButton
                          label={`Nueva tarea rápida para ${player.name}`}
                          onClick={() => setQuickTaskPlayer(player)}
                          className="rounded-full bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700"
                        >
                          <Zap />
                        </IconButton>
                      )}
                      {selectMode && (
                        isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" aria-hidden="true" /> : <Square className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      )}
                    </>
                  }
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <Avatar text={player.name.split(" ").map(n => n[0]).join("").slice(0, 2)} className="w-8 h-8" />

                    {/* Nombre + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isBday && <Cake className="w-4 h-4 text-amber-600" aria-label="Cumpleaños" />}
                        <p className="text-body font-semibold text-slate-800 truncate">{player.name}</p>
                      </div>
                      <p className="text-secondary text-slate-500 truncate">
                        {player.positions[0]} · {clubsLabel(player.clubs)} · {age}a · {player.nationality}
                      </p>
                    </div>

                    {/* Contratos (ocultos en xs) */}
                    <div className="hidden sm:flex items-center gap-2">
                      {currentProfile.is_admin && (
                        <span className={`text-badge font-semibold px-1.5 py-0.5 rounded ${
                          repDaysLeft < 183 ? "bg-red-50 text-red-600" : repDaysLeft < 365 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                        }`}>R {player.representationContract.end ? new Date(player.representationContract.end).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : "—"}</span>
                      )}
                      <span className={`text-badge font-semibold px-1.5 py-0.5 rounded ${
                        clubDaysLeft < 183 ? "bg-red-50 text-red-600" : clubDaysLeft < 365 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                      }`}>C {player.clubContract.endDate ? new Date(player.clubContract.endDate).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : "—"}</span>
                    </div>

                    {/* Encargados */}
                    <div className="hidden sm:flex items-center gap-0.5">
                      {managers.slice(0, 2).map(m => <Avatar key={m.id} text={m.avatar} title={`${L.encargado}: ${m.name}`} />)}
                    </div>
                  </div>
                </ClickableRow>
              );
            })}
          </div>
        )}

        {/* ── TABLE VIEW ── */}
        {playerView === 'table' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-meta text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-semibold">{L.jugador}</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Posición</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Edad</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Nac.</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Club</th>
                  {currentProfile.is_admin && <th className="text-left px-3 py-2.5 font-semibold">Repr.</th>}
                  <th className="text-left px-3 py-2.5 font-semibold">Contrato</th>
                  <th className="text-left px-3 py-2.5 font-semibold">{L.encargado}</th>
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
                      {...rowProps(() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id))}
                      aria-selected={selectMode ? isSelected : undefined}
                      className={cn(`cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`, ROW_FOCUS, 'focus-visible:ring-inset')}
                    >
                      {/* Nombre */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar text={player.name.split(' ').map(n => n[0]).join('').slice(0, 2)} className="w-7 h-7" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              {isBday && <Cake className="w-3.5 h-3.5 text-amber-600" aria-label="Cumpleaños" />}
                              <span className="font-semibold text-slate-800 text-body truncate">{player.name}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Posición */}
                      <td className="px-3 py-2.5 text-secondary text-slate-600 whitespace-nowrap">
                        {player.positions[0]}{player.positions[1] ? <span className="text-slate-500"> / {player.positions[1]}</span> : ''}
                      </td>
                      {/* Edad */}
                      <td className="px-3 py-2.5 text-secondary text-slate-600 whitespace-nowrap">{age}a</td>
                      {/* Nacionalidad */}
                      <td className="px-3 py-2.5 text-secondary text-slate-500 whitespace-nowrap">{player.nationality || '—'}</td>
                      {/* Club */}
                      <td className="px-3 py-2.5 text-secondary text-slate-600 max-w-[140px] truncate">{clubsLabel(player.clubs)}</td>
                      {/* Repr contract */}
                      {currentProfile.is_admin && (
                        <td className="px-3 py-2.5">
                          <span className={`text-badge font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            repDaysLeft < 183 ? 'bg-red-50 text-red-600' : repDaysLeft < 365 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                          }`}>{repEndStr}</span>
                        </td>
                      )}
                      {/* Club contract */}
                      <td className="px-3 py-2.5">
                        <span className={`text-badge font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                          clubDaysLeft < 183 ? 'bg-red-50 text-red-600' : clubDaysLeft < 365 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                        }`}>{clubEndStr}</span>
                      </td>
                      {/* Managers */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {managers.map(m => <Avatar key={m.id} text={m.avatar} title={`${L.encargado}: ${m.name}`} />)}
                          {managers.length === 0 && <span className="text-slate-400 text-secondary">—</span>}
                        </div>
                      </td>
                      {/* Tasks */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {urgent.length > 0 && <Badge tone="danger" title="Tareas urgentes"><Zap className="w-3 h-3" aria-hidden="true" />{urgent.length}</Badge>}
                          {playerTasks.length > 0 && <Badge tone="primary" title="Tareas abiertas">{playerTasks.length}</Badge>}
                        </div>
                      </td>
                      {/* Select checkbox */}
                      {selectMode && (
                        <td className="px-3 py-2.5" aria-hidden="true">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
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
            <h2 className="text-base font-semibold text-slate-800">{L.equipo}</h2>
            <p className="text-secondary text-slate-500 mt-0.5">Carga y actividad de cada miembro · clic en una fila para ver el detalle</p>
          </div>

          {/* Week navigator (cached: no refetch al navegar) */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <IconButton label="Semana anterior" variant="secondary" size="md" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft /></IconButton>
              <Chip tone="neutral" active={weekOffset === 0} onClick={() => setWeekOffset(0)}>Esta semana</Chip>
              <IconButton label="Semana siguiente" variant="secondary" size="md" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight /></IconButton>
            </div>
            <p className="text-secondary font-medium text-slate-600">
              {weekMonday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              {' – '}
              {weekSunday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>

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
                ? <span className={`inline-block min-w-[26px] px-2 py-0.5 rounded-full text-badge font-semibold ${cls}`}>{n}</span>
                : <span className="text-slate-400 text-badge" aria-label="ninguna">—</span>;

            return (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-meta text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-semibold">{L.miembro}</th>
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
                          {...rowProps(() => onSelectProfile(p.id))}
                          className={cn("cursor-pointer hover:bg-slate-50 transition-colors", ROW_FOCUS, 'focus-visible:ring-inset')}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar text={p.avatar} className="w-8 h-8" />
                              <div className="min-w-0 flex-1">
                                <p className="text-body font-semibold text-slate-800 truncate">
                                  {p.name}{isMe && <span className="ml-1.5 text-meta font-medium text-slate-500">(tú)</span>}
                                </p>
                                <p className="text-meta text-slate-500">
                                  {noActivity ? 'Sin actividad' : openAsWatcher > 0 ? `${openAsWatcher} como ${L.seguidores.toLowerCase().slice(0, -2)}` : ' '}
                                </p>
                              </div>
                              {onToggleStatusHidden && (
                                <IconButton
                                  label={`Ocultar a ${p.name.split(' ')[0]} de las vistas de equipo`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    onToggleStatusHidden(p.id, true).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'));
                                  }}
                                  className="text-slate-600"
                                >
                                  <EyeOff />
                                </IconButton>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">{badge(open.length, 'bg-slate-100 text-slate-600')}</td>
                          <td className="px-2 py-2.5 text-center">{badge(dueWeek.length, 'bg-blue-50 text-blue-700')}</td>
                          <td className="px-2 py-2.5 text-center">
                            {overdue.length > 0
                              ? <span className="inline-flex items-center gap-1 min-w-[26px] px-2 py-0.5 rounded-full text-badge font-semibold bg-red-50 text-red-600 border border-red-200">
                                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />{overdue.length}
                                </span>
                              : <span className="text-slate-400 text-badge" aria-label="ninguna">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {completedWeek.length > 0
                              ? <span className="inline-flex items-center gap-1 min-w-[26px] px-2 py-0.5 rounded-full text-badge font-semibold bg-emerald-50 text-emerald-700"><Check className="w-3 h-3" aria-hidden="true" />{completedWeek.length}</span>
                              : <span className="text-slate-400 text-badge" aria-label="ninguna">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {loadingTeamActivities
                              ? <span className="text-slate-400 text-badge">…</span>
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
                              <span className={`text-badge w-6 text-right tabular-nums flex-shrink-0 ${
                                sparkTotal > 0 ? 'font-semibold text-slate-600' : 'text-slate-400'
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
              <EyeOff className="w-3 h-3 text-slate-500 flex-shrink-0" aria-hidden="true" />
              <span className="text-meta text-slate-500">Ocultos:</span>
              {hiddenStatusProfiles.map(p => (
                <Chip
                  key={p.id}
                  tone="neutral"
                  onClick={() => onToggleStatusHidden(p.id, false).catch(() => showToast('No se pudo guardar. Inténtalo de nuevo.', 'error'))}
                  title="Volver a mostrar en las vistas de equipo"
                >
                  {p.name.split(' ')[0]} · Mostrar
                </Chip>
              ))}
            </div>
          )}

          {/* Glosario de métricas */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-1 text-meta text-slate-500">
            <span><b className="font-semibold text-slate-600">Carga abierta</b> = pendientes + en progreso, con o sin fecha (incl. seguidor)</span>
            <span><b className="font-semibold text-slate-600">Esta semana</b> = abiertas con vencimiento en la semana visible</span>
            <span><b className="font-semibold text-slate-600">Completadas / Eventos</b> = en la semana visible</span>
            <span><b className="font-semibold text-slate-600">Actividad</b> = completadas + eventos por semana (4 últimas, barra azul = semana visible, número = total) · misma escala para todo el equipo · pasa el ratón por una barra para el detalle</span>
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-12 text-body text-slate-500">No hay miembros del equipo</div>
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
            if (!t) return <Badge>sin tarea</Badge>;
            if (t.status === 'completada') return <Badge tone="success"><Check className="w-3 h-3" aria-hidden="true" /> Completado</Badge>;
            if (t.status === 'en_progreso') return <Badge tone="primary">{TASK_STATUS_LABELS.en_progreso}</Badge>;
            return <Badge tone="warning">{TASK_STATUS_LABELS.pendiente}</Badge>;
          };
          return (<>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Postpartidos</h2>
                <p className="text-secondary text-slate-500 mt-0.5">
                  Informes postpartido pendientes · cada uno genera una tarea al {L.responsable.toLowerCase()} y queda ligado al jugador y al partido
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone="neutral" active={ppShowDone} onClick={() => setPpShowDone(v => !v)}>
                  {ppShowDone ? 'Ocultar completados' : `Ver completados (${done.length})`}
                </Chip>
                {onCreatePostpartido && onAddGeneralTask && (
                  <Button variant="primary" icon={<Plus />} onClick={openAddPostpartido}>Nuevo postpartido</Button>
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
                        <p className={`text-body font-medium truncate ${isDone ? 'text-emerald-800' : 'text-slate-800'}`}>
                          {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Partido eliminado'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-meta text-slate-500">
                          {match && (
                            <span>{new Date(match.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                          )}
                          {match?.competition && <span>· {match.competition}</span>}
                          {pp.notes && <span className="italic truncate">· {pp.notes}</span>}
                          {pp.videoUrl && (
                            <a
                              href={pp.videoUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 hover:underline font-medium min-h-7"
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden="true" /> Ver vídeo
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Jugador */}
                      {player ? (
                        <Chip tone="neutral" onClick={() => onSelectPlayer(player.id)} title="Ver ficha del jugador" className="flex-shrink-0">
                          {player.name}
                        </Chip>
                      ) : (
                        <Badge tone="warning" className="flex-shrink-0" title="Jugador externo">{pp.playerName ?? '—'}</Badge>
                      )}
                      {/* Responsable — nombre completo visible */}
                      <div className="flex-shrink-0 flex items-center gap-1.5" title={`${L.responsable}: ${assignee?.name ?? L.sinResponsable}`}>
                        <Avatar text={assignee?.avatar ?? '?'} />
                        <span className="hidden sm:inline text-secondary font-semibold text-slate-700 whitespace-nowrap">
                          {assignee?.name ?? L.sinResponsable}
                        </span>
                      </div>
                      {/* Estado + fecha */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {statusBadge(task)}
                        {task?.dueDate && !isDone && (
                          <span className={`text-meta inline-flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                            {parseDia(task.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            {isOverdue && <AlertTriangle className="w-3 h-3" aria-label="Vencido" />}
                          </span>
                        )}
                      </div>
                      {/* Acciones */}
                      {task && !isDone && onUpdateTask && onUpdatePostpartido && (
                        <IconButton
                          label="Completar (pide el link del vídeo)"
                          onClick={() => { setPpVideoUrl(pp.videoUrl ?? ''); setPpCompleteTarget({ pp, task }); }}
                          className="rounded-full text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckSquare />
                        </IconButton>
                      )}
                      {task && isDone && onUpdateTask && (
                        <IconButton
                          label="Desmarcar (volver a pendiente)"
                          className="rounded-full text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={async () => {
                            try {
                              await Promise.resolve(onUpdateTask({ ...task, status: 'pendiente' }));
                              showToast('Postpartido reabierto (vuelve a pendiente)', 'info');
                            } catch {
                              showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
                            }
                          }}
                        >
                          <RotateCcw />
                        </IconButton>
                      )}
                      {onDeletePostpartido && (
                        <IconButton
                          label="Eliminar postpartido (y su tarea)"
                          onClick={() => setPpDeleteConfirm(pp)}
                          className="rounded-full text-slate-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>);
        })()}
      </div>

      {/* Bulk action toolbar */}
      {selectMode && selected.size > 0 && (
        // Por encima de la BottomNav en móvil
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] sm:bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg" role="region" aria-label="Acciones masivas">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-body font-medium text-slate-700">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              {onBulkAssignManager && (
                <Button variant="primary" icon={<UserPlus />} onClick={() => setShowAssignModal(true)} disabled={bulkLoading}>
                  Asignar {L.encargado.toLowerCase()}
                </Button>
              )}
              {onBulkDelete && (
                <Button variant="danger" icon={<Trash2 />} onClick={handleBulkDelete} loading={bulkLoading}>
                  {bulkLoading ? "Borrando…" : "Borrar"}
                </Button>
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
        <AddGeneralTaskModal profiles={profiles} players={players} currentProfileId={currentProfile.id}
          onClose={() => setShowAddGeneralTask(false)}
          onAdd={async (t) => {
            try {
              await Promise.resolve(onAddGeneralTask(t));
              setShowAddGeneralTask(false);
              showToast("Tarea creada", "success");
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

      {/* ── Modal: nuevo evento de actividad ── */}
      <Dialog
        open={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        title="Nuevo evento de actividad"
        historyKey="dash-evento"
        dirty={!!(evtPlayer || evtNotes.trim() || evtExtraPlayers.length || evtParticipants.length)}
        onSubmit={e => { e.preventDefault(); void handleSaveEvent(); }}
        footer={
          <>
            <Button onClick={() => setShowAddEvent(false)}>{L.cancelar}</Button>
            <Button
              type="submit"
              variant="primary"
              loading={evtSaving}
              disabled={!evtPlayer || !evtDate || (evtType === 'custom' && !evtCustomType.trim())}
            >
              {evtSaving ? 'Guardando…' : 'Guardar evento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Jugador — combobox */}
          {(() => {
            const selectedPlayer = players.find(p => p.id === evtPlayer);
            const filteredEvtPlayers = [...players]
              .filter(p => p.name.toLowerCase().includes(evtPlayerQ.toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name));
            const showEvtDrop = evtPlayerQ.length > 0 && filteredEvtPlayers.length > 0 && !selectedPlayer;
            return (
              <Field label={L.jugador} required>
                {(fp) => selectedPlayer ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 rounded-lg bg-blue-50">
                    <span className="flex-1 text-body font-medium text-slate-800">{selectedPlayer.name}</span>
                    <IconButton label="Quitar jugador" onClick={() => { setEvtPlayer(""); setEvtPlayerQ(""); }} className="-my-2 -mr-2"><X /></IconButton>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      {...fp}
                      type="text"
                      value={evtPlayerQ}
                      onChange={e => setEvtPlayerQ(e.target.value)}
                      placeholder="Buscar jugador…"
                      autoComplete="off"
                    />
                    {showEvtDrop && (
                      <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto" role="listbox">
                        {filteredEvtPlayers.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onMouseDown={e => {
                              e.preventDefault();
                              setEvtPlayer(p.id);
                              setEvtPlayerQ("");
                            }}
                            className="w-full text-left flex items-center justify-between px-3 py-2 min-h-11 sm:min-h-0 text-body text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <span>{p.name}</span>
                            <span className="text-secondary text-slate-500">{calcAge(p.birthDate)} años</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Field>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              <Input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)} required />
            </Field>
            <Field label="Tipo" required>
              <Select value={evtType} onChange={e => setEvtType(e.target.value)}>
                {ACTIVITY_TYPES_DASH.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="custom">Personalizado…</option>
              </Select>
            </Field>
          </div>

          {evtType === 'custom' && (
            <Field label="Tipo personalizado" required>
              <Input type="text" value={evtCustomType} onChange={e => setEvtCustomType(e.target.value)}
                placeholder="Ej: Reunión con padre, Contrato preliminar…" />
            </Field>
          )}

          <Field label="Notas" hint="Opcional · Ctrl/⌘+Enter guarda">
            <Textarea value={evtNotes} onChange={e => setEvtNotes(e.target.value)} placeholder="Detalles del evento…" rows={3} />
          </Field>

          {/* Jugadores adicionales — combobox */}
          {(() => {
            const availablePlayers = [...players]
              .filter(p => p.id !== evtPlayer && !evtExtraPlayers.includes(p.id))
              .filter(p => p.name.toLowerCase().includes(evtExtraPlayerQ.toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name));
            const showDrop = evtExtraPlayerQ.length > 0 && availablePlayers.length > 0;
            return (
              <Field label="Jugadores adicionales" hint="Opcional: el evento se registra también en su ficha">
                {(fp) => (
                  <div className="space-y-2">
                    {evtExtraPlayers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {evtExtraPlayers.map(pid => {
                          const pl = players.find(p => p.id === pid);
                          if (!pl) return null;
                          return (
                            <Chip key={pid} tone="success" active onRemove={() => setEvtExtraPlayers(prev => prev.filter(id => id !== pid))}>
                              {pl.name}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                    <div className="relative">
                      <Input
                        {...fp}
                        type="text"
                        value={evtExtraPlayerQ}
                        onChange={e => setEvtExtraPlayerQ(e.target.value)}
                        placeholder="Buscar jugador…"
                        autoComplete="off"
                      />
                      {showDrop && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-40 overflow-y-auto" role="listbox">
                          {availablePlayers.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onMouseDown={e => {
                                e.preventDefault();
                                setEvtExtraPlayers(prev => [...prev, p.id]);
                                setEvtExtraPlayerQ('');
                              }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 min-h-11 sm:min-h-0 text-body text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              {p.name}
                              <span className="ml-auto text-secondary text-slate-500">{calcAge(p.birthDate)} años</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Field>
            );
          })()}

          {/* Compañeros presentes — combobox */}
          {(() => {
            const otherProfiles = profiles.filter(p => p.id !== currentProfile.id);
            const filteredProfiles = otherProfiles.filter(p =>
              !evtParticipants.includes(p.id) &&
              p.name.toLowerCase().includes(evtParticipantQ.toLowerCase())
            );
            const showDropdown = evtParticipantQ.length > 0 && filteredProfiles.length > 0;
            return (
              <Field label="También estaba…" hint="Opcional: compañeros del equipo presentes">
                {(fp) => (
                  <div className="space-y-2">
                    {evtParticipants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {evtParticipants.map(pid => {
                          const prof = profiles.find(p => p.id === pid);
                          if (!prof) return null;
                          return (
                            <Chip key={pid} active onRemove={() => setEvtParticipants(prev => prev.filter(id => id !== pid))}>
                              {prof.name.split(' ')[0]}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                    <div className="relative">
                      <Input
                        {...fp}
                        type="text"
                        value={evtParticipantQ}
                        onChange={e => setEvtParticipantQ(e.target.value)}
                        placeholder="Buscar compañero…"
                        autoComplete="off"
                      />
                      {showDropdown && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-40 overflow-y-auto" role="listbox">
                          {filteredProfiles.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onMouseDown={e => { e.preventDefault(); setEvtParticipants(prev => [...prev, p.id]); setEvtParticipantQ(''); }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 min-h-11 sm:min-h-0 text-body text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Avatar text={p.avatar} />
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Field>
            );
          })()}
        </div>
      </Dialog>

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          player={players.find((p) => p.id === detailTask.playerId)}
          players={players}
          profiles={profiles}
          currentProfile={currentProfile}
          onGoToPlayer={onSelectPlayer}
          onClose={() => setDetailTask(null)}
          onUpdate={async (updated) => {
            try {
              // Un único handler: ambos props apuntan al mismo updater en App;
              // llamar a los dos provocaba una doble escritura en la BD.
              const update = onUpdateTask ?? onUpdateGeneralTask;
              if (update) await Promise.resolve(update(updated));
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

      {/* ── Modal Nuevo postpartido ── */}
      {onCreatePostpartido && onAddGeneralTask && (
        <Dialog
          open={showAddPostpartido}
          onClose={() => setShowAddPostpartido(false)}
          title="Nuevo postpartido"
          description={`Genera una tarea al ${L.responsable.toLowerCase()} y queda ligado al jugador y al partido.`}
          historyKey="dash-postpartido"
          dirty={!!(ppMatchId || ppPlayerId || ppNotes.trim() || ppNewMatch.home || ppNewMatch.away)}
          onSubmit={e => { e.preventDefault(); void createPostpartido(); }}
          footer={
            <>
              <Button onClick={() => setShowAddPostpartido(false)}>{L.cancelar}</Button>
              <Button type="submit" variant="primary" loading={ppSaving}>{ppSaving ? 'Creando…' : 'Crear postpartido'}</Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Partido */}
            <Field label={<span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5" aria-hidden="true" /> {L.partido}</span>} required>
              <Select value={ppMatchId} onChange={e => setPpMatchId(e.target.value)}>
                <option value="">— Elige un partido —</option>
                {[...scoutingMatches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map(m => (
                  <option key={m.id} value={m.id}>
                    {new Date(m.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {m.homeTeam} vs {m.awayTeam}{m.competition ? ` (${m.competition})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {!ppNewMatchOpen ? (
              <Button variant="link" size="sm" icon={<Plus />} onClick={() => setPpNewMatchOpen(true)} className="-mt-2">
                El partido no está — añadirlo nuevo
              </Button>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-meta text-slate-500">Se añadirá también a {L.captacion} → {L.partidos}.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fecha" required>
                    <Input type="date" value={ppNewMatch.date} onChange={e => setPpNewMatch(f => ({ ...f, date: e.target.value }))} />
                  </Field>
                  <Field label="Competición">
                    <Input placeholder="Opcional" value={ppNewMatch.competition} onChange={e => setPpNewMatch(f => ({ ...f, competition: e.target.value }))} />
                  </Field>
                  <Field label="Local" required>
                    <Input value={ppNewMatch.home} onChange={e => setPpNewMatch(f => ({ ...f, home: e.target.value }))} />
                  </Field>
                  <Field label="Visitante" required>
                    <Input value={ppNewMatch.away} onChange={e => setPpNewMatch(f => ({ ...f, away: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPpNewMatchOpen(false)}>{L.cancelar}</Button>
                  <Button size="sm" variant="primary" loading={ppCreatingMatch} onClick={() => void createMatchInline()}>
                    {ppCreatingMatch ? 'Creando…' : 'Crear partido'}
                  </Button>
                </div>
              </div>
            )}
            {/* Jugador */}
            <Field label={<span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" /> {L.jugador}</span>} required>
              <Select value={ppPlayerId} onChange={e => setPpPlayerId(e.target.value)}>
                <option value="">— Elige un jugador —</option>
                {players.filter(p => !p.hiddenFromManagement).sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__otro__">Otro (texto libre)…</option>
              </Select>
            </Field>
            {ppPlayerId === '__otro__' && (
              <Field label="Nombre del jugador" required>
                <Input autoFocus value={ppPlayerName} onChange={e => setPpPlayerName(e.target.value)} placeholder="Nombre del jugador" />
              </Field>
            )}
            {/* Responsable */}
            <Field label={<span className="inline-flex items-center gap-1"><PenLine className="w-3.5 h-3.5" aria-hidden="true" /> {L.responsable}</span>} hint="Le aparece como tarea" required>
              <Select value={ppAssigneeId} onChange={e => setPpAssigneeId(e.target.value)}>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.avatar} {p.name.split(' ')[0]}</option>
                ))}
              </Select>
            </Field>
            {/* Fecha límite + notas */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha límite" hint="Opcional">
                <Input type="date" value={ppDue} onChange={e => setPpDue(e.target.value)} />
              </Field>
              <Field label="Notas" hint="Opcional">
                <Input value={ppNotes} onChange={e => setPpNotes(e.target.value)} placeholder="Ej. «Centrarse en fase defensiva»" />
              </Field>
            </div>
          </div>
        </Dialog>
      )}

      {/* Completar postpartido — exige link del vídeo */}
      <Dialog
        open={!!ppCompleteTarget}
        onClose={() => setPpCompleteTarget(null)}
        title="Completar postpartido"
        size="sm"
        historyKey="dash-pp-completar"
        onSubmit={e => { e.preventDefault(); void completePostpartido(); }}
        footer={
          <>
            <Button onClick={() => setPpCompleteTarget(null)}>{L.cancelar}</Button>
            <Button type="submit" variant="primary" icon={<Check />} loading={ppCompleting} disabled={!ppVideoUrl.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:hover:bg-emerald-600">
              {ppCompleting ? 'Guardando…' : 'Completar'}
            </Button>
          </>
        }
      >
        <Field
          label={<span className="inline-flex items-center gap-1"><Film className="w-3.5 h-3.5" aria-hidden="true" /> Link del vídeo</span>}
          required
          hint="El link quedará visible en la lista y en la ficha del jugador (Rendimiento → Postpartidos)."
        >
          <Input
            autoFocus
            type="url"
            inputMode="url"
            value={ppVideoUrl}
            onChange={e => setPpVideoUrl(e.target.value)}
            placeholder="https://streamable.com/…"
          />
        </Field>
      </Dialog>

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
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn("flex items-center gap-1.5 px-3 min-h-9 sm:min-h-8 text-secondary font-medium rounded-lg border border-slate-300 bg-white hover:border-slate-400 transition-colors text-slate-700", ROW_FOCUS)}
    >
      <span aria-hidden="true" className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-400'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      {label}
    </button>
  )
}

/* ── MultiSelectFilter: desplegable con checkboxes ── */
function MultiSelectFilter({ label, options, selected, onChange, optionLabel }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  optionLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const isActive = selected.length > 0;
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);

  // Cierra con Escape y al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <Chip active={isActive} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true"
        icon={<ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />}>
        {label}{isActive ? ` (${selected.length})` : ''}
      </Chip>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1 max-h-60 overflow-y-auto" role="group" aria-label={label}>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 min-h-11 sm:min-h-9 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-4 h-4 rounded"
              />
              <span className="text-body text-slate-700">{optionLabel ? optionLabel(opt) : opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIO_COLOR = (t: Task) =>
  t.priority === "alta" ? "#E24B4A" :
  t.priority === "media" ? "#EF9F27" : "#94a3b8";

/** Fecha de vencimiento con aviso si está vencida */
function DueDate({ dueDate, overdue, className }: { dueDate: string; overdue: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-meta', overdue ? 'text-red-600 font-medium' : 'text-slate-500', className)}>
      {parseDia(dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
      {overdue && <AlertTriangle className="w-3 h-3" aria-label="Vencida" />}
    </span>
  );
}

/* ── TaskListRow: fila de tarea en las vistas de lista ── */
function TaskListRow({
  task, players, profiles, onCycleStatus, onOpenDetail, detailTaskId,
  overdue = false, dimmed = false,
}: {
  task: Task; players: Player[]; profiles: Profile[];
  onCycleStatus: (t: Task) => void; onOpenDetail: (t: Task) => void;
  detailTaskId?: string; overdue?: boolean; dimmed?: boolean;
}) {
  const player   = players.find(p => p.id === task.playerId && task.playerId !== "general" && task.playerId !== "");
  const assignee = profiles.find(m => m.id === task.assigneeId);
  const isSelected = detailTaskId === task.id;
  const prioBorder = PRIO_COLOR(task);

  return (
    <ClickableRow
      onClick={() => onOpenDetail(task)}
      selected={isSelected}
      className={cn(
        "p-3 rounded-xl border transition-all hover:shadow-sm",
        isSelected ? "border-blue-400 ring-1 ring-blue-200 bg-blue-50/30" :
        overdue    ? "border-red-200 bg-red-50/20" :
        dimmed     ? "border-slate-100 opacity-50 bg-white" :
                    "border-slate-200 hover:border-slate-300 bg-white",
      )}
      style={{ borderLeftWidth: "3px", borderLeftColor: dimmed ? "#e2e8f0" : prioBorder }}
      actions={
        <>
          {assignee && <Avatar text={assignee.avatar} title={`${L.responsable}: ${assignee.name}`} />}
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
        </>
      }
    >
      <div className="flex items-center gap-3">
        <StatusDot task={task} color={prioBorder} onCycle={onCycleStatus} />
        <div className="flex-1 min-w-0">
          <p className={`text-body font-medium leading-tight ${dimmed ? "line-through text-slate-500" : "text-slate-800"}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {player && <span className="text-secondary text-slate-500 truncate">{player.name}</span>}
            {task.label && <Badge pill={false}>{task.label}</Badge>}
            {task.dueDate && <DueDate dueDate={task.dueDate} overdue={overdue} />}
          </div>
        </div>
      </div>
    </ClickableRow>
  );
}

/* ── ViewModeToggle: kanban / compacto / tabla / semana ── */
function ViewModeToggle({ mode, onChange }: {
  mode: 'kanban' | 'compact' | 'table' | 'semana';
  onChange: (m: 'kanban' | 'compact' | 'table' | 'semana') => void;
}) {
  const options = [
    { m: 'kanban' as const, Icon: LayoutGrid, label: 'Kanban' },
    { m: 'compact' as const, Icon: LayoutList, label: 'Compacto' },
    { m: 'table' as const, Icon: Table, label: 'Tabla' },
    { m: 'semana' as const, Icon: Calendar, label: 'Semana' },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 flex-shrink-0" role="group" aria-label="Vista del tablero">
      {options.map(({ m, Icon, label }) => (
        <IconButton
          key={m}
          label={`Vista ${label}`}
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={cn('rounded', mode === m ? 'bg-white text-slate-800 shadow-sm hover:bg-white' : 'text-slate-600 hover:text-slate-800')}
        >
          <Icon />
        </IconButton>
      ))}
    </div>
  );
}

/* ── CompactTaskList: lista densa agrupada por estado ── */
function CompactTaskList({ tasks, completedTasks, players, profiles, onCycleStatus, onOpenDetail, detailTaskId, showCompleted, onToggleCompleted }: {
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
    : PRIO_COLOR(t);

  const renderRow = (t: Task) => {
    const player   = players.find(p => p.id === t.playerId);
    const assignee = profiles.find(m => m.id === t.assigneeId);
    const isOverdue = esVencida(t.dueDate, hoy) && t.status !== 'completada';
    const isSelected = detailTaskId === t.id;
    const isDone = t.status === 'completada';
    return (
      <div
        key={t.id}
        {...rowProps(() => onOpenDetail(t))}
        className={cn(`flex items-center gap-2 px-3 py-2 min-h-11 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-blue-50' : ''}`, ROW_FOCUS, 'focus-visible:ring-inset')}
      >
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: prioBorderColor(t) }} aria-hidden="true" />
        <StatusDot task={t} color={prioBorderColor(t)} onCycle={onCycleStatus} className="-ml-1" />
        <div className="flex-1 min-w-0">
          <p className={`text-body font-medium truncate ${isDone ? 'line-through text-slate-500' : 'text-slate-800'}`}>{t.title}</p>
          {player && <p className="text-meta text-slate-500 truncate">{player.name}</p>}
        </div>
        {assignee && <Avatar text={assignee.avatar} title={`${L.responsable}: ${assignee.name}`} />}
        {t.dueDate && <DueDate dueDate={t.dueDate} overdue={isOverdue} className="flex-shrink-0" />}
      </div>
    );
  };

  const pending    = tasks.filter(t => t.status === 'pendiente');
  const inProgress = tasks.filter(t => t.status === 'en_progreso');

  const groupHeader = (color: string, label: string, count: number, extra?: React.ReactNode) => (
    <div className="px-3 py-1.5 flex items-center gap-2 bg-slate-50 border-b border-slate-100">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden="true" />
      <span className="text-badge font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      <span className="text-meta text-slate-500 ml-auto">{count}</span>
      {extra}
    </div>
  );

  return (
    <div>
      {pending.length > 0 && <>{groupHeader('#94a3b8', TASK_STATUS_LABELS.pendiente, pending.length)}{pending.map(renderRow)}</>}
      {inProgress.length > 0 && <>{groupHeader('#3b82f6', TASK_STATUS_LABELS.en_progreso, inProgress.length)}{inProgress.map(renderRow)}</>}
      {groupHeader('#10b981', TASK_STATUS_LABELS.completada, completedTasks.length,
        <Button variant="ghost" size="sm" onClick={onToggleCompleted} aria-expanded={showCompleted} className="h-7 px-2 text-meta">
          {showCompleted ? 'Ocultar' : 'Ver'} <ChevronDown className={`w-3 h-3 transition-transform ${showCompleted ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
      )}
      {showCompleted && completedTasks.map(renderRow)}
    </div>
  );
}

/* ── TaskTableView: tabla ordenable ── */
type TaskSortCol = 'title' | 'player' | 'priority' | 'dueDate' | 'status';

// Flecha de orden de la tabla de tareas (a nivel de módulo: no se recrea en cada render)
function SortIndicator({ col, sortCol, sortDir }: { col: TaskSortCol; sortCol: TaskSortCol; sortDir: 'asc' | 'desc' }) {
  if (col !== sortCol) return <ChevronDown className="w-3 h-3 opacity-25 inline-block ml-0.5" aria-hidden="true" />;
  return sortDir === 'asc'
    ? <ChevronDown className="w-3 h-3 text-blue-600 inline-block ml-0.5" aria-hidden="true" />
    : <ChevronDown className="w-3 h-3 text-blue-600 inline-block ml-0.5 rotate-180" aria-hidden="true" />;
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

  const thCls = "px-3 py-2 text-left text-meta font-semibold text-slate-600 uppercase tracking-wide select-none whitespace-nowrap";
  const thBtn = cn("inline-flex items-center hover:text-slate-900 rounded", ROW_FOCUS);
  const ariaSort = (col: TaskSortCol) => (col === sortCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') as 'ascending' | 'descending' | 'none';

  const prioTone = (p: Task['priority']) => p === 'alta' ? 'danger' : p === 'media' ? 'warning' : 'neutral';
  const statusTone = (s: Task['status']) => s === 'completada' ? 'success' : s === 'en_progreso' ? 'primary' : 'neutral';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-secondary border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {onCycleStatus && <th style={{ width: '40px' }} aria-label={L.estado} />}
            <th className={thCls} style={{ width: '34%' }} aria-sort={ariaSort('title')}><button type="button" className={thBtn} onClick={() => onSort('title')}>{L.tarea}<SortIndicator col="title" sortCol={sortCol} sortDir={sortDir} /></button></th>
            <th className={thCls} style={{ width: '16%' }} aria-sort={ariaSort('player')}><button type="button" className={thBtn} onClick={() => onSort('player')}>{L.jugador}<SortIndicator col="player" sortCol={sortCol} sortDir={sortDir} /></button></th>
            <th className={thCls} style={{ width: '13%' }}>{L.responsable}</th>
            <th className={thCls} style={{ width: '10%' }} aria-sort={ariaSort('priority')}><button type="button" className={thBtn} onClick={() => onSort('priority')}>{L.prioridad}<SortIndicator col="priority" sortCol={sortCol} sortDir={sortDir} /></button></th>
            <th className={thCls} style={{ width: '11%' }} aria-sort={ariaSort('dueDate')}><button type="button" className={thBtn} onClick={() => onSort('dueDate')}>Fecha<SortIndicator col="dueDate" sortCol={sortCol} sortDir={sortDir} /></button></th>
            <th className={thCls} style={{ width: '16%' }} aria-sort={ariaSort('status')}><button type="button" className={thBtn} onClick={() => onSort('status')}>{L.estado}<SortIndicator col="status" sortCol={sortCol} sortDir={sortDir} /></button></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={onCycleStatus ? 7 : 6} className="py-8 text-center text-body text-slate-500">Sin tareas</td></tr>
          )}
          {sorted.map((t, i) => {
            const player   = players.find(p => p.id === t.playerId);
            const assignee = profiles.find(m => m.id === t.assigneeId);
            const isOverdue = esVencida(t.dueDate, hoy) && t.status !== 'completada';
            const isSelected = detailTaskId === t.id;
            return (
              <tr
                key={t.id}
                {...rowProps(() => onOpenDetail(t))}
                className={cn(`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : i % 2 === 1 ? 'bg-slate-50/40' : ''}`, ROW_FOCUS, 'focus-visible:ring-inset')}
              >
                {onCycleStatus && (
                  <td className="pl-3 py-2">
                    <StatusDot task={t} color="#94a3b8" onCycle={onCycleStatus} className="-ml-1" />
                  </td>
                )}
                <td className="px-3 py-2">
                  <p className={`text-body font-medium truncate ${t.status === 'completada' ? 'line-through text-slate-500' : 'text-slate-800'}`}>{t.title}</p>
                </td>
                <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{player?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  {assignee && (
                    <div className="flex items-center gap-1.5">
                      <Avatar text={assignee.avatar} />
                      <span className="text-slate-700 truncate">{assignee.name.split(' ')[0]}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.priority && <Badge tone={prioTone(t.priority)} pill={false}>{labelDe(PRIORITY_LABELS, t.priority)}</Badge>}
                </td>
                <td className="px-3 py-2 font-medium">
                  {t.dueDate ? <DueDate dueDate={t.dueDate} overdue={isOverdue} className="text-secondary" /> : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={statusTone(t.status)} pill={false}>{labelDe(TASK_STATUS_LABELS, t.status)}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── KanbanCol: columna del kanban de inicio ── */
function KanbanCol({
  label, dotColor, tasks, players, profiles,
  onCycleStatus, onOpenDetail, detailTaskId,
  showCompleted, onToggleCompleted, completedCount = 0, completedTasks = [],
  isCompletedCol = false,
}: {
  label: string;
  dotColor: string;
  tasks: Task[];
  players: Player[];
  profiles: Profile[];
  onCycleStatus: (t: Task) => void;
  onOpenDetail: (t: Task) => void;
  detailTaskId?: string;
  showCompleted?: boolean;
  onToggleCompleted?: () => void;
  completedCount?: number;
  completedTasks?: Task[];
  isCompletedCol?: boolean;
}) {
  const hoy = hoyISO();

  const renderTask = (task: Task, dimmed = false) => {
    const player   = players.find(p => p.id === task.playerId);
    const assignee = profiles.find(m => m.id === task.assigneeId);
    // new Date('AAAA-MM-DD') es medianoche UTC: la tarea que vence hoy salía vencida
    const isOverdue = !dimmed && esVencida(task.dueDate, hoy) && task.status !== "completada";
    const isSelected = detailTaskId === task.id;

    return (
      <div
        key={task.id}
        {...rowProps(() => onOpenDetail(task))}
        className={cn(`bg-white rounded-xl border cursor-pointer transition-all hover:shadow-sm mb-2 overflow-hidden ${
          isSelected ? "border-blue-400 ring-1 ring-blue-200" :
          isOverdue   ? "border-red-200" :
          dimmed      ? "border-slate-100 opacity-60" :
          "border-slate-200 hover:border-slate-300"
        }`, ROW_FOCUS)}
        style={{ borderLeftWidth: "3px", borderLeftColor: dimmed ? "#e2e8f0" : PRIO_COLOR(task) }}
      >
        <div className="p-2.5">
          <div className="flex items-start gap-2">
            <StatusDot task={task} color={PRIO_COLOR(task)} onCycle={onCycleStatus} className="sm:mt-0.5 sm:h-5 sm:w-5 -my-2 -ml-2" />
            <div className="flex-1 min-w-0">
              <p className={`text-body font-medium leading-snug ${dimmed ? "line-through text-slate-500" : "text-slate-800"}`}>
                {task.title}
              </p>
              {player && (
                <p className="text-meta text-slate-500 mt-0.5 truncate">{player.name}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {assignee && (
                  <span className="inline-flex items-center gap-1 text-meta text-slate-500">
                    <Avatar text={assignee.avatar} />
                    {assignee.name.split(" ")[0]}
                  </span>
                )}
                {task.dueDate && <DueDate dueDate={task.dueDate} overdue={isOverdue} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} aria-hidden="true" />
        <p className="text-badge font-semibold uppercase tracking-wider text-slate-600">{label}</p>
        <Badge>{isCompletedCol ? completedCount : tasks.length}</Badge>
      </div>

      {isCompletedCol ? (
        <div>
          {/* «Ver todas» debe enseñar todas: antes se quedaba en 5 */}
          {(showCompleted ? completedTasks : completedTasks.slice(0, 2)).map(t => renderTask(t, true))}
          {completedCount > 2 && onToggleCompleted && (
            <Button variant="ghost" size="sm" onClick={onToggleCompleted} aria-expanded={showCompleted} className="px-1 text-meta"
              icon={<ChevronRight className={`transition-transform ${showCompleted ? "rotate-90" : ""}`} />}>
              {showCompleted ? "Ocultar" : `Ver todas (${completedCount})`}
            </Button>
          )}
          {completedCount === 0 && (
            <p className="text-meta text-slate-500 italic py-2">Sin completadas</p>
          )}
        </div>
      ) : (
        <div>
          {tasks.map(t => renderTask(t))}
          {tasks.length === 0 && (
            <p className="text-meta text-slate-500 italic py-2">Sin tareas</p>
          )}
        </div>
      )}
    </div>
  );
}


function AssignManagerModal({ profiles, count, loading, onClose, onAssign }: {
  profiles: Profile[]; count: number; loading: boolean;
  onClose: () => void; onAssign: (managerId: string) => void;
}) {
  const [managerId, setManagerId] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Asignar ${L.encargado.toLowerCase()} a ${count} jugador${count > 1 ? "es" : ""}`}
      size="sm"
      historyKey="dash-asignar-encargado"
      onSubmit={e => { e.preventDefault(); if (managerId) onAssign(managerId); }}
      footer={
        <>
          <Button onClick={onClose}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!managerId}>{loading ? "Asignando…" : "Asignar"}</Button>
        </>
      }
    >
      <Field label={`Selecciona un ${L.encargado.toLowerCase()}`} required>
        <Select value={managerId} onChange={(e) => setManagerId(e.target.value)} autoFocus>
          <option value="">— Elige {L.encargado.toLowerCase()} —</option>
          {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
        </Select>
      </Field>
    </Dialog>
  );
}

/** Título de sección dentro del formulario de nuevo jugador */
function Seccion({ titulo }: { titulo: string }) {
  return <p className="text-badge font-semibold text-slate-600 uppercase tracking-wide pt-2 border-t border-slate-100">{titulo}</p>;
}

function AddPlayerModal({ profiles, onClose, onAdd }: {
  profiles: Profile[]; onClose: () => void; onAdd: (player: Player) => void;
}) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pos1, setPos1] = useState("");
  const [pos2, setPos2] = useState("");
  const [nationality, setNationality] = useState("");
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
  const dirty = !!(name || birthDate || pos1 || nationality || club1 || club2);

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
      nationality, photo: "", clubs,
      managedBy: [managed1, managed2].filter(Boolean),
      representationContract: { start: reprStart, end: reprEnd },
      clubContract: { endDate: clubEnd, optionalYears: optYears ? parseInt(optYears) : undefined },
      contractHistory: [], clubInterests: [], matchReports: [], videoSessions: [], links: [], performance: [],
      info: { family: "", personality: "", phone: "", passportUrl: "" },
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo jugador"
      historyKey="dash-nuevo-jugador"
      dirty={dirty}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" disabled={!name || !pos1 || !birthDate}>Añadir jugador</Button>
        </>
      }
    >
      <div className="space-y-3">
        <F label="Nombre completo" value={name} onChange={(v) => { setName(v); if (errors.name) setErrors(prev => ({ ...prev, name: undefined })); }} required error={errors.name} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <F label="Fecha de nacimiento" value={birthDate} onChange={(v) => { setBirthDate(v); if (errors.birthDate) setErrors(prev => ({ ...prev, birthDate: undefined })); }} type="date" required error={errors.birthDate} />
          <F label="Nacionalidad" value={nationality} onChange={setNationality} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Posición principal" required>
            <Select value={pos1} onChange={(e) => setPos1(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {POSITIONS.map((p) => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
            </Select>
          </Field>
          <Field label="Posición secundaria">
            <Select value={pos2} onChange={(e) => setPos2(e.target.value)}>
              <option value="">Seleccionar…</option>
              {POSITIONS.map((p) => <option key={p.code} value={p.code}>{positionLabel(p.code)}</option>)}
            </Select>
          </Field>
        </div>
        <Seccion titulo="Club(s)" />
        <label className="flex items-center gap-2 min-h-9 cursor-pointer select-none">
          <input type="checkbox" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-body text-slate-700">Jugador cedido</span>
        </label>
        {isLoan ? (
          <div className="grid grid-cols-2 gap-3">
            <F label="Club propietario" value={club1} onChange={setClub1} />
            <F label="Club donde juega" value={club2} onChange={setClub2} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <F label="Club (principal)" value={club1} onChange={setClub1} />
            <F label="Segundo club (opcional)" value={club2} onChange={setClub2} />
          </div>
        )}
        <Seccion titulo="Contrato de representación" />
        <div className="grid grid-cols-2 gap-3">
          <F label="Inicio" value={reprStart} onChange={setReprStart} type="date" />
          <F label="Fin" value={reprEnd} onChange={setReprEnd} type="date" />
        </div>
        <Seccion titulo="Contrato con club" />
        <div className="grid grid-cols-2 gap-3">
          <F label="Fin de contrato" value={clubEnd} onChange={setClubEnd} type="date" />
          <F label="Años opcionales" value={optYears} onChange={setOptYears} type="number" />
        </div>
        <Seccion titulo={L.equipo} />
        <div className="grid grid-cols-2 gap-3">
          <Sel label={`${L.encargado} 1`} value={managed1} onChange={setManaged1} options={profiles} />
          <Sel label={`${L.encargado} 2`} value={managed2} onChange={setManaged2} options={profiles} />
        </div>
      </div>
    </Dialog>
  );
}

function AddGeneralTaskModal({ profiles, players, currentProfileId, onClose, onAdd }: {
  profiles: Profile[]; players: Player[]; currentProfileId?: string; onClose: () => void; onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(currentProfileId ?? "");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [label, setLabel] = useState<TaskLabel | "">("");
  const [dueDate, setDueDate] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: "t" + Date.now(),
      title,
      description,
      playerId: selectedPlayerId || "general",
      assigneeId,
      priority,
      label: label || undefined,
      status: "pendiente",
      dueDate: dueDate || undefined,
      createdAt: new Date().toISOString(),
      comments: [],
      adminOnly,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva tarea"
      historyKey="dash-nueva-tarea"
      dirty={!!(title || description)}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>Crear tarea</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={`${L.jugador} (opcional)`}>
          <Select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
            <option value="">— Tarea general —</option>
            {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <F label="Título" value={title} onChange={setTitle} required autoFocus />
        <Field label={L.responsable}>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">— {L.sinResponsable} —</option>
            {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
          </Select>
        </Field>

        {/* Más opciones — plegado por defecto */}
        <Button variant="link" size="sm" onClick={() => setShowMore(v => !v)} aria-expanded={showMore}
          icon={<ChevronDown className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />} className="text-slate-600">
          Más opciones {!showMore && '(descripción, prioridad, tipo, fecha…)'}
        </Button>

        {showMore && (<>
        <Field label="Descripción">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L.prioridad}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as "alta" | "media" | "baja")}>
              <option value="baja">{PRIORITY_LABELS.baja}</option>
              <option value="media">{PRIORITY_LABELS.media}</option>
              <option value="alta">{PRIORITY_LABELS.alta}</option>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={label} onChange={(e) => setLabel(e.target.value as TaskLabel | "")}>
              <option value="">— Sin tipo —</option>
              {TASK_LABELS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <F label={L.vencimiento} value={dueDate} onChange={setDueDate} type="date" />
        {/* Solo admins */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-9">
          <input
            type="checkbox"
            checked={adminOnly}
            onChange={(e) => setAdminOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
          />
          <span className="text-body text-slate-700 font-medium">Solo para admins</span>
          {adminOnly && <Badge tone="warning" pill={false} className="ml-auto uppercase tracking-wide">Admin</Badge>}
        </label>
        </>)}
      </div>
    </Dialog>
  );
}

function F({ label, value, onChange, type = "text", required = false, error, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; error?: string; autoFocus?: boolean;
}) {
  return (
    <Field label={label} required={required} error={error}>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus} />
    </Field>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Profile[];
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
    </Field>
  );
}

// ── TAREA RÁPIDA ─────────────────────────────────────────────
function QuickTaskModal({ player, profiles, currentProfileId, onClose, onAdd }: {
  player: Player; profiles: Profile[]; currentProfileId?: string;
  onClose: () => void; onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(currentProfileId ?? "");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ id: "t"+Date.now(), playerId: player.id, title: title.trim(), description: "",
      assigneeId, watchers: player.managedBy ?? [], priority, status: "pendiente",
      dueDate: dueDate || undefined, createdAt: new Date().toISOString(), comments: [] });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva tarea"
      description={player.name}
      size="sm"
      historyKey="dash-tarea-rapida"
      dirty={title.trim().length > 0}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      footer={
        <>
          <Button onClick={onClose}>{L.cancelar}</Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>Crear tarea</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="¿Qué hay que hacer?" required>
          <Input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Llamar al club" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={L.responsable}>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— {L.sinResponsable} —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.avatar} {p.name.split(" ")[0]}</option>)}
            </Select>
          </Field>
          <Field label={L.prioridad}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="baja">{PRIORITY_LABELS.baja}</option>
              <option value="media">{PRIORITY_LABELS.media}</option>
              <option value="alta">{PRIORITY_LABELS.alta}</option>
            </Select>
          </Field>
        </div>
        <Field label="Fecha límite" hint="Opcional">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
