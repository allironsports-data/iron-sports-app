-- ============================================================
-- All Iron Sports — Fix ligas v3 (DEFINITIVO)
-- Asigna explícitamente cada club a su liga correcta.
-- No depende de NOT IN, sin riesgo de mover clubes erróneos.
-- ============================================================

-- ═══════════════════════════════════════════
-- PASO 0: CORREGIR CLUBES POR PAÍS (Scotland)
-- ═══════════════════════════════════════════

-- Todos los clubes con country='Scotland' van a Scottish Premiership
UPDATE clubs SET league = 'Scottish Premiership' WHERE country = 'Scotland';

-- Clubes escoceses que puedan tener otro país asignado
UPDATE clubs SET league = 'Scottish Premiership', country = 'Scotland'
WHERE name IN (
  'Celtic','Rangers','Aberdeen','Heart of Midlothian','Hearts','Hibernian',
  'Kilmarnock','Livingston','Motherwell','St Mirren','St Johnstone',
  'Dundee','Dundee United','Ross County','Hamilton Academical','Inverness CT',
  'Partick Thistle','Ayr United','Dundee FC'
);

-- ═══════════════════════════════════════════
-- PASO 1: LA LIGA (Spain) — 20 clubes exactos
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'La Liga', country = 'Spain' WHERE name IN (
  'Athletic Club','Atletico Madrid','Barcelona','Real Betis','Betis',
  'Celta','Celta Vigo','Espanyol','Getafe','Girona','Las Palmas',
  'Leganes','Leganés','Mallorca','Osasuna','Rayo Vallecano',
  'Real Madrid','Real Sociedad','Sevilla','Valencia','Valladolid',
  'Villarreal','Deportivo Alaves','Alaves','Alavés'
);

-- ═══════════════════════════════════════════
-- PASO 2: LA LIGA 2 — 22 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'La Liga 2', country = 'Spain' WHERE name IN (
  'Albacete','Almeria','Almería','Burgos CF','Castellon','Castellón',
  'Cartagena','Eldense','Elche','Ferrol','Racing Club','Racing Santander',
  'Huesca','Levante','Mirandes','Mirandés','Oviedo','Real Oviedo',
  'Sabadell','Santander','Sporting Gijon','Sporting Gijón',
  'Zaragoza','Real Zaragoza','Tenerife','CD Tenerife',
  'Granada','UD Almería','Alcorcon','Alcorcón','Eibar'
);

-- ═══════════════════════════════════════════
-- PASO 3: PREMIER LEAGUE (England) — 20 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Premier League', country = 'England' WHERE name IN (
  'Arsenal','Aston Villa','Brentford','Brighton','Brighton & Hove Albion',
  'Chelsea','Crystal Palace','Everton','Fulham','Ipswich Town','Ipswich',
  'Leicester City','Leicester','Liverpool','Manchester City','Man City',
  'Manchester United','Man United','Man Utd','Newcastle United','Newcastle',
  'Nottingham Forest','Nottm Forest','Southampton',
  'Tottenham Hotspur','Tottenham','Spurs',
  'West Ham United','West Ham',
  'Wolverhampton Wanderers','Wolves','AFC Bournemouth','Bournemouth'
);

-- ═══════════════════════════════════════════
-- PASO 4: CHAMPIONSHIP (England) — 24 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Championship', country = 'England' WHERE name IN (
  'Leeds United','Leeds','West Brom','West Bromwich Albion',
  'Burnley','Middlesbrough','Boro','Stoke City','Stoke',
  'Coventry City','Coventry','Norwich City','Norwich',
  'Sheffield Wednesday','Sheffield Wed',
  'QPR','Queens Park Rangers','Millwall',
  'Cardiff City','Cardiff','Swansea City','Swansea',
  'Blackburn Rovers','Blackburn','Sunderland',
  'Bristol City','Watford','Preston North End','Preston',
  'Plymouth Argyle','Plymouth','Portsmouth','Oxford United','Oxford',
  'Luton Town','Luton','Derby County','Derby',
  'Hull City','Hull','Rotherham United','Rotherham',
  'Birmingham City','Birmingham'
);

