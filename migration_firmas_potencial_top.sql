-- Pipeline → Firmar: marca «potencial top» por jugador (filtro para seguir
-- a los de techo alto de cada zona). Sin esta columna la app funciona igual
-- pero la marca no se guarda. Reejecutable.
alter table public.captacion_firmas add column if not exists potencial_top boolean not null default false;
