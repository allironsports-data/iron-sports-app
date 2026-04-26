-- =============================================
-- All Iron Sports — Fix ligas v2 (completo)
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- ════════════════════════════════════════════
-- BLOQUE 1: UNIFICAR NOMBRES DUPLICADOS
-- ════════════════════════════════════════════

-- Czech Republic: unificar todo en "Czech First League"
UPDATE clubs SET league = 'Czech First League', country = 'Czech Republic'
WHERE league IN ('Czech 1. Liga', '1. liga', '1. Fortuna liga', '1. fortuna liga', 'Fortuna Liga');

-- Hungary: unificar OTP Bank Liga → NB I
UPDATE clubs SET league = 'NB I'
WHERE league = 'OTP Bank Liga';

-- Switzerland: unificar Super League → Swiss Super League
UPDATE clubs SET league = 'Swiss Super League'
WHERE league = 'Super League' AND (country = 'Switzerland' OR country IS NULL);

-- ════════════════════════════════════════════
-- BLOQUE 2: SPAIN — LIMPIAR BASURA
-- ════════════════════════════════════════════

-- Borrar "Czech 2" con country Spain (entrada errónea)
DELETE FROM clubs WHERE league = 'Czech 2' AND country = 'Spain';

-- Borrar Spain 5 (no relevante)
DELETE FROM clubs WHERE league = 'Spain 5';

-- Residuos de Spain 3 / Spain 3* → Primera RFEF
UPDATE clubs SET league = 'Primera RFEF'
WHERE league IN ('Spain 3', 'Spain 3*') AND country = 'Spain';

-- Segunda RFEF residuos
UPDATE clubs SET league = 'Segunda RFEF'
WHERE league = 'Spain 4' AND country = 'Spain';

-- ════════════════════════════════════════════
-- BLOQUE 3: LIMPIAR LIGAS SATURADAS
-- Mueve extras a su liga correcta (NO borra)
-- ════════════════════════════════════════════

-- ── Eredivisie (25 → 18) ──
-- Mueve clubs no pertenecientes a Eerste Divisie
UPDATE clubs SET league = 'Eerste Divisie'
WHERE league = 'Eredivisie'
AND name NOT IN (
  'Ajax','AZ Alkmaar','Feyenoord','PSV','FC Utrecht','NEC Nijmegen','FC Twente',
  'SC Heerenveen','Sparta Rotterdam','Almere City','Go Ahead Eagles','PEC Zwolle',
  'RKC Waalwijk','NAC Breda','Fortuna Sittard','Heracles Almelo','FC Groningen','Willem II'
);

-- ── Pro League Bélgica (23 → 16) ──
UPDATE clubs SET league = '1B Pro League', country = 'Belgium'
WHERE league = 'Pro League' AND country = 'Belgium'
AND name NOT IN (
  'Club Brugge','Anderlecht','KAA Gent','KRC Genk','Union SG','Beerschot',
  'Cercle Brugge','Charleroi','KV Kortrijk','KV Mechelen','OH Leuven',
  'Sint-Truiden','Standard Liège','Westerlo','RWDM'
);
-- Nota: 'Deinze' estaba mal en nuestra migración, también lo movemos a 1B
UPDATE clubs SET league = '1B Pro League' WHERE name = 'Deinze' AND country = 'Belgium';

-- ── Austrian Bundesliga (20 → 12) ──
UPDATE clubs SET league = 'Austrian 2. Liga', country = 'Austria'
WHERE league = 'Austrian Bundesliga'
AND name NOT IN (
  'FC Salzburg','SK Sturm Graz','SK Rapid Wien','FK Austria Wien','LASK',
  'Wolfsberger AC','TSV Hartberg','SCR Altach','FC Blau-Weiss Linz',
  'Grazer AK','FC Klagenfurt','SV Ried'
);

-- ── Ekstraklasa Polonia (40 → 18) ──
UPDATE clubs SET league = 'Polish Second League', country = 'Poland'
WHERE league = 'Ekstraklasa'
AND name NOT IN (
  'Lech Poznan','Legia Warsaw','Rakow Czestochowa','Pogon Szczecin','Cracovia',
  'Piast Gliwice','Wisla Krakow','Gornik Zabrze','Jagiellonia Bialystok',
  'Slask Wroclaw','LKS Lodz','Radomiak Radom','Motor Lublin','Wisla Plock',
  'Zaglebie Lubin','Warta Poznan','Widzew Lodz','GKS Katowice'
);

-- ── Serie A Italia (33 → 20) — filtrar por país para no tocar Brasil ──
UPDATE clubs SET league = 'Serie B', country = 'Italy'
WHERE league = 'Serie A' AND country = 'Italy'
AND name NOT IN (
  'AC Milan','Atalanta','Bologna','Cagliari','Como','Empoli','Fiorentina',
  'Genoa','Hellas Verona','Inter Milan','Juventus','SS Lazio','US Lecce',
  'AC Monza','SSC Napoli','Parma','AS Roma','Torino FC','Udinese','Venezia FC'
);

