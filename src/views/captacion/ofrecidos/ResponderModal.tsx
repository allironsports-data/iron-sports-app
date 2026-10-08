import { useState } from 'react'
import { PenLine } from 'lucide-react'
import type { Profile } from '../../../contexts/AuthContext'
import type { Ofrecimiento, OfrecimientoNivel, OfrecimientoPaso, PasoVeredicto, ScoutingInfo, ScoutingPlayer, ScoutingReport, TipoInformePedido } from '../../../types'
import * as db from '../../../lib/db'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { INFO_TIPO_DE, TIPO_INFORME_LABEL, VEREDICTO_LABEL, birthdateDe, conRespuesta, veredictoDesdeConclusion } from '../../../lib/ofrecidos'
import { FormRow, Spinner } from '../comun'
import { REPORT_TEMPLATE, todayISO } from '../helpers'
import { Avatar, INPUT, Modal, PickTipos, TipoChip } from './comun'

// ── Responder a un paso de la cadena ────────────────────────────────
// Técnico → informe de partido de siempre (scouting_reports), en la ficha
// de Captación del jugador. Entorno, mercado y personalidad → una info
// (scouting_infos). Si el jugador no existe en Captación, se crea con los
// datos del ofrecimiento y queda vinculado.

const CONCLUSIONES = ['', 'Firmar', 'Seguir', 'Descartar', 'Más video, prioritario', 'Más video, no prioritario'] as const
type Conclusion = typeof CONCLUSIONES[number]

const VEREDICTOS: PasoVeredicto[] = ['ok', 'no', 'mas']
const VEREDICTO_BTN: Record<PasoVeredicto, string> = {
  ok: 'bg-green-600 text-white border-green-600', no: 'bg-red-600 text-white border-red-600',
  mas: 'bg-orange-500 text-white border-orange-500', pendiente: '',
}
const VEREDICTO_TXT: Record<PasoVeredicto, string> = {
  ok: 'OK, seguir adelante', no: 'No', mas: 'Más vídeo / más info', pendiente: 'Pendiente',
}

