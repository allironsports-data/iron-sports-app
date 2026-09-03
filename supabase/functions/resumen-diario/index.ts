// Supabase Edge Function — resumen-diario
// Correo de buenos días por persona: partidos de hoy asignados, acciones
// del pipeline Firmar vencidas/de hoy y tareas vencidas/de hoy. Solo se
// envía a quien tenga algo. La dispara pg_cron cada mañana (ver
// migration_cron_resumen_diario.sql) o un curl manual.
//
// Setup:
//  1. Deploy:  supabase functions deploy resumen-diario --no-verify-jwt
//     (--no-verify-jwt: la llama pg_net sin JWT; la protege x-cron-secret)
//  2. Secrets: supabase secrets set CRON_SECRET=<valor-largo> APP_URL=https://<app>
//     RESEND_API_KEY ya existe (la usa notify-task).
//  3. Prueba:  curl -X POST https://<project>.supabase.co/functions/v1/resumen-diario \
//                -H "x-cron-secret: <valor>" -H "Content-Type: application/json" -d '{}'
//     Con `{"dry": true}` devuelve el resumen en JSON sin enviar correos.
//     Con `{"solo": "<profile_id>"}` solo procesa a esa persona.
//
// Columnas (ver supabase_schema.sql, migration_captacion_firmas / firmas_v2/v3,
// migration_match_scouts y db.ts → dbToTask/dbToFirmasEntry/dbToScoutingMatch):
//   profiles:               id, name, avatar, activo (email en auth.users)
//   tasks:                  id, title, assignee_id, watchers[], status, due_date, player_id, admin_only
//   captacion_firmas:       id, player_name, zone, status, managers[], next_action,
//                           next_action_kind, next_action_date, next_action_assignee, next_action_task_id
//   scouting_matches:       id, date, time, home_team, away_team, competition, assigned_to, status
//   scouting_match_scouts:  match_id, scout (= profiles.avatar), status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET    = Deno.env.get("CRON_SECRET");
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL        = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
const FROM_EMAIL     = "All Iron Sports <notificaciones@allironsports.com>"; // ← dominio verificado en Resend

type Row = Record<string, unknown>;

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** AAAA-MM-DD de hoy en Europe/Madrid (el servidor corre en UTC). */
function hoyMadrid(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return `${dias[dt.getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]}`;
}

// Enlaces: hash routing de App.tsx (#/seccion, #/jugador/id). Las tareas
// viven en #/tareas y las acciones/partidos en #/captacion.
const link = (hash: string) => APP_URL ? `${APP_URL}/#/${hash}` : "";

const KIND: Record<string, string> = { llamada: "📞", whatsapp: "💬", reunion: "🤝", entorno: "👪", nota: "📝" };

interface Resumen {
  partidos: { hora?: string; titulo: string; sub: string }[];
  acciones: { titulo: string; sub: string; vencida: boolean }[];
  tareas: { titulo: string; sub: string; vencida: boolean }[];
}

function seccion(titulo: string, filas: string[], href: string): string {
  if (filas.length === 0) return "";
  return `
    <h3 style="margin:20px 0 6px;font-size:14px;color:#1e3a5f">${titulo}
      ${href ? ` <a href="${esc(href)}" style="font-size:12px;font-weight:normal;color:#3b82f6">abrir →</a>` : ""}</h3>
    <ul style="margin:0;padding-left:18px;color:#1e293b;font-size:14px;line-height:1.6">${filas.join("")}</ul>`;
}

