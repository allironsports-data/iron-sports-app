-- Unified chronological activity log for each player
-- Replaces separate club_logs and player_meetings with a flexible event system

CREATE TABLE IF NOT EXISTS public.player_activities (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid        NOT NULL REFERENCES public.players ON DELETE CASCADE,
  date       date        NOT NULL,
  type       text        NOT NULL,   -- e.g. "Comunicación con club", "Reunión con jugador", or custom
  notes      text,
  author_id  uuid        REFERENCES public.profiles,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.player_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_player_activities"
  ON public.player_activities
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Index for fast per-player queries sorted by date
CREATE INDEX IF NOT EXISTS player_activities_player_date
  ON public.player_activities (player_id, date DESC);
