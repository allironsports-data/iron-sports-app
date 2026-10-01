import { ListTodo, Phone, Smartphone, Handshake, ClipboardList, Trophy, CalendarDays } from 'lucide-react'
import type { AgendaTipo } from '../../lib/agendaItems'

// Icono, color y nombre de cada tipo de item: la fila de «Mi día» y los
// chips del calendario tienen que hablar el mismo idioma.
export const AGENDA_TIPO_META: Record<AgendaTipo, { Icon: typeof ListTodo; cls: string; chip: string; label: string }> = {
  tarea:       { Icon: ListTodo,      cls: 'text-slate-400',   chip: 'bg-slate-50 border-slate-200 text-slate-700',       label: 'Tarea' },
  llamada:     { Icon: Phone,         cls: 'text-amber-500',   chip: 'bg-amber-50 border-amber-200 text-amber-800',       label: 'Llamada' },
  telefono:    { Icon: Smartphone,    cls: 'text-amber-500',   chip: 'bg-amber-50 border-amber-200 text-amber-800',       label: 'Conseguir teléfono' },
  reunion:     { Icon: Handshake,     cls: 'text-violet-500',  chip: 'bg-violet-50 border-violet-200 text-violet-800',    label: 'Reunión' },
  postpartido: { Icon: ClipboardList, cls: 'text-blue-500',    chip: 'bg-blue-50 border-blue-200 text-blue-800',          label: 'Postpartido' },
  partido:     { Icon: Trophy,        cls: 'text-emerald-500', chip: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Partido' },
  evento:      { Icon: CalendarDays,  cls: 'text-slate-400',   chip: 'bg-sky-50 border-sky-200 text-sky-800',             label: 'Evento' },
}

/** Filas del calendario «por tipo» y chips de filtro */
export const GRUPOS_TIPO: { id: string; label: string; tipos: AgendaTipo[] }[] = [
  { id: 'partidos',     label: 'Partidos',             tipos: ['partido'] },
  { id: 'llamadas',     label: 'Llamadas y reuniones', tipos: ['llamada', 'telefono', 'reunion'] },
  { id: 'postpartidos', label: 'Postpartidos',         tipos: ['postpartido'] },
  { id: 'tareas',       label: 'Tareas',               tipos: ['tarea'] },
  { id: 'eventos',      label: 'Eventos',              tipos: ['evento'] },
]
