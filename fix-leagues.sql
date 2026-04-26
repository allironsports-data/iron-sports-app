-- =============================================
-- All Iron Sports — Fix ligas v1
-- Corregir nombres duplicados + junk data
-- =============================================

-- ─── 1. CZECH REPUBLIC: unificar en "Czech First League" ───
UPDATE clubs SET league = 'Czech First League'
WHERE country = 'Czech Republic' AND league IN ('Czech 1. Liga', '1. liga', '1. Fortuna liga', '1. fortuna liga');

-- ─── 2. HUNGARY: unificar en "NB I" ───
UPDATE clubs SET league = 'NB I'
WHERE league = 'OTP Bank Liga';

-- ─── 3. SWITZERLAND: unificar en "Swiss Super League" ───
UPDATE clubs SET league = 'Swiss Super League'
WHERE league = 'Super League' AND country = 'Switzerland';

-- ─── 4. SPAIN: eliminar junk ───
-- "Czech 2" con country Spain es un error, borrar
DELETE FROM clubs WHERE league = 'Czech 2' AND country = 'Spain';

-- Spain 3* → ya es Primera RFEF (del SQL anterior), pero si quedan residuos:
UPDATE clubs SET league = 'Primera RFEF' WHERE league IN ('Spain 3', 'Spain 3*') AND country = 'Spain';

-- Spain 5 → eliminar (no existe 5ª división como liga relevante a este nivel)
DELETE FROM clubs WHERE league = 'Spain 5' AND country = 'Spain';

-- Liga null en Spain → Ver cuál es y asignar manualmente:
SELECT id, name, country, league FROM clubs WHERE country = 'Spain' AND league IS NULL;

-- ─── 5. VER EXCESO EN LIGAS SATURADAS ───
-- Correr estas queries para ver qué clubes sobran (SOLO SELECT, no borrar aún):

-- Eredivisie tiene 25, debería tener 18 → ver cuáles sobran
SELECT id, name, league FROM clubs
WHERE league = 'Eredivisie'
ORDER BY name;

-- Pro League Bélgica tiene 23, debería tener 16
SELECT id, name, league FROM clubs
WHERE league = 'Pro League' AND country = 'Belgium'
ORDER BY name;

-- Austrian Bundesliga tiene 20, debería tener 12
SELECT id, name, league FROM clubs
WHERE league = 'Austrian Bundesliga'
ORDER BY name;

-- Ekstraklasa tiene 40, debería tener 18 → REVISAR
SELECT id, name, league FROM clubs
WHERE league = 'Ekstraklasa'
ORDER BY name;

-- Serie A Italia tiene 33, debería tener 20
SELECT id, name, league FROM clubs
WHERE league = 'Serie A' AND country = 'Italy'
ORDER BY name;

-- Premier League tiene 29, debería tener 20
SELECT id, name, league FROM clubs
WHERE league = 'Premier League' AND country = 'England'
ORDER BY name;

-- Primera RFEF tiene 49, debería tener 18 (o 80 si incluyes grupos A/B/C/D)
SELECT id, name, league FROM clubs
WHERE league = 'Primera RFEF'
ORDER BY name;

-- ─── 6. INSERTAR LIGAS FALTANTES (top 30 FIFA) ───

-- J1 League (Japan) — 18 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Urawa Red Diamonds', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gamba Osaka', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kashima Antlers', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Yokohama F. Marinos', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Vissel Kobe', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Nagoya Grampus', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'FC Tokyo', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Sanfrecce Hiroshima', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Cerezo Osaka', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kawasaki Frontale', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Sagan Tosu', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kashiwa Reysol', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Shonan Bellmare', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Consadole Sapporo', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Jubilo Iwata', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Avispa Fukuoka', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Albirex Niigata', 'Japan', 'J1 League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kyoto Sanga', 'Japan', 'J1 League', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- K League 1 (South Korea) — 12 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Jeonbuk Hyundai Motors', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Ulsan Hyundai', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Seongnam FC', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Suwon Samsung Bluewings', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'FC Seoul', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Pohang Steelers', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Daegu FC', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Jeju United', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gangwon FC', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Incheon United', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gimcheon Sangmu', 'South Korea', 'K League 1', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Gwangju FC', 'South Korea', 'K League 1', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- Chinese Super League — 16 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Shanghai Port', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Shandong Taishan', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Beijing Guoan', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Guangzhou FC', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Wuhan Three Towns', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Zhejiang FC', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Shenzhen FC', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Tianjin Jinmen Tiger', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Changchun Yatai', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Dalian Professional', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Chengdu Rongcheng', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Cangzhou Mighty Lions', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Henan FC', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Meizhou Hakka', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Qingdao Hainiu', 'China', 'Chinese Super League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Nantong Zhiyun', 'China', 'Chinese Super League', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- A-League (Australia) — 12 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Melbourne City', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Sydney FC', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Melbourne Victory', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Western Sydney Wanderers', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Adelaide United', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Perth Glory', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Brisbane Roar', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Central Coast Mariners', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Newcastle Jets', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Wellington Phoenix', 'New Zealand', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Macarthur FC', 'Australia', 'A-League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Western United', 'Australia', 'A-League', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- Egyptian Premier League — 18 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Al Ahly', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Zamalek', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Pyramids FC', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Ismaily', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Future FC', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Smouha', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'El Masry', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Ittihad Alexandria', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'ENPPI', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Ghazl El Mahalla', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Ceramica Cleopatra', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'National Bank of Egypt', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'El Entag El Harby', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Al Ittihad', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Tanta FC', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Pharco FC', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Modern Sport', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'El Gaish', 'Egypt', 'Egyptian Premier League', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- South African PSL — 16 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(), 'Mamelodi Sundowns', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Kaizer Chiefs', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Orlando Pirates', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Cape Town City', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'SuperSport United', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Stellenbosch FC', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Golden Arrows', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'TS Galaxy', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'AmaZulu FC', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Sekhukhune United', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Chippa United', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Cape Town Spurs', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Polokwane City', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Richards Bay', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Moroka Swallows', 'South Africa', 'PSL', false, '[]'::jsonb, now()),
  (gen_random_uuid(), 'Baroka FC', 'South Africa', 'PSL', false, '[]'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- ─── VERIFICACIÓN FINAL ───
SELECT country, league, COUNT(*) as clubes
FROM clubs
GROUP BY country, league
ORDER BY country, league;
