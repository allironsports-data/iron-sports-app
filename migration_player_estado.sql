-- ══════════════════════════════════════════════════════════════════════
-- PLAYERS.ESTADO — en qué punto está la relación con cada jugador
--
--   activo    → lo gestionamos nosotros, el día a día es nuestro
--   inactivo  → nos ha dejado, o su contrato de representación ha vencido
--   partner   → el día a día lo lleva el partner, nosotros no
--
-- Es OTRA COSA que hidden_from_management, que significa «este jugador no
-- es nuestro, es de intermediación» y solo sale en Distribución. Un
-- jugador puede estar activo y ser de intermediación a la vez.
--
-- Todos los jugadores que ya existen quedan en 'activo'. Los inactivos y
-- los de gestión partner se marcan a mano desde la ficha de cada uno.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede repetir.
-- Mientras no se ejecute, la app funciona igual (los lee como activos y al
-- guardar una ficha se salta el campo sin romper nada).
-- ══════════════════════════════════════════════════════════════════════

alter table public.players
  add column if not exists estado text not null default 'activo';

-- El check va aparte y con guarda, porque add constraint no admite
-- "if not exists" y si no repetir el script daría error
do $$
begin
  alter table public.players
    add constraint players_estado_check check (estado in ('activo', 'inactivo', 'partner'));
exception
  when duplicate_object then null;   -- ya estaba puesto
end
$$;

-- Por si alguna fila trae un valor raro de antes de existir el check
update public.players
   set estado = 'activo'
 where estado is null or estado not in ('activo', 'inactivo', 'partner');

-- La lista de Jugadores filtra por estado en cada carga
create index if not exists players_estado_idx on public.players (estado);

-- Comprobación: deberían salir todos en 'activo'
select estado, count(*) as jugadores
  from public.players
 group by estado
 order by jugadores desc;
