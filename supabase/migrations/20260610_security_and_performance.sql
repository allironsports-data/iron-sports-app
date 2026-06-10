-- ============================================================
-- 2026-06-10 — Seguridad y rendimiento
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 1. CRÍTICO: evitar escalada de privilegios ────────────────
-- La política "Usuario actualiza su propio perfil" permite a
-- cualquier usuario ponerse is_admin = true. Este trigger lo impide:
-- solo un admin puede cambiar el campo is_admin.
create or replace function public.protect_is_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin
    ) then
      raise exception 'Solo un administrador puede modificar is_admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin_trigger on public.profiles;
create trigger protect_is_admin_trigger
  before update on public.profiles
  for each row execute procedure public.protect_is_admin();

-- ── 2. Storage: permitir reemplazar ficheros (upsert) ─────────
-- uploadPassport/uploadContractPdf usan upsert:true, que requiere
-- permiso de UPDATE sobre storage.objects (no existía).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Autenticados actualizan ficheros') then
    create policy "Autenticados actualizan ficheros"
      on storage.objects for update
      using (bucket_id = 'attachments' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Autenticados borran ficheros') then
    create policy "Autenticados borran ficheros"
      on storage.objects for delete
      using (bucket_id = 'attachments' and auth.role() = 'authenticated');
  end if;
end $$;

-- ── 3. Comentarios: el autor puede editar/borrar los suyos ────
do $$ begin
  if not exists (select 1 from pg_policies where tablename='task_comments' and policyname='Autor actualiza su comentario') then
    create policy "Autor actualiza su comentario"
      on public.task_comments for update using (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='task_comments' and policyname='Autor borra su comentario') then
    create policy "Autor borra su comentario"
      on public.task_comments for delete using (auth.uid() = author_id);
  end if;
end $$;

-- ── 4. Índices en claves foráneas (rendimiento) ───────────────
-- Postgres no crea índices automáticos en FKs; estas columnas se
-- usan constantemente en filtros .eq() desde la app.
create index if not exists idx_tasks_player_id          on public.tasks(player_id);
create index if not exists idx_tasks_assignee_id        on public.tasks(assignee_id);
create index if not exists idx_task_comments_task_id    on public.task_comments(task_id);
create index if not exists idx_task_attachments_comment on public.task_attachments(comment_id);
create index if not exists idx_perf_notes_player_id     on public.performance_notes(player_id);

do $$ begin
  if exists (select 1 from information_schema.tables where table_name='scouting_reports') then
    create index if not exists idx_scouting_reports_player on public.scouting_reports(player_id);
  end if;
  if exists (select 1 from information_schema.tables where table_name='club_negotiations') then
    create index if not exists idx_negotiations_player on public.club_negotiations(player_id);
    create index if not exists idx_negotiations_club   on public.club_negotiations(club_id);
  end if;
  if exists (select 1 from information_schema.tables where table_name='distribution_entries') then
    create index if not exists idx_dist_entries_player on public.distribution_entries(player_id);
    create index if not exists idx_dist_entries_season on public.distribution_entries(season) where active;
  end if;
  if exists (select 1 from information_schema.tables where table_name='club_logs') then
    create index if not exists idx_club_logs_player on public.club_logs(player_id);
  end if;
  if exists (select 1 from information_schema.tables where table_name='player_meetings') then
    create index if not exists idx_meetings_player on public.player_meetings(player_id);
  end if;
end $$;
