// ── Informe semanal de Captación ─────────────────────────────────────
// Genera un documento listo para imprimir y se abre el diálogo del
// navegador: «Guardar como PDF». Sin librerías nuevas, y el resultado se
// puede mandar tal cual a un club.
//
// Tres páginas + los campogramas:
//   1 · Lo nuevo de la semana (nuevos «Llamar» con el resumen de sus informes)
//   2 · Actividad y cobertura
//   3 · Lo que requiere decisión
//   4 · Campogramas por posición (la hoja que se comparte con clubes)

import type { ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, FirmasEntry } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { zonaDe, ZONA_CORTA, type Zona } from './zonas'

export interface DatosInforme {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
  firmasEntries: FirmasEntry[]
  profiles: Profile[]
  clubZonas: Record<string, Zona>
  /** Días que abarca el informe (7 por defecto) */
  dias?: number
  logoUrl?: string
}

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fecha = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const anyo = (bd?: string): string => (bd && /^\d{4}/.test(bd)) ? bd.slice(0, 4) : '—'

const normConcl = (c?: string) => c === 'Firmar' ? 'Llamar' : (c || undefined)

/** Resumen de un informe: lo esencial en 2-3 líneas, sin cortar a mitad de palabra */
function resumir(texto?: string, max = 260): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const ultimo = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('; '), corte.lastIndexOf(', '))
  return (ultimo > max * 0.5 ? corte.slice(0, ultimo + 1) : corte) + '…'
}

const nombreDe = (avatar: string | undefined, profiles: Profile[]) =>
  profiles.find(p => p.avatar === avatar)?.name ?? avatar ?? '—'

// ── Campograma en SVG ────────────────────────────────────────────────
const SLOTS: { id: string; x: number; y: number }[] = [
  { id: 'POR', x: 50, y: 92 },
  { id: 'LD',  x: 84, y: 74 }, { id: 'CTD', x: 66, y: 82 }, { id: 'CT', x: 50, y: 84 },
  { id: 'CTI', x: 34, y: 82 }, { id: 'LI',  x: 16, y: 74 },
  { id: 'PIV', x: 50, y: 62 }, { id: 'MC',  x: 32, y: 49 }, { id: 'MP', x: 60, y: 40 },
  { id: 'ED',  x: 85, y: 26 }, { id: 'EI',  x: 15, y: 26 }, { id: 'DEL', x: 50, y: 12 },
]

function slotDe(pos?: string): string | null {
  const s = (pos ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!s) return null
  if (s.includes('portero')) return 'POR'
  if (s.includes('lateral') && s.includes('der')) return 'LD'
  if (s.includes('lateral') && s.includes('izq')) return 'LI'
  if (s.includes('lateral') || s.includes('carrilero')) return 'LD'
  if (s.includes('central') && s.includes('der')) return 'CTD'
  if (s.includes('central') && s.includes('izq')) return 'CTI'
  if (s.includes('central') || s.includes('defensa')) return 'CT'
  if (s.includes('pivote')) return 'PIV'
  if (s.includes('mediapunta') || s.includes('media punta') || s.includes('enganche')) return 'MP'
  if (s.includes('mediocentro') || s.includes('medio') || s.includes('interior') || s.includes('volante')) return 'MC'
  if (s.includes('extremo') && s.includes('izq')) return 'EI'
  if (s.includes('extremo') || s.includes('banda')) return 'ED'
  if (s.includes('delantero') || s.includes('punta') || s.includes('ariete')) return 'DEL'
  return null
}

