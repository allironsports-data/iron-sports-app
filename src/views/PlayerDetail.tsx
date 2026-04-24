import { useState, useRef, useEffect, useCallback } from "react";
import logoImg from '../assets/logo.jpeg';
import type {
  Player, Task, TaskComment,
  PerformanceNote, ClubInterest, PlayerLink, MatchReport, VideoSession,
} from "../types";
import { calcAge } from "../types";
import type { Profile } from "../contexts/AuthContext";
import { uploadContractPdf, fetchComments, createComment as dbCreateComment } from "../lib/db";
import {
  ArrowLeft, LogOut, ClipboardList, FileText,
  TrendingUp, User, Plus, X, Calendar, AlertCircle,
  Clock, CheckCircle2, Trash2, Edit3, Star, Users,
  MessageSquare, Paperclip, Send, Download, ExternalLink, Link2,
  Video, BarChart2, BookOpen,
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  player: Player;
  tasks: Task[];
  allTasks: Task[];
  profiles: Profile[];
  currentProfile: Profile;
  onBack: () => void;
  onAddTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdatePlayer: (player: Player) => void;
  onLogout: () => void;
  onDeletePlayer?: (id: string) => void;
  onAdmin?: () => void;
}

type TabId = "tareas" | "contrato" | "rendimiento" | "info";

