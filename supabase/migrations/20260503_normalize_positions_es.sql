-- ─────────────────────────────────────────────────────────────────────────────
-- Normalize English position names → Spanish in scouting_players
-- Applies to both position_1 and position_2 columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper macro (reused for both columns via a DO block)
DO $$
DECLARE
  pos_map TEXT[][] := ARRAY[
    -- Goalkeeper
    ARRAY['goalkeeper',            'Portero'],
    ARRAY['gk',                    'Portero'],
    ARRAY['keeper',                'Portero'],
    ARRAY['goalie',                'Portero'],
    -- Centre back
    ARRAY['centre back',           'Central'],
    ARRAY['center back',           'Central'],
    ARRAY['cb',                    'Central'],
    ARRAY['central defender',      'Central'],
    ARRAY['centreback',            'Central'],
    -- Left back
    ARRAY['left back',             'Lateral izquierdo'],
    ARRAY['lb',                    'Lateral izquierdo'],
    ARRAY['left-back',             'Lateral izquierdo'],
    ARRAY['leftback',              'Lateral izquierdo'],
    -- Right back
    ARRAY['right back',            'Lateral derecho'],
    ARRAY['rb',                    'Lateral derecho'],
    ARRAY['right-back',            'Lateral derecho'],
    ARRAY['rightback',             'Lateral derecho'],
    -- Defensive midfielder
    ARRAY['defensive midf',        'Pivote'],
    ARRAY['defensive midfielder',  'Pivote'],
    ARRAY['defensive midfield',    'Pivote'],
    ARRAY['defensive mid',         'Pivote'],
    ARRAY['cdm',                   'Pivote'],
    ARRAY['dm',                    'Pivote'],
    ARRAY['pivot',                 'Pivote'],
    ARRAY['holding mid',           'Pivote'],
    -- Central / Box-to-box midfielder
    ARRAY['midfielder',            'Mediocentro'],
    ARRAY['central midfielder',    'Mediocentro'],
    ARRAY['cm',                    'Mediocentro'],
    ARRAY['midfield',              'Mediocentro'],
    ARRAY['box to box',            'Mediocentro'],
    ARRAY['box-to-box',            'Mediocentro'],
    ARRAY['box to box midfielder', 'Mediocentro'],
    -- Attacking midfielder
    ARRAY['attacking midf',        'Mediapunta'],
    ARRAY['attacking midfielder',  'Mediapunta'],
    ARRAY['attacking midfield',    'Mediapunta'],
    ARRAY['attacking mid',         'Mediapunta'],
    ARRAY['cam',                   'Mediapunta'],
    ARRAY['am',                    'Mediapunta'],
    ARRAY['trequartista',          'Mediapunta'],
    ARRAY['number 10',             'Mediapunta'],
    ARRAY['no. 10',                'Mediapunta'],
    -- Left winger
    ARRAY['left winger',           'Extremo izquierdo'],
    ARRAY['lw',                    'Extremo izquierdo'],
    ARRAY['left wing',             'Extremo izquierdo'],
    ARRAY['left-wing',             'Extremo izquierdo'],
    -- Right winger
    ARRAY['right winger',          'Extremo derecho'],
    ARRAY['rw',                    'Extremo derecho'],
    ARRAY['right wing',            'Extremo derecho'],
    ARRAY['right-wing',            'Extremo derecho'],
    -- Winger genérico (sin lado especificado — limpiar manualmente después)
    ARRAY['winger',                'Extremo'],
    ARRAY['wide midfielder',       'Extremo'],
    ARRAY['wide player',           'Extremo'],
    -- Forward / Striker
    ARRAY['forward',               'Delantero'],
    ARRAY['striker',               'Delantero'],
    ARRAY['st',                    'Delantero'],
    ARRAY['cf',                    'Delantero'],
    ARRAY['centre forward',        'Delantero'],
    ARRAY['center forward',        'Delantero'],
    ARRAY['second striker',        'Delantero'],
    ARRAY['nine',                  'Delantero'],
    ARRAY['number 9',              'Delantero']
  ];
  pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pos_map LOOP
    UPDATE scouting_players
    SET position_1 = pair[2]
    WHERE LOWER(TRIM(position_1)) = pair[1];

    UPDATE scouting_players
    SET position_2 = pair[2]
    WHERE LOWER(TRIM(position_2)) = pair[1];
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER RUNNING: paste this SELECT in the SQL editor to see what's still
-- in English (i.e., not matched by any of the mappings above).
-- ─────────────────────────────────────────────────────────────────────────────

/*
SELECT
  position,
  COUNT(*) AS jugadores,
  'position_1' AS campo
FROM (
  SELECT TRIM(position_1) AS position FROM scouting_players
  WHERE position_1 IS NOT NULL AND position_1 <> ''
) sub
WHERE LOWER(position) NOT IN (
  'portero','central','lateral izquierdo','lateral derecho',
  'pivote','mediocentro','mediapunta',
  'extremo derecho','extremo izquierdo','extremo','delantero'
)
GROUP BY position

UNION ALL

SELECT
  position,
  COUNT(*) AS jugadores,
  'position_2' AS campo
FROM (
  SELECT TRIM(position_2) AS position FROM scouting_players
  WHERE position_2 IS NOT NULL AND position_2 <> ''
) sub
WHERE LOWER(position) NOT IN (
  'portero','central','lateral izquierdo','lateral derecho',
  'pivote','mediocentro','mediapunta',
  'extremo derecho','extremo izquierdo','extremo','delantero'
)
GROUP BY position

ORDER BY jugadores DESC;
*/
