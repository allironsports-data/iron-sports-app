-- ── Candados de agenda_eventos ───────────────────────────────────────
-- La tabla se creó (migration_agenda_eventos.sql) DESPUÉS de pasar
-- seguridad_2_cierre.sql y rls_captacion_only.sql, así que se quedó sin
-- las dos políticas restrictivas que tienen las demás:
--   · cuenta_activa         → una cuenta sin activar no lee ni escribe nada
--   · captacion_only_fuera  → la cuenta «solo Captación» no ve la agenda
-- Son RESTRICTIVAS: se suman con Y a las que ya hay; para las cuentas
-- activas normales no cambia nada. Se puede ejecutar las veces que haga falta.
-- Ejecutar en el SQL Editor de Supabase.

drop policy if exists "cuenta_activa" on public.agenda_eventos;
create policy "cuenta_activa" on public.agenda_eventos
  as restrictive for all to public
  using      (public.es_cuenta_activa())
  with check (public.es_cuenta_activa());

drop policy if exists "captacion_only_fuera" on public.agenda_eventos;
create policy "captacion_only_fuera" on public.agenda_eventos
  as restrictive for all to authenticated
  using      (not public.es_captacion_only())
  with check (not public.es_captacion_only());

-- Comprobación: tienen que salir las 4 permisivas + estas 2 restrictivas
-- select policyname, permissive, cmd from pg_policies where tablename = 'agenda_eventos';
