import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zwcmbdwilayraqixjpwn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9rwjSJXkbKO9Srdtx5Nmhw_tQfHvM34';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Garbage entries to delete
const GARBAGE_ENTRIES = [
  'Free Agent',
  'Intermediary',
  'Agent',
  'AGENT',
  'Investor',
  'Unemployed',
  'Unknown',
  'N/A',
  'TBD',
  'None',
  'Other'
];

// Scottish clubs to fix
const SCOTTISH_CLUBS = [
  'Aberdeen',
  'Celtic',
  'Rangers',
  'Heart of Midlothian',
  'Hearts',
  'Hibernian',
  'Kilmarnock',
  'Livingston',
  'Motherwell',
  'St Mirren',
  'St Johnstone',
  'Dundee',
  'Dundee United',
  'Ross County',
  'Hamilton Academical',
  'Inverness CT',
  'Partick Thistle',
  'Ayr United'
];

// Comprehensive clubs list organized by country/league
const CLUBS_TO_INSERT = [
  // Scotland
  ...['Aberdeen', 'Celtic', 'Rangers', 'Heart of Midlothian', 'Hibernian', 'Kilmarnock', 'Livingston', 'Motherwell', 'St Mirren', 'St Johnstone', 'Dundee', 'Dundee United', 'Ross County', 'Hamilton Academical', 'Inverness CT', 'Partick Thistle', 'Ayr United'].map(name => ({
    name,
    country: 'Scotland',
    league: 'Scottish Premiership',
    isPriority: false,
    needs: []
  })),

  // Greece
  ...['Olympiakos', 'Panathinaikos', 'AEK Athens', 'PAOK', 'Aris Thessaloniki', 'Atromitos', 'Asteras Tripolis', 'OFI Creta', 'PAS Giannina', 'Panetolikos', 'AE Larissa', 'Levadiakos', 'AO Egaleo', 'AE Kifisias', 'Panseraikos', 'Aiolis Eolikos'].map(name => ({
    name,
    country: 'Greece',
    league: 'Super League Greece',
    isPriority: false,
    needs: []
  })),

  // Cyprus
  ...['Anorthosis', 'Apoel FC', 'Pafos FC', 'AEK Larnaca', 'Omonia Nicosia', 'AEL Limassol', 'Aris Limassol', 'Karmiotissa', 'Nea Salamina', 'Apollon Limassol'].map(name => ({
    name,
    country: 'Cyprus',
    league: 'First Division Cyprus',
    isPriority: false,
    needs: []
  })),

  // Saudi Arabia
  ...['Al Hilal', 'Al Nassr', 'Al Ittihad', 'Al Ahli', 'Al Fateh', 'Al Faisaly', 'Al Shabab', 'Al Wahda', 'Al Hazem', 'Al Riyadh', 'Al Tai', 'Al Qadsiyah', 'Al Batin', 'Al Jabalain', 'Abha', 'Ohod Club', 'Damac FC', 'Al Akhdoud'].map(name => ({
    name,
    country: 'Saudi Arabia',
    league: 'Saudi Pro League',
    isPriority: false,
    needs: []
  })),

  // Qatar
  ...['Al Sadd', 'Al Duhail', 'Al Rayyan', 'Al Gharafa', 'Al Wakrah', 'Al Arabi', 'Umm Salal', 'Muaither SC', 'Al Ahly Doha', 'Al Khor'].map(name => ({
    name,
    country: 'Qatar',
    league: 'Qatar Stars League',
    isPriority: false,
    needs: []
  })),

  // UAE
  ...['Al Ain FC', 'Al Wasl', 'Sharjah FC', 'Al Wahda Abu Dhabi', 'Baniyas', 'Al Nasr Dubai', 'Hatta FC', 'Ajman Club', 'Emirates FC', 'KhorFakkan'].map(name => ({
    name,
    country: 'UAE',
    league: 'Arabian Gulf League',
    isPriority: false,
    needs: []
  })),

  // Italy Serie A
  ...['AC Milan', 'Atalanta', 'Bologna', 'Cagliari', 'Como', 'Empoli', 'Fiorentina', 'Genoa', 'Hellas Verona', 'Inter Milan', 'Juventus', 'SS Lazio', 'US Lecce', 'AC Monza', 'SSC Napoli', 'Parma', 'AS Roma', 'Torino FC', 'Udinese', 'Venezia FC'].map(name => ({
    name,
    country: 'Italy',
    league: 'Serie A',
    isPriority: false,
    needs: []
  })),

  // Italy Serie B
  ...['Ascoli', 'Bari', 'Brescia', 'Catanzaro', 'Cesena', 'Cittadella', 'Cosenza', 'Cremonese', 'Frosinone', 'Mantova', 'Modena', 'Palermo', 'Pisa', 'SPAL', 'Sampdoria', 'Salernitana', 'Spezia', 'Südtirol', 'Ternana', 'Carrarese'].map(name => ({
    name,
    country: 'Italy',
    league: 'Serie B',
    isPriority: false,
    needs: []
  })),

  // Italy Serie C
  ...['Avellino', 'Benevento', 'Catania', 'Crotone', 'Foggia', 'Giugliano', 'Juve Stabia', 'Latina', 'Lecco', 'Lucchese', 'Pescara', 'Potenza', 'Reggina', 'Taranto', 'Triestina', 'Turris', 'Virtus Entella', 'Trapani', 'Torres', 'Rimini'].map(name => ({
    name,
    country: 'Italy',
    league: 'Serie C',
    isPriority: false,
    needs: []
  })),

  // England Premier League
  ...['Arsenal', 'Aston Villa', 'Brentford', 'Brighton', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Ipswich Town', 'Leicester City', 'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United', 'Nottingham Forest', 'Southampton', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers', 'AFC Bournemouth'].map(name => ({
    name,
    country: 'England',
    league: 'Premier League',
    isPriority: false,
    needs: []
  })),

  // England Championship
  ...['Blackburn Rovers', 'Blackpool', 'Bristol City', 'Burnley', 'Cardiff City', 'Coventry City', 'Derby County', 'Hull City', 'Leeds United', 'Luton Town', 'Middlesbrough', 'Millwall', 'Norwich City', 'Oxford United', 'Plymouth Argyle', 'Portsmouth', 'Preston North End', 'QPR', 'Sheffield United', 'Sheffield Wednesday', 'Stoke City', 'Sunderland', 'Swansea City', 'Watford', 'West Bromwich Albion'].map(name => ({
    name,
    country: 'England',
    league: 'EFL Championship',
    isPriority: false,
    needs: []
  })),

  // England League One
  ...['Barnsley', 'Birmingham City', 'Bolton Wanderers', 'Bradford City', 'Cambridge United', 'Charlton Athletic', 'Exeter City', 'Fleetwood Town', 'Huddersfield Town', 'Lincoln City', 'Northampton Town', 'Peterborough United', 'Reading', 'Rotherham United', 'Shrewsbury Town', 'Stevenage', 'Stockport County', 'Wigan Athletic', 'Wycombe Wanderers'].map(name => ({
    name,
    country: 'England',
    league: 'EFL League One',
    isPriority: false,
    needs: []
  })),

  // England League Two
  ...['Bristol Rovers', 'Burton Albion', 'Carlisle United', 'Cheltenham', 'Crewe Alexandra', 'Doncaster Rovers', 'Gillingham', 'Grimsby Town', 'Harrogate Town', 'Leyton Orient', 'Mansfield Town', 'Morecambe', 'Newport County', 'Port Vale', 'Salford City', 'Swindon Town', 'Tranmere Rovers', 'Walsall', 'Wrexham', 'York City'].map(name => ({
    name,
    country: 'England',
    league: 'EFL League Two',
    isPriority: false,
    needs: []
  })),

  // Spain La Liga
  ...['Athletic Club', 'Atletico Madrid', 'Barcelona', 'Betis', 'Celta', 'Espanyol', 'Getafe', 'Girona', 'Las Palmas', 'Leganes', 'Mallorca', 'Osasuna', 'Rayo Vallecano', 'Real Madrid', 'Real Sociedad', 'Sevilla', 'Valencia', 'Valladolid', 'Villarreal', 'Deportivo Alaves'].map(name => ({
    name,
    country: 'Spain',
    league: 'La Liga',
    isPriority: false,
    needs: []
  })),

  // Spain La Liga 2
  ...['Albacete', 'Almería', 'Burgos CF', 'Castellón', 'Cartagena', 'Córdoba CF', 'Eldense', 'Huesca', 'Levante', 'Lugo', 'Málaga', 'Mirandés', 'Murcia', 'Numancia', 'Oviedo', 'Racing Santander', 'Sporting Gijón', 'Tenerife', 'Zaragoza', 'Granada'].map(name => ({
    name,
    country: 'Spain',
    league: 'La Liga 2',
    isPriority: false,
    needs: []
  })),

  // Spain Primera RFEF
  ...['Alcorcón', 'Andorra FC', 'Ceuta', 'Deportivo', 'Eibar', 'Fuenlabrada', 'Mérida', 'Ponferradina', 'Racing Ferrol', 'Sabadell', 'SD Logroñés', 'UD Ibiza', 'Linares Deportivo', 'Real Unión', 'UCAM Murcia', 'Cultural Leonesa'].map(name => ({
    name,
    country: 'Spain',
    league: 'Primera RFEF',
    isPriority: false,
    needs: []
  })),

  // France Ligue 1
  ...['AS Monaco', 'AJ Auxerre', 'Angers', 'Brest', 'Clermont', 'Lens', 'Lille', 'Lyon', 'Marseille', 'Metz', 'Montpellier', 'Nantes', 'Nice', 'Nîmes Olympique', 'PSG', 'Reims', 'Rennes', 'Saint-Etienne', 'Strasbourg', 'Toulouse'].map(name => ({
    name,
    country: 'France',
    league: 'Ligue 1',
    isPriority: false,
    needs: []
  })),

  // France Ligue 2
  ...['AC Amiens', 'AC Ajaccio', 'Caen', 'Chambly', 'Dijon', 'Dunkerque', 'EA Guingamp', 'FC Annecy', 'FC Metz', 'Grenoble Foot', 'Laval', 'Le Havre', 'Niort', 'Orléans', 'Pau FC', 'Rodez', 'Sochaux', 'Troyes', 'Valenciennes', 'Paris FC'].map(name => ({
    name,
    country: 'France',
    league: 'Ligue 2',
    isPriority: false,
    needs: []
  })),

  // Germany Bundesliga
  ...['Augsburg', 'Bayer Leverkusen', 'Bayern Munich', 'Bochum', 'Borussia Dortmund', 'Borussia Mönchengladbach', 'Darmstadt 98', 'Eintracht Frankfurt', 'Freiburg', 'Hamburger SV', 'Hoffenheim', 'Holstein Kiel', 'Mainz', 'RB Leipzig', 'SC Freiburg', 'St. Pauli', 'Stuttgart', 'TSG Hoffenheim', 'Union Berlin', 'Wolfsburg'].map(name => ({
    name,
    country: 'Germany',
    league: 'Bundesliga',
    isPriority: false,
    needs: []
  })),

  // Germany 2. Bundesliga
  ...['1860 Munich', 'Arminia Bielefeld', 'Dynamo Dresden', 'FC Heidenheim', 'FC Ingolstadt', 'FC Kaiserslautern', 'FC Köln', 'FC Magdeburg', 'FC Nürnberg', 'FC Saarbrücken', 'FC Schalke 04', 'Fortuna Düsseldorf', 'Greuther Fürth', 'Hamburg SV', 'Hannover 96', 'Jahn Regensburg', 'Karlsruher SC', 'Osnabrück', 'Paderborn', 'Ulm 1846'].map(name => ({
    name,
    country: 'Germany',
    league: '2. Bundesliga',
    isPriority: false,
    needs: []
  })),

  // Portugal Primeira Liga
  ...['Benfica', 'Braga', 'Porto', 'Sporting CP', 'Arouca', 'Boavista', 'Casa Pia', 'Chaves', 'Estoril', 'Famalicão', 'Farense', 'Gil Vicente', 'Moreirense', 'Nacional', 'Paços Ferreira', 'Portimonense', 'Rio Ave', 'Santa Clara', 'Vitória Guimarães', 'Vizela'].map(name => ({
    name,
    country: 'Portugal',
    league: 'Primeira Liga',
    isPriority: false,
    needs: []
  })),

  // Netherlands Eredivisie
  ...['Ajax', 'AZ Alkmaar', 'Feyenoord', 'PSV', 'FC Groningen', 'NEC Nijmegen', 'FC Utrecht', 'Twente', 'SC Heerenveen', 'Sparta Rotterdam', 'Almere City', 'Go Ahead Eagles', 'PEC Zwolle', 'RKC Waalwijk', 'Excelsior', 'NAC Breda', 'Fortuna Sittard', 'Heracles', 'Cambuur', 'Volendam'].map(name => ({
    name,
    country: 'Netherlands',
    league: 'Eredivisie',
    isPriority: false,
    needs: []
  })),

  // Belgium Pro League
  ...['Anderlecht', 'Club Brugge', 'KAA Gent', 'KRC Genk', 'Union SG', 'Beerschot', 'Cercle Brugge', 'Charleroi', 'KV Kortrijk', 'KV Mechelen', 'KV Oostende', 'Leuven', 'Lommel SK', 'RSC Anderlecht', 'Sint-Truiden', 'Standard Liège', 'Westerlo', 'Zulte Waregem', 'Eupen', 'RWDM'].map(name => ({
    name,
    country: 'Belgium',
    league: 'Pro League',
    isPriority: false,
    needs: []
  })),

  // Turkey Süper Lig
  ...['Besiktas', 'Fenerbahce', 'Galatasaray', 'Trabzonspor', 'Basaksehir', 'Sivasspor', 'Konyaspor', 'Antalyaspor', 'Alanyaspor', 'Kayserispor', 'Rizespor', 'Hatayspor', 'Gaziantep FK', 'Ankaragücü', 'Kasımpaşa', 'Samsunspor', 'Pendikspor', 'Eyüpspor', 'Bodrum FK', 'Adana Demirspor'].map(name => ({
    name,
    country: 'Turkey',
    league: 'Süper Lig',
    isPriority: false,
    needs: []
  })),

  // Bulgaria
  ...['CSKA Sofia', 'Ludogorets', 'Levski Sofia', 'CSKA 1948', 'Slavia Sofia', 'Botev Plovdiv', 'Cherno More', 'Etar', 'Pirin FK', 'Loko Plovdiv', 'Arda Kardzhali'].map(name => ({
    name,
    country: 'Bulgaria',
    league: 'First Professional League',
    isPriority: false,
    needs: []
  })),

  // Switzerland Super League
  ...['Basel', 'BSC Young Boys', 'FC Zurich', 'Grasshoppers', 'Lausanne', 'Lugano', 'Luzern', 'Servette', 'Sion', 'St Gallen', 'Winterthur', 'Yverdon Sport'].map(name => ({
    name,
    country: 'Switzerland',
    league: 'Super League',
    isPriority: false,
    needs: []
  })),

  // Austria Bundesliga
  ...['FC Salzburg', 'SK Rapid Wien', 'SK Sturm Graz', 'Austria Wien', 'LASK', 'TSV Hartberg', 'WAC Wolfsberger', 'Austria Lustenau', 'FC Blau-Weiss Linz', 'Admira Wacker', 'SV Ried', 'SCR Altach'].map(name => ({
    name,
    country: 'Austria',
    league: 'Austrian Bundesliga',
    isPriority: false,
    needs: []
  })),

  // Poland Ekstraklasa
  ...['Lech Poznan', 'Legia Warsaw', 'Rakow Czestochowa', 'Pogon Szczecin', 'Cracovia', 'Piast Gliwice', 'Wisla Krakow', 'Gornik Zabrze', 'Jagiellonia Bialystok', 'Slask Wroclaw', 'LKS Lodz', 'Radomiak Radom', 'Motor Lublin', 'Wisla Plock', 'Zagłębie Lubin', 'Warta Poznan', 'Widzew Lodz', 'GKS Katowice'].map(name => ({
    name,
    country: 'Poland',
    league: 'Ekstraklasa',
    isPriority: false,
    needs: []
  })),

  // Czech Republic
  ...['Slavia Praha', 'Sparta Praha', 'Banik Ostrava', 'Bohemians', 'FC Slovacko', 'Mlada Boleslav', 'Sigma Olomouc', 'Jablonec', 'Hradec Králové', 'Slovan Liberec', 'Pardubice', 'Fastav Zlin', 'Zbrojovka Brno', 'Teplice', 'Dukla Praha'].map(name => ({
    name,
    country: 'Czech Republic',
    league: '1. liga',
    isPriority: false,
    needs: []
  })),

  // Slovakia
  ...['Slovan Bratislava', 'Dunajska Streda', 'MSK Zilina', 'MFK Ruzomberok', 'Trencin', 'FC Vion', 'SKF Sered', 'MFK Zemplin Michalovce', 'Spartak Trnava', 'DAC'].map(name => ({
    name,
    country: 'Slovakia',
    league: '1. Fortuna liga',
    isPriority: false,
    needs: []
  })),

  // Romania
  ...['FCSB', 'CFR Cluj', 'Rapid Bucharest', 'Universitatea Craiova', 'Farul Constanta', 'Petrolul Ploiesti', 'Otelul Galati', 'Sepsi', 'FC Hermannstadt', 'UTA Arad', 'Dinamo Bucharest', 'FC Botosani', 'FC Arges', 'Gloria Buzau', 'U. Cluj'].map(name => ({
    name,
    country: 'Romania',
    league: 'Liga 1',
    isPriority: false,
    needs: []
  })),

  // Serbia
  ...['Crvena Zvezda', 'Partizan', 'FK Čukarički', 'TSC Backa Topola', 'Vojvodina', 'Radnički Niš', 'Spartak Subotica', 'FK Radnik', 'Javor', 'Vozdovac'].map(name => ({
    name,
    country: 'Serbia',
    league: 'Super liga',
    isPriority: false,
    needs: []
  })),

  // Croatia
  ...['Dinamo Zagreb', 'Hajduk Split', 'HNK Rijeka', 'NK Osijek', 'NK Lokomotiva', 'Slaven Belupo', 'NK Varaždin', 'HNK Gorica', 'NK Istra', 'Lokomotiv Zagreb'].map(name => ({
    name,
    country: 'Croatia',
    league: 'HNL',
    isPriority: false,
    needs: []
  })),

  // Slovenia
  ...['NK Maribor', 'NK Celje', 'Olimpija Ljubljana', 'NK Domžale', 'NK Koper', 'NK Bravo', 'NS Mura', 'NK Krško', 'Aluminij', 'Kalcer Radomlje'].map(name => ({
    name,
    country: 'Slovenia',
    league: 'PrvaLiga',
    isPriority: false,
    needs: []
  })),

  // Hungary
  ...['Ferencváros', 'MOL Fehérvár', 'Debreceni VSC', 'Puskás Akadémia', 'MTK Budapest', 'Pécsi MFC', 'Kisvárda', 'Diosgyor', 'Budafoki', 'Ujpest', 'Haladas', 'Eto FC'].map(name => ({
    name,
    country: 'Hungary',
    league: 'OTP Bank Liga',
    isPriority: false,
    needs: []
  })),

  // Denmark
  ...['Copenhagen', 'Midtjylland', 'Brondby', 'Nordsjaelland', 'Silkeborg', 'Randers', 'Odense', 'AC Horsens', 'Viborg', 'Aarhus', 'Hb Köge', 'Vejle', 'Soenderjyske', 'Hillerod'].map(name => ({
    name,
    country: 'Denmark',
    league: 'Superliga',
    isPriority: false,
    needs: []
  })),

  // Sweden Allsvenskan
  ...['Malmö FF', 'AIK', 'IFK Göteborg', 'Hammarby', 'Djurgarden', 'Elfsborg', 'Hacken', 'Kalmar FF', 'Sirius', 'Örebro', 'Degerfors', 'Landskrona', 'Ifk Varnamo', 'Ostersund'].map(name => ({
    name,
    country: 'Sweden',
    league: 'Allsvenskan',
    isPriority: false,
    needs: []
  })),

  // Norway
  ...['Rosenborg', 'Bodo Glimt', 'Molde', 'Viking', 'Brann', 'Lillestrom', 'Hamarkameratene', 'Haugesund', 'Stromsgodset', 'Kristiansund', 'Tromso', 'Fredrikstad', 'Odd', 'Sandefjord', 'Sarpsborg', 'Sogndal', 'Stabaek'].map(name => ({
    name,
    country: 'Norway',
    league: 'Eliteserien',
    isPriority: false,
    needs: []
  })),

  // Finland
  ...['HJK Helsinki', 'FC Inter Turku', 'SJK', 'Ilves', 'KuPS', 'FC Lahti', 'Haka', 'AC Oulu', 'FC Honka', 'HIFK', 'Ifk Mariehamn'].map(name => ({
    name,
    country: 'Finland',
    league: 'Veikkausliiga',
    isPriority: false,
    needs: []
  })),

  // Israel
  ...['Maccabi Tel Aviv', 'Maccabi Haifa', 'Hapoel Tel Aviv', 'Hapoel Beer Sheva', 'Beitar Jerusalem', 'Hapoel Jerusalem', 'Bnei Yehuda', 'Maccabi Netanya', 'Hapoel Haifa', 'Hapoel Petah Tikva', 'Maccabi Petah Tikva', 'Hapoel Kfar Saba'].map(name => ({
    name,
    country: 'Israel',
    league: 'Israeli Premier League',
    isPriority: false,
    needs: []
  })),

  // Argentina
  ...['River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo', 'Estudiantes', 'Atletico Tucuman', 'Talleres', 'Lanus', 'Newells', 'Defensa y Justicia', 'Godoy Cruz', 'Banfield', 'Huracan', 'Belgrano', 'Colon', 'Gimnasia La Plata', 'Aldosivi', 'Velez Sarfield', 'Central Córdoba'].map(name => ({
    name,
    country: 'Argentina',
    league: 'Primera División',
    isPriority: false,
    needs: []
  })),

  // Brazil
  ...['Flamengo', 'Palmeiras', 'Atletico Mineiro', 'Fluminense', 'Corinthians', 'Internacional', 'Gremio', 'Sao Paulo', 'Botafogo', 'Santos', 'America Mineiro', 'Bahia', 'Bragantino', 'Athletico Paranaense', 'Cruzeiro', 'Cuiaba', 'Fortaleza', 'Goias', 'Coritiba', 'Vasco da Gama'].map(name => ({
    name,
    country: 'Brazil',
    league: 'Série A',
    isPriority: false,
    needs: []
  })),

  // Mexico Liga MX
  ...['America', 'Guadalajara', 'Cruz Azul', 'Pumas', 'Monterrey', 'Tigres', 'Atlas', 'Santos Laguna', 'Leon', 'Toluca', 'Atlético San Luis', 'Pachuca', 'Necaxa', 'Mazatlan', 'FC Juárez', 'Puebla', 'Xolos Tijuana', 'Cancun', 'Cimarrones'].map(name => ({
    name,
    country: 'Mexico',
    league: 'Liga MX',
    isPriority: false,
    needs: []
  })),

  // USA MLS
  ...['Atlanta United', 'Austin FC', 'Charlotte FC', 'Chicago Fire', 'Colorado Rapids', 'Columbus Crew', 'DC United', 'FC Cincinnati', 'FC Dallas', 'Houston Dynamo', 'Inter Miami', 'Kansas City', 'LA Galaxy', 'LAFC', 'Minnesota United', 'Nashville SC', 'New England Revolution', 'New York City FC', 'New York Red Bulls', 'Orlando City', 'Philadelphia Union', 'Portland Timbers', 'Real Salt Lake', 'San Jose Earthquakes', 'Seattle Sounders', 'Sporting Kansas City', 'St Louis City', 'Toronto FC', 'Vancouver Whitecaps', 'CF Montreal'].map(name => ({
    name,
    country: 'USA',
    league: 'MLS',
    isPriority: false,
    needs: []
  })),

  // Colombia
  ...['Atletico Nacional', 'Junior', 'Millonarios', 'America Cali', 'Deportivo Cali', 'Tolima', 'Once Caldas', 'Envigado', 'La Equidad', 'Deportivo Pasto', 'Pereira', 'Aguilas Doradas'].map(name => ({
    name,
    country: 'Colombia',
    league: 'Liga BetPlay',
    isPriority: false,
    needs: []
  })),

  // Chile
  ...['Colo Colo', 'Universidad de Chile', 'Universidad Católica', 'Huachipato', 'Palestino', 'Cobresal', 'Magallanes', 'Audax Italiano', 'Everton Viña', 'O\'Higgins', 'Unión Española', 'La Serena', 'Santiago Wanderers', 'Curico', 'Cobresal'].map(name => ({
    name,
    country: 'Chile',
    league: 'Primera División',
    isPriority: false,
    needs: []
  })),

  // Peru
  ...['Alianza Lima', 'Universitario', 'Sporting Cristal', 'Melgar', 'Cesar Vallejo', 'Ayacucho FC', 'Cusco FC', 'San Martin', 'Sport Boys'].map(name => ({
    name,
    country: 'Peru',
    league: 'Liga 1',
    isPriority: false,
    needs: []
  })),

  // Ecuador
  ...['Barcelona SC', 'Emelec', 'Liga de Quito', 'Independiente del Valle', 'Aucas', 'Guayaquil City', 'Mushuc Runa', 'Técnico Universitario', 'Delfín'].map(name => ({
    name,
    country: 'Ecuador',
    league: 'LigaPro',
    isPriority: false,
    needs: []
  })),

  // Uruguay
  ...['Nacional', 'Peñarol', 'Defensor Sporting', 'Danubio', 'Boston River', 'Montevideo City Torque', 'Liverpool Montevideo', 'Rampla Juniors', 'Progreso', 'Rentistas', 'Albion'].map(name => ({
    name,
    country: 'Uruguay',
    league: 'Primera División',
    isPriority: false,
    needs: []
  })),

  // Russia
  ...['Zenit', 'CSKA Moscow', 'Spartak Moscow', 'Dynamo Moscow', 'Krasnodar', 'Lokomotiv Moscow', 'Rostov', 'Rubin Kazan', 'Khimki', 'Orenburg'].map(name => ({
    name,
    country: 'Russia',
    league: 'Premier League Russia',
    isPriority: false,
    needs: []
  })),

  // Ukraine
  ...['Dynamo Kiev', 'Shakhtar Donetsk', 'Vorskla Poltava', 'Dnipro-1', 'Zorya Luhansk', 'Kolos Kovalivka'].map(name => ({
    name,
    country: 'Ukraine',
    league: 'Ukrainian Premier League',
    isPriority: false,
    needs: []
  })),

  // Kazakhstan
  ...['FC Astana', 'Shakhter Karaganda', 'Kairat', 'Kaysar', 'Ordabasy', 'Tobol', 'Aktobe', 'Qyzyljar', 'Kaspiy'].map(name => ({
    name,
    country: 'Kazakhstan',
    league: 'Premier League Kazakhstan',
    isPriority: false,
    needs: []
  })),

  // India
  ...['ATK Mohun Bagan', 'Bengaluru FC', 'Chennaiyin FC', 'East Bengal', 'Goa FC', 'Hyderabad FC', 'Jamshedpur FC', 'Kerala Blasters', 'Mumbai City', 'NorthEast United', 'Odisha FC'].map(name => ({
    name,
    country: 'India',
    league: 'Indian Super League',
    isPriority: false,
    needs: []
  }))
];

