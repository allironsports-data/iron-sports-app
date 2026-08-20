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
