-- =============================================
-- All Iron Sports — CLEANUP DEFINITIVO
-- Elimina duplicados de ligas. Protege clubes
-- con negociaciones activas (los mueve a "Sin liga")
-- =============================================

-- ─── HELPER: ver clubes con negociaciones ────
-- (No borres estos — se mueven a "Sin liga")

-- ════════════════════════════════════════════
-- 1. CZECH REPUBLIC — 31→16
--    Problema: clubes eslovacos arrastrados
-- ════════════════════════════════════════════

-- Primero: devolver clubes eslovacos a Slovakia
UPDATE clubs SET country = 'Slovakia', league = 'Slovak Super Liga'
WHERE country = 'Czech Republic'
AND name IN (
  'Spartak Trnava','MFK Zemplin Michalovce','Slovan Bratislava',
  'DAC Dunajska Streda','FC DAC','Zilina','FK Zilina','Ruzomberok',
  'FK Ruzomberok','AS Trencin','FK AS Trencin','Tatran Presov',
  'MFK Ruzomberok','MFK Skalica','FC Nitra','MFK Dubnica'
);

-- Luego: borrar extras en Czech First League (protegiendo los que tienen negociaciones)
DELETE FROM clubs
WHERE league = 'Czech First League'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  -- Equipos correctos Czech First League
  'Sparta Praha','AC Sparta Praha','Sparta Prague',
  'Slavia Praha','SK Slavia Praha','Slavia Prague',
  'Viktoria Plzen','FC Viktoria Plzeň','Plzen','Viktoria Plzeň',
  'Sigma Olomouc','SK Sigma Olomouc','Olomouc',
  'Banik Ostrava','FC Baník Ostrava','Baník Ostrava',
  'Jablonec','FK Jablonec','FK Jablonec nad Nisou',
  'Slovacko','FC Slovácko','Slovácko',
  'Teplice','FK Teplice',
  'Liberec','FC Slovan Liberec','Slovan Liberec',
  'Mlada Boleslav','FK Mladá Boleslav','Mladá Boleslav',
  'Bohemians','Bohemians 1905','Bohemians Praha 1905',
  'Hradec Kralove','FK Hradec Králové','Hradec Králové',
  'Pardubice','FK Pardubice',
  'Karvina','MFK Karviná','Karviná',
  'Brno','FC Zbrojovka Brno','Zbrojovka Brno','MFK Brno',
  'Zlin','FC Fastav Zlín','Fastav Zlin','Zlín'
);

-- ════════════════════════════════════════════
-- 2. SCOTLAND — 19→12
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Scottish Premiership'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Celtic','Rangers','Aberdeen',
  'Heart of Midlothian','Hearts',
  'Hibernian','Hibs',
  'Kilmarnock','Livingston','Motherwell',
  'St Mirren','St Johnstone','Dundee','Dundee United','Ross County',
  'Dundee FC','St Johnstone FC'
);

-- ════════════════════════════════════════════
-- 3. ENGLAND — Premier League 22→20
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Premier League' AND country = 'England'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Arsenal','Aston Villa','Brentford','Brighton','Brighton & Hove Albion',
  'Chelsea','Crystal Palace','Everton','Fulham',
  'Ipswich Town','Ipswich',
  'Leicester City','Leicester',
  'Liverpool','Manchester City','Man City',
  'Manchester United','Man United',
  'Newcastle United','Newcastle',
  'Nottingham Forest','Nottm Forest',
  'Southampton',
  'Tottenham Hotspur','Tottenham','Spurs',
  'West Ham United','West Ham',
  'Wolverhampton Wanderers','Wolves','Wolverhampton',
  'AFC Bournemouth','Bournemouth'
);

-- ════════════════════════════════════════════
-- 4. ENGLAND — Championship 33→24
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Championship' AND country = 'England'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Leeds United','Leeds',
  'Burnley','Sheffield United',
  'Middlesbrough','Boro',
  'West Bromwich Albion','West Brom',
  'Stoke City','Stoke',
  'Coventry City','Coventry',
  'Norwich City','Norwich',
  'Sheffield Wednesday',
  'QPR','Queens Park Rangers',
  'Millwall',
  'Cardiff City','Cardiff',
  'Swansea City','Swansea',
  'Blackburn Rovers','Blackburn',
  'Sunderland','Bristol City',
  'Watford','Preston North End','Preston',
  'Plymouth Argyle','Plymouth',
  'Derby County','Derby',
  'Portsmouth','Oxford United','Oxford',
  'Hull City','Hull',
  'Luton Town','Luton'
);

