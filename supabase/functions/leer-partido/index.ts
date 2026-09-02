// ══════════════════════════════════════════════════════════════════════
//  Función «leer-partido» · Supabase Edge Function
//
//  PARA QUÉ: la app no puede leer Sofascore/Flashscore/BeSoccer desde el
//  navegador (esas webs lo bloquean). Esta función vive en el servidor de
//  Supabase, descarga el partido y devuelve la alineación en JSON, que la
//  app ya sabe cruzar con la BBDD.
//
//  CÓMO SE INSTALA (todo desde el panel de Supabase, sin instalar nada):
//    1. supabase.com → tu proyecto → Edge Functions → Deploy a new function
//    2. Nombre: leer-partido
//    3. Pega este archivo entero y pulsa Deploy
//    4. En Settings de la función, deja «Verify JWT» ACTIVADO: así solo
//       responde a quien tenga sesión en la app.
//
//  QUÉ ADMITE:
//    · Enlace de Sofascore (…/match/…/#id:12345678 o /event/12345678)
//      → usa su API pública en JSON: es la vía fiable.
//    · Cualquier otro enlace → descarga el HTML y saca los nombres que
//      encuentra. Funciona a veces; si no, se pega el texto a mano.
//
//  AVISO HONESTO: la API de Sofascore no es oficial. Puede cambiar o dejar
//  de responder cualquier día, y conviene revisar sus condiciones de uso.
//  Si esto se vuelve crítico, lo suyo es contratar la API de BeSoccer.
// ══════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

interface Jugador { nombre: string; dorsal?: number; posicion?: string; titular: boolean }
interface Respuesta {
  fuente: string
  local?: string
  visitante?: string
  fecha?: string
  competicion?: string
  jugadoresLocal: Jugador[]
  jugadoresVisitante: Jugador[]
  aviso?: string
}

// Solo descargamos webs de resultados conocidas. Sin esta lista la función
// sería un proxy abierto (SSRF): cualquiera con sesión podría hacerle pedir
// URLs internas o arbitrarias desde el servidor de Supabase.
const HOSTS_PERMITIDOS = [
  'sofascore.com',
  'flashscore.com',
  'flashscore.es',
  'besoccer.com',
  'lapreferente.com',
  'futbol-regional.es',
]

/** true si la URL es http(s) y su host es (o es subdominio de) uno permitido */
function urlPermitida(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return HOSTS_PERMITIDOS.some((h) => host === h || host.endsWith('.' + h))
}

/** Saca el id de evento de una URL de Sofascore */
function idSofascore(url: string): string | null {
  const m = url.match(/#id[:=](\d+)/) ?? url.match(/\/event\/(\d+)/) ?? url.match(/[?&]id=(\d+)/)
  return m ? m[1] : null
}

async function leerSofascore(id: string): Promise<Respuesta> {
  const cab = { 'User-Agent': UA, 'Accept': 'application/json' }
  const [evRes, alRes] = await Promise.all([
    fetch(`https://api.sofascore.com/api/v1/event/${id}`, { headers: cab }),
    fetch(`https://api.sofascore.com/api/v1/event/${id}/lineups`, { headers: cab }),
  ])
  if (!evRes.ok) throw new Error(`Sofascore no devuelve el partido (${evRes.status})`)

  const ev = await evRes.json()
  const info = ev?.event ?? {}
  const base: Respuesta = {
    fuente: 'sofascore',
    local: info?.homeTeam?.name,
    visitante: info?.awayTeam?.name,
    competicion: info?.tournament?.name,
    fecha: info?.startTimestamp
      ? new Date(info.startTimestamp * 1000).toISOString().slice(0, 10)
      : undefined,
    jugadoresLocal: [],
    jugadoresVisitante: [],
  }

  if (!alRes.ok) {
    base.aviso = 'El partido existe pero todavía no hay alineaciones publicadas.'
    return base
  }
  const al = await alRes.json()
  const mapear = (lado: { players?: unknown[] }): Jugador[] =>
    (lado?.players ?? []).map((x) => {
      const p = x as { player?: { name?: string }; shirtNumber?: number; position?: string; substitute?: boolean }
      return {
        nombre: p?.player?.name ?? '',
        dorsal: p?.shirtNumber,
        posicion: p?.position,
        titular: !p?.substitute,
      }
    }).filter((j: Jugador) => j.nombre)

  base.jugadoresLocal = mapear(al?.home ?? {})
  base.jugadoresVisitante = mapear(al?.away ?? {})
  return base
}

/** Último recurso: descargar la página y sacar lo que se pueda del HTML */
async function leerHtml(url: string): Promise<Respuesta> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } })
  if (!res.ok) throw new Error(`La web ha respondido ${res.status}`)
  const html = await res.text()

  // Muchas webs traen los datos en un JSON incrustado
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)
  let local: string | undefined
  let visitante: string | undefined
  if (ld) {
    try {
      const j = JSON.parse(ld[1])
      local = j?.homeTeam?.name ?? j?.competitor?.[0]?.name
      visitante = j?.awayTeam?.name ?? j?.competitor?.[1]?.name
    } catch { /* ignorar */ }
  }

  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{2,}/g, '\n')

  return {
    fuente: 'html',
    local,
    visitante,
    jugadoresLocal: [],
    jugadoresVisitante: [],
    aviso: 'De esta web solo puedo devolver el texto en bruto; pégalo en «Pegar alineación».',
    ...(texto ? { textoBruto: texto.slice(0, 20000) } as Partial<Respuesta> : {}),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta el enlace del partido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (!urlPermitida(url)) {
      return new Response(JSON.stringify({ error: 'Solo se admiten enlaces http(s) de: ' + HOSTS_PERMITIDOS.join(', ') }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const id = idSofascore(url)
    const data = id ? await leerSofascore(id) : await leerHtml(url)
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'No se ha podido leer el partido' }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
