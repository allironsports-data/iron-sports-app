import { useState } from 'react'
import { ChevronDown, Trash2, Pencil, X, Calendar } from 'lucide-react'
import type { ScoutingInfo, ScoutingInfoTipo, ScoutingPlayer } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import * as db from '../../lib/db'
import { Spinner } from './comun'
import { type ShowToast, personaToName, fmtDate } from './helpers'
import { TIPO_CONFIG, TIPOS } from './tiposInfo'

// ── Informes que NO son de partido ───────────────────────────────────
// Personalidad/entorno, contractual y opiniones del mercado. Van en su
// propia tabla (ver migration_scouting_infos.sql) porque «informe» en el
// resto de la app significa «informe de partido» y sus filas se cuentan.
//
// Regla de diseño: la mayoría de jugadores NO tendrán ninguno de estos,
// así que cuando no hay nada esto no ocupa NADA en pantalla. El punto de
// entrada para crearlos es el desplegable ▾ pegado a «Añadir informe».

const SEMAFORO: Record<string, { label: string; cls: string }> = {
  verde: { label: 'Sin problemas',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ambar: { label: 'A vigilar',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  rojo:  { label: 'Riesgo',          cls: 'bg-red-100 text-red-600 border-red-200' },
}

const INTERES: Record<string, { label: string; cls: string }> = {
  alto:       { label: 'Interés alto',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  medio:      { label: 'Interés medio', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  bajo:       { label: 'Interés bajo',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  descartado: { label: 'Descartado',    cls: 'bg-red-100 text-red-600 border-red-200' },
}

const INPUT = 'w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30'

/** Mensaje cuando la tabla aún no existe en este entorno */
function mensajeError(e: unknown, isAdmin: boolean): string {
  if ((e as { code?: string } | null)?.code === '42P01') {
    return isAdmin
      ? 'Falta ejecutar migration_scouting_infos.sql en Supabase'
      : 'Esta función aún no está activada en este entorno'
  }
  return 'No se ha podido guardar'
}

/** Chip pequeño de dato estructurado */
function Dato({ label, valor }: { label: string; valor?: string }) {
  if (!valor?.trim()) return null
  return (
    <span className="inline-flex items-baseline gap-1 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{valor}</span>
    </span>
  )
}

// ── Menú ▾ para crear uno nuevo ──────────────────────────────────────

export function AddInfoMenu({ onElegir }: { onElegir: (t: ScoutingInfoTipo) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(a => !a)}
        title="Añadir informe de personalidad, contractual o de mercado"
        aria-label="Otros tipos de informe"
        className="flex items-center px-1.5 py-2 sm:py-1 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-52">
            {TIPOS.map(t => {
              const c = TIPO_CONFIG[t]
              const Icono = c.icon
              return (
                <button
                  key={t}
                  onClick={() => { setAbierto(false); onElegir(t) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                >
                  <Icono className={`w-3.5 h-3.5 ${c.texto}`} />
                  {c.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Formulario (sirve para crear y para editar) ──────────────────────

type Borrador = Partial<ScoutingInfo>

function InfoForm({
  tipo, inicial, player, guardando, onCancelar, onGuardar,
}: {
  tipo: ScoutingInfoTipo
  inicial?: ScoutingInfo
  player: ScoutingPlayer
  guardando: boolean
  onCancelar: () => void
  onGuardar: (b: Borrador, pasarContratoAFicha: boolean) => void
}) {
  const [b, setB] = useState<Borrador>(inicial ?? {})
  const [pasarContrato, setPasarContrato] = useState(true)
  const c = TIPO_CONFIG[tipo]
  const Icono = c.icon
  const set = (k: keyof ScoutingInfo) => (e: { target: { value: string } }) =>
    setB(prev => ({ ...prev, [k]: e.target.value || undefined }))

  // El fin de contrato ya vive en la ficha del jugador (y manda en la pestaña
  // «Fin de contrato» y en el campograma). Si aquí se pone otro, se ofrece
  // llevarlo allí en vez de dejar dos verdades distintas.
  const contratoDistinto = tipo === 'contractual'
    && !!b.finContrato?.trim()
    && b.finContrato.trim() !== (player.clubContract ?? '').trim()

  const vacio = !b.texto?.trim()
    && !b.finContrato?.trim() && !b.salario?.trim() && !b.clausula?.trim()
    && !b.comision?.trim() && !b.agente?.trim()
    && !b.club?.trim() && !b.quien?.trim() && !b.fuente?.trim()

  return (
    <div className={`${c.fondo} border border-slate-200 rounded-xl p-3 space-y-2 mb-3`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${c.texto}`}>
          <Icono className="w-3.5 h-3.5" />
          {inicial ? `Editando · ${c.label}` : c.label}
        </span>
        <button onClick={onCancelar} aria-label="Cerrar formulario" className="text-slate-400 hover:text-slate-600 p-2 -m-2 sm:p-0 sm:m-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {tipo === 'personalidad' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={b.fuente ?? ''} onChange={set('fuente')} placeholder="¿Quién lo cuenta? (entrenador, agente…)" className={INPUT} />
          <select value={b.semaforo ?? ''} onChange={set('semaforo')} className={INPUT}>
            <option value="">Sin valorar</option>
            <option value="verde">Sin problemas</option>
            <option value="ambar">A vigilar</option>
            <option value="rojo">Riesgo</option>
          </select>
        </div>
      )}

      {tipo === 'contractual' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input value={b.finContrato ?? ''} onChange={set('finContrato')} placeholder="Fin de contrato (30/06/2027)" className={INPUT} />
            <input value={b.salario ?? ''} onChange={set('salario')} placeholder="Salario" className={INPUT} />
            <input value={b.clausula ?? ''} onChange={set('clausula')} placeholder="Cláusula" className={INPUT} />
            <input value={b.comision ?? ''} onChange={set('comision')} placeholder="Comisión" className={INPUT} />
            <input value={b.agente ?? ''} onChange={set('agente')} placeholder="Agente / agencia actual" className={INPUT} />
            <select value={b.fiabilidad ?? ''} onChange={set('fiabilidad')} className={INPUT}>
              <option value="">Fiabilidad del dato</option>
              <option value="alta">Fiabilidad alta</option>
              <option value="media">Fiabilidad media</option>
              <option value="baja">Fiabilidad baja</option>
            </select>
          </div>
          {contratoDistinto && (
            <label className="flex items-start gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
              <input type="checkbox" checked={pasarContrato} onChange={e => setPasarContrato(e.target.checked)} className="mt-0.5" />
              <span>
                Actualizar el fin de contrato de la ficha
                {player.clubContract ? <> (ahora pone <span className="font-medium">{player.clubContract}</span>)</> : ' (ahora está vacío)'}
              </span>
            </label>
          )}
        </>
      )}

      {tipo === 'mercado' && (
        <div className="grid grid-cols-2 gap-2">
          <input value={b.club ?? ''} onChange={set('club')} placeholder="Club o entidad que opina" className={INPUT} />
          <input value={b.quien ?? ''} onChange={set('quien')} placeholder="Quién lo dice y su cargo" className={INPUT} />
          <select value={b.interes ?? ''} onChange={set('interes')} className={`${INPUT} col-span-2`}>
            <option value="">Nivel de interés</option>
            <option value="alto">Interés alto</option>
            <option value="medio">Interés medio</option>
            <option value="bajo">Interés bajo</option>
            <option value="descartado">Lo han descartado</option>
          </select>
        </div>
      )}

      <textarea
        value={b.texto ?? ''}
        onChange={set('texto')}
        rows={3}
        autoFocus
        placeholder={
          tipo === 'personalidad' ? 'Cómo es, de dónde viene, entorno, actitud…'
          : tipo === 'contractual' ? 'Detalles del contrato, condiciones, quién lo ha contado…'
          : 'Qué dicen de él, en qué contexto, qué han preguntado…'
        }
        className={`${INPUT} resize-none`}
      />

      {vacio && <p className="text-[11px] text-slate-400">Rellena al menos un dato o el texto.</p>}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={() => onGuardar(b, contratoDistinto && pasarContrato)}
          disabled={guardando || vacio}
          className="flex-1 py-1.5 text-xs bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
        >
          {guardando && <Spinner />}
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Tarjeta ──────────────────────────────────────────────────────────

function InfoCard({
  info, profiles, onEditar, onBorrar,
}: {
  info: ScoutingInfo
  profiles: Profile[]
  onEditar: () => void
  onBorrar: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  const c = TIPO_CONFIG[info.tipo]
  const Icono = c.icon
  const autor = personaToName(info.persona, profiles)
  const sem = info.semaforo ? SEMAFORO[info.semaforo] : null
  const int = info.interes ? INTERES[info.interes] : null

  return (
    <div className={`bg-white border border-slate-200 border-l-[3px] ${c.borde} rounded-lg p-2.5 text-xs space-y-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 min-w-0">
          <span className={`inline-flex items-center gap-1 font-semibold ${c.texto}`}>
            <Icono className="w-3 h-3" />
            {c.corto}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {fmtDate(info.fecha)}
          </span>
          {autor && <span>· {autor}</span>}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEditar} aria-label="Editar" title="Editar" className="text-slate-300 hover:text-slate-600 p-1.5 -m-0.5">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => setConfirmar(true)} aria-label="Borrar" title="Borrar" className="text-slate-300 hover:text-red-500 p-1.5 -m-0.5">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {(sem || int || info.club || info.fuente) && (
        <div className="flex flex-wrap items-center gap-1">
          {sem && <span className={`text-[10.5px] font-semibold border rounded-full px-1.5 py-0.5 ${sem.cls}`}>{sem.label}</span>}
          {int && <span className={`text-[10.5px] font-semibold border rounded-full px-1.5 py-0.5 ${int.cls}`}>{int.label}</span>}
          <Dato label="Club" valor={info.club} />
          <Dato label="Dice" valor={info.quien} />
          <Dato label="Fuente" valor={info.fuente} />
        </div>
      )}

      {info.tipo === 'contractual' && (
        <div className="flex flex-wrap items-center gap-1">
          <Dato label="Hasta" valor={info.finContrato} />
          <Dato label="Salario" valor={info.salario} />
          <Dato label="Cláusula" valor={info.clausula} />
          <Dato label="Comisión" valor={info.comision} />
          <Dato label="Agente" valor={info.agente} />
          {info.fiabilidad && <Dato label="Fiabilidad" valor={info.fiabilidad} />}
        </div>
      )}

      {info.texto && <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{info.texto}</p>}

      {confirmar && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] text-slate-500 flex-1">¿Borrar este informe?</span>
          <button onClick={() => setConfirmar(false)} className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => { setConfirmar(false); onBorrar() }} className="text-[11px] px-2 py-1 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600">Borrar</button>
        </div>
      )}
    </div>
  )
}

// ── Sección ──────────────────────────────────────────────────────────

export function InfosSection({
  player, infos, profiles, currentProfile, isAdmin, showToast,
  nuevoTipo, setNuevoTipo, onAdd, onUpdate, onDelete, onSetContract,
}: {
  player: ScoutingPlayer
  infos: ScoutingInfo[]
  profiles: Profile[]
  currentProfile: Profile
  isAdmin: boolean
  showToast?: ShowToast
  /** Tipo que se está creando ahora mismo (lo abre el menú ▾ de la cabecera) */
  nuevoTipo: ScoutingInfoTipo | null
  setNuevoTipo: (t: ScoutingInfoTipo | null) => void
  onAdd: (i: ScoutingInfo) => void
  onUpdate: (i: ScoutingInfo) => void
  onDelete: (id: string) => void
  onSetContract?: (p: ScoutingPlayer, value: string) => Promise<void>
}) {
  const [editando, setEditando] = useState<ScoutingInfo | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(b: Borrador, pasarContrato: boolean) {
    setGuardando(true)
    try {
      if (editando) {
        const actualizado: ScoutingInfo = { ...editando, ...b }
        await db.updateScoutingInfo(actualizado)
        onUpdate(actualizado)
        setEditando(null)
      } else if (nuevoTipo) {
        const creado = await db.createScoutingInfo({
          ...b,
          playerId: player.id,
          tipo: nuevoTipo,
          fecha: new Date().toISOString(),
          persona: currentProfile.avatar,
          authorId: currentProfile.id,
        })
        onAdd(creado)
        setNuevoTipo(null)
      }
      if (pasarContrato && b.finContrato && onSetContract) {
        try { await onSetContract(player, b.finContrato) } catch { /* el toast lo pone el propio handler */ }
      }
      showToast?.('Informe guardado')
    } catch (e) {
      console.error(e)
      showToast?.(mensajeError(e, isAdmin), 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    try {
      await db.deleteScoutingInfo(id)
      onDelete(id)
      showToast?.('Informe eliminado')
    } catch (e) {
      console.error(e)
      showToast?.('No se ha podido eliminar', 'error')
    }
  }

  const tipoForm = editando?.tipo ?? nuevoTipo

  // Cuando no hay nada que enseñar ni nada que escribir, esto no ocupa sitio
  if (infos.length === 0 && !tipoForm) return null

  return (
    <div className="space-y-2 mb-3">
      {tipoForm && (
        <InfoForm
          key={editando?.id ?? `nuevo-${tipoForm}`}
          tipo={tipoForm}
          inicial={editando ?? undefined}
          player={player}
          guardando={guardando}
          onCancelar={() => { setEditando(null); setNuevoTipo(null) }}
          onGuardar={guardar}
        />
      )}
      {infos.map(i => (
        <InfoCard
          key={i.id}
          info={i}
          profiles={profiles}
          onEditar={() => { setNuevoTipo(null); setEditando(i) }}
          onBorrar={() => void borrar(i.id)}
        />
      ))}
    </div>
  )
}