async function migrateClubs() {
  console.log('Starting clubs migration...\n');

  try {
    // Step 1: Fetch all existing clubs
    console.log('Step 1: Fetching existing clubs from database...');
    const { data: existingClubs, error: fetchError } = await supabase
      .from('clubs')
      .select('name, id, country');

    if (fetchError) throw fetchError;

    console.log(`Found ${existingClubs.length} existing clubs\n`);

    // Build a Set of existing club names (lowercased) for fast lookup
    const existingClubNames = new Set(
      existingClubs.map(club => club.name.toLowerCase())
    );

    // Step 2: Fix Scottish clubs with wrong country assignment
    console.log('Step 2: Fixing wrongly-assigned Scottish clubs...');
    const scottishClubsLower = SCOTTISH_CLUBS.map(name => name.toLowerCase());
    const clubsToFix = existingClubs.filter(
      club => scottishClubsLower.includes(club.name.toLowerCase()) && club.country !== 'Scotland'
    );

    if (clubsToFix.length > 0) {
      const { error: updateError } = await supabase
        .from('clubs')
        .update({ country: 'Scotland', league: 'Scottish Premiership' })
        .in('name', clubsToFix.map(c => c.name));

      if (updateError) throw updateError;
      console.log(`Fixed ${clubsToFix.length} Scottish clubs\n`);
    } else {
      console.log('No Scottish clubs need fixing\n');
    }

    // Step 3: Delete garbage entries
    console.log('Step 3: Deleting garbage entries...');
    const { error: deleteError } = await supabase
      .from('clubs')
      .delete()
      .in('name', GARBAGE_ENTRIES);

    if (deleteError && deleteError.code !== 'PGRST116') {
      // PGRST116 is "no rows deleted" which is fine
      throw deleteError;
    }
    console.log(`Deleted garbage entries\n`);

    // Step 4: Insert new clubs (skip if already exists)
    console.log('Step 4: Inserting comprehensive club list...');
    let insertCount = 0;
    let skipCount = 0;
    const clubsToInsert = [];

    for (const club of CLUBS_TO_INSERT) {
      if (!existingClubNames.has(club.name.toLowerCase())) {
        clubsToInsert.push(club);
        insertCount++;
      } else {
        skipCount++;
      }
    }

    if (clubsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('clubs')
        .insert(clubsToInsert);

      if (insertError) throw insertError;
      console.log(`Inserted ${insertCount} new clubs`);
    } else {
      console.log('All clubs already exist');
    }
    console.log(`Skipped ${skipCount} clubs (already in database)\n`);

    // Summary
    console.log('=== MIGRATION SUMMARY ===');
    console.log(`Scottish clubs fixed: ${clubsToFix.length}`);
    console.log(`Garbage entries deleted: ${clubsToFix.length ? 'Yes' : 'None found'}`);
    console.log(`New clubs inserted: ${insertCount}`);
    console.log(`Clubs skipped (already existed): ${skipCount}`);
    console.log(`Total clubs in list: ${CLUBS_TO_INSERT.length}`);
    console.log('\nMigration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrateClubs();
