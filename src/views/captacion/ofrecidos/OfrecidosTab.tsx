import { useEffect, useMemo, useState } from 'react'
import { Inbox, Plus, Search, X } from 'lucide-react'
import type { Profile } from '../../../contexts/AuthContext'
import type { Ofrecimiento, OfrecimientoOrigen, ScoutingInfo, ScoutingPlayer, ScoutingReport } from '../../../types'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useDebounce } from '../../../hooks/useDebounce'
import { EmptyState } from '../../../components/EmptyState'
import { ORIGEN_LABEL, ORIGENES, estadoVisible, estaCerrado, ordenLista, pasosPendientes, diasHastaLimite } from '../../../lib/ofrecidos'
import { type ShowToast, todayISO, fmtDate } from '../helpers'
import { Avatar, EstadoChip, ESTADO_BORDE, OrigenChip, TipoChip } from './comun'
import { OfrecidoFicha, type PatchOfrecimiento } from './OfrecidoFicha'
import { OfrecidoFormModal } from './OfrecidoFormModal'

// ── Pestaña Ofrecidos ───────────────────────────────────────────────
// Una línea por jugador. Todo lo demás (condiciones, cadena, informes,
// contactos) está en la ficha, que se abre al pulsar la fila.

type Filtro = 'abiertos' | 'decidir' | 'cerrados'

