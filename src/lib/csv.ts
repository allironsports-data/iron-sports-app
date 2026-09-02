// ── Exportar a CSV ───────────────────────────────────────────────────
// Un solo sitio para todas las tablas de la app. Se abre bien en Excel y en
// Numbers: separador «;» (el que espera Excel en español) y BOM para que no
// se coman los acentos.

function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Inyección de fórmulas: Excel ejecuta celdas que empiezan por = + - @ (o
  // tab/CR). Un nombre tecleado en la app como «=HYPERLINK(...)» acabaría
  // ejecutándose en la hoja de quien exporta. Se antepone una comilla simple
  // (Excel la trata como «texto literal»). Los números (typeof number) no se
  // tocan: un -3 sigue siendo un número.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // Comillas dobles duplicadas y entrecomillado si hay separador, salto o comilla
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Una fila ya montada. Suelta para poder probarla sin navegador. */
export function filaCsv(valores: unknown[]): string {
  return valores.map(celda).join(';')
}

/**
 * Descarga una tabla como CSV.
 * @param nombre  nombre del archivo, sin extensión («jugadores-captacion»)
 * @param cabeceras  títulos de las columnas
 * @param filas  una lista por fila, en el mismo orden que las cabeceras
 */
export function exportarCsv(nombre: string, cabeceras: string[], filas: unknown[][]): void {
  const texto = [cabeceras, ...filas].map(filaCsv).join('\r\n')
  const hoy = new Date()
  const sello = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}-${sello}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
