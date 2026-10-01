-- ══════════════════════════════════════════════════════════════════════
--  PARTNERS EXTERNOS · acceso solo a Distribución
--
--  Cuentas de partners de fuera que ayudan a distribuir jugadores. Qué
--  puede hacer una cuenta «partner» (profiles.partner_only = true):
--
--   · VER   sus jugadores y los de otros partners (ficha completa),
--           los jugadores NUESTROS marcados «compartir con partners»
--           (solo una ficha reducida, por la vista players_compartidos),
--           todos los clubes, y las entradas de distribución y
--           negociaciones de los jugadores que puede ver.
--   · CREAR/EDITAR  sus propios jugadores, clubes, y negociaciones de los
--           jugadores que puede ver.
--   · NADA MÁS: ni tareas, ni Captación, ni pipeline, ni Boulema, ni
--           contactos, ni actividad, ni documentos (pasaportes, contratos).
--
--  Todas las políticas son RESTRICTIVAS: se suman con Y a las que ya hay.
--  Para las cuentas normales no cambia nada.
--
--  Requiere es_cuenta_activa() (seguridad_2_cierre.sql) y
--  es_captacion_only() (rls_captacion_only.sql). Reejecutable: vuelve a ejecutarlo cada vez
--  que se cree una tabla nueva, para que quede cerrada a los partners.
--  Ejecutar en Supabase → SQL Editor.
--
--  ⚠ ANTES DE DAR ACCESO A NADIE: crea una cuenta de prueba, márcala como
--  partner desde Admin y comprueba con ella las consultas del final.
-- ══════════════════════════════════════════════════════════════════════


-- ── 1 · Columnas ─────────────────────────────────────────────────────
alter table public.profiles add column if not exists partner_only boolean not null default false;
alter table public.profiles add column if not exists partner_name text;        -- a qué partner pertenece la cuenta

-- partner_origen: nombre del partner externo que ha traído al jugador (null = es nuestro).
-- Ojo: NO es la columna `partner` que ya existía (partner interno responsable).
alter table public.players add column if not exists partner_origen text;
alter table public.players add column if not exists shared_with_partners boolean not null default false;

create index if not exists players_partner_origen_idx on public.players (partner_origen) where partner_origen is not null;


-- ── 2 · Funciones (saltan RLS: si no, para mirar tu propio perfil haría falta poder leerlo) ──
create or replace function public.es_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.partner_only from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.mi_partner()
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(p.partner_name), '') from public.profiles p where p.id = auth.uid()
$$;

-- ¿Puede un partner ver a este jugador? Los de partners (suyos o de otros) y los nuestros compartidos.
create or replace function public.jugador_visible_partner(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players p
    where p.id = pid and (p.partner_origen is not null or p.shared_with_partners)
  )
$$;


-- ── 3 · Nadie se hace partner (ni deja de serlo) a sí mismo ──────────
create or replace function public.guard_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if auth.uid() is null then return new; end if;   -- editor SQL: paso libre

  if (new.is_admin       is distinct from old.is_admin)
  or (new.captacion_only is distinct from old.captacion_only)
  or (new.activo         is distinct from old.activo)
  or (new.partner_only   is distinct from old.partner_only)
  or (new.partner_name   is distinct from old.partner_name) then
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


-- ── 4 · Jugadores ────────────────────────────────────────────────────
-- Leer la tabla: solo los de partners (ficha completa). Los nuestros
-- compartidos NO se leen de aquí —la fila entera lleva contrato, teléfono,
-- notas…— sino de la vista reducida de más abajo.
drop policy if exists partner_lee on public.players;
create policy partner_lee on public.players
  as restrictive for select to authenticated
  using (not public.es_partner() or partner_origen is not null);

-- Crear y editar: solo los de SU partner, y siempre fuera de Mantenimiento.
drop policy if exists partner_crea on public.players;
create policy partner_crea on public.players
  as restrictive for insert to authenticated
  with check (
    not public.es_partner()
    or (partner_origen is not null and partner_origen = public.mi_partner()
        and coalesce(hidden_from_management, false) and not coalesce(shared_with_partners, false))
  );

drop policy if exists partner_edita on public.players;
create policy partner_edita on public.players
  as restrictive for update to authenticated
  using      (not public.es_partner() or partner_origen = public.mi_partner())
  with check (
    not public.es_partner()
    or (partner_origen = public.mi_partner()
        and coalesce(hidden_from_management, false) and not coalesce(shared_with_partners, false))
  );

