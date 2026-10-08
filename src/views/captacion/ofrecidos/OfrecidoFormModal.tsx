import { useMemo, useState } from 'react'
import { Inbox, Link2 } from 'lucide-react'
import type { Profile } from '../../../contexts/AuthContext'
import type { Ofrecimiento, OfrecimientoOrigen, OfrecimientoOperacion, ScoutingPlayer, TipoInformePedido } from '../../../types'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { buscarJugadoresParecidos } from '../../../lib/duplicados'
import { ORIGENES, ORIGEN_LABEL, OPERACIONES, OPERACION_LABEL, conNivelNuevo } from '../../../lib/ofrecidos'
import { FormRow, Spinner } from '../comun'
import { POSITIONS_SCOUTING, MONTHS_ES } from '../helpers'
import { INPUT, Modal, PickPersonas, PickTipos } from './comun'

// ── Alta y edición de un ofrecimiento ───────────────────────────────
// Al crear, se puede pedir ya el nivel 1 (personas + tipos). Al editar,
// solo se tocan los datos: la cadena se lleva desde la ficha.

type Datos = Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt' | 'niveles' | 'contactos' | 'estado'>

export function OfrecidoFormModal({
  profiles, currentProfile, scoutingPlayers, ofrecimientos, initial, onClose, onSave,
}: {
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  ofrecimientos: Ofrecimiento[]
  initial?: Ofrecimiento
  onClose: () => void
  onSave: (o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [playerName, setPlayerName] = useState(initial?.playerName ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? '')
  const [birthMonth, setBirthMonth] = useState(initial?.birthMonth ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [nationality, setNationality] = useState(initial?.nationality ?? '')
  const [scoutingPlayerId, setScoutingPlayerId] = useState(initial?.scoutingPlayerId ?? '')
  const [descartadoVinculo, setDescartadoVinculo] = useState(false)

  const [origen, setOrigen] = useState<OfrecimientoOrigen>(initial?.origen ?? 'agente')
  const [ofreceNombre, setOfreceNombre] = useState(initial?.ofreceNombre ?? '')
  const [ofreceContacto, setOfreceContacto] = useState(initial?.ofreceContacto ?? '')

  const [condOperacion, setCondOperacion] = useState<OfrecimientoOperacion | ''>(initial?.condOperacion ?? '')
  const [condCoste, setCondCoste] = useState(initial?.condCoste ?? '')
  const [condSalario, setCondSalario] = useState(initial?.condSalario ?? '')
  const [condComision, setCondComision] = useState(initial?.condComision ?? '')
  const [condFinContrato, setCondFinContrato] = useState(initial?.condFinContrato ?? '')
  const [fechaLimite, setFechaLimite] = useState(initial?.fechaLimite ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const [responsable, setResponsable] = useState<string[]>(initial?.responsable ? [initial.responsable] : [currentProfile.avatar])

  // Solo al crear: nivel 1
  const [pedirA, setPedirA] = useState<string[]>([])
  const [tipos, setTipos] = useState<TipoInformePedido[]>(['tecnico'])
  const [mensaje, setMensaje] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEscapeKey(onClose)

  // ¿Ya existe en Captación? Se propone vincular para no duplicar fichas
  const vinculado = scoutingPlayerId ? scoutingPlayers.find(p => p.id === scoutingPlayerId) : undefined
  const parecidos = useMemo(() => {
    if (vinculado || descartadoVinculo || playerName.trim().length < 3) return []
    return buscarJugadoresParecidos(playerName, team || undefined, scoutingPlayers, 3)
  }, [playerName, team, scoutingPlayers, vinculado, descartadoVinculo])

  // Nombres ya usados en «quién lo ofrece», para el autocompletado
  const nombresOfrece = useMemo(() => {
    const s = new Set<string>()
    for (const o of ofrecimientos) if (o.ofreceNombre) s.add(o.ofreceNombre)
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [ofrecimientos])

  function elegirOrigen(o: OfrecimientoOrigen) {
    setOrigen(o)
    if (o === 'boulema' && !ofreceNombre) setOfreceNombre('Boulema')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playerName.trim() || saving) return
    setSaving(true); setError('')
    const v = (s: string) => s.trim() || undefined
    const datos: Datos = {
      playerName: playerName.trim(),
      position: v(position), birthYear: v(birthYear), birthMonth: v(birthMonth),
      team: v(team), country: v(country), nationality: v(nationality),
      scoutingPlayerId: scoutingPlayerId || undefined,
      origen, ofreceNombre: v(ofreceNombre), ofreceContacto: v(ofreceContacto),
      condOperacion: condOperacion || undefined,
      condCoste: v(condCoste), condSalario: v(condSalario), condComision: v(condComision),
      condFinContrato: v(condFinContrato), fechaLimite: v(fechaLimite), notes: v(notes),
      responsable: responsable[0],
      decididoPor: initial?.decididoPor, decididoAt: initial?.decididoAt, decisionNota: initial?.decisionNota,
      createdBy: initial?.createdBy ?? currentProfile.avatar,
    }
    try {
      let o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'> = {
        ...datos,
        estado: initial?.estado ?? 'abierto',
        niveles: initial?.niveles ?? [],
        contactos: initial?.contactos ?? [],
      }
      if (!initial && pedirA.length && tipos.length) {
        const pedir = pedirA.flatMap(av => tipos.map(tipo => ({ avatar: av, tipo })))
        o = conNivelNuevo({ ...o, id: '', createdAt: '', updatedAt: '' }, currentProfile.avatar, pedir, mensaje)
      }
      await onSave(o)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo={initial ? 'Editar ofrecimiento' : 'Nuevo ofrecimiento'} icono={<Inbox className="w-4 h-4 text-slate-400" />} onClose={onClose} ancho="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-3">
        <FormRow label="Jugador *">
          <input value={playerName} onChange={e => { setPlayerName(e.target.value); setDescartadoVinculo(false) }} placeholder="Nombre del jugador" className={INPUT} required autoFocus />
          {vinculado ? (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span className="flex-1">Vinculado a <b>{vinculado.fullName}</b>{vinculado.team ? ` (${vinculado.team})` : ''} de Captación</span>
              <button type="button" onClick={() => setScoutingPlayerId('')} className="underline">Quitar</button>
            </div>
          ) : parecidos.length > 0 && (
            <div className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 space-y-1">
              <div>¿Es alguno de estos, ya en Captación?</div>
              {parecidos.map(p => (
                <div key={p.player.id} className="flex items-center gap-2">
                  <span className="flex-1"><b>{p.player.fullName}</b>{p.player.team ? ` · ${p.player.team}` : ''}{p.player.birthdate ? ` · ${p.player.birthdate.slice(0, 4)}` : ''}</span>
                  <button type="button" onClick={() => {
                    setScoutingPlayerId(p.player.id)
                    if (!position && p.player.position1) setPosition(p.player.position1)
                    if (!team && p.player.team) setTeam(p.player.team)
                    if (!birthYear && p.player.birthdate) setBirthYear(p.player.birthdate.slice(0, 4))
                    if (!nationality && p.player.nationality) setNationality(p.player.nationality)
                  }} className="font-semibold underline">Vincular</button>
                </div>
              ))}
              <button type="button" onClick={() => setDescartadoVinculo(true)} className="text-amber-600 underline">No, es otro</button>
            </div>
          )}
        </FormRow>

        <div className="grid grid-cols-3 gap-2">
          <FormRow label="Posición">
            <select value={position} onChange={e => setPosition(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormRow>
          <FormRow label="Año nac.">
            <input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2007" maxLength={4} className={INPUT} />
          </FormRow>
          <FormRow label="Mes nac.">
            <select value={birthMonth} onChange={e => setBirthMonth(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {MONTHS_ES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FormRow label="Equipo"><input value={team} onChange={e => setTeam(e.target.value)} placeholder="Club actual" className={INPUT} /></FormRow>
          <FormRow label="País"><input value={country} onChange={e => setCountry(e.target.value)} placeholder="Donde juega" className={INPUT} /></FormRow>
          <FormRow label="Nacionalidad"><input value={nationality} onChange={e => setNationality(e.target.value)} className={INPUT} /></FormRow>
        </div>

        <FormRow label="Quién lo ofrece">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ORIGENES.map(o => (
              <button key={o} type="button" onClick={() => elegirOrigen(o)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${origen === o ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {ORIGEN_LABEL[o]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input value={ofreceNombre} onChange={e => setOfreceNombre(e.target.value)} placeholder="Nombre (agente, club, padre…)" list="ofrece-sugerencias" className={INPUT} />
              <datalist id="ofrece-sugerencias">{nombresOfrece.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <input value={ofreceContacto} onChange={e => setOfreceContacto(e.target.value)} placeholder="Teléfono / email" className={INPUT} />
          </div>
        </FormRow>

        <FormRow label="Condiciones pedidas">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {OPERACIONES.map(op => (
              <button key={op} type="button" onClick={() => setCondOperacion(condOperacion === op ? '' : op)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${condOperacion === op ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {OPERACION_LABEL[op]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={condCoste} onChange={e => setCondCoste(e.target.value)} placeholder="Coste" className={INPUT} />
            <input value={condSalario} onChange={e => setCondSalario(e.target.value)} placeholder="Salario" className={INPUT} />
            <input value={condComision} onChange={e => setCondComision(e.target.value)} placeholder="Comisión" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input value={condFinContrato} onChange={e => setCondFinContrato(e.target.value)} placeholder="Fin de contrato actual" className={INPUT} />
            <div>
              <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} className={INPUT} aria-label="Fecha límite para contestar" />
              <p className="text-[10.5px] text-slate-400 mt-0.5">Fecha límite para contestar</p>
            </div>
          </div>
        </FormRow>

        <FormRow label="Responsable">
          <PickPersonas profiles={profiles} value={responsable} onChange={setResponsable} soloUna />
          <p className="text-[11px] text-slate-400 mt-1">Recibe aviso y lo ve en Mi día.</p>
        </FormRow>

        {!initial && (
          <FormRow label="Nivel 1 · pedir informe a">
            <PickPersonas profiles={profiles} value={pedirA} onChange={setPedirA} />
            <div className="mt-2"><PickTipos value={tipos} onChange={setTipos} /></div>
            {pedirA.length > 0 && (
              <input value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder="Mensaje para quien escribe (opcional)" className={`${INPUT} mt-2`} />
            )}
            <p className="text-[11px] text-slate-400 mt-1">Se puede dejar vacío y pedirlo después desde la ficha. Cada persona marcada recibe un pendiente por cada tipo.</p>
          </FormRow>
        )}

        <FormRow label="Notas / contexto">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Por qué nos lo ofrecen, prisas, contexto…" className={`${INPUT} resize-y`} />
        </FormRow>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white -mx-5 -mb-5 px-5 pb-5 safe-area-bottom">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={!playerName.trim() || saving}
            className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {saving && <Spinner />}
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear ofrecimiento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
