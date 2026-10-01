// ── Guardar una tarjeta de Firmar sin pisar a los demás ──────────────
//
// La tarjeta se guarda entera, con todo su historial dentro. Si dos
// personas apuntan algo casi a la vez, la que guarda segunda escribía SU
// copia —sin la nota de la primera— y esa nota desaparecía sin aviso.
//
// Aquí está la reconciliación: se mira QUÉ ha cambiado el usuario (entre
// la tarjeta que tenía y la que quiere guardar) y solo eso se aplica sobre
// la versión que hay ahora mismo en la base. Lo que no ha tocado se queda
// como esté en el servidor. Lógica pura.

import type { FirmasEntry, FirmasComment } from '../types'

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** El historial del servidor con los cambios del usuario encima: lo añadido, lo editado y lo borrado */
function reconciliarApuntes(antes: FirmasComment[], despues: FirmasComment[], servidor: FirmasComment[]): FirmasComment[] {
  const idsAntes = new Set(antes.map(c => c.id))
  const porIdAntes = new Map(antes.map(c => [c.id, c]))
  const porIdDespues = new Map(despues.map(c => [c.id, c]))
  const borrados = new Set(antes.filter(c => !porIdDespues.has(c.id)).map(c => c.id))
  const editados = new Map(despues.filter(c => idsAntes.has(c.id) && !igual(c, porIdAntes.get(c.id))).map(c => [c.id, c]))
  const nuevos = despues.filter(c => !idsAntes.has(c.id))

  const resultado = servidor.filter(c => !borrados.has(c.id)).map(c => editados.get(c.id) ?? c)
  const presentes = new Set(resultado.map(c => c.id))
  for (const c of nuevos) if (!presentes.has(c.id)) resultado.push(c)
  return resultado
}

/**
 * @param antes     la tarjeta tal como la tenía el usuario al empezar
 * @param despues   la tarjeta con su cambio aplicado
 * @param servidor  la tarjeta tal como está AHORA en la base
 */
export function reconciliarFirmas(antes: FirmasEntry, despues: FirmasEntry, servidor: FirmasEntry): FirmasEntry {
  const resultado = { ...servidor } as Record<string, unknown>
  const a = antes as unknown as Record<string, unknown>
  const d = despues as unknown as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (k === 'comments') continue
    if (!igual(a[k], d[k])) resultado[k] = d[k]
  }
  resultado.comments = reconciliarApuntes(antes.comments, despues.comments, servidor.comments)
  resultado.updatedAt = despues.updatedAt
  return resultado as unknown as FirmasEntry
}
