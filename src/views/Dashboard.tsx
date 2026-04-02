import { useState } from "react";
import type { Player, Task } from "../types";
import { calcAge, clubsLabel } from "../types";
import type { Profile } from "../contexts/AuthContext";
import {
  LogOut,
  Users,
  ClipboardList,
  AlertTriangle,
  ChevronRight,
  Plus,
  Search,
  X,
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
}: Props) {
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  const pendingTasks = tasks.filter((t) => t.status !== "completada");
  const urgentTasks = tasks.filter(
    (t) => t.priority === "alta" && t.status !== "completada"
  );
  const myTasks = pendingTasks.filter((t) => t.assigneeId === currentProfile.id);

  const filtered = players.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.positions[0].toLowerCase().includes(search.toLowerCase()) ||
      p.clubs.some((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-black"
              style={{ background: PRIMARY }}
            >
              AI
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-slate-900 uppercase">
                All Iron Sports
              </span>
              <span className="hidden sm:inline text-slate-300 mx-2">·</span>
              <span className="hidden sm:inline text-xs text-slate-400 uppercase tracking-widest">
                Gestión de jugadores
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700">{currentProfile.name}</p>
            </div>
            <div
              className="w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
              style={{ background: PRIMARY }}
            >
              {currentProfile.avatar}
            </div>
            {currentProfile.is_admin && onAdmin && (
              <button
                onClick={onAdmin}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                title="Panel de administración"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Users className="w-4 h-4" />} label="Jugadores" value={players.length} color="blue" />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Tareas pendientes" value={pendingTasks.length} color="amber" />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Urgentes" value={urgentTasks.length} color="red" />
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Mis tareas" value={myTasks.length} color="green" />
        </div>

        {/* My tasks */}
        {myTasks.length > 0 && (
          <div className="mb-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Mis tareas pendientes</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {myTasks.slice(0, 5).map((task) => {
                const player = players.find((p) => p.id === task.playerId);
                const isOverdue = new Date(task.dueDate) < new Date();
                return (
                  <button
                    key={task.id}
                    onClick={() => onSelectPlayer(task.playerId)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        task.priority === "alta" ? "bg-red-500" : task.priority === "media" ? "bg-amber-400" : "bg-slate-300"
                      }`}
                    />
                    <span className="flex-1 text-sm text-slate-700 truncate">{task.title}</span>
                    <span className="text-xs text-slate-400 hidden sm:block">{player?.name}</span>
                    <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                      {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Players list */}
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar jugador, club, posición..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2"
            />
          </div>
          <button
            onClick={() => setShowAddPlayer(true)}
            className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 transition-colors"
            style={{ background: PRIMARY }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo jugador</span>
          </button>
        </div>

        <div className="grid gap-2.5">
          {filtered.map((player) => {
            const playerTasks = tasks.filter(
              (t) => t.playerId === player.id && t.status !== "completada"
            );
            const urgent = playerTasks.filter((t) => t.priority === "alta");
            const age = calcAge(player.birthDate);
            // contract warning: rep contract expires in < 12 months
            const repDaysLeft = Math.ceil(
              (new Date(player.representationContract.end).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24)
            );
            const managers = player.managedBy
              .map((id) => profiles.find((m) => m.id === id))
              .filter(Boolean) as Profile[];

            return (
              <button
                key={player.id}
                onClick={() => onSelectPlayer(player.id)}
                className="w-full bg-white border border-slate-200 rounded-lg p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-base font-bold text-slate-400 flex-shrink-0">
                    {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">{player.name}</h3>
                      {repDaysLeft < 365 && repDaysLeft > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                          Repr. &lt;1 año
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {player.positions[0]}
                      {player.positions[1] && ` / ${player.positions[1]}`}
                      {" · "}
                      {clubsLabel(player.clubs)}
                      {" · "}
                      {age} años · {player.nationality}
                    </p>
                    {/* Managers + partner */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {managers.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"
                        >
                          {m.avatar}
                        </span>
                      ))}
                      {player.partner && (
                        <span className="text-[10px] text-slate-400">
                          · Partner: {player.partner}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Task count */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {playerTasks.length > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700">{playerTasks.length}</p>
                        <p className="text-[10px] text-slate-400">
                          {urgent.length > 0 ? `${urgent.length} urgente${urgent.length > 1 ? "s" : ""}` : "tareas"}
                        </p>
                      </div>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            No se encontraron jugadores
          </div>
        )}
      </main>

      {showAddPlayer && (
        <AddPlayerModal
          profiles={profiles}
          onClose={() => setShowAddPlayer(false)}
          onAdd={(p) => { onAddPlayer(p); setShowAddPlayer(false); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number;
  color: "blue" | "amber" | "red" | "green";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded flex items-center justify-center ${colors[color]}`}>{icon}</div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function AddPlayerModal({
  profiles,
  onClose,
  onAdd,
}: {
  profiles: Profile[];
  onClose: () => void;
  onAdd: (player: Player) => void;
}) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pos1, setPos1] = useState("");
  const [pos2, setPos2] = useState("");
  const [nationality, setNationality] = useState("");
  const [club1, setClub1] = useState("");
  const [club2, setClub2] = useState("");
  const [isLoan, setIsLoan] = useState(false);
  const [partner, setPartner] = useState("");
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
      id: "p" + Date.now(),
      name,
      birthDate,
      positions: [pos1, pos2].filter(Boolean),
      nationality,
      photo: "",
      clubs,
      partner: partner || undefined,
      managedBy: [managed1, managed2].filter(Boolean),
      representationContract: { start: reprStart, end: reprEnd },
      clubContract: {
        endDate: clubEnd,
        optionalYears: optYears ? parseInt(optYears) : undefined,
      },
      contractHistory: [],
      performance: [],
      info: { family: "", languages: [], personality: "", interests: "", location: "", notes: "" },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nuevo jugador</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <F label="Nombre completo" value={name} onChange={setName} required />
          <div className="grid grid-cols-2 gap-3">
            <F label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} type="date" required />
            <F label="Nacionalidad" value={nationality} onChange={setNationality} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Posición principal" value={pos1} onChange={setPos1} required />
            <F label="Posición secundaria (opcional)" value={pos2} onChange={setPos2} />
          </div>

          <div className="pt-1 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Club(s)</p>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="isLoan" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} className="rounded" />
              <label htmlFor="isLoan" className="text-xs text-slate-600">Jugador cedido</label>
            </div>
            {isLoan ? (
              <div className="grid grid-cols-2 gap-3">
                <F label="Club propietario (origen)" value={club1} onChange={setClub1} />
                <F label="Club donde juega (destino)" value={club2} onChange={setClub2} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <F label="Club (principal)" value={club1} onChange={setClub1} />
                <F label="Segundo equipo (opcional)" value={club2} onChange={setClub2} />
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
            <div className="grid grid-cols-3 gap-3">
              <Sel label="Encargado 1" value={managed1} onChange={setManaged1} options={profiles} />
              <Sel label="Encargado 2" value={managed2} onChange={setManaged2} options={profiles} />
              <F label="Partner" value={partner} onChange={setPartner} />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!name || !pos1 || !birthDate}
              className="w-full rounded-md text-white text-sm font-medium py-2 disabled:opacity-40 transition-colors"
              style={{ background: PRIMARY }}
            >
              Añadir jugador
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
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
      />
    </div>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Profile[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
      >
        <option value="">—</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}
