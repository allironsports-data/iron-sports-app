import type {
  Ofrecimiento, OfrecimientoNivel, OfrecimientoPaso, OfrecimientoOrigen, OfrecimientoOperacion,
  TipoInformePedido, PasoVeredicto, ScoutingInfoTipo,
} from '../types'
import { sumarDias } from './fechas'

// ── Ofrecidos: lógica pura ───────────────────────────────────────────
// Todo lo que decide «en qué punto está» un ofrecimiento vive aquí, sin
// React ni Supabase, para poder probarlo. La vista solo pinta.

export const ORIGEN_LABEL: Record<OfrecimientoOrigen, string> = {
  boulema: 'Boulema', agente: 'Agente', intermediario: 'Intermediario',
  club: 'Club', familia: 'Familia', otro: 'Otro',
}
export const ORIGENES: OfrecimientoOrigen[] = ['boulema', 'agente', 'intermediario', 'club', 'familia', 'otro']

export const OPERACION_LABEL: Record<OfrecimientoOperacion, string> = {
  libre: 'Libre', cesion: 'Cesión', traspaso: 'Traspaso', representacion: 'Representación',
}
export const OPERACIONES: OfrecimientoOperacion[] = ['libre', 'cesion', 'traspaso', 'representacion']

export const TIPO_INFORME_LABEL: Record<TipoInformePedido, string> = {
  tecnico: 'Técnico', entorno: 'Entorno', mercado: 'Mercado', personalidad: 'Personalidad',
}
export const TIPOS_INFORME: TipoInformePedido[] = ['tecnico', 'entorno', 'mercado', 'personalidad']

/** A qué tipo de scouting_infos corresponde cada informe que no es técnico */
export const INFO_TIPO_DE: Record<Exclude<TipoInformePedido, 'tecnico'>, ScoutingInfoTipo> = {
  entorno: 'personalidad', personalidad: 'personalidad', mercado: 'mercado',
}

export const VEREDICTO_LABEL: Record<PasoVeredicto, string> = {
  pendiente: 'Pendiente', ok: 'OK', no: 'No', mas: 'Más vídeo',
}

/** Cómo se ve en la lista: lo que de verdad está pasando, no el campo estado a secas */
export type EstadoVisible =
  | { clave: 'nuevo'; label: 'Nuevo' }
  | { clave: 'informes'; label: string; nivel: number }
  | { clave: 'decidir'; label: 'Decidir' }
  | { clave: 'aceptado'; label: 'Aceptado' }
  | { clave: 'descartado'; label: 'Descartado' }
  | { clave: 'caducado'; label: 'Caducado' }

export const estaCerrado = (o: Pick<Ofrecimiento, 'estado'>): boolean =>
  o.estado === 'aceptado' || o.estado === 'descartado'

/** true si tiene fecha límite, sigue abierto y la fecha ya pasó (hoy no cuenta) */
export function estaCaducado(o: Pick<Ofrecimiento, 'estado' | 'fechaLimite'>, hoy: string): boolean {
  return !estaCerrado(o) && !!o.fechaLimite && o.fechaLimite < hoy
}

