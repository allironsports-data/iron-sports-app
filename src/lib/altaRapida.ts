// ── Alta rápida de tareas en una línea ───────────────────────────────
//
//   «Llamar al padre de Iker @nb #negociación viernes !»
//
//   @persona    → responsable (iniciales o principio del nombre)
//   #categoría  → tipo de tarea (principio del nombre, sin acentos)
//   fecha       → hoy · mañana · pasado mañana · lunes…domingo · 15/10 · 15/10/2026
//   !           → prioridad alta
//
// Lo que se reconoce se quita del título. Lógica pura: sin React.

import { TASK_LABELS, type TaskLabel } from '../types'
import { sumarDias } from './fechas'
import { norm } from './texto'

export interface AltaRapida {
  titulo: string
  assigneeId?: string
  label?: TaskLabel
  dueDate?: string
  prioridadAlta: boolean
  /** @ o # que no se han podido resolver: se quedan en el título y se avisa */
  sinResolver: string[]
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

function fechaDe(palabra: string, siguiente: string | undefined, hoy: string): { fecha: string; usadas: number } | null {
  const p = norm(palabra)
  if (p === 'hoy') return { fecha: hoy, usadas: 1 }
  if (p === 'manana') return { fecha: sumarDias(hoy, 1), usadas: 1 }
  if (p === 'pasado' && norm(siguiente) === 'manana') return { fecha: sumarDias(hoy, 2), usadas: 2 }
  const dow = DIAS.indexOf(p)
  if (dow >= 0) {
    const [y, m, d] = hoy.split('-').map(Number)
    const hoyDow = (new Date(y, m - 1, d, 12).getDay() + 6) % 7
    // El próximo: si hoy es viernes, «viernes» es el de la semana que viene
    return { fecha: sumarDias(hoy, ((dow - hoyDow + 7) % 7) || 7), usadas: 1 }
  }
  const f = palabra.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/)
  if (f) {
    const dia = Number(f[1]), mes = Number(f[2])
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    const iso = (anio: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (f[3]) return { fecha: iso(f[3].length === 2 ? 2000 + Number(f[3]) : Number(f[3])), usadas: 1 }
    // Sin año: la próxima vez que caiga esa fecha
    const anio = Number(hoy.slice(0, 4))
    return { fecha: iso(anio) < hoy ? iso(anio + 1) : iso(anio), usadas: 1 }
  }
  return null
}

function perfilDe(texto: string, profiles: { id: string; name: string; avatar: string }[]): string | undefined {
  const t = norm(texto)
  if (!t) return undefined
  const porIniciales = profiles.find(p => norm(p.avatar) === t)
  if (porIniciales) return porIniciales.id
  const porNombre = profiles.filter(p => norm(p.name).split(' ').some(parte => parte.startsWith(t)))
  return porNombre.length === 1 ? porNombre[0].id : undefined
}

function categoriaDe(texto: string): TaskLabel | undefined {
  const t = norm(texto)
  if (!t) return undefined
  return TASK_LABELS.find(l => norm(l) === t) ?? TASK_LABELS.find(l => norm(l).startsWith(t))
}

export function parsearAltaRapida(
  texto: string,
  ctx: { hoy: string; profiles: { id: string; name: string; avatar: string }[] },
): AltaRapida {
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  const r: AltaRapida = { titulo: '', prioridadAlta: false, sinResolver: [] }
  const resto: string[] = []
  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i]
    if (w === '!' || w === '!!') { r.prioridadAlta = true; continue }
    if (w.startsWith('@') && w.length > 1) {
      const id = perfilDe(w.slice(1), ctx.profiles)
      if (id && !r.assigneeId) { r.assigneeId = id; continue }
      if (!id) r.sinResolver.push(w)
    } else if (w.startsWith('#') && w.length > 1) {
      const l = categoriaDe(w.slice(1))
      if (l && !r.label) { r.label = l; continue }
      if (!l) r.sinResolver.push(w)
    } else if (!r.dueDate) {
      const f = fechaDe(w, palabras[i + 1], ctx.hoy)
      if (f) { r.dueDate = f.fecha; i += f.usadas - 1; continue }
    }
    resto.push(w)
  }
  // «…el viernes» / «…para mañana»: la preposición que se queda colgando al final sobra
  while (resto.length > 1 && /^(el|para|a|al|antes|del?)$/i.test(resto[resto.length - 1])) resto.pop()
  let titulo = resto.join(' ')
  if (titulo.endsWith('!')) { r.prioridadAlta = true; titulo = titulo.replace(/\s*!+$/, '') }
  r.titulo = titulo
  return r
}
