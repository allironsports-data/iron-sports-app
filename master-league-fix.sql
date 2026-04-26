-- =============================================
-- All Iron Sports — MASTER LEAGUE FIX
-- Estrategia: asignación POSITIVA (cada club →
-- su liga correcta). No elimina nada.
-- Seguro de ejecutar múltiples veces.
-- =============================================

-- ═══════════════════════════════════════════
-- SCOTLAND — forzar fuera de Championship/England
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Scottish Premiership', country = 'Scotland'
WHERE name IN (
  'Celtic','Rangers','Aberdeen','Heart of Midlothian','Hearts','Hibernian',
  'Kilmarnock','Livingston','Motherwell','St Mirren','St Johnstone','Dundee',
  'Dundee United','Ross County','Hamilton Academical','Inverness CT',
  'Partick Thistle','Ayr United','Dundee FC','St Johnstone FC',
  'Livingston FC','Motherwell FC','St Mirren FC'
);

-- ═══════════════════════════════════════════
-- ENGLAND — Premier League (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Premier League', country = 'England'
WHERE name IN (
  'Arsenal','Aston Villa','Brentford','Brighton','Brighton & Hove Albion',
  'Chelsea','Crystal Palace','Everton','Fulham',
  'Ipswich Town','Ipswich',
  'Leicester City','Leicester',
  'Liverpool',
  'Manchester City','Man City','Manchester City FC',
  'Manchester United','Man United','Manchester United FC',
  'Newcastle United','Newcastle','Newcastle United FC',
  'Nottingham Forest','Nottm Forest','Nott''m Forest',
  'Southampton',
  'Tottenham Hotspur','Tottenham','Spurs',
  'West Ham United','West Ham',
  'Wolverhampton Wanderers','Wolves','Wolverhampton',
  'AFC Bournemouth','Bournemouth'
);

-- ═══════════════════════════════════════════
-- ENGLAND — Championship (24)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Championship', country = 'England'
WHERE name IN (
  'Leeds United','Leeds',
  'Burnley','Burnley FC',
  'Sheffield United',
  'Luton Town','Luton',
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
  'Sunderland',
  'Bristol City',
  'Watford',
  'Preston North End','Preston',
  'Plymouth Argyle','Plymouth',
  'Derby County','Derby',
  'Portsmouth',
  'Oxford United','Oxford',
  'Hull City','Hull'
);

-- ═══════════════════════════════════════════
-- ENGLAND — EFL League One (24)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'EFL League One', country = 'England'
WHERE name IN (
  'Barnsley','Birmingham City','Birmingham',
  'Bolton Wanderers','Bolton',
  'Bradford City','Bradford',
  'Cambridge United','Cambridge',
  'Charlton Athletic','Charlton',
  'Exeter City','Exeter',
  'Huddersfield Town','Huddersfield',
  'Lincoln City','Lincoln',
  'Peterborough United','Peterborough',
  'Reading',
  'Rotherham United','Rotherham',
  'Shrewsbury Town','Shrewsbury',
  'Stevenage',
  'Wigan Athletic','Wigan',
  'Wrexham',
  'Bristol Rovers',
  'Blackpool',
  'Leyton Orient',
  'Northampton Town','Northampton',
  'Burton Albion','Burton',
  'Crawley Town','Crawley',
  'Wycombe Wanderers','Wycombe',
  'Stockport County','Stockport'
);

-- ═══════════════════════════════════════════
-- SPAIN — La Liga (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'La Liga', country = 'Spain'
WHERE name IN (
  'Athletic Club','Athletic Bilbao',
  'Atletico Madrid','Atlético Madrid','Atletico de Madrid',
  'Barcelona','FC Barcelona',
  'Real Betis','Betis','Real Betis Balompi',
  'Celta','Celta Vigo','RC Celta','RC Celta de Vigo',
  'Espanyol','RCD Espanyol','Espanyol FC',
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
  'Deportivo Alaves','Alavés','Deportivo Alavés','Alaves'
);

-- ═══════════════════════════════════════════
-- SPAIN — La Liga 2 / Segunda División (22)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'La Liga 2', country = 'Spain'
WHERE name IN (
  'Almeria','Almería','UD Almería',
  'Burgos CF','Burgos',
  'Albacete','Albacete BP',
  'Alcorcon','Alcorcón','AD Alcorcón',
  'Cartagena','FC Cartagena',
  'Castellon','Castellón','CD Castellón',
  'Eldense','CD Eldense',
  'Ferrol','Racing Ferrol',
  'Huesca','SD Huesca',
  'Mirandes','Mirandés','CD Mirandés',
  'Oviedo','Real Oviedo',
  'Racing Santander','Racing de Santander',
  'Sabadell','CE Sabadell',
  'Sporting Gijon','Sporting de Gijón',
  'Tenerife','CD Tenerife',
  'Zaragoza','Real Zaragoza',
  'Elche','Elche CF',
  'Granada','Granada CF',
  'Levante','Levante UD',
  'Malaga','Málaga','Málaga CF',
  'Ponferradina','SD Ponferradina',
  'Villarreal B','Villarreal II'
);

-- ═══════════════════════════════════════════
-- SPAIN — Primera RFEF (18 — solo Grupo 1 típico)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Primera RFEF', country = 'Spain'
WHERE name IN (
  'Andorra FC','FC Andorra',
  'Ceuta','AD Ceuta',
  'Deportivo','RC Deportivo','Deportivo de La Coruña',
  'Eibar','SD Eibar',
  'Fuenlabrada','CF Fuenlabrada',
  'Gimnastic','Gimnàstic de Tarragona','Nàstic',
  'Ibiza','UD Ibiza',
  'Linense','La Linense','AD La Linense',
  'Marbella','Marbella FC',
  'Merida','CP Mérida',
  'Numancia','CD Numancia',
  'Real Union','Real Unión',
  'San Sebastian de los Reyes','San Sebastián',
  'Sestao River','Sestao',
  'Teruel','CD Teruel',
  'Unionistas','Unionistas de Salamanca',
  'Real Murcia','Murcia'
);

-- ═══════════════════════════════════════════
-- GERMANY — Bundesliga (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Bundesliga', country = 'Germany'
WHERE name IN (
  'Bayern Munich','FC Bayern','FC Bayern München','Bayern München',
  'Borussia Dortmund','BVB','Dortmund',
  'Bayer Leverkusen','Leverkusen',
  'RB Leipzig','Leipzig',
  'Union Berlin','1. FC Union Berlin',
  'Freiburg','SC Freiburg',
  'Wolfsburg','VfL Wolfsburg',
  'Eintracht Frankfurt','Frankfurt',
  'Borussia Monchengladbach','Borussia Mönchengladbach','Gladbach','Mönchengladbach',
  'Werder Bremen','Werder',
  'Stuttgart','VfB Stuttgart',
  'Augsburg','FC Augsburg',
  'Hoffenheim','TSG Hoffenheim','TSG 1899 Hoffenheim',
  'Mainz','FSV Mainz 05','Mainz 05',
  'Heidenheim','1. FC Heidenheim',
  'Bochum','VfL Bochum',
  'Holstein Kiel','Kiel',
  'St. Pauli','FC St. Pauli'
);

-- ═══════════════════════════════════════════
-- GERMANY — 2. Bundesliga (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = '2. Bundesliga', country = 'Germany'
WHERE name IN (
  'Hamburger SV','Hamburg','HSV',
  'Fortuna Düsseldorf','Fortuna Dusseldorf','Düsseldorf',
  'Hannover 96','Hannover',
  'Kaiserslautern','1. FC Kaiserslautern',
  'Karlsruher SC','Karlsruhe',
  'Magdeburg','1. FC Magdeburg',
  'Nuremberg','1. FC Nürnberg','Nürnberg','Nurnberg',
  'Paderborn','SC Paderborn 07',
  'Greuther Fürth','SpVgg Greuther Fürth','Fürth',
  'Hertha BSC','Hertha','Hertha Berlin',
  'Darmstadt','SV Darmstadt 98','Darmstadt 98',
  'Elversberg','SV 07 Elversberg',
  'Braunschweig','Eintracht Braunschweig',
  'Schalke 04','FC Schalke 04','Schalke',
  'Köln','1. FC Köln','FC Cologne','Koln',
  'Jahn Regensburg','SSV Jahn Regensburg','Regensburg',
  'Preußen Münster','Munster','Preussen Münster',
  'Ulm','SSV Ulm 1846'
);

-- ═══════════════════════════════════════════
-- FRANCE — Ligue 1 (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Ligue 1', country = 'France'
WHERE name IN (
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

-- ═══════════════════════════════════════════
-- ITALY — Serie A (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Serie A', country = 'Italy'
WHERE name IN (
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

-- ═══════════════════════════════════════════
-- NETHERLANDS — Eredivisie (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Eredivisie', country = 'Netherlands'
WHERE name IN (
  'Ajax','AFC Ajax',
  'PSV','PSV Eindhoven',
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

-- ═══════════════════════════════════════════
-- NETHERLANDS — Eerste Divisie (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Eerste Divisie', country = 'Netherlands'
WHERE name IN (
  'Excelsior','SBV Excelsior',
  'FC Volendam','Volendam',
  'Cambuur','SC Cambuur',
  'Roda JC','Roda JC Kerkrade',
  'De Graafschap',
  'FC Eindhoven',
  'Jong Ajax',
  'Jong PSV',
  'Jong AZ',
  'Jong Utrecht','FC Utrecht Jong',
  'Helmond Sport',
  'MVV Maastricht','MVV',
  'Telstar',
  'Top Oss','FC Oss',
  'VVV-Venlo','VVV',
  'Den Bosch','FC Den Bosch',
  'Almere City B',
  'FC Dordrecht','Dordrecht',
  'Jong Feyenoord',
  'Emmen','FC Emmen'
);

-- ═══════════════════════════════════════════
-- PORTUGAL — Primeira Liga (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Primeira Liga', country = 'Portugal'
WHERE name IN (
  'Benfica','SL Benfica',
  'Porto','FC Porto',
  'Sporting CP','Sporting','Sporting Clube de Portugal',
  'Braga','SC Braga','Sporting de Braga',
  'Vitoria Guimaraes','Vitória SC','Guimaraes',
  'Famalicao','FC Famalicão',
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

-- ═══════════════════════════════════════════
-- BELGIUM — Pro League (16) — EXACTOS
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Pro League', country = 'Belgium'
WHERE name IN (
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
  'Sint-Truiden','STVV','VV Sint-Truiden',
  'Standard Liège','Standard Liege','Standard',
  'Westerlo','KVC Westerlo',
  'RWDM','Racing White Daring Molenbeek',
  'Dender','KSC Deinze'
);

-- ═══════════════════════════════════════════
-- BELGIUM — 1B Pro League (8)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = '1B Pro League', country = 'Belgium'
WHERE name IN (
  'Lommel SK','Lommel',
  'KV Oostende','Oostende',
  'Zulte Waregem','SV Zulte-Waregem',
  'Eupen','AS Eupen',
  'KMSK Deinze','Deinze',
  'Beveeren','SK Beveren',
  'Lierse Kempenzonen','Lierse',
  'La Louvière Centre','La Louvière'
);

-- ═══════════════════════════════════════════
-- AUSTRIA — Bundesliga (12)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Austrian Bundesliga', country = 'Austria'
WHERE name IN (
  'FC Salzburg','Red Bull Salzburg','RB Salzburg',
  'SK Sturm Graz','Sturm Graz',
  'SK Rapid Wien','Rapid Wien','Rapid',
  'FK Austria Wien','Austria Wien','Austria Vienna',
  'LASK','LASK Linz',
  'Wolfsberger AC','Wolfsberg','WAC',
  'TSV Hartberg','Hartberg',
  'SCR Altach','Altach',
  'FC Blau-Weiss Linz','Blau-Weiss Linz',
  'Grazer AK','GAK',
  'FC Klagenfurt','Austria Klagenfurt',
  'SV Ried','Ried'
);

-- ═══════════════════════════════════════════
-- AUSTRIA — 2. Liga (10)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Austrian 2. Liga', country = 'Austria'
WHERE name IN (
  'Austria Lustenau','FC Austria Lustenau',
  'SC Austria Lustenau',
  'Admira Wacker','FC Admira Wacker',
  'FC Juniors OÖ','Juniors OÖ',
  'FC Dornbirn','Dornbirn',
  'SKU Amstetten','Amstetten',
  'Kapfenberger SV','Kapfenberg',
  'FC Liefering','Liefering',
  'FC Flyeralarm Admira','Flyeralarm Admira',
  'Blau Weiss Linz B'
);

-- ═══════════════════════════════════════════
-- TURKEY — Süper Lig (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Süper Lig', country = 'Turkey'
WHERE name IN (
  'Galatasaray','Galatasaray SK',
  'Fenerbahce','Fenerbahçe','Fenerbahçe SK',
  'Besiktas','Beşiktaş','Beşiktaş JK',
  'Trabzonspor',
  'Istanbul Basaksehir','İstanbul Başakşehir',
  'Sivasspor',
  'Konyaspor',
  'Alanyaspor',
  'Kasimpasa','Kasımpaşa',
  'Antalyaspor',
  'Rizespor','Çaykur Rizespor',
  'Hatayspor',
  'Pendikspor',
  'Fatih Karagumruk','Fatih Karagümrük',
  'Adana Demirspor',
  'Gaziantep FK','Gaziantep',
  'Samsunspor',
  'Kayserispor',
  'Ankaragücü','MKE Ankaragücü',
  'Bodrum FK'
);
-- Alias Super Lig → Süper Lig
UPDATE clubs SET league = 'Süper Lig' WHERE league = 'Super Lig' AND country = 'Turkey';

-- ═══════════════════════════════════════════
-- TURKEY — 1. Lig (19)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = '1. Lig', country = 'Turkey'
WHERE name IN (
  'Bandirmaspor','Boluspor','Bursaspor','Denizlispor',
  'Erzurumspor FK','Genclerbirligi','Gençlerbirliği',
  'Goztepe','Göztepec',
  'Istanbulspor',
  'Karagumruk','FK Karagümrük',
  'Keciörengücü','Keçiörengücü',
  'Kocaelispor','Manisa FK','Sakaryaspor',
  'Altay','Altınordu','Tarsus İdman Yurdu',
  'Eyüpspor','Çorum FK'
);

-- ═══════════════════════════════════════════
-- RUSSIA — Premier League
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Premier League Russia', country = 'Russia'
WHERE name IN (
  'Zenit','Zenit St. Petersburg','FC Zenit',
  'CSKA Moscow','CSKA',
  'Spartak Moscow','Spartak',
  'Lokomotiv Moscow','Lokomotiv',
  'Dynamo Moscow','Dynamo',
  'Krasnodar','FC Krasnodar',
  'Rubin Kazan','Rubin',
  'Rostov','FC Rostov',
  'Sochi','FC Sochi',
  'Akhmat Grozny','Akhmat',
  'Urals','Ural','FC Ural',
  'Orenburg','FC Orenburg',
  'Torpedo Moscow','Torpedo'
);

-- ═══════════════════════════════════════════
-- BRAZIL — Serie A (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Serie A', country = 'Brazil'
WHERE name IN (
  'Flamengo','CR Flamengo',
  'Palmeiras','SE Palmeiras',
  'Atletico Mineiro','Atlético Mineiro','Galo',
  'Fluminense',
  'Corinthians','SC Corinthians Paulista',
  'Internacional','Sport Club Internacional',
  'Gremio','Grêmio',
  'Sao Paulo','São Paulo FC',
  'Botafogo',
  'Santos','Santos FC',
  'America Mineiro','América Mineiro',
  'Bahia','EC Bahia',
  'Bragantino','Red Bull Bragantino',
  'Athletico Paranaense','Athletico-PR','Atletico Paranaense',
  'Cruzeiro',
  'Cuiaba','Cuiabá',
  'Fortaleza','Fortaleza EC',
  'Goias','Goiás','EC Goiás',
  'Coritiba','Coritiba FC',
  'Vasco da Gama','Vasco'
);

-- ═══════════════════════════════════════════
-- ARGENTINA — Primera División (20)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Primera Division', country = 'Argentina'
WHERE name IN (
  'River Plate','Club Atlético River Plate',
  'Boca Juniors','Club Atlético Boca Juniors',
  'Racing Club','Racing',
  'Independiente','Club Atlético Independiente',
  'San Lorenzo','San Lorenzo de Almagro',
  'Lanus','Lanús',
  'Estudiantes','Estudiantes de La Plata',
  'Velez Sarsfield','Vélez Sarsfield','Velez',
  'Huracan','Huracán',
  'Belgrano','Club Atlético Belgrano',
  'Talleres','Talleres de Córdoba',
  'Atletico Tucuman','Atlético Tucumán',
  'Defensa y Justicia',
  'Tigre','Club Atlético Tigre',
  'Gimnasia La Plata','Gimnasia y Esgrima',
  'Godoy Cruz','Godoy Cruz Antonio Tomba',
  'Newell''s Old Boys','Newells',
  'Rosario Central','Rosario Central FC',
  'Platense','Club Atlético Platense',
  'Banfield'
);

-- ═══════════════════════════════════════════
-- MLS — USA (30)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'MLS', country = 'USA'
WHERE name IN (
  'LA Galaxy','Los Angeles Galaxy',
  'LAFC','Los Angeles FC',
  'Inter Miami','Inter Miami CF',
  'New York City FC','NYCFC',
  'New York Red Bulls','NYRB',
  'Atlanta United','Atlanta United FC',
  'Seattle Sounders','Seattle Sounders FC',
  'Portland Timbers','Portland Timbers FC',
  'Toronto FC',
  'CF Montreal','CF Montréal','Montreal Impact',
  'Columbus Crew',
  'Philadelphia Union',
  'New England Revolution','New England',
  'D.C. United','DC United',
  'Chicago Fire','Chicago Fire FC',
  'FC Dallas','Dallas',
  'Houston Dynamo','Houston Dynamo FC',
  'Minnesota United','Minnesota United FC',
  'Real Salt Lake','RSL',
  'San Jose Earthquakes','San Jose',
  'Colorado Rapids','Colorado',
  'Sporting Kansas City','SKC',
  'Vancouver Whitecaps','Vancouver',
  'Orlando City','Orlando City SC',
  'Charlotte FC',
  'Austin FC',
  'St. Louis City','St. Louis City SC',
  'Nashville SC',
  'San Diego FC',
  'San Jose Earthquakes'
);

-- ═══════════════════════════════════════════
-- MEXICO — Liga MX (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Liga MX', country = 'Mexico'
WHERE name IN (
  'Club America','América',
  'Guadalajara','Chivas','CD Guadalajara',
  'Cruz Azul',
  'Tigres UANL','Tigres',
  'Monterrey','CF Monterrey',
  'Pachuca','CF Pachuca',
  'Pumas UNAM','Pumas',
  'Santos Laguna','Santos',
  'Atlas FC','Atlas',
  'Leon','León','Club León',
  'Necaxa','Club Necaxa',
  'Toluca','Deportivo Toluca',
  'Tijuana','Xolos','Club Tijuana',
  'Mazatlan FC','Mazatlán FC',
  'Puebla','Club Puebla',
  'FC Juárez','FC Juarez',
  'Queretaro','Querétaro FC'
);

-- ═══════════════════════════════════════════
-- SAUDI ARABIA — Saudi Pro League (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Saudi Pro League', country = 'Saudi Arabia'
WHERE name IN (
  'Al Hilal','Al-Hilal','Al-Hilal SFC',
  'Al Nassr','Al-Nassr','Al-Nassr FC',
  'Al Ahli','Al-Ahli','Al-Ahli Saudi FC',
  'Al Ittihad','Al-Ittihad','Al-Ittihad Jeddah',
  'Al Qadsiah','Al-Qadsiah',
  'Al Fateh','Al-Fateh',
  'Al Khaleej','Al-Khaleej',
  'Al Riyadh','Al-Riyadh',
  'Al Wahda','Al-Wahda',
  'Al Okhdood','Al-Okhdood',
  'Al Ettifaq','Al-Ettifaq',
  'Abha Club','Abha',
  'Al Shabaab','Al-Shabaab',
  'Damac FC','DAMAC FC',
  'Al Taawoun','Al-Taawoun',
  'Al Hazm','Al-Hazm',
  'Neom SC',
  'Al Qadisiyah'
);

-- ═══════════════════════════════════════════
-- POLAND — Ekstraklasa (18)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Ekstraklasa', country = 'Poland'
WHERE name IN (
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

-- ═══════════════════════════════════════════
-- SWITZERLAND — Swiss Super League (12)
-- ═══════════════════════════════════════════
UPDATE clubs SET league = 'Swiss Super League', country = 'Switzerland'
WHERE name IN (
  'BSC Young Boys','Young Boys','YB',
  'FC Basel','Basel',
  'FC Zürich','FC Zurich','Zürich',
  'Servette FC','Servette',
  'FC St. Gallen','St. Gallen','St Gallen',
  'Grasshopper Club','Grasshopper','GC',
  'FC Lugano','Lugano',
  'FC Luzern','Luzern',
  'FC Sion','Sion',
  'Lausanne-Sport','FC Lausanne-Sport',
  'Yverdon','Yverdon Sport','Yverdon-Sport FC',
  'Winterthur','FC Winterthur'
);

-- ═══════════════════════════════════════════
-- VERIFICACIÓN — pega el resultado aquí
-- ═══════════════════════════════════════════
SELECT country, league, COUNT(*) as clubes
FROM clubs
GROUP BY country, league
ORDER BY country, league;
