import { useMemo, useState } from 'react'
import { X, Pencil, Trash2, Layers, Send, ExternalLink, Clock, CheckCircle2, XCircle, RotateCcw, Scale } from 'lucide-react'
import type { Profile } from '../../../contexts/AuthContext'
import type { Ofrecimiento, OfrecimientoNivel, OfrecimientoPaso, FirmasComment, ScoutingInfo, ScoutingPlayer, ScoutingReport } from '../../../types'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { useAtras } from '../../../hooks/useAtras'
import { ConfirmModal } from '../../../components/ConfirmModal'
import {
  OPERACION_LABEL, ORIGEN_LABEL, estadoVisible, diasHastaLimite, estaCerrado, nivelCompleto, sinPaso, resumenVeredictos,
} from '../../../lib/ofrecidos'
import { FIRMAS_KIND_META } from '../firmas/helpers'
import { type ShowToast, fmtDate, relativeDate, todayISO, CONCLUSION_STYLE } from '../helpers'
import { Avatar, EstadoChip, TipoChip, VeredictoChip } from './comun'
import { INPUT_SM } from './estilos'
import { ResponderModal } from './ResponderModal'
import { NuevoNivelModal } from './NuevoNivelModal'

// ── Ficha de un ofrecimiento ────────────────────────────────────────
// Todo lo que la lista no enseña: cadena de informes, condiciones,
// contactos con quien lo ofrece y la decisión.

export type PatchOfrecimiento = (id: string, fn: (o: Ofrecimiento) => Ofrecimiento) => Promise<void>

function fmtLimite(o: Ofrecimiento, hoy: string): { texto: string; urgente: boolean } | null {
  if (!o.fechaLimite) return null
  const d = diasHastaLimite(o, hoy) ?? 0
  const fecha = fmtDate(o.fechaLimite)
  if (estaCerrado(o)) return { texto: `Límite ${fecha}`, urgente: false }
  if (d < 0) return { texto: `Caducó el ${fecha} (hace ${-d} día${-d !== 1 ? 's' : ''})`, urgente: true }
  if (d === 0) return { texto: `Contestar hoy (${fecha})`, urgente: true }
  return { texto: `Contestar antes del ${fecha} (${d} día${d !== 1 ? 's' : ''})`, urgente: d <= 3 }
}