-- ════════════════════════════════════════════
-- 5. GERMANY — Bundesliga 20→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Bundesliga' AND country = 'Germany'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Bayern Munich','FC Bayern','FC Bayern München','Bayern München',
  'Borussia Dortmund','BVB','Dortmund',
  'Bayer Leverkusen','Leverkusen',
  'RB Leipzig','Leipzig',
  'Union Berlin','1. FC Union Berlin',
  'Freiburg','SC Freiburg',
  'Wolfsburg','VfL Wolfsburg',
  'Eintracht Frankfurt','Frankfurt',
  'Borussia Monchengladbach','Borussia Mönchengladbach','Gladbach',
  'Werder Bremen','Werder',
  'Stuttgart','VfB Stuttgart',
  'Augsburg','FC Augsburg',
  'Hoffenheim','TSG Hoffenheim',
  'Mainz','FSV Mainz 05','Mainz 05',
  'Heidenheim','1. FC Heidenheim',
  'Bochum','VfL Bochum',
  'Holstein Kiel','Kiel',
  'St. Pauli','FC St. Pauli'
);

-- ════════════════════════════════════════════
-- 6. GERMANY — 2. Bundesliga 23→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = '2. Bundesliga' AND country = 'Germany'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Hamburger SV','Hamburg','HSV',
  'Fortuna Düsseldorf','Fortuna Dusseldorf','Düsseldorf',
  'Hannover 96','Hannover',
  'Kaiserslautern','1. FC Kaiserslautern',
  'Karlsruher SC','Karlsruhe',
  'Magdeburg','1. FC Magdeburg',
  'Nürnberg','1. FC Nürnberg','Nurnberg',
  'Paderborn','SC Paderborn 07',
  'Greuther Fürth','SpVgg Greuther Fürth','Fürth',
  'Hertha BSC','Hertha','Hertha Berlin',
  'Darmstadt','SV Darmstadt 98','Darmstadt 98',
  'Elversberg','SV 07 Elversberg',
  'Braunschweig','Eintracht Braunschweig',
  'Schalke 04','FC Schalke 04','Schalke',
  'Köln','1. FC Köln','Koln',
  'Regensburg','SSV Jahn Regensburg','Jahn Regensburg',
  'Preußen Münster','Preussen Münster',
  'Ulm','SSV Ulm 1846'
);

-- ════════════════════════════════════════════
-- 7. HUNGARY — NB I 17→12
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'NB I'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Ferencvaros','Ferencváros','FTC','Fradi',
  'Puskas Akademia','Puskás Akadémia',
  'MOL Fehervar','MOL Fehérvár','Fehérvár',
  'Debreceni VSC','Debrecen','DVSC',
  'Paksi FC','Paks',
  'Ujpest','Újpest','Újpest FC',
  'Kisvarda','Kisvárda','Kisvárda FC',
  'Zalaegerszegi TE','Zalaegerszeg','ZTE',
  'Gyirmót FC','Gyirmot',
  'MTK Budapest','MTK',
  'Kecskeméti TE','Kecskemet','Kecskemeti TE',
  'Honved','Budapest Honved','Budapesti Honvéd'
);

-- ════════════════════════════════════════════
-- 8. ITALY — Serie A 27→20
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Serie A' AND country = 'Italy'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'AC Milan','Milan',
  'Inter Milan','Inter','FC Internazionale','Internazionale',
  'Juventus','Juventus FC',
  'Napoli','SSC Napoli',
  'Roma','AS Roma',
  'Lazio','SS Lazio',
  'Atalanta','Atalanta BC',
  'Fiorentina','ACF Fiorentina',
  'Torino FC','Torino',
  'Bologna','Bologna FC',
  'Udinese','Udinese Calcio',
  'Genoa','Genoa CFC',
  'Cagliari','Cagliari Calcio',
  'Como','Como 1907',
  'Empoli','Empoli FC',
  'Hellas Verona','Verona',
  'Monza','AC Monza',
  'Parma','Parma Calcio',
  'Lecce','US Lecce',
  'Venezia','Venezia FC'
);

-- ════════════════════════════════════════════
-- 9. ITALY — Serie B 27→20
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Serie B' AND country = 'Italy'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Sassuolo','US Sassuolo',
  'Palermo','US Palermo',
  'Cremonese','US Cremonese',
  'Catanzaro','US Catanzaro',
  'Pisa','AC Pisa','Pisa SC',
  'Spezia','AC Spezia',
  'Brescia','Brescia Calcio',
  'Cesena','AC Cesena',
  'Südtirol','FC Südtirol',
  'Sampdoria','UC Sampdoria',
  'Mantova','AC Mantova',
  'Reggiana','AC Reggiana',
  'Cittadella','AS Cittadella',
  'Bari','SSC Bari','FC Bari',
  'Cosenza','Cosenza Calcio',
  'Modena','Modena FC',
  'Carrarese','AC Carrarese',
  'Juve Stabia','SS Juve Stabia',
  'Frosinone','Frosinone Calcio',
  'Salernitana','US Salernitana'
);

