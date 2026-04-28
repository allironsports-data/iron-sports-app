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
  dueDate?: string;           // optional
  createdAt: string;
  comments: TaskComment[];
  adminOnly?: boolean;        // si true, solo visible para admins
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
  league?: string
  country: string
  contactPerson?: string
  aisManager?: string       // initials: "PP", "BGF", etc.
  notes?: string
  isPriority: boolean
  needs: ClubNeed[]
  createdAt: string
}

export interface DistributionEntry {
  id: string
  playerId: string
  season: string
  priority: 'A' | 'B' | 'C'
  condition?: string        // "Libre", "Traspaso", "Cesión", "Cesión/Traspaso"
  transferFee?: string
  notes?: string
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
  nationality?: string
  nationalTeam?: string
  agency?: string
  clubContract?: string     // "30/06/2027"
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
  conclusion?: string       // "Seguir", "Descartar", "Firmar", "Decidir"
  authorId?: string
  createdAt: string
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
