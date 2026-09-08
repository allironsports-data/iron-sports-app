import { useState } from 'react'
import { X, ClipboardPaste, Plus } from 'lucide-react'
import { Button, IconButton, Textarea } from '../../../components/ui'
import type { ScoutingPlayer, ScoutingMatch } from '../../../types'
import { parsearAlineacion, emparejar, cambioDeEquipo, type Emparejamiento } from '../../../lib/lineup'
import { teamMatchKind } from '../../../lib/equipos'

// ── PegarAlineacion ──────────────────────────────────────────────────
// Copias la alineación de Sofascore / Flashscore / BeSoccer, la pegas y la
// app te dice quién de esos jugadores ya está en la BBDD, quién ya está
// vinculado al partido y quién es nuevo — y los vincula de una tacada.

export function PegarAlineacion({ match, scoutingPlayers, linkedPlayerIds, onLink, onCreateAndLink, onFixTeam }: {
  match: ScoutingMatch
  scoutingPlayers: ScoutingPlayer[]
  linkedPlayerIds: string[]
  onLink: (playerId: string) => Promise<void>
  onCreateAndLink: (nombre: string, equipo: string) => Promise<void>
  /** Corrige el equipo del jugador con el del partido */
  onFixTeam: (p: ScoutingPlayer, equipo: string) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [lado, setLado] = useState<'local' | 'visitante'>('local')
  const [resultado, setResultado] = useState<Emparejamiento[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const equipo = lado === 'local' ? match.homeTeam : match.awayTeam

  function analizar() {
    // No son jugadores: los dos equipos del partido ni ningún nombre de
    // club que ya exista en la BBDD (a veces se pega la columna de equipos)
    const equiposConocidos = Array.from(new Set(scoutingPlayers.map(p => p.team).filter(Boolean) as string[]))
    const nombres = parsearAlineacion(texto, [match.homeTeam, match.awayTeam, ...equiposConocidos], [match.homeTeam, match.awayTeam])
    const mismoEquipo = (a?: string, b?: string) => !!teamMatchKind(a, b)
    setResultado(nombres.map(n => emparejar(n, scoutingPlayers, equipo, mismoEquipo)))
    setHechos(new Set())
  }

  const yaVinculado = (p: ScoutingPlayer | null) => !!p && linkedPlayerIds.includes(p.id)

  async function vincularTodos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) {
        if (e.player && !yaVinculado(e.player)) {
          await onLink(e.player.id)
          setHechos(h => new Set(h).add(e.nombre))
        }
      }
    } finally { setTrabajando(false) }
  }

  async function crearTodos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) {
        await onCreateAndLink(e.nombre, equipo)
        setHechos(h => new Set(h).add(e.nombre))
      }
    } finally { setTrabajando(false) }
  }

  if (!abierto) {
    return (
      <div className="border-t border-slate-100 pt-3">
        <Button size="sm" variant="secondary" icon={<ClipboardPaste />} onClick={() => setAbierto(true)} className="border-dashed whitespace-normal text-left h-auto py-1.5">
          Pegar alineación
          <span className="font-normal text-slate-500">de Sofascore, Flashscore, BeSoccer…</span>
        </Button>
      </div>
    )
  }

  const enBbdd = (resultado ?? []).filter(e => e.player && !yaVinculado(e.player) && !hechos.has(e.nombre))
  const vinculados = (resultado ?? []).filter(e => (e.player && yaVinculado(e.player)) || hechos.has(e.nombre))
  const ambiguos = (resultado ?? []).filter(e => e.certeza === 'ambiguo')
  const nuevos = (resultado ?? []).filter(e => e.certeza === 'nuevo' && !hechos.has(e.nombre))
  // Jugadores que SÍ están en la BBDD pero con otro equipo: la alineación es
  // una fuente fiable para corregirlo (juegan ahí hoy)
  // Cuenta también el mismo club en otra categoría (Juv B → Juv A): antes
  // solo se detectaba el cambio de club y esos ascensos se quedaban sin corregir
  const conEquipoDistinto = (resultado ?? []).filter(e => e.player && cambioDeEquipo(e.player.team, equipo) !== 'ninguno')

  async function corregirEquipos(lista: Emparejamiento[]) {
    setTrabajando(true)
    try {
      for (const e of lista) if (e.player) await onFixTeam(e.player, equipo)
    } finally { setTrabajando(false) }
  }

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-badge font-semibold text-slate-500 uppercase tracking-wide"><ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" /> Pegar alineación</span>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {(['local', 'visitante'] as const).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLado(l)}
              className={`px-2 py-0.5 rounded-md text-badge font-medium transition-colors ${
                lado === l ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {l === 'local' ? match.homeTeam : match.awayTeam}
            </button>
          ))}
        </div>
        <IconButton label="Cerrar el pegado de alineación" onClick={() => { setAbierto(false); setTexto(''); setResultado(null) }} className="ml-auto">
          <X />
        </IconButton>
      </div>

      <Textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        aria-label="Alineación pegada"
        placeholder={`Pega aquí la alineación del ${equipo} tal cual la copies de la web — da igual el formato: dorsales, minutos y notas se ignoran solos.`}
        className="resize-none"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={analizar} disabled={texto.trim().length < 5}>
          Analizar
        </Button>
        {resultado && (
          <span className="text-badge text-slate-500">
            {resultado.length} nombre{resultado.length !== 1 ? 's' : ''} detectado{resultado.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {resultado && resultado.length === 0 && (
        <p className="text-badge text-amber-600">No he reconocido ningún nombre. Copia solo el bloque de la alineación, sin las estadísticas.</p>
      )}

      {enBbdd.length > 0 && (
        <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-badge font-bold text-violet-700">Ya en la app · {enBbdd.length}</span>
            <button
              onClick={() => void vincularTodos(enBbdd)}
              disabled={trabajando}
              className="ml-auto text-badge font-bold text-white bg-violet-600 hover:bg-violet-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Vinculando…' : `Vincular los ${enBbdd.length}`}
            </button>
          </div>
          <div className="space-y-0.5">
            {enBbdd.map(e => {
              const cambio = cambioDeEquipo(e.player!.team, equipo)
              return (
                <div key={e.nombre} className="flex items-center gap-1.5 text-badge">
                  <IconButton label={`Vincular a ${e.player!.fullName} a este partido`} onClick={() => void vincularTodos([e])} className="text-violet-600"><Plus /></IconButton>
                  <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                  {/* Lo que pegaste, si no coincide letra por letra: así ves de un
                      vistazo si el emparejamiento es el bueno */}
                  {e.certeza === 'probable' && <span className="text-slate-500">«{e.nombre}»</span>}
                  {cambio !== 'ninguno' ? (
                    <button
                      onClick={() => void onFixTeam(e.player!, equipo)}
                      className="inline-flex items-center gap-1 text-badge text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                      title={cambio === 'categoria'
                        ? `Mismo club, otra categoría: en la app figura en ${e.player!.team} — pásalo a ${equipo}`
                        : `En la app figura en ${e.player!.team || 'sin equipo'} — pásalo a ${equipo}`}
                    >
                      <span className="line-through text-amber-500">{e.player!.team || 'sin equipo'}</span>
                      → {equipo}
                    </button>
                  ) : (
                    <span className="text-slate-500 truncate">{e.player!.team}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nuevos.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-badge font-bold text-emerald-700">No están en la app · {nuevos.length}</span>
            <button
              onClick={() => void crearTodos(nuevos)}
              disabled={trabajando}
              className="ml-auto text-badge font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Creando…' : `Crear los ${nuevos.length} en ${equipo}`}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {nuevos.map(e => (
              <button
                key={e.nombre}
                onClick={() => void crearTodos([e])}
                className="text-badge bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100"
                title={`Crear «${e.nombre}» en ${equipo} y vincularlo`}
              >
                + {e.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {ambiguos.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2">
          <span className="text-badge font-bold text-amber-700">Hay varios con ese nombre · {ambiguos.length}</span>
          <div className="mt-1 space-y-1">
            {ambiguos.map(e => (
              <div key={e.nombre} className="text-badge">
                <span className="font-semibold text-slate-700">{e.nombre}</span>
                <span className="text-slate-500"> → </span>
                {e.candidatos?.map(c => (
                  <button
                    key={c.id}
                    onClick={() => void onLink(c.id).then(() => setHechos(h => new Set(h).add(e.nombre)))}
                    className="mr-1 underline decoration-dotted text-amber-800 hover:text-amber-900"
                  >
                    {c.fullName} ({c.team || 'sin equipo'})
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {conEquipoDistinto.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50/70 border border-amber-200 rounded-lg px-2 py-1.5">
          <span className="text-badge text-amber-800">
            {conEquipoDistinto.length} figura{conEquipoDistinto.length !== 1 ? 'n' : ''} en la app con otro equipo
            {conEquipoDistinto.some(e => cambioDeEquipo(e.player!.team, equipo) === 'categoria') && ' (alguno en otra categoría del mismo club)'}
          </span>
          <button
            onClick={() => void corregirEquipos(conEquipoDistinto)}
            disabled={trabajando}
            className="ml-auto text-badge font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-md disabled:opacity-40"
          >
            {trabajando ? 'Corrigiendo…' : `Pasarlos a ${equipo}`}
          </button>
        </div>
      )}

      {vinculados.length > 0 && (
        <p className="text-badge text-slate-500">{vinculados.length} ya vinculado{vinculados.length !== 1 ? 's' : ''} a este partido</p>
      )}
    </div>
  )
}
