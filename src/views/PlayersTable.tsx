import { useState, useRef, useEffect } from "react";
import type { Player } from "../types";
import type { Profile } from "../contexts/AuthContext";
import { Save, X, Check, Search, Trash2 } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DetailHeader } from "../components/shell";
import { Button, IconButton, Input } from "../components/ui";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import { L } from "../lib/labels";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../hooks/useToast";
import { ToastStack } from "../components/ToastStack";
import { isValidDate } from "../lib/validate";

interface Props {
  players: Player[];
  profiles: Profile[];
  onUpdatePlayer: (player: Player) => void;
  onBack: () => void;
  /** Borrado desde la tabla (solo admin). Aquí se ven TODOS los jugadores,
   *  incluidos los «solo Distribución» que no salen en Mantenimiento. */
  onDeletePlayer?: (id: string) => void | Promise<void>;
}

// Which cell is being edited
interface EditingCell {
  playerId: string;
  field: string;
}

type ColumnDef = {
  key: string;
  label: string;
  width: string;
  getValue: (p: Player) => string;
  setValue: (p: Player, value: string) => Player;
  type?: "text" | "date" | "select" | "number";
  options?: string[];
};

export function PlayersTable({ players, profiles, onUpdatePlayer, onBack, onDeletePlayer }: Props) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editInvalid, setEditInvalid] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, Player>>(new Map());
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const { toasts, showToast, dismissToast } = useToast();
  const [toDelete, setToDelete] = useState<Player | null>(null);
  const [deleting, setDeleting] = useState(false);
  // «Volver» con cambios pendientes pregunta antes
  const [confirmBack, setConfirmBack] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete || !onDeletePlayer) return;
    setDeleting(true);
    try {
      await onDeletePlayer(toDelete.id);
      setPendingChanges(prev => { const m = new Map(prev); m.delete(toDelete.id); return m; });
      showToast(`${toDelete.name} eliminado`);
      setToDelete(null);
    } catch (e) {
      console.error(e);
      showToast("No se pudo eliminar el jugador", "error");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef[] = [
    {
      key: "name", label: "Nombre", width: "min-w-[160px]",
      getValue: (p) => p.name,
      setValue: (p, v) => ({ ...p, name: v }),
    },
    {
      key: "nationality", label: "Nacionalidad", width: "min-w-[120px]",
      // La nacionalidad se guarda como "Principal / Segunda" en un solo campo.
      getValue: (p) => p.nationality.split("/").map(s => s.trim()).filter(Boolean)[0] ?? "",
      setValue: (p, v) => {
        const second = p.nationality.split("/").map(s => s.trim()).filter(Boolean)[1];
        return { ...p, nationality: [v.trim(), second].filter(Boolean).join(" / ") };
      },
    },
    {
      key: "nationality2", label: "2ª nacionalidad", width: "min-w-[120px]",
      getValue: (p) => p.nationality.split("/").map(s => s.trim()).filter(Boolean)[1] ?? "",
      setValue: (p, v) => {
        const first = p.nationality.split("/").map(s => s.trim()).filter(Boolean)[0] ?? "";
        return { ...p, nationality: [first, v.trim()].filter(Boolean).join(" / ") };
      },
    },
    {
      key: "birthDate", label: "Nacimiento", width: "min-w-[110px]", type: "date",
      getValue: (p) => p.birthDate,
      setValue: (p, v) => ({ ...p, birthDate: v }),
    },
    {
      key: "foot", label: "Pie hábil", width: "min-w-[100px]", type: "select",
      options: ["derecho", "izquierdo", "ambidiestro"],
      getValue: (p) => p.foot || "",
      setValue: (p, v) => ({ ...p, foot: (v || undefined) as Player["foot"] }),
    },
    {
      key: "pos1", label: "Posición 1", width: "min-w-[110px]",
      getValue: (p) => p.positions[0] || "",
      setValue: (p, v) => ({ ...p, positions: [v, p.positions[1] || ""].filter(Boolean) }),
    },
    {
      key: "pos2", label: "Posición 2", width: "min-w-[110px]",
      getValue: (p) => p.positions[1] || "",
      setValue: (p, v) => ({ ...p, positions: [p.positions[0] || "", v].filter(Boolean) }),
    },
    {
      key: "club1", label: "Club 1", width: "min-w-[140px]",
      getValue: (p) => p.clubs[0]?.name || "",
      setValue: (p, v) => {
        const clubs = p.clubs.length > 0
          ? [{ ...p.clubs[0], name: v }, ...p.clubs.slice(1)]
          : [{ name: v, type: "principal" as const }];
        return { ...p, clubs };
      },
    },
    {
      key: "club1type", label: "Tipo club 1", width: "min-w-[120px]", type: "select",
      options: ["principal", "cedido_en", "propietario", "compartido"],
      getValue: (p) => p.clubs[0]?.type || "",
      setValue: (p, v) => {
        const clubs = p.clubs.length > 0
          ? [{ ...p.clubs[0], type: v as Player["clubs"][0]["type"] }, ...p.clubs.slice(1)]
          : [{ name: "", type: v as Player["clubs"][0]["type"] }];
        return { ...p, clubs };
      },
    },
    {
      key: "club2", label: "Club 2", width: "min-w-[140px]",
      getValue: (p) => p.clubs[1]?.name || "",
      setValue: (p, v) => {
        if (!v) return { ...p, clubs: p.clubs.slice(0, 1) };
        const clubs = p.clubs.length > 1
          ? [p.clubs[0], { ...p.clubs[1], name: v }]
          : [p.clubs[0] || { name: "", type: "principal" as const }, { name: v, type: "cedido_en" as const }];
        return { ...p, clubs };
      },
    },
    {
      key: "reprStart", label: "Inicio repr.", width: "min-w-[110px]", type: "date",
      getValue: (p) => p.representationContract.start,
      setValue: (p, v) => ({ ...p, representationContract: { ...p.representationContract, start: v } }),
    },
    {
      key: "reprEnd", label: "Fin repr.", width: "min-w-[110px]", type: "date",
      getValue: (p) => p.representationContract.end,
      setValue: (p, v) => ({ ...p, representationContract: { ...p.representationContract, end: v } }),
    },
    {
      key: "clubEnd", label: "Fin contrato club", width: "min-w-[130px]", type: "date",
      getValue: (p) => p.clubContract.endDate,
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, endDate: v } }),
    },
    {
      key: "releaseClause", label: "Cláusula", width: "min-w-[100px]",
      getValue: (p) => p.clubContract.releaseClause || "",
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, releaseClause: v } }),
    },
    {
      key: "agentCommission", label: "Comisión ag.", width: "min-w-[100px]",
      getValue: (p) => p.clubContract.agentCommission || "",
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, agentCommission: v } }),
    },
    {
      key: "manager", label: L.encargado, width: "min-w-[130px]", type: "select",
      options: profiles.map(pr => pr.name),
      getValue: (p) => {
        const mgr = profiles.find(pr => pr.id === p.managedBy[0]);
        return mgr?.name || "";
      },
      setValue: (p, v) => {
        const mgr = profiles.find(pr => pr.name === v);
        if (!mgr) return p;
        return { ...p, managedBy: [mgr.id, ...(p.managedBy.slice(1))] };
      },
    },
  ];

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement && inputRef.current.type === "text") {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const filtered = players
    .filter((p) => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return p.name.toLowerCase().includes(q)
        || p.nationality.toLowerCase().includes(q)
        || p.clubs.some(c => c.name.toLowerCase().includes(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getPlayer = (id: string) => pendingChanges.get(id) || players.find(p => p.id === id)!;

  const startEdit = (playerId: string, field: string) => {
    const col = columns.find(c => c.key === field)!;
    const player = getPlayer(playerId);
    setEditing({ playerId, field });
    setEditValue(col.getValue(player));
    setEditInvalid(false);
  };

  /** Valida el valor según el tipo de columna antes de guardar. */
  const isEditValueValid = (col: ColumnDef, value: string): boolean => {
    if (!value) return true; // vacío = borrar valor, permitido
    if (col.type === "date") return isValidDate(value);
    if (col.type === "number") return Number.isFinite(Number(value));
    return true;
  };

  const confirmEdit = () => {
    if (!editing) return false;
    const col = columns.find(c => c.key === editing.field)!;
    if (!isEditValueValid(col, editValue)) {
      setEditInvalid(true);
      return false;
    }
    const player = getPlayer(editing.playerId);
    const currentValue = col.getValue(player);
    if (editValue !== currentValue) {
      const updated = col.setValue(player, editValue);
      setPendingChanges(prev => new Map(prev).set(editing.playerId, updated));
    }
    setEditing(null);
    setEditInvalid(false);
    return true;
  };

  const cancelEdit = () => { setEditing(null); setEditInvalid(false); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
    if (e.key === "Tab") {
      e.preventDefault();
      const ok = confirmEdit();
      // Move to next cell only if the current value was valid
      if (ok && editing) {
        const colIdx = columns.findIndex(c => c.key === editing.field);
        const playerIdx = filtered.findIndex(p => p.id === editing.playerId);
        if (colIdx < columns.length - 1) {
          startEdit(editing.playerId, columns[colIdx + 1].key);
        } else if (playerIdx < filtered.length - 1) {
          startEdit(filtered[playerIdx + 1].id, columns[0].key);
        }
      }
    }
  };

  const saveAll = async () => {
    const changes = Array.from(pendingChanges.values());
    try {
      for (const player of changes) {
        await onUpdatePlayer(player);
      }
      setPendingChanges(new Map());
      setSavedFeedback(`${changes.length} jugador${changes.length > 1 ? 'es' : ''} actualizado${changes.length > 1 ? 's' : ''}`);
      setTimeout(() => setSavedFeedback(null), 6000);
    } catch {
      showToast("No se pudieron guardar los cambios. Inténtalo de nuevo.", "error");
    }
  };

  const discardAll = () => setPendingChanges(new Map());

  const hasChanges = pendingChanges.size > 0;
  useBeforeUnload(hasChanges);
  const handleBack = () => { if (hasChanges) setConfirmBack(true); else onBack(); };

  return (
    <div className="min-h-dvh bg-slate-50">
      <DetailHeader
        onBack={handleBack}
        title="Tabla de jugadores"
        subtitle="Edición rápida — haz clic en cualquier celda"
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {hasChanges && (
              <>
                <span className="text-secondary text-amber-700 font-medium whitespace-nowrap">{pendingChanges.size} cambio{pendingChanges.size > 1 ? 's' : ''}</span>
                <Button size="sm" icon={<X />} onClick={discardAll}>Descartar</Button>
                <Button size="sm" variant="primary" icon={<Save />} onClick={saveAll}>Guardar todo</Button>
              </>
            )}
            {savedFeedback && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-secondary font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 animate-in fade-in duration-200"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />{savedFeedback}
              </span>
            )}
          </div>
        }
      />

      {/* Buscador */}
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jugador, club…"
            aria-label={L.buscar}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1480px] text-secondary">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {columns.map((col) => (
                    <th key={col.key} className={`text-left px-3 py-2.5 text-meta uppercase tracking-wide font-semibold text-slate-600 ${col.width} whitespace-nowrap`}>
                      {col.label}
                    </th>
                  ))}
                  {onDeletePlayer && <th className="px-3 py-2.5 w-10" aria-label="Eliminar" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((rawPlayer) => {
                  const player = getPlayer(rawPlayer.id);
                  const isModified = pendingChanges.has(player.id);
                  return (
                    <tr key={player.id} className={`border-b border-slate-50 hover:bg-blue-50/30 ${isModified ? 'bg-amber-50/40' : ''}`}>
                      {columns.map((col) => {
                        const isEditing = editing?.playerId === player.id && editing?.field === col.key;
                        const value = col.getValue(player);
                        const displayValue = col.key === "birthDate" && value
                          ? new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
                          : col.key === "reprEnd" || col.key === "clubEnd"
                            ? value ? new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"
                            : value || "—";

                        // Color for contract dates
                        let cellColor = "";
                        if ((col.key === "reprEnd" || col.key === "clubEnd") && value) {
                          const d = Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          if (d < 0) cellColor = "text-slate-500";
                          else if (d < 183) cellColor = "text-red-600 font-semibold";
                          else if (d < 365) cellColor = "text-amber-600 font-semibold";
                        }

                        return (
                          <td key={col.key} className={`px-3 py-2 ${col.width}`}>
                            {isEditing ? (
                              col.type === "select" ? (
                                <select
                                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={confirmEdit}
                                  onKeyDown={handleKeyDown}
                                  aria-label={col.label}
                                  className="w-full rounded border border-blue-300 px-1.5 py-1 text-secondary focus:outline-none focus:ring-2 focus:ring-blue-200"
                                >
                                  <option value="">—</option>
                                  {(col.options || []).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={inputRef as React.RefObject<HTMLInputElement>}
                                  type={col.type || "text"}
                                  value={editValue}
                                  onChange={(e) => { setEditValue(e.target.value); setEditInvalid(false); }}
                                  onBlur={confirmEdit}
                                  onKeyDown={handleKeyDown}
                                  aria-invalid={editInvalid}
                                  aria-label={col.label}
                                  className={`w-full rounded border px-1.5 py-1 text-secondary focus:outline-none focus:ring-2 ${
                                    editInvalid
                                      ? "border-red-400 ring-1 ring-red-200 focus:ring-red-200"
                                      : "border-blue-300 focus:ring-blue-200"
                                  }`}
                                />
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(player.id, col.key)}
                                className={`w-full text-left cursor-pointer hover:bg-blue-50 rounded px-1.5 py-1 -mx-1.5 -my-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${cellColor} ${
                                  col.key === "name" ? "font-medium text-slate-800" : "text-slate-600"
                                }`}
                                title="Clic para editar"
                              >
                                {displayValue}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      {onDeletePlayer && (
                        <td className="px-2 py-1 whitespace-nowrap text-right">
                          {player.hiddenFromManagement && (
                            <span className="mr-1 px-1.5 py-0.5 rounded bg-slate-100 text-badge text-slate-600" title="No aparece en Mantenimiento: es un jugador solo de Distribución (intermediar)">
                              solo Distribución
                            </span>
                          )}
                          <IconButton
                            label={`Eliminar a ${player.name}`}
                            onClick={() => setToDelete(player)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 />
                          </IconButton>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-meta text-slate-500">
            {filtered.length} jugador{filtered.length !== 1 ? 'es' : ''} · Haz clic en cualquier celda para editar · Tab para avanzar · Enter para confirmar · Esc para cancelar
          </div>
        </div>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Volver con cambios sin guardar */}
      <ConfirmModal
        open={confirmBack}
        title={`Tienes ${pendingChanges.size} cambio${pendingChanges.size > 1 ? 's' : ''} sin guardar`}
        message="Si sales ahora se perderán. ¿Quieres descartarlos?"
        confirmLabel="Descartar y volver"
        cancelLabel="Seguir editando"
        variant="danger"
        onConfirm={() => { setConfirmBack(false); discardAll(); onBack(); }}
        onCancel={() => setConfirmBack(false)}
      />

      <ConfirmModal
        open={!!toDelete}
        title={`¿Eliminar a ${toDelete?.name ?? ""}?`}
        message="Se borran también sus tareas, negociaciones y entradas de Distribución. Esta acción no se puede deshacer."
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setToDelete(null); }}
      />
    </div>
  );
}
