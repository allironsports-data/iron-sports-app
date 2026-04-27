-- =====================================================
-- ALL IRON SPORTS — COMPREHENSIVE FIX
-- Fixes: league name mismatches, duplicates, reserve
-- teams, wrong-league clubs, missing clubs.
-- Safe to re-run (idempotent where possible).
-- =====================================================

-- ═════════════════════════════════════════════════
-- 1. LEAGUE NAME NORMALIZATION
--    Fixes mismatches between migrate-clubs.sql and
--    cleanup-leagues.sql / master-league-fix.sql
-- ═════════════════════════════════════════════════

-- Czech Republic: '1. liga' / '1. Fortuna liga' → 'Czech First League'
UPDATE clubs SET league = 'Czech First League'
WHERE country = 'Czech Republic' AND league IN ('1. liga', '1. Fortuna Liga', '1. fortuna liga');

-- Hungary: 'OTP Bank Liga' → 'NB I'
UPDATE clubs SET league = 'NB I'
WHERE country = 'Hungary' AND league = 'OTP Bank Liga';

-- Switzerland: 'Super League' → 'Swiss Super League'
UPDATE clubs SET league = 'Swiss Super League'
WHERE country = 'Switzerland' AND league = 'Super League';

-- England: normalize legacy 'EFL Championship' → 'Championship'
UPDATE clubs SET league = 'Championship'
WHERE country = 'England' AND league = 'EFL Championship';

-- Austria: normalize 'Bundesliga Austria' → 'Austrian Bundesliga' (two names were in DB)
UPDATE clubs SET league = 'Austrian Bundesliga'
WHERE country = 'Austria' AND league = 'Bundesliga Austria';

-- Slovakia: normalize '1. Fortuna liga' variants
UPDATE clubs SET league = 'Slovak Super Liga'
WHERE country = 'Slovakia' AND league IN ('1. Fortuna liga', '1. fortuna liga');

-- ═════════════════════════════════════════════════
-- 2. GERMANY — Fix club names (umlauts/variants)
--    so that cleanup-leagues.sql name-protection works
-- ═════════════════════════════════════════════════

-- FC Koln → Köln  (inserted without umlaut, stuck in Bundesliga)
UPDATE clubs SET name = 'Köln', league = '2. Bundesliga'
WHERE name = 'FC Koln' AND country = 'Germany';

-- FC Nurnberg → Nürnberg
UPDATE clubs SET name = 'Nürnberg'
WHERE name = 'FC Nurnberg' AND country = 'Germany';

-- Greuther Furth → Greuther Fürth
UPDATE clubs SET name = 'Greuther Fürth'
WHERE name = 'Greuther Furth' AND country = 'Germany';

-- Sv Elversberg → Elversberg
UPDATE clubs SET name = 'Elversberg'
WHERE name = 'Sv Elversberg' AND country = 'Germany';

-- SC Paderborn → Paderborn (matches protection list 'Paderborn')
UPDATE clubs SET name = 'Paderborn'
WHERE name = 'SC Paderborn' AND country = 'Germany';

-- Ulm 1846 → Ulm (matches protection list 'Ulm')
UPDATE clubs SET name = 'Ulm'
WHERE name = 'Ulm 1846' AND country = 'Germany';

-- FC Kaiserslautern → Kaiserslautern (matches protection list)
UPDATE clubs SET name = 'Kaiserslautern'
WHERE name = 'FC Kaiserslautern' AND country = 'Germany';

-- FC Magdeburg → Magdeburg (matches protection list)
UPDATE clubs SET name = 'Magdeburg'
WHERE name = 'FC Magdeburg' AND country = 'Germany';

-- ═════════════════════════════════════════════════
-- 3. GERMANY — Move wrongly-placed clubs to 3. Liga
-- ═════════════════════════════════════════════════

-- Arminia Bielefeld: inserted in 2. Bundesliga, now in 3. Liga
UPDATE clubs SET league = '3. Liga'
WHERE name = 'Arminia Bielefeld' AND country = 'Germany';

-- Dynamo Dresden: inserted in 2. Bundesliga, now in 3. Liga
UPDATE clubs SET league = '3. Liga'
WHERE name = 'Dynamo Dresden' AND country = 'Germany';

-- FC Saarbrucken: inserted in 2. Bundesliga, actually in 3. Liga
UPDATE clubs SET league = '3. Liga'
WHERE name = 'FC Saarbrucken' AND country = 'Germany';

-- ═════════════════════════════════════════════════
-- 4. GERMANY — Delete true duplicates
--    (same club, two rows with different names)
-- ═════════════════════════════════════════════════

