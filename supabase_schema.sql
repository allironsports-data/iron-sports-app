-- ============================================================
-- ALL IRON SPORTS — Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Extensiones ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── PERFILES (uno por miembro del equipo) ────────────────────
create table public.profiles (
  id        uuid primary key references auth.users on delete cascade,
  name      text not null,
  avatar    text not null default '?',
  is_admin  boolean not null default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Trigger: crea perfil vacío automáticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar', upper(left(split_part(new.email,'@',1), 2)))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── JUGADORES ────────────────────────────────────────────────
create table public.players (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null,
  birth_date              date,
  positions               text[] default '{}',
  nationality             text,
  photo_url               text,
  clubs                   jsonb default '[]',
  partner                 text,
  managed_by              uuid[] default '{}',
  representation_contract jsonb default '{}',
  club_contract           jsonb default '{}',
  contract_history        jsonb default '[]',
  info                    jsonb default '{}',
  created_at              timestamptz default now()
);
alter table public.players enable row level security;

-- ── TAREAS ───────────────────────────────────────────────────
create table public.tasks (
  id            uuid primary key default uuid_generate_v4(),
  player_id     uuid references public.players on delete cascade not null,
  title         text not null,
  description   text,
  assignee_id   uuid references public.profiles,
  depends_on_id uuid references public.tasks,
  status        text not null default 'pendiente'
                  check (status in ('pendiente','en_progreso','completada')),
  priority      text not null default 'media'
                  check (priority in ('alta','media','baja')),
  due_date      date,
  created_at    timestamptz default now()
);
alter table public.tasks enable row level security;

-- ── COMENTARIOS DE TAREAS ────────────────────────────────────
create table public.task_comments (
  id         uuid primary key default uuid_generate_v4(),
  task_id    uuid references public.tasks on delete cascade not null,
  author_id  uuid references public.profiles,
  content    text,
  created_at timestamptz default now()
);
alter table public.task_comments enable row level security;

-- ── ADJUNTOS (ficheros en Storage) ───────────────────────────
create table public.task_attachments (
  id           uuid primary key default uuid_generate_v4(),
  comment_id   uuid references public.task_comments on delete cascade not null,
  file_name    text not null,
  storage_path text not null,
  uploaded_by  uuid references public.profiles,
  created_at   timestamptz default now()
);
alter table public.task_attachments enable row level security;

-- ── INFORMES DE RENDIMIENTO ──────────────────────────────────
create table public.performance_notes (
  id         uuid primary key default uuid_generate_v4(),
  player_id  uuid references public.players on delete cascade not null,
  author_id  uuid references public.profiles,
  date       date,
  category   text,
  rating     integer check (rating between 1 and 10),
  content    text,
  created_at timestamptz default now()
);
alter table public.performance_notes enable row level security;

-- ============================================================
-- ROW LEVEL SECURITY — todos los autenticados pueden leer/escribir
-- solo admins pueden borrar jugadores y gestionar perfiles
-- ============================================================

-- PROFILES
create policy "Autenticados leen perfiles"
  on public.profiles for select using (auth.role() = 'authenticated');
create policy "Usuario actualiza su propio perfil"
  on public.profiles for update using (auth.uid() = id);
create policy "Admin actualiza cualquier perfil"
  on public.profiles for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- PLAYERS
create policy "Autenticados leen jugadores"
  on public.players for select using (auth.role() = 'authenticated');
create policy "Autenticados crean jugadores"
  on public.players for insert with check (auth.role() = 'authenticated');
create policy "Autenticados actualizan jugadores"
  on public.players for update using (auth.role() = 'authenticated');
create policy "Solo admin borra jugadores"
  on public.players for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- TASKS
create policy "Autenticados leen tareas"
  on public.tasks for select using (auth.role() = 'authenticated');
create policy "Autenticados crean tareas"
  on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "Autenticados actualizan tareas"
  on public.tasks for update using (auth.role() = 'authenticated');
create policy "Autenticados borran tareas"
  on public.tasks for delete using (auth.role() = 'authenticated');

-- TASK COMMENTS
create policy "Autenticados leen comentarios"
  on public.task_comments for select using (auth.role() = 'authenticated');
create policy "Autenticados crean comentarios"
  on public.task_comments for insert with check (auth.role() = 'authenticated');

-- TASK ATTACHMENTS
create policy "Autenticados leen adjuntos"
  on public.task_attachments for select using (auth.role() = 'authenticated');
create policy "Autenticados crean adjuntos"
  on public.task_attachments for insert with check (auth.role() = 'authenticated');

-- PERFORMANCE NOTES
create policy "Autenticados leen rendimiento"
  on public.performance_notes for select using (auth.role() = 'authenticated');
create policy "Autenticados crean rendimiento"
  on public.performance_notes for insert with check (auth.role() = 'authenticated');
create policy "Autenticados actualizan rendimiento"
  on public.performance_notes for update using (auth.role() = 'authenticated');
create policy "Autenticados borran rendimiento"
  on public.performance_notes for delete using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE BUCKET para adjuntos
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict do nothing;

create policy "Autenticados suben ficheros"
  on storage.objects for insert with check (
    bucket_id = 'attachments' and auth.role() = 'authenticated'
  );
create policy "Autenticados leen ficheros"
  on storage.objects for select using (
    bucket_id = 'attachments' and auth.role() = 'authenticated'
  );
