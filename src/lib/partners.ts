import { norm } from './texto'

// ── Partners ─────────────────────────────────────────────────────────
// `partner` es un campo de texto libre en la ficha del jugador, así que en
// la base hay «Toldra», «Toldrá» y «toldra » conviviendo. Para filtrar se
// agrupan por su forma normalizada (misma clave) y se enseña la grafía más
// usada de cada grupo, que suele ser la bien escrita.
//
// La lista sale de los datos, no de una constante: hoy son dos, pero si
// mañana entra un tercero aparece solo sin tocar código.

export const PARTNER_TODOS = 'all'
/** Jugadores sin partner asignado */
export const PARTNER_NINGUNO = '__sin__'

export interface OpcionPartner {
  /** Clave del filtro: la forma normalizada, o PARTNER_NINGUNO */
  key: string
  /** Cómo se enseña: la grafía más repetida del grupo */
  label: string
  count: number
}

/** ¿Este jugador cuenta para esta opción del filtro? */
export function jugadorEsDePartner(partner: string | undefined, key: string): boolean {
  if (key === PARTNER_TODOS) return true
  const k = norm(partner)
  if (key === PARTNER_NINGUNO) return k === ''
  return k === key
}

/**
 * Opciones del filtro a partir de los jugadores visibles. Los partners van
 * primero por número de jugadores (y a igualdad, alfabético), y «Sin
 * partner» siempre al final, porque no es un partner: es lo que falta.
 */
export function opcionesPartner(players: { partner?: string }[]): OpcionPartner[] {
  const grupos = new Map<string, { count: number; grafias: Map<string, number> }>()
  let sin = 0

  for (const p of players) {
    const k = norm(p.partner)
    if (k === '') { sin++; continue }
    let g = grupos.get(k)
    if (!g) { g = { count: 0, grafias: new Map() }; grupos.set(k, g) }
    g.count++
    const grafia = (p.partner ?? '').trim()
    g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1)
  }

  const out: OpcionPartner[] = [...grupos.entries()]
    .map(([key, g]) => {
      // la grafía más repetida; a igualdad, la primera por orden alfabético
      // (determinista: si no, el rótulo bailaba entre recargas)
      const label = [...g.grafias.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0][0]
      return { key, label, count: g.count }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))

  if (sin > 0) out.push({ key: PARTNER_NINGUNO, label: 'Sin partner', count: sin })
  return out
}
