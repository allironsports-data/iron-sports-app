import { useState, useRef } from "react";
import type {
  Player, Task, TaskComment, TaskAttachment,
  PerformanceNote,
} from "../types";
import { calcAge } from "../types";
import type { Profile } from "../contexts/AuthContext";
import {
  ArrowLeft, LogOut, ClipboardList, FileText,
  TrendingUp, User, Plus, X, Calendar, AlertCircle,
  Clock, CheckCircle2, Trash2, Edit3, Star, Users,
  MessageSquare, Paperclip, Send, Download,
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
    { id: "rendimiento", label: "Rendimiento", icon: <TrendingUp className="w-4 h-4" />, count: player.performance.length },
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
            <div className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-black" style={{ background: PRIMARY }}>AI</div>
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
          <ContractTab player={player} onUpdate={onUpdatePlayer} />
        )}
        {activeTab === "rendimiento" && (
          <PerformanceTab player={player} profiles={profiles} onUpdate={onUpdatePlayer} />
        )}
        {activeTab === "info" && (
          <InfoTab player={player} onUpdate={onUpdatePlayer} />
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
  const [filter, setFilter] = useState<"todas" | "pendiente" | "en_progreso" | "completada">("todas");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

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

  const addComment = (task: Task, comment: TaskComment) =>
    onUpdateTask({ ...task, comments: [...task.comments, comment] });

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
          const isOverdue = task.status !== "completada" && new Date(task.dueDate) < new Date();
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
                      <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        <Calendar className="w-3 h-3" />
                        {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                        {isOverdue && " (vencida)"}
                      </span>
                      {dependency && <span className="text-xs text-slate-400">Depende de: {dependency.title}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {task.comments.length > 0 && <span>{task.comments.length}</span>}
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
                  {task.comments.length > 0 && (
                    <div className="px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                      {task.comments.map((c) => {
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
                    currentProfile={currentProfile}
                    onSubmit={(comment) => addComment(task, comment)}
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
        <AddTaskModal profiles={profiles} tasks={tasks} playerId={player.id}
          onClose={() => setShowAdd(false)}
          onAdd={(t) => { onAddTask(t); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function CommentInput({ currentProfile, onSubmit }: {
  currentProfile: Profile;
  onSubmit: (comment: TaskComment) => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setAttachments((prev) => [
          ...prev,
          { id: Date.now().toString(), name: file.name, mimeType: file.type, data: base64, uploadedAt: new Date().toISOString(), uploadedBy: currentProfile.id },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    onSubmit({
      id: "c" + Date.now(),
      authorId: currentProfile.id,
      content: text.trim(),
      createdAt: new Date().toISOString(),
      attachments,
    });
    setText("");
    setAttachments([]);
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600">
              <Paperclip className="w-2.5 h-2.5" />
              {a.name}
              <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir comentario..."
          className="flex-1 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-1"
        />
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,image/*" multiple onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Adjuntar PDF"
        >
          <Paperclip className="w-3.5 h-3.5" />
        </button>
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

function AddTaskModal({ profiles, tasks, playerId, onClose, onAdd }: {
  profiles: Profile[]; tasks: Task[]; playerId: string;
  onClose: () => void; onAdd: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");
  const [depends, setDepends] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          onAdd({ id: "t" + Date.now(), playerId, title, description: desc, assigneeId: assignee,
            dependsOnId: depends || undefined, status: "pendiente", priority, dueDate,
            createdAt: new Date().toISOString().split("T")[0], comments: [] });
        }} className="p-4 space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <TF label="Fecha límite" value={dueDate} onChange={setDueDate} type="date" required />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Depende de</label>
              <select value={depends} onChange={(e) => setDepends(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2">
                <option value="">Ninguna</option>
                {tasks.filter((t) => t.status !== "completada").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" disabled={!title || !assignee || !dueDate}
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
function ContractTab({ player, onUpdate }: { player: Player; onUpdate: (p: Player) => void }) {
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
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const base64 = (ev.target?.result as string).split(",")[1];
                  onUpdate({
                    ...player,
                    clubContract: {
                      ...player.clubContract,
                      notes: (player.clubContract.notes || "") + `\n[PDF: ${file.name}]`,
                    },
                    info: {
                      ...player.info,
                      notes: player.info.notes + `\n__CONTRACT_PDF__${file.name}__${base64}`,
                    },
                  });
                };
                reader.readAsDataURL(file);
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
                <p className="text-xs text-slate-400 mb-0.5">Notas</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{player.clubContract.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

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

/* ========== PERFORMANCE TAB ========== */
function PerformanceTab({ player, profiles, onUpdate }: { player: Player; profiles: Profile[]; onUpdate: (p: Player) => void }) {
  const [showAdd, setShowAdd] = useState(false);

  const sorted = [...player.performance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Informes y valoraciones</h3>
        <button onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5"
          style={{ background: PRIMARY }}>
          <Plus className="w-3.5 h-3.5" />Nuevo informe
        </button>
      </div>
      <div className="space-y-3">
        {sorted.map((note) => {
          const author = profiles.find((m) => m.id === note.authorId);
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
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-[9px] font-semibold flex items-center justify-center text-slate-500">{author.avatar}</span>
                  <span className="text-xs text-slate-400">{author.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {sorted.length === 0 && <div className="text-center py-10 text-sm text-slate-400">No hay informes aún</div>}
      {showAdd && (
        <AddPerformanceModal profiles={profiles} onClose={() => setShowAdd(false)}
          onAdd={(note) => { onUpdate({ ...player, performance: [note, ...player.performance] }); setShowAdd(false); }} />
      )}
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
                <option>Partido</option>
                <option>Entrenamiento</option>
                <option>Informe mensual</option>
                <option>Informe scouting</option>
                <option>Médico</option>
                <option>Otro</option>
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

  if (editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Editar información personal</h3>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500">Cancelar</button>
            <button onClick={() => { onUpdate({ ...player, info }); setEditing(false); }}
              className="text-xs px-3 py-1.5 rounded text-white" style={{ background: PRIMARY }}>Guardar</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Familia</label>
          <textarea value={info.family} onChange={(e) => setInfo({ ...info, family: e.target.value })} rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
        </div>
        <TF label="Idiomas (separados por coma)" value={info.languages.join(", ")}
          onChange={(v) => setInfo({ ...info, languages: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Personalidad</label>
          <textarea value={info.personality} onChange={(e) => setInfo({ ...info, personality: e.target.value })} rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
        </div>
        <TF label="Intereses" value={info.interests} onChange={(v) => setInfo({ ...info, interests: v })} />
        <TF label="Ubicación" value={info.location} onChange={(v) => setInfo({ ...info, location: v })} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notas internas</label>
          <textarea value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 resize-none" />
        </div>
      </div>
    );
  }

  const i = player.info;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Información personal y entorno</h3>
        <button onClick={() => { setInfo(player.info); setEditing(true); }}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
          <Edit3 className="w-3 h-3" />Editar
        </button>
      </div>
      <div className="space-y-4">
        <IF label="Familia" value={i.family} />
        <IF label="Idiomas" value={i.languages.length > 0 ? i.languages.join(", ") : "—"} />
        <IF label="Personalidad" value={i.personality} />
        <IF label="Intereses" value={i.interests} />
        <IF label="Ubicación" value={i.location} />
        {i.notes && (
          <div className="pt-3 mt-3 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-1">Notas internas</p>
            <p className="text-sm text-slate-700">{i.notes}</p>
          </div>
        )}
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
