// ── Informe mensual de captación · documento para clubes ─────────────
// Esto NO es un informe interno: es el documento que se manda a un club
// para decirle «esto es lo interesante que hemos visto este mes».
//
// Por eso, a propósito, NO sale nada de dentro de casa: ni quién escribió
// cada informe, ni las conclusiones internas (Llamar/Descartar), ni la
// actividad de cada scout, ni la cobertura por zonas, ni el pipeline.
// Solo los jugadores, por qué son interesantes, y el campograma.
//
// Se abre listo para imprimir → «Guardar como PDF».

import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../types'

export interface DatosInformeMensual {
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  /** Días que abarca el informe (30 por defecto) */
  dias?: number
}

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fechaCorta = (iso?: string): string => {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const anyo = (bd?: string): string => (bd && /^\d{4}/.test(bd)) ? bd.slice(0, 4) : '—'

const normConcl = (c?: string) => c === 'Firmar' ? 'Llamar' : (c || undefined)

/** Descripción corta a partir del informe, sin cortar a mitad de palabra */
function resumir(texto?: string, max = 420): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const ultimo = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('; '), corte.lastIndexOf(', '))
  return (ultimo > max * 0.5 ? corte.slice(0, ultimo + 1) : corte) + '…'
}

// ── Posiciones ───────────────────────────────────────────────────────
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

/** Los doce puestos, agrupados en las cinco líneas de siempre */
const LINEA: Record<string, string> = {
  POR: 'Porteros',
  LD: 'Defensas', CTD: 'Defensas', CT: 'Defensas', CTI: 'Defensas', LI: 'Defensas',
  PIV: 'Centro del campo', MC: 'Centro del campo', MP: 'Centro del campo',
  ED: 'Bandas', EI: 'Bandas',
  DEL: 'Delanteros',
}
const ORDEN_LINEAS = ['Porteros', 'Defensas', 'Centro del campo', 'Bandas', 'Delanteros', 'Otros']

