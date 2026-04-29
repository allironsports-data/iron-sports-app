-- Link each negotiation to a specific club need/petición
-- Adds optional need_position column to club_negotiations

ALTER TABLE club_negotiations
  ADD COLUMN IF NOT EXISTS need_position text;

COMMENT ON COLUMN club_negotiations.need_position IS
  'Position label of the club need this negotiation is linked to (e.g. "Extremo derecho"). NULL for historic records not tied to a specific need.';
