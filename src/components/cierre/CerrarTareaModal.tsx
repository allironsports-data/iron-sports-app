// ── Cerrar una tarea: ¿qué pasó? ────────────────────────────────────
//
// Un solo modal con un cuerpo por tipo de cierre (ver lib/cierreTarea.ts):
//   llamada      → ¿contestó? + nota + siguiente paso opcional
//   reunion      → ¿se celebró? + recap
//   visita       → comida o visita + recap
//   informe      → enlace + nota (→ informe de datos en la ficha)
//   video        → servicio + vídeo + fecha + participantes (→ Rendimiento → Análisis)
//   postpartido  → link del vídeo (obligatorio)
//   negociacion  → resultado + nota
//   scouting     → conclusión + nota (→ assessment del jugador de Captación)
//   nota         → una nota opcional
// Las llamadas y reuniones del pipeline Firmar tienen sus propios modales
// (CerrarLlamadaModal, CerrarReunionModal); los abre CierreTareaHost.
//
// Regla: un resultado de un clic y una nota libre. Nunca un formulario.

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Task } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { isValidUrl, normalizeUrl } from '../../lib/validate'
import { hoyISO, sumarDias } from '../../lib/fechas'
import { SERVICIO_TIPOS, SERVICIO_META, type ServicioTipo } from '../../lib/serviciosAnalisis'
import {
  RESULTADOS_NEGOCIACION, RESULTADOS_SCOUTING, RESULTADO_LABEL, SERVICIO_VIDEO_DEFECTO,
  type DatosCierre, type TipoCierre,
} from '../../lib/cierreTarea'
import { subtipoValido, SUBTIPOS_INFORME } from '../../lib/tiposTarea'

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'

interface Props {
  task: Task
  tipo: Exclude<TipoCierre, { tipo: 'pipeline-llamada' | 'pipeline-reunion' }>
  /** Nombre del jugador (nuestro o de Captación) de la tarea, si lo hay */
  conQuien?: string
  profiles: Profile[]
  currentProfile: Profile
  onGuardar: (datos: DatosCierre) => Promise<void>
  onClose: () => void
}

/** Botones de resultado: un clic */
function Chips<T extends string>({ opciones, valor, onChange, activo = 'bg-slate-800 text-white border-slate-800' }: {
  opciones: readonly T[]; valor: T | undefined; onChange: (v: T) => void; activo?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${valor === o ? activo : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          {RESULTADO_LABEL[o] ?? o}
        </button>
      ))}
    </div>
  )
}

