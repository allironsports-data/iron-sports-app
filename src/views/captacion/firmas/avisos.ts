import { useMemo, useState } from 'react'
import type { Player, FirmasEntry, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, BoulemaPeticion } from '../../../types'
import { normConclusion, todayISO, fmtDate } from '../helpers'
import { norm as normSearch } from '../../../lib/texto'
import { hoyISO, sumarDias } from '../../../lib/fechas'
import { teamsAlike, equipoMatchKind } from '../../../lib/equipos'
import { AVISO_TITULO } from './helpers'

// ── Avisos del pipeline ──────────────────────────────────────────────
// Cruces con el resto de la app: cosas que pasan FUERA de Firmar y que
// deberían mover una tarjeta (le vieron en un partido, cambió de club,
// llega un informe nuevo, se le acaba el contrato…).
//
// Vivía dentro de FirmasTab, en un desplegable encima del tablero. Ahora
// es su propia pestaña, así que el cálculo sale aquí para que lo usen los
// dos sitios sin duplicarlo.

export interface Aviso {
  icon: string
  text: string
  entryId: string
  tone: 'blue' | 'green' | 'amber' | 'red'
  kind: string
}

export interface GrupoAviso {
  kind: string
  icon: string
  tone: string
  titulo: string
  items: Aviso[]
}

