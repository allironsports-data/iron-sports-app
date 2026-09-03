-- ══════════════════════════════════════════════════════════════════════
--  TODAS LAS MIGRACIONES DE LA TANDA 2 (3-sep-2026) EN UN SOLO SCRIPT
--
--  Contiene, en este orden:
--    1. migration_updated_at_triggers.sql  → conflictos al editar
--    2. migration_audit_log.sql            → Admin → Historial
--    3. migration_client_errors.sql        → Admin → Errores
--    4. migration_contactos_supabase.sql   → Contactos compartidos
--    5. migration_cron_resumen_diario.sql  → correo diario (pg_cron + pg_net)
--    6. migration_match_nuestros.sql       → Planificación: jugadores nuestros a mano
--
--  ANTES DE EJECUTAR (solo para el correo diario, parte 5): busca en este
--  fichero «<project-ref>» y «<CAMBIA-ESTO-POR-EL-CRON_SECRET>» y pon tu
--  ref de proyecto y el valor de CRON_SECRET. Si lo ejecutas sin editarlos
--  no pasa nada malo: la parte 5 deja los marcadores tal cual y basta con
--  editarlos y volver a ejecutar SOLO esa parte (o el script entero).
--  Al reejecutar, un valor real de app_config NUNCA se pisa con un marcador.
--
--  Requiere que ya estén ejecutados los scripts de seguridad de agosto
--  (seguridad_2_cierre.sql, seguridad_3_almacen.sql, rls_captacion_only.sql):
--  crean es_cuenta_activa(), es_captacion_only(), es_admin() y
--  freno_borrado_masivo(). Si falta alguna, el script lo dice con un NOTICE
--  y sigue sin esa protección.
--
--  Todo es idempotente: se puede ejecutar entero tantas veces como haga
--  falta. Ejecutado dos veces contra un Postgres 16 local con simulación de
--  Supabase y pruebas de permisos (3-sep-2026).
-- ══════════════════════════════════════════════════════════════════════



-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 1 · migration_updated_at_triggers.sql                         │
-- └────────────────────────────────────────────────────────────────────┘

-- ============================================================================
-- updated_at + trigger de control de conflictos
-- ============================================================================
--
-- Qué hace:
--   1. Asegura la columna `updated_at timestamptz default now()` en
--      players, clubs, club_negotiations, captacion_firmas y scouting_players.
--      (players y clubs no la tenían; en las otras ya existía o existe según
--      la instalación: `add column if not exists` lo cubre todo.)
--   2. Crea la función `set_updated_at()` y un trigger BEFORE UPDATE en cada
--      tabla que pone `updated_at = now()` SOLO si el cliente no lo ha
--      cambiado en ese mismo UPDATE.
--
-- Por qué «solo si el cliente no lo ha cambiado»:
--   La app (src/lib/db.ts) ya escribe `updated_at` en cada update y usa el
--   valor leído como condición (`.eq('updated_at', visto)`) para detectar que
--   otro usuario ha guardado entre medias. Si el trigger pisara siempre el
--   valor con now(), daría igual, pero así el valor que la app manda y el que
--   le vuelve son el mismo. El trigger es la RED para clientes viejos (o
--   SQL a mano) que no manden updated_at: sin él, esas escrituras no
--   cambiarían updated_at y la detección de conflictos no las vería.
--
-- Reejecutable: `if not exists` / `create or replace` / `drop trigger if
-- exists`. Se puede lanzar tantas veces como haga falta sin efectos.
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Si el cliente ha mandado un updated_at distinto al que había, se respeta.
  -- Si no lo ha tocado (o lo ha mandado igual), lo ponemos nosotros.
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- players
alter table public.players
  add column if not exists updated_at timestamptz not null default now();
-- Si la columna ya existía sin default (add column la salta), se lo ponemos:
-- sin esto un insert que no mande updated_at dejaría NULL para siempre.
alter table public.players alter column updated_at set default now();
drop trigger if exists trg_set_updated_at on public.players;
create trigger trg_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- clubs
alter table public.clubs
  add column if not exists updated_at timestamptz not null default now();
