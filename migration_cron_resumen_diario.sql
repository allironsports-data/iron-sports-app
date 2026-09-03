-- ── Correo diario «Tu día»: pg_cron + pg_net → Edge Function resumen-diario ──
--
-- Ejecutar en el SQL Editor de Supabase (una vez). Es idempotente: se puede
-- volver a lanzar para cambiar la URL, el secreto o la hora.
--
-- ANTES de ejecutarlo, sustituye los dos valores de app_config de abajo:
--   · resumen_diario_url    → https://<project-ref>.supabase.co/functions/v1/resumen-diario
--   · resumen_diario_secret → el MISMO valor que `supabase secrets set CRON_SECRET=...`
--
-- Dónde se guardan: en una tabla `app_config` (clave/valor) SOLO legible por
-- el rol postgres/service_role (RLS sin políticas). No usamos Vault porque en
-- pg_cron el trabajo corre como el rol que lo creó (postgres) y la tabla es
-- más fácil de inspeccionar/editar desde el panel. Si prefieres Vault:
--   select vault.create_secret('<secreto>', 'resumen_diario_secret');
--   y en el job lee  (select decrypted_secret from vault.decrypted_secrets where name = 'resumen_diario_secret').

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Configuración (clave/valor) ──
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
-- Sin políticas: ni anon ni authenticated pueden leerla. Solo service_role/postgres.
revoke all on public.app_config from anon, authenticated;

insert into public.app_config (key, value) values
  ('resumen_diario_url',    'https://<project-ref>.supabase.co/functions/v1/resumen-diario'),
  ('resumen_diario_secret', '<CAMBIA-ESTO-POR-EL-CRON_SECRET>')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ── Trabajo programado ──
-- pg_cron trabaja en UTC. '0 6 * * *' = 06:00 UTC = 08:00 en Madrid en
-- verano (CEST, UTC+2) y 07:00 en invierno (CET, UTC+1). Si quieres 08:00
-- fijas todo el año hay que cambiar la hora a mano en cada cambio de horario
-- (últimos domingos de marzo y octubre): '0 7 * * *' en invierno.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'resumen-diario') then
    perform cron.unschedule('resumen-diario');
  end if;
end $$;

select cron.schedule(
  'resumen-diario',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := (select value from public.app_config where key = 'resumen_diario_url'),
    headers := jsonb_build_object(
      'x-cron-secret', (select value from public.app_config where key = 'resumen_diario_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Comprobar ──
-- select jobid, jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 5;
-- select id, status_code, content::text from net._http_response order by id desc limit 5;
--
-- Lanzarlo ahora mismo (sin esperar a mañana):
-- select net.http_post(
--   url := (select value from public.app_config where key = 'resumen_diario_url'),
--   headers := jsonb_build_object('x-cron-secret', (select value from public.app_config where key = 'resumen_diario_secret'), 'Content-Type', 'application/json'),
--   body := '{"dry": true}'::jsonb);