function campograma(jugadores: ScoutingPlayer[]): string {
  const porSlot: Record<string, ScoutingPlayer[]> = {}
  for (const p of jugadores) {
    const sl = slotDe(p.position1) ?? slotDe(p.position2)
    if (!sl) continue
    ;(porSlot[sl] ??= []).push(p)
  }
  const marcas = SLOTS.map(s => {
    const pls = porSlot[s.id] ?? []
    const visibles = pls.slice(0, 5)
    return `
      <div class="slot" style="left:${s.x}%; top:${s.y}%">
        <div class="slot-pos${pls.length ? '' : ' vacio'}">${s.id}</div>
        ${visibles.map(p => `<div class="slot-jug">${esc(p.fullName)} <span>'${anyo(p.birthdate).slice(2)}</span></div>`).join('')}
        ${pls.length > visibles.length ? `<div class="slot-mas">+${pls.length - visibles.length}</div>` : ''}
      </div>`
  }).join('')

  return `
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
    </div>`
}

export function generarInformeMensual(d: DatosInformeMensual): void {
  const dias = d.dias ?? 30
  const desdeMs = Date.now() - dias * 86400000
  const desdeISO = new Date(desdeMs).toISOString()
  const desdeDia = desdeISO.slice(0, 10)
  const hoy = new Date()

  const playersById = new Map(d.scoutingPlayers.map(p => [p.id, p]))
  const fechaR = (r: ScoutingReport) => r.fecha ?? r.createdAt ?? ''
  const informesPeriodo = d.scoutingReports.filter(r => fechaR(r) >= desdeISO)

  // ── Quién entra en el informe ──────────────────────────────────────
  // SOLO los vistos en el periodo: si a alguien no se le ha visto este mes,
  // no es novedad para el club aunque lleve tiempo en «Llamar».
  // De los vistos, entran los que interesan: o el informe de este mes
  // concluye que sí, o su valoración actual es de destacado.
  const vistosAhora = new Set(informesPeriodo.map(r => r.playerId))
  const concluyeLlamar = new Set(
    informesPeriodo.filter(r => normConcl(r.conclusion) === 'Llamar').map(r => r.playerId),
  )
  const interesantes = new Set<string>()
  for (const id of vistosAhora) {
    const p = playersById.get(id)
    if (!p) continue
    if (concluyeLlamar.has(id) || p.assessment === 'Llamar' || p.assessment === 'Basque') {
      interesantes.add(id)
    }
  }

  const seleccion = [...interesantes]
    .map(id => playersById.get(id))
    .filter((p): p is ScoutingPlayer => !!p)
    // A los mayores (nacidos antes de 2002) solo se les incluye si están en
    // «Llamar»: a esa edad, un simple seguimiento ya no es noticia para un club.
    .filter(p => {
      const y = Number(anyo(p.birthdate))
      if (!Number.isFinite(y)) return true
      return y >= 2002 || p.assessment === 'Llamar'
    })

  // TODAS las observaciones del periodo de cada jugador, de la más reciente
  // a la más antigua, cada una con su fecha y el partido en el que se hizo.
  const partidoDe = new Map<string, ScoutingMatch>(d.scoutingMatches.map(m => [m.id, m]))
  const observacionesDe = new Map<string, { fecha: string; partido?: string; texto: string }[]>()
  for (const p of seleccion) {
    const suyas = informesPeriodo
      .filter(r => r.playerId === p.id && (r.texto ?? '').trim().length > 20)
      .sort((a, b) => fechaR(b).localeCompare(fechaR(a)))
      .map(r => {
        const m = r.matchId ? partidoDe.get(r.matchId) : undefined
        return {
          fecha: fechaCorta(fechaR(r)),
          partido: m ? `${m.homeTeam} – ${m.awayTeam}` : undefined,
          texto: resumir(r.texto),
        }
      })
    if (suyas.length) observacionesDe.set(p.id, suyas)
  }

  // Agrupados por línea
  const porLinea = new Map<string, ScoutingPlayer[]>()
  for (const p of seleccion) {
    const sl = slotDe(p.position1) ?? slotDe(p.position2)
    const l = sl ? LINEA[sl] : 'Otros'
    ;(porLinea.get(l) ?? porLinea.set(l, []).get(l)!).push(p)
  }
  for (const lista of porLinea.values()) {
    lista.sort((a, b) => anyo(a.birthdate).localeCompare(anyo(b.birthdate)) || a.fullName.localeCompare(b.fullName))
  }

  const partidos = d.scoutingMatches.filter(m => m.date >= desdeDia && m.date <= hoy.toISOString().slice(0, 10))
  const clubesVistos = new Set<string>()
  for (const m of partidos) { if (m.homeTeam) clubesVistos.add(m.homeTeam.trim()); if (m.awayTeam) clubesVistos.add(m.awayTeam.trim()) }

  const mes = new Date(desdeMs + 15 * 86400000)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const rango = `${new Date(desdeMs).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} – ${hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`

  const bloquesPorLinea = ORDEN_LINEAS
    .filter(l => (porLinea.get(l)?.length ?? 0) > 0)
    .map(l => {
      const lista = porLinea.get(l)!
      return `
      <section class="linea">
        <h2>${esc(l)} <span class="cuenta">${lista.length}</span></h2>
        ${lista.map(p => `
          <article class="jug">
            <header>
              <h3>${esc(p.fullName)}</h3>
              <div class="meta">
                <span>${esc(p.position1 ?? '—')}</span>
                <span>${anyo(p.birthdate)}</span>
                <span>${esc(p.team ?? '—')}</span>
                ${p.foot ? `<span>${esc(p.foot)}</span>` : ''}
                ${p.nationality ? `<span>${esc(p.nationality)}</span>` : ''}
                ${p.clubContract ? `<span>Contrato hasta ${esc(p.clubContract)}</span>` : ''}
              </div>
            </header>
            ${(observacionesDe.get(p.id) ?? []).map(o => `
              <div class="obs">
                <div class="obs-cab">${esc(o.fecha)}${o.partido ? ` · ${esc(o.partido)}` : ''}</div>
                <p class="desc">${esc(o.texto)}</p>
              </div>`).join('')}
          </article>`).join('')}
      </section>`
    }).join('')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>All Iron Sports · Seguimiento de captación · ${esc(mes)}</title>
<style>
  @page { size: A4; margin: 20mm 28mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #22282f; font-size: 9.5pt; line-height: 1.5; margin: 0;
    -webkit-font-smoothing: antialiased;
  }

  .portada { border-bottom: 1.5pt solid #1a2029; padding-bottom: 10px; margin-bottom: 6px; }
  .marca { font-size: 7.5pt; letter-spacing: 2.6px; text-transform: uppercase; color: #9aa3ae; }
  .portada h1 { font-size: 21pt; font-weight: 600; letter-spacing: -0.5px; margin: 4px 0 2px; color: #1a2029; }
  .portada .rango { font-size: 9pt; color: #6f7883; }


  .cifras { display: flex; gap: 30px; margin: 20px 0 2px; }
  .cifra .n { font-size: 20pt; font-weight: 600; color: #1a2029; line-height: 1; letter-spacing: -0.6px; }
  .cifra .l { font-size: 7.5pt; letter-spacing: 1.2px; text-transform: uppercase; color: #9aa3ae; margin-top: 4px; }

  .linea { margin-top: 22px; page-break-inside: auto; }
  .linea h2 {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;
    color: #1a2029; margin: 0 0 10px; padding-bottom: 5px; border-bottom: 0.75pt solid #d8dde3;
  }
  .cuenta { float: right; font-weight: 400; color: #9aa3ae; letter-spacing: 0; }

  .jug { padding: 0 0 13px; margin-bottom: 13px; border-bottom: 0.5pt solid #eef1f4; page-break-inside: avoid; }
  .linea .jug:last-child { border-bottom: none; margin-bottom: 0; }
  .jug h3 { font-size: 11pt; font-weight: 600; margin: 0; color: #1a2029; letter-spacing: -0.2px; }
  .meta { font-size: 8pt; color: #6f7883; margin-top: 2px; }
  .meta span + span::before { content: "·"; margin: 0 6px; color: #c3cad2; }
  .obs { margin-top: 7px; }
  .obs-cab { font-size: 7.5pt; letter-spacing: 0.4px; color: #9aa3ae; }
  .desc { margin: 1px 0 0; font-size: 8.8pt; color: #4c5560; }

  .pagina { page-break-after: always; }

  .campo { position: relative; width: 100%; height: 204mm; overflow: hidden; margin-top: 10px; }
  .lineas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .slot {
    position: absolute; transform: translate(-50%, -50%); width: 44mm;
    display: flex; flex-direction: column; align-items: center; gap: 1.5px;
  }
  .slot-pos { font-size: 6.5pt; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,.85); }
  .slot-pos.vacio { color: rgba(255,255,255,.28); }
  .slot-jug {
    font-size: 7.5pt; line-height: 1.35; color: #1a2029; background: #fff;
    border-radius: 2px; padding: 0.5px 6px; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    box-shadow: 0 0.5pt 1.5pt rgba(0,0,0,.25);
  }
  .slot-jug span { color: #8a939e; font-size: 6.5pt; }
  .slot-mas { font-size: 6.5pt; color: rgba(255,255,255,.75); }

  table.partidos { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.partidos td { padding: 3.5px 8px 3.5px 0; border-bottom: 0.5pt solid #eef1f4; vertical-align: top; }
  table.partidos tr:last-child td { border-bottom: none; }
  table.partidos .f { width: 20mm; color: #9aa3ae; white-space: nowrap; }
  table.partidos .c { color: #9aa3ae; text-align: right; white-space: nowrap; }
  table.partidos .vs { color: #c3cad2; }

  .pie {
    margin-top: 18px; padding-top: 7px; border-top: 0.5pt solid #e6eaee;
    font-size: 7pt; letter-spacing: 0.9px; text-transform: uppercase; color: #aab2bb;
  }

  @media print {
    /* Sin esto el verde del campo no se imprime */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head>
<body>

<div class="pagina">
  <div class="portada">
    <div class="marca">All Iron Sports</div>
    <h1>Seguimiento de captación</h1>
    <div class="rango">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))} · ${esc(rango)}</div>
  </div>

  <div class="cifras">
    <div class="cifra"><div class="n">${seleccion.length}</div><div class="l">Jugadores de interés</div></div>
    <div class="cifra"><div class="n">${partidos.length}</div><div class="l">Partidos observados</div></div>
    <div class="cifra"><div class="n">${clubesVistos.size}</div><div class="l">Clubes</div></div>
    <div class="cifra"><div class="n">${informesPeriodo.length}</div><div class="l">Observaciones</div></div>
  </div>

  ${bloquesPorLinea || '<p class="desc">No hay jugadores destacados en este periodo.</p>'}

  <section class="linea">
    <h2>Partidos observados <span class="cuenta">${partidos.length}</span></h2>
    ${partidos.length === 0
      ? '<p class="desc">Ninguno en este periodo.</p>'
      : `<table class="partidos">
          <tbody>
            ${[...partidos].sort((a, b) => b.date.localeCompare(a.date)).map(m => `
              <tr>
                <td class="f">${esc(new Date(m.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }))}</td>
                <td>${esc(m.homeTeam)} <span class="vs">–</span> ${esc(m.awayTeam)}</td>
                <td class="c">${esc(m.competition ?? '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
  </section>

  <div class="pie">All Iron Sports · Seguimiento de captación · ${esc(rango)}</div>
</div>

<div>
  <div class="portada">
    <div class="marca">All Iron Sports</div>
    <h1>Reparto por posición</h1>
    <div class="rango">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))}</div>
  </div>
  ${campograma(seleccion)}
  <div class="pie">All Iron Sports · Seguimiento de captación · ${esc(rango)}</div>
</div>

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
