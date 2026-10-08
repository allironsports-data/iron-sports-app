import { supabase } from './supabase'
import { dedupePorId } from './coleccion'
import type { Player, Task, TaskComment, PerformanceNote, ClubInterest, PlayerLink, MatchReport, VideoSession, Club, DistributionEntry, ClubNegotiation, ScoutingPlayer, ScoutingReport, ScoutingInfo, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchOurPlayer, ScoutingMatchScout, Ofrecimiento, ClubLog, PlayerMeeting, PlayerActivity, MemberStatus, Postpartido, FirmasEntry, BoulemaPlayer, AgendaEvento } from '../types'

// ── helpers ──────────────────────────────────────────────────

function dbToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    name: row.name as string,
    birthDate: row.birth_date as string,
    positions: (row.positions as string[]) ?? [],
    nationality: (row.nationality as string) ?? '',
    photo: (row.photo_url as string) ?? '',
    clubs: (row.clubs as Player['clubs']) ?? [],
    partner: row.partner as string | undefined,
    managedBy: (row.managed_by as string[]) ?? [],
    representationContract: (row.representation_contract as Player['representationContract']) ?? { start: '', end: '' },
    clubContract: (row.club_contract as Player['clubContract']) ?? { endDate: '' },
    contractHistory: (row.contract_history as Player['contractHistory']) ?? [],
    foot: (row.foot as Player['foot']) ?? undefined,
    clubInterests: (row.club_interests as ClubInterest[]) ?? [],
    matchReports: (row.match_reports as MatchReport[]) ?? [],
    videoSessions: (row.video_sessions as VideoSession[]) ?? [],
    transfermarktUrl: (row.transfermarkt_url as string) ?? undefined,
    links: (row.links as PlayerLink[]) ?? [],
    hiddenFromManagement: (row.hidden_from_management as boolean) ?? false,
    partnerOrigen: (row.partner_origen as string) || undefined,
    sharedWithPartners: (row.shared_with_partners as boolean) ?? false,
    // undefined si la migración de estado no se ha ejecutado aún; la app lo
    // trata como «activo» (ver lib/estadoJugador.ts)
    estado: (row.estado as Player['estado']) ?? undefined,
    prioridad: (row.prioridad as Player['prioridad']) || undefined,
    // undefined si la migración de updated_at no se ha ejecutado aún
    updatedAt: (row.updated_at as string) ?? undefined,
    performance: [],
    info: (() => {
      const raw = (row.info as Record<string, unknown>) ?? {}
      return {
        family: (raw.family as string) ?? '',
        personality: (raw.personality as string) ?? '',
        phone: (raw.phone as string) ?? '',
        passportUrl: (raw.passportUrl as string) ?? '',
      }
    })(),
  }
}

function playerToDb(p: Partial<Player>) {
  return {
    name: p.name,
    birth_date: p.birthDate,
    positions: p.positions,
    nationality: p.nationality,
    photo_url: p.photo,
    clubs: p.clubs,
    partner: p.partner,
    managed_by: p.managedBy,
    representation_contract: p.representationContract,
    club_contract: p.clubContract,
    contract_history: p.contractHistory,
    foot: p.foot ?? null,
    club_interests: p.clubInterests,
    match_reports: p.matchReports ?? [],
    video_sessions: p.videoSessions ?? [],
    transfermarkt_url: p.transfermarktUrl ?? null,
    links: p.links ?? [],
    info: p.info,
    hidden_from_management: p.hiddenFromManagement ?? false,
    estado: p.estado ?? 'activo',
    prioridad: p.prioridad ?? null,
    partner_origen: p.partnerOrigen ?? null,
    shared_with_partners: p.sharedWithPartners ?? false,
  }
}

// ── players: columnas opcionales hasta migrar ────────────────────────
// playerToDb escribe todas las columnas, así que si una migración no se ha
// ejecutado el guardado entero fallaría por una columna nueva. En vez de
// bloquear la app: al primer error de columna inexistente que hable de una
// de estas, se apaga esa columna y se reintenta sin ella. El resto de la
// ficha se guarda igual.
//   · estado                                → migration_player_estado.sql
//   · partner_origen, shared_with_partners  → migration_partners.sql
//   · prioridad                             → migration_player_prioridad.sql
const COLUMNAS_OPCIONALES_PLAYER = ['estado', 'partner_origen', 'shared_with_partners', 'prioridad'] as const
const playersSinColumna = new Set<string>()

/** Apaga la columna opcional de la que se queja el error. false si el error no va de eso. */
function apagarColumnaPlayer(error: unknown): boolean {
  if (!esColumnaInexistente(error)) return false
  const msg = (error as { message?: string } | null)?.message ?? ''
  const col = COLUMNAS_OPCIONALES_PLAYER.find(c => !playersSinColumna.has(c) && msg.includes(c))
  if (!col) return false
  playersSinColumna.add(col)
  console.warn(`[db] players no tiene columna ${col}: se guarda sin ella (falta ejecutar su migración)`)
  return true
}

/** La fila de players lista para escribir, solo con las columnas opcionales que la base admite */
function filaPlayer(p: Player): Record<string, unknown> {
  const fila = playerToDb(p) as Record<string, unknown>
  for (const c of playersSinColumna) delete fila[c]
  return fila
}

// ── PASAPORTES Y CONTRATOS ───────────────────────────────────
//
// Antes esto guardaba en la base de datos un enlace firmado de 10 AÑOS.
// Un pasaporte de un chaval de 16 con una URL que abre sin login hasta
// 2036, metida en un campo de texto que se copia y se reenvía. Y encima
// no había forma de anularla.
//
// Ahora se guarda la RUTA dentro del bucket privado y el enlace se firma
// en el momento de abrir el documento, con 5 minutos de vida. Si alguien
// reenvía la URL, a los 5 minutos ya no abre nada.
const DOC_URL_TTL = 5 * 60 // 5 minutos

async function subirDocumento(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
  if (error) throw error
  return path // ← la ruta, no la URL
}

/**
 * Saca la ruta dentro del bucket. Acepta rutas nuevas
 * («passports/xxx.pdf») y los enlaces antiguos de 10 años que siguen
 * guardados en la base de datos, para poder volver a firmarlos cortos.
 */
export function rutaDeDocumento(rutaOEnlace: string): string {
  const v = (rutaOEnlace ?? '').trim()
  if (!/^https?:\/\//i.test(v)) return v.replace(/^\/+/, '')
  try {
    const u = new URL(v)
    // …/storage/v1/object/sign/attachments/passports/xxx.pdf?token=…
    const m = u.pathname.match(/\/object\/(?:sign|public|authenticated)\/attachments\/(.+)$/)
    if (m) return decodeURIComponent(m[1])
  } catch { /* no era una URL válida: se devuelve tal cual */ }
  return v
}

/** Enlace temporal (5 min) para abrir un pasaporte o un contrato. */
export async function urlDocumento(rutaOEnlace: string): Promise<string> {
  const ruta = rutaDeDocumento(rutaOEnlace)
  if (!ruta) throw new Error('Documento sin ruta')
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(ruta, DOC_URL_TTL)
  if (data?.signedUrl) return data.signedUrl
  // Enlace antiguo que no sabemos convertir: al menos que se pueda abrir.
  if (/^https?:\/\//i.test(rutaOEnlace)) return rutaOEnlace
  throw error ?? new Error('No se pudo generar el enlace del documento')
}

export async function uploadPassport(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  return subirDocumento(`passports/${playerId}.${ext}`, file)
}

export async function uploadContractPdf(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  return subirDocumento(`contracts/${playerId}_${Date.now()}.${ext}`, file)
}

// Un fallo a media carga dejaba la lista corta sin que nadie se enterase:
// ahora al menos queda en consola con cuántas filas se habían leído.
function logFetchError(tabla: string, error: unknown, leidas: number) {
  console.error(`[db] Fallo leyendo ${tabla} (se habían leído ${leidas} filas):`, error)
}

// ── Guardar solo lo que ha cambiado ──────────────────────────────────
// Varias pantallas guardan «la ficha entera» a partir de la copia que
// tienen en memoria. Si mientras tanto otra persona cambió otro campo, ese
// guardado se lo llevaba por delante (activar el campograma de un jugador
// borraba la valoración que otro scout acababa de poner).
//
// Aquí se recuerda la última fila que se ha visto del servidor (al leer la
// tabla y con cada evento de realtime) y, al guardar, solo se mandan las
// columnas cuyo valor es distinto del de esa fila. Lo que el usuario no ha
// tocado no se escribe, así que no puede pisar nada.
const filasVistas = new Map<string, Map<string, Record<string, unknown>>>()

function recordarFila(tabla: string, row: Record<string, unknown>): void {
  if (typeof row.id !== 'string') return
  let m = filasVistas.get(tabla)
  if (!m) { m = new Map(); filasVistas.set(tabla, m) }
  m.set(row.id, row)
}

const mismoValor = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** De `fila`, solo las columnas que difieren de la última versión vista. Sin versión vista: todas. */
export function soloCambios(tabla: string, id: string, fila: Record<string, unknown>): Record<string, unknown> {
  const vista = filasVistas.get(tabla)?.get(id)
  if (!vista) return fila
  const cambios: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fila)) if (!(k in vista) || !mismoValor(v, vista[k])) cambios[k] = v
  return cambios
}

/** UPDATE de solo lo cambiado; si no ha cambiado nada no se hace ninguna petición. */
async function actualizarSoloCambios(tabla: string, id: string, fila: Record<string, unknown>): Promise<void> {
  const cambios = soloCambios(tabla, id, fila)
  if (Object.keys(cambios).length === 0) return
  const { error } = await supabase.from(tabla).update(cambios).eq('id', id)
  if (error) throw error
  const vista = filasVistas.get(tabla)?.get(id)
  if (vista) recordarFila(tabla, { ...vista, ...cambios })
}

/** 42P01 = «relation does not exist»: la tabla aún no está migrada. */
function esTablaInexistente(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01'
}

// Para los fetchers de tablas opcionales: si la tabla no existe (42P01) el
// catch devuelve [] (la app funciona sin ella); cualquier otro fallo se
// propaga para que App.tsx avise de la carga incompleta en vez de mostrar
// una lista corta. leerTodo ya deja el fallo en consola.

// ⚠ Supabase corta en 1000 filas SIN avisar. Cualquier lectura de una tabla
// que pueda crecer tiene que ir paginada. Esto lo hace en una línea:
//
//   const filas = await leerTodo('postpartidos', (desde, hasta) =>
//     supabase.from('postpartidos').select('*').order('created_at').order('id').range(desde, hasta))
//
// `consulta` recibe el rango y devuelve la petición ya montada.
//
// ⚠⚠ Y OTRA COSA IGUAL DE IMPORTANTE: el .order() TIENE que acabar en una
// columna única (normalmente 'id'). Si ordenas solo por 'fecha', 'priority'
// o 'sort_pos' —que se repiten— Postgres NO garantiza el orden entre las
// filas empatadas: al pedir la página 2 puede repetir filas de la 1 y, lo
// que es peor, SALTARSE otras. Desaparecen sin error y sin avisar. Con
// sort_pos = 0 en toda la tabla esto no es teoría, pasa.
//
// ⚠⚠⚠ Y aun con orden estable: si alguien INSERTA o BORRA una fila entre la
// página 1 y la 12 (pasa a cada rato: cada evento realtime relanza la lectura
// en todos los navegadores), el offset se desplaza y una fila se repite o se
// salta. La repetida se quita al final (`dedupePorId`); la saltada la traerá
// el siguiente refetch. La solución de fondo sería paginar por cursor.
const PAGINA = 1000
// Tope de seguridad: 200 páginas = 200.000 filas. Si se llega ahí es que
// algo va mal (un bucle), no que haya tantos datos.
const MAX_PAGINAS = 200
// Páginas que se piden a la vez cuando no se conoce el total.
const PAGINAS_POR_RONDA = 4

