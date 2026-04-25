import { useState, useEffect, useCallback } from "react";
import { X, Trash2, ChevronRight, Send } from "lucide-react";
import type { Task, Player } from "../types";
import type { Profile } from "../contexts/AuthContext";
import * as db from "../lib/db";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  task: Task;
  player: Player | undefined;
  profiles: Profile[];
  currentProfile: Profile;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onSaveAndClose: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onGoToPlayer?: (playerId: string) => void;
}

export function TaskDetailPanel({
  task, player, profiles, currentProfile,
  onClose, onUpdate, onSaveAndClose, onDelete, onGoToPlayer,
}: Props) {
  const canEdit = currentProfile.is_admin || task.assigneeId === currentProfile.id;

  const [title, setTitle]           = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus]         = useState<Task["status"]>(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [watchers, setWatchers]     = useState<string[]>(task.watchers ?? []);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState(task.comments ?? []);
  const [sendingComment, setSendingComment] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const fetched = await db.fetchComments(task.id);
      setLocalComments(fetched);
    } catch { /* silent */ }
  }, [task.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setAssigneeId(task.assigneeId);
    setWatchers(task.watchers ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.status]);

  const handleSave = () => {
    onSaveAndClose({ ...task, title, description, status, assigneeId, watchers });
  };

  const handleStatusChange = (newStatus: Task["status"]) => {
    setStatus(newStatus);
    onUpdate({ ...task, title, description, status: newStatus, assigneeId, watchers });
  };

  const toggleWatcher = (profileId: string) => {
    if (!canEdit) return;
    setWatchers(prev =>
      prev.includes(profileId) ? prev.filter(id => id !== profileId) : [...prev, profileId]
    );
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const newComment = await db.createComment(task.id, currentProfile.id, commentText.trim());
      setLocalComments(prev => [...prev, newComment]);
      setCommentText("");
    } catch (e) {
      console.error("Error enviando comentario:", e);
    } finally {
      setSendingComment(false);
    }
  };

  const initials = (name: string) =>
    name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const assignee = profiles.find(p => p.id === (canEdit ? assigneeId : task.assigneeId));
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completada";

  const priorityBorderColor =
    task.priority === "alta"  ? "#E24B4A" :
    task.priority === "media" ? "#EF9F27" : "#888780";

  const priorityBadge =
    task.priority === "alta"  ? { bg: "#FCEBEB", color: "#A32D2D", label: "Alta prioridad" } :
    task.priority === "media" ? { bg: "#FAEEDA", color: "#854F0B", label: "Media prioridad" } :
                                { bg: "#F1EFE8", color: "#444441", label: "Baja prioridad" };

  const statusConfig = {
    pendiente:    { label: "Pendiente",    active: "bg-slate-100 border-slate-300 text-slate-800" },
    en_progreso:  { label: "En progreso",  active: "bg-blue-50 border-blue-300 text-blue-800" },
    completada:   { label: "Completada",   active: "bg-emerald-50 border-emerald-300 text-emerald-800" },
  } as const;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Modal — two-column layout */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-start gap-0 flex-shrink-0 border-b border-slate-100">
            {/* Priority bar */}
            <div
              className="w-1 self-stretch rounded-tl-2xl flex-shrink-0"
              style={{ background: priorityBorderColor }}
            />
            <div className="flex-1 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    {task.adminOnly && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                        Admin
                      </span>
                    )}
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ background: priorityBadge.bg, color: priorityBadge.color }}
                    >
                      {priorityBadge.label}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                        Vencida
                      </span>
                    )}
                  </div>
                  {/* Title */}
                  {canEdit ? (
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full text-base font-semibold text-slate-900 bg-transparent border-none outline-none focus:bg-slate-50 rounded px-1 -ml-1 py-0.5"
                    />
                  ) : (
                    <h2 className="text-base font-semibold text-slate-900 leading-snug">{task.title}</h2>
                  )}
                  {/* Player link */}
                  {player && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-500 flex-shrink-0">
                        {initials(player.name)}
                      </div>
                      {onGoToPlayer ? (
                        <button
                          onClick={() => { onGoToPlayer(player.id); onClose(); }}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          {player.name} <ChevronRight className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{player.name}</span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5 flex-shrink-0 mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Body: two columns ──────────────────────────────── */}
          <div className="flex flex-1 min-h-0">

            {/* LEFT — fields */}
            <div className="flex-1 min-w-0 flex flex-col border-r border-slate-100 overflow-y-auto">
              <div className="p-5 space-y-5">

                {/* Read-only notice */}
                {!canEdit && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    Solo puedes comentar — editar lo hace el responsable.
                  </div>
                )}

                {/* Status */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Estado</p>
                  <div className="flex gap-1.5">
                    {(["pendiente", "en_progreso", "completada"] as const).map(s => {
                      const cfg = statusConfig[s];
                      const active = status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => canEdit && handleStatusChange(s)}
                          disabled={!canEdit}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors
                            ${active ? cfg.active : "bg-white text-slate-500 border-slate-200"}
                            ${canEdit ? "hover:opacity-90" : "cursor-default opacity-60"}`}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Descripción</p>
                  {canEdit ? (
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none h-24"
                    />
                  ) : description ? (
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{description}</p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sin descripción</p>
                  )}
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Assignee */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Responsable</p>
                    {canEdit ? (
                      <select
                        value={assigneeId}
                        onChange={e => setAssigneeId(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">— Sin asignar —</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>
                        ))}
                      </select>
                    ) : assignee ? (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: PRIMARY }}
                        >
                          {initials(assignee.name)}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{assignee.name.split(" ")[0]}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Sin asignar</p>
                    )}
                  </div>

                  {/* Due date */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Fecha límite</p>
                    {task.dueDate ? (
                      <>
                        <p className={`text-sm font-medium ${isOverdue ? "text-red-600" : "text-slate-700"}`}>
                          {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {isOverdue && <p className="text-[10px] text-red-500 mt-0.5">Vencida</p>}
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">Sin fecha</p>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Prioridad</p>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: priorityBadge.bg, color: priorityBadge.color }}
                    >
                      {task.priority === "alta" ? "Alta" : task.priority === "media" ? "Media" : "Baja"}
                    </span>
                  </div>

                  {/* Created */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Creada</p>
                    <p className="text-sm text-slate-700">
                      {new Date(task.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Watchers */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Adjuntados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profiles.map(p => {
                      const active = watchers.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleWatcher(p.id)}
                          disabled={!canEdit}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                            ${active ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500"}
                            ${canEdit ? "hover:opacity-80" : "cursor-default"}`}
                        >
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                            style={{ background: active ? "#185FA5" : "#94a3b8" }}
                          >
                            {initials(p.name)}
                          </div>
                          {p.name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              {canEdit && (
                <div className="px-5 pb-5 pt-2 flex gap-2 mt-auto">
                  <button
                    onClick={handleSave}
                    className="flex-1 rounded-xl text-white text-sm font-medium py-2.5 transition-colors hover:opacity-90"
                    style={{ background: PRIMARY }}
                  >
                    Guardar cambios
                  </button>
                  <button
                    onClick={() => { if (confirm("¿Eliminar esta tarea?")) onDelete(task.id); }}
                    className="rounded-xl border border-red-200 text-red-600 px-4 py-2.5 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT — comments */}
            <div className="w-72 flex-shrink-0 flex flex-col bg-white">
              <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                <p className="text-xs font-semibold text-slate-500">
                  Comentarios{localComments.length > 0 ? ` · ${localComments.length}` : ""}
                </p>
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {localComments.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Sin comentarios aún</p>
                ) : (
                  localComments.map(comment => {
                    const author = profiles.find(p => p.id === comment.authorId);
                    const isMe = comment.authorId === currentProfile.id;
                    return (
                      <div key={comment.id} className={`flex gap-2 items-end ${isMe ? "flex-row-reverse" : ""}`}>
                        <div
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ background: PRIMARY }}
                        >
                          {author ? initials(author.name) : "?"}
                        </div>
                        <div className={`flex-1 max-w-[82%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                              isMe
                                ? "bg-blue-600 text-white rounded-br-sm"
                                : "bg-slate-100 text-slate-700 rounded-bl-sm"
                            }`}
                          >
                            {comment.content}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 px-1">
                            {isMe ? "Tú" : (author?.name.split(" ")[0] ?? "?")} ·{" "}
                            {new Date(comment.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment input */}
              <div className="px-3 py-3 border-t border-slate-100 flex-shrink-0 flex gap-2 items-center">
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: PRIMARY }}
                >
                  {initials(currentProfile.name)}
                </div>
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && commentText.trim()) handleSendComment(); }}
                  placeholder="Escribe un comentario…"
                  className="flex-1 min-w-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  onClick={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  className="rounded-full p-1.5 disabled:opacity-40 transition-colors flex-shrink-0"
                  style={{ background: PRIMARY }}
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