export interface OfrecidosTabProps {
  ofrecimientos: Ofrecimiento[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingInfos: ScoutingInfo[]
  onCreate: (o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Ofrecimiento>
  onPatch: PatchOfrecimiento
  onDelete: (id: string) => Promise<void>
  onAddPlayer: (p: ScoutingPlayer) => void
  onAddReport: (r: ScoutingReport) => void
  onAddInfo: (i: ScoutingInfo) => void
  abrirJugador: (id: string) => void
  showToast: ShowToast
  /** Abrir una ficha concreta al entrar (desde Mi día, la campana…) */
  openId?: string | null
  onOpenConsumed?: () => void
  /** Filtro de origen al entrar (acceso directo desde Boulema) */
  origenInicial?: OfrecimientoOrigen | null
  onOrigenConsumed?: () => void
}

export function OfrecidosTab({
  ofrecimientos, profiles, currentProfile, scoutingPlayers, scoutingReports, scoutingInfos,
  onCreate, onPatch, onDelete, onAddPlayer, onAddReport, onAddInfo, abrirJugador, showToast,
  openId, onOpenConsumed, origenInicial, onOrigenConsumed,
}: OfrecidosTabProps) {
  const hoy = todayISO()
  const esAncha = useIsDesktop(760)
  const yo = currentProfile.avatar

  const [filtro, setFiltro] = useState<Filtro>('abiertos')
  const [soloMios, setSoloMios] = useState<boolean | null>(null)
  const [origen, setOrigen] = useState<OfrecimientoOrigen | 'all'>('all')
  const [busqueda, setBusqueda] = useState('')
  const busquedaDeb = useDebounce(busqueda)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<Ofrecimiento | null>(null)

  // Navegación externa
  useEffect(() => {
    if (openId) {
      const o = ofrecimientos.find(x => x.id === openId)
      if (o) { setFichaId(o.id); if (estaCerrado(o)) setFiltro('cerrados') }
      onOpenConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])
  useEffect(() => {
    if (origenInicial) { setOrigen(origenInicial); onOrigenConsumed?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenInicial])

  // «Solo los míos» por defecto si llevo alguno o me han pedido algo
  const esMio = (o: Ofrecimiento) => o.responsable === yo || pasosPendientes(o).some(p => p.paso.avatar === yo)
  const tengoAlguno = useMemo(() => ofrecimientos.some(o => !estaCerrado(o) && esMio(o)), [ofrecimientos, yo]) // eslint-disable-line react-hooks/exhaustive-deps
  const soloMiosActivo = soloMios ?? tengoAlguno

  const conteo = useMemo(() => {
    let abiertos = 0, decidir = 0, cerrados = 0
    for (const o of ofrecimientos) {
      if (estaCerrado(o)) cerrados++
      else if (o.estado === 'decidir') decidir++
      else abiertos++
    }
    return { abiertos, decidir, cerrados }
  }, [ofrecimientos])

  const lista = useMemo(() => {
    const q = busquedaDeb.trim().toLowerCase()
    return ofrecimientos
      .filter(o => {
        if (filtro === 'cerrados') { if (!estaCerrado(o)) return false }
        else if (filtro === 'decidir') { if (o.estado !== 'decidir' || estaCerrado(o)) return false }
        else if (estaCerrado(o) || o.estado === 'decidir') return false
        if (soloMiosActivo && !esMio(o)) return false
        if (origen !== 'all' && o.origen !== origen) return false
        if (q && !`${o.playerName} ${o.team ?? ''} ${o.ofreceNombre ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => ordenLista(a, b, hoy))
  }, [ofrecimientos, filtro, soloMiosActivo, origen, busquedaDeb, hoy, yo]) // eslint-disable-line react-hooks/exhaustive-deps

  const ficha = fichaId ? ofrecimientos.find(o => o.id === fichaId) : undefined

  const guardarNuevo = async (o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>) => {
    const creado = await onCreate(o)
    setNuevo(false)
    showToast('Ofrecimiento creado')
    setFichaId(creado.id)
  }

  function Pendiente({ o }: { o: Ofrecimiento }) {
    if (estaCerrado(o)) return <span className="text-[11px] text-slate-400">cerrado {o.decididoAt ? fmtDate(o.decididoAt) : ''}</span>
    const pend = pasosPendientes(o)
    if (o.estado === 'decidir' && pend.length === 0) return <span className="text-[11px] text-slate-400">{o.niveles.length} nivel{o.niveles.length !== 1 ? 'es' : ''} · todo contestado</span>
    if (pend.length === 0) return <span className="text-[11px] text-slate-400">{o.niveles.length ? 'todo contestado' : 'sin pedir'}</span>
    const avatares = [...new Set(pend.map(p => p.paso.avatar))].slice(0, 3)
    const tipos = [...new Set(pend.map(p => p.paso.tipo))]
    return (
      <span className="flex items-center gap-1 flex-wrap">
        {avatares.map(a => <Avatar key={a} avatar={a} profiles={profiles} primario={a === yo} />)}
        {pend.length > 3 && <span className="text-[10px] text-slate-400">+{pend.length - 3}</span>}
        {tipos.map(t => <TipoChip key={t} tipo={t} small />)}
      </span>
    )
  }

  function Limite({ o }: { o: Ofrecimiento }) {
    const d = diasHastaLimite(o, hoy)
    if (d === null || estaCerrado(o)) return <span className="text-[11px] text-slate-300">—</span>
    const urgente = d <= 3
    return <span className={`text-[11px] font-semibold ${urgente ? 'text-red-600' : 'text-slate-500'}`}>{fmtDate(o.fechaLimite).replace(/ \d{4}$/, '')}</span>
  }

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-3">
        {/* ── filtros ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {([['abiertos', 'Abiertos', conteo.abiertos], ['decidir', 'Decidir', conteo.decidir], ['cerrados', 'Cerrados', conteo.cerrados]] as [Filtro, string, number][]).map(([id, label, n]) => (
              <button key={id} onClick={() => setFiltro(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${filtro === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label} <span className={`ml-0.5 text-[10px] ${filtro === id ? 'text-slate-400' : 'text-slate-400'}`}>{n}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setSoloMios(!soloMiosActivo)} title="Los que llevo yo o en los que me han pedido informe"
            className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors ${soloMiosActivo ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            Solo los míos
          </button>
          <select value={origen} onChange={e => setOrigen(e.target.value as OfrecimientoOrigen | 'all')} aria-label="Origen"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
            <option value="all">Todos los orígenes</option>
            {ORIGENES.map(o => <option key={o} value={o}>{ORIGEN_LABEL[o]}</option>)}
          </select>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Jugador, equipo, quién ofrece…"
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            {busqueda && <button onClick={() => setBusqueda('')} aria-label="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex-1" />
          <button onClick={() => setNuevo(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>

        {/* ── lista ── */}
        {ofrecimientos.length === 0 ? (
          <EmptyState icon={<Inbox className="w-8 h-8 text-slate-300" />} title="Sin ofrecimientos"
            subtitle="Cuando alguien nos ofrezca un jugador, apúntalo aquí: quién lo ofrece, qué pide y a quién le pedimos informe." />
        ) : lista.length === 0 ? (
          <EmptyState icon={<Inbox className="w-8 h-8 text-slate-300" />} title="Nada con estos filtros" />
        ) : esAncha ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[minmax(220px,1.6fr)_1.1fr_56px_110px_1.2fr_70px] gap-2.5 px-3.5 py-2 bg-slate-50 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <span>Jugador</span><span>Ofrece</span><span>Resp.</span><span>Estado</span><span>Pendiente de</span><span className="text-right">Límite</span>
            </div>
            {lista.map(o => {
              const e = estadoVisible(o, hoy)
              return (
                <button key={o.id} onClick={() => setFichaId(o.id)}
                  className={`w-full text-left grid grid-cols-[minmax(220px,1.6fr)_1.1fr_56px_110px_1.2fr_70px] gap-2.5 items-center px-3.5 py-2 border-t border-slate-100 border-l-[3px] hover:bg-slate-50 transition-colors ${ESTADO_BORDE[e.clave]} ${estaCerrado(o) ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-slate-800 truncate">{o.playerName}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{[o.position, o.birthYear, o.team].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span className="min-w-0 truncate"><OrigenChip origen={o.origen} nombre={o.ofreceNombre} /></span>
                  <span>{o.responsable ? <Avatar avatar={o.responsable} profiles={profiles} primario /> : <span className="text-[10px] text-amber-600 font-semibold">sin</span>}</span>
                  <span><EstadoChip e={e} /></span>
                  <span className="min-w-0"><Pendiente o={o} /></span>
                  <span className="text-right"><Limite o={o} /></span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {lista.map(o => {
              const e = estadoVisible(o, hoy)
              return (
                <button key={o.id} onClick={() => setFichaId(o.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-t first:border-t-0 border-slate-100 border-l-[3px] ${ESTADO_BORDE[e.clave]} ${estaCerrado(o) ? 'opacity-60' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-slate-800 truncate">{o.playerName}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{[o.position, o.birthYear, o.team].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <EstadoChip e={e} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {ficha && (
        <OfrecidoFicha
          ofrecimiento={ficha}
          profiles={profiles} currentProfile={currentProfile}
          scoutingPlayers={scoutingPlayers} scoutingReports={scoutingReports} scoutingInfos={scoutingInfos}
          onClose={() => setFichaId(null)}
          onPatch={onPatch} onDelete={onDelete}
          onEdit={() => setEditando(ficha)}
          onAddPlayer={onAddPlayer} onAddReport={onAddReport} onAddInfo={onAddInfo}
          abrirJugador={abrirJugador} showToast={showToast}
        />
      )}
      {nuevo && (
        <OfrecidoFormModal
          profiles={profiles} currentProfile={currentProfile} scoutingPlayers={scoutingPlayers} ofrecimientos={ofrecimientos}
          onClose={() => setNuevo(false)} onSave={guardarNuevo}
        />
      )}
      {editando && (
        <OfrecidoFormModal
          profiles={profiles} currentProfile={currentProfile} scoutingPlayers={scoutingPlayers} ofrecimientos={ofrecimientos}
          initial={editando}
          onClose={() => setEditando(null)}
          onSave={async (o) => {
            await onPatch(editando.id, x => ({ ...x, ...o, niveles: x.niveles, contactos: x.contactos, estado: x.estado }))
            setEditando(null)
            showToast('Ofrecimiento actualizado')
          }}
        />
      )}
    </div>
  )
}