// Las páginas se piden EN PARALELO: la 0 primero; si viene llena, las
// siguientes en rondas de 4 hasta que alguna llega corta. Con `contar`
// (un `select('*', { count: 'exact', head: true })`) se sabe el total y se
// lanzan todas las páginas restantes de golpe.
//
// ATAJO (lo que más acelera la carga): el navegador recuerda cuántas filas
// tenía cada tabla la última vez. Con ese dato se piden TODAS las páginas a
// la vez desde el primer momento, sin esperar ni a la página 0 ni al
// recuento (que en tablas grandes tarda casi un segundo él solo). Si la
// tabla ha crecido, la última página llega llena y se sigue por rondas; si
// ha menguado, las que sobran llegan vacías. El resultado es el mismo.
// Solo se guarda un número por tabla, ningún dato.
const CLAVE_FILAS = 'ais:filas:'
function filasRecordadas(tabla: string): number | null {
  try {
    const n = Number(localStorage.getItem(CLAVE_FILAS + tabla))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}
function recordarFilas(tabla: string, n: number) {
  try { localStorage.setItem(CLAVE_FILAS + tabla, String(n)) } catch { /* sin almacenamiento: no pasa nada */ }
}

export async function leerTodo<T>(
  tabla: string,
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opciones?: {
    contar?: () => PromiseLike<{ count: number | null; error: unknown }>
    /** false si la consulta va filtrada (el nº de filas de la tabla entera no sirve de pista) */
    recordar?: boolean
  },
): Promise<T[]> {
  // paginas[i] = filas de la página i (se rellena según van llegando; el
  // índice conserva el orden aunque lleguen desordenadas)
  const paginas: T[][] = []
  const leidas = () => paginas.reduce((n, p) => n + (p?.length ?? 0), 0)
  // Solo las lecturas de tabla entera (las que traen `contar`) usan el atajo
  const recordar = !!opciones?.contar && opciones.recordar !== false
  const terminar = () => {
    const filas = dedupePorId(paginas.flat() as { id?: unknown }[]) as T[]
    if (recordar) recordarFilas(tabla, filas.length)
    return filas
  }

  /** pide la página `i` y devuelve cuántas filas trajo */
  const pedir = async (i: number): Promise<number> => {
    const { data, error } = await consulta(i * PAGINA, i * PAGINA + PAGINA - 1)
    if (error) { logFetchError(tabla, error, leidas()); throw error }
    const pagina = data ?? []
    paginas[i] = pagina
    return pagina.length
  }

  let siguiente = 1
  let corta = false

  const previstas = recordar ? filasRecordadas(tabla) : null
  if (previstas !== null) {
    // Atajo: todas las páginas previstas de golpe, sin recuento (también en
    // las tablas pequeñas: el recuento es una consulta más que el servidor
    // tiene que atender, y al arrancar se lanzan decenas a la vez).
    const nPaginas = Math.min(Math.max(1, Math.ceil(previstas / PAGINA)), MAX_PAGINAS)
    const tamanos = await Promise.all(Array.from({ length: nPaginas }, (_, i) => pedir(i)))
    siguiente = nPaginas
    corta = tamanos.some(n => n < PAGINA)
  } else {
    // Página 0 (y el recuento, si lo hay) a la vez.
    const [n0, recuento] = await Promise.all([
      pedir(0),
      opciones?.contar ? opciones.contar() : Promise.resolve(null),
    ])
    if (n0 < PAGINA) return terminar()

    // Con el total conocido: todas las páginas que faltan de golpe.
    const total = recuento && !recuento.error && typeof recuento.count === 'number' ? recuento.count : null
    if (total !== null) {
      const nPaginas = Math.min(Math.ceil(total / PAGINA), MAX_PAGINAS)
      const indices: number[] = []
      for (let i = 1; i < nPaginas; i++) indices.push(i)
      const tamanos = await Promise.all(indices.map(pedir))
      siguiente = nPaginas
      // si la última llegó corta hemos acabado; si vino llena (han insertado
      // entre el recuento y la lectura) seguimos por rondas
      corta = tamanos.length === 0 || tamanos[tamanos.length - 1] < PAGINA
    }
  }

  // Sin total (o si ha crecido): rondas de PAGINAS_POR_RONDA en paralelo.
  while (!corta && siguiente < MAX_PAGINAS) {
    const indices: number[] = []
    for (let i = siguiente; i < Math.min(siguiente + PAGINAS_POR_RONDA, MAX_PAGINAS); i++) indices.push(i)
    const tamanos = await Promise.all(indices.map(pedir))
    siguiente += indices.length
    corta = tamanos.some(n => n < PAGINA)
  }

  if (!corta) logFetchError(tabla, new Error('demasiadas páginas'), leidas())
  return terminar()
}

// ── Conflictos al editar (dos personas sobre la misma ficha) ─────────
//
// Al guardar jugador/club/negociación mandamos el `updated_at` que teníamos
// al leer la fila y el UPDATE lleva `.eq('updated_at', visto)`: si otro lo
// ha cambiado entre medias, no coincide, no se actualiza nada y se lanza
// ConflictError con la fila que hay ahora en la base de datos. App.tsx la
// enseña y deja elegir: recargar (perder lo mío) o sobrescribir (reintentar
// con el updated_at nuevo).
// (campos declarados en el cuerpo: `erasableSyntaxOnly` no permite `public` en el constructor)
export class ConflictError extends Error {
  tabla: string
  /** la fila que hay ahora en la base de datos, ya mapeada (Player/Club/ClubNegotiation) */
  actual: unknown
  constructor(tabla: string, actual: unknown) {
    super('Otro usuario ha modificado esta ficha')
    this.name = 'ConflictError'
    this.tabla = tabla
    this.actual = actual
  }
}

/** 42703 = «column does not exist»: la migración de updated_at no se ha ejecutado aún. */
function esColumnaInexistente(error: unknown): boolean {
  // 42703 lo da Postgres; PGRST204 lo da PostgREST cuando la columna no está en su caché de esquema
  const code = (error as { code?: string } | null)?.code
  return code === '42703' || code === 'PGRST204'
}

const avisadoSinUpdatedAt = new Set<string>()

/**
 * UPDATE con control de versión por `updated_at`. Escribe siempre
 * `updated_at = ahora` y devuelve la fila guardada (mapeada).
 *
 * - `updatedAtVisto` vacío/undefined (datos antiguos, cargados antes de la
 *   migración): no se aplica el filtro; el guardado gana sin comprobar.
 * - Si la tabla todavía no tiene la columna (42703), se reintenta el update
 *   «a la antigua» para no dejar la app sin guardar hasta migrar.
 * - Si el UPDATE no toca ninguna fila: se lee la fila actual. Si existe →
 *   ConflictError; si no existe → error de «ya no existe».
 */
async function actualizarConControl<T>(
  tabla: string,
  id: string,
  fila: Record<string, unknown>,
  updatedAtVisto: string | undefined,
  mapear: (row: Record<string, unknown>) => T,
): Promise<T> {
  const payload = { ...fila, updated_at: new Date().toISOString() }
  let q = supabase.from(tabla).update(payload).eq('id', id)
  if (updatedAtVisto) q = q.eq('updated_at', updatedAtVisto)
  const { data, error } = await q.select().maybeSingle()

  if (error && esColumnaInexistente(error)) {
    if (!avisadoSinUpdatedAt.has(tabla)) {
      avisadoSinUpdatedAt.add(tabla)
      console.warn(`[db] ${tabla} no tiene columna updated_at: guardando sin control de conflictos (ejecuta migration_updated_at_triggers.sql)`)
    }
    const r = await supabase.from(tabla).update(fila).eq('id', id).select().single()
    if (r.error) throw r.error
    return mapear(r.data as Record<string, unknown>)
  }
  if (error) throw error
  if (data) return mapear(data as Record<string, unknown>)

  // Ninguna fila actualizada: o la ha cambiado otro, o la han borrado.
  const { data: actual, error: e2 } = await supabase.from(tabla).select('*').eq('id', id).maybeSingle()
  if (e2) throw e2
  if (!actual) throw new Error('La ficha ya no existe (la ha borrado otro usuario)')
  throw new ConflictError(tabla, mapear(actual as Record<string, unknown>))
}

// ── PLAYERS ──────────────────────────────────────────────────

// ⚠ Supabase corta en 1000 filas SIN avisar: todo fetch de una tabla que
// pueda crecer va paginado (igual que fetchClubs o fetchScoutingPlayers)
export async function fetchPlayers(): Promise<Player[]> {
  const filas = await leerTodo<Record<string, unknown>>('players', (desde, hasta) =>
    supabase.from('players').select('*').order('name')
      .order('id').range(desde, hasta),
  { contar: () => supabase.from('players').select('*', { count: 'exact', head: true }) })
  const jugadores = filas.map(dbToPlayer)
  if (!modoPartner) return jugadores
  // Cuenta de partner: la tabla solo le entrega los jugadores de partners.
  // Los nuestros compartidos llegan aparte, por la vista de ficha reducida.
  const compartidos = await fetchPlayersCompartidos()
  const ids = new Set(jugadores.map(j => j.id))
  return [...jugadores, ...compartidos.filter(c => !ids.has(c.id))]
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Cuenta de partner externo ────────────────────────────────────────
// Lo activa App al saber que el perfil es de partner. La seguridad NO
// depende de esto (la pone la base de datos, migration_partners.sql): solo
// decide de dónde se leen los jugadores compartidos.
let modoPartner = false
export function setModoPartner(v: boolean) { modoPartner = v }

/** Jugadores nuestros compartidos con partners: ficha reducida (vista players_compartidos) */
async function fetchPlayersCompartidos(): Promise<Player[]> {
  const filas = await leerTodo<Record<string, unknown>>('players_compartidos', (desde, hasta) =>
    supabase.from('players_compartidos').select('*').order('name').order('id').range(desde, hasta))
  return filas.map(f => ({ ...dbToPlayer(f), sharedWithPartners: true }))
}

export async function createPlayer(p: Player): Promise<Player> {
  // Un reintento por cada columna opcional que pueda faltar
  for (;;) {
    const { data, error } = await supabase.from('players').insert(filaPlayer(p)).select().single()
    if (error && apagarColumnaPlayer(error)) continue
    if (error) throw error
    return dbToPlayer(data)
  }
}

/** Devuelve la fila guardada (con el updated_at nuevo). Lanza ConflictError si otro la cambió antes. */
export async function updatePlayer(p: Player): Promise<Player> {
  for (;;) {
    try {
      return await actualizarConControl('players', p.id, filaPlayer(p), p.updatedAt, dbToPlayer)
    } catch (e) {
      if (!apagarColumnaPlayer(e)) throw e
    }
  }
}

/** Marca (o desmarca) un jugador nuestro como visible para los partners externos. Solo toca esa columna. */
export async function setPlayerShared(id: string, shared: boolean): Promise<void> {
  const { error } = await supabase.from('players').update({ shared_with_partners: shared }).eq('id', id)
  if (error) throw error
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export async function deletePlayers(ids: string[]): Promise<void> {
  const { error } = await supabase.from('players').delete().in('id', ids)
  if (error) throw error
}

export async function assignManagerToPlayers(playerIds: string[], managerId: string): Promise<void> {
  // Sets managerId as manager 1 (index 0), preserves manager 2 (index 1) if it exists.
  // En lotes de 200: un .in() con cientos de ids se pasa del límite de la URL
  // y el select devolvía 1000 filas como mucho sin avisar.
  const LOTE = 200
  for (let i = 0; i < playerIds.length; i += LOTE) {
    const ids = playerIds.slice(i, i + LOTE)
    const { data, error } = await supabase
      .from('players')
      .select('id, managed_by')
      .in('id', ids)
    if (error) throw error

    const results = await Promise.all((data ?? []).map((row: Record<string, unknown>) => {
      const current: string[] = (row.managed_by as string[]) ?? []
      const manager2 = current[1] ?? null
      const updated = manager2 ? [managerId, manager2] : [managerId]
      return supabase.from('players').update({ managed_by: updated }).eq('id', row.id)
    }))
    // Antes los errores de los updates se tragaban: la UI decía «asignado»
    // aunque alguno hubiera fallado.
    const failed = results.find(r => r.error)
    if (failed?.error) throw failed.error
  }
}

// ── TASKS ────────────────────────────────────────────────────

// ── tasks.recurrence: opcional hasta migrar ──────────────────────────
// Si la fila leída trae la columna, existe y se escribe siempre (también
// para quitar la repetición). Si no, solo se manda cuando alguien la pone;
// y si la base la rechaza (42703), se guarda la tarea sin ella.
// Lo mismo vale para tasks.scouting_player_id (migration_tasks_scouting_player.sql).
const COLUMNAS_OPCIONALES_TAREA = ['recurrence', 'scouting_player_id'] as const
const columnasTarea = new Set<string>()

function dbToTask(row: Record<string, unknown>): Task {
  for (const c of COLUMNAS_OPCIONALES_TAREA) if (c in row) columnasTarea.add(c)
  recordarFila('tasks', row)
  return {
    id: row.id as string,
    playerId: (row.player_id as string) ?? 'general',
    title: row.title as string,
    description: (row.description as string) ?? '',
    assigneeId: (row.assignee_id as string) ?? '',
    watchers: (row.watchers as string[]) ?? [],
    dependsOnId: row.depends_on_id as string | undefined,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    // «Reunión/Comida» pasó a llamarse «Reunión»: las antiguas se leen ya con el nombre nuevo
    label: (row.label === 'Reunión/Comida' ? 'Reunión' : (row.label as Task['label'])) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) ?? undefined,
    comments: [],
    adminOnly: (row.admin_only as boolean) ?? false,
    recurrence: (row.recurrence as Task['recurrence']) ?? undefined,
    scoutingPlayerId: (row.scouting_player_id as string) ?? undefined,
  }
}

function taskToDb(t: Task): Record<string, unknown> {
  const isGeneral = !t.playerId || t.playerId === 'general'
  const fila: Record<string, unknown> = {
    player_id: isGeneral ? null : t.playerId,
    title: t.title,
    description: t.description,
    assignee_id: t.assigneeId || null,
    watchers: t.watchers ?? [],
    depends_on_id: t.dependsOnId || null,
    status: t.status,
    priority: t.priority,
    label: t.label ?? null,
    due_date: t.dueDate || null,
    completed_at: t.completedAt ?? null,
    admin_only: t.adminOnly ?? false,
  }
  const opcionales: Record<string, unknown> = { recurrence: t.recurrence, scouting_player_id: t.scoutingPlayerId }
  for (const c of COLUMNAS_OPCIONALES_TAREA) {
    if (columnasTarea.has(c) || opcionales[c]) fila[c] = opcionales[c] ?? null
  }
  return fila
}

function faltaColumnaRecurrence(error: unknown, fila: Record<string, unknown>): boolean {
  if (!esColumnaInexistente(error) || !COLUMNAS_OPCIONALES_TAREA.some(c => c in fila)) return false
  console.warn('[db] a tasks le falta alguna columna (recurrence, scouting_player_id): se guarda sin ellas. Ejecuta migration_tasks_recurrence.sql y migration_tasks_scouting_player.sql')
  for (const c of COLUMNAS_OPCIONALES_TAREA) { columnasTarea.delete(c); delete fila[c] }
  return true
}

export async function fetchTasks(playerId?: string): Promise<Task[]> {
  // Sin paginar, al pasar de 1000 tareas desaparecían las más antiguas
  // (van ordenadas por fecha de creación descendente)
  const filas = await leerTodo<Record<string, unknown>>('tasks', (desde, hasta) => {
    let q = supabase.from('tasks').select('*').order('created_at', { ascending: false })
      .order('id').range(desde, hasta)
    if (playerId) q = q.eq('player_id', playerId)
    return q
  }, {
    recordar: !playerId,
    contar: () => {
      let q = supabase.from('tasks').select('*', { count: 'exact', head: true })
      if (playerId) q = q.eq('player_id', playerId)
      return q
    },
  })
  return filas.map(dbToTask)
}

export async function createTask(t: Task): Promise<Task> {
  const fila = taskToDb(t)
  let r = await supabase.from('tasks').insert(fila).select().single()
  if (r.error && faltaColumnaRecurrence(r.error, fila)) r = await supabase.from('tasks').insert(fila).select().single()
  if (r.error) throw r.error
  return dbToTask(r.data)
}

export async function updateTask(t: Task): Promise<void> {
  const fila = taskToDb(t)
  try {
    await actualizarSoloCambios('tasks', t.id, fila)
  } catch (err) {
    if (!faltaColumnaRecurrence(err, fila)) throw err
    await actualizarSoloCambios('tasks', t.id, fila)
  }
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── COMMENTS ─────────────────────────────────────────────────

function dbToComment(row: Record<string, unknown>): TaskComment {
  return {
    id: row.id as string,
    authorId: (row.author_id as string) ?? '',
    content: (row.content as string) ?? '',
    createdAt: row.created_at as string,
    attachments: [],
  }
}

export async function fetchComments(taskId: string): Promise<TaskComment[]> {
  const data = await leerTodo<Record<string, unknown>>('task_comments', (d, h) =>
    supabase.from('task_comments').select('*, task_attachments(*)')
      .eq('task_id', taskId).order('created_at').order('id').range(d, h))
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...dbToComment(row as Record<string, unknown>),
    attachments: ((row.task_attachments as Record<string, unknown>[]) ?? []).map((a) => ({
      id: a.id as string,
      name: a.file_name as string,
      mimeType: '',
      data: '',
      storagePath: a.storage_path as string,
      uploadedAt: a.created_at as string,
      uploadedBy: a.uploaded_by as string,
    })),
  }))
}

