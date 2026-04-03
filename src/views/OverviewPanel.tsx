import { useState } from "react";
import type { Player, Task } from "../types";
import { calcAge } from "../types";
import type { Profile } from "../contexts/AuthContext";
import logoImg from '../assets/logo.jpeg';
import {
  ArrowLeft, LogOut, Users, FileText, BarChart3, AlertTriangle, Shield,
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

interface Props {
  players: Player[];
  tasks: Task[];
  profiles: Profile[];
  currentProfile: Profile;
  onBack: () => void;
  onLogout: () => void;
  onAdmin?: () => void;
}

type TabId = "plantilla" | "contratos";

export function OverviewPanel({ players, tasks, profiles, currentProfile, onBack, onLogout, onAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("plantilla");

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "plantilla", label: "Plantilla", icon: <Users className="w-4 h-4" /> },
    { id: "contratos", label: "Contratos", icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src={logoImg} alt="" className="h-8 w-auto rounded" />
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-800">Overview</h1>
            <p className="text-xs text-slate-400">Estadísticas generales</p>
          </div>
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
        {/* Tabs */}
        <div className="mx-auto max-w-5xl px-4 flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-[hsl(220,72%,26%)] text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === "plantilla" && <PlantillaTab players={players} profiles={profiles} />}
        {tab === "contratos" && <ContratosTab players={players} />}
      </main>
    </div>
  );
}

/* ========== PLANTILLA TAB ========== */
function PlantillaTab({ players, profiles }: { players: Player[]; profiles: Profile[] }) {
  const ages = players.map((p) => calcAge(p.birthDate)).filter((a) => a > 0 && a < 60);
  const avgAge = ages.length > 0 ? (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1) : "—";
  const minAge = ages.length > 0 ? Math.min(...ages) : "—";
  const maxAge = ages.length > 0 ? Math.max(...ages) : "—";

  // Nationalities
  const natMap = new Map<string, number>();
  players.forEach((p) => {
    const nat = p.nationality || "Sin especificar";
    natMap.set(nat, (natMap.get(nat) || 0) + 1);
  });
  const nationalities = [...natMap.entries()].sort((a, b) => b[1] - a[1]);

  // Positions
  const posMap = new Map<string, number>();
  players.forEach((p) => {
    (p.positions || []).forEach((pos) => {
      if (pos) posMap.set(pos, (posMap.get(pos) || 0) + 1);
    });
  });
  const positions = [...posMap.entries()].sort((a, b) => b[1] - a[1]);

  // Current clubs
  const clubMap = new Map<string, number>();
  players.forEach((p) => {
    (p.clubs || []).forEach((c) => {
      if (c.name) clubMap.set(c.name, (clubMap.get(c.name) || 0) + 1);
    });
  });
  const clubs = [...clubMap.entries()].sort((a, b) => b[1] - a[1]);

  // Managers
  const managerMap = new Map<string, number>();
  players.forEach((p) => {
    (p.managedBy || []).forEach((mid) => {
      managerMap.set(mid, (managerMap.get(mid) || 0) + 1);
    });
  });
  const managers = [...managerMap.entries()]
    .map(([id, count]) => ({ profile: profiles.find((pr) => pr.id === id), count }))
    .filter((m) => m.profile)
    .sort((a, b) => b.count - a.count);

  // Age distribution bands
  const ageBands = [
    { label: "16-20", min: 16, max: 20 },
    { label: "21-25", min: 21, max: 25 },
    { label: "26-30", min: 26, max: 30 },
    { label: "31-35", min: 31, max: 35 },
    { label: "36+", min: 36, max: 99 },
  ];
  const ageDistribution = ageBands.map((band) => ({
    ...band,
    count: ages.filter((a) => a >= band.min && a <= band.max).length,
  }));
  const maxBandCount = Math.max(...ageDistribution.map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Key numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total jugadores" value={players.length.toString()} color="blue" />
        <StatBox label="Edad media" value={avgAge.toString()} color="slate" />
        <StatBox label="Más joven" value={minAge.toString()} color="green" />
        <StatBox label="Mayor" value={maxAge.toString()} color="amber" />
      </div>

      {/* Age distribution bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Distribución por edad</h3>
        <div className="flex items-end gap-2 h-28">
          {ageDistribution.map((band) => (
            <div key={band.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-semibold text-slate-700">{band.count}</span>
              <div
                className="w-full rounded-t bg-blue-400 transition-all"
                style={{ height: `${(band.count / maxBandCount) * 100}%`, minHeight: band.count > 0 ? '4px' : '0' }}
              />
              <span className="text-[10px] text-slate-400">{band.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nationalities */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Nacionalidades</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {nationalities.map(([nat, count]) => (
              <div key={nat} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-700">{nat}</span>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Positions */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Posiciones</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {positions.map(([pos, count]) => (
              <div key={pos} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-700">{pos}</span>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{count}</span>
              </div>
            ))}
            {positions.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
          </div>
        </div>

        {/* Clubs */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Clubes actuales</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {clubs.map(([club, count]) => (
              <div key={club} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-700">{club}</span>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{count}</span>
              </div>
            ))}
            {clubs.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
          </div>
        </div>

        {/* Managers */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Encargados</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {managers.map((m) => (
              <div key={m.profile!.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-[9px] font-bold flex items-center justify-center text-slate-600">
                    {m.profile!.avatar}
                  </span>
                  <span className="text-xs text-slate-700">{m.profile!.name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{m.count} jugadores</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== CONTRATOS TAB ========== */
function ContratosTab({ players }: { players: Player[] }) {
  const now = Date.now();
  const DAY = 1000 * 60 * 60 * 24;

  // Representation contract stats
  const reprExpiring6m = players.filter((p) => {
    if (!p.representationContract.end) return false;
    const days = (new Date(p.representationContract.end).getTime() - now) / DAY;
    return days > 0 && days < 183;
  });
  const reprExpiring12m = players.filter((p) => {
    if (!p.representationContract.end) return false;
    const days = (new Date(p.representationContract.end).getTime() - now) / DAY;
    return days >= 183 && days < 365;
  });
  const reprExpired = players.filter((p) => {
    if (!p.representationContract.end) return false;
    return new Date(p.representationContract.end).getTime() < now;
  });

  // Club contract stats
  const clubExpiring6m = players.filter((p) => {
    if (!p.clubContract.endDate) return false;
    const days = (new Date(p.clubContract.endDate).getTime() - now) / DAY;
    return days > 0 && days < 183;
  });
  const clubExpiring12m = players.filter((p) => {
    if (!p.clubContract.endDate) return false;
    const days = (new Date(p.clubContract.endDate).getTime() - now) / DAY;
    return days >= 183 && days < 365;
  });
  const clubExpired = players.filter((p) => {
    if (!p.clubContract.endDate) return false;
    return new Date(p.clubContract.endDate).getTime() < now;
  });

  // All players sorted by representation contract end (soonest first)
  const sortedByRepr = [...players]
    .filter((p) => p.representationContract.end)
    .sort((a, b) => new Date(a.representationContract.end).getTime() - new Date(b.representationContract.end).getTime());

  const sortedByClub = [...players]
    .filter((p) => p.clubContract.endDate)
    .sort((a, b) => new Date(a.clubContract.endDate).getTime() - new Date(b.clubContract.endDate).getTime());

  const daysLeft = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - now) / DAY);
  const colorForDays = (d: number) =>
    d < 0 ? 'text-slate-400' : d < 183 ? 'text-red-600' : d < 365 ? 'text-amber-600' : 'text-emerald-600';
  const bgForDays = (d: number) =>
    d < 0 ? 'bg-slate-50' : d < 183 ? 'bg-red-50 border-red-100' : d < 365 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100';

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBox label="Repr. < 6 meses" value={reprExpiring6m.length.toString()} color="red" />
        <StatBox label="Repr. 6-12 meses" value={reprExpiring12m.length.toString()} color="amber" />
        <StatBox label="Repr. expirados" value={reprExpired.length.toString()} color="slate" />
        <StatBox label="Club < 6 meses" value={clubExpiring6m.length.toString()} color="red" />
        <StatBox label="Club 6-12 meses" value={clubExpiring12m.length.toString()} color="amber" />
        <StatBox label="Club expirados" value={clubExpired.length.toString()} color="slate" />
      </div>

      {/* Representation contracts table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Contratos de representación</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-left px-4 py-2 font-medium">Jugador</th>
                <th className="text-left px-4 py-2 font-medium">Inicio</th>
                <th className="text-left px-4 py-2 font-medium">Fin</th>
                <th className="text-left px-4 py-2 font-medium">Días restantes</th>
              </tr>
            </thead>
            <tbody>
              {sortedByRepr.map((p) => {
                const d = daysLeft(p.representationContract.end);
                return (
                  <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {p.representationContract.start ? new Date(p.representationContract.start).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(p.representationContract.end).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${bgForDays(d)} ${colorForDays(d)}`}>
                        {d < 0 ? 'Expirado' : `${d} días`}
                        {d > 0 && d < 183 && <AlertTriangle className="w-3 h-3" />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Club contracts table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Contratos de club</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-left px-4 py-2 font-medium">Jugador</th>
                <th className="text-left px-4 py-2 font-medium">Club</th>
                <th className="text-left px-4 py-2 font-medium">Fin</th>
                <th className="text-left px-4 py-2 font-medium">Días restantes</th>
                <th className="text-left px-4 py-2 font-medium">Cláusula</th>
              </tr>
            </thead>
            <tbody>
              {sortedByClub.map((p) => {
                const d = daysLeft(p.clubContract.endDate);
                const clubName = p.clubs.length > 0 ? p.clubs.find((c) => c.type !== "propietario")?.name || p.clubs[0].name : "—";
                return (
                  <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-2 text-slate-500">{clubName}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(p.clubContract.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${bgForDays(d)} ${colorForDays(d)}`}>
                        {d < 0 ? 'Expirado' : `${d} días`}
                        {d > 0 && d < 183 && <AlertTriangle className="w-3 h-3" />}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{p.clubContract.releaseClause || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ========== HELPERS ========== */
function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-600",
    purple: "bg-violet-50 text-violet-600",
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.slate}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-medium opacity-70 uppercase tracking-wide">{label}</p>
    </div>
  );
}