-- ════════════════════════════════════════════
-- 10. NETHERLANDS — Eredivisie 21→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Eredivisie'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Ajax','AFC Ajax','PSV','PSV Eindhoven',
  'Feyenoord','Feyenoord Rotterdam',
  'AZ Alkmaar','AZ',
  'FC Utrecht','Utrecht',
  'FC Twente','Twente',
  'SC Heerenveen','Heerenveen',
  'Sparta Rotterdam','Sparta',
  'NEC Nijmegen','NEC',
  'Almere City','Almere City FC',
  'Go Ahead Eagles',
  'PEC Zwolle','Zwolle',
  'RKC Waalwijk','RKC',
  'NAC Breda','NAC',
  'Fortuna Sittard','Fortuna',
  'Heracles Almelo','Heracles',
  'FC Groningen','Groningen',
  'Willem II'
);

-- ════════════════════════════════════════════
-- 11. PORTUGAL — Primeira Liga 23→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Primeira Liga'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Benfica','SL Benfica',
  'Porto','FC Porto',
  'Sporting CP','Sporting','Sporting Clube de Portugal',
  'Braga','SC Braga','Sporting de Braga',
  'Vitoria Guimaraes','Vitória SC','Guimaraes',
  'Famalicao','FC Famalicão','Famalicão',
  'Gil Vicente','Gil Vicente FC',
  'Boavista','Boavista FC',
  'Moreirense','Moreirense FC',
  'Casa Pia','Casa Pia AC',
  'Estoril','Estoril Praia',
  'Rio Ave','Rio Ave FC',
  'Nacional','CD Nacional',
  'Arouca','FC Arouca',
  'Farense','SC Farense',
  'Santa Clara','CD Santa Clara',
  'AVS','AVS Futebol',
  'Estrela Amadora','CF Estrela da Amadora'
);

-- ════════════════════════════════════════════
-- 12. SPAIN — La Liga 22→20
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'La Liga' AND country = 'Spain'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Athletic Club','Athletic Bilbao',
  'Atletico Madrid','Atlético Madrid',
  'Barcelona','FC Barcelona',
  'Real Betis','Betis','Real Betis Balompi',
  'Celta','Celta Vigo','RC Celta',
  'Espanyol','RCD Espanyol',
  'Getafe','Getafe CF',
  'Girona','Girona FC',
  'Las Palmas','UD Las Palmas',
  'Leganes','Leganés','CD Leganés',
  'Mallorca','RCD Mallorca',
  'Osasuna','CA Osasuna',
  'Rayo Vallecano',
  'Real Madrid','Real Madrid CF',
  'Real Sociedad',
  'Sevilla','Sevilla FC',
  'Valencia','Valencia CF',
  'Valladolid','Real Valladolid',
  'Villarreal','Villarreal CF',
  'Deportivo Alaves','Alavés','Alaves','Deportivo Alavés'
);

-- ════════════════════════════════════════════
-- 13. SPAIN — La Liga 2 32→22
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'La Liga 2' AND country = 'Spain'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Almeria','Almería','UD Almería',
  'Burgos CF','Burgos',
  'Albacete','Albacete BP',
  'Cartagena','FC Cartagena',
  'Castellon','Castellón','CD Castellón',
  'Eldense','CD Eldense',
  'Racing Ferrol',
  'Huesca','SD Huesca',
  'Mirandes','Mirandés','CD Mirandés',
  'Oviedo','Real Oviedo',
  'Racing Santander','Racing de Santander',
  'Sabadell','CE Sabadell',
  'Sporting Gijon','Sporting de Gijón','Sporting Gijón',
  'Tenerife','CD Tenerife',
  'Zaragoza','Real Zaragoza',
  'Elche','Elche CF',
  'Granada','Granada CF',
  'Levante','Levante UD',
  'Malaga','Málaga','Málaga CF',
  'Ponferradina','SD Ponferradina',
  'Villarreal B','Villarreal II',
  'Alcorcon','Alcorcón'
);

-- ════════════════════════════════════════════
-- 14. SPAIN — Segunda RFEF 51→cleanup
--    Dejar solo los que insertamos
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Segunda RFEF'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL);
-- (Segunda RFEF tiene 80+ equipos en realidad, no es crítica mantenerla detallada)

-- ════════════════════════════════════════════
-- 15. SPAIN — null league → fix
-- ════════════════════════════════════════════
-- Ver cuál es:
SELECT id, name FROM clubs WHERE country = 'Spain' AND league IS NULL;
-- Luego: UPDATE clubs SET league = 'La Liga' WHERE id = '[id del club]';