-- ═══════════════════════════════════════════
-- PASO 5: BUNDESLIGA (Germany) — 18 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Bundesliga', country = 'Germany' WHERE name IN (
  'Bayern Munich','Bayern München','FC Bayern',
  'Borussia Dortmund','BVB','Dortmund',
  'Bayer Leverkusen','Leverkusen',
  'RB Leipzig','Leipzig',
  'VfB Stuttgart','Stuttgart',
  'Eintracht Frankfurt','Frankfurt',
  'SC Freiburg','Freiburg',
  'Wolfsburg','VfL Wolfsburg',
  'Werder Bremen','Bremen',
  'Borussia Mönchengladbach','Gladbach','Mönchengladbach',
  'Union Berlin','1. FC Union Berlin',
  'Augsburg','FC Augsburg',
  'Hoffenheim','TSG Hoffenheim',
  'Mainz','1. FSV Mainz 05',
  'Heidenheim','1. FC Heidenheim',
  'Bochum','VfL Bochum',
  'Holstein Kiel','Kiel',
  'FC St. Pauli','St. Pauli'
);

-- ═══════════════════════════════════════════
-- PASO 6: SERIE A (Italy) — 20 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Serie A', country = 'Italy' WHERE name IN (
  'AC Milan','Milan','Inter Milan','Inter','Internazionale',
  'Juventus','Napoli','SSC Napoli','AS Roma','Roma',
  'SS Lazio','Lazio','Atalanta','Fiorentina',
  'Bologna','Torino','Torino FC','Udinese',
  'Genoa','Cagliari','Como','Empoli',
  'Hellas Verona','Verona','Monza','AC Monza',
  'Venezia','Venezia FC','Lecce','US Lecce',
  'Parma'
);

-- ═══════════════════════════════════════════
-- PASO 7: SERIE B (Italy) — 20 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Serie B', country = 'Italy' WHERE name IN (
  'Palermo','Frosinone','Sampdoria','Salernitana',
  'Spezia','Pisa','Cremonese','Brescia',
  'Modena','Cosenza','Cittadella','Bari',
  'Reggiana','Südtirol','Südtirol FC','Ascoli',
  'FeralpiSalò','Ternana','Catanzaro','Mantova',
  'Cesena','Carrarese','Juve Stabia','Sudtirol'
);

-- ═══════════════════════════════════════════
-- PASO 8: LIGUE 1 (France) — 18 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Ligue 1', country = 'France' WHERE name IN (
  'Paris Saint-Germain','PSG','Paris SG',
  'Monaco','AS Monaco',
  'Marseille','Olympique Marseille','OM',
  'Lyon','Olympique Lyonnais','OL',
  'Nice','OGC Nice','Lens','RC Lens',
  'Rennes','Stade Rennais',
  'Lille','LOSC','LOSC Lille',
  'Strasbourg','RC Strasbourg',
  'Nantes','FC Nantes','Reims','Stade Reims',
  'Toulouse','Montpellier','Brest',
  'Le Havre','Saint-Etienne','Auxerre',
  'Angers'
);

-- ═══════════════════════════════════════════
-- PASO 9: EREDIVISIE (Netherlands) — 18 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Eredivisie', country = 'Netherlands' WHERE name IN (
  'Ajax','PSV','PSV Eindhoven','Feyenoord',
  'AZ Alkmaar','AZ','FC Utrecht','Utrecht',
  'NEC Nijmegen','NEC','FC Twente','Twente',
  'SC Heerenveen','Heerenveen',
  'Sparta Rotterdam','Sparta',
  'Almere City','Go Ahead Eagles',
  'PEC Zwolle','RKC Waalwijk','RKC',
  'NAC Breda','NAC','Fortuna Sittard',
  'Heracles Almelo','Heracles',
  'FC Groningen','Groningen','Willem II'
);

