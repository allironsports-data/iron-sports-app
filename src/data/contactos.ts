// ── Agenda de contactos ──────────────────────────────────────────────
//
// Antes esto era un archivo de 26.000 líneas con los 3.065 contactos
// escritos dentro. Al estar «importado», acababa COMPILADO dentro de la
// app: 400 KB que se descargaba todo el mundo al entrar, entrase o no en
// Contactos.
//
// Ahora los contactos viven en public/contactos.json y se descargan solo
// al abrir la pestaña. La lista es la misma; lo único que cambia es
// cuándo se pide.
//
// Para actualizarla: sustituye public/contactos.json (es un array JSON con
// los mismos campos de abajo). No hay que tocar código ni volver a
// desplegar nada más.

export interface Contact {
  id: string
  name?: string
  team?: string
  region: string
  role?: string
  phone1?: string
  phone2?: string
  tier?: string
  _noContact?: boolean
  _noClub?: boolean
}

// Se guarda la promesa, no el resultado: si dos sitios piden los contactos
// a la vez, se descargan una sola vez.
let enCurso: Promise<Contact[]> | null = null

export function cargarContactos(): Promise<Contact[]> {
  if (!enCurso) {
    enCurso = fetch(`${import.meta.env.BASE_URL}contactos.json`)
      .then(r => {
        if (!r.ok) throw new Error(`contactos.json: ${r.status}`)
        return r.json() as Promise<Contact[]>
      })
      .catch(err => {
        // Que un fallo de red no deje la promesa cacheada para siempre:
        // al volver a entrar en la pestaña se reintenta.
        enCurso = null
        throw err
      })
  }
  return enCurso
}

// ── Capa pura para Supabase (sin red: se puede testear) ──────────────
//
// Los contactos viven ahora en la tabla `public.contactos` (ver
// migration_contactos_supabase.sql). Aquí solo hay conversiones y la
// lógica de fusión; las llamadas a la base están en src/lib/dbContactos.ts.

/** Lo que sale del formulario. Un campo vaciado es `null` (= borrar),
 *  no `undefined` (= no tocar). */
export type ContactDraft = { [K in keyof Omit<Contact, 'id'>]?: Contact[K] | null } & { region: string }

/** Fila de `public.contactos` tal cual la devuelve Supabase. */
export interface ContactoRow {
  id: string
  name: string | null
  team: string | null
  region: string
  role: string | null
  phone1: string | null
  phone2: string | null
  tier: string | null
  no_contact: boolean
  no_club: boolean
  origen: 'base' | 'manual'
  deleted: boolean
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

/** Lo que se sube (sin los campos que rellena la base). */
export type ContactoRowInput = Omit<ContactoRow, 'created_by' | 'updated_by' | 'created_at' | 'updated_at'>

/** Quita los null (para contactos extra, que se guardan enteros). */
export function sinNulos(d: ContactDraft): Omit<Contact, 'id'> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (v !== null && v !== undefined) out[k] = v
  return out as unknown as Omit<Contact, 'id'>
}

/** Aplica una corrección sobre un contacto; null = campo borrado. */
export function aplicarOverride(c: Contact, o: ContactDraft): Contact {
  const merged: Record<string, unknown> = { ...c }
  for (const [k, v] of Object.entries(o)) {
    if (v === null) delete merged[k]
    else if (v !== undefined) merged[k] = v
  }
  return merged as unknown as Contact
}

/** Contact → fila. Los campos ausentes van como null (columna vacía). */
export function contactToRow(c: Contact, origen: 'base' | 'manual', deleted = false): ContactoRowInput {
  return {
    id: c.id,
    name: c.name ?? null,
    team: c.team ?? null,
    region: c.region || 'Sin clasificar',
    role: c.role ?? null,
    phone1: c.phone1 ?? null,
    phone2: c.phone2 ?? null,
    tier: c.tier ?? null,
    no_contact: !!c._noContact,
    no_club: !!c._noClub,
    origen,
    deleted,
  }
}

/** Fila → Contact. Los null se omiten para conservar los `?:` del tipo. */
export function rowToContact(r: ContactoRow): Contact {
  const c: Contact = { id: r.id, region: r.region }
  if (r.name) c.name = r.name
  if (r.team) c.team = r.team
  if (r.role) c.role = r.role
  if (r.phone1) c.phone1 = r.phone1
  if (r.phone2) c.phone2 = r.phone2
  if (r.tier) c.tier = r.tier
  if (r.no_contact) c._noContact = true
  if (r.no_club) c._noClub = true
  return c
}

/**
 * Fusión para la importación inicial: los 3.065 del JSON + lo que este
 * navegador tenía en localStorage (correcciones, altas y borrados).
 *
 *  - base: se aplica su override (si lo hay); `deleted` = estaba borrado.
 *  - extra: origen 'manual'. Si además está en `deleted`, se sube borrado.
 *  - Un id de `deleted` que no exista en ninguna lista se ignora.
 *  - Si un extra repite el id de un base, gana el extra (última escritura).
 */
export function fusionarParaImportar(
  base: Contact[],
  overrides: Record<string, ContactDraft>,
  extra: Contact[],
  deleted: Iterable<string>,
): ContactoRowInput[] {
  const borrados = new Set(deleted)
  const porId = new Map<string, ContactoRowInput>()
  for (const c of base) {
    const o = overrides[c.id]
    const merged = o ? aplicarOverride(c, o) : c
    porId.set(c.id, contactToRow(merged, 'base', borrados.has(c.id)))
  }
  for (const c of extra) {
    porId.set(c.id, contactToRow(c, 'manual', borrados.has(c.id)))
  }
  return [...porId.values()]
}
