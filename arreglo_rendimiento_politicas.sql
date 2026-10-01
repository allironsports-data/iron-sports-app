-- ══════════════════════════════════════════════════════════════════════
--  ARREGLO · lentitud tras migration_partners.sql + perfiles que no se
--  pueden editar ("infinite recursion detected in policy for profiles")
--
--  1) LENTITUD: las políticas llamaban a es_partner() / es_cuenta_activa()
--     / es_captacion_only() UNA VEZ POR FILA. Con miles de filas, cada
--     lectura hacía miles de consultas a profiles. Envueltas en
--     (select …) Postgres las calcula una sola vez por consulta.
--     Mismas reglas, mismo resultado: solo cambia la velocidad.
--  2) PERFILES: la política de admin se consultaba a sí misma.
--
--  Reejecutable. Ejecutar entero en Supabase → SQL Editor.
-- ══════════════════════════════════════════════════════════════════════


-- ── A · Perfiles: fuera la recursión ─────────────────────────────────
drop policy if exists "Admin actualiza cualquier perfil" on public.profiles;
create policy "Admin actualiza cualquier perfil"
  on public.profiles for update
  using      ((select public.es_admin()))
  with check ((select public.es_admin()));


-- ── B · Candado de cuenta activa: una evaluación por consulta ────────
do $a$
declare t text;
begin
  for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'cuenta_activa'
  loop
    execute format('drop policy if exists cuenta_activa on public.%I', t);
    if t = 'profiles' then
      execute format($p$
        create policy cuenta_activa on public.%I
          as restrictive for all to public
          using      ((select public.es_cuenta_activa()) or id = (select auth.uid()))
          with check ((select public.es_cuenta_activa()) or id = (select auth.uid()))
      $p$, t);
    else
      execute format($p$
        create policy cuenta_activa on public.%I
          as restrictive for all to public
          using      ((select public.es_cuenta_activa()))
          with check ((select public.es_cuenta_activa()))
      $p$, t);
    end if;
  end loop;
end
$a$;


-- ── C · Candado «solo Captación»: ídem, en las mismas tablas que ya lo tenían ──
do $c$
declare r record;
begin
  for r in select tablename, roles from pg_policies where schemaname = 'public' and policyname = 'captacion_only_fuera'
  loop
    execute format('drop policy if exists captacion_only_fuera on public.%I', r.tablename);
    execute format($p$
      create policy captacion_only_fuera on public.%I
        as restrictive for all to %s
        using      (not (select public.es_captacion_only()))
        with check (not (select public.es_captacion_only()))
    $p$, r.tablename, array_to_string(r.roles, ', '));
  end loop;
end
$c$;


-- ── D · Políticas de partners, rehechas con (select …) ───────────────
-- ── 4 · Jugadores ────────────────────────────────────────────────────
-- Leer la tabla: solo los de partners (ficha completa). Los nuestros
-- compartidos NO se leen de aquí —la fila entera lleva contrato, teléfono,
-- notas…— sino de la vista reducida de más abajo.
drop policy if exists partner_lee on public.players;
create policy partner_lee on public.players
  as restrictive for select to authenticated
  using (not (select public.es_partner()) or partner_origen is not null);

-- Crear y editar: solo los de SU partner, y siempre fuera de Mantenimiento.
drop policy if exists partner_crea on public.players;
create policy partner_crea on public.players
  as restrictive for insert to authenticated
  with check (
    not (select public.es_partner())
    or (partner_origen is not null and partner_origen = (select public.mi_partner())
        and coalesce(hidden_from_management, false) and not coalesce(shared_with_partners, false))
  );

drop policy if exists partner_edita on public.players;
create policy partner_edita on public.players
  as restrictive for update to authenticated
  using      (not (select public.es_partner()) or partner_origen = (select public.mi_partner()))
  with check (
    not (select public.es_partner())
    or (partner_origen = (select public.mi_partner())
        and coalesce(hidden_from_management, false) and not coalesce(shared_with_partners, false))
  );

drop policy if exists partner_no_borra on public.players;
create policy partner_no_borra on public.players
  as restrictive for delete to authenticated
  using (not (select public.es_partner()));

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
    and (select public.es_cuenta_activa())
    and not (select public.es_captacion_only());

revoke all on public.players_compartidos from anon, public;
grant select on public.players_compartidos to authenticated;


-- ── 5 · Entradas de distribución y negociaciones ─────────────────────
-- Ve las de los jugadores que puede ver. Entradas: solo crea/edita las de
-- jugadores de SU partner. Negociaciones: puede abrirlas y actualizarlas
-- sobre cualquier jugador visible (para eso está), pero no borrarlas.
drop policy if exists partner_lee on public.distribution_entries;
create policy partner_lee on public.distribution_entries
  as restrictive for select to authenticated
  using (not (select public.es_partner()) or public.jugador_visible_partner(player_id));

drop policy if exists partner_escribe on public.distribution_entries;
create policy partner_escribe on public.distribution_entries
  as restrictive for insert to authenticated
  with check (
    not (select public.es_partner())
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = (select public.mi_partner()))
  );

drop policy if exists partner_edita on public.distribution_entries;
create policy partner_edita on public.distribution_entries
  as restrictive for update to authenticated
  using (
    not (select public.es_partner())
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = (select public.mi_partner()))
  )
  with check (
    not (select public.es_partner())
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = (select public.mi_partner()))
  );

drop policy if exists partner_no_borra on public.distribution_entries;
create policy partner_no_borra on public.distribution_entries
  as restrictive for delete to authenticated
  using (
    not (select public.es_partner())
    or exists (select 1 from public.players p where p.id = player_id and p.partner_origen = (select public.mi_partner()))
  );

drop policy if exists partner_ve on public.club_negotiations;
create policy partner_ve on public.club_negotiations
  as restrictive for all to authenticated
  using      (not (select public.es_partner()) or public.jugador_visible_partner(player_id))
  with check (not (select public.es_partner()) or public.jugador_visible_partner(player_id));

drop policy if exists partner_no_borra on public.club_negotiations;
create policy partner_no_borra on public.club_negotiations
  as restrictive for delete to authenticated
  using (not (select public.es_partner()));


-- ── 6 · Clubes: los ve todos y puede crear/editar; borrar no ─────────
drop policy if exists partner_no_borra on public.clubs;
create policy partner_no_borra on public.clubs
  as restrictive for delete to authenticated
  using (not (select public.es_partner()));


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
        using      (not (select public.es_partner()))
        with check (not (select public.es_partner()))
    $p$, 'partner_fuera', t);
  end loop;
end
$partners$;

-- Documentos (pasaportes, contratos, adjuntos): fuera.
drop policy if exists partner_fuera on storage.objects;
create policy partner_fuera on storage.objects
  as restrictive for all to public
  using      (not (select public.es_partner()))
  with check (not (select public.es_partner()));


-- ── E · Comprobación: políticas de profiles (ninguna debe llevar "FROM profiles") ──
select policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;
