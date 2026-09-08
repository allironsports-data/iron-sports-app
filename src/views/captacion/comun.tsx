import React, { useState } from 'react'
import { X, Trash2, Calendar, Pencil, MapPin } from 'lucide-react'
import { Button, IconButton, Input, Select, Textarea, Chip } from '../../components/ui'
import { L } from '../../lib/labels'
import type { ScoutingReport, ScoutingAssessment } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { type ShowToast, type ConclusionOption, ASSESSMENT_CONFIG, normConclusion, CONCLUSION_OPTIONS, CONCLUSION_STYLE, fmtDate, personaToName } from './helpers'

// ── Captación · componentes pequeños compartidos ──

// ── Sub-components ───────────────────────────────────────────

export function AssessmentChip({ a, small }: { a?: ScoutingAssessment; small?: boolean }) {
  if (!a) return <span className="text-slate-500 text-meta" aria-label={`Sin ${L.etiquetaJugador.toLowerCase()}`}>—</span>
  const cfg = ASSESSMENT_CONFIG[a]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-meta font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'text-badge px-1' : ''}`}>
      {cfg.label}
    </span>
  )
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-2">
      <div className="text-badge font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-secondary font-medium text-slate-700 mt-0.5 truncate">{value}</div>
    </div>
  )
}

// ── Chips de filtros activos ─────────────────────────────────
export type FilterChip = { key: string; label: string; onRemove: () => void }
export function ActiveFilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-badge font-semibold text-slate-500 uppercase tracking-wide">Filtros:</span>
      {chips.map(c => (
        <Chip key={c.key} active onRemove={c.onRemove}>{c.label}</Chip>
      ))}
      <Button size="sm" variant="link" onClick={onClearAll}>Limpiar filtros</Button>
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
      <form
        className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-secondary space-y-2"
        aria-label="Editar informe"
        onSubmit={e => { e.preventDefault(); void handleSaveEdit() }}
      >
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
          <span className="text-badge font-semibold text-blue-700 uppercase tracking-wide">Editando informe</span>
          <IconButton label="Cerrar edición" onClick={requestCloseEdit}><X /></IconButton>
        </div>
        <Input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder="Título (opcional)"
          aria-label="Título del informe"
        />
        <Textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={5}
          aria-label="Texto del informe"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void handleSaveEdit() } }}
        />
        <Select
          value={editConclusion}
          onChange={e => setEditConclusion(e.target.value as ConclusionOption)}
          aria-label={L.veredicto}
        >
          <option value="">Sin {L.veredicto.toLowerCase()}</option>
          {CONCLUSION_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        {!editText.trim() && (
          <p className="text-meta text-red-600" role="alert">El informe no puede estar vacío.</p>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={requestCloseEdit} className="flex-1">{L.cancelar}</Button>
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!editText.trim()} className="flex-1">
            {saving ? 'Guardando…' : L.guardar}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-secondary space-y-1.5">
      <ConfirmModal
        open={isConfirming}
        title="Eliminar informe"
        message={`Se eliminará este informe${playerName ? ` de ${playerName}` : ''}${authorName ? ` escrito por ${authorName}` : ''}. Esta acción no se puede deshacer.`}
        confirmLabel={L.eliminar}
        variant="danger"
        onConfirm={() => onDelete(report.id)}
        onCancel={() => onConfirmDelete(null)}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {playerName && (
            <div className="text-body font-semibold text-slate-800 mb-0.5">{playerName}</div>
          )}
          {report.titulo && (
            <div className="font-semibold text-slate-700 text-body mb-0.5 truncate">{report.titulo}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-badge text-slate-500">
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
              <span className={`px-1.5 py-0.5 rounded font-medium text-badge ${CONCLUSION_STYLE[normConclusion(report.conclusion)!] ?? 'bg-slate-100 text-slate-600'}`}>
                {normConclusion(report.conclusion)}
              </span>
            )}
            {matchLabel && (
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-badge flex items-center gap-1">
                <MapPin className="w-3 h-3" aria-hidden="true" /> {matchLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onUpdate && (
            <IconButton label="Editar informe" onClick={() => setEditing(true)} className="text-slate-600 hover:text-blue-600">
              <Pencil />
            </IconButton>
          )}
          {currentProfile.is_admin && (
            <IconButton label="Eliminar informe" onClick={() => onConfirmDelete(report.id)} className="text-slate-600 hover:text-red-600">
              <Trash2 />
            </IconButton>
          )}
        </div>
      </div>
      {report.texto && (
        <p className="text-body text-slate-700 leading-relaxed whitespace-pre-wrap">{report.texto}</p>
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
