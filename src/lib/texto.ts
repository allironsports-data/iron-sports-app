// ── Normalizar texto para comparar ───────────────────────────────────
//
// Esto estaba escrito a mano CATORCE veces repartidas por la app, y tres de
// ellas ya se habían separado del resto. Aquí hay una sola versión de cada
// forma, y todo el mundo la importa.
//
// Nota que descubrí al unificarlas: tres de esas copias llevaban una «ñ» en
// su expresión regular «para conservarla»… y no servía de nada. NFD parte la
// ñ en «n» + virgulilla, y la virgulilla se borra en el paso anterior: para
// cuando llega ese filtro, la ñ ya es una n. Peña y Pena siempre han sido lo
// mismo para la app. Es lo correcto para buscar (quien escribe «Pena» quiere
// encontrar a «Peña»), pero conviene saberlo.

/** Quita los acentos y deja el resto igual: «Peña Ñ» → «Pena N». */
export function sinAcentos(s?: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * La de uso general: sin acentos, en minúsculas y sin espacios de sobra.
 * Para buscadores y para comparar dos textos escritos por personas
 * distintas. «  Castellón Juv A » → «castellon juv a».
 */
export function norm(s?: string): string {
  return sinAcentos(s).toLowerCase().trim()
}

/**
 * Para claves: además quita todo lo que no sea letra o número (puntos,
 * guiones, comillas…) y deja un solo espacio entre palabras.
 * «C.D. Castellón - Juv. A» → «c d castellon juv a».
 */
export function normClave(s?: string): string {
  return norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