-- ═══════════════════════════════════════════
-- PASO 10: PRIMERA LIGA (Portugal) — 18 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Primeira Liga', country = 'Portugal' WHERE name IN (
  'Benfica','SL Benfica','Porto','FC Porto',
  'Sporting CP','Sporting','Braga','SC Braga',
  'Vitoria Guimaraes','Vitória','Gil Vicente',
  'Boavista','Rio Ave','Famalicao','Famalicão',
  'Estoril','Casa Pia','Moreirense',
  'Arouca','Farense','Vizela','Estrela Amadora',
  'Nacional','Penafiel'
);

-- ═══════════════════════════════════════════
-- PASO 11: SÜPER LIG (Turkey) — 19 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Super Lig', country = 'Turkey' WHERE name IN (
  'Galatasaray','Fenerbahce','Fenerbahçe','Besiktas','Beşiktaş',
  'Trabzonspor','Basaksehir','Başakşehir','Istanbul Basaksehir',
  'Sivasspor','Kayserispor','Konyaspor','Antalyaspor',
  'Adana Demirspor','Alanyaspor','Gaziantep FK','Gaziantep',
  'Kasimpasa','Kasımpaşa','Hatayspor','Ankaragücü',
  'Karagumruk','Fatih Karagumruk','Rizespor','Caykur Rizespor',
  'Samsunspor','Eyüpspor'
);

-- ═══════════════════════════════════════════
-- PASO 12: PRO LEAGUE (Belgium) — 16 clubes
-- ═══════════════════════════════════════════

UPDATE clubs SET league = 'Pro League', country = 'Belgium' WHERE name IN (
  'Club Brugge','Anderlecht','RSC Anderlecht',
  'KAA Gent','Gent','KRC Genk','Genk',
  'Union SG','Union Saint-Gilloise',
  'Cercle Brugge','Charleroi',
  'KV Kortrijk','Kortrijk',
  'KV Mechelen','Mechelen',
  'OH Leuven','Sint-Truiden','Standard Liège','Standard',
  'Westerlo','RWDM','Beerschot'
);

-- ═══════════════════════════════════════════
-- PASO 13: INSERTAR CLUBES QUE PUEDEN FALTAR
-- ═══════════════════════════════════════════

-- Clubs de La Liga que pueden no existir con esos nombres exactos
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Real Betis','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Celta','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Leganes','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Deportivo Alaves','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Girona','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Las Palmas','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Valladolid','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Espanyol','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Getafe','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Osasuna','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Rayo Vallecano','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Mallorca','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Athletic Club','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Atletico Madrid','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Barcelona','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Real Madrid','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Real Sociedad','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Sevilla','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Valencia','Spain','La Liga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Villarreal','Spain','La Liga',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- Clubs de Bundesliga que pueden faltar
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Bayern Munich','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Borussia Dortmund','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Bayer Leverkusen','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'RB Leipzig','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'VfB Stuttgart','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Eintracht Frankfurt','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'SC Freiburg','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Wolfsburg','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Werder Bremen','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Borussia Mönchengladbach','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Union Berlin','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Augsburg','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Hoffenheim','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Mainz','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Heidenheim','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Bochum','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Holstein Kiel','Germany','Bundesliga',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'FC St. Pauli','Germany','Bundesliga',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════
-- VERIFICACIÓN — pegar resultado aquí
-- ═══════════════════════════════════════════
SELECT league, country, COUNT(*) as total
FROM clubs
WHERE league IN (
  'La Liga','La Liga 2','Premier League','Championship',
  'Bundesliga','2. Bundesliga','Serie A','Serie B',
  'Ligue 1','Ligue 2','Eredivisie','Eerste Divisie',
  'Primeira Liga','Pro League','Super Lig','Scottish Premiership',
  'Ekstraklasa','Austrian Bundesliga'
)
GROUP BY league, country
ORDER BY country, league;
