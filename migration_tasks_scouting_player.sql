-- ── Tareas de un jugador de Captación ────────────────────────────────
-- tasks.scouting_player_id: el jugador de Captación al que se refiere la
-- tarea (las de jugadores de Mantenimiento siguen usando player_id). Así la
-- tarea enlaza con su ficha de scouting. Hasta ejecutar esto, la tarea se
-- guarda sin el vínculo (el nombre del jugador queda en la descripción).
-- Reejecutable. Ejecutar en el SQL Editor de Supabase.

alter table public.tasks
  add column if not exists scouting_player_id uuid references public.scouting_players(id) on delete set null;