-- ════════════════════════════════════════════
-- 16. BELGIUM — Pro League 18→16
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Pro League' AND country = 'Belgium'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Club Brugge','Club Brugge KV',
  'Anderlecht','RSC Anderlecht',
  'KAA Gent','Gent',
  'KRC Genk','Genk',
  'Union SG','Royale Union Saint-Gilloise','Union Saint-Gilloise',
  'Beerschot','Beerschot VA',
  'Cercle Brugge',
  'Charleroi','Sporting Charleroi',
  'KV Kortrijk','Kortrijk',
  'KV Mechelen','Mechelen',
  'OH Leuven','Oud-Heverlee Leuven',
  'Sint-Truiden','STVV',
  'Standard Liège','Standard Liege','Standard',
  'Westerlo','KVC Westerlo',
  'RWDM','Racing White Daring Molenbeek',
  'Dender','KSC Deinze'
);

-- ════════════════════════════════════════════
-- 17. BELGIUM — 1B Pro League 12→8
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = '1B Pro League'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Lommel SK','Lommel',
  'KV Oostende','Oostende',
  'Zulte Waregem','SV Zulte-Waregem',
  'Eupen','AS Eupen',
  'KMSK Deinze','Deinze',
  'Beveeren','SK Beveren',
  'Lierse Kempenzonen','Lierse',
  'La Louvière Centre','La Louvière'
);

-- ════════════════════════════════════════════
-- 18. POLAND — Ekstraklasa 23→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Ekstraklasa'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Lech Poznan','Lech Poznań',
  'Legia Warsaw','Legia Warszawa',
  'Rakow Czestochowa','Raków Częstochowa',
  'Pogon Szczecin','Pogoń Szczecin',
  'Cracovia',
  'Piast Gliwice',
  'Wisla Krakow','Wisła Kraków',
  'Gornik Zabrze','Górnik Zabrze',
  'Jagiellonia Bialystok','Jagiellonia Białystok',
  'Slask Wroclaw','Śląsk Wrocław',
  'LKS Lodz','ŁKS Łódź',
  'Radomiak Radom',
  'Motor Lublin',
  'Wisla Plock','Wisła Płock',
  'Zaglebie Lubin','Zagłębie Lubin',
  'Warta Poznan','Warta Poznań',
  'Widzew Lodz','Widzew Łódź',
  'GKS Katowice'
);

-- ════════════════════════════════════════════
-- 19. FRANCE — Ligue 1 21→18
-- ════════════════════════════════════════════
DELETE FROM clubs
WHERE league = 'Ligue 1' AND country = 'France'
AND id NOT IN (SELECT DISTINCT club_id FROM club_negotiations WHERE club_id IS NOT NULL)
AND name NOT IN (
  'Paris Saint-Germain','PSG','Paris SG',
  'Monaco','AS Monaco',
  'Marseille','Olympique de Marseille','OM',
  'Lyon','Olympique Lyonnais','OL',
  'Lille','LOSC Lille','LOSC',
  'Nice','OGC Nice',
  'Lens','RC Lens',
  'Rennes','Stade Rennais','Stade de Rennes',
  'Strasbourg','RC Strasbourg',
  'Montpellier','Montpellier HSC',
  'Nantes','FC Nantes',
  'Toulouse','Toulouse FC',
  'Le Havre','HAC','Le Havre AC',
  'Brest','Stade Brestois','Stade Brest',
  'Reims','Stade de Reims',
  'Saint-Etienne','AS Saint-Étienne','AS Saint-Etienne',
  'Angers','Angers SCO',
  'Auxerre','AJ Auxerre'
);

-- ════════════════════════════════════════════
-- 20. PORTUGAL — Liga Portugal 2 12→16 (faltan)
--    Insertar los que faltan
-- ════════════════════════════════════════════
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'FC Vizela','Portugal','Liga Portugal 2',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Chaves','Portugal','Liga Portugal 2',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Académica','Portugal','Liga Portugal 2',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'FC Penafiel','Portugal','Liga Portugal 2',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════
-- 21. TURKEY — Süper Lig (añadir club faltante)
-- ════════════════════════════════════════════
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Eyüpspor','Turkey','Süper Lig',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════
-- 22. TURKEY — 1. Lig (añadir 3 faltantes)
-- ════════════════════════════════════════════
INSERT INTO clubs (id, name, country, league, is_priority, needs, created_at) VALUES
  (gen_random_uuid(),'Tarsus İdman Yurdu','Turkey','1. Lig',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Çorum FK','Turkey','1. Lig',false,'[]'::jsonb,now()),
  (gen_random_uuid(),'Altınordu','Turkey','1. Lig',false,'[]'::jsonb,now())
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ════════════════════════════════════════════
SELECT country, league, COUNT(*) as clubes
FROM clubs
GROUP BY country, league
ORDER BY country, league;
