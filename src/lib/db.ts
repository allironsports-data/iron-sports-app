import { supabase } from './supabase'
import type { Player, Task, TaskComment, PerformanceNote, ClubInterest, PlayerLink, MatchReport, VideoSession, Club, DistributionEntry, ClubNegotiation, ScoutingPlayer, ScoutingReport, ScoutingMatch, ScoutingMatchPlayer, ScoutingMatchScout, BoulemaPeticion, ClubLog, PlayerMeeting, PlayerActivity, MemberStatus, Postpartido, FirmasEntry, BoulemaPlayer } from '../types'

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
  }
}

// ── PASSPORT UPLOAD ──────────────────────────────────────────

// El bucket 'attachments' es privado: getPublicUrl devuelve enlaces que dan 403.
// Usamos URLs firmadas de larga duración (10 años), válidas con bucket privado o público.
const SIGNED_URL_TTL = 10 * 365 * 24 * 60 * 60 // 10 años en segundos

async function uploadAndSign(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
  if (error) throw error
  const { data, error: signError } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (signError || !data?.signedUrl) {
    // Fallback por si el bucket es público
    return supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
  }
  return data.signedUrl
}

export async function uploadPassport(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  return uploadAndSign(`passports/${playerId}.${ext}`, file)
}

// ── CONTRACT PDF UPLOAD ─────────────────────────────────────

export async function uploadContractPdf(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  return uploadAndSign(`contracts/${playerId}_${Date.now()}.${ext}`, file)
}

// Un fallo a media carga dejaba la lista corta sin que nadie se enterase:
// ahora al menos queda en consola con cuántas filas se habían leído.
function logFetchError(tabla: string, error: unknown, leidas: number) {
  console.error(`[db] Fallo leyendo ${tabla} (se habían leído ${leidas} filas):`, error)
}

// ⚠ Supabase corta en 1000 filas SIN avisar. Cualquier lectura de una tabla
// que pueda crecer tiene que ir paginada. Esto lo hace en una línea:
//
//   const filas = await leerTodo('postpartidos', (desde, hasta) =>
//     supabase.from('postpartidos').select('*').order('created_at').range(desde, hasta))
//
// `consulta` recibe el rango y devuelve la petición ya montada.
const PAGINA = 1000
export async function leerTodo<T>(
  tabla: string,
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todo: T[] = []
  let desde = 0
  // Tope de seguridad: 200 páginas = 200.000 filas. Si se llega ahí es que
  // algo va mal (un bucle), no que haya tantos datos.
  for (let i = 0; i < 200; i++) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) { logFetchError(tabla, error, todo.length); throw error }
    const pagina = data ?? []
    todo.push(...pagina)
    if (pagina.length < PAGINA) return todo
    desde += PAGINA
  }
  logFetchError(tabla, new Error('demasiadas páginas'), todo.length)
  return todo
}

// ── PLAYERS ──────────────────────────────────────────────────

// ⚠ Supabase corta en 1000 filas SIN avisar: todo fetch de una tabla que
// pueda crecer va paginado (igual que fetchClubs o fetchScoutingPlayers)
export async function fetchPlayers(): Promise<Player[]> {
  const all: Player[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('players').select('*').order('name')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []).map(dbToPlayer)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function createPlayer(p: Player): Promise<Player> {
  const { data, error } = await supabase.from('players').insert(playerToDb(p)).select().single()
  if (error) throw error
  return dbToPlayer(data)
}

export async function updatePlayer(p: Player): Promise<void> {
  const { error } = await supabase.from('players').update(playerToDb(p)).eq('id', p.id)
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
  // Sets managerId as manager 1 (index 0), preserves manager 2 (index 1) if it exists
  const { data, error } = await supabase
    .from('players')
    .select('id, managed_by')
    .in('id', playerIds)
  if (error) throw error

  const updates = (data ?? []).map((row: Record<string, unknown>) => {
    const current: string[] = (row.managed_by as string[]) ?? []
    const manager2 = current[1] ?? null
    const updated = manager2 ? [managerId, manager2] : [managerId]
    return supabase.from('players').update({ managed_by: updated }).eq('id', row.id)
  })
  await Promise.all(updates)
}

// ── TASKS ────────────────────────────────────────────────────

function dbToTask(row: Record<string, unknown>): Task {
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
    label: (row.label as Task['label']) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) ?? undefined,
    comments: [],
    adminOnly: (row.admin_only as boolean) ?? false,
  }
}

