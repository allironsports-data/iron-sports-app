// ── Resumen semanal del equipo ───────────────────────────────────────
// Hechas / vencidas / creadas por persona en una semana, con la semana
// anterior al lado para ver la tendencia. Sale de las mismas tareas que
// «Actividad 4 sem»: nada que rellenar a mano.

import type { Task } from '../types'
import { fechaLocal, sumarDias } from './fechas'
import { completadasPorTipo, type ConteoTipo } from './tiposTarea'

export interface ResumenSemana {
  hechas: number; vencidas: number; creadas: number
  /** Las hechas, por tipo y resultado (de más a menos) */
  tipos: ConteoTipo[]
}
export interface ResumenPersona extends ResumenSemana {
  /** La semana anterior, para el delta */
  antes: ResumenSemana
}

const dia = (iso?: string) => iso ? fechaLocal(new Date(iso)) : undefined

function semana(tasks: Task[], personaId: string, lunes: string, hoy: string): ResumenSemana {
  const domingo = sumarDias(lunes, 6)
  // «Vencidas» se mira al cierre de la semana; en la semana en curso, a día de hoy
  const corte = sumarDias(domingo, 1) < hoy ? sumarDias(domingo, 1) : hoy
  const r: ResumenSemana = { hechas: 0, vencidas: 0, creadas: 0, tipos: [] }
  const hechasSemana: Task[] = []
  for (const t of tasks) {
    if (t.assigneeId !== personaId) continue
    const hecha = t.status === 'completada' ? dia(t.completedAt) : undefined
    if (hecha && hecha >= lunes && hecha <= domingo) { r.hechas++; hechasSemana.push(t) }
    const creada = dia(t.createdAt)
    if (creada && creada >= lunes && creada <= domingo) r.creadas++
    // Vencida en el corte: su fecha ya había pasado y seguía sin completar
    const due = t.dueDate?.slice(0, 10)
    const abiertaEnCorte = t.status !== 'completada' || (!!hecha && hecha >= corte)
    if (due && due < corte && abiertaEnCorte && lunes <= hoy) r.vencidas++
  }
  r.tipos = completadasPorTipo(hechasSemana)
  return r
}

export function resumenSemanal(tasks: Task[], personaId: string, lunes: string, hoy: string): ResumenPersona {
  return { ...semana(tasks, personaId, lunes, hoy), antes: semana(tasks, personaId, sumarDias(lunes, -7), hoy) }
}
