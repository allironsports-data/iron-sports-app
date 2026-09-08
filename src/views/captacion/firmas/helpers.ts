import type { FirmasEntry, FirmasStatus } from '../../../types'

// ── CAPTACIÓN · FIRMAR (pipeline de firmas, ex-Trello) ───────
// Segunda parte de Captación: conseguir que el jugador firme.
// Jugadores por zona geográfica y estatus de contacto, con encargados,
// historial de contactos tipados, próxima acción, semáforo de
// desatención y avisos cruzados con el resto de la app.

// Título de cada tipo de aviso: 20 líneas iguales se resumen en una sola
export const AVISO_TITULO: Record<string, string> = {
  'sin-accion':    'Calientes sin próxima acción',
  'sin-encargado': 'Sin encargado asignado',
  'descartado':    'Descartados en scouting pero vivos en el pipeline',
  'duplicado':     'Repetidos en el pipeline',
  'recalentar':    'Fríos que acumulan informes «Llamar»',
  'cambio-club':   'Han cambiado de club',
  'contrato':      'Contrato de club acabando',
  'cumple':        'Cumpleaños próximos',
  'visto':         'Vistos hace poco en un partido',
  'juega':         'Su equipo juega pronto',
  'informe':       'Informes nuevos',
  'boulema':       'Con petición en Boulema',
  'firmado':       'Firmados sin ficha en Mantenimiento',
}

export const FIRMAS_STATUSES: FirmasStatus[] = ['llamar', 'caliente', 'templado', 'frio', 'decidir', 'firmado']

export const FIRMAS_CONFIG: Record<FirmasStatus, { label: string; dot: string; bg: string; text: string; border: string; col: string }> = {
  llamar:   { label: 'Llamar',   dot: 'bg-amber-500',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  col: 'border-t-amber-400' },
  caliente: { label: 'Caliente', dot: 'bg-red-500',    bg: 'bg-red-100',    text: 'text-red-600',    border: 'border-red-200',    col: 'border-t-red-400' },
  templado: { label: 'Templado', dot: 'bg-yellow-500', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', col: 'border-t-yellow-400' },
  frio:     { label: 'Frío',     dot: 'bg-sky-500',    bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200',    col: 'border-t-sky-400' },
  decidir:  { label: 'Decidir',  dot: 'bg-violet-500', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', col: 'border-t-violet-400' },
  firmado:  { label: 'Firmado',  dot: 'bg-green-500',  bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  col: 'border-t-green-500' },
}

// Cadencia máxima de actualización por estatus (días). Superarla = desatendido.
// (Pedido por Pablo: caliente cada 10 días, templado cada 50, frío cada 90.)
const FIRMAS_AGING_DAYS: Partial<Record<FirmasStatus, number>> = { caliente: 10, templado: 50, frio: 90 }

// Tipos de apunte del historial (bajo esfuerzo: un toque para elegir tipo)
export const FIRMAS_KIND_META: Record<string, { icon: string; label: string }> = {
  nota:     { icon: '📝', label: 'Nota' },
  llamada:  { icon: '📞', label: 'Llamada' },
  whatsapp: { icon: '💬', label: 'WhatsApp' },
  reunion:  { icon: '🤝', label: 'Reunión' },
  entorno:  { icon: '👪', label: 'Entorno' },
}

// Tipos de PRÓXIMA ACCIÓN: los del historial + "Conseguir teléfono" (📵).
// Pedido por Pablo: muchos jugadores en "Llamar" están realmente en fase de
// conseguir el número; el 📵 en la tarjeta lo distingue de un vistazo.
export const FIRMAS_ACTION_KIND_META: Record<string, { icon: string; label: string }> = {
  ...FIRMAS_KIND_META,
  telefono: { icon: '📵', label: 'Conseguir teléfono' },
}

// ¿Está pendiente de conseguir teléfono? Detecta tanto el tipo explícito
// como el texto de acciones ya existentes ("Conseguir teléfono", "buscar
// número", "tlf", "móvil"…), así funciona retroactivamente sin tocar datos.
export const necesitaTelefono = (e: FirmasEntry): boolean =>
  e.status !== 'firmado' && (
    e.nextActionKind === 'telefono' ||
    /tel[eé]fono|n[uú]mero|\btlf\b|m[oó]vil/i.test(e.nextAction ?? '')
  )


// Última vez que una entrada se "tocó" (cualquier edición, comentario o cambio de estatus)
function firmasLastTouch(e: FirmasEntry): string {
  const candidates = [e.updatedAt, e.statusUpdatedAt, e.createdAt, ...e.comments.map(c => c.date)].filter(Boolean) as string[]
  return candidates.sort().pop() ?? e.createdAt
}

function daysSinceISO(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

/** Semáforo de desatención: null si el estatus no tiene cadencia */
export function firmasAging(e: FirmasEntry): { days: number; limit: number; overdue: boolean; warn: boolean } | null {
  const limit = FIRMAS_AGING_DAYS[e.status]
  if (!limit) return null
  const days = daysSinceISO(firmasLastTouch(e))
  return { days, limit, overdue: days > limit, warn: days > limit * 0.7 && days <= limit }
}

// Chip de estatus con desplegable para cambiarlo inline
