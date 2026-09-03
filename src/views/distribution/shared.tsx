import React, { useState } from 'react'
import { X, Check, ChevronDown } from 'lucide-react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// ── Piezas compartidas entre las pestañas, paneles y modales de Distribución ──

/** Spinner pequeño para botones de guardado */
export function BtnSpinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" />
}

// Componentes definidos a nivel de módulo: dentro del render se recreaban en
// cada pasada y React desmontaba/montaba el DOM (pérdida de foco, parpadeos).

export function Avatar({ name, photo, size = 'sm' }: { name: string; photo?: string; size?: 'xs' | 'sm' | 'md' }) {
  const cls = size === 'xs' ? 'w-6 h-6 text-[11px]' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (photo) return <img src={photo} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

/** Bottom-sheet reutilizable para filtros en móvil. */
export function FilterSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  useEscapeKey(onClose, open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto p-4 safe-area-bottom animate-in slide-in-from-bottom">
        <div className="sticky -top-4 -mx-4 px-4 pt-1 pb-3 bg-white flex items-center justify-between border-b border-slate-100 mb-3 z-10">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar filtros" className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {children}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Ver resultados
        </button>
      </div>
    </div>
  )
}

// ── FILTER CHECKBOX (toggle aséptico, sin fondo de color) ─────

export function FilterCheck({ label, checked, onClick }: { label: React.ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors text-slate-600"
    >
      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      {label}
    </button>
  )
}

// ── MULTI-SELECT DROPDOWN ─────────────────────────────────────

export function MultiSelect({ label, options, selected, onChange }: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const isActive = selected.length > 0

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val])
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm rounded-lg border transition-colors ${
          isActive
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <span>{label}{isActive ? ` (${selected.length})` : ''}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] max-w-[calc(100vw-2rem)] py-1 max-h-[50vh] overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