export function useFirmasAvisos({
  entries, scoutingPlayers, scoutingReports, scoutingMatches, matchPlayers, boulemaPeticiones, players,
}: {
  entries: FirmasEntry[]
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  boulemaPeticiones: BoulemaPeticion[]
  players: Player[]
}) {
  const spById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    for (const p of scoutingPlayers) m[p.id] = p
    return m
  }, [scoutingPlayers])

  const reportsByPlayer = useMemo(() => {
    const m: Record<string, ScoutingReport[]> = {}
    for (const r of scoutingReports) (m[r.playerId] ??= []).push(r)
    for (const l of Object.values(m)) l.sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
    return m
  }, [scoutingReports])

  const alerts = useMemo(() => {
    const out: { icon: string; text: string; entryId: string; tone: 'blue' | 'green' | 'amber' | 'red'; kind: string }[] = []
    const today = todayISO()
    // sumarDias trabaja en día local; toISOString() daba el día UTC (entre 00:00 y 02:00 «hoy» aún es ayer)
    const plus30 = sumarDias(hoyISO(), 30)
    const minus14 = sumarDias(hoyISO(), -14)
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString()
    const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const in30 = Date.now() + 30 * 86400000
    const in180 = Date.now() + 180 * 86400000

    const active = entries.filter(e => e.status !== 'firmado')

    // caliente sin próxima acción programada — el olvido más caro
    active.filter(e => e.status === 'caliente' && !e.nextActionDate).forEach(e => {
      out.push({ icon: '🔥', tone: 'red', entryId: e.id, kind: 'sin-accion', text: `${e.playerName} está caliente sin próxima acción programada — ponle fecha` })
    })

    // alta sin encargado
    active.filter(e => e.managers.length === 0).forEach(e => {
      out.push({ icon: '👤', tone: 'red', entryId: e.id, kind: 'sin-encargado', text: `${e.playerName} no tiene encargado asignado` })
    })

    // incoherencia con el assessment de scouting.
    // Nota: que en scouting esté en «Llamar» y aquí frío/templado es NORMAL —
    // el proceso natural es: scouting decide «Llamar» → pasa a Firmar, y aquí
    // vive su propio estatus. Solo avisamos del caso contradictorio (Descartado).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (sp?.assessment === 'Descartado') {
        out.push({ icon: '🚫', tone: 'red', entryId: e.id, kind: 'descartado', text: `${e.playerName}: en scouting está Descartado — ¿sacarlo del pipeline?` })
      }
    })

    // frío que se calienta solo: 2+ informes «Llamar» en 90 días
    active.filter(e => e.status === 'frio' && e.scoutingPlayerId).forEach(e => {
      const n = (reportsByPlayer[e.scoutingPlayerId!] ?? [])
        .filter(r => (r.fecha ?? r.createdAt) >= since90 && normConclusion(r.conclusion) === 'Llamar').length
      if (n >= 2) out.push({ icon: '📈', tone: 'amber', entryId: e.id, kind: 'recalentar', text: `${e.playerName} acumula ${n} informes «Llamar» recientes — candidato a recalentar` })
    })

    // le vieron en un partido (añadido al campograma, últimos 14 días)
    const recentMatches = new Map(scoutingMatches.filter(m => m.date <= today && m.date >= minus14).map(m => [m.id, m]))
    const seenByPlayer: Record<string, ScoutingMatch> = {}
    matchPlayers.forEach(mp => {
      const m = recentMatches.get(mp.matchId)
      if (m && (!seenByPlayer[mp.playerId] || m.date > seenByPlayer[mp.playerId].date)) seenByPlayer[mp.playerId] = m
    })
    active.forEach(e => {
      const m = e.scoutingPlayerId ? seenByPlayer[e.scoutingPlayerId] : undefined
      if (m) out.push({ icon: '👀', tone: 'green', entryId: e.id, kind: 'visto', text: `A ${e.playerName} le vieron el ${fmtDate(m.date)} en ${m.homeTeam} vs ${m.awayTeam} — buen momento para llamar` })
    })

    // partidos de Captación registrados (≤30 días vista) donde juega su equipo
    const upcoming = scoutingMatches.filter(m => m.date >= today && m.date <= plus30).sort((a, b) => a.date.localeCompare(b.date))
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.team) return
      const m = upcoming.find(m => teamsAlike(sp.team, m.homeTeam) || teamsAlike(sp.team, m.awayTeam))
      if (m) out.push({
        icon: '🏟️', tone: 'blue', entryId: e.id, kind: 'juega',
        text: `${e.playerName}: su equipo juega ${m.homeTeam} vs ${m.awayTeam} el ${fmtDate(m.date)}${m.assignedTo ? ` (lo ve ${m.assignedTo})` : ''}`,
      })
    })

    // informes nuevos (≤14 días) sobre jugadores del pipeline
    active.forEach(e => {
      if (!e.scoutingPlayerId) return
      const recent = (reportsByPlayer[e.scoutingPlayerId] ?? []).filter(r => (r.fecha ?? r.createdAt) >= since14)
      if (recent.length > 0) {
        const r = recent[0]
        out.push({
          icon: '📄', tone: 'green', entryId: e.id, kind: 'informe',
          text: `Informe nuevo de ${e.playerName}${r.persona ? ` (${r.persona})` : ''}${r.conclusion ? ` — conclusión: ${normConclusion(r.conclusion)}` : ''}`,
        })
      }
    })

    // también está en Boulema: petición de informe sobre el mismo jugador
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const names = new Set([normSearch(e.playerName), ...(sp ? [normSearch(sp.fullName)] : [])])
      const pet = boulemaPeticiones.find(p => names.has(normSearch(p.playerName)))
      if (pet) out.push({ icon: '📥', tone: 'blue', entryId: e.id, kind: 'boulema', text: `Hay una petición en Boulema sobre ${e.playerName} (pedida por ${pet.requestedBy})` })
    })

    // cambio de club en su ficha de scouting
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      // mismo club pero otra categoría (Juv B → Juv A) también avisa, pero
      // con otro texto: no hace falta revisar la zona
      const cambio = sp?.team && e.knownTeam ? equipoMatchKind(e.knownTeam, sp.team) : 'equipo'
      if (sp?.team && e.knownTeam && cambio !== 'equipo') {
        out.push({ icon: '🔁', tone: 'amber', entryId: e.id, kind: 'cambio-club', text: cambio === 'club'
          ? `${e.playerName} cambió de equipo dentro del club: ${e.knownTeam} → ${sp.team} (confírmalo en su panel)`
          : `${e.playerName} cambió de club: ${e.knownTeam} → ${sp.team} — revisa la zona (confírmalo en su panel)` })
      }
    })

    // cumpleaños próximos (≤30 días) — 16 y 18 destacados.
    // Se omiten las fechas placeholder AAAA-02-28 (solo se conocía el año).
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.birthdate || sp.birthdate.endsWith('-02-28')) return
      const [by, bm, bd] = sp.birthdate.split('-').map(Number)
      const now = new Date()
      let next = new Date(now.getFullYear(), bm - 1, bd)
      if (next.getTime() < now.getTime() - 86400000) next = new Date(now.getFullYear() + 1, bm - 1, bd)
      if (next.getTime() > in30) return
      const turns = next.getFullYear() - by
      const key = turns === 16 || turns === 18
      out.push({
        icon: '🎂', tone: key ? 'amber' : 'blue', entryId: e.id, kind: 'cumple',
        text: `${e.playerName} cumple ${turns} el ${fmtDate(next.toISOString())}${key ? ' — edad clave para firmar' : ''}`,
      })
    })

    // contrato de club que expira pronto (≤6 meses)
    active.forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      if (!sp?.clubContract) return
      let d: Date | null = null
      const ddmmyyyy = sp.clubContract.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (ddmmyyyy) d = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1])
      else if (/^\d{4}-\d{2}-\d{2}/.test(sp.clubContract)) d = new Date(sp.clubContract)
      if (!d || isNaN(d.getTime())) return
      if (d.getTime() > Date.now() && d.getTime() <= in180) {
        out.push({ icon: '📃', tone: 'amber', entryId: e.id, kind: 'contrato', text: `El contrato de club de ${e.playerName} acaba el ${fmtDate(d.toISOString())}` })
      }
    })

    // duplicados: mismo jugador de scouting en más de una entrada
    const byLink: Record<string, FirmasEntry[]> = {}
    entries.forEach(e => { if (e.scoutingPlayerId) (byLink[e.scoutingPlayerId] ??= []).push(e) })
    Object.values(byLink).filter(l => l.length > 1).forEach(l => {
      out.push({ icon: '👥', tone: 'red', entryId: l[0].id, kind: 'duplicado', text: `${l[0].playerName} está ${l.length} veces en el pipeline (${l.map(x => x.zone).join(' y ')})` })
    })

    // firmado que aún no está en Mantenimiento
    entries.filter(e => e.status === 'firmado').forEach(e => {
      const sp = e.scoutingPlayerId ? spById[e.scoutingPlayerId] : undefined
      const nm = normSearch(sp?.fullName ?? e.playerName)
      if (!players.some(p => normSearch(p.name) === nm)) {
        out.push({ icon: '🎉', tone: 'green', entryId: e.id, kind: 'firmado', text: `${e.playerName} está firmado y aún no está en Mantenimiento — créalo desde su panel` })
      }
    })

    const rank = { red: 0, amber: 1, blue: 2, green: 3 }
    return out.sort((a, b) => rank[a.tone] - rank[b.tone] || a.text.localeCompare(b.text))
  }, [entries, spById, scoutingMatches, matchPlayers, reportsByPlayer, boulemaPeticiones, players])

  // Avisos silenciados: cada uno decide qué tipos no quiere ver. Se guarda en
  // este navegador, así que no molesta a nadie más.
  const [avisosMudos, setAvisosMudos] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('firmas_avisos_mudos') ?? '[]') as string[]) }
    catch { return new Set() }
  })
  const silenciar = (kind: string) => setAvisosMudos(prev => {
    const next = new Set(prev)
    if (next.has(kind)) next.delete(kind); else next.add(kind)
    localStorage.setItem('firmas_avisos_mudos', JSON.stringify([...next]))
    return next
  })

  // Agrupados por tipo: 20 líneas iguales no son 20 avisos, son uno con 20 casos
  const gruposAviso = useMemo(() => {
    const m = new Map<string, { kind: string; icon: string; tone: string; titulo: string; items: typeof alerts }>()
    for (const a of alerts) {
      if (avisosMudos.has(a.kind)) continue
      let g = m.get(a.kind)
      if (!g) { g = { kind: a.kind, icon: a.icon, tone: a.tone, titulo: AVISO_TITULO[a.kind] ?? a.kind, items: [] }; m.set(a.kind, g) }
      g.items.push(a)
    }
    const rank: Record<string, number> = { red: 0, amber: 1, blue: 2, green: 3 }
    return [...m.values()].sort((a, b) => rank[a.tone] - rank[b.tone] || b.items.length - a.items.length)
  }, [alerts, avisosMudos])

  const urgentes = useMemo(() => gruposAviso.filter(g => g.tone === 'red').reduce((n, g) => n + g.items.length, 0), [gruposAviso])
  const totalAvisos = useMemo(() => gruposAviso.reduce((n, g) => n + g.items.length, 0), [gruposAviso])

  const restaurarAvisos = () => {
    setAvisosMudos(new Set())
    localStorage.removeItem('firmas_avisos_mudos')
  }

  return { gruposAviso, urgentes, totalAvisos, avisosMudos, silenciar, restaurarAvisos }
}
