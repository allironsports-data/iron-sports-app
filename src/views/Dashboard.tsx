import { useState, useEffect } from "react";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import logoImg from '../assets/logo.jpeg';
import type { Player, Task } from "../types";
import { calcAge, clubsLabel } from "../types";
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
  ChevronRight,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  Table,
  Zap,
  TrendingUp,
  Eye,
  BarChart2,
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  view?: 'tareas' | 'jugadores';   // which section to show
  onViewChange?: (v: 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'estadisticas') => void;
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
}: Props) {
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddGeneralTask, setShowAddGeneralTask] = useState(false);
  const [editingGeneralTask, setEditingGeneralTask] = useState<Task | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  // quick filter from stat cards: overlays on top of tab filter
  const [quickFilter, setQuickFilter] = useState<"overdue" | "urgent" | "inprogress" | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tasksTab, setTasksTab] = useState<"yo" | "jugadores" | "equipo">("yo");
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

  // Tareas: assignee filter (only used in mineSubTab="all")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  // Cmd+K / Ctrl+K global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); }
      if (e.key === "Escape") { setShowSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Toast auto-dismiss
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  useEffect(() => {
    if (notifications.length > 0 && notifications[0].ts > Date.now() - 1000) {
      const latest = notifications[0];
      setToasts((prev) => [latest, ...prev].slice(0, 3));
      const timer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== latest.id)), 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  // Exclude intermediation-only players from mantenimiento
  const visiblePlayers = players.filter(p => !p.hiddenFromManagement)

  const pendingTasks = tasks.filter((t) => t.status !== "completada");
  const urgentTasks = tasks.filter(
    (t) => t.priority === "alta" && t.status !== "completada"
  );
  const inProgressTasks = tasks.filter((t) => t.status === "en_progreso");

  // myTasks: assigned to me (pending), excluding adminOnly tasks if not admin
  const myTasks = pendingTasks.filter((t) => {
    if (t.assigneeId !== currentProfile.id) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    return true;
  });
  // completed version for display
  const myTasksCompleted = tasks.filter((t) => {
    if (t.status !== "completada") return false;
    if (t.assigneeId !== currentProfile.id) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    return true;
  });

  // myPlayerTasks: tasks for my managed players (pending), excluding my own assigned tasks
  const myPlayerTasks = pendingTasks.filter((t) => {
    if (t.assigneeId === currentProfile.id) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    const player = players.find((p) => p.id === t.playerId);
    return player && player.managedBy.includes(currentProfile.id);
  });
  const myPlayerTasksCompleted = tasks.filter((t) => {
    if (t.status !== "completada") return false;
    if (t.assigneeId === currentProfile.id) return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    const player = players.find((p) => p.id === t.playerId);
    return player && player.managedBy.includes(currentProfile.id);
  });

  // generalTasksCompleted: completed general tasks for kanban
  const generalTasksCompleted = tasks.filter((t) => {
    if (t.status !== "completada") return false;
    if (t.playerId !== "" && t.playerId !== "general") return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    return true;
  });

  // Tasks for kanban: respects tab filter + quickFilter from stat cards
  const activeDashboardTasks = (status: Task["status"]) => {
    const now = new Date();
    const notAdmin = (t: Task) => t.adminOnly && !currentProfile.is_admin;

    // quickFilter uses the FULL task pool (ignore mineSubTab)
    if (quickFilter === "overdue") {
      const pool = tasks.filter(t => t.status !== "completada" && t.dueDate && new Date(t.dueDate) < now && !notAdmin(t));
      return pool.filter(t => t.status === status).sort((a, b) => {
        const prio = { alta: 0, media: 1, baja: 2 };
        return prio[a.priority] - prio[b.priority];
      });
    }
    if (quickFilter === "urgent") {
      const pool = tasks.filter(t => t.priority === "alta" && t.status !== "completada" && !notAdmin(t));
      return pool.filter(t => t.status === status);
    }
    if (quickFilter === "inprogress") {
      if (status !== "en_progreso") return [];
      return tasks.filter(t => t.status === "en_progreso" && !notAdmin(t));
    }

    // Normal pool from tab selection (used by "Equipo" kanban)
    let pool: Task[] = [];
    if (tasksTab === "jugadores") {
      pool = myPlayerTasks;
    } else if (tasksTab === "equipo") {
      pool = tasks.filter(t => t.status !== "completada" && !notAdmin(t));
      if (assigneeFilter !== "all") {
        pool = pool.filter(t => t.assigneeId === assigneeFilter);
      }
    } else {
      // "yo" tab
      pool = myTasks;
    }
    return pool
      .filter(t => t.status === status)
      .sort((a, b) => {
        const aOver = a.dueDate && new Date(a.dueDate) < now ? 0 : 1;
        const bOver = b.dueDate && new Date(b.dueDate) < now ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const prio = { alta: 0, media: 1, baja: 2 };
        return prio[a.priority] - prio[b.priority];
      });
  };

  const overdueDashboardTasks = tasks.filter(
    t => t.status !== "completada" && t.dueDate && new Date(t.dueDate) < new Date()
    && !(t.adminOnly && !currentProfile.is_admin)
  );

  const completedTasksForKanban = [
    ...myTasksCompleted,
    ...myPlayerTasksCompleted,
    ...generalTasksCompleted,
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);

  // "Yo" tab computed
  const overdueMyTasks = myTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
  const activeMyTasks  = myTasks.filter(t => !(t.dueDate && new Date(t.dueDate) < new Date()));
  const urgentMyCount  = myTasks.filter(t => t.priority === "alta").length;
  const inProgressMyCount = myTasks.filter(t => t.status === "en_progreso").length;

  // "Mis jugadores" tab: group by player
  const playerTaskGroups: { player: Player; ptasks: Task[] }[] = (() => {
    const pids = Array.from(new Set(myPlayerTasks.map(t => t.playerId)));
    return pids
      .map(pid => ({ player: players.find(p => p.id === pid)!, ptasks: myPlayerTasks.filter(t => t.playerId === pid) }))
      .filter(g => g.player != null);
  })();

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
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-14 right-2 sm:right-4 z-50 flex flex-col gap-2 w-72 sm:w-80">
          {toasts.map((t) => (
            <div key={t.id} className={`rounded-lg shadow-lg border p-3 text-sm flex items-start gap-2 animate-[slideIn_0.3s_ease] ${
              t.type === 'task_done' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-600">
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
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
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

        {/* Tab nav: Tareas | Jugadores | Distribución */}
        {onViewChange && (
          <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
            {([
              { id: 'tareas'       as const, label: 'Tareas' },
              { id: 'jugadores'    as const, label: 'Jugadores' },
              { id: 'distribucion' as const, label: 'Distribución', icon: <TrendingUp className="w-3.5 h-3.5" /> },
              { id: 'captacion'    as const, label: 'Captación',    icon: <Eye className="w-3.5 h-3.5" /> },
              ...(currentProfile.is_admin
                ? [{ id: 'estadisticas' as const, label: 'Stats', icon: <BarChart2 className="w-3.5 h-3.5" /> }]
                : []),
            ]).map(tab => {
              const isActive = (tab.id === 'distribucion' || tab.id === 'captacion' || tab.id === 'estadisticas') ? false : view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onViewChange(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-[hsl(220,72%,26%)] text-[hsl(220,72%,26%)]'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
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
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
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
        {view === 'tareas' && (<>

        {/* ── Stat cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-semibold text-slate-800">{visiblePlayers.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Jugadores</p>
          </div>
          <div
            className={`border rounded-xl p-3 text-center cursor-pointer transition-colors ${
              quickFilter === "overdue"
                ? "bg-red-50 border-red-300"
                : overdueDashboardTasks.length > 0 ? "bg-white border-red-200 hover:border-red-300" : "bg-white border-slate-200 hover:border-slate-300"
            }`}
            onClick={() => setQuickFilter(q => q === "overdue" ? null : "overdue")}
          >
            <p className={`text-2xl font-semibold ${overdueDashboardTasks.length > 0 ? "text-red-500" : "text-slate-800"}`}>
              {overdueDashboardTasks.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Vencidas</p>
          </div>
          <div
            className={`border rounded-xl p-3 text-center cursor-pointer transition-colors ${
              quickFilter === "urgent" ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200 hover:border-amber-300"
            }`}
            onClick={() => setQuickFilter(q => q === "urgent" ? null : "urgent")}
          >
            <p className={`text-2xl font-semibold ${urgentTasks.length > 0 ? "text-amber-600" : "text-slate-800"}`}>{urgentTasks.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Urgentes</p>
          </div>
          <div
            className={`border rounded-xl p-3 text-center cursor-pointer transition-colors ${
              quickFilter === "inprogress" ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
            }`}
            onClick={() => setQuickFilter(q => q === "inprogress" ? null : "inprogress")}
          >
            <p className="text-2xl font-semibold text-slate-800">{inProgressTasks.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">En progreso</p>
          </div>
        </div>

        {/* ── Tareas (nueva arquitectura) ──────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl mb-5 overflow-hidden">

          {/* Header: 3 tabs + Nueva button */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {([
                { id: "yo"        as const, label: `Yo (${myTasks.length})` },
                { id: "jugadores" as const, label: `Mis jugadores (${myPlayerTasks.length})` },
                { id: "equipo"    as const, label: "Equipo" },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setTasksTab(tab.id);
                    setQuickFilter(null);
                    if (tab.id !== "equipo") setAssigneeFilter("all");
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    tasksTab === tab.id
                      ? "text-white border-transparent"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                  style={tasksTab === tab.id ? { background: PRIMARY } : {}}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {onAddGeneralTask && (
              <button
                onClick={() => setShowAddGeneralTask(true)}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-3 h-3" /> Nueva
              </button>
            )}
          </div>

          {/* ── TAB: YO ───────────────────────────────────── */}
          {tasksTab === "yo" && (
            <div className="p-4 space-y-4">
              {/* Stat chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${overdueMyTasks.length > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  <AlertTriangle className="w-3 h-3" /> {overdueMyTasks.length} vencida{overdueMyTasks.length !== 1 ? "s" : ""}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${urgentMyCount > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  <Zap className="w-3 h-3" /> {urgentMyCount} urgente{urgentMyCount !== 1 ? "s" : ""}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${inProgressMyCount > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  {inProgressMyCount} en progreso
                </span>
              </div>

              {/* Vencidas section */}
              {overdueMyTasks.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Vencidas
                  </p>
                  <div className="space-y-2">
                    {overdueMyTasks.map(t => (
                      <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                        onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                        detailTaskId={detailTask?.id} overdue />
                    ))}
                  </div>
                </div>
              )}

              {/* Activas section */}
              {activeMyTasks.length > 0 && (
                <div>
                  {overdueMyTasks.length > 0 && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Activas</p>
                  )}
                  <div className="space-y-2">
                    {activeMyTasks.map(t => (
                      <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                        onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                        detailTaskId={detailTask?.id} />
                    ))}
                  </div>
                </div>
              )}

              {myTasks.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">✓ Sin tareas pendientes</div>
              )}

              {/* Completadas expandibles */}
              {myTasksCompleted.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setShowCompletedMine(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${showCompletedMine ? "rotate-90" : ""}`} />
                    {showCompletedMine ? "Ocultar completadas" : `Ver completadas (${myTasksCompleted.length})`}
                  </button>
                  {showCompletedMine && (
                    <div className="space-y-2 mt-2">
                      {myTasksCompleted.slice(0, 5).map(t => (
                        <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                          onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                          detailTaskId={detailTask?.id} dimmed />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: MIS JUGADORES ────────────────────────── */}
          {tasksTab === "jugadores" && (
            <div className="p-4 space-y-5">
              {playerTaskGroups.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">Sin tareas pendientes de tus jugadores</div>
              )}
              {playerTaskGroups.map(({ player, ptasks }) => (
                <div key={player.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: PRIMARY }}
                    >
                      {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <p className="text-xs font-semibold text-slate-700">{player.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{ptasks.length}</span>
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
          )}

          {/* ── TAB: EQUIPO ───────────────────────────────── */}
          {tasksTab === "equipo" && (
            <>
              {/* Person filter chips */}
              <div className="px-4 pt-3 pb-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setAssigneeFilter("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    assigneeFilter === "all" ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                  style={assigneeFilter === "all" ? { background: PRIMARY } : {}}
                >
                  Todos
                </button>
                {profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setAssigneeFilter(assigneeFilter === p.id ? "all" : p.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      assigneeFilter === p.id ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                    }`}
                    style={assigneeFilter === p.id ? { background: PRIMARY } : {}}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                      style={{ background: assigneeFilter === p.id ? "rgba(255,255,255,0.3)" : PRIMARY }}
                    >
                      {p.avatar}
                    </span>
                    {p.name.split(" ")[0]}
                  </button>
                ))}
              </div>

              {/* Overdue banner */}
              {overdueDashboardTasks.length > 0 && (
                <div className="mx-4 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-medium">
                    {overdueDashboardTasks.length} tarea{overdueDashboardTasks.length > 1 ? "s" : ""} vencida{overdueDashboardTasks.length > 1 ? "s" : ""} · revisa antes de continuar
                  </p>
                </div>
              )}

              {/* Desktop: 3-column kanban */}
              <div className="hidden sm:grid grid-cols-3 gap-0 divide-x divide-slate-100 p-4 pt-3">
                <KanbanCol
                  label="Pendiente" dotColor="#94a3b8"
                  tasks={activeDashboardTasks("pendiente")}
                  players={players} profiles={profiles}
                  onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                  showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                  completedCount={completedTasksForKanban.length} completedTasks={completedTasksForKanban}
                />
                <KanbanCol
                  label="En progreso" dotColor="#378ADD"
                  tasks={activeDashboardTasks("en_progreso")}
                  players={players} profiles={profiles}
                  onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                />
                <KanbanCol
                  label="Completada" dotColor="#1D9E75"
                  tasks={[]}
                  players={players} profiles={profiles}
                  onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask} detailTaskId={detailTask?.id}
                  showCompleted={showCompletedMine} onToggleCompleted={() => setShowCompletedMine(v => !v)}
                  completedCount={completedTasksForKanban.length} completedTasks={completedTasksForKanban}
                  isCompletedCol
                />
              </div>

              {/* Mobile: flat list (no kanban) */}
              <div className="sm:hidden p-4 space-y-2">
                {[...activeDashboardTasks("pendiente"), ...activeDashboardTasks("en_progreso")].length === 0 ? (
                  <p className="text-center py-6 text-sm text-slate-400">Sin tareas</p>
                ) : (
                  [...activeDashboardTasks("pendiente"), ...activeDashboardTasks("en_progreso")].map(t => (
                    <TaskListRow key={t.id} task={t} players={players} profiles={profiles}
                      onCycleStatus={cycleTaskStatus} onOpenDetail={setDetailTask}
                      detailTaskId={detailTask?.id}
                      overdue={!!(t.dueDate && new Date(t.dueDate) < new Date())} />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        </>)}

        {/* ── Jugadores section ────────────────────────────── */}
        {view === 'jugadores' && (<>

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
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Repr.</p>
                        <p className={`text-xs font-semibold ${repDaysLeft > 0 && repDaysLeft < 183 ? 'text-red-600' : repDaysLeft >= 183 && repDaysLeft < 365 ? 'text-amber-600' : 'text-slate-700'}`}>{repEndStr}</p>
                      </div>
                    )}
                    <div className={`rounded-lg px-2.5 py-1.5 ${clubDaysLeft > 0 && clubDaysLeft < 183 ? 'bg-red-50 border border-red-100' : clubDaysLeft >= 183 && clubDaysLeft < 365 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Club</p>
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
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        repDaysLeft < 183 ? "bg-red-50 text-red-600" : repDaysLeft < 365 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-500"
                      }`}>R {player.representationContract.end ? new Date(player.representationContract.end).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : "—"}</span>
                    )}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
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
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">{urgent.length}⚡</span>
                    )}
                    {playerTasks.length > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{playerTasks.length}</span>
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
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider">
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
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            repDaysLeft < 183 ? 'bg-red-50 text-red-600' : repDaysLeft < 365 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                          }`}>{repEndStr}</span>
                        </td>
                      )}
                      {/* Club contract */}
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">{urgent.length}⚡</span>
                          )}
                          {playerTasks.length > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{playerTasks.length}</span>
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
        <AddGeneralTaskModal profiles={profiles} onClose={() => setShowAddGeneralTask(false)}
          onAdd={(t) => { onAddGeneralTask(t); setShowAddGeneralTask(false); }} />
      )}

      {editingGeneralTask && (
        <EditGeneralTaskModal
          task={editingGeneralTask}
          profiles={profiles}
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

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          player={players.find((p) => p.id === detailTask.playerId)}
          profiles={profiles}
          currentProfile={currentProfile}
          onGoToPlayer={onSelectPlayer}
          onClose={() => setDetailTask(null)}
          onUpdate={(updated) => {
            if (detailTask.playerId === "general" || detailTask.playerId === "") {
              if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
            } else {
              if (onUpdateTask) onUpdateTask(updated);
            }
          }}
          onSaveAndClose={(updated) => {
            if (detailTask.playerId === "general" || detailTask.playerId === "") {
              if (onUpdateGeneralTask) onUpdateGeneralTask(updated);
            } else {
              if (onUpdateTask) onUpdateTask(updated);
            }
            setDetailTask(null);
          }}
          onDelete={(taskId) => {
            if (onDeleteGeneralTask) onDeleteGeneralTask(taskId);
            setDetailTask(null);
          }}
        />
      )}
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
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{player.name}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {assignee && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0"
                      style={{ background: PRIMARY }}
                    >{initials(assignee.name)}</span>
                    {assignee.name.split(" ")[0]}
                  </span>
                )}
                {task.dueDate && (
                  <span className={`text-[10px] ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
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
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {!isCompletedCol && (
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{tasks.length}</span>
        )}
        {isCompletedCol && (
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{completedCount}</span>
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
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors py-1 flex items-center gap-1"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${showCompleted ? "rotate-90" : ""}`} />
              {showCompleted ? "Ocultar" : `Ver todas (${completedCount})`}
            </button>
          )}
          {completedCount === 0 && (
            <p className="text-[10px] text-slate-400 italic py-2">Sin completadas</p>
          )}
        </div>
      ) : (
        <div>
          {tasks.map(t => renderTask(t))}
          {tasks.length === 0 && (
            <p className="text-[10px] text-slate-400 italic py-2">Sin tareas</p>
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

function AddGeneralTaskModal({ profiles, onClose, onAdd }: {
  profiles: Profile[]; onClose: () => void; onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: "t" + Date.now(),
      title,
      description,
      playerId: "general",
      assigneeId,
      priority,
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
          <h2 className="text-sm font-semibold text-slate-800">Nueva tarea general</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8">
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
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
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

function EditGeneralTaskModal({ task, profiles, onClose, onUpdate, onDelete }: {
  task: Task; profiles: Profile[]; onClose: () => void;
  onUpdate: (task: Task) => void; onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [priority, setPriority] = useState<"alta" | "media" | "baja">(task.priority);
  const [status, setStatus] = useState<"pendiente" | "en_progreso" | "completada">(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...task,
      title,
      description,
      assigneeId,
      priority,
      status,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-slate-800">Editar tarea general</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-3 pb-8">
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
          <p className="text-[10px] text-slate-400">
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
function QuickTaskModal({ player, profiles, onClose, onAdd }: {
  player: Player; profiles: Profile[];
  onClose: () => void; onAdd: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
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
                    assigneeId, priority, status: "pendiente", dueDate: dueDate || undefined,
                    createdAt: new Date().toISOString(), comments: [] });
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
                assigneeId, priority, status: "pendiente", dueDate: dueDate || undefined,
                createdAt: new Date().toISOString(), comments: [] });
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
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">Jugadores</p>
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
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex-shrink-0">
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
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">Tareas</p>
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
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
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