export function PlayerDetail({
  player, tasks, allTasks, profiles, currentProfile,
  onBack, onAddTask, onUpdateTask, onDeleteTask, onUpdatePlayer, onLogout,
  onDeletePlayer, onAdmin,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("tareas");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditPlayer, setShowEditPlayer] = useState(false);

  const pendingCount = tasks.filter((t) => t.status !== "completada").length;
  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "tareas", label: "Tareas", icon: <ClipboardList className="w-4 h-4" />, count: pendingCount },
    { id: "contrato", label: "Contrato", icon: <FileText className="w-4 h-4" /> },
    { id: "rendimiento", label: "Rendimiento", icon: <TrendingUp className="w-4 h-4" />, count: (player.matchReports?.length ?? 0) + player.performance.length + (player.videoSessions?.length ?? 0) },
    { id: "info", label: "Info / Entorno", icon: <User className="w-4 h-4" /> },
  ];

  const managers = profiles.filter((m) => player.managedBy.includes(m.id));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex-shrink-0"><img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" /></div>
            <span className="font-semibold text-slate-900 text-sm">{player.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {onAdmin && (
              <button
                onClick={onAdmin}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                title="Panel de administración"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Player summary */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-400 flex-shrink-0">
              {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h1 className="text-lg font-semibold text-slate-900">{player.name}</h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEditPlayer(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  {onDeletePlayer && currentProfile.is_admin && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {player.positions.join(" / ")}
                {" · "}
                {calcAge(player.birthDate)} años ({new Date(player.birthDate).toLocaleDateString("es-ES")})
                {" · "}
                {player.nationality}
              </p>
              {/* Clubs */}
              <div className="mt-1">
                <ClubsDisplay clubs={player.clubs} />
              </div>
              {/* Managers + partner */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {managers.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                    {m.name}
                  </span>
                ))}
                {player.partner && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                    Partner: {player.partner}
                  </span>
                )}
                {player.info.phone && (
                  <a href={`tel:${player.info.phone}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    📞 {player.info.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id ? "text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
              style={activeTab === tab.id ? { background: PRIMARY } : {}}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "tareas" && (
          <TasksTab tasks={tasks} allTasks={allTasks} profiles={profiles} player={player}
            currentProfile={currentProfile} onAddTask={onAddTask} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} />
        )}
        {activeTab === "contrato" && (
          <ContractTab player={player} onUpdate={onUpdatePlayer} isAdmin={currentProfile.is_admin} />
        )}
        {activeTab === "rendimiento" && (
          <PerformanceTab player={player} profiles={profiles} onUpdate={onUpdatePlayer} />
        )}
        {activeTab === "info" && (
          <div className="space-y-4">
            <InfoTab player={player} onUpdate={onUpdatePlayer} />
            <LinksSection player={player} onUpdate={onUpdatePlayer} />
          </div>
        )}
      </main>

      {showEditPlayer && (
        <EditPlayerModal
          player={player}
          profiles={profiles}
          onClose={() => setShowEditPlayer(false)}
          onSave={(updated) => { onUpdatePlayer(updated); setShowEditPlayer(false); }}
        />
      )}

      {showDeleteConfirm && onDeletePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg w-full max-w-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Confirmar eliminación</h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-700 mb-4">
                ¿Eliminar a {player.name}? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onDeletePlayer(player.id);
                    setShowDeleteConfirm(false);
                    onBack();
                  }}
                  className="px-3 py-1.5 rounded text-white text-sm font-medium transition-colors"
                  style={{ background: "hsl(0, 84%, 60%)" }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Club display pills ---- */
function ClubsDisplay({ clubs }: { clubs: Player["clubs"] }) {
  if (clubs.length === 0) return <span className="text-xs text-slate-400">Sin club</span>;
  const owner = clubs.find((c) => c.type === "propietario");
  const loan = clubs.find((c) => c.type === "cedido_en");
  if (owner && loan) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
          Cedido en {loan.name}
        </span>
        <span className="text-xs text-slate-400">prop. {owner.name}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {clubs.map((c, i) => (
        <span key={i} className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
          {c.name}
          {c.type === "compartido" && clubs.length > 1 && i === 0 && " ·"}
        </span>
      ))}
    </div>
  );
}

/* ========== TASKS TAB ========== */
function TasksTab({ tasks, allTasks, profiles, player, currentProfile, onAddTask, onUpdateTask, onDeleteTask }: {
  tasks: Task[]; allTasks: Task[]; profiles: Profile[]; player: Player;
  currentProfile: Profile; onAddTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void; onDeleteTask: (taskId: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<"todas" | "pendiente" | "en_progreso" | "completada">("todas");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [loadedComments, setLoadedComments] = useState<Record<string, TaskComment[]>>({});
  const [commentLoading, setCommentLoading] = useState<string | null>(null);

  // Load comments when a task is expanded
  const loadComments = useCallback(async (taskId: string) => {
    setCommentLoading(taskId);
    try {
      const comments = await fetchComments(taskId);
      setLoadedComments((prev) => ({ ...prev, [taskId]: comments }));
    } catch (err) {
      console.error('Error loading comments:', err);
    } finally {
      setCommentLoading(null);
    }
  }, []);

  useEffect(() => {
    if (expandedTask) loadComments(expandedTask);
  }, [expandedTask, loadComments]);

  const handleAddComment = async (task: Task, content: string) => {
    try {
      await dbCreateComment(task.id, currentProfile.id, content);
      // Reload comments after adding
      await loadComments(task.id);
    } catch (err) {
      console.error('Error adding comment:', err);
    }
  };

  const filtered = tasks.filter((t) => filter === "todas" || t.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const prio = { alta: 0, media: 1, baja: 2 };
    if (a.status === "completada" && b.status !== "completada") return 1;
    if (b.status === "completada" && a.status !== "completada") return -1;
    return prio[a.priority] - prio[b.priority];
  });

  const statusIcon = (s: Task["status"]) => {
    if (s === "completada") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s === "en_progreso") return <Clock className="w-4 h-4 text-blue-500" />;
    return <AlertCircle className="w-4 h-4 text-slate-300" />;
  };

  const cycleStatus = (t: Task) =>
    onUpdateTask({ ...t, status: t.status === "completada" ? "pendiente" : t.status === "pendiente" ? "en_progreso" : "completada" });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex gap-1 flex-wrap">
          {(["todas", "pendiente", "en_progreso", "completada"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === f ? "text-white" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
              style={filter === f ? { background: PRIMARY } : {}}
            >
              {f === "todas" ? "Todas" : f === "pendiente" ? "Pendientes" : f === "en_progreso" ? "En progreso" : "Completadas"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5 transition-colors"
          style={{ background: PRIMARY }}
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva tarea
        </button>
      </div>

      <div className="space-y-2">
        {sorted.map((task) => {
          const assignee = profiles.find((m) => m.id === task.assigneeId);
          const dependency = task.dependsOnId ? allTasks.find((t) => t.id === task.dependsOnId) : null;
          const isOverdue = task.status !== "completada" && !!task.dueDate && new Date(task.dueDate) < new Date();
          const isExpanded = expandedTask === task.id;

          return (
            <div key={task.id} className={`bg-white border rounded-lg overflow-hidden ${
              task.status === "completada" ? "border-slate-100 opacity-70" : isOverdue ? "border-red-200" : "border-slate-200"
            }`}>
              {/* Task header */}
              <div className="p-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => cycleStatus(task)} className="mt-0.5 flex-shrink-0">{statusIcon(task.status)}</button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${task.status === "completada" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {task.title}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        task.priority === "alta" ? "bg-red-50 text-red-600" : task.priority === "media" ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-500"
                      }`}>{task.priority}</span>
                    </div>
                    {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {assignee && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-[9px] font-semibold flex items-center justify-center">{assignee.avatar}</span>
                          {assignee.name}
                        </span>
                      )}
                      {(task.watchers ?? []).map((wId) => {
                        const w = profiles.find((m) => m.id === wId);
                        return w ? (
                          <span key={wId} className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <span className="w-4 h-4 rounded-full bg-blue-50 text-[9px] font-semibold flex items-center justify-center text-blue-600">{w.avatar}</span>
                            {w.name}
                          </span>
                        ) : null;
                      })}
                      {task.dueDate && (
                        <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                          {isOverdue && " (vencida)"}
                        </span>
                      )}
                      {dependency && <span className="text-xs text-slate-400">Depende de: {dependency.title}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {(loadedComments[task.id] ?? []).length > 0 && <span>{(loadedComments[task.id] ?? []).length}</span>}
                    </button>
                    <button onClick={() => setEditingTask(task)} className="text-slate-300 hover:text-blue-500 transition-colors" title="Editar tarea">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDeleteTask(task.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Comments panel */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50">
                  {commentLoading === task.id && (
                    <div className="px-3 py-3 text-center text-xs text-slate-400">Cargando comentarios...</div>
                  )}
                  {(loadedComments[task.id] ?? []).length > 0 && (
                    <div className="px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                      {(loadedComments[task.id] ?? []).map((c) => {
                        const author = profiles.find((m) => m.id === c.authorId);
                        return (
                          <div key={c.id} className="bg-white rounded-md p-2.5 border border-slate-100">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-[9px] font-bold flex items-center justify-center text-slate-600">
                                {author?.avatar}
                              </span>
                              <span className="text-xs font-medium text-slate-600">{author?.name}</span>
                              <span className="text-[10px] text-slate-400 ml-auto">
                                {new Date(c.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{c.content}</p>
                            {c.attachments.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {c.attachments.map((att) => (
                                  <a
                                    key={att.id}
                                    href={`data:${att.mimeType};base64,${att.data}`}
                                    download={att.name}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  >
                                    <Download className="w-3 h-3" />
                                    {att.name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <CommentInput
                    onSubmit={(text) => handleAddComment(task, text)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-10 text-sm text-slate-400">No hay tareas en esta categoría</div>
      )}

      {showAdd && (
        <AddTaskModal profiles={profiles} tasks={tasks} playerId={player.id} player={player}
          isAdmin={currentProfile.is_admin}
          onClose={() => setShowAdd(false)}
          onAdd={(t) => { onAddTask(t); setShowAdd(false); }}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          profiles={profiles}
          tasks={tasks}
          player={player}
          onClose={() => setEditingTask(null)}
          onSave={(updated) => { onUpdateTask(updated); setEditingTask(null); }}
        />
      )}
    </div>
  );
}

function CommentInput({ onSubmit }: {
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir comentario..."
          className="flex-1 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-1"
        />
        <button
          type="submit"
          className="p-1.5 rounded text-white"
          style={{ background: PRIMARY }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}

function EditTaskModal({ task, profiles, tasks, player, onClose, onSave }: {
  task: Task; profiles: Profile[]; tasks: Task[]; player: Player;
  onClose: () => void; onSave: (t: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [assignee, setAssignee] = useState(task.assigneeId ?? "");
  // Find extra watcher (one that's not in player.managedBy)
  const existingExtra = (task.watchers ?? []).find((w) => !player.managedBy.includes(w)) ?? "";
  const [extraWatcher, setExtraWatcher] = useState(existingExtra);
  const [priority, setPriority] = useState<"alta" | "media" | "baja">(task.priority);
  const [status, setStatus] = useState<Task["status"]>(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [depends, setDepends] = useState(task.dependsOnId ?? "");
  const playerManagers = player.managedBy.map((id) => profiles.find((m) => m.id === id)).filter(Boolean) as Profile[];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Editar tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const watchers = [...player.managedBy];
          if (extraWatcher && !watchers.includes(extraWatcher)) watchers.push(extraWatcher);
          onSave({ ...task, title, description: desc, assigneeId: assignee,
            watchers,
            dependsOnId: depends || undefined, status, priority, dueDate: dueDate || undefined });
        }} className="p-4 space-y-3 pb-8">
          <TF label="Título" value={title} onChange={setTitle} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Responsable</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} required
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="">—</option>
                {profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as "alta" | "media" | "baja")}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          {/* Auto-notified managers */}
          <div className="bg-slate-50 rounded-md p-2.5">
            <p className="text-xs font-medium text-slate-500 mb-1">Se notificará automáticamente a:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {playerManagers.length > 0 ? playerManagers.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
                  {m.avatar} {m.name}
                </span>
              )) : <span className="text-xs text-slate-400">Sin managers asignados</span>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notificar también a (opcional)</label>
            <select value={extraWatcher} onChange={(e) => setExtraWatcher(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
              <option value="">— Nadie más —</option>
              {profiles.filter((m) => !player.managedBy.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Task["status"])}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <TF label="Fecha límite (opcional)" value={dueDate} onChange={setDueDate} type="date" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Depende de</label>
            <select value={depends} onChange={(e) => setDepends(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
              <option value="">Ninguna</option>
              {tasks.filter((t) => t.id !== task.id && t.status !== "completada").map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div className="pt-2 flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-md border border-slate-200 text-slate-600 text-sm font-medium py-2 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={!title || !assignee}
              className="flex-1 rounded-md text-white text-sm font-medium py-2 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}>
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTaskModal({ profiles, tasks, playerId, player, isAdmin, onClose, onAdd }: {
  profiles: Profile[]; tasks: Task[]; playerId: string; player: Player;
  isAdmin: boolean; onClose: () => void; onAdd: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [extraWatcher, setExtraWatcher] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");
  const [depends, setDepends] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);

  const playerManagers = player.managedBy.map((id) => profiles.find((m) => m.id === id)).filter(Boolean) as Profile[];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const watchers = [...player.managedBy];
          if (extraWatcher && !watchers.includes(extraWatcher)) watchers.push(extraWatcher);
          onAdd({ id: "t" + Date.now(), playerId, title, description: desc, assigneeId: assignee,
            watchers,
            dependsOnId: depends || undefined, status: "pendiente", priority, dueDate: dueDate || undefined,
            createdAt: new Date().toISOString().split("T")[0], comments: [], adminOnly });
        }} className="p-4 space-y-3 pb-8">
          <TF label="Título" value={title} onChange={setTitle} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Responsable</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} required
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="">—</option>
                {profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          {/* Auto-notified managers */}
          <div className="bg-slate-50 rounded-md p-2.5">
            <p className="text-xs font-medium text-slate-500 mb-1">Se notificará automáticamente a:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {playerManagers.length > 0 ? playerManagers.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
                  {m.avatar} {m.name}
                </span>
              )) : <span className="text-xs text-slate-400">Sin managers asignados</span>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notificar también a (opcional)</label>
            <select value={extraWatcher} onChange={(e) => setExtraWatcher(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
              <option value="">— Nadie más —</option>
              {profiles.filter((m) => !player.managedBy.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TF label="Fecha límite (opcional)" value={dueDate} onChange={setDueDate} type="date" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Depende de</label>
              <select value={depends} onChange={(e) => setDepends(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="">Ninguna</option>
                {tasks.filter((t) => t.status !== "completada").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          {isAdmin && (
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
          )}
          <div className="pt-2">
            <button type="submit" disabled={!title || !assignee}
              className="w-full rounded-md text-white text-sm font-medium py-2 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}>
              Crear tarea
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========== CONTRACT TAB ========== */
function ContractTab({ player, onUpdate, isAdmin }: { player: Player; onUpdate: (p: Player) => void; isAdmin: boolean }) {
  const [editingRepr, setEditingRepr] = useState(false);
  const [editingClub, setEditingClub] = useState(false);
  const [repr, setRepr] = useState(player.representationContract);
  const [club, setClub] = useState(player.clubContract);
  const fileRef = useRef<HTMLInputElement>(null);

  const reprDaysLeft = Math.ceil((new Date(player.representationContract.end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const clubDaysLeft = player.clubContract.endDate
    ? Math.ceil((new Date(player.clubContract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-4">
      {/* Representation contract */}
      {isAdmin && (
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Contrato de representación</h3>
          {!editingRepr && (
            <button onClick={() => { setRepr(player.representationContract); setEditingRepr(true); }}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <Edit3 className="w-3 h-3" />Editar
            </button>
          )}
        </div>
        {reprDaysLeft < 365 && reprDaysLeft > 0 && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700">Expira en <strong>{reprDaysLeft} días</strong> ({new Date(player.representationContract.end).toLocaleDateString("es-ES")})</p>
          </div>
        )}
        {editingRepr ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TF label="Inicio" value={repr.start} onChange={(v) => setRepr({ ...repr, start: v })} type="date" />
              <TF label="Fin" value={repr.end} onChange={(v) => setRepr({ ...repr, end: v })} type="date" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
              <textarea value={repr.notes || ""} onChange={(e) => setRepr({ ...repr, notes: e.target.value })} rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingRepr(false)} className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500">Cancelar</button>
              <button onClick={() => { onUpdate({ ...player, representationContract: repr }); setEditingRepr(false); }}
                className="text-xs px-3 py-1.5 rounded text-white" style={{ background: PRIMARY }}>Guardar</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DF label="Inicio" value={player.representationContract.start ? new Date(player.representationContract.start).toLocaleDateString("es-ES") : "—"} />
            <DF label="Fin" value={player.representationContract.end ? new Date(player.representationContract.end).toLocaleDateString("es-ES") : "—"} />
            {player.representationContract.notes && (
              <div className="col-span-full">
                <p className="text-xs text-slate-400 mb-0.5">Notas</p>
                <p className="text-sm text-slate-700">{player.representationContract.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Club contract */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Contrato con el club</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              title="Subir contrato completo (PDF)"
            >
              <Paperclip className="w-3 h-3" />Subir PDF
            </button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const url = await uploadContractPdf(player.id, file);
                  onUpdate({
                    ...player,
                    clubContract: {
                      ...player.clubContract,
                      notes: (player.clubContract.notes || "") + `\n[PDF: ${file.name}](${url})`,
                    },
                    info: { ...player.info },
                  });
                } catch (err) {
                  alert("Error al subir PDF: " + (err as Error).message);
                }
                e.target.value = "";
              }}
            />
            {!editingClub && (
              <button onClick={() => { setClub(player.clubContract); setEditingClub(true); }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <Edit3 className="w-3 h-3" />Editar
              </button>
            )}
          </div>
        </div>
        {clubDaysLeft !== null && clubDaysLeft < 365 && clubDaysLeft > 0 && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-100">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">Contrato de club expira en <strong>{clubDaysLeft} días</strong></p>
          </div>
        )}
        {editingClub ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TF label="Fin de contrato" value={club.endDate} onChange={(v) => setClub({ ...club, endDate: v })} type="date" />
              <TF label="Años opcionales" value={club.optionalYears?.toString() || ""} onChange={(v) => setClub({ ...club, optionalYears: parseInt(v) || undefined })} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TF label="Cláusula de rescisión" value={club.releaseClause || ""} onChange={(v) => setClub({ ...club, releaseClause: v })} />
              <TF label="Comisión agente" value={club.agentCommission || ""} onChange={(v) => setClub({ ...club, agentCommission: v })} />
            </div>
            <TF label="Bonus" value={club.bonuses || ""} onChange={(v) => setClub({ ...club, bonuses: v })} />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
              <textarea value={club.notes || ""} onChange={(e) => setClub({ ...club, notes: e.target.value })} rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingClub(false)} className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500">Cancelar</button>
              <button onClick={() => { onUpdate({ ...player, clubContract: club }); setEditingClub(false); }}
                className="text-xs px-3 py-1.5 rounded text-white" style={{ background: PRIMARY }}>Guardar</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DF label="Fin de contrato" value={player.clubContract.endDate ? new Date(player.clubContract.endDate).toLocaleDateString("es-ES") : "—"} />
            <DF label="Años opcionales" value={player.clubContract.optionalYears ? `+${player.clubContract.optionalYears} años` : "—"} />
            <DF label="Cláusula rescisión" value={player.clubContract.releaseClause || "—"} />
            <DF label="Comisión agente" value={player.clubContract.agentCommission || "—"} />
            <DF label="Bonus" value={player.clubContract.bonuses || "—"} />
            {player.clubContract.notes && (
              <div className="col-span-full">
                <p className="text-xs text-slate-400 mb-0.5">Notas / Documentos</p>
                <div className="text-sm text-slate-700 whitespace-pre-line">
                  {player.clubContract.notes.split("\n").map((line, i) => {
                    const pdfMatch = line.match(/\[PDF: (.+?)\]\((.+?)\)/);
                    if (pdfMatch) {
                      return (
                        <a key={i} href={pdfMatch[2]} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                          <ExternalLink className="w-3 h-3" />{pdfMatch[1]}
                        </a>
                      );
                    }
                    return line ? <span key={i}>{line}<br/></span> : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Club interests / market info */}
      <ClubInterestsSection player={player} onUpdate={onUpdate} />

      {/* Club / loan situation */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Situación de club</h3>
        <div className="space-y-2">
          {player.clubs.map((c, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                c.type === "cedido_en" ? "bg-amber-50 text-amber-700" :
                c.type === "propietario" ? "bg-slate-100 text-slate-500" :
                "bg-blue-50 text-blue-700"
              }`}>
                {c.type === "cedido_en" ? "Cedido en" : c.type === "propietario" ? "Propietario" : "Equipo"}
              </span>
              <span className="text-sm font-medium text-slate-800">{c.name}</span>
              {c.league && <span className="text-xs text-slate-400">{c.league}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {player.contractHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Historial de clubes</h3>
          <div className="space-y-2">
            {player.contractHistory.map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-700 font-medium flex-1">{h.club}</span>
                <span className="text-xs text-slate-400">{h.period}</span>
                <span className="text-xs text-slate-400">{h.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== CLUB INTERESTS SECTION ========== */
function ClubInterestsSection({ player, onUpdate }: { player: Player; onUpdate: (p: Player) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newInterest, setNewInterest] = useState<Omit<ClubInterest, 'id'>>({
    clubName: '', date: new Date().toISOString().slice(0, 10), type: 'interés', details: '', source: '',
  });

  const interests = [...(player.clubInterests || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const typeColors: Record<string, string> = {
    'interés': 'bg-blue-50 text-blue-700 border-blue-200',
    'oferta': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'rumor': 'bg-slate-100 text-slate-600 border-slate-200',
    'negociación': 'bg-amber-50 text-amber-700 border-amber-200',
  };

  const handleAdd = () => {
    if (!newInterest.clubName.trim()) return;
    const entry: ClubInterest = {
      ...newInterest,
      id: 'ci' + Date.now() + Math.random().toString(36).slice(2, 6),
    };
    onUpdate({ ...player, clubInterests: [...(player.clubInterests || []), entry] });
    setNewInterest({ clubName: '', date: new Date().toISOString().slice(0, 10), type: 'interés', details: '', source: '' });
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    onUpdate({ ...player, clubInterests: (player.clubInterests || []).filter((ci) => ci.id !== id) });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Intereses de clubes</h3>
        <button onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
          <Plus className="w-3 h-3" />{showAdd ? 'Cancelar' : 'Añadir'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TF label="Club" value={newInterest.clubName} onChange={(v) => setNewInterest({ ...newInterest, clubName: v })} />
            <TF label="Fecha" value={newInterest.date} onChange={(v) => setNewInterest({ ...newInterest, date: v })} type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select
                value={newInterest.type}
                onChange={(e) => setNewInterest({ ...newInterest, type: e.target.value as ClubInterest['type'] })}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
              >
                <option value="interés">Interés</option>
                <option value="oferta">Oferta</option>
                <option value="rumor">Rumor</option>
                <option value="negociación">Negociación</option>
              </select>
            </div>
            <TF label="Fuente" value={newInterest.source || ''} onChange={(v) => setNewInterest({ ...newInterest, source: v })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Detalles</label>
            <textarea value={newInterest.details} onChange={(e) => setNewInterest({ ...newInterest, details: e.target.value })} rows={2}
              placeholder="Condiciones, contexto, notas..."
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <div className="flex justify-end">
            <button onClick={handleAdd}
              className="text-xs px-3 py-1.5 rounded text-white" style={{ background: PRIMARY }}>Guardar</button>
          </div>
        </div>
      )}

      {interests.length === 0 && !showAdd && (
        <p className="text-xs text-slate-400 text-center py-4">Sin intereses registrados</p>
      )}

      {interests.length > 0 && (
        <div className="space-y-2">
          {interests.map((ci) => (
            <div key={ci.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800">{ci.clubName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeColors[ci.type] || 'bg-slate-100 text-slate-600'}`}>
                    {ci.type.charAt(0).toUpperCase() + ci.type.slice(1)}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto flex-shrink-0">
                    {new Date(ci.date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {ci.details && <p className="text-xs text-slate-600 leading-relaxed">{ci.details}</p>}
                {ci.source && <p className="text-[10px] text-slate-400 mt-0.5">Fuente: {ci.source}</p>}
              </div>
              <button onClick={() => handleDelete(ci.id)} className="text-slate-300 hover:text-red-400 mt-0.5 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== PERFORMANCE TAB ========== */
function PerformanceTab({ player, profiles, onUpdate }: { player: Player; profiles: Profile[]; onUpdate: (p: Player) => void }) {
  const [section, setSection] = useState<"partidos" | "informes" | "video">("partidos");
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchReport | null>(null);

  const matches = [...(player.matchReports ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const videos = [...(player.videoSessions ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const notes = [...player.performance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Auto-calculated stats from match reports
  const played = matches.filter(m => m.role !== "no_convocado");
  const starters = matches.filter(m => m.role === "titular");
  const subs = matches.filter(m => m.role === "suplente");
  const totalMins = played.reduce((s, m) => s + m.minutesPlayed, 0);
  const totalGoals = played.reduce((s, m) => s + m.goals, 0);
  const totalAssists = played.reduce((s, m) => s + m.assists, 0);
  const totalYellow = played.reduce((s, m) => s + m.yellowCards, 0);
  const totalRed = played.filter(m => m.redCard).length;
  const goalsP90 = totalMins > 0 ? ((totalGoals / totalMins) * 90).toFixed(2) : "—";
  const assistsP90 = totalMins > 0 ? ((totalAssists / totalMins) * 90).toFixed(2) : "—";
  const avgRating = played.filter(m => m.rating).length > 0
    ? (played.reduce((s, m) => s + (m.rating ?? 0), 0) / played.filter(m => m.rating).length).toFixed(1)
    : "—";

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {([
          { id: "partidos", label: "Partidos", icon: <BarChart2 className="w-3.5 h-3.5" />, count: matches.length },
          { id: "informes", label: "Informes", icon: <BookOpen className="w-3.5 h-3.5" />, count: notes.length },
          { id: "video", label: "Vídeoanalisis", icon: <Video className="w-3.5 h-3.5" />, count: videos.length },
        ] as const).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              section === s.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {s.icon}{s.label}
            {s.count > 0 && <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${section === s.id ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>{s.count}</span>}
          </button>
        ))}
      </div>

      {/* PARTIDOS SECTION */}
      {section === "partidos" && (
        <div className="space-y-4">
          {/* Stats grid */}
          {played.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Estadísticas de temporada</h3>
              <div className="grid grid-cols-4 gap-3 mb-3">
                {[
                  { label: "PJ", value: played.length, sub: `${starters.length}T / ${subs.length}S` },
                  { label: "Minutos", value: totalMins, sub: `${Math.round(totalMins / Math.max(played.length, 1))} prom.` },
                  { label: "Goles", value: totalGoals, sub: `${goalsP90}/90` },
                  { label: "Asist.", value: totalAssists, sub: `${assistsP90}/90` },
                ].map(stat => (
                  <div key={stat.label} className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">{stat.label}</p>
                    <p className="text-[10px] text-slate-400">{stat.sub}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                {[
                  { label: "Nota media", value: avgRating, color: "text-amber-600" },
                  { label: "Tarjetas 🟨", value: totalYellow, color: "text-amber-500" },
                  { label: "Tarjetas 🟥", value: totalRed, color: "text-red-600" },
                ].map(stat => (
                  <div key={stat.label} className="text-center">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-[10px] text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match list */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Fichas de partido</h3>
            <button onClick={() => setShowAddMatch(true)}
              className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5"
              style={{ background: PRIMARY }}>
              <Plus className="w-3.5 h-3.5" />Nueva ficha
            </button>
          </div>

          {matches.length === 0 && (
            <div className="text-center py-10 text-sm text-slate-400 bg-white border border-slate-200 rounded-lg">
              Sin fichas de partido — añade la primera
            </div>
          )}

          <div className="space-y-2">
            {matches.map(match => (
              <div key={match.id} className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        match.role === "titular" ? "bg-blue-100 text-blue-700"
                        : match.role === "suplente" ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                      }`}>{match.role === "no_convocado" ? "NC" : match.role === "titular" ? "Titular" : "Suplente"}</span>
                      <span className="text-sm font-semibold text-slate-800">vs {match.opponent}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{match.competition}</span>
                      <span className="text-[10px] text-slate-400">{match.venue}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{new Date(match.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {match.rating && (
                      <span className={`text-sm font-bold ${match.rating >= 8 ? "text-emerald-600" : match.rating >= 6 ? "text-amber-600" : "text-red-500"}`}>
                        {match.rating}/10
                      </span>
                    )}
                    <button onClick={() => setEditingMatch(match)} className="p-1 text-slate-400 hover:text-slate-600">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onUpdate({ ...player, matchReports: player.matchReports.filter(m => m.id !== match.id) })}
                      className="p-1 text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {match.role !== "no_convocado" && (
                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-50">
                    <StatChip label="min" value={match.minutesPlayed} />
                    <StatChip label="⚽" value={match.goals} highlight={match.goals > 0} />
                    <StatChip label="🅰️" value={match.assists} highlight={match.assists > 0} />
                    {match.yellowCards > 0 && <StatChip label="🟨" value={match.yellowCards} />}
                    {match.redCard && <span className="text-[10px] font-semibold text-red-600">🟥 Roja</span>}
                    {match.notes && <p className="text-[11px] text-slate-400 ml-auto truncate max-w-[120px]" title={match.notes}>{match.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INFORMES SECTION */}
      {section === "informes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Informes y valoraciones</h3>
            <button onClick={() => setShowAddNote(true)}
              className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5"
              style={{ background: PRIMARY }}>
              <Plus className="w-3.5 h-3.5" />Nuevo informe
            </button>
          </div>
          {notes.length === 0 && <div className="text-center py-10 text-sm text-slate-400 bg-white border border-slate-200 rounded-lg">Sin informes aún</div>}
          {notes.map(note => {
            const author = profiles.find(m => m.id === note.authorId);
            return (
              <div key={note.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">{note.category}</span>
                    <span className="text-xs text-slate-400">{new Date(note.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < note.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
                    ))}
                    <span className="ml-1 text-xs font-semibold text-slate-600">{note.rating}/10</span>
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{note.content}</p>
                {author && (
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[9px] font-semibold flex items-center justify-center">{author.avatar}</span>
                      <span className="text-xs text-slate-400">{author.name}</span>
                    </div>
                    <button onClick={() => onUpdate({ ...player, performance: player.performance.filter(n => n.id !== note.id) })}
                      className="p-1 text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIDEO SESSIONS SECTION */}
      {section === "video" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Sesiones de vídeoanalisis</h3>
            <button onClick={() => setShowAddVideo(true)}
              className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5"
              style={{ background: PRIMARY }}>
              <Plus className="w-3.5 h-3.5" />Nueva sesión
            </button>
          </div>
          {videos.length === 0 && (
            <div className="text-center py-10 text-sm text-slate-400 bg-white border border-slate-200 rounded-lg">
              Sin sesiones registradas
            </div>
          )}
          <div className="space-y-2">
            {videos.map(v => (
              <div key={v.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Video className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-slate-800 truncate">{v.description}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {new Date(v.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      {v.duration ? ` · ${v.duration} min` : ""}
                    </p>
                    <a href={v.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Ver vídeo
                    </a>
                  </div>
                  <button onClick={() => onUpdate({ ...player, videoSessions: player.videoSessions.filter(s => s.id !== v.id) })}
                    className="p-1 text-slate-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {(showAddMatch || editingMatch) && (
        <MatchReportModal
          initial={editingMatch ?? undefined}
          onClose={() => { setShowAddMatch(false); setEditingMatch(null); }}
          onSave={(m) => {
            const reports = editingMatch
              ? player.matchReports.map(r => r.id === m.id ? m : r)
              : [m, ...player.matchReports];
            onUpdate({ ...player, matchReports: reports });
            setShowAddMatch(false); setEditingMatch(null);
          }}
        />
      )}
      {showAddNote && (
        <AddPerformanceModal profiles={profiles} onClose={() => setShowAddNote(false)}
          onAdd={(note) => { onUpdate({ ...player, performance: [note, ...player.performance] }); setShowAddNote(false); }} />
      )}
      {showAddVideo && (
        <AddVideoSessionModal onClose={() => setShowAddVideo(false)}
          onSave={(v) => { onUpdate({ ...player, videoSessions: [v, ...(player.videoSessions ?? [])] }); setShowAddVideo(false); }} />
      )}
    </div>
  );
}

function StatChip({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <span className={`text-xs font-semibold ${highlight ? "text-slate-800" : "text-slate-500"}`}>
      {value} <span className="font-normal text-slate-400">{label}</span>
    </span>
  );
}

function MatchReportModal({ initial, onClose, onSave }: {
  initial?: MatchReport; onClose: () => void; onSave: (m: MatchReport) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(initial?.date ?? today);
  const [opponent, setOpponent] = useState(initial?.opponent ?? "");
  const [competition, setCompetition] = useState(initial?.competition ?? "Liga");
  const [venue, setVenue] = useState<MatchReport["venue"]>(initial?.venue ?? "local");
  const [role, setRole] = useState<MatchReport["role"]>(initial?.role ?? "titular");
  const [minutes, setMinutes] = useState(String(initial?.minutesPlayed ?? 90));
  const [goals, setGoals] = useState(String(initial?.goals ?? 0));
  const [assists, setAssists] = useState(String(initial?.assists ?? 0));
  const [yellow, setYellow] = useState(String(initial?.yellowCards ?? 0));
  const [red, setRed] = useState(initial?.redCard ?? false);
  const [rating, setRating] = useState(String(initial?.rating ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? "mr" + Date.now(),
      date, opponent, competition, venue, role,
      minutesPlayed: parseInt(minutes) || 0,
      goals: parseInt(goals) || 0,
      assists: parseInt(assists) || 0,
      yellowCards: parseInt(yellow) || 0,
      redCard: red,
      rating: rating ? parseInt(rating) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">{initial ? "Editar ficha" : "Nueva ficha de partido"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <TF label="Fecha" value={date} onChange={setDate} type="date" required />
            <TF label="Rival" value={opponent} onChange={setOpponent} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Competición</label>
              <select value={competition} onChange={(e) => setCompetition(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                {["Liga", "Copa del Rey", "Champions League", "Europa League", "Conference League", "Playoffs", "Amistoso", "Otro"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Campo</label>
              <div className="flex gap-2 mt-1">
                {(["local", "visitante"] as const).map(v => (
                  <button key={v} type="button" onClick={() => setVenue(v)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${venue === v ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rol */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Participación</label>
            <div className="flex gap-2">
              {(["titular", "suplente", "no_convocado"] as const).map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${role === r
                    ? r === "titular" ? "border-blue-400 bg-blue-50 text-blue-700"
                    : r === "suplente" ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-slate-100 text-slate-600"
                    : "border-slate-200 text-slate-500"}`}>
                  {r === "no_convocado" ? "No conv." : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {role !== "no_convocado" && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <TF label="Minutos" value={minutes} onChange={setMinutes} type="number" />
                <TF label="Goles" value={goals} onChange={setGoals} type="number" />
                <TF label="Asist." value={assists} onChange={setAssists} type="number" />
                <TF label="🟨" value={yellow} onChange={setYellow} type="number" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={red} onChange={(e) => setRed(e.target.checked)} className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-slate-700">🟥 Tarjeta roja</span>
                </label>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nota (1-10)</label>
                  <input type="number" min={1} max={10} value={rating} onChange={(e) => setRating(e.target.value)}
                    placeholder="—" className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <button type="submit" disabled={!opponent}
            className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40 transition-colors"
            style={{ background: PRIMARY }}>
            {initial ? "Guardar cambios" : "Crear ficha"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddVideoSessionModal({ onClose, onSave }: {
  onClose: () => void; onSave: (v: VideoSession) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [videoUrl, setVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-lg w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nueva sesión de vídeoanalisis</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: "vs" + Date.now(), date, videoUrl, description, duration: duration ? parseInt(duration) : undefined });
        }} className="p-4 space-y-3 pb-8">
          <TF label="Fecha" value={date} onChange={setDate} type="date" required />
          <TF label="Enlace al vídeo (Streamable, YouTube, etc.)" value={videoUrl} onChange={setVideoUrl} required />
          <TF label="Duración (minutos, opcional)" value={duration} onChange={setDuration} type="number" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción de la sesión</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3}
              placeholder="Ej: Revisión de movimientos defensivos, posicionamiento en bloque medio..."
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <button type="submit" disabled={!videoUrl || !description}
            className="w-full rounded-md text-white text-sm font-medium py-2.5 disabled:opacity-40"
            style={{ background: PRIMARY }}>Guardar sesión</button>
        </form>
      </div>
    </div>
  );
}

function AddPerformanceModal({ profiles, onClose, onAdd }: {
  profiles: Profile[]; onClose: () => void; onAdd: (n: PerformanceNote) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("Partido");
  const [rating, setRating] = useState(7);
  const [content, setContent] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nuevo informe</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onAdd({ id: "pn" + Date.now(), date, authorId: author, category, rating, content }); }}
          className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TF label="Fecha" value={date} onChange={setDate} type="date" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Autor</label>
              <select value={author} onChange={(e) => setAuthor(e.target.value)} required
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="">—</option>
                {profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option>Partido</option><option>Entrenamiento</option>
                <option>Informe mensual</option><option>Informe scouting</option>
                <option>Médico</option><option>Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valoración ({rating}/10)</label>
              <input type="range" min={1} max={10} value={rating} onChange={(e) => setRating(parseInt(e.target.value))} className="w-full mt-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Informe / Observaciones</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={4}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
          </div>
          <button type="submit" disabled={!author || !content}
            className="w-full rounded-md text-white text-sm font-medium py-2 disabled:opacity-40"
            style={{ background: PRIMARY }}>Guardar informe</button>
        </form>
      </div>
    </div>
  );
}

/* ========== INFO TAB ========== */
function InfoTab({ player, onUpdate }: { player: Player; onUpdate: (p: Player) => void }) {
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState(player.info);
  const [uploading, setUploading] = useState(false);
  const passportRef = useRef<HTMLInputElement>(null);

  const handlePassportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadPassport } = await import('../lib/db');
      const url = await uploadPassport(player.id, file);
      const updated = { ...player, info: { ...player.info, passportUrl: url } };
      onUpdate(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  if (editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Editar info / entorno</h3>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500">Cancelar</button>
            <button onClick={() => { onUpdate({ ...player, info }); setEditing(false); }}
              className="text-xs px-3 py-1.5 rounded text-white" style={{ background: PRIMARY }}>Guardar</button>
          </div>
        </div>
        <TF label="Teléfono" value={info.phone ?? ''} onChange={(v) => setInfo({ ...info, phone: v })} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Familia</label>
          <textarea value={info.family} onChange={(e) => setInfo({ ...info, family: e.target.value })} rows={3}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Personalidad</label>
          <textarea value={info.personality} onChange={(e) => setInfo({ ...info, personality: e.target.value })} rows={3}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
        </div>
      </div>
    );
  }

  const i = player.info;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Info / Entorno</h3>
        <button onClick={() => { setInfo(player.info); setEditing(true); }}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
          <Edit3 className="w-3 h-3" />Editar
        </button>
      </div>

      {/* Phone */}
      {i.phone && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-0.5">Teléfono</p>
          <a href={`tel:${i.phone}`} className="text-sm text-blue-600 hover:underline">{i.phone}</a>
        </div>
      )}

      <IF label="Familia" value={i.family} />
      <IF label="Personalidad" value={i.personality} />

      {/* Passport */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Pasaporte</p>
        {i.passportUrl ? (
          <div className="flex items-center gap-2">
            <a href={i.passportUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Download className="w-3 h-3" /> Ver pasaporte
            </a>
            <button onClick={() => passportRef.current?.click()}
              className="text-xs text-slate-400 hover:text-slate-600">
              (reemplazar)
            </button>
          </div>
        ) : (
          <button onClick={() => passportRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-50">
            <Paperclip className="w-3 h-3" />
            {uploading ? 'Subiendo...' : 'Subir pasaporte (PDF/imagen)'}
          </button>
        )}
        <input ref={passportRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handlePassportUpload} />
      </div>
    </div>
  );
}

/* ========== LINKS SECTION (inside InfoTab) ========== */
function LinksSection({ player, onUpdate }: { player: Player; onUpdate: (p: Player) => void }) {
  const [tmUrl, setTmUrl] = useState(player.transfermarktUrl ?? "");
  const [editingTm, setEditingTm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);

  const saveTransfermarkt = () => {
    onUpdate({ ...player, transfermarktUrl: tmUrl || undefined });
    setEditingTm(false);
  };

  const addLink = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const link: PlayerLink = { id: Date.now().toString(), label: newLabel.trim(), url: newUrl.trim() };
    onUpdate({ ...player, links: [...(player.links ?? []), link] });
    setNewLabel(""); setNewUrl(""); setShowAddLink(false);
  };

  const removeLink = (id: string) => {
    onUpdate({ ...player, links: (player.links ?? []).filter((l) => l.id !== id) });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
        <Link2 className="w-4 h-4 text-slate-400" /> Links y Transfermarkt
      </h3>

      {/* Transfermarkt */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Transfermarkt</p>
        {editingTm ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={tmUrl}
              onChange={(e) => setTmUrl(e.target.value)}
              placeholder="https://www.transfermarkt.es/..."
              className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button onClick={saveTransfermarkt}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white" style={{ background: PRIMARY }}>
              Guardar
            </button>
            <button onClick={() => { setTmUrl(player.transfermarktUrl ?? ""); setEditingTm(false); }}
              className="px-2 py-1.5 rounded-md text-xs text-slate-500 border border-slate-200">
              ✕
            </button>
          </div>
        ) : player.transfermarktUrl ? (
          <div className="flex items-center gap-2">
            <a href={player.transfermarktUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
              <ExternalLink className="w-3.5 h-3.5" /> Ver perfil en Transfermarkt
            </a>
            <button onClick={() => setEditingTm(true)} className="text-xs text-slate-400 hover:text-slate-600">(editar)</button>
          </div>
        ) : (
          <button onClick={() => setEditingTm(true)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700">
            <Plus className="w-3 h-3" /> Añadir enlace de Transfermarkt
          </button>
        )}
      </div>

      {/* Custom links */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-500">Otros enlaces</p>
          <button onClick={() => setShowAddLink((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <Plus className="w-3 h-3" /> Añadir
          </button>
        </div>

        {showAddLink && (
          <div className="bg-slate-50 rounded-md p-3 mb-2 space-y-2">
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nombre (ej. Vídeo Streamable, Instagram…)"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <div className="flex gap-2">
              <button onClick={addLink} disabled={!newLabel.trim() || !newUrl.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-40" style={{ background: PRIMARY }}>
                Añadir enlace
              </button>
              <button onClick={() => setShowAddLink(false)} className="px-3 py-1.5 rounded-md text-xs border border-slate-200 text-slate-500">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {(player.links ?? []).length === 0 && !showAddLink && (
          <p className="text-xs text-slate-400 italic">Sin enlaces añadidos</p>
        )}
        <div className="space-y-1.5">
          {(player.links ?? []).map((link) => (
            <div key={link.id} className="flex items-center gap-2">
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline flex-1 min-w-0 truncate">
                <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                {link.label}
              </a>
              <button onClick={() => removeLink(link.id)}
                className="p-1 text-slate-300 hover:text-red-500 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Shared micro-components ---- */
function DF({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}
function IF({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}
function TF({ label, value, onChange, type = "text", required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
    </div>
  );
}

/* ---- Edit Player Modal ---- */
function EF({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2" />
    </div>
  );
}

function ESel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Profile[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
        <option value="">—</option>
        {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}

function EditPlayerModal({ player, profiles, onClose, onSave }: {
  player: Player; profiles: Profile[];
  onClose: () => void; onSave: (p: Player) => void;
}) {
  const [name, setName] = useState(player.name);
  const [birthDate, setBirthDate] = useState(player.birthDate ?? "");
  const [pos1, setPos1] = useState(player.positions[0] ?? "");
  const [pos2, setPos2] = useState(player.positions[1] ?? "");
  const [nationality, setNationality] = useState(player.nationality);
  const [partner, setPartner] = useState(player.partner ?? "");
  const [managed1, setManaged1] = useState(player.managedBy[0] ?? "");
  const [managed2, setManaged2] = useState(player.managedBy[1] ?? "");
  const [reprStart, setReprStart] = useState(player.representationContract.start ?? "");
  const [reprEnd, setReprEnd] = useState(player.representationContract.end ?? "");
  const [clubEnd, setClubEnd] = useState(player.clubContract.endDate ?? "");
  const [optYears, setOptYears] = useState(player.clubContract.optionalYears?.toString() ?? "");
  const [releaseClause, setReleaseClause] = useState(player.clubContract.releaseClause ?? "");
  const [commission, setCommission] = useState(player.clubContract.agentCommission ?? "");

  const [phone, setPhone] = useState(player.info.phone ?? "");

  // Clubs
  const [club1, setClub1] = useState(player.clubs[0]?.name ?? "");
  const [club2, setClub2] = useState(player.clubs[1]?.name ?? "");
  const [isLoan, setIsLoan] = useState(player.clubs.some((c) => c.type === "cedido_en" || c.type === "propietario"));

  const handleSave = () => {
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
    onSave({
      ...player,
      name,
      birthDate,
      positions: [pos1, pos2].filter(Boolean),
      nationality,
      clubs,
      partner: partner || undefined,
      managedBy: [managed1, managed2].filter(Boolean),
      info: { ...player.info, phone },
      representationContract: { ...player.representationContract, start: reprStart, end: reprEnd },
      clubContract: {
        ...player.clubContract,
        endDate: clubEnd,
        optionalYears: optYears ? parseInt(optYears) : undefined,
        releaseClause: releaseClause || undefined,
        agentCommission: commission || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">Editar jugador</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <EF label="Nombre completo" value={name} onChange={setName} />
          <div className="grid grid-cols-2 gap-3">
            <EF label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} type="date" />
            <EF label="Nacionalidad" value={nationality} onChange={setNationality} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EF label="Posición principal" value={pos1} onChange={setPos1} />
            <EF label="Posición secundaria" value={pos2} onChange={setPos2} />
          </div>
          <EF label="Teléfono" value={phone} onChange={setPhone} type="tel" />

          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Club(s)</p>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="editIsLoan" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} className="rounded" />
              <label htmlFor="editIsLoan" className="text-xs text-slate-600">Jugador cedido</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EF label={isLoan ? "Club propietario" : "Club principal"} value={club1} onChange={setClub1} />
              <EF label={isLoan ? "Club donde juega" : "Segundo equipo (opcional)"} value={club2} onChange={setClub2} />
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contrato de representación</p>
            <div className="grid grid-cols-2 gap-3">
              <EF label="Inicio" value={reprStart} onChange={setReprStart} type="date" />
              <EF label="Fin" value={reprEnd} onChange={setReprEnd} type="date" />
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contrato con club</p>
            <div className="grid grid-cols-2 gap-3">
              <EF label="Fin de contrato" value={clubEnd} onChange={setClubEnd} type="date" />
              <EF label="Años opcionales" value={optYears} onChange={setOptYears} type="number" />
              <EF label="Cláusula de rescisión" value={releaseClause} onChange={setReleaseClause} />
              <EF label="Comisión agente" value={commission} onChange={setCommission} />
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Equipo</p>
            <div className="grid grid-cols-3 gap-3">
              <ESel label="Encargado 1" value={managed1} onChange={setManaged1} options={profiles} />
              <ESel label="Encargado 2" value={managed2} onChange={setManaged2} options={profiles} />
              <EF label="Partner" value={partner} onChange={setPartner} />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-md border border-slate-200 text-slate-600 text-sm py-2">Cancelar</button>
            <button
              onClick={handleSave}
              className="flex-1 rounded-md text-white text-sm font-medium py-2 transition-colors"
              style={{ background: PRIMARY }}
            >
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
