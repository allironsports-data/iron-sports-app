-- Comunicaciones con el club sobre un jugador
CREATE TABLE IF NOT EXISTS public.club_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES public.players ON DELETE CASCADE,
  date        date NOT NULL,
  club_name   text NOT NULL,
  notes       text NOT NULL,
  author_id   uuid REFERENCES public.profiles,
  created_at  timestamptz DEFAULT now()
);

-- Citas / encuentros con el jugador
CREATE TABLE IF NOT EXISTS public.player_meetings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES public.players ON DELETE CASCADE,
  date        date NOT NULL,
  notes       text,
  author_id   uuid REFERENCES public.profiles,
  created_at  timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.club_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_club_logs"     ON public.club_logs     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_player_meetings" ON public.player_meetings FOR ALL USING (auth.role() = 'authenticated');
