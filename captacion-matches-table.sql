-- ─────────────────────────────────────────────────────────────────
-- TABLA: scouting_matches
-- Partidos visualizados por los exploradores (pestaña Partidos)
-- Ejecutar UNA VEZ en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scouting_matches (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date        NOT NULL,
  home_team   text        NOT NULL,
  away_team   text        NOT NULL,
  competition text,
  assigned_to text,        -- iniciales del explorador, ej: "NB", "PP"
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- RLS (Row Level Security)
ALTER TABLE public.scouting_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scouting_matches_select" ON public.scouting_matches
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scouting_matches_insert" ON public.scouting_matches
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "scouting_matches_update" ON public.scouting_matches
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "scouting_matches_delete" ON public.scouting_matches
  FOR DELETE USING (auth.role() = 'authenticated');
