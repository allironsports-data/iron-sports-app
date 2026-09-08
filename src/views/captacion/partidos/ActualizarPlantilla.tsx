import { useState, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import type { ScoutingPlayer } from '../../../types'
import { parsearAlineacion, emparejar, cambioDeEquipo, type Emparejamiento } from '../../../lib/lineup'
import { Dialog, Button, IconButton, Field, Input, Textarea } from '../../../components/ui'
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
    <Dialog
      open
      onClose={onClose}
      title="Actualizar plantilla de un club"
      description="Pega la plantilla y la app pone a todos esos jugadores en ese equipo. Para ponerse al día con los fichajes de golpe."
      size="lg"
      historyKey="actualizar-plantilla"
      dirty={texto.trim().length > 0 && !resultado}
      onSubmit={e => { e.preventDefault(); if (equipo.trim() && texto.trim().length >= 5) analizar() }}
    >
        <div className="space-y-3">
          <Field label="Club">
            <Input
              value={equipo}
              onChange={e => setEquipo(e.target.value)}
              list="equipos-conocidos"
              placeholder="Sporting Gijón"
            />
          </Field>
          <datalist id="equipos-conocidos">
            {equiposConocidos.map(t => <option key={t} value={t} />)}
          </datalist>

          <Field label="Plantilla pegada" hint="Ctrl+Enter para analizar">
            <Textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={6}
              placeholder="Pega aquí los nombres — da igual que vengan con dorsal, posición o valor de mercado."
              className="resize-none"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!equipo.trim() || texto.trim().length < 5}>
              Analizar
            </Button>
            {resultado && <span className="text-meta text-slate-500">{resultado.length} nombres detectados</span>}
          </div>

          {cambian.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-badge font-bold text-amber-800">Cambian de equipo · {cambian.length}</span>
                <Button size="sm" onClick={() => void aplicar(cambian, false)} loading={trabajando} className="ml-auto bg-amber-600 text-white border-amber-600 hover:bg-amber-700">
                  {trabajando ? 'Aplicando…' : `Pasarlos a ${equipo}`}
                </Button>
              </div>
              <div className="space-y-0.5">
                {cambian.map(e => (
                  <div key={e.nombre} className="flex items-center gap-1.5 text-badge">
                    <IconButton label={`Pasar solo a ${e.player!.fullName} a ${equipo}`} onClick={() => void aplicar([e], false)} className="text-amber-700"><ArrowRight /></IconButton>
                    <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                    {e.certeza === 'probable' && <span className="text-slate-500">«{e.nombre}»</span>}
                    <span className="text-slate-500 line-through">{e.player!.team || 'sin equipo'}</span>
                    <span className="text-amber-700 font-medium">{equipo}</span>
                    {cambioDeEquipo(e.player!.team, equipo) === 'categoria' && <span className="text-badge text-amber-600">mismo club, otra categoría</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {nuevos.length > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-badge font-bold text-emerald-800">No están en la app · {nuevos.length}</span>
                <Button size="sm" onClick={() => void aplicar(nuevos, true)} loading={trabajando} className="ml-auto bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700">
                  {trabajando ? 'Creando…' : `Crear los ${nuevos.length}`}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {nuevos.map(e => (
                  <button type="button" key={e.nombre} onClick={() => void aplicar([e], true)}
                    className="text-badge bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100">
                    + {e.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {dudosos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <span className="text-badge font-bold text-slate-600">Varios con ese nombre · {dudosos.length}</span>
              <div className="mt-1 space-y-1">
                {dudosos.map(e => (
                  <div key={e.nombre} className="text-badge">
                    <span className="font-semibold text-slate-700">{e.nombre}</span>
                    <span className="text-slate-500"> → </span>
                    {e.candidatos?.map(c => (
                      <button type="button" key={c.id}
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
            <p className="text-meta text-slate-500">{yaEstan.length} ya figuraban en {equipo}</p>
          )}
        </div>
    </Dialog>
  )
}
