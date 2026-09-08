import { useState, useMemo, useCallback } from 'react'
import { Search, Pencil } from 'lucide-react'
import type { ScoutingPlayer, ScoutingAssessment, FirmasEntry } from '../../types'
import { ZONAS, SIN_ZONA, zonaDe, type Zona } from '../../lib/zonas'
import { PITCH_SLOTS, SLOT_LABELS, SLOT_ORDER, slotDe as pitchSlotOf } from '../../lib/campo'
import { norm as normSearch } from '../../lib/texto'
import { BotonCsv } from '../../components/BotonCsv'
import { SELECT_CLS, birthYearFromBirthdate } from './helpers'
import { FIRMAS_CONFIG } from './firmas/helpers'
// ── ContratosTab ─────────────────────────────────────────────
// FIN DE CONTRATO: el campograma de mercado por año de expiración.
// Eliges un año (2026, 2027…) y ves quién se queda libre, colocado por
// posición, con su equipo y su agencia: la versión viva del Excel.

// ── Ligas ────────────────────────────────────────────────────
// Composición real de la temporada 2026-27 (LaLiga EA Sports, Hypermotion
// y los dos grupos de Primera Federación), con los nombres tal y como
// están escritos en la BBDD de Captación. Al cambiar de temporada solo
// hay que retocar estas tres listas.
type Liga = '1ª' | '2ª' | '1ª RFEF'
const LIGA_LISTS: { liga: Liga; teams: string[] }[] = [
  { liga: '1ª', teams: [
    'Barcelona', 'Real Madrid', 'Villarreal', 'Atlético Madrid', 'Atletico Madrid', 'Atlético', 'Atletico',
    'Real Betis', 'Betis', 'Celta', 'Celta de Vigo', 'Real Sociedad', 'Getafe', 'Athletic', 'Athletic Club',
    'Athletic Bilbao', 'Valencia', 'Sevilla', 'Rayo Vallecano', 'Rayo', 'Osasuna', 'Espanyol', 'Alaves',
    'Alavés', 'Levante', 'Elche', 'Racing Santander', 'Racing de Santander', 'Deportivo',
    'Deportivo La Coruña', 'Málaga', 'Malaga',
  ] },
  { liga: '2ª', teams: [
    'Oviedo', 'Real Oviedo', 'Mallorca', 'Girona', 'Almería', 'Almeria', 'Las Palmas', 'Castellón',
    'Castellon', 'Burgos', 'Eibar', 'Córdoba', 'Cordoba', 'Sporting', 'Sporting Gijon', 'Sporting de Gijón',
    'Ceuta', 'Albacete', 'Andorra', 'Granada', 'Real Sociedad B', 'Leganes', 'Leganés', 'Valladolid',
    'Cádiz', 'Cadiz', 'Tenerife', 'Eldense', 'Celta B', 'Celta Fortuna', 'Sabadell',
  ] },
  { liga: '1ª RFEF', teams: [
    'Merida', 'Mérida', 'Arenas', 'Arenas Club', 'Bilbao Athletic', 'Athletic B', 'Barakaldo', 'Coria',
    'Extremadura', 'Lugo', 'Mirandes', 'Mirandés', 'Cacereño', 'Cacereno', 'Cultural Leonesa', 'Pontevedra',
    'Racing Ferrol', 'Deportivo B', 'Deportivo Fabril', 'Fabril', 'Real Avilés', 'Real Aviles', 'Real Union',
    'Real Unión', 'Ponferradina', 'UD Logroñes', 'UD Logroñés', 'Logroñes', 'Logroñés', 'Ourense',
    'Unionistas', 'Zamora', 'Alcorcon', 'Alcorcón', 'Aguilas', 'Águilas', 'Algeciras', 'Antequera',
    'Atlético Madrid B', 'Atletico Madrid B', 'Atlético Madrileño', 'Teruel', 'Europa', 'Rayo Majadahonda',
    'Cartagena', 'Nastic', 'Nàstic', 'Gimnastic', 'Hercules', 'Hércules', 'Juventud Torremolinos',
    'Real Jaen', 'Real Jaén', 'Jaen', 'Real Madrid Castilla', 'Castilla', 'Murcia', 'Real Murcia',
    'Zaragoza', 'Huesca', 'Ibiza', 'UD Ibiza', 'Sant Andreu', 'Villarreal B',
  ] },
]
const TEAM_LIGA: Record<string, Liga> = (() => {
  const m: Record<string, Liga> = {}
  LIGA_LISTS.forEach(({ liga, teams }) => teams.forEach(t => { if (!m[normSearch(t)]) m[normSearch(t)] = liga }))
  return m
})()
const LIGAS: Liga[] = ['1ª', '2ª', '1ª RFEF']
function ligaOf(team?: string): Liga | null {
  return TEAM_LIGA[normSearch(team ?? '')] ?? null
}