-- Si la columna ya existía sin default (add column la salta), se lo ponemos:
-- sin esto un insert que no mande updated_at dejaría NULL para siempre.
alter table public.clubs alter column updated_at set default now();
drop trigger if exists trg_set_updated_at on public.clubs;
create trigger trg_set_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

-- club_negotiations
alter table public.club_negotiations
  add column if not exists updated_at timestamptz not null default now();
-- Si la columna ya existía sin default (add column la salta), se lo ponemos:
-- sin esto un insert que no mande updated_at dejaría NULL para siempre.
alter table public.club_negotiations alter column updated_at set default now();
drop trigger if exists trg_set_updated_at on public.club_negotiations;
create trigger trg_set_updated_at
  before update on public.club_negotiations
  for each row execute function public.set_updated_at();

-- captacion_firmas
alter table public.captacion_firmas
  add column if not exists updated_at timestamptz not null default now();
-- Si la columna ya existía sin default (add column la salta), se lo ponemos:
-- sin esto un insert que no mande updated_at dejaría NULL para siempre.
alter table public.captacion_firmas alter column updated_at set default now();
drop trigger if exists trg_set_updated_at on public.captacion_firmas;
create trigger trg_set_updated_at
  before update on public.captacion_firmas
  for each row execute function public.set_updated_at();

-- scouting_players
alter table public.scouting_players
  add column if not exists updated_at timestamptz not null default now();
-- Si la columna ya existía sin default (add column la salta), se lo ponemos:
-- sin esto un insert que no mande updated_at dejaría NULL para siempre.
alter table public.scouting_players alter column updated_at set default now();
drop trigger if exists trg_set_updated_at on public.scouting_players;
create trigger trg_set_updated_at
  before update on public.scouting_players
  for each row execute function public.set_updated_at();

-- Filas antiguas con updated_at nulo (si la columna existía sin default):
update public.players            set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update public.clubs              set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update public.club_negotiations  set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update public.captacion_firmas   set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update public.scouting_players   set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;


-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 2 · migration_audit_log.sql                                   │
-- └────────────────────────────────────────────────────────────────────┘

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


-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 3 · migration_client_errors.sql                               │
-- └────────────────────────────────────────────────────────────────────┘

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


-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 4 · migration_contactos_supabase.sql                          │
-- └────────────────────────────────────────────────────────────────────┘

-- ══════════════════════════════════════════════════════════════════════
--  CONTACTOS → SUPABASE
--
--  Hasta ahora la agenda vivía en public/contactos.json + localStorage de
--  cada navegador: nadie compartía nada. Esto crea las dos tablas:
--
--    public.contactos            la agenda compartida (los 3.065 de base +
--                                los añadidos a mano). Se conservan los ids
--                                del JSON para no romper favoritos.
--    public.contactos_favoritos  favoritos POR USUARIO.
--
--  Reejecutable: cada paso comprueba antes de crear. Ejecútalo en
--  Supabase → SQL Editor → New Query. Los datos NO los sube este script:
--  los sube la app con el botón «Importar ahora» (solo admin).
--
--  Reglas de acceso (mismo patrón que el resto de tablas):
--   · leer y escribir: cualquier cuenta autenticada y ACTIVA
--     (candado `cuenta_activa`, igual que en seguridad_2_cierre.sql).
--   · las cuentas «solo Captación» no ven la agenda (tiene teléfonos).
--   · borrar de verdad: solo admin. La app nunca borra: marca deleted.
--   · freno de borrado masivo (> 25 filas) para no-admin.
--   · favoritos: cada uno solo ve y toca los suyos.
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 1 · TABLAS
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.contactos (
  id          text primary key,             -- id del JSON o 'custom_<uuid>'
  name        text,
  team        text,
  region      text not null default 'Sin clasificar',
  role        text,
  phone1      text,
  phone2      text,
  tier        text,
  no_contact  boolean not null default false,   -- club sin persona asignada
  no_club     boolean not null default false,   -- persona sin club
  origen      text not null default 'manual'
                check (origen in ('base', 'manual')),
  deleted     boolean not null default false,   -- borrado lógico
  created_by  uuid references public.profiles on delete set null default auth.uid(),
  updated_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contactos_region_idx  on public.contactos (region);
create index if not exists contactos_deleted_idx on public.contactos (deleted);

create table if not exists public.contactos_favoritos (
  user_id     uuid not null references public.profiles on delete cascade,
  contacto_id text not null references public.contactos on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, contacto_id)
);

