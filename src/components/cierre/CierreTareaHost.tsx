// ── Anfitrión del cierre de tareas ──────────────────────────────────
//
// Lo renderiza App, encima de todo. Recibe lo que hay que cerrar:
//   · una tarea que alguien ha marcado completada (desde el tablero, la
//     ficha del jugador, Mi día, el detalle de miembro… da igual de dónde:
//     App.handleUpdateTask intercepta el paso a «completada» y lo manda aquí)
//   · una llamada o reunión del pipeline Firmar sin tarea (desde el
//     calendario o la propia tarjeta)
// Decide qué cierre toca (lib/cierreTarea.ts), enseña el modal que
// corresponde y, al guardar, crea lo que el cierre deja (evento, actividad,
// sesión, vídeo del postpartido, siguiente paso…) y escribe la tarea
// completada con su cierre.

import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Task, Player, ScoutingPlayer, FirmasEntry, AgendaEvento, Postpartido, VideoSession } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useToastContext } from '../../hooks/useToastContext'
import { hoyISO } from '../../lib/fechas'
import * as db from '../../lib/db'
import { crearActividadesDeEvento, apuntarEventoEnPipeline, tarjetaDeScouting } from '../../lib/eventosAgenda'
import {
  cierreRequerido, eventoDeCierre, contactoOcurrio, conCierre, tareaSiguiente, notaDeNegociacion,
  jugadorDeTarea, ASSESSMENT_DE_CONCLUSION, type DatosCierre, type TipoCierre,
} from '../../lib/cierreTarea'
import { aplicarCierreLlamada, aplicarCierreEnTarjeta, conSiguientePaso, type DatosLlamada, type DatosCierre as DatosCierrePipeline } from '../../views/captacion/firmas/cierreReunion'
import { CerrarTareaModal } from './CerrarTareaModal'
import { CerrarLlamadaModal } from '../agenda/CerrarLlamadaModal'
import { CerrarReunionModal } from '../agenda/CerrarReunionModal'

/** Qué se está cerrando */
export type CierrePendiente =
  | { tipo: 'tarea'; task: Task }
  | { tipo: 'pipeline-llamada'; entryId: string }
  | { tipo: 'pipeline-reunion'; eventoId: string }

