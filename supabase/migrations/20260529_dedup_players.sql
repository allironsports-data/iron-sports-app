-- ─────────────────────────────────────────────────────────────
-- Deduplicar jugadores con el mismo nombre
-- Estrategia: por cada grupo de nombres iguales, conservar el
-- registro con created_at más antiguo (el "original") y borrar
-- el resto después de reasignar sus referencias.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1. Tabla temporal con: id duplicado → id canónico (el que se conserva)
CREATE TEMP TABLE _dup_map AS
WITH ranked AS (
  SELECT
    id,
    name,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY lower(trim(name)) ORDER BY created_at ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY lower(trim(name)) ORDER BY created_at ASC) AS canonical_id
  FROM players
)
SELECT id AS dup_id, canonical_id
FROM ranked
WHERE rn > 1;

-- 2. Reasignar tasks que apuntan a un duplicado
UPDATE tasks
SET player_id = m.canonical_id
FROM _dup_map m
WHERE tasks.player_id = m.dup_id;

-- 3. Reasignar player_activities
UPDATE player_activities
SET player_id = m.canonical_id
FROM _dup_map m
WHERE player_activities.player_id = m.dup_id;

-- 4. Reasignar distribution_entries
UPDATE distribution_entries
SET player_id = m.canonical_id
FROM _dup_map m
WHERE distribution_entries.player_id = m.dup_id;

-- 5. Reasignar club_negotiations
UPDATE club_negotiations
SET player_id = m.canonical_id
FROM _dup_map m
WHERE club_negotiations.player_id = m.dup_id;

-- 6. Borrar los duplicados (ya sin referencias)
DELETE FROM players
WHERE id IN (SELECT dup_id FROM _dup_map);

-- 7. Informe de lo eliminado
-- (descomentar para ver antes de confirmar)
-- SELECT p.name, m.dup_id, m.canonical_id FROM _dup_map m JOIN players p ON p.id = m.canonical_id;

COMMIT;
