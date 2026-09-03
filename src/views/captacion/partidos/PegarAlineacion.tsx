import { useState } from 'react'
import { X } from 'lucide-react'
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
        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-violet-400 hover:text-violet-600 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          📋 Pegar alineación
          <span className="font-normal text-slate-400">de Sofascore, Flashscore, BeSoccer…</span>
        </button>
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
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">📋 Pegar alineación</span>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {(['local', 'visitante'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLado(l)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                lado === l ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {l === 'local' ? match.homeTeam : match.awayTeam}
            </button>
          ))}
        </div>
        <button onClick={() => { setAbierto(false); setTexto(''); setResultado(null) }} className="ml-auto text-slate-400 hover:text-slate-600" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        placeholder={`Pega aquí la alineación del ${equipo} tal cual la copies de la web — da igual el formato: dorsales, minutos y notas se ignoran solos.`}
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={analizar}
          disabled={texto.trim().length < 5}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40"
        >
          Analizar
        </button>
        {resultado && (
          <span className="text-[11px] text-slate-400">
            {resultado.length} nombre{resultado.length !== 1 ? 's' : ''} detectado{resultado.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {resultado && resultado.length === 0 && (
        <p className="text-[11px] text-amber-600">No he reconocido ningún nombre. Copia solo el bloque de la alineación, sin las estadísticas.</p>
      )}

      {enBbdd.length > 0 && (
        <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-violet-700">Ya en la BBDD · {enBbdd.length}</span>
            <button
              onClick={() => void vincularTodos(enBbdd)}
              disabled={trabajando}
              className="ml-auto text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Vinculando…' : `Vincular los ${enBbdd.length}`}
            </button>
          </div>
          <div className="space-y-0.5">
            {enBbdd.map(e => {
              const cambio = cambioDeEquipo(e.player!.team, equipo)
              return (
                <div key={e.nombre} className="flex items-center gap-1.5 text-[11px]">
                  <button onClick={() => void vincularTodos([e])} className="text-violet-600 font-bold" title="Vincular a este partido">+</button>
                  <span className="font-semibold text-slate-700">{e.player!.fullName}</span>
                  {/* Lo que pegaste, si no coincide letra por letra: así ves de un
                      vistazo si el emparejamiento es el bueno */}
                  {e.certeza === 'probable' && <span className="text-slate-400">«{e.nombre}»</span>}
                  {cambio !== 'ninguno' ? (
                    <button
                      onClick={() => void onFixTeam(e.player!, equipo)}
                      className="inline-flex items-center gap-1 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                      title={cambio === 'categoria'
                        ? `Mismo club, otra categoría: en la BBDD figura en ${e.player!.team} — pásalo a ${equipo}`
                        : `En la BBDD figura en ${e.player!.team || 'sin equipo'} — pásalo a ${equipo}`}
                    >
                      <span className="line-through text-amber-500">{e.player!.team || 'sin equipo'}</span>
                      → {equipo}
                    </button>
                  ) : (
                    <span className="text-slate-400 truncate">{e.player!.team}</span>
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
            <span className="text-[11px] font-bold text-emerald-700">No están en la BBDD · {nuevos.length}</span>
            <button
              onClick={() => void crearTodos(nuevos)}
              disabled={trabajando}
              className="ml-auto text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-md disabled:opacity-40"
            >
              {trabajando ? 'Creando…' : `Crear los ${nuevos.length} en ${equipo}`}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {nuevos.map(e => (
              <button
                key={e.nombre}
                onClick={() => void crearTodos([e])}
                className="text-[11px] bg-white border border-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 hover:bg-emerald-100"
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
          <span className="text-[11px] font-bold text-amber-700">Hay varios con ese nombre · {ambiguos.length}</span>
          <div className="mt-1 space-y-1">
            {ambiguos.map(e => (
              <div key={e.nombre} className="text-[11px]">
                <span className="font-semibold text-slate-700">{e.nombre}</span>
                <span className="text-slate-400"> → </span>
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
          <span className="text-[11px] text-amber-800">
            {conEquipoDistinto.length} figura{conEquipoDistinto.length !== 1 ? 'n' : ''} en la BBDD con otro equipo
            {conEquipoDistinto.some(e => cambioDeEquipo(e.player!.team, equipo) === 'categoria') && ' (alguno en otra categoría del mismo club)'}
          </span>
          <button
            onClick={() => void corregirEquipos(conEquipoDistinto)}
            disabled={trabajando}
            className="ml-auto text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-md disabled:opacity-40"
          >
            {trabajando ? 'Corrigiendo…' : `Pasarlos a ${equipo}`}
          </button>
        </div>
      )}

      {vinculados.length > 0 && (
        <p className="text-[11px] text-slate-400">✓ {vinculados.length} ya vinculado{vinculados.length !== 1 ? 's' : ''} a este partido</p>
      )}
    </div>
  )
}