-- 'Osnabrück' in 2. Bundesliga = same as 'VfL Osnabrück' in 3. Liga → delete 2.Bl version
DELETE FROM clubs
WHERE name = 'Osnabrück' AND league = '2. Bundesliga' AND country = 'Germany'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- '1860 Munich' in 2. Bundesliga = same as 'TSV 1860 München' in 3. Liga → delete 2.Bl version
DELETE FROM clubs
WHERE name = '1860 Munich' AND league = '2. Bundesliga' AND country = 'Germany'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- 'FC Ingolstadt' in 2. Bundesliga = same as 'FC Ingolstadt 04' in 3. Liga → delete 2.Bl version
DELETE FROM clubs
WHERE name = 'FC Ingolstadt' AND league = '2. Bundesliga' AND country = 'Germany'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- Preußen Münster: master-league-fix promotes to 2. Bundesliga, but there's also a 3. Liga entry
DELETE FROM clubs
WHERE name = 'Preußen Münster' AND league = '3. Liga' AND country = 'Germany'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- ═════════════════════════════════════════════════
-- 5. AUSTRIA — Duplicates and reserve teams
-- ═════════════════════════════════════════════════

-- SC Austria Lustenau = duplicate of 'Austria Lustenau' (same club, old name)
DELETE FROM clubs
WHERE name = 'SC Austria Lustenau' AND country = 'Austria'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- FC Flyeralarm Admira = same as 'Admira Wacker' (sponsor name dropped)
DELETE FROM clubs
WHERE name IN ('FC Flyeralarm Admira', 'Flyeralarm Admira') AND country = 'Austria'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- SV Ried II = reserve team (SV Ried = main team in Austrian Bundesliga)
DELETE FROM clubs
WHERE name = 'SV Ried II' AND country = 'Austria'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- Blau Weiss Linz B = reserve team (FC Blau-Weiss Linz = main team in Bundesliga)
DELETE FROM clubs
WHERE name = 'Blau Weiss Linz B' AND country = 'Austria'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- Insert missing Austrian 2. Liga clubs
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'SKU Amstetten',   'Austria', 'Austrian 2. Liga', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kapfenberger SV', 'Austria', 'Austrian 2. Liga', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'FC Liefering',    'Austria', 'Austrian 2. Liga', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- ═════════════════════════════════════════════════
-- 6. BELGIUM — Duplicates
-- ═════════════════════════════════════════════════

-- 'Beveeren' = typo for 'SK Beveren' (same club in 1B Pro League)
DELETE FROM clubs
WHERE name = 'Beveeren' AND country = 'Belgium'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- 'RFC Seraing' was in migrate's 1B Pro League but no longer exists (folded 2022)
DELETE FROM clubs
WHERE name = 'RFC Seraing' AND country = 'Belgium'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- 'Deinze' in Pro League = same as KMSK Deinze (rebranded to 'Dender' in Pro League)
-- Keep 'KMSK Deinze' in 1B, rename Pro League entry to 'Dender'
UPDATE clubs SET name = 'Dender'
WHERE name = 'Deinze' AND league = 'Pro League' AND country = 'Belgium';

-- ═════════════════════════════════════════════════
-- 7. SCOTLAND — Duplicate
-- ═════════════════════════════════════════════════

-- 'Dundee FC' = same as 'Dundee' (official name is Dundee FC but we use 'Dundee')
DELETE FROM clubs
WHERE name = 'Dundee FC' AND country = 'Scotland'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- ═════════════════════════════════════════════════
-- 8. PORTUGAL — Wrong clubs in Primeira Liga
--    (relegated clubs still assigned to top division)
-- ═════════════════════════════════════════════════

UPDATE clubs SET league = 'Liga Portugal 2'
WHERE name IN ('Chaves', 'Vizela', 'FC Vizela', 'Pacos Ferreira', 'Portimonense')
  AND country = 'Portugal';

-- ═════════════════════════════════════════════════
-- 9. FRANCE — Relegated clubs still in Ligue 1
-- ═════════════════════════════════════════════════

UPDATE clubs SET league = 'Ligue 2'
WHERE name IN ('Metz', 'Clermont') AND country = 'France';

-- ═════════════════════════════════════════════════
-- 10. SPAIN — Wrong league assignments
-- ═════════════════════════════════════════════════

-- Cordoba CF → Primera RFEF (not La Liga 2)
UPDATE clubs SET league = 'Primera RFEF'
WHERE name IN ('Cordoba CF', 'Córdoba CF') AND country = 'Spain';

-- Lugo → Primera RFEF (relegated from La Liga 2)
UPDATE clubs SET league = 'Primera RFEF'
WHERE name = 'Lugo' AND country = 'Spain';

-- SD Ponferradina: master-league-fix moved it to La Liga 2 but it's in Primera RFEF (2024-25)
UPDATE clubs SET league = 'Primera RFEF'
WHERE name IN ('Ponferradina', 'SD Ponferradina') AND country = 'Spain';

