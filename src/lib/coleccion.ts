// Utilidades puras sobre listas de filas (sin dependencias de Supabase, para
// poder testearlas sin cliente).

/**
 * Quita filas repetidas por `id`. La fila se queda en la posición de su
 * PRIMERA aparición (respeta el orden de la consulta) pero con los datos de
 * la ÚLTIMA copia leída. Motivo: la paginación por offset puede devolver la
 * misma fila en dos páginas si alguien inserta/borra entre medias; si eso
 * pasa, la copia de la página posterior es la más reciente.
 * Filas sin `id` se dejan tal cual (no sabemos compararlas).
 */
export function dedupePorId<T extends { id?: unknown }>(filas: T[]): T[] {
  if (filas.length < 2) return filas
  const pos = new Map<unknown, number>()
  const out: T[] = []
  let duplicadas = 0
  for (const f of filas) {
    const id = f?.id
    if (id === undefined || id === null) { out.push(f); continue }
    const i = pos.get(id)
    if (i === undefined) {
      pos.set(id, out.length)
      out.push(f)
    } else {
      out[i] = f
      duplicadas++
    }
  }
  // Sin duplicados devolvemos el mismo array: evita copias inútiles.
  return duplicadas === 0 ? filas : out
}
