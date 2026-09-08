import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button, Dialog } from '../../components/ui'

// ── Piezas compartidas entre las pestañas, paneles y modales de Distribución ──

/** Spinner pequeño para botones de guardado */
export function BtnSpinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" />
}

// Componentes definidos a nivel de módulo: dentro del render se recreaban en
// cada pasada y React desmontaba/montaba el DOM (pérdida de foco, parpadeos).

export function Avatar({ name, photo, size = 'sm' }: { name: string; photo?: string; size?: 'xs' | 'sm' | 'md' }) {
  // Mínimo w-6 con text-badge (11px): los avatares más pequeños no se leían.
  const cls = size === 'xs' ? 'w-6 h-6 text-badge' : size === 'sm' ? 'w-8 h-8 text-meta' : 'w-10 h-10 text-body'
  if (photo) return <img src={photo} alt="" className={`${cls} rounded-full object-cover flex-shrink-0`} />
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`${cls} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600 flex-shrink-0`}>
      {initials}
    </div>
  )
}

/** Hoja inferior reutilizable para filtros en móvil (Dialog en modo sheet). */
export function FilterSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      historyKey="dist-filtros"
      footer={<Button variant="primary" className="w-full" onClick={onClose}>Ver resultados</Button>}
    >
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </Dialog>
  )
}

// ── FILTER CHECKBOX (toggle aséptico, sin fondo de color) ─────

export function FilterCheck({ label, checked, onClick }: { label: React.ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className="flex items-center gap-1.5 px-3 min-h-9 sm:min-h-8 text-secondary font-medium rounded-lg border border-slate-300 bg-white hover:border-slate-400 transition-colors text-slate-600"
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
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 pl-3 pr-2 min-h-9 sm:min-h-8 text-secondary font-medium rounded-lg border transition-colors ${
          isActive
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
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
                <span className="text-body text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
