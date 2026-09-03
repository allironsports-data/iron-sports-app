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