alter table public.contactos           enable row level security;
alter table public.contactos_favoritos enable row level security;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 2 · TRIGGER updated_at / updated_by
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.contactos_set_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Desde el editor SQL auth.uid() es nulo: se conserva el que hubiera.
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end
$$;

drop trigger if exists trg_contactos_set_updated on public.contactos;
create trigger trg_contactos_set_updated
  before insert or update on public.contactos
  for each row execute function public.contactos_set_updated();


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 3 · RLS de contactos
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Autenticados leen contactos"       on public.contactos;
drop policy if exists "Autenticados crean contactos"      on public.contactos;
drop policy if exists "Autenticados actualizan contactos" on public.contactos;
drop policy if exists "Solo admin borra contactos"        on public.contactos;

create policy "Autenticados leen contactos"
  on public.contactos for select using (auth.role() = 'authenticated');
create policy "Autenticados crean contactos"
  on public.contactos for insert with check (auth.role() = 'authenticated');
create policy "Autenticados actualizan contactos"
  on public.contactos for update using (auth.role() = 'authenticated');
create policy "Solo admin borra contactos"
  on public.contactos for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- 3b. Candados RESTRICTIVOS del proyecto (se suman con Y). Solo si las
--     funciones existen (las crean seguridad_2_cierre.sql y
--     rls_captacion_only.sql); si no, se avisa y se sigue.
do $candados$
declare t text;
begin
  foreach t in array array['contactos', 'contactos_favoritos'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'es_cuenta_activa') then
      execute format('drop policy if exists %I on public.%I', 'cuenta_activa', t);
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to public
          using       (public.es_cuenta_activa())
          with check  (public.es_cuenta_activa())
      $p$, 'cuenta_activa', t);
    else
      raise notice 'es_cuenta_activa() no existe: ejecuta antes seguridad_2_cierre.sql y repite este script';
    end if;

    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'es_captacion_only') then
      execute format('drop policy if exists %I on public.%I', 'captacion_only_fuera', t);
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to authenticated
          using       (not public.es_captacion_only())
          with check  (not public.es_captacion_only())
      $p$, 'captacion_only_fuera', t);
    else
      raise notice 'es_captacion_only() no existe: ejecuta antes rls_captacion_only.sql y repite este script';
    end if;
  end loop;
end
$candados$;

-- 3c. Freno de borrado masivo (misma función que el resto de tablas).
do $freno$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'freno_borrado_masivo') then
    drop trigger if exists trg_freno_borrado on public.contactos;
    create trigger trg_freno_borrado
      after delete on public.contactos
      referencing old table as filas_borradas
      for each statement execute function public.freno_borrado_masivo();
  else
    raise notice 'freno_borrado_masivo() no existe: ejecuta antes seguridad_2_cierre.sql y repite este script';
  end if;
end
$freno$;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 4 · RLS de favoritos: solo el propio usuario
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Usuario gestiona sus favoritos" on public.contactos_favoritos;
create policy "Usuario gestiona sus favoritos"
  on public.contactos_favoritos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 5 · REALTIME (la app escucha cambios en `contactos`)
-- ══════════════════════════════════════════════════════════════════════

do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: la app funcionará sin sincronización en vivo';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos'
  ) then
    alter publication supabase_realtime add table public.contactos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos_favoritos'
  ) then
    alter publication supabase_realtime add table public.contactos_favoritos;
  end if;
end
$realtime$;


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN (lo único que verás en pantalla)
-- ══════════════════════════════════════════════════════════════════════

select bloque, detalle from (

  select 1 as orden, '1 · FILAS' as bloque,
         ('contactos: ' || (select count(*) from public.contactos)::text ||
          ' · favoritos: ' || (select count(*) from public.contactos_favoritos)::text)::text as detalle

  union all

  select 2, '2 · POLÍTICAS',
         (tablename || ' · ' || policyname || ' · ' || permissive)::text
  from pg_policies
  where schemaname = 'public' and tablename in ('contactos', 'contactos_favoritos')

  union all

  select 3, '3 · TRIGGERS',
         (c.relname || ' · ' || g.tgname)::text
  from pg_trigger g join pg_class c on c.oid = g.tgrelid
  where c.relname = 'contactos' and not g.tgisinternal

  union all

  select 4, '4 · REALTIME',
         tablename::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename in ('contactos', 'contactos_favoritos')

) t
order by orden, detalle;