/** Fin de contrato en texto libre → fecha y año. Acepta 30/06/2027,
 *  2027-06-30, 30-06-2027, 06/2027, 30/06/27 y un «2027» suelto. */
function parseContract(s?: string): { date: Date | null; year: string | null } {
  const t = (s ?? '').trim()
  if (!t) return { date: null, year: null }
  let m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    return { date: new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)), year: String(y) }
  }
  m = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), year: m[1] }
  m = t.match(/^(\d{1,2})[/\-.](\d{4})$/)            // 06/2027
  if (m) return { date: new Date(+m[2], +m[1] - 1, 30), year: m[2] }
  m = t.match(/(19|20)(\d{2})/)                      // «2027», «junio 2027»
  if (m) return { date: new Date(+`${m[1]}${m[2]}`, 5, 30), year: `${m[1]}${m[2]}` }
  return { date: null, year: null }
}

export function ContratosTab({ players, firmasEntries, isAdmin, onOpenPlayer, onSetContract, onToggleMarketMap, clubZonas, onAbrirZonas }: {
  players: ScoutingPlayer[]
  firmasEntries: FirmasEntry[]
  isAdmin: boolean
  onOpenPlayer: (id: string) => void
  onSetContract: (p: ScoutingPlayer, value: string) => Promise<void>
  onToggleMarketMap: (p: ScoutingPlayer, value: boolean) => Promise<void>
  clubZonas: Record<string, Zona>
  onAbrirZonas: () => void
}) {
  const [view, setView] = useState<'campo' | 'lista'>('lista')
  const [source, setSource] = useState<'mapa' | 'todos'>('mapa')
  const [yearSel, setYearSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [assessFilter, setAssessFilter] = useState<'all' | ScoutingAssessment>('all')
  const [zonaFilter, setZonaFilter] = useState<string>('all')
  const [ligaFilter, setLigaFilter] = useState<Set<string>>(new Set(LIGAS as string[]))
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const all = useMemo(
    () => players.map(p => { const c = parseContract(p.clubContract); return { p, date: c.date, year: c.year, liga: ligaOf(p.team) } }),
    [players]
  )
  const enMapa = useMemo(() => all.filter(e => e.p.marketMap), [all])

  // Estatus en el pipeline (Firmar) de cada jugador, por si está en él
  const firmasByPlayer = useMemo(() => {
    const m: Record<string, FirmasEntry> = {}
    firmasEntries.forEach(e => { if (e.scoutingPlayerId && !m[e.scoutingPlayerId]) m[e.scoutingPlayerId] = e })
    return m
  }, [firmasEntries])

  // Fuente: mi campograma de mercado (los que me has pasado) o toda la
  // BBDD filtrada por liga (1ª, 2ª, 1ª RFEF) para poder añadir jugadores.
  const parsed = useMemo(() => source === 'mapa'
    ? enMapa
    : all.filter(e => ligaFilter.has(e.liga ?? 'otros')),
    [source, enMapa, all, ligaFilter])

  // Solo las tres ventanas que importan (2026, 2027, 2028 — avanza solo
  // cada año). El resto de años cae en «Otros», que solo aparece si hay
  // alguien ahí para que nadie quede escondido.
  const windowYears = useMemo(() => {
    const y0 = new Date().getFullYear()
    return [String(y0), String(y0 + 1), String(y0 + 2)]
  }, [])
  const inWindow = useCallback((y: string | null) => !!y && windowYears.includes(y), [windowYears])

  const { counts, sinFecha, otros } = useMemo(() => {
    const c: Record<string, number> = {}
    windowYears.forEach(y => { c[y] = 0 })
    let sin = 0
    let otr = 0
    parsed.forEach(({ year: y }) => {
      if (!y) sin++
      else if (windowYears.includes(y)) c[y]++
      else otr++
    })
    return { counts: c, sinFecha: sin, otros: otr }
  }, [parsed, windowYears])

  // Año por defecto: la ventana con más jugadores (hoy, 2027)
  const defaultYear = useMemo(
    () => windowYears.reduce((best, y) => counts[y] > counts[best] ? y : best, windowYears[0]),
    [windowYears, counts]
  )
  const year = yearSel ?? defaultYear

  const nq = normSearch(q)
  // Al buscar en toda la BBDD el año se ignora: si buscas a alguien por
  // nombre es para encontrarlo, no para pelearte con el filtro
  const ignoreYear = source === 'todos' && !!nq
  const shown = useMemo(() => parsed.filter(({ p, year: y }) => {
    if (!ignoreYear && (year === 'sin' ? !!y : year === 'otros' ? (!y || inWindow(y)) : y !== year)) return false
    if (assessFilter !== 'all' && p.assessment !== assessFilter) return false
    if (zonaFilter !== 'all' && (zonaDe(p.team, clubZonas) ?? SIN_ZONA) !== zonaFilter) return false
    if (nq && !normSearch(`${p.fullName} ${p.team ?? ''} ${p.agency ?? ''}`).includes(nq)) return false
    return true
  }), [parsed, year, assessFilter, zonaFilter, nq, inWindow, ignoreYear, clubZonas])

  // Zonas presentes en lo que se está mirando (para el desplegable)
  const conteoZonas = useMemo(() => {
    const m: Record<string, number> = {}
    for (const { p } of parsed) {
      const z = zonaDe(p.team, clubZonas) ?? SIN_ZONA
      m[z] = (m[z] ?? 0) + 1
    }
    return m
  }, [parsed, clubZonas])

  // Reparto por posición del campograma
  const { bySlot, sinPos } = useMemo(() => {
    const map: Record<string, typeof shown> = {}
    const sp: typeof shown = []
    shown.forEach(e => {
      const slot = pitchSlotOf(e.p.position1) ?? pitchSlotOf(e.p.position2)
      if (!slot) { sp.push(e); return }
      if (!map[slot]) map[slot] = []
      map[slot].push(e)
    })
    Object.keys(map).forEach(k => map[k].sort((a, b) =>
      (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || a.p.fullName.localeCompare(b.p.fullName)))
    return { bySlot: map, sinPos: sp }
  }, [shown])

  const fmtShort = (d: Date | null) => d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

  const toggleLiga = (l: string) => setLigaFilter(prev => {
    const n = new Set(prev)
    if (n.has(l)) n.delete(l); else n.add(l)
    return n.size ? n : prev            // nunca dejar los cuatro apagados
  })

  async function saveContract(p: ScoutingPlayer) {
    setSaving(true)
    try {
      await onSetContract(p, editValue.trim())
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  // Fila de jugador de la lista
  const playerRow = (e: { p: ScoutingPlayer; date: Date | null; liga: Liga | null }) => {
    const { p } = e
    if (editingId === p.id) {
      return (
        <div key={p.id} className="flex items-center gap-1 px-2 py-1 bg-blue-50/60">
          <input
            value={editValue}
            onChange={ev => setEditValue(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') void saveContract(p); if (ev.key === 'Escape') setEditingId(null) }}
            placeholder="30/06/2027"
            autoFocus
            className="flex-1 min-w-0 text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button onClick={() => setEditingId(null)} className="px-1.5 py-1 text-[11px] text-slate-500 hover:bg-white rounded">✕</button>
          <button onClick={() => void saveContract(p)} disabled={saving}
            className="px-2 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-40">OK</button>
        </div>
      )
    }
    return (
      <div key={p.id} className="group flex items-center gap-1.5 px-2 py-1 hover:bg-slate-50 transition-colors">
        <button onClick={() => onOpenPlayer(p.id)} className="min-w-0 flex-1 text-left">
          <span className="block text-[11.5px] font-semibold text-slate-800 truncate">
            {p.fullName}
            {p.birthdate && <span className="text-slate-400 font-medium"> '{p.birthdate.slice(2, 4)}</span>}
          </span>
          <span className="block text-[10.5px] text-slate-400 truncate">
            {e.liga && <span className="text-slate-500 font-semibold">{e.liga}</span>}
            {e.liga ? ' · ' : ''}{p.team || '—'}{p.agency ? ` · ${p.agency}` : ''}
          </span>
        </button>
        {(() => {
          // Estatus en el pipeline: color + etiqueta (o punto hueco si no está)
          const fe = firmasByPlayer[p.id]
          if (!fe) return (
            <span className="w-1.5 h-1.5 rounded-full border border-slate-200 flex-shrink-0" title="No está en el pipeline" />
          )
          const cfg = FIRMAS_CONFIG[fe.status]
          return (
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}
              title={`Pipeline: ${cfg.label}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className="hidden sm:inline">{cfg.label}</span>
            </span>
          )
        })()}
        <span className="text-[10.5px] text-slate-400 flex-shrink-0 tabular-nums">{fmtShort(e.date)}</span>
        {isAdmin && (
          <>
            <button
              onClick={() => { setEditingId(p.id); setEditValue(p.clubContract ?? '') }}
              className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-white transition-colors flex-shrink-0"
              title="Editar fin de contrato"
              aria-label="Editar fin de contrato"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {/* Estrella siempre visible: es la forma de meter y sacar
                jugadores del campograma (también en móvil, sin hover) */}
            <button
              onClick={() => void onToggleMarketMap(p, !p.marketMap)}
              className={`px-0.5 text-[13px] leading-none flex-shrink-0 transition-colors ${
                p.marketMap ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-500'
              }`}
              title={p.marketMap ? 'Quitar del campograma de mercado' : 'Añadir al campograma de mercado'}
              aria-label={p.marketMap ? 'Quitar del campograma' : 'Añadir al campograma'}
            >
              {p.marketMap ? '★' : '☆'}
            </button>
          </>
        )}
      </div>
    )
  }

  const chip = (id: string, label: string, n: number) => (
    <button
      key={id}
      onClick={() => { setYearSel(id); setExpandedSlots(new Set()) }}
      className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
        year === id ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}
      <span className={`ml-1.5 text-[10px] font-bold ${year === id ? 'text-white/75' : 'text-slate-400'}`}>{n}</span>
    </button>
  )

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Fin de contrato</h2>
          <p className="text-xs text-slate-400">
            {source === 'mapa'
              ? 'Tu campograma de mercado: solo los jugadores marcados con ★, por año de fin de contrato'
              : 'Toda la BBDD de 1ª, 2ª y 1ª RFEF — marca con ☆ los que quieras en tu campograma'}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { setSource('mapa'); setYearSel(null); setExpandedSlots(new Set()) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${source === 'mapa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >★ Mi campograma <span className="text-slate-400 font-semibold">{enMapa.length}</span></button>
          <button
            onClick={() => { setSource('todos'); setYearSel(null); setExpandedSlots(new Set()) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${source === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >Toda la BBDD</button>
        </div>
      </div>

      {/* Ligas (solo al mirar toda la BBDD) */}
      {source === 'todos' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Liga</span>
          {[...LIGAS as string[], 'otros'].map(l => (
            <button
              key={l}
              onClick={() => toggleLiga(l)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                ligaFilter.has(l)
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
              }`}
            >
              {l === 'otros' ? 'Resto' : l}
              <span className="ml-1 text-[10px] opacity-70">{all.filter(e => (e.liga ?? 'otros') === l).length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Años */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {windowYears.map(y => chip(y, y, counts[y]))}
        {chip('sin', 'Sin fecha', sinFecha)}
        {otros > 0 && chip('otros', 'Otros años', otros)}
      </div>

      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setView('lista')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >☰ Lista</button>
          <button
            onClick={() => setView('campo')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${view === 'campo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >⚽ Campograma</button>
        </div>
        <select value={assessFilter} onChange={e => setAssessFilter(e.target.value as 'all' | ScoutingAssessment)} className={SELECT_CLS}>
          <option value="all">Todos los estados</option>
          {(['Llamar', 'Basque', 'Seguir', 'Decidir', 'Visto', 'Descartado'] as ScoutingAssessment[]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} className={SELECT_CLS} title="Filtrar por zona geográfica del club">
          <option value="all">📍 Todas las zonas</option>
          {ZONAS.map(z => (
            <option key={z} value={z} disabled={!conteoZonas[z]}>{z} ({conteoZonas[z] ?? 0})</option>
          ))}
          {!!conteoZonas[SIN_ZONA] && <option value={SIN_ZONA}>{SIN_ZONA} ({conteoZonas[SIN_ZONA]})</option>}
        </select>
        <button onClick={onAbrirZonas} title="Cambiar la zona de un club" className={SELECT_CLS}>⚙</button>
        <BotonCsv
          nombre="fin-de-contrato"
          cabeceras={['Jugador', 'Posición', 'Año nac.', 'Equipo', 'Liga', 'Zona', 'Agencia', 'Fin contrato', 'Año', 'Assessment', 'Pipeline']}
          filas={() => shown.map(({ p, year, liga }) => [
            p.fullName, p.position1 ?? '', birthYearFromBirthdate(p.birthdate),
            p.team ?? '', liga ?? '', zonaDe(p.team, clubZonas) ?? '',
            p.agency ?? '', p.clubContract ?? '', year ?? '',
            p.assessment ?? '',
            firmasByPlayer[p.id] ? FIRMAS_CONFIG[firmasByPlayer[p.id].status].label : '',
          ])}
        />
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Jugador, equipo o agencia…"
            className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          {shown.length} jugador{shown.length !== 1 ? 'es' : ''}
          {ignoreYear && <span className="text-slate-300"> · buscando en todos los años</span>}
        </span>
        {source === 'todos' && isAdmin && (
          <span className="text-[11px] text-amber-600 font-medium">☆ = añadir al campograma</span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center">
          <p className="text-xs text-slate-400 italic">
            {source === 'mapa' && enMapa.length === 0
              ? 'Tu campograma está vacío: entra en «Toda la BBDD» y marca jugadores con ☆.'
              : year === 'sin' ? 'Todos los jugadores del filtro tienen fin de contrato.'
              : year === 'otros' ? 'Nadie con fin de contrato fuera de estos tres años.'
              : `Ningún jugador acaba contrato en ${year} con ese filtro.`}
          </p>
        </div>
      ) : view === 'lista' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SLOT_ORDER.filter(s => (bySlot[s]?.length ?? 0) > 0).map(s => (
            <div key={s} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{SLOT_LABELS[s]}</span>
                <span className="text-[10px] font-bold text-slate-400">{bySlot[s].length}</span>
              </div>
              <div className="divide-y divide-slate-50">{bySlot[s].map(playerRow)}</div>
            </div>
          ))}
          {sinPos.length > 0 && (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Sin posición</span>
                <span className="text-[10px] font-bold text-slate-400">{sinPos.length}</span>
              </div>
              <div className="divide-y divide-slate-50">{sinPos.map(playerRow)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative w-full max-w-[560px] mx-auto rounded-xl overflow-hidden"
            style={{ aspectRatio: '100 / 130', background: 'linear-gradient(180deg,#15803d 0%,#166534 100%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,.18)' }}>
            <svg viewBox="0 0 100 130" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
              <rect x="1" y="1" width="98" height="128" rx="2" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              <line x1="1" y1="65" x2="99" y2="65" stroke="#ffffff55" strokeWidth=".7" />
              <circle cx="50" cy="65" r="10" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              <rect x="24" y="109" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              <rect x="38" y="121" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              <rect x="24" y="1" width="52" height="20" fill="none" stroke="#ffffff55" strokeWidth=".7" />
              <rect x="38" y="1" width="24" height="8" fill="none" stroke="#ffffff55" strokeWidth=".7" />
            </svg>
            {PITCH_SLOTS.map(s => {
              const pls = bySlot[s.id] ?? []
              const isExpanded = expandedSlots.has(s.id)
              const visible = isExpanded ? pls : pls.slice(0, 3)
              const extra = pls.length - visible.length
              return (
                <div key={s.id} className="absolute flex flex-col items-center gap-0.5 z-10" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-white text-[10px] font-extrabold tracking-wide border ${pls.length === 0 ? 'opacity-40 border-white/30 bg-white/10' : 'border-white/40 bg-white/15'}`}
                    style={{ backdropFilter: 'blur(2px)' }}>
                    {s.id}
                    {pls.length > 0 && <span className="bg-amber-500 text-[9px] text-amber-950 rounded-full px-1.5 font-extrabold">{pls.length}</span>}
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    {visible.map(({ p, date }) => {
                      const fe = firmasByPlayer[p.id]
                      return (
                        <button
                          key={p.id}
                          onClick={() => onOpenPlayer(p.id)}
                          title={`${p.fullName}${p.team ? ' · ' + p.team : ''}${p.agency ? ' · ' + p.agency : ''} · fin ${p.clubContract ?? '—'}${fe ? ` · pipeline: ${FIRMAS_CONFIG[fe.status].label}` : ''}`}
                          className="bg-amber-50 border border-amber-200 text-amber-900 text-[9.5px] font-bold rounded-md px-1.5 py-px whitespace-nowrap shadow hover:bg-amber-100 transition-colors max-w-[130px] truncate inline-flex items-center gap-1"
                        >
                          {fe && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[fe.status].dot}`} />}
                          {p.fullName.split(' ').slice(0, 2).join(' ')}
                          {date && <span className="font-medium text-amber-600">{fmtShort(date).slice(0, 5)}</span>}
                        </button>
                      )
                    })}
                    {extra > 0 && (
                      <button
                        onClick={() => setExpandedSlots(prev => { const n = new Set(prev); n.add(s.id); return n })}
                        className="text-[9px] text-white/85 hover:text-white font-semibold"
                      >
                        +{extra} más
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10.5px] text-slate-400 text-center mt-2 max-w-[560px] mx-auto leading-relaxed">
            Clic en un jugador → su ficha. Al pasar el ratón ves equipo, agencia y la fecha exacta.
            {sinPos.length > 0 && ` · ${sinPos.length} sin posición reconocida (solo salen en la lista)`}
          </p>
        </div>
      )}
    </div>
  )
}