export function CerrarTareaModal({ task, tipo, conQuien, profiles, currentProfile, onGuardar, onClose }: Props) {
  const hoy = hoyISO()
  // Informe de Captación: el subtipo elegido al crear la tarea es el resultado por defecto
  const subtipoInicial = subtipoValido(task.label, task.subtipo)
  const [resultado, setResultado] = useState<string | undefined>(
    tipo.tipo === 'informe-captacion' || tipo.tipo === 'informe-ofrecido' ? (subtipoInicial && subtipoInicial !== 'datos' ? subtipoInicial : 'tecnico') : undefined,
  )
  const [nota, setNota] = useState('')
  const [enlace, setEnlace] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [subtipo, setSubtipo] = useState<string>(subtipoInicial ?? (tipo.tipo === 'video' ? SERVICIO_VIDEO_DEFECTO : 'Visita presencial'))
  const [fecha, setFecha] = useState(hoy)
  const [participantes, setParticipantes] = useState<string[]>([task.assigneeId || currentProfile.id])
  // Llamada: siguiente paso
  const [conSiguiente, setConSiguiente] = useState(false)
  const [sigTitulo, setSigTitulo] = useState('')
  const [sigFecha, setSigFecha] = useState(sumarDias(hoy, 7))
  const [sigAssignee, setSigAssignee] = useState(task.assigneeId || currentProfile.id)
  const [ocupado, setOcupado] = useState(false)
  useEscapeKey(onClose)

  const k = tipo.tipo
  const titulo: Record<typeof k, string> = {
    llamada: 'Llamada hecha. ¿Qué pasó?',
    reunion: 'Reunión hecha. ¿Qué salió?',
    visita: 'Hecha. ¿Qué salió?',
    informe: 'Hecha. ¿Se le ha enviado el informe?',
    'informe-captacion': 'Hecha. ¿Qué informe toca escribir?',
    'informe-ofrecido': 'Hecha. ¿Qué informe es?',
    video: 'Hecha. ¿Qué se le ha hecho?',
    postpartido: 'Completar postpartido',
    negociacion: 'Negociación cerrada. ¿Cómo ha quedado?',
    scouting: 'Hecha. ¿Conclusión?',
    nota: 'Hecha',
  }

  const notaObligatoria =
    (k === 'reunion' && resultado !== 'no_celebrada') || k === 'visita'
  const resultadoObligatorio = k === 'llamada' || k === 'reunion' || k === 'negociacion' || k === 'scouting' || k === 'informe-captacion' || k === 'informe-ofrecido'
  const valido =
    !ocupado &&
    (!resultadoObligatorio || !!resultado) &&
    (!notaObligatoria || !!nota.trim()) &&
    (k !== 'postpartido' || /^https?:\/\/.+/.test(enlace.trim())) &&
    (!conSiguiente || !!sigTitulo.trim())

  const guardar = async () => {
    if (!valido) return
    if (enlace.trim() && !isValidUrl(enlace)) { setUrlError(true); return }
    setOcupado(true)
    try {
      const d: DatosCierre = {
        resultado: k === 'visita' ? (subtipo === 'Comida' ? 'comida' : 'visita')
          : k === 'informe' ? (enlace.trim() ? 'informe' : 'hecha')
          : k === 'video' ? 'video'
          : k === 'postpartido' ? 'postpartido'
          : k === 'nota' ? 'hecha'
          : resultado,
        nota: nota.trim() || undefined,
        enlace: enlace.trim() ? normalizeUrl(enlace) : undefined,
        subtipo: k === 'visita' || k === 'video' ? subtipo : undefined,
        fecha: k === 'video' || k === 'visita' || k === 'reunion' ? fecha : undefined,
        participantes: k === 'video' || k === 'visita' || k === 'reunion' ? participantes : undefined,
        siguiente: k === 'llamada' && conSiguiente && resultado === 'contesto'
          ? { titulo: sigTitulo.trim(), fecha: sigFecha || undefined, assigneeId: sigAssignee || undefined }
          : undefined,
      }
      await onGuardar(d)
    } finally {
      setOcupado(false)
    }
  }

  const toggleParticipante = (id: string) =>
    setParticipantes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // JSX, no subcomponentes: un componente definido dentro del render se
  // remonta en cada tecla y el campo pierde el foco.
  const participantesNode = (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">Quién estuvo</label>
      <div className="flex flex-wrap gap-1">
        {profiles.map(p => (
          <button key={p.id} type="button" onClick={() => toggleParticipante(p.id)} title={p.name}
            className={`w-7 h-7 rounded-full text-[10px] font-bold border transition-colors ${participantes.includes(p.id) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {p.avatar}
          </button>
        ))}
      </div>
    </div>
  )

  const etiquetaFecha = k === 'video' ? 'Cuándo fue' : 'Qué día'
  const fechaNode = (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{etiquetaFecha}</label>
      <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} className={CAMPO} aria-label={etiquetaFecha} />
    </div>
  )

  const placeholderNota: Record<typeof k, string> = {
    llamada: 'Lo que se habló o se acordó (opcional)',
    reunion: 'Recap: qué salió y qué se acordó',
    visita: 'Recap: qué salió y qué se acordó',
    informe: 'Qué contenía, cómo se le envió… (opcional)',
    'informe-captacion': 'Nota para quien lo lea (opcional)',
    'informe-ofrecido': 'Nota para quien lo lea (opcional)',
    video: 'Qué se trabajó (opcional)',
    postpartido: 'Nota (opcional)',
    negociacion: 'Condiciones, por qué, qué queda pendiente… (opcional)',
    scouting: 'Qué se ha visto o sabido (opcional)',
    nota: 'Nota de cierre (opcional)',
  }

  const pie: Partial<Record<typeof k, string>> = {
    llamada: `Queda registrada hoy como llamada en el calendario${conQuien ? ` y en la ficha de ${conQuien}` : ''}.`,
    reunion: `Queda registrada como reunión en el calendario${conQuien ? ` y en la ficha de ${conQuien}` : ''}.`,
    visita: `Queda registrada en el calendario${conQuien ? ` y en la ficha de ${conQuien}` : ''}.`,
    informe: conQuien ? `Con enlace, queda en la ficha de ${conQuien} (Rendimiento → Análisis) como «Informe de datos».` : undefined,
    'informe-captacion': `Al completar se abre la ficha de ${conQuien ?? 'Captación'} con el formulario del informe listo para escribirlo.`,
    'informe-ofrecido': 'Al completar se abre el ofrecimiento para registrar ahí el informe.',
    video: conQuien ? `Queda en la ficha de ${conQuien}, en Rendimiento → Análisis.` : undefined,
    postpartido: 'El link quedará visible en la lista y en la ficha del jugador (Rendimiento → Postpartidos).',
    negociacion: conQuien ? `El resultado queda en la actividad de ${conQuien}.` : undefined,
    scouting: tipo.tipo === 'scouting' && tipo.scoutingPlayer
      ? `Seguir, Llamar o Descartar cambian la valoración de ${tipo.scoutingPlayer.fullName} en Captación.`
      : undefined,
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-800">{titulo[k]}</h4>
            <p className="text-[11px] text-slate-500 truncate">{task.title}{conQuien ? ` · ${conQuien}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          {k === 'llamada' && (
            <Chips opciones={['contesto', 'no_contesto'] as const} valor={resultado as 'contesto' | 'no_contesto' | undefined} onChange={setResultado}
              activo={resultado === 'contesto' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'} />
          )}
          {k === 'reunion' && (
            <Chips opciones={['celebrada', 'no_celebrada'] as const} valor={resultado as 'celebrada' | 'no_celebrada' | undefined} onChange={setResultado}
              activo={resultado === 'celebrada' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'} />
          )}
          {k === 'visita' && (
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg p-0.5 w-fit">
              {['Comida', 'Visita presencial'].map(s => (
                <button key={s} type="button" onClick={() => setSubtipo(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${subtipo === s ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {(k === 'informe-captacion' || k === 'informe-ofrecido') && (
            <Chips opciones={SUBTIPOS_INFORME.filter(s => s !== 'datos')} valor={resultado as typeof SUBTIPOS_INFORME[number] | undefined} onChange={setResultado} />
          )}
          {k === 'negociacion' && <Chips opciones={RESULTADOS_NEGOCIACION} valor={resultado as typeof RESULTADOS_NEGOCIACION[number] | undefined} onChange={setResultado} />}
          {k === 'scouting' && <Chips opciones={RESULTADOS_SCOUTING} valor={resultado as typeof RESULTADOS_SCOUTING[number] | undefined} onChange={setResultado} />}

          {k === 'video' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Qué servicio</label>
              <select value={subtipo} onChange={e => setSubtipo(e.target.value)} className={CAMPO}>
                {SERVICIO_TIPOS.filter(s => s !== 'informe_datos').map(s => <option key={s} value={s}>{SERVICIO_META[s as ServicioTipo].label}</option>)}
              </select>
              <p className="text-[11px] text-slate-400">{SERVICIO_META[subtipo as ServicioTipo]?.ayuda}</p>
            </div>
          )}

          {(k === 'informe' || k === 'video' || k === 'postpartido') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">
                {k === 'postpartido' ? '🎬 Link del vídeo' : k === 'video' ? 'Enlace al vídeo' : 'Enlace al informe'}
                {k !== 'postpartido' && <span className="text-slate-400 font-normal"> (opcional)</span>}
              </label>
              <input autoFocus value={enlace} onChange={e => { setEnlace(e.target.value); setUrlError(false) }}
                onKeyDown={e => { if (e.key === 'Enter') void guardar() }}
                placeholder={k === 'postpartido' ? 'https://streamable.com/…' : 'https://…'} className={CAMPO} />
              {urlError && <p className="text-[11px] text-red-500">URL no válida</p>}
            </div>
          )}

          {(k === 'video' || ((k === 'reunion' || k === 'visita') && resultado !== 'no_celebrada')) && (
            <div className="grid grid-cols-2 gap-2">{fechaNode}</div>
          )}

          {!(k === 'reunion' && resultado === 'no_celebrada') && (
            <textarea
              autoFocus={k !== 'informe' && k !== 'video' && k !== 'postpartido'}
              value={nota} onChange={e => setNota(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void guardar() }}
              placeholder={placeholderNota[k]}
              className={`${CAMPO} resize-none`}
            />
          )}
          {k === 'reunion' && resultado === 'no_celebrada' && (
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Por qué no (opcional)" className={CAMPO} />
          )}

          {(k === 'video' || ((k === 'reunion' || k === 'visita') && resultado !== 'no_celebrada')) && participantesNode}

          {k === 'llamada' && resultado === 'contesto' && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                <input type="checkbox" checked={conSiguiente} onChange={e => setConSiguiente(e.target.checked)} />
                Dejar programado el siguiente paso
              </label>
              {conSiguiente && (
                <div className="space-y-2">
                  <input value={sigTitulo} onChange={e => setSigTitulo(e.target.value)} placeholder="Qué hay que hacer (p. ej. «Volver a llamar»)" className={CAMPO} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={sigFecha} onChange={e => setSigFecha(e.target.value)} className={CAMPO} aria-label="Para cuándo" />
                    <select value={sigAssignee} onChange={e => setSigAssignee(e.target.value)} className={CAMPO} aria-label="Quién">
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {pie[k] && <p className="text-[11px] text-slate-400">{pie[k]}</p>}

          <div className="flex gap-2 safe-area-bottom">
            <button onClick={onClose} disabled={ocupado}
              className="py-2.5 sm:py-2 px-4 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={() => void guardar()} disabled={!valido}
              className="flex-1 py-2.5 sm:py-2 text-xs font-semibold rounded-lg text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50">
              {ocupado ? 'Guardando…' : k === 'nota' ? 'Completar' : k === 'informe-captacion' ? 'Completar y escribir el informe' : k === 'informe-ofrecido' ? 'Completar y abrir el ofrecimiento' : 'Completar y registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
