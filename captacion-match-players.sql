-- ─────────────────────────────────────────────────────────────────
-- Tabla: scouting_match_players
-- Relación N:N entre partidos y jugadores (quién fue visto en qué partido)
-- + campo match_id en scouting_reports (el informe viene de ese partido)
-- Ejecutar UNA VEZ en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Jugadores vinculados a partidos
CREATE TABLE IF NOT EXISTS public.scouting_match_players (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id   uuid        NOT NULL REFERENCES public.scouting_matches(id)  ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES public.scouting_players(id)  ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (match_id, player_id)
);

ALTER TABLE public.scouting_match_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "smp_select" ON public.scouting_match_players;
DROP POLICY IF EXISTS "smp_insert" ON public.scouting_match_players;
DROP POLICY IF EXISTS "smp_delete" ON public.scouting_match_players;

CREATE POLICY "smp_select" ON public.scouting_match_players FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "smp_insert" ON public.scouting_match_players FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "smp_delete" ON public.scouting_match_players FOR DELETE USING (auth.role() = 'authenticated');

-- 2. Enlace opcional informe → partido
ALTER TABLE public.scouting_reports
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.scouting_matches(id) ON DELETE SET NULL;