export async function fetchTasks(playerId?: string): Promise<Task[]> {
  const all: Task[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    // Sin paginar, al pasar de 1000 tareas desaparecían las más antiguas
    // (van ordenadas por fecha de creación descendente)
    let q = supabase.from('tasks').select('*').order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (playerId) q = q.eq('player_id', playerId)
    const { data, error } = await q
    if (error) throw error
    const page = (data ?? []).map(dbToTask)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function createTask(t: Task): Promise<Task> {
  const isGeneral = !t.playerId || t.playerId === 'general'
  const { data, error } = await supabase.from('tasks').insert({
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
  }).select().single()
  if (error) throw error
  return dbToTask(data)
}

export async function updateTask(t: Task): Promise<void> {
  const isGeneral = !t.playerId || t.playerId === 'general'
  const { error } = await supabase.from('tasks').update({
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
  }).eq('id', t.id)
  if (error) throw error
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
      .eq('task_id', taskId).order('created_at').range(d, h))
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
  const { data, error } = await supabase
    .from('performance_notes')
    .select('*')
    .eq('player_id', playerId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(dbToNote)
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
    supabase.from('profiles').select('*').order('name').range(d, h))
}

export async function updateProfile(id: string, updates: { name?: string; avatar?: string; is_admin?: boolean; hidden_from_status?: boolean; captacion_only?: boolean }) {
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
    supabase.from('postpartidos').select('*').order('created_at', { ascending: false }).range(d, h))
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
    supabase.from('member_status').select('*').range(d, h))
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
  }
}

