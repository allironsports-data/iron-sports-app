-- ══════════════════════════════════════════════════════════════════════
--  CIERRE DE SEGURIDAD · a partir del diagnóstico del 18-ago
--
--  Lo que dijo el diagnóstico:
--   ✓ RLS está activado en todas las tablas de verdad, con políticas.
--   ✗ _correccion_resumen y _fusion_resumen están SIN RLS: abiertas a
--     cualquiera con la clave pública de la app (van en el JavaScript).
--   ✗ profiles tiene «Usuario actualiza su propio perfil». Las políticas
--     de Postgres NO pueden limitar POR COLUMNA: esa política permite a
--     cualquiera ponerse is_admin = true en su propia fila.
--   ✗ players, tasks, clubs… solo exigen «estar autenticado», así que una
--     cuenta «solo Captación» puede leer teléfonos, contratos y pasaportes.
--
--  Este script cierra las tres cosas SIN tocar ninguna política existente
--  (las nuevas son RESTRICTIVAS: se suman a las que ya hay). Todo es
--  reejecutable y reversible — al final te dejo cómo deshacerlo.
-- ══════════════════════════════════════════════════════════════════════


-- ── PARTE 1 · Las dos tablas abiertas ────────────────────────────────
-- Son restos de operaciones ya terminadas (la fusión de partidos y la
-- corrección de jugadores). Con RLS activado y sin políticas, nadie las
-- lee desde la app; siguen accesibles para ti desde el editor SQL.

alter table if exists public._correccion_resumen enable row level security;
alter table if exists public._fusion_resumen     enable row level security;
-- Si prefieres quitarlas de en medio del todo:
--   drop table if exists public._correccion_resumen, public._fusion_resumen;


-- ── PARTE 2 · Nadie se hace admin a sí mismo ─────────────────────────
-- (Esto ya iba en revision_seguridad.sql pero se deshizo al fallar el
--  script; va aquí otra vez para que quede seguro.)

create or replace function public.guard_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if (new.is_admin       is distinct from old.is_admin)
  or (new.captacion_only is distinct from old.captacion_only) then
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


-- ── PARTE 3 · «Solo Captación» deja de ser solo pintura ──────────────
-- Hasta ahora la restricción vivía en la interfaz: la cuenta tenía en el
-- navegador TODOS los datos aunque no se los enseñara. Con esto, la base
-- de datos directamente no se los entrega.

create or replace function public.es_captacion_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.captacion_only from public.profiles p where p.id = auth.uid()), false)
$$;

do $rls$
declare
  t text;
  -- Tablas que una cuenta «solo Captación» NO necesita para su trabajo
  -- (ella solo usa: scouting_players, scouting_reports, scouting_matches,
  --  scouting_match_players, scouting_match_scouts y profiles)
  tablas text[] := array[
    'players', 'tasks', 'task_comments', 'task_attachments',
    'performance_notes', 'player_activities', 'player_meetings',
    'clubs', 'club_logs', 'club_negotiations', 'distribution_entries',
    'postpartidos', 'member_status', 'captacion_firmas',
    'boulema_players', 'boulema_peticiones'
  ];
begin
  foreach t in array tablas loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t) then
      execute format('drop policy if exists %I on public.%I', 'captacion_only_fuera', t);
      -- RESTRICTIVE = se suma con Y a las políticas que ya existen:
      -- no cambia nada para el resto de cuentas.
      execute format($p$
        create policy %I on public.%I
          as restrictive
          for all
          to authenticated
          using (not public.es_captacion_only())
          with check (not public.es_captacion_only())
      $p$, 'captacion_only_fuera', t);
    end if;
  end loop;
end
$rls$;


-- ── COMPROBACIÓN ─────────────────────────────────────────────────────
-- 1) Tablas sin RLS: debe salir vacío
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2) Dónde ha quedado el candado de «solo Captación»
select tablename as tabla, policyname as politica, permissive
from pg_policies
where schemaname = 'public' and policyname = 'captacion_only_fuera'
order by tablename;


-- ══════════════════════════════════════════════════════════════════════
--  QUÉ HACER SI ALGO SE ROMPE (deshacer, tabla por tabla o todo)
--
--    drop policy if exists captacion_only_fuera on public.players;
--
--  O todo de golpe:
--    do $undo$ declare t record; begin
--      for t in select tablename from pg_policies
--               where schemaname='public' and policyname='captacion_only_fuera'
--      loop execute format('drop policy captacion_only_fuera on public.%I', t.tablename);
--      end loop; end $undo$;
--
--  Y el candado de permisos:
--    drop trigger if exists trg_guard_profile_flags on public.profiles;
-- ══════════════════════════════════════════════════════════════════════
