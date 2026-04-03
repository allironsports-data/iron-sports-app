import { useState, useRef, useEffect } from "react";
import type { Player } from "../types";
import type { Profile } from "../contexts/AuthContext";
import { ArrowLeft, LogOut, Save, X, Check, Search, Shield } from "lucide-react";
import logoImg from '../assets/logo.jpeg';

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  players: Player[];
  profiles: Profile[];
  currentProfile: Profile;
  onUpdatePlayer: (player: Player) => void;
  onBack: () => void;
  onLogout: () => void;
  onAdmin?: () => void;
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
  type?: "text" | "date" | "select";
  options?: string[];
};

export function PlayersTable({ players, profiles, currentProfile, onUpdatePlayer, onBack, onLogout, onAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Map<string, Player>>(new Map());
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const columns: ColumnDef[] = [
    {
      key: "name", label: "Nombre", width: "min-w-[160px]",
      getValue: (p) => p.name,
      setValue: (p, v) => ({ ...p, name: v }),
    },
    {
      key: "nationality", label: "Nacionalidad", width: "min-w-[120px]",
      getValue: (p) => p.nationality,
      setValue: (p, v) => ({ ...p, nationality: v }),
    },
    {
      key: "birthDate", label: "Nacimiento", width: "min-w-[120px]", type: "date",
      getValue: (p) => p.birthDate,
      setValue: (p, v) => ({ ...p, birthDate: v }),
    },
    {
      key: "position", label: "Posición", width: "min-w-[110px]",
      getValue: (p) => p.positions[0] || "",
      setValue: (p, v) => ({ ...p, positions: [v, ...(p.positions.slice(1))] }),
    },
    {
      key: "club", label: "Club", width: "min-w-[140px]",
      getValue: (p) => p.clubs[0]?.name || "",
      setValue: (p, v) => {
        const clubs = p.clubs.length > 0
          ? [{ ...p.clubs[0], name: v }, ...p.clubs.slice(1)]
          : [{ name: v, type: "principal" as const }];
        return { ...p, clubs };
      },
    },
    {
      key: "reprEnd", label: "Fin repr.", width: "min-w-[120px]", type: "date",
      getValue: (p) => p.representationContract.end,
      setValue: (p, v) => ({ ...p, representationContract: { ...p.representationContract, end: v } }),
    },
    {
      key: "clubEnd", label: "Fin club", width: "min-w-[120px]", type: "date",
      getValue: (p) => p.clubContract.endDate,
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, endDate: v } }),
    },
    {
      key: "releaseClause", label: "Cláusula", width: "min-w-[100px]",
      getValue: (p) => p.clubContract.releaseClause || "",
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, releaseClause: v } }),
    },
    {
      key: "agentCommission", label: "Comisión", width: "min-w-[90px]",
      getValue: (p) => p.clubContract.agentCommission || "",
      setValue: (p, v) => ({ ...p, clubContract: { ...p.clubContract, agentCommission: v } }),
    },
    {
      key: "manager", label: "Encargado", width: "min-w-[130px]", type: "select",
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
      if (!search) return true;
      const q = search.toLowerCase();
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
  };

  const confirmEdit = () => {
    if (!editing) return;
    const col = columns.find(c => c.key === editing.field)!;
    const player = getPlayer(editing.playerId);
    const currentValue = col.getValue(player);
    if (editValue !== currentValue) {
      const updated = col.setValue(player, editValue);
      setPendingChanges(prev => new Map(prev).set(editing.playerId, updated));
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
    if (e.key === "Tab") {
      e.preventDefault();
      confirmEdit();
      // Move to next cell
      if (editing) {
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
    for (const player of changes) {
      await onUpdatePlayer(player);
    }
    setPendingChanges(new Map());
    setSavedFeedback(`${changes.length} jugador${changes.length > 1 ? 'es' : ''} actualizado${changes.length > 1 ? 's' : ''}`);
    setTimeout(() => setSavedFeedback(null), 3000);
  };

  const discardAll = () => setPendingChanges(new Map());

  const hasChanges = pendingChanges.size > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src={logoImg} alt="" className="h-8 w-auto rounded" />
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-800">Tabla de jugadores</h1>
            <p className="text-xs text-slate-400">Edición rápida — haz clic en cualquier celda</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-2 w-44"
            />
          </div>

          {/* Save/discard */}
          {hasChanges && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 font-medium">{pendingChanges.size} cambio{pendingChanges.size > 1 ? 's' : ''}</span>
              <button onClick={discardAll}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700">
                <X className="w-3 h-3" />Descartar
              </button>
              <button onClick={saveAll}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-white font-medium" style={{ background: PRIMARY }}>
                <Save className="w-3 h-3" />Guardar todo
              </button>
            </div>
          )}
          {savedFeedback && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" />{savedFeedback}
            </span>
          )}

          <div className="flex items-center gap-2">
            {onAdmin && (
              <button onClick={onAdmin} className="p-2 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Admin">
                <Shield className="w-4 h-4" />
              </button>
            )}
            <button onClick={onLogout} className="p-2 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Table */}
      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {columns.map((col) => (
                    <th key={col.key} className={`text-left px-3 py-2.5 font-semibold text-slate-600 ${col.width} whitespace-nowrap`}>
                      {col.label}
                    </th>
                  ))}
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
                          if (d < 0) cellColor = "text-slate-400";
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
                                  className="w-full rounded border border-blue-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={confirmEdit}
                                  onKeyDown={handleKeyDown}
                                  className="w-full rounded border border-blue-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                                />
                              )
                            ) : (
                              <div
                                onClick={() => startEdit(player.id, col.key)}
                                className={`cursor-pointer hover:bg-blue-50 rounded px-1.5 py-1 -mx-1.5 -my-1 transition-colors ${cellColor} ${
                                  col.key === "name" ? "font-medium text-slate-800" : "text-slate-600"
                                }`}
                                title="Clic para editar"
                              >
                                {displayValue}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400">
            {filtered.length} jugador{filtered.length !== 1 ? 'es' : ''} · Haz clic en cualquier celda para editar · Tab para avanzar · Enter para confirmar · Esc para cancelar
          </div>
        </div>
      </main>
    </div>
  );
}
