export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
}

// ---- Club / loan situation ----
export interface PlayerClub {
  name: string;
  league?: string;
  country?: string;
  /**
   * principal  → club donde está registrado (normal)
   * cedido_en  → club donde juega actualmente en cesión (no es propietario)
   * propietario → club que tiene el contrato pero le ha cedido
   * compartido  → doble registro (juvenil + filial, filial + primer equipo, etc.)
   */
  type: "principal" | "cedido_en" | "propietario" | "compartido";
}

// ---- Task ----
export interface TaskAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64
  storagePath?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  attachments: TaskAttachment[];
}

/**
 * Tipos de tarea. ÚNICA lista: los <select> de tipo deben iterar TASK_LABELS, no copiarla.
 * Cada tipo tiene su propio cierre (qué se pregunta al completarla y qué deja):
 * ver lib/cierreTarea.ts. «General» y «Visita» se llaman ahora «Otra» y
 * «Comida/Visita»; las filas antiguas se leen ya con el nombre nuevo (db.ts).
 */
export const TASK_LABELS = ['Otra', 'Llamada', 'Reunión', 'Comida/Visita', 'Scouting', 'Distribución', 'Negociación', 'Administrativa', 'Seguimiento', 'Informe', 'Marketing', 'Comunicación', 'Videoanálisis', 'Postpartido'] as const
export type TaskLabel = typeof TASK_LABELS[number]

/**
 * Tareas «de contacto»: al completarlas la app pregunta qué pasó y lo deja
 * registrado como evento. A qué tipo de evento corresponde cada una
 * (Comida/Visita elige entre «Comida» y «Visita presencial» al cerrar).
 */
export const EVENTO_DE_TAREA: Partial<Record<TaskLabel, string>> = {
  'Llamada': 'Llamada', 'Reunión': 'Reunión', 'Comida/Visita': 'Visita presencial',
}

/**
 * Cierre de una tarea: lo que se contó al completarla y lo que dejó.
 * Lo escribe App.completarTarea (único camino para completar); las vistas
 * nunca ponen status = completada por su cuenta. Ver migration_tasks_cierre.sql.
 */
export interface TaskCierre {
  /** Resultado tipado según el tipo: contesto | no_contesto | celebrada | no_celebrada | acordado | seguir | … */
  resultado?: string
  /** Nota de cierre (recap, lo que se acordó, enlace…) */
  nota?: string
  /** ids de lo que el cierre dejó, para enlazarlo desde la tarea */
  ref?: {
    eventoId?: string
    activityId?: string
    videoSessionId?: string
    postpartidoId?: string
    /** Tarea creada como siguiente paso */
    siguienteTaskId?: string
  }
}

export interface Task {
  id: string;
  playerId: string;
  title: string;
  description: string;
  assigneeId: string;
  watchers?: string[];        // up to 2 additional encargados
  dependsOnId?: string;
  status: "pendiente" | "en_progreso" | "completada";
  priority: "alta" | "media" | "baja";
  label?: TaskLabel;          // optional task type tag
  dueDate?: string;           // optional
  createdAt: string;
  completedAt?: string;       // ISO — se rellena al pasar a "completada"
  comments: TaskComment[];
  adminOnly?: boolean;        // si true, solo visible para admins
  /** Jugador de Captación al que se refiere la tarea (scouting_players.id). Opcional hasta migrar. */
  scoutingPlayerId?: string;
  /** Se repite: al completarla se crea la siguiente (ver lib/recurrencia.ts). Opcional hasta migrar. */
  recurrence?: 'semanal' | 'mensual';
  /** Qué pasó al completarla y qué dejó (solo en completadas). Opcional hasta migrar. */
  cierre?: TaskCierre;
  /** Subtipo según el tipo (lib/tiposTarea.ts): renovación, informe de partido, sesión… Opcional hasta migrar. */
  subtipo?: string;
  /** Ofrecimiento al que se refiere (tareas Informe sobre un jugador ofrecido). Opcional hasta migrar. */
  ofrecimientoId?: string;
}

// ---- Contracts ----
export interface RepresentationContract {
  start: string;
  end: string;
  notes?: string;
}

