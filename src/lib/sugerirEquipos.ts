import { norm } from './texto'
import { normEquipo } from './zonas'

// ── Sugerencias para el campo «Equipo» ───────────────────────────────
//
// El nombre del equipo se escribía libre en cada sitio (ficha de jugador,
// partidos, Boulema, Ofrecidos…) y así nacían «Villarreal Cad Roda»,
// «Villarreal Roda Cad» y «Villarrea cad roda» como tres equipos distintos.
// Ahora el campo es una lista cerrada: se escribe, se elige uno de los que
// ya existen y, si de verdad es nuevo, se da de alta con categoría y zona.
// Lógica pura (sin React) para poder probarla.

export interface OpcionEquipo {
  nombre: string
  /** normEquipo(nombre): la clave con la que se cruza todo */
  clave: string
  categoria?: string
  zona?: string
}

/** ¿Alguna opción es exactamente este equipo (misma grafía o equivalente)? */
export function equipoExacto(opciones: OpcionEquipo[], texto: string): OpcionEquipo | undefined {
  const k = normEquipo(texto)
  if (!k) return undefined
  return opciones.find(o => o.clave === k)
}

/**
 * Las que encajan con lo escrito: cada palabra del texto es el principio de
 * alguna palabra del nombre («vill juv» → «Villarreal Juv A», «Villarreal
 * Juv B»…; «juv a» no trae «Villarreal Juv B» aunque lleve una «a» dentro).
 * Primero las que empiezan igual, luego el resto; dentro de cada grupo, por nombre.
 */
export function sugerirEquipos(opciones: OpcionEquipo[], texto: string, max = 12): OpcionEquipo[] {
  const q = norm(texto).trim()
  if (!q) return opciones.slice(0, max)
  const palabras = q.split(/\s+/).filter(Boolean)
  const puntuadas: { o: OpcionEquipo; peso: number }[] = []
  for (const o of opciones) {
    const n = norm(o.nombre)
    const tokens = n.split(/[^a-z0-9]+/).filter(Boolean)
    if (!palabras.every(p => tokens.some(t => t.startsWith(p)))) continue
    puntuadas.push({ o, peso: n.startsWith(q) ? 0 : tokens[0]?.startsWith(palabras[0]) ? 1 : 2 })
  }
  return puntuadas
    .sort((a, b) => a.peso - b.peso || a.o.nombre.localeCompare(b.o.nombre, 'es'))
    .slice(0, max)
    .map(p => p.o)
}
