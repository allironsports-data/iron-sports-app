import type { ScoutingReport } from '../types'

// ── Informes sin cobertura ───────────────────────────────────────────
//
// Los scouts escriben informes en el campo, muchas veces sin señal. Dos
// redes de seguridad, las dos en localStorage del navegador:
//   (a) BORRADOR por jugador: lo que se va escribiendo se guarda solo, y
//       al volver a abrir la ficha de ese jugador reaparece.
//   (b) COLA DE ENVÍO: si al guardar no hay red, el informe se apunta en
//       la cola y se manda cuando vuelve la señal (o al reabrir la app).
//
// Todo lo de aquí es puro (recibe/devuelve datos) para poder probarlo sin
// navegador: `storage` se puede inyectar y en los tests es un objeto.

export interface Borrador {
  title: string
  text: string
  conclusion: string
  matchId: string
  savedAt: string           // ISO
}

/** Lo que necesita db.createScoutingReport (sin id ni createdAt). */
export type DatosInforme = Omit<ScoutingReport, 'id' | 'createdAt'>

export interface ItemCola {
  id: string                // uuid
  playerId: string
  report: DatosInforme
  matchId?: string
  intentos: number
  ultimoError?: string
  createdAt: string         // ISO
}

/** Lo mínimo de localStorage que usamos, para poder mockearlo. */
export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const CLAVE_COLA = 'ais_cola_informes'
const claveBorrador = (playerId: string) => `ais_borrador_informe_${playerId}`

// Sin ventana (tests, SSR) o con localStorage bloqueado (Safari privado
// lanza al escribir) → un almacén en memoria que no rompe nada.
function memoria(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) } }
}
let respaldo: StorageLike | null = null
function storagePorDefecto(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch { /* acceso denegado */ }
  return (respaldo ??= memoria())
}

function leerJSON<T>(st: StorageLike, k: string): T | null {
  try {
    const raw = st.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
function escribirJSON(st: StorageLike, k: string, v: unknown) {
  try { st.setItem(k, JSON.stringify(v)) } catch { /* cuota llena o modo privado: se pierde en silencio */ }
}

// ── (a) Borradores ──

export function guardarBorrador(playerId: string, b: Omit<Borrador, 'savedAt'>, st: StorageLike = storagePorDefecto()): void {
  // Un borrador vacío no vale nada: se borra en vez de guardarlo
  if (!b.text.trim() && !b.title.trim()) { borrarBorrador(playerId, st); return }
  escribirJSON(st, claveBorrador(playerId), { ...b, savedAt: new Date().toISOString() } satisfies Borrador)
}

export function leerBorrador(playerId: string, st: StorageLike = storagePorDefecto()): Borrador | null {
  const b = leerJSON<Borrador>(st, claveBorrador(playerId))
  return b && typeof b.text === 'string' ? b : null
}

export function borrarBorrador(playerId: string, st: StorageLike = storagePorDefecto()): void {
  try { st.removeItem(claveBorrador(playerId)) } catch { /* nada */ }
}

// ── (b) Cola de envío ──

export function leerCola(st: StorageLike = storagePorDefecto()): ItemCola[] {
  const c = leerJSON<ItemCola[]>(st, CLAVE_COLA)
  return Array.isArray(c) ? c.filter(x => x && typeof x.id === 'string' && x.report) : []
}

function escribirCola(items: ItemCola[], st: StorageLike) {
  if (items.length === 0) { try { st.removeItem(CLAVE_COLA) } catch { /* nada */ } return }
  escribirJSON(st, CLAVE_COLA, items)
}

export function encolar(
  datos: { playerId: string; report: DatosInforme; matchId?: string },
  st: StorageLike = storagePorDefecto(),
): ItemCola {
  const item: ItemCola = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    playerId: datos.playerId,
    report: datos.report,
    matchId: datos.matchId,
    intentos: 0,
    createdAt: new Date().toISOString(),
  }
  escribirCola([...leerCola(st), item], st)
  return item
}

export function quitarDeCola(id: string, st: StorageLike = storagePorDefecto()): void {
  escribirCola(leerCola(st).filter(x => x.id !== id), st)
}

/**
 * Recorre la cola en orden y llama a `enviar` con cada item. Los que salen
 * bien se quitan; los que fallan se quedan con intentos+1 y el error
 * apuntado, para reintentar más tarde. Devuelve cuántos se enviaron y
 * cuántos siguen pendientes.
 */
export async function procesarCola(
  enviar: (item: ItemCola) => Promise<void>,
  st: StorageLike = storagePorDefecto(),
): Promise<{ enviados: number; pendientes: number }> {
  let enviados = 0
  for (const item of leerCola(st)) {
    try {
      await enviar(item)
      quitarDeCola(item.id, st)
      enviados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Se relee la cola por si `enviar` la tocó (p. ej. encolando otro)
      escribirCola(leerCola(st).map(x => x.id === item.id ? { ...x, intentos: x.intentos + 1, ultimoError: msg } : x), st)
    }
  }
  return { enviados, pendientes: leerCola(st).length }
}

/**
 * ¿Este fallo es por falta de red (y no por un dato malo o un permiso)?
 * Solo en ese caso tiene sentido encolar: lo demás fallaría igual después.
 */
export function esErrorDeRed(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = (err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: string })?.message ?? '').toLowerCase()
  if (err instanceof TypeError && msg.includes('failed to fetch')) return true
  return msg.includes('fetch') || msg.includes('network') || msg.includes('networkerror') || msg.includes('load failed')
}
