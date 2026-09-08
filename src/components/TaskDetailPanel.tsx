import { useState, useEffect, useCallback, useRef } from "react";
import { Trash2, ChevronRight, Send } from "lucide-react";
import { TASK_LABELS, type Task, type Player, type TaskLabel } from "../types";
import { parseDia, esVencida } from "../lib/fechas";
import type { Profile } from "../contexts/AuthContext";
import * as db from "../lib/db";
import { ConfirmModal } from "./ConfirmModal";
import { Sheet, Button, IconButton, Badge, Chip, Field, Select, Textarea, Input } from "./ui";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import { L, PRIORITY_LABELS, TASK_STATUS_LABELS, label as label_ } from "../lib/labels";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  task: Task;
  player: Player | undefined;
  players: Player[];
  profiles: Profile[];
  currentProfile: Profile;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onSaveAndClose: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onGoToPlayer?: (playerId: string) => void;
}

export function TaskDetailPanel({
  task, player, players, profiles, currentProfile,
  onClose, onUpdate, onSaveAndClose, onDelete, onGoToPlayer,
}: Props) {
  const canEdit = currentProfile.is_admin || task.assigneeId === currentProfile.id
    || (task.watchers ?? []).includes(currentProfile.id);

  const [title, setTitle]           = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus]         = useState<Task["status"]>(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [playerId, setPlayerId]     = useState(task.playerId === "general" ? "" : task.playerId);
  const [label, setLabel]           = useState<TaskLabel | "">(task.label ?? "");
  const [watchers, setWatchers]     = useState<string[]>(task.watchers ?? []);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState(task.comments ?? []);
  const [sendingComment, setSendingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const fetched = await db.fetchComments(task.id);
      setLocalComments(fetched);
    } catch { /* silent */ }
  }, [task.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Al abrir OTRA tarea se rellena el formulario entero. Antes esto también
  // se disparaba con task.status, así que si alguien cambiaba el estado de la
  // tarea desde otro sitio mientras tú escribías, te BORRABA el texto sin
  // guardar. Ahora un cambio de estado de fuera solo actualiza el estado.
  const tareaAbierta = useRef<string | null>(null);
  useEffect(() => {
    if (tareaAbierta.current === task.id) {
      setStatus(task.status);
      return;
    }
    tareaAbierta.current = task.id;
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setAssigneeId(task.assigneeId);
    // Sin esto, al saltar de una tarea a otra se arrastraba el jugador de la anterior
    setPlayerId(task.playerId === "general" ? "" : task.playerId);
    setLabel(task.label ?? "");
    setWatchers(task.watchers ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.status]);

  const effectivePlayerId = playerId || "general";

  const handleSave = async () => {
    setActionError(null);
    setSaving(true);
    try {
      await Promise.resolve(
        onSaveAndClose({ ...task, playerId: effectivePlayerId, title, description, status, assigneeId, label: label || undefined, watchers })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setActionError("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (newStatus: Task["status"]) => {
    setStatus(newStatus);
    onUpdate({ ...task, playerId: effectivePlayerId, title, description, status: newStatus, assigneeId, label: label || undefined, watchers });
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
  // Comparación de texto AAAA-MM-DD: a mediodía local seguía saliendo «Vencida»
  // por la tarde del mismo día. Vencer HOY no es estar vencida.
  const isOverdue = esVencida(task.dueDate) && task.status !== "completada";

  const priorityBorderColor =
    task.priority === "alta"  ? "#E24B4A" :
    task.priority === "media" ? "#EF9F27" : "#888780";

  const priorityBadge =
    task.priority === "alta"  ? { bg: "#FCEBEB", color: "#A32D2D", label: "Alta prioridad" } :
    task.priority === "media" ? { bg: "#FAEEDA", color: "#854F0B", label: "Media prioridad" } :
                                { bg: "#F1EFE8", color: "#444441", label: "Baja prioridad" };

  const statusConfig = {
    pendiente:    { label: TASK_STATUS_LABELS.pendiente,   active: "bg-slate-100 border-slate-300 text-slate-800" },
    en_progreso:  { label: TASK_STATUS_LABELS.en_progreso, active: "bg-blue-50 border-blue-300 text-blue-800" },
    completada:   { label: TASK_STATUS_LABELS.completada,  active: "bg-emerald-50 border-emerald-300 text-emerald-800" },
  } as const;

  // ── Dirty guard: cambios sin guardar en el formulario o comentario a medias ──
  const sameWatchers = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
  const dirty = canEdit && (
    title !== task.title ||
    description !== task.description ||
    assigneeId !== task.assigneeId ||
    effectivePlayerId !== (task.playerId || "general") ||
    (label || "") !== (task.label ?? "") ||
    !sameWatchers(watchers, task.watchers ?? [])
  ) || commentText.trim().length > 0;
  useBeforeUnload(dirty);

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        historyKey="task-detail"
        dirty={dirty}
        onSubmit={canEdit ? (e) => { e.preventDefault(); void handleSave(); } : undefined}
        className="sm:max-w-2xl"
        title={
          <span className="flex items-center gap-2 flex-wrap">
            <span
              aria-hidden="true"
              className="w-1.5 h-4 rounded-full flex-shrink-0"
              style={{ background: priorityBorderColor }}
            />
            {canEdit ? (
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                aria-label="Título de la tarea"
                className="flex-1 min-w-[12rem] text-body sm:text-base font-semibold text-slate-900 bg-transparent border-none outline-none focus:bg-slate-50 rounded px-1 -ml-1 py-0.5"
              />
            ) : (
              <span className="text-body sm:text-base font-semibold text-slate-900 leading-snug">{task.title}</span>
            )}
          </span>
        }
        description={
          <span className="flex items-center gap-1.5 flex-wrap">
            {task.adminOnly && <Badge tone="danger">Admin</Badge>}
            <Badge style={{ background: priorityBadge.bg, color: priorityBadge.color }}>{priorityBadge.label}</Badge>
            {task.label && <Badge tone="primary">{task.label}</Badge>}
            {isOverdue && <Badge tone="danger">Vencida</Badge>}
            {player && (
              onGoToPlayer ? (
                <button
                  type="button"
                  onClick={() => { onGoToPlayer(player.id); onClose(); }}
                  className="inline-flex items-center gap-0.5 text-secondary text-blue-700 hover:underline rounded"
                >
                  {player.name} <ChevronRight className="w-3 h-3" aria-hidden="true" />
                </button>
              ) : (
                <span className="text-secondary text-slate-500">{player.name}</span>
              )
            )}
          </span>
        }
        footer={canEdit ? (
          <>
            {actionError && (
              <p className="text-secondary text-red-600 w-full" role="alert">{actionError}</p>
            )}
            <Button variant="ghost" icon={<Trash2 />} onClick={() => setConfirmDelete(true)} className="mr-auto text-red-600 hover:bg-red-50">
              {L.eliminar}
            </Button>
            <Button type="submit" variant="primary" loading={saving} className={saved ? "bg-emerald-600 hover:bg-emerald-600" : undefined}>
              {saved ? "Guardado" : "Guardar cambios"}
            </Button>
          </>
        ) : undefined}
      >
        {/* Dos columnas (apiladas en móvil). Los márgenes negativos anulan el padding del cuerpo del Sheet. */}
        <div className="-mx-4 sm:-mx-5 -my-4 sm:h-full flex flex-col sm:flex-row sm:min-h-0">

          {/* IZQUIERDA — campos */}
          <div className="flex-1 min-w-0 flex flex-col border-b sm:border-b-0 sm:border-r border-slate-200 sm:min-h-0">
            <div className="flex-1 sm:overflow-y-auto p-4 sm:p-5 space-y-5">

              {/* Aviso solo lectura */}
              {!canEdit && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-secondary text-amber-700">
                  Solo puedes comentar — editar lo hace el {L.responsable.toLowerCase()}.
                </div>
              )}

              {/* Estado */}
              <div>
                <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.estado}</p>
                <div className="flex gap-1.5" role="group" aria-label={L.estado}>
                  {(["pendiente", "en_progreso", "completada"] as const).map(s => {
                    const cfg = statusConfig[s];
                    const active = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={active}
                        onClick={() => canEdit && handleStatusChange(s)}
                        disabled={!canEdit}
                        className={`flex-1 min-h-9 py-1.5 rounded-lg text-secondary font-medium border transition-colors
                          ${active ? cfg.active : "bg-white text-slate-600 border-slate-300"}
                          ${canEdit ? "hover:opacity-90" : "cursor-default opacity-60"}`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Descripción */}
              {canEdit ? (
                <Field label="Descripción">
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Detalles, contexto, enlaces…"
                  />
                </Field>
              ) : (
                <div>
                  <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">Descripción</p>
                  {description ? (
                    <p className="text-body text-slate-700 bg-slate-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{description}</p>
                  ) : (
                    <p className="text-secondary text-slate-500 italic">Sin descripción</p>
                  )}
                </div>
              )}

              {/* Metadatos */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Responsable */}
                <div className="bg-slate-50 rounded-xl p-3">
                  {canEdit ? (
                    <Field label={L.responsable}>
                      <Select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                        <option value="">— {L.sinResponsable} —</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <>
                      <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.responsable}</p>
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-badge font-bold text-white flex-shrink-0"
                            style={{ background: PRIMARY }}
                            aria-hidden="true"
                          >
                            {initials(assignee.name)}
                          </div>
                          <span className="text-body font-medium text-slate-700">{assignee.name.split(" ")[0]}</span>
                        </div>
                      ) : (
                        <p className="text-secondary text-slate-500">{L.sinResponsable}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Fecha límite */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">Fecha límite</p>
                  {task.dueDate ? (
                    <>
                      <p className={`text-body font-medium ${isOverdue ? "text-red-600" : "text-slate-700"}`}>
                        {parseDia(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {isOverdue && <p className="text-meta text-red-600 mt-0.5">Vencida</p>}
                    </>
                  ) : (
                    <p className="text-secondary text-slate-500">Sin fecha</p>
                  )}
                </div>

                {/* Prioridad */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.prioridad}</p>
                  <Badge style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                    {label_(PRIORITY_LABELS, task.priority)}
                  </Badge>
                </div>

                {/* Creada */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">Creada</p>
                  <p className="text-body text-slate-700">
                    {new Date(task.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>

                {/* Tipo */}
                <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                  {canEdit ? (
                    <Field label="Tipo">
                      <Select value={label} onChange={e => setLabel(e.target.value as TaskLabel | "")}>
                        <option value="">— Sin tipo —</option>
                        {TASK_LABELS.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <>
                      <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">Tipo</p>
                      {task.label ? <Badge tone="primary">{task.label}</Badge> : <p className="text-secondary text-slate-500">Sin tipo</p>}
                    </>
                  )}
                </div>

                {/* Jugador */}
                <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                  {canEdit ? (
                    <Field label={L.jugador}>
                      <Select value={playerId} onChange={e => setPlayerId(e.target.value)}>
                        <option value="">— Tarea general —</option>
                        {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <>
                      <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.jugador}</p>
                      {player ? <p className="text-body text-slate-700">{player.name}</p> : <p className="text-secondary text-slate-500">Tarea general</p>}
                    </>
                  )}
                </div>
              </div>

              {/* Seguidores */}
              <div>
                <p className="text-badge font-semibold uppercase tracking-wider text-slate-500 mb-2">{L.seguidores}</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={L.seguidores}>
                  {profiles.map(p => {
                    const active = watchers.includes(p.id);
                    return (
                      <Chip
                        key={p.id}
                        active={active}
                        onClick={() => toggleWatcher(p.id)}
                        disabled={!canEdit}
                        icon={
                          <span
                            aria-hidden="true"
                            className="w-6 h-6 -ml-1.5 rounded-full flex items-center justify-center text-badge font-bold text-white"
                            style={{ background: active ? "rgba(255,255,255,0.3)" : "#94a3b8" }}
                          >
                            {initials(p.name)}
                          </span>
                        }
                      >
                        {p.name.split(" ")[0]}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* DERECHA — comentarios */}
          <div className="w-full sm:w-72 flex-shrink-0 flex flex-col bg-white sm:min-h-0">
            <div className="px-4 py-3 border-b border-slate-200 flex-shrink-0">
              <p className="text-secondary font-semibold text-slate-600">
                Comentarios{localComments.length > 0 ? ` · ${localComments.length}` : ""}
              </p>
            </div>

            {/* Hilo */}
            <div className="flex-1 sm:overflow-y-auto px-4 py-3 space-y-3">
              {localComments.length === 0 ? (
                <p className="text-secondary text-slate-500 text-center py-6">Sin comentarios</p>
              ) : (
                localComments.map(comment => {
                  const author = profiles.find(p => p.id === comment.authorId);
                  const isMe = comment.authorId === currentProfile.id;
                  return (
                    <div key={comment.id} className={`flex gap-2 items-end ${isMe ? "flex-row-reverse" : ""}`}>
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-badge font-bold text-white"
                        style={{ background: PRIMARY }}
                        aria-hidden="true"
                      >
                        {author ? initials(author.name) : "?"}
                      </div>
                      <div className={`flex-1 max-w-[82%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div
                          className={`rounded-2xl px-3 py-2 text-secondary leading-relaxed whitespace-pre-wrap break-words ${
                            isMe
                              ? "bg-blue-600 text-white rounded-br-sm"
                              : "bg-slate-100 text-slate-700 rounded-bl-sm"
                          }`}
                        >
                          {comment.content}
                        </div>
                        <p className="text-meta text-slate-500 mt-0.5 px-1">
                          {isMe ? "Tú" : (author?.name.split(" ")[0] ?? "?")} ·{" "}
                          {new Date(comment.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Nuevo comentario */}
            <div className="px-3 py-3 border-t border-slate-200 flex-shrink-0 flex gap-2 items-center bg-white">
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-badge font-bold text-white"
                style={{ background: PRIMARY }}
                aria-hidden="true"
              >
                {initials(currentProfile.name)}
              </div>
              <Input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                // Enter envía el comentario (no el formulario de la tarea)
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (commentText.trim() && !sendingComment) void handleSendComment();
                  }
                }}
                aria-label="Nuevo comentario"
                placeholder="Escribe un comentario…"
                className="flex-1 min-w-0 rounded-full bg-slate-50 py-1.5 text-secondary"
              />
              <IconButton
                label="Enviar comentario"
                variant="primary"
                onClick={() => void handleSendComment()}
                disabled={!commentText.trim() || sendingComment}
                loading={sendingComment}
                className="rounded-full"
              >
                <Send />
              </IconButton>
            </div>
          </div>
        </div>
      </Sheet>

      {/* Confirmación de borrado */}
      <ConfirmModal
        open={confirmDelete}
        title="¿Eliminar esta tarea?"
        message="Esta acción no se puede deshacer."
        confirmLabel={L.eliminar}
        variant="danger"
        onConfirm={async () => {
          setActionError(null);
          try {
            await Promise.resolve(onDelete(task.id));
            setConfirmDelete(false);
          } catch {
            setConfirmDelete(false);
            setActionError("No se pudo guardar. Inténtalo de nuevo.");
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
