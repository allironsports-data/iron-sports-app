import { useState, useEffect } from "react";
import type { Player, Task, PlayerActivity } from "../types";
import type { Profile } from "../contexts/AuthContext";
import { fetchActivitiesByAuthor } from "../lib/db";
import { hoyISO, esVencida, parseDia } from "../lib/fechas";
import { ListSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useToastContext } from "../hooks/useToastContext";
import {
  CheckCircle2, Clock, Activity,
  Calendar, AlertCircle, Users, ChevronDown, ChevronUp, ListTodo, AlertTriangle,
} from "lucide-react";
import { DetailHeader } from "../components/shell";
import { SectionTabs, Select, IconButton, Badge } from "../components/ui";
import { L } from "../lib/labels";

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
  date: string;         // YYYY-MM-DD or ISO — fecha REAL del hecho
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
  onSelectPlayer?: (id: string) => void;
  onUpdateTask?: (t: Task) => Promise<void> | void;
}

export function TeamMemberDetail({ profile, tasks, players, onBack, onSelectPlayer, onUpdateTask }: Props) {
  const { showToast } = useToastContext();
  const [activities, setActivities] = useState<PlayerActivity[]>([]);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState<Period>('30d');
  const [tab, setTab]               = useState<'actividad' | 'abiertas'>('actividad');
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

  function inPeriod(dateStr?: string) {
    if (!dateStr) return false;
    if (!cutoff) return true;
    return new Date(dateStr) >= cutoff;
  }

  // ── Task sets ──────────────────────────────────────────────
  // "Suyas" = responsable o watcher (mismo glosario que el tablero)
  const involves = (t: Task) =>
    t.assigneeId === profile.id || (t.watchers ?? []).includes(profile.id);
  const memberTasks = tasks.filter(involves);

  // Abiertas AHORA (no dependen del período)
  const openTasks = memberTasks.filter(t => t.status !== 'completada');
  // hoyISO: toISOString daba el día UTC (entre las 00:00 y las 02:00 «hoy» era ayer)
  const todayStr = hoyISO();
  const overdueTasks = openTasks.filter(t => esVencida(t.dueDate, todayStr));

  // Completadas EN el período — por fecha de completado real (completed_at).
  // Fallback a createdAt para tareas antiguas sin backfill.
  const completedInPeriod = memberTasks.filter(t =>
    t.status === 'completada' && inPeriod(t.completedAt ?? t.createdAt)
  );

  // ── Event stats — deduplicate group events for count ──────
  const seenForStats = new Set<string>();
  const eventsPeriod = activities.filter(a => {
    if (!inPeriod(a.date)) return false;
    if (a.groupId) {
      if (seenForStats.has(a.groupId)) return false;
      seenForStats.add(a.groupId);
    }
    return true;
  });

  // ── Timeline: solo hechos con fecha real ───────────────────
  // Eventos por su fecha; tareas completadas por completed_at.
  // Las tareas abiertas viven en su propia pestaña, no intercaladas
  // por dueDate futuro.
  const timelineItems: TimelineItem[] = [];

  const seenGroupIds = new Set<string>();
  activities
    .filter(a => inPeriod(a.date))
    .forEach(a => {
      if (a.groupId) {
        if (seenGroupIds.has(a.groupId)) return;
        seenGroupIds.add(a.groupId);
      }
      const player = players.find(p => p.id === a.playerId);
      const allLinkedIds = a.linkedPlayerIds ?? [a.playerId];
      const linkedPeers = allLinkedIds
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

  completedInPeriod.forEach(t => {
    const taskPlayer = players.find(p => p.id === t.playerId);
    timelineItems.push({
      id:          `task-${t.id}`,
      date:        (t.completedAt ?? t.createdAt).slice(0, 10),
      kind:        'task',
      title:       t.title,
      subtitle:    'Completada',
      icon:        '✅',
      statusColor: '#1D9E75',
      player:      taskPlayer,
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
  }, [loading, period]);

  function toggleMonth(m: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  // Abiertas ordenadas: vencidas → con fecha → sin fecha
  const sortedOpen = [...openTasks].sort((a, b) => {
    const aOver = a.dueDate && a.dueDate < todayStr ? 0 : 1;
    const bOver = b.dueDate && b.dueDate < todayStr ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ── Cambiar estado de una tarea desde la lista de abiertas ──
  async function setTaskStatus(t: Task, next: Task['status']) {
    if (!onUpdateTask) return;
    try {
      await Promise.resolve(onUpdateTask({ ...t, status: next }));
      showToast(
        next === 'completada' ? `«${t.title}» completada ✓`
          : next === 'en_progreso' ? `«${t.title}» en progreso`
          : `«${t.title}» vuelve a pendiente`
      );
    } catch {
      showToast('No se pudo guardar. Inténtalo de nuevo.', 'error');
    }
  }

  const playerChip = (player: Player) =>
    onSelectPlayer ? (
      <button
        type="button"
        onClick={() => onSelectPlayer(player.id)}
        className="inline-flex items-center gap-1 text-badge text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full pl-0.5 pr-2 py-0.5 transition-colors min-h-7"
      >
        <span aria-hidden="true" className="w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center text-badge font-bold text-white">
          {initials(player.name)}
        </span>
        {player.name.split(' ')[0]}
      </button>
    ) : (
      <span className="inline-flex items-center gap-1 text-badge text-slate-600 bg-slate-100 rounded-full pl-0.5 pr-2 py-0.5 min-h-7">
        <span aria-hidden="true" className="w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center text-badge font-bold text-white">
          {initials(player.name)}
        </span>
        {player.name.split(' ')[0]}
      </span>
    );

  return (
    <div className="min-h-dvh bg-slate-50">
      <DetailHeader
        onBack={onBack}
        crumbs={[{ label: L.equipo, onClick: onBack }, { label: profile.name.split(' ')[0] }]}
        title={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-badge font-bold text-white bg-primary">
              {initials(profile.name)}
            </span>
            {profile.name}
          </span>
        }
        actions={
          <Select
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
            aria-label="Período"
            className="w-auto h-9 py-1 text-secondary"
          >
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
        }
      />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

        {/* ── Stat cards ─────────────────────────────────────── */}
        {/* Eventos y Completadas dependen del período; Abiertas y
            Vencidas son el estado ACTUAL (glosario del tablero). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-badge font-semibold uppercase tracking-wide">Eventos</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{eventsPeriod.length}</p>
            <p className="text-meta text-slate-500">{PERIOD_LABELS[period].toLowerCase()}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-emerald-500 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-badge font-semibold uppercase tracking-wide">Completadas</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{completedInPeriod.length}</p>
            <p className="text-meta text-slate-500">{PERIOD_LABELS[period].toLowerCase()}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 text-blue-500 mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-badge font-semibold uppercase tracking-wide">Abiertas</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{openTasks.length}</p>
            <p className="text-meta text-slate-500">ahora mismo</p>
          </div>
          <div className={`rounded-xl border p-3.5 space-y-0.5 ${overdueTasks.length > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
            <div className={`flex items-center gap-1.5 mb-1.5 ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-badge font-semibold uppercase tracking-wide">Vencidas</span>
            </div>
            <p className={`text-2xl font-bold ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overdueTasks.length}</p>
            <p className={`text-meta ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>sin completar</p>
          </div>
        </div>

        {/* ── Tabs: Actividad | Tareas abiertas ──────────────── */}
        <SectionTabs
          variant="secondary"
          label="Secciones de la ficha"
          className="rounded-lg border border-slate-200"
          items={[
            { id: 'actividad', label: 'Actividad', icon: <Calendar /> },
            { id: 'abiertas', label: 'Tareas abiertas', icon: <ListTodo />, count: openTasks.length, alert: overdueTasks.length > 0 },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* ── Tareas abiertas ─────────────────────────────────── */}
        {tab === 'abiertas' && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-slate-400" />
              <p className="text-secondary font-semibold text-slate-700">Abiertas ahora</p>
              <span className="ml-auto text-meta text-slate-500">{sortedOpen.length} tareas</span>
            </div>
            {sortedOpen.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-10 h-10" />}
                title="Sin tareas abiertas"
                subtitle="Todo al día."
              />
            ) : (
              <div className="divide-y divide-slate-50">
                {sortedOpen.map(t => {
                  const player = players.find(p => p.id === t.playerId);
                  const isOverdue = esVencida(t.dueDate, todayStr);
                  const isWatcher = t.assigneeId !== profile.id;
                  const prioColor =
                    t.priority === 'alta' ? '#E24B4A' :
                    t.priority === 'media' ? '#EF9F27' : '#94a3b8';
                  return (
                    <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${isOverdue ? 'bg-red-50/40' : ''}`}>
                      <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: prioColor }} />
                      {/* Estado: clic alterna pendiente ↔ en progreso */}
                      <button
                        type="button"
                        onClick={() => setTaskStatus(t, t.status === 'en_progreso' ? 'pendiente' : 'en_progreso')}
                        disabled={!onUpdateTask}
                        title={onUpdateTask ? (t.status === 'en_progreso' ? 'Pasar a pendiente' : 'Pasar a en progreso') : undefined}
                        aria-label={t.status === 'en_progreso' ? 'Pasar a pendiente' : 'Pasar a en progreso'}
                        className="flex-shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 -my-2 sm:my-0 rounded-full disabled:cursor-default enabled:hover:bg-slate-100 transition-colors"
                      >
                        <span
                          className="block w-4 h-4 rounded-full border-2"
                          style={{
                            background: t.status === 'en_progreso' ? '#3b82f6' : 'transparent',
                            borderColor: t.status === 'en_progreso' ? '#3b82f6' : prioColor,
                          }}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium text-slate-800 leading-snug">{t.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {player && <span className="text-meta text-slate-500">{player.name}</span>}
                          {t.label && <Badge pill={false}>{t.label}</Badge>}
                          {isWatcher && <Badge tone="primary" pill={false}>Seguidor</Badge>}
                        </div>
                      </div>
                      <span className={`text-meta flex-shrink-0 inline-flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {t.dueDate
                          ? parseDia(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                          : 'sin fecha'}
                        {isOverdue && <AlertTriangle className="w-3 h-3" aria-label="Vencida" />}
                      </span>
                      {/* Completar directamente */}
                      {onUpdateTask && (
                        <IconButton
                          label="Marcar como completada"
                          onClick={() => setTaskStatus(t, 'completada')}
                          className="text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-full -my-2 sm:my-0"
                        >
                          <CheckCircle2 />
                        </IconButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Timeline de actividad ───────────────────────────── */}
        {tab === 'actividad' && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <p className="text-secondary font-semibold text-slate-700">Actividad</p>
            <span className="ml-auto text-meta text-slate-500">{timelineItems.length} entradas</span>
          </div>

          {loading && (
            <div className="px-4 py-3">
              <ListSkeleton rows={4} />
            </div>
          )}

          {!loading && timelineItems.length === 0 && (
            <EmptyState
              icon={<Activity className="w-10 h-10" />}
              title="Sin actividad en este período"
              subtitle="Prueba a ampliar el período seleccionado o registra eventos desde la ficha de un jugador."
            />
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
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleMonth(month)}
                      className="w-full flex items-center justify-between px-4 py-2.5 min-h-11 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 outline-none"
                    >
                      <span className="text-badge font-semibold uppercase tracking-wider text-slate-600">
                        {month}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-meta text-slate-500">{items.length} entr{items.length === 1 ? 'ada' : 'adas'}</span>
                        {isOpen
                          ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                          : <ChevronDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
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
                                      <p className="text-body font-medium text-slate-800 leading-snug">{item.title}</p>
                                      {item.subtitle && item.kind === 'event' && (
                                        <p className="text-secondary text-slate-500 mt-0.5 leading-snug line-clamp-2">{item.subtitle}</p>
                                      )}
                                    </div>
                                    <span className="text-meta text-slate-500 flex-shrink-0 mt-0.5">
                                      {new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                    </span>
                                  </div>

                                  {/* Player + linked peers */}
                                  {(item.player || (item.linkedPeers && item.linkedPeers.length > 0) || item.kind === 'task') && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      {item.player && playerChip(item.player)}
                                      {item.linkedPeers?.filter(p => p.id !== item.player?.id).map(p => (
                                        onSelectPlayer ? (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => onSelectPlayer(p.id)}
                                            className="inline-flex items-center gap-1 text-badge text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full px-2 py-0.5 min-h-7 transition-colors"
                                          >
                                            <Users className="w-3 h-3" aria-hidden="true" />
                                            {p.name.split(' ')[0]}
                                          </button>
                                        ) : (
                                          <span key={p.id} className="inline-flex items-center gap-1 text-badge text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 min-h-7">
                                            <Users className="w-3 h-3" aria-hidden="true" />
                                            {p.name.split(' ')[0]}
                                          </span>
                                        )
                                      ))}
                                      {/* Task badge */}
                                      {item.kind === 'task' && (
                                        <span
                                          className="text-badge font-medium px-1.5 py-0.5 rounded-full"
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
        )}
      </div>

    </div>
  );
}
