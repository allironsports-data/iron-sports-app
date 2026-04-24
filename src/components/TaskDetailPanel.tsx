import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Trash2 } from "lucide-react";
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

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<Task["status"]>(task.status);
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

  // Sync state when task changes (e.g. status toggled from the row)
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
      {/* Desktop backdrop (transparent, closes panel on click) */}
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
            {player && onGoToPlayer ? (
              <button
                onClick={() => { onGoToPlayer(player.id); onClose(); }}
                className="text-xs text-blue-600 hover:underline mt-0.5 flex items-center gap-0.5"
              >
                {player.name} <ChevronRight className="w-3 h-3" />
              </button>
            ) : player ? (
              <p className="text-xs text-slate-400 mt-0.5">{player.name}</p>
            ) : null}
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

            {/* Status buttons — visible to all, only actionable by editors */}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Estado</p>
              <div className="flex gap-1.5">
                {(["pendiente", "en_progreso", "completada"] as const).map((s) => {
                  const labels = { pendiente: "Pendiente", en_progreso: "En proceso", completada: "Completada" };
                  const active = status === s;
                  const activeCls = s === "pendiente"
                    ? "bg-slate-200 text-slate-900 border-slate-300"
                    : s === "en_progreso"
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300";
                  return (
                    <button key={s}
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

            {/* Edit fields */}
            {canEdit ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Título</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none h-20" />
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
                <p className="text-slate-600">
                  {new Date(task.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </p>
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
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
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
                Comentarios{localComments.length > 0 ? ` (${localComments.length})` : ""}
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
                        <div className={`flex-1 max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
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

        {/* Save / Delete (edit only) */}
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
