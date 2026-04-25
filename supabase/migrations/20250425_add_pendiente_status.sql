-- Add 'pendiente' status to club_negotiations
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE club_negotiations
  DROP CONSTRAINT IF EXISTS club_negotiations_status_check;

ALTER TABLE club_negotiations
  ADD CONSTRAINT club_negotiations_status_check
  CHECK (status IN ('pendiente', 'ofrecido', 'interesado', 'negociando', 'cerrado', 'descartado'));