function htmlCorreo(nombre: string, hoy: string, r: Resumen): string {
  const partidos = r.partidos.map(p =>
    `<li>${p.hora ? `<strong>${esc(p.hora)}</strong> · ` : ""}${esc(p.titulo)}${p.sub ? ` <span style="color:#64748b">— ${esc(p.sub)}</span>` : ""}</li>`);
  const acciones = r.acciones.map(a =>
    `<li>${a.vencida ? `<span style="color:#dc2626;font-weight:bold">VENCIDA</span> · ` : ""}${esc(a.titulo)}${a.sub ? ` <span style="color:#64748b">— ${esc(a.sub)}</span>` : ""}</li>`);
  const tareas = r.tareas.map(t =>
    `<li>${t.vencida ? `<span style="color:#dc2626;font-weight:bold">VENCIDA</span> · ` : ""}${esc(t.titulo)}${t.sub ? ` <span style="color:#64748b">— ${esc(t.sub)}</span>` : ""}</li>`);
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px">
      <h2 style="color:#1e3a5f;margin:0 0 4px">Buenos días, ${esc(nombre)}</h2>
      <p style="margin:0;color:#64748b;font-size:13px">Tu día · ${esc(fechaLarga(hoy))}</p>
      ${seccion("⚽ Partidos de hoy", partidos, link("captacion"))}
      ${seccion("📌 Acciones del pipeline vencidas / de hoy", acciones, link("captacion"))}
      ${seccion("✅ Tareas vencidas / de hoy", tareas, link("tareas"))}
      ${APP_URL ? `<p style="margin:24px 0 0"><a href="${esc(link("tareas"))}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Abrir la app</a></p>` : ""}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">All Iron Sports · resumen automático de cada mañana</p>
    </div>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) { console.error("Resend error", res.status, await res.text()); return false; }
    return true;
  } catch (err) { console.error("Resend fetch failed", err); return false; }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  // Sin secreto configurado también se rechaza: mejor no enviar nada.
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let opts: { dry?: boolean; solo?: string; hoy?: string } = {};
  try { opts = await req.json(); } catch { /* cuerpo vacío = por defecto */ }

  const hoy = opts.hoy && /^\d{4}-\d{2}-\d{2}$/.test(opts.hoy) ? opts.hoy : hoyMadrid();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Datos (service role: sin RLS) ──
  const [profilesRes, tasksRes, firmasRes, matchesRes] = await Promise.all([
    supabase.from("profiles").select("id, name, avatar, activo"),
    supabase.from("tasks").select("id, title, assignee_id, watchers, status, due_date, player_id, admin_only")
      .neq("status", "completada").lte("due_date", hoy),
    supabase.from("captacion_firmas")
      .select("id, player_name, zone, status, managers, next_action, next_action_kind, next_action_date, next_action_assignee, next_action_task_id")
      .neq("status", "firmado").lte("next_action_date", hoy),
    supabase.from("scouting_matches").select("id, date, time, home_team, away_team, competition, assigned_to, status").eq("date", hoy),
  ]);
  for (const r of [profilesRes, tasksRes, firmasRes, matchesRes]) {
    if (r.error) { console.error(r.error); return new Response(JSON.stringify({ error: r.error.message }), { status: 500 }); }
  }
  const profiles = (profilesRes.data ?? []) as Row[];
  const tasks = (tasksRes.data ?? []) as Row[];
  const firmas = (firmasRes.data ?? []) as Row[];
  const matches = (matchesRes.data ?? []) as Row[];

  // Scouts de los partidos de hoy (tabla opcional: si no existe, cae a assigned_to)
  let scouts: Row[] = [];
  if (matches.length > 0) {
    const { data, error } = await supabase.from("scouting_match_scouts").select("match_id, scout, status")
      .in("match_id", matches.map(m => m.id as string));
    if (error) console.warn("scouting_match_scouts:", error.message); else scouts = (data ?? []) as Row[];
  }
  const scoutsPorPartido = new Map<string, Row[]>();
  for (const s of scouts) {
    const arr = scoutsPorPartido.get(s.match_id as string);
    if (arr) arr.push(s); else scoutsPorPartido.set(s.match_id as string, [s]);
  }

  // Nombres de jugadores de las tareas (para el subtítulo)
  const playerIds = [...new Set(tasks.map(t => t.player_id as string | null).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data } = await supabase.from("players").select("id, name").in("id", playerIds);
    for (const p of (data ?? []) as Row[]) nombres.set(p.id as string, p.name as string);
  }

  // Emails: profiles no guarda el email; está en auth.users
  const emails = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error(error); break; }
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 200) break;
  }

  // ── Resumen por persona ──
  const resultado: { id: string; name: string; email?: string; enviado: boolean; resumen: Resumen }[] = [];
  for (const p of profiles) {
    const pid = p.id as string;
    if (p.activo === false) continue;            // cuenta no aprobada
    if (opts.solo && opts.solo !== pid) continue;
    const avatar = p.avatar as string;
    const r: Resumen = { partidos: [], acciones: [], tareas: [] };

    for (const m of matches) {
      const ss = scoutsPorPartido.get(m.id as string);
      const mio = ss && ss.length > 0
        ? ss.some(s => s.scout === avatar && s.status !== "visto")
        : m.assigned_to === avatar && m.status !== "visto";
      if (!mio) continue;
      r.partidos.push({
        hora: (m.time as string | null)?.slice(0, 5) || undefined,
        titulo: `${m.home_team} vs ${m.away_team}`,
        sub: (m.competition as string | null) ?? "",
      });
    }
    r.partidos.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));

    const tareasDeAcciones = new Set<string>();
    for (const f of firmas) {
      const managers = (f.managers as string[] | null) ?? [];
      const mia = f.next_action_assignee ? f.next_action_assignee === pid : managers.includes(pid);
      if (!mia) continue;
      if (f.next_action_task_id) tareasDeAcciones.add(f.next_action_task_id as string);
      const fecha = f.next_action_date as string;
      const vencida = fecha < hoy;
      r.acciones.push({
        titulo: `${KIND[(f.next_action_kind as string) ?? ""] ?? "📌"} ${f.next_action || "Próxima acción"} · ${f.player_name}`,
        sub: [f.zone, vencida ? `desde el ${fechaCorta(fecha)}` : "hoy"].filter(Boolean).join(" · "),
        vencida,
      });
    }
    r.acciones.sort((a, b) => Number(b.vencida) - Number(a.vencida));

    for (const t of tasks) {
      const watchers = (t.watchers as string[] | null) ?? [];
      if (t.assignee_id !== pid && !watchers.includes(pid)) continue;
      // La tarea generada por una acción de Firmar ya sale en «Acciones»: no se repite
      if (tareasDeAcciones.has(t.id as string)) continue;
      const fecha = t.due_date as string;
      const vencida = fecha < hoy;
      const jugador = t.player_id ? nombres.get(t.player_id as string) : undefined;
      r.tareas.push({
        titulo: t.title as string,
        sub: [jugador, vencida ? `vencía el ${fechaCorta(fecha)}` : "hoy"].filter(Boolean).join(" · "),
        vencida,
      });
    }
    r.tareas.sort((a, b) => Number(b.vencida) - Number(a.vencida));

    const total = r.partidos.length + r.acciones.length + r.tareas.length;
    if (total === 0) continue;

    const email = emails.get(pid);
    let enviado = false;
    if (email && !opts.dry) {
      const partes = [
        r.partidos.length ? `${r.partidos.length} partido${r.partidos.length > 1 ? "s" : ""}` : "",
        r.acciones.length ? `${r.acciones.length} acci${r.acciones.length > 1 ? "ones" : "ón"}` : "",
        r.tareas.length ? `${r.tareas.length} tarea${r.tareas.length > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(" · ");
      enviado = await sendEmail(email, `Tu día · ${fechaCorta(hoy)} · ${partes}`, htmlCorreo(p.name as string, hoy, r));
    }
    resultado.push({ id: pid, name: p.name as string, email, enviado, resumen: r });
  }

  return new Response(JSON.stringify({ hoy, dry: !!opts.dry, personas: resultado.length, enviados: resultado.filter(x => x.enviado).length, detalle: resultado }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
