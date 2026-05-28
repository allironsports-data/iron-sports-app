import { useState, useEffect } from "react";
import type { Player, Task, PlayerActivity } from "../types";
import type { Profile } from "../contexts/AuthContext";
import { fetchActivitiesByAuthor } from "../lib/db";
import {
  ArrowLeft, CheckCircle2, Clock, Activity,
  Calendar, AlertCircle, Users, ChevronDown, ChevronUp,
} from "lucide-react";

const PRIMARY = "hsl(220,72%,26%)";

const ACTIVITY_ICONS: Record<string, string> = {
  'Comunicación con club': '🏟️',
  'Reunión con jugador':   '🤝',
  'Llamada':               '📞',
  'Email':                 '📧',
  'Visita presencial':     '🏢',
  'Partido':               '⚽',
  'Transferencia':         '💼',
  'Nota general':          '📝',
};
function activityIcon(type: string) { return ACTIVITY_ICONS[type] ?? '📌'; }

type Period = '7d' | '30d' | '90d' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  '7d':  'Últimos 7 días',
  '30d': 'Último mes',
  '90d': 'Últimos 3 meses',
  'all': 'Todo',
};

interface TimelineItem {
  id: string;
  date: string;         // YYYY-MM-DD or ISO
  kind: 'event' | 'task';
  title: string;
  subtitle?: string;
  icon: string;
  statusColor?: string;
  player?: Player;
  linkedPeers?: Player[];
}

interface Props {
  profile: Profile;
  allProfiles: Profile[];
  tasks: Task[];
  players: Player[];
  onBack: () => void;
}

