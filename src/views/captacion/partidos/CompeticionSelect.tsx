// ── Competición: desplegable con las predefinidas ───────────────────
//
// Antes era un texto libre con sugerencias, y acababan grabadas con
// erratas («Primera RFEFfsd»), que luego no agrupan en los filtros. Ahora
// se elige de la lista; «Otra…» abre un campo de texto para las que no
// están. Un valor guardado que no esté en la lista se enseña como «Otra»
// con su texto, para no perderlo.

import { useState } from 'react'
import { COMPETITION_OPTIONS } from '../helpers'

const OTRA = '__otra__'

export function CompeticionSelect({ value, onChange, className, placeholder, ariaLabel, onKeyDown }: {
  value: string
  onChange: (v: string) => void
  /** Clases del select y del campo de texto (las del formulario donde va) */
  className?: string
  placeholder?: string
  ariaLabel?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  const enLista = !value || (COMPETITION_OPTIONS as readonly string[]).includes(value)
  // «Otra» elegida a mano aunque el texto esté vacío (si no, el select volvería a «—»)
  const [otraElegida, setOtraElegida] = useState(!enLista)
  const otra = otraElegida || !enLista

  return (
    <div className="flex gap-1.5 min-w-0">
      <select
        value={otra ? OTRA : value}
        onChange={e => {
          if (e.target.value === OTRA) { setOtraElegida(true); if (enLista) onChange('') }
          else { setOtraElegida(false); onChange(e.target.value) }
        }}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel ?? 'Competición'}
        className={`${className ?? ''} ${otra ? 'w-28 flex-shrink-0' : 'flex-1'}`}
      >
        <option value="">{placeholder ?? '— Competición —'}</option>
        {COMPETITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        <option value={OTRA}>Otra…</option>
      </select>
      {otra && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nombre de la competición"
          aria-label="Otra competición"
          autoFocus={!value}
          className={`${className ?? ''} flex-1 min-w-0`}
        />
      )}
    </div>
  )
}
