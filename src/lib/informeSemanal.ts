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

import type { ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer } from '../types'
import type { Profile } from '../contexts/AuthContext'
import { zonaDe, ZONA_CORTA, type Zona } from './zonas'

export interface DatosInforme {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  matchPlayers: ScoutingMatchPlayer[]
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

  // Las etiquetas son HTML posicionado en %, no texto dentro del SVG: el
  // texto SVG con preserveAspectRatio="none" salía estirado y gigante.
  const marcas = SLOTS.map(s => {
    const pls = porSlot[s.id] ?? []
    const visibles = pls.slice(0, 5)
    return `
      <div class="slot" style="left:${s.x}%; top:${s.y}%">
        <div class="slot-pos${pls.length ? '' : ' vacio'}">${s.id}${pls.length ? ` <b>${pls.length}</b>` : ''}</div>
        ${visibles.map(p => `<div class="slot-jug">${esc(p.fullName)} <span>'${anyo(p.birthdate).slice(2)}</span></div>`).join('')}
        ${pls.length > visibles.length ? `<div class="slot-mas">+${pls.length - visibles.length} más</div>` : ''}
      </div>`
  }).join('')

  return `
  <div class="campo-bloque">
    <h3>${esc(titulo)} <span class="gris">· ${jugadores.length} jugador${jugadores.length !== 1 ? 'es' : ''}</span></h3>
    <div class="campo">
      <svg class="lineas" viewBox="0 0 100 150" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="150" fill="#1e4d3b" />
        <rect x="2" y="2" width="96" height="146" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="0.5" />
        <line x1="2" y1="75" x2="98" y2="75" stroke="rgba(255,255,255,.32)" stroke-width="0.5" />
        <circle cx="50" cy="75" r="12" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="0.5" />
        <rect x="28" y="2" width="44" height="20" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="0.5" />
        <rect x="28" y="128" width="44" height="20" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="0.5" />
      </svg>
      ${marcas}
    </div>
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
  @page { size: A4; margin: 16mm 15mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2933; font-size: 9.5pt; line-height: 1.45; margin: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* Cabecera del documento */
  .portada { border-bottom: 1.5pt solid #16233a; padding-bottom: 9px; margin-bottom: 18px; }
  .marca { font-size: 7.5pt; letter-spacing: 2.4px; text-transform: uppercase; color: #8794a6; }
  .portada h1 { font-size: 20pt; font-weight: 600; letter-spacing: -0.4px; margin: 3px 0 2px; color: #16233a; }
  .portada .rango { font-size: 9pt; color: #6b7686; }

  /* Cifras de cabecera */
  .cifras { display: flex; gap: 26px; margin: 14px 0 4px; }
  .cifra .n { font-size: 19pt; font-weight: 600; color: #16233a; line-height: 1; letter-spacing: -0.5px; }
  .cifra .l { font-size: 7.5pt; letter-spacing: 1.1px; text-transform: uppercase; color: #8794a6; margin-top: 3px; }

  /* Secciones */
  h2 {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #16233a; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 0.75pt solid #d5dae2;
  }
  h2:first-of-type { margin-top: 16px; }
  h3 { font-size: 9pt; font-weight: 600; margin: 14px 0 5px; color: #3d4a5c; }
  h3 .gris { font-weight: 400; }

  .gris { color: #8794a6; font-weight: 400; font-size: 8.5pt; }
  .nota { color: #a3adba; font-size: 8pt; font-style: italic; margin: 4px 0 8px; }

  /* Tablas */
  table { width: 100%; border-collapse: collapse; margin: 5px 0 12px; font-size: 8.5pt; }
  th {
    text-align: left; padding: 4px 7px 4px 0; border-bottom: 0.75pt solid #c3cbd6;
    font-size: 7pt; letter-spacing: 1px; text-transform: uppercase; color: #8794a6; font-weight: 600;
  }
  td { padding: 4px 7px 4px 0; border-bottom: 0.5pt solid #eef1f5; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td strong { font-weight: 600; color: #16233a; }

  /* Fichas de jugador */
  .ficha {
    border-left: 2pt solid #16233a; padding: 2px 0 6px 11px;
    margin-bottom: 13px; page-break-inside: avoid;
  }
  .ficha-cab { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .ficha-cab strong { font-size: 10.5pt; font-weight: 600; color: #16233a; letter-spacing: -0.2px; }
  .pill {
    margin-left: auto; font-size: 7pt; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
    color: #16233a; border: 0.75pt solid #c3cbd6; border-radius: 2px; padding: 1px 7px;
  }
  .informe { margin: 6px 0 0; font-size: 8.5pt; color: #3d4a5c; }
  .autor { font-weight: 600; color: #16233a; }

  .pagina { page-break-after: always; }

  /* Campograma */
  .campo-bloque { page-break-inside: avoid; margin-bottom: 12px; }
  .campo { position: relative; width: 100%; height: 202mm; overflow: hidden; }
  .lineas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .slot {
    position: absolute; transform: translate(-50%, -50%); width: 44mm;
    display: flex; flex-direction: column; align-items: center; gap: 1.5px;
  }
  .slot-pos {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,.85);
  }
  .slot-pos.vacio { color: rgba(255,255,255,.3); }
  .slot-pos b { color: #fff; font-weight: 700; }
  .slot-jug {
    font-size: 7.5pt; line-height: 1.35; color: #16233a; background: #fff;
    border-radius: 2px; padding: 0.5px 6px; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    box-shadow: 0 0.5pt 1.5pt rgba(0,0,0,.25);
  }
  .slot-jug span { color: #8794a6; font-size: 6.5pt; }
  .slot-mas { font-size: 6.5pt; color: rgba(255,255,255,.75); }

  .pie { margin-top: 14px; padding-top: 6px; border-top: 0.5pt solid #e4e8ee;
         font-size: 7pt; letter-spacing: 0.8px; text-transform: uppercase; color: #a3adba; }

  @media print {
    .noimp { display: none; }
    /* Sin esto el verde del campo no se imprime */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head>
<body>

<div class="pagina">
  <div class="portada">
    <div class="marca">All Iron Sports · Captación</div>
    <h1>Informe semanal</h1>
    <div class="rango">${esc(rango)}</div>
  </div>
  <div class="cifras">
    <div class="cifra"><div class="n">${fichasLlamar.length}</div><div class="l">Nuevos en Llamar</div></div>
    <div class="cifra"><div class="n">${reportesSemana.length}</div><div class="l">Informes</div></div>
    <div class="cifra"><div class="n">${partidosSemana.length}</div><div class="l">Partidos vistos</div></div>
    <div class="cifra"><div class="n">${actividad.length}</div><div class="l">Scouts activos</div></div>
  </div>

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
  <div class="pie">All Iron Sports · Captación · ${esc(rango)}</div>

</div>

<div class="pagina">
  <h2>Requiere decisión</h2>

  <h3>Debates abiertos <span class="gris">(un scout dice Llamar y otro Descartar)</span></h3>
  ${tabla(['Jugador', 'Equipo', 'Opiniones'], debates.map(({ p, m }) => [
    esc(p.fullName), esc(p.team ?? '—'),
    [...m.entries()].map(([a, c]) => `${esc(nombreDe(a, d.profiles))}: ${esc(c)}`).join(' · '),
  ]), 'Sin debates pendientes.')}

  <h3>Próximos partidos programados</h3>
  ${tabla(['Fecha', 'Partido', 'Competición', 'Scout'], proximosPartidos.map(m => [
    fecha(m.date), `${esc(m.homeTeam)} – ${esc(m.awayTeam)}`, esc(m.competition ?? '—'),
    esc(m.assignedTo ? nombreDe(m.assignedTo, d.profiles) : '—'),
  ]), 'Sin partidos programados.')}
</div>

<div class="pagina">
  <div class="portada">
    <div class="marca">All Iron Sports · Captación</div>
    <h1>Campograma · nuevos en Llamar</h1>
    <div class="rango">${esc(rango)}</div>
  </div>
  ${campograma('Nuevos esta semana', nuevosSemana)}
</div>

<div class="pagina">
  <div class="portada">
    <div class="marca">All Iron Sports · Captación</div>
    <h1>Campograma · Llamar</h1>
    <div class="rango">Todos los jugadores en seguimiento activo</div>
  </div>
  ${campograma('En Llamar', enLlamar)}
</div>

${enBasque.length ? `<div>
  <div class="portada">
    <div class="marca">All Iron Sports · Captación</div>
    <h1>Campograma · Basque</h1>
  </div>
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