export function TeamMemberDetail({ profile, allProfiles, tasks, players, onBack }: Props) {
  const [activities, setActivities] = useState<PlayerActivity[]>([]);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState<Period>('30d');
  const [showPeriod, setShowPeriod] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetchActivitiesByAuthor(profile.id)
      .then(setActivities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile.id]);

  // ── Period cutoff ──────────────────────────────────────────
  const cutoff = (() => {
    if (period === 'all') return null;
    const d = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    d.setDate(d.getDate() - days);
    return d;
  })();

  function inPeriod(dateStr: string) {
    if (!cutoff) return true;
    return new Date(dateStr) >= cutoff;
  }

  // ── Task stats ─────────────────────────────────────────────
  const myTasks = tasks.filter(t => t.assigneeId === profile.id);
  const myTasksPeriod = myTasks.filter(t => inPeriod(t.createdAt));
  const completedPeriod = myTasksPeriod.filter(t => t.status === 'completada');
  const pendingPeriod   = myTasksPeriod.filter(t => t.status === 'pendiente');
  const inProgressPeriod = myTasksPeriod.filter(t => t.status === 'en_progreso');
  const overduePeriod   = myTasksPeriod.filter(t =>
    t.status !== 'completada' && t.dueDate && new Date(t.dueDate) < new Date()
  );

  // ── Event stats ────────────────────────────────────────────
  const eventsPeriod = activities.filter(a => inPeriod(a.date));

  // ── Build mixed timeline ───────────────────────────────────
  const timelineItems: TimelineItem[] = [];

  // Events
  activities
    .filter(a => inPeriod(a.date))
    .forEach(a => {
      const player = players.find(p => p.id === a.playerId);
      const linkedPeers = (a.linkedPlayerIds ?? [])
        .filter(id => id !== a.playerId)
        .map(id => players.find(p => p.id === id))
        .filter(Boolean) as Player[];
      timelineItems.push({
        id:          `evt-${a.id}`,
        date:        a.date,
        kind:        'event',
        title:       a.type,
        subtitle:    a.notes,
        icon:        activityIcon(a.type),
        player,
        linkedPeers: linkedPeers.length > 0 ? linkedPeers : undefined,
      });
    });

  // Tasks
  myTasks
    .filter(t => inPeriod(t.createdAt))
    .forEach(t => {
      const taskPlayer = players.find(p => p.id === t.playerId);
      const statusColor =
        t.status === 'completada'  ? '#1D9E75' :
        t.status === 'en_progreso' ? '#378ADD' : '#94a3b8';
      const icon =
        t.status === 'completada'  ? '✅' :
        t.status === 'en_progreso' ? '🔄' : '📋';
      timelineItems.push({
        id:           `task-${t.id}`,
        date:         t.dueDate ?? t.createdAt,
        kind:         'task',
        title:        t.title,
        subtitle:     t.status === 'completada' ? 'Completada' : t.status === 'en_progreso' ? 'En progreso' : 'Pendiente',
        icon,
        statusColor,
        player:       taskPlayer,
      });
    });

  // Sort newest first
  timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group by month
  const grouped: Record<string, TimelineItem[]> = {};
  timelineItems.forEach(item => {
    const key = new Date(item.date).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  const months = Object.keys(grouped);

  // Auto-expand first two months on load
  useEffect(() => {
    if (months.length > 0) {
      setExpandedMonths(new Set(months.slice(0, 2)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function toggleMonth(m: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: PRIMARY }}
          >
            {initials(profile.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-tight">{profile.name}</p>
            {profile.is_admin && (
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Admin</p>
            )}
          </div>
          {/* Period selector */}
          <div className="relative">
            <button
              onClick={() => setShowPeriod(v => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
            >
              {PERIOD_LABELS[period]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPeriod && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPeriod(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px]">
                  {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => { setPeriod(k); setShowPeriod(false); }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        period === k ? 'font-semibold text-blue-700 bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

        {/* ── Stat cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Eventos</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{eventsPeriod.length}</p>
            <p className="text-[10px] text-slate-400">registrados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-emerald-500 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Tareas</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{completedPeriod.length}</p>
            <p className="text-[10px] text-slate-400">completadas</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-blue-500 mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">En curso</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{inProgressPeriod.length + pendingPeriod.length}</p>
            <p className="text-[10px] text-slate-400">abiertas</p>
          </div>
          <div className={`rounded-xl border p-3.5 space-y-0.5 ${overduePeriod.length > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
            <div className={`flex items-center gap-1.5 mb-1.5 ${overduePeriod.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Vencidas</span>
            </div>
            <p className={`text-2xl font-bold ${overduePeriod.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overduePeriod.length}</p>
            <p className={`text-[10px] ${overduePeriod.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>sin completar</p>
          </div>
        </div>

        {/* ── Timeline ────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">Actividad</p>
            <span className="ml-auto text-[10px] text-slate-400">{timelineItems.length} entradas</span>
          </div>

          {loading && (
            <div className="py-12 text-center text-xs text-slate-400">Cargando…</div>
          )}

          {!loading && timelineItems.length === 0 && (
            <div className="py-12 text-center">
              <Activity className="w-8 h-8 mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">Sin actividad en este período</p>
            </div>
          )}

          {!loading && months.length > 0 && (
            <div className="divide-y divide-slate-50">
              {months.map(month => {
                const isOpen = expandedMonths.has(month);
                const items  = grouped[month];
                return (
                  <div key={month}>
                    {/* Month header — clickable to collapse */}
                    <button
                      onClick={() => toggleMonth(month)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {month}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{items.length} entr{items.length === 1 ? 'ada' : 'adas'}</span>
                        {isOpen
                          ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
                          : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                        }
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-3">
                        <div className="relative">
                          <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100" />
                          <div className="space-y-1.5">
                            {items.map(item => (
                              <div key={item.id} className="flex gap-3">
                                {/* Icon */}
                                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 bg-white border-2 border-slate-100 mt-1.5 text-xs">
                                  {item.icon}
                                </div>

                                {/* Card */}
                                <div className={`flex-1 rounded-lg px-3 py-2 mb-0.5 border transition-colors
                                  ${item.kind === 'task' ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-slate-700 leading-snug">{item.title}</p>
                                      {item.subtitle && (
                                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{item.subtitle}</p>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                                      {new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                    </span>
                                  </div>

                                  {/* Player + linked peers */}
                                  {(item.player || (item.linkedPeers && item.linkedPeers.length > 0)) && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      {item.player && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">
                                          <span className="w-3 h-3 rounded-full bg-slate-400 flex items-center justify-center text-[7px] font-bold text-white">
                                            {initials(item.player.name)}
                                          </span>
                                          {item.player.name.split(' ')[0]}
                                        </span>
                                      )}
                                      {item.linkedPeers?.map(p => (
                                        <span key={p.id} className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-1.5 py-0.5">
                                          <Users className="w-2.5 h-2.5" />
                                          {p.name.split(' ')[0]}
                                        </span>
                                      ))}
                                      {/* Task kind badge */}
                                      {item.kind === 'task' && (
                                        <span
                                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                          style={{ background: `${item.statusColor}18`, color: item.statusColor }}
                                        >
                                          {item.subtitle}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