function campograma(titulo: string, jugadores: ScoutingPlayer[]): string {
  const porSlot: Record<string, ScoutingPlayer[]> = {}
  let sinPos = 0
  for (const p of jugadores) {
    const sl = slotDe(p.position1) ?? slotDe(p.position2)
    if (!sl) { sinPos++; continue }
    ;(porSlot[sl] ??= []).push(p)
  }
  const marcas = SLOTS.map(s => {
    const pls = porSlot[s.id] ?? []
    const visibles = pls.slice(0, 4)
    const alto = 11 + visibles.length * 13
    const nombres = visibles.map((p, i) => `
      <text x="${s.x}" y="${s.y + 9 + i * 13}" text-anchor="middle" font-size="9.5" fill="#fff" font-family="Arial">
        ${esc(p.fullName.length > 22 ? p.fullName.slice(0, 21) + '…' : p.fullName)} <tspan fill="#cbd5e1">'${anyo(p.birthdate).slice(2)}</tspan>
      </text>`).join('')
    const extra = pls.length > 4
      ? `<text x="${s.x}" y="${s.y + 9 + 4 * 13}" text-anchor="middle" font-size="8.5" fill="#cbd5e1" font-family="Arial">+${pls.length - 4} más</text>`
      : ''
    return `
      <rect x="${s.x - 33}" y="${s.y - 8}" width="66" height="${alto}" rx="5" fill="rgba(0,0,0,.28)" />
      <text x="${s.x}" y="${s.y}" text-anchor="middle" font-size="9" font-weight="bold" fill="#fde68a" font-family="Arial">${s.id}${pls.length ? ` (${pls.length})` : ''}</text>
      ${nombres}${extra}`
  }).join('')

  return `
  <div class="campo-bloque">
    <h3>${esc(titulo)} <span class="gris">· ${jugadores.length} jugador${jugadores.length !== 1 ? 'es' : ''}</span></h3>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="campo">
      <rect x="0" y="0" width="100" height="100" fill="#15803d" />
      <rect x="1" y="1" width="98" height="98" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.4" />
      <line x1="1" y1="50" x2="99" y2="50" stroke="rgba(255,255,255,.5)" stroke-width="0.4" />
      <circle cx="50" cy="50" r="9" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.4" />
      <rect x="30" y="1" width="40" height="14" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.4" />
      <rect x="30" y="85" width="40" height="14" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.4" />
    </svg>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="campo capa">${marcas}</svg>
    ${sinPos > 0 ? `<p class="nota">${sinPos} sin posición asignada.</p>` : ''}
  </div>`
}

// ── Tablas ───────────────────────────────────────────────────────────
function tabla(cabeceras: string[], filas: string[][], vacio = 'Nada esta semana.'): string {
  if (filas.length === 0) return `<p class="nota">${vacio}</p>`
  return `<table>
    <thead><tr>${cabeceras.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`
}

