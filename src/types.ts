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

// ---- Club interest / market info ----
export interface ClubInterest {
  id: string;
  clubName: string;
  date: string;           // "YYYY-MM-DD"
  type: "interés" | "oferta" | "rumor" | "negociación";
  details: string;
  source?: string;        // who reported it
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
  nationality: string;
  photo: string;
  clubs: PlayerClub[];         // one or more current clubs
  partner?: string;            // partner interno responsable
  managedBy: string[];         // team member ids (encargados)
  representationContract: RepresentationContract;
  clubContract: ClubContract;
  contractHistory: { club: string; period: string; type: string }[];
  clubInterests: ClubInterest[];
  performance: PerformanceNote[];
  info: PlayerInfo;
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
