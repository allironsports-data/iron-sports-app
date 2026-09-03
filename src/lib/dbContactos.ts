// ── Contactos en Supabase ────────────────────────────────────────────
//
// Tablas: public.contactos (agenda compartida) y public.contactos_favoritos
// (una fila por usuario y contacto). Ver migration_contactos_supabase.sql.
// Toda función comprueba `error` y lanza: la vista decide qué enseñar.

import { supabase } from './supabase'
import { leerTodo } from './db'
import {
  contactToRow, fusionarParaImportar,
  type Contact, type ContactDraft, type ContactoRow, type ContactoRowInput,
} from '../data/contactos'

const TABLA = 'contactos'
const TABLA_FAV = 'contactos_favoritos'
const LOTE = 500

/** 42P01 = «relation does not exist»: la tabla aún no está migrada. */
export function esTablaInexistente(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01'
}

// ⚠ Supabase corta en 1000 filas SIN avisar: paginado con leerTodo.
// Se traen también las borradas (deleted = true): la vista las filtra y así
// un refetch tras un borrado no "resucita" nada por una carrera.
export async function fetchContactos(): Promise<ContactoRow[]> {
  return leerTodo<ContactoRow>(TABLA, (desde, hasta) =>
    supabase.from(TABLA).select('*').order('id').range(desde, hasta))
}

/** Alta o edición. Un campo a null en la fila borra la columna. */
export async function upsertContacto(fila: ContactoRowInput): Promise<ContactoRow> {
  const { data, error } = await supabase
    .from(TABLA).upsert(fila, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data as ContactoRow
}

/** Borrado lógico: nadie hace DELETE desde la app (solo admin por RLS). */
export async function marcarBorrado(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from(TABLA).update({ deleted: true }).in('id', ids)
  if (error) throw error
}

export async function fetchFavoritos(userId: string): Promise<Set<string>> {
  const filas = await leerTodo<{ contacto_id: string }>(TABLA_FAV, (desde, hasta) =>
    supabase.from(TABLA_FAV).select('contacto_id').eq('user_id', userId)
      .order('contacto_id').range(desde, hasta))
  return new Set(filas.map(f => f.contacto_id))
}

/** Devuelve el nuevo estado (true = ahora es favorito). */
export async function toggleFavorito(userId: string, contactoId: string, esFavorito: boolean): Promise<boolean> {
  if (esFavorito) {
    const { error } = await supabase.from(TABLA_FAV)
      .delete().eq('user_id', userId).eq('contacto_id', contactoId)
    if (error) throw error
    return false
  }
  const { error } = await supabase.from(TABLA_FAV)
    .upsert({ user_id: userId, contacto_id: contactoId }, { onConflict: 'user_id,contacto_id' })
  if (error) throw error
  return true
}

/** Sube de golpe los favoritos que este navegador tenía en localStorage. */
export async function guardarFavoritos(userId: string, ids: Iterable<string>): Promise<void> {
  const filas = [...new Set(ids)].map(contacto_id => ({ user_id: userId, contacto_id }))
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await supabase.from(TABLA_FAV)
      .upsert(filas.slice(i, i + LOTE), { onConflict: 'user_id,contacto_id' })
    if (error) throw error
  }
}

/**
 * Importación inicial: los del JSON + overrides + extra + deleted de ESTE
 * navegador, en lotes de 500 con upsert (onConflict id). Reejecutable.
 * Devuelve cuántas filas se han subido.
 */
export async function importarBase(
  contactos: Contact[],
  overrides: Record<string, ContactDraft>,
  extra: Contact[],
  deleted: Iterable<string>,
  onProgreso?: (subidas: number, total: number) => void,
): Promise<number> {
  const filas = fusionarParaImportar(contactos, overrides, extra, deleted)
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE)
    const { error } = await supabase.from(TABLA).upsert(lote, { onConflict: 'id' })
    if (error) throw error
    onProgreso?.(Math.min(i + LOTE, filas.length), filas.length)
  }
  return filas.length
}

/** Atajo para la vista: Contact → fila lista para upsert. */
export { contactToRow }
