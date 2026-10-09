import { useState, useMemo, type KeyboardEvent } from 'react'
import { useEquipos } from '../hooks/useEquipos'
import type { OpcionEquipo } from '../lib/sugerirEquipos'
import { ZONAS, ZONA_CORTA, esZona, type Zona } from '../lib/zonas'
import { ComboCerrado, COMBO_INPUT_CLS, type AltaApi, type Opcion } from './ComboCerrado'

// ── Campo «Equipo» de lista cerrada ──────────────────────────────────
//
// Sobre ComboCerrado: las opciones son el catálogo más los equipos con
// jugadores o partidos (contexto de App), con categoría y zona al lado. Un
// equipo nuevo se da de alta desde el propio campo, y se exige categoría y
// zona: así no vuelven a nacer equipos duplicados por una grafía distinta,
// ni equipos sin clasificar que luego no salen en el control de cobertura.

export const EQUIPO_INPUT_CLS = COMBO_INPUT_CLS

interface Props {
  value: string
  /** `equipo` viene cuando se ha elegido uno conocido (para rellenar categoría, etc.) */
  onChange: (nombre: string, equipo?: OpcionEquipo) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  disabled?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onSalir?: () => void
  'aria-label'?: string
  id?: string
}

const SELECT = 'w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200'

export function EquipoInput({ placeholder = 'Escribe y elige un equipo', ...props }: Props) {
  const { opciones, categorias, zonaDeducida, crear } = useEquipos()
  const conDetalle = useMemo<Opcion[]>(() => opciones.map(o => ({
    ...o,
    detalle: [o.categoria, o.zona && (ZONA_CORTA[o.zona as Zona] ?? o.zona)].filter(Boolean).join(' · ') || undefined,
  })), [opciones])

  return (
    <ComboCerrado
      {...props}
      placeholder={placeholder}
      opciones={conDetalle}
      nuevo={{
        etiqueta: 'equipo nuevo',
        render: api => <AltaEquipo api={api} categorias={categorias} zonaDeducida={zonaDeducida} crear={crear} />,
      }}
    />
  )
}

/** Alta de equipo nuevo con lo mínimo exigido: categoría y zona */
function AltaEquipo({ api, categorias, zonaDeducida, crear }: {
  api: AltaApi
  categorias: string[]
  zonaDeducida: (nombre: string) => Zona | null
  crear: (e: { nombre: string; categoria: string; zona: Zona }) => Promise<void>
}) {
  const [categoria, setCategoria] = useState('')
  const [otra, setOtra] = useState(categorias.length === 0)
  const [zona, setZona] = useState<string>(() => zonaDeducida(api.nombre) ?? '')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crearYUsar() {
    if (creando) return
    const cat = categoria.trim()
    if (!cat) { setError('Falta la categoría'); return }
    if (!esZona(zona)) { setError('Falta la zona'); return }
    setCreando(true)
    try {
      await crear({ nombre: api.nombre, categoria: cat, zona })
      api.usar({ nombre: api.nombre, clave: '', categoria: cat, zona })
    } catch {
      setError('No se ha podido crear el equipo')
    } finally {
      setCreando(false)
    }
  }

  return (
    <>
      <p className="text-xs text-slate-600">
        Equipo nuevo: <span className="font-semibold text-slate-800">{api.nombre}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoría *</label>
          {otra ? (
            <input autoFocus value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Juveniles, Segunda RFEF…" className={SELECT} />
          ) : (
            <select
              autoFocus
              value={categoria}
              onChange={e => { const v = e.target.value; if (v === '__otra__') { setCategoria(''); setOtra(true) } else setCategoria(v) }}
              className={SELECT}
            >
              <option value="">— elige —</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__otra__">Otra…</option>
            </select>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zona *</label>
          <select value={zona} onChange={e => setZona(e.target.value)} className={SELECT}>
            <option value="">— elige —</option>
            {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={api.cancelar} className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">Volver</button>
        <button type="button" onClick={() => void crearYUsar()} disabled={creando} className="px-2.5 py-1.5 text-xs font-bold bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
          {creando ? 'Creando…' : 'Crear y usar'}
        </button>
      </div>
    </>
  )
}