-- ═════════════════════════════════════════════════
-- 11. ENGLAND — Blackpool wrong league
--    (inserted in EFL Championship, now in League One)
-- ═════════════════════════════════════════════════

UPDATE clubs SET league = 'EFL League One'
WHERE name = 'Blackpool' AND country = 'England';

-- ═════════════════════════════════════════════════
-- 12. CZECH REPUBLIC — Two Fortuna Liga entries
--    Merge 'Czech First League' / '1. liga' / 'Czech First League'
--    (already normalized in step 1, but also check for Karvina name)
-- ═════════════════════════════════════════════════

-- Normalize club name variants
UPDATE clubs SET name = 'Karvina'
WHERE name = 'MFK OKD Karvina' AND country = 'Czech Republic';

UPDATE clubs SET name = 'Fastav Zlin', league = 'Czech First League'
WHERE name = 'Fastav Zlin' AND country = 'Czech Republic';

-- ═════════════════════════════════════════════════
-- 13. HUNGARY — Fix club name
-- ═════════════════════════════════════════════════

-- Normalize old club names
UPDATE clubs SET name = 'Ferencvaros' WHERE name = 'Ferencváros' AND country = 'Hungary';

-- Remove clubs that no longer exist in top division
DELETE FROM clubs
WHERE name IN ('Pecsi MFC','Diosgyor','Budafoki','Haladas','Eto FC')
  AND country = 'Hungary' AND league = 'NB I'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- Insert actual NB I clubs that are missing
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Zalaegerszegi TE', 'Hungary', 'NB I', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kecskeméti TE',    'Hungary', 'NB I', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gyirmót FC',       'Hungary', 'NB I', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Budapest Honved',  'Hungary', 'NB I', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- ═════════════════════════════════════════════════
-- 14. SAUDI ARABIA — Normalize club names
-- ═════════════════════════════════════════════════

-- 'Al Faisaly' → 'Al Qadsiah' (Al Faisaly was rebranded to Al Qadsiah)
UPDATE clubs SET name = 'Al Qadsiah'
WHERE name = 'Al Faisaly' AND country = 'Saudi Arabia'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- 'Al Shabab' and 'Al Shabaab' - might be duplicates
-- 'Al Shabab' from migrate, 'Al-Shabaab' from master-league-fix (different names for same club)
DELETE FROM clubs
WHERE name = 'Al Shabab' AND country = 'Saudi Arabia'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
  AND EXISTS (SELECT 1 FROM clubs WHERE name IN ('Al Shabaab', 'Al-Shabaab') AND country = 'Saudi Arabia');

-- 'Al Akhdoud' (migrate) and 'Al Okhdood' (master-league-fix) - same club
DELETE FROM clubs
WHERE name = 'Al Akhdoud' AND country = 'Saudi Arabia'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);
-- Ensure canonical name exists
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Al Okhdood', 'Saudi Arabia', 'Saudi Pro League', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- 'Al Batin', 'Al Jabalain', 'Ohod Club' — no longer in Saudi Pro League (2024-25)
DELETE FROM clubs
WHERE name IN ('Al Batin', 'Al Jabalain', 'Ohod Club') AND country = 'Saudi Arabia'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);

-- ═════════════════════════════════════════════════
-- 15. SWITZERLAND — Normalize 'Grasshoppers' name
-- ═════════════════════════════════════════════════

UPDATE clubs SET name = 'Grasshopper'
WHERE name = 'Grasshoppers' AND country = 'Switzerland';

-- ═════════════════════════════════════════════════
-- 16. CLEANUP — Austria 2. Liga final check
--    Make sure we have exactly the right 10 clubs
-- ═════════════════════════════════════════════════

DELETE FROM clubs
WHERE league = 'Austrian 2. Liga'
  AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
  AND name NOT IN (
    'Austria Lustenau', 'FC Austria Lustenau',
    'Admira Wacker', 'FC Admira Wacker',
    'FC Juniors OÖ', 'Juniors OÖ',
    'FC Dornbirn', 'Dornbirn',
    'SKU Amstetten', 'Amstetten',
    'Kapfenberger SV', 'Kapfenberg',
    'FC Liefering', 'Liefering',
    'FC Marchfeld', 'Marchfeld',
    'ASK Voitsberg', 'Voitsberg',
    'SV Licht-Loidl Lafnitz', 'Lafnitz'
  );

-- ═════════════════════════════════════════════════
-- VERIFICATION — run this to see final counts
-- ═════════════════════════════════════════════════

SELECT country, league, COUNT(*) AS clubs
FROM clubs
GROUP BY country, league
ORDER BY country, league;
