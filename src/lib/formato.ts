// Formateo de fechas y valores para listados (historial, admin…)

/** «hace 3 min», «ayer», «12/08/2026» */
export function fechaRelativa(iso: string, ahora = Date.now()): string {
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return '—'
  const s = Math.round((ahora - t) / 1000)
  if (s < 45) return 'ahora mismo'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Valor jsonb a texto corto para la lista */
export function valorCorto(v: unknown, max = 60): string {
  if (v === null || v === undefined || v === '') return '∅'
  let s: string
  if (typeof v === 'string') s = v
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v)
  else if (Array.isArray(v)) s = v.length ? v.map(x => valorCorto(x, 20)).join(', ') : '[]'
  else s = JSON.stringify(v)
  s = s.replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
