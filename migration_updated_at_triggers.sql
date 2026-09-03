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
