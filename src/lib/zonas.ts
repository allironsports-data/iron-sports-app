// ── Zonas geográficas de los clubes ──────────────────────────────────
// Sirve para filtrar los campogramas de Captación por zona: «enséñame solo
// los extremos de la Comunidad Valenciana», «¿a quién tenemos en Andalucía?».
//
// El equipo de un jugador es texto libre («Villarreal Juv C», «Castellón B»),
// así que primero se recorta a su club base y luego se busca la zona.
//
// Si un club no está en la tabla, cae en «Sin zona» y sigue apareciendo en el
// filtro: nadie desaparece por no estar clasificado.

export const ZONAS = [
  'Comunidad Valenciana',
  'Catalunya, Aragón y Baleares',
  'Madrid',
  'Murcia, Almería y Castilla-La Mancha',
  'Resto de Andalucía',
  'Asturias, Galicia, León, Cantabria y Euskadi',
  'Castilla y León, Navarra y La Rioja',
  'Canarias',
  'Extremadura',
  'Extranjero',
] as const

export type Zona = typeof ZONAS[number]

/** Etiquetas cortas para que quepan en los botones del filtro */
export const ZONA_CORTA: Record<Zona, string> = {
  'Comunidad Valenciana': 'C. Valenciana',
  'Catalunya, Aragón y Baleares': 'Cat/Ara/Bal',
  'Madrid': 'Madrid',
  'Murcia, Almería y Castilla-La Mancha': 'Mur/Alm/CLM',
  'Resto de Andalucía': 'Andalucía',
  'Asturias, Galicia, León, Cantabria y Euskadi': 'Norte',
  'Castilla y León, Navarra y La Rioja': 'CyL/Nav/Rioja',
  'Canarias': 'Canarias',
  'Extremadura': 'Extremadura',
  'Extranjero': 'Extranjero',
}

const norm = (s: string) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Sufijos de filial y categoría: «Villarreal Juv C» → «Villarreal»
const SUFIJOS = /\s+(b|c|d|juv|juvenil|cad|cadete|inf|infantil|dh|ln|cjuv|a|femenino|fem|castilla|mestalla)$/

/**
 * Clave para comparar equipos escritos de formas distintas.
 * «Castellón Juv A», «Castellon Juv a» y «Castellon Juvenil A» son el MISMO
 * equipo: sin esto, la ficha del equipo no encontraba sus propios partidos,
 * porque los partidos guardan el nombre como lo escribió cada scout.
 * Ojo: mantiene el sufijo, así que «Castellón» y «Castellón Juv A» siguen
 * siendo equipos distintos, que es lo correcto.
 */
