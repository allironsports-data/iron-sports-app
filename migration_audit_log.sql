-- ══════════════════════════════════════════════════════════════════════
--  AUDITORÍA · quién cambió qué
--
--  Tabla public.audit_log rellenada SOLO por un trigger (security definer)
--  en las tablas que importan. Nadie escribe directo: la política de
--  insert no existe para ningún rol, y el trigger salta RLS.
--
--  Reejecutable: todo va con if not exists / or replace / drop if exists.
--  Ejecuta el script ENTERO en el editor SQL de Supabase.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  user_id  uuid default auth.uid(),
  tabla    text not null,
  fila_id  text not null,
  accion   text not null check (accion in ('INSERT','UPDATE','DELETE')),
  antes    jsonb,
  despues  jsonb,
  cambios  jsonb
);

create index if not exists audit_log_tabla_fila_at_idx on public.audit_log (tabla, fila_id, at desc);
create index if not exists audit_log_at_idx            on public.audit_log (at desc);

-- ── Función del trigger ──────────────────────────────────────────────
-- En UPDATE guarda en `cambios` solo las claves que cambian, como
-- {campo: [antes, despues]}. Si lo único que cambia es updated_at, no
-- escribe nada (ruido).
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $audit$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_id      text;
  k         text;
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new);
    v_id := coalesce(v_despues->>'id', '?');
    insert into public.audit_log (tabla, fila_id, accion, despues)
    values (tg_table_name, v_id, 'INSERT', v_despues);
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
    v_id := coalesce(v_antes->>'id', '?');
    insert into public.audit_log (tabla, fila_id, accion, antes)
    values (tg_table_name, v_id, 'DELETE', v_antes);
    return null;
  end if;

  -- UPDATE
  v_antes   := to_jsonb(old);
  v_despues := to_jsonb(new);
  v_id := coalesce(v_despues->>'id', v_antes->>'id', '?');
  for k in select jsonb_object_keys(v_antes || v_despues) loop
    if k = 'updated_at' then continue; end if;
    if (v_antes->k) is distinct from (v_despues->k) then
      v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_array(v_antes->k, v_despues->k));
    end if;
  end loop;
  if v_cambios = '{}'::jsonb then return null; end if;

  insert into public.audit_log (tabla, fila_id, accion, antes, despues, cambios)
  values (tg_table_name, v_id, 'UPDATE', v_antes, v_despues, v_cambios);
  return null;
end
$audit$;

-- ── Triggers AFTER en las tablas que importan ────────────────────────
do $trg$
declare
  t text;
  tablas text[] := array[
    'players', 'clubs', 'club_negotiations', 'captacion_firmas',
    'scouting_players', 'scouting_reports', 'tasks'
  ];
begin
  foreach t in array tablas loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t) then
      execute format('drop trigger if exists trg_audit on public.%I', t);
      execute format($g$
        create trigger trg_audit
          after insert or update or delete on public.%I
          for each row execute function public.audit_row()
      $g$, t);
    end if;
  end loop;
end
$trg$;

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;

-- Leer: cualquier cuenta autenticada (y activa, por el candado de abajo)
drop policy if exists "Autenticados leen auditoria" on public.audit_log;
create policy "Autenticados leen auditoria"
  on public.audit_log for select using (auth.role() = 'authenticated');

-- Insertar/actualizar/borrar: NADIE desde la app (no hay política). El
-- trigger es security definer y entra igual. El editor SQL/service_role
-- también, para la retención.

-- Candado de cuenta activa: el mismo patrón que el resto de tablas
-- (seguridad_2_cierre.sql, PARTE 2). Restrictivo: se suma con Y.
drop policy if exists cuenta_activa on public.audit_log;
create policy cuenta_activa on public.audit_log
  as restrictive for all to public
  using       (public.es_cuenta_activa())
  with check  (public.es_cuenta_activa());

-- Cuenta «solo Captación»: fuera (patrón de rls_captacion_only.sql).
-- El historial mezcla jugadores de agencia, clubes y negociaciones.
drop policy if exists captacion_only_fuera on public.audit_log;
create policy captacion_only_fuera on public.audit_log
  as restrictive for all to authenticated
  using       (not public.es_captacion_only())
  with check  (not public.es_captacion_only());

-- Que ninguna cuenta de la app pueda tocar la tabla ni aunque apareciera
-- una política permisiva por descuido.
revoke insert, update, delete on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
-- (el trigger inserta como dueño de la función, no necesita permisos de la app)

-- ── Retención (opcional, pg_cron) ────────────────────────────────────
-- Para no acumular para siempre, con la extensión pg_cron activada:
--   select cron.schedule('audit_log_retencion', '0 4 * * 0',
--     $$ delete from public.audit_log where at < now() - interval '12 months' $$);
-- O a mano cuando toque:
--   delete from public.audit_log where at < now() - interval '12 months';

-- ── COMPROBACIÓN ──────────────────────────────────────────────────────
select c.relname as tabla, count(*) as triggers
from pg_trigger g join pg_class c on c.oid = g.tgrelid
where g.tgname = 'trg_audit' group by c.relname order by c.relname;
