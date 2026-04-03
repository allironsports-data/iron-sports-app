import { supabase } from './supabase'
import type { Player, Task, TaskComment, PerformanceNote } from '../types'

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
    info: p.info,
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

  const updates = (data ?? []).map((row) => {
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
    playerId: row.player_id as string,
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
  const { data, error } = await supabase.from('tasks').insert({
    player_id: t.playerId,
    title: t.title,
    description: t.description,
    assignee_id: t.assigneeId || null,
    watchers: t.watchers ?? [],
    depends_on_id: t.dependsOnId || null,
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate || null,
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
  return (data ?? []).map((row) => ({
    ...dbToComment(row),
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
