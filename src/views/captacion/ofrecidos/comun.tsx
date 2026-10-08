import type { Profile } from '../../../contexts/AuthContext'
import type { TipoInformePedido, PasoVeredicto, OfrecimientoOrigen } from '../../../types'
import { TIPO_INFORME_LABEL, TIPOS_INFORME, VEREDICTO_LABEL, ORIGEN_LABEL, type EstadoVisible } from '../../../lib/ofrecidos'

// ── Piezas pequeñas de la pestaña Ofrecidos ─────────────────────────
// Solo componentes (Vite Fast Refresh); las constantes están en lib/ofrecidos.

const TIPO_CLS: Record<TipoInformePedido, string> = {
  tecnico:      'text-blue-700 border-blue-200 bg-blue-50',
  entorno:      'text-emerald-700 border-emerald-200 bg-emerald-50',
  mercado:      'text-orange-700 border-orange-200 bg-orange-50',
  personalidad: 'text-violet-700 border-violet-200 bg-violet-50',
}

const ESTADO_CLS: Record<EstadoVisible['clave'], string> = {
  nuevo:      'bg-slate-100 text-slate-600 border-slate-200',
  informes:   'bg-blue-50 text-blue-700 border-blue-200',
  decidir:    'bg-orange-50 text-orange-700 border-orange-200',
  aceptado:   'bg-green-50 text-green-700 border-green-200',
  descartado: 'bg-red-50 text-red-600 border-red-200',
  caducado:   'bg-amber-50 text-amber-700 border-amber-200',
}

const VEREDICTO_CLS: Record<PasoVeredicto, string> = {
  pendiente: 'bg-blue-50 text-blue-700 border-blue-200',
  ok:        'bg-green-50 text-green-700 border-green-200',
  no:        'bg-red-50 text-red-600 border-red-200',
  mas:       'bg-orange-50 text-orange-700 border-orange-200',
}

export function Avatar({ avatar, profiles, conNombre, primario, className = '' }: {
  avatar: string
  profiles: Profile[]
  conNombre?: boolean
  primario?: boolean
  className?: string
}) {
  const p = profiles.find(x => x.avatar === avatar)
  return (
    <span
      title={p?.name}
      className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md ${primario ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'} ${className}`}
    >
      {avatar}
      {conNombre && p && <span className="font-sans font-normal opacity-75">· {p.name.split(' ')[0]}</span>}
    </span>
  )
}

export function TipoChip({ tipo, small }: { tipo: TipoInformePedido; small?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${small ? 'text-[10px] px-1.5' : 'text-[11px] px-2 py-0.5'} ${TIPO_CLS[tipo]}`}>
      {TIPO_INFORME_LABEL[tipo].toLowerCase()}
    </span>
  )
}

export function EstadoChip({ e }: { e: EstadoVisible }) {
  return (
    <span className={`inline-flex items-center rounded-full border text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap ${ESTADO_CLS[e.clave]}`}>
      {e.label}
    </span>
  )
}

export function VeredictoChip({ v }: { v: PasoVeredicto }) {
  return (
    <span className={`inline-flex items-center rounded-full border text-[10.5px] font-semibold px-1.5 py-0.5 ${VEREDICTO_CLS[v]}`}>
      {v === 'ok' ? 'OK ✓' : v === 'no' ? 'No ✕' : VEREDICTO_LABEL[v]}
    </span>
  )
}

export function OrigenChip({ origen, nombre }: { origen: OfrecimientoOrigen; nombre?: string }) {
  if (origen === 'boulema') {
    return <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-[11px] font-semibold px-2 py-0.5">Boulema</span>
  }
  return (
    <span className="text-xs text-slate-600 truncate">
      <span className="text-slate-400">{ORIGEN_LABEL[origen]}</span>{nombre ? ` · ${nombre}` : ''}
    </span>
  )
}

/** Selector de personas (varias) a base de botones con iniciales */
export function PickPersonas({ profiles, value, onChange, soloUna }: {
  profiles: Profile[]
  value: string[]
  onChange: (v: string[]) => void
  soloUna?: boolean
}) {
  const toggle = (av: string) => {
    if (soloUna) return onChange(value.includes(av) ? [] : [av])
    onChange(value.includes(av) ? value.filter(a => a !== av) : [...value, av])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {profiles.filter(p => p.activo !== false && !p.partner_only).map(p => {
        const on = value.includes(p.avatar)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.avatar)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors ${
              on ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="font-mono font-bold text-[11px]">{p.avatar}</span>
            <span className="hidden sm:inline">{p.name.split(' ')[0]}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Selector de tipo de informe (uno o varios) */
export function PickTipos({ value, onChange, soloUno }: {
  value: TipoInformePedido[]
  onChange: (v: TipoInformePedido[]) => void
  soloUno?: boolean
}) {
  const toggle = (t: TipoInformePedido) => {
    if (soloUno) return onChange([t])
    onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIPOS_INFORME.map(t => {
        const on = value.includes(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${on ? TIPO_CLS[t] + ' ring-1 ring-current/20' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
            {TIPO_INFORME_LABEL[t]}
          </button>
        )
      })}
    </div>
  )
}

/** Carcasa de modal centrado, misma estética que el resto de Captación */
export function Modal({ titulo, icono, onClose, children, ancho = 'max-w-md' }: {
  titulo: string
  icono?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  ancho?: string
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">{icono}{titulo}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 -mr-1">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
