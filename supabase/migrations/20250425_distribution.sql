-- ── DISTRIBUCIÓN MODULE ─────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor

-- 1. Clubs master table
CREATE TABLE IF NOT EXISTS clubs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  league        text,                          -- "Spain 2", "Spain 3", "Greece", etc.
  country       text DEFAULT 'Spain',
  contact_person text,                         -- name of person at the club
  ais_manager   text,                          -- initials of AIS person (PP, BGF, LT, AV, NB…)
  notes         text,
  is_priority   boolean DEFAULT false,         -- highlighted clubs (green in spreadsheet)
  needs         jsonb DEFAULT '[]'::jsonb,     -- [{position, age_max, transfer_budget, salary_budget, notes}]
  created_at    timestamptz DEFAULT now()
);

-- 2. Distribution entries — which players to distribute this season
CREATE TABLE IF NOT EXISTS distribution_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  season      text NOT NULL DEFAULT '2025-26',
  priority    text CHECK (priority IN ('A', 'B', 'C')) DEFAULT 'B',
  condition   text,                            -- "Libre", "Traspaso", "Cesión", "Cesión/Traspaso"
  transfer_fee text,                           -- optional: "2M", "400k", etc.
  notes       text,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(player_id, season)
);

-- 3. Club negotiations — bridge between player and club
CREATE TABLE IF NOT EXISTS club_negotiations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  club_id     uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  status      text CHECK (status IN ('ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado')) DEFAULT 'ofrecido',
  ais_manager text,                            -- who from AIS handles this negotiation
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_club_negotiations_updated_at ON club_negotiations;
CREATE TRIGGER update_club_negotiations_updated_at
  BEFORE UPDATE ON club_negotiations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (same pattern as existing tables)
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read clubs" ON clubs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users can write clubs" ON clubs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can read distribution_entries" ON distribution_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users can write distribution_entries" ON distribution_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can read club_negotiations" ON club_negotiations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users can write club_negotiations" ON club_negotiations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
