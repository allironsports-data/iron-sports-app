import { useState, useEffect, useCallback } from "react";
import * as db from '../lib/db';
import logoImg from '../assets/logo.jpeg';
import type { Player, Task } from "../types";
import { calcAge, clubsLabel } from "../types";
import type { Profile } from "../contexts/AuthContext";
import type { AppNotification } from "../App";
import {
  LogOut,
  Users,
  ClipboardList,
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
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
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
  const [taskView, setTaskView] = useState<"pending" | "urgent" | "mine" | "inprogress" | null>("mine");
  const [showNotifications, setShowNotifications] = useState(false);
  const [mineSubTab, setMineSubTab] = useState<"assigned" | "players" | "general">("assigned");
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompletedMine, setShowCompletedMine] = useState(false);
  const [showCompletedPlayers, setShowCompletedPlayers] = useState(false);
  const [showCompletedGeneral, setShowCompletedGeneral] = useState(false);

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

  // generalTasks: general tasks assigned to ME (or unassigned) — shown in "Mis tareas > Generales"
  // Tasks assigned to others only appear in the top stats (pendingTasks/urgentTasks)
  const generalTasks = tasks.filter((t) => {
    if (t.status === "completada") return false;
    if (t.playerId !== "" && t.playerId !== "general") return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    // Only show if assigned to me or unassigned
    if (t.assigneeId && t.assigneeId !== currentProfile.id) return false;
    return true;
  });
  const generalTasksCompleted = tasks.filter((t) => {
    if (t.status !== "completada") return false;
    if (t.playerId !== "" && t.playerId !== "general") return false;
    if (t.adminOnly && !currentProfile.is_admin) return false;
    if (t.assigneeId && t.assigneeId !== currentProfile.id) return false;
    return true;
  });

  // Birthdays
  const birthdaysToday = players.filter((p) => isBirthdayToday(p.birthDate));
  const birthdaysSoon = players.filter((p) => isBirthdaySoon(p.birthDate, 7));

  const filtered = players.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.positions[0] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.clubs.some((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    const matchManager =
      managerFilter === "all" || p.managedBy.includes(managerFilter);
    return matchSearch && matchManager;
  });

  // Task view filtered tasks
  const viewTasks = taskView === "pending" ? pendingTasks
    : taskView === "urgent" ? urgentTasks
    : taskView === "inprogress" ? inProgressTasks
    : taskView === "mine" ? myTasks
    : [];

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
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex-shrink-0">
              <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-slate-900 uppercase">All Iron Sports</span>
              <span className="hidden sm:inline text-slate-300 mx-2">·</span>
              <span className="hidden sm:inline text-xs text-slate-400 uppercase tracking-widest">Gestión de jugadores</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
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
              className="w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: PRIMARY }}
            >{currentProfile.avatar}</div>
            {currentProfile.is_admin && onOverview && (
              <button onClick={onOverview} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Overview">
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {currentProfile.is_admin && onAdmin && (
              <button onClick={onAdmin} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Admin">
                <Users className="w-4 h-4" />
              </button>
            )}
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
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

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
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

        {/* Stats — clickable */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-4 sm:mb-6">
          <StatCard icon={<Users className="w-4 h-4" />} label="Jugadores" value={players.length} color="blue"
            onClick={() => setTaskView(null)} active={taskView === null} />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Pendientes" value={pendingTasks.length} color="amber"
            onClick={() => setTaskView(taskView === "pending" ? null : "pending")} active={taskView === "pending"} />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Urgentes" value={urgentTasks.length} color="red"
            onClick={() => setTaskView(taskView === "urgent" ? null : "urgent")} active={taskView === "urgent"} />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="En proceso" value={inProgressTasks.length} color="purple"
            onClick={() => setTaskView(taskView === "inprogress" ? null : "inprogress")} active={taskView === "inprogress"} />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Mis tareas" value={myTasks.length} color="green"
            onClick={() => setTaskView(taskView === "mine" ? null : "mine")} active={taskView === "mine"} />
        </div>

        {/* Mine view — default and new design */}
        {taskView === "mine" && (
          <div className="mb-4 sm:mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Mis tareas</h2>
              {onAddGeneralTask && (
                <button
                  onClick={() => setShowAddGeneralTask(true)}
                  className="inline-flex items-center gap-1 rounded text-slate-600 bg-slate-50 border border-slate-200 text-xs font-medium px-2 py-1 hover:bg-slate-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /><span className="hidden sm:inline">Nueva tarea</span>
                </button>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="px-3 sm:px-4 py-2 border-b border-slate-100 flex gap-2 bg-slate-50">
              <button
                onClick={() => setMineSubTab("assigned")}
                className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                  mineSubTab === "assigned"
                    ? "bg-white text-slate-900 border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Asignadas a mí ({myTasks.length})
              </button>
              <button
                onClick={() => setMineSubTab("players")}
                className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                  mineSubTab === "players"
                    ? "bg-white text-slate-900 border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                De mis jugadores ({myPlayerTasks.length})
              </button>
              {currentProfile.is_admin && (
                <button
                  onClick={() => setMineSubTab("general")}
                  className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                    mineSubTab === "general"
                      ? "bg-white text-slate-900 border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Generales ({generalTasks.length})
                </button>
              )}
            </div>

            {/* Task list for selected sub-tab */}
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {mineSubTab === "assigned" && (
                <>
                  {myTasks.length === 0 && myTasksCompleted.length === 0 ? (
                    <div className="px-3 sm:px-4 py-6 text-center text-xs text-slate-400">Sin tareas asignadas</div>
                  ) : (
                    <>
                      {myTasks.map((task) => (
                        <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                          onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                          isSelected={detailTask?.id === task.id} />
                      ))}
                      {myTasksCompleted.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowCompletedMine((v) => !v)}
                            className="w-full px-3 sm:px-4 py-2 text-left text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform ${showCompletedMine ? "rotate-90" : ""}`} />
                            {showCompletedMine ? "Ocultar" : "Ver"} completadas ({myTasksCompleted.length})
                          </button>
                          {showCompletedMine && myTasksCompleted.map((task) => (
                            <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                              onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                              isSelected={detailTask?.id === task.id} completed />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {mineSubTab === "players" && (
                <>
                  {myPlayerTasks.length === 0 && myPlayerTasksCompleted.length === 0 ? (
                    <div className="px-3 sm:px-4 py-6 text-center text-xs text-slate-400">Sin tareas de tus jugadores</div>
                  ) : (
                    <>
                      {myPlayerTasks.map((task) => (
                        <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                          onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                          isSelected={detailTask?.id === task.id} />
                      ))}
                      {myPlayerTasksCompleted.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowCompletedPlayers((v) => !v)}
                            className="w-full px-3 sm:px-4 py-2 text-left text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform ${showCompletedPlayers ? "rotate-90" : ""}`} />
                            {showCompletedPlayers ? "Ocultar" : "Ver"} completadas ({myPlayerTasksCompleted.length})
                          </button>
                          {showCompletedPlayers && myPlayerTasksCompleted.map((task) => (
                            <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                              onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                              isSelected={detailTask?.id === task.id} completed />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {mineSubTab === "general" && currentProfile.is_admin && (
                <>
                  {generalTasks.length === 0 && generalTasksCompleted.length === 0 ? (
                    <div className="px-3 sm:px-4 py-6 text-center text-xs text-slate-400">Sin tareas generales</div>
                  ) : (
                    <>
                      {generalTasks.map((task) => (
                        <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                          onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                          isSelected={detailTask?.id === task.id} />
                      ))}
                      {generalTasksCompleted.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowCompletedGeneral((v) => !v)}
                            className="w-full px-3 sm:px-4 py-2 text-left text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform ${showCompletedGeneral ? "rotate-90" : ""}`} />
                            {showCompletedGeneral ? "Ocultar" : "Ver"} completadas ({generalTasksCompleted.length})
                          </button>
                          {showCompletedGeneral && generalTasksCompleted.map((task) => (
                            <TaskRow key={task.id} task={task} players={players} profiles={profiles}
                              onCycleStatus={() => cycleTaskStatus(task)} onOpenDetail={() => setDetailTask(task)}
                              isSelected={detailTask?.id === task.id} completed />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Expanded task list view for pending/urgent/inprogress */}
        {(taskView === "pending" || taskView === "urgent" || taskView === "inprogress") && viewTasks.length > 0 && (
          <div className="mb-4 sm:mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                {taskView === "pending" ? "Todas las tareas pendientes" : taskView === "urgent" ? "Tareas urgentes" : "Tareas en proceso"}
              </h2>
              <button onClick={() => setTaskView(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {viewTasks.map((task) => {
                const player = players.find((p) => p.id === task.playerId);
                const assignee = profiles.find((m) => m.id === task.assigneeId);
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <button
                    key={task.id}
                    onClick={() => onSelectPlayer(task.playerId)}
                    className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      task.priority === "alta" ? "bg-red-500" : task.priority === "media" ? "bg-amber-400" : "bg-slate-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{task.title}</p>
                      <p className="text-xs text-slate-400">{player?.name} · {assignee?.name ?? "Sin asignar"}</p>
                    </div>
                    {task.dueDate && (
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
              Todos ({players.length})
            </button>
            {profiles.map((m) => {
              const count = players.filter((p) => p.managedBy.includes(m.id)).length;
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

        {/* Player cards grid */}
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

                {/* Name & basic info */}
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">{player.name}</h3>
                <p className="text-sm text-slate-500 truncate mt-0.5">
                  {player.positions[0]}{player.positions[1] ? ` / ${player.positions[1]}` : ''} · {clubsLabel(player.clubs)}
                </p>
                <p className="text-sm text-slate-400">
                  {age} años · {player.nationality}
                </p>

                {/* Contracts row */}
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

                {/* Bottom row: managers + tasks */}
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

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">No se encontraron jugadores</div>
        )}
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

function TaskRow({ task, players, profiles, onCycleStatus, onOpenDetail, completed = false, isSelected = false }: {
  task: Task;
  players: Player[];
  profiles: Profile[];
  onCycleStatus: () => void;
  onOpenDetail: () => void;
  completed?: boolean;
  isSelected?: boolean;
}) {
  const player = players.find((p) => p.id === task.playerId);
  const assignee = profiles.find((m) => m.id === task.assigneeId);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completada";

  const statusBadge = task.status === "completada"
    ? { label: "Completada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
    : task.status === "en_progreso"
    ? { label: "En progreso", cls: "bg-blue-100 text-blue-700 border-blue-200" }
    : { label: "Pendiente", cls: "bg-slate-100 text-slate-600 border-slate-200" };

  const priorityBadge = task.priority === "alta"
    ? { label: "Alta", cls: "bg-red-100 text-red-700 border-red-200" }
    : task.priority === "media"
    ? { label: "Media", cls: "bg-amber-100 text-amber-700 border-amber-200" }
    : null;

  const rowBg = isSelected
    ? "bg-blue-50 border-l-2 border-blue-400"
    : task.adminOnly
    ? completed ? "bg-rose-50/40 opacity-50" : "bg-rose-50 hover:bg-rose-100/70"
    : completed ? "opacity-50 hover:bg-slate-50" : "hover:bg-slate-50";

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`px-3 sm:px-4 py-3 transition-colors cursor-pointer ${rowBg}`} onClick={onOpenDetail}>
      <div className="flex items-start gap-2.5">
        {/* Status cycle dot */}
        <button
          onClick={(e) => { e.stopPropagation(); onCycleStatus(); }}
          className="mt-1 w-3 h-3 rounded-full flex-shrink-0 border-2 transition-colors hover:scale-125"
          style={{
            background: task.status === "completada" ? "#10b981"
              : task.status === "en_progreso" ? "#3b82f6" : "transparent",
            borderColor: task.status === "completada" ? "#10b981"
              : task.status === "en_progreso" ? "#3b82f6"
              : task.priority === "alta" ? "#ef4444"
              : task.priority === "media" ? "#f59e0b" : "#94a3b8",
          }}
          title="Cambiar estado"
        />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <p className={`text-sm font-medium ${completed ? "line-through text-slate-400" : "text-slate-800"}`}>
              {task.title}
            </p>
            {task.adminOnly && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-rose-500 border border-rose-200 bg-rose-50 rounded px-1 py-px">admin</span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status badge */}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            {/* Priority badge */}
            {priorityBadge && !completed && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${priorityBadge.cls}`}>
                {priorityBadge.label}
              </span>
            )}
            {/* Player */}
            {player && (
              <span className="text-[11px] text-slate-400 truncate max-w-[100px]">{player.name}</span>
            )}
            {/* Assignee avatar chip */}
            {assignee && (
              <span className="inline-flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {initials(assignee.name)}
                </span>
                <span className="text-[11px] text-slate-500">{assignee.name.split(" ")[0]}</span>
              </span>
            )}
            {/* Due date */}
            {task.dueDate && (
              <span className={`text-[11px] ml-auto flex-shrink-0 ${isOverdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                {isOverdue ? "⚠ " : ""}{new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskDetailPanel({ task, player, profiles, currentProfile, onClose, onUpdate, onSaveAndClose, onDelete, onGoToPlayer }: {
  task: Task;
  player: Player | undefined;
  profiles: Profile[];
  currentProfile: Profile;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onSaveAndClose: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onGoToPlayer?: (playerId: string) => void;
}) {
  const canEdit = currentProfile.is_admin || task.assigneeId === currentProfile.id;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<"pendiente" | "en_progreso" | "completada">(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [watchers, setWatchers] = useState<string[]>(task.watchers ?? []);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState(task.comments ?? []);
  const [sendingComment, setSendingComment] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const fetched = await db.fetchComments(task.id);
      setLocalComments(fetched);
    } catch {
      // silently ignore
    }
  }, [task.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Sync when task prop changes (e.g. status toggled from row)
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setAssigneeId(task.assigneeId);
    setWatchers(task.watchers ?? []);
  }, [task.id, task.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    onSaveAndClose({ ...task, title, description, status, assigneeId, watchers });
  };

  const handleStatusChange = (newStatus: "pendiente" | "en_progreso" | "completada") => {
    setStatus(newStatus);
    onUpdate({ ...task, title, description, status: newStatus, assigneeId, watchers });
  };

  const toggleWatcher = (profileId: string) => {
    setWatchers((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const newComment = await db.createComment(task.id, currentProfile.id, commentText.trim());
      setLocalComments((prev) => [...prev, newComment]);
      setCommentText("");
    } catch (e) {
      console.error("Error enviando comentario:", e);
    } finally {
      setSendingComment(false);
    }
  };

  const assignee = profiles.find((p) => p.id === (canEdit ? assigneeId : task.assigneeId));
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completada";

  const priorityLabel = task.priority === "alta" ? "Alta" : task.priority === "media" ? "Media" : "Baja";
  const priorityColor = task.priority === "alta" ? "text-red-600" : task.priority === "media" ? "text-amber-600" : "text-slate-500";

  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-30 bg-black/30 sm:hidden" onClick={onClose} />
      {/* Desktop subtle backdrop — clicking closes panel */}
      <div className="fixed inset-0 z-30 hidden sm:block" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed bottom-0 inset-x-0 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 z-40
                   w-full sm:w-[400px] bg-white
                   rounded-t-2xl sm:rounded-none
                   border-t sm:border-t-0 sm:border-l border-slate-200 shadow-2xl
                   flex flex-col max-h-[92vh] sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {task.adminOnly && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-rose-500 border border-rose-200 bg-rose-50 rounded px-1 py-px">admin</span>
              )}
              {task.priority === "alta" && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-red-500 border border-red-200 bg-red-50 rounded px-1 py-px">urgente</span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">
              {canEdit ? title : task.title}
            </h2>
            {player && (
              <button
                onClick={() => { if (onGoToPlayer) { onGoToPlayer(player.id); onClose(); } }}
                className="text-xs text-blue-600 hover:underline mt-0.5 flex items-center gap-0.5"
              >
                {player.name} <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Read-only notice */}
            {!canEdit && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                <span className="text-base">👀</span>
                <span>Solo puedes comentar — editar lo hace el responsable.</span>
              </div>
            )}

            {/* Status buttons — visible to all, only actionable by editor */}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Estado</p>
              <div className="flex gap-1.5">
                {(["pendiente", "en_progreso", "completada"] as const).map((s) => {
                  const labels = { pendiente: "Pendiente", en_progreso: "En proceso", completada: "Completada" };
                  const active = status === s;
                  const activeCls = s === "pendiente" ? "bg-slate-200 text-slate-900 border-slate-300"
                    : s === "en_progreso" ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300";
                  return (
                    <button
                      key={s}
                      onClick={() => canEdit && handleStatusChange(s)}
                      disabled={!canEdit}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors
                        ${active ? activeCls : "bg-white text-slate-500 border-slate-200"}
                        ${canEdit ? "hover:opacity-90" : "cursor-default opacity-70"}`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Edit fields (only for editors) */}
            {canEdit ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Título</label>
                  <input
                    type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
                  <textarea
                    value={description} onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none h-20"
                  />
                </div>
              </>
            ) : (
              description && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Descripción</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2">{description}</p>
                </div>
              )
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Prioridad</p>
                <p className={`font-semibold ${priorityColor}`}>{priorityLabel}</p>
              </div>
              {task.dueDate && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Vencimiento</p>
                  <p className={`font-semibold ${isOverdue ? "text-red-600" : "text-slate-700"}`}>
                    {isOverdue ? "⚠ " : ""}{new Date(task.dueDate).toLocaleDateString("es-ES")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Creada</p>
                <p className="text-slate-600">{new Date(task.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p>
              </div>
              {assignee && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Responsable</p>
                  <div className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {initials(assignee.name)}
                    </span>
                    <span className="text-slate-700 font-medium truncate">{assignee.name.split(" ")[0]}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Responsable selector (edit only) */}
            {canEdit && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Responsable</label>
                <select
                  value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">— Sin asignar —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Watchers */}
            {canEdit ? (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Adjuntados</p>
                <div className="flex flex-wrap gap-1.5">
                  {profiles.map((p) => {
                    const active = watchers.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleWatcher(p.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {p.avatar} {p.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : watchers.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Adjuntados</p>
                <div className="flex flex-wrap gap-1.5">
                  {watchers.map((wid) => {
                    const w = profiles.find((p) => p.id === wid);
                    if (!w) return null;
                    return (
                      <span key={wid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border bg-blue-50 border-blue-200 text-blue-700">
                        {w.avatar} {w.name.split(" ")[0]}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Comments thread */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-600 mb-3">
                Comentarios {localComments.length > 0 ? `(${localComments.length})` : ""}
              </p>
              {localComments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin comentarios aún</p>
              ) : (
                <div className="space-y-3">
                  {localComments.map((comment) => {
                    const author = profiles.find((p) => p.id === comment.authorId);
                    const isMe = comment.authorId === currentProfile.id;
                    return (
                      <div key={comment.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ background: PRIMARY }}>
                          {author ? initials(author.name) : "?"}
                        </div>
                        <div className={`flex-1 max-w-[80%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                          <div className={`rounded-2xl px-3 py-2 text-xs ${
                            isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-slate-100 text-slate-700 rounded-tl-sm"
                          }`}>
                            {comment.content}
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5 px-1">
                            {isMe ? "Tú" : (author?.name.split(" ")[0] ?? "?")} ·{" "}
                            {new Date(comment.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Comment input — sticky bottom */}
        <div className="border-t border-slate-100 px-4 py-3 flex-shrink-0 bg-white">
          <div className="flex gap-2 items-center">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
              style={{ background: PRIMARY }}>
              {initials(currentProfile.name)}
            </div>
            <input
              type="text" value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && commentText.trim()) handleSendComment(); }}
              placeholder="Escribe un comentario…"
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              onClick={handleSendComment}
              disabled={!commentText.trim() || sendingComment}
              className="rounded-full text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40 transition-colors flex-shrink-0"
              style={{ background: PRIMARY }}
            >
              {sendingComment ? "…" : "Enviar"}
            </button>
          </div>
        </div>

        {/* Save / Delete actions (edit only) */}
        {canEdit && (
          <div className="px-4 pb-4 pt-1 flex gap-2 flex-shrink-0 border-t border-slate-100 bg-white">
            <button onClick={handleSave}
              className="flex-1 rounded-md text-white text-sm font-medium py-2.5 transition-colors"
              style={{ background: PRIMARY }}>
              Guardar cambios
            </button>
            <button
              onClick={() => { if (confirm("¿Eliminar esta tarea?")) onDelete(task.id); }}
              className="rounded-md text-red-600 border border-red-200 text-sm font-medium px-4 py-2.5 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ icon, label, value, color, onClick, active }: {
  icon: React.ReactNode; label: string; value: number;
  color: "blue" | "amber" | "red" | "green" | "purple";
  onClick?: () => void; active?: boolean;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-violet-50 text-violet-600",
  };
  return (
    <button
      onClick={onClick}
      className={`bg-white border rounded-lg p-3 text-left transition-all hover:shadow-sm ${
        active ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded flex items-center justify-center ${colors[color]}`}>{icon}</div>
        <span className="text-xs text-slate-500 truncate">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </button>
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
