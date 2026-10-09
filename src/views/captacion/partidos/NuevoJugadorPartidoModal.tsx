// ── Jugador nuevo desde un partido ──────────────────────────────────
//
// En la ficha del partido se busca a quién vincular; si no existe, antes
// había que salir a Jugadores, crearlo y volver. Esto lo crea aquí mismo
// con lo mínimo que hace falta para que la ficha valga (nombre, equipo,
// posición, año) y lo deja vinculado al partido con el informe abierto.

import { useMemo, useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import type { ScoutingMatch, ScoutingPlayer } from '../../../types'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { useDebounce } from '../../../hooks/useDebounce'
import { isValidName } from '../../../lib/validate'
import { buscarJugadoresParecidos } from '../../../lib/duplicados'
import { POSITIONS_SCOUTING } from '../helpers'
import { Spinner } from '../comun'
import { NacionalidadInput } from '../../../components/NacionalidadInput'

const CAMPO = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

export type DatosJugadorNuevo = Omit<ScoutingPlayer, 'id' | 'createdAt'>

export function NuevoJugadorPartidoModal({ match, scoutingPlayers, nombreInicial = '', onClose, onCrear, onVincular }: {
  match: ScoutingMatch
  scoutingPlayers: ScoutingPlayer[]
  nombreInicial?: string
  onClose: () => void
  /** Crea la ficha en Captación (db + estado de App) */
  onCrear: (p: DatosJugadorNuevo) => Promise<ScoutingPlayer>
  /** Si ya existe uno parecido, vincularlo en vez de crear otro */
  onVincular: (p: ScoutingPlayer) => Promise<void> | void
}) {
  const [fullName, setFullName] = useState(nombreInicial)
  const [equipo, setEquipo] = useState<string>(match.homeTeam)
  const [equipoLibre, setEquipoLibre] = useState('')
  const [position1, setPosition1] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [foot, setFoot] = useState('')
  const [nationality, setNationality] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ocultarParecidos, setOcultarParecidos] = useState(false)
  useEscapeKey(onClose)

  const team = equipo === '__otro__' ? equipoLibre.trim() : equipo
  const nombreDeb = useDebounce(fullName, 300)
  const parecidos = useMemo(() => {
    if (ocultarParecidos || nombreDeb.trim().length < 4) return []
    return buscarJugadoresParecidos(nombreDeb, team || undefined, scoutingPlayers)
  }, [nombreDeb, team, scoutingPlayers, ocultarParecidos])

  const valido = isValidName(fullName) && (!birthYear || /^\d{4}$/.test(birthYear))

  async function guardar() {
    if (!valido || guardando) return
    setGuardando(true); setError('')
    try {
      const creado = await onCrear({
        fullName: fullName.trim(),
        team: team || undefined,
        position1: position1 || undefined,
        birthdate: birthYear ? `${birthYear}-01-01` : undefined,
        foot: foot || undefined,
        nationality: nationality.trim() || undefined,
      })
      await onVincular(creado)
      onClose()
    } catch {
      setError('No se pudo crear el jugador. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><UserPlus className="w-4 h-4 text-violet-500" /> Jugador nuevo en Captación</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Se crea su ficha, queda vinculado a <b>{match.homeTeam} – {match.awayTeam}</b> y se abre su informe. El resto de la ficha se completa cuando quieras desde Jugadores.
          </p>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Nombre *</label>
            <input value={fullName} onChange={e => { setFullName(e.target.value); setOcultarParecidos(false) }} placeholder="Nombre y apellidos" className={CAMPO} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') void guardar() }} />
            {parecidos.length > 0 && (
              <div className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 space-y-1">
                <div>¿Es alguno de estos, que ya existe?</div>
                {parecidos.map(x => (
                  <div key={x.player.id} className="flex items-center gap-2">
                    <span className="flex-1"><b>{x.player.fullName}</b>{x.player.team ? ` · ${x.player.team}` : ''}{x.player.birthdate ? ` · ${x.player.birthdate.slice(0, 4)}` : ''}</span>
                    <button type="button" disabled={guardando} onClick={async () => { setGuardando(true); try { await onVincular(x.player); onClose() } finally { setGuardando(false) } }} className="font-semibold underline">Vincular este</button>
                  </div>
                ))}
                <button type="button" onClick={() => setOcultarParecidos(true)} className="text-amber-600 underline">No, es otro</button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Equipo</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {[match.homeTeam, match.awayTeam].map(t => (
                <button key={t} type="button" onClick={() => setEquipo(t)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${equipo === t ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {t}
                </button>
              ))}
              <button type="button" onClick={() => setEquipo('__otro__')}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${equipo === '__otro__' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                Otro
              </button>
            </div>
            {equipo === '__otro__' && <input value={equipoLibre} onChange={e => setEquipoLibre(e.target.value)} placeholder="Nombre del equipo" className={CAMPO} />}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Posición</label>
              <select value={position1} onChange={e => setPosition1(e.target.value)} className={CAMPO}>
                <option value="">—</option>
                {POSITIONS_SCOUTING.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Año de nacimiento</label>
              <input value={birthYear} onChange={e => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2008" inputMode="numeric" className={CAMPO} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Pie</label>
              <select value={foot} onChange={e => setFoot(e.target.value)} className={CAMPO}>
                <option value="">—</option>
                <option value="Derecho">Derecho</option>
                <option value="Izquierdo">Izquierdo</option>
                <option value="Ambidiestro">Ambidiestro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Nacionalidad</label>
              <NacionalidadInput value={nationality} onChange={setNationality} placeholder="Opcional" className={CAMPO} />
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="button" onClick={() => void guardar()} disabled={!valido || guardando}
              className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {guardando && <Spinner />}
              {guardando ? 'Creando…' : 'Crear y vincular'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
