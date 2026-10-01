// ── Ficha del jugador → Rendimiento → Servicios de análisis ──────────
//
// Todo lo que se le hace o se le manda a un jugador nuestro: sesiones de
// videoanálisis, vídeos, recursos, entrenamientos e informes de datos.
// Cada tipo tiene su color; cada entrada lleva título y descripción por
// separado, las personas del equipo que han participado, y se puede editar.

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ExternalLink, X, Users } from 'lucide-react'
import type { Player, Task, VideoSession } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { hoyISO, parseDia } from '../../lib/fechas'
import { isValidUrl, normalizeUrl } from '../../lib/validate'
import {
  SERVICIO_TIPOS, SERVICIO_META, tipoDeServicio, tituloDeServicio, participantesDeServicio, contarServicios,
  type ServicioTipo,
} from '../../lib/serviciosAnalisis'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useToastContext } from '../../hooks/useToastContext'

const CAMPO = 'w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-200'

export function ServiciosAnalisis({ player, profiles, currentProfile, tareas, onUpdate }: {
  player: Player
  profiles: Profile[]
  currentProfile: Profile
  /** Tareas de tipo «Videoanálisis» de este jugador: lo pendiente, encima de la lista */
  tareas: Task[]
  onUpdate: (p: Player) => void | Promise<void>
}) {
  const { showToast } = useToastContext()
  const [filtro, setFiltro] = useState<ServicioTipo | ''>('')
  // null = cerrado · 'nuevo' = alta · un servicio = edición
  const [formulario, setFormulario] = useState<VideoSession | 'nuevo' | null>(null)
  const [aBorrar, setABorrar] = useState<VideoSession | null>(null)

  const todos = useMemo(
    () => [...(player.videoSessions ?? [])].sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? ''))),
    [player.videoSessions],
  )
  const cuenta = useMemo(() => contarServicios(todos), [todos])
  const visibles = filtro ? todos.filter(v => tipoDeServicio(v) === filtro) : todos

  async function guardar(v: VideoSession) {
    const existe = todos.some(x => x.id === v.id)
    const lista = existe ? (player.videoSessions ?? []).map(x => x.id === v.id ? v : x) : [v, ...(player.videoSessions ?? [])]
    try {
      await Promise.resolve(onUpdate({ ...player, videoSessions: lista }))
      setFormulario(null)
      showToast(existe ? 'Cambios guardados' : 'Registrado', 'success')
    } catch {
      showToast('No se pudo guardar', 'error')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800 mr-auto">Servicios de análisis</h3>
        <select value={filtro} onChange={e => setFiltro(e.target.value as ServicioTipo | '')} aria-label="Tipo de servicio"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          <option value="">Todos ({todos.length})</option>
          {SERVICIO_TIPOS.map(t => <option key={t} value={t}>{SERVICIO_META[t].label} ({cuenta[t]})</option>)}
        </select>
        <button onClick={() => setFormulario('nuevo')}
          className="inline-flex items-center gap-1 rounded-md text-white text-xs font-medium px-2.5 py-1.5 bg-primary hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nuevo
        </button>
      </div>

      {/* Leyenda: qué se le ha hecho, de un vistazo */}
      {todos.length > 0 && (
        <p className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-500">
          {SERVICIO_TIPOS.filter(t => cuenta[t] > 0).map(t => (
            <span key={t} className="inline-flex items-center gap-1" title={SERVICIO_META[t].ayuda}>
              <span className={`w-2 h-2 rounded-full ${SERVICIO_META[t].punto}`} /> {cuenta[t]} {SERVICIO_META[t].label.toLowerCase()}
            </span>
          ))}
        </p>
      )}

      {/* Tareas de videoanálisis de este jugador: lo pendiente y lo ya hecho */}
      {tareas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Tareas de videoanálisis</p>
          {tareas.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.status === 'completada' ? 'bg-emerald-500' : t.status === 'en_progreso' ? 'bg-blue-500' : 'border-2 border-slate-300'}`} />
              <span className={`flex-1 min-w-0 truncate text-xs font-medium ${t.status === 'completada' ? 'line-through text-slate-400' : 'text-slate-800'}`} title={t.title}>{t.title}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">
                {t.status === 'completada' ? 'hecha' : t.status === 'en_progreso' ? 'en curso' : 'pendiente'}
                {t.dueDate ? ` · ${parseDia(t.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}
              </span>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary flex-shrink-0">
                {profiles.find(p => p.id === t.assigneeId)?.avatar ?? '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-400 bg-white border border-slate-200 rounded-lg">
          {todos.length === 0 ? 'Sin nada registrado' : 'Nada de este tipo'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
          {visibles.map(v => {
            const m = SERVICIO_META[tipoDeServicio(v)]
            const quienes = participantesDeServicio(v).map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p)
            // En los antiguos la descripción hace de título: no se repite debajo
            const detalle = v.titulo?.trim() ? v.description?.trim() : ''
            return (
              <div key={v.id} className={`flex items-start gap-2 pl-2.5 pr-2 py-2 border-l-4 ${m.borde}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${m.chip}`}>{m.label}</span>
                    <span className="text-xs font-semibold text-slate-800 break-words">{tituloDeServicio(v)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {parseDia(v.date.slice(0, 10)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {v.time ? ` · ${v.time}` : ''}{v.duration ? ` · ${v.duration} min` : ''}{v.lugar ? ` · 📍 ${v.lugar}` : ''}
                  </p>
                  {detalle && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap break-words">{detalle}</p>}
                  {v.videoUrl && (
                    <a href={v.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Abrir enlace
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {quienes.map(p => (
                    <span key={p.id} title={p.name} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-primary">{p.avatar}</span>
                  ))}
                  <button onClick={() => setFormulario(v)} aria-label="Editar" title="Editar" className="p-1.5 text-slate-500 hover:text-slate-800"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setABorrar(v)} aria-label="Eliminar" title="Eliminar" className="p-1.5 text-slate-500 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formulario && (
        <FormularioServicio
          key={formulario === 'nuevo' ? 'nuevo' : formulario.id}
          inicial={formulario === 'nuevo' ? undefined : formulario}
          profiles={profiles}
          currentProfileId={currentProfile.id}
          onClose={() => setFormulario(null)}
          onSave={guardar}
        />
      )}

      <ConfirmModal
        open={!!aBorrar}
        title="¿Eliminar este registro?"
        message={aBorrar ? `Se eliminará «${tituloDeServicio(aBorrar)}».` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={async () => {
          if (!aBorrar) return
          try {
            await Promise.resolve(onUpdate({ ...player, videoSessions: (player.videoSessions ?? []).filter(s => s.id !== aBorrar.id) }))
            setABorrar(null)
            showToast('Eliminado', 'info')
          } catch {
            showToast('No se pudo eliminar', 'error')
          }
        }}
        onCancel={() => setABorrar(null)}
      />
    </div>
  )
}

function FormularioServicio({ inicial, profiles, currentProfileId, onClose, onSave }: {
  inicial?: VideoSession
  profiles: Profile[]
  currentProfileId: string
  onClose: () => void
  onSave: (v: VideoSession) => Promise<void>
}) {
  const [tipo, setTipo] = useState<ServicioTipo>(inicial ? tipoDeServicio(inicial) : 'sesion')
  // En los antiguos solo había descripción, que hacía de título: se pasa al título para poder separarlos
  const [titulo, setTitulo] = useState(inicial?.titulo ?? (inicial ? inicial.description : ''))
  const [descripcion, setDescripcion] = useState(inicial?.titulo ? inicial.description : '')
  const [date, setDate] = useState(inicial?.date.slice(0, 10) ?? hoyISO())
  const [time, setTime] = useState(inicial?.time ?? '')
  const [duration, setDuration] = useState(inicial?.duration ? String(inicial.duration) : '')
  const [lugar, setLugar] = useState(inicial?.lugar ?? '')
  const [videoUrl, setVideoUrl] = useState(inicial?.videoUrl ?? '')
  // Por defecto, quien lo apunta (lo normal es el analista, no el gestor del jugador)
  const [participantes, setParticipantes] = useState<string[]>(inicial ? participantesDeServicio(inicial) : [currentProfileId])
  const [urlError, setUrlError] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEscapeKey(onClose)

  const alternar = (id: string) => setParticipantes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || guardando) return
    // El enlace es opcional: una sesión se puede dejar agendada antes de tener el vídeo
    if (videoUrl.trim() && !isValidUrl(videoUrl)) { setUrlError(true); return }
    setGuardando(true)
    try {
      await onSave({
        id: inicial?.id ?? 'vs' + Date.now(),
        tipo, titulo: titulo.trim(), description: descripcion.trim(),
        date, time: time || undefined,
        duration: duration ? parseInt(duration) : undefined,
        lugar: lugar.trim() || undefined,
        videoUrl: videoUrl.trim() ? normalizeUrl(videoUrl) : '',
        participantes,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h4 className="text-sm font-semibold text-slate-800">{inicial ? 'Editar' : 'Nuevo servicio de análisis'}</h4>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-700 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={enviar} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as ServicioTipo)} className={CAMPO}>
              {SERVICIO_TIPOS.map(t => <option key={t} value={t}>{SERVICIO_META[t].label}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SERVICIO_META[tipo].punto}`} /> {SERVICIO_META[tipo].ayuda}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Título</label>
            <input autoFocus={!inicial} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej. Vigilar rupturas a la espalda" className={CAMPO} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Descripción <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              placeholder="Qué se trabajó, qué se le mandó, cómo fue…" className={`${CAMPO} resize-none`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Fecha</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={CAMPO} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={CAMPO} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Minutos</label>
              <input type="number" min="0" value={duration} onChange={e => setDuration(e.target.value)} className={CAMPO} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Lugar <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Oficina, videollamada…" className={CAMPO} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Enlace <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input value={videoUrl} onChange={e => { setVideoUrl(e.target.value); setUrlError(false) }} placeholder="Vídeo, informe…" className={CAMPO} />
              {urlError && <p className="text-[11px] text-red-500">URL no válida</p>}
            </div>
          </div>
          {/* Quién del equipo ha participado: sale en el calendario de cada uno */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-400" /> Participan
            </label>
            <div className="flex flex-wrap gap-1">
              {profiles.map(p => {
                const sel = participantes.includes(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => alternar(p.id)} title={p.name} aria-label={p.name} aria-pressed={sel}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${
                      sel ? 'bg-primary text-white ring-2 ring-blue-200' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-400 hover:text-slate-600'}`}>
                    {p.avatar}
                  </button>
                )
              })}
            </div>
          </div>
          {participantes.length > 0 && (
            <p className="text-[11px] text-slate-400 -mt-1.5">
              {participantes.map(id => profiles.find(p => p.id === id)?.name.split(' ')[0]).filter(Boolean).join(', ')}
            </p>
          )}
          <div className="flex gap-2 pt-1 safe-area-bottom">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={!titulo.trim() || guardando}
              className="flex-1 py-2.5 sm:py-2 text-xs rounded-lg text-white disabled:opacity-50 transition-colors bg-primary hover:bg-primary/90">
              {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
