-- ══════════════════════════════════════════════════════════════════════
--  SEGURIDAD · PASO 2 de 2 · CIERRE
--
--  Lo que dijo el diagnóstico (para que quede escrito):
--   ✓ RLS activado en TODAS las tablas. Ninguna suelta.
--   ✓ El candado de «solo Captación» está puesto en 16 tablas.
--   ✓ El candado de permisos de perfil (trigger) está puesto.
--   ✓ update_user_password y delete_user YA comprueban is_admin por dentro.
--     Están bien: no hacía falta tocarlas.
--
--  Lo que queda abierto, y es lo que arregla este script:
--
--   ✗ TODA cuenta que consiga entrar («authenticated») lo puede leer y
--     escribir todo: las políticas dicen literalmente using = true. El
--     registro de Supabase está abierto, así que quien se cree una cuenta
--     entra directamente a los teléfonos, contratos y pasaportes. No hace
--     falta ser del equipo.
--       → PARTE 1: las cuentas nuevas nacen SIN acceso a nada hasta que tú
--         las actives desde el panel de admin.
--
--   ✗ Cualquiera puede vaciar una tabla entera de un solo comando desde la
--     consola del navegador (delete from clubs). Solo `players` estaba
--     protegida.
--       → PARTE 3: freno de borrado masivo.
--
--  TODO es reejecutable y reversible. Al final te dejo cómo deshacerlo.
--  Ejecuta el script ENTERO de una vez: si algo falla, Supabase lo deshace
--  todo y te quedas como estabas.
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 1 · UNA CUENTA NUEVA NO VE NADA HASTA QUE TÚ LA ACTIVES
-- ══════════════════════════════════════════════════════════════════════

-- 1a. La columna (por defecto FALSE: así nace toda cuenta nueva) y, solo la
--     primera vez, activar las cuentas que YA existen para que nadie se
--     quede fuera.
--
--     Va dentro de un `if not exists` a propósito: si vuelves a ejecutar
--     este script dentro de un mes, NO reactiva las cuentas que tengas
--     pendientes o desactivadas a posta.
do $columna$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'activo'
  ) then
    alter table public.profiles add column activo boolean not null default false;
    update public.profiles set activo = true;
  end if;
end
$columna$;

-- 1c. Que nadie se active a sí mismo. Se amplía el candado que ya tenías
--     para que cubra también esta columna.
create or replace function public.guard_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if (new.is_admin       is distinct from old.is_admin)
  or (new.captacion_only is distinct from old.captacion_only)
  or (new.activo         is distinct from old.activo) then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_admin, false)
    ) then
      raise exception 'Solo un administrador puede cambiar los permisos de una cuenta';
    end if;
  end if;
  return new;
end
$guard$;

drop trigger if exists trg_guard_profile_flags on public.profiles;
create trigger trg_guard_profile_flags
  before update on public.profiles
  for each row execute function public.guard_profile_flags();

-- 1d. La comprobación, en una función que se salta RLS (si no, para mirar
--     si estás activo haría falta poder leer profiles, y ahí está el lío).
create or replace function public.es_cuenta_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false)
$$;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 2 · EL CANDADO, EN TODAS LAS TABLAS
--
--  Son políticas RESTRICTIVAS: se SUMAN con Y a las que ya hay. No
--  sustituyen ni tocan ninguna de las tuyas, así que para las cuentas
--  activas no cambia absolutamente nada.
--
--  Excepción: en `profiles`, una cuenta pendiente puede leer SU PROPIA
--  fila. Hace falta para que la app pueda decirle «tu cuenta está
--  pendiente de activar» en vez de dejarla en una pantalla vacía.
-- ══════════════════════════════════════════════════════════════════════

do $candado$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('drop policy if exists %I on public.%I', 'cuenta_activa', t);

    if t = 'profiles' then
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to public
          using       (public.es_cuenta_activa() or id = auth.uid())
          with check  (public.es_cuenta_activa() or id = auth.uid())
      $p$, 'cuenta_activa', t);
    else
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to public
          using       (public.es_cuenta_activa())
          with check  (public.es_cuenta_activa())
      $p$, 'cuenta_activa', t);
    end if;
  end loop;