-- ══════════════════════════════════════════════════════════════════════
--  SI ALGO SE ROMPE — cómo deshacerlo
--    drop table if exists public.contactos_favoritos;
--    drop table if exists public.contactos;
--    drop function if exists public.contactos_set_updated();
--  (la app vuelve sola al modo «solo en este dispositivo»)
-- ══════════════════════════════════════════════════════════════════════


-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 5 · migration_cron_resumen_diario.sql                         │
-- └────────────────────────────────────────────────────────────────────┘

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
on conflict (key) do update
  set value = excluded.value, updated_at = now()
  -- Un valor real nunca se pisa con un marcador sin editar.
  where excluded.value not like '%<%';

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




-- ┌────────────────────────────────────────────────────────────────────┐
-- │ PARTE 6 · migration_match_nuestros.sql                              │
-- └────────────────────────────────────────────────────────────────────┘

-- ══════════════════════════════════════════════════════════════════════
--  JUGADORES NUESTROS ASIGNADOS A MANO A UN PARTIDO
--
--  Captación → Planificación deduce solos los jugadores nuestros (tabla
--  `players`, Mantenimiento) que juegan cada partido por su club. Esta
--  tabla guarda los que se ASIGNAN A MANO desde la celda «Jugador»: los
--  que la deducción por club no pilla (club mal escrito, cedido…) o
--  cuando el partido es de otro equipo pero queremos verle ahí.
--
--    public.scouting_match_our_players   partido ⇄ jugador nuestro
--
--  Reejecutable: cada paso comprueba antes de crear. Ejecútalo en
--  Supabase → SQL Editor → New Query.
--
--  Reglas de acceso (mismo patrón que scouting_match_players):
--   · leer, vincular y desvincular: cualquier cuenta autenticada y ACTIVA
--     (candado `cuenta_activa`, igual que en seguridad_2_cierre.sql).
--   · las cuentas «solo Captación» NO ven esta tabla: enlaza con `players`
--     (Mantenimiento), que tampoco ven.
--   · sin freno de borrado masivo: es una tabla de enlace de pocas filas
--     que se borran de una en una (igual que scouting_match_players).
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 1 · COMPROBACIÓN DE TIPOS Y TABLA
-- ══════════════════════════════════════════════════════════════════════

-- Las dos claves foráneas son uuid (players.id en supabase_schema.sql;
-- scouting_matches.id la referencia scouting_reports.match_id uuid). Si en
-- este proyecto fueran de otro tipo, paramos con un mensaje claro en vez de
-- crear una tabla que luego no enlaza.
do $tipos$
declare t_m text; t_p text;
begin
  if to_regclass('public.scouting_matches') is null or to_regclass('public.players') is null then
    raise exception 'Faltan public.scouting_matches o public.players: ejecuta antes supabase_schema.sql';
  end if;
  select format_type(a.atttypid, a.atttypmod) into t_m
    from pg_attribute a where a.attrelid = 'public.scouting_matches'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_p
    from pg_attribute a where a.attrelid = 'public.players'::regclass and a.attname = 'id';
  if t_m <> 'uuid' or t_p <> 'uuid' then
    raise exception 'scouting_matches.id es % y players.id es %: adapta los tipos de match_id/player_id en este script', t_m, t_p;
  end if;
end
$tipos$;