export function normEquipo(nombre?: string): string {
  const s = norm(nombre ?? '')
  if (!s) return ''
  return s
    .replace(/\b(juvenil|juv)\b/g, 'juv')
    .replace(/\b(cadete|cad)\b/g, 'cad')
    .replace(/\b(infantil|inf)\b/g, 'inf')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Club base de un equipo: quita filial y categoría */
export function clubBase(equipo?: string): string {
  let s = norm(equipo ?? '')
  if (!s) return ''
  let prev = ''
  while (prev !== s) { prev = s; s = s.replace(SUFIJOS, '').trim() }
  return s
}

// ── Tabla club → zona ────────────────────────────────────────────────
// Las claves van ya normalizadas (minúsculas y sin acentos).
const POR_ZONA: Record<Zona, string[]> = {
  'Comunidad Valenciana': [
    'valencia', 'valencia fund', 'ida valencia', 'ida valencia white', 'levante', 'villarreal',
    'villarreal roda', 'roda', 'villarrea cad roda', 'castellon', 'elche', 'celtic elche',
    'hercules', 'eldense', 'eldensw', 'elda', 'torrent', 'patacona', 'alboraya', 'alcoyano',
    'alzira', 'kelme', 'torrellano', 'moncadense', 'intercity', 'orihuela', 'la nucia',
    'torre levante', 'jove espanol', 'quart', 'rumbo', 'el rumbo', 'primer toque', 'historics', 'ud vall d uxo', 'ud vall d uixo', 'saguntino',
    'almassera', 'racing algemesi', 'nou jove',
  ],
  'Catalunya, Aragón y Baleares': [
    'barcelona', 'fc barcelona', 'espanyol', 'girona', 'damm', 'nastic', 'gimnastic', 'cornella',
    'olot', 'terrassa', 'sabadell', 'europa', 'sant andreu', 'badalona', 'badalona futur',
    'fundacio badalona', 'peralada', 'atletic lleida', 'lleida', 'segre', 'atletic segre',
    'hospitalet', 'grama', 'manresa', 'g manresa', 'granollers', 'sant cugat', 'reus',
    'racing sarria', 'aqua hotel', 'andorra',
    'zaragoza', 'racing zaragoza', 'huesca', 'barbastro', 'teruel', 'ejea', 'utebo', 'tarazona',
    'penya arrabal',
    'mallorca', 'ibiza', 'sd ibiza', 'ibiza islas pitiusas', 'atletico baleares', 'balears',
    'poblense', 'manacor', 'menorca', 'san francisco', 'porreres', 'andratx', 'constancia', 'penya bons aires',
  ],
  'Madrid': [
    'real madrid', 'atletico madrid', 'getafe', 'leganes', 'rayo vallecano', 'rayo vall', 'rayo',
    'alcorcon', 'rayo majadahonda', 'fuenlabrada', 'mostoles', 'adarve', 'las rozas',
    'navalcarnero', 'colonia moscardo', 'moscardo', 'sanse', 'alcala', 'rayo alcobendas',
  ],
  'Murcia, Almería y Castilla-La Mancha': [
    'murcia', 'ucam murcia', 'murcia promises', 'cartagena', 'yeclano', 'aguilas', 'lorca',
    'cieza', 'pinatar', 'deportiva minera',
    'almeria', 'la canada',
    'albacete', 'atletico albacete', 'guadalajara', 'talavera', 'talavera de la reina', 'toledo',
    'illescas', 'conquense', 'puertollano', 'flecha negra',
  ],
  'Resto de Andalucía': [
    'betis', 'sevilla', 'cadiz', 'granada', 'malaga', 'cordoba', 'recreativo',
    'recreativo huelva', 'linense', 'atletico sanluqueno', 'sanluqueno', 'algeciras', 'marbella',
    'antequera', 'juventud torremolinos', 'torremolinos', 'xerez', 'xerez cd', 'linares', 'jaen',
    'antoniano', 'coria', 'san fernando', 'calavera', 'puente genil', 'pozoblanco', 'estepona', 'alhaurino',
    'puerto malagueno', 'cd san roque', 'ceuta', 'melilla',
  ],
  'Asturias, Galicia, León, Cantabria y Euskadi': [
    'deportivo', 'celta', 'sporting', 'sporting gijon', 'oviedo', 'racing santander',
    'racing de santander', 'racing', 'racing club', 'bansander',
    'real sociedad', 'athletic club', 'eibar', 'alaves', 'amorebieta', 'barakaldo',
    'sestao river', 'gernika', 'real union', 'arenas',
    'laredo', 'gimnastica torrelavega', 'g torrelavega', 'escobedo', 'samano',
    'lugo', 'racing ferrol', 'coruxo', 'ud coruxo', 'compostela', 'pontevedra', 'arenteiro',
    'bergantinos', 'arosa', 'ourense', 'ud ourense', 'mosquito',
    'marino luanco', 'langreo', 'llanera', 'real aviles', 'lealtad', 'roces', 'san felix',
    'ponferradina', 'cultural leonesa', 'c leonesa', 'astorga',
  ],
  'Castilla y León, Navarra y La Rioja': [
    'valladolid', 'burgos', 'mirandes', 'salamanca', 'unionistas', 'guijuelo', 'zamora',
    'numancia', 'real avila', 'g segoviana',
    'osasuna', 'osasuna ca', 'izarra', 'tudelano', 'subiza',
    'ud logrones', 'logrones', 'calahorra', 'alfaro', 'naxara', 'anguiano',
  ],
  'Canarias': [
    'las palmas', 'tenerife', 'mensajero', 'herbania', 'union sur yaiza', 'atletico paso',
    'a paso', 'juventud laguna', 'ud ibarra', 'san isidro', 'marino',
  ],
  'Extremadura': [
    'merida', 'cacereno', 'cd badajoz', 'villanovense', 'moralo',
  ],
  'Extranjero': [
    'bayern', 'fiorentina', 'juventus', 'como', 'inter', 'napoli', 'parma', 'lecce', 'udinese',
    'atalanta', 'venezia', 'wolverhampton', 'bournemouth', 'arsenal', 'chelsea', 'liverpool',
    'manchester city', 'ajax', 'aajax', 'psv', 'feyenoord', 'anderlecht', 'brujas', 'brugge',
    'benfica', 'porto', 'braga', 'sporting cp', 'psg', 'paris', 'olympique lyon', 'rennes',
    'laussane sport', 'midtjylland', 'werder bremen', 'dinamo zagreb', 'olimpiakos', 'fenerbahce',
    'al ahly', 'al nassr fc u21', 'qatar sc', 'orlando city', 'columbus crew', 'new england',
    'fluminense fc u20', 'arouca', 'maritimo', 'paradou ac', 'dakar fc', 'dakar sacre couer',
    'deux plateux', 'williamsville ac', 'great olympics accra', 'asante kotoko',
    'rising star of africa', 'gambia armed forces fc', 'wits university', 'asse lumiere',
    'as boyom s', 'chinese football boys', 'leader foot', 'talent d or', 'basga jo', 'raqui',
    'inter sj',
  ],
}

const ZONA_POR_CLUB: Record<string, Zona> = (() => {
  const m: Record<string, Zona> = {}
  for (const zona of ZONAS) for (const club of POR_ZONA[zona]) m[club] = zona
  return m
})()

/**
 * Zona de un equipo, o null si ese club todavía no está clasificado.
 * `correcciones` son las zonas puestas a mano desde la app (tabla
 * scouting_club_zonas), y mandan sobre la tabla de aquí arriba.
 */
export function zonaDe(equipo?: string, correcciones?: Record<string, Zona>): Zona | null {
  const base = clubBase(equipo)
  if (!base) return null
  return correcciones?.[base] ?? ZONA_POR_CLUB[base] ?? null
}

/** ¿Esta zona es una de las válidas? (para leer sin miedo lo que venga de la BBDD) */
export function esZona(z?: string | null): z is Zona {
  return !!z && (ZONAS as readonly string[]).includes(z)
}

export const SIN_ZONA = 'Sin zona' as const
