// Tipos y utilidades del modal de conflicto (fuera del .tsx por fast refresh)

export interface ConflictInfo {
  /** nombre de la tabla (players, clubs, club_negotiations) */
  tabla: string
  /** lo que yo intentaba guardar */
  mio: Record<string, unknown>
  /** lo que hay ahora en la base de datos (lo guardó otro) */
  suyo: Record<string, unknown>
  /** vuelve a guardar lo mío sobre lo suyo (con el updated_at nuevo) */
  reintentar: () => Promise<void>
}

// Claves que no interesa enseñar: cambian siempre o no son «contenido».
const OCULTAS = new Set(['id', 'updatedAt', 'createdAt', 'performance'])

/** Claves de primer nivel cuyo valor difiere (comparación por JSON, suficiente aquí) */
export function camposDistintos(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const k of claves) {
    if (OCULTAS.has(k)) continue
    const va = a[k] === undefined ? null : a[k]
    const vb = b[k] === undefined ? null : b[k]
    if (JSON.stringify(va) !== JSON.stringify(vb)) out.push(k)
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'))
}