export async function createComment(taskId: string, authorId: string, content: string): Promise<TaskComment> {
  const { data, error } = await supabase.from('task_comments').insert({
    task_id: taskId,
    author_id: authorId,
    content,
  }).select().single()
  if (error) throw error
  return dbToComment(data)
}

export async function uploadAttachment(
  commentId: string,
  uploadedBy: string,
  file: File
): Promise<string> {
  const path = `${commentId}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file)
  if (uploadError) throw uploadError

  const { error: dbError } = await supabase.from('task_attachments').insert({
    comment_id: commentId,
    file_name: file.name,
    storage_path: path,
    uploaded_by: uploadedBy,
  })
  if (dbError) throw dbError
  return path
}

export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { data } = await supabase.storage.from('attachments').createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? ''
}

// ── PERFORMANCE NOTES ─────────────────────────────────────────

function dbToNote(row: Record<string, unknown>): PerformanceNote {
  return {
    id: row.id as string,
    date: row.date as string,
    authorId: (row.author_id as string) ?? '',
    category: (row.category as string) ?? '',
    rating: (row.rating as number) ?? 0,
    content: (row.content as string) ?? '',
    title: (row.title as string) ?? undefined,
  }
}

export async function fetchNotes(playerId: string): Promise<PerformanceNote[]> {
  const filas = await leerTodo<Record<string, unknown>>('performance_notes', (d, h) =>
    supabase.from('performance_notes').select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(dbToNote)
}

export async function createNote(playerId: string, note: Omit<PerformanceNote, 'id'>): Promise<PerformanceNote> {
  const { data, error } = await supabase.from('performance_notes').insert({
    player_id: playerId,
    author_id: note.authorId || null,
    date: note.date,
    category: note.category,
    rating: note.rating,
    content: note.content,
    title: note.title ?? null,
  }).select().single()
  if (error) throw error
  return dbToNote(data)
}

export async function updateNote(note: PerformanceNote): Promise<void> {
  const { error } = await supabase.from('performance_notes').update({
    author_id: note.authorId || null,
    date: note.date,
    category: note.category,
    rating: note.rating,
    content: note.content,
    title: note.title ?? null,
  }).eq('id', note.id)
  if (error) throw error
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('performance_notes').delete().eq('id', id)
  if (error) throw error
}

// ── PROFILES ─────────────────────────────────────────────────

export async function fetchProfiles() {
  return leerTodo<Record<string, unknown>>('profiles', (d, h) =>
    supabase.from('profiles').select('*').order('name').order('id').range(d, h)) as Promise<unknown[]>
}

export async function updateProfile(id: string, updates: { name?: string; avatar?: string; is_admin?: boolean; hidden_from_status?: boolean; captacion_only?: boolean; activo?: boolean; partner_only?: boolean; partner_name?: string | null }) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) throw error
}

export async function inviteUser(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

// ── POSTPARTIDOS ─────────────────────────────────────────────

function dbToPostpartido(row: Record<string, unknown>): Postpartido {
  return {
    id: row.id as string,
    matchId: (row.match_id as string) ?? undefined,
    playerId: (row.player_id as string) ?? undefined,
    playerName: (row.player_name as string) ?? undefined,
    assigneeId: (row.assignee_id as string) ?? undefined,
    taskId: (row.task_id as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    videoUrl: (row.video_url as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

export async function fetchPostpartidos(): Promise<Postpartido[]> {
  const filas = await leerTodo<Record<string, unknown>>('postpartidos', (d, h) =>
    supabase.from('postpartidos').select('*').order('created_at', { ascending: false }).order('id').range(d, h))
  return filas.map(dbToPostpartido)
}

export async function createPostpartido(p: Omit<Postpartido, 'id' | 'createdAt'>): Promise<Postpartido> {
  const { data, error } = await supabase.from('postpartidos').insert({
    match_id: p.matchId ?? null,
    player_id: p.playerId ?? null,
    player_name: p.playerName ?? null,
    assignee_id: p.assigneeId ?? null,
    task_id: p.taskId ?? null,
    notes: p.notes ?? null,
  }).select().single()
  if (error) throw error
  return dbToPostpartido(data)
}

export async function updatePostpartido(p: Postpartido): Promise<void> {
  const { error } = await supabase.from('postpartidos').update({
    match_id: p.matchId ?? null,
    player_id: p.playerId ?? null,
    player_name: p.playerName ?? null,
    assignee_id: p.assigneeId ?? null,
    task_id: p.taskId ?? null,
    notes: p.notes ?? null,
    video_url: p.videoUrl ?? null,
  }).eq('id', p.id)
  if (error) throw error
}

export async function deletePostpartido(id: string): Promise<void> {
  const { error } = await supabase.from('postpartidos').delete().eq('id', id)
  if (error) throw error
}

// ── MEMBER STATUS (panel "¿con qué está cada uno?") ──────────

function dbToMemberStatus(row: Record<string, unknown>): MemberStatus {
  return {
    profileId: row.profile_id as string,
    locationType: (row.location_type as string) ?? undefined,
    locationDetail: (row.location_detail as string) ?? undefined,
    currentTaskId: (row.current_task_id as string) ?? undefined,
    eventNote: (row.event_note as string) ?? undefined,
    note: (row.note as string) ?? undefined,
    updatedAt: row.updated_at as string,
  }
}

export async function fetchMemberStatuses(): Promise<MemberStatus[]> {
  const filas = await leerTodo<Record<string, unknown>>('member_status', (d, h) =>
    supabase.from('member_status').select('*').order('profile_id').range(d, h))
  return filas.map(dbToMemberStatus)
}

export async function upsertMemberStatus(s: Omit<MemberStatus, 'updatedAt'>): Promise<MemberStatus> {
  const { data, error } = await supabase.from('member_status').upsert({
    profile_id: s.profileId,
    location_type: s.locationType ?? null,
    location_detail: s.locationDetail ?? null,
    current_task_id: s.currentTaskId ?? null,
    event_note: s.eventNote ?? null,
    note: s.note ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' }).select().single()
  if (error) throw error
  return dbToMemberStatus(data)
}

// ── CLUBS ─────────────────────────────────────────────────────

function dbToClub(row: Record<string, unknown>): Club {
  return {
    id: row.id as string,
    name: row.name as string,
    // Clubes de antes de que existieran varias temporadas: se consideran de
    // la primera temporada archivada (2025-26), no de la activa.
    season: (row.season as string) ?? '2025-26',
    league: (row.league as string) ?? undefined,
    country: (row.country as string) ?? 'Spain',
    contactPerson: (row.contact_person as string) ?? undefined,
    aisManager: (row.ais_manager as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    isPriority: (row.is_priority as boolean) ?? false,
    needs: (row.needs as Club['needs']) ?? [],
    createdAt: row.created_at as string,
    contacted: (row.contacted as boolean) ?? false,
    contactedBy: (row.contacted_by as string) ?? undefined,
    contactedAt: (row.contacted_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

export async function fetchClubs(): Promise<Club[]> {
  const filas = await leerTodo<Record<string, unknown>>('clubs', (desde, hasta) =>
    supabase
      .from('clubs').select('*').order('name')
      .order('id').range(desde, hasta),
  { contar: () => supabase.from('clubs').select('*', { count: 'exact', head: true }) })
  return filas.map(dbToClub)
}

export async function createClub(c: Omit<Club, 'id' | 'createdAt'>): Promise<Club> {
  const { data, error } = await supabase.from('clubs').insert({
    name: c.name,
    season: c.season,
    league: c.league ?? null,
    country: c.country,
    contact_person: c.contactPerson ?? null,
    ais_manager: c.aisManager ?? null,
    notes: c.notes ?? null,
    is_priority: c.isPriority,
    needs: c.needs ?? [],
  }).select().single()
  if (error) throw error
  return dbToClub(data)
}

/** Devuelve la fila guardada (con el updated_at nuevo). Lanza ConflictError si otro la cambió antes. */
export async function updateClub(c: Club): Promise<Club> {
  return actualizarConControl('clubs', c.id, {
    name: c.name,
    league: c.league ?? null,
    country: c.country,
    contact_person: c.contactPerson ?? null,
    ais_manager: c.aisManager ?? null,
    notes: c.notes ?? null,
    is_priority: c.isPriority,
    needs: c.needs ?? [],
    contacted: c.contacted ?? false,
    contacted_by: c.contactedBy ?? null,
    contacted_at: c.contactedAt ?? null,
  }, c.updatedAt, dbToClub)
}

export async function deleteClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', id)
  if (error) throw error
}

// ── DISTRIBUTION ENTRIES ──────────────────────────────────────

function dbToDistEntry(row: Record<string, unknown>): DistributionEntry {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    season: (row.season as string) ?? '2025-26',
    priority: (row.priority as DistributionEntry['priority']) ?? 'B',
    condition: (row.condition as string) ?? undefined,
    transferFee: (row.transfer_fee as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    aisManager: (row.ais_manager as string) ?? undefined,
    active: (row.active as boolean) ?? true,
    createdAt: row.created_at as string,
  }
}

export async function fetchDistributionEntries(season?: string): Promise<DistributionEntry[]> {
  const filas = await leerTodo<Record<string, unknown>>('distribution_entries', (desde, hasta) => {
    let q = supabase.from('distribution_entries').select('*').eq('active', true)
      .order('priority')
      .order('id').range(desde, hasta)
    if (season) q = q.eq('season', season)
    return q
  }, {
    recordar: !season,
    contar: () => {
      let q = supabase.from('distribution_entries').select('*', { count: 'exact', head: true }).eq('active', true)
      if (season) q = q.eq('season', season)
      return q
    },
  })
  return filas.map(dbToDistEntry)
}

export async function createDistributionEntry(e: Omit<DistributionEntry, 'id' | 'createdAt'>): Promise<DistributionEntry> {
  const { data, error } = await supabase.from('distribution_entries').insert({
    player_id: e.playerId,
    season: e.season,
    priority: e.priority,
    condition: e.condition ?? null,
    transfer_fee: e.transferFee ?? null,
    notes: e.notes ?? null,
    ais_manager: e.aisManager ?? null,
    active: e.active,
  }).select().single()
  if (error) throw error
  return dbToDistEntry(data)
}

export async function updateDistributionEntry(e: DistributionEntry): Promise<void> {
  const { error } = await supabase.from('distribution_entries').update({
    priority: e.priority,
    condition: e.condition ?? null,
    transfer_fee: e.transferFee ?? null,
    notes: e.notes ?? null,
    ais_manager: e.aisManager ?? null,
    active: e.active,
  }).eq('id', e.id)
  if (error) throw error
}

export async function deleteDistributionEntry(id: string): Promise<void> {
  const { error } = await supabase.from('distribution_entries').delete().eq('id', id)
  if (error) throw error
}

// ── CLUB NEGOTIATIONS ─────────────────────────────────────────

function dbToNegotiation(row: Record<string, unknown>): ClubNegotiation {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    clubId: row.club_id as string,
    needPosition: (row.need_position as string) ?? undefined,
    status: (row.status as ClubNegotiation['status']) ?? 'ofrecido',
    aisManager: (row.ais_manager as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    updates: (row.updates as ClubNegotiation['updates']) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function fetchNegotiations(playerId?: string, clubId?: string): Promise<ClubNegotiation[]> {
  // Paginado: sin esto Supabase corta en 1000 filas y desaparecían ofrecimientos
  const filas = await leerTodo<Record<string, unknown>>('club_negotiations', (desde, hasta) => {
    let q = supabase.from('club_negotiations').select('*')
      .order('updated_at', { ascending: false })
      .order('id').range(desde, hasta)
    if (playerId) q = q.eq('player_id', playerId)
    if (clubId) q = q.eq('club_id', clubId)
    return q
  }, {
    recordar: !playerId && !clubId,
    contar: () => {
      let q = supabase.from('club_negotiations').select('*', { count: 'exact', head: true })
      if (playerId) q = q.eq('player_id', playerId)
      if (clubId) q = q.eq('club_id', clubId)
      return q
    },
  })
  return filas.map(dbToNegotiation)
}

export async function createNegotiation(n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClubNegotiation> {
  const { data, error } = await supabase.from('club_negotiations').insert({
    player_id: n.playerId,
    club_id: n.clubId,
    need_position: n.needPosition ?? null,
    status: n.status,
    ais_manager: n.aisManager ?? null,
    notes: n.notes ?? null,
  }).select().single()
  if (error) throw error
  return dbToNegotiation(data)
}

// Devuelve la fila guardada para que el estado local refleje el updated_at
// real (antes se quedaba con el antiguo hasta el siguiente refetch).
// Lanza ConflictError si otro usuario la ha cambiado desde que se leyó.
export async function updateNegotiation(n: ClubNegotiation): Promise<ClubNegotiation> {
  return actualizarConControl('club_negotiations', n.id, {
    need_position: n.needPosition ?? null,
    status: n.status,
    ais_manager: n.aisManager ?? null,
    notes: n.notes ?? null,
    updates: n.updates ?? [],
  }, n.updatedAt, dbToNegotiation)
}

export async function deleteNegotiation(id: string): Promise<void> {
  const { error } = await supabase.from('club_negotiations').delete().eq('id', id)
  if (error) throw error
}

// ── SCOUTING / CAPTACIÓN ─────────────────────────────────────

function dbToScoutingPlayer(row: Record<string, unknown>): ScoutingPlayer {
  recordarFila('scouting_players', row)
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    position1: (row.position_1 as string) ?? undefined,
    position2: (row.position_2 as string) ?? undefined,
    birthdate: (row.birthdate as string) ?? undefined,
    foot: (row.foot as string) ?? undefined,
    team: (row.team as string) ?? undefined,
    assessment: (row.assessment as ScoutingPlayer['assessment']) ?? undefined,
    assessmentUpdatedAt: (row.assessment_updated_at as string) ?? undefined,
    candidateSeenCount: (row.candidate_seen_count as number) ?? undefined,
    candidateSeenAt: (row.candidate_seen_at as string) ?? undefined,
    nationality: (row.nationality as string) ?? undefined,
    nationalTeam: (row.national_team as string) ?? undefined,
    agency: (row.agency as string) ?? undefined,
    clubContract: (row.club_contract as string) ?? undefined,
    marketMap: (row.market_map as boolean) ?? undefined,
    contacto: (row.contacto as string) ?? undefined,
    categoria: (row.categoria as string) ?? undefined,
    segundaCategoria: (row.segunda_categoria as string) ?? undefined,
    comentarios: (row.comentarios as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

function dbToScoutingReport(row: Record<string, unknown>): ScoutingReport {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    fecha: (row.fecha as string) ?? undefined,
    titulo: (row.titulo as string) ?? undefined,
    texto: (row.texto as string) ?? undefined,
    persona: (row.persona as string) ?? undefined,
    conclusion: (row.conclusion as string) ?? undefined,
    matchId: (row.match_id as string) ?? undefined,
    authorId: (row.author_id as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

export async function fetchScoutingPlayers(): Promise<ScoutingPlayer[]> {
  const filas = await leerTodo<Record<string, unknown>>('scouting_players', (desde, hasta) =>
    supabase
      .from('scouting_players').select('*').order('full_name')
      .order('id').range(desde, hasta),
  { contar: () => supabase.from('scouting_players').select('*', { count: 'exact', head: true }) })
  return filas.map(dbToScoutingPlayer)
}

export async function fetchScoutingReports(playerId?: string): Promise<ScoutingReport[]> {
  const filas = await leerTodo<Record<string, unknown>>('scouting_reports', (desde, hasta) => {
    let q = supabase.from('scouting_reports').select('*')
      .order('fecha', { ascending: false })
      .order('id').range(desde, hasta)
    if (playerId) q = q.eq('player_id', playerId)
    return q
  }, {
    recordar: !playerId,
    contar: () => {
      let q = supabase.from('scouting_reports').select('*', { count: 'exact', head: true })
      if (playerId) q = q.eq('player_id', playerId)
      return q
    },
  })
  return filas.map(dbToScoutingReport)
}

export async function createScoutingPlayer(p: Omit<ScoutingPlayer, 'id' | 'createdAt'>): Promise<ScoutingPlayer> {
  const { data, error } = await supabase.from('scouting_players').insert({
    full_name: p.fullName,
    position_1: p.position1 ?? null,
    position_2: p.position2 ?? null,
    birthdate: p.birthdate ?? null,
    foot: p.foot ?? null,
    team: p.team ?? null,
    assessment: p.assessment ?? null,
    assessment_updated_at: p.assessmentUpdatedAt ?? (p.assessment ? new Date().toISOString() : null),
    nationality: p.nationality ?? null,
    national_team: p.nationalTeam ?? null,
    agency: p.agency ?? null,
    club_contract: p.clubContract ?? null,
    market_map: p.marketMap ?? false,
    contacto: p.contacto ?? null,
    categoria: p.categoria ?? null,
    segunda_categoria: p.segundaCategoria ?? null,
    comentarios: p.comentarios ?? null,
  }).select().single()
  if (error) throw error
  return dbToScoutingPlayer(data)
}

export async function updateScoutingPlayer(p: ScoutingPlayer): Promise<void> {
  await actualizarSoloCambios('scouting_players', p.id, {
    full_name: p.fullName,
    position_1: p.position1 ?? null,
    position_2: p.position2 ?? null,
    birthdate: p.birthdate ?? null,
    foot: p.foot ?? null,
    team: p.team ?? null,
    assessment: p.assessment ?? null,
    assessment_updated_at: p.assessmentUpdatedAt ?? null,
    candidate_seen_count: p.candidateSeenCount ?? null,
    candidate_seen_at: p.candidateSeenAt ?? null,
    nationality: p.nationality ?? null,
    national_team: p.nationalTeam ?? null,
    agency: p.agency ?? null,
    club_contract: p.clubContract ?? null,
    market_map: p.marketMap ?? false,
    contacto: p.contacto ?? null,
    categoria: p.categoria ?? null,
    segunda_categoria: p.segundaCategoria ?? null,
    comentarios: p.comentarios ?? null,
  })
}

export async function deleteScoutingPlayer(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_players').delete().eq('id', id)
  if (error) throw error
}

export async function createScoutingReport(r: Omit<ScoutingReport, 'id' | 'createdAt'>): Promise<ScoutingReport> {
  const { data, error } = await supabase.from('scouting_reports').insert({
    player_id: r.playerId,
    fecha: r.fecha ?? new Date().toISOString(),
    titulo: r.titulo ?? null,
    texto: r.texto ?? null,
    persona: r.persona ?? null,
    conclusion: r.conclusion ?? null,
    match_id: r.matchId ?? null,
    author_id: r.authorId ?? null,
  }).select().single()
  if (error) throw error
  return dbToScoutingReport(data)
}

export async function deleteScoutingReport(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_reports').delete().eq('id', id)
  if (error) throw error
}

export async function updateScoutingReport(r: ScoutingReport): Promise<void> {
  const { error } = await supabase.from('scouting_reports').update({
    titulo: r.titulo ?? null,
    texto: r.texto ?? null,
    persona: r.persona ?? null,
    conclusion: r.conclusion ?? null,
    fecha: r.fecha ?? null,
    match_id: r.matchId ?? null,
  }).eq('id', r.id)
  if (error) throw error
}

// ── scouting_infos (personalidad · contractual · mercado) ─────
// Tabla opcional: mientras migration_scouting_infos.sql no se ejecute, la
// lectura devuelve [] y la app sigue funcionando igual que antes.

function dbToScoutingInfo(row: Record<string, unknown>): ScoutingInfo {
  const t = (v: unknown) => (v as string) ?? undefined
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    tipo: row.tipo as ScoutingInfo['tipo'],
    fecha: t(row.fecha),
    texto: t(row.texto),
    persona: t(row.persona),
    authorId: t(row.author_id),
    fuente: t(row.fuente),
    semaforo: t(row.semaforo) as ScoutingInfo['semaforo'],
    finContrato: t(row.fin_contrato),
    salario: t(row.salario),
    clausula: t(row.clausula),
    fiabilidad: t(row.fiabilidad) as ScoutingInfo['fiabilidad'],
    club: t(row.club),
    quien: t(row.quien),
    interes: t(row.interes) as ScoutingInfo['interes'],
    createdAt: row.created_at as string,
  }
}

/** Columnas de scouting_infos, para insert y update (mismo mapeo en los dos) */
function scoutingInfoToDb(i: Partial<ScoutingInfo>): Record<string, unknown> {
  return {
    tipo: i.tipo,
    fecha: i.fecha ?? new Date().toISOString(),
    texto: i.texto ?? null,
    persona: i.persona ?? null,
    fuente: i.fuente ?? null,
    semaforo: i.semaforo ?? null,
    fin_contrato: i.finContrato ?? null,
    salario: i.salario ?? null,
    clausula: i.clausula ?? null,
    fiabilidad: i.fiabilidad ?? null,
    club: i.club ?? null,
    quien: i.quien ?? null,
    interes: i.interes ?? null,
  }
}

/** Devuelve [] si la tabla aún no existe (migration_scouting_infos.sql sin ejecutar). */
export async function fetchScoutingInfos(): Promise<ScoutingInfo[]> {
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_infos', (d, h) =>
      supabase.from('scouting_infos').select('*')
        .order('fecha', { ascending: false }).order('id').range(d, h))
    return filas.map(dbToScoutingInfo)
  } catch (e) {
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function createScoutingInfo(i: Omit<ScoutingInfo, 'id' | 'createdAt'>): Promise<ScoutingInfo> {
  const { data, error } = await supabase.from('scouting_infos').insert({
    player_id: i.playerId,
    author_id: i.authorId ?? null,
    ...scoutingInfoToDb(i),
  }).select().single()
  if (error) throw error
  return dbToScoutingInfo(data)
}

export async function updateScoutingInfo(i: ScoutingInfo): Promise<void> {
  const { error } = await supabase.from('scouting_infos')
    .update(scoutingInfoToDb(i)).eq('id', i.id)
  if (error) throw error
}

export async function deleteScoutingInfo(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_infos').delete().eq('id', id)
  if (error) throw error
}

// ── scouting_match_players ────────────────────────────────────

function dbToMatchPlayer(row: Record<string, unknown>): ScoutingMatchPlayer {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    playerId: row.player_id as string,
    createdAt: row.created_at as string,
  }
}

export async function fetchMatchPlayers(): Promise<ScoutingMatchPlayer[]> {
  // Paginado: Supabase devuelve como máximo 1000 filas por petición y aquí hay
  // varios miles. Sin esto, muchos partidos aparecían sin sus jugadores.
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_match_players', (desde, hasta) =>
      supabase.from('scouting_match_players')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id').range(desde, hasta),
    { contar: () => supabase.from('scouting_match_players').select('*', { count: 'exact', head: true }) })
    return filas.map(dbToMatchPlayer)
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function addMatchPlayer(matchId: string, playerId: string): Promise<ScoutingMatchPlayer> {
  // INSERT normal, no upsert: ahora un partido es compartido por varios scouts,
  // así que el jugador puede estar ya vinculado por otro. El upsert entraba por
  // la vía del UPDATE y RLS lo bloqueaba (la tabla solo tiene policy de select,
  // insert y delete) → "error al vincular jugador".
  const { data, error } = await supabase.from('scouting_match_players')
    .insert({ match_id: matchId, player_id: playerId })
    .select().maybeSingle()
  if (!error && data) return dbToMatchPlayer(data)
  if (error && error.code !== '23505') throw error   // 23505 = ya estaba vinculado

  const { data: existing, error: readError } = await supabase.from('scouting_match_players')
    .select('*').eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
  if (readError) throw readError
  if (!existing) throw error ?? new Error('No se pudo vincular el jugador al partido')
  return dbToMatchPlayer(existing)
}

export async function removeMatchPlayer(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('scouting_match_players')
    .delete().eq('match_id', matchId).eq('player_id', playerId)
  if (error) throw error
}

// ── scouting_match_our_players (jugadores NUESTROS asignados a mano a un partido) ──

function dbToMatchOurPlayer(row: Record<string, unknown>): ScoutingMatchOurPlayer {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    playerId: row.player_id as string,
    createdAt: row.created_at as string,
  }
}

/** Devuelve [] si la tabla aún no existe (migration_match_nuestros.sql sin ejecutar). */
export async function fetchMatchOurPlayers(): Promise<ScoutingMatchOurPlayer[]> {
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_match_our_players', (d, h) =>
      supabase.from('scouting_match_our_players').select('*').order('created_at').order('id').range(d, h))
    return filas.map(dbToMatchOurPlayer)
  } catch (e) {
    // leerTodo ya lo ha registrado; solo «tabla inexistente» (42P01) devuelve []
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function addMatchOurPlayer(matchId: string, playerId: string): Promise<ScoutingMatchOurPlayer> {
  // INSERT normal (la tabla no tiene policy de update, así que nada de upsert);
  // 23505 = ya estaba asignado por otro → se lee la fila existente.
  const { data, error } = await supabase.from('scouting_match_our_players')
    .insert({ match_id: matchId, player_id: playerId })
    .select().maybeSingle()
  if (!error && data) return dbToMatchOurPlayer(data)
  if (error && error.code !== '23505') throw error

  const { data: existing, error: readError } = await supabase.from('scouting_match_our_players')
    .select('*').eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
  if (readError) throw readError
  if (!existing) throw error ?? new Error('No se pudo asignar el jugador al partido')
  return dbToMatchOurPlayer(existing)
}

export async function removeMatchOurPlayer(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('scouting_match_our_players')
    .delete().eq('match_id', matchId).eq('player_id', playerId)
  if (error) throw error
}

// ── scouting_match_scouts (varios scouts por partido) ─────────

function dbToMatchScout(row: Record<string, unknown>): ScoutingMatchScout {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    scout: row.scout as string,
    status: (row.status as string) === 'visto' ? 'visto' : 'pendiente',
    viewMode: (row.view_mode as ScoutingMatchScout['viewMode']) ?? undefined,
    createdAt: row.created_at as string,
  }
}

/** Devuelve [] si la tabla aún no existe (migración sin ejecutar). */
export async function fetchMatchScouts(): Promise<ScoutingMatchScout[]> {
  // Paginado por el mismo motivo: hay una fila por scout y partido.
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_match_scouts', (desde, hasta) =>
      supabase.from('scouting_match_scouts')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id').range(desde, hasta),
    { contar: () => supabase.from('scouting_match_scouts').select('*', { count: 'exact', head: true }) })
    return filas.map(dbToMatchScout)
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function addMatchScout(matchId: string, scout: string, viewMode?: 'campo' | 'video'): Promise<ScoutingMatchScout> {
  const { data, error } = await supabase.from('scouting_match_scouts')
    .upsert({ match_id: matchId, scout, view_mode: viewMode ?? null }, { onConflict: 'match_id,scout' })
    .select().single()
  if (error) throw error
  return dbToMatchScout(data)
}

// Modo y estado de ESE scout en el partido. Van por upsert y devuelven la
// fila: un partido antiguo (o creado desde el formulario con solo el
// «responsable») tiene al scout en scouting_matches.assigned_to pero sin
// fila aquí, y un update a secas no tocaba nada y «guardaba» sin cambiar.
/** Cómo vio ESE scout el partido: en el campo o por vídeo */
export async function setMatchScoutMode(matchId: string, scout: string, viewMode: 'campo' | 'video'): Promise<ScoutingMatchScout> {
  const { data, error } = await supabase.from('scouting_match_scouts')
    .upsert({ match_id: matchId, scout, view_mode: viewMode }, { onConflict: 'match_id,scout' })
    .select().single()
  if (error) throw error
  return dbToMatchScout(data)
}

export async function removeMatchScout(matchId: string, scout: string): Promise<void> {
  const { error } = await supabase.from('scouting_match_scouts')
    .delete().eq('match_id', matchId).eq('scout', scout)
  if (error) throw error
}

export async function setMatchScoutStatus(matchId: string, scout: string, status: 'pendiente' | 'visto'): Promise<ScoutingMatchScout> {
  const { data, error } = await supabase.from('scouting_match_scouts')
    .upsert({ match_id: matchId, scout, status }, { onConflict: 'match_id,scout' })
    .select().single()
  if (error) throw error
  return dbToMatchScout(data)
}

// ── Fusión manual de partidos ─────────────────────────────────
// Mueve al superviviente los informes, jugadores vinculados y postpartidos
// de las copias, rellena huecos (hora/competición/notas) y borra las copias.
// Los scouts se traspasan aparte (addMatchScout) porque viven en el estado
// de la app. Devuelve el superviviente actualizado.
export async function mergeScoutingMatches(
  survivor: ScoutingMatch,
  victims: ScoutingMatch[],
  newDate?: string,
): Promise<ScoutingMatch> {
  const victimIds = victims.map(v => v.id)
  if (victimIds.length === 0) return survivor

  // 1) informes → superviviente (conservan autor)
  {
    const { error } = await supabase.from('scouting_reports')
      .update({ match_id: survivor.id }).in('match_id', victimIds)
    if (error) throw error
  }

  // 2) postpartidos (la tabla puede no existir aún → 42P01, se ignora).
  // Cualquier otro error se lanza: antes se perdían postpartidos en silencio
  // al borrar los partidos víctima.
  {
    const { error } = await supabase.from('postpartidos')
      .update({ match_id: survivor.id }).in('match_id', victimIds)
    if (error && !esTablaInexistente(error)) throw error
  }

  // 3) jugadores vinculados, sin duplicar
  {
    const { data: existing, error: e1 } = await supabase.from('scouting_match_players')
      .select('player_id').eq('match_id', survivor.id)
    if (e1) throw e1
    const have = new Set((existing ?? []).map(r => r.player_id as string))
    const { data: moving, error: e2 } = await supabase.from('scouting_match_players')
      .select('player_id').in('match_id', victimIds)
    if (e2) throw e2
    const toAdd = Array.from(new Set((moving ?? []).map(r => r.player_id as string)))
      .filter(pid => !have.has(pid))
    if (toAdd.length > 0) {
      const { error: e3 } = await supabase.from('scouting_match_players')
        .insert(toAdd.map(pid => ({ match_id: survivor.id, player_id: pid })))
      if (e3 && e3.code !== '23505') throw e3
    }
  }

  // 4) el superviviente hereda lo que le falte + fecha elegida
  const donor = (field: (m: ScoutingMatch) => string | undefined) =>
    victims.map(field).find(v => v && v.trim()) || undefined
  const updated: ScoutingMatch = {
    ...survivor,
    date: newDate || survivor.date,
    time: survivor.time ?? donor(m => m.time),
    competition: survivor.competition ?? donor(m => m.competition),
    notes: survivor.notes ?? donor(m => m.notes),
  }
  await updateScoutingMatch(updated)

  // 5) fuera las copias (cascade limpia sus vínculos y scouts)
  {
    const { error } = await supabase.from('scouting_matches').delete().in('id', victimIds)
    if (error) throw error
  }
  return updated
}

// ── Scouting Matches ────────────────────────────────────────

function dbToScoutingMatch(row: Record<string, unknown>): ScoutingMatch {
  recordarFila('scouting_matches', row)
  return {
    id: row.id as string,
    date: row.date as string,
    time: (row.time as string) ?? undefined,
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    competition: (row.competition as string) ?? undefined,
    assignedTo: (row.assigned_to as string) ?? undefined,
    viewMode: (row.view_mode as ScoutingMatch['viewMode']) ?? undefined,
    status: (row.status as ScoutingMatch['status']) ?? 'pendiente',
    notes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

export async function fetchScoutingMatches(): Promise<ScoutingMatch[]> {
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_matches', (desde, hasta) =>
      supabase
        .from('scouting_matches')
        .select('*')
        .order('date', { ascending: false })
        .order('id').range(desde, hasta),
    { contar: () => supabase.from('scouting_matches').select('*', { count: 'exact', head: true }) })
    return filas.map(dbToScoutingMatch)
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function createScoutingMatch(m: Omit<ScoutingMatch, 'id' | 'createdAt'>): Promise<ScoutingMatch> {
  const { data, error } = await supabase.from('scouting_matches').insert({
    date: m.date,
    time: m.time ?? null,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    competition: m.competition ?? null,
    assigned_to: m.assignedTo ?? null,
    view_mode: m.viewMode ?? null,
    status: m.status ?? 'pendiente',
    notes: m.notes ?? null,
  }).select().single()
  if (error) throw error
  return dbToScoutingMatch(data)
}

export async function updateScoutingMatch(m: ScoutingMatch): Promise<void> {
  await actualizarSoloCambios('scouting_matches', m.id, {
    date: m.date,
    time: m.time ?? null,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    competition: m.competition ?? null,
    assigned_to: m.assignedTo ?? null,
    view_mode: m.viewMode ?? null,
    status: m.status ?? 'pendiente',
    notes: m.notes ?? null,
  })
}

export async function deleteScoutingMatch(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_matches').delete().eq('id', id)
  if (error) throw error
}

// ── Captación · Firmar (pipeline de firmas) ──────────────────

function dbToFirmasEntry(row: Record<string, unknown>): FirmasEntry {
  return {
    id: row.id as string,
    playerName: row.player_name as string,
    zone: (row.zone as string) ?? 'Otros',
    status: (row.status as FirmasEntry['status']) ?? 'llamar',
    scoutingPlayerId: (row.scouting_player_id as string) ?? undefined,
    managers: (row.managers as string[]) ?? [],
    notes: (row.notes as string) ?? undefined,
    comments: (row.comments as FirmasEntry['comments']) ?? [],
    trelloUrl: (row.trello_url as string) ?? undefined,
    sortPos: (row.sort_pos as number) ?? 0,
    statusUpdatedAt: (row.status_updated_at as string) ?? undefined,
    nextAction: (row.next_action as string) ?? undefined,
    nextActionKind: (row.next_action_kind as string) ?? undefined,
    knownTeam: (row.known_team as string) ?? undefined,
    nextActionTaskId: (row.next_action_task_id as string) ?? undefined,
    nextActionDate: (row.next_action_date as string) ?? undefined,
    nextActionAssignee: (row.next_action_assignee as string) ?? undefined,
    nextActionEventoId: (row.next_action_evento_id as string) ?? undefined,
    signedAt: (row.signed_at as string) ?? undefined,
    potencialTop: (row.potencial_top as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  }
}

/** Una tarjeta tal como está AHORA en la base (para no pisar cambios ajenos al guardar). null si ya no existe. */
export async function fetchFirmasEntry(id: string): Promise<FirmasEntry | null> {
  const { data, error } = await supabase.from('captacion_firmas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? dbToFirmasEntry(data as Record<string, unknown>) : null
}

export async function fetchFirmasEntries(): Promise<FirmasEntry[]> {
  // try/catch: la tabla puede no existir aún (migración pendiente) — la app no debe romper
  try {
    const filas = await leerTodo<Record<string, unknown>>('captacion_firmas', (desde, hasta) =>
      supabase
        .from('captacion_firmas').select('*').order('sort_pos')
        .order('id').range(desde, hasta),
    { contar: () => supabase.from('captacion_firmas').select('*', { count: 'exact', head: true }) })
    return filas.map(dbToFirmasEntry)
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

// Columnas de captacion_firmas añadidas después: potencial_top
// (migration_firmas_potencial_top.sql) y next_action_evento_id
// (migration_firmas_next_action_evento.sql). Si una no existe aún, se
// guarda sin ella y se recuerda para no reintentar en cada escritura.
const COLUMNAS_OPCIONALES_FIRMAS = ['potencial_top', 'next_action_evento_id'] as const
const firmasColumnasAusentes = new Set<string>()
function sinColumnasAusentes(fila: Record<string, unknown>, error: unknown): Record<string, unknown> | null {
  if (!esColumnaInexistente(error)) return null
  const msg = (error as { message?: string } | null)?.message ?? ''
  const falta = COLUMNAS_OPCIONALES_FIRMAS.find(c => !firmasColumnasAusentes.has(c) && msg.includes(c))
  if (!falta) return null
  firmasColumnasAusentes.add(falta)
  console.warn(`[db] captacion_firmas no tiene columna ${falta}: se guarda sin ella (ejecuta la migración correspondiente)`)
  const copia = { ...fila }
  for (const c of firmasColumnasAusentes) delete copia[c]
  return copia
}
const columnasOpcionalesFirmas = (e: Pick<FirmasEntry, 'potencialTop' | 'nextActionEventoId'>): Record<string, unknown> => ({
  ...(firmasColumnasAusentes.has('potencial_top') ? {} : { potencial_top: e.potencialTop ?? false }),
  ...(firmasColumnasAusentes.has('next_action_evento_id') ? {} : { next_action_evento_id: e.nextActionEventoId ?? null }),
})

export async function createFirmasEntry(e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FirmasEntry> {
  const fila: Record<string, unknown> = {
    player_name: e.playerName,
    zone: e.zone,
    status: e.status,
    scouting_player_id: e.scoutingPlayerId ?? null,
    managers: e.managers ?? [],
    notes: e.notes ?? null,
    comments: e.comments ?? [],
    trello_url: e.trelloUrl ?? null,
    sort_pos: e.sortPos ?? 0,
    status_updated_at: e.statusUpdatedAt ?? null,
    next_action: e.nextAction ?? null,
    next_action_kind: e.nextActionKind ?? null,
    known_team: e.knownTeam ?? null,
    next_action_task_id: e.nextActionTaskId ?? null,
    next_action_date: e.nextActionDate ?? null,
    next_action_assignee: e.nextActionAssignee ?? null,
    signed_at: e.signedAt ?? null,
    ...columnasOpcionalesFirmas(e),
  }
  let { data, error } = await supabase.from('captacion_firmas').insert(fila).select().single()
  const reintento = error ? sinColumnasAusentes(fila, error) : null
  if (reintento) ({ data, error } = await supabase.from('captacion_firmas').insert(reintento).select().single())
  if (error) throw error
  return dbToFirmasEntry(data)
}

/**
 * Orden manual de las tarjetas dentro de su columna. Solo toca sort_pos (ni
 * updated_at): reordenar no es «tocar» al jugador, así que no reinicia los
 * días sin tocar ni pisa lo que otro esté escribiendo en la tarjeta.
 */
export async function setFirmasSortPos(pares: { id: string; sortPos: number }[]): Promise<void> {
  const LOTE = 8
  for (let i = 0; i < pares.length; i += LOTE) {
    const res = await Promise.all(pares.slice(i, i + LOTE).map(p =>
      supabase.from('captacion_firmas').update({ sort_pos: p.sortPos }).eq('id', p.id)))
    const fallo = res.find(r => r.error)
    if (fallo?.error) throw fallo.error
  }
}

export async function updateFirmasEntry(e: FirmasEntry): Promise<void> {
  const fila: Record<string, unknown> = {
    player_name: e.playerName,
    zone: e.zone,
    status: e.status,
    scouting_player_id: e.scoutingPlayerId ?? null,
    managers: e.managers ?? [],
    notes: e.notes ?? null,
    comments: e.comments ?? [],
    trello_url: e.trelloUrl ?? null,
    sort_pos: e.sortPos ?? 0,
    status_updated_at: e.statusUpdatedAt ?? null,
    next_action: e.nextAction ?? null,
    next_action_kind: e.nextActionKind ?? null,
    known_team: e.knownTeam ?? null,
    next_action_task_id: e.nextActionTaskId ?? null,
    next_action_date: e.nextActionDate ?? null,
    next_action_assignee: e.nextActionAssignee ?? null,
    signed_at: e.signedAt ?? null,
    updated_at: new Date().toISOString(),
    ...columnasOpcionalesFirmas(e),
  }
  let { error } = await supabase.from('captacion_firmas').update(fila).eq('id', e.id)
  const reintento = error ? sinColumnasAusentes(fila, error) : null
  if (reintento) ({ error } = await supabase.from('captacion_firmas').update(reintento).eq('id', e.id))
  if (error) throw error
}

export async function deleteFirmasEntry(id: string): Promise<void> {
  const { error } = await supabase.from('captacion_firmas').delete().eq('id', id)
  if (error) throw error
}

// ── Ofrecimientos ──────────────────────────────────────────────
// Jugadores que nos ofrecen de fuera. Niveles y contactos van en jsonb:
// la ficha los lee y escribe enteros (como los comments de Firmar).

function dbToOfrecimiento(row: Record<string, unknown>): Ofrecimiento {
  const t = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
  return {
    id: row.id as string,
    playerName: row.player_name as string,
    position: t(row.position),
    birthYear: t(row.birth_year),
    birthMonth: t(row.birth_month),
    team: t(row.team),
    country: t(row.country),
    nationality: t(row.nationality),
    scoutingPlayerId: t(row.scouting_player_id),
    origen: (t(row.origen) as Ofrecimiento['origen']) ?? 'otro',
    ofreceNombre: t(row.ofrece_nombre),
    ofreceContacto: t(row.ofrece_contacto),
    condOperacion: t(row.cond_operacion) as Ofrecimiento['condOperacion'],
    condCoste: t(row.cond_coste),
    condSalario: t(row.cond_salario),
    condComision: t(row.cond_comision),
    condFinContrato: t(row.cond_fin_contrato),
    fechaLimite: t(row.fecha_limite),
    notes: t(row.notes),
    responsable: t(row.responsable),
    estado: (t(row.estado) as Ofrecimiento['estado']) ?? 'abierto',
    decididoPor: t(row.decidido_por),
    decididoAt: t(row.decidido_at),
    decisionNota: t(row.decision_nota),
    niveles: Array.isArray(row.niveles) ? (row.niveles as Ofrecimiento['niveles']) : [],
    contactos: Array.isArray(row.contactos) ? (row.contactos as Ofrecimiento['contactos']) : [],
    createdBy: t(row.created_by),
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  }
}

function ofrecimientoToDb(o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  return {
    player_name: o.playerName,
    position: o.position ?? null,
    birth_year: o.birthYear ?? null,
    birth_month: o.birthMonth ?? null,
    team: o.team ?? null,
    country: o.country ?? null,
    nationality: o.nationality ?? null,
    scouting_player_id: o.scoutingPlayerId ?? null,
    origen: o.origen,
    ofrece_nombre: o.ofreceNombre ?? null,
    ofrece_contacto: o.ofreceContacto ?? null,
    cond_operacion: o.condOperacion ?? null,
    cond_coste: o.condCoste ?? null,
    cond_salario: o.condSalario ?? null,
    cond_comision: o.condComision ?? null,
    cond_fin_contrato: o.condFinContrato ?? null,
    fecha_limite: o.fechaLimite ?? null,
    notes: o.notes ?? null,
    responsable: o.responsable ?? null,
    estado: o.estado,
    decidido_por: o.decididoPor ?? null,
    decidido_at: o.decididoAt ?? null,
    decision_nota: o.decisionNota ?? null,
    niveles: o.niveles,
    contactos: o.contactos,
    created_by: o.createdBy ?? null,
  }
}

/** Devuelve [] si la tabla aún no existe (migration_ofrecimientos.sql sin ejecutar). */
export async function fetchOfrecimientos(): Promise<Ofrecimiento[]> {
  try {
    const filas = await leerTodo<Record<string, unknown>>('ofrecimientos', (d, h) =>
      supabase.from('ofrecimientos').select('*').order('created_at', { ascending: false }).order('id').range(d, h))
    return filas.map(dbToOfrecimiento)
  } catch (e) {
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function createOfrecimiento(o: Omit<Ofrecimiento, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ofrecimiento> {
  const { data, error } = await supabase.from('ofrecimientos').insert(ofrecimientoToDb(o)).select().single()
  if (error) throw error
  return dbToOfrecimiento(data)
}

export async function updateOfrecimiento(o: Ofrecimiento): Promise<Ofrecimiento> {
  const { data, error } = await supabase.from('ofrecimientos')
    .update({ ...ofrecimientoToDb(o), updated_at: new Date().toISOString() })
    .eq('id', o.id).select().single()
  if (error) throw error
  return dbToOfrecimiento(data)
}

export async function deleteOfrecimiento(id: string): Promise<void> {
  const { error } = await supabase.from('ofrecimientos').delete().eq('id', id)
  if (error) throw error
}

// ── Boulema · jugadores (mantenimiento light) ────────────────

function dbToBoulemaPlayer(row: Record<string, unknown>): BoulemaPlayer {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    birthYear: (row.birth_year as string) ?? undefined,
    position: (row.position as string) ?? undefined,
    team: (row.team as string) ?? undefined,
    country: (row.country as string) ?? undefined,
    nationality: (row.nationality as string) ?? undefined,
    contacto: (row.contacto as string) ?? undefined,
    manager: (row.manager as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  }
}

export async function fetchBoulemaPlayers(): Promise<BoulemaPlayer[]> {
  // la tabla puede no existir aún (migración pendiente)
  try {
    const filas = await leerTodo<Record<string, unknown>>('boulema_players', (desde, hasta) =>
      supabase.from('boulema_players').select('*').order('full_name')
        .order('id').range(desde, hasta),
    { contar: () => supabase.from('boulema_players').select('*', { count: 'exact', head: true }) })
    return filas.map(dbToBoulemaPlayer)
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

export async function createBoulemaPlayer(p: Omit<BoulemaPlayer, 'id' | 'createdAt' | 'updatedAt'>): Promise<BoulemaPlayer> {
  const { data, error } = await supabase.from('boulema_players').insert({
    full_name: p.fullName,
    birth_year: p.birthYear ?? null,
    position: p.position ?? null,
    team: p.team ?? null,
    country: p.country ?? null,
    nationality: p.nationality ?? null,
    contacto: p.contacto ?? null,
    manager: p.manager ?? null,
    notes: p.notes ?? null,
  }).select().single()
  if (error) throw error
  return dbToBoulemaPlayer(data)
}

export async function updateBoulemaPlayer(p: BoulemaPlayer): Promise<void> {
  const { error } = await supabase.from('boulema_players').update({
    full_name: p.fullName,
    birth_year: p.birthYear ?? null,
    position: p.position ?? null,
    team: p.team ?? null,
    country: p.country ?? null,
    nationality: p.nationality ?? null,
    contacto: p.contacto ?? null,
    manager: p.manager ?? null,
    notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id)
  if (error) throw error
}

export async function deleteBoulemaPlayer(id: string): Promise<void> {
  const { error } = await supabase.from('boulema_players').delete().eq('id', id)
  if (error) throw error
}

// ── CLUB LOGS ─────────────────────────────────────────────────

function dbToClubLog(row: Record<string, unknown>): ClubLog {
  return {
    id:        row.id as string,
    playerId:  row.player_id as string,
    date:      row.date as string,
    clubName:  row.club_name as string,
    notes:     row.notes as string,
    authorId:  (row.author_id as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

export async function fetchClubLogs(playerId: string): Promise<ClubLog[]> {
  const filas = await leerTodo<Record<string, unknown>>('club_logs', (d, h) =>
    supabase.from('club_logs').select('*').eq('player_id', playerId)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(dbToClubLog)
}

export async function createClubLog(playerId: string, log: Omit<ClubLog, 'id' | 'playerId' | 'createdAt'>): Promise<ClubLog> {
  const { data, error } = await supabase.from('club_logs').insert({
    player_id:  playerId,
    date:       log.date,
    club_name:  log.clubName,
    notes:      log.notes,
    author_id:  log.authorId ?? null,
  }).select().single()
  if (error) throw error
  return dbToClubLog(data)
}

export async function updateClubLog(log: ClubLog): Promise<void> {
  const { error } = await supabase.from('club_logs').update({
    date:      log.date,
    club_name: log.clubName,
    notes:     log.notes,
    author_id: log.authorId ?? null,
  }).eq('id', log.id)
  if (error) throw error
}

export async function deleteClubLog(id: string): Promise<void> {
  const { error } = await supabase.from('club_logs').delete().eq('id', id)
  if (error) throw error
}

// ── PLAYER MEETINGS ───────────────────────────────────────────

function dbToMeeting(row: Record<string, unknown>): PlayerMeeting {
  return {
    id:        row.id as string,
    playerId:  row.player_id as string,
    date:      row.date as string,
    notes:     (row.notes as string) ?? undefined,
    authorId:  (row.author_id as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

export async function fetchMeetings(playerId: string): Promise<PlayerMeeting[]> {
  const filas = await leerTodo<Record<string, unknown>>('player_meetings', (d, h) =>
    supabase.from('player_meetings').select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(dbToMeeting)
}

export async function createMeeting(playerId: string, meeting: Omit<PlayerMeeting, 'id' | 'playerId' | 'createdAt'>): Promise<PlayerMeeting> {
  const { data, error } = await supabase.from('player_meetings').insert({
    player_id: playerId,
    date:      meeting.date,
    notes:     meeting.notes ?? null,
    author_id: meeting.authorId ?? null,
  }).select().single()
  if (error) throw error
  return dbToMeeting(data)
}

export async function updateMeeting(meeting: PlayerMeeting): Promise<void> {
  const { error } = await supabase.from('player_meetings').update({
    date:      meeting.date,
    notes:     meeting.notes ?? null,
    author_id: meeting.authorId ?? null,
  }).eq('id', meeting.id)
  if (error) throw error
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from('player_meetings').delete().eq('id', id)
  if (error) throw error
}

// ── PLAYER ACTIVITIES ─────────────────────────────────────────

function dbToPlayerActivity(row: Record<string, unknown>): PlayerActivity {
  return {
    id:                   row.id as string,
    playerId:             row.player_id as string,
    date:                 row.date as string,
    type:                 row.type as string,
    notes:                row.notes as string | undefined,
    authorId:             row.author_id as string | undefined,
    createdAt:            row.created_at as string,
    groupId:              row.group_id as string | undefined,
    linkedPlayerIds:      (row.linked_player_ids as string[] | undefined) ?? [],
    participantProfileIds:(row.participant_profile_ids as string[] | undefined) ?? [],
  }
}

export async function fetchPlayerActivities(playerId: string): Promise<PlayerActivity[]> {
  const filas = await leerTodo<Record<string, unknown>>('player_activities', (d, h) =>
    supabase.from('player_activities').select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(row => dbToPlayerActivity(row))
}

/** Create a single-player activity (no group). */
export async function createPlayerActivity(
  playerId: string,
  input: Pick<PlayerActivity, 'date' | 'type' | 'notes' | 'authorId' | 'participantProfileIds'>
): Promise<PlayerActivity> {
  const { data, error } = await supabase
    .from('player_activities')
    .insert({
      player_id:              playerId,
      date:                   input.date,
      type:                   input.type,
      notes:                  input.notes ?? null,
      author_id:              input.authorId ?? null,
      group_id:               null,
      linked_player_ids:      [],
      participant_profile_ids: input.participantProfileIds ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return dbToPlayerActivity(data as Record<string, unknown>)
}

/**
 * Create one activity row per player, all sharing the same group_id.
 * Returns all created rows.
 */
export async function createGroupActivity(
  playerIds: string[],
  input: Pick<PlayerActivity, 'date' | 'type' | 'notes' | 'authorId' | 'participantProfileIds'>
): Promise<PlayerActivity[]> {
  const groupId = crypto.randomUUID()
  const rows = playerIds.map(pid => ({
    player_id:               pid,
    date:                    input.date,
    type:                    input.type,
    notes:                   input.notes ?? null,
    author_id:               input.authorId ?? null,
    group_id:                groupId,
    linked_player_ids:       playerIds,
    participant_profile_ids: input.participantProfileIds ?? [],
  }))
  const { data, error } = await supabase
    .from('player_activities')
    .insert(rows)
    .select()
  if (error) throw error
  return (data ?? []).map(row => dbToPlayerActivity(row as Record<string, unknown>))
}

export async function updatePlayerActivity(act: PlayerActivity): Promise<void> {
  const { error } = await supabase
    .from('player_activities')
    .update({ date: act.date, type: act.type, notes: act.notes ?? null })
    .eq('id', act.id)
  if (error) throw error
}

/** Update all rows belonging to the same group. */
export async function updateGroupActivity(act: PlayerActivity): Promise<void> {
  if (!act.groupId) return updatePlayerActivity(act)
  const { error } = await supabase
    .from('player_activities')
    .update({ date: act.date, type: act.type, notes: act.notes ?? null })
    .eq('group_id', act.groupId)
  if (error) throw error
}

export async function deletePlayerActivity(id: string): Promise<void> {
  const { error } = await supabase.from('player_activities').delete().eq('id', id)
  if (error) throw error
}

/** Delete all rows belonging to the same group. */
export async function deleteGroupActivity(groupId: string): Promise<void> {
  const { error } = await supabase.from('player_activities').delete().eq('group_id', groupId)
  if (error) throw error
}

/** Fetch all activities where a profile was the author OR a tagged participant. */
export async function fetchActivitiesByAuthor(authorId: string): Promise<PlayerActivity[]> {
  // authorId se interpola en un filtro .or(): validar que es un UUID
  if (!/^[0-9a-f-]{36}$/i.test(authorId)) throw new Error('authorId inválido')
  const filas = await leerTodo<Record<string, unknown>>('player_activities', (d, h) =>
    supabase.from('player_activities').select('*')
      .or(`author_id.eq.${authorId},participant_profile_ids.cs.{${authorId}}`)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(row => dbToPlayerActivity(row))
}

/** Actividades de TODO el equipo entre dos días (ambos incluidos): para el calendario y «Mi día». */
export async function fetchActivitiesEntre(desde: string, hasta: string): Promise<PlayerActivity[]> {
  const filas = await leerTodo<Record<string, unknown>>('player_activities', (d, h) =>
    supabase.from('player_activities').select('*')
      .gte('date', desde).lte('date', hasta)
      .order('date', { ascending: false }).order('id').range(d, h))
  return filas.map(row => dbToPlayerActivity(row))
}

// ── EVENTOS DE AGENDA ────────────────────────────────────────────────
// Tabla opcional hasta ejecutar migration_agenda_eventos.sql.

/** true si el error es «esa tabla no existe» (Postgres 42P01 o la caché de PostgREST) */
export function esMigracionPendiente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function dbToAgendaEvento(row: Record<string, unknown>): AgendaEvento {
  for (const c of COLUMNAS_OPCIONALES_EVENTO) if (c in row) columnasEvento.add(c)
  return {
    id: row.id as string,
    titulo: (row.titulo as string) ?? '',
    tipo: (row.tipo as string) ?? 'Reunión',
    fecha: row.fecha as string,
    hora: (row.hora as string) ?? undefined,
    ambito: ((row.ambito as string) ?? 'general') as AgendaEvento['ambito'],
    playerIds: (row.player_ids as string[]) ?? [],
    scoutingPlayerId: (row.scouting_player_id as string) ?? undefined,
    participantIds: (row.participant_ids as string[]) ?? [],
    notas: (row.notas as string) ?? undefined,
    lugar: (row.lugar as string) ?? undefined,
    fechaFin: (row.fecha_fin as string) ?? undefined,
    zona: (row.zona as string) ?? undefined,
    authorId: (row.author_id as string) ?? undefined,
    activityRef: (row.activity_ref as string) ?? undefined,
    recap: (row.recap as string) ?? undefined,
    cerradoAt: (row.cerrado_at as string) ?? undefined,
    cerradoPor: (row.cerrado_por as string) ?? undefined,
    createdAt: row.created_at as string,
  }
}

// Columnas de agenda_eventos añadidas después de crear la tabla: lugar
// (migration_agenda_eventos_lugar.sql), fecha_fin y zona (migration_agenda_viajes.sql).
// Cada una se manda solo si existe (se ve al leer) o si trae valor; y si la
// base rechaza alguna (42703), el evento se guarda sin ellas.
// recap, cerrado_at y cerrado_por: migration_agenda_eventos_cierre.sql.
const COLUMNAS_OPCIONALES_EVENTO = ['lugar', 'fecha_fin', 'zona', 'recap', 'cerrado_at', 'cerrado_por'] as const
const columnasEvento = new Set<string>()

function faltaColumnaEvento(error: unknown, fila: Record<string, unknown>): boolean {
  if (!esColumnaInexistente(error) || !COLUMNAS_OPCIONALES_EVENTO.some(c => c in fila)) return false
  console.warn('[db] a agenda_eventos le falta alguna columna (lugar, fecha_fin, zona, recap, cerrado_at, cerrado_por): se guarda sin ellas. Ejecuta migration_agenda_eventos_lugar.sql, migration_agenda_viajes.sql y migration_agenda_eventos_cierre.sql')
  for (const c of COLUMNAS_OPCIONALES_EVENTO) { columnasEvento.delete(c); delete fila[c] }
  return true
}

function agendaEventoToDb(e: Omit<AgendaEvento, 'id' | 'createdAt'>): Record<string, unknown> {
  const opcionales: Record<string, unknown> = { lugar: e.lugar, fecha_fin: e.fechaFin, zona: e.zona, recap: e.recap, cerrado_at: e.cerradoAt, cerrado_por: e.cerradoPor }
  const fila: Record<string, unknown> = {
    titulo: e.titulo,
    tipo: e.tipo,
    fecha: e.fecha,
    hora: e.hora || null,
    ambito: e.ambito,
    player_ids: e.playerIds,
    scouting_player_id: e.scoutingPlayerId ?? null,
    participant_ids: e.participantIds,
    notas: e.notas ?? null,
    author_id: e.authorId ?? null,
    activity_ref: e.activityRef ?? null,
  }
  for (const c of COLUMNAS_OPCIONALES_EVENTO) {
    if (columnasEvento.has(c) || opcionales[c]) fila[c] = opcionales[c] ?? null
  }
  return fila
}

/** Lanza si la tabla no existe: quien llama decide cómo seguir sin ella. */
export async function fetchAgendaEventos(): Promise<AgendaEvento[]> {
  const filas = await leerTodo<Record<string, unknown>>('agenda_eventos', (d, h) =>
    supabase.from('agenda_eventos').select('*')
      .order('fecha', { ascending: false }).order('id').range(d, h))
  return filas.map(dbToAgendaEvento)
}

export async function createAgendaEvento(e: Omit<AgendaEvento, 'id' | 'createdAt'>): Promise<AgendaEvento> {
  const fila = agendaEventoToDb(e)
  let r = await supabase.from('agenda_eventos').insert(fila).select().single()
  if (r.error && faltaColumnaEvento(r.error, fila)) r = await supabase.from('agenda_eventos').insert(fila).select().single()
  if (r.error) throw r.error
  return dbToAgendaEvento(r.data as Record<string, unknown>)
}

export async function updateAgendaEvento(e: AgendaEvento): Promise<void> {
  const fila = agendaEventoToDb(e)
  let r = await supabase.from('agenda_eventos').update(fila).eq('id', e.id)
  if (r.error && faltaColumnaEvento(r.error, fila)) r = await supabase.from('agenda_eventos').update(fila).eq('id', e.id)
  if (r.error) throw r.error
}

/** Un evento concreto (para cerrar una reunión desde la tarjeta de Firmar). null si no existe. */
export async function fetchAgendaEvento(id: string): Promise<AgendaEvento | null> {
  const { data, error } = await supabase.from('agenda_eventos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? dbToAgendaEvento(data as Record<string, unknown>) : null
}

export async function deleteAgendaEvento(id: string): Promise<void> {
  const { error } = await supabase.from('agenda_eventos').delete().eq('id', id)
  if (error) throw error
}

// ── Realtime fila a fila ─────────────────────────────────────────────
// Cómo convertir la fila cruda que trae un evento de realtime en el objeto
// de la app, para las tablas grandes. Así un informe nuevo se añade al
// estado tal cual llega, en vez de volver a descargar los ~12.000.
export const FILA_REALTIME = {
  tasks: dbToTask,
  scouting_players: dbToScoutingPlayer,
  scouting_reports: dbToScoutingReport,
  scouting_infos: dbToScoutingInfo,
  scouting_matches: dbToScoutingMatch,
  scouting_match_players: dbToMatchPlayer,
  scouting_match_scouts: dbToMatchScout,
  ofrecimientos: dbToOfrecimiento,
} as const

// ── ZONAS DE CLUBES ──────────────────────────────────────────────────
// La app trae una clasificación por defecto (src/lib/zonas.ts). Aquí solo
// viven las correcciones hechas a mano y los clubes nuevos.

export interface ClubZona { club: string; nombre?: string; zona: string }

export async function fetchClubZonas(): Promise<ClubZona[]> {
  try {
    return await leerTodo<ClubZona>('zonas de clubes (¿migración pendiente?)', (d, h) =>
      supabase.from('scouting_club_zonas').select('club, nombre, zona').order('club').range(d, h))
  } catch (e) {
    // leerTodo ya lo ha registrado en consola
    if (esTablaInexistente(e)) return []
    throw e
  }
}

/** Guarda (o cambia) la zona de un club. `zona = null` vuelve a la de por defecto. */
export async function setClubZona(club: string, nombre: string, zona: string | null, quien?: string): Promise<void> {
  if (!zona) {
    const { error } = await supabase.from('scouting_club_zonas').delete().eq('club', club)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('scouting_club_zonas').upsert(
    { club, nombre, zona, updated_at: new Date().toISOString(), updated_by: quien ?? null },
    { onConflict: 'club' },
  )
  if (error) throw error
}

// ── CATÁLOGO DE EQUIPOS ──────────────────────────────────────────────
// Un equipo = «Atlético Madrid Juv A». Lleva su club (de donde sale la
// zona), su categoría, y dos marcas de control: relevante y cubierto.

export interface Equipo {
  nombre: string
  club: string
  categoria?: string
  zona?: string
  relevante: boolean
  cubierto: boolean
  cubiertoAt?: string
  notas?: string
  activo: boolean
  manual: boolean
}

function dbToEquipo(row: Record<string, unknown>): Equipo {
  return {
    nombre: row.nombre as string,
    club: row.club as string,
    categoria: (row.categoria as string) ?? undefined,
    zona: (row.zona as string) ?? undefined,
    relevante: (row.relevante as boolean) ?? false,
    cubierto: (row.cubierto as boolean) ?? false,
    cubiertoAt: (row.cubierto_at as string) ?? undefined,
    notas: (row.notas as string) ?? undefined,
    activo: (row.activo as boolean) ?? true,
    manual: (row.manual as boolean) ?? false,
  }
}

export async function fetchEquipos(): Promise<Equipo[]> {
  try {
    const filas = await leerTodo<Record<string, unknown>>('scouting_equipos', (desde, hasta) =>
      supabase.from('scouting_equipos').select('*')
        .order('nombre').range(desde, hasta),
    { contar: () => supabase.from('scouting_equipos').select('*', { count: 'exact', head: true }) })
    const all = filas.map(r => dbToEquipo(r))
    // la clave aquí es `nombre`, no `id`: deduplicamos por índice para no tocar las filas
    return dedupePorId(all.map((e, i) => ({ id: e.nombre, i }))).map(({ i }) => all[i])
  } catch (e) {
    // el fallo de página ya se ha registrado arriba; solo evitamos relanzar «tabla inexistente»
    if (esTablaInexistente(e)) return []
    throw e
  }
}

/** Crea o actualiza un equipo del catálogo */
export async function upsertEquipo(e: Partial<Equipo> & { nombre: string; club: string }, quien?: string): Promise<void> {
  const fila: Record<string, unknown> = {
    nombre: e.nombre,
    club: e.club,
    updated_at: new Date().toISOString(),
    updated_by: quien ?? null,
  }
  if (e.categoria !== undefined) fila.categoria = e.categoria ?? null
  if (e.zona !== undefined) fila.zona = e.zona ?? null
  if (e.relevante !== undefined) fila.relevante = e.relevante
  if (e.cubierto !== undefined) {
    fila.cubierto = e.cubierto
    fila.cubierto_at = e.cubierto ? new Date().toISOString() : null
  }
  if (e.notas !== undefined) fila.notas = e.notas ?? null
  if (e.activo !== undefined) fila.activo = e.activo
  if (e.manual !== undefined) fila.manual = e.manual
  const { error } = await supabase.from('scouting_equipos').upsert(fila, { onConflict: 'nombre' })
  if (error) throw error
}

export async function deleteEquipo(nombre: string): Promise<void> {
  const { error } = await supabase.from('scouting_equipos').delete().eq('nombre', nombre)
  if (error) throw error
}

/**
 * Renombrar un equipo. Cambia el nombre en el catálogo y arrastra con él a
 * todos sus jugadores y a sus partidos: si no, quedarían apuntando a un
 * equipo que ya no existe y volveríamos a tener dos equipos donde hay uno.
 */
export async function renombrarEquipo(opts: {
  nombreViejo: string
  nombreNuevo: string
  club: string
  playerIds: string[]
  matchIdsLocal: string[]
  matchIdsVisitante: string[]
  quien?: string
}): Promise<void> {
  const { nombreViejo, nombreNuevo, club, playerIds, matchIdsLocal, matchIdsVisitante, quien } = opts

  // 1 · la fila del catálogo (nombre es la clave primaria: se copia y se borra)
  // Si el select falla, `viejo` sería null y se perderían relevante/cubierto/
  // notas al copiar: mejor parar aquí.
  const { data: viejo, error: e0 } = await supabase.from('scouting_equipos').select('*').eq('nombre', nombreViejo).maybeSingle()
  if (e0) throw e0
  const fila = {
    ...(viejo ?? {}),
    nombre: nombreNuevo,
    club,
    updated_at: new Date().toISOString(),
    updated_by: quien ?? null,
  }
  const { error: e1 } = await supabase.from('scouting_equipos').upsert(fila, { onConflict: 'nombre' })
  if (e1) throw e1
  if (viejo && nombreViejo !== nombreNuevo) {
    // Sin comprobar el error quedaban dos filas (vieja y nueva) sin avisar.
    const { error: e2 } = await supabase.from('scouting_equipos').delete().eq('nombre', nombreViejo)
    if (e2) throw e2
  }

  // 2 · jugadores y partidos, de golpe (no uno a uno)
  if (playerIds.length) {
    const { error } = await supabase.from('scouting_players').update({ team: nombreNuevo }).in('id', playerIds)
    if (error) throw error
  }
  if (matchIdsLocal.length) {
    const { error } = await supabase.from('scouting_matches').update({ home_team: nombreNuevo }).in('id', matchIdsLocal)
    if (error) throw error
  }
  if (matchIdsVisitante.length) {
    const { error } = await supabase.from('scouting_matches').update({ away_team: nombreNuevo }).in('id', matchIdsVisitante)
    if (error) throw error
  }
}
