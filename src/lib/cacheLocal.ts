// ── Copia local de la última carga (IndexedDB) ───────────────────────
//
// PARA QUÉ: al abrir o recargar la app, en vez de esperar a que lleguen
// todas las tablas del servidor, se pinta al instante lo que había la
// última vez y, en cuanto llega lo nuevo, se sustituye. Los datos de
// verdad siguen siendo los del servidor: esto solo quita la espera.
//
// REGLAS:
//  · Cada copia va a nombre de un usuario. Al arrancar se borra lo que sea
//    de otro, y al cerrar sesión se borra todo: en un ordenador compartido
//    no queda nada del anterior.
//  · Si IndexedDB no está (modo privado, almacenamiento lleno…), todo
//    devuelve «nada» y la app carga como siempre. Nunca lanza.

const BASE = 'ais-cache'
const ALMACEN = 'tablas'

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(BASE, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(ALMACEN) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

let conexion: Promise<IDBDatabase | null> | null = null
const bd = () => (conexion ??= abrir())

const clave = (userId: string, nombre: string) => `${userId}:${nombre}`

/** Lo guardado para ese usuario y tabla, o undefined si no hay nada */
export async function leerCopia<T>(userId: string, nombre: string): Promise<T | undefined> {
  const db = await bd()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const req = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(clave(userId, nombre))
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => resolve(undefined)
    } catch { resolve(undefined) }
  })
}

/** Guarda la última lectura buena. No espera ni avisa si falla. */
export function guardarCopia(userId: string, nombre: string, valor: unknown): void {
  void bd().then((db) => {
    if (!db) return
    try { db.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).put(valor, clave(userId, nombre)) } catch { /* sin copia */ }
  })
}

/** Borra las copias que no sean de este usuario (o todas, sin argumento: cierre de sesión) */
export async function limpiarCopias(conservarUserId?: string): Promise<void> {
  const db = await bd()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(ALMACEN, 'readwrite')
      const almacen = tx.objectStore(ALMACEN)
      if (!conservarUserId) almacen.clear()
      else {
        const req = almacen.openKeyCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) return
          if (!String(cursor.key).startsWith(conservarUserId + ':')) almacen.delete(cursor.key)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch { resolve() }
  })
}
