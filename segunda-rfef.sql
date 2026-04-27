-- =====================================================
-- SEGUNDA RFEF — Clubs insert/update
-- Adds clubs from the Segunda RFEF contact list.
-- Uses ON CONFLICT (name) to update league if the
-- club already exists (e.g. UCAM Murcia was in
-- Primera RFEF, Alcoyano, Baleares, etc.)
-- =====================================================

-- Step 1: normalize old 'UD Logrones' (no accent) to proper name + league
UPDATE clubs
SET name = 'UD Logroñes', league = 'Segunda RFEF'
WHERE name = 'UD Logrones' AND country = 'Spain';

-- Also fix 'Recreativo' if it exists under that short name
UPDATE clubs
SET name = 'Recreativo Huelva', league = 'Segunda RFEF'
WHERE name = 'Recreativo' AND country = 'Spain';

-- Step 2: insert all Segunda RFEF clubs (or update league if name already exists)
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Zamora',               'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Alaves B',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Reus',                 'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Oviedo B',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Deportiva Minera',     'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Tenerife B',           'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Xerez',                'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Utebo',                'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'UD Ourense',           'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Toledano',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Terrassa',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Sanse',                'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Salamanca',            'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Recreativo Huelva',    'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Rayo Majadahonda',     'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gimnastica Segoviana', 'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Aguilas',              'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'UD Logroñes',          'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'UCAM Murcia',          'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Poblense',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Getafe B',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Coria',                'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Conquense',            'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Baleares',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Alcoyano',             'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Osasuna B',            'Spain', 'Segunda RFEF', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Arenteiro',            'Spain', 'Segunda RFEF', false, '[]'::jsonb, now())
ON CONFLICT (name) DO UPDATE
  SET league  = 'Segunda RFEF',
      country = 'Spain';

-- Verification
SELECT name, league FROM clubs
WHERE country = 'Spain' AND league = 'Segunda RFEF'
ORDER BY name;
