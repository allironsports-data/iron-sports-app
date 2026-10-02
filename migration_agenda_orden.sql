-- ══════════════════════════════════════════════════════════════════════
--  ORDEN MANUAL DE LA LISTA DE TAREAS
--
--  Cada persona puede arrastrar las filas de su lista de Tareas para
--  ordenarlas a mano. El orden es personal (el mío no cambia el tuyo) y
--  se guarda aquí para que sea el mismo en el ordenador y en el móvil.
--  Una fila por persona: { id del item → posición }.
--
--  Sin esta tabla la app funciona igual: el orden se queda guardado solo
--  en el navegador donde se hizo.
--
--  Reejecutable. Ejecutar en Supabase → SQL Editor.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.agenda_orden (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  orden      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agenda_orden enable row level security;

-- Cada uno lee y escribe solo su fila
drop policy if exists "Cada uno su orden" on public.agenda_orden;
create policy "Cada uno su orden" on public.agenda_orden
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Los mismos candados que el resto de tablas
drop policy if exists cuenta_activa on public.agenda_orden;
create policy cuenta_activa on public.agenda_orden
  as restrictive for all to public
  using      ((select public.es_cuenta_activa()))
  with check ((select public.es_cuenta_activa()));

drop policy if exists partner_fuera on public.agenda_orden;
create policy partner_fuera on public.agenda_orden
  as restrictive for all to authenticated
  using      (not (select public.es_partner()))
  with check (not (select public.es_partner()));
