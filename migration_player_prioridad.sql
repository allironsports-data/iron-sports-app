-- ══════════════════════════════════════════════════════════════════════
-- PLAYERS.PRIORIDAD — A, B o C por jugador de Mantenimiento
--
-- Prioridad que le damos a cada jugador nuestro. Se ve en la lista
-- (tarjetas, lista y tabla), en la ficha y se puede filtrar por ella.
-- Vacío = sin prioridad asignada.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente. Mientras no se
-- ejecute, la app funciona igual: la prioridad no se guarda (al guardar
-- una ficha se salta el campo sin romper nada).
-- ══════════════════════════════════════════════════════════════════════

alter table public.players
  add column if not exists prioridad text;

do $$
begin
  alter table public.players
    add constraint players_prioridad_check check (prioridad is null or prioridad in ('A', 'B', 'C'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists players_prioridad_idx on public.players (prioridad);

select coalesce(prioridad, 'sin') as prioridad, count(*) as jugadores
  from public.players
 group by prioridad
 order by prioridad nulls last;