export interface ClubContract {
  endDate: string;
  optionalYears?: number;   // e.g. "+2 años opcionales"
  releaseClause?: string;
  bonuses?: string;
  agentCommission?: string;
  notes?: string;
}

// ---- Performance ----
export interface PerformanceNote {
  id: string;
  date: string;
  authorId: string;
  category: string;
  rating: number;
  content: string;
  title?: string;
}

// ---- Player activity event (unified chronological log) ----
export interface PlayerActivity {
  id: string
  playerId: string
  date: string        // "YYYY-MM-DD"
  type: string        // predefined or custom: "Comunicación con club", "Reunión con jugador", etc.
  notes?: string
  authorId?: string
  createdAt: string
  groupId?: string                 // shared UUID linking rows of the same multi-player event
  linkedPlayerIds?: string[]       // all player IDs in the group (including self), for display
  participantProfileIds?: string[] // staff profile IDs who were present at the event
}

// ---- Club communication log (legacy — kept for DB compatibility) ----
export interface ClubLog {
  id: string
  playerId: string
  date: string
  clubName: string
  notes: string
  authorId?: string
  createdAt: string
}

// ---- Player meeting (legacy — kept for DB compatibility) ----
export interface PlayerMeeting {
  id: string
  playerId: string
  date: string
  notes?: string
  authorId?: string
  createdAt: string
}

// ---- Match report ----
export interface MatchReport {
  id: string;
  date: string;                  // "YYYY-MM-DD"
  opponent: string;
  competition: string;           // Liga, Copa, Champions, Amistoso, etc.
  venue: "local" | "visitante";
  role: "titular" | "suplente" | "no_convocado";
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCard: boolean;
  rating?: number;               // 1-10
  notes?: string;
}

// ---- Video analysis session ----
export interface VideoSession {
  id: string;
  date: string;                  // "YYYY-MM-DD"
  videoUrl: string;
  description: string;
  duration?: number;             // minutes
  time?: string;                 // "HH:MM", opcional: sale en el calendario a esa hora
  lugar?: string;                // dónde es la sesión, opcional
  responsableId?: string;        // (antiguo) un solo encargado. Sustituido por `participantes`
  /** Qué servicio es: sesion | video | recurso | entrenamiento | informe_datos. Sin valor = sesion (ver lib/serviciosAnalisis.ts) */
  tipo?: string;
  /** Título corto. `description` queda para el detalle. Los antiguos solo tienen description. */
  titulo?: string;
  /** profiles.id de las personas del equipo que han participado */
  participantes?: string[];
}

// ---- Club interest / market info ----
export interface ClubInterest {
  id: string;
  clubName: string;
  date: string;           // "YYYY-MM-DD"
  type: "interés" | "oferta" | "rumor" | "negociación";
  details: string;
  source?: string;        // who reported it
}

// ---- Player link ----
export interface PlayerLink {
  id: string;
  label: string;   // e.g. "Vídeo highlight", "Streamable", "Instagram"
  url: string;
}

// ---- Player personal info ----
export interface PlayerInfo {
  family: string;
  personality: string;
  phone?: string;
  passportUrl?: string; // Supabase Storage path
}

// ---- Player ----

/**
 * Estado de la relación con el jugador. Es otra cosa que hiddenFromManagement,
 * que significa «este no es nuestro, es de intermediación».
 *   activo    → lo gestionamos nosotros, el día a día es nuestro
 *   inactivo  → nos ha dejado, o el contrato de representación ha vencido
 *   partner   → el día a día lo lleva el partner, no nosotros
 * Ver migration_player_estado.sql. Mientras no se ejecute, todos son activo.
 */
export const PLAYER_ESTADOS = ['activo', 'inactivo', 'partner'] as const
export type PlayerEstado = typeof PLAYER_ESTADOS[number]

/** Prioridad del jugador para nosotros (migration_player_prioridad.sql). Sin valor = sin asignar. */
export const PLAYER_PRIORIDADES = ['A', 'B', 'C'] as const
export type PlayerPrioridad = typeof PLAYER_PRIORIDADES[number]

