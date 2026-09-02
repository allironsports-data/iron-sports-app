// ── Fechas de día (AAAA-MM-DD) en hora LOCAL ─────────────────────────
//
// Regla de la app: los "días" (vencimientos, fechas de partido, nacimientos)
// se guardan como texto AAAA-MM-DD y se comparan como texto. Cuando hace
// falta un Date, se construye a MEDIODÍA local para que ningún cambio de
// zona horaria u horario de verano lo mueva de día.
//
// Dos trampas que ya nos han mordido varias veces:
//   · new Date('2026-09-02')  → medianoche UTC = 02:00 en España. Comparado
//     con "ahora" hace que una tarea que vence HOY salga «vencida» casi todo
//     el día, y al oeste de UTC se pinta el día anterior.
//   · new Date().toISOString().slice(0, 10) → el día UTC: entre las 00:00 y
//     las 02:00 españolas «hoy» todavía es ayer.

/** AAAA-MM-DD del Date dado, en hora local. */
export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** AAAA-MM-DD de hoy, en hora local. */
export function hoyISO(): string {
  return fechaLocal(new Date())
}

/**
 * Convierte un AAAA-MM-DD (o un ISO completo) en Date. Si solo trae el día,
 * lo ancla a las 12:00 locales para que no cambie de día en ninguna zona.
 */
export function parseDia(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s)
}

/** Suma (o resta) días a un AAAA-MM-DD sin pasar por UTC. */
export function sumarDias(iso: string, dias: number): string {
  const d = parseDia(iso)
  d.setDate(d.getDate() + dias)
  return fechaLocal(d)
}

/** Lunes de la semana del Date dado (00:00 local). `offsetSemanas` negativo = semanas atrás. */
export function lunesDe(d: Date, offsetSemanas = 0): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const dow = (r.getDay() + 6) % 7 // 0 = lunes
  r.setDate(r.getDate() - dow + offsetSemanas * 7)
  return r
}

/** true si `dueDate` (AAAA-MM-DD) es anterior a hoy. Vencer HOY no es estar vencida. */
export function esVencida(dueDate: string | undefined | null, hoy = hoyISO()): boolean {
  return !!dueDate && dueDate.slice(0, 10) < hoy
}

/** Días naturales entre hoy y `iso` (positivo = futuro). */
export function diasHasta(iso: string, desde = new Date()): number {
  const a = parseDia(fechaLocal(desde)).getTime()
  const b = parseDia(iso.slice(0, 10)).getTime()
  return Math.round((b - a) / 86_400_000)
}
