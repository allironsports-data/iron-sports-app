// ── Pipeline → Por zona ──────────────────────────────────────────────
//
// «¿Cómo estamos en esta zona?». No es el tablero filtrado (para eso ya
// está el filtro de zona en Firmar): es la foto completa de la zona,
// cruzando el pipeline con Captación:
//   · resumen por estatus, encargados, desatendidos, firmados
//   · jugadores clave (potencial top y calientes), con lo que les toca
//   · lo que necesita atención (acción vencida, parados, sin encargado, sin teléfono)
//   · el pipeline de la zona en compacto
//   · próximos partidos de equipos de la zona, señalando a quién del pipeline se ve
//   · candidatos de Captación con informe «Llamar» que aún no están en el pipeline
//   · actividad reciente y firmados
//
// Las zonas del pipeline («Valencia», «Andalucia / Murcia»…) no son las
// zonas por club de Captación: se cruzan con una tabla de equivalencias y,
// además, con las zonas de los clubes de los propios jugadores de la zona.

import { useMemo, useState } from 'react'
import { MapPin, Star, AlertTriangle, CalendarDays, UserPlus, Activity, Trophy, ChevronRight } from 'lucide-react'
import type { FirmasEntry, FirmasStatus, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { FIRMAS_STATUSES, FIRMAS_CONFIG, FIRMAS_ACTION_KIND_META, necesitaTelefono, firmasAging } from '../captacion/firmas/helpers'
import { FirmasManagers } from '../captacion/firmas/comun'
import { fmtDate, relativeDate, normConclusion } from '../captacion/helpers'
import { zonaDe, ZONAS_PIPELINE, type Zona } from '../../lib/zonas'
import { teamsAlike } from '../../lib/equipos'
import { hoyISO, sumarDias, parseDia } from '../../lib/fechas'

/** Zona del pipeline → zonas por club de Captación con las que se cruza */
const ZONAS_CLUB_DE: Record<string, Zona[]> = {
  'Valencia': ['Comunidad Valenciana'],
  'Andalucia / Murcia': ['Resto de Andalucía', 'Murcia, Almería y Castilla-La Mancha'],
  'Catalunya / Aragon / Baleares / Canarias': ['Catalunya, Aragón y Baleares', 'Canarias'],
  'Madrid': ['Madrid'],
  'CyL/Cantabria/Asturias': ['Castilla y León, Navarra y La Rioja', 'Asturias, Galicia, León, Cantabria y Euskadi'],
  'Cantabria/Galicia/Euskadi': ['Asturias, Galicia, León, Cantabria y Euskadi'],
  'Europa/Resto Mundo': ['Extranjero'],
}

const VIVOS: FirmasStatus[] = FIRMAS_STATUSES.filter(s => s !== 'firmado')
const diaCorto = (iso: string) => parseDia(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

function Caja({ titulo, icono, n, children, vacio }: { titulo: string; icono: React.ReactNode; n?: number; children: React.ReactNode; vacio?: string }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <span className="text-slate-400">{icono}</span>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex-1">{titulo}</h3>
        {n !== undefined && <span className="text-xs font-bold text-slate-500">{n}</span>}
      </div>
      {n === 0 && vacio ? <p className="px-3 py-3 text-xs text-slate-400">{vacio}</p> : children}
    </section>
  )
}

export function ZonaTab({
  entries, profiles, scoutingPlayers, scoutingReports, scoutingMatches, matchPlayers, clubZonas,
  onAbrirEntry, onOpenScoutingPlayer, onOpenMatch, onRenameZone,
}: {
  entries: FirmasEntry[]
  profiles: Profile[]
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  /** Correcciones de zona por club hechas a mano (scouting_club_zonas) */
  clubZonas?: Record<string, Zona>
  onAbrirEntry: (id: string) => void
  onOpenScoutingPlayer: (id: string) => void
  onOpenMatch?: (id: string) => void
  onRenameZone?: (de: string, a: string) => Promise<void>
}) {
  const hoy = hoyISO()
  const en14 = sumarDias(hoy, 14)
  const hace90 = new Date(Date.now() - 90 * 86400000).toISOString()

  const zonas = useMemo(() => {
    const present = [...new Set(entries.map(e => e.zone))]
    const canon = ZONAS_PIPELINE.filter(z => present.includes(z))
    const extra = present.filter(z => !ZONAS_PIPELINE.includes(z)).sort((a, b) => a.localeCompare(b))
    return [...canon, ...extra]
  }, [entries])
  const [sel, setSel] = useState<string>(() => sessionStorage.getItem('capt_firmas_zone') ?? '')
  const zona = zonas.includes(sel) ? sel : (zonas[0] ?? '')
  const elegir = (z: string) => { setSel(z); try { sessionStorage.setItem('capt_firmas_zone', z) } catch { /* nada */ } }

  const spById = useMemo(() => new Map(scoutingPlayers.map(p => [p.id, p])), [scoutingPlayers])
  const informesPorJugador = useMemo(() => {
    const m = new Map<string, ScoutingReport[]>()
    for (const r of scoutingReports) { const l = m.get(r.playerId); if (l) l.push(r); else m.set(r.playerId, [r]) }
    return m
  }, [scoutingReports])

  const deZona = useMemo(() => entries.filter(e => e.zone === zona), [entries, zona])
  const vivos = useMemo(() => deZona.filter(e => e.status !== 'firmado'), [deZona])
  const firmados = useMemo(() => deZona.filter(e => e.status === 'firmado').sort((a, b) => (b.signedAt ?? '').localeCompare(a.signedAt ?? '')), [deZona])
  const equipoDe = (e: FirmasEntry) => (e.scoutingPlayerId ? spById.get(e.scoutingPlayerId)?.team : undefined) ?? e.knownTeam

  // Zonas por club con las que se cruza esta zona del pipeline
  const zonasClub = useMemo(() => {
    const s = new Set<Zona>(ZONAS_CLUB_DE[zona] ?? [])
    for (const e of deZona) { const z = zonaDe(equipoDe(e), clubZonas); if (z) s.add(z) }
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona, deZona, clubZonas, spById])

  const porEstatus = useMemo(() => {
    const m = {} as Record<FirmasStatus, FirmasEntry[]>
    FIRMAS_STATUSES.forEach(s => { m[s] = [] })
    deZona.forEach(e => m[e.status].push(e))
    FIRMAS_STATUSES.forEach(s => m[s].sort((a, b) => a.sortPos - b.sortPos || a.playerName.localeCompare(b.playerName)))
    return m
  }, [deZona])

  const encargados = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of vivos) for (const m of e.managers) n.set(m, (n.get(m) ?? 0) + 1)
    return [...n.entries()].map(([id, k]) => ({ p: profiles.find(p => p.id === id), id, k })).sort((a, b) => b.k - a.k)
  }, [vivos, profiles])

  const desatendidos = useMemo(() => vivos.filter(e => firmasAging(e)?.overdue), [vivos])
  const sinEncargado = useMemo(() => vivos.filter(e => e.managers.length === 0), [vivos])
  const top = useMemo(() => vivos.filter(e => e.potencialTop), [vivos])
  const firmados90 = firmados.filter(e => (e.signedAt ?? '') >= hace90).length

  // Jugadores clave: potencial top primero, luego calientes
  const clave = useMemo(() => {
    const orden = (e: FirmasEntry) => (e.potencialTop ? 0 : 1) * 10 + FIRMAS_STATUSES.indexOf(e.status)
    return vivos.filter(e => e.potencialTop || e.status === 'caliente').sort((a, b) => orden(a) - orden(b) || a.playerName.localeCompare(b.playerName))
  }, [vivos])

  // Necesitan atención: una fila por tarjeta, con todos sus motivos
  const atencion = useMemo(() => vivos.map(e => {
    const motivos: string[] = []
    if (e.nextActionDate && e.nextActionDate < hoy) motivos.push(`acción vencida (${diaCorto(e.nextActionDate)})`)
    const ag = firmasAging(e)
    if (ag?.overdue) motivos.push(`${ag.days} d sin tocar`)
    if (e.managers.length === 0) motivos.push('sin encargado')
    if (necesitaTelefono(e)) motivos.push('sin teléfono')
    if (e.status === 'caliente' && !e.nextAction) motivos.push('caliente sin próxima acción')
    return { e, motivos }
  }).filter(x => x.motivos.length > 0).sort((a, b) => b.motivos.length - a.motivos.length), [vivos, hoy])

  // Próximos partidos de equipos de la zona (14 días), con quién del pipeline juega
  const partidos = useMemo(() => {
    const jugadoresVinculados = new Map<string, string[]>()
    for (const mp of matchPlayers) { const l = jugadoresVinculados.get(mp.matchId); if (l) l.push(mp.playerId); else jugadoresVinculados.set(mp.matchId, [mp.playerId]) }
    return scoutingMatches
      .filter(m => m.date >= hoy && m.date <= en14)
      .map(m => {
        const zh = zonaDe(m.homeTeam, clubZonas), za = zonaDe(m.awayTeam, clubZonas)
        const enZona = (zh && zonasClub.has(zh)) || (za && zonasClub.has(za))
        const juegan = vivos.filter(e => {
          const t = equipoDe(e)
          if (t && (teamsAlike(t, m.homeTeam) || teamsAlike(t, m.awayTeam))) return true
          return !!e.scoutingPlayerId && (jugadoresVinculados.get(m.id) ?? []).includes(e.scoutingPlayerId)
        })
        return { m, enZona: !!enZona || juegan.length > 0, juegan }
      })
      .filter(x => x.enZona)
      .sort((a, b) => a.m.date.localeCompare(b.m.date) || (a.m.time ?? '99').localeCompare(b.m.time ?? '99'))
      .slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoutingMatches, matchPlayers, vivos, zonasClub, clubZonas, hoy, en14, spById])

  // Candidatos: jugadores de Captación de la zona con informe «Llamar» que no están en ningún pipeline
  const candidatos = useMemo(() => {
    const enPipeline = new Set(entries.map(e => e.scoutingPlayerId).filter(Boolean))
    return scoutingPlayers
      .filter(p => !enPipeline.has(p.id) && p.assessment !== 'Descartado')
      .map(p => {
        const z = zonaDe(p.team, clubZonas)
        if (!z || !zonasClub.has(z)) return null
        const infs = informesPorJugador.get(p.id) ?? []
        const llamar = infs.filter(r => normConclusion(r.conclusion) === 'Llamar').length
        if (llamar === 0 && p.assessment !== 'Llamar') return null
        const ultimo = infs.map(r => r.fecha ?? r.createdAt).sort().pop()
        return { p, llamar, n: infs.length, ultimo }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.llamar - a.llamar || (b.ultimo ?? '').localeCompare(a.ultimo ?? ''))
      .slice(0, 15)
  }, [scoutingPlayers, entries, informesPorJugador, zonasClub, clubZonas])

  // Actividad reciente: últimos apuntes de las tarjetas de la zona
  const actividad = useMemo(() => deZona
    .flatMap(e => e.comments.map(c => ({ e, c })))
    .sort((a, b) => b.c.date.localeCompare(a.c.date))
    .slice(0, 8), [deZona])

  const [renombrando, setRenombrando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')

  const filaTarjeta = (e: FirmasEntry, extra?: React.ReactNode) => {
    const ag = firmasAging(e)
    const sp = e.scoutingPlayerId ? spById.get(e.scoutingPlayerId) : undefined
    return (
      <button key={e.id} onClick={() => onAbrirEntry(e.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FIRMAS_CONFIG[e.status].dot}`} title={FIRMAS_CONFIG[e.status].label} />
        {e.potencialTop && <span className="text-[11px] flex-shrink-0" title="Potencial top">⭐</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-800 truncate">{e.playerName}</span>
          <span className="block text-[11px] text-slate-400 truncate">
            {[sp?.team ?? e.knownTeam, sp?.birthdate ? sp.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
        {extra}
        {ag && <span className={`text-[11px] tabular-nums flex-shrink-0 ${ag.overdue ? 'text-red-600 font-semibold' : ag.warn ? 'text-amber-600' : 'text-slate-400'}`} title="Días sin tocar">{ag.days}d</span>}
        <FirmasManagers managerIds={e.managers} profiles={profiles} max={2} />
        <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
      </button>
    )
  }

  if (zonas.length === 0) {
    return <div className="flex-1 w-full px-3 sm:px-6 py-10 text-center text-sm text-slate-400">Todavía no hay tarjetas en el pipeline.</div>
  }

  return (
    <div className="flex-1 w-full px-3 sm:px-6 py-4">
      <div className="flex flex-col lg:flex-row gap-3 items-start">
        {/* Lista de zonas */}
        <div className="w-full lg:w-52 flex-shrink-0">
          <div className="flex lg:flex-col gap-1.5 lg:gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0 scrollbar-none">
            {zonas.map(z => {
              const zs = entries.filter(e => e.zone === z && e.status !== 'firmado')
              const activa = z === zona
              const urg = zs.filter(e => firmasAging(e)?.overdue).length
              const tops = zs.filter(e => e.potencialTop).length
              return (
                <button key={z} onClick={() => elegir(z)}
                  className={`flex-shrink-0 lg:w-full text-left rounded-lg border px-2.5 py-1.5 transition-colors ${activa ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold truncate ${activa ? 'text-primary' : 'text-slate-700'}`}>{z}</span>
                    <span className={`ml-auto text-xs font-bold flex-shrink-0 ${activa ? 'text-primary' : 'text-slate-400'}`}>{zs.length}</span>
                  </div>
                  <div className="hidden lg:flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    {VIVOS.map(st => { const n = zs.filter(e => e.status === st).length; return n ? <span key={st} className="inline-flex items-center gap-0.5" title={FIRMAS_CONFIG[st].label}><span className={`w-1.5 h-1.5 rounded-full ${FIRMAS_CONFIG[st].dot}`} />{n}</span> : null })}
                    {tops > 0 && <span title="Potencial top">⭐ {tops}</span>}
                    {urg > 0 && <span className="text-red-600 font-semibold" title="Desatendidos">⚠ {urg}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* La zona */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* Cabecera + resumen */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="w-4 h-4 text-slate-400" />
              {renombrando ? (
                <span className="flex items-center gap-1.5">
                  <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && nuevoNombre.trim()) { void onRenameZone?.(zona, nuevoNombre.trim()).then(() => { elegir(nuevoNombre.trim()); setRenombrando(false) }) } if (e.key === 'Escape') setRenombrando(false) }}
                    className="text-sm font-bold text-slate-800 border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  <button onClick={() => setRenombrando(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancelar</button>
                </span>
              ) : (
                <h2 className="text-sm font-bold text-slate-800">{zona}</h2>
              )}
              {onRenameZone && !renombrando && (
                <button onClick={() => { setNuevoNombre(zona); setRenombrando(true) }} className="text-[11px] text-slate-400 hover:text-slate-600">renombrar</button>
              )}
              <span className="ml-auto text-xs text-slate-500">{vivos.length} en marcha · {firmados.length} firmad{firmados.length === 1 ? 'o' : 'os'}{firmados90 > 0 && ` (${firmados90} en 90 d)`}</span>
            </div>
            <div className="mt-2 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs">
              {VIVOS.map(st => (
                <span key={st} className="inline-flex items-center gap-1 text-slate-600"><span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[st].dot}`} />{FIRMAS_CONFIG[st].label} <b>{porEstatus[st].length}</b></span>
              ))}
              <span className="inline-flex items-center gap-1 text-amber-700">⭐ Potencial top <b>{top.length}</b></span>
              <span className={`inline-flex items-center gap-1 ${desatendidos.length ? 'text-red-600' : 'text-slate-500'}`}>⚠ Desatendidos <b>{desatendidos.length}</b></span>
              {sinEncargado.length > 0 && <span className="inline-flex items-center gap-1 text-red-600">Sin encargado <b>{sinEncargado.length}</b></span>}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-400">Encargados:</span>
              {encargados.length === 0 && <span className="text-slate-400">nadie</span>}
              {encargados.map(({ p, id, k }) => (
                <span key={id} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-1 pr-2 py-0.5 text-slate-700">
                  <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold inline-flex items-center justify-center">{p?.avatar ?? '?'}</span>
                  {p?.name.split(' ')[0] ?? id.slice(0, 6)} <b>{k}</b>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <Caja titulo="Jugadores clave" icono={<Star className="w-3.5 h-3.5" />} n={clave.length} vacio="Ningún potencial top ni caliente en la zona. Marca los top con la estrella en su ficha.">
              <div className="divide-y divide-slate-50">
                {clave.map(e => filaTarjeta(e, e.nextAction && e.status !== 'firmado' ? (
                  <span className={`hidden sm:inline text-[11px] truncate max-w-[180px] ${e.nextActionDate && e.nextActionDate < hoy ? 'text-red-600' : 'text-slate-500'}`} title={e.nextAction}>
                    {FIRMAS_ACTION_KIND_META[e.nextActionKind ?? '']?.icon ?? '📌'} {e.nextAction}{e.nextActionDate ? ` · ${diaCorto(e.nextActionDate)}` : ''}
                  </span>
                ) : undefined))}
              </div>
            </Caja>

            <Caja titulo="Necesitan atención" icono={<AlertTriangle className="w-3.5 h-3.5" />} n={atencion.length} vacio="Todo al día en esta zona.">
              <div className="divide-y divide-slate-50 max-h-[360px] overflow-y-auto">
                {atencion.map(({ e, motivos }) => filaTarjeta(e, (
                  <span className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[220px]">
                    {motivos.map(m => <span key={m} className="text-[11px] bg-red-50 text-red-700 border border-red-100 rounded px-1 py-px">{m}</span>)}
                  </span>
                )))}
              </div>
            </Caja>
          </div>

          {/* Pipeline compacto */}
          <Caja titulo="Pipeline de la zona" icono={<Activity className="w-3.5 h-3.5" />} n={vivos.length} vacio="Sin tarjetas vivas en esta zona.">
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-100">
              {VIVOS.map(st => (
                <div key={st} className="min-w-0">
                  <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/60">
                    <span className={`w-2 h-2 rounded-full ${FIRMAS_CONFIG[st].dot}`} />
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide truncate">{FIRMAS_CONFIG[st].label}</span>
                    <span className="ml-auto text-[11px] text-slate-400">{porEstatus[st].length}</span>
                  </div>
                  <div className="py-1 max-h-[260px] overflow-y-auto">
                    {porEstatus[st].length === 0 && <p className="px-2.5 py-1 text-[11px] text-slate-300">—</p>}
                    {porEstatus[st].map(e => {
                      const ag = firmasAging(e)
                      return (
                        <button key={e.id} onClick={() => onAbrirEntry(e.id)} className="w-full text-left px-2.5 py-1 text-xs hover:bg-slate-50 flex items-center gap-1">
                          {e.potencialTop && <span className="text-[10px]">⭐</span>}
                          <span className="truncate flex-1 text-slate-700">{e.playerName}</span>
                          {ag?.overdue && <span className="text-[10px] text-red-500" title={`${ag.days} d sin tocar`}>⚠</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Caja>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <Caja titulo="Próximos partidos en la zona · 14 días" icono={<CalendarDays className="w-3.5 h-3.5" />} n={partidos.length}
              vacio="Ningún partido de equipos de esta zona en Captación → Partidos para las próximas dos semanas.">
              <div className="divide-y divide-slate-50">
                {partidos.map(({ m, juegan }) => (
                  <button key={m.id} onClick={() => onOpenMatch?.(m.id)} disabled={!onOpenMatch}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 disabled:cursor-default">
                    <span className="w-[76px] flex-shrink-0 text-[11px] text-slate-500 tabular-nums">{diaCorto(m.date)}{m.time ? <span className="block text-slate-400">{m.time}</span> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-slate-800 truncate"><span className="font-medium">{m.homeTeam}</span> <span className="text-slate-400">vs</span> <span className="font-medium">{m.awayTeam}</span></span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {m.competition ?? ''}{juegan.length > 0 && <span className="text-violet-700"> · juega{juegan.length > 1 ? 'n' : ''} {juegan.map(e => e.playerName.split(' ')[0]).join(', ')}</span>}
                      </span>
                    </span>
                    <span className="text-[11px] flex-shrink-0">{m.viewMode === 'campo' ? '🏟️' : '📹'}</span>
                    {m.assignedTo && <span className="text-[11px] font-mono font-bold text-slate-500 flex-shrink-0">{m.assignedTo}</span>}
                  </button>
                ))}
              </div>
            </Caja>

            <Caja titulo="Candidatos fuera del pipeline" icono={<UserPlus className="w-3.5 h-3.5" />} n={candidatos.length}
              vacio="Ningún jugador de Captación de esta zona con informe «Llamar» que no esté ya en el pipeline.">
              <div className="divide-y divide-slate-50 max-h-[360px] overflow-y-auto">
                {candidatos.map(({ p, llamar, n, ultimo }) => (
                  <button key={p.id} onClick={() => onOpenScoutingPlayer(p.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800 truncate">{p.fullName}</span>
                      <span className="block text-[11px] text-slate-400 truncate">{[p.team, p.position1, p.birthdate ? p.birthdate.slice(0, 4) : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-px flex-shrink-0" title="Informes con conclusión «Llamar»">Llamar ×{llamar}</span>
                    <span className="text-[11px] text-slate-400 flex-shrink-0" title="Informes en total">{n} inf.{ultimo ? ` · ${fmtDate(ultimo)}` : ''}</span>
                    <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
              {candidatos.length > 0 && <p className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-50">Jugadores de Captación cuyo club está en esta zona, con informe «Llamar», sin tarjeta en el pipeline. Desde su ficha se añaden a Firmar.</p>}
            </Caja>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <Caja titulo="Actividad reciente" icono={<Activity className="w-3.5 h-3.5" />} n={actividad.length} vacio="Sin apuntes en las tarjetas de esta zona.">
              <div className="divide-y divide-slate-50">
                {actividad.map(({ e, c }) => (
                  <button key={c.id} onClick={() => onAbrirEntry(e.id)} className="w-full px-3 py-1.5 text-left hover:bg-slate-50">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{FIRMAS_ACTION_KIND_META[c.kind ?? 'nota']?.icon ?? '📝'}</span>
                      <span className="font-semibold text-slate-700 truncate">{e.playerName}</span>
                      <span className="truncate">· {c.author || '—'}</span>
                      <span className="ml-auto flex-shrink-0">{relativeDate(c.date) || fmtDate(c.date)}</span>
                    </span>
                    <span className="block text-xs text-slate-600 truncate">{c.text}</span>
                  </button>
                ))}
              </div>
            </Caja>

            <Caja titulo="Firmados" icono={<Trophy className="w-3.5 h-3.5" />} n={firmados.length} vacio="Todavía ninguno firmado en esta zona.">
              <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                {firmados.map(e => (
                  <button key={e.id} onClick={() => onAbrirEntry(e.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                    <span className="text-[11px]">🎉</span>
                    <span className="text-xs font-semibold text-slate-800 truncate flex-1">{e.playerName}</span>
                    <span className="text-[11px] text-slate-400 truncate">{equipoDe(e) ?? ''}</span>
                    <span className="text-[11px] text-slate-500 flex-shrink-0">{e.signedAt ? fmtDate(e.signedAt) : ''}</span>
                    <FirmasManagers managerIds={e.managers} profiles={profiles} max={2} />
                  </button>
                ))}
              </div>
            </Caja>
          </div>
        </div>
      </div>
    </div>
  )
}