export interface Player {
  id: string;
  name: string;
  birthDate: string;          // "YYYY-MM-DD"
  positions: string[];         // [primary, secondary?]
  foot?: "derecho" | "izquierdo" | "ambidiestro";
  nationality: string;
  photo: string;
  clubs: PlayerClub[];         // one or more current clubs
  partner?: string;            // partner interno responsable
  managedBy: string[];         // team member ids (encargados)
  hiddenFromManagement?: boolean;  // true = solo distribución (intermediar)
  /** Partner externo que ha traído al jugador (undefined = es nuestro). No confundir con `partner`. */
  partnerOrigen?: string;
  /** Jugador nuestro que los partners externos pueden ver (ficha reducida) y mover */
  sharedWithPartners?: boolean;
  /** activo | inactivo | partner. Sin migrar, o sin valor, se trata como activo. */
  estado?: PlayerEstado;
  /** A | B | C. Vacío = sin prioridad asignada. */
  prioridad?: PlayerPrioridad;
  representationContract: RepresentationContract;
  clubContract: ClubContract;
  contractHistory: { club: string; period: string; type: string }[];
  clubInterests: ClubInterest[];
  performance: PerformanceNote[];
  matchReports: MatchReport[];
  videoSessions: VideoSession[];
  info: PlayerInfo;
  transfermarktUrl?: string;   // URL del perfil en Transfermarkt
  links: PlayerLink[];         // enlaces adicionales (vídeos, redes, etc.)
  /** Control de conflictos: el updated_at leído; se manda al guardar (ver db.ts). Opcional hasta migrar. */
  updatedAt?: string;
}

// ── DISTRIBUTION ────────────────────────────────────────────

export interface ClubNeed {
  position: string
  ageMax?: number
  transferBudget?: string   // "400k", "2M", etc.
  salaryBudget?: string
  notes?: string
  createdAt?: string        // ISO timestamp of when this need was added
  addedBy?: string          // avatar/initials of the user who added it
}

export interface Club {
  id: string
  name: string
  /** Temporada de Distribución a la que pertenece esta ficha (p. ej. "2026-27") */
  season: string
  league?: string
  country: string
  contactPerson?: string
  aisManager?: string       // initials: "PP", "BGF", etc.
  notes?: string
  isPriority: boolean
  needs: ClubNeed[]
  createdAt: string
  /** Tick "contactado": independiente de negociaciones/solicitudes */
  contacted?: boolean
  contactedBy?: string      // avatar de quien lo marcó
  contactedAt?: string      // ISO timestamp
  /** Control de conflictos: el updated_at leído; se manda al guardar (ver db.ts). Opcional hasta migrar. */
  updatedAt?: string
}

export interface DistributionEntry {
  id: string
  playerId: string
  season: string
  priority: 'A' | 'B' | 'C' | 'D'
  condition?: string        // "Libre", "Traspaso", "Cesión", "Cesión/Traspaso"
  transferFee?: string
  notes?: string
  aisManager?: string       // profile.avatar of the person responsible for distributing this player
  active: boolean
  createdAt: string
}

export interface ClubNegotiationUpdate {
  id: string
  text: string
  date: string     // ISO timestamp
  author?: string  // avatar/initials
}

export interface ClubNegotiation {
  id: string
  playerId: string
  clubId: string
  needPosition?: string   // petición concreta a la que va ligada esta negociación
  status: 'pendiente' | 'ofrecido' | 'interesado' | 'negociando' | 'cerrado' | 'descartado'
  aisManager?: string
  notes?: string
  updates?: ClubNegotiationUpdate[]
  createdAt: string
  updatedAt: string
}

// ── SCOUTING / CAPTACIÓN ────────────────────────────────────

export type ScoutingAssessment = 'Visto' | 'Seguir' | 'Llamar' | 'Basque' | 'Descartado' | 'Decidir'

