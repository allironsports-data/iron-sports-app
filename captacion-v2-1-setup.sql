-- STEP 1/5: Borrar datos anteriores y añadir columnas nuevas

DELETE FROM scouting_reports;
DELETE FROM scouting_players;

ALTER TABLE scouting_players ADD COLUMN IF NOT EXISTS national_team TEXT;
ALTER TABLE scouting_players ADD COLUMN IF NOT EXISTS segunda_categoria TEXT;
ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS persona TEXT;
ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS conclusion TEXT;

SELECT 'Setup done' AS status;