export function generarInformeSemanal(d: DatosInforme): void {
  const dias = d.dias ?? 7
  const desdeMs = Date.now() - dias * 86400000
  const desdeISO = new Date(desdeMs).toISOString()
  const desdeDia = desdeISO.slice(0, 10)
  const hoy = new Date()

  const playersById = new Map(d.scoutingPlayers.map(p => [p.id, p]))
  const fechaR = (r: ScoutingReport) => r.fecha ?? r.createdAt ?? ''
  const reportesSemana = d.scoutingReports.filter(r => fechaR(r) >= desdeISO)

  // ── 1 · Nuevos «Llamar» ────────────────────────────────────────────
  // Un jugador es «nuevo en Llamar» si esta semana alguien ha escrito un
  // informe con conclusión Llamar, o si su valoración pasó a Llamar/Basque.
  const llamarSemana = new Map<string, ScoutingReport[]>()
  for (const r of reportesSemana) {
    if (normConcl(r.conclusion) !== 'Llamar') continue
    ;(llamarSemana.get(r.playerId) ?? llamarSemana.set(r.playerId, []).get(r.playerId)!).push(r)
  }
  for (const p of d.scoutingPlayers) {
    if ((p.assessment === 'Llamar' || p.assessment === 'Basque') &&
        p.assessmentUpdatedAt && p.assessmentUpdatedAt >= desdeISO &&
        !llamarSemana.has(p.id)) {
      llamarSemana.set(p.id, [])
    }
  }

  const fichasLlamar = [...llamarSemana.entries()]
    .map(([id, rs]) => ({ p: playersById.get(id), rs }))
    .filter((x): x is { p: ScoutingPlayer; rs: ScoutingReport[] } => !!x.p)
    .sort((a, b) => a.p.fullName.localeCompare(b.p.fullName))

  const bloquesLlamar = fichasLlamar.map(({ p, rs }) => {
    const todos = d.scoutingReports.filter(r => r.playerId === p.id)
      .sort((a, b) => fechaR(b).localeCompare(fechaR(a)))
    const muestra = (rs.length ? rs : todos).slice(0, 2)
    const zona = zonaDe(p.team, d.clubZonas)
    return `
      <div class="ficha">
        <div class="ficha-cab">
          <strong>${esc(p.fullName)}</strong>
          <span class="gris">${esc(p.position1 ?? '—')} · ${anyo(p.birthdate)} · ${esc(p.team ?? '—')}${zona ? ` · ${esc(ZONA_CORTA[zona])}` : ''}</span>
          <span class="pill">${esc(p.assessment ?? 'sin valorar')}</span>
        </div>
        ${muestra.map(r => `
          <p class="informe">
            <span class="autor">${esc(nombreDe(r.persona, d.profiles))}</span>
            <span class="gris">${fecha(fechaR(r))}${normConcl(r.conclusion) ? ` · ${esc(normConcl(r.conclusion))}` : ''}</span><br>
            ${esc(resumir(r.texto))}
          </p>`).join('')}
        ${todos.length > muestra.length ? `<p class="nota">Tiene ${todos.length} informes en total.</p>` : ''}
      </div>`
  }).join('')

  // Movimientos de valoración
  const movimientos = d.scoutingPlayers
    .filter(p => p.assessment && p.assessmentUpdatedAt && p.assessmentUpdatedAt >= desdeISO)
    .sort((a, b) => (b.assessmentUpdatedAt ?? '').localeCompare(a.assessmentUpdatedAt ?? ''))

  // Pipeline
  const nuevosPipeline = d.firmasEntries.filter(e => e.createdAt && e.createdAt >= desdeISO)
  const firmados = d.firmasEntries.filter(e => e.status === 'firmado' && e.signedAt && e.signedAt >= desdeDia)

  // ── 2 · Actividad y cobertura ──────────────────────────────────────
  const porScout = new Map<string, { informes: number; jugadores: Set<string>; partidos: Set<string> }>()
  for (const r of reportesSemana) {
    const k = r.persona ?? '—'
    const e = porScout.get(k) ?? { informes: 0, jugadores: new Set<string>(), partidos: new Set<string>() }
    e.informes++
    e.jugadores.add(r.playerId)
    if (r.matchId) e.partidos.add(r.matchId)
    porScout.set(k, e)
  }
  const actividad = [...porScout.entries()].sort((a, b) => b[1].informes - a[1].informes)

  const partidosSemana = d.scoutingMatches
    .filter(m => m.date >= desdeDia && m.date <= hoy.toISOString().slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date))
  const jugadoresPorPartido = new Map<string, number>()
  for (const mp of d.matchPlayers) jugadoresPorPartido.set(mp.matchId, (jugadoresPorPartido.get(mp.matchId) ?? 0) + 1)

  // Cobertura por zona
  const porZona = new Map<string, { jugadores: number; informes: number }>()
  const informesPorJugador = new Map<string, number>()
  for (const r of reportesSemana) informesPorJugador.set(r.playerId, (informesPorJugador.get(r.playerId) ?? 0) + 1)
  for (const p of d.scoutingPlayers) {
    const z = zonaDe(p.team, d.clubZonas)
    const k = z ? ZONA_CORTA[z] : 'Sin zona'
    const e = porZona.get(k) ?? { jugadores: 0, informes: 0 }
    e.jugadores++
    e.informes += informesPorJugador.get(p.id) ?? 0
    porZona.set(k, e)
  }
  const cobertura = [...porZona.entries()].sort((a, b) => b[1].informes - a[1].informes)

  // ── 3 · Lo que requiere decisión ───────────────────────────────────
  const conclusionDe = new Map<string, Map<string, string>>()
  for (const r of d.scoutingReports) {
    const c = normConcl(r.conclusion)
    if (!c || !r.persona) continue
    const m = conclusionDe.get(r.playerId) ?? new Map<string, string>()
    m.set(r.persona, c)
    conclusionDe.set(r.playerId, m)
  }
  const debates = [...conclusionDe.entries()]
    .filter(([, m]) => { const v = new Set(m.values()); return v.has('Llamar') && v.has('Descartar') })
    .map(([id, m]) => ({ p: playersById.get(id), m }))
    .filter((x): x is { p: ScoutingPlayer; m: Map<string, string> } => !!x.p)

  const ultimoInforme = new Map<string, string>()
  for (const r of d.scoutingReports) {
    const f = fechaR(r)
    if (!ultimoInforme.has(r.playerId) || f > ultimoInforme.get(r.playerId)!) ultimoInforme.set(r.playerId, f)
  }
  const hace60 = new Date(Date.now() - 60 * 86400000).toISOString()
  const enfriandose = d.scoutingPlayers
    .filter(p => (p.assessment === 'Llamar' || p.assessment === 'Basque') && (ultimoInforme.get(p.id) ?? '') < hace60)
    .sort((a, b) => (ultimoInforme.get(a.id) ?? '').localeCompare(ultimoInforme.get(b.id) ?? ''))
    .slice(0, 15)

  const calientesSinAccion = d.firmasEntries.filter(e => e.status === 'caliente' && !e.nextActionDate)

  const agenda = d.firmasEntries
    .filter(e => e.status !== 'firmado' && e.nextActionDate && e.nextActionDate >= hoy.toISOString().slice(0, 10))
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''))
    .slice(0, 15)

  const proximosPartidos = d.scoutingMatches
    .filter(m => m.date > hoy.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 15)

  // ── 4 · Campogramas ────────────────────────────────────────────────
  const enLlamar = d.scoutingPlayers.filter(p => p.assessment === 'Llamar')
  const enBasque = d.scoutingPlayers.filter(p => p.assessment === 'Basque')
  const nuevosSemana = fichasLlamar.map(x => x.p)

  const rango = `${new Date(desdeMs).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} – ${hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Captación · informe semanal ${rango}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 10pt; margin: 0; line-height: 1.35; }
  h1 { font-size: 17pt; margin: 0 0 2px; }
  h2 { font-size: 12pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #1e293b; }
  h3 { font-size: 10.5pt; margin: 10px 0 4px; }
  .cab { display: flex; align-items: baseline; gap: 10px; border-bottom: 3px solid #1e293b; padding-bottom: 6px; margin-bottom: 4px; }
  .gris { color: #64748b; font-weight: normal; font-size: 9pt; }
  .nota { color: #94a3b8; font-size: 8.5pt; font-style: italic; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 8.5pt; }
  th { text-align: left; background: #f1f5f9; padding: 3px 5px; border-bottom: 1px solid #cbd5e1; font-size: 8pt; text-transform: uppercase; color: #475569; }
  td { padding: 3px 5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .ficha { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 9px; margin-bottom: 7px; page-break-inside: avoid; }
  .ficha-cab { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 3px; }
  .pill { margin-left: auto; font-size: 8pt; font-weight: bold; background: #fef3c7; color: #92400e; border-radius: 10px; padding: 1px 7px; }
  .informe { margin: 4px 0 0; font-size: 8.8pt; }
  .autor { font-weight: bold; }
  .pagina { page-break-after: always; }
  .campo-bloque { page-break-inside: avoid; margin-bottom: 12px; position: relative; }
  .campo { width: 100%; height: 150mm; display: block; border-radius: 6px; }
  .capa { position: absolute; left: 0; top: 22px; height: 150mm; }
  .dos { display: flex; gap: 14px; }
  .dos > * { flex: 1; }
  @media print { .noimp { display: none; } }
</style></head>
<body>

<div class="pagina">
  <div class="cab">
    <h1>Captación · informe semanal</h1>
    <span class="gris">${esc(rango)}</span>
  </div>
  <p class="gris">${fichasLlamar.length} nuevos en Llamar · ${reportesSemana.length} informes · ${partidosSemana.length} partidos vistos</p>

  <h2>Nuevos en «Llamar»</h2>
  ${bloquesLlamar || '<p class="nota">Ningún jugador nuevo en Llamar esta semana.</p>'}

  <h2>Movimientos de valoración</h2>
  ${tabla(['Jugador', 'Equipo', 'Año', 'Pasa a'], movimientos.map(p => [
    esc(p.fullName), esc(p.team ?? '—'), anyo(p.birthdate), `<strong>${esc(p.assessment)}</strong>`,
  ]))}
</div>

<div class="pagina">
  <h2>Actividad de la semana</h2>
  ${tabla(['Scout', 'Informes', 'Jugadores', 'Partidos'], actividad.map(([av, e]) => [
    esc(nombreDe(av, d.profiles)), String(e.informes), String(e.jugadores.size), String(e.partidos.size),
  ]), 'Ningún informe esta semana.')}

  <h2>Partidos vistos</h2>
  ${tabla(['Fecha', 'Partido', 'Competición', 'Modo', 'Jugadores'], partidosSemana.map(m => [
    fecha(m.date), `${esc(m.homeTeam)} – ${esc(m.awayTeam)}`, esc(m.competition ?? '—'),
    m.viewMode === 'campo' ? 'Campo' : 'Vídeo', String(jugadoresPorPartido.get(m.id) ?? 0),
  ]), 'Ningún partido registrado esta semana.')}

  <h2>Cobertura por zona</h2>
  ${tabla(['Zona', 'Jugadores en BBDD', 'Informes esta semana'], cobertura.map(([z, e]) => [
    esc(z), String(e.jugadores), String(e.informes),
  ]))}

  <h2>Pipeline</h2>
  ${tabla(['Jugador', 'Zona', 'Estatus', 'Encargado'], nuevosPipeline.map(e => [
    esc(e.playerName), esc(e.zone ?? '—'), esc(e.status), esc(e.managers.map(m => nombreDe(m, d.profiles)).join(', ') || '—'),
  ]), 'Nadie nuevo en el pipeline esta semana.')}
  ${firmados.length ? `<p><strong>Firmados:</strong> ${firmados.map(e => esc(e.playerName)).join(' · ')}</p>` : ''}
</div>

<div class="pagina">
  <h2>Requiere decisión</h2>

  <h3>Debates abiertos <span class="gris">(un scout dice Llamar y otro Descartar)</span></h3>
  ${tabla(['Jugador', 'Equipo', 'Opiniones'], debates.map(({ p, m }) => [
    esc(p.fullName), esc(p.team ?? '—'),
    [...m.entries()].map(([a, c]) => `${esc(nombreDe(a, d.profiles))}: ${esc(c)}`).join(' · '),
  ]), 'Sin debates pendientes.')}

  <h3>Destacados que se enfrían <span class="gris">(sin informe en 60 días)</span></h3>
  ${tabla(['Jugador', 'Equipo', 'Valoración', 'Último informe'], enfriandose.map(p => [
    esc(p.fullName), esc(p.team ?? '—'), esc(p.assessment), fecha(ultimoInforme.get(p.id)),
  ]), 'Ninguno.')}

  <h3>Calientes sin próxima acción</h3>
  ${tabla(['Jugador', 'Zona', 'Encargado'], calientesSinAccion.map(e => [
    esc(e.playerName), esc(e.zone ?? '—'), esc(e.managers.map(m => nombreDe(m, d.profiles)).join(', ') || '—'),
  ]), 'Ninguno.')}

  <h3>Agenda de los próximos días</h3>
  <div class="dos">
    <div>
      ${tabla(['Fecha', 'Acción'], agenda.map(e => [
        fecha(e.nextActionDate), `${esc(e.playerName)} — ${esc(e.nextAction ?? '—')}`,
      ]), 'Sin acciones programadas.')}
    </div>
    <div>
      ${tabla(['Fecha', 'Partido'], proximosPartidos.map(m => [
        fecha(m.date), `${esc(m.homeTeam)} – ${esc(m.awayTeam)}`,
      ]), 'Sin partidos programados.')}
    </div>
  </div>
</div>

<div class="pagina">
  <div class="cab"><h1>Campograma · nuevos en Llamar</h1><span class="gris">${esc(rango)}</span></div>
  ${campograma('Nuevos esta semana', nuevosSemana)}
</div>

<div class="pagina">
  <div class="cab"><h1>Campograma · Llamar</h1><span class="gris">Todos los jugadores en Llamar</span></div>
  ${campograma('En Llamar', enLlamar)}
</div>

${enBasque.length ? `<div>
  <div class="cab"><h1>Campograma · Basque</h1></div>
  ${campograma('En Basque', enBasque)}
</div>` : ''}

<script>window.onload = function () { window.print() }</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) {
    alert('El navegador ha bloqueado la ventana del informe. Permite las ventanas emergentes de esta página y vuelve a intentarlo.')
    return
  }
  w.document.write(html)
  w.document.close()
}
