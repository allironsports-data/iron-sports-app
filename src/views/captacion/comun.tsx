import React, { useState } from 'react'
import { X, Trash2, Calendar, Pencil } from 'lucide-react'
import type { ScoutingReport, ScoutingAssessment } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { type ShowToast, type ConclusionOption, ASSESSMENT_CONFIG, normConclusion, CONCLUSION_OPTIONS, CONCLUSION_STYLE, fmtDate, personaToName } from './helpers'

// ── Captación · componentes pequeños compartidos ──

// ── Sub-components ───────────────────────────────────────────

export function AssessmentChip({ a, small }: { a?: ScoutingAssessment; small?: boolean }) {
  if (!a) return <span className="text-slate-300 text-xs">—</span>
  const cfg = ASSESSMENT_CONFIG[a]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'text-[11px] px-1' : ''}`}>
      {cfg.label}
    </span>
  )
}

export function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-2">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-medium text-slate-700 mt-0.5 truncate">{value}</div>
    </div>
  )
}

export function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

// ── Chips de filtros activos ─────────────────────────────────
export type FilterChip = { key: string; label: string; onRemove: () => void }
export function ActiveFilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Filtros:</span>
      {chips.map(c => (
        <button
          key={c.key}
          onClick={c.onRemove}
          aria-label={`Quitar filtro ${c.label}`}
          className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/20 transition-colors"
        >
          {c.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 px-1.5 py-1.5 sm:py-0.5"
      >
        Limpiar filtros
      </button>
    </div>
  )
}

// ── ReportCard ───────────────────────────────────────────────

export function ReportCard({
  report,
  profiles,
  currentProfile,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onUpdate,
  playerName,
  matchLabel,
  showToast,
  onEditingChange,
}: {
  report: ScoutingReport
  profiles: Profile[]
  currentProfile: Profile
  confirmDeleteId: string | null
  onConfirmDelete: (id: string | null) => void
  onDelete: (id: string) => Promise<void>
  onUpdate?: (r: ScoutingReport) => Promise<void>
  playerName?: string
  matchLabel?: string   // e.g. "Real Madrid vs Barça · 12 Mar '25"
  showToast?: ShowToast
  onEditingChange?: (editing: boolean) => void
}) {
  const isConfirming = confirmDeleteId === report.id
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState(report.titulo ?? '')
  const [editText, setEditText] = useState(report.texto ?? '')
  // ¿La conclusión guardada es una de las opciones editables? Si no (p.ej. «Más video, prioritario»
  // de Boulema o «Decidir» legado), al guardar solo texto hay que conservarla en vez de mandar null.
  const known = (CONCLUSION_OPTIONS as readonly string[]).includes(normConclusion(report.conclusion) ?? '')
  const initialConclusion: ConclusionOption =
    known ? (normConclusion(report.conclusion) ?? '') as ConclusionOption : ''
  const [editConclusion, setEditConclusion] = useState<ConclusionOption>(initialConclusion)
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const authorName = personaToName(report.persona, profiles)

  function setEditing(v: boolean) {
    setEditMode(v)
    onEditingChange?.(v)
  }

  // ¿Hay cambios sin guardar respecto al estado inicial?
  const isDirty =
    editTitle !== (report.titulo ?? '') ||
    editText !== (report.texto ?? '') ||
    editConclusion !== initialConclusion

  function discardEdit() {
    setEditTitle(report.titulo ?? '')
    setEditText(report.texto ?? '')
    setEditConclusion(initialConclusion)
    setConfirmDiscard(false)
    setEditing(false)
  }

  function requestCloseEdit() {
    if (isDirty) setConfirmDiscard(true)
    else discardEdit()
  }

  useEscapeKey(requestCloseEdit, editMode && !confirmDiscard)

  async function handleSaveEdit() {
    if (!onUpdate || !editText.trim() || saving) return
    setSaving(true)
    try {
      const updated: ScoutingReport = {
        ...report,
        titulo: editTitle.trim() || undefined,
        texto: editText.trim() || undefined,
        // Si la conclusión original no es editable, se conserva tal cual; updateScoutingReport manda undefined → null
        conclusion: known ? (editConclusion || undefined) : report.conclusion,
      }
      await onUpdate(updated)
      setEditing(false)
      showToast?.('Informe actualizado')
    } catch {
      showToast?.('Error al guardar el informe', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (editMode) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-2">
        <ConfirmModal
          open={confirmDiscard}
          title="¿Descartar cambios?"
          message="Has modificado el informe. Si cierras ahora se perderán los cambios."
          confirmLabel="Descartar"
          variant="danger"
          onConfirm={discardEdit}
          onCancel={() => setConfirmDiscard(false)}
        />
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Editando informe</span>
          <button onClick={requestCloseEdit} aria-label="Cerrar edición" className="text-slate-400 hover:text-slate-600 p-2 -m-2 sm:p-0 sm:m-0"><X className="w-3.5 h-3.5" /></button>
        </div>
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder="Título (opcional)"
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={5}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
        />
        <select
          value={editConclusion}
          onChange={e => setEditConclusion(e.target.value as ConclusionOption)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">Sin conclusión</option>
          {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {!editText.trim() && (
          <p className="text-[11px] text-red-500">El informe no puede estar vacío.</p>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={requestCloseEdit} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={saving || !editText.trim()}
            className="flex-1 py-1.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {saving && <Spinner />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {playerName && (
            <div className="text-[11px] font-semibold text-slate-800 mb-0.5">{playerName}</div>
          )}
          {report.titulo && (
            <div className="font-semibold text-slate-700 text-sm mb-0.5 truncate">{report.titulo}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(report.fecha)}
            </span>
            {report.persona && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-semibold" title={authorName}>
                {report.persona}
                {authorName && authorName !== report.persona && (
                  <span className="font-sans font-normal ml-1 text-slate-500">· {authorName}</span>
                )}
              </span>
            )}
            {normConclusion(report.conclusion) && (
              <span className={`px-1.5 py-0.5 rounded font-medium text-[11px] ${CONCLUSION_STYLE[normConclusion(report.conclusion)!] ?? 'bg-slate-100 text-slate-600'}`}>
                {normConclusion(report.conclusion)}
              </span>
            )}
            {matchLabel && (
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-[11px] flex items-center gap-0.5">
                🏟 {matchLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onUpdate && (
            <button
              onClick={() => setEditing(true)}
              className="text-slate-300 hover:text-blue-500 p-2 sm:p-0.5 rounded"
              title="Editar informe"
              aria-label="Editar informe"
            >
              <Pencil className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            </button>
          )}
          {currentProfile.is_admin && (
            isConfirming ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(report.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded font-medium">Eliminar</button>
                <button onClick={() => onConfirmDelete(null)} className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600">No</button>
              </div>
            ) : (
              <button onClick={() => onConfirmDelete(report.id)} aria-label="Eliminar informe" className="text-slate-300 hover:text-red-500 p-2 sm:p-0.5 rounded">
                <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
            )
          )}
        </div>
      </div>
      {report.texto && (
        <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{report.texto}</p>
      )}
    </div>
  )
}

export function FichaCarcasa({ esPanel, onClose, children }: {
  esPanel: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (esPanel) {
    return <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">{children}</div>
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// Objeto estable para los partidos sin jugadores vinculados: si se creara uno
// nuevo en cada render, MatchRow se repintaría siempre aunque no cambie nada.
