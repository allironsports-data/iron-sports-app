// ══════════════════════════════════════════════════════════════════════
//  Función «resumen-scouting» · Supabase Edge Function
//
//  PARA QUÉ: al exportar el informe de un jugador de Captación, además de
//  listar cada observación de scouting suelta, se pide a un LLM (Claude)
//  que las lea todas juntas y escriba un párrafo de resumen ejecutivo —
//  la app no puede llamar a la API de Anthropic directamente desde el
//  navegador porque expondría la clave a quien abra las devtools.
//
//  QUÉ NO HACE: no manda la valoración interna (Llamar/Seguir/Descartar)
//  ni quién escribió cada informe — el cliente ya se encarga de no
//  incluirlo en lo que envía aquí (ver src/lib/informeScouting.ts), pero
//  esta función tampoco lo aceptaría en el prompt aunque llegase.
//
//  CÓMO SE INSTALA:
//    1. supabase.com → tu proyecto → Edge Functions → Deploy a new function
//    2. Nombre: resumen-scouting
//    3. Pega este archivo entero y pulsa Deploy
//    4. Deja «Verify JWT» ACTIVADO: solo responde a quien tenga sesión en la app
//    5. Secreto:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//       (clave nueva en console.anthropic.com → API Keys; opcionalmente
//       también ANTHROPIC_MODEL si quieres fijar un modelo concreto,
//       por defecto usa uno económico de la familia Haiku)
//
//  Si la clave no está configurada, o Anthropic falla, la función devuelve
//  un error controlado — el cliente entonces exporta el informe SIN el
//  resumen en vez de bloquear la descarga.
// ══════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
// Modelo económico y rápido, pensado justo para resúmenes cortos como este.
// Configurable por si Anthropic renombra o retira este modelo más adelante.
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5'

interface Informe {
  titulo?: string
  texto: string
  fecha?: string
  partido?: string
}

interface Peticion {
  jugador: { nombre: string; posicion?: string; equipo?: string }
  informes: Informe[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'Falta configurar el secreto ANTHROPIC_API_KEY en esta función' }, 500)
  }

  let body: Peticion
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }

  const informes = (body?.informes ?? []).filter(i => i && i.texto?.trim())
  if (informes.length === 0) {
    return json({ error: 'No hay informes que resumir' }, 400)
  }
  // Tope de seguridad: no hace falta mandar un histórico infinito al LLM.
  const MAX_INFORMES = 40
  const usados = informes.slice(0, MAX_INFORMES)

  const nombre = body.jugador?.nombre ?? 'el jugador'
  const cabecera = [
    `Jugador: ${nombre}`,
    body.jugador?.posicion ? `Posición: ${body.jugador.posicion}` : '',
    body.jugador?.equipo ? `Equipo actual: ${body.jugador.equipo}` : '',
  ].filter(Boolean).join('\n')

  const cuerpo = usados.map((i, idx) => {
    const cab = [i.fecha, i.partido].filter(Boolean).join(' · ')
    return `Observación ${idx + 1}${cab ? ` (${cab})` : ''}${i.titulo ? ` — ${i.titulo}` : ''}:\n${i.texto.trim()}`
  }).join('\n\n')

  const prompt = `Eres un analista de scouting de fútbol. A continuación tienes varias observaciones sueltas, escritas por distintos ojeadores en distintos partidos, sobre el mismo jugador.

${cabecera}

${cuerpo}

Escribe un resumen ejecutivo de ese jugador en español, en un único párrafo de entre 80 y 150 palabras, en tono profesional y objetivo, pensado para un informe que se puede compartir con un club o un representante. Destaca los puntos que se repiten entre observaciones (fortalezas, debilidades, evolución en el tiempo si la hay) y no inventes datos que no aparezcan en el texto. No incluyas ninguna recomendación de fichar/seguir/descartar, ni valoraciones sobre si a All Iron Sports le interesa o no representarlo — limítate a describir el nivel de juego observado. No repitas literalmente frases enteras de las observaciones; sintetiza. Devuelve solo el párrafo, sin título ni comillas.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error('Anthropic error', res.status, detalle)
      return json({ error: `El modelo no ha podido generar el resumen (${res.status})` }, 502)
    }
    const data = await res.json()
    const resumen = (data?.content ?? [])
      .filter((b: { type?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b?.text ?? '')
      .join('')
      .trim()
    if (!resumen) return json({ error: 'El modelo no ha devuelto texto' }, 502)
    return json({ resumen })
  } catch (e) {
    console.error('resumen-scouting fetch failed', e)
    return json({ error: 'No se ha podido contactar con el modelo' }, 502)
  }
})