create table if not exists public.scouting_match_our_players (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.scouting_matches(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now(),
  unique (match_id, player_id)
);

create index if not exists scouting_match_our_players_match_idx  on public.scouting_match_our_players (match_id);
create index if not exists scouting_match_our_players_player_idx on public.scouting_match_our_players (player_id);

alter table public.scouting_match_our_players enable row level security;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 2 · RLS
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Autenticados leen nuestros en partido"     on public.scouting_match_our_players;
drop policy if exists "Autenticados vinculan nuestros a partido"  on public.scouting_match_our_players;
drop policy if exists "Autenticados desvinculan nuestros"         on public.scouting_match_our_players;

create policy "Autenticados leen nuestros en partido"
  on public.scouting_match_our_players for select using (auth.role() = 'authenticated');
create policy "Autenticados vinculan nuestros a partido"
  on public.scouting_match_our_players for insert with check (auth.role() = 'authenticated');
create policy "Autenticados desvinculan nuestros"
  on public.scouting_match_our_players for delete using (auth.role() = 'authenticated');

-- 2b. Candados RESTRICTIVOS del proyecto (se suman con Y). Solo si las
--     funciones existen (las crean seguridad_2_cierre.sql y
--     rls_captacion_only.sql); si no, se avisa y se sigue.
do $candados$
declare t text := 'scouting_match_our_players';
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'es_cuenta_activa') then
    execute format('drop policy if exists %I on public.%I', 'cuenta_activa', t);
    execute format($p$
      create policy %I on public.%I
        as restrictive for all to public
        using       (public.es_cuenta_activa())
        with check  (public.es_cuenta_activa())
    $p$, 'cuenta_activa', t);
  else
    raise notice 'es_cuenta_activa() no existe: ejecuta antes seguridad_2_cierre.sql y repite este script';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'es_captacion_only') then
    execute format('drop policy if exists %I on public.%I', 'captacion_only_fuera', t);
    execute format($p$
      create policy %I on public.%I
        as restrictive for all to authenticated
        using       (not public.es_captacion_only())
        with check  (not public.es_captacion_only())
    $p$, 'captacion_only_fuera', t);
  else
    raise notice 'es_captacion_only() no existe: ejecuta antes rls_captacion_only.sql y repite este script';
  end if;
end
$candados$;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 3 · REALTIME (la app sincroniza la celda «Jugador» entre usuarios)
-- ══════════════════════════════════════════════════════════════════════

do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: la app funcionará sin sincronización en vivo';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scouting_match_our_players'
  ) then
    alter publication supabase_realtime add table public.scouting_match_our_players;
  end if;
end
$realtime$;


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN (lo único que verás en pantalla)
-- ══════════════════════════════════════════════════════════════════════

select bloque, detalle from (

  select 1 as orden, '1 · FILAS' as bloque,
         ('scouting_match_our_players: ' || (select count(*) from public.scouting_match_our_players)::text)::text as detalle

  union all

  select 2, '2 · POLÍTICAS',
         (tablename || ' · ' || policyname || ' · ' || permissive)::text
  from pg_policies
  where schemaname = 'public' and tablename = 'scouting_match_our_players'

  union all

  select 3, '3 · REALTIME',
         tablename::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'scouting_match_our_players'

) t
order by orden, detalle;


-- ══════════════════════════════════════════════════════════════════════
--  SI ALGO SE ROMPE — cómo deshacerlo
--    drop table if exists public.scouting_match_our_players;
--  (la app sigue funcionando: la celda «Jugador» vuelve a mostrar solo
--   los deducidos por club)
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  RESUMEN FINAL (lo único que enseña el editor de Supabase es este select)
-- ══════════════════════════════════════════════════════════════════════
select 'updated_at triggers' as parte,
       count(*)::text || ' triggers' as estado
  from pg_trigger where tgname = 'trg_set_updated_at'
union all
select 'audit_log', count(*)::text || ' triggers trg_audit' from pg_trigger where tgname = 'trg_audit'
union all
select 'client_errors', case when to_regclass('public.client_errors') is null then 'FALTA' else 'ok' end
union all
select 'contactos', case when to_regclass('public.contactos') is null then 'FALTA' else 'ok · ' || (select count(*) from public.contactos)::text || ' filas (0 = pendiente de «Importar ahora»)' end
union all
select 'cron resumen-diario',
       case when exists (select 1 from public.app_config where key = 'resumen_diario_url' and value like '%<%')
            then 'marcadores SIN editar (edita <project-ref> y el secreto y reejecuta la parte 5)'
            else 'ok' end
union all
select 'nuestros en partido', case when to_regclass('public.scouting_match_our_players') is null then 'FALTA' else 'ok' end;