export interface ScoutingPlayer {
  id: string
  fullName: string
  position1?: string
  position2?: string
  birthdate?: string        // "YYYY-MM-DD"
  foot?: string
  team?: string
  assessment?: ScoutingAssessment
  assessmentUpdatedAt?: string  // ISO — se rellena al cambiar el assessment
  candidateSeenCount?: number   // nº de informes «Llamar» cuando un admin lo ocultó de Candidatos
  candidateSeenAt?: string      // ISO — cuándo se ocultó
  nationality?: string
  nationalTeam?: string
  agency?: string
  clubContract?: string     // "30/06/2027"
  marketMap?: boolean       // en el campograma de mercado (pestaña Fin de contrato)
  contacto?: string
  categoria?: string
  segundaCategoria?: string
  comentarios?: string
  createdAt: string
}

export interface ScoutingReport {
  id: string
  playerId: string
  fecha?: string            // ISO datetime string
  titulo?: string
  texto?: string
  persona?: string          // "NB", "PP", "RP", "AV"
  conclusion?: string       // "Seguir", "Firmar", "Descartar"
  matchId?: string          // partido en el que fue visto (opcional)
  authorId?: string
  createdAt: string
}

// ── Informes que NO son de partido (tabla scouting_infos) ──────────
// Van aparte de ScoutingReport a propósito: «informe» en el resto de la app
// significa «informe de partido» y sus filas se cuentan en Conclusiones, el
// modelo de predicción, las estadísticas por scout y el informe mensual.
// Ver migration_scouting_infos.sql.

export type ScoutingInfoTipo = 'personalidad' | 'contractual' | 'mercado'

export interface ScoutingInfo {
  id: string
  playerId: string
  tipo: ScoutingInfoTipo
  fecha?: string            // ISO datetime string
  texto?: string
  persona?: string          // avatar del que lo escribe
  authorId?: string
  // personalidad · entorno
  fuente?: string
  semaforo?: 'verde' | 'ambar' | 'rojo'
  // contractual
  finContrato?: string
  salario?: string
  clausula?: string
  fiabilidad?: 'alta' | 'media' | 'baja'
  // mercado
  club?: string
  quien?: string
  interes?: 'alto' | 'medio' | 'bajo' | 'descartado'
  createdAt: string
}

export interface ScoutingMatchPlayer {
  id: string
  matchId: string
  playerId: string
  createdAt: string
}

/** Jugador NUESTRO (tabla players) asignado a mano a un partido de Captación (Planificación) */
export interface ScoutingMatchOurPlayer {
  id: string
  matchId: string
  playerId: string
  createdAt: string
}

/** Scout asignado a un partido. Un partido puede tener varios. */
export interface ScoutingMatchScout {
  id: string
  matchId: string
  scout: string                        // iniciales del perfil (profiles.avatar)
  status: 'pendiente' | 'visto'        // estado de ESE scout, no del partido
  viewMode?: 'campo' | 'video'         // cómo lo vio ESE scout (campo o vídeo)
  createdAt: string
}

// ── OFRECIMIENTOS ───────────────────────────────────────────
// Jugadores que nos ofrece alguien de fuera (agente, club, familia,
// Boulema…). Sustituye a las antiguas «peticiones de Boulema»: misma ficha
// ligera, pero con responsable, condiciones pedidas, cadena de informes por
// niveles y contactos con quien lo ofrece. Ver migration_ofrecimientos.sql.

export type OfrecimientoOrigen = 'boulema' | 'agente' | 'intermediario' | 'club' | 'familia' | 'otro'
export type OfrecimientoOperacion = 'libre' | 'cesion' | 'traspaso' | 'representacion'
/** abierto = nuevo o en informes (se distingue por si hay niveles) */
export type OfrecimientoEstado = 'abierto' | 'decidir' | 'aceptado' | 'descartado'
/** técnico = informe de partido (scouting_reports); el resto, scouting_infos */
export type TipoInformePedido = 'tecnico' | 'entorno' | 'mercado' | 'personalidad'
export type PasoVeredicto = 'pendiente' | 'ok' | 'no' | 'mas'

/** Una persona a la que se le ha pedido un informe dentro de un nivel */
export interface OfrecimientoPaso {
  avatar: string              // profiles.avatar
  tipo: TipoInformePedido
  veredicto: PasoVeredicto
  reportId?: string           // scouting_reports.id (técnico)
  infoId?: string             // scouting_infos.id (entorno/mercado/personalidad)
  respondidoAt?: string       // ISO
  comentario?: string         // nota corta para el responsable
}

