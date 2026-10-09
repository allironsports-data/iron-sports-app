-- ══════════════════════════════════════════════════════════════════════
--  USO DE LA APP · cuánto tiempo pasa cada uno dentro, y en qué parte
--
--  La app (src/hooks/useLatidoUso.ts) manda un «latido» cada minuto
--  mientras la pestaña está visible y la persona ha tocado algo en los
--  últimos 5 minutos. Cada latido marca el bloque de 5 minutos en el que
--  está (user_id, bloque, vista): una fila por bloque y vista, se repita
--  lo que se repita. Tiempo de uso = bloques distintos × 5 min.
--
--  Lee: cada uno lo suyo; los admin, todo (pestaña «Uso» del panel).
--  Reejecutable: todo va con if not exists / or replace / drop if exists.
--  Ejecuta el script ENTERO en el editor SQL de Supabase.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.app_uso (
  user_id uuid        not null default auth.uid() references auth.users on delete cascade,
  bloque  timestamptz not null,              -- inicio del bloque de 5 minutos (UTC)
  vista   text        not null default '',   -- sección de la app (tareas, captacion, jugador…)
  primary key (user_id, bloque, vista)
);

create index if not exists app_uso_bloque_idx on public.app_uso (bloque desc);

alter table public.app_uso enable row level security;

-- Insertar: cualquier cuenta autenticada y activa, solo su propio user_id
drop policy if exists "Cada uno apunta su uso" on public.app_uso;
create policy "Cada uno apunta su uso"
  on public.app_uso for insert to authenticated
  with check (user_id = auth.uid());

-- Leer: lo propio siempre; todo si es admin
drop policy if exists "Uso propio o admin" on public.app_uso;
create policy "Uso propio o admin"
  on public.app_uso for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- Candado de cuenta activa: patrón del proyecto (seguridad_2_cierre.sql)
drop policy if exists cuenta_activa on public.app_uso;
create policy cuenta_activa on public.app_uso
  as restrictive for all to public
  using       (public.es_cuenta_activa())
  with check  (public.es_cuenta_activa());

-- Nota: sin captacion_only_fuera ni partner: el uso se apunta para todas
-- las cuentas, que es justo lo que se quiere medir.

grant select, insert on public.app_uso to authenticated;

-- ── Resumen por usuario (lo que lee la pestaña Uso) ──────────────────
-- Devuelve un JSON con una entrada por usuario:
--   { user_id, bloques, dias_activo, primero, ultimo,
--     vistas: { vista: bloques }, dias: { 'YYYY-MM-DD': bloques } }
-- Los días se cuentan en hora de Madrid. `vistas` puede sumar más que
-- `bloques` si en un mismo bloque se pasó por dos secciones.
-- Security invoker: respeta RLS, así que un no-admin solo se ve a sí mismo.
create or replace function public.uso_app_resumen(p_desde timestamptz, p_hasta timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with b as (
    select user_id, bloque, vista,
           (bloque at time zone 'Europe/Madrid')::date as dia
    from public.app_uso
    where bloque >= p_desde and bloque < p_hasta
  ),
  por_usuario as (
    select user_id,
           count(distinct bloque) as bloques,
           count(distinct dia)    as dias_activo,
           min(bloque)            as primero,
           max(bloque)            as ultimo
    from b group by user_id
  ),
  vistas as (
    select user_id, jsonb_object_agg(vista, n) as vistas
    from (select user_id, vista, count(distinct bloque) as n from b group by 1, 2) v
    group by user_id
  ),
  dias as (
    select user_id, jsonb_object_agg(dia::text, n) as dias
    from (select user_id, dia, count(distinct bloque) as n from b group by 1, 2) d
    group by user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',     u.user_id,
           'bloques',     u.bloques,
           'dias_activo', u.dias_activo,
           'primero',     u.primero,
           'ultimo',      u.ultimo,
           'vistas',      coalesce(v.vistas, '{}'::jsonb),
           'dias',        coalesce(d.dias,   '{}'::jsonb)
         ) order by u.bloques desc), '[]'::jsonb)
  from por_usuario u
  left join vistas v on v.user_id = u.user_id
  left join dias   d on d.user_id = u.user_id
$fn$;

grant execute on function public.uso_app_resumen(timestamptz, timestamptz) to authenticated;

-- ── Retención (opcional, pg_cron): un año es de sobra ────────────────
--   select cron.schedule('app_uso_retencion', '0 4 * * 0',
--     $$ delete from public.app_uso where bloque < now() - interval '12 months' $$);

-- ── COMPROBACIÓN ──────────────────────────────────────────────────────
select policyname, cmd, permissive from pg_policies
where schemaname = 'public' and tablename = 'app_uso' order by policyname;
