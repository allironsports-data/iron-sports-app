// ── Informe de jugador (Mantenimiento) · documento para compartir ────
//
// Ficha deportiva + contrato + todos los informes internos (rendimiento y
// partidos) de UN jugador nuestro, lista para imprimir o guardar como PDF
// y enviar por email/WhatsApp al hablar de él con un club, un compañero…
//
// A propósito NO sale nada de Captación (esto es Mantenimiento, no
// scouting de fichajes) ni datos personales sensibles (teléfono, familia,
// personalidad, pasaporte): solo lo deportivo y lo contractual.

import type { Player } from '../types'
import { calcAge } from '../types'
import { positionLabel } from './positions'

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fechaCorta = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

const CLUB_TYPE_LABEL: Record<string, string> = {
  principal: '',
  cedido_en: 'cedido en',
  propietario: 'propietario',
  compartido: 'doble registro',
}

function clubesTexto(player: Player): string {
  if (player.clubs.length === 0) return 'Sin club'
  return player.clubs
    .map(c => CLUB_TYPE_LABEL[c.type] ? `${esc(c.name)} <span class="tag">${esc(CLUB_TYPE_LABEL[c.type])}</span>` : esc(c.name))
    .join(' · ')
}

const VENUE_LABEL: Record<string, string> = { local: 'Local', visitante: 'Visitante' }
const ROLE_LABEL: Record<string, string> = { titular: 'Titular', suplente: 'Suplente', no_convocado: 'No convocado' }

function filaPartido(r: Player['matchReports'][number]): string {
  const stats = [
    `${r.minutesPlayed}'`,
    r.goals ? `${r.goals} gol${r.goals === 1 ? '' : 'es'}` : '',
    r.assists ? `${r.assists} asist.` : '',
    r.yellowCards ? `${r.yellowCards} amarilla${r.yellowCards === 1 ? '' : 's'}` : '',
    r.redCard ? 'roja' : '',
  ].filter(Boolean).join(' · ')
  return `
    <tr>
      <td class="f">${esc(fechaCorta(r.date))}</td>
      <td>
        vs ${esc(r.opponent)} <span class="sub">${esc(r.competition)}${r.venue ? ` · ${esc(VENUE_LABEL[r.venue] ?? r.venue)}` : ''}</span>
        ${r.notes ? `<div class="nota">${esc(r.notes)}</div>` : ''}
      </td>
      <td class="c">${esc(ROLE_LABEL[r.role] ?? r.role)}</td>
      <td class="c">${esc(stats || '—')}</td>
      <td class="c">${r.rating != null ? esc(r.rating) : '—'}</td>
    </tr>`
}

function filaRendimiento(n: Player['performance'][number]): string {
  return `
    <article class="obs">
      <div class="obs-cab">${esc(fechaCorta(n.date))}${n.category ? ` · ${esc(n.category)}` : ''}${n.rating ? ` · ${esc(n.rating)}/10` : ''}</div>
      ${n.title ? `<div class="obs-title">${esc(n.title)}</div>` : ''}
      <p class="desc">${esc(n.content)}</p>
    </article>`
}