export interface OfrecimientoNivel {
  n: number                   // 1, 2, 3…
  pedidoPor: string           // avatar
  pedidoAt: string            // ISO
  mensaje?: string
  pasos: OfrecimientoPaso[]
}

export interface Ofrecimiento {
  id: string
  playerName: string
  position?: string
  birthYear?: string
  birthMonth?: string         // "1"–"12"
  team?: string
  country?: string
  nationality?: string
  scoutingPlayerId?: string   // ficha de Captación, si existe
  origen: OfrecimientoOrigen
  ofreceNombre?: string
  ofreceContacto?: string
  condOperacion?: OfrecimientoOperacion
  condCoste?: string
  condSalario?: string
  condComision?: string
  condFinContrato?: string
  fechaLimite?: string        // "YYYY-MM-DD"
  notes?: string
  responsable?: string        // avatar
  estado: OfrecimientoEstado
  decididoPor?: string
  decididoAt?: string
  decisionNota?: string
  niveles: OfrecimientoNivel[]
  /** Contactos con quien lo ofrece: mismo formato que el historial de Firmar */
  contactos: FirmasComment[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// Jugador de Boulema (mantenimiento light — réplica ligera del nuestro)
export interface BoulemaPlayer {
  id: string
  fullName: string
  birthYear?: string
  position?: string
  team?: string
  country?: string
  nationality?: string
  contacto?: string
  manager?: string      // avatar del encargado en AIS
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ScoutingMatch {
  id: string
  date: string              // "YYYY-MM-DD"
  time?: string             // "HH:MM", opcional
  homeTeam: string
  awayTeam: string
  competition?: string
  assignedTo?: string       // persona initials, e.g. "NB"
  viewMode?: 'video' | 'campo'
  status?: 'pendiente' | 'visto'
  notes?: string
  createdAt: string
}

// ── CAPTACIÓN · FIRMAR (pipeline de firmas, ex-Trello) ──────
// Jugadores en proceso de captación activa (conseguir la firma),
// organizados por zona geográfica y estatus de contacto.

export type FirmasStatus = 'llamar' | 'caliente' | 'templado' | 'frio' | 'decidir' | 'firmado'

/** Tipo de apunte en el historial: nota libre, contacto tipado o cambio de estatus (automático) */
export type FirmasCommentKind = 'nota' | 'llamada' | 'whatsapp' | 'reunion' | 'entorno' | 'estatus' | 'telefono'

export interface FirmasComment {
  id: string
  text: string
  date: string        // ISO timestamp
  author?: string     // nombre visible (importado de Trello o del perfil)
  authorId?: string   // profiles.id si el autor es un usuario de la app
  kind?: FirmasCommentKind   // sin valor = nota (comentarios importados de Trello)
  outcome?: 'contesto' | 'no_contesto'  // resultado rápido en llamada/whatsapp
  /** Apunte que nace de un evento de agenda (reunión, visita…): su id */
  eventoId?: string
  /** Reuniones: pendiente de cerrar (recap + siguiente paso) o ya cerrada */
  cierre?: 'pendiente' | 'cerrada'
}

export interface FirmasEntry {
  id: string
  playerName: string
  zone: string                 // área geográfica (texto libre)
  status: FirmasStatus
  scoutingPlayerId?: string    // vínculo con scouting_players
  managers: string[]           // profiles.id de los encargados
  notes?: string
  comments: FirmasComment[]
  trelloUrl?: string           // tarjeta original de Trello (import)
  sortPos: number
  statusUpdatedAt?: string
  nextAction?: string          // próxima acción ("Llamar", "Reunión"…)
  nextActionKind?: string      // tipo: llamada/whatsapp/reunion/entorno/nota — coherente con el historial
  knownTeam?: string           // último club conocido del vinculado (para avisar de cambios de club)
  nextActionTaskId?: string    // tarea real del tablero generada por la próxima acción (sync bidireccional)
  nextActionDate?: string      // "YYYY-MM-DD"
  nextActionAssignee?: string  // profiles.id
  /** Acción de tipo Reunión: el evento de agenda que la representa (hora, lugar, asistentes, cierre) */
  nextActionEventoId?: string
  signedAt?: string            // ISO — cuándo pasó a «firmado»
  /** Marcado a mano como jugador de techo alto: filtro en el pipeline para seguir a los top de cada zona */
  potencialTop?: boolean
  createdAt: string
  updatedAt: string
}

// ── POSTPARTIDOS ────────────────────────────────────────────
// Informe postpartido: partido (Captación) + jugador (nuestro o texto
// libre) + responsable. La tarea asociada (taskId) lleva el estado.
export interface Postpartido {
  id: string
  matchId?: string       // ScoutingMatch.id
  playerId?: string      // jugador de mantenimiento…
  playerName?: string    // …o "otro" en texto libre
  assigneeId?: string    // profile.id del responsable
  taskId?: string        // tarea generada en el tablero
  notes?: string
  videoUrl?: string      // link (Streamable) — obligatorio al completar
  createdAt: string
}

// ── EVENTOS DE AGENDA ───────────────────────────────────────
// Citas, reuniones, videollamadas, sesiones de análisis… con o sin jugador,
// de Mantenimiento, de Captación o generales. Tabla agenda_eventos (ver
// migration_agenda_eventos.sql). Si llevan jugadores de Mantenimiento se
// apuntan además en su actividad (player_activities), como siempre.
export const EVENTO_TIPOS = [
  'Reunión', 'Videollamada', 'Cita', 'Llamada', 'Sesión de análisis', 'Partido', 'Visita presencial',
  'Comida', 'Viaje', 'Reunión con jugador', 'Comunicación con club', 'Email', 'Transferencia', 'Nota general',
] as const
export type EventoAmbito = 'mantenimiento' | 'captacion' | 'general'

export interface AgendaEvento {
  id: string
  titulo: string
  tipo: string                 // uno de EVENTO_TIPOS o texto libre
  fecha: string                // "YYYY-MM-DD" (puede ser pasada: registrar algo que ya ocurrió)
  hora?: string                // "HH:MM"
  ambito: EventoAmbito
  playerIds: string[]          // jugadores de Mantenimiento
  scoutingPlayerId?: string    // jugador de Captación
  participantIds: string[]     // profiles.id de quienes asisten (además del autor)
  notas?: string
  lugar?: string               // dónde es (reuniones, visitas, comidas…). En un viaje, la ciudad de destino.
  /** Viajes: último día (AAAA-MM-DD). Sin valor = evento de un solo día. */
  fechaFin?: string
  /** Viajes: zona geográfica del destino (lib/zonas.ts), para sugerir a quién visitar */
  zona?: string
  authorId?: string
  /** id (o group_id) de las filas de player_activities que generó, para no contarlo dos veces */
  activityRef?: string
  /** Tarea de la que nace (una llamada o reunión que era tarea y se completó). Opcional hasta migrar. */
  taskId?: string
  /** Cierre de la reunión (migration_agenda_eventos_cierre.sql): qué salió y quién lo apuntó */
  recap?: string
  cerradoAt?: string           // ISO
  cerradoPor?: string          // profiles.id
  createdAt: string
}

// ── ESTADO DEL EQUIPO (panel "¿con qué está cada uno?") ─────
export interface MemberStatus {
  profileId: string
  locationType?: string      // 'Oficina' | 'Casa' | 'Viaje' | 'Partido' | 'Vacaciones' | libre
  locationDetail?: string    // ciudad, club… (opcional)
  currentTaskId?: string     // tarea en curso (de sus tareas abiertas)
  eventNote?: string         // evento de hoy, texto libre
  note?: string              // nota libre "¿en qué estás?"
  updatedAt: string
}

// ---- Helpers ----
export function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function clubsLabel(clubs: PlayerClub[]): string {
  if (clubs.length === 0) return "—";
  if (clubs.length === 1) return clubs[0].name;
  // loan case
  const owner = clubs.find((c) => c.type === "propietario");
  const loan = clubs.find((c) => c.type === "cedido_en");
  if (owner && loan) return `${loan.name} (cedido · prop. ${owner.name})`;
  // dual registration
  return clubs.map((c) => c.name).join(" / ");
}