drop policy if exists partner_no_borra on public.players;
create policy partner_no_borra on public.players
  as restrictive for delete to authenticated
  using (not public.es_partner());

-- Ficha reducida de los jugadores NUESTROS compartidos. Sin contrato de
-- representación, sin comisión, sin teléfono, sin notas, sin gestores.
-- La vista se salta RLS (es del propietario), así que el filtro va dentro.
drop view if exists public.players_compartidos;
create view public.players_compartidos as
  select p.id, p.name, p.birth_date, p.positions, p.foot, p.nationality,
         p.photo_url, p.clubs, p.transfermarkt_url, p.links
  from public.players p
  where p.shared_with_partners
    and p.partner_origen is null
    and public.es_cuenta_activa()
    and not public.es_captacion_only();

revoke all on public.players_compartidos from anon, public;
grant select on public.players_compartidos to authenticated;


-- ── 5 · Entradas de distribución y negociaciones ─────────────────────
-- Ve las de los jugadores que puede ver. Entradas: solo crea/edita las de
-- jugadores de SU partner. Negociaciones: puede abrirlas y actualizarlas
-- sobre cualquier jugador visible (para eso está), pero no borrarlas.
drop policy if exists partner_lee on public.distribution_entries;
create policy partner_lee on public.distribution_entries
  as restrictive for select to authenticated
  using (not public.es_partner() or public.jugador_visible_partner(player_id));

drop policy if exists partner_escribe on public.distribution_entries;
create policy partner_escribe on public.distribution_entries
  as restrictive for insert to authenticated
  with check (
    not public.es_partner()
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = public.mi_partner())
  );

drop policy if exists partner_edita on public.distribution_entries;
create policy partner_edita on public.distribution_entries
  as restrictive for update to authenticated
  using (
    not public.es_partner()
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = public.mi_partner())
  )
  with check (
    not public.es_partner()
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = public.mi_partner())
  );

drop policy if exists partner_no_borra on public.distribution_entries;
create policy partner_no_borra on public.distribution_entries
  as restrictive for delete to authenticated
  using (
    not public.es_partner()
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = public.mi_partner())
  );

drop policy if exists partner_ve on public.club_negotiations;
create policy partner_ve on public.club_negotiations
  as restrictive for all to authenticated
  using      (not public.es_partner() or public.jugador_visible_partner(player_id))
  with check (not public.es_partner() or public.jugador_visible_partner(player_id));

drop policy if exists partner_no_borra on public.club_negotiations;
create policy partner_no_borra on public.club_negotiations
  as restrictive for delete to authenticated
  using (not public.es_partner());


-- ── 6 · Clubes: los ve todos y puede crear/editar; borrar no ─────────
drop policy if exists partner_no_borra on public.clubs;
create policy partner_no_borra on public.clubs
  as restrictive for delete to authenticated
  using (not public.es_partner());


-- ── 7 · Todo lo demás: cerrado ───────────────────────────────────────
-- Cualquier tabla que no sea de las cinco de arriba queda fuera del
-- alcance de un partner. Se recorre el catálogo para no dejarse ninguna
-- (y por eso hay que volver a ejecutar esto cuando se cree una tabla).
do $partners$
declare
  t text;
  abiertas text[] := array['profiles', 'players', 'clubs', 'distribution_entries', 'club_negotiations'];
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    if t = any (abiertas) then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'partner_fuera', t);
    execute format($p$
      create policy %I on public.%I
        as restrictive for all to authenticated
        using      (not public.es_partner())
        with check (not public.es_partner())
    $p$, 'partner_fuera', t);
  end loop;
end
$partners$;

-- Documentos (pasaportes, contratos, adjuntos): fuera.
drop policy if exists partner_fuera on storage.objects;
create policy partner_fuera on storage.objects
  as restrictive for all to public
  using      (not public.es_partner())
  with check (not public.es_partner());


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN (entrando en la app con la cuenta de partner de prueba,
--  o aquí con «Run as» esa cuenta):
--
--    select count(*) from tasks;                 → 0
--    select count(*) from scouting_players;      → 0
--    select count(*) from captacion_firmas;      → 0
--    select count(*) from contactos;             → 0
--    select count(*) from players;               → solo los de partners
--    select count(*) from players_compartidos;   → solo los marcados para compartir
--    select count(*) from clubs;                 → todos
--
--  Tablas con RLS desactivado (un partner las leería enteras). Tiene que
--  salir vacío; si sale alguna, hay que activarle RLS antes de dar acceso:
--
--    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- ══════════════════════════════════════════════════════════════════════
