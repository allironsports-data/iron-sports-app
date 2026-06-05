import { useState, useEffect } from "react";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { ToastStack } from "../components/ToastStack";
import { useToast } from "../hooks/useToast";
import logoImg from '../assets/logo.jpeg';
import type { Player, Task, TaskLabel, PlayerActivity } from "../types";
import { calcAge, clubsLabel } from "../types";
import { createPlayerActivity, fetchActivitiesByAuthor } from "../lib/db";
import type { Profile } from "../contexts/AuthContext";
import type { AppNotification } from "../App";
import {
  LogOut,
  Users,
  AlertTriangle,
  Plus,
  Search,
  X,
  Trash2,
  UserPlus,
  CheckSquare,
  Square,
  Bell,
  Cake,
  Calendar,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  Table,
  Zap,
  TrendingUp,
  Eye,
  Activity,
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  view?: 'tareas' | 'jugadores';   // which section to show
  onViewChange?: (v: 'tareas' | 'jugadores' | 'distribucion' | 'captacion') => void;
  players: Player[];
  tasks: Task[];
  profiles: Profile[];
  currentProfile: Profile;
  onSelectPlayer: (id: string) => void;
  onLogout: () => void;
  onAddPlayer: (player: Player) => void;
  onAdmin?: () => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkAssignManager?: (playerIds: string[], managerId: string) => Promise<void>;
  notifications?: AppNotification[];
  onDismissNotification?: (id: string) => void;
  onAddGeneralTask?: (task: Task) => void;
  onUpdateGeneralTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onDeleteGeneralTask?: (taskId: string) => void;
  onOverview?: () => void;
  onSelectProfile?: (profileId: string) => void;
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

export function Dashboard({
  view = 'tareas',
  onViewChange,
  players,
  tasks,
  profiles,
  currentProfile,
  onSelectPlayer,
  onLogout,
  onAddPlayer,
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
}: Props) {
  const { toasts, showToast, dismissToast } = useToast();
  // Internal tab: 'equipo' is handled locally; 'tareas'/'jugadores' are driven by `view` prop
  const [internalTab, setInternalTab] = useState<'equipo' | null>(null);
  const activeTab = internalTab ?? view;   // 'tareas' | 'jugadores' | 'equipo'
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddGeneralTask, setShowAddGeneralTask] = useState(false);

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
    setEvtDate(new Date().toISOString().slice(0, 10));
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
  const [editingGeneralTask, setEditingGeneralTask] = useState<Task | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  // quick filter from stat cards: overlays on top of tab filter
  const [quickFilter, setQuickFilter] = useState<"overdue" | "urgent" | "inprogress" | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tasksMainView, setTasksMainView] = useState<'mis' | 'equipo'>(
    () => (sessionStorage.getItem('nav_tasks_view') as 'mis' | 'equipo') ?? 'mis'
  );
  const [equipoSubView, setEquipoSubView] = useState<'persona' | 'todas'>(
    () => (sessionStorage.getItem('nav_equipo_subview') as 'persona' | 'todas') ?? 'persona'
  );
  const [weekOffset, setWeekOffset] = useState(0);
  // Activities per profile for the equipo weekly view
  const [teamActivities, setTeamActivities] = useState<Record<string, PlayerActivity[]>>({});
  const [loadingTeamActivities, setLoadingTeamActivities] = useState(false);
  const [showCompletedTeam, setShowCompletedTeam] = useState(false);
  const [equipoQuickFilter, setEquipoQuickFilter] = useState<'overdue' | 'inprogress' | null>(null);
  const [misViewMode, setMisViewMode] = useState<'kanban' | 'compact' | 'table'>('kanban');
  const [equipoViewMode, setEquipoViewMode] = useState<'kanban' | 'compact' | 'table'>('kanban');
  const [taskSortCol, setTaskSortCol] = useState<'title' | 'player' | 'priority' | 'dueDate' | 'status'>('dueDate');
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('asc');
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompletedMine, setShowCompletedMine] = useState(false);
  const [playerView, setPlayerView] = useState<'grid' | 'list' | 'table'>('grid');
  const [showSearch, setShowSearch] = useState(false);
  const [quickTaskPlayer, setQuickTaskPlayer] = useState<Player | null>(null);

  // Jugadores advanced filters
  const [posFilters, setPosFilters] = useState<string[]>([]);
  const [yearFilters, setYearFilters] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState(false);


  // Cmd+K / Ctrl+K global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); }
      if (e.key === "Escape") { setShowSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  // Persist tasksMainView + equipoSubView so refresh restores position
  useEffect(() => { sessionStorage.setItem('nav_tasks_view', tasksMainView) }, [tasksMainView]);
  useEffect(() => { sessionStorage.setItem('nav_equipo_subview', equipoSubView) }, [equipoSubView]);

  // Fetch activities for all profiles when equipo tab is active
  useEffect(() => {
    if (tasksMainView !== 'equipo') return;
    if (Object.keys(teamActivities).length > 0) return; // already loaded
    setLoadingTeamActivities(true);
    Promise.all(
      profiles.map(p => fetchActivitiesByAuthor(p.id).then(acts => ({ id: p.id, acts })))
    ).then(results => {
      const byProfile: Record<string, PlayerActivity[]> = {};
      results.forEach(r => { byProfile[r.id] = r.acts; });
      setTeamActivities(byProfile);
    }).catch(() => {}).finally(() => setLoadingTeamActivities(false));
  }, [tasksMainView, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exclude intermediation-only players from mantenimiento
  const visiblePlayers = players.filter(p => !p.hiddenFromManagement)

  const pendingTasks = tasks.filter((t) => t.status !== "completada");

  // helper: is the current user involved in a task (assignee OR watcher)
  const iAmInvolved = (t: Task) =>
    t.assigneeId === currentProfile.id || (t.watchers ?? []).includes(currentProfile.id);

  // myTasks: assigned to me OR watching (pending), excluding adminOnly if not admin
  const myTasks = pendingTasks.filter((t) => {
    if (!iAmInvolved(t)) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    return true;
  });
  // completed version for display
  const myTasksCompleted = tasks.filter((t) => {
    if (t.status !== "completada") return false;
    if (!iAmInvolved(t)) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    return true;
  });

  // myPlayerTasks: ALL tasks for players I manage (no exclusions — overlap with myTasks is intentional)
  const myPlayerTasks = pendingTasks.filter((t) => {
    if (t.adminOnly && !currentProfile.is_admin) return false;
    const player = players.find((p) => p.id === t.playerId);
    return player && player.managedBy.includes(currentProfile.id);
  });
  const overdueMyTasks = myTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());

  // "Mis jugadores" tab: group by player
  const playerTaskGroups: { player: Player; ptasks: Task[] }[] = (() => {
    const pids = Array.from(new Set(myPlayerTasks.map(t => t.playerId)));
    return pids
      .map(pid => ({ player: players.find(p => p.id === pid)!, ptasks: myPlayerTasks.filter(t => t.playerId === pid) }))
      .filter(g => g.player != null);
  })();

  // ── Tasks stats + week nav ──────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  // Week window (driven by weekOffset for the Equipo view)
  const weekMonday = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weekSunday = new Date(weekMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
  // For "esta semana" stat in Mis tareas we always use offset=0
  const thisMonday = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const thisSunday = new Date(thisMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
  const myTasksDueToday = myTasks.filter(t => t.dueDate === todayStr);
  const myTasksDueThisWeek = myTasks.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate + 'T12:00:00');
    return d >= thisMonday && d <= thisSunday;
  });
  const myTasksInProgress = myTasks.filter(t => t.status === 'en_progreso');

  // Team-wide tasks (for Equipo "Todas" kanban)
  const teamAllTasks = tasks.filter(t => !(t.adminOnly && !currentProfile.is_admin));
  const teamPendingAll = teamAllTasks.filter(t => t.status !== 'completada');
  const teamCompletedAll = teamAllTasks.filter(t => t.status === 'completada');
  const teamOverdue = teamPendingAll.filter(t => t.dueDate && t.dueDate < todayStr);
  const teamDueToday = teamPendingAll.filter(t => t.dueDate === todayStr);
  const teamInProgress = teamAllTasks.filter(t => t.status === 'en_progreso');

  // Birthdays
  const birthdaysToday = visiblePlayers.filter((p) => isBirthdayToday(p.birthDate));
  const birthdaysSoon = visiblePlayers.filter((p) => isBirthdaySoon(p.birthDate, 7));

  // Available options for multi-filters (derived from visible players)
  const positionOptions = Array.from(new Set(visiblePlayers.map(p => p.positions[0]).filter(Boolean))).sort() as string[];
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

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} jugador${selected.size > 1 ? "es" : ""}? No se puede deshacer.`)) return;
    setBulkLoading(true);
    try { await onBulkDelete(Array.from(selected)); exitSelectMode(); } finally { setBulkLoading(false); }
  };

  const handleBulkAssign = async (managerId: string) => {
    if (!onBulkAssignManager || selected.size === 0) return;
    setBulkLoading(true);
    try { await onBulkAssignManager(Array.from(selected), managerId); setShowAssignModal(false); exitSelectMode(); } finally { setBulkLoading(false); }
  };

  const cycleTaskStatus = (task: Task) => {
    const next: Record<string, Task["status"]> = {
      "pendiente": "en_progreso",
      "en_progreso": "completada",
      "completada": "pendiente",
    };
    const updated = { ...task, status: next[task.status] ?? "pendiente" };
    if (task.playerId === "general" || task.playerId === "") {
      if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
    } else {
      if (onUpdateTask) onUpdateTask(updated);
    }
  };

  const canBulkAction = (onBulkDelete || onBulkAssignManager) && currentProfile.is_admin;
  const unreadNotifs = notifications.length;

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
              <button onClick={() => setNotifToasts((p) => p.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-600">
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Global search */}
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Buscar (⌘K)"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline text-xs text-slate-400 border border-slate-200 rounded px-1 py-px">⌘K</span>
            </button>
            {/* Notification bell */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              title="Notificaciones"
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
              <button onClick={onOverview} className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Overview">
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {currentProfile.is_admin && onAdmin && (
              <button onClick={onAdmin} className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Admin">
                <Users className="w-4 h-4" />
              </button>
            )}
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-level nav: Mantenimiento | Distribución | Captación → Tareas | Jugadores | Equipo */}
        {onViewChange && (
          <>
            {/* Level 1: main sections */}
            <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
              {/* Mantenimiento — always active while Dashboard is mounted */}
              <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)] transition-colors">
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
            </div>

            {/* Level 2: Mantenimiento sub-tabs */}
            <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center bg-slate-50 border-t border-slate-100 overflow-x-auto scrollbar-none">
              {([
                { id: 'tareas'    as const, label: 'Tareas' },
                { id: 'jugadores' as const, label: 'Jugadores' },
                { id: 'equipo'    as const, label: 'Equipo' },
              ]).map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'equipo') {
                        setInternalTab('equipo');
                      } else {
                        setInternalTab(null);
                        onViewChange(tab.id);
                      }
                    }}
                    className={`flex-shrink-0 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)]'
                        : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </header>

      {/* Notifications dropdown */}
      {showNotifications && (
        <div className="fixed top-12 sm:top-14 right-2 sm:right-4 z-30 w-72 sm:w-80 max-h-96 bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Notificaciones</span>
            <button onClick={() => setShowNotifications(false)} className="text-slate-400"><X className="w-3.5 h-3.5" /></button>
          </div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">Sin notificaciones</div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.playerId) onSelectPlayer(n.playerId); setShowNotifications(false); }}
                className="w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-start gap-2"
              >
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.type === 'task_done' ? 'bg-emerald-500' : n.type === 'birthday' ? 'bg-amber-400' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {onDismissNotification && (
                  <button onClick={(e) => { e.stopPropagation(); onDismissNotification(n.id); }} className="text-slate-300 hover:text-slate-500 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </button>
            ))
          )}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-20 sm:pb-6">
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

        {/* ── Tareas section ──────────────────────────────── */}
        {activeTab === 'tareas' && (<>

        {/* ── Header: Mis tareas / Equipo toggle + actions ── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {(['mis', 'equipo'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setTasksMainView(v); setQuickFilter(null); }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  tasksMainView === v
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'mis' ? 'Mis tareas' : 'Equipo'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={openAddEvent}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <Activity className="w-3 h-3" /> Evento
            </button>
            {onAddGeneralTask && (
              <button
                onClick={() => setShowAddGeneralTask(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)] hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3 h-3" /> Nueva tarea
              </button>
            )}
          </div>
        </div>

        {/* ── MIS TAREAS view ─────────────────────────────── */}
        {tasksMainView === 'mis' && (<>

          {/* 4-stat strip */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <button
              onClick={() => setQuickFilter(q => q === 'overdue' ? null : 'overdue')}
              className={`rounded-xl p-3 text-center border transition-all active:scale-95 ${
                quickFilter === 'overdue'
                  ? 'bg-red-50 border-red-400 shadow-sm'
                  : overdueMyTasks.length > 0
                    ? 'bg-white border-red-200 hover:border-red-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-xl font-semibold ${overdueMyTasks.length > 0 ? 'text-red-500' : 'text-slate-800'}`}>
                {overdueMyTasks.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Vencidas</p>
            </button>
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-slate-800">{myTasksDueToday.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Hoy</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-slate-800">{myTasksDueThisWeek.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Esta semana</p>
            </div>
            <button
              onClick={() => setQuickFilter(q => q === 'inprogress' ? null : 'inprogress')}
              className={`rounded-xl p-3 text-center border transition-all active:scale-95 ${
                quickFilter === 'inprogress'
                  ? 'bg-blue-50 border-blue-400 shadow-sm'
                  : myTasksInProgress.length > 0
                    ? 'bg-white border-blue-200 hover:border-blue-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-xl font-semibold ${myTasksInProgress.length > 0 ? 'text-blue-600' : 'text-slate-800'}`}>
                {myTasksInProgress.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">En progreso</p>
            </button>
          </div>

          {/* Personal kanban */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-600 flex-1">
                Mis tareas <span className="font-normal text-slate-400">({myTasks.length})</span>
              </p>
              {quickFilter && (
                <button onClick={() => setQuickFilter(null)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpiar filtro
                </button>
              )}
              <ViewModeToggle mode={misViewMode} onChange={setMisViewMode} />
            </div>
            {(() => {
              const misFiltered = quickFilter === 'overdue'
                ? myTasks.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') < new Date())
                : quickFilter === 'inprogress'
                  ? myTasks.filter(t => t.status === 'en_progreso')
                  : myTasks;
              const misPending   = misFiltered.filter(t => t.status === 'pendiente');
              const misInProgress = misFiltered.filter(t => t.status === 'en_progreso');
              if (misViewMode === 'compact') {
                return (
                  <CompactTaskList
                    tasks={misFiltered} completedTasks={myTasksCompleted}
                    players={players} profiles={profiles}
                    onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                  />
                );
              }
              if (misViewMode === 'table') {
                return (
                  <TaskTableView
                    tasks={[...myTasks, ...myTasksCompleted]}
                    players={players} profiles={profiles}
                    onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    sortCol={taskSortCol} sortDir={taskSortDir}
                    onSort={(col) => { if (col === taskSortCol) setTaskSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setTaskSortCol(col); setTaskSortDir('asc'); } }}
                  />
                );
              }
              return (
                <>
                  <div className="hidden sm:grid grid-cols-3 gap-0 divide-x divide-slate-100 p-4 pt-3">
                    <KanbanCol label="Pendiente" dotColor="#94a3b8"
                      tasks={misPending} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    />
                    <KanbanCol label="En progreso" dotColor="#378ADD"
                      tasks={misInProgress} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                    />
                    <KanbanCol label="Completada" dotColor="#1D9E75"
                      tasks={[]} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                      completedCount={myTasksCompleted.length} completedTasks={myTasksCompleted}
                      isCompletedCol
                    />
                  </div>
                  <div className="sm:hidden p-4 space-y-2">
                    {[...misPending, ...misInProgress].length === 0
                      ? <p className="text-center py-6 text-sm text-slate-400">✓ Sin tareas pendientes</p>
                      : [...misPending, ...misInProgress].map(t => (
                          <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                            onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                            detailTaskId={detailTask?.id}
                            overdue={!!(t.dueDate && new Date(t.dueDate) < new Date())} />
                        ))
                    }
                  </div>
                </>
              );
            })()}
          </div>

          {/* Mis jugadores */}
          {playerTaskGroups.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-600">
                  Mis jugadores <span className="font-normal text-slate-400">({myPlayerTasks.length} tareas)</span>
                </p>
              </div>
              <div className="p-4 space-y-5">
                {playerTaskGroups.map(({ player, ptasks }) => (
                  <div key={player.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: PRIMARY }}>
                        {player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <p className="text-xs font-semibold text-slate-700">{player.name}</p>
                      <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{ptasks.length}</span>
                    </div>
                    <div className="space-y-2 ml-8">
                      {ptasks.map(t => (
                        <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                          onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                          detailTaskId={detailTask?.id}
                          overdue={!!(t.dueDate && new Date(t.dueDate) < new Date())} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

        {/* ── EQUIPO view ──────────────────────────────────── */}
        {tasksMainView === 'equipo' && (<>

          {/* Sub-toggle: Por persona | Todas las tareas */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 mb-5 w-fit">
            {(['persona', 'todas'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setEquipoSubView(v); setEquipoQuickFilter(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  equipoSubView === v
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'persona' ? 'Por persona' : 'Todas las tareas'}
              </button>
            ))}
          </div>

          {/* ── Por persona: week cards ── */}
          {equipoSubView === 'persona' && (<>

          {/* Week navigator */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setWeekOffset(o => o - 1); setTeamActivities({}); }}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setWeekOffset(0); setTeamActivities({}); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  weekOffset === 0
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Esta semana
              </button>
              <button
                onClick={() => { setWeekOffset(o => o + 1); setTeamActivities({}); }}
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

          {/* Per-person cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map(p => {
              const isMe = p.id === currentProfile.id;
              const weekMonStr = weekMonday.toISOString().slice(0, 10);
              const weekSunStr = weekSunday.toISOString().slice(0, 10);

              const weekTasks = tasks.filter(t =>
                t.assigneeId === p.id &&
                t.dueDate != null &&
                t.dueDate >= weekMonStr &&
                t.dueDate <= weekSunStr
              );
              const inProgressP = tasks.filter(t =>
                t.assigneeId === p.id && t.status === 'en_progreso'
              );
              const overdueP = tasks.filter(t =>
                t.assigneeId === p.id &&
                t.status !== 'completada' &&
                t.dueDate != null &&
                t.dueDate < todayStr
              );
              const allCompleted = tasks.filter(t =>
                t.assigneeId === p.id &&
                t.status === 'completada'
              );
              const profileActs = teamActivities[p.id] ?? [];
              const weekEvents = profileActs.filter(a =>
                a.date >= weekMonStr && a.date <= weekSunStr
              );

              return (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: PRIMARY }}>
                        {p.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                        {isMe && <p className="text-[11px] text-slate-400">Tú</p>}
                      </div>
                    </div>
                    {overdueP.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        <AlertTriangle className="w-3 h-3" />
                        {overdueP.length} venc.
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-3">
                    {/* Tasks this week */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tareas esta semana</p>
                        <span className="text-[11px] font-medium text-slate-500">{weekTasks.length}</span>
                      </div>
                      {weekTasks.length === 0 ? (
                        <p className="text-xs text-slate-300 italic">Sin tareas programadas</p>
                      ) : (
                        <div className="space-y-1.5">
                          {weekTasks.slice(0, 3).map(t => (
                            <div key={t.id} onClick={() => setDetailTask(t)}
                              className="flex items-center gap-2 cursor-pointer group">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background: t.status === 'completada' ? '#10b981'
                                    : t.status === 'en_progreso' ? '#3b82f6'
                                    : t.priority === 'alta' ? '#E24B4A'
                                    : t.priority === 'media' ? '#EF9F27' : '#94a3b8'
                                }} />
                              <p className="text-xs text-slate-700 truncate group-hover:text-blue-600 transition-colors flex-1">{t.title}</p>
                              {t.dueDate && (
                                <span className="text-[10px] text-slate-400 flex-shrink-0">
                                  {new Date(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          ))}
                          {weekTasks.length > 3 && (
                            <p className="text-[11px] text-slate-400">+{weekTasks.length - 3} más</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* Events this week */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Eventos esta semana</p>
                        <span className="text-[11px] font-medium text-slate-500">
                          {loadingTeamActivities ? '…' : weekEvents.length}
                        </span>
                      </div>
                      {loadingTeamActivities ? (
                        <p className="text-xs text-slate-300 italic">Cargando…</p>
                      ) : weekEvents.length === 0 ? (
                        <p className="text-xs text-slate-300 italic">Sin eventos registrados</p>
                      ) : (
                        <div className="space-y-1.5">
                          {weekEvents.slice(0, 3).map(a => {
                            const evtPlayer = players.find(pl => pl.id === a.playerId);
                            return (
                              <div key={a.id} className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                <p className="text-xs text-slate-700 truncate flex-1">
                                  {a.type}
                                  {evtPlayer && <span className="text-slate-400"> · {evtPlayer.name}</span>}
                                </p>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">
                                  {new Date(a.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                </span>
                              </div>
                            );
                          })}
                          {weekEvents.length > 3 && (
                            <p className="text-[11px] text-slate-400">+{weekEvents.length - 3} más</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px]">
                        {inProgressP.length > 0 && (
                          <span className="text-blue-600 font-medium">{inProgressP.length} en progreso</span>
                        )}
                        {allCompleted.length > 0 && (
                          <span className="text-emerald-600 font-medium">✓ {allCompleted.length} completadas</span>
                        )}
                        {inProgressP.length === 0 && allCompleted.length === 0 && weekTasks.length === 0 && weekEvents.length === 0 && (
                          <span className="text-slate-300">Sin actividad</span>
                        )}
                      </div>
                      {onSelectProfile && (
                        <button
                          onClick={() => onSelectProfile(p.id)}
                          className="text-[11px] text-slate-400 hover:text-[hsl(220,72%,26%)] transition-colors font-medium"
                        >
                          Ver todo →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

          </>)}

          {/* ── Todas las tareas: team kanban ── */}
          {equipoSubView === 'todas' && (<>

            {/* 4-stat strip */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <button
                onClick={() => setEquipoQuickFilter(q => q === 'overdue' ? null : 'overdue')}
                className={`rounded-xl p-3 text-center border transition-all active:scale-95 ${
                  equipoQuickFilter === 'overdue'
                    ? 'bg-red-50 border-red-400 shadow-sm'
                    : teamOverdue.length > 0
                      ? 'bg-white border-red-200 hover:border-red-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`text-xl font-semibold ${teamOverdue.length > 0 ? 'text-red-500' : 'text-slate-800'}`}>
                  {teamOverdue.length}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Vencidas</p>
              </button>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-slate-800">{teamDueToday.length}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Hoy</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-slate-800">{teamPendingAll.length}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Pendientes</p>
              </div>
              <button
                onClick={() => setEquipoQuickFilter(q => q === 'inprogress' ? null : 'inprogress')}
                className={`rounded-xl p-3 text-center border transition-all active:scale-95 ${
                  equipoQuickFilter === 'inprogress'
                    ? 'bg-blue-50 border-blue-400 shadow-sm'
                    : teamInProgress.length > 0
                      ? 'bg-white border-blue-200 hover:border-blue-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`text-xl font-semibold ${teamInProgress.length > 0 ? 'text-blue-600' : 'text-slate-800'}`}>
                  {teamInProgress.length}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">En progreso</p>
              </button>
            </div>

            {/* Team kanban */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-600 flex-1">
                  Todas las tareas <span className="font-normal text-slate-400">({teamAllTasks.length})</span>
                </p>
                {equipoQuickFilter && (
                  <button onClick={() => setEquipoQuickFilter(null)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    <X className="w-3 h-3" /> Limpiar filtro
                  </button>
                )}
                <ViewModeToggle mode={equipoViewMode} onChange={setEquipoViewMode} />
              </div>
              {(() => {
                const filtered2 = equipoQuickFilter === 'overdue'
                  ? teamPendingAll.filter(t => t.dueDate && t.dueDate < todayStr)
                  : equipoQuickFilter === 'inprogress'
                    ? teamAllTasks.filter(t => t.status === 'en_progreso')
                    : teamPendingAll;
                const colPending    = filtered2.filter(t => t.status === 'pendiente');
                const colInProgress = filtered2.filter(t => t.status === 'en_progreso');
                if (equipoViewMode === 'compact') {
                  return (
                    <CompactTaskList
                      tasks={filtered2} completedTasks={teamCompletedAll}
                      players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      showCompleted={showCompletedTeam} onToggleCompleted={() => setShowCompletedTeam(v => !v)}
                    />
                  );
                }
                if (equipoViewMode === 'table') {
                  return (
                    <TaskTableView
                      tasks={teamAllTasks}
                      players={players} profiles={profiles}
                      onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      sortCol={taskSortCol} sortDir={taskSortDir}
                      onSort={(col) => { if (col === taskSortCol) setTaskSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setTaskSortCol(col); setTaskSortDir('asc'); } }}
                    />
                  );
                }
                return (
                  <>
                    <div className="hidden sm:grid grid-cols-3 gap-0 divide-x divide-slate-100 p-4 pt-3">
                      <KanbanCol label="Pendiente" dotColor="#94a3b8"
                        tasks={colPending} players={players} profiles={profiles}
                        onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      />
                      <KanbanCol label="En progreso" dotColor="#378ADD"
                        tasks={colInProgress} players={players} profiles={profiles}
                        onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                      />
                      <KanbanCol label="Completada" dotColor="#1D9E75"
                        tasks={[]} players={players} profiles={profiles}
                        onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                        showCompleted={showCompletedTeam} onToggleCompleted={() => setShowCompletedTeam(v => !v)}
                        completedCount={teamCompletedAll.length} completedTasks={teamCompletedAll}
                        isCompletedCol
                      />
                    </div>
                    <div className="sm:hidden p-4 space-y-2">
                      {filtered2.length === 0
                        ? <p className="text-center py-6 text-sm text-slate-400">✓ Sin tareas pendientes</p>
                        : filtered2.map(t => (
                            <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                              onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                              detailTaskId={detailTask?.id}
                              overdue={!!(t.dueDate && new Date(t.dueDate) < new Date())} />
                          ))
                      }
                    </div>
                  </>
                );
              })()}
            </div>

          </>)}

        </>)}

        {/* ── Jugadores section ────────────────────────────── */}
        {activeTab === 'jugadores' && (<>

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
                className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 transition-colors flex-shrink-0"
                style={{ background: PRIMARY }}>
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">Nuevo jugador</span>
              </button>
            </div>
          </div>

          {/* Manager filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setManagerFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${managerFilter === "all" ? "text-white border-transparent" : "border-slate-200 text-slate-500 hover:text-slate-700 bg-white"}`}
              style={managerFilter === "all" ? { background: PRIMARY } : {}}>
              Todos ({visiblePlayers.length})
            </button>
            {profiles.map((m) => {
              const count = visiblePlayers.filter((p) => p.managedBy.includes(m.id)).length;
              if (count === 0) return null;
              return (
                <button key={m.id} onClick={() => setManagerFilter(managerFilter === m.id ? "all" : m.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${managerFilter === m.id ? "text-white border-transparent" : "border-slate-200 text-slate-500 hover:text-slate-700 bg-white"}`}
                  style={managerFilter === m.id ? { background: PRIMARY } : {}}>
                  {m.avatar} {m.name.split(" ")[0]} ({count})
                </button>
              );
            })}
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
          />
          <MultiSelectFilter
            label="Año nacimiento"
            options={yearOptions}
            selected={yearFilters}
            onChange={setYearFilters}
          />
          <button
            onClick={() => setActivityFilter(v => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activityFilter
                ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            Con actividad
          </button>
          {(posFilters.length > 0 || yearFilters.length > 0 || activityFilter) && (
            <button
              onClick={() => { setPosFilters([]); setYearFilters([]); setActivityFilter(false); }}
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
              className={`p-1.5 rounded transition-colors ${playerView === 'grid' ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
              title="Vista tarjetas">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlayerView('list')}
              className={`p-1.5 rounded transition-colors ${playerView === 'list' ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
              title="Vista lista">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlayerView('table')}
              className={`p-1.5 rounded transition-colors ${playerView === 'table' ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
              title="Vista tabla">
              <Table className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── GRID VIEW ── */}
        {playerView === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((player) => {
              const playerTasks = tasks.filter((t) => t.playerId === player.id && t.status !== "completada");
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
                      className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors"
                      title="Nueva tarea rápida"
                    >
                      <Zap className="w-3 h-3" />
                    </button>
                  )}

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate pr-8">{player.name}</h3>
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
              const playerTasks = tasks.filter((t) => t.playerId === player.id && t.status !== "completada");
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
                      <p className="text-sm font-semibold text-slate-800 truncate">{player.name}</p>
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
                        className="w-6 h-6 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors flex-shrink-0"
                        title="Nueva tarea rápida"
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
                  const playerTasks = tasks.filter(t => t.playerId === player.id && t.status !== 'completada')
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
              <div className="text-center py-10 text-sm text-slate-400">No se encontraron jugadores</div>
            )}
          </div>
        )}

        {filtered.length === 0 && playerView !== 'table' && (
          <div className="text-center py-12 text-sm text-slate-400">No se encontraron jugadores</div>
        )}

        </>)}

        {/* ── Equipo section ───────────────────────────────── */}
        {activeTab === 'equipo' && onSelectProfile && (<>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-800">Equipo</h2>
            <p className="text-xs text-slate-400 mt-0.5">Haz clic en un miembro para ver su actividad y eventos</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {profiles.map(p => {
              const managedCount   = players.filter(pl => pl.managedBy.includes(p.id)).length;
              const assignedTasks  = tasks.filter(t => t.assigneeId === p.id && t.status !== "completada");
              const overdueTasks   = assignedTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
              const inProgressCount = assignedTasks.filter(t => t.status === "en_progreso").length;
              const isMe = p.id === currentProfile.id;

              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProfile(p.id)}
                  className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 text-left cursor-pointer transition-all hover:shadow-md hover:border-slate-300 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 relative"
                >
                  {isMe && (
                    <span className="absolute top-3 right-3 text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Tú</span>
                  )}

                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: PRIMARY }}
                    >
                      {p.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 rounded-lg px-2.5 py-2 text-center">
                      <p className="text-base font-semibold text-slate-800">{managedCount}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Jugadores</p>
                    </div>
                    <div className={`rounded-lg px-2.5 py-2 text-center ${overdueTasks.length > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                      <p className={`text-base font-semibold ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                        {assignedTasks.length}
                      </p>
                      <p className={`text-[10px] mt-0.5 leading-tight ${overdueTasks.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {overdueTasks.length > 0 ? `${overdueTasks.length} venc.` : 'Tareas'}
                      </p>
                    </div>
                    <div className={`rounded-lg px-2.5 py-2 text-center ${inProgressCount > 0 ? 'bg-blue-50' : 'bg-slate-50'}`}>
                      <p className={`text-base font-semibold ${inProgressCount > 0 ? 'text-blue-600' : 'text-slate-800'}`}>{inProgressCount}</p>
                      <p className={`text-[10px] mt-0.5 leading-tight ${inProgressCount > 0 ? 'text-blue-400' : 'text-slate-400'}`}>En progreso</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Ver actividad →</span>
                    {overdueTasks.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        {overdueTasks.length} vencida{overdueTasks.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400">No hay miembros del equipo</div>
          )}
        </>)}
      </main>

      {/* Bulk action toolbar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              {onBulkAssignManager && (
                <button onClick={() => setShowAssignModal(true)} disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 disabled:opacity-40 transition-colors"
                  style={{ background: PRIMARY }}>
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
          onAdd={(p) => { onAddPlayer(p); setShowAddPlayer(false); }} />
      )}

      {showAssignModal && (
        <AssignManagerModal profiles={profiles} count={selected.size} loading={bulkLoading}
          onClose={() => setShowAssignModal(false)} onAssign={handleBulkAssign} />
      )}

      {showAddGeneralTask && onAddGeneralTask && (
        <AddGeneralTaskModal profiles={profiles} players={players} currentProfileId={currentProfile.id}
          onClose={() => setShowAddGeneralTask(false)}
          onAdd={(t) => { onAddGeneralTask(t); setShowAddGeneralTask(false); }} />
      )}

      {editingGeneralTask && (
        <EditGeneralTaskModal
          task={editingGeneralTask}
          profiles={profiles}
          players={players}
          onClose={() => setEditingGeneralTask(null)}
          onUpdate={(updated) => {
            if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
            setEditingGeneralTask(null);
          }}
          onDelete={onDeleteGeneralTask ? (id) => {
            onDeleteGeneralTask(id);
            setEditingGeneralTask(null);
          } : undefined}
        />
      )}

      {quickTaskPlayer && onAddGeneralTask && (
        <QuickTaskModal
          player={quickTaskPlayer}
          profiles={profiles}
          currentProfileId={currentProfile.id}
          onClose={() => setQuickTaskPlayer(null)}
          onAdd={(t) => { onAddGeneralTask(t); setQuickTaskPlayer(null); }}
        />
      )}

      {showSearch && (
        <GlobalSearch
          players={players}
          tasks={tasks}
          profiles={profiles}
          onSelectPlayer={(id) => { onSelectPlayer(id); setShowSearch(false); }}
          onSelectTask={(t) => { setDetailTask(t); setShowSearch(false); }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* ── Add Event Modal ──────────────────────────────────── */}
      {showAddEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h4 className="text-sm font-semibold text-slate-800">Nuevo evento de actividad</h4>

            {/* Player selector — combobox */}
            {(() => {
              const selectedPlayer = players.find(p => p.id === evtPlayer);
              const filteredEvtPlayers = [...players]
                .filter(p => p.name.toLowerCase().includes(evtPlayerQ.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name));
              const showEvtDrop = evtPlayerQ.length > 0 && filteredEvtPlayers.length > 0 && !selectedPlayer;
              return (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Jugador <span className="text-red-400">*</span></label>
                  {selectedPlayer ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 rounded-lg bg-blue-50">
                      <span className="flex-1 text-xs font-medium text-slate-800">{selectedPlayer.name}</span>
                      <button
                        type="button"
                        onClick={() => { setEvtPlayer(""); setEvtPlayerQ(""); }}
                        className="text-slate-400 hover:text-slate-700 leading-none text-sm"
                      >×</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={evtPlayerQ}
                        onChange={e => setEvtPlayerQ(e.target.value)}
                        placeholder="Buscar jugador…"
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200"
                      />
                      {showEvtDrop && (
                        <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                          {filteredEvtPlayers.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                setEvtPlayer(p.id);
                                setEvtPlayerQ("");
                              }}
                              className="w-full text-left flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <span>{p.name}</span>
                              <span className="text-slate-400">{calcAge(p.birthDate)} años</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Fecha</label>
                <input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Tipo</label>
                <select value={evtType} onChange={e => setEvtType(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200">
                  {ACTIVITY_TYPES_DASH.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="custom">Personalizado…</option>
                </select>
              </div>
            </div>

            {evtType === 'custom' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Tipo personalizado</label>
                <input type="text" value={evtCustomType} onChange={e => setEvtCustomType(e.target.value)}
                  placeholder="Ej: Reunión con padre, Contrato preliminar…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200" />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Notas <span className="text-slate-400">(opcional)</span></label>
              <textarea value={evtNotes} onChange={e => setEvtNotes(e.target.value)}
                placeholder="Detalles del evento…" rows={3}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>

            {/* Additional players — combobox */}
            {(() => {
              const availablePlayers = [...players]
                .filter(p => p.id !== evtPlayer && !evtExtraPlayers.includes(p.id))
                .filter(p => p.name.toLowerCase().includes(evtExtraPlayerQ.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name));
              const showDrop = evtExtraPlayerQ.length > 0 && availablePlayers.length > 0;
              return (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Jugadores adicionales <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>

                  {/* Selected player tags */}
                  {evtExtraPlayers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {evtExtraPlayers.map(pid => {
                        const pl = players.find(p => p.id === pid);
                        if (!pl) return null;
                        return (
                          <span key={pid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 border border-green-200 text-green-800">
                            {pl.name}
                            <button
                              type="button"
                              onClick={() => setEvtExtraPlayers(prev => prev.filter(id => id !== pid))}
                              className="ml-0.5 text-green-500 hover:text-green-800 leading-none"
                            >×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      value={evtExtraPlayerQ}
                      onChange={e => setEvtExtraPlayerQ(e.target.value)}
                      placeholder="Buscar jugador…"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200"
                    />
                    {showDrop && (
                      <div className="absolute left-0 top-full mt-1 z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-40 overflow-y-auto">
                        {availablePlayers.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              setEvtExtraPlayers(prev => [...prev, p.id]);
                              setEvtExtraPlayerQ('');
                            }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            {p.name}
                            <span className="ml-auto text-slate-400">{calcAge(p.birthDate)} años</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Participant profiles — combobox */}
            {(() => {
              const otherProfiles = profiles.filter(p => p.id !== currentProfile.id);
              const filteredProfiles = otherProfiles.filter(p =>
                !evtParticipants.includes(p.id) &&
                p.name.toLowerCase().includes(evtParticipantQ.toLowerCase())
              );
              const showDropdown = evtParticipantQ.length > 0 && filteredProfiles.length > 0;
              return (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    También estaba… <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>

                  {/* Selected tags */}
                  {evtParticipants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {evtParticipants.map(pid => {
                        const prof = profiles.find(p => p.id === pid);
                        if (!prof) return null;
                        return (
                          <span key={pid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                              style={{ background: PRIMARY }}>
                              {prof.avatar}
                            </span>
                            {prof.name.split(' ')[0]}
                            <button onClick={() => setEvtParticipants(prev => prev.filter(id => id !== pid))} className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none">×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      value={evtParticipantQ}
                      onChange={e => setEvtParticipantQ(e.target.value)}
                      placeholder="Buscar compañero…"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-200"
                    />
                    {showDropdown && (
                      <div className="absolute left-0 top-full mt-1 z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-40 overflow-y-auto">
                        {filteredProfiles.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setEvtParticipants(prev => [...prev, p.id]); setEvtParticipantQ(''); }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{ background: PRIMARY }}>
                              {p.avatar}
                            </span>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddEvent(false)}
                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSaveEvent}
                disabled={evtSaving || !evtPlayer || !evtDate || (evtType === 'custom' && !evtCustomType.trim())}
                className="flex-1 py-2 text-xs rounded-lg text-white disabled:opacity-50 transition-colors"
                style={{ background: PRIMARY }}
              >
                {evtSaving ? 'Guardando…' : 'Guardar evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          player={players.find((p) => p.id === detailTask.playerId)}
          players={players}
          profiles={profiles}
          currentProfile={currentProfile}
          onGoToPlayer={onSelectPlayer}
          onClose={() => setDetailTask(null)}
          onUpdate={(updated) => {
            if (onUpdateTask) onUpdateTask(updated);
            if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
          }}
          onSaveAndClose={(updated) => {
            if (onUpdateTask) onUpdateTask(updated);
            if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
            setDetailTask(null);
            showToast("Tarea actualizada", "success");
          }}
          onDelete={(taskId) => {
            if (onDeleteGeneralTask) onDeleteGeneralTask(taskId);
            setDetailTask(null);
            showToast("Tarea eliminada", "info");
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/* ── MultiSelectFilter: dropdown checkbox filter ── */
function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
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
            ? 'bg-[hsl(220,72%,36%)] text-white border-[hsl(220,72%,36%)]'
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
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── TaskListRow: a task row for the list views ── */
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
  const prioBorder =
    task.priority === "alta"  ? "#E24B4A" :
    task.priority === "media" ? "#EF9F27" : "#94a3b8";

  return (
    <div
      onClick={() => onOpenDetail(task)}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
        isSelected ? "border-blue-400 ring-1 ring-blue-200 bg-blue-50/30" :
        overdue    ? "border-red-200 bg-red-50/20" :
        dimmed     ? "border-slate-100 opacity-50 bg-white" :
                    "border-slate-200 hover:border-slate-300 bg-white"
      }`}
      style={{ borderLeftWidth: "3px", borderLeftColor: dimmed ? "#e2e8f0" : prioBorder }}
    >
      <button
        onClick={e => { e.stopPropagation(); onCycleStatus(task); }}
        className="flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors"
        style={{
          background: task.status === "completada" ? "#10b981" : task.status === "en_progreso" ? "#3b82f6" : "transparent",
          borderColor: task.status === "completada" ? "#10b981" : task.status === "en_progreso" ? "#3b82f6" : prioBorder,
        }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${dimmed ? "line-through text-slate-400" : "text-slate-800"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {player && <span className="text-xs text-slate-400 truncate">{player.name}</span>}
          {task.label && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
              {task.label}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs ${overdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
              {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
              {overdue ? " ⚠" : ""}
            </span>
          )}
        </div>
      </div>
      {assignee && (
        <span
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
          style={{ background: "hsl(220,72%,26%)" }}
          title={assignee.name}
        >
          {assignee.avatar}
        </span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
    </div>
  );
}

/* ── ViewModeToggle: kanban / compact / table switcher ── */
function ViewModeToggle({ mode, onChange }: {
  mode: 'kanban' | 'compact' | 'table';
  onChange: (m: 'kanban' | 'compact' | 'table') => void;
}) {
  const options = [
    { m: 'kanban' as const, Icon: LayoutGrid, label: 'Kanban' },
    { m: 'compact' as const, Icon: LayoutList, label: 'Compacto' },
    { m: 'table' as const, Icon: Table, label: 'Tabla' },
  ];
  return (
    <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
      {options.map(({ m, Icon, label }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          title={label}
          className={`p-1.5 rounded transition-colors ${mode === m ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

/* ── CompactTaskList: dense list view grouped by status ── */
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
  const now = new Date();
  const prioBorderColor = (t: Task) =>
    t.status === 'completada' ? '#10b981'
    : t.status === 'en_progreso' ? '#3b82f6'
    : t.priority === 'alta' ? '#E24B4A'
    : t.priority === 'media' ? '#EF9F27' : '#94a3b8';

  const renderRow = (t: Task) => {
    const player   = players.find(p => p.id === t.playerId);
    const assignee = profiles.find(m => m.id === t.assigneeId);
    const isOverdue = !!(t.dueDate && new Date(t.dueDate + 'T12:00:00') < now && t.status !== 'completada');
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
            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
            style={{ background: 'hsl(220,72%,26%)' }}
            title={assignee.name}
          >{assignee.avatar}</span>
        )}
        {t.dueDate && (
          <span className={`text-[11px] flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
            {new Date(t.dueDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            {isOverdue ? ' ⚠' : ''}
          </span>
        )}
      </div>
    );
  };

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

function TaskTableView({ tasks, players, profiles, onOpenDetail, detailTaskId, sortCol, sortDir, onSort }: {
  tasks: Task[];
  players: Player[];
  profiles: Profile[];
  onOpenDetail: (t: Task) => void;
  detailTaskId?: string;
  sortCol: TaskSortCol;
  sortDir: 'asc' | 'desc';
  onSort: (col: TaskSortCol) => void;
}) {
  const now = new Date();
  const prioOrder: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  const statusOrder: Record<string, number> = { en_progreso: 0, pendiente: 1, completada: 2 };

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortCol === 'player') {
      const pa = players.find(p => p.id === a.playerId)?.name ?? '';
      const pb = players.find(p => p.id === b.playerId)?.name ?? '';
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

  const SortIndicator = ({ col }: { col: TaskSortCol }) => {
    if (col !== sortCol) return <ChevronDown className="w-3 h-3 opacity-25 inline-block ml-0.5" />;
    return sortDir === 'asc'
      ? <ChevronDown className="w-3 h-3 text-blue-500 inline-block ml-0.5" />
      : <ChevronDown className="w-3 h-3 text-blue-500 inline-block ml-0.5 rotate-180" />;
  };

  const thCls = "px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap";

  const prioBadge = (p: Task['priority']) =>
    p === 'alta' ? 'bg-red-50 text-red-700 border border-red-200'
    : p === 'media' ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-slate-100 text-slate-500';

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
            <th className={thCls} style={{ width: '34%' }} onClick={() => onSort('title')}>Tarea<SortIndicator col="title" /></th>
            <th className={thCls} style={{ width: '16%' }} onClick={() => onSort('player')}>Jugador<SortIndicator col="player" /></th>
            <th className={thCls} style={{ width: '13%' }}>Responsable</th>
            <th className={thCls} style={{ width: '10%' }} onClick={() => onSort('priority')}>Prioridad<SortIndicator col="priority" /></th>
            <th className={thCls} style={{ width: '11%' }} onClick={() => onSort('dueDate')}>Fecha<SortIndicator col="dueDate" /></th>
            <th className={thCls} style={{ width: '16%' }} onClick={() => onSort('status')}>Estado<SortIndicator col="status" /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">Sin tareas</td></tr>
          )}
          {sorted.map((t, i) => {
            const player   = players.find(p => p.id === t.playerId);
            const assignee = profiles.find(m => m.id === t.assigneeId);
            const isOverdue = !!(t.dueDate && new Date(t.dueDate + 'T12:00:00') < now && t.status !== 'completada');
            const isSelected = detailTaskId === t.id;
            return (
              <tr
                key={t.id}
                onClick={() => onOpenDetail(t)}
                className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
              >
                <td className="px-3 py-2">
                  <p className={`font-medium truncate ${t.status === 'completada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</p>
                </td>
                <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{player?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  {assignee && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                        style={{ background: 'hsl(220,72%,26%)' }} title={assignee.name}>{assignee.avatar}</span>
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
                    ? `${new Date(t.dueDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${isOverdue ? ' ⚠' : ''}`
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

/* ── KanbanCol: one column in the home kanban ── */
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
  const now = new Date();
  const prioBorder = (t: Task) =>
    t.priority === "alta"  ? "#E24B4A" :
    t.priority === "media" ? "#EF9F27" : "#94a3b8";

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const renderTask = (task: Task, dimmed = false) => {
    const player   = players.find(p => p.id === task.playerId);
    const assignee = profiles.find(m => m.id === task.assigneeId);
    const isOverdue = !dimmed && task.dueDate && new Date(task.dueDate) < now && task.status !== "completada";
    const isSelected = detailTaskId === task.id;

    return (
      <div
        key={task.id}
        onClick={() => onOpenDetail(task)}
        className={`bg-white rounded-xl border cursor-pointer transition-all hover:shadow-sm mb-2 overflow-hidden ${
          isSelected ? "border-blue-400 ring-1 ring-blue-200" :
          isOverdue   ? "border-red-200" :
          dimmed      ? "border-slate-100 opacity-60" :
          "border-slate-200 hover:border-slate-300"
        }`}
        style={{ borderLeftWidth: "3px", borderLeftColor: dimmed ? "#e2e8f0" : prioBorder(task) }}
      >
        <div className="p-2.5">
          <div className="flex items-start gap-2">
            <button
              onClick={e => { e.stopPropagation(); onCycleStatus(task); }}
              className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors"
              style={{
                background: task.status === "completada" ? "#10b981" : task.status === "en_progreso" ? "#3b82f6" : "transparent",
                borderColor: task.status === "completada" ? "#10b981" : task.status === "en_progreso" ? "#3b82f6" : prioBorder(task),
              }}
            />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium leading-snug ${dimmed ? "line-through text-slate-400" : "text-slate-800"}`}>
                {task.title}
              </p>
              {player && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{player.name}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {assignee && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0"
                      style={{ background: PRIMARY }}
                    >{initials(assignee.name)}</span>
                    {assignee.name.split(" ")[0]}
                  </span>
                )}
                {task.dueDate && (
                  <span className={`text-[11px] ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                    {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    {isOverdue ? " ⚠" : ""}
                  </span>
                )}
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
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {!isCompletedCol && (
          <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{tasks.length}</span>
        )}
        {isCompletedCol && (
          <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{completedCount}</span>
        )}
      </div>

      {isCompletedCol ? (
        <div>
          {showCompleted
            ? completedTasks.slice(0, 5).map(t => renderTask(t, true))
            : completedTasks.slice(0, 2).map(t => renderTask(t, true))
          }
          {completedCount > 2 && onToggleCompleted && (
            <button
              onClick={onToggleCompleted}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors py-1 flex items-center gap-1"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${showCompleted ? "rotate-90" : ""}`} />
              {showCompleted ? "Ocultar" : `Ver todas (${completedCount})`}
            </button>
          )}
          {completedCount === 0 && (
            <p className="text-[11px] text-slate-400 italic py-2">Sin completadas</p>
          )}
        </div>
      ) : (
        <div>
          {tasks.map(t => renderTask(t))}
          {tasks.length === 0 && (
            <p className="text-[11px] text-slate-400 italic py-2">Sin tareas</p>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Asignar manager a {count} jugador{count > 1 ? "es" : ""}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Selecciona un manager</label>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Elige manager —</option>
              {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
            </select>
          </div>
          <button onClick={() => managerId && onAssign(managerId)} disabled={!managerId || loading}
            className="w-full rounded-md text-white text-sm font-medium py-2 disabled:opacity-40 transition-colors"
            style={{ background: PRIMARY }}>
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
  const [club1, setClub1] = useState("");
  const [club2, setClub2] = useState("");
  const [isLoan, setIsLoan] = useState(false);
  const [managed1, setManaged1] = useState("");
  const [managed2, setManaged2] = useState("");
  const [reprStart, setReprStart] = useState("");
  const [reprEnd, setReprEnd] = useState("");
  const [clubEnd, setClubEnd] = useState("");
  const [optYears, setOptYears] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Nuevo jugador</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8">
          <F label="Nombre completo" value={name} onChange={setName} required />
          <div className="grid grid-cols-2 gap-3">
            <F label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} type="date" required />
            <F label="Nacionalidad" value={nationality} onChange={setNationality} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Posición principal" value={pos1} onChange={setPos1} required />
            <F label="Posición secundaria" value={pos2} onChange={setPos2} />
          </div>
          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Club(s)</p>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="isLoan" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} className="rounded" />
              <label htmlFor="isLoan" className="text-xs text-slate-600">Jugador cedido</label>
            </div>
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
              className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}>
              Añadir jugador
            </button>
          </div>
        </form>
      </div>
    </div>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Jugador (opcional)</label>
            <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Tarea general —</option>
              {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <F label="Título" value={title} onChange={setTitle} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none h-20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Asignado a</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Sin asignar —</option>
              {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "alta" | "media" | "baja")}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
            <select value={label} onChange={(e) => setLabel(e.target.value as TaskLabel | "")}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Sin tipo —</option>
              {(['General','Scouting','Distribución','Negociación','Reunión/Comida','Administrativa','Seguimiento','Informe','Marketing','Comunicación'] as const).map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <F label="Fecha de vencimiento" value={dueDate} onChange={setDueDate} type="date" />
          {/* Admin-only toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              checked={adminOnly}
              onChange={(e) => setAdminOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700 font-medium">Solo para admins</span>
            {adminOnly && (
              <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                Admin
              </span>
            )}
          </label>
          <div className="pt-2">
            <button type="submit" disabled={!title}
              className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}>
              Crear tarea
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditGeneralTaskModal({ task, profiles, players, onClose, onUpdate, onDelete }: {
  task: Task; profiles: Profile[]; players: Player[]; onClose: () => void;
  onUpdate: (task: Task) => void; onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [selectedPlayerId, setSelectedPlayerId] = useState(task.playerId === "general" ? "" : task.playerId);
  const [priority, setPriority] = useState<"alta" | "media" | "baja">(task.priority);
  const [label, setLabel] = useState<TaskLabel | "">(task.label ?? "");
  const [status, setStatus] = useState<"pendiente" | "en_progreso" | "completada">(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...task,
      title,
      description,
      playerId: selectedPlayerId || "general",
      assigneeId,
      priority,
      label: label || undefined,
      status,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-slate-800">Editar tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-3 pb-8">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Jugador (opcional)</label>
            <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Tarea general —</option>
              {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <F label="Título" value={title} onChange={setTitle} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Asignado a</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Sin asignar —</option>
              {profiles.map((m) => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
            <select value={label} onChange={(e) => setLabel(e.target.value as TaskLabel | "")}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">— Sin tipo —</option>
              {(['General','Scouting','Distribución','Negociación','Reunión/Comida','Administrativa','Seguimiento','Informe','Marketing','Comunicación'] as const).map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <F label="Fecha de vencimiento" value={dueDate} onChange={setDueDate} type="date" />
          <div className="pt-2 flex gap-2">
            <button type="submit" disabled={!title}
              className="flex-1 rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}>
              Guardar cambios
            </button>
            {onDelete && (
              <button type="button" onClick={() => { if (confirm("¿Eliminar esta tarea?")) onDelete(task.id); }}
                className="rounded-md text-red-600 border border-red-200 text-sm font-medium px-4 py-2.5 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
        {/* Task info */}
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-400">
            Creada: {new Date(task.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = "text", required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
            <p className="text-xs text-slate-400">{player.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 pb-6">
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
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta ⚡</option>
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
            className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors"
            style={{ background: PRIMARY }}
          >
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GLOBAL SEARCH ────────────────────────────────────────────
function GlobalSearch({ players, tasks, profiles, onSelectPlayer, onSelectTask, onClose }: {
  players: Player[]; tasks: Task[]; profiles: Profile[];
  onSelectPlayer: (id: string) => void;
  onSelectTask: (task: Task) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useState<HTMLInputElement | null>(null);

  const q = query.toLowerCase().trim();

  const matchedPlayers = q.length < 1 ? [] : players.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.positions.some(pos => pos.toLowerCase().includes(q)) ||
    p.clubs.some(c => c.name.toLowerCase().includes(q)) ||
    p.nationality.toLowerCase().includes(q)
  ).slice(0, 5);

  const matchedTasks = q.length < 1 ? [] : tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q)
  ).slice(0, 5);

  const hasResults = matchedPlayers.length > 0 || matchedTasks.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={el => { inputRef[1](el); if (el) el.focus(); }}
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar jugadores, tareas…"
            className="flex-1 text-sm text-slate-800 bg-transparent focus:outline-none placeholder-slate-400"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={onClose} className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-50">Esc</button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!hasResults && q.length > 0 && (
            <div className="py-8 text-center text-sm text-slate-400">Sin resultados para "{query}"</div>
          )}
          {!hasResults && q.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">Empieza a escribir para buscar…</div>
          )}

          {matchedPlayers.length > 0 && (
            <div>
              <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">Jugadores</p>
              {matchedPlayers.map(player => {
                const pendingCount = tasks.filter(t => t.playerId === player.id && t.status !== "completada").length;
                return (
                  <button key={player.id} onClick={() => onSelectPlayer(player.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-50 text-left">
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: PRIMARY }}>
                      {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{player.name}</p>
                      <p className="text-xs text-slate-400 truncate">{player.positions[0]} · {clubsLabel(player.clubs)}</p>
                    </div>
                    {pendingCount > 0 && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex-shrink-0">
                        {pendingCount} tareas
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {matchedTasks.length > 0 && (
            <div>
              <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">Tareas</p>
              {matchedTasks.map(task => {
                const taskPlayer = players.find(p => p.id === task.playerId);
                const assignee = profiles.find(p => p.id === task.assigneeId);
                return (
                  <button key={task.id} onClick={() => onSelectTask(task)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-50 text-left">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
                      task.priority === "alta" ? "bg-red-500" : task.priority === "media" ? "bg-amber-400" : "bg-slate-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${task.status === "completada" ? "line-through text-slate-400" : "text-slate-800"}`}>{task.title}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {taskPlayer ? taskPlayer.name : "General"}{assignee ? ` · ${assignee.name.split(" ")[0]}` : ""}
                      </p>
                    </div>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      task.status === "completada" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : task.status === "en_progreso" ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}>
                      {task.status === "completada" ? "✓" : task.status === "en_progreso" ? "→" : "·"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
