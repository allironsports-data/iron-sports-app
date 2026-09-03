// ── Informe de un jugador de Captación · documento para compartir ────
//
// Ficha deportiva de UN jugador de scouting (ScoutingPlayer) con todas las
// observaciones (ScoutingReport) que se le han hecho, en un documento de
// una página listo para imprimir o guardar como PDF y compartir.
//
// Igual que informeMensual.ts: es un documento hacia FUERA, así que no
// lleva nada interno — ni el assessment (Llamar/Seguir/Descartar), ni
// quién escribió cada informe, ni el contacto/agencia. Solo lo deportivo
// y lo que se ha observado de él.

import type { ScoutingPlayer, ScoutingReport, ScoutingMatch } from '../types'
import { fechaLocal } from './fechas'

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fechaCorta = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

const anyo = (bd?: string): string => (bd && /^\d{4}/.test(bd)) ? bd.slice(0, 4) : '—'

function edad(bd?: string): number | null {
  if (!bd) return null
  const y = Number(bd.slice(0, 4))
  if (!Number.isFinite(y)) return null
  return new Date().getFullYear() - y
}

/** Genera y abre (nueva pestaña) el informe del jugador de Captación, listo para imprimir/PDF */
export function generarInformeScouting(player: ScoutingPlayer, reports: ScoutingReport[], matches: ScoutingMatch[]): void {
  const partidoDe = new Map(matches.map(m => [m.id, m]))
  const observaciones = reports
    .filter(r => (r.texto ?? '').trim().length > 0 || r.titulo)
    .sort((a, b) => (b.fecha ?? b.createdAt ?? '').localeCompare(a.fecha ?? a.createdAt ?? ''))
    .map(r => {
      const m = r.matchId ? partidoDe.get(r.matchId) : undefined
      return {
        fecha: fechaCorta(r.fecha ?? r.createdAt),
        partido: m ? `${m.homeTeam} – ${m.awayTeam}` : undefined,
        titulo: r.titulo,
        texto: (r.texto ?? '').trim(),
      }
    })

  const a = edad(player.birthdate)
  const meta = [
    player.position1 && player.position2 ? `${esc(player.position1)} / ${esc(player.position2)}` : esc(player.position1 ?? player.position2 ?? ''),
    a != null ? `${a} años (${esc(anyo(player.birthdate))})` : '',
    esc(player.nationality ?? ''),
    player.foot ? esc(player.foot) : '',
  ].filter(Boolean).join(' · ')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>All Iron Sports · ${esc(player.fullName)}</title>
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

  section { margin-top: 18px; page-break-inside: auto; }
  section h2 {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #1a2029; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 0.75pt solid #d8dde3;
  }

  .fila-dato { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 0.5pt solid #f0f2f5; font-size: 9pt; }
  .fila-dato .k { color: #9aa3ae; }
  .fila-dato .v { color: #1a2029; }

  .obs { padding: 0 0 11px; margin-bottom: 11px; border-bottom: 0.5pt solid #eef1f4; page-break-inside: avoid; }
  section .obs:last-child { border-bottom: none; margin-bottom: 0; }
  .obs-cab { font-size: 7.5pt; letter-spacing: 0.4px; color: #9aa3ae; }
  .obs-title { font-size: 9.5pt; font-weight: 600; color: #1a2029; margin-top: 2px; }
  .desc { margin: 2px 0 0; font-size: 8.8pt; color: #4c5560; white-space: pre-line; }

  .vacio { font-size: 8.8pt; color: #9aa3ae; font-style: italic; }

  .pie {
    margin-top: 20px; padding-top: 7px; border-top: 0.5pt solid #e6eaee;
    font-size: 7pt; letter-spacing: 0.9px; text-transform: uppercase; color: #aab2bb;
  }
</style></head>
<body>

<div class="portada">
  <div class="avatar">${esc(player.fullName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
  <div>
    <div class="marca">All Iron Sports</div>
    <h1>${esc(player.fullName)}</h1>
    <div class="meta">${meta || '—'}</div>
  </div>
</div>

<section>
  <h2>Ficha</h2>
  <div class="fila-dato"><span class="k">Equipo</span><span class="v">${esc(player.team ?? '—')}</span></div>
  ${player.categoria ? `<div class="fila-dato"><span class="k">Categoría</span><span class="v">${esc(player.categoria)}${player.segundaCategoria ? ` / ${esc(player.segundaCategoria)}` : ''}</span></div>` : ''}
  ${player.nationalTeam ? `<div class="fila-dato"><span class="k">Selección</span><span class="v">${esc(player.nationalTeam)}</span></div>` : ''}
  ${player.clubContract ? `<div class="fila-dato"><span class="k">Contrato con el club</span><span class="v">${esc(player.clubContract)}</span></div>` : ''}
</section>

<section>
  <h2>Observaciones <span style="float:right;font-weight:400;color:#9aa3ae">${observaciones.length}</span></h2>
  ${observaciones.length === 0
    ? '<p class="vacio">Sin observaciones registradas.</p>'
    : observaciones.map(o => `
      <article class="obs">
        <div class="obs-cab">${esc(o.fecha)}${o.partido ? ` · ${esc(o.partido)}` : ''}</div>
        ${o.titulo ? `<div class="obs-title">${esc(o.titulo)}</div>` : ''}
        ${o.texto ? `<p class="desc">${esc(o.texto)}</p>` : ''}
      </article>`).join('')}
</section>

<div class="pie">All Iron Sports · Ficha de ${esc(player.fullName)} · ${esc(fechaCorta(fechaLocal(new Date())))}</div>

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
