import type { MainSection } from '../components/globalExtras'

// ═════════════════════════════════════════════════════════════
// Rutas por hash. Formatos soportados (compatibles con App.tsx):
//   #/tareas · #/jugadores · #/distribucion · #/captacion · #/boulema · #/mi-dia
//   #/captacion/partidos · #/distribucion/clubes   (sub-pestaña)
//   #/equipo · #/postpartidos                        (pestañas de Mantenimiento)
//   #/jugador/ID · #/club/ID · #/miembro/ID          (fichas)
//   #contactos                                       (legacy → section 'contactos')
// ═════════════════════════════════════════════════════════════

export type RutaSection = MainSection | 'equipo' | 'postpartidos' | 'contactos'
export type EntidadTipo = 'jugador' | 'club' | 'miembro'

export type Ruta = {
  section: RutaSection
  /** Sub-pestaña dentro de la sección (p. ej. 'partidos' en captación) */
  sub?: string
  /** Ficha abierta (jugador, club o miembro) */
  entidad?: { tipo: EntidadTipo; id: string }
}

const SECTIONS: readonly RutaSection[] = ['tareas', 'jugadores', 'distribucion', 'captacion', 'boulema', 'mi-dia', 'equipo', 'postpartidos', 'contactos']
const ENTIDADES: readonly EntidadTipo[] = ['jugador', 'club', 'miembro']

/** Sección que corresponde a cada tipo de ficha (para que `section` nunca falte). */
const SECTION_DE_ENTIDAD: Record<EntidadTipo, RutaSection> = {
  jugador: 'jugadores',
  club: 'distribucion',
  miembro: 'equipo',
}

export function esSection(s: string): s is RutaSection {
  return (SECTIONS as readonly string[]).includes(s)
}

/** Parsea un hash (con o sin `#`). Devuelve null si no lo reconoce. */
export function parseHash(h: string): Ruta | null {
  let s = (h ?? '').trim()
  if (s.startsWith('#')) s = s.slice(1)
  if (s === 'contactos') return { section: 'contactos' }   // legacy sin barra
  if (!s.startsWith('/')) return null
  const partes = s.slice(1).split('/').filter(Boolean).map(p => {
    try { return decodeURIComponent(p) } catch { return p }
  })
  if (partes.length === 0) return null
  const [a, b] = partes

  if ((ENTIDADES as readonly string[]).includes(a)) {
    if (!b) return null
    const tipo = a as EntidadTipo
    return { section: SECTION_DE_ENTIDAD[tipo], entidad: { tipo, id: b } }
  }
  if (!esSection(a)) return null
  const ruta: Ruta = { section: a }
  if (b) ruta.sub = b
  return ruta
}

/** Construye el hash de una ruta (siempre empieza por `#`). */
export function buildHash(r: Ruta): string {
  if (r.entidad) return `#/${r.entidad.tipo}/${encodeURIComponent(r.entidad.id)}`
  if (r.section === 'contactos') return '#contactos'
  return r.sub ? `#/${r.section}/${encodeURIComponent(r.sub)}` : `#/${r.section}`
}

/** Ruta actual de la ventana (o null si no hay hash reconocible). */
export function rutaActual(): Ruta | null {
  if (typeof window === 'undefined') return null
  return parseHash(window.location.hash)
}
