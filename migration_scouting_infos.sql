-- ══════════════════════════════════════════════════════════════════════
-- SCOUTING_INFOS — informes que NO son de partido
--
-- Hasta ahora la ficha de un jugador de captación solo admitía informes de
-- partido (tabla scouting_reports). Esta tabla añade los otros tres tipos
-- de información que hacen falta para decidir:
--
--   personalidad → cómo es y de dónde viene (entorno, familia, actitud)
--   contractual  → contrato con su club, salario, cláusula, comisiones
--   mercado      → qué dicen otros clubes y scouts sobre él
--
-- Va en tabla APARTE a propósito. scouting_reports significa «informe de
-- partido» en toda la app: el umbral de candidatos de Conclusiones, el
-- modelo de predicción, las estadísticas por scout, la exigencia y el
-- informe mensual cuentan sus filas. Si estos tres tipos vivieran ahí,
-- todos esos números empezarían a contar de más SIN dar ningún error.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede repetir.
-- Mientras no se ejecute, la app funciona igual que hasta ahora (la lectura
-- devuelve vacío y el botón de añadir avisa de que falta la migración).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.scouting_infos (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.scouting_players(id) on delete cascade,
  tipo         text not null check (tipo in ('personalidad', 'contractual', 'mercado')),
  fecha        timestamptz not null default now(),
  texto        text,
  persona      text,                    -- avatar del que lo escribe ("PP", "RP"…)
  author_id    uuid,

  -- personalidad · entorno
  fuente       text,                    -- de quién viene el dato (entrenador, agente, el propio jugador…)
  semaforo     text check (semaforo in ('verde', 'ambar', 'rojo')),

  -- contractual
  fin_contrato text,                    -- texto libre, igual que scouting_players.club_contract
  salario      text,
  clausula     text,
  comision     text,
  agente       text,
  fiabilidad   text check (fiabilidad in ('alta', 'media', 'baja')),

  -- mercado
  club         text,                    -- club o entidad que opina
  quien        text,                    -- persona y cargo dentro de ese club
  interes      text check (interes in ('alto', 'medio', 'bajo', 'descartado')),

  created_at   timestamptz not null default now()
);

-- La ficha del jugador pide siempre "dame las infos de ESTE jugador"
create index if not exists scouting_infos_player_id_idx on public.scouting_infos (player_id);

alter table public.scouting_infos enable row level security;

-- Mismo criterio que el resto de tablas de captación: cualquier cuenta
-- activa lee y escribe. es_cuenta_activa() va envuelta en (select …) para
-- que Postgres la evalúe una vez por consulta y no una vez por fila
-- (mismo motivo que rls_rapido.sql).
drop policy if exists scouting_infos_select on public.scouting_infos;
create policy scouting_infos_select on public.scouting_infos
  for select to authenticated using ((select public.es_cuenta_activa()));

drop policy if exists scouting_infos_insert on public.scouting_infos;
create policy scouting_infos_insert on public.scouting_infos
  for insert to authenticated with check ((select public.es_cuenta_activa()));

drop policy if exists scouting_infos_update on public.scouting_infos;
create policy scouting_infos_update on public.scouting_infos
  for update to authenticated using ((select public.es_cuenta_activa()));

drop policy if exists scouting_infos_delete on public.scouting_infos;
create policy scouting_infos_delete on public.scouting_infos
  for delete to authenticated using ((select public.es_cuenta_activa()));

-- Realtime: que el resto de usuarios vean los cambios sin recargar
-- (mismo add que tienen scouting_reports y compañía).
do $$
begin
  alter publication supabase_realtime add table public.scouting_infos;
exception
  when duplicate_object then null;   -- ya estaba añadida
  when undefined_object then null;   -- no hay publication supabase_realtime
end
$$;

-- Comprobación
select count(*) as filas from public.scouting_infos;