-- ── Premier League Inglaterra (29 → 20) ──
UPDATE clubs SET league = 'Championship', country = 'England'
WHERE league = 'Premier League' AND country = 'England'
AND name NOT IN (
  'Arsenal','Aston Villa','Brentford','Brighton','Chelsea','Crystal Palace',
  'Everton','Fulham','Ipswich Town','Leicester City','Liverpool','Manchester City',
  'Manchester United','Newcastle United','Nottingham Forest','Southampton',
  'Tottenham Hotspur','West Ham United','Wolverhampton Wanderers','AFC Bournemouth'
);

-- ── Swiss Super League (18 → 12 después de merge) ──
UPDATE clubs SET league = 'Challenge League', country = 'Switzerland'
WHERE league = 'Swiss Super League'
AND name NOT IN (
  'BSC Young Boys','FC Basel','FC Zürich','Servette FC','FC St. Gallen',
  'Grasshopper Club','FC Lugano','FC Luzern','FC Sion','Lausanne-Sport',
  'Yverdon','Winterthur'
);

-- ── La Liga (22 → 20) ──
UPDATE clubs SET league = 'La Liga 2', country = 'Spain'
WHERE league = 'La Liga' AND country = 'Spain'
AND name NOT IN (
  'Athletic Club','Atletico Madrid','Barcelona','Real Betis','Celta','Espanyol',
  'Getafe','Girona','Las Palmas','Leganes','Mallorca','Osasuna','Rayo Vallecano',
  'Real Madrid','Real Sociedad','Sevilla','Valencia','Valladolid','Villarreal',
  'Deportivo Alaves'
);

-- ── Primera RFEF (49 → 18) ──
UPDATE clubs SET league = 'Segunda RFEF', country = 'Spain'
WHERE league = 'Primera RFEF' AND country = 'Spain'
AND name NOT IN (
  'Alcorcon','Andorra FC','Ceuta','Deportivo','Eibar','Fuenlabrada',
  'Gimnastic','Ibiza','Linense','Marbella','Merida','Numancia','Racing Ferrol',
  'Real Union','San Sebastian','Sestao','Teruel','Unionistas'
);

-- ════════════════════════════════════════════
-- BLOQUE 4: AÑADIR 6 LIGAS FALTANTES (top 30)
-- ════════════════════════════════════════════

-- J1 League (Japan) — 18 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Urawa Red Diamonds','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Gamba Osaka','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Kashima Antlers','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Yokohama F. Marinos','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Vissel Kobe','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Nagoya Grampus','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'FC Tokyo','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Sanfrecce Hiroshima','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Cerezo Osaka','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Kawasaki Frontale','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Sagan Tosu','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Kashiwa Reysol','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Shonan Bellmare','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Consadole Sapporo','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Jubilo Iwata','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Avispa Fukuoka','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Albirex Niigata','Japan','J1 League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Kyoto Sanga','Japan','J1 League',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- K League 1 (South Korea) — 12 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Jeonbuk Hyundai Motors','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Ulsan Hyundai','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'FC Seoul','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Pohang Steelers','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Daegu FC','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Jeju United','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Gangwon FC','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Incheon United','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Gimcheon Sangmu','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Gwangju FC','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Suwon Samsung Bluewings','South Korea','K League 1',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Seongnam FC','South Korea','K League 1',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- Chinese Super League — 16 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Shanghai Port','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Shandong Taishan','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Beijing Guoan','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Guangzhou FC','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Wuhan Three Towns','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Zhejiang FC','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Tianjin Jinmen Tiger','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Changchun Yatai','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Dalian Professional','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Chengdu Rongcheng','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Cangzhou Mighty Lions','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Henan FC','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Meizhou Hakka','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Qingdao Hainiu','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Nantong Zhiyun','China','Chinese Super League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Shenzhen FC','China','Chinese Super League',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- A-League (Australia) — 12 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Melbourne City','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Sydney FC','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Melbourne Victory','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Western Sydney Wanderers','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Adelaide United','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Perth Glory','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Brisbane Roar','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Central Coast Mariners','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Newcastle Jets','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Wellington Phoenix','New Zealand','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Macarthur FC','Australia','A-League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Western United','Australia','A-League',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- Egyptian Premier League — 18 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Al Ahly','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Zamalek','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Pyramids FC','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Ismaily','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Future FC','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Smouha','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'El Masry','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Ittihad Alexandria','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'ENPPI','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Ghazl El Mahalla','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Ceramica Cleopatra','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'National Bank of Egypt','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'El Entag El Harby','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Al Ittihad','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Pharco FC','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Modern Sport','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'El Gaish','Egypt','Egyptian Premier League',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Tanta FC','Egypt','Egyptian Premier League',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- South African PSL — 16 clubes
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Mamelodi Sundowns','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Kaizer Chiefs','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Orlando Pirates','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Cape Town City','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'SuperSport United','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Stellenbosch FC','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Golden Arrows','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'TS Galaxy','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'AmaZulu FC','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Sekhukhune United','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Chippa United','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Cape Town Spurs','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Polokwane City','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Richards Bay','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Moroka Swallows','South Africa','PSL',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Baroka FC','South Africa','PSL',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ════════════════════════════════════════════
SELECT country, league, COUNT(*) as clubes
FROM clubs
GROUP BY country, league
ORDER BY country, league;
