import type { MainSection } from '../components/globalExtras'

// ── Rutas de la app (hash) ───────────────────────────────────────────
// La app no usa un router: dónde estás es estado de App.tsx, y el hash de
// la URL es su espejo para que «atrás» del navegador y los enlaces
// compartidos funcionen. Formatos:
//
//   #/tareas                 sección
//   #/captacion/partidos     sección + pestaña de segundo nivel
//   #/jugador/<id>           ficha de jugador de Mantenimiento
//   #/club/<id>              ficha de club (pantalla partida en Distribución)
//   #/miembro/<id>           ficha de miembro del equipo
//   #contactos               agenda (admin)
//
// Las pestañas van en el hash a propósito: cada cambio de pestaña es una
// entrada del historial, así que «atrás» te devuelve a la pestaña anterior
// en vez de sacarte de la sección. Los paneles que se abren encima (ficha
// de scouting, partido, tarjeta de Firmar…) no van en el hash: usan
// hooks/useAtras, que mete su propia entrada.

export const SECCIONES: readonly MainSection[] = ['tareas', 'jugadores', 'distribucion', 'captacion', 'pipeline', 'boulema', 'mi-dia']

export const NOMBRE_SECCION: Record<MainSection, string> = {
  tareas: 'Mantenimiento',
  jugadores: 'Jugadores',
  distribucion: 'Distribución',
  captacion: 'Captación',
  pipeline: 'Pipeline',
  boulema: 'Boulema',
  'mi-dia': 'Mi día',
}

export type Ruta =
  | { tipo: 'seccion'; seccion: MainSection; tab?: string }
  | { tipo: 'jugador'; id: string }
  | { tipo: 'club'; id: string }
  | { tipo: 'miembro'; id: string }
  | { tipo: 'contactos' }

const esSeccion = (s: string): s is MainSection => (SECCIONES as readonly string[]).includes(s)

/** Solo letras, números, guiones y guiones bajos: lo que puede ser un nombre de pestaña */
const TAB_OK = /^[a-z0-9_-]+$/i

export function construirHash(r: Ruta): string {
  switch (r.tipo) {
    case 'contactos': return '#contactos'
    case 'jugador':   return `#/jugador/${r.id}`
    case 'club':      return `#/club/${r.id}`
    case 'miembro':   return `#/miembro/${r.id}`
    case 'seccion':   return r.tab && TAB_OK.test(r.tab) ? `#/${r.seccion}/${r.tab}` : `#/${r.seccion}`
  }
}

/** null si el hash no es ninguna ruta conocida (vacío, roto, o de otra versión) */
export function parsearHash(hash: string): Ruta | null {
  const h = (hash ?? '').trim()
  if (!h || h === '#' || h === '#/') return null
  if (h === '#contactos') return { tipo: 'contactos' }

  const m = h.match(/^#\/(jugador|club|miembro)\/([^/]+)$/)
  if (m) {
    const id = decodeURIComponent(m[2])
    if (m[1] === 'jugador') return { tipo: 'jugador', id }
    if (m[1] === 'club')    return { tipo: 'club', id }
    return { tipo: 'miembro', id }
  }

  const s = h.match(/^#\/([a-z-]+)(?:\/([a-z0-9_-]+))?\/?$/i)
  if (!s || !esSeccion(s[1])) return null
  return s[2] ? { tipo: 'seccion', seccion: s[1], tab: s[2] } : { tipo: 'seccion', seccion: s[1] }
}
