// Supabase Edge Function — crear-usuario
//
// Crea un usuario de Auth desde el panel de admin SIN usar signUp con la
// sesión del admin (con «Confirm email» desactivado, signUp dejaba al
// admin logueado como el usuario nuevo).
//
// Setup:
//  1. Deploy:  supabase functions deploy crear-usuario
//     (verify_jwt por defecto: la puerta de Supabase ya exige un JWT válido;
//      aquí además se comprueba que quien llama es admin en `profiles`).
//  2. Secretos: NO hace falta ninguno nuevo. SUPABASE_URL y
//     SUPABASE_SERVICE_ROLE_KEY vienen dados en toda Edge Function.
//
// Petición (desde la app): supabase.functions.invoke('crear-usuario',
//   { body: { email, password, name, avatar? } })
// (name y avatar van a user_metadata: el trigger handle_new_user los usa
//  para crear la fila de profiles, que nace con activo = false).
// Respuesta: { id } · errores: { error: '…' } con 400/401/403/409/500.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método no permitido" }, 405);

  // 1) ¿Quién llama? Se valida el JWT del Authorization: Bearer
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Falta la sesión" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Sesión no válida" }, 401);

  // 2) ¿Es admin? Se mira en profiles con el service role (salta RLS)
  const { data: perfil } = await admin
    .from("profiles").select("is_admin, activo").eq("id", who.user.id).maybeSingle();
  if (!perfil?.is_admin || perfil.activo === false) {
    return json({ error: "Solo un administrador puede crear usuarios" }, 403);
  }

  // 3) Datos
  let body: { email?: string; password?: string; name?: string; avatar?: string };
  try { body = await req.json(); } catch { return json({ error: "Cuerpo no válido" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const avatar = String(body.avatar ?? "").trim().toUpperCase().slice(0, 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email no válido" }, 400);
  if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  if (!name) return json({ error: "Falta el nombre" }, 400);

  // 4) Crear con email ya confirmado (no se envía correo)
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: avatar ? { name, avatar } : { name },
  });
  if (error) {
    const msg = error.message ?? "";
    const dup = /already|registered|exists/i.test(msg);
    return json({ error: dup ? "Ese email ya está registrado" : msg }, dup ? 409 : 500);
  }
  return json({ id: data.user.id });
});