export async function fetchClubs(): Promise<Club[]> {
  const all: Club[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('clubs').select('*').order('name')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []).map(dbToClub)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function createClub(c: Omit<Club, 'id' | 'createdAt'>): Promise<Club> {
  const { data, error } = await supabase.from('clubs').insert({
    name: c.name,
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

export async function updateClub(c: Club): Promise<void> {
  const { error } = await supabase.from('clubs').update({
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
  }).eq('id', c.id)
  if (error) throw error
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
  const all: DistributionEntry[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    let q = supabase.from('distribution_entries').select('*').eq('active', true)
      .order('priority')
      .range(from, from + pageSize - 1)
    if (season) q = q.eq('season', season)
    const { data, error } = await q
    if (error) throw error
    const page = (data ?? []).map(dbToDistEntry)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
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
  const all: ClubNegotiation[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    let q = supabase.from('club_negotiations').select('*')
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (playerId) q = q.eq('player_id', playerId)
    if (clubId) q = q.eq('club_id', clubId)
    const { data, error } = await q
    if (error) throw error
    const page = (data ?? []).map(dbToNegotiation)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
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

export async function updateNegotiation(n: ClubNegotiation): Promise<void> {
  const { error } = await supabase.from('club_negotiations').update({
    need_position: n.needPosition ?? null,
    status: n.status,
    ais_manager: n.aisManager ?? null,
    notes: n.notes ?? null,
    updates: n.updates ?? [],
  }).eq('id', n.id)
  if (error) throw error
}

export async function deleteNegotiation(id: string): Promise<void> {
  const { error } = await supabase.from('club_negotiations').delete().eq('id', id)
  if (error) throw error
}

// ── SCOUTING / CAPTACIÓN ─────────────────────────────────────

function dbToScoutingPlayer(row: Record<string, unknown>): ScoutingPlayer {
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
  const all: ScoutingPlayer[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('scouting_players').select('*').order('full_name')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []).map(dbToScoutingPlayer)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function fetchScoutingReports(playerId?: string): Promise<ScoutingReport[]> {
  const all: ScoutingReport[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    let q = supabase.from('scouting_reports').select('*')
      .order('fecha', { ascending: false })
      .range(from, from + pageSize - 1)
    if (playerId) q = q.eq('player_id', playerId)
    const { data, error } = await q
    if (error) throw error
    const page = (data ?? []).map(dbToScoutingReport)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
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
  const { error } = await supabase.from('scouting_players').update({
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
  }).eq('id', p.id)
  if (error) throw error
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
    const all: ScoutingMatchPlayer[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('scouting_match_players')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) { logFetchError('scouting/partidos', error, all.length); return all }
      const page = (data ?? []).map(dbToMatchPlayer)
      all.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }
    return all
  } catch {
    return []
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
    const all: ScoutingMatchScout[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('scouting_match_scouts')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) { logFetchError('scouting/partidos', error, all.length); return all }
      const page = (data ?? []).map(dbToMatchScout)
      all.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }
    return all
  } catch {
    return []
  }
}

export async function addMatchScout(matchId: string, scout: string, viewMode?: 'campo' | 'video'): Promise<ScoutingMatchScout> {
  const { data, error } = await supabase.from('scouting_match_scouts')
    .upsert({ match_id: matchId, scout, view_mode: viewMode ?? null }, { onConflict: 'match_id,scout' })
    .select().single()
  if (error) throw error
  return dbToMatchScout(data)
}

/** Cómo vio ESE scout el partido: en el campo o por vídeo */
export async function setMatchScoutMode(matchId: string, scout: string, viewMode: 'campo' | 'video'): Promise<void> {
  const { error } = await supabase.from('scouting_match_scouts')
    .update({ view_mode: viewMode }).eq('match_id', matchId).eq('scout', scout)
  if (error) throw error
}

export async function removeMatchScout(matchId: string, scout: string): Promise<void> {
  const { error } = await supabase.from('scouting_match_scouts')
    .delete().eq('match_id', matchId).eq('scout', scout)
  if (error) throw error
}

export async function setMatchScoutStatus(matchId: string, scout: string, status: 'pendiente' | 'visto'): Promise<void> {
  const { error } = await supabase.from('scouting_match_scouts')
    .update({ status }).eq('match_id', matchId).eq('scout', scout)
  if (error) throw error
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

  // 2) postpartidos (la tabla puede no existir aún)
  try {
    await supabase.from('postpartidos')
      .update({ match_id: survivor.id }).in('match_id', victimIds)
  } catch { /* sin tabla postpartidos: nada que mover */ }

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
    const PAGE = 1000
    const all: ScoutingMatch[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('scouting_matches')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) { logFetchError('tabla opcional (¿migración pendiente?)', error, all.length); return all }
      const rows = (data ?? []).map(dbToScoutingMatch)
      all.push(...rows)
      if (rows.length < PAGE) break   // last page
      from += PAGE
    }
    return all
  } catch {
    return []
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
  const { error } = await supabase.from('scouting_matches').update({
    date: m.date,
    time: m.time ?? null,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    competition: m.competition ?? null,
    assigned_to: m.assignedTo ?? null,
    view_mode: m.viewMode ?? null,
    status: m.status ?? 'pendiente',
    notes: m.notes ?? null,
  }).eq('id', m.id)
  if (error) throw error
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
    signedAt: (row.signed_at as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
  }
}

export async function fetchFirmasEntries(): Promise<FirmasEntry[]> {
  // try/catch: la tabla puede no existir aún (migración pendiente) — la app no debe romper
  try {
    const all: FirmasEntry[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('captacion_firmas').select('*').order('sort_pos')
        .range(from, from + pageSize - 1)
      if (error) { logFetchError('tabla opcional (¿migración pendiente?)', error, all.length); return all }
      const page = (data ?? []).map(dbToFirmasEntry)
      all.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }
    return all
  } catch {
    return []
  }
}

export async function createFirmasEntry(e: Omit<FirmasEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FirmasEntry> {
  const { data, error } = await supabase.from('captacion_firmas').insert({
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
  }).select().single()
  if (error) throw error
  return dbToFirmasEntry(data)
}

export async function updateFirmasEntry(e: FirmasEntry): Promise<void> {
  const { error } = await supabase.from('captacion_firmas').update({
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
  }).eq('id', e.id)
  if (error) throw error
}

export async function deleteFirmasEntry(id: string): Promise<void> {
  const { error } = await supabase.from('captacion_firmas').delete().eq('id', id)
  if (error) throw error
}

// ── Boulema peticiones ───────────────────────────────────────

function dbToBoulemaPeticion(row: Record<string, unknown>): BoulemaPeticion {
  const rawFrom = (row.requested_from as string) ?? ''
  const rawIds  = (row.report_id as string) ?? ''
  return {
    id: row.id as string,
    playerName: row.player_name as string,
    position: (row.position as string) ?? undefined,
    birthYear: (row.birth_year as string) ?? undefined,
    birthMonth: (row.birth_month as string) ?? undefined,
    team: (row.team as string) ?? undefined,
    country: (row.country as string) ?? undefined,
    nationality: (row.nationality as string) ?? undefined,
    offeredBy: (row.offered_by as string) ?? undefined,
    requestedFrom: rawFrom ? rawFrom.split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: (row.notes as string) ?? undefined,
    requestedBy: row.requested_by as string,
    reportIds: rawIds ? rawIds.split(',').map(s => s.trim()).filter(Boolean) : [],
    createdAt: row.created_at as string,
  }
}

export async function fetchBoulemaPeticiones(): Promise<BoulemaPeticion[]> {
  const filas = await leerTodo<Record<string, unknown>>('boulema_peticiones', (d, h) =>
    supabase.from('boulema_peticiones').select('*').order('created_at', { ascending: false }).range(d, h))
  return filas.map(dbToBoulemaPeticion)
}

export async function createBoulemaPeticion(p: Omit<BoulemaPeticion, 'id' | 'createdAt'>): Promise<BoulemaPeticion> {
  const { data, error } = await supabase.from('boulema_peticiones').insert({
    player_name: p.playerName,
    position: p.position ?? null,
    birth_year: p.birthYear ?? null,
    birth_month: p.birthMonth ?? null,
    team: p.team ?? null,
    country: p.country ?? null,
    nationality: p.nationality ?? null,
    offered_by: p.offeredBy ?? null,
    requested_from: p.requestedFrom.join(','),
    notes: p.notes ?? null,
    requested_by: p.requestedBy,
    report_id: p.reportIds.join(',') || null,
  }).select().single()
  if (error) throw error
  return dbToBoulemaPeticion(data)
}

export async function updateBoulemaPeticion(p: BoulemaPeticion): Promise<void> {
  const { error } = await supabase.from('boulema_peticiones').update({
    player_name: p.playerName,
    position: p.position ?? null,
    birth_year: p.birthYear ?? null,
    birth_month: p.birthMonth ?? null,
    team: p.team ?? null,
    country: p.country ?? null,
    nationality: p.nationality ?? null,
    offered_by: p.offeredBy ?? null,
    requested_from: p.requestedFrom.join(','),
    notes: p.notes ?? null,
    requested_by: p.requestedBy,
    report_id: p.reportIds.join(',') || null,
  }).eq('id', p.id)
  if (error) throw error
}

export async function deleteBoulemaPeticion(id: string): Promise<void> {
  const { error } = await supabase.from('boulema_peticiones').delete().eq('id', id)
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
  const all: BoulemaPlayer[] = []
  const pageSize = 1000
  let from = 0
  try {
    while (true) {
      const { data, error } = await supabase.from('boulema_players').select('*').order('full_name')
        .range(from, from + pageSize - 1)
      if (error) { logFetchError('boulema_players', error, all.length); return all }
      const page = (data ?? []).map(dbToBoulemaPlayer)
      all.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }
    return all
  } catch (e) {
    logFetchError('boulema_players', e, all.length)
    return all
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
      .order('date', { ascending: false }).range(d, h))
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
  const { data, error } = await supabase
    .from('player_meetings')
    .select('*')
    .eq('player_id', playerId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(dbToMeeting)
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
  const { data, error } = await supabase
    .from('player_activities')
    .select('*')
    .eq('player_id', playerId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => dbToPlayerActivity(row as Record<string, unknown>))
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
  const { data, error } = await supabase
    .from('player_activities')
    .select('*')
    .or(`author_id.eq.${authorId},participant_profile_ids.cs.{${authorId}}`)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => dbToPlayerActivity(row as Record<string, unknown>))
}

// ── ZONAS DE CLUBES ──────────────────────────────────────────────────
// La app trae una clasificación por defecto (src/lib/zonas.ts). Aquí solo
// viven las correcciones hechas a mano y los clubes nuevos.

export interface ClubZona { club: string; nombre?: string; zona: string }

export async function fetchClubZonas(): Promise<ClubZona[]> {
  try {
    return await leerTodo<ClubZona>('zonas de clubes (¿migración pendiente?)', (d, h) =>
      supabase.from('scouting_club_zonas').select('club, nombre, zona').range(d, h))
  } catch {
    return []
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
    const all: Equipo[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('scouting_equipos').select('*')
        .order('nombre').range(from, from + PAGE - 1)
      if (error) { logFetchError('catálogo de equipos (¿migración pendiente?)', error, all.length); return all }
      const page = (data ?? []).map(r => dbToEquipo(r as Record<string, unknown>))
      all.push(...page)
      if (page.length < PAGE) break
      from += PAGE
    }
    return all
  } catch {
    return []
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
