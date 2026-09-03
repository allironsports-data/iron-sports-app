-- ══════════════════════════════════════════════════════════════════════
--  ERRORES DEL CLIENTE · lo que se rompe en el navegador queda apuntado
--
--  La app (src/lib/dbErrors.ts) inserta aquí desde ErrorBoundary y desde
--  window 'error' / 'unhandledrejection'. Solo un admin lo lee (pestaña
--  «Errores» del panel). Reejecutable.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.client_errors (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid default auth.uid(),
  build_id   text,
  ruta       text,
  mensaje    text,
  stack      text,
  contexto   jsonb,
  user_agent text
);

create index if not exists client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;

-- Insertar: cualquier cuenta autenticada y activa (el candado de abajo
-- exige activa). Solo puede apuntar su propio user_id.
drop policy if exists "Autenticados registran errores" on public.client_errors;
create policy "Autenticados registran errores"
  on public.client_errors for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- Leer y borrar («Vaciar antiguos»): solo admin
drop policy if exists "Admin lee errores" on public.client_errors;
create policy "Admin lee errores"
  on public.client_errors for select to authenticated
  using (public.es_admin());

drop policy if exists "Admin borra errores" on public.client_errors;
create policy "Admin borra errores"
  on public.client_errors for delete to authenticated
  using (public.es_admin());

-- Candado de cuenta activa: patrón del proyecto (seguridad_2_cierre.sql)
drop policy if exists cuenta_activa on public.client_errors;
create policy cuenta_activa on public.client_errors
  as restrictive for all to public
  using       (public.es_cuenta_activa())
  with check  (public.es_cuenta_activa());

-- Nota: NO se pone captacion_only_fuera: una cuenta «solo Captación»
-- también tiene que poder apuntar sus errores.

-- El freno de borrado masivo (trg_freno_borrado) NO se pone aquí a
-- propósito: «Vaciar antiguos» borra muchas filas de golpe y lo hace un
-- admin (que de todos modos tendría paso libre).

grant select, insert, delete on public.client_errors to authenticated;
grant usage on sequence public.client_errors_id_seq to authenticated;

-- ── Retención (opcional, pg_cron) ────────────────────────────────────
--   select cron.schedule('client_errors_retencion', '0 4 * * 0',
--     $$ delete from public.client_errors where at < now() - interval '3 months' $$);
-- A mano:
--   delete from public.client_errors where at < now() - interval '3 months';

-- ── COMPROBACIÓN ──────────────────────────────────────────────────────
select policyname, cmd, permissive from pg_policies
where schemaname = 'public' and tablename = 'client_errors' order by policyname;