/** Días que quedan hasta la fecha límite (negativo si ya pasó); null si no hay */
export function diasHastaLimite(o: Pick<Ofrecimiento, 'fechaLimite'>, hoy: string): number | null {
  if (!o.fechaLimite) return null
  const a = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))
  const b = Date.UTC(+o.fechaLimite.slice(0, 4), +o.fechaLimite.slice(5, 7) - 1, +o.fechaLimite.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

export function nivelActivo(o: Pick<Ofrecimiento, 'niveles'>): OfrecimientoNivel | undefined {
  return o.niveles.length ? o.niveles[o.niveles.length - 1] : undefined
}

export const nivelCompleto = (n: OfrecimientoNivel): boolean =>
  n.pasos.length > 0 && n.pasos.every(p => p.veredicto !== 'pendiente')

export function estadoVisible(o: Ofrecimiento, hoy: string): EstadoVisible {
  if (o.estado === 'aceptado') return { clave: 'aceptado', label: 'Aceptado' }
  if (o.estado === 'descartado') return { clave: 'descartado', label: 'Descartado' }
  if (estaCaducado(o, hoy)) return { clave: 'caducado', label: 'Caducado' }
  if (o.estado === 'decidir') return { clave: 'decidir', label: 'Decidir' }
  const n = nivelActivo(o)
  if (!n) return { clave: 'nuevo', label: 'Nuevo' }
  return { clave: 'informes', label: `Nivel ${n.n}`, nivel: n.n }
}

/** Pasos sin contestar del nivel activo (los de niveles anteriores también cuentan: siguen vivos) */
export function pasosPendientes(o: Pick<Ofrecimiento, 'niveles' | 'estado'>): { nivel: OfrecimientoNivel; paso: OfrecimientoPaso }[] {
  if (estaCerrado(o)) return []
  const out: { nivel: OfrecimientoNivel; paso: OfrecimientoPaso }[] = []
  for (const nivel of o.niveles) for (const paso of nivel.pasos) if (paso.veredicto === 'pendiente') out.push({ nivel, paso })
  return out
}

/** Lo que le toca escribir a cada persona: una línea por paso pendiente (Mi día, Tareas) */
export interface InformePedido {
  ofrecimientoId: string
  jugador: string
  equipo?: string
  avatar: string
  tipo: TipoInformePedido
  nivel: number
  pedidoPor: string
  /** Para cuándo se quiere: la fecha límite del ofrecimiento o siete días desde que se abrió */
  fecha?: string
}
export function informesPedidos(ofrecimientos: Ofrecimiento[]): InformePedido[] {
  const out: InformePedido[] = []
  for (const o of ofrecimientos) {
    for (const { nivel, paso } of pasosPendientes(o)) {
      const abierto = o.createdAt?.slice(0, 10)
      const fecha = o.fechaLimite ?? (abierto && /^\d{4}-\d{2}-\d{2}$/.test(abierto) ? sumarDias(abierto, 7) : undefined)
      out.push({ ofrecimientoId: o.id, jugador: o.playerName, equipo: o.team, avatar: paso.avatar, tipo: paso.tipo, nivel: nivel.n, pedidoPor: nivel.pedidoPor, fecha })
    }
  }
  return out
}

/** Veredicto que se propone desde la conclusión de un informe técnico */
export function veredictoDesdeConclusion(conclusion?: string): PasoVeredicto {
  const c = (conclusion ?? '').trim().toLowerCase()
  if (!c) return 'ok'
  if (c.startsWith('descartar')) return 'no'
  if (c.startsWith('más video') || c.startsWith('mas video') || c.startsWith('más vídeo') || c.startsWith('mas vídeo')) return 'mas'
  return 'ok'   // Firmar, Seguir, Llamar, Visto…
}

/** Un nivel nuevo al final de la cadena. `pedir` = parejas persona/tipo (una persona puede ir con varios tipos) */
export function conNivelNuevo(
  o: Ofrecimiento,
  pedidoPor: string,
  pedir: { avatar: string; tipo: TipoInformePedido }[],
  mensaje?: string,
  ahora: string = new Date().toISOString(),
): Ofrecimiento {
  const vistos = new Set<string>()
  const pasos: OfrecimientoPaso[] = []
  for (const p of pedir) {
    const k = `${p.avatar}|${p.tipo}`
    if (vistos.has(k)) continue
    vistos.add(k)
    pasos.push({ avatar: p.avatar, tipo: p.tipo, veredicto: 'pendiente' })
  }
  const n = (nivelActivo(o)?.n ?? 0) + 1
  const nivel: OfrecimientoNivel = { n, pedidoPor, pedidoAt: ahora, mensaje: mensaje?.trim() || undefined, pasos }
  return { ...o, estado: o.estado === 'decidir' ? 'abierto' : o.estado, niveles: [...o.niveles, nivel] }
}

/** Respuesta de una persona a un paso: veredicto + informe enlazado */
export function conRespuesta(
  o: Ofrecimiento,
  nivelN: number,
  avatar: string,
  tipo: TipoInformePedido,
  r: { veredicto: PasoVeredicto; reportId?: string; infoId?: string; comentario?: string },
  ahora: string = new Date().toISOString(),
): Ofrecimiento {
  return {
    ...o,
    niveles: o.niveles.map(n => n.n !== nivelN ? n : {
      ...n,
      pasos: n.pasos.map(p => (p.avatar !== avatar || p.tipo !== tipo) ? p : {
        ...p,
        veredicto: r.veredicto,
        reportId: r.reportId ?? p.reportId,
        infoId: r.infoId ?? p.infoId,
        comentario: r.comentario?.trim() || p.comentario,
        respondidoAt: ahora,
      }),
    }),
  }
}

/** Quitar un paso pendiente (se pidió por error). Un nivel que se queda vacío desaparece. */
export function sinPaso(o: Ofrecimiento, nivelN: number, avatar: string, tipo: TipoInformePedido): Ofrecimiento {
  const niveles = o.niveles
    .map(n => n.n !== nivelN ? n : { ...n, pasos: n.pasos.filter(p => !(p.avatar === avatar && p.tipo === tipo)) })
    .filter(n => n.pasos.length > 0)
  return { ...o, niveles }
}

/** Resumen de veredictos de toda la cadena (para la ficha y para decidir) */
export function resumenVeredictos(o: Pick<Ofrecimiento, 'niveles'>): Record<PasoVeredicto, number> {
  const r: Record<PasoVeredicto, number> = { pendiente: 0, ok: 0, no: 0, mas: 0 }
  for (const n of o.niveles) for (const p of n.pasos) r[p.veredicto]++
  return r
}

/** Orden de la lista: lo que necesita acción primero, cerrados al final */
export function ordenLista(a: Ofrecimiento, b: Ofrecimiento, hoy: string): number {
  const peso = (o: Ofrecimiento): number => {
    const e = estadoVisible(o, hoy)
    switch (e.clave) {
      case 'caducado': return 0
      case 'decidir': return 1
      case 'nuevo': return 2
      case 'informes': return 3
      case 'aceptado': return 4
      case 'descartado': return 5
    }
  }
  const d = peso(a) - peso(b)
  if (d !== 0) return d
  // dentro del mismo grupo, fecha límite más cercana primero; sin fecha, los más nuevos arriba
  if (a.fechaLimite && b.fechaLimite && a.fechaLimite !== b.fechaLimite) return a.fechaLimite < b.fechaLimite ? -1 : 1
  if (!!a.fechaLimite !== !!b.fechaLimite) return a.fechaLimite ? -1 : 1
  return b.createdAt.localeCompare(a.createdAt)
}

/** Fecha de nacimiento "YYYY-MM-01" para crear la ficha de Captación desde el ofrecimiento */
export function birthdateDe(o: Pick<Ofrecimiento, 'birthYear' | 'birthMonth'>): string | undefined {
  if (!o.birthYear || !/^\d{4}$/.test(o.birthYear)) return undefined
  const m = o.birthMonth && /^\d{1,2}$/.test(o.birthMonth) ? String(o.birthMonth).padStart(2, '0') : '01'
  return `${o.birthYear}-${m}-01`
}