export function ResponderModal({
  ofrecimiento: o, nivel, paso, profiles, currentProfile, scoutingPlayers, onClose, onSave, onAddPlayer, onAddReport, onAddInfo,
}: {
  ofrecimiento: Ofrecimiento
  nivel: OfrecimientoNivel
  paso: OfrecimientoPaso
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  onClose: () => void
  onSave: (fn: (o: Ofrecimiento) => Ofrecimiento) => Promise<void>
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  onAddInfo: (i: ScoutingInfo) => void
}) {
  const [tipo, setTipo] = useState<TipoInformePedido>(paso.tipo)
  // técnico
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [conclusion, setConclusion] = useState<Conclusion>('')
  // entorno / personalidad
  const [fuente, setFuente] = useState('')
  const [semaforo, setSemaforo] = useState<'' | 'verde' | 'ambar' | 'rojo'>('')
  // mercado
  const [club, setClub] = useState('')
  const [quien, setQuien] = useState('')
  const [interes, setInteres] = useState<'' | 'alto' | 'medio' | 'bajo' | 'descartado'>('')
  // veredicto
  const [veredictoManual, setVeredictoManual] = useState<PasoVeredicto | null>(null)
  const [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeKey(onClose)

  const esTecnico = tipo === 'tecnico'
  // En los técnicos el veredicto se propone desde la conclusión; se puede cambiar
  const veredicto: PasoVeredicto = veredictoManual ?? (esTecnico ? veredictoDesdeConclusion(conclusion) : 'ok')
  const existente = o.scoutingPlayerId
    ? scoutingPlayers.find(p => p.id === o.scoutingPlayerId)
    : scoutingPlayers.find(p => p.fullName.trim().toLowerCase() === o.playerName.trim().toLowerCase())
  const puedeGuardar = !!texto.trim()

  async function guardar() {
    if (!puedeGuardar || saving) return
    setSaving(true); setError('')
    try {
      // 1. Jugador en Captación (se crea si hace falta)
      let playerId = existente?.id
      if (!playerId) {
        const nuevo = await db.createScoutingPlayer({
          fullName: o.playerName,
          position1: o.position,
          birthdate: birthdateDe(o),
          team: o.team,
          nationality: o.nationality,
        })
        onAddPlayer(nuevo)
        playerId = nuevo.id
      }
      // 2. El informe o la info
      let reportId: string | undefined
      let infoId: string | undefined
      if (esTecnico) {
        const r = await db.createScoutingReport({
          playerId,
          fecha: todayISO(),
          titulo: titulo.trim() || undefined,
          texto: texto.trim(),
          conclusion: conclusion || undefined,
          persona: currentProfile.avatar,
          authorId: currentProfile.id,
        })
        onAddReport(r)
        reportId = r.id
      } else {
        const i = await db.createScoutingInfo({
          playerId,
          tipo: INFO_TIPO_DE[tipo],
          fecha: new Date().toISOString(),
          texto: texto.trim(),
          persona: currentProfile.avatar,
          authorId: currentProfile.id,
          fuente: tipo !== 'mercado' ? (fuente.trim() || undefined) : undefined,
          semaforo: tipo !== 'mercado' ? (semaforo || undefined) : undefined,
          club: tipo === 'mercado' ? (club.trim() || undefined) : undefined,
          quien: tipo === 'mercado' ? (quien.trim() || undefined) : undefined,
          interes: tipo === 'mercado' ? (interes || undefined) : undefined,
        })
        onAddInfo(i)
        infoId = i.id
      }
      // 3. El paso queda contestado (y el jugador vinculado, por si no lo estaba)
      const pid = playerId
      await onSave(x => {
        const con = conRespuesta(x, nivel.n, paso.avatar, paso.tipo, { veredicto, reportId, infoId, comentario })
        return con.scoutingPlayerId ? con : { ...con, scoutingPlayerId: pid }
      })
      onClose()
    } catch {
      setError('No se pudo guardar el informe. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo={`Responder · ${o.playerName}`} icono={<PenLine className="w-4 h-4 text-slate-400" />} onClose={onClose} ancho="max-w-lg">
      <div className="p-5 space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-800 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Te lo pidió <Avatar avatar={nivel.pedidoPor} profiles={profiles} conNombre /></span>
          <span>· Nivel {nivel.n}</span>
          <span>· <TipoChip tipo={paso.tipo} /></span>
          {nivel.mensaje && <span className="w-full text-blue-600 italic">«{nivel.mensaje}»</span>}
          <span className="w-full text-[11px] text-blue-500">
            {existente ? `Se guarda en la ficha de Captación de ${existente.fullName}` : 'El jugador no está en Captación: se crea su ficha con estos datos'}
          </span>
        </div>

        <FormRow label="Tipo de informe">
          <PickTipos value={[tipo]} onChange={v => { if (v[0]) setTipo(v[0]) }} soloUno />
          {tipo !== paso.tipo && (
            <p className="text-[11px] text-amber-700 mt-1">Te pidieron {TIPO_INFORME_LABEL[paso.tipo].toLowerCase()}; el paso se marca contestado igualmente.</p>
          )}
        </FormRow>

        {esTecnico ? (
          <>
            <FormRow label="Título (opcional)">
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Partido, vídeo, contexto…" className={INPUT} />
            </FormRow>
            <FormRow label="Informe *">
              {!texto.trim() && (
                <button type="button" onClick={() => setTexto(REPORT_TEMPLATE)} className="text-[11px] text-blue-600 hover:underline mb-1">Usar plantilla</button>
              )}
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={8} autoFocus className={`${INPUT} resize-y font-mono text-xs`} />
            </FormRow>
            <FormRow label="Conclusión">
              <select value={conclusion} onChange={e => { setConclusion(e.target.value as Conclusion); setVeredictoManual(null) }} className={INPUT}>
                {CONCLUSIONES.map(c => <option key={c} value={c}>{c || '—'}</option>)}
              </select>
            </FormRow>
          </>
        ) : tipo === 'mercado' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <FormRow label="Club o entidad"><input value={club} onChange={e => setClub(e.target.value)} placeholder="Quién opina" className={INPUT} /></FormRow>
              <FormRow label="Quién y cargo"><input value={quien} onChange={e => setQuien(e.target.value)} className={INPUT} /></FormRow>
            </div>
            <FormRow label="Interés">
              <select value={interes} onChange={e => setInteres(e.target.value as typeof interes)} className={INPUT}>
                <option value="">—</option><option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option><option value="descartado">Lo han descartado</option>
              </select>
            </FormRow>
            <FormRow label="Texto *">
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} autoFocus placeholder="Qué dicen de él, en qué contexto…" className={`${INPUT} resize-y`} />
            </FormRow>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <FormRow label="Fuente"><input value={fuente} onChange={e => setFuente(e.target.value)} placeholder="Entrenador, agente, familia…" className={INPUT} /></FormRow>
              <FormRow label="Semáforo">
                <select value={semaforo} onChange={e => setSemaforo(e.target.value as typeof semaforo)} className={INPUT}>
                  <option value="">—</option><option value="verde">Verde · sin problemas</option><option value="ambar">Ámbar · a vigilar</option><option value="rojo">Rojo · riesgo</option>
                </select>
              </FormRow>
            </div>
            <FormRow label="Texto *">
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} autoFocus
                placeholder={tipo === 'entorno' ? 'Familia, agente, quién le rodea, de dónde viene…' : 'Cómo es, actitud, carácter, en el campo y fuera…'}
                className={`${INPUT} resize-y`} />
            </FormRow>
          </>
        )}

        <FormRow label="Tu veredicto para el ofrecimiento">
          <div className="flex flex-wrap gap-1.5">
            {VEREDICTOS.map(v => (
              <button key={v} type="button" onClick={() => setVeredictoManual(v)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${veredicto === v ? VEREDICTO_BTN[v] : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {VEREDICTO_TXT[v]}
              </button>
            ))}
          </div>
          {esTecnico && veredictoManual === null && conclusion && (
            <p className="text-[11px] text-slate-400 mt-1">Propuesto desde la conclusión «{conclusion}» → {VEREDICTO_LABEL[veredicto]}. Se puede cambiar.</p>
          )}
        </FormRow>

        <FormRow label="Comentario corto para el responsable">
          <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Opcional" className={INPUT} />
        </FormRow>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!puedeGuardar || saving}
            className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {saving && <Spinner />}
            {saving ? 'Guardando…' : `Guardar y avisar a ${nivel.pedidoPor}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
