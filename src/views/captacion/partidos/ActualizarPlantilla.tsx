import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { ScoutingPlayer } from '../../../types'
import { parsearAlineacion, emparejar, cambioDeEquipo, type Emparejamiento } from '../../../lib/lineup'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { teamMatchKind } from '../../../lib/equipos'
import { type ShowToast } from '../helpers'
// ── ActualizarPlantilla ──────────────────────────────────────────────
// Pegas la plantilla de un club (de Sofascore, BeSoccer, Transfermarkt…)
// y la app pone a todos esos jugadores en ese equipo de una tacada. Es la
// forma rápida de poner al día los fichajes sin ir partido a partido.

export function ActualizarPlantilla({ scoutingPlayers, onClose, onFixTeam, onCreate, showToast }: {
  scoutingPlayers: ScoutingPlayer[]
  onClose: () => void
  onFixTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
  onCreate: (nombre: string, equipo: string) => Promise<void>
  showToast: ShowToast
}) {
  const [equipo, setEquipo] = useState('')
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<Emparejamiento[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  useEscapeKey(onClose)

  const equiposConocidos = useMemo(
    () => Array.from(new Set(scoutingPlayers.map(p => p.team).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [scoutingPlayers])

  function analizar() {
    const nombres = parsearAlineacion(texto, [equipo, ...equiposConocidos], [equipo])
    const mismoEquipo = (a?: string, b?: string) => !!teamMatchKind(a, b)
    setResultado(nombres.map(n => emparejar(n, scoutingPlayers, equipo, mismoEquipo)))
    setHechos(new Set())
  }

  // «Cambian» incluye el mismo club en otra categoría (Villarreal B → Villarreal Juv A)
  const cambian = (resultado ?? []).filter(e => e.player && cambioDeEquipo(e.player.team, equipo) !== 'ninguno' && !hechos.has(e.nombre))
  const yaEstan = (resultado ?? []).filter(e => e.player && cambioDeEquipo(e.player.team, equipo) === 'ninguno')
  const nuevos  = (resultado ?? []).filter(e => e.certeza === 'nuevo' && !hechos.has(e.nombre))
  const dudosos = (resultado ?? []).filter(e => e.certeza === 'ambiguo')

  async function aplicar(lista: Emparejamiento[], crear: boolean) {
    setTrabajando(true)
    let n = 0
    try {
      for (const e of lista) {
        if (crear) await onCreate(e.nombre, equipo)
        else if (e.player) await onFixTeam(e.player, equipo)
        setHechos(h => new Set(h).add(e.nombre))
        n++
      }
      showToast(`${n} jugador${n !== 1 ? 'es' : ''} ${crear ? 'creados en' : 'pasados a'} ${equipo}`)
    } catch {
      showToast('Se ha quedado a medias — vuelve a darle', 'error')
    } finally { setTrabajando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Actualizar plantilla de un club</h3>
            <p className="text-[11px] text-slate-400">
              Pega la plantilla y la app pone a todos esos jugadores en ese equipo. Para ponerse al día con los fichajes de golpe.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto p-1.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Club</label>
            <input
              value={equipo}
              onChange={e => setEquipo(e.target.value)}
              list="equipos-conocidos"
              placeholder="Sporting Gijón"
              className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <datalist id="equipos-conocidos">
              {equiposConocidos.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Plantilla pegada</label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={6}
              placeholder="Pega aquí los nombres — da igual que vengan con dorsal, posición o valor de mercado."
              className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={analizar}
              disabled={!equipo.trim() || texto.trim().length < 5}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40"
            >
              Analizar
            </button>
            {resultado && <span className="text-[11px] text-slate-400">{resultado.length} nombres detectados</span>}
          </div>

          {cambian.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-amber-800">Cambian de equipo · {cambian.length}</span>
                <button
                  onClick={() => void aplicar(cambian, false)}
                  disabled={trabajando}
                  className="ml-auto text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-md disabled:opacity-40"
                >
                  {trabajando ? 'Aplicando…' : `Pasarlos a ${equipo}`}
                </button>
              </div>
              <div className="space-y-0.5">
                {cambian.map(e => (
                  <div key={e.nombre} className="flex items-center gap-1.5 text-[11px]">
                    <button onClick={() => void aplicar([e], false)} className="text-amber-700 font-bold" title="Cambiar solo este">→</button>
                    <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                    {e.certeza === 'probable' && <span className="text-slate-400">«{e.nombre}»</span>}
                    <span className="text-slate-400 line-through">{e.player!.team || 'sin equipo'}</span>
                    <span className="text-amber-700 font-medium">{equipo}</span>
                    {cambioDeEquipo(e.player!.team, equipo) === 'categoria' && <span className="text-[10px] text-amber-600">mismo club, otra categoría</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {nuevos.length > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-emerald-800">No están en la BBDD · {nuevos.length}</span>
                <button
                  onClick={() => void aplicar(nuevos, true)}
                  disabled={trabajando}
                  className="ml-auto text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-md disabled:opacity-40"
                >
                  {trabajando ? 'Creando…' : `Crear los ${nuevos.length}`}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {nuevos.map(e => (
                  <button key={e.nombre} onClick={() => void aplicar([e], true)}
                    className="text-[11px] bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100">
                    + {e.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {dudosos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <span className="text-[11px] font-bold text-slate-600">Varios con ese nombre · {dudosos.length}</span>
              <div className="mt-1 space-y-1">
                {dudosos.map(e => (
                  <div key={e.nombre} className="text-[11px]">
                    <span className="font-semibold text-slate-700">{e.nombre}</span>
                    <span className="text-slate-400"> → </span>
                    {e.candidatos?.map(c => (
                      <button key={c.id}
                        onClick={() => void onFixTeam(c, equipo).then(() => setHechos(h => new Set(h).add(e.nombre)))}
                        className="mr-1 underline decoration-dotted text-slate-600 hover:text-slate-900">
                        {c.fullName} ({c.team || 'sin equipo'})
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {yaEstan.length > 0 && (
            <p className="text-[11px] text-slate-400">✓ {yaEstan.length} ya figuraban en {equipo}</p>
          )}
        </div>
      </div>
    </div>
  )
}