export function OfrecidoFicha({
  ofrecimiento: o, profiles, currentProfile, scoutingPlayers, scoutingReports, scoutingInfos,
  onClose, onPatch, onDelete, onEdit, onAddPlayer, onAddReport, onAddInfo, abrirJugador, showToast,
}: {
  ofrecimiento: Ofrecimiento
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingInfos: ScoutingInfo[]
  onClose: () => void
  onPatch: PatchOfrecimiento
  onDelete: (id: string) => Promise<void>
  onEdit: () => void
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  onAddInfo: (i: ScoutingInfo) => void
  abrirJugador: (id: string) => void
  showToast: ShowToast
}) {
  useEscapeKey(onClose)
  useAtras(true, onClose, 'ficha-ofrecido')
  const hoy = todayISO()
  const isAdmin = currentProfile.is_admin
  const yo = currentProfile.avatar
  const estado = estadoVisible(o, hoy)
  const cerrado = estaCerrado(o)
  const limite = fmtLimite(o, hoy)
  const resumen = resumenVeredictos(o)

  const [responder, setResponder] = useState<{ nivel: OfrecimientoNivel; paso: OfrecimientoPaso } | null>(null)
  const [nuevoNivel, setNuevoNivel] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [decision, setDecision] = useState<'aceptado' | 'descartado' | null>(null)
  const [decisionNota, setDecisionNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  // contactos
  const [kind, setKind] = useState<string>('nota')
  const [outcome, setOutcome] = useState<'contesto' | 'no_contesto' | null>(null)
  const [texto, setTexto] = useState('')

  const reportById = useMemo(() => new Map(scoutingReports.map(r => [r.id, r])), [scoutingReports])
  const infoById = useMemo(() => new Map(scoutingInfos.map(i => [i.id, i])), [scoutingInfos])
  const jugador = o.scoutingPlayerId ? scoutingPlayers.find(p => p.id === o.scoutingPlayerId) : undefined

  const patch = async (fn: (x: Ofrecimiento) => Ofrecimiento, ok?: string) => {
    setGuardando(true)
    try { await onPatch(o.id, fn); if (ok) showToast(ok) }
    catch { showToast('No se pudo guardar', 'error') }
    finally { setGuardando(false) }
  }

  async function addContacto() {
    if (!texto.trim() && !outcome) return
    const c: FirmasComment = {
      id: crypto.randomUUID(),
      text: texto.trim() || (outcome === 'contesto' ? 'Contestó' : 'No contestó'),
      date: new Date().toISOString(),
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind: kind as FirmasComment['kind'],
      outcome: outcome ?? undefined,
    }
    await patch(x => ({ ...x, contactos: [...x.contactos, c] }))
    setTexto(''); setOutcome(null)
  }

  async function decidir(estado: 'aceptado' | 'descartado') {
    await patch(x => ({
      ...x, estado, decididoPor: yo, decididoAt: new Date().toISOString(), decisionNota: decisionNota.trim() || undefined,
    }), estado === 'aceptado' ? 'Ofrecimiento aceptado' : 'Ofrecimiento descartado')
    setDecision(null); setDecisionNota('')
  }

  const contactos = [...o.contactos].sort((a, b) => b.date.localeCompare(a.date))
  const puedeResponder = (p: OfrecimientoPaso) => p.veredicto === 'pendiente' && !cerrado && (p.avatar === yo || isAdmin || o.responsable === yo)

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-2 sm:px-4 py-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl my-auto max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* ── Cabecera ── */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-5 py-4 sticky top-0 z-10">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-extrabold text-slate-800">{o.playerName}</span>
                {o.position && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{o.position}</span>}
                {o.birthYear && <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">{o.birthMonth ? `${o.birthMonth}/` : ''}{o.birthYear}</span>}
                {o.team && <span className="text-[11px] text-slate-500 italic">{o.team}</span>}
                {(o.country || o.nationality) && <span className="text-[11px] text-slate-500">{[o.country, o.nationality].filter(Boolean).join(' · ')}</span>}
                {jugador ? (
                  <button onClick={() => abrirJugador(jugador.id)} className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-0.5">
                    Ficha de Captación <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">Sin ficha en Captación todavía</span>
                )}
              </div>
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] text-slate-500 mt-1.5">
                <span><span className="text-slate-400">Ofrece</span> <b className="text-slate-700">{o.origen === 'boulema' ? 'Boulema' : ORIGEN_LABEL[o.origen]}{o.ofreceNombre && o.ofreceNombre !== 'Boulema' ? ` · ${o.ofreceNombre}` : ''}</b>{o.ofreceContacto && <span className="ml-1">📱 {o.ofreceContacto}</span>}</span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1"><span className="text-slate-400">Responsable</span> {o.responsable ? <Avatar avatar={o.responsable} profiles={profiles} conNombre primario /> : <span className="text-amber-600 font-semibold">sin asignar</span>}</span>
                <span className="text-slate-300">·</span>
                <span><span className="text-slate-400">Alta</span> {fmtDate(o.createdAt)}{o.createdBy ? <> por <Avatar avatar={o.createdBy} profiles={profiles} /></> : null}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <EstadoChip e={estado} />
                <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setConfirmarBorrar(true)} title="Eliminar" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
              </div>
              {limite && (
                <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${limite.urgente ? 'text-red-600' : 'text-slate-400'}`}>
                  <Clock className="w-3 h-3" /> {limite.texto}
                </span>
              )}
              {cerrado && o.decididoAt && (
                <span className="text-[11px] text-slate-400">
                  {o.estado === 'aceptado' ? 'Aceptado' : 'Descartado'} el {fmtDate(o.decididoAt)}{o.decididoPor ? ` por ${o.decididoPor}` : ''}{o.decisionNota ? ` · «${o.decisionNota}»` : ''}
                </span>
              )}
            </div>
          </div>
          {o.notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap leading-relaxed">{o.notes}</p>}
        </div>

        <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3 sm:gap-4">
          {/* ── Cadena de informes ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-xs font-bold text-slate-700">Cadena de informes</h4>
              {o.niveles.length > 0 && (
                <span className="text-[11px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                  {resumen.ok} OK · {resumen.no} no · {resumen.mas} más vídeo · {resumen.pendiente} pendiente{resumen.pendiente !== 1 ? 's' : ''}
                </span>
              )}
              {!cerrado && (
                <button onClick={() => setNuevoNivel(true)} className="ml-auto text-[11px] font-semibold text-primary border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 inline-flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {o.niveles.length ? 'Añadir nivel' : 'Pedir informe'}
                </button>
              )}
            </div>

            {o.niveles.length === 0 && (
              <p className="text-xs text-slate-400 py-4 text-center">Todavía no se ha pedido ningún informe.</p>
            )}

            {o.niveles.map(nivel => {
              const completo = nivelCompleto(nivel)
              return (
                <div key={nivel.n} className="mb-3">
                  <div className={`text-[10.5px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-2 ${completo ? 'text-green-700' : 'text-blue-700'}`}>
                    Nivel {nivel.n} · {completo ? 'completo' : 'activo'}
                    <span className="font-normal normal-case tracking-normal text-slate-400">
                      pedido {relativeDate(nivel.pedidoAt) || `el ${fmtDate(nivel.pedidoAt)}`} por {nivel.pedidoPor}
                    </span>
                  </div>
                  {nivel.mensaje && <p className="text-[11.5px] text-slate-500 italic mb-1.5">«{nivel.mensaje}»</p>}
                  {nivel.pasos.map(paso => {
                    const rep = paso.reportId ? reportById.get(paso.reportId) : undefined
                    const info = paso.infoId ? infoById.get(paso.infoId) : undefined
                    const pendiente = paso.veredicto === 'pendiente'
                    const cuerpo = rep?.texto ?? info?.texto
                    return (
                      <div key={`${paso.avatar}-${paso.tipo}`} className={`border rounded-xl px-3 py-2 mb-1.5 ${pendiente ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <Avatar avatar={paso.avatar} profiles={profiles} conNombre />
                          <TipoChip tipo={paso.tipo} />
                          <VeredictoChip v={paso.veredicto} />
                          {paso.respondidoAt && <span className="text-[11px] text-slate-400">{fmtDate(paso.respondidoAt)}</span>}
                          {rep?.conclusion && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONCLUSION_STYLE[rep.conclusion] ?? 'bg-slate-100 text-slate-600'}`}>{rep.conclusion}</span>}
                          <span className="ml-auto flex items-center gap-1">
                            {(rep || info) && jugador && (
                              <button onClick={() => abrirJugador(jugador.id)} className="text-[11px] font-semibold text-blue-600 hover:underline">Ver en la ficha ↗</button>
                            )}
                            {puedeResponder(paso) && (
                              <button onClick={() => setResponder({ nivel, paso })} className="text-[11px] font-semibold bg-primary text-white rounded-lg px-2 py-1 hover:bg-primary/90">Responder</button>
                            )}
                            {pendiente && !cerrado && (isAdmin || o.responsable === yo || nivel.pedidoPor === yo) && (
                              <button onClick={() => patch(x => sinPaso(x, nivel.n, paso.avatar, paso.tipo), 'Petición retirada')} title="Retirar esta petición" className="p-1 rounded text-slate-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </span>
                        </div>
                        {paso.comentario && <p className="text-xs text-slate-700 mt-1">«{paso.comentario}»</p>}
                        {cuerpo && <p className="text-[11.5px] text-slate-500 mt-1 line-clamp-3 whitespace-pre-wrap">{cuerpo}</p>}
                        {pendiente && !cuerpo && <p className="text-[11px] text-slate-400 mt-1">Sin informe todavía. Le sale como pendiente en Mi día y en Tareas.</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* ── Decisión ── */}
            <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
              {cerrado ? (
                <button onClick={() => patch(x => ({ ...x, estado: 'abierto', decididoPor: undefined, decididoAt: undefined, decisionNota: undefined }), 'Ofrecimiento reabierto')} disabled={guardando}
                  className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                </button>
              ) : decision ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">{decision === 'aceptado' ? 'Aceptar el ofrecimiento' : 'Descartar el ofrecimiento'}</p>
                  <input value={decisionNota} onChange={e => setDecisionNota(e.target.value)} placeholder="Qué se le contesta a quien lo ofrece (opcional)" className={INPUT_SM} autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setDecision(null)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button onClick={() => decidir(decision)} disabled={guardando}
                      className={`text-xs font-semibold text-white rounded-lg px-3 py-1.5 ${decision === 'aceptado' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                      Confirmar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] text-slate-400">Cuando tengas suficiente:</span>
                  {o.estado !== 'decidir' && (
                    <button onClick={() => patch(x => ({ ...x, estado: 'decidir' }), 'Marcado para decidir')} disabled={guardando}
                      className="text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-700 rounded-lg px-3 py-1.5 hover:bg-orange-100 inline-flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5" /> Pasar a «Decidir»
                    </button>
                  )}
                  <button onClick={() => setDecision('aceptado')} className="text-xs font-semibold bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Aceptar</button>
                  <button onClick={() => setDecision('descartado')} className="text-xs font-semibold border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Descartar</button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {/* ── Condiciones ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center mb-2">
                <h4 className="text-xs font-bold text-slate-700">Condiciones pedidas</h4>
                <button onClick={onEdit} className="ml-auto p-1 rounded text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
              </div>
              {!o.condOperacion && !o.condCoste && !o.condSalario && !o.condComision && !o.condFinContrato && !o.fechaLimite ? (
                <p className="text-xs text-slate-400">Sin condiciones apuntadas.</p>
              ) : (
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
                  {o.condOperacion && <><dt className="text-slate-400">Operación</dt><dd className="text-slate-700">{OPERACION_LABEL[o.condOperacion]}</dd></>}
                  {o.condCoste && <><dt className="text-slate-400">Coste pedido</dt><dd className="text-slate-700">{o.condCoste}</dd></>}
                  {o.condSalario && <><dt className="text-slate-400">Salario pedido</dt><dd className="text-slate-700">{o.condSalario}</dd></>}
                  {o.condComision && <><dt className="text-slate-400">Comisión</dt><dd className="text-slate-700">{o.condComision}</dd></>}
                  {o.condFinContrato && <><dt className="text-slate-400">Contrato actual</dt><dd className="text-slate-700">{o.condFinContrato}</dd></>}
                  {o.fechaLimite && <><dt className="text-slate-400">Fecha límite</dt><dd className={limite?.urgente ? 'text-red-600 font-semibold' : 'text-slate-700'}>{fmtDate(o.fechaLimite)}</dd></>}
                </dl>
              )}
            </div>

            {/* ── Contactos con quien lo ofrece ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-slate-700 mb-2">
                Contactos con quien lo ofrece {contactos.length > 0 && <span className="text-slate-300 font-normal">· {contactos.length}</span>}
              </h4>
              <div className="border border-slate-200 rounded-lg p-2 bg-white space-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {Object.entries(FIRMAS_KIND_META).map(([k, meta]) => (
                    <button key={k} onClick={() => { setKind(k); if (k !== 'llamada' && k !== 'whatsapp') setOutcome(null) }} title={meta.label}
                      className={`px-1.5 py-0.5 rounded-md text-[11px] transition-colors ${kind === k ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30' : 'text-slate-400 hover:bg-slate-100'}`}>
                      {meta.icon} <span className="hidden xl:inline">{meta.label}</span>
                    </button>
                  ))}
                  {(kind === 'llamada' || kind === 'whatsapp') && (
                    <span className="flex items-center gap-1 ml-auto">
                      <button onClick={() => setOutcome(x => x === 'contesto' ? null : 'contesto')} className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${outcome === 'contesto' ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'text-slate-400 hover:bg-slate-100'}`}>✓ contestó</button>
                      <button onClick={() => setOutcome(x => x === 'no_contesto' ? null : 'no_contesto')} className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${outcome === 'no_contesto' ? 'bg-red-100 text-red-600 ring-1 ring-red-200' : 'text-slate-400 hover:bg-slate-100'}`}>✗ no contestó</button>
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addContacto() }}
                    placeholder={kind === 'nota' ? 'Añadir nota…' : `${FIRMAS_KIND_META[kind].label}: ¿qué pasó?`} className={INPUT_SM} />
                  <button onClick={addContacto} disabled={(!texto.trim() && !outcome) || guardando} aria-label="Guardar apunte"
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90"><Send className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-slate-100">
                {contactos.length === 0 && <li className="text-[11px] text-slate-400 py-2">Nada apuntado todavía.</li>}
                {contactos.map(c => (
                  <li key={c.id} className="flex gap-2 py-2 text-xs">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">{FIRMAS_KIND_META[c.kind ?? 'nota']?.icon ?? '📝'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-700 whitespace-pre-wrap">{c.text}</div>
                      <div className="text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {c.author?.split(' ')[0]} · {fmtDate(c.date)}
                        {c.outcome && <span className={`px-1.5 py-0.5 rounded-full font-semibold ${c.outcome === 'contesto' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{c.outcome === 'contesto' ? 'contestó' : 'no contestó'}</span>}
                        {(isAdmin || c.authorId === currentProfile.id) && (
                          <button onClick={() => patch(x => ({ ...x, contactos: x.contactos.filter(y => y.id !== c.id) }))} className="text-slate-300 hover:text-red-500 ml-auto">borrar</button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {responder && (
        <ResponderModal
          ofrecimiento={o} nivel={responder.nivel} paso={responder.paso}
          profiles={profiles} currentProfile={currentProfile} scoutingPlayers={scoutingPlayers}
          onClose={() => setResponder(null)}
          onSave={fn => onPatch(o.id, fn).then(() => showToast('Informe guardado'))}
          onAddPlayer={onAddPlayer} onAddReport={onAddReport} onAddInfo={onAddInfo}
        />
      )}
      {nuevoNivel && (
        <NuevoNivelModal
          ofrecimiento={o} profiles={profiles} currentProfile={currentProfile}
          onClose={() => setNuevoNivel(false)}
          onSave={fn => onPatch(o.id, fn).then(() => showToast('Nivel pedido'))}
        />
      )}
      <ConfirmModal
        open={confirmarBorrar}
        title={`Eliminar el ofrecimiento de ${o.playerName}`}
        message="Se borra la cadena de informes y los contactos apuntados. Los informes ya escritos siguen en la ficha de Captación del jugador."
        confirmLabel="Eliminar"
        onCancel={() => setConfirmarBorrar(false)}
        onConfirm={async () => {
          try { await onDelete(o.id); showToast('Ofrecimiento eliminado'); onClose() }
          catch { showToast('No se pudo eliminar', 'error') }
          finally { setConfirmarBorrar(false) }
        }}
      />
    </div>
  )
}
