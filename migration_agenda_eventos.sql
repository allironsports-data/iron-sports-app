-- ── Eventos de agenda ────────────────────────────────────────────────
-- Citas, reuniones, videollamadas, sesiones de análisis… con o sin
-- jugador, de Mantenimiento, de Captación o generales. Los pinta el
-- calendario semanal y «Mi día». Hasta ejecutar esto, «Añadir evento»
-- solo puede guardar eventos con jugador de Mantenimiento (como antes).
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.agenda_eventos (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null default '',
  tipo               text not null default 'Reunión',
  fecha              date not null,
  hora               text,                       -- "HH:MM", opcional
  ambito             text not null default 'general',   -- mantenimiento | captacion | general
  player_ids         uuid[] not null default '{}',      -- jugadores de Mantenimiento
  scouting_player_id uuid references public.scouting_players(id) on delete set null,
  participant_ids    uuid[] not null default '{}',      -- profiles.id de quienes asisten
  notas              text,
  author_id          uuid references public.profiles(id) on delete set null,
  activity_ref       uuid,                       -- id o group_id en player_activities (si generó actividad)
  created_at         timestamptz not null default now()
);

create index if not exists agenda_eventos_fecha_idx on public.agenda_eventos (fecha);

-- RLS: igual que el resto de tablas de la app
alter table public.agenda_eventos enable row level security;

drop policy if exists "agenda_eventos_select" on public.agenda_eventos;
create policy "agenda_eventos_select" on public.agenda_eventos
  for select to authenticated using (true);

drop policy if exists "agenda_eventos_insert" on public.agenda_eventos;
create policy "agenda_eventos_insert" on public.agenda_eventos
  for insert to authenticated with check (true);

drop policy if exists "agenda_eventos_update" on public.agenda_eventos;
create policy "agenda_eventos_update" on public.agenda_eventos
  for update to authenticated using (true);

drop policy if exists "agenda_eventos_delete" on public.agenda_eventos;
create policy "agenda_eventos_delete" on public.agenda_eventos
  for delete to authenticated using (true);
