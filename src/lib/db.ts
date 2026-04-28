import { supabase } from './supabase'
import type { Player, Task, TaskComment, PerformanceNote, ClubInterest, PlayerLink, MatchReport, VideoSession, Club, DistributionEntry, ClubNegotiation, ScoutingPlayer, ScoutingReport } from '../types'

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

export async function uploadPassport(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `passports/${playerId}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

// ── CONTRACT PDF UPLOAD ─────────────────────────────────────

export async function uploadContractPdf(playerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `contracts/${playerId}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

// ── PLAYERS ──────────────────────────────────────────────────

export async function fetchPlayers(): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(dbToPlayer)
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
    dueDate: (row.due_date as string) ?? undefined,
    createdAt: row.created_at as string,
    comments: [],
    adminOnly: (row.admin_only as boolean) ?? false,
  }
}

export async function fetchTasks(playerId?: string): Promise<Task[]> {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (playerId) q = q.eq('player_id', playerId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(dbToTask)
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
    due_date: t.dueDate || null,
    admin_only: t.adminOnly ?? false,
  }).select().single()
  if (error) throw error
  return dbToTask(data)
}

export async function updateTask(t: Task): Promise<void> {
  const { error } = await supabase.from('tasks').update({
    title: t.title,
    description: t.description,
    assignee_id: t.assigneeId || null,
    watchers: t.watchers ?? [],
    depends_on_id: t.dependsOnId || null,
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate || null,
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
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, task_attachments(*)')
    .eq('task_id', taskId)
    .order('created_at')
  if (error) throw error
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
  }).select().single()
  if (error) throw error
  return dbToNote(data)
}

// ── PROFILES ─────────────────────────────────────────────────

export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function updateProfile(id: string, updates: { name?: string; avatar?: string; is_admin?: boolean }) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) throw error
}

export async function inviteUser(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
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
    active: (row.active as boolean) ?? true,
    createdAt: row.created_at as string,
  }
}

export async function fetchDistributionEntries(season?: string): Promise<DistributionEntry[]> {
  let q = supabase.from('distribution_entries').select('*').eq('active', true).order('priority')
  if (season) q = q.eq('season', season)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(dbToDistEntry)
}

export async function createDistributionEntry(e: Omit<DistributionEntry, 'id' | 'createdAt'>): Promise<DistributionEntry> {
  const { data, error } = await supabase.from('distribution_entries').insert({
    player_id: e.playerId,
    season: e.season,
    priority: e.priority,
    condition: e.condition ?? null,
    transfer_fee: e.transferFee ?? null,
    notes: e.notes ?? null,
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
    status: (row.status as ClubNegotiation['status']) ?? 'ofrecido',
    aisManager: (row.ais_manager as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    updates: (row.updates as ClubNegotiation['updates']) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function fetchNegotiations(playerId?: string, clubId?: string): Promise<ClubNegotiation[]> {
  let q = supabase.from('club_negotiations').select('*').order('updated_at', { ascending: false })
  if (playerId) q = q.eq('player_id', playerId)
  if (clubId) q = q.eq('club_id', clubId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(dbToNegotiation)
}

export async function createNegotiation(n: Omit<ClubNegotiation, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClubNegotiation> {
  const { data, error } = await supabase.from('club_negotiations').insert({
    player_id: n.playerId,
    club_id: n.clubId,
    status: n.status,
    ais_manager: n.aisManager ?? null,
    notes: n.notes ?? null,
  }).select().single()
  if (error) throw error
  return dbToNegotiation(data)
}

export async function updateNegotiation(n: ClubNegotiation): Promise<void> {
  const { error } = await supabase.from('club_negotiations').update({
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
    nationality: (row.nationality as string) ?? undefined,
    nationalTeam: (row.national_team as string) ?? undefined,
    agency: (row.agency as string) ?? undefined,
    clubContract: (row.club_contract as string) ?? undefined,
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
    nationality: p.nationality ?? null,
    national_team: p.nationalTeam ?? null,
    agency: p.agency ?? null,
    club_contract: p.clubContract ?? null,
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
    nationality: p.nationality ?? null,
    national_team: p.nationalTeam ?? null,
    agency: p.agency ?? null,
    club_contract: p.clubContract ?? null,
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
    author_id: r.authorId ?? null,
  }).select().single()
  if (error) throw error
  return dbToScoutingReport(data)
}

export async function deleteScoutingReport(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_reports').delete().eq('id', id)
  if (error) throw error
}
