// Supabase Edge Function — notify-task
// Triggered via Database Webhook on INSERT into 'tasks' table
// and on INSERT into 'task_comments' table.
//
// Setup:
//  1. Deploy:  supabase functions deploy notify-task
//  2. Set secret: supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//  3. In Supabase Dashboard → Database → Webhooks:
//       Webhook A – Table: tasks,        Event: INSERT
//       Webhook B – Table: task_comments, Event: INSERT
//     Both point to: https://<project>.supabase.co/functions/v1/notify-task
//     Method: POST, include Authorization header: Bearer <ANON_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL     = "All Iron Sports <notificaciones@allironsports.com>"; // ← cambia al dominio verificado en Resend

serve(async (req) => {
  const payload = await req.json();
  const { type, table, record } = payload;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Helper: send email via Resend ──────────────────────────
  async function sendEmail(to: string, subject: string, html: string) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
  }

  // ── Helper: get profile email by id ───────────────────────
  async function getProfile(id: string) {
    const { data } = await supabase.auth.admin.getUserById(id);
    return data?.user ?? null;
  }

  async function getProfileRow(id: string) {
    const { data } = await supabase.from("profiles").select("name, avatar").eq("id", id).single();
    return data;
  }

  // ── NEW TASK ───────────────────────────────────────────────
  if (table === "tasks" && type === "INSERT") {
    const task = record;
    if (!task.assignee_id) return new Response("ok");

    const [user, profile] = await Promise.all([
      getProfile(task.assignee_id),
      getProfileRow(task.assignee_id),
    ]);
    if (!user?.email) return new Response("ok");

    // Get player name if applicable
    let playerName = "";
    if (task.player_id) {
      const { data } = await supabase.from("players").select("name").eq("id", task.player_id).single();
      playerName = data?.name ?? "";
    }

    const subject = `Nueva tarea asignada: ${task.title}`;
    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#1e3a5f">Hola ${profile?.name ?? ""},</h2>
        <p>Se te ha asignado una nueva tarea en <strong>All Iron Sports</strong>:</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Tarea:</strong> ${task.title}</p>
          ${task.description ? `<p style="margin:0 0 8px;color:#64748b">${task.description}</p>` : ""}
          ${playerName ? `<p style="margin:0 0 8px"><strong>Jugador:</strong> ${playerName}</p>` : ""}
          <p style="margin:0"><strong>Prioridad:</strong> ${task.priority === "alta" ? "⚡ Alta" : task.priority === "media" ? "Media" : "Baja"}</p>
          ${task.due_date ? `<p style="margin:8px 0 0"><strong>Fecha límite:</strong> ${new Date(task.due_date).toLocaleDateString("es-ES")}</p>` : ""}
        </div>
        <p style="color:#94a3b8;font-size:12px">All Iron Sports · Gestión de jugadores</p>
      </div>`;

    await sendEmail(user.email, subject, html);
  }

  // ── NEW COMMENT ────────────────────────────────────────────
  if (table === "task_comments" && type === "INSERT") {
    const comment = record;

    // Get the task
    const { data: task } = await supabase.from("tasks").select("*").eq("id", comment.task_id).single();
    if (!task) return new Response("ok");

    // Get author name
    const authorProfile = await getProfileRow(comment.author_id);

    // Notify assignee + watchers, but not the author themselves
    const notifyIds: string[] = [];
    if (task.assignee_id && task.assignee_id !== comment.author_id) notifyIds.push(task.assignee_id);
    (task.watchers ?? []).forEach((wId: string) => {
      if (wId !== comment.author_id && !notifyIds.includes(wId)) notifyIds.push(wId);
    });

    if (notifyIds.length === 0) return new Response("ok");

    // Get player name
    let playerName = "";
    if (task.player_id) {
      const { data } = await supabase.from("players").select("name").eq("id", task.player_id).single();
      playerName = data?.name ?? "";
    }

    const subject = `Nuevo comentario en "${task.title}"`;
    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#1e3a5f">Nuevo comentario</h2>
        <p><strong>${authorProfile?.name ?? "Alguien"}</strong> ha comentado en la tarea <strong>${task.title}</strong>${playerName ? ` (${playerName})` : ""}:</p>
        <div style="background:#f0f4ff;border-left:3px solid #3b82f6;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0">
          <p style="margin:0;color:#1e293b">${comment.content}</p>
        </div>
        <p style="color:#94a3b8;font-size:12px">All Iron Sports · Gestión de jugadores</p>
      </div>`;

    await Promise.all(notifyIds.map(async (uid) => {
      const user = await getProfile(uid);
      if (user?.email) await sendEmail(user.email, subject, html);
    }));
  }

  return new Response("ok");
});