/** Genera y abre (nueva pestaña) el informe del jugador, listo para imprimir/PDF */
export function generarInformeJugador(player: Player): void {
  const partidos = [...player.matchReports].sort((a, b) => b.date.localeCompare(a.date))
  const rendimiento = [...player.performance].sort((a, b) => b.date.localeCompare(a.date))
  const cc = player.clubContract
  const rc = player.representationContract

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>All Iron Sports · ${esc(player.name)}</title>
<style>
  @page { size: A4; margin: 20mm 26mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #22282f; font-size: 9.5pt; line-height: 1.5; margin: 0;
    -webkit-font-smoothing: antialiased;
  }
  .portada { display: flex; align-items: center; gap: 14px; border-bottom: 1.5pt solid #1a2029; padding-bottom: 12px; margin-bottom: 14px; }
  .avatar { width: 46px; height: 46px; border-radius: 10px; background: #eef1f4; color: #6f7883; font-size: 15pt; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .marca { font-size: 7.5pt; letter-spacing: 2.6px; text-transform: uppercase; color: #9aa3ae; }
  .portada h1 { font-size: 19pt; font-weight: 600; letter-spacing: -0.4px; margin: 2px 0 2px; color: #1a2029; }
  .portada .meta { font-size: 9pt; color: #6f7883; }
  .tag { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.3px; color: #9aa3ae; }

  section { margin-top: 18px; page-break-inside: auto; }
  section h2 {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #1a2029; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 0.75pt solid #d8dde3;
  }

  .datos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; font-size: 9pt; }
  .datos .k { color: #9aa3ae; }
  .datos .v { color: #1a2029; }
  .fila-dato { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 0.5pt solid #f0f2f5; }

  table.partidos { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.partidos td { padding: 5px 8px 5px 0; border-bottom: 0.5pt solid #eef1f4; vertical-align: top; }
  table.partidos tr:last-child td { border-bottom: none; }
  table.partidos .f { width: 20mm; color: #9aa3ae; white-space: nowrap; }
  table.partidos .c { color: #6f7883; text-align: right; white-space: nowrap; }
  .sub { color: #9aa3ae; font-size: 8pt; }
  .nota { color: #6f7883; font-size: 8pt; margin-top: 2px; }

  .obs { padding: 0 0 10px; margin-bottom: 10px; border-bottom: 0.5pt solid #eef1f4; page-break-inside: avoid; }
  section .obs:last-child { border-bottom: none; margin-bottom: 0; }
  .obs-cab { font-size: 7.5pt; letter-spacing: 0.4px; color: #9aa3ae; }
  .obs-title { font-size: 9.5pt; font-weight: 600; color: #1a2029; margin-top: 2px; }
  .desc { margin: 2px 0 0; font-size: 8.8pt; color: #4c5560; }

  .vacio { font-size: 8.8pt; color: #9aa3ae; font-style: italic; }

  .pie {
    margin-top: 20px; padding-top: 7px; border-top: 0.5pt solid #e6eaee;
    font-size: 7pt; letter-spacing: 0.9px; text-transform: uppercase; color: #aab2bb;
  }
</style></head>
<body>

<div class="portada">
  <div class="avatar">${esc(player.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
  <div>
    <div class="marca">All Iron Sports</div>
    <h1>${esc(player.name)}</h1>
    <div class="meta">
      ${player.positions.map(p => esc(positionLabel(p) || p)).join(' / ') || '—'}
      · ${calcAge(player.birthDate)} años (${esc(fechaCorta(player.birthDate))})
      · ${esc(player.nationality || '—')}
      ${player.foot ? ` · ${esc(player.foot)}` : ''}
    </div>
  </div>
</div>

<section>
  <h2>Club</h2>
  <p class="desc">${clubesTexto(player)}</p>
</section>

<section>
  <h2>Contrato</h2>
  <div class="fila-dato"><span class="k">Contrato con el club</span><span class="v">${cc?.endDate ? `hasta ${esc(fechaCorta(cc.endDate))}` : '—'}${cc?.optionalYears ? ` (+${esc(cc.optionalYears)} años opcionales)` : ''}</span></div>
  ${cc?.releaseClause ? `<div class="fila-dato"><span class="k">Cláusula de rescisión</span><span class="v">${esc(cc.releaseClause)}</span></div>` : ''}
  ${cc?.bonuses ? `<div class="fila-dato"><span class="k">Bonus</span><span class="v">${esc(cc.bonuses)}</span></div>` : ''}
  ${cc?.agentCommission ? `<div class="fila-dato"><span class="k">Comisión de agencia</span><span class="v">${esc(cc.agentCommission)}</span></div>` : ''}
  ${cc?.notes ? `<div class="fila-dato"><span class="k">Notas</span><span class="v">${esc(cc.notes)}</span></div>` : ''}
  <div class="fila-dato"><span class="k">Representación (All Iron Sports)</span><span class="v">${rc?.start ? `${esc(fechaCorta(rc.start))} – ${esc(fechaCorta(rc.end))}` : '—'}</span></div>
  ${player.contractHistory.length > 0 ? `
    <div style="margin-top:8px">
      ${player.contractHistory.map(h => `<div class="fila-dato"><span class="k">${esc(h.period)}</span><span class="v">${esc(h.club)} · ${esc(h.type)}</span></div>`).join('')}
    </div>` : ''}
</section>

<section>
  <h2>Informes de partido <span style="float:right;font-weight:400;color:#9aa3ae">${partidos.length}</span></h2>
  ${partidos.length === 0
    ? '<p class="vacio">Sin informes de partido registrados.</p>'
    : `<table class="partidos">
        <tbody>${partidos.map(filaPartido).join('')}</tbody>
      </table>`}
</section>

<section>
  <h2>Notas de rendimiento <span style="float:right;font-weight:400;color:#9aa3ae">${rendimiento.length}</span></h2>
  ${rendimiento.length === 0
    ? '<p class="vacio">Sin notas de rendimiento registradas.</p>'
    : rendimiento.map(filaRendimiento).join('')}
</section>

<div class="pie">All Iron Sports · Ficha de ${esc(player.name)} · ${esc(fechaCorta(new Date().toISOString()))}</div>

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