interface Props {
  pendiente: CierrePendiente | null
  onCerrar: () => void
  tasks: Task[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  profiles: Profile[]
  currentProfile: Profile
  firmasEntries: FirmasEntry[]
  eventos: AgendaEvento[]
  setEventos: Dispatch<SetStateAction<AgendaEvento[]>>
  postpartidos: Postpartido[]
  /** Escribe la tarea tal cual (sin volver a pasar por el cierre) */
  guardarTarea: (t: Task) => Promise<void>
  crearTarea: (t: Task) => Promise<Task>
  onPatchFirmasEntry: (id: string, changes: Partial<FirmasEntry> | ((e: FirmasEntry) => FirmasEntry)) => Promise<void>
  onUpdatePlayer: (p: Player) => void | Promise<void>
  onUpdatePostpartido: (p: Postpartido) => Promise<void>
  /** Solo estado: la fila ya se ha escrito con db.updateScoutingPlayer */
  onScoutingPlayerActualizado: (p: ScoutingPlayer) => void
}

export function CierreTareaHost({
  pendiente, onCerrar, tasks, players, scoutingPlayers, profiles, currentProfile, firmasEntries, eventos, setEventos, postpartidos,
  guardarTarea, crearTarea, onPatchFirmasEntry, onUpdatePlayer, onUpdatePostpartido, onScoutingPlayerActualizado,
}: Props) {
  const { showToast } = useToastContext()
  const hoy = hoyISO()

  const tipo: TipoCierre | null = useMemo(() => {
    if (!pendiente || pendiente.tipo !== 'tarea') return null
    return cierreRequerido(pendiente.task, { firmasEntries, eventos, postpartidos, players, scoutingPlayers })
  }, [pendiente, firmasEntries, eventos, postpartidos, players, scoutingPlayers])

  const fallo = (err: unknown) => {
    console.error(err)
    const msg = err instanceof Error ? err.message : ''
    showToast(msg ? `No se pudo guardar: ${msg}` : 'No se pudo guardar. Inténtalo de nuevo.', 'error')
  }

  // ── Tarea de un contacto, entregable, proceso o genérica ──
  async function cerrarTarea(task: Task, t: TipoCierre, d: DatosCierre) {
    const ref: NonNullable<Task['cierre']>['ref'] = {}
    const jugador = jugadorDeTarea(task, players)
    const autor = { id: currentProfile.id, name: currentProfile.name }
    try {
      if ((t.tipo === 'llamada' || t.tipo === 'reunion' || t.tipo === 'visita') && contactoOcurrio(t.tipo, d)) {
        const e = eventoDeCierre(task, t.tipo, d, { hoy, authorId: currentProfile.id, players })
        const activityRef = await crearActividadesDeEvento(e, currentProfile.id)
        if (activityRef) ref.activityId = activityRef
        try {
          const creado = await db.createAgendaEvento({ ...e, activityRef })
          setEventos(prev => [creado, ...prev])
          ref.eventoId = creado.id
          await apuntarEventoEnPipeline(creado, { firmasEntries, autor, hoy, patch: onPatchFirmasEntry })
        } catch (err) {
          // Sin la tabla de eventos, el contacto con un jugador nuestro queda igualmente en su actividad
          if (!(db.esMigracionPendiente(err) && activityRef)) throw err
        }
      }
      if (t.tipo === 'informe' && d.enlace) {
        const vs: VideoSession = {
          id: 'vs' + Date.now(), tipo: 'informe_datos', titulo: task.title, description: d.nota ?? '',
          date: hoy, videoUrl: d.enlace, participantes: [task.assigneeId || currentProfile.id],
        }
        await Promise.resolve(onUpdatePlayer({ ...t.player, videoSessions: [vs, ...(t.player.videoSessions ?? [])] }))
        ref.videoSessionId = vs.id
      }
      if (t.tipo === 'video') {
        const vs: VideoSession = {
          id: 'vs' + Date.now(), tipo: d.subtipo ?? 'sesion', titulo: task.title, description: d.nota ?? '',
          date: d.fecha || hoy, videoUrl: d.enlace ?? '',
          participantes: d.participantes && d.participantes.length > 0 ? d.participantes : [task.assigneeId || currentProfile.id],
        }
        await Promise.resolve(onUpdatePlayer({ ...t.player, videoSessions: [vs, ...(t.player.videoSessions ?? [])] }))
        ref.videoSessionId = vs.id
      }
      if (t.tipo === 'postpartido') {
        await onUpdatePostpartido({ ...t.postpartido, videoUrl: d.enlace })
        ref.postpartidoId = t.postpartido.id
      }
      if (t.tipo === 'negociacion' && jugador) {
        const a = await db.createPlayerActivity(jugador.id, {
          date: hoy, type: 'Nota general', notes: notaDeNegociacion(task, d), authorId: currentProfile.id,
        })
        ref.activityId = a.id
      }
      if (t.tipo === 'scouting' && t.scoutingPlayer) {
        const assessment = d.resultado ? ASSESSMENT_DE_CONCLUSION[d.resultado] : undefined
        if (assessment && assessment !== t.scoutingPlayer.assessment) {
          const sp: ScoutingPlayer = { ...t.scoutingPlayer, assessment, assessmentUpdatedAt: new Date().toISOString() }
          await db.updateScoutingPlayer(sp)
          onScoutingPlayerActualizado(sp)
        }
      }
      if (d.siguiente) {
        const nueva = await crearTarea(tareaSiguiente(task, d.siguiente, new Date().toISOString()))
        ref.siguienteTaskId = nueva.id
      }
      await guardarTarea(conCierre(task, d, ref))
      onCerrar()
      const quien = jugador?.name.split(' ')[0]
      showToast(
        t.tipo === 'llamada' && d.resultado === 'no_contesto' ? 'Apuntado: no contestó'
          : t.tipo === 'reunion' && d.resultado === 'no_celebrada' ? 'Apuntado: no se celebró'
          : ref.eventoId || ref.activityId ? `Tarea hecha y registrada${quien ? ` en la ficha de ${quien}` : ''}`
          : ref.videoSessionId ? `Tarea hecha y registrada en la ficha de ${quien ?? 'el jugador'}`
          : ref.postpartidoId ? 'Postpartido completado ✓'
          : d.siguiente ? 'Tarea hecha · siguiente paso programado'
          : 'Tarea hecha',
        'success',
      )
    } catch (err) { fallo(err) }
  }

  /** Tras un cierre del pipeline, la tarea de la acción ya está completada (la sincronización de App lo hace): se le añade el cierre */
  async function anotarCierreEnTareaDe(entry: FirmasEntry, d: DatosCierre) {
    const task = entry.nextActionTaskId ? tasks.find(x => x.id === entry.nextActionTaskId) : undefined
    if (!task) return
    try { await guardarTarea(conCierre(task, d)) } catch (err) { console.error('No se pudo anotar el cierre en la tarea:', err) }
  }

  // ── Llamada o WhatsApp del pipeline ──
  async function guardarLlamadaPipeline(tarjeta: FirmasEntry, datos: DatosLlamada) {
    try {
      const ahora = new Date().toISOString()
      await onPatchFirmasEntry(tarjeta.id, f => aplicarCierreLlamada(f, datos, currentProfile, ahora))
      await anotarCierreEnTareaDe(tarjeta, { resultado: datos.contesto ? 'contesto' : 'no_contesto', nota: datos.recap })
      // Segundo guardado: así la tarea de la llamada se completa antes de crear la del paso nuevo
      if (datos.contesto && datos.siguiente) {
        const s = datos.siguiente
        await onPatchFirmasEntry(tarjeta.id, f => conSiguientePaso(f, s))
      }
      onCerrar()
      showToast(!datos.contesto ? 'Apuntado: no contestó' : datos.siguiente ? 'Llamada cerrada · siguiente paso programado' : 'Llamada cerrada', 'success')
    } catch (err) { fallo(err) }
  }

  // ── Reunión del pipeline con evento ──
  async function guardarReunionPipeline(ev: AgendaEvento, datos: DatosCierrePipeline, participantIds: string[]) {
    const ahora = new Date().toISOString()
    const cerrado: AgendaEvento = { ...ev, participantIds, recap: datos.recap, cerradoAt: ahora, cerradoPor: currentProfile.id }
    try {
      await db.updateAgendaEvento(cerrado)
      setEventos(prev => prev.map(x => x.id === cerrado.id ? cerrado : x))
      const tarjeta = tarjetaDeScouting(firmasEntries, ev.scoutingPlayerId)
      if (tarjeta) {
        await onPatchFirmasEntry(tarjeta.id, f => aplicarCierreEnTarjeta(f, cerrado, datos, currentProfile, hoy, ahora))
        await anotarCierreEnTareaDe(tarjeta, { resultado: 'celebrada', nota: datos.recap })
        if (datos.siguiente) {
          const s = datos.siguiente
          await onPatchFirmasEntry(tarjeta.id, f => conSiguientePaso(f, s))
        }
      }
      onCerrar()
      showToast(datos.siguiente ? 'Reunión cerrada · siguiente paso programado' : 'Reunión cerrada', 'success')
    } catch (err) { fallo(err) }
  }

  if (!pendiente) return null

  // Llamada del pipeline, venga de una tarea o directamente de la tarjeta
  const entryLlamada = pendiente.tipo === 'pipeline-llamada'
    ? firmasEntries.find(f => f.id === pendiente.entryId)
    : tipo?.tipo === 'pipeline-llamada' ? firmasEntries.find(f => f.id === tipo.entry.id) ?? tipo.entry : undefined
  if (entryLlamada) {
    return (
      <CerrarLlamadaModal
        tarjeta={entryLlamada}
        profiles={profiles}
        currentProfile={currentProfile}
        onClose={onCerrar}
        onGuardar={(datos) => guardarLlamadaPipeline(entryLlamada, datos)}
      />
    )
  }

  const eventoReunion = pendiente.tipo === 'pipeline-reunion'
    ? eventos.find(e => e.id === pendiente.eventoId)
    : tipo?.tipo === 'pipeline-reunion' ? tipo.evento : undefined
  if (eventoReunion) {
    const sp = eventoReunion.scoutingPlayerId ? scoutingPlayers.find(p => p.id === eventoReunion.scoutingPlayerId) : undefined
    return (
      <CerrarReunionModal
        evento={eventoReunion}
        tarjeta={tarjetaDeScouting(firmasEntries, eventoReunion.scoutingPlayerId)}
        playerName={sp?.fullName || eventoReunion.titulo || eventoReunion.tipo}
        profiles={profiles}
        currentProfile={currentProfile}
        onClose={onCerrar}
        onGuardar={(datos, _nueva, participantIds) => guardarReunionPipeline(eventoReunion, datos, participantIds)}
      />
    )
  }

  if (pendiente.tipo !== 'tarea' || !tipo || tipo.tipo === 'pipeline-llamada' || tipo.tipo === 'pipeline-reunion') return null
  const task = pendiente.task
  const conQuien = jugadorDeTarea(task, players)?.name
    ?? (task.scoutingPlayerId ? scoutingPlayers.find(p => p.id === task.scoutingPlayerId)?.fullName : undefined)
  return (
    <CerrarTareaModal
      key={task.id}
      task={task}
      tipo={tipo}
      conQuien={conQuien}
      profiles={profiles}
      currentProfile={currentProfile}
      onGuardar={(d) => cerrarTarea(task, tipo, d)}
      onClose={onCerrar}
    />
  )
}