end
$candado$;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 3 · FRENO DE BORRADO MASIVO
--
--  Hoy, cualquier cuenta puede abrir la consola del navegador y vaciar
--  clubs, scouting_players o tasks de un comando. Esto no lo impide
--  borrar de uno en uno (que es lo que hace la app), pero corta en seco
--  cualquier borrado de más de 25 filas de golpe si no eres admin.
--
--  Tus scripts del editor SQL NO se ven afectados: ahí no hay usuario
--  (auth.uid() es nulo) y el freno se aparta.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.freno_borrado_masivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $freno$
declare n int;
begin
  -- Sin sesión de usuario = editor SQL / service_role: paso libre.
  if auth.uid() is null then return null; end if;

  select count(*) into n from filas_borradas;
  if n > 25 and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception
      'Borrado masivo bloqueado: % filas de una sola vez en %. Solo un administrador puede hacer esto.',
      n, tg_table_name;
  end if;
  return null;
end
$freno$;

do $frenos$
declare
  t text;
  -- Ojo: NO se ponen en scouting_match_players ni scouting_match_scouts,
  -- porque al repegar una alineación se reemplazan varias filas de golpe
  -- y sería un falso positivo.
  tablas text[] := array[
    'players', 'clubs', 'club_negotiations', 'distribution_entries',
    'club_logs', 'performance_notes', 'player_activities', 'player_meetings',
    'tasks', 'task_comments', 'postpartidos', 'captacion_firmas',
    'scouting_players', 'scouting_reports', 'scouting_matches',
    'scouting_equipos', 'scouting_club_zonas',
    'boulema_players', 'boulema_peticiones', 'member_status'
  ];
begin
  foreach t in array tablas loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t) then
      execute format('drop trigger if exists trg_freno_borrado on public.%I', t);
      execute format($g$
        create trigger trg_freno_borrado
          after delete on public.%I
          referencing old table as filas_borradas
          for each statement execute function public.freno_borrado_masivo()
      $g$, t);
    end if;
  end loop;
end
$frenos$;


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN  (esto es lo único que verás en pantalla)
--
--  Mándamelo en texto otra vez. El bloque 4 es el que me falta por ver:
--  son los permisos del almacén de archivos, donde están los pasaportes.
-- ══════════════════════════════════════════════════════════════════════

select bloque, detalle from (

  select 1 as orden, '1 · CUENTAS' as bloque,
         (name || ' · ' || case when activo then 'ACTIVA' else 'PENDIENTE' end ||
          case when is_admin then ' · admin' else '' end ||
          case when captacion_only then ' · solo captación' else '' end)::text as detalle
  from public.profiles

  union all

  select 2, '2 · CANDADO CUENTA ACTIVA',
         (count(*)::text || ' tablas')::text
  from pg_policies where schemaname = 'public' and policyname = 'cuenta_activa'

  union all

  select 3, '3 · FRENO BORRADO MASIVO',
         (count(*)::text || ' tablas')::text
  from pg_trigger where tgname = 'trg_freno_borrado'

  union all

  -- Los pasaportes y los contratos viven aquí. Necesito ver quién puede
  -- entrar al almacén, porque las políticas de storage van por su cuenta.
  select 4, '4 · ALMACEN DE ARCHIVOS',
         (p.policyname || ' · ' || p.cmd ||
          ' · roles=' || array_to_string(p.roles, '+') ||
          ' · using=' || coalesce(p.qual, '(nada)') ||
          ' · check=' || coalesce(p.with_check, '(nada)'))::text
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects'

  union all

  select 5, '5 · BUCKETS',
         (id || ' · ' || case when public then 'PUBLICO ⚠' else 'privado' end)::text
  from storage.buckets

) t
order by orden, detalle;


-- ══════════════════════════════════════════════════════════════════════
--  SI ALGO SE ROMPE — cómo deshacerlo
--
--  Quitar el candado de cuenta activa (todo de golpe):
--    do $undo$ declare t record; begin
--      for t in select tablename from pg_policies
--               where schemaname='public' and policyname='cuenta_activa'
--      loop execute format('drop policy cuenta_activa on public.%I', t.tablename);
--      end loop; end $undo$;
--
--  Quitar el freno de borrado:
--    do $undo2$ declare t record; begin
--      for t in select c.relname from pg_trigger g
--               join pg_class c on c.oid = g.tgrelid
--               where g.tgname = 'trg_freno_borrado'
--      loop execute format('drop trigger trg_freno_borrado on public.%I', t.relname);
--      end loop; end $undo2$;
--
--  Activar una cuenta a mano (por si el panel fallara):
--    update public.profiles set activo = true where name = 'Fulano';
-- ══════════════════════════════════════════════════════════════════════
