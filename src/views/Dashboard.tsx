import { useState, useEffect } from "react";
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
  ListTodo,
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
  onDeleteGeneralTask?: (taskId: string) => void;
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
  onDeleteGeneralTask,
}: Props) {
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddGeneralTask, setShowAddGeneralTask] = useState(false);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [taskView, setTaskView] = useState<"pending" | "urgent" | "mine" | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

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
  const myTasks = pendingTasks.filter((t) => t.assigneeId === currentProfile.id);
  const generalTasks = tasks.filter((t) => t.playerId === "" || t.playerId === "general");

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
        <div className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-4 mb-4 sm:mb-6">
          <StatCard icon={<Users className="w-4 h-4" />} label="Jugadores" value={players.length} color="blue"
            onClick={() => setTaskView(null)} active={taskView === null} />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Tareas pendientes" value={pendingTasks.length} color="amber"
            onClick={() => setTaskView(taskView === "pending" ? null : "pending")} active={taskView === "pending"} />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Urgentes" value={urgentTasks.length} color="red"
            onClick={() => setTaskView(taskView === "urgent" ? null : "urgent")} active={taskView === "urgent"} />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Mis tareas" value={myTasks.length} color="green"
            onClick={() => setTaskView(taskView === "mine" ? null : "mine")} active={taskView === "mine"} />
        </div>

        {/* Expanded task list view */}
        {taskView && viewTasks.length > 0 && (
          <div className="mb-4 sm:mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                {taskView === "pending" ? "Todas las tareas pendientes" : taskView === "urgent" ? "Tareas urgentes" : "Mis tareas"}
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

        {/* My tasks — only if no taskView is active */}
        {!taskView && myTasks.length > 0 && (
          <div className="mb-4 sm:mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Mis tareas pendientes</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {myTasks.slice(0, 5).map((task) => {
                const player = players.find((p) => p.id === task.playerId);
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
                    <span className="flex-1 text-sm text-slate-700 truncate">{task.title}</span>
                    <span className="text-xs text-slate-400 hidden sm:block">{player?.name}</span>
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

        {/* General tasks section */}
        {(generalTasks.length > 0 || onAddGeneralTask) && !taskView && (
          <div className="mb-4 sm:mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-slate-400" />
                Tareas generales{generalTasks.length > 0 ? ` (${generalTasks.length})` : ''}
              </h2>
              {onAddGeneralTask && (
                <button
                  onClick={() => setShowAddGeneralTask(true)}
                  className="inline-flex items-center gap-1 rounded text-slate-600 bg-slate-50 border border-slate-200 text-xs font-medium px-2 py-1 hover:bg-slate-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /><span className="hidden sm:inline">Nueva</span>
                </button>
              )}
            </div>
            {generalTasks.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">No hay tareas generales. Crea una con el botón de arriba.</div>
            )}
            <div className="divide-y divide-slate-100">
              {generalTasks.slice(0, 10).map((task) => {
                const assignee = profiles.find((m) => m.id === task.assigneeId);
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <div
                    key={task.id}
                    className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      task.priority === "alta" ? "bg-red-500" : task.priority === "media" ? "bg-amber-400" : "bg-slate-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{task.title}</p>
                      <p className="text-xs text-slate-400">{assignee?.name ?? "Sin asignar"}</p>
                    </div>
                    {task.dueDate && (
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {onDeleteGeneralTask && (
                      <button
                        onClick={() => onDeleteGeneralTask(task.id)}
                        className="text-slate-300 hover:text-red-600 transition-colors p-1 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {filtered.map((player) => {
            const playerTasks = tasks.filter((t) => t.playerId === player.id && t.status !== "completada");
            const urgent = playerTasks.filter((t) => t.priority === "alta");
            const age = calcAge(player.birthDate);
            const repEnd = new Date(player.representationContract.end).getTime();
            const repDaysLeft = Math.ceil((repEnd - Date.now()) / (1000*60*60*24));
            const clubEnd = new Date(player.clubContract.endDate).getTime();
            const clubDaysLeft = Math.ceil((clubEnd - Date.now()) / (1000*60*60*24));
            const managers = player.managedBy.map((id) => profiles.find((m) => m.id === id)).filter(Boolean) as Profile[];
            const isSelected = selected.has(player.id);
            const isBday = isBirthdayToday(player.birthDate);

            return (
              <div
                key={player.id}
                className="bg-white border rounded-lg p-2.5 sm:p-3 text-center cursor-pointer transition-all hover:border-slate-300 hover:shadow-sm relative"
                onClick={() => selectMode ? toggleSelect(player.id) : onSelectPlayer(player.id)}
              >
                {selectMode && (
                  <div className="absolute top-1.5 right-1.5 z-10">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                  </div>
                )}
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-400 mx-auto mb-1.5 relative">
                  {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  {isBday && <span className="absolute -top-1 -right-1 text-xs">🎂</span>}
                </div>
                <p className="text-xs sm:text-[13px] font-semibold text-slate-900 truncate">{player.name}</p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate mt-0.5">
                  {player.positions[0]} · {clubsLabel(player.clubs)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                  {age} años · {player.nationality}
                </p>
                <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
                  {managers.map(m => <span key={m.id} className="w-5 h-5 rounded-full bg-slate-200 text-[8px] font-bold flex items-center justify-center text-slate-700">{m.avatar}</span>)}
                  {repDaysLeft < 365 && repDaysLeft > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-600 border border-red-100">Repr.</span>}
                  {clubDaysLeft < 365 && clubDaysLeft > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-100">Club</span>}
                  {playerTasks.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-slate-100 text-slate-600">{playerTasks.length}{urgent.length > 0 ? ` · ${urgent.length} urg.` : ''}</span>}
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
    </div>
  );
}

function StatCard({ icon, label, value, color, onClick, active }: {
  icon: React.ReactNode; label: string; value: number;
  color: "blue" | "amber" | "red" | "green";
  onClick?: () => void; active?: boolean;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-600",
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
      contractHistory: [], performance: [],
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
