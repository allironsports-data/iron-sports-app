import { UserRound, FileSignature, MessagesSquare } from 'lucide-react'
import type { ScoutingInfoTipo } from '../../types'

// ── Los tres tipos de informe que no son de partido ──────────────────
// En archivo aparte de InfosSection.tsx porque Vite Fast Refresh solo
// funciona si un archivo de componentes exporta únicamente componentes.

export const TIPO_CONFIG: Record<ScoutingInfoTipo, {
  label: string; corto: string; icon: typeof UserRound; texto: string; borde: string; fondo: string
}> = {
  personalidad: { label: 'Personalidad y entorno', corto: 'Personalidad', icon: UserRound,     texto: 'text-violet-700',  borde: 'border-l-violet-400',  fondo: 'bg-violet-50' },
  contractual:  { label: 'Contractual',            corto: 'Contractual',  icon: FileSignature, texto: 'text-emerald-700', borde: 'border-l-emerald-400', fondo: 'bg-emerald-50' },
  mercado:      { label: 'Opinión del mercado',    corto: 'Mercado',      icon: MessagesSquare, texto: 'text-sky-700',    borde: 'border-l-sky-400',     fondo: 'bg-sky-50' },
}

export const TIPOS: ScoutingInfoTipo[] = ['personalidad', 'contractual', 'mercado']
