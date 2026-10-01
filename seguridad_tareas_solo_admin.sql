-- ── Tareas «solo para admins»: que lo sean también en la base ────────
-- Hasta ahora tasks.admin_only solo se filtraba en pantalla: la base
-- entregaba esas tareas a cualquier cuenta activa (y con ellas sus
-- comentarios). Con esto, quien no es admin no las lee, ni las crea, ni
-- las edita. Política RESTRICTIVA: se suma con Y a las que ya hay; para
-- las tareas normales no cambia nada.
-- Requiere public.es_admin() (seguridad_3_almacen.sql). Reejecutable.
-- Ejecutar en el SQL Editor de Supabase.

drop policy if exists "solo_admin" on public.tasks;
create policy "solo_admin" on public.tasks
  as restrictive for all to authenticated
  using      (coalesce(admin_only, false) = false or public.es_admin())
  with check (coalesce(admin_only, false) = false or public.es_admin());

-- Los comentarios de una tarea solo-admin, igual
drop policy if exists "solo_admin" on public.task_comments;
create policy "solo_admin" on public.task_comments
  as restrictive for all to authenticated
  using (
    public.es_admin() or not exists (
      select 1 from public.tasks t where t.id = task_comments.task_id and coalesce(t.admin_only, false)
    )
  )
  with check (
    public.es_admin() or not exists (
      select 1 from public.tasks t where t.id = task_comments.task_id and coalesce(t.admin_only, false)
    )
  );

-- Comprobación: entra con una cuenta que no sea admin y
--   select count(*) from tasks where admin_only;   → 0
